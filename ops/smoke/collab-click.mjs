// Collab portal — non-destructive click tour (v3).
//
// After login, for each tab: render → 1 safe click → close → capture errors.
// Each emitted event is tagged with `tab` (which tab was active) and
// `phase` (render / click / close), so you can tell whether a bug came
// from render or from a click.
//
// Safety model: the clicker only targets "card / row / listitem" style
// selectors and filters out any element whose visible text matches a
// destructive verb (supprimer, envoyer, créer, appeler, …). If no safe
// target is found in a tab, it emits a soft `interaction` note and moves on.
//
// Usage:
//   SMOKE_EMAIL='…' SMOKE_PASS='…' node collab-click.mjs
//   SMOKE_SESSION='…' SMOKE_TOUR='phone,crm' node collab-click.mjs
//   SMOKE_HEADLESS=0 SMOKE_SCREENSHOTS=1 node collab-click.mjs
//
// Report: ops/smoke/last-click-report.json
// Screenshots (optional): ops/smoke/screenshots/<tab>-<phase>.png

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TARGET      = process.env.SMOKE_URL       || 'https://calendar360.fr/';
const SESSION     = process.env.SMOKE_SESSION   || '';
const LOGIN_EMAIL = process.env.SMOKE_EMAIL     || '';
const LOGIN_PASS  = process.env.SMOKE_PASS      || '';
const NAV_TIMEOUT = parseInt(process.env.SMOKE_TIMEOUT     || '30000', 10);
const TAB_WAIT    = parseInt(process.env.SMOKE_TAB_WAIT    || '4000',  10);
const CLICK_WAIT  = parseInt(process.env.SMOKE_CLICK_WAIT  || '2500',  10);
const HEADLESS    = process.env.SMOKE_HEADLESS !== '0';
const SCREENSHOTS = process.env.SMOKE_SCREENSHOTS === '1';

const DEFAULT_TOUR = ['home', 'phone', 'crm', 'agenda'];
const TOUR = (process.env.SMOKE_TOUR || DEFAULT_TOUR.join(','))
  .split(',').map(s => s.trim()).filter(Boolean);

// Destructive verbs we NEVER click. Matches anywhere in the element's
// visible text (case-insensitive).
const DESTRUCTIVE = /(supprimer|delete|envoyer|send|cr[ée]er|ajouter|add|appeler|\bcall\b|logout|d[ée]connect|archiver|archive|retirer|remove|publier|publish|enregistrer|save|confirmer|confirm|valider|transf[eé]rer|transfer|payer|\bpay\b|d[ée]marrer|start|annuler|cancel)/i;

// Selectors likely to be a read-only card / row / list item
const SAFE_SELECTORS = [
  '[data-pipeline-card]',
  '[data-contact-card]',
  '[data-testid*="card" i]',
  '[data-testid*="row" i]',
  '[role="listitem"]',
  '[role="row"]',
  '[role="article"]',
  'tr[class*="row" i]',
  'div[class*="Card" i]',
  'div[class*="pipeline-card" i]',
  'div[class*="contact-card" i]',
];

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
      ctxRef.events.push({
        tab: ctxRef.tab, phase: ctxRef.phase,
        kind: 'console.error', text: msg.text(), location: msg.location(),
      });
    } else if (type === 'warning') {
      const t = msg.text();
      if (/(React|hook|key=|deprecated|TDZ|before initialization)/i.test(t)) {
        ctxRef.events.push({
          tab: ctxRef.tab, phase: ctxRef.phase,
          kind: 'console.warn', text: t, location: msg.location(),
        });
      }
    }
  });
  page.on('pageerror', err => {
    ctxRef.events.push({
      tab: ctxRef.tab, phase: ctxRef.phase,
      kind: 'pageerror', name: err.name, message: err.message,
      stack: (err.stack || '').split('\n').slice(0, 6).join('\n'),
    });
  });
  page.on('response', res => {
    const s = res.status();
    if (s >= 400) {
      ctxRef.events.push({
        tab: ctxRef.tab, phase: ctxRef.phase,
        kind: 'network', status: s, url: res.url(), method: res.request().method(),
      });
    }
  });
  page.on('requestfailed', req => {
    ctxRef.events.push({
      tab: ctxRef.tab, phase: ctxRef.phase,
      kind: 'request-failed', url: req.url(), failure: req.failure()?.errorText,
    });
  });
}

async function findFirstSafeClickable(page) {
  for (const sel of SAFE_SELECTORS) {
    const loc = page.locator(sel);
    const count = await loc.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 5); i++) {
      const el = loc.nth(i);
      try {
        if (!(await el.isVisible({ timeout: 200 }))) continue;
        const text = ((await el.innerText({ timeout: 500 })) || '').trim();
        if (!text) continue;
        if (DESTRUCTIVE.test(text.slice(0, 200))) continue;
        return { locator: el, selector: sel, textPreview: text.replace(/\s+/g, ' ').slice(0, 80) };
      } catch { /* try next */ }
    }
  }
  return null;
}

