// server/shared/auth/tenantContext.js
// TenantContext : représentation immutable du tenant (SUPRO/CLIENT) lié à une requête.
//
// Indépendant de AuthContext pour permettre :
//   - SUPRA admin impersonate un CLIENT (ctx.level=supra mais tenant.scope=client/<id>)
//   - actions cross-tenant (rares, traçables)

import { deepFreeze } from '../utils/deepFreeze.js';

export const TENANT_SCOPES = Object.freeze({
  PLATFORM: 'platform', // pas de tenant (action SUPRA root)
  SUPRO: 'supro',
  CLIENT: 'client',
});

/**
 * Crée un TenantContext immutable.
 *
 * @param {object} opts
 * @param {string} opts.scope - PLATFORM | SUPRO | CLIENT
 * @param {string} [opts.suproId]
 * @param {string} [opts.clientId]
 * @param {string} [opts.tenantName] - libellé human-friendly (logging)
 * @param {string} [opts.tenantMode] - "legacy"|"shadow"|"tenant" (cohérence CLAUDE.md §10)
 * @param {object} [opts.features] - feature flags du tenant
 * @returns {object} deeply-frozen TenantContext
 */
export function makeTenantContext(opts = {}) {
  if (!opts.scope || !Object.values(TENANT_SCOPES).includes(opts.scope)) {
    throw new TypeError(`makeTenantContext: invalid scope "${opts.scope}"`);
  }
  if (opts.scope === TENANT_SCOPES.SUPRO && !opts.suproId) {
    throw new TypeError('makeTenantContext: scope=supro requires suproId');
  }
  if (opts.scope === TENANT_SCOPES.CLIENT && !opts.clientId) {
    throw new TypeError('makeTenantContext: scope=client requires clientId');
  }

  const ctx = {
    scope: opts.scope,
    suproId: opts.suproId || null,
    clientId: opts.clientId || null,
    tenantName: opts.tenantName || null,
    tenantMode: opts.tenantMode || 'legacy', // default Option A
    features: opts.features && typeof opts.features === 'object' ? { ...opts.features } : {},
    resolvedAt: Date.now(),
  };
  return deepFreeze(ctx);
}

/**
 * Crée un TenantContext platform (pas de tenant — SUPRA root action).
 */
export function makePlatformContext() {
  return makeTenantContext({ scope: TENANT_SCOPES.PLATFORM });
}

/**
 * Vrai si le tenantContext représente bien le CLIENT demandé.
 */
export function isTenantClient(tenantCtx, clientId) {
  if (!tenantCtx) return false;
  return tenantCtx.scope === TENANT_SCOPES.CLIENT && tenantCtx.clientId === clientId;
}

/**
 * Vrai si le tenantContext représente bien le SUPRO demandé.
 */
export function isTenantSupro(tenantCtx, suproId) {
  if (!tenantCtx) return false;
  return tenantCtx.scope === TENANT_SCOPES.SUPRO && tenantCtx.suproId === suproId;
}

/**
 * Vrai si le tenant a un feature flag actif.
 */
export function tenantHasFeature(tenantCtx, featureName) {
  if (!tenantCtx || !tenantCtx.features) return false;
  return Boolean(tenantCtx.features[featureName]);
}
