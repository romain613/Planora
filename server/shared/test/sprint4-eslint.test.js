// server/shared/test/sprint4-eslint.test.js
// Tests ESLint custom rules — vérifie détection violations sur snippets fabriqués.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  lintNoRuntimeImports,
  lintNoLegacyCoupling,
  lintNoDirectProviderSdk,
  lintNoSharedRuntimeMount,
  lintTenantBoundaryRules,
  RULES,
  RULE_NAMES,
} from '../eslint/index.js';

describe('eslint/no-runtime-imports', () => {
  test('détecte import depuis ../routes/', () => {
    const code = `import { x } from '../../routes/bookings.js';`;
    const filePath = '/proj/server/shared/db/test.js';
    const violations = lintNoRuntimeImports(filePath, code);
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /routes/);
  });

  test('détecte import depuis ../services/', () => {
    const code = `import { y } from '../../services/voip.js';`;
    const filePath = '/proj/server/shared/auth/test.js';
    const violations = lintNoRuntimeImports(filePath, code);
    assert.equal(violations.length, 1);
  });

  test('détecte server/db/database.js', () => {
    const code = `import { db } from '../../db/database.js';`;
    const filePath = '/proj/server/shared/db/foo.js';
    const violations = lintNoRuntimeImports(filePath, code);
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /database\.js/);
  });

  test('accepte intra-shared imports', () => {
    const code = `import { x } from '../utils/index.js';`;
    const filePath = '/proj/server/shared/auth/context.js';
    const violations = lintNoRuntimeImports(filePath, code);
    assert.equal(violations.length, 0);
  });

  test('accepte imports node: built-in', () => {
    const code = `import { randomUUID } from 'node:crypto';`;
    const filePath = '/proj/server/shared/db/x.js';
    const violations = lintNoRuntimeImports(filePath, code);
    assert.equal(violations.length, 0);
  });

  test('skip fichiers hors server/shared/', () => {
    const code = `import { x } from '../routes/bookings.js';`;
    const filePath = '/proj/server/services/some.js';
    const violations = lintNoRuntimeImports(filePath, code);
    assert.equal(violations.length, 0);
  });
});

describe('eslint/no-legacy-coupling', () => {
  test('détecte legacy → shared/', () => {
    const code = `import { foo } from '../shared/utils/index.js';`;
    const filePath = '/proj/server/routes/bookings.js';
    const violations = lintNoLegacyCoupling(filePath, code);
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /Phase 1 invariant I5/);
  });

  test('accepte legacy → legacy imports', () => {
    const code = `import { foo } from '../services/voip.js';`;
    const filePath = '/proj/server/routes/x.js';
    const violations = lintNoLegacyCoupling(filePath, code);
    assert.equal(violations.length, 0);
  });

  test('skip si fichier hors legacy', () => {
    const code = `import { foo } from '../shared/utils/index.js';`;
    const filePath = '/proj/server/shared/db/x.js';
    const violations = lintNoLegacyCoupling(filePath, code);
    assert.equal(violations.length, 0);
  });

  test('check les 5 dossiers legacy connus', () => {
    const code = `import { x } from '../../shared/utils/index.js';`;
    for (const dir of ['routes', 'services', 'cron', 'helpers', 'middleware']) {
      const filePath = `/proj/server/${dir}/sub/x.js`;
      const violations = lintNoLegacyCoupling(filePath, code);
      assert.equal(violations.length, 1, `should detect for ${dir}`);
    }
  });
});

describe('eslint/no-direct-provider-sdk', () => {
  test('détecte import twilio direct', () => {
    const code = `import twilio from 'twilio';`;
    const filePath = '/proj/server/shared/providers/adapters/TwilioAdapter.js';
    const violations = lintNoDirectProviderSdk(filePath, code);
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /injected by caller/);
  });

  test('détecte import @getbrevo/brevo', () => {
    const code = `import { TransactionalEmailsApi } from '@getbrevo/brevo';`;
    const filePath = '/proj/server/shared/providers/adapters/BrevoAdapter.js';
    const violations = lintNoDirectProviderSdk(filePath, code);
    assert.equal(violations.length, 1);
  });

  test('accepte imports relatifs', () => {
    const code = `import { x } from '../core/BaseProvider.js';`;
    const filePath = '/proj/server/shared/providers/adapters/X.js';
    const violations = lintNoDirectProviderSdk(filePath, code);
    assert.equal(violations.length, 0);
  });

  test('accepte node: built-in', () => {
    const code = `import { randomUUID } from 'node:crypto';`;
    const filePath = '/proj/server/shared/providers/mocks/X.js';
    const violations = lintNoDirectProviderSdk(filePath, code);
    assert.equal(violations.length, 0);
  });

  test('skip fichiers hors providers/', () => {
    const code = `import twilio from 'twilio';`;
    const filePath = '/proj/server/shared/utils/x.js';
    const violations = lintNoDirectProviderSdk(filePath, code);
    assert.equal(violations.length, 0);
  });

  test('détecte require() aussi', () => {
    const code = `const twilio = require('twilio');`;
    const filePath = '/proj/server/shared/providers/adapters/x.js';
    const violations = lintNoDirectProviderSdk(filePath, code);
    assert.equal(violations.length, 1);
  });
});

