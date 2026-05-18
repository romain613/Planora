// useCollabActivity — V1.10.4-r11.0.24 Phase 1 SAFE
//
// Hook memoized retournant les bins horaires d'activite du jour (0h-23h) pour le
// collab connecte. Source unique de verite pour la sparkline d'energie + futurs
// composants (timeline Phase 2 si GO MH).
//
// Sources frontend uniquement (zero backend) :
// - voipCallLogs : appels horodates createdAt
// - appConversations : SMS sortants lastActivityAt + lastEventType='sms_out'
// - bookings : RDV crees (createdAt) ou cancelled (updatedAt)
// - contacts.contract_date : contrats signes
// - contacts.updatedAt + pipeline_stage='perdu' : pertes
//
// Algo simple poids :
// +0.2 par appel
// +0.2 par SMS sortant
// +1   par RDV cree
// +2   par contrat signe
// -1   par RDV cancelled
// -1   par contact perdu
//
// Retourne { bins[24], maxBin, totalCount, currentHour }
//   bins[h] = { hour, positive, negative, count, net }

import { useMemo } from "react";
import { useCollabContext } from "../context/CollabContext";

export function useCollabActivity() {
  const ctx = useCollabContext() || {};
  const { contacts, bookings, voipCallLogs, appConversations, collab } = ctx;

  return useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const nowMs = Date.now();
    const oneHourAgo = nowMs - 3600000;
    const mine = (Array.isArray(contacts) ? contacts : []).filter((c) => c && c.assignedTo === collab?.id);
    const myIds = new Set(mine.map((c) => c.id));

    // Init 24 bins
    const bins = new Array(24).fill(null).map((_, h) => ({ hour: h, positive: 0, negative: 0, count: 0 }));

    // V1.10.4-r11.0.24.b — track recent count (last 60min) pour delta "+X actions depuis 1h"
    let recentCount = 0;
    let lastActivityMs = 0;

    const addToBin = (timestamp, weight) => {
      if (!timestamp || typeof timestamp !== "string" || !timestamp.startsWith(today)) return;
      try {
        const d = new Date(timestamp);
        const ms = d.getTime();
        const h = d.getHours();
        if (h < 0 || h >= 24 || isNaN(h)) return;
        if (weight > 0) bins[h].positive += weight;
        else if (weight < 0) bins[h].negative += Math.abs(weight);
        bins[h].count += 1;
        if (ms > oneHourAgo) recentCount += 1;
        if (ms > lastActivityMs) lastActivityMs = ms;
      } catch {}
    };

    // Appels
    (Array.isArray(voipCallLogs) ? voipCallLogs : []).forEach((c) => addToBin(c?.createdAt, 0.2));

    // SMS sortants
    (Array.isArray(appConversations) ? appConversations : []).forEach((c) => {
      if (c && c.lastEventType === "sms_out") addToBin(c.lastActivityAt, 0.2);
    });

    // Bookings crees ou cancelled
    // V1.10.4-r11.0.27.e — bookingType='reminder' exclus : reminder != action commerciale,
    // ne doit pas gonfler score energie ni polluer sparkline 24h. Cohérent règle 5
    // feedback_reminder_system_anti_regression (reminder = outil interne, pas KPI).
    (Array.isArray(bookings) ? bookings : []).forEach((b) => {
      if (!b || !b.contactId || !myIds.has(b.contactId)) return;
      if (b.bookingType === "reminder") return; // r11.0.27.e
      if (b.status === "cancelled") {
        addToBin(b.updatedAt, -1);
      } else {
        addToBin(b.createdAt, 1);
      }
    });

    // Contrats signes
    mine.forEach((c) => {
      if (c.contract_signed === 1 && c.contract_date) addToBin(c.contract_date, 2);
    });

    // Contacts perdu (updatedAt aujourd hui + stage=perdu)
    mine.forEach((c) => {
      if (c.pipeline_stage === "perdu") addToBin(c.updatedAt, -1);
    });

    // Compute net + total max pour normalisation
    let totalCount = 0;
    let maxAmp = 1;
    bins.forEach((b) => {
      b.net = b.positive - b.negative;
      totalCount += b.count;
      const amp = Math.max(b.positive, b.negative);
      if (amp > maxAmp) maxAmp = amp;
    });

    const currentHour = new Date().getHours();

    // V1.10.4-r11.0.24.b — minutes depuis derniere activite (pour "Aucune activite recente")
    const minutesSinceLastActivity = lastActivityMs > 0 ? Math.floor((nowMs - lastActivityMs) / 60000) : null;

    return { bins, maxBin: maxAmp, totalCount, currentHour, recentCount, minutesSinceLastActivity };
  }, [contacts, bookings, voipCallLogs, appConversations, collab?.id]);
}
