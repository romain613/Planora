// Phase S2.4 — Test retention contre un jeu de snapshots fictifs.
//
// Stratégie : créer N rows fictives dans collab_snapshots pour un collab TEST,
// créer N fichiers gzip vides correspondants, exécuter runRetention(), valider
// que seule la bonne sélection est gardée, nettoyer tout en fin de test.
//
// Aucun impact sur les vrais snapshots existants : le collab TEST est identifié
// par un prefix dédié et la cleanup finale supprime tout ce qui a été créé.
//
// Usage: node test-retention.js

import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { db } from '../../db/database.js';
import { runRetention, computeKeepSet } from './retention.js';

const SNAPSHOTS_DIR =
  process.env.SNAPSHOTS_DIR || '/var/www/planora-data/snapshots';

const TEST_COMPANY = 'c-retention-test-zzz';
const TEST_COLLAB = 'u-retention-test-zzz';

function cleanup() {
  // Retire les rows + fichiers du collab test
  const rows = db
    .prepare('SELECT payloadPath FROM collab_snapshots WHERE companyId = ? AND collabId = ?')
    .all(TEST_COMPANY, TEST_COLLAB);
  for (const r of rows) {
    const fp = path.join(SNAPSHOTS_DIR, r.payloadPath);
    try {
      unlinkSync(fp);
    } catch {}
  }
  db.prepare('DELETE FROM collab_snapshots WHERE companyId = ? AND collabId = ?').run(
    TEST_COMPANY,
    TEST_COLLAB
  );
}

function seedFakeSnapshots() {
  // Crée 60 snapshots étalés sur 14 jours, espacés irrégulièrement
  // pour simuler un usage réel (dense sur les dernières heures, sparse plus loin)
  const now = Date.now();
  const dir = path.join(SNAPSHOTS_DIR, TEST_COMPANY, TEST_COLLAB);
  mkdirSync(dir, { recursive: true });

  const schedule = [];
  // 20 snapshots sur les 90 dernières minutes (test "20 latest")
  for (let i = 0; i < 20; i++) {
    schedule.push(now - i * 5 * 60 * 1000);
  }
  // 10 snapshots étalés entre 2h et 24h (test "hourly bucket")
  for (let i = 0; i < 10; i++) {
    schedule.push(now - (2 + i * 2) * 3600 * 1000);
  }
  // 10 snapshots étalés entre 1j et 7j (test "daily bucket")
  for (let i = 0; i < 10; i++) {
    schedule.push(now - (24 + i * 14) * 3600 * 1000);
  }
  // 20 snapshots > 7j (doivent ÊTRE supprimés)
  for (let i = 0; i < 20; i++) {
    schedule.push(now - (8 + i) * 24 * 3600 * 1000);
  }

  const stmt = db.prepare(`
    INSERT INTO collab_snapshots (
      companyId, collabId, createdAt, kind, trigger,
      payloadPath, payloadSha256, payloadSizeBytes, rowCount,
      fingerprint, summaryJson, createdBy
    ) VALUES (?, ?, ?, 'auto', 'test-seed', ?, 'deadbeef', 256, 1, 'fakefp', '{}', 'test-retention')
  `);

  for (const ts of schedule) {
    const iso = new Date(ts).toISOString().replace(/[:.]/g, '-');
    const filename = `${iso}.json.gz`;
    const relPath = path.join(TEST_COMPANY, TEST_COLLAB, filename);
    const fullPath = path.join(SNAPSHOTS_DIR, relPath);
    // Fichier minimal gzip pour simuler (256 bytes arbitraire)
    writeFileSync(fullPath, Buffer.alloc(256, 0x1f));
    stmt.run(TEST_COMPANY, TEST_COLLAB, ts, relPath);
  }

  return schedule.length;
}

console.log('=== S2.4 test-retention ===');
console.log('');

console.log('[1/5] Cleanup previous test state');
cleanup();

console.log('[2/5] Seeding fake snapshots');
const seeded = seedFakeSnapshots();
console.log('  seeded:', seeded);
const afterSeed = db
  .prepare('SELECT COUNT(*) as n FROM collab_snapshots WHERE companyId = ? AND collabId = ?')
  .get(TEST_COMPANY, TEST_COLLAB).n;
console.log('  total in DB:', afterSeed);

console.log('');
console.log('[3/5] Compute keep set (dry-run logic)');
const snaps = db
  .prepare(
    'SELECT id, createdAt FROM collab_snapshots WHERE companyId = ? AND collabId = ? ORDER BY createdAt DESC'
  )
  .all(TEST_COMPANY, TEST_COLLAB);
const keepSet = computeKeepSet(snaps);
console.log('  total snapshots:', snaps.length);
console.log('  keep count:     ', keepSet.size);
console.log('  delete count:   ', snaps.length - keepSet.size);

// Expected: ~20 latest + ~12 hourly dedupés + ~8 daily dedupés = 30-40 gardés
// (les buckets peuvent se chevaucher avec les 20 latest)
const expectedKeepMin = 30;
const expectedKeepMax = 45;
const keepOk = keepSet.size >= expectedKeepMin && keepSet.size <= expectedKeepMax;
console.log(`  keep in [${expectedKeepMin}..${expectedKeepMax}] : ${keepOk ? 'OK' : 'OUT OF RANGE'}`);

console.log('');
console.log('[4/5] Run retention for real');
const report = runRetention();
const testReport = report.find((r) => r.collabId === TEST_COLLAB);
console.log('  report:', JSON.stringify(testReport, null, 2));

const afterRetention = db
  .prepare('SELECT COUNT(*) as n FROM collab_snapshots WHERE companyId = ? AND collabId = ?')
  .get(TEST_COMPANY, TEST_COLLAB).n;
console.log('  DB count after:', afterRetention);
console.log('  delta: removed', seeded - afterRetention);
const countMatch = afterRetention === testReport.kept;
console.log(`  DB count matches report.kept: ${countMatch ? 'OK' : 'FAIL'}`);

console.log('');
console.log('[5/5] Cleanup test data');
cleanup();
const finalCount = db
  .prepare('SELECT COUNT(*) as n FROM collab_snapshots WHERE companyId = ? AND collabId = ?')
  .get(TEST_COMPANY, TEST_COLLAB).n;
console.log('  DB count after cleanup:', finalCount);

const verdict = keepOk && countMatch && finalCount === 0;
console.log('');
console.log('=== VERDICT:', verdict ? 'GO' : 'NO-GO', '===');
process.exit(verdict ? 0 : 1);
