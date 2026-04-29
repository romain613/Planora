/**
 * Google Calendar Service
 * OAuth2 flow + CRUD events for collaborator calendar sync
 */
import { google } from 'googleapis';
import { db, getCollaboratorTimezone } from '../db/database.js';
import { DateTime } from 'luxon';

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Generate Google OAuth authorization URL
 */
export function getAuthUrl(collaboratorId) {
  const oauth2 = createOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/tasks',
    ],
    state: collaboratorId,
  });
}

/**
 * Exchange authorization code for tokens, store in DB
 */
export async function handleCallback(code, collaboratorId) {
  const oauth2 = createOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  // Fetch Google email
  let email = null;
  try {
    const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
    const { data } = await oauth2Api.userinfo.get();
    email = data.email;
  } catch (err) {
    console.error('[GOOGLE] Could not fetch email:', err.message);
  }

  db.prepare('UPDATE collaborators SET google_tokens_json = ?, google_email = ? WHERE id = ?')
    .run(JSON.stringify(tokens), email, collaboratorId);

  // Trigger initial sync of Google Calendar events (fire-and-forget)
  syncEventsFromGoogle(collaboratorId).catch(err => {
    console.error('[GOOGLE INITIAL SYNC ERROR]', err.message);
  });

  return tokens;
}

/**
 * Get an authenticated Google Calendar client for a collaborator
 */
function getCalendarClient(collaboratorId) {
  const row = db.prepare('SELECT google_tokens_json FROM collaborators WHERE id = ?').get(collaboratorId);
  if (!row?.google_tokens_json) return null;

  const tokens = JSON.parse(row.google_tokens_json);
  const oauth2 = createOAuth2Client();
  oauth2.setCredentials(tokens);

  // Auto-refresh: save new tokens when refreshed
  oauth2.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    db.prepare('UPDATE collaborators SET google_tokens_json = ? WHERE id = ?')
      .run(JSON.stringify(merged), collaboratorId);
  });

  return google.calendar({ version: 'v3', auth: oauth2 });
}

/**
 * Create a Google Calendar event from a booking
 */
export async function createEvent(collaboratorId, bookingData, calendarData) {
  const cal = getCalendarClient(collaboratorId);
  if (!cal) return null;

  // Resolve collaborator timezone
  const collabRow = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
  const tz = getCollaboratorTimezone(collaboratorId, collabRow?.companyId);

  // Build start/end with Luxon (timezone-aware, fixes the old UTC mislabel bug)
  const start = DateTime.fromISO(`${bookingData.date}T${bookingData.time}:00`, { zone: tz });
  const end = start.plus({ minutes: bookingData.duration || 30 });
  const startDateTime = start.toFormat("yyyy-MM-dd'T'HH:mm:ss");
  const endDateTime = end.toFormat("yyyy-MM-dd'T'HH:mm:ss");

  const location = calendarData.location || '';
  const isMeet = /google\s*meet|meet/i.test(location);

  const event = {
    summary: `${calendarData.name} — ${bookingData.visitorName}`,
    description: [
      `Visiteur : ${bookingData.visitorName}`,
      bookingData.visitorEmail ? `Email : ${bookingData.visitorEmail}` : '',
      bookingData.visitorPhone ? `Tél : ${bookingData.visitorPhone}` : '',
      bookingData.notes ? `Notes : ${bookingData.notes}` : '',
    ].filter(Boolean).join('\n'),
    start: { dateTime: startDateTime, timeZone: tz },
    end: { dateTime: endDateTime, timeZone: tz },
    location: isMeet ? '' : location,
    ...(isMeet ? {
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    } : {}),
  };

  try {
    const res = await cal.events.insert({
      calendarId: 'primary',
      requestBody: event,
      ...(isMeet ? { conferenceDataVersion: 1 } : {}),
    });
    const meetLink = res.data.hangoutLink || null;
    if (meetLink) console.log(`\x1b[32m[GOOGLE CAL]\x1b[0m Meet link created: ${meetLink}`);
    console.log(`\x1b[32m[GOOGLE CAL]\x1b[0m Event created: ${res.data.id}`);
    return { googleEventId: res.data.id, meetLink };
  } catch (err) {
    console.error('[GOOGLE CAL ERROR] createEvent:', err.message);
    return { googleEventId: null, meetLink: null };
  }
}

/**
 * Update an existing Google Calendar event
 */
