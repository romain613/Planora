// server/shared/providers/mocks/MockVoiceProvider.js
// Mock voice provider — tests appels.

import { BaseVoiceProvider } from '../core/BaseVoiceProvider.js';
import { CAPABILITIES, PROVIDER_STATUS } from '../types/providerTypes.js';
import { CALL_DIRECTION, CALL_STATUS, CALL_ENDED_REASON, makeCall } from '../types/callTypes.js';
import { randomUUID } from 'node:crypto';

export class MockVoiceProvider extends BaseVoiceProvider {
  constructor(opts = {}) {
    super({
      capabilities: [
        CAPABILITIES.VOICE_OUTBOUND,
        CAPABILITIES.VOICE_INBOUND,
        CAPABILITIES.VOICE_RECORDING,
      ],
      ...opts,
      id: opts.id || 'mock-voice',
      displayName: opts.displayName || 'Mock Voice',
    });
    this._calls = new Map(); // id → CallSession
    this._failNext = false;
    this._setHealth(PROVIDER_STATUS.HEALTHY);
  }

  failNext(reason = 'Mock voice failure') {
    this._failNext = true;
    this._failNextReason = reason;
  }

  async initiateCall(params = {}) {
    if (this._failNext) {
      this._failNext = false;
      const r = this._failNextReason || 'Mock failure';
      this._failNextReason = null;
      throw new Error(`MockVoiceProvider.initiateCall failed: ${r}`);
    }
    if (!params.to) throw new TypeError('initiateCall: to required');

    const call = makeCall({
      id: randomUUID(),
      direction: CALL_DIRECTION.OUTBOUND,
      from: params.from || '+15555550000',
      to: params.to,
      status: CALL_STATUS.QUEUED,
      providerId: this.id,
      tenantId: params.tenantId || null,
      startedAt: Date.now(),
      meta: params.meta || {},
    });
    this._calls.set(call.id, call);
    return call;
  }

  async hangupCall(callId) {
    const c = this._calls.get(callId);
    if (!c) throw new Error(`MockVoiceProvider.hangupCall: unknown callId ${callId}`);
    const ended = makeCall({
      ...c,
      status: CALL_STATUS.COMPLETED,
      endedAt: Date.now(),
      endedReason: CALL_ENDED_REASON.HANGUP_LOCAL,
      durationSec: c.startedAt ? Math.max(0, (Date.now() - c.startedAt) / 1000) : 0,
    });
    this._calls.set(callId, ended);
    return ended;
  }

  async getCallStatus(callId) {
    const c = this._calls.get(callId);
    if (!c) return { id: callId, status: 'unknown' };
    return { id: callId, status: c.status };
  }

  async getCdr(callId) {
    const c = this._calls.get(callId);
    if (!c) return null;
    return this._buildCdr({
      cdrId: randomUUID(),
      callId,
      direction: c.direction,
      from: c.from,
      to: c.to,
      startedAt: c.startedAt,
      endedAt: c.endedAt,
      billableSec: c.durationSec || 0,
      ratedCost: 0,
      currency: 'EUR',
      tenantId: c.tenantId,
    });
  }

  async checkHealth() {
    this._setHealth(PROVIDER_STATUS.HEALTHY);
    return PROVIDER_STATUS.HEALTHY;
  }

  // Helpers test
  getCallsCount() { return this._calls.size; }
  reset() {
    this._calls.clear();
    this._failNext = false;
    this._failNextReason = null;
  }
}
