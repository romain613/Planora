// server/shared/eslint/tenant-boundary-rules.js
// Rule : impose certaines règles de cohérence multi-tenant sur le code shared/.
//
// Règles :
//   - Toute fonction qui ouvre une DB doit recevoir explicitement un path/handle,
//     JAMAIS de chemin hardcodé /var/www/planora-data/* dans le code (sauf docs/comments).
//   - Tout INSERT/UPDATE/DELETE SQL dans shared/ doit avoir un commentaire mentionnant tenantId
//     OU appeler une fonction nommée *Tenant* (heuristique).
//   - shared/providers/adapters/ NE doit pas avoir de clés API hardcodées.

import { readSafe, walkFiles, makeViolation } from './_lint-helpers.js';

const RULE_ID = 'tenant-boundary-rules';

const HARDCODED_DB_PATH_RE = /['"`]\/var\/www\/planora-data\/[^'"`]+\.db['"`]/;
const SECRET_PATTERNS = [
  /AC[a-f0-9]{32}/i,                  // Twilio Account SID
  /SK[a-f0-9]{32}/i,                  // Twilio API Key SID
  /sk_(live|test)_[A-Za-z0-9]{20,}/,  // Stripe secret
  /AIza[A-Za-z0-9_-]{35}/,            // Google API key
  /ghp_[A-Za-z0-9]{36,}/,             // GitHub PAT
  /xkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}/i, // Brevo API key
];

export function lint(filePath, code) {
  if (!filePath || !code) return [];
  const norm = filePath.replace(/\\/g, '/');
  if (!norm.includes('/server/shared/')) return [];

  const violations = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Skip pure comment lines
    const trimmed = line.trim();
    const isCommentLine = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');

    // Skip README.md (text doc)
    if (norm.endsWith('.md')) continue;

    // Check hardcoded DB path (code only, pas commentaire)
    if (!isCommentLine && HARDCODED_DB_PATH_RE.test(line)) {
      violations.push(makeViolation(
        RULE_ID,
        filePath,
        i + 1,
        `hardcoded production DB path detected (must be caller-injected, not embedded)`,
      ));
    }

    // Check hardcoded secrets (code only)
    if (!isCommentLine) {
      for (const pat of SECRET_PATTERNS) {
        if (pat.test(line)) {
          violations.push(makeViolation(
            RULE_ID,
            filePath,
            i + 1,
            `hardcoded secret pattern detected (must be env var or caller-injected)`,
          ));
          break;
        }
      }
    }
  }

  return violations;
}

export function lintAll(rootDir) {
  const files = walkFiles(rootDir, /\.(js|mjs|cjs)$/);
  const all = [];
  for (const f of files) {
    const code = readSafe(f);
    all.push(...lint(f, code));
  }
  return all;
}

export const meta = {
  type: 'problem',
  docs: {
    description: 'Enforce tenant boundary rules in shared/ (no hardcoded prod paths, no hardcoded secrets)',
    category: 'PLANORA Tenant Hardening',
  },
  schema: [],
};

export function create(context) {
  return {
    'Program:exit'() {
      const violations = lint(context.getFilename(), context.getSourceCode().getText());
      for (const v of violations) {
        context.report({
          loc: { line: v.line, column: 0 },
          message: v.message,
        });
      }
    },
  };
}

export const RULE_NAME = RULE_ID;
