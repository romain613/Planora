// V1.10.4-r11.0.6 — Source de vérité unique pour les buffers.
// Le buffer effectif est résolu depuis le collaborateur CIBLE (qui reçoit/exécute
// le RDV) et son calendrier cible, avec un plancher système de 5 minutes.

export const SYSTEM_MIN_BUFFER_MINUTES = 5;

// Résout le buffer effectif pour une opération de booking.
// Retourne { bufferBefore, bufferAfter, effectiveBuffer } — bufferBefore et bufferAfter
// portent la même valeur (symétrique, décision r11.0.4 Option 1).
//
// Priorité :
//   max( SYSTEM_MIN_BUFFER_MINUTES,
//        collaborator.buffer_minutes,
//        calendar.bufferBefore,
//        calendar.bufferAfter )
//
// Args :
//   collaborator : row { buffer_minutes } | null
//   calendar     : row { bufferBefore, bufferAfter } | null
export function resolveEffectiveBuffer({ collaborator, calendar } = {}) {
  const collabBuf = Number(collaborator?.buffer_minutes) || 0;
  const calBefore = Number(calendar?.bufferBefore) || 0;
  const calAfter = Number(calendar?.bufferAfter) || 0;
  const effective = Math.max(SYSTEM_MIN_BUFFER_MINUTES, collabBuf, calBefore, calAfter);
  return { bufferBefore: effective, bufferAfter: effective, effectiveBuffer: effective };
}

// Helper raccourci : charge collab + cal et retourne le buffer effectif.
// Utilisé par les routes booking (public.js, bookings.js, interMeetings.js).
export function resolveEffectiveBufferFromDb(db, { collaboratorId, calendarId } = {}) {
  let collaborator = null;
  let calendar = null;
  if (collaboratorId) {
    try { collaborator = db.prepare('SELECT buffer_minutes FROM collaborators WHERE id = ?').get(collaboratorId); } catch {}
  }
  if (calendarId) {
    try { calendar = db.prepare('SELECT bufferBefore, bufferAfter FROM calendars WHERE id = ?').get(calendarId); } catch {}
  }
  return resolveEffectiveBuffer({ collaborator, calendar });
}
