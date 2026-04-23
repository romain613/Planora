import { Router } from 'express';
import { db } from '../db/database.js';

const router = Router();

router.get('/health', (req, res) => {
  try {
    // Test DB accessible
    db.prepare('SELECT 1').get();

    // Counts
    const companies = db.prepare('SELECT COUNT(*) as c FROM companies').get().c;
    const collaborateurs = db.prepare('SELECT COUNT(*) as c FROM collaborators').get().c;

    res.json({
      status: 'ok',
      db: 'connected',
      companies,
      collaborateurs,
      dbPath: process.env.DB_PATH || '(fallback)',
      uptime: Math.round(process.uptime()),
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      db: 'disconnected',
      error: err.message,
      dbPath: process.env.DB_PATH || '(fallback)',
      uptime: Math.round(process.uptime()),
    });
  }
});

export default router;
