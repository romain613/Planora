import { Router } from 'express';
import { db } from '../db/database.js';
import { readFileSync, statSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';

const router = Router();

// ─── Cache GDrive (5 min) — évite execSync trop fréquents ───
let gdriveCache = null;
let gdriveCacheTime = 0;
const GDRIVE_CACHE_TTL = 5 * 60 * 1000;

function getGdriveInfo() {
  if (gdriveCache && (Date.now() - gdriveCacheTime) < GDRIVE_CACHE_TTL) return gdriveCache;
  try {
    const daily = execSync('rclone ls gdrive-backup:daily/ 2>/dev/null', { timeout: 10000 }).toString().trim().split('\n').filter(l => l.trim());
    const deploy = execSync('rclone ls gdrive-backup:deploy/ 2>/dev/null', { timeout: 10000 }).toString().trim().split('\n').filter(l => l.trim());
    gdriveCache = { connected: true, dailyCount: daily.length, deployCount: deploy.length };
  } catch {
    gdriveCache = { connected: false, dailyCount: 0, deployCount: 0 };
  }
  gdriveCacheTime = Date.now();
  return gdriveCache;
}

// ─── Lire + parser les dernières lignes d'un log ───
function tailLog(path, lines = 20) {
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, 'utf8').trim().split('\n');
    return content.slice(-lines).reverse();
  } catch { return []; }
}

// ─── Parser une ligne de backup.log ───
// Format: "20260326-204352 | OK | taille: 1290240 | integrity: ok | companies: 3 | collabs: 5 | fichier: /path/file.db"
function parseBackupLogLine(line) {
  if (!line) return null;
  const parts = line.split(' | ').map(p => p.trim());
  const timestamp = parts[0] || '';
  const result = parts[1] || '';
  const parsed = { timestamp, result, raw: line };
  parts.forEach(p => {
    if (p.startsWith('taille:')) parsed.size = parseInt(p.split(':')[1]) || 0;
    if (p.startsWith('integrity:')) parsed.integrity = p.split(':')[1]?.trim();
    if (p.startsWith('companies:')) parsed.companies = parseInt(p.split(':')[1]) || 0;
    if (p.startsWith('collabs:')) parsed.collabs = parseInt(p.split(':')[1]) || 0;
    if (p.startsWith('fichier:')) parsed.file = p.split(':').slice(1).join(':').trim();
    if (p.startsWith('uploaded:')) parsed.file = p.split(':')[1]?.trim();
  });
  return parsed;
}

// ─── Parser une ligne de deploy.log ───
// Format: "20260326-212400 | git:4d56b39 | backup:pre-deploy-20260326-212400.db | http:200 | companies:3 | result:OK"
function parseDeployLogLine(line) {
  if (!line) return null;
  const parts = line.split(' | ').map(p => p.trim());
  const parsed = { raw: line };
  parts.forEach(p => {
    if (/^\d{8}-\d{6}$/.test(p)) parsed.timestamp = p;
    if (p.startsWith('git:')) parsed.gitHash = p.split(':')[1];
    if (p.startsWith('backup:')) parsed.backup = p.split(':')[1];
    if (p.startsWith('http:')) parsed.httpStatus = parseInt(p.split(':')[1]) || 0;
    if (p.startsWith('companies:')) parsed.companies = parseInt(p.split(':')[1]) || 0;
    if (p.startsWith('result:')) parsed.result = p.split(':')[1];
  });
  return parsed;
}

// ─── Calculer le statut global ───
function computeGlobalStatus(dbOk, lastBackupAge, gdriveConnected, lastDeployResult, integrityOk) {
  if (!dbOk || !integrityOk) return 'error';
  if (lastBackupAge > 24) return 'error';
  if (lastBackupAge > 12) return 'warning';
  if (!gdriveConnected) return 'warning';
  if (lastDeployResult === 'WARN') return 'warning';
  return 'ok';
}

// ─── Prochain backup cron (7 */6 = 0h07, 6h07, 12h07, 18h07) ───
function getNextCronRun() {
  const now = new Date();
  const cronHours = [0, 6, 12, 18];
  for (const h of cronHours) {
    const candidate = new Date(now);
    candidate.setHours(h, 7, 0, 0);
    if (candidate > now) return candidate.toISOString();
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 7, 0, 0);
  return tomorrow.toISOString();
}