export async function updateEvent(collaboratorId, googleEventId, bookingData, calendarData) {
  const cal = getCalendarClient(collaboratorId);
  if (!cal || !googleEventId) return;

  // Resolve collaborator timezone
  const collabRow = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
  const tz = getCollaboratorTimezone(collaboratorId, collabRow?.companyId);

  const start = DateTime.fromISO(`${bookingData.date}T${bookingData.time}:00`, { zone: tz });
  const end = start.plus({ minutes: bookingData.duration || 30 });
  const startDateTime = start.toFormat("yyyy-MM-dd'T'HH:mm:ss");
  const endDateTime = end.toFormat("yyyy-MM-dd'T'HH:mm:ss");

  const isCancelled = bookingData.status === 'cancelled';
  const event = {
    summary: isCancelled
      ? `ANNULÉ — ${calendarData.name} — ${bookingData.visitorName}`
      : `${calendarData.name} — ${bookingData.visitorName}`,
    description: [
      isCancelled ? '⚠️ CE RDV A ÉTÉ ANNULÉ' : '',
      `Visiteur : ${bookingData.visitorName}`,
      bookingData.visitorEmail ? `Email : ${bookingData.visitorEmail}` : '',
      bookingData.visitorPhone ? `Tél : ${bookingData.visitorPhone}` : '',
    ].filter(Boolean).join('\n'),
    start: { dateTime: startDateTime, timeZone: tz },
    end: { dateTime: endDateTime, timeZone: tz },
    location: calendarData.location || '',
    ...(isCancelled ? { colorId: '11' } : {}),
  };

  try {
    await cal.events.update({ calendarId: 'primary', eventId: googleEventId, requestBody: event });
    console.log(`\x1b[32m[GOOGLE CAL]\x1b[0m Event updated: ${googleEventId}`);
  } catch (err) {
    console.error('[GOOGLE CAL ERROR] updateEvent:', err.message);
  }
}

/**
 * Delete a Google Calendar event
 */
export async function deleteEvent(collaboratorId, googleEventId) {
  const cal = getCalendarClient(collaboratorId);
  if (!cal || !googleEventId) return;

  try {
    await cal.events.delete({ calendarId: 'primary', eventId: googleEventId });
    console.log(`\x1b[32m[GOOGLE CAL]\x1b[0m Event deleted: ${googleEventId}`);
  } catch (err) {
    console.error('[GOOGLE CAL ERROR] deleteEvent:', err.message);
  }
}

/**
 * Check if a collaborator has Google Calendar connected
 */
export function isConnected(collaboratorId) {
  const row = db.prepare('SELECT google_tokens_json FROM collaborators WHERE id = ?').get(collaboratorId);
  return !!(row?.google_tokens_json);
}

/**
 * Disconnect Google Calendar for a collaborator (cleans up cached events too)
 */
export function disconnectGoogle(collaboratorId) {
  db.prepare('UPDATE collaborators SET google_tokens_json = NULL, google_email = NULL, google_last_sync = NULL WHERE id = ?').run(collaboratorId);
  db.prepare('DELETE FROM google_events WHERE collaboratorId = ?').run(collaboratorId);
}

/**
 * Get the Google email for a collaborator
 */
export function getGoogleEmail(collaboratorId) {
  const row = db.prepare('SELECT google_email FROM collaborators WHERE id = ?').get(collaboratorId);
  return row?.google_email || null;
}

/**
 * Sync events FROM Google Calendar into the local google_events cache.
 * Fetches events for the next 60 days, stores busy ones, removes stale entries.
 */
export async function syncEventsFromGoogle(collaboratorId) {
  const cal = getCalendarClient(collaboratorId);
  if (!cal) return { synced: 0, errors: ['Not connected'] };

  const collabRow = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
  const tz = getCollaboratorTimezone(collaboratorId, collabRow?.companyId);

  const now = DateTime.now().setZone(tz);
  const timeMin = now.toISO();
  const timeMax = now.plus({ days: 60 }).toISO();

  try {
    const res = await cal.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
    });

    const events = res.data.items || [];
    const validIds = new Set();
    let synced = 0;
    const errors = [];

    const upsert = db.prepare(
      `INSERT OR REPLACE INTO google_events (id, collaboratorId, summary, startTime, endTime, allDay, status, transparency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const event of events) {
      try {
        if (event.status === 'cancelled') continue;
        if (event.transparency === 'transparent') continue;

        const isAllDay = !!event.start?.date;
        let startTime, endTime;

        if (isAllDay) {
          startTime = DateTime.fromISO(event.start.date, { zone: tz }).startOf('day').toISO();
          endTime = DateTime.fromISO(event.end.date, { zone: tz }).startOf('day').toISO();
        } else {
          startTime = DateTime.fromISO(event.start.dateTime, { zone: event.start.timeZone || tz }).setZone(tz).toISO();
          endTime = DateTime.fromISO(event.end.dateTime, { zone: event.end.timeZone || tz }).setZone(tz).toISO();
        }

        upsert.run(
          event.id, collaboratorId, event.summary || '',
          startTime, endTime, isAllDay ? 1 : 0,
          event.status || 'confirmed', event.transparency || 'opaque'
        );
        validIds.add(event.id);
        synced++;
      } catch (err) {
        errors.push(`Event ${event.id}: ${err.message}`);
      }
    }

    // Remove stale events no longer on Google
    const dbEvents = db.prepare('SELECT id FROM google_events WHERE collaboratorId = ?').all(collaboratorId);
    const deleteStmt = db.prepare('DELETE FROM google_events WHERE id = ?');
    for (const dbEvent of dbEvents) {
      if (!validIds.has(dbEvent.id)) {
        deleteStmt.run(dbEvent.id);
      }
    }

    // Update last sync timestamp
    db.prepare('UPDATE collaborators SET google_last_sync = ? WHERE id = ?')
      .run(new Date().toISOString(), collaboratorId);

    console.log(`\x1b[32m[GOOGLE SYNC]\x1b[0m ${synced} events fetched from Google for ${collaboratorId}`);
    return { synced, errors };
  } catch (err) {
    console.error('[GOOGLE SYNC ERROR] syncEventsFromGoogle:', err.message);
    return { synced: 0, errors: [err.message] };
  }
}
