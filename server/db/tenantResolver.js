// server/db/tenantResolver.js
// Resolution d'un tenant a partir d'un companyId.
// Adjustement MH #1 : dbPath base sur companyId (pas slug) pour eviter
//   rename DB en cas de changement de slug + collisions.
// Adjustement MH #2 : expose tenantMode ('legacy' | 'tenant') pour routing migration.

import path from 'path';
import ct from './controlTower.js';
import { getOrOpen } from './tenantDbCache.js';

const TENANTS_DIR = process.env.TENANTS_DIR || '/var/www/planora-data/tenants';
const STORAGE_DIR = process.env.STORAGE_DIR || '/var/www/planora-data/storage';

// Cache metadata 10 min : evite 1 SELECT control tower par requete.
// Invalidation explicite via invalidateTenant() apres provisioning / bascule mode.
const metaCache = new Map();
const TTL_MS = parseInt(process.env.TENANT_META_TTL_MS || String(10 * 60 * 1000), 10);

/**
 * Convertit un companyId en nom de fichier DB sur.
 * Safeguard anti-path-traversal : whitelist stricte.
 */
function companyIdToDbFilename(companyId) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(companyId)) {
    const e = new Error('INVALID_COMPANY_ID_FORMAT');
    e.code = 400;
    throw e;
  }
  return `${companyId}.db`;
}

/**
 * Construit le dbPath canonique a partir d'un companyId.
 * Utilise pour provisioning ET pour fallback si tenant_databases est incomplet.
 */
export function defaultDbPathFor(companyId) {
  return path.join(TENANTS_DIR, companyIdToDbFilename(companyId));
}

export function defaultStoragePathFor(companyId) {
  return path.join(STORAGE_DIR, companyIdToDbFilename(companyId).replace(/\.db$/, ''));
}

/**
 * Modes de routing par route autorises (source de verite pour getRouteMode).
 * - legacy : lit/ecrit exclusivement sur la monolithe (comportement actuel)
 * - shadow : lit sur les deux, compare, renvoie monolithe (diff-only log)
 * - tenant : lit sur la tenant DB en priorite (monolithe en fallback read)
 */
export const ROUTE_MODES = Object.freeze(['legacy', 'shadow', 'tenant']);

function parseTenantFeatures(raw) {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch {
    return {};
  }
}

/**
 * Resout un tenant depuis la control tower.
 * @param {string} companyId
 * @returns {{id, slug, status, plan, tenantMode, tenantFeatures, dbPath, storagePath, schemaVersion}}
 * @throws Error avec .code = 400/404/409/423 selon le cas
 */
export function resolveTenant(companyId) {
  if (!companyId) { const e = new Error('COMPANY_ID_REQUIRED'); e.code = 400; throw e; }

  const cached = metaCache.get(companyId);
  if (cached && (Date.now() - cached.ts) < TTL_MS) return cached.data;

  const row = ct.prepare(`
    SELECT c.id, c.slug, c.status, c.plan, c.tenantMode, c.tenantFeatures,
           t.dbPath, t.storagePath, t.schemaVersion
    FROM companies c
    LEFT JOIN tenant_databases t ON t.companyId = c.id
    WHERE c.id = ?
  `).get(companyId);

  if (!row) { const e = new Error('TENANT_NOT_FOUND'); e.code = 404; throw e; }
  if (row.status === 'suspended') { const e = new Error('TENANT_SUSPENDED'); e.code = 423; throw e; }
  if (row.status === 'archived')  { const e = new Error('TENANT_ARCHIVED');  e.code = 410; throw e; }

  // En mode legacy, tenant_databases peut etre vide (normal). On ne doit pas
  // permettre d'appeler getTenantDb() dans ce cas -> ValidateBeforeOpen plus bas.
  const data = {
    id: row.id,
    slug: row.slug,
    status: row.status,
    plan: row.plan,
    tenantMode: row.tenantMode || 'legacy',
    tenantFeatures: parseTenantFeatures(row.tenantFeatures),
    dbPath: row.dbPath || null,
    storagePath: row.storagePath || null,
    schemaVersion: row.schemaVersion || 0,
  };

  metaCache.set(companyId, { ts: Date.now(), data });
  return data;
}

