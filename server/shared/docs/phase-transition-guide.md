# Phase Transition Guide — Phase 1 → Phase 2+

> Comment passer de Phase 1 (invisible/dormant) à Phase 2+ (BRIDGE actif).

## État Phase 1 (LIVRÉE)

```
Branche : feature/phase1-invisible-foundation
HEAD    : à figer au tag phase1-closure-YYYYMMDD
Tests   : 356 / 67 suites / 0 fail
Modules : 10 sous-modules shared/ (utils, errors, logging, auth, middleware,
          guards, db, providers, eslint, contracts) + 3 outillage (r9, e2e, docs)

Invariants respectés :
- I1 aucun fichier legacy modifié
- I2 aucune route runtime montée
- I3 bundle MD5 inchangé
- I4 DB SHA writes runtime légitimes seulement
- I5 0 import shared/ depuis runtime live
```

## Pré-requis avant transition Phase 2

### 1. MH valide Phase 1 complète
- Lecture HANDOFF-PHASE1-CLOSURE-YYYY-MM-DD.md
- Vérification CLAUDE.md §11 mis à jour
- Décision : merger `feature/phase1-invisible-foundation` → `clean-main` ou laisser isolée

### 2. Décisions Phase 2 à trancher
- Quel SUPRO par défaut au démarrage Phase 2 ? (PLANORA-default ?)
- Workflow SUPRA crée SUPRO : UI custom ou API REST ?
- Rename `companies` → `clients` immédiat ou différé Phase 3 ?
- Rename `collaborators` → `users` immédiat ou différé ?

### 3. Hardening continu
- R9-PROTECT phase1 doit rester vert tout au long de Phase 2
- Backups baseline pre-Phase2 (triple-redondance)
- Tag `phase2-sprint-0-closure` quand Phase 2 démarre

## Pattern de transition WRAP → BRIDGE

Phase 1 = WRAP (shared/ existe, dormant)
Phase 2 = COEXIST (shared/ peut être appelé par scripts admin séparés, pas par routes legacy)
Phase 4 = BRIDGE (nouvelles routes `/api/app/*` parallèles montent shared/)
Phase 7+ = MIGRATE (routes legacy peuvent être progressivement supprimées)

### Étape 4.1 — Créer routes /api/app/* parallèles (Phase 4)

```js
// server/routes/_app.js — NOUVEAU fichier (pas legacy modifié)
import express from 'express';
import {
  requestIdMiddleware, requestContextMiddleware,
  errorHandlerMiddleware, notFoundMiddleware,
} from '../shared/middleware/index.js';
import { requireAuth, requireRole, requireTenant } from '../shared/guards/index.js';
import { createLogger } from '../shared/logging/index.js';

const appRouter = express.Router();
appRouter.use(requestIdMiddleware());
appRouter.use(requestContextMiddleware());
// ... routes /api/app/users, /api/app/billing, etc.
appRouter.use(notFoundMiddleware());
appRouter.use(errorHandlerMiddleware({ logger: createLogger() }));

export default appRouter;
```

### Étape 4.2 — Monter dans server/index.js

```js
// server/index.js (LIGNE AJOUTÉE Phase 4 — invariant I2 enfin levé)
import appRouter from './routes/_app.js';
app.use('/api/app', appRouter);

// Toutes les routes legacy `/api/*` restent intactes (coexistence)
```

### Étape 4.3 — Routes legacy intactes
Aucune modification de `/api/bookings`, `/api/contacts`, `/api/voip/*`, etc.
Les routes legacy continuent de fonctionner identiquement.

### Étape 4.4 — Feature flag par CLIENT
```js
// tenantCtx.features = { use_app_api: true } → frontend route vers /api/app/*
// tenantCtx.features = { use_app_api: false } → frontend route vers /api/* (legacy)
```

## Quality gates à conserver Phase 2+

| Check | Conservé Phase 2+ ? |
|---|---|
| `eslint/no-runtime-imports.js` | OUI (shared/ ne doit pas importer routes/services) |
| `eslint/no-legacy-coupling.js` | NON Phase 4+ (routes/ peut importer shared/) |
| `eslint/no-direct-provider-sdk.js` | OUI (SDKs toujours injectés) |
| `eslint/no-shared-runtime-mount.js` | NON Phase 4+ (mount explicite autorisé) |
| `eslint/tenant-boundary-rules.js` | OUI (jamais de path/secret hardcoded) |

## Rollback Phase 2 → Phase 1

Si Phase 2 cause incident :
1. Revert `server/index.js` (ligne `app.use('/api/app', appRouter)`)
2. Tag `phase2-rollback-YYYYMMDD-NNN`
3. Branche `feature/phase1-invisible-foundation` reste valide pour re-tenter

`shared/` reste en place — aucun code n'est supprimé, juste démonté du runtime.

## Plan Phase 2+ documenté

- **Phase 2** (M2) : SUPRA crée SUPRO (UI Supra MVP + Control Tower minimal)
- **Phase 3** (M3-M4) : SUPRO crée CLIENT + DB dédiée par CLIENT (cf. CLAUDE.md §0)
- **Phase 4** (M4-M5) : CLIENT crée USER + crédits manuels + routes /api/app/* (BRIDGE)
- **Phase 5** (M7-M9) : Stripe billing + invoices recurring
- **Phase 6** (M6-M10) : FusionPBX pilote + multi-provider
- **Phase 7+** (M11+) : Kamailio + scale réel

## Référence

- AUDIT-PHASE1-EXECUTION-SAFETY-DEPLOYMENT-GOVERNANCE-2026-05-18.md §12 (stratégie SAFE)
- AUDIT-PHASE1-INVISIBLE-FOUNDATION-IMPLEMENTATION-PLAN-2026-05-18.md §3 (sprint plan)
- Audit 11 — Control Tower SUPRA Platform
- CLAUDE.md §0 (1 client = 1 DB) + §10 (Option A actuelle)
