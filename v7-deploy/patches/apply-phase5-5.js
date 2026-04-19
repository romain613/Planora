// Phase 5.5 — Extract _T (tab-scoped mutable state) to shared/state/tabState.js
// Prerequisite for Phase 6 public component extractions.

const fs = require("fs");
const path = require("path");

const APP_JSX = process.argv[2] || "/var/www/planora/app/src/App.jsx";
const DRY = process.argv.includes("--dry-run");

if (!fs.existsSync(APP_JSX)) { console.error("[FAIL] App.jsx not found:", APP_JSX); process.exit(1); }

const srcDir = path.dirname(APP_JSX);
const stateDir = path.join(srcDir, "shared", "state");

const original = fs.readFileSync(APP_JSX, "utf8");

if (original.includes('from "./shared/state/tabState"')) {
  console.log("[OK] Already patched. No-op.");
  process.exit(0);
}

// Locate _T definition: starts at `// ─── V3: TAB-SCOPED STATE` comment,
// spans until the closing `};` of the object literal.
const START_MARKER = "// ─── V3: TAB-SCOPED STATE";
const startIdx = original.indexOf(START_MARKER);
if (startIdx < 0) { console.error("[FAIL] _T start marker not found"); process.exit(2); }

// Find `const _T = {` after the comment
const constMarker = "const _T = {";
const constIdx = original.indexOf(constMarker, startIdx);
if (constIdx < 0 || constIdx - startIdx > 500) { console.error("[FAIL] const _T not found near marker"); process.exit(3); }

// Balanced scan to find closing `};`
function findObjEnd(src, openBraceIdx) {
  let depth = 0, started = false;
  let inStr = null, inTpl = false, inLC = false, inBC = false;
  for (let i = openBraceIdx; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLC) { if (c === "\n") inLC = false; continue; }
    if (inBC) { if (c === "*" && n === "/") { inBC = false; i++; } continue; }
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (inTpl) { if (c === "\\") { i++; continue; } if (c === "`") inTpl = false; continue; }
    if (c === "/" && n === "/") { inLC = true; i++; continue; }
    if (c === "/" && n === "*") { inBC = true; i++; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "`") { inTpl = true; continue; }
    if (c === "{" || c === "(" || c === "[") { depth++; started = true; continue; }
    if (c === "}" || c === ")" || c === "]") { depth--; if (started && depth === 0) return i; }
  }
  return -1;
}

const openBrace = original.indexOf("{", constIdx);
const closeBrace = findObjEnd(original, openBrace);
if (closeBrace < 0) { console.error("[FAIL] _T object end not found"); process.exit(4); }

// The full block to move: from START_MARKER comment to the `};` inclusive
// Find the `;` after the closing brace
let endOfStmt = closeBrace + 1;
while (endOfStmt < original.length && /[ \t]/.test(original[endOfStmt])) endOfStmt++;
if (original[endOfStmt] !== ";") { console.error("[FAIL] expected ';' after _T object"); process.exit(5); }
endOfStmt++; // include the `;`

const fullBlock = original.slice(startIdx, endOfStmt);
const tBody = original.slice(constIdx, endOfStmt);  // just `const _T = {...};`

// Build shared/state/tabState.js content
const NEW_FILE = `// shared/state/tabState.js — Tab-scoped volatile state.
// Each browser tab gets its own module instance, so _T is automatically
// isolated per tab. Do NOT persist, do NOT share across tabs. Replaces
// window._ usage to avoid cross-tab collisions.

export ${tBody}
`;

// Build patched App.jsx: remove the _T block, add import at top
let patched = original.slice(0, startIdx) + original.slice(endOfStmt);
// Trim extra blank line if any
if (patched[startIdx] === "\n") patched = patched.slice(0, startIdx) + patched.slice(startIdx + 1);

// Insert import after the first two imports (React + twilio)
const ANCHOR = "import { Device as TwilioDevice } from '@twilio/voice-sdk';";
const ai = patched.indexOf(ANCHOR);
if (ai < 0) { console.error("[FAIL] import anchor not found"); process.exit(6); }
const insertAt = ai + ANCHOR.length;
const NEW_IMPORT = '\n\n// Phase 5.5 — tab-scoped state\nimport { _T } from "./shared/state/tabState";';
patched = patched.slice(0, insertAt) + NEW_IMPORT + patched.slice(insertAt);

// Sanity: no duplicate _T definition
if (/\bconst _T = \{/.test(patched)) { console.error("[FAIL] _T definition still present in patched"); process.exit(7); }

if (DRY) {
  console.log("[DRY-RUN] Phase 5.5 — _T extraction");
  console.log("  Would create:", path.join(stateDir, "tabState.js"), "(" + NEW_FILE.length + " bytes)");
  console.log("  App.jsx delta:", patched.length - original.length, "chars");
  console.log("  _T block removed:", fullBlock.length, "chars");
  process.exit(0);
}

const ts = new Date().toISOString().replace(/[:.]/g, "-");
fs.copyFileSync(APP_JSX, APP_JSX + ".pre-phase5-5-" + ts);
console.log("[BACKUP]", APP_JSX + ".pre-phase5-5-" + ts);

fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(path.join(stateDir, "tabState.js"), NEW_FILE);
console.log("[CREATE]", path.join(stateDir, "tabState.js"));

fs.writeFileSync(APP_JSX, patched);
console.log("[PATCH]", APP_JSX, "(delta", patched.length - original.length, "chars)");
console.log("[OK] Phase 5.5 applied.");
