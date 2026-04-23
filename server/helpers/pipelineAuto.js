/**
 * Pipeline Auto-Advance Logic V2
 *
 * Centralise toutes les transitions automatiques de pipeline_stage.
 *
 * HIÉRARCHIE DES STAGES (du plus bas au plus haut) :
 *   nouveau (0) < nrp (1) < contacte (2) < qualifie (3) < rdv_programme (4) < client_valide (5) < perdu (X)
 *
 * RÈGLES :
 *   - Les événements automatiques ne font QUE monter le niveau, jamais descendre
 *   - Seule exception : booking_cancelled_last → retour à 'contacte' (si 0 RDV futur)
 *   - Les stages finaux (client_valide, perdu) et custom ne sont jamais touchés
 *   - Un changement manuel par le collaborateur est toujours prioritaire
 *   - call_missed ne passe PAS en NRP si un RDV futur existe
 *
 * EVENTS :
 *   booking_created        → pré-RDV → rdv_programme
 *   booking_cancelled_last → rdv_programme → contacte (si 0 RDV futur)
 *   call_answered          → nouveau/nrp → contacte
 *   call_missed            → nouveau/contacte → nrp (seulement si 0 RDV futur)
 *   contract_signed        → tout sauf perdu → client_valide (Phase 3)
 *
 * RETOUR : { changed: bool, from: string, to: string, reason: string }
 */

import { db } from '../db/database.js';

const STAGE_LEVEL = {
  nouveau: 0, nrp: 1, contacte: 2, qualifie: 3, rdv_programme: 4, client_valide: 5, perdu: 99,
};
const KNOWN_STAGES = Object.keys(STAGE_LEVEL);
const FINAL_STAGES = ['client_valide', 'perdu'];

function hasFutureBooking(contactId) {
  const email = db.prepare('SELECT email FROM contacts WHERE id = ?').get(contactId)?.email;
  return !!db.prepare(
    "SELECT id FROM bookings WHERE (contactId = ? OR (visitorEmail = ? AND ? != '')) AND status = 'confirmed' AND date >= date('now') LIMIT 1"
  ).get(contactId, email || '', email || '');
}

export function autoPipelineAdvance(contactId, event) {
  if (!contactId) return { changed: false, reason: 'no_contact_id' };

  try {
    const contact = db.prepare('SELECT pipeline_stage, companyId FROM contacts WHERE id = ?').get(contactId);
    if (!contact) return { changed: false, reason: 'contact_not_found' };

    const stage = contact.pipeline_stage || 'nouveau';
    const level = STAGE_LEVEL[stage];

    // Ne jamais toucher les stages finaux ni les stages custom
    if (FINAL_STAGES.includes(stage)) return { changed: false, from: stage, reason: 'final_stage' };
    if (level === undefined) return { changed: false, from: stage, reason: 'custom_stage' };

    let newStage = null;
    let reason = '';

    switch (event) {
      case 'booking_created':
        if (level < STAGE_LEVEL.rdv_programme) {
          newStage = 'rdv_programme';
          reason = 'booking_created';
        }
        break;

      case 'booking_cancelled_last':
        if (stage === 'rdv_programme' && !hasFutureBooking(contactId)) {
          newStage = 'contacte';
          reason = 'last_booking_cancelled';
        }
        break;

      case 'call_answered':
        // Monter vers contacte seulement si stage inférieur (nouveau ou nrp)
        if (level < STAGE_LEVEL.contacte) {
          newStage = 'contacte';
          reason = 'call_answered';
        }
        break;

      case 'call_missed':
        // Passer en NRP seulement si stage <= contacte ET pas de RDV futur
        if (level <= STAGE_LEVEL.contacte) {
          if (hasFutureBooking(contactId)) {
            reason = 'call_missed_but_rdv_exists';
          } else {
            newStage = 'nrp';
            reason = 'call_missed_no_rdv';
          }
        } else {
          reason = 'call_missed_higher_stage';
        }
        break;

      // Phase 3
      // case 'contract_signed':
      //   if (!FINAL_STAGES.includes(stage)) { newStage = 'client_valide'; reason = 'contract_signed'; }
      //   break;
    }

    if (newStage && newStage !== stage) {
      const now = new Date().toISOString();
      db.prepare('UPDATE contacts SET pipeline_stage = ?, updatedAt = ? WHERE id = ?').run(newStage, now, contactId);
      // Legacy pipeline_history (conserve compatibilite)
      try {
        db.prepare(
          'INSERT INTO pipeline_history (id, contactId, companyId, fromStage, toStage, userId, userName, note, createdAt) VALUES (?,?,?,?,?,?,?,?,?)'
        ).run('ph' + Date.now() + Math.random().toString(36).slice(2, 5),
          contactId, contact.companyId || '', stage, newStage, 'system', 'Automatique', event, now);
      } catch {}
      // V4: contact_status_history — traçabilité complète
      try {
        const sourceMap = { booking_created: 'booking', booking_cancelled_last: 'booking', call_answered: 'call', call_missed: 'call', contract_signed: 'system' };
        db.prepare('INSERT INTO contact_status_history (id, contactId, companyId, fromStatus, toStatus, source, origin, userId, collaboratorName, tabId, reason, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
          'csh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          contactId, contact.companyId || '', stage, newStage,
          sourceMap[event] || 'automation', 'pipeline_auto_' + event,
          'system', 'Automatique', '', reason, now
        );
      } catch (e) { console.error('[V4 PIPELINE AUTO HISTORY]', e.message); }
      console.log(`[V4 AUTO] ${contactId}: ${stage} → ${newStage} (event: ${event})`);
      return { changed: true, from: stage, to: newStage, reason };
    }

    return { changed: false, from: stage, reason: reason || 'no_change_needed' };
  } catch (err) {
    console.error('[PIPELINE AUTO]', err.message);
    return { changed: false, reason: 'error:' + err.message };
  }
}
