// V1.11 Phase 3 — Backend interaction_templates + interaction_responses
// Source de vérité produit : docs/product-rules-interaction-templates-v1.md (figé 2026-04-29)
// 14 endpoints CRUD + duplicate + toggle-default + complete + export CSV
import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, requireAdmin, enforceCompany } from '../middleware/auth.js';

const templatesRouter = Router();
const responsesRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isAdminOrSupra(req) {
  const role = req.auth?.role || '';
  return role === 'admin' || role === 'supra';
}

const ALLOWED_TYPES = new Set(['script', 'questionnaire', 'checklist']);
const ALLOWED_SCOPES = new Set(['personal', 'company']);

function validateContentJson(type, content) {
  if (!content || typeof content !== 'object') return { ok: false, error: 'content_json must be object' };
  if (type === 'script') {
    if (content.steps !== undefined && !Array.isArray(content.steps)) return { ok: false, error: 'script.steps must be array' };
    if (content.objections !== undefined && !Array.isArray(content.objections)) return { ok: false, error: 'script.objections must be array' };
    if (content.keyPhrases !== undefined && !Array.isArray(content.keyPhrases)) return { ok: false, error: 'script.keyPhrases must be array' };
    return { ok: true };
  }
  if (type === 'questionnaire') {
    if (!Array.isArray(content.fields)) return { ok: false, error: 'questionnaire.fields must be array' };
    const allowedFieldTypes = new Set(['text', 'textarea', 'yesno', 'single', 'multiple', 'date', 'number', 'url']);
    for (const f of content.fields) {
      if (!f || typeof f !== 'object') return { ok: false, error: 'invalid field' };
      if (!allowedFieldTypes.has(f.type)) return { ok: false, error: `field.type invalid: ${f.type}` };
      if ((f.type === 'single' || f.type === 'multiple') && !Array.isArray(f.options)) return { ok: false, error: `field.options required for ${f.type}` };
    }
    return { ok: true };
  }
  if (type === 'checklist') {
    if (!Array.isArray(content.items)) return { ok: false, error: 'checklist.items must be array' };
    return { ok: true };
  }
  return { ok: false, error: 'unknown type' };
}

