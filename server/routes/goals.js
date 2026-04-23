import { Router } from 'express';
import { db, insert, remove, parseRow } from '../db/database.js';
import { requireAuth, requireAdmin, enforceCompany } from '../middleware/auth.js';

const router = Router();

// ─── USER GOALS ───
router.get('/user', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { companyId, collaborator_id, status } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    let sql = 'SELECT * FROM user_goals WHERE companyId = ?';
    const params = [companyId];
    if (collaborator_id) { sql += ' AND collaborator_id = ?'; params.push(collaborator_id); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    const rows = db.prepare(sql).all(...params);
    const enriched = rows.map(g => {
      const collab = db.prepare('SELECT name, color FROM collaborators WHERE id = ?').get(g.collaborator_id);
      return { ...g, collaborator_name: collab?.name || 'Inconnu', collaborator_color: collab?.color || '#64748B' };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/user', requireAdmin, enforceCompany, (req, res) => {
  try {
    const g = req.body;
    if (!g.companyId || !g.collaborator_id) return res.status(400).json({ error: 'companyId et collaborator_id requis' });
    const id = 'ug_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    insert('user_goals', {
      id, companyId: g.companyId, collaborator_id: g.collaborator_id,
      type: g.type || 'calls',
      target_value: g.target_value || 0,
      current_value: g.current_value || 0,
      period: g.period || 'monthly',
      period_start: g.period_start || new Date().toISOString().split('T')[0],
      period_end: g.period_end || '',
      reward_leads: g.reward_leads || 0,
      envelope_ids_json: JSON.stringify(g.envelope_ids || g.envelope_ids_json || []),
      status: 'active',
      created_at: new Date().toISOString()
    });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/user/:id', requireAdmin, (req, res) => {
  try {
    const record = db.prepare('SELECT companyId FROM user_goals WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && record.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const data = { ...req.body };
    delete data.id;
    if (data.envelope_ids) { data.envelope_ids_json = JSON.stringify(data.envelope_ids); delete data.envelope_ids; }
    const sets = Object.keys(data).map(k => `${k} = ?`).join(',');
    db.prepare(`UPDATE user_goals SET ${sets} WHERE id = ?`).run(...Object.values(data), req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/user/:id', requireAdmin, (req, res) => {
  try {
    const record = db.prepare('SELECT companyId FROM user_goals WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && record.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    remove('user_goals', req.params.id); res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── TEAM GOALS ───
router.get('/team', requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const rows = db.prepare('SELECT * FROM team_goals WHERE companyId = ? ORDER BY created_at DESC').all(companyId);
    res.json(rows.map(r => parseRow('team_goals', r)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/team', requireAdmin, enforceCompany, (req, res) => {
  try {
    const g = req.body;
    if (!g.companyId) return res.status(400).json({ error: 'companyId requis' });
    const id = 'tg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    insert('team_goals', {
      id, companyId: g.companyId,
      collaborators_json: JSON.stringify(g.collaborators || []),
      goal_type: g.goal_type || 'calls',
      goal_value: g.goal_value || 0,
      current_value: g.current_value || 0,
      period: g.period || 'monthly',
      period_start: g.period_start || new Date().toISOString().split('T')[0],
      period_end: g.period_end || '',
      reward_leads: g.reward_leads || 0,
      envelope_ids_json: JSON.stringify(g.envelope_ids || g.envelope_ids_json || []),
      status: 'active',
      created_at: new Date().toISOString()
    });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/team/:id', requireAdmin, enforceCompany, (req, res) => {
  try {
    const safeCompanyId = req.auth?.companyId || req.companyId;
    // Ownership check : vérifier que le team_goal appartient à cette company
    const existing = db.prepare('SELECT companyId FROM team_goals WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Objectif non trouvé' });
    if (existing.companyId !== safeCompanyId && !req.auth?.isSupra) return res.status(403).json({ error: 'Accès refusé' });
    const data = { ...req.body };
    if (data.collaborators) { data.collaborators_json = JSON.stringify(data.collaborators); delete data.collaborators; }
    if (data.envelope_ids) { data.envelope_ids_json = JSON.stringify(data.envelope_ids); delete data.envelope_ids; }
    delete data.id; delete data.companyId;
    const sets = Object.keys(data).map(k => `${k} = ?`).join(',');
    db.prepare(`UPDATE team_goals SET ${sets} WHERE id = ?`).run(...Object.values(data), req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/team/:id', requireAdmin, enforceCompany, (req, res) => {
  try {
    const safeCompanyId = req.auth?.companyId || req.companyId;
    const existing = db.prepare('SELECT companyId FROM team_goals WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Objectif non trouvé' });
    if (existing.companyId !== safeCompanyId && !req.auth?.isSupra) return res.status(403).json({ error: 'Accès refusé' });
    remove('team_goals', req.params.id); res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── REWARDS ───
router.get('/rewards', requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const rows = db.prepare('SELECT * FROM goal_rewards WHERE companyId = ? ORDER BY created_at DESC LIMIT 200').all(companyId);
    const enriched = rows.map(r => {
      const collab = db.prepare('SELECT name, color FROM collaborators WHERE id = ?').get(r.collaborator_id);
      return { ...r, collaborator_name: collab?.name || 'Inconnu', collaborator_color: collab?.color || '#64748B' };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/rewards', requireAdmin, enforceCompany, (req, res) => {
  try {
    const r = req.body;
    if (!r.companyId) return res.status(400).json({ error: 'companyId requis' });
    const id = 'gr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    insert('goal_rewards', {
      id, companyId: r.companyId,
      goal_id: r.goal_id, goal_type: r.goal_type || 'individual',
      collaborator_id: r.collaborator_id,
      leads_awarded: r.leads_awarded || 0,
      envelope_id: r.envelope_id || null,
      created_at: new Date().toISOString()
    });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PROGRESS COMPUTATION ───
router.get('/progress', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { companyId, collaborator_id } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    // Get all active goals
    let sql = 'SELECT * FROM user_goals WHERE companyId = ? AND status = ?';
    const params = [companyId, 'active'];
    if (collaborator_id) { sql += ' AND collaborator_id = ?'; params.push(collaborator_id); }
    const goals = db.prepare(sql).all(...params);

    const results = goals.map(goal => {
      const current = computeGoalProgress(goal, companyId);
      db.prepare('UPDATE user_goals SET current_value = ? WHERE id = ?').run(current, goal.id);

      const collab = db.prepare('SELECT name, color FROM collaborators WHERE id = ?').get(goal.collaborator_id);
      const pct = goal.target_value > 0 ? Math.min(100, Math.round(current / goal.target_value * 100)) : 0;

      return {
        ...goal,
        current_value: current,
        percentage: pct,
        completed: current >= goal.target_value,
        collaborator_name: collab?.name || 'Inconnu',
        collaborator_color: collab?.color || '#64748B'
      };
    });

    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── HELPER: compute progress for a single goal ───
function computeGoalProgress(goal, companyId) {
  let current = 0;
  const start = goal.period_start;
  const end = goal.period_end || new Date().toISOString().split('T')[0];
  try {
    switch (goal.type) {
      case 'calls':
        try { current = db.prepare('SELECT COUNT(*) as cnt FROM call_logs WHERE collaboratorId = ? AND companyId = ? AND createdAt >= ? AND createdAt <= ?').get(goal.collaborator_id, companyId, start, end + 'T23:59:59')?.cnt || 0; } catch { current = 0; }
        break;
      case 'sales':
        try { current = db.prepare("SELECT COUNT(*) as cnt FROM contacts WHERE assignedTo = ? AND companyId = ? AND pipeline_stage = 'client_valide' AND createdAt >= ?").get(goal.collaborator_id, companyId, start)?.cnt || 0; } catch { current = 0; }
        break;
      case 'appointments':
        try { current = db.prepare("SELECT COUNT(*) as cnt FROM bookings WHERE collaboratorId = ? AND date >= ? AND date <= ? AND status = 'confirmed'").get(goal.collaborator_id, start, end)?.cnt || 0; } catch { current = 0; }
        break;
      case 'sms':
        try { current = db.prepare("SELECT COUNT(*) as cnt FROM sms_messages WHERE collaboratorId = ? AND companyId = ? AND direction = 'outbound' AND createdAt >= ?").get(goal.collaborator_id, companyId, start)?.cnt || 0; } catch { current = 0; }
        break;
      case 'revenue':
        try { current = db.prepare("SELECT COALESCE(SUM(c.price), 0) as total FROM bookings b JOIN calendars c ON b.calendarId = c.id WHERE b.collaboratorId = ? AND c.companyId = ? AND b.date >= ? AND b.date <= ? AND b.status = 'confirmed'").get(goal.collaborator_id, companyId, start, end)?.total || 0; } catch { current = 0; }
        break;
      case 'emails':
        try {
          current = db.prepare("SELECT COUNT(*) as cnt FROM user_activity_logs WHERE collaborator_id = ? AND companyId = ? AND action_type = 'email_sent' AND created_at >= ? AND created_at <= ?")
            .get(goal.collaborator_id, companyId, start, end + 'T23:59:59')?.cnt || 0;
        } catch { current = 0; }
        break;
      case 'nrp_callbacks':
        try {
          // Count calls made to contacts that were in NRP stage
          current = db.prepare("SELECT COUNT(DISTINCT cl.id) as cnt FROM call_logs cl INNER JOIN contacts c ON c.phone = cl.toNumber AND c.companyId = cl.companyId WHERE cl.collaboratorId = ? AND cl.companyId = ? AND c.pipeline_stage != 'nrp' AND cl.createdAt >= ? AND cl.createdAt <= ?")
            .get(goal.collaborator_id, companyId, start, end + 'T23:59:59')?.cnt || 0;
        } catch { current = 0; }
        break;
      case 'contacts_recalled':
        try {
          // Count calls to existing contacts (any stage)
          current = db.prepare("SELECT COUNT(DISTINCT cl.id) as cnt FROM call_logs cl INNER JOIN contacts c ON c.phone = cl.toNumber AND c.companyId = cl.companyId WHERE cl.collaboratorId = ? AND cl.companyId = ? AND cl.createdAt >= ? AND cl.createdAt <= ?")
            .get(goal.collaborator_id, companyId, start, end + 'T23:59:59')?.cnt || 0;
        } catch { current = 0; }
        break;
      case 'contracts':
        try {
          current = db.prepare("SELECT COUNT(*) as cnt FROM contacts WHERE assignedTo = ? AND companyId = ? AND pipeline_stage = 'client_valide' AND createdAt >= ?")
            .get(goal.collaborator_id, companyId, start)?.cnt || 0;
        } catch { current = 0; }
        break;
      default:
        current = goal.current_value || 0;
    }
  } catch { current = goal.current_value || 0; }
  return current;
}

// ─── HELPER: dispatch reward leads to a collaborator ───
function dispatchRewardLeads(companyId, collaboratorId, leadsCount, envelopeIds = []) {
  // Ensure envelopeIds is always an array
  if (!Array.isArray(envelopeIds)) { try { envelopeIds = JSON.parse(envelopeIds || '[]'); } catch { envelopeIds = []; } }
  if (!Array.isArray(envelopeIds)) envelopeIds = [];
  const dispatched = [];
  // Find envelope with most available leads for this company (optionally filtered)
  let envelopes;
  if (envelopeIds.length > 0) {
    const placeholders = envelopeIds.map(() => '?').join(',');
    envelopes = db.prepare(`SELECT e.id, e.name, COUNT(l.id) as available FROM lead_envelopes e LEFT JOIN incoming_leads l ON l.envelope_id = e.id AND l.companyId = e.companyId AND l.status IN ('new','queued') AND l.dispatched = 0 WHERE e.companyId = ? AND e.id IN (${placeholders}) GROUP BY e.id ORDER BY available DESC`).all(companyId, ...envelopeIds);
  } else {
    envelopes = db.prepare("SELECT e.id, e.name, COUNT(l.id) as available FROM lead_envelopes e LEFT JOIN incoming_leads l ON l.envelope_id = e.id AND l.companyId = e.companyId AND l.status IN ('new','queued') AND l.dispatched = 0 WHERE e.companyId = ? GROUP BY e.id ORDER BY available DESC").all(companyId);
  }

  let remaining = leadsCount;
  let usedEnvelopeId = null;

  for (const env of envelopes) {
    if (remaining <= 0 || env.available === 0) continue;
    const leads = db.prepare("SELECT * FROM incoming_leads WHERE envelope_id = ? AND companyId = ? AND status IN ('new','queued') AND dispatched = 0 ORDER BY created_at ASC LIMIT ?").all(env.id, companyId, remaining);

    const now = new Date().toISOString();
    for (const lead of leads) {
      // Check duplicate contact
      let existingContact = null;
      if (lead.email) existingContact = db.prepare("SELECT id FROM contacts WHERE companyId = ? AND email = ? AND email != ''").get(companyId, lead.email);
      if (!existingContact && lead.phone) existingContact = db.prepare("SELECT id FROM contacts WHERE companyId = ? AND phone = ? AND phone != ''").get(companyId, lead.phone);

      let contactId;
      if (existingContact) {
        contactId = existingContact.id;
        db.prepare("UPDATE contacts SET assignedTo = ?, source = 'lead' WHERE id = ?").run(collaboratorId, contactId);
      } else {
        contactId = 'ct' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const contactName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email || lead.phone || 'Lead';
        let extraData = {}; try { extraData = JSON.parse(lead.data_json || '{}'); } catch {}
        insert('contacts', {
          id: contactId, companyId,
          name: contactName, firstname: lead.first_name || '', lastname: lead.last_name || '',
          email: lead.email || '', phone: lead.phone || '',
          totalBookings: 0, lastVisit: '',
          tags_json: JSON.stringify(['lead', 'reward']),
          notes: extraData.notes || extraData.message || '',
          rating: null, docs_json: JSON.stringify([]),
          pipeline_stage: 'nouveau', assignedTo: collaboratorId,
          shared_with_json: JSON.stringify([]),
          source: 'goal_reward', envelopeId: env.id || '', createdAt: now
        });
      }

      const assignId = 'la_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      insert('lead_assignments', {
        id: assignId, companyId,
        lead_id: lead.id, collaborator_id: collaboratorId,
        rule_id: 'goal_reward', contact_id: contactId,
        assigned_at: now
      });

      db.prepare("UPDATE incoming_leads SET status = 'assigned', assigned_to = ?, assigned_at = ?, contact_id = ?, dispatched = 1 WHERE id = ?").run(collaboratorId, now, contactId, lead.id);
      dispatched.push({ leadId: lead.id, contactId });
      remaining--;
      if (!usedEnvelopeId) usedEnvelopeId = env.id;
    }
  }

  if (remaining > 0) console.log(`\x1b[33m[GOALS]\x1b[0m Warning: only ${leadsCount - remaining}/${leadsCount} reward leads available for collab ${collaboratorId}`);
  return { dispatched: dispatched.length, envelopeId: usedEnvelopeId };
}

// ─── CHECK & AWARD REWARDS ───
router.post('/check-rewards', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    // Recompute progress for all active goals before checking
    const activeGoals = db.prepare("SELECT * FROM user_goals WHERE companyId = ? AND status = 'active'").all(companyId);
    for (const goal of activeGoals) {
      const current = computeGoalProgress(goal, companyId);
      db.prepare('UPDATE user_goals SET current_value = ? WHERE id = ?').run(current, goal.id);
      goal.current_value = current;
    }

    const awarded = [];

    const tx = db.transaction(() => {
      for (const goal of activeGoals) {
        if (goal.current_value >= goal.target_value && goal.reward_leads > 0) {
          // Check if already rewarded
          const existing = db.prepare('SELECT id FROM goal_rewards WHERE goal_id = ? AND goal_type = ?').get(goal.id, 'individual');
          if (existing) continue;

          // Mark goal as completed
          db.prepare("UPDATE user_goals SET status = 'completed' WHERE id = ?").run(goal.id);

          // Actually dispatch reward leads to the collaborator (with envelope filter if configured)
          let envelopeIds = [];
          try { envelopeIds = JSON.parse(goal.envelope_ids_json || '[]'); } catch {}
          const result = dispatchRewardLeads(companyId, goal.collaborator_id, goal.reward_leads, envelopeIds);

          // Create reward record with real envelope_id
          const rewardId = 'gr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          insert('goal_rewards', {
            id: rewardId, companyId,
            goal_id: goal.id, goal_type: 'individual',
            collaborator_id: goal.collaborator_id,
            leads_awarded: result.dispatched,
            envelope_id: result.envelopeId,
            created_at: new Date().toISOString()
          });

          awarded.push({
            goalId: goal.id,
            collaboratorId: goal.collaborator_id,
            type: goal.type,
            leadsAwarded: result.dispatched,
            leadsRequested: goal.reward_leads,
            envelopeId: result.envelopeId
          });
        }
      }
    });
    tx();

    res.json({ success: true, awarded });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SYNC DAILY GOAL (auto-create/update from phone settings) ───
router.post('/sync-daily', requireAuth, (req, res) => {
  try {
    // SECURITE: forcer companyId et collaboratorId depuis la session (jamais du body)
    const companyId = req.auth.companyId;
    const collaboratorId = req.auth.collaboratorId;
    const { target } = req.body;
    if (!target) return res.status(400).json({ error: 'target requis' });

    const today = new Date().toISOString().split('T')[0];
    // Find existing daily calls goal for this collab
    const existing = db.prepare("SELECT id FROM user_goals WHERE companyId = ? AND collaborator_id = ? AND type = 'calls' AND period = 'daily' AND status = 'active'").get(companyId, collaboratorId);

    if (existing) {
      // Update target
      db.prepare("UPDATE user_goals SET target_value = ?, period_start = ? WHERE id = ?").run(target, today, existing.id);
      res.json({ success: true, action: 'updated', goalId: existing.id });
    } else {
      // Create new daily calls goal with default 5 leads reward
      const goalId = 'ug_daily_' + collaboratorId + '_' + Date.now();
      insert('user_goals', {
        id: goalId,
        companyId,
        collaborator_id: collaboratorId,
        type: 'calls',
        target_value: target,
        current_value: 0,
        period: 'daily',
        period_start: today,
        period_end: '',
        reward_leads: 5,
        status: 'active',
        envelope_ids_json: '[]'
      });
      res.json({ success: true, action: 'created', goalId });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MY PROGRESS (for collaborators, not admin-only) ───
router.get('/my-progress', requireAuth, (req, res) => {
  try {
    const collabId = req.auth?.collaboratorId;
    const companyId = req.auth?.companyId || req.query.companyId;
    if (!collabId || !companyId) return res.status(400).json({ error: 'Auth requise' });

    // Individual goals
    const goals = db.prepare("SELECT * FROM user_goals WHERE companyId = ? AND collaborator_id = ?").all(companyId, collabId);
    const myGoals = goals.map(goal => {
      const current = computeGoalProgress(goal, companyId);
      db.prepare('UPDATE user_goals SET current_value = ? WHERE id = ?').run(current, goal.id);
      const pct = goal.target_value > 0 ? Math.min(100, Math.round(current / goal.target_value * 100)) : 0;
      return { ...goal, current_value: current, percentage: pct, completed: current >= goal.target_value };
    });

    // Team goals where this collab is a member
    const allTeam = db.prepare("SELECT * FROM team_goals WHERE companyId = ?").all(companyId);
    const myTeamGoals = allTeam.filter(tg => {
      try { return JSON.parse(tg.collaborators_json || '[]').includes(collabId); } catch { return false; }
    });

    // My rewards
    const myRewards = db.prepare("SELECT * FROM goal_rewards WHERE companyId = ? AND collaborator_id = ? ORDER BY created_at DESC").all(companyId, collabId);

    res.json({ myGoals, myTeamGoals, myRewards });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── STATS ───
router.get('/stats', requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    const activeGoals = db.prepare("SELECT COUNT(*) as cnt FROM user_goals WHERE companyId = ? AND status = 'active'").get(companyId)?.cnt || 0;
    const completedGoals = db.prepare("SELECT COUNT(*) as cnt FROM user_goals WHERE companyId = ? AND status = 'completed'").get(companyId)?.cnt || 0;
    const totalGoals = activeGoals + completedGoals;
    const completionRate = totalGoals > 0 ? Math.round(completedGoals / totalGoals * 100) : 0;

    const activeTeamGoals = db.prepare("SELECT COUNT(*) as cnt FROM team_goals WHERE companyId = ? AND status = 'active'").get(companyId)?.cnt || 0;
    const completedTeamGoals = db.prepare("SELECT COUNT(*) as cnt FROM team_goals WHERE companyId = ? AND status = 'completed'").get(companyId)?.cnt || 0;

    const totalRewards = db.prepare('SELECT COALESCE(SUM(leads_awarded), 0) as total FROM goal_rewards WHERE companyId = ?').get(companyId)?.total || 0;

    // Top performers (most goals completed)
    const topPerformers = db.prepare(`
      SELECT ug.collaborator_id, c.name, c.color,
        SUM(CASE WHEN ug.status = 'completed' THEN 1 ELSE 0 END) as completed,
        COUNT(*) as total
      FROM user_goals ug
      LEFT JOIN collaborators c ON ug.collaborator_id = c.id
      WHERE ug.companyId = ?
      GROUP BY ug.collaborator_id
      ORDER BY completed DESC
      LIMIT 10
    `).all(companyId);

    res.json({
      activeGoals, completedGoals, completionRate,
      activeTeamGoals, completedTeamGoals,
      totalRewards,
      topPerformers: topPerformers.map(p => ({
        ...p,
        completionRate: p.total > 0 ? Math.round(p.completed / p.total * 100) : 0
      }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
export { computeGoalProgress, dispatchRewardLeads };
