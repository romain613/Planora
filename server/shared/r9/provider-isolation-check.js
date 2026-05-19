// server/shared/r9/provider-isolation-check.js
// Vérifie l'isolation du module providers/ :
//   - aucun import de SDK npm (twilio, brevo, etc.) — délègue à no-direct-provider-sdk.js
//   - aucun client auto-instancié (pas de `new Twilio(...)` direct)
//   - chaque adapter expose constructor avec `opts.client` requis

import { lintNoDirectProviderSdk } from '../eslint/index.js';
import { walkFiles, readSafe } from '../eslint/_lint-helpers.js';
import path from 'node:path';

/**
 * Run isolation check sur server/shared/providers/.
 * @param {string} providersRoot - path absolu vers server/shared/providers
 * @returns {{ok:boolean, violations:Array}}
 */
export function runProviderIsolationCheck(providersRoot) {
  const violations = [];

  // 1. SDK imports check via ESLint rule
  const files = walkFiles(providersRoot, /\.(js|mjs|cjs)$/);
  for (const f of files) {
    const code = readSafe(f);
    violations.push(...lintNoDirectProviderSdk(f, code));
  }

  // 2. Constructor injection check : adapters doivent require opts.client
  const adapterFiles = walkFiles(path.join(providersRoot, 'adapters'), /\.js$/);
  for (const f of adapterFiles) {
    if (f.endsWith('index.js')) continue;
    const code = readSafe(f);
    // L'adapter doit vérifier opts.client (ou similaire) dans son constructor
    if (!/opts\.client|this\._client/.test(code)) {
      violations.push({
        rule: 'provider-isolation-check',
        file: f,
        line: 0,
        message: `adapter must validate opts.client (caller-injected, never auto-instantiated)`,
      });
    }
    // Détection rough : new TwilioClient / new BrevoClient direct = anti-pattern
    if (/\bnew\s+(Twilio|BrevoClient|Plivo|Vonage)\s*\(/.test(code)) {
      violations.push({
        rule: 'provider-isolation-check',
        file: f,
        line: 0,
        message: `adapter must NOT auto-instantiate provider client (use opts.client injection)`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}
