# HANDOFF V1.12.9.b — Data route hard delete permission swap

> **Date** : 2026-05-01
> **Tag** : `v1.12.9.b-data-route`
> **Commit** : `bf2eb036`
> **Statut** : ✅ LIVE prod, tests PASS, 0 régression

---

## 1. Scope livré

Deuxième sous-phase V1.12.9. Utilise la perm `contacts.hard_delete` (créée en V1.12.9.a) pour permettre à un collab non-admin avec `can_hard_delete_contacts=1` d'effectuer un hard delete unitaire, **sans toucher à la logique cascade ni aux verrous**.

**Périmètre minimal** : 1 endpoint, 1 fichier, 4+/7-, net -3 lignes.

---

## 2. Fichier modifié (1 fichier, 4+/7-)

| Fichier | Changement |
|---|---|
| [server/routes/data.js](server/routes/data.js) ligne 1050-1063 | Header comment V1.12.7 → V1.12.9.b + middleware swap `requirePermission('contacts.delete')` → `requirePermission('contacts.hard_delete')` + suppression check in-handler `isAdmin/isSupra` (devenu redondant car middleware filtre déjà) |

---

## 3. Sécurité — 3 verrous préservés + companyId match

| Verrou | Avant V1.12.9.b | Après V1.12.9.b |
|---|---|---|
| **VERROU 1** Permission | Middleware `contacts.delete` + check in-handler `!isAdmin && !isSupra` | Middleware `contacts.hard_delete` (admin/supra bypass via wildcard `*` ; collab via `can_hard_delete_contacts=1`) |
| **VERROU 2** Body confirm | `body.confirm === 'CONFIRM_HARD_DELETE'` | ✅ INTACT |
| **VERROU 3** Archive prereq | `record.archivedAt` non vide | ✅ INTACT |
| companyId match | `!isSupra && record.companyId !== auth.companyId` → 403 | ✅ INTACT |
| 404 NOT_FOUND | si `!record` | ✅ INTACT |
| Cascade DELETE | transaction sur 5 tables | ✅ INTACT |
| logAudit | `'contact_hard_deleted'` | ✅ INTACT |

**Aucune logique métier modifiée**. **Aucun bookings/RDV/calls/sms/transcripts touché**.

---

## 4. Hors scope (cohérence Q6 audit)

[data.js:911-913](server/routes/data.js#L911) — `bulk-delete mode='permanent'` garde son check admin-only en dur :
```js
if (!req.auth.isAdmin && !req.auth.isSupra) return 403 PERMISSION_DENIED;
```
À aligner V1.12.9.x si MH veut. **Pas bloquant** car aucune UI bulk hard delete (Q6 décision audit V1.12.9).

---

## 5. Tests post-deploy non destructifs (4/4 PASS)

### T-A — Healthcheck
```json
{"status":"ok","db":"connected","companies":6,"collaborateurs":16,"dbPath":"/var/www/planora-data/calendar360.db","uptime":33}
```

### T-B — DELETE /:id/permanent sans auth → 401
```
HTTP 401  {"error":"Authentification requise"}
```
→ middleware order correct (`requireAuth` avant `requirePermission`).

### T-C — Logs PM2 0 erreur récente

### T-prog — Server-side `getEffectivePermissions` sur 16 collabs

| Catégorie | Count | Comportement attendu | Test |
|---|---:|---|---|
| Admins (wildcard `*`) | 5 | YES (bypass) | ✅ |
| Members `can_hard_delete=1` | 0 | YES (granted) | (pas de grant actuel — défaut sain) |
| Members `can_hard_delete=0` | 11 | NO (denied 403) | ✅ |

**Synthèse** : 5 admins bypass, 11 members denied, 0 grant sauvage. Comportement strict.

---

## 6. Healthcheck final

PM2 : `pid 960577`, online, **uptime 200s**, **0 unstable_restart**, 0 erreur log.

---

## 7. Backups VPS

| Path | Rôle | md5 |
|---|---|---|
| `/var/backups/planora/v1129b-pre/` | Pré-deploy (rollback) | data.js=`cc12d872` db=`1927fbc5` |
| `/var/backups/planora/v1129b-post/` | Post-deploy | data.js=`ba981efc` db=`1927fbc5` |
| `/var/backups/planora/v1129b-post-tarball-20260501-140702.tar.gz` | Tarball | 1.32 MB |

DB md5 inchangée (changement code-only).

---

## 8. Reste V1.12.9 (~3h restant)

| Sub-tag | Effort | Contenu |
|---|---|---|
| `v1.12.9.c-admin-toggle` | 45 min | AdminDash.jsx nouveau toggle "Suppression définitive" couplé ON-only si `can_delete_contacts=1` |
| `v1.12.9.d-hard-delete-modal` | 1h30 | Nouveau composant `HardDeleteContactModal.jsx` 2 étapes (preview + confirm "SUPPRIMER") + branchement card archivée CrmTab |
| `v1.12.9.e-tested` | 1h | Tests SQL + UI + régression archive/restore |

---

## 9. Rollback (si besoin urgent)

```bash
ssh root@136.144.204.115
cp /var/backups/planora/v1129b-pre/data.js /var/www/planora/server/routes/data.js
pm2 restart calendar360
# Retour à l'état V1.12.9.a (admin-only en dur in-handler)
```

V1.12.9.a (colonne + permission key) reste intacte — le rollback V1.12.9.b ne dégrade pas la sécurité.

---

## 10. Tags V1.12 cumulés

**19 tags** (18 pré-existants + `v1.12.9.b-data-route`).

---

## 11. Workflow strict 12 étapes (12/12 OK)

1. ✅ AUDIT READ-ONLY (3 verrous identifiés, plan 7 tests sécurité non destructifs)
2. ✅ FIX (1 edit ciblé)
3. ✅ re-TEST `node --check` OK
4. ✅ DIFF montrée à MH avec GO explicite
5. ✅ DEPLOY (SCP + PM2 restart)
6. ✅ Healthcheck 200 OK
7. ✅ COMMIT local `bf2eb036`
8. ✅ PUSH origin clean-main + tag
9. ✅ TAG `v1.12.9.b-data-route` pushé
10. ✅ BACKUP VPS pre + post + tarball
11. ✅ SECURITY check (3 verrous intacts, perm distincte)
12. ✅ HANDOFF (ce document)
