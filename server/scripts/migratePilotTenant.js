#!/usr/bin/env node
// server/scripts/migratePilotTenant.js
// CLI pilote de migration — 1 seule entreprise a la fois.
//
// Usage :
//   node server/scripts/migratePilotTenant.js <companyId> --dry-run
//   node server/scripts/migratePilotTenant.js <companyId> --commit
//   node server/scripts/migratePilotTenant.js <companyId> --rollback
//   node server/scripts/migratePilotTenant.js --list
//
// Variables d'environnement utiles (defaults conservateurs pour local) :
//   SOURCE_DB_PATH       (defaut : server/db/calendar360.db OU DB_PATH env)
//   CONTROL_TOWER_PATH   (defaut : /var/www/planora-data/control_tower.db)
//   TENANTS_DIR          (defaut : /var/www/planora-data/tenants)
//
// IMPORTANT :
//   - --dry-run n'ecrit RIEN en control tower, cree la tenant DB pour inspection puis tu peux la detruire
//   - --commit n'ecrit PAS le flag tenantMode='tenant' (pas de cutover). Il inscrit juste tenant_databases.
//   - --rollback supprime la tenant DB + la ligne tenant_databases (ne touche pas aux donnees source)
//
// La monolithe source n'est JAMAIS modifiee. Read-only.

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);

function usage() {
  console.log(`Usage:
  node server/scripts/migratePilotTenant.js <companyId> --dry-run
  node server/scripts/migratePilotTenant.js <companyId> --commit
  node server/scripts/migratePilotTenant.js <companyId> --rollback
  node server/scripts/migratePilotTenant.js --list

Flags:
  --dry-run       Cree la tenant DB en local, verifie integrite + diff counts, n'inscrit rien en control tower
  --commit        Meme chose + inscrit la ligne tenant_databases. tenantMode reste 'legacy' (pas de cutover).
  --rollback      Supprime la tenant DB et la ligne tenant_databases.
  --list          Liste toutes les companies + leur tenantMode actuel.

Env:
  SOURCE_DB_PATH       chemin vers la monolithe source (read-only)
  CONTROL_TOWER_PATH   chemin vers control_tower.db
  TENANTS_DIR          dossier des tenant DBs
`);
}

if (!args.length || args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}

// ─── RESOLVE SOURCE DB PATH ────────────────────────────────────────────
const SOURCE_DB_PATH = process.env.SOURCE_DB_PATH
  || process.env.DB_PATH
  || resolve(__dirname, '..', 'db', 'calendar360.db');

if (!existsSync(SOURCE_DB_PATH)) {
  console.error('[FATAL] source DB not found:', SOURCE_DB_PATH);
  console.error('Set SOURCE_DB_PATH env to point to the monolith DB.');
  process.exit(2);
}

// Imports dynamiques APRES resolution env (les modules lisent process.env au load)
const { migrateCompany, rollbackPilot } = await import('../services/tenantMigration.js');
const { initControlTowerSchema } = await import('../db/controlTowerSchema.js');
const { default: ct } = await import('../db/controlTower.js');

// Assure que control tower a son schema meme si on part de zero
initControlTowerSchema();

// Mode --list
if (args.includes('--list')) {
  const rows = ct.prepare(`SELECT id, name, slug, tenantMode, status FROM companies ORDER BY name`).all();
  if (!rows.length) {
    console.log('No companies in control tower. Need to seed first from source DB.');
    const src = new Database(SOURCE_DB_PATH, { readonly: true });
    const srcRows = src.prepare('SELECT id, name, slug, active FROM companies ORDER BY name').all();
    src.close();
    console.log('\nCompanies in SOURCE monolith:');
    for (const c of srcRows) console.log(`  ${c.id}  ${c.name}  slug=${c.slug}  active=${c.active}`);
  } else {
    console.log('Companies in CONTROL TOWER:');
    for (const c of rows) console.log(`  ${c.id}  ${c.name}  slug=${c.slug}  mode=${c.tenantMode}  status=${c.status}`);
  }
  process.exit(0);
}

// ─── DISPATCH ──────────────────────────────────────────────────────────
const companyId = args.find(a => !a.startsWith('--'));
if (!companyId) { console.error('[FATAL] companyId required'); usage(); process.exit(2); }

const isDry       = args.includes('--dry-run');
const isCommit    = args.includes('--commit');
const isRollback  = args.includes('--rollback');

if ([isDry, isCommit, isRollback].filter(Boolean).length !== 1) {
  console.error('[FATAL] choose exactly one of --dry-run | --commit | --rollback');
  process.exit(2);
}

