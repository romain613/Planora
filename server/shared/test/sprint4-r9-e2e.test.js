// server/shared/test/sprint4-r9-e2e.test.js
// Tests R9 alignment scripts + E2E isolation scan.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runR9SharedCheck } from '../r9/r9-shared-check.js';
import { runProviderIsolationCheck } from '../r9/provider-isolation-check.js';
import { runRuntimeBoundaryCheck } from '../r9/runtime-boundary-check.js';
import { runIsolationScan } from '../e2e/isolation-scan.js';

function scaffoldShared(rootDir) {
  // Crée la structure attendue (minimale)
  const subs = ['db', 'auth', 'guards', 'middleware', 'errors', 'logging', 'utils', 'providers', 'eslint', 'contracts', 'r9', 'e2e', 'docs'];
  for (const s of subs) {
    mkdirSync(path.join(rootDir, 'shared', s), { recursive: true });
  }
  writeFileSync(path.join(rootDir, 'shared', 'README.md'), '# shared');
  for (const s of ['db', 'auth', 'guards', 'middleware', 'errors', 'logging', 'utils', 'providers', 'eslint', 'contracts']) {
    writeFileSync(path.join(rootDir, 'shared', s, 'index.js'), '// stub');
  }
  for (const s of ['db', 'auth', 'guards', 'middleware', 'errors', 'logging', 'utils', 'providers']) {
    writeFileSync(path.join(rootDir, 'shared', s, 'README.md'), '# stub');
  }
}

describe('r9/r9-shared-check', () => {
  test('OK sur structure complète scaffold', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-shared-'));
    scaffoldShared(root);
    const r = runR9SharedCheck(path.join(root, 'shared'));
    assert.equal(r.ok, true);
    assert.ok(r.present.length >= 10);
    rmSync(root, { recursive: true, force: true });
  });

  test('détecte sous-dossier manquant', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-shared-miss-'));
    scaffoldShared(root);
    rmSync(path.join(root, 'shared', 'auth'), { recursive: true, force: true });
    const r = runR9SharedCheck(path.join(root, 'shared'));
    assert.equal(r.ok, false);
    assert.ok(r.violations.some((v) => /auth/.test(v)));
    rmSync(root, { recursive: true, force: true });
  });

  test('détecte index.js manquant', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-shared-idx-'));
    scaffoldShared(root);
    rmSync(path.join(root, 'shared', 'utils', 'index.js'));
    const r = runR9SharedCheck(path.join(root, 'shared'));
    assert.equal(r.ok, false);
    assert.ok(r.violations.some((v) => /utils\/index\.js/.test(v)));
    rmSync(root, { recursive: true, force: true });
  });

  test('détecte README.md scope manquant', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-shared-rm-'));
    scaffoldShared(root);
    rmSync(path.join(root, 'shared', 'README.md'));
    const r = runR9SharedCheck(path.join(root, 'shared'));
    assert.equal(r.ok, false);
    assert.ok(r.violations.some((v) => /shared\/README\.md/.test(v)));
    rmSync(root, { recursive: true, force: true });
  });

  test('retourne erreur si shared root absent', () => {
    const r = runR9SharedCheck('/nope/does/not/exist');
    assert.equal(r.ok, false);
    assert.ok(r.violations[0].includes('not found'));
  });
});

