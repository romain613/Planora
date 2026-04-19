// ═══════════════════════════════════════════════════════════════════════
// DIAGNOSTIC — Find ALL useState variables with distant references
// Run on VPS: node /tmp/p0-patches/diagnose-scope.js
// This script does NOT modify App.jsx — only reports.
// ═══════════════════════════════════════════════════════════════════════

const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
const code = fs.readFileSync(file, "utf8");
const lines = code.split("\n");

console.log("═══ SCOPE DIAGNOSTIC — App.jsx (" + lines.length + " lines) ═══\n");

// ── Step 1: Find ALL function component boundaries ──
// In a single-file SPA, nested function components create new scopes
const componentBoundaries = [];
const funcPattern = /^\s*(function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\(|function))/;

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(funcPattern);
  if (m) {
    const name = m[2] || m[3];
    // Track functions that look like React components (PascalCase or contain specific patterns)
    if (name && /^[A-Z]/.test(name)) {
      componentBoundaries.push({ name, line: i });
    }
  }
}

console.log("Found " + componentBoundaries.length + " PascalCase function components\n");

// ── Step 2: Find ALL useState declarations ──
const useStatePattern = /const \[(\w+),\s*(set\w+)\]\s*=\s*useState/;
const stateVars = [];

for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(useStatePattern);
  if (match) {
    stateVars.push({
      reader: match[1],
      setter: match[2],
      line: i,
      // Find which component this belongs to
      component: componentBoundaries.filter(c => c.line <= i).pop()?.name || "top-level"
    });
  }
}

console.log("Found " + stateVars.length + " useState declarations\n");

// ── Step 3: For each state var, find ALL references and their distances ──
const DISTANCE_THRESHOLD = 300; // Same as fix-all-scope-issues.js
const problems = [];

for (const sv of stateVars) {
  let maxDist = 0;
  let maxDistLine = -1;
  let distantRefs = [];

  for (let i = 0; i < lines.length; i++) {
    if (i === sv.line) continue;
    const line = lines[i];

    // Skip comments
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    // Check for reader or setter
    const hasReader = line.includes(sv.reader) && !line.includes("useState");
    const hasSetter = line.includes(sv.setter) && !line.includes("useState");

    if (hasReader || hasSetter) {
      const dist = Math.abs(i - sv.line);
      if (dist > DISTANCE_THRESHOLD) {
        // Check if already protected with typeof
        const isProtected = line.includes("typeof " + sv.reader) || line.includes("typeof " + sv.setter);
        distantRefs.push({ line: i, dist, protected: isProtected, which: hasReader ? sv.reader : sv.setter });
        if (dist > maxDist) {
          maxDist = dist;
          maxDistLine = i;
        }
      }
    }
  }

  if (distantRefs.length > 0) {
    const unprotected = distantRefs.filter(r => !r.protected);
    problems.push({
      reader: sv.reader,
      setter: sv.setter,
      declLine: sv.line + 1,
      component: sv.component,
      totalDistantRefs: distantRefs.length,
      unprotectedRefs: unprotected.length,
      maxDist,
      maxDistLine: maxDistLine + 1,
      refs: unprotected.slice(0, 10) // Show first 10
    });
  }
}

// Sort by number of unprotected refs (most dangerous first)
problems.sort((a, b) => b.unprotectedRefs - a.unprotectedRefs);

console.log("═══ VARIABLES WITH DISTANT UNPROTECTED REFERENCES ═══\n");

let criticalCount = 0;
for (const p of problems) {
  if (p.unprotectedRefs === 0) continue;
  criticalCount++;
  console.log("🔴 " + p.reader + " / " + p.setter);
  console.log("   Declared: line " + p.declLine + " (in " + p.component + ")");
  console.log("   Distant refs: " + p.totalDistantRefs + " total, " + p.unprotectedRefs + " UNPROTECTED");
  console.log("   Max distance: " + p.maxDist + " lines (line " + p.maxDistLine + ")");
  for (const ref of p.refs) {
    console.log("   → line " + (ref.line + 1) + " (+" + ref.dist + "): " + lines[ref.line].trim().substring(0, 100));
  }
  console.log("");
}

console.log("═══ ALREADY PROTECTED (typeof present) ═══\n");
for (const p of problems) {
  if (p.unprotectedRefs > 0) continue;
  console.log("✅ " + p.reader + " — " + p.totalDistantRefs + " refs, all protected");
}

console.log("\n═══ SUMMARY ═══");
console.log("Total useState vars: " + stateVars.length);
console.log("Vars with distant refs: " + problems.length);
console.log("Vars with UNPROTECTED distant refs: " + criticalCount);
console.log("\nTo fix: add these variable names to VARIABLES_TO_FIX in fix-all-scope-issues.js");

// ── Step 4: Output the list as ready-to-use JSON ──
if (criticalCount > 0) {
  console.log("\n═══ COPY THIS INTO fix-all-scope-issues.js ═══");
  console.log("const VARIABLES_TO_FIX = [");
  for (const p of problems) {
    if (p.unprotectedRefs === 0) continue;
    console.log('  { reader: "' + p.reader + '", setter: "' + p.setter + '" },');
  }
  console.log("];");
}
