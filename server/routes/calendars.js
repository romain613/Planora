import { Router } from 'express';
import { db, getByCompany, insert, remove } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// GET /api/calendars?companyId=c1
router.get('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    // R3 — filtre orphelins : un calendar sans aucun collaborateur assigné est invisibilisé
    const rows = getByCompany('calendars', companyId).filter(cal => {
      try {
        const ids = Array.isArray(cal.collaborators) ? cal.collaborators : JSON.parse(cal.collaborators_json || '[]');
        return Array.isArray(ids) && ids.length > 0;
      } catch { return false; }
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calendars/by-slug/:slug (public booking page)
router.get('/by-slug/:slug', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM calendars WHERE slug = ?').get(req.params.slug);
    if (!row) return res.status(404).json({ error: 'Calendar not found' });
    // Parse JSON fields
    const cal = { ...row };
    for (const f of ['durations_json', 'questions_json', 'tags_json', 'collaborators_json']) {
      const clean = f.replace('_json', '');
      try { cal[clean] = JSON.parse(cal[f] || '[]'); } catch { cal[clean] = []; }
      delete cal[f];
    }
    cal.requireApproval = !!cal.requireApproval;
    cal.allowRecurring = !!cal.allowRecurring;
    cal.waitlistEnabled = !!cal.waitlistEnabled;
    cal.reconfirm = !!cal.reconfirm;
    cal.managed = !!cal.managed;
    cal.singleUse = !!cal.singleUse;
    cal.videoAuto = !!cal.videoAuto;
    cal.notifyEmail = cal.notifyEmail !== 0;
    cal.notifySms = !!cal.notifySms;
    cal.notifyWhatsapp = !!cal.notifyWhatsapp;
    cal.confirmEmail = cal.confirmEmail !== 0;
    cal.confirmSms = !!cal.confirmSms;
    cal.confirmWhatsapp = !!cal.confirmWhatsapp;
    cal.reminderEmail = cal.reminderEmail !== 0;
    cal.reminderSms = !!cal.reminderSms;
    cal.reminderWhatsapp = !!cal.reminderWhatsapp;
    cal.whatsappVerified = !!cal.whatsappVerified;
    res.json(cal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calendars/check-slug?companyId=&slug=&excludeId= — Check slug uniqueness
router.get('/check-slug', (req, res) => {
  try {
    const { companyId, slug, excludeId } = req.query;
    if (!companyId || !slug) return res.json({ available: false });
    const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!clean || clean.length < 2) return res.json({ available: false, reason: 'Slug trop court (min 2 caractères)' });
    let existing;
    if (excludeId) {
      existing = db.prepare('SELECT id FROM calendars WHERE companyId = ? AND slug = ? AND id != ?').get(companyId, clean, excludeId);
    } else {
      existing = db.prepare('SELECT id FROM calendars WHERE companyId = ? AND slug = ?').get(companyId, clean);
    }
    res.json({ available: !existing, slug: clean });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calendars
// Wave D — helper local : retire les ids de collabs archivés d'une liste avant persist
function _stripArchivedCollabIds(db, collabIds, companyId) {
  if (!Array.isArray(collabIds) || collabIds.length === 0) return collabIds || [];
  const placeholders = collabIds.map(() => '?').join(',');
  const active = db.prepare(
    `SELECT id FROM collaborators WHERE companyId = ? AND id IN (${placeholders}) AND (archivedAt IS NULL OR archivedAt = '')`
  ).all(companyId, ...collabIds).map(r => r.id);
  const stripped = collabIds.filter(id => active.includes(id));
  if (stripped.length !== collabIds.length) {
    console.warn(`[CALENDARS] stripped ${collabIds.length - stripped.length} archived collab(s) from collaborators_json`);
  }
  return stripped;
}

router.post('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const c = req.body;
    const companyId = req.auth?.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    // Wave D — strip archived collab ids
    if (Array.isArray(c.collaborators)) {
      c.collaborators = _stripArchivedCollabIds(db, c.collaborators, companyId);
    }
    const id = c.id || 'cal' + Date.now();
    insert('calendars', {
      id,
      companyId,
      name: c.name,
      type: c.type || 'simple',
      duration: c.duration || 30,
      durations_json: JSON.stringify(c.durations || [c.duration || 30]),
      color: c.color || '#2563EB',
      slug: c.slug || '',
      location: c.location || '',
      price: c.price || 0,
      currency: c.currency || 'EUR',
      bufferBefore: c.bufferBefore || 0,
      bufferAfter: c.bufferAfter || 0,
      minNotice: c.minNotice || 60,
      maxPerDay: c.maxPerDay || 10,
      maxAdvanceDays: c.maxAdvanceDays || 60,
      questions_json: JSON.stringify(c.questions || []),
      requireApproval: c.requireApproval ? 1 : 0,
      allowRecurring: c.allowRecurring ? 1 : 0,
      groupMax: c.groupMax || 1,
      waitlistEnabled: c.waitlistEnabled ? 1 : 0,
      reconfirm: c.reconfirm ? 1 : 0,
      reconfirmHours: c.reconfirmHours || 24,
      managed: c.managed ? 1 : 0,
      singleUse: c.singleUse ? 1 : 0,
      dependency: c.dependency || '',
      tags_json: JSON.stringify(c.tags || []),
      videoAuto: c.videoAuto ? 1 : 0,
      assignMode: c.assignMode || 'priority',
      collaborators_json: JSON.stringify(c.collaborators || []),
      description: c.description || '',
      notifyEmail: c.notifyEmail !== undefined ? (c.notifyEmail ? 1 : 0) : 1,
      notifySms: c.notifySms ? 1 : 0,
      notifyWhatsapp: c.notifyWhatsapp ? 1 : 0,
      whatsappNumber: c.whatsappNumber || '',
      customConfirmSms: c.customConfirmSms || null,
      customConfirmWhatsapp: c.customConfirmWhatsapp || null,
      customReminderSms: c.customReminderSms || null,
      customReminderWhatsapp: c.customReminderWhatsapp || null,
      confirmEmail: c.confirmEmail !== undefined ? (c.confirmEmail ? 1 : 0) : 1,
      confirmSms: c.confirmSms ? 1 : 0,
      confirmWhatsapp: c.confirmWhatsapp ? 1 : 0,
      reminderEmail: c.reminderEmail !== undefined ? (c.reminderEmail ? 1 : 0) : 1,
      reminderSms: c.reminderSms ? 1 : 0,
      reminderWhatsapp: c.reminderWhatsapp ? 1 : 0,
      customReminders: c.customReminders ? 1 : 0,
      calReminder24h: c.calReminder24h !== undefined ? (c.calReminder24h ? 1 : 0) : 1,
      calReminder1h: c.calReminder1h !== undefined ? (c.calReminder1h ? 1 : 0) : 1,
      calReminder15min: c.calReminder15min ? 1 : 0,
    });
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/calendars/:id
router.put('/:id', requireAuth, (req, res) => {
  try {
    const record = db.prepare('SELECT companyId FROM calendars WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && record.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const data = { ...req.body };
    // Wave D — strip archived collab ids before serializing
    if (Array.isArray(data.collaborators)) {
      data.collaborators = _stripArchivedCollabIds(db, data.collaborators, record.companyId);
    }
    // Convert arrays/objects to JSON strings
    for (const f of ['durations', 'questions', 'tags', 'collaborators']) {
      if (data[f]) { data[f + '_json'] = JSON.stringify(data[f]); delete data[f]; }
    }
    // Convert booleans
    for (const f of ['requireApproval', 'allowRecurring', 'waitlistEnabled', 'reconfirm', 'managed', 'singleUse', 'videoAuto', 'notifyEmail', 'notifySms', 'notifyWhatsapp', 'confirmEmail', 'confirmSms', 'confirmWhatsapp', 'reminderEmail', 'reminderSms', 'reminderWhatsapp', 'whatsappVerified', 'customReminders', 'calReminder24h', 'calReminder1h', 'calReminder15min']) {
      if (f in data) data[f] = data[f] ? 1 : 0;
    }
    // If whatsappNumber changes, reset verification
    if ('whatsappNumber' in data) {
      const current = db.prepare('SELECT whatsappNumber FROM calendars WHERE id = ?').get(req.params.id);
      if (current && current.whatsappNumber !== (data.whatsappNumber || '')) {
        data.whatsappVerified = 0;
      }
    }
    delete data.id;
    const sets = Object.keys(data).map(k => `${k} = ?`).join(',');
    const values = Object.values(data);
    values.push(req.params.id);
    db.prepare(`UPDATE calendars SET ${sets} WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/calendars/:id
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const record = db.prepare('SELECT companyId FROM calendars WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && record.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    remove('calendars', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
