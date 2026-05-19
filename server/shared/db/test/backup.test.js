// server/shared/db/test/backup.test.js
// Tests backup helpers — WAL-safe atomique, SHA, integrity.
// :memory: ne supporte pas .backup() vers file → on utilise tmpfile pour src.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import {
  backupSqlite,
  sha256File,
  integrityCheck,
  foreignKeyCheck,
  verifyBackup,
} from '../backup.js';

let scratchDir;

beforeEach(() => {
  scratchDir = mkdtempSync(path.join(tmpdir(), 'phase1-backup-'));
});

afterEach(() => {
  if (scratchDir && existsSync(scratchDir)) {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

function makeSampleDb(filePath, rows = 10) {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE child  (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
  `);
  const insP = db.prepare('INSERT INTO parent (name) VALUES (?)');
  const insC = db.prepare('INSERT INTO child (parent_id) VALUES (?)');
  const tx = db.transaction((n) => {
    for (let i = 0; i < n; i += 1) {
      const info = insP.run(`p${i}`);
      insC.run(info.lastInsertRowid);
    }
  });
  tx(rows);
  db.close();
}

describe('backup — backupSqlite', () => {
  test('backs up a populated DB and produces a valid restored file', async () => {
    const src = path.join(scratchDir, 'src.db');
    const dst = path.join(scratchDir, 'backup.db');
    makeSampleDb(src, 20);

    const res = await backupSqlite(src, dst);
    assert.ok(res.destSize > 0);
    assert.ok(res.durationMs >= 0);
    assert.ok(existsSync(dst));

    // Verify restored
    const r = new Database(dst, { readonly: true });
    try {
      const count = r.prepare('SELECT COUNT(*) AS n FROM parent').get();
      assert.equal(count.n, 20);
    } finally {
      r.close();
    }
  });

  test('rejects when src and dest are equal', async () => {
    const same = path.join(scratchDir, 'same.db');
    makeSampleDb(same);
    await assert.rejects(() => backupSqlite(same, same), /must differ/);
  });

  test('rejects when src does not exist', async () => {
    await assert.rejects(
      () => backupSqlite(path.join(scratchDir, 'nope.db'), path.join(scratchDir, 'b.db')),
      /not a file/
    );
  });

  test('creates dest dir if missing', async () => {
    const src = path.join(scratchDir, 'src.db');
    const dst = path.join(scratchDir, 'sub', 'deeper', 'backup.db');
    makeSampleDb(src);
    await backupSqlite(src, dst);
    assert.ok(existsSync(dst));
  });
});

describe('backup — sha256File', () => {
  test('produces deterministic hex hash', async () => {
    const fp = path.join(scratchDir, 'data.bin');
    writeFileSync(fp, 'hello world');
    const h1 = await sha256File(fp);
    const h2 = await sha256File(fp);
    assert.equal(h1, h2);
    assert.match(h1, /^[a-f0-9]{64}$/);
    // SHA-256 of "hello world"
    assert.equal(h1, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  test('different content → different hash', async () => {
    const a = path.join(scratchDir, 'a.bin');
    const b = path.join(scratchDir, 'b.bin');
    writeFileSync(a, 'foo');
    writeFileSync(b, 'bar');
    const ha = await sha256File(a);
    const hb = await sha256File(b);
    assert.notEqual(ha, hb);
  });
});

describe('backup — integrityCheck', () => {
  test('returns ok for healthy DB', async () => {
    const src = path.join(scratchDir, 'healthy.db');
    makeSampleDb(src);
    const res = await integrityCheck(src);
    assert.equal(res.ok, true);
    assert.equal(res.result, 'ok');
  });

  test('rejects non-string path', async () => {
    await assert.rejects(() => integrityCheck(null), /non-empty string/);
  });
});

describe('backup — foreignKeyCheck', () => {
  test('returns ok with empty violations for clean DB', async () => {
    const src = path.join(scratchDir, 'fk-clean.db');
    makeSampleDb(src);
    const res = await foreignKeyCheck(src);
    assert.equal(res.ok, true);
    assert.equal(res.violations.length, 0);
  });
});

describe('backup — verifyBackup (end-to-end DR drill helper)', () => {
  test('full verification of a backup file', async () => {
    const src = path.join(scratchDir, 'src.db');
    const dst = path.join(scratchDir, 'backup.db');
    makeSampleDb(src, 15);
    await backupSqlite(src, dst);

    const v = await verifyBackup(dst);
    assert.equal(v.integrityOk, true);
    assert.equal(v.integrityResult, 'ok');
    assert.equal(v.fkOk, true);
    assert.equal(v.fkViolations.length, 0);
    assert.match(v.sha256, /^[a-f0-9]{64}$/);
    assert.ok(v.sizeBytes > 0);
  });
});
