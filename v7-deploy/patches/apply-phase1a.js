// Phase 1A — Extract theme + pure utils from App.jsx
//
// Creates 4 new files, modifies App.jsx to import from them.
// Zero logic change — mechanical extraction only.
//
// Extracted:
//   - theme.js                  : T_LIGHT, T_DARK, T (let export), setTheme()
//   - utils/phone.js            : formatPhoneFR, displayPhone
//   - utils/validators.js       : isValidEmail, isValidPhone
//   - utils/constants.js        : COMMON_TIMEZONES, genCode
//
// Idempotent. Auto-backup App.jsx before modification.
// Aborts with non-zero exit on any ambiguity or marker mismatch.

const fs = require("fs");
const path = require("path");

const APP_JSX = process.argv[2] || "/var/www/planora/app/src/App.jsx";
const DRY = process.argv.includes("--dry-run");

if (!fs.existsSync(APP_JSX)) {
  console.error("[FAIL] App.jsx not found:", APP_JSX);
  process.exit(1);
}

const srcDir = path.dirname(APP_JSX);
const utilsDir = path.join(srcDir, "utils");

const original = fs.readFileSync(APP_JSX, "utf8");

// ── Idempotency check ──
if (
  original.includes('from "./theme"') ||
  original.includes("from './theme'") ||
  original.includes('from "./utils/phone"')
) {
  console.log("[OK] Already patched (theme/utils imports detected). No-op.");
  process.exit(0);
}

// ── Exact markers to locate each block ──
// Each marker = the unique starting line. We compute end by balanced-brace scan
// or by knowing the exact shape for simple one/two-liners.

function findExactBlock(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  if (s < 0) return null;
  const e = src.indexOf(endMarker, s);
  if (e < 0) return null;
  return { start: s, end: e + endMarker.length };
}

// -- formatPhoneFR (L49-58) --
const blockFormatPhone = findExactBlock(
  original,
  "// ── REGLE: Format téléphone FR",
  "  return p;\n};"
);
if (!blockFormatPhone) {
  console.error("[FAIL] formatPhoneFR block not located.");
  process.exit(2);
}

// -- displayPhone (L59-69) --
const blockDisplayPhone = findExactBlock(
  original,
  "// Affichage lisible : +33612345678 → 06 12 34 56 78",
  "  return p;\n};"
);
if (
  !blockDisplayPhone ||
  blockDisplayPhone.start <= blockFormatPhone.end
) {
  // Second occurrence
  const after = blockFormatPhone.end;
  const s2 = original.indexOf(
    "// Affichage lisible : +33612345678 → 06 12 34 56 78",
    after
  );
  const e2 = original.indexOf("  return p;\n};", after);
  if (s2 < 0 || e2 < 0) {
    console.error("[FAIL] displayPhone block not located after formatPhoneFR.");
    process.exit(3);
  }
  blockDisplayPhone.start = s2;
  blockDisplayPhone.end = e2 + "  return p;\n};".length;
}

// -- COMMON_TIMEZONES (L71, one line) --
const blockTimezones = findExactBlock(
  original,
  "const COMMON_TIMEZONES = [",
  '"Indian/Reunion"];'
);
if (!blockTimezones) {
  console.error("[FAIL] COMMON_TIMEZONES block not located.");
  process.exit(4);
}

// -- T_LIGHT / T_DARK / let T (L81-101) --
const blockTheme = findExactBlock(
  original,
  "const T_LIGHT = {",
  "let T = T_LIGHT;"
);
if (!blockTheme) {
  console.error("[FAIL] Theme block (T_LIGHT / T_DARK / T) not located.");
  process.exit(5);
}

// -- genCode (L103-107) --
const blockGenCode = findExactBlock(
  original,
  "const genCode = () => {",
  "  return r;\n};"
);
if (!blockGenCode) {
  console.error("[FAIL] genCode block not located.");
  process.exit(6);
}

// -- isValidEmail / isValidPhone (L575-576) --
const blockValidators = findExactBlock(
  original,
  "const isValidEmail = (v) =>",
  "/^[\\+]?[\\d\\s\\-\\(\\)]{6,}$/.test(v.replace(/\\s/g,''));"
);
if (!blockValidators) {
  console.error("[FAIL] Validators block (isValidEmail/isValidPhone) not located.");
  process.exit(7);
}

// ── Compose extracted file contents ──

