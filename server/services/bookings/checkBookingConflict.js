// Helper unique de détection de conflit de créneau booking.
// Source de vérité : toute route qui crée/modifie un booking doit l'appeler avant INSERT/UPDATE.
// Règle R1 + R5 — défense profonde, un seul chemin de vérification.

function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Signature synchrone (better-sqlite3) malgré le nommage "async" du brief :
// mieux vaut rester cohérent avec le driver qu'introduire un Promise artificiel.
function checkBookingConflict(db, {
  collaboratorId,
  date,
  startTime,
  endTime,
  duration,
  excludeBookingId = null,
}) {
  if (!db) throw new Error('DB_REQUIRED');
  if (!collaboratorId || !date || !startTime) {
    return { conflict: false };
  }

  const newStart = toMinutes(startTime);
  let newEnd;
  if (endTime) {
    newEnd = toMinutes(endTime);
  } else if (duration) {
    newEnd = newStart + Number(duration);
  } else {
    newEnd = newStart + 30;
  }
  if (newStart == null || newEnd == null || newEnd <= newStart) {
    return { conflict: false };
  }

  const rows = db.prepare(
    "SELECT id, time, duration, visitorName FROM bookings WHERE collaboratorId = ? AND date = ? AND status = 'confirmed'"
  ).all(collaboratorId, date);

  for (const existing of rows) {
    if (excludeBookingId && existing.id === excludeBookingId) continue;
    const exStart = toMinutes(existing.time);
    if (exStart == null) continue;
    const exEnd = exStart + (Number(existing.duration) || 30);
    if (newStart < exEnd && newEnd > exStart) {
      return { conflict: true, existingBooking: existing };
    }
  }
  return { conflict: false };
}

export { checkBookingConflict };
