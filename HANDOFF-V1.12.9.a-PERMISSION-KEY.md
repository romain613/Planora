# HANDOFF V1.12.9.a — Permission key contacts.hard_delete

> **Date** : 2026-05-01
> **Tag** : `v1.12.9.a-permission-key`
> **Commit** : `bcf63430`
> **Statut** : ✅ LIVE prod, tests PASS, 0 régression

---

## 1. Scope livré

Première sous-phase V1.12.9 frontend hard delete UI. **Backend uniquement** — préparation de la permission distincte `contacts.hard_delete` séparée de `contacts.delete`.

**Aucun endpoint hard delete touché à ce stade**. Aucune suppression réelle. Aucune table métier touchée hors la colonne additive `collaborators.can_hard_delete_contacts`.

---

## 2. Fichiers modifiés (3 fichiers, 8+/4-)

| Fichier | Changement |
|---|---|
| [server/middleware/permissions.js](server/middleware/permissions.js) | `ALL_PERMISSIONS` += `'contacts.hard_delete'` ligne 13 + lecture toggle legacy `can_hard_delete_contacts` dans `getDefaultMemberPermissions` lignes 56-58 |
| [server/db/database.js](server/db/database.js) | Migration additive idempotente ligne 343-344 : `ALTER TABLE collaborators ADD COLUMN can_hard_delete_contacts INTEGER DEFAULT 0` (pattern V1.12.1) |
| [server/routes/collaborators.js](server/routes/collaborators.js) | Ligne 61 output mapping POST + ligne 161 `allowedFields` PUT + ligne 201 `trackChanges` audit field-level |

---

## 3. Sécurité préservée (3 verrous DELETE /:id/permanent intacts)

1. **Verrou 1** : `if (!req.auth.isAdmin && !req.auth.isSupra) return 403` — admin/supra hardcoded ([data.js:1061](server/routes/data.js#L1061))
2. **Verrou 2** : `body.confirm === 'CONFIRM_HARD_DELETE'` requis ([data.js:1064](server/routes/data.js#L1064))
3. **Verrou 3** : `record.archivedAt` non vide requis ([data.js:1072](server/routes/data.js#L1072))

Wildcard admin `*` couvre automatiquement la nouvelle perm via [permissions.js:122](server/middleware/permissions.js#L122). Aucune régression sur `can_delete_contacts` (les 4 collabs avec `can_delete=1` gardent leur droit Archiver intact).

---

## 4. Workflow strict 12 étapes (12/12 OK)

1. ✅ AUDIT READ-ONLY (R9 vérifié — `/api/init` passthrough automatique via `SELECT *` + `parseRow` spread)
2. ✅ FIX (5 edits ciblés, 3 fichiers)
3. ✅ re-TEST `node --check` (3/3 OK)
4. ✅ DIFF montrée à MH avec GO explicite
5. ✅ DEPLOY (SCP + PM2 restart)
6. ✅ Healthcheck `GET /api/health` 200 OK
7. ✅ COMMIT local `bcf63430`
8. ✅ PUSH origin clean-main + tag
9. ✅ TAG `v1.12.9.a-permission-key` pushé
10. ✅ BACKUP VPS pre + post
11. ✅ SECURITY check (3 verrous intacts, wildcard admin auto, perm distincte)
12. ✅ HANDOFF (ce document)

---

## 5. Tests post-deploy (4/4 PASS)

### T1 — Colonne ajoutée (PRAGMA table_info)
```sql
SELECT name FROM PRAGMA_TABLE_INFO('collaborators') WHERE name LIKE '%can_%delete%';
-- can_delete_contacts (cid 48)
-- can_hard_delete_contacts (cid 59) ✅
```

### T2 — Distribution actuelle (16 collabs)
- 4 collabs avec `can_delete_contacts=1` : Hiba, Julie DRH, Jordan, Melissa DRH
- **16 collabs avec `can_hard_delete_contacts=0` (default sain)** ✅
- Aucun grant sauvage

### T3 — Intégrité DB
- `PRAGMA integrity_check` : ok ✅
- `PRAGMA foreign_key_check` : 0 violation ✅

### T4 — `/api/init` route alive
- HTTP 401 sans auth (comportement attendu)
- Chain validée : `getByCompany('collaborators')` → `SELECT *` → `parseRow` spread → la nouvelle colonne est dans le payload

---

## 6. Healthcheck final

```json
{"status":"ok","db":"connected","companies":6,"collaborateurs":16,"dbPath":"/var/www/planora-data/calendar360.db","uptime":26}
```

PM2 : `pid 958842`, online, 0 unstable_restart, 0 erreur log.

---

## 7. Backups VPS

| Path | Rôle | md5 |
|---|---|---|
| `/var/backups/planora/v1129a-pre/` | Pré-deploy (rollback) | permissions=`6ad6e137` database=`67ce4a6d` collaborators=`bb9f87a5` db=`23f23d4e` |
| `/var/backups/planora/v1129a-post/` | Post-deploy (état actuel) | permissions=`7cbfa416` database=`3cf0ec67` collaborators=`11e3191e` db=`23f23d4e` |
| `/var/backups/planora/v1129a-post-tarball-20260501-131941.tar.gz` | Tarball complet | 1.3 MB |

**Note** : md5 DB pre = post car ALTER TABLE WAL non checkpointé. Idempotence garantit même résultat au prochain reboot. Schema runtime contient bien la colonne (T1 PASS).

---

## 8. Reste V1.12.9 (post-validation MH)

| Sub-tag | Effort | Contenu |
|---|---|---|
| `v1.12.9.b-data-route` | 15 min | Swap `requirePermission('contacts.delete')` → `'contacts.hard_delete'` sur DELETE /:id/permanent + bulk-delete mode permanent |
| `v1.12.9.c-admin-toggle` | 45 min | AdminDash.jsx nouveau toggle "Suppression définitive" couplé ON-only si `can_delete_contacts=1` |
| `v1.12.9.d-hard-delete-modal` | 1h30 | Nouveau composant `HardDeleteContactModal.jsx` 2 étapes (preview + confirm "SUPPRIMER") + branchement card archivée CrmTab |
| `v1.12.9.e-tested` | 1h | Tests SQL + UI + régression archive/restore |

**Total restant : ~3h30**.

---

## 9. Points d'attention

- **Cache permissions 60s** : tout nouveau toggle prendra effet ≤60s côté membres custom roles. Documenté Q8 audit. Pas d'invalidation explicite dans cette phase.
- **Couplage UI hard ⊆ soft** : sera implémenté V1.12.9.c (toggle "Suppression définitive" disabled tant que `can_delete_contacts=0`). Backend reste défensif via verrou archived prereq.
- **Wildcard admin** : admin/supra ont automatiquement `contacts.hard_delete` via `*`. Pas besoin de toggle pour eux.

---

## 10. Rollback (si besoin urgent)

```bash
ssh root@136.144.204.115
cp /var/backups/planora/v1129a-pre/permissions.js /var/www/planora/server/middleware/permissions.js
cp /var/backups/planora/v1129a-pre/database.js /var/www/planora/server/db/database.js
cp /var/backups/planora/v1129a-pre/collaborators.js /var/www/planora/server/routes/collaborators.js
pm2 restart calendar360
# La colonne can_hard_delete_contacts reste en DB (additive, sans impact si non lue)
```

Pas besoin de DROP COLUMN — la colonne reste inerte si le code ne la lit pas. Migration complètement réversible côté code.

---

## 11. Tags V1.12 cumulés

**18 tags** (17 pré-existants + `v1.12.9.a-permission-key`).
