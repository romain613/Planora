// Phase S1 — Écriture d'un snapshot : payload vers filesystem (gzippé) + row metadata DB.
//
// NE PAS APPELER tant que la table `collab_snapshots` n'est pas créée en prod
// (voir db-migrations/2026-04-21-collab-snapshots-schema.sql, non appliquée en S1).
//
// Rôle séparé de buildCollabSnapshot : build = pure read, write = effet de bord.
// Cette séparation permet de tester buildCollabSnapshot en lecture seule sans toucher à rien.

import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { db } from '../../db/database.js';

const SNAPSHOTS_DIR =
  process.env.SNAPSHOTS_DIR || '/var/www/planora-data/snapshots';

/**
 * Écrit un payload snapshot sur disque (gzip JSON) et la row metadata dans la DB.
 *
 * @param {object} opts
 * @param {object} opts.payload    - Retour de buildCollabSnapshot()
 * @param {string} opts.fingerprint - Retour de computeCollabFingerprint()
 * @param {'auto'|'pre-restore'|'manual'} opts.kind
 * @param {string} [opts.trigger]   - ex. 'dirty-detected' / 'user-manual' / 'restore-reversibility'
 * @param {string} [opts.createdBy] - ex. 'cron' / 'supra-admin:id' / 'self:collabId'
 * @param {number} [opts.expiresAt] - timestamp ms, null si pas d'expiration
 * @returns {{ id: number, payloadPath: string, payloadSha256: string, payloadSizeBytes: number }}
 */
export function writeSnapshot({
  payload,
  fingerprint,
  kind = 'auto',
  trigger = '',
  createdBy = '',
  expiresAt = null,
}) {
  if (!payload || !payload.meta) {
    throw new Error('writeSnapshot: payload manquant ou invalide');
  }
  if (!fingerprint || typeof fingerprint !== 'string') {
    throw new Error('writeSnapshot: fingerprint requis');
  }
  const { companyId, collabId, builtAt, totalRows } = payload.meta;
  if (!companyId || !collabId) {
    throw new Error('writeSnapshot: payload.meta incomplet (companyId/collabId)');
  }

  // 1. Sérialisation + gzip
  const jsonStr = JSON.stringify(payload);
  const gzipped = gzipSync(jsonStr);
  const sha256 = createHash('sha256').update(gzipped).digest('hex');

  // 2. Construction du chemin filesystem
  //    Ex: /var/www/planora-data/snapshots/c1776169036725/u123abc/2026-04-21T08-30-00-000Z.json.gz
  const ts = new Date(builtAt).toISOString().replace(/[:.]/g, '-');
  const dir = path.join(SNAPSHOTS_DIR, companyId, collabId);
  mkdirSync(dir, { recursive: true });
  const filename = `${ts}.json.gz`;
  const fullPath = path.join(dir, filename);
  const relativePath = path.relative(SNAPSHOTS_DIR, fullPath);

  // 3. Écriture disque
  writeFileSync(fullPath, gzipped, { mode: 0o640 });

  // 4. Row metadata en DB
  const summary = JSON.stringify(payload.meta.counts || {});
  const stmt = db.prepare(`
    INSERT INTO collab_snapshots (
      companyId, collabId, createdAt, kind, trigger,
      payloadPath, payloadSha256, payloadSizeBytes, rowCount,
      fingerprint, summaryJson, createdBy, expiresAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    companyId,
    collabId,
    builtAt,
    kind,
    trigger,
    relativePath,
    sha256,
    gzipped.length,
    totalRows,
    fingerprint,
    summary,
    createdBy,
    expiresAt
  );

  return {
    id: result.lastInsertRowid,
    payloadPath: relativePath,
    payloadSha256: sha256,
    payloadSizeBytes: gzipped.length,
  };
}

/**
 * Récupère le dernier snapshot d'un collab (pour change detection).
 */
export function getLastSnapshot({ companyId, collabId }) {
  return db
    .prepare(
      'SELECT * FROM collab_snapshots WHERE companyId = ? AND collabId = ? ORDER BY createdAt DESC LIMIT 1'
    )
    .get(companyId, collabId) || null;
}
