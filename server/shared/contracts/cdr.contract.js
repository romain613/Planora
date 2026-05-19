// server/shared/contracts/cdr.contract.js
// Contract CDR (Call Detail Record) — shape stable Phase 5+ billing aggregation.

const CDR_REQUIRED = [
  'callId',
  'providerId',
  'tenantId',
  'direction',
  'from',
  'to',
  'billableSec',
];
const CDR_NUMERIC = ['billableSec', 'ratedCost', 'startedAt', 'answeredAt', 'endedAt'];

const CDR_DIRECTIONS = Object.freeze(['outbound', 'inbound', 'internal']);

/**
 * Valide qu'un CDR est conforme.
 */
export function validateCdr(cdr) {
  const errors = [];
  if (!cdr || typeof cdr !== 'object') return { ok: false, errors: ['cdr must be object'] };

  for (const f of CDR_REQUIRED) {
    if (!(f in cdr)) errors.push(`cdr missing: ${f}`);
  }

  for (const f of CDR_NUMERIC) {
    if (cdr[f] !== undefined && cdr[f] !== null && typeof cdr[f] !== 'number') {
      errors.push(`cdr.${f} must be number or null`);
    }
  }

  if (cdr.direction && !CDR_DIRECTIONS.includes(cdr.direction)) {
    errors.push(`cdr.direction invalid: ${cdr.direction}`);
  }

  if (cdr.billableSec !== undefined && typeof cdr.billableSec === 'number' && cdr.billableSec < 0) {
    errors.push('cdr.billableSec must be >= 0');
  }

  if (cdr.ratedCost !== undefined && cdr.ratedCost !== null) {
    if (!cdr.currency || typeof cdr.currency !== 'string' || cdr.currency.length !== 3) {
      errors.push('cdr.ratedCost requires currency (ISO 4217, 3 chars)');
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Vérifie qu'un batch de CDR partage le même tenantId (utile aggregation).
 */
export function validateCdrBatchTenantConsistency(cdrs) {
  if (!Array.isArray(cdrs) || cdrs.length === 0) {
    return { ok: false, errors: ['batch must be non-empty array'] };
  }
  const tenantIds = new Set(cdrs.map((c) => c.tenantId));
  if (tenantIds.size > 1) {
    return { ok: false, errors: [`mixed tenantIds in batch: ${Array.from(tenantIds).join(', ')}`] };
  }
  return { ok: true, errors: [] };
}

export const CDR_CONTRACT_REQUIRED = Object.freeze([...CDR_REQUIRED]);
export const CDR_DIRECTIONS_LIST = CDR_DIRECTIONS;
