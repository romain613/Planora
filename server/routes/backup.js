import { Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { performBackup, cleanupBackups, listBackups } from '../cron/backups.js';
import { requireAuth, requireSupra } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BACKUP_DIR = join(__dirname, '..', '..', 'backups');

const router = Router();

// GET /api/backup/list — List all backup files
router.get('/list', requireAuth, requireSupra, (req, res) => {
  try {
    res.json({ backups: listBackups() });
  } catch (err) {
    console.error('[BACKUP LIST ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/trigger — Create a manual backup
router.post('/trigger', requireAuth, requireSupra, async (req, res) => {
  try {
    const result = await performBackup('manual');
    if (result.success) {
      cleanupBackups();
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (err) {
    console.error('[BACKUP TRIGGER ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/download/:filename — Download a backup file
router.get('/download/:filename', requireAuth, requireSupra, (req, res) => {
  try {
    const { filename } = req.params;
    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || !filename.startsWith('calendar360-')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const filePath = join(BACKUP_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    res.download(filePath, filename);
  } catch (err) {
    console.error('[BACKUP DOWNLOAD ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/restore/:filename — Restore a backup (DANGEROUS — requires supra + confirmation code)
router.post('/restore/:filename', requireAuth, requireSupra, async (req, res) => {
  try {
    const { filename } = req.params;
    const { confirmCode } = req.body;

    // Security: require confirmation code
    if (confirmCode !== 'RESTORE-' + filename.split('.')[0].slice(-6).toUpperCase()) {
      return res.status(403).json({ error: 'Code de confirmation incorrect', expectedFormat: 'RESTORE-XXXXXX' });
    }

    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || !filename.endsWith('.db')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const backupPath = join(BACKUP_DIR, filename);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    // Verify backup is valid SQLite
    const Database = (await import('better-sqlite3')).default;
    const testDb = new Database(backupPath, { readonly: true });
    try {
      const tables = testDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table'").get();
      if (tables.cnt < 5) {
        testDb.close();
        return res.status(400).json({ error: 'Backup invalide — trop peu de tables (' + tables.cnt + ')' });
      }
      const companies = testDb.prepare("SELECT COUNT(*) as cnt FROM companies").get();
      testDb.close();

      // Create safety backup of current DB before restore
      const { db } = await import('../db/database.js');
      const safetyPath = join(BACKUP_DIR, 'pre-restore-' + Date.now() + '.db');
      await db.backup(safetyPath);

      // Stop PM2, copy backup over, restart
      const dbPath = join(__dirname, '..', 'db', 'calendar360.db');
      fs.copyFileSync(backupPath, dbPath);
      // Remove WAL/SHM files to force clean start
      try { fs.unlinkSync(dbPath + '-wal'); } catch {}
      try { fs.unlinkSync(dbPath + '-shm'); } catch {}

      res.json({
        success: true,
        message: 'Backup restauré. Redémarrage nécessaire (pm2 restart calendar360)',
        safetyBackup: safetyPath,
        companies: companies.cnt
      });
    } catch (e) {
      testDb.close();
      return res.status(400).json({ error: 'Backup corrompu: ' + e.message });
    }
  } catch (err) {
    console.error('[BACKUP RESTORE ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/upload — Upload a backup file for later restore
router.post('/upload', requireAuth, requireSupra, async (req, res) => {
  try {
    const { data, filename } = req.body;
    if (!data || !filename) return res.status(400).json({ error: 'Missing data or filename' });

    const safeName = 'uploaded-' + Date.now() + '-' + filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = join(BACKUP_DIR, safeName);

    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(filePath, buffer);

    // Verify it's valid SQLite
    const Database = (await import('better-sqlite3')).default;
    try {
      const testDb = new Database(filePath, { readonly: true });
      const tables = testDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table'").get();
      testDb.close();

      if (tables.cnt < 3) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: 'Fichier invalide — pas une base Calendar360' });
      }

      res.json({ success: true, filename: safeName, tables: tables.cnt, size: buffer.length });
    } catch (e) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Fichier corrompu: ' + e.message });
    }
  } catch (err) {
    console.error('[BACKUP UPLOAD ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/full — Download COMPLETE backup (DB + code + config + .env) as .tar.gz
router.get('/full', requireAuth, requireSupra, async (req, res) => {
  try {
    const PROJECT_ROOT = join(__dirname, '..', '..');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archiveName = `calendar360-FULL-${timestamp}.tar.gz`;
    const tempDir = join(BACKUP_DIR, 'full-backup-temp-' + Date.now());

    // 1. Create temp staging directory
    fs.mkdirSync(tempDir, { recursive: true });
    const stageDir = join(tempDir, 'calendar360-backup');
    fs.mkdirSync(stageDir, { recursive: true });

    // 2. Fresh DB backup via SQLite API
    const dbModule = await import('../db/database.js');
    const db = dbModule.db || dbModule.default;
    const dbBackupPath = join(stageDir, 'calendar360.db');
    await db.backup(dbBackupPath);
    console.log('[FULL BACKUP] DB backed up:', fs.statSync(dbBackupPath).size, 'bytes');

    // 3. Copy all source files
    const copyRecursive = (src, dest) => {
      if (!fs.existsSync(src)) return;
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(f => {
          if (f === 'node_modules' || f === '.git' || f === '.claude' || f === 'py' || f.endsWith('.db-wal') || f.endsWith('.db-shm')) return;
          copyRecursive(join(src, f), join(dest, f));
        });
      } else {
        fs.mkdirSync(dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    };

    // Server (code + .env)
    copyRecursive(join(PROJECT_ROOT, 'server'), join(stageDir, 'server'));
    // Put DB in the right place
    fs.mkdirSync(join(stageDir, 'server', 'db'), { recursive: true });
    fs.copyFileSync(dbBackupPath, join(stageDir, 'server', 'db', 'calendar360.db'));

    // App source + dist
    copyRecursive(join(PROJECT_ROOT, 'app'), join(stageDir, 'app'));

    // Config files
    ['ecosystem.config.cjs', 'deploy.sh', 'CLAUDE.md', 'PROJECT_MEMORY.md', 'SOURCE_OF_TRUTH.md', 'ARCHITECTURE_MAP.md'].forEach(f => {
      const src = join(PROJECT_ROOT, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, join(stageDir, f));
    });

    // Tasks
    copyRecursive(join(PROJECT_ROOT, 'tasks'), join(stageDir, 'tasks'));

    // 4. Create manifest with restoration instructions
    const manifest = {
      created: new Date().toISOString(),
      version: 'Calendar360 Full Backup v2',
      dbIncluded: true,
      envIncluded: fs.existsSync(join(PROJECT_ROOT, 'server', '.env')),
      instructions: [
        '=== RESTAURATION COMPLETE Calendar360 ===',
        '1. Extraire: tar -xzf ' + archiveName,
        '2. cd calendar360-backup',
        '3. cd server && npm install --omit=dev',
        '4. Verifier/editer server/.env (cles API)',
        '5. cd ../app && npm install && npm run build',
        '6. Copier app/dist/* vers le htdocs du serveur web',
        '7. pm2 start ecosystem.config.cjs',
        '8. La DB est deja en place dans server/db/calendar360.db',
        '',
        'La base de donnees contient toutes les companies, collaborateurs,',
        'contacts, bookings, call logs, SMS, pipeline stages, et configurations.',
      ]
    };
    fs.writeFileSync(join(stageDir, 'RESTORE_INSTRUCTIONS.json'), JSON.stringify(manifest, null, 2));

    // 5. Create .tar.gz
    const archivePath = join(BACKUP_DIR, archiveName);
    execSync(`cd "${tempDir}" && tar -czf "${archivePath}" calendar360-backup/`, { timeout: 60000 });

    // 6. Cleanup temp
    execSync(`rm -rf "${tempDir}"`, { timeout: 10000 });
    // Also cleanup the root db backup
    try { fs.unlinkSync(dbBackupPath); } catch {}

    const archiveStat = fs.statSync(archivePath);
    console.log(`[FULL BACKUP] Created ${archiveName} (${(archiveStat.size/1024/1024).toFixed(2)} MB)`);

    res.download(archivePath, archiveName);
  } catch (err) {
    console.error('[FULL BACKUP ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/full-set — Download ULTIMATE backup (DB + code + config + .env + setup script + nginx)
// Permet de restaurer sur un VPS VIERGE Ubuntu sans rien d'autre
router.get('/full-set', requireAuth, requireSupra, async (req, res) => {
  try {
    const PROJECT_ROOT = join(__dirname, '..', '..');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archiveName = `calendar360-SET-COMPLET-${timestamp}.tar.gz`;
    const tempDir = join(BACKUP_DIR, 'fullset-temp-' + Date.now());
    const stageDir = join(tempDir, 'calendar360');

    fs.mkdirSync(stageDir, { recursive: true });

    // 1. Fresh DB backup
    const dbModule = await import('../db/database.js');
    const db = dbModule.db || dbModule.default;
    await db.backup(join(stageDir, 'calendar360.db'));
    console.log('[FULL-SET] DB backed up');

    // 2. Copy everything recursively
    const skip = new Set(['node_modules', '.git', '.claude', 'py', 'backups', '__pycache__']);
    const copyAll = (src, dest) => {
      if (!fs.existsSync(src)) return;
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        const name = src.split('/').pop();
        if (skip.has(name)) return;
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(f => {
          if (f.endsWith('.db-wal') || f.endsWith('.db-shm') || f.startsWith('planora-v5')) return;
          copyAll(join(src, f), join(dest, f));
        });
      } else {
        if (stat.size > 50 * 1024 * 1024) return; // skip files > 50MB
        fs.mkdirSync(dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    };

    // Server (with .env!)
    copyAll(join(PROJECT_ROOT, 'server'), join(stageDir, 'server'));
    // Put fresh DB in server/db/
    fs.mkdirSync(join(stageDir, 'server', 'db'), { recursive: true });
    fs.copyFileSync(join(stageDir, 'calendar360.db'), join(stageDir, 'server', 'db', 'calendar360.db'));

    // App (source + dist)
    copyAll(join(PROJECT_ROOT, 'app'), join(stageDir, 'app'));

    // Root config files
    const rootFiles = ['ecosystem.config.cjs', 'deploy.sh', 'setup-server.sh', 'CLAUDE.md', 'PROJECT_MEMORY.md', 'SOURCE_OF_TRUTH.md', 'ARCHITECTURE_MAP.md'];
    rootFiles.forEach(f => {
      const src = join(PROJECT_ROOT, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, join(stageDir, f));
    });

    // Tasks
    copyAll(join(PROJECT_ROOT, 'tasks'), join(stageDir, 'tasks'));

    // 3. Create comprehensive manifest
    const manifest = {
      created: new Date().toISOString(),
      version: 'Calendar360 SET COMPLET v1',
      type: 'full-set-restoration',
      contents: {
        database: 'server/db/calendar360.db — Base complete avec toutes les companies, collaborateurs, contacts, bookings, config',
        env: 'server/.env — Cles API Twilio, Brevo, OpenAI, Deepgram, Google OAuth',
        backend: 'server/ — Node.js Express, 33 routes, 12 services, 8 cron jobs',
        frontend_source: 'app/src/App.jsx — Source React complet (~26000 lignes)',
        frontend_compiled: 'app/dist/ — Build Vite pret a deployer',
        setup_script: 'setup-server.sh — Installation automatique VPS vierge Ubuntu',
        nginx_config: 'Inclus dans setup-server.sh',
        pm2_config: 'ecosystem.config.cjs',
        deploy_script: 'deploy.sh',
        docs: 'CLAUDE.md, SOURCE_OF_TRUTH.md, PROJECT_MEMORY.md, ARCHITECTURE_MAP.md',
      },
      restoration_vps_vierge: [
        '=== RESTAURATION SUR VPS VIERGE (Ubuntu 22+) ===',
        '1. Copier ce fichier sur le VPS: scp calendar360-SET-COMPLET-*.tar.gz root@IP:/tmp/',
        '2. Extraire: cd /tmp && tar -xzf calendar360-SET-COMPLET-*.tar.gz',
        '3. Lancer le script: cd calendar360 && sudo bash setup-server.sh',
        '4. Configurer DNS: pointer calendar360.fr vers IP du VPS',
        '5. Installer SSL: certbot --nginx -d calendar360.fr',
        '6. Verifier: pm2 logs calendar360',
        '7. Tester: curl https://calendar360.fr',
      ],
      restoration_vps_existant: [
        '=== RESTAURATION SUR VPS EXISTANT ===',
        '1. Extraire: tar -xzf calendar360-SET-COMPLET-*.tar.gz',
        '2. pm2 stop calendar360',
        '3. cp calendar360/server/db/calendar360.db /var/www/planora/server/db/',
        '4. cp -r calendar360/server/routes/ /var/www/planora/server/routes/',
        '5. cp -r calendar360/server/services/ /var/www/planora/server/services/',
        '6. cp calendar360/server/index.js /var/www/planora/server/',
        '7. cp -r calendar360/app/dist/* /var/www/vhosts/calendar360.fr/httpdocs/',
        '8. pm2 restart calendar360',
      ],
      security: {
        supra_admin: 'rc.sitbon@gmail.com — seul compte autorise a telecharger ce backup',
        warning: 'Ce fichier contient TOUTES les cles API et mots de passe. Ne le partagez JAMAIS.',
      }
    };
    fs.writeFileSync(join(stageDir, 'RESTORE_INSTRUCTIONS.json'), JSON.stringify(manifest, null, 2));

    // 4. Create README.txt lisible
    fs.writeFileSync(join(stageDir, 'README.txt'), `
CALENDAR360 — SET COMPLET DE RESTAURATION
==========================================
Date: ${new Date().toISOString()}
Taille DB: ${(fs.statSync(join(stageDir, 'server', 'db', 'calendar360.db')).size / 1024).toFixed(0)} KB

RESTAURATION VPS VIERGE:
  sudo bash setup-server.sh

RESTAURATION VPS EXISTANT:
  Voir RESTORE_INSTRUCTIONS.json

CONTENU:
  /server/          — Backend Node.js complet
  /server/.env      — Cles API (CONFIDENTIEL)
  /server/db/       — Base de donnees SQLite
  /app/             — Frontend React source + compile
  /setup-server.sh  — Script installation VPS
  /ecosystem.config.cjs — Config PM2

SECURITE:
  Ce fichier contient des informations sensibles.
  Ne le partagez pas et stockez-le en lieu sur.
`);

    // 5. Create tar.gz
    const archivePath = join(BACKUP_DIR, archiveName);
    execSync(`cd "${tempDir}" && tar -czf "${archivePath}" calendar360/`, { timeout: 120000 });

    // 6. Cleanup
    execSync(`rm -rf "${tempDir}"`, { timeout: 10000 });

    const archiveStat = fs.statSync(archivePath);
    console.log(`[FULL-SET] Created ${archiveName} (${(archiveStat.size/1024/1024).toFixed(2)} MB)`);

    res.download(archivePath, archiveName);
  } catch (err) {
    console.error('[FULL-SET BACKUP ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
