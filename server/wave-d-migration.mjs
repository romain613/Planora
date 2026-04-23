// Wave D commit 1 — migration idempotente : ajout archivedAt + archivedBy sur collaborators
// Préserve les données existantes (DEFAULT '' = vide = collab actif).
import Database from 'better-sqlite3';
const db = new Database(process.env.DB_PATH || '/var/www/planora-data/calendar360.db');

const cols = db.prepare('PRAGMA table_info(collaborators)').all().map(c => c.name);
const adds = [];

if (!cols.includes('archivedAt')) {
  db.prepare("ALTER TABLE collaborators ADD COLUMN archivedAt TEXT DEFAULT ''").run();
  adds.push('archivedAt');
}
if (!cols.includes('archivedBy')) {
  db.prepare("ALTER TABLE collaborators ADD COLUMN archivedBy TEXT DEFAULT ''").run();
  adds.push('archivedBy');
}

console.log('Migration done. Added:', adds.length ? adds.join(', ') : '(nothing — already present)');

// Verification
const colsAfter = db.prepare('PRAGMA table_info(collaborators)').all().map(c => c.name);
const ok = colsAfter.includes('archivedAt') && colsAfter.includes('archivedBy');
console.log('Verification:', ok ? 'OK' : 'FAIL');
const total = db.prepare('SELECT COUNT(*) n FROM collaborators').get().n;
const archived = db.prepare("SELECT COUNT(*) n FROM collaborators WHERE archivedAt != ''").get().n;
console.log(`State: ${total} collaborators total, ${archived} archived (devrait être 0 post-migration)`);

db.close();
process.exit(ok ? 0 : 1);
