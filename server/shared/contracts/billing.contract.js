// server/shared/contracts/billing.contract.js
// Contract Billing — interfaces stables Phase 5+ (Stripe + Wallet + Credits).
// Phase 1 : SHAPE uniquement, aucune implémentation runtime.

const WALLET_REQUIRED = ['tenantId', 'currency', 'balanceCents', 'updatedAt'];
const LEDGER_ENTRY_REQUIRED = ['id', 'walletId', 'amountCents', 'currency', 'kind', 'createdAt'];
const INVOICE_REQUIRED = ['id', 'tenantId', 'currency', 'amountCents', 'status', 'periodStart', 'periodEnd'];

const LEDGER_KINDS = Object.freeze({
  TOPUP: 'topup',
  CONSUMPTION: 'consumption',
  REFUND: 'refund',
  ADJUSTMENT: 'adjustment',
  SUBSCRIPTION: 'subscription',
});

const INVOICE_STATUS = Object.freeze({
  DRAFT: 'draft',
  ISSUED: 'issued',
  PAID: 'paid',
  OVERDUE: 'overdue',
  VOID: 'void',
  REFUNDED: 'refunded',
});

export function validateWallet(w) {
  const errors = [];
  if (!w || typeof w !== 'object') return { ok: false, errors: ['wallet must be object'] };
  for (const f of WALLET_REQUIRED) if (!(f in w)) errors.push(`wallet missing: ${f}`);
  if (typeof w.balanceCents !== 'number') errors.push('balanceCents must be number');
  if (typeof w.currency !== 'string') errors.push('currency must be string (ISO 4217)');
  return { ok: errors.length === 0, errors };
}

export function validateLedgerEntry(e) {
  const errors = [];
  if (!e || typeof e !== 'object') return { ok: false, errors: ['entry must be object'] };
  for (const f of LEDGER_ENTRY_REQUIRED) if (!(f in e)) errors.push(`entry missing: ${f}`);
  if (typeof e.amountCents !== 'number') errors.push('amountCents must be number');
  if (e.kind && !Object.values(LEDGER_KINDS).includes(e.kind)) errors.push(`kind invalid: ${e.kind}`);
  return { ok: errors.length === 0, errors };
}

export function validateInvoice(i) {
  const errors = [];
  if (!i || typeof i !== 'object') return { ok: false, errors: ['invoice must be object'] };
  for (const f of INVOICE_REQUIRED) if (!(f in i)) errors.push(`invoice missing: ${f}`);
  if (typeof i.amountCents !== 'number') errors.push('amountCents must be number');
  if (i.status && !Object.values(INVOICE_STATUS).includes(i.status)) errors.push(`status invalid: ${i.status}`);
  return { ok: errors.length === 0, errors };
}

export {
  LEDGER_KINDS,
  INVOICE_STATUS,
};

export const BILLING_CONTRACT_REQUIRED_WALLET = Object.freeze([...WALLET_REQUIRED]);
export const BILLING_CONTRACT_REQUIRED_LEDGER = Object.freeze([...LEDGER_ENTRY_REQUIRED]);
export const BILLING_CONTRACT_REQUIRED_INVOICE = Object.freeze([...INVOICE_REQUIRED]);
