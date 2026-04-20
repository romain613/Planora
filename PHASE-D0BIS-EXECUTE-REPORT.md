# PHASE D-0bis — Cleanup historical FK violations + missing placeholder (2026-04-20)

> Périmètre : monolithe + CapFinances tenant.
> Objectif : ramener à **0 violation FK** sur les 3 DBs + harmoniser le placeholder `__deleted__`.
> Statut : **✅ SUCCESS** — `total_fk_violations = 0` confirmé par re-audit indépendant.

---

## 1. Backup pré-D-0bis (triple-redondance)

| Item | Valeur |
|---|---|
| Fichier | `db-phaseD0bis-pre-20260420-045527.tar.gz` |
| Taille | 1.3 MB |
| **SHA-256** | `a194e0ba9298fb7bfe80508c147e2c16f57c103eea29a3476baa6fba158bd95a` |
| VPS | `/var/backups/planora/db-phaseD0bis/db-phaseD0bis-pre-20260420-045527.tar.gz` |
| Mac | `/Users/design/Desktop/PLANORA/backups/db-phaseD0bis-pre-20260420-045527.tar.gz` |
| iCloud | `~/Library/Mobile Documents/com~apple~CloudDocs/PLANORA-backups/db-phaseD0bis-pre-20260420-045527.tar.gz` |
| Vérification SHA | ✅ identique sur les 3 emplacements |
| Permissions | `chmod 600` |

---

## 2. Audit log + script

| Item | Chemin |
|---|---|
| Script source | [db-migrations/2026-04-20-phaseD0bis-cleanup-historical-violations.js](db-migrations/2026-04-20-phaseD0bis-cleanup-historical-violations.js) |
| Audit JSON brut (run final) | [db-migrations/2026-04-20-phaseD0bis-audit-output.json](db-migrations/2026-04-20-phaseD0bis-audit-output.json) |

---

## 3. Résultats par action (4 actions, 4 transactions séparées)

### A1 — INSERT placeholder `__deleted__` dans CapFinances ✅

| Item | Valeur |
|---|---|
| `integrity_check` AVANT | `ok` |
| Sanity company `c1776169036725` existe | ✅ Trouvée (CAPFINANCES) |
| Pre-state placeholder | absent (`null`) |
| `INSERT OR IGNORE` rows inserted (1er run) | **1** ✅ |
| Post-state placeholder | `{ id: '__deleted__', companyId: 'c1776169036725', name: '[Contact supprime]', status: 'prospect', pipeline_stage: 'nouveau' }` |
| `integrity_check` APRÈS | `ok` |
| Re-run idempotence | `rows_inserted = 0`, `already_existed = true` ✅ |

### A2 — DELETE 12 roles orphans + cascade `role_permissions` ✅

| Item | Valeur |
|---|---|
| `integrity_check` AVANT | `ok` |
| Snapshot roles ciblés (1er run) | **12 rows** (6 companies disparues × 2 rôles Admin+Membre) |
| Snapshot role_permissions cascade attendu | **84 rows** (en moyenne 7 permissions par role) |
| Total `role_permissions` AVANT | (au moment du 1er run) |
| Total `role_permissions` APRÈS | -84 (cascade auto déclenchée) |
| **roles_deleted** | **12** ✅ |
| **role_permissions cascade_deleted** | **84** ✅ |
| roles_remaining_after | 0 |
| `fk_violations_roles_after` | **0** ✅ |
| `integrity_check` APRÈS | `ok` |
| Re-run idempotence | `roles_deleted = 0` (snapshot trouve 0 ids ciblés restants) ✅ |

#### Liste des 12 roles supprimés (snapshot pré 1er run)
- `role_admin_c1774825229294` + `role_member_c1774825229294`
- `role_admin_c1774898326318` + `role_member_c1774898326318`
- `role_admin_c1775049199206` + `role_member_c1775049199206`
- `role_admin_c1775049217129` + `role_member_c1775049217129`
- `role_admin_c1775050406399` + `role_member_c1775050406399`
- `role_admin_c1775050406816` + `role_member_c1775050406816`

