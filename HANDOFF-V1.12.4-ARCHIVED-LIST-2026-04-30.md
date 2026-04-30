# HANDOFF V1.12.4 — GET /api/data/contacts/archived (mode dark)

> **Date** : 2026-04-30
> **Tag** : `v1.12.4-archived-list`
> **Commit** : `18345492`
> **Statut** : ✅ déployé prod, 5/5 tests SQL PASS, mode dark
> **Prochaine étape** : V1.12.5.a→e filtres exclusion (init/data/voip/reporting/NBA) **uniquement sur GO MH**

---

## 1. Résumé exécutif

Phase 4 V1.12 livrée — endpoint `GET /api/data/contacts/archived` backend uniquement, complète le triplet archive/restore/list mode dark.

**27 lignes ajoutées dans `data.js`, 0 ligne supprimée. Aucun frontend touché. Aucun side effect runtime.**

---

## 2. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit READ-ONLY GET /contacts existant) | ✅ |
| 2 | FIX (édit `/tmp/data-v1124-patched.js`) | ✅ 27 lignes après ligne 127 |
| 3 | re-TEST (`node --check`) | ✅ syntax OK |
| 4 | **Diff exacte montrée à MH + GO explicite** | ✅ "GO V1.12.4 SCP" reçu |
| 5 | DEPLOY (backup DB + data.js + SCP + PM2 restart) | ✅ PID 901846 |
| 6 | Healthcheck | ✅ status=ok |
| 7 | COMMIT local (`18345492`) | ✅ |
| 8 | PUSH origin/clean-main | ✅ |
| 9 | TAG `v1.12.4-archived-list` + push | ✅ |
| 10 | BACKUP VPS post-checkpoint | ✅ |
| 11 | SECURITY check (auth + companyId + scope strict) | ✅ |
| 12 | HANDOFF doc + STOP | ✅ ce doc |

---

## 3. Endpoint spécification

### Route
```
GET /api/data/contacts/archived?companyId=...
```

### ⚠ Position critique
Déclaré **AVANT** `router.get('/contacts/:id', ...)` (ligne 129) — sinon Express matchait `:id='archived'` et la nouvelle route n'aurait jamais été appelée.

### Auth & Permission
- `requireAuth` (JWT validé)
- `enforceCompany` (validation companyId)
- `requirePermission('contacts.view')`

### Query param
- `companyId` (obligatoire — sinon 400)

### Scope par perspective collab

| Rôle | Filtre SQL |
|---|---|
| **supra/admin** | `companyId = ? AND archivedAt IS NOT NULL AND archivedAt != ''` |
| **collab** | + `(assignedTo = ? OR sharedWithId = ? OR shared_with_json LIKE ?)` |

**Tri** : `ORDER BY archivedAt DESC` (plus récent en haut)

### Responses

| HTTP | Body | Cas |
|---:|---|---|
| 200 | `Array<contact>` | Liste archivés (scope appliqué) |
| 400 | `{error: 'companyId requis'}` | Query param manquant |
| 401 | (middleware) | Non auth |
| 403 | (enforceCompany / permission) | Wrong company / permission manquante |
| 500 | `{error: err.message}` | Erreur DB |

---

## 4. Sécurité

| # | Contrôle | Code |
|---|---|---|
| 1 | requireAuth (JWT validé) | middleware |
| 2 | enforceCompany (companyId match strict) | middleware |
| 3 | requirePermission('contacts.view') | middleware |
| 4 | companyId obligatoire | `if (!companyId) return 400` |
| 5 | Scope collab : 3 critères restrictifs | OR logic strict |
| 6 | **Filtre archivedAt strict** | `archivedAt IS NOT NULL AND archivedAt != ''` |

**Multi-company isolation** : T4 a vérifié 0 leak entre CapFinances et MonBilan.

---

## 5. Tests post-deploy — 5/5 PASS

