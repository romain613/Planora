// ═══════════════════════════════════════════════════════════════════════
// CONSENT TOKEN HELPER — Phase 2 (HMAC-SHA256, stateless signature + DB hash lookup)
// Spec : v1.10.4-consent-phase2-token-hmac
// ═══════════════════════════════════════════════════════════════════════
// Token format : cnst.v1.<base64url(payload)>.<base64url(hmac_sha256_sig)>
//   - Payload : { v, leadId, companyId, envelopeId, campaignId, phone, iat, exp, nonce }
//   - Signature : HMAC-SHA256(secret, "cnst.v1." + payloadB64)
//   - Verification : timing-safe signature compare + exp check
//
// Stateful one-time-use enforcement is handled by the consent_tokens table
// (caller looks up by tokenHash, checks usedAt). This helper covers crypto only.
//
// Secret : process.env.CONSENT_SECRET (32 bytes hex = 64 chars, loaded via dotenv
// from server/.env — NEVER inlined in ecosystem.config.cjs because the repo is public).
// ═══════════════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

const TOKEN_PREFIX = 'cnst';
const TOKEN_VERSION = 'v1';
const DEFAULT_TTL_DAYS = 30;
const MIN_SECRET_CHARS = 32;

function _getSecret() {
  const s = process.env.CONSENT_SECRET;
  if (!s || typeof s !== 'string' || s.length < MIN_SECRET_CHARS) {
    const err = new Error('CONSENT_SECRET missing or too short (need >= ' + MIN_SECRET_CHARS + ' chars)');
    err.code = 'CONSENT_SECRET_MISSING';
    throw err;
  }
  return s;
}

function _base64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _base64UrlDecode(str) {
  const pad = '='.repeat((4 - (String(str).length % 4)) % 4);
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function _sign(message, secret) {
  return _base64UrlEncode(crypto.createHmac('sha256', secret).update(message).digest());
}

/**
 * generateConsentToken — creates a fresh consent token bound to a lead.
 *
 * @param {object} opts
 * @param {string} opts.leadId       — required (incoming_leads.id)
 * @param {string} opts.companyId    — required (multi-tenant isolation)
 * @param {string} opts.envelopeId   — required (lead_envelopes.id)
 * @param {string} [opts.campaignId] — optional (consent_campaigns.id)
 * @param {string} opts.phone        — required (E.164, defense in depth check)
 * @param {number} [opts.ttlDays=30] — TTL in days (clamped >= 1)
 * @returns {{ token: string, tokenHash: string, expiresAt: string, payload: object }}
 * @throws  if CONSENT_SECRET missing or required fields missing
 */
export function generateConsentToken({ leadId, companyId, envelopeId, campaignId = null, phone, ttlDays = DEFAULT_TTL_DAYS } = {}) {
  if (!leadId || !companyId || !envelopeId || !phone) {
    const err = new Error('generateConsentToken requires leadId, companyId, envelopeId, phone');
    err.code = 'CONSENT_TOKEN_BAD_INPUT';
    throw err;
  }
  const secret = _getSecret();
  const nowMs = Date.now();
  const ttl = Math.max(1, Math.floor(Number(ttlDays) || DEFAULT_TTL_DAYS));
  const expMs = nowMs + (ttl * 86400 * 1000);
  const payload = {
    v: TOKEN_VERSION,
    leadId: String(leadId),
    companyId: String(companyId),
    envelopeId: String(envelopeId),
    campaignId: campaignId == null ? null : String(campaignId),
    phone: String(phone),
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(expMs / 1000),
    nonce: crypto.randomBytes(12).toString('hex'),
  };
  const payloadB64 = _base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const message = TOKEN_PREFIX + '.' + TOKEN_VERSION + '.' + payloadB64;
  const sig = _sign(message, secret);
  const token = message + '.' + sig;
  return {
    token,
    tokenHash: hashConsentToken(token),
    expiresAt: new Date(expMs).toISOString(),
    payload,
  };
}

/**
 * verifyConsentToken — validates HMAC signature + expiry. Never throws on bad input.
 *
 * @param {string} token
 * @returns {{ valid: boolean, expired: boolean, payload: object|null, reason: string|null }}
 *   reason values: malformed_empty | malformed_parts | malformed_prefix |
 *                  secret_missing | signature_mismatch | payload_parse_error |
 *                  payload_missing_exp | expired | null (on success)
 */
export function verifyConsentToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, expired: false, payload: null, reason: 'malformed_empty' };
  }
  const parts = token.split('.');
  if (parts.length !== 4) {
    return { valid: false, expired: false, payload: null, reason: 'malformed_parts' };
  }
  const [prefix, version, payloadB64, sigB64] = parts;
  if (prefix !== TOKEN_PREFIX || version !== TOKEN_VERSION) {
    return { valid: false, expired: false, payload: null, reason: 'malformed_prefix' };
  }
  let secret;
  try { secret = _getSecret(); }
  catch { return { valid: false, expired: false, payload: null, reason: 'secret_missing' }; }

  const message = prefix + '.' + version + '.' + payloadB64;
  const expectedSig = _sign(message, secret);
  let sigsEqual = false;
  try {
    const a = Buffer.from(expectedSig, 'utf8');
    const b = Buffer.from(sigB64, 'utf8');
    sigsEqual = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { sigsEqual = false; }
  if (!sigsEqual) {
    return { valid: false, expired: false, payload: null, reason: 'signature_mismatch' };
  }

  let payload;
  try {
    payload = JSON.parse(_base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return { valid: false, expired: false, payload: null, reason: 'payload_parse_error' };
  }
  if (!payload || typeof payload.exp !== 'number') {
    return { valid: false, expired: false, payload: null, reason: 'payload_missing_exp' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec >= payload.exp) {
    return { valid: false, expired: true, payload, reason: 'expired' };
  }
  return { valid: true, expired: false, payload, reason: null };
}

/**
 * hashConsentToken — SHA-256 hex of the token, used for DB lookup (consent_tokens.tokenHash).
 * Storing only the hash prevents DB dumps from leaking valid tokens.
 *
 * @param {string} token
 * @returns {string} 64-char hex digest
 */
export function hashConsentToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export default { generateConsentToken, verifyConsentToken, hashConsentToken };
