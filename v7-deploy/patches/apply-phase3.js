// Phase 3 — Extract API wrapper + related helpers to services/api.js
//
// Prerequisite for screen extractions (Phase 4+): once api() lives in a
// proper module, any extracted screen can import it without prop drilling.
//
// Creates: app/src/services/api.js containing:
//   - API_BASE (const)
//   - recUrl (helper)
//   - collectEnv (helper)
//   - getAutoTicketCompanyId / setAutoTicketCompanyId (getter/setter for
//     the mutable `_autoTicketCompanyId` let, since ESM imports are read-only)
//   - api (wrapper fetch)
//
// Modifies App.jsx to:
//   - Remove the 5 inline definitions (L75-79 + api body)
//   - Rewrite 2 `_autoTicketCompanyId = ...` assignments to
//     `setAutoTicketCompanyId(...)`
//   - Add import from services/api
//
// Idempotent. Auto-backup.

const fs = require("fs");
const path = require("path");

const APP_JSX = process.argv[2] || "/var/www/planora/app/src/App.jsx";
const DRY = process.argv.includes("--dry-run");

if (!fs.existsSync(APP_JSX)) {
  console.error("[FAIL] App.jsx not found:", APP_JSX);
  process.exit(1);
}

const srcDir = path.dirname(APP_JSX);
const servicesDir = path.join(srcDir, "services");

const original = fs.readFileSync(APP_JSX, "utf8");

// ── Idempotency ──
if (original.includes('from "./services/api"') || original.includes("from './services/api'")) {
  console.log("[OK] Already patched. No-op.");
  process.exit(0);
}

// ── Balanced close scanner ──
function findBalancedClose(src, openIdx) {
  let depth = 0, started = false;
  let inStr = null, inTpl = false, inLC = false, inBC = false;
  for (let i = openIdx; i < src.length; i++) {
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
    if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (started && depth === 0) return i;
    }
  }
  return -1;
}

// ── Locate each definition and find its end ──
function findDefinition(src, firstLine, debugName, isArrow) {
  const start = src.indexOf(firstLine);
  if (start < 0) throw new Error("Not found: " + debugName);
  if (src.indexOf(firstLine, start + 1) >= 0) throw new Error("Ambiguous: " + debugName);

  if (isArrow) {
    const arrowIdx = src.indexOf("=>", start);
    let j = arrowIdx + 2;
    while (j < src.length && /\s/.test(src[j])) j++;

    if (src[j] === "{") {
      const close = findBalancedClose(src, j);
      let k = close + 1;
      while (k < src.length && /[ \t]/.test(src[k])) k++;
      if (src[k] === ";") return { start, end: k + 1 };
      return { start, end: close + 1 };
    }
    // Expression body: scan for `;` at depth 0
    let depth = 0, inStr = null, inTpl = false, inLC = false, inBC = false;
    for (let i = j; i < src.length; i++) {
      const c = src[i], n = src[i + 1];
      if (inLC) { if (c === "\n") inLC = false; continue; }
      if (inBC) { if (c === "*" && n === "/") { inBC = false; i++; } continue; }
      if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
      if (inTpl) { if (c === "\\") { i++; continue; } if (c === "`") inTpl = false; continue; }
      if (c === "/" && n === "/") { inLC = true; i++; continue; }
      if (c === "/" && n === "*") { inBC = true; i++; continue; }
      if (c === '"' || c === "'") { inStr = c; continue; }
      if (c === "`") { inTpl = true; continue; }
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth--;
      else if (c === ";" && depth === 0) return { start, end: i + 1 };
    }
    throw new Error("Expression unterminated: " + debugName);
  }

  // Literal `const/let X = expr;`
  const eqIdx = src.indexOf("=", start);
  let i = eqIdx + 1;
  while (i < src.length && /\s/.test(src[i])) i++;
  const c = src[i];
  if (c === "[" || c === "{") {
    const close = findBalancedClose(src, i);
    let j = close + 1;
    while (j < src.length && /[ \t]/.test(src[j])) j++;
    if (src[j] === ";") return { start, end: j + 1 };
    return { start, end: close + 1 };
  }
  // Primitive literal: scan to `;` at depth 0
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const ch = src[k];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === ";" && depth === 0) return { start, end: k + 1 };
  }
  throw new Error("Literal unterminated: " + debugName);
}

// ── Definitions to extract ──
const DEFS = [
  { name: "API_BASE", marker: "const API_BASE = import.meta.env.VITE_API_URL", isArrow: false },
  { name: "recUrl", marker: "const recUrl = (callLogId) =>", isArrow: true },
  { name: "_autoTicketCompanyId", marker: "let _autoTicketCompanyId = null;", isArrow: false },
  { name: "collectEnv", marker: "const collectEnv = () =>", isArrow: true },
  { name: "api", marker: "const api = (path, opts = {}) =>", isArrow: true },
];

const located = DEFS.map(d => {
  try { return { ...d, block: findDefinition(original, d.marker, d.name, d.isArrow) }; }
  catch (e) { console.error("[FAIL]", e.message); process.exit(2); }
});

