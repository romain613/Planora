#!/usr/bin/env node
/**
 * PHASE C-1 — Bookings orphans monolithe : rejouer Phase B + 2 nouveaux test002 (2026-04-20)
 *
 * Périmètre : MONOLITHE (`calendar360.db`) UNIQUEMENT.
 * Stratégie : E (remap par email + mark `__deleted__`) — identique Phase B.
 * Audit storage : option C — JSON committé en git.
 *
 * Idempotent :
 *   - INSERT placeholder __deleted__ via INSERT OR IGNORE
 *   - UPDATE bookings filtrés par (id ET contactId d'origine), 0 row touchée au 2e run
 *
 * Garanties :
 *   - Aucun DELETE
 *   - Aucune activation FK
 *   - Aucune modification de schéma (pas d'ALTER TABLE)
 *   - Transaction atomique : tout ou rien
 *   - integrity_check avant + après
 *   - Audit complet exporté en JSON (per-row before/after)
 *
 * Particularité vs Phase B :
 *   - Cible le monolithe (vs tenant)
 *   - +2 remaps test002 (créés après Phase B)
 *   - Crée le placeholder __deleted__ s'il n'existe pas (1 INSERT additif)
 */

const Database = require('/var/www/planora/server/node_modules/better-sqlite3');

const DB_PATH = '/var/www/planora-data/calendar360.db';
const DELETED_PLACEHOLDER = '__deleted__';

// === MAPPING (Phase B + 2 nouveaux test002) ===

// 20 REMAPS (18 Phase B + 2 nouveaux test002)
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
  // === NOUVEAUX (Phase C-1, non vus en Phase B) ===
  // ct_1776362792698_ikea68 → ct_1776535124719_e3g4j8 (test002@gmail.com) — 2 bookings
  { id: 'bk1776374105401',                     from: 'ct_1776362792698_ikea68', to: 'ct_1776535124719_e3g4j8', email: 'test002@gmail.com' },
  { id: 'b_inter_1776374144922_dbk1e3',        from: 'ct_1776362792698_ikea68', to: 'ct_1776535124719_e3g4j8', email: 'test002@gmail.com' },
];

// 12 MARKS (identique Phase B)
const MARKS = [
  { id: 'bk1774969047129', from: 'ct1774891551680',     email: 'romain.biotech@gmail.com' },
  { id: 'bk1774969529525', from: 'ct1774891551680',     email: 'romain.biotech@gmail.com' },
  { id: 'bk1775468417817', from: 'ct1774891551680',     email: 'romain.biotech@gmail.com' },
  { id: 'bk1775001867812', from: 'ct1774891551680',     email: 'romain.biotech@gmail.com' },
  { id: 'bk1774970523000', from: 'ct1774891551680',     email: 'romain.biotech@gmail.com' },
  { id: 'bk1774892690324', from: 'ct1774891551680',     email: 'romain.biotech@gmail.com' },
  { id: 'bk1774892627033', from: 'ct1774891551680',     email: 'romain.biotech@gmail.com' },
  { id: 'bk1774891721672', from: 'ct1774891551680',     email: 'romain.biotech@gmail.com' },
  { id: 'bk1774891606042', from: 'ct1774891551680',     email: 'romain.biotech@gmail.com' },
  { id: 'bk1775468512404', from: 'ct1774907550965',     email: '' },
  { id: 'bk1774819397303', from: 'ct1774819397149pw56', email: '' },
  { id: 'bk1775795765152', from: 'ct17757957649807a5g', email: '' },
];

function snapshot(db, ids) {
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(
    `SELECT id, contactId, status, source, visitorName, visitorEmail, visitorPhone, date, time, companyId
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

  // Sanity 2 : tous les 7 contacts cibles des REMAPS doivent exister
  const uniqueTargets = [...new Set(REMAPS.map(r => r.to))];
  const missingTargets = [];
  for (const t of uniqueTargets) {
    const exists = db.prepare('SELECT 1 FROM contacts WHERE id = ?').get(t);
    if (!exists) missingTargets.push(t);
  }
  if (missingTargets.length > 0) {
    db.close();
    throw new Error('Contacts cibles manquants: ' + JSON.stringify(missingTargets));
  }

  // Étape pré : créer __deleted__ s'il n'existe pas (mirror exact de la tenant MonBilan)
  const placeholderBefore = db.prepare('SELECT id FROM contacts WHERE id = ?').get(DELETED_PLACEHOLDER);
  let placeholderCreated = false;
  if (!placeholderBefore) {
    db.prepare(`
      INSERT OR IGNORE INTO contacts (id, companyId, name, status, pipeline_stage)
      VALUES (?, ?, ?, ?, ?)
    `).run(DELETED_PLACEHOLDER, 'c-monbilan', '[Contact supprime]', 'prospect', 'nouveau');
    placeholderCreated = true;
  }

  // Sanity 3 : __deleted__ existe maintenant
  const placeholderAfter = db.prepare('SELECT id FROM contacts WHERE id = ?').get(DELETED_PLACEHOLDER);
  if (!placeholderAfter) {
    db.close();
    throw new Error("Le placeholder '__deleted__' n'a pas pu être créé. Aborted.");
  }

  // Snapshot AVANT
  const allIds = [...REMAPS.map(r => r.id), ...MARKS.map(m => m.id)];
  const before = snapshot(db, allIds);
  const beforeMap = new Map(before.map(r => [r.id, r]));

  const operations = [];

  const tx = db.transaction(() => {
    // 20 REMAPS
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

  // Re-audit : comptage final des bookings orphans (doit = 0 sur monolithe entier)
  const orphansAfter = db.prepare(`
    SELECT b.id, b.contactId, b.companyId, b.visitorEmail
    FROM bookings b
    LEFT JOIN contacts c ON c.id = b.contactId
    WHERE c.id IS NULL AND b.contactId IS NOT NULL AND b.contactId != ''
  `).all();

  const summary = {
    placeholder_created: placeholderCreated,
    remap_total: REMAPS.length,
    remap_applied: operations.filter(o => o.op === 'remap' && o.rows_changed === 1).length,
    remap_already_applied: operations.filter(o => o.op === 'remap' && o.rows_changed === 0).length,
    mark_total: MARKS.length,
    mark_applied: operations.filter(o => o.op === 'mark_deleted' && o.rows_changed === 1).length,
    mark_already_applied: operations.filter(o => o.op === 'mark_deleted' && o.rows_changed === 0).length,
    orphans_remaining_after_global: orphansAfter.length,
    orphans_remaining_details: orphansAfter,
  };

  db.close();

  return {
    phase: 'C-1',
    strategy: 'E (remap + mark __deleted__) replayed on monolithe + 2 test002',
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
