#!/usr/bin/env node
/**
 * PHASE C-2 — Call_logs orphans monolithe (2026-04-20)
 *
 * Périmètre : MONOLITHE (`calendar360.db`) UNIQUEMENT.
 * Stratégie : E (remap par contactId connu + mark `__deleted__` pour le reste).
 * Audit storage : option C — JSON committé en git.
 *
 * 48 call_logs orphans (tous companyId='c-monbilan') :
 *   - 7 remaps (4 contactIds connus de Phase B)
 *   - 41 marks `__deleted__` (12 contactIds : 2 vus en Phase B + 10 nouveaux sans match)
 *
 * Idempotent :
 *   - UPDATEs filtrés par (id ET contactId d'origine), 0 row touchée au 2e run
 *
 * Garanties :
 *   - Aucun DELETE
 *   - Aucune activation FK
 *   - Aucune modification de schéma
 *   - Aucune modification du `__deleted__` placeholder (créé en C-1)
 *   - Transaction atomique
 *   - integrity_check avant + après
 *   - Audit complet par row (before/after)
 */

const Database = require('/var/www/planora/server/node_modules/better-sqlite3');

const DB_PATH = '/var/www/planora-data/calendar360.db';
const DELETED_PLACEHOLDER = '__deleted__';

// === 7 REMAPS ===
const REMAPS = [
  // ct1774569201336 → ct_1776273340046_5oz9u2 (rc.sitbon@gmail.com)
  { id: 'cl1775469760851', from: 'ct1774569201336',      to: 'ct_1776273340046_5oz9u2', email: 'rc.sitbon@gmail.com' },
  // ct1774872506053_vss5 → ct_1776145908086_zo67ea (orlanne.huet@icloud.com)
  { id: 'cl1775380262681', from: 'ct1774872506053_vss5', to: 'ct_1776145908086_zo67ea', email: 'orlanne.huet@icloud.com' },
  // ct1774872506051_slk5 → ct_1776289668254_lqufr4 (marieange1978.maz@gmail.com)
  { id: 'cl1774989276152', from: 'ct1774872506051_slk5', to: 'ct_1776289668254_lqufr4', email: 'marieange1978.maz@gmail.com' },
  { id: 'cl1775553502089', from: 'ct1774872506051_slk5', to: 'ct_1776289668254_lqufr4', email: 'marieange1978.maz@gmail.com' },
  // ct1775002913105 → ct_1776145908236_gmn91t (Rc@gmail.com)
  { id: 'cl1775379106687', from: 'ct1775002913105',      to: 'ct_1776145908236_gmn91t', email: 'Rc@gmail.com' },
  { id: 'cl1775380042053', from: 'ct1775002913105',      to: 'ct_1776145908236_gmn91t', email: 'Rc@gmail.com' },
  { id: 'cl1775553545728', from: 'ct1775002913105',      to: 'ct_1776145908236_gmn91t', email: 'Rc@gmail.com' },
];

