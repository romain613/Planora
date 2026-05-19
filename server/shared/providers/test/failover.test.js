// server/shared/providers/test/failover.test.js
// Tests FailoverRouter — cascade attempts, max, hooks.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ProviderRegistry } from '../registry/providerRegistry.js';
import { FailoverRouter } from '../router/failoverRouter.js';
import { MockMessagingProvider } from '../mocks/MockMessagingProvider.js';
import { CAPABILITIES } from '../types/providerTypes.js';

describe('FailoverRouter', () => {
  test('execute succeed sur 1er provider OK', async () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'p1', priority: 10 }));
    r.register(new MockMessagingProvider({ id: 'p2', priority: 50 }));

    const router = new FailoverRouter(r);
    const { result, providerId, attempts } = await router.execute(
      { capability: CAPABILITIES.SMS_OUTBOUND },
      async (p) => p.sendMessage({ to: '+1', body: 'hi' })
    );
    assert.equal(providerId, 'p1');
    assert.ok(result.id);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].ok, true);
  });

  test('execute failover vers p2 si p1 throw', async () => {
    const r = new ProviderRegistry();
    const p1 = new MockMessagingProvider({ id: 'p1', priority: 10 });
    const p2 = new MockMessagingProvider({ id: 'p2', priority: 50 });
    p1.failNext('p1 down');
    r.register(p1); r.register(p2);

    const router = new FailoverRouter(r);
    const { result, providerId, attempts } = await router.execute(
      { capability: CAPABILITIES.SMS_OUTBOUND },
      async (p) => p.sendMessage({ to: '+1', body: 'hi' })
    );
    assert.equal(providerId, 'p2', 'failover vers p2');
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].ok, false);
    assert.match(attempts[0].error, /p1 down/);
    assert.equal(attempts[1].ok, true);
  });

  test('execute throw si tous échouent', async () => {
    const r = new ProviderRegistry();
    const p1 = new MockMessagingProvider({ id: 'p1', priority: 10 });
    const p2 = new MockMessagingProvider({ id: 'p2', priority: 50 });
    p1.failNext('p1 fail');
    p2.failNext('p2 fail');
    r.register(p1); r.register(p2);

    const router = new FailoverRouter(r);
    let err = null;
    try {
      await router.execute(
        { capability: CAPABILITIES.SMS_OUTBOUND },
        async (p) => p.sendMessage({ to: '+1', body: 'hi' })
      );
    } catch (e) { err = e; }
    assert.ok(err);
    assert.match(err.message, /all 2 attempts failed/);
    assert.equal(err.attempts.length, 2);
    assert.ok(err.cause);
  });

  test('execute throw si aucun candidat', async () => {
    const r = new ProviderRegistry();
    const router = new FailoverRouter(r);
    let err = null;
    try {
      await router.execute(
        { capability: CAPABILITIES.SMS_OUTBOUND },
        async () => 'ok'
      );
    } catch (e) { err = e; }
    assert.ok(err);
    assert.match(err.message, /no candidate provider available/);
    assert.equal(err.attempts.length, 0);
  });

  test('maxAttempts limite le nombre de tentatives', async () => {
    const r = new ProviderRegistry();
    for (let i = 1; i <= 5; i += 1) {
      const p = new MockMessagingProvider({ id: `p${i}`, priority: i });
      p.failNext(`fail-${i}`);
      r.register(p);
    }
    const router = new FailoverRouter(r, { maxAttempts: 2 });
    let err = null;
    try {
      await router.execute(
        { capability: CAPABILITIES.SMS_OUTBOUND },
        async (p) => p.sendMessage({ to: '+1', body: 'x' })
      );
    } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.attempts.length, 2);
  });

  test('onAttemptFailed hook appelé pour chaque échec', async () => {
    const r = new ProviderRegistry();
    const p1 = new MockMessagingProvider({ id: 'p1', priority: 10 });
    const p2 = new MockMessagingProvider({ id: 'p2', priority: 50 });
    p1.failNext('boom');
    r.register(p1); r.register(p2);

    const calls = [];
    const router = new FailoverRouter(r, {
      onAttemptFailed: (provider, err, idx) => calls.push({ providerId: provider.id, idx, msg: err.message }),
    });

    await router.execute(
      { capability: CAPABILITIES.SMS_OUTBOUND },
      async (p) => p.sendMessage({ to: '+1', body: 'x' })
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].providerId, 'p1');
    assert.equal(calls[0].idx, 0);
    assert.match(calls[0].msg, /boom/);
  });

  test('hook qui throw ne crash pas execute', async () => {
    const r = new ProviderRegistry();
    const p1 = new MockMessagingProvider({ id: 'p1', priority: 10 });
    const p2 = new MockMessagingProvider({ id: 'p2', priority: 50 });
    p1.failNext('boom');
    r.register(p1); r.register(p2);

    const router = new FailoverRouter(r, {
      onAttemptFailed: () => { throw new Error('hook broken'); },
    });

    const { result } = await router.execute(
      { capability: CAPABILITIES.SMS_OUTBOUND },
      async (p) => p.sendMessage({ to: '+1', body: 'x' })
    );
    assert.ok(result);
  });

  test('execute rejette operation non-function', async () => {
    const r = new ProviderRegistry();
    r.register(new MockMessagingProvider({ id: 'p1' }));
    const router = new FailoverRouter(r);
    await assert.rejects(
      () => router.execute({ capability: CAPABILITIES.SMS_OUTBOUND }, 'notfn'),
      /must be function/
    );
  });

  test('constructeur rejette sans registry', () => {
    assert.throws(() => new FailoverRouter(), /registry required/);
  });
});
