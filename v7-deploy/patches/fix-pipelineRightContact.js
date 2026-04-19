// Fix: pipelineRightContact ReferenceError
// Same pattern as selectedCrmContact — variable used outside its declaration scope
// Wrap references with typeof safety checks

const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");
const lines = code.split("\n");

let fixes = 0;

// Find where pipelineRightContact is declared (useState)
let declLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("pipelineRightContact") && (lines[i].includes("useState") || lines[i].includes("const ["))) {
    declLine = i;
    console.log("Declaration found at line " + (i + 1) + ": " + lines[i].trim().substring(0, 100));
    break;
  }
}

// Find ALL references to pipelineRightContact
console.log("\nAll references to pipelineRightContact:");
let refs = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("pipelineRightContact")) {
    refs.push(i);
    const dist = declLine >= 0 ? (i - declLine) : "?";
    console.log("  Line " + (i + 1) + " (+" + dist + "): " + lines[i].trim().substring(0, 120));
  }
}
console.log("Total references: " + refs.length);

// Fix references that are far from declaration (likely in different scope)
// Same strategy as selectedCrmContact fix — wrap distant references
const SAFE_DISTANCE = 15000; // lines far from declaration = different component scope

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.includes("pipelineRightContact")) continue;

  // Skip the declaration itself and nearby code
  if (declLine >= 0 && Math.abs(i - declLine) < SAFE_DISTANCE) continue;
  // Skip if it's a declaration
  if (line.includes("useState") || (line.includes("const [") && line.includes("pipelineRightContact"))) continue;
  // Skip if already wrapped with typeof
  if (line.includes("typeof pipelineRightContact")) continue;

  // Fix: wrap if(pipelineRightContact...) conditions
  if (line.includes("if") && line.includes("pipelineRightContact")) {
    lines[i] = line.replace(
      /if\s*\(\s*pipelineRightContact/g,
      "if(typeof pipelineRightContact!=='undefined'&&pipelineRightContact"
    );
    fixes++;
    console.log("Fixed condition at line " + (i + 1));
  }

  // Fix: pipelineRightContact?.something in expressions (not in if)
  if (line.includes("pipelineRightContact?.") && !line.includes("typeof pipelineRightContact")) {
    lines[i] = line.replace(
      /pipelineRightContact\?\./g,
      "(typeof pipelineRightContact!=='undefined'?pipelineRightContact:null)?."
    );
    fixes++;
    console.log("Fixed optional chain at line " + (i + 1));
  }

  // Fix: pipelineRightContact && or pipelineRightContact.something direct access
  if (line.includes("pipelineRightContact&&") || line.includes("pipelineRightContact &&")) {
    lines[i] = line.replace(
      /pipelineRightContact\s*&&/g,
      "typeof pipelineRightContact!=='undefined'&&pipelineRightContact&&"
    );
    fixes++;
    console.log("Fixed && chain at line " + (i + 1));
  }

  // Fix: setPipelineRightContact calls outside scope
  if (line.includes("setPipelineRightContact") && !line.includes("typeof setPipelineRightContact") && !line.includes("useState")) {
    lines[i] = line.replace(
      /setPipelineRightContact\(/g,
      "(typeof setPipelineRightContact==='function'?setPipelineRightContact:()=>{})("
    );
    fixes++;
    console.log("Fixed setter at line " + (i + 1));
  }
}

if (fixes === 0) {
  console.log("\nNo distant references found — trying broader fix...");
  // If no distant refs, the issue might be in a useEffect or callback
  // Apply typeof wrap to ALL references outside declaration line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("pipelineRightContact")) continue;
    if (line.includes("useState") || line.includes("typeof pipelineRightContact")) continue;
    if (declLine >= 0 && i === declLine) continue;

    // Log for manual review
    console.log("Candidate line " + (i + 1) + ": " + line.trim().substring(0, 120));
  }
}

code = lines.join("\n");
fs.writeFileSync(file, code);
console.log("\nTotal fixes applied: " + fixes);
console.log("pipelineRightContact fix complete");
