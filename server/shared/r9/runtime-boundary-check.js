// server/shared/r9/runtime-boundary-check.js
// Vérifie l'invariant I5 : 0 import bidirectionnel shared/ ↔ legacy.
//   - shared/ ne doit pas importer de routes/services/cron/helpers
//   - legacy ne doit pas importer de shared/
//   - server/index.js ne doit pas monter shared/
// Combine 3 rules ESLint.

import {
  lintNoRuntimeImports,
  lintNoLegacyCoupling,
  lintNoSharedRuntimeMount,
} from '../eslint/index.js';
import { walkFiles, readSafe } from '../eslint/_lint-helpers.js';
import path from 'node:path';

/**
 * Run runtime boundary check sur server/.
 * @param {string} serverRoot - typiquement path absolu vers server/
 * @returns {{ok:boolean, violations:Array, counts:object}}
 */
export function runRuntimeBoundaryCheck(serverRoot) {
  const violations = [];
  const counts = { runtimeImports: 0, legacyCoupling: 0, sharedMount: 0 };

  // 1. shared/ → legacy (no-runtime-imports)
  const sharedFiles = walkFiles(path.join(serverRoot, 'shared'), /\.(js|mjs|cjs)$/);
  for (const f of sharedFiles) {
    const code = readSafe(f);
    const vs = lintNoRuntimeImports(f, code);
    counts.runtimeImports += vs.length;
    violations.push(...vs);
  }

  // 2. legacy → shared/ (no-legacy-coupling)
  const legacyDirs = ['routes', 'services', 'cron', 'helpers', 'middleware'];
  for (const dir of legacyDirs) {
    const dirPath = path.join(serverRoot, dir);
    const files = walkFiles(dirPath, /\.(js|mjs|cjs)$/);
    for (const f of files) {
      const code = readSafe(f);
      const vs = lintNoLegacyCoupling(f, code);
      counts.legacyCoupling += vs.length;
      violations.push(...vs);
    }
  }

  // 3. server/index.js mount shared (no-shared-runtime-mount)
  const entryPoints = ['index.js', 'app.js', 'server.js'];
  for (const ep of entryPoints) {
    const f = path.join(serverRoot, ep);
    const code = readSafe(f);
    if (code) {
      const vs = lintNoSharedRuntimeMount(f, code);
      counts.sharedMount += vs.length;
      violations.push(...vs);
    }
  }

  return { ok: violations.length === 0, violations, counts };
}
