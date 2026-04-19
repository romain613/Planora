// Fix Aujourd'hui tab React #310 — wrap NBA IIFE in HookIsolator
// Root cause: 3 hooks (useState x2, useEffect) inside a raw IIFE that only runs
// when portalTab === "home". When tab is not "home", hooks don't execute →
// parent ClientPortal's hook count drops by 3. Switching to "home" again increases
// count by 3 → React error #310.

const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");
const before = code;

// ── Locate the NBA IIFE by its unique comment + useState signature ──
const marker = "{/* ── V5: MES ACTIONS DU JOUR (Next Best Action) ── */}";
const markerIdx = code.indexOf(marker);
if (markerIdx === -1) {
  console.error("ERROR: NBA marker comment not found — already patched?");
  process.exit(1);
}

// Find the `{(()=>{` right after the marker
const iifeOpenPattern = "{(()=>{";
const iifeOpenIdx = code.indexOf(iifeOpenPattern, markerIdx);
if (iifeOpenIdx === -1 || iifeOpenIdx - markerIdx > 200) {
  console.error("ERROR: IIFE open '{(()=>{'not found near NBA marker");
  process.exit(1);
}

// Verify it contains `useState(null)` inside (sanity check)
const iifeBodyStart = iifeOpenIdx + iifeOpenPattern.length;
const sanity = code.slice(iifeBodyStart, iifeBodyStart + 500);
if (!sanity.includes("nbaActions") || !sanity.includes("useState(null)")) {
  console.error("ERROR: IIFE body doesn't look like NBA — sanity failed");
  console.error("Got:", sanity.slice(0, 200));
  process.exit(1);
}

// Find the matching `})()}` closer by balanced-brace scan.
// Start from iifeOpenIdx+1 (skip the opening `{` of the JSX expression)
// Track `{` and `}` balance. We need the `}` that closes the JSX expression.
// The IIFE starts with `{(()=>{` so initial balance after that is:
//   { (outer JSX) + ( + ( + { => we're at depth 4 "braces" but parens don't matter for matching `}`
// Actually simpler: scan for the pattern `})()}` where the final `}` closes the
// outer JSX expression. That pattern should appear at the end of the IIFE.

// Search for the NEXT occurrence of the literal `})()}` following iifeOpenIdx,
// but we want the one at the SAME nesting as the outer JSX `{`.
// Since the NBA IIFE has no nested IIFEs (it only uses .map), the first `})()}`
// after iifeOpenIdx is the right one. But `.map(...)` callbacks might have `}}`
// so we need balanced-brace scanning.

// Stack-based scan, tracking JSX-expression `{...}` nesting starting from iifeOpenIdx
// (the outer `{` of the JSX expression).
let depth = 0;
let i = iifeOpenIdx;
let iifeCloseIdx = -1;
let inString = null; // null, or '"', "'", "`"
let inLineComment = false;
let inBlockComment = false;
while (i < code.length) {
  const c = code[i];
  const prev = code[i - 1];
  const next = code[i + 1];

  // Handle line/block comments
  if (inLineComment) { if (c === "\n") inLineComment = false; i++; continue; }
  if (inBlockComment) { if (c === "*" && next === "/") { inBlockComment = false; i += 2; continue; } i++; continue; }
  if (!inString) {
    if (c === "/" && next === "/") { inLineComment = true; i += 2; continue; }
    if (c === "/" && next === "*") { inBlockComment = true; i += 2; continue; }
  }

  // Handle strings
  if (inString) {
    if (c === "\\") { i += 2; continue; }
    if (c === inString) { inString = null; i++; continue; }
    // Template literal expression: ${...} — we don't track braces inside template
    // but NBA IIFE uses template literals only for simple API url, so we can skip
    // this complexity. If it causes issues we'll refine.
    i++; continue;
  }
  if (c === '"' || c === "'" || c === "`") { inString = c; i++; continue; }

  if (c === "{") { depth++; i++; continue; }
  if (c === "}") {
    depth--;
    if (depth === 0) {
      // Verify this closing `}` is preceded by `})()` making it `})()}`
      if (code.slice(i - 4, i + 1) === "})()}") {
        iifeCloseIdx = i;
        break;
      } else {
        console.error("ERROR: depth=0 at index", i, "but not matching `})()}` pattern.");
        console.error("Preceding 10 chars:", JSON.stringify(code.slice(i - 10, i + 1)));
        process.exit(1);
      }
    }
    i++; continue;
  }
  i++;
}

if (iifeCloseIdx === -1) {
  console.error("ERROR: could not find matching close of NBA IIFE");
  process.exit(1);
}

console.log(`Found NBA IIFE: ${iifeOpenIdx} → ${iifeCloseIdx} (${iifeCloseIdx - iifeOpenIdx} chars)`);

// ── Replace `{(()=>{` with `<HookIsolator>{()=>{` ──
// and `})()}` with `}}</HookIsolator>`
const openReplacement = "<HookIsolator>{()=>{";  // Replaces `{(()=>{`
const closeReplacement = "}}</HookIsolator>";    // Replaces `})()}`

// Sanity: the pattern starts with `{(()=>{` (7 chars) and ends with `})()}` (5 chars)
if (code.slice(iifeOpenIdx, iifeOpenIdx + 7) !== "{(()=>{") {
  console.error("ERROR: open pattern mismatch at", iifeOpenIdx);
  process.exit(1);
}
if (code.slice(iifeCloseIdx - 4, iifeCloseIdx + 1) !== "})()}") {
  console.error("ERROR: close pattern mismatch at", iifeCloseIdx);
  process.exit(1);
}

// Build the new code: slice[0..openIdx] + openReplacement + body + closeReplacement + slice[closeIdx+1..]
const body = code.slice(iifeOpenIdx + 7, iifeCloseIdx - 4);
code =
  code.slice(0, iifeOpenIdx) +
  openReplacement +
  body +
  closeReplacement +
  code.slice(iifeCloseIdx + 1);

// Sanity: re-check we didn't break anything massively
if (code.length < before.length - 100 || code.length > before.length + 100) {
  console.error("ERROR: file length changed too much. Aborting.");
  console.error("Before:", before.length, "After:", code.length);
  process.exit(1);
}

fs.writeFileSync(file, code);
console.log("NBA IIFE wrapped in HookIsolator");
console.log("Delta:", code.length - before.length, "chars");
