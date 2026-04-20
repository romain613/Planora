#!/usr/bin/env node
/**
 * PHASE D-0bis — Cleanup historical FK violations + missing placeholder (2026-04-20)
 *
 * STRICT WRITE LIMITED TO 4 ACTIONS, ZÉRO DRIFT :
 *   A1 — INSERT placeholder __deleted__ dans CapFinances tenant (additif)
 *   A2 — DELETE 12 roles orphans monolithe + cascade auto role_permissions
 *   A3 — DELETE 2 tickets orphans monolithe (bugs JS résolus)
 *   A4 — DELETE 117 google_events orphans monolithe (collabs disparus)
 *
 * Garanties :
 *   - 4 transactions atomiques SÉPARÉES (rollback partiel possible par action)
 *   - integrity_check avant + après chaque action
 *   - Snapshots complets avant chaque écriture (audit JSON)
 *   - Idempotence stricte : safety check anti-dérive sur counts attendus
 *   - Aucune écriture hors les 4 actions ciblées
 *   - Aucune modification de schéma (pas d'ALTER)
 *   - FK CASCADE role_permissions s'active automatiquement (comportement voulu)
 *   - Flag explicite des google_events futurs (start > now) dans le snapshot A4
 *
 * Sortie : JSON structuré sur STDOUT.
 */

const Database = require('/var/www/planora/server/node_modules/better-sqlite3');

const DB_MONO = '/var/www/planora-data/calendar360.db';
const DB_CAPF = '/var/www/planora-data/tenants/c1776169036725.db';
const DB_MONB = '/var/www/planora-data/tenants/c-monbilan.db';

// === IDS CIBLES (snapshot D-0) ===
const ROLES_ORPHAN_IDS = [
  'role_admin_c1774825229294',  'role_member_c1774825229294',
  'role_admin_c1774898326318',  'role_member_c1774898326318',
  'role_admin_c1775049199206',  'role_member_c1775049199206',
  'role_admin_c1775049217129',  'role_member_c1775049217129',
  'role_admin_c1775050406399',  'role_member_c1775050406399',
  'role_admin_c1775050406816',  'role_member_c1775050406816',
];

const TICKETS_ORPHAN_IDS = [
  'tk17757546732473wpa',
  'tk177575500422688dn',
];

// ============================================
// ACTION A1 — INSERT placeholder __deleted__ dans CapFinances
// ============================================
function actionA1(dbPath) {
  const db = new Database(dbPath);
  const result = { action: 'A1_insert_placeholder_capfinances', db: 'CapFinances', db_path: dbPath };

  try {
    // Sanity 1 : intégrité
    const intBefore = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (intBefore !== 'ok') throw new Error(`integrity_check FAILED before: ${intBefore}`);
    result.integrity_before = intBefore;

    // Sanity 2 : confirmer que c1776169036725 existe dans companies
    const companyCheck = db.prepare("SELECT id, name FROM companies WHERE id = 'c1776169036725'").get();
    if (!companyCheck) throw new Error('SAFETY: company c1776169036725 introuvable dans CapFinances tenant');
    result.company_check = companyCheck;

    // Snapshot AVANT
    const before = db.prepare("SELECT id, companyId, name FROM contacts WHERE id = '__deleted__'").get();
    result.before_state = before || null;

    // INSERT idempotent
    let rowsInserted = 0;
    const tx = db.transaction(() => {
      const insertResult = db.prepare(
        `INSERT OR IGNORE INTO contacts (id, companyId, name, status, pipeline_stage)
         VALUES ('__deleted__', 'c1776169036725', '[Contact supprime]', 'prospect', 'nouveau')`
      ).run();
      rowsInserted = insertResult.changes;
    });
    tx();

    result.rows_inserted = rowsInserted;
    result.already_existed = rowsInserted === 0;

    // Snapshot APRÈS
    result.after_state = db.prepare("SELECT id, companyId, name, status, pipeline_stage FROM contacts WHERE id = '__deleted__'").get();

    // Sanity 3 : intégrité
    const intAfter = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (intAfter !== 'ok') throw new Error(`integrity_check FAILED after: ${intAfter}`);
    result.integrity_after = intAfter;

    result.success = true;
  } catch (err) {
    result.success = false;
    result.error = err.message;
    result.error_stack = err.stack;
  } finally {
    db.close();
  }

  return result;
}

