// server/db/test/testTenantMigration.mjs
// Test du moteur de migration (STEP 4) en DRY-RUN avec source DB synthetique.
// - Aucun impact prod
// - Zero dependance reseau
// - Source DB en memoire (ou /tmp) avec schema minimal mais realiste
//
// Lance :
//   CONTROL_TOWER_PATH=/tmp/ct-migtest.db TENANTS_DIR=/tmp/tenants-migtest STORAGE_DIR=/tmp/storage-migtest \
//   node server/db/test/testTenantMigration.mjs
//
// Verifie :
//   1. copyTenantData distingue direct / indirect / skipped / stub
//   2. Tables indirectes 1-hop (bookings via calendarId) copiees
//   3. Tables indirectes 2-hop (reminder_logs via bookingId -> calendarId) copiees
//   4. diffCounts OK pour tous les modes (y compris stub + placeholder)
//   5. validateOrphanFks detecte un orphelin volontaire
//   6. buildParentIdsSubquery reutilise le meme placeholder en profondeur
//   7. STUB companies : 1 ligne seedee dans tenant DB avec id = companyId
//   8. REMAP orphans contacts : placeholder __deleted__ insere + refs remappees
//   9. REMAP orphans collaborators : placeholder __deleted_collab__ + refs remappees

import { rmSync, existsSync, mkdirSync, statSync } from 'fs';
import Database from 'better-sqlite3';

process.env.CONTROL_TOWER_PATH = process.env.CONTROL_TOWER_PATH || '/tmp/ct-migtest.db';
process.env.TENANTS_DIR = process.env.TENANTS_DIR || '/tmp/tenants-migtest';
process.env.STORAGE_DIR = process.env.STORAGE_DIR || '/tmp/storage-migtest';

// Cleanup
for (const p of [
  process.env.CONTROL_TOWER_PATH,
  `${process.env.CONTROL_TOWER_PATH}-wal`,
  `${process.env.CONTROL_TOWER_PATH}-shm`,
]) { try { if (existsSync(p)) rmSync(p); } catch {} }
try { if (existsSync(process.env.TENANTS_DIR)) rmSync(process.env.TENANTS_DIR, { recursive:true, force:true }); } catch {}
if (!existsSync(process.env.TENANTS_DIR)) mkdirSync(process.env.TENANTS_DIR, { recursive: true });

const { initControlTowerSchema } = await import('../controlTowerSchema.js');
const { migrateCompany, buildParentIdsSubquery, validateOrphanFks, remapOrphansForParent } =
  await import('../../services/tenantMigration.js');
const { default: ct } = await import('../controlTower.js');

initControlTowerSchema();

let pass = 0, fail = 0;
const ok = (m) => { console.log('  [OK]', m); pass++; };
const ko = (m, e) => { console.error('  [KO]', m, e?.message || e); fail++; };

// ─── Build source DB synthetique ────────────────────────────────────────
const SRC_PATH = '/tmp/source-migtest.db';
try { if (existsSync(SRC_PATH)) rmSync(SRC_PATH); } catch {}
for (const s of ['-wal','-shm']) { try { if (existsSync(SRC_PATH+s)) rmSync(SRC_PATH+s); } catch {} }

const src = new Database(SRC_PATH);
src.pragma('journal_mode = WAL');
src.pragma('foreign_keys = OFF');

