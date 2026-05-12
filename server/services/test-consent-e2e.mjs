// ─── E2E tests Phase 3 — /api/consent/:token ───
// Exécution sur VPS : node test-consent-e2e.mjs (lit CONSENT_SECRET du .env)
// Crée un lead+envelope test temporaire, lance les 7 scénarios, cleanup.
// NE PAS exécuter en local Mac — endpoints actifs uniquement sur VPS.

import Database from 'better-sqlite3';
import { generateConsentToken, hashConsentToken } from './consentToken.js';

const DB_PATH = process.env.DB_PATH || '/var/www/planora-data/calendar360.db';
const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push(`✅ ${name}`); }
  else { fail++; results.push(`❌ ${name}` + (detail ? ` — ${detail}` : '')); }
}

const TS = Date.now();
const TEST_COMPANY_ID = 'c1776169036725'; // CapFinances — company test interne déjà existante
const TEST_ENV_ID = 'env_test_consent_phase3_' + TS;
const TEST_LEAD_ID = 'lead_test_consent_phase3_' + TS;
const TEST_PHONE = '+33611112222';
const NOW = new Date().toISOString();

// ─── Setup : crée envelope + lead test temporaires ────────────────────
console.log('═══ E2E Phase 3 setup ═══');
db.prepare(`INSERT INTO lead_envelopes (id, companyId, name, source_id, auto_dispatch, dispatch_type, dispatch_time, dispatch_limit, created_at, telemarketingApprovalEnabled, consentTextVersion, consentExpireDays)
            VALUES (?, ?, 'TEST Phase3 — to delete', NULL, 0, 'manual', '', 0, ?, 1, 'v1.0-2026-05', 30)`)
  .run(TEST_ENV_ID, TEST_COMPANY_ID, NOW);

db.prepare(`INSERT INTO incoming_leads (id, companyId, source_id, first_name, last_name, email, phone, data_json, status, envelope_id, assigned_to, assigned_at, contact_id, created_at, consentStatus, callable)
            VALUES (?, ?, NULL, 'Test', 'Phase3', 'test-phase3@example.com', ?, '{}', 'new', ?, NULL, NULL, NULL, ?, 'not_requested', 0)`)
  .run(TEST_LEAD_ID, TEST_COMPANY_ID, TEST_PHONE, TEST_ENV_ID, NOW);

console.log(`Setup OK : envelope ${TEST_ENV_ID}, lead ${TEST_LEAD_ID}`);

// ─── Génère token et INSERT consent_tokens ────────────────────────────
const gen = generateConsentToken({
  leadId: TEST_LEAD_ID,
  companyId: TEST_COMPANY_ID,
  envelopeId: TEST_ENV_ID,
  campaignId: null,
  phone: TEST_PHONE,
  ttlDays: 30,
});

db.prepare(`INSERT INTO consent_tokens (id, tokenHash, companyId, envelopeId, leadId, campaignId, phone, expiresAt, usedAt, clickedAt, status, createdAt)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, 'pending', ?)`)
  .run('cnt_' + TS, gen.tokenHash, TEST_COMPANY_ID, TEST_ENV_ID, TEST_LEAD_ID, TEST_PHONE, gen.expiresAt, NOW);

console.log(`Token généré (hash: ${gen.tokenHash.slice(0,12)}…)`);

// ─── Test 1 : GET /api/consent/:token → 200 ───────────────────────────
let r = await fetch(`${API_BASE}/api/consent/${encodeURIComponent(gen.token)}`);
let body = await r.json();
// phoneMasked format: "+336••••2222" (head 4 chars + bullets + last 4 digits)
ok('1. GET valide → 200', r.status === 200 && body.companyName && body.legalText && body.legalVersion === 'v1.0-2026-05' && body.phoneMasked && body.phoneMasked.endsWith('2222') && body.phoneMasked.includes('•'),
   `status=${r.status} reason=${JSON.stringify(body).slice(0,200)}`);

