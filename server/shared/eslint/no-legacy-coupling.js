// server/shared/eslint/no-legacy-coupling.js
// Rule : interdit le runtime legacy (server/routes/, server/services/, etc.) d'importer
// quoi que ce soit depuis server/shared/.
// Direction inverse de no-runtime-imports.js.

import { extractImports, readSafe, walkFiles, makeViolation } from './_lint-helpers.js';
import path from 'node:path';

const RULE_ID = 'no-legacy-coupling';
const LEGACY_ROOTS = ['/server/routes/', '/server/services/', '/server/cron/', '/server/helpers/', '/server/middleware/'];

export function lint(filePath, code) {
  if (!filePath || !code) return [];
  const norm = filePath.replace(/\\/g, '/');

  // S'applique uniquement aux fichiers sous server/{routes,services,cron,helpers,middleware}/
  const inLegacy = LEGACY_ROOTS.some((d) => norm.includes(d));
  if (!inLegacy) return [];
  // Exception : server/shared/middleware/ — NOT legacy
  if (norm.includes('/server/shared/')) return [];

  const imports = extractImports(code);
  const violations = [];

  for (const imp of imports) {
    const src = imp.source;
    if (!src.startsWith('.')) continue;
    const resolved = path.resolve(path.dirname(filePath), src);
    const resolvedNorm = resolved.replace(/\\/g, '/');
    if (resolvedNorm.includes('/server/shared/')) {
      violations.push(makeViolation(
        RULE_ID,
        filePath,
        imp.line,
        `legacy code must not import from server/shared/ (Phase 1 invariant I5)`,
      ));
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
    description: 'Forbid legacy code (routes/services/cron/helpers/middleware) from importing server/shared/',
    category: 'PLANORA Phase 1 Boundaries',
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