src.exec(`
  -- Tables globales (doivent NE PAS etre migrees)
  CREATE TABLE companies (
    id TEXT PRIMARY KEY, name TEXT, slug TEXT, domain TEXT,
    plan TEXT, contactEmail TEXT, active INTEGER, createdAt TEXT
  );
  CREATE TABLE wa_verifications (id TEXT PRIMARY KEY, phone TEXT);

  -- Tables directes (avec companyId)
  CREATE TABLE collaborators (id TEXT PRIMARY KEY, companyId TEXT, name TEXT);
  CREATE TABLE calendars (id TEXT PRIMARY KEY, companyId TEXT, label TEXT);
  CREATE TABLE roles (id TEXT PRIMARY KEY, companyId TEXT, name TEXT);
  CREATE TABLE tickets (id TEXT PRIMARY KEY, companyId TEXT, title TEXT);
  CREATE TABLE contacts (id TEXT PRIMARY KEY, companyId TEXT, name TEXT);

  -- Tables indirectes 1-hop
  CREATE TABLE availabilities (id TEXT PRIMARY KEY, collaboratorId TEXT, schedule TEXT);
  CREATE TABLE bookings (id TEXT PRIMARY KEY, calendarId TEXT, collaboratorId TEXT, visitorName TEXT);
  CREATE TABLE google_events (id TEXT PRIMARY KEY, collaboratorId TEXT, summary TEXT);
  CREATE TABLE role_permissions (id TEXT PRIMARY KEY, roleId TEXT, permission TEXT);
  CREATE TABLE ticket_messages (id TEXT PRIMARY KEY, ticketId TEXT, message TEXT);

  -- Table indirecte 2-hop (reminder_logs -> bookings -> calendars -> companyId)
  CREATE TABLE reminder_logs (id TEXT PRIMARY KEY, bookingId TEXT, type TEXT);

  -- Table directe AVEC FK implicite vers contacts (cas de remap d'orphelin)
  -- pipeline_history est listee dans IMPLICIT_FKS (contactId -> contacts)
  CREATE TABLE pipeline_history (id TEXT PRIMARY KEY, companyId TEXT, contactId TEXT, status TEXT);

  -- Table directe AVEC FK implicite vers collaborators (cas de remap collaborateur)
  -- collab_heartbeat est listee dans IMPLICIT_FKS (collaboratorId -> collaborators)
  CREATE TABLE collab_heartbeat (id TEXT PRIMARY KEY, companyId TEXT, collaboratorId TEXT, lastSeenAt TEXT);
`);

// ─── Seed : 2 companies, donnees realistes ──────────────────────────────
const C1 = 'c_001'; // cobaye a migrer
const C2 = 'c_002'; // company voisine (ne doit PAS fuiter)

src.prepare(`INSERT INTO companies VALUES (?,?,?,?,?,?,?,?)`)
  .run(C1, 'Acme', 'acme', 'acme.co', 'pro', 'a@acme.co', 1, '2026-01-01');
src.prepare(`INSERT INTO companies VALUES (?,?,?,?,?,?,?,?)`)
  .run(C2, 'Zorg', 'zorg', 'zorg.co', 'pro', 'z@zorg.co', 1, '2026-01-01');

// wa_verifications : global (phone), sans rattachement tenant
src.prepare(`INSERT INTO wa_verifications VALUES (?,?)`).run('w1', '+33600000001');
src.prepare(`INSERT INTO wa_verifications VALUES (?,?)`).run('w2', '+33600000002');

// C1 data (doit etre migree)
src.prepare(`INSERT INTO collaborators VALUES ('col_a1', ?, 'Alice')`).run(C1);
src.prepare(`INSERT INTO collaborators VALUES ('col_a2', ?, 'Bob')`).run(C1);
src.prepare(`INSERT INTO calendars    VALUES ('cal_a1', ?, 'Main')`).run(C1);
src.prepare(`INSERT INTO roles        VALUES ('role_a1', ?, 'admin')`).run(C1);
src.prepare(`INSERT INTO tickets      VALUES ('t_a1', ?, 'Ticket #1')`).run(C1);
src.prepare(`INSERT INTO contacts     VALUES ('ctc_a1', ?, 'Client X')`).run(C1);

// Indirect 1-hop (C1)
src.prepare(`INSERT INTO availabilities    VALUES ('av_1', 'col_a1', 'mon-fri')`).run();
src.prepare(`INSERT INTO bookings          VALUES ('bk_a1', 'cal_a1', 'col_a1', 'John')`).run();
src.prepare(`INSERT INTO bookings          VALUES ('bk_a2', 'cal_a1', 'col_a2', 'Jane')`).run();
src.prepare(`INSERT INTO google_events     VALUES ('ge_1', 'col_a1', 'Weekly sync')`).run();
src.prepare(`INSERT INTO role_permissions  VALUES ('rp_1', 'role_a1', 'read:all')`).run();
src.prepare(`INSERT INTO ticket_messages   VALUES ('tm_1', 't_a1', 'Bonjour')`).run();

