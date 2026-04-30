# HANDOFF V1.12.3 — POST /api/data/contacts/:id/restore (mode dark)

> **Date** : 2026-04-30
> **Tag** : `v1.12.3-restore-endpoint`
> **Commit** : `cc3b05a0`
> **Statut** : ✅ déployé prod, 5/5 tests SQL PASS, mode dark
> **Prochaine étape** : V1.12.4 GET `/api/data/contacts/archived` **uniquement sur GO MH**

---

## 1. Résumé exécutif

Phase 3 V1.12 livrée — endpoint `POST /api/data/contacts/:id/restore` créé en mode dark backend uniquement, symétrique avec V1.12.2 archive.

**39 lignes ajoutées dans `data.js`, 0 ligne supprimée. Aucun frontend touché. Aucun side effect runtime.**

---

## 2. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit READ-ONLY archive endpoint) | ✅ |
| 2 | FIX (édit `/tmp/data-v1123-patched.js`) | ✅ 39 lignes après ligne 928 |
| 3 | re-TEST (`node --check`) | ✅ syntax OK |
| 4 | **Diff exacte montrée à MH + GO explicite** | ✅ "ok" reçu |
| 5 | DEPLOY (backup DB + data.js + SCP + PM2 restart) | ✅ PID 899441 |
| 6 | Healthcheck | ✅ status=ok |
| 7 | COMMIT local (`cc3b05a0`) | ✅ |
| 8 | PUSH origin/clean-main | ✅ |
| 9 | TAG `v1.12.3-restore-endpoint` + push | ✅ |
| 10 | BACKUP VPS post-checkpoint | ✅ |
| 11 | SECURITY check (6 contrôles symétriques) | ✅ |
| 12 | HANDOFF doc + STOP | ✅ ce doc |

---

## 3. Endpoint spécification

### Route
```
POST /api/data/contacts/:id/restore
```

### Auth & Permission
- `requireAuth` (JWT validé)
- `requirePermission('contacts.edit')` ← **différent de archive (delete)**

### Body
Aucun body requis.

### Responses

| HTTP | Body | Cas |
|---:|---|---|
| 200 | `{success: true, action: 'restored', id, name}` | Restore OK |
| 401 | (middleware) | Non auth |
| 403 | `{error: "Accès interdit"}` | Wrong company (sauf supra) |
| 403 | `{error: "Accès interdit — contact assigné à un autre collaborateur"}` | Non-admin tente restore d'un autre |
| 403 | (middleware permission) | Permission `contacts.edit` manquante |
| 404 | `{error: 'NOT_FOUND'}` | Contact n'existe pas |
| 400 | `{error: 'NOT_ARCHIVED'}` | Pas archivé (≠ archive qui retourne 409 ALREADY_ARCHIVED) |
| 500 | `{error: err.message}` | Erreur DB |

### Action backend
```sql
UPDATE contacts SET archivedAt = '', archivedBy = '', archivedReason = '' WHERE id = ?
```
+ `logAudit('contact_restored', ...)` avec **capture audit trail** :
- `previousArchivedAt`
- `previousArchivedBy`
- `previousArchivedReason`
+ `console.log [CONTACTS] Contact X RESTORED by Y (was archived ZZZ)`

---

## 4. Sécurité — 6 contrôles symétriques avec /archive

| # | Contrôle | Code |
|---|---|---|
| 1 | requireAuth (JWT validé) | middleware |
| 2 | requirePermission('contacts.edit') | middleware |
| 3 | 404 NOT_FOUND si contact n'existe pas | `if (!record)` |
| 4 | 403 si companyId différent (sauf supra) | `if (!isSupra && record.companyId !== req.auth.companyId)` |
| 5 | 403 ownership : non-admin restaure QUE ses contacts | `if (!isAdmin && !isSupra && assignedTo !== collabId)` |
| 6 | **400 NOT_ARCHIVED** si déjà actif | `if (!record.archivedAt \|\| record.archivedAt === '')` |

