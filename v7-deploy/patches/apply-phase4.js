// Phase 4 — Extract 15 HookIsolator blocks as React screen components
//
// Each <HookIsolator>{() => { ... }}</HookIsolator> block becomes a proper
// React function component under app/src/components/screens/. The block body
// moves byte-identical; only the wrapper changes from IIFE-in-HookIsolator
// to a named function component with explicit props.
//
// Pre-reqs: Phases 0-3 applied (theme.js, utils/, data/, services/, components/ui/).
//
// Each block's free variables (closure refs) were pre-computed via AST
// analysis (see /tmp/phase4-tools/analyze.js). This patcher reads an
// embedded list of { marker, componentName, freeVars, hooks, bodyTokens }.
//
// Idempotent. Auto-backup.

const fs = require("fs");
const path = require("path");

const APP_JSX = process.argv[2] || "/var/www/planora/app/src/App.jsx";
const DRY = process.argv.includes("--dry-run");

if (!fs.existsSync(APP_JSX)) {
  console.error("[FAIL] App.jsx not found:", APP_JSX);
  process.exit(1);
}

const srcDir = path.dirname(APP_JSX);
const screensDir = path.join(srcDir, "components", "screens");

const original = fs.readFileSync(APP_JSX, "utf8");

if (original.includes('from "./components/screens"') || original.includes("from './components/screens'")) {
  console.log("[OK] Already patched. No-op.");
  process.exit(0);
}

// ── HookIsolator block locator (tag-depth-aware) ──
function findMatchingCloseTag(src, startPos) {
  let depth = 1;
  let i = startPos;
  while (i < src.length) {
    const openIdx = src.indexOf("<HookIsolator>", i);
    const closeIdx = src.indexOf("</HookIsolator>", i);
    if (closeIdx < 0) return -1;
    if (openIdx >= 0 && openIdx < closeIdx) { depth++; i = openIdx + "<HookIsolator>".length; }
    else { depth--; i = closeIdx + "</HookIsolator>".length; if (depth === 0) return closeIdx; }
  }
  return -1;
}

function findHookIsolatorBlocks(src) {
  const blocks = [];
  const re = /<HookIsolator>\s*\{\s*\(\s*\)\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const openerStart = m.index;
    const bodyStart = m.index + m[0].length;
    const closeTagStart = findMatchingCloseTag(src, bodyStart);
    if (closeTagStart < 0) continue;
    let idx = closeTagStart - 1;
    while (idx >= 0 && /\s/.test(src[idx])) idx--;
    if (src[idx] !== "}") continue;
    idx--;
    while (idx >= 0 && /\s/.test(src[idx])) idx--;
    if (src[idx] !== "}") continue;
    const bodyEnd = idx;

    const afterClose = closeTagStart + "</HookIsolator>".length;
    let outerBraceIdx = afterClose;
    while (outerBraceIdx < src.length && /\s/.test(src[outerBraceIdx])) outerBraceIdx++;
    const outerExprEnd = src[outerBraceIdx] === "}" ? outerBraceIdx + 1 : afterClose;

    let back = openerStart - 1;
    while (back >= 0 && /\s/.test(src[back])) back--;
    // Only accept blocks with `&&` immediately before `<HookIsolator>` —
    // i.e. inside a `{cond && <HookIsolator>...}` expression. Skip standalone
    // HookIsolators (e.g. NBA @L4270, StatusHistory @L6607 fixed in earlier phases).
    if (!(back >= 1 && src[back] === "&" && src[back - 1] === "&")) continue;

    let depth = 0, outerStart = -1;
    for (let k = back; k >= 0; k--) {
      const c = src[k];
      if (c === ")" || c === "]" || c === "}") depth++;
      else if (c === "(" || c === "[") depth--;
      else if (c === "{" && depth === 0) { outerStart = k; break; }
    }
    if (outerStart < 0) continue;

    let cond = src.slice(outerStart + 1, openerStart).trim();
    cond = cond.replace(/&&\s*$/, "").trim();

    blocks.push({ outerStart, outerEnd: outerExprEnd, bodyStart, bodyEnd, condition: cond });
  }
  return blocks;
}

