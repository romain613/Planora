// Phase 2 — Extract fixtures + date/pipeline/notification utils from App.jsx
//
// Creates:
//   app/src/utils/dates.js          : DAYS_FR, DAYS_SHORT, MONTHS_FR, getDow, fmtDate
//   app/src/utils/pipeline.js       : PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES
//   app/src/utils/notifications.js  : sendNotification, buildNotifyPayload
//   app/src/data/fixtures.js        : COMPANIES, COMPANY_SETTINGS, defAvail,
//                                     INIT_AVAILS, INIT_COLLABS, INIT_CALS,
//                                     INIT_BOOKINGS, INIT_WORKFLOWS, INIT_ROUTING,
//                                     INIT_POLLS, INIT_CONTACTS, INIT_ALL_COMPANIES,
//                                     INIT_ALL_USERS, INIT_ACTIVITY_LOG
//
// All extracted symbols are pure data/helpers — zero scope dependency,
// zero React state access. Safe to re-route via ESM imports.
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
const dataDir = path.join(srcDir, "data");
const utilsDir = path.join(srcDir, "utils");

const original = fs.readFileSync(APP_JSX, "utf8");

// ── Idempotency ──
if (original.includes('from "./data/fixtures"') || original.includes('from "./utils/dates"')) {
  console.log("[OK] Already patched. No-op.");
  process.exit(0);
}

// ── Balanced close scanner (from Phase 1B) ──
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

// ── Extract a top-level const X = expr; definition ──
// Returns { start, end } where end is AFTER the trailing `;`
function extractConst(src, firstLine, debugName) {
  const start = src.indexOf(firstLine);
  if (start < 0) throw new Error("Start marker not found: " + debugName);
  if (src.indexOf(firstLine, start + 1) >= 0) {
    throw new Error("Ambiguous marker: " + debugName);
  }

  // If the marker contains `=>`, this is an arrow function — find the body
  // AFTER the `=>`, not at the first `(` which is the param list.
  const isArrow = firstLine.includes("=>");

  if (isArrow) {
    const arrowIdx = src.indexOf("=>", start);
    if (arrowIdx < 0) throw new Error("'=>' not found for " + debugName);
    let j = arrowIdx + 2;
    while (j < src.length && /\s/.test(src[j])) j++;

    // Block body: `=> {...}` — balanced brace defines the full body, then `;`
    if (src[j] === "{") {
      const close = findBalancedClose(src, j);
      if (close < 0) throw new Error("Arrow block body unbalanced for " + debugName);
      let k = close + 1;
      while (k < src.length && /[ \t]/.test(src[k])) k++;
      if (src[k] === ";") return { start, end: k + 1 };
      return { start, end: close + 1 };
    }

    // Expression body: `=> expr;` (may include parens, operators, etc.)
    // Scan for `;` at depth 0, respecting strings/templates/comments.
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
    throw new Error("Expression body unterminated for " + debugName);
  }

  // Not an arrow function: direct expression (array, object, literal)
  // Find the `=` after the name
  const eqIdx = src.indexOf("=", start);
  if (eqIdx < 0 || eqIdx > start + 200) throw new Error("'=' not found for " + debugName);
  let i = eqIdx + 1;
  while (i < src.length && /\s/.test(src[i])) i++;
  const c = src[i];
  if (c === "[" || c === "{" || c === "(") {
    const close = findBalancedClose(src, i);
    if (close < 0) throw new Error("Unbalanced for " + debugName);
    let j = close + 1;
    while (j < src.length && /[ \t]/.test(src[j])) j++;
    if (src[j] === ";") return { start, end: j + 1 };
    return { start, end: close + 1 };
  }
  // Literal: scan to `;`
  const semi = src.indexOf(";", i);
  return { start, end: semi + 1 };
}

