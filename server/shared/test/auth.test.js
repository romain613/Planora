// server/shared/test/auth.test.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEVELS, makeAuthContext, makeAnonymousContext,
  isAtLeast, isAuthenticated, hasPermissions, hasFeature,
} from '../auth/context.js';

import {
  TENANT_SCOPES, makeTenantContext, makePlatformContext,
  isTenantClient, isTenantSupro, tenantHasFeature,
} from '../auth/tenantContext.js';

import {
  SESSION_TYPES, makeSessionContext, makeAnonymousSession, isExpired, ttlMs,
} from '../auth/sessionContext.js';

describe('auth/context', () => {
  test('makeAuthContext crée un context immutable', () => {
    const ctx = makeAuthContext({ level: LEVELS.USER, userId: 'u1', role: 'admin' });
    assert.equal(Object.isFrozen(ctx), true);
    assert.equal(ctx.level, 'user');
    assert.equal(ctx.userId, 'u1');
    assert.equal(ctx.role, 'admin');
    assert.throws(() => { ctx.userId = 'u2'; }, TypeError);
  });

  test('makeAuthContext rejette level invalide', () => {
    assert.throws(() => makeAuthContext({ level: 'superuser' }), /invalid level/);
  });

  test('makeAnonymousContext', () => {
    const ctx = makeAnonymousContext();
    assert.equal(ctx.level, 'anonymous');
    assert.equal(isAuthenticated(ctx), false);
  });

  test('isAtLeast respecte hiérarchie', () => {
    const userCtx = makeAuthContext({ level: LEVELS.USER });
    const clientCtx = makeAuthContext({ level: LEVELS.CLIENT });
    const supraCtx = makeAuthContext({ level: LEVELS.SUPRA });

    assert.equal(isAtLeast(userCtx, 'user'), true);
    assert.equal(isAtLeast(userCtx, 'client'), false);
    assert.equal(isAtLeast(clientCtx, 'user'), true);
    assert.equal(isAtLeast(supraCtx, 'client'), true);
    assert.equal(isAtLeast(supraCtx, 'supra'), true);
  });

  test('isAtLeast rejette level invalide', () => {
    const ctx = makeAuthContext({ level: LEVELS.USER });
    assert.throws(() => isAtLeast(ctx, 'bogus'), /invalid level/);
  });

  test('isAuthenticated retourne false pour null/undefined/anonymous', () => {
    assert.equal(isAuthenticated(null), false);
    assert.equal(isAuthenticated(undefined), false);
    assert.equal(isAuthenticated({}), false);
    assert.equal(isAuthenticated(makeAnonymousContext()), false);
    assert.equal(isAuthenticated(makeAuthContext({ level: 'user' })), true);
  });

  test('hasPermissions vérifie all-of', () => {
    const ctx = makeAuthContext({ level: 'user', permissions: ['read', 'write'] });
    assert.equal(hasPermissions(ctx, 'read'), true);
    assert.equal(hasPermissions(ctx, ['read', 'write']), true);
    assert.equal(hasPermissions(ctx, ['read', 'admin']), false);
  });

  test('hasFeature vérifie présence', () => {
    const ctx = makeAuthContext({ level: 'user', features: ['beta', 'newui'] });
    assert.equal(hasFeature(ctx, 'beta'), true);
    assert.equal(hasFeature(ctx, 'absent'), false);
  });
});

describe('auth/tenantContext', () => {
  test('makeTenantContext SUPRO requiert suproId', () => {
    assert.throws(
      () => makeTenantContext({ scope: TENANT_SCOPES.SUPRO }),
      /requires suproId/
    );
  });

  test('makeTenantContext CLIENT requiert clientId', () => {
    assert.throws(
      () => makeTenantContext({ scope: TENANT_SCOPES.CLIENT }),
      /requires clientId/
    );
  });

  test('makeTenantContext CLIENT OK', () => {
    const t = makeTenantContext({
      scope: TENANT_SCOPES.CLIENT,
      clientId: 'c1',
      suproId: 's1',
      tenantName: 'CapFinances',
      tenantMode: 'legacy',
      features: { beta: true },
    });
    assert.equal(Object.isFrozen(t), true);
    assert.equal(t.clientId, 'c1');
    assert.equal(t.tenantMode, 'legacy');
    assert.equal(t.features.beta, true);
  });

  test('makePlatformContext', () => {
    const p = makePlatformContext();
    assert.equal(p.scope, 'platform');
    assert.equal(p.suproId, null);
    assert.equal(p.clientId, null);
  });

  test('isTenantClient + isTenantSupro', () => {
    const tc = makeTenantContext({ scope: 'client', clientId: 'c1' });
    const ts = makeTenantContext({ scope: 'supro', suproId: 's1' });
    assert.equal(isTenantClient(tc, 'c1'), true);
    assert.equal(isTenantClient(tc, 'c2'), false);
    assert.equal(isTenantSupro(ts, 's1'), true);
    assert.equal(isTenantSupro(ts, 's2'), false);
    assert.equal(isTenantClient(ts, 'c1'), false);
  });

  test('tenantHasFeature', () => {
    const t = makeTenantContext({ scope: 'client', clientId: 'c1', features: { x: true, y: false } });
    assert.equal(tenantHasFeature(t, 'x'), true);
    assert.equal(tenantHasFeature(t, 'y'), false);
    assert.equal(tenantHasFeature(t, 'z'), false);
  });

  test('makeTenantContext rejette scope invalide', () => {
    assert.throws(() => makeTenantContext({ scope: 'bad' }), /invalid scope/);
  });
});

describe('auth/sessionContext', () => {
  test('makeSessionContext immutable + fields', () => {
    const s = makeSessionContext({
      type: SESSION_TYPES.JWT,
      id: 'jti-1',
      subject: 'u1',
      issuedAt: 1000,
      expiresAt: 2000,
      claims: { role: 'admin' },
    });
    assert.equal(Object.isFrozen(s), true);
    assert.equal(s.type, 'jwt');
    assert.equal(s.subject, 'u1');
    assert.equal(s.claims.role, 'admin');
  });

  test('makeAnonymousSession', () => {
    const s = makeAnonymousSession();
    assert.equal(s.type, 'anonymous');
    assert.equal(s.id, null);
  });

  test('isExpired correct', () => {
    const s = makeSessionContext({ type: 'jwt', expiresAt: 1000 });
    assert.equal(isExpired(s, 500), false);
    assert.equal(isExpired(s, 1000), true);
    assert.equal(isExpired(s, 1500), true);
  });

  test('isExpired false pour anonymous + sans expiresAt', () => {
    assert.equal(isExpired(makeAnonymousSession()), false);
    assert.equal(isExpired(makeSessionContext({ type: 'cookie' })), false);
  });

  test('ttlMs calcule reste', () => {
    const s = makeSessionContext({ type: 'jwt', expiresAt: 2000 });
    assert.equal(ttlMs(s, 1000), 1000);
    assert.equal(ttlMs(s, 2000), 0);
    assert.equal(ttlMs(s, 3000), -1000);
  });

  test('ttlMs Infinity si pas d expiresAt', () => {
    assert.equal(ttlMs(makeSessionContext({ type: 'cookie' })), Infinity);
  });

  test('makeSessionContext rejette type invalide', () => {
    assert.throws(() => makeSessionContext({ type: 'bogus' }), /invalid type/);
  });
});
