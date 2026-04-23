import cron from 'node-cron';
import { db, insert } from '../db/database.js';
import { computeGoalProgress, dispatchRewardLeads } from '../routes/goals.js';
import { createNotification } from '../routes/notifications.js';

console.log('\x1b[35m[CRON]\x1b[0m Lead dispatch scheduler started (every 5 min)');

cron.schedule('*/5 * * * *', () => {
  try { processAutoDispatch(); }
  catch (err) { console.error('[CRON LEAD DISPATCH ERROR]', err.message); }
  // Auto-check goal rewards every tick
  try { autoCheckGoalRewards(); }
  catch (err) { console.error('[CRON GOAL REWARDS ERROR]', err.message); }
  // Recycle lost leads (perdu > 7 days → back to envelope)
  try { recycleLostLeads(); }
  catch (err) { console.error('[CRON RECYCLE LOST ERROR]', err.message); }
});

// ─── RECYCLE LOST LEADS — Perdu > 7 jours → retour enveloppe ───
function recycleLostLeads() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  // Find contacts in "perdu" stage that have been there for 7+ days
  // We check pipeline_history for the date they entered "perdu"
  try {
    const lostContacts = db.prepare(`
      SELECT c.id, c.name, c.companyId, c.assignedTo, c.phone, c.email,
        (SELECT MAX(ph.createdAt) FROM pipeline_history ph WHERE ph.contactId = c.id AND ph.toStage = 'perdu') as lost_date
      FROM contacts c
      WHERE c.pipeline_stage = 'perdu'
    `).all();

    let recycled = 0;
    for (const ct of lostContacts) {
      if (!ct.lost_date || ct.lost_date > sevenDaysAgo) continue; // Not 7 days yet

      // Find the original lead assignment to get envelope_id
      const assignment = db.prepare('SELECT la.lead_id, il.envelope_id FROM lead_assignments la JOIN incoming_leads il ON il.id = la.lead_id WHERE la.contact_id = ? LIMIT 1').get(ct.id);

      if (assignment?.envelope_id) {
        // Reset the lead back to queued (available for re-dispatch)
        db.prepare("UPDATE incoming_leads SET status = 'queued', assigned_to = '', dispatched = 0, contact_id = '' WHERE id = ?").run(assignment.lead_id);
        // Remove the assignment
        db.prepare('DELETE FROM lead_assignments WHERE lead_id = ? AND contact_id = ?').run(assignment.lead_id, ct.id);
        // Archive the contact (keep in DB but mark as recycled)
        db.prepare("UPDATE contacts SET pipeline_stage = 'recycle', notes = notes || '\n[AUTO] Recycle apres 7j perdu — lead renvoye a l''enveloppe le ' || date('now') WHERE id = ?").run(ct.id);
        recycled++;
        console.log(`[RECYCLE] Lead ${ct.name} (${ct.id}) returned to envelope ${assignment.envelope_id}`);
      }
    }
    if (recycled > 0) console.log(`[CRON RECYCLE] ${recycled} lost leads recycled back to envelopes`);
  } catch (err) {
    // pipeline_history table might not exist — ignore
    if (!err.message.includes('no such table')) throw err;
  }
}