// ============================================
// ACTION A2 — DELETE 12 roles orphans + cascade role_permissions
// ============================================
function actionA2(dbPath) {
  const db = new Database(dbPath);
  const result = { action: 'A2_delete_orphan_roles', db: 'monolithe', db_path: dbPath };

  try {
    const intBefore = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (intBefore !== 'ok') throw new Error(`integrity_check FAILED before: ${intBefore}`);
    result.integrity_before = intBefore;

    // Snapshot complet AVANT
    const placeholders = ROLES_ORPHAN_IDS.map(() => '?').join(',');
    const rolesSnapshot = db.prepare(
      `SELECT id, companyId, name, slug, isSystem, createdAt FROM roles WHERE id IN (${placeholders})`
    ).all(...ROLES_ORPHAN_IDS);
    result.snapshot_roles_before = rolesSnapshot;
    result.snapshot_roles_count = rolesSnapshot.length;

    // Snapshot des role_permissions qui vont cascader
    const rolePermsSnapshot = db.prepare(
      `SELECT id, roleId, permission, granted FROM role_permissions WHERE roleId IN (${placeholders})`
    ).all(...ROLES_ORPHAN_IDS);
    result.snapshot_role_permissions_cascade_before = rolePermsSnapshot;
    result.snapshot_role_permissions_cascade_count = rolePermsSnapshot.length;

    // Sanity anti-dérive : count attendu = 12
    if (rolesSnapshot.length !== 12) {
      // Si différent, on signale mais on continue avec ce qui existe (idempotence)
      result.warning = `Expected 12 roles, found ${rolesSnapshot.length} (déjà partiellement nettoyé ?)`;
    }

    // Compte total role_permissions AVANT (pour mesurer cascade)
    const totalRpBefore = db.prepare("SELECT COUNT(*) AS n FROM role_permissions").get().n;
    result.total_role_permissions_before = totalRpBefore;

    let rolesDeleted = 0;
    const tx = db.transaction(() => {
      const stmt = db.prepare("DELETE FROM roles WHERE id = ?");
      for (const id of ROLES_ORPHAN_IDS) {
        const r = stmt.run(id);
        rolesDeleted += r.changes;
      }
    });
    tx();

    result.roles_deleted = rolesDeleted;

    // Compte total role_permissions APRÈS (pour mesurer cascade exact)
    const totalRpAfter = db.prepare("SELECT COUNT(*) AS n FROM role_permissions").get().n;
    result.total_role_permissions_after = totalRpAfter;
    result.role_permissions_cascade_deleted = totalRpBefore - totalRpAfter;

    // Vérification post : 0 row restante avec ces ids
    const remainingCount = db.prepare(
      `SELECT COUNT(*) AS n FROM roles WHERE id IN (${placeholders})`
    ).all(...ROLES_ORPHAN_IDS)[0].n;
    result.roles_remaining_after = remainingCount;

    const intAfter = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (intAfter !== 'ok') throw new Error(`integrity_check FAILED after: ${intAfter}`);
    result.integrity_after = intAfter;

    // Re-audit FK violations sur roles uniquement
    const rolesViolationsAfter = db.prepare("PRAGMA foreign_key_check(roles)").all();
    result.fk_violations_roles_after = rolesViolationsAfter.length;

    result.success = true;
  } catch (err) {
    result.success = false;
    result.error = err.message;
    result.error_stack = err.stack;
  } finally {
    db.close();
  }

  return result;
}