// ═══ GET /api/security/dashboard ═══
router.get('/dashboard', (req, res) => {
  try {
    // 1. DB info
    const dbPath = process.env.DB_PATH || '(fallback)';
    const dbOk = !!db.prepare('SELECT 1').get();
    const companies = db.prepare('SELECT COUNT(*) as c FROM companies').get().c;
    const collaborators = db.prepare('SELECT COUNT(*) as c FROM collaborators').get().c;
    const contacts = db.prepare('SELECT COUNT(*) as c FROM contacts').get().c;
    const tables = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table'").get().c;
    const pageCount = db.pragma('page_count')[0].page_count;
    const pageSize = db.pragma('page_size')[0].page_size;
    const dbSize = pageCount * pageSize;
    const integrity = db.pragma('integrity_check')[0].integrity_check;
    let walSize = 0;
    try { walSize = statSync(dbPath + '-wal').size; } catch {}

    // 2. Backups locaux
    const backupDir = '/var/www/planora-data/backups';
    let localBackups = [];
    try {
      localBackups = readdirSync(backupDir)
        .filter(f => f.endsWith('.db'))
        .map(f => { try { const st = statSync(backupDir + '/' + f); return { file: f, size: st.size, date: st.mtime.toISOString() }; } catch { return null; } })
        .filter(Boolean)
        .sort((a, b) => b.date.localeCompare(a.date));
    } catch {}

    // 3. Backup log — parsé
    const backupLogRaw = tailLog('/var/www/planora-data/backup.log', 30);
    const backupLogParsed = backupLogRaw.map(parseBackupLogLine).filter(Boolean);
    const lastBackupOk = backupLogParsed.find(l => l.result === 'OK');
    const lastBackupFail = backupLogParsed.find(l => l.result === 'FAIL');
    const lastGdriveOk = backupLogParsed.find(l => l.result === 'GDRIVE_OK');
    const lastGdriveFail = backupLogParsed.find(l => l.result === 'GDRIVE_FAIL');

    let lastBackupAge = 999;
    if (lastBackupOk?.timestamp) {
      const ts = lastBackupOk.timestamp;
      const d = new Date(ts.replace(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
      if (!isNaN(d.getTime())) lastBackupAge = (Date.now() - d.getTime()) / 3600000;
    }

    // 4. Google Drive (cache 5 min — ne bloque pas si timeout)
    const gdrive = getGdriveInfo();

    // 5. Deploy log — parsé
    const deployLogRaw = tailLog('/var/www/planora/deploy.log', 10);
    const deployLogParsed = deployLogRaw.map(parseDeployLogLine).filter(Boolean);
    const lastDeploy = deployLogParsed[0] || null;
    const lastDeployResult = lastDeploy?.result || 'unknown';

    // 6. Alertes
    const alerts = [];
    if (lastBackupFail) alerts.push({ type: 'BACKUP_FAIL', message: lastBackupFail.raw, severity: 'error', date: lastBackupFail.timestamp });
    if (lastGdriveFail && (!lastGdriveOk || lastGdriveFail.timestamp > lastGdriveOk.timestamp)) {
      alerts.push({ type: 'GDRIVE_FAIL', message: lastGdriveFail.raw, severity: 'error', date: lastGdriveFail.timestamp });
    }
    if (lastBackupAge > 12) alerts.push({ type: 'BACKUP_OLD', message: 'Dernier backup il y a ' + Math.round(lastBackupAge) + 'h', severity: lastBackupAge > 24 ? 'error' : 'warning' });
    if (!gdrive.connected) alerts.push({ type: 'GDRIVE_DISCONNECTED', message: 'Google Drive non connecté', severity: 'warning' });
    if (integrity !== 'ok') alerts.push({ type: 'DB_INTEGRITY', message: 'Integrity check: ' + integrity, severity: 'error' });

    // 7. Statut global
    const globalStatus = computeGlobalStatus(dbOk, lastBackupAge, gdrive.connected, lastDeployResult, integrity === 'ok');

    res.json({
      globalStatus,
      timestamp: new Date().toISOString(),
      db: {
        path: dbPath, size: dbSize, sizeHuman: (dbSize / 1048576).toFixed(1) + ' MB',
        walSize, walSizeHuman: (walSize / 1048576).toFixed(1) + ' MB',
        tables, integrity, companies, collaborators, contacts
      },
      backups: {
        local: { total: localBackups.length, latest: localBackups[0] || null, list: localBackups.slice(0, 10) },
        lastOk: lastBackupOk, lastFail: lastBackupFail, ageHours: Math.round(lastBackupAge * 10) / 10
      },
      gdrive: { ...gdrive, lastOk: lastGdriveOk, lastFail: lastGdriveFail },
      deploy: { latest: lastDeploy, lastResult: lastDeployResult, log: deployLogParsed.slice(0, 5) },
      alerts,
      cron: { interval: '6h', retentionDays: 30, nextRun: getNextCronRun() },
      uptime: Math.round(process.uptime())
    });
  } catch (err) {
    res.status(500).json({ globalStatus: 'error', error: err.message });
  }
});

// ═══ GET /api/security/backup-log ═══
router.get('/backup-log', (req, res) => {
  const raw = tailLog('/var/www/planora-data/backup.log', 50);
  res.json({ lines: raw, parsed: raw.map(parseBackupLogLine).filter(Boolean) });
});

// ═══ GET /api/security/deploy-log ═══
router.get('/deploy-log', (req, res) => {
  const raw = tailLog('/var/www/planora/deploy.log', 20);
  res.json({ lines: raw, parsed: raw.map(parseDeployLogLine).filter(Boolean) });
});

export default router;
