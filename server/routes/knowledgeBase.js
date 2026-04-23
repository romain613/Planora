import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, requireAdmin, enforceCompany } from '../middleware/auth.js';

const router = Router();

// ═══════════════════════════════════════
// COMPANY KNOWLEDGE BASE (main settings)
// ═══════════════════════════════════════

// GET — Load knowledge base for a company
router.get('/:companyId', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId } = req.params;
    const kb = db.prepare('SELECT * FROM company_knowledge_base WHERE companyId = ?').get(companyId);
    const products = db.prepare('SELECT * FROM company_products WHERE companyId = ? ORDER BY createdAt DESC').all(companyId);
    const scripts = db.prepare('SELECT * FROM company_scripts WHERE companyId = ? ORDER BY createdAt DESC').all(companyId);
    const emailTemplates = db.prepare('SELECT * FROM company_email_templates WHERE companyId = ? ORDER BY createdAt DESC').all(companyId);
    const smsTemplates = db.prepare('SELECT * FROM company_sms_templates WHERE companyId = ? ORDER BY createdAt DESC').all(companyId);
    const documents = db.prepare('SELECT * FROM company_documents WHERE companyId = ? ORDER BY createdAt DESC').all(companyId);
    res.json({ kb: kb || null, products, scripts, emailTemplates, smsTemplates, documents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT — Upsert knowledge base main settings
router.put('/:companyId', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const { companyId } = req.params;
    const d = req.body;
    const existing = db.prepare('SELECT id FROM company_knowledge_base WHERE companyId = ?').get(companyId);
    if (existing) {
      const allowed = ['company_description','company_description_long','company_activity','target_audience','geographic_zone','languages_json','tone_style','formality_level','preferred_words_json','forbidden_words_json','commercial_style','support_style','sav_style','internal_processes_json','faq_json','offers_json'];
      const sets = [];
      const vals = [];
      for (const k of allowed) {
        if (d[k] !== undefined) { sets.push(`${k} = ?`); vals.push(d[k]); }
      }
      sets.push("updatedAt = datetime('now')");
      if (sets.length > 1) {
        db.prepare(`UPDATE company_knowledge_base SET ${sets.join(',')} WHERE companyId = ?`).run(...vals, companyId);
      }
      res.json({ success: true, id: existing.id });
    } else {
      const id = 'kb_' + Date.now();
      db.prepare(`INSERT INTO company_knowledge_base (id, companyId, company_description, company_description_long, company_activity, target_audience, geographic_zone, languages_json, tone_style, formality_level, preferred_words_json, forbidden_words_json, commercial_style, support_style, sav_style, internal_processes_json, faq_json, offers_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, companyId,
        d.company_description || '', d.company_description_long || '', d.company_activity || '',
        d.target_audience || '', d.geographic_zone || '', d.languages_json || '["fr"]',
        d.tone_style || 'professionnel', d.formality_level || 'standard',
        d.preferred_words_json || '[]', d.forbidden_words_json || '[]',
        d.commercial_style || '', d.support_style || '', d.sav_style || '',
        d.internal_processes_json || '[]', d.faq_json || '[]', d.offers_json || '[]'
      );
      res.json({ success: true, id });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// PRODUCTS & SERVICES
// ═══════════════════════════════════════

router.post('/:companyId/products', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const d = req.body;
    const id = d.id || 'prod_' + Date.now();
    db.prepare('INSERT INTO company_products (id, companyId, name, type, description, benefits_json, objections_json, objection_answers_json, pricing, use_cases_json) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      id, req.params.companyId, d.name || '', d.type || 'product', d.description || '',
      d.benefits_json || '[]', d.objections_json || '[]', d.objection_answers_json || '[]',
      d.pricing || '', d.use_cases_json || '[]'
    );
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:companyId/products/:id', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const d = req.body;
    const allowed = ['name','type','description','benefits_json','objections_json','objection_answers_json','pricing','use_cases_json'];
    const sets = []; const vals = [];
    for (const k of allowed) { if (d[k] !== undefined) { sets.push(`${k} = ?`); vals.push(d[k]); } }
    if (sets.length) db.prepare(`UPDATE company_products SET ${sets.join(',')} WHERE id = ? AND companyId = ?`).run(...vals, req.params.id, req.params.companyId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:companyId/products/:id', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    db.prepare('DELETE FROM company_products WHERE id = ? AND companyId = ?').run(req.params.id, req.params.companyId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════
// SCRIPTS
// ═══════════════════════════════════════

router.post('/:companyId/scripts', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const d = req.body;
    const id = d.id || 'scr_' + Date.now();
    db.prepare('INSERT INTO company_scripts (id, companyId, script_type, title, content, category) VALUES (?,?,?,?,?,?)').run(
      id, req.params.companyId, d.script_type || 'sales', d.title || '', d.content || '', d.category || 'commercial'
    );
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:companyId/scripts/:id', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const d = req.body;
    const allowed = ['script_type','title','content','category'];
    const sets = []; const vals = [];
    for (const k of allowed) { if (d[k] !== undefined) { sets.push(`${k} = ?`); vals.push(d[k]); } }
    if (sets.length) db.prepare(`UPDATE company_scripts SET ${sets.join(',')} WHERE id = ? AND companyId = ?`).run(...vals, req.params.id, req.params.companyId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:companyId/scripts/:id', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    db.prepare('DELETE FROM company_scripts WHERE id = ? AND companyId = ?').run(req.params.id, req.params.companyId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════
// EMAIL TEMPLATES
// ═══════════════════════════════════════

router.post('/:companyId/email-templates', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const d = req.body;
    const id = d.id || 'eml_' + Date.now();
    db.prepare('INSERT INTO company_email_templates (id, companyId, template_type, name, subject, body, variables_json) VALUES (?,?,?,?,?,?,?)').run(
      id, req.params.companyId, d.template_type || 'custom', d.name || '', d.subject || '', d.body || '', d.variables_json || '[]'
    );
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:companyId/email-templates/:id', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const d = req.body;
    const allowed = ['template_type','name','subject','body','variables_json'];
    const sets = []; const vals = [];
    for (const k of allowed) { if (d[k] !== undefined) { sets.push(`${k} = ?`); vals.push(d[k]); } }
    if (sets.length) db.prepare(`UPDATE company_email_templates SET ${sets.join(',')} WHERE id = ? AND companyId = ?`).run(...vals, req.params.id, req.params.companyId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:companyId/email-templates/:id', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    db.prepare('DELETE FROM company_email_templates WHERE id = ? AND companyId = ?').run(req.params.id, req.params.companyId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════
// SMS TEMPLATES
// ═══════════════════════════════════════

router.post('/:companyId/sms-templates', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const d = req.body;
    const id = d.id || 'sms_' + Date.now();
    db.prepare('INSERT INTO company_sms_templates (id, companyId, template_type, name, content) VALUES (?,?,?,?,?)').run(
      id, req.params.companyId, d.template_type || 'custom', d.name || '', d.content || ''
    );
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:companyId/sms-templates/:id', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const d = req.body;
    const allowed = ['template_type','name','content'];
    const sets = []; const vals = [];
    for (const k of allowed) { if (d[k] !== undefined) { sets.push(`${k} = ?`); vals.push(d[k]); } }
    if (sets.length) db.prepare(`UPDATE company_sms_templates SET ${sets.join(',')} WHERE id = ? AND companyId = ?`).run(...vals, req.params.id, req.params.companyId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:companyId/sms-templates/:id', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    db.prepare('DELETE FROM company_sms_templates WHERE id = ? AND companyId = ?').run(req.params.id, req.params.companyId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════
// DOCUMENTS & LINKS
// ═══════════════════════════════════════

router.post('/:companyId/documents', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const d = req.body;
    const id = d.id || 'doc_' + Date.now();
    db.prepare('INSERT INTO company_documents (id, companyId, title, doc_type, file_url, link_url, description) VALUES (?,?,?,?,?,?,?)').run(
      id, req.params.companyId, d.title || '', d.doc_type || 'link', d.file_url || '', d.link_url || '', d.description || ''
    );
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:companyId/documents/:id', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const d = req.body;
    const allowed = ['title','doc_type','file_url','link_url','description'];
    const sets = []; const vals = [];
    for (const k of allowed) { if (d[k] !== undefined) { sets.push(`${k} = ?`); vals.push(d[k]); } }
    if (sets.length) db.prepare(`UPDATE company_documents SET ${sets.join(',')} WHERE id = ? AND companyId = ?`).run(...vals, req.params.id, req.params.companyId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:companyId/documents/:id', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    db.prepare('DELETE FROM company_documents WHERE id = ? AND companyId = ?').run(req.params.id, req.params.companyId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
