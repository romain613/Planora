/**
 * V5.2 Lead Scoring — Score 0-100 par contact
 *
 * 8 criteres (V2 — poids remontes + urgence temporelle + bonus premier contact) :
 *
 *   1. Fraicheur derniere action     0-30  (base: last_human_action_at ou updatedAt)
 *   2. Urgence temporelle           -15 a +15  (bonus <24h, penalite >48h)
 *   3. Stage pipeline                0-25
 *   4. Penalite NRP                 -5/NRP (max -15)
 *   5. Volume interactions           0-15
 *   6. Montant contrat               0-10
 *   7. Qualite IA appels             0-10
 *   8. Bonus premier contact         0-15  (nouveau + jamais contacte = urgent)
 *
 * Score persiste sur le contact (lead_score) via dirty flag.
 * Cron recalcule toutes les 2h (uniquement les dirty).
 */

import { db } from '../db/database.js';

const STAGE_SCORES = {
  nouveau: 5, nrp: 3, contacte: 12, qualifie: 18, rdv_programme: 25, client_valide: 25, perdu: 0
};

export function computeContactScore(contactId) {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!contact) return null;

  const detail = {};
  const reasons = [];
  let total = 0;

  // ─── Calcul de la date de derniere action humaine ───
  const lastCall = db.prepare('SELECT createdAt FROM call_logs WHERE contactId = ? AND is_valid_call = 1 ORDER BY createdAt DESC LIMIT 1').get(contactId);
  const lastSms = db.prepare('SELECT createdAt FROM sms_messages WHERE contactId = ? ORDER BY createdAt DESC LIMIT 1').get(contactId);
  const lastHumanAction = [lastCall?.createdAt, lastSms?.createdAt].filter(Boolean).sort().reverse()[0] || null;
  const lastActivity = lastHumanAction || contact.updatedAt || contact.lastVisit || contact.createdAt || null;
  const hoursAgo = lastActivity ? Math.max(0, (Date.now() - new Date(lastActivity).getTime()) / 3600000) : 9999;
  const daysAgo = hoursAgo / 24;

  // 1. Fraicheur derniere action (0-30)
  if (hoursAgo < 6) { detail.freshness = 30; reasons.push('Action dans les 6h'); }
  else if (hoursAgo < 24) { detail.freshness = 25; reasons.push('Action dans les 24h'); }
  else if (daysAgo < 3) { detail.freshness = 20; reasons.push('Contact recent (< 3j)'); }
  else if (daysAgo < 7) { detail.freshness = 12; }
  else if (daysAgo < 14) { detail.freshness = 6; }
  else if (daysAgo < 30) { detail.freshness = 2; }
  else { detail.freshness = 0; }
  total += detail.freshness;

  // 2. Urgence temporelle (-15 a +15) — bonus si recent, penalite si inactif
  if (hoursAgo < 2) { detail.urgency = 15; reasons.push('Tres recent — traiter maintenant'); }
  else if (hoursAgo < 12) { detail.urgency = 10; reasons.push('A traiter aujourd\'hui'); }
  else if (hoursAgo < 24) { detail.urgency = 5; }
  else if (hoursAgo < 48) { detail.urgency = 0; reasons.push('Inactif 24-48h'); }
  else if (daysAgo < 7) { detail.urgency = -5; reasons.push('Inactif ' + Math.floor(daysAgo) + 'j — risque de perte'); }
  else if (daysAgo < 14) { detail.urgency = -10; reasons.push('Inactif ' + Math.floor(daysAgo) + 'j — lead refroidit'); }
  else { detail.urgency = -15; reasons.push('Inactif ' + Math.floor(daysAgo) + 'j — lead froid'); }
  total += detail.urgency;

  // 3. Stage pipeline (0-25)
  detail.stage = STAGE_SCORES[contact.pipeline_stage] ?? 5;
  if (contact.pipeline_stage === 'qualifie') reasons.push('Qualifie — pret a convertir');
  if (contact.pipeline_stage === 'rdv_programme') reasons.push('RDV programme');
  total += detail.stage;

  // 4. Penalite NRP (-5/NRP, max -15)
  let nrpPenalty = 0;
  try {
    const followups = JSON.parse(contact.nrp_followups_json || '[]');
    const pending = followups.filter(f => f.status !== 'done').length;
    nrpPenalty = Math.min(pending * 5, 15);
    if (pending > 0) reasons.push(pending + ' relance' + (pending > 1 ? 's' : '') + ' NRP en attente');
  } catch {}
  detail.nrp_penalty = -nrpPenalty;
  total -= nrpPenalty;

  // 5. Volume interactions 30j (0-15)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const callCount = db.prepare('SELECT COUNT(*) as c FROM call_logs WHERE contactId = ? AND createdAt > ? AND is_valid_call = 1').get(contactId, thirtyDaysAgo)?.c || 0;
  const smsCount = db.prepare('SELECT COUNT(*) as c FROM sms_messages WHERE contactId = ? AND createdAt > ?').get(contactId, thirtyDaysAgo)?.c || 0;
  const interactions = callCount + smsCount;
  detail.interactions = Math.min(interactions * 3, 15);
  if (interactions > 0) reasons.push(interactions + ' interaction' + (interactions > 1 ? 's' : '') + ' (30j)');
  total += detail.interactions;

  // 6. Montant contrat (0-10)
  const amount = contact.contract_amount || 0;
  detail.contract = amount >= 10000 ? 10 : amount >= 5000 ? 8 : amount >= 2000 ? 6 : amount >= 500 ? 4 : amount > 0 ? 2 : 0;
  if (amount > 0) reasons.push('Contrat ' + amount + '€');
  total += detail.contract;

  // 7. Qualite IA appels (0-10)
  const avgQuality = db.prepare('SELECT AVG(qualityScore) as avg FROM ai_copilot_analyses WHERE contactId = ? AND qualityScore > 0').get(contactId)?.avg;
  detail.ai_quality = avgQuality ? Math.round(avgQuality * 10 / 100) : 0;
  if (avgQuality && avgQuality > 70) reasons.push('Qualite appel elevee');
  total += detail.ai_quality;

  // 8. Bonus premier contact jamais fait (0-15)
  const hasBeenContacted = callCount > 0 || smsCount > 0 || contact.lastVisit;
  if (!hasBeenContacted && contact.pipeline_stage === 'nouveau') {
    detail.first_contact_bonus = 15;
    reasons.push('Jamais contacte — premier appel a faire');
  } else {
    detail.first_contact_bonus = 0;
  }
  total += detail.first_contact_bonus;

  // Clamp 0-100
  const score = Math.max(0, Math.min(100, total));

  // Temperature
  const temperature = score >= 60 ? 'hot' : score >= 35 ? 'warm' : 'cold';

  // Persister
  const now = new Date().toISOString();
  const detailWithReasons = { ...detail, reasons, temperature, lastHumanAction: lastHumanAction || null, hoursAgo: Math.round(hoursAgo) };
  db.prepare('UPDATE contacts SET lead_score = ?, lead_score_detail_json = ?, lead_score_updated_at = ?, lead_score_dirty = 0 WHERE id = ?')
    .run(score, JSON.stringify(detailWithReasons), now, contactId);

  return { score, detail: detailWithReasons };
}

/**
 * Recalcule les scores de tous les contacts dirty d'une company
 */
export function computeDirtyScores(companyId) {
  const dirtyContacts = db.prepare('SELECT id FROM contacts WHERE companyId = ? AND lead_score_dirty = 1').all(companyId);
  let updated = 0;
  for (const { id } of dirtyContacts) {
    try { computeContactScore(id); updated++; } catch (e) { console.error('[LEAD SCORING] Error scoring', id, e.message); }
  }
  if (updated > 0) console.log(`[LEAD SCORING] ${updated} contacts rescored for ${companyId}`);
  return updated;
}

/**
 * Marque un contact comme dirty
 */
export function markScoreDirty(contactId) {
  try { db.prepare('UPDATE contacts SET lead_score_dirty = 1 WHERE id = ?').run(contactId); } catch {}
}

/**
 * Recalcule TOUTES les companies dirty (pour le cron)
 */
export function computeAllDirtyScores() {
  const companies = db.prepare('SELECT DISTINCT companyId FROM contacts WHERE lead_score_dirty = 1').all();
  let total = 0;
  for (const { companyId } of companies) { total += computeDirtyScores(companyId); }
  return total;
}
