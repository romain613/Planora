import { Router } from 'express';
import { db, getCollaboratorTimezone, validateTimezone } from '../db/database.js';
import { autoPipelineAdvance } from '../helpers/pipelineAuto.js';
import { updateBehaviorScore } from '../helpers/behaviorScore.js';
import { DateTime } from 'luxon';
import { sendEmail } from '../services/brevoEmail.js';
import { sendSms } from '../services/brevoSms.js';
import { sendWhatsapp } from '../services/brevoWhatsapp.js';
import { bookingConfirmedEmail, bookingConfirmedSms, bookingConfirmedWhatsapp } from '../templates/bookingConfirmed.js';
import { newBookingNotifyEmail, newBookingNotifySms } from '../templates/newBookingNotify.js';
import { createEvent, isConnected } from '../services/googleCalendar.js';
import { checkBookingConflict } from '../services/bookings/checkBookingConflict.js';

const router = Router();

// GET /api/public/calendar/:companySlug/:calSlug — Public calendar info (scoped by company)
router.get('/calendar/:companySlug/:calSlug', (req, res) => {
  try {
    const company = db.prepare('SELECT * FROM companies WHERE slug = ?').get(req.params.companySlug);
    if (!company) return res.status(404).json({ error: 'Entreprise introuvable' });

    const cal = db.prepare('SELECT * FROM calendars WHERE slug = ? AND companyId = ?').get(req.params.calSlug, company.id);
    if (!cal) return res.status(404).json({ error: 'Calendrier introuvable' });

    // Parse JSON fields
    const parsed = { ...cal };
    for (const f of ['durations_json', 'questions_json', 'tags_json', 'collaborators_json']) {
      const clean = f.replace('_json', '');
      try { parsed[clean] = JSON.parse(parsed[f] || '[]'); } catch { parsed[clean] = []; }
      delete parsed[f];
    }
    parsed.requireApproval = !!parsed.requireApproval;

    // Get collaborators for this calendar (include timezone)
    const collabIds = parsed.collaborators || [];
    const collaborators = collabIds.length > 0
      ? db.prepare(`SELECT id, name, color, timezone FROM collaborators WHERE id IN (${collabIds.map(() => '?').join(',')})`).all(...collabIds)
      : [];

    // Company timezone + booking window from settings
    const settingsRow = db.prepare('SELECT timezone, maxAdvanceDays FROM settings WHERE companyId = ?').get(company.id);
    const companyTimezone = settingsRow?.timezone || 'Europe/Paris';
    const companyMaxAdvanceDays = settingsRow?.maxAdvanceDays ?? 60;
    // Effective max = min of company setting and calendar setting
    const effectiveMaxAdvanceDays = Math.min(companyMaxAdvanceDays, parsed.maxAdvanceDays || 9999);
    parsed.maxAdvanceDays = effectiveMaxAdvanceDays;

    res.json({ calendar: parsed, company: { id: company.id, name: company.name, slug: company.slug, domain: company.domain }, collaborators, companyTimezone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DEPRECATED: GET /api/public/calendar/:slug — removed for multi-tenant security
// This route could match calendars from multiple companies if they share the same slug,
// creating cross-company leaks. Use /api/public/calendar/:companySlug/:calSlug instead.
router.get('/calendar/:slug', (req, res) => {
  console.warn(`[SECURITY] Deprecated route called: GET /api/public/calendar/${req.params.slug}`);
  return res.status(410).json({
    error: 'Cette URL de réservation n\'est plus supportée. Merci de demander un nouveau lien au professionnel.',
    code: 'LEGACY_ROUTE_DEPRECATED',
  });
});

// GET /api/public/slots/:companySlug/:calSlug?date=2026-03-10&duration=60
router.get('/slots/:companySlug/:calSlug', (req, res) => {
  try {
    const company = db.prepare('SELECT id FROM companies WHERE slug = ?').get(req.params.companySlug);
    if (!company) return res.json({ slots: [] });

    const cal = db.prepare('SELECT * FROM calendars WHERE slug = ? AND companyId = ?').get(req.params.calSlug, company.id);
    if (!cal) return res.json({ slots: [] });

    return generateSlots(cal, req, res);
  } catch (err) {
    console.error('[SLOTS ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// DEPRECATED: GET /api/public/slots/:slug — removed for multi-tenant security
router.get('/slots/:slug', (req, res) => {
  console.warn(`[SECURITY] Deprecated route called: GET /api/public/slots/${req.params.slug}`);
  return res.status(410).json({
    error: 'Cette URL de réservation n\'est plus supportée.',
    code: 'LEGACY_ROUTE_DEPRECATED',
    slots: [],
  });
});

// Shared slot generation logic
function generateSlots(cal, req, res) {
  const rawCollabIds = (()=>{ try { return JSON.parse(cal.collaborators_json || '[]'); } catch { return []; } })();
  // SECURITY: Defense in depth — filter out any collaboratorId that doesn't belong to the calendar's company
  const collabIds = rawCollabIds.filter(cid => {
    const c = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(cid);
    if (!c) return false;
    if (c.companyId !== cal.companyId) {
      console.warn(`[SECURITY] generateSlots: collaborator ${cid} in calendar ${cal.id} belongs to different company — skipped`);
      return false;
    }
    return true;
  });
  const date = req.query.date;
  const duration = parseInt(req.query.duration) || cal.duration;
  // Validate visitor timezone — reject invalid, normalize to canonical
  const rawVTz = req.query.visitorTimezone || null;
  const visitorTimezone = rawVTz ? (validateTimezone(rawVTz) || null) : null;

  if (!date) return res.status(400).json({ error: 'Date requise' });

  const dayOfWeek = (new Date(date + 'T12:00:00').getDay() + 6) % 7; // 0=Mon (use T12 to avoid UTC midnight shift)

  // Get settings (blackout dates + company booking window)
  const settings = db.prepare('SELECT blackoutDates_json, maxAdvanceDays FROM settings WHERE companyId = ?').get(cal.companyId);
  const blackouts = settings ? JSON.parse(settings.blackoutDates_json || '[]') : [];
  if (blackouts.includes(date)) return res.json({ slots: [] });

  // Enforce company-level booking window (rolling window)
  const companyMaxDays = settings?.maxAdvanceDays ?? 60;
  const calMaxDays = cal.maxAdvanceDays || 9999;
  const effectiveMaxDays = Math.min(companyMaxDays, calMaxDays);
  const maxDateMs = Date.now() + effectiveMaxDays * 86400000;
  const requestedDate = new Date(date + 'T23:59:59');
  if (requestedDate.getTime() > maxDateMs) return res.json({ slots: [] });

  // Check min notice
  const nowMs = Date.now();
  const minNoticeMs = (cal.minNotice || 60) * 60000;

  // Get existing bookings for that date
  const existingBookings = db.prepare('SELECT time, duration, collaboratorId, status FROM bookings WHERE calendarId = ? AND date = ? AND status != ?').all(cal.id, date, 'cancelled');

  // For each collaborator, check availability
  const allSlots = [];

  for (const collabId of collabIds) {
    const availRow = db.prepare('SELECT schedule_json FROM availabilities WHERE collaboratorId = ?').get(collabId);
    if (!availRow) continue;

    const schedule = JSON.parse(availRow.schedule_json);
    const daySchedule = schedule[dayOfWeek];
    if (!daySchedule || !daySchedule.active) continue;

    // Resolve collaborator timezone
    const collabTz = getCollaboratorTimezone(collabId, cal.companyId);

    // Count existing bookings for this collab on this date
    const collabBookings = existingBookings.filter(b => b.collaboratorId === collabId);

    // Get Google Calendar conflicts for this collaborator on this date
    const googleConflicts = [];
    try {
      const gEvents = db.prepare(
        `SELECT startTime, endTime, allDay FROM google_events
         WHERE collaboratorId = ? AND startTime < ? AND endTime > ?`
      ).all(collabId, `${date}T23:59:59`, `${date}T00:00:00`);

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
    } catch (e) { /* google_events table may not exist yet */ }

    // V3.x.5 Phase 2B — Outlook conflicts (mirror Google block above)
    const outlookConflicts = [];
    try {
      const oEvents = db.prepare(
        `SELECT startTime, endTime, allDay, showAs FROM outlook_events
         WHERE collaboratorId = ? AND startTime < ? AND endTime > ?`
      ).all(collabId, `${date}T23:59:59`, `${date}T00:00:00`);

      for (const oe of oEvents) {
        if (oe.showAs === 'free') continue; // défensif (déjà filtré au sync)
        if (oe.allDay) {
          outlookConflicts.push({ start: 0, end: 1440 });
        } else {
          const oeStart = DateTime.fromISO(oe.startTime, { zone: collabTz });
          const oeEnd = DateTime.fromISO(oe.endTime, { zone: collabTz });
          const startMin = oeStart.toFormat('yyyy-MM-dd') === date ? oeStart.hour * 60 + oeStart.minute : 0;
          const endMin = oeEnd.toFormat('yyyy-MM-dd') === date ? oeEnd.hour * 60 + oeEnd.minute : 1440;
          if (endMin > startMin) outlookConflicts.push({ start: startMin, end: endMin });
        }
      }
    } catch (e) { /* outlook_events table may not exist yet */ }

    for (const slot of daySchedule.slots) {
      const startMinutes = timeToMinutes(slot.start);
      const endMinutes = timeToMinutes(slot.end);

      // Generate slots every 15 minutes within this range
      for (let m = startMinutes; m + duration <= endMinutes; m += 15) {
        const timeStr = minutesToTime(m);

        // Check min notice using Luxon (timezone-aware)
        const slotLuxon = DateTime.fromISO(`${date}T${timeStr}:00`, { zone: collabTz });
        if (slotLuxon.toMillis() - nowMs < minNoticeMs) continue;

        // Check buffer conflicts with existing bookings + Google events + Outlook events
        const bufferBefore = cal.bufferBefore || 0;
        const bufferAfter = cal.bufferAfter || 0;
        const slotStart = m - bufferBefore;
        const slotEnd = m + duration + bufferAfter;

        const hasBookingConflict = collabBookings.some(b => {
          const bStart = timeToMinutes(b.time);
          const bEnd = bStart + (b.duration || 30);
          return slotStart < bEnd && slotEnd > bStart;
        });

        const hasGoogleConflict = googleConflicts.some(gc => slotStart < gc.end && slotEnd > gc.start);
        const hasOutlookConflict = outlookConflicts.some(oc => slotStart < oc.end && slotEnd > oc.start);

        const hasConflict = hasBookingConflict || hasGoogleConflict || hasOutlookConflict;

        if (!hasConflict) {
          // Check max per day
          if (collabBookings.length < (cal.maxPerDay || 10)) {
            // Convert to visitor timezone for display (if different)
            let displayTime = timeStr;
            let displayDate = date;
            if (visitorTimezone && visitorTimezone !== collabTz) {
              const slotInVisitor = slotLuxon.setZone(visitorTimezone);
              displayTime = slotInVisitor.toFormat('HH:mm');
              displayDate = slotInVisitor.toFormat('yyyy-MM-dd');
            }
            allSlots.push({
              time: timeStr,
              displayTime,
              displayDate,
              collaboratorId: collabId,
              collaboratorTimezone: collabTz,
            });
          }
        }
      }
    }
  }

  // Deduplicate by time (keep first available collab based on assignMode)
  const uniqueSlots = [];
  const seenTimes = new Set();
  const sorted = allSlots.sort((a, b) => a.time.localeCompare(b.time));

  for (const s of sorted) {
    if (!seenTimes.has(s.time)) {
      seenTimes.add(s.time);
      uniqueSlots.push(s);
    }
  }

  res.json({ slots: uniqueSlots });
}

// POST /api/public/book — Create a booking from public page
router.post('/book', async (req, res) => {
  try {
    const { calendarSlug, companySlug, date, time, duration, visitorName, visitorEmail, visitorPhone, collaboratorId, answers, visitorTimezone: rawVisitorTz } = req.body;
    // Validate and normalize visitor timezone
    const visitorTimezone = rawVisitorTz ? (validateTimezone(rawVisitorTz) || null) : null;

    let cal;
    // SECURITY: companySlug is now MANDATORY to prevent cross-company slug collision
    if (!companySlug) {
      console.warn('[SECURITY] POST /book called without companySlug (legacy) — rejected');
      return res.status(400).json({ error: 'Entreprise manquante. Merci d\'utiliser le lien de réservation complet.' });
    }
    const companyRow = db.prepare('SELECT id FROM companies WHERE slug = ?').get(companySlug);
    if (!companyRow) return res.status(404).json({ error: 'Entreprise introuvable' });
    cal = db.prepare('SELECT * FROM calendars WHERE slug = ? AND companyId = ?').get(calendarSlug, companyRow.id);
    if (!cal) return res.status(404).json({ error: 'Calendrier introuvable' });

    // ═══ SECURITY: Validate collaboratorId belongs to calendar AND company ═══
    if (collaboratorId) {
      // 1. Must be in calendar's collaborators_json
      const calCollabIds = (()=>{ try { return JSON.parse(cal.collaborators_json || '[]'); } catch { return []; } })();
      if (!calCollabIds.includes(collaboratorId)) {
        console.warn(`[SECURITY] POST /book rejected: collaboratorId ${collaboratorId} not in calendar ${cal.id}`);
        return res.status(403).json({ error: 'Collaborateur invalide pour cet agenda' });
      }
      // 2. Must belong to the calendar's company AND not archived (Wave D)
      const collabCheck = db.prepare('SELECT companyId, archivedAt FROM collaborators WHERE id = ?').get(collaboratorId);
      if (!collabCheck || collabCheck.companyId !== cal.companyId) {
        console.warn(`[SECURITY] POST /book rejected: collaboratorId ${collaboratorId} does not belong to company ${cal.companyId}`);
        return res.status(403).json({ error: 'Collaborateur invalide' });
      }
      if (collabCheck.archivedAt && collabCheck.archivedAt !== '') {
        console.warn(`[SECURITY] POST /book rejected: collaboratorId ${collaboratorId} is archived`);
        return res.status(409).json({ error: 'COLLABORATOR_ARCHIVED' });
      }
    }

    // R1 + R5 — check conflit booking via helper partagé (source de vérité unique)
    if (collaboratorId) {
      const { conflict, existingBooking } = checkBookingConflict(db, {
        collaboratorId,
        date,
        startTime: time,
        duration: duration || cal.duration || 30,
      });
      if (conflict) {
        console.log(`[PUBLIC-BOOK CONFLICT] collab=${collaboratorId} date=${date} time=${time} vs existing=${existingBooking.id}@${existingBooking.time}`);
        return res.status(409).json({ error: "Ce créneau n'est plus disponible", conflictId: existingBooking.id });
      }
    }

    // Anti-collision: check Google Calendar conflicts before booking
    if (collaboratorId) {
      try {
        const collabTz = getCollaboratorTimezone(collaboratorId, cal.companyId);
        const bookingDur = duration || cal.duration;
        const slotStartDT = DateTime.fromISO(`${date}T${time}:00`, { zone: collabTz });
        const slotEndDT = slotStartDT.plus({ minutes: bookingDur });

        const googleConflict = db.prepare(
          `SELECT id FROM google_events WHERE collaboratorId = ?
           AND ((allDay = 0 AND startTime < ? AND endTime > ?)
             OR (allDay = 1 AND startTime <= ? AND endTime > ?))`
        ).get(collaboratorId, slotEndDT.toISO(), slotStartDT.toISO(), `${date}T23:59:59`, `${date}T00:00:00`);

        if (googleConflict) {
          return res.status(409).json({ error: "Ce créneau n'est plus disponible (conflit Google Agenda)" });
        }
      } catch (e) { /* google_events table may not exist yet */ }
    }

    // V3.x.5 Phase 2B — Outlook secondary check (mirror Google secondary check above)
    if (collaboratorId) {
      try {
        const collabTz2 = getCollaboratorTimezone(collaboratorId, cal.companyId);
        const bookingDur2 = duration || cal.duration;
        const slotStartDT2 = DateTime.fromISO(`${date}T${time}:00`, { zone: collabTz2 });
        const slotEndDT2 = slotStartDT2.plus({ minutes: bookingDur2 });

        const outlookConflict = db.prepare(
          `SELECT id FROM outlook_events WHERE collaboratorId = ?
           AND showAs != 'free'
           AND ((allDay = 0 AND startTime < ? AND endTime > ?)
             OR (allDay = 1 AND startTime <= ? AND endTime > ?))`
        ).get(collaboratorId, slotEndDT2.toISO(), slotStartDT2.toISO(), `${date}T23:59:59`, `${date}T00:00:00`);

        if (outlookConflict) {
          return res.status(409).json({ error: "Ce créneau n'est plus disponible (conflit Outlook Agenda)" });
        }
      } catch (e) { /* outlook_events table may not exist yet */ }
    }

    const id = 'b' + Date.now();
    const status = cal.requireApproval ? 'pending' : 'confirmed';
    // Generate secure manage token for client self-service
    const manageToken = 'mt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);

    const bookingDuration = duration || cal.duration;
    db.prepare(`INSERT INTO bookings (id, calendarId, collaboratorId, companyId, date, time, duration, visitorName, visitorEmail, visitorPhone, status, notes, noShow, source, rating, tags_json, checkedIn, internalNotes, reconfirmed, visitorTimezone, manageToken)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'public', NULL, '[]', 0, ?, 0, ?, ?)`)
      .run(id, cal.id, collaboratorId || null, cal.companyId, date, time, bookingDuration, visitorName, visitorEmail || '', visitorPhone || '', status, answers ? JSON.stringify(answers) : '', '', visitorTimezone || null, manageToken);

    // 3. Sync to Google Calendar + generate Meet link FIRST (need meetLink for emails)
    let meetLink = null;
    const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(cal.companyId);
    // Fetch collaborator with company filter (defense in depth)
    const collab = collaboratorId ? db.prepare('SELECT id, name, email, phone FROM collaborators WHERE id = ? AND companyId = ?').get(collaboratorId, cal.companyId) : null;

    if (collaboratorId && isConnected(collaboratorId)) {
      try {
        const result = await createEvent(collaboratorId, { date, time, duration: bookingDuration, visitorName, visitorEmail, visitorPhone }, { name: cal.name, location: cal.location || '' });
        if (result?.googleEventId) {
          db.prepare('UPDATE bookings SET googleEventId = ? WHERE id = ?').run(result.googleEventId, id);
        }
        if (result?.meetLink) {
          meetLink = result.meetLink;
          db.prepare('UPDATE bookings SET meetLink = ? WHERE id = ?').run(meetLink, id);
        }
      } catch (err) {
        console.error('[GOOGLE SYNC ERROR]', err.message);
      }
    }

    // 4. Send notifications (fire-and-forget)
    const collaboratorTimezone = collaboratorId ? getCollaboratorTimezone(collaboratorId, cal.companyId) : 'Europe/Paris';
    // Pre-compute visitor's time if timezones differ
    let visitorTime = time;
    if (visitorTimezone && visitorTimezone !== collaboratorTimezone) {
      const dt = DateTime.fromISO(`${date}T${time}:00`, { zone: collaboratorTimezone });
      visitorTime = dt.setZone(visitorTimezone).toFormat('HH:mm');
    }

    const emailData = {
      visitorName, visitorEmail, visitorPhone, date, time, duration: bookingDuration,
      calendarName: cal.name, collaboratorName: collab?.name || '',
      companyName: company?.name || 'Calendar360', location: cal.location || '',
      meetLink, collaboratorTimezone, visitorTimezone: visitorTimezone || collaboratorTimezone, visitorTime,
      customConfirmSms: cal.customConfirmSms || null,
      customConfirmWhatsapp: cal.customConfirmWhatsapp || null,
      manageToken,
    };

    if (status === 'confirmed') {
      // Notification channels from calendar settings (split: confirmation)
      const calNotifyEmail = cal.confirmEmail !== undefined ? cal.confirmEmail !== 0 : cal.notifyEmail !== 0;
      const calNotifySms = cal.confirmSms !== undefined ? !!cal.confirmSms : !!cal.notifySms;
      const calNotifyWhatsapp = cal.confirmWhatsapp !== undefined ? !!cal.confirmWhatsapp : !!cal.notifyWhatsapp;

      // Email
      if (calNotifyEmail && visitorEmail) {
        const { subject, html } = bookingConfirmedEmail(emailData);
        sendEmail({ to: visitorEmail, toName: visitorName, subject, htmlContent: html }).catch(() => {});
      }

      // SMS (French numbers only)
      if (calNotifySms && visitorPhone) {
        const cleanPhone = (visitorPhone || '').replace(/\s/g, '');
        const isFrench = cleanPhone.startsWith('+33') || cleanPhone.startsWith('0033') || (cleanPhone.startsWith('0') && cleanPhone.length === 10);
        if (isFrench) {
          const smsContent = bookingConfirmedSms(emailData);
          const smsCompany = db.prepare('SELECT sms_sender_name FROM companies WHERE id = ?').get(cal.companyId);
          const smsSender = smsCompany?.sms_sender_name || null;
          sendSms({ to: visitorPhone, content: smsContent, sender: smsSender }).catch(() => {});
        }
      }

      // WhatsApp (international)
      if (calNotifyWhatsapp && visitorPhone) {
        const waText = bookingConfirmedWhatsapp(emailData);
        sendWhatsapp({ to: visitorPhone, text: waText, senderNumber: cal.whatsappNumber }).catch(() => {});
      }
    }

    if (collab?.email) {
      const { subject, html } = newBookingNotifyEmail(emailData);
      sendEmail({ to: collab.email, toName: collab.name, subject, htmlContent: html }).catch(() => {});
    }

    // 5. Auto-create/update CRM contact
    try {
      if (visitorEmail) {
        // Check email OR phone for existing contact (dédup)
        let existingContact = db.prepare('SELECT id, totalBookings FROM contacts WHERE email = ? AND companyId = ?').get(visitorEmail, cal.companyId);
        if (!existingContact && visitorPhone) {
          const cleanPh = (visitorPhone||'').replace(/[^\d]/g,'').slice(-9);
          if (cleanPh.length >= 9) {
            existingContact = db.prepare("SELECT id, totalBookings FROM contacts WHERE companyId = ? AND phone LIKE ?").get(cal.companyId, '%' + cleanPh + '%');
          }
        }
        if (existingContact) {
          db.prepare("UPDATE contacts SET totalBookings = ?, lastVisit = ?, name = ?, phone = COALESCE(NULLIF(?, ''), phone), email = COALESCE(NULLIF(?, ''), email), next_rdv_date = CASE WHEN next_rdv_date IS NULL OR next_rdv_date = '' OR next_rdv_date > ? THEN ? ELSE next_rdv_date END, rdv_status = 'programme', updatedAt = ? WHERE id = ?")
            .run((existingContact.totalBookings || 0) + 1, date, visitorName, visitorPhone || '', visitorEmail || '', date, date, new Date().toISOString(), existingContact.id);
          // V5: Sauvegarder le contactId dans le booking
          try { db.prepare('UPDATE bookings SET contactId = ? WHERE id = ?').run(existingContact.id, id); } catch {}
          autoPipelineAdvance(existingContact.id, 'booking_created');
          updateBehaviorScore(existingContact.id, 'booking_created');
        } else {
          const contactId = 'ct' + Date.now();
          const defaultAssign = collaboratorId || db.prepare("SELECT id FROM collaborators WHERE companyId = ? AND role = 'admin' AND (archivedAt IS NULL OR archivedAt = '') LIMIT 1").get(cal.companyId)?.id || '';
          db.prepare("INSERT INTO contacts (id, companyId, name, email, phone, totalBookings, lastVisit, tags_json, notes, rating, docs_json, assignedTo, pipeline_stage, source, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, ?, '[]', '', NULL, '[]', ?, 'nouveau', 'booking', ?, ?)")
            .run(contactId, cal.companyId, visitorName, visitorEmail, visitorPhone || '', date, defaultAssign, new Date().toISOString(), new Date().toISOString());
          // V5: Sauvegarder le contactId dans le booking
          try { db.prepare('UPDATE bookings SET contactId = ? WHERE id = ?').run(contactId, id); } catch {}
          autoPipelineAdvance(contactId, 'booking_created');
          updateBehaviorScore(contactId, 'booking_created');
        }
      }
    } catch (crmErr) {
      console.error('[CRM ERROR]', crmErr.message);
    }

    res.json({
      success: true,
      booking: { id, status, date, time, duration: bookingDuration, meetLink, manageToken },
      message: status === 'pending' ? 'Votre demande est en attente de confirmation.' : 'Votre rendez-vous est confirmé !',
    });
  } catch (err) {
    console.error('[BOOK ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export default router;
