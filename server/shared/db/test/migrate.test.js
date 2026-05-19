// server/shared/db/test/migrate.test.js
// Tests migration registry — idempotence, dry-run, force guard.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  MigrationRegistry,
  ensureMigrationsTable,
  appliedIds,
  dryRun,
  applyMigrations,
  MIGRATIONS_TABLE_NAME,
} from '../migrate.js';

let db;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
});

afterEach(() => {
  if (db && db.open) db.close();
});

describe('MigrationRegistry', () => {
  test('add() validates inputs', () => {
    const reg = new MigrationRegistry();
    assert.throws(() => reg.add(null), /must be object/);
    assert.throws(() => reg.add({}), /id required/);
    assert.throws(() => reg.add({ id: 'x' }), /up required/);
    assert.throws(() => reg.add({ id: 'x', up: 'notfn' }), /up required/);
  });

  test('add() rejects duplicate ids', () => {
    const reg = new MigrationRegistry();
    reg.add({ id: '001', up: () => {} });
    assert.throws(() => reg.add({ id: '001', up: () => {} }), /duplicate id/);
  });

  test('list() preserves order and excludes functions', () => {
    const reg = new MigrationRegistry();
    reg.add({ id: '001-a', description: 'first', up: () => {} });
    reg.add({ id: '002-b', description: 'second', up: () => {} });
    const l = reg.list();
    assert.equal(l.length, 2);
    assert.equal(l[0].id, '001-a');
    assert.equal(l[1].id, '002-b');
    assert.equal(l[0].up, undefined, 'up function not exposed in list');
  });

  test('size + get work', () => {
    const reg = new MigrationRegistry();
    assert.equal(reg.size(), 0);
    reg.add({ id: '001', up: () => {} });
    assert.equal(reg.size(), 1);
    assert.equal(reg.get('001').id, '001');
    assert.equal(reg.get('unknown'), null);
  });
});

describe('ensureMigrationsTable + appliedIds', () => {
  test('creates the table idempotently', () => {
    ensureMigrationsTable(db);
    ensureMigrationsTable(db); // second call no-op
    const ids = appliedIds(db);
    assert.equal(ids.size, 0);
    assert.ok(ids instanceof Set);
  });

  test('table name is exported as constant', () => {
    assert.equal(MIGRATIONS_TABLE_NAME, '_phase1_migrations');
  });
});

describe('dryRun', () => {
  test('returns all migrations as pending when none applied', () => {
    const reg = new MigrationRegistry();
    reg.add({ id: '001', up: () => {} });
    reg.add({ id: '002', up: () => {} });

    const r = dryRun(db, reg);
    assert.equal(r.applied.length, 0);
    assert.equal(r.pending.length, 2);
    assert.equal(r.pending[0].id, '001');
  });

  test('does not run migration code', () => {
    let called = false;
    const reg = new MigrationRegistry();
    reg.add({
      id: '001',
      up: () => {
        called = true;
      },
    });
    dryRun(db, reg);
    assert.equal(called, false, 'up() must NOT execute during dryRun');
  });

  test('rejects non-registry argument', () => {
    assert.throws(() => dryRun(db, {}), /must be MigrationRegistry/);
  });
});

describe('applyMigrations — Phase 1 safety guard', () => {
  test('refuses to run without force flag', () => {
    const reg = new MigrationRegistry();
    reg.add({ id: '001', up: () => {} });
    assert.throws(() => applyMigrations(db, reg), /Phase 1 requires \{ force: true \}/);
    assert.throws(() => applyMigrations(db, reg, { force: false }), /Phase 1 requires/);
  });

  test('runs with force: true and tracks applied', () => {
    const reg = new MigrationRegistry();
    let upCount = 0;
    reg.add({
      id: '001-create-test',
      description: 'create test table',
      up: (d) => {
        upCount += 1;
        d.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY)');
      },
    });

    const r = applyMigrations(db, reg, { force: true });
    assert.deepEqual(r.appliedThisRun, ['001-create-test']);
    assert.deepEqual(r.skipped, []);
    assert.equal(upCount, 1);

    // Table exists
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_data'").all();
    assert.equal(rows.length, 1);
  });

  test('idempotence : second run skips already applied', () => {
    const reg = new MigrationRegistry();
    let upCount = 0;
    reg.add({
      id: '001',
      up: () => {
        upCount += 1;
      },
    });

    applyMigrations(db, reg, { force: true });
    const second = applyMigrations(db, reg, { force: true });
    assert.equal(upCount, 1, 'up() called only once');
    assert.deepEqual(second.appliedThisRun, []);
    assert.deepEqual(second.skipped, ['001']);
  });

  test('transactional : failure rolls back tracking', () => {
    const reg = new MigrationRegistry();
    reg.add({
      id: '001-bad',
      up: () => {
        throw new Error('boom');
      },
    });

    assert.throws(() => applyMigrations(db, reg, { force: true }), /boom/);

    const ids = appliedIds(db);
    assert.equal(ids.has('001-bad'), false, 'failed migration not tracked');
  });

  test('onApplied hook called for each applied migration', () => {
    const reg = new MigrationRegistry();
    reg.add({ id: '001', up: () => {} });
    reg.add({ id: '002', up: () => {} });

    const hookCalls = [];
    applyMigrations(db, reg, {
      force: true,
      onApplied: (m) => hookCalls.push(m.id),
    });

    assert.deepEqual(hookCalls, ['001', '002']);
  });

  test('multiple migrations applied in order', () => {
    const reg = new MigrationRegistry();
    const order = [];
    reg.add({
      id: '001',
      up: (d) => {
        order.push('001');
        d.exec('CREATE TABLE a (id INTEGER)');
      },
    });
    reg.add({
      id: '002',
      up: (d) => {
        order.push('002');
        d.exec('CREATE TABLE b (id INTEGER)');
      },
    });
    reg.add({
      id: '003',
      up: (d) => {
        order.push('003');
        d.exec('CREATE TABLE c (id INTEGER)');
      },
    });

    const r = applyMigrations(db, reg, { force: true });
    assert.deepEqual(order, ['001', '002', '003']);
    assert.equal(r.appliedThisRun.length, 3);
  });
});

describe('dryRun after applyMigrations', () => {
  test('correctly identifies remaining pending', () => {
    const reg = new MigrationRegistry();
    reg.add({ id: '001', up: () => {} });
    reg.add({ id: '002', up: () => {} });

    // Apply only first one (simulate by manual insert)
    ensureMigrationsTable(db);
    db.prepare(
      `INSERT INTO ${MIGRATIONS_TABLE_NAME} (id, description, applied_at, sha256_up) VALUES ('001', '', ?, NULL)`
    ).run(Date.now());

    const r = dryRun(db, reg);
    assert.equal(r.applied.length, 1);
    assert.equal(r.applied[0], '001');
    assert.equal(r.pending.length, 1);
    assert.equal(r.pending[0].id, '002');
  });
});
