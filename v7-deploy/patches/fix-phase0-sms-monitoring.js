// Phase 0 — Wrap sms-monitoring IIFE in HookIsolator
//
// Root cause (same classe-16 bug as NBA/StatusHistory, already fixed):
//   {portalTab === "sms-monitoring" && (()=>{
//     const [smsData, setSmsData] = useState(...);       // hooks 1-4
//     const [smsSearch, setSmsSearch] = useState('');
//     const [smsFilter, setSmsFilter] = useState(...);
//     const [smsPage, setSmsPage] = useState(0);
//     useEffect(()=>{ ... });                            // hook 5
//     return (...);
//   })()}
//
// When the collab is NOT on the sms-monitoring tab, these 5 hooks don't execute.
// The hook counter on the parent CollabPortal drops by 5 vs. when the tab IS active.
// Switching back → React error #310 ("Rendered more hooks than during the previous render").
//
// Fix: wrap the IIFE in <HookIsolator>{()=>{...}}</HookIsolator> so the hooks live on
// the HookIsolator fiber (mount/unmount cleanly with the tab), not on CollabPortal.
//
// Idempotent: re-running detects the patch and exits cleanly.
// Backup: App.jsx.pre-phase0-<ISO-timestamp> is created before modification.

const fs = require("fs");
const path = require("path");

const APP_JSX = process.argv[2] || "/var/www/planora/app/src/App.jsx";

if (!fs.existsSync(APP_JSX)) {
  console.error("[FAIL] App.jsx not found at", APP_JSX);
  process.exit(1);
}

const original = fs.readFileSync(APP_JSX, "utf8");

// ── Idempotency check ──
if (original.includes('portalTab === "sms-monitoring" && <HookIsolator>')) {
  console.log("[OK] Already patched (HookIsolator wrap detected). No-op.");
  process.exit(0);
}

// ── Locate the IIFE opening ──
const OPEN_MARK = '{portalTab === "sms-monitoring" && (()=>{';
const openIdx = original.indexOf(OPEN_MARK);
if (openIdx < 0) {
  console.error("[FAIL] Could not locate sms-monitoring IIFE opening marker.");
  console.error("       Expected:", OPEN_MARK);
  process.exit(2);
}

// Ensure uniqueness — there must be only ONE such marker
if (original.indexOf(OPEN_MARK, openIdx + 1) >= 0) {
  console.error("[FAIL] Multiple occurrences of the marker — ambiguous. Aborting.");
  process.exit(3);
}

// ── Sanity check: the IIFE body must contain the 5 expected hooks ──
const peekStart = openIdx + OPEN_MARK.length;
const peek = original.slice(peekStart, peekStart + 1000);
const expectedTokens = ["smsData", "smsSearch", "smsFilter", "smsPage", "useState", "useEffect"];
for (const tok of expectedTokens) {
  if (!peek.includes(tok)) {
    console.error("[FAIL] Sanity check failed — expected token not found in IIFE body:", tok);
    console.error("       Peek (first 300 chars):", peek.slice(0, 300));
    process.exit(4);
  }
}

// ── Balanced-brace scan to find matching `})()}` ──
// Starts at the outer `{` of `{portalTab === ...` so depth returns to 0 at the final `}`.
function findBalancedEnd(src, startIdx) {
  let depth = 0;
  let started = false;
  let inStr = null;
  let inTpl = false;
  let inLineC = false;
  let inBlockC = false;
  for (let i = startIdx; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (inLineC) { if (c === "\n") inLineC = false; continue; }
    if (inBlockC) { if (c === "*" && n === "/") { inBlockC = false; i++; } continue; }
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (inTpl) { if (c === "\\") { i++; continue; } if (c === "`") inTpl = false; continue; }
    if (c === "/" && n === "/") { inLineC = true; i++; continue; }
    if (c === "/" && n === "*") { inBlockC = true; i++; continue; }
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

const endIdx = findBalancedEnd(original, openIdx);
if (endIdx < 0) {
  console.error("[FAIL] Could not find matching end of IIFE (brace balance broken).");
  process.exit(5);
}

// ── Verify the tail is exactly `})()}` ──
const fullBlock = original.slice(openIdx, endIdx + 1);
const tail = fullBlock.slice(-5);
if (tail !== "})()}") {
  console.error("[FAIL] Unexpected tail — got", JSON.stringify(tail), 'expected "})()}"');
  console.error("       Block length:", fullBlock.length);
  process.exit(6);
}

// ── Build the replacement ──
// Before: `{portalTab === "sms-monitoring" && (()=>{` ... body ... `})()}`
// After:  `{portalTab === "sms-monitoring" && <HookIsolator>{()=>{` ... body ... `}}</HookIsolator>}`
//
// Body is bit-for-bit identical — only the wrapping tokens change.

const body = fullBlock.slice(OPEN_MARK.length, fullBlock.length - 5);
const replacement =
  '{portalTab === "sms-monitoring" && <HookIsolator>{()=>{' +
  body +
  "}}</HookIsolator>}";

const patched =
  original.slice(0, openIdx) + replacement + original.slice(endIdx + 1);

// ── Invariant: body of the IIFE must be byte-identical between original and patched ──
const originalBody = fullBlock.slice(OPEN_MARK.length, fullBlock.length - 5);
const patchedStartAfterOpen = openIdx + '{portalTab === "sms-monitoring" && <HookIsolator>{()=>{'.length;
const patchedBody = patched.slice(
  patchedStartAfterOpen,
  patchedStartAfterOpen + body.length
);
if (originalBody !== patchedBody) {
  console.error("[FAIL] Body integrity check failed — aborting write.");
  process.exit(7);
}

// ── Dry run mode ──
const DRY = process.argv.includes("--dry-run");
if (DRY) {
  console.log("[DRY-RUN] Would patch", APP_JSX);
  console.log("[DRY-RUN] IIFE open offset:", openIdx);
  console.log("[DRY-RUN] IIFE close offset:", endIdx);
  console.log("[DRY-RUN] IIFE body length (unchanged):", body.length, "chars");
  console.log("[DRY-RUN] Size delta:", patched.length - original.length, "chars");
  console.log();
  console.log("─── BEFORE (opening line) ───");
  console.log(original.slice(Math.max(0, openIdx - 20), openIdx + OPEN_MARK.length + 5));
  console.log();
  console.log("─── AFTER (opening line) ───");
  console.log(patched.slice(Math.max(0, openIdx - 20), openIdx + '{portalTab === "sms-monitoring" && <HookIsolator>{()=>{'.length + 5));
  console.log();
  console.log("─── BEFORE (closing line) ───");
  console.log(original.slice(endIdx - 10, endIdx + 1));
  console.log();
  console.log("─── AFTER (closing line) ───");
  const newEndIdx = openIdx + replacement.length - 1;
  console.log(patched.slice(newEndIdx - 20, newEndIdx + 1));
  console.log();
  console.log("[DRY-RUN] No files modified.");
  process.exit(0);
}

// ── Backup ──
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = APP_JSX + ".pre-phase0-" + ts;
fs.copyFileSync(APP_JSX, backupPath);
console.log("[BACKUP]", backupPath);

// ── Write ──
fs.writeFileSync(APP_JSX, patched);
console.log("[PATCH] Applied to", APP_JSX);
console.log("[PATCH] Size delta:", patched.length - original.length, "chars (expected +27)");
console.log("[PATCH] IIFE body bytes preserved:", body.length);
console.log("[OK] Phase 0 patch applied. Next: npm run build + copy to httpdocs.");
