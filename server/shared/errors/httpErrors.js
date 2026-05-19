// server/shared/errors/httpErrors.js
// Sous-classes typées d'AppError pour les codes HTTP les plus fréquents.
// Sucre syntaxique : `throw new BadRequest({ details })`
// au lieu de : `throw new AppError('BAD_REQUEST', { details })`.

import { AppError } from './AppError.js';

function _make(code, defaultName) {
  return class extends AppError {
    constructor(opts = {}) {
      super(code, opts);
      this.name = defaultName;
    }
  };
}

export const BadRequest = _make('BAD_REQUEST', 'BadRequest');
export const ValidationFailed = _make('VALIDATION_FAILED', 'ValidationFailed');
export const MalformedPayload = _make('MALFORMED_PAYLOAD', 'MalformedPayload');

export const Unauthenticated = _make('UNAUTHENTICATED', 'Unauthenticated');
export const InvalidCredentials = _make('INVALID_CREDENTIALS', 'InvalidCredentials');
export const TokenExpired = _make('TOKEN_EXPIRED', 'TokenExpired');
export const TokenInvalid = _make('TOKEN_INVALID', 'TokenInvalid');

export const Forbidden = _make('FORBIDDEN', 'Forbidden');
export const RoleInsufficient = _make('ROLE_INSUFFICIENT', 'RoleInsufficient');
export const TenantMismatch = _make('TENANT_MISMATCH', 'TenantMismatch');
export const FeatureDisabled = _make('FEATURE_DISABLED', 'FeatureDisabled');

export const NotFound = _make('NOT_FOUND', 'NotFound');
export const TenantNotFound = _make('TENANT_NOT_FOUND', 'TenantNotFound');

export const Conflict = _make('CONFLICT', 'Conflict');
export const Duplicate = _make('DUPLICATE', 'Duplicate');
export const TenantModeNotActive = _make('TENANT_MODE_NOT_ACTIVE', 'TenantModeNotActive');

export const Unprocessable = _make('UNPROCESSABLE', 'Unprocessable');
export const RateLimited = _make('RATE_LIMITED', 'RateLimited');

export const Internal = _make('INTERNAL', 'Internal');
export const DbError = _make('DB_ERROR', 'DbError');
export const ProviderError = _make('PROVIDER_ERROR', 'ProviderError');

export const ServiceUnavailable = _make('SERVICE_UNAVAILABLE', 'ServiceUnavailable');
export const ProviderDown = _make('PROVIDER_DOWN', 'ProviderDown');
