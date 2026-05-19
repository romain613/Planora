// server/shared/logging/logger.js
// Logger structuré JSON, level-aware, redaction-aware.
// WRAP-only : ne s'auto-installe NULLE PART. Pas de transport externe (Sprint 2).
// Stub par défaut : tout en stdout/stderr via console (capturable en test).

import { redact } from './redaction.js';
import { safeStringify } from '../utils/safeJson.js';

const LEVELS = Object.freeze({ trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 });

function _resolveLevel(name) {
  if (typeof name === 'number') return name;
  if (typeof name === 'string' && name in LEVELS) return LEVELS[name];
  return LEVELS.info;
}

/**
 * Crée un logger avec context bindings.
 * @param {object} [opts]
 * @param {string|number} [opts.level='info']
 * @param {object} [opts.bindings] - context auto-merge dans chaque log line
 * @param {Function} [opts.write] - écrivain custom (string => void), défaut = console.*
 * @param {string[]} [opts.sensitiveKeys] - clés additionnelles à rediger
 */
export function createLogger(opts = {}) {
  const threshold = _resolveLevel(opts.level || 'info');
  const bindings = opts.bindings || {};
  const write = opts.write;
  const sensitiveKeys = opts.sensitiveKeys || [];

  function _emit(levelName, payload) {
    const lvl = LEVELS[levelName];
    if (lvl < threshold) return;

    const line = {
      ts: new Date().toISOString(),
      level: levelName,
      ...bindings,
      ...(payload && typeof payload === 'object' ? payload : { msg: String(payload) }),
    };
    const safe = redact(line, { sensitiveKeys });
    const str = safeStringify(safe);

    if (write) {
      write(str);
    } else {
      const sink = lvl >= LEVELS.warn ? console.error : console.log;
      sink(str);
    }
  }

  function _bind(extra) {
    return createLogger({
      level: threshold,
      bindings: { ...bindings, ...extra },
      write,
      sensitiveKeys,
    });
  }

  return {
    trace: (p) => _emit('trace', p),
    debug: (p) => _emit('debug', p),
    info: (p) => _emit('info', p),
    warn: (p) => _emit('warn', p),
    error: (p) => _emit('error', p),
    fatal: (p) => _emit('fatal', p),
    child: _bind,
    bind: _bind, // alias
    levels: LEVELS,
  };
}

export const LEVELS_MAP = LEVELS;