// Seed company dans control tower si absente (copie depuis source)
function ensureCompanyInControlTower(companyId) {
  const present = ct.prepare('SELECT id FROM companies WHERE id = ?').get(companyId);
  if (present) return;
  const src = new Database(SOURCE_DB_PATH, { readonly: true });
  const row = src.prepare('SELECT id, name, slug, domain, plan, contactEmail, active, createdAt FROM companies WHERE id = ?').get(companyId);
  src.close();
  if (!row) { console.error('[FATAL] company not found in source DB:', companyId); process.exit(3); }
  ct.prepare(`
    INSERT INTO companies (id, name, slug, domain, plan, contactEmail, active, status, tenantMode, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'legacy', ?)
  `).run(row.id, row.name, row.slug, row.domain, row.plan, row.contactEmail, row.active ?? 1, row.createdAt || new Date().toISOString());
  console.log('[SEED] company copied into control tower:', companyId);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('PILOT MIGRATION');
  console.log('  companyId =', companyId);
  console.log('  source    =', SOURCE_DB_PATH);
  console.log('  mode      =', isDry ? 'DRY-RUN' : isCommit ? 'COMMIT' : 'ROLLBACK');
  console.log('═══════════════════════════════════════════════════════\n');

  if (isRollback) {
    const res = rollbackPilot(companyId);
    console.log('ROLLBACK:', res);
    process.exit(res.ok ? 0 : 1);
  }

  ensureCompanyInControlTower(companyId);

  const source = new Database(SOURCE_DB_PATH, { readonly: true });
  source.pragma('query_only = ON');

  const report = await migrateCompany(source, companyId, {
    dryRun: isDry,
    verbose: true,
  });

  source.close();

  // ─── PRINT REPORT ─────────────────────────────────────────────────────
  console.log('\n═══ REPORT ═══');
  console.log('ok           :', report.ok);
  console.log('mode         :', isDry ? 'DRY-RUN' : 'COMMIT');
  console.log('tenant DB    :', report.tenantDbPath || '(not created)');
  const _sizeKB = ((report.sizeBytes || 0) / 1024).toFixed(1);
  console.log('size         :', _sizeKB, 'KB');
  console.log('elapsed      :', (report.elapsedMs ?? 'n/a'), 'ms');
  console.log('current step :', report.currentStep || '(unknown)');
  if (report.companyName || report.companySlug) {
    console.log('company      :', report.companyName || '(no name)', '/', report.companySlug || '(no slug)');
  }

  // ─── ERROR DETAILS (when !ok) ─────────────────────────────────────────
  if (!report.ok) {
    console.log('\n══════════════════ ERROR ══════════════════');
    console.log('code         :', report.error || 'UNKNOWN_ERROR');
    console.log('failed at    :', report.currentStep || '(unknown step)');
    if (report.stack) {
      console.log('\n── stack trace ──');
      console.log(report.stack);
      console.log('─────────────────');
    }
    // Cas specifique : tenant deja commit — donner la commande exacte pour debloquer
    if (report.error === 'TENANT_ALREADY_COMMITTED') {
      console.log('\n💡 This tenant is already registered in control tower.');
      console.log('   Run --rollback first to remove it, then retry --commit:');
      console.log('     node server/scripts/migratePilotTenant.js', companyId, '--rollback');
      console.log('     node server/scripts/migratePilotTenant.js', companyId, '--commit');
    }
    if (report.error === 'COMPANY_NOT_FOUND') {
      console.log('\n💡 Company id not found in source DB. Check SOURCE_DB_PATH and companyId.');
    }
    if (report.error === 'TENANT_DIR_NOT_WRITABLE') {
      console.log('\n💡 TENANTS_DIR is not writable. Check permissions or export TENANTS_DIR=/tmp/tenants.');
    }
  }

  // ─── COMMIT SUB-REPORT ────────────────────────────────────────────────
  if (report.commit) {
    console.log('\n── commit phase ──');
    console.log('attempted    :', report.commit.attempted);
    if (report.commit.attempted) {
      console.log('commit ok    :', report.commit.ok);
      if (report.commit.storagePath) console.log('storagePath  :', report.commit.storagePath);
      if (report.commit.error)       console.log('commit err   :', report.commit.error);
    } else if (report.commit.reason) {
      console.log('reason       :', report.commit.reason);
    }
  }

  if (report.schema) {
    console.log('schema       :', report.schema.tablesCreated, 'tables +', report.schema.indexesCreated, 'indexes');
  }

  if (report.stubs) {
    const entries = Object.entries(report.stubs);
    console.log('stubs seeded :', entries.length ? entries.map(([t,n])=>`${t}=${n}`).join(', ') : '(none)');
  }

  if (report.remap) {
    const parents = Object.entries(report.remap).filter(([, r]) => r && r.placeholderInserted);
    if (parents.length === 0) {
      console.log('remap orphans: no placeholder needed');
    } else {
      for (const [parent, r] of parents) {
        const total = Object.values(r.remapped).reduce((s, n) => s + n, 0);
        console.log(`remap orphans: ${parent} -> placeholder '${r.placeholderId}'  ${total} refs remapped across ${Object.keys(r.remapped).length} tables`);
        for (const [childTable, count] of Object.entries(r.remapped)) {
          console.log(`    ${childTable.padEnd(38)} ${String(count).padStart(6)} refs`);
        }
      }
    }
  }

  if (report.fk) {
    console.log('FK declared violations :', report.fk.violations.length);
    console.log('integrity             :', report.fk.integrity);
    if (report.fk.violations.length > 0) {
      console.log('DECLARED VIOLATIONS:');
      for (const v of report.fk.violations.slice(0, 20)) console.log('  ', v);
    }
  }

  if (report.orphans) {
    console.log('FK implicit orphans    :', report.orphans.length);
    if (report.orphans.length > 0) {
      console.log('IMPLICIT ORPHANS:');
      for (const o of report.orphans.slice(0, 20)) {
        if (o.error) {
          console.log(`  ${o.child}.${o.fk} -> ${o.parent}  ERROR: ${o.error}`);
        } else {
          console.log(`  ${o.child}.${o.fk} -> ${o.parent}  ${o.count} orphan(s)  sample=${JSON.stringify(o.sampleIds)}`);
        }
      }
    }
  }

  if (report.copy) {
    const nonEmpty = report.copy.filter(c => c.rows > 0);
    const skipped = report.copy.filter(c => c.mode === 'skipped');
    const indirect = report.copy.filter(c => c.mode === 'indirect' && c.rows > 0);
    console.log('\nTables copied (non-empty):', nonEmpty.length, ' [indirect: ' + indirect.length + ']');
    for (const c of nonEmpty) {
      const modeTag = c.mode === 'indirect' ? ' [indirect]' : '';
      console.log(`  ${c.table.padEnd(40)} ${String(c.rows).padStart(6)} rows${modeTag}`);
    }
    if (skipped.length > 0) {
      console.log('\n⚠️  Tables SKIPPED (no companyId, not indirect):', skipped.length);
      for (const s of skipped) console.log(`  ${s.table}`);
    }
  }

  if (report.mismatches && report.mismatches.length) {
    console.log('\n⚠️  COUNT MISMATCHES:');
    for (const m of report.mismatches) {
      console.log(`  ${m.table.padEnd(40)} source=${m.source} tenant=${m.tenant} diff=${m.diff}`);
    }
  } else if (report.diff) {
    console.log('\n✅ Counts match on all', report.diff.length, 'tables');
  }

  console.log('\n═══ NEXT STEPS ═══');
  if (isDry && report.ok) {
    console.log(' Dry-run OK. To commit (without cutover):');
    console.log('   node server/scripts/migratePilotTenant.js', companyId, '--commit');
    console.log(' To rollback the artifacts:');
    console.log('   node server/scripts/migratePilotTenant.js', companyId, '--rollback');
  } else if (isCommit && report.ok) {
    console.log(' Commit OK. tenant_databases registered. tenantMode remains = legacy.');
    console.log(' No route has been refactored. Prod is unchanged.');
    console.log(' To rollback entirely:');
    console.log('   node server/scripts/migratePilotTenant.js', companyId, '--rollback');
  } else {
    console.log(' Migration FAILED. See ERROR block above for code + stack + failed step.');
    console.log(' Tenant DB has been removed (if commit) or kept for inspection (if dry-run).');
    if (report.error === 'TENANT_ALREADY_COMMITTED') {
      console.log(' Quick fix: run --rollback, then retry.');
    }
  }

  // Exit code : 0 si ok, 1 si echec generique, 3 si deja commit (actionnable)
  if (report.ok) process.exit(0);
  if (report.error === 'TENANT_ALREADY_COMMITTED') process.exit(3);
  process.exit(1);
}

main().catch(e => {
  console.error('\n══════════════ UNCAUGHT FATAL ══════════════');
  console.error('message :', e && e.message ? e.message : e);
  if (e && e.stack) {
    console.error('\n── stack ──');
    console.error(e.stack);
  }
  console.error('════════════════════════════════════════════');
  process.exit(1);
});
