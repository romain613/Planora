// server/shared/providers/registry/providerRegistry.js
// Registry des providers enregistrés (en mémoire).
// Pas de persistance Sprint 3 — pur store + lookup.

import { BaseProvider } from '../core/BaseProvider.js';

export class ProviderRegistry {
  constructor() {
    this._providers = new Map(); // id → provider instance
  }

  /**
   * Enregistre un provider.
   * @param {BaseProvider} provider
   */
  register(provider) {
    if (!(provider instanceof BaseProvider)) {
      throw new TypeError('ProviderRegistry.register: provider must extend BaseProvider');
    }
    if (this._providers.has(provider.id)) {
      throw new Error(`ProviderRegistry.register: duplicate id "${provider.id}"`);
    }
    this._providers.set(provider.id, provider);
    return this;
  }

  /**
   * Retire un provider du registry.
   */
  unregister(id) {
    return this._providers.delete(id);
  }

  /**
   * Retourne le provider par id, ou null.
   */
  get(id) {
    return this._providers.get(id) || null;
  }

  /**
   * Vrai si id enregistré.
   */
  has(id) {
    return this._providers.has(id);
  }

  /**
   * Liste tous les providers (instances).
   */
  list() {
    return Array.from(this._providers.values());
  }

  /**
   * Liste filtrée par critère(s) :
   *   - capability: provider.supports(cap)
   *   - type: provider.type === type
   *   - ownership / suproId / clientId : filtre tenant ownership
   */
  filter({ capability, type, ownership, suproId, clientId } = {}) {
    return this.list().filter((p) => {
      if (capability && !p.supports(capability)) return false;
      if (type && p.type !== type) return false;
      if (ownership && p.ownership !== ownership) return false;
      if (suproId !== undefined && p.suproId !== suproId) return false;
      if (clientId !== undefined && p.clientId !== clientId) return false;
      return true;
    });
  }

  /**
   * Nombre total.
   */
  size() {
    return this._providers.size;
  }

  /**
   * Vide le registry.
   */
  clear() {
    this._providers.clear();
  }

  /**
   * Summary safe pour observability (toSummary par provider).
   */
  toSummary() {
    return this.list().map((p) => p.toSummary());
  }
}
