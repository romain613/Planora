// Phase S2.5 — Cron rétention snapshots (quotidien, 03:15 UTC).
//
// Applique la politique :
//   - keep 20 derniers
//   - keep 1 par heure sur 24h
//   - keep 1 par jour sur 7j
//   - tout le reste purgé (fichier + row)
//
// Self-registering au démarrage backend.

import cron from 'node-cron';
import { runRetention } from '../services/collabSnapshots/retention.js';

// Every day at 03:15 UTC (creux VPS, après les backups nightly).
cron.schedule('15 3 * * *', () => {
  try {
    const report = runRetention();
    const totalDeleted = report.reduce((s, r) => s + r.deleted, 0);
    const totalFreed = report.reduce((s, r) => s + r.freedBytes, 0);
    console.log(
      `[SNAPSHOT RETENTION] daily run done collabs=${report.length} deleted=${totalDeleted} freed=${totalFreed}b`
    );
  } catch (err) {
    console.error('[SNAPSHOT RETENTION] top-level error:', err.message);
  }
});

console.log('[SNAPSHOT RETENTION] cron scheduled (daily 03:15 UTC)');
