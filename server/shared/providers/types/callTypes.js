// server/shared/providers/types/callTypes.js
// Shapes normalisées appels + CDR — provider-agnostic.

import { deepFreeze } from '../../utils/deepFreeze.js';

export const CALL_DIRECTION = Object.freeze({
  OUTBOUND: 'outbound',
  INBOUND: 'inbound',
  INTERNAL: 'internal',
});

export const CALL_STATUS = Object.freeze({
  QUEUED: 'queued',
  RINGING: 'ringing',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  BUSY: 'busy',
  NO_ANSWER: 'no-answer',
  CANCELED: 'canceled',
  FAILED: 'failed',
});

export const CALL_ENDED_REASON = Object.freeze({
  HANGUP_LOCAL: 'hangup.local',
  HANGUP_REMOTE: 'hangup.remote',
  TIMEOUT: 'timeout',
  REJECTED: 'rejected',
  ERROR: 'error',
});

/**
 * Crée un CallSession normalized (immutable).
 */
export function makeCall(opts = {}) {
  if (!opts.direction || !Object.values(CALL_DIRECTION).includes(opts.direction)) {
    throw new TypeError(`makeCall: invalid direction "${opts.direction}"`);
  }
  return deepFreeze({
    id: opts.id || null,
    direction: opts.direction,
    from: opts.from || null,
    to: opts.to || null,
    status: opts.status || CALL_STATUS.QUEUED,
    providerId: opts.providerId || null,
    tenantId: opts.tenantId || null,
    startedAt: typeof opts.startedAt === 'number' ? opts.startedAt : null,
    answeredAt: typeof opts.answeredAt === 'number' ? opts.answeredAt : null,
    endedAt: typeof opts.endedAt === 'number' ? opts.endedAt : null,
    endedReason: opts.endedReason || null,
    durationSec: typeof opts.durationSec === 'number' ? opts.durationSec : 0,
    recordingUrl: opts.recordingUrl || null,
    transcriptUrl: opts.transcriptUrl || null,
    meta: opts.meta && typeof opts.meta === 'object' ? { ...opts.meta } : {},
  });
}

/**
 * Crée un CDR (Call Detail Record) — pour billing/audit downstream.
 * Forme stable, indépendante du provider.
 */
export function makeCdr(opts = {}) {
  if (!opts.callId) throw new TypeError('makeCdr: callId required');
  return deepFreeze({
    cdrId: opts.cdrId || null,
    callId: opts.callId,
    providerId: opts.providerId || null,
    tenantId: opts.tenantId || null,
    direction: opts.direction || null,
    from: opts.from || null,
    to: opts.to || null,
    fromCountry: opts.fromCountry || null,
    toCountry: opts.toCountry || null,
    startedAt: typeof opts.startedAt === 'number' ? opts.startedAt : null,
    answeredAt: typeof opts.answeredAt === 'number' ? opts.answeredAt : null,
    endedAt: typeof opts.endedAt === 'number' ? opts.endedAt : null,
    billableSec: typeof opts.billableSec === 'number' ? opts.billableSec : 0,
    ratedCost: typeof opts.ratedCost === 'number' ? opts.ratedCost : null, // en centimes/cents
    currency: opts.currency || null,
    meta: opts.meta && typeof opts.meta === 'object' ? { ...opts.meta } : {},
  });
}