function processAutoDispatch() {
  const now = new Date();
  const nowISO = now.toISOString();

  const envelopes = db.prepare("SELECT * FROM lead_envelopes WHERE auto_dispatch = 1").all();

  for (const env of envelopes) {
    let shouldDispatch = false;

    // V6: configurable interval (dispatch_interval_minutes)
    const interval = env.dispatch_interval_minutes || 0;
    if (interval > 0 && env.last_dispatch_at) {
      const lastMs = new Date(env.last_dispatch_at).getTime();
      const elapsedMin = (now.getTime() - lastMs) / 60000;
      shouldDispatch = elapsedMin >= interval;
    } else if (interval > 0 && !env.last_dispatch_at) {
      // Never dispatched yet — dispatch now
      shouldDispatch = true;
    } else if (env.dispatch_type === 'hourly') {
      shouldDispatch = now.getMinutes() < 5;
    } else if (env.dispatch_type === 'daily') {
      const dispatchTime = env.dispatch_time || '09:00';
      const [h] = dispatchTime.split(':').map(Number);
      shouldDispatch = now.getHours() === h && now.getMinutes() < 5;
    }
    // V5-TIMING: Mode immediate — le cron dispatche aussi (fallback si import n'a pas tout pris)
    if (env.dispatch_type === 'immediate' || env.dispatch_type === 'on_import') {
      shouldDispatch = true;
    }
    // 'manual' is not processed by cron

    if (shouldDispatch) {
      try {
        dispatchEnvelope(env);
        // V6: update last_dispatch_at
        db.prepare("UPDATE lead_envelopes SET last_dispatch_at = ? WHERE id = ?").run(nowISO, env.id);
      }
      catch (err) { console.error(`[CRON DISPATCH] Error for envelope ${env.id}:`, err.message); }
    }
  }
}

// ─── AUTO-CHECK GOAL REWARDS ───
function autoCheckGoalRewards() {
  // Get all companies that have active goals
  const companies = db.prepare("SELECT DISTINCT companyId FROM user_goals WHERE status = 'active'").all();

  for (const { companyId } of companies) {
    const activeGoals = db.prepare("SELECT * FROM user_goals WHERE companyId = ? AND status = 'active'").all(companyId);

    const tx = db.transaction(() => {
      for (const goal of activeGoals) {
        // Recompute progress
        const current = computeGoalProgress(goal, companyId);
        db.prepare('UPDATE user_goals SET current_value = ? WHERE id = ?').run(current, goal.id);

        // Check if completed + has reward + not already rewarded
        if (current >= goal.target_value && goal.reward_leads > 0) {
          const existing = db.prepare('SELECT id FROM goal_rewards WHERE goal_id = ? AND goal_type = ?').get(goal.id, 'individual');
          if (existing) continue;

          // Mark completed
          db.prepare("UPDATE user_goals SET status = 'completed' WHERE id = ?").run(goal.id);

          // Dispatch reward leads — parse envelope IDs from goal
          let envelopeIds = [];
          try { envelopeIds = goal.envelope_ids_json ? JSON.parse(goal.envelope_ids_json) : []; }
          catch (e) { console.error('[CRON GOALS] Failed to parse envelope_ids_json for goal', goal.id, e.message); }
          const result = dispatchRewardLeads(companyId, goal.collaborator_id, goal.reward_leads, envelopeIds);

          // Create reward record
          const rewardId = 'gr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          insert('goal_rewards', {
            id: rewardId, companyId,
            goal_id: goal.id, goal_type: 'individual',
            collaborator_id: goal.collaborator_id,
            leads_awarded: result.dispatched,
            envelope_id: result.envelopeId,
            created_at: new Date().toISOString()
          });

          const collab = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(goal.collaborator_id);
          console.log(`\x1b[35m[CRON GOALS]\x1b[0m ${collab?.name || goal.collaborator_id}: goal "${goal.type}" completed → ${result.dispatched} leads awarded`);
        }
      }
    });
    tx();
  }
}

