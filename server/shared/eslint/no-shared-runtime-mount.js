// server/shared/eslint/no-shared-runtime-mount.js
// Rule : interdit dans `server/index.js` (et points d'entrée Express équivalents)
// de monter (app.use, app.get, app.post) quoi que ce soit qui importe shared/.

import { extractImports, readSafe, makeViolation } from './_lint-helpers.js';

const RULE_ID = 'no-shared-runtime-mount';

// Fichiers entry-points où check applicable
const ENTRY_POINT_RE = /\/server\/(index|app|server)\.(c?js|mjs)$/;

export function lint(filePath, code) {
  if (!filePath || !code) return [];
  const norm = filePath.replace(/\\/g, '/');
  if (!ENTRY_POINT_RE.test(norm)) return [];

  const violations = [];

  // 1. Check imports depuis shared/
  const imports = extractImports(code);
  for (const imp of imports) {
    if (imp.source.includes('shared/') || imp.source.includes('shared\\')) {
      violations.push(makeViolation(
        RULE_ID,
        filePath,
        imp.line,
        `import from shared/ in entry-point forbidden (I2 invariant — Phase 1 dormant)`,
      ));
    }
  }

  // 2. Check app.use / app.get / app.post / etc avec string 'shared'
  const lines = code.split('\n');
  const mountRe = /\b(app|router)\.(use|get|post|put|delete|patch|all)\s*\(\s*['"`][^'"`]*shared[^'"`]*['"`]/;
  for (let i = 0; i < lines.length; i += 1) {
    if (mountRe.test(lines[i])) {
      violations.push(makeViolation(
        RULE_ID,
        filePath,
        i + 1,
        `app.use/get/post with path containing 'shared' forbidden in entry-point`,
      ));
    }
  }

  return violations;
}

export function lintAll(rootDir) {
  // Pour ce rule on cible directement les entry points
  const candidates = [
    `${rootDir}/server/index.js`,
    `${rootDir}/server/app.js`,
    `${rootDir}/server/server.js`,
  ];
  const all = [];
  for (const f of candidates) {
    const code = readSafe(f);
    if (code) all.push(...lint(f, code));
  }
  return all;
}

export const meta = {
  type: 'problem',
  docs: {
    description: 'Forbid mounting shared/ in Express entry-points (server/index.js) during Phase 1',
    category: 'PLANORA Phase 1 Invariants',
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
