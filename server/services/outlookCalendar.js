/**
 * Outlook Calendar Service
 * Miroir de googleCalendar.js, basé sur @azure/msal-node + Microsoft Graph fetch.
 *
 * Phase 1 (OAuth + read-only) :
 *   - getAuthUrl, handleCallback, isConnected, disconnectOutlook,
 *     getOutlookEmail, getOutlookLastSync, listUpcomingEventsTest
 *
 * Phase 2A (sync events 60j → outlook_events) :
 *   - syncEventsFromOutlook(collaboratorId)
 *
 * Phase 2B+ (livré V3.x.5) : intégration outlook_events dans checkBookingConflict + generateSlots.
 *
 * Phase 4.a (write — push booking Planora → Outlook event) :
 *   - createEventOutlook(collaboratorId, bookingData, calendarData)
 *
 * Phase 4.b (write — sync UPDATE booking → Outlook event) :
 *   - updateEventOutlook(collaboratorId, outlookEventId, bookingData, calendarData)
 *
 * Phase 4.c (write — true delete event Outlook) :
 *   - deleteEventOutlook(collaboratorId, outlookEventId)
 */

import { ConfidentialClientApplication } from '@azure/msal-node';
import { db, getCollaboratorTimezone } from '../db/database.js';
import { DateTime } from 'luxon';

const SCOPES = [
  'User.Read',
  'Calendars.ReadWrite',
  'Calendars.ReadWrite.Shared',
  'offline_access',
];

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

function getRequiredEnv() {
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI;
  const tenant = process.env.OUTLOOK_TENANT || 'common';
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Outlook OAuth env not configured (OUTLOOK_CLIENT_ID / OUTLOOK_CLIENT_SECRET / OUTLOOK_REDIRECT_URI required)');
  }
  return { clientId, clientSecret, redirectUri, tenant };
}

