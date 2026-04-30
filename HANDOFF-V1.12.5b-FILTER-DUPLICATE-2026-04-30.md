# HANDOFF V1.12.5.b — Filter data.js duplicate-check (option A strict)

> **Date** : 2026-04-30
> **Tag** : `v1.12.5b-filter-duplicate`
> **Commit** : `ecc96117`
> **Statut** : ✅ déployé prod, 9/9 tests SQL PASS
> **Prochaine étape** : V1.12.5.c filter voip + conversations + clientPortal **uniquement sur GO MH**

---

## 1. Résumé exécutif

7 SQL duplicate-check dans 4 endpoints reçoivent le filtre `AND (archivedAt IS NULL OR archivedAt = '')`. Les contacts archivés n'apparaissent plus comme doublons → un user peut créer un nouveau contact avec le même email/phone qu'un archivé.

**Option A strict respectée** : L488 (`import-batch`) reçoit SEULEMENT le filtre archivedAt. Dette pré-existante V1.11.5 (`pipeline_stage='perdu'` manquant sur L488) non corrigée dans ce patch.

---

## 2. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit READ-ONLY 7 SQL cartographie) | ✅ |
| 2 | FIX (édit `/tmp/data-v1125b-patched.js`) | ✅ 7 lignes modifiées |
| 3 | re-TEST (`node --check`) | ✅ syntax OK |
| 4 | **Diff exacte montrée à MH + GO explicite** | ✅ "GO V1.12.5.b SCP" reçu |
| 5 | DEPLOY (backup DB + data.js + SCP + PM2 restart) | ✅ PID 904289 |
| 6 | Healthcheck | ✅ status=ok |
| 7 | COMMIT local (`ecc96117`) | ✅ |
| 8 | PUSH origin/clean-main | ✅ |
| 9 | TAG `v1.12.5b-filter-duplicate` + push | ✅ |
| 10 | BACKUP VPS post-checkpoint | ✅ |
| 11 | SECURITY check (cohabitation V1.11.5 + V1.12) | ✅ |
| 12 | HANDOFF doc + STOP | ✅ ce doc |

---

## 3. Patch détaillé — 7 SQL modifiés

| Ligne | Endpoint | Avant | Après |
|---:|---|---|---|
| L331 | `POST /contacts` (email dup) | `... != 'perdu'` | `... != 'perdu' AND (archivedAt IS NULL OR archivedAt = '')` |
| L337 | `POST /contacts` (phone dup) | `... != 'perdu'` | `... != 'perdu' AND (archivedAt IS NULL OR archivedAt = '')` |
| L359 | `POST /check-duplicates` (batch email) | `... != 'perdu'` | `... != 'perdu' AND (archivedAt IS NULL OR archivedAt = '')` |
| L366 | `POST /check-duplicates` (batch phone) | `... != 'perdu'` | `... != 'perdu' AND (archivedAt IS NULL OR archivedAt = '')` |
| L396 | `POST /check-duplicate-single` (email) | `... != 'perdu'` | `... != 'perdu' AND (archivedAt IS NULL OR archivedAt = '')` |
| L407 | `POST /check-duplicate-single` (phone/mobile) | `... != 'perdu'` | `... != 'perdu' AND (archivedAt IS NULL OR archivedAt = '')` |
| L488 | `POST /import-batch` (dedup index) | `WHERE companyId = ?` | `WHERE companyId = ? AND (archivedAt IS NULL OR archivedAt = '')` |

**Vérification source prod** : `grep -c 'archivedAt IS NULL OR archivedAt' data.js` → **7** ✅

---

## 4. Comportement runtime après V1.12.5.b

| Scénario | Avant V1.12.5.b | Après V1.12.5.b |
|---|---|---|
| User crée contact email = email d'un archivé | Match doublon, retour `_duplicate: true` | Pas de match, contact créé normalement |
| CSV import contient email d'un archivé | Doublon détecté, comportement skip/merge/replace | Pas de doublon, importé comme nouveau |
| Quick add RDV phone identique à archivé (V1.8.22) | DuplicateResolverModal ouvert | Pas de modal, contact créé |
| Quick add RDV phone identique à actif | Modal s'ouvre normalement | **Inchangé** ✅ |
| Lead engine V1.10.5 enrich (data.js routes leads.js) | Hors scope | **Hors scope V1.12.5.c** |

---

## 5. Garde-fous respectés

