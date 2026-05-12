// ─── Sanity tests for consentToken.js — Phase 2 ───
// Standalone, no DB, no endpoint. Run: CONSENT_SECRET=<hex> node test-consentToken.mjs
// Exits 0 if 8/8 PASS, 1 otherwise.

import { generateConsentToken, verifyConsentToken, hashConsentToken } from './consentToken.js';

let pass = 0, fail = 0;
const results = [];

function ok(name, cond, detail) {
  if (cond) { pass++; results.push(`✅ ${name}`); }
  else { fail++; results.push(`❌ ${name}` + (detail ? ` — ${detail}` : '')); }
}

// ─── Test 1 — token valide (generate + verify roundtrip) ───────────────
const t1 = generateConsentToken({
  leadId: 'lead_test_1', companyId: 'c1', envelopeId: 'env_1',
  campaignId: 'camp_1', phone: '+33612345678', ttlDays: 30,
});
const v1 = verifyConsentToken(t1.token);
ok('1. token valide', v1.valid === true && v1.expired === false && v1.reason === null,
   JSON.stringify(v1));

// ─── Test 2 — token expiré ────────────────────────────────────────────
// Forge an already-expired token by manipulating exp via base64 round-trip.
// Easiest path: generate with negative-ish TTL via direct payload (skip exposed API
// since ttlDays is clamped to >=1). Approach: build a fresh token manually
// matching the helper's format, but with exp in the past.
import crypto from 'node:crypto';
function _b64u(buf) { return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function _sign(msg, secret) { return _b64u(crypto.createHmac('sha256', secret).update(msg).digest()); }
const expiredPayload = {
  v: 'v1', leadId: 'lead_x', companyId: 'c1', envelopeId: 'env_1', campaignId: null,
  phone: '+33611111111',
  iat: Math.floor(Date.now()/1000) - 7200,
  exp: Math.floor(Date.now()/1000) - 3600,
  nonce: crypto.randomBytes(12).toString('hex'),
};
const expB64 = _b64u(Buffer.from(JSON.stringify(expiredPayload),'utf8'));
const expMsg = 'cnst.v1.' + expB64;
const expSig = _sign(expMsg, process.env.CONSENT_SECRET);
const expiredToken = expMsg + '.' + expSig;
const v2 = verifyConsentToken(expiredToken);
ok('2. token expiré', v2.valid === false && v2.expired === true && v2.reason === 'expired',
   JSON.stringify(v2));

// ─── Test 3 — token falsifié (signature tampered) ─────────────────────
const tampered = t1.token.slice(0, -5) + 'XXXXX';
const v3 = verifyConsentToken(tampered);
ok('3. token falsifié', v3.valid === false && v3.reason === 'signature_mismatch',
   JSON.stringify(v3));

// ─── Test 4 — token malformed (mauvais format) ─────────────────────────
const cases = [
  ['', 'malformed_empty'],
  [null, 'malformed_empty'],
  ['garbage', 'malformed_parts'],
  ['a.b.c', 'malformed_parts'],
  ['wrong.v1.payload.sig', 'malformed_prefix'],
  ['cnst.v9.payload.sig', 'malformed_prefix'],
];
let allMalformed = true;
const malformedDetail = [];
for (const [tok, expectedReason] of cases) {
  const r = verifyConsentToken(tok);
  if (r.valid !== false || r.reason !== expectedReason) {
    allMalformed = false;
    malformedDetail.push(`tok=${JSON.stringify(tok)} got=${r.reason} expected=${expectedReason}`);
  }
}
ok('4. token malformed (6 sub-cases)', allMalformed, malformedDetail.join('; '));

// ─── Test 5 — hash stable (same input → same output) ──────────────────
const h1 = hashConsentToken(t1.token);
const h2 = hashConsentToken(t1.token);
const hDiff = hashConsentToken(t1.token + 'x');
ok('5. hash stable + sensible aux changements',
   h1 === h2 && h1 === t1.tokenHash && h1.length === 64 && hDiff !== h1,
   `h1=${h1.slice(0,12)} h2=${h2.slice(0,12)} tokenHash=${t1.tokenHash.slice(0,12)}`);

// ─── Test 6 — payload complet ─────────────────────────────────────────
const p = v1.payload;
const required = ['v', 'leadId', 'companyId', 'envelopeId', 'phone', 'iat', 'exp', 'nonce'];
const missing = required.filter(k => p[k] == null);
ok('6. payload complet', missing.length === 0
   && p.v === 'v1'
   && p.leadId === 'lead_test_1'
   && p.companyId === 'c1'
   && p.envelopeId === 'env_1'
   && p.campaignId === 'camp_1'
   && p.phone === '+33612345678'
   && typeof p.iat === 'number' && typeof p.exp === 'number'
   && p.nonce && p.nonce.length === 24,
   missing.length > 0 ? `missing: ${missing.join(',')}` : `payload OK`);

// ─── Test 7 — TTL respecté (exp - iat ≈ ttlDays × 86400) ──────────────
const ttlSec = p.exp - p.iat;
const expectedSec = 30 * 86400;
ok('7. TTL respecté (30j = 2592000s)',
   ttlSec === expectedSec,
   `got=${ttlSec}s expected=${expectedSec}s`);

// Also verify with TTL=7
const t7 = generateConsentToken({
  leadId: 'l', companyId: 'c1', envelopeId: 'e', phone: '+331', ttlDays: 7,
});
const ttl7 = t7.payload.exp - t7.payload.iat;
ok('7b. TTL=7j (604800s)', ttl7 === 7 * 86400, `got=${ttl7}`);

// ─── Test 8 — secret manquant rejeté proprement ───────────────────────
const savedSecret = process.env.CONSENT_SECRET;
delete process.env.CONSENT_SECRET;
const v8verify = verifyConsentToken(t1.token);
let g8throws = false;
try {
  generateConsentToken({ leadId: 'l', companyId: 'c1', envelopeId: 'e', phone: '+331' });
} catch (e) {
  g8throws = e.code === 'CONSENT_SECRET_MISSING';
}
process.env.CONSENT_SECRET = savedSecret;
ok('8. secret manquant rejeté proprement',
   v8verify.valid === false && v8verify.reason === 'secret_missing' && g8throws,
   `verify=${v8verify.reason} generate.throws=${g8throws}`);

// ─── Report ───────────────────────────────────────────────────────────
console.log('');
console.log('═══ Sanity tests consentToken.js ═══');
results.forEach(r => console.log(r));
console.log('');
console.log(`Total: ${pass} PASS / ${fail} FAIL / ${pass+fail} TOTAL`);
process.exit(fail === 0 ? 0 : 1);