// === 41 MARKS (regroupés par orphan contactId pour clarté) ===
const MARKS = [
  // ct1774891551680 (21 calls) — vu Phase B
  { id: 'cl1774905003030', from: 'ct1774891551680' },
  { id: 'cl1775379083102', from: 'ct1774891551680' },
  { id: 'cl1775379128941', from: 'ct1774891551680' },
  { id: 'cl1775379303428', from: 'ct1774891551680' },
  { id: 'cl1775379797951', from: 'ct1774891551680' },
  { id: 'cl1775379840645', from: 'ct1774891551680' },
  { id: 'cl1775379861437', from: 'ct1774891551680' },
  { id: 'cl1775379923925', from: 'ct1774891551680' },
  { id: 'cl1775380012759', from: 'ct1774891551680' },
  { id: 'cl1775380025921', from: 'ct1774891551680' },
  { id: 'cl1775381003171', from: 'ct1774891551680' },
  { id: 'cl1775381026705', from: 'ct1774891551680' },
  { id: 'cl1775381807279', from: 'ct1774891551680' },
  { id: 'cl1775384037704', from: 'ct1774891551680' },
  { id: 'cl1775468972814', from: 'ct1774891551680' },
  { id: 'cl1775470498541', from: 'ct1774891551680' },
  { id: 'cl1775470608121', from: 'ct1774891551680' },
  { id: 'cl1775552350347', from: 'ct1774891551680' },
  { id: 'cl1775552377850', from: 'ct1774891551680' },
  { id: 'cl1775556612404', from: 'ct1774891551680' },
  { id: 'cl1775556615901', from: 'ct1774891551680' },
  // ct1774819397149pw56 (2) — vu Phase B
  { id: 'cl1774829995992', from: 'ct1774819397149pw56' },
  { id: 'cl1775040641428', from: 'ct1774819397149pw56' },
  // ct1774872506050_n5w1 (1) — nouveau, suffixe différent de _uzue
  { id: 'cl1775379051432', from: 'ct1774872506050_n5w1' },
  // ct1774891615850 (2) — nouveau
  { id: 'cl1774941533440', from: 'ct1774891615850' },
  { id: 'cl1775378899775', from: 'ct1774891615850' },
  // ct1774906474846 (1) — nouveau
  { id: 'cl1774907680802', from: 'ct1774906474846' },
  // ct1775553408534 (2) — nouveau (différent de 1775553932527)
  { id: 'cl1775555575621', from: 'ct1775553408534' },
  { id: 'cl1775555582615', from: 'ct1775553408534' },
  // ct_1775664554375_dto6h3 (1)
  { id: 'cl1776066683376', from: 'ct_1775664554375_dto6h3' },
  // ct_1775664554375_ebnzzr (4)
  { id: 'cl1775666166207', from: 'ct_1775664554375_ebnzzr' },
  { id: 'cl1775666176331', from: 'ct_1775664554375_ebnzzr' },
  { id: 'cl1775666256132', from: 'ct_1775664554375_ebnzzr' },
  { id: 'cl1775666265416', from: 'ct_1775664554375_ebnzzr' },
  // ct_1775664554375_fpqftb (1)
  { id: 'cl1775727359608', from: 'ct_1775664554375_fpqftb' },
  // ct_1775664554375_t8rqaq (1)
  { id: 'cl1775740473281', from: 'ct_1775664554375_t8rqaq' },
  // ct_1775664554375_uwngkl (4)
  { id: 'cl1775726163867', from: 'ct_1775664554375_uwngkl' },
  { id: 'cl1775726168920', from: 'ct_1775664554375_uwngkl' },
  { id: 'cl1775726181050', from: 'ct_1775664554375_uwngkl' },
  { id: 'cl1775726186215', from: 'ct_1775664554375_uwngkl' },
  // ct_1775804899342_h5hii4 (1)
  { id: 'cl1775805792812', from: 'ct_1775804899342_h5hii4' },
];

function snapshot(db, ids) {
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(
    `SELECT id, contactId, companyId, collaboratorId, direction, fromNumber, toNumber, status, duration, startedAt, is_valid_call, invalid_reason
     FROM call_logs WHERE id IN (${placeholders})`
  ).all(...ids);
}