// V5-TIMING: Exportee pour etre appelee par les routes d'import en mode immediate
export function dispatchEnvelope(envelope) {
  // Skip if envelope has passed its end date
  if (envelope.dispatch_end_date) {
    const today = new Date().toISOString().slice(0, 10);
    if (today > envelope.dispatch_end_date) {
      console.log(`\x1b[35m[CRON DISPATCH]\x1b[0m Envelope "${envelope.name}" skipped — past dispatch_end_date (${envelope.dispatch_end_date})`);
      return;
    }
  }

  // V5-Fix: inclure les leads 'unassigned' sans assigned_to (desassignes en attente de redistribution)
  let leads = db.prepare("SELECT * FROM incoming_leads WHERE envelope_id = ? AND companyId = ? AND ((status IN ('new','queued') AND dispatched = 0) OR (status = 'unassigned' AND (assigned_to IS NULL OR assigned_to = ''))) ORDER BY created_at ASC")
    .all(envelope.id, envelope.companyId);

  // Filter by dispatch_start_date if set on envelope
  if (envelope.dispatch_start_date) {
    leads = leads.filter(l => l.created_at >= envelope.dispatch_start_date);
  }

  if (leads.length === 0) return;

  // Determine dispatch mode (default: percentage)
  const dispatchMode = envelope.dispatch_mode || 'percentage';

  let rules = db.prepare("SELECT * FROM lead_dispatch_rules WHERE envelope_id = ? AND companyId = ? AND active = 1 ORDER BY priority ASC")
    .all(envelope.id, envelope.companyId);

  // Wave D — exclure rules pointant vers un collab archivé (jamais dispatcher à un collab inactif)
  const archivedCollabs = new Set(
    db.prepare("SELECT id FROM collaborators WHERE companyId = ? AND archivedAt != ''").all(envelope.companyId).map(r => r.id)
  );
  const rulesBefore = rules.length;
  rules = rules.filter(r => !archivedCollabs.has(r.collaborator_id));
  if (rules.length !== rulesBefore) {
    console.warn(`[LEAD DISPATCH] envelope=${envelope.id} excluded ${rulesBefore - rules.length} rule(s) pointing to archived collabs`);
  }

  if (rules.length === 0) return;

  // Apply dispatch limit
  const leadsToProcess = envelope.dispatch_limit > 0 ? leads.slice(0, envelope.dispatch_limit) : leads;

  let quotas;

  if (dispatchMode === 'manual') {
    // Round-robin: equal distribution across all active rules
    const perCollab = Math.ceil(leadsToProcess.length / rules.length);
    quotas = rules.map(r => ({
      collaboratorId: r.collaborator_id, ruleId: r.id,
      target: perCollab, assigned: 0,
      last_rr_index: r.last_rr_index || 0
    }));
  } else {
    // 'percentage', 'ai', 'hybrid' — all use percentage-based distribution
    // (AI/hybrid real scoring runs from the manual trigger, cron falls back to percentage)
    const totalPct = rules.reduce((s, r) => s + r.percentage, 0);
    if (totalPct === 0) return;

    quotas = rules.map(r => ({
      collaboratorId: r.collaborator_id, ruleId: r.id,
      target: Math.max(1, Math.round(leadsToProcess.length * (r.percentage / totalPct))),
      assigned: 0
    }));
  }

  // Adjust targets to match exact lead count
  let totalTarget = quotas.reduce((s, q) => s + q.target, 0);
  while (totalTarget < leadsToProcess.length) { quotas[0].target++; totalTarget++; }
  while (totalTarget > leadsToProcess.length) {
    const maxQ = quotas.reduce((a, b) => a.target > b.target ? a : b);
    maxQ.target--; totalTarget--;
  }

  const now = new Date().toISOString();

  // V6: read persisted round-robin index from first rule
  let startIdx = 0;
  try {
    const firstRule = db.prepare("SELECT last_rr_index FROM lead_dispatch_rules WHERE envelope_id = ? AND companyId = ? AND active = 1 ORDER BY priority ASC LIMIT 1").get(envelope.id, envelope.companyId);
    if (firstRule) startIdx = (firstRule.last_rr_index || 0) % quotas.length;
  } catch {}

  const tx = db.transaction(() => {
    let qIdx = startIdx;
    let dispatched = 0;

    for (const lead of leadsToProcess) {
      let attempts = 0;
      while (quotas[qIdx].assigned >= quotas[qIdx].target && attempts < quotas.length) {
        qIdx = (qIdx + 1) % quotas.length;
        attempts++;
      }
      if (attempts >= quotas.length) break;

      const collabId = quotas[qIdx].collaboratorId;

      // Check duplicate
      let existingContact = null;
      if (lead.email) {
        existingContact = db.prepare("SELECT id FROM contacts WHERE companyId = ? AND email = ? AND email != ''").get(envelope.companyId, lead.email);
      }
      if (!existingContact && lead.phone) {
        existingContact = db.prepare("SELECT id FROM contacts WHERE companyId = ? AND phone = ? AND phone != ''").get(envelope.companyId, lead.phone);
      }

      let contactId;
      if (existingContact) {
        contactId = existingContact.id;
        db.prepare("UPDATE contacts SET assignedTo = ?, source = 'lead' WHERE id = ?").run(collabId, contactId);
      } else {
        contactId = 'ct' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const contactName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email || lead.phone || 'Lead';
        insert('contacts', {
          id: contactId, companyId: envelope.companyId,
          name: contactName, firstname: lead.first_name || '', lastname: lead.last_name || '',
          email: lead.email || '', phone: lead.phone || '',
          totalBookings: 0, lastVisit: '',
          tags_json: JSON.stringify(['lead']), notes: '', rating: null,
          docs_json: JSON.stringify([]), pipeline_stage: 'nouveau',
          assignedTo: collabId, shared_with_json: JSON.stringify([]),
          source: 'lead', envelopeId: envelope.id || '', createdAt: now
        });
      }

      const assignId = 'la_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      insert('lead_assignments', {
        id: assignId, companyId: envelope.companyId,
        lead_id: lead.id, collaborator_id: collabId,
        rule_id: quotas[qIdx].ruleId, contact_id: contactId,
        assigned_at: now
      });

      db.prepare("UPDATE incoming_leads SET status = 'assigned', assigned_to = ?, assigned_at = ?, contact_id = ?, dispatched = 1 WHERE id = ?")
        .run(collabId, now, contactId, lead.id);

      quotas[qIdx].assigned++;
      qIdx = (qIdx + 1) % quotas.length;
      dispatched++;
    }

    // V6: persist round-robin index for continuity between crons
    try {
      db.prepare("UPDATE lead_dispatch_rules SET last_rr_index = ? WHERE envelope_id = ? AND companyId = ? AND active = 1")
        .run(qIdx, envelope.id, envelope.companyId);
    } catch {}

    console.log(`\x1b[35m[CRON DISPATCH]\x1b[0m Envelope "${envelope.name}": ${dispatched} leads dispatched`);
    // V5-P1: Alerter si leads non-dispatches — SEULEMENT si c'est un vrai probleme
    // Ne PAS alerter si c'est juste le dispatch_limit qui fait son travail
    const missed = leads.length - dispatched;
    const isLimitedByBatch = envelope.dispatch_limit > 0 && dispatched >= envelope.dispatch_limit;
    if (missed > 0 && dispatched === 0) {
      // Aucun lead dispatche = vrai blocage (collabs satures ou erreur)
      console.warn(`\x1b[33m[CRON DISPATCH WARNING]\x1b[0m ${missed} lead(s) bloques pour "${envelope.name}" — aucun dispatch possible`);
      try {
        const admin = db.prepare("SELECT id FROM collaborators WHERE companyId = ? AND role = 'admin' LIMIT 1").get(envelope.companyId);
        if (admin) createNotification({ companyId: envelope.companyId, collaboratorId: admin.id, type: 'dispatch_warning', title: `Dispatch bloque : ${envelope.name}`, detail: `${missed} leads en attente mais aucun n'a pu etre distribue. Verifiez les collaborateurs.`, contactId: '', contactName: '' });
      } catch {}
    } else if (missed > 0 && !isLimitedByBatch) {
      // Dispatch partiel non lie au batch limit = collabs partiellement satures
      console.log(`\x1b[33m[CRON DISPATCH]\x1b[0m ${dispatched} dispatches, ${missed} restants pour "${envelope.name}"`);
    }
  });
  tx();
}
