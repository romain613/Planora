// server/shared/guards/requireRole.js
// Guard Express : vérifie niveau hiérarchique minimum OU appartenance à liste de rôles.
//
// 2 modes :
//   - level: 'user'|'client'|'supro'|'supra'  → check via isAtLeast(authCtx, level)
//   - roles: ['admin','owner']                → check via authCtx.role inclus dans liste

import { isAtLeast } from '../auth/context.js';
import { RoleInsufficient, Unauthenticated } from '../errors/httpErrors.js';

/**
 * Factory guard.
 * @param {object} opts
 * @param {string} [opts.level] - niveau hiérarchique minimum
 * @param {string[]} [opts.roles] - rôles autorisés (any match)
 * @param {string} [opts.message]
 */
export function requireRole(opts = {}) {
  const level = opts.level;
  const roles = Array.isArray(opts.roles) ? opts.roles : null;

  if (!level && !roles) {
    throw new TypeError('requireRole: opts.level or opts.roles required');
  }

  return function requireRoleMw(req, res, next) {
    const ctx = req && req.authCtx;
    if (!ctx || ctx.level === 'anonymous') {
      const err = new Unauthenticated({ correlationId: req && req.requestId });
      if (typeof next === 'function') return next(err);
      throw err;
    }

    if (level && !isAtLeast(ctx, level)) {
      const err = new RoleInsufficient({
        safeMessage: opts.message || `Niveau ${level} requis`,
        details: { required: level, actual: ctx.level },
        correlationId: req && req.requestId,
      });
      if (typeof next === 'function') return next(err);
      throw err;
    }

    if (roles && !roles.includes(ctx.role)) {
      const err = new RoleInsufficient({
        safeMessage: opts.message || 'Rôle insuffisant',
        details: { required: roles, actual: ctx.role },
        correlationId: req && req.requestId,
      });
      if (typeof next === 'function') return next(err);
      throw err;
    }

    if (typeof next === 'function') next();
  };
}
