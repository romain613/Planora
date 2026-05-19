// server/shared/providers/test/providers.test.js
// Tests core abstracts + mocks (comportement provider de base).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { BaseProvider } from '../core/BaseProvider.js';
import { BaseMessagingProvider } from '../core/BaseMessagingProvider.js';
import { BaseVoiceProvider } from '../core/BaseVoiceProvider.js';
import { BaseNumberProvider } from '../core/BaseNumberProvider.js';

import { MockProvider } from '../mocks/MockProvider.js';
import { MockMessagingProvider } from '../mocks/MockMessagingProvider.js';
import { MockVoiceProvider } from '../mocks/MockVoiceProvider.js';

import { CAPABILITIES, PROVIDER_STATUS, PROVIDER_TYPES, TENANT_OWNERSHIP } from '../types/providerTypes.js';

describe('BaseProvider (abstract)', () => {
  test('throws si instancié directement', () => {
    assert.throws(
      () => new BaseProvider({ id: 'x', type: 'composite', capabilities: [] }),
      /abstract/
    );
  });

  test('valide id required (via sous-classe minimale sans fallback)', () => {
    // MockProvider fait opts.id || 'mock-provider' → on utilise une sous-classe sans fallback
    class StrictProvider extends BaseProvider {
      constructor(opts) { super(opts); }
    }
    assert.throws(
      () => new StrictProvider({ id: '', type: 'composite', capabilities: [] }),
      /id required/
    );
    assert.throws(
      () => new StrictProvider({ type: 'composite', capabilities: [] }),
      /id required/
    );
  });

  test('valide capabilities array', () => {
    assert.throws(
      () => new MockProvider({ id: 'x', capabilities: 'notarr' }),
      /capabilities required array/
    );
  });

  test('valide capability dans liste connue', () => {
    assert.throws(
      () => new MockProvider({ id: 'x', capabilities: ['bogus.cap'] }),
      /invalid capability/
    );
  });

  test('supports() détecte capability', () => {
    const p = new MockProvider({ id: 'x', capabilities: [CAPABILITIES.SMS_OUTBOUND] });
    assert.equal(p.supports(CAPABILITIES.SMS_OUTBOUND), true);
    assert.equal(p.supports(CAPABILITIES.VOICE_INBOUND), false);
  });

  test('defaults priority 100 + ownership PLATFORM', () => {
    const p = new MockProvider({ id: 'x', capabilities: [] });
    assert.equal(p.priority, 100);
    assert.equal(p.ownership, TENANT_OWNERSHIP.PLATFORM);
  });

  test('priority override + ownership override', () => {
    const p = new MockProvider({
      id: 'x', capabilities: [], priority: 5, ownership: TENANT_OWNERSHIP.SUPRO, suproId: 's1',
    });
    assert.equal(p.priority, 5);
    assert.equal(p.ownership, 'supro');
    assert.equal(p.suproId, 's1');
  });

  test('getHealth + _setHealth fonctionnels', () => {
    const p = new MockProvider({ id: 'x', capabilities: [] });
    const h0 = p.getHealth();
    assert.equal(h0.status, PROVIDER_STATUS.HEALTHY);
    p._setHealth(PROVIDER_STATUS.DEGRADED, 'mock issue');
    const h1 = p.getHealth();
    assert.equal(h1.status, 'degraded');
    assert.equal(h1.lastError, 'mock issue');
    assert.ok(typeof h1.lastCheckedAt === 'number');
  });

  test('_setHealth rejette status invalide', () => {
    const p = new MockProvider({ id: 'x', capabilities: [] });
    assert.throws(() => p._setHealth('bogus'), /invalid status/);
  });

  test('toSummary expose champs publics + masque config', () => {
    const p = new MockProvider({
      id: 'x',
      capabilities: [CAPABILITIES.SMS_OUTBOUND],
      config: { secret: 'do-not-leak' },
    });
    const s = p.toSummary();
    assert.equal(s.id, 'x');
    assert.deepEqual(s.capabilities, ['sms.outbound']);
    assert.ok(!('config' in s), 'config not exposed');
    assert.ok(!('_client' in s));
  });
});

describe('BaseMessagingProvider abstract methods', () => {
  test('sendMessage throws si pas override', async () => {
    class P extends BaseMessagingProvider {
      async checkHealth() { return PROVIDER_STATUS.HEALTHY; }
    }
    const p = new P({ id: 'x', capabilities: [CAPABILITIES.SMS_OUTBOUND] });
    await assert.rejects(() => p.sendMessage({ to: 'x', body: 'y' }), /not implemented/);
  });

  test('getMessageStatus throws si pas override', async () => {
    class P extends BaseMessagingProvider {
      async checkHealth() { return PROVIDER_STATUS.HEALTHY; }
    }
    const p = new P({ id: 'x', capabilities: [CAPABILITIES.SMS_OUTBOUND] });
    await assert.rejects(() => p.getMessageStatus('id'), /not implemented/);
  });

  test('_normalizeInbound retourne Message frozen', () => {
    class P extends BaseMessagingProvider {
      async checkHealth() { return PROVIDER_STATUS.HEALTHY; }
    }
    const p = new P({ id: 'mp', capabilities: [CAPABILITIES.SMS_INBOUND] });
    const m = p._normalizeInbound({ id: 'm1', from: '+1', to: '+2', body: 'hi' });
    assert.equal(Object.isFrozen(m), true);
    assert.equal(m.direction, 'inbound');
    assert.equal(m.providerId, 'mp');
  });
});

