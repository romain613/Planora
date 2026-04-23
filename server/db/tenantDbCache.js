// server/db/tenantDbCache.js
// LRU cache d'instances better-sqlite3 pour les tenant DBs.
// Evite open/close a chaque requete tout en limitant le nombre de file descriptors.
//
// Isolation : aucune dependance vers database.js ou controlTower.js.
// Pure fonction de cache.

import Database from 'better-sqlite3';

const MAX_OPEN = parseInt(process.env.TENANT_DB_CACHE_SIZE || '50', 10);

// Map JS preserve l'ordre d'insertion -> utilise comme LRU ordering.
// dbPath -> { db, openedAt, hits }
const cache = new Map();

function touch(key) {
  const v = cache.get(key);
  if (v) {
    cache.delete(key);
    cache.set(key, v);
    v.hits = (v.hits || 0) + 1;
  }
}

function evictOldest() {
  const oldestKey = cache.keys().next().value;
  if (!oldestKey) return;
  const entry = cache.get(oldestKey);
  try { entry.db.close(); } catch (e) { console.warn('[TENANT CACHE] close failed:', oldestKey, e.message); }
  cache.delete(oldestKey);
  console.log('[TENANT CACHE] evicted:', oldestKey);
}

/**
 * Ouvre (ou recupere en cache) une DB tenant.
 * @param {string} dbPath chemin absolu
 * @returns {Database} instance better-sqlite3
 */
export function getOrOpen(dbPath) {
  if (!dbPath || typeof dbPath !== 'string') throw new Error('getOrOpen: dbPath required');

  if (cache.has(dbPath)) {
    touch(dbPath);
    return cache.get(dbPath).db;
  }

  if (cache.size >= MAX_OPEN) evictOldest();

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  cache.set(dbPath, { db, openedAt: Date.now(), hits: 0 });
  console.log('[TENANT CACHE] opened:', dbPath, '(size =', cache.size, '/', MAX_OPEN + ')');
  return db;
}

/**
 * Evince explicitement une DB du cache (apres suppression tenant, migration, etc.)
 */
export function evict(dbPath) {
  const entry = cache.get(dbPath);
  if (!entry) return false;
  try { entry.db.close(); } catch (e) { console.warn('[TENANT CACHE] evict close failed:', e.message); }
  cache.delete(dbPath);
  console.log('[TENANT CACHE] manually evicted:', dbPath);
  return true;
}

/**
 * Ferme toutes les connexions (SIGTERM, tests).
 */
export function closeAll() {
  for (const [dbPath, entry] of cache) {
    try { entry.db.close(); } catch (e) { /* ignore */ }
  }
  const n = cache.size;
  cache.clear();
  if (n) console.log('[TENANT CACHE] closed all (', n, 'connections)');
}

/**
 * Introspection / monitoring (utilisable par endpoint /health ou admin).
 */
export function stats() {
  const entries = [];
  for (const [dbPath, entry] of cache) {
    entries.push({
      dbPath,
      openedAt: new Date(entry.openedAt).toISOString(),
      ageMs: Date.now() - entry.openedAt,
      hits: entry.hits || 0,
    });
  }
  return { size: cache.size, maxOpen: MAX_OPEN, entries };
}

// Fermeture gracieuse
process.on('SIGTERM', closeAll);
process.on('SIGINT', closeAll);
