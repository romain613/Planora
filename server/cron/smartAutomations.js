/**
 * V5 Smart Automations — Cron toutes les 30 min
 *
 * 4 regles + anti-spam 24h :
 *   1. Relancer contact chaud (qualifie + score>70 + inactif 3j)
 *   2. Suggestion perdu (NRP + 5+ relances)
 *   3. Alerte lead non traite (assigned > 2h)
 *   4. Qualifier post-RDV (rdv_programme + RDV passe > 24h)
 *
 * + Recalcul lead_scores dirty toutes les 2h
 *
 * Anti-spam : 1 notif / contact / type / 24h
 * Source = 'automation' pour tracabilite V4
 */

import { db } from '../db/database.js';
import { createNotification } from '../routes/notifications.js';
import { computeAllDirtyScores } from '../services/leadScoring.js';

// Anti-spam cache : Map<"contactId:type", timestamp>
const _spamGuard = new Map();
const SPAM_COOLDOWN = 24 * 3600 * 1000; // 24h
const MAX_NOTIFS_PER_RUN = 20; // limiter volume global

function canNotify(contactId, type) {
  const key = contactId + ':' + type;
  const last = _spamGuard.get(key);
  if (last && Date.now() - last < SPAM_COOLDOWN) return false;
  _spamGuard.set(key, Date.now());
  return true;
}

// Nettoyage cache anti-spam (garder seulement les 24h recentes)
function cleanSpamGuard() {
  const cutoff = Date.now() - SPAM_COOLDOWN;
  for (const [key, ts] of _spamGuard) {
    if (ts < cutoff) _spamGuard.delete(key);
  }
}

