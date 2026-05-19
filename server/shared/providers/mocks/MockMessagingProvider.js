// server/shared/providers/mocks/MockMessagingProvider.js
// Mock messaging provider — tests E2E + dev local.
// Aucune connexion réseau. Stocke en mémoire.

import { BaseMessagingProvider } from '../core/BaseMessagingProvider.js';
import { CAPABILITIES, PROVIDER_STATUS } from '../types/providerTypes.js';
import { MESSAGE_DIRECTION, MESSAGE_STATUS, MESSAGE_KIND, makeMessage } from '../types/messageTypes.js';
import { randomUUID } from 'node:crypto';

export class MockMessagingProvider extends BaseMessagingProvider {
  constructor(opts = {}) {
    super({
      capabilities: [CAPABILITIES.SMS_OUTBOUND, CAPABILITIES.SMS_INBOUND, CAPABILITIES.SMS_DLR],
      ...opts,
      id: opts.id || 'mock-messaging',
      displayName: opts.displayName || 'Mock Messaging',
    });
    // Comportement configurable pour tests
    this._failNext = false;
    this._failNextReason = null;
    this._sent = [];
    this._inbound = [];
    this._setHealth(PROVIDER_STATUS.HEALTHY);
  }

  /**
   * Configure le prochain appel sendMessage pour fail.
   */
  failNext(reason = 'Mock failure') {
    this._failNext = true;
    this._failNextReason = reason;
  }

  async sendMessage(params = {}) {
    if (this._failNext) {
      this._failNext = false;
      const r = this._failNextReason;
      this._failNextReason = null;
      this._setHealth(PROVIDER_STATUS.DEGRADED, r);
      throw new Error(`MockMessagingProvider.sendMessage failed: ${r}`);
    }
    if (!params.to) throw new TypeError('sendMessage: to required');
    if (!params.body) throw new TypeError('sendMessage: body required');

    const msg = makeMessage({
      id: randomUUID(),
      kind: params.kind || MESSAGE_KIND.SMS,
      direction: MESSAGE_DIRECTION.OUTBOUND,
      from: params.from || '+15555550000',
      to: params.to,
      body: params.body,
      status: MESSAGE_STATUS.SENT,
      providerId: this.id,
      tenantId: params.tenantId || null,
      meta: params.meta || {},
    });
    this._sent.push(msg);
    return msg;
  }

  async getMessageStatus(messageId) {
    const m = this._sent.find((x) => x.id === messageId);
    if (!m) return { id: messageId, status: 'unknown' };
    return { id: messageId, status: MESSAGE_STATUS.DELIVERED };
  }

  async checkHealth() {
    this._setHealth(PROVIDER_STATUS.HEALTHY);
    return PROVIDER_STATUS.HEALTHY;
  }

  /**
   * Helper test : simule un inbound message.
   */
  simulateInbound(params = {}) {
    const msg = this._normalizeInbound({
      id: randomUUID(),
      kind: params.kind || MESSAGE_KIND.SMS,
      from: params.from || '+33600000000',
      to: params.to || '+15555550000',
      body: params.body || 'hello',
      tenantId: params.tenantId,
      meta: params.meta,
    });
    this._inbound.push(msg);
    return msg;
  }

  /**
   * Helpers introspection test.
   */
  getSentCount() { return this._sent.length; }
  getInboundCount() { return this._inbound.length; }
  getLastSent() { return this._sent[this._sent.length - 1] || null; }
  reset() {
    this._sent = [];
    this._inbound = [];
    this._failNext = false;
    this._failNextReason = null;
  }
}