describe('eslint/no-shared-runtime-mount', () => {
  test('détecte import shared/ dans server/index.js', () => {
    const code = `import { runtimeContext } from './shared/middleware/requestContext.js';`;
    const filePath = '/proj/server/index.js';
    const violations = lintNoSharedRuntimeMount(filePath, code);
    assert.ok(violations.length >= 1);
  });

  test('détecte app.use avec path shared', () => {
    const code = `app.use('/api/shared/health', handler);`;
    const filePath = '/proj/server/index.js';
    const violations = lintNoSharedRuntimeMount(filePath, code);
    assert.ok(violations.length >= 1);
  });

  test('skip si fichier pas entry-point', () => {
    const code = `import x from './shared/foo.js'; app.use('/shared', h);`;
    const filePath = '/proj/server/routes/some.js';
    const violations = lintNoSharedRuntimeMount(filePath, code);
    assert.equal(violations.length, 0);
  });

  test('accepte entry-point sans import shared/', () => {
    const code = `import express from 'express'; const app = express(); app.listen(3001);`;
    const filePath = '/proj/server/index.js';
    const violations = lintNoSharedRuntimeMount(filePath, code);
    assert.equal(violations.length, 0);
  });
});

describe('eslint/tenant-boundary-rules', () => {
  test('détecte hardcoded prod DB path', () => {
    const code = `const db = openDb('/var/www/planora-data/calendar360.db');`;
    const filePath = '/proj/server/shared/db/x.js';
    const violations = lintTenantBoundaryRules(filePath, code);
    assert.ok(violations.length >= 1);
    assert.match(violations[0].message, /hardcoded production DB/);
  });

  test('ignore commentaire mentionnant DB path', () => {
    const code = `// Exemple : "/var/www/planora-data/calendar360.db"`;
    const filePath = '/proj/server/shared/db/x.js';
    const violations = lintTenantBoundaryRules(filePath, code);
    assert.equal(violations.length, 0);
  });

  test('détecte secret Twilio SID hardcoded', () => {
    // Pattern construit à la volée pour éviter scan secrets sur le fichier source.
    // GitHub Secret Scanning refuse les patterns Twilio AC + 32 hex chars en clair.
    const fakeSid = 'A' + 'C' + '0123456789abcdef0123456789abcdef';
    const code = `const sid = "${fakeSid}";`;
    const filePath = '/proj/server/shared/x.js';
    const violations = lintTenantBoundaryRules(filePath, code);
    assert.ok(violations.length >= 1);
    assert.match(violations[0].message, /hardcoded secret/);
  });

  test('skip fichiers .md (READMEs)', () => {
    const code = `Exemple : '/var/www/planora-data/calendar360.db'`;
    const filePath = '/proj/server/shared/README.md';
    const violations = lintTenantBoundaryRules(filePath, code);
    assert.equal(violations.length, 0);
  });

  test('skip fichiers hors shared/', () => {
    const code = `const db = '/var/www/planora-data/x.db';`;
    const filePath = '/proj/server/services/x.js';
    const violations = lintTenantBoundaryRules(filePath, code);
    assert.equal(violations.length, 0);
  });
});

describe('eslint/index — RULES + RULE_NAMES', () => {
  test('exporte 5 règles avec lint + lintAll', () => {
    assert.equal(RULE_NAMES.length, 5);
    for (const name of RULE_NAMES) {
      assert.ok(typeof RULES[name].lint === 'function', `${name} lint`);
      assert.ok(typeof RULES[name].lintAll === 'function', `${name} lintAll`);
    }
  });

  test('RULES + RULE_NAMES gelés', () => {
    assert.equal(Object.isFrozen(RULES), true);
    assert.equal(Object.isFrozen(RULE_NAMES), true);
  });
});
