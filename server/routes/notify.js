import { Router } from 'express';
import { db } from '../db/database.js';
import { sendEmail } from '../services/brevoEmail.js';
import { sendSms } from '../services/brevoSms.js';
import { sendWhatsapp } from '../services/brevoWhatsapp.js';
import { bookingConfirmedEmail, bookingConfirmedSms, bookingConfirmedWhatsapp } from '../templates/bookingConfirmed.js';
import { reminderEmail, reminderSms, reminderWhatsapp } from '../templates/reminder.js';
import { cancelledEmail } from '../templates/cancelled.js';
import { rescheduledEmail } from '../templates/rescheduled.js';
import { welcomeEmail } from '../templates/welcome.js';

const router = Router();

// Helper: get calendar notification flags from a bookingId or calendarId
function getCalNotifyFlags(data) {
  let calRow = null;
  const cols = 'notifyEmail, notifySms, notifyWhatsapp, whatsappNumber, customConfirmSms, customConfirmWhatsapp, customReminderSms, customReminderWhatsapp, confirmEmail, confirmSms, confirmWhatsapp, reminderEmail, reminderSms, reminderWhatsapp';
  if (data.calendarId) {
    calRow = db.prepare(`SELECT ${cols} FROM calendars WHERE id = ?`).get(data.calendarId);
  } else if (data.bookingId) {
    calRow = db.prepare(`SELECT ${cols.split(', ').map(c=>'c.'+c).join(', ')} FROM calendars c JOIN bookings b ON b.calendarId = c.id WHERE b.id = ?`).get(data.bookingId);
  }
  return {
    // Confirmation channels
    confirmEmail: calRow ? (calRow.confirmEmail !== undefined ? calRow.confirmEmail !== 0 : calRow.notifyEmail !== 0) : true,
    confirmSms: calRow ? (calRow.confirmSms !== undefined ? !!calRow.confirmSms : !!calRow.notifySms) : false,
    confirmWhatsapp: calRow ? (calRow.confirmWhatsapp !== undefined ? !!calRow.confirmWhatsapp : !!calRow.notifyWhatsapp) : false,
    // Reminder channels
    reminderEmail: calRow ? (calRow.reminderEmail !== undefined ? calRow.reminderEmail !== 0 : calRow.notifyEmail !== 0) : true,
    reminderSms: calRow ? (calRow.reminderSms !== undefined ? !!calRow.reminderSms : !!calRow.notifySms) : false,
    reminderWhatsapp: calRow ? (calRow.reminderWhatsapp !== undefined ? !!calRow.reminderWhatsapp : !!calRow.notifyWhatsapp) : false,
    // Shared
    whatsappNumber: calRow?.whatsappNumber || '',
    customConfirmSms: calRow?.customConfirmSms || null,
    customConfirmWhatsapp: calRow?.customConfirmWhatsapp || null,
    customReminderSms: calRow?.customReminderSms || null,
    customReminderWhatsapp: calRow?.customReminderWhatsapp || null,
  };
}

function isFrenchPhone(phone) {
  const clean = (phone || '').replace(/\s/g, '');
  return clean.startsWith('+33') || clean.startsWith('0033') || (clean.startsWith('0') && clean.length === 10);
}

