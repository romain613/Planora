# PHASE B-execute — Rapport d'exécution Stratégie E sur MonBilan (2026-04-20)

> Périmètre : tenant `c-monbilan` UNIQUEMENT.
> Stratégie : E (Mix remap par email + mark `__deleted__`).
> Audit storage : option **C** — JSON committé en git (aucune modif schéma DB).
> Statut : **✅ SUCCESS**

---

## 1. Backup pré-modification

| Item | Valeur |
|---|---|
| Fichier | `/var/backups/planora/db-phaseB/db-phaseB-monbilan-pre-20260420-020343.tar.gz` |
| Taille | 433 KB |
| SHA-256 | `20555f453424256966fffb35b5b8418cb4d826b6a86d133e13c4d4408aa14f21` |
| Contenu | `tenants/c-monbilan.db` (uniquement) |
| Localisation | VPS uniquement |

---

## 2. Audit log durable

| Item | Valeur |
|---|---|
| Fichier audit JSON | [db-migrations/2026-04-20-phaseB-audit-output.json](db-migrations/2026-04-20-phaseB-audit-output.json) |
| Script source | [db-migrations/2026-04-20-phaseB-execute-monbilan-orphans.js](db-migrations/2026-04-20-phaseB-execute-monbilan-orphans.js) |
| Format | JSON structuré avec `before_row` + `after_row` complets pour les 30 ops |
| Persistance | Repo git (versionné, immutable, traçable) |

→ Avantage option C : pas de schema divergence entre les 3 DBs, audit en git plus durable
qu'une colonne en base, complet (snapshot avant/après par row), peut être rejoué à l'envers
mécaniquement si rollback granulaire nécessaire.

---

## 3. Sanity checks effectués par le script avant toute UPDATE

| Check | Résultat |
|---|---|
| `PRAGMA integrity_check` AVANT | `ok` |
| Contact placeholder `__deleted__` existe ? | ✅ oui |
| Les 6 contacts cibles des remaps existent tous ? | ✅ oui (vérifié par row) |

→ Aucun pré-requis manquant ; on a continué.

---

## 4. Résumé de l'exécution

### Premier run (effectif)

| Item | Valeur |
|---|---|
| Démarré à | 2026-04-20T02:05:05.057Z |
| Terminé à | 2026-04-20T02:05:05.097Z |
| Durée | ~40 ms |
| Transaction | committed |
| Remaps total | 18 |
| Remaps appliqués (rows_changed=1) | **18** ✅ |
| Remaps déjà appliqués (rows_changed=0) | 0 |
| Marks total | 12 |
| Marks appliqués (rows_changed=1) | **12** ✅ |
| Marks déjà appliqués (rows_changed=0) | 0 |
| Orphelins restants | **0** ✅ |
| `PRAGMA integrity_check` APRÈS | `ok` |

### Test idempotence (re-run immédiat)

| Item | Valeur |
|---|---|
| Remaps appliqués | 0 |
| Remaps déjà appliqués | **18** ✅ |
| Marks appliqués | 0 |
| Marks déjà appliqués | **12** ✅ |
| Orphelins restants | **0** ✅ |

→ Idempotence prouvée. Les `WHERE id=X AND contactId=<old>` ne matchent plus au 2e passage.

---

## 5. Les 18 remaps effectués

Tous appliqués (`rows_changed=1`). Détails snapshot avant/après dans le JSON audit.

### Vers `ct_1776273340046_5oz9u2` (rc.sitbon@gmail.com) — 9 bookings
- bk1775041916391 (2026-04-13 10:00 confirmed)
- bk1774719788653 (2026-04-01 14:15 cancelled)
- bk1774571647100 (2026-03-30 17:00 cancelled)
- bk1774620950725 (2026-03-30 10:00 cancelled)
- bk1774801814615 (2026-03-30 09:00 cancelled)
- bk1774621284184 (2026-03-28 14:30 cancelled)
- bk1774621301782 (2026-03-28 14:00 cancelled)
- bk1774571819397 (2026-03-27 18:30 cancelled)
- bk1774569322393 (2026-03-27 14:00 cancelled)

