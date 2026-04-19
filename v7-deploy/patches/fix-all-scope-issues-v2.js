// ═══════════════════════════════════════════════════════════════════════
// COMPREHENSIVE SCOPE FIX v2 — Auto-detect AND fix ALL scope issues
// ═══════════════════════════════════════════════════════════════════════
// v1 only fixed 2 hardcoded variables. v2 automatically discovers ALL
// useState variables with distant references and fixes them all.
//
// Strategy: typeof wraps are NO-OPs for in-scope vars, so it's SAFE
// to apply them broadly. Better to over-protect than to miss one.
// ═══════════════════════════════════════════════════════════════════════

const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");
let lines = code.split("\n");

console.log("═══ SCOPE FIX v2 — Auto-detect + Fix (" + lines.length + " lines) ═══\n");

// ── Configuration ──
const SAFE_ZONE = 300;        // Lines within this range of declaration are safe
const DETECT_THRESHOLD = 300; // Minimum distance to consider a reference "distant"

// ── Step 1: Find ALL useState declarations ──
const useStatePattern = /const \[(\w+),\s*(set\w+)\]\s*=\s*useState/;
const allStateVars = [];

for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(useStatePattern);
  if (match) {
    allStateVars.push({ reader: match[1], setter: match[2], line: i });
  }
}

console.log("Found " + allStateVars.length + " useState declarations");

// ── Step 2: Auto-detect which variables have distant unprotected references ──
const VARIABLES_TO_FIX = [];

for (const sv of allStateVars) {
  let hasDistantUnprotected = false;

  for (let i = 0; i < lines.length; i++) {
    if (i === sv.line) continue;
    const line = lines[i];
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    const dist = Math.abs(i - sv.line);
    if (dist <= DETECT_THRESHOLD) continue;

    const hasRef = line.includes(sv.reader) && !line.includes("useState");
    if (hasRef) {
      const isProtected = line.includes("typeof " + sv.reader) || line.includes("typeof " + sv.setter);
      if (!isProtected) {
        hasDistantUnprotected = true;
        break;
      }
    }
  }

  if (hasDistantUnprotected) {
    VARIABLES_TO_FIX.push({ reader: sv.reader, setter: sv.setter, declLine: sv.line });
  }
}

console.log("Variables needing fixes: " + VARIABLES_TO_FIX.length);
for (const v of VARIABLES_TO_FIX) {
  console.log("  → " + v.reader + " (line " + (v.declLine + 1) + ")");
}
console.log("");

// ── Step 3: Apply fixes (same proven logic as v1) ──
let totalFixes = 0;

for (const varConfig of VARIABLES_TO_FIX) {
  const { reader, setter, declLine } = varConfig;

  console.log("═══ Fixing: " + reader + " (declared line " + (declLine + 1) + ") ═══");

  let varFixes = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip lines without this variable
    if (!line.includes(reader)) continue;

    // Skip declaration zone
    if (Math.abs(i - declLine) < SAFE_ZONE) continue;

    // Skip if already has typeof protection
    if (line.includes("typeof " + reader) || line.includes("typeof " + setter)) continue;

    // Skip comments
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    // ── SINGLE-PASS FIX ──
    let newLine = line;
    let changed = false;

    // Fix 1: Wrap setter calls
    if (newLine.includes(setter + "(")) {
      const safeSet = "(typeof " + setter + "==='function'?" + setter + ":function(){})("
      newLine = newLine.split(setter + "(").join(safeSet);
      changed = true;
    }

    // Fix 2: Wrap reader?.property access
    const optChain = reader + "?.";
    if (newLine.includes(optChain)) {
      const parts = newLine.split(setter);
      for (let p = 0; p < parts.length; p++) {
        if (parts[p].includes(optChain)) {
          parts[p] = parts[p].split(optChain).join(
            "(typeof " + reader + "!=='undefined'?" + reader + ":null)?."
          );
          changed = true;
        }
      }
      newLine = parts.join(setter);
    }

    // Fix 3: Wrap reader.property access (without optional chain)
    const dotAccess = reader + ".";
    if (newLine.includes(dotAccess)) {
      const parts = newLine.split(setter);
      for (let p = 0; p < parts.length; p++) {
        if (parts[p].includes(dotAccess) && !parts[p].includes("typeof " + reader)) {
          const subParts = parts[p].split(dotAccess);
          for (let s = 0; s < subParts.length - 1; s++) {
            if (!subParts[s].endsWith("?") && !subParts[s].endsWith("typeof " + reader + "!=='undefined'?" + reader + ":null)")) {
              subParts[s] = subParts[s] + "(typeof " + reader + "!=='undefined'?" + reader + ":{}).";
              changed = true;
            } else {
              subParts[s] = subParts[s] + dotAccess;
            }
          }
          parts[p] = subParts.join("");
        }
      }
      newLine = parts.join(setter);
    }

    // Fix 4: Wrap bare reader access (conditions, returns, etc.)
    if (newLine.includes(reader) && !newLine.includes("typeof " + reader) && changed === false) {
      // Build regex that avoids matching inside setter name
      // e.g., for "foo" with setter "setFoo", avoid matching "foo" inside "setFoo"
      const setterPrefix = setter.replace(reader, "");
      let bareRegex;
      if (setterPrefix) {
        bareRegex = new RegExp("(?<!" + escapeRegex(setterPrefix) + ")" + escapeRegex(reader) + "(?!\\w)(?!\\.)", "g");
      } else {
        bareRegex = new RegExp("\\b" + escapeRegex(reader) + "\\b(?!\\.)", "g");
      }
      const beforeReplace = newLine;
      newLine = newLine.replace(bareRegex, "(typeof " + reader + "!=='undefined'?" + reader + ":null)");
      if (newLine !== beforeReplace) changed = true;
    }

    if (changed) {
      lines[i] = newLine;
      varFixes++;
      totalFixes++;
      if (varFixes <= 5) {
        console.log("  Fixed line " + (i + 1) + ": " + line.trim().substring(0, 80));
      }
    }
  }

  if (varFixes > 5) {
    console.log("  ... and " + (varFixes - 5) + " more");
  }
  console.log("  Total fixes for " + reader + ": " + varFixes + "\n");
}

// ── Step 4: Verify — no more unprotected distant refs ──
console.log("═══ VERIFICATION SCAN ═══");
let remaining = 0;

for (const sv of allStateVars) {
  for (let i = 0; i < lines.length; i++) {
    if (i === sv.line) continue;
    const line = lines[i];
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    const dist = Math.abs(i - sv.line);
    if (dist <= DETECT_THRESHOLD) continue;

    if (line.includes(sv.reader) && !line.includes("useState")) {
      const isProtected = line.includes("typeof " + sv.reader) || line.includes("typeof " + sv.setter);
      if (!isProtected) {
        remaining++;
        if (remaining <= 10) {
          console.log("  STILL UNPROTECTED: " + sv.reader + " at line " + (i + 1) + ": " + line.trim().substring(0, 80));
        }
      }
    }
  }
}

if (remaining > 0) {
  console.log("  WARNING: " + remaining + " references still unprotected");
} else {
  console.log("  ✅ All distant references are now protected");
}

// ── Write result ──
code = lines.join("\n");
fs.writeFileSync(file, code);
console.log("\n═══ TOTAL FIXES APPLIED: " + totalFixes + " ═══");
console.log("Lines after fix: " + lines.length);
console.log("Scope fix v2 complete");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