function logAuditInteraction(companyId, action, entityId, detail, req, metadata) {
  try {
    const id = uid('aud');
    db.prepare(
      `INSERT INTO audit_logs (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, ipAddress, userAgent, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, companyId || '',
      req.auth?.userId || '',
      req.auth?.name || '',
      req.auth?.role || '',
      action, 'interaction', 'interaction', entityId, detail || '',
      JSON.stringify(metadata || {}), '', '',
      new Date().toISOString()
    );
  } catch (e) { console.error('[V1.11 AUDIT]', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════
// TEMPLATES — 7 endpoints sur /api/interaction-templates
// ═══════════════════════════════════════════════════════════════════════

// GET /api/interaction-templates
//   Query: ?type=script|questionnaire|checklist&scope=personal|company|all
//   Liste templates accessibles : tous company + personnels du caller
templatesRouter.get('/', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const collabId = req.auth?.collaboratorId || '';
    const { type, scope } = req.query;
    const filters = ['companyId = ?', 'active = 1'];
    const params = [companyId];
    if (type && ALLOWED_TYPES.has(type)) { filters.push('type = ?'); params.push(type); }
    if (scope === 'personal') {
      filters.push("scope = 'personal' AND createdByCollaboratorId = ?");
      params.push(collabId);
    } else if (scope === 'company') {
      filters.push("scope = 'company'");
    } else {
      // scope=all (default) : tous company + personnels du caller (admin voit tout)
      if (!isAdminOrSupra(req)) {
        filters.push("(scope = 'company' OR (scope = 'personal' AND createdByCollaboratorId = ?))");
        params.push(collabId);
      }
    }
    const sql = `SELECT * FROM interaction_templates WHERE ${filters.join(' AND ')} ORDER BY updatedAt DESC`;
    const rows = db.prepare(sql).all(...params);
    const enriched = rows.map(r => {
      let content = {};
      try { content = JSON.parse(r.content_json || '{}'); } catch {}
      const responseCount = db.prepare('SELECT COUNT(*) AS n FROM interaction_responses WHERE templateId = ? AND companyId = ?').get(r.id, companyId).n;
      return { ...r, showByDefault: !!r.showByDefault, active: !!r.active, content, responseCount };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/interaction-templates
//   body: { type, title, description?, scope?, showByDefault?, content_json? }
templatesRouter.post('/', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const collabId = req.auth?.collaboratorId || '';
    const { type, title, description = '', scope = 'personal', showByDefault = 0, content_json = {} } = req.body;
    if (!type || !ALLOWED_TYPES.has(type)) return res.status(400).json({ error: 'type required (script|questionnaire|checklist)' });
    if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
    if (!ALLOWED_SCOPES.has(scope)) return res.status(400).json({ error: 'scope invalid' });
    if (scope === 'company' && !isAdminOrSupra(req)) return res.status(403).json({ error: 'admin_required_for_company_scope' });
    const validation = validateContentJson(type, content_json);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const id = uid('itpl');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO interaction_templates (id, companyId, createdByCollaboratorId, type, title, description, scope, showByDefault, content_json, active, version, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,1,1,?,?)`
    ).run(id, companyId, collabId, type, title.trim(), description, scope, showByDefault ? 1 : 0, JSON.stringify(content_json), now, now);

    logAuditInteraction(companyId, 'interaction_template_created', id, `Template ${type} créé`, req, { type, scope, title });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/interaction-templates/:id
templatesRouter.get('/:id', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    const collabId = req.auth?.collaboratorId || '';
    const t = db.prepare('SELECT * FROM interaction_templates WHERE id = ? AND companyId = ?').get(req.params.id, companyId);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (t.scope === 'personal' && t.createdByCollaboratorId !== collabId && !isAdminOrSupra(req)) {
      return res.status(403).json({ error: 'forbidden_personal_template' });
    }
    let content = {};
    try { content = JSON.parse(t.content_json || '{}'); } catch {}
    const responseCount = db.prepare('SELECT COUNT(*) AS n FROM interaction_responses WHERE templateId = ? AND companyId = ?').get(t.id, companyId).n;
    res.json({ ...t, showByDefault: !!t.showByDefault, active: !!t.active, content, responseCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/interaction-templates/:id
//   body: { title?, description?, showByDefault?, content_json? }
//   scope/type immuables. company scope → admin only.
templatesRouter.put('/:id', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    const collabId = req.auth?.collaboratorId || '';
    const t = db.prepare('SELECT * FROM interaction_templates WHERE id = ? AND companyId = ?').get(req.params.id, companyId);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (t.scope === 'company' && !isAdminOrSupra(req)) return res.status(403).json({ error: 'admin_required' });
    if (t.scope === 'personal' && t.createdByCollaboratorId !== collabId && !isAdminOrSupra(req)) {
      return res.status(403).json({ error: 'forbidden_personal_template' });
    }
    const { title, description, showByDefault, content_json } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push('title = ?'); params.push(String(title).trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(String(description)); }
    if (showByDefault !== undefined) { updates.push('showByDefault = ?'); params.push(showByDefault ? 1 : 0); }
    if (content_json !== undefined) {
      const validation = validateContentJson(t.type, content_json);
      if (!validation.ok) return res.status(400).json({ error: validation.error });
      updates.push('content_json = ?'); params.push(JSON.stringify(content_json));
    }
    if (updates.length === 0) return res.status(400).json({ error: 'no_changes' });
    updates.push('updatedAt = ?'); params.push(new Date().toISOString());
    params.push(t.id);
    db.prepare(`UPDATE interaction_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    logAuditInteraction(companyId, 'interaction_template_updated', t.id, 'Template mis à jour', req, { fields: Object.keys(req.body) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/interaction-templates/:id
//   Soft delete (active=0) si responses rattachées, sinon hard delete.
templatesRouter.delete('/:id', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    const collabId = req.auth?.collaboratorId || '';
    const t = db.prepare('SELECT * FROM interaction_templates WHERE id = ? AND companyId = ?').get(req.params.id, companyId);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (t.scope === 'company' && !isAdminOrSupra(req)) return res.status(403).json({ error: 'admin_required' });
    if (t.scope === 'personal' && t.createdByCollaboratorId !== collabId && !isAdminOrSupra(req)) {
      return res.status(403).json({ error: 'forbidden_personal_template' });
    }
    const responseCount = db.prepare('SELECT COUNT(*) AS n FROM interaction_responses WHERE templateId = ? AND companyId = ?').get(t.id, companyId).n;
    let mode;
    if (responseCount > 0) {
      db.prepare('UPDATE interaction_templates SET active = 0, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), t.id);
      mode = 'soft';
    } else {
      db.prepare('DELETE FROM interaction_templates WHERE id = ? AND companyId = ?').run(t.id, companyId);
      mode = 'hard';
    }
    logAuditInteraction(companyId, 'interaction_template_deleted', t.id, `Template supprimé (${mode})`, req, { mode, responseCount });
    res.json({ success: true, mode, responseCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/interaction-templates/:id/duplicate
//   Duplique vers personal du caller. Toujours autorisé.
templatesRouter.post('/:id/duplicate', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    const collabId = req.auth?.collaboratorId || '';
    if (!collabId) return res.status(400).json({ error: 'collaboratorId required' });
    const t = db.prepare('SELECT * FROM interaction_templates WHERE id = ? AND companyId = ?').get(req.params.id, companyId);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (t.scope === 'personal' && t.createdByCollaboratorId !== collabId && !isAdminOrSupra(req)) {
      return res.status(403).json({ error: 'forbidden_personal_template' });
    }
    const newId = uid('itpl');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO interaction_templates (id, companyId, createdByCollaboratorId, type, title, description, scope, showByDefault, content_json, active, version, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)`
    ).run(newId, companyId, collabId, t.type, `${t.title} (copie)`, t.description || '', 'personal', 0, t.content_json || '{}', t.version || 1, now, now);
    logAuditInteraction(companyId, 'interaction_template_duplicated', newId, `Duplication depuis ${t.id}`, req, { sourceId: t.id });
    res.json({ success: true, id: newId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/interaction-templates/:id/toggle-default
//   Toggle showByDefault. Limite 5 par scope. Owner ou admin.
templatesRouter.post('/:id/toggle-default', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    const collabId = req.auth?.collaboratorId || '';
    const t = db.prepare('SELECT * FROM interaction_templates WHERE id = ? AND companyId = ?').get(req.params.id, companyId);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (t.scope === 'company' && !isAdminOrSupra(req)) return res.status(403).json({ error: 'admin_required' });
    if (t.scope === 'personal' && t.createdByCollaboratorId !== collabId && !isAdminOrSupra(req)) {
      return res.status(403).json({ error: 'forbidden_personal_template' });
    }
    const newVal = t.showByDefault ? 0 : 1;
    if (newVal === 1) {
      // Limite 5 par scope (UX)
      const params = [companyId, t.scope];
      let countSql = "SELECT COUNT(*) AS n FROM interaction_templates WHERE companyId = ? AND scope = ? AND showByDefault = 1 AND active = 1";
      if (t.scope === 'personal') {
        countSql += ' AND createdByCollaboratorId = ?';
        params.push(t.createdByCollaboratorId);
      }
      const count = db.prepare(countSql).get(...params).n;
      if (count >= 5) return res.status(409).json({ error: 'too_many_default_templates', limit: 5, current: count });
    }
    db.prepare('UPDATE interaction_templates SET showByDefault = ?, updatedAt = ? WHERE id = ?').run(newVal, new Date().toISOString(), t.id);
    logAuditInteraction(companyId, 'interaction_template_toggle_default', t.id, `showByDefault → ${newVal}`, req, { newVal });
    res.json({ success: true, showByDefault: !!newVal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
// RESPONSES — 7 endpoints sur /api/interaction-responses
// ═══════════════════════════════════════════════════════════════════════

// GET /api/interaction-responses/by-contact/:contactId
//   Liste toutes les responses d'un contact (scope companyId strict).
responsesRouter.get('/by-contact/:contactId', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND companyId = ?').get(req.params.contactId, companyId);
    if (!contact) return res.status(404).json({ error: 'contact_not_found' });
    const rows = db.prepare(
      `SELECT r.*, t.title AS templateTitle, t.type AS templateType_current, c.name AS collabName
       FROM interaction_responses r
       LEFT JOIN interaction_templates t ON t.id = r.templateId
       LEFT JOIN collaborators c ON c.id = r.collaboratorId
       WHERE r.contactId = ? AND r.companyId = ?
       ORDER BY r.updatedAt DESC`
    ).all(req.params.contactId, companyId);
    const enriched = rows.map(r => {
      let answers = {};
      try { answers = JSON.parse(r.answers_json || '{}'); } catch {}
      return { ...r, answers, collabName: r.collabName || '', templateTitle: r.templateTitle || '(template supprimé)' };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/interaction-responses/export
//   CSV export — filtres ?templateId, ?collaboratorId, ?from, ?to (ISO dates)
//   ATTENTION : route définie AVANT /:id pour éviter conflit de matching.
responsesRouter.get('/export', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const { templateId, collaboratorId, from, to } = req.query;
    const filters = ['r.companyId = ?'];
    const params = [companyId];
    if (templateId) { filters.push('r.templateId = ?'); params.push(templateId); }
    if (collaboratorId) { filters.push('r.collaboratorId = ?'); params.push(collaboratorId); }
    if (from) { filters.push('r.createdAt >= ?'); params.push(from); }
    if (to) { filters.push('r.createdAt <= ?'); params.push(to); }
    const rows = db.prepare(
      `SELECT r.id, r.templateId, r.templateType, r.contactId, r.collaboratorId, r.status, r.callLogId,
              r.completedAt, r.createdAt, r.updatedAt, r.answers_json,
              t.title AS templateTitle,
              ct.name AS contactName, ct.email AS contactEmail, ct.phone AS contactPhone,
              col.name AS collabName
       FROM interaction_responses r
       LEFT JOIN interaction_templates t ON t.id = r.templateId
       LEFT JOIN contacts ct ON ct.id = r.contactId
       LEFT JOIN collaborators col ON col.id = r.collaboratorId
       WHERE ${filters.join(' AND ')}
       ORDER BY r.createdAt DESC
       LIMIT 5000`
    ).all(...params);

    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const headers = ['responseId', 'templateId', 'templateTitle', 'templateType', 'contactId', 'contactName', 'contactEmail', 'contactPhone', 'collabId', 'collabName', 'status', 'callLogId', 'createdAt', 'completedAt', 'answers'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        r.id, r.templateId, r.templateTitle || '', r.templateType, r.contactId, r.contactName || '',
        r.contactEmail || '', r.contactPhone || '', r.collaboratorId, r.collabName || '',
        r.status, r.callLogId || '', r.createdAt, r.completedAt || '', r.answers_json
      ].map(escape).join(','));
    }
    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="interaction-responses-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/interaction-responses/by-contact/:contactId
//   body: { templateId, callLogId? }
//   Crée une réponse 'draft' (UNIQUE constraint évite doublons triplet).
responsesRouter.post('/by-contact/:contactId', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const collabId = req.auth?.collaboratorId || '';
    if (!collabId) return res.status(400).json({ error: 'collaboratorId required' });
    const { templateId, callLogId = '' } = req.body;
    if (!templateId) return res.status(400).json({ error: 'templateId required' });
    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND companyId = ?').get(req.params.contactId, companyId);
    if (!contact) return res.status(404).json({ error: 'contact_not_found' });
    const t = db.prepare('SELECT id, type, scope, active FROM interaction_templates WHERE id = ? AND companyId = ? AND active = 1').get(templateId, companyId);
    if (!t) return res.status(404).json({ error: 'template_not_found_or_inactive' });

    // Vérif unicité — si réponse existante : retourner l'id existant (idempotent)
    const existing = db.prepare('SELECT id FROM interaction_responses WHERE templateId = ? AND contactId = ? AND collaboratorId = ?').get(templateId, contact.id, collabId);
    if (existing) return res.json({ success: true, id: existing.id, existed: true });

    const id = uid('iresp');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO interaction_responses (id, companyId, templateId, templateType, contactId, collaboratorId, status, answers_json, callLogId, completedAt, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, companyId, templateId, t.type, contact.id, collabId, 'draft', '{}', callLogId, '', now, now);
    res.json({ success: true, id, existed: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/interaction-responses/:id
//   body: { answers, callLogId? }
//   Update answers (autosave). Owner ou admin uniquement.
//   Modification post-completed autorisée pour owner/admin (audit).
responsesRouter.put('/:id', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    const collabId = req.auth?.collaboratorId || '';
    const r = db.prepare('SELECT * FROM interaction_responses WHERE id = ? AND companyId = ?').get(req.params.id, companyId);
    if (!r) return res.status(404).json({ error: 'not_found' });
    if (r.collaboratorId !== collabId && !isAdminOrSupra(req)) return res.status(403).json({ error: 'forbidden' });
    const { answers, callLogId } = req.body;
    if (answers === undefined && callLogId === undefined) return res.status(400).json({ error: 'no_changes' });
    const updates = [];
    const params = [];
    if (answers !== undefined) {
      if (typeof answers !== 'object') return res.status(400).json({ error: 'answers must be object' });
      updates.push('answers_json = ?'); params.push(JSON.stringify(answers));
    }
    if (callLogId !== undefined) { updates.push('callLogId = ?'); params.push(String(callLogId || '')); }
    updates.push('updatedAt = ?'); params.push(new Date().toISOString());
    params.push(r.id);
    db.prepare(`UPDATE interaction_responses SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    if (r.status === 'completed') {
      logAuditInteraction(companyId, 'interaction_response_modified_post_completed', r.id, 'Réponse modifiée après completion', req, { templateId: r.templateId });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/interaction-responses/:id/complete
//   Transition draft → completed. Owner ou admin.
responsesRouter.post('/:id/complete', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    const collabId = req.auth?.collaboratorId || '';
    const r = db.prepare('SELECT * FROM interaction_responses WHERE id = ? AND companyId = ?').get(req.params.id, companyId);
    if (!r) return res.status(404).json({ error: 'not_found' });
    if (r.collaboratorId !== collabId && !isAdminOrSupra(req)) return res.status(403).json({ error: 'forbidden' });
    if (r.status === 'completed') return res.json({ success: true, alreadyCompleted: true });
    const now = new Date().toISOString();
    db.prepare("UPDATE interaction_responses SET status = 'completed', completedAt = ?, updatedAt = ? WHERE id = ?").run(now, now, r.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/interaction-responses/:id
//   Admin only avec audit.
responsesRouter.delete('/:id', requireAuth, (req, res) => {
  try {
    if (!isAdminOrSupra(req)) return res.status(403).json({ error: 'admin_required' });
    const companyId = req.auth?.companyId;
    const r = db.prepare('SELECT * FROM interaction_responses WHERE id = ? AND companyId = ?').get(req.params.id, companyId);
    if (!r) return res.status(404).json({ error: 'not_found' });
    db.prepare('DELETE FROM interaction_responses WHERE id = ? AND companyId = ?').run(r.id, companyId);
    logAuditInteraction(companyId, 'interaction_response_deleted', r.id, 'Réponse supprimée', req, { templateId: r.templateId, contactId: r.contactId });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/interaction-responses/:id (catch-all après /export et /by-contact/:id)
responsesRouter.get('/:id', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    const collabId = req.auth?.collaboratorId || '';
    const r = db.prepare('SELECT * FROM interaction_responses WHERE id = ? AND companyId = ?').get(req.params.id, companyId);
    if (!r) return res.status(404).json({ error: 'not_found' });
    // Visibilité : owner du contact + collab qui a rempli + admin
    const contact = db.prepare('SELECT assignedTo FROM contacts WHERE id = ? AND companyId = ?').get(r.contactId, companyId);
    const isOwner = contact && contact.assignedTo === collabId;
    const isFiller = r.collaboratorId === collabId;
    if (!isOwner && !isFiller && !isAdminOrSupra(req)) return res.status(403).json({ error: 'forbidden' });
    let answers = {};
    try { answers = JSON.parse(r.answers_json || '{}'); } catch {}
    res.json({ ...r, answers });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export { templatesRouter, responsesRouter };