// ── Build services/api.js content ──
// We keep the original code exactly, just prefix with export and swap
// `let _autoTicketCompanyId = null;` with a getter/setter pair so that
// App.jsx can mutate via function calls (ESM imports are read-only).
function buildApiService() {
  const sorted = [...located].sort((a, b) => a.block.start - b.block.start);
  const parts = ["// services/api.js — Phase 3 extraction of API wrapper + helpers"];
  parts.push("");
  for (const d of sorted) {
    const body = original.slice(d.block.start, d.block.end);
    if (d.name === "_autoTicketCompanyId") {
      // Rewrite as module-local + getter + setter
      parts.push("// _autoTicketCompanyId is mutable; ESM imports are read-only,");
      parts.push("// so we expose getter/setter pairs for App.jsx to mutate safely.");
      parts.push("let _autoTicketCompanyId = null; // set by AdminDash on mount");
      parts.push("export function getAutoTicketCompanyId() { return _autoTicketCompanyId; }");
      parts.push("export function setAutoTicketCompanyId(v) { _autoTicketCompanyId = v; }");
    } else {
      // Prefix `const ... = ...;` with `export`
      parts.push(body.replace(/^const /, "export const "));
    }
    parts.push("");
  }
  return parts.join("\n");
}
const FILE_API = buildApiService();

// ── Build patched App.jsx ──
// 1. Remove extracted definitions
const sorted = [...located].sort((a, b) => b.block.start - a.block.start);
let patched = original;
for (const d of sorted) {
  let end = d.block.end;
  if (patched[end] === "\n") end++;
  patched = patched.slice(0, d.block.start) + patched.slice(end);
}

// 2. Rewrite 2 assignments to _autoTicketCompanyId
const reassignPatterns = [
  { old: "_autoTicketCompanyId = company?.id || null;",
    new: "setAutoTicketCompanyId(company?.id || null);" },
  { old: "_autoTicketCompanyId = null;",
    new: "setAutoTicketCompanyId(null);" },
];
for (const r of reassignPatterns) {
  const count = patched.split(r.old).length - 1;
  if (count === 0) {
    console.error("[FAIL] Expected reassignment not found:", r.old);
    process.exit(3);
  }
  if (count > 1) {
    console.error("[FAIL] Multiple reassignments (" + count + ") — ambiguous:", r.old);
    process.exit(4);
  }
  patched = patched.replace(r.old, r.new);
}

// 3. Insert import after Phase 2 imports
const IMPORT_ANCHOR = '} from "./data/fixtures";';
const anchorIdx = patched.indexOf(IMPORT_ANCHOR);
if (anchorIdx < 0) {
  console.error("[FAIL] Phase 2 import anchor not found. Is Phase 2 applied?");
  process.exit(5);
}
const insertAt = anchorIdx + IMPORT_ANCHOR.length;
const NEW_IMPORTS =
  "\n\n// Phase 3 — API service\n" +
  'import { API_BASE, recUrl, collectEnv, api, getAutoTicketCompanyId, setAutoTicketCompanyId } from "./services/api";';
patched = patched.slice(0, insertAt) + NEW_IMPORTS + patched.slice(insertAt);

// 4. Sanity checks
// Each marker should be gone
for (const d of located) {
  if (patched.includes(d.marker)) {
    console.error("[FAIL] Definition still present:", d.name);
    process.exit(6);
  }
}
// No residual _autoTicketCompanyId direct assignment
if (/\b_autoTicketCompanyId\s*=\s/.test(patched)) {
  console.error("[FAIL] Residual _autoTicketCompanyId = ... assignment.");
  process.exit(7);
}
// Import present
if (!patched.includes('from "./services/api"')) {
  console.error("[FAIL] services/api import missing.");
  process.exit(8);
}

// ── Dry-run ──
if (DRY) {
  console.log("[DRY-RUN] Phase 3 — API service extraction");
  console.log("");
  console.log("Would create:");
  console.log("  " + path.join(servicesDir, "api.js") + " (" + FILE_API.length + " bytes)");
  console.log("");
  console.log("App.jsx size:");
  console.log("  Before:", original.length, "chars");
  console.log("  After: ", patched.length, "chars");
  console.log("  Delta: ", patched.length - original.length, "chars");
  console.log("");
  console.log("Extractions:");
  for (const d of located) {
    console.log("  " + d.name.padEnd(24) + "  @" + d.block.start + "  len=" + (d.block.end - d.block.start));
  }
  console.log("");
  console.log("Assignment rewrites:");
  for (const r of reassignPatterns) {
    console.log("  " + r.old);
    console.log("    →");
    console.log("  " + r.new);
  }
  console.log("");
  console.log("[DRY-RUN] No files written.");
  process.exit(0);
}

// ── Backup ──
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = APP_JSX + ".pre-phase3-" + ts;
fs.copyFileSync(APP_JSX, backupPath);
console.log("[BACKUP]", backupPath);

// ── Write ──
fs.mkdirSync(servicesDir, { recursive: true });
fs.writeFileSync(path.join(servicesDir, "api.js"), FILE_API);
console.log("[CREATE]", path.join(servicesDir, "api.js"));

fs.writeFileSync(APP_JSX, patched);
console.log("[PATCH]", APP_JSX);
console.log("[PATCH] Size delta:", patched.length - original.length, "chars");
console.log("[OK] Phase 3 applied — api service extracted,", located.length, "defs moved.");
