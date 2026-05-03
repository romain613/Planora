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
    res.json({ url });
  } catch (err) {
    console.error('[OUTLOOK AUTH-URL ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/outlook/callback?code=xxx&state=collabId — OAuth callback (PUBLIC, no auth)
// Aliased from /auth/outlook/callback (configured in index.js)
router.get('/callback', async (req, res) => {
  try {
    const { code, state: collaboratorId } = req.query;
    if (!code || !collaboratorId) return res.status(400).send('Missing code or state');
    await handleCallback(code, collaboratorId);
    res.redirect('/?outlook=success');
  } catch (err) {
    console.error('[OUTLOOK CALLBACK ERROR]', err.message);
    res.redirect('/?outlook=error');
  }
});

// GET /api/outlook/status?collaboratorId=xxx
router.get('/status', requireAuth, (req, res) => {
  try {
    const { collaboratorId } = req.query;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    if (!checkOwnership(req, collaboratorId)) return res.status(403).json({ error: 'Accès interdit' });
    res.json({
      connected: isConnected(collaboratorId),
      email: getOutlookEmail(collaboratorId),
      lastSync: getOutlookLastSync(collaboratorId),
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
