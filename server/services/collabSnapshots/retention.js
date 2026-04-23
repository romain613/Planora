// Phase S2.4 — Politique de rétention des snapshots collab.
//
// Règle validée MH (2026-04-21) :
//   - keep 20 derniers (toujours)
//   - keep 1 par heure sur la fenêtre 24h
//   - keep 1 par jour sur la fenêtre 7j
//   - tout le reste = purgé (fichier gzip + row DB)
//
// Exécuté 1x/jour via cron (voir server/cron/collabSnapshotsRetention.js).
// Idempotent : peut tourner plusieurs fois sans dommage.

import { unlinkSync } from 'fs';
import path from 'path';
import { db } from '../../db/database.js';

const SNAPSHOTS_DIR =
  process.env.SNAPSHOTS_DIR || '/var/www/planora-data/snapshots';

const HOUR_MS = 3600 * 1000;
const DAY_MS = 86400 * 1000;
const WINDOW_HOURLY = 24 * HOUR_MS;
const WINDOW_DAILY = 7 * DAY_MS;
const KEEP_LATEST_N = 20;

const LOG_PREFIX = '[SNAPSHOT RETENTION]';

/**
 * Calcule l'ensemble des ids à CONSERVER selon la politique.
 * @param {Array<{id, createdAt}>} snapshots - triés DESC par createdAt
 * @param {number} now
 * @returns {Set<number>}
 */
export function computeKeepSet(snapshots, now = Date.now()) {
  const keep = new Set();
  // 1. 20 plus récents (toujours gardés)
  for (let i = 0; i < Math.min(KEEP_LATEST_N, snapshots.length); i++) {
    keep.add(snapshots[i].id);
  }
  // 2. 1 par heure sur 24h (celui le plus récent de chaque bucket)
  const hourBucket = new Map();
  for (const s of snapshots) {
    if (s.createdAt < now - WINDOW_HOURLY) break;
    const hourKey = Math.floor(s.createdAt / HOUR_MS);
    if (!hourBucket.has(hourKey)) hourBucket.set(hourKey, s.id);
  }
  hourBucket.forEach((id) => keep.add(id));
  // 3. 1 par jour sur 7j
  const dayBucket = new Map();
  for (const s of snapshots) {
    if (s.createdAt < now - WINDOW_DAILY) break;
    const dayKey = Math.floor(s.createdAt / DAY_MS);
    if (!dayBucket.has(dayKey)) dayBucket.set(dayKey, s.id);
  }
  dayBucket.forEach((id) => keep.add(id));
  return keep;
}

/**
 * Exécute la politique de rétention sur tous les collabs ayant des snapshots.
 * @param {{ now?: number, dryRun?: boolean }} opts
 * @returns {Array<{ companyId, collabId, total, kept, deleted, freedBytes }>}
 */
export function runRetention(opts = {}) {
  const now = opts.now ?? Date.now();
  const dryRun = !!opts.dryRun;

  const collabs = db
    .prepare('SELECT DISTINCT companyId, collabId FROM collab_snapshots')
    .all();

  const report = [];

  for (const { companyId, collabId } of collabs) {
    const snapshots = db
      .prepare(
        'SELECT id, createdAt, payloadPath, payloadSizeBytes FROM collab_snapshots ' +
          'WHERE companyId = ? AND collabId = ? ORDER BY createdAt DESC'
      )
      .all(companyId, collabId);

    const keepIds = computeKeepSet(snapshots, now);
    const toDelete = snapshots.filter((s) => !keepIds.has(s.id));

    let freedBytes = 0;
    for (const s of toDelete) {
      freedBytes += s.payloadSizeBytes || 0;
      if (!dryRun) {
        // 1. Fichier gzip
        const fullPath = path.join(SNAPSHOTS_DIR, s.payloadPath);
        try {
          unlinkSync(fullPath);
        } catch (err) {
          // Fichier déjà absent ? On log mais on continue (idempotent).
          if (err.code !== 'ENOENT') {
            console.warn(`${LOG_PREFIX} unlink failed ${fullPath}: ${err.message}`);
          }
        }
        // 2. Row DB
        db.prepare('DELETE FROM collab_snapshots WHERE id = ?').run(s.id);
      }
    }

    const line = {
      companyId,
      collabId,
      total: snapshots.length,
      kept: keepIds.size,
      deleted: toDelete.length,
      freedBytes,
    };
    report.push(line);

    console.log(
      `${LOG_PREFIX} collab=${collabId} total=${line.total} kept=${line.kept} deleted=${line.deleted} freed=${line.freedBytes}b ${dryRun ? '(dry-run)' : ''}`
    );
  }

  return report;
}