### Vers `ct_1776145908058_wtaru9` (Melie.guillot@outlook.fr) — 3 bookings
- bk1774890063017, bk1774889641133, bk1774889535906 (tous 2026-03-31 11:30 cancelled)

### Vers `ct_1776145908086_zo67ea` (orlanne.huet@icloud.com) — 1 booking
- bk1774887360086 (2026-03-31 11:00 cancelled)

### Vers `ct_1776145908236_gmn91t` (Rc@gmail.com) — 3 bookings
- bk1775562446885 (2026-04-08 12:00 cancelled)
- bk1775332856236 (2026-04-06 10:00 cancelled)
- bk1775333060039 (2026-04-05 10:00 cancelled)

### Vers `ct_1776206683167_iwx8p2` (juju@gmail.com) — 1 booking
- bk1775562907705 (2026-04-09 11:30 cancelled)

### Vers `ct_1776289668254_lqufr4` (marieange1978.maz@gmail.com) — 1 booking
- bk1774891441738 (2026-03-31 09:00 cancelled)

**Total remaps : 18** ✅

---

## 6. Les 12 bookings marqués `__deleted__`

Tous appliqués (`rows_changed=1`).

### Depuis `ct1774891551680` (romain.biotech@gmail.com) — 9 bookings
- bk1774969047129 (2026-04-22 15:00 cancelled)
- bk1774969529525 (2026-04-17 12:00 cancelled)
- bk1775468417817 (2026-04-07 10:00 cancelled)
- bk1775001867812 (2026-04-02 13:00 cancelled)
- bk1774970523000 (2026-04-01 14:00 cancelled)
- bk1774892690324 (2026-03-31 16:00 cancelled)
- bk1774892627033 (2026-03-31 16:00 cancelled)
- bk1774891721672 (2026-03-31 14:30 cancelled)
- bk1774891606042 (2026-03-31 11:00 cancelled)

### Autres orphelins purs sans email — 3 bookings
- bk1775468512404 — `ct1774907550965` (sitbon alain, tel +33611913142, 2026-04-07 10:00 cancelled)
- bk1774819397303 — `ct1774819397149pw56` (Romain charles charles, tel 0644686824, 2026-04-01 14:00 confirmed)
- bk1775795765152 — `ct17757957649807a5g` (Romain Sitbon, tel 0616367116, 2026-04-13 13:00 confirmed)

**Total marks : 12** ✅

---

## 7. Diff avant / après

### Distribution `bookings` par état du `contactId`

| État | AVANT (Phase B) | APRÈS (Phase B) | Δ |
|---|---|---|---|
| VALID (contact existe) | 7 | **25** | +18 (= remaps réussis) |
| PLACEHOLDER (`__deleted__`) | 0 | **12** | +12 (= marks réussis) |
| EMPTY (`contactId=''`, public propre) | 2 | 2 | 0 (intouché comme demandé) |
| ORPHAN (contactId pointe nulle part) | **30** | **0** | **−30** ✅ |
| Total | 39 | 39 | 0 |

### Comptes ligne par table (vérification non-perte)

| Table | AVANT | APRÈS | Δ |
|---|---|---|---|
| `bookings` | 39 | 39 | **0** ✅ |
| `collaborators` | 4 | 4 | **0** ✅ |
| `contacts` | 13 | 13 | **0** ✅ |
| `audit_logs` | 1089 | 1089 | **0** ✅ |

→ **Aucune ligne créée ni supprimée**. Seul le champ `contactId` de 30 lignes a été modifié.
Toutes les autres données (`visitorName`, `visitorEmail`, `visitorPhone`, `date`, `time`,
`status`, `source`, `notes`, …) sont identiques avant/après (vérifié par snapshot).

### Schéma

| Aspect | AVANT | APRÈS |
|---|---|---|
| Colonnes `bookings` | 34 | 34 (inchangé) |
| Colonnes ajoutées (option C) | — | **0** (audit en JSON git, pas en DB) |
| Triggers | 2 | 2 (inchangé) |
| Indexes | 25 | 25 (inchangé) |