function runSmartAutomations() {
  try {
    const companies = db.prepare('SELECT id FROM companies WHERE active = 1').all();
    let totalNotifs = 0;

    for (const company of companies) {
      const companyId = company.id;
      const now = new Date();
      const nowISO = now.toISOString();
      let companyNotifs = 0;

      // ─── 1. RELANCER CONTACT CHAUD ───
      // qualifie + lead_score > 70 + updatedAt > 3j
      try {
        const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();
        const hotContacts = db.prepare(
          "SELECT id, name, assignedTo, lead_score FROM contacts WHERE companyId = ? AND pipeline_stage = 'qualifie' AND lead_score > 70 AND updatedAt < ? AND updatedAt != '' LIMIT 5"
        ).all(companyId, threeDaysAgo);
        for (const ct of hotContacts) {
          if (companyNotifs >= MAX_NOTIFS_PER_RUN) break;
          if (!ct.assignedTo || !canNotify(ct.id, 'hot_lead')) continue;
          createNotification({
            companyId, collaboratorId: ct.assignedTo, type: 'smart_automation',
            title: 'Contact chaud a relancer', detail: `${ct.name} (score ${ct.lead_score}) est qualifie et inactif depuis 3j — forte conversion`,
            contactId: ct.id, contactName: ct.name
          });
          companyNotifs++;
        }
      } catch (e) { console.error('[SMART AUTO] Rule 1 error:', e.message); }

      // ─── 2. SUGGESTION PERDU (NRP 5+ relances) ───
      try {
        const nrpContacts = db.prepare(
          "SELECT id, name, assignedTo, nrp_followups_json FROM contacts WHERE companyId = ? AND pipeline_stage = 'nrp' LIMIT 20"
        ).all(companyId);
        for (const ct of nrpContacts) {
          if (companyNotifs >= MAX_NOTIFS_PER_RUN) break;
          try {
            const followups = JSON.parse(ct.nrp_followups_json || '[]');
            if (followups.length < 5) continue;
          } catch { continue; }
          if (!ct.assignedTo || !canNotify(ct.id, 'nrp_perdu')) continue;
          createNotification({
            companyId, collaboratorId: ct.assignedTo, type: 'smart_automation',
            title: 'Contact NRP — envisager Perdu ?', detail: `${ct.name} a 5+ relances sans reponse. Envisager de le passer en Perdu.`,
            contactId: ct.id, contactName: ct.name
          });
          companyNotifs++;
        }
      } catch (e) { console.error('[SMART AUTO] Rule 2 error:', e.message); }

      // ─── 3. ALERTE LEAD NON TRAITE (> 2h) ───
      try {
        const twoHoursAgo = new Date(now.getTime() - 2 * 3600000).toISOString();
        const stalLeads = db.prepare(
          "SELECT id, first_name, last_name, assigned_to, assigned_at FROM incoming_leads WHERE companyId = ? AND status = 'assigned' AND assigned_at < ? AND assigned_at != '' LIMIT 5"
        ).all(companyId, twoHoursAgo);
        // Notifier le manager (admin)
        const admin = db.prepare("SELECT id FROM collaborators WHERE companyId = ? AND role = 'admin' LIMIT 1").get(companyId);
        for (const lead of stalLeads) {
          if (companyNotifs >= MAX_NOTIFS_PER_RUN) break;
          if (!canNotify(lead.id, 'stale_lead')) continue;
          const targetId = admin?.id || lead.assigned_to;
          if (!targetId) continue;
          createNotification({
            companyId, collaboratorId: targetId, type: 'smart_automation',
            title: 'Lead non traite depuis 2h+', detail: `${lead.first_name || ''} ${lead.last_name || ''} est assigne mais non traite depuis plus de 2h.`,
            contactId: '', contactName: [lead.first_name, lead.last_name].filter(Boolean).join(' ')
          });
          companyNotifs++;
        }
      } catch (e) { console.error('[SMART AUTO] Rule 3 error:', e.message); }

      // ─── 4. QUALIFIER POST-RDV (> 24h) ───
      try {
        const yesterday = new Date(now.getTime() - 24 * 3600000).toISOString().slice(0, 10);
        const rdvPasse = db.prepare(
          "SELECT id, name, assignedTo, next_rdv_date FROM contacts WHERE companyId = ? AND pipeline_stage = 'rdv_programme' AND next_rdv_date != '' AND next_rdv_date < ? LIMIT 5"
        ).all(companyId, yesterday);
        for (const ct of rdvPasse) {
          if (companyNotifs >= MAX_NOTIFS_PER_RUN) break;
          if (!ct.assignedTo || !canNotify(ct.id, 'qualify_rdv')) continue;
          createNotification({
            companyId, collaboratorId: ct.assignedTo, type: 'smart_automation',
            title: 'RDV passe — a qualifier', detail: `Le RDV de ${ct.name} est passe depuis 24h+. Merci de qualifier ce contact.`,
            contactId: ct.id, contactName: ct.name
          });
          companyNotifs++;
        }
      } catch (e) { console.error('[SMART AUTO] Rule 4 error:', e.message); }

      totalNotifs += companyNotifs;
    }

    if (totalNotifs > 0) console.log(`[SMART AUTO] ${totalNotifs} notification(s) envoyee(s)`);
  } catch (err) {
    console.error('[SMART AUTO] Global error:', err.message);
  }
}

// ─── SCORING CRON (toutes les 2h) ───
let _lastScoreRun = 0;
function runScoringCron() {
  const now = Date.now();
  if (now - _lastScoreRun < 2 * 3600000) return; // Pas plus d'une fois toutes les 2h
  _lastScoreRun = now;
  try {
    const updated = computeAllDirtyScores();
    if (updated > 0) console.log(`[SCORING CRON] ${updated} contact(s) rescored`);
  } catch (e) { console.error('[SCORING CRON]', e.message); }
}

// ─── INIT ───
export function startSmartAutomations() {
  // Automations toutes les 30 min
  setInterval(() => {
    cleanSpamGuard();
    runSmartAutomations();
    runScoringCron();
  }, 30 * 60 * 1000);

  // Premier run apres 2 min (laisser le serveur demarrer)
  setTimeout(() => {
    runScoringCron();
    runSmartAutomations();
  }, 2 * 60 * 1000);

  console.log('\x1b[35m[CRON]\x1b[0m Smart automations + scoring scheduler started (every 30 min)');
}
