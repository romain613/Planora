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
      return { conflict: true, existingBooking: existing, source: 'booking' };
    }
  }

  // V1.8.24.2 Phase 3.1 — Étendre la défense aux events Google Calendar synchronisés.
  // La table google_events est peuplée par cron syncEventsFromGoogle (cron/reminders.js
  // toutes les 5min). Détecte les conflits avec les events créés directement dans GCal
  // qui ne passent pas par l'app (vecteur double-booking documenté audit 2026-04-26 §4.1).
  // All-day events ignorés (ne bloquent pas un créneau précis).
  try {
    const gcalRows = db.prepare(
      "SELECT id, summary, startTime, endTime, allDay FROM google_events WHERE collaboratorId = ? AND startTime IS NOT NULL"
    ).all(collaboratorId);

    const dayBase = new Date(date + 'T00:00:00');
    const newStartMs = dayBase.getTime() + newStart * 60000;
    const newEndMs = dayBase.getTime() + newEnd * 60000;

    for (const ge of gcalRows) {
      if (ge.allDay) continue;
      const gsMs = new Date(ge.startTime).getTime();
      const geMs = ge.endTime ? new Date(ge.endTime).getTime() : (gsMs + 30 * 60000);
      if (Number.isNaN(gsMs) || Number.isNaN(geMs) || geMs <= gsMs) continue;
      if (newStartMs < geMs && newEndMs > gsMs) {
        return {
          conflict: true,
          existingBooking: { id: ge.id, time: '(Google)', visitorName: ge.summary || 'Évent Google' },
          source: 'google',
        };
      }
    }
  } catch (e) {
    console.warn('[CONFLICT CHECK] google_events scan skip:', e?.message || e);
  }

  return { conflict: false };
}

export { checkBookingConflict };
