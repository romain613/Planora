// ═══════════════════════════════════════════════════════════════════════════
// Smoke test Phase 1 — Pipeline Templates backend foundation
// ═══════════════════════════════════════════════════════════════════════════
//
// Teste :
//   1. Schéma DB en place (tables + colonnes)
//   2. resolvePipelineStages() en mode free (défaut legacy) — sortie correcte
//   3. Création template + publish + snapshot — logique OK
//   4. assignTemplateSnapshotToCollab() bascule le mode
//   5. resolvePipelineStages() en mode template — sortie correcte avec readOnly
//   6. Fallback défensif : snapshot inexistant → dégrade en mode free avec warning
//   7. Cleanup complet : tout est rollback à la fin, zéro pollution prod
//
// Usage : node /var/www/planora/server/services/pipelineTemplates/test-phase1.js

import Database from 'better-sqlite3';
import { resolvePipelineStages } from './resolve.js';
import { createSnapshot, assignTemplateSnapshotToCollab, getSnapshot } from './snapshots.js';

const dbPath = process.env.DB_PATH || '/var/www/planora-data/calendar360.db';
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

let failed = 0;
let passed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ FAIL: ' + msg); }
}

// Company + collab de test (CapFinances + Julie en existence prod)
const TEST_COMPANY = 'c1776169036725';
const TEST_COLLAB = 'u1776169427559'; // Julie

// Garder l'état initial pour restauration
const initialCollabState = db.prepare('SELECT pipelineMode, pipelineSnapshotId FROM collaborators WHERE id = ?').get(TEST_COLLAB);

console.log('\n=== TEST 1 — Schéma DB ===');
const tplTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pipeline_templates'").get();
assert(!!tplTable, 'Table pipeline_templates existe');
const snapTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pipeline_template_snapshots'").get();
assert(!!snapTable, 'Table pipeline_template_snapshots existe');
const colInfo = db.prepare("PRAGMA table_info('collaborators')").all();
assert(colInfo.some(c => c.name === 'pipelineMode'), 'Colonne collaborators.pipelineMode existe');
assert(colInfo.some(c => c.name === 'pipelineSnapshotId'), 'Colonne collaborators.pipelineSnapshotId existe');

console.log('\n=== TEST 2 — resolvePipelineStages en mode free (défaut legacy) ===');
// Sécurité: s'assurer que le collab est bien en free avant le test
db.prepare("UPDATE collaborators SET pipelineMode='free', pipelineSnapshotId=NULL WHERE id=?").run(TEST_COLLAB);
const r1 = resolvePipelineStages(db, { companyId: TEST_COMPANY, collaboratorId: TEST_COLLAB });
assert(r1.mode === 'free', 'Mode = free');
assert(r1.readOnly === false, 'readOnly = false');
assert(r1.templateMeta === null, 'templateMeta = null');
assert(Array.isArray(r1.stages) && r1.stages.length >= 7, `Au moins 7 stages (got ${r1.stages.length})`);
assert(r1.stages[0].id === 'nouveau', 'Premier stage = nouveau');
assert(r1.stages.find(s => s.id === 'perdu'), 'Stage perdu présent');

console.log('\n=== TEST 3 — Création template + publish + snapshot ===');
const tplId = 'tpl_test_phase1_' + Date.now();
const now = new Date().toISOString();
const sampleStages = JSON.stringify([
  { id: 'new_lead', label: 'Nouveau lead', color: '#2563EB', icon: 'plus', position: 10 },
  { id: 'qualified', label: 'Qualifié', color: '#7C3AED', icon: 'star', position: 20 },
  { id: 'closed', label: 'Signé', color: '#22C55E', icon: 'check', position: 30 },
]);
db.prepare(
  'INSERT INTO pipeline_templates (id, companyId, name, description, icon, color, stagesJson, isPublished, isArchived, createdAt, updatedAt, createdBy, updatedBy) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)'
).run(tplId, TEST_COMPANY, 'Test Closing Phase1', 'Template de test', 'star', '#FF0000', sampleStages, now, now, 'test', 'test');
const tpl = db.prepare('SELECT * FROM pipeline_templates WHERE id=?').get(tplId);
assert(!!tpl && tpl.name === 'Test Closing Phase1', 'Template inséré avec bon nom');

const snap = createSnapshot(db, tplId);
assert(snap.version === 1, 'Snapshot v1 créé');
assert(snap.id.startsWith('snap_'), 'Snapshot ID bien formé');
assert(snap.stagesJson === sampleStages, 'stagesJson du snapshot correct');

// Deuxième snapshot pour tester le versioning
const snap2 = createSnapshot(db, tplId);
assert(snap2.version === 2, 'Snapshot v2 incrémenté correctement');

