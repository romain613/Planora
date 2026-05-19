// server/shared/auth/context.js
// AuthContext : représentation immutable de l'identité d'une requête.
// 4 niveaux hiérarchiques : SUPRA → SUPRO → CLIENT → USER (cf. Audits 3, 10, 11).
//
// WRAP-only : aucune intégration runtime live Sprint 2.
// Création via factories `makeAuthContext()` — toujours deepFreeze.

import { deepFreeze } from '../utils/deepFreeze.js';

// Levels stricts — ne pas ajouter sans review architecture
export const LEVELS = Object.freeze({
  ANONYMOUS: 'anonymous',
  USER: 'user',
  CLIENT: 'client',
  SUPRO: 'supro',
  SUPRA: 'supra',
});

const LEVEL_RANK = Object.freeze({
  anonymous: 0,
  user: 10,
  client: 20,
  supro: 30,
  supra: 40,
});

/**
 * Crée un AuthContext immutable.
 *
 * @param {object} opts
 * @param {string} opts.level - LEVELS.*
 * @param {string} [opts.userId]
 * @param {string} [opts.clientId] - le CLIENT (entreprise) auquel le user appartient
 * @param {string} [opts.suproId] - le SUPRO (opérateur télécom) parent
 * @param {string} [opts.role] - rôle métier ("admin", "owner", "viewer", etc.)
 * @param {string[]} [opts.permissions]
 * @param {string[]} [opts.features] - feature flags activés
 * @param {string} [opts.sessionId]
 * @param {string} [opts.correlationId]
 * @returns {object} deeply-frozen AuthContext
 */
export function makeAuthContext(opts = {}) {
  if (!opts.level || !(opts.level in LEVEL_RANK)) {
    throw new TypeError(`makeAuthContext: invalid level "${opts.level}"`);
  }
  const ctx = {
    level: opts.level,
    userId: opts.userId || null,
    clientId: opts.clientId || null,
    suproId: opts.suproId || null,
    role: opts.role || null,
    permissions: Array.isArray(opts.permissions) ? [...opts.permissions] : [],
    features: Array.isArray(opts.features) ? [...opts.features] : [],
    sessionId: opts.sessionId || null,
    correlationId: opts.correlationId || null,
    createdAt: Date.now(),
  };
  return deepFreeze(ctx);
}

/**
 * Crée un AuthContext anonyme (pre-auth).
 */
export function makeAnonymousContext(correlationId = null) {
  return makeAuthContext({ level: LEVELS.ANONYMOUS, correlationId });
}

/**
 * Vrai si le ctx satisfait au minimum le rang demandé.
 * Ex : isAtLeast(ctx, "user") = true si user/client/supro/supra
 */
export function isAtLeast(ctx, level) {
  if (!ctx || !ctx.level) return false;
  const needed = LEVEL_RANK[level];
  if (needed === undefined) throw new TypeError(`isAtLeast: invalid level "${level}"`);
  return LEVEL_RANK[ctx.level] >= needed;
}

/**
 * Vrai si ctx est authentifié (pas anonymous).
 */
export function isAuthenticated(ctx) {
  return !!(ctx && ctx.level && ctx.level !== LEVELS.ANONYMOUS);
}

/**
 * Vrai si ctx possède toutes les permissions demandées.
 */
export function hasPermissions(ctx, required) {
  if (!ctx || !Array.isArray(ctx.permissions)) return false;
  const list = Array.isArray(required) ? required : [required];
  return list.every((p) => ctx.permissions.includes(p));
}

/**
 * Vrai si le feature flag est actif pour ce ctx.
 */
export function hasFeature(ctx, feature) {
  if (!ctx || !Array.isArray(ctx.features)) return false;
  return ctx.features.includes(feature);
}

export const LEVEL_RANK_MAP = LEVEL_RANK;
