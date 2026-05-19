# `server/shared/` — Phase 1 socle invisible

> **WRAP-only** : code Phase 1 vit ici, **jamais monté** dans le runtime legacy.
> **DORMANT** : aucun import depuis `server/routes/`, `server/services/`, `server/cron/`, etc.
> Activation prévue Phase 4+ via routes parallèles `/api/app/*` (BRIDGE doctrine).

## Position dans l'architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  RUNTIME LEGACY (LIVE — INTOUCHABLE PHASE 1)                    │
│  ────────────────────────────────────────                        │
│  server/index.js                                                 │
│  ├─ server/routes/*       (56 fichiers, monté Express)           │
│  ├─ server/services/*     (services métier)                      │
│  ├─ server/middleware/*   (auth, tenant, etc.)                   │
│  ├─ server/cron/*         (GCal sync, recycle lost, etc.)        │
│  ├─ server/helpers/*                                             │
│  └─ server/db/database.js (source de vérité Option A)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

                            ║
                            ║  (aucun import bidirectionnel
                            ║   Phase 1 — strict isolation)
                            ║

┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1 SOCLE INVISIBLE (DORMANT)                              │
│  ────────────────────────────────                               │
│  server/shared/                                                  │
│  ├─ db/                ← Sprint 1 (LIVRÉ)                        │
│  │  └─ dbHandles + backup + migrate + 40 tests                   │
│  │                                                               │
│  ├─ auth/              ← Sprint 2 (LIVRÉ)                        │
│  │  └─ context + tenantContext + sessionContext (4 niveaux)      │
│  │                                                               │
│  ├─ guards/            ← Sprint 2 (LIVRÉ)                        │
│  │  └─ requireAuth + requireRole + requireTenant + requireFeature│
│  │                                                               │
│  ├─ middleware/        ← Sprint 2 (LIVRÉ)                        │
│  │  └─ requestId + requestContext (ALS) + errorHandler + 404     │
│  │                                                               │
│  ├─ errors/            ← Sprint 2 (LIVRÉ)                        │
│  │  └─ AppError + 22 sous-classes typées + ERROR_CODES registry  │
│  │                                                               │
│  ├─ logging/           ← Sprint 2 (LIVRÉ)                        │
│  │  └─ logger + auditLogger + redaction (secrets auto-masked)    │
│  │                                                               │
│  ├─ utils/             ← Sprint 2 (LIVRÉ)                        │
│  │  └─ deepFreeze + objectPath + safeJson                        │
│  │                                                               │
│  ├─ providers/         ← Sprint 3 (LIVRÉ)                        │
│  │  └─ types + core + mocks + adapters + registry + router       │
│  │     (Twilio+Brevo WRAP-only, LCR, Failover, hiérarchie tenant)│
│  │                                                               │
│  ├─ eslint/            ← Sprint 4 (LIVRÉ)                        │
│  │  └─ 5 custom rules quality gates anti-régression architecture │
│  │                                                               │
│  ├─ contracts/         ← Sprint 4 (LIVRÉ)                        │
│  │  └─ 5 contracts validators (provider/billing/tenant/cdr/auth) │
│  │                                                               │
│  ├─ r9/                ← Sprint 4 (LIVRÉ)                        │
│  │  └─ 3 R9 alignment scripts (shared/providers/runtime boundary)│
│  │                                                               │
│  ├─ e2e/               ← Sprint 4 (LIVRÉ)                        │
│  │  └─ isolation-scan agrégateur dry-run                         │
│  │                                                               │
│  ├─ docs/              ← Sprint 4 (LIVRÉ)                        │
│  │  └─ 6 docs (architecture, provider, tenant, billing,          │
│  │     opensource-roadmap, phase-transition-guide)               │
│  │                                                               │
│  └─ config/            ← optionnel, à la demande                 │
└─────────────────────────────────────────────────────────────────┘
```

## Règles d'isolation absolues

| Règle | Vérification |
|---|---|
| `shared/` n'importe **rien** de `routes/`, `services/`, `cron/`, `middleware/`, `helpers/` | `grep -rEn "from '\\.\\./\\.\\./(routes\\|services\\|cron\\|middleware\\|helpers)/" server/shared/` |
| Aucun fichier hors `shared/` n'importe quelque chose de `shared/` | `grep -rEn "from '\\.\\./shared/" server/routes/ server/services/ server/cron/ server/middleware/ server/helpers/` |
| `server/index.js` ne monte rien depuis `shared/` | `grep -nE "from ['\"]\\./shared/" server/index.js` |
| Aucun chemin DB par défaut hardcodé dans `shared/` | Caller fournit toujours le path |

Vérifications automatisées via `ops/r9-protect.sh check-routes` et `check-invariants`.

## Tests

```bash
# Tous les tests Phase 1 shared/ (Sprint 1 db/ + Sprint 2 core)
node --test server/shared/db/test/*.test.js server/shared/test/*.test.js

# État actuel : 356 tests / 67 suites / 0 fail
# - Sprint 1 (db/)        : 40 tests
# - Sprint 2 (core)       : 124 tests
# - Sprint 3 (providers/) : 111 tests
# - Sprint 4 (quality)    : 81 tests
```

Aucune dépendance npm ajoutée — utilise `node:test` + `node:assert/strict` (built-ins Node 18+).

## Référence

- Audit 12 — PLAN Phase 1 day-by-day
- Audit 13 — GOUVERNANCE exécution (5 CHECKPOINTS)
- Audit 14 — HARDENING (R9-PROTECT phase1, hooks Git, backups auto)
- docs/RUNBOOKS/ — runbooks opérationnels
- docs/PHASE1-BASELINE.md — fingerprints runtime IMMUTABLES
- docs/STOP-CONDITIONS.md / GO-CONDITIONS.md
- CLAUDE.md §0 + §10 — règles isolation DB
