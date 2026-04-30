# HANDOFF V1.12.5.a — Filter init.js (premier impact runtime)

> **Date** : 2026-04-30
> **Tag** : `v1.12.5a-filter-init`
> **Commit** : `9e0482f3`
> **Statut** : ✅ déployé prod, 5/5 tests SQL PASS, **premier impact runtime perceptible**
> **Prochaine étape** : V1.12.5.b filter data.js duplicate-check (4 SQL) **uniquement sur GO MH**

---

## 1. Résumé exécutif

Premier patch **runtime perceptible** de la phase V1.12 (fin du mode dark). Les contacts archivés disparaissent du payload `/api/init` → CRM list, Pipeline Live, AdminDash, vues admin/supra.

**2 lignes modifiées dans `init.js`, 0 ligne ajoutée, 0 supprimée. Filtre à la source.**

---

## 2. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit READ-ONLY init.js cartographie) | ✅ 7 références contacts cartographiées |
| 2 | FIX (édit `/tmp/init-v1125a-patched.js`) | ✅ 2 lignes (L121 + L259) |
| 3 | re-TEST (`node --check`) | ✅ syntax OK |
| 4 | **Diff exacte montrée à MH + GO explicite** | ✅ "GO V1.12.5.a SCP" reçu |
| 5 | DEPLOY (backup DB + init.js + SCP + PM2 restart) | ✅ PID 903308 |
| 6 | Healthcheck | ✅ status=ok |
| 7 | COMMIT local (`9e0482f3`) | ✅ |
| 8 | PUSH origin/clean-main | ✅ |
| 9 | TAG `v1.12.5a-filter-init` + push | ✅ |
| 10 | BACKUP VPS post-checkpoint | ✅ |
| 11 | SECURITY check (filtre stricte, propagation auto) | ✅ |
| 12 | HANDOFF doc + STOP | ✅ ce doc |

---

## 3. Patch spécification

### Fichier
`server/routes/init.js` (392 lignes, in-place modification)

### Diff exacte

```diff
@@ -121 +121 @@
-    const contacts = getByCompany('contacts', companyId);
+    const contacts = getByCompany('contacts', companyId).filter(c => !c.archivedAt || c.archivedAt === ''); // V1.12.5.a — exclusion archivés

@@ -259 +259 @@
-      const allContacts = getAll('contacts').map(ct => ({
+      const allContacts = getAll('contacts').filter(c => !c.archivedAt || c.archivedAt === '').map(ct => ({ // V1.12.5.a — exclusion archivés cross-company
```

### Filtre logique

`!c.archivedAt || c.archivedAt === ''` capture **3 cas** :
- `archivedAt === null`
- `archivedAt === undefined`
- `archivedAt === ''` (DEFAULT V1.12.1)

→ Cohérent avec migration additive V1.12.1 (DEFAULT '').

### Propagation automatique vérifiée

| Ligne | Code | Impact |
|---:|---|---|
| L265 | `contacts` (supra payload) | filtré ✅ |
| L268 | `allContacts` (supra cross-company) | filtré ✅ |
| L279 | `contacts` (admin payload) | filtré ✅ |
| L337 | `console.log filtering ${contacts.length}` | log count post-filter ✅ |
| L338 | `contacts.filter(c => assignedTo OR shared_with)` (collab base) | filtré ✅ |
| L363 | `contacts: myContacts` (collab payload) | filtré ✅ |

---

## 4. Impact runtime — premier saut perceptible

### Modules affectés (intentionnel)

| Module | Comportement après V1.12.5.a |
|---|---|
| **CRM list** | Archivés disparaissent du listing (cohérent V1.12) |
| **Pipeline Live** | Archivés disparaissent du kanban |
| **AdminDash table contacts** | Archivés disparaissent (admin/supra) |
| **Pipeline shared_with** | Si contact partagé archivé chez l'owner → disparaît chez les shared |

### Modules NON affectés (garde-fou)

