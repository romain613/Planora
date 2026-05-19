// server/shared/test/errors.test.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../errors/AppError.js';
import { ERROR_CODES, getErrorSpec, listErrorCodes } from '../errors/errorCodes.js';
import {
  BadRequest, Unauthenticated, Forbidden, NotFound, RoleInsufficient,
  TenantMismatch, FeatureDisabled, Internal, ProviderError,
} from '../errors/httpErrors.js';

describe('errors/errorCodes', () => {
  test('registry contient codes essentiels', () => {
    assert.ok('BAD_REQUEST' in ERROR_CODES);
    assert.ok('UNAUTHENTICATED' in ERROR_CODES);
    assert.ok('FORBIDDEN' in ERROR_CODES);
    assert.ok('NOT_FOUND' in ERROR_CODES);
    assert.ok('INTERNAL' in ERROR_CODES);
  });

  test('getErrorSpec retourne spec pour code connu', () => {
    const s = getErrorSpec('BAD_REQUEST');
    assert.equal(s.code, 'BAD_REQUEST');
    assert.equal(s.status, 400);
    assert.ok(typeof s.safeMessage === 'string');
  });

  test('getErrorSpec fallback INTERNAL pour code inconnu', () => {
    const s = getErrorSpec('NOPE');
    assert.equal(s.code, 'INTERNAL');
    assert.equal(s.status, 500);
  });

  test('ERROR_CODES gelé', () => {
    assert.equal(Object.isFrozen(ERROR_CODES), true);
  });

  test('listErrorCodes retourne array de codes', () => {
    const list = listErrorCodes();
    assert.ok(Array.isArray(list));
    assert.ok(list.includes('BAD_REQUEST'));
    assert.ok(list.length >= 15);
  });
});

describe('errors/AppError', () => {
  test('crée erreur avec code + status + safeMessage', () => {
    const e = new AppError('BAD_REQUEST');
    assert.equal(e.code, 'BAD_REQUEST');
    assert.equal(e.status, 400);
    assert.equal(e.safeMessage, 'Requête invalide');
    assert.equal(e.message, 'Requête invalide');
    assert.ok(e.timestamp);
    assert.ok(e.stack);
  });

  test('opts.safeMessage override', () => {
    const e = new AppError('BAD_REQUEST', { safeMessage: 'Custom' });
    assert.equal(e.safeMessage, 'Custom');
  });

  test('opts.status override', () => {
    const e = new AppError('BAD_REQUEST', { status: 418 });
    assert.equal(e.status, 418);
  });

  test('opts.details + correlationId + cause stockés', () => {
    const cause = new Error('boom');
    const e = new AppError('INTERNAL', {
      details: { foo: 'bar' },
      correlationId: 'req-123',
      cause,
    });
    assert.deepEqual(e.details, { foo: 'bar' });
    assert.equal(e.correlationId, 'req-123');
    assert.equal(e.cause, cause);
  });

  test('toClientJSON exclut details + stack', () => {
    const e = new AppError('FORBIDDEN', { details: { secret: 'do not leak' } });
    const j = e.toClientJSON();
    assert.equal(j.error.code, 'FORBIDDEN');
    assert.equal(j.error.message, 'Accès interdit');
    assert.equal(j.error.status, 403);
    assert.equal(j.error.details, undefined);
    assert.equal(j.error.stack, undefined);
  });

  test('toLogJSON inclut details + stack', () => {
    const e = new AppError('FORBIDDEN', { details: { secret: 'op only' } });
    const j = e.toLogJSON();
    assert.deepEqual(j.details, { secret: 'op only' });
    assert.ok(j.stack);
  });

  test('toJSON = toClientJSON', () => {
    const e = new AppError('INTERNAL');
    assert.deepEqual(e.toJSON(), e.toClientJSON());
  });

  test('AppError.wrap idempotent sur AppError', () => {
    const original = new AppError('BAD_REQUEST');
    const wrapped = AppError.wrap(original);
    assert.equal(wrapped, original);
  });

  test('AppError.wrap wrap toute Error en AppError INTERNAL', () => {
    const e = AppError.wrap(new Error('boom'));
    assert.ok(e instanceof AppError);
    assert.equal(e.code, 'INTERNAL');
    assert.equal(e.details.originalMessage, 'boom');
  });
});

describe('errors/httpErrors sous-classes', () => {
  test('BadRequest hérite AppError + code', () => {
    const e = new BadRequest();
    assert.ok(e instanceof AppError);
    assert.equal(e.code, 'BAD_REQUEST');
    assert.equal(e.status, 400);
    assert.equal(e.name, 'BadRequest');
  });

  test('Unauthenticated, Forbidden, NotFound, RoleInsufficient, TenantMismatch', () => {
    assert.equal(new Unauthenticated().status, 401);
    assert.equal(new Forbidden().status, 403);
    assert.equal(new NotFound().status, 404);
    assert.equal(new RoleInsufficient().status, 403);
    assert.equal(new TenantMismatch().status, 403);
    assert.equal(new FeatureDisabled().status, 403);
    assert.equal(new Internal().status, 500);
    assert.equal(new ProviderError().status, 500);
  });

  test('Toutes les sous-classes acceptent opts', () => {
    const e = new NotFound({ safeMessage: 'Ressource X', details: { id: 42 }, correlationId: 'cid' });
    assert.equal(e.safeMessage, 'Ressource X');
    assert.deepEqual(e.details, { id: 42 });
    assert.equal(e.correlationId, 'cid');
  });
});
