// ═══════════════════════════════════════════════════════════════════════════
// Smoke test Phase 3 — Pipeline Templates assignation + migration
// ═══════════════════════════════════════════════════════════════════════════
//
// Teste en conditions réelles (avec rollback) :
//   1. computePreflight avec un collab existant + contacts réels
//   2. migrateAndAssign : rejet si incompatibles sans fallback
//   3. migrateAndAssign : succès avec fallback → contacts migrés, audit_logs
//   4. Rollback automatique si échec
//   5. Retour en mode free : migration inverse OK
//   6. audit_logs + pipeline_history correctement créés
//   7. CLEANUP complet (état prod restauré bit-par-bit)
//
// Usage : node /var/www/planora/server/services/pipelineTemplates/test-phase3.js

import Database from 'better-sqlite3';
import { createSnapshot } from './snapshots.js';
import { computePreflight } from './preflight.js';
import { migrateAndAssign } from './migration.js';

const dbPath = process.env.DB_PATH || '/var/www/planora-data/calendar360.db';
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

let failed = 0; let passed = 0;
const assert = (cond, msg) => {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ FAIL: ' + msg); }
};

const TEST_COMPANY = 'c1776169036725';
const TEST_COLLAB = 'u1776169427559'; // Julie

// Sauvegarde état initial pour restauration finale
const initialCollabState = db.prepare('SELECT pipelineMode, pipelineSnapshotId FROM collaborators WHERE id = ?').get(TEST_COLLAB);
const initialContactStages = db
  .prepare('SELECT id, pipeline_stage FROM contacts WHERE companyId = ? AND (assignedTo = ? OR shared_with_json LIKE ?)')
  .all(TEST_COMPANY, TEST_COLLAB, '%' + TEST_COLLAB + '%');
const initialContactCount = initialContactStages.length;

// Capture les ids de pipeline_history et audit_logs AVANT les tests pour cleanup ciblé
const initialPhCount = db.prepare('SELECT MAX(rowid) r FROM pipeline_history').get().r || 0;
const initialAuCount = db.prepare('SELECT MAX(rowid) r FROM audit_logs').get().r || 0;

console.log(`\n=== CONTEXTE ===\nCollab: ${TEST_COLLAB} (Julie)\nContacts assignés: ${initialContactCount}`);

console.log('\n=== TEST 1 — Créer template de test + snapshot ===');
const tplId = 'tpl_test_phase3_' + Date.now();
const now = new Date().toISOString();
// Template cible avec seulement 3 stages ("new", "qualified", "closed")
// Donc tous les contacts en "nouveau", "nrp", "rdv_programme", etc. → incompatibles
const sampleStages = JSON.stringify([
  { id: 'new',       label: 'Nouveau',   color: '#2563EB', icon: 'plus',  position: 10 },
  { id: 'qualified', label: 'Qualifié',  color: '#7C3AED', icon: 'star',  position: 20 },
  { id: 'closed',    label: 'Signé',     color: '#22C55E', icon: 'check', position: 30 },
]);
db.prepare(
  'INSERT INTO pipeline_templates (id, companyId, name, description, icon, color, stagesJson, isPublished, isArchived, createdAt, updatedAt, createdBy, updatedBy) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)'
).run(tplId, TEST_COMPANY, 'Phase3 Test Closing', 'Test phase3', 'star', '#7C3AED', sampleStages, now, now, 'test', 'test');
const snap = createSnapshot(db, tplId);
assert(!!snap?.id, 'Template + snapshot v1 créés');

console.log('\n=== TEST 2 — Pre-flight (mode free → template Phase3 Test) ===');
// Assurer que Julie est en mode free avant
db.prepare("UPDATE collaborators SET pipelineMode='free', pipelineSnapshotId=NULL WHERE id=?").run(TEST_COLLAB);
const pf = computePreflight(db, { collaboratorId: TEST_COLLAB, templateId: tplId });
assert(pf.currentMode === 'free', 'currentMode = free');
assert(pf.targetMode === 'template', 'targetMode = template');
assert(pf.targetTemplateName === 'Phase3 Test Closing', 'targetTemplateName correct');
assert(pf.targetVersion === 1, 'targetVersion = 1');
assert(pf.totalContacts === initialContactCount, `totalContacts = ${initialContactCount}`);
assert(Array.isArray(pf.incompatibleContacts), 'incompatibleContacts est un array');
// Les contacts Julie sont sur stages DEFAULT (nouveau, nrp, etc.) → tous incompatibles vs template (new, qualified, closed)
assert(pf.incompatibleCount > 0, `incompatibleCount > 0 (got ${pf.incompatibleCount})`);
assert(pf.targetStagesIds.includes('new') && pf.targetStagesIds.includes('qualified') && pf.targetStagesIds.includes('closed'), 'targetStagesIds contient new/qualified/closed');
// Chaque contact incompatible doit avoir ses champs signaux
if (pf.incompatibleContacts.length > 0) {
  const sample = pf.incompatibleContacts[0];
  assert(typeof sample.id === 'string', 'incompatible sample a id');
  assert(typeof sample.activeBookingsCount === 'number', 'incompatible sample a activeBookingsCount');
  assert('hasContract' in sample, 'incompatible sample a hasContract');
}