→ 6 companies de test depuis longtemps disparues. 84 permissions associées supprimées par cascade voulue (FK `role_permissions.roleId → roles.id ON DELETE CASCADE`).

### A3 — DELETE 2 tickets bug orphans (avec correction A3 v2) ⚠→✅

#### Premier run — ÉCHEC
| Item | Valeur |
|---|---|
| Erreur | `FOREIGN KEY constraint failed` |
| Cause | FK enfante non documentée : `ticket_messages.ticketId → tickets.id` (NO ACTION = RESTRICT) |
| 2 ticket_messages liés (1 par ticket) | bloquaient le DELETE FROM tickets |

#### Investigation post-échec
- Détection via `pragma_foreign_key_list` reverse : `ticket_messages` a une FK enfant vers `tickets`
- 2 messages liés trouvés (1 par ticket) — auto-créés en même temps que les tickets bug
- **Pas de cascade** déclarée → DELETE bloqué par contrainte

#### Correction appliquée (v2 du script)
Dans la même transaction : DELETE `ticket_messages` enfants AVANT DELETE `tickets`.

#### Deuxième run — SUCCÈS
| Item | Valeur |
|---|---|
| `integrity_check` AVANT | `ok` |
| Snapshot tickets ciblés | **2 rows** |
| Snapshot ticket_messages liés | **2 rows** (1 par ticket) |
| **ticket_messages_deleted** | **2** ✅ |
| **tickets_deleted** | **2** ✅ |
| tickets_remaining_after | 0 |
| `fk_violations_tickets_after` | **0** ✅ |
| `integrity_check` APRÈS | `ok` |

