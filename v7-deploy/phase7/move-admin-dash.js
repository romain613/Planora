#!/usr/bin/env node
// Phase 7-MOVE: Extract AdminDash + admin forms/helpers from App.jsx into features/admin/AdminDash.jsx
//
// Moves: AdminDash, NewCollabForm, NewCompanyForm, PlacesAutocomplete,
//        DEFAULT_TEMPLATES, TEMPLATE_VARS, TemplateEditorPopup, NewCalForm
// All these are used only by AdminDash and live as a contiguous block in App.jsx
// between AdminDash declaration and the App default export.

const fs = require('fs');
const path = require('path');

const APP_PATH = path.resolve(__dirname, '../../app/src/App.jsx');
const TARGET_PATH = path.resolve(__dirname, '../../app/src/features/admin/AdminDash.jsx');

const START_MARKER = 'const AdminDash = ({ company, onLogout, onVisitor,';
const END_BOUNDARY_MARKER = 'export default function App()';

function main() {
  if (!fs.existsSync(APP_PATH)) {
    console.error('ERR: App.jsx not found at', APP_PATH);
    process.exit(1);
  }

  if (fs.existsSync(TARGET_PATH)) {
    console.log('SKIP: AdminDash.jsx already exists at', TARGET_PATH);
    process.exit(0);
  }

  const src = fs.readFileSync(APP_PATH, 'utf8');
  const lines = src.split('\n');

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(START_MARKER)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    console.error('ERR: could not find AdminDash start marker');
    process.exit(1);
  }

  // End boundary: walk back from `export default function App` to find the last  }; or }
  // before the App declaration. The structure ends with NewCalForm followed by App.
  let appDeclIdx = -1;
  for (let i = startIdx + 100; i < lines.length; i++) {
    if (lines[i].startsWith(END_BOUNDARY_MARKER)) {
      appDeclIdx = i;
      break;
    }
  }
  if (appDeclIdx === -1) {
    console.error('ERR: could not find App default export');
    process.exit(1);
  }

  // Walk back from appDeclIdx to find the last `};` (closing of the last form)
  // Then include that line (it's part of the moved block)
  let endIdx = -1;
  for (let i = appDeclIdx - 1; i > startIdx; i--) {
    const t = lines[i].trim();
    if (t === '};') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    console.error('ERR: could not find closing }; of last admin block');
    process.exit(1);
  }

  console.log(`AdminDash + admin block spans lines ${startIdx + 1} → ${endIdx + 1} (${endIdx - startIdx + 1} lines)`);

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `${APP_PATH}.pre-move-admin-${ts}`;
  fs.writeFileSync(backupPath, src);
  console.log('Backup written:', backupPath);

  const adminBlockSrc = lines.slice(startIdx, endIdx + 1).join('\n');

  // Header includes ALL imports possibly used by AdminDash + sub-forms.
  // The forms use NewCollabForm, NewCompanyForm, PlacesAutocomplete, etc., so we keep them in the same file.
  // Imports needed: same set as App.jsx + admin screens barrel.
  const newFileHeader = `import React, { useState, useCallback, useMemo, useEffect, useRef, Fragment } from "react";

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

// Phase 4 — extracted admin screens (relative path from features/admin/)
import {
  AdminPerfCollabScreen,
  AdminKnowledgeBaseScreen,
  VisionInscriptionsScreen,
  VisionFauconScreen,
  AdminLeadsScreen,
  AdminObjectifsScreen,
  AdminAiAgentsScreen,
  AdminSignalementsScreen,
  AdminCallFormsScreen
} from "./screens";

`;

  const newFileFooter = '\n\nexport default AdminDash;\n';

  const newFileContent = newFileHeader + adminBlockSrc + newFileFooter;

  fs.mkdirSync(path.dirname(TARGET_PATH), { recursive: true });
  fs.writeFileSync(TARGET_PATH, newFileContent);
  console.log('Wrote new file:', TARGET_PATH, `(${newFileContent.split('\n').length} lines)`);

  // Rewrite App.jsx: remove startIdx..endIdx, add an import after the existing CollabPortal import
  const collabImportIdx = lines.findIndex((l) => l.includes('import CollabPortal from "./features/collab/CollabPortal"'));
  if (collabImportIdx === -1) {
    console.error('ERR: could not find CollabPortal import to anchor new admin import');
    process.exit(1);
  }

  const beforeBlock = lines.slice(0, startIdx);
  const afterBlock = lines.slice(endIdx + 1);
  const newImport = 'import AdminDash from "./features/admin/AdminDash";';

  const importedBeforeBlock = [
    ...beforeBlock.slice(0, collabImportIdx + 1),
    newImport,
    ...beforeBlock.slice(collabImportIdx + 1),
  ];

  const newAppContent = [...importedBeforeBlock, ...afterBlock].join('\n');
  fs.writeFileSync(APP_PATH, newAppContent);
  console.log('Rewrote App.jsx:', `${newAppContent.split('\n').length} lines (was ${lines.length})`);
  console.log('Diff:', lines.length - newAppContent.split('\n').length, 'lines removed');
}

main();
