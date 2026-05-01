# HANDOFF V1.12.x.1 — Reporting RDV clean (audit séparé)

> **Date** : 2026-05-01
> **Tag** : `v1.12.x.1-reporting-clean`
> **Commit** : `1a6b8987`
> **Statut** : ✅ déployé prod, audit ghost contacts résolu, tests SQL validés
> **Prochaine étape** : V1.12.9 frontend hard delete UI ou autre priorité MH

---

## 1. Résumé exécutif

Audit séparé V1.12 (post V1.12.8.c) : ghost contacts / bookings orphelins / Reporting RDV. Patch P1+P2 combinés sur `bookings.js` Reporting V1.11.4 endpoint.

**1 fichier modifié, 7 lignes ajoutées (5 commentaires + 2 SQL effectives). 0 modif data DB. Backup pre/post sécurisé.**

---

## 2. Diagnostic audit

### Constats critiques (état pré-patch)

| KPI | Valeur |
|---|---:|
| Total bookings | 95 |
| Bookings GHOSTS (contactId inexistant) | **33** |
| share_transfer GHOSTS | **6 sur 12 (50%)** |
| share_transfer cancelled | 10 sur 12 |
| Reporting Thomas reçus AVANT | 4 (3 ghosts + 1 active, tous cancelled) |
| Reporting Thomas transmis AVANT | 7 (mix) |

### Cause racine identifiée

1. **Pré-V1.12.7** : `DELETE /api/data/contacts/:id` faisait hard delete contact + cancel bookings (sans cleanup `contactId` orphelin)
2. **Reporting V1.11.4** (bookings.js L538-545) : pas de filtre `b.status`, pas de JOIN contacts → cancelled + ghosts visibles dans le Reporting

### V1.12.7 résolution amont
DELETE redéfini en archive + DELETE /:id/permanent admin avec cascade limitée bookings KEEP → **plus de nouveaux ghosts créés depuis 2026-05-01**.

---

## 3. Patch P1+P2 combinés

### Diff bookings.js L538-545

```diff
+    // V1.12.x.1 — clean reporting :
+    //   P1 status='confirmed' (cancelled = pas de reporting)
+    //   P2 INNER JOIN contacts (exclure ghosts hard deleted pre-V1.12.7)
+    //   PRESERVE V1.12.5.d : pas de filtre archivedAt (contacts archivés OK pour
+    //                        preserver historique reporting + capacite receiver)
     const targetCol = role === 'received' ? 'agendaOwnerId' : 'bookedByCollaboratorId';
     const rows = db.prepare(
       `SELECT b.* FROM bookings b
        JOIN calendars c ON b.calendarId = c.id
+       INNER JOIN contacts ct ON b.contactId = ct.id
        WHERE c.companyId = ?
          AND b.bookingType = 'share_transfer'
          AND b.${targetCol} = ?
+         AND b.status = 'confirmed'
        ORDER BY b.date DESC, b.time DESC`
     ).all(companyId, cid);
```

### Règle métier propre appliquée

> **Le Reporting RDV ne doit afficher que les bookings actionnables : `status='confirmed'` ET contact existant (actif OU archivé).**

| Cas | Reporting actuel |
|---|:---:|
| RDV confirmed contact actif | ✅ visible |
| RDV confirmed contact archivé | ✅ visible (V1.12.5.d préservation) |
| RDV confirmed contact ghost | ❌ masqué (orphelin) |
| RDV cancelled (peu importe contact) | ❌ masqué |
| RDV ghost cancelled | ❌ masqué |

---

## 4. Tests post-deploy — PASS

| Test | Avant patch | Après patch | Attendu |
|---|---:|---:|---|
| received_thomas | 4 | 0 | 0 (tous cancelled) ✅ |
| sent_thomas | 7 | 1 | 1 (bk1777179759409 confirmed → Ilane) ✅ |
| received_julie | 1 | 0 | 0 (cancelled) ✅ |
| Total confirmed visible | — | 2 | préservés actifs ✅ |
| Integrity check | — | ok | ✅ |
| FK violations | — | 0 | ✅ |
| Healthcheck | — | status=ok PID 950281 | ✅ |

---

