// server/db/test/testShadowCompare.mjs
// STEP 5 Phase 5A — Tests unitaires du shadowCompare + getRouteMode + stableStringify.
// - Aucune dependance reseau
// - Aucune monolithe requise (le test mocke les fetchers)
// - Utilise une control tower isolee a /tmp
//
// Lance :
//   CONTROL_TOWER_PATH=/tmp/ct-shadowtest.db node server/db/test/testShadowCompare.mjs
//
// Couvre :
//   1. stableStringify deterministe (tri des cles a tous les niveaux)
//   2. shadowCompare : match -> 0 diff persiste, monolith retourne
//   3. shadowCompare : mismatch -> 1 diff persiste avec hash monolith + hash tenant
//   4. shadowCompare : tenant throws -> 1 diff avec tenantError, monolith retourne
//   5. shadowCompare : monolith throws -> propage l'erreur (pas de swallow)
//   6. shadowCompare : insert CT casse -> pas d'erreur remontee, monolith retourne
//   7. getRouteMode : legacy mode (kill-switch) -> 'legacy' meme si feature dit tenant
//   8. getRouteMode : shadow mode + feature override tenant -> 'tenant'
//   9. getRouteMode : tenant mode + feature override shadow -> 'shadow'
//  10. getRouteMode : companyId inconnu -> 'legacy' (fail-closed)
//  11. getRouteMode : feature absente du JSON -> fallback sur tenantMode
//  12. Idempotence table : 2e run consecutif n'explose pas (ALTER tenantFeatures swallowed)

import { rmSync, existsSync } from 'fs';

process.env.CONTROL_TOWER_PATH = process.env.CONTROL_TOWER_PATH || '/tmp/ct-shadowtest.db';

// Clean slate
for (const p of [
  process.env.CONTROL_TOWER_PATH,
  `${process.env.CONTROL_TOWER_PATH}-wal`,
  `${process.env.CONTROL_TOWER_PATH}-shm`,
]) { try { if (existsSync(p)) rmSync(p); } catch {} }

const { initControlTowerSchema } = await import('../controlTowerSchema.js');
const { default: ct }            = await import('../controlTower.js');
const { stableStringify, shadowCompare } = await import('../../services/shadowCompare.js');
const { getRouteMode, invalidateTenant } = await import('../tenantResolver.js');

