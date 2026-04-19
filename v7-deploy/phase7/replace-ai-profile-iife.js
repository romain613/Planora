#!/usr/bin/env node
// Phase 11c — replace AI Profile IIFE in CollabPortal.jsx with <AiProfileTab/>
// Cuts from `{portalTab === "ai-profile" && collab.ai_copilot_enabled && (()=>{` to its matching `})()}`

const fs = require('fs');
const path = require('path');

const PATH = path.resolve(__dirname, '../../app/src/features/collab/CollabPortal.jsx');
const START_PATTERN = '{portalTab === "ai-profile" && collab.ai_copilot_enabled && (()=>{';
const END_PATTERN = '})()}';
const REPLACEMENT = '        {portalTab === "ai-profile" && collab.ai_copilot_enabled && <AiProfileTab/>}';

const src = fs.readFileSync(PATH, 'utf8');
const lines = src.split('\n');

let startIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(START_PATTERN)) { startIdx = i; break; }
}
if (startIdx === -1) { console.error('start not found'); process.exit(1); }

// End: walk forward looking for the matching `})()}` at same indent
// The IIFE has known structure: starts with 8-space indent, ends with `        })()}`
let endIdx = -1;
for (let i = startIdx + 1; i < lines.length; i++) {
  if (lines[i] === '        })()}') { endIdx = i; break; }
}
if (endIdx === -1) { console.error('end not found'); process.exit(1); }

console.log(`AI Profile IIFE: lines ${startIdx + 1} → ${endIdx + 1} (${endIdx - startIdx + 1} lines)`);

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(`${PATH}.pre-ai-extract-${ts}`, src);
console.log('Backup written');

const newLines = [
  ...lines.slice(0, startIdx),
  REPLACEMENT,
  ...lines.slice(endIdx + 1),
];
fs.writeFileSync(PATH, newLines.join('\n'));
console.log(`Rewrote: ${newLines.length} lines (was ${lines.length}, diff -${lines.length - newLines.length})`);
