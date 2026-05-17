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

// GET /api/notifications/sync-reminders — V1.10.4-r11.0.27.c Phase 3
// Fire les notifications "🔔 Rappel" pour les bookings bookingType='reminder' échus.
// Idempotent : reminderFired=1 garantit qu'un rappel ne fire qu'une fois (UPDATE atomique
// `WHERE reminderFired = 0` race-safe entre polls concurrents multi-tabs).
// Appelé par le polling 30s frontend AVANT GET /api/notifications. Pas de cron, pas de websocket.
// Skip dedup (chaque rappel = notif distincte avec sa note). Limit 50 par appel pour éviter
// flood après long offline.
router.get('/sync-reminders', requireAuth, enforceCompany, (req, res) => {
  try {
    const collaboratorId = req.auth.collaboratorId;
    const companyId = req.auth.companyId;
    if (!collaboratorId || !companyId) return res.json({ fired: 0, scanned: 0 });

    // Format JS Date au même schéma que bookings.date (YYYY-MM-DD) + ' ' + bookings.time (HH:MM)
    // → string compare SQLite-safe sans manipulation timezone côté SQL.
    const _pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const nowStr = d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate()) + ' ' + _pad(d.getHours()) + ':' + _pad(d.getMinutes());

    // Rappels échus pour ce collab — status='confirmed' exclut cancelled/dismissed.
    const dueReminders = db.prepare(`
      SELECT id, contactId, notes, date, time
      FROM bookings
      WHERE bookingType = 'reminder'
        AND reminderFired = 0
        AND status = 'confirmed'
        AND collaboratorId = ?
        AND companyId = ?
        AND (date || ' ' || time) <= ?
      ORDER BY date ASC, time ASC
      LIMIT 50
    `).all(collaboratorId, companyId, nowStr);

    let fired = 0;
    for (const r of dueReminders) {
      // Résoudre nom du contact pour le titre lisible.
      const contact = r.contactId
        ? db.prepare('SELECT name, firstname, lastname FROM contacts WHERE id = ?').get(r.contactId)
        : null;
      const contactName = (contact?.name && contact.name.trim())
        || (((contact?.firstname || '') + ' ' + (contact?.lastname || '')).trim())
        || 'contact';

      const title = '🔔 Rappel : ' + contactName;
      const detail = (r.notes && r.notes.trim()) || ('Rappel programmé le ' + r.date + ' à ' + r.time);
      const linkUrl = r.contactId ? '/crm/contact/' + r.contactId : '';

      // INSERT direct (bypass dedup createNotification) — chaque rappel = notification distincte
      // pour préserver la note spécifique de chaque rappel (vs dedup qui écraserait la précédente).
      const notifId = 'notif' + Date.now() + Math.random().toString(36).slice(2, 6);
      try {
        db.prepare(
          'INSERT INTO notifications (id, companyId, collaboratorId, type, title, detail, contactId, contactName, linkUrl, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)'
        ).run(notifId, companyId, collaboratorId, 'reminder_due', title, detail, r.contactId || '', contactName, linkUrl, new Date().toISOString());
      } catch (err) {
        console.error('[REMINDER NOTIF INSERT ERROR]', err.message);
        continue;
      }

      // Marquage atomique reminderFired=1 (race-safe entre polls concurrents multi-tabs).
      const upd = db.prepare('UPDATE bookings SET reminderFired = 1 WHERE id = ? AND reminderFired = 0').run(r.id);
      if (upd.changes > 0) fired++;
    }

    res.json({ fired, scanned: dueReminders.length });
  } catch (err) {
    console.error('[REMINDER SYNC ERROR]', err.message);
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
