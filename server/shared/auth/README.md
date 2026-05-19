# `server/shared/auth/` — Auth contexts (DORMANT Sprint 2)

> **WRAP-only** : 3 modules de contextes immutables.
> **Pas d'auth active runtime** Sprint 2 — uniquement structure + helpers.

## Modules

| Fichier | Rôle |
|---|---|
| `context.js` | AuthContext (4 niveaux SUPRA/SUPRO/CLIENT/USER + anonymous) |
| `tenantContext.js` | TenantContext (PLATFORM/SUPRO/CLIENT scope) |
| `sessionContext.js` | SessionContext (cookie/JWT/api_key/provider/anonymous) |
| `index.js` | Public API re-exports |

## Hiérarchie niveaux (LEVEL_RANK_MAP)

```
anonymous  →   0
user       →  10
client     →  20
supro      →  30
supra      →  40
```

`isAtLeast(ctx, 'client')` : true si ctx.level ∈ {client, supro, supra}.

## Garanties

- ✅ Tous les contextes sont `deepFreeze` (impossible à muter).
- ✅ Factories valident strictement les inputs (TypeError si invalide).
- ✅ Aucun import legacy. Aucune dépendance npm runtime.

## Usage prévu Phase 2+ (BRIDGE)

```js
import { makeAuthContext, isAuthenticated } from '../shared/auth/index.js';

const ctx = makeAuthContext({
  level: 'user',
  userId: 'u-julie',
  clientId: 'c1776169036725',
  suproId: 's-planora-default',
  role: 'admin',
  permissions: ['contacts:read', 'contacts:write'],
});

if (!isAuthenticated(ctx)) throw new Unauthenticated();
```

## Tests

`node --test server/shared/test/auth.test.js` — 24 tests / 3 suites / 0 fail.
