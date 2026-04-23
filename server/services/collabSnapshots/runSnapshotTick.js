// Phase S2.3 — Tick snapshot : itère les collabs dirty, vérifie le fingerprint,
// écrit un nouveau snapshot si l'état a réellement changé, reset dirty flag.
//
// Appelé par le cron (every 5 min) et par test-tick.js (manuel).
// Isolé comme fonction pure pour être testable et logguable.

import { db } from '../../db/database.js';
import { buildCollabSnapshot } from './buildCollabSnapshot.js';
import { computeCollabFingerprint } from './fingerprint.js';
import { writeSnapshot, getLastSnapshot } from './writeSnapshot.js';

const TICK_LOG_PREFIX = '[SNAPSHOT TICK]';

/**
 * Exécute un tick complet. Retourne un résumé par collab traité.
 * @param {{ kind?: 'auto'|'manual', createdBy?: string }} opts
 * @returns {Array<{ collabId, companyId, result: 'snapshot-written'|'skipped-unchanged'|'error', snapshotId?, bytes?, elapsed, error? }>}
 */
export function runSnapshotTick(opts = {}) {
  const kind = opts.kind || 'auto';
  const createdBy = opts.createdBy || 'cron';
  const tickStart = Date.now();

  const dirtyCollabs = db
    .prepare(
      'SELECT id, companyId, dirtySinceSnapshotAt FROM collaborators ' +
        'WHERE dirtySinceSnapshotAt IS NOT NULL'
    )
    .all();

  const results = [];

  for (const { id: collabId, companyId, dirtySinceSnapshotAt } of dirtyCollabs) {
    const t0 = Date.now();
    try {
      const fp = computeCollabFingerprint({ companyId, collabId });
      const last = getLastSnapshot({ companyId, collabId });

      if (last && last.fingerprint === fp) {
        // État identique au dernier snapshot → pas de flash inutile, reset flag.
        db.prepare('UPDATE collaborators SET dirtySinceSnapshotAt = NULL WHERE id = ?').run(
          collabId
        );
        const elapsed = Date.now() - t0;
        results.push({
          collabId,
          companyId,
          result: 'skipped-unchanged',
          elapsed,
        });
        console.log(
          `${TICK_LOG_PREFIX} collab=${collabId} skipped-unchanged fp=${fp.slice(0, 8)} elapsed=${elapsed}ms`
        );
        continue;
      }

      const payload = buildCollabSnapshot({ companyId, collabId });
      const write = writeSnapshot({
        payload,
        fingerprint: fp,
        kind,
        trigger: 'dirty-detected',
        createdBy,
      });

      // Reset dirty flag APRÈS écriture réussie (atomicité côté logique)
      db.prepare('UPDATE collaborators SET dirtySinceSnapshotAt = NULL WHERE id = ?').run(
        collabId
      );

      const elapsed = Date.now() - t0;
      results.push({
        collabId,
        companyId,
        result: 'snapshot-written',
        snapshotId: write.id,
        bytes: write.payloadSizeBytes,
        rowCount: payload.meta.totalRows,
        elapsed,
      });
      console.log(
        `${TICK_LOG_PREFIX} collab=${collabId} snapshot-written id=${write.id} bytes=${write.payloadSizeBytes} rows=${payload.meta.totalRows} elapsed=${elapsed}ms`
      );
    } catch (err) {
      const elapsed = Date.now() - t0;
      results.push({
        collabId,
        companyId,
        result: 'error',
        error: err.message,
        elapsed,
      });
      console.error(
        `${TICK_LOG_PREFIX} collab=${collabId} ERROR ${err.message} elapsed=${elapsed}ms`
      );
      // On NE reset PAS le flag en cas d'erreur — le prochain tick retentera.
    }
  }

  const tickElapsed = Date.now() - tickStart;
  console.log(
    `${TICK_LOG_PREFIX} done collabs=${dirtyCollabs.length} elapsed=${tickElapsed}ms`
  );

  return results;
}
