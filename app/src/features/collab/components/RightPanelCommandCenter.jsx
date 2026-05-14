// RightPanelCommandCenter.jsx — V1.10.4-r11.0.23 Live Feed
//
// Cockpit commercial vivant — flux temps reel quand aucun contact n'est selectionne.
// Remplace l'ancien empty state "actions recommandees classiques" (r11.0.21) par un
// flux compose de 6 blocs ouverts par defaut, type Notion/Linear command center.
//
// Ordre :
// 1. Jauge energie du jour (score 0-10 colorise selon dynamique)
// 2. Notifications LIVE (top 5 notifList contextuelles)
// 3. Flux SMS (3 dernieres conversations)
// 4. Dernieres pastilles touchees (r11.0.16 contactHistoryBack max 3)
// 5. Prochains RDV (3 prochains bookings confirmes)
// 6. RDV passes a statuer (conditional : si count > 0)
//
// Chaque element cliquable. Pas de cascade emails/SMS depuis ce composant.

import React, { useMemo } from "react";
import { T } from "../../../theme";
import { I } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";
import { _T } from "../../../shared/state/tabState";
import { api } from "../../../shared/services/api";

const RightPanelCommandCenter = () => {
  const ctx = useCollabContext() || {};
  const {
    contacts,
    bookings,
    voipCallLogs,
    appConversations,
    notifList,
    setNotifList,
    setNotifUnread,
    collab,
    pipelineStages, // V1.10.4-r11.0.23.b — custom stages lookup pour label/color
    setPipelineRightContact,
    setSelectedCrmContact,
    setSelectedBooking,
    setPhoneRightTab,
    setPhoneSubTab,
    setPortalTab,
    showNotif,
  } = ctx;

  // ── Computed data (memoized) ──
  const data = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const nowMs = Date.now();
    const all = Array.isArray(contacts) ? contacts : [];
    const bks = Array.isArray(bookings) ? bookings : [];
    const cls = Array.isArray(voipCallLogs) ? voipCallLogs : [];
    const convs = Array.isArray(appConversations) ? appConversations : [];
    const mine = all.filter((c) => c && c.assignedTo === collab?.id);
    const myIds = new Set(mine.map((c) => c.id));

    // 1. Jauge energie du jour
    const todayCalls = cls.filter((c) => (c.createdAt || "").startsWith(today)).length;
    const todayBkCreated = bks.filter((b) => b.contactId && myIds.has(b.contactId) && (b.createdAt || "").startsWith(today) && b.status !== "cancelled").length;
    const todayContracts = mine.filter((c) => c.contract_signed === 1 && (c.contract_date || "").startsWith(today)).length;
    const todayLost = mine.filter((c) => c.pipeline_stage === "perdu" && (c.updatedAt || "").startsWith(today)).length;
    const todayCancelled = bks.filter((b) => b.contactId && myIds.has(b.contactId) && b.status === "cancelled" && (b.updatedAt || "").startsWith(today)).length;
    const todaySmsOut = convs.filter((c) => c.lastEventType === "sms_out" && (c.lastActivityAt || "").startsWith(today)).length;

    let energy = 0;
    energy += todayCalls * 0.2;
    energy += todaySmsOut * 0.2;
    energy += todayBkCreated * 1;
    energy += todayContracts * 2;
    energy -= todayLost * 1;
    energy -= todayCancelled * 1;
    const energyScore = Math.max(0, Math.min(10, energy));
    const energyPct = Math.round(energyScore * 10);
    const energyColor =
      energyScore >= 5 ? "#22C55E" : energyScore >= 2 ? "#0EA5E9" : energyScore <= 0 ? "#EF4444" : "#F59E0B";
    const energyLabel =
      energyScore >= 5 ? "Dynamique" : energyScore >= 2 ? "Productif" : energyScore <= 0 ? "Faible" : "Neutre";

    // 2. Notifications LIVE (top 5 from context notifList)
    const notifs = (notifList || []).slice(0, 5);

    // 3. SMS flux (3 most recent conversations)
    const smsFlux = convs
      .filter((c) => (c.lastEventType || "").includes("sms"))
      .sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""))
      .slice(0, 3);

    // 4. Dernieres pastilles touchees (r11.0.16 contactHistoryBack)
    const hist = (_T.contactHistoryBack || []).slice(-3).reverse();
    const recentBack = hist
      .map((h) => {
        if (!h || !h.id) return null;
        const ct = all.find((c) => c.id === h.id);
        if (ct) return ct;
        // Fallback minimal contact si pas trouve dans contacts (deja archive ou autre)
        return h.payload ? { id: h.id, name: h.payload.name || h.payload.visitorName || "Contact", pipeline_stage: h.payload.pipeline_stage || "nouveau" } : null;
      })
      .filter(Boolean);

    // 5. Prochains RDV (futurs confirmed)
    const nextBookings = bks
      .filter((b) => b && b.contactId && myIds.has(b.contactId) && b.status === "confirmed")
      .filter((b) => {
        const t = new Date((b.date || "") + (b.time ? "T" + b.time : "T00:00")).getTime();
        return !isNaN(t) && t > nowMs;
      })
      .sort((a, z) => (a.date + (a.time || "")).localeCompare(z.date + (z.time || "")))
      .slice(0, 3);

    // 6. RDV passes a statuer (date+time < now, status='confirmed', contact still rdv_programme)
    const pastUnstatus = bks
      .filter((b) => b && b.contactId && myIds.has(b.contactId) && b.status === "confirmed")
      .filter((b) => {
        const t = new Date((b.date || "") + (b.time ? "T" + b.time : "T23:59")).getTime();
        if (isNaN(t) || t >= nowMs) return false;
        const ct = all.find((c) => c.id === b.contactId);
        return ct && ct.pipeline_stage === "rdv_programme";
      })
      .sort((a, z) => (z.date + (z.time || "")).localeCompare(a.date + (a.time || "")))
      .slice(0, 5);

    return { energyScore, energyPct, energyColor, energyLabel, todayCalls, todayBkCreated, todayContracts, todaySmsOut, notifs, smsFlux, recentBack, nextBookings, pastUnstatus };
  }, [contacts, bookings, voipCallLogs, appConversations, notifList, collab?.id]);

  // ── Actions helpers ──
  const openContact = (ct) => {
    if (!ct) return;
    if (typeof setPipelineRightContact === "function") setPipelineRightContact(ct);
    if (typeof setPhoneRightTab === "function") setPhoneRightTab("fiche");
  };

  const openSms = () => {
    if (typeof setPortalTab === "function") setPortalTab("phone");
    if (typeof setPhoneSubTab === "function") setPhoneSubTab("sms");
  };

  const openAgenda = () => {
    if (typeof setPortalTab === "function") setPortalTab("agenda");
  };

  const openBookingModal = (bk) => {
    if (!bk) return;
    if (typeof setSelectedBooking === "function") setSelectedBooking(bk);
  };

  const handleNotifClick = (n) => {
    if (!n) return;
    if (n.contactId) {
      const ct = (contacts || []).find((c) => c.id === n.contactId);
      if (ct) {
        if (typeof setSelectedCrmContact === "function") setSelectedCrmContact(ct);
        if (typeof setPortalTab === "function") setPortalTab("crm");
      }
    } else if (n.type === "leads_batch" || n.type === "lead_assigned") {
      if (typeof setPortalTab === "function") setPortalTab("crm");
    }
    // Mark as read
    try {
      api("/api/notifications/read", { method: "POST", body: { ids: [n.id] } }).then(() => {
        if (typeof setNotifList === "function") setNotifList((p) => (p || []).filter((x) => x.id !== n.id));
        if (typeof setNotifUnread === "function") setNotifUnread((p) => Math.max(0, (p || 0) - 1));
      });
    } catch {}
  };

  // ── Helpers UI ──
  const fmtTime = (iso) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      const dStr = d.toISOString().split("T")[0];
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      if (dStr === today) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      if (dStr === yesterday) return "Hier";
      return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
    } catch {
      return "";
    }
  };

  const fmtBkTime = (b) => {
    if (!b) return "";
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    if (b.date === today) return b.time || "";
    if (b.date === tomorrow) return "Demain " + (b.time || "");
    try {
      return new Date(b.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " " + (b.time || "");
    } catch {
      return (b.date || "") + " " + (b.time || "");
    }
  };

  // V1.10.4-r11.0.23.b — resolve stage label/color : defaults d'abord, puis pipelineStages
  // custom (clé technique ps_xxx ne doit jamais s'afficher brut). Fallback "Étape personnalisée".
  const stageColor = (stageId) => {
    const map = {
      nouveau: "#3B82F6",
      contacte: "#F59E0B",
      qualifie: "#7C3AED",
      rdv_programme: "#0EA5E9",
      nrp: "#EF4444",
      client_valide: "#22C55E",
      perdu: "#6B7280",
    };
    if (map[stageId]) return map[stageId];
    const custom = (pipelineStages || []).find((s) => s && s.id === stageId);
    return (custom && custom.color) || "#6B7280";
  };

  const stageLabel = (stageId) => {
    const map = {
      nouveau: "Nouveau",
      contacte: "En discussion",
      qualifie: "Intéressé",
      rdv_programme: "RDV programmé",
      nrp: "NRP",
      client_valide: "Validé",
      perdu: "Perdu",
    };
    if (map[stageId]) return map[stageId];
    const custom = (pipelineStages || []).find((s) => s && s.id === stageId);
    if (custom && (custom.label || custom.name)) return custom.label || custom.name;
    // Si clé technique custom non resolue (stage supprime, sync en cours) -> label propre
    if (typeof stageId === "string" && stageId.startsWith("ps_")) return "Étape personnalisée";
    return stageId || "—";
  };

  const sectionStyle = {
    padding: 10,
    marginBottom: 8,
    borderRadius: 10,
    background: T.surface,
    border: `1px solid ${T.border}`,
  };

  const sectionTitleStyle = {
    fontSize: 9,
    fontWeight: 700,
    color: T.text3,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 5,
  };

  // ── Render ──
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "10px 10px", display: "flex", flexDirection: "column" }}>

      {/* 1. Jauge energie du jour */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          <span>⚡ Énergie commerciale</span>
          <span style={{ marginLeft: "auto", color: data.energyColor, fontWeight: 800, fontSize: 11 }}>{data.energyLabel}</span>
        </div>
        <div style={{ position: "relative", height: 8, background: T.bg, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${data.energyPct}%`,
              background: `linear-gradient(90deg, ${data.energyColor}88, ${data.energyColor})`,
              borderRadius: 4,
              transition: "width .5s ease",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, fontSize: 9, color: T.text3, flexWrap: "wrap" }}>
          {data.todayCalls > 0 && <span><strong style={{ color: T.text2 }}>{data.todayCalls}</strong> appels</span>}
          {data.todaySmsOut > 0 && <span><strong style={{ color: T.text2 }}>{data.todaySmsOut}</strong> SMS</span>}
          {data.todayBkCreated > 0 && <span><strong style={{ color: T.text2 }}>{data.todayBkCreated}</strong> RDV</span>}
          {data.todayContracts > 0 && <span><strong style={{ color: "#22C55E" }}>{data.todayContracts}</strong> contrats ✓</span>}
          {data.todayCalls + data.todaySmsOut + data.todayBkCreated + data.todayContracts === 0 && <span style={{ fontStyle: "italic" }}>Démarre la journée 🚀</span>}
        </div>
      </div>

      {/* 2. Notifications LIVE */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>🔔 Notifications live</div>
        {data.notifs.length === 0 ? (
          <div style={{ fontSize: 10, color: T.text3, padding: "6px 4px", fontStyle: "italic" }}>
            Aucune notification récente.
          </div>
        ) : (
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {data.notifs.map((n) => {
              const colors = {
                leads_batch: "#22C55E",
                lead_assigned: "#22C55E",
                leads_imported: "#3B82F6",
                leads_reassigned: "#F59E0B",
                lead_priority: "#8B5CF6",
                call_answered: "#22C55E",
                call_missed: "#EF4444",
                sms_inbound: "#0EA5E9",
                client_message: "#2563EB",
              };
              const icons = {
                leads_batch: "flame",
                lead_assigned: "target",
                leads_imported: "inbox",
                leads_reassigned: "refresh-cw",
                lead_priority: "zap",
                call_answered: "phone",
                call_missed: "phone-missed",
                sms_inbound: "message-square",
                client_message: "message-circle",
              };
              const c = colors[n.type] || "#64748B";
              const ic = icons[n.type] || "bell";
              return (
                <div
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  style={{
                    display: "flex",
                    gap: 7,
                    padding: 6,
                    borderRadius: 7,
                    cursor: "pointer",
                    marginBottom: 3,
                    transition: "background .12s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = T.bg)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: c + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <I n={ic} s={11} style={{ color: c }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {n.title || "Notification"}
                    </div>
                    {n.detail && <div style={{ fontSize: 9, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.detail}</div>}
                    <div style={{ fontSize: 8, color: T.text3, marginTop: 1 }}>{fmtTime(n.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Flux SMS par 3 */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          💬 Flux SMS
          <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 600, color: T.accent, cursor: "pointer" }} onClick={openSms}>Tout voir →</span>
        </div>
        {data.smsFlux.length === 0 ? (
          <div style={{ fontSize: 10, color: T.text3, padding: "6px 4px", fontStyle: "italic" }}>
            Aucun message récent.
          </div>
        ) : (
          data.smsFlux.map((conv) => {
            const inbound = conv.lastEventType === "sms_in";
            return (
              <div
                key={conv.id}
                onClick={openSms}
                style={{
                  display: "flex",
                  gap: 7,
                  padding: 6,
                  borderRadius: 7,
                  cursor: "pointer",
                  marginBottom: 3,
                  background: conv.unreadCount > 0 ? "#0EA5E908" : "transparent",
                  border: `1px solid ${conv.unreadCount > 0 ? "#0EA5E920" : "transparent"}`,
                  transition: "all .12s",
                }}
                onMouseEnter={(e) => { if (!conv.unreadCount) e.currentTarget.style.background = T.bg; }}
                onMouseLeave={(e) => { if (!conv.unreadCount) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ width: 22, height: 22, borderRadius: 6, background: inbound ? "#0EA5E918" : "#22C55E18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <I n={inbound ? "arrow-down-left" : "arrow-up-right"} s={11} style={{ color: inbound ? "#0EA5E9" : "#22C55E" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {conv.contactName || conv.clientPhone || "—"}
                    </div>
                    {conv.unreadCount > 0 && <span style={{ fontSize: 8, fontWeight: 800, color: "#fff", background: "#0EA5E9", borderRadius: 6, padding: "1px 5px" }}>{conv.unreadCount}</span>}
                  </div>
                  <div style={{ fontSize: 9, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {conv.lastEventPreview || ""}
                  </div>
                  <div style={{ fontSize: 8, color: T.text3, marginTop: 1 }}>{fmtTime(conv.lastActivityAt)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Dernieres pastilles touchees */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>📍 Derniers contacts ouverts</div>
        {data.recentBack.length === 0 ? (
          <div style={{ fontSize: 10, color: T.text3, padding: "6px 4px", fontStyle: "italic" }}>
            Ouvre un contact pour le voir apparaître ici.
          </div>
        ) : (
          data.recentBack.map((c) => {
            const sc = stageColor(c.pipeline_stage);
            return (
              <div
                key={c.id}
                onClick={() => openContact(c)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: 6,
                  borderRadius: 7,
                  cursor: "pointer",
                  marginBottom: 3,
                  background: T.bg,
                  borderLeft: `3px solid ${sc}`,
                  transition: "all .12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = sc + "08"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.bg; }}
              >
                <div style={{ width: 22, height: 22, borderRadius: 6, background: sc + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, fontWeight: 800, color: sc }}>
                  {(c.name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 9, color: sc, fontWeight: 600 }}>{stageLabel(c.pipeline_stage)}</div>
                </div>
                {c.rating > 0 && <span style={{ fontSize: 9, color: "#F59E0B" }}>{"★".repeat(Math.min(5, c.rating))}</span>}
              </div>
            );
          })
        )}
      </div>

      {/* 5. Prochains RDV */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          📅 Prochains RDV
          <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 600, color: T.accent, cursor: "pointer" }} onClick={openAgenda}>Agenda →</span>
        </div>
        {data.nextBookings.length === 0 ? (
          <div style={{ fontSize: 10, color: T.text3, padding: "6px 4px", fontStyle: "italic" }}>
            Aucun RDV à venir.
          </div>
        ) : (
          data.nextBookings.map((b) => {
            const ct = (contacts || []).find((c) => c.id === b.contactId);
            const name = ct?.name || b.visitorName || b.contactName || "RDV";
            return (
              <div
                key={b.id}
                onClick={() => openBookingModal(b)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "6px 7px",
                  borderRadius: 7,
                  cursor: "pointer",
                  marginBottom: 3,
                  background: "#0EA5E908",
                  border: "1px solid #0EA5E920",
                  transition: "all .12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#0EA5E914"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#0EA5E908"; }}
              >
                <I n="calendar" s={12} style={{ color: "#0EA5E9", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#0EA5E9" }}>{fmtBkTime(b)}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 6. RDV passes a statuer (conditional : count > 0 ouvert par defaut) */}
      {data.pastUnstatus.length > 0 && (
        <div style={{ ...sectionStyle, borderColor: "#F59E0B40", background: "#F59E0B06" }}>
          <div style={{ ...sectionTitleStyle, color: "#F59E0B" }}>
            ⚠ {data.pastUnstatus.length} RDV à statuer
          </div>
          {data.pastUnstatus.slice(0, 3).map((b) => {
            const ct = (contacts || []).find((c) => c.id === b.contactId);
            const name = ct?.name || b.visitorName || b.contactName || "RDV";
            return (
              <div
                key={b.id}
                onClick={() => openBookingModal(b)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "6px 7px",
                  borderRadius: 7,
                  cursor: "pointer",
                  marginBottom: 3,
                  background: "#F59E0B0F",
                  border: "1px solid #F59E0B25",
                  transition: "all .12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#F59E0B1F"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#F59E0B0F"; }}
              >
                <I n="clock" s={12} style={{ color: "#F59E0B", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B" }}>{fmtBkTime(b)}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#F59E0B" }}>Ouvrir →</span>
              </div>
            );
          })}
          {data.pastUnstatus.length > 3 && (
            <div style={{ fontSize: 9, color: "#F59E0B", fontWeight: 600, textAlign: "center", padding: 4 }}>
              + {data.pastUnstatus.length - 3} autre{data.pastUnstatus.length - 3 > 1 ? "s" : ""}…
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default RightPanelCommandCenter;