// ─── Test 2 : clickedAt persisted ─────────────────────────────────────
const tokenAfterClick = db.prepare('SELECT clickedAt, status FROM consent_tokens WHERE tokenHash = ?').get(gen.tokenHash);
const leadAfterClick = db.prepare('SELECT consentStatus, consentClickedAt FROM incoming_leads WHERE id = ?').get(TEST_LEAD_ID);
ok('2. GET → clickedAt set + lead status=clicked',
   !!tokenAfterClick.clickedAt && tokenAfterClick.status === 'clicked' && leadAfterClick.consentStatus === 'clicked' && !!leadAfterClick.consentClickedAt,
   JSON.stringify({ tokenAfterClick, leadAfterClick }));

// ─── Test 3 : Token falsifié → 400 ────────────────────────────────────
const tampered = gen.token.slice(0, -5) + 'XXXXX';
r = await fetch(`${API_BASE}/api/consent/${encodeURIComponent(tampered)}`);
body = await r.json();
ok('3. Token falsifié → 400 CONSENT_TOKEN_INVALID',
   r.status === 400 && body.error === 'CONSENT_TOKEN_INVALID',
   `status=${r.status} body=${JSON.stringify(body)}`);

// ─── Test 4 : POST /accept → proof créée + lead callable=1 ────────────
r = await fetch(`${API_BASE}/api/consent/${encodeURIComponent(gen.token)}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
body = await r.json();
const proof = db.prepare('SELECT * FROM consent_proofs WHERE tokenHash = ?').get(gen.tokenHash);
const leadAfterAccept = db.prepare('SELECT consentStatus, callable, consentValidatedAt, consentProofId FROM incoming_leads WHERE id = ?').get(TEST_LEAD_ID);
const tokenAfterAccept = db.prepare('SELECT usedAt, status FROM consent_tokens WHERE tokenHash = ?').get(gen.tokenHash);
ok('4. POST accept → 200 + proof + lead callable=1',
   r.status === 200 && body.success === true && body.status === 'validated' && proof && proof.status === 'validated'
   && leadAfterAccept.consentStatus === 'validated' && leadAfterAccept.callable === 1
   && !!leadAfterAccept.consentValidatedAt && leadAfterAccept.consentProofId === proof.id
   && tokenAfterAccept.usedAt && tokenAfterAccept.status === 'validated'
   && proof.consentTextSnapshot && proof.consentTextHash && proof.consentTextHash.length === 64
   && proof.ip && proof.userAgent,
   `status=${r.status} body=${JSON.stringify(body).slice(0,100)} proof=${proof?.id} lead=${JSON.stringify(leadAfterAccept)}`);

// ─── Test 5 : Replay accept → 409 ─────────────────────────────────────
r = await fetch(`${API_BASE}/api/consent/${encodeURIComponent(gen.token)}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
body = await r.json();
ok('5. Replay accept → 409 CONSENT_ALREADY_USED',
   r.status === 409 && body.error === 'CONSENT_ALREADY_USED',
   `status=${r.status} body=${JSON.stringify(body)}`);

// ─── Test 6 : Refuse sur token usagé → 409 ────────────────────────────
r = await fetch(`${API_BASE}/api/consent/${encodeURIComponent(gen.token)}/refuse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
body = await r.json();
ok('6. Replay refuse → 409 CONSENT_ALREADY_USED',
   r.status === 409 && body.error === 'CONSENT_ALREADY_USED',
   `status=${r.status}`);

// ─── Test 7 : Fresh lead + token, test REFUSE ─────────────────────────
const LEAD2 = TEST_LEAD_ID + '_refuse';
const ENV2 = TEST_ENV_ID; // same envelope OK
db.prepare(`INSERT INTO incoming_leads (id, companyId, source_id, first_name, last_name, email, phone, data_json, status, envelope_id, created_at, consentStatus, callable)
            VALUES (?, ?, NULL, 'Test', 'PhaseR', 'test-r@example.com', ?, '{}', 'new', ?, ?, 'not_requested', 0)`)
  .run(LEAD2, TEST_COMPANY_ID, '+33611113333', ENV2, NOW);
const gen2 = generateConsentToken({ leadId: LEAD2, companyId: TEST_COMPANY_ID, envelopeId: ENV2, phone: '+33611113333', ttlDays: 30 });
db.prepare(`INSERT INTO consent_tokens (id, tokenHash, companyId, envelopeId, leadId, campaignId, phone, expiresAt, status, createdAt)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'pending', ?)`)
  .run('cnt2_' + TS, gen2.tokenHash, TEST_COMPANY_ID, ENV2, LEAD2, '+33611113333', gen2.expiresAt, NOW);

r = await fetch(`${API_BASE}/api/consent/${encodeURIComponent(gen2.token)}/refuse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
body = await r.json();
const proof2 = db.prepare('SELECT status FROM consent_proofs WHERE tokenHash = ?').get(gen2.tokenHash);
const lead2After = db.prepare('SELECT consentStatus, callable, consentRefusedAt FROM incoming_leads WHERE id = ?').get(LEAD2);
ok('7. POST refuse → 200 + proof status=refused + lead callable=0',
   r.status === 200 && body.status === 'refused' && proof2?.status === 'refused'
   && lead2After.consentStatus === 'refused' && lead2After.callable === 0 && !!lead2After.consentRefusedAt,
   `status=${r.status} proof=${JSON.stringify(proof2)} lead=${JSON.stringify(lead2After)}`);

// ─── Test 8 : Token expiré ─────────────────────────────────────────────
import crypto from 'node:crypto';
function _b64u(buf) { return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function _sign(msg, secret) { return _b64u(crypto.createHmac('sha256', secret).update(msg).digest()); }
const expiredPayload = {
  v: 'v1', leadId: 'x', companyId: TEST_COMPANY_ID, envelopeId: ENV2, campaignId: null,
  phone: '+33611114444',
  iat: Math.floor(Date.now()/1000) - 7200,
  exp: Math.floor(Date.now()/1000) - 3600,
  nonce: crypto.randomBytes(12).toString('hex'),
};
const expB64 = _b64u(Buffer.from(JSON.stringify(expiredPayload),'utf8'));
const expMsg = 'cnst.v1.' + expB64;
const expSig = _sign(expMsg, process.env.CONSENT_SECRET);
const expiredToken = expMsg + '.' + expSig;
r = await fetch(`${API_BASE}/api/consent/${encodeURIComponent(expiredToken)}`);
body = await r.json();
ok('8. Token expiré → 410 CONSENT_TOKEN_EXPIRED',
   r.status === 410 && body.error === 'CONSENT_TOKEN_EXPIRED',
   `status=${r.status} body=${JSON.stringify(body)}`);

// ─── Test 9 : Rate-limit GET (11+ requêtes en < 1 min → 429) ─────────
let rateLimitTriggered = false;
for (let i = 0; i < 15; i++) {
  const rr = await fetch(`${API_BASE}/api/consent/garbage-token-${i}`);
  if (rr.status === 429) { rateLimitTriggered = true; break; }
}
ok('9. Rate-limit GET (10 req/min → 429 sur 11e+)',
   rateLimitTriggered,
   'Did not get 429 after 15 reqs to /api/consent/garbage*');

// ─── Cleanup test data ────────────────────────────────────────────────
console.log('\n═══ Cleanup ═══');
// NOTE : consent_proofs immuable (triggers prevent_consent_proof_delete) — on garde les preuves
// car c'est le comportement attendu en prod. Les autres rows tests sont supprimées.
try { db.prepare('DELETE FROM consent_tokens WHERE companyId = ? AND envelopeId = ?').run(TEST_COMPANY_ID, TEST_ENV_ID); } catch(e) { console.error('cleanup tokens:', e.message); }
try { db.prepare('DELETE FROM incoming_leads WHERE id IN (?, ?)').run(TEST_LEAD_ID, LEAD2); } catch(e) { console.error('cleanup leads:', e.message); }
try { db.prepare('DELETE FROM lead_envelopes WHERE id = ?').run(TEST_ENV_ID); } catch(e) { console.error('cleanup env:', e.message); }
console.log('Cleanup OK (proofs conservées — immuabilité RGPD)');

// ─── Report ───────────────────────────────────────────────────────────
console.log('\n═══ E2E tests Phase 3 ═══');
results.forEach(r => console.log(r));
console.log(`\nTotal: ${pass} PASS / ${fail} FAIL / ${pass+fail} TOTAL`);
process.exit(fail === 0 ? 0 : 1);
