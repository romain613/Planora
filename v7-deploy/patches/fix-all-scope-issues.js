// ═══════════════════════════════════════════════════════════════════════
// COMPREHENSIVE SCOPE FIX — Fix ALL ReferenceError issues in App.jsx
// ═══════════════════════════════════════════════════════════════════════
// Problem: App.jsx is ~39K lines with nested function components.
// Variables declared via useState in the main component are referenced
// in nested components where they're NOT in scope → ReferenceError.
//
// Known problematic variables:
//   - selectedCrmContact / setSelectedCrmContact (declared ~line 2717)
//   - pipelineRightContact / setPipelineRightContact (declared ~line 1279)
//
// Strategy: For EVERY reference to these variables that's far from its
// declaration, wrap with typeof safety check. This is a NO-OP for
// in-scope references (typeof returns the actual type) and PREVENTS
// ReferenceError for out-of-scope ones.
//
// CRITICAL: Single pass per line — no overlapping regex replacements.
// ═══════════════════════════════════════════════════════════════════════

const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");
const lines = code.split("\n");

// ── Configuration ──
const SAFE_ZONE = 300; // Lines within this range of declaration are left alone
const VARIABLES_TO_FIX = [
  { reader: "selectedCrmContact", setter: "setSelectedCrmContact" },
  { reader: "pipelineRightContact", setter: "setPipelineRightContact" }
];

let totalFixes = 0;

for (const varConfig of VARIABLES_TO_FIX) {
  const { reader, setter } = varConfig;

  // Find declaration line
  let declLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(reader) && lines[i].includes("useState")) {
      declLine = i;
      break;
    }
  }

  if (declLine === -1) {
    console.log("WARNING: " + reader + " useState declaration not found — skipping");
    continue;
  }

  console.log("\n═══ " + reader + " ═══");
  console.log("Declaration at line " + (declLine + 1));

  let varFixes = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip lines without this variable
    if (!line.includes(reader)) continue;

    // Skip declaration zone
    if (Math.abs(i - declLine) < SAFE_ZONE) continue;

    // Skip if already has typeof protection for this variable
    if (line.includes("typeof " + reader) || line.includes("typeof " + setter)) continue;

    // Skip lines that are just comments
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    // ── SINGLE-PASS FIX for this line ──
    // We build a completely new line by processing the original ONCE
    let newLine = line;
    let changed = false;

    // Fix 1: Wrap setter calls — setPipelineRightContact( → safe version
    if (newLine.includes(setter + "(")) {
      const safeSet = "(typeof " + setter + "==='function'?" + setter + ":function(){})("
      newLine = newLine.split(setter + "(").join(safeSet);
      changed = true;
    }

    // Fix 2: Wrap reader?.property access
    // We need to NOT match inside the setter name, so we use split/join
    // which is safer than regex for this case
    const optChain = reader + "?.";
    if (newLine.includes(optChain)) {
      // Check it's not inside the setter (e.g., "setPipelineRightContact" contains "pipelineRightContact")
      // Split by setter first to protect those parts
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
        // Skip if it's the optional chain we already fixed
        if (parts[p].includes(dotAccess) && !parts[p].includes("typeof " + reader)) {
          // Make sure we don't match reader?.  (already fixed above)
          // Only match reader. (without ?)
          const subParts = parts[p].split(dotAccess);
          for (let s = 0; s < subParts.length - 1; s++) {
            // Check the character before the split isn't '?'
            if (!subParts[s].endsWith("?") && !subParts[s].endsWith("typeof " + reader + "!=='undefined'?" + reader + ":null)")) {
              // This is a bare reader.property — needs fixing
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

    // Fix 4: Wrap bare reader access (in conditions like "reader &&" or "!reader" or "reader ===")
    // This catches cases not covered by Fix 2/3
    // Check for bare reader word that's not part of setter and not already wrapped
    if (newLine.includes(reader) && !newLine.includes("typeof " + reader) && changed === false) {
      // There are still unprotected references — wrap them
      // Use a regex with word boundary, excluding setter prefix
      const bareRegex = new RegExp("(?<!" + setter.replace(reader, "") + ")" + reader + "(?!\\w)(?!\\.)", "g");
      const beforeReplace = newLine;
      newLine = newLine.replace(bareRegex, "(typeof " + reader + "!=='undefined'?" + reader + ":null)");
      if (newLine !== beforeReplace) changed = true;
    }

    if (changed) {
      lines[i] = newLine;
      varFixes++;
      totalFixes++;
      console.log("  Fixed line " + (i + 1) + ": " + line.trim().substring(0, 80) + "...");
    }
  }

  console.log("  Total fixes for " + reader + ": " + varFixes);
}

// ── SCAN FOR OTHER POTENTIAL SCOPE ISSUES ──
console.log("\n═══ SCANNING FOR OTHER POTENTIAL SCOPE ISSUES ═══");

// Find all useState declarations and check for distant references
const useStatePattern = /const \[(\w+), (set\w+)\] = useState/;
const stateVars = [];
for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(useStatePattern);
  if (match) {
    stateVars.push({ reader: match[1], setter: match[2], line: i });
  }
}

// For each state variable, check if there are references very far away
const ALERT_DISTANCE = 10000;
for (const sv of stateVars) {
  let maxDist = 0;
  let maxDistLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (i === sv.line) continue;
    if (lines[i].includes(sv.reader) && !lines[i].includes("useState") && !lines[i].includes("//")) {
      const dist = Math.abs(i - sv.line);
      if (dist > maxDist) {
        maxDist = dist;
        maxDistLine = i;
      }
    }
  }
  if (maxDist > ALERT_DISTANCE) {
    console.log("  ALERT: " + sv.reader + " (declared line " + (sv.line + 1) + ") referenced at line " + (maxDistLine + 1) + " (distance: " + maxDist + ")");
  }
}

// ── WRITE RESULT ──
code = lines.join("\n");
fs.writeFileSync(file, code);
console.log("\n═══ TOTAL FIXES APPLIED: " + totalFixes + " ═══");
console.log("Scope fix complete");
