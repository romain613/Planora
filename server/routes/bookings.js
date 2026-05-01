import { Router } from 'express';
import { db, getById, insert, update, remove, getCollaboratorTimezone } from '../db/database.js';
import { autoPipelineAdvance } from '../helpers/pipelineAuto.js';
import { updateBehaviorScore } from '../helpers/behaviorScore.js';
import { sendEmail } from '../services/brevoEmail.js';
import { bookingConfirmedEmail } from '../templates/bookingConfirmed.js';
import { cancelledEmail } from '../templates/cancelled.js';
import { createEvent, updateEvent, deleteEvent, isConnected } from '../services/googleCalendar.js';
import { createFollowUpTask } from '../services/googleTasks.js';
import { sendChatNotification, formatNewBooking, formatCancelledBooking, formatConfirmedBooking } from '../services/googleChat.js';
import { checkBookingConflict } from '../services/bookings/checkBookingConflict.js';
import { applyBookingCreatedSideEffects } from '../services/bookings/applyBookingCreatedSideEffects.js';
import { markNoShow } from '../services/bookings/markNoShow.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { createNotification } from './notifications.js';

// ─── V1.10.3 Phase 2 — Reporting Collab RDV ──────────────────────────
// Enum officiel des statuts (cf. brief MH 2026-04-27)
const REPORTING_STATUSES = ['pending', 'validated', 'signed', 'no_show', 'cancelled', 'follow_up', 'other'];
// Statuts qui exigent une note non-vide
const REPORTING_STATUSES_REQUIRING_NOTE = ['signed', 'cancelled', 'no_show', 'follow_up', 'other'];

const router = Router();

