// server/shared/providers/core/BaseMessagingProvider.js
// Classe abstraite pour providers messaging (SMS / email / WhatsApp).

import { BaseProvider } from './BaseProvider.js';
import { PROVIDER_TYPES } from '../types/providerTypes.js';
import { MESSAGE_KIND, MESSAGE_DIRECTION, makeMessage } from '../types/messageTypes.js';

export class BaseMessagingProvider extends BaseProvider {
  constructor(opts = {}) {
    super({
      ...opts,
      type: opts.type || PROVIDER_TYPES.MESSAGING,
    });
  }

  /**
   * Envoie un message outbound.
   * À OVERRIDE par chaque adapter.
   * @param {object} params
   * @param {string} params.to - E.164 ou email
   * @param {string} params.body
   * @param {string} [params.from]
   * @param {string} [params.kind=SMS] - MESSAGE_KIND.*
   * @param {string} [params.tenantId]
   * @param {object} [params.meta]
   * @returns {Promise<Message>} message normalized
   */
  async sendMessage(_params) {
    throw new Error(`${this.constructor.name}.sendMessage() not implemented`);
  }

  /**
   * Vérifie le status d'un message envoyé (DLR).
   * À OVERRIDE.
   */
  async getMessageStatus(_messageId) {
    throw new Error(`${this.constructor.name}.getMessageStatus() not implemented`);
  }

  /**
   * Helper protégé : normalise un message reçu d'un webhook inbound provider-spécifique.
   * Les adapters utilisent ceci pour convertir leurs payloads natifs en Message standard.
   */
  _normalizeInbound({ id, kind, from, to, body, providerId, tenantId, meta }) {
    return makeMessage({
      id,
      kind: kind || MESSAGE_KIND.SMS,
      direction: MESSAGE_DIRECTION.INBOUND,
      from,
      to,
      body,
      providerId: providerId || this.id,
      tenantId,
      meta,
    });
  }
}