function createMsalClient(tokenCacheJson = null) {
  const { clientId, clientSecret, tenant } = getRequiredEnv();
  const app = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenant}`,
    },
    system: {
      loggerOptions: {
        // PII never logged — guards against token leakage in stdout
        piiLoggingEnabled: false,
        logLevel: 0,
      },
    },
  });
  if (tokenCacheJson) {
    try { app.getTokenCache().deserialize(tokenCacheJson); } catch {}
  }
  return app;
}

/**
 * Generate Outlook OAuth authorization URL (consent flow)
 */
export async function getAuthUrl(collaboratorId) {
  const { redirectUri } = getRequiredEnv();
  const app = createMsalClient();
  return app.getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri,
    state: collaboratorId,
    prompt: 'consent',
  });
}

/**
 * Exchange authorization code for tokens, persist cache + account id, fetch email
 */
export async function handleCallback(code, collaboratorId) {
  const { redirectUri } = getRequiredEnv();
  const app = createMsalClient();
  const result = await app.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri,
  });

  const accountId = result?.account?.homeAccountId || null;
  const email = result?.account?.username || null;
  const cacheJson = app.getTokenCache().serialize();

  db.prepare(
    'UPDATE collaborators SET outlook_tokens_json = ?, outlook_email = ?, outlook_account_id = ? WHERE id = ?'
  ).run(cacheJson, email, accountId, collaboratorId);

  return { email, accountId };
}

/**
 * Acquire a fresh access token via MSAL silent flow (auto refresh).
 * Persists the updated cache when MSAL refreshed something.
 * Returns null if not connected or refresh failed.
 */
async function getAccessToken(collaboratorId) {
  const row = db.prepare(
    'SELECT outlook_tokens_json, outlook_account_id FROM collaborators WHERE id = ?'
  ).get(collaboratorId);
  if (!row?.outlook_tokens_json || !row?.outlook_account_id) return null;

  const app = createMsalClient(row.outlook_tokens_json);

  let account = null;
  try {
    account = await app.getTokenCache().getAccountByHomeId(row.outlook_account_id);
  } catch {
    return null;
  }
  if (!account) return null;

  let result;
  try {
    result = await app.acquireTokenSilent({ scopes: SCOPES, account });
  } catch (err) {
    // InteractionRequired / refresh expired → user must re-consent
    console.error('[OUTLOOK] acquireTokenSilent failed:', err.errorCode || err.message || 'unknown');
    return null;
  }

  // Persist refreshed cache if changed
  try {
    const newCache = app.getTokenCache().serialize();
    if (newCache && newCache !== row.outlook_tokens_json) {
      db.prepare('UPDATE collaborators SET outlook_tokens_json = ? WHERE id = ?')
        .run(newCache, collaboratorId);
    }
  } catch {}

  return result?.accessToken || null;
}

/**
 * Microsoft Graph helper: GET request with bearer token.
 */
async function graphGet(accessToken, path) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      Prefer: 'outlook.timezone="UTC"',
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Graph GET ${path} → ${res.status} ${res.statusText} ${txt.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Check if a collaborator has Outlook connected (tokens present).
 * Note: presence of tokens != access still valid. listUpcomingEventsTest will reveal
 * a true health check by doing a real Graph call.
 */
export function isConnected(collaboratorId) {
  const row = db.prepare(
    'SELECT outlook_tokens_json, outlook_account_id FROM collaborators WHERE id = ?'
  ).get(collaboratorId);
  return !!(row?.outlook_tokens_json && row?.outlook_account_id);
}

/**
 * Disconnect Outlook for a collaborator (clears tokens + cached events).
 */
export function disconnectOutlook(collaboratorId) {
  db.prepare(
    'UPDATE collaborators SET outlook_tokens_json = NULL, outlook_email = NULL, outlook_last_sync = NULL, outlook_account_id = NULL WHERE id = ?'
  ).run(collaboratorId);
  db.prepare('DELETE FROM outlook_events WHERE collaboratorId = ?').run(collaboratorId);
}

/**
 * Get the Outlook email for a collaborator
 */
export function getOutlookEmail(collaboratorId) {
  const row = db.prepare('SELECT outlook_email FROM collaborators WHERE id = ?').get(collaboratorId);
  return row?.outlook_email || null;
}

/**
 * Get last sync timestamp (Phase 2+ — null in Phase 1 since no persisted sync yet)
 */
export function getOutlookLastSync(collaboratorId) {
  const row = db.prepare('SELECT outlook_last_sync FROM collaborators WHERE id = ?').get(collaboratorId);
  return row?.outlook_last_sync || null;
}

/**
 * List upcoming events for the next N days via Microsoft Graph calendarView.
 * Phase 1 ENDPOINT — non persisté, debug only.
 * Returns sanitized items (no attendees PII, no body) suitable for status JSON response.
 */
export async function listUpcomingEventsTest(collaboratorId, days = 7) {
  const accessToken = await getAccessToken(collaboratorId);
  if (!accessToken) {
    return { ok: false, error: 'Not connected or token refresh failed', events: [] };
  }

  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const startISO = now.toISOString();
  const endISO = end.toISOString();

  // calendarView expands recurring; orderby start; max 50 to stay light
  const path = `/me/calendarView?startDateTime=${encodeURIComponent(startISO)}&endDateTime=${encodeURIComponent(endISO)}&$orderby=start/dateTime&$top=50&$select=id,subject,start,end,isAllDay,showAs,isCancelled`;

  try {
    const data = await graphGet(accessToken, path);
    const items = Array.isArray(data?.value) ? data.value : [];
    const events = items.map(ev => ({
      id: ev.id,
      subject: ev.subject || '',
      start: ev.start?.dateTime || null,
      end: ev.end?.dateTime || null,
      timeZone: ev.start?.timeZone || 'UTC',
      isAllDay: !!ev.isAllDay,
      showAs: ev.showAs || null,
      isCancelled: !!ev.isCancelled,
    }));
    return { ok: true, count: events.length, days, events };
  } catch (err) {
    console.error('[OUTLOOK] listUpcomingEventsTest:', err.message);
    return { ok: false, error: err.message, events: [] };
  }
}

/**
 * Sync events FROM Outlook into the local outlook_events cache (Phase 2A).
 * Mirror of syncEventsFromGoogle — pulls 60 days of upcoming events, stores busy ones,
 * removes stale entries.
 *
 * Skip rules at sync time (mirror Google + MH decisions):
 *   - isCancelled=true       → skip (do not persist)
 *   - showAs='free'          → skip (Q2 — equivalent to Google transparency='transparent')
 *   - showAs='tentative'     → STORE (Q1 — blocks slots in Phase 2B)
 *   - showAs='busy'/'oof'/'workingElsewhere' → STORE
 *   - allDay (any showAs except 'free') → STORE with 24h span (Q3 — blocks the day)
 */
export async function syncEventsFromOutlook(collaboratorId) {
  const accessToken = await getAccessToken(collaboratorId);
  if (!accessToken) {
    return { synced: 0, errors: ['Not connected or token refresh failed'] };
  }

  const collabRow = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
  const tz = getCollaboratorTimezone(collaboratorId, collabRow?.companyId);

  const now = DateTime.now().setZone(tz);
  const startISO = now.toUTC().toISO();
  const endISO = now.plus({ days: 60 }).toUTC().toISO();

  const validIds = new Set();
  let synced = 0;
  const errors = [];

  const upsert = db.prepare(
    `INSERT OR REPLACE INTO outlook_events (id, collaboratorId, summary, startTime, endTime, allDay, status, showAs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  try {
    // Initial Graph URL — Prefer UTC so dateTime is unambiguous, then convert to collab tz for storage
    // Note: 'status' removed from $select — not a top-level property on Microsoft.OutlookServices.Event.
    // We rely on isCancelled (filtered above) + showAs for busy/free state.
    let nextUrl = `/me/calendarView?startDateTime=${encodeURIComponent(startISO)}&endDateTime=${encodeURIComponent(endISO)}&$orderby=start/dateTime&$top=500&$select=id,subject,start,end,isAllDay,showAs,isCancelled`;

    // Pagination loop (@odata.nextLink) — bounded to 10 pages safety cap
    let pageGuard = 0;
    while (nextUrl && pageGuard < 10) {
      pageGuard++;

      let data;
      try {
        // graphGet expects path starting with /, but @odata.nextLink is a full URL.
        // Detect and call appropriately.
        if (nextUrl.startsWith('http')) {
          const res = await fetch(nextUrl, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
              Prefer: 'outlook.timezone="UTC"',
            },
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`Graph nextLink → ${res.status} ${res.statusText} ${txt.slice(0, 200)}`);
          }
          data = await res.json();
        } else {
          data = await graphGet(accessToken, nextUrl);
        }
      } catch (pageErr) {
        errors.push(`Page ${pageGuard}: ${pageErr.message}`);
        break;
      }

      const items = Array.isArray(data?.value) ? data.value : [];
      for (const event of items) {
        try {
          if (event.isCancelled) continue;
          if (event.showAs === 'free') continue;

          const isAllDay = !!event.isAllDay;
          let startTime, endTime;

          if (isAllDay) {
            // Outlook all-day events come as midnight UTC start, midnight UTC end+1day
            // Normalize to collab tz start-of-day
            startTime = DateTime.fromISO(event.start.dateTime, { zone: 'UTC' }).setZone(tz).startOf('day').toISO();
            endTime = DateTime.fromISO(event.end.dateTime, { zone: 'UTC' }).setZone(tz).startOf('day').toISO();
          } else {
            const startTz = event.start?.timeZone || 'UTC';
            const endTz = event.end?.timeZone || 'UTC';
            startTime = DateTime.fromISO(event.start.dateTime, { zone: startTz }).setZone(tz).toISO();
            endTime = DateTime.fromISO(event.end.dateTime, { zone: endTz }).setZone(tz).toISO();
          }

          if (!startTime || !endTime) continue;

          upsert.run(
            event.id,
            collaboratorId,
            event.subject || '',
            startTime,
            endTime,
            isAllDay ? 1 : 0,
            'confirmed', // status fallback — Graph Event has no top-level status property; isCancelled already filtered above
            event.showAs || 'busy'
          );
          validIds.add(event.id);
          synced++;
        } catch (evErr) {
          errors.push(`Event ${event.id}: ${evErr.message}`);
        }
      }

      nextUrl = data?.['@odata.nextLink'] || null;
    }

    // Remove stale events no longer present in Outlook (or now showAs=free / cancelled)
    const dbEvents = db.prepare('SELECT id FROM outlook_events WHERE collaboratorId = ?').all(collaboratorId);
    const deleteStmt = db.prepare('DELETE FROM outlook_events WHERE id = ?');
    for (const dbEvent of dbEvents) {
      if (!validIds.has(dbEvent.id)) deleteStmt.run(dbEvent.id);
    }

    db.prepare('UPDATE collaborators SET outlook_last_sync = ? WHERE id = ?')
      .run(new Date().toISOString(), collaboratorId);

    console.log(`\x1b[34m[OUTLOOK SYNC]\x1b[0m ${synced} events fetched from Outlook for ${collaboratorId}`);
    return { synced, errors };
  } catch (err) {
    console.error('[OUTLOOK SYNC ERROR] syncEventsFromOutlook:', err.message);
    return { synced: 0, errors: [err.message] };
  }
}