function run() {
  const db = new Database(DB_PATH);
  const startedAt = new Date().toISOString();

  // Sanity 1 : intégrité
  const intBefore = db.prepare('PRAGMA integrity_check').get().integrity_check;
  if (intBefore !== 'ok') { db.close(); throw new Error(`integrity_check FAILED before: ${intBefore}`); }

  // Sanity 2 : __deleted__ doit exister (créé en Phase C-1)
  const placeholder = db.prepare('SELECT id FROM contacts WHERE id = ?').get(DELETED_PLACEHOLDER);
  if (!placeholder) {
    db.close();
    throw new Error("Le placeholder '__deleted__' n'existe pas. Lancer Phase C-1 d'abord.");
  }

  // Sanity 3 : tous les 4 contacts cibles des REMAPS doivent exister
  const uniqueTargets = [...new Set(REMAPS.map(r => r.to))];
  const missingTargets = [];
  for (const t of uniqueTargets) {
    if (!db.prepare('SELECT 1 FROM contacts WHERE id = ?').get(t)) missingTargets.push(t);
  }
  if (missingTargets.length > 0) { db.close(); throw new Error('Cibles manquantes: ' + JSON.stringify(missingTargets)); }

  // Sanity 4 : count d'orphans actuel doit = 48 (sinon DB a dérivé entre l'audit et l'execute)
  const currentOrphansCount = db.prepare(`
    SELECT COUNT(*) AS n FROM call_logs cl LEFT JOIN contacts c ON c.id = cl.contactId
    WHERE c.id IS NULL AND cl.contactId IS NOT NULL AND cl.contactId != ''
  `).get().n;
  if (currentOrphansCount !== 48) {
    db.close();
    throw new Error(`SAFETY: 48 orphans expected, found ${currentOrphansCount}. DB drifted between audit and execute. Aborting.`);
  }

  const allIds = [...REMAPS.map(r => r.id), ...MARKS.map(m => m.id)];
  if (allIds.length !== 48) {
    db.close();
    throw new Error(`Internal mismatch: REMAPS+MARKS=${allIds.length}, expected 48`);
  }

  const before = snapshot(db, allIds);
  const beforeMap = new Map(before.map(r => [r.id, r]));

  const operations = [];

  const tx = db.transaction(() => {
    const remapStmt = db.prepare('UPDATE call_logs SET contactId = ? WHERE id = ? AND contactId = ?');
    for (const r of REMAPS) {
      const beforeRow = beforeMap.get(r.id);
      const result = remapStmt.run(r.to, r.id, r.from);
      operations.push({
        op: 'remap',
        call_log_id: r.id,
        before_contactId: r.from,
        after_contactId: r.to,
        match_email: r.email,
        rows_changed: result.changes,
        already_applied: result.changes === 0,
        before_row: beforeRow || null,
      });
    }

    const markStmt = db.prepare('UPDATE call_logs SET contactId = ? WHERE id = ? AND contactId = ?');
    for (const m of MARKS) {
      const beforeRow = beforeMap.get(m.id);
      const result = markStmt.run(DELETED_PLACEHOLDER, m.id, m.from);
      operations.push({
        op: 'mark_deleted',
        call_log_id: m.id,
        before_contactId: m.from,
        after_contactId: DELETED_PLACEHOLDER,
        rows_changed: result.changes,
        already_applied: result.changes === 0,
        before_row: beforeRow || null,
      });
    }
  });
  tx();

  // Snapshot APRÈS
  const after = snapshot(db, allIds);
  const afterMap = new Map(after.map(r => [r.id, r]));
  for (const op of operations) {
    op.after_row = afterMap.get(op.call_log_id) || null;
  }

  const intAfter = db.prepare('PRAGMA integrity_check').get().integrity_check;
  if (intAfter !== 'ok') { db.close(); throw new Error(`integrity_check FAILED after: ${intAfter}`); }

  // Re-audit global
  const orphansAfter = db.prepare(`
    SELECT cl.id, cl.contactId, cl.companyId
    FROM call_logs cl LEFT JOIN contacts c ON c.id = cl.contactId
    WHERE c.id IS NULL AND cl.contactId IS NOT NULL AND cl.contactId != ''
  `).all();

  const summary = {
    remap_total: REMAPS.length,
    remap_applied: operations.filter(o => o.op === 'remap' && o.rows_changed === 1).length,
    remap_already_applied: operations.filter(o => o.op === 'remap' && o.rows_changed === 0).length,
    mark_total: MARKS.length,
    mark_applied: operations.filter(o => o.op === 'mark_deleted' && o.rows_changed === 1).length,
    mark_already_applied: operations.filter(o => o.op === 'mark_deleted' && o.rows_changed === 0).length,
    call_logs_orphans_remaining_global: orphansAfter.length,
    call_logs_orphans_remaining_details: orphansAfter,
  };

  db.close();

  return {
    phase: 'C-2',
    strategy: 'E (remap + mark __deleted__) on monolithe call_logs',
    audit_storage: 'JSON in git (option C)',
    target_db: 'monolithe (calendar360.db)',
    db_path: DB_PATH,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    integrity_before: intBefore,
    integrity_after: intAfter,
    summary,
    operations,
  };
}

try {
  const report = run();
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }, null, 2));
  process.exit(1);
}
