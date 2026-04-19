#!/usr/bin/env node
// Phase 7-MOVE: Extract CollabPortal from App.jsx into features/collab/CollabPortal.jsx
//
// What this script does:
// 1. Reads app/src/App.jsx
// 2. Extracts the CollabPortal component (lines 123 → 18878 in original)
// 3. Writes a new file features/collab/CollabPortal.jsx with:
//    - Imports adapted for the new path depth (./ → ../../)
//    - The CollabPortal source code unchanged
//    - export default CollabPortal
// 4. Rewrites App.jsx with the CollabPortal block removed and an import added
//
// Idempotent: if features/collab/CollabPortal.jsx already exists, exits gracefully
// Backup: writes App.jsx.pre-move-collab-<ts> before any change

const fs = require('fs');
const path = require('path');

const APP_PATH = path.resolve(__dirname, '../../app/src/App.jsx');
const TARGET_PATH = path.resolve(__dirname, '../../app/src/features/collab/CollabPortal.jsx');

// Marker strings that uniquely identify the start and end of CollabPortal
const START_MARKER = 'const CollabPortal = ({ collab, company, bookings,';
const END_MARKER_LINE = '// ═══════════════════════════════════════════════════';
const END_MARKER_NEXT_LINE = '// ADMIN DASHBOARD';