const FILE_THEME = `// Theme tokens (extracted from App.jsx Phase 1A)
// T is a \`let\` export — live binding via ESM. setTheme() swaps the reference.

export const T_LIGHT = {
  bg: "#F6F5F2", bg2: "#EDECEA", surface: "#FFFFFF", surface2: "#F9F8F6",
  card: "#FFFFFF",
  border: "#E4E2DD", border2: "#D6D3CC", text: "#1A1917", text2: "#5C5A54",
  text3: "#9C998F", accent: "#2563EB", accent2: "#3B82F6", accentBg: "#EFF6FF",
  accentBorder: "#BFDBFE", success: "#059669", successBg: "#ECFDF5",
  warning: "#D97706", warningBg: "#FFFBEB", danger: "#DC2626", dangerBg: "#FEF2F2",
  purple: "#7C3AED", purpleBg: "#F5F3FF", pink: "#EC4899",
  teal: "#0D9488", tealBg: "#F0FDFA",
};

export const T_DARK = {
  bg: "#0F0F0F", bg2: "#1A1A1A", surface: "#1E1E1E", surface2: "#171717",
  card: "#1E1E1E",
  border: "#2A2A2A", border2: "#3A3A3A", text: "#E8E6E1", text2: "#A8A69F",
  text3: "#8A877F", accent: "#3B82F6", accent2: "#60A5FA", accentBg: "#172554",
  accentBorder: "#1E40AF", success: "#34D399", successBg: "#064E3B",
  warning: "#FBBF24", warningBg: "#451A03", danger: "#F87171", dangerBg: "#450A0A",
  purple: "#A78BFA", purpleBg: "#2E1065", pink: "#F472B6",
  teal: "#2DD4BF", tealBg: "#042F2E",
};

export let T = T_LIGHT;

export function setTheme(mode) {
  T = mode === "dark" ? T_DARK : T_LIGHT;
}
`;

const FILE_PHONE = `// Phone number formatting helpers (extracted from App.jsx Phase 1A)

// ── REGLE: Format téléphone FR — tout numéro 9 chiffres → +33 devant, PARTOUT ──
export const formatPhoneFR = (phone) => {
  if (!phone) return '';
  const p = String(phone).trim().replace(/\\s/g, '');
  // 9 chiffres (sans le 0 initial) → +33XXXXXXXXX
  if (/^\\d{9}$/.test(p)) return '+33' + p;
  // 0X XX XX XX XX → +33XXXXXXXXX
  if (/^0\\d{9}$/.test(p)) return '+33' + p.slice(1);
  // Déjà +33 ou autre format international → garder
  return p;
};

// Affichage lisible : +33612345678 → 06 12 34 56 78
export const displayPhone = (phone) => {
  const p = formatPhoneFR(phone);
  if (!p) return '';
  // +33 → 0 + espaces
  if (p.startsWith('+33') && p.length === 12) {
    const n = '0' + p.slice(3);
    return n.replace(/(\\d{2})(?=\\d)/g, '$1 ').trim();
  }
  return p;
};
`;

const FILE_VALIDATORS = `// Input validators (extracted from App.jsx Phase 1A)

export const isValidEmail = (v) => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v);
export const isValidPhone = (v) => /^[\\+]?[\\d\\s\\-\\(\\)]{6,}$/.test(v.replace(/\\s/g,''));
`;

const FILE_CONSTANTS = `// Shared constants and pure helpers (extracted from App.jsx Phase 1A)

export const COMMON_TIMEZONES = ["Europe/Paris","Europe/London","Europe/Berlin","Europe/Brussels","Europe/Zurich","Europe/Madrid","Europe/Rome","America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Toronto","America/Montreal","America/Sao_Paulo","Asia/Dubai","Asia/Tokyo","Asia/Shanghai","Asia/Singapore","Asia/Kolkata","Australia/Sydney","Pacific/Auckland","Africa/Casablanca","Indian/Reunion"];

export const genCode = () => {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = ""; for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
};
`;

// ── Build patched App.jsx ──

// Collect all blocks to remove, sort descending by start (so indices don't shift)
const blocks = [
  blockFormatPhone,
  blockDisplayPhone,
  blockTimezones,
  blockTheme,
  blockGenCode,
  blockValidators,
].sort((a, b) => b.start - a.start);

let patched = original;
for (const b of blocks) {
  // Remove the block PLUS the newline just after (if any) so we don't leave a blank line
  let end = b.end;
  if (patched[end] === "\n") end++;
  patched = patched.slice(0, b.start) + patched.slice(end);
}

// Insert imports right after the existing top-of-file imports.
// We anchor on the line `import { Device as TwilioDevice } from '@twilio/voice-sdk';`
const IMPORT_ANCHOR =
  "import { Device as TwilioDevice } from '@twilio/voice-sdk';";
const anchorIdx = patched.indexOf(IMPORT_ANCHOR);
if (anchorIdx < 0) {
  console.error("[FAIL] Import anchor not found — cannot insert new imports safely.");
  process.exit(8);
}
const insertAt = anchorIdx + IMPORT_ANCHOR.length;
const NEW_IMPORTS = `

// Phase 1A extractions
import { T, T_LIGHT, T_DARK, setTheme } from "./theme";
import { formatPhoneFR, displayPhone } from "./utils/phone";
import { isValidEmail, isValidPhone } from "./utils/validators";
import { COMMON_TIMEZONES, genCode } from "./utils/constants";`;

patched = patched.slice(0, insertAt) + NEW_IMPORTS + patched.slice(insertAt);

