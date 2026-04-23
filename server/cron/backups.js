import cron from 'node-cron';
import { db } from '../db/database.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Backup directory: ../../backups/ relative to server/cron/
const BACKUP_DIR = join(__dirname, '..', '..', 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Perform a SQLite backup using better-sqlite3's backup() method
 * @param {'12h'|'48h'|'manual'} type - Backup type
 */
export async function performBackup(type = '12h') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `calendar360-${type}-${timestamp}.db`;
  const destPath = join(BACKUP_DIR, filename);

  try {
    await db.backup(destPath);
    const stats = fs.statSync(destPath);
    console.log(`\x1b[32m[BACKUP]\x1b[0m ${type} backup created: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
    return { success: true, filename, size: stats.size, type, date: new Date().toISOString() };
  } catch (err) {
    console.error(`\x1b[31m[BACKUP ERROR]\x1b[0m`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Clean up old backups according to retention policy
 * - 12h: keep last 4 (48h coverage)
 * - 48h: keep last 7 (~14 days)
 * - manual: keep last 5
 */
export function cleanupBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('calendar360-') && f.endsWith('.db'))
    .map(f => ({
      name: f,
      type: f.includes('-12h-') ? '12h' : f.includes('-48h-') ? '48h' : f.includes('-manual-') ? 'manual' : 'unknown',
      path: join(BACKUP_DIR, f),
      mtime: fs.statSync(join(BACKUP_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  const limits = { '12h': 4, '48h': 7, 'manual': 5 };

  for (const [type, limit] of Object.entries(limits)) {
    const ofType = files.filter(f => f.type === type);
    for (const old of ofType.slice(limit)) {
      fs.unlinkSync(old.path);
      console.log(`\x1b[33m[BACKUP CLEANUP]\x1b[0m Removed old ${type} backup: ${old.name}`);
    }
  }
}

/**
 * List all backup files with metadata
 */
export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('calendar360-') && f.endsWith('.db'))
    .map(f => {
      const stats = fs.statSync(join(BACKUP_DIR, f));
      const type = f.includes('-12h-') ? '12h' : f.includes('-48h-') ? '48h' : f.includes('-manual-') ? 'manual' : 'unknown';
      return { filename: f, type, size: stats.size, date: stats.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ─── CRON SCHEDULES ────────────────────────────

// Every 12 hours at 6:00 AM and 6:00 PM
cron.schedule('0 6,18 * * *', async () => {
  try {
    await performBackup('12h');
    cleanupBackups();
  } catch (err) {
    console.error('[CRON BACKUP 12H ERROR]', err);
  }
});

// Every 48 hours (midnight on every 2nd day of month)
cron.schedule('0 0 */2 * *', async () => {
  try {
    await performBackup('48h');
    cleanupBackups();
  } catch (err) {
    console.error('[CRON BACKUP 48H ERROR]', err);
  }
});

console.log('\x1b[32m[CRON]\x1b[0m Backup scheduler started (12h: 6AM/6PM, 48h: every 2 days at midnight)');
