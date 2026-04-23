// server/cron/transcriptArchive.js
// ─────────────────────────────────────────────────────────────────
// 🦅 PLAN FAUCON — Phase 1, Chantier 1.2
// Auto-archive cron : nourrit call_transcript_archive sans intervention humaine.
//
// Scan toutes les 5 minutes :
//   - call_logs completed, duration >= 20s
//   - ayant au moins un call_transcripts (live ou audio)
//   - pas encore dans call_transcript_archive
// → appelle archiveCallTranscript(id) pour chacun.
//
// Logs :
//   [CRON ARCHIVE] tick: found N eligible → X archived, Y skipped (reason), Z failed
//
// Objectif M1 : 500 conversations archivées sans clic humain.
// ─────────────────────────────────────────────────────────────────

import cron from 'node-cron';
import { archiveCallTranscript, findCallLogsEligibleForArchive } from '../services/transcriptArchive.js';

const BATCH_SIZE = 100;
const TICK = '*/5 * * * *'; // toutes les 5 min

cron.schedule(TICK, () => {
  try {
    processBatch();
  } catch (err) {
    console.error('[CRON ARCHIVE ERROR]', err.message);
  }
});

console.log('\x1b[35m[CRON]\x1b[0m Transcript auto-archive scheduler started (every 5 min)');

// ─── Premier tick différé de 45s après démarrage ───
// Évite de se marcher sur les pieds avec les autres crons qui bootent en même temps.
setTimeout(() => {
  try { processBatch(); }
  catch (err) { console.error('[CRON ARCHIVE INITIAL ERROR]', err.message); }
}, 45_000);

function processBatch() {
  const eligible = findCallLogsEligibleForArchive(BATCH_SIZE);
  if (eligible.length === 0) return; // pas de bruit dans les logs

  let archived = 0;
  let reused = 0;
  const skipped = {};
  let failed = 0;

  for (const row of eligible) {
    try {
      const result = archiveCallTranscript(row.id, { force: false });
      if (result.ok) {
        if (result.reused) reused++;
        else archived++;
      } else {
        skipped[result.reason] = (skipped[result.reason] || 0) + 1;
      }
    } catch (err) {
      failed++;
      console.error(`[CRON ARCHIVE] failed for ${row.id}:`, err.message);
    }
  }

  const parts = [
    `found ${eligible.length}`,
    `archived ${archived}`,
  ];
  if (reused > 0) parts.push(`reused ${reused}`);
  if (Object.keys(skipped).length > 0) {
    parts.push('skipped ' + Object.entries(skipped).map(([r, n]) => `${r}:${n}`).join(','));
  }
  if (failed > 0) parts.push(`failed ${failed}`);

  // Log seulement si au moins un archive ou un échec — sinon silence
  if (archived > 0 || failed > 0) {
    console.log(`\x1b[35m[CRON ARCHIVE]\x1b[0m ${parts.join(' · ')}`);
  }
}
