// server/shared/test/sprint4-contracts.test.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateProvider, validateMessagingProvider, validateVoiceProvider,
  PROVIDER_CONTRACT_REQUIRED_FIELDS, PROVIDER_CONTRACT_REQUIRED_METHODS,
} from '../contracts/provider.contract.js';
import {
  validateWallet, validateLedgerEntry, validateInvoice,
  LEDGER_KINDS, INVOICE_STATUS,
} from '../contracts/billing.contract.js';
import {
  validateSupra, validateSupro, validateClient, validateUser, validateHierarchy,
  SUPRO_TIERS, USER_ROLES,
} from '../contracts/tenant.contract.js';
import { validateCdr, validateCdrBatchTenantConsistency } from '../contracts/cdr.contract.js';
import {
  validateAuthContext, validateTenantContext, validateSessionContext,
  validateRequestContextTriad, AUTH_LEVELS, TENANT_SCOPES, SESSION_TYPES,
} from '../contracts/auth.contract.js';

describe('contracts/provider', () => {
  test('validateProvider rejette null', () => {
    const r = validateProvider(null);
    assert.equal(r.ok, false);
  });

  test('validateProvider détecte champs manquants', () => {
    const r = validateProvider({ id: 'p1' });
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
  });

  test('validateProvider OK sur shape complet', () => {
    const p = {
      id: 'p1', type: 'composite', displayName: 'P1',
      capabilities: ['sms.outbound'], priority: 10, ownership: 'platform',
      supports: () => true, getHealth: () => ({}), checkHealth: async () => 'ok', toSummary: () => ({}),
    };
    const r = validateProvider(p);
    assert.equal(r.ok, true);
  });

  test('validateProvider rejette priority non-number', () => {
    const p = {
      id: 'p1', type: 'composite', displayName: 'P1',
      capabilities: [], priority: 'high', ownership: 'platform',
      supports: () => true, getHealth: () => ({}), checkHealth: async () => 'ok', toSummary: () => ({}),
    };
    const r = validateProvider(p);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /priority/.test(e)));
  });

  test('validateMessagingProvider exige sendMessage', () => {
    const p = {
      id: 'p1', type: 'messaging', displayName: 'M', capabilities: [], priority: 10, ownership: 'platform',
      supports: () => true, getHealth: () => ({}), checkHealth: async () => 'ok', toSummary: () => ({}),
      // pas de sendMessage
    };
    const r = validateMessagingProvider(p);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /sendMessage/.test(e)));
  });

  test('validateVoiceProvider exige initiateCall + hangupCall', () => {
    const p = {
      id: 'p1', type: 'voice', displayName: 'V', capabilities: [], priority: 10, ownership: 'platform',
      supports: () => true, getHealth: () => ({}), checkHealth: async () => 'ok', toSummary: () => ({}),
      initiateCall: async () => ({}),
      // pas de hangupCall
    };
    const r = validateVoiceProvider(p);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /hangupCall/.test(e)));
  });

  test('REQUIRED_FIELDS + REQUIRED_METHODS gelés', () => {
    assert.equal(Object.isFrozen(PROVIDER_CONTRACT_REQUIRED_FIELDS), true);
    assert.equal(Object.isFrozen(PROVIDER_CONTRACT_REQUIRED_METHODS), true);
  });
});