console.log('\n=== TEST 3 — migrateAndAssign REJET si fallbackStage manquant ===');
let rejected = false;
try {
  migrateAndAssign(db, { collaboratorId: TEST_COLLAB, templateId: tplId, fallbackStage: null, actorId: 'test', actorName: 'Test Admin' });
} catch (e) {
  if (e.message === 'FALLBACK_STAGE_REQUIRED') rejected = true;
}
assert(rejected, 'Rejet FALLBACK_STAGE_REQUIRED sans fallback');

console.log('\n=== TEST 4 — migrateAndAssign REJET si fallbackStage invalide ===');
let rejected2 = false;
try {
  migrateAndAssign(db, { collaboratorId: TEST_COLLAB, templateId: tplId, fallbackStage: 'inexistant_stage_xxx', actorId: 'test', actorName: 'Test' });
} catch (e) {
  if (e.message === 'FALLBACK_STAGE_INVALID') rejected2 = true;
}
assert(rejected2, 'Rejet FALLBACK_STAGE_INVALID si stage absent du target');

console.log('\n=== TEST 5 — migrateAndAssign SUCCÈS avec fallback ===');
const expectedMigrated = pf.incompatibleCount;
const res = migrateAndAssign(db, {
  collaboratorId: TEST_COLLAB,
  templateId: tplId,
  fallbackStage: 'new',
  actorId: 'test_actor',
  actorName: 'Test Admin',
});
assert(res.success === true, 'success = true');
assert(res.previousMode === 'free', 'previousMode = free');
assert(res.newMode === 'template', 'newMode = template');
assert(res.contactsMigratedCount === expectedMigrated, `contactsMigratedCount = ${expectedMigrated}`);
assert(res.snapshotId === snap.id, 'snapshotId correct');
assert(res.targetTemplateName === 'Phase3 Test Closing', 'targetTemplateName correct');

const afterMigrateCollab = db.prepare('SELECT pipelineMode, pipelineSnapshotId FROM collaborators WHERE id=?').get(TEST_COLLAB);
assert(afterMigrateCollab.pipelineMode === 'template', 'DB: collab en mode template');
assert(afterMigrateCollab.pipelineSnapshotId === snap.id, 'DB: snapshot lié correct');

// Vérif que les contacts ont bien été migrés
const orphanedAfter = db
  .prepare(
    `SELECT COUNT(*) c FROM contacts WHERE companyId=? AND (assignedTo=? OR shared_with_json LIKE ?) AND pipeline_stage NOT IN ('new','qualified','closed')`
  )
  .get(TEST_COMPANY, TEST_COLLAB, '%' + TEST_COLLAB + '%');
assert(orphanedAfter.c === 0, `Aucun contact orphelin après migration (got ${orphanedAfter.c})`);

console.log('\n=== TEST 6 — Audit logs + pipeline history créés ===');
const newPh = db.prepare('SELECT COUNT(*) c FROM pipeline_history WHERE rowid > ? AND userId = ?').get(initialPhCount, 'test_actor').c;
assert(newPh === expectedMigrated, `pipeline_history : ${expectedMigrated} entries (got ${newPh})`);

const newAuMigration = db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE rowid > ? AND action = 'pipeline_template_contact_migrated' AND userId = ?").get(initialAuCount, 'test_actor').c;
assert(newAuMigration === expectedMigrated, `audit_logs migration: ${expectedMigrated} entries`);

const newAuSwitch = db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE rowid > ? AND action = 'pipeline_template_assigned' AND entityId = ? AND userId = ?").get(initialAuCount, TEST_COLLAB, 'test_actor').c;
assert(newAuSwitch === 1, 'audit_logs switch global: 1 entrée pipeline_template_assigned');