// ============================================
// ACTION A3 — DELETE 2 tickets orphans
// ============================================
function actionA3(dbPath) {
  const db = new Database(dbPath);
  const result = { action: 'A3_delete_orphan_tickets', db: 'monolithe', db_path: dbPath };

  try {
    const intBefore = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (intBefore !== 'ok') throw new Error(`integrity_check FAILED before: ${intBefore}`);
    result.integrity_before = intBefore;

    const placeholders = TICKETS_ORPHAN_IDS.map(() => '?').join(',');
    const ticketsSnapshot = db.prepare(
      `SELECT id, companyId, type, category, subject, status, priority, createdAt FROM tickets WHERE id IN (${placeholders})`
    ).all(...TICKETS_ORPHAN_IDS);
    result.snapshot_tickets_before = ticketsSnapshot;
    result.snapshot_tickets_count = ticketsSnapshot.length;

    if (ticketsSnapshot.length !== 2) {
      result.warning = `Expected 2 tickets, found ${ticketsSnapshot.length} (déjà partiellement nettoyé ?)`;
    }

    // Snapshot ticket_messages liés (FK ticket_messages.ticketId → tickets.id NO ACTION)
    const ticketMsgsSnapshot = db.prepare(
      `SELECT id, ticketId, createdAt FROM ticket_messages WHERE ticketId IN (${placeholders})`
    ).all(...TICKETS_ORPHAN_IDS);
    result.snapshot_ticket_messages_before = ticketMsgsSnapshot;
    result.snapshot_ticket_messages_count = ticketMsgsSnapshot.length;

    let ticketsDeleted = 0;
    let ticketMessagesDeleted = 0;
    const tx = db.transaction(() => {
      // DELETE enfants d'abord (ticket_messages) pour éviter FK constraint
      const stmtMsg = db.prepare("DELETE FROM ticket_messages WHERE ticketId = ?");
      for (const id of TICKETS_ORPHAN_IDS) {
        const r = stmtMsg.run(id);
        ticketMessagesDeleted += r.changes;
      }
      // Puis DELETE tickets
      const stmt = db.prepare("DELETE FROM tickets WHERE id = ?");
      for (const id of TICKETS_ORPHAN_IDS) {
        const r = stmt.run(id);
        ticketsDeleted += r.changes;
      }
    });
    tx();

    result.tickets_deleted = ticketsDeleted;
    result.ticket_messages_deleted = ticketMessagesDeleted;

    const remainingCount = db.prepare(
      `SELECT COUNT(*) AS n FROM tickets WHERE id IN (${placeholders})`
    ).all(...TICKETS_ORPHAN_IDS)[0].n;
    result.tickets_remaining_after = remainingCount;

    const intAfter = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (intAfter !== 'ok') throw new Error(`integrity_check FAILED after: ${intAfter}`);
    result.integrity_after = intAfter;

    const ticketsViolationsAfter = db.prepare("PRAGMA foreign_key_check(tickets)").all();
    result.fk_violations_tickets_after = ticketsViolationsAfter.length;

    result.success = true;
  } catch (err) {
    result.success = false;
    result.error = err.message;
    result.error_stack = err.stack;
  } finally {
    db.close();
  }

  return result;
}

