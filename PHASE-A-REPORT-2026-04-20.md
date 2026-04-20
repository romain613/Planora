# PHASE A — Rapport d'exécution (2026-04-20)

> Propagation schéma monolithe → 2 tenants
> Strictement additif, idempotent, non destructif
> Statut : **✅ SUCCESS**

---

## 1. Backup pré-modification

| Item | Valeur |
|---|---|
| Fichier | `/var/backups/planora/db-phaseA/db-phaseA-pre-20260420-014012.tar.gz` |
| Taille | 1.3 MB |
| SHA-256 | `3217be8835359946b5b3395cadbd385d7f651b4d5ce049a2143a5dae5c1a563e` |
| Contenu | `calendar360.db` + `tenants/c1776169036725.db` + `tenants/c-monbilan.db` |
| Localisation | VPS uniquement (peut être pullé sur Mac via `scp` si désiré) |

Méthode : `PRAGMA wal_checkpoint(TRUNCATE)` sur chaque DB avant tar (pas de WAL résiduel).

---

## 2. Script exécuté

| Item | Valeur |
|---|---|
| Source locale | [db-migrations/2026-04-20-phaseA-propagate-schema.js](db-migrations/2026-04-20-phaseA-propagate-schema.js) |
| Source VPS | `/var/www/planora/db-migrations/2026-04-20-phaseA-propagate-schema.js` |
| Runtime | Node.js + better-sqlite3 12.6.2 |
| Garanties | Idempotent (PRAGMA table_info avant chaque ALTER), transaction atomique par DB, integrity_check avant + après |

### SQL effectivement appliqué (sur CHAQUE tenant)

```sql
-- bookings (8 colonnes additives)
ALTER TABLE bookings ADD COLUMN bookedByCollaboratorId TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN meetingCollaboratorId  TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN agendaOwnerId          TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN bookingType            TEXT DEFAULT 'external';
ALTER TABLE bookings ADD COLUMN bookingOutcome         TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN bookingOutcomeNote     TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN bookingOutcomeAt       TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN transferMode           TEXT DEFAULT '';

-- collaborators (4 colonnes additives)
ALTER TABLE collaborators ADD COLUMN acceptInternalMeetings  INTEGER DEFAULT 1;
ALTER TABLE collaborators ADD COLUMN shareAgendaAvailability INTEGER DEFAULT 1;
ALTER TABLE collaborators ADD COLUMN autoAcceptMeetings      INTEGER DEFAULT 0;
ALTER TABLE collaborators ADD COLUMN meetingPriorityLevel    INTEGER DEFAULT 1;

-- contacts (8 colonnes additives)
ALTER TABLE contacts ADD COLUMN ownerCollaboratorId        TEXT DEFAULT '';
ALTER TABLE contacts ADD COLUMN executorCollaboratorId     TEXT DEFAULT '';
ALTER TABLE contacts ADD COLUMN meetingCollaboratorId      TEXT DEFAULT '';
ALTER TABLE contacts ADD COLUMN followMode                 TEXT DEFAULT 'owner_only';
ALTER TABLE contacts ADD COLUMN visibilityScope            TEXT DEFAULT 'owner';
ALTER TABLE contacts ADD COLUMN lastMeetingOutcome         TEXT DEFAULT '';
ALTER TABLE contacts ADD COLUMN lastMeetingDate            TEXT DEFAULT '';
ALTER TABLE contacts ADD COLUMN lastMeetingCollaboratorId  TEXT DEFAULT '';

-- 6 indexes
CREATE INDEX IF NOT EXISTS idx_bookings_agenda_owner   ON bookings(agendaOwnerId);
CREATE INDEX IF NOT EXISTS idx_bookings_meeting_collab ON bookings(meetingCollaboratorId);
CREATE INDEX IF NOT EXISTS idx_bookings_type           ON bookings(bookingType);
CREATE INDEX IF NOT EXISTS idx_contacts_executor       ON contacts(executorCollaboratorId);
CREATE INDEX IF NOT EXISTS idx_contacts_meeting_collab ON contacts(meetingCollaboratorId);
CREATE INDEX IF NOT EXISTS idx_contacts_owner          ON contacts(ownerCollaboratorId);

-- 2 triggers
CREATE TRIGGER IF NOT EXISTS prevent_audit_update BEFORE UPDATE ON audit_logs
  BEGIN SELECT RAISE(ABORT, 'audit_logs is immutable'); END;
CREATE TRIGGER IF NOT EXISTS prevent_audit_delete BEFORE DELETE ON audit_logs
  BEGIN SELECT RAISE(ABORT, 'audit_logs is immutable'); END;
```

Total : **20 colonnes + 6 indexes + 2 triggers** par tenant.

---

## 3. Résultat par tenant

### CapFinances (`/var/www/planora-data/tenants/c1776169036725.db`)

