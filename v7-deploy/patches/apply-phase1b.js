// Phase 1B — Extract 20 UI atomic components from App.jsx
//
// Creates app/src/components/ui/<Component>.jsx + index.js barrel.
// Each component imports only what it needs (T from theme, I/Card/Btn
// from sibling files). Zero logic or style change.
//
// Idempotent. Auto-backup. Uses balanced paren/brace scanner to find
// the end of each definition — resilient to signature changes inside
// the block.

const fs = require("fs");
const path = require("path");

const APP_JSX = process.argv[2] || "/var/www/planora/app/src/App.jsx";
const DRY = process.argv.includes("--dry-run");

if (!fs.existsSync(APP_JSX)) {
  console.error("[FAIL] App.jsx not found:", APP_JSX);
  process.exit(1);
}

const srcDir = path.dirname(APP_JSX);
const uiDir = path.join(srcDir, "components", "ui");

const original = fs.readFileSync(APP_JSX, "utf8");

// ── Idempotency ──
if (original.includes('from "./components/ui"') || original.includes("from './components/ui'")) {
  console.log("[OK] Already patched (components/ui import detected). No-op.");
  process.exit(0);
}

// ── Balanced-close scanner (skips strings/templates/comments) ──
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

// ── Extract a complete definition given its unique first-line marker ──
// Handles: `const X = (...) => (...);`, `const X = (...) => {...};`,
//          `const X = (...) => <jsx/>;`, `function X(...) {...}`, `class X {...}`.
function extractDefinition(src, firstLine, debugName) {
  const start = src.indexOf(firstLine);
  if (start < 0) {
    throw new Error("Start marker not found for " + debugName + ":\n  " + firstLine);
  }
  // Uniqueness check
  if (src.indexOf(firstLine, start + 1) >= 0) {
    throw new Error("Ambiguous start marker for " + debugName + " (multiple occurrences)");
  }

  // For `function` and `class`: find body `{` at paren-depth 0 from `start`
  if (firstLine.startsWith("function ") || firstLine.startsWith("class ")) {
    let depth = 0, brace = -1;
    for (let i = start + firstLine.indexOf(firstLine.startsWith("function ") ? "(" : "{"); i < src.length; i++) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "{" && depth === 0) { brace = i; break; }
    }
    if (brace < 0) throw new Error("Body brace not found for " + debugName);
    const end = findBalancedClose(src, brace);
    if (end < 0) throw new Error("Body end not found for " + debugName);
    return { start, end: end + 1 };
  }

  // Arrow function: find `=>` then the first `(` or `{` after it (or inline JSX)
  const arrow = src.indexOf("=>", start);
  if (arrow < 0) throw new Error("Arrow '=>' not found for " + debugName);
  let i = arrow + 2;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] === "(" || src[i] === "{") {
    const end = findBalancedClose(src, i);
    if (end < 0) throw new Error("Arrow body end not found for " + debugName);
    // Include trailing `;` if present
    let j = end + 1;
    while (j < src.length && /[ \t]/.test(src[j])) j++;
    if (src[j] === ";") return { start, end: j + 1 };
    return { start, end: end + 1 };
  }
  // Inline JSX / expression body: scan to end-of-line `;`
  const semiIdx = src.indexOf(";", start);
  if (semiIdx < 0) throw new Error("Inline ';' not found for " + debugName);
  return { start, end: semiIdx + 1 };
}

