// Fix V7 Transfer Modal — move from dead code to render JSX
// Current bug: the modal JSX is placed in the function body between useState declarations,
// so it's never returned from the render function. The state updates but the modal never appears.
// Fix: move the modal block from its current position (~line 2918) to inside the main render
// return (~line 3798), right before the Notification toast.

const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");
const before = code.length;

// ─── 1. Find and extract the misplaced modal block ───
const modalMarker = "{/* V7 TRANSFER MODAL */}";
const modalStartIdx = code.indexOf(modalMarker);
if (modalStartIdx === -1) {
  console.error("ERROR: V7 modal marker not found — already relocated?");
  process.exit(1);
}

// Line start of the marker (include leading whitespace)
const modalLineStart = code.lastIndexOf("\n", modalStartIdx) + 1;

// Find the `{v7TransferModal && (` expression after the comment
const innerExprStart = code.indexOf("{v7TransferModal && (", modalStartIdx);
if (innerExprStart === -1) {
  console.error("ERROR: v7TransferModal expression not found");
  process.exit(1);
}

// Scan forward with balanced-brace tracking (respecting strings + comments)
let depth = 0;
let i = innerExprStart;
let innerExprEnd = -1;
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
      innerExprEnd = i;
      break;
    }
    i++; continue;
  }
  i++;
}

if (innerExprEnd === -1) {
  console.error("ERROR: could not find close of v7TransferModal expression");
  process.exit(1);
}

// Find the next const after the modal (the collabChatFloating useState)
const nextConstIdx = code.indexOf("const [collabChatFloating", innerExprEnd);
if (nextConstIdx === -1) {
  console.error("ERROR: could not find const [collabChatFloating");
  process.exit(1);
}

// Line start of the next const
const nextConstLineStart = code.lastIndexOf("\n", nextConstIdx) + 1;

// Extract the modal block (from marker line start to just before next const line)
const modalBlock = code.slice(modalLineStart, nextConstLineStart);
console.log(`Extracted modal block: ${modalBlock.length} chars, starts at pos ${modalLineStart}`);

// Sanity check: the extracted block should contain the full modal
if (!modalBlock.includes("Transférer un contact") || !modalBlock.includes("handleV7Transfer")) {
  console.error("ERROR: extracted block doesn't look like the V7 modal");
  console.error("Preview:", modalBlock.slice(0, 200));
  process.exit(1);
}

// ─── 2. Remove the misplaced block ───
code = code.slice(0, modalLineStart) + code.slice(nextConstLineStart);
console.log(`Removed block, new code length: ${code.length}`);

// ─── 3. Find insertion point: inside render return, before Notification toast ───
const renderMarker = "{/* Notification toast */}";
const renderMarkerIdx = code.indexOf(renderMarker);
if (renderMarkerIdx === -1) {
  console.error("ERROR: Notification toast marker not found in render");
  process.exit(1);
}

// Line start of render marker
const renderMarkerLineStart = code.lastIndexOf("\n", renderMarkerIdx) + 1;

// ─── 4. Insert the modal block (keep original indentation, React doesn't care) ───
code = code.slice(0, renderMarkerLineStart) + modalBlock + code.slice(renderMarkerLineStart);

// ─── 5. Sanity ───
const delta = code.length - before;
console.log(`Final delta: ${delta} chars (expected 0, within ±20 is OK)`);
if (Math.abs(delta) > 20) {
  console.error("WARN: delta unexpectedly large, check manually");
}

// Verify modal is now inside render (should appear ONCE, after `return (` line)
const returnIdx = code.indexOf("  return (");
const newModalIdx = code.indexOf("{/* V7 TRANSFER MODAL */}");
if (newModalIdx > returnIdx && newModalIdx - returnIdx < 2000) {
  console.log(`✓ Modal now inside render return (${newModalIdx - returnIdx} chars after 'return (')`);
} else {
  console.error("WARN: modal not where expected");
}

fs.writeFileSync(file, code);
console.log("Modal relocated to render return — should now be rendered by React");