| # | Test | Attendu | Réel |
|---:|---|---|:---:|
| T0 | Endpoint mounted (curl GET sans auth) | 401 | ✅ HTTP 401 |
| T2 | INSERT 3 contacts (cap archivé + cap actif + mon archivé), query cap admin | 1 row (cap archivé only) | ✅ `ct_v1124_a_cap` |
| T3 | Actifs dans le résultat | 0 | ✅ `b_cap` actif exclu |
| T4 | Isolation cross-company (cap→mon, mon→cap) | 0 leak | ✅ both 0 |
| Cleanup | DELETE 3 contacts test | 3 rows | ✅ |
| Integrity | PRAGMA integrity_check | ok | ✅ |
| FK | PRAGMA foreign_key_check | 0 violation | ✅ |
| Healthcheck | `/api/health` | status=ok | ✅ uptime 27s |

---

## 6. Mode dark V1.12.4 — Aucun impact runtime

✅ Pipeline Live, CRM, Reporting V1.11.4, Contact Share V1, Lead V1.10.6, SMS Hub, Quick add, Import CSV, VoIP, DELETE /:id, Archive endpoint V1.12.2, Restore endpoint V1.12.3 → tous **inchangés**.

✅ Aucun filtre `archivedAt` ajouté sur les SELECTs existants (V1.12.5.x à venir).
✅ Aucun frontend branché (V1.12.8).

---

## 7. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| DB pré-V1.12.4 | `/var/backups/planora/v1124-pre/calendar360.db.pre-v1124` | `650202e3` |
| data.js pré-V1.12.4 | `/var/backups/planora/v1124-pre/data.js.pre-v1124` | `be1bfd6e` |
| DB post-V1.12.4 | `/var/backups/planora/v1124-post/calendar360.db.post-v1124` | `650202e3` (inchangée — endpoint READ-ONLY) |
| data.js post-V1.12.4 | `/var/backups/planora/v1124-post/data.js.post-v1124` | `10bb594d` |
| Tarball post | `/var/backups/planora/v1124-post/data-routes-v1124.tar.gz` | `4b8d1cef` |

---

## 8. État Git après V1.12.4

```
HEAD : 18345492 (V1.12.4 — GET /api/data/contacts/archived endpoint, mode dark)
Tags V1.12 : v1.12.1-db-migration, v1.12.2-archive-endpoint,
             v1.12.3-restore-endpoint, v1.12.4-archived-list
Branch : clean-main → origin/clean-main aligned
```

---

## 9. Reste V1.12 (9 sous-phases ~15h dev)

- ⏭ **V1.12.5.a** Filter init.js (1 SELECT contacts company-wide) — 30 min
- V1.12.5.b Filter data.js duplicate-check (4 SQL) — 30 min
- V1.12.5.c Filter voip + conversations + clientPortal — 1h
- V1.12.5.d Filter bookings/reporting V1.11.4 — 30 min
- V1.12.5.e Filter nextBestAction (4 SQL) — 30 min
- V1.12.6 refus actions critiques (POST bookings/share/transfer + bookings futurs check) — 1h
- V1.12.7 DELETE redéfini + hard delete + delete-preview — 2h
- V1.12.8 frontend modale Archiver + onglet Archivés — 4h
- V1.12.9 frontend hard delete + bouton restore — 2h
- V1.12.10 tests régression (20 SQL + 10 UI) — 4h
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts` — 1h
- V1.12.12 cycle observation 1 semaine prod — passive
- V1.12.13 cleanup `pipeline_stage='perdu'` legacy V1.11.5 — 30 min

---

## 10. STOP V1.12.4 confirmé

**Aucune action sans GO MH explicite**.

Triptyque archive/restore/list backend complet et stable en mode dark. Aucun impact runtime. Prochain saut : V1.12.5 = filtres globaux (premier impact runtime perceptible — les contacts archivés disparaissent du CRM/init/duplicate-check).
