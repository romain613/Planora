#!/usr/bin/env node
// V1.10.4.I — Backfill bookings.createdAt depuis le timestamp encodé dans l'id.
// Usage : node ops/v1104i-backfill-bookings-createdAt.mjs [--dry-run|--apply]
//
// Formats id observés en prod (samples 2026-05-11) :
//   bk<13 digits ms>            (~135 rows, standard récent)        ex: bk1778497094432
//   b<13 digits ms>             (~8 rows, alt historique)            ex: b1778497094432
//   bk_<13 digits ms>_<rand>    (~1 row, formaté V7)                 ex: bk_1776848770155_232z
//   b_inter_<13 digits ms>_<rand> (~1 row, interMeetings)             ex: b_inter_1776374144922_dbk1e3
//   wave1FE_<13 digits ms>_bk<N> (~5 rows, wave import)               ex: wave1FE_1776854240387_bk1
//
// Stratégie : regex sur premier run de 12-14 chiffres consécutifs (ms timestamp).
// Si extraction OK et timestamp dans plage raisonnable (≥ 2020-01-01 = 1577836800000,
// ≤ now+1y) → set createdAt = ISO. Sinon → laisser '' (fallback) et logger en SKIP.

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || '/var/www/planora-data/calendar360.db';
const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--apply');

// Plage timestamps acceptables (ms) : 2020-01-01 → now + 1 an
const MIN_TS = new Date('2020-01-01T00:00:00Z').getTime();
const MAX_TS = Date.now() + 365 * 86400 * 1000;

function extractTimestampFromId(id) {
  if (!id || typeof id !== 'string') return null;
  const m = id.match(/(\d{12,14})/);
  if (!m) return null;
  const ts = Number(m[1]);
  if (!Number.isFinite(ts) || ts < MIN_TS || ts > MAX_TS) return null;
  return ts;
}

function main() {
  console.log(`[BACKFILL V1.10.4.I] DB_PATH=${DB_PATH}`);
  console.log(`[BACKFILL V1.10.4.I] Mode=${DRY_RUN ? 'DRY-RUN (no write)' : 'APPLY (writes DB)'}`);
  console.log(`[BACKFILL V1.10.4.I] TS plage=[${new Date(MIN_TS).toISOString()}, ${new Date(MAX_TS).toISOString()}]`);

  const db = new Database(DB_PATH, { readonly: DRY_RUN });

  // Verify createdAt column exists
  const cols = db.prepare("PRAGMA table_info(bookings)").all().map(c => c.name);
  if (!cols.includes('createdAt')) {
    console.error('[BACKFILL] ❌ Colonne bookings.createdAt absente. Lance le serveur Node pour appliquer la DDL idempotente, puis relance.');
    process.exit(2);
  }

  const rows = db.prepare("SELECT id, date, time FROM bookings WHERE createdAt IS NULL OR createdAt = ''").all();
  console.log(`[BACKFILL] ${rows.length} rows à traiter (createdAt vide).`);

  const stats = { total: rows.length, ok: 0, skip: 0, samplesOk: [], samplesSkip: [] };
  const update = DRY_RUN ? null : db.prepare("UPDATE bookings SET createdAt = ? WHERE id = ?");

  for (const r of rows) {
    const ts = extractTimestampFromId(r.id);
    if (ts) {
      const iso = new Date(ts).toISOString();
      stats.ok++;
      if (stats.samplesOk.length < 5) stats.samplesOk.push({ id: r.id, ts, iso });
      if (!DRY_RUN) update.run(iso, r.id);
    } else {
      stats.skip++;
      if (stats.samplesSkip.length < 5) stats.samplesSkip.push({ id: r.id, date: r.date, time: r.time });
    }
  }

  console.log(`\n[BACKFILL] === SYNTHÈSE ===`);
  console.log(`  Total rows scannés : ${stats.total}`);
  console.log(`  ✅ Stamped         : ${stats.ok}`);
  console.log(`  ⚠ Skipped (no ts) : ${stats.skip} (laissés createdAt='')`);
  if (stats.samplesOk.length) {
    console.log(`\n  Samples OK :`);
    stats.samplesOk.forEach(s => console.log(`    ${s.id.padEnd(40)} → ${s.iso}`));
  }
  if (stats.samplesSkip.length) {
    console.log(`\n  Samples SKIPPED :`);
    stats.samplesSkip.forEach(s => console.log(`    ${s.id.padEnd(40)} (date=${s.date} time=${s.time})`));
  }
  console.log(`\n[BACKFILL] ${DRY_RUN ? '🔍 DRY-RUN terminé — aucun UPDATE effectué.' : '✅ APPLY terminé — UPDATEs effectués.'}`);
  console.log(`[BACKFILL] Pour appliquer : node ops/v1104i-backfill-bookings-createdAt.mjs --apply`);
  db.close();
}

try { main(); } catch (e) { console.error('[BACKFILL ERR]', e); process.exit(1); }
