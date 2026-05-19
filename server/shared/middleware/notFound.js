// server/shared/middleware/notFound.js
// 404 handler standardisé — émet NotFound via AppError pour pipeline cohérent.

import { NotFound } from '../errors/httpErrors.js';

/**
 * Factory middleware Express 404.
 * À monter en dernier (catch-all). Émet NotFound vers errorHandler.
 *
 * @param {object} [opts]
 * @param {string} [opts.message='Endpoint introuvable'] - safeMessage custom
 */
export function notFoundMiddleware(opts = {}) {
  const message = opts.message || 'Endpoint introuvable';

  return function notFoundMw(req, res, next) {
    const correlationId = (req && req.requestId) || null;
    const err = new NotFound({
      safeMessage: message,
      details: { method: req && req.method, url: req && req.url },
      correlationId,
    });
    if (typeof next === 'function') {
      next(err);
    } else if (res && typeof res.status === 'function' && typeof res.json === 'function') {
      res.status(404).json(err.toClientJSON());
    }
  };
}
