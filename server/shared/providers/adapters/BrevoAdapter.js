// server/shared/providers/adapters/BrevoAdapter.js
// WRAP-only adapter Brevo (email transactionnel + SMS).
// AUCUN import du SDK Brevo en Sprint 3.
// Le caller injecte un client opaque.

import { BaseMessagingProvider } from '../core/BaseMessagingProvider.js';
import { CAPABILITIES, PROVIDER_STATUS } from '../types/providerTypes.js';
import { MESSAGE_DIRECTION, MESSAGE_STATUS, MESSAGE_KIND, makeMessage } from '../types/messageTypes.js';

const DEFAULT_CAPABILITIES = [
  CAPABILITIES.EMAIL_OUTBOUND,
  CAPABILITIES.SMS_OUTBOUND,
];

export class BrevoAdapter extends BaseMessagingProvider {
  /**
   * @param {object} opts
   * @param {object} opts.client - { sendEmail(...), sendSms(...) } injecté
   * @param {string} [opts.id='brevo']
   * @param {object} [opts.defaults] - { fromEmail, fromName, fromSms }
   */
  constructor(opts = {}) {
    super({
      ...opts,
      id: opts.id || 'brevo',
      displayName: opts.displayName || 'Brevo',
      capabilities: opts.capabilities || DEFAULT_CAPABILITIES,
    });

    if (!opts.client || typeof opts.client !== 'object') {
      throw new TypeError('BrevoAdapter: opts.client required (injected, never auto-instantiated)');
    }
    this._client = opts.client;
    this._defaults = opts.defaults || {};
    this._setHealth(PROVIDER_STATUS.UNKNOWN);
  }

  async sendMessage(params = {}) {
    if (!params.to) throw new TypeError('BrevoAdapter.sendMessage: to required');
    if (!params.body) throw new TypeError('BrevoAdapter.sendMessage: body required');

    const kind = params.kind || MESSAGE_KIND.EMAIL;
    try {
      let raw;
      if (kind === MESSAGE_KIND.EMAIL) {
        raw = await this._client.sendEmail({
          to: [{ email: params.to }],
          subject: params.subject || '(no subject)',
          htmlContent: params.body,
          sender: {
            email: params.from || this._defaults.fromEmail,
            name: params.fromName || this._defaults.fromName,
          },
        });
      } else if (kind === MESSAGE_KIND.SMS) {
        raw = await this._client.sendSms({
          recipient: params.to,
          content: params.body,
          sender: params.from || this._defaults.fromSms,
        });
      } else {
        throw new Error(`BrevoAdapter: kind "${kind}" not supported`);
      }
      this._setHealth(PROVIDER_STATUS.HEALTHY);
      return makeMessage({
        id: raw.messageId || raw.id || null,
        kind,
        direction: MESSAGE_DIRECTION.OUTBOUND,
        from: params.from || this._defaults.fromEmail || this._defaults.fromSms,
        to: params.to,
        body: params.body,
        status: MESSAGE_STATUS.SENT,
        providerId: this.id,
        tenantId: params.tenantId,
        meta: params.meta,
      });
    } catch (e) {
      this._setHealth(PROVIDER_STATUS.DEGRADED, e.message);
      throw e;
    }
  }

  async getMessageStatus(messageId) {
    if (typeof this._client.getMessageStatus !== 'function') {
      // Brevo n'expose pas tjs un get status — graceful no-op
      return { id: messageId, status: 'unknown' };
    }
    try {
      const raw = await this._client.getMessageStatus(messageId);
      return { id: messageId, status: this._mapStatus(raw.status) };
    } catch (e) {
      this._setHealth(PROVIDER_STATUS.DEGRADED, e.message);
      throw e;
    }
  }

  async checkHealth() {
    if (typeof this._client.ping === 'function') {
      try {
        await this._client.ping();
        this._setHealth(PROVIDER_STATUS.HEALTHY);
        return PROVIDER_STATUS.HEALTHY;
      } catch (e) {
        this._setHealth(PROVIDER_STATUS.DOWN, e.message);
        return PROVIDER_STATUS.DOWN;
      }
    }
    return this._status;
  }

  _mapStatus(brevoStatus) {
    const map = {
      delivered: MESSAGE_STATUS.DELIVERED,
      sent: MESSAGE_STATUS.SENT,
      processed: MESSAGE_STATUS.QUEUED,
      bounce: MESSAGE_STATUS.UNDELIVERED,
      hard_bounce: MESSAGE_STATUS.FAILED,
      soft_bounce: MESSAGE_STATUS.FAILED,
      blocked: MESSAGE_STATUS.FAILED,
    };
    return map[String(brevoStatus).toLowerCase()] || MESSAGE_STATUS.QUEUED;
  }
}
