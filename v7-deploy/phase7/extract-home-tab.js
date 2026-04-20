#!/usr/bin/env node
// Phase 13a — extract Home tab from CollabPortal.jsx into features/collab/tabs/HomeTab.jsx
// The Home block is an IIFE: {portalTab === "home" && (()=>{ ...code... return <div>...</div>; })()}
// We extract:
//   - The body between `(()=>{` and the matching `})()}`
//   - Wrap it in a React component using useCollabContext()
//   - Replace the original block with `<HomeTab/>`

const fs = require('fs');
const path = require('path');

const PATH = path.resolve(__dirname, '../../app/src/features/collab/CollabPortal.jsx');
const TARGET = path.resolve(__dirname, '../../app/src/features/collab/tabs/HomeTab.jsx');

const src = fs.readFileSync(PATH, 'utf8');
const lines = src.split('\n');

const START_PATTERN = '{portalTab === "home" && (()=>{';
let startIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(START_PATTERN)) { startIdx = i; break; }
}
if (startIdx === -1) { console.error('start not found'); process.exit(1); }

let endIdx = -1;
for (let i = startIdx + 1; i < lines.length; i++) {
  if (lines[i] === '        })()}') { endIdx = i; break; }
}
if (endIdx === -1) { console.error('end not found'); process.exit(1); }

console.log(`Home IIFE: lines ${startIdx + 1} → ${endIdx + 1} (${endIdx - startIdx + 1} lines)`);

// The IIFE body is everything between line startIdx (which is `{portalTab === "home" && (()=>{`)
// and endIdx (which is `        })()}`). We want lines startIdx+1 to endIdx-1 (the body).
const bodyLines = lines.slice(startIdx + 1, endIdx);

// The body uses 10-space indent (because it's inside the IIFE inside the JSX). Strip 10 spaces.
const dedented = bodyLines.map(l => l.startsWith('          ') ? l.slice(10) : (l.startsWith('        ') ? l.slice(8) : l));

const header = `// Phase 13a — extracted Home tab from CollabPortal.jsx (was lines ${startIdx + 1}-${endIdx + 1} IIFE).

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Avatar, Stat, Stars } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { _T } from "../../../shared/state/tabState";
import { useCollabContext } from "../context/CollabContext";

const HomeTab = () => {
  const {
    collab, showNotif,
    bookings, voipCallLogs, smsCredits, contacts,
    portalTab, setPortalTab,
    portalTabKey, setPortalTabKey,
    phoneDialNumber, setPhoneDialNumber,
    phoneRightTab, setPhoneRightTab,
    pipelineRightContact, setPipelineRightContact,
    phoneShowScheduleModal, setPhoneShowScheduleModal,
    phoneScheduleForm, setPhoneScheduleForm,
    rdvPasseModal, setRdvPasseModal,
    selectedCrmContact, setSelectedCrmContact,
    collabFicheTab, setCollabFicheTab,
    startPhoneCall, startVoipCall,
  } = useCollabContext();

`;

const footer = `};

export default HomeTab;
`;

// The IIFE body ends with `return <div ...>...</div>;` — we keep that.
const newFileContent = header + dedented.join('\n') + footer;

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(`${PATH}.pre-home-${ts}`, src);
fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, newFileContent);
console.log(`Wrote: ${TARGET} (${newFileContent.split('\n').length} lines)`);

// Replace the IIFE in CollabPortal with <HomeTab/>
const REPLACEMENT = '        {portalTab === "home" && <HomeTab/>}';
const newLines = [...lines.slice(0, startIdx), REPLACEMENT, ...lines.slice(endIdx + 1)];
fs.writeFileSync(PATH, newLines.join('\n'));
console.log(`Rewrote CollabPortal: ${newLines.length} lines (was ${lines.length}, diff -${lines.length - newLines.length})`);
