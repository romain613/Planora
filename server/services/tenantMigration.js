// server/services/tenantMigration.js
// Migration d'une entreprise depuis la monolithe vers une tenant DB dediee.
// - Dry-run par defaut (creation DB temporaire + verification, pas d'ecriture control tower)
// - PRAGMA foreign_keys OFF pendant tout le flow, ON a la fin puis foreign_key_check
// - Diff counts strict (inclut stubs + placeholders + tables indirectes)
// - Stubs : tables GLOBAL (companies) repliquees minimalement pour satisfaire FK
// - Remap orphans : contact placeholder __deleted__ pour preserver l'historique
// - Validation FK implicites (PRAGMA ne les voit pas)
// - Rollback : suppression du fichier tenant.db si echec
//
// N'EST PAS BRANCHEE AU RUNTIME. Appelee uniquement par scripts CLI.

import Database from 'better-sqlite3';
import { existsSync, unlinkSync, statSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import {
  initTenantSchemaFromSource,
  listTenantTables,
  GLOBAL_TABLES,
  TENANT_STUB_TABLES,
  INDIRECT_TENANT_TABLES,
  IMPLICIT_FKS,
} from '../db/tenantSchema.js';
import { defaultDbPathFor, defaultStoragePathFor, invalidateTenant } from '../db/tenantResolver.js';
import ct from '../db/controlTower.js';

/**
 * Parents scope tenant dont les enfants (via IMPLICIT_FKS) peuvent avoir des refs orphelines.
 * Pour chacun : un placeholder est insere SI ET SEULEMENT SI des orphans sont detectes,
 * puis les refs orphelines sont UPDATE vers ce placeholder. Idempotent (2e passe = no-op).
 * Ajouter un parent ici suffit a etendre la protection.
 *
 * Scan 2026-04-16 + dry-run MON BILAN :
 *   - contacts       : refs orphelines dans call_logs, pipeline_history, notifications, sms_messages, conversations, etc.
 *   - collaborators  : refs orphelines dans collab_heartbeat (au moins sur MON BILAN)
 */
const REMAP_PARENTS = [
  { parent: 'contacts',      placeholderId: '__deleted__',        extras: { name: '[Contact supprime]' } },
  { parent: 'collaborators', placeholderId: '__deleted_collab__', extras: { name: '[Collaborateur supprime]' } },
];

/**
 * Verifie qu'une table contient bien une colonne companyId.
 */
function tableHasCompanyId(sourceDb, table) {
  const cols = sourceDb.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === 'companyId');
}

/**
 * Construit la sous-requete SQL qui retourne les IDs du parent appartenant a companyId,
 * en traversant recursivement la chaine INDIRECT_TENANT_TABLES si besoin.
 * @returns {{ sql: string, paramCount: number }}
 */
export function buildParentIdsSubquery(parent) {
  if (INDIRECT_TENANT_TABLES.has(parent)) {
    const { fk, parent: grandparent } = INDIRECT_TENANT_TABLES.get(parent);
    const inner = buildParentIdsSubquery(grandparent);
    return {
      sql: `SELECT id FROM ${parent} WHERE ${fk} IN (${inner.sql})`,
      paramCount: inner.paramCount,
    };
  }
  return {
    sql: `SELECT id FROM ${parent} WHERE companyId = ?`,
    paramCount: 1,
  };
}

/**
 * Construit un report d'erreur garanti complet (meme shape que le report reussi).
 * Evite NaN / undefined cote CLI.
 */
function buildErrorReport({ companyId, company, tenantDbPath, dryRun, currentStep, startedAt, error, stack, extra = {} }) {
  return {
    ok: false,
    dryRun: !!dryRun,
    companyId,
    companyName: company?.name || null,
    companySlug: company?.slug || null,
    tenantDbPath: tenantDbPath || null,
    sizeBytes: 0,
    elapsedMs: startedAt ? (Date.now() - startedAt) : 0,
    currentStep: currentStep || 'init',
    error: error || 'UNKNOWN_ERROR',
    stack: stack || null,
    schema: null,
    stubs: null,
    copy: null,
    remap: null,
    fk: null,
    orphans: null,
    diff: null,
    mismatches: null,
    ...extra,
  };
}

