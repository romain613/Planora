import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/contact-fields?companyId=X
router.get('/', requireAuth, (req, res) => {
  try {
    const companyId = req.query.companyId || req.auth.companyId;
    if (!req.auth.isSupra && companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const rows = db.prepare('SELECT * FROM contact_field_definitions WHERE companyId = ? ORDER BY position ASC, createdAt ASC').all(companyId);
    // Parse options_json
    const parsed = rows.map(r => {
      try { r.options = JSON.parse(r.options_json || '[]'); } catch { r.options = []; }
      return r;
    });
    res.json(parsed);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Normalize fieldKey from label
function normalizeFieldKey(label) {
  return (label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// POST /api/contact-fields
router.post('/', requireAuth, (req, res) => {
  try {
    const { companyId, label, fieldKey, fieldType, options, required, position, scope } = req.body;
    const cid = companyId || req.auth.companyId;
    if (!req.auth.isSupra && cid !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    if (!label) return res.status(400).json({ error: 'label requis' });

    const key = fieldKey || normalizeFieldKey(label);

    // Dedup: si un champ avec le même fieldKey existe déjà → retourner l'existant
    const existing = db.prepare('SELECT id, fieldKey, label, fieldType FROM contact_field_definitions WHERE companyId = ? AND fieldKey = ?').get(cid, key);
    if (existing) return res.json({ success: true, id: existing.id, fieldKey: existing.fieldKey, existing: true });

    const finalScope = scope || 'company';
    const id = 'cfd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO contact_field_definitions (id, companyId, label, fieldKey, fieldType, options_json, required, position, scope, createdBy, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, cid, label, key, fieldType || 'text', JSON.stringify(options || []),
      required ? 1 : 0, position || 0, finalScope, req.auth.collaboratorId || '', now
    );
    res.json({ success: true, id, fieldKey: key });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/contact-fields/ensure-batch — create missing fields, return all
router.post('/ensure-batch', requireAuth, (req, res) => {
  try {
    const { fields } = req.body; // [{label, fieldType}]
    const cid = req.auth.companyId;
    if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields array requis' });

    const results = [];
    const skipped = [];
    const now = new Date().toISOString();
    for (const f of fields) {
      if (!f.label || !f.label.trim()) { skipped.push({ label: f.label || '', reason: 'Label vide' }); continue; }
      const key = normalizeFieldKey(f.label);
      if (!key) { skipped.push({ label: f.label, reason: 'Clé normalisée vide' }); continue; }
      const existing = db.prepare('SELECT id, fieldKey, label, fieldType FROM contact_field_definitions WHERE companyId = ? AND fieldKey = ?').get(cid, key);
      if (existing) {
        results.push({ fieldKey: existing.fieldKey, label: existing.label, fieldType: existing.fieldType, existing: true });
      } else {
        const id = 'cfd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        db.prepare(`INSERT INTO contact_field_definitions (id, companyId, label, fieldKey, fieldType, options_json, required, position, scope, createdBy, createdAt)
          VALUES (?, ?, ?, ?, ?, '[]', 0, 0, 'company', ?, ?)`).run(id, cid, f.label, key, f.fieldType || 'text', req.auth.collaboratorId || '', now);
        results.push({ fieldKey: key, label: f.label, fieldType: f.fieldType || 'text', existing: false, id });
      }
    }
    res.json({ success: true, fields: results, created: results.filter(r => !r.existing).length, skipped });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/contact-fields/:id
router.put('/:id', requireAuth, (req, res) => {
  try {
    const def = db.prepare('SELECT * FROM contact_field_definitions WHERE id = ?').get(req.params.id);
    if (!def) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && def.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    // Collab can only edit their own collab-scope fields
    if (def.scope === 'collab' && def.createdBy !== req.auth.collaboratorId && !req.auth.isSupra) {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    const { label, fieldType, options, required, position } = req.body;
    const sets = [];
    const vals = [];
    if (label !== undefined) { sets.push('label = ?'); vals.push(label); }
    if (fieldType !== undefined) { sets.push('fieldType = ?'); vals.push(fieldType); }
    if (options !== undefined) { sets.push('options_json = ?'); vals.push(JSON.stringify(options)); }
    if (required !== undefined) { sets.push('required = ?'); vals.push(required ? 1 : 0); }
    if (position !== undefined) { sets.push('position = ?'); vals.push(position); }

    if (sets.length > 0) {
      vals.push(req.params.id);
      db.prepare(`UPDATE contact_field_definitions SET ${sets.join(',')} WHERE id = ?`).run(...vals);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/contact-fields/:id
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const def = db.prepare('SELECT * FROM contact_field_definitions WHERE id = ?').get(req.params.id);
    if (!def) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && def.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    if (def.scope === 'collab' && def.createdBy !== req.auth.collaboratorId && !req.auth.isSupra) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    db.prepare('DELETE FROM contact_field_definitions WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/contact-fields/reorder
router.post('/reorder', requireAuth, (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array requis' });
    const stmt = db.prepare('UPDATE contact_field_definitions SET position = ? WHERE id = ? AND companyId = ?');
    ids.forEach((id, i) => stmt.run(i, id, req.auth.companyId));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