// GET /api/bookings?calendarId=...
router.get('/', requireAuth, enforceCompany, requirePermission('bookings.view'), (req, res) => {
  try {
    const { calendarId } = req.query;
    const safeCompanyId = req.auth?.companyId || req.companyId;
    let rows;
    const isAdmin = req.auth?.role === 'admin' || req.auth?.isSupra;
    if (calendarId) {
      // Vérifier que le calendrier appartient à la company
      const cal = db.prepare('SELECT companyId FROM calendars WHERE id = ?').get(calendarId);
      if (cal && cal.companyId !== safeCompanyId && !req.auth?.isSupra) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
      // SECURITE: non-admin voit ses RDV + ceux reçus en transfert (V1.10.3)
      // - collaboratorId        = legacy owner
      // - agendaOwnerId         = receiver (collab B qui rapporte)
      // - bookedByCollaboratorId = sender (collab A qui transmet)
      if (isAdmin) {
        rows = db.prepare('SELECT * FROM bookings WHERE calendarId = ?').all(calendarId);
      } else {
        const cid = req.auth.collaboratorId;
        rows = db.prepare(
          'SELECT * FROM bookings WHERE calendarId = ? AND (collaboratorId = ? OR agendaOwnerId = ? OR bookedByCollaboratorId = ?)'
        ).all(calendarId, cid, cid, cid);
      }
    } else {
      // Toujours filtrer par company — jamais de SELECT * global
      // SECURITE: non-admin voit ses RDV + ceux reçus en transfert (V1.10.3)
      if (isAdmin) {
        rows = db.prepare(`SELECT b.* FROM bookings b JOIN calendars c ON b.calendarId = c.id WHERE c.companyId = ?`).all(safeCompanyId);
      } else {
        const cid = req.auth.collaboratorId;
        rows = db.prepare(
          `SELECT b.* FROM bookings b JOIN calendars c ON b.calendarId = c.id WHERE c.companyId = ? AND (b.collaboratorId = ? OR b.agendaOwnerId = ? OR b.bookedByCollaboratorId = ?)`
        ).all(safeCompanyId, cid, cid, cid);
      }
    }
    const parsed = rows.map(b => {
      const r = { ...b };
      r.tags = JSON.parse(r.tags_json || '[]');
      delete r.tags_json;
      r.noShow = !!r.noShow;
      r.checkedIn = !!r.checkedIn;
      r.reconfirmed = !!r.reconfirmed;
      return r;
    });
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bookings
router.post('/', requireAuth, enforceCompany, requirePermission('bookings.create'), (req, res) => {
  try {
    const b = req.body;
    // Wave D — refuser de créer un booking pour un collab archivé
    if (b.collaboratorId) {
      const collabActive = db.prepare("SELECT 1 FROM collaborators WHERE id = ? AND (archivedAt IS NULL OR archivedAt = '')").get(b.collaboratorId);
      if (!collabActive) {
        return res.status(409).json({ error: 'COLLABORATOR_ARCHIVED', collaboratorId: b.collaboratorId });
      }
    }
    // V1.8.22 Phase A — Validation stricte contactId si fourni (refus booking orphelin)
    // Ne rejette que si un contactId est explicitement passé. Si absent, le path
    // d'auto-création/dedup (V5-BOOKING ci-dessous) reste actif et inchangé.
    if (b.contactId) {
      const existingContact = db.prepare(
        'SELECT id, companyId, assignedTo, shared_with_json, name, archivedAt FROM contacts WHERE id = ?'
      ).get(b.contactId);
      if (!existingContact) {
        console.warn(`[BOOKING REJECTED] CONTACT_NOT_FOUND contactId=${b.contactId} collab=${req.auth.collaboratorId||''} company=${req.auth.companyId||''}`);
        return res.status(400).json({ error: 'CONTACT_NOT_FOUND', contactId: b.contactId });
      }
      if (!req.auth.isSupra && existingContact.companyId !== (req.auth.companyId || '')) {
        console.warn(`[BOOKING REJECTED] CONTACT_WRONG_COMPANY contactId=${b.contactId} contactCompany=${existingContact.companyId} authCompany=${req.auth.companyId||''}`);
        return res.status(403).json({ error: 'CONTACT_WRONG_COMPANY', contactId: b.contactId });
      }
      // V1.12.6 — refus booking si contact archive
      if (existingContact.archivedAt && existingContact.archivedAt !== '') {
        console.warn(`[BOOKING REJECTED] CONTACT_ARCHIVED contactId=${b.contactId} archivedAt=${existingContact.archivedAt}`);
        return res.status(409).json({ error: 'CONTACT_ARCHIVED', contactId: b.contactId, archivedAt: existingContact.archivedAt });
      }
    }
    // R1 + R5 — source de vérité unique du check conflit (helper partagé)
    if (b.collaboratorId && b.date && b.time) {
      const { conflict, existingBooking } = checkBookingConflict(db, {
        collaboratorId: b.collaboratorId,
        date: b.date,
        startTime: b.time,
        duration: b.duration || 30,
      });
      if (conflict) {
        console.log(`[BOOKING CONFLICT] collab=${b.collaboratorId} date=${b.date} time=${b.time} vs existing=${existingBooking.id}@${existingBooking.time}`);
        return res.status(409).json({ error: 'Creneau deja occupe (chevauchement)', conflictId: existingBooking.id });
      }
    }
    const id = b.id || 'b' + Date.now();
    const companyId = req.auth.companyId || b.companyId || '';
    const collabId = b.collaboratorId || '';

    // V5-BOOKING: Auto-creation/dedup contact si contactId absent
    if (!b.contactId && (b.visitorEmail || b.visitorPhone) && companyId) {
      let existingContact = null;
      // Dedup par email
      if (b.visitorEmail) {
        existingContact = db.prepare("SELECT id FROM contacts WHERE LOWER(email) = LOWER(?) AND companyId = ? AND assignedTo = ? AND (archivedAt IS NULL OR archivedAt = '')").get(b.visitorEmail.trim(), companyId, collabId);
      }
      // Dedup par telephone
      if (!existingContact && b.visitorPhone) {
        const cleanPh = (b.visitorPhone || '').replace(/[^\d]/g, '').slice(-9);
        if (cleanPh.length >= 9) {
          const candidates = db.prepare("SELECT id, phone, mobile FROM contacts WHERE companyId = ? AND assignedTo = ? AND (phone != '' OR mobile != '') AND (archivedAt IS NULL OR archivedAt = '')").all(companyId, collabId);
          for (const c of candidates) {
            const cp = (c.phone || c.mobile || '').replace(/[^\d]/g, '').slice(-9);
            if (cp === cleanPh) { existingContact = c; break; }
          }
        }
      }
      if (existingContact) {
        b.contactId = existingContact.id;
        console.log(`[BOOKING] Contact existant rattache: ${existingContact.id} pour ${b.visitorName}`);
      } else {
        // Creer un vrai contact CRM
        const newContactId = 'ct_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        insert('contacts', {
          id: newContactId, companyId,
          name: b.visitorName || 'Contact booking',
          email: b.visitorEmail || '', phone: b.visitorPhone || '',
          totalBookings: 0, lastVisit: b.date || '',
          tags_json: '[]', notes: '', rating: null, docs_json: '[]',
          pipeline_stage: 'nouveau', assignedTo: collabId,
          shared_with_json: '[]', source: 'booking',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
        b.contactId = newContactId;
        console.log(`[BOOKING] Contact CRM cree: ${newContactId} (${b.visitorName}) → ${collabId}`);
      }
    }

    const manageToken = 'mt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    insert('bookings', {
      id,
      calendarId: b.calendarId,
      collaboratorId: b.collaboratorId || null,
      date: b.date,
      time: b.time,
      duration: b.duration || 30,
      visitorName: b.visitorName,
      visitorEmail: b.visitorEmail || '',
      visitorPhone: b.visitorPhone || '',
      status: b.status || 'confirmed',
      notes: b.notes || '',
      noShow: b.noShow ? 1 : 0,
      source: b.source || 'link',
      rating: b.rating || null,
      tags_json: JSON.stringify(b.tags || []),
      checkedIn: b.checkedIn ? 1 : 0,
      internalNotes: b.internalNotes || '',
      reconfirmed: b.reconfirmed ? 1 : 0,
      contactId: b.contactId || '',
      companyId: req.auth.companyId || b.companyId || '', // SECURITY: always prefer session companyId
      rdv_category: b.rdv_category || '',
      rdv_subcategory: b.rdv_subcategory || '',
      manageToken,
      bookedByCollaboratorId: b.bookedByCollaboratorId || null,
      agendaOwnerId: b.agendaOwnerId || b.collaboratorId || null,
      // V1.10.3 P1 — auto-marque le booking comme 'share_transfer' si un collab le crée
      // pour le compte d'un autre collab (sender ≠ owner). Permet à GET /reporting de
      // remonter ces RDV dans Reporting > Transmis. Si bookingType est explicitement
      // posé (ex: 'internal' depuis interMeetings), on respecte la valeur fournie.
      bookingType: (b.bookingType && b.bookingType !== '')
        ? b.bookingType
        : ((b.bookedByCollaboratorId && b.collaboratorId && b.bookedByCollaboratorId !== b.collaboratorId)
            ? 'share_transfer'
            : 'external'),
    });

    // Sync to Google Calendar + Meet link
    if (b.collaboratorId && isConnected(b.collaboratorId)) {
      const cal = db.prepare('SELECT name, location FROM calendars WHERE id = ?').get(b.calendarId);
      createEvent(b.collaboratorId, { date: b.date, time: b.time, duration: b.duration || 30, visitorName: b.visitorName, visitorEmail: b.visitorEmail, visitorPhone: b.visitorPhone }, cal || { name: '', location: '' })
        .then(result => {
          if (result?.googleEventId) db.prepare('UPDATE bookings SET googleEventId = ? WHERE id = ?').run(result.googleEventId, id);
          if (result?.meetLink) db.prepare('UPDATE bookings SET meetLink = ? WHERE id = ?').run(result.meetLink, id);
        })
        .catch(err => console.error('[GOOGLE SYNC ERROR]', err.message));
    }

    // Auto-create Google Tasks follow-up (fire-and-forget)
    if (b.collaboratorId && isConnected(b.collaboratorId)) {
      const cal = db.prepare('SELECT name FROM calendars WHERE id = ?').get(b.calendarId);
      const settings = db.prepare(`
        SELECT s.google_tasks_auto FROM settings s
        JOIN calendars c ON c.companyId = s.companyId
        WHERE c.id = ?
      `).get(b.calendarId);
      if (settings?.google_tasks_auto !== 0) {
        createFollowUpTask(b.collaboratorId, b, cal?.name || 'RDV').catch(() => {});
      }
    }

    // Google Chat notification (fire-and-forget)
    {
      const cal = db.prepare('SELECT * FROM calendars WHERE id = ?').get(b.calendarId);
      if (cal) {
        const settings = db.prepare('SELECT google_chat_webhook FROM settings WHERE companyId = ?').get(cal.companyId);
        if (settings?.google_chat_webhook) {
          const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(cal.companyId);
          const collab = b.collaboratorId ? db.prepare('SELECT name FROM collaborators WHERE id = ?').get(b.collaboratorId) : null;
          sendChatNotification(settings.google_chat_webhook, formatNewBooking(b, cal.name, collab?.name, company?.name || 'Calendar360')).catch(() => {});
        }
      }
    }

    // Effets de bord booking créé (factorisés via helper unique)
    if (b.contactId && b.status !== 'cancelled') {
      applyBookingCreatedSideEffects(db, { contactId: b.contactId, bookingDate: b.date, source: 'bookings_post' });
    }

    // V1.8.22 Phase A — log structuré post-création (observabilité flow RDV)
    console.log(`[BOOKING CREATED] id=${id} contactId=${b.contactId||''} collab=${b.collaboratorId||''} company=${companyId} date=${b.date} time=${b.time} source=${b.source||'link'}`);

    // R4 — retourner le contact final (après autoPipelineAdvance) pour éviter refetch aveugle côté frontend
    let contactPayload = null;
    if (b.contactId) {
      try {
        contactPayload = db.prepare('SELECT * FROM contacts WHERE id = ?').get(b.contactId) || null;
      } catch {}
    }
    const bookingPayload = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) || { id };
    res.json({ success: true, id, booking: bookingPayload, contact: contactPayload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bookings/:id
router.put('/:id', requireAuth, requirePermission('bookings.edit'), (req, res) => {
  try {
    // Get booking before update for notification
    const oldBooking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
    if (!oldBooking) return res.status(404).json({ error: 'Booking not found' });

    // Ownership check: verify booking belongs to user's company
    if (!req.auth.isSupra) {
      const cal = db.prepare('SELECT companyId FROM calendars WHERE id = ?').get(oldBooking.calendarId);
      if (!cal || cal.companyId !== req.auth.companyId) {
        return res.status(403).json({ error: 'Accès interdit à ce booking' });
      }
      // SECURITE V1.10.3: élargi à sender/receiver (Reporting Collab RDV)
      // Autorisé : admin/supra, owner legacy, sender (bookedBy), receiver (agendaOwner)
      if (req.auth.role !== 'admin') {
        const cid = req.auth.collaboratorId;
        const isOwner    = oldBooking.collaboratorId === cid;
        const isSender   = oldBooking.bookedByCollaboratorId === cid;
        const isReceiver = oldBooking.agendaOwnerId === cid;
        if (!(isOwner || isSender || isReceiver)) {
          return res.status(403).json({ error: 'Accès interdit — booking d\'un autre collaborateur' });
        }
      }
    }

    // V1.8.24.1 Phase 5 — Wave D extension : refus PUT vers collaboratorId archivé
    // (V1.7 Wave D protégeait POST mais pas PUT, vecteur connu de booking déplaçable
    // vers un collab archivé et donc invisible dans agendas).
    if (req.body.collaboratorId && req.body.collaboratorId !== oldBooking.collaboratorId) {
      const collabActive = db.prepare("SELECT 1 FROM collaborators WHERE id = ? AND (archivedAt IS NULL OR archivedAt = '')").get(req.body.collaboratorId);
      if (!collabActive) {
        console.warn(`[BOOKING REJECTED] PUT collaboratorId=${req.body.collaboratorId} archived — bookingId=${req.params.id}`);
        return res.status(409).json({ error: 'COLLABORATOR_ARCHIVED', collaboratorId: req.body.collaboratorId });
      }
    }

    // Wave B — no-show flow : si on bascule noShow 0→1, router vers markNoShow helper
    // (contrôle précondition temporelle + matrice pipeline + audit). Les autres PUT
    // continuent de passer par l'UPDATE direct.
    if (req.body && req.body.noShow === 1 && Number(oldBooking.noShow) !== 1) {
      try {
        const result = markNoShow(db, {
          bookingId: req.params.id,
          actorCollaboratorId: req.auth.collaboratorId || '',
          companyId: req.auth.companyId || oldBooking.companyId,
        });
        const bookingPayload = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) || null;
        const contactPayload = result.contactId ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.contactId) : null;
        return res.json({ success: true, noShow: true, booking: bookingPayload, contact: contactPayload, consecutiveCount: result.consecutiveCount, stageChanged: result.stageChanged, previousStage: result.previousStage, newStage: result.newStage });
      } catch (err) {
        const MAP = {
          BOOKING_NOT_FOUND: 404,
          BOOKING_WRONG_COMPANY: 403,
          BOOKING_CANCELLED_CANNOT_NOSHOW: 409,
          BOOKING_NOT_PAST_YET: 400,
          BOOKING_ID_REQUIRED: 400,
          COMPANY_ID_REQUIRED: 400,
        };
        const status = MAP[err.message] || 500;
        console.error('[NOSHOW ROUTE]', err.message);
        return res.status(status).json({ error: err.message });
      }
    }

    const data = { ...req.body };
    if (data.tags) { data.tags_json = JSON.stringify(data.tags); delete data.tags; }
    if ('noShow' in data) data.noShow = data.noShow ? 1 : 0;
    if ('checkedIn' in data) data.checkedIn = data.checkedIn ? 1 : 0;
    if ('reconfirmed' in data) data.reconfirmed = data.reconfirmed ? 1 : 0;
    delete data.id;

    // E — re-check conflit si date/time/duration/collaboratorId change (et qu'on ne cancel pas)
    const dateChanged = req.body.date !== undefined && req.body.date !== oldBooking.date;
    const timeChanged = req.body.time !== undefined && req.body.time !== oldBooking.time;
    const durationChanged = req.body.duration !== undefined && Number(req.body.duration) !== Number(oldBooking.duration);
    const collabChanged = req.body.collaboratorId !== undefined && req.body.collaboratorId !== oldBooking.collaboratorId;
    const slotShapeChanged = dateChanged || timeChanged || durationChanged || collabChanged;
    const willBeCancelled = req.body.status === 'cancelled';
    const wasCancelled = oldBooking.status === 'cancelled';
    if (slotShapeChanged && !willBeCancelled && !wasCancelled) {
      const newCollabId = req.body.collaboratorId || oldBooking.collaboratorId;
      const newDate = req.body.date || oldBooking.date;
      const newTime = req.body.time || oldBooking.time;
      const newDuration = req.body.duration !== undefined ? req.body.duration : (oldBooking.duration || 30);
      if (newCollabId && newDate && newTime) {
        const { conflict, existingBooking } = checkBookingConflict(db, {
          collaboratorId: newCollabId,
          date: newDate,
          startTime: newTime,
          duration: newDuration,
          excludeBookingId: req.params.id,
        });
        if (conflict) {
          console.log(`[BOOKING-PUT CONFLICT] id=${req.params.id} new=${newCollabId}@${newDate}T${newTime} vs existing=${existingBooking.id}@${existingBooking.time}`);
          return res.status(409).json({ error: 'Creneau deja occupe (chevauchement)', conflictId: existingBooking.id });
        }
      }
    }

    const sets = Object.keys(data).map(k => `${k} = ?`).join(',');
    const values = Object.values(data);
    values.push(req.params.id);
    db.prepare(`UPDATE bookings SET ${sets} WHERE id = ?`).run(...values);

    // Si le booking vient d'être annulé via PUT → sync contact (totalBookings, next_rdv_date, pipeline)
    if (req.body.status === 'cancelled' && oldBooking.status !== 'cancelled') {
      const cid = oldBooking.contactId || null;
      if (cid) {
        try {
          db.prepare('UPDATE contacts SET totalBookings = MAX(0, totalBookings - 1) WHERE id = ?').run(cid);
          const next = db.prepare("SELECT date FROM bookings WHERE contactId = ? AND status = 'confirmed' AND date >= date('now') ORDER BY date ASC, time ASC LIMIT 1").get(cid);
          db.prepare('UPDATE contacts SET next_rdv_date = ?, rdv_status = ? WHERE id = ?').run(next ? next.date : null, next ? 'programme' : null, cid);
          autoPipelineAdvance(cid, 'booking_cancelled_last');
          updateBehaviorScore(cid, 'booking_cancelled');
        } catch {}
      }
    }

    // F — re-sync contact.next_rdv_date + rdv_status quand date/time change sans cancel
    // (le booking déplacé peut ne plus être le plus proche, ou un autre RDV peut prendre sa place de "prochain")
    if (slotShapeChanged && !willBeCancelled && oldBooking.contactId) {
      try {
        const next = db.prepare("SELECT date FROM bookings WHERE contactId = ? AND status = 'confirmed' AND date >= date('now') ORDER BY date ASC, time ASC LIMIT 1").get(oldBooking.contactId);
        db.prepare('UPDATE contacts SET next_rdv_date = ?, rdv_status = ? WHERE id = ?').run(next ? next.date : null, next ? 'programme' : null, oldBooking.contactId);
      } catch {}
    }

    // Send email notification on status change
    if (oldBooking && oldBooking.visitorEmail && req.body.status) {
      const cal = db.prepare('SELECT * FROM calendars WHERE id = ?').get(oldBooking.calendarId);
      const company = cal ? db.prepare('SELECT name FROM companies WHERE id = ?').get(cal.companyId) : null;
      const collab = oldBooking.collaboratorId ? db.prepare('SELECT name FROM collaborators WHERE id = ?').get(oldBooking.collaboratorId) : null;
      const collaboratorTimezone = oldBooking.collaboratorId ? getCollaboratorTimezone(oldBooking.collaboratorId, cal?.companyId) : 'Europe/Paris';
      const emailData = {
        visitorName: oldBooking.visitorName, date: oldBooking.date, time: oldBooking.time,
        duration: oldBooking.duration, calendarName: cal?.name || '',
        collaboratorName: collab?.name || '', companyName: company?.name || 'Calendar360',
        location: cal?.location || '', collaboratorTimezone,
        visitorTimezone: oldBooking.visitorTimezone || collaboratorTimezone,
      };

      if (req.body.status === 'confirmed' && oldBooking.status === 'pending') {
        const { subject, html } = bookingConfirmedEmail(emailData);
        sendEmail({ to: oldBooking.visitorEmail, toName: oldBooking.visitorName, subject, htmlContent: html }).catch(() => {});
      } else if (req.body.status === 'cancelled') {
        const { subject, html } = cancelledEmail(emailData);
        sendEmail({ to: oldBooking.visitorEmail, toName: oldBooking.visitorName, subject, htmlContent: html }).catch(() => {});
      }
    }

    // Google Chat notification on status change (fire-and-forget)
    if (oldBooking && req.body.status && req.body.status !== oldBooking.status) {
      const cal2 = db.prepare('SELECT * FROM calendars WHERE id = ?').get(oldBooking.calendarId);
      if (cal2) {
        const stg = db.prepare('SELECT google_chat_webhook FROM settings WHERE companyId = ?').get(cal2.companyId);
        if (stg?.google_chat_webhook) {
          const co = db.prepare('SELECT name FROM companies WHERE id = ?').get(cal2.companyId);
          const cl = oldBooking.collaboratorId ? db.prepare('SELECT name FROM collaborators WHERE id = ?').get(oldBooking.collaboratorId) : null;
          const msg = req.body.status === 'cancelled'
            ? formatCancelledBooking(oldBooking, cal2.name, cl?.name, co?.name || 'Calendar360')
            : req.body.status === 'confirmed'
            ? formatConfirmedBooking(oldBooking, cal2.name, cl?.name, co?.name || 'Calendar360')
            : null;
          if (msg) sendChatNotification(stg.google_chat_webhook, msg).catch(() => {});
        }
      }
    }

    // Sync to Google Calendar (fire-and-forget)
    if (oldBooking?.collaboratorId && isConnected(oldBooking.collaboratorId)) {
      const updatedBooking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
      if (updatedBooking) {
        const cal = db.prepare('SELECT name, location FROM calendars WHERE id = ?').get(updatedBooking.calendarId);
        if (updatedBooking.googleEventId) {
          updateEvent(updatedBooking.collaboratorId, updatedBooking.googleEventId, updatedBooking, cal || { name: '', location: '' }).catch(() => {});
        }
      }
    }

    // Cohérence avec POST /api/bookings : retourner { booking, contact } actualisés
    let contactPayload = null;
    if (oldBooking.contactId) {
      try { contactPayload = db.prepare('SELECT * FROM contacts WHERE id = ?').get(oldBooking.contactId) || null; } catch {}
    }
    const bookingPayload = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) || null;
    res.json({ success: true, booking: bookingPayload, contact: contactPayload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bookings/:id — soft cancel (keeps in DB as cancelled)
router.delete('/:id', requireAuth, requirePermission('bookings.delete'), (req, res) => {
  try {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Ownership check: verify booking belongs to user's company (via calendar)
    if (!req.auth.isSupra) {
      const cal = db.prepare('SELECT companyId FROM calendars WHERE id = ?').get(booking.calendarId);
      if (!cal || cal.companyId !== req.auth.companyId) {
        return res.status(403).json({ error: 'Acces interdit a ce booking' });
      }
      // SECURITE V1.10.3: élargi à sender/receiver (Reporting Collab RDV)
      // Autorisé : admin/supra, owner legacy, sender (bookedBy), receiver (agendaOwner)
      if (req.auth.role !== 'admin') {
        const cid = req.auth.collaboratorId;
        const isOwner    = booking.collaboratorId === cid;
        const isSender   = booking.bookedByCollaboratorId === cid;
        const isReceiver = booking.agendaOwnerId === cid;
        if (!(isOwner || isSender || isReceiver)) {
          return res.status(403).json({ error: 'Accès interdit — booking d\'un autre collaborateur' });
        }
      }
    }

    // Anti double cancel : si déjà cancelled, ne rien faire
    if (booking.status === 'cancelled') return res.json({ success: true, message: 'Déjà annulé' });

    // Soft cancel: set status to cancelled instead of deleting
    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run('cancelled', req.params.id);

    // Décrémenter totalBookings + recalculer next_rdv_date + auto pipeline
    if (booking.contactId) {
      try {
        db.prepare('UPDATE contacts SET totalBookings = MAX(0, totalBookings - 1) WHERE id = ?').run(booking.contactId);
        const next = db.prepare("SELECT date FROM bookings WHERE contactId = ? AND status = 'confirmed' AND date >= date('now') ORDER BY date ASC, time ASC LIMIT 1").get(booking.contactId);
        db.prepare('UPDATE contacts SET next_rdv_date = ?, rdv_status = ? WHERE id = ?').run(next ? next.date : null, next ? 'programme' : null, booking.contactId);
        autoPipelineAdvance(booking.contactId, 'booking_cancelled_last');
        updateBehaviorScore(booking.contactId, 'booking_cancelled');
      } catch {}
    }

    // Update Google Calendar event (mark as cancelled, don't delete)
    if (booking.collaboratorId && booking.googleEventId && isConnected(booking.collaboratorId)) {
      const cal = db.prepare('SELECT name, location FROM calendars WHERE id = ?').get(booking.calendarId);
      updateEvent(booking.collaboratorId, booking.googleEventId, { ...booking, status: 'cancelled' }, cal || { name: '', location: '' }).catch(() => {});
    }

    // V1.8.24.1 Phase 5 — DELETE retourne aussi le contact actualisé (cohérent POST/PUT)
    // Permet au frontend de consommer directement le contact post-side-effects
    // (totalBookings--, autoPipelineAdvance, next_rdv_date) sans refetch séparé.
    let contactPayload = null;
    if (booking.contactId) {
      try { contactPayload = db.prepare('SELECT * FROM contacts WHERE id = ?').get(booking.contactId) || null; } catch {}
    }
    const bookingPayload = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) || null;
    console.log(`[BOOKING CANCELLED] id=${req.params.id} contactId=${booking.contactId||''} collab=${booking.collaboratorId||''}`);
    res.json({ success: true, booking: bookingPayload, contact: contactPayload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// V1.10.3 Phase 2 — Reporting Collab RDV (2 routes isolées)
// ════════════════════════════════════════════════════════════════════
// Scope strict : bookingType='share_transfer' UNIQUEMENT.
// Aucun impact sur GET / POST / PUT / DELETE existants.
// ════════════════════════════════════════════════════════════════════

// ─── GET /api/bookings/reporting?role=received|sent ──────────────────
// received : bookings où agendaOwnerId = collab connecté (RDV à rapporter)
// sent     : bookings où bookedByCollaboratorId = collab connecté (RDV transmis)
// admin/supra : voit toute la company (filtre role par companyId)
router.get('/reporting', requireAuth, enforceCompany, (req, res) => {
  try {
    const role = (req.query.role || '').toLowerCase();
    if (role !== 'received' && role !== 'sent') {
      return res.status(400).json({ error: 'role required: received|sent' });
    }
    const companyId = req.auth?.companyId || req.companyId;
    const cid = req.auth?.collaboratorId || '';

    // V1.11.4 — Reporting endpoint = perspective collab connecte STRICTE.
    // Branche admin/supra supprimee : "received"/"sent" sont par definition une
    // vue perspective du collab connecte. Une vue admin cross-collab doit aller
    // dans un endpoint dedie (futur ?role=admin-overview), pas melangee ici.
    // V1.12.x.1 — clean reporting :
    //   P1 status='confirmed' (cancelled = pas de reporting)
    //   P2 INNER JOIN contacts (exclure ghosts hard deleted pre-V1.12.7)
    //   PRESERVE V1.12.5.d : pas de filtre archivedAt (contacts archivés OK pour
    //                        preserver historique reporting + capacite receiver)
    const targetCol = role === 'received' ? 'agendaOwnerId' : 'bookedByCollaboratorId';
    const rows = db.prepare(
      `SELECT b.* FROM bookings b
       JOIN calendars c ON b.calendarId = c.id
       INNER JOIN contacts ct ON b.contactId = ct.id
       WHERE c.companyId = ?
         AND b.bookingType = 'share_transfer'
         AND b.${targetCol} = ?
         AND b.status = 'confirmed'
       ORDER BY b.date DESC, b.time DESC`
    ).all(companyId, cid);

    const parsed = rows.map(b => {
      const r = { ...b };
      try { r.tags = JSON.parse(r.tags_json || '[]'); } catch { r.tags = []; }
      delete r.tags_json;
      r.noShow = !!r.noShow;
      r.checkedIn = !!r.checkedIn;
      r.reconfirmed = !!r.reconfirmed;
      return r;
    });
    res.json(parsed);
  } catch (err) {
    console.error('[REPORTING GET ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/bookings/:id/report ────────────────────────────────────
// Body : { status, note }
// Auth : agendaOwnerId (receiver) OU admin OU supra
// Anti-double : bookingReportingStatus déjà posé → 403 (sauf admin/supra)
router.put('/:id/report', requireAuth, enforceCompany, (req, res) => {
  try {
    const bookingId = req.params.id;
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const cid = req.auth?.collaboratorId || '';
    const isAdmin = req.auth?.role === 'admin';
    const isSupra = !!req.auth?.isSupra;

    // 1. Company isolation
    const cal = db.prepare('SELECT companyId FROM calendars WHERE id = ?').get(booking.calendarId);
    if (!isSupra) {
      if (!cal || cal.companyId !== req.auth.companyId) {
        return res.status(403).json({ error: 'Accès interdit à ce booking' });
      }
    }

    // 2. Scope strict : share_transfer uniquement
    if (booking.bookingType !== 'share_transfer') {
      return res.status(403).json({ error: 'Reporting réservé aux RDV transmis (bookingType=share_transfer)' });
    }

    // 3. Auth : seul receiver / admin / supra
    const isReceiver = booking.agendaOwnerId === cid && cid !== '';
    if (!(isReceiver || isAdmin || isSupra)) {
      return res.status(403).json({ error: 'Seul le receveur du RDV (agendaOwner) peut reporter' });
    }

    // 4. Anti double-reporting (sauf admin/supra)
    if (booking.bookingReportingStatus && booking.bookingReportingStatus !== '') {
      if (!(isAdmin || isSupra)) {
        return res.status(403).json({ error: 'Reporting déjà effectué — modification réservée à un admin' });
      }
    }

    // 5. Validation enum + note obligatoire
    const status = String(req.body?.status || '').trim();
    const note = String(req.body?.note || '').trim();
    if (!REPORTING_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status invalide. Valeurs autorisées : ${REPORTING_STATUSES.join(', ')}` });
    }
    if (REPORTING_STATUSES_REQUIRING_NOTE.includes(status) && note.length === 0) {
      return res.status(400).json({ error: `note obligatoire pour le statut '${status}'` });
    }

    // 6. UPDATE booking
    const now = new Date().toISOString();
    const reporterId = cid || (isSupra ? 'supra' : '');
    db.prepare(
      `UPDATE bookings SET
         bookingReportingStatus = ?,
         bookingReportingNote   = ?,
         bookingReportedAt      = ?,
         bookingReportedBy      = ?
       WHERE id = ?`
    ).run(status, note, now, reporterId, bookingId);

    // 7. Audit log immutable
    try {
      const auditId = 'aud' + Date.now() + Math.random().toString(36).slice(2, 6);
      db.prepare(
        `INSERT INTO audit_logs (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, ipAddress, userAgent, createdAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        auditId,
        booking.companyId || cal?.companyId || '',
        reporterId,
        req.auth?.userName || req.auth?.email || '',
        req.auth?.role || (isSupra ? 'supra_admin' : ''),
        'booking_reported',
        'rdv_reporting',
        'booking',
        bookingId,
        `Reporting RDV ${booking.visitorName || ''} → ${status}`,
        JSON.stringify({ status, note, sender: booking.bookedByCollaboratorId || '', receiver: booking.agendaOwnerId || '', contactId: booking.contactId || '' }),
        req.ip || '',
        req.get('user-agent') || '',
        now
      );
    } catch (auditErr) {
      console.error('[REPORTING AUDIT ERR]', auditErr.message);
      // Non-bloquant : reporting validé même si audit fail (meilleur effort)
    }

    // 8. Notification au sender (bookedByCollaboratorId)
    try {
      if (booking.bookedByCollaboratorId && booking.bookedByCollaboratorId !== reporterId) {
        const contactName = booking.visitorName || (booking.contactId
          ? (db.prepare('SELECT name FROM contacts WHERE id = ?').get(booking.contactId)?.name || '')
          : '');
        createNotification({
          companyId: booking.companyId || cal?.companyId || '',
          collaboratorId: booking.bookedByCollaboratorId,
          type: 'booking_reported',
          title: 'RDV transmis : reporting reçu',
          detail: `Statut : ${status}${note ? ' — ' + note.slice(0, 80) : ''}`,
          contactId: booking.contactId || '',
          contactName,
          linkUrl: ''
        });
      }
    } catch (notifErr) {
      console.error('[REPORTING NOTIF ERR]', notifErr.message);
      // Non-bloquant
    }

    const fresh = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    res.json({ success: true, booking: fresh });
  } catch (err) {
    console.error('[REPORTING PUT ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