// ── Pre-computed per-block metadata (from analyze.js) ──
// condition string → component name, closure-ref prop list, hooks used
const META = {
  'collabFicheTab==="client_msg"': {
    name: "FicheClientMsgScreen", props: ["ct", "notifList", "setNotifList", "setNotifUnread", "showNotif"], hooks: ["useState", "useEffect"],
  },
  'collabFicheTab==="suivi"': {
    name: "FicheSuiviScreen", props: ["ct", "setV7TransferModal", "setV7TransferTarget"], hooks: ["useState", "useEffect"],
  },
  'collabFicheTab==="docs"&&ct._linked': {
    name: "FicheDocsLinkedScreen", props: ["ct", "showNotif"], hooks: ["useState", "useEffect"],
  },
  'portalTab === "signalements"': {
    name: "CollabSignalementsScreen", props: ["collab", "setCollabAlertCount", "showNotif"], hooks: ["useState", "useEffect"],
  },
  "ct.id": {
    name: "FicheDocsPanelScreen", props: ["ct", "showNotif"], hooks: ["useState", "useEffect"],
  },
  "phoneSubTab === 'training'": {
    name: "PhoneTrainingScreen", props: ["appMyPhoneNumbers", "collab", "company", "showNotif"], hooks: ["useState", "useEffect"],
  },
  'tab === "perfCollab"': {
    name: "AdminPerfCollabScreen", props: ["collabs", "company", "perfExpanded", "perfPeriod", "pushNotification", "setPerfExpanded", "setPerfPeriod"], hooks: ["useState", "useEffect", "useCallback"],
  },
  'tab === "knowledge-base"': {
    name: "AdminKnowledgeBaseScreen", props: ["company", "showNotif"], hooks: ["useState", "useEffect"],
  },
  'visionSubTab === "inscriptions"': {
    name: "VisionInscriptionsScreen", props: ["pushNotification"], hooks: ["useState", "useEffect"],
  },
  'visionSubTab === "faucon"': {
    name: "VisionFauconScreen", props: [], hooks: ["useState", "useEffect"],
  },
  'tab === "leads"': {
    name: "AdminLeadsScreen", props: ["collab", "collabs", "company", "contacts", "pushNotification"], hooks: ["useState", "useEffect"],
  },
  'tab === "objectifs"': {
    name: "AdminObjectifsScreen", props: ["collabs", "company", "pushNotification"], hooks: ["useState", "useEffect"],
  },
  'tab === "ai-agents"': {
    name: "AdminAiAgentsScreen", props: ["calendars", "company", "showNotif"], hooks: ["useState", "useEffect"],
  },
  'tab === "signalements"': {
    name: "AdminSignalementsScreen", props: ["company", "showNotif"], hooks: ["useState", "useEffect"],
  },
  'tab === "call-forms"': {
    name: "AdminCallFormsScreen", props: ["askConfirm", "collabs", "company", "pushNotification"], hooks: ["useState", "useEffect"],
  },
};

// ── Find all blocks and correlate with META ──
const blocks = findHookIsolatorBlocks(original);
if (blocks.length !== 15) {
  console.error("[FAIL] Expected 15 HookIsolator blocks, found", blocks.length);
  process.exit(2);
}

const tasks = [];
for (const b of blocks) {
  // Normalize the condition for META lookup (strip extra whitespace)
  const condKey = b.condition.replace(/\s+/g, "");
  let meta = null;
  for (const [k, v] of Object.entries(META)) {
    if (k.replace(/\s+/g, "") === condKey) { meta = v; break; }
  }
  if (!meta) {
    console.error("[FAIL] No META for condition:", JSON.stringify(b.condition));
    process.exit(3);
  }
  tasks.push({ ...b, ...meta });
}

// ── Generate screen files ──
// Shared preamble: import everything from Phase 0-3. Tree-shaking drops unused.
const PREAMBLE = `import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { T } from "../../theme";
import { formatPhoneFR, displayPhone } from "../../utils/phone";
import { isValidEmail, isValidPhone } from "../../utils/validators";
import { COMMON_TIMEZONES, genCode } from "../../utils/constants";
import { DAYS_FR, DAYS_SHORT, MONTHS_FR, getDow, fmtDate } from "../../utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES } from "../../utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../utils/notifications";
import {
  COMPANIES, INIT_COLLABS, defAvail, INIT_AVAILS, INIT_CALS, INIT_BOOKINGS,
  INIT_WORKFLOWS, INIT_ROUTING, INIT_POLLS, INIT_CONTACTS, COMPANY_SETTINGS,
  INIT_ALL_COMPANIES, INIT_ALL_USERS, INIT_ACTIVITY_LOG
} from "../../data/fixtures";
import {
  API_BASE, recUrl, collectEnv, api,
  getAutoTicketCompanyId, setAutoTicketCompanyId
} from "../../services/api";
import {
  HookIsolator, Logo, I, Avatar, Badge, Btn, Stars, Toggle, LoadBar, Card,
  Spinner, Req, Skeleton, Input, Stat, Modal, ConfirmModal, EmptyState,
  HelpTip, ValidatedInput, ErrorBoundary
} from "../ui";
`;

