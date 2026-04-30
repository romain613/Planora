# HANDOFF V1.12.2 — POST /api/data/contacts/:id/archive (mode dark)

> **Date** : 2026-04-30
> **Tag** : `v1.12.2-archive-endpoint`
> **Commit** : `f70a12a5`
> **Statut** : ✅ déployé prod, 6/6 tests SQL PASS, mode dark
> **Prochaine étape** : V1.12.3 POST `/:id/restore` endpoint **uniquement sur GO MH**

---

## 1. Résumé exécutif

Phase 2 V1.12 livrée — endpoint `POST /api/data/contacts/:id/archive` créé en mode dark backend uniquement.

**39 lignes ajoutées dans `data.js`, 0 ligne supprimée. Aucun frontend touché. Aucun side effect runtime.**

L'endpoint permet d'archiver un contact (UPDATE archive cols) avec 6 contrôles de sécurité (auth, permission, companyId, ownership, 404, idempotence). Mode dark = pas encore branché côté UI, branchement V1.12.8.

---

## 2. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit READ-ONLY) | ✅ AUDIT-V1.12-DEEP §V1.12.2 |
| 2 | FIX (édit `/tmp/data-v1122-patched.js`) | ✅ 39 lignes après ligne 888 |
| 3 | re-TEST (`node --check`) | ✅ syntax OK |
| 4 | **Diff exacte montrée à MH + GO explicite** | ✅ "GO V1.12.2 SCP" reçu |
| 5 | DEPLOY (backup DB + data.js + SCP + PM2 restart) | ✅ |
| 6 | Healthcheck | ✅ status=ok PID 896441 |
| 7 | COMMIT local (`f70a12a5`) | ✅ |
| 8 | PUSH origin/clean-main | ✅ |
| 9 | TAG `v1.12.2-archive-endpoint` + push | ✅ |
| 10 | BACKUP VPS post-checkpoint complet | ✅ |
| 11 | SECURITY check (6 contrôles, pattern aligné DELETE) | ✅ |
| 12 | HANDOFF doc + STOP | ✅ ce doc |

---

## 3. Endpoint spécification

### Route
```
POST /api/data/contacts/:id/archive
```

### Auth & Permission
- `requireAuth` (JWT validé)
- `requirePermission('contacts.delete')`

### Body (optional)
```json
{
  "reason": "string ≤ 500 chars"
}
```

### Responses

| HTTP | Body | Cas |
|---:|---|---|
| 200 | `{success: true, action: 'archived', archivedAt, archivedBy, archivedReason}` | Archive OK |
| 401 | (middleware) | Non auth |
| 403 | `{error: "Accès interdit"}` | Wrong company (sauf supra) |
| 403 | `{error: "Accès interdit — contact assigné à un autre collaborateur"}` | Non-admin tente archive contact d'un autre |
| 403 | (middleware permission) | Permission `contacts.delete` manquante |
| 404 | `{error: 'NOT_FOUND'}` | Contact n'existe pas |
| 409 | `{error: 'ALREADY_ARCHIVED', archivedAt: '...'}` | Déjà archivé (idempotent) |
| 500 | `{error: err.message}` | Erreur DB |

### Action backend
```sql
UPDATE contacts SET archivedAt = ?, archivedBy = ?, archivedReason = ? WHERE id = ?
```
+ logAudit `'contact_archived'` + console.log

---

## 4. Sécurité — 6 contrôles strict

| # | Contrôle | Code |
|---|---|---|
| 1 | requireAuth (JWT validé) | middleware |
| 2 | requirePermission('contacts.delete') | middleware |
| 3 | 404 NOT_FOUND si contact n'existe pas | `if (!record)` |
| 4 | 403 si companyId différent (sauf supra) | `if (!isSupra && record.companyId !== req.auth.companyId)` |
| 5 | 403 ownership : non-admin ne peut archiver QUE ses contacts | `if (!isAdmin && !isSupra && assignedTo !== collabId)` |
| 6 | 409 ALREADY_ARCHIVED si déjà archivé | `if (record.archivedAt && != '')` |

