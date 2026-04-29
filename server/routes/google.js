import { Router } from 'express';
import { getAuthUrl, handleCallback, isConnected, disconnectGoogle, createEvent, getGoogleEmail, syncEventsFromGoogle } from '../services/googleCalendar.js';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/google/auth-url?collaboratorId=xxx
router.get('/auth-url', requireAuth, (req, res) => {
  try {
    const { collaboratorId } = req.query;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    // Verify ownership: only self or admin of same company
    if (!req.auth.isSupra && collaboratorId !== req.auth.collaboratorId) {
      if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Accès interdit' });
      const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
      if (!collab || collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    }
    const url = getAuthUrl(collaboratorId);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/google/callback?code=xxx&state=collabId — OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state: collaboratorId } = req.query;
    if (!code || !collaboratorId) return res.status(400).send('Missing code or state');
    await handleCallback(code, collaboratorId);
    // Redirect to frontend with success flag
    res.redirect('/?google=success');
  } catch (err) {
    console.error('[GOOGLE CALLBACK ERROR]', err.message);
    res.redirect('/?google=error');
  }
});

// GET /api/google/status?collaboratorId=xxx
router.get('/status', requireAuth, (req, res) => {
  try {
    const { collaboratorId } = req.query;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    // Verify ownership
    if (!req.auth.isSupra && collaboratorId !== req.auth.collaboratorId) {
      if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Accès interdit' });
      const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
      if (!collab || collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    }
    res.json({ connected: isConnected(collaboratorId), email: getGoogleEmail(collaboratorId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google/disconnect
router.post('/disconnect', requireAuth, (req, res) => {
  try {
    const { collaboratorId } = req.body;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    // Verify ownership
    if (!req.auth.isSupra && collaboratorId !== req.auth.collaboratorId) {
      if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Accès interdit' });
      const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
      if (!collab || collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    }
    disconnectGoogle(collaboratorId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google/sync — Push all unsynced bookings to Google Calendar
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const { collaboratorId } = req.body;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    // Verify ownership
    if (!req.auth.isSupra && collaboratorId !== req.auth.collaboratorId) {
      if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Accès interdit' });
      const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
      if (!collab || collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    }
    if (!isConnected(collaboratorId)) return res.status(400).json({ error: 'Google not connected' });

    const bookings = db.prepare(
      `SELECT b.*, c.name as calName, c.location as calLocation
       FROM bookings b JOIN calendars c ON b.calendarId = c.id
       WHERE b.collaboratorId = ? AND b.googleEventId IS NULL AND b.status != 'cancelled'`
    ).all(collaboratorId);

    let synced = 0;
    for (const b of bookings) {
      try {
        const result = await createEvent(collaboratorId, b, { name: b.calName, location: b.calLocation || '' });
        if (result?.googleEventId) {
          db.prepare('UPDATE bookings SET googleEventId = ? WHERE id = ?').run(result.googleEventId, b.id);
          if (result.meetLink) {
            db.prepare('UPDATE bookings SET meetLink = ? WHERE id = ?').run(result.meetLink, b.id);
          }
          synced++;
        }
      } catch (pushErr) {
        console.error(`[GOOGLE PUSH ERROR] booking ${b.id}:`, pushErr.message);
      }
    }

    // Also pull events FROM Google Calendar
    let pulled = 0;
    try {
      const pullResult = await syncEventsFromGoogle(collaboratorId);
      pulled = pullResult.synced;
    } catch (pullErr) {
      console.error('[GOOGLE PULL SYNC ERROR]', pullErr.message);
    }

    console.log(`\x1b[32m[GOOGLE SYNC]\x1b[0m ${synced} bookings pushed, ${pulled} events pulled for collaborator ${collaboratorId}`);
    res.json({ success: true, synced, pulled });
  } catch (err) {
    console.error('[GOOGLE SYNC ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
