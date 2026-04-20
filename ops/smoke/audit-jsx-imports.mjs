// Audit simple et robuste : pour chaque tab, diff JSX tags vs imports/destructure/locals.
// Ne fait pas de stripping aggressive — juste extraction brute des JSX tags et des imports.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TABS_DIR = path.join(ROOT, 'app/src/features/collab/tabs');

// React/JS globals + known in-app components allowed in JSX context
const KNOWN = new Set([
  'React','Fragment','Math','Object','Array','Date','Promise','JSON','Map','Set',
  'Number','String','Boolean','Error','RegExp','Symbol',
  // CSS-in-JS framer / browser APIs
  'Image','Audio','HTMLElement','Event','URL','Blob','FormData',
  // Uppercase constants used as JSX rarely — allow
  'PascalCase',
]);

function extractImports(src) {
  const names = new Set();
  const reNamed = /import\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/g;
  let m;
  while ((m = reNamed.exec(src)) !== null) {
    m[1].split(',').forEach(x => {
      const parts = x.split(/\s+as\s+/);
      const n = (parts[1] || parts[0]).trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    });
  }
  const reDefault = /import\s+([A-Za-z_$][\w$]*)\s+from/g;
  while ((m = reDefault.exec(src)) !== null) names.add(m[1]);
  return names;
}

function extractDestructuredContext(src) {
  const names = new Set();
  const re = /const\s*\{([\s\S]*?)\}\s*=\s*(?:ctx|useCollabContext\s*\(\s*\))/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    m[1].split(/[,\n]/).forEach(x => {
      let s = x.trim().replace(/\/\/.*$/, '').split(':')[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(s)) names.add(s);
    });
  }
  return names;
}

function extractLocalPascalDecls(src) {
  const names = new Set();
  const patterns = [
    /\bconst\s+([A-Z][\w$]*)\s*=/g,
    /\blet\s+([A-Z][\w$]*)\s*=/g,
    /\bfunction\s+([A-Z][\w$]*)\s*\(/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) names.add(m[1]);
  }
  return names;
}

function extractJsxTagsSimple(src) {
  // Brute, no stripping — directly match `<Foo` (capital letter) followed by space/> etc.
  // Filter out: `<React.`, `<T.`, `.Foo`, etc. by restricting to `<PascalCase` only (not member expr)
  const tags = new Set();
  // Only capture when not preceded by `.` or `/` (closing tag)
  const re = /(?<![.\/\w])<([A-Z][A-Za-z0-9_]*)(?=[\s/>])/g;
  let m;
  while ((m = re.exec(src)) !== null) tags.add(m[1]);
  return tags;
}

const tabs = fs.readdirSync(TABS_DIR)
  .filter(f => f.endsWith('.jsx') && !f.includes('.bak') && !f.includes('.pre-'));

const report = {};
let globalMissing = 0;

for (const tab of tabs) {
  const src = fs.readFileSync(path.join(TABS_DIR, tab), 'utf8');
  const imports = extractImports(src);
  const destructured = extractDestructuredContext(src);
  const locals = extractLocalPascalDecls(src);
  const jsxTags = extractJsxTagsSimple(src);

  const available = new Set([...imports, ...destructured, ...locals, ...KNOWN]);
  const tabName = tab.replace('.jsx', '');
  available.add(tabName); // the component itself

  const missing = [...jsxTags]
    .filter(t => !available.has(t))
    .sort();

  report[tabName] = { jsxUsed: [...jsxTags].sort(), missing };
  globalMissing += missing.length;
}

console.log(JSON.stringify({ total_missing: globalMissing, tabs: report }, null, 2));