// Indirect 2-hop (C1)
src.prepare(`INSERT INTO reminder_logs VALUES ('rl_1', 'bk_a1', 'email')`).run();
src.prepare(`INSERT INTO reminder_logs VALUES ('rl_2', 'bk_a2', 'sms')`).run();

// pipeline_history (C1) : 1 row valide + 2 rows avec contactId orphelin (contact deja supprime source)
src.prepare(`INSERT INTO pipeline_history VALUES ('ph_ok',    ?, 'ctc_a1',      'new')`).run(C1);
src.prepare(`INSERT INTO pipeline_history VALUES ('ph_orph1', ?, 'ctc_GHOST1',  'won')`).run(C1);
src.prepare(`INSERT INTO pipeline_history VALUES ('ph_orph2', ?, 'ctc_GHOST2',  'lost')`).run(C1);

// collab_heartbeat (C1) : 1 row valide + 1 row avec collaboratorId orphelin
src.prepare(`INSERT INTO collab_heartbeat VALUES ('hb_ok',    ?, 'col_a1',        '2026-04-16T10:00:00Z')`).run(C1);
src.prepare(`INSERT INTO collab_heartbeat VALUES ('hb_orph',  ?, 'col_GHOST',     '2026-04-16T10:05:00Z')`).run(C1);

// C2 data : doit NE PAS apparaitre dans la tenant DB de C1
src.prepare(`INSERT INTO collaborators VALUES ('col_z1', ?, 'Zoe')`).run(C2);
src.prepare(`INSERT INTO calendars    VALUES ('cal_z1', ?, 'Other')`).run(C2);
src.prepare(`INSERT INTO bookings     VALUES ('bk_z1', 'cal_z1', 'col_z1', 'Bad leak!')`).run();
src.prepare(`INSERT INTO reminder_logs VALUES ('rl_z1', 'bk_z1', 'email')`).run();

src.close();

// Seed company C1 dans control tower (pre-requis migrateCompany)
ct.prepare(`INSERT INTO companies (id, name, slug, tenantMode, status, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))`)
  .run(C1, 'Acme', 'acme', 'legacy', 'active');

// ─── TEST 1 : buildParentIdsSubquery ────────────────────────────────────
console.log('\n1. buildParentIdsSubquery (recursion + paramCount)');
{
  const r1 = buildParentIdsSubquery('calendars'); // 1-hop
  if (r1.sql.includes('companyId = ?') && r1.paramCount === 1) ok('1-hop: ' + r1.sql + ' paramCount=' + r1.paramCount);
  else ko('1-hop unexpected', JSON.stringify(r1));

  const r2 = buildParentIdsSubquery('bookings'); // 2-hop (indirect -> calendars direct)
  if (r2.sql.includes('SELECT id FROM calendars WHERE companyId = ?') && r2.paramCount === 1) {
    ok('2-hop: ' + r2.sql + ' paramCount=' + r2.paramCount);
  } else ko('2-hop unexpected', JSON.stringify(r2));
}

// ─── TEST 2 : migrateCompany dry-run ────────────────────────────────────
console.log('\n2. migrateCompany(C1) dry-run');
const srcRo = new Database(SRC_PATH, { readonly: true });
srcRo.pragma('query_only = ON');
const report = await migrateCompany(srcRo, C1, { dryRun: true, verbose: false });
srcRo.close();

if (report.ok) ok('migration report.ok=true');
else ko('migration failed', JSON.stringify({ err: report.error, mismatches: report.mismatches, orphans: report.orphans, fk: report.fk }));

if (report.schema && report.schema.tablesCreated > 10) ok(`${report.schema.tablesCreated} tables created in tenant`);
else ko('schema tablesCreated unexpected', JSON.stringify(report.schema));