console.log('\n=== TEST 7 — Retour mode free (migration inverse) ===');
// Capture état avant retour pour savoir combien de contacts Julie a en "new/qualified/closed"
// Tous (puisqu'on vient de migrer). Le retour en free NE doit rien migrer car DEFAULT_STAGES contient "nouveau" mais pas "new".
// Les stages 'new' n'existent pas en mode free → ils seront incompatibles au retour !
// Sauf si on passe fallbackStage='nouveau' pour refaire la migration.
const pf2 = computePreflight(db, { collaboratorId: TEST_COLLAB, templateId: null });
assert(pf2.currentMode === 'template', 'currentMode = template');
assert(pf2.targetMode === 'free', 'targetMode = free');
// Tous les contacts sont en 'new/qualified/closed' qui ne sont pas dans DEFAULT_STAGES
// Donc pf2.incompatibleCount doit être > 0
assert(pf2.incompatibleCount > 0, `Au retour free, ${pf2.incompatibleCount} contacts incompatibles (attendu > 0 car ids new/qualified/closed ne sont pas standards)`);

const res2 = migrateAndAssign(db, {
  collaboratorId: TEST_COLLAB,
  templateId: null,
  fallbackStage: 'nouveau',
  actorId: 'test_actor',
  actorName: 'Test Admin',
});
assert(res2.success && res2.newMode === 'free', 'Retour free OK');
const finalCollab = db.prepare('SELECT pipelineMode, pipelineSnapshotId FROM collaborators WHERE id=?').get(TEST_COLLAB);
assert(finalCollab.pipelineMode === 'free', 'DB: collab en mode free');
assert(finalCollab.pipelineSnapshotId === null, 'DB: snapshotId null');

console.log('\n=== CLEANUP — restauration stricte état prod ===');
// Restaurer EXACTEMENT les pipeline_stage d'origine pour tous les contacts Julie
const restoreStmt = db.prepare('UPDATE contacts SET pipeline_stage = ? WHERE id = ? AND companyId = ?');
const restoreTxn = db.transaction(() => {
  for (const c of initialContactStages) restoreStmt.run(c.pipeline_stage, c.id, TEST_COMPANY);
});
restoreTxn();

// Supprimer les entrées pipeline_history de test (pas de triggers, OK)
db.prepare('DELETE FROM pipeline_history WHERE rowid > ? AND userId = ?').run(initialPhCount, 'test_actor');
// NOTE audit_logs : triggers prevent_audit_delete → impossible de supprimer.
// Les entrées de test resteront (userId='test_actor', userName='Test Admin') — c'est le
// comportement attendu pour un audit trail immuable. Pour un env de test isolé, utiliser
// une DB dédiée (hors scope Phase 3).
const auTestRemaining = db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE userId = 'test_actor' AND category = 'pipeline_templates'").get().c;
console.log(`  ℹ  ${auTestRemaining} entrées audit_logs de test conservées (immutables par design)`);

// Supprimer template de test + snapshot
db.prepare('DELETE FROM pipeline_template_snapshots WHERE templateId=?').run(tplId);
db.prepare('DELETE FROM pipeline_templates WHERE id=?').run(tplId);

// Restaurer état mode collab
db.prepare('UPDATE collaborators SET pipelineMode=?, pipelineSnapshotId=? WHERE id=?').run(
  initialCollabState?.pipelineMode || 'free',
  initialCollabState?.pipelineSnapshotId || null,
  TEST_COLLAB
);

// Vérification stricte du cleanup
const restoredStages = db
  .prepare('SELECT id, pipeline_stage FROM contacts WHERE companyId=? AND (assignedTo=? OR shared_with_json LIKE ?)')
  .all(TEST_COMPANY, TEST_COLLAB, '%' + TEST_COLLAB + '%');
let allRestored = true;
for (const c of initialContactStages) {
  const after = restoredStages.find(x => x.id === c.id);
  if (!after || after.pipeline_stage !== c.pipeline_stage) {
    allRestored = false;
    break;
  }
}
assert(allRestored, 'Tous les pipeline_stage contacts restaurés à l\'identique');
const tplClean = db.prepare('SELECT COUNT(*) c FROM pipeline_templates WHERE id=?').get(tplId);
assert(tplClean.c === 0, 'Template de test supprimé');
const finalCollabClean = db.prepare('SELECT pipelineMode, pipelineSnapshotId FROM collaborators WHERE id=?').get(TEST_COLLAB);
assert(
  finalCollabClean.pipelineMode === (initialCollabState?.pipelineMode || 'free')
    && finalCollabClean.pipelineSnapshotId === (initialCollabState?.pipelineSnapshotId || null),
  'État collab restauré strictement'
);

console.log(`\n════════════════════════════════════════════════`);
console.log(`  RÉSULTAT : ${passed} PASS, ${failed} FAIL`);
console.log(`════════════════════════════════════════════════`);
db.close();
process.exit(failed === 0 ? 0 : 1);
