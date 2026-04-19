// Phase 6 — Extract 7 public/client top-level components from App.jsx
// to features/public/ and features/client/.
//
// Each component becomes a proper ES module file with selective imports.
// App.jsx loses its inline `const X = (...) => (...)` definition and
// gains a matching `import X from "./features/..."`.
//
// Call sites (<X .../>) in App.jsx remain unchanged.
//
// Idempotent. Auto-backup.

const fs = require("fs");
const path = require("path");

const APP_JSX = process.argv[2] || "/var/www/planora/app/src/App.jsx";
const DRY = process.argv.includes("--dry-run");

if (!fs.existsSync(APP_JSX)) { console.error("[FAIL] App.jsx not found:", APP_JSX); process.exit(1); }

const srcDir = path.dirname(APP_JSX);
const publicDir = path.join(srcDir, "features", "public");
const clientDir = path.join(srcDir, "features", "client");

const original = fs.readFileSync(APP_JSX, "utf8");

if (original.includes('from "./features/public/PublicForm"') || original.includes('from "./features/public/Landing"')) {
  console.log("[OK] Already patched. No-op.");
  process.exit(0);
}

// ── Component metadata: name, destination dir, required imports ──
// Imports derived from the AST free-variable analysis (analyze-public-v2.js).
const COMPONENTS = [
  {
    name: "PublicForm",
    dir: clientDir.replace(path.join("features", "client"), path.join("features", "public")),
    imports: {
      react: ["useEffect", "useState"],
      "../../shared/services/api": ["api"],
    },
  },
  {
    name: "ClientPortal",
    dir: clientDir,
    imports: {
      react: ["useEffect", "useState"],
      "../../theme": ["T"],
      "../../shared/services/api": ["api"],
      "../../shared/ui": ["I", "Logo"],
    },
  },
  {
    name: "ManageBooking",
    dir: publicDir,
    imports: {
      react: ["useEffect", "useState"],
      "../../shared/services/api": ["api"],
      "../../shared/ui": ["I", "Logo"],
    },
  },
  {
    name: "PublicPage",
    dir: publicDir,
    imports: {
      react: ["useEffect", "useState"],
      "../../shared/services/api": ["api"],
      "../../shared/utils/phone": ["displayPhone"],
    },
  },
  {
    name: "VisitorBooking",
    dir: publicDir,
    imports: {
      react: ["useState"],
      "../../theme": ["T"],
      "../../shared/state/tabState": ["_T"],
      "../../shared/utils/dates": ["DAYS_FR", "MONTHS_FR"],
      "../../shared/utils/notifications": ["sendNotification"],
      "../../shared/ui": ["Avatar", "Btn", "Card", "I", "Input"],
    },
  },
  {
    name: "PublicBooking",
    dir: publicDir,
    imports: {
      react: ["Fragment", "useEffect", "useState"],
      "../../theme": ["T"],
      "../../shared/state/tabState": ["_T"],
      "../../shared/services/api": ["api"],
      "../../shared/utils/constants": ["COMMON_TIMEZONES"],
      "../../shared/ui": ["Btn", "I", "Input", "Logo"],
    },
  },
  {
    name: "Landing",
    dir: publicDir,
    imports: {
      react: ["useEffect", "useState"],
      "../../theme": ["T"],
      "../../shared/state/tabState": ["_T"],
      "../../shared/services/api": ["api"],
      "../../shared/utils/dates": ["MONTHS_FR"],
      "../../shared/ui": ["Avatar", "Btn", "Card", "I", "Input", "Logo"],
    },
  },
];

// ── Collect ALL top-level def line numbers (to find component end boundaries) ──
function collectTopDefLines(src) {
  const parser = (() => {
    try { return require("/tmp/phase4-tools/node_modules/@babel/parser"); }
    catch { try { return require("/var/www/planora/app/node_modules/@babel/parser"); } catch { return null; } }
  })();
  const lines = [];
  if (!parser) {
    // Fallback: regex-based detection
    const re = /^(?:const|function|class|export default function)\s+[A-Z]/gm;
    let m;
    while ((m = re.exec(src))) {
      let ln = 1; for (let i = 0; i < m.index; i++) if (src[i] === "\n") ln++;
      lines.push({ line: ln, offset: m.index });
    }
    return lines;
  }
  try {
    const ast = parser.parse(src, { sourceType: "module", plugins: ["jsx"], errorRecovery: true });
    for (const node of ast.program.body) {
      const ln = node.loc.start.line;
      const offset = node.start;
      if (node.type === "VariableDeclaration") {
        // Use the `const/let/var` keyword start (node.start), not the identifier start,
        // so the extracted range begins at the correct token.
        for (const d of node.declarations) if (d.id.type === "Identifier" && /^[A-Z]/.test(d.id.name)) {
          lines.push({ line: node.loc.start.line, offset: node.start, name: d.id.name });
          break; // only use the first capitalized identifier per declaration
        }
      } else if (node.type === "FunctionDeclaration" && node.id && /^[A-Z]/.test(node.id.name)) {
        lines.push({ line: ln, offset, name: node.id.name });
      } else if (node.type === "ExportDefaultDeclaration") {
        const decl = node.declaration;
        if (decl && decl.type === "FunctionDeclaration" && decl.id && /^[A-Z]/.test(decl.id.name))
          lines.push({ line: decl.loc.start.line, offset: node.start, name: decl.id.name });
      }
    }
  } catch (e) {}
  lines.sort((a, b) => a.offset - b.offset);
  return lines;
}