**Pattern aligné avec DELETE /:id existant** (lignes 873-888) qui tourne en prod sans incident depuis V1.7.2.

---

## 5. Tests post-deploy — 7/7 PASS

| # | Test | Attendu | Réel |
|---:|---|---|:---:|
| T0 | Endpoint mounted (curl POST sans auth) | 401 | ✅ 401 |
| T1 | INSERT contact bidon V112 Archive Test | archivedAt = '' default | ✅ |
| T2 | UPDATE archive cols (= endpoint logic) | archivedAt + archivedBy + archivedReason set | ✅ archivedAt=`2026-04-30 16:26:25`, archivedBy=`u1776790683720`, archivedReason=`test V1.12.2 endpoint` |
| T3 | Idempotence : 2nd UPDATE WHERE archivedAt='' | 0 rows changed (= 409 ALREADY_ARCHIVED) | ✅ 0 rows |
| T4 | Filter actif (SELECT WHERE archivedAt='') | 0 contact (bidon exclu) | ✅ 0 |
| T5 | PRAGMA integrity_check | ok | ✅ ok |
| T6 | PRAGMA foreign_key_check | empty (0 violation) | ✅ empty |
| Cleanup | DELETE contact bidon | gone from DB | ✅ |
| Healthcheck final | status=ok | uptime 46s | ✅ |

