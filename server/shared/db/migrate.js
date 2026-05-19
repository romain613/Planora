// server/shared/db/migrate.js
// Phase 1 Sprint 1 — Migration registry, dry-run by default.
//
// Invariants Phase 1 :
//   - WRAP-only : aucun import legacy
//   - DORMANT : aucune migration appliquée Phase 1 — registry seul
//   - I4 safe : applyMigrations refuse de tourner sans flag explicite Phase 2+
//
// Pattern :
//   const reg = new MigrationRegistry();
//   reg.add({ id: '001-bootstrap', up: (db) => {...}, down: (db) => {...} });
//   await dryRun(db, reg);          // Phase 1 — toujours OK
//   await applyMigrations(db, reg, { force: true }); // Phase 2+ uniquement
//
// La table _phase1_migrations track les migrations appliquées (Phase 2+).
// Idempotence : double-run = no-op (skip celles déjà appliquées).

const MIGRATIONS_TABLE = '_phase1_migrations';

/**
 * Migration registry. Ordered insertion, dedupe par id.
 */
export class MigrationRegistry {
  constructor() {
    this._migrations = [];
    this._ids = new Set();
  }

  /**
   * Register a migration.
   * @param {object} m
   * @param {string} m.id - unique identifier (e.g. '001-create-tenants')
   * @param {string} [m.description]
   * @param {Function} m.up - (db) => void  (idempotent)
   * @param {Function} [m.down] - (db) => void  (optional, idempotent)
   */
  add(m) {
    if (!m || typeof m !== 'object') {
      throw new TypeError('MigrationRegistry.add: migration must be object');
    }
    if (!m.id || typeof m.id !== 'string') {
      throw new TypeError('MigrationRegistry.add: id required string');
    }
    if (typeof m.up !== 'function') {
      throw new TypeError(`MigrationRegistry.add[${m.id}]: up required function`);
    }
    if (this._ids.has(m.id)) {
      throw new Error(`MigrationRegistry.add: duplicate id "${m.id}"`);
    }
    this._migrations.push({
      id: m.id,
      description: m.description || '',
      up: m.up,
      down: m.down || null,
    });
    this._ids.add(m.id);
    return this;
  }

  list() {
    return this._migrations.map(({ up, down, ...m }) => m);
  }

  size() {
    return this._migrations.length;
  }

  get(id) {
    return this._migrations.find((m) => m.id === id) || null;
  }
}

/**
 * Ensures the migrations tracking table exists.
 * @param {Database} db - better-sqlite3 instance
 */
export function ensureMigrationsTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id TEXT PRIMARY KEY,
      description TEXT,
      applied_at INTEGER NOT NULL,
      sha256_up TEXT
    )
  `).run();
}

/**
 * Returns ids of migrations already applied to db.
 * @param {Database} db
 * @returns {Set<string>}
 */
export function appliedIds(db) {
  ensureMigrationsTable(db);
  const rows = db.prepare(`SELECT id FROM ${MIGRATIONS_TABLE}`).all();
  return new Set(rows.map((r) => r.id));
}

/**
 * Dry-run : inspect what would be applied, without running .up().
 * Safe to call anytime (Phase 1 default).
 * @param {Database} db
 * @param {MigrationRegistry} registry
 * @returns {{pending:Array<{id,description}>, applied:Array<string>}}
 */
export function dryRun(db, registry) {
  if (!(registry instanceof MigrationRegistry)) {
    throw new TypeError('dryRun: registry must be MigrationRegistry');
  }
  const already = appliedIds(db);
  const all = registry.list();
  return {
    applied: Array.from(already),
    pending: all.filter((m) => !already.has(m.id)),
  };
}

/**
 * Applies pending migrations sequentially in a transaction per migration.
 * REFUSES to run without { force: true } during Phase 1.
 * Idempotent : double-run = no-op (skip applied).
 *
 * @param {Database} db
 * @param {MigrationRegistry} registry
 * @param {object} opts
 * @param {boolean} opts.force - REQUIRED to run (Phase 1 safety guard)
 * @param {Function} [opts.onApplied] - (migration) => void hook
 * @returns {{appliedThisRun:Array<string>, skipped:Array<string>}}
 */
export function applyMigrations(db, registry, opts = {}) {
  if (!opts.force) {
    throw new Error(
      'applyMigrations: refused — Phase 1 requires { force: true }. ' +
        'Use dryRun() to inspect pending migrations instead.'
    );
  }
  if (!(registry instanceof MigrationRegistry)) {
    throw new TypeError('applyMigrations: registry must be MigrationRegistry');
  }

  ensureMigrationsTable(db);
  const already = appliedIds(db);
  const appliedThisRun = [];
  const skipped = [];

  for (const m of registry._migrations) {
    if (already.has(m.id)) {
      skipped.push(m.id);
      continue;
    }

    const tx = db.transaction((mig) => {
      mig.up(db);
      db.prepare(
        `INSERT INTO ${MIGRATIONS_TABLE} (id, description, applied_at, sha256_up) VALUES (?, ?, ?, ?)`
      ).run(mig.id, mig.description, Date.now(), null);
    });

    tx(m);
    appliedThisRun.push(m.id);
    if (typeof opts.onApplied === 'function') {
      try {
        opts.onApplied({ id: m.id, description: m.description });
      } catch {
        // hook errors must not fail migration tracking
      }
    }
  }

  return { appliedThisRun, skipped };
}

export const MIGRATIONS_TABLE_NAME = MIGRATIONS_TABLE;
