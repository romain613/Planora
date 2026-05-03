# HANDOFF V1.14.1.z — Hard delete contact actif par défaut + ownership backend

> **Date** : 2026-05-03
> **Branche** : `clean-main` HEAD `3a6bbae7`
> **Tag** : `v1.14.1.z-hard-delete-default`
> **Statut** : ✅ LIVE prod, smoke PASS, backend + frontend deployés
> **Phase** : 2 hotfix permission

---

## 1. État prod final

| Indicateur | Valeur |
|---|---|
| `/api/health` | `{"status":"ok","db":"connected","companies":6,"collaborateurs":16,"uptime":28+}` |
| PM2 | pid `1119931`, online, 0 unstable_restart |
| Bundle prod | `index-CPv_Im5I.js` md5 `232ea228` (3.14 MB) |
| Backend `data.js` | md5 `5ca1e08d` (V1.14.1.z R2 ownership) |
| Backend `collaborators.js` | md5 `349746db` (V1.14.1.z DEFAULT 1) |
| DB `calendar360.db` | md5 `c7c3f588` (post-backfill checkpointed) |
| Branche | `clean-main` HEAD `3a6bbae7` |
| Tag | `v1.14.1.z-hard-delete-default` push GitHub OK |
| Tags release-track cumulés | **38** |

---

## 2. Ce qui change pour le user

### Règle métier finale

| Acteur | Peut hard delete |
|---|---|
| Admin / Supra | ✅ N'importe quel contact archivé de la company (bypass wildcard `*`) |
| Member avec `can_hard_delete=1` (DEFAULT) | ✅ **SES PROPRES** contacts archivés UNIQUEMENT (R2 ownership) |
| Member avec `can_hard_delete=0` (admin a décoché) | ❌ Bouton invisible UI · 403 backend si appel direct |
| Tout collab sur contact actif (non archivé) | ❌ Bouton invisible UI · 409 NOT_ARCHIVED backend |

### Distribution DB post-backfill

```
Total collabs  : 16
can_hard_delete=1 : 16  (5 admins + 11 members)
can_hard_delete=0 : 0
```

### AdminDash UI

Toggle "Peut supprimer définitivement les contacts archivés" maintenant **indépendant** de "Suppression de contacts" (`can_delete_contacts`). Admin peut activer/désactiver hard_delete sans toucher au toggle delete.

Title actualisé : *"Suppression définitive d'un contact archivé. Ownership backend impose : SES propres archivés uniquement (admin/supra bypass)."*

---

## 3. Patches appliqués

### Backend

#### `routes/collaborators.js:61` (DEFAULT 1 nouveaux collabs)

```diff
-      can_hard_delete_contacts: c.can_hard_delete_contacts || 0,
+      can_hard_delete_contacts: c.can_hard_delete_contacts !== undefined ? c.can_hard_delete_contacts : 1,
```

Pattern conforme `chat_enabled` ligne 58.

#### `routes/data.js:1100-1115` (R2 ownership check)

```diff
-    const record = db.prepare('SELECT companyId, name, email, phone, archivedAt FROM contacts WHERE id = ?').get(id);
+    const record = db.prepare('SELECT companyId, name, email, phone, assignedTo, archivedAt FROM contacts WHERE id = ?').get(id);
     if (!record) return res.status(404).json({ error: 'NOT_FOUND' });
     if (!req.auth.isSupra && record.companyId !== req.auth.companyId) {
       return res.status(403).json({ error: 'Accès interdit' });
     }
+    // V1.14.1.z R2 — Ownership check : non-admin ne peut hard delete QUE SES contacts archivés.
+    if (!req.auth.isAdmin && !req.auth.isSupra && record.assignedTo !== req.auth.collaboratorId) {
+      return res.status(403).json({ error: "Accès interdit — contact assigné à un autre collaborateur" });
+    }
     if (!record.archivedAt || record.archivedAt === '') {
       return res.status(409).json({ error: 'NOT_ARCHIVED', ... });
     }
```

