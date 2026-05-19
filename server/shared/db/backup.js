// server/shared/db/backup.js
// Phase 1 Sprint 1 — Backup helpers WAL-safe (sqlite3 .backup atomique).
//
// Invariants Phase 1 :
//   - WRAP-only : aucun import legacy
//   - DORMANT : aucun import depuis runtime legacy
//   - I4 safe : helpers ne touchent qu'aux paths fournis par caller
//
// Pattern WAL-safe : utilise l'API native `Database.backup()` de better-sqlite3
// qui implémente l'équivalent de `sqlite3 src .backup dest` (atomique, online).

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Performs a WAL-safe atomic backup of a SQLite database to another file path.
 * Uses better-sqlite3's online backup API (no lock, no downtime).
 *
 * @param {string} srcPath - source DB path (must exist, readable)
 * @param {string} destPath - destination path (created/overwritten)
 * @param {object} [opts]
 * @param {number} [opts.progressPages=100] - pages per step (advisory)
 * @returns {Promise<{srcPath:string, destPath:string, destSize:number, durationMs:number}>}
 */
export async function backupSqlite(srcPath, destPath, opts = {}) {
  if (!srcPath || typeof srcPath !== 'string') {
    throw new TypeError('backupSqlite: srcPath must be non-empty string');
  }
  if (!destPath || typeof destPath !== 'string') {
    throw new TypeError('backupSqlite: destPath must be non-empty string');
  }
  if (srcPath === destPath) {
    throw new Error('backupSqlite: src and dest must differ');
  }

  // Verify src exists
  const srcStat = await stat(srcPath).catch(() => null);
  if (!srcStat || !srcStat.isFile()) {
    throw new Error(`backupSqlite: src not a file: ${srcPath}`);
  }

  // Ensure dest dir exists
  await mkdir(path.dirname(path.resolve(destPath)), { recursive: true });

  const t0 = Date.now();
  const src = new Database(srcPath, { readonly: true, fileMustExist: true });
  try {
    await src.backup(destPath, {
      progress({ totalPages, remainingPages }) {
        // Best-effort hook; return positive int to continue.
        return opts.progressPages || 100;
      },
    });
  } finally {
    src.close();
  }
  const durationMs = Date.now() - t0;

  const destStat = await stat(destPath).catch(() => null);
  if (!destStat) {
    throw new Error(`backupSqlite: dest not created: ${destPath}`);
  }

  return {
    srcPath: path.resolve(srcPath),
    destPath: path.resolve(destPath),
    destSize: destStat.size,
    durationMs,
  };
}

/**
 * Streaming SHA-256 of a file (no full read into memory).
 * @param {string} filePath
 * @returns {Promise<string>} lowercase hex digest
 */
export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Runs PRAGMA integrity_check on a SQLite file.
 * Opens in read-only mode (no lock impact on writers).
 * @param {string} dbPath
 * @returns {Promise<{ok:boolean, result:string}>}
 */
export async function integrityCheck(dbPath) {
  if (!dbPath || typeof dbPath !== 'string') {
    throw new TypeError('integrityCheck: dbPath must be non-empty string');
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.pragma('integrity_check', { simple: true });
    const result = String(row).trim();
    return { ok: result === 'ok', result };
  } finally {
    db.close();
  }
}

/**
 * Runs PRAGMA foreign_key_check.
 * @param {string} dbPath
 * @returns {Promise<{ok:boolean, violations:Array}>}
 */
export async function foreignKeyCheck(dbPath) {
  if (!dbPath || typeof dbPath !== 'string') {
    throw new TypeError('foreignKeyCheck: dbPath must be non-empty string');
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.pragma('foreign_key_check');
    return { ok: rows.length === 0, violations: rows };
  } finally {
    db.close();
  }
}

/**
 * Runs all 3 verifications in sequence: backup integrity proof.
 * Useful after backup creation OR during DR drill.
 * @param {string} dbPath
 * @returns {Promise<{integrityOk, fkOk, sha256, sizeBytes}>}
 */
export async function verifyBackup(dbPath) {
  const integrity = await integrityCheck(dbPath);
  const fk = await foreignKeyCheck(dbPath);
  const sha = await sha256File(dbPath);
  const fileStat = await stat(dbPath);
  return {
    integrityOk: integrity.ok,
    integrityResult: integrity.result,
    fkOk: fk.ok,
    fkViolations: fk.violations,
    sha256: sha,
    sizeBytes: fileStat.size,
  };
}
