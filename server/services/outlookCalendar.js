/**
 * Outlook Calendar Service (Phase 1 — read-only OAuth + events test)
 * Miroir de googleCalendar.js, basé sur @azure/msal-node + Microsoft Graph fetch.
 *
 * Phase 1 livrée :
 *   - getAuthUrl(collaboratorId)
 *   - handleCallback(code, collaboratorId)
 *   - isConnected(collaboratorId)
 *   - disconnectOutlook(collaboratorId)
 *   - getOutlookEmail(collaboratorId)
 *   - listUpcomingEventsTest(collaboratorId, days=7)  // non persisté
 *
 * Phase 2+ (NON livrées ici) : createEvent / updateEvent / deleteEvent / syncEventsFromOutlook.
 */

import { ConfidentialClientApplication } from '@azure/msal-node';
import { db } from '../db/database.js';

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
