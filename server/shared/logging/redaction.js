// server/shared/logging/redaction.js
// Masque les champs sensibles dans un objet avant log/sérialisation.
// Détection par nom de clé (case-insensitive partial match) ET par valeur (token-like patterns).

const DEFAULT_SENSITIVE_KEYS = [
  // Auth
  'password', 'passwd', 'secret', 'token', 'access_token', 'refresh_token',
  'authorization', 'auth', 'cookie', 'session', 'jwt', 'bearer',
  'apikey', 'api_key', 'api-key', 'apisecret',
  // Provider secrets
  'twilioauthtoken', 'twilioauth_token', 'twilio_auth_token',
  'googleclientsecret', 'google_client_secret',
  'microsoftclientsecret', 'microsoft_client_secret',
  'resendapikey', 'resend_api_key',
  'openaiapikey', 'openai_api_key',
  // Crypto
  'privatekey', 'private_key', 'privkey',
  'salt', 'hash', // hash sometimes ok mais prudence
  // CC/PII
  'creditcard', 'credit_card', 'cardnumber', 'card_number', 'cvv', 'cvc',
  'ssn', 'tax_id',
];

const REDACTED = '[REDACTED]';

// Patterns de tokens connus (Twilio SID, Stripe sk, Google APIKey, JWT, Bearer)
const TOKEN_PATTERNS = [
  /AC[a-f0-9]{32}/i,                    // Twilio Account SID
  /SK[a-f0-9]{32}/i,                    // Twilio API Key SID
  /sk_(live|test)_[A-Za-z0-9]{20,}/,    // Stripe secret key
  /AIza[A-Za-z0-9_-]{35}/,              // Google API key
  /ghp_[A-Za-z0-9]{36,}/,               // GitHub PAT
  /xox[bp]-[A-Za-z0-9-]{10,}/,          // Slack token
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, // JWT
];

function _isSensitiveKey(key, sensitiveKeys) {
  if (typeof key !== 'string') return false;
  const lower = key.toLowerCase();
  return sensitiveKeys.some((s) => lower.includes(s));
}

function _redactStringValue(value) {
  if (typeof value !== 'string') return value;
  // Headers Authorization "Bearer XXX"
  if (/^bearer\s+\S+/i.test(value)) return 'Bearer [REDACTED]';
  if (/^basic\s+\S+/i.test(value)) return 'Basic [REDACTED]';
  // Token patterns
  for (const p of TOKEN_PATTERNS) {
    if (p.test(value)) return REDACTED;
  }
  return value;
}

function _redactRecursive(value, opts, seen) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return _redactStringValue(value);
  if (typeof value !== 'object') return value;

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => _redactRecursive(v, opts, seen));
  }

  const out = {};
  for (const key of Object.keys(value)) {
    if (_isSensitiveKey(key, opts.sensitiveKeys)) {
      out[key] = REDACTED;
    } else {
      out[key] = _redactRecursive(value[key], opts, seen);
    }
  }
  return out;
}

/**
 * Retourne une copie de `value` avec les champs sensibles masqués.
 * Ne mutate JAMAIS l'entrée.
 *
 * @param {any} value
 * @param {object} [opts]
 * @param {string[]} [opts.sensitiveKeys] - liste additionnelle de noms de clés
 * @returns {any} copie redactée
 */
export function redact(value, opts = {}) {
  const sensitiveKeys = [
    ...DEFAULT_SENSITIVE_KEYS,
    ...((opts.sensitiveKeys || []).map((k) => String(k).toLowerCase())),
  ];
  return _redactRecursive(value, { sensitiveKeys }, new WeakSet());
}

export const REDACTED_PLACEHOLDER = REDACTED;
export const DEFAULT_SENSITIVE_KEYS_LIST = Object.freeze([...DEFAULT_SENSITIVE_KEYS]);
