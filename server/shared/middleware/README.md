# `server/shared/middleware/` — Middlewares Express factories (DORMANT Sprint 2)

> **WRAP-only** : 4 factories standalone Express-compatibles.
> **Pas montés runtime Sprint 2**.

## Middlewares

| Fichier | Rôle |
|---|---|
| `requestId.js` | Propage ou génère `X-Request-Id` ; pose `req.requestId` |
| `requestContext.js` | AsyncLocalStorage : `runWithContext`, `getCurrentContext`, `getContextValue`, factory mw |
| `errorHandler.js` | Convertit toute erreur en AppError, log, répond JSON client-safe |
| `notFound.js` | 404 catch-all → émet NotFound via errorHandler |

## Pipeline prévu Phase 4+

```js
import {
  requestIdMiddleware,
  requestContextMiddleware,
  errorHandlerMiddleware,
  notFoundMiddleware,
} from '../shared/middleware/index.js';

const app = express();
app.use(requestIdMiddleware());                   // req.requestId set
app.use(requestContextMiddleware());              // ALS store binding
// ... routes /api/app/* ...
app.use(notFoundMiddleware());                    // 404 catch-all
app.use(errorHandlerMiddleware({ logger }));      // error response unifiée
```

## AsyncLocalStorage usage

Permet d'accéder au context depuis n'importe quelle fonction downstream sans propager param :

```js
import { getContextValue, runWithContext } from '../shared/middleware/index.js';

function dbQuery() {
  const requestId = getContextValue('requestId');
  log.info({ msg: 'querying', requestId });
}

runWithContext({ requestId: 'r1' }, () => {
  dbQuery();  // requestId disponible sans param
});
```

## Tests

`node --test server/shared/test/middleware.test.js` — 19 tests / 4 suites / 0 fail.
