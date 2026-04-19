// Fix 1: Unwrap the V7 Transfer modal conditional
//   Before: {(typeof v7TransferModal!=='undefined'?v7TransferModal:null) && (
//   After:  {v7TransferModal && (
// The scope fix wrapped this, but the modal IS in the same component as useState,
// so the wrap causes typeof to return 'undefined' incorrectly in the minified output.
// Unwrapping makes the modal react to state updates properly.
//
// Fix 2: Add a Transférer button in the Suivi empty state.
// Currently the empty state says "Utilisez le bouton Transférer" but has no button.

const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");
const before = code.length;

// ─── Fix 1a: Unwrap modal conditional ───
const wrappedCondOpen = "{(typeof v7TransferModal!=='undefined'?v7TransferModal:null) && (";
const cleanCondOpen = "{v7TransferModal && (";
let count1 = 0;
while (code.includes(wrappedCondOpen)) {
  code = code.replace(wrappedCondOpen, cleanCondOpen);
  count1++;
}
console.log(`Fix 1a — unwrapped modal conditional: ${count1} occurrence(s)`);

// ─── Fix 1b: Unwrap modal content reads ───
const wrappedContentRead = "(typeof v7TransferModal!=='undefined'?v7TransferModal:{}).contact?.name";
const cleanContentRead = "v7TransferModal.contact?.name";
let count2 = 0;
while (code.includes(wrappedContentRead)) {
  code = code.replace(wrappedContentRead, cleanContentRead);
  count2++;
}
console.log(`Fix 1b — unwrapped modal content read: ${count2} occurrence(s)`);

// ─── Fix 2: Add Transférer button in Suivi empty state ───
// Before:
//   <div style={{fontSize:12,color:T.text3}}>Ce contact n'a pas encore été transféré.<br/>Utilisez le bouton Transférer pour assigner ce contact à un collègue.</div>
//                      </div>
//                    );
// After: same + a button INSIDE the div

const emptyMarker = "Ce contact n\\'a pas encore \\u00e9t\\u00e9 transf\\u00e9r\\u00e9.";
const emptyIdx = code.indexOf(emptyMarker);
if (emptyIdx !== -1) {
  // Find the closing </div> of the inner text div, then the </div> of the outer empty state
  // Inner: <div style={{fontSize:12,...}}>...Utilisez le bouton Transférer...</div>
  // After this we want to insert a button before the outer </div>
  const innerDivClose = code.indexOf("</div>", emptyIdx);
  if (innerDivClose !== -1) {
    // After the inner </div>, we're back inside the outer empty state div.
    // Add the button right after the inner </div>.
    const insertPoint = innerDivClose + "</div>".length;
    const newButton = `
                        <div onClick={()=>{setV7TransferModal({contact:ct,fromFicheSuivi:true});setV7TransferTarget('');}} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"10px 20px",borderRadius:10,marginTop:16,cursor:"pointer",background:"#8B5CF6",color:"#fff",fontSize:13,fontWeight:700,boxShadow:"0 2px 8px #8B5CF640"}}><I n="users" s={14}/> Transf\u00e9rer ce contact</div>`;
    // Only insert if not already present (idempotency check)
    const afterInsert = code.slice(insertPoint, insertPoint + 200);
    if (!afterInsert.includes("Transf\\u00e9rer ce contact")) {
      code = code.slice(0, insertPoint) + newButton + code.slice(insertPoint);
      console.log("Fix 2 — added Transférer button to Suivi empty state");
    } else {
      console.log("Fix 2 — button already present, skipped");
    }
  } else {
    console.warn("Fix 2 — could not find inner </div> close, skipped");
  }
} else {
  console.warn("Fix 2 — Suivi empty state marker not found");
}

const delta = code.length - before;
console.log(`Total delta: ${delta} chars`);

fs.writeFileSync(file, code);
console.log("Modal scope + empty button fix complete");