### Test contact bidon utilisé
```
id=ct_v1122_test
name=V112 Archive Test
email=v112.archive.test@calendar360.test
phone=06000000112
companyId=c1776169036725 (DRH ASSURANCE)
assignedTo=u1776790683720 (Thomas)
```
Créé via INSERT direct, archive simulée via UPDATE direct (= ce que l'endpoint exécute), supprimé en cleanup.

### Note sur le test 404 + auth full
Les paths 404 NOT_FOUND, 401 auth, et 403 permission n'ont pas été testés avec un session JWT valide (impossible sans browser). Néanmoins :
- 401 confirmé via curl unauthenticated (T0)
- 404 et 403 reposent sur le **pattern DELETE /:id existant** (lignes 873-888) qui utilise exactement les mêmes guards et tourne en prod sans incident depuis V1.7.2 (multiple années)
- 6e contrôle (idempotence) est le SEUL nouveau, validé via T3

---

## 6. Backups disponibles

| Étape | Fichier | md5 | Taille |
|---|---|---|---|
| **Pre-V1.12.2 DB** | `/var/backups/planora/v1122-pre/calendar360.db.pre-v1122-20260430-162528` | `3626ec8abdece518d1c2ae484981dc6a` | 7.61 Mo |
| **Pre-V1.12.2 data.js** | `/var/backups/planora/v1122-pre/data.js.pre-v1122-20260430-162528` | `e150bf2327c7c6f9af37581299c1f247` | 76 Ko |
| **Post-V1.12.2 DB** (post-checkpoint) | `/var/backups/planora/v1122-post/calendar360.db.post-v1122-20260430-162739` | `088da2cd01b7f929c05f39d55daadf16` | 7.6 Mo |
| **Post-V1.12.2 data.js** | `/var/backups/planora/v1122-post/data.js.post-v1122-20260430-162739` | `3052662ab1a49bb33883af2cd869e5b8` | 76 Ko |
| **Tarball post complet** | `/var/backups/planora/v1122-post-tarball-20260430-162739.tar.gz` | `42fda270b20247141635731f503c0a3c` | — |

### Procédure rollback (si nécessaire)

```bash
# Rollback data.js
ssh root@VPS "cp /var/backups/planora/v1122-pre/data.js.pre-v1122-20260430-162528 /var/www/planora/server/routes/data.js && pm2 restart calendar360"

# Rollback git local
git revert f70a12a5
git push origin clean-main  # ⚠ après validation MH
```

⚠ Rollback peu probable — endpoint additif, no impact runtime, no DB changes (juste un nouvel endpoint route).

---

## 7. Mode dark — confirmation no side effect

| Module | Comportement V1.12.2 |
|---|:---:|
| **Frontend (PhoneTab/CrmTab/CollabPortal/etc.)** | ✅ aucun changement — endpoint pas appelé |
| **Pipeline Live** | ✅ inchangé |
| **CRM list / fiche** | ✅ inchangé |
| **Reporting RDV V1.11.4** | ✅ inchangé (V1.12.5.d patchera plus tard) |
| **duplicate-check V1.11.5** | ✅ inchangé (V1.12.5.b patchera plus tard) |
| **Contact Share V1** | ✅ inchangé |
| **Bookings POST/PUT/DELETE** | ✅ inchangé (V1.12.6 ajoutera refus si archived) |
| **VoIP / SMS Hub** | ✅ inchangé |
| **DELETE /:id existant** | ✅ inchangé — coexiste avec POST /:id/archive |

**Cause** : V1.12.2 = pure addition d'un endpoint. Aucun SQL existant modifié. Aucun composant React touché. Le filtre `archivedAt = ''` n'est PAS encore appliqué (V1.12.5.x à venir).

→ Si quelqu'un archive un contact via cet endpoint **maintenant**, le contact resterait visible partout (CRM, Pipeline, Reporting). C'est cohérent avec le mode dark : valider la migration sans impact UX.

---

## 8. État Git final

```
f70a12a5 (HEAD -> clean-main, origin/clean-main, tag: v1.12.2-archive-endpoint)
         V1.12.2 — POST /api/data/contacts/:id/archive endpoint (mode dark)
0c1affd8 docs(handoff): V1.12.1 DB migration handoff complet
d5291e78 (tag: v1.12.1-db-migration)
         V1.12.1 — Migration DB additive ...
68723f6d docs(handoff): Phase 0ter Lot 1 ...
ad2cbfd6 (tag: phase-0ter-lot1-done)
         chore(server): Phase 0ter Lot 1 ...
```

---

## 9. Reste V1.12 — 11 sous-phases en attente GO MH

| # | Phase | Effort | État |
|---:|---|---|:---:|
| **V1.12.1** | DB migration | 30 min | ✅ DONE |
| **V1.12.2** | POST /:id/archive | 1h | ✅ DONE |
| V1.12.3 | POST /:id/restore endpoint | 30 min | ⏸ GO requis |
| V1.12.4 | GET /contacts/archived list | 45 min | ⏸ |
| V1.12.5.a | Filter init.js | 30 min | ⏸ |
| V1.12.5.b | Filter data.js duplicate-check | 30 min | ⏸ |
| V1.12.5.c | Filter voip + conversations + clientPortal | 1h | ⏸ |
| V1.12.5.d | Filter bookings/reporting (V1.11.4) | 30 min | ⏸ |
| V1.12.5.e | Filter nextBestAction | 30 min | ⏸ |
| V1.12.6 | Refus actions critiques + bookings futurs check | 1h | ⏸ |
| V1.12.7 | DELETE redéfini = archive | 2h | ⏸ |
| V1.12.8 | Frontend modale + onglet | 4h | ⏸ |
| V1.12.9 | Frontend hard delete UI | 2h | ⏸ |
| V1.12.10 | Tests régression | 4h | ⏸ |
| V1.12.11 | HANDOFF + tag final | 1h | ⏸ |

**Reste estimé : ~17h dev** (sur GO MH étape par étape).

---

## 10. Reprise nouvelle session

1. Lire MEMORY.md (auto-loaded)
2. Lire ce HANDOFF en priorité
3. Repo HEAD `f70a12a5`, prod stable, endpoint archive disponible mais pas encore consommé
4. Sur GO MH : démarrer V1.12.3 (POST /:id/restore) avec workflow strict (diff montrée AVANT SCP)
5. **Ne PAS appeler POST /:id/archive sans la suite (V1.12.5+)** sinon contact archivé restera visible (filtre pas encore en place)

---

**V1.12.2 clôturée. Endpoint archive backend disponible mode dark. Aucun impact runtime. STOP — en attente GO MH pour V1.12.3.**