/**
 * Migre une company depuis la monolithe vers une tenant DB.
 * Flow : schema -> stubs -> copy -> remap orphans -> FK ON -> checks -> diff.
 */
export async function migrateCompany(sourceDb, companyId, opts = {}) {
  const { dryRun = true, verbose = true } = opts;
  const startedAt = Date.now();
  const log = (...a) => verbose && console.log('[MIGRATE]', ...a);

  // Tracker d'etape, utile pour diagnostiquer en cas d'exception
  let currentStep = 'sanity';
  let company = null;
  let tenantDbPath = null;
  let tenantDb = null;

  // 1. Sanity : company existe
  try {
    company = sourceDb.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  } catch (e) {
    return buildErrorReport({
      companyId, company: null, tenantDbPath: null, dryRun,
      currentStep, startedAt,
      error: 'SANITY_QUERY_FAILED: ' + e.message, stack: e.stack,
    });
  }
  if (!company) {
    return buildErrorReport({
      companyId, company: null, tenantDbPath: null, dryRun,
      currentStep, startedAt,
      error: `COMPANY_NOT_FOUND (source DB has no row with id='${companyId}')`,
    });
  }
  log('Company:', company.name, '(id=' + companyId + ', slug=' + company.slug + ')');

  // 2. Determination du chemin tenant DB
  currentStep = 'resolve_tenant_path';
  try {
    tenantDbPath = opts.tenantDbPath || defaultDbPathFor(companyId);
    const tenantDir = dirname(tenantDbPath);
    if (!existsSync(tenantDir)) mkdirSync(tenantDir, { recursive: true });
  } catch (e) {
    return buildErrorReport({
      companyId, company, tenantDbPath, dryRun,
      currentStep, startedAt,
      error: 'TENANT_PATH_RESOLUTION_FAILED: ' + e.message, stack: e.stack,
    });
  }

  // 3. Gestion des artifacts preexistants (dry-run d'une session precedente)
  currentStep = 'preexisting_artifact_check';
  if (existsSync(tenantDbPath)) {
    // Si le companyId est DEJA committe en control tower, on refuse d'ecraser.
    // Sinon (leftover de dry-run ou commit abortee), on nettoie et on continue.
    let alreadyCommitted = null;
    try {
      alreadyCommitted = ct.prepare('SELECT companyId FROM tenant_databases WHERE companyId = ?').get(companyId);
    } catch (e) {
      // Control tower inaccessible : on ne peut pas trancher, on refuse par prudence
      return buildErrorReport({
        companyId, company, tenantDbPath, dryRun,
        currentStep, startedAt,
        error: 'CONTROL_TOWER_LOOKUP_FAILED: ' + e.message, stack: e.stack,
        extra: { hint: 'Cannot decide if existing tenant DB is a committed tenant or a dry-run leftover.' },
      });
    }

    if (alreadyCommitted && !dryRun) {
      return buildErrorReport({
        companyId, company, tenantDbPath, dryRun,
        currentStep, startedAt,
        error: 'TENANT_ALREADY_COMMITTED',
        extra: {
          hint: `companyId='${companyId}' is already registered in tenant_databases. Run --rollback first if you want to re-commit.`,
          tenantDbPath,
        },
      });
    }

    // Safe a nettoyer : soit dry-run (ancien comportement), soit commit apres dry-run sans CT entry
    log('Cleanup preexisting tenant artifacts (uncommitted leftover):', tenantDbPath);
    for (const suffix of ['', '-wal', '-shm']) {
      const p = tenantDbPath + suffix;
      try { if (existsSync(p)) unlinkSync(p); } catch {}
    }
  }

  // 4. Open tenant DB
  currentStep = 'open_tenant_db';
  try {
    tenantDb = new Database(tenantDbPath);
    tenantDb.pragma('journal_mode = WAL');
    tenantDb.pragma('busy_timeout = 5000');
    // FK OFF pendant TOUT le flow de migration. Reactivees en fin, juste avant les checks.
    tenantDb.pragma('foreign_keys = OFF');
  } catch (e) {
    return buildErrorReport({
      companyId, company, tenantDbPath, dryRun,
      currentStep, startedAt,
      error: 'OPEN_TENANT_DB_FAILED: ' + e.message, stack: e.stack,
    });
  }

  let schemaReport = null, stubReport = null, copyReport = null,
      remapReport = null, fkReport = null, orphanReport = null, diffReport = null;
  let mismatches = null;
  let ok = false;
  let sizeBytes = 0;
  let report = null;

  try {
    // 5. Creation du schema tenant (mirror source + stubs inclus)
    currentStep = 'schema_init';
    log('Creating tenant schema (+ stubs)...');
    schemaReport = initTenantSchemaFromSource(sourceDb, tenantDb);
    log(`  ${schemaReport.tablesCreated} tables + ${schemaReport.indexesCreated} indexes created`);
    // Note : initTenantSchemaFromSource termine par `foreign_keys = ON`.
    // On re-force OFF pour le seed + copy.
    tenantDb.pragma('foreign_keys = OFF');

    // 6. Seed stubs (1 ligne par stub table, ex: companies avec id=tenant)
    currentStep = 'seed_stubs';
    log('Seeding stub tables...');
    stubReport = seedTenantStubs(sourceDb, tenantDb, companyId, verbose);
    log(`  stubs seeded: ${JSON.stringify(stubReport)}`);

    // 7. Copie des donnees (skip stubs + handle direct/indirect)
    currentStep = 'copy_data';
    copyReport = copyTenantData(sourceDb, tenantDb, companyId, schemaReport.migrationOrder, verbose);

    // 8. Remap orphans (preserve historique : placeholder + UPDATE refs)
    currentStep = 'remap_orphans';
    log('Checking orphan refs for each remap-managed parent...');
    remapReport = {};
    for (const { parent, placeholderId, extras } of REMAP_PARENTS) {
      const r = remapOrphansForParent(
        tenantDb, companyId, parent, placeholderId, extras, verbose
      );
      remapReport[parent] = r;
      if (r.placeholderInserted) {
        const total = Object.values(r.remapped).reduce((s, n) => s + n, 0);
        log(`  ${parent} placeholder '${placeholderId}' inserted. Remapped ${total} refs across ${Object.keys(r.remapped).length} tables`);
      } else {
        log(`  no orphan ${parent}, no placeholder needed`);
      }
    }

    // 9. FK ON + foreign_key_check (declared FKs)
    currentStep = 'fk_check';
    tenantDb.pragma('foreign_keys = ON');
    const fkViolations = tenantDb.pragma('foreign_key_check');
    const integrityRows = tenantDb.pragma('integrity_check');
    fkReport = {
      violations: fkViolations,
      integrity: integrityRows[0]?.integrity_check || 'unknown',
    };
    log(`  FK declared violations: ${fkViolations.length}, integrity: ${fkReport.integrity}`);

    // 10. Validation orphan FK implicites (apres remap, doit etre 0)
    currentStep = 'validate_orphan_fks';
    orphanReport = validateOrphanFks(tenantDb);
    log(`  FK implicit orphans (post-remap): ${orphanReport.length}`);

    // 11. Diff counts (adjust pour stubs + placeholders)
    currentStep = 'diff_counts';
    diffReport = diffCounts(sourceDb, tenantDb, companyId, schemaReport.migrationOrder, {
      stubReport,
      remapReport,
    });
    mismatches = diffReport.filter(d => d.diff !== 0);
    log(`  Count diff: ${mismatches.length} mismatches / ${diffReport.length} tables`);

    ok =
      fkViolations.length === 0 &&
      fkReport.integrity === 'ok' &&
      mismatches.length === 0 &&
      orphanReport.length === 0;

    sizeBytes = existsSync(tenantDbPath) ? statSync(tenantDbPath).size : 0;

    // Ferme tenant DB avant les writes control tower (evite locks croises)
    currentStep = 'close_tenant_db';
    try { tenantDb.close(); } catch (e) { log('warn: close tenant DB failed:', e.message); }
    tenantDb = null;
  } catch (e) {
    // Exception pendant la phase migration : on ferme, on nettoie, on retourne un report complet.
    try { if (tenantDb) tenantDb.close(); } catch {}
    tenantDb = null;
    for (const suffix of ['', '-wal', '-shm']) {
      const p = tenantDbPath + suffix;
      try { if (existsSync(p)) unlinkSync(p); } catch {}
    }
    return buildErrorReport({
      companyId, company, tenantDbPath, dryRun,
      currentStep, startedAt,
      error: `MIGRATION_STEP_FAILED[${currentStep}]: ${e.message}`,
      stack: e.stack,
      extra: {
        schema: schemaReport,
        stubs: stubReport,
        copy: copyReport,
        remap: remapReport,
        fk: fkReport,
        orphans: orphanReport,
        diff: diffReport,
        mismatches,
      },
    });
  }

  // Report de migration (toujours garanti, meme si commit write va throw)
  report = {
    ok,
    dryRun,
    companyId,
    companyName: company.name,
    companySlug: company.slug,
    tenantDbPath,
    sizeBytes,
    elapsedMs: Date.now() - startedAt,
    currentStep: 'migration_done',
    schema: schemaReport,
    stubs: stubReport,
    copy: copyReport,
    remap: remapReport,
    fk: fkReport,
    orphans: orphanReport,
    diff: diffReport,
    mismatches,
  };

  // 12. Commit / keep / rollback — branche isolee avec son propre try/catch
  if (dryRun) {
    log('DRY RUN complete. Keeping tenant DB for inspection:', tenantDbPath);
    return report;
  }

  if (!ok) {
    // Commit impossible : migration echouee. On nettoie le fichier tenant.
    log('COMMIT ABORTED (migration ok=false). Rolling back tenant DB file.');
    for (const suffix of ['', '-wal', '-shm']) {
      const p = tenantDbPath + suffix;
      try { if (existsSync(p)) unlinkSync(p); } catch {}
    }
    report.commit = { attempted: false, reason: 'migration_not_ok' };
    report.elapsedMs = Date.now() - startedAt;
    return report;
  }

  // Commit write : control tower. Try/catch isole pour preserver le report migration si ca casse.
  currentStep = 'commit_control_tower';
  try {
    const storagePath = defaultStoragePathFor(companyId);
    ct.prepare(`
      INSERT OR REPLACE INTO tenant_databases
        (companyId, dbPath, storagePath, schemaVersion, provisionedAt, lastMigrationAt, sizeBytes, lastIntegrityCheck, lastIntegrityStatus)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'), ?, datetime('now'), 'ok')
    `).run(companyId, tenantDbPath, storagePath, sizeBytes);
    ct.prepare(`
      INSERT INTO tenant_status_history
        (companyId, previousMode, newMode, reason, actor, changedAt)
      VALUES (?, 'legacy', 'legacy', 'pilot-migration-commit', 'script', datetime('now'))
    `).run(companyId);
    invalidateTenant(companyId);
    log('Control tower registered. Tenant mode STILL = legacy (no cutover).');
    report.commit = { attempted: true, ok: true, storagePath };
    report.elapsedMs = Date.now() - startedAt;
    return report;
  } catch (e) {
    // Commit write a echoue : on conserve la tenant DB (elle est saine) pour diagnostic,
    // mais on rapporte l'echec. Le report migration reste visible.
    report.ok = false;
    report.error = `COMMIT_WRITE_FAILED[${currentStep}]: ${e.message}`;
    report.stack = e.stack;
    report.currentStep = currentStep;
    report.commit = { attempted: true, ok: false, error: e.message };
    report.elapsedMs = Date.now() - startedAt;
    log('COMMIT WRITE FAILED (migration report preserved):', e.message);
    return report;
  }
}

