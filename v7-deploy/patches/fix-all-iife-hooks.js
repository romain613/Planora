// Bulk fix — wrap ALL IIFEs containing hooks with HookIsolator
// Targets patterns: {(()=>{ ... useState/useEffect/useRef ... })()}
// Rewrites to:        <HookIsolator>{()=>{ ... }}</HookIsolator>
//
// Safety: only wraps IIFEs whose body contains useState/useEffect/useRef/useMemo/useCallback.
// Skips already-wrapped occurrences.

const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");
const before = code.length;

const IIFE_OPEN = "{(()=>{";
const IIFE_CLOSE_PATTERN = "})()}";
const WRAPPER_OPEN = "<HookIsolator>{()=>{";
const WRAPPER_CLOSE = "}}</HookIsolator>";
const HOOK_PATTERNS = [/\buseState\s*\(/, /\buseEffect\s*\(/, /\buseRef\s*\(/, /\buseMemo\s*\(/, /\buseCallback\s*\(/, /\buseContext\s*\(/, /\buseLayoutEffect\s*\(/];

// Scan for balanced close of an IIFE starting at openIdx (position of `{`)
function findIIFEClose(code, openIdx) {
  // We start right after the `{` of the JSX expression
  // Pattern: `{(()=>{` opens at openIdx. Depth counting starts at the outer `{`.
  let depth = 0;
  let i = openIdx;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  let templateDepth = 0;

  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      i++; continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") { inBlockComment = false; i += 2; continue; }
      i++; continue;
    }
    if (!inString && templateDepth === 0) {
      if (c === "/" && next === "/") { inLineComment = true; i += 2; continue; }
      if (c === "/" && next === "*") { inBlockComment = true; i += 2; continue; }
    }

    if (inString) {
      if (c === "\\") { i += 2; continue; }
      if (c === inString) {
        if (inString === "`") templateDepth = Math.max(0, templateDepth - 1);
        inString = null;
        i++; continue;
      }
      // Template literal ${ expression
      if (inString === "`" && c === "$" && next === "{") {
        templateDepth++;
        inString = null;
        depth++; // the ${ opens a brace
        i += 2;
        continue;
      }
      i++; continue;
    }

    // Closing a template literal expression
    if (templateDepth > 0 && c === "}" && depth > 0) {
      // Check if this closes a ${...} — we use depth tracking, but need to resume template
      // Simplified: just track braces, and when we see backtick again resume template
      // Actually easier: decrement depth and if after, look for ` to resume template
      depth--;
      i++;
      if (depth < templateDepth) {
        // we just closed a ${} expression inside a template
        templateDepth--;
        inString = "`";
      }
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      if (c === "`") templateDepth++;
      inString = c;
      i++; continue;
    }

    if (c === "{") { depth++; i++; continue; }
    if (c === "}") {
      depth--;
      if (depth === 0) {
        // Check if this is preceded by `})()` making it the IIFE close
        if (code.slice(i - 4, i + 1) === "})()}") {
          return i; // position of the last `}`
        } else {
          return -1; // matched some other `}` — this IIFE is malformed or we miscounted
        }
      }
      i++; continue;
    }
    i++;
  }
  return -1;
}

function bodyHasHooks(body) {
  return HOOK_PATTERNS.some(p => p.test(body));
}

let wrapped = 0;
let skipped = 0;
let errors = 0;
let searchFrom = 0;
const replacements = []; // {openIdx, closeIdx}

while (true) {
  const openIdx = code.indexOf(IIFE_OPEN, searchFrom);
  if (openIdx === -1) break;

  // Skip if preceded by `<HookIsolator>` (already wrapped, or close enough)
  const before100 = code.slice(Math.max(0, openIdx - 40), openIdx);
  if (before100.includes("<HookIsolator>")) {
    searchFrom = openIdx + IIFE_OPEN.length;
    continue;
  }

  // Find matching close
  const closeIdx = findIIFEClose(code, openIdx);
  if (closeIdx === -1) {
    errors++;
    searchFrom = openIdx + IIFE_OPEN.length;
    continue;
  }

  // Check if body has hooks
  const body = code.slice(openIdx + IIFE_OPEN.length, closeIdx - 4);
  if (!bodyHasHooks(body)) {
    skipped++;
    searchFrom = closeIdx + 1;
    continue;
  }

  // Mark for replacement (we apply all at end to avoid shifting indices)
  replacements.push({ openIdx, closeIdx });
  searchFrom = closeIdx + 1;
}

console.log(`Found ${replacements.length} IIFEs with hooks to wrap, ${skipped} IIFEs without hooks (skipped), ${errors} parse errors`);

// Apply replacements from end to start so indices remain valid
replacements.sort((a, b) => b.openIdx - a.openIdx);
for (const { openIdx, closeIdx } of replacements) {
  // Sanity
  if (code.slice(openIdx, openIdx + IIFE_OPEN.length) !== IIFE_OPEN) {
    console.error(`Sanity fail at openIdx=${openIdx}: not '${IIFE_OPEN}'`);
    process.exit(1);
  }
  if (code.slice(closeIdx - 4, closeIdx + 1) !== IIFE_CLOSE_PATTERN) {
    console.error(`Sanity fail at closeIdx=${closeIdx}: not '${IIFE_CLOSE_PATTERN}'`);
    process.exit(1);
  }

  const body = code.slice(openIdx + IIFE_OPEN.length, closeIdx - 4);
  code =
    code.slice(0, openIdx) +
    WRAPPER_OPEN +
    body +
    WRAPPER_CLOSE +
    code.slice(closeIdx + 1);

  wrapped++;
}

// Sanity check on file length change
const expectedDelta = wrapped * 25; // +25 chars per wrap
const actualDelta = code.length - before;
console.log(`Wrapped: ${wrapped} IIFEs. Delta: ${actualDelta} chars (expected ~${expectedDelta})`);

if (Math.abs(actualDelta - expectedDelta) > 10) {
  console.error(`WARN: delta mismatch — expected ~${expectedDelta}, got ${actualDelta}`);
}

fs.writeFileSync(file, code);
console.log("Bulk IIFE-hook wrap complete");
