#!/usr/bin/env node
/**
 * PHASE A — Propagation schéma monolithe → tenants (2026-04-20)
 *
 * Idempotent. Peut être ré-exécuté sans risque.
 * Source de vérité : monolithe (calendar360.db).
 * Cibles : toutes les DBs passées en argument.
 *
 * Usage : node 2026-04-20-phaseA-propagate-schema.js <db1> [db2] ...
 *
 * Pour chaque DB :
 *   1. PRAGMA integrity_check AVANT
 *   2. BEGIN TRANSACTION
 *   3. Pour chaque colonne : check via PRAGMA table_info, ALTER si manquante
 *   4. Pour chaque index : CREATE INDEX IF NOT EXISTS
 *   5. Pour chaque trigger : CREATE TRIGGER IF NOT EXISTS
 *   6. COMMIT (ou ROLLBACK si erreur)
 *   7. PRAGMA integrity_check APRÈS
 *   8. Rapport JSON par DB
 *
 * Garanties :
 *   - Aucune modification destructive
 *   - Aucune suppression de données
 *   - Toutes les colonnes ont DEFAULT (lignes existantes intactes)
 *   - Transaction = atomicité (tout ou rien par DB)
 */

const Database = require('/var/www/planora/server/node_modules/better-sqlite3');
const path = require('path');

// === DÉFINITION DES CHANGEMENTS À PROPAGER ===
const COLUMNS = [
  // bookings (8)
  { table: 'bookings', name: 'bookedByCollaboratorId', def: "TEXT DEFAULT ''" },
  { table: 'bookings', name: 'meetingCollaboratorId',  def: "TEXT DEFAULT ''" },
  { table: 'bookings', name: 'agendaOwnerId',          def: "TEXT DEFAULT ''" },
  { table: 'bookings', name: 'bookingType',            def: "TEXT DEFAULT 'external'" },
  { table: 'bookings', name: 'bookingOutcome',         def: "TEXT DEFAULT ''" },
  { table: 'bookings', name: 'bookingOutcomeNote',     def: "TEXT DEFAULT ''" },
  { table: 'bookings', name: 'bookingOutcomeAt',       def: "TEXT DEFAULT ''" },
  { table: 'bookings', name: 'transferMode',           def: "TEXT DEFAULT ''" },
  // collaborators (4)
  { table: 'collaborators', name: 'acceptInternalMeetings',  def: 'INTEGER DEFAULT 1' },
  { table: 'collaborators', name: 'shareAgendaAvailability', def: 'INTEGER DEFAULT 1' },
  { table: 'collaborators', name: 'autoAcceptMeetings',      def: 'INTEGER DEFAULT 0' },
  { table: 'collaborators', name: 'meetingPriorityLevel',    def: 'INTEGER DEFAULT 1' },
  // contacts (8)
  { table: 'contacts', name: 'ownerCollaboratorId',       def: "TEXT DEFAULT ''" },
  { table: 'contacts', name: 'executorCollaboratorId',    def: "TEXT DEFAULT ''" },
  { table: 'contacts', name: 'meetingCollaboratorId',     def: "TEXT DEFAULT ''" },
  { table: 'contacts', name: 'followMode',                def: "TEXT DEFAULT 'owner_only'" },
  { table: 'contacts', name: 'visibilityScope',           def: "TEXT DEFAULT 'owner'" },
  { table: 'contacts', name: 'lastMeetingOutcome',        def: "TEXT DEFAULT ''" },
  { table: 'contacts', name: 'lastMeetingDate',           def: "TEXT DEFAULT ''" },
  { table: 'contacts', name: 'lastMeetingCollaboratorId', def: "TEXT DEFAULT ''" },
];

