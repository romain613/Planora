// server/shared/middleware/requestId.js
// Génère ou propage un correlation ID par requête HTTP.
// Compatible Express : signature (req, res, next).
// WRAP-only : ne s'auto-mount nulle part.

import { randomUUID } from 'node:crypto';

const DEFAULT_HEADER = 'x-request-id';

/**
 * Factory de middleware Express.
 * Reads incoming X-Request-Id header, OR generates a new UUID v4.
 * Sets req.requestId + res header X-Request-Id.
 *
 * @param {object} [opts]
 * @param {string} [opts.header='x-request-id']
 * @param {Function} [opts.generator] - () => string ; défaut = randomUUID
 * @returns {(req, res, next) => void}
 */
export function requestIdMiddleware(opts = {}) {
  const header = (opts.header || DEFAULT_HEADER).toLowerCase();
  const gen = typeof opts.generator === 'function' ? opts.generator : () => randomUUID();

  return function requestIdMw(req, res, next) {
    let id = req && req.headers && req.headers[header];
    if (!id || typeof id !== 'string' || id.length < 8) {
      id = gen();
    }
    if (req) req.requestId = id;
    if (res && typeof res.setHeader === 'function') {
      res.setHeader(header, id);
    }
    if (typeof next === 'function') next();
  };
}

/**
 * Helper standalone : génère un correlation id (utile hors-middleware).
 */
export function newCorrelationId() {
  return randomUUID();
}

export const DEFAULT_REQUEST_ID_HEADER = DEFAULT_HEADER;
