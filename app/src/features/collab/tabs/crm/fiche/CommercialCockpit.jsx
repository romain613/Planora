// CommercialCockpit — V3.x.17.2 (2026-05-08)
// Tour de contrôle commerciale compacte mountée UNIQUEMENT en haut de l'onglet Info
// de la colonne droite Pipeline Live. Affiche en un coup d'œil l'état du lead :
// identity + status + activité récente + progression + action prioritaire + quick actions.
//
// PRINCIPES STRICTS V3.x.17.2 :
// - Frontend uniquement, zéro backend, zéro modif DB, zéro sync events
// - Read-only sur la prochaine action (pas de persist next_action_type comme FicheIntelligentBlock)
// - Aucune suppression de données existantes — c'est purement additif au-dessus du contenu Info
// - Toutes les sources de données viennent du context (déjà chargées par CollabPortal)
// - Retourne null si pas de contact sélectionné OU si onglet ≠ 'fiche' (cf mount conditionnel)
//
// Composition (6 zones compactes, hauteur cible ~140-160px) :
//   1. Identity      : nom + score badge + température
//   2. Status        : stage pipeline (read-only) + badge cross-collab + dernier contact
//   3. Prochain RDV  : 1 ligne compacte avec countdown OU CTA "Programmer"
//   4. Activité      : 1 ligne compacte (📞 dernier appel · 💬 dernier SMS)
//   5. Progression   : 1 ligne compacte (📝 Form %)
//   6. Action prio   : CTA dynamique (read-only, calculé contextuellement)
//   7. Quick actions : 5 boutons (📞 📅 💬 📝 🤝)
//
// Position : sticky top, z-index 5 pour rester visible pendant le scroll de l'onglet.
// La sélection contact est gérée par CollabPortal via `pipelineRightContact` (déjà via context).

import React from "react";
import { T } from "../../../../../theme";
import { I } from "../../../../../shared/ui";
import { useCollabContext } from "../../../context/CollabContext";