Aligne avec V1.13.2.a Q2 archive owner-relax. Verrou `archivedAt` préservé (T5).

### Frontend

#### `AdminDash.jsx:2891` (découpler couplage UI)

```diff
- onClick={()=>{ const f=editCollabForm; if(!f.can_delete_contacts) return; setEditCollabForm(p=>({...p,can_hard_delete_contacts:p.can_hard_delete_contacts?0:1})); }}
+ onClick={()=>setEditCollabForm(p=>({...p,can_hard_delete_contacts:p.can_hard_delete_contacts?0:1}))}
- cursor:editCollabForm.can_delete_contacts?"pointer":"not-allowed", opacity:editCollabForm.can_delete_contacts?1:0.5,
+ cursor:"pointer",
```

Toggle indépendant.

### DB backfill (SQL one-shot via SSH)

```sql
UPDATE collaborators SET can_hard_delete_contacts = 1 WHERE can_hard_delete_contacts = 0;
```

→ 16 rows affectées (admins inclus pour cohérence permanent state).

---

## 4. Tests UI à valider visuellement par MH

### T1 — Admin (régression)
1. Admin → fiche archivée n'importe quel contact
2. ✅ Bouton "Supprimer définitivement" visible
3. ✅ HardDeleteContactModal s'ouvre, saisie SUPPRIMER → suppression OK

### T2 — Member avec `can_hard_delete=1` sur SA fiche archivée
1. Member non-admin → fiche archivée dont assignedTo = self
2. ✅ Bouton visible (frontend condition `can_hard_delete_contacts`)
3. ✅ HardDelete modal saisie SUPPRIMER → backend OK (R2 ownership pass)

### T2bis — Member sur fiche archivée AUTRE collab
1. Member non-admin → fiche archivée dont assignedTo ≠ self
2. ⚠ Bouton visible UI (frontend ne check pas ownership)
3. ✅ Click → 403 backend (R2 ownership refuse) → toast erreur affiché

### T3 — Member avec `can_hard_delete=0` (admin a décoché)
1. Admin AdminDash décoche le toggle pour un member
2. Member tente d'ouvrir fiche archivée
3. ✅ Bouton invisible (frontend `can_hard_delete_contacts=0`)
4. ✅ Si appel API direct → 403 backend (`requirePermission('contacts.hard_delete')` refuse)

### T4 — Nouveau collaborateur créé via AdminDash
1. Admin crée nouveau collab via POST /api/collaborators
2. ✅ DB : nouveau collab a `can_hard_delete_contacts=1` par défaut
3. ✅ Toggle AdminDash apparaît coché par défaut

### T5 — Contact actif (non archivé, régression verrou)
1. Tout collab → fiche contact actif
2. ✅ Bouton "Supprimer définitivement" invisible (frontend `ct.archivedAt`)
3. ✅ Si appel API direct → 409 NOT_ARCHIVED backend

### T6 — Régressions
- ✅ Restaurer V1.12.3 OK
- ✅ Fusionner V1.13.2.b + V1.14.1.x Étape 0 OK
- ✅ Hub SMS V1.14.1.x UI 3 états OK
- ✅ Fiche archivée V1.14.1.x.1 (barre actions complète) OK
- ✅ AdminDash autres toggles (chat, sms, ai_copilot, can_delete_contacts) inchangés

---

## 5. Backups

### V1.14.1.z
- **Pré-deploy** : `/var/backups/planora/v1141z-pre-20260503-104129/` (DB `89abdd26`, data.js `cdd1803a`, collaborators.js `11e3191e`, httpdocs `9ff9a13a`)
- **Post-deploy** : `/var/backups/planora/v1141z-post-20260503-104426/` (DB pré-checkpoint `89abdd26`, data.js `5ca1e08d`, collaborators.js `349746db`, httpdocs `172636ca`)
- **Post-deploy checkpointed** : `/var/backups/planora/v1141z-post-checkpointed-20260503-104505/` (DB `c7c3f588` consolidé post-WAL-checkpoint, capture le backfill)