function main() {
  if (!fs.existsSync(APP_PATH)) {
    console.error('ERR: App.jsx not found at', APP_PATH);
    process.exit(1);
  }

  if (fs.existsSync(TARGET_PATH)) {
    console.log('SKIP: CollabPortal.jsx already exists at', TARGET_PATH);
    process.exit(0);
  }

  const src = fs.readFileSync(APP_PATH, 'utf8');
  const lines = src.split('\n');

  // Find start
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(START_MARKER)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    console.error('ERR: could not find CollabPortal start marker');
    process.exit(1);
  }

  // Find end: scan for the line that is the END_MARKER followed by ADMIN DASHBOARD
  // Then walk back to find the };  that closes CollabPortal (just before the comment block)
  let adminCommentIdx = -1;
  for (let i = startIdx + 100; i < lines.length; i++) {
    if (lines[i].trim() === END_MARKER_LINE && lines[i + 1] && lines[i + 1].includes(END_MARKER_NEXT_LINE)) {
      adminCommentIdx = i;
      break;
    }
  }
  if (adminCommentIdx === -1) {
    console.error('ERR: could not find ADMIN DASHBOARD comment marker');
    process.exit(1);
  }

  // Walk back from adminCommentIdx to find the };  that closes CollabPortal
  // The structure is:
  //   };           <-- this line closes CollabPortal
  //   <blank>
  //   // ═══...   <-- adminCommentIdx
  //   // ADMIN DASHBOARD
  //   // ═══...
  //   const AdminDash = ...
  let endIdx = -1;
  for (let i = adminCommentIdx - 1; i > startIdx; i--) {
    if (lines[i].trim() === '};') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    console.error('ERR: could not find closing }; of CollabPortal');
    process.exit(1);
  }

  console.log(`CollabPortal spans lines ${startIdx + 1} → ${endIdx + 1} (${endIdx - startIdx + 1} lines)`);

  // Backup
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `${APP_PATH}.pre-move-collab-${ts}`;
  fs.writeFileSync(backupPath, src);
  console.log('Backup written:', backupPath);

  // Build the new file content
  const collabPortalSrc = lines.slice(startIdx, endIdx + 1).join('\n');

  const newFileHeader = `import React, { useState, useCallback, useMemo, useEffect, useRef, Fragment } from "react";
import { Device as TwilioDevice } from '@twilio/voice-sdk';

// Phase 5.5 — tab-scoped state
import { _T } from "../../shared/state/tabState";

// Phase 1A extractions
import { T, T_LIGHT, T_DARK, setTheme } from "../../theme";
import { formatPhoneFR, displayPhone } from "../../shared/utils/phone";
import { isValidEmail, isValidPhone } from "../../shared/utils/validators";
import { COMMON_TIMEZONES, genCode } from "../../shared/utils/constants";

// Phase 1B — UI atomics barrel
import { HookIsolator, Logo, I, Avatar, Badge, Btn, Stars, Toggle, LoadBar, Card, Spinner, Req, Skeleton, Input, Stat, Modal, ConfirmModal, EmptyState, HelpTip, ValidatedInput, ErrorBoundary } from "../../shared/ui";

// Phase 2 — pure data & utils extractions
import { DAYS_FR, DAYS_SHORT, MONTHS_FR, getDow, fmtDate } from "../../shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES } from "../../shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../shared/utils/notifications";
import { COMPANIES, INIT_COLLABS, defAvail, INIT_AVAILS, INIT_CALS, INIT_BOOKINGS, INIT_WORKFLOWS, INIT_ROUTING, INIT_POLLS, INIT_CONTACTS, COMPANY_SETTINGS, INIT_ALL_COMPANIES, INIT_ALL_USERS, INIT_ACTIVITY_LOG } from "../../data/fixtures";

// Phase 3 — API service
import { API_BASE, recUrl, collectEnv, api, getAutoTicketCompanyId, setAutoTicketCompanyId } from "../../shared/services/api";

// Phase 4 — extracted screens (relative path from features/collab/)
import {
  FicheClientMsgScreen,
  FicheSuiviScreen,
  FicheDocsLinkedScreen,
  CollabSignalementsScreen,
  FicheDocsPanelScreen,
  PhoneTrainingScreen
} from "./screens";

`;

  const newFileFooter = '\n\nexport default CollabPortal;\n';

  const newFileContent = newFileHeader + collabPortalSrc + newFileFooter;

  // Ensure target dir exists
  fs.mkdirSync(path.dirname(TARGET_PATH), { recursive: true });
  fs.writeFileSync(TARGET_PATH, newFileContent);
  console.log('Wrote new file:', TARGET_PATH, `(${newFileContent.split('\n').length} lines)`);

  // Now rewrite App.jsx: remove lines startIdx..endIdx, replace with import
  // The import goes AT THE TOP of the imports block (after the existing Phase 4 admin import)
  // Find the line just after "} from \"./features/admin/screens\";" and insert there
  const replaceLineIdx = lines.findIndex((l) => l.includes('} from "./features/admin/screens";'));
  if (replaceLineIdx === -1) {
    console.error('ERR: could not find admin screens import to anchor new import');
    process.exit(1);
  }

  // Build the new App.jsx
  // Strategy:
  //   - Keep lines 0..startIdx-1 (everything BEFORE CollabPortal)
  //   - Skip lines startIdx..endIdx (the CollabPortal source)
  //   - Keep lines endIdx+1..end (everything AFTER CollabPortal: comments + AdminDash + forms + App)
  //   - Insert the import after the admin screens import line
  const beforeBlock = lines.slice(0, startIdx);
  const afterBlock = lines.slice(endIdx + 1);
  const newImport = '\n// Phase 7+ — extracted CollabPortal\nimport CollabPortal from "./features/collab/CollabPortal";';

  // Insert import line AFTER replaceLineIdx (which is in beforeBlock)
  // Note: replaceLineIdx < startIdx so it's safely in beforeBlock
  const importedBeforeBlock = [
    ...beforeBlock.slice(0, replaceLineIdx + 1),
    newImport,
    ...beforeBlock.slice(replaceLineIdx + 1),
  ];

  const newAppContent = [...importedBeforeBlock, ...afterBlock].join('\n');
  fs.writeFileSync(APP_PATH, newAppContent);
  console.log('Rewrote App.jsx:', `${newAppContent.split('\n').length} lines (was ${lines.length})`);
  console.log('Diff:', lines.length - newAppContent.split('\n').length, 'lines removed');
}

main();