// ─── TEST 3 : direct + indirect counts via report ───────────────────────
console.log('\n3. Copy report includes direct, indirect 1-hop, indirect 2-hop');
{
  const byTable = new Map(report.copy.map(c => [c.table, c]));
  const expect = [
    { table: 'collaborators',    rows: 2, mode: 'direct' },
    { table: 'calendars',        rows: 1, mode: 'direct' },
    { table: 'contacts',         rows: 1, mode: 'direct' },
    { table: 'pipeline_history', rows: 3, mode: 'direct' }, // 1 valide + 2 orphelins (remappees)
    { table: 'collab_heartbeat', rows: 2, mode: 'direct' }, // 1 valide + 1 orphelin (remappe)
    { table: 'bookings',         rows: 2, mode: 'indirect' }, // 1-hop via calendarId
    { table: 'availabilities',   rows: 1, mode: 'indirect' },
    { table: 'google_events',    rows: 1, mode: 'indirect' },
    { table: 'role_permissions', rows: 1, mode: 'indirect' },
    { table: 'ticket_messages',  rows: 1, mode: 'indirect' },
    { table: 'reminder_logs',    rows: 2, mode: 'indirect' }, // 2-hop via bookingId -> calendars
  ];
  for (const e of expect) {
    const got = byTable.get(e.table);
    if (got && got.rows === e.rows && got.mode === e.mode) {
      ok(`${e.table}: ${got.rows} rows [${got.mode}] ${got.path || ''}`);
    } else {
      ko(`${e.table} expected ${e.rows}/${e.mode}`, got ? JSON.stringify(got) : 'missing from report');
    }
  }
}

// ─── TEST 4 : pas de fuite C2 dans la tenant DB de C1 ───────────────────
console.log('\n4. No C2 leak in C1 tenant DB');
{
  const tdb = new Database(report.tenantDbPath, { readonly: true });
  const leaks = [
    { sql: `SELECT COUNT(*) c FROM bookings       WHERE id='bk_z1'`, label: 'bookings' },
    { sql: `SELECT COUNT(*) c FROM reminder_logs  WHERE id='rl_z1'`, label: 'reminder_logs' },
    { sql: `SELECT COUNT(*) c FROM collaborators  WHERE id='col_z1'`, label: 'collaborators' },
    { sql: `SELECT COUNT(*) c FROM calendars      WHERE id='cal_z1'`, label: 'calendars' },
  ];
  for (const { sql, label } of leaks) {
    const c = tdb.prepare(sql).get().c;
    if (c === 0) ok(`no leak: ${label}`);
    else ko(`LEAK detected: ${label} contient ${c} row(s) de C2`);
  }
  tdb.close();
}

// ─── TEST 5 : diffCounts strict OK ──────────────────────────────────────
console.log('\n5. diffCounts: source == tenant for all tables');
{
  if (report.mismatches.length === 0) ok(`0 mismatches / ${report.diff.length} tables`);
  else ko('mismatches detected', JSON.stringify(report.mismatches));
}

// ─── TEST 6 : validateOrphanFks detecte un orphelin injecte ──────────────
console.log('\n6. validateOrphanFks detects injected orphan');
{
  // On ouvre la tenant DB en ecriture, on insere un booking avec collaboratorId inexistant
  const tdb = new Database(report.tenantDbPath);
  tdb.prepare(`INSERT INTO bookings (id, calendarId, collaboratorId, visitorName) VALUES ('bk_orphan', 'cal_a1', 'col_GHOST', 'GhostUser')`).run();
  const orphans = validateOrphanFks(tdb);
  tdb.close();
  const hit = orphans.find(o => o.child === 'bookings' && o.fk === 'collaboratorId');
  if (hit && hit.count >= 1 && hit.sampleIds.includes('col_GHOST')) {
    ok(`detected: bookings.collaboratorId orphan count=${hit.count} sample=${JSON.stringify(hit.sampleIds)}`);
  } else {
    ko('orphan not detected', JSON.stringify(orphans));
  }
}

