// server/shared/logging/auditLogger.js
// Audit logger : trace structurée des actions opérateur/utilisateur.
// Pas branché runtime Sprint 2 — wrapper standalone.

import { redact } from './redaction.js';
import { safeStringify } from '../utils/safeJson.js';

/**
 * Crée un audit logger.
 * @param {object} [opts]
 * @param {string} [opts.source='shared.audit']
 * @param {Function} [opts.write] - sink personnalisé (string => void)
 * @param {string[]} [opts.sensitiveKeys]
 */
export function createAuditLogger(opts = {}) {
  const source = opts.source || 'shared.audit';
  const write = opts.write;
  const sensitiveKeys = opts.sensitiveKeys || [];

  function _emit(entry) {
    const line = {
      ts: new Date().toISOString(),
      source,
      ...entry,
    };
    const safe = redact(line, { sensitiveKeys });
    const str = safeStringify(safe);
    if (write) write(str);
    else console.log(str);
  }

  /**
   * Logge un événement audit.
   * @param {object} event
   * @param {string} event.action - verbe canonique (e.g. "user.login", "tenant.created")
   * @param {string} [event.actorType] - "supra"|"supro"|"client"|"user"|"system"
   * @param {string} [event.actorId]
   * @param {string} [event.tenantId]
   * @param {string} [event.targetType] - type d'entité affectée
   * @param {string} [event.targetId]
   * @param {string} [event.outcome] - "success"|"failure"|"denied"
   * @param {object} [event.meta] - données contextuelles (redactées)
   * @param {string} [event.correlationId]
   */
  function log(event) {
    if (!event || typeof event !== 'object') {
      throw new TypeError('auditLogger.log: event must be object');
    }
    if (!event.action || typeof event.action !== 'string') {
      throw new TypeError('auditLogger.log: event.action required string');
    }
    _emit({
      type: 'audit',
      action: event.action,
      actorType: event.actorType || null,
      actorId: event.actorId || null,
      tenantId: event.tenantId || null,
      targetType: event.targetType || null,
      targetId: event.targetId || null,
      outcome: event.outcome || 'success',
      meta: event.meta || null,
      correlationId: event.correlationId || null,
    });
  }

  return { log };
}