// ── Component extraction list ──
// Order here = dependency order (lower first). The `deps` lists sibling
// UI components used inside. `hooks` lists React hooks needed.
const COMPONENTS = [
  // Level 0 (no UI deps)
  { name: "HookIsolator", file: "HookIsolator.jsx", marker: "function HookIsolator({ children })",
    deps: [], hooks: [], preceding: "// HookIsolator: wraps IIFE-with-hooks in a real React component\n// so each tab gets its own hook scope (prevents React #311 on tab switch)\n" },
  { name: "Logo", file: "Logo.jsx", marker: "const Logo = ({ s = 32, rounded = 10 }) =>",
    deps: [], hooks: [] },
  { name: "I", file: "I.jsx", marker: "const I = ({ n, s = 18, style }) =>",
    deps: [], hooks: [] },
  { name: "Avatar", file: "Avatar.jsx", marker: "const Avatar = ({ name, color, size=34 }) =>",
    deps: [], hooks: [] },

  // Level 1 (only T)
  { name: "Badge", file: "Badge.jsx", marker: "const Badge = ({ children, color = T.accent, bg }) =>",
    deps: [], hooks: [], usesTheme: true },
  { name: "Btn", file: "Btn.jsx", marker: "const Btn = ({ children, primary, danger, small, ghost, success, onClick, style:s, disabled, full }) =>",
    deps: [], hooks: [], usesTheme: true },
  { name: "Stars", file: "Stars.jsx", marker: "const Stars = ({ count, max=5, onChange, size=14 }) =>",
    deps: [], hooks: [], usesTheme: true },
  { name: "Toggle", file: "Toggle.jsx", marker: "const Toggle = ({ on, onToggle, label }) =>",
    deps: [], hooks: [], usesTheme: true },
  { name: "LoadBar", file: "LoadBar.jsx", marker: "const LoadBar = ({ ratio }) =>",
    deps: [], hooks: [], usesTheme: true },
  { name: "Card", file: "Card.jsx", marker: "const Card = ({ children, style:s, onClick, ...rest }) =>",
    deps: [], hooks: [], usesTheme: true },
  { name: "Spinner", file: "Spinner.jsx", marker: "const Spinner = ({ size = 20, color }) =>",
    deps: [], hooks: [], usesTheme: true },
  { name: "Req", file: "Req.jsx", marker: "const Req = () => <span",
    deps: [], hooks: [], usesTheme: true },
  { name: "Skeleton", file: "Skeleton.jsx", marker: "const Skeleton = ({ width = \"100%\", height = 16, radius = 6, style: s }) =>",
    deps: [], hooks: [], usesTheme: true },

  // Level 2 (T + I)
  { name: "Input", file: "Input.jsx", marker: "const Input = ({ label, placeholder, value, onChange, icon, type=\"text\", style:s, readOnly, id:inputId }) =>",
    deps: ["I"], hooks: [], usesTheme: true },
  { name: "Stat", file: "Stat.jsx", marker: "const Stat = ({ label, value, icon, color=T.accent, onClick, active }) =>",
    deps: ["I", "Card"], hooks: [], usesTheme: true },
  { name: "Modal", file: "Modal.jsx", marker: "const Modal = ({ open, onClose, title, children, width = 520 }) =>",
    deps: ["I"], hooks: [], usesTheme: true },

  // Level 3 (T + I + Btn)
  { name: "ConfirmModal", file: "ConfirmModal.jsx", marker: "const ConfirmModal = ({ open, onClose, onConfirm, title = \"Confirmation\", message = \"Êtes-vous sûr ?\", confirmText = \"Confirmer\", danger = true }) =>",
    deps: ["I", "Btn"], hooks: [], usesTheme: true },
  { name: "EmptyState", file: "EmptyState.jsx", marker: "const EmptyState = ({ icon = \"inbox\", title = \"Aucun élément\", subtitle, action, onAction }) =>",
    deps: ["I", "Btn"], hooks: [], usesTheme: true },

  // With hooks (isolated, own fiber)
  { name: "HelpTip", file: "HelpTip.jsx", marker: "const HelpTip = ({ text }) =>",
    deps: ["I"], hooks: ["useState", "useRef"], usesTheme: true },
  { name: "ValidatedInput", file: "ValidatedInput.jsx", marker: "const ValidatedInput = ({ label, required, placeholder, value, onChange, icon, type=\"text\", validate, errorMsg, style:s, readOnly, helpTip }) =>",
    deps: ["I", "Req", "HelpTip"], hooks: ["useState"], usesTheme: true },

  // Class-based
  { name: "ErrorBoundary", file: "ErrorBoundary.jsx", marker: "class ErrorBoundary extends React.Component",
    deps: [], hooks: [] },
];

// ── Extract each definition ──
const extracted = [];
for (const c of COMPONENTS) {
  let block;
  try { block = extractDefinition(original, c.marker, c.name); }
  catch (e) { console.error("[FAIL]", e.message); process.exit(2); }
  extracted.push({ ...c, block });
}

// ── Build per-component file content ──
function buildFileContent(c) {
  const lines = [];
  const hooksImport = c.hooks.length > 0
    ? `import { ${c.hooks.join(", ")} } from "react";\n`
    : "";
  const reactImport = c.name === "ErrorBoundary"
    ? `import React from "react";\n`
    : "";
  const themeImport = c.usesTheme ? `import { T } from "../../theme";\n` : "";
  const siblingImports = c.deps.map(d => `import ${d} from "./${d}";`).join("\n");
  const siblingBlock = siblingImports ? siblingImports + "\n" : "";

  const header = reactImport + hooksImport + themeImport + siblingBlock;
  const body = original.slice(c.block.start, c.block.end);

  return header + (header ? "\n" : "") + body + "\n\nexport default " + c.name + ";\n";
}