| Item | Valeur |
|---|---|
| `integrity_check` AVANT | `ok` |
| `integrity_check` APRÈS | `ok` |
| Colonnes ajoutées | **20** (bookings 8 + collaborators 4 + contacts 8) |
| Colonnes déjà présentes (skipped) | 0 |
| Indexes créés | **6** |
| Indexes déjà présents | 0 |
| Triggers créés | **2** (prevent_audit_update + prevent_audit_delete) |
| Triggers déjà présents | 0 |
| Erreur | aucune |
| Transaction | committed |
| `success` | **true** |

### MonBilan (`/var/www/planora-data/tenants/c-monbilan.db`)

| Item | Valeur |
|---|---|
| `integrity_check` AVANT | `ok` |
| `integrity_check` APRÈS | `ok` |
| Colonnes ajoutées | **20** (bookings 8 + collaborators 4 + contacts 8) |
| Colonnes déjà présentes (skipped) | 0 |
| Indexes créés | **6** |
| Indexes déjà présents | 0 |
| Triggers créés | **2** |
| Triggers déjà présents | 0 |
| Erreur | aucune |
| Transaction | committed |
| `success` | **true** |

---

## 4. Vérification idempotence

Re-run du script sur les 2 tenants juste après la propagation initiale :

```
c1776169036725.db: added=0 skipped=20 idx_created=0 idx_existed=6 trg_created=0 trg_existed=2 integrity=ok success=true
c-monbilan.db:     added=0 skipped=20 idx_created=0 idx_existed=6 trg_created=0 trg_existed=2 integrity=ok success=true
```

→ **0 modification au second passage**. Le script peut être ré-exécuté sans risque.

---

## 5. Diff structurel final (monolithe vs tenants)

### Colonnes (4 tables ciblées)
| Table | monolithe vs CapFinances | monolithe vs MonBilan |
|---|---|---|
| `bookings` | **0 diff** | **0 diff** |
| `collaborators` | **0 diff** | **0 diff** |
| `contacts` | **0 diff** | **0 diff** |
| `audit_logs` | **0 diff** | **0 diff** |

### Indexes (4 tables ciblées)
| Table | monolithe vs CapFinances | monolithe vs MonBilan |
|---|---|---|
| `bookings` | **0 diff** | **0 diff** |
| `collaborators` | **0 diff** | **0 diff** |
| `contacts` | **0 diff** | **0 diff** |
| `audit_logs` | **0 diff** | **0 diff** |

### Triggers
- monolithe : `prevent_audit_delete:audit_logs`, `prevent_audit_update:audit_logs`
- CapFinances : idem
- MonBilan : idem

→ **Schéma 100% aligné** sur les 4 tables divergentes initialement.

---

## 6. Comptes finaux (avant / après)

### Tables
| DB | Avant | Après | Δ |
|---|---|---|---|
| `calendar360.db` (monolithe) | 95 | 95 | 0 |
| `c1776169036725.db` (CapFinances) | 89 | 89 | 0 |
| `c-monbilan.db` (MonBilan) | 89 | 89 | 0 |

→ Aucune nouvelle table créée (uniquement cols/idx/triggers ajoutés sur tables existantes).

### Colonnes par table (les 4 ciblées)
| Table | mono | CapF avant→après | MonB avant→après |
|---|---|---|---|
| `bookings` | 34 | 26 → **34** | 26 → **34** |
| `collaborators` | 53 | 49 → **53** | 49 → **53** |
| `contacts` | 72 | 64 → **72** | 64 → **72** |
| `audit_logs` | 14 | 14 → **14** (cols) | 14 → **14** (cols) |

### Triggers `audit_logs`
| DB | Avant | Après |
|---|---|---|
| monolithe | 2 | 2 |
| CapFinances | **0** | **2** |
| MonBilan | **0** | **2** |

### Rows (vérifie aucune perte de données)
| DB | bookings | collaborators | contacts | audit_logs |
|---|---|---|---|---|
| monolithe | 48 | 12 | 287 | 1494 |
| CapFinances | 1 | 2 | 45 | 20 |
| MonBilan | 39 | 4 | 13 | 1089 |

→ **Identique avant/après**. Aucune ligne touchée.

### Tables uniquement-monolithe (doit rester 6)
```
phone_plans, sessions, sms_packs, supra_admins, voip_packs, wa_verifications
```
→ **Inchangé**, aucune migration vers tenants (conforme décisions 2 + audit §3).

---

## 7. Smoke test prod post-Phase A

| Check | Résultat |
|---|---|
| HTTPS https://calendar360.fr/ | **200** |
| pm2 `calendar360` | **online** (uptime 76m, 142.9 MB RAM, 0 restart) |
| `integrity_check` x 3 DBs | **ok / ok / ok** |

