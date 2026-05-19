// server/shared/providers/core/BaseVoiceProvider.js
// Classe abstraite providers voix (PSTN, SIP, VoIP).

import { BaseProvider } from './BaseProvider.js';
import { PROVIDER_TYPES } from '../types/providerTypes.js';
import { CALL_DIRECTION, makeCall, makeCdr } from '../types/callTypes.js';

export class BaseVoiceProvider extends BaseProvider {
  constructor(opts = {}) {
    super({
      ...opts,
      type: opts.type || PROVIDER_TYPES.VOICE,
    });
  }

  /**
   * Initie un appel outbound.
   * À OVERRIDE.
   */
  async initiateCall(_params) {
    throw new Error(`${this.constructor.name}.initiateCall() not implemented`);
  }

  /**
   * Termine un appel en cours.
   * À OVERRIDE.
   */
  async hangupCall(_callId) {
    throw new Error(`${this.constructor.name}.hangupCall() not implemented`);
  }

  /**
   * Retourne le status courant d'un appel.
   * À OVERRIDE.
   */
  async getCallStatus(_callId) {
    throw new Error(`${this.constructor.name}.getCallStatus() not implemented`);
  }

  /**
   * Retourne le CDR (Call Detail Record) après fin d'appel.
   * À OVERRIDE — peut être async (provider remote).
   */
  async getCdr(_callId) {
    throw new Error(`${this.constructor.name}.getCdr() not implemented`);
  }

  /**
   * Helper protégé : normalise un événement appel inbound.
   */
  _normalizeInboundCall({ id, from, to, providerId, tenantId, meta }) {
    return makeCall({
      id,
      direction: CALL_DIRECTION.INBOUND,
      from,
      to,
      providerId: providerId || this.id,
      tenantId,
      meta,
    });
  }

  /**
   * Helper protégé : factory CDR depuis raw provider event.
   */
  _buildCdr(opts) {
    return makeCdr({
      ...opts,
      providerId: opts.providerId || this.id,
    });
  }
}
