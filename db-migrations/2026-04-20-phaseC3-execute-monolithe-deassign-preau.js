#!/usr/bin/env node
/**
 * PHASE C-3 — Dé-assignation Préau (2026-04-20)
 *
 * Périmètre : MONOLITHE (`calendar360.db`) UNIQUEMENT.
 * Action : 1 seul UPDATE sur le contact Préau pour vider `assignedTo`.
 *
 * NE TOUCHE PAS :
 *   - efef efef (ct1774872603359) — réservé pour phase future "nettoyage tests"
 *   - Aucun autre contact
 *
 * Idempotent :
 *   - WHERE assignedTo='u1774811266836' filtre l'opération
 *   - Re-run = 0 row touchée (assignedTo déjà vidé)
 *
 * Garanties :
 *   - Aucun DELETE
 *   - Aucune activation FK
 *   - Aucune modification de schéma
 *   - Transaction (1 UPDATE)
 *   - integrity_check avant + après
 *   - Audit JSON (before/after du contact)
 */

const Database = require('/var/www/planora/server/node_modules/better-sqlite3');

const DB_PATH = '/var/www/planora-data/calendar360.db';

const PREAU_ID = 'ct1774812199599';
const PREAU_OLD_ASSIGNED_TO = 'u1774811266836'; // collab inexistant
const EFEF_ID = 'ct1774872603359'; // intouché

function snapshot(db, ids) {
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(
    `SELECT id, COALESCE(firstname,'') AS firstname, COALESCE(lastname,'') AS lastname,
            COALESCE(name,'') AS name, COALESCE(email,'') AS email, COALESCE(phone,'') AS phone,
            companyId, COALESCE(assignedTo,'') AS assignedTo
     FROM contacts WHERE id IN (${placeholders})`
  ).all(...ids);
}

function run() {
  const db = new Database(DB_PATH);
  const startedAt = new Date().toISOString();

  // Sanity 1 : intégrité
  const intBefore = db.prepare('PRAGMA integrity_check').get().integrity_check;
  if (intBefore !== 'ok') { db.close(); throw new Error(`integrity_check FAILED before: ${intBefore}`); }

  // Sanity 2 : Préau existe
  const preau = db.prepare('SELECT id, assignedTo FROM contacts WHERE id = ?').get(PREAU_ID);
  if (!preau) { db.close(); throw new Error(`Contact Préau ${PREAU_ID} introuvable`); }

  // Sanity 3 : confirm que collab cible n'existe vraiment pas
  const collab = db.prepare('SELECT id FROM collaborators WHERE id = ?').get(PREAU_OLD_ASSIGNED_TO);
  if (collab) {
    db.close();
    throw new Error(`SAFETY: collab ${PREAU_OLD_ASSIGNED_TO} existe dans collaborators. Le dé-assignation n'est plus justifié. Aborting.`);
  }

  // Sanity 4 : confirm que efef existe (pour vérifier qu'on l'a pas accidentellement touché en sortie)
  const efefBefore = snapshot(db, [EFEF_ID]);
  if (efefBefore.length !== 1) { db.close(); throw new Error(`Contact efef ${EFEF_ID} introuvable (pré)`); }

  const beforeRow = snapshot(db, [PREAU_ID])[0];

  const tx = db.transaction(() => {
    const stmt = db.prepare("UPDATE contacts SET assignedTo = '' WHERE id = ? AND assignedTo = ?");
    const result = stmt.run(PREAU_ID, PREAU_OLD_ASSIGNED_TO);
    return result.changes;
  });
  const rowsChanged = tx();

  const afterRow = snapshot(db, [PREAU_ID])[0];
  const efefAfter = snapshot(db, [EFEF_ID]);

  // Sanity 5 : intégrité
  const intAfter = db.prepare('PRAGMA integrity_check').get().integrity_check;
  if (intAfter !== 'ok') { db.close(); throw new Error(`integrity_check FAILED after: ${intAfter}`); }

  // Sanity 6 : efef row inchangée
  const efefUntouched = JSON.stringify(efefBefore[0]) === JSON.stringify(efefAfter[0]);
  if (!efefUntouched) {
    db.close();
    throw new Error('SAFETY: efef row a changé alors qu\'il devait être intouché');
  }

  // Re-audit : combien de contacts encore assignés à un collab inexistant ?
  const remainingOrphans = db.prepare(`
    SELECT c.id, COALESCE(c.firstname,'') || ' ' || COALESCE(c.lastname,'') || ' ' || COALESCE(c.name,'') AS nom,
           c.email, c.companyId, c.assignedTo
    FROM contacts c
    LEFT JOIN collaborators co ON co.id = c.assignedTo
    WHERE co.id IS NULL AND c.assignedTo IS NOT NULL AND c.assignedTo != ''
    ORDER BY c.id
  `).all();

  db.close();

  return {
    phase: 'C-3',
    strategy: 'Dé-assignation Préau (1 UPDATE), efef intouché',
    audit_storage: 'JSON in git (option C)',
    target_db: 'monolithe (calendar360.db)',
    db_path: DB_PATH,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    integrity_before: intBefore,
    integrity_after: intAfter,
    summary: {
      preau_rows_changed: rowsChanged,
      preau_already_applied: rowsChanged === 0,
      efef_intouched: efefUntouched,
      contacts_to_collab_orphans_remaining_global: remainingOrphans.length,
      contacts_to_collab_orphans_remaining_details: remainingOrphans,
    },
    operation: {
      op: 'deassign',
      contact_id: PREAU_ID,
      before_assignedTo: PREAU_OLD_ASSIGNED_TO,
      after_assignedTo: '',
      reason: 'collab inexistant dans table collaborators',
      before_row: beforeRow,
      after_row: afterRow,
    },
    efef_check: {
      id: EFEF_ID,
      before: efefBefore[0],
      after: efefAfter[0],
    },
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
