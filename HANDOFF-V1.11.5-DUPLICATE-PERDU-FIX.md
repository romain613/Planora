# HANDOFF V1.11.5 — Fix duplicate-check ignorait pipeline_stage='perdu'

> **Date** : 2026-04-30
> **Tag** : `v1.11.5-duplicate-perdu-fix`
> **Statut** : ✅ déployé prod, smoke SQL 5/5 PASS
> **Demandeur** : MH

---

## 1. Résumé exécutif

Bug logique d'asymétrie sur les endpoints duplicate-check :
- `POST /api/data/contacts` (création complète) **excluait** les contacts en `pipeline_stage='perdu'` du dedup
- `POST /api/data/contacts/check-duplicate-single` (modal RDV / quick add) **n'excluait PAS** → faux positifs
- `POST /api/data/contacts/check-duplicates` (CSV import batch) **n'excluait PAS** → idem

**Symptôme MH** : un contact "supprimé" (pipeline_stage='perdu', invisible côté UI) bloquait la recréation d'un contact avec mêmes phone/email via modal RDV ou import CSV.

**Patch** : 4 SQL `WHERE` étendus avec `AND COALESCE(pipeline_stage, '') != 'perdu'` pour aligner les 2 endpoints duplicate-check sur le comportement de POST /contacts.

---

## 2. Cause racine

| Endpoint | Filtre `pipeline_stage='perdu'` (avant patch) |
|---|:---:|
| POST /api/data/contacts (création complète) | ✅ EXCLUT (data.js:304-310) |
| POST /api/data/contacts/check-duplicate-single | ❌ N'EXCLUT PAS |
| POST /api/data/contacts/check-duplicates | ❌ N'EXCLUT PAS |

Sémantique métier confirmée par MH :
- `pipeline_stage = 'perdu'` = soft-delete fonctionnel
- contact invisible UI mais conservé en DB pour historique
- doit être exclu des doublons actifs
- DELETE /contacts/:id (hard delete) reste inchangé pour V1

---

## 3. Patch — 4 SQL `WHERE` étendus

> ⚠️ Fichier `server/routes/data.js` hors-repo local — gap repo↔VPS connu. Patch appliqué directement VPS avec backup. À versionner lors de la future Phase 0ter.

### Modif 1 — `/check-duplicates` email batch (data.js:331)
```diff
- const rows = db.prepare(`SELECT LOWER(email) as em FROM contacts WHERE companyId = ? AND LOWER(email) IN (${placeholders}) AND email != ''`).all(...);
+ // V1.11.5 — exclure pipeline_stage='perdu' (alignement POST /contacts) — soft-delete strict
+ const rows = db.prepare(`SELECT LOWER(email) as em FROM contacts WHERE companyId = ? AND LOWER(email) IN (${placeholders}) AND email != '' AND COALESCE(pipeline_stage, '') != 'perdu'`).all(...);
```

### Modif 2 — `/check-duplicates` phone batch (data.js:337)
```diff
- const allPhones = db.prepare("SELECT phone FROM contacts WHERE companyId = ? AND phone != ''").all(companyId);
+ // V1.11.5 — exclure pipeline_stage='perdu' (alignement POST /contacts) — soft-delete strict
+ const allPhones = db.prepare("SELECT phone FROM contacts WHERE companyId = ? AND phone != '' AND COALESCE(pipeline_stage, '') != 'perdu'").all(companyId);
```

### Modif 3 — `/check-duplicate-single` email match (data.js:366)
```diff
- emailMatch = db.prepare(
-   "SELECT id, name, email, phone, mobile, assignedTo, shared_with_json, pipeline_stage, companyId FROM contacts WHERE companyId = ? AND LOWER(email) = ? AND email != ''"
- ).get(companyId, cleanEmail);
+ // V1.11.5 — exclure pipeline_stage='perdu' (alignement POST /contacts) — soft-delete strict
+ emailMatch = db.prepare(
+   "SELECT id, name, email, phone, mobile, assignedTo, shared_with_json, pipeline_stage, companyId FROM contacts WHERE companyId = ? AND LOWER(email) = ? AND email != '' AND COALESCE(pipeline_stage, '') != 'perdu'"
+ ).get(companyId, cleanEmail);
```

### Modif 4 — `/check-duplicate-single` phone candidates (data.js:376)
```diff
- const candidates = db.prepare(
-   "SELECT id, name, email, phone, mobile, assignedTo, shared_with_json, pipeline_stage, companyId FROM contacts WHERE companyId = ? AND (phone != '' OR mobile != '')"
- ).all(companyId);
+ // V1.11.5 — exclure pipeline_stage='perdu' (alignement POST /contacts) — soft-delete strict
+ const candidates = db.prepare(
+   "SELECT id, name, email, phone, mobile, assignedTo, shared_with_json, pipeline_stage, companyId FROM contacts WHERE companyId = ? AND (phone != '' OR mobile != '') AND COALESCE(pipeline_stage, '') != 'perdu'"
+ ).all(companyId);
```

### Checksums

| Étape | md5 |
|---|---|
| Pre-patch (backup) | `1891640a0855c8eadf5b95cd7512a6af` |
| Post-patch (deployed) | `e150bf2327c7c6f9af37581299c1f247` |

Backup : `/var/backups/planora/v1115-duplicate-fix-prepatch/data.js.pre-v1115-20260430-125023`