const INDEXES = [
  { name: 'idx_bookings_agenda_owner',   sql: 'CREATE INDEX IF NOT EXISTS idx_bookings_agenda_owner   ON bookings(agendaOwnerId)' },
  { name: 'idx_bookings_meeting_collab', sql: 'CREATE INDEX IF NOT EXISTS idx_bookings_meeting_collab ON bookings(meetingCollaboratorId)' },
  { name: 'idx_bookings_type',           sql: 'CREATE INDEX IF NOT EXISTS idx_bookings_type           ON bookings(bookingType)' },
  { name: 'idx_contacts_executor',       sql: 'CREATE INDEX IF NOT EXISTS idx_contacts_executor       ON contacts(executorCollaboratorId)' },
  { name: 'idx_contacts_meeting_collab', sql: 'CREATE INDEX IF NOT EXISTS idx_contacts_meeting_collab ON contacts(meetingCollaboratorId)' },
  { name: 'idx_contacts_owner',          sql: 'CREATE INDEX IF NOT EXISTS idx_contacts_owner          ON contacts(ownerCollaboratorId)' },
];

const TRIGGERS = [
  {
    name: 'prevent_audit_update',
    sql: `CREATE TRIGGER IF NOT EXISTS prevent_audit_update BEFORE UPDATE ON audit_logs
            BEGIN SELECT RAISE(ABORT, 'audit_logs is immutable'); END`
  },
  {
    name: 'prevent_audit_delete',
    sql: `CREATE TRIGGER IF NOT EXISTS prevent_audit_delete BEFORE DELETE ON audit_logs
            BEGIN SELECT RAISE(ABORT, 'audit_logs is immutable'); END`
  },
];

function processDb(dbPath) {
  const dbName = path.basename(dbPath);
  const report = {
    db: dbName,
    path: dbPath,
    integrity_before: null,
    integrity_after: null,
    columns_added: [],
    columns_skipped: [],
    indexes_created: [],
    indexes_existed: [],
    triggers_created: [],
    triggers_existed: [],
    error: null,
    success: false,
  };

  let db;
  try {
    db = new Database(dbPath);

    // Integrity check AVANT
    const before = db.prepare('PRAGMA integrity_check').get();
    report.integrity_before = before.integrity_check;
    if (report.integrity_before !== 'ok') {
      throw new Error(`integrity_check FAILED before: ${report.integrity_before}`);
    }

    // Snapshot triggers existants AVANT (pour distinguer created/existed)
    const existingTriggers = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map(r => r.name)
    );
    const existingIndexes = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all().map(r => r.name)
    );

    // === TRANSACTION ===
    const tx = db.transaction(() => {
      // 1. Colonnes
      for (const col of COLUMNS) {
        const cols = db.prepare(`PRAGMA table_info(${col.table})`).all();
        const exists = cols.some(c => c.name === col.name);
        if (exists) {
          report.columns_skipped.push(`${col.table}.${col.name}`);
        } else {
          db.exec(`ALTER TABLE ${col.table} ADD COLUMN ${col.name} ${col.def}`);
          report.columns_added.push(`${col.table}.${col.name}`);
        }
      }

      // 2. Indexes
      for (const idx of INDEXES) {
        if (existingIndexes.has(idx.name)) {
          report.indexes_existed.push(idx.name);
        } else {
          db.exec(idx.sql);
          report.indexes_created.push(idx.name);
        }
      }

      // 3. Triggers
      for (const trg of TRIGGERS) {
        if (existingTriggers.has(trg.name)) {
          report.triggers_existed.push(trg.name);
        } else {
          db.exec(trg.sql);
          report.triggers_created.push(trg.name);
        }
      }
    });
    tx();

    // Integrity check APRÈS
    const after = db.prepare('PRAGMA integrity_check').get();
    report.integrity_after = after.integrity_check;
    if (report.integrity_after !== 'ok') {
      throw new Error(`integrity_check FAILED after: ${report.integrity_after}`);
    }

    report.success = true;
  } catch (err) {
    report.error = err.message;
    report.success = false;
  } finally {
    if (db) db.close();
  }

  return report;
}

// === MAIN ===
const dbs = process.argv.slice(2);
if (dbs.length === 0) {
  console.error('Usage: node propagate-schema.js <db1> [db2] ...');
  process.exit(2);
}

const results = dbs.map(processDb);

console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  phase: 'A',
  source_of_truth: 'monolithe (calendar360.db)',
  results,
}, null, 2));

const allOk = results.every(r => r.success);
process.exit(allOk ? 0 : 1);
