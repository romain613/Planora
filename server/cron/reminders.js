/**
 * Automatic Reminder Cron Job
 * Runs every 5 minutes, checks for upcoming bookings, sends reminders
 */
import cron from 'node-cron';
import { db, getCollaboratorTimezone } from '../db/database.js';
import { DateTime } from 'luxon';
import { sendEmail } from '../services/brevoEmail.js';
import { sendSms } from '../services/brevoSms.js';
import { sendWhatsapp } from '../services/brevoWhatsapp.js';
import { reminderEmail, reminderSms, reminderWhatsapp } from '../templates/reminder.js';
import { sendChatNotification, formatDailySummary } from '../services/googleChat.js';
import { syncEventsFromGoogle } from '../services/googleCalendar.js';

// Run every 5 minutes
cron.schedule('*/5 * * * *', () => {
  try {
    processReminders();
  } catch (err) {
    console.error('[CRON REMINDER ERROR]', err);
  }
});

function processReminders() {
  const now = new Date();

  // Get all companies with their settings
  const companies = db.prepare('SELECT id FROM companies').all();

  for (const company of companies) {
    // Global timing config (fallback when calendar has no custom reminders)
    const settings = db.prepare('SELECT reminder24h, reminder1h, reminder15min FROM settings WHERE companyId = ?').get(company.id);
    if (!settings) continue;

    const globalChecks = [];
    if (settings.reminder24h) globalChecks.push({ type: '24h', minutesBefore: 1440 });
    if (settings.reminder1h) globalChecks.push({ type: '1h', minutesBefore: 60 });
    if (settings.reminder15min) globalChecks.push({ type: '15min', minutesBefore: 15 });

    // Get confirmed bookings with calendar notification options + custom reminder timings
    const bookings = db.prepare(`
      SELECT b.*, b.manageToken, c.name as calendarName, c.companyId, c.location, b.visitorTimezone,
             c.notifyEmail, c.notifySms, c.notifyWhatsapp, c.whatsappNumber,
             c.customReminderSms, c.customReminderWhatsapp,
             c.reminderEmail, c.reminderSms, c.reminderWhatsapp,
             c.customReminders, c.calReminder24h, c.calReminder1h, c.calReminder15min
      FROM bookings b
      JOIN calendars c ON b.calendarId = c.id
      WHERE c.companyId = ? AND b.status = 'confirmed'
    `).all(company.id);

    const companyData = db.prepare('SELECT name FROM companies WHERE id = ?').get(company.id);

    for (const booking of bookings) {
      // Determine which timing checks to use: per-calendar or global
      let checks;
      if (booking.customReminders) {
        checks = [];
        if (booking.calReminder24h) checks.push({ type: '24h', minutesBefore: 1440 });
        if (booking.calReminder1h) checks.push({ type: '1h', minutesBefore: 60 });
        if (booking.calReminder15min) checks.push({ type: '15min', minutesBefore: 15 });
      } else {
        checks = globalChecks;
      }
      if (checks.length === 0) continue;

      // Use collaborator timezone for accurate time comparison
      const collabTz = getCollaboratorTimezone(booking.collaboratorId, booking.companyId);
      const bookingLuxon = DateTime.fromISO(`${booking.date}T${booking.time}:00`, { zone: collabTz });
      const diffMinutes = (bookingLuxon.toMillis() - now.getTime()) / 60000;

      for (const check of checks) {
        // Check if we're within the reminder window (± 5 minutes)
        if (diffMinutes > check.minutesBefore - 5 && diffMinutes <= check.minutesBefore + 5) {
          // Check if already sent
          const alreadySent = db.prepare('SELECT id FROM reminder_logs WHERE bookingId = ? AND type = ?').get(booking.id, check.type);
          if (alreadySent) continue;

          // Get collaborator info
          const collab = booking.collaboratorId
            ? db.prepare('SELECT name FROM collaborators WHERE id = ?').get(booking.collaboratorId)
            : null;

          const data = {
            visitorName: booking.visitorName,
            visitorEmail: booking.visitorEmail,
            visitorPhone: booking.visitorPhone,
            date: booking.date,
            time: booking.time,
            duration: booking.duration,
            calendarName: booking.calendarName,
            collaboratorName: collab?.name || '',
            companyName: companyData?.name || 'Calendar360',
            location: booking.location || '',
            collaboratorTimezone: collabTz,
            visitorTimezone: booking.visitorTimezone || collabTz,
            customReminderSms: booking.customReminderSms || null,
            customReminderWhatsapp: booking.customReminderWhatsapp || null,
            manageToken: booking.manageToken || null,
          };

          // Channel flags from the calendar (split: reminder)
          const calNotifyEmail = booking.reminderEmail !== undefined ? booking.reminderEmail !== 0 : booking.notifyEmail !== 0;
          const calNotifySms = booking.reminderSms !== undefined ? !!booking.reminderSms : !!booking.notifySms;
          const calNotifyWhatsapp = booking.reminderWhatsapp !== undefined ? !!booking.reminderWhatsapp : !!booking.notifyWhatsapp;
          const channels = [];

          // Send email reminder (if calendar has email enabled)
          if (calNotifyEmail && booking.visitorEmail) {
            const { subject, html } = reminderEmail(data);
            sendEmail({ to: booking.visitorEmail, toName: booking.visitorName, subject, htmlContent: html })
              .then(() => console.log(`\x1b[35m[CRON REMINDER ${check.type}]\x1b[0m Email → ${booking.visitorEmail}`))
              .catch(err => console.error(`[CRON REMINDER ERR] Email ${booking.visitorEmail}:`, err.message));
            channels.push('email');
          }

          // Send SMS (if calendar has SMS enabled + French phone only)
          if (calNotifySms && booking.visitorPhone) {
            const phone = (booking.visitorPhone || '').replace(/\s/g, '');
            const isFrenchPhone = phone.startsWith('+33') || phone.startsWith('0033') || (phone.startsWith('0') && phone.length === 10);
            if (isFrenchPhone) {
              const smsContent = reminderSms(data);
              const smsCompany = db.prepare('SELECT sms_sender_name FROM companies WHERE id = ?').get(booking.companyId);
              const smsSender = smsCompany?.sms_sender_name || null;
              sendSms({ to: booking.visitorPhone, content: smsContent, sender: smsSender })
                .then((result) => {
                  console.log(`\x1b[35m[CRON REMINDER ${check.type}]\x1b[0m SMS → ${booking.visitorPhone}`);
                  // Auto-debit SMS credits
                  if (result && result.success && !result.demo) {
                    try {
                      db.prepare('UPDATE sms_credits SET credits = MAX(0, credits - 1) WHERE companyId = ?').run(booking.companyId);
                      const txId = 'stx' + Date.now() + Math.random().toString(36).slice(2, 5);
                      db.prepare('INSERT INTO sms_transactions (id, companyId, date, type, count, detail, amount) VALUES (?, ?, ?, ?, ?, ?, ?)')
                        .run(txId, booking.companyId, new Date().toISOString().split('T')[0], 'sent', -1, `Rappel ${check.type} → ${booking.visitorName}`, 0);
                    } catch (e) { console.error('[SMS DEBIT ERR]', e.message); }
                  }
                })
                .catch(err => console.error(`[CRON REMINDER ERR] SMS ${booking.visitorPhone}:`, err.message));
              channels.push('sms');
            }
          }

          // Send WhatsApp (if calendar has WhatsApp enabled + phone exists)
          if (calNotifyWhatsapp && booking.visitorPhone) {
            const waText = reminderWhatsapp(data);
            sendWhatsapp({ to: booking.visitorPhone, text: waText, senderNumber: booking.whatsappNumber })
              .then(() => console.log(`\x1b[35m[CRON REMINDER ${check.type}]\x1b[0m WhatsApp → ${booking.visitorPhone}`))
              .catch(err => console.error(`[CRON REMINDER ERR] WhatsApp ${booking.visitorPhone}:`, err.message));
            channels.push('whatsapp');
          }

          // Log the reminder
          const logId = 'rl' + Date.now() + Math.random().toString(36).slice(2, 6);
          db.prepare('INSERT INTO reminder_logs (id, bookingId, type, channel, sentAt) VALUES (?, ?, ?, ?, ?)')
            .run(logId, booking.id, check.type, channels.join('+') || 'none', now.toISOString());
        }
      }
    }
  }
}

