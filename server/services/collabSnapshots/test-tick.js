// Phase S2.3 — Runner manuel du tick snapshot (test write complet).
//
// Scénario de test :
//  1. Force dirtySinceSnapshotAt sur <collabId> passé en argument
//  2. Affiche état avant (count snapshots, dirty flag)
//  3. Exécute runSnapshotTick()
//  4. Affiche état après (fichier disque, row DB, flag reset)
//  5. Vérifie l'intégrité (gunzip + JSON parse)
//
// Usage: node test-tick.js <companyId> <collabId>
//
// Écrit réellement un snapshot. À utiliser seulement une fois que la DDL est appliquée.

import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import path from 'path';
import { db } from '../../db/database.js';
import { runSnapshotTick } from './runSnapshotTick.js';

const SNAPSHOTS_DIR =
  process.env.SNAPSHOTS_DIR || '/var/www/planora-data/snapshots';

const [, , companyId, collabId] = process.argv;

if (!companyId || !collabId) {
  console.error('Usage: node test-tick.js <companyId> <collabId>');
  process.exit(1);
}

console.log('=== S2.3 test-tick ===');
console.log('companyId:', companyId);
console.log('collabId: ', collabId);

// --- État avant
const beforeSnapshotCount = db
  .prepare('SELECT COUNT(*) as n FROM collab_snapshots WHERE companyId = ? AND collabId = ?')
  .get(companyId, collabId).n;
const beforeFlag = db
  .prepare('SELECT dirtySinceSnapshotAt FROM collaborators WHERE id = ?')
  .get(collabId);

console.log('');
console.log('BEFORE:');
console.log('  snapshot count:', beforeSnapshotCount);
console.log('  dirty flag:   ', beforeFlag?.dirtySinceSnapshotAt ?? 'NULL');

// --- Force dirty flag
console.log('');
console.log('Forcing dirtySinceSnapshotAt = now()');
db.prepare(
  'UPDATE collaborators SET dirtySinceSnapshotAt = ? WHERE id = ?'
).run(Date.now(), collabId);

// --- Run tick
console.log('');
console.log('Running runSnapshotTick()...');
const results = runSnapshotTick({ createdBy: 'test-tick:manual' });
console.log('');
console.log('Tick results:', JSON.stringify(results, null, 2));

// --- État après
const afterSnapshotCount = db
  .prepare('SELECT COUNT(*) as n FROM collab_snapshots WHERE companyId = ? AND collabId = ?')
  .get(companyId, collabId).n;
const afterFlag = db
  .prepare('SELECT dirtySinceSnapshotAt FROM collaborators WHERE id = ?')
  .get(collabId);

console.log('');
console.log('AFTER:');
console.log('  snapshot count:', afterSnapshotCount, `(delta=+${afterSnapshotCount - beforeSnapshotCount})`);
console.log('  dirty flag:   ', afterFlag?.dirtySinceSnapshotAt ?? 'NULL');

// --- Integrity check on the file we just wrote
const lastSnap = db
  .prepare(
    'SELECT * FROM collab_snapshots WHERE companyId = ? AND collabId = ? ORDER BY createdAt DESC LIMIT 1'
  )
  .get(companyId, collabId);

if (lastSnap) {
  console.log('');
  console.log('Last snapshot row:');
  console.log('  id:              ', lastSnap.id);
  console.log('  createdAt:       ', new Date(lastSnap.createdAt).toISOString());
  console.log('  kind:            ', lastSnap.kind);
  console.log('  trigger:         ', lastSnap.trigger);
  console.log('  payloadPath:     ', lastSnap.payloadPath);
  console.log('  payloadSha256:   ', lastSnap.payloadSha256);
  console.log('  payloadSizeBytes:', lastSnap.payloadSizeBytes);
  console.log('  rowCount:        ', lastSnap.rowCount);
  console.log('  fingerprint:     ', lastSnap.fingerprint);

  const fullPath = path.join(SNAPSHOTS_DIR, lastSnap.payloadPath);
  try {
    const gz = readFileSync(fullPath);
    const json = gunzipSync(gz).toString('utf-8');
    const parsed = JSON.parse(json);
    console.log('');
    console.log('File integrity check:');
    console.log('  file exists:      YES');
    console.log('  gzip size:        ', gz.length);
    console.log('  gunzip OK:        ', json.length, 'chars');
    console.log('  JSON.parse OK:    meta.version =', parsed.meta.version);
    console.log('  totalRows match:  ', parsed.meta.totalRows === lastSnap.rowCount ? 'YES' : 'NO');
    console.log('  counts:           ', JSON.stringify(parsed.meta.counts));
  } catch (err) {
    console.error('  file check FAILED:', err.message);
    process.exit(2);
  }
}

console.log('');
console.log('=== test-tick done ===');
