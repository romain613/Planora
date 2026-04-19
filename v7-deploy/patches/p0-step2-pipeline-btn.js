// P0 Step 2 — Transfer button on Pipeline Live (as array item in quick actions)
const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");

const lines = code.split("\n");

// Find the quick actions array in phone pipeline
// Pattern: look for {icon:'calendar-plus' line (last item before .map)
// and insert our transfer item before it
let calendarLineIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("icon:'calendar-plus'") && lines[i].includes("tip:'RDV'") && lines[i].includes("setPhoneScheduleForm")) {
    calendarLineIdx = i;
    break;
  }
}

if (calendarLineIdx === -1) {
  console.error("ERROR: calendar-plus quick action not found");
  process.exit(1);
}

console.log("Calendar quick action found at line " + (calendarLineIdx + 1));

// Check if transfer already added
for (let i = calendarLineIdx - 3; i <= calendarLineIdx; i++) {
  if (i >= 0 && lines[i].includes("fromPhonePipeline")) {
    console.log("Transfer button already exists — skipping");
    process.exit(0);
  }
}

// Insert transfer action as array item BEFORE the calendar item
// This follows the same {icon, color, tip, action} pattern
const transferItem = `            {icon:'users',color:'#8B5CF6',tip:'Transférer',action:()=>{setV7TransferModal({contact:ct,fromPhonePipeline:true});setV7TransferTarget('');}},`;

lines.splice(calendarLineIdx, 0, transferItem);
fs.writeFileSync(file, lines.join("\n"));
console.log("Step 2 — P0.1 Transfer button added to Pipeline Live quick actions");