→ **Zéro divergence schéma** créée vs monolithe / CapFinances. Point 7 (alignement) respecté.

---

## 8. `integrity_check`

| Check | Résultat |
|---|---|
| AVANT exécution | `ok` |
| APRÈS exécution | `ok` |
| Re-run idempotence (avant) | `ok` |
| Re-run idempotence (après) | `ok` |

---

## 9. Smoke test prod post-Phase B

| Check | Résultat |
|---|---|
| HTTPS https://calendar360.fr/ | **200** |
| pm2 `calendar360` | **online** (uptime 99m, 143.0 MB RAM, 0 restart) |

---

## 10. Garanties tenues (vs contraintes du brief MH)

| Contrainte | Tenue |
|---|---|
| Aucune suppression | ✅ Aucune ligne deleted (counts identiques avant/après) |
| Aucune activation FK | ✅ `PRAGMA foreign_keys = 0` toujours en vigueur |
| Aucun traitement du monolithe | ✅ Monolithe non touché (script ouvre seulement c-monbilan.db) |
| Périmètre MonBilan uniquement | ✅ CapFinances et monolithe non touchés |
| Champ d'audit additif/idempotent | ✅ Stocké en JSON git (option C), 0 modif schéma |
| 2 bookings `contactId=''` non touchés | ✅ Restent `EMPTY` (vérifié par re-audit) |
| Backup avant modification | ✅ Tarball SHA256 confirmé |
| Transaction atomique | ✅ `db.transaction()` better-sqlite3 |
| `integrity_check` après | ✅ `ok` |
| Idempotence | ✅ Prouvée par re-run (already_applied=18+12) |
| Audit complet (avant/après par row) | ✅ JSON 953 lignes avec snapshot complet |

---

## 11. Rollback (si jamais besoin)

### Option A — Rollback complet via tarball
```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
  pm2 stop calendar360
  cd / && tar xzf /var/backups/planora/db-phaseB/db-phaseB-monbilan-pre-20260420-020343.tar.gz -C /var/www/planora-data/
  sqlite3 /var/www/planora-data/tenants/c-monbilan.db 'PRAGMA integrity_check;'
  pm2 restart calendar360
"
```
→ Restaure l'état exact de 02:03:43 UTC le 2026-04-20.

### Option B — Rollback granulaire via le JSON audit
Le JSON [db-migrations/2026-04-20-phaseB-audit-output.json](db-migrations/2026-04-20-phaseB-audit-output.json)
contient `before_contactId` pour chaque opération. Un script inverse trivial peut générer
les 30 UPDATE inverses :
```sql
UPDATE bookings SET contactId='<before_contactId>' WHERE id='<booking_id>' AND contactId='<after_contactId>';
```
→ Permet d'annuler 1 op spécifique sans toucher aux 29 autres.

---

## 12. État après Phase B (résumé final)

- **MonBilan : 0 orphelin** (était 30)
- **30 bookings ré-attachés** (18 vers leur "vrai" contact recréé, 12 vers placeholder `__deleted__`)
- **0 ligne supprimée** dans aucune table
- **0 modif schéma** dans aucune DB
- **0 divergence créée** vs monolithe / CapFinances
- **Prêt pour activation FK** sur MonBilan (Phase D-tenant) — plus aucun orphelin bloquant

---

## 13. Prochaines étapes (en attente de validation MH)

- **Phase C** — Liste détaillée des dettes du **monolithe** :
  - 13 doublons emails
  - 9 doublons phones
  - 32 bookings + 48 call_logs orphelins
  - Décision case-by-case
- **Phase D** — Activation `foreign_keys = ON`, **MonBilan en premier** (déjà propre maintenant), puis CapFinances, puis monolithe (après Phase C)
- **Phase E** — Re-audit + monitoring
- **Outils alignement futur (point 7)** — diff-schema, schema_version, pre-commit hook (à coder dans une session dédiée)

**Aucune de ces phases n'a été démarrée.** Validation MH requise avant chacune.
