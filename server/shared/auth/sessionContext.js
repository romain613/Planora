// server/shared/auth/sessionContext.js
// SessionContext : abstraction d'une session active.
// Compatible JWT-future + API-key-future + cookie-session (legacy).
//
// WRAP-only Sprint 2 : pas de validation cryptographique active.
// Sprint 2 = uniquement structure + helpers immutables.

import { deepFreeze } from '../utils/deepFreeze.js';

export const SESSION_TYPES = Object.freeze({
  COOKIE: 'cookie', // session classique cookie + DB (legacy)
  JWT: 'jwt',
  API_KEY: 'api_key',
  PROVIDER: 'provider', // webhook signature Twilio / Google / etc.
  ANONYMOUS: 'anonymous',
});

/**
 * Crée un SessionContext immutable.
 * @param {object} opts
 * @param {string} opts.type - SESSION_TYPES.*
 * @param {string} [opts.id] - identifiant session
 * @param {number} [opts.issuedAt] - epoch ms
 * @param {number} [opts.expiresAt] - epoch ms
 * @param {string} [opts.subject] - userId/clientId/etc.
 * @param {object} [opts.claims] - claims JWT-like opaques
 * @param {string} [opts.fingerprint] - device/UA hash (opaque, redactable)
 * @returns {object} deeply-frozen SessionContext
 */
export function makeSessionContext(opts = {}) {
  if (!opts.type || !Object.values(SESSION_TYPES).includes(opts.type)) {
    throw new TypeError(`makeSessionContext: invalid type "${opts.type}"`);
  }
  const ctx = {
    type: opts.type,
    id: opts.id || null,
    issuedAt: typeof opts.issuedAt === 'number' ? opts.issuedAt : null,
    expiresAt: typeof opts.expiresAt === 'number' ? opts.expiresAt : null,
    subject: opts.subject || null,
    claims: opts.claims && typeof opts.claims === 'object' ? { ...opts.claims } : {},
    fingerprint: opts.fingerprint || null,
  };
  return deepFreeze(ctx);
}

/**
 * Crée une session anonyme (avant login).
 */
export function makeAnonymousSession() {
  return makeSessionContext({ type: SESSION_TYPES.ANONYMOUS });
}

/**
 * Vrai si la session est expirée selon expiresAt.
 * @param {object} sessionCtx
 * @param {number} [now=Date.now()]
 */
export function isExpired(sessionCtx, now = Date.now()) {
  if (!sessionCtx) return true;
  if (sessionCtx.type === SESSION_TYPES.ANONYMOUS) return false;
  if (typeof sessionCtx.expiresAt !== 'number') return false;
  return now >= sessionCtx.expiresAt;
}

/**
 * TTL restant en ms (peut être négatif si expirée).
 */
export function ttlMs(sessionCtx, now = Date.now()) {
  if (!sessionCtx || typeof sessionCtx.expiresAt !== 'number') return Infinity;
  return sessionCtx.expiresAt - now;
}
