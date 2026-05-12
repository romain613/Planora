// ─── E2E tests Phase 4 — Consent Admin endpoints ───
// Execute on VPS : node services/test-consentAdmin-e2e.mjs
// Crée envelope+leads test, insère session admin temporaire, lance scenarios, cleanup.
// PAS d'envoi SMS réel (test phones invalides → SMS fail → mais tokens + campaign créés).

import Database from 'better-sqlite3';
import crypto from 'node:crypto';

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
const TEST_COMPANY = 'c1776169036725';
const TEST_ENV = 'env_test_phase4_' + TS;
const LEAD1 = 'lead_test_phase4_1_' + TS;
const LEAD2 = 'lead_test_phase4_2_' + TS;
const LEAD3_BAD_PHONE = 'lead_test_phase4_3_' + TS;
const SESSION_TOKEN = 'session_test_phase4_' + crypto.randomBytes(16).toString('hex');
const SESSION_ID = 'sess_test_phase4_' + TS;
const NOW = new Date().toISOString();

console.log('═══ Setup Phase 4 E2E ═══');

// Find an existing admin user for the test company
const adminCollab = db.prepare(`
  SELECT id, companyId, role FROM collaborators
  WHERE companyId = ? AND role = 'admin' AND (archivedAt IS NULL OR archivedAt = '')
  LIMIT 1
`).get(TEST_COMPANY);

if (!adminCollab) {
  console.error('No admin collab found for', TEST_COMPANY, '— skipping E2E');
  process.exit(1);
}
console.log('Using admin collab:', adminCollab.id);

// Get current sms_credits (will restore at end)
const initialCredits = db.prepare('SELECT credits FROM sms_credits WHERE companyId = ?').get(TEST_COMPANY)?.credits || 0;
console.log('Initial SMS credits:', initialCredits);
// Ensure 10 credits for testing
db.prepare(`INSERT OR REPLACE INTO sms_credits (companyId, credits) VALUES (?, ?)`).run(TEST_COMPANY, Math.max(initialCredits, 10));

// Create test session
db.prepare(`INSERT INTO sessions (token, collaboratorId, companyId, role, expiresAt, createdAt)
            VALUES (?, ?, ?, 'admin', ?, ?)`)
  .run(SESSION_TOKEN, adminCollab.id, TEST_COMPANY, new Date(Date.now() + 3600000).toISOString(), NOW);
console.log('Session created with token:', SESSION_TOKEN.slice(0, 12) + '…');

// Create test envelope
db.prepare(`INSERT INTO lead_envelopes (id, companyId, name, source_id, auto_dispatch, dispatch_type, dispatch_time, dispatch_limit, created_at, telemarketingApprovalEnabled, consentExpireDays)
            VALUES (?, ?, 'TEST Phase4 — to delete', NULL, 0, 'manual', '', 0, ?, 0, 30)`)
  .run(TEST_ENV, TEST_COMPANY, NOW);

// Create test leads (2 valid phones + 1 invalid)
const insertLead = db.prepare(`INSERT INTO incoming_leads (id, companyId, source_id, first_name, last_name, email, phone, data_json, status, envelope_id, created_at, consentStatus, callable)
                               VALUES (?, ?, NULL, ?, ?, ?, ?, '{}', 'new', ?, ?, 'not_requested', 0)`);
insertLead.run(LEAD1, TEST_COMPANY, 'Alice', 'Test1', 'alice-phase4@example.com', '+33611112221', TEST_ENV, NOW);
insertLead.run(LEAD2, TEST_COMPANY, 'Bob', 'Test2', 'bob-phase4@example.com', '+33611112222', TEST_ENV, NOW);
insertLead.run(LEAD3_BAD_PHONE, TEST_COMPANY, 'Charlie', 'Test3', 'charlie-phase4@example.com', 'invalid', TEST_ENV, NOW);
console.log('Setup OK — envelope + 3 leads (2 valid, 1 invalid phone)');

