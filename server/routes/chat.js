import { Router } from 'express';
import { db } from '../db/database.js';
import { sendChatNotification, formatDailySummary } from '../services/googleChat.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// POST /api/chat/test — Test webhook with a sample message
router.post('/test', requireAuth, async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl required' });

    await sendChatNotification(webhookUrl, {
      text: '✅ *Calendar360* — Webhook configuré avec succès ! Les notifications de rendez-vous seront envoyées ici.',
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/daily-summary — Send daily summary to webhook
router.post('/daily-summary', requireAuth, enforceCompany, async (req, res) => {
  try {
    const companyId = req.body.companyId; // enforceCompany auto-injects from session
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
    const settings = db.prepare('SELECT * FROM settings WHERE companyId = ?').get(companyId);
    const webhookUrl = settings?.google_chat_webhook;
    if (!webhookUrl) return res.status(400).json({ error: 'No webhook configured' });

    const today = new Date().toISOString().slice(0, 10);
    const bookings = db.prepare(`
      SELECT b.* FROM bookings b
      JOIN calendars c ON b.calendarId = c.id
      WHERE c.companyId = ? AND b.date = ?
    `).all(companyId, today);

    const message = formatDailySummary(today, bookings, company?.name || 'Calendar360');
    await sendChatNotification(webhookUrl, message);
    res.json({ success: true, count: bookings.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
