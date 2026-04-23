// server/routes/tenantAdmin.js
// STEP 5 Phase 5A — Endpoints admin pour observer le shadow mode.
// Tous requireSupra : seuls les supra-admins peuvent lire les diffs cross-tenant.

import express from 'express';
import ct from '../db/controlTower.js';
import { requireAuth, requireSupra } from '../middleware/auth.js';
import { ROUTE_MODES, resolveTenant } from '../db/tenantResolver.js';

const router = express.Router();

// Helper d'erreur : Express refuse res.status(X) si X n'est pas un entier 100..599.
// better-sqlite3 throw avec e.code = 'SQLITE_ERROR' (string) -> on tombe sur 500 + JSON propre.
// Tags: errorCode = code SQLite (string) conserve dans le body pour debug, jamais en status.
function sendError(res, e, fallbackError = 'INTERNAL_ERROR') {
  const sqlCode = (typeof e.code === 'string') ? e.code : null;
  const httpCode = (typeof e.code === 'number' && e.code >= 100 && e.code < 600) ? e.code : 500;
  console.error('[TENANT-ADMIN]', fallbackError, '|', e.message, '| sqlCode:', sqlCode);
  res.status(httpCode).json({
    error: fallbackError,
    detail: e.message || 'unknown',
    sqlCode,
  });
}

// GET /api/tenant-admin/shadow-diffs
// Query params:
//   companyId   : filtre par company (optionnel)
//   feature     : filtre par feature (optionnel ; ex 'contacts')
//   limit       : 1..500, defaut 100
//   offset      : pagination, defaut 0
// Reponse : { items: [...], total: N, filters: {...} }
router.get('/shadow-diffs', requireAuth, requireSupra, (req, res) => {
  const { companyId, feature } = req.query;
  const limit  = Math.min(500, Math.max(1, parseInt(req.query.limit,  10) || 100));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  const where = [];
  const params = [];
  if (companyId) { where.push('companyId = ?'); params.push(String(companyId)); }
  if (feature)   { where.push('feature   = ?'); params.push(String(feature)); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const total = ct.prepare(`SELECT COUNT(*) AS n FROM tenant_shadow_diffs ${whereSql}`).get(...params).n;
    const items = ct.prepare(`
      SELECT id, companyId, route, feature, timestamp,
             monolithHash, tenantHash, monolithRowCount, tenantRowCount,
             payloadSample, tenantError
      FROM tenant_shadow_diffs
      ${whereSql}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      items,
      total,
      filters: { companyId: companyId || null, feature: feature || null, limit, offset },
    });
  } catch (e) {
    return sendError(res, e, 'SHADOW_DIFFS_READ_FAILED');
  }
});

// GET /api/tenant-admin/shadow-diffs/summary
// Agregat des diffs par (companyId, feature) sur la fenetre recente.
// Query param: hours (defaut 24, 1..168).
router.get('/shadow-diffs/summary', requireAuth, requireSupra, (req, res) => {
  const hours = Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 24));
  try {
    const rows = ct.prepare(`
      SELECT companyId, feature,
             COUNT(*) AS diffCount,
             SUM(CASE WHEN tenantError IS NOT NULL THEN 1 ELSE 0 END) AS tenantErrorCount,
             MAX(timestamp) AS lastSeen
      FROM tenant_shadow_diffs
      WHERE timestamp >= datetime('now', ?)
      GROUP BY companyId, feature
      ORDER BY diffCount DESC, lastSeen DESC
    `).all(`-${hours} hours`);
    res.json({ windowHours: hours, groups: rows });
  } catch (e) {
    return sendError(res, e, 'SHADOW_SUMMARY_FAILED');
  }
});

// GET /api/tenant-admin/mode/:companyId
// Retourne l'etat de routing actuel pour une company : tenantMode + tenantFeatures parses.
router.get('/mode/:companyId', requireAuth, requireSupra, (req, res) => {
  try {
    const t = resolveTenant(req.params.companyId);
    res.json({
      companyId: t.id,
      tenantMode: t.tenantMode,
      tenantFeatures: t.tenantFeatures,
      status: t.status,
      hasTenantDb: !!t.dbPath,
      validModes: ROUTE_MODES,
    });
  } catch (e) {
    // FIX 5A : ne JAMAIS passer e.code (qui peut etre 'SQLITE_ERROR') a res.status().
    return sendError(res, e, 'TENANT_MODE_READ_FAILED');
  }
});

export default router;
