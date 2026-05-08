// V3.x.17.2-fix-reporting-trafficlight (2026-05-08)
// Helper feux de signalisation pour le reporting RDV V1.10.3.
// Mapping des 7 statuts existants (REPORTING_STATUSES dans RdvReportingTab.jsx)
// vers 4 niveaux visuels demandés par MH :
//   🟠 orange = en attente de reporting
//   🟢 vert   = reporting validé / retour positif
//   🔴 rouge  = reporting négatif / refus / problème
//   ⚪ gris   = cas neutre (other)
//
// Statuts source (V1.10.3) : pending, validated, signed, no_show, cancelled, follow_up, other
//
// Usage :
//   import { getReportingTrafficLight } from '../../shared/utils/reportingStatus';
//   const light = getReportingTrafficLight(booking);
//   if (light) <span title={light.tooltip}>{light.emoji}</span>

// Mapping fin statut → couleur feu
const TRAFFIC_LIGHT_MAP = {
  // 🟠 ORANGE — en attente
  pending:   { level: "orange", emoji: "🟠", color: "#F59E0B", label: "Reporting en attente",     tooltip: "En attente du retour collaborateur" },
  // 🟢 VERT — positif / validé / à suivre
  validated: { level: "green",  emoji: "🟢", color: "#22C55E", label: "Reporting validé",         tooltip: "Retour validé" },
  signed:    { level: "green",  emoji: "🟢", color: "#16A34A", label: "Reporting signé",          tooltip: "Retour validé — signature confirmée" },
  follow_up: { level: "green",  emoji: "🟢", color: "#0EA5E9", label: "Reporting à suivre",       tooltip: "Retour positif — à suivre" },
  // 🔴 ROUGE — négatif / problème
  no_show:   { level: "red",    emoji: "🔴", color: "#EF4444", label: "Reporting no-show",        tooltip: "Retour négatif — no-show" },
  cancelled: { level: "red",    emoji: "🔴", color: "#DC2626", label: "Reporting annulé",         tooltip: "Retour négatif — RDV annulé" },
  // ⚪ GRIS — autre
  other:     { level: "gray",   emoji: "⚪", color: "#94A3B8", label: "Reporting autre",          tooltip: "Cas spécifique — voir détail" },
};

/**
 * Retourne le feu de signalisation reporting pour un booking.
 * @param {Object} booking - objet booking avec bookingType + bookingReportingStatus + bookedByCollaboratorId + agendaOwnerId
 * @returns {Object|null} { level, emoji, color, label, tooltip, statusKey } ou null si non applicable
 */
export function getReportingTrafficLight(booking) {
  if (!booking) return null;

  // Détection RDV transmis : V1.10.3 strict OU heuristique fallback
  const _bookerId = booking.bookedByCollaboratorId || booking.bookingReportingSenderCollabId;
  const _ownerId = booking.agendaOwnerId || booking.collaboratorId;
  const _isTransfer = booking.bookingType === "share_transfer"
    || (_bookerId && _ownerId && _bookerId !== _ownerId)
    || !!booking.bookingReportingReceiverCollabId;

  if (!_isTransfer) return null;

  // Le booking ne doit pas être annulé / no-show côté global (ces statuts sont gérés par bookingReportingStatus séparément)
  // V1.10.3 : pending = défaut quand pas encore de reporting
  const _status = booking.bookingReportingStatus || "pending";
  const _meta = TRAFFIC_LIGHT_MAP[_status] || TRAFFIC_LIGHT_MAP.pending;

  return {
    statusKey: _status,
    level: _meta.level,
    emoji: _meta.emoji,
    color: _meta.color,
    label: _meta.label,
    tooltip: _meta.tooltip,
    note: booking.bookingReportingNote || "",
  };
}
