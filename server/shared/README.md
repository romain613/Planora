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
│  │  ├─ dbHandles.js    (multi-DB lazy, WAL-safe)                 │
│  │  ├─ backup.js       (atomic .backup, SHA, integrity)          │
│  │  ├─ migrate.js      (registry, dry-run, force guard)          │
│  │  ├─ schema/         (manifests, vide Sprint 1)                │
│  │  ├─ index.js        (public API)                              │
│  │  ├─ README.md                                                 │
│  │  └─ test/           (node:test, 40 tests / 0 fail)            │
│  │                                                               │
│  ├─ auth/              ← Sprint 2 (à venir)                      │
│  ├─ middleware/        ← Sprint 2                                │
│  ├─ errors/            ← Sprint 2                                │
│  ├─ logging/           ← Sprint 2                                │
│  ├─ providers/         ← Sprint 3                                │
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
# Tous les tests Phase 1 shared/
node --test server/shared/db/test/*.test.js

# État actuel : 40 tests / 13 suites / 0 fail
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
