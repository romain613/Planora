// Collab portal smoke test — post Phase 14b frontend stability monitor.
//
// Launches headless chromium, navigates to calendar360.fr, optionally injects
// a collab session token or logs in via form, waits for portal render, and
// captures every console error / pageerror / 4xx-5xx / ErrorBoundary visible.
//
// Usage examples:
//   node collab-smoke.mjs                                       # login page only
//   SMOKE_SESSION='{"token":"...","role":"collab",...}' \
//     node collab-smoke.mjs                                     # simulate collab session
//   SMOKE_EMAIL=julie@... SMOKE_PASS=... node collab-smoke.mjs  # login via form
//   SMOKE_ROUNDS=3 SMOKE_HEADLESS=0 node collab-smoke.mjs       # 3 rounds, visible browser
//
// Exit code: 0 = no critical, 1 = at least one pageerror or ErrorBoundary
// Full report: ops/smoke/last-report.json

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TARGET      = process.env.SMOKE_URL       || 'https://calendar360.fr/';
const SESSION     = process.env.SMOKE_SESSION   || '';
const LOGIN_EMAIL = process.env.SMOKE_EMAIL     || '';
const LOGIN_PASS  = process.env.SMOKE_PASS      || '';
const LOGIN_MODE  = process.env.SMOKE_LOGIN_MODE || 'api'; // 'api' (default, POST /api/auth/login) | 'form' (fill DOM)
const ROUNDS      = parseInt(process.env.SMOKE_ROUNDS   || '1',  10);
const NAV_TIMEOUT = parseInt(process.env.SMOKE_TIMEOUT  || '30000', 10);
const WAIT_AFTER  = parseInt(process.env.SMOKE_WAIT     || '6000',  10);
const HEADLESS    = process.env.SMOKE_HEADLESS !== '0';

// POST /api/auth/login via fetch before any page navigation — returns session JSON
async function apiLogin(baseUrl, email, pass) {
  const url = new URL('/api/auth/login', baseUrl).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: res.status, body };
}

const stamp = () => new Date().toISOString();

