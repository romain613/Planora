/**
 * Calendar default selection helper (V3.x.13)
 *
 * Issue solved: in V1.8.4 cross-collab booking, /api/init returns ALL company calendars
 * (not just the active collab's). Using `(calendars||[])[0]?.id` as default picks the FIRST
 * calendar in SQL order — typically owned by another collaborator.
 *
 * Consequence (pre-fix): bookings created from Ilane's interface were attached to Julie's
 * calendar by default → Google event title = "Agenda Desportes Julie — <visitor>" instead
 * of "Agenda dupond — <visitor>".
 *
 * Resolution: pick the first calendar whose `collaborators` (or parsed `collaborators_json`)
 * array contains the active collaboratorId. Fallback to first global calendar only if the
 * collaborator owns NO calendar (defensive — should not happen on a properly provisioned account).
 */
export function getCollaboratorDefaultCalendarId(calendars, collabId) {
  if (!Array.isArray(calendars) || calendars.length === 0) return '';
  if (!collabId) return calendars[0]?.id || '';
  const owned = calendars.find(c => {
    try {
      const ids = Array.isArray(c.collaborators)
        ? c.collaborators
        : JSON.parse(c.collaborators_json || '[]');
      return Array.isArray(ids) && ids.includes(collabId);
    } catch { return false; }
  });
  return owned?.id || calendars[0]?.id || '';
}
