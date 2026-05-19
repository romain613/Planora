// server/shared/eslint/_lint-helpers.js
// Helpers standalone pour tester les règles SANS dépendance ESLint.
// Chaque règle expose à la fois la structure ESLint ({ meta, create }) ET
// une fonction `lint(filePath, code)` qui scan via regex (analyse statique légère).
//
// En Phase 4+ : un caller ESLint utilisera create(). En Sprint 4 : les tests utilisent lint().

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Walk a directory recursivement, retourne tous les fichiers matchant un pattern.
 * @param {string} root
 * @param {RegExp} pattern - matche le filename
 * @param {RegExp} [excludePath] - skip si chemin matche
 */
export function walkFiles(root, pattern, excludePath) {
  const results = [];
  if (!existsSync(root)) return results;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      const full = path.join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (excludePath && excludePath.test(full)) continue;
      if (st.isDirectory()) {
        // skip node_modules / .git par défaut
        if (name === 'node_modules' || name === '.git') continue;
        stack.push(full);
      } else if (st.isFile() && pattern.test(name)) {
        results.push(full);
      }
    }
  }
  return results;
}

/**
 * Extrait tous les imports/require statiques d'un fichier source.
 * @returns {Array<{type: 'import'|'require', source: string, line: number}>}
 */
export function extractImports(code) {
  const lines = code.split('\n');
  const out = [];
  // ES import
  const importRe = /^\s*import\s+(?:[\s\S]+?\s+from\s+)?['"]([^'"]+)['"]/;
  // require
  const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m1 = line.match(importRe);
    if (m1) {
      out.push({ type: 'import', source: m1[1], line: i + 1 });
      continue;
    }
    const m2 = line.match(requireRe);
    if (m2) {
      out.push({ type: 'require', source: m2[1], line: i + 1 });
    }
  }
  return out;
}

/**
 * Tente de résoudre un import relatif → chemin absolu.
 * Retourne null si import non relatif (package npm).
 */
export function resolveRelativeImport(filePath, importSource) {
  if (!importSource.startsWith('.')) return null;
  const dir = path.dirname(filePath);
  return path.resolve(dir, importSource);
}

/**
 * Lit safe (jamais throw, retourne '' si erreur).
 */
export function readSafe(filePath) {
  try { return readFileSync(filePath, 'utf8'); }
  catch { return ''; }
}

/**
 * Format violation report.
 */
export function makeViolation(rule, filePath, line, message) {
  return { rule, file: filePath, line, message };
}
