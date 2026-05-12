// ─── E2E tests Phase 5 — Consent guard (check-callable + voip /calls guard) ───
// Execute on VPS : node services/test-consent-guard-e2e.mjs

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
const ENV_ON = 'env_p5_on_' + TS;
const ENV_OFF = 'env_p5_off_' + TS;
const NOW = new Date().toISOString();
const SESSION_TOKEN = 'sess_p5_' + crypto.randomBytes(16).toString('hex');

const adminCollab = db.prepare(`SELECT id FROM collaborators WHERE companyId = ? AND role = 'admin' AND (archivedAt IS NULL OR archivedAt = '') LIMIT 1`).get(TEST_COMPANY);
if (!adminCollab) { console.error('No admin collab'); process.exit(1); }

console.log('═══ Setup Phase 5 E2E ═══');

// Session
db.prepare(`INSERT INTO sessions (token, collaboratorId, companyId, role, expiresAt, createdAt) VALUES (?, ?, ?, 'admin', ?, ?)`)
  .run(SESSION_TOKEN, adminCollab.id, TEST_COMPANY, new Date(Date.now() + 3600000).toISOString(), NOW);

// 2 envelopes : one with consent ON, one OFF
db.prepare(`INSERT INTO lead_envelopes (id, companyId, name, source_id, auto_dispatch, dispatch_type, dispatch_time, dispatch_limit, created_at, telemarketingApprovalEnabled)
            VALUES (?, ?, 'TEST P5 envelope ON', NULL, 0, 'manual', '', 0, ?, 1)`).run(ENV_ON, TEST_COMPANY, NOW);
db.prepare(`INSERT INTO lead_envelopes (id, companyId, name, source_id, auto_dispatch, dispatch_type, dispatch_time, dispatch_limit, created_at, telemarketingApprovalEnabled)
            VALUES (?, ?, 'TEST P5 envelope OFF', NULL, 0, 'manual', '', 0, ?, 0)`).run(ENV_OFF, TEST_COMPANY, NOW);

// Leads : un par status
const insertLead = db.prepare(`INSERT INTO incoming_leads (id, companyId, source_id, first_name, last_name, email, phone, data_json, status, envelope_id, created_at, consentStatus, callable)
                               VALUES (?, ?, NULL, ?, '', ?, ?, '{}', 'new', ?, ?, ?, ?)`);
const cases = [
  // [id, firstname, phone, envelope, consentStatus, callable, expectedCallable, expectedReason]
  ['lead_p5_noenv_' + TS,        'NoEnv',       '+33611101001', null,    'not_requested', 0, true,  'lead_has_no_envelope'], // lead matched but no envelope_id → call allowed
  ['lead_p5_envoff_' + TS,       'EnvOff',      '+33611101002', ENV_OFF, 'not_requested', 0, true,  'envelope_consent_disabled'],
  ['lead_p5_envon_notreq_' + TS, 'EnvOnNotReq', '+33611101003', ENV_ON,  'not_requested', 0, false, 'consent_required_not_validated'],
  ['lead_p5_envon_sms_' + TS,    'EnvOnSms',    '+33611101004', ENV_ON,  'sms_sent',      0, false, 'consent_required_not_validated'],
  ['lead_p5_envon_clicked_' + TS,'EnvOnClicked','+33611101005', ENV_ON,  'clicked',       0, false, 'consent_required_not_validated'],
  ['lead_p5_envon_refused_' + TS,'EnvOnRefused','+33611101006', ENV_ON,  'refused',       0, false, 'consent_required_not_validated'],
  ['lead_p5_envon_revoked_' + TS,'EnvOnRevoked','+33611101007', ENV_ON,  'revoked',       0, false, 'consent_required_not_validated'],
  ['lead_p5_envon_expired_' + TS,'EnvOnExpired','+33611101008', ENV_ON,  'expired',       0, false, 'consent_required_not_validated'],
  ['lead_p5_envon_validated_' + TS,'EnvOnValid','+33611101009', ENV_ON,  'validated',     1, true,  'consent_validated'],
];

for (const [id, fn, phone, env, cs, callable] of cases) {
  insertLead.run(id, TEST_COMPANY, fn, fn.toLowerCase()+'@x.com', phone, env, NOW, cs, callable);
}

// Lead test 1 (NoEnv) intentionally has envelope_id=null

async function call(method, path, body) {
  const r = await fetch(API_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SESSION_TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data; try { data = await r.json(); } catch { data = null; }
  return { status: r.status, body: data };
}

console.log('Setup OK — 2 envelopes + 9 leads');

// ─── 9 scenarios check-callable ────────────────────────────────────────
for (let i = 0; i < cases.length; i++) {
  const [id, fn, phone, env, cs, callable, expectedCallable, expectedReason] = cases[i];
  const r = await call('GET', `/api/leads/check-callable?phone=${encodeURIComponent(phone)}`);
  const passed = r.status === 200
    && r.body.callable === expectedCallable
    && r.body.reason === expectedReason;
  ok(`${i+1}. ${fn} (${cs}, env=${env ? 'ON' : env === null ? 'NULL' : 'OFF'}) → callable=${expectedCallable}`,
     passed,
     `got callable=${r.body?.callable} reason=${r.body?.reason} (expected callable=${expectedCallable} reason=${expectedReason})`);
}

// ─── 10. Backend guard VoIP /calls — bloque outbound si consent_required_not_validated ───
const blockedPhone = '+33611101003'; // EnvOnNotReq
const r10 = await call('POST', '/api/voip/calls', { toNumber: blockedPhone, fromNumber: '+33999999999', direction: 'outbound' });
ok('10. Backend VoIP /calls guard → 403 CONSENT_REQUIRED', r10.status === 403 && r10.body.error === 'CONSENT_REQUIRED',
   `status=${r10.status} body=${JSON.stringify(r10.body).slice(0,150)}`);

// ─── 11. Backend guard VoIP /calls — allow si validated ───────────────
const validatedPhone = '+33611101009'; // EnvOnValid
const r11 = await call('POST', '/api/voip/calls', { toNumber: validatedPhone, fromNumber: '+33999999999', direction: 'outbound', collaboratorId: adminCollab.id });
ok('11. Backend VoIP /calls allow validated → 200', r11.status === 200 && r11.body.success,
   `status=${r11.status}`);

// ─── 12. Backend guard skip pour inbound calls ────────────────────────
const r12 = await call('POST', '/api/voip/calls', { toNumber: blockedPhone, fromNumber: '+33999999999', direction: 'inbound', collaboratorId: adminCollab.id });
ok('12. Backend guard skip inbound calls', r12.status === 200,
   `status=${r12.status}`);

// ─── Cleanup ──────────────────────────────────────────────────────────
console.log('\n═══ Cleanup ═══');
db.prepare('DELETE FROM call_logs WHERE companyId = ? AND createdAt > ?').run(TEST_COMPANY, NOW);
db.prepare('DELETE FROM incoming_leads WHERE id LIKE ?').run('lead_p5_%');
db.prepare('DELETE FROM lead_envelopes WHERE id IN (?, ?)').run(ENV_ON, ENV_OFF);
db.prepare('DELETE FROM sessions WHERE token = ?').run(SESSION_TOKEN);
console.log('Cleanup OK');

// ─── Report ───────────────────────────────────────────────────────────
console.log('\n═══ E2E tests Phase 5 ═══');
results.forEach(r => console.log(r));
console.log(`\nTotal: ${pass} PASS / ${fail} FAIL / ${pass+fail} TOTAL`);
process.exit(fail === 0 ? 0 : 1);
