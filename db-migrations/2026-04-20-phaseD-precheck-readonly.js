#!/usr/bin/env node
/**
 * PHASE D-0 — Pre-flight audit READ-ONLY (2026-04-20)
 *
 * STRICT READ-ONLY :
 *   - Aucun INSERT / UPDATE / DELETE
 *   - Aucune transaction
 *   - Aucune modification de schéma
 *   - PRAGMA + SELECT uniquement
 *
 * Audite les 3 DBs :
 *   1. Statut FK actuel (PRAGMA foreign_keys)
 *   2. FK déclarées par table (PRAGMA foreign_key_list)
 *   3. Violations existantes (PRAGMA foreign_key_check)
 *   4. Triggers (sqlite_master)
 *   5. Placeholder __deleted__ dans contacts
 *   6. Cas EMPTY (bookings.contactId='', call_logs.contactId='')
 *   7. CASCADE FK + impact (COUNT rows tables parents)
 *   8. Tables sensibles (tickets, contact_followers, calendars, etc.)
 *   9. Cas spécifique efef : FK contacts.assignedTo → collaborators.id ?
 *
 * Sortie : JSON structuré sur STDOUT.
 */

const Database = require('/var/www/planora/server/node_modules/better-sqlite3');

const DBS = [
  { name: 'monolithe',  path: '/var/www/planora-data/calendar360.db' },
  { name: 'CapFinances', path: '/var/www/planora-data/tenants/c1776169036725.db' },
  { name: 'MonBilan',    path: '/var/www/planora-data/tenants/c-monbilan.db' },
];

const SENSITIVE_TABLES = [
  'bookings', 'call_logs', 'contacts', 'collaborators', 'companies',
  'contact_followers', 'tickets', 'calendars', 'messages',
  'conversations', 'pipeline_history', 'audit_logs',
  'sms_messages', 'notifications', 'ai_copilot_analyses',
  'call_contexts', 'recommended_actions', 'call_form_responses',
  'client_messages', 'contact_documents', 'contact_ai_memory',
  'call_transcript_archive', 'contact_status_history',
  'system_anomaly_logs',
];