// ── Definitions to extract ──
const DEFS = [
  // Fixtures
  { name: "COMPANIES", marker: "const COMPANIES = [", target: "fixtures" },
  { name: "INIT_COLLABS", marker: "const INIT_COLLABS = [", target: "fixtures" },
  { name: "defAvail", marker: "const defAvail = () =>", target: "fixtures" },
  { name: "INIT_AVAILS", marker: "const INIT_AVAILS = {", target: "fixtures" },
  { name: "INIT_CALS", marker: "const INIT_CALS = [", target: "fixtures" },
  { name: "INIT_BOOKINGS", marker: "const INIT_BOOKINGS = [", target: "fixtures" },
  { name: "INIT_WORKFLOWS", marker: "const INIT_WORKFLOWS = [", target: "fixtures" },
  { name: "INIT_ROUTING", marker: "const INIT_ROUTING = [", target: "fixtures" },
  { name: "INIT_POLLS", marker: "const INIT_POLLS = [", target: "fixtures" },
  { name: "INIT_CONTACTS", marker: "const INIT_CONTACTS = [", target: "fixtures" },
  { name: "COMPANY_SETTINGS", marker: "const COMPANY_SETTINGS = {", target: "fixtures" },
  { name: "INIT_ALL_COMPANIES", marker: "const INIT_ALL_COMPANIES = [", target: "fixtures" },
  { name: "INIT_ALL_USERS", marker: "const INIT_ALL_USERS = [", target: "fixtures" },
  { name: "INIT_ACTIVITY_LOG", marker: "const INIT_ACTIVITY_LOG = [", target: "fixtures" },

  // Dates utils
  { name: "DAYS_FR", marker: 'const DAYS_FR = ["Lundi"', target: "dates" },
  { name: "DAYS_SHORT", marker: 'const DAYS_SHORT = ["Lun"', target: "dates" },
  { name: "MONTHS_FR", marker: 'const MONTHS_FR = ["Janvier"', target: "dates" },
  { name: "getDow", marker: "const getDow = (ds) =>", target: "dates" },
  { name: "fmtDate", marker: "const fmtDate = (ds) =>", target: "dates" },

  // Pipeline utils
  { name: "PIPELINE_CARD_COLORS_DEFAULT", marker: "const PIPELINE_CARD_COLORS_DEFAULT = [", target: "pipeline" },
  { name: "RDV_CATEGORIES", marker: "const RDV_CATEGORIES = {", target: "pipeline" },

  // Notifications
  { name: "sendNotification", marker: "const sendNotification = async (type, data) =>", target: "notifications" },
  { name: "buildNotifyPayload", marker: "const buildNotifyPayload = (booking, calendars, collabs, company) =>", target: "notifications" },
];

// ── Locate each ──
const located = [];
for (const d of DEFS) {
  let block;
  try { block = extractConst(original, d.marker, d.name); }
  catch (e) { console.error("[FAIL]", e.message); process.exit(2); }
  located.push({ ...d, block });
}

// ── Group by target file ──
const groups = {
  dates: [],
  pipeline: [],
  notifications: [],
  fixtures: [],
};
for (const d of located) groups[d.target].push(d);

// ── Build file contents ──
function buildFileContent(targetName, defs) {
  const lines = ["// " + targetName + ".js — Phase 2 extraction (pure helpers/data, no scope deps)"];
  // Preserve original order within target group
  const sorted = [...defs].sort((a, b) => a.block.start - b.block.start);
  for (const d of sorted) {
    lines.push("");
    const body = original.slice(d.block.start, d.block.end);
    // Prepend `export ` in front of `const`
    lines.push(body.replace(/^const /, "export const "));
  }
  return lines.join("\n") + "\n";
}

const FILE_DATES = buildFileContent("utils/dates", groups.dates);
const FILE_PIPELINE = buildFileContent("utils/pipeline", groups.pipeline);
const FILE_NOTIFICATIONS = buildFileContent("utils/notifications", groups.notifications);
const FILE_FIXTURES = buildFileContent("data/fixtures", groups.fixtures);

// ── Build patched App.jsx ──
// Sort ALL extractions by start descending and remove
const sorted = [...located].sort((a, b) => b.block.start - a.block.start);
let patched = original;
for (const d of sorted) {
  let end = d.block.end;
  if (patched[end] === "\n") end++;
  patched = patched.slice(0, d.block.start) + patched.slice(end);
}

