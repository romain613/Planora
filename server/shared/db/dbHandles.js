// server/shared/db/dbHandles.js
// Phase 1 Sprint 1 — Multi-DB lazy handles, WAL-safe.
//
// Invariants Phase 1 :
//   - WRAP-only : aucun import legacy (../db/database.js, etc.)
//   - DORMANT : aucun import depuis ce module dans le runtime legacy
//   - I4 safe : aucun chemin par défaut (le caller fournit le path)
//
// Usage prévu Phase 2+ : scope = "supra"|"client"|"app", key = identifiant
//   const handle = getHandle("supra", "main", "/path/to/supra.db");
//
// Pragma garanties (WAL-safe SQLite) :
//   - journal_mode = WAL          (concurrence reads/writes)
//   - synchronous  = NORMAL       (compromis perf/durabilité)
//   - foreign_keys = ON           (FK enforced)
//   - busy_timeout = 5000ms       (évite SQLITE_BUSY transitoires)
//   - temp_store   = MEMORY       (perf)

import Database from 'better-sqlite3';
import path from 'node:path';

const PRAGMA_DEFAULTS = Object.freeze({
  journal_mode: 'WAL',
  synchronous: 'NORMAL',
  foreign_keys: 'ON',
  busy_timeout: 5000,
  temp_store: 'MEMORY',
});

// Map<"scope:key", { db, pathAbs, openedAt }>
const handles = new Map();

function keyOf(scope, key) {
  if (!scope || typeof scope !== 'string') {
    throw new TypeError('dbHandles: scope must be non-empty string');
  }
  if (!key || typeof key !== 'string') {
    throw new TypeError('dbHandles: key must be non-empty string');
  }
  return `${scope}:${key}`;
}

function applyPragmas(db, pragmas) {
  for (const [name, value] of Object.entries(pragmas)) {
    db.pragma(`${name} = ${value}`);
  }
}

/**
 * Opens a SQLite database with WAL-safe pragmas.
 * Does NOT register the handle — use getHandle() for managed handles.
 * @param {string} dbPath - absolute or relative path; ":memory:" accepted
 * @param {object} [opts]
 * @param {boolean} [opts.readonly=false]
 * @param {object} [opts.pragmas] - overrides PRAGMA_DEFAULTS
 * @returns {Database} better-sqlite3 instance
 */
export function openDb(dbPath, opts = {}) {
  if (!dbPath || typeof dbPath !== 'string') {
    throw new TypeError('openDb: dbPath must be non-empty string');
  }

  const isMemory = dbPath === ':memory:';
  const resolved = isMemory ? ':memory:' : path.resolve(dbPath);

  const db = new Database(resolved, {
    readonly: Boolean(opts.readonly),
    fileMustExist: false,
  });

  const pragmas = { ...PRAGMA_DEFAULTS, ...(opts.pragmas || {}) };
  applyPragmas(db, pragmas);

  return db;
}

/**
 * Gets or lazily creates a managed handle for a (scope, key) pair.
 * Re-uses existing connection if path matches.
 * @param {string} scope - e.g. "supra", "client", "app"
 * @param {string} key - identifier within scope (e.g. clientId)
 * @param {string} dbPath - the file path the first call uses; ignored on subsequent calls
 * @param {object} [opts] - forwarded to openDb on first call
 * @returns {Database}
 */
export function getHandle(scope, key, dbPath, opts = {}) {
  const id = keyOf(scope, key);
  const existing = handles.get(id);
  if (existing) {
    return existing.db;
  }

  if (!dbPath) {
    throw new Error(`getHandle: handle "${id}" not yet opened — provide dbPath on first call`);
  }

  const db = openDb(dbPath, opts);
  handles.set(id, {
    db,
    pathAbs: dbPath === ':memory:' ? ':memory:' : path.resolve(dbPath),
    openedAt: Date.now(),
  });
  return db;
}

/**
 * Returns true if a handle is registered (not whether the file exists).
 */
export function hasHandle(scope, key) {
  return handles.has(keyOf(scope, key));
}

/**
 * Returns metadata for all registered handles.
 * Does not include the Database instance itself.
 * @returns {Array<{scope, key, pathAbs, openedAt}>}
 */
export function listHandles() {
  return Array.from(handles.entries()).map(([id, entry]) => {
    const [scope, key] = id.split(':');
    return { scope, key, pathAbs: entry.pathAbs, openedAt: entry.openedAt };
  });
}

/**
 * Closes and removes a single handle.
 * @returns {boolean} true if handle existed and was closed
 */
export function closeHandle(scope, key) {
  const id = keyOf(scope, key);
  const entry = handles.get(id);
  if (!entry) return false;
  try {
    entry.db.close();
  } finally {
    handles.delete(id);
  }
  return true;
}

/**
 * Closes all managed handles. Idempotent.
 * @returns {number} count of handles closed
 */
export function closeAll() {
  let n = 0;
  for (const [, entry] of handles) {
    try {
      entry.db.close();
    } catch {
      // best-effort
    }
    n += 1;
  }
  handles.clear();
  return n;
}

/**
 * Returns the immutable default PRAGMA set.
 */
export function getDefaultPragmas() {
  return { ...PRAGMA_DEFAULTS };
}
