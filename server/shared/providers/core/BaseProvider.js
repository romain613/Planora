// server/shared/providers/core/BaseProvider.js
// Classe abstraite base — tous les providers en héritent.
// WRAP-only : aucune init runtime, aucune connexion auto, aucun side effect au load.
//
// Le caller construit le provider en injectant les clients/secrets explicitement.

import { PROVIDER_STATUS, TENANT_OWNERSHIP, isCapability } from '../types/providerTypes.js';

export class BaseProvider {
  /**
   * @param {object} opts
   * @param {string} opts.id - identifiant unique (ex: 'twilio-default', 'sip-ovh-trunk1')
   * @param {string} opts.type - PROVIDER_TYPES.*
   * @param {string} opts.displayName
   * @param {string[]} opts.capabilities - liste de CAPABILITIES.*
   * @param {number} [opts.priority=100] - plus bas = priorité supérieure
   * @param {object} [opts.costProfile] - { sms: {cents, currency}, voice: {centsPerMin, currency} }
   * @param {string} [opts.ownership=PLATFORM] - PLATFORM | SUPRO | CLIENT
   * @param {string} [opts.suproId]
   * @param {string} [opts.clientId]
   * @param {object} [opts.config] - config provider-spécifique opaque
   */
  constructor(opts = {}) {
    if (new.target === BaseProvider) {
      throw new TypeError('BaseProvider is abstract — use a subclass');
    }
    if (!opts.id || typeof opts.id !== 'string') {
      throw new TypeError('BaseProvider: id required string');
    }
    if (!opts.type || typeof opts.type !== 'string') {
      throw new TypeError('BaseProvider: type required string');
    }
    if (!Array.isArray(opts.capabilities)) {
      throw new TypeError('BaseProvider: capabilities required array');
    }
    for (const cap of opts.capabilities) {
      if (!isCapability(cap)) {
        throw new TypeError(`BaseProvider: invalid capability "${cap}"`);
      }
    }

    this.id = opts.id;
    this.type = opts.type;
    this.displayName = opts.displayName || opts.id;
    this.capabilities = Object.freeze([...opts.capabilities]);
    this.priority = typeof opts.priority === 'number' ? opts.priority : 100;
    this.costProfile = opts.costProfile || null;
    this.ownership = opts.ownership || TENANT_OWNERSHIP.PLATFORM;
    this.suproId = opts.suproId || null;
    this.clientId = opts.clientId || null;
    this.config = opts.config || null;

    this._status = PROVIDER_STATUS.UNKNOWN;
    this._lastHealthCheckAt = null;
    this._lastError = null;
  }

  /**
   * Vérifie si une capability est supportée.
   */
  supports(capability) {
    return this.capabilities.includes(capability);
  }

  /**
   * Health getter.
   */
  getHealth() {
    return {
      status: this._status,
      lastCheckedAt: this._lastHealthCheckAt,
      lastError: this._lastError,
    };
  }

  /**
   * Health setter (interne, appelé par health check ou erreurs runtime).
   */
  _setHealth(status, errorMessage = null) {
    if (!Object.values(PROVIDER_STATUS).includes(status)) {
      throw new TypeError(`_setHealth: invalid status "${status}"`);
    }
    this._status = status;
    this._lastHealthCheckAt = Date.now();
    this._lastError = errorMessage;
  }

  /**
   * Health check — à override par chaque adapter.
   * Doit retourner une Promise resolvant un PROVIDER_STATUS.
   */
  async checkHealth() {
    throw new Error(`${this.constructor.name}.checkHealth() not implemented`);
  }

  /**
   * Sérialisation safe pour logs / registry list (exclut config secrets).
   */
  toSummary() {
    return {
      id: this.id,
      type: this.type,
      displayName: this.displayName,
      capabilities: [...this.capabilities],
      priority: this.priority,
      ownership: this.ownership,
      suproId: this.suproId,
      clientId: this.clientId,
      status: this._status,
      lastCheckedAt: this._lastHealthCheckAt,
    };
  }
}
