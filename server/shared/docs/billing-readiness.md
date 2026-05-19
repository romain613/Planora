# Billing Readiness — Phase 1 préparé pour Phase 5+

> Phase 1 expose CDR + ownership + costProfile. Pas de Stripe ni Wallet runtime.

## Shape CDR (cf. providers/types/callTypes.js → makeCdr)

```js
{
  cdrId: string,
  callId: string,
  providerId: string,
  tenantId: string,
  direction: 'outbound' | 'inbound' | 'internal',
  from: string,
  to: string,
  fromCountry: string | null,
  toCountry: string | null,
  startedAt: number,    // epoch ms
  answeredAt: number,
  endedAt: number,
  billableSec: number,
  ratedCost: number,    // cents
  currency: string,     // ISO 4217 (3 chars)
  meta: object,
}
```

Validé par `contracts/cdr.contract.js → validateCdr(cdr)`.

## Cost profile par provider (cf. providers/core/BaseProvider.js)

```js
{
  sms: { cents: 5, currency: 'EUR' },
  voice: { centsPerMin: 2, currency: 'EUR' },
}
```

Phase 5+ : extensions par destination prefix, geo-rating, etc. (cf. Audit 5).

## Ownership tenant (PLATFORM | SUPRO | CLIENT)

Chaque Provider expose `ownership` + `suproId` + `clientId` → routing tenant-aware + billing attribution correct.

## Billing contracts shape (cf. contracts/billing.contract.js)

### Wallet (par tenant)
```js
{
  tenantId: string,
  currency: string,
  balanceCents: number,
  updatedAt: number,
}
```

### LedgerEntry (event-sourced)
```js
{
  id: string,
  walletId: string,
  amountCents: number,       // signé : positif = topup, négatif = consumption
  currency: string,
  kind: 'topup' | 'consumption' | 'refund' | 'adjustment' | 'subscription',
  createdAt: number,
}
```

### Invoice
```js
{
  id: string,
  tenantId: string,
  currency: string,
  amountCents: number,
  status: 'draft' | 'issued' | 'paid' | 'overdue' | 'void' | 'refunded',
  periodStart: number,
  periodEnd: number,
}
```

## Pipeline futur Phase 5+

```
CDR émis par adapter (Twilio/SIP)
    ↓
RatingEngine → ratedCost + currency (selon costProfile + destination + tenant)
    ↓
CdrAggregator → consolidation par tenant + période
    ↓
LedgerEntry kind=consumption (négatif)
    ↓
Wallet balance updated
    ↓
Si seuil dépassé OU période close → InvoiceGenerator → Invoice
    ↓
StripeService → paiement CB recurring (Phase 5+)
    ↓
WalletService topup si paiement OK, suspension si impayé
```

Cf. Audit 9 — Billing + Credits + CDR architecture (7 services event-sourced).

## Activation par phase

| Phase | Activé |
|---|---|
| 1-3 | Shape CDR/Wallet/Invoice définis, validators OK (DORMANT) |
| 4 | Bridge routes /api/app/* peuvent émettre CDR via Provider Engine |
| 5 | Stripe + Wallet + Invoice runtime ON (Audit 9) |
| 6+ | Suspension auto + dunning + reporting SUPRO |

## Tests (contracts validators)

```bash
node --test server/shared/test/sprint4-contracts.test.js
# Billing validators couverts dans le suite contracts (8 tests sur billing)
```

## Référence

- Audit 9 — Billing + Credits + CDR architecture (event-sourced ledger)
- contracts/billing.contract.js (shape + validators)
- providers/types/callTypes.js (makeCdr)
- providers/core/BaseProvider.js (costProfile + ownership)
- project_roadmap_supro_billing_telecom_strategy_2026_05_19.md (memory)