| Module | Pourquoi pas affecté |
|---|---|
| **Agenda / Bookings** | Bookings chargés L250 sans JOIN contacts (champs `visitorName/Email/Phone` snapshot) |
| **Reporting RDV V1.11.4** | Route séparée `/api/bookings/reporting`, n'utilise pas init.js |
| **GET `/api/data/contacts/:id`** | Route directe data.js, pas affectée par filtre init |
| **VoIP `/api/voip/lookup`** | Route séparée voip.js (V1.12.5.c à venir) |
| **Conversations / SMS Hub** | Route séparée conversations.js (V1.12.5.c à venir) |
| **Custom fields** | Route séparée |
| **`pipeline_stage='perdu'` legacy V1.11.5** | Filtres séparés dans data.js POST/check-duplicate |

---

## 5. Tests post-deploy — 5/5 PASS

| # | Test | Attendu | Réel |
|---:|---|---|:---:|
| Healthcheck | `/api/health` | status=ok | ✅ uptime 25s |
| Verif code source prod | grep `V1.12.5.a` init.js | L121 + L259 patchées | ✅ |
| T0 baseline | count cap actifs vs archivés | 184 actifs / 0 archivés (clean state) | ✅ |
| T2 raw count (avant filter) | INSERT 2 → count company=cap LIKE ct_v1125a | 2 | ✅ |
| T3 filtered active (= simulation `.filter(!archivedAt)`) | 1 row (actif uniquement) | ✅ `ct_v1125a_actif` |
| T4 filtered excluded | 1 row (archivé bien exclu) | ✅ `ct_v1125a_archived` archivedAt=`2026-04-30 19:00:00` |
| Cleanup | DELETE 2 contacts test | 2 rows | ✅ |
| PRAGMA integrity_check | ok | ✅ |
| PRAGMA foreign_key_check | 0 violation | ✅ |

---

## 6. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| DB pré-V1.12.5.a | `/var/backups/planora/v1125a-pre/calendar360.db.pre-v1125a` | `c8bed853` |
| init.js pré-V1.12.5.a | `/var/backups/planora/v1125a-pre/init.js.pre-v1125a` | `e8321c16` |
| DB post-V1.12.5.a | `/var/backups/planora/v1125a-post/calendar360.db.post-v1125a` | `c8bed853` (inchangée) |
| init.js post-V1.12.5.a | `/var/backups/planora/v1125a-post/init.js.post-v1125a` | `29a492d6` |
| Tarball post | `/var/backups/planora/v1125a-post/init-routes-v1125a.tar.gz` | `a87f9045` |

---

## 7. État Git après V1.12.5.a

```
HEAD : 9e0482f3 (V1.12.5.a — Filter init.js exclude archived contacts)
Tags V1.12 : v1.12.1-db-migration, v1.12.2-archive-endpoint,
             v1.12.3-restore-endpoint, v1.12.4-archived-list,
             v1.12.5a-filter-init
Branch : clean-main → origin/clean-main aligned
```

---

## 8. Reste V1.12 (8 sous-phases ~14h dev)

- ⏭ **V1.12.5.b** Filter data.js duplicate-check (4 SQL) — 30 min
- V1.12.5.c Filter voip + conversations + clientPortal (3 SQL) — 1h
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

## 9. Validation suggérée côté MH (smoke test UI)

Pour confirmer le comportement runtime sur prod (optionnel) :
1. Connecté en tant que Thomas (collab)
2. Ouvrir CRM → noter un contact existant
3. Sur prod, exécuter (en SSH) :
   ```bash
   sqlite3 /var/www/planora-data/calendar360.db "UPDATE contacts SET archivedAt='2026-04-30 19:30:00', archivedBy='u1776790683720' WHERE id='<contact_id>'"
   ```
4. Reload page CRM → contact disparaît
5. Restore via SQL : `UPDATE contacts SET archivedAt='', archivedBy='' WHERE id='<contact_id>'`
6. Reload → contact réapparaît

(L'endpoint UI archive/restore arrive en V1.12.8/V1.12.9 — d'ici là, tests via SQL direct.)

---

## 10. STOP V1.12.5.a confirmé

**Aucune action sans GO MH explicite**.

V1.12 est entré en phase **runtime impact**. Prochain saut V1.12.5.b = filtres duplicate-check dans data.js (4 SQL) — empêche un contact archivé d'être détecté comme doublon lors d'imports CSV / création.
