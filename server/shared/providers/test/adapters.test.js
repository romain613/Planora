// server/shared/providers/test/adapters.test.js
// Tests adapters Twilio + Brevo avec fake clients injectés (zéro réseau).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { TwilioAdapter } from '../adapters/TwilioAdapter.js';
import { BrevoAdapter } from '../adapters/BrevoAdapter.js';
import { CAPABILITIES, PROVIDER_STATUS } from '../types/providerTypes.js';
import { MESSAGE_KIND, MESSAGE_STATUS } from '../types/messageTypes.js';
import { CALL_STATUS } from '../types/callTypes.js';

// === Fake Twilio client builder ===
function makeFakeTwilioClient({ failSms = false, failCall = false, smsStatus = 'sent', callStatus = 'queued' } = {}) {
  return {
    messages: Object.assign(
      (sid) => ({
        async fetch() {
          return { sid, status: 'delivered' };
        },
      }),
      {
        async create({ from, to, body }) {
          if (failSms) throw new Error('twilio sms boom');
          return { sid: 'SM_fake_' + Date.now(), from, to, body, status: smsStatus };
        },
      }
    ),
    calls: Object.assign(
      (sid) => ({}),
      {
        async create({ from, to }) {
          if (failCall) throw new Error('twilio call boom');
          return { sid: 'CA_fake_' + Date.now(), from, to, status: callStatus };
        },
      }
    ),
    api: { v2010: { async fetch() { return { ok: true }; } } },
  };
}

describe('TwilioAdapter (WRAP via fake client)', () => {
  test('refuse instanciation sans client', () => {
    assert.throws(() => new TwilioAdapter({ id: 'twilio' }), /client required/);
  });

  test('default capabilities = composite voice+sms+number', () => {
    const t = new TwilioAdapter({ client: makeFakeTwilioClient(), fromNumber: '+15555550000' });
    assert.equal(t.id, 'twilio');
    assert.equal(t.type, 'composite');
    assert.ok(t.supports(CAPABILITIES.SMS_OUTBOUND));
    assert.ok(t.supports(CAPABILITIES.VOICE_OUTBOUND));
    assert.ok(t.supports(CAPABILITIES.NUMBER_PROVISION));
  });

  test('sendMessage normalize la réponse Twilio', async () => {
    const t = new TwilioAdapter({ client: makeFakeTwilioClient({ smsStatus: 'sent' }), fromNumber: '+15555550000' });
    const m = await t.sendMessage({ to: '+33600000000', body: 'hello' });
    assert.match(m.id, /^SM_fake_/);
    assert.equal(m.kind, 'sms');
    assert.equal(m.direction, 'outbound');
    assert.equal(m.status, MESSAGE_STATUS.SENT);
    assert.equal(m.providerId, 'twilio');
    assert.equal(t.getHealth().status, PROVIDER_STATUS.HEALTHY);
  });

  test('sendMessage rejette sans from configuré', async () => {
    const t = new TwilioAdapter({ client: makeFakeTwilioClient() }); // pas de fromNumber
    await assert.rejects(() => t.sendMessage({ to: '+1', body: 'x' }), /from required/);
  });

  test('sendMessage propage erreur Twilio + status DEGRADED', async () => {
    const t = new TwilioAdapter({ client: makeFakeTwilioClient({ failSms: true }), fromNumber: '+15555550000' });
    await assert.rejects(() => t.sendMessage({ to: '+1', body: 'x' }), /twilio sms boom/);
    assert.equal(t.getHealth().status, PROVIDER_STATUS.DEGRADED);
  });

  test('initiateCall normalize la réponse', async () => {
    const t = new TwilioAdapter({ client: makeFakeTwilioClient({ callStatus: 'ringing' }), fromNumber: '+15555550000' });
    const c = await t.initiateCall({ to: '+33600000000', url: 'http://example.com/twiml' });
    assert.match(c.id, /^CA_fake_/);
    assert.equal(c.direction, 'outbound');
    assert.equal(c.status, CALL_STATUS.RINGING);
  });

  test('initiateCall rejette sans url', async () => {
    const t = new TwilioAdapter({ client: makeFakeTwilioClient(), fromNumber: '+15555550000' });
    await assert.rejects(() => t.initiateCall({ to: '+1' }), /url \(TwiML\) required/);
  });

  test('getMessageStatus mappe statut Twilio', async () => {
    const t = new TwilioAdapter({ client: makeFakeTwilioClient(), fromNumber: '+15555550000' });
    const s = await t.getMessageStatus('SM_x');
    assert.equal(s.status, MESSAGE_STATUS.DELIVERED);
  });

  test('checkHealth → HEALTHY si fake client v2010 OK', async () => {
    const t = new TwilioAdapter({ client: makeFakeTwilioClient(), fromNumber: '+15555550000' });
    assert.equal(await t.checkHealth(), PROVIDER_STATUS.HEALTHY);
  });

  test('checkHealth → DOWN si v2010 throw', async () => {
    const broken = makeFakeTwilioClient();
    broken.api.v2010.fetch = async () => { throw new Error('twilio api down'); };
    const t = new TwilioAdapter({ client: broken, fromNumber: '+15555550000' });
    assert.equal(await t.checkHealth(), PROVIDER_STATUS.DOWN);
  });

  test('_mapMessageStatus default queued si inconnu', () => {
    const t = new TwilioAdapter({ client: makeFakeTwilioClient(), fromNumber: '+15555550000' });
    assert.equal(t._mapMessageStatus('bogus'), MESSAGE_STATUS.QUEUED);
    assert.equal(t._mapMessageStatus('undelivered'), MESSAGE_STATUS.UNDELIVERED);
    assert.equal(t._mapMessageStatus('failed'), MESSAGE_STATUS.FAILED);
  });

  test('_mapCallStatus mappe correctement', () => {
    const t = new TwilioAdapter({ client: makeFakeTwilioClient(), fromNumber: '+15555550000' });
    assert.equal(t._mapCallStatus('in-progress'), CALL_STATUS.IN_PROGRESS);
    assert.equal(t._mapCallStatus('no-answer'), CALL_STATUS.NO_ANSWER);
    assert.equal(t._mapCallStatus('completed'), CALL_STATUS.COMPLETED);
  });
});

