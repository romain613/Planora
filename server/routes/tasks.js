import { Router } from 'express';
import { listTasks, completeTask, createFollowUpTask } from '../services/googleTasks.js';
import { isConnected } from '../services/googleCalendar.js';
import { db } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// GET /api/tasks?collaboratorId=xxx — List tasks from Calendar360 task list
router.get('/', requireAuth, enforceCompany, async (req, res) => {
  try {
    const { collaboratorId } = req.query;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    // SECURITY: verify collaborator belongs to user's company
    const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
    if (!collab) return res.status(404).json({ error: 'Collaborateur non trouvé' });
    if (!req.auth.isSupra && collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    if (!isConnected(collaboratorId)) return res.json({ connected: false, tasks: [] });

    const tasks = await listTasks(collaboratorId);
    res.json({ connected: true, tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/complete — Complete a task
router.post('/complete', requireAuth, enforceCompany, async (req, res) => {
  try {
    const { collaboratorId, taskId } = req.body;
    if (!collaboratorId || !taskId) return res.status(400).json({ error: 'collaboratorId and taskId required' });
    // SECURITY: verify collaborator belongs to user's company
    const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
    if (!req.auth.isSupra && collab?.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });

    const success = await completeTask(collaboratorId, taskId);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/create — Manually create a follow-up task
router.post('/create', requireAuth, enforceCompany, async (req, res) => {
  try {
    const { collaboratorId, bookingId } = req.body;
    if (!collaboratorId || !bookingId) return res.status(400).json({ error: 'collaboratorId and bookingId required' });
    // SECURITY: verify collaborator belongs to user's company
    const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
    if (!req.auth.isSupra && collab?.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    if (!isConnected(collaboratorId)) return res.status(400).json({ error: 'Google not connected' });

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const cal = db.prepare('SELECT name FROM calendars WHERE id = ?').get(booking.calendarId);
    const taskId = await createFollowUpTask(collaboratorId, booking, cal?.name || 'RDV');
    res.json({ success: !!taskId, taskId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
