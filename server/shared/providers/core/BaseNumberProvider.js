// server/shared/providers/core/BaseNumberProvider.js
// Classe abstraite providers de numéros (DID).

import { BaseProvider } from './BaseProvider.js';
import { PROVIDER_TYPES } from '../types/providerTypes.js';
import { NUMBER_STATUS, makePhoneNumber } from '../types/numberTypes.js';

export class BaseNumberProvider extends BaseProvider {
  constructor(opts = {}) {
    super({
      ...opts,
      type: opts.type || PROVIDER_TYPES.NUMBER,
    });
  }

  /**
   * Liste numéros disponibles à provisionner selon filtres.
   * À OVERRIDE.
   * @param {object} filter
   * @param {string} [filter.countryIso]
   * @param {string} [filter.numberType] - NUMBER_TYPE.*
   * @param {string} [filter.areaCode]
   * @param {number} [filter.limit=10]
   * @returns {Promise<PhoneNumber[]>}
   */
  async searchAvailable(_filter) {
    throw new Error(`${this.constructor.name}.searchAvailable() not implemented`);
  }

  /**
   * Provision un numéro pour un tenant.
   * À OVERRIDE.
   * @param {object} params
   * @param {string} params.e164
   * @param {string} params.tenantId
   * @returns {Promise<PhoneNumber>}
   */
  async provisionNumber(_params) {
    throw new Error(`${this.constructor.name}.provisionNumber() not implemented`);
  }

  /**
   * Libère un numéro.
   * À OVERRIDE.
   */
  async releaseNumber(_providerNumberId) {
    throw new Error(`${this.constructor.name}.releaseNumber() not implemented`);
  }

  /**
   * Helper protégé : factory PhoneNumber depuis raw provider data.
   */
  _normalizeNumber(raw) {
    return makePhoneNumber({
      ...raw,
      providerId: raw.providerId || this.id,
      status: raw.status || NUMBER_STATUS.AVAILABLE,
    });
  }
}
