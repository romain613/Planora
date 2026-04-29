# HANDOFF V1.10.5 — Diagnostic enrich-existing-contacts AssurCV01

> **Date** : 2026-04-29
> **Demandeur** : MH
> **Verdict** : ✅ code merge/enrich OK — ❌ data manquante côté Sheet ré-importé
> **Code applicatif modifié** : aucun
> **DB modifications** : aucune (idempotent — 0 contact enrichi)

---

## 1. Contexte

V1.10.5 P3 (mapping intelligent) + P4 (enrichissement contacts existants) déployés.
MH a fait un import Google Sheet AssurCV01 en mode "Enrichir (merge)". Résultat UI : "130 doublons".
Constat : aucune donnée custom visible dans les fiches contacts (exemple LAETITIA AQUATE).

Demande initiale : vérifier `incoming_leads.contact_id` rempli, lancer route batch enrich, fixer les contacts.

---

## 2. Investigation

### 2.1 État `incoming_leads` AssurCV01 (`ls_1777408160108_5i5cjv`)

| status | count | contact_id rempli | dispatched |
|---|---:|:---:|:---:|
| assigned | 60 | oui | 1 |
| unassigned | 70 | non | 1 |
| **total** | **130** | **60** | **130** |

### 2.2 Distribution par `import_id`

| import_id | created_at | leads | data_json |
|---|---|---:|---|
| `imp_1777408160108_bj81kl` | 2026-04-28 20:29 | 31 (tous assigned) | **pauvre** — 6 keys (date/city/address/qualification/custom1/update — toutes filtrées par `_KEYS_CONSUMED_BY_STANDARD_FIELDS`) |
| `imp_1777440947602_s3tfny` | 2026-04-29 05:35 | 99 (29 assigned + 70 unassigned) | **riche** — 15 keys business (collaborateur/poste/competences/langues/permis_b/lien_cv/lien_fiche/experience_assurance/niveau_d_etudes/questionnaire_complete/ias…) |

### 2.3 Cross-match 1er import ↔ 2e import

```
Match email     : 0/31
Match phone     : 0/31
Match firstname+lastname : 0/31
```

**Conclusion** : les 31 personnes du 1er import (LAETITIA AQUATE incluse) **ne sont pas présentes** dans le Sheet ré-importé. Le mode merge n'a donc rien à fusionner pour elles.

### 2.4 Distribution `contacts.custom_fields_json`

| État | count | Cause |
|---|---:|---|
| populé (1016-1581 bytes) | 29 | contacts du 2e import → enrich auto à l'insertion via `assignLeadToCollab` |
| vide (`[]`) | 31 | contacts du 1er import → leur lead source data_json ne contient aucune key business |

---

## 3. Action exécutée

### 3.1 Backup avant

```
/var/backups/planora/v1105-enrich-batch-20260429/pre-enrich-cfj.jsonl   (60 contacts × {id, custom_fields_json})
```

### 3.2 Script one-shot équivalent route batch

**Local repo** : `server/scripts/enrich-batch-AssurCV01-20260429.mjs`
**VPS** : `/var/www/planora/server/scripts/enrich-batch-AssurCV01-20260429.mjs`