async function maybeScreenshot(page, tab, phase) {
  if (!SCREENSHOTS) return;
  const dir = path.join(__dirname, 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${tab}-${phase}.png`), fullPage: false }).catch(() => {});
}

const browser = await chromium.launch({ headless: HEADLESS });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
const page    = await context.newPage();

const ctxRef = { tab: 'auth', phase: 'login', events: [], interactions: [] };
attachListeners(page, ctxRef);

// 1) Navigate + authenticate
await page.goto(TARGET, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT })
  .catch(e => ctxRef.events.push({ tab: 'auth', phase: 'login', kind: 'nav', message: e.message }));

let loginMethod = 'none';
if (SESSION) {
  loginMethod = 'session-injection';
  await page.evaluate(tok => localStorage.setItem('calendar360-session', tok), SESSION)
    .catch(e => ctxRef.events.push({ tab: 'auth', phase: 'login', kind: 'session-inject', message: e.message }));
} else if (LOGIN_EMAIL && LOGIN_PASS) {
  loginMethod = 'api-login';
  try {
    const { status, body } = await apiLogin(TARGET, LOGIN_EMAIL, LOGIN_PASS);
    if (status !== 200 || !body?.session) {
      ctxRef.events.push({ tab: 'auth', phase: 'login', kind: 'api-login', status, message: body?.error || body?.raw || 'no session returned' });
    } else {
      await page.evaluate(tok => localStorage.setItem('calendar360-session', tok), JSON.stringify(body.session));
    }
  } catch (e) {
    ctxRef.events.push({ tab: 'auth', phase: 'login', kind: 'api-login', message: e.message });
  }
}

// Fail-fast: if an auth method was requested but produced an error event,
// the tour is meaningless (all page.goto would load the public landing).
const authRequested = (SESSION || (LOGIN_EMAIL && LOGIN_PASS));
const authFailed = !!authRequested && ctxRef.events.some(e =>
  e.phase === 'login' && ['api-login', 'session-inject'].includes(e.kind)
);
if (authFailed) {
  console.error(`\n[FATAL] Authentication failed — aborting tour (no tab will be tested).`);
  for (const e of ctxRef.events.filter(x => x.phase === 'login')) {
    console.error(`  [${e.kind}] status=${e.status ?? '-'}  ${e.message || e.text || ''}`);
  }
}

// 2) Tour with safe click on each tab
console.log(`[${stamp()}] Click-tour start: login=${loginMethod}  tabs=${TOUR.join(',')}  screenshots=${SCREENSHOTS}`);

for (const tab of (authFailed ? [] : TOUR)) {
  // -- 2a) render phase
  ctxRef.tab = tab;
  ctxRef.phase = 'render';
  const beforeRender = ctxRef.events.length;
  try {
    await page.evaluate(id => localStorage.setItem('c360-portalTab', id), tab);
    await page.goto(TARGET, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(TAB_WAIT);
  } catch (e) {
    ctxRef.events.push({ tab, phase: 'render', kind: 'tab-nav', message: e.message });
  }
  await maybeScreenshot(page, tab, 'render');
  const renderErrs = ctxRef.events.length - beforeRender;

  // -- 2b) click phase: find 1 safe target, click it, wait
  ctxRef.phase = 'click';
  const beforeClick = ctxRef.events.length;
  const target = await findFirstSafeClickable(page);
  let interactionInfo;
  if (!target) {
    interactionInfo = { tab, result: 'no-safe-target' };
    ctxRef.events.push({ tab, phase: 'click', kind: 'interaction', message: 'no safe clickable found' });
  } else {
    interactionInfo = { tab, result: 'clicked', selector: target.selector, textPreview: target.textPreview };
    try {
      await target.locator.click({ timeout: 3000 });
      await page.waitForTimeout(CLICK_WAIT);
    } catch (e) {
      interactionInfo.result = 'click-failed';
      interactionInfo.error = e.message;
      ctxRef.events.push({ tab, phase: 'click', kind: 'interaction', message: `click failed: ${e.message}`, textPreview: target.textPreview });
    }
  }
  await maybeScreenshot(page, tab, 'click');
  const clickErrs = ctxRef.events.length - beforeClick;
  ctxRef.interactions.push(interactionInfo);

  // -- 2c) close phase: press Escape to dismiss any opened modal/panel
  ctxRef.phase = 'close';
  const beforeClose = ctxRef.events.length;
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch { /* ignore */ }
  const closeErrs = ctxRef.events.length - beforeClose;

  console.log(`[${stamp()}] Tab "${tab}": render=${renderErrs}  click=${clickErrs}  close=${closeErrs}  target=${interactionInfo.result}${target ? ` "${target.textPreview}"` : ''}`);
}

await browser.close();

// 3) Classification + report
const KIND_BUCKETS = {
  critical: ['pageerror', 'errorBoundary'],
  console:  ['console.error', 'console.warn'],
  network:  ['network', 'request-failed'],
  nav:      ['nav', 'reload', 'login-form', 'session-inject', 'api-login', 'tab-nav'],
  interaction: ['interaction'],
};
const KNOWN_KINDS = new Set([].concat(...Object.values(KIND_BUCKETS)));
const bySeverity = Object.fromEntries(
  Object.entries(KIND_BUCKETS).map(([b, list]) => [b, ctxRef.events.filter(e => list.includes(e.kind))])
);
bySeverity.other = ctxRef.events.filter(e => !KNOWN_KINDS.has(e.kind));

// Breakdown by tab × phase
const byTabPhase = {};
for (const e of ctxRef.events) {
  const t = e.tab || '?';
  const p = e.phase || '?';
  const key = `${t}/${p}`;
  byTabPhase[key] ??= { total: 0, critical: 0, console: 0, network: 0, nav: 0, interaction: 0, other: 0 };
  byTabPhase[key].total++;
  if (KIND_BUCKETS.critical.includes(e.kind))         byTabPhase[key].critical++;
  else if (KIND_BUCKETS.console.includes(e.kind))     byTabPhase[key].console++;
  else if (KIND_BUCKETS.network.includes(e.kind))     byTabPhase[key].network++;
  else if (KIND_BUCKETS.nav.includes(e.kind))         byTabPhase[key].nav++;
  else if (KIND_BUCKETS.interaction.includes(e.kind)) byTabPhase[key].interaction++;
  else                                                 byTabPhase[key].other++;
}

const netGrouped = {};
for (const e of bySeverity.network) {
  const key = `[${e.tab}/${e.phase}] ${e.status || 'FAIL'} ${e.method || ''} ${(e.url || '').replace(/\?.*$/, '?…')}`;
  netGrouped[key] = (netGrouped[key] || 0) + 1;
}

const report = {
  target: TARGET,
  tour: TOUR,
  timestamp: stamp(),
  loginMethod,
  interactions: ctxRef.interactions,
  summary: {
    total:       ctxRef.events.length,
    critical:    bySeverity.critical.length,
    console:     bySeverity.console.length,
    network:     bySeverity.network.length,
    nav:         bySeverity.nav.length,
    interaction: bySeverity.interaction.length,
    other:       bySeverity.other.length,
  },
  byTabPhase,
  critical: bySeverity.critical,
  consoleErrors: bySeverity.console.slice(0, 40),
  networkGrouped: netGrouped,
  networkSample: bySeverity.network.slice(0, 20),
  nav: bySeverity.nav,
  other: bySeverity.other,
  interaction: bySeverity.interaction,
};

const outPath = path.join(__dirname, 'last-click-report.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(`\n===== SUMMARY =====`);
console.log(JSON.stringify(report.summary, null, 2));

console.log(`\n===== BY TAB × PHASE =====`);
for (const [k, s] of Object.entries(byTabPhase)) {
  console.log(`  ${k.padEnd(18)}  total=${s.total}  crit=${s.critical}  cons=${s.console}  net=${s.network}  nav=${s.nav}  interact=${s.interaction}  other=${s.other}`);
}

console.log(`\n===== INTERACTIONS =====`);
for (const i of ctxRef.interactions) {
  console.log(`  [${i.tab}] ${i.result}${i.selector ? ` via ${i.selector}` : ''}${i.textPreview ? ` — "${i.textPreview}"` : ''}${i.error ? ` — ${i.error}` : ''}`);
}

if (bySeverity.critical.length > 0) {
  console.log(`\n===== CRITICAL =====`);
  for (const e of bySeverity.critical) {
    console.log(`  [tab=${e.tab}/${e.phase}] [${e.kind}] ${e.name || ''} ${e.message || e.text || ''}`);
    if (e.stack) console.log(`    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`);
  }
}
if (Object.keys(netGrouped).length > 0) {
  console.log(`\n===== NETWORK grouped =====`);
  for (const [k, v] of Object.entries(netGrouped)) console.log(`  ${v}×  ${k}`);
}
if (bySeverity.other.length > 0) {
  console.log(`\n===== OTHER =====`);
  for (const e of bySeverity.other) console.log(`  [${e.tab}/${e.phase}] [${e.kind}] status=${e.status ?? '-'}  ${e.message || e.text || ''}`);
}

console.log(`\nFull report: ${outPath}`);
process.exit((authFailed || bySeverity.critical.length > 0) ? 1 : 0);
