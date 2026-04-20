// Collab portal — light tour smoke test (v2).
//
// Authenticates as a collab, then visits each requested tab in sequence
// by setting localStorage.c360-portalTab and reloading. Captures every
// console error / pageerror / 4xx-5xx per tab.
//
// Usage:
//   SMOKE_EMAIL='test@...' SMOKE_PASS='...' node collab-tour.mjs
//   SMOKE_SESSION='<JSON>' SMOKE_TOUR='home,phone,crm' node collab-tour.mjs
//   SMOKE_HEADLESS=0 node collab-tour.mjs   # visible chromium
//
// Tour default = home → phone → crm → agenda (4 tabs, ~30s total).
// Custom tour via SMOKE_TOUR='home,phone' (comma-separated).
//
// Exit code: 0 = no critical, 1 = at least one pageerror or errorBoundary
// Full report: ops/smoke/last-tour-report.json

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TARGET      = process.env.SMOKE_URL       || 'https://calendar360.fr/';
const SESSION     = process.env.SMOKE_SESSION   || '';
const LOGIN_EMAIL = process.env.SMOKE_EMAIL     || '';
const LOGIN_PASS  = process.env.SMOKE_PASS      || '';
const NAV_TIMEOUT = parseInt(process.env.SMOKE_TIMEOUT  || '30000', 10);
const TAB_WAIT    = parseInt(process.env.SMOKE_TAB_WAIT || '4000',  10);
const HEADLESS    = process.env.SMOKE_HEADLESS !== '0';

const DEFAULT_TOUR = ['home', 'phone', 'crm', 'agenda'];
const TOUR = (process.env.SMOKE_TOUR || DEFAULT_TOUR.join(','))
  .split(',').map(s => s.trim()).filter(Boolean);

const stamp = () => new Date().toISOString();

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

function attachListeners(page, ctxRef) {
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error') {
      ctxRef.events.push({ tab: ctxRef.tab, kind: 'console.error', text: msg.text(), location: msg.location() });
    } else if (type === 'warning') {
      const t = msg.text();
      if (/(React|hook|key=|deprecated|TDZ|before initialization)/i.test(t)) {
        ctxRef.events.push({ tab: ctxRef.tab, kind: 'console.warn', text: t, location: msg.location() });
      }
    }
  });
  page.on('pageerror', err => {
    ctxRef.events.push({
      tab: ctxRef.tab,
      kind: 'pageerror',
      name: err.name,
      message: err.message,
      stack: (err.stack || '').split('\n').slice(0, 6).join('\n'),
    });
  });
  page.on('response', res => {
    const s = res.status();
    if (s >= 400) {
      ctxRef.events.push({
        tab: ctxRef.tab, kind: 'network',
        status: s, url: res.url(), method: res.request().method(),
      });
    }
  });
  page.on('requestfailed', req => {
    ctxRef.events.push({
      tab: ctxRef.tab, kind: 'request-failed',
      url: req.url(), failure: req.failure()?.errorText,
    });
  });
}

const browser = await chromium.launch({ headless: HEADLESS });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page    = await context.newPage();

const ctxRef = { tab: 'auth', events: [] };
attachListeners(page, ctxRef);

// 1) Open target + authenticate
await page.goto(TARGET, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT })
  .catch(e => ctxRef.events.push({ tab: 'auth', kind: 'nav', message: e.message }));

let loginMethod = 'none';
if (SESSION) {
  loginMethod = 'session-injection';
  await page.evaluate(tok => localStorage.setItem('calendar360-session', tok), SESSION)
    .catch(e => ctxRef.events.push({ tab: 'auth', kind: 'session-inject', message: e.message }));
} else if (LOGIN_EMAIL && LOGIN_PASS) {
  loginMethod = 'api-login';
  try {
    const { status, body } = await apiLogin(TARGET, LOGIN_EMAIL, LOGIN_PASS);
    if (status !== 200 || !body?.session) {
      ctxRef.events.push({ tab: 'auth', kind: 'api-login', status, message: body?.error || body?.raw || 'no session returned' });
    } else {
      await page.evaluate(tok => localStorage.setItem('calendar360-session', tok), JSON.stringify(body.session));
    }
  } catch (e) {
    ctxRef.events.push({ tab: 'auth', kind: 'api-login', message: e.message });
  }
}