// === Fake Brevo client ===
function makeFakeBrevoClient({ failEmail = false, failSms = false } = {}) {
  return {
    async sendEmail({ to }) {
      if (failEmail) throw new Error('brevo email boom');
      return { messageId: 'brevo-email-' + Date.now(), to };
    },
    async sendSms({ recipient }) {
      if (failSms) throw new Error('brevo sms boom');
      return { messageId: 'brevo-sms-' + Date.now(), recipient };
    },
    async ping() { return { ok: true }; },
  };
}

describe('BrevoAdapter (WRAP via fake client)', () => {
  test('refuse instanciation sans client', () => {
    assert.throws(() => new BrevoAdapter({}), /client required/);
  });

  test('sendMessage email normalize la réponse', async () => {
    const b = new BrevoAdapter({
      client: makeFakeBrevoClient(),
      defaults: { fromEmail: 'noreply@x.com', fromName: 'X' },
    });
    const m = await b.sendMessage({ to: 'user@x.com', subject: 'Hi', body: '<p>hello</p>' });
    assert.match(m.id, /^brevo-email-/);
    assert.equal(m.kind, 'email');
    assert.equal(m.direction, 'outbound');
    assert.equal(m.status, MESSAGE_STATUS.SENT);
  });

  test('sendMessage SMS via Brevo', async () => {
    const b = new BrevoAdapter({
      client: makeFakeBrevoClient(),
      defaults: { fromSms: 'PLANORA' },
    });
    const m = await b.sendMessage({ to: '+33600000000', body: 'sms', kind: MESSAGE_KIND.SMS });
    assert.match(m.id, /^brevo-sms-/);
    assert.equal(m.kind, 'sms');
  });

  test('sendMessage rejette kind inconnu', async () => {
    const b = new BrevoAdapter({ client: makeFakeBrevoClient() });
    await assert.rejects(
      () => b.sendMessage({ to: 'x', body: 'y', kind: 'whatsapp' }),
      /not supported/
    );
  });

  test('propage erreur Brevo + status DEGRADED', async () => {
    const b = new BrevoAdapter({
      client: makeFakeBrevoClient({ failEmail: true }),
      defaults: { fromEmail: 'x@y.com' },
    });
    await assert.rejects(() => b.sendMessage({ to: 'x', subject: 's', body: 'y' }), /brevo email boom/);
    assert.equal(b.getHealth().status, PROVIDER_STATUS.DEGRADED);
  });

  test('checkHealth via ping fake', async () => {
    const b = new BrevoAdapter({ client: makeFakeBrevoClient(), defaults: { fromEmail: 'x@y.com' } });
    assert.equal(await b.checkHealth(), PROVIDER_STATUS.HEALTHY);
  });

  test('checkHealth sans ping retourne status courant', async () => {
    const c = makeFakeBrevoClient();
    delete c.ping;
    const b = new BrevoAdapter({ client: c, defaults: { fromEmail: 'x@y.com' } });
    const r = await b.checkHealth();
    assert.ok(['unknown', 'healthy', 'degraded', 'down'].includes(r));
  });

  test('getMessageStatus retourne unknown si client n\'expose pas', async () => {
    const b = new BrevoAdapter({ client: makeFakeBrevoClient(), defaults: { fromEmail: 'x@y.com' } });
    const s = await b.getMessageStatus('xyz');
    assert.equal(s.status, 'unknown');
  });
});
