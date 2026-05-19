// server/shared/errors/AppError.js
// Base class pour toutes les erreurs applicatives Phase 1+.
//
// Garanties :
//   - safeMessage : sûr à exposer au client (pas de secret)
//   - details : optionnels, traçables, jamais utilisés dans response client tels quels
//   - correlationId : pour cross-référence logs/audit
//   - timestamp : ISO 8601 string
//   - serialization safe : toJSON() retire les internes sensibles
//   - operator-grade : utilise Error.captureStackTrace pour stacks propres

import { getErrorSpec } from './errorCodes.js';

export class AppError extends Error {
  /**
   * @param {string} code - cf. errorCodes.js
   * @param {object} [opts]
   * @param {string} [opts.safeMessage] - override safeMessage du registry
   * @param {number} [opts.status] - override HTTP status
   * @param {object} [opts.details] - meta opérateur (ne jamais expose tel quel client)
   * @param {string} [opts.correlationId]
   * @param {Error} [opts.cause]
   */
  constructor(code, opts = {}) {
    const spec = getErrorSpec(code);
    const safeMessage = opts.safeMessage || spec.safeMessage;

    super(safeMessage);
    this.name = 'AppError';
    this.code = spec.code;
    this.status = opts.status || spec.status;
    this.safeMessage = safeMessage;
    this.details = opts.details || null;
    this.correlationId = opts.correlationId || null;
    this.timestamp = new Date().toISOString();

    if (opts.cause !== undefined) {
      this.cause = opts.cause;
    }

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Représentation safe-to-send au client.
   * Exclut : stack, details (opérateur seulement), cause.
   */
  toClientJSON() {
    return {
      error: {
        code: this.code,
        message: this.safeMessage,
        status: this.status,
        correlationId: this.correlationId,
        timestamp: this.timestamp,
      },
    };
  }

  /**
   * Représentation complète pour logs/audit (opérateur).
   * Inclut details + stack + cause.
   */
  toLogJSON() {
    return {
      name: this.name,
      code: this.code,
      status: this.status,
      safeMessage: this.safeMessage,
      details: this.details,
      correlationId: this.correlationId,
      timestamp: this.timestamp,
      stack: this.stack,
      cause: this.cause ? String(this.cause) : null,
    };
  }

  /**
   * Sérialisation par défaut = client safe.
   * (Pour les flows qui font JSON.stringify(err) directement.)
   */
  toJSON() {
    return this.toClientJSON();
  }

  /**
   * Helper static : wrap n'importe quelle Error en AppError INTERNAL si pas déjà AppError.
   */
  static wrap(err, fallbackCode = 'INTERNAL') {
    if (err instanceof AppError) return err;
    const message = (err && err.message) || 'Unknown error';
    return new AppError(fallbackCode, {
      safeMessage: 'Erreur interne',
      details: { originalMessage: message, originalName: err && err.name },
      cause: err,
    });
  }
}
