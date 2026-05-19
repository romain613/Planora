// server/shared/contracts/auth.contract.js
// Contract Auth — AuthContext + SessionContext + TenantContext shape validation.

const AUTH_REQUIRED = ['level', 'permissions', 'features'];
const TENANT_REQUIRED = ['scope', 'tenantMode', 'features'];
const SESSION_REQUIRED = ['type', 'claims'];

const AUTH_LEVELS = Object.freeze(['anonymous', 'user', 'client', 'supro', 'supra']);
const TENANT_SCOPES = Object.freeze(['platform', 'supro', 'client']);
const SESSION_TYPES = Object.freeze(['cookie', 'jwt', 'api_key', 'provider', 'anonymous']);

export function validateAuthContext(ctx) {
  const errors = [];
  if (!ctx || typeof ctx !== 'object') return { ok: false, errors: ['authCtx must be object'] };

  for (const f of AUTH_REQUIRED) {
    if (!(f in ctx)) errors.push(`authCtx missing: ${f}`);
  }
  if (ctx.level && !AUTH_LEVELS.includes(ctx.level)) {
    errors.push(`authCtx.level invalid: ${ctx.level}`);
  }
  if (ctx.permissions !== undefined && !Array.isArray(ctx.permissions)) {
    errors.push('authCtx.permissions must be array');
  }
  if (ctx.features !== undefined && !Array.isArray(ctx.features)) {
    errors.push('authCtx.features must be array');
  }

  return { ok: errors.length === 0, errors };
}

export function validateTenantContext(ctx) {
  const errors = [];
  if (!ctx || typeof ctx !== 'object') return { ok: false, errors: ['tenantCtx must be object'] };

  for (const f of TENANT_REQUIRED) {
    if (!(f in ctx)) errors.push(`tenantCtx missing: ${f}`);
  }
  if (ctx.scope && !TENANT_SCOPES.includes(ctx.scope)) {
    errors.push(`tenantCtx.scope invalid: ${ctx.scope}`);
  }
  if (ctx.scope === 'supro' && !ctx.suproId) {
    errors.push('tenantCtx scope=supro requires suproId');
  }
  if (ctx.scope === 'client' && !ctx.clientId) {
    errors.push('tenantCtx scope=client requires clientId');
  }

  return { ok: errors.length === 0, errors };
}

export function validateSessionContext(ctx) {
  const errors = [];
  if (!ctx || typeof ctx !== 'object') return { ok: false, errors: ['sessionCtx must be object'] };

  for (const f of SESSION_REQUIRED) {
    if (!(f in ctx)) errors.push(`sessionCtx missing: ${f}`);
  }
  if (ctx.type && !SESSION_TYPES.includes(ctx.type)) {
    errors.push(`sessionCtx.type invalid: ${ctx.type}`);
  }
  if (ctx.expiresAt !== undefined && ctx.expiresAt !== null && typeof ctx.expiresAt !== 'number') {
    errors.push('sessionCtx.expiresAt must be number or null');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Vérifie cohérence triple-context (auth + tenant + session) pour une requête entrante.
 */
export function validateRequestContextTriad({ authCtx, tenantCtx, sessionCtx }) {
  const errors = [];
  const a = validateAuthContext(authCtx);
  const t = validateTenantContext(tenantCtx);
  const s = validateSessionContext(sessionCtx);

  if (!a.ok) errors.push(...a.errors);
  if (!t.ok) errors.push(...t.errors);
  if (!s.ok) errors.push(...s.errors);

  // Cohérence : user level requiert clientId au moins via tenantCtx
  if (authCtx?.level === 'user' && tenantCtx?.scope !== 'client') {
    errors.push('triad: user level requires tenantCtx.scope=client');
  }
  // anonymous level → session anonymous attendu
  if (authCtx?.level === 'anonymous' && sessionCtx?.type !== 'anonymous') {
    errors.push('triad: anonymous level requires sessionCtx.type=anonymous');
  }

  return { ok: errors.length === 0, errors };
}

export {
  AUTH_LEVELS,
  TENANT_SCOPES,
  SESSION_TYPES,
};

export const AUTH_CONTRACT_REQUIRED = Object.freeze([...AUTH_REQUIRED]);
export const TENANT_CONTRACT_REQUIRED = Object.freeze([...TENANT_REQUIRED]);
export const SESSION_CONTRACT_REQUIRED = Object.freeze([...SESSION_REQUIRED]);
