// P0 Fix v2 — Add executor badge to phone pipeline card
const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");
const lines = code.split("\n");

// Find the ct.name display line in the phone pipeline expanded card
// Pattern: fontSize:14, fontWeight:800, ct.name — this is the contact name in the expanded card
let nameLineIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("{ct.name}") && lines[i].includes("fontSize:14") && lines[i].includes("fontWeight:800")) {
    nameLineIdx = i;
    break;
  }
}

if (nameLineIdx === -1) {
  console.error("ERROR: ct.name line (fontSize:14, fontWeight:800) not found");
  process.exit(1);
}

console.log("Found ct.name at line " + (nameLineIdx + 1) + ": " + lines[nameLineIdx].trim().substring(0, 80));

// Check if badge already exists right after this line (within 3 lines)
for (let i = nameLineIdx + 1; i <= Math.min(nameLineIdx + 3, lines.length - 1); i++) {
  if (lines[i].includes("v7FollowersMap") && lines[i].includes("fontSize:7")) {
    console.log("Badge already exists at line " + (i + 1) + " — skipping");
    process.exit(0);
  }
}

// Insert executor badge after the name line
const badgeLine = `                {v7FollowersMap[ct.id]?.executor && v7FollowersMap[ct.id].executor.collaboratorId !== collab.id && <span style={{display:'inline-block',padding:'0 5px',borderRadius:4,fontSize:7,fontWeight:700,background:'#8B5CF620',color:'#8B5CF6',marginLeft:6}} title={'Chez '+v7FollowersMap[ct.id].executor.collaboratorName}>{(v7FollowersMap[ct.id].executor.collaboratorName||'').split(' ')[0]}</span>}`;

lines.splice(nameLineIdx + 1, 0, badgeLine);
fs.writeFileSync(file, lines.join("\n"));
console.log("Badge inserted after line " + (nameLineIdx + 1));
console.log("Done!");
