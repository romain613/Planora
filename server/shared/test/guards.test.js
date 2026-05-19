// server/shared/test/guards.test.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { requireAuth } from '../guards/requireAuth.js';
import { requireRole } from '../guards/requireRole.js';
import { requireTenant } from '../guards/requireTenant.js';
import { requireFeature } from '../guards/requireFeature.js';

import { makeAuthContext, makeAnonymousContext, LEVELS } from '../auth/context.js';
import { makeTenantContext, TENANT_SCOPES } from '../auth/tenantContext.js';

import { Unauthenticated, RoleInsufficient, TenantMismatch, FeatureDisabled } from '../errors/httpErrors.js';

describe('guards/requireAuth', () => {
  test('refuse 401 si pas d authCtx', () => {
    const mw = requireAuth();
    let err = null;
    mw({}, {}, (e) => { err = e; });
    assert.ok(err instanceof Unauthenticated);
    assert.equal(err.status, 401);
  });

  test('refuse 401 si anonymous', () => {
    const mw = requireAuth();
    let err = null;
    mw({ authCtx: makeAnonymousContext() }, {}, (e) => { err = e; });
    assert.ok(err instanceof Unauthenticated);
  });

  test('passe si authentifié', () => {
    const mw = requireAuth();
    let called = false;
    mw(
      { authCtx: makeAuthContext({ level: 'user', userId: 'u1' }) },
      {},
      () => { called = true; }
    );
    assert.equal(called, true);
  });

  test('propage correlationId dans erreur', () => {
    const mw = requireAuth();
    let err = null;
    mw({ requestId: 'r1' }, {}, (e) => { err = e; });
    assert.equal(err.correlationId, 'r1');
  });
});

describe('guards/requireRole', () => {
  test('throws si opts vides', () => {
    assert.throws(() => requireRole(), /level or opts.roles required/);
  });

  test('refuse 401 si anonymous', () => {
    const mw = requireRole({ level: 'user' });
    let err = null;
    mw({ authCtx: makeAnonymousContext() }, {}, (e) => { err = e; });
    assert.ok(err instanceof Unauthenticated);
  });

  test('level: refuse si insuffisant', () => {
    const mw = requireRole({ level: 'supra' });
    let err = null;
    mw({ authCtx: makeAuthContext({ level: 'user' }) }, {}, (e) => { err = e; });
    assert.ok(err instanceof RoleInsufficient);
    assert.deepEqual(err.details, { required: 'supra', actual: 'user' });
  });

  test('level: passe si suffisant', () => {
    const mw = requireRole({ level: 'user' });
    let called = false;
    mw({ authCtx: makeAuthContext({ level: 'supra' }) }, {}, () => { called = true; });
    assert.equal(called, true);
  });

  test('roles: refuse si rôle non listé', () => {
    const mw = requireRole({ roles: ['owner', 'admin'] });
    let err = null;
    mw({ authCtx: makeAuthContext({ level: 'user', role: 'viewer' }) }, {}, (e) => { err = e; });
    assert.ok(err instanceof RoleInsufficient);
  });

  test('roles: passe si rôle listé', () => {
    const mw = requireRole({ roles: ['admin'] });
    let called = false;
    mw({ authCtx: makeAuthContext({ level: 'user', role: 'admin' }) }, {}, () => { called = true; });
    assert.equal(called, true);
  });
});

describe('guards/requireTenant', () => {
  test('refuse 401 si pas de tenantCtx', () => {
    const mw = requireTenant();
    let err = null;
    mw({}, {}, (e) => { err = e; });
    assert.ok(err instanceof Unauthenticated);
  });

  test('scope mismatch → TenantMismatch', () => {
    const mw = requireTenant({ scope: TENANT_SCOPES.SUPRO });
    let err = null;
    mw(
      { tenantCtx: makeTenantContext({ scope: 'client', clientId: 'c1' }) },
      {},
      (e) => { err = e; }
    );
    assert.ok(err instanceof TenantMismatch);
  });

  test('suproId mismatch → TenantMismatch', () => {
    const mw = requireTenant({ scope: 'supro', suproId: 's-target' });
    let err = null;
    mw(
      { tenantCtx: makeTenantContext({ scope: 'supro', suproId: 's-other' }) },
      {},
      (e) => { err = e; }
    );
    assert.ok(err instanceof TenantMismatch);
  });

  test('clientId mismatch → TenantMismatch', () => {
    const mw = requireTenant({ scope: 'client', clientId: 'c-target' });
    let err = null;
    mw(
      { tenantCtx: makeTenantContext({ scope: 'client', clientId: 'c-other' }) },
      {},
      (e) => { err = e; }
    );
    assert.ok(err instanceof TenantMismatch);
  });

  test('passe si scope + ids match', () => {
    const mw = requireTenant({ scope: 'client', clientId: 'c1' });
    let called = false;
    mw(
      { tenantCtx: makeTenantContext({ scope: 'client', clientId: 'c1' }) },
      {},
      () => { called = true; }
    );
    assert.equal(called, true);
  });

  test('resolveIdFromReq dynamique', () => {
    const mw = requireTenant({
      scope: 'client',
      resolveIdFromReq: (req) => ({ clientId: req.params.clientId }),
    });
    let err = null;
    mw(
      {
        params: { clientId: 'c-target' },
        tenantCtx: makeTenantContext({ scope: 'client', clientId: 'c-other' }),
      },
      {},
      (e) => { err = e; }
    );
    assert.ok(err instanceof TenantMismatch);
  });
});

describe('guards/requireFeature', () => {
  test('throws si featureName vide', () => {
    assert.throws(() => requireFeature(), /featureName required/);
  });

  test('source=auth → check authCtx.features', () => {
    const mw = requireFeature('beta', { source: 'auth' });
    const ctx = makeAuthContext({ level: 'user', features: ['beta'] });
    let called = false;
    mw({ authCtx: ctx }, {}, () => { called = true; });
    assert.equal(called, true);
  });

  test('source=auth refuse si feature absent', () => {
    const mw = requireFeature('newui', { source: 'auth' });
    const ctx = makeAuthContext({ level: 'user', features: ['beta'] });
    let err = null;
    mw({ authCtx: ctx }, {}, (e) => { err = e; });
    assert.ok(err instanceof FeatureDisabled);
  });

  test('source=tenant → check tenantCtx.features', () => {
    const mw = requireFeature('billing', { source: 'tenant' });
    const t = makeTenantContext({ scope: 'client', clientId: 'c1', features: { billing: true } });
    let called = false;
    mw({ tenantCtx: t }, {}, () => { called = true; });
    assert.equal(called, true);
  });

  test('source=any : OR entre auth + tenant', () => {
    const mw = requireFeature('voip');
    const t = makeTenantContext({ scope: 'client', clientId: 'c1', features: { voip: true } });
    let called = false;
    mw({ tenantCtx: t }, {}, () => { called = true; });
    assert.equal(called, true);
  });

  test('liste features = any-of', () => {
    const mw = requireFeature(['beta', 'newui']);
    const ctx = makeAuthContext({ level: 'user', features: ['newui'] });
    let called = false;
    mw({ authCtx: ctx }, {}, () => { called = true; });
    assert.equal(called, true);
  });
});