// ─── Helper for authenticated calls ────────────────────────────────────
async function call(method, path, body) {
  const r = await fetch(API_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SESSION_TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await r.json(); } catch { data = null; }
  return { status: r.status, body: data };
}

// ─── Test 1 — Preview: envelope toggle OFF → eligibles=0 (warning) ────
let r = await call('GET', `/api/envelopes/${TEST_ENV}/consent/preview`);
ok('1. Preview (toggle OFF)',
   r.status === 200 && r.body.telemarketingApprovalEnabled === false
   && r.body.counts.total === 3 && r.body.counts.withValidPhone === 2
   && r.body.canSend === false && r.body.warnings.length > 0,
   `status=${r.status} body=${JSON.stringify(r.body).slice(0,200)}`);

// ─── Test 2 — Toggle ON ────────────────────────────────────────────────
r = await call('POST', `/api/envelopes/${TEST_ENV}/consent/toggle`, { enabled: true });
const envAfterToggle = db.prepare('SELECT telemarketingApprovalEnabled FROM lead_envelopes WHERE id = ?').get(TEST_ENV);
ok('2. Toggle ON', r.status === 200 && r.body.success && envAfterToggle.telemarketingApprovalEnabled === 1,
   `status=${r.status} db=${JSON.stringify(envAfterToggle)}`);

// ─── Test 3 — Settings PUT ─────────────────────────────────────────────
r = await call('PUT', `/api/envelopes/${TEST_ENV}/consent/settings`, {
  consentSmsTemplate: 'Test template{firstName} — {url}',
  consentTextVersion: 'test-v1.0',
  consentExpireDays: 14,
});
const envSettings = db.prepare('SELECT consentSmsTemplate, consentTextVersion, consentExpireDays FROM lead_envelopes WHERE id = ?').get(TEST_ENV);
ok('3. Settings PUT',
   r.status === 200 && r.body.success
   && envSettings.consentSmsTemplate === 'Test template{firstName} — {url}'
   && envSettings.consentTextVersion === 'test-v1.0'
   && envSettings.consentExpireDays === 14,
   `db=${JSON.stringify(envSettings)}`);

// ─── Test 4 — Preview ON: eligibles=2 (excl bad phone) ─────────────────
r = await call('GET', `/api/envelopes/${TEST_ENV}/consent/preview`);
ok('4. Preview (toggle ON)',
   r.status === 200 && r.body.telemarketingApprovalEnabled === true
   && r.body.counts.eligibleForSend === 2 && r.body.smsCreditsRequired === 2
   && r.body.canSend === true,
   `eligibleForSend=${r.body.counts?.eligibleForSend} canSend=${r.body.canSend}`);

// ─── Test 5 — Insufficient credits → 402 ───────────────────────────────
db.prepare('UPDATE sms_credits SET credits = 0 WHERE companyId = ?').run(TEST_COMPANY);
r = await call('POST', `/api/envelopes/${TEST_ENV}/consent/campaign/send`, {});
ok('5. Send with 0 credits → 402 INSUFFICIENT_SMS_CREDITS',
   r.status === 402 && r.body.error === 'INSUFFICIENT_SMS_CREDITS',
   `status=${r.status} body=${JSON.stringify(r.body)}`);

// Restore credits
db.prepare('UPDATE sms_credits SET credits = ? WHERE companyId = ?').run(Math.max(initialCredits, 10), TEST_COMPANY);

// ─── Test 6 — Send campaign with credits ───────────────────────────────
r = await call('POST', `/api/envelopes/${TEST_ENV}/consent/campaign/send`, {});
const campaign = db.prepare('SELECT * FROM consent_campaigns WHERE envelopeId = ? ORDER BY createdAt DESC LIMIT 1').get(TEST_ENV);
const tokensCreated = db.prepare('SELECT COUNT(*) as c FROM consent_tokens WHERE envelopeId = ?').get(TEST_ENV).c;
ok('6. Send campaign (2 leads valides)',
   r.status === 200 && r.body.success && r.body.total === 2
   && campaign && campaign.totalLeads === 2 && tokensCreated === 2,
   `status=${r.status} body=${JSON.stringify(r.body)} campaign=${campaign?.id} tokens=${tokensCreated}`);

