// ═══════════════════════════════════════════════════════════════════════
// CONSENT RATE-LIMIT MIDDLEWARE — Phase 2
// Spec : v1.10.4-consent-phase2-token-hmac
// ═══════════════════════════════════════════════════════════════════════
// Protects the public /api/consent/:token endpoints (Phase 3+) from abuse :
//   - getConsentLimiter  : 10 req/min/IP (token info read)
//   - postConsentLimiter :  5 req/min/IP (accept/refuse mutation)
//
// IP source : Express req.ip (respects 'trust proxy' set in server/index.js
// to handle nginx X-Forwarded-For correctly).
//
// Returns JSON error 429 with a stable error code for frontend mapping.
// No state on disk — in-memory store (sufficient for V1; can swap to Redis
// store later via express-rate-limit's RedisStore if scale demands).
// ═══════════════════════════════════════════════════════════════════════

import rateLimit from 'express-rate-limit';

const ONE_MINUTE_MS = 60 * 1000;

function _jsonLimitHandler(limit) {
  return (req, res /*, next, options */) => {
    res.status(429).json({
      error: 'CONSENT_RATE_LIMIT',
      message: 'Too many consent requests. Please wait and retry.',
      limit,
      retryAfterSeconds: 60,
    });
  };
}

/**
 * GET /api/consent/:token — token info read.
 * 10 requests / minute / IP.
 */
export const getConsentLimiter = rateLimit({
  windowMs: ONE_MINUTE_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: _jsonLimitHandler(10),
});

/**
 * POST /api/consent/:token/accept | /refuse — consent mutation.
 * 5 requests / minute / IP.
 */
export const postConsentLimiter = rateLimit({
  windowMs: ONE_MINUTE_MS,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: _jsonLimitHandler(5),
});

export default { getConsentLimiter, postConsentLimiter };
