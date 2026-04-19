// Fix CRM Fiche React #310 — wrap "V4: Debug mode — Historique des statuts" IIFE in HookIsolator
// Same pattern as NBA fix: 2 useState hooks in a conditional IIFE → React error #310 when tab mounts

const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");
const before = code.length;

// Locate the Status History IIFE by its unique comment
const marker = "V4: Debug mode — Historique des statuts";
const markerIdx = code.indexOf(marker);
if (markerIdx === -1) {
  console.error("ERROR: Status History marker not found — already patched?");
  process.exit(1);
}

// Find the `{(()=>{` right after the marker comment
const iifeOpenPattern = "{(()=>{";
const iifeOpenIdx = code.indexOf(iifeOpenPattern, markerIdx);
if (iifeOpenIdx === -1 || iifeOpenIdx - markerIdx > 200) {
  console.error("ERROR: IIFE open '{(()=>{' not found near Status History marker");
  process.exit(1);
}

// Sanity: body contains the expected useState signatures
const iifeBodyStart = iifeOpenIdx + iifeOpenPattern.length;
const sanity = code.slice(iifeBodyStart, iifeBodyStart + 400);
if (!sanity.includes("histOpen") || !sanity.includes("statusHist") || !sanity.includes("useState")) {
  console.error("ERROR: IIFE body sanity check failed — unexpected content");
  console.error("Got:", sanity.slice(0, 300));
  process.exit(1);
}

// Scan forward with balanced-brace tracking to find matching `})()}`
let depth = 0;
let i = iifeOpenIdx;
let iifeCloseIdx = -1;
let inString = null;
let inLineComment = false;
let inBlockComment = false;
while (i < code.length) {
  const c = code[i];
  const next = code[i + 1];

  if (inLineComment) { if (c === "\n") inLineComment = false; i++; continue; }
  if (inBlockComment) { if (c === "*" && next === "/") { inBlockComment = false; i += 2; continue; } i++; continue; }
  if (!inString) {
    if (c === "/" && next === "/") { inLineComment = true; i += 2; continue; }
    if (c === "/" && next === "*") { inBlockComment = true; i += 2; continue; }
  }

  if (inString) {
    if (c === "\\") { i += 2; continue; }
    if (c === inString) { inString = null; i++; continue; }
    i++; continue;
  }
  if (c === '"' || c === "'" || c === "`") { inString = c; i++; continue; }

  if (c === "{") { depth++; i++; continue; }
  if (c === "}") {
    depth--;
    if (depth === 0) {
      if (code.slice(i - 4, i + 1) === "})()}") {
        iifeCloseIdx = i;
        break;
      } else {
        console.error("ERROR: depth=0 at index", i, "but not matching `})()}` pattern.");
        console.error("Preceding 15 chars:", JSON.stringify(code.slice(i - 15, i + 1)));
        process.exit(1);
      }
    }
    i++; continue;
  }
  i++;
}

if (iifeCloseIdx === -1) {
  console.error("ERROR: could not find matching close of Status History IIFE");
  process.exit(1);
}

console.log(`Found Status History IIFE: ${iifeOpenIdx} → ${iifeCloseIdx} (${iifeCloseIdx - iifeOpenIdx} chars)`);

// Wrap it
const openReplacement = "<HookIsolator>{()=>{";
const closeReplacement = "}}</HookIsolator>";

if (code.slice(iifeOpenIdx, iifeOpenIdx + 7) !== "{(()=>{") {
  console.error("ERROR: open pattern mismatch at", iifeOpenIdx);
  process.exit(1);
}
if (code.slice(iifeCloseIdx - 4, iifeCloseIdx + 1) !== "})()}") {
  console.error("ERROR: close pattern mismatch at", iifeCloseIdx);
  process.exit(1);
}

const body = code.slice(iifeOpenIdx + 7, iifeCloseIdx - 4);
code =
  code.slice(0, iifeOpenIdx) +
  openReplacement +
  body +
  closeReplacement +
  code.slice(iifeCloseIdx + 1);

if (code.length < before - 100 || code.length > before + 100) {
  console.error("ERROR: file length changed too much. Aborting.");
  console.error("Before:", before, "After:", code.length);
  process.exit(1);
}

fs.writeFileSync(file, code);
console.log("Status History IIFE wrapped in HookIsolator");
console.log("Delta:", code.length - before, "chars (expected +25)");