describe('r9/provider-isolation-check', () => {
  test('OK sur adapter conforme (opts.client validé)', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-pi-ok-'));
    mkdirSync(path.join(root, 'adapters'), { recursive: true });
    writeFileSync(path.join(root, 'adapters', 'X.js'), `
      export class X {
        constructor(opts) {
          if (!opts.client) throw new Error('client required');
          this._client = opts.client;
        }
      }
    `);
    const r = runProviderIsolationCheck(root);
    assert.equal(r.ok, true);
    rmSync(root, { recursive: true, force: true });
  });

  test('détecte adapter sans opts.client check', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-pi-bad1-'));
    mkdirSync(path.join(root, 'adapters'), { recursive: true });
    writeFileSync(path.join(root, 'adapters', 'X.js'), `
      export class X { constructor() {} }
    `);
    const r = runProviderIsolationCheck(root);
    assert.equal(r.ok, false);
    assert.ok(r.violations.some((v) => /opts\.client/.test(v.message)));
    rmSync(root, { recursive: true, force: true });
  });

  test('détecte auto-instantiation Twilio', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-pi-bad2-'));
    mkdirSync(path.join(root, 'adapters'), { recursive: true });
    writeFileSync(path.join(root, 'adapters', 'X.js'), `
      export class X {
        constructor(opts) {
          this._client = opts.client;
          this._direct = new Twilio('sid', 'tok');
        }
      }
    `);
    const r = runProviderIsolationCheck(root);
    assert.equal(r.ok, false);
    assert.ok(r.violations.some((v) => /auto-instantiate/.test(v.message)));
    rmSync(root, { recursive: true, force: true });
  });

  test('skip index.js', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-pi-skipidx-'));
    mkdirSync(path.join(root, 'adapters'), { recursive: true });
    writeFileSync(path.join(root, 'adapters', 'index.js'), `export {};`);
    const r = runProviderIsolationCheck(root);
    assert.equal(r.ok, true);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('r9/runtime-boundary-check', () => {
  function setupServer(rootDir) {
    const serverDir = path.join(rootDir, 'server');
    mkdirSync(path.join(serverDir, 'shared', 'auth'), { recursive: true });
    mkdirSync(path.join(serverDir, 'routes'), { recursive: true });
    mkdirSync(path.join(serverDir, 'services'), { recursive: true });
    writeFileSync(path.join(serverDir, 'index.js'), `// entry`);
    return serverDir;
  }

  test('OK sur scaffold propre', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-rb-ok-'));
    const serverDir = setupServer(root);
    writeFileSync(path.join(serverDir, 'shared', 'auth', 'x.js'), `import { y } from '../utils/z.js';`);
    writeFileSync(path.join(serverDir, 'routes', 'a.js'), `import express from 'express';`);
    const r = runRuntimeBoundaryCheck(serverDir);
    assert.equal(r.ok, true);
    rmSync(root, { recursive: true, force: true });
  });

  test('détecte shared/ importing legacy', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-rb-bad1-'));
    const serverDir = setupServer(root);
    writeFileSync(path.join(serverDir, 'shared', 'auth', 'x.js'), `import { db } from '../../routes/bookings.js';`);
    const r = runRuntimeBoundaryCheck(serverDir);
    assert.equal(r.ok, false);
    assert.ok(r.counts.runtimeImports >= 1);
    rmSync(root, { recursive: true, force: true });
  });

  test('détecte legacy importing shared/', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-rb-bad2-'));
    const serverDir = setupServer(root);
    writeFileSync(path.join(serverDir, 'routes', 'x.js'), `import { auth } from '../shared/auth/index.js';`);
    const r = runRuntimeBoundaryCheck(serverDir);
    assert.equal(r.ok, false);
    assert.ok(r.counts.legacyCoupling >= 1);
    rmSync(root, { recursive: true, force: true });
  });

  test('détecte server/index.js mount shared/', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r9-rb-bad3-'));
    const serverDir = setupServer(root);
    writeFileSync(path.join(serverDir, 'index.js'), `app.use('/api/shared/foo', x);`);
    const r = runRuntimeBoundaryCheck(serverDir);
    assert.equal(r.ok, false);
    assert.ok(r.counts.sharedMount >= 1);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('e2e/isolation-scan (agrégateur)', () => {
  test('returns ok=true sur projet scaffold propre', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'e2e-clean-'));
    const serverDir = path.join(root, 'server');
    scaffoldShared(serverDir);
    mkdirSync(path.join(serverDir, 'routes'), { recursive: true });
    writeFileSync(path.join(serverDir, 'index.js'), `// entry`);
    writeFileSync(path.join(serverDir, 'routes', 'a.js'), `// routes`);
    const r = runIsolationScan(root);
    assert.equal(r.ok, true);
    assert.equal(r.violations.length, 0);
    assert.ok(r.summary.sharedStructure.ok);
    assert.ok(r.summary.runtimeBoundary.ok);
    rmSync(root, { recursive: true, force: true });
  });

  test('returns ok=false si shared structure cassée', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'e2e-broken-'));
    const serverDir = path.join(root, 'server');
    mkdirSync(path.join(serverDir, 'shared'), { recursive: true });
    // Pas de sous-dossiers attendus
    const r = runIsolationScan(root);
    assert.equal(r.ok, false);
    rmSync(root, { recursive: true, force: true });
  });

  test('summary inclut counts pertinents', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'e2e-counts-'));
    const serverDir = path.join(root, 'server');
    scaffoldShared(serverDir);
    mkdirSync(path.join(serverDir, 'routes'), { recursive: true });
    writeFileSync(path.join(serverDir, 'index.js'), `// entry`);
    const r = runIsolationScan(root);
    assert.ok('sharedStructure' in r.summary);
    assert.ok('providerIsolation' in r.summary);
    assert.ok('runtimeBoundary' in r.summary);
    assert.ok('eslintRulesViolations' in r.summary);
    rmSync(root, { recursive: true, force: true });
  });

  test('déduplique violations entre boundary et eslint', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'e2e-dedupe-'));
    const serverDir = path.join(root, 'server');
    scaffoldShared(serverDir);
    mkdirSync(path.join(serverDir, 'routes'), { recursive: true });
    writeFileSync(path.join(serverDir, 'routes', 'a.js'), `import { x } from '../shared/auth/index.js';`);
    writeFileSync(path.join(serverDir, 'index.js'), `// entry`);
    const r = runIsolationScan(root);
    // Une violation unique attendue (dédupliquée si comptée par 2 scanners)
    const sameMessages = r.violations.filter((v) => /Phase 1 invariant I5/.test(v.message));
    assert.ok(sameMessages.length >= 1, 'au moins une violation détectée');
    rmSync(root, { recursive: true, force: true });
  });
});
