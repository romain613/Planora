import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { updateBehaviorScore } from '../helpers/behaviorScore.js';

const router = Router();

// GET /api/notifications — liste des notifications du collaborateur (ou admin = toute la company)
router.get('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const { limit = 30, unreadOnly } = req.query;
    const isAdmin = req.auth.role === 'admin' || req.auth.isSupra;
    let rows;
    if (unreadOnly === '1') {
      rows = isAdmin
        ? db.prepare('SELECT * FROM notifications WHERE companyId = ? AND readAt IS NULL ORDER BY createdAt DESC LIMIT ?').all(req.auth.companyId, +limit)
        : db.prepare('SELECT * FROM notifications WHERE companyId = ? AND (collaboratorId = ? OR collaboratorId IS NULL) AND readAt IS NULL ORDER BY createdAt DESC LIMIT ?').all(req.auth.companyId, req.auth.collaboratorId, +limit);
    } else {
      rows = isAdmin
        ? db.prepare('SELECT * FROM notifications WHERE companyId = ? ORDER BY createdAt DESC LIMIT ?').all(req.auth.companyId, +limit)
        : db.prepare('SELECT * FROM notifications WHERE companyId = ? AND (collaboratorId = ? OR collaboratorId IS NULL) ORDER BY createdAt DESC LIMIT ?').all(req.auth.companyId, req.auth.collaboratorId, +limit);
    }
    // Count unread
    const unread = isAdmin
      ? db.prepare('SELECT COUNT(*) as c FROM notifications WHERE companyId = ? AND readAt IS NULL').get(req.auth.companyId)?.c || 0
      : db.prepare('SELECT COUNT(*) as c FROM notifications WHERE companyId = ? AND (collaboratorId = ? OR collaboratorId IS NULL) AND readAt IS NULL').get(req.auth.companyId, req.auth.collaboratorId)?.c || 0;
    res.json({ notifications: rows, unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/read — marquer comme lu (un ou plusieurs)
router.post('/read', requireAuth, (req, res) => {
  try {
    const { ids, all } = req.body;
    const now = new Date().toISOString();
    if (all) {
      const isAdmin = req.auth.role === 'admin' || req.auth.isSupra;
      if (isAdmin) {
        db.prepare('UPDATE notifications SET readAt = ? WHERE companyId = ? AND readAt IS NULL').run(now, req.auth.companyId);
      } else {
        db.prepare('UPDATE notifications SET readAt = ? WHERE companyId = ? AND (collaboratorId = ? OR collaboratorId IS NULL) AND readAt IS NULL').run(now, req.auth.companyId, req.auth.collaboratorId);
      }
    } else if (Array.isArray(ids) && ids.length > 0) {
      const stmt = db.prepare('UPDATE notifications SET readAt = ? WHERE id = ?');
      ids.forEach(id => stmt.run(now, id));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notifications/client-messages/:contactId — messages d'un contact (pour fiche CRM)
router.get('/client-messages/:contactId', requireAuth, enforceCompany, (req, res) => {
  try {
    // Vérifier que le contact appartient à la company
    const contact = db.prepare('SELECT id, companyId, assignedTo FROM contacts WHERE id = ?').get(req.params.contactId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    if (contact.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const messages = db.prepare('SELECT * FROM client_messages WHERE contactId = ? ORDER BY createdAt ASC').all(req.params.contactId);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/client-messages/:contactId — collab répond au client
router.post('/client-messages/:contactId', requireAuth, enforceCompany, (req, res) => {
  try {
    const contact = db.prepare('SELECT id, companyId FROM contacts WHERE id = ?').get(req.params.contactId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    if (contact.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message requis' });
    const id = 'cmsg' + Date.now() + Math.random().toString(36).slice(2, 6);
    db.prepare('INSERT INTO client_messages (id, contactId, companyId, direction, message, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, contact.id, contact.companyId, 'outbound', message.trim(), new Date().toISOString());
    updateBehaviorScore(req.params.contactId, 'message_outbound');
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

// Helper: créer une notification (utilisable par d'autres modules)
// Si une notif non lue du même type+contact existe déjà → on met à jour au lieu de dupliquer
export function createNotification({ companyId, collaboratorId, type, title, detail, contactId, contactName, linkUrl }) {
  try {
    // Wave D — skip si destinataire collab archivé (notif irait dans le vide)
    if (collaboratorId) {
      const active = db.prepare("SELECT 1 FROM collaborators WHERE id = ? AND (archivedAt IS NULL OR archivedAt = '')").get(collaboratorId);
      if (!active) {
        console.warn(`[NOTIFICATION SKIP] collab archivé ${collaboratorId} — notif ignorée (type=${type})`);
        return null;
      }
    }
    // Grouper : chercher une notif non lue du même type + même contact
    if (contactId) {
      const existing = db.prepare(
        'SELECT id FROM notifications WHERE companyId = ? AND type = ? AND contactId = ? AND readAt IS NULL LIMIT 1'
      ).get(companyId, type, contactId);
      if (existing) {
        // Mettre à jour le detail + timestamp (la notif "remonte" en haut)
        db.prepare('UPDATE notifications SET title = ?, detail = ?, createdAt = ? WHERE id = ?')
          .run(title, detail || '', new Date().toISOString(), existing.id);
        return existing.id;
      }
    }
    const id = 'notif' + Date.now() + Math.random().toString(36).slice(2, 6);
    db.prepare('INSERT INTO notifications (id, companyId, collaboratorId, type, title, detail, contactId, contactName, linkUrl, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, companyId, collaboratorId || null, type, title, detail || '', contactId || '', contactName || '', linkUrl || '', new Date().toISOString());
    return id;
  } catch (err) {
    console.error('[NOTIFICATION CREATE ERROR]', err.message);
    return null;
  }
}
