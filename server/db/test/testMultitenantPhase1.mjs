// server/db/test/testMultitenantPhase1.mjs
// Test local isolation complete — aucun impact prod.
// Lance : CONTROL_TOWER_PATH=/tmp/ct-test.db TENANTS_DIR=/tmp/tenants-test STORAGE_DIR=/tmp/storage-test node server/db/test/testMultitenantPhase1.mjs
//
// Verifie :
//   1. Creation control tower + schema
//   2. Insertion company fictive + provisioning tenant DB avec PRAGMA foreign_key_check
//   3. resolveTenant() retourne bon mode
//   4. getTenantDb() refuse en mode 'legacy' (409)
//   5. Bascule en mode 'tenant' + getTenantDb() fonctionne
//   6. runWithTenant() execute un handler dans le bon scope

import { rmSync, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

// Forcer les chemins de test AVANT d'importer les modules (qui lisent process.env au load)
process.env.CONTROL_TOWER_PATH = process.env.CONTROL_TOWER_PATH || '/tmp/ct-test.db';
process.env.TENANTS_DIR = process.env.TENANTS_DIR || '/tmp/tenants-test';
process.env.STORAGE_DIR = process.env.STORAGE_DIR || '/tmp/storage-test';

// Cleanup runs precedents
for (const p of [
  process.env.CONTROL_TOWER_PATH,
  `${process.env.CONTROL_TOWER_PATH}-wal`,
  `${process.env.CONTROL_TOWER_PATH}-shm`,
]) {
  try { if (existsSync(p)) rmSync(p); } catch {}
}
try { if (existsSync(process.env.TENANTS_DIR)) rmSync(process.env.TENANTS_DIR, { recursive:true, force:true }); } catch {}
if (!existsSync(process.env.TENANTS_DIR)) mkdirSync(process.env.TENANTS_DIR, { recursive: true });

const { default: ct } = await import('../controlTower.js');
const { initControlTowerSchema } = await import('../controlTowerSchema.js');
const { resolveTenant, getTenantDb, invalidateTenant, defaultDbPathFor } = await import('../tenantResolver.js');
const { runWithTenant } = await import('../../helpers/withTenantDb.js');
const { stats, closeAll } = await import('../tenantDbCache.js');

let pass = 0, fail = 0;
const ok = (msg) => { console.log('  [OK]', msg); pass++; };
const ko = (msg, err) => { console.error('  [KO]', msg, err?.message || err); fail++; };

try {
  // ─── TEST 1 : init control tower ────────────────────────────────────
  console.log('\n1. Init control tower schema');
  initControlTowerSchema();
  const tables = ct.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all();
  const expected = ['backup_registry','companies','plans','sessions','supra_admins','supra_stats_snapshots','tenant_databases','tenant_status_history'];
  const present = tables.map(t => t.name);
  const missing = expected.filter(e => !present.includes(e));
  if (!missing.length) ok('all 8 control tower tables created');
  else ko('missing tables', missing.join(','));

  // ─── TEST 2 : insertion company + provisioning tenant DB ─────────────
  console.log('\n2. Provision tenant DB (companyId-based naming + FK check)');
  const cid = 'c_1774872506051';
  ct.prepare(`INSERT INTO companies (id, name, slug, tenantMode, status, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))`)
    .run(cid, 'Test Company', 'test-company', 'legacy', 'active');
  ok('company inserted in control tower (legacy mode)');

  const dbPath = defaultDbPathFor(cid);
  if (dbPath.includes(cid) && !dbPath.includes('test-company')) ok('dbPath based on companyId, not slug: ' + dbPath);
  else ko('dbPath not based on companyId', dbPath);

  // Creer la tenant DB minimal avec FK + foreign_key_check
  const tdb = new Database(dbPath);
  tdb.pragma('journal_mode = WAL');
  tdb.pragma('foreign_keys = OFF'); // bulk insert
  tdb.exec(`
    CREATE TABLE contacts (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE contact_documents (
      id TEXT PRIMARY KEY,
      contactId TEXT,
      filename TEXT,
      FOREIGN KEY (contactId) REFERENCES contacts(id)
    );
    INSERT INTO contacts (id, name) VALUES ('ct1', 'Alice'), ('ct2', 'Bob');
    INSERT INTO contact_documents (id, contactId, filename) VALUES ('doc1', 'ct1', 'cv.pdf');
  `);
  tdb.pragma('foreign_keys = ON');
  const fkViolations = tdb.pragma('foreign_key_check');
  if (fkViolations.length === 0) ok('PRAGMA foreign_key_check: no violation');
  else ko('FK violations detected', JSON.stringify(fkViolations));
  tdb.close();

  const size = statSync(dbPath).size;
  ct.prepare(`INSERT INTO tenant_databases (companyId, dbPath, storagePath, provisionedAt, sizeBytes, lastIntegrityStatus) VALUES (?, ?, ?, datetime('now'), ?, 'ok')`)
    .run(cid, dbPath, '/tmp/storage-test/' + cid, size);
  ok('tenant_databases row inserted, size=' + size + ' bytes');

  // ─── TEST 3 : resolveTenant ──────────────────────────────────────────
  console.log('\n3. resolveTenant() in legacy mode');
  const t1 = resolveTenant(cid);
  if (t1.tenantMode === 'legacy' && t1.dbPath === dbPath) ok('resolved: mode=legacy, dbPath=' + t1.dbPath);
  else ko('unexpected tenant metadata', JSON.stringify(t1));

  // ─── TEST 4 : getTenantDb refuse en mode legacy ──────────────────────
  console.log('\n4. getTenantDb() refuses legacy mode');
  try {
    getTenantDb(cid);
    ko('getTenantDb should have thrown');
  } catch (e) {
    if (e.code === 409 && e.message.includes('TENANT_MODE_NOT_ACTIVE')) ok('refused with 409: ' + e.message);
    else ko('wrong error', e.message);
  }

  // ─── TEST 5 : bascule en mode tenant ─────────────────────────────────
  console.log('\n5. Flip tenantMode to tenant + retry');
  ct.prepare(`UPDATE companies SET tenantMode = 'tenant', migratedAt = datetime('now') WHERE id = ?`).run(cid);
  invalidateTenant(cid);
  const db = getTenantDb(cid);
  const rows = db.prepare('SELECT * FROM contacts ORDER BY id').all();
  if (rows.length === 2 && rows[0].name === 'Alice') ok('tenant DB reachable, 2 contacts read: ' + JSON.stringify(rows.map(r => r.name)));
  else ko('unexpected contact read', JSON.stringify(rows));

  // ─── TEST 6 : runWithTenant ──────────────────────────────────────────
  console.log('\n6. runWithTenant() wrapper');
  const result = await runWithTenant(cid, (db, tenant) => {
    if (tenant.tenantMode !== 'tenant') throw new Error('bad mode inside wrapper');
    return db.prepare('SELECT COUNT(*) c FROM contact_documents').get().c;
  });
  if (result === 1) ok('wrapper executed handler, doc count=1');
  else ko('wrong doc count from wrapper', result);

  // ─── TEST 7 : cache stats ────────────────────────────────────────────
  console.log('\n7. Tenant DB cache introspection');
  const s = stats();
  if (s.size >= 1 && s.entries.some(e => e.dbPath === dbPath)) ok('cache contains tenant DB, size=' + s.size);
  else ko('cache missing entry', JSON.stringify(s));

  // ─── TEST 8 : path traversal safeguard ───────────────────────────────
  console.log('\n8. Path traversal safeguard');
  try {
    defaultDbPathFor('../etc/passwd');
    ko('defaultDbPathFor should reject ../');
  } catch (e) {
    if (e.code === 400) ok('rejected malicious companyId with 400');
    else ko('wrong error code', e.code);
  }

} catch (e) {
  console.error('FATAL', e);
  fail++;
} finally {
  closeAll();
  try { ct.close(); } catch {}
}

console.log(`\n═══ RESULT : ${pass} passed, ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