// ─── TEST 7 : wa_verifications jamais en tenant DB ──────────────────────
console.log('\n7. wa_verifications not copied to tenant (GLOBAL)');
{
  const tdb = new Database(report.tenantDbPath, { readonly: true });
  const row = tdb.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='wa_verifications'`
  ).get();
  tdb.close();
  if (!row) ok('wa_verifications table NOT present in tenant DB');
  else ko('wa_verifications should not be in tenant DB');
}

// ─── TEST 8 : STUB companies presente dans tenant DB ───────────────────
console.log('\n8. STUB companies: 1 row seedee avec id = companyId');
{
  const tdb = new Database(report.tenantDbPath, { readonly: true });

  const hasTable = tdb.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='companies'`
  ).get();
  if (hasTable) ok('companies table EXISTS in tenant DB (stub structure)');
  else ko('companies table MISSING in tenant DB (stub expected)');

  const count = tdb.prepare(`SELECT COUNT(*) c FROM companies`).get().c;
  if (count === 1) ok(`companies row count = 1 (stub seed)`);
  else ko(`companies row count expected 1, got ${count}`);

  const row = tdb.prepare(`SELECT id, name, slug FROM companies`).get();
  if (row && row.id === C1) ok(`companies.id = '${row.id}' (matches C1), name='${row.name}'`);
  else ko('companies stub row id mismatch', JSON.stringify(row));

  // Verifie aussi l'absence de C2 dans le stub
  const c2 = tdb.prepare(`SELECT COUNT(*) c FROM companies WHERE id = ?`).get(C2).c;
  if (c2 === 0) ok('no C2 leak in companies stub');
  else ko(`C2 leaked into companies stub (${c2} row)`);

  tdb.close();

  if (report.stubs && report.stubs.companies === 1) ok('report.stubs.companies = 1');
  else ko('report.stubs.companies missing or != 1', JSON.stringify(report.stubs));
}

// ─── TEST 9 : REMAP orphans contacts ────────────────────────────────────
console.log('\n9. REMAP orphans contacts: placeholder __deleted__ insere + refs remappees');
{
  const tdb = new Database(report.tenantDbPath, { readonly: true });

  // Placeholder __deleted__ doit exister dans contacts
  const placeholder = tdb.prepare(`SELECT id, name, companyId FROM contacts WHERE id = '__deleted__'`).get();
  if (placeholder && placeholder.companyId === C1) {
    ok(`placeholder contacts.__deleted__ exists (name='${placeholder.name}', companyId=${placeholder.companyId})`);
  } else {
    ko('placeholder __deleted__ missing in contacts', JSON.stringify(placeholder));
  }

  // contacts total = 2 (ctc_a1 + __deleted__)
  const totalContacts = tdb.prepare(`SELECT COUNT(*) c FROM contacts`).get().c;
  if (totalContacts === 2) ok(`contacts count = 2 (1 valide + 1 placeholder)`);
  else ko(`contacts count expected 2, got ${totalContacts}`);

  // pipeline_history : 1 row avec ctc_a1, 2 rows avec __deleted__
  const valid = tdb.prepare(`SELECT COUNT(*) c FROM pipeline_history WHERE contactId = 'ctc_a1'`).get().c;
  const remapped = tdb.prepare(`SELECT COUNT(*) c FROM pipeline_history WHERE contactId = '__deleted__'`).get().c;
  const ghosts = tdb.prepare(`SELECT COUNT(*) c FROM pipeline_history WHERE contactId IN ('ctc_GHOST1', 'ctc_GHOST2')`).get().c;
  if (valid === 1) ok(`pipeline_history valid rows preserved (ctc_a1 count=${valid})`);
  else ko(`pipeline_history ctc_a1 count expected 1, got ${valid}`);
  if (remapped === 2) ok(`pipeline_history orphan rows remapped to __deleted__ (count=${remapped})`);
  else ko(`pipeline_history remapped count expected 2, got ${remapped}`);
  if (ghosts === 0) ok('no ghost contactIds remain in pipeline_history');
  else ko(`${ghosts} ghost contactIds still in pipeline_history`);

  tdb.close();

  // report.remap structure
  if (report.remap && report.remap.contacts && report.remap.contacts.placeholderInserted === true) {
    ok('report.remap.contacts.placeholderInserted = true');
  } else {
    ko('report.remap.contacts.placeholderInserted missing', JSON.stringify(report.remap));
  }
  if (report.remap && report.remap.contacts && report.remap.contacts.remapped.pipeline_history === 2) {
    ok('report.remap.contacts.remapped.pipeline_history = 2');
  } else {
    ko('remap count pipeline_history != 2', JSON.stringify(report.remap?.contacts?.remapped));
  }

  // 0 orphans apres remap (report.orphans doit etre vide)
  if (report.orphans && report.orphans.length === 0) {
    ok('report.orphans.length = 0 post-remap');
  } else {
    ko('orphans subsistent post-remap', JSON.stringify(report.orphans));
  }
}

