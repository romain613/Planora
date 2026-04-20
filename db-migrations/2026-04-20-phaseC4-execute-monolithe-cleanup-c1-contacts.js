#!/usr/bin/env node
/**
 * PHASE C-4 — Cleanup 40 contacts companyId='c1' (2026-04-20)
 *
 * Périmètre : MONOLITHE (`calendar360.db`) UNIQUEMENT.
 * Action : DELETE des 40 contacts polluants `companyId='c1'` (fixtures démo
 *          créées le 2026-04-09 en 4 batchs de 10 via le bug `useState(COMPANIES[0])`).
 *
 * NE TOUCHE PAS :
 *   - La company `c1` (Calendar360) elle-même (vraie company en base)
 *   - Le 1 collab + 1 calendar + 283 tickets restants sur c1
 *   - Aucun autre `companyId`
 *
 * Pré-requis (vérifié en pré-flight) :
 *   - Frontend fix (App.jsx:219 useState(null)) déployé en prod (sinon les 40
 *     se recréeront)
 *   - 0 référence FK vers les 40 contactIds dans 17 tables vérifiées
 *
 * Idempotent :
 *   - Snapshot des 40 ids AVANT la transaction
 *   - DELETE par id (filtré explicite), 0 row au 2e run
 *
 * Garanties :
 *   - DELETE uniquement sur `companyId='c1'` ET id IN (les 40 snapshotés)
 *   - Aucune activation FK
 *   - Aucune modification de schéma
 *   - Aucune autre table touchée
 *   - Transaction atomique (rollback automatique si erreur)
 *   - integrity_check avant + après
 *   - Audit JSON complet (snapshot des 40 contacts avant suppression)
 *   - Anti-dérive : si != 40 contacts c1 trouvés, abort
 */

const Database = require('/var/www/planora/server/node_modules/better-sqlite3');

const DB_PATH = '/var/www/planora-data/calendar360.db';
const TARGET_COMPANY_ID = 'c1';
const EXPECTED_COUNT = 40;

// Tables avec colonne `contactId` à vérifier en pré-flight (FK refs)
const FK_TABLES_WITH_CONTACT_ID = [
  'bookings', 'call_logs', 'contact_followers',
  'conversations', 'pipeline_history', 'sms_messages', 'notifications',
  'ai_copilot_analyses', 'call_contexts', 'recommended_actions',
  'call_form_responses', 'client_messages', 'contact_documents',
  'contact_ai_memory', 'call_transcript_archive', 'contact_status_history',
  'system_anomaly_logs',
];

function run() {
  const db = new Database(DB_PATH);
  const startedAt = new Date().toISOString();

  // Sanity 1 : intégrité
  const intBefore = db.prepare('PRAGMA integrity_check').get().integrity_check;
  if (intBefore !== 'ok') { db.close(); throw new Error(`integrity_check FAILED before: ${intBefore}`); }

  // Sanity 2 : la company c1 existe (NE PAS la supprimer, juste vérifier qu'elle est bien là)
  const c1company = db.prepare('SELECT id, name FROM companies WHERE id = ?').get(TARGET_COMPANY_ID);
  if (!c1company) {
    db.close();
    throw new Error(`SAFETY: company c1 introuvable. Aborting (DB inattendue).`);
  }

  // Snapshot AVANT : récupérer les 40 contacts à delete
  const targetContacts = db.prepare(`
    SELECT id, companyId, COALESCE(firstname,'') AS firstname, COALESCE(lastname,'') AS lastname,
           COALESCE(name,'') AS name, COALESCE(email,'') AS email, COALESCE(phone,'') AS phone,
           COALESCE(source,'') AS source, COALESCE(createdAt,'') AS createdAt,
           COALESCE(pipeline_stage,'') AS pipeline_stage,
           COALESCE(contract_status,'') AS contract_status, totalBookings
    FROM contacts WHERE companyId = ?
    ORDER BY createdAt, id
  `).all(TARGET_COMPANY_ID);

  // Sanity 3 : count = 40 attendu (anti-dérive)
  if (targetContacts.length !== EXPECTED_COUNT) {
    db.close();
    throw new Error(`SAFETY: ${EXPECTED_COUNT} contacts c1 attendus, ${targetContacts.length} trouvés. Aborting.`);
  }

  const targetIds = targetContacts.map(c => c.id);

  // Sanity 4 : 0 référence FK vers ces 40 ids dans toutes les tables avec colonne contactId
  const fkRefsCheck = {};
  let totalRefs = 0;
  for (const tbl of FK_TABLES_WITH_CONTACT_ID) {
    // Vérifier que la table existe (pour éviter erreur sur tables manquantes)
    const tblExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(tbl);
    if (!tblExists) { fkRefsCheck[tbl] = 'table-not-found'; continue; }

    // Vérifier que la colonne contactId existe
    const cols = db.prepare(`PRAGMA table_info(${tbl})`).all();
    if (!cols.some(c => c.name === 'contactId')) { fkRefsCheck[tbl] = 'no-contactId-column'; continue; }

    const placeholders = targetIds.map(() => '?').join(',');
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${tbl} WHERE contactId IN (${placeholders})`).all(...targetIds)[0].n;
    fkRefsCheck[tbl] = n;
    totalRefs += n;
  }

  if (totalRefs > 0) {
    db.close();
    throw new Error(`SAFETY: ${totalRefs} FK refs détectées vers les 40 c1 contacts. Aborting (préserver l'historique).`);
  }

  // === TRANSACTION : DELETE des 40 contacts ===
  let deletedCount = 0;
  const tx = db.transaction(() => {
    const stmt = db.prepare("DELETE FROM contacts WHERE companyId = ? AND id = ?");
    for (const cid of targetIds) {
      const result = stmt.run(TARGET_COMPANY_ID, cid);
      deletedCount += result.changes;
    }
  });
  tx();

  // Sanity 5 : intégrité APRÈS
  const intAfter = db.prepare('PRAGMA integrity_check').get().integrity_check;
  if (intAfter !== 'ok') { db.close(); throw new Error(`integrity_check FAILED after: ${intAfter}`); }

  // Re-audit : combien de contacts c1 restent ?
  const c1Remaining = db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE companyId = ?").get(TARGET_COMPANY_ID).n;

  // Re-audit : count global contacts
  const totalContactsAfter = db.prepare("SELECT COUNT(*) AS n FROM contacts").get().n;

  // Re-audit : c1 company toujours en base, intacte
  const c1CompanyAfter = db.prepare('SELECT id, name FROM companies WHERE id = ?').get(TARGET_COMPANY_ID);

  db.close();

  return {
    phase: 'C-4',
    strategy: 'DELETE 40 contacts polluants companyId=c1 (post-fix frontend)',
    audit_storage: 'JSON in git (option C)',
    target_db: 'monolithe (calendar360.db)',
    db_path: DB_PATH,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    integrity_before: intBefore,
    integrity_after: intAfter,
    summary: {
      target_company_id: TARGET_COMPANY_ID,
      expected_count: EXPECTED_COUNT,
      contacts_deleted: deletedCount,
      contacts_c1_remaining: c1Remaining,
      total_contacts_after: totalContactsAfter,
      fk_refs_check: fkRefsCheck,
      total_fk_refs_found: totalRefs,
      c1_company_still_intact: c1CompanyAfter ? `${c1CompanyAfter.id} (${c1CompanyAfter.name})` : 'MISSING (PROBLEM)',
    },
    deleted_contacts_snapshot: targetContacts,
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
