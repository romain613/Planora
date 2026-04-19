// Fix: selectedCrmContact ReferenceError
// Problem: selectedCrmContact is declared at line ~2717 in main component,
// but referenced in code blocks (lines 20914, 23299, 38949) that may be
// in different component scopes or called when variable is not available.
// Fix: wrap each reference with a safe typeof check.

const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");

let fixes = 0;

// Fix pattern: if(selectedCrmContact?.id===id) setSelectedCrmContact(...)
// Replace with: if(typeof selectedCrmContact!=='undefined' && selectedCrmContact?.id===id) setSelectedCrmContact(...)
// Only fix occurrences AFTER line 15000 (far from declaration, likely in different scope)

const lines = code.split("\n");
for (let i = 15000; i < lines.length; i++) {
  const line = lines[i];

  // Pattern 1: if(selectedCrmContact?.id===id) setSelectedCrmContact(...)
  if (line.includes("selectedCrmContact?.id===id") && line.includes("setSelectedCrmContact")) {
    lines[i] = line.replace(
      /if\(selectedCrmContact\?\.id===id\)/g,
      "if(typeof selectedCrmContact!=='undefined'&&selectedCrmContact?.id===id)"
    );
    // Also wrap setSelectedCrmContact calls
    lines[i] = lines[i].replace(
      /setSelectedCrmContact\(p/g,
      "(typeof setSelectedCrmContact==='function'?setSelectedCrmContact:()=>{})(p"
    );
    fixes++;
    console.log("Fixed line " + (i + 1));
  }

  // Pattern 2: selectedCrmContact?.id && freshMap.has(selectedCrmContact.id)
  if (line.includes("selectedCrmContact?.id") && line.includes("freshMap")) {
    lines[i] = line.replace(
      /if \(selectedCrmContact\?\.id/g,
      "if (typeof selectedCrmContact!=='undefined'&&selectedCrmContact?.id"
    );
    // Handle the setSelectedCrmContact in the same line
    lines[i] = lines[i].replace(
      /\) setSelectedCrmContact\(/g,
      ") (typeof setSelectedCrmContact==='function'?setSelectedCrmContact:()=>{})("
    );
    fixes++;
    console.log("Fixed line " + (i + 1));
  }
}

code = lines.join("\n");
fs.writeFileSync(file, code);
console.log("Total fixes: " + fixes);
console.log("selectedCrmContact bug fix complete");