// ─── TEST 10 : remapOrphansForParent idempotent (2e appel = no-op) ─────
console.log('\n10. remapOrphansForParent idempotent (2e appel = no-op)');
{
  const tdb = new Database(report.tenantDbPath);
  const r = remapOrphansForParent(tdb, C1, 'contacts', '__deleted__', { name: '[Contact supprime]' }, false);
  tdb.close();
  if (r.placeholderInserted === false && Object.keys(r.remapped).length === 0) {
    ok(`idempotent: no placeholder reinserted, 0 remap (detected=${Object.keys(r.detected).length})`);
  } else {
    ko('2e appel remap non idempotent', JSON.stringify(r));
  }
}

// ─── TEST 11 : REMAP orphans collaborators ──────────────────────────────
console.log('\n11. REMAP orphans collaborators: placeholder __deleted_collab__ + refs remappees');
{
  const tdb = new Database(report.tenantDbPath, { readonly: true });

  const placeholder = tdb.prepare(`SELECT id, name, companyId FROM collaborators WHERE id = '__deleted_collab__'`).get();
  if (placeholder && placeholder.companyId === C1) {
    ok(`placeholder collaborators.__deleted_collab__ exists (name='${placeholder.name}', companyId=${placeholder.companyId})`);
  } else {
    ko('placeholder __deleted_collab__ missing in collaborators', JSON.stringify(placeholder));
  }

  // collaborators total = 3 (col_a1 + col_a2 + __deleted_collab__)
  const totalCollabs = tdb.prepare(`SELECT COUNT(*) c FROM collaborators`).get().c;
  if (totalCollabs === 3) ok(`collaborators count = 3 (2 valides + 1 placeholder)`);
  else ko(`collaborators count expected 3, got ${totalCollabs}`);

  // collab_heartbeat : 1 row valide (col_a1) + 1 row remappe (__deleted_collab__)
  const hbValid = tdb.prepare(`SELECT COUNT(*) c FROM collab_heartbeat WHERE collaboratorId = 'col_a1'`).get().c;
  const hbRemapped = tdb.prepare(`SELECT COUNT(*) c FROM collab_heartbeat WHERE collaboratorId = '__deleted_collab__'`).get().c;
  const hbGhost = tdb.prepare(`SELECT COUNT(*) c FROM collab_heartbeat WHERE collaboratorId = 'col_GHOST'`).get().c;
  if (hbValid === 1) ok(`collab_heartbeat valid row preserved (col_a1 count=${hbValid})`);
  else ko(`collab_heartbeat col_a1 count expected 1, got ${hbValid}`);
  if (hbRemapped === 1) ok(`collab_heartbeat orphan row remapped to __deleted_collab__ (count=${hbRemapped})`);
  else ko(`collab_heartbeat remapped count expected 1, got ${hbRemapped}`);
  if (hbGhost === 0) ok('no ghost collaboratorId remains in collab_heartbeat');
  else ko(`${hbGhost} ghost collaboratorId still in collab_heartbeat`);

  tdb.close();

  if (report.remap && report.remap.collaborators && report.remap.collaborators.placeholderInserted === true) {
    ok('report.remap.collaborators.placeholderInserted = true');
  } else {
    ko('report.remap.collaborators.placeholderInserted missing', JSON.stringify(report.remap?.collaborators));
  }
  if (report.remap && report.remap.collaborators && report.remap.collaborators.remapped.collab_heartbeat === 1) {
    ok('report.remap.collaborators.remapped.collab_heartbeat = 1');
  } else {
    ko('remap count collab_heartbeat != 1', JSON.stringify(report.remap?.collaborators?.remapped));
  }
}

// ─── TEST 12 : control tower unchanged (dry-run) ─────────────────────────
console.log('\n12. Control tower: tenant_databases unchanged in dry-run');
{
  const td = ct.prepare(`SELECT COUNT(*) c FROM tenant_databases WHERE companyId = ?`).get(C1).c;
  if (td === 0) ok('tenant_databases NOT written in dry-run');
  else ko('tenant_databases polluted in dry-run', td);
}

try { ct.close(); } catch {}

console.log(`\n═══ RESULT : ${pass} passed, ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