---

## 8. Schéma de propagation (point 7 — alignement futur)

Le script créé en Phase A est **réutilisable** comme outil de propagation :
[`db-migrations/2026-04-20-phaseA-propagate-schema.js`](db-migrations/2026-04-20-phaseA-propagate-schema.js).

### Ce qu'il fait déjà :
- Idempotent (PRAGMA table_info avant chaque ALTER)
- Atomique par DB (transaction)
- integrity_check avant + après
- Rapport JSON par DB
- Refuse de continuer si DB corrompue

### Pour atteindre l'objectif "0 divergence garantie" (à proposer en Phase suivante, hors scope Phase A) :

1. **Outil de diff structurel automatisable** (`db-migrations/diff-schema.js`) :
   - Compare schémas (cols + idx + triggers + FK) entre monolithe et tous les tenants
   - Sortie : verdict `aligned` ou liste précise des divergences
   - À ajouter au pipeline `./v7-deploy/deploy.sh` comme check pré-deploy

2. **Convention de migration** (un fichier par migration future) :
   ```
   db-migrations/YYYY-MM-DD-descriptif.js  (script de propagation idempotent)
   db-migrations/YYYY-MM-DD-descriptif.sql (SQL appliqué pour audit humain)
   ```
   Chaque modification de schéma sur le monolithe **ne mergeable** que si le script
   compagnon de propagation tenants est commité.

3. **Schema version** (table `_schema_meta` dans chaque DB) :
   - 1 ligne `{key: 'version', value: 'YYYY-MM-DD-N'}`
   - Le script de propagation incrémente la version
   - Mismatch entre monolithe et tenants = alerte

4. **Pre-commit hook (côté repo)** :
   - Bloque tout commit qui touche `database.js` schema sans script `db-migrations/`
   - Force la discipline.

**Recommandation** : valider d'abord les Phases B/C/D (nettoyage data + FK), puis travailler
sur ces 4 outils dans une session dédiée. La Phase A pose déjà le pattern du script idempotent.

---

## 9. Garanties tenues (vs contraintes du brief MH)

| Contrainte | Tenue |
|---|---|
| Aucune modification destructive | ✅ Toutes les ALTER sont ADD COLUMN avec DEFAULT |
| Aucune suppression de données | ✅ Counts rows identiques avant/après |
| Aucun nettoyage métier | ✅ Pas touché aux orphelins/doublons (= Phases B/C/D) |
| Aucune activation FK | ✅ `PRAGMA foreign_keys = 0` toujours en vigueur partout |
| Aucune migration de sessions | ✅ Table `sessions` reste exclusivement dans monolithe |
| Aucun changement hors des 2 DB tenants | ✅ Monolithe non modifié (vérifié : 95 tables, 34/53/72/14 cols, 1494 rows audit_logs intact) |
| Backup avant modification | ✅ Tarball SHA256 confirmé sur VPS |
| Transaction par DB | ✅ better-sqlite3 `db.transaction()` (rollback auto si erreur) |
| `integrity_check` après | ✅ ok sur les 3 DBs |
| Schéma aligné | ✅ 0 diff cols/idx/triggers sur les 4 tables ciblées |
| Re-audit complet post-Phase A | ✅ Section 5 + 6 + 7 |

---

## 10. Rollback (si jamais besoin)

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
  cd /var/www/planora-data
  # arrêter le backend pour libérer les locks
  pm2 stop calendar360
  # restaurer
  cd / && tar xzf /var/backups/planora/db-phaseA/db-phaseA-pre-20260420-014012.tar.gz -C /var/www/planora-data/
  # vérifier intégrité
  for db in calendar360.db tenants/c1776169036725.db tenants/c-monbilan.db; do
    sqlite3 \"/var/www/planora-data/\$db\" 'PRAGMA integrity_check;'
  done
  # redémarrer
  pm2 restart calendar360
"
```

→ Restaure l'état exact de 01:40:12 UTC le 2026-04-20 (hash SHA-256 vérifiable).

---

## 11. Prochaines étapes (en attente de validation MH)

Conformément aux décisions actées :

- **Phase B** — Investigation des 30 bookings MonBilan sans contact (chiffres avant décision)
- **Phase C** — Liste détaillée des 13 doublons emails + 9 phones + 32 bookings + 48 call_logs orphelins du monolithe pour décision case-by-case
- **Phase D** — Stratégie de "marquage propre" des call_logs orphelins (ex : `contactId = ''` au lieu de FK invalide)
- **Phase E** — Activation `foreign_keys = ON`, d'abord tenants, puis monolithe après nettoyage
- **Outils alignement futur** (point 7) — diff-schema, schema_version, convention `db-migrations/`, pre-commit hook

**Aucune de ces phases n'a été démarrée.** Validation MH requise avant chacune.
