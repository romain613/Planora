// server/shared/providers/types/messageTypes.js
// Shapes normalisées pour messages — provider-agnostic.
// Aucune dépendance Twilio ou autre — pure spec.

import { deepFreeze } from '../../utils/deepFreeze.js';

export const MESSAGE_DIRECTION = Object.freeze({
  OUTBOUND: 'outbound',
  INBOUND: 'inbound',
});

export const MESSAGE_KIND = Object.freeze({
  SMS: 'sms',
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
});

export const MESSAGE_STATUS = Object.freeze({
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  UNDELIVERED: 'undelivered',
  RECEIVED: 'received', // inbound only
});

/**
 * Crée un Message normalized (immutable).
 * @param {object} opts
 * @param {string} opts.id - provider-side id
 * @param {string} opts.kind - MESSAGE_KIND.*
 * @param {string} opts.direction - MESSAGE_DIRECTION.*
 * @param {string} opts.from - E.164 ou email
 * @param {string} opts.to - E.164 ou email
 * @param {string} opts.body - contenu
 * @param {string} opts.status - MESSAGE_STATUS.*
 * @param {string} [opts.providerId] - id du provider qui a traité
 * @param {string} [opts.tenantId]
 * @param {object} [opts.meta] - metadata libre
 * @param {number} [opts.createdAt] - ms
 * @returns {object} deeply-frozen Message
 */
export function makeMessage(opts = {}) {
  if (!opts.kind || !Object.values(MESSAGE_KIND).includes(opts.kind)) {
    throw new TypeError(`makeMessage: invalid kind "${opts.kind}"`);
  }
  if (!opts.direction || !Object.values(MESSAGE_DIRECTION).includes(opts.direction)) {
    throw new TypeError(`makeMessage: invalid direction "${opts.direction}"`);
  }
  return deepFreeze({
    id: opts.id || null,
    kind: opts.kind,
    direction: opts.direction,
    from: opts.from || null,
    to: opts.to || null,
    body: opts.body || '',
    status: opts.status || MESSAGE_STATUS.QUEUED,
    providerId: opts.providerId || null,
    tenantId: opts.tenantId || null,
    meta: opts.meta && typeof opts.meta === 'object' ? { ...opts.meta } : {},
    createdAt: typeof opts.createdAt === 'number' ? opts.createdAt : Date.now(),
  });
}
