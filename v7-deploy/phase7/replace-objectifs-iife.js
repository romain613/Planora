#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const PATH = path.resolve(__dirname, '../../app/src/features/collab/CollabPortal.jsx');
const src = fs.readFileSync(PATH, 'utf8');
const lines = src.split('\n');

const START = '{portalTab === "objectifs" && (() => {';
const REPLACEMENT = '        {portalTab === "objectifs" && <ObjectifsTab/>}';

let startIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(START)) { startIdx = i; break; }
}
if (startIdx === -1) { console.error('start not found'); process.exit(1); }

let endIdx = -1;
for (let i = startIdx + 1; i < lines.length; i++) {
  if (lines[i] === '        })()}') { endIdx = i; break; }
}
if (endIdx === -1) { console.error('end not found'); process.exit(1); }

console.log(`Objectifs IIFE: lines ${startIdx + 1} → ${endIdx + 1} (${endIdx - startIdx + 1} lines)`);

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(`${PATH}.pre-objectifs-${ts}`, src);

const newLines = [...lines.slice(0, startIdx), REPLACEMENT, ...lines.slice(endIdx + 1)];
fs.writeFileSync(PATH, newLines.join('\n'));
console.log(`Rewrote: ${newLines.length} lines (was ${lines.length}, diff -${lines.length - newLines.length})`);
