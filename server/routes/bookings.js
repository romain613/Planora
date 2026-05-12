import { Router } from 'express';
import { db, getById, insert, update, remove, getCollaboratorTimezone } from '../db/database.js';
import { autoPipelineAdvance } from '../helpers/pipelineAuto.js';
import { updateBehaviorScore } from '../helpers/behaviorScore.js';
import { sendEmail } from '../services/brevoEmail.js';
import { bookingConfirmedEmail } from '../templates/bookingConfirmed.js';
import { cancelledEmail } from '../templates/cancelled.js';
import { createEvent, updateEvent, deleteEvent, isConnected } from '../services/googleCalendar.js';
import { isConnected as outlookIsConnected, createEventOutlook, updateEventOutlook, deleteEventOutlook } from '../services/outlookCalendar.js'; // V4.a + V4.b + V4.c
import { createFollowUpTask } from '../services/googleTasks.js';
import { sendChatNotification, formatNewBooking, formatCancelledBooking, formatConfirmedBooking } from '../services/googleChat.js';
import { checkBookingConflict } from '../services/bookings/checkBookingConflict.js';
import { applyBookingCreatedSideEffects } from '../services/bookings/applyBookingCreatedSideEffects.js';
import { validateBookingCalendarOwnership } from '../services/bookings/validateBookingCalendarOwnership.js'; // V3.x.15.A
import { reassignBooking, cancelBookingTransmission, resumeBookingByReceiver } from '../services/bookings/reassignBooking.js'; // V1.10.4.A
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
      // V3.x.17.4 — fix BUG B Julie slots cross-collab : non-admin voit TOUS les bookings
      // company avec foreign-mask (mirror init.js V1.8.4 L319-353). Avant : filtre strict
      // (collaboratorId/agendaOwnerId/bookedByCollaboratorId = cid) excluait les bookings
      // solo des autres collab → après _scheduleGlobalRefresh, modal RDV calculait les
      // slots libres de Julie comme si elle n'avait aucun RDV. Après : tous bookings
      // company, foreign masqués (slot footprint only, ZERO PII — visitorName/Email/
      // Phone/notes/title NON exposés).
      if (isAdmin) {
        rows = db.prepare(`SELECT b.* FROM bookings b JOIN calendars c ON b.calendarId = c.id WHERE c.companyId = ?`).all(safeCompanyId);
      } else {
        const cid = req.auth.collaboratorId;
        const _calendars = db.prepare("SELECT id, collaborators_json FROM calendars WHERE companyId = ?").all(safeCompanyId);
        const _myOwnedCalendarIds = new Set(_calendars.filter(cal => {
          try { const ids = typeof cal.collaborators_json === 'string' ? JSON.parse(cal.collaborators_json) : []; return ids.includes(cid); } catch { return false; }
        }).map(c => c.id));
        const _allRows = db.prepare(`SELECT b.* FROM bookings b JOIN calendars c ON b.calendarId = c.id WHERE c.companyId = ?`).all(safeCompanyId);
        rows = _allRows.map(b => {
          const _isMine = b.collaboratorId === cid || b.agendaOwnerId === cid || b.bookedByCollaboratorId === cid || _myOwnedCalendarIds.has(b.calendarId);
          if (_isMine) return b;
          return {
            id: b.id, calendarId: b.calendarId, collaboratorId: b.collaboratorId,
            date: b.date, time: b.time, duration: b.duration, status: b.status,
            noShow: b.noShow, checkedIn: b.checkedIn, reconfirmed: b.reconfirmed,
            source: b.source, googleEventId: b.googleEventId, companyId: b.companyId,
            bookedByCollaboratorId: b.bookedByCollaboratorId,
            meetingCollaboratorId: b.meetingCollaboratorId,
            agendaOwnerId: b.agendaOwnerId, bookingType: b.bookingType,
            bookingOutcomeAt: b.bookingOutcomeAt, transferMode: b.transferMode,
            _foreign: true, tags_json: '[]',
          };
        });
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
// V1.10.4.F.2 — route async pour await ciblé createEvent quand createGoogleMeet=true
// (cf. bloc Sync to Google Calendar ci-dessous). RDV classiques restent fire-and-forget.
router.post('/', requireAuth, enforceCompany, requirePermission('bookings.create'), async (req, res) => {
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

    // V3.x.15.A — Guard calendarId/agendaOwnerId : empêche RDV avec calendrier non-membre.
    // Resolve agendaOwnerId comme dans l'INSERT (b.agendaOwnerId || b.collaboratorId).
    {
      const _agendaOwnerId = b.agendaOwnerId || b.collaboratorId || null;
      if (b.calendarId && _agendaOwnerId) {
        const _check = validateBookingCalendarOwnership(db, { companyId, calendarId: b.calendarId, agendaOwnerId: _agendaOwnerId });
        if (!_check.ok) {
          console.warn(`[BOOKING GUARD] ${_check.code} calendar=${b.calendarId} owner=${_agendaOwnerId} company=${companyId} : ${_check.detail}`);
          return res.status(_check.status).json({ error: _check.code, detail: _check.detail });
        }
      }
    }

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
      title: (b.title || '').trim(),  // V3.x.9 — titre custom RDV (Outlook subject + display grille)
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
      // V1.10.4.I — Stamp createdAt à la création (reporting "Créé le", timeline).
      createdAt: new Date().toISOString(),
    });

    // Sync to Google Calendar + Meet link
    // V1.10.4.F.2 (2026-05-11) — await createEvent UNIQUEMENT si createGoogleMeet=true
    // pour que la réponse API porte meetLink (UI fiche RDV + email visiteur frontend).
    // RDV classiques restent fire-and-forget : aucune régression latence POST.
    // Try/catch obligatoire pour ne pas bloquer la création si Google API échoue.
    if (b.collaboratorId && isConnected(b.collaboratorId)) {
      const cal = db.prepare('SELECT name, location FROM calendars WHERE id = ?').get(b.calendarId);
      const _evtPayload = { date: b.date, time: b.time, duration: b.duration || 30, visitorName: b.visitorName, visitorEmail: b.visitorEmail, visitorPhone: b.visitorPhone };
      const _calPayload = cal || { name: '', location: '' };
      if (b.createGoogleMeet) {
        try {
          const result = await createEvent(b.collaboratorId, _evtPayload, _calPayload, { createMeet: true });
          if (result?.googleEventId) db.prepare('UPDATE bookings SET googleEventId = ? WHERE id = ?').run(result.googleEventId, id);
          if (result?.meetLink) db.prepare('UPDATE bookings SET meetLink = ? WHERE id = ?').run(result.meetLink, id);
        } catch (err) {
          console.error('[GOOGLE SYNC ERROR]', err.message);
        }
      } else {
        createEvent(b.collaboratorId, _evtPayload, _calPayload, { createMeet: false })
          .then(result => {
            if (result?.googleEventId) db.prepare('UPDATE bookings SET googleEventId = ? WHERE id = ?').run(result.googleEventId, id);
          })
          .catch(err => console.error('[GOOGLE SYNC ERROR]', err.message));
      }
    }

    // V4.a — Push to Outlook Calendar (fire-and-forget, mirror Google pattern)
    // Anti-dup : skip si outlookEventId déjà rempli (défense en profondeur).
    // Non-bloquant : booking créé même si Outlook fail (R2 mitigée).
    if (b.collaboratorId && outlookIsConnected(b.collaboratorId) && !b.outlookEventId) {
      const calOl = db.prepare('SELECT name, location FROM calendars WHERE id = ?').get(b.calendarId);
      createEventOutlook(b.collaboratorId, { date: b.date, time: b.time, duration: b.duration || 30, visitorName: b.visitorName, visitorEmail: b.visitorEmail, visitorPhone: b.visitorPhone, notes: b.notes, title: b.title || '' }, calOl || { name: '', location: '' })
        .then(result => {
          if (result?.outlookEventId) db.prepare('UPDATE bookings SET outlookEventId = ? WHERE id = ?').run(result.outlookEventId, id);
        })
        .catch(err => console.error('[OUTLOOK SYNC ERROR]', err.message));
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
    // V3.x.17.5 fix BUG A : passer bookingId pour persist next_rdv_booking_id (cockpit
    // _refRdv lookup par id robust contre foreign-mask cross-collab après refresh).
    if (b.contactId && b.status !== 'cancelled') {
      applyBookingCreatedSideEffects(db, { contactId: b.contactId, bookingDate: b.date, bookingId: id, source: 'bookings_post' });
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

    // V3.x.15.A — Guard calendarId/agendaOwnerId : déclenché uniquement si calendarId
    // est explicitement modifié par le PUT (sinon comportement legacy intact).
    if (req.body.calendarId && req.body.calendarId !== oldBooking.calendarId) {
      const _agendaOwnerId = req.body.agendaOwnerId || oldBooking.agendaOwnerId || oldBooking.collaboratorId || null;
      const _companyId = req.auth.companyId || oldBooking.companyId || '';
      const _check = validateBookingCalendarOwnership(db, { companyId: _companyId, calendarId: req.body.calendarId, agendaOwnerId: _agendaOwnerId });
      if (!_check.ok) {
        console.warn(`[BOOKING GUARD PUT] ${_check.code} bookingId=${req.params.id} newCal=${req.body.calendarId} owner=${_agendaOwnerId} : ${_check.detail}`);
        return res.status(_check.status).json({ error: _check.code, detail: _check.detail });
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
          excludeOutlookEventId: oldBooking.outlookEventId || null,  // V3.x.9 — skip miroir du booking courant
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

    // V4.b — Sync to Outlook Calendar (fire-and-forget, mirror Google pattern)
    // Guards : skip si collab ou calendar a changé (l'event Outlook actuel appartient à l'ancien collab/cal).
    // Pour transferts : V4.c traitera la cancellation côté ancien + V4.d créera côté nouveau.
    if (oldBooking?.collaboratorId && outlookIsConnected(oldBooking.collaboratorId)) {
      const updatedBookingOl = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
      if (
        updatedBookingOl &&
        updatedBookingOl.outlookEventId &&
        oldBooking.collaboratorId === updatedBookingOl.collaboratorId &&
        oldBooking.calendarId === updatedBookingOl.calendarId
      ) {
        const calOl = db.prepare('SELECT name, location FROM calendars WHERE id = ?').get(updatedBookingOl.calendarId);
        updateEventOutlook(updatedBookingOl.collaboratorId, updatedBookingOl.outlookEventId, updatedBookingOl, calOl || { name: '', location: '' }).catch(() => {});
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

    // V4.c — Delete Outlook event (true delete, mirror MH UX choice — divergence assumée vs Google soft cancel)
    // Non-bloquant : route DELETE ne fail jamais si Outlook fail.
    // 404 Graph = idempotent (event déjà supprimé user-side).
    if (booking.collaboratorId && booking.outlookEventId && outlookIsConnected(booking.collaboratorId)) {
      deleteEventOutlook(booking.collaboratorId, booking.outlookEventId).catch(err => console.error('[OUTLOOK SYNC ERROR]', err.message));
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
    // V1.12.x.2 — expose 3 champs archive du contact pour badge Reporting frontend
    //
    // V1.10.4-r9 — Status filter : default 'all' pour les 2 rôles.
    //   Le Reporting = traçabilité complète des transmissions inter-collabs.
    //   Une transmission ne doit JAMAIS être masquée du Reporting, même si :
    //     - RDV annulé / passé / non honoré
    //     - contact reclassé en R2 / FIN / Contacté
    //     - contact archivé ou hard-supprimé (LEFT JOIN ci-dessous)
    //   Override explicite via ?status=confirmed|cancelled|all si UI veut filtrer.
    const targetCol = role === 'received' ? 'agendaOwnerId' : 'bookedByCollaboratorId';
    const statusFilter = String(req.query.status || 'all').toLowerCase();
    if (!['confirmed', 'cancelled', 'all'].includes(statusFilter)) {
      return res.status(400).json({ error: 'status: confirmed|cancelled|all' });
    }
    const statusClause = statusFilter === 'all' ? '' : 'AND b.status = ?';
    const sqlParams = statusFilter === 'all' ? [companyId, cid] : [companyId, cid, statusFilter];

    // V1.10.4-r9 — LEFT JOIN contacts (au lieu d'INNER) pour préserver la traçabilité
    // des transmissions vers contacts hard-supprimés. Frontend affiche un badge
    // "Contact supprimé" et fallback sur visitorName/Email/Phone (preservés dans bookings).
    // V1.10.4.I — Champs receiverPipelineStage + next_action_label/date + lastActivityAt
    // pour afficher "Statut actuel" et "Prochaine action" sur chaque card reporting.
    const rows = db.prepare(
      `SELECT b.*,
              ct.id AS _contactExistsId,
              ct.archivedAt AS contactArchivedAt,
              ct.archivedBy AS contactArchivedBy,
              ct.archivedReason AS contactArchivedReason,
              ct.pipeline_stage AS receiverPipelineStage,
              ct.next_action_label AS contactNextActionLabel,
              ct.next_action_date AS contactNextActionDate,
              ct.lastActivityAt AS contactLastActivityAt,
              ct.name AS contactName,
              ct.email AS contactEmail,
              ct.phone AS contactPhone
       FROM bookings b
       JOIN calendars c ON b.calendarId = c.id
       LEFT JOIN contacts ct ON b.contactId = ct.id
       WHERE c.companyId = ?
         AND b.bookingType = 'share_transfer'
         AND b.${targetCol} = ?
         ${statusClause}
       ORDER BY b.date DESC, b.time DESC`
    ).all(...sqlParams);

    const parsed = rows.map(b => {
      const r = { ...b };
      try { r.tags = JSON.parse(r.tags_json || '[]'); } catch { r.tags = []; }
      delete r.tags_json;
      r.noShow = !!r.noShow;
      r.checkedIn = !!r.checkedIn;
      r.reconfirmed = !!r.reconfirmed;
      // V1.10.4-r9 — Flag explicite "contact hard-supprimé" pour UI badge.
      // ct.id IS NULL via LEFT JOIN = contact n'existe plus, mais la transmission
      // reste tracée. Frontend fallback sur visitorName/Email/Phone du booking.
      r._contactGhost = !r._contactExistsId;
      delete r._contactExistsId;
      return r;
    });
    res.json(parsed);
  } catch (err) {
    console.error('[REPORTING GET ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// V1.10.4.J — GET /api/bookings/transmitted
// Console de supervision des RDV transmis (bookingType='share_transfer').
// Filtres multi-collab (senders/receivers), status, reporting, pipeline, période.
// Permissions :
//   - collab member : forcé sur ses propres flows (bookedBy=cid OR agendaOwner=cid)
//   - admin/supra   : tous les transferts de la company active
// Lecture seule, aucune écriture.
// ════════════════════════════════════════════════════════════════════
router.get('/transmitted', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth?.companyId || req.companyId;
    const cid = req.auth?.collaboratorId || '';
    const isAdmin = req.auth?.role === 'admin' || req.auth?.isSupra;

    const mode = String(req.query.mode || 'all').toLowerCase();
    if (!['sent', 'received', 'all'].includes(mode)) {
      return res.status(400).json({ error: 'mode invalide (sent|received|all)' });
    }
    const status = String(req.query.status || 'confirmed').toLowerCase(); // confirmed|cancelled|all
    if (!['confirmed', 'cancelled', 'all'].includes(status)) {
      return res.status(400).json({ error: 'status invalide (confirmed|cancelled|all)' });
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);

    const parseCsv = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
    const sendersParam = parseCsv(req.query.senders);
    const receiversParam = parseCsv(req.query.receivers);
    const reportingStatuses = parseCsv(req.query.reportingStatus);
    const pipelineStages = parseCsv(req.query.pipelineStage);

    // Date range : défaut = today-30j → today+90j
    const todayIso = new Date().toISOString().slice(0, 10);
    const defaultFrom = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
    const defaultTo = new Date(Date.now() + 90 * 86400 * 1000).toISOString().slice(0, 10);
    const from = (req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) ? req.query.from : defaultFrom;
    const to = (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) ? req.query.to : defaultTo;

    // Construit la requête dynamique
    const where = [
      'c.companyId = ?',
      "b.bookingType = 'share_transfer'",
      'b.date BETWEEN ? AND ?',
    ];
    const params = [companyId, from, to];

    // Permissions : collab non-admin force sur ses propres flows
    if (!isAdmin) {
      where.push('(b.bookedByCollaboratorId = ? OR b.agendaOwnerId = ?)');
      params.push(cid, cid);
    }

    // Mode filter
    if (mode === 'sent') {
      const ids = isAdmin && sendersParam.length ? sendersParam : (isAdmin ? null : [cid]);
      if (ids && ids.length) {
        where.push(`b.bookedByCollaboratorId IN (${ids.map(() => '?').join(',')})`);
        params.push(...ids);
      }
    } else if (mode === 'received') {
      const ids = isAdmin && receiversParam.length ? receiversParam : (isAdmin ? null : [cid]);
      if (ids && ids.length) {
        where.push(`b.agendaOwnerId IN (${ids.map(() => '?').join(',')})`);
        params.push(...ids);
      }
    } else { // mode === 'all'
      if (isAdmin && sendersParam.length) {
        where.push(`b.bookedByCollaboratorId IN (${sendersParam.map(() => '?').join(',')})`);
        params.push(...sendersParam);
      }
      if (isAdmin && receiversParam.length) {
        where.push(`b.agendaOwnerId IN (${receiversParam.map(() => '?').join(',')})`);
        params.push(...receiversParam);
      }
    }

    // Status RDV
    if (status !== 'all') {
      where.push('b.status = ?');
      params.push(status);
    }

    // Reporting status
    if (reportingStatuses.length) {
      where.push(`b.bookingReportingStatus IN (${reportingStatuses.map(() => '?').join(',')})`);
      params.push(...reportingStatuses);
    }

    // Pipeline stage (sur ct.pipeline_stage)
    if (pipelineStages.length) {
      where.push(`ct.pipeline_stage IN (${pipelineStages.map(() => '?').join(',')})`);
      params.push(...pipelineStages);
    }

    const sql = `
      SELECT b.id, b.calendarId, b.collaboratorId, b.date, b.time, b.duration,
             b.visitorName, b.visitorEmail, b.visitorPhone, b.status, b.title,
             b.bookedByCollaboratorId, b.agendaOwnerId, b.bookingType, b.transferMode,
             b.bookingReportingStatus, b.bookingReportingNote,
             b.bookingReportedBy, b.bookingReportedAt,
             b.googleEventId, b.outlookEventId, b.contactId, b.createdAt,
             ct.pipeline_stage  AS receiverPipelineStage,
             ct.name            AS contactName,
             ct.email           AS contactEmail,
             ct.phone           AS contactPhone,
             ct.archivedAt      AS contactArchivedAt
      FROM bookings b
      JOIN calendars c ON b.calendarId = c.id
      LEFT JOIN contacts ct ON b.contactId = ct.id
      WHERE ${where.join(' AND ')}
      ORDER BY b.date ASC, b.time ASC
      LIMIT ?
    `;
    params.push(limit);

    const rows = db.prepare(sql).all(...params);
    res.json({ count: rows.length, mode, status, from, to, bookings: rows });
  } catch (err) {
    console.error('[TRANSMITTED ERR]', err.message);
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

// ─── V1.10.4.A — Actions sur RDV transmis (cross-collab) ─────────────────────
// 3 routes branchées sur le helper centralisé services/bookings/reassignBooking.js.
// Garde absolue Niveau 1 : si googleEventId OU outlookEventId → 409 EXTERNAL_SYNC_PRESENT.
// Sync externe complète (delete+recreate atomique) différée Phase 3 / V1.10.4.B.
//
// Toutes les routes :
//   - Auth requise (requireAuth + enforceCompany)
//   - Permission edit
//   - bookedByCollaboratorId IMMUABLE (jamais modifié)
//   - audit_logs + notifications obligatoires (gérés par le helper)
//   - réutilise V3.x.15.A guard + checkBookingConflict + EXECUTOR_NO_CALENDAR refus

// PUT /api/bookings/:id/reassign
// Body : { newAgendaOwnerId, newCalendarId? }
// Auth : admin/supra OU sender (bookedByCollaboratorId)
// Effet : agendaOwnerId / collaboratorId / meetingCollaboratorId / calendarId → newAgendaOwnerId
//         reset reporting (status/note/at/by)
router.put('/:id/reassign', requireAuth, enforceCompany, requirePermission('bookings.edit'), (req, res) => {
  try {
    const result = reassignBooking(db, {
      bookingId: req.params.id,
      newAgendaOwnerId: req.body?.newAgendaOwnerId || '',
      newCalendarId: req.body?.newCalendarId || null,
      actorCollabId: req.auth?.collaboratorId || '',
      actorRole: req.auth?.isSupra ? 'supra' : (req.auth?.role || 'member'),
      actorName: req.auth?.userName || req.auth?.email || '',
      companyId: req.auth?.companyId || '',
    });
    if (!result.ok) {
      const { ok, status, ...payload } = result;
      return res.status(status || 500).json({ error: payload.code, ...payload });
    }
    return res.json({ success: true, booking: result.booking, oldAgendaOwnerId: result.oldAgendaOwnerId, oldCalendarId: result.oldCalendarId });
  } catch (err) {
    console.error('[REASSIGN PUT ERR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/bookings/:id/cancel-transmission
// Body : {}
// Auth : admin/supra OU sender (bookedByCollaboratorId)
// Effet : booking revient chez sender (bookedByCollaboratorId reste lui-même, agendaOwnerId/collaboratorId = sender)
router.put('/:id/cancel-transmission', requireAuth, enforceCompany, requirePermission('bookings.edit'), (req, res) => {
  try {
    const result = cancelBookingTransmission(db, {
      bookingId: req.params.id,
      actorCollabId: req.auth?.collaboratorId || '',
      actorRole: req.auth?.isSupra ? 'supra' : (req.auth?.role || 'member'),
      actorName: req.auth?.userName || req.auth?.email || '',
      companyId: req.auth?.companyId || '',
    });
    if (!result.ok) {
      const { ok, status, ...payload } = result;
      return res.status(status || 500).json({ error: payload.code, ...payload });
    }
    return res.json({ success: true, booking: result.booking, oldAgendaOwnerId: result.oldAgendaOwnerId, restoredToSenderId: result.restoredToSenderId });
  } catch (err) {
    console.error('[CANCEL-TRANSMISSION PUT ERR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/bookings/:id/resume
// Body : {}
// Auth : admin/supra OU receiver (agendaOwnerId)
// Effet : alias sémantique de cancel-transmission, mais initié par le receiver.
//         Le RDV revient chez bookedByCollaboratorId (sender).
//         Audit action distinct = 'booking_transmission_resumed_by_receiver'.
router.put('/:id/resume', requireAuth, enforceCompany, requirePermission('bookings.edit'), (req, res) => {
  try {
    const result = resumeBookingByReceiver(db, {
      bookingId: req.params.id,
      actorCollabId: req.auth?.collaboratorId || '',
      actorRole: req.auth?.isSupra ? 'supra' : (req.auth?.role || 'member'),
      actorName: req.auth?.userName || req.auth?.email || '',
      companyId: req.auth?.companyId || '',
    });
    if (!result.ok) {
      const { ok, status, ...payload } = result;
      return res.status(status || 500).json({ error: payload.code, ...payload });
    }
    return res.json({ success: true, booking: result.booking, oldAgendaOwnerId: result.oldAgendaOwnerId, restoredToSenderId: result.restoredToSenderId });
  } catch (err) {
    console.error('[RESUME PUT ERR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