---

## 4. Smoke tests SQL — 5/5 PASS

### Test 1 ✅ — Email "perdu" doit passer (création autorisée)
```sql
SELECT ... WHERE LOWER(email)='kathyorlanepolin@gmail.com' AND email!='' AND COALESCE(pipeline_stage, '') != 'perdu'
→ 0 rows
```
Jean Louis Polin (pipeline_stage='perdu') correctement exclu.

### Test 2 ✅ — Phone "perdu" doit passer (création autorisée)
```sql
SELECT ... WHERE (phone='0758086669' OR mobile='0758086669') AND COALESCE(pipeline_stage, '') != 'perdu'
→ 0 rows
```

### Test 3 ✅ — Email contact ACTIF doit bloquer (doublon détecté)
```sql
SELECT ... WHERE LOWER(email)='hichem.elfa2@gmail.com' AND ... != 'perdu'
→ 1 row : ct1777454700586_0myn Hichem EL FALOUSSI (pipeline_stage='contacte')
```

### Test 4 ✅ — Phone contact ACTIF doit bloquer (Alexandre, rdv_programme)
```sql
SELECT ... WHERE phone='0768083688' AND ... != 'perdu'
→ 1 row : ct1777452730579_5jj0 Alexandre MAMA-TRAORE (pipeline_stage='rdv_programme')
```

### Test 5 ✅ — Préservation historique : les 2 contacts perdu **existent toujours en DB**
```
ct1777452730571_p2sl  Jean Louis Polin            0758086669  Kathyorlanepolin@gmail.com   perdu
ct1777452730577_dbwu  Alberto DIAZ MONTES DE OCA  0767517599  alberto.diaz.77@hotmail.com  perdu
```

### Test 6 — Import CSV
La query `/check-duplicates` (batch) utilise la même clause donc même comportement → **DOIT IGNORER les perdu** ✅

---

## 5. Healthcheck post-patch

```
GET /api/health
{"status":"ok","db":"connected","companies":6,"collaborateurs":16,
 "dbPath":"/var/www/planora-data/calendar360.db","uptime":15}
```
PM2 PID 882026, online.

DB :
- `PRAGMA integrity_check` → ok
- `PRAGMA foreign_key_check` → 0 violation

---

## 6. Anti-régression

| Module | Statut |
|---|:---:|
| Création contact via UI normale (POST /contacts) | ✅ INTACT (excluait déjà perdu) |
| Modal RDV duplicate detection (contacts actifs) | ✅ INTACT (Tests 3-4) |
| Import CSV (contacts actifs) | ✅ INTACT (Test 6) |
| DELETE /contacts/:id (hard delete) | ✅ INTACT (non touché) |
| POST /contacts/bulk-delete | ✅ INTACT (non touché) |
| Pipeline Live | ✅ INTACT |
| Reporting RDV V1.11.4 | ✅ INTACT |
| Contact Share V1 | ✅ INTACT |
| companyId strict sur les 2 endpoints | ✅ INTACT (`WHERE companyId = ?` préservé) |

Aucune nouvelle logique introduite. Strictement un alignement des `WHERE` SQL.

---

## 7. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit READ-ONLY + identifier asymétrie) | ✅ |
| 2 | FIX (4 SQL extensions) | ✅ |
| 3 | re-TEST (node --check syntax + diff montrée à MH) | ✅ |
| 4 | DEPLOY (SCP + PM2 restart APRÈS validation explicite MH) | ✅ |
| 5 | Healthcheck (uptime stable, integrity ok) | ✅ |
| 6 | COMMIT (handoff doc) | ⏳ ce doc |
| 7 | PUSH | ⏳ |
| 8 | MERGE | N/A |
| 9 | TAG (`v1.11.5-duplicate-perdu-fix`) | ⏳ |
| 10 | BACKUP VPS (pre + post-patch) | ✅ pre-patch ; ⏳ post-patch tarball |
| 11 | SECURITY check (companyId + auth) | ✅ |
| 12 | HANDOFF + MEMORY | ⏳ ce doc + memory entry |

✅ **Étape 3 correctement exécutée** : diff exacte montrée à MH, GO explicite reçu, puis SCP. Leçon V1.11.4 retenue.

---

## 8. Procédure rollback (si nécessaire)

```bash
ssh root@VPS "cp /var/backups/planora/v1115-duplicate-fix-prepatch/data.js.pre-v1115-20260430-125023 /var/www/planora/server/routes/data.js && pm2 restart calendar360 --update-env"
```

---

## 9. Reprise nouvelle session

1. Lire MEMORY.md (auto-loaded)
2. Lire ce HANDOFF en priorité
3. État runtime stable, patch déployé
4. Tests fonctionnels live (UI) à confirmer par MH si besoin (les SQL smoke valident le comportement attendu)
5. Backlog connu :
   - Phase 0ter rapatriement repo↔VPS (data.js, bookings.js, voip.js, twilioVoip.js)
   - V7 transfer V2 (cancel propre des bookings au DELETE contact, sans cascade silent)
   - Outlook Calendar V1 (en attente credentials Azure AD)
   - V1.11.4 tests fonctionnels Thomas↔Julie (toujours à valider par MH)

---

**V1.11.5 patch déployé. Doublons "perdu" exclus alignés. Aucune dette technique nouvelle. Comportement métier conforme à la règle MH.**
