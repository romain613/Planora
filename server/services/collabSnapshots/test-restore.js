// Phase R1 (V1.10.0) — Test CLI standalone du flow restore complet.
//
// Usage :
//   cd /var/www/planora/server
//   node services/collabSnapshots/test-restore.js [snapshotId]
//
// Si snapshotId omis : prend le snapshot 'auto' le plus récent (read-only sanity check).
// Avec snapshotId : exécute le flow COMPLET (preview → restore → vérifie reversibility).
//
// ATTENTION : ce test EFFECTUE une vraie restauration. À utiliser sur un snapshot
// dont le collab cible est OK pour reset (test ou dev). Toujours réversible via
// le pre-restore snapshot retourné.

import { db } from '../../db/database.js';
import { readSnapshot } from './readSnapshot.js';
import { previewRestore } from './previewRestore.js';
import { restoreSnapshot } from './restoreSnapshot.js';
import { computeCollabFingerprint } from './fingerprint.js';

const arg = process.argv[2];
const targetId = arg ? Number(arg) : null;

console.log('=== test-restore.js — V1.10.0 ===\n');

// ────────────────────────────────────────────────────────────
// SCÉNARIO A : sanity check read-only (sans argument)
// ────────────────────────────────────────────────────────────
if (!targetId) {
  console.log('[Mode] Sanity check read-only (pas de restore appliquée)\n');

  const last = db
    .prepare(
      "SELECT id, companyId, collabId, kind, datetime(createdAt/1000,'unixepoch') as created, payloadSizeBytes, rowCount " +
        'FROM collab_snapshots ORDER BY createdAt DESC LIMIT 1'
    )
    .get();

  if (!last) {
    console.log('Aucun snapshot en base. Impossible de tester.');
    process.exit(1);
  }

  console.log(`[1/3] Snapshot le plus récent : id=${last.id} collab=${last.collabId} created=${last.created} (${last.payloadSizeBytes} bytes / ${last.rowCount} rows)\n`);

  console.log('[2/3] Test readSnapshot()...');
  const { snap, payload } = readSnapshot(last.id);
  console.log(`  ✓ payload.meta.version = ${payload.meta.version}`);
  console.log(`  ✓ payload.meta.builtAt = ${payload.meta.builtAtIso}`);
  console.log(`  ✓ payload.meta.totalRows = ${payload.meta.totalRows}`);
  console.log(`  ✓ payload.meta.contactIdsCount = ${payload.meta.contactIdsCount}`);
  console.log(`  ✓ tables: ${Object.keys(payload.tables).length}`);

  console.log('\n[3/3] Test previewRestore()...');
  const preview = previewRestore(last.id);
  console.log(`  ✓ willRestore (write-safe) : ${Object.keys(preview.willRestore).length} tables`);
  console.log(`  ✓ willSkip (read-only) : ${preview.willSkip.length} tables`);
  console.log(`  ✓ warnings : ${preview.warnings.length}`);
  console.log('\n  willRestore counts (sample) :');
  Object.entries(preview.willRestore).slice(0, 5).forEach(([k, v]) => {
    const curr = preview.counts.current[k];
    console.log(`    - ${k}: snapshot=${v} current=${curr ?? '?'}`);
  });

  if (preview.warnings.length > 0) {
    console.log('\n  warnings :');
    preview.warnings.slice(0, 5).forEach((w) => console.log(`    [${w.kind}] ${w.message}: ${w.detail || ''}`));
  }

  console.log('\n✅ Sanity check OK. Pour tester un restore réel : node test-restore.js <snapshotId>');
  process.exit(0);
}

// ────────────────────────────────────────────────────────────
// SCÉNARIO B : restore réel + reversibility (avec argument)
// ────────────────────────────────────────────────────────────
console.log(`[Mode] Restore RÉEL du snapshot id=${targetId} (avec reversibility check)\n`);

