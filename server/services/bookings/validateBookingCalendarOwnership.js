// V3.x.15.A — Guard centralisé : vérifie que calendarId appartient bien à agendaOwnerId.
//
// Règle métier (CLAUDE.md §3.x.15) :
//   calendarId doit être un calendrier où agendaOwnerId est listé dans collaborators_json,
//   sinon 409 CALENDAR_OWNER_MISMATCH.
//
// Cas couverts :
//   - calendarId absent → 400 CALENDAR_ID_MISSING
//   - agendaOwnerId absent → 400 AGENDA_OWNER_ID_MISSING
//   - calendarId introuvable → 404 CALENDAR_NOT_FOUND
//   - calendarId hors company → 403 CALENDAR_WRONG_COMPANY
//   - agendaOwnerId pas membre du calendar → 409 CALENDAR_OWNER_MISMATCH
//   - sinon → { ok: true }
//
// Schéma DB calendars (PRAGMA table_info) :
//   - id (PK), companyId (FK), collaborators_json (TEXT JSON array d'IDs).
//   - PAS de colonne collaborator_id : seul collaborators_json fait foi.
//
// Branchement (V3.x.15.A — 4 endpoints critiques uniquement) :
//   - server/routes/bookings.js POST /api/bookings (avant INSERT)
//   - server/routes/bookings.js PUT /api/bookings/:id (uniquement si req.body.calendarId fourni)
//   - server/routes/public.js POST /api/public/book (avant INSERT)
//   - server/services/contactShare/share.js sendContactToCollab (avant INSERT booking)
//
// Phase 2 (V3.x.15.B, BACKLOG, non livré V3.x.15.A) :
//   - interMeetings.js fallback `calendars[0]` à supprimer
//   - frontend helper getCollaboratorDefaultCalendarId fallback `calendars[0]` à durcir
//
// Risques data legacy : 0 violation détectée (audit Phase 0 + migration bk1778243690924
// → cal_monbilan_jordan effectuée 2026-05-09).

/**
 * @param db better-sqlite3 instance
 * @param params { companyId, calendarId, agendaOwnerId }
 * @returns { ok: true } | { ok: false, code, status, detail }
 */
export function validateBookingCalendarOwnership(db, { companyId, calendarId, agendaOwnerId }) {
  if (!calendarId) {
    return { ok: false, code: 'CALENDAR_ID_MISSING', status: 400, detail: 'calendarId obligatoire' };
  }
  if (!agendaOwnerId) {
    return { ok: false, code: 'AGENDA_OWNER_ID_MISSING', status: 400, detail: 'agendaOwnerId obligatoire' };
  }

  let cal;
  try {
    cal = db.prepare('SELECT id, companyId, collaborators_json FROM calendars WHERE id = ?').get(calendarId);
  } catch (e) {
    return { ok: false, code: 'CALENDAR_LOOKUP_ERROR', status: 500, detail: e.message };
  }

  if (!cal) {
    return { ok: false, code: 'CALENDAR_NOT_FOUND', status: 404, detail: `Calendar ${calendarId} not found` };
  }
  if (companyId && cal.companyId !== companyId) {
    return { ok: false, code: 'CALENDAR_WRONG_COMPANY', status: 403, detail: `Calendar ${calendarId} belongs to ${cal.companyId}, not ${companyId}` };
  }

  let members = [];
  try {
    members = JSON.parse(cal.collaborators_json || '[]');
    if (!Array.isArray(members)) members = [];
  } catch {
    members = [];
  }

  if (!members.includes(agendaOwnerId)) {
    return {
      ok: false,
      code: 'CALENDAR_OWNER_MISMATCH',
      status: 409,
      detail: `agendaOwnerId ${agendaOwnerId} is not a member of calendar ${calendarId} (members: ${JSON.stringify(members)})`,
    };
  }

  return { ok: true };
}
