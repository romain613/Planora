# `server/shared/guards/` — Guards Express factories (DORMANT Sprint 2)

> **WRAP-only** : 4 factory guards Express-compatibles.
> **Pas montés runtime Sprint 2** — usage prévu Phase 4+ BRIDGE via routes `/api/app/*`.

## Guards

| Fichier | Rôle | Erreur émise |
|---|---|---|
| `requireAuth.js` | req.authCtx présent + authentifié | `Unauthenticated` (401) |
| `requireRole.js` | level minimum OU rôle dans liste | `RoleInsufficient` (403) |
| `requireTenant.js` | tenantCtx scope + IDs match | `TenantMismatch` (403) |
| `requireFeature.js` | feature flag actif (auth OR tenant) | `FeatureDisabled` (403) |

## Signature

Tous : factory `(opts) => mw(req, res, next)` Express standard. L'erreur est émise via `next(err)`.

## Usage prévu Phase 4+

```js
import { requireAuth, requireRole, requireTenant, requireFeature } from '../shared/guards/index.js';

app.get('/api/app/admin/users',
  requireAuth(),
  requireRole({ level: 'supro' }),
  requireTenant({ scope: 'supro' }),
  requireFeature('admin_panel'),
  (req, res) => { /* handler */ }
);
```

## Tests

`node --test server/shared/test/guards.test.js` — 22 tests / 4 suites / 0 fail.