const CommercialCockpit = () => {
  const ctx = useCollabContext();
  const {
    pipelineRightContact, collab, collabs, bookings, voipCallLogs, appConversations,
    callFormResponses, calendars, PIPELINE_STAGES,
    cScoreColor, cScoreLabel, getCollabLeadScore, getLeadTemperature,
    _tempColor, _tempLabel, _tempEmoji,
    setPhoneScheduleForm, setPhoneShowScheduleModal,
    setPhoneRightTab, setV7TransferModal, setV7TransferTarget,
    startVoipCall,
  } = ctx || {};

  const ct = pipelineRightContact;
  if (!ct || !ct.id) return null;

  const todayS = new Date().toISOString().split("T")[0];

  // ── Sources data (read-only) ───────────────────────────────────────────────
  const score = typeof getCollabLeadScore === "function" ? getCollabLeadScore(ct) : 0;
  const tempInfo = typeof getLeadTemperature === "function" ? getLeadTemperature(ct) : { temp: "cold" };
  const temp = tempInfo?.temp || "cold";

  const stage = (PIPELINE_STAGES || []).find(s => s.id === (ct.pipeline_stage || "nouveau")) || (PIPELINE_STAGES || [])[0] || { color: "#64748B", label: "—" };

  // Cross-collab : owner + sharer name
  const _shared = Array.isArray(ct.shared_with) ? ct.shared_with : [];
  const _isOwner = ct.assignedTo === collab?.id;
  const _sharedHere = _shared.includes(collab?.id) && !_isOwner && ct.assignedTo;
  const _capN = (n) => { const s = String(n||"").trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; };
  const _ownerName = _isOwner ? null : _capN((collabs||[]).find(c => c.id === ct.assignedTo)?.name || "");
  const _firstSharerId = _shared.find(id => id && id !== ct.assignedTo);
  const _sharerName = _firstSharerId ? _capN((collabs||[]).find(c => c.id === _firstSharerId)?.name || "") : "";

  // Dernier contact
  const _lastActivityDate = ct.updatedAt || ct.lastVisit || ct.createdAt || null;
  const daysSinceContact = _lastActivityDate ? Math.max(0, Math.floor((Date.now() - new Date(_lastActivityDate).getTime()) / 86400000)) : null;

  // Prochain RDV
  const nextRdv = (bookings||[])
    .filter(b => b.contactId === ct.id && b.status === "confirmed" && (b.date||"") >= todayS && (b.collaboratorId === collab?.id || b.agendaOwnerId === collab?.id))
    .sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time))[0] || null;

  const _rdvCountdown = nextRdv ? (() => {
    const d = Math.round((new Date(nextRdv.date + "T" + (nextRdv.time||"00:00")).getTime() - Date.now()) / 60000);
    if (d < 0) return "Passé";
    if (d < 60) return "Dans " + d + "min";
    if (d < 1440) return "Dans " + Math.floor(d/60) + "h" + String(d%60).padStart(2,"0");
    return "Dans " + Math.floor(d/1440) + "j";
  })() : null;

  // Dernier appel
  const lastCall = (voipCallLogs||[])
    .filter(cl => cl.contactId === ct.id || (() => {
      const _ph = ((cl.direction === "outbound" ? cl.toNumber : cl.fromNumber) || "").replace(/[^\d]/g, "").slice(-9);
      const _cp = (ct.phone || ct.mobile || "").replace(/[^\d]/g, "").slice(-9);
      return _cp && _cp === _ph;
    })())
    .sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""))[0] || null;
  const _callAgo = lastCall?.createdAt ? (() => {
    const ms = Date.now() - new Date(lastCall.createdAt).getTime();
    if (ms < 0) return null;
    const m = Math.floor(ms/60000);
    if (m < 60) return "il y a " + m + "min";
    const h = Math.floor(m/60);
    if (h < 24) return "il y a " + h + "h";
    return "il y a " + Math.floor(h/24) + "j";
  })() : null;

  // Dernier SMS / conversation
  const lastSms = (appConversations||[])
    .filter(c => c.contactId === ct.id || (() => {
      const _ph = (c.clientPhone || "").replace(/[^\d]/g, "").slice(-9);
      const _cp = (ct.phone || ct.mobile || "").replace(/[^\d]/g, "").slice(-9);
      return _cp && _cp === _ph;
    })())
    .sort((a,b) => (b.lastMessageAt||b.updatedAt||"").localeCompare(a.lastMessageAt||a.updatedAt||""))[0] || null;
  const _smsAgo = lastSms ? (() => {
    const _t = lastSms.lastMessageAt || lastSms.updatedAt;
    if (!_t) return null;
    const ms = Date.now() - new Date(_t).getTime();
    if (ms < 0) return null;
    const m = Math.floor(ms/60000);
    if (m < 60) return "il y a " + m + "min";
    const h = Math.floor(m/60);
    if (h < 24) return "il y a " + h + "h";
    return "il y a " + Math.floor(h/24) + "j";
  })() : null;

  // Progression formulaire (1er form trouvé pour ce contact)
  const _formResp = (callFormResponses || []).find(r => r.contactId === ct.id && r.formId);
  let formPct = null;
  if (_formResp) {
    try {
      const data = typeof _formResp.data_json === "string" ? JSON.parse(_formResp.data_json || "{}") : (_formResp.data || {});
      const total = Object.keys(data).length;
      const filled = Object.values(data).filter(v => v !== null && v !== undefined && String(v).trim() !== "").length;
      if (total > 0) formPct = Math.round((filled / total) * 100);
    } catch {}
  }

  // ── Action prioritaire (read-only, calculée contextuellement) ──────────────
  let priorityAction = null;
  if (ct.pipeline_stage === "nrp" && ct.nrp_next_relance && ct.nrp_next_relance <= todayS) {
    priorityAction = { label: "Relancer maintenant", icon: "phone-outgoing", color: "#EF4444",
      action: () => { if (ct.phone && typeof startVoipCall === "function") startVoipCall(ct.phone, ct); else if (ct.phone) window.open("tel:"+ct.phone); } };
  } else if (ct.pipeline_stage === "rdv_programme" && nextRdv) {
    const diff = Math.round((new Date(nextRdv.date+"T"+(nextRdv.time||"00:00")).getTime() - Date.now()) / 60000);
    if (diff >= 0 && diff <= 120) {
      priorityAction = { label: "RDV " + (diff < 60 ? "dans " + diff + "min" : "dans " + Math.floor(diff/60) + "h" + String(diff%60).padStart(2,"0")),
        icon: "calendar-check", color: "#0EA5E9", action: () => setPhoneRightTab && setPhoneRightTab("flux") };
    }
  } else if (daysSinceContact != null && daysSinceContact >= 14) {
    priorityAction = { label: "Relancer (" + daysSinceContact + "j sans contact)", icon: "alert-triangle", color: "#F59E0B",
      action: () => { if (ct.phone && typeof startVoipCall === "function") startVoipCall(ct.phone, ct); else if (ct.phone) window.open("tel:"+ct.phone); } };
  } else if (ct.pipeline_stage === "nouveau") {
    priorityAction = { label: "Premier contact", icon: "phone", color: "#22C55E",
      action: () => { if (ct.phone && typeof startVoipCall === "function") startVoipCall(ct.phone, ct); else if (ct.phone) window.open("tel:"+ct.phone); } };
  } else if (ct.pipeline_stage === "qualifie" && !nextRdv) {
    priorityAction = { label: "Programmer un RDV", icon: "calendar-plus", color: "#8B5CF6",
      action: () => {
        if (typeof setPhoneScheduleForm === "function") {
          setPhoneScheduleForm({ contactId: ct.id, contactName: ct.name, number: ct.phone||"",
            date: new Date(Date.now()+86400000).toISOString().split("T")[0], time: "10:00", duration: 30, notes: "",
            calendarId: (calendars||[])[0]?.id || "", _bookingMode: true });
          if (typeof setPhoneShowScheduleModal === "function") setPhoneShowScheduleModal(true);
        }
      } };
  }

  // ── Quick actions ──────────────────────────────────────────────────────────
  const qa = [
    { id: "call", icon: "phone", color: "#22C55E", title: "Appeler",
      action: () => { if (ct.phone && typeof startVoipCall === "function") startVoipCall(ct.phone, ct); else if (ct.phone) window.open("tel:"+ct.phone); } },
    { id: "rdv", icon: "calendar-plus", color: "#8B5CF6", title: "Programmer RDV",
      action: () => {
        if (typeof setPhoneScheduleForm === "function") {
          setPhoneScheduleForm({ contactId: ct.id, contactName: ct.name, number: ct.phone||"",
            date: new Date(Date.now()+86400000).toISOString().split("T")[0], time: "10:00", duration: 30, notes: "",
            calendarId: (calendars||[])[0]?.id || "", _bookingMode: true });
          if (typeof setPhoneShowScheduleModal === "function") setPhoneShowScheduleModal(true);
        }
      } },
    { id: "sms", icon: "message-square", color: "#0EA5E9", title: "Envoyer SMS",
      action: () => setPhoneRightTab && setPhoneRightTab("sms") },
    { id: "note", icon: "edit-3", color: "#64748B", title: "Ajouter note",
      action: () => setPhoneRightTab && setPhoneRightTab("flux") },
    { id: "transfer", icon: "users", color: "#7C3AED", title: "Transférer",
      action: () => {
        if (typeof setV7TransferModal === "function") setV7TransferModal({ contact: ct, fromCockpit: true });
        if (typeof setV7TransferTarget === "function") setV7TransferTarget("");
      } },
  ];

  // ── Render compact (6 zones, sticky top dans l'onglet Info) ────────────────
  const _displayName = (ct.civility ? ct.civility + " " : "") + (ct.firstname || "") + " " + (ct.lastname || ct.name || "");
  const _name = (_displayName || "").trim() || ct.name || "Contact";

  return (
    <div style={{
      position: "sticky",
      top: 0,
      zIndex: 5,
      background: T.surface,
      borderBottom: `1px solid ${T.border}`,
      padding: "8px 10px 6px",
      marginBottom: 8,
      borderRadius: 0,
      display: "flex",
      flexDirection: "column",
      gap: 5,
    }}>
      {/* L1 — Identity + score + température */}
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
        <span style={{fontSize:13,fontWeight:800,color:T.text,maxWidth:"55%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={_name}>{_name}</span>
        {typeof cScoreColor === "function" && (
          <span style={{padding:"1px 6px",borderRadius:8,fontSize:9,fontWeight:700,background:cScoreColor(score)+"18",color:cScoreColor(score)}} title={"Score lead"}>{score} · {cScoreLabel ? cScoreLabel(score) : ""}</span>
        )}
        {typeof _tempColor === "function" && (
          <span style={{padding:"1px 6px",borderRadius:8,fontSize:9,fontWeight:700,background:_tempColor(temp)+"18",color:_tempColor(temp),display:"inline-flex",alignItems:"center",gap:2}} title="Température lead">
            {_tempEmoji ? _tempEmoji(temp) : ""} {_tempLabel ? _tempLabel(temp) : ""}
          </span>
        )}
      </div>

      {/* L2 — Stage + cross-collab + dernier contact */}
      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",fontSize:9}}>
        <span style={{padding:"1px 6px",borderRadius:8,fontWeight:700,background:(stage.color||"#64748B")+"18",color:stage.color||"#64748B"}}>{stage.label}</span>
        {_sharedHere && _ownerName && (
          <span style={{padding:"1px 6px",borderRadius:8,fontWeight:600,background:"#3B82F614",color:"#1E40AF",display:"inline-flex",alignItems:"center",gap:2}} title="Apporté par un autre collab">
            🤝 {_ownerName}
          </span>
        )}
        {!_sharedHere && _isOwner && _sharerName && (
          <span style={{padding:"1px 6px",borderRadius:8,fontWeight:600,background:"#F9731614",color:"#9A3412"}} title="Transmis par">
            🤝 {_sharerName}
          </span>
        )}
        {daysSinceContact != null && (
          <span style={{padding:"1px 6px",borderRadius:8,fontWeight:600,background:daysSinceContact>=30?"#EF444418":daysSinceContact>=14?"#F59E0B18":"#22C55E18",color:daysSinceContact>=30?"#EF4444":daysSinceContact>=14?"#F59E0B":"#22C55E"}} title="Dernier contact">
            {daysSinceContact === 0 ? "aujourd'hui" : "il y a " + daysSinceContact + "j"}
          </span>
        )}
      </div>

      {/* L3 — Prochain RDV (compact 1 ligne) OU CTA */}
      {nextRdv ? (
        <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 8px",borderRadius:8,background:"#0EA5E908",border:"1px solid #0EA5E925"}}>
          <I n="calendar" s={11} style={{color:"#0EA5E9"}}/>
          <span style={{fontSize:10,fontWeight:600,color:T.text,flex:1}}>
            {new Date(nextRdv.date).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})} {nextRdv.time}
          </span>
          <span style={{fontSize:9,fontWeight:700,color:"#0EA5E9"}}>{_rdvCountdown}</span>
        </div>
      ) : (
        <div onClick={qa[1].action} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 8px",borderRadius:8,background:"#8B5CF606",border:"1px dashed #8B5CF640",cursor:"pointer",fontSize:10,fontWeight:600,color:"#8B5CF6"}} title="Programmer un RDV">
          <I n="calendar-plus" s={11}/> Aucun RDV programmé · cliquer pour ajouter
        </div>
      )}

      {/* L4 — Dernière activité (appel + SMS) ─ compact 1 ligne, conditionnel */}
      {(_callAgo || _smsAgo) && (
        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:9,color:T.text3}}>
          {_callAgo && (
            <span style={{display:"inline-flex",alignItems:"center",gap:3}} title={"Dernier appel " + _callAgo}>
              <I n="phone" s={9} style={{color:T.text3}}/>{_callAgo}{lastCall?.duration ? " · " + Math.floor(lastCall.duration/60) + "min" : ""}
            </span>
          )}
          {_smsAgo && (
            <span style={{display:"inline-flex",alignItems:"center",gap:3}} title={"Dernier SMS " + _smsAgo}>
              <I n="message-square" s={9} style={{color:T.text3}}/>{_smsAgo}
            </span>
          )}
          {formPct != null && (
            <span style={{display:"inline-flex",alignItems:"center",gap:3,marginLeft:"auto"}} title="Progression formulaire">
              <I n="clipboard" s={9} style={{color:formPct>=80?"#22C55E":formPct>=50?"#F59E0B":"#EF4444"}}/>
              <span style={{fontWeight:700,color:formPct>=80?"#22C55E":formPct>=50?"#F59E0B":"#EF4444"}}>{formPct}%</span>
            </span>
          )}
        </div>
      )}
      {/* L4bis — Si aucune activité mais form % dispo, afficher seul */}
      {!_callAgo && !_smsAgo && formPct != null && (
        <div style={{display:"flex",alignItems:"center",gap:3,fontSize:9,color:T.text3}}>
          <I n="clipboard" s={9} style={{color:formPct>=80?"#22C55E":formPct>=50?"#F59E0B":"#EF4444"}}/>
          <span style={{fontWeight:700,color:formPct>=80?"#22C55E":formPct>=50?"#F59E0B":"#EF4444"}}>Formulaire {formPct}%</span>
        </div>
      )}

      {/* L5 — Action prioritaire (read-only, calculée) */}
      {priorityAction && (
        <div onClick={priorityAction.action} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",borderRadius:8,background:`linear-gradient(135deg,${priorityAction.color}10,${priorityAction.color}04)`,border:`1px solid ${priorityAction.color}35`,cursor:"pointer"}}>
          <I n={priorityAction.icon} s={12} style={{color:priorityAction.color}}/>
          <span style={{fontSize:10,fontWeight:700,color:priorityAction.color}}>⚡ {priorityAction.label}</span>
        </div>
      )}

      {/* L6 — Quick actions bar */}
      <div style={{display:"flex",alignItems:"center",gap:4,marginTop:1}}>
        {qa.map(a => (
          <div key={a.id} onClick={a.action} title={a.title} style={{
            flex:1,
            padding:"5px 0",
            borderRadius:6,
            background:a.color+"12",
            color:a.color,
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            gap:3,
            cursor:"pointer",
            fontSize:9,
            fontWeight:700,
            border:`1px solid ${a.color}25`,
            transition:"all .12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = a.color + "20"; }}
          onMouseLeave={e => { e.currentTarget.style.background = a.color + "12"; }}
          >
            <I n={a.icon} s={11}/>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommercialCockpit;
