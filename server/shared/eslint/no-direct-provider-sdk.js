// server/shared/eslint/no-direct-provider-sdk.js
// Rule : interdit aux fichiers `server/shared/providers/**` d'importer directement
// les SDKs npm des providers (twilio, @getbrevo/brevo, @sendinblue/sendinblue, etc.).
// Le client doit toujours être INJECTÉ par le caller, jamais auto-instancié.

import { extractImports, readSafe, walkFiles, makeViolation } from './_lint-helpers.js';

const RULE_ID = 'no-direct-provider-sdk';

const FORBIDDEN_PACKAGES = [
  /^twilio$/,
  /^twilio\//,
  /^@getbrevo\/brevo$/,
  /^@sendinblue\/sendinblue/,
  /^sib-api-v3-sdk$/,
  /^@vonage\//,
  /^plivo$/,
  /^messagebird$/,
  /^@stripe\/stripe-js$/, // Stripe billing future, mais doit aussi être injecté
];

export function lint(filePath, code) {
  if (!filePath || !code) return [];
  const norm = filePath.replace(/\\/g, '/');
  if (!norm.includes('/server/shared/providers/')) return [];

  const imports = extractImports(code);
  const violations = [];

  for (const imp of imports) {
    const src = imp.source;
    if (src.startsWith('.') || src.startsWith('/')) continue;
    if (src.startsWith('node:')) continue;

    for (const pat of FORBIDDEN_PACKAGES) {
      if (pat.test(src)) {
        violations.push(makeViolation(
          RULE_ID,
          filePath,
          imp.line,
          `direct import of provider SDK "${src}" forbidden — client must be injected by caller`,
        ));
        break;
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
    description: 'Forbid direct npm SDK imports in providers/ (twilio, @getbrevo/brevo, etc.) — clients must be injected',
    category: 'PLANORA Provider Abstraction',
  },
  schema: [],
};

export function create(context) {
  return {
    ImportDeclaration(node) {
      const violations = lint(context.getFilename(), context.getSourceCode().getText());
      for (const v of violations) {
        if (v.line === node.loc.start.line) {
          context.report({ node, message: v.message });
        }
      }
    },
  };
}

export const RULE_NAME = RULE_ID;
export const FORBIDDEN_PACKAGES_LIST = FORBIDDEN_PACKAGES.map((r) => r.source);
