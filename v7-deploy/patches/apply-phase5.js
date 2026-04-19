// Phase 5 — Restructure folders to shared/ + features/
//
// Two-stage patcher:
//   STAGE CREATE (default): copies files to new tree, rewrites imports.
//                           Old dirs are KEPT — they're orphaned but present.
//                           This makes the build work; if anything is missed
//                           the old paths still resolve.
//   STAGE CLEANUP (--cleanup): after build+deploy confirm green, delete old dirs.
//
// Strict constraints:
//   - No filename renaming.
//   - No content changes except import paths in App.jsx and in the 15 Phase 4
//     screen files. Every UI atomic, util, service, and fixture file is
//     byte-identical copy from its old location.
//   - App.jsx keeps ~34 656 lines (only import statements rewritten).

const fs = require("fs");
const path = require("path");

const APP_JSX = process.argv[2] || "/var/www/planora/app/src/App.jsx";
const STAGE = process.argv.includes("--cleanup") ? "cleanup" : "create";

if (!fs.existsSync(APP_JSX)) {
  console.error("[FAIL] App.jsx not found:", APP_JSX);
  process.exit(1);
}
const srcDir = path.dirname(APP_JSX);

// ── Classifier to split components/screens/ into collab vs admin ──
function classifyScreen(filename) {
  if (filename.startsWith("Admin") || filename.startsWith("Vision")) return "admin";
  if (filename.startsWith("Collab") || filename.startsWith("Fiche") || filename.startsWith("Phone")) return "collab";
  return null;
}