// ── Build barrel index.js ──
function buildBarrel() {
  const lines = ["// app/src/components/ui/index.js — Phase 1B barrel"];
  for (const c of COMPONENTS) {
    lines.push(`export { default as ${c.name} } from "./${c.name}";`);
  }
  return lines.join("\n") + "\n";
}

// ── Build patched App.jsx ──
// Sort extractions by start descending; remove each from source.
const sorted = [...extracted].sort((a, b) => b.block.start - a.block.start);
let patched = original;
for (const c of sorted) {
  let end = c.block.end;
  // Eat trailing newline to avoid double blank lines
  if (patched[end] === "\n") end++;
  patched = patched.slice(0, c.block.start) + patched.slice(end);
}

// ── Insert barrel import right after Phase 1A imports ──
const IMPORT_ANCHOR = 'import { COMMON_TIMEZONES, genCode } from "./utils/constants";';
const anchorIdx = patched.indexOf(IMPORT_ANCHOR);
if (anchorIdx < 0) {
  console.error("[FAIL] Phase 1A import anchor not found. Is Phase 1A applied?");
  process.exit(3);
}
const insertAt = anchorIdx + IMPORT_ANCHOR.length;
const NEW_IMPORTS =
  "\n\n// Phase 1B — UI atomics barrel\n" +
  "import { " + COMPONENTS.map(c => c.name).join(", ") + ' } from "./components/ui";';

patched = patched.slice(0, insertAt) + NEW_IMPORTS + patched.slice(insertAt);

// ── Sanity: each component's marker should be gone from patched App.jsx ──
for (const c of COMPONENTS) {
  if (patched.includes(c.marker)) {
    console.error("[FAIL] Component still present after patch:", c.name);
    console.error("       Marker:", c.marker);
    process.exit(4);
  }
}
// And the barrel import present
if (!patched.includes('from "./components/ui"')) {
  console.error("[FAIL] Barrel import missing from patched App.jsx");
  process.exit(5);
}

// ── Dry-run output ──
if (DRY) {
  console.log("[DRY-RUN] Phase 1B extraction preview");
  console.log("");
  console.log("Would create", COMPONENTS.length, "component files + index.js in:");
  console.log("  " + uiDir);
  console.log("");
  console.log("App.jsx size:");
  console.log("  Before:", original.length, "chars");
  console.log("  After: ", patched.length, "chars");
  console.log("  Delta: ", patched.length - original.length, "chars");
  console.log("");
  console.log("Per component (start offset, block size, deps, hooks):");
  for (const c of extracted) {
    console.log("  " + c.name.padEnd(18) + "  @" + c.block.start + "  len=" + (c.block.end - c.block.start) +
      "  deps=[" + (c.deps.join(",") || "-") + "]  hooks=[" + (c.hooks.join(",") || "-") + "]");
  }
  console.log("");
  console.log("Barrel import added to App.jsx:");
  console.log("  " + NEW_IMPORTS.trim().split("\n").slice(-1)[0]);
  console.log("");
  console.log("[DRY-RUN] No files written.");
  process.exit(0);
}

// ── Backup App.jsx ──
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = APP_JSX + ".pre-phase1b-" + ts;
fs.copyFileSync(APP_JSX, backupPath);
console.log("[BACKUP]", backupPath);

// ── Write per-component files ──
fs.mkdirSync(uiDir, { recursive: true });
for (const c of extracted) {
  const content = buildFileContent(c);
  const fp = path.join(uiDir, c.file);
  fs.writeFileSync(fp, content);
  console.log("[CREATE]", fp, "(" + content.length + " bytes)");
}

// ── Write barrel ──
const barrelPath = path.join(uiDir, "index.js");
fs.writeFileSync(barrelPath, buildBarrel());
console.log("[CREATE]", barrelPath);

// ── Write patched App.jsx ──
fs.writeFileSync(APP_JSX, patched);
console.log("[PATCH]", APP_JSX);
console.log("[PATCH] Size delta:", patched.length - original.length, "chars");
console.log("[OK] Phase 1B applied —", COMPONENTS.length, "components extracted.");