// 2) Tour — each tab: set localStorage.c360-portalTab, reload, wait, capture
console.log(`[${stamp()}] Tour start: login=${loginMethod}  tabs=${TOUR.join(',')}`);
for (const tab of TOUR) {
  ctxRef.tab = tab;
  const before = ctxRef.events.length;
  try {
    await page.evaluate(id => localStorage.setItem('c360-portalTab', id), tab);
    await page.goto(TARGET, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(TAB_WAIT);
  } catch (e) {
    ctxRef.events.push({ tab, kind: 'tab-nav', message: e.message });
  }
  // Grab title + URL for traceability
  let title = ''; try { title = await page.title(); } catch {}
  const newErrs = ctxRef.events.length - before;
  console.log(`[${stamp()}] Tab "${tab}" (title="${title}"): ${newErrs} event(s)`);
}

await browser.close();

// 3) Classification + report
const KIND_BUCKETS = {
  critical: ['pageerror', 'errorBoundary'],
  console:  ['console.error', 'console.warn'],
  network:  ['network', 'request-failed'],
  nav:      ['nav', 'reload', 'login-form', 'session-inject', 'api-login', 'tab-nav'],
};
const KNOWN_KINDS = new Set([].concat(...Object.values(KIND_BUCKETS)));
const bySeverity = Object.fromEntries(
  Object.entries(KIND_BUCKETS).map(([b, list]) => [b, ctxRef.events.filter(e => list.includes(e.kind))])
);
bySeverity.other = ctxRef.events.filter(e => !KNOWN_KINDS.has(e.kind));

const byTab = {};
for (const e of ctxRef.events) {
  const t = e.tab || '?';
  byTab[t] ??= { total: 0, critical: 0, console: 0, network: 0, nav: 0, other: 0 };
  byTab[t].total++;
  if (KIND_BUCKETS.critical.includes(e.kind))      byTab[t].critical++;
  else if (KIND_BUCKETS.console.includes(e.kind))  byTab[t].console++;
  else if (KIND_BUCKETS.network.includes(e.kind))  byTab[t].network++;
  else if (KIND_BUCKETS.nav.includes(e.kind))      byTab[t].nav++;
  else                                              byTab[t].other++;
}

const netGrouped = {};
for (const e of bySeverity.network) {
  const key = `[${e.tab}] ${e.status || 'FAIL'} ${e.method || ''} ${(e.url || '').replace(/\?.*$/, '?…')}`;
  netGrouped[key] = (netGrouped[key] || 0) + 1;
}

const report = {
  target: TARGET,
  tour: TOUR,
  timestamp: stamp(),
  loginMethod,
  summary: {
    total:    ctxRef.events.length,
    critical: bySeverity.critical.length,
    console:  bySeverity.console.length,
    network:  bySeverity.network.length,
    nav:      bySeverity.nav.length,
    other:    bySeverity.other.length,
  },
  byTab,
  critical: bySeverity.critical,
  consoleErrors: bySeverity.console.slice(0, 40),
  networkGrouped: netGrouped,
  networkSample: bySeverity.network.slice(0, 20),
  nav: bySeverity.nav,
  other: bySeverity.other,
};

const outPath = path.join(__dirname, 'last-tour-report.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(`\n===== SUMMARY =====`);
console.log(JSON.stringify(report.summary, null, 2));
console.log(`\n===== BY TAB =====`);
for (const [t, s] of Object.entries(byTab)) {
  console.log(`  ${t.padEnd(8)}  total=${s.total}  critical=${s.critical}  console=${s.console}  network=${s.network}  nav=${s.nav}  other=${s.other}`);
}
if (bySeverity.critical.length > 0) {
  console.log(`\n===== CRITICAL =====`);
  for (const e of bySeverity.critical) {
    console.log(`  [tab=${e.tab}] [${e.kind}] ${e.name || ''} ${e.message || e.text || ''}`);
    if (e.stack) console.log(`    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`);
  }
}
if (Object.keys(netGrouped).length > 0) {
  console.log(`\n===== NETWORK grouped =====`);
  for (const [k, v] of Object.entries(netGrouped)) console.log(`  ${v}×  ${k}`);
}
if (bySeverity.other.length > 0) {
  console.log(`\n===== OTHER =====`);
  for (const e of bySeverity.other) console.log(`  [tab=${e.tab}] [${e.kind}] status=${e.status ?? '-'}  ${e.message || e.text || ''}`);
}

console.log(`\nFull report: ${outPath}`);
process.exit(bySeverity.critical.length > 0 ? 1 : 0);
