# PHASE D-0 — Pre-flight read-only audit (2026-04-20)

> Périmètre : monolithe + 2 tenants + code backend.
> Mode : **STRICT READ-ONLY** — aucune modification.
> Verdict : **❌ NO-GO** (4 blocages identifiés, ré-évaluation possible après correctifs).

---

## 1. Audit JSON & rapport

| Item | Chemin |
|---|---|
| Script audit (read-only) | [db-migrations/2026-04-20-phaseD-precheck-readonly.js](db-migrations/2026-04-20-phaseD-precheck-readonly.js) |
| Audit JSON brut | [db-migrations/2026-04-20-phaseD-precheck.json](db-migrations/2026-04-20-phaseD-precheck.json) (3 274 lignes) |
| Ce rapport | [PHASE-D-PRECHECK-REPORT.md](PHASE-D-PRECHECK-REPORT.md) |

---

## 2. 🚨 RÉVÉLATION MAJEURE

### `PRAGMA foreign_keys = ON` est **DÉJÀ activé en production** (et ce, depuis un certain temps)

L'audit initial (`AUDIT-DB-2026-04-20.md`) annonçait `PRAGMA foreign_keys = 0` sur les 3 DBs. **C'était un faux négatif** : la mesure avait été faite via le CLI `sqlite3` (qui ouvre les DBs avec FK désactivé par défaut). Les **connexions backend Node** activent FK ON systématiquement.

Preuves trouvées dans le code (toutes sur runtime) :

| Fichier | Ligne | Code |
|---|---|---|
| `server/db/database.js` | 19 | `db.pragma('foreign_keys = ON');` |
| `server/db/controlTower.js` | 29 | `ct.pragma('foreign_keys = ON');` |
| `server/db/tenantDbCache.js` | 51 | `db.pragma('foreign_keys = ON');` (à chaque ouverture LRU cache) |
| `server/db/tenantSchema.js` | 246 | `tenantDb.pragma('foreign_keys = ON');` (après création tenant) |

→ **TOUTES les connexions runtime ont FK = ON.**

### Conséquence directe pour Phase D
La plan initial de « activer FK ON » est **obsolète** : c'est déjà fait.
Le travail réel restant = **nettoyage des 131 violations existantes** + **résolution des 2 anomalies structurelles** identifiées ci-dessous.

---

## 3. Audit DB — vue par DB

### 3.1 monolithe (`/var/www/planora-data/calendar360.db`)

| Item | Valeur |
|---|---|
| `integrity_check` | `ok` |
| `PRAGMA foreign_keys` (read-only audit conn) | **1** |
| `PRAGMA defer_foreign_keys` | 0 |
| `PRAGMA recursive_triggers` | 0 |
| Tables totales | 95 |
| FK déclarées (total) | 50 |
| Tables avec FK | 41 |
| `ON DELETE CASCADE` | **2** |
| `ON UPDATE CASCADE` | 0 |
| `ON DELETE SET NULL` | 0 |
| `ON DELETE RESTRICT` | 0 |
| `ON DELETE NO ACTION` (default) | 48 |
| **Violations FK existantes** | **131** ⚠ |
| Triggers | 2 (audit immutability) |
| Placeholder `__deleted__` dans `contacts` | ✅ présent |

### 3.2 CapFinances (`/var/www/planora-data/tenants/c1776169036725.db`)

| Item | Valeur |
|---|---|
| `integrity_check` | `ok` |
| `PRAGMA foreign_keys` | **1** |
| Tables totales | 89 |
| FK déclarées | 50 |
| Tables avec FK | 41 |
| `ON DELETE CASCADE` | 2 |
| **Violations FK existantes** | **0** ✅ |
| Triggers | 2 |
| Placeholder `__deleted__` | **❌ ABSENT** ⚠ |

### 3.3 MonBilan (`/var/www/planora-data/tenants/c-monbilan.db`)

| Item | Valeur |
|---|---|
| `integrity_check` | `ok` |
| `PRAGMA foreign_keys` | **1** |
| Tables totales | 89 |
| FK déclarées | 50 |
| Tables avec FK | 41 |
| `ON DELETE CASCADE` | 2 |
| **Violations FK existantes** | **0** ✅ |
| Triggers | 2 |
| Placeholder `__deleted__` | ✅ présent |

