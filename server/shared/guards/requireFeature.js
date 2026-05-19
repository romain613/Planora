// server/shared/guards/requireFeature.js
// Guard Express : refuse 403 FEATURE_DISABLED si feature flag absent.
//
// Sources de vérité (dans cet ordre) :
//   1. authCtx.features
//   2. tenantCtx.features (object map, true/false)

import { hasFeature } from '../auth/context.js';
import { tenantHasFeature } from '../auth/tenantContext.js';
import { FeatureDisabled } from '../errors/httpErrors.js';

/**
 * Factory guard.
 * @param {string|string[]} featureName - nom du flag, ou liste (any-of)
 * @param {object} [opts]
 * @param {string} [opts.source='any'] - 'auth' | 'tenant' | 'any' (default)
 */
export function requireFeature(featureName, opts = {}) {
  if (!featureName) {
    throw new TypeError('requireFeature: featureName required');
  }
  const features = Array.isArray(featureName) ? featureName : [featureName];
  const source = opts.source || 'any';

  return function requireFeatureMw(req, res, next) {
    const authCtx = req && req.authCtx;
    const tenantCtx = req && req.tenantCtx;

    const checkAuth = (f) => hasFeature(authCtx, f);
    const checkTenant = (f) => tenantHasFeature(tenantCtx, f);

    let granted = false;
    if (source === 'auth') {
      granted = features.some(checkAuth);
    } else if (source === 'tenant') {
      granted = features.some(checkTenant);
    } else {
      // 'any'
      granted = features.some((f) => checkAuth(f) || checkTenant(f));
    }

    if (!granted) {
      const err = new FeatureDisabled({
        safeMessage: 'Fonctionnalité désactivée',
        details: { features, source },
        correlationId: req && req.requestId,
      });
      if (typeof next === 'function') return next(err);
      throw err;
    }

    if (typeof next === 'function') next();
  };
}
