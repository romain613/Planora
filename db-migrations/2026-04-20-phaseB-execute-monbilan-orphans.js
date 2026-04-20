#!/usr/bin/env node
/**
 * PHASE B-execute — Stratégie E (Mix remap+mark) sur MonBilan (2026-04-20)
 *
 * Périmètre : tenant MonBilan (c-monbilan.db) UNIQUEMENT.
 * Source de vérité audit : ce script + sa sortie JSON (committés en git).
 * Aucun champ originalContactId ajouté en DB (option C choisie par MH).
 *
 * Idempotent : chaque UPDATE filtre par (id ET contactId d'origine).
 *   - Premier run    : 30 lignes mises à jour
 *   - Runs suivants  : 0 ligne (le WHERE ne matche plus, contactId déjà modifié)
 *
 * Garanties :
 *   - Aucun DELETE
 *   - Aucune activation FK
 *   - Aucune modification du monolithe ni de CapFinances
 *   - Aucune modification de schéma (zéro ALTER TABLE)
 *   - Transaction atomique : tout ou rien
 *   - integrity_check avant + après
 *   - Audit complet exporté en JSON (mapping per-row before/after)
 */

const Database = require('/var/www/planora/server/node_modules/better-sqlite3');

const DB_PATH = '/var/www/planora-data/tenants/c-monbilan.db';

// === MAPPING (extrait du rapport PHASE-B) ===

// 18 REMAPS : booking déjà existant → nouveau contactId (contact recréé sous un nouvel id)
const REMAPS = [
  // ct1774569201336 → ct_1776273340046_5oz9u2 (rc.sitbon@gmail.com) — 9 bookings
  { id: 'bk1775041916391', from: 'ct1774569201336',      to: 'ct_1776273340046_5oz9u2', email: 'rc.sitbon@gmail.com' },
  { id: 'bk1774719788653', from: 'ct1774569201336',      to: 'ct_1776273340046_5oz9u2', email: 'rc.sitbon@gmail.com' },
  { id: 'bk1774571647100', from: 'ct1774569201336',      to: 'ct_1776273340046_5oz9u2', email: 'rc.sitbon@gmail.com' },
  { id: 'bk1774620950725', from: 'ct1774569201336',      to: 'ct_1776273340046_5oz9u2', email: 'rc.sitbon@gmail.com' },
  { id: 'bk1774801814615', from: 'ct1774569201336',      to: 'ct_1776273340046_5oz9u2', email: 'rc.sitbon@gmail.com' },
  { id: 'bk1774621284184', from: 'ct1774569201336',      to: 'ct_1776273340046_5oz9u2', email: 'rc.sitbon@gmail.com' },
  { id: 'bk1774621301782', from: 'ct1774569201336',      to: 'ct_1776273340046_5oz9u2', email: 'rc.sitbon@gmail.com' },
  { id: 'bk1774571819397', from: 'ct1774569201336',      to: 'ct_1776273340046_5oz9u2', email: 'rc.sitbon@gmail.com' },
  { id: 'bk1774569322393', from: 'ct1774569201336',      to: 'ct_1776273340046_5oz9u2', email: 'rc.sitbon@gmail.com' },
  // ct1774872506050_uzue → ct_1776145908058_wtaru9 (Melie.guillot@outlook.fr) — 3 bookings
  { id: 'bk1774890063017', from: 'ct1774872506050_uzue', to: 'ct_1776145908058_wtaru9', email: 'Melie.guillot@outlook.fr' },
  { id: 'bk1774889641133', from: 'ct1774872506050_uzue', to: 'ct_1776145908058_wtaru9', email: 'Melie.guillot@outlook.fr' },
  { id: 'bk1774889535906', from: 'ct1774872506050_uzue', to: 'ct_1776145908058_wtaru9', email: 'Melie.guillot@outlook.fr' },
  // ct1774872506053_vss5 → ct_1776145908086_zo67ea (orlanne.huet@icloud.com) — 1 booking
  { id: 'bk1774887360086', from: 'ct1774872506053_vss5', to: 'ct_1776145908086_zo67ea', email: 'orlanne.huet@icloud.com' },
  // ct1775002913105 → ct_1776145908236_gmn91t (Rc@gmail.com) — 3 bookings
  { id: 'bk1775562446885', from: 'ct1775002913105',      to: 'ct_1776145908236_gmn91t', email: 'Rc@gmail.com' },
  { id: 'bk1775332856236', from: 'ct1775002913105',      to: 'ct_1776145908236_gmn91t', email: 'Rc@gmail.com' },
  { id: 'bk1775333060039', from: 'ct1775002913105',      to: 'ct_1776145908236_gmn91t', email: 'Rc@gmail.com' },
  // ct1775553932527 → ct_1776206683167_iwx8p2 (juju@gmail.com) — 1 booking
  { id: 'bk1775562907705', from: 'ct1775553932527',      to: 'ct_1776206683167_iwx8p2', email: 'juju@gmail.com' },
  // ct1774872506051_slk5 → ct_1776289668254_lqufr4 (marieange1978.maz@gmail.com) — 1 booking
  { id: 'bk1774891441738', from: 'ct1774872506051_slk5', to: 'ct_1776289668254_lqufr4', email: 'marieange1978.maz@gmail.com' },
];