// ── Insert new imports after Phase 1B imports ──
const IMPORT_ANCHOR = '} from "./components/ui";';
const anchorIdx = patched.indexOf(IMPORT_ANCHOR);
if (anchorIdx < 0) {
  console.error("[FAIL] Phase 1B barrel import anchor not found. Is Phase 1B applied?");
  process.exit(3);
}
const insertAt = anchorIdx + IMPORT_ANCHOR.length;

function importNames(defs) { return defs.map(d => d.name).join(", "); }

const NEW_IMPORTS =
  "\n\n// Phase 2 — pure data & utils extractions\n" +
  `import { ${importNames(groups.dates)} } from "./utils/dates";\n` +
  `import { ${importNames(groups.pipeline)} } from "./utils/pipeline";\n` +
  `import { ${importNames(groups.notifications)} } from "./utils/notifications";\n` +
  `import { ${importNames(groups.fixtures)} } from "./data/fixtures";`;

patched = patched.slice(0, insertAt) + NEW_IMPORTS + patched.slice(insertAt);

// ── Sanity: each marker should be gone from patched ──
for (const d of located) {
  if (patched.includes(d.marker)) {
    console.error("[FAIL] Definition still in App.jsx:", d.name);
    process.exit(4);
  }
}

// ── Dry-run ──
if (DRY) {
  console.log("[DRY-RUN] Phase 2 extraction preview");
  console.log("");
  console.log("Files that WOULD be created:");
  console.log("  " + path.join(utilsDir, "dates.js") + " (" + FILE_DATES.length + " bytes, " + groups.dates.length + " defs)");
  console.log("  " + path.join(utilsDir, "pipeline.js") + " (" + FILE_PIPELINE.length + " bytes, " + groups.pipeline.length + " defs)");
  console.log("  " + path.join(utilsDir, "notifications.js") + " (" + FILE_NOTIFICATIONS.length + " bytes, " + groups.notifications.length + " defs)");
  console.log("  " + path.join(dataDir, "fixtures.js") + " (" + FILE_FIXTURES.length + " bytes, " + groups.fixtures.length + " defs)");
  console.log("");
  console.log("App.jsx size:");
  console.log("  Before:", original.length, "chars");
  console.log("  After: ", patched.length, "chars");
  console.log("  Delta: ", patched.length - original.length, "chars");
  console.log("");
  console.log("Extractions (start offset, block size, target):");
  for (const d of located) {
    console.log("  " + d.name.padEnd(28) + "  @" + d.block.start + "  len=" + (d.block.end - d.block.start) + "  → " + d.target);
  }
  console.log("");
  console.log("[DRY-RUN] No files written.");
  process.exit(0);
}

// ── Backup ──
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = APP_JSX + ".pre-phase2-" + ts;
fs.copyFileSync(APP_JSX, backupPath);
console.log("[BACKUP]", backupPath);

// ── Write ──
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(utilsDir, { recursive: true });
fs.writeFileSync(path.join(utilsDir, "dates.js"), FILE_DATES);
console.log("[CREATE]", path.join(utilsDir, "dates.js"));
fs.writeFileSync(path.join(utilsDir, "pipeline.js"), FILE_PIPELINE);
console.log("[CREATE]", path.join(utilsDir, "pipeline.js"));
fs.writeFileSync(path.join(utilsDir, "notifications.js"), FILE_NOTIFICATIONS);
console.log("[CREATE]", path.join(utilsDir, "notifications.js"));
fs.writeFileSync(path.join(dataDir, "fixtures.js"), FILE_FIXTURES);
console.log("[CREATE]", path.join(dataDir, "fixtures.js"));

fs.writeFileSync(APP_JSX, patched);
console.log("[PATCH]", APP_JSX);
console.log("[PATCH] Size delta:", patched.length - original.length, "chars");
console.log("[OK] Phase 2 applied —", located.length, "definitions extracted.");