/**
 * Create an Outlook Calendar event from a booking (Phase 4.a — write).
 * Mirror of googleCalendar.createEvent. Uses Calendars.ReadWrite scope (granted Phase 1).
 *
 * Returns { outlookEventId } on success, null on failure.
 * NEVER throws — caller must remain non-blocking on Outlook failure.
 *
 * Skip rules (return null silent):
 *   - Outlook not connected (no access token)
 *   - Token refresh failed
 *   - Graph API error (4xx/5xx)
 */
export async function createEventOutlook(collaboratorId, bookingData, calendarData) {
  const accessToken = await getAccessToken(collaboratorId);
  if (!accessToken) return null;

  const collabRow = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
  const tz = getCollaboratorTimezone(collaboratorId, collabRow?.companyId);

  // Build start/end with Luxon (timezone-aware, mirror Google pattern)
  const start = DateTime.fromISO(`${bookingData.date}T${bookingData.time}:00`, { zone: tz });
  const end = start.plus({ minutes: bookingData.duration || 30 });
  const startDateTime = start.toFormat("yyyy-MM-dd'T'HH:mm:ss");
  const endDateTime = end.toFormat("yyyy-MM-dd'T'HH:mm:ss");

  const body = {
    subject: `${calendarData?.name || 'RDV'} — ${bookingData.visitorName || ''}`,
    body: {
      contentType: 'Text',
      content: [
        `Visiteur : ${bookingData.visitorName || ''}`,
        bookingData.visitorEmail ? `Email : ${bookingData.visitorEmail}` : '',
        bookingData.visitorPhone ? `Tél : ${bookingData.visitorPhone}` : '',
        bookingData.notes ? `Notes : ${bookingData.notes}` : '',
      ].filter(Boolean).join('\n'),
    },
    start: { dateTime: startDateTime, timeZone: tz },
    end: { dateTime: endDateTime, timeZone: tz },
    location: { displayName: calendarData?.location || '' },
    showAs: 'busy', // V3.x.5 cohérence : Planora-pushed events = busy
  };

  try {
    const res = await fetch(`${GRAPH_BASE}/me/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Graph POST /me/events → ${res.status} ${res.statusText} ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    console.log(`\x1b[34m[OUTLOOK CAL]\x1b[0m Event created: ${data.id}`);
    return { outlookEventId: data.id };
  } catch (err) {
    // err.message only — never log full err object (token leak risk)
    console.error('[OUTLOOK CAL ERROR] createEventOutlook:', err.message);
    return null;
  }
}

/**
 * Update an existing Outlook Calendar event from a booking (Phase 4.b — write).
 * Mirror of googleCalendar.updateEvent. Uses Calendars.ReadWrite scope (granted Phase 1).
 *
 * Returns { updated: true } on success, null on failure or skip.
 * NEVER throws — caller must remain non-blocking on Outlook failure.
 *
 * Skip rules (return null silent):
 *   - outlookEventId missing (booking pré-V4.a)
 *   - Outlook not connected (no access token)
 *   - Token refresh failed
 *   - Graph API error (4xx/5xx, e.g. 404 if event deleted user-side)
 *
 * Cancellation:
 *   - bookingData.status === 'cancelled' → subject prefix "ANNULÉ — " + showAs='free'
 *     (libère le slot Outlook user, cohérent V3.x.5 conflicts qui filtre showAs=free)
 */
export async function updateEventOutlook(collaboratorId, outlookEventId, bookingData, calendarData) {
  if (!outlookEventId) return null;
  const accessToken = await getAccessToken(collaboratorId);
  if (!accessToken) return null;

  const collabRow = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
  const tz = getCollaboratorTimezone(collaboratorId, collabRow?.companyId);

  const start = DateTime.fromISO(`${bookingData.date}T${bookingData.time}:00`, { zone: tz });
  const end = start.plus({ minutes: bookingData.duration || 30 });
  const startDateTime = start.toFormat("yyyy-MM-dd'T'HH:mm:ss");
  const endDateTime = end.toFormat("yyyy-MM-dd'T'HH:mm:ss");

  const isCancelled = bookingData.status === 'cancelled';
  const body = {
    subject: isCancelled
      ? `ANNULÉ — ${calendarData?.name || 'RDV'} — ${bookingData.visitorName || ''}`
      : `${calendarData?.name || 'RDV'} — ${bookingData.visitorName || ''}`,
    body: {
      contentType: 'Text',
      content: [
        isCancelled ? '⚠️ CE RDV A ÉTÉ ANNULÉ' : '',
        `Visiteur : ${bookingData.visitorName || ''}`,
        bookingData.visitorEmail ? `Email : ${bookingData.visitorEmail}` : '',
        bookingData.visitorPhone ? `Tél : ${bookingData.visitorPhone}` : '',
        bookingData.notes ? `Notes : ${bookingData.notes}` : '',
      ].filter(Boolean).join('\n'),
    },
    start: { dateTime: startDateTime, timeZone: tz },
    end: { dateTime: endDateTime, timeZone: tz },
    location: { displayName: calendarData?.location || '' },
    showAs: isCancelled ? 'free' : 'busy', // V4.b — cancelled libère le slot (Q2)
  };

  try {
    const res = await fetch(`${GRAPH_BASE}/me/events/${encodeURIComponent(outlookEventId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Graph PATCH /me/events/{id} → ${res.status} ${res.statusText} ${txt.slice(0, 200)}`);
    }
    console.log(`\x1b[34m[OUTLOOK CAL]\x1b[0m Event updated: ${outlookEventId}`);
    return { updated: true };
  } catch (err) {
    // err.message only — never log full err object (token leak risk)
    console.error('[OUTLOOK CAL ERROR] updateEventOutlook:', err.message);
    return null;
  }
}

/**
 * Delete an Outlook Calendar event (Phase 4.c — write).
 * Mirror of googleCalendar.deleteEvent + V4.a/V4.b error handling.
 *
 * Returns { deleted: true } on success, { deleted: true, alreadyGone: true } on 404,
 *         null on skip/failure.
 * NEVER throws — caller must remain non-blocking on Outlook failure.
 *
 * Skip rules (return null silent):
 *   - outlookEventId missing
 *   - Outlook not connected (no access token)
 *   - Token refresh failed
 *
 * Idempotence:
 *   - Graph 404 → treated as success (event already gone user-side or wrong id)
 *   - No retry on 5xx (MH decision V4.c)
 */
export async function deleteEventOutlook(collaboratorId, outlookEventId) {
  if (!outlookEventId) return null;
  const accessToken = await getAccessToken(collaboratorId);
  if (!accessToken) return null;

  try {
    const res = await fetch(`${GRAPH_BASE}/me/events/${encodeURIComponent(outlookEventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404) {
      console.log(`\x1b[34m[OUTLOOK CAL]\x1b[0m Event already gone: ${outlookEventId}`);
      return { deleted: true, alreadyGone: true };
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Graph DELETE /me/events/{id} → ${res.status} ${res.statusText} ${txt.slice(0, 200)}`);
    }
    console.log(`\x1b[34m[OUTLOOK CAL]\x1b[0m Event deleted: ${outlookEventId}`);
    return { deleted: true };
  } catch (err) {
    // err.message only — never log full err object (token leak risk)
    console.error('[OUTLOOK CAL ERROR] deleteEventOutlook:', err.message);
    return null;
  }
}
