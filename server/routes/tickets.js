import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, enforceCompany, requireSupra } from '../middleware/auth.js';

const router = Router();

// ─── GET /api/tickets?companyId=xxx — List tickets for a company ───
router.get('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const tickets = db.prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM ticket_messages WHERE ticketId = t.id AND sender = 'supra' AND internal = 0) as replyCount
       FROM tickets t WHERE t.companyId = ? ORDER BY t.createdAt DESC`
    ).all(companyId);
    res.json({ tickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tickets/all — (supra) All tickets across all companies ───
router.get('/all', requireAuth, requireSupra, (req, res) => {
  try {
    const tickets = db.prepare(
      `SELECT t.*, c.name as companyName,
        (SELECT COUNT(*) FROM ticket_messages WHERE ticketId = t.id) as messageCount
       FROM tickets t LEFT JOIN companies c ON t.companyId = c.id
       ORDER BY t.createdAt DESC`
    ).all();
    res.json({ tickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tickets/stats — (supra) Aggregated stats ───
router.get('/stats', requireAuth, requireSupra, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM tickets').get().c;
    const open = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'open'").get().c;
    const inProgress = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'in_progress'").get().c;
    const resolved = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'resolved'").get().c;
    const closed = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'closed'").get().c;

    const byCategory = {
      bug: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE category = 'bug'").get().c,
      feature: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE category = 'feature'").get().c,
      question: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE category = 'question'").get().c,
      other: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE category = 'other'").get().c,
    };

    const byType = {
      manual: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE type = 'manual'").get().c,
      auto_js_error: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE type = 'auto_js_error'").get().c,
      auto_api_error: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE type = 'auto_api_error'").get().c,
    };

    const byPriority = {
      low: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE priority = 'low'").get().c,
      medium: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE priority = 'medium'").get().c,
      high: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE priority = 'high'").get().c,
      critical: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE priority = 'critical'").get().c,
    };

    // Last 30 days daily breakdown
    const recentPerDay = db.prepare(
      `SELECT DATE(createdAt) as date, COUNT(*) as count FROM tickets
       WHERE createdAt >= DATE('now', '-30 days') GROUP BY DATE(createdAt) ORDER BY date`
    ).all();

    res.json({ total, open, inProgress, resolved, closed, byCategory, byType, byPriority, recentPerDay });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tickets/open-count — Quick count for badge ───
router.get('/open-count', requireAuth, requireSupra, (req, res) => {
  try {
    const count = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status IN ('open', 'in_progress')").get().c;
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tickets/:id — Ticket detail with messages ───
router.get('/:id', requireAuth, (req, res) => {
  try {
    const ticket = db.prepare(
      `SELECT t.*, c.name as companyName FROM tickets t LEFT JOIN companies c ON t.companyId = c.id WHERE t.id = ?`
    ).get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (!req.auth.isSupra && ticket.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });

    const messages = db.prepare(
      'SELECT * FROM ticket_messages WHERE ticketId = ? ORDER BY createdAt ASC'
    ).all(req.params.id);

    res.json({ ticket, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tickets — Create a ticket ───
router.post('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId, collaboratorId, type = 'manual', category = 'bug', subject, description, environment_json, attachments_json } = req.body;
    if (!companyId || !subject) return res.status(400).json({ error: 'companyId and subject required' });

    const isAuto = type === 'auto_js_error' || type === 'auto_api_error';

    // Anti-dedup for auto-tickets: skip if same companyId+type+subject within 5 minutes
    if (isAuto) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const recent = db.prepare(
        'SELECT id FROM tickets WHERE companyId = ? AND type = ? AND subject = ? AND createdAt > ?'
      ).get(companyId, type, subject, fiveMinAgo);
      if (recent) return res.json({ deduplicated: true, existingId: recent.id });

      // Rate limit: max 10 auto-tickets per company per hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const hourlyCount = db.prepare(
        "SELECT COUNT(*) as c FROM tickets WHERE companyId = ? AND type IN ('auto_js_error','auto_api_error') AND createdAt > ?"
      ).get(companyId, oneHourAgo).c;
      if (hourlyCount >= 10) return res.json({ rateLimited: true });
    }

    const now = new Date().toISOString();
    const id = 'tk' + Date.now() + Math.random().toString(36).slice(2, 6);

    db.prepare(
      `INSERT INTO tickets (id, companyId, collaboratorId, type, category, subject, description, status, priority, environment_json, attachments_json, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`
    ).run(id, companyId, collaboratorId || null, type, category, subject, description || '', isAuto ? 'low' : 'medium', environment_json || null, attachments_json || null, now, now);

    // Auto-create first message from description
    if (description) {
      const msgId = 'tm' + Date.now() + Math.random().toString(36).slice(2, 6);
      db.prepare(
        'INSERT INTO ticket_messages (id, ticketId, sender, senderName, message, attachments_json, internal, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
      ).run(msgId, id, isAuto ? 'system' : 'company', isAuto ? 'Auto-detection' : 'Utilisateur', description, attachments_json || null, now);
    }

    console.log(`\x1b[36m[TICKET]\x1b[0m ${type} ticket created: ${subject.substring(0, 60)} (${companyId})`);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[TICKET CREATE ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tickets/:id/message — Add a message to a ticket ───
router.post('/:id/message', requireAuth, (req, res) => {
  try {
    const { sender, senderName, message, attachments_json, internal } = req.body;
    if (!sender || !message) return res.status(400).json({ error: 'sender and message required' });

    const ticket = db.prepare('SELECT id, status, companyId FROM tickets WHERE id = ?').get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (!req.auth.isSupra && ticket.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });

    const now = new Date().toISOString();
    const id = 'tm' + Date.now() + Math.random().toString(36).slice(2, 6);

    db.prepare(
      'INSERT INTO ticket_messages (id, ticketId, sender, senderName, message, attachments_json, internal, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, req.params.id, sender, senderName || '', message, attachments_json || null, internal ? 1 : 0, now);

    // Update ticket's updatedAt
    db.prepare('UPDATE tickets SET updatedAt = ? WHERE id = ?').run(now, req.params.id);

    // If supra replies and ticket is 'open', auto-move to 'in_progress'
    if (sender === 'supra' && ticket.status === 'open' && !internal) {
      db.prepare("UPDATE tickets SET status = 'in_progress' WHERE id = ?").run(req.params.id);
    }

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/tickets/:id — Update status/priority (supra only) ───
router.patch('/:id', requireAuth, requireSupra, (req, res) => {
  try {
    const { status, priority } = req.body;
    const now = new Date().toISOString();

    const sets = ['updatedAt = ?'];
    const vals = [now];

    if (status) {
      sets.push('status = ?');
      vals.push(status);
      if (status === 'resolved' || status === 'closed') {
        sets.push('resolvedAt = ?');
        vals.push(now);
      }
    }
    if (priority) {
      sets.push('priority = ?');
      vals.push(priority);
    }

    vals.push(req.params.id);
    db.prepare(`UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

    const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    res.json({ success: true, ticket: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