// ── Rewrite T reassignment (dark mode) to use setTheme() ──
// ESM imports are read-only bindings, so `T = darkMode ? T_DARK : T_LIGHT;`
// throws "Illegal reassignment of import T". We route through the setter.
const REASSIGN_OLD = "T = darkMode ? T_DARK : T_LIGHT;";
const REASSIGN_NEW = 'setTheme(darkMode ? "dark" : "light");';
const reassignCount = patched.split(REASSIGN_OLD).length - 1;
if (reassignCount === 0) {
  console.error("[FAIL] Expected dark-mode reassignment of T not found. Aborting before write.");
  process.exit(11);
}
if (reassignCount > 1) {
  console.error("[FAIL] Multiple dark-mode reassignments found (" + reassignCount + "). Aborting.");
  process.exit(12);
}
patched = patched.replace(REASSIGN_OLD, REASSIGN_NEW);

// ── Sanity checks on the patched result ──
const expectedRemovedTokens = [
  "const T_LIGHT = {",
  "const T_DARK = {",
  "let T = T_LIGHT;",
  "const formatPhoneFR = (phone) =>",
  "const displayPhone = (phone) =>",
  "const COMMON_TIMEZONES = [",
  "const genCode = () => {",
  "const isValidEmail = (v) =>",
  "const isValidPhone = (v) =>",
];
for (const tok of expectedRemovedTokens) {
  if (patched.includes(tok)) {
    console.error("[FAIL] Sanity — token should have been removed but still present:", tok);
    process.exit(9);
  }
}
for (const req of ['from "./theme"', 'from "./utils/phone"', 'from "./utils/validators"', 'from "./utils/constants"']) {
  if (!patched.includes(req)) {
    console.error("[FAIL] Sanity — expected import not present:", req);
    process.exit(10);
  }
}

// Hard fail if any remaining `T = T_...` reassignment (ESM will reject at build)
const stillAssigns = /^\s*T\s*=\s*(?:T_DARK|T_LIGHT|.*\?\s*T_DARK)/m.test(patched);
if (stillAssigns) {
  console.error("[FAIL] Sanity — residual `T = T_...` reassignment left in patched output.");
  process.exit(13);
}

// ── Dry-run output ──
if (DRY) {
  console.log("[DRY-RUN] Phase 1A extraction preview");
  console.log("");
  console.log("Files that WOULD be created:");
  console.log("  " + path.join(srcDir, "theme.js") + " (" + FILE_THEME.length + " bytes)");
  console.log("  " + path.join(utilsDir, "phone.js") + " (" + FILE_PHONE.length + " bytes)");
  console.log("  " + path.join(utilsDir, "validators.js") + " (" + FILE_VALIDATORS.length + " bytes)");
  console.log("  " + path.join(utilsDir, "constants.js") + " (" + FILE_CONSTANTS.length + " bytes)");
  console.log("");
  console.log("App.jsx modifications:");
  console.log("  Original size:", original.length, "chars");
  console.log("  Patched size: ", patched.length, "chars");
  console.log("  Delta:        ", patched.length - original.length, "chars");
  console.log("");
  console.log("Blocks removed from App.jsx (offsets):");
  for (const b of blocks.sort((a, b) => a.start - b.start)) {
    const preview = original.slice(b.start, Math.min(b.start + 60, b.end)).replace(/\n/g, " ⏎ ");
    console.log("  [" + b.start + ".." + b.end + "]  " + preview + "…");
  }
  console.log("");
  console.log("Imports added after anchor:");
  console.log(NEW_IMPORTS.trim().split("\n").map(l => "  " + l).join("\n"));
  console.log("");
  console.log("[DRY-RUN] No files written.");
  process.exit(0);
}

// ── Backup App.jsx ──
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = APP_JSX + ".pre-phase1a-" + ts;
fs.copyFileSync(APP_JSX, backupPath);
console.log("[BACKUP]", backupPath);

// ── Write new files ──
fs.mkdirSync(utilsDir, { recursive: true });
fs.writeFileSync(path.join(srcDir, "theme.js"), FILE_THEME);
console.log("[CREATE]", path.join(srcDir, "theme.js"));
fs.writeFileSync(path.join(utilsDir, "phone.js"), FILE_PHONE);
console.log("[CREATE]", path.join(utilsDir, "phone.js"));
fs.writeFileSync(path.join(utilsDir, "validators.js"), FILE_VALIDATORS);
console.log("[CREATE]", path.join(utilsDir, "validators.js"));
fs.writeFileSync(path.join(utilsDir, "constants.js"), FILE_CONSTANTS);
console.log("[CREATE]", path.join(utilsDir, "constants.js"));

// ── Write patched App.jsx ──
fs.writeFileSync(APP_JSX, patched);
console.log("[PATCH]", APP_JSX);
console.log("[PATCH] Size delta:", patched.length - original.length, "chars");
console.log("[OK] Phase 1A applied.");
