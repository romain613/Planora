# Tenant Hierarchy — SUPRA → SUPRO → CLIENT → USER

> Hiérarchie multi-tenant officielle PLANORA Phase 2+ (préparée Sprint 2-3, dormante Phase 1).

## 4 niveaux

```
SUPRA   (root plateforme = MH + équipe PLANORA)
   └─ SUPRO   (opérateur télécom white-label)
         └─ CLIENT   (entreprise cliente d'un SUPRO)
                └─ USER   (collaborateur d'un CLIENT)
```

## Mapping legacy → cible

| Concept legacy | Cible Phase 2+ |
|---|---|
| MH (root admin) | SUPRA |
| (n'existe pas) | SUPRO (à créer Phase 2-3) |
| `companies` table | `clients` table (rename Phase 3) |
| `collaborators` table | `users` table (rename Phase 3) |

Cf. CLAUDE.md §10.5 — 6 companies legacy actuelles deviendront 6 CLIENTs sous 1 SUPRO PLANORA-default Phase 2.

## Auth context (server/shared/auth/)

```js
import { makeAuthContext, LEVELS } from '../shared/auth/index.js';

const ctx = makeAuthContext({
  level: LEVELS.USER,        // anonymous | user | client | supro | supra
  userId: 'u-julie',
  clientId: 'c1776169036725',
  suproId: 's-planora-default',
  role: 'admin',             // owner | admin | user | viewer
  permissions: ['contacts:read', 'contacts:write'],
  features: ['beta'],
  sessionId: 'sess-xxx',
  correlationId: 'req-yyy',
});
// → ctx is deeplyFrozen, garantie immutable
```

## Tenant context (cf. server/shared/auth/tenantContext.js)

```js
import { makeTenantContext, TENANT_SCOPES } from '../shared/auth/index.js';

// CLIENT context (cas le plus fréquent)
const tCtx = makeTenantContext({
  scope: TENANT_SCOPES.CLIENT,
  suproId: 's-planora-default',
  clientId: 'c1776169036725',
  tenantName: 'CapFinances',
  tenantMode: 'legacy',                  // legacy | shadow | tenant (cf. CLAUDE.md §10)
  features: { beta: true, voip: true },
});

// PLATFORM (action SUPRA root)
const platCtx = makePlatformContext();
```

## Hiérarchie résolution providers (cf. providers/registry/providerResolver.js)

```
Si CLIENT-owned provider existe pour (suproId, clientId)
   → utilisé en priorité
Sinon si SUPRO-owned provider existe pour (suproId)
   → fallback SUPRO
Sinon PLATFORM-owned provider
   → fallback ultime
```

## Guards (cf. server/shared/guards/)

| Guard | Refuse si |
|---|---|
| `requireAuth()` | `!authCtx \|\| authCtx.level === anonymous` |
| `requireRole({ level: 'supro' })` | `authCtx.level < supro` (rank) |
| `requireRole({ roles: ['admin'] })` | `authCtx.role` non listé |
| `requireTenant({ scope: 'client' })` | `tenantCtx.scope !== 'client'` |
| `requireTenant({ clientId: 'c1' })` | `tenantCtx.clientId !== 'c1'` |
| `requireFeature('voip')` | `!authCtx.features.includes('voip') && !tenantCtx.features.voip` |

## Audit cross-tenant (impersonation SUPRA)

Cas légitime : SUPRA admin impersonne un CLIENT pour debug.
- `authCtx.level = 'supra'`
- `tenantCtx.scope = 'client'` + `clientId = 'c-target'`
- Audit log obligatoire (action='supra.impersonate', actorId=supraId, targetType='client', targetId=clientId)

Cf. `server/shared/logging/auditLogger.js` pour structure.

## Référence

- Audit 3 — Nomenclature SUPRA/SUPRO/CLIENT/USER + DB doctrine
- Audit 10 — SUPRO Operator Panel (12 pages SUPRO + 5 rôles + 40+ permissions)
- Audit 11 — Control Tower SUPRA Platform (17 pages SUPRA)
- CLAUDE.md §10 — État Option A actuel
