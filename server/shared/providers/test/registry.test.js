// server/shared/providers/test/registry.test.js
// Tests registry + resolver.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ProviderRegistry } from '../registry/providerRegistry.js';
import { resolveProviders } from '../registry/providerResolver.js';
import { MockMessagingProvider } from '../mocks/MockMessagingProvider.js';
import { MockProvider } from '../mocks/MockProvider.js';
import { CAPABILITIES, PROVIDER_STATUS, TENANT_OWNERSHIP } from '../types/providerTypes.js';

describe('ProviderRegistry', () => {
  test('register + get + has', () => {
    const r = new ProviderRegistry();
    const p = new MockMessagingProvider({ id: 'm1' });
    r.register(p);
    assert.equal(r.has('m1'), true);
    assert.equal(r.get('m1'), p);
    assert.equal(r.get('nope'), null);
    assert.equal(r.size(), 1);
  });

  test('register rejette non-BaseProvider', () => {
    const r = new ProviderRegistry();
    assert.throws(() => r.register({}), /must extend BaseProvider/);
  });

  test('register rejette duplicate id', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'dup' }));
    assert.throws(
      () => r.register(new MockMessagingProvider({ id: 'dup' })),
      /duplicate id/
    );
  });

  test('unregister + clear', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'a' }));
    r.register(new MockMessagingProvider({ id: 'b' }));
    assert.equal(r.unregister('a'), true);
    assert.equal(r.unregister('nope'), false);
    assert.equal(r.size(), 1);
    r.clear();
    assert.equal(r.size(), 0);
  });

  test('list retourne instances', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'a' }));
    r.register(new MockMessagingProvider({ id: 'b' }));
    const l = r.list();
    assert.equal(l.length, 2);
  });

  test('filter par capability', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'sms' })); // SMS_OUTBOUND
    r.register(new MockProvider({ id: 'comp', capabilities: [CAPABILITIES.VOICE_OUTBOUND] }));
    const smsOnly = r.filter({ capability: CAPABILITIES.SMS_OUTBOUND });
    assert.equal(smsOnly.length, 1);
    assert.equal(smsOnly[0].id, 'sms');
  });

  test('filter par type', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'sms' }));
    r.register(new MockProvider({ id: 'comp', capabilities: [] }));
    const msgOnly = r.filter({ type: 'messaging' });
    assert.equal(msgOnly.length, 1);
    assert.equal(msgOnly[0].id, 'sms');
  });

  test('filter par ownership + suproId', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({
      id: 'a', ownership: TENANT_OWNERSHIP.SUPRO, suproId: 's1',
    }));
    r.register(new MockMessagingProvider({
      id: 'b', ownership: TENANT_OWNERSHIP.SUPRO, suproId: 's2',
    }));
    const s1Only = r.filter({ ownership: 'supro', suproId: 's1' });
    assert.equal(s1Only.length, 1);
    assert.equal(s1Only[0].id, 'a');
  });

  test('toSummary retourne meta exposable', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'a' }));
    const sum = r.toSummary();
    assert.equal(sum.length, 1);
    assert.equal(sum[0].id, 'a');
    assert.ok('capabilities' in sum[0]);
  });
});

