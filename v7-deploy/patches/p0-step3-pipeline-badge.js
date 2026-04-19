// P0 Step 3 — Executor badge on Pipeline Live cards
const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");

const lines = code.split("\n");
let phoneBadgeLine = -1;

// Find the SECOND occurrence of card_label&&<span (first is CRM, second is phone pipeline)
let occurrences = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("card_label&&<span") && lines[i].includes("card_color")) {
    occurrences++;
    if (occurrences === 2) {
      phoneBadgeLine = i;
      break;
    }
  }
}

// Fallback: search for fontSize:7 + card_label + card_color
if (phoneBadgeLine === -1) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("fontSize:7") && lines[i].includes("card_label") && lines[i].includes("card_color")) {
      phoneBadgeLine = i;
      break;
    }
  }
}

if (phoneBadgeLine === -1) {
  console.log("WARNING: card_label line not found for phone pipeline badges — skipping");
  process.exit(0);
}

console.log("Phone pipeline card_label found at line " + (phoneBadgeLine + 1));

const badgeLine = `                      {v7FollowersMap[ct.id]?.executor && v7FollowersMap[ct.id].executor.collaboratorId !== collab.id && <span style={{padding:'0 4px',borderRadius:4,fontSize:7,fontWeight:700,background:'#8B5CF620',color:'#8B5CF6',flexShrink:0}} title={'Chez '+v7FollowersMap[ct.id].executor.collaboratorName}>{(v7FollowersMap[ct.id].executor.collaboratorName||'').split(' ')[0]}</span>}`;

lines.splice(phoneBadgeLine + 1, 0, badgeLine);
fs.writeFileSync(file, lines.join("\n"));
console.log("Step 3 — P0.2 Executor badge added to Pipeline Live");
