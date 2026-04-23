// server/db/controlTower.js
// Control Tower DB — metadata globale du SaaS multi-tenant.
// Contient : companies, tenant_databases, sessions, supra_admins, catalogues globaux.
// NE CONTIENT AUCUNE DONNEE METIER TENANT.
//
// Isolation : ce fichier n'importe RIEN depuis database.js (monolithe legacy).
// Il peut etre charge independamment et teste en isolation.

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const CT_PATH = process.env.CONTROL_TOWER_PATH
  || '/var/www/planora-data/control_tower.db';

// Creer le dossier parent si inexistant (utile en local / CI)
try {
  const dir = dirname(CT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
} catch (e) {
  // Non fatal : le fichier peut exister deja
  console.warn('[CONTROL TOWER] mkdir parent skipped:', e.message);
}

const ct = new Database(CT_PATH);

// Pragmas obligatoires
ct.pragma('journal_mode = WAL');
ct.pragma('foreign_keys = ON');
ct.pragma('busy_timeout = 5000');   // 5s d'attente si lock (deploy concurrent)
ct.pragma('synchronous = NORMAL');  // bon compromis WAL

console.log('[CONTROL TOWER] opened:', CT_PATH);

// Fermeture gracieuse : evite les .db-wal / .db-shm orphelins sur SIGTERM (PM2 reload)
function safeClose() {
  try { ct.close(); console.log('[CONTROL TOWER] closed cleanly'); } catch (e) { /* ignore */ }
}
process.on('SIGTERM', safeClose);
process.on('SIGINT', safeClose);

export default ct;
export { CT_PATH };