// ── Import path rewrites for screen files (moving from components/screens → features/{c,a}/screens) ──
// Old depth 2 from components/screens/, new depth 3 from features/X/screens/
function rewriteScreenImports(content) {
  let out = content;
  // ../../theme → ../../../theme
  out = out.replace(/from "\.\.\/\.\.\/theme"/g, 'from "../../../theme"');
  // ../../utils/X → ../../../shared/utils/X
  out = out.replace(/from "\.\.\/\.\.\/utils\//g, 'from "../../../shared/utils/');
  // ../../services/X → ../../../shared/services/X
  out = out.replace(/from "\.\.\/\.\.\/services\//g, 'from "../../../shared/services/');
  // ../../data/X → ../../../data/X (data stays at root)
  out = out.replace(/from "\.\.\/\.\.\/data\//g, 'from "../../../data/');
  // ../ui → ../../../shared/ui  (sibling barrel becomes shared barrel, 3 levels up)
  out = out.replace(/from "\.\.\/ui"/g, 'from "../../../shared/ui"');
  return out;
}

// ── Import path rewrites for App.jsx ──
function rewriteAppImports(content, collabScreenNames, adminScreenNames) {
  let out = content;
  // ./utils/X → ./shared/utils/X
  out = out.replace(/from "\.\/utils\//g, 'from "./shared/utils/');
  // ./services/X → ./shared/services/X
  out = out.replace(/from "\.\/services\//g, 'from "./shared/services/');
  // ./components/ui → ./shared/ui
  out = out.replace(/from "\.\/components\/ui"/g, 'from "./shared/ui"');
  // ./components/screens barrel → split into two feature barrels.
  // `[^}]*?` excludes `}` so the match can't span across preceding imports.
  const barrelPattern = /import\s*\{\s*([^}]*?)\s*\}\s*from\s*"\.\/components\/screens";/;
  const m = out.match(barrelPattern);
  if (!m) {
    throw new Error("components/screens barrel import not found in App.jsx");
  }
  const names = m[1].split(",").map(s => s.trim()).filter(Boolean);
  const forCollab = names.filter(n => collabScreenNames.includes(n));
  const forAdmin = names.filter(n => adminScreenNames.includes(n));
  const unmatched = names.filter(n => !collabScreenNames.includes(n) && !adminScreenNames.includes(n));
  if (unmatched.length > 0) {
    throw new Error("Unmatched screen names from barrel: " + unmatched.join(", "));
  }
  const replacement =
    "import {\n  " + forCollab.join(",\n  ") + '\n} from "./features/collab/screens";\n' +
    "import {\n  " + forAdmin.join(",\n  ") + '\n} from "./features/admin/screens";';
  out = out.replace(barrelPattern, replacement);
  return out;
}

// ── CLEANUP stage ──
if (STAGE === "cleanup") {
  const dirsToRemove = [
    "components/ui",
    "components/screens",
    "components",
    "utils",
    "services",
  ];
  let removed = 0;
  for (const d of dirsToRemove) {
    const fp = path.join(srcDir, d);
    if (fs.existsSync(fp)) {
      fs.rmSync(fp, { recursive: true, force: true });
      console.log("[RM]", fp);
      removed++;
    }
  }
  console.log("[OK] Cleanup removed", removed, "old dirs.");
  process.exit(0);
}

// ── CREATE stage ──

// Idempotency: check if already applied
if (fs.existsSync(path.join(srcDir, "shared/ui/index.js")) &&
    fs.existsSync(path.join(srcDir, "features/admin/screens/index.js"))) {
  console.log("[OK] Already patched (shared/ui and features/ exist). No-op.");
  process.exit(0);
}

// Discover source files dynamically
const COMPONENTS_UI_DIR = path.join(srcDir, "components/ui");
const COMPONENTS_SCREENS_DIR = path.join(srcDir, "components/screens");
const UTILS_DIR = path.join(srcDir, "utils");
const SERVICES_DIR = path.join(srcDir, "services");

if (!fs.existsSync(COMPONENTS_UI_DIR)) { console.error("[FAIL] components/ui not found"); process.exit(2); }
if (!fs.existsSync(COMPONENTS_SCREENS_DIR)) { console.error("[FAIL] components/screens not found"); process.exit(2); }
if (!fs.existsSync(UTILS_DIR)) { console.error("[FAIL] utils/ not found"); process.exit(2); }
if (!fs.existsSync(SERVICES_DIR)) { console.error("[FAIL] services/ not found"); process.exit(2); }

const uiFiles = fs.readdirSync(COMPONENTS_UI_DIR);
const screenFiles = fs.readdirSync(COMPONENTS_SCREENS_DIR).filter(f => f.endsWith(".jsx"));
const utilFiles = fs.readdirSync(UTILS_DIR);
const serviceFiles = fs.readdirSync(SERVICES_DIR);

// Classify screens
const collabScreens = [];
const adminScreens = [];
const unclassified = [];
for (const f of screenFiles) {
  const cls = classifyScreen(f);
  if (cls === "collab") collabScreens.push(f);
  else if (cls === "admin") adminScreens.push(f);
  else unclassified.push(f);
}
if (unclassified.length > 0) {
  console.error("[FAIL] Unclassified screen files:", unclassified);
  process.exit(3);
}
console.log("Classification:");
console.log("  collab:", collabScreens.length, "files");
console.log("  admin: ", adminScreens.length, "files");

// ── Backup App.jsx FIRST ──
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = APP_JSX + ".pre-phase5-" + ts;
fs.copyFileSync(APP_JSX, backupPath);
console.log("[BACKUP]", backupPath);

// ── Create new directory tree ──
const newDirs = [
  "shared", "shared/ui", "shared/utils", "shared/services",
  "features", "features/collab", "features/collab/screens",
  "features/admin", "features/admin/screens",
  "features/public", "features/client",
];
for (const d of newDirs) {
  fs.mkdirSync(path.join(srcDir, d), { recursive: true });
}
console.log("[MKDIR]", newDirs.length, "new directories");

// ── Copy shared/ui (no rewrite needed — relative imports stay valid at same depth) ──
for (const f of uiFiles) {
  fs.copyFileSync(path.join(COMPONENTS_UI_DIR, f), path.join(srcDir, "shared/ui", f));
}
console.log("[COPY] shared/ui:", uiFiles.length, "files");

// ── Copy shared/utils (no rewrite needed — no relative imports) ──
for (const f of utilFiles) {
  fs.copyFileSync(path.join(UTILS_DIR, f), path.join(srcDir, "shared/utils", f));
}
console.log("[COPY] shared/utils:", utilFiles.length, "files");

// ── Copy shared/services (no rewrite needed) ──
for (const f of serviceFiles) {
  fs.copyFileSync(path.join(SERVICES_DIR, f), path.join(srcDir, "shared/services", f));
}
console.log("[COPY] shared/services:", serviceFiles.length, "files");

// ── Copy + rewrite imports for collab screens ──
for (const f of collabScreens) {
  const content = fs.readFileSync(path.join(COMPONENTS_SCREENS_DIR, f), "utf8");
  const rewritten = rewriteScreenImports(content);
  fs.writeFileSync(path.join(srcDir, "features/collab/screens", f), rewritten);
}
console.log("[COPY+REWRITE] features/collab/screens:", collabScreens.length, "files");

// ── Copy + rewrite imports for admin screens ──
for (const f of adminScreens) {
  const content = fs.readFileSync(path.join(COMPONENTS_SCREENS_DIR, f), "utf8");
  const rewritten = rewriteScreenImports(content);
  fs.writeFileSync(path.join(srcDir, "features/admin/screens", f), rewritten);
}
console.log("[COPY+REWRITE] features/admin/screens:", adminScreens.length, "files");

// ── Create new barrels ──
const collabNames = collabScreens.map(f => f.replace(".jsx", ""));
const adminNames = adminScreens.map(f => f.replace(".jsx", ""));

const collabBarrel = "// features/collab/screens barrel\n" +
  collabNames.map(n => `export { default as ${n} } from "./${n}";`).join("\n") + "\n";
fs.writeFileSync(path.join(srcDir, "features/collab/screens/index.js"), collabBarrel);

const adminBarrel = "// features/admin/screens barrel\n" +
  adminNames.map(n => `export { default as ${n} } from "./${n}";`).join("\n") + "\n";
fs.writeFileSync(path.join(srcDir, "features/admin/screens/index.js"), adminBarrel);

console.log("[CREATE] new barrels (collab:", collabNames.length + ", admin:", adminNames.length + ")");

// ── Rewrite App.jsx imports ──
const appContent = fs.readFileSync(APP_JSX, "utf8");
let appRewritten;
try {
  appRewritten = rewriteAppImports(appContent, collabNames, adminNames);
} catch (e) {
  console.error("[FAIL]", e.message);
  process.exit(4);
}

// Sanity: App.jsx size hasn't drifted significantly (imports are at most ~50 extra chars each)
const delta = appRewritten.length - appContent.length;
if (Math.abs(delta) > 500) {
  console.error("[FAIL] Unexpected App.jsx size delta:", delta, "chars. Aborting.");
  process.exit(5);
}

// Sanity: no more "./components/" references in App.jsx
if (/from\s*"\.\/components\//.test(appRewritten)) {
  console.error("[FAIL] App.jsx still references ./components/. Rewrite incomplete.");
  process.exit(6);
}
// Sanity: no more "./utils/" or "./services/" references in App.jsx
if (/from\s*"\.\/utils\//.test(appRewritten) || /from\s*"\.\/services\//.test(appRewritten)) {
  console.error("[FAIL] App.jsx still references ./utils/ or ./services/. Rewrite incomplete.");
  process.exit(7);
}

fs.writeFileSync(APP_JSX, appRewritten);
console.log("[PATCH] App.jsx imports rewritten (delta", delta, "chars)");

console.log("");
console.log("═══════════════════════════════════════════════════");
console.log("  PHASE 5 CREATE STAGE DONE");
console.log("═══════════════════════════════════════════════════");
console.log("  Next: run build. If OK, run with --cleanup to delete old dirs.");
console.log("  Old dirs still present (components/, utils/, services/) —");
console.log("  they're now orphaned, harmless, but eat disk.");
