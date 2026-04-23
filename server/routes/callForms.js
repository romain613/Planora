import { Router } from 'express';
import { db, getByCompany, getById, insert, update, remove } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// ─── GET /api/call-forms?companyId=xxx ─── List call forms
router.get('/', requireAuth, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const rows = getByCompany('call_forms', companyId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/call-forms/my?collaboratorId=xxx ─── Active forms assigned to collaborator
router.get('/my', requireAuth, (req, res) => {
  try {
    const { collaboratorId } = req.query;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    const rows = db.prepare(
      `SELECT * FROM call_forms WHERE active = 1 AND companyId = ? AND assignedCollabs_json LIKE ?`
    ).all(req.auth.companyId, `%${collaboratorId}%`);
    // Parse JSON fields + strip _json suffix (coherent avec getByCompany/parseRow)
    const parsed = rows.map(r => {
      try { r.fields = JSON.parse(r.fields_json); } catch { r.fields = []; }
      try { r.assignedCollabs = JSON.parse(r.assignedCollabs_json); } catch { r.assignedCollabs = []; }
      // Garder aussi les noms _json pour compatibilite
      r.fields_json = r.fields;
      r.assignedCollabs_json = r.assignedCollabs;
      return r;
    });
    // Filter to only forms truly assigned (not just partial string match)
    const filtered = parsed.filter(f => {
      const collabs = Array.isArray(f.assignedCollabs) ? f.assignedCollabs : [];
      return collabs.length === 0 || collabs.includes(collaboratorId);
    });
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/call-forms ─── Create a call form
router.post('/', requireAuth, (req, res) => {
  try {
    const f = req.body;
    const id = f.id || 'cf_' + Date.now();
    const now = new Date().toISOString();
    insert('call_forms', {
      id,
      companyId: req.auth.companyId,
      name: f.name || 'Sans nom',
      description: f.description || '',
      fields_json: JSON.stringify(f.fields || []),
      assignedCollabs_json: JSON.stringify(f.assignedCollabs || []),
      active: f.active !== false ? 1 : 0,
      responseCount: 0,
      createdAt: now,
    });
    const created = getById('call_forms', id);
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/call-forms/:id ─── Update a call form
router.put('/:id', requireAuth, (req, res) => {
  try {
    const existing = getById('call_forms', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Call form not found' });
    if (!req.auth.isSupra && existing.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const f = req.body;
    const updates = {};
    if (f.name !== undefined) updates.name = f.name;
    if (f.description !== undefined) updates.description = f.description;
    if (f.fields !== undefined) updates.fields_json = JSON.stringify(f.fields);
    else if (f.fields_json !== undefined) updates.fields_json = typeof f.fields_json === 'string' ? f.fields_json : JSON.stringify(f.fields_json);
    if (f.assignedCollabs !== undefined) updates.assignedCollabs_json = JSON.stringify(f.assignedCollabs);
    else if (f.assignedCollabs_json !== undefined) updates.assignedCollabs_json = typeof f.assignedCollabs_json === 'string' ? f.assignedCollabs_json : JSON.stringify(f.assignedCollabs_json);
    if (f.active !== undefined) updates.active = f.active ? 1 : 0;
    update('call_forms', req.params.id, updates);
    const updated = getById('call_forms', req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/call-forms/:id ─── Delete form + all its responses
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const existing = getById('call_forms', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Call form not found' });
    if (!req.auth.isSupra && existing.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    db.prepare('DELETE FROM call_form_responses WHERE formId = ?').run(req.params.id);
    remove('call_forms', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/call-forms/:id/respond ─── Submit a response
router.post('/:id/respond', requireAuth, (req, res) => {
  try {
    const form = getById('call_forms', req.params.id);
    if (!form) return res.status(404).json({ error: 'Call form not found' });
    const { contactId, collaboratorId, data, callLogId } = req.body;
    if (!contactId || !collaboratorId) {
      return res.status(400).json({ error: 'contactId and collaboratorId required' });
    }
    // Forcer companyId depuis auth (jamais de fallback 'c1')
    const safeCompanyId = req.auth.isSupra ? (req.body.companyId || req.auth.companyId) : req.auth.companyId;
    const id = 'cfr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const now = new Date().toISOString();
    insert('call_form_responses', {
      id,
      formId: req.params.id,
      companyId: safeCompanyId,
      contactId,
      collaboratorId,
      data_json: JSON.stringify(data || {}),
      callLogId: callLogId || '',
      createdAt: now,
    });
    // Increment responseCount
    db.prepare('UPDATE call_forms SET responseCount = responseCount + 1 WHERE id = ?').run(req.params.id);
    const created = getById('call_form_responses', id);
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/call-forms/:id/responses ─── List responses for a form
router.get('/:id/responses', requireAuth, (req, res) => {
  try {
    // Vérifier que le form appartient à la company du user
    const form = db.prepare('SELECT companyId FROM call_forms WHERE id = ?').get(req.params.id);
    if (!form) return res.status(404).json({ error: 'Form not found' });
    if (!req.auth.isSupra && form.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    const rows = db.prepare(`
      SELECT cfr.*, c.name AS contactName, c.phone AS contactPhone, c.email AS contactEmail
      FROM call_form_responses cfr
      LEFT JOIN contacts c ON c.id = cfr.contactId
      WHERE cfr.formId = ?
      ORDER BY cfr.createdAt DESC
    `).all(req.params.id);
    const parsed = rows.map(r => {
      try { r.data_json = JSON.parse(r.data_json); } catch {}
      return r;
    });
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/call-forms/contact/:contactId ─── All responses for a contact
router.get('/contact/:contactId', requireAuth, (req, res) => {
  try {
    // Vérifier que le contact appartient à la company du user
    const contact = db.prepare('SELECT companyId FROM contacts WHERE id = ?').get(req.params.contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (!req.auth.isSupra && contact.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    const rows = db.prepare(`
      SELECT cfr.*, cf.name AS formName
      FROM call_form_responses cfr
      LEFT JOIN call_forms cf ON cf.id = cfr.formId
      WHERE cfr.contactId = ?
      ORDER BY cfr.createdAt DESC
    `).all(req.params.contactId);
    const parsed = rows.map(r => {
      try { r.data = JSON.parse(r.data_json); } catch { r.data = {}; }
      r.data_json = r.data;
      return r;
    });
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
