// CommercialCockpit — V3.x.17.2-fix (2026-05-08)
// Tour de contrôle commerciale compacte mountée UNIQUEMENT en haut de l'onglet Info
// de la colonne droite Pipeline Live. Affiche en un coup d'œil l'état du lead
// SANS dupliquer les éléments déjà visibles dans le header de la colonne droite
// (nom contact + boutons Appeler/SMS/Pipeline/Transférer/RDV ligne ~1683-1687).
//
// PRINCIPES STRICTS V3.x.17.2-fix :
// - Frontend uniquement, zéro backend, zéro modif DB, zéro sync events
// - Action prioritaire calculée contextuellement (read-only, pas de persist)
// - SELECT pipeline stage MODIFIABLE (réutilise handlePipelineStageChange existant +
//   respecte permissions cross-collab : disabled pour shared_with non-owner non-admin)
// - Aucune duplication avec le header de la colonne droite (pas de nom, pas de boutons quick actions)
// - Toutes les sources de données viennent du context (déjà chargées par CollabPortal)
// - Retourne null si pas de contact sélectionné OU si onglet ≠ 'fiche' (cf mount conditionnel)
//
// 4 zones compactes (~80-100px) :
//   L1  Status        : score + température + dernier contact
//   L2  Stage select  : <select> modifiable du pipeline_stage (ou disabled lecture seule)
//                       + badge cross-collab (🤝 Apporté par/Transmis à)
//   L3  Prochain RDV  : 1 ligne avec countdown OU CTA Programmer
//   L4  Activité+Form : 1 ligne (📞 dernier appel · 💬 dernier SMS · 📋 form %)
//   L5  Action prio   : CTA dynamique (read-only, calculé contextuellement)
//
// Position : sticky top, z-index 5 pour rester visible pendant le scroll de l'onglet.

import React from "react";
import { T } from "../../../../../theme";
import { I } from "../../../../../shared/ui";
import { useCollabContext } from "../../../context/CollabContext";
// V3.x.17.2-fix-reporting-trafficlight — feu de signalisation reporting RDV V1.10.3
import { getReportingTrafficLight } from "../../../../../shared/utils/reportingStatus";

