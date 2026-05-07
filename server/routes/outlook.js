/**
 * Outlook routes (Phase 1 — read-only OAuth + events test)
 * Miroir de routes/google.js. Mount: /api/outlook (alias public callback /auth/outlook/callback in index.js)
 */
import { Router } from 'express';
import {
  getAuthUrl,
  handleCallback,
  isConnected,
  disconnectOutlook,
  getOutlookEmail,
  getOutlookLastSync,
  listUpcomingEventsTest,
  syncEventsFromOutlook,
  // V3.x.11 — consent status + signed state helpers
  setConsentStatus,
  getConsentInfo,
  verifyState,
} from '../services/outlookCalendar.js';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Same ownership check as Google: self OR admin of same company OR supra
function checkOwnership(req, collaboratorId) {
  if (req.auth.isSupra) return true;
  if (collaboratorId === req.auth.collaboratorId) return true;
  if (req.auth.role !== 'admin') return false;
  const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
  return !!(collab && collab.companyId === req.auth.companyId);
}

// GET /api/outlook/auth-url?collaboratorId=xxx
router.get('/auth-url', requireAuth, async (req, res) => {
  try {
    const { collaboratorId } = req.query;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    if (!checkOwnership(req, collaboratorId)) return res.status(403).json({ error: 'Accès interdit' });
    const url = await getAuthUrl(collaboratorId);
    console.log('[OUTLOOK AUTH URL] collaboratorId=' + collaboratorId);
    res.json({ url });
  } catch (err) {
    console.error('[OUTLOOK AUTH-URL ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/outlook/callback — OAuth callback (PUBLIC, no auth).
// Aliased from /auth/outlook/callback (configured in index.js).
//
// V3.x.11 — state is now HMAC-signed (anti-CSRF/replay).
// Backward-compat: legacy raw collaboratorId state accepted until 2026-05-14.
//
// Handles 3 distinct Microsoft return cases :
//   A. OAuth standard       : ?code=xxx&state=signed                (final tokens stored)
//   B. Admin consent grant  : ?admin_consent=True&tenant=xxx&state=signed (NO code — user must restart OAuth)
//   C. Microsoft error      : ?error=xxx&error_description=xxx&state=signed
router.get('/callback', async (req, res) => {
  // Log query keys (no values — anti token-leak)
  const _qkeys = Object.keys(req.query || {}).join(',');
  console.log('[OUTLOOK CALLBACK] query keys=' + _qkeys);

  const { code, state, admin_consent, tenant, error, error_description } = req.query;

  // V3.x.11 — verify signed state (HMAC, TTL 30 min, legacy backward-compat 1 week)
  const _stateInfo = verifyState(state);
  if (!_stateInfo) {
    console.error('[OUTLOOK CALLBACK ERROR] invalid or expired state');
    return res.redirect('/?outlook=error&detail=' + encodeURIComponent('Session OAuth expirée. Recliquez sur Connecter Outlook.'));
  }
  const collaboratorId = _stateInfo.collaboratorId;
  if (_stateInfo.legacy) {
    console.warn('[OUTLOOK CALLBACK] legacy state accepted (backward-compat V3.x.10) collab=' + collaboratorId);
  }

  // ── Case C — Microsoft returned an explicit error ──
  if (error) {
    const _detail = String(error_description || error).slice(0, 200);
    console.error('[OUTLOOK CALLBACK ERROR] ' + error + ' — ' + _detail);
    setConsentStatus(collaboratorId, 'error', `${error}: ${_detail}`);
    return res.redirect('/?outlook=error&detail=' + encodeURIComponent(_detail));
  }

  // ── Case B — Admin consent granted (no OAuth code, just tenant-level approval) ──
  // Microsoft does NOT issue an OAuth code on this flow. The user must restart "Connecter Outlook"
  // for a real OAuth code+token exchange to happen.
  if (String(admin_consent).toLowerCase() === 'true') {
    const _tenant = String(tenant || '').slice(0, 80);
    console.log('[OUTLOOK ADMIN CONSENT] granted tenant=' + _tenant + ' state=' + collaboratorId);
    setConsentStatus(collaboratorId, 'admin_consent_granted', '');
    return res.redirect('/?outlook=admin-consent-granted');
  }

  // ── Case A — OAuth standard (code + state) ──
  try {
    if (!code) {
      console.error('[OUTLOOK CALLBACK ERROR] missing code (keys=' + _qkeys + ')');
      setConsentStatus(collaboratorId, 'error', 'missing_code');
      return res.redirect('/?outlook=error&detail=' + encodeURIComponent('Paramètres OAuth manquants'));
    }
    await handleCallback(code, collaboratorId);  // → setConsentStatus(connected) inside
    console.log('[OUTLOOK CALLBACK] tokens stored for state=' + collaboratorId);
    res.redirect('/?outlook=success');
  } catch (err) {
    const _msg = String(err?.message || 'unknown').slice(0, 200);
    console.error('[OUTLOOK CALLBACK ERROR] ' + _msg);
    setConsentStatus(collaboratorId, 'error', _msg);
    res.redirect('/?outlook=error&detail=' + encodeURIComponent(_msg));
  }
});

// GET /api/outlook/status?collaboratorId=xxx
// V3.x.11 — enriched with consent status (pending_admin_consent / admin_consent_granted / connected / error)
router.get('/status', requireAuth, (req, res) => {
  try {
    const { collaboratorId } = req.query;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    if (!checkOwnership(req, collaboratorId)) return res.status(403).json({ error: 'Accès interdit' });
    const _consent = getConsentInfo(collaboratorId);
    res.json({
      connected: isConnected(collaboratorId),
      email: getOutlookEmail(collaboratorId),
      lastSync: getOutlookLastSync(collaboratorId),
      consentStatus: _consent.status,
      consentUpdatedAt: _consent.updatedAt,
      consentError: _consent.error,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/outlook/disconnect — body { collaboratorId }
router.post('/disconnect', requireAuth, (req, res) => {
  try {
    const { collaboratorId } = req.body;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    if (!checkOwnership(req, collaboratorId)) return res.status(403).json({ error: 'Accès interdit' });
    disconnectOutlook(collaboratorId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/outlook/sync — body { collaboratorId }
// Phase 2A — Pull 60 days of Outlook events into outlook_events cache (NO push booking).
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const { collaboratorId } = req.body;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    if (!checkOwnership(req, collaboratorId)) return res.status(403).json({ error: 'Accès interdit' });
    if (!isConnected(collaboratorId)) return res.status(400).json({ error: 'Outlook not connected' });

    const result = await syncEventsFromOutlook(collaboratorId);
    if (result.errors && result.errors.length && result.synced === 0) {
      return res.status(500).json({ success: false, synced: 0, errors: result.errors });
    }
    res.json({ success: true, synced: result.synced, errors: result.errors || [] });
  } catch (err) {
    console.error('[OUTLOOK SYNC ROUTE ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/outlook/events/test?collaboratorId=xxx&days=7
// Phase 1 endpoint — reads upcoming events via Graph, NOT persisted.
router.get('/events/test', requireAuth, async (req, res) => {
  try {
    const { collaboratorId } = req.query;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    if (!checkOwnership(req, collaboratorId)) return res.status(403).json({ error: 'Accès interdit' });
    const days = Math.max(1, Math.min(30, parseInt(req.query.days, 10) || 7));
    const result = await listUpcomingEventsTest(collaboratorId, days);
    res.json(result);
  } catch (err) {
    console.error('[OUTLOOK EVENTS TEST ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