#### Liste des 2 tickets supprimés
- `tk17757546732473wpa` (Unhandled: ReferenceError: Can't find variable: selectedCrmContact, company `c1775049217129` disparue)
- `tk177575500422688dn` (idem)

### A4 — DELETE 117 google_events orphans (avec flag futurs) ✅

| Item | Valeur |
|---|---|
| `integrity_check` AVANT | `ok` |
| Snapshot google_events orphelins | **117 events** |
| Détection events futurs (`startTime > now ISO`) | **96 events futurs détectés** ⚠ (signalés, mais DELETE confirmé conforme à la directive MH) |
| Distribution par `collaboratorId` orphan | (groupement détaillé dans audit JSON) |
| **events_deleted** | **117** ✅ |
| google_events_orphans_remaining_after | **0** ✅ |
| `fk_violations_google_events_after` | **0** ✅ |
| `integrity_check` APRÈS | `ok` |
| Re-run idempotence | `events_deleted = 0` (snapshot vide) ✅ |

#### Note sur les 96 events futurs
Conformément à ta directive : flaggés explicitement dans le snapshot pré-DELETE pour traçabilité, MAIS DELETE pur confirmé (pas de découverte majeure bloquante). Ces events sont rattachés à des collaborateurs disparus → ils n'apparaissaient nulle part dans l'UI prod (les agendas n'affichent que les events des collabs actifs). Source de vérité Google Calendar reste accessible si besoin de re-sync.

---

## 4. Re-audit final D-0 (confirmation indépendante)

Re-run de `db-migrations/2026-04-20-phaseD-precheck-readonly.js` après D-0bis :

| Métrique | Valeur |
|---|---|
| `total_fk_violations_across_3_dbs` | **0** ✅✅✅ |
| `placeholder_missing_in` | `[]` ✅ (présent sur les 3 DBs) |
| `efef_fk_exists_anywhere` | `false` (FK absente, pas un blocage, conforme directive MH option (b)) |
| `total_cascade_delete_fks` | 6 (V7 + RBAC, comportements voulus) |
| Provisional status | `GO_PROVISIONAL_PENDING_CODE_AUDIT` (= GO car code audit déjà fait en D-0) |

### Par DB

| DB | violations | placeholder | integrity |
|---|---|---|---|
| **monolithe** | **0** ✅ | ✅ présent | `ok` |
| **CapFinances** | **0** ✅ | ✅ présent (créé par A1) | `ok` |
| **MonBilan** | **0** ✅ | ✅ présent | `ok` |

---

## 5. Diff avant / après (global)

### FK violations

| Métrique | AVANT D-0bis | APRÈS D-0bis | Δ |
|---|---|---|---|
| google_events orphans | 117 | **0** | −117 ✅ |
| roles orphans | 12 | **0** | −12 ✅ |
| tickets orphans | 2 | **0** | −2 ✅ |
| **TOTAL violations FK** | **131** | **0** | **−131** ✅✅✅ |

### Comptes ligne par table (vérification non-fuite)

| Table | DB | AVANT D-0bis | APRÈS D-0bis | Δ |
|---|---|---|---|---|
| `contacts` | CapFinances | 45 | **46** | +1 (placeholder additif) |
| `roles` | monolithe | 24 | **12** | −12 (orphans cleanup) |
| `role_permissions` | monolithe | 168 | **84** | −84 (cascade auto) |
| `tickets` | monolithe | 849 | **847** | −2 (orphans cleanup) |
| `ticket_messages` | monolithe | 849 | **847** | −2 (FK NO ACTION cascade manuelle) |
| `google_events` | monolithe | 123 | **6** | −117 (orphans cleanup) |
| `bookings` | monolithe | 48 | 48 | 0 ✅ |
| `call_logs` | monolithe | 227 | 227 | 0 ✅ |
| `audit_logs` | monolithe | 1494 | 1494 | 0 ✅ |
| `companies` | monolithe | 6 | 6 | 0 ✅ |
| `collaborators` | monolithe | 12 | 12 | 0 ✅ |
| `contacts` | monolithe | 248 | 248 | 0 ✅ |

→ Aucune fuite. Toutes les modifications sont strictement dans le périmètre A1+A2+A3+A4.

---

## 6. Smoke test prod post-D-0bis

| Check | Résultat |
|---|---|
| HTTPS https://calendar360.fr/ | **200** ✅ |
| pm2 `calendar360` | **online** (uptime 4h, 134.1 MB RAM, 0 restart) |
| `integrity_check` x3 DBs | **ok / ok / ok** ✅ |
| FK violations | **0** sur les 3 DBs ✅ |
| `__deleted__` placeholder | présent sur les 3 DBs ✅ |

---

## 7. Garanties tenues (vs contraintes du brief MH)

| Contrainte | Tenue |
|---|---|
| Périmètre strict A1/A2/A3/A4 | ✅ |
| Backup triple-redondance avant écriture | ✅ SHA `a194e0ba…d95a` sur VPS+Mac+iCloud |
| Transactions atomiques séparées (1 par action) | ✅ |
| `integrity_check` avant/après chaque action | ✅ ok partout |
| Audit JSON versionné | ✅ [2026-04-20-phaseD0bis-audit-output.json](db-migrations/2026-04-20-phaseD0bis-audit-output.json) |
| Rapport markdown final | ✅ ce document |
| Re-run script D-0 prouve `foreign_key_check = 0` | ✅ confirmé par re-audit indépendant |
| Aucun patch code backend | ✅ |
| Aucun deploy | ✅ |
| Aucun changement hors périmètre | ✅ counts inchangés sur tables non ciblées |
| Idempotence sur les 4 actions | ✅ A1 INSERT OR IGNORE, A2 DELETE par id, A3 DELETE par id, A4 DELETE par id snapshot |
| Flag explicite events futurs A4 | ✅ 96 events futurs comptés et listés dans audit JSON |
| FK CASCADE attendue (role_permissions) déclenchée et documentée | ✅ 84 permissions cascadées |
| FK NO ACTION détectée (ticket_messages) gérée explicitement | ✅ DELETE manuel des enfants dans même transaction |

---

## 8. Découverte technique (importante pour Phase D-3 doc)

### `ticket_messages.ticketId → tickets.id ON DELETE NO ACTION`
Lors de l'exécution A3 v1, la FK `ticket_messages → tickets` (NO ACTION) a fait échouer le DELETE FROM tickets. **C'est une FK enfant non documentée dans le rapport D-0** car l'audit listait les FK CASCADE mais pas les FK NO ACTION dont les enfants existent.

→ **À documenter** dans `CLAUDE.md §0` ou `HANDOFF` : pour tout DELETE futur sur tickets, penser à supprimer les ticket_messages enfants d'abord (ou ajouter ON DELETE CASCADE au schéma — décision architecturale séparée).

---

## 9. Bilan global Phases C + D-0bis

| Métrique | Pré C-1 | Post D-0bis |
|---|---|---|
| Bookings orphans monolithe | 32 | **0** ✅ |
| Call_logs orphans monolithe | 48 | **0** ✅ |
| Contacts→collab orphans | 2 | 1 (efef gardé volontairement) |
| Contacts c1 polluants | 40 | **0** ✅ |
| Roles orphans monolithe | 12 | **0** ✅ |
| Tickets orphans monolithe | 2 | **0** ✅ |
| Google_events orphans monolithe | 117 | **0** ✅ |
| Doublons emails groupes | 13 | 3 (cross-company légitimes MH) |
| Doublons phones groupes | 9 | 3 (cross-company légitimes MH) |
| Placeholder `__deleted__` (3 DBs) | mono only | **les 3 DBs** ✅ |
| `PRAGMA foreign_keys` runtime | déjà ON (révélé en D-0) | confirmé ON ✅ |
| `PRAGMA foreign_key_check` total | 131 | **0** ✅✅✅ |

---

## 10. Rollback (si jamais besoin)

### Option A — Tarball
```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
  pm2 stop calendar360
  cd / && tar xzf /var/backups/planora/db-phaseD0bis/db-phaseD0bis-pre-20260420-045527.tar.gz \
    -C /var/www/planora-data/
  for db in calendar360.db tenants/c1776169036725.db tenants/c-monbilan.db; do
    sqlite3 \"/var/www/planora-data/\$db\" 'PRAGMA integrity_check;'
  done
  pm2 restart calendar360
"
```
→ Restaure l'état exact de 04:55:27 UTC le 2026-04-20 (annule D-0bis intégralement).

### Option B — Rollback granulaire via JSON audit
Le JSON contient les snapshots pré-DELETE complets pour A2, A3, A4 (ainsi que A1). Re-INSERT possible champ par champ via INSERT.

---

## 11. Verdict final D-0bis

### ✅ **GO** — Phase D simplifiée terminée

Au sens « 0 violation FK + état clean », **l'objectif est atteint** :
- 0 violation FK sur les 3 DBs
- Placeholder `__deleted__` présent partout
- Code backend déjà FK-safe (FK ON activé runtime)
- Aucune cascade dangereuse à craindre
- Triggers compatibles (audit immutability uniquement)

### Étapes restantes Phase D

| Étape | Statut |
|---|---|
| D-0 (audit) | ✅ DONE |
| D-0bis (cleanup) | ✅ **DONE** (ce rapport) |
| D-1bis (tests locaux) | SKIP confirmé (FK déjà actif en prod, pas de changement runtime) |
| D-2 (activation FK ON prod) | OBSOLÈTE (déjà actif depuis longtemps) |
| **D-3 (observation + documentation)** | À PLANIFIER |

### Prochaines actions à planifier (D-3)

1. **Setup monitoring continu** : grep `SQLITE_CONSTRAINT_FOREIGNKEY` dans pm2 logs → `/var/log/planora-fk-violations.log`
2. **Re-audit hebdomadaire** : re-run `phaseD-precheck-readonly.js` une fois par semaine pour confirmer 0 nouvelle violation
3. **Documentation `CLAUDE.md §0`** :
   - Confirmer que FK ON est actif via `database.js`, `tenantDbCache.js`, `controlTower.js`
   - Règle « toute nouvelle ouverture de connexion DOIT inclure `db.pragma('foreign_keys = ON')` »
   - Ajouter à la check-list pre-merge
   - Documenter la FK enfante `ticket_messages → tickets` NO ACTION (à connaître pour futurs DELETE tickets)
4. (Optionnel) Patch préventif `services/googleCalendar.js:252` : valider `collaboratorId` existe avant INSERT OR REPLACE pour empêcher la repollution future

**Aucune de ces actions D-3 n'est lancée.** En attente de tes instructions.