/**
 * Seed des tables STUB dans la tenant DB.
 * Pour chaque stub : copie de la ligne matching companyId depuis la source.
 * Actuellement une seule : companies (filtrage par id = companyId).
 */
function seedTenantStubs(sourceDb, tenantDb, companyId, verbose) {
  const report = {};
  const seed = tenantDb.transaction(() => {
    for (const table of TENANT_STUB_TABLES) {
      let row;
      if (table === 'companies') {
        row = sourceDb.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId);
        if (!row) {
          throw new Error(`Cannot seed stub '${table}': row not found in source for companyId=${companyId}`);
        }
      } else {
        throw new Error(`Unknown stub table: ${table}. Add explicit handling in seedTenantStubs.`);
      }
      const cols = Object.keys(row);
      const quotedCols = cols.map(c => `"${c}"`).join(',');
      const placeholders = cols.map(() => '?').join(',');
      tenantDb.prepare(`INSERT INTO ${table} (${quotedCols}) VALUES (${placeholders})`)
        .run(...cols.map(c => row[c]));
      report[table] = 1;
      if (verbose) console.log(`[MIGRATE]   stub ${table}: 1 row seeded`);
    }
  });
  seed();
  return report;
}

/**
 * Copie les donnees d'une company dans la tenant DB, dans l'ordre topologique.
 * 4 cas :
 *   A. Table STUB (companies) -> SKIP (deja seedee par seedTenantStubs)
 *   B. Table avec companyId -> filtre direct WHERE companyId = ?
 *   C. Table indirecte -> sous-requete sur parent (recursive si 2+hop)
 *   D. Table sans companyId et hors INDIRECT -> SKIP avec warning explicite
 */
