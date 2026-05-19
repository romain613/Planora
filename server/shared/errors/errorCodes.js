// server/shared/errors/errorCodes.js
// Registry centralisé des codes d'erreur applicatifs.
// Convention : SCREAMING_SNAKE_CASE. Stable dans le temps (pas de rename).
//
// HTTP status par défaut associé — peut être override au throw.

export const ERROR_CODES = Object.freeze({
  // 400 — Client errors
  BAD_REQUEST: { code: 'BAD_REQUEST', status: 400, safeMessage: 'Requête invalide' },
  VALIDATION_FAILED: { code: 'VALIDATION_FAILED', status: 400, safeMessage: 'Validation échouée' },
  MALFORMED_PAYLOAD: { code: 'MALFORMED_PAYLOAD', status: 400, safeMessage: 'Payload mal formé' },

  // 401 — Authentication
  UNAUTHENTICATED: { code: 'UNAUTHENTICATED', status: 401, safeMessage: 'Authentification requise' },
  INVALID_CREDENTIALS: { code: 'INVALID_CREDENTIALS', status: 401, safeMessage: 'Identifiants invalides' },
  TOKEN_EXPIRED: { code: 'TOKEN_EXPIRED', status: 401, safeMessage: 'Token expiré' },
  TOKEN_INVALID: { code: 'TOKEN_INVALID', status: 401, safeMessage: 'Token invalide' },

  // 403 — Authorization
  FORBIDDEN: { code: 'FORBIDDEN', status: 403, safeMessage: 'Accès interdit' },
  ROLE_INSUFFICIENT: { code: 'ROLE_INSUFFICIENT', status: 403, safeMessage: 'Rôle insuffisant' },
  TENANT_MISMATCH: { code: 'TENANT_MISMATCH', status: 403, safeMessage: 'Tenant non autorisé' },
  FEATURE_DISABLED: { code: 'FEATURE_DISABLED', status: 403, safeMessage: 'Fonctionnalité désactivée' },

  // 404 — Not found
  NOT_FOUND: { code: 'NOT_FOUND', status: 404, safeMessage: 'Ressource introuvable' },
  TENANT_NOT_FOUND: { code: 'TENANT_NOT_FOUND', status: 404, safeMessage: 'Tenant introuvable' },

  // 409 — Conflict
  CONFLICT: { code: 'CONFLICT', status: 409, safeMessage: 'Conflit' },
  DUPLICATE: { code: 'DUPLICATE', status: 409, safeMessage: 'Doublon détecté' },
  TENANT_MODE_NOT_ACTIVE: { code: 'TENANT_MODE_NOT_ACTIVE', status: 409, safeMessage: 'Mode tenant non actif' },

  // 422 — Unprocessable
  UNPROCESSABLE: { code: 'UNPROCESSABLE', status: 422, safeMessage: 'Entité non traitable' },

  // 429 — Rate limit
  RATE_LIMITED: { code: 'RATE_LIMITED', status: 429, safeMessage: 'Trop de requêtes' },

  // 500 — Server errors
  INTERNAL: { code: 'INTERNAL', status: 500, safeMessage: 'Erreur interne' },
  DB_ERROR: { code: 'DB_ERROR', status: 500, safeMessage: 'Erreur base de données' },
  PROVIDER_ERROR: { code: 'PROVIDER_ERROR', status: 500, safeMessage: 'Erreur fournisseur externe' },

  // 503 — Service unavailable
  SERVICE_UNAVAILABLE: { code: 'SERVICE_UNAVAILABLE', status: 503, safeMessage: 'Service indisponible' },
  PROVIDER_DOWN: { code: 'PROVIDER_DOWN', status: 503, safeMessage: 'Fournisseur externe en panne' },
});

/**
 * Retourne l'entrée code/status/safeMessage pour un code donné.
 * Fallback INTERNAL si inconnu.
 */
export function getErrorSpec(code) {
  return ERROR_CODES[code] || ERROR_CODES.INTERNAL;
}

/**
 * Liste les codes disponibles.
 */
export function listErrorCodes() {
  return Object.keys(ERROR_CODES);
}
