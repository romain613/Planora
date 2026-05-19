# Open Source Operator-Grade Stack — Roadmap PLANORA

> Stack open source cible long terme. **AUCUNE installation Phase 1-3.**
> Référence à `project_roadmap_opensource_operator_grade_stack_2026_05_19.md` (memory).

## Doctrine

```
WRAP → COEXIST → BRIDGE → MIGRATE
```

Twilio runtime actuel **INTOUCHABLE** tant que provider abstraction non stabilisée + 1 pilote SUPRO en prod.

## Stack cible (par phase d'introduction)

### Phase 1-3 (NOW)
- ✅ Twilio live INTOUCHABLE
- ✅ Provider abstraction WRAP-only (Sprint 3 livré)
- ✅ SQLite monolithe runtime

### Phase 4 (observabilité basique)
- ⏳ Prometheus (metrics)
- ⏳ Grafana (dashboards)
- ⏳ Loki (logs centralisés)

### Phase 5 (billing avec Stripe)
- ⏳ Redis (cache + locks)
- ⏳ BullMQ (jobs async)
- ⏳ Stripe (paiement CB)

### Phase 6 (FusionPBX pilote + SUPRA scale)
- ⏳ FreeSWITCH (moteur voix principal — base opérateur long terme)
- ⏳ FusionPBX (admin UI FreeSWITCH)
- ⏳ PostgreSQL (SUPRA Control Tower si >50 SUPROs)
- ⏳ NATS OR RabbitMQ (event bus)

### Phase 7+ (scale réel)
- ⏳ Kamailio (SIP proxy, load balancing)
- ⏳ RTPengine (NAT traversal, media relay)
- ⏳ ClickHouse (analytics massif CDR)

## Triggers d'activation par composant

| Composant | Trigger d'activation |
|---|---|
| FreeSWITCH/FusionPBX | 1er SUPRO premium qui demande SIP trunk dédié |
| Kamailio | ≥3 instances FusionPBX OU ≥5 trunks distincts |
| PostgreSQL SUPRA | >50 SUPROs OU latence SUPRA DB > 100ms p95 |
| Redis + BullMQ | Stripe billing actif (recharge + factures recurring) |
| ClickHouse | ≥10M CDRs/mois OU dashboards analytics demandés par >5 SUPROs |
| Prometheus + Grafana | ≥3 SUPROs en prod OU 1er client B2B exige SLA contractuel |
| NATS/RabbitMQ | Multi-instance backend (cluster PM2 ou microservices) |
| RTPengine | NAT traversal bloquant pour CLIENTs derrière firewall corporate |

## ❌ Interdictions immédiates Phase 1-3

- ❌ Brancher FusionPBX
- ❌ Installer Kamailio
- ❌ Migrer SQLite vers PostgreSQL
- ❌ Installer Redis sans cas d'usage immédiat
- ❌ Activer Prometheus sans cible SLA définie
- ❌ Adopter ClickHouse sans volume justifiant
- ❌ Remplacer Twilio live
- ❌ Big bang télécom

## Adapters Phase 6+ à créer (héritent BaseProvider/BaseVoiceProvider)

```js
// Phase 6+
class FusionPbxAdapter extends BaseVoiceProvider {
  constructor(opts) {
    super({ ...opts, capabilities: [CAPABILITIES.VOICE_OUTBOUND, ...] });
    if (!opts.client) throw new Error('client required');
    this._client = opts.client;  // axios client préconfiguré pour API FusionPBX
  }
  async initiateCall(params) { /* HTTP POST FusionPBX API */ }
  async hangupCall(callId) { /* idem */ }
  // ...
}

class SipTrunkAdapter extends BaseVoiceProvider {
  // Wrapper générique pour trunk SIP via librairie tierce injectée
}

class FreeSwitchAdapter extends BaseVoiceProvider {
  // Wrapper ESL (Event Socket Library)
}
```

Le pattern WRAP-only s'applique : aucun import direct du SDK FreeSWITCH/FusionPBX dans shared/, client toujours injecté.

## Objectif final

Transformer progressivement PLANORA :
- D'un **CRM Twilio**
- Vers une **vraie plateforme opérateur SaaS multi-tenant white-label scalable**

Critères qualité maintenus à chaque étape :
- **SAFE-by-design**
- **Rollbackable** (chaque livrable revertable seul)
- **Multi-provider** (Twilio + SIP + FusionPBX coexistent)
- **Operator-grade** (continuous availability, audit trail complet)

## Référence

- project_roadmap_opensource_operator_grade_stack_2026_05_19.md (memory — détail triggers)
- Audit 5 — Provider Routing + Failover (13 providers matrix)
- Audit 6 — DB Isolation + Multi-tenant (SQLite limits + 3-DB topology)
- Audit 8 — Provider Engine SAFE
- Audit 9 — Billing + Credits + CDR
- Audit 10 — SUPRO Operator Panel
- Audit 11 — Control Tower SUPRA Platform
