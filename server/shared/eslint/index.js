// server/shared/eslint/index.js
// Public API rules + runAll() helper pour CI/audit.

import { lint as runtimeImports, lintAll as runtimeImportsAll, RULE_NAME as R1 } from './no-runtime-imports.js';
import { lint as legacyCoupling, lintAll as legacyCouplingAll, RULE_NAME as R2 } from './no-legacy-coupling.js';
import { lint as providerSdk, lintAll as providerSdkAll, RULE_NAME as R3 } from './no-direct-provider-sdk.js';
import { lint as sharedMount, lintAll as sharedMountAll, RULE_NAME as R4 } from './no-shared-runtime-mount.js';
import { lint as tenantBoundary, lintAll as tenantBoundaryAll, RULE_NAME as R5 } from './tenant-boundary-rules.js';

export const RULES = Object.freeze({
  [R1]: { lint: runtimeImports, lintAll: runtimeImportsAll },
  [R2]: { lint: legacyCoupling, lintAll: legacyCouplingAll },
  [R3]: { lint: providerSdk, lintAll: providerSdkAll },
  [R4]: { lint: sharedMount, lintAll: sharedMountAll },
  [R5]: { lint: tenantBoundary, lintAll: tenantBoundaryAll },
});

export const RULE_NAMES = Object.freeze([R1, R2, R3, R4, R5]);

/**
 * Run all rules across rootDir.
 * @param {string} rootDir - typically project root (contient server/)
 * @returns {Array<violation>}
 */
export function runAll(rootDir) {
  const violations = [];
  for (const name of RULE_NAMES) {
    violations.push(...RULES[name].lintAll(rootDir));
  }
  return violations;
}

// Re-export individual rules
export {
  runtimeImports as lintNoRuntimeImports,
  legacyCoupling as lintNoLegacyCoupling,
  providerSdk as lintNoDirectProviderSdk,
  sharedMount as lintNoSharedRuntimeMount,
  tenantBoundary as lintTenantBoundaryRules,
};
