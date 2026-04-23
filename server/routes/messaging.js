import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// ─── GET /api/messaging — Fetch messages (group or DM) ──────────
// ?companyId=xxx&limit=50&after=ISO_TIMESTAMP&recipientId=null&senderId=xxx
router.get('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const { limit = 50, after, recipientId, senderId } = req.query;
    const companyId = req.auth.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    let messages;
    if (recipientId && senderId) {
      // DM mode: get messages between senderId and recipientId
      if (after) {
        messages = db.prepare(
          `SELECT * FROM chat_messages WHERE companyId = ? AND createdAt > ? AND (
            (senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?)
          ) ORDER BY createdAt ASC LIMIT ?`
        ).all(companyId, after, senderId, recipientId, recipientId, senderId, Number(limit));
      } else {
        messages = db.prepare(
          `SELECT * FROM chat_messages WHERE companyId = ? AND (
            (senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?)
          ) ORDER BY createdAt DESC LIMIT ?`
        ).all(companyId, senderId, recipientId, recipientId, senderId, Number(limit)).reverse();
      }
    } else {
      // Group mode: get messages where recipientId IS NULL
      if (after) {
        messages = db.prepare(
          'SELECT * FROM chat_messages WHERE companyId = ? AND recipientId IS NULL AND createdAt > ? ORDER BY createdAt ASC LIMIT ?'
        ).all(companyId, after, Number(limit));
      } else {
        messages = db.prepare(
          'SELECT * FROM chat_messages WHERE companyId = ? AND recipientId IS NULL ORDER BY createdAt DESC LIMIT ?'
        ).all(companyId, Number(limit)).reverse();
      }
    }

    const parsed = messages.map(m => ({
      ...m,
      attachments: m.attachments_json ? JSON.parse(m.attachments_json) : null,
      type: m.type || 'text',
      reactions: m.reactions_json ? JSON.parse(m.reactions_json) : {},
    }));
    res.json({ messages: parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/messaging — Send a message ──────────
router.post('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const { senderId, senderName, message, attachments, type = 'text', recipientId = null, replyToId, replyToName, replyToMsg } = req.body;
    const companyId = req.auth.companyId;
    if (!companyId || !senderId) {
      return res.status(400).json({ error: 'companyId and senderId required' });
    }
    if (!message?.trim() && !attachments) {
      return res.status(400).json({ error: 'message or attachments required' });
    }

    // Company isolation: verify sender belongs to this company
    const collab = db.prepare('SELECT id FROM collaborators WHERE id = ? AND companyId = ?').get(senderId, companyId);
    if (!collab) return res.status(403).json({ error: 'Sender not in this company' });

    // If DM, verify recipient also belongs to company AND not archived (Wave D)
    if (recipientId) {
      const recipient = db.prepare('SELECT id, archivedAt FROM collaborators WHERE id = ? AND companyId = ?').get(recipientId, companyId);
      if (!recipient) return res.status(403).json({ error: 'Recipient not in this company' });
      if (recipient.archivedAt && recipient.archivedAt !== '') {
        return res.status(409).json({ error: 'RECIPIENT_ARCHIVED' });
      }
    }

    const now = new Date().toISOString();
    const id = 'cm' + Date.now() + Math.random().toString(36).slice(2, 6);
    const attachments_json = attachments ? JSON.stringify(attachments) : null;

    db.prepare(
      'INSERT INTO chat_messages (id, companyId, senderId, senderName, message, attachments_json, type, recipientId, replyToId, replyToName, replyToMsg, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, companyId, senderId, senderName, (message || '').trim(), attachments_json, type, recipientId, replyToId || null, replyToName || null, replyToMsg || null, now);

    res.json({ success: true, id, createdAt: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/messaging/:id — Edit a message ──────────
router.put('/:id', requireAuth, (req, res) => {
  try {
    const { message } = req.body;
    const senderId = req.auth.collaboratorId;
    if (!senderId || !message?.trim()) return res.status(400).json({ error: 'message required' });

    // Only the sender can edit their own message
    const existing = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Message not found' });
    if (!req.auth.isSupra && existing.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    if (existing.senderId !== senderId) return res.status(403).json({ error: 'You can only edit your own messages' });

    const editedAt = new Date().toISOString();
    db.prepare('UPDATE chat_messages SET message = ?, editedAt = ? WHERE id = ?').run(message.trim(), editedAt, req.params.id);
    res.json({ success: true, editedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/messaging/:id — Delete a message ──────────
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Message not found' });
    if (!req.auth.isSupra && existing.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const { senderId } = req.query;
    if (senderId && existing.senderId !== senderId) return res.status(403).json({ error: 'You can only delete your own messages' });
    db.prepare('DELETE FROM chat_messages WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/messaging/:id/reaction — Add/toggle reaction ──────────
router.post('/:id/reaction', requireAuth, (req, res) => {
  try {
    const { emoji } = req.body;
    const userId = req.auth.collaboratorId;
    const userName = req.body.userName;
    if (!userId || !emoji) return res.status(400).json({ error: 'userId and emoji required' });

    const msg = db.prepare('SELECT reactions_json, companyId FROM chat_messages WHERE id = ?').get(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (!req.auth.isSupra && msg.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });

    const reactions = msg.reactions_json ? JSON.parse(msg.reactions_json) : {};
    const key = emoji + '_' + userId;

    if (reactions[key]) {
      delete reactions[key]; // toggle off
    } else {
      reactions[key] = { emoji, userId, userName };
    }

    db.prepare('UPDATE chat_messages SET reactions_json = ? WHERE id = ?').run(JSON.stringify(reactions), req.params.id);
    res.json({ success: true, reactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/messaging/heartbeat — Update online status ──────────
router.post('/heartbeat', requireAuth, (req, res) => {
  try {
    const collaboratorId = req.auth.collaboratorId;
    const companyId = req.auth.companyId;
    if (!collaboratorId || !companyId) return res.status(400).json({ error: 'auth required' });
    const now = new Date().toISOString();
    db.prepare('INSERT INTO collab_heartbeat (collaboratorId, companyId, lastSeen) VALUES (?, ?, ?) ON CONFLICT(collaboratorId) DO UPDATE SET lastSeen = ?, companyId = ?')
      .run(collaboratorId, companyId, now, now, companyId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/messaging/online — Get online collaborators (uses auth companyId) ──────────
router.get('/online', requireAuth, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    // Online = heartbeat within last 30 seconds
    const cutoff = new Date(Date.now() - 30000).toISOString();
    const online = db.prepare('SELECT collaboratorId, lastSeen FROM collab_heartbeat WHERE companyId = ? AND lastSeen > ?').all(companyId, cutoff);
    res.json({ online: online.map(o => o.collaboratorId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/messaging/dm-list — Get DM conversations (uses auth) ──────────
router.get('/dm-list', requireAuth, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    const userId = req.auth.collaboratorId;
    if (!companyId || !userId) return res.status(400).json({ error: 'auth required' });

    // Find all unique DM partners for this user
    const dms = db.prepare(`
      SELECT DISTINCT
        CASE WHEN senderId = ? THEN recipientId ELSE senderId END as partnerId,
        MAX(createdAt) as lastMessageAt
      FROM chat_messages
      WHERE companyId = ? AND recipientId IS NOT NULL AND (senderId = ? OR recipientId = ?)
      GROUP BY partnerId
      ORDER BY lastMessageAt DESC
    `).all(userId, companyId, userId, userId);

    // Get last message and unread count for each DM
    const result = dms.map(dm => {
      const lastMsg = db.prepare(`
        SELECT message, senderName, type, createdAt FROM chat_messages
        WHERE companyId = ? AND ((senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?))
        ORDER BY createdAt DESC LIMIT 1
      `).get(companyId, userId, dm.partnerId, dm.partnerId, userId);
      return { ...dm, lastMessage: lastMsg };
    });

    res.json({ conversations: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
