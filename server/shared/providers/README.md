# `server/shared/providers/` — Provider Engine Foundation (DORMANT Sprint 3)

> **WRAP-only** : abstractions complètes, AUCUN provider live branché Sprint 3.
> **DORMANT** : aucun import depuis runtime legacy, aucune route montée.
> **Pas de dépendance** Twilio/Brevo npm dans ce module (clients injectés par caller).

## Structure

```
providers/
├── types/         (énumérations + factories Message/Call/CDR/PhoneNumber)
├── core/          (BaseProvider + BaseMessaging + BaseVoice + BaseNumber abstraits)
├── mocks/         (Mock + MockMessaging + MockVoice — 0 réseau)
├── adapters/      (TwilioAdapter + BrevoAdapter — clients injectés)
├── registry/      (ProviderRegistry + resolveProviders hiérarchique)
├── router/        (ProviderRouter + FailoverRouter + CostRouter LCR)
├── index.js       (re-exports publics)
└── test/          (5 fichiers, 111 tests, 0 fail)
```

## Capabilities supportées (CAPABILITIES)

| Domaine | Capabilities |
|---|---|
| SMS | `sms.outbound`, `sms.inbound`, `sms.dlr` |
| Voice | `voice.outbound`, `voice.inbound`, `voice.recording`, `voice.transcription`, `voice.transfer`, `voice.ivr` |
| Number | `number.provision`, `number.release`, `number.portability` |
| Email | `email.outbound`, `email.inbound` |
| SIP / WhatsApp | `sip.trunk`, `whatsapp` |

## Hiérarchie résolution provider (resolveProviders)

```
1. CLIENT-owned (suproId + clientId match)
2. SUPRO-owned (suproId match)
3. PLATFORM-owned (fallback partagé)
```

Intra-niveau : tri par `priority` (asc), puis `health` (healthy > degraded > unknown > down).

## Adapters disponibles

| Adapter | Client | Status Sprint 3 |
|---|---|---|
| TwilioAdapter | `client` injecté (jamais `require('twilio')` ici) | WRAP-only, mappage statuts + capabilities |
| BrevoAdapter | `client` injecté avec `sendEmail/sendSms/ping` | WRAP-only, defaults configurables |
| MockMessagingProvider | autonome, 0 réseau | Tests + dev local |
| MockVoiceProvider | autonome, 0 réseau | Tests + dev local |
| MockProvider | générique | Tests registry/router |

## Routers

| Router | Stratégie |
|---|---|
| `ProviderRouter.select()` | 1er candidat trié (priority + health) |
| `FailoverRouter.execute()` | Cascade : tente N providers jusqu'à succès (maxAttempts configurable, onAttemptFailed hook) |
| `CostRouter.selectCheapest()` | LCR basique : min cost selon `costProfile` |

## Usage prévu Phase 4+ BRIDGE

```js
import {
  TwilioAdapter, BrevoAdapter,
  ProviderRegistry, FailoverRouter, CostRouter,
  CAPABILITIES, TENANT_OWNERSHIP,
} from '../shared/providers/index.js';

// 1. Setup registry au démarrage
const registry = new ProviderRegistry();

// 2. Twilio platform-default
const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
registry.register(new TwilioAdapter({
  client: twilioClient,
  fromNumber: '+15555550000',
  ownership: TENANT_OWNERSHIP.PLATFORM,
  costProfile: { sms: { cents: 5, currency: 'EUR' } },
}));

// 3. Brevo platform email
const brevoClient = makeBrevoClient(...);
registry.register(new BrevoAdapter({
  client: brevoClient,
  defaults: { fromEmail: 'noreply@planora.com' },
}));

// 4. Failover router
const router = new FailoverRouter(registry);
const { result, providerId } = await router.execute(
  { capability: CAPABILITIES.SMS_OUTBOUND, suproId, clientId },
  async (p) => p.sendMessage({ to, body })
);
```

## Invariants Phase 1

| | Status |
|---|---|
| **I1** Aucun fichier legacy modifié | ✅ |
| **I2** Aucune route runtime montée | ✅ (factories non instanciées dans server/index.js) |
| **I3** Bundle frontend inchangé | ✅ (backend pur) |
| **I4** `calendar360.db` intacte | ✅ |
| **I5** 0 import shared/providers depuis runtime live | ✅ |

## Twilio strategy

- ✅ Adapter WRAP-only, client injecté par caller
- ❌ **JAMAIS** d'import direct du package `twilio` npm dans ce module
- ❌ **JAMAIS** d'instance Twilio auto-créée
- Runtime Twilio legacy (`server/routes/voip.js`, `server/services/...`) reste seul à parler au vrai Twilio prod

## FusionPBX strategy

- ❌ **Pas d'adapter FusionPBX/FreeSWITCH** Sprint 3
- ✅ Interface prête (BaseVoiceProvider + BaseNumberProvider) → adapter futur compatible
- Phase 6+ : 1 SUPRO premium pilote → écrire `FusionPbxAdapter` qui hérite `BaseVoiceProvider`

## SUPRO Billing awareness

Chaque provider expose :
- `ownership` (PLATFORM/SUPRO/CLIENT) → routing tenant-aware
- `costProfile` (sms.cents, voice.centsPerMin) → LCR + facturation
- `tenantId` sur Messages/Calls/CDRs normalized → audit trail multi-tenant

Phase 5+ : Billing CDR aggregation s'appuie sur `makeCdr()` output.

## Tests

```bash
node --test server/shared/providers/test/*.test.js
# 111 tests / 19 suites / 0 fail
```

Couverture :
- types : 19 tests (frozen enums + factories)
- providers (core + mocks) : 30 tests (abstract guards + mock behaviors)
- adapters (Twilio + Brevo) : 21 tests (fake clients injectés, normalization)
- registry (registry + resolver) : 19 tests (CRUD + hierarchy)
- router (basic + failover + cost) : 22 tests (cascade, LCR, hooks)

Cumul Phase 1 shared/ : **275 tests / 52 suites / 0 fail**
- Sprint 1 (db/)        : 40 tests
- Sprint 2 (core)       : 124 tests
- Sprint 3 (providers/) : 111 tests

## Référence

- Audit 5 — Provider Routing + Failover (LCR détaillé, 13 providers matrix)
- Audit 8 — Provider Engine SAFE implementation (WRAP→COEXIST→BRIDGE→MIGRATE)
- Audit 9 — Billing + Credits + CDR (event-sourced ledger)
- Audit 12 §2.1 — Sprint 3 livrables
- Audit 13 §1.4 CHECKPOINT-3
- Audit 14 §6 — Runtime freeze
- project_roadmap_supro_billing_telecom_strategy_2026_05_19.md (memory)
