# `server/shared/db/schema/` — Manifests de schéma DB

> **Phase 1** : dossier structurellement créé mais **vide**.
> Aucun schéma défini Sprint 1 — usage prévu Sprint 2+ et Phase 2+.

## Rôle

Contiendra à terme les définitions de schéma DB par scope :

```
schema/
├── README.md         (ce fichier)
├── supra/            (futur) — schéma SUPRA DB control tower
│   ├── 001-bootstrap.sql
│   ├── 002-supros.sql
│   └── ...
├── client/           (futur) — schéma CLIENT DB par tenant
│   ├── 001-bootstrap.sql
│   ├── 002-users.sql
│   └── ...
└── app/              (futur) — schéma legacy mapping (Phase 4+ BRIDGE)
```

## Format prévu

Chaque migration = fichier SQL pur + entrée dans `MigrationRegistry`.

```js
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MigrationRegistry } from '../index.js';

const SCHEMA_DIR = new URL('./supra/', import.meta.url).pathname;

const supraRegistry = new MigrationRegistry();
supraRegistry.add({
  id: '001-bootstrap',
  description: 'SUPRA DB initial tables',
  up: (db) => {
    const sql = readFileSync(path.join(SCHEMA_DIR, '001-bootstrap.sql'), 'utf8');
    db.exec(sql);
  },
});
```

## Convention naming

- Préfixe numérique 3 chiffres (`001-`, `002-`, etc.)
- Slug descriptif court (`-bootstrap`, `-add-tenants`, etc.)
- Extension `.sql` ou `.mjs` (selon complexité)

## Règle d'or

- **Migrations immutables** : une fois mergée, une migration ne se modifie pas
- **Rollback via nouvelle migration** : pas d'edit historique
- **Idempotence** : `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN` avec guard

## Référence

- `../migrate.js` — registry + apply
- Audit 12 §2.1 — Sprint 1 livrables
- CLAUDE.md §0 — règle 1 client = 1 DB dédiée (cible Piste 3)
