// Phase S2.5 — Cron auto snapshot collab toutes les 5 min.
//
// Itère les collabs avec dirtySinceSnapshotAt IS NOT NULL, compare fingerprint
// au dernier snapshot, écrit si changement, skip si identique, reset flag.
//
// Self-registering au démarrage backend : `import './cron/collabSnapshots.js'` suffit.

import cron from 'node-cron';
import { runSnapshotTick } from '../services/collabSnapshots/runSnapshotTick.js';

// Every 5 minutes.
cron.schedule('*/5 * * * *', () => {
  try {
    runSnapshotTick({ kind: 'auto', createdBy: 'cron' });
  } catch (err) {
    // Defense-in-depth : runSnapshotTick catche déjà par collab,
    // cet outer catch protège contre une erreur de type query-select initial.
    console.error('[SNAPSHOT TICK] top-level error:', err.message);
  }
});

console.log('[SNAPSHOT TICK] cron scheduled (every 5 min)');
