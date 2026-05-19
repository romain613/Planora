// server/shared/db/index.js
// Phase 1 Sprint 1 — Public API du module shared/db.
//
// Invariants Phase 1 :
//   - DORMANT : ce module n'est importé NULLE PART dans le runtime legacy.
//   - WRAP-only : zéro lecture/écriture vers /var/www/planora-data/* en Phase 1.
//   - Tests uniquement (server/shared/db/test/).
//
// Surface publique minimale — n'exposer que ce qui est testé.

export {
  openDb,
  getHandle,
  hasHandle,
  listHandles,
  closeHandle,
  closeAll,
  getDefaultPragmas,
} from './dbHandles.js';

export {
  backupSqlite,
  sha256File,
  integrityCheck,
  foreignKeyCheck,
  verifyBackup,
} from './backup.js';

export {
  MigrationRegistry,
  ensureMigrationsTable,
  appliedIds,
  dryRun,
  applyMigrations,
  MIGRATIONS_TABLE_NAME,
} from './migrate.js';
