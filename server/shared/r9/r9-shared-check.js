// server/shared/r9/r9-shared-check.js
// Vérifie l'intégrité structurelle de server/shared/ :
//   - chaque sous-dossier attendu existe
//   - chaque index.js public existe
//   - chaque README.md existe (sauf cas particuliers)

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const EXPECTED_SUBDIRS = [
  'db', 'auth', 'guards', 'middleware', 'errors', 'logging', 'utils',
  'providers', 'eslint', 'contracts', 'r9', 'e2e', 'docs',
];

const SUBDIRS_REQUIRE_INDEX = [
  'db', 'auth', 'guards', 'middleware', 'errors', 'logging', 'utils',
  'providers', 'eslint', 'contracts',
];

const SUBDIRS_REQUIRE_README = [
  'auth', 'guards', 'middleware', 'errors', 'logging', 'utils', 'providers', 'db',
];

/**
 * Run integrity check sur server/shared/.
 * @param {string} sharedRoot - typiquement path absolu vers server/shared
 * @returns {{ok:boolean, violations:string[], present:string[]}}
 */
export function runR9SharedCheck(sharedRoot) {
  const violations = [];
  const present = [];

  if (!existsSync(sharedRoot)) {
    return { ok: false, violations: [`shared root not found: ${sharedRoot}`], present: [] };
  }

  // 1. shared/README.md
  if (!existsSync(path.join(sharedRoot, 'README.md'))) {
    violations.push('shared/README.md missing');
  } else {
    present.push('README.md');
  }

  // 2. Each expected subdir
  for (const sub of EXPECTED_SUBDIRS) {
    const subPath = path.join(sharedRoot, sub);
    if (!existsSync(subPath) || !statSync(subPath).isDirectory()) {
      violations.push(`shared/${sub}/ missing or not directory`);
      continue;
    }
    present.push(sub);

    if (SUBDIRS_REQUIRE_INDEX.includes(sub)) {
      if (!existsSync(path.join(subPath, 'index.js'))) {
        violations.push(`shared/${sub}/index.js missing`);
      }
    }

    if (SUBDIRS_REQUIRE_README.includes(sub)) {
      if (!existsSync(path.join(subPath, 'README.md'))) {
        violations.push(`shared/${sub}/README.md missing`);
      }
    }
  }

  return { ok: violations.length === 0, violations, present };
}