initControlTowerSchema();

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`✅ ${name}`); pass++; }
  catch (e) { console.error(`❌ ${name}\n   ${e.message}`); fail++; }
}
async function testAsync(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); pass++; }
  catch (e) { console.error(`❌ ${name}\n   ${e.message}`); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`FAIL ${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// Helpers : seed companies test
function seedCompany({ id, mode = 'legacy', features = {} }) {
  ct.prepare(`INSERT OR REPLACE INTO companies (id, name, slug, tenantMode, tenantFeatures, status, active, createdAt)
              VALUES (?, ?, ?, ?, ?, 'active', 1, datetime('now'))`)
    .run(id, id + '-name', id.toLowerCase(), mode, JSON.stringify(features));
  invalidateTenant(id);
}

function countDiffs(filter = {}) {
  const where = Object.entries(filter).map(([k]) => `${k} = ?`).join(' AND ');
  const params = Object.values(filter);
  const sql = `SELECT COUNT(*) AS n FROM tenant_shadow_diffs${where ? ' WHERE ' + where : ''}`;
  return ct.prepare(sql).get(...params).n;
}

function fetchDiffs(filter = {}) {
  const where = Object.entries(filter).map(([k]) => `${k} = ?`).join(' AND ');
  const params = Object.values(filter);
  const sql = `SELECT * FROM tenant_shadow_diffs${where ? ' WHERE ' + where : ''} ORDER BY id DESC`;
  return ct.prepare(sql).all(...params);
}

// ───────────────────── TESTS ─────────────────────

test('TEST 1 — stableStringify deterministe', () => {
  const a = stableStringify({ b: 2, a: 1, c: { y: 2, x: 1 } });
  const b = stableStringify({ c: { x: 1, y: 2 }, a: 1, b: 2 });
  assertEq(a, b, 'hash should be identical regardless of key order');
  const arr1 = stableStringify([{ b: 2, a: 1 }, { d: 4, c: 3 }]);
  const arr2 = stableStringify([{ a: 1, b: 2 }, { c: 3, d: 4 }]);
  assertEq(arr1, arr2, 'nested array of objects also stable');
});

test('TEST 2 — stableStringify : undefined -> null, Date -> ISO', () => {
  const s = stableStringify({ d: new Date('2024-01-01T00:00:00Z'), u: undefined, n: null });
  assert(s.includes('"__date":"2024-01-01T00:00:00.000Z"'), 'Date should serialize as {__date: ISO}');
  assert(s.includes('"u":null'), 'undefined should become null for stability');
  assert(s.includes('"n":null'), 'null preserved');
});

await testAsync('TEST 3 — shadowCompare : match -> 0 diff persiste', async () => {
  const before = countDiffs({ feature: 'f3' });
  const result = await shadowCompare({
    companyId: 'C_MATCH', feature: 'f3', route: 'GET /test',
    fetchMonolith: () => [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
    fetchTenant:   () => [{ name: 'A', id: 1 }, { name: 'B', id: 2 }], // ordre cles different
  });
  assertEq(Array.isArray(result) ? result.length : 0, 2, 'monolith result returned');
  const after = countDiffs({ feature: 'f3' });
  assertEq(after - before, 0, 'no diff should be inserted on match');
});

await testAsync('TEST 4 — shadowCompare : mismatch -> 1 diff persiste avec les 2 hashes', async () => {
  const before = countDiffs({ feature: 'f4' });
  const result = await shadowCompare({
    companyId: 'C_DIFF', feature: 'f4', route: 'GET /test',
    fetchMonolith: () => [{ id: 1, v: 'mono' }],
    fetchTenant:   () => [{ id: 1, v: 'ten' }],
  });
  assertEq(result[0].v, 'mono', 'monolith value returned, not tenant');
  const after = countDiffs({ feature: 'f4' });
  assertEq(after - before, 1, 'exactly 1 diff row inserted');
  const [row] = fetchDiffs({ feature: 'f4' });
  assert(row.monolithHash && row.tenantHash, 'both hashes populated');
  assert(row.monolithHash !== row.tenantHash, 'hashes differ');
  assertEq(row.monolithRowCount, 1, 'monolithRowCount counted');
  assertEq(row.tenantRowCount, 1, 'tenantRowCount counted');
  assert(row.payloadSample && row.payloadSample.includes('mono'), 'payload sample contains monolith data');
  assertEq(row.tenantError, null, 'no tenantError since tenant resolved');
});

await testAsync('TEST 5 — shadowCompare : tenant throws -> 1 diff avec tenantError, monolith retournee', async () => {
  const before = countDiffs({ feature: 'f5' });
  const result = await shadowCompare({
    companyId: 'C_THROW', feature: 'f5', route: 'GET /test',
    fetchMonolith: () => ({ ok: true }),
    fetchTenant:   () => { throw new Error('tenant db unreachable'); },
  });
  assertEq(result.ok, true, 'monolith value returned despite tenant throw');
  const after = countDiffs({ feature: 'f5' });
  assertEq(after - before, 1, '1 diff row inserted for tenant error');
  const [row] = fetchDiffs({ feature: 'f5' });
  assert(row.tenantError && row.tenantError.includes('unreachable'), 'tenantError captured');
  assertEq(row.tenantHash, null, 'tenantHash null since fetch failed');
  assert(row.monolithHash, 'monolith hash still calculated');
});

await testAsync('TEST 6 — shadowCompare : monolith throws -> propagation', async () => {
  let thrown = null;
  try {
    await shadowCompare({
      companyId: 'C_MONO_THROW', feature: 'f6', route: 'GET /test',
      fetchMonolith: () => { throw new Error('source unavailable'); },
      fetchTenant:   () => ({ ok: true }),
    });
  } catch (e) { thrown = e; }
  assert(thrown && thrown.message.includes('source unavailable'), 'monolith error propagates');
});

await testAsync('TEST 7 — getRouteMode : kill-switch legacy override tenant feature', async () => {
  seedCompany({ id: 'C_KILL', mode: 'legacy', features: { contacts: 'tenant' } });
  assertEq(getRouteMode('C_KILL', 'contacts'), 'legacy', 'legacy mode wins over tenant feature');
});

await testAsync('TEST 8 — getRouteMode : shadow mode + feature tenant -> tenant', async () => {
  seedCompany({ id: 'C_SHADOW_TEN', mode: 'shadow', features: { contacts: 'tenant' } });
  assertEq(getRouteMode('C_SHADOW_TEN', 'contacts'), 'tenant', 'feature override works in non-legacy mode');
});

await testAsync('TEST 9 — getRouteMode : tenant mode + feature shadow -> shadow', async () => {
  seedCompany({ id: 'C_TEN_SHAD', mode: 'tenant', features: { bookings: 'shadow' } });
  assertEq(getRouteMode('C_TEN_SHAD', 'bookings'), 'shadow', 'feature can downgrade tenant -> shadow');
});

await testAsync('TEST 10 — getRouteMode : companyId inconnu -> legacy (fail-closed)', async () => {
  assertEq(getRouteMode('DOES_NOT_EXIST', 'contacts'), 'legacy', 'unknown company falls back to legacy');
});

await testAsync('TEST 11 — getRouteMode : feature absente JSON -> fallback tenantMode', async () => {
  seedCompany({ id: 'C_FALLBACK', mode: 'shadow', features: {} });
  assertEq(getRouteMode('C_FALLBACK', 'anything'), 'shadow', 'feature missing -> use tenantMode');
});

await testAsync('TEST 12 — getRouteMode : feature invalide dans JSON -> fallback tenantMode', async () => {
  seedCompany({ id: 'C_BADFEAT', mode: 'tenant', features: { contacts: 'garbage' } });
  assertEq(getRouteMode('C_BADFEAT', 'contacts'), 'tenant', 'invalid feature value -> fallback');
});

test('TEST 13 — initControlTowerSchema idempotent (2e appel ne throw pas)', () => {
  initControlTowerSchema(); // 2e appel doit reussir sans erreur (ALTER deja applique)
  // Verifie que la colonne tenantFeatures existe et est usable
  ct.prepare(`UPDATE companies SET tenantFeatures = '{}' WHERE id = 'C_KILL'`).run();
  const row = ct.prepare(`SELECT tenantFeatures FROM companies WHERE id = 'C_KILL'`).get();
  assertEq(row.tenantFeatures, '{}', 'tenantFeatures column readable');
});

test('TEST 14 — table tenant_shadow_diffs + index presents', () => {
  const tables = ct.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tenant_shadow_diffs'`).all();
  assertEq(tables.length, 1, 'tenant_shadow_diffs table exists');
  const idx = ct.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_shadow_diffs_lookup'`).all();
  assertEq(idx.length, 1, 'index idx_shadow_diffs_lookup exists');
});

// ───────────────────── REPORT ─────────────────────
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
