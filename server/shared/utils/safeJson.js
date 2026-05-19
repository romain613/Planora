// server/shared/utils/safeJson.js
// JSON.stringify safe : gère cycles, BigInt, Error, Map, Set, Symbol, fonction.
// Renvoie toujours une string valide (jamais throw).

function _replacer(seen) {
  return function replacer(_key, value) {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'bigint') return value.toString();
      if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
      if (typeof value === 'symbol') return value.toString();
      if (typeof value === 'undefined') return undefined;
      return value;
    }
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
        ...((value.cause !== undefined) ? { cause: value.cause } : {}),
      };
    }
    if (value instanceof Map) {
      const obj = {};
      for (const [k, v] of value) {
        obj[String(k)] = v;
      }
      return obj;
    }
    if (value instanceof Set) {
      return Array.from(value);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof RegExp) {
      return value.toString();
    }
    if (Buffer.isBuffer && Buffer.isBuffer(value)) {
      return `[Buffer length=${value.length}]`;
    }
    return value;
  };
}

/**
 * Stringify sûr.
 * @param {any} value
 * @param {number|string} [indent] - 2nd arg classique de JSON.stringify
 * @returns {string}
 */
export function safeStringify(value, indent = 0) {
  try {
    return JSON.stringify(value, _replacer(new WeakSet()), indent);
  } catch (e) {
    return `[safeStringify error: ${e.message}]`;
  }
}

/**
 * Parse sûr : retourne fallback si erreur (jamais throw).
 * @param {string} text
 * @param {any} [fallback=null]
 */
export function safeParse(text, fallback = null) {
  if (typeof text !== 'string') return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
