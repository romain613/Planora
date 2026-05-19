// server/shared/contracts/tenant.contract.js
// Contract Tenant — SUPRA / SUPRO / CLIENT / USER hierarchy.

const SUPRA_REQUIRED = ['id', 'name', 'createdAt'];
const SUPRO_REQUIRED = ['id', 'name', 'tier', 'createdAt'];
const CLIENT_REQUIRED = ['id', 'name', 'suproId', 'createdAt'];
const USER_REQUIRED = ['id', 'clientId', 'email', 'role', 'createdAt'];

const SUPRO_TIERS = Object.freeze({
  STANDARD: 'standard',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise',
});

const USER_ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
  OWNER: 'owner',
  VIEWER: 'viewer',
});

function validateShape(entity, required, label) {
  const errors = [];
  if (!entity || typeof entity !== 'object') {
    return { ok: false, errors: [`${label} must be object`] };
  }
  for (const f of required) {
    if (!(f in entity)) errors.push(`${label} missing: ${f}`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateSupra(s) {
  return validateShape(s, SUPRA_REQUIRED, 'supra');
}

export function validateSupro(s) {
  const base = validateShape(s, SUPRO_REQUIRED, 'supro');
  if (s?.tier && !Object.values(SUPRO_TIERS).includes(s.tier)) {
    base.errors.push(`supro.tier invalid: ${s.tier}`);
    base.ok = false;
  }
  return base;
}

export function validateClient(c) {
  return validateShape(c, CLIENT_REQUIRED, 'client');
}

export function validateUser(u) {
  const base = validateShape(u, USER_REQUIRED, 'user');
  if (u?.role && !Object.values(USER_ROLES).includes(u.role)) {
    base.errors.push(`user.role invalid: ${u.role}`);
    base.ok = false;
  }
  return base;
}

/**
 * Vérifie cohérence hiérarchique : client.suproId existe dans supros, user.clientId dans clients, etc.
 */
export function validateHierarchy({ supros = [], clients = [], users = [] }) {
  const errors = [];
  const suproIds = new Set(supros.map((s) => s.id));
  const clientIds = new Set(clients.map((c) => c.id));

  for (const c of clients) {
    if (!suproIds.has(c.suproId)) {
      errors.push(`client ${c.id}: suproId ${c.suproId} not found`);
    }
  }
  for (const u of users) {
    if (!clientIds.has(u.clientId)) {
      errors.push(`user ${u.id}: clientId ${u.clientId} not found`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export {
  SUPRO_TIERS,
  USER_ROLES,
};

export const TENANT_CONTRACT_REQUIRED_SUPRO = Object.freeze([...SUPRO_REQUIRED]);
export const TENANT_CONTRACT_REQUIRED_CLIENT = Object.freeze([...CLIENT_REQUIRED]);
export const TENANT_CONTRACT_REQUIRED_USER = Object.freeze([...USER_REQUIRED]);