function auditDb(dbInfo) {
  // readonly: true → empêche toute écriture au niveau du driver
  const db = new Database(dbInfo.path, { readonly: true });

  // 1. Statut FK actuel (per-connection, devrait être 0 = OFF)
  const fk_pragma = db.pragma('foreign_keys', { simple: true });

  // 2. integrity_check (sanity baseline)
  const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;

  // 3. Toutes les tables
  const allTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map(r => r.name);

  // 4. PRAGMA foreign_key_list par table (FK déclarées)
  const fk_by_table = {};
  let total_fks = 0;
  let total_cascade_delete = 0;
  let total_cascade_update = 0;
  let total_set_null = 0;
  let total_restrict = 0;
  let total_no_action = 0;
  for (const tbl of allTables) {
    const fkList = db.prepare(`PRAGMA foreign_key_list(${tbl})`).all();
    if (fkList.length > 0) {
      fk_by_table[tbl] = fkList.map(fk => ({
        id: fk.id,
        seq: fk.seq,
        parent_table: fk.table,
        child_col: fk.from,
        parent_col: fk.to,
        on_update: fk.on_update,
        on_delete: fk.on_delete,
        match: fk.match,
      }));
      total_fks += fkList.length;
      for (const fk of fkList) {
        const od = (fk.on_delete || '').toUpperCase();
        const ou = (fk.on_update || '').toUpperCase();
        if (od === 'CASCADE') total_cascade_delete++;
        else if (od === 'SET NULL') total_set_null++;
        else if (od === 'RESTRICT') total_restrict++;
        else total_no_action++;
        if (ou === 'CASCADE') total_cascade_update++;
      }
    }
  }

  // 5. PRAGMA foreign_key_check global
  const fk_violations_global = db.prepare('PRAGMA foreign_key_check').all();

  // 6. Triggers
  const triggers = db.prepare(
    "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ORDER BY tbl_name, name"
  ).all();

  // 7. Placeholder __deleted__ dans contacts
  let placeholder = null;
  if (allTables.includes('contacts')) {
    placeholder = db.prepare("SELECT id, name, companyId FROM contacts WHERE id='__deleted__'").get() || null;
  }

  // 8. Cas EMPTY (bookings.contactId='' / NULL)
  let bookings_empty = null, bookings_total = null;
  if (allTables.includes('bookings')) {
    bookings_total = db.prepare("SELECT COUNT(*) AS n FROM bookings").get().n;
    bookings_empty = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE contactId IS NULL OR contactId=''").get().n;
  }
  let call_logs_empty = null, call_logs_total = null;
  if (allTables.includes('call_logs')) {
    call_logs_total = db.prepare("SELECT COUNT(*) AS n FROM call_logs").get().n;
    call_logs_empty = db.prepare("SELECT COUNT(*) AS n FROM call_logs WHERE contactId IS NULL OR contactId=''").get().n;
  }

  // 9. Compte des rows par table sensible (pour évaluer impact CASCADE)
  const row_counts = {};
  for (const tbl of SENSITIVE_TABLES) {
    if (allTables.includes(tbl)) {
      try { row_counts[tbl] = db.prepare(`SELECT COUNT(*) AS n FROM ${tbl}`).get().n; }
      catch (e) { row_counts[tbl] = 'error: ' + e.message; }
    } else {
      row_counts[tbl] = 'absent';
    }
  }

  // 10. Cas efef : FK contacts.assignedTo → collaborators.id ?
  let efef_fk_check = null;
  if (allTables.includes('contacts')) {
    const contactsFKs = fk_by_table['contacts'] || [];
    const assignedToFK = contactsFKs.find(fk => fk.child_col === 'assignedTo' && fk.parent_table === 'collaborators');
    efef_fk_check = {
      fk_assignedTo_to_collaborators_exists: !!assignedToFK,
      fk_details: assignedToFK || null,
    };
    if (assignedToFK) {
      // Si la FK existe, vérifier si efef serait une violation
      efef_fk_check.efef_row = db.prepare(
        "SELECT id, name, assignedTo FROM contacts WHERE id='ct1774872603359'"
      ).get() || null;
      // Toutes les violations FK_check ciblées sur contacts
      efef_fk_check.fk_check_contacts_table = db.prepare("PRAGMA foreign_key_check(contacts)").all();
    }
  }

  // 11. Pour chaque table avec FK, compter les rows pour avoir le contexte d'impact
  const fk_impact = {};
  for (const tbl of Object.keys(fk_by_table)) {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${tbl}`).get().n;
    fk_impact[tbl] = { rows: n, fks: fk_by_table[tbl].length };
  }

  // 12. PRAGMA defer_foreign_keys (devrait être 0)
  const defer_fk = db.pragma('defer_foreign_keys', { simple: true });

  // 13. PRAGMA recursive_triggers (info bonus)
  const recursive_triggers = db.pragma('recursive_triggers', { simple: true });

  db.close();

  return {
    db_name: dbInfo.name,
    db_path: dbInfo.path,
    integrity_check: integrity,
    pragma_foreign_keys_current: fk_pragma,
    pragma_defer_foreign_keys: defer_fk,
    pragma_recursive_triggers: recursive_triggers,
    tables_total: allTables.length,
    fk_summary: {
      total_fks_declared: total_fks,
      tables_with_fk: Object.keys(fk_by_table).length,
      on_delete_cascade: total_cascade_delete,
      on_update_cascade: total_cascade_update,
      on_delete_set_null: total_set_null,
      on_delete_restrict: total_restrict,
      on_delete_no_action_or_default: total_no_action,
    },
    fk_by_table,
    fk_impact,
    fk_violations_global: fk_violations_global,
    fk_violations_count: fk_violations_global.length,
    triggers,
    triggers_count: triggers.length,
    placeholder_deleted: placeholder,
    placeholder_exists: !!placeholder,
    bookings_empty_contactId: bookings_empty,
    bookings_total: bookings_total,
    call_logs_empty_contactId: call_logs_empty,
    call_logs_total: call_logs_total,
    row_counts_sensitive: row_counts,
    efef_check: efef_fk_check,
  };
}

const startedAt = new Date().toISOString();
const results = DBS.map(auditDb);

// Verdict provisoire (analytique sera fait dans le rapport markdown)
const total_violations = results.reduce((s, r) => s + r.fk_violations_count, 0);
const total_cascade_delete = results.reduce((s, r) => s + r.fk_summary.on_delete_cascade, 0);
const placeholder_missing_in = results.filter(r => !r.placeholder_exists).map(r => r.db_name);
const efef_problem = results.find(r => r.efef_check?.fk_assignedTo_to_collaborators_exists);

const provisional_verdict = {
  total_fk_violations_across_3_dbs: total_violations,
  total_cascade_delete_fks: total_cascade_delete,
  placeholder_missing_in: placeholder_missing_in,
  efef_fk_exists_anywhere: !!efef_problem,
  // Verdict provisoire automatique (peut être révisé manuellement dans le rapport markdown)
  provisional_status: (
    total_violations === 0 &&
    placeholder_missing_in.length === 0
    // Note: cascade != automatique no-go, à analyser manuellement
  ) ? 'GO_PROVISIONAL_PENDING_CODE_AUDIT' : 'NO_GO',
};

const report = {
  phase: 'D-0',
  type: 'pre-flight read-only audit',
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  dbs_audited: DBS.map(d => d.name),
  per_db_results: results,
  provisional_verdict,
};

console.log(JSON.stringify(report, null, 2));
process.exit(0);
