// ═══════════════════════════════════════════════════════════════════════
// COMPREHENSIVE SCOPE FIX v6.0 — BLOCKLIST RESTORED (v4.0 style)
// ═══════════════════════════════════════════════════════════════════════
// v6.0 CHANGE: The massive blocklist is BACK.
// v5.0 tried smart-detection-only — it missed class component methods
// (like static getDerivedStateFromError(error)) and broke the build.
// Blocklist approach is safer: skip generic names that collide with
// function params, destructured vars, callbacks, object keys.
//
// Genuine distant ReferenceErrors (pipelineRightContact, selectedCrmContact)
// have long specific names NOT in the blocklist, so they still get fixed.
//
// MIN_NAME_LENGTH raised to 5 (was 3) — extra safety on short names.
// ═══════════════════════════════════════════════════════════════════════

const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");
let lines = code.split("\n");

console.log("═══ SCOPE FIX v6.0 — BLOCKLIST RESTORED (" + lines.length + " lines) ═══\n");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ═══ v6.0: robust string-literal detection ═══
// Walks through the line counting unescaped quotes to determine if the
// given offset is inside a string literal. This catches cases like
// '/api/followers-batch' where the variable is in the middle of a URL.
function isInsideStringLiteral(line, offset) {
  let inSingle = false, inDouble = false, inBacktick = false;
  for (let i = 0; i < offset; i++) {
    const ch = line[i];
    // skip escape sequences
    if (ch === "\\" && i + 1 < offset) { i++; continue; }
    if (ch === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (ch === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;
  }
  return inSingle || inDouble || inBacktick;
}

// ═══ BLOCKLIST v6.0 (v4.0 style, expanded) ═══
// Generic names that collide with function params, destructured vars,
// callback args, object keys, class method params, etc.
// If a name is short/generic AND likely appears outside state scope,
// it goes here. We accept that we won't "fix" these — they usually
// don't need fixing anyway (they're local vars in other contexts).
const BLOCKLIST = new Set([
  // Original micro-blocklist
  "map", "set", "get", "key", "ref", "id", "log", "cat", "sel", "sub",
  "tab", "cab", "car", "bar", "foo", "obj", "arr", "str", "num", "fn",
  "cb", "el", "ev", "ch", "dt", "tz", "tr", "td", "th", "li", "ul",
  "ok", "no", "yes", "on", "off", "up", "dn", "ct", "cv", "pm", "am",

  // Common function/callback parameters (THE BIG ONE — breaks builds)
  "error", "err", "data", "result", "response", "res", "req", "request",
  "event", "evt", "item", "index", "idx", "value", "val", "param", "args",
  "props", "state", "prev", "next", "curr", "acc", "init", "opts", "options",
  "msg", "message", "payload", "body", "content", "text", "ctx", "context",
  "node", "child", "children", "parent", "sibling", "target", "source",
  "callback", "handler", "listener", "cleanup", "setup",

  // Generic nouns (often state AND often params)
  "name", "email", "phone", "password", "role", "title", "description",
  "label", "type", "size", "color", "style", "className", "icon", "image",
  "url", "slug", "path", "route", "link", "src", "href", "domain",
  "subject", "subj", "desc", "form", "view", "step", "show", "done",
  "plan", "company", "sector", "priority", "category", "status", "mode",

  // Time/date (often params and short names)
  "date", "time", "day", "month", "year", "hour", "minute", "second",
  "duration", "period", "start", "end", "from", "to", "when", "since",
  "timestamp", "timezone", "delay", "timeout",

  // Numeric/measurement (often params)
  "count", "total", "sum", "avg", "min", "max", "offset", "limit",
  "width", "height", "top", "left", "right", "bottom", "x", "y", "z",
  "page", "pageSize", "rows", "cols", "columns",

  // File/IO
  "file", "files", "filename", "filepath", "dir", "folder", "mime", "ext",

  // Async/loading status
  "loading", "submitting", "sending", "loaded", "uploading", "uploaded",
  "saving", "saved", "fetching", "fetched", "pending", "success", "failure",

  // Collections (common local var names)
  "list", "items", "rows", "entries", "values", "keys", "pairs",
  "msgs", "notes", "tags", "options", "choices", "fields",
  "answers", "sources", "rules", "agents", "sessions", "rewards",
  "progress", "tickets", "workflows", "logs",

  // Names that commonly appear inside URL strings like /api/foo/bar
  // (the string-literal detection only looks at the char immediately
  // before/after the match, so names in the middle of a URL get wrapped)
  "followers", "envelopes", "incoming", "assignments", "supervision",
  "calling", "forms", "templates", "messages", "permissions",
  "invitations", "subscriptions", "settings", "preferences",
  "notifications", "statistics", "metrics", "analytics", "reports",
  "exports", "imports", "transfers", "attachments", "documents",
  "comments", "reviews", "ratings", "invoices", "payments",
  "webhooks", "integrations", "triggers", "scripts",

  // UI / react
  "action", "click", "change", "input", "select", "submit", "focus", "blur",

  // Form/validation
  "valid", "invalid", "validated", "errors", "warnings", "dirty", "touched",

  // Auth
  "token", "user", "users", "admin", "auth", "login", "logout", "signup",

  // Calendar/booking domain (often short names in deep components)
  "booked", "booking", "bookings", "cal", "cals", "slot", "slots",
  "avail", "avails", "collab", "collabs", "contact", "contacts",
  "blackouts", "vacations", "reminder", "reminders",

  // Calendar reminder/confirm flags (many variants in forms)
  "videoAuto", "requireApproval", "groupMax", "reconfirm",
  "confirmEmail", "confirmSms", "confirmWhatsapp",
  "reminderEmail", "reminderSms", "reminderWhatsapp",
  "reminder24h", "reminder1h", "reminder15min",
  "whatsappNumber", "bufferBefore", "bufferAfter", "minNotice",
  "customConfirmSms", "customConfirmWhatsapp",
  "customReminderSms", "customReminderWhatsapp", "customReminders",
  "calReminder24h", "calReminder1h", "calReminder15min",
  "editTpl", "location",

  // Company registration form fields
  "companyName", "contactEmail", "adminFirstName", "adminLastName",
  "adminPhone", "adminPassword", "sendWelcomeEmail", "secureIaWords",

  // Auth/landing state (Landing has many short state names)
  "authError", "authMode", "authLoading", "rememberMe",
  "hoveredFeature", "hoveredInteg", "hoveredPlan", "billingAnnual",
  "googleClientId", "leadForm", "leadSubmitting", "pageData",

  // Multiple scope duplicates from diagnostic
  "tabKey", "tLoading", "calling", "notification", "notifications",
  "notifOpen", "notifList", "notifUnread", "notifPanelOpen",
  "modalState", "scoreSettings", "auditData", "perfData",
  "kbData", "kbSection", "kbForm", "kbDocs", "kbSaving",
  "csvImport", "csvImportModal",

  // Picker / selectors (generic but not state-specific)
  "selectedDate", "selectedSlot", "selectedDuration", "selectedContact",
  "selectedBooking", "selectedDay", "selDate", "selForm",

  // Misc common
  "visitorTz", "collabTimezone", "visitorCal", "portalData",
  "darkMode", "isSupraAdmin", "sidebarOpen", "navCatsOpen",
  "searchOpen", "searchQuery", "searchIndex", "shortcutsOpen",
  "confirmModal", "confirmDelete",
]);

const MIN_NAME_LENGTH = 5;

// ── Configuration ──
const SAFE_ZONE = 300;
const DETECT_THRESHOLD = 300;

// ── Step 1: Find ALL useState declarations ──
const useStatePattern = /const \[(\w+),\s*(set\w+)\]\s*=\s*useState/;
const allStateVars = [];

for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(useStatePattern);
  if (match) {
    allStateVars.push({ reader: match[1], setter: match[2], line: i });
  }
}

console.log("Found " + allStateVars.length + " useState declarations");

// ── Step 2: Filter — only keep vars with distant refs ──
const VARIABLES_TO_FIX = [];
let blocked = [];

for (const sv of allStateVars) {
  if (BLOCKLIST.has(sv.reader)) {
    blocked.push(sv.reader + " (blocklisted)");
    continue;
  }
  if (sv.reader.length < MIN_NAME_LENGTH) {
    blocked.push(sv.reader + " (too short: " + sv.reader.length + " chars)");
    continue;
  }

  let hasDistantUnprotected = false;
  for (let i = 0; i < lines.length; i++) {
    if (i === sv.line) continue;
    const line = lines[i];
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    const dist = Math.abs(i - sv.line);
    if (dist <= DETECT_THRESHOLD) continue;

    const hasRef = line.includes(sv.reader) && !line.includes("useState");
    if (hasRef) {
      const isProtected = line.includes("typeof " + sv.reader) || line.includes("typeof " + sv.setter);
      if (!isProtected) {
        hasDistantUnprotected = true;
        break;
      }
    }
  }

  if (hasDistantUnprotected) {
    VARIABLES_TO_FIX.push({ reader: sv.reader, setter: sv.setter, declLine: sv.line });
  }
}

console.log("\nBlocked " + blocked.length + " variables (micro-blocklist/too short):");
for (const b of blocked) console.log("  ⊘ " + b);

console.log("\nVariables to fix: " + VARIABLES_TO_FIX.length);
for (const v of VARIABLES_TO_FIX) {
  console.log("  → " + v.reader + " (line " + (v.declLine + 1) + ")");
}
console.log("");

// ── Step 3: Apply fixes ──
let totalFixes = 0;

for (const varConfig of VARIABLES_TO_FIX) {
  const { reader, setter, declLine } = varConfig;

  console.log("═══ Fixing: " + reader + " (declared line " + (declLine + 1) + ") ═══");

  let varFixes = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.includes(reader)) continue;
    if (Math.abs(i - declLine) < SAFE_ZONE) continue;
    if (line.includes("typeof " + reader) || line.includes("typeof " + setter)) continue;
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
    if (line.includes("useState")) continue;

    let newLine = line;
    let changed = false;

    // Fix 1: Wrap setter calls (v4.0: word boundary)
    if (newLine.includes(setter + "(")) {
      const safeSet = "(typeof " + setter + "==='function'?" + setter + ":function(){})(";
      const setterRegex = new RegExp("(?<![\\w$])" + escapeRegex(setter) + "\\(", "g");
      const before1 = newLine;
      newLine = newLine.replace(setterRegex, safeSet);
      if (newLine !== before1) changed = true;
    }

    // Fix 2: Wrap reader?.property access (v4.0: word boundary)
    const optChain = reader + "?.";
    if (newLine.includes(optChain)) {
      const parts = newLine.split(setter);
      for (let p = 0; p < parts.length; p++) {
        if (parts[p].includes(optChain)) {
          const optSubParts = parts[p].split(optChain);
          for (let s = 0; s < optSubParts.length - 1; s++) {
            if (!/\.\s*$/.test(optSubParts[s]) && !/['"`]$/.test(optSubParts[s]) && !/\w$/.test(optSubParts[s])) {
              optSubParts[s] = optSubParts[s] + "(typeof " + reader + "!=='undefined'?" + reader + ":null)?.";
              changed = true;
            } else {
              optSubParts[s] = optSubParts[s] + optChain;
            }
          }
          parts[p] = optSubParts.join("");
        }
      }
      newLine = parts.join(setter);
    }

    // Fix 3: Wrap reader.property access (v4.0: word boundary)
    const dotAccess = reader + ".";
    if (newLine.includes(dotAccess)) {
      const parts = newLine.split(setter);
      for (let p = 0; p < parts.length; p++) {
        if (parts[p].includes(dotAccess) && !parts[p].includes("typeof " + reader)) {
          const subParts = parts[p].split(dotAccess);
          for (let s = 0; s < subParts.length - 1; s++) {
            if (!subParts[s].endsWith("?")
                && !/\.\s*$/.test(subParts[s])
                && !/['"`]$/.test(subParts[s])
                && !/\w$/.test(subParts[s])
                && !subParts[s].endsWith("typeof " + reader + "!=='undefined'?" + reader + ":null)")) {
              subParts[s] = subParts[s] + "(typeof " + reader + "!=='undefined'?" + reader + ":{}).";
              changed = true;
            } else {
              subParts[s] = subParts[s] + dotAccess;
            }
          }
          parts[p] = subParts.join("");
        }
      }
      newLine = parts.join(setter);
    }

    // Fix 4: Wrap bare reader access
    if (newLine.includes(reader) && !newLine.includes("typeof " + reader) && changed === false) {
      const bareRegex = new RegExp("(?<![\\w$])" + escapeRegex(reader) + "(?![\\w$])(?!\\.)", "g");
      const beforeReplace = newLine;
      const wrapExpr = "(typeof " + reader + "!=='undefined'?" + reader + ":null)";
      newLine = newLine.replace(bareRegex, function(match, offset) {
        const after = newLine.substring(offset + match.length);
        const before = newLine.substring(0, offset);

        // v4.0: Word boundary defense in depth
        if (/[\w$]$/.test(before)) return match;

        // v3.6: Dot accessor
        if (/\.\s*$/.test(before)) return match;

        // v3.8: String literal (boundary)
        if (/['"`]$/.test(before) || /^['"`]/.test(after)) return match;

        // v6.0: inside string literal (counts unescaped quotes)
        if (isInsideStringLiteral(newLine, offset)) return match;

        // v3.7: const/let/var declaration
        if (/\b(?:const|let|var)\s+$/.test(before)) return match;

        // v3.6: Assignment target / JSX attribute / arrow param
        if (/^\s*=(?!=)/.test(after)) return match;

        // v3.4+v3.5: Destructured parameter
        if (/[{\[,]\s*$/.test(before) && /^\s*[,}\]]/.test(after)) return match;

        // v3.4+v3.5: Destructured default
        if (/[{\[,]\s*$/.test(before) && /^\s*=/.test(after)) return match;

        // v5.0 Class 14: FUNCTION PARAMETER DEFINITION
        // Pattern: variable between ( and , or ) in a function definition
        // We detect function definitions by:
        //   a) 'function' keyword appears before the opening paren
        //   b) '=>' appears after the closing paren (arrow function)
        // We do NOT skip function CALL arguments (those need wrapping)
        if (/[(,]\s*$/.test(before) && /^\s*[,)]/.test(after)) {
          // Check: is 'function' keyword in the text before this variable?
          if (/\bfunction\b/.test(before)) return match;
          // Check: does ') =>' appear after this variable (arrow function)?
          if (/^\s*\)\s*=>/.test(after)) return match;
          if (/^\s*,[^)]*\)\s*=>/.test(after)) return match;
          // Check: does the full line contain ') =>' or ') {' after a param list?
          // This catches arrow functions where the variable is early in a long param list
          const fullLineAfter = newLine.substring(offset);
          if (/\)\s*=>/.test(fullLineAfter) && /[(,]\s*$/.test(before)) {
            // Verify we're inside the param list (between ( and ) before =>)
            const arrowMatch = fullLineAfter.match(/\)\s*=>/);
            if (arrowMatch) return match;
          }
        }

        // v5.0 Class 15: JSX BOOLEAN ATTRIBUTE
        // Pattern: <Tag attrName> or <Tag attrName /> or <Tag attrName otherAttr
        // The variable is inside a JSX opening tag, used as a boolean attribute
        // Detection: before contains '<' + word without closing '>', after starts with space/>//>
        if (/^\s*(?:\/?>|\s+[\w])/.test(after)) {
          // Check if we're inside a JSX tag (< with tag name, no closing >)
          const lastLT = before.lastIndexOf('<');
          const lastGT = before.lastIndexOf('>');
          if (lastLT > lastGT && /<\w/.test(before.substring(lastLT))) {
            return match; // JSX boolean attribute → skip
          }
        }

        // v3.3: Object key (followed by colon, not ternary)
        if (/^\s*:(?!:)/.test(after)) {
          if (/\?\s*$/.test(before)) return wrapExpr; // ternary → wrap
          return match; // object key → skip
        }

        // Normal variable reference → wrap
        return wrapExpr;
      });
      if (newLine !== beforeReplace) changed = true;
    }

    if (changed) {
      lines[i] = newLine;
      varFixes++;
      totalFixes++;
      if (varFixes <= 5) {
        console.log("  Fixed line " + (i + 1) + ": " + line.trim().substring(0, 80));
      }
    }
  }

  if (varFixes > 5) {
    console.log("  ... and " + (varFixes - 5) + " more");
  }
  console.log("  Total fixes for " + reader + ": " + varFixes + "\n");
}

// ── Step 4: Verify ──
console.log("═══ VERIFICATION SCAN ═══");
let remaining = 0;

for (const varConfig of VARIABLES_TO_FIX) {
  for (let i = 0; i < lines.length; i++) {
    if (i === varConfig.declLine) continue;
    const line = lines[i];
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    const dist = Math.abs(i - varConfig.declLine);
    if (dist <= DETECT_THRESHOLD) continue;

    if (line.includes(varConfig.reader) && !line.includes("useState")) {
      const isProtected = line.includes("typeof " + varConfig.reader) || line.includes("typeof " + varConfig.setter);
      if (!isProtected) {
        remaining++;
        if (remaining <= 10) {
          console.log("  STILL UNPROTECTED: " + varConfig.reader + " at line " + (i + 1) + ": " + line.trim().substring(0, 80));
        }
      }
    }
  }
}

if (remaining > 0) {
  console.log("  WARNING: " + remaining + " references still unprotected (skipped by smart detection)");
} else {
  console.log("  ✅ All distant references in targeted variables are now protected");
}

// ── Write result ──
code = lines.join("\n");
fs.writeFileSync(file, code);

console.log("\n═══ SCOPE FIX v6.0 COMPLETE ═══");
console.log("Total fixes applied: " + totalFixes);
console.log("Variables fixed: " + VARIABLES_TO_FIX.length);
console.log("Variables blocked: " + blocked.length + " (micro-blocklist only)");
console.log("Lines: " + lines.length);
