// server/shared/middleware/requestContext.js
// AsyncLocalStorage-based request context propagation.
// Permet d'accéder au context (requestId, authCtx, tenantCtx) depuis n'importe quelle fonction
// downstream sans propager explicitement les paramètres.
//
// WRAP-only : pas branché runtime Sprint 2.

import { AsyncLocalStorage } from 'node:async_hooks';

const _als = new AsyncLocalStorage();

/**
 * Exécute fn dans un contexte ALS dont store = context fourni.
 * @param {object} context - typiquement { requestId, authCtx, tenantCtx, sessionCtx }
 * @param {Function} fn - sync ou async
 * @returns {any} retour de fn
 */
export function runWithContext(context, fn) {
  if (!context || typeof context !== 'object') {
    throw new TypeError('runWithContext: context must be object');
  }
  if (typeof fn !== 'function') {
    throw new TypeError('runWithContext: fn must be function');
  }
  return _als.run(context, fn);
}

/**
 * Retourne le context courant ou null si hors-context.
 */
export function getCurrentContext() {
  return _als.getStore() || null;
}

/**
 * Retourne une valeur précise du context courant (raccourci).
 */
export function getContextValue(key) {
  const store = _als.getStore();
  if (!store) return undefined;
  return store[key];
}

/**
 * Factory middleware Express : associe req.* à un store ALS pour le downstream.
 * @param {object} [opts]
 * @param {string[]} [opts.copyFromReq] - clés de req à hoister dans le store (default: ['requestId','authCtx','tenantCtx','sessionCtx'])
 */
export function requestContextMiddleware(opts = {}) {
  const keys = Array.isArray(opts.copyFromReq) && opts.copyFromReq.length > 0
    ? opts.copyFromReq
    : ['requestId', 'authCtx', 'tenantCtx', 'sessionCtx'];

  return function requestContextMw(req, res, next) {
    const ctx = {};
    if (req) {
      for (const k of keys) {
        if (k in req) ctx[k] = req[k];
      }
    }
    _als.run(ctx, () => {
      if (typeof next === 'function') next();
    });
  };
}

/**
 * Pour les tests unitaires : reset le store courant (no-op si hors run).
 */
export function _internalGetStorage() {
  // Exposé pour test introspection uniquement.
  return _als;
}