function generateScreenFile(task) {
  const body = original.slice(task.bodyStart, task.bodyEnd);
  const propsDestr = task.props.length ? `{ ${task.props.join(", ")} }` : "";
  return PREAMBLE + "\n" +
    `export default function ${task.name}(${propsDestr}) {\n` +
    body + "\n" +
    "}\n";
}

// ── Build patched App.jsx ──
// Sort tasks by outerStart descending; replace each block with a component call
const sortedDesc = [...tasks].sort((a, b) => b.outerStart - a.outerStart);
let patched = original;
for (const t of sortedDesc) {
  const propsStr = t.props.map(p => `${p}={${p}}`).join(" ");
  const replacement = `{${t.condition} && <${t.name} ${propsStr} />}`;
  patched = patched.slice(0, t.outerStart) + replacement + patched.slice(t.outerEnd);
}

// ── Insert barrel import after Phase 3 import ──
const ANCHOR = '} from "./services/api";';
const anchorIdx = patched.indexOf(ANCHOR);
if (anchorIdx < 0) {
  console.error("[FAIL] Phase 3 import anchor not found. Is Phase 3 applied?");
  process.exit(4);
}
const insertAt = anchorIdx + ANCHOR.length;
const NEW_IMPORT =
  "\n\n// Phase 4 — extracted screens\n" +
  "import {\n" +
  "  " + tasks.map(t => t.name).join(",\n  ") + "\n" +
  '} from "./components/screens";';
patched = patched.slice(0, insertAt) + NEW_IMPORT + patched.slice(insertAt);

// ── Sanity ──
for (const t of tasks) {
  if (patched.includes(`<HookIsolator>{()=>{` + original.slice(t.bodyStart, Math.min(t.bodyStart + 50, t.bodyEnd)).replace(/\n/g, ""))) {
    // Skip — the HookIsolator content shouldn't appear verbatim; sanity too loose
  }
}
// Count remaining HookIsolator usages (shouldn't be 0 because HookIsolator import stays — but no inline IIFE)
// Expect exactly 2 remaining HookIsolators (standalone NBA + StatusHistory
// from earlier bug fixes — NOT in scope for Phase 4 extraction).
const remainingIife = (patched.match(/<HookIsolator>\s*\{\s*\(\s*\)\s*=>\s*\{/g) || []).length;
const EXPECTED_REMAINING = 2;
if (remainingIife !== EXPECTED_REMAINING) {
  console.error("[FAIL] Expected " + EXPECTED_REMAINING + " standalone HookIsolators to remain, got " + remainingIife);
  process.exit(5);
}

// ── Dry-run ──
if (DRY) {
  console.log("[DRY-RUN] Phase 4 — screen extractions");
  console.log("");
  console.log("Would create", tasks.length, "screen files under:", screensDir);
  for (const t of tasks) {
    console.log("  " + t.name + ".jsx  (" + (t.bodyEnd - t.bodyStart) + " chars, props=[" + t.props.join(",") + "])");
  }
  console.log("");
  console.log("App.jsx size:");
  console.log("  Before:", original.length, "chars");
  console.log("  After: ", patched.length, "chars");
  console.log("  Delta: ", patched.length - original.length, "chars");
  console.log("");
  console.log("[DRY-RUN] No files written.");
  process.exit(0);
}

// ── Backup ──
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = APP_JSX + ".pre-phase4-" + ts;
fs.copyFileSync(APP_JSX, backupPath);
console.log("[BACKUP]", backupPath);

// ── Write screen files ──
fs.mkdirSync(screensDir, { recursive: true });
for (const t of tasks) {
  const content = generateScreenFile(t);
  const fp = path.join(screensDir, t.name + ".jsx");
  fs.writeFileSync(fp, content);
  console.log("[CREATE]", fp, "(" + content.length + " bytes)");
}

// ── Write barrel ──
const barrel = "// Phase 4 screens barrel\n" +
  tasks.map(t => `export { default as ${t.name} } from "./${t.name}";`).join("\n") + "\n";
fs.writeFileSync(path.join(screensDir, "index.js"), barrel);
console.log("[CREATE]", path.join(screensDir, "index.js"));

fs.writeFileSync(APP_JSX, patched);
console.log("[PATCH]", APP_JSX);
console.log("[PATCH] Size delta:", patched.length - original.length, "chars");
console.log("[OK] Phase 4 applied —", tasks.length, "screens extracted.");
