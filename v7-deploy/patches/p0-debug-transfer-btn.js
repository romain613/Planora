// DEBUG — Add console.log to transfer button action to diagnose click issue
const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");

// Find the pipeline transfer button action (the one we just deployed)
const oldAction = "action:()=>{setV7TransferModal({contact:ct,fromPhonePipeline:true});setV7TransferTarget('');}";
const idx = code.indexOf(oldAction);

if (idx === -1) {
  console.error("ERROR: Pipeline transfer action not found in code");
  // Try to find partial matches
  const partial1 = code.indexOf("fromPhonePipeline");
  console.log("fromPhonePipeline found at index: " + partial1);
  if (partial1 !== -1) {
    const context = code.substring(Math.max(0, partial1 - 200), partial1 + 200);
    console.log("Context around fromPhonePipeline:\n" + context);
  }
  process.exit(1);
}

console.log("Found pipeline transfer action at index " + idx);

// Replace with version that has console.log for debugging
const newAction = "action:()=>{console.log('TRANSFER CLICK',ct,typeof setV7TransferModal);setV7TransferModal({contact:ct,fromPhonePipeline:true});setV7TransferTarget('');}";
code = code.replace(oldAction, newAction);

// Also add debug to the CRM transfer button
const crmAction = "e.stopPropagation();setV7TransferModal({contact:ct,fromPipeline:true});setV7TransferTarget('');";
if (code.includes(crmAction)) {
  code = code.replace(crmAction, "e.stopPropagation();console.log('CRM TRANSFER CLICK',ct,typeof setV7TransferModal);setV7TransferModal({contact:ct,fromPipeline:true});setV7TransferTarget('');");
  console.log("Debug added to CRM transfer button too");
}

// Check where the modal is rendered relative to Pipeline Live
const modalIdx = code.indexOf("V7 TRANSFER MODAL");
const pipelineLiveIdx = code.indexOf("Pipeline Live") || code.indexOf("phonePipeline") || code.indexOf("pipelineRdvForm");
console.log("Modal comment at index: " + modalIdx);
console.log("Pipeline-related code at index: " + pipelineLiveIdx);

// Check if v7TransferModal state renders
const modalRenderIdx = code.indexOf("{v7TransferModal && (");
console.log("Modal render at index: " + modalRenderIdx);
if (modalRenderIdx !== -1) {
  // Show which lines it's on
  const beforeModal = code.substring(0, modalRenderIdx);
  const modalLine = beforeModal.split("\n").length;
  console.log("Modal renders at line: " + modalLine);
}

fs.writeFileSync(file, code);
console.log("Debug console.logs added — rebuild to see output in browser console");
