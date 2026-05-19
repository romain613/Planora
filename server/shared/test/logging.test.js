// server/shared/test/logging.test.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { redact, REDACTED_PLACEHOLDER, DEFAULT_SENSITIVE_KEYS_LIST } from '../logging/redaction.js';
import { createLogger, LEVELS_MAP } from '../logging/logger.js';
import { createAuditLogger } from '../logging/auditLogger.js';

describe('logging/redaction', () => {
  test('masque clé password', () => {
    const r = redact({ password: 'secret123', other: 'visible' });
    assert.equal(r.password, REDACTED_PLACEHOLDER);
    assert.equal(r.other, 'visible');
  });

  test('masque token + authorization + cookie + secret', () => {
    const r = redact({
      token: 'eyJhbGciOi...',
      authorization: 'Bearer abc',
      cookie: 'sid=xyz',
      secret: 'shh',
    });
    assert.equal(r.token, REDACTED_PLACEHOLDER);
    assert.equal(r.authorization, REDACTED_PLACEHOLDER);
    assert.equal(r.cookie, REDACTED_PLACEHOLDER);
    assert.equal(r.secret, REDACTED_PLACEHOLDER);
  });

  test('masque récursivement', () => {
    const r = redact({ inner: { nested: { password: 'p' } } });
    assert.equal(r.inner.nested.password, REDACTED_PLACEHOLDER);
  });

  test('masque dans arrays', () => {
    const r = redact([{ token: 'a' }, { token: 'b' }]);
    assert.equal(r[0].token, REDACTED_PLACEHOLDER);
    assert.equal(r[1].token, REDACTED_PLACEHOLDER);
  });

  test('detecte Bearer en valeur string', () => {
    const r = redact({ header: 'Bearer abc123def456' });
    assert.match(r.header, /\[REDACTED\]/);
  });

  test('detecte Twilio SID en valeur', () => {
    const r = redact({ traceData: 'sid=AC' + 'a'.repeat(32) });
    assert.match(r.traceData, /\[REDACTED\]/);
  });

  test('detecte JWT en valeur', () => {
    const r = redact({ note: 'token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.xxx' });
    assert.match(r.note, /\[REDACTED\]/);
  });

  test('cycles ne crashent pas', () => {
    const a = { name: 'a' };
    a.self = a;
    const r = redact(a);
    assert.equal(r.self, '[Circular]');
  });

  test('ne mutate pas input', () => {
    const input = { password: 'p', visible: 'v' };
    redact(input);
    assert.equal(input.password, 'p', 'original untouched');
  });

  test('opts.sensitiveKeys ajoute clés custom', () => {
    const r = redact({ customField: 'value' }, { sensitiveKeys: ['customField'] });
    assert.equal(r.customField, REDACTED_PLACEHOLDER);
  });

  test('DEFAULT_SENSITIVE_KEYS_LIST gelé', () => {
    assert.equal(Object.isFrozen(DEFAULT_SENSITIVE_KEYS_LIST), true);
  });
});

describe('logging/logger', () => {
  test('emit JSON line via write', () => {
    const lines = [];
    const log = createLogger({ write: (s) => lines.push(s) });
    log.info({ msg: 'hello', n: 42 });
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.msg, 'hello');
    assert.equal(parsed.n, 42);
    assert.equal(parsed.level, 'info');
    assert.ok(parsed.ts);
  });

  test('level threshold filtre messages', () => {
    const lines = [];
    const log = createLogger({ level: 'warn', write: (s) => lines.push(s) });
    log.debug({ msg: 'd' });
    log.info({ msg: 'i' });
    log.warn({ msg: 'w' });
    log.error({ msg: 'e' });
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).msg, 'w');
    assert.equal(JSON.parse(lines[1]).msg, 'e');
  });

  test('child logger hérite bindings + level', () => {
    const lines = [];
    const log = createLogger({ bindings: { app: 'planora' }, write: (s) => lines.push(s) });
    const child = log.child({ module: 'shared' });
    child.info({ msg: 'hello' });
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.app, 'planora');
    assert.equal(parsed.module, 'shared');
  });

  test('redacte automatiquement secrets', () => {
    const lines = [];
    const log = createLogger({ write: (s) => lines.push(s) });
    log.info({ password: 'p', token: 't', visible: 'v' });
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.password, REDACTED_PLACEHOLDER);
    assert.equal(parsed.token, REDACTED_PLACEHOLDER);
    assert.equal(parsed.visible, 'v');
  });

  test('accepte string payload (converti en msg)', () => {
    const lines = [];
    const log = createLogger({ write: (s) => lines.push(s) });
    log.info('hello');
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.msg, 'hello');
  });

  test('LEVELS_MAP cohérent', () => {
    assert.equal(LEVELS_MAP.info, 30);
    assert.equal(LEVELS_MAP.warn, 40);
    assert.ok(LEVELS_MAP.error > LEVELS_MAP.warn);
  });
});

describe('logging/auditLogger', () => {
  test('emit audit event structuré', () => {
    const lines = [];
    const audit = createAuditLogger({ write: (s) => lines.push(s) });
    audit.log({
      action: 'user.login',
      actorType: 'user',
      actorId: 'u1',
      tenantId: 'c1',
      outcome: 'success',
    });
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.type, 'audit');
    assert.equal(parsed.action, 'user.login');
    assert.equal(parsed.actorType, 'user');
    assert.equal(parsed.outcome, 'success');
    assert.ok(parsed.ts);
  });

  test('refuse event sans action', () => {
    const audit = createAuditLogger({ write: () => {} });
    assert.throws(() => audit.log({}), /action required/);
  });

  test('outcome default success', () => {
    const lines = [];
    const audit = createAuditLogger({ write: (s) => lines.push(s) });
    audit.log({ action: 'x' });
    assert.equal(JSON.parse(lines[0]).outcome, 'success');
  });

  test('redacte meta', () => {
    const lines = [];
    const audit = createAuditLogger({ write: (s) => lines.push(s) });
    audit.log({ action: 'x', meta: { password: 'p' } });
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.meta.password, REDACTED_PLACEHOLDER);
  });
});
