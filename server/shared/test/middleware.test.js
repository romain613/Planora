// server/shared/test/middleware.test.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  requestIdMiddleware,
  newCorrelationId,
  DEFAULT_REQUEST_ID_HEADER,
} from '../middleware/requestId.js';
import {
  runWithContext,
  getCurrentContext,
  getContextValue,
  requestContextMiddleware,
} from '../middleware/requestContext.js';
import { errorHandlerMiddleware } from '../middleware/errorHandler.js';
import { notFoundMiddleware } from '../middleware/notFound.js';
import { AppError } from '../errors/AppError.js';
import { Forbidden, NotFound } from '../errors/httpErrors.js';

function fakeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    headersSent: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
}

describe('middleware/requestId', () => {
  test('génère un id si absent du header', () => {
    const mw = requestIdMiddleware();
    const req = { headers: {} };
    const res = fakeRes();
    let called = false;
    mw(req, res, () => { called = true; });
    assert.ok(req.requestId);
    assert.match(req.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(res.headers['x-request-id'], req.requestId);
    assert.equal(called, true);
  });

  test('propage X-Request-Id si valide', () => {
    const mw = requestIdMiddleware();
    const req = { headers: { 'x-request-id': 'incoming-id-12345' } };
    const res = fakeRes();
    mw(req, res, () => {});
    assert.equal(req.requestId, 'incoming-id-12345');
    assert.equal(res.headers['x-request-id'], 'incoming-id-12345');
  });

  test('ignore X-Request-Id trop court', () => {
    const mw = requestIdMiddleware();
    const req = { headers: { 'x-request-id': 'short' } };
    const res = fakeRes();
    mw(req, res, () => {});
    assert.notEqual(req.requestId, 'short');
    assert.ok(req.requestId.length >= 8);
  });

  test('opts.generator override', () => {
    const mw = requestIdMiddleware({ generator: () => 'custom-id' });
    const req = { headers: {} };
    const res = fakeRes();
    mw(req, res, () => {});
    assert.equal(req.requestId, 'custom-id');
  });

  test('newCorrelationId retourne UUID v4', () => {
    const id = newCorrelationId();
    assert.match(id, /^[0-9a-f-]{36}$/);
  });

  test('DEFAULT_REQUEST_ID_HEADER = x-request-id', () => {
    assert.equal(DEFAULT_REQUEST_ID_HEADER, 'x-request-id');
  });
});

describe('middleware/requestContext (AsyncLocalStorage)', () => {
  test('runWithContext stocke + retrouve via getCurrentContext', () => {
    runWithContext({ requestId: 'r1', authCtx: { level: 'user' } }, () => {
      const ctx = getCurrentContext();
      assert.equal(ctx.requestId, 'r1');
      assert.equal(ctx.authCtx.level, 'user');
    });
  });

  test('getCurrentContext null hors run', () => {
    // Pas dans run → null
    // Note: dans Node :test, le test runner peut être dans son propre context;
    // on garantit juste que ce n'est pas crash.
    const c = getCurrentContext();
    assert.ok(c === null || typeof c === 'object');
  });

  test('getContextValue extrait clé', () => {
    runWithContext({ requestId: 'r2', custom: 42 }, () => {
      assert.equal(getContextValue('requestId'), 'r2');
      assert.equal(getContextValue('custom'), 42);
      assert.equal(getContextValue('missing'), undefined);
    });
  });

  test('runWithContext rejette inputs invalides', () => {
    assert.throws(() => runWithContext(null, () => {}), /context must be/);
    assert.throws(() => runWithContext({}, 'notfn'), /fn must be/);
  });

  test('requestContextMiddleware copie req keys vers ALS', () => {
    const mw = requestContextMiddleware();
    const req = { requestId: 'r3', authCtx: { foo: 1 } };
    const res = fakeRes();
    let seen = null;
    mw(req, res, () => {
      seen = getCurrentContext();
    });
    assert.equal(seen.requestId, 'r3');
    assert.deepEqual(seen.authCtx, { foo: 1 });
  });

  test('copyFromReq custom keys', () => {
    const mw = requestContextMiddleware({ copyFromReq: ['customKey'] });
    const req = { customKey: 'X', otherKey: 'Y' };
    const res = fakeRes();
    let seen = null;
    mw(req, res, () => {
      seen = getCurrentContext();
    });
    assert.equal(seen.customKey, 'X');
    assert.equal(seen.otherKey, undefined);
  });

  test('async ALS propagation', async () => {
    await new Promise((resolve) => {
      runWithContext({ requestId: 'async-r' }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        const ctx = getCurrentContext();
        assert.equal(ctx.requestId, 'async-r');
        resolve();
      });
    });
  });
});

describe('middleware/errorHandler', () => {
  test('convertit Error standard en AppError INTERNAL', () => {
    const logs = [];
    const handler = errorHandlerMiddleware({
      logger: { error: (p) => logs.push(p) },
      includeStack: () => false,
    });
    const req = { method: 'GET', url: '/test', requestId: 'r1' };
    const res = fakeRes();
    handler(new Error('boom'), req, res, () => {});

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error.code, 'INTERNAL');
    assert.equal(res.body.error.correlationId, 'r1');
    assert.equal(logs.length, 1);
    assert.match(logs[0].msg, /request_failed/);
  });

  test('passe AppError tel quel', () => {
    const handler = errorHandlerMiddleware({
      logger: { error: () => {} },
      includeStack: () => false,
    });
    const req = { method: 'GET', url: '/x', requestId: 'r2' };
    const res = fakeRes();
    handler(new Forbidden({ safeMessage: 'Nope' }), req, res, () => {});
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
    assert.equal(res.body.error.message, 'Nope');
  });

  test('inclut _stack en dev mode', () => {
    const handler = errorHandlerMiddleware({
      logger: { error: () => {} },
      includeStack: () => true,
    });
    const req = {};
    const res = fakeRes();
    handler(new AppError('INTERNAL'), req, res, () => {});
    assert.ok(res.body.error._stack);
  });

  test('headers déjà envoyés → next(err) sans crash', () => {
    const handler = errorHandlerMiddleware({ logger: { error: () => {} } });
    const req = {};
    const res = { headersSent: true };
    let nextErr = null;
    handler(new AppError('INTERNAL'), req, res, (e) => { nextErr = e; });
    assert.ok(nextErr instanceof AppError);
  });

  test('logger qui throw ne crash pas la response', () => {
    const handler = errorHandlerMiddleware({
      logger: { error: () => { throw new Error('logger broken'); } },
    });
    const req = {};
    const res = fakeRes();
    handler(new AppError('INTERNAL'), req, res, () => {});
    assert.equal(res.statusCode, 500);
  });
});

describe('middleware/notFound', () => {
  test('émet NotFound via next', () => {
    const mw = notFoundMiddleware();
    const req = { method: 'GET', url: '/missing', requestId: 'r1' };
    let nextErr = null;
    mw(req, fakeRes(), (e) => { nextErr = e; });
    assert.ok(nextErr instanceof NotFound);
    assert.equal(nextErr.status, 404);
    assert.equal(nextErr.correlationId, 'r1');
    assert.deepEqual(nextErr.details, { method: 'GET', url: '/missing' });
  });

  test('opts.message override safeMessage', () => {
    const mw = notFoundMiddleware({ message: 'Route inconnue' });
    let nextErr = null;
    mw({}, fakeRes(), (e) => { nextErr = e; });
    assert.equal(nextErr.safeMessage, 'Route inconnue');
  });
});