describe('resolveProviders (hierarchy + tri)', () => {
  test('rejette si capability manquant', () => {
    const r = new ProviderRegistry();
    assert.throws(() => resolveProviders(r, {}), /capability required/);
  });

  test('rejette si registry pas ProviderRegistry', () => {
    assert.throws(() => resolveProviders({}, { capability: 'sms.outbound' }), /must be ProviderRegistry/);
  });

  test('priorise CLIENT > SUPRO > PLATFORM', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'platform-default' }));
    r.register(new MockMessagingProvider({
      id: 'supro-s1', ownership: TENANT_OWNERSHIP.SUPRO, suproId: 's1',
    }));
    r.register(new MockMessagingProvider({
      id: 'client-c1', ownership: TENANT_OWNERSHIP.CLIENT, suproId: 's1', clientId: 'c1',
    }));

    const r1 = resolveProviders(r, {
      capability: CAPABILITIES.SMS_OUTBOUND,
      suproId: 's1',
      clientId: 'c1',
    });
    assert.equal(r1[0].id, 'client-c1', 'CLIENT-owned en 1er');
    assert.equal(r1[1].id, 'supro-s1', 'SUPRO ensuite');
    assert.equal(r1[2].id, 'platform-default', 'PLATFORM en dernier');
  });

  test('filtre CLIENT par suproId+clientId', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({
      id: 'client-c1', ownership: TENANT_OWNERSHIP.CLIENT, suproId: 's1', clientId: 'c1',
    }));
    r.register(new MockMessagingProvider({
      id: 'client-c2', ownership: TENANT_OWNERSHIP.CLIENT, suproId: 's1', clientId: 'c2',
    }));

    const r1 = resolveProviders(r, {
      capability: CAPABILITIES.SMS_OUTBOUND,
      suproId: 's1',
      clientId: 'c1',
    });
    assert.equal(r1.length, 1);
    assert.equal(r1[0].id, 'client-c1');
  });

  test('SUPRO-owned filtré par suproId', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({
      id: 'supro-s1', ownership: TENANT_OWNERSHIP.SUPRO, suproId: 's1',
    }));
    r.register(new MockMessagingProvider({
      id: 'supro-s2', ownership: TENANT_OWNERSHIP.SUPRO, suproId: 's2',
    }));

    const r1 = resolveProviders(r, {
      capability: CAPABILITIES.SMS_OUTBOUND,
      suproId: 's1',
    });
    assert.equal(r1.length, 1);
    assert.equal(r1[0].id, 'supro-s1');
  });

  test('exclut providers DOWN par défaut', () => {
    const r = new ProviderRegistry();
    const p1 = new MockMessagingProvider({ id: 'healthy' });
    const p2 = new MockMessagingProvider({ id: 'down' });
    p2._setHealth(PROVIDER_STATUS.DOWN);
    r.register(p1); r.register(p2);

    const r1 = resolveProviders(r, { capability: CAPABILITIES.SMS_OUTBOUND });
    assert.equal(r1.length, 1);
    assert.equal(r1[0].id, 'healthy');
  });

  test('includeDown=true inclut DOWN', () => {
    const r = new ProviderRegistry();
    const p1 = new MockMessagingProvider({ id: 'healthy' });
    const p2 = new MockMessagingProvider({ id: 'down' });
    p2._setHealth(PROVIDER_STATUS.DOWN);
    r.register(p1); r.register(p2);

    const r1 = resolveProviders(r, { capability: CAPABILITIES.SMS_OUTBOUND, includeDown: true });
    assert.equal(r1.length, 2);
  });

  test('intra-ownership : tri par priority asc', () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'p-low', priority: 50 }));
    r.register(new MockMessagingProvider({ id: 'p-high', priority: 10 })); // priorité supérieure

    const r1 = resolveProviders(r, { capability: CAPABILITIES.SMS_OUTBOUND });
    assert.equal(r1[0].id, 'p-high');
    assert.equal(r1[1].id, 'p-low');
  });

  test('intra-priority : healthy > degraded', () => {
    const r = new ProviderRegistry();
    const a = new MockMessagingProvider({ id: 'a', priority: 10 });
    const b = new MockMessagingProvider({ id: 'b', priority: 10 });
    a._setHealth(PROVIDER_STATUS.HEALTHY);
    b._setHealth(PROVIDER_STATUS.DEGRADED);
    r.register(a); r.register(b);

    const r1 = resolveProviders(r, { capability: CAPABILITIES.SMS_OUTBOUND });
    assert.equal(r1[0].id, 'a');
    assert.equal(r1[1].id, 'b');
  });

  test('vide si aucune capability match', () => {
    const r = new ProviderRegistry();
    r.register(new MockProvider({ id: 'x', capabilities: [] }));
    const r1 = resolveProviders(r, { capability: CAPABILITIES.SMS_OUTBOUND });
    assert.equal(r1.length, 0);
  });
});
