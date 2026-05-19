// server/shared/db/test/dbHandles.test.js
// Node :test natif — zéro dépendance test framework.
// Tests utilisent :memory: ou os.tmpdir() — JAMAIS de chemin prod.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  openDb,
  getHandle,
  hasHandle,
  listHandles,
  closeHandle,
  closeAll,
  getDefaultPragmas,
} from '../dbHandles.js';

let scratchDir;

beforeEach(() => {
  scratchDir = mkdtempSync(path.join(tmpdir(), 'phase1-dbhandles-'));
});

afterEach(() => {
  closeAll();
  if (scratchDir && existsSync(scratchDir)) {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

describe('dbHandles — openDb', () => {
  test('opens :memory: DB with WAL-safe pragmas', () => {
    const db = openDb(':memory:');
    try {
      // :memory: does not support WAL — better-sqlite3 falls back to memory journal.
      // But foreign_keys + busy_timeout must be set.
      const fk = db.pragma('foreign_keys', { simple: true });
      assert.equal(fk, 1, 'foreign_keys = ON');

      const bt = db.pragma('busy_timeout', { simple: true });
      assert.equal(bt, 5000, 'busy_timeout = 5000');
    } finally {
      db.close();
    }
  });

  test('opens file DB and applies WAL journal_mode', () => {
    const filePath = path.join(scratchDir, 'wal-test.db');
    const db = openDb(filePath);
    try {
      const jm = db.pragma('journal_mode', { simple: true });
      assert.equal(jm, 'wal', 'journal_mode = wal (file DB)');

      const fk = db.pragma('foreign_keys', { simple: true });
      assert.equal(fk, 1);
    } finally {
      db.close();
    }
  });

  test('rejects non-string path', () => {
    assert.throws(() => openDb(null), /non-empty string/);
    assert.throws(() => openDb(''), /non-empty string/);
    assert.throws(() => openDb(123), /non-empty string/);
  });

  test('readonly opt forwards to better-sqlite3', () => {
    // First create + close
    const filePath = path.join(scratchDir, 'readonly-test.db');
    const writer = openDb(filePath);
    writer.exec('CREATE TABLE t (id INTEGER)');
    writer.close();

    // Reopen readonly
    const ro = openDb(filePath, { readonly: true });
    try {
      assert.equal(ro.readonly, true, 'readonly flag set');
      assert.throws(() => ro.exec('INSERT INTO t VALUES (1)'), /readonly/i);
    } finally {
      ro.close();
    }
  });
});

describe('dbHandles — getHandle / managed', () => {
  test('first call opens, subsequent calls return same instance', () => {
    const filePath = path.join(scratchDir, 'managed.db');
    const db1 = getHandle('supra', 'main', filePath);
    const db2 = getHandle('supra', 'main');
    assert.equal(db1, db2, 'same Database instance');
  });

  test('throws on second call if first call lacks dbPath', () => {
    assert.throws(
      () => getHandle('client', 'never-opened'),
      /handle "client:never-opened" not yet opened/
    );
  });

  test('different scopes are isolated', () => {
    const p1 = path.join(scratchDir, 'supra.db');
    const p2 = path.join(scratchDir, 'client.db');
    const a = getHandle('supra', 'main', p1);
    const b = getHandle('client', 'main', p2);
    assert.notEqual(a, b);
  });

  test('different keys in same scope are isolated', () => {
    const p1 = path.join(scratchDir, 'c1.db');
    const p2 = path.join(scratchDir, 'c2.db');
    const a = getHandle('client', 'c1', p1);
    const b = getHandle('client', 'c2', p2);
    assert.notEqual(a, b);
  });

  test('hasHandle reflects state', () => {
    assert.equal(hasHandle('supra', 'main'), false);
    const filePath = path.join(scratchDir, 'has-test.db');
    getHandle('supra', 'main', filePath);
    assert.equal(hasHandle('supra', 'main'), true);
  });

  test('listHandles returns metadata without db instance', () => {
    const filePath = path.join(scratchDir, 'list.db');
    getHandle('app', 'global', filePath);
    const list = listHandles();
    assert.equal(list.length, 1);
    assert.equal(list[0].scope, 'app');
    assert.equal(list[0].key, 'global');
    assert.ok(list[0].pathAbs.endsWith('list.db'));
    assert.ok(typeof list[0].openedAt === 'number');
    assert.ok(list[0].db === undefined, 'no db field exposed');
  });

  test('closeHandle removes single handle', () => {
    const filePath = path.join(scratchDir, 'close-one.db');
    getHandle('client', 'a', filePath);
    assert.equal(hasHandle('client', 'a'), true);
    assert.equal(closeHandle('client', 'a'), true);
    assert.equal(hasHandle('client', 'a'), false);
    assert.equal(closeHandle('client', 'a'), false, 'second close = false');
  });

  test('closeAll closes all and returns count', () => {
    getHandle('supra', 'main', path.join(scratchDir, 's.db'));
    getHandle('client', 'a', path.join(scratchDir, 'a.db'));
    getHandle('client', 'b', path.join(scratchDir, 'b.db'));
    const n = closeAll();
    assert.equal(n, 3);
    assert.equal(listHandles().length, 0);
  });

  test('rejects invalid scope/key', () => {
    assert.throws(() => getHandle('', 'k', 'p'), /scope must be/);
    assert.throws(() => getHandle('s', '', 'p'), /key must be/);
  });
});

describe('dbHandles — defaults', () => {
  test('getDefaultPragmas returns immutable snapshot', () => {
    const p1 = getDefaultPragmas();
    const p2 = getDefaultPragmas();
    assert.notEqual(p1, p2, 'returns copy');
    assert.deepEqual(p1, p2);
    assert.equal(p1.journal_mode, 'WAL');
    assert.equal(p1.synchronous, 'NORMAL');
    assert.equal(p1.foreign_keys, 'ON');
    assert.equal(p1.busy_timeout, 5000);
    assert.equal(p1.temp_store, 'MEMORY');
  });
});