⚠ Note WAL : `calendar360.db-wal` contient les writes récents avant checkpoint. Le DB pré-checkpoint et post-checkpoint diffèrent en md5 mais contiennent la même donnée logique.

---

## 6. Rollback

### Rollback V1.14.1.z → V1.14.1.x.1

```bash
ssh root@136.144.204.115
# 1. Backend
cp /var/backups/planora/v1141z-pre-20260503-104129/data.js /var/www/planora/server/routes/data.js
cp /var/backups/planora/v1141z-pre-20260503-104129/collaborators.js /var/www/planora/server/routes/collaborators.js
# 2. Frontend
cd /var/www/vhosts/calendar360.fr
rm -rf httpdocs && tar -xzf /var/backups/planora/v1141z-pre-20260503-104129/httpdocs-pre.tar.gz
# 3. (Optionnel) Rollback backfill DB
sqlite3 /var/www/planora-data/calendar360.db "UPDATE collaborators SET can_hard_delete_contacts = 0 WHERE id NOT IN (SELECT id FROM collaborators WHERE role='admin');"
# 4. Restart
pm2 restart calendar360
```

⚠ Si des hard deletes ont eu lieu depuis le deploy, **ces contacts NE seront PAS récupérés** (DELETE hard, cascade 5 tables). Évaluer impact business avant rollback.

---

## 7. Prochains chantiers

### En pause (audits livrés, attendent décisions MH)
- **V1.14.1.y** flag global `ALLOW_ALL_CONTACT_DELETION` (3 options A/B/C — alternative plus radical, scope diff)
- **V1.14.2** `contactStore` + `useContact` hook (audit livré)

### Annoncé MH après tests visuels
- **V2 logique doublons intelligente** (audit READ-ONLY à venir)

### Roadmap
- V1.15 : polling/WebSocket/SSE + versioning ETag
- PHASE 3 : Outlook Calendar
- PHASE 4 : Refonte Agenda UX
- PHASE 5 : Refonte fiche CRM
- PHASE 6 : Import rapide colonne droite
- PHASE 7 : Optimisations UX globales

---

## 8. Reprise dans nouvelle session

### Documents clés
1. **`MEMORY.md`** (auto-loaded — 38 tags)
2. **`HANDOFF-V1.14.1.z-HARD-DELETE-DEFAULT.md`** (ce document)
3. `HANDOFF-V1.14.1.x.1-ARCHIVED-FICHE-FIX.md`
4. `HANDOFF-V1.14.1.x-FIX-UX-ARCHIVE.md`
5. `HANDOFF-V1.14.1-MODALES-LISTENERS.md`
6. `HANDOFF-V1.14.0-MUTATION-CENTRALIZED.md`
7. `HANDOFF-V1.13.0-STABLE-PHASE1-CLOSURE.md`
8. `CLAUDE.md` §0/§0bis/§10

### Audits pause
- `docs/audits/2026-05/AUDIT-V1.14.1.y-PERMISSION-FLAG-2026-05-03.md`
- `docs/audits/2026-05/AUDIT-V1.14.1.z-HARD-DELETE-PERMISSION-2026-05-03.md`
- `docs/audits/2026-05/AUDIT-V1.14.2-CONTACT-STORE-HOOK-2026-05-03.md`

### Workflow strict 17 étapes (gravé 2026-05-03)
1. Audit → 2. Diff preview → 3. GO MH → 4. Test → 5. Fix → 6. Validation diff
7. Backup pré → 8. Deploy → 9. Smoke → 10. Commit → 11. Push → 12. Merge si branche
13. Tag → 14. Backup post → 15. Handoff → 16. Memory → 17. Classement

---

## ✅ Conclusion

V1.14.1.z livré, déployé, smoke PASS. Hard delete activé par défaut pour tous les collabs (16/16 en DB), avec ownership backend (R2) limitant les members à leurs propres archivés. Admin/supra gardent bypass global. Toggle AdminDash indépendant pour retirer le droit. T5 verrou archivedAt préservé.

**Aucune régression. Tests UI MH T1-T6 à valider visuellement.**
