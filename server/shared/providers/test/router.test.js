// server/shared/providers/test/router.test.js
// Tests ProviderRouter + CostRouter + estimateCost.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ProviderRegistry } from '../registry/providerRegistry.js';
import { ProviderRouter } from '../router/providerRouter.js';
import { CostRouter, estimateCost } from '../router/costRouter.js';
import { MockMessagingProvider } from '../mocks/MockMessagingProvider.js';
import { MockVoiceProvider } from '../mocks/MockVoiceProvider.js';
import { MockProvider } from '../mocks/MockProvider.js';
import { CAPABILITIES, TENANT_OWNERSHIP } from '../types/providerTypes.js';

describe('ProviderRouter', () => {
  test('select retourne le 1er candidat', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'a', priority: 10 }));
    r.register(new MockMessagingProvider({ id: 'b', priority: 50 }));
    const router = new ProviderRouter(r);
    const sel = router.select({ capability: CAPABILITIES.SMS_OUTBOUND });
    assert.equal(sel.id, 'a');
  });

  test('select retourne null si aucun candidat', () => {
    const r = new ProviderRegistry();
    const router = new ProviderRouter(r);
    assert.equal(router.select({ capability: CAPABILITIES.SMS_OUTBOUND }), null);
  });

  test('candidates retourne liste triée', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'a', priority: 50 }));
    r.register(new MockMessagingProvider({ id: 'b', priority: 10 }));
    const router = new ProviderRouter(r);
    const cs = router.candidates({ capability: CAPABILITIES.SMS_OUTBOUND });
    assert.equal(cs.length, 2);
    assert.equal(cs[0].id, 'b');
  });

  test('constructeur rejette sans registry', () => {
    assert.throws(() => new ProviderRouter(), /registry required/);
  });
});

describe('estimateCost', () => {
  test('null si pas de costProfile', () => {
    const p = new MockMessagingProvider({ id: 'p' });
    assert.equal(estimateCost(p, { kind: 'sms' }), null);
  });

  test('sms : cents direct', () => {
    const p = new MockMessagingProvider({
      id: 'p',
      costProfile: { sms: { cents: 3, currency: 'EUR' } },
    });
    assert.equal(estimateCost(p, { kind: 'sms' }), 3);
  });

  test('voice : centsPerMin × durationMin', () => {
    const p = new MockVoiceProvider({
      id: 'p',
      costProfile: { voice: { centsPerMin: 2, currency: 'EUR' } },
    });
    assert.equal(estimateCost(p, { kind: 'voice', durationMin: 5 }), 10);
  });

  test('voice : 1 min par défaut si durationMin absent', () => {
    const p = new MockVoiceProvider({
      id: 'p',
      costProfile: { voice: { centsPerMin: 7 } },
    });
    assert.equal(estimateCost(p, { kind: 'voice' }), 7);
  });

  test('null si kind inconnu', () => {
    const p = new MockMessagingProvider({
      id: 'p', costProfile: { sms: { cents: 3 } },
    });
    assert.equal(estimateCost(p, { kind: 'bogus' }), null);
  });

  test('null si provider null', () => {
    assert.equal(estimateCost(null, { kind: 'sms' }), null);
  });
});

describe('CostRouter', () => {
  test('selectCheapest retourne min-cost', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({
      id: 'cheap', costProfile: { sms: { cents: 2 } },
    }));
    r.register(new MockMessagingProvider({
      id: 'mid', costProfile: { sms: { cents: 5 } },
    }));
    r.register(new MockMessagingProvider({
      id: 'expensive', costProfile: { sms: { cents: 10 } },
    }));
    const router = new CostRouter(r);
    const sel = router.selectCheapest({
      capability: CAPABILITIES.SMS_OUTBOUND,
      operation: { kind: 'sms' },
    });
    assert.equal(sel.id, 'cheap');
  });

  test('selectCheapest : sans costProfile en fallback', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'no-cost' })); // pas de costProfile
    r.register(new MockMessagingProvider({
      id: 'cheap', costProfile: { sms: { cents: 1 } },
    }));
    const router = new CostRouter(r);
    const sel = router.selectCheapest({
      capability: CAPABILITIES.SMS_OUTBOUND,
      operation: { kind: 'sms' },
    });
    assert.equal(sel.id, 'cheap', 'priorise celui avec cost défini');
  });

  test('selectCheapest null si pas de candidat', () => {
    const r = new ProviderRegistry();
    const router = new CostRouter(r);
    assert.equal(router.selectCheapest({
      capability: CAPABILITIES.SMS_OUTBOUND,
      operation: { kind: 'sms' },
    }), null);
  });

  test('rank retourne tous les candidats avec coût attaché', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({
      id: 'a', costProfile: { sms: { cents: 5 } },
    }));
    r.register(new MockMessagingProvider({ id: 'b' }));
    const router = new CostRouter(r);
    const ranked = router.rank({
      capability: CAPABILITIES.SMS_OUTBOUND,
      operation: { kind: 'sms' },
    });
    assert.equal(ranked.length, 2);
    const a = ranked.find((x) => x.providerId === 'a');
    const b = ranked.find((x) => x.providerId === 'b');
    assert.equal(a.cost, 5);
    assert.equal(b.cost, null);
  });

  test('constructeur rejette sans registry', () => {
    assert.throws(() => new CostRouter(), /registry required/);
  });
});