✅ **`pipeline_stage != 'perdu'` V1.11.5 conservé partout** où il était présent (cohabitation jusqu'à V1.12.13)
✅ **L488 dette pré-existante V1.11.5 non corrigée** (option A strict)
✅ **Endpoints archive/restore/archived list V1.12.2/3/4 non touchés**
✅ **0 ligne ajoutée, 0 supprimée** (modifications inline strictes)
✅ **Aucune autre logique modifiée** (structure, transactions, error handling intacts)

---

## 6. Tests post-deploy — 9/9 PASS

Setup : 2 contacts test cap (1 archivé `ct_v1125b_arch` + 1 actif `ct_v1125b_actif`) avec email/phone distincts.

| # | Test | Cible | Attendu | Réel |
|---:|---|---|---|:---:|
| Source prod | grep `archivedAt IS NULL OR archivedAt` data.js | count | 7 | ✅ 7 |
| T1 | L331 dup email — archive | nb match | 0 | ✅ 0 |
| T2 | L331 dup email — actif | nb match | 1 | ✅ 1 |
| T3 | L337 dup phone — archive | nb match | 0 | ✅ 0 |
| T4 | L396 single email — archive | nb match | 0 | ✅ 0 |
| T5 | L396 single email — actif | nb match | 1 | ✅ 1 |
| T6 | L407 single phone — archive | nb match | 0 | ✅ 0 |
| T7 | L488 import dedup — archive | nb match | 0 | ✅ 0 |
| T8 | L488 import dedup — actif | nb match | 1 | ✅ 1 |
| T9 | L359 batch email IN (arch, actif) | result | "actif" only | ✅ |
| Cleanup | DELETE 2 contacts test | 2 rows | ✅ |
| Healthcheck | `/api/health` | status=ok | ✅ uptime 29s |
| PRAGMA integrity_check | ok | ✅ |
| PRAGMA foreign_key_check | 0 violation | ✅ |

---

## 7. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| DB pré-V1.12.5.b | `/var/backups/planora/v1125b-pre/calendar360.db.pre-v1125b` | `599fa349` |
| data.js pré-V1.12.5.b | `/var/backups/planora/v1125b-pre/data.js.pre-v1125b` | `10bb594d` |
| DB post-V1.12.5.b | `/var/backups/planora/v1125b-post/calendar360.db.post-v1125b` | `599fa349` (inchangée) |
| data.js post-V1.12.5.b | `/var/backups/planora/v1125b-post/data.js.post-v1125b` | `9eb61a2e` |
| Tarball post | `/var/backups/planora/v1125b-post/data-routes-v1125b.tar.gz` | `4e3b95b6` |

---

## 8. État Git après V1.12.5.b

```
HEAD : ecc96117 (V1.12.5.b — Filter data.js duplicate-check)
Tags V1.12 : v1.12.1-db-migration, v1.12.2-archive-endpoint,
             v1.12.3-restore-endpoint, v1.12.4-archived-list,
             v1.12.5a-filter-init, v1.12.5b-filter-duplicate
Branch : clean-main → origin/clean-main aligned
```

---

## 9. Reste V1.12 (7 sous-phases ~13h dev)

- ⏭ **V1.12.5.c** Filter voip + conversations + clientPortal (3 SQL) — 1h
- V1.12.5.d Filter bookings/reporting V1.11.4 (+JOIN contacts) — 30 min
- V1.12.5.e Filter nextBestAction (4 SQL) — 30 min
- V1.12.6 refus actions critiques (POST bookings/share/transfer) — 1h
- V1.12.7 DELETE redéfini + hard delete + delete-preview — 2h
- V1.12.8 frontend modale Archiver + onglet Archivés — 4h
- V1.12.9 frontend hard delete + bouton restore — 2h
- V1.12.10 tests régression (20 SQL + 10 UI) — 4h
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts` — 1h
- V1.12.12 cycle observation 1 semaine prod — passive
- V1.12.13 cleanup `pipeline_stage='perdu'` legacy V1.11.5 — 30 min

---

## 10. Dette pré-existante notée (hors scope V1.12.5.b)

🟡 **L488 import-batch** : SQL n'a pas le filtre `pipeline_stage != 'perdu'` que les 6 autres SQL duplicate-check ont depuis V1.11.5. Asymétrie laissée volontairement non corrigée pour respecter le périmètre strict V1.12.5.b option A.

**Impact** : un import CSV peut détecter un contact `pipeline_stage='perdu'` (mais non-archivé) comme doublon, alors que `/check-duplicates` (batch) l'ignore. Cohérence dégradée entre les 2 paths CSV import.

**Action recommandée** : programmer un V1.12.5.b1 fixup d'1 ligne pour aligner L488 sur V1.11.5 (sub-décision MH). Ou attendre V1.12.13 cleanup global `pipeline_stage='perdu'` qui résoudra le sujet par suppression du filtre legacy.

---

## 11. STOP V1.12.5.b confirmé

**Aucune action sans GO MH explicite**.

Filtre archivedAt désormais actif sur 2 surfaces critiques (init.js payload + data.js duplicate-check). Prochain saut V1.12.5.c = autres routes business (VoIP lookup phone, Conversations subquery, ClientPortal auth).
