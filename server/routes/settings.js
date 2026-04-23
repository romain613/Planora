import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// GET /api/settings?companyId=c1
router.get('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth?.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const row = db.prepare('SELECT * FROM settings WHERE companyId = ?').get(companyId);
    if (!row) {
      return res.json({ blackoutDates: [], vacations: [], timezone: 'Europe/Paris', language: 'fr', cancelPolicy: '', customDomain: '', brandColor: '#2563EB', reminder24h: true, reminder1h: true, reminder15min: false, reminderSms: false, google_chat_webhook: '', ga4_property_id: '', google_tasks_auto: true, maxAdvanceDays: 60 });
    }
    res.json({
      blackoutDates: JSON.parse(row.blackoutDates_json || '[]'),
      vacations: JSON.parse(row.vacations_json || '[]'),
      timezone: row.timezone,
      language: row.language,
      cancelPolicy: row.cancelPolicy || '',
      customDomain: row.customDomain || '',
      brandColor: row.brandColor || '#2563EB',
      reminder24h: !!(row.reminder24h ?? 1),
      reminder1h: !!(row.reminder1h ?? 1),
      reminder15min: !!row.reminder15min,
      reminderSms: !!row.reminderSms,
      google_chat_webhook: row.google_chat_webhook || '',
      ga4_property_id: row.ga4_property_id || '',
      google_tasks_auto: !!(row.google_tasks_auto ?? 1),
      maxAdvanceDays: row.maxAdvanceDays ?? 60,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings
router.put('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth?.companyId || req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const s = req.body;

    // Merge with existing settings to avoid wiping fields
    const existing = db.prepare('SELECT * FROM settings WHERE companyId = ?').get(companyId);
    const merged = {
      blackoutDates_json: 'blackoutDates' in s ? JSON.stringify(s.blackoutDates) : (existing?.blackoutDates_json || '[]'),
      vacations_json: 'vacations' in s ? JSON.stringify(s.vacations) : (existing?.vacations_json || '[]'),
      timezone: s.timezone || existing?.timezone || 'Europe/Paris',
      language: s.language || existing?.language || 'fr',
      cancelPolicy: 'cancelPolicy' in s ? s.cancelPolicy : (existing?.cancelPolicy || ''),
      customDomain: 'customDomain' in s ? s.customDomain : (existing?.customDomain || ''),
      brandColor: s.brandColor || existing?.brandColor || '#2563EB',
      reminder24h: 'reminder24h' in s ? (s.reminder24h ? 1 : 0) : (existing?.reminder24h ?? 1),
      reminder1h: 'reminder1h' in s ? (s.reminder1h ? 1 : 0) : (existing?.reminder1h ?? 1),
      reminder15min: 'reminder15min' in s ? (s.reminder15min ? 1 : 0) : (existing?.reminder15min ?? 0),
      reminderSms: 'reminderSms' in s ? (s.reminderSms ? 1 : 0) : (existing?.reminderSms ?? 0),
      google_chat_webhook: 'google_chat_webhook' in s ? s.google_chat_webhook : (existing?.google_chat_webhook || ''),
      ga4_property_id: 'ga4_property_id' in s ? s.ga4_property_id : (existing?.ga4_property_id || ''),
      google_tasks_auto: 'google_tasks_auto' in s ? (s.google_tasks_auto ? 1 : 0) : (existing?.google_tasks_auto ?? 1),
      maxAdvanceDays: 'maxAdvanceDays' in s ? parseInt(s.maxAdvanceDays) || 60 : (existing?.maxAdvanceDays ?? 60),
    };

    db.prepare(`INSERT OR REPLACE INTO settings (companyId, blackoutDates_json, vacations_json, timezone, language, cancelPolicy, customDomain, brandColor, reminder24h, reminder1h, reminder15min, reminderSms, google_chat_webhook, ga4_property_id, google_tasks_auto, maxAdvanceDays)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      companyId, merged.blackoutDates_json, merged.vacations_json, merged.timezone, merged.language,
      merged.cancelPolicy, merged.customDomain, merged.brandColor,
      merged.reminder24h, merged.reminder1h, merged.reminder15min, merged.reminderSms,
      merged.google_chat_webhook, merged.ga4_property_id, merged.google_tasks_auto, merged.maxAdvanceDays,
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
