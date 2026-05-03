// Helper unique de détection de conflit de créneau booking.
// Source de vérité : toute route qui crée/modifie un booking doit l'appeler avant INSERT/UPDATE.
// Règle R1 + R5 — défense profonde, un seul chemin de vérification.

import { DateTime } from 'luxon';
import { getCollaboratorTimezone } from '../../db/database.js';

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

  // V3.x.5.1 — Resolve collaborator timezone for correct UTC ms comparison vs google_events / outlook_events.
  // BUG fix : `new Date(date + 'T00:00:00')` was interpreted in process TZ (VPS=UTC),
  // misaligning the slot ms with Google/Outlook events stored as ISO with offset.
  // Affects VPS prod (UTC) but masked in dev Mac local (Paris). Shared by both Google + Outlook blocks below.
  const collabRow = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
  const collabTz = getCollaboratorTimezone(collaboratorId, collabRow?.companyId);
  const dayDt = DateTime.fromISO(`${date}T00:00:00`, { zone: collabTz });
  const newStartMsTz = dayDt.plus({ minutes: newStart }).toMillis();
  const newEndMsTz = dayDt.plus({ minutes: newEnd }).toMillis();

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

    for (const ge of gcalRows) {
      if (ge.allDay) continue;
      const gsMs = new Date(ge.startTime).getTime();
      const geMs = ge.endTime ? new Date(ge.endTime).getTime() : (gsMs + 30 * 60000);
      if (Number.isNaN(gsMs) || Number.isNaN(geMs) || geMs <= gsMs) continue;
      if (newStartMsTz < geMs && newEndMsTz > gsMs) {
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

  // V3.x.5 Phase 2B — Étendre la défense aux events Outlook synchronisés (V3.x.4 sync 60j).
  // outlook_events est déjà pré-filtré au sync (skip isCancelled + showAs=free), mais on
  // double-check showAs!='free' par défense en profondeur. All-day BLOQUE (Q3=oui) — donc
  // pas de `continue` sur allDay (asymétrie volontaire avec Google qui skip allDay).
  try {
    const olRows = db.prepare(
      "SELECT id, summary, startTime, endTime, allDay, showAs FROM outlook_events WHERE collaboratorId = ? AND startTime IS NOT NULL"
    ).all(collaboratorId);

    for (const oe of olRows) {
      if (oe.showAs === 'free') continue; // défensif (déjà filtré au sync)
      const osMs = new Date(oe.startTime).getTime();
      const oeMs = oe.endTime ? new Date(oe.endTime).getTime() : (osMs + 30 * 60000);
      if (Number.isNaN(osMs) || Number.isNaN(oeMs) || oeMs <= osMs) continue;
      if (newStartMsTz < oeMs && newEndMsTz > osMs) {
        return {
          conflict: true,
          existingBooking: { id: oe.id, time: '(Outlook)', visitorName: oe.summary || 'Évent Outlook' },
          source: 'outlook',
        };
      }
    }
  } catch (e) {
    console.warn('[CONFLICT CHECK] outlook_events scan skip:', e?.message || e);
  }

  return { conflict: false };
}

export { checkBookingConflict };
