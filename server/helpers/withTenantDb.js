// server/helpers/withTenantDb.js
// Wrapper d'execution pour route Express / cron.
// Injecte la tenant DB resolue + les metadata tenant dans le handler.
//
// Usage route :
//   import { withTenant } from '../helpers/withTenantDb.js';
//   router.get('/contacts', requireAuth, withTenant((req, res, db, tenant) => {
//     const rows = db.prepare('SELECT * FROM contacts').all();
//     res.json({ contacts: rows });
//   }));
//
// Usage cron / script :
//   import { runWithTenant } from '../helpers/withTenantDb.js';
//   await runWithTenant(companyId, (db, tenant) => { ... });

import { resolveTenant, getTenantDb } from '../db/tenantResolver.js';

/**
 * Middleware-style wrapper pour handlers Express.
 * - Verifie req.auth.companyId (depuis requireAuth)
 * - Resout le tenant
 * - Injecte req.tenant + req.tenantDb
 * - Passe db et tenant au handler pour ergonomie
 * - Mappe les erreurs typees (codes 400/404/409/410/423) vers HTTP
 */
export function withTenant(handler) {
  return async (req, res, next) => {
    try {
      const companyId = req.auth?.companyId;
      if (!companyId) return res.status(400).json({ error: 'COMPANY_ID_REQUIRED' });

      const tenant = resolveTenant(companyId);

      // Pendant la migration : si tenantMode === 'legacy', on refuse d'utiliser withTenant.
      // Le code legacy doit passer par l'ancien db singleton. withTenant ne sert qu'aux
      // companies deja migrees.
      if (tenant.tenantMode !== 'tenant') {
        return res.status(409).json({
          error: 'TENANT_MODE_NOT_ACTIVE',
          detail: `Company ${companyId} is in '${tenant.tenantMode}' mode, use legacy db handler`,
        });
      }

      const db = getTenantDb(companyId);
      req.tenant = tenant;
      req.tenantDb = db;

      await handler(req, res, db, tenant);
    } catch (err) {
      const code = err.code;
      if (code === 400) return res.status(400).json({ error: err.message });
      if (code === 404) return res.status(404).json({ error: err.message });
      if (code === 409) return res.status(409).json({ error: err.message });
      if (code === 410) return res.status(410).json({ error: err.message });
      if (code === 423) return res.status(423).json({ error: err.message });
      // Erreur inattendue : on log en [TENANT] prefix + delegue a express error handler
      console.error('[TENANT] unexpected error in withTenant:', err);
      next(err);
    }
  };
}

/**
 * Version hors-Express pour cron, scripts de maintenance, migration.
 * @param {string} companyId
 * @param {(db, tenant) => any} fn
 */
export async function runWithTenant(companyId, fn) {
  const tenant = resolveTenant(companyId);
  if (tenant.tenantMode !== 'tenant') {
    throw Object.assign(new Error(`TENANT_MODE_NOT_ACTIVE (${tenant.tenantMode})`), { code: 409 });
  }
  const db = getTenantDb(companyId);
  return await fn(db, tenant);
}

/**
 * Version qui tolere le mode legacy (utile pour outils de diagnostic qui
 * doivent fonctionner AVANT la bascule). NE PAS UTILISER DANS LES ROUTES METIER.
 */
export async function runWithTenantUnsafe(companyId, fn) {
  const tenant = resolveTenant(companyId);
  const { getOrOpen } = await import('../db/tenantDbCache.js');
  if (!tenant.dbPath) throw Object.assign(new Error('TENANT_NOT_PROVISIONED'), { code: 409 });
  const db = getOrOpen(tenant.dbPath);
  return await fn(db, tenant);
}
