import { Router } from 'express';
import { db, getCollaboratorTimezone } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';
import { DateTime } from 'luxon';
import { createNotification } from './notifications.js';
import { checkBookingConflict } from '../services/bookings/checkBookingConflict.js';
import { applyBookingCreatedSideEffects } from '../services/bookings/applyBookingCreatedSideEffects.js';

const router = Router();

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ─── CONTACT FOLLOWERS (VISIBILITY MODEL) ────────────────────────────────────

/**
 * GET /api/inter-meetings/followers/:contactId
 * Liste les followers d'un contact (owner, executor, viewer)
 */
router.get('/followers/:contactId', requireAuth, enforceCompany, (req, res) => {
  try {
    const { contactId } = req.params;
    const companyId = req.auth.isSupra
      ? (req.query.companyId || req.auth.companyId)
      : req.auth.companyId;

    // Vérifier que le contact appartient à la company
    const contact = db.prepare('SELECT id, companyId, assignedTo, ownerCollaboratorId FROM contacts WHERE id = ? AND companyId = ?').get(contactId, companyId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    // Non-admin : vérifier ownership ou follower
    const isAdmin = req.auth.role === 'admin' || req.auth.isSupra;
    if (!isAdmin) {
      const isOwnerOrAssigned = contact.assignedTo === req.auth.collaboratorId || contact.ownerCollaboratorId === req.auth.collaboratorId;
      const isFollower = db.prepare('SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ?').get(contactId, req.auth.collaboratorId);
      if (!isOwnerOrAssigned && !isFollower) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    }

    const followers = db.prepare(`
      SELECT cf.*, c.name as collaboratorName, c.email as collaboratorEmail
      FROM contact_followers cf
      LEFT JOIN collaborators c ON cf.collaboratorId = c.id
      WHERE cf.contactId = ? AND cf.companyId = ?
      ORDER BY cf.addedAt DESC
    `).all(contactId, companyId);

    res.json({ followers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/inter-meetings/followers
 * Ajouter un follower à un contact
 * Body: { contactId, collaboratorId, role: 'viewer'|'executor'|'owner', reason? }
 */
router.post('/followers', requireAuth, enforceCompany, (req, res) => {
  try {
    const { contactId, collaboratorId, role, reason } = req.body;
    const companyId = req.auth.isSupra
      ? (req.query.companyId || req.auth.companyId)
      : req.auth.companyId;

    if (!contactId || !collaboratorId) {
      return res.status(400).json({ error: 'contactId et collaboratorId requis' });
    }

    const validRoles = ['viewer', 'executor', 'owner'];
    const safeRole = validRoles.includes(role) ? role : 'viewer';

    // Vérifier contact + company
    const contact = db.prepare('SELECT id, companyId FROM contacts WHERE id = ? AND companyId = ?').get(contactId, companyId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    // Vérifier que le collaborateur cible est dans la même company
    const targetCollab = db.prepare('SELECT id FROM collaborators WHERE id = ? AND companyId = ?').get(collaboratorId, companyId);
    if (!targetCollab) return res.status(404).json({ error: 'Collaborateur introuvable dans cette company' });

    // Non-admin : seuls owner/admin peuvent ajouter des followers
    const isAdmin = req.auth.role === 'admin' || req.auth.isSupra;
    if (!isAdmin) {
      const isOwner = contact.companyId === companyId && (
        db.prepare('SELECT assignedTo, ownerCollaboratorId FROM contacts WHERE id = ?').get(contactId)?.assignedTo === req.auth.collaboratorId ||
        db.prepare('SELECT assignedTo, ownerCollaboratorId FROM contacts WHERE id = ?').get(contactId)?.ownerCollaboratorId === req.auth.collaboratorId
      );
      if (!isOwner) return res.status(403).json({ error: 'Seul le propriétaire ou admin peut ajouter des followers' });
    }

    const id = 'cf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO contact_followers (id, contactId, collaboratorId, companyId, role, addedAt, addedBy, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, contactId, collaboratorId, companyId, safeRole, now, req.auth.collaboratorId, reason || '');

    res.json({ ok: true, id, role: safeRole });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/inter-meetings/followers/:contactId/:collaboratorId
 * Retirer un follower d'un contact
 */
router.delete('/followers/:contactId/:collaboratorId', requireAuth, enforceCompany, (req, res) => {
  try {
    const { contactId, collaboratorId } = req.params;
    const companyId = req.auth.isSupra
      ? (req.query.companyId || req.auth.companyId)
      : req.auth.companyId;

    // Vérifier ownership
    const isAdmin = req.auth.role === 'admin' || req.auth.isSupra;
    if (!isAdmin) {
      const contact = db.prepare('SELECT assignedTo, ownerCollaboratorId FROM contacts WHERE id = ? AND companyId = ?').get(contactId, companyId);
      if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
      const isOwner = contact.assignedTo === req.auth.collaboratorId || contact.ownerCollaboratorId === req.auth.collaboratorId;
      if (!isOwner) return res.status(403).json({ error: 'Seul le propriétaire ou admin peut retirer des followers' });
    }

    const result = db.prepare('DELETE FROM contact_followers WHERE contactId = ? AND collaboratorId = ? AND companyId = ?').run(contactId, collaboratorId, companyId);
    res.json({ ok: true, deleted: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── INTER-COLLABORATEUR MEETINGS ────────────────────────────────────────────

/**
 * GET /api/inter-meetings/available-collabs
 * Liste les collabs qui acceptent les RDV internes dans la company
 */
router.get('/available-collabs', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth.isSupra
      ? (req.query.companyId || req.auth.companyId)
      : req.auth.companyId;

    const collabs = db.prepare(`
      SELECT id, name, email, phone, color, acceptInternalMeetings, shareAgendaAvailability,
             autoAcceptMeetings, meetingPriorityLevel
      FROM collaborators
      WHERE companyId = ? AND acceptInternalMeetings = 1
      ORDER BY meetingPriorityLevel DESC, name ASC
    `).all(companyId);

    res.json({ collabs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/inter-meetings/preferences
 * Mettre à jour les préférences RDV du collab connecté
 * Body: { acceptInternalMeetings, shareAgendaAvailability, autoAcceptMeetings, meetingPriorityLevel }
 */
router.put('/preferences', requireAuth, (req, res) => {
  try {
    const { acceptInternalMeetings, shareAgendaAvailability, autoAcceptMeetings, meetingPriorityLevel } = req.body;
    const collabId = req.auth.collaboratorId;

    const sets = [];
    const vals = [];

    if (acceptInternalMeetings !== undefined) { sets.push('acceptInternalMeetings = ?'); vals.push(acceptInternalMeetings ? 1 : 0); }
    if (shareAgendaAvailability !== undefined) { sets.push('shareAgendaAvailability = ?'); vals.push(shareAgendaAvailability ? 1 : 0); }
    if (autoAcceptMeetings !== undefined) { sets.push('autoAcceptMeetings = ?'); vals.push(autoAcceptMeetings ? 1 : 0); }
    if (meetingPriorityLevel !== undefined) { sets.push('meetingPriorityLevel = ?'); vals.push(Math.min(10, Math.max(1, parseInt(meetingPriorityLevel) || 1))); }

    if (sets.length === 0) return res.status(400).json({ error: 'Aucun champ à modifier' });

    vals.push(collabId, req.auth.companyId);
    db.prepare(`UPDATE collaborators SET ${sets.join(', ')} WHERE id = ? AND companyId = ?`).run(...vals);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/inter-meetings/book
 * Créer un RDV inter-collaborateurs
 * Body: {
 *   contactId, executorCollaboratorId, date, time, duration, calendarId,
 *   notes?, bookingType: 'internal'|'transfer', transferMode?
 * }
 * Le bookedByCollaboratorId = le collab connecté (owner)
 * Le meetingCollaboratorId = l'executor
 * L'agendaOwnerId = l'executor (son agenda est utilisé)
 */
router.post('/book', requireAuth, enforceCompany, (req, res) => {
  try {
    const {
      contactId, executorCollaboratorId, date, time, duration,
      calendarId, notes, bookingType, transferMode
    } = req.body;

    const companyId = req.auth.isSupra
      ? (req.query.companyId || req.auth.companyId)
      : req.auth.companyId;

    if (!contactId || !executorCollaboratorId || !date || !time) {
      return res.status(400).json({ error: 'contactId, executorCollaboratorId, date et time requis' });
    }

    // Vérifier contact + company
    const contact = db.prepare('SELECT id, companyId, name, email, phone, assignedTo, ownerCollaboratorId FROM contacts WHERE id = ? AND companyId = ?').get(contactId, companyId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    // Vérifier que l'executor accepte les RDV internes, est dans la même company, et n'est pas archivé (Wave D)
    const executor = db.prepare('SELECT id, name, acceptInternalMeetings, autoAcceptMeetings, archivedAt FROM collaborators WHERE id = ? AND companyId = ?').get(executorCollaboratorId, companyId);
    if (!executor) return res.status(404).json({ error: 'Collaborateur executor introuvable' });
    if (executor.archivedAt && executor.archivedAt !== '') {
      return res.status(409).json({ error: 'EXECUTOR_ARCHIVED', collaboratorId: executorCollaboratorId });
    }
    if (!executor.acceptInternalMeetings) {
      return res.status(403).json({ error: `${executor.name} n'accepte pas les RDV internes` });
    }

    // Non-admin : vérifier que le collab connecté est owner ou assignedTo du contact
    const isAdmin = req.auth.role === 'admin' || req.auth.isSupra;
    if (!isAdmin) {
      const isOwner = contact.assignedTo === req.auth.collaboratorId || contact.ownerCollaboratorId === req.auth.collaboratorId;
      if (!isOwner) return res.status(403).json({ error: 'Seul le propriétaire du contact peut planifier un RDV inter-collab' });
    }

    // Vérifier conflit de créneau sur l'agenda de l'executor
    const safeDuration = duration || 30;
    const [nh, nm] = time.split(':').map(Number);
    const newStart = nh * 60 + nm;
    const newEnd = newStart + safeDuration;
    const dayBookings = db.prepare("SELECT id, time, duration FROM bookings WHERE collaboratorId = ? AND date = ? AND status = 'confirmed' AND companyId = ?").all(executorCollaboratorId, date, companyId);
    const conflict = dayBookings.find(existing => {
      const [eh, em] = existing.time.split(':').map(Number);
      const exStart = eh * 60 + em;
      const exEnd = exStart + (existing.duration || 30);
      return newStart < exEnd && newEnd > exStart;
    });
    if (conflict) {
      return res.status(409).json({ error: 'Créneau déjà occupé sur l\'agenda de l\'executor', conflictId: conflict.id });
    }

    // Trouver ou utiliser le calendarId
    let finalCalendarId = calendarId;
    if (!finalCalendarId) {
      // Chercher le calendrier par défaut de l'executor
      const execCal = db.prepare('SELECT id FROM calendars WHERE companyId = ? AND collaborators_json LIKE ?').get(companyId, `%${executorCollaboratorId}%`);
      if (execCal) finalCalendarId = execCal.id;
      else {
        // Fallback: premier calendrier de la company
        const anyCal = db.prepare('SELECT id FROM calendars WHERE companyId = ? LIMIT 1').get(companyId);
        if (anyCal) finalCalendarId = anyCal.id;
        else return res.status(400).json({ error: 'Aucun calendrier disponible' });
      }
    }

    // R1 + R5 — check conflit via helper partagé (source de vérité unique)
    {
      const { conflict, existingBooking } = checkBookingConflict(db, {
        collaboratorId: executorCollaboratorId,
        date,
        startTime: time,
        duration: safeDuration,
      });
      if (conflict) {
        console.log(`[INTER-MEETING CONFLICT] executor=${executorCollaboratorId} date=${date} time=${time} vs existing=${existingBooking.id}@${existingBooking.time}`);
        return res.status(409).json({ error: "Ce créneau n'est plus disponible", conflictId: existingBooking.id });
      }
    }

    const bookingId = 'b_inter_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const now = new Date().toISOString();
    const status = executor.autoAcceptMeetings ? 'confirmed' : 'pending';
    const safeBookingType = bookingType === 'transfer' ? 'transfer' : 'internal';

    db.prepare(`
      INSERT INTO bookings (id, calendarId, collaboratorId, date, time, duration, visitorName, visitorEmail, visitorPhone,
        status, notes, source, contactId, companyId, bookedByCollaboratorId, meetingCollaboratorId, agendaOwnerId,
        bookingType, transferMode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bookingId, finalCalendarId, executorCollaboratorId, date, time, safeDuration,
      contact.name || '', contact.email || '', contact.phone || '',
      status, notes || '', 'inter-collab', contactId, companyId,
      req.auth.collaboratorId, executorCollaboratorId, executorCollaboratorId,
      safeBookingType, transferMode || ''
    );

    // Mettre à jour le contact avec le meeting executor
    db.prepare(`
      UPDATE contacts SET meetingCollaboratorId = ?, executorCollaboratorId = ?,
        lastMeetingDate = ?, lastMeetingCollaboratorId = ?
      WHERE id = ? AND companyId = ?
    `).run(executorCollaboratorId, executorCollaboratorId, date, executorCollaboratorId, contactId, companyId);

    // Auto-ajouter l'executor comme follower s'il n'est pas déjà owner
    if (executorCollaboratorId !== contact.assignedTo && executorCollaboratorId !== contact.ownerCollaboratorId) {
      const existingFollow = db.prepare('SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ?').get(contactId, executorCollaboratorId);
      if (!existingFollow) {
        const cfId = 'cf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        db.prepare(`
          INSERT INTO contact_followers (id, contactId, collaboratorId, companyId, role, addedAt, addedBy, reason)
          VALUES (?, ?, ?, ?, 'executor', ?, ?, 'RDV inter-collab auto')
        `).run(cfId, contactId, executorCollaboratorId, companyId, now, req.auth.collaboratorId);
      }
    }

    // Log pipeline history
    try {
      db.prepare(`
        INSERT INTO pipeline_history (id, contactId, companyId, fromStage, toStage, userId, userName, note, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'ph_' + Date.now(), contactId, companyId,
        '', 'rdv_inter_collab',
        req.auth.collaboratorId, '',
        `RDV inter-collab planifié avec ${executor.name} le ${date} à ${time}`,
        now
      );
    } catch {} // non-bloquant

    // Audit log obligatoire — distinct par nature du booking (transfer vs internal)
    try {
      const bookerCollabRow = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(req.auth.collaboratorId);
      const auditAction = safeBookingType === 'transfer' ? 'inter_meeting_transfer' : 'inter_meeting_internal';
      const auditDetail = safeBookingType === 'transfer'
        ? `${bookerCollabRow?.name || 'collab'} → ${executor.name} : transfert de ${contact.name || 'un contact'} avec RDV le ${date} à ${time}`
        : `${bookerCollabRow?.name || 'collab'} → ${executor.name} : réunion interne (contexte ${contact.name || 'un contact'}) le ${date} à ${time}`;
      db.prepare(
        `INSERT INTO audit_logs
          (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        companyId,
        req.auth.collaboratorId,
        bookerCollabRow?.name || '',
        req.auth.role || 'member',
        auditAction,
        'inter_meeting',
        'booking',
        bookingId,
        auditDetail,
        JSON.stringify({
          bookingId, contactId, executorCollaboratorId,
          bookingType: safeBookingType, transferMode: transferMode || null,
          date, time, duration: safeDuration,
        }).slice(0, 2000),
        now
      );
    } catch (e) { console.error('[INTER-MEETING AUDIT] error:', e.message); }

    // Effets de bord booking créé : UNIQUEMENT pour les transferts (RDV commercial),
    // jamais pour les réunions internes (pas d'avance pipeline du contact).
    if (safeBookingType === 'transfer' && contactId) {
      applyBookingCreatedSideEffects(db, {
        contactId,
        bookingDate: date,
        source: 'inter_meeting_transfer',
      });
    }

    // ─── PHASE 5 : NOTIFICATIONS ────────────────────────────────────────
    // Notifier l'executor qu'un RDV inter-collab lui est attribué
    try {
      const bookerCollab = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(req.auth.collaboratorId);
      const fmtD = new Date(date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
      createNotification({
        companyId,
        collaboratorId: executorCollaboratorId,
        type: 'inter_meeting_assigned',
        title: `RDV inter-collab assigné`,
        detail: `${bookerCollab?.name || 'Un collaborateur'} vous a assigné un RDV avec ${contact.name || 'un contact'} le ${fmtD} à ${time}`,
        contactId,
        contactName: contact.name || '',
      });
      // Notifier l'owner (booker) si auto-accepté
      if (executor.autoAcceptMeetings && executorCollaboratorId !== req.auth.collaboratorId) {
        createNotification({
          companyId,
          collaboratorId: req.auth.collaboratorId,
          type: 'inter_meeting_confirmed',
          title: `RDV inter-collab confirmé`,
          detail: `${executor.name} a auto-accepté le RDV avec ${contact.name || 'un contact'} le ${fmtD} à ${time}`,
          contactId,
          contactName: contact.name || '',
        });
      }
    } catch {} // non-bloquant

    res.json({
      ok: true,
      bookingId,
      status,
      executorName: executor.name,
      autoAccepted: !!executor.autoAcceptMeetings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/inter-meetings/outcome/:bookingId
 * Enregistrer le résultat d'un RDV inter-collaborateurs.
 * Body: { outcome, note?, pipelineStage? }
 * outcome: 'done'|'no_show'|'rescheduled'|'cancelled'|'transferred'|'qualified'|'not_qualified'
 *
 * Phase 3 — Pipeline sync :
 *   - Met à jour le pipeline_stage du contact chez l'owner selon l'outcome
 *   - Log dans pipeline_history
 *   - Auto-cleanup : retire l'executor des contact_followers si role='executor' (temporaire)
 *     sauf si rescheduled (RDV encore actif)
 */
router.put('/outcome/:bookingId', requireAuth, enforceCompany, (req, res) => {
  try {
    const { bookingId } = req.params;
    const { outcome, note, pipelineStage } = req.body;
    const companyId = req.auth.isSupra
      ? (req.query.companyId || req.auth.companyId)
      : req.auth.companyId;

    const validOutcomes = ['done', 'no_show', 'rescheduled', 'cancelled', 'transferred', 'qualified', 'not_qualified'];
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({ error: 'Outcome invalide', validOutcomes });
    }

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND companyId = ?').get(bookingId, companyId);
    if (!booking) return res.status(404).json({ error: 'Booking introuvable' });

    // Seul l'executor, le booker, ou admin peut enregistrer le résultat
    const isAdmin = req.auth.role === 'admin' || req.auth.isSupra;
    if (!isAdmin) {
      const isInvolved = booking.collaboratorId === req.auth.collaboratorId ||
        booking.bookedByCollaboratorId === req.auth.collaboratorId ||
        booking.meetingCollaboratorId === req.auth.collaboratorId;
      if (!isInvolved) return res.status(403).json({ error: 'Accès refusé' });
    }

    const now = new Date().toISOString();

    // 1. Update booking outcome
    db.prepare(`
      UPDATE bookings SET bookingOutcome = ?, bookingOutcomeNote = ?, bookingOutcomeAt = ?
      WHERE id = ? AND companyId = ?
    `).run(outcome, note || '', now, bookingId, companyId);

    // 2. Update contact with last outcome
    if (booking.contactId) {
      db.prepare(`
        UPDATE contacts SET lastMeetingOutcome = ?, lastMeetingDate = ?, lastMeetingCollaboratorId = ?
        WHERE id = ? AND companyId = ?
      `).run(outcome, booking.date, booking.meetingCollaboratorId || booking.collaboratorId, booking.contactId, companyId);
    }

    // 3. Si annulé, libérer le créneau
    if (outcome === 'cancelled') {
      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND companyId = ?").run(bookingId, companyId);
    }

    // ─── PHASE 3 : PIPELINE SYNC ────────────────────────────────────────

    // 4. Pipeline stage sync : mapper outcome → pipeline_stage chez l'owner
    let syncedStage = null;
    if (booking.contactId) {
      const contact = db.prepare('SELECT pipeline_stage, assignedTo, ownerCollaboratorId FROM contacts WHERE id = ?').get(booking.contactId);
      if (contact) {
        // Déterminer le nouveau stage
        // Si pipelineStage est fourni explicitement par l'executor, on l'utilise
        // Sinon mapping automatique outcome → stage
        const OUTCOME_TO_STAGE = {
          done: 'contacte',        // RDV fait → contacté (l'owner décidera de qualifier)
          qualified: 'qualifie',   // Qualifié par l'executor
          not_qualified: 'perdu',  // Non qualifié
          no_show: 'nrp',          // Pas venu
          cancelled: null,         // Pas de changement auto
          rescheduled: null,       // Pas de changement (RDV encore actif)
          transferred: null,       // Le transfert est géré séparément
        };

        const newStage = pipelineStage || OUTCOME_TO_STAGE[outcome];
        if (newStage && newStage !== contact.pipeline_stage) {
          const fromStage = contact.pipeline_stage || 'nouveau';
          db.prepare('UPDATE contacts SET pipeline_stage = ? WHERE id = ? AND companyId = ?')
            .run(newStage, booking.contactId, companyId);
          syncedStage = newStage;

          // Log dans pipeline_history
          try {
            const executorName = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(booking.meetingCollaboratorId || booking.collaboratorId)?.name || '';
            db.prepare(`
              INSERT INTO pipeline_history (id, contactId, companyId, fromStage, toStage, userId, userName, note, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              'ph_inter_' + Date.now(),
              booking.contactId, companyId,
              fromStage, newStage,
              booking.meetingCollaboratorId || booking.collaboratorId,
              executorName,
              `[RDV inter-collab] Outcome: ${outcome}${note ? ' — ' + note : ''}`,
              now
            );
          } catch {} // non-bloquant
        }
      }
    }

    // 5. Auto-cleanup : retirer l'executor des contact_followers
    //    SAUF si rescheduled (le RDV est toujours actif)
    //    SAUF si le follower a un role != 'executor' (follower permanent / viewer / owner)
    let followerRemoved = false;
    if (booking.contactId && outcome !== 'rescheduled') {
      const executorId = booking.meetingCollaboratorId || booking.collaboratorId;
      const cf = db.prepare(
        "SELECT id, role FROM contact_followers WHERE contactId = ? AND collaboratorId = ? AND role = 'executor'"
      ).get(booking.contactId, executorId);
      if (cf) {
        db.prepare('DELETE FROM contact_followers WHERE id = ?').run(cf.id);
        followerRemoved = true;
      }
    }

    // ─── PHASE 5 : NOTIFICATIONS (outcome) ─────────────────────────────
    try {
      const OUTCOME_FR = {
        done: 'Effectué', qualified: 'Qualifié', not_qualified: 'Non qualifié',
        no_show: 'No-show', cancelled: 'Annulé', rescheduled: 'Replanifié', transferred: 'Transféré',
      };
      const executorId = booking.meetingCollaboratorId || booking.collaboratorId;
      const executorName = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(executorId)?.name || 'Collaborateur';
      const contactRow = db.prepare('SELECT name, assignedTo, ownerCollaboratorId FROM contacts WHERE id = ?').get(booking.contactId);
      const contactName = contactRow?.name || 'Contact';
      const ownerId = contactRow?.ownerCollaboratorId || contactRow?.assignedTo;

      // Notifier l'owner que l'executor a enregistré un résultat
      if (ownerId && ownerId !== req.auth.collaboratorId) {
        createNotification({
          companyId,
          collaboratorId: ownerId,
          type: 'inter_meeting_outcome',
          title: `Résultat RDV : ${OUTCOME_FR[outcome] || outcome}`,
          detail: `${executorName} a enregistré "${OUTCOME_FR[outcome]}" pour ${contactName}${note ? ' — ' + note.slice(0, 100) : ''}`,
          contactId: booking.contactId,
          contactName,
        });
      }
      // Notifier l'executor (confirmation) s'il n'est pas celui qui a soumis
      if (executorId !== req.auth.collaboratorId) {
        createNotification({
          companyId,
          collaboratorId: executorId,
          type: 'inter_meeting_outcome',
          title: `Résultat enregistré : ${OUTCOME_FR[outcome] || outcome}`,
          detail: `Le résultat "${OUTCOME_FR[outcome]}" a été enregistré pour ${contactName}${syncedStage ? ' → Pipeline: ' + syncedStage : ''}`,
          contactId: booking.contactId,
          contactName,
        });
      }
    } catch {} // non-bloquant

    res.json({
      ok: true,
      outcome,
      syncedStage,
      followerRemoved,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/inter-meetings/my-meetings
 * Liste les RDV internes du collab connecté (bookedBy ou executor)
 */
router.get('/my-meetings', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth.isSupra
      ? (req.query.companyId || req.auth.companyId)
      : req.auth.companyId;
    const collabId = req.auth.collaboratorId;

    const meetings = db.prepare(`
      SELECT b.*, c.name as contactName, c.phone as contactPhone, c.email as contactEmail,
        booker.name as bookedByName, executor.name as executorName
      FROM bookings b
      LEFT JOIN contacts c ON b.contactId = c.id
      LEFT JOIN collaborators booker ON b.bookedByCollaboratorId = booker.id
      LEFT JOIN collaborators executor ON b.meetingCollaboratorId = executor.id
      WHERE b.companyId = ?
        AND b.bookingType IN ('internal', 'transfer')
        AND (b.bookedByCollaboratorId = ? OR b.meetingCollaboratorId = ? OR b.collaboratorId = ?)
      ORDER BY b.date DESC, b.time DESC
    `).all(companyId, collabId, collabId, collabId);

    res.json({ meetings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/inter-meetings/contact/:contactId/history
 * Historique des RDV inter-collab pour un contact donné
 */
router.get('/contact/:contactId/history', requireAuth, enforceCompany, (req, res) => {
  try {
    const { contactId } = req.params;
    const companyId = req.auth.isSupra
      ? (req.query.companyId || req.auth.companyId)
      : req.auth.companyId;

    // Vérifier accès au contact
    const contact = db.prepare('SELECT id, companyId, assignedTo, ownerCollaboratorId FROM contacts WHERE id = ? AND companyId = ?').get(contactId, companyId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    const isAdmin = req.auth.role === 'admin' || req.auth.isSupra;
    if (!isAdmin) {
      const isOwner = contact.assignedTo === req.auth.collaboratorId || contact.ownerCollaboratorId === req.auth.collaboratorId;
      const isFollower = db.prepare('SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ?').get(contactId, req.auth.collaboratorId);
      if (!isOwner && !isFollower) return res.status(403).json({ error: 'Accès refusé' });
    }

    const history = db.prepare(`
      SELECT b.id, b.date, b.time, b.duration, b.status, b.bookingType, b.bookingOutcome,
        b.bookingOutcomeNote, b.bookingOutcomeAt, b.transferMode, b.notes,
        booker.name as bookedByName, executor.name as executorName
      FROM bookings b
      LEFT JOIN collaborators booker ON b.bookedByCollaboratorId = booker.id
      LEFT JOIN collaborators executor ON b.meetingCollaboratorId = executor.id
      WHERE b.contactId = ? AND b.companyId = ?
        AND b.bookingType IN ('internal', 'transfer')
      ORDER BY b.date DESC, b.time DESC
    `).all(contactId, companyId);

    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 2 : MOTEUR AGENDA INTELLIGENT ─────────────────────────────────────

/**
 * GET /api/inter-meetings/slots/:collaboratorId
 * Calcule les créneaux libres d'un collaborateur pour un jour donné.
 * Query: date (YYYY-MM-DD), duration (min, défaut 30), calendarId? (pour buffers)
 *
 * Logique identique à public.js generateSlots mais ciblée sur 1 collab :
 *   1. Lire schedule_json (availabilities)
 *   2. Exclure bookings confirmés (overlap avec buffers)
 *   3. Exclure google_events (opaque)
 *   4. Respecter minNotice du calendrier
 *   5. Incrément de 15 min
 */
router.get('/slots/:collaboratorId', requireAuth, enforceCompany, (req, res) => {
  try {
    const { collaboratorId } = req.params;
    const { date, calendarId } = req.query;
    const duration = parseInt(req.query.duration) || 30;
    const companyId = req.auth.isSupra
      ? (req.query.companyId || req.auth.companyId)
      : req.auth.companyId;

    if (!date) return res.status(400).json({ error: 'Date requise (YYYY-MM-DD)' });

    // Vérifier que le collab existe et est dans la company
    const collab = db.prepare('SELECT id, name, acceptInternalMeetings, shareAgendaAvailability FROM collaborators WHERE id = ? AND companyId = ?').get(collaboratorId, companyId);
    if (!collab) return res.status(404).json({ error: 'Collaborateur introuvable' });
    if (!collab.shareAgendaAvailability) {
      return res.status(403).json({ error: `${collab.name} ne partage pas son agenda` });
    }

    // Resolve timezone
    const collabTz = getCollaboratorTimezone(collaboratorId, companyId);
    const nowMs = Date.now();

    // Day of week (0=Mon convention Calendar360)
    const dayOfWeek = (new Date(date + 'T12:00:00').getDay() + 6) % 7;

    // Load availability
    const availRow = db.prepare('SELECT schedule_json FROM availabilities WHERE collaboratorId = ?').get(collaboratorId);
    if (!availRow) return res.json({ slots: [], message: 'Aucune disponibilité configurée' });

    const schedule = JSON.parse(availRow.schedule_json);
    const daySchedule = schedule[dayOfWeek];
    if (!daySchedule || !daySchedule.active) {
      return res.json({ slots: [], message: 'Jour non travaillé' });
    }

    // Load calendar buffers + minNotice (si calendarId fourni)
    let bufferBefore = 0, bufferAfter = 0, minNoticeMs = 60 * 60000;
    if (calendarId) {
      const cal = db.prepare('SELECT bufferBefore, bufferAfter, minNotice FROM calendars WHERE id = ? AND companyId = ?').get(calendarId, companyId);
      if (cal) {
        bufferBefore = cal.bufferBefore || 0;
        bufferAfter = cal.bufferAfter || 0;
        minNoticeMs = (cal.minNotice || 60) * 60000;
      }
    }

    // Load blackout dates
    const settings = db.prepare('SELECT blackoutDates_json FROM settings WHERE companyId = ?').get(companyId);
    const blackouts = settings ? JSON.parse(settings.blackoutDates_json || '[]') : [];
    if (blackouts.includes(date)) return res.json({ slots: [], message: 'Jour bloqué (blackout)' });

    // Load existing bookings for this collab on this date
    const collabBookings = db.prepare(
      "SELECT time, duration FROM bookings WHERE collaboratorId = ? AND date = ? AND status = 'confirmed' AND companyId = ?"
    ).all(collaboratorId, date, companyId);

    // Load Google Calendar conflicts
    const googleConflicts = [];
    try {
      const gEvents = db.prepare(
        `SELECT startTime, endTime, allDay FROM google_events
         WHERE collaboratorId = ? AND startTime < ? AND endTime > ?`
      ).all(collaboratorId, `${date}T23:59:59`, `${date}T00:00:00`);

      for (const ge of gEvents) {
        if (ge.allDay) {
          googleConflicts.push({ start: 0, end: 1440 });
        } else {
          const geStart = DateTime.fromISO(ge.startTime, { zone: collabTz });
          const geEnd = DateTime.fromISO(ge.endTime, { zone: collabTz });
          const startMin = geStart.toFormat('yyyy-MM-dd') === date ? geStart.hour * 60 + geStart.minute : 0;
          const endMin = geEnd.toFormat('yyyy-MM-dd') === date ? geEnd.hour * 60 + geEnd.minute : 1440;
          if (endMin > startMin) googleConflicts.push({ start: startMin, end: endMin });
        }
      }
    } catch {} // google_events table might not exist

    // Generate slots
    const slots = [];
    for (const slot of daySchedule.slots) {
      const startMinutes = timeToMinutes(slot.start);
      const endMinutes = timeToMinutes(slot.end);

      for (let m = startMinutes; m + duration <= endMinutes; m += 15) {
        const timeStr = minutesToTime(m);

        // Check min notice (timezone-aware)
        const slotLuxon = DateTime.fromISO(`${date}T${timeStr}:00`, { zone: collabTz });
        if (slotLuxon.toMillis() - nowMs < minNoticeMs) continue;

        // Check overlap with buffers
        const slotStart = m - bufferBefore;
        const slotEnd = m + duration + bufferAfter;

        const hasBookingConflict = collabBookings.some(b => {
          const bStart = timeToMinutes(b.time);
          const bEnd = bStart + (b.duration || 30);
          return slotStart < bEnd && slotEnd > bStart;
        });

        const hasGoogleConflict = googleConflicts.some(gc => slotStart < gc.end && slotEnd > gc.start);

        if (!hasBookingConflict && !hasGoogleConflict) {
          slots.push({
            time: timeStr,
            endTime: minutesToTime(m + duration),
            minutes: m,
          });
        }
      }
    }

    res.json({
      slots,
      collaborator: { id: collab.id, name: collab.name, timezone: collabTz },
      date,
      duration,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/inter-meetings/agenda-preview/:collaboratorId
 * Vue condensée de l'agenda d'un collaborateur pour une plage de dates.
 * Query: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD, défaut +7j)
 *
 * Retourne par jour : créneaux occupés (bookings + google) + disponibilités + taux remplissage
 */
router.get('/agenda-preview/:collaboratorId', requireAuth, enforceCompany, (req, res) => {
  try {
    const { collaboratorId } = req.params;
    const companyId = req.auth.isSupra
      ? (req.query.companyId || req.auth.companyId)
      : req.auth.companyId;

    // Vérifier collab + shareAgendaAvailability
    const collab = db.prepare('SELECT id, name, shareAgendaAvailability FROM collaborators WHERE id = ? AND companyId = ?').get(collaboratorId, companyId);
    if (!collab) return res.status(404).json({ error: 'Collaborateur introuvable' });
    if (!collab.shareAgendaAvailability) {
      return res.status(403).json({ error: `${collab.name} ne partage pas son agenda` });
    }

    const collabTz = getCollaboratorTimezone(collaboratorId, companyId);

    const startDate = req.query.startDate || DateTime.now().setZone(collabTz).toFormat('yyyy-MM-dd');
    const endDate = req.query.endDate || DateTime.fromISO(startDate).plus({ days: 7 }).toFormat('yyyy-MM-dd');

    // Load availability
    const availRow = db.prepare('SELECT schedule_json FROM availabilities WHERE collaboratorId = ?').get(collaboratorId);
    const schedule = availRow ? JSON.parse(availRow.schedule_json) : {};

    // Load blackouts
    const settings = db.prepare('SELECT blackoutDates_json FROM settings WHERE companyId = ?').get(companyId);
    const blackouts = new Set(settings ? JSON.parse(settings.blackoutDates_json || '[]') : []);

    // Load all bookings in range
    const bookings = db.prepare(
      "SELECT date, time, duration, status, visitorName, bookingType, bookingOutcome FROM bookings WHERE collaboratorId = ? AND companyId = ? AND date >= ? AND date <= ? AND status != 'cancelled'"
    ).all(collaboratorId, companyId, startDate, endDate);

    // Load all google events in range
    let googleEvents = [];
    try {
      googleEvents = db.prepare(
        `SELECT startTime, endTime, allDay, summary FROM google_events
         WHERE collaboratorId = ? AND startTime < ? AND endTime > ?`
      ).all(collaboratorId, `${endDate}T23:59:59`, `${startDate}T00:00:00`);
    } catch {}

    // Build day-by-day summary
    const days = [];
    let currentDate = DateTime.fromISO(startDate);
    const lastDate = DateTime.fromISO(endDate);

    while (currentDate <= lastDate) {
      const dateStr = currentDate.toFormat('yyyy-MM-dd');
      const dayOfWeek = (currentDate.weekday - 1); // Luxon: 1=Mon, so 1-1=0=Mon (matches Calendar360 convention)
      const daySchedule = schedule[dayOfWeek];
      const isBlackout = blackouts.has(dateStr);
      const isActive = daySchedule?.active && !isBlackout;

      // Calculate total available minutes for the day
      let totalAvailableMinutes = 0;
      if (isActive && daySchedule?.slots) {
        for (const slot of daySchedule.slots) {
          totalAvailableMinutes += timeToMinutes(slot.end) - timeToMinutes(slot.start);
        }
      }

      // Count bookings for this day
      const dayBookings = bookings.filter(b => b.date === dateStr);
      const totalBookedMinutes = dayBookings.reduce((sum, b) => sum + (b.duration || 30), 0);

      // Count google events for this day
      const dayGoogleEvents = [];
      for (const ge of googleEvents) {
        if (ge.allDay) {
          const geDate = ge.startTime.split('T')[0];
          if (geDate === dateStr) dayGoogleEvents.push({ summary: ge.summary, allDay: true, minutes: 1440 });
        } else {
          const geStart = DateTime.fromISO(ge.startTime, { zone: collabTz });
          const geEnd = DateTime.fromISO(ge.endTime, { zone: collabTz });
          if (geStart.toFormat('yyyy-MM-dd') <= dateStr && geEnd.toFormat('yyyy-MM-dd') >= dateStr) {
            const startMin = geStart.toFormat('yyyy-MM-dd') === dateStr ? geStart.hour * 60 + geStart.minute : 0;
            const endMin = geEnd.toFormat('yyyy-MM-dd') === dateStr ? geEnd.hour * 60 + geEnd.minute : 1440;
            if (endMin > startMin) {
              dayGoogleEvents.push({ summary: ge.summary, allDay: false, minutes: endMin - startMin });
            }
          }
        }
      }
      const totalGoogleMinutes = dayGoogleEvents.reduce((sum, g) => sum + g.minutes, 0);

      // Fill rate
      const occupiedMinutes = totalBookedMinutes + totalGoogleMinutes;
      const fillRate = totalAvailableMinutes > 0 ? Math.round((occupiedMinutes / totalAvailableMinutes) * 100) : 0;

      days.push({
        date: dateStr,
        dayOfWeek: currentDate.weekdayLong,
        isActive,
        isBlackout,
        availableSlots: isActive ? (daySchedule?.slots || []) : [],
        totalAvailableMinutes,
        bookingsCount: dayBookings.length,
        totalBookedMinutes,
        googleEventsCount: dayGoogleEvents.length,
        totalGoogleMinutes,
        fillRate: Math.min(100, fillRate),
        status: !isActive ? 'closed' : fillRate >= 90 ? 'full' : fillRate >= 50 ? 'busy' : 'available',
      });

      currentDate = currentDate.plus({ days: 1 });
    }

    res.json({
      collaborator: { id: collab.id, name: collab.name, timezone: collabTz },
      startDate,
      endDate,
      days,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/inter-meetings/multi-slots
 * Créneaux libres COMMUNS entre plusieurs collaborateurs pour un jour donné.
 * Query: collaboratorIds (comma-separated), date, duration
 * Utile pour les réunions d'équipe ou les RDV qui nécessitent plusieurs personnes.
 */
router.get('/multi-slots', requireAuth, enforceCompany, (req, res) => {
  try {
    const { date, collaboratorIds: rawIds } = req.query;
    const duration = parseInt(req.query.duration) || 30;
    const companyId = req.auth.isSupra
      ? (req.query.companyId || req.auth.companyId)
      : req.auth.companyId;

    if (!date || !rawIds) return res.status(400).json({ error: 'date et collaboratorIds requis' });

    const collabIds = rawIds.split(',').map(s => s.trim()).filter(Boolean);
    if (collabIds.length < 2) return res.status(400).json({ error: 'Au moins 2 collaborateurs requis' });
    if (collabIds.length > 10) return res.status(400).json({ error: 'Maximum 10 collaborateurs' });

    const dayOfWeek = (new Date(date + 'T12:00:00').getDay() + 6) % 7;

    // Pour chaque collab, calculer les créneaux occupés (bookings + google)
    const collabOccupied = []; // array of arrays of {start, end} ranges

    for (const cid of collabIds) {
      const c = db.prepare('SELECT id, name, shareAgendaAvailability FROM collaborators WHERE id = ? AND companyId = ?').get(cid, companyId);
      if (!c) return res.status(404).json({ error: `Collaborateur ${cid} introuvable` });
      if (!c.shareAgendaAvailability) return res.status(403).json({ error: `${c.name} ne partage pas son agenda` });

      const collabTz = getCollaboratorTimezone(cid, companyId);
      const occupied = [];

      // Bookings
      const bookings = db.prepare(
        "SELECT time, duration FROM bookings WHERE collaboratorId = ? AND date = ? AND status = 'confirmed' AND companyId = ?"
      ).all(cid, date, companyId);
      for (const b of bookings) {
        const s = timeToMinutes(b.time);
        occupied.push({ start: s, end: s + (b.duration || 30) });
      }

      // Google events
      try {
        const gEvents = db.prepare(
          `SELECT startTime, endTime, allDay FROM google_events
           WHERE collaboratorId = ? AND startTime < ? AND endTime > ?`
        ).all(cid, `${date}T23:59:59`, `${date}T00:00:00`);
        for (const ge of gEvents) {
          if (ge.allDay) {
            occupied.push({ start: 0, end: 1440 });
          } else {
            const geStart = DateTime.fromISO(ge.startTime, { zone: collabTz });
            const geEnd = DateTime.fromISO(ge.endTime, { zone: collabTz });
            const startMin = geStart.toFormat('yyyy-MM-dd') === date ? geStart.hour * 60 + geStart.minute : 0;
            const endMin = geEnd.toFormat('yyyy-MM-dd') === date ? geEnd.hour * 60 + geEnd.minute : 1440;
            if (endMin > startMin) occupied.push({ start: startMin, end: endMin });
          }
        }
      } catch {}

      collabOccupied.push(occupied);
    }

    // Calculer l'intersection des disponibilités
    // D'abord, récupérer les plages dispo de chaque collab
    const collabAvailRanges = [];
    for (const cid of collabIds) {
      const availRow = db.prepare('SELECT schedule_json FROM availabilities WHERE collaboratorId = ?').get(cid);
      if (!availRow) return res.json({ slots: [], message: `${cid} n'a pas de disponibilités` });
      const sched = JSON.parse(availRow.schedule_json);
      const day = sched[dayOfWeek];
      if (!day?.active) return res.json({ slots: [], message: 'Au moins un collaborateur ne travaille pas ce jour' });
      collabAvailRanges.push(day.slots.map(s => ({ start: timeToMinutes(s.start), end: timeToMinutes(s.end) })));
    }

    // Intersection des plages dispo (génération de créneaux de 15min, vérification que TOUS sont libres)
    const nowMs = Date.now();
    const refTz = getCollaboratorTimezone(collabIds[0], companyId);
    const slots = [];

    // Utiliser les plages du premier collab comme base, itérer 15min
    for (const range of collabAvailRanges[0]) {
      for (let m = range.start; m + duration <= range.end; m += 15) {
        const timeStr = minutesToTime(m);
        const slotLuxon = DateTime.fromISO(`${date}T${timeStr}:00`, { zone: refTz });
        if (slotLuxon.toMillis() - nowMs < 60 * 60000) continue; // 1h notice minimum

        const slotStart = m;
        const slotEnd = m + duration;

        // Vérifier que ce créneau est dans les plages de TOUS les collabs
        let allAvailable = true;
        for (let i = 0; i < collabIds.length; i++) {
          // Check dans les plages dispo
          const inRange = collabAvailRanges[i].some(r => slotStart >= r.start && slotEnd <= r.end);
          if (!inRange) { allAvailable = false; break; }

          // Check pas de conflit
          const hasConflict = collabOccupied[i].some(o => slotStart < o.end && slotEnd > o.start);
          if (hasConflict) { allAvailable = false; break; }
        }

        if (allAvailable) {
          slots.push({ time: timeStr, endTime: minutesToTime(slotEnd) });
        }
      }
    }

    res.json({ slots, date, duration, collaboratorIds: collabIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