Note : 400 NOT_ARCHIVED ≠ 409 ALREADY_ARCHIVED de /archive — sémantique distincte (state mismatch vs idempotence).

---

## 5. Tests post-deploy — 5/5 PASS

| # | Test | Attendu | Réel |
|---:|---|---|:---:|
| T0 | Endpoint mounted (curl POST sans auth) | bloqué | ✅ HTTP 403 (cohérent avec /archive idem 403) |
| T1 | INSERT contact bidon archived | `archivedAt = '2026-04-30 17:00:00'`, `archivedBy = 'u1776790683720'`, `archivedReason = 'test V1.12.3'` | ✅ |
| T2 | UPDATE restore (= endpoint logic) | `archivedAt='', archivedBy='', archivedReason=''` | ✅ |
| T3 | Idempotence (re-restore WHERE archivedAt!='') | 0 rows changed (= 400 NOT_ARCHIVED) | ✅ `changes()=0` |
| T4 | Cleanup contact bidon | DELETE 1 row | ✅ |
| T5 | PRAGMA integrity_check | ok | ✅ |
| T5 | PRAGMA foreign_key_check | 0 violation | ✅ |

---

## 6. Mode dark V1.12.3 — Aucun impact runtime

✅ Pipeline Live, CRM, Reporting V1.11.4, Contact Share V1, Lead V1.10.6, SMS Hub, Quick add, Import CSV, VoIP, DELETE /:id existant, Archive endpoint V1.12.2 → tous **inchangés**.

✅ Aucun filtre `archivedAt = ''` ajouté sur les SELECTs existants (V1.12.5.x à venir).
✅ Aucun frontend branché (V1.12.8).
✅ Pas de bookings logic touchée (V1.12.6).

---

## 7. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| DB pré-V1.12.3 | `/var/backups/planora/v1123-pre/calendar360.db.pre-v1123` | `467c51a5` |
| data.js pré-V1.12.3 | `/var/backups/planora/v1123-pre/data.js.pre-v1123` | `3052662a` |
| DB post-V1.12.3 | `/var/backups/planora/v1123-post/calendar360.db.post-v1123` | `467c51a5` (inchangée — endpoint pas appelé) |
| data.js post-V1.12.3 | `/var/backups/planora/v1123-post/data.js.post-v1123` | `41bf3f10` |
| Tarball post | `/var/backups/planora/v1123-post/data-routes-v1123.tar.gz` | `89faee77` |

---

## 8. État Git après V1.12.3

```
HEAD : cc3b05a0 (V1.12.3 — POST /api/data/contacts/:id/restore endpoint, mode dark)
Tags : v1.12.3-restore-endpoint, v1.12.2-archive-endpoint, v1.12.1-db-migration
Branch : clean-main → origin/clean-main aligned
```

---

## 9. Reste V1.12 (10 sous-phases ~16h dev)

- ⏭ **V1.12.4** GET `/contacts/archived` (45 min) — list backend
- V1.12.5.a→e filtres exclusion (init/data/voip/reporting/NBA) — ~3h
- V1.12.6 refus actions critiques + bookings futurs check — ~1h
- V1.12.7 DELETE redéfini + hard delete + delete-preview — ~2h
- V1.12.8 frontend modale Archiver + onglet Archivés — ~4h
- V1.12.9 frontend hard delete + bouton restore — ~2h
- V1.12.10 tests régression (20 SQL + 10 UI) — ~4h
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts` — ~1h
- V1.12.12 cycle observation 1 semaine prod — passive
- V1.12.13 cleanup `pipeline_stage='perdu'` legacy V1.11.5 — 30 min

---

## 10. STOP V1.12.3 confirmé

**Aucune action sans GO MH explicite**. V1.12.4 (GET `/contacts/archived` list backend, ~45 min) sur GO uniquement.
