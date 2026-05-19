# `server/shared/utils/` — Utils pures (DORMANT Sprint 2)

> **WRAP-only** : 3 modules d'utils pures, side-effect free.

## Modules

| Fichier | Rôle |
|---|---|
| `deepFreeze.js` | Récursif `Object.freeze` (cycles-safe) + `isDeeplyFrozen` |
| `objectPath.js` | `get(obj, "a.b.c", default)`, `has`, `set` (immutable update) |
| `safeJson.js` | `safeStringify` (cycles + BigInt + Error + Map/Set/Date), `safeParse` (fallback) |

## Garanties

- ✅ Aucune dépendance externe (built-ins Node uniquement)
- ✅ Aucun side effect global
- ✅ `set` retourne nouvelle racine — ne mutate PAS l'original
- ✅ `safeStringify` ne throw JAMAIS (string toujours retournée)
- ✅ `deepFreeze` survives cycles

## Usage

```js
import { deepFreeze, get, safeStringify } from '../shared/utils/index.js';

const cfg = deepFreeze({ db: { host: 'localhost' } });
cfg.db.host = 'evil';  // TypeError en strict mode (silent fail otherwise)

const port = get(cfg, 'db.port', 5432);  // → 5432 (default fallback)

const safe = safeStringify({ err: new Error('boom'), big: 9n });
// → '{"err":{"name":"Error","message":"boom","stack":"..."},"big":"9"}'
```

## Tests

`node --test server/shared/test/utils.test.js` — 22 tests / 3 suites / 0 fail.
