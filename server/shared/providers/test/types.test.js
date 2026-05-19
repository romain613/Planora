// server/shared/providers/test/types.test.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROVIDER_TYPES, CAPABILITIES, PROVIDER_STATUS, TENANT_OWNERSHIP,
  isCapability, isProviderType,
} from '../types/providerTypes.js';

import { MESSAGE_KIND, MESSAGE_DIRECTION, MESSAGE_STATUS, makeMessage } from '../types/messageTypes.js';
import { CALL_DIRECTION, CALL_STATUS, CALL_ENDED_REASON, makeCall, makeCdr } from '../types/callTypes.js';
import { NUMBER_TYPE, NUMBER_STATUS, makePhoneNumber } from '../types/numberTypes.js';

describe('types/providerTypes', () => {
  test('PROVIDER_TYPES gelé', () => {
    assert.equal(Object.isFrozen(PROVIDER_TYPES), true);
    assert.equal(PROVIDER_TYPES.MESSAGING, 'messaging');
    assert.equal(PROVIDER_TYPES.VOICE, 'voice');
  });

  test('CAPABILITIES gelé + complet', () => {
    assert.equal(Object.isFrozen(CAPABILITIES), true);
    assert.equal(CAPABILITIES.SMS_OUTBOUND, 'sms.outbound');
    assert.equal(CAPABILITIES.VOICE_INBOUND, 'voice.inbound');
  });

  test('PROVIDER_STATUS gelé', () => {
    assert.equal(Object.isFrozen(PROVIDER_STATUS), true);
    assert.equal(PROVIDER_STATUS.HEALTHY, 'healthy');
  });

  test('TENANT_OWNERSHIP gelé', () => {
    assert.equal(Object.isFrozen(TENANT_OWNERSHIP), true);
  });

  test('isCapability détecte cap connue', () => {
    assert.equal(isCapability('sms.outbound'), true);
    assert.equal(isCapability('voice.inbound'), true);
    assert.equal(isCapability('bogus'), false);
    assert.equal(isCapability(null), false);
    assert.equal(isCapability(123), false);
  });

  test('isProviderType détecte type connu', () => {
    assert.equal(isProviderType('messaging'), true);
    assert.equal(isProviderType('composite'), true);
    assert.equal(isProviderType('bogus'), false);
  });
});

describe('types/messageTypes', () => {
  test('makeMessage crée message immutable', () => {
    const m = makeMessage({
      kind: MESSAGE_KIND.SMS,
      direction: MESSAGE_DIRECTION.OUTBOUND,
      to: '+33600000000',
      body: 'hello',
    });
    assert.equal(Object.isFrozen(m), true);
    assert.equal(m.kind, 'sms');
    assert.equal(m.direction, 'outbound');
    assert.equal(m.status, MESSAGE_STATUS.QUEUED);
    assert.ok(typeof m.createdAt === 'number');
  });

  test('makeMessage rejette kind invalide', () => {
    assert.throws(() => makeMessage({ kind: 'bogus', direction: 'outbound' }), /invalid kind/);
  });

  test('makeMessage rejette direction invalide', () => {
    assert.throws(() => makeMessage({ kind: 'sms', direction: 'sideways' }), /invalid direction/);
  });

  test('MESSAGE_STATUS gelé + complet', () => {
    assert.equal(Object.isFrozen(MESSAGE_STATUS), true);
    assert.equal(MESSAGE_STATUS.DELIVERED, 'delivered');
    assert.equal(MESSAGE_STATUS.FAILED, 'failed');
  });
});

describe('types/callTypes', () => {
  test('makeCall crée call immutable', () => {
    const c = makeCall({
      direction: CALL_DIRECTION.OUTBOUND,
      from: '+15555550000',
      to: '+33600000000',
    });
    assert.equal(Object.isFrozen(c), true);
    assert.equal(c.direction, 'outbound');
    assert.equal(c.status, CALL_STATUS.QUEUED);
  });

  test('makeCall rejette direction invalide', () => {
    assert.throws(() => makeCall({ direction: 'sideways' }), /invalid direction/);
  });

  test('makeCdr crée CDR immutable', () => {
    const cdr = makeCdr({ callId: 'call-1', billableSec: 42 });
    assert.equal(Object.isFrozen(cdr), true);
    assert.equal(cdr.callId, 'call-1');
    assert.equal(cdr.billableSec, 42);
  });

  test('makeCdr rejette si callId manquant', () => {
    assert.throws(() => makeCdr({}), /callId required/);
  });

  test('CALL_STATUS + CALL_ENDED_REASON gelés', () => {
    assert.equal(Object.isFrozen(CALL_STATUS), true);
    assert.equal(Object.isFrozen(CALL_ENDED_REASON), true);
  });
});

describe('types/numberTypes', () => {
  test('makePhoneNumber immutable + defaults', () => {
    const n = makePhoneNumber({ e164: '+33123456789' });
    assert.equal(Object.isFrozen(n), true);
    assert.equal(n.e164, '+33123456789');
    assert.equal(n.numberType, NUMBER_TYPE.LOCAL);
    assert.equal(n.status, NUMBER_STATUS.AVAILABLE);
  });

  test('makePhoneNumber rejette si e164 manquant', () => {
    assert.throws(() => makePhoneNumber({}), /e164 required/);
  });

  test('NUMBER_TYPE + NUMBER_STATUS gelés', () => {
    assert.equal(Object.isFrozen(NUMBER_TYPE), true);
    assert.equal(Object.isFrozen(NUMBER_STATUS), true);
    assert.equal(NUMBER_TYPE.TOLL_FREE, 'toll-free');
  });
});
