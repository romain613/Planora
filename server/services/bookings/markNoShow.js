// Helper unique : marque un booking no-show et applique la matrice pipeline
// selon les règles figées Wave B (10 règles B.1-B.10).
//
// Ce helper n'est PAS appelé par autoPipelineAdvance (qui a anti-régression
// hardcodée) — le no-show est un controlled regression explicite du pipeline,
// tracé en audit_logs + pipeline_history.
//
// Ne touche AUCUN champ ownership (B.7).

import { updateBehaviorScore } from '../../helpers/behaviorScore.js';

const STAGE_LEVEL = { nouveau: 0, nrp: 1, contacte: 2, qualifie: 3, rdv_programme: 4, client_valide: 5, perdu: 99 };
const FINAL_STAGES = ['client_valide', 'perdu'];

// Matrice B.5 — stage cible après un no-show (null = stage inchangé)
function decideNoShowStage({ currentStage, consecutiveCount, hasFutureRdv }) {
  if (FINAL_STAGES.includes(currentStage)) return null;
  if (hasFutureRdv) return null;
  const level = STAGE_LEVEL[currentStage];
  if (level === undefined) return null; // stage custom : pas de mutation auto
  if (consecutiveCount === 1) {
    if (currentStage === 'rdv_programme') return 'contacte';
    return null;
  }
  if (consecutiveCount >= 2) {
    if (currentStage === 'nrp') return null;
    return 'nrp';
  }
  return null;
}

/**
 * @throws { BOOKING_NOT_FOUND | BOOKING_WRONG_COMPANY | BOOKING_CANCELLED_CANNOT_NOSHOW
 *        | BOOKING_NOT_PAST_YET }
 */
