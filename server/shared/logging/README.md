# `server/shared/logging/` — Logging structuré + redaction (DORMANT Sprint 2)

> **WRAP-only** : pas de transport externe (pas de Datadog, Sentry, etc. Sprint 2).
> Sink par défaut : `console.log` / `console.error` (capturable en test).

## Modules

| Fichier | Rôle |
|---|---|
| `redaction.js` | Masque `password`, `token`, `Authorization`, etc. + détecte tokens connus (Twilio SID, JWT, etc.) |
| `logger.js` | `createLogger({ level, bindings, write, sensitiveKeys })` — JSON structuré, child bindings, redaction auto |
| `auditLogger.js` | `createAuditLogger({ source, write })` — événements audit structurés (action, actor, target, outcome) |
| `index.js` | Public API re-exports |

## Garanties redaction

Clés masquées par défaut (case-insensitive partial match) :
- Auth : `password`, `passwd`, `secret`, `token`, `access_token`, `refresh_token`, `authorization`, `auth`, `cookie`, `session`, `jwt`, `bearer`, `apikey`, `api_key`, `apisecret`
- Provider secrets : `twilioauthtoken`, `googleclientsecret`, `microsoftclientsecret`, `resendapikey`, `openaiapikey`, etc.
- Crypto : `privatekey`, `salt`, `hash`
- PII : `creditcard`, `cardnumber`, `cvv`, `ssn`, `tax_id`

Patterns valeurs masquées :
- Twilio SID `ACxxx...`, `SKxxx...`
- Stripe `sk_live_...`, `sk_test_...`
- Google API key `AIza...`
- GitHub PAT `ghp_...`
- Slack token `xoxb-...`, `xoxp-...`
- JWT `eyJ...`
- Headers `Authorization: Bearer xxx` / `Authorization: Basic xxx`

## Usage

```js
import { createLogger, createAuditLogger } from '../shared/logging/index.js';

// App logger
const log = createLogger({
  level: 'info',
  bindings: { app: 'planora', module: 'shared/db' },
});
log.info({ msg: 'handle opened', scope: 'client', key: 'c1' });

// Child logger (hérite bindings + extra)
const reqLog = log.child({ requestId: 'r1' });
reqLog.warn({ msg: 'slow query', durationMs: 1234 });

// Audit logger (séparé pour pipeline forensic)
const audit = createAuditLogger();
audit.log({
  action: 'user.login',
  actorType: 'user',
  actorId: 'u-julie',
  tenantId: 'c1776169036725',
  outcome: 'success',
  correlationId: 'r1',
});
```

## Tests

`node --test server/shared/test/logging.test.js` — 21 tests / 3 suites / 0 fail.
