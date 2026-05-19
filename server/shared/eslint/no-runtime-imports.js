// server/shared/eslint/no-runtime-imports.js
// Rule : interdit `server/shared/**/*` d'importer des fichiers `server/{routes,services,cron,helpers,middleware,db}/**`.
// (Sauf intra-shared/middleware légitime, et sauf imports node: built-in.)
//
// API ESLint (Phase 4+) : module.exports = { meta, create(context) }
// API standalone (Sprint 4 tests) : export { lint(filePath, code) }

import { extractImports, readSafe, walkFiles, makeViolation } from './_lint-helpers.js';
import path from 'node:path';

const RULE_ID = 'no-runtime-imports';
const FORBIDDEN_LEGACY_DIRS = ['routes', 'services', 'cron', 'helpers'];
// Note: `middleware` et `db` sont intentionnellement absents — il y en a aussi dans shared/.
// La check est faite sur le chemin résolu, pas le nom de dossier seul.

/**
 * Vérifie un (filePath, code) et retourne array de violations.
 */
export function lint(filePath, code) {
  if (!filePath || !code) return [];
  // S'applique uniquement aux fichiers sous server/shared/
  const norm = filePath.replace(/\\/g, '/');
  if (!norm.includes('/server/shared/')) return [];

  const imports = extractImports(code);
  const violations = [];

  for (const imp of imports) {
    const src = imp.source;
    if (!src.startsWith('.')) continue;

    // Résoudre absolument
    const resolved = path.resolve(path.dirname(filePath), src);
    const resolvedNorm = resolved.replace(/\\/g, '/');

    // Si import sort de server/shared/ ET pointe vers un dossier legacy interdit → violation
    if (resolvedNorm.includes('/server/shared/')) continue; // intra-shared OK

    for (const dir of FORBIDDEN_LEGACY_DIRS) {
      if (resolvedNorm.includes(`/server/${dir}/`)) {
        violations.push(makeViolation(
          RULE_ID,
          filePath,
          imp.line,
          `import from server/${dir}/ forbidden in shared/ (couples shared to legacy runtime)`,
        ));
        break;
      }
    }

    // server/db/database.js, server/db/tenantResolver.js sont legacy spécifiques
    if (/\/server\/db\/(database|tenantResolver)\.(c?js|mjs)$/.test(resolvedNorm)) {
      violations.push(makeViolation(
        RULE_ID,
        filePath,
        imp.line,
        `import server/db/database.js or tenantResolver.js forbidden in shared/`,
      ));
    }
  }

  return violations;
}

/**
 * Audit complet d'un dossier (utilisé par r9/runtime-boundary-check.js).
 */
export function lintAll(rootDir) {
  const files = walkFiles(rootDir, /\.(js|mjs|cjs)$/);
  const all = [];
  for (const f of files) {
    const code = readSafe(f);
    all.push(...lint(f, code));
  }
  return all;
}

// ESLint-compatible meta (utilisé Phase 4+ via .eslintrc)
export const meta = {
  type: 'problem',
  docs: {
    description: 'Forbid imports from server/{routes,services,cron,helpers} or server/db/{database,tenantResolver}.js in shared/',
    category: 'PLANORA Phase 1 Boundaries',
  },
  schema: [],
};

export function create(context) {
  // Stub ESLint-style create — pour usage futur Phase 4+ via plugin.
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