console.log('\n=== TEST 4 — assignTemplateSnapshotToCollab (bascule mode) ===');
const ar = assignTemplateSnapshotToCollab(db, TEST_COLLAB, snap.id);
assert(ar.previous.pipelineMode === 'free', 'État avant : free');
assert(ar.current.pipelineMode === 'template', 'État après : template');
assert(ar.current.pipelineSnapshotId === snap.id, 'Snapshot ID assigné');
const collabAfter = db.prepare('SELECT pipelineMode, pipelineSnapshotId FROM collaborators WHERE id=?').get(TEST_COLLAB);
assert(collabAfter.pipelineMode === 'template', 'DB: collab en mode template');
assert(collabAfter.pipelineSnapshotId === snap.id, 'DB: snapshot lié');

console.log('\n=== TEST 5 — resolvePipelineStages en mode template ===');
const r2 = resolvePipelineStages(db, { companyId: TEST_COMPANY, collaboratorId: TEST_COLLAB });
assert(r2.mode === 'template', 'Mode = template');
assert(r2.readOnly === true, 'readOnly = true');
assert(r2.templateMeta !== null, 'templateMeta non-null');
assert(r2.templateMeta.templateId === tplId, 'templateMeta.templateId correct');
assert(r2.templateMeta.version === 1, 'templateMeta.version = 1');
assert(r2.templateMeta.name === 'Test Closing Phase1', 'templateMeta.name correct');
assert(r2.stages.length === 3, `Stages = 3 (got ${r2.stages.length})`);
assert(r2.stages[0].id === 'new_lead', 'Premier stage = new_lead (depuis snapshot, pas DEFAULT_STAGES)');

console.log('\n=== TEST 6 — Fallback défensif : snapshot corrompu ===');
// Cas 6a : snapshot introuvable
db.prepare("UPDATE collaborators SET pipelineSnapshotId='snap_nonexistent_zzz' WHERE id=?").run(TEST_COLLAB);
const r3 = resolvePipelineStages(db, { companyId: TEST_COMPANY, collaboratorId: TEST_COLLAB });
assert(r3.mode === 'free', 'Fallback snapshot absent → mode free');
assert(r3._warning === 'snapshot_not_found', `_warning = snapshot_not_found (got ${r3._warning})`);
assert(r3.stages.length >= 7, 'Stages free retournés malgré fallback');

// Cas 6b : snapshot avec JSON invalide
const badSnapId = 'snap_bad_phase1_' + Date.now();
db.prepare('INSERT INTO pipeline_template_snapshots (id, templateId, version, stagesJson, createdAt) VALUES (?, ?, ?, ?, ?)').run(badSnapId, tplId, 99, '{bad json', now);
db.prepare("UPDATE collaborators SET pipelineMode='template', pipelineSnapshotId=? WHERE id=?").run(badSnapId, TEST_COLLAB);
const r4 = resolvePipelineStages(db, { companyId: TEST_COMPANY, collaboratorId: TEST_COLLAB });
assert(r4.mode === 'free', 'Fallback JSON corrompu → mode free');
assert(r4._warning === 'snapshot_invalid_json', `_warning = snapshot_invalid_json (got ${r4._warning})`);

console.log('\n=== TEST 7 — Retour en mode free via assignTemplateSnapshotToCollab(null) ===');
const ar2 = assignTemplateSnapshotToCollab(db, TEST_COLLAB, null);
assert(ar2.current.pipelineMode === 'free', 'Retour mode free OK');
assert(ar2.current.pipelineSnapshotId === null, 'SnapshotId effacé');

console.log('\n=== CLEANUP ===');
// Supprimer le snapshot corrompu, les snapshots de test, le template de test
db.prepare('DELETE FROM pipeline_template_snapshots WHERE templateId=?').run(tplId);
db.prepare('DELETE FROM pipeline_template_snapshots WHERE id=?').run(badSnapId);
db.prepare('DELETE FROM pipeline_templates WHERE id=?').run(tplId);
// Restaurer l'état initial du collab
db.prepare('UPDATE collaborators SET pipelineMode=?, pipelineSnapshotId=? WHERE id=?').run(
  initialCollabState?.pipelineMode || 'free',
  initialCollabState?.pipelineSnapshotId || null,
  TEST_COLLAB
);
const cleanCheck = db.prepare('SELECT COUNT(*) c FROM pipeline_templates WHERE id=?').get(tplId);
assert(cleanCheck.c === 0, 'Template de test supprimé (cleanup OK)');
const restored = db.prepare('SELECT pipelineMode, pipelineSnapshotId FROM collaborators WHERE id=?').get(TEST_COLLAB);
assert(restored.pipelineMode === (initialCollabState?.pipelineMode || 'free'), 'État collab restauré');

console.log(`\n════════════════════════════════════════════════`);
console.log(`  RÉSULTAT : ${passed} PASS, ${failed} FAIL`);
console.log(`════════════════════════════════════════════════`);
db.close();
process.exit(failed === 0 ? 0 : 1);