function copyTenantData(sourceDb, tenantDb, companyId, migrationOrder, verbose) {
  const report = [];
  const copy = tenantDb.transaction(() => {
    for (const table of migrationOrder) {
      if (GLOBAL_TABLES.has(table) && !TENANT_STUB_TABLES.has(table)) continue;

      if (TENANT_STUB_TABLES.has(table)) {
        report.push({ table, rows: 1, mode: 'stub', path: `${table} (seeded stub)` });
        continue;
      }

      let rows;
      let mode;
      let path;

      if (tableHasCompanyId(sourceDb, table)) {
        mode = 'direct';
        path = `${table}.companyId`;
        rows = sourceDb.prepare(`SELECT * FROM ${table} WHERE companyId = ?`).all(companyId);
      } else if (INDIRECT_TENANT_TABLES.has(table)) {
        const { fk, parent } = INDIRECT_TENANT_TABLES.get(table);
        const { sql: innerSql, paramCount } = buildParentIdsSubquery(parent);
        const fullSql = `SELECT * FROM ${table} WHERE ${fk} IN (${innerSql})`;
        const params = Array(paramCount).fill(companyId);
        mode = 'indirect';
        path = `${table}.${fk} -> ${parent}${INDIRECT_TENANT_TABLES.has(parent) ? ' (multi-hop)' : ''}`;
        rows = sourceDb.prepare(fullSql).all(...params);
      } else {
        report.push({ table, rows: 0, mode: 'skipped', note: 'no_companyId_and_not_indirect' });
        if (verbose) console.warn(`[MIGRATE]   ${table}: SKIPPED (no companyId, not in INDIRECT_TENANT_TABLES)`);
        continue;
      }

      if (!rows.length) {
        report.push({ table, rows: 0, mode, path });
        continue;
      }
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => '?').join(',');
      const ins = tenantDb.prepare(
        `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`
      );
      for (const r of rows) {
        ins.run(...cols.map(c => r[c]));
      }
      report.push({ table, rows: rows.length, mode, path });
      if (verbose && rows.length > 0) {
        console.log(`[MIGRATE]   ${table}: ${rows.length} rows  [${mode}]  ${path}`);
      }
    }
  });
  copy();
  return report;
}

