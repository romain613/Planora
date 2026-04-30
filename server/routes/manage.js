import { Router } from 'express';
import { db, getCollaboratorTimezone, validateTimezone } from '../db/database.js';
import { sendEmail } from '../services/brevoEmail.js';
import { cancelledEmail } from '../templates/cancelled.js';
import { autoPipelineAdvance } from '../helpers/pipelineAuto.js';
import { updateBehaviorScore } from '../helpers/behaviorScore.js';

const router = Router();

// GET /api/manage/:token — Get booking details by manage token
router.get('/:token', (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT b.*, c.name as calendarName, c.color as calendarColor, c.duration as calendarDuration,
             c.location as calendarLocation, c.slug as calendarSlug, c.companyId,
             co.name as companyName, co.slug as companySlug
      FROM bookings b
      JOIN calendars c ON b.calendarId = c.id
      JOIN companies co ON c.companyId = co.id
      WHERE b.manageToken = ?
    `).get(req.params.token);
    if (!booking) return res.status(404).json({ error: 'Réservation introuvable' });
    // Resolve timezones for display
    const collaboratorTimezone = booking.collaboratorId
      ? getCollaboratorTimezone(booking.collaboratorId, booking.companyId)
      : 'Europe/Paris';
    const visitorTimezone = booking.visitorTimezone || collaboratorTimezone;

    res.json({
      id: booking.id,
      date: booking.date,
      time: booking.time,
      duration: booking.duration || booking.calendarDuration,
      status: booking.status,
      visitorName: booking.visitorName,
      visitorEmail: booking.visitorEmail,
      calendarName: booking.calendarName,
      calendarColor: booking.calendarColor,
      calendarLocation: booking.calendarLocation,
      calendarSlug: booking.calendarSlug,
      companyName: booking.companyName,
      companySlug: booking.companySlug,
      companyId: booking.companyId,
      meetLink: booking.meetLink,
      visitorTimezone,
      collaboratorTimezone,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/manage/:token/cancel — Cancel booking
router.post('/:token/cancel', (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT b.*, c.companyId, c.name as calendarName, c.slug as calendarSlug,
             co.name as companyName, co.slug as companySlug
      FROM bookings b
      JOIN calendars c ON b.calendarId = c.id
      JOIN companies co ON c.companyId = co.id
      WHERE b.manageToken = ?
    `).get(req.params.token);
    if (!booking) return res.status(404).json({ error: 'Réservation introuvable' });
    if (booking.status === 'cancelled') return res.json({ success: true, message: 'Déjà annulé' });
    const reason = req.body.reason || '';
    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run('cancelled', booking.id);

    // Décrémenter totalBookings + recalculer next_rdv_date + auto pipeline (par contactId ou email)
    try {
      const cid = booking.contactId || (booking.visitorEmail ? db.prepare('SELECT id FROM contacts WHERE email = ? AND companyId = ?').get(booking.visitorEmail, booking.companyId)?.id : null);
      if (cid) {
        db.prepare('UPDATE contacts SET totalBookings = MAX(0, totalBookings - 1) WHERE id = ?').run(cid);
        const next = db.prepare("SELECT date FROM bookings WHERE contactId = ? AND status = 'confirmed' AND date >= date('now') ORDER BY date ASC, time ASC LIMIT 1").get(cid);
        db.prepare('UPDATE contacts SET next_rdv_date = ?, rdv_status = ? WHERE id = ?').run(next ? next.date : null, next ? 'programme' : null, cid);
        autoPipelineAdvance(cid, 'booking_cancelled_last');
        updateBehaviorScore(cid, 'booking_cancelled');
      }
    } catch {}

    // Log activity (schéma: id, companyId, companyName, action, detail, timestamp, user)
    try {
      db.prepare('INSERT INTO activity_logs (id, companyId, companyName, action, detail, timestamp, user) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        'log' + Date.now(), booking.companyId, booking.companyName || '',
        'booking_cancelled_by_client',
        `${booking.visitorName} a annulé son RDV du ${booking.date} à ${booking.time}${reason ? ' — Raison: ' + reason : ''}`,
        new Date().toISOString(), booking.visitorName || 'client'
      );
    } catch {}

    // Envoyer email annulation au client (fire-and-forget)
    if (booking.visitorEmail) {
      const collab = booking.collaboratorId ? db.prepare('SELECT name FROM collaborators WHERE id = ?').get(booking.collaboratorId) : null;
      const rebookUrl = `https://calendar360.fr/${booking.companySlug}/${booking.calendarSlug}`;
      const { subject, html } = cancelledEmail({
        visitorName: booking.visitorName, date: booking.date, time: booking.time,
        calendarName: booking.calendarName, collaboratorName: collab?.name || '',
        companyName: booking.companyName, rebookUrl,
      });
      sendEmail({ to: booking.visitorEmail, toName: booking.visitorName, subject, htmlContent: html }).catch(() => {});
    }

    // Notification interne au collaborateur (activity_logs visible dans le dashboard)
    if (booking.collaboratorId) {
      try {
        db.prepare('INSERT INTO activity_logs (id, companyId, companyName, action, detail, timestamp, user) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          'log' + Date.now() + 'n', booking.companyId, booking.companyName || '',
          'booking_cancel_notify',
          `⚠️ ${booking.visitorName} a annulé son RDV du ${booking.date} à ${booking.time} (${booking.calendarName})${reason ? ' — Raison: ' + reason : ''}`,
          new Date().toISOString(), booking.visitorName || 'client'
        );
      } catch {}
    }

    res.json({ success: true, message: 'Votre rendez-vous a été annulé.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/manage/:token/slots — Get available slots for rescheduling
router.get('/:token/slots', (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT b.*, c.slug as calendarSlug, c.companyId, co.slug as companySlug
      FROM bookings b
      JOIN calendars c ON b.calendarId = c.id
      JOIN companies co ON c.companyId = co.id
      WHERE b.manageToken = ?
    `).get(req.params.token);
    if (!booking) return res.status(404).json({ error: 'Réservation introuvable' });

    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date requise' });

    // Use visitor's original timezone from the booking, or query param, or collaborator timezone
    const collaboratorTz = booking.collaboratorId
      ? getCollaboratorTimezone(booking.collaboratorId, booking.companyId)
      : 'Europe/Paris';
    const rawTz = req.query.visitorTimezone || booking.visitorTimezone || collaboratorTz;
    const tz = validateTimezone(rawTz) || collaboratorTz;

    // Redirect to internal public slots fetch with proper timezone
    res.redirect(307, `/api/public/slots/${booking.companySlug}/${booking.calendarSlug}?date=${date}&duration=${booking.duration || 30}&visitorTimezone=${encodeURIComponent(tz)}`);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/manage/:token/reschedule — Reschedule booking
router.post('/:token/reschedule', (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT b.*, c.companyId, co.name as companyName
      FROM bookings b JOIN calendars c ON b.calendarId = c.id
      JOIN companies co ON c.companyId = co.id
      WHERE b.manageToken = ?
    `).get(req.params.token);
    if (!booking) return res.status(404).json({ error: 'Réservation introuvable' });
    if (booking.status === 'cancelled') return res.status(400).json({ error: 'RDV déjà annulé' });
    const { date, time } = req.body;
    if (!date || !time) return res.status(400).json({ error: 'Date et heure requises' });
    const oldDate = booking.date;
    const oldTime = booking.time;
    db.prepare('UPDATE bookings SET date = ?, time = ?, status = ? WHERE id = ?').run(date, time, 'confirmed', booking.id);

    // Recalculer next_rdv_date du contact (par contactId ou email)
    try {
      const cid = booking.contactId || (booking.visitorEmail ? db.prepare('SELECT id FROM contacts WHERE email = ? AND companyId = ?').get(booking.visitorEmail, booking.companyId)?.id : null);
      if (cid) {
        const next = db.prepare("SELECT date FROM bookings WHERE contactId = ? AND status = 'confirmed' AND date >= date('now') ORDER BY date ASC, time ASC LIMIT 1").get(cid);
        if (next) db.prepare("UPDATE contacts SET next_rdv_date = ?, rdv_status = 'programme' WHERE id = ?").run(next.date, cid);
      }
    } catch {}

    // Log activity
    try {
      db.prepare('INSERT INTO activity_logs (id, companyId, companyName, action, detail, timestamp, user) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        'log' + Date.now(), booking.companyId, booking.companyName || '',
        'booking_rescheduled_by_client',
        `${booking.visitorName} a replanifié: ${oldDate} ${oldTime} → ${date} ${time}`,
        new Date().toISOString(), booking.visitorName || 'client'
      );
    } catch {}
    res.json({ success: true, message: 'Votre rendez-vous a été replanifié.', newDate: date, newTime: time });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
