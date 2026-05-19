# Architecture — `server/shared/` (Phase 1)

> Vue d'ensemble du socle invisible Phase 1 — 10 sous-modules, 356 tests, 0 fail, DORMANT.

## Carte du module

```
server/shared/
├── README.md
│
├── utils/        ← side-effect free helpers (deepFreeze, objectPath, safeJson)
├── errors/       ← AppError + 22 typed http classes + ERROR_CODES registry
├── logging/      ← logger + auditLogger + redaction (30+ keys, 7 token patterns)
├── auth/         ← context (4 levels) + tenantContext + sessionContext (deepFreeze)
├── middleware/   ← requestId + requestContext (ALS) + errorHandler + notFound
├── guards/       ← requireAuth + requireRole + requireTenant + requireFeature
├── db/           ← dbHandles + backup + migrate (WAL-safe, force guard Phase 1)
├── providers/    ← types + core + mocks + adapters (Twilio/Brevo WRAP-only)
│                   + registry + 3 routers (basic / failover / costLCR)
│
├── eslint/       ← 5 custom rules + standalone lint helpers
├── contracts/    ← 5 contracts (provider, billing, tenant, cdr, auth) validators
├── r9/           ← 3 R9 alignment scripts (shared / providers / runtime boundary)
├── e2e/          ← isolation-scan agrégateur dry-run
└── docs/         ← 6 docs cible Phase 1 closure
```

## Cardinalités

- 10 sous-modules livrables (utils + errors + logging + auth + middleware + guards + db + providers + eslint + contracts)
- 4 sous-modules outillage (r9 + e2e + docs + tests sous chaque module)
- 30+ fichiers JS code (Sprint 1) + 30+ JS code (Sprint 2) + 25 JS code (Sprint 3) + 13 JS code (Sprint 4)
- 9 fichiers tests (Sprint 1+2) + 6 tests Sprint 3 + 3 tests Sprint 4 = 18 fichiers tests
- **356 tests cumulés / 67 suites / 0 fail**

## Doctrine

- **WRAP > REPLACE** (toujours)
- **COEXIST > BIG BANG**
- **ISOLATE > MIX**
- **PROGRESSIVE > BRUTAL**
- **NE JAMAIS CASSER PLANORA LIVE**

## Invariants Phase 1 (NON NÉGOCIABLES)

| Invariant | Description | Vérifié par |
|---|---|---|
| **I1** | Aucun fichier legacy modifié | git diff vs clean-main |
| **I2** | Aucune route runtime montée | r9/runtime-boundary-check.js |
| **I3** | Bundle frontend MD5 identique | ops/r9-protect.sh check-bundle |
| **I4** | calendar360.db SHA-256 (writes runtime tolerés) | ops/r9-protect.sh check-db |
| **I5** | 0 import shared/ depuis runtime live | eslint/no-legacy-coupling.js |

## Surface publique consolidée (futurs imports Phase 4+)

```js
// Tout est importable via le module racine
import {
  // utils
  deepFreeze, get, has, set, safeStringify, safeParse,
  // errors
  AppError, BadRequest, Unauthenticated, Forbidden, NotFound, /* ... */,
  // logging
  createLogger, createAuditLogger, redact,
  // auth
  makeAuthContext, makeTenantContext, makeSessionContext, isAtLeast, isAuthenticated,
  // middleware
  requestIdMiddleware, requestContextMiddleware, errorHandlerMiddleware, notFoundMiddleware,
  // guards
  requireAuth, requireRole, requireTenant, requireFeature,
  // db
  openDb, getHandle, backupSqlite, MigrationRegistry, dryRun,
  // providers
  TwilioAdapter, BrevoAdapter, ProviderRegistry, FailoverRouter, CostRouter, CAPABILITIES,
} from '../shared/...';  // Phase 4+ via routes /api/app/*
```

Phase 1 = aucun import depuis le runtime live.

## Tests

```bash
# Tous les tests Phase 1
node --test server/shared/db/test/*.test.js server/shared/test/*.test.js server/shared/providers/test/*.test.js

# 356 tests / 67 suites / 0 fail
```

## Référence

- AUDIT-PHASE1-INVISIBLE-FOUNDATION-IMPLEMENTATION-PLAN-2026-05-18.md
- AUDIT-PHASE1-EXECUTION-SAFETY-DEPLOYMENT-GOVERNANCE-2026-05-18.md
- AUDIT-SAFE-FREEZE-BACKUP-GOVERNANCE-HARDENING-2026-05-18.md
- CLAUDE.md §0 + §10
