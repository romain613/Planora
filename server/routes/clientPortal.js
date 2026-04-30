import { Router } from 'express';
import { db } from '../db/database.js';
import { createNotification } from './notifications.js';
import { updateBehaviorScore } from '../helpers/behaviorScore.js';

const router = Router();

// GET /api/espace/:token — Client portal: get all contact data
router.get('/:token', (req, res) => {
  try {
    const contact = db.prepare(`
      SELECT c.*, co.name as companyName, co.slug as companySlug
      FROM contacts c
      JOIN companies co ON c.companyId = co.id
      WHERE c.clientToken = ? AND c.clientPortalEnabled = 1 AND (c.archivedAt IS NULL OR c.archivedAt = '')
    `).get(req.params.token);
    if (!contact) return res.status(404).json({ error: 'Espace introuvable' });

    // Collaborateur référent
    const collab = contact.assignedTo
      ? db.prepare('SELECT name, email FROM collaborators WHERE id = ?').get(contact.assignedTo)
      : null;

    // Bookings du contact (par contactId OU par email)
    const bookings = db.prepare(`
      SELECT b.id, b.date, b.time, b.duration, b.status, b.manageToken,
             cal.name as calendarName, cal.location as calendarLocation, cal.color as calendarColor,
             b.meetLink
      FROM bookings b
      JOIN calendars cal ON b.calendarId = cal.id
      WHERE (b.contactId = ? OR (b.visitorEmail = ? AND b.visitorEmail != ''))
        AND b.status = 'confirmed'
        AND b.date >= date('now')
      ORDER BY b.date ASC, b.time ASC
    `).all(contact.id, contact.email);

    // Documents (parse docs_json)
    let documents = [];
    try {
      const raw = JSON.parse(contact.docs_json || '[]');
      documents = raw
        .map(d => typeof d === 'string' ? { name: d.split('/').pop(), url: d, addedAt: null, visibleToClient: true } : d)
        .filter(d => d.visibleToClient !== false);
    } catch {}

    // Messages client
    const messages = db.prepare(
      'SELECT id, direction, message, createdAt FROM client_messages WHERE contactId = ? ORDER BY createdAt ASC LIMIT 100'
    ).all(contact.id);

    // Marquer les messages inbound comme lus (fire-and-forget)
    try {
      db.prepare("UPDATE client_messages SET readAt = ? WHERE contactId = ? AND direction = 'outbound' AND readAt IS NULL")
        .run(new Date().toISOString(), contact.id);
    } catch {}

    // Stage pipeline (label + couleur)
    const stage = contact.pipeline_stage || 'nouveau';
    const DEFAULT_STAGES = {
      nouveau: { label: 'Nouveau', color: '#2563EB' },
      contacte: { label: 'En discussion', color: '#F59E0B' },
      qualifie: { label: 'Intéressé', color: '#7C3AED' },
      rdv_programme: { label: 'RDV Programmé', color: '#0EA5E9' },
      nrp: { label: 'NRP', color: '#EF4444' },
      client_valide: { label: 'Client Validé', color: '#22C55E' },
      perdu: { label: 'Perdu', color: '#64748B' },
    };
    let stageInfo = DEFAULT_STAGES[stage];
    if (!stageInfo) {
      const custom = db.prepare('SELECT label, color FROM pipeline_stages WHERE id = ? AND companyId = ?').get(stage, contact.companyId);
      stageInfo = custom || { label: stage, color: '#94A3B8' };
    }

    res.json({
      contact: {
        firstName: contact.firstname || contact.name?.split(' ')[0] || '',
        lastName: contact.lastname || contact.name?.split(' ').slice(1).join(' ') || '',
        email: contact.email,
        phone: contact.phone,
      },
      company: {
        name: contact.companyName,
        slug: contact.companySlug,
        color: '#2563EB',
      },
      collaborator: collab ? { name: collab.name } : null,
      bookings,
      documents,
      messages,
      stage: stageInfo,
    });
  } catch (err) {
    console.error('[CLIENT PORTAL ERROR]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/espace/:token/message — Client sends a message
router.post('/:token/message', (req, res) => {
  try {
    const contact = db.prepare(
      "SELECT id, companyId, clientPortalEnabled FROM contacts WHERE clientToken = ? AND clientPortalEnabled = 1 AND (archivedAt IS NULL OR archivedAt = '')"
    ).get(req.params.token);
    if (!contact) return res.status(404).json({ error: 'Espace introuvable' });

    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message requis' });
    if (message.length > 2000) return res.status(400).json({ error: 'Message trop long (2000 caractères max)' });

    const id = 'cmsg' + Date.now() + Math.random().toString(36).slice(2, 6);
    db.prepare('INSERT INTO client_messages (id, contactId, companyId, direction, message, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, contact.id, contact.companyId, 'inbound', message.trim(), new Date().toISOString());

    // Notification + log
    try {
      const ct = db.prepare('SELECT name, firstname, lastname, assignedTo FROM contacts WHERE id = ?').get(contact.id);
      const ctName = ct?.firstname ? `${ct.firstname} ${ct.lastname || ''}`.trim() : (ct?.name || 'Client');
      // Notification ciblée au collaborateur assigné (ou à toute la company si pas assigné)
      createNotification({
        companyId: contact.companyId,
        collaboratorId: ct?.assignedTo || null,
        type: 'client_message',
        title: `💬 Nouveau message de ${ctName}`,
        detail: message.trim().slice(0, 100) + (message.trim().length > 100 ? '...' : ''),
        contactId: contact.id,
        contactName: ctName,
      });
      updateBehaviorScore(contact.id, 'message_inbound');
    } catch {}

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