// ─── POST /api/notify/booking-confirmed ───
router.post('/booking-confirmed', async (req, res) => {
  try {
    const data = req.body;
    console.log(`\x1b[35m[BOOKING-CONFIRMED]\x1b[0m ${data.visitorName} → ${data.calendarName} le ${data.date} ${data.time}`);

    const flags = getCalNotifyFlags(data);
    let emailResult = { skipped: true };
    let smsResult = { skipped: true };
    let waResult = { skipped: true };

    // Email
    if (flags.confirmEmail && data.visitorEmail) {
      const { subject, html } = bookingConfirmedEmail(data);
      emailResult = await sendEmail({ to: data.visitorEmail, toName: data.visitorName, subject, htmlContent: html });
    }

    // Enrich data with custom templates from calendar
    const enrichedData = { ...data, customConfirmSms: data.customConfirmSms || flags.customConfirmSms, customConfirmWhatsapp: data.customConfirmWhatsapp || flags.customConfirmWhatsapp };

    // SMS (French only)
    if (flags.confirmSms && data.visitorPhone && isFrenchPhone(data.visitorPhone)) {
      const smsContent = bookingConfirmedSms(enrichedData);
      const companyRow = data.companyId ? db.prepare('SELECT sms_sender_name FROM companies WHERE id = ?').get(data.companyId) : null;
      const sender = companyRow?.sms_sender_name || null;
      smsResult = await sendSms({ to: data.visitorPhone, content: smsContent, sender });
      // Auto-debit SMS credits
      if (smsResult?.success && !smsResult.demo && data.companyId) {
        try {
          db.prepare('UPDATE sms_credits SET credits = MAX(0, credits - 1) WHERE companyId = ?').run(data.companyId);
          const txId = 'stx' + Date.now() + Math.random().toString(36).slice(2, 5);
          db.prepare('INSERT INTO sms_transactions (id, companyId, date, type, count, detail, amount) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(txId, data.companyId, new Date().toISOString().split('T')[0], 'sent', -1, `Confirmation → ${data.visitorName}`, 0);
        } catch (e) { console.error('[SMS DEBIT ERR]', e.message); }
      }
    }

    // WhatsApp
    if (flags.confirmWhatsapp && data.visitorPhone) {
      const waText = bookingConfirmedWhatsapp(enrichedData);
      waResult = await sendWhatsapp({ to: data.visitorPhone, text: waText, senderNumber: flags.whatsappNumber });
    }

    res.json({ success: true, email: emailResult, sms: smsResult, whatsapp: waResult });
  } catch (err) {
    console.error('[BOOKING-CONFIRMED ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/notify/reminder ───
router.post('/reminder', async (req, res) => {
  try {
    const data = req.body;
    console.log(`\x1b[35m[REMINDER]\x1b[0m ${data.visitorName} → ${data.calendarName} le ${data.date} ${data.time}`);

    const flags = getCalNotifyFlags(data);
    let emailResult = { skipped: true };
    let smsResult = { skipped: true };
    let waResult = { skipped: true };

    // Email
    if (flags.reminderEmail && data.visitorEmail) {
      const { subject, html } = reminderEmail(data);
      emailResult = await sendEmail({ to: data.visitorEmail, toName: data.visitorName, subject, htmlContent: html });
    }

    // Enrich data with custom templates from calendar
    const enrichedData = { ...data, customReminderSms: data.customReminderSms || flags.customReminderSms, customReminderWhatsapp: data.customReminderWhatsapp || flags.customReminderWhatsapp };

    // SMS (French only)
    if (flags.reminderSms && data.visitorPhone && isFrenchPhone(data.visitorPhone)) {
      const smsContent = reminderSms(enrichedData);
      const companyRow2 = data.companyId ? db.prepare('SELECT sms_sender_name FROM companies WHERE id = ?').get(data.companyId) : null;
      const sender2 = companyRow2?.sms_sender_name || null;
      smsResult = await sendSms({ to: data.visitorPhone, content: smsContent, sender: sender2 });
      // Auto-debit SMS credits
      if (smsResult?.success && !smsResult.demo && data.companyId) {
        try {
          db.prepare('UPDATE sms_credits SET credits = MAX(0, credits - 1) WHERE companyId = ?').run(data.companyId);
          const txId = 'stx' + Date.now() + Math.random().toString(36).slice(2, 5);
          db.prepare('INSERT INTO sms_transactions (id, companyId, date, type, count, detail, amount) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(txId, data.companyId, new Date().toISOString().split('T')[0], 'sent', -1, `Rappel → ${data.visitorName}`, 0);
        } catch (e) { console.error('[SMS DEBIT ERR]', e.message); }
      }
    }

    // WhatsApp
    if (flags.reminderWhatsapp && data.visitorPhone) {
      const waText = reminderWhatsapp(enrichedData);
      waResult = await sendWhatsapp({ to: data.visitorPhone, text: waText, senderNumber: flags.whatsappNumber });
    }

    res.json({ success: true, email: emailResult, sms: smsResult, whatsapp: waResult });
  } catch (err) {
    console.error('[REMINDER ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/notify/cancelled ───
router.post('/cancelled', async (req, res) => {
  try {
    const data = req.body;
    console.log(`\x1b[35m[CANCELLED]\x1b[0m ${data.visitorName} → ${data.calendarName} le ${data.date}`);

    const { subject, html } = cancelledEmail(data);
    const emailResult = await sendEmail({ to: data.visitorEmail, toName: data.visitorName, subject, htmlContent: html });

    res.json({ success: true, email: emailResult });
  } catch (err) {
    console.error('[CANCELLED ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/notify/rescheduled ───
router.post('/rescheduled', async (req, res) => {
  try {
    const data = req.body;
    console.log(`\x1b[35m[RESCHEDULED]\x1b[0m ${data.visitorName} → ${data.newDate} ${data.newTime}`);

    const { subject, html } = rescheduledEmail(data);
    const emailResult = await sendEmail({ to: data.visitorEmail, toName: data.visitorName, subject, htmlContent: html });

    res.json({ success: true, email: emailResult });
  } catch (err) {
    console.error('[RESCHEDULED ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/notify/noshow ───
router.post('/noshow', async (req, res) => {
  try {
    const data = req.body;
    console.log(`\x1b[35m[NO-SHOW]\x1b[0m ${data.visitorName}`);

    const { html } = cancelledEmail({ ...data });
    const emailResult = await sendEmail({
      to: data.visitorEmail,
      toName: data.visitorName,
      subject: `Vous n'avez pas pu venir ? Replanifiez votre ${data.calendarName}`,
      htmlContent: html,
    });

    res.json({ success: true, email: emailResult });
  } catch (err) {
    console.error('[NO-SHOW ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/notify/welcome ───
router.post('/welcome', async (req, res) => {
  try {
    const data = req.body;
    console.log(`\x1b[35m[WELCOME]\x1b[0m ${data.name} → ${data.email}`);
    const { subject, html } = welcomeEmail(data);
    const emailResult = await sendEmail({ to: data.email, toName: data.name, subject, htmlContent: html });
    res.json({ success: true, email: emailResult });
  } catch (err) {
    console.error('[WELCOME ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
