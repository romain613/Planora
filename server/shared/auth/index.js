// server/shared/auth/index.js
export {
  LEVELS,
  LEVEL_RANK_MAP,
  makeAuthContext,
  makeAnonymousContext,
  isAtLeast,
  isAuthenticated,
  hasPermissions,
  hasFeature,
} from './context.js';

export {
  TENANT_SCOPES,
  makeTenantContext,
  makePlatformContext,
  isTenantClient,
  isTenantSupro,
  tenantHasFeature,
} from './tenantContext.js';

export {
  SESSION_TYPES,
  makeSessionContext,
  makeAnonymousSession,
  isExpired,
  ttlMs,
} from './sessionContext.js';