describe('contracts/billing', () => {
  test('validateWallet OK shape complet', () => {
    const r = validateWallet({ tenantId: 't1', currency: 'EUR', balanceCents: 1000, updatedAt: 1 });
    assert.equal(r.ok, true);
  });

  test('validateWallet rejette balanceCents non-number', () => {
    const r = validateWallet({ tenantId: 't1', currency: 'EUR', balanceCents: 'a', updatedAt: 1 });
    assert.equal(r.ok, false);
  });

  test('validateLedgerEntry rejette kind invalide', () => {
    const r = validateLedgerEntry({
      id: 'e1', walletId: 'w1', amountCents: 100, currency: 'EUR',
      kind: 'bogus', createdAt: 1,
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /kind invalid/.test(e)));
  });

  test('validateLedgerEntry OK kind valide', () => {
    const r = validateLedgerEntry({
      id: 'e1', walletId: 'w1', amountCents: 100, currency: 'EUR',
      kind: LEDGER_KINDS.TOPUP, createdAt: 1,
    });
    assert.equal(r.ok, true);
  });

  test('validateInvoice rejette status invalide', () => {
    const r = validateInvoice({
      id: 'i1', tenantId: 't1', currency: 'EUR', amountCents: 100,
      status: 'unknown', periodStart: 1, periodEnd: 2,
    });
    assert.equal(r.ok, false);
  });

  test('validateInvoice OK status valide', () => {
    const r = validateInvoice({
      id: 'i1', tenantId: 't1', currency: 'EUR', amountCents: 100,
      status: INVOICE_STATUS.PAID, periodStart: 1, periodEnd: 2,
    });
    assert.equal(r.ok, true);
  });

  test('LEDGER_KINDS + INVOICE_STATUS gelés', () => {
    assert.equal(Object.isFrozen(LEDGER_KINDS), true);
    assert.equal(Object.isFrozen(INVOICE_STATUS), true);
  });
});

describe('contracts/tenant', () => {
  test('validateSupro rejette tier invalide', () => {
    const r = validateSupro({ id: 's1', name: 'S1', tier: 'mega', createdAt: 1 });
    assert.equal(r.ok, false);
  });

  test('validateSupro OK tier valide', () => {
    const r = validateSupro({ id: 's1', name: 'S1', tier: SUPRO_TIERS.PREMIUM, createdAt: 1 });
    assert.equal(r.ok, true);
  });

  test('validateClient exige suproId', () => {
    const r = validateClient({ id: 'c1', name: 'C1', createdAt: 1 });
    assert.equal(r.ok, false);
  });

  test('validateUser rejette role invalide', () => {
    const r = validateUser({ id: 'u1', clientId: 'c1', email: 'x@y.z', role: 'god', createdAt: 1 });
    assert.equal(r.ok, false);
  });

  test('validateUser OK role valide', () => {
    const r = validateUser({ id: 'u1', clientId: 'c1', email: 'x@y.z', role: USER_ROLES.OWNER, createdAt: 1 });
    assert.equal(r.ok, true);
  });

  test('validateHierarchy détecte client.suproId orphelin', () => {
    const r = validateHierarchy({
      supros: [{ id: 's1', name: 'S', tier: 'standard', createdAt: 1 }],
      clients: [{ id: 'c1', name: 'C', suproId: 'unknown', createdAt: 1 }],
      users: [],
    });
    assert.equal(r.ok, false);
  });

  test('validateHierarchy détecte user.clientId orphelin', () => {
    const r = validateHierarchy({
      supros: [{ id: 's1', name: 'S', tier: 'standard', createdAt: 1 }],
      clients: [{ id: 'c1', name: 'C', suproId: 's1', createdAt: 1 }],
      users: [{ id: 'u1', clientId: 'unknown', email: 'x@y.z', role: 'user', createdAt: 1 }],
    });
    assert.equal(r.ok, false);
  });

  test('validateHierarchy OK shape cohérent', () => {
    const r = validateHierarchy({
      supros: [{ id: 's1', name: 'S', tier: 'standard', createdAt: 1 }],
      clients: [{ id: 'c1', name: 'C', suproId: 's1', createdAt: 1 }],
      users: [{ id: 'u1', clientId: 'c1', email: 'x@y.z', role: 'user', createdAt: 1 }],
    });
    assert.equal(r.ok, true);
  });
});

