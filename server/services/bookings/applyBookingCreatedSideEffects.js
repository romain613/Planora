// Helper unique : applique tous les effets de bord d'un booking créé sur le contact lié.
// Source de vérité unique pour la logique "booking commercial → pipeline avance".
// N'est PAS appelé pour les bookings non-commerciaux (ex: réunion interne) — c'est à la route appelante de décider.
//
// Champs ownership (assignedTo, sharedWithId, executorCollaboratorId, etc.) NE SONT PAS touchés
// — seule la route appelante a le contexte pour les modifier.

import { autoPipelineAdvance } from '../../helpers/pipelineAuto.js';
import { updateBehaviorScore } from '../../helpers/behaviorScore.js';

/**
 * @param db better-sqlite3 instance
 * @param params {
 *   contactId: string (requis)
 *   bookingDate: string 'YYYY-MM-DD' (requis pour next_rdv_date)
 *   source: string (traçabilité — ex: 'bookings_post' | 'contact_share_booking' | 'inter_meeting_transfer' | 'public_booking')
 * }
 * @returns { advanced, fromStage, toStage } — métadonnées pour audit éventuel
 */
export function applyBookingCreatedSideEffects(db, { contactId, bookingDate, source }) {
  const result = { advanced: false, fromStage: null, toStage: null, source: source || 'unknown' };
  if (!contactId) return result;

  try {
    // 1. Incrémente totalBookings
    db.prepare('UPDATE contacts SET totalBookings = COALESCE(totalBookings, 0) + 1 WHERE id = ?').run(contactId);

    // 2. Set rdv_status='programme' + next_rdv_date (uniquement si nouveau RDV est plus proche que celui existant)
    if (bookingDate) {
      db.prepare(
        "UPDATE contacts SET next_rdv_date = ?, rdv_status = 'programme' WHERE id = ? AND (next_rdv_date IS NULL OR next_rdv_date = '' OR next_rdv_date > ?)"
      ).run(bookingDate, contactId, bookingDate);
    }

    // 3. Pipeline auto-advance + capture before/after pour audit
    const before = db.prepare('SELECT pipeline_stage FROM contacts WHERE id = ?').get(contactId);
    autoPipelineAdvance(contactId, 'booking_created');
    const after = db.prepare('SELECT pipeline_stage FROM contacts WHERE id = ?').get(contactId);
    if (before?.pipeline_stage !== after?.pipeline_stage) {
      result.advanced = true;
      result.fromStage = before?.pipeline_stage || null;
      result.toStage = after?.pipeline_stage || null;
    }

    // 4. Behavior score
    updateBehaviorScore(contactId, 'booking_created');

    console.log(
      `[BOOKING-SIDE-EFFECTS] contact=${contactId} source=${source}` +
      (result.advanced ? ` stage=${result.fromStage}→${result.toStage}` : ' stage=unchanged')
    );
  } catch (e) {
    console.error('[BOOKING-SIDE-EFFECTS] error contact=' + contactId + ' source=' + source + ':', e.message);
  }

  return result;
}