// 12 MARKS : contact original n'existe plus du tout, on marque "__deleted__" (placeholder déjà en base)
const MARKS = [
  // ct1774891551680 (romain.biotech@gmail.com) — 9 bookings, aucun contact actuel correspondant
  { id: 'bk1774969047129', from: 'ct1774891551680',       email: 'romain.biotech@gmail.com' },
  { id: 'bk1774969529525', from: 'ct1774891551680',       email: 'romain.biotech@gmail.com' },
  { id: 'bk1775468417817', from: 'ct1774891551680',       email: 'romain.biotech@gmail.com' },
  { id: 'bk1775001867812', from: 'ct1774891551680',       email: 'romain.biotech@gmail.com' },
  { id: 'bk1774970523000', from: 'ct1774891551680',       email: 'romain.biotech@gmail.com' },
  { id: 'bk1774892690324', from: 'ct1774891551680',       email: 'romain.biotech@gmail.com' },
  { id: 'bk1774892627033', from: 'ct1774891551680',       email: 'romain.biotech@gmail.com' },
  { id: 'bk1774891721672', from: 'ct1774891551680',       email: 'romain.biotech@gmail.com' },
  { id: 'bk1774891606042', from: 'ct1774891551680',       email: 'romain.biotech@gmail.com' },
  // ct1774907550965 (sitbon alain, no email) — 1 booking
  { id: 'bk1775468512404', from: 'ct1774907550965',       email: '' },
  // ct1774819397149pw56 (Romain charles charles, no email) — 1 booking
  { id: 'bk1774819397303', from: 'ct1774819397149pw56',   email: '' },
  // ct17757957649807a5g (Romain Sitbon, no email, tel 0616367116) — 1 booking
  { id: 'bk1775795765152', from: 'ct17757957649807a5g',   email: '' },
];

const DELETED_PLACEHOLDER = '__deleted__';

function snapshot(db, ids) {
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(
    `SELECT id, contactId, status, source, visitorName, visitorEmail, visitorPhone, date, time
     FROM bookings WHERE id IN (${placeholders})`
  ).all(...ids);
}

function run() {
  const db = new Database(DB_PATH);
  const startedAt = new Date().toISOString();

  // Sanity 1 : intégrité
  const intBefore = db.prepare('PRAGMA integrity_check').get().integrity_check;
  if (intBefore !== 'ok') {
    db.close();
    throw new Error(`integrity_check FAILED before: ${intBefore}`);
  }

  // Sanity 2 : placeholder __deleted__ doit exister dans contacts
  const placeholder = db.prepare('SELECT id FROM contacts WHERE id = ?').get(DELETED_PLACEHOLDER);
  if (!placeholder) {
    db.close();
    throw new Error("Le placeholder '__deleted__' n'existe pas dans contacts. Aborted.");
  }

  // Sanity 3 : tous les contacts cibles des REMAPS doivent exister
  const missingTargets = [];
  for (const r of REMAPS) {
    const exists = db.prepare('SELECT 1 FROM contacts WHERE id = ?').get(r.to);
    if (!exists) missingTargets.push({ booking: r.id, missing_target: r.to });
  }
  if (missingTargets.length > 0) {
    db.close();
    throw new Error('Contacts cibles manquants: ' + JSON.stringify(missingTargets));
  }

  const allIds = [...REMAPS.map(r => r.id), ...MARKS.map(m => m.id)];
  const before = snapshot(db, allIds);
  const beforeMap = new Map(before.map(r => [r.id, r]));

  const operations = [];

  const tx = db.transaction(() => {
    // 18 REMAPS
    const remapStmt = db.prepare(
      'UPDATE bookings SET contactId = ? WHERE id = ? AND contactId = ?'
    );
    for (const r of REMAPS) {
      const beforeRow = beforeMap.get(r.id);
      const result = remapStmt.run(r.to, r.id, r.from);
      operations.push({
        op: 'remap',
        booking_id: r.id,
        before_contactId: r.from,
        after_contactId: r.to,
        match_email: r.email,
        rows_changed: result.changes,
        already_applied: result.changes === 0,
        before_row: beforeRow || null,
      });
    }

    // 12 MARKS
    const markStmt = db.prepare(
      'UPDATE bookings SET contactId = ? WHERE id = ? AND contactId = ?'
    );
    for (const m of MARKS) {
      const beforeRow = beforeMap.get(m.id);
      const result = markStmt.run(DELETED_PLACEHOLDER, m.id, m.from);
      operations.push({
        op: 'mark_deleted',
        booking_id: m.id,
        before_contactId: m.from,
        after_contactId: DELETED_PLACEHOLDER,
        match_email: m.email || null,
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
    op.after_row = afterMap.get(op.booking_id) || null;
  }

  // Sanity 4 : intégrité
  const intAfter = db.prepare('PRAGMA integrity_check').get().integrity_check;
  if (intAfter !== 'ok') {
    db.close();
    throw new Error(`integrity_check FAILED after: ${intAfter}`);
  }

  // Re-audit : comptage final des orphelins (doit = 0)
  const orphansAfter = db.prepare(`
    SELECT b.id, b.contactId, b.visitorEmail
    FROM bookings b
    LEFT JOIN contacts c ON c.id = b.contactId
    WHERE c.id IS NULL AND b.contactId IS NOT NULL AND b.contactId != ''
  `).all();

  const summary = {
    remap_total: REMAPS.length,
    remap_applied: operations.filter(o => o.op === 'remap' && o.rows_changed === 1).length,
    remap_already_applied: operations.filter(o => o.op === 'remap' && o.rows_changed === 0).length,
    mark_total: MARKS.length,
    mark_applied: operations.filter(o => o.op === 'mark_deleted' && o.rows_changed === 1).length,
    mark_already_applied: operations.filter(o => o.op === 'mark_deleted' && o.rows_changed === 0).length,
    orphans_remaining_after: orphansAfter.length,
    orphans_remaining_details: orphansAfter,
  };

  db.close();

  return {
    phase: 'B-execute',
    strategy: 'E (remap + mark __deleted__)',
    audit_storage: 'JSON in git (option C)',
    tenant: 'c-monbilan',
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