Logique strictement identique à `POST /api/leads/sources/:id/enrich-existing-contacts` ([leads.js:153](server/routes/leads.js#L153)) — boucle sur leads `dispatched=1 AND contact_id != ''`, appelle `enrichContactCustomFields(contactId, lead.data_json)`.

### 3.3 Résultat exécution

```json
{
  "source": "ls_1777408160108_5i5cjv",
  "processed": 60,
  "enriched": 0,
  "skipped_no_change": 60,
  "errors": 0,
  "totals": { "added": 0, "updated": 0, "skipped": 296 },
  "errorSamples": []
}
```

- 29 contacts ont déjà un `custom_fields_json` populé (déjà enrichis auto à l'insertion) → tout skipped (preserve).
- 31 contacts ont `custom_fields_json='[]'` MAIS leur lead source data_json contient uniquement les keys filtrées par `_KEYS_CONSUMED_BY_STANDARD_FIELDS` → 0 key custom à extraire.
- `audit_logs.lead_data_enriched` post-2026-04-29 06:30 : **0 row** (helper n'écrit que sur enrichissement réel).

---

## 4. Validation pile applicative

| Composant | Statut | Référence |
|---|:---:|---|
| Helper `enrichContactCustomFields` | ✅ OK | [leadImportEngine.js:187](server/services/leadImportEngine.js#L187) |
| Route `POST /api/leads/sources/:id/enrich-existing-contacts` | ✅ OK | [leads.js:153](server/routes/leads.js#L153) |
| Mode `merge` `executeImport` (UPDATE data_json + enrich auto) | ✅ OK | [leadImportEngine.js:516-561](server/services/leadImportEngine.js#L516-L561) |
| Fallback lookup email/phone P2.1 | ✅ OK | [leadImportEngine.js:548-558](server/services/leadImportEngine.js#L548-L558) |

---

## 5. Recommandation pour fixer LAETITIA et les 30 autres

**Action MH** : préparer un Sheet Google contenant **les 31 personnes du 1er import** (LAETITIA AQUATE incluse) **+ les nouveaux leads**, puis ré-importer en mode `merge`.

Effets attendus :
- Le mode `merge` détectera les doublons sur email/phone/name pour les 31 anciens → UPDATE `incoming_leads.data_json` avec colonnes business.
- L'enrich auto sera déclenché par `executeImport` ([leadImportEngine.js:560](server/services/leadImportEngine.js#L560)) → `contacts.custom_fields_json` des 31 contacts (LAETITIA inclus) sera populé.
- Aucune redistribution, aucun changement collab/pipeline/status (invariants L1 §E préservés).

→ Aucune intervention code/DB requise pour ce fix. Pure action data côté Sheet.

---

## 6. Anomalie séparée — DB fantôme

**Détection** : `/var/www/planora/server/calendar360.db` (1.5 Mo, modifié 2026-04-24) + `.db-shm` (créé par mon premier run sans `DB_PATH`) + `.db-wal` (modifié 2026-04-27).

**Violation** : CLAUDE.md §10.4 dit "Fantômes runtime : aucun" depuis archivage E.3.7 (2026-04-20).

**Impact actif** : nul — `lsof -p 771284` confirme PM2 utilise bien `/var/www/planora-data/calendar360.db`. Le fantôme est isolé (lu uniquement par scripts ad-hoc lancés sans `DB_PATH`).

**Plan séparé** : voir `AUDIT-DB-FANTOM-PLAN-2026-04-29.md` (cadrage, pas d'action immédiate).

---

## 7. Workflow strict 11 étapes — application

| # | Étape | Statut |
|---:|---|:---:|
| 1 | TEST | ✅ diagnostic complet, healthcheck OK |
| 2 | FIX | N/A (pas de bug code) |
| 3 | re-TEST | ✅ batch enrich exécuté, idempotent |
| 4 | DEPLOY | N/A |
| 5 | healthcheck post | ✅ pm2 PID 771284 online, uptime 57m, integrity ok |
| 6 | COMMIT | ✅ |
| 7 | PUSH | ✅ |
| 8 | MERGE safe | N/A (branche clean-main → main hors scope ici) |
| 9 | TAG | ✅ |
| 10 | BACKUP VPS | ✅ |
| 11 | SECURITY check | ✅ aucune nouvelle surface, aucun secret exposé |

---

## 8. Reprise nouvelle session

1. Lire ce HANDOFF en priorité.
2. État runtime stable, aucune action urgente.
3. Si MH a relancé le ré-import enrichi → vérifier post-import :
   ```bash
   ssh root@136.144.204.115 "sqlite3 /var/www/planora-data/calendar360.db \"SELECT COUNT(*) FROM contacts c JOIN incoming_leads il ON il.contact_id=c.id WHERE il.companyId='c1776169036725' AND il.source_id='ls_1777408160108_5i5cjv' AND length(c.custom_fields_json) > 100;\""
   ```
   Cible : 60/60 (vs 29/60 actuel).
4. Si MH valide visuellement LAETITIA post-réimport → consigner livraison V1.10.5 P3+P4 finale.
5. Anomalie DB fantôme : voir `AUDIT-DB-FANTOM-PLAN-2026-04-29.md` pour cadrage.

---

**Fin du handoff. Aucune dette technique introduite.**