describe('contracts/cdr', () => {
  test('validateCdr OK shape complet', () => {
    const r = validateCdr({
      callId: 'call-1', providerId: 'twilio', tenantId: 't1',
      direction: 'outbound', from: '+1', to: '+2', billableSec: 42,
    });
    assert.equal(r.ok, true);
  });

  test('validateCdr rejette direction inconnue', () => {
    const r = validateCdr({
      callId: 'call-1', providerId: 'twilio', tenantId: 't1',
      direction: 'sideways', from: '+1', to: '+2', billableSec: 42,
    });
    assert.equal(r.ok, false);
  });

  test('validateCdr exige currency si ratedCost défini', () => {
    const r = validateCdr({
      callId: 'call-1', providerId: 'twilio', tenantId: 't1',
      direction: 'outbound', from: '+1', to: '+2', billableSec: 42,
      ratedCost: 100, // pas de currency
    });
    assert.equal(r.ok, false);
  });

  test('validateCdr rejette billableSec négatif', () => {
    const r = validateCdr({
      callId: 'call-1', providerId: 'twilio', tenantId: 't1',
      direction: 'outbound', from: '+1', to: '+2', billableSec: -5,
    });
    assert.equal(r.ok, false);
  });

  test('validateCdrBatchTenantConsistency rejette mixed tenants', () => {
    const r = validateCdrBatchTenantConsistency([
      { tenantId: 't1' }, { tenantId: 't2' },
    ]);
    assert.equal(r.ok, false);
  });

  test('validateCdrBatchTenantConsistency OK même tenant', () => {
    const r = validateCdrBatchTenantConsistency([
      { tenantId: 't1' }, { tenantId: 't1' },
    ]);
    assert.equal(r.ok, true);
  });
});

describe('contracts/auth', () => {
  test('validateAuthContext rejette level invalide', () => {
    const r = validateAuthContext({ level: 'godmode', permissions: [], features: [] });
    assert.equal(r.ok, false);
  });

  test('validateAuthContext OK', () => {
    const r = validateAuthContext({ level: 'user', permissions: ['read'], features: ['beta'] });
    assert.equal(r.ok, true);
  });

  test('validateTenantContext scope=supro exige suproId', () => {
    const r = validateTenantContext({ scope: 'supro', tenantMode: 'legacy', features: {} });
    assert.equal(r.ok, false);
  });

  test('validateTenantContext scope=client exige clientId', () => {
    const r = validateTenantContext({ scope: 'client', tenantMode: 'legacy', features: {} });
    assert.equal(r.ok, false);
  });

  test('validateTenantContext OK platform', () => {
    const r = validateTenantContext({ scope: 'platform', tenantMode: 'legacy', features: {} });
    assert.equal(r.ok, true);
  });

  test('validateSessionContext rejette type invalide', () => {
    const r = validateSessionContext({ type: 'bogus', claims: {} });
    assert.equal(r.ok, false);
  });

  test('validateRequestContextTriad détecte user sans tenant client', () => {
    const r = validateRequestContextTriad({
      authCtx: { level: 'user', permissions: [], features: [] },
      tenantCtx: { scope: 'platform', tenantMode: 'legacy', features: {} },
      sessionCtx: { type: 'jwt', claims: {} },
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /user level requires tenantCtx.scope=client/.test(e)));
  });

  test('validateRequestContextTriad OK cohérent', () => {
    const r = validateRequestContextTriad({
      authCtx: { level: 'user', permissions: [], features: [] },
      tenantCtx: { scope: 'client', clientId: 'c1', tenantMode: 'legacy', features: {} },
      sessionCtx: { type: 'jwt', claims: {} },
    });
    assert.equal(r.ok, true);
  });

  test('AUTH_LEVELS, TENANT_SCOPES, SESSION_TYPES gelés', () => {
    assert.equal(Object.isFrozen(AUTH_LEVELS), true);
    assert.equal(Object.isFrozen(TENANT_SCOPES), true);
    assert.equal(Object.isFrozen(SESSION_TYPES), true);
  });
});
