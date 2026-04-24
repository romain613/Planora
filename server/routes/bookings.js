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
      // SECURITE: non-admin ne voit que SES bookings
      if (isAdmin) {
        rows = db.prepare('SELECT * FROM bookings WHERE calendarId = ?').all(calendarId);
      } else {
        rows = db.prepare('SELECT * FROM bookings WHERE calendarId = ? AND collaboratorId = ?').all(calendarId, req.auth.collaboratorId);
      }
    } else {
      // Toujours filtrer par company — jamais de SELECT * global
      // SECURITE: non-admin ne voit que SES bookings
      if (isAdmin) {
        rows = db.prepare(`SELECT b.* FROM bookings b JOIN calendars c ON b.calendarId = c.id WHERE c.companyId = ?`).all(safeCompanyId);
      } else {
        rows = db.prepare(`SELECT b.* FROM bookings b JOIN calendars c ON b.calendarId = c.id WHERE c.companyId = ? AND b.collaboratorId = ?`).all(safeCompanyId, req.auth.collaboratorId);
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
        existingContact = db.prepare('SELECT id FROM contacts WHERE LOWER(email) = LOWER(?) AND companyId = ? AND assignedTo = ?').get(b.visitorEmail.trim(), companyId, collabId);
      }
      // Dedup par telephone
      if (!existingContact && b.visitorPhone) {
        const cleanPh = (b.visitorPhone || '').replace(/[^\d]/g, '').slice(-9);
        if (cleanPh.length >= 9) {
          const candidates = db.prepare("SELECT id, phone, mobile FROM contacts WHERE companyId = ? AND assignedTo = ? AND (phone != '' OR mobile != '')").all(companyId, collabId);
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
      // SECURITE: non-admin ne peut modifier que SES bookings
      if (req.auth.role !== 'admin' && oldBooking.collaboratorId !== req.auth.collaboratorId) {
        return res.status(403).json({ error: 'Accès interdit — booking d\'un autre collaborateur' });
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
      // SECURITE: non-admin ne peut supprimer que SES bookings
      if (req.auth.role !== 'admin' && booking.collaboratorId !== req.auth.collaboratorId) {
        return res.status(403).json({ error: 'Accès interdit — booking d\'un autre collaborateur' });
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

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
