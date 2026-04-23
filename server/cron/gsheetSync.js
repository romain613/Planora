import cron from 'node-cron';
import { db, insert } from '../db/database.js';
import { parseCSV, autoDetectMapping, executeImport, logHistory, checkDuplicate, uid } from '../services/leadImportEngine.js';

console.log('\x1b[35m[CRON]\x1b[0m Google Sheet sync scheduler started (every 10 min)');

cron.schedule('*/10 * * * *', async () => {
  try { await syncAllSources(); }
  catch (err) { console.error('[CRON GSHEET SYNC ERROR]', err.message); }
});

// ─── Extract sheetId and gid from a Google Sheets URL ───
function extractSheetIds(url) {
  // Typical URL: https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=GID
  // or: https://docs.google.com/spreadsheets/d/SHEET_ID/edit?gid=GID
  const sheetIdMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const gidMatch = url.match(/[#?&]gid=(\d+)/);
  return {
    sheetId: sheetIdMatch ? sheetIdMatch[1] : null,
    gid: gidMatch ? gidMatch[1] : '0'
  };
}

// ─── Build the CSV export URL for a Google Sheet ───
function buildExportUrl(sheetId, gid) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

// ─── Main sync loop ───
async function syncAllSources() {
  const sources = db.prepare(
    "SELECT * FROM lead_sources WHERE sync_mode IN ('live','schedule') AND is_active = 1 AND gsheet_url != ''"
  ).all();

  if (sources.length === 0) return;

  for (const source of sources) {
    try {
      await syncOneSource(source);
    } catch (err) {
      console.error(`\x1b[35m[CRON GSHEET]\x1b[0m Error syncing source "${source.name}" (${source.id}):`, err.message);
      logHistory(source.companyId, 'gsheet_sync_error', {
        source_id: source.id,
        source_name: source.name,
        error: err.message
      });
    }
  }
}

// ─── Sync a single source ───
async function syncOneSource(source) {
  const { sheetId, gid } = extractSheetIds(source.gsheet_url);
  if (!sheetId) {
    console.error(`\x1b[35m[CRON GSHEET]\x1b[0m Invalid URL for source "${source.name}": ${source.gsheet_url}`);
    return;
  }

  const exportUrl = buildExportUrl(sheetId, gid);

  // Fetch CSV from Google Sheets
  const response = await fetch(exportUrl);
  if (!response.ok) {
    throw new Error(`Google Sheets fetch failed (${response.status}): ${response.statusText}`);
  }
  const csvText = await response.text();

  // Parse CSV
  const parsed = parseCSV(csvText);
  if (!parsed || !parsed.rows || parsed.rows.length === 0) {
    // Empty sheet or only headers — nothing to do
    return;
  }

  const totalRows = parsed.rows.length;
  const lastRowCount = source.last_row_count || 0;

  // No new rows — skip
  if (totalRows <= lastRowCount) return;

  // Only import NEW rows (from lastRowCount to end)
  const newRows = parsed.rows.slice(lastRowCount);
  const newParsed = { headers: parsed.headers, rows: newRows };

  // Resolve mapping — use stored mapping_json or auto-detect
  let mapping = {};
  try {
    mapping = typeof source.mapping_json === 'string' ? JSON.parse(source.mapping_json) : (source.mapping_json || {});
  } catch { mapping = {}; }

  if (!mapping || Object.keys(mapping).length === 0) {
    mapping = autoDetectMapping(parsed.headers);
  }

  // Determine envelope
  const envelopeId = source.sync_envelope_id || '';

  // Execute import
  const result = executeImport({
    companyId: source.companyId,
    lines_parsed: newParsed,
    mapping,
    source_id: source.id,
    envelope_id: envelopeId,
    importType: 'gsheet',
    filename: source.name,
    userId: '',
    userName: 'CRON GSheet Sync'
  });

  // Update source record with new row count and sync timestamp
  const now = new Date().toISOString();
  db.prepare("UPDATE lead_sources SET last_row_count = ?, last_sync = ? WHERE id = ?")
    .run(totalRows, now, source.id);

  const newCount = newRows.length;
  const imported = result?.imported || newCount;
  const duplicates = result?.duplicates || 0;

  console.log(
    `\x1b[35m[CRON GSHEET]\x1b[0m Source "${source.name}": ${newCount} new rows found, ${imported} imported, ${duplicates} duplicates`
  );

  logHistory(source.companyId, 'gsheet_sync', {
    source_id: source.id,
    source_name: source.name,
    new_rows: newCount,
    imported,
    duplicates,
    total_rows: totalRows
  });
}