/**
 * Helper : insere une ligne placeholder dans `table` avec les colonnes fournies + defaults
 * pour les colonnes NOT NULL sans valeur par defaut.
 */
function insertPlaceholderRow(tenantDb, table, provided) {
  const cols = tenantDb.prepare(`PRAGMA table_info(${table})`).all();
  const insertCols = [];
  const insertVals = [];

  for (const col of cols) {
    if (Object.prototype.hasOwnProperty.call(provided, col.name)) {
      insertCols.push(col.name);
      insertVals.push(provided[col.name]);
    } else if (col.notnull && col.dflt_value === null && col.pk === 0) {
      // Colonne obligatoire sans defaut : on fournit une valeur neutre selon le type
      insertCols.push(col.name);
      const type = (col.type || '').toUpperCase();
      if (/INT/.test(type)) insertVals.push(0);
      else if (/REAL|NUMERIC|FLOAT|DOUBLE/.test(type)) insertVals.push(0);
      else if (/BLOB/.test(type)) insertVals.push(Buffer.alloc(0));
      else insertVals.push(''); // TEXT / defaut
    }
    // Colonnes nullable non fournies : on les laisse NULL (rien a inserer)
  }

  const quotedCols = insertCols.map(c => `"${c}"`).join(',');
  const ph = insertCols.map(() => '?').join(',');
  tenantDb.prepare(`INSERT INTO ${table} (${quotedCols}) VALUES (${ph})`).run(...insertVals);
}

