// server/shared/providers/router/failoverRouter.js
// Failover router : tente l'opération sur le 1er provider, fallback sur les suivants si throw.
// Stratégie cascade simple — pas de circuit breaker en Sprint 3.

import { resolveProviders } from '../registry/providerResolver.js';

export class FailoverRouter {
  /**
   * @param {ProviderRegistry} registry
   * @param {object} [opts]
   * @param {number} [opts.maxAttempts=3] - nombre max de providers à essayer
   * @param {Function} [opts.onAttemptFailed] - (provider, error, attemptIndex) => void hook
   */
  constructor(registry, opts = {}) {
    if (!registry) throw new TypeError('FailoverRouter: registry required');
    this._registry = registry;
    this._maxAttempts = typeof opts.maxAttempts === 'number' ? opts.maxAttempts : 3;
    this._onAttemptFailed = typeof opts.onAttemptFailed === 'function' ? opts.onAttemptFailed : null;
  }

  /**
   * Exécute `operation(provider)` en cascade jusqu'à succès OU épuisement.
   *
   * @param {object} resolveOpts - { capability, suproId, clientId }
   * @param {Function} operation - async (provider) => result
   * @returns {Promise<{result, providerId, attempts}>}
   * @throws {Error} si tous les attempts échouent — l'erreur dernière + .attempts attaché
   */
  async execute(resolveOpts, operation) {
    if (typeof operation !== 'function') {
      throw new TypeError('FailoverRouter.execute: operation must be function');
    }

    const candidates = resolveProviders(this._registry, resolveOpts);
    if (candidates.length === 0) {
      const err = new Error('FailoverRouter.execute: no candidate provider available');
      err.attempts = [];
      throw err;
    }

    const attempts = [];
    const tried = candidates.slice(0, this._maxAttempts);

    let lastErr = null;
    for (let i = 0; i < tried.length; i += 1) {
      const provider = tried[i];
      try {
        const result = await operation(provider);
        attempts.push({ providerId: provider.id, ok: true });
        return { result, providerId: provider.id, attempts };
      } catch (e) {
        attempts.push({ providerId: provider.id, ok: false, error: e.message });
        lastErr = e;
        if (this._onAttemptFailed) {
          try { this._onAttemptFailed(provider, e, i); } catch { /* hook errors swallowed */ }
        }
      }
    }

    const err = new Error(`FailoverRouter.execute: all ${attempts.length} attempts failed`);
    err.cause = lastErr;
    err.attempts = attempts;
    throw err;
  }
}
