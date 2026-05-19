# Provider Engine — `server/shared/providers/`

> WRAP-only abstraction multi-provider. AUCUN provider live branché Phase 1.

## Capabilities (16)

| Domaine | Capabilities |
|---|---|
| SMS | `sms.outbound` `sms.inbound` `sms.dlr` |
| Voice | `voice.outbound` `voice.inbound` `voice.recording` `voice.transcription` `voice.transfer` `voice.ivr` |
| Number | `number.provision` `number.release` `number.portability` |
| Email | `email.outbound` `email.inbound` |
| Autres | `sip.trunk` `whatsapp` |

## Hiérarchie résolution (resolveProviders)

```
CLIENT-owned (suproId + clientId match)    ← priorité max
    ↓ fallback
SUPRO-owned (suproId match)
    ↓ fallback
PLATFORM-owned (partagé)                   ← fallback global
```

Intra-niveau : tri `priority` asc, puis `health` (healthy > degraded > unknown > down).

## Adapters disponibles

| Adapter | Type | Status Sprint 3 |
|---|---|---|
| TwilioAdapter | composite (sms+voice+number) | WRAP, **client INJECTÉ** (jamais `require('twilio')` runtime) |
| BrevoAdapter | messaging (email+sms) | WRAP, **client INJECTÉ** (jamais `@getbrevo/brevo` runtime) |
| MockMessagingProvider | messaging | 0 réseau, failNext + simulateInbound |
| MockVoiceProvider | voice | 0 réseau, CDR auto-généré |
| MockProvider | composite générique | tests registry/router |

**Futurs adapters Phase 6+** : `FusionPbxAdapter`, `SipTrunkAdapter`, `FreeSwitchAdapter` (cf. opensource-roadmap.md).

## Routers

- **`ProviderRouter`** : select() 1er candidat trié
- **`FailoverRouter`** : execute() cascade avec maxAttempts + onAttemptFailed hook
- **`CostRouter`** : selectCheapest() LCR basique + estimateCost() selon costProfile

## Pattern d'usage Phase 4+ BRIDGE

```js
import { TwilioAdapter, ProviderRegistry, FailoverRouter, CAPABILITIES, TENANT_OWNERSHIP } from '../shared/providers/index.js';

// 1. Setup au démarrage (Phase 4+)
const registry = new ProviderRegistry();

const twilioClient = require('twilio')(env.TWILIO_SID, env.TWILIO_TOKEN); // ← caller-side, jamais dans shared/
registry.register(new TwilioAdapter({
  client: twilioClient,
  fromNumber: '+15555550000',
  ownership: TENANT_OWNERSHIP.PLATFORM,
  costProfile: { sms: { cents: 5, currency: 'EUR' } },
}));

// 2. Usage dans une route Phase 4+ (BRIDGE)
const router = new FailoverRouter(registry);
const { result, providerId, attempts } = await router.execute(
  { capability: CAPABILITIES.SMS_OUTBOUND, suproId, clientId },
  async (provider) => provider.sendMessage({ to, body, tenantId })
);
```

## Quality gates (Sprint 4)

| Check | Implémentation |
|---|---|
| Aucun SDK npm provider importé directement | `eslint/no-direct-provider-sdk.js` |
| Adapter expose opts.client validé | `r9/provider-isolation-check.js` |
| Aucune auto-instanciation Twilio/Brevo | `r9/provider-isolation-check.js` |
| Provider expose contract complet | `contracts/provider.contract.js` |
| CDR shape valide | `contracts/cdr.contract.js` |

## Strategy

- **Court terme** (Phase 1-3) : Twilio runtime INTOUCHABLE, abstraction WRAP-only
- **Moyen terme** (Phase 4-6) : routes parallèles `/api/app/*` montent adapters Twilio injectés + Brevo
- **Long terme** (Phase 6+) : FusionPBX/FreeSWITCH adapter pilote 1 SUPRO premium
- **Phase 7+** : Kamailio si triggers (≥3 FusionPBX ou ≥5 trunks)

## Tests

```bash
node --test server/shared/providers/test/*.test.js
# 111 tests / 19 suites / 0 fail
```

## Référence

- Audit 5 — Provider Routing + Failover
- Audit 8 — Provider Engine SAFE
- Audit 9 — Billing + CDR
- opensource-roadmap.md (ci-après)
