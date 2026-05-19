// server/shared/guards/requireTenant.js
// Guard Express : vérifie req.tenantCtx présent + correspond au scope demandé.

import { TENANT_SCOPES } from '../auth/tenantContext.js';
import { TenantMismatch, Unauthenticated } from '../errors/httpErrors.js';

/**
 * Factory guard.
 * @param {object} opts
 * @param {string} [opts.scope] - PLATFORM | SUPRO | CLIENT (default: any non-anonymous tenant)
 * @param {string} [opts.suproId] - si scope=SUPRO, vérifie l'ID
 * @param {string} [opts.clientId] - si scope=CLIENT, vérifie l'ID
 * @param {Function} [opts.resolveIdFromReq] - (req) => {suproId?, clientId?} pour extraction dynamique
 */
export function requireTenant(opts = {}) {
  return function requireTenantMw(req, res, next) {
    const tenantCtx = req && req.tenantCtx;
    if (!tenantCtx) {
      const err = new Unauthenticated({
        safeMessage: 'Tenant context requis',
        correlationId: req && req.requestId,
      });
      if (typeof next === 'function') return next(err);
      throw err;
    }

    if (opts.scope && tenantCtx.scope !== opts.scope) {
      const err = new TenantMismatch({
        safeMessage: `Scope ${opts.scope} requis`,
        details: { required: opts.scope, actual: tenantCtx.scope },
        correlationId: req && req.requestId,
      });
      if (typeof next === 'function') return next(err);
      throw err;
    }

    // Dynamic ID resolution
    let expectedSupro = opts.suproId;
    let expectedClient = opts.clientId;
    if (typeof opts.resolveIdFromReq === 'function') {
      const dyn = opts.resolveIdFromReq(req) || {};
      if (dyn.suproId) expectedSupro = dyn.suproId;
      if (dyn.clientId) expectedClient = dyn.clientId;
    }

    if (expectedSupro && tenantCtx.suproId !== expectedSupro) {
      const err = new TenantMismatch({
        safeMessage: 'SUPRO mismatch',
        details: { required: expectedSupro, actual: tenantCtx.suproId },
        correlationId: req && req.requestId,
      });
      if (typeof next === 'function') return next(err);
      throw err;
    }

    if (expectedClient && tenantCtx.clientId !== expectedClient) {
      const err = new TenantMismatch({
        safeMessage: 'CLIENT mismatch',
        details: { required: expectedClient, actual: tenantCtx.clientId },
        correlationId: req && req.requestId,
      });
      if (typeof next === 'function') return next(err);
      throw err;
    }

    if (typeof next === 'function') next();
  };
}

export const TENANT_SCOPES_RE_EXPORT = TENANT_SCOPES;