---

## 4. Détail des 131 violations sur le monolithe

### 4.1 `google_events` — 117 violations
- **FK violée** : `google_events.collaboratorId → collaborators.id` (NO ACTION)
- **Cause probable** : 117 événements Google Calendar synchronisés dont le collaborateur a été désactivé/supprimé entre-temps
- **Impact runtime** : aucun blocage tant qu'on ne `UPDATE` ou `DELETE` ces rows. Toute opération sur ces 117 rows aujourd'hui peut fail si elle modifie `collaboratorId` ou cible un parent inexistant
- **Source d'écriture** : `services/googleCalendar.js:252` (`INSERT OR REPLACE`) — la sync Google Calendar ne valide pas que le collaboratorId existe encore avant insertion. Probable insertion sous une connexion qui contournait FK (script de sync historique avant pragma) ou collab supprimé après insertion
- **Décision recommandée** : **DELETE ciblé** (events orphelins inutiles, pas d'historique business à préserver) ou **REASSIGN à un collab actif**

### 4.2 `roles` — 12 violations
- **FK violée** : `roles.companyId → companies.id` (NO ACTION)
- **Détail** : 6 companies disparues × 2 roles (Administrateur + Membre) :
  - `c1774825229294`, `c1774898326318`, `c1775049199206`, `c1775049217129`, `c1775050406399`, `c1775050406816`
- **Cause** : ces 6 companies ont été supprimées **sans cascade** sur leurs rôles (FK = NO ACTION). Anciennes companies de test
- **Impact runtime** : aucun (rôles inutilisés car company absente)
- **Risque cascade** : `role_permissions.roleId → roles.id` est `ON DELETE CASCADE` → **si on DELETE ces 12 roles, leurs `role_permissions` sont supprimées automatiquement**. À documenter mais c'est le comportement attendu
- **Décision recommandée** : **DELETE ciblé** (rôles orphelins, parents disparus, cascade prévue)

### 4.3 `tickets` — 2 violations
- **FK violée** : `tickets.companyId → companies.id` (NO ACTION)
- **Détail** : 2 tickets sur company `c1775049217129` (disparue), tous deux des erreurs JS auto-créées :
  - `tk17757546732473wpa` : "Unhandled: ReferenceError: Can't find variable: selectedCrmContact"
  - `tk177575500422688dn` : "Unhandled: ReferenceError: Can't find variable: selectedCrmContact"
  - (= bug connu de Phase 5 du refactor frontend, déjà fixé)
- **Impact runtime** : aucun (tickets devenus orphelins après suppression de la company)
- **Décision recommandée** : **DELETE ciblé** (tickets de bug déjà résolu, sur company disparue)

---

## 5. FK CASCADE — analyse

Identiques sur les 3 DBs (post Phase A propagation). Total : 2 par DB.

| Table source | Colonne | Table parent | Colonne | on_delete | Risque |
|---|---|---|---|---|---|
| `contact_followers` | `contactId` | `contacts` | `id` | **CASCADE** | 🟢 Comportement V7 voulu : suppression contact → suppression followers |
| `role_permissions` | `roleId` | `roles` | `id` | **CASCADE** | 🟢 Comportement RBAC voulu : suppression role → suppression permissions |

→ **Aucune CASCADE dangereuse non maîtrisée.** Les 2 cascades sont des comportements attendus et alignés avec la logique business.

**Note importante** : si on cleanup les 12 roles orphans (§4.2), la cascade `role_permissions` se déclenchera automatiquement. À chiffrer avant DELETE.

---

## 6. Triggers — analyse

Identiques sur les 3 DBs (post Phase A propagation). Total : 2 par DB.

| Trigger | Table | Description |
|---|---|---|
| `prevent_audit_update` | `audit_logs` | Empêche `UPDATE` sur `audit_logs` (immutabilité audit) |
| `prevent_audit_delete` | `audit_logs` | Empêche `DELETE` sur `audit_logs` (immutabilité audit) |

→ **Aucun trigger d'écriture (INSERT/UPDATE).** Aucun risque d'interaction avec FK ON. Pure protection lecture-seule sur audit_logs.

---

## 7. Cas EMPTY (`contactId='' / NULL`)

| DB | bookings empty | call_logs empty |
|---|---|---|
| monolithe | 5/48 | 145/227 |
| CapFinances | 0/1 | 3/6 |
| MonBilan | 2/39 | 93/142 |

**Statut FK** : la FK `bookings.contactId → contacts.id` est déclarée `NO ACTION`. SQLite considère `NULL` comme **non vérifié par FK** (pas de violation). Pour `''` (string vide), SQLite ne tente pas de match avec `contacts.id` car les ids sont toujours non-vides. **Aucune violation détectée par `foreign_key_check` sur ces rows** ✅.

→ **Pas de blocage** sur les EMPTY (by-design call public Calendly).

---

## 8. Cas efef — résolution

**Le contact `efef efef` (`ct1774872603359`)** est encore assigné au collab inexistant `u-rcsitbon`.

### Vérification FK
- FK `contacts.assignedTo → collaborators.id` cherchée dans `PRAGMA foreign_key_list(contacts)` sur les 3 DBs
- **Résultat : la FK n'existe PAS** sur aucune DB (`fk_assignedTo_to_collaborators_exists: false` sur monolithe + CapFinances + MonBilan)

### Conclusion sur efef
✅ **Aucun blocage côté efef pour Phase D.** Le contact reste tel quel, conforme à la décision MH précédente (Phase C-3) : ne pas le supprimer, le laisser pour une future "phase nettoyage tests" séparée.

---

## 9. Audit code backend

### 9.1 Points d'ouverture SQLite (18 sites identifiés)

#### Runtime production (3 sites)
| Fichier | Pragma FK ON ? | Note |
|---|---|---|
| `server/db/database.js:15` | ✅ ligne 19 | Monolithe |
| `server/db/tenantDbCache.js:49` | ✅ ligne 51 | Tenant LRU cache (max 50 connexions) |
| `server/db/controlTower.js:25` | ✅ ligne 29 | Control Tower |

#### Runtime backup (2 sites, readonly)
| Fichier | Pragma FK ON ? | Note |
|---|---|---|
| `server/routes/backup.js:83` | n/a (readonly) | Test backup file integrity |
| `server/routes/backup.js:136` | n/a (readonly) | Idem |

#### Hors-runtime (script de migration, jamais exécuté en prod)
| Fichier | Pragma FK ON ? |
|---|---|
| `server/scripts/migratePilotTenant.js` (3 usages) | tous readonly |
| `server/services/tenantMigration.js:188` | ⚠ ouverture write **sans pragma explicite** — mais ne tourne qu'à la migration manuelle d'un tenant |

#### Tests (10 sites, in-memory ou test isolé)
- `tests/interMeetings.test.js`, `db/test/testMultitenantPhase1.mjs`, `db/test/testTenantMigration.mjs` — non-prod

### 9.2 Crons identifiés (8 fichiers, 14 schedules)

| Cron | Fréquence | Risque FK |
|---|---|---|
| `cron/reminders.js` | */5 min, 8h, */5 min | 🟢 Lecture surtout |
| `cron/nrpRelance.js` | */30 min | 🟡 Peut UPDATE contacts (`nrp_next_relance`) |
| `cron/backups.js` | 6h+18h, tous les 2j | 🟢 Lecture seule |
| `cron/leadDispatch.js` | */5 min | 🟡 INSERT/UPDATE leads + contacts |
| `cron/smartAutomations.js` | setInterval | 🟡 Bug connu `[SMART AUTO] Rule 1 error: no such column: updatedAt` |
| `cron/secureIaReports.js` | 23h, lundi 7h, 1er du mois 7h | 🟢 Reporting |
| `cron/gsheetSync.js` | */10 min | 🟡 Peut INSERT contacts |
| `cron/transcriptArchive.js` | variable | 🟡 INSERT call_transcript_archive |

→ Tous utilisent les connexions runtime (`db` du monolithe ou `getOrOpen()` tenant cache) → **FK ON garantie**. Pas de cron qui ouvrirait sa propre connexion sans pragma.

### 9.3 Sites d'écriture sensibles (INSERT INTO bookings/contacts/etc.)

Tous identifiés dans `server/routes/*.js` et `server/db/database.js`. Tous utilisent les connexions runtime → FK ON garantie. Aucune route ne fait `pragma('foreign_keys = OFF')` runtime.

### 9.4 Patterns à risque
- **`INSERT OR REPLACE google_events`** dans `services/googleCalendar.js:252` : ne valide pas l'existence du `collaboratorId`. **Source probable des 117 violations**. À corriger dans une phase future (validation pré-INSERT) MAIS impact actuel est limité car les nouveaux events ont des collabs valides en prod (le runtime a tous les collabs en mémoire).
- **`DELETE FROM collaborators`** dans `routes/companies.js:155` (suppression company) : si appelé alors qu'il existe des `google_events` orphans → ne touche pas les events orphans (NO ACTION).
- **Aucun `pragma foreign_keys = OFF`** dans le code runtime (sauf dans `tenantSchema.js:226` qui désactive temporairement pour création schéma puis ré-active à la fin).

### 9.5 Routes de bootstrap
- `server/index.js` : entry point
- `server/seed.js` : seeding initial (probablement pour fixtures démo)
- `server/migrate-conversations.js` : script de migration ponctuel

→ Aucun de ces fichiers ne contourne FK en runtime.

---

## 10. Verdict final D-0

### ❌ **NO-GO**

Au sens du critère « 0 violation FK + état parfaitement clean », l'état actuel n'est **pas conforme**. 4 blocages identifiés.

### Blocages (par ordre de priorité)

#### B1 (CRITIQUE) — 117 violations FK dans `google_events`
- Tables : `google_events.collaboratorId → collaborators.id` (NO ACTION)
- Action requise avant GO : DELETE ciblé des 117 events orphans (analyse + cleanup)
- Risque cascade : aucun (NO ACTION)
- Effort : faible (1 DELETE WHERE collaboratorId NOT IN ...)

#### B2 (IMPORTANT) — 12 violations FK dans `roles`
- Tables : `roles.companyId → companies.id` (NO ACTION)
- Action requise avant GO : DELETE ciblé des 12 roles orphans
- **Effet cascade attendu** : suppression auto des `role_permissions` associées (CASCADE FK déclarée et voulue)
- Effort : faible (DELETE WHERE companyId NOT IN ...)

#### B3 (MINEUR) — 2 violations FK dans `tickets`
- Tables : `tickets.companyId → companies.id` (NO ACTION)
- Action requise avant GO : DELETE ciblé des 2 tickets orphans (bugs JS sur company disparue)
- Effort : trivial

#### B4 (STRUCTUREL) — Placeholder `__deleted__` ABSENT dans CapFinances
- Tenant CapFinances n'a pas la row `contacts.id='__deleted__'`
- Action requise avant GO : INSERT du placeholder (mirror de MonBilan + monolithe)
- Justification : si demain un booking ou call_log de CapFinances doit être marqué `__deleted__`, il faudra que la row existe (FK NO ACTION sinon = INSERT fail)
- Effort : trivial (1 INSERT additif idempotent)

### Hors blocage (informationnel)
- ℹ Cas efef : **PAS un blocage** (FK absente sur `contacts.assignedTo`)
- ℹ Cas EMPTY contactId (5 + 2 + 0 bookings, 145 + 93 + 3 call_logs) : **PAS un blocage** (NULL/'' n'est pas vérifié par FK NO ACTION)
- ℹ FK CASCADE (V7 contact_followers + RBAC role_permissions) : **PAS un risque** (comportements voulus et documentés)

---

## 11. Plan correctif proposé pour atteindre GO (à valider, pas à exécuter)

### Phase D-0bis — Cleanup violations + ajout placeholder
| # | Action | DB cible | Volume | Risque |
|---|---|---|---|---|
| D-0bis.1 | INSERT placeholder `__deleted__` dans CapFinances tenant | CapFinances | +1 row | 🟢 Nul (mirror exact des 2 autres DBs) |
| D-0bis.2 | DELETE 12 roles orphans + leurs `role_permissions` (cascade auto) | monolithe | -12 roles + N permissions | 🟢 Faible (parents disparus) |
| D-0bis.3 | DELETE 2 tickets orphans (bugs JS, company disparue) | monolithe | -2 tickets | 🟢 Trivial |
| D-0bis.4 | DELETE 117 google_events orphans | monolithe | -117 events | 🟡 Moyen (à confirmer pas d'impact downstream sur agendas affichés) |

Toutes ces actions = WRITE → nécessitent backup + transaction + integrity_check + audit JSON + rapport.
**Aucune n'est lancée tant que MH n'a pas validé.**

### Re-audit après D-0bis
- Re-run `2026-04-20-phaseD-precheck-readonly.js` → attendu : **0 violations FK sur les 3 DBs**
- Si confirmé : **GO** pour D-1bis (tests locaux) puis D-2 (cf. note ci-dessous)

### Note critique sur D-2
**FK ON est déjà actif en prod.** Donc **D-2 (= "déploiement de l'activation FK ON")** **n'a plus rien à faire**. La modification `database.js` / `tenantResolver.js` est déjà en place (depuis longtemps).

→ **Phase D simplifiée** : D-0bis (cleanup) → D-1bis (validation tests locaux des nouvelles écritures avec FK ON) → **D-2 supprimé** → D-3 (observation continue).

---

## 12. Récap des données factuelles

| Métrique | Valeur observée |
|---|---|
| DBs auditées | 3 (monolithe + CapFinances + MonBilan) |
| Tables totales monolithe / tenants | 95 / 89 / 89 |
| FK déclarées par DB | 50 / 50 / 50 |
| Tables avec FK | 41 / 41 / 41 |
| FK CASCADE par DB | 2 / 2 / 2 (V7 contact_followers + RBAC role_permissions) |
| Triggers par DB | 2 / 2 / 2 (audit immutability) |
| Violations FK monolithe | **131** (117 google_events + 12 roles + 2 tickets) |
| Violations FK CapFinances | **0** ✅ |
| Violations FK MonBilan | **0** ✅ |
| `__deleted__` placeholder | présent mono ✅ / **absent CapF ❌** / présent MonB ✅ |
| `PRAGMA foreign_keys` runtime | **1 (ON) — partout, déjà actif depuis le code backend** |
| Cas efef bloquant ? | **NON** (FK assignedTo→collaborators absente) |
| Code backend FK-safe ? | ✅ 3 sites runtime ont pragma FK ON, 0 contournement |
| Crons à risque ? | 🟡 Quelques INSERT (gsheet, leads, automations) mais tous sur connexions FK-ON runtime |

---

## 13. Décisions à demander à MH

1. **Validation du diagnostic** : reconnaître que FK ON est déjà actif en prod et que Phase D devient principalement un cleanup d'historique
2. **GO pour D-0bis** ? (cleanup des 4 blocages identifiés)
   - Stratégie pour les 117 google_events : DELETE pur ou REASSIGN à un collab "_legacy" ?
   - Confirmer DELETE des 12 roles + leurs `role_permissions` cascade
   - Confirmer DELETE des 2 tickets bug
   - Confirmer ajout `__deleted__` placeholder dans CapFinances
3. **Stratégie pour D-1bis** : encore utile (tests locaux) ou skip (FK déjà en prod, pas de changement code) ?
4. **Documentation** : ajouter à `CLAUDE.md §0` la confirmation que FK ON est actif (et la règle « toute nouvelle ouverture de connexion DOIT inclure `db.pragma('foreign_keys = ON')` »)

---

## 14. Conclusion stricte

> **Verdict D-0 : ❌ NO-GO** au sens « 0 violation FK ».
> Cause : 131 violations existantes + 1 placeholder manquant.
> Tous les blocages sont des nettoyages additifs/destructifs ciblés (low-risk).
> Le travail FK ON runtime étant **déjà fait**, Phase D devient principalement une phase D-0bis de cleanup historique.

**Aucune action écriture exécutée pour ce rapport.** Lecture pure des 3 DBs + lecture des fichiers backend + grep de patterns. Aucun INSERT, UPDATE, DELETE, ALTER, deploy, restart, ni patch.
