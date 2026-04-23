import { Router } from 'express';
import db from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// ─── GET context for a specific call ───
router.get('/call/:callLogId', requireAuth, (req, res) => {
  try {
    const ctx = db.prepare('SELECT * FROM call_contexts WHERE callLogId = ?').get(req.params.callLogId);
    if (ctx && !req.auth.isSupra && ctx.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    const actions = db.prepare('SELECT * FROM recommended_actions WHERE callLogId = ? ORDER BY createdAt DESC').all(req.params.callLogId);
    res.json({ context: ctx || null, actions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET contexts for a collaborator (recent) ───
router.get('/recent', requireAuth, enforceCompany, (req, res) => {
  try {
    // SECURITE: forcer companyId depuis session (jamais query params)
    const companyId = req.auth.companyId;
    const limit = parseInt(req.query.limit) || 20;
    // Non-admin : forcer ses propres contexts
    const safeCollabId = (!req.auth.isSupra && !req.auth.isAdmin) ? req.auth.collaboratorId : (req.query.collaboratorId || req.auth.collaboratorId);
    const contexts = db.prepare('SELECT * FROM call_contexts WHERE companyId = ? AND collaboratorId = ? ORDER BY createdAt DESC LIMIT ?').all(companyId, safeCollabId, limit);
    res.json(contexts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CREATE / UPDATE call context ───
router.post('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const d = req.body;
    // Forcer companyId depuis auth
    const safeCompanyId = req.auth.isSupra ? (d.companyId || req.auth.companyId) : req.auth.companyId;
    const existing = d.callLogId ? db.prepare('SELECT id, companyId FROM call_contexts WHERE callLogId = ?').get(d.callLogId) : null;

    if (existing) {
      // Vérifier ownership avant update
      if (!req.auth.isSupra && existing.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
      const allowed = ['call_origin','call_type','call_goal','target_type','campaign_name','lead_source','priority_level','client_status','deal_stage','service_requested','free_note','tags_json','contactId','conversationId'];
      const sets = ["updatedAt = datetime('now')"];
      const vals = [];
      for (const k of allowed) { if (d[k] !== undefined) { sets.push(`${k} = ?`); vals.push(d[k]); } }
      db.prepare(`UPDATE call_contexts SET ${sets.join(',')} WHERE id = ?`).run(...vals, existing.id);
      res.json({ success: true, id: existing.id, updated: true });
    } else {
      const id = 'ctx_' + Date.now();
      db.prepare(`INSERT INTO call_contexts (id, companyId, collaboratorId, callLogId, conversationId, contactId, call_origin, call_type, call_goal, target_type, campaign_name, lead_source, priority_level, client_status, deal_stage, service_requested, free_note, tags_json, auto_detected) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, safeCompanyId, d.collaboratorId || req.auth.collaboratorId, d.callLogId || null, d.conversationId || null, d.contactId || null,
        d.call_origin || 'outgoing', d.call_type || 'sales', d.call_goal || 'qualify_lead', d.target_type || 'prospect',
        d.campaign_name || '', d.lead_source || '', d.priority_level || 'normal',
        d.client_status || '', d.deal_stage || '', d.service_requested || '',
        d.free_note || '', d.tags_json || '[]', d.auto_detected || 0
      );
      res.json({ success: true, id, created: true });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── AUTO-DETECT context from available data ───
router.post('/auto-detect', requireAuth, enforceCompany, (req, res) => {
  try {
    const { contactId, direction } = req.body;
    const safeCompanyId = req.auth.isSupra ? (req.body.companyId || req.auth.companyId) : req.auth.companyId;
    const safeCollabId = req.body.collaboratorId || req.auth.collaboratorId;

    let call_origin = direction === 'inbound' ? 'incoming' : 'outgoing';
    let call_type = 'sales';
    let call_goal = 'qualify_lead';
    let target_type = 'prospect';
    let client_status = '';
    let deal_stage = '';

    // Auto-detect from contact data — scoped to company
    if (contactId) {
      const contact = db.prepare('SELECT pipeline_stage, tags_json, notes FROM contacts WHERE id = ? AND companyId = ?').get(contactId, safeCompanyId);
      if (contact) {
        const stage = contact.pipeline_stage || 'nouveau';
        if (['gagne','client'].includes(stage)) { target_type = 'client'; call_origin = direction === 'inbound' ? 'existing_client' : 'follow_up'; }
        else if (stage === 'perdu') { target_type = 'old_client'; call_type = 'retention'; }
        else if (stage === 'proposition') { call_type = 'closing'; call_goal = 'close_deal'; }
        else if (stage === 'en_cours') { call_type = 'follow_up'; call_goal = 'qualify_lead'; }
        deal_stage = stage;
        client_status = stage;

        try {
          const tags = JSON.parse(contact.tags_json || '[]');
          if (tags.some(t => ['SAV','sav','support'].includes(t))) { call_type = 'sav'; call_goal = 'solve_problem'; call_origin = 'sav'; }
          if (tags.some(t => ['VIP','vip','premium'].includes(t))) { target_type = 'premium'; }
        } catch {}
      }
    }

    // Load collaborator defaults — scoped to company
    const collab = db.prepare('SELECT ai_call_type_default, ai_call_goal_default, ai_target_default FROM collaborators WHERE id = ? AND companyId = ?').get(safeCollabId, safeCompanyId);
    if (collab) {
      if (collab.ai_call_type_default && call_type === 'sales') call_type = collab.ai_call_type_default;
      if (collab.ai_call_goal_default && call_goal === 'qualify_lead') call_goal = collab.ai_call_goal_default;
      if (collab.ai_target_default && target_type === 'prospect') target_type = collab.ai_target_default;
    }

    res.json({
      call_origin, call_type, call_goal, target_type,
      client_status, deal_stage,
      auto_detected: true
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════
// RECOMMENDED ACTIONS
// ═══════════════════════════════════════

// ─── GET actions for a call ───
router.get('/actions/:callLogId', requireAuth, (req, res) => {
  try {
    const actions = db.prepare('SELECT * FROM recommended_actions WHERE callLogId = ? ORDER BY createdAt DESC').all(req.params.callLogId);
    // Vérifier ownership via la première action ou le call_context
    if (actions.length > 0 && !req.auth.isSupra && actions[0].companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    res.json(actions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CREATE action ───
router.post('/actions', requireAuth, enforceCompany, (req, res) => {
  try {
    const d = req.body;
    const safeCompanyId = req.auth.isSupra ? (d.companyId || req.auth.companyId) : req.auth.companyId;
    const id = d.id || 'act_' + Date.now();
    db.prepare('INSERT INTO recommended_actions (id, companyId, collaboratorId, callLogId, conversationId, contactId, action_type, action_label, action_payload_json, status, generated_content, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
      id, safeCompanyId, d.collaboratorId || req.auth.collaboratorId, d.callLogId || null, d.conversationId || null, d.contactId || null,
      d.action_type, d.action_label || '', d.action_payload_json || '{}',
      d.status || 'pending', d.generated_content || '', d.source || 'ai'
    );
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── UPDATE action status ───
router.put('/actions/:id', requireAuth, (req, res) => {
  try {
    const action = db.prepare('SELECT companyId FROM recommended_actions WHERE id = ?').get(req.params.id);
    if (!action) return res.status(404).json({ error: 'Action not found' });
    if (!req.auth.isSupra && action.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    const { status } = req.body;
    if (status) db.prepare('UPDATE recommended_actions SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DELETE action ───
router.delete('/actions/:id', requireAuth, (req, res) => {
  try {
    const action = db.prepare('SELECT companyId FROM recommended_actions WHERE id = ?').get(req.params.id);
    if (!action) return res.status(404).json({ error: 'Action not found' });
    if (!req.auth.isSupra && action.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    db.prepare('DELETE FROM recommended_actions WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
