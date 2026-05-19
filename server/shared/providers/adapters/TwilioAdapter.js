// server/shared/providers/adapters/TwilioAdapter.js
// WRAP-only adapter Twilio — AUCUN import du package `twilio` npm.
// AUCUNE connexion runtime live Twilio (legacy reste seul à parler à Twilio prod).
//
// Le caller fournit un `client` opaque qui expose l'API Twilio attendue.
// En Phase 1 : aucune instanciation runtime. Sprint 3 = STRUCTURE + interface uniquement.
// En tests : injecter un fake client (cf. test/adapters.test.js).
//
// Phase 4+ (BRIDGE) : le caller pourra injecter le SDK Twilio réel via
// new TwilioAdapter({ client: require('twilio')(sid, token), ... })

import { BaseProvider } from '../core/BaseProvider.js';
import { PROVIDER_TYPES, CAPABILITIES, PROVIDER_STATUS } from '../types/providerTypes.js';
import { MESSAGE_DIRECTION, MESSAGE_STATUS, MESSAGE_KIND, makeMessage } from '../types/messageTypes.js';
import { CALL_DIRECTION, CALL_STATUS, makeCall } from '../types/callTypes.js';

const DEFAULT_CAPABILITIES = [
  CAPABILITIES.SMS_OUTBOUND,
  CAPABILITIES.SMS_INBOUND,
  CAPABILITIES.SMS_DLR,
  CAPABILITIES.VOICE_OUTBOUND,
  CAPABILITIES.VOICE_INBOUND,
  CAPABILITIES.VOICE_RECORDING,
  CAPABILITIES.NUMBER_PROVISION,
];

export class TwilioAdapter extends BaseProvider {
  /**
   * @param {object} opts
   * @param {object} opts.client - client Twilio injecté (peut être fake en test)
   * @param {string} [opts.id='twilio']
   * @param {string} [opts.fromNumber] - numéro Twilio par défaut
   * @param {string[]} [opts.capabilities] - subset à activer
   */
  constructor(opts = {}) {
    super({
      ...opts,
      id: opts.id || 'twilio',
      type: PROVIDER_TYPES.COMPOSITE,
      displayName: opts.displayName || 'Twilio',
      capabilities: opts.capabilities || DEFAULT_CAPABILITIES,
    });

    if (!opts.client || typeof opts.client !== 'object') {
      throw new TypeError('TwilioAdapter: opts.client required (injected, never auto-instantiated)');
    }
    this._client = opts.client;
    this._fromNumber = opts.fromNumber || null;
    this._setHealth(PROVIDER_STATUS.UNKNOWN);
  }

  /**
   * Envoie SMS via le client Twilio injecté.
   */
  async sendMessage(params = {}) {
    if (!params.to) throw new TypeError('TwilioAdapter.sendMessage: to required');
    if (!params.body) throw new TypeError('TwilioAdapter.sendMessage: body required');

    const from = params.from || this._fromNumber;
    if (!from) throw new Error('TwilioAdapter.sendMessage: from required (or set fromNumber)');

    try {
      const raw = await this._client.messages.create({
        from,
        to: params.to,
        body: params.body,
      });
      this._setHealth(PROVIDER_STATUS.HEALTHY);
      return this._normalizeOutboundMessage(raw, { tenantId: params.tenantId, meta: params.meta });
    } catch (e) {
      this._setHealth(PROVIDER_STATUS.DEGRADED, e.message);
      throw e;
    }
  }

  /**
   * Récupère status d'un message envoyé.
   */
  async getMessageStatus(messageId) {
    try {
      const raw = await this._client.messages(messageId).fetch();
      return { id: messageId, status: this._mapMessageStatus(raw.status) };
    } catch (e) {
      this._setHealth(PROVIDER_STATUS.DEGRADED, e.message);
      throw e;
    }
  }

  /**
   * Initie appel via le client Twilio.
   */
  async initiateCall(params = {}) {
    if (!params.to) throw new TypeError('TwilioAdapter.initiateCall: to required');
    if (!params.url) throw new TypeError('TwilioAdapter.initiateCall: url (TwiML) required');

    const from = params.from || this._fromNumber;
    if (!from) throw new Error('TwilioAdapter.initiateCall: from required');

    try {
      const raw = await this._client.calls.create({
        from,
        to: params.to,
        url: params.url,
        statusCallback: params.statusCallback,
      });
      this._setHealth(PROVIDER_STATUS.HEALTHY);
      return this._normalizeOutboundCall(raw, { tenantId: params.tenantId, meta: params.meta });
    } catch (e) {
      this._setHealth(PROVIDER_STATUS.DEGRADED, e.message);
      throw e;
    }
  }

  async checkHealth() {
    try {
      // Twilio API : pas d'endpoint health dédié. On utilise un ping léger.
      // Note : adapter peut ne pas exposer .api.v2010 si fake client → on tolère.
      if (this._client.api && this._client.api.v2010 && typeof this._client.api.v2010.fetch === 'function') {
        await this._client.api.v2010.fetch();
      }
      this._setHealth(PROVIDER_STATUS.HEALTHY);
      return PROVIDER_STATUS.HEALTHY;
    } catch (e) {
      this._setHealth(PROVIDER_STATUS.DOWN, e.message);
      return PROVIDER_STATUS.DOWN;
    }
  }

  /**
   * Normalise un payload SMS sortant Twilio.
   */
  _normalizeOutboundMessage(raw, extra = {}) {
    return makeMessage({
      id: raw.sid || raw.id || null,
      kind: MESSAGE_KIND.SMS,
      direction: MESSAGE_DIRECTION.OUTBOUND,
      from: raw.from,
      to: raw.to,
      body: raw.body,
      status: this._mapMessageStatus(raw.status),
      providerId: this.id,
      tenantId: extra.tenantId,
      meta: extra.meta,
    });
  }

  /**
   * Normalise un payload Call sortant Twilio.
   */
  _normalizeOutboundCall(raw, extra = {}) {
    return makeCall({
      id: raw.sid || raw.id || null,
      direction: CALL_DIRECTION.OUTBOUND,
      from: raw.from,
      to: raw.to,
      status: this._mapCallStatus(raw.status),
      providerId: this.id,
      tenantId: extra.tenantId,
      meta: extra.meta,
    });
  }

  /**
   * Mappe statuts Twilio → MESSAGE_STATUS canonique.
   */
  _mapMessageStatus(twilioStatus) {
    const map = {
      queued: MESSAGE_STATUS.QUEUED,
      sending: MESSAGE_STATUS.QUEUED,
      sent: MESSAGE_STATUS.SENT,
      delivered: MESSAGE_STATUS.DELIVERED,
      undelivered: MESSAGE_STATUS.UNDELIVERED,
      failed: MESSAGE_STATUS.FAILED,
      received: MESSAGE_STATUS.RECEIVED,
    };
    return map[String(twilioStatus).toLowerCase()] || MESSAGE_STATUS.QUEUED;
  }

  /**
   * Mappe statuts Twilio → CALL_STATUS.
   */
  _mapCallStatus(twilioStatus) {
    const map = {
      queued: CALL_STATUS.QUEUED,
      ringing: CALL_STATUS.RINGING,
      'in-progress': CALL_STATUS.IN_PROGRESS,
      completed: CALL_STATUS.COMPLETED,
      busy: CALL_STATUS.BUSY,
      'no-answer': CALL_STATUS.NO_ANSWER,
      canceled: CALL_STATUS.CANCELED,
      failed: CALL_STATUS.FAILED,
    };
    return map[String(twilioStatus).toLowerCase()] || CALL_STATUS.QUEUED;
  }
}
