// server/shared/providers/router/providerRouter.js
// Router de base : sélectionne le 1er provider candidat via resolver.

import { resolveProviders } from '../registry/providerResolver.js';

export class ProviderRouter {
  /**
   * @param {ProviderRegistry} registry
   */
  constructor(registry) {
    if (!registry) throw new TypeError('ProviderRouter: registry required');
    this._registry = registry;
  }

  /**
   * Retourne le meilleur provider candidat (ou null si aucun).
   *
   * @param {object} opts
   * @param {string} opts.capability
   * @param {string} [opts.suproId]
   * @param {string} [opts.clientId]
   * @returns {BaseProvider|null}
   */
  select(opts) {
    const candidates = resolveProviders(this._registry, opts);
    return candidates[0] || null;
  }

  /**
   * Liste tous les candidats triés (utile pour failover/cost router).
   */
  candidates(opts) {
    return resolveProviders(this._registry, opts);
  }
}