## 5. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | Audit READ-ONLY (ghost diagnosis) | ✅ |
| 2 | Fix ciblé /tmp/bookings-v112x1-patched.js | ✅ |
| 3 | Test local node --check + simulation SQL | ✅ |
| 4 | **Diff exacte montrée à MH + GO explicite** | ✅ "GO V1.12.x.1 SCP" |
| 5 | Backup pré (DB + bookings.js) | ✅ md5 `b9630c8f` + `daa4e1f8` |
| 6 | SCP + PM2 restart | ✅ PID 950281 |
| 7 | Smoke HTTP + tests SQL post-deploy | ✅ status=ok uptime 20s |
| 8 | COMMIT (`1a6b8987`) | ✅ |
| 9 | PUSH origin/clean-main | ✅ |
| 10 | TAG `v1.12.x.1-reporting-clean` + push | ✅ |
| 11 | Backup post | ✅ md5 `b9630c8f` (DB inchangée) + `209cc3c3` + `e599b281` |
| 12 | HANDOFF doc + memory | ✅ |

---

## 6. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| DB pré | `/var/backups/planora/v112x1-pre/calendar360.db.pre-v112x1` | `b9630c8f` |
| bookings.js pré | `/var/backups/planora/v112x1-pre/bookings.js.pre-v112x1` | `daa4e1f8` |
| DB post | `/var/backups/planora/v112x1-post/calendar360.db.post-v112x1` | `b9630c8f` (inchangée) |
| bookings.js post | `/var/backups/planora/v112x1-post/bookings.js.post-v112x1` | `209cc3c3` |
| Tarball | `/var/backups/planora/v112x1-post/bookings-routes-v112x1.tar.gz` | `e599b281` |

---

## 7. État Git après V1.12.x.1

```
HEAD : 1a6b8987 (V1.12.x.1 — Reporting RDV clean)
Tags V1.12 (16) :
  v1.12.1-db-migration             v1.12.2-archive-endpoint
  v1.12.3-restore-endpoint         v1.12.4-archived-list
  v1.12.5a-filter-init             v1.12.5b-filter-duplicate
  v1.12.5c-filter-services         v1.12.5d-filter-bookings-dedup
  v1.12.5e-filter-nba              v1.12.6-refuse-archived-actions
  v1.12.7-delete-redefined         v1.12.8a-archive-ui-rename
  v1.12.8a-fixup-bulk-archive      v1.12.8b-archived-subtab
  v1.12.8c-readonly-locked         v1.12.x.1-reporting-clean ← NEW
Branch : clean-main → origin/clean-main aligned
```

---

## 8. Reste V1.12

✅ V1.12.8 phase complète terminée (a/fixup/b/c)
✅ V1.12.x.1 audit ghost contacts résolu
- ⏭ V1.12.9 frontend hard delete + bouton "Supprimer définitivement" admin (~2h)
- V1.12.10 tests régression (~4h)
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts`

---

## 9. Note dette résiduelle (non bloquante)

🟡 **33 bookings GHOSTS** restent en DB (option A retenue) :
- Filtrage UI les masque dans Reporting V1.12.x.1
- Pas d'impact runtime (silent)
- Cleanup destructif optionnel V1.12.x.2 fixup si MH veut DB plus propre :
  ```sql
  DELETE FROM bookings WHERE contactId != '' AND contactId NOT IN (SELECT id FROM contacts);
  ```
- À programmer séparément si besoin

---

## 10. Tests UI fonctionnels MH

| # | Test | Étapes | Attendu |
|---|---|---|---|
| F1 | Reporting Thomas reçus | Login Thomas → Reporting RDV → onglet "Reçus" | 0 RDV (tous cancelled/ghosts masqués) |
| F2 | Reporting Thomas transmis | onglet "Transmis" | 1 RDV (test002 → Ilane confirmed) |
| F3 | Reporting Julie reçus | Login Julie → onglet "Reçus" | 0 RDV |
| F4 | Création nouveau share_transfer | Thomas transmet RDV à Julie | RDV apparaît immédiatement chez Julie reçus + Thomas transmis |
| F5 | Annulation share_transfer | Cancel un RDV transmis | Disparaît du Reporting des 2 collabs |
| F6 | Régression Pipeline Live | Affichage RDV agenda | Inchangé |
| F7 | Régression Agenda | Vue jour/semaine | Inchangée |

---

## 11. STOP V1.12.x.1 confirmé

**Aucune action sans GO MH explicite**.

Audit ghost contacts résolu sans toucher la DB (cleanup non-destructif). Reporting RDV désormais propre. Prochaine étape : tests UI MH puis GO V1.12.9 (hard delete UI) ou autre priorité.