// ============================================
// ACTION A4 — DELETE 117 google_events orphans (avec flag futurs)
// ============================================
function actionA4(dbPath) {
  const db = new Database(dbPath);
  const result = { action: 'A4_delete_orphan_google_events', db: 'monolithe', db_path: dbPath };

  try {
    const intBefore = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (intBefore !== 'ok') throw new Error(`integrity_check FAILED before: ${intBefore}`);
    result.integrity_before = intBefore;

    // Snapshot complet AVANT (tous les events orphelins)
    const orphans = db.prepare(`
      SELECT ge.id, ge.collaboratorId, ge.summary, ge.startTime, ge.endTime, ge.allDay, ge.status, ge.transparency
      FROM google_events ge
      LEFT JOIN collaborators co ON co.id = ge.collaboratorId
      WHERE co.id IS NULL AND ge.collaboratorId IS NOT NULL AND ge.collaboratorId != ''
      ORDER BY ge.startTime DESC
    `).all();
    result.snapshot_events_before = orphans;
    result.snapshot_events_count = orphans.length;

    // Anti-dérive : 117 attendu (warning si différent mais on continue par id)
    if (orphans.length !== 117) {
      result.warning = `Expected 117 events, found ${orphans.length}`;
    }

    // Flag des events futurs (start > now)
    const nowIso = new Date().toISOString();
    result.now_iso = nowIso;
    const futureEvents = orphans.filter(e => {
      if (!e.startTime) return false;
      try {
        return e.startTime > nowIso;
      } catch { return false; }
    });
    result.events_with_future_start_count = futureEvents.length;
    result.events_with_future_start_list = futureEvents.map(e => ({
      id: e.id,
      collaboratorId: e.collaboratorId,
      startTime: e.startTime,
      summary: e.summary,
    }));

    // Groupement par collaboratorId orphan (pour audit clair)
    const byCollab = {};
    for (const e of orphans) {
      const c = e.collaboratorId || '<unknown>';
      byCollab[c] = (byCollab[c] || 0) + 1;
    }
    result.distribution_by_orphan_collaboratorId = byCollab;

    // DELETE par id explicite
    const targetIds = orphans.map(e => e.id);
    let eventsDeleted = 0;
    const tx = db.transaction(() => {
      const stmt = db.prepare("DELETE FROM google_events WHERE id = ?");
      for (const id of targetIds) {
        const r = stmt.run(id);
        eventsDeleted += r.changes;
      }
    });
    tx();

    result.events_deleted = eventsDeleted;

    // Vérification post
    const remainingOrphans = db.prepare(`
      SELECT COUNT(*) AS n FROM google_events ge
      LEFT JOIN collaborators co ON co.id = ge.collaboratorId
      WHERE co.id IS NULL AND ge.collaboratorId IS NOT NULL AND ge.collaboratorId != ''
    `).get().n;
    result.google_events_orphans_remaining_after = remainingOrphans;

    const intAfter = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (intAfter !== 'ok') throw new Error(`integrity_check FAILED after: ${intAfter}`);
    result.integrity_after = intAfter;

    const geViolationsAfter = db.prepare("PRAGMA foreign_key_check(google_events)").all();
    result.fk_violations_google_events_after = geViolationsAfter.length;

    result.success = true;
  } catch (err) {
    result.success = false;
    result.error = err.message;
    result.error_stack = err.stack;
  } finally {
    db.close();
  }

  return result;
}

// ============================================
// MAIN
// ============================================
const startedAt = new Date().toISOString();

const a1 = actionA1(DB_CAPF);
const a2 = actionA2(DB_MONO);
const a3 = actionA3(DB_MONO);
const a4 = actionA4(DB_MONO);

// Re-audit final FK violations sur les 3 DBs
function fkSummary(dbPath, dbName) {
  const db = new Database(dbPath, { readonly: true });
  try {
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    return { db: dbName, db_path: dbPath, fk_violations_count: violations.length, fk_violations: violations };
  } finally { db.close(); }
}

const final_audit = {
  monolithe: fkSummary(DB_MONO, 'monolithe'),
  CapFinances: fkSummary(DB_CAPF, 'CapFinances'),
  MonBilan: fkSummary(DB_MONB, 'MonBilan'),
};

const total_violations_after = final_audit.monolithe.fk_violations_count
  + final_audit.CapFinances.fk_violations_count
  + final_audit.MonBilan.fk_violations_count;

const overall_success = a1.success && a2.success && a3.success && a4.success;

const report = {
  phase: 'D-0bis',
  type: 'cleanup historical FK violations + missing placeholder',
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  actions: { A1: a1, A2: a2, A3: a3, A4: a4 },
  final_fk_audit: final_audit,
  summary: {
    overall_success,
    total_fk_violations_after_d0bis: total_violations_after,
    expected_total_violations_after: 0,
    matches_expected: total_violations_after === 0,
  },
};

console.log(JSON.stringify(report, null, 2));
process.exit(overall_success ? 0 : 1);
