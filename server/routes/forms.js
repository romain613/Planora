import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { db, getByCompany, getById, insert, update, remove } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// ─── GET /api/forms?companyId=xxx ─── List company forms
router.get('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth?.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const rows = getByCompany('forms', companyId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/forms/:id ─── Single form detail
router.get('/:id', (req, res) => {
  try {
    const form = getById('forms', req.params.id);
    if (!form) return res.status(404).json({ error: 'Form not found' });
    res.json(form);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/forms ─── Create a form
router.post('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const f = req.body;
    const companyId = req.auth?.companyId || f.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const id = f.id || 'form_' + Date.now();
    const now = new Date().toISOString();
    const slug = f.slug || f.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || id;
    insert('forms', {
      id,
      companyId,
      name: f.name || 'Sans nom',
      slug,
      description: f.description || '',
      fields_json: JSON.stringify(f.fields || []),
      settings_json: JSON.stringify(f.settings || {}),
      calendarId: f.calendarId || null,
      templateId: f.templateId || null,
      active: f.active !== false ? 1 : 0,
      color: f.color || '#2563EB',
      submissionCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    const created = getById('forms', id);
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/forms/:id ─── Update form
router.put('/:id', requireAuth, enforceCompany, (req, res) => {
  try {
    // SECURITY: verify form belongs to user's company
    const existing = db.prepare('SELECT companyId FROM forms WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Formulaire introuvable' });
    if (!req.auth.isSupra && existing.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const f = req.body;
    const data = {};
    if ('name' in f) data.name = f.name;
    if ('slug' in f) data.slug = f.slug;
    if ('description' in f) data.description = f.description;
    if ('fields' in f) data.fields_json = JSON.stringify(f.fields);
    if ('settings' in f) data.settings_json = JSON.stringify(f.settings);
    if ('calendarId' in f) data.calendarId = f.calendarId;
    if ('active' in f) data.active = f.active ? 1 : 0;
    if ('color' in f) data.color = f.color;
    data.updatedAt = new Date().toISOString();
    const updated = update('forms', req.params.id, data);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/forms/:id ─── Delete form + its submissions
router.delete('/:id', requireAuth, enforceCompany, (req, res) => {
  try {
    // SECURITY: verify form belongs to user's company
    const existing = db.prepare('SELECT companyId FROM forms WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Formulaire introuvable' });
    if (!req.auth.isSupra && existing.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    db.prepare('DELETE FROM form_submissions WHERE formId = ?').run(req.params.id);
    remove('forms', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/forms/:id/submissions ─── List submissions
router.get('/:id/submissions', requireAuth, enforceCompany, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM form_submissions WHERE formId = ? ORDER BY createdAt DESC').all(req.params.id);
    // Parse JSON
    const parsed = rows.map(r => {
      try { r.data = JSON.parse(r.data_json || '{}'); } catch { r.data = {}; }
      delete r.data_json;
      return r;
    });
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/forms/:id/submit ─── Public form submission
router.post('/:id/submit', (req, res) => {
  try {
    const form = getById('forms', req.params.id);
    if (!form) return res.status(404).json({ error: 'Form not found' });
    if (!form.active) return res.status(400).json({ error: 'Form is inactive' });

    const b = req.body;
    const id = 'fsub_' + Date.now();
    const now = new Date().toISOString();

    insert('form_submissions', {
      id,
      formId: form.id,
      companyId: form.companyId,
      data_json: JSON.stringify(b.data || {}),
      visitorName: b.visitorName || '',
      visitorEmail: b.visitorEmail || '',
      visitorPhone: b.visitorPhone || '',
      source: b.source || 'link',
      createdAt: now,
    });

    // Increment submission count
    db.prepare('UPDATE forms SET submissionCount = submissionCount + 1 WHERE id = ?').run(form.id);

    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/forms/public/:companySlug/:formSlug ─── Public form data
router.get('/public/:companySlug/:formSlug', (req, res) => {
  try {
    const company = db.prepare('SELECT id, name, slug FROM companies WHERE slug = ?').get(req.params.companySlug);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const form = db.prepare('SELECT * FROM forms WHERE companyId = ? AND slug = ? AND active = 1').get(company.id, req.params.formSlug);
    if (!form) return res.status(404).json({ error: 'Form not found' });
    // Parse JSON fields
    let fields = [];
    let settings = {};
    try { fields = JSON.parse(form.fields_json || '[]'); } catch {}
    try { settings = JSON.parse(form.settings_json || '{}'); } catch {}
    res.json({
      id: form.id,
      name: form.name,
      description: form.description,
      fields,
      settings,
      color: form.color,
      companyName: company.name,
      companySlug: company.slug,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/forms/:id/submissions/:subId/pdf ─── Generate devis/quote PDF
router.get('/:id/submissions/:subId/pdf', (req, res) => {
  try {
    const form = getById('forms', req.params.id);
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const sub = db.prepare('SELECT * FROM form_submissions WHERE id = ? AND formId = ?')
      .get(req.params.subId, req.params.id);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    let data = {};
    try { data = JSON.parse(sub.data_json || '{}'); } catch {}
    let fields = [];
    try { fields = JSON.parse(form.fields_json || '[]'); } catch {}
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(form.companyId);
    const color = form.color || '#2563EB';

    // Helper: hex to RGB
    const hexToRgb = (hex) => {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return [r, g, b];
    };
    const [cr, cg, cb] = hexToRgb(color);
    const lightBg = [cr + Math.round((255-cr)*0.92), cg + Math.round((255-cg)*0.92), cb + Math.round((255-cb)*0.92)];

    // Build PDF
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="devis-${sub.id}.pdf"`);
    doc.pipe(res);

    const pageW = 595.28, pageH = 841.89;
    const mL = 50, mR = 50, contentW = pageW - mL - mR;
    const dateStr = new Date(sub.createdAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
    const refStr = `REF-${String(sub.id).substring(0,8).toUpperCase()}`;
    let pageNum = 1;

    // ═══════════════ HEADER ═══════════════
    // Top color band
    doc.rect(0, 0, pageW, 100).fill(color);
    // Subtle pattern overlay
    doc.save().opacity(0.06);
    for (let i = 0; i < 10; i++) { doc.circle(50 + i * 65, 20 + (i % 3) * 30, 15 + i * 3).fill('#ffffff'); }
    doc.restore();
    // Company name
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
      .text(company?.name || 'Calendar360', mL, 25, { width: contentW * 0.6 });
    // Company info (right side)
    doc.fontSize(9).font('Helvetica').fillColor('#ffffffCC');
    let hx = pageW - mR;
    if (company?.email) { doc.text(company.email, hx - 200, 28, { width: 200, align: 'right' }); }
    if (company?.domain) { doc.text(company.domain, hx - 200, 40, { width: 200, align: 'right' }); }
    // Form title
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#ffffff')
      .text(form.name || 'Formulaire', mL, 65, { width: contentW * 0.6 });
    // Reference + date (right)
    doc.fontSize(9).font('Helvetica').fillColor('#ffffffBB')
      .text(refStr, hx - 200, 65, { width: 200, align: 'right' })
      .text(dateStr, hx - 200, 78, { width: 200, align: 'right' });

    // ═══════════════ CLIENT INFO BOX ═══════════════
    let y = 120;
    const hasClient = sub.visitorName || sub.visitorEmail || sub.visitorPhone;
    if (hasClient) {
      // Rounded box background
      doc.roundedRect(mL, y, contentW, 70, 8).fillAndStroke(lightBg.map(c=>c/255).reduce((a,v,i)=>{return a}, '#F8F9FA'), '#E8E8E8');
      doc.rect(mL, y, 4, 70).fill(color);
      y += 12;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
        .text('Informations client', mL + 18, y);
      y += 18;
      doc.fontSize(10).font('Helvetica').fillColor('#444444');
      const clientParts = [];
      if (sub.visitorName) clientParts.push(`👤  ${sub.visitorName}`);
      if (sub.visitorEmail) clientParts.push(`✉️  ${sub.visitorEmail}`);
      if (sub.visitorPhone) clientParts.push(`📞  ${sub.visitorPhone}`);
      doc.text(clientParts.join('     ·     '), mL + 18, y, { width: contentW - 36 });
      y = 120 + 70 + 20;
    }

    // ═══════════════ SECTION TITLE ═══════════════
    doc.fontSize(14).font('Helvetica-Bold').fillColor(color)
      .text('Détails de la demande', mL, y);
    y += 8;
    doc.moveTo(mL, y + 16).lineTo(mL + contentW, y + 16).lineWidth(1.5).strokeColor(color).stroke();
    y += 28;

    // ═══════════════ FIELDS TABLE ═══════════════
    let rowIdx = 0;
    for (const field of fields) {
      // Page break check
      if (y > 720) {
        doc.addPage(); y = 50; pageNum++;
        // Repeat header line on new page
        doc.rect(0, 0, pageW, 6).fill(color);
        y = 30;
      }

      if (field.type === 'heading') {
        y += 12;
        // Section heading — colored band
        doc.roundedRect(mL, y, contentW, 28, 4).fill(color);
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#ffffff')
          .text(field.label || 'Section', mL + 12, y + 7, { width: contentW - 24 });
        y += 38;
        rowIdx = 0;
        continue;
      }

      const val = data[field.id];
      const displayVal = val == null ? '—' : Array.isArray(val) ? val.join(', ') : (field.type === 'rating' ? '★'.repeat(Number(val) || 0) + '☆'.repeat(5 - (Number(val) || 0)) : String(val) || '—');

      // Alternating row background
      const rowH = Math.max(20, doc.fontSize(10).font('Helvetica').heightOfString(displayVal, { width: 280 }) + 12);
      if (rowIdx % 2 === 0) {
        doc.rect(mL, y - 2, contentW, rowH + 4).fill('#FAFAFA');
      }
      // Left border accent for field label
      doc.rect(mL, y - 2, 3, rowH + 4).fill(color + '40');

      // Label
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#555555')
        .text(field.label || '', mL + 12, y + 2, { width: 170 });
      // Value
      doc.fontSize(10).font('Helvetica').fillColor('#111111')
        .text(displayVal, mL + 195, y + 1, { width: 280 });

      y += rowH + 6;
      rowIdx++;
    }

    // ═══════════════ FOOTER on ALL pages ═══════════════
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      // Footer line
      doc.moveTo(mL, pageH - 40).lineTo(pageW - mR, pageH - 40).lineWidth(0.5).strokeColor('#E0E0E0').stroke();
      // Footer text
      doc.fontSize(8).font('Helvetica').fillColor('#999999')
        .text(`${company?.name || 'Calendar360'} — Généré automatiquement le ${new Date().toLocaleDateString('fr-FR')}`, mL, pageH - 30, { width: contentW * 0.7 })
        .text(`Page ${i + 1} / ${totalPages}`, mL, pageH - 30, { width: contentW, align: 'right' });
    }

    doc.end();
  } catch (err) {
    console.error('[PDF ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
