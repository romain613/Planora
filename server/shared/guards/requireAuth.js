// server/shared/guards/requireAuth.js
// Guard Express : refuse 401 si req.authCtx absent ou anonymous.
// WRAP-only : pas branché runtime Sprint 2.

import { isAuthenticated } from '../auth/context.js';
import { Unauthenticated } from '../errors/httpErrors.js';

/**
 * Factory guard.
 * @param {object} [opts]
 * @param {string} [opts.message='Authentification requise']
 * @returns {(req, res, next) => void}
 */
export function requireAuth(opts = {}) {
  const safeMessage = opts.message || 'Authentification requise';
  return function requireAuthMw(req, res, next) {
    if (!isAuthenticated(req && req.authCtx)) {
      const err = new Unauthenticated({
        safeMessage,
        correlationId: req && req.requestId,
      });
      if (typeof next === 'function') return next(err);
      throw err;
    }
    if (typeof next === 'function') next();
  };
}