describe('BaseVoiceProvider abstract methods', () => {
  test('initiateCall throws si pas override', async () => {
    class P extends BaseVoiceProvider {
      async checkHealth() { return PROVIDER_STATUS.HEALTHY; }
    }
    const p = new P({ id: 'v', capabilities: [CAPABILITIES.VOICE_OUTBOUND] });
    await assert.rejects(() => p.initiateCall({ to: '+1' }), /not implemented/);
  });

  test('hangupCall + getCallStatus + getCdr throws si pas override', async () => {
    class P extends BaseVoiceProvider {
      async checkHealth() { return PROVIDER_STATUS.HEALTHY; }
    }
    const p = new P({ id: 'v', capabilities: [CAPABILITIES.VOICE_OUTBOUND] });
    await assert.rejects(() => p.hangupCall('x'), /not implemented/);
    await assert.rejects(() => p.getCallStatus('x'), /not implemented/);
    await assert.rejects(() => p.getCdr('x'), /not implemented/);
  });
});

describe('BaseNumberProvider abstract methods', () => {
  test('searchAvailable + provisionNumber + releaseNumber throws', async () => {
    class P extends BaseNumberProvider {
      async checkHealth() { return PROVIDER_STATUS.HEALTHY; }
    }
    const p = new P({ id: 'n', capabilities: [CAPABILITIES.NUMBER_PROVISION] });
    await assert.rejects(() => p.searchAvailable({}), /not implemented/);
    await assert.rejects(() => p.provisionNumber({}), /not implemented/);
    await assert.rejects(() => p.releaseNumber('x'), /not implemented/);
  });
});

describe('MockMessagingProvider', () => {
  test('sendMessage retourne message normalized', async () => {
    const p = new MockMessagingProvider();
    const m = await p.sendMessage({ to: '+33600000000', body: 'hello' });
    assert.ok(m.id);
    assert.equal(m.direction, 'outbound');
    assert.equal(m.body, 'hello');
    assert.equal(m.providerId, 'mock-messaging');
    assert.equal(p.getSentCount(), 1);
  });

  test('sendMessage rejette si to/body manquants', async () => {
    const p = new MockMessagingProvider();
    await assert.rejects(() => p.sendMessage({}), /to required/);
    await assert.rejects(() => p.sendMessage({ to: 'x' }), /body required/);
  });

  test('failNext force erreur sur prochain send', async () => {
    const p = new MockMessagingProvider();
    p.failNext('test fail');
    await assert.rejects(() => p.sendMessage({ to: '+1', body: 'x' }), /test fail/);
    // Suivant doit réussir
    const m = await p.sendMessage({ to: '+1', body: 'ok' });
    assert.ok(m.id);
  });

  test('simulateInbound stocke + retourne Message', () => {
    const p = new MockMessagingProvider();
    const m = p.simulateInbound({ body: 'hello in' });
    assert.equal(m.direction, 'inbound');
    assert.equal(p.getInboundCount(), 1);
  });

  test('reset() clear state', async () => {
    const p = new MockMessagingProvider();
    await p.sendMessage({ to: '+1', body: 'x' });
    p.simulateInbound({});
    p.reset();
    assert.equal(p.getSentCount(), 0);
    assert.equal(p.getInboundCount(), 0);
  });

  test('checkHealth → HEALTHY', async () => {
    const p = new MockMessagingProvider();
    assert.equal(await p.checkHealth(), 'healthy');
  });

  test('getMessageStatus retourne delivered', async () => {
    const p = new MockMessagingProvider();
    const m = await p.sendMessage({ to: '+1', body: 'x' });
    const s = await p.getMessageStatus(m.id);
    assert.equal(s.status, 'delivered');
  });
});

describe('MockVoiceProvider', () => {
  test('initiateCall retourne call queued', async () => {
    const p = new MockVoiceProvider();
    const c = await p.initiateCall({ to: '+33600000000' });
    assert.equal(c.direction, 'outbound');
    assert.equal(c.status, 'queued');
    assert.ok(c.startedAt);
    assert.equal(p.getCallsCount(), 1);
  });

  test('hangupCall complète + génère CDR', async () => {
    const p = new MockVoiceProvider();
    const c = await p.initiateCall({ to: '+1' });
    const ended = await p.hangupCall(c.id);
    assert.equal(ended.status, 'completed');
    assert.ok(ended.endedAt);
    const cdr = await p.getCdr(c.id);
    assert.equal(cdr.callId, c.id);
    assert.equal(cdr.currency, 'EUR');
  });

  test('hangupCall rejette unknown id', async () => {
    const p = new MockVoiceProvider();
    await assert.rejects(() => p.hangupCall('nope'), /unknown callId/);
  });

  test('failNext fonctionne', async () => {
    const p = new MockVoiceProvider();
    p.failNext('voice fail');
    await assert.rejects(() => p.initiateCall({ to: '+1' }), /voice fail/);
  });

  test('reset() clear state', async () => {
    const p = new MockVoiceProvider();
    await p.initiateCall({ to: '+1' });
    p.reset();
    assert.equal(p.getCallsCount(), 0);
  });
});

describe('MockProvider générique', () => {
  test('setStatus permet de simuler degraded/down pour tests', () => {
    const p = new MockProvider({ id: 'x', capabilities: [] });
    p.setStatus(PROVIDER_STATUS.DOWN);
    assert.equal(p.getHealth().status, 'down');
  });

  test('checkHealth retourne status courant', async () => {
    const p = new MockProvider({ id: 'x', capabilities: [], initialStatus: PROVIDER_STATUS.DEGRADED });
    assert.equal(await p.checkHealth(), 'degraded');
  });
});
