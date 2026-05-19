// server/shared/providers/mocks/MockProvider.js
// Mock provider générique (composite) — utile pour tests registry/router neutres.

import { BaseProvider } from '../core/BaseProvider.js';
import { PROVIDER_TYPES, PROVIDER_STATUS } from '../types/providerTypes.js';

export class MockProvider extends BaseProvider {
  constructor(opts = {}) {
    super({
      type: PROVIDER_TYPES.COMPOSITE,
      capabilities: [],
      ...opts,
      id: opts.id || 'mock-provider',
    });
    this._setHealth(opts.initialStatus || PROVIDER_STATUS.HEALTHY);
  }

  async checkHealth() {
    return this._status;
  }

  /**
   * Helper test : force le status.
   */
  setStatus(status) {
    this._setHealth(status);
  }
}