// Étape 1 : preview
console.log('[1/6] previewRestore()...');
const preview = previewRestore(targetId);
const { collabId, companyId } = preview.snapshot;
console.log(`  Snapshot ${targetId} : collab=${collabId} kind=${preview.snapshot.kind} fp=${preview.snapshot.fingerprint.slice(0, 8)}...`);
console.log(`  willRestore: ${Object.keys(preview.willRestore).length} tables, willSkip: ${preview.willSkip.length}, warnings: ${preview.warnings.length}\n`);

// Étape 2 : fingerprint AVANT
console.log('[2/6] Fingerprint avant restore...');
const fpBefore = computeCollabFingerprint({ companyId, collabId });
console.log(`  fp_before = ${fpBefore.slice(0, 16)}...\n`);

// Étape 3 : restore
console.log('[3/6] restoreSnapshot()...');
const result = restoreSnapshot({
  snapshotId: targetId,
  actorType: 'admin',
  actorId: 'cli-test',
  actorName: 'CLI test-restore.js',
  reason: 'cli-test-r1-v1100',
});
console.log(`  ✓ success=${result.success}`);
console.log(`  ✓ preRestoreSnapshotId=${result.preRestoreSnapshotId} (reversibility 7j)`);
console.log(`  ✓ beforeFingerprint=${result.beforeFingerprint.slice(0, 16)}...`);
console.log(`  ✓ afterFingerprint=${result.afterFingerprint.slice(0, 16)}...`);
console.log(`  ✓ restored: ${Object.keys(result.restored).length} tables, skipped: ${result.skipped.length}`);
console.log(`  ✓ elapsed: ${result.elapsedMs}ms (tx: ${result.txElapsedMs}ms)`);
console.log('  Restored counts (sample):');
Object.entries(result.restored).slice(0, 5).forEach(([k, v]) => console.log(`    - ${k}: ${v}`));
console.log();

// Étape 4 : fingerprint APRÈS
console.log('[4/6] Fingerprint après restore...');
const fpAfter = computeCollabFingerprint({ companyId, collabId });
console.log(`  fp_after = ${fpAfter.slice(0, 16)}...`);
const fpChanged = fpBefore !== fpAfter;
console.log(`  ${fpChanged ? '✓' : '⚠'} Fingerprint ${fpChanged ? 'changé' : 'identique'} (état ${fpChanged ? 'modifié' : 'inchangé'})\n`);

// Étape 5 : reversibility check (restore du pre-restore snapshot)
console.log('[5/6] Reversibility check : restore du pre-restore snapshot...');
const reverseResult = restoreSnapshot({
  snapshotId: result.preRestoreSnapshotId,
  actorType: 'admin',
  actorId: 'cli-test',
  actorName: 'CLI test-restore.js (reverse)',
  reason: 'cli-test-r1-reversibility',
});
const fpReversed = computeCollabFingerprint({ companyId, collabId });
console.log(`  ✓ Restore pre-restore #${result.preRestoreSnapshotId} done`);
console.log(`  fp_reversed = ${fpReversed.slice(0, 16)}...`);
const reverseOk = fpReversed === fpBefore;
console.log(`  ${reverseOk ? '✅' : '❌'} Reversibility ${reverseOk ? 'OK' : 'KO'} (fp_reversed === fp_before)\n`);

// Étape 6 : audit_logs entries
console.log('[6/6] audit_logs entries pour cette session...');
const audits = db
  .prepare(
    "SELECT id, action, entityId, detail, createdAt FROM audit_logs " +
      "WHERE entityType = 'collab_snapshot' AND createdAt > datetime('now', '-5 minutes') " +
      'ORDER BY createdAt DESC LIMIT 5'
  )
  .all();
console.log(`  ${audits.length} audit_logs entries trouvées :`);
audits.forEach((a) => console.log(`    [${a.createdAt}] ${a.action} entity=${a.entityId}`));

console.log('\n=== TEST TERMINÉ ===');
console.log(`Résultat : ${reverseOk ? '✅ TOUT OK (restore + reversibility)' : '❌ RÉVERSIBILITÉ KO'}`);
process.exit(reverseOk ? 0 : 1);
