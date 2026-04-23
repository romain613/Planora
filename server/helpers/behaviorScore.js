/**
 * Behavior Score — Scoring comportemental des contacts
 *
 * Score borné : min -50, max 100
 * Mis à jour par événements CRM en temps réel.
 *
 * Events & points :
 *   call_answered       → +3  (appel répondu >10s)
 *   call_missed         → -2  (seulement si 3+ manqués consécutifs sans répondu entre)
 *   message_inbound     → +4  (client envoie un message)
 *   message_outbound    → +1  (collab répond)
 *   booking_created     → +5  (RDV programmé)
 *   booking_cancelled   → -3  (RDV annulé)
 *   no_show             → -5  (RDV non honoré)
 */

import { db } from '../db/database.js';

const SCORE_MAX = 100;
const SCORE_MIN = -50;

const POINTS = {
  call_answered: 3,
  call_missed: -2,       // appliqué seulement si 3+ missed consécutifs
  message_inbound: 4,
  message_outbound: 1,
  booking_created: 5,
  booking_cancelled: -3,
  no_show: -5,
};

/**
 * Vérifie si le contact a 3+ appels manqués consécutifs sans appel répondu entre.
 */
function hasRepeatedMissedCalls(contactId) {
  const recentCalls = db.prepare(`
    SELECT status FROM call_logs
    WHERE contactId = ? AND status IN ('completed', 'no-answer', 'busy', 'canceled', 'failed')
    ORDER BY createdAt DESC LIMIT 5
  `).all(contactId);

  let consecutiveMissed = 0;
  for (const call of recentCalls) {
    if (call.status === 'completed') break;
    consecutiveMissed++;
  }
  return consecutiveMissed >= 3;
}

/**
 * Met à jour le behavior_score d'un contact.
 * @returns {{ updated: boolean, oldScore: number, newScore: number, points: number }}
 */
export function updateBehaviorScore(contactId, event) {
  if (!contactId) return { updated: false };

  try {
    // call_missed : vérifier la répétition avant d'appliquer
    if (event === 'call_missed') {
      if (!hasRepeatedMissedCalls(contactId)) {
        return { updated: false, reason: 'missed_not_repeated' };
      }
    }

    const pts = POINTS[event];
    if (!pts) return { updated: false, reason: 'unknown_event' };

    const contact = db.prepare('SELECT behavior_score FROM contacts WHERE id = ?').get(contactId);
    if (!contact) return { updated: false, reason: 'contact_not_found' };

    const oldScore = contact.behavior_score || 0;
    const newScore = Math.max(SCORE_MIN, Math.min(SCORE_MAX, oldScore + pts));

    if (newScore !== oldScore) {
      db.prepare('UPDATE contacts SET behavior_score = ?, last_behavior_event_at = ? WHERE id = ?')
        .run(newScore, new Date().toISOString(), contactId);
    } else {
      // Score déjà au cap, mais on met à jour le timestamp
      db.prepare('UPDATE contacts SET last_behavior_event_at = ? WHERE id = ?')
        .run(new Date().toISOString(), contactId);
    }

    return { updated: true, oldScore, newScore, points: pts };
  } catch (err) {
    console.error('[BEHAVIOR SCORE]', err.message);
    return { updated: false, reason: 'error' };
  }
}