/**
 * Detecte les orphelins pour un parent donne (ex: contacts), insere un placeholder
 * si necessaire, puis UPDATE les refs orphelines dans toutes les tables enfants
 * (derivees automatiquement de IMPLICIT_FKS).
 *
 * @returns {{ placeholderInserted: boolean, parent: string, placeholderId: string, remapped: Object<string,number> }}
 */
export function remapOrphansForParent(tenantDb, companyId, parent, placeholderId, extras, verbose) {
  const children = IMPLICIT_FKS.filter(f => f.parent === parent);

  const tablesPresent = new Set(
    tenantDb.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name)
  );

  // Detection
  const detected = {};
  let hasOrphan = false;
  for (const { child, fk } of children) {
    if (!tablesPresent.has(child)) continue;
    const childCols = tenantDb.prepare(`PRAGMA table_info(${child})`).all();
    if (!childCols.some(c => c.name === fk)) continue;
    const count = tenantDb.prepare(
      `SELECT COUNT(*) c FROM ${child}
       WHERE ${fk} IS NOT NULL
         AND ${fk} NOT IN (SELECT id FROM ${parent})`
    ).get().c;
    if (count > 0) {
      hasOrphan = true;
      detected[child] = count;
    }
  }

  if (!hasOrphan) {
    return { placeholderInserted: false, parent, placeholderId, remapped: {}, detected: {} };
  }

  // Insert placeholder
  const providedBase = { id: placeholderId, companyId, ...extras };
  insertPlaceholderRow(tenantDb, parent, providedBase);
  if (verbose) console.log(`[MIGRATE]   placeholder inserted: ${parent}.id='${placeholderId}'`);

  // Remap orphans -> placeholder
  const remapped = {};
  for (const { child, fk } of children) {
    if (!tablesPresent.has(child)) continue;
    const childCols = tenantDb.prepare(`PRAGMA table_info(${child})`).all();
    if (!childCols.some(c => c.name === fk)) continue;
    const info = tenantDb.prepare(
      `UPDATE ${child} SET ${fk} = ?
       WHERE ${fk} IS NOT NULL
         AND ${fk} NOT IN (SELECT id FROM ${parent})`
    ).run(placeholderId);
    if (info.changes > 0) {
      remapped[child] = info.changes;
      if (verbose) console.log(`[MIGRATE]   remap ${child}.${fk}: ${info.changes} orphans -> '${placeholderId}'`);
    }
  }

  return { placeholderInserted: true, parent, placeholderId, remapped, detected };
}

/**
 * Compare les counts source vs tenant table par table.
 * Ajustements :
 *   - stubs : source filtre par id = companyId (une ligne attendue)
 *   - placeholders : soustrait +1 au count tenant pour retrouver la parite
 */