async function runRound(round) {
  const errors = [];
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error') {
      errors.push({ kind: 'console.error', text: msg.text(), location: msg.location() });
    } else if (type === 'warning') {
      const t = msg.text();
      if (/(React|hook|key=|deprecated|TDZ|before initialization)/i.test(t)) {
        errors.push({ kind: 'console.warn', text: t, location: msg.location() });
      }
    }
  });
  page.on('pageerror', err => {
    errors.push({
      kind: 'pageerror',
      name: err.name,
      message: err.message,
      stack: (err.stack || '').split('\n').slice(0, 6).join('\n'),
    });
  });
  page.on('response', res => {
    const s = res.status();
    if (s >= 400) {
      errors.push({ kind: 'network', status: s, url: res.url(), method: res.request().method() });
    }
  });
  page.on('requestfailed', req => {
    errors.push({ kind: 'request-failed', url: req.url(), failure: req.failure()?.errorText });
  });

  // Step 1 — open login page
  try {
    await page.goto(TARGET, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
  } catch (e) {
    errors.push({ kind: 'nav', message: e.message });
  }

  // Step 2 — simulate collab connection
  let loginMethod = 'none';
  if (SESSION) {
    loginMethod = 'session-injection';
    try {
      await page.evaluate(tok => localStorage.setItem('calendar360-session', tok), SESSION);
      await page.reload({ waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    } catch (e) {
      errors.push({ kind: 'session-inject', message: e.message });
    }
  } else if (LOGIN_EMAIL && LOGIN_PASS && LOGIN_MODE === 'api') {
    loginMethod = 'api-login';
    try {
      const { status, body } = await apiLogin(TARGET, LOGIN_EMAIL, LOGIN_PASS);
      if (status !== 200 || !body?.session) {
        errors.push({ kind: 'api-login', status, message: body?.error || body?.raw || 'no session returned' });
      } else {
        const sessionJSON = JSON.stringify(body.session);
        await page.evaluate(tok => localStorage.setItem('calendar360-session', tok), sessionJSON);
        await page.reload({ waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
      }
    } catch (e) {
      errors.push({ kind: 'api-login', message: e.message });
    }
  } else if (LOGIN_EMAIL && LOGIN_PASS && LOGIN_MODE === 'form') {
    loginMethod = 'form';
    try {
      await page.fill('input[type=email], input[name=email]', LOGIN_EMAIL, { timeout: 5000 });
      await page.fill('input[type=password], input[name=password]', LOGIN_PASS, { timeout: 5000 });
      await page.click(
        'button[type=submit], button:has-text("Connexion"), button:has-text("Se connecter")',
        { timeout: 5000 }
      );
      await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT });
    } catch (e) {
      errors.push({ kind: 'login-form', message: e.message });
    }
  }

  // Step 3 — wait for render + useEffects + first heartbeats
  await page.waitForTimeout(WAIT_AFTER);

  // Step 4 — detect ErrorBoundary visible text
  try {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const matches = bodyText.match(/Erreur de rendu[\s\S]{0,500}/g) || [];
    for (const m of matches.slice(0, 3)) {
      errors.push({ kind: 'errorBoundary', text: m.trim() });
    }
  } catch { /* ignore */ }

  // Step 5 — snapshot final URL + title to distinguish login vs portal
  let finalUrl = '', title = '';
  try {
    finalUrl = page.url();
    title = await page.title();
  } catch { /* ignore */ }

  await browser.close();
  return { errors, loginMethod, finalUrl, title };
}

console.log(`[${stamp()}] Smoke start: target=${TARGET}  rounds=${ROUNDS}  headless=${HEADLESS}`);

const allErrors = [];
let firstRoundMeta = null;
for (let r = 1; r <= ROUNDS; r++) {
  const { errors, loginMethod, finalUrl, title } = await runRound(r);
  for (const e of errors) allErrors.push({ round: r, ...e });
  if (r === 1) firstRoundMeta = { loginMethod, finalUrl, title };
  console.log(`[${stamp()}] Round ${r}: ${errors.length} event(s) captured`);
}

// Classification — every emitted kind must appear in exactly one bucket,
// `other` catches any new kind added later without updating this map.
const KIND_BUCKETS = {
  critical: ['pageerror', 'errorBoundary'],
  console:  ['console.error', 'console.warn'],
  network:  ['network', 'request-failed'],
  nav:      ['nav', 'reload', 'login-form', 'session-inject', 'api-login'],
};
const KNOWN_KINDS = new Set([].concat(...Object.values(KIND_BUCKETS)));
const bySeverity = Object.fromEntries(
  Object.entries(KIND_BUCKETS).map(([b, list]) => [b, allErrors.filter(e => list.includes(e.kind))])
);
bySeverity.other = allErrors.filter(e => !KNOWN_KINDS.has(e.kind));

// Group network errors by URL+status to reduce noise
const netGrouped = {};
for (const e of bySeverity.network) {
  const key = `${e.status || 'FAIL'} ${e.method || ''} ${(e.url || '').replace(/\?.*$/, '?…')}`;
  netGrouped[key] = (netGrouped[key] || 0) + 1;
}

const report = {
  target: TARGET,
  rounds: ROUNDS,
  timestamp: stamp(),
  firstRound: firstRoundMeta,
  summary: {
    total:    allErrors.length,
    critical: bySeverity.critical.length,
    console:  bySeverity.console.length,
    network:  bySeverity.network.length,
    nav:      bySeverity.nav.length,
    other:    bySeverity.other.length,
  },
  critical: bySeverity.critical,
  consoleErrors: bySeverity.console.slice(0, 30),
  networkGrouped: netGrouped,
  networkSample: bySeverity.network.slice(0, 15),
  nav: bySeverity.nav,
  other: bySeverity.other,
};

const outPath = path.join(__dirname, 'last-report.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(`\n===== SUMMARY =====`);
console.log(JSON.stringify(report.summary, null, 2));
console.log(`\nLogin method: ${firstRoundMeta?.loginMethod}   Final URL: ${firstRoundMeta?.finalUrl}`);
console.log(`Title: ${firstRoundMeta?.title}`);

if (bySeverity.critical.length > 0) {
  console.log(`\n===== CRITICAL =====`);
  for (const e of bySeverity.critical) {
    console.log(`  [${e.kind}] ${e.name || ''} ${e.message || e.text || ''}`);
    if (e.stack) console.log(`    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`);
  }
}

if (Object.keys(netGrouped).length > 0) {
  console.log(`\n===== NETWORK errors grouped =====`);
  for (const [k, v] of Object.entries(netGrouped)) console.log(`  ${v}×  ${k}`);
}

if (bySeverity.other.length > 0) {
  console.log(`\n===== OTHER (auth / unclassified) =====`);
  for (const e of bySeverity.other) {
    console.log(`  [${e.kind}] status=${e.status ?? '-'}  ${e.message || e.text || ''}`);
  }
}

console.log(`\nFull report: ${outPath}`);
process.exit(bySeverity.critical.length > 0 ? 1 : 0);
