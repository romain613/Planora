// Phase S1 — Test standalone de buildCollabSnapshot + computeCollabFingerprint.
// READ-ONLY : n'écrit rien en DB, n'écrit rien sur le filesystem.
//
// Usage:
//   node server/services/collabSnapshots/test-build.js <companyId> <collabId> [--full]
//
// Sans --full : affiche uniquement les compteurs + preview payload tronqué.
// Avec --full  : écrit le payload complet (gzippé) dans /tmp/ pour inspection.

import { buildCollabSnapshot } from './buildCollabSnapshot.js';
import { computeCollabFingerprint } from './fingerprint.js';
import { gzipSync } from 'zlib';
import { writeFileSync } from 'fs';
import { createHash } from 'crypto';

const [, , companyId, collabId, ...flags] = process.argv;
const fullMode = flags.includes('--full');

if (!companyId || !collabId) {
  console.error('Usage: node test-build.js <companyId> <collabId> [--full]');
  process.exit(1);
}

console.log('=== Collab snapshot build test (read-only) ===');
console.log('companyId:', companyId);
console.log('collabId: ', collabId);
console.log('DB_PATH:  ', process.env.DB_PATH || '(fallback)');
console.log('');

const t0 = Date.now();
const payload = buildCollabSnapshot({ companyId, collabId });
const elapsedBuild = Date.now() - t0;

const t1 = Date.now();
const fp = computeCollabFingerprint({ companyId, collabId });
const elapsedFp = Date.now() - t1;

const jsonStr = JSON.stringify(payload);
const gzipped = gzipSync(jsonStr);
const sha = createHash('sha256').update(gzipped).digest('hex');

console.log('builtAt:          ', new Date(payload.meta.builtAt).toISOString());
console.log('build elapsed:    ', elapsedBuild + 'ms');
console.log('fingerprint:      ', fp);
console.log('fingerprint time: ', elapsedFp + 'ms');
console.log('');
console.log('--- counts ---');
for (const [k, v] of Object.entries(payload.meta.counts)) {
  const mode = payload.meta.restoreModePerTable[k] || '?';
  console.log(`  ${k.padEnd(28)} ${String(v).padStart(6)}   [${mode}]`);
}
console.log('  '.padEnd(30) + '------');
console.log('  total'.padEnd(30) + String(payload.meta.totalRows).padStart(6));
console.log('');
console.log('contactIds scanned:', payload.meta.contactIdsCount);
console.log('warnings:          ', payload.meta.warnings.length);
if (payload.meta.warnings.length) {
  for (const w of payload.meta.warnings) {
    console.log('  ⚠', w.key, '→', w.error);
  }
}
console.log('');
console.log('--- payload size ---');
console.log('JSON raw:   ', jsonStr.length, 'bytes');
console.log('JSON gzip:  ', gzipped.length, 'bytes');
console.log('gzip ratio: ', Math.round((gzipped.length / jsonStr.length) * 100) + '%');
console.log('sha256(gz): ', sha);

if (fullMode) {
  const ts = new Date(payload.meta.builtAt).toISOString().replace(/[:.]/g, '-');
  const outPath = `/tmp/collab-snapshot-${collabId}-${ts}.json.gz`;
  writeFileSync(outPath, gzipped);
  console.log('');
  console.log('Full payload written:', outPath);
}

console.log('=== Done ===');
