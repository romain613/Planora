// server/shared/providers/types/numberTypes.js
// Shapes pour numéros DID (Direct Inward Dialing).

import { deepFreeze } from '../../utils/deepFreeze.js';

export const NUMBER_TYPE = Object.freeze({
  LOCAL: 'local',
  NATIONAL: 'national',
  MOBILE: 'mobile',
  TOLL_FREE: 'toll-free',
  SHORTCODE: 'shortcode',
  INTERNATIONAL: 'international',
});

export const NUMBER_STATUS = Object.freeze({
  AVAILABLE: 'available',
  PROVISIONED: 'provisioned',
  RELEASED: 'released',
  PENDING_PORT: 'pending-port',
  SUSPENDED: 'suspended',
});

/**
 * Crée un PhoneNumber normalized (immutable).
 */
export function makePhoneNumber(opts = {}) {
  if (!opts.e164 || typeof opts.e164 !== 'string') {
    throw new TypeError('makePhoneNumber: e164 required string');
  }
  return deepFreeze({
    e164: opts.e164,
    countryIso: opts.countryIso || null,
    numberType: opts.numberType || NUMBER_TYPE.LOCAL,
    status: opts.status || NUMBER_STATUS.AVAILABLE,
    providerId: opts.providerId || null,
    providerNumberId: opts.providerNumberId || null,
    tenantId: opts.tenantId || null,
    capabilities: Array.isArray(opts.capabilities) ? [...opts.capabilities] : [],
    provisionedAt: typeof opts.provisionedAt === 'number' ? opts.provisionedAt : null,
    monthlyCost: typeof opts.monthlyCost === 'number' ? opts.monthlyCost : null,
    currency: opts.currency || null,
    meta: opts.meta && typeof opts.meta === 'object' ? { ...opts.meta } : {},
  });
}
