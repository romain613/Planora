// useRecentActivityFeed — V1.10.4-r11.0.25 Phase 2 SAFE
//
// Hook memoized retournant les 5 evenements les plus recents du jour, fusion legere
// frontend pur (zero backend, zero websocket). Source unique pour le bloc "Activité
// récente" dans le Command Center.
//
// Sources :
// - voipCallLogs        : appels du jour (sortant/recus/manques)
// - appConversations    : SMS in/out du jour (lastEventType + lastActivityAt)
// - bookings created    : RDV crees aujourd hui (status != cancelled)
// - bookings cancelled  : RDV annules aujourd hui
// - contacts.contract   : contrats signes aujourd hui
//
// Format event :
// { id, type, ms, icon, color, label, contactId?, bookingId?, action }
//   action = 'contact' | 'booking' | 'sms' | null
//
// Memoized sur [contacts, bookings, voipCallLogs, appConversations, collab.id].

import { useMemo } from "react";
import { useCollabContext } from "../context/CollabContext";

const MAX_EVENTS = 5;

export function useRecentActivityFeed() {
  const ctx = useCollabContext() || {};
  const { contacts, bookings, voipCallLogs, appConversations, collab } = ctx;

  return useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const all = Array.isArray(contacts) ? contacts : [];
    const bks = Array.isArray(bookings) ? bookings : [];
    const cls = Array.isArray(voipCallLogs) ? voipCallLogs : [];
    const convs = Array.isArray(appConversations) ? appConversations : [];
    const mine = all.filter((c) => c && c.assignedTo === collab?.id);
    const myIds = new Set(mine.map((c) => c.id));
    const findContact = (id) => (id ? all.find((c) => c.id === id) : null);

    const events = [];

    // ── 1. Appels du jour ──
    cls.forEach((c) => {
      if (!c || !c.createdAt || !c.createdAt.startsWith(today)) return;
      const ms = new Date(c.createdAt).getTime();
      if (isNaN(ms)) return;
      const outbound = c.direction === "outbound";
      const num = outbound ? c.toNumber : c.fromNumber;
      const matched = c.contactId ? findContact(c.contactId) : null;
      const subj = (matched?.name || num || "Inconnu").toString().trim();
      const missed = c.status === "missed" || c.status === "no-answer" || c.status === "rejected";
      events.push({
        id: "call-" + c.id,
        type: missed ? "call_missed" : (outbound ? "call_out" : "call_in"),
        ms,
        icon: missed ? "phone-missed" : (outbound ? "phone-outgoing" : "phone-incoming"),
        color: missed ? "#EF4444" : "#22C55E",
        label: missed ? `Appel manqué — ${subj}` : `Appel ${outbound ? "sortant" : "reçu"} — ${subj}`,
        contactId: c.contactId || null,
        action: c.contactId ? "contact" : null,
      });
    });

    // ── 2. SMS du jour (in/out) ──
    convs.forEach((c) => {
      if (!c || !c.lastActivityAt || !c.lastActivityAt.startsWith(today)) return;
      if (!c.lastEventType || !c.lastEventType.includes("sms")) return;
      const ms = new Date(c.lastActivityAt).getTime();
      if (isNaN(ms)) return;
      const outbound = c.lastEventType === "sms_out";
      const subj = (c.contactName || c.clientPhone || "—").toString().trim();
      events.push({
        id: "sms-" + c.id,
        type: outbound ? "sms_out" : "sms_in",
        ms,
        icon: outbound ? "send" : "message-square",
        color: outbound ? "#22C55E" : "#0EA5E9",
        label: `SMS ${outbound ? "envoyé à" : "reçu de"} ${subj}`,
        contactId: c.contactId || null,
        action: "sms",
      });
    });

    // ── 3. RDV crees aujourd'hui ──
    // V1.10.4-r11.0.27.e — bookingType='reminder' exclus : reminder != vrai RDV commercial,
    // visibilite assuree dans bloc Notifications live (cf NOTIF_STYLE reminder_due). Cohérent
    // règle 5 feedback_reminder_system_anti_regression (reminder = booking interne, non-RDV).
    bks.forEach((b) => {
      if (!b || !b.contactId || !myIds.has(b.contactId)) return;
      if (b.bookingType === "reminder") return; // r11.0.27.e
      // RDV cree aujourd'hui (et pas annule le meme jour)
      if (b.createdAt && b.createdAt.startsWith(today) && b.status !== "cancelled") {
        const ms = new Date(b.createdAt).getTime();
        if (!isNaN(ms)) {
          const subj = (findContact(b.contactId)?.name || b.visitorName || b.contactName || "RDV").toString().trim();
          events.push({
            id: "bk-create-" + b.id,
            type: "booking_created",
            ms,
            icon: "calendar-plus",
            color: "#F59E0B",
            label: `RDV créé — ${subj}`,
            bookingId: b.id,
            contactId: b.contactId,
            action: "booking",
          });
        }
      }
      // RDV annule aujourd'hui (et createdAt pas aujourd'hui pour eviter doublon)
      if (b.status === "cancelled" && b.updatedAt && b.updatedAt.startsWith(today)) {
        const ms = new Date(b.updatedAt).getTime();
        if (!isNaN(ms)) {
          const subj = (findContact(b.contactId)?.name || b.visitorName || "RDV").toString().trim();
          events.push({
            id: "bk-cancel-" + b.id,
            type: "booking_cancelled",
            ms,
            icon: "x-circle",
            color: "#EF4444",
            label: `RDV annulé — ${subj}`,
            bookingId: b.id,
            contactId: b.contactId,
            action: "booking",
          });
        }
      }
    });

    // ── 4. Contrats signes aujourd'hui ──
    mine.forEach((c) => {
      if (c.contract_signed === 1 && c.contract_date && c.contract_date.startsWith(today)) {
        const ms = new Date(c.contract_date).getTime();
        if (!isNaN(ms)) {
          events.push({
            id: "contract-" + c.id,
            type: "contract",
            ms,
            icon: "award",
            color: "#22C55E",
            label: `Contrat validé — ${c.name}`,
            contactId: c.id,
            action: "contact",
          });
        }
      }
    });

    // Tri desc + slice 5
    events.sort((a, b) => b.ms - a.ms);
    return events.slice(0, MAX_EVENTS);
  }, [contacts, bookings, voipCallLogs, appConversations, collab?.id]);
}
