// server/shared/middleware/errorHandler.js
// Error handler Express uniforme.
// Convertit toute erreur en AppError, log via logger fourni, répond JSON client-safe.
//
// WRAP-only : pas branché runtime Sprint 2.

import { AppError } from '../errors/AppError.js';

/**
 * Factory error handler Express (signature 4-args : err, req, res, next).
 *
 * @param {object} [opts]
 * @param {object} [opts.logger] - logger.error(payload) ; défaut = console.error
 * @param {Function} [opts.includeStack] - (env) => boolean ; défaut = NODE_ENV!='production'
 * @param {string} [opts.fallbackCode='INTERNAL']
 * @returns {(err, req, res, next) => void}
 */
export function errorHandlerMiddleware(opts = {}) {
  const logger = opts.logger || { error: console.error };
  const includeStack = typeof opts.includeStack === 'function'
    ? opts.includeStack
    : () => process.env.NODE_ENV !== 'production';
  const fallbackCode = opts.fallbackCode || 'INTERNAL';

  return function errorHandlerMw(err, req, res, next) {
    const correlationId = (req && req.requestId) || null;
    const appErr = err instanceof AppError
      ? err
      : AppError.wrap(err, fallbackCode);

    // Attache correlationId si manquant
    if (!appErr.correlationId && correlationId) {
      Object.defineProperty(appErr, 'correlationId', { value: correlationId, enumerable: true });
    }

    // Logging opérateur (full details)
    try {
      logger.error({
        msg: 'request_failed',
        method: req && req.method,
        url: req && req.url,
        ...appErr.toLogJSON(),
      });
    } catch {
      // logger break must not crash response
    }

    // Response client-safe
    if (res && typeof res.status === 'function' && typeof res.json === 'function' && !res.headersSent) {
      const payload = appErr.toClientJSON();
      if (includeStack()) {
        payload.error._stack = appErr.stack;
      }
      res.status(appErr.status).json(payload);
    } else if (typeof next === 'function') {
      next(appErr);
    }
  };
}