const allDefs = collectTopDefLines(original);

// Find offset range for each target component
function findCompOffset(name) {
  const idx = allDefs.findIndex(d => d.name === name);
  if (idx < 0) return null;
  const startOffset = allDefs[idx].offset;
  const endOffset = idx + 1 < allDefs.length ? allDefs[idx + 1].offset : original.length;
  return { startOffset, endOffset };
}

// ── Build extraction tasks ──
const tasks = [];
for (const c of COMPONENTS) {
  const range = findCompOffset(c.name);
  if (!range) { console.error("[FAIL] component not found:", c.name); process.exit(2); }
  let body = original.slice(range.startOffset, range.endOffset);
  // Trim trailing whitespace and one trailing newline
  body = body.replace(/\s+$/, "");
  tasks.push({ ...c, range, body });
}

// ── Generate file content for each extracted component ──
function generateFile(task) {
  const lines = [];
  const imp = task.imports;
  // React + hooks
  const reactList = imp.react || [];
  if (reactList.length) {
    lines.push(`import React, { ${reactList.join(", ")} } from "react";`);
  } else {
    lines.push(`import React from "react";`);
  }
  // Other imports (preserve insertion order)
  for (const [from, names] of Object.entries(imp)) {
    if (from === "react") continue;
    lines.push(`import { ${names.join(", ")} } from "${from}";`);
  }
  lines.push("");
  // Body (the `const X = ...;` declaration as-is)
  lines.push(task.body);
  lines.push("");
  // Default export
  lines.push(`export default ${task.name};`);
  lines.push("");
  return lines.join("\n");
}

// ── Build patched App.jsx ──
// Remove component definitions (sorted by offset desc) and add imports at top
const sorted = [...tasks].sort((a, b) => b.range.startOffset - a.range.startOffset);
let patched = original;
for (const t of sorted) {
  let { startOffset, endOffset } = t.range;
  // Eat a trailing newline after the definition to avoid blank stacking
  if (patched[endOffset] === "\n") endOffset++;
  patched = patched.slice(0, startOffset) + patched.slice(endOffset);
}

// Insert new imports right after the Phase 5.5 import line
const ANCHOR = 'import { _T } from "./shared/state/tabState";';
const anchorIdx = patched.indexOf(ANCHOR);
if (anchorIdx < 0) { console.error("[FAIL] Phase 5.5 anchor not found"); process.exit(3); }
const insertAt = anchorIdx + ANCHOR.length;

// Build import block
const importLines = ["", "", "// Phase 6 — extracted public/client components"];
for (const t of tasks) {
  const relPath = t.dir.endsWith(path.join("features", "public"))
    ? `./features/public/${t.name}`
    : `./features/client/${t.name}`;
  importLines.push(`import ${t.name} from "${relPath}";`);
}
patched = patched.slice(0, insertAt) + importLines.join("\n") + patched.slice(insertAt);

// Sanity: no residual `const Landing = ` etc.
for (const t of tasks) {
  const defMarker = `const ${t.name} = `;
  if (patched.includes(defMarker)) {
    console.error("[FAIL] Definition still present:", t.name);
    process.exit(4);
  }
}

if (DRY) {
  console.log("[DRY-RUN] Phase 6 extraction preview");
  for (const t of tasks) {
    console.log(`  ${t.name}: ${t.body.length} chars → ${t.dir.split("/").slice(-2).join("/")}/${t.name}.jsx`);
  }
  console.log("App.jsx delta:", patched.length - original.length, "chars");
  process.exit(0);
}

const ts = new Date().toISOString().replace(/[:.]/g, "-");
fs.copyFileSync(APP_JSX, APP_JSX + ".pre-phase6-" + ts);
console.log("[BACKUP]", APP_JSX + ".pre-phase6-" + ts);

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(clientDir, { recursive: true });

for (const t of tasks) {
  const content = generateFile(t);
  const fp = path.join(t.dir, t.name + ".jsx");
  fs.writeFileSync(fp, content);
  console.log("[CREATE]", fp, "(" + content.length + " bytes)");
}

fs.writeFileSync(APP_JSX, patched);
console.log("[PATCH]", APP_JSX);
console.log("[PATCH] Size delta:", patched.length - original.length, "chars");
console.log("[OK] Phase 6 applied — 7 components extracted.");