function diffCounts(sourceDb, tenantDb, companyId, migrationOrder, context = {}) {
  const out = [];
  const { stubReport = {}, remapReport = {} } = context;

  // Construit la map des placeholders par table parent
  const placeholderByTable = new Map();
  for (const [, r] of Object.entries(remapReport)) {
    if (r && r.placeholderInserted) placeholderByTable.set(r.parent, 1);
  }

  for (const table of migrationOrder) {
    if (GLOBAL_TABLES.has(table) && !TENANT_STUB_TABLES.has(table)) continue;

    let src;
    let mode;

    if (TENANT_STUB_TABLES.has(table)) {
      // Stub : on attend exactement 1 ligne dans tenant, correspondant au companyId
      mode = 'stub';
      if (table === 'companies') {
        src = sourceDb.prepare(`SELECT COUNT(*) c FROM companies WHERE id = ?`).get(companyId).c;
      } else {
        src = 1; // fallback neutre
      }
      const tgt = tenantDb.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;
      out.push({ table, source: src, tenant: tgt, diff: src - tgt, mode });
      continue;
    }

    if (tableHasCompanyId(sourceDb, table)) {
      mode = 'direct';
      src = sourceDb.prepare(`SELECT COUNT(*) c FROM ${table} WHERE companyId = ?`).get(companyId).c;
    } else if (INDIRECT_TENANT_TABLES.has(table)) {
      const { fk, parent } = INDIRECT_TENANT_TABLES.get(table);
      const { sql: innerSql, paramCount } = buildParentIdsSubquery(parent);
      const fullSql = `SELECT COUNT(*) c FROM ${table} WHERE ${fk} IN (${innerSql})`;
      const params = Array(paramCount).fill(companyId);
      mode = 'indirect';
      src = sourceDb.prepare(fullSql).get(...params).c;
    } else {
      continue;
    }

    const rawTgt = tenantDb.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;
    const placeholderAdj = placeholderByTable.get(table) || 0;
    const tgt = rawTgt - placeholderAdj; // on enleve la ligne placeholder eventuelle
    out.push({
      table,
      source: src,
      tenant: tgt,
      diff: src - tgt,
      mode,
      ...(placeholderAdj ? { placeholderAdj } : {}),
    });
  }
  return out;
}

/**
 * Valide les FK IMPLICITES (non declarees). PRAGMA foreign_key_check ne les voit pas.
 * S'execute APRES le remap orphans : les FK vers contacts doivent etre resolues
 * (0 orphan attendu apres remap). Si des orphans subsistent vers d'autres parents
 * (collaborators, calendars, etc.), ils sont rapportes et bloquent `ok = true`.
 */
export function validateOrphanFks(tenantDb) {
  const orphans = [];
  const tablesRows = tenantDb.prepare(
    `SELECT name FROM sqlite_master WHERE type='table'`
  ).all();
  const tables = new Set(tablesRows.map(r => r.name));

  for (const { child, fk, parent } of IMPLICIT_FKS) {
    if (!tables.has(child) || !tables.has(parent)) continue;
    try {
      const childCols = tenantDb.prepare(`PRAGMA table_info(${child})`).all();
      if (!childCols.some(c => c.name === fk)) continue;
      const parentCols = tenantDb.prepare(`PRAGMA table_info(${parent})`).all();
      if (!parentCols.some(c => c.name === 'id')) continue;

      const row = tenantDb.prepare(
        `SELECT COUNT(*) c FROM ${child}
         WHERE ${fk} IS NOT NULL
           AND ${fk} NOT IN (SELECT id FROM ${parent})`
      ).get();
      if (row.c > 0) {
        const sample = tenantDb.prepare(
          `SELECT ${fk} FROM ${child}
           WHERE ${fk} IS NOT NULL
             AND ${fk} NOT IN (SELECT id FROM ${parent})
           LIMIT 5`
        ).all().map(r => r[fk]);
        orphans.push({ child, fk, parent, count: row.c, sampleIds: sample });
      }
    } catch (e) {
      orphans.push({ child, fk, parent, error: e.message });
    }
  }
  return orphans;
}

/**
 * Rollback pilote : supprime la tenant DB + les lignes control tower associees.
 */
export function rollbackPilot(companyId, tenantDbPath) {
  const p = tenantDbPath || defaultDbPathFor(companyId);
  for (const suffix of ['', '-wal', '-shm']) {
    const f = p + suffix;
    try { if (existsSync(f)) unlinkSync(f); } catch {}
  }
  ct.prepare(`DELETE FROM tenant_databases WHERE companyId = ?`).run(companyId);
  ct.prepare(`
    INSERT INTO tenant_status_history (companyId, newMode, reason, actor, changedAt)
    VALUES (?, 'legacy', 'pilot-rollback', 'script', datetime('now'))
  `).run(companyId);
  invalidateTenant(companyId);
  return { ok: true, rolledBack: p };
}