const CommercialCockpit = () => {
  const ctx = useCollabContext();
  const {
    pipelineRightContact, collab, collabs, bookings, voipCallLogs, appConversations,
    callFormResponses, calendars, PIPELINE_STAGES, orderedStages,
    cScoreColor, cScoreLabel, getCollabLeadScore, getLeadTemperature,
    _tempColor, _tempLabel, _tempEmoji,
    setPhoneScheduleForm, setPhoneShowScheduleModal,
    setPhoneRightTab, startVoipCall,
    handlePipelineStageChange, isAdminView, showNotif,
  } = ctx || {};

  const ct = pipelineRightContact;
  if (!ct || !ct.id) return null;

  const todayS = new Date().toISOString().split("T")[0];

  // ── Helpers permissions stage (lecture seule cross-collab non-admin) ────────
  const _isOwner = ct.assignedTo === collab?.id || !ct.assignedTo;
  const _isAdmin = collab?.role === "admin" || collab?.role === "supra" || isAdminView;
  const _canEditStage = _isOwner || _isAdmin;

  // ── Stages disponibles (ordered si pipeline templates V1.8.19, sinon défauts) ─
  const _stages = (orderedStages && orderedStages.length ? orderedStages : (PIPELINE_STAGES || []));

  // ── Sources data (read-only) ───────────────────────────────────────────────
  const score = typeof getCollabLeadScore === "function" ? getCollabLeadScore(ct) : 0;
  const tempInfo = typeof getLeadTemperature === "function" ? getLeadTemperature(ct) : { temp: "cold" };
  const temp = tempInfo?.temp || "cold";

  const stage = _stages.find(s => s.id === (ct.pipeline_stage || "nouveau")) || _stages[0] || { color: "#64748B", label: "—", id: "nouveau" };

  // Cross-collab : owner + sharer name
  const _shared = Array.isArray(ct.shared_with) ? ct.shared_with : [];
  const _ownerIsMe = ct.assignedTo === collab?.id;
  const _sharedHere = _shared.includes(collab?.id) && !_ownerIsMe && ct.assignedTo;
  const _capN = (n) => { const s = String(n||"").trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; };
  const _ownerName = !_ownerIsMe && ct.assignedTo ? _capN((collabs||[]).find(c => c.id === ct.assignedTo)?.name || "") : "";
  const _firstSharerId = _shared.find(id => id && id !== ct.assignedTo);
  const _sharerName = _firstSharerId ? _capN((collabs||[]).find(c => c.id === _firstSharerId)?.name || "") : "";

  // Dernier contact (delta jours)
  const _lastActivityDate = ct.updatedAt || ct.lastVisit || ct.createdAt || null;
  const daysSinceContact = _lastActivityDate ? Math.max(0, Math.floor((Date.now() - new Date(_lastActivityDate).getTime()) / 86400000)) : null;

  // Prochain RDV — V3.x.17.2-fix-rdv : filtre élargi pour supporter cross-collab
  // (RDV transmis = agendaOwner Julie alors que je suis Romain le sender)
  // + naming alternatif contact_id / startAt / start_time
  const _bookingDate = (b) => b.date || (b.startAt ? String(b.startAt).split("T")[0] : null) || (b.start_time ? String(b.start_time).split("T")[0] : null) || "";
  const _bookingTime = (b) => b.time || (b.startAt && String(b.startAt).slice(11,16)) || (b.start_time && String(b.start_time).slice(11,16)) || "";
  const _bookingContactId = (b) => b.contactId || b.contact_id || null;
  const nextRdv = (bookings||[])
    .filter(b => {
      if (_bookingContactId(b) !== ct.id) return false;
      const _st = b.status || "confirmed";
      if (_st === "cancelled" || _st === "rejected" || _st === "no-show") return false;
      const _d = _bookingDate(b);
      return _d && _d >= todayS;
    })
    .sort((a,b) => (_bookingDate(a) + _bookingTime(a)).localeCompare(_bookingDate(b) + _bookingTime(b)))[0] || null;

  // V3.x.17.2-fix-rdv-time : booking de référence élargi pour le bloc rdv_programme.
  // Priorité : nextRdv (futur, non-cancelled) → next_rdv_booking_id (match direct) → tout booking
  // du contact non-rejected. Permet d'afficher date+heure même si RDV passé/cancelled.
  const _refRdv = nextRdv || (() => {
    if (ct.next_rdv_booking_id) {
      const _bk = (bookings||[]).find(b => b.id === ct.next_rdv_booking_id);
      if (_bk) return _bk;
    }
    const _list = (bookings||[]).filter(b => _bookingContactId(b) === ct.id && (b.status || "confirmed") !== "rejected");
    if (_list.length === 0) return null;
    _list.sort((a,b) => (_bookingDate(b) + _bookingTime(b)).localeCompare(_bookingDate(a) + _bookingTime(a)));
    return _list[0];
  })();

  const _rdvCountdown = nextRdv ? (() => {
    const _d = _bookingDate(nextRdv);
    const _t = _bookingTime(nextRdv) || "00:00";
    const d = Math.round((new Date(_d + "T" + _t).getTime() - Date.now()) / 60000);
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
  const _formResp = (callFormResponses || []).find(r => r.contactId === ct.id && (r.formId || r.form_id));
  let formPct = null;
  if (_formResp) {
    try {
      const _raw = _formResp.data_json || _formResp.data;
      const data = typeof _raw === "string" ? JSON.parse(_raw || "{}") : (_raw || {});
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
    const diff = Math.round((new Date(_bookingDate(nextRdv) + "T" + (_bookingTime(nextRdv) || "00:00")).getTime() - Date.now()) / 60000);
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

  // ── Render compact (4-5 lignes max, sticky top dans l'onglet Info) ─────────
  const _onChangeStage = (e) => {
    const _new = e.target.value;
    if (!_new || _new === ct.pipeline_stage) return;
    if (typeof handlePipelineStageChange === "function") {
      handlePipelineStageChange(ct.id, _new);
    }
  };

  return (
    <div data-cockpit="info" style={{
      position: "sticky",
      top: 0,
      zIndex: 5,
      background: T.surface,
      borderBottom: `1px solid ${T.border}`,
      padding: "8px 10px 6px",
      marginBottom: 8,
      display: "flex",
      flexDirection: "column",
      gap: 5,
    }}>
      {/* L1 — Score + Température + Dernier contact (compact) */}
      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",fontSize:9}}>
        {typeof cScoreColor === "function" && (
          <span style={{padding:"1px 6px",borderRadius:8,fontWeight:700,background:cScoreColor(score)+"18",color:cScoreColor(score)}} title={"Score lead"}>{score} · {cScoreLabel ? cScoreLabel(score) : ""}</span>
        )}
        {typeof _tempColor === "function" && (
          <span style={{padding:"1px 6px",borderRadius:8,fontWeight:700,background:_tempColor(temp)+"18",color:_tempColor(temp),display:"inline-flex",alignItems:"center",gap:2}} title="Température lead">
            {_tempEmoji ? _tempEmoji(temp) : ""} {_tempLabel ? _tempLabel(temp) : ""}
          </span>
        )}
        {daysSinceContact != null && (
          <span style={{padding:"1px 6px",borderRadius:8,fontWeight:600,background:daysSinceContact>=30?"#EF444418":daysSinceContact>=14?"#F59E0B18":"#22C55E18",color:daysSinceContact>=30?"#EF4444":daysSinceContact>=14?"#F59E0B":"#22C55E"}} title="Dernier contact">
            {daysSinceContact === 0 ? "Aujourd'hui" : "il y a " + daysSinceContact + "j"}
          </span>
        )}
      </div>

      {/* L2 — Select pipeline stage MODIFIABLE + badge cross-collab */}
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <select
          value={ct.pipeline_stage || "nouveau"}
          disabled={!_canEditStage}
          onChange={_onChangeStage}
          title={_canEditStage ? "Changer le statut pipeline" : "Lecture seule (contact géré par " + (_ownerName || "un autre collab") + ")"}
          style={{
            flex: 1,
            padding: "5px 8px",
            borderRadius: 7,
            border: `1.5px solid ${stage.color || "#64748B"}45`,
            background: (stage.color || "#64748B") + "12",
            color: stage.color || T.text,
            fontSize: 11,
            fontWeight: 700,
            cursor: _canEditStage ? "pointer" : "not-allowed",
            opacity: _canEditStage ? 1 : 0.65,
            fontFamily: "inherit",
            outline: "none",
            minWidth: 0,
          }}
        >
          {_stages.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        {_sharedHere && _ownerName && (
          <span style={{padding:"3px 7px",borderRadius:7,fontSize:9,fontWeight:700,background:"#3B82F614",color:"#1E40AF",display:"inline-flex",alignItems:"center",gap:2,flexShrink:0}} title="Lecture seule — contact géré par cette personne">
            🤝 {_ownerName}
          </span>
        )}
        {!_sharedHere && _ownerIsMe && _sharerName && (
          <span style={{padding:"3px 7px",borderRadius:7,fontSize:9,fontWeight:700,background:"#F9731614",color:"#9A3412",display:"inline-flex",alignItems:"center",gap:2,flexShrink:0}} title="Transmis par">
            🤝 {_sharerName}
          </span>
        )}
        {/* V3.x.17.2-fix-reporting-trafficlight — feu reporting L2 (toujours visible si RDV transmis détecté) */}
        {(() => {
          const _shareBk = (bookings || []).find(b => (b.contactId === ct.id || b.contact_id === ct.id) && b.bookingType === "share_transfer" && b.status === "confirmed");
          const _light = getReportingTrafficLight(_shareBk);
          if (!_light) return null;
          return (
            <span title={_light.tooltip + (_light.note ? " — " + _light.note : "")} style={{fontSize:14,lineHeight:1,flexShrink:0,cursor:"help"}}>{_light.emoji}</span>
          );
        })()}
      </div>

      {/* L2bis — Contexte Pipeline (compact, conditionnel selon stage actuel)
          V3.x.17.2-fix-context : rendre visible immédiatement le "pourquoi ce contact est dans cette colonne".
          Réutilise les données déjà chargées (bookings, voipCallLogs, ct.nrp_followups_json, ct.notes, ct.contract_*). */}
      {(() => {
        const _stage = ct.pipeline_stage || "nouveau";
        const _fmtDate = (iso) => {
          if (!iso) return "";
          try {
            const d = new Date(iso);
            return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
          } catch { return ""; }
        };
        const _fmtDateTime = (iso) => {
          if (!iso) return "";
          try {
            const d = new Date(iso);
            return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
          } catch { return ""; }
        };

        // ── RDV programmé : date/heure + owner agenda + transmission éventuelle ──
        // V3.x.17.2-fix-rdv-time : utilise _refRdv (élargi via next_rdv_booking_id) pour
        // toujours récupérer date+heure depuis le booking, même si RDV passé/cancelled.
        if (_stage === "rdv_programme") {
          if (_refRdv) {
            const _ownerId = _refRdv.agendaOwnerId || _refRdv.collaboratorId;
            const _bookerId = _refRdv.bookedByCollaboratorId || _refRdv.bookingReportingSenderCollabId;
            const _isTransferRdv = _refRdv.bookingType === "share_transfer" || (_bookerId && _ownerId && _bookerId !== _ownerId) || !!_refRdv.bookingReportingReceiverCollabId;
            const _rdvOwnerName = _capN((collabs || []).find(c => c.id === _ownerId)?.name || "");
            const _bookerName = _bookerId ? _capN((collabs || []).find(c => c.id === _bookerId)?.name || "") : "";
            const _isMyRdv = _ownerId === collab?.id;
            const _rdvDate = _bookingDate(_refRdv);
            const _rdvTime = _bookingTime(_refRdv);
            const _rdvIsFuture = _rdvDate && _rdvDate >= todayS;
            const _rdvDateStr = (() => {
              try {
                const d = new Date(_rdvDate + "T" + (_rdvTime || "00:00"));
                return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) + (_rdvTime ? " · " + _rdvTime : "");
              } catch { return _rdvDate + (_rdvTime ? " · " + _rdvTime : ""); }
            })();
            return (
              <div style={{padding:"5px 8px",borderRadius:8,background:"#0EA5E906",border:_rdvIsFuture?"1px solid #0EA5E920":"1px dashed #0EA5E930",display:"flex",flexDirection:"column",gap:3}}>
                <div style={{fontSize:9,fontWeight:700,color:"#0EA5E9",letterSpacing:0.3,textTransform:"uppercase"}}>📅 RDV programmé{!_rdvIsFuture ? " (passé)" : ""}</div>
                <div style={{fontSize:11,fontWeight:700,color:T.text}}>{_rdvDateStr}</div>
                {_rdvOwnerName && (
                  <div style={{fontSize:10,color:T.text2,display:"flex",alignItems:"center",gap:3}}>
                    👤 Agenda : <b style={{color:T.text}}>{_isMyRdv ? "Moi (" + _rdvOwnerName + ")" : _rdvOwnerName}</b>
                  </div>
                )}
                {_isTransferRdv && _rdvOwnerName && (
                  <div style={{fontSize:10,color:"#9A3412",fontWeight:600,display:"flex",alignItems:"center",gap:3}}>
                    🤝 RDV {_isMyRdv ? ("reçu" + (_bookerName ? " de " + _bookerName : "")) : "transmis à " + _rdvOwnerName}
                  </div>
                )}
                {_sharedHere && _ownerName && !_isTransferRdv && (
                  <div style={{fontSize:10,color:"#1E40AF",fontWeight:600,display:"flex",alignItems:"center",gap:3}}>
                    🤝 Contact géré par <b>{_ownerName}</b>
                  </div>
                )}
                {_refRdv.notes && (
                  <div style={{fontSize:9,color:T.text3,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={_refRdv.notes}>“{_refRdv.notes}”</div>
                )}
                {/* V3.x.17.2-fix-reporting-trafficlight — feu de signalisation reporting */}
                {(() => {
                  const _light = getReportingTrafficLight(_refRdv);
                  if (!_light) return null;
                  return (
                    <div title={_light.tooltip} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 7px",borderRadius:7,background:_light.color+"14",border:"1px solid "+_light.color+"35",marginTop:2}}>
                      <span style={{fontSize:10,lineHeight:1}}>{_light.emoji}</span>
                      <span style={{fontSize:10,fontWeight:700,color:_light.color}}>{_light.label}</span>
                      {_light.note && (
                        <span style={{fontSize:9,color:T.text2,fontStyle:"italic",marginLeft:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={_light.note}>"{_light.note}"</span>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          }
          // Fallback ultime : stage=rdv_programme ET aucun booking trouvé (helper a tout tenté)
          return (
            <div style={{padding:"5px 8px",borderRadius:8,background:"#0EA5E906",border:"1px dashed #0EA5E930",display:"flex",flexDirection:"column",gap:3}}>
              <div style={{fontSize:9,fontWeight:700,color:"#0EA5E9",letterSpacing:0.3,textTransform:"uppercase"}}>📅 RDV programmé</div>
              {ct.next_rdv_date ? (
                <div style={{fontSize:11,fontWeight:700,color:T.text}}>Date prévue : {_fmtDate(ct.next_rdv_date)}</div>
              ) : (
                <div style={{fontSize:10,color:T.text3,fontStyle:"italic"}}>Booking introuvable — vérifiez l'agenda</div>
              )}
              {_sharedHere && _ownerName && (
                <div style={{fontSize:10,color:"#1E40AF",fontWeight:600,display:"flex",alignItems:"center",gap:3}}>
                  🤝 Contact géré par <b>{_ownerName}</b>
                </div>
              )}
            </div>
          );
        }

        // ── NRP : dernière tentative sans réponse ──
        if (_stage === "nrp") {
          // Priorité 1 : nrp_followups_json (entry done=true la plus récente)
          let _nrpDate = null;
          let _nrpNote = "";
          let _nrpCount = 0;
          try {
            const _fups = JSON.parse(ct.nrp_followups_json || "[]");
            const _done = _fups.filter(f => f.done);
            _nrpCount = _done.length;
            const _last = _done.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
            if (_last) { _nrpDate = _last.date; _nrpNote = _last.note || ""; }
          } catch {}
          // Priorité 2 : dernier appel sans réponse depuis voipCallLogs
          if (!_nrpDate) {
            const _missed = (voipCallLogs || [])
              .filter(cl => (cl.contactId === ct.id || (() => {
                const _ph = ((cl.direction === "outbound" ? cl.toNumber : cl.fromNumber) || "").replace(/[^\d]/g, "").slice(-9);
                const _cp = (ct.phone || ct.mobile || "").replace(/[^\d]/g, "").slice(-9);
                return _cp && _cp === _ph;
              })()) && (cl.status === "no-answer" || cl.status === "missed" || (cl.duration || 0) < 10))
              .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0];
            if (_missed) _nrpDate = _missed.createdAt;
          }
          const _nextRelance = ct.nrp_next_relance;
          return (
            <div style={{padding:"5px 8px",borderRadius:8,background:"#EF444406",border:"1px solid #EF444420",display:"flex",flexDirection:"column",gap:3}}>
              <div style={{fontSize:9,fontWeight:700,color:"#EF4444",letterSpacing:0.3,textTransform:"uppercase",display:"flex",alignItems:"center",gap:4}}>📞 NRP {_nrpCount > 0 ? "× " + _nrpCount : ""}</div>
              {_nrpDate ? (
                <div style={{fontSize:11,fontWeight:700,color:T.text}}>Dernier appel sans réponse : {_fmtDateTime(_nrpDate)}</div>
              ) : (
                <div style={{fontSize:11,color:T.text3,fontStyle:"italic"}}>Pas de tentative enregistrée</div>
              )}
              {_nrpNote && (
                <div style={{fontSize:9,color:T.text3,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={_nrpNote}>“{_nrpNote}”</div>
              )}
              {_nextRelance && (
                <div style={{fontSize:9,color:"#F59E0B",fontWeight:600}}>⏰ Prochaine relance : {_fmtDate(_nextRelance)}</div>
              )}
            </div>
          );
        }

        // ── Perdu : date passage + motif (extrait depuis ct.notes) ──
        if (_stage === "perdu") {
          // Extraction du motif depuis notes : pattern "DD MMM [Perdu] : motif"
          let _lostReason = "";
          let _lostDate = null;
          if (ct.notes) {
            const _m = ct.notes.match(/\[Perdu\][^:]*:\s*(.+?)(?:\n|$)/i);
            if (_m) _lostReason = _m[1].trim();
          }
          // Priorité date passage : ct.updatedAt si stage = perdu (proxy le plus récent)
          if (ct.updatedAt) _lostDate = ct.updatedAt;
          else if (ct.lastVisit) _lostDate = ct.lastVisit;
          return (
            <div style={{padding:"5px 8px",borderRadius:8,background:"#64748B08",border:"1px solid #64748B25",display:"flex",flexDirection:"column",gap:3}}>
              <div style={{fontSize:9,fontWeight:700,color:"#64748B",letterSpacing:0.3,textTransform:"uppercase"}}>❌ Perdu</div>
              {_lostDate && (
                <div style={{fontSize:11,fontWeight:700,color:T.text}}>Statut passé le {_fmtDate(_lostDate)}</div>
              )}
              {_lostReason ? (
                <div style={{fontSize:10,color:T.text2,fontStyle:"italic"}}>Raison : {_lostReason}</div>
              ) : (
                <div style={{fontSize:9,color:T.text3,fontStyle:"italic"}}>Aucun motif renseigné</div>
              )}
            </div>
          );
        }

        // ── Client validé : contrat ──
        if (_stage === "client_valide") {
          const _contractDate = ct.contract_date || ct.updatedAt;
          const _amt = ct.contract_amount > 0 ? Number(ct.contract_amount).toLocaleString("fr-FR") + " €" : "";
          return (
            <div style={{padding:"5px 8px",borderRadius:8,background:"#22C55E08",border:"1px solid #22C55E25",display:"flex",flexDirection:"column",gap:3}}>
              <div style={{fontSize:9,fontWeight:700,color:"#22C55E",letterSpacing:0.3,textTransform:"uppercase"}}>✅ Client validé</div>
              {_contractDate && (
                <div style={{fontSize:11,fontWeight:700,color:T.text}}>Signé le {_fmtDate(_contractDate)}{_amt ? " · " + _amt : ""}</div>
              )}
              {ct.contract_number && (
                <div style={{fontSize:9,color:T.text3}}>Dossier : {ct.contract_number}</div>
              )}
            </div>
          );
        }

        // ── Autre stage (nouveau / contacte / qualifie / custom) : résumé court ──
        const _lastChange = ct.updatedAt || ct.lastVisit || ct.createdAt;
        return (
          <div style={{padding:"5px 8px",borderRadius:8,background:(stage.color || "#64748B") + "06",border:"1px solid " + (stage.color || "#64748B") + "20",display:"flex",flexDirection:"column",gap:3}}>
            <div style={{fontSize:9,fontWeight:700,color:stage.color || "#64748B",letterSpacing:0.3,textTransform:"uppercase"}}>📌 {stage.label}</div>
            {_lastChange && (
              <div style={{fontSize:10,color:T.text2}}>
                {ct.updatedAt && ct.updatedAt === _lastChange ? "Dernière modification : " : "Dernière activité : "}{_fmtDateTime(_lastChange)}
              </div>
            )}
            {_sharedHere && _ownerName && (
              <div style={{fontSize:10,color:"#1E40AF",fontWeight:600,display:"flex",alignItems:"center",gap:3}}>
                🤝 Contact géré par <b>{_ownerName}</b>
              </div>
            )}
          </div>
        );
      })()}

      {/* L3 — Prochain RDV (compact 1 ligne) OU CTA Programmer */}
      {nextRdv ? (
        <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 8px",borderRadius:8,background:"#0EA5E908",border:"1px solid #0EA5E925"}}>
          <I n="calendar" s={11} style={{color:"#0EA5E9"}}/>
          <span style={{fontSize:10,fontWeight:600,color:T.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {(() => { try { return new Date(_bookingDate(nextRdv)).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}); } catch { return _bookingDate(nextRdv); } })()} {_bookingTime(nextRdv)}
          </span>
          <span style={{fontSize:9,fontWeight:700,color:"#0EA5E9",flexShrink:0}}>{_rdvCountdown}</span>
        </div>
      ) : (
        <div onClick={() => {
          if (typeof setPhoneScheduleForm === "function") {
            setPhoneScheduleForm({ contactId: ct.id, contactName: ct.name, number: ct.phone||"",
              date: new Date(Date.now()+86400000).toISOString().split("T")[0], time: "10:00", duration: 30, notes: "",
              calendarId: (calendars||[])[0]?.id || "", _bookingMode: true });
            if (typeof setPhoneShowScheduleModal === "function") setPhoneShowScheduleModal(true);
          }
        }} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 8px",borderRadius:8,background:"#8B5CF606",border:"1px dashed #8B5CF640",cursor:"pointer",fontSize:10,fontWeight:600,color:"#8B5CF6"}} title="Programmer un RDV">
          <I n="calendar-plus" s={11}/> Aucun RDV programmé · cliquer pour ajouter
        </div>
      )}

      {/* L4 — Dernière activité (appel + SMS + form %) ─ compact 1 ligne */}
      {(_callAgo || _smsAgo || formPct != null) && (
        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:9,color:T.text3,flexWrap:"wrap"}}>
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
              <span style={{fontWeight:700,color:formPct>=80?"#22C55E":formPct>=50?"#F59E0B":"#EF4444"}}>Form {formPct}%</span>
            </span>
          )}
        </div>
      )}

      {/* L5 — Action prioritaire (read-only, calculée) */}
      {priorityAction && (
        <div onClick={priorityAction.action} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",borderRadius:8,background:`linear-gradient(135deg,${priorityAction.color}10,${priorityAction.color}04)`,border:`1px solid ${priorityAction.color}35`,cursor:"pointer"}} title="Action prioritaire">
          <I n={priorityAction.icon} s={12} style={{color:priorityAction.color}}/>
          <span style={{fontSize:10,fontWeight:700,color:priorityAction.color}}>⚡ {priorityAction.label}</span>
        </div>
      )}
    </div>
  );
};

export default CommercialCockpit;
