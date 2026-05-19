// server/shared/errors/index.js
export { AppError } from './AppError.js';
export { ERROR_CODES, getErrorSpec, listErrorCodes } from './errorCodes.js';
export {
  BadRequest,
  ValidationFailed,
  MalformedPayload,
  Unauthenticated,
  InvalidCredentials,
  TokenExpired,
  TokenInvalid,
  Forbidden,
  RoleInsufficient,
  TenantMismatch,
  FeatureDisabled,
  NotFound,
  TenantNotFound,
  Conflict,
  Duplicate,
  TenantModeNotActive,
  Unprocessable,
  RateLimited,
  Internal,
  DbError,
  ProviderError,
  ServiceUnavailable,
  ProviderDown,
} from './httpErrors.js';