/**
 * STEP 5 — Feature flag resolution par (company, feature).
 *
 * Regle de resolution :
 *  1. Si tenantMode === 'legacy' → 'legacy' (kill-switch global, override toute feature)
 *  2. Sinon, si tenantFeatures[feature] est un mode valide → ce mode
 *  3. Sinon → tenantMode (fallback)
 *
 * Contract : retourne TOUJOURS un mode valide dans ROUTE_MODES. Jamais null/undefined.
 * En cas de companyId inconnu/erreur → renvoie 'legacy' (fail-closed vers comportement actuel).
 *
 * @param {string} companyId
 * @param {string} feature  ex: 'contacts', 'bookings', 'pipeline'
 * @returns {'legacy'|'shadow'|'tenant'}
 */
export function getRouteMode(companyId, feature) {
  if (!companyId || !feature) return 'legacy';
  let t;
  try {
    t = resolveTenant(companyId);
  } catch {
    return 'legacy';
  }
  // Kill-switch global : si tenantMode est legacy, aucune feature ne peut etre ailleurs.
  if (t.tenantMode === 'legacy') return 'legacy';

  const featMode = t.tenantFeatures && t.tenantFeatures[feature];
  if (featMode && ROUTE_MODES.includes(featMode)) return featMode;

  // Fallback : le mode global s'applique si la feature n'est pas configuree.
  return ROUTE_MODES.includes(t.tenantMode) ? t.tenantMode : 'legacy';
}

/**
 * Invalide le cache metadata pour un tenant (a appeler apres flip mode, provisioning, suspension).
 */
export function invalidateTenant(companyId) {
  if (companyId) metaCache.delete(companyId);
  else metaCache.clear();
}

/**
 * Retourne une instance Database pour le tenant.
 * Refuse explicitement si tenantMode !== 'tenant' (securite : force le routing via withTenant).
 * @param {string} companyId
 * @returns Database
 */
export function getTenantDb(companyId) {
  const t = resolveTenant(companyId);
  if (t.tenantMode !== 'tenant') {
    const e = new Error(`TENANT_MODE_NOT_ACTIVE (current: ${t.tenantMode})`);
    e.code = 409;
    throw e;
  }
  if (!t.dbPath) {
    const e = new Error('TENANT_NOT_PROVISIONED');
    e.code = 409;
    throw e;
  }
  return getOrOpen(t.dbPath);
}

/**
 * STEP 5 Phase 5B — Ouvre la tenant DB pour shadow read UNIQUEMENT.
 *
 * Difference avec getTenantDb :
 *   - N'exige PAS tenantMode === 'tenant'. Accepte 'shadow' et 'tenant'.
 *   - Refuse toujours si tenantMode === 'legacy' (kill-switch).
 *   - Refuse si la tenant DB n'a pas ete provisionnee (dbPath manquant).
 *
 * Doit etre utilisee EXCLUSIVEMENT en lecture par shadowCompare.
 * Toute erreur levee ici est absorbee par shadowCompare (swallow tenant error)
 * et ne doit JAMAIS remonter au client en mode shadow.
 *
 * @param {string} companyId
 * @returns Database
 */
export function getTenantDbForShadow(companyId) {
  const t = resolveTenant(companyId);
  if (t.tenantMode === 'legacy') {
    const e = new Error(`TENANT_MODE_LEGACY_NO_SHADOW (current: ${t.tenantMode})`);
    e.code = 409;
    throw e;
  }
  if (!t.dbPath) {
    const e = new Error('TENANT_NOT_PROVISIONED');
    e.code = 409;
    throw e;
  }
  return getOrOpen(t.dbPath);
}

/**
 * Helper : liste toutes les companies (utile cron multi-tenant).
 * Retourne le minimum utile pour iterer.
 */
export function listAllCompanies({ onlyActive = true, onlyTenantMode = false } = {}) {
  let sql = `SELECT id, slug, status, tenantMode FROM companies WHERE 1=1`;
  if (onlyActive) sql += ` AND status = 'active'`;
  if (onlyTenantMode) sql += ` AND tenantMode = 'tenant'`;
  return ct.prepare(sql).all();
}
