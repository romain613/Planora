# `server/shared/errors/` — Erreurs typées (DORMANT Sprint 2)

> **WRAP-only** : `AppError` + sous-classes typées + registry codes.

## Modules

| Fichier | Rôle |
|---|---|
| `errorCodes.js` | Registry SCREAMING_SNAKE_CASE → {code, status, safeMessage} |
| `AppError.js` | Base class : safeMessage, details, correlationId, timestamp, toClientJSON/toLogJSON |
| `httpErrors.js` | Sucre syntaxique : BadRequest, NotFound, Forbidden, etc. (22 classes) |

## Conventions

- **`code`** : SCREAMING_SNAKE_CASE stable (jamais renommé)
- **`safeMessage`** : sûr à exposer au client (jamais de secret/PII)
- **`details`** : opérateur uniquement (`toLogJSON()`), JAMAIS exposé client
- **`correlationId`** : pour cross-référence logs/audit

## Usage

```js
import { NotFound, AppError } from '../shared/errors/index.js';

throw new NotFound({
  safeMessage: 'Contact introuvable',
  details: { contactId: 'c-internal-id-do-not-leak' },
  correlationId: req.requestId,
});

// Conversion auto via errorHandler middleware
// → response client : { error: { code, message, status, correlationId, timestamp } }
// → log opérateur : { ...client + details + stack + cause }
```

## Wrap auto

```js
try { riskyOp(); }
catch (e) {
  throw AppError.wrap(e, 'DB_ERROR');  // si pas AppError, devient AppError typed
}
```

## Tests

`node --test server/shared/test/errors.test.js` — 16 tests / 3 suites / 0 fail.
