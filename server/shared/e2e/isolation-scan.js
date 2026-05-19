// server/shared/e2e/isolation-scan.js
// Scanner E2E dry-run : agrège tous les checks d'isolation Phase 1.
//
// Aucun appel runtime / réseau / DB prod.
// Pure analyse filesystem + statique du code.
//
// Sortie : rapport JSON-friendly { ok, summary, violations }.

import path from 'node:path';
import { runR9SharedCheck } from '../r9/r9-shared-check.js';
import { runProviderIsolationCheck } from '../r9/provider-isolation-check.js';
import { runRuntimeBoundaryCheck } from '../r9/runtime-boundary-check.js';
import { runAll as runAllEslintRules } from '../eslint/index.js';

/**
 * Run all isolation scans.
 * @param {string} projectRoot - racine du repo (contient server/)
 * @returns {object} rapport agrégé
 */
export function runIsolationScan(projectRoot) {
  const serverRoot = path.join(projectRoot, 'server');
  const sharedRoot = path.join(serverRoot, 'shared');
  const providersRoot = path.join(sharedRoot, 'providers');

  const sharedCheck = runR9SharedCheck(sharedRoot);
  const providerCheck = runProviderIsolationCheck(providersRoot);
  const boundaryCheck = runRuntimeBoundaryCheck(serverRoot);
  const eslintViolations = runAllEslintRules(projectRoot);

  const allViolations = [
    ...sharedCheck.violations.map((v) => ({ rule: 'r9-shared-check', message: v })),
    ...providerCheck.violations,
    ...boundaryCheck.violations,
    // eslint violations sont déjà incluses dans boundaryCheck pour la plupart,
    // mais on garde une trace si on étend le runAll futur.
  ];

  // Dédupe (un même check peut sortir 2 fois entre boundary et eslint runAll)
  const seen = new Set();
  const deduped = [];
  for (const v of allViolations) {
    const key = `${v.rule || ''}|${v.file || ''}|${v.line || 0}|${v.message || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(v);
  }

  return {
    ok: sharedCheck.ok && providerCheck.ok && boundaryCheck.ok,
    summary: {
      sharedStructure: { ok: sharedCheck.ok, presentDirs: sharedCheck.present.length },
      providerIsolation: { ok: providerCheck.ok, violationsCount: providerCheck.violations.length },
      runtimeBoundary: { ok: boundaryCheck.ok, ...boundaryCheck.counts },
      eslintRulesViolations: eslintViolations.length,
    },
    violations: deduped,
  };
}
