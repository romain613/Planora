// Audit complet Phase 14b — orphelins dans les tabs extraits.
// Catégories :
//   A. imports manquants  : JSX <Foo/> utilisé mais Foo non importé/destructuré/déclaré
//   B. provider incomplet : symbole destructuré depuis Context mais absent du Provider value
//   C. symbole mort       : destructuré mais jamais utilisé (ou shadowed localement)
//   D. defensive pattern  : `typeof X !== 'undefined' ? X : ...` = branchement incomplet
//
// Usage: node ops/smoke/audit-collab-orphans.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TABS_DIR = path.join(ROOT, 'app/src/features/collab/tabs');
const PORTAL = path.join(ROOT, 'app/src/features/collab/CollabPortal.jsx');
const CTX = path.join(ROOT, 'app/src/features/collab/context/CollabContext.jsx');

const GLOBALS = new Set([
  'React','Fragment','Math','Object','Array','Date','Promise','JSON','Map','Set',
  'Number','String','Boolean','Error','RegExp','Symbol','Proxy',
  'PropTypes','IntersectionObserver','ResizeObserver','FormData','URLSearchParams',
  'Blob','File','FileReader','URL','Audio','Image','HTMLElement','Event',
  'PhoneTab','CrmTab','AgendaTab','HomeTab','ObjectifsTab','AvailabilityTab',
  'MessagesTab','TablesTab','AiProfileTab',
]);

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`/g, '``')
    .replace(/'(?:\\[\s\S]|[^'\\])*'/g, "''")
    .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""');
}

function extractImports(src) {
  const names = new Set();
  const reNamed = /import\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/g;
  let m;
  while ((m = reNamed.exec(src)) !== null) {
    m[1].split(',').forEach(x => {
      const clean = x.split(/\s+as\s+/)[1] || x;
      const n = clean.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    });
  }
  const reDefault = /import\s+([A-Za-z_$][\w$]*)\s+from/g;
  while ((m = reDefault.exec(src)) !== null) names.add(m[1]);
  return names;
}

function extractDestructuredContext(src) {
  const names = new Set();
  // find `const { ... } = ctx;` or `... = useCollabContext();`
  const re = /const\s*\{([\s\S]*?)\}\s*=\s*(?:ctx|useCollabContext\s*\(\s*\))/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    m[1].split(/[,\n]/).forEach(x => {
      let s = x.trim();
      s = s.replace(/\/\/.*$/, '').trim();
      if (!s) return;
      // object destructure rename: `foo: bar` → keep `foo`
      s = s.split(':')[0].trim();
      // rest `...foo`
      s = s.replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(s)) names.add(s);
    });
  }
  return names;
}

function extractJsxTags(src) {
  const cleaned = stripCommentsAndStrings(src);
  const tags = new Set();
  const re = /<([A-Z][A-Za-z0-9_]*)/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) tags.add(m[1]);
  return tags;
}

function extractLocalDecls(src) {
  const cleaned = stripCommentsAndStrings(src);
  const names = new Set();
  const patterns = [
    /\bconst\s+([A-Z][\w$]*)\s*=/g,
    /\blet\s+([A-Z][\w$]*)\s*=/g,
    /\bvar\s+([A-Z][\w$]*)\s*=/g,
    /\bfunction\s+([A-Z][\w$]*)\s*\(/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(cleaned)) !== null) names.add(m[1]);
  }
  return names;
}

function extractProviderValue(src) {
  const anchor = '<CollabProvider value={{';
  const start = src.indexOf(anchor);
  if (start < 0) return new Set();
  let i = start + anchor.length;
  let depth = 2; // on vient de lire `{{`
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  const content = src.substring(start + anchor.length, i);
  const cleaned = stripCommentsAndStrings(content);
  const names = new Set();
  cleaned.split(/[,\n]/).forEach(x => {
    let s = x.trim();
    if (!s) return;
    s = s.split(':')[0].trim();
    s = s.replace(/^\.\.\./, '');
    if (/^[A-Za-z_$][\w$]*$/.test(s)) names.add(s);
  });
  return names;
}

function extractDefensivePatterns(src) {
  const cleaned = stripCommentsAndStrings(src);
  const names = new Set();
  const re = /typeof\s+([A-Za-z_$][\w$]*)\s*!==?\s*''\s*\?\s*\1\s*:/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) names.add(m[1]);
  const re2 = /typeof\s+([A-Za-z_$][\w$]*)\s*===?\s*''function''\s*\?\s*\1\s*:/g;
  while ((m = re2.exec(cleaned)) !== null) names.add(m[1]);
  return names;
}

function countUsages(src, name) {
  const cleaned = stripCommentsAndStrings(src);
  const re = new RegExp('\\b' + name + '\\b', 'g');
  return (cleaned.match(re) || []).length;
}

const portalSrc = fs.readFileSync(PORTAL, 'utf8');
const providerValue = extractProviderValue(portalSrc);
const portalImports = extractImports(portalSrc);

const tabs = fs.readdirSync(TABS_DIR)
  .filter(f => f.endsWith('.jsx') && !f.includes('.bak') && !f.includes('.pre-'));

const report = { summary: {}, tabs: {} };

for (const tab of tabs) {
  const tabName = tab.replace('.jsx', '');
  const src = fs.readFileSync(path.join(TABS_DIR, tab), 'utf8');
  const imports = extractImports(src);
  const destructured = extractDestructuredContext(src);
  const jsxTags = extractJsxTags(src);
  const localDecls = extractLocalDecls(src);
  const defensivePatterns = extractDefensivePatterns(src);

  const available = new Set([...imports, ...destructured, ...localDecls, ...GLOBALS]);

  // Category A — JSX not resolved
  const missingJsx = [...jsxTags]
    .filter(t => !available.has(t))
    .sort();

  // Category B — Destructured but not in Provider value
  const missingFromProvider = [...destructured]
    .filter(s => !providerValue.has(s))
    .sort();

  // Category C — Destructured but usage count == 1 (just the destructure itself) = dead
  const deadDestructure = [...destructured]
    .filter(s => countUsages(src, s) <= 1)
    .sort();

  // Category D — Defensive patterns (signals incomplete branchment)
  const defensive = [...defensivePatterns].sort();

  report.tabs[tabName] = {
    totalImports: imports.size,
    totalDestructured: destructured.size,
    totalJsxTags: jsxTags.size,
    A_missingJsx: missingJsx,
    B_missingFromProvider: missingFromProvider,
    C_deadDestructure: deadDestructure,
    D_defensivePatterns: defensive,
  };
}

report.summary = {
  totalTabs: tabs.length,
  providerValueSize: providerValue.size,
  grandTotals: {
    A: Object.values(report.tabs).reduce((s, t) => s + t.A_missingJsx.length, 0),
    B: Object.values(report.tabs).reduce((s, t) => s + t.B_missingFromProvider.length, 0),
    C: Object.values(report.tabs).reduce((s, t) => s + t.C_deadDestructure.length, 0),
    D: Object.values(report.tabs).reduce((s, t) => s + t.D_defensivePatterns.length, 0),
  },
};

const outPath = path.join(__dirname, 'audit-collab-orphans-report.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