// Daily summary via Google Chat — runs at 8:00 AM
cron.schedule('0 8 * * *', () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const companies = db.prepare('SELECT c.id, c.name, s.google_chat_webhook FROM companies c LEFT JOIN settings s ON s.companyId = c.id').all();
    for (const co of companies) {
      if (!co.google_chat_webhook) continue;
      const bookings = db.prepare(`
        SELECT b.* FROM bookings b
        JOIN calendars c ON b.calendarId = c.id
        WHERE c.companyId = ? AND b.date = ?
      `).all(co.id, today);
      const msg = formatDailySummary(today, bookings, co.name || 'Calendar360');
      sendChatNotification(co.google_chat_webhook, msg).catch(() => {});
      console.log(`\x1b[33m[CRON CHAT]\x1b[0m Daily summary sent to ${co.name}`);
    }
  } catch (err) {
    console.error('[CRON CHAT ERROR]', err);
  }
});

// Sync Google Calendar events every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    const collabs = db.prepare('SELECT id FROM collaborators WHERE google_tokens_json IS NOT NULL').all();
    if (collabs.length === 0) return;
    let total = 0;
    for (const c of collabs) {
      try {
        const result = await syncEventsFromGoogle(c.id);
        total += result.synced;
      } catch (err) {
        console.error(`\x1b[31m[CRON GCAL SYNC]\x1b[0m ${c.id}: ${err.message}`);
      }
    }
    if (total > 0) console.log(`\x1b[32m[CRON GCAL SYNC]\x1b[0m ${total} events synced for ${collabs.length} collaborator(s)`);
  } catch (err) {
    console.error('[CRON GCAL SYNC ERROR]', err);
  }
});

console.log('\x1b[35m[CRON]\x1b[0m Reminder scheduler started (every 5 min)');
console.log('\x1b[33m[CRON]\x1b[0m Google Chat daily summary scheduled (8:00 AM)');
console.log('\x1b[32m[CRON]\x1b[0m Google Calendar sync scheduled (every 5 min)');
