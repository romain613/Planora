// server/shared/test/utils.test.js
// Tests utils/ — deepFreeze + objectPath + safeJson.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { deepFreeze, isDeeplyFrozen } from '../utils/deepFreeze.js';
import { get, has, set } from '../utils/objectPath.js';
import { safeStringify, safeParse } from '../utils/safeJson.js';

describe('utils/deepFreeze', () => {
  test('gèle un objet plat', () => {
    const o = deepFreeze({ a: 1 });
    assert.equal(Object.isFrozen(o), true);
    assert.throws(() => { o.a = 2; }, TypeError);
  });

  test('gèle un objet profond', () => {
    const o = deepFreeze({ a: { b: { c: 1 } } });
    assert.equal(isDeeplyFrozen(o), true);
    assert.throws(() => { o.a.b.c = 2; }, TypeError);
  });

  test('gèle les arrays imbriqués', () => {
    const o = deepFreeze({ list: [1, { inner: 2 }] });
    assert.equal(isDeeplyFrozen(o), true);
    assert.throws(() => { o.list[1].inner = 99; }, TypeError);
  });

  test('survives cycles', () => {
    const a = { name: 'a' };
    const b = { name: 'b', ref: a };
    a.ref = b;
    deepFreeze(a);
    assert.equal(Object.isFrozen(a), true);
    assert.equal(Object.isFrozen(b), true);
  });

  test('idempotent sur objets déjà gelés', () => {
    const o = Object.freeze({ a: 1 });
    const r = deepFreeze(o);
    assert.equal(r, o);
  });

  test('renvoie primitives sans changement', () => {
    assert.equal(deepFreeze(42), 42);
    assert.equal(deepFreeze('hello'), 'hello');
    assert.equal(deepFreeze(null), null);
  });

  test('isDeeplyFrozen détecte child non-gelé', () => {
    const child = { x: 1 };
    const parent = { child };
    Object.freeze(parent); // shallow only
    assert.equal(isDeeplyFrozen(parent), false);
  });
});

describe('utils/objectPath', () => {
  const sample = { a: { b: { c: 42 }, list: [10, 20, 30] }, top: 'hi' };

  test('get retrieves nested value', () => {
    assert.equal(get(sample, 'a.b.c'), 42);
    assert.equal(get(sample, 'top'), 'hi');
  });

  test('get returns default for missing path', () => {
    assert.equal(get(sample, 'a.b.missing', 'fallback'), 'fallback');
    assert.equal(get(sample, 'no.such', 0), 0);
    assert.equal(get(null, 'a.b'), undefined);
  });

  test('get accepts array path', () => {
    assert.equal(get(sample, ['a', 'b', 'c']), 42);
  });

  test('has returns boolean correctly', () => {
    assert.equal(has(sample, 'a.b.c'), true);
    assert.equal(has(sample, 'a.b.missing'), false);
    assert.equal(has(sample, 'a.b'), true);
  });

  test('set returns new root + leaves original untouched', () => {
    const r = set(sample, 'a.b.c', 100);
    assert.equal(r.a.b.c, 100);
    assert.equal(sample.a.b.c, 42, 'original unchanged');
    assert.notEqual(r, sample);
    assert.notEqual(r.a, sample.a);
  });

  test('set creates intermediate paths', () => {
    const r = set({}, 'a.b.c', 'x');
    assert.equal(r.a.b.c, 'x');
  });

  test('set with empty path returns the value', () => {
    assert.equal(set({ a: 1 }, '', 'replaced'), 'replaced');
  });

  test('get rejects non-string path', () => {
    assert.throws(() => get({}, 123), /path must be/);
  });
});

describe('utils/safeJson', () => {
  test('stringify objet plat', () => {
    assert.equal(safeStringify({ a: 1 }), '{"a":1}');
  });

  test('stringify gère cycles', () => {
    const a = { name: 'a' };
    a.self = a;
    const s = safeStringify(a);
    assert.match(s, /Circular/);
  });

  test('stringify gère BigInt', () => {
    const s = safeStringify({ big: 9007199254740993n });
    assert.match(s, /9007199254740993/);
  });

  test('stringify gère Error', () => {
    const e = new Error('boom');
    const s = safeStringify({ err: e });
    assert.match(s, /boom/);
    assert.match(s, /stack/);
  });

  test('stringify gère Map et Set', () => {
    const m = new Map([['k', 'v']]);
    const sm = safeStringify(m);
    assert.match(sm, /"k":"v"/);

    const set = new Set([1, 2, 3]);
    const ss = safeStringify(set);
    assert.match(ss, /\[1,2,3\]/);
  });

  test('stringify gère Date en ISO', () => {
    const s = safeStringify({ d: new Date('2026-01-01T00:00:00Z') });
    assert.match(s, /2026-01-01T00:00:00/);
  });

  test('parse safe retourne fallback sur erreur', () => {
    assert.deepEqual(safeParse('{"a":1}'), { a: 1 });
    assert.equal(safeParse('not json', null), null);
    assert.equal(safeParse('not json', 'fallback'), 'fallback');
    assert.equal(safeParse(null, 'fb'), 'fb');
  });
});
