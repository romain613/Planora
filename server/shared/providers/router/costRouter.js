// server/shared/providers/router/costRouter.js
// Least Cost Router (LCR) basique.
// Sélectionne le candidat le moins cher pour la destination donnée selon costProfile du provider.
//
// Phase 1 = LCR mock-compatible (algo basique). Phase 4+ : LCR raffiné (geo-routing,
// destination prefix matching, etc.) — cf. Audit 5.

import { resolveProviders } from '../registry/providerResolver.js';

/**
 * Calcule le coût d'une opération selon le costProfile du provider.
 *
 * @param {BaseProvider} provider
 * @param {object} op
 * @param {string} op.kind - 'sms' | 'voice'
 * @param {number} [op.durationMin] - pour voice
 * @returns {number|null} centimes; null si pas de costProfile
 */
export function estimateCost(provider, op = {}) {
  if (!provider || !provider.costProfile) return null;
  const cp = provider.costProfile;

  if (op.kind === 'sms') {
    if (cp.sms && typeof cp.sms.cents === 'number') return cp.sms.cents;
    return null;
  }
  if (op.kind === 'voice') {
    const minutes = typeof op.durationMin === 'number' ? op.durationMin : 1;
    if (cp.voice && typeof cp.voice.centsPerMin === 'number') {
      return Math.round(cp.voice.centsPerMin * minutes);
    }
    return null;
  }
  return null;
}

export class CostRouter {
  /**
   * @param {ProviderRegistry} registry
   */
  constructor(registry) {
    if (!registry) throw new TypeError('CostRouter: registry required');
    this._registry = registry;
  }

  /**
   * Retourne le candidat le moins cher (parmi ceux ayant un costProfile défini).
   * Providers sans costProfile sont placés en fin (fallback).
   *
   * @param {object} opts
   * @param {string} opts.capability
   * @param {string} [opts.suproId]
   * @param {string} [opts.clientId]
   * @param {object} opts.operation - { kind: 'sms'|'voice', durationMin? }
   * @returns {BaseProvider|null}
   */
  selectCheapest(opts) {
    const candidates = resolveProviders(this._registry, opts);
    if (candidates.length === 0) return null;

    // Map each candidate to its estimated cost
    const withCost = candidates.map((p) => ({ p, cost: estimateCost(p, opts.operation) }));

    // Sort: providers avec cost défini en premier (ascending cost), puis ceux sans
    withCost.sort((a, b) => {
      if (a.cost === null && b.cost === null) return 0;
      if (a.cost === null) return 1;
      if (b.cost === null) return -1;
      return a.cost - b.cost;
    });

    return withCost[0].p;
  }

  /**
   * Liste des candidats avec coût attaché (pour observability).
   */
  rank(opts) {
    const candidates = resolveProviders(this._registry, opts);
    return candidates.map((p) => ({
      providerId: p.id,
      cost: estimateCost(p, opts.operation),
      priority: p.priority,
      ownership: p.ownership,
    }));
  }
}