export function markNoShow(db, { bookingId, actorCollaboratorId, companyId }) {
  if (!bookingId) throw new Error('BOOKING_ID_REQUIRED');
  if (!companyId) throw new Error('COMPANY_ID_REQUIRED');

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) throw new Error('BOOKING_NOT_FOUND');
  if (booking.companyId && booking.companyId !== companyId) throw new Error('BOOKING_WRONG_COMPANY');
  if (booking.status === 'cancelled') throw new Error('BOOKING_CANCELLED_CANNOT_NOSHOW');

  // B.2 — précondition temporelle : la fin du booking doit être passée
  const now = Date.now();
  const endTs = new Date((booking.date || '1970-01-01') + 'T' + (booking.time || '00:00') + ':00')
    .getTime() + (Number(booking.duration) || 30) * 60000;
  if (isNaN(endTs) || endTs > now) throw new Error('BOOKING_NOT_PAST_YET');

  // B.3 — idempotence : déjà no-show → 200 no-op
  if (Number(booking.noShow) === 1) {
    return { success: true, noChange: true, reason: 'already_no_show', bookingId };
  }

  // 1. UPDATE booking.noShow = 1 (le booking actuel devient le "plus récent no-show")
  db.prepare('UPDATE bookings SET noShow = 1 WHERE id = ?').run(bookingId);

  // Pas de contact associé → rien de plus à faire
  if (!booking.contactId) {
    return { success: true, bookingId, consecutiveCount: 0, contactId: null };
  }

  const contact = db.prepare('SELECT id, pipeline_stage, companyId, rdv_status, next_rdv_date FROM contacts WHERE id = ?').get(booking.contactId);
  if (!contact) {
    // Booking marqué no-show mais contact disparu → on a déjà fait l'UPDATE, pas de suite
    return { success: true, bookingId, consecutiveCount: 0, contactId: null, reason: 'contact_not_found' };
  }

  // B.4 — calcul du compteur consécutif depuis les bookings passés (le current booking compte, il vient d'être marqué)
  const recent = db.prepare(
    "SELECT id, date, time, duration, noShow, checkedIn FROM bookings WHERE contactId = ? AND status = 'confirmed' ORDER BY date DESC, time DESC LIMIT 10"
  ).all(contact.id);
  const pastOnly = recent.filter(b => {
    const e = new Date((b.date || '1970-01-01') + 'T' + (b.time || '00:00') + ':00').getTime() + (Number(b.duration) || 30) * 60000;
    return !isNaN(e) && e <= now;
  });
  let consecutiveCount = 0;
  for (const b of pastOnly) {
    if (Number(b.noShow) === 1) consecutiveCount++;
    else break; // checkedIn=1 OU ni no-show ni checkIn : rupture de séquence (B.8)
  }

  // F-style — recalcul next_rdv_date futur confirmé (même pattern que Vague 1)
  const next = db.prepare(
    "SELECT date FROM bookings WHERE contactId = ? AND status = 'confirmed' AND date >= date('now') ORDER BY date ASC, time ASC LIMIT 1"
  ).get(contact.id);
  const hasFutureRdv = !!next;

  // B.5 — matrice stage cible
  const currentStage = contact.pipeline_stage || 'nouveau';
  const targetStage = decideNoShowStage({ currentStage, consecutiveCount, hasFutureRdv });
  const stageChanged = targetStage !== null && targetStage !== currentStage;

  // 2. UPDATE contact (rdv_status, next_rdv_date, pipeline_stage si change)
  const newRdvDate = next ? next.date : null;
  const newRdvStatus = next ? 'programme' : null;
  if (stageChanged) {
    db.prepare('UPDATE contacts SET next_rdv_date = ?, rdv_status = ?, pipeline_stage = ? WHERE id = ?')
      .run(newRdvDate, newRdvStatus, targetStage, contact.id);
  } else {
    db.prepare('UPDATE contacts SET next_rdv_date = ?, rdv_status = ? WHERE id = ?')
      .run(newRdvDate, newRdvStatus, contact.id);
  }

  // 3. behavior_score via mécanisme central (-5 via event 'no_show' existant)
  updateBehaviorScore(contact.id, 'no_show');

  // 4. pipeline_history : toujours tracé (même si stage inchangé — B.6)
  try {
    db.prepare(
      `INSERT INTO pipeline_history (id, contactId, companyId, fromStage, toStage, userId, userName, note, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'ph_ns_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      contact.id,
      companyId,
      currentStage,
      stageChanged ? targetStage : currentStage,
      actorCollaboratorId || '',
      '',
      `No-show marqué (consec=${consecutiveCount}, bookingId=${bookingId}${hasFutureRdv ? ', futureRdvExists' : ''}${!stageChanged ? ', stageUnchanged' : ''})`,
      new Date().toISOString()
    );
  } catch (e) { console.warn('[NOSHOW] pipeline_history insert failed:', e.message); }

  // 5. audit_logs obligatoire
  const auditId = 'aud_ns_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  try {
    db.prepare(
      `INSERT INTO audit_logs
        (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      auditId,
      companyId,
      actorCollaboratorId || '',
      '',
      '',
      'booking_no_show',
      'booking',
      'booking',
      bookingId,
      `No-show marqué (consec=${consecutiveCount}${stageChanged ? `, stage ${currentStage}→${targetStage}` : ', stage inchangé'})`,
      JSON.stringify({
        bookingId,
        contactId: contact.id,
        consecutiveCount,
        previousStage: currentStage,
        newStage: stageChanged ? targetStage : currentStage,
        stageChanged,
        hasFutureRdv,
        rdvStatusCleared: !hasFutureRdv,
        behaviorScoreEvent: 'no_show',
      }).slice(0, 2000),
      new Date().toISOString()
    );
  } catch (e) { console.warn('[NOSHOW] audit_logs insert failed:', e.message); }

  console.log(`[NOSHOW] bookingId=${bookingId} contactId=${contact.id} consec=${consecutiveCount} ${stageChanged ? `stage=${currentStage}→${targetStage}` : `stage=unchanged(${currentStage})`} futureRdv=${hasFutureRdv}`);

  return {
    success: true,
    bookingId,
    contactId: contact.id,
    consecutiveCount,
    previousStage: currentStage,
    newStage: stageChanged ? targetStage : currentStage,
    stageChanged,
    hasFutureRdv,
    auditId,
  };
}