// ─── Test 7 — Stats ────────────────────────────────────────────────────
r = await call('GET', `/api/envelopes/${TEST_ENV}/consent/stats`);
ok('7. Stats endpoint',
   r.status === 200 && r.body.counts && typeof r.body.counts.callable === 'number'
   && Array.isArray(r.body.campaigns) && r.body.campaigns.length >= 1,
   `body=${JSON.stringify(r.body).slice(0,150)}`);

// ─── Test 8 — Revoke manual ───────────────────────────────────────────
r = await call('POST', `/api/leads/${LEAD1}/consent/revoke`, { reason: 'test_phase4_e2e' });
const leadAfterRevoke = db.prepare('SELECT consentStatus, callable, consentProofId FROM incoming_leads WHERE id = ?').get(LEAD1);
const revokeProof = db.prepare('SELECT status FROM consent_proofs WHERE leadId = ? AND status = ?').get(LEAD1, 'revoked');
ok('8. Revoke manual → proof status=revoked + callable=0',
   r.status === 200 && r.body.success && leadAfterRevoke.consentStatus === 'revoked'
   && leadAfterRevoke.callable === 0 && revokeProof && revokeProof.status === 'revoked',
   `lead=${JSON.stringify(leadAfterRevoke)} proof=${JSON.stringify(revokeProof)}`);

// ─── Test 9 — Permissions : non-admin user → 403 ──────────────────────
const memberSessionToken = 'session_test_phase4_member_' + crypto.randomBytes(16).toString('hex');
const memberCollab = db.prepare(`SELECT id FROM collaborators WHERE companyId = ? AND role != 'admin' AND (archivedAt IS NULL OR archivedAt = '') LIMIT 1`).get(TEST_COMPANY);
if (memberCollab) {
  db.prepare(`INSERT INTO sessions (token, collaboratorId, companyId, role, expiresAt, createdAt) VALUES (?, ?, ?, 'member', ?, ?)`)
    .run(memberSessionToken, memberCollab.id, TEST_COMPANY, new Date(Date.now() + 3600000).toISOString(), NOW);
  const memberR = await fetch(`${API_BASE}/api/envelopes/${TEST_ENV}/consent/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + memberSessionToken },
    body: JSON.stringify({ enabled: false }),
  });
  ok('9. Non-admin user → 403', memberR.status === 403, `status=${memberR.status}`);
  db.prepare('DELETE FROM sessions WHERE token = ?').run(memberSessionToken);
} else {
  results.push('⏭ 9. Skipped (no member collab in test company)');
}

// ─── Cleanup ──────────────────────────────────────────────────────────
console.log('\n═══ Cleanup ═══');
db.prepare('DELETE FROM consent_tokens WHERE envelopeId = ?').run(TEST_ENV);
db.prepare('DELETE FROM consent_campaigns WHERE envelopeId = ?').run(TEST_ENV);
// consent_proofs immutable — kept
db.prepare('DELETE FROM incoming_leads WHERE id IN (?, ?, ?)').run(LEAD1, LEAD2, LEAD3_BAD_PHONE);
db.prepare('DELETE FROM lead_envelopes WHERE id = ?').run(TEST_ENV);
db.prepare('DELETE FROM sessions WHERE token = ?').run(SESSION_TOKEN);
db.prepare('UPDATE sms_credits SET credits = ? WHERE companyId = ?').run(initialCredits, TEST_COMPANY);
console.log('Cleanup OK (proofs conservées, credits restored to', initialCredits, ')');

// ─── Report ───────────────────────────────────────────────────────────
console.log('\n═══ E2E tests Phase 4 ═══');
results.forEach(r => console.log(r));
console.log(`\nTotal: ${pass} PASS / ${fail} FAIL / ${pass+fail} TOTAL`);
process.exit(fail === 0 ? 0 : 1);
