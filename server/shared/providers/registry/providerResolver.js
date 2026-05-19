// server/shared/providers/registry/providerResolver.js
// Resolution policy : à partir d'un (capability, tenantCtx), retourne providers candidats.
//
// Hiérarchie de préférence :
//   1. CLIENT-owned (suproId+clientId match)
//   2. SUPRO-owned (suproId match)
//   3. PLATFORM-owned (fallback partagé)
//
// Intra-niveau : tri par priority (asc), puis health (healthy > degraded > down/unknown).

import { ProviderRegistry } from './providerRegistry.js';
import { TENANT_OWNERSHIP, PROVIDER_STATUS } from '../types/providerTypes.js';

const HEALTH_RANK = {
  [PROVIDER_STATUS.HEALTHY]: 0,
  [PROVIDER_STATUS.DEGRADED]: 1,
  [PROVIDER_STATUS.UNKNOWN]: 2,
  [PROVIDER_STATUS.DOWN]: 3,
};

const OWNERSHIP_RANK = {
  [TENANT_OWNERSHIP.CLIENT]: 0,
  [TENANT_OWNERSHIP.SUPRO]: 1,
  [TENANT_OWNERSHIP.PLATFORM]: 2,
};

/**
 * Resolve les providers candidats pour une capability donnée + tenant context.
 *
 * @param {ProviderRegistry} registry
 * @param {object} opts
 * @param {string} opts.capability - requise
 * @param {string} [opts.suproId]
 * @param {string} [opts.clientId]
 * @param {boolean} [opts.includeDown=false] - inclure les providers DOWN
 * @returns {BaseProvider[]} liste triée (préférence décroissante)
 */
export function resolveProviders(registry, opts = {}) {
  if (!(registry instanceof ProviderRegistry)) {
    throw new TypeError('resolveProviders: registry must be ProviderRegistry');
  }
  if (!opts.capability) {
    throw new TypeError('resolveProviders: capability required');
  }

  const all = registry.filter({ capability: opts.capability });

  // Filtrer par tenant ownership compatible
  const candidates = all.filter((p) => {
    if (p.ownership === TENANT_OWNERSHIP.CLIENT) {
      return p.suproId === opts.suproId && p.clientId === opts.clientId;
    }
    if (p.ownership === TENANT_OWNERSHIP.SUPRO) {
      return opts.suproId ? p.suproId === opts.suproId : false;
    }
    if (p.ownership === TENANT_OWNERSHIP.PLATFORM) {
      return true; // dispo pour tout le monde
    }
    return false;
  });

  const healthyFiltered = opts.includeDown
    ? candidates
    : candidates.filter((p) => p._status !== PROVIDER_STATUS.DOWN);

  // Tri par préférence : ownership (CLIENT > SUPRO > PLATFORM), priority asc, health asc
  return healthyFiltered.sort((a, b) => {
    const o = (OWNERSHIP_RANK[a.ownership] ?? 9) - (OWNERSHIP_RANK[b.ownership] ?? 9);
    if (o !== 0) return o;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (HEALTH_RANK[a._status] ?? 9) - (HEALTH_RANK[b._status] ?? 9);
  });
}
