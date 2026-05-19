# `server/shared/db/` — Phase 1 Sprint 1

> **DORMANT** : ce module n'est importé **nulle part** dans le runtime legacy.
> **WRAP-only** : aucune opération sur DBs prod en Phase 1.
> Tests `node --test server/shared/db/test/*.test.js` — zéro dépendance ajoutée.

## Position

Fondation DB pour la future architecture multi-tenant SUPRA/SUPRO/CLIENT/USER.
Pas activé en runtime tant que Phase 4+ BRIDGE n'est pas démarré.

## Surface publique (via `index.js`)

### dbHandles
- `openDb(path, opts?)` — ouvre une DB SQLite avec PRAGMAs WAL-safe par défaut
- `getHandle(scope, key, path?, opts?)` — récupère ou ouvre paresseusement un handle géré
- `hasHandle(scope, key)` — boolean, présent dans le registry ou non
- `listHandles()` — métadonnées des handles ouverts (pas l'instance Database)
- `closeHandle(scope, key)` — ferme un handle spécifique
- `closeAll()` — ferme tout (idempotent), retourne le compteur
- `getDefaultPragmas()` — snapshot immuable des PRAGMAs

### backup
- `backupSqlite(srcPath, destPath, opts?)` — backup atomique online (better-sqlite3 native API)
- `sha256File(filePath)` — SHA-256 streaming d'un fichier
- `integrityCheck(dbPath)` — `PRAGMA integrity_check`
- `foreignKeyCheck(dbPath)` — `PRAGMA foreign_key_check`
- `verifyBackup(dbPath)` — combo intégrité + FK + SHA + size

### migrate
- `MigrationRegistry` — classe, méthodes `.add()`, `.list()`, `.size()`, `.get(id)`
- `ensureMigrationsTable(db)` — crée `_phase1_migrations` (idempotent)
- `appliedIds(db)` — Set des ids appliqués
- `dryRun(db, registry)` — inspect pending vs applied, **sans** exécuter `up()`
- `applyMigrations(db, registry, { force: true })` — exécute pending. **`force: true` requis Phase 1.**
- `MIGRATIONS_TABLE_NAME` — constante `'_phase1_migrations'`

## Invariants Phase 1

| Invariant | Implémentation |
|---|---|
| **I1** Aucun fichier legacy modifié | Module isolé, n'importe rien de `../routes/`, `../services/`, etc. |
| **I2** Aucune route runtime montée | `server/index.js` n'importe rien de `shared/` |
| **I3** Bundle frontend inchangé | Module backend pur |
| **I4** `calendar360.db` intacte | Helpers ne touchent QUE des paths fournis par caller |

## WAL-safe — Garanties

PRAGMAs par défaut (cf. `getDefaultPragmas()`) :

| PRAGMA | Valeur | Raison |
|---|---|---|
| `journal_mode` | `WAL` | Concurrence reads/writes |
| `synchronous` | `NORMAL` | Compromis perf/durabilité (WAL + NORMAL = safe) |
| `foreign_keys` | `ON` | FK enforced |
| `busy_timeout` | 5000 ms | Évite SQLITE_BUSY transitoires |
| `temp_store` | `MEMORY` | Perf |

Note : `:memory:` databases ne supportent pas WAL (better-sqlite3 fallback memory journal).

## Pattern d'usage prévu Phase 2+

```js
import { getHandle, backupSqlite, MigrationRegistry, dryRun, applyMigrations } from '../shared/db/index.js';

// 1. Open managed handle
const db = getHandle('client', 'c1776169036725', '/var/www/planora-data/clients/c1776169036725.db');

// 2. Register migrations
const reg = new MigrationRegistry();
reg.add({
  id: '001-bootstrap-tenants',
  description: 'Create tenants table',
  up: (d) => d.exec('CREATE TABLE tenants (...)'),
});

// 3. Inspect (Phase 1 OK)
const { pending } = dryRun(db, reg);
console.log('Pending:', pending);

// 4. Apply (Phase 2+ uniquement)
// applyMigrations(db, reg, { force: true });

// 5. Backup avant action critique
const result = await backupSqlite(
  '/var/www/planora-data/clients/c1776169036725.db',
  '/var/backups/planora/client-c1776169036725-pre-migrate.db'
);
console.log('Backup:', result.destSize, 'bytes in', result.durationMs, 'ms');
```

## Anti-patterns à éviter

| Anti-pattern | Pourquoi | Alternative |
|---|---|---|
| Import `../db/database.js` legacy | Violerait I1 (couplage shared ↔ legacy) | Caller fournit le path à `openDb` |
| Chemin par défaut hardcodé | Risque I4 si mauvais path | Toujours explicite côté caller |
| `applyMigrations` sans `force: true` | Phase 1 = dry-run uniquement | `dryRun()` ou attendre Phase 2+ |
| Mount dans `server/index.js` | Violerait I2 | Phase 4+ BRIDGE via `/api/app/*` parallèles |
| Tests sur DB prod | Violerait I4 | Toujours `:memory:` ou `os.tmpdir()` |
| `cp` au lieu de `backupSqlite` | Incohérent si WAL non flushé | `backupSqlite()` natif atomique |
| Hardcode SHA-256 attendu sans génération | Maintenance impossible | Tests calculent dynamiquement |

## Tests

```bash
# Depuis /Users/design/Desktop/PLANORA
node --test server/shared/db/test/*.test.js
```

État Sprint 1 : **40 tests / 13 suites / 0 fail**.

Couvre :
- `openDb` : `:memory:` + file + readonly + WAL + PRAGMAs + erreurs input
- `getHandle` : lazy + scope isolation + key isolation + listHandles + closeHandle + closeAll
- `backupSqlite` : sample DB backup + restore verify + dest dir creation + erreurs input
- `sha256File` : deterministic + content sensitivity
- `integrityCheck` + `foreignKeyCheck` : healthy DB
- `verifyBackup` : end-to-end DR drill helper
- `MigrationRegistry` : add validation + dedupe + list/get/size
- `dryRun` : pending detection + no side effect
- `applyMigrations` : force guard + idempotence + transactional rollback + onApplied hook + order

## Roadmap future

- **Sprint 2** : `shared/auth/` + `shared/middleware/` + `shared/errors/` + `shared/logging/`
- **Sprint 3** : `shared/providers/` (interface + registry + router + adapters)
- **Sprint 4** : ESLint custom rules anti-monolithe + README global shared/
- **Phase 4+** : montage via routes `/api/app/*` parallèles (BRIDGE doctrine)
- **Phase 6+** : adoption par CLIENT DBs dédiées (Piste 3 — cf. CLAUDE.md §0)

## Référence

- Audit 12 §2.1 — Sprint 1 livrables
- Audit 13 §1.4 CHECKPOINT-1 — critères GO
- Audit 14 §6 — Runtime freeze
- CLAUDE.md §0 + §10 — règles isolation DB
