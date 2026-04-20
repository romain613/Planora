# PHASE C-1 — Rapport d'exécution Bookings orphans monolithe (2026-04-20)

> Périmètre : MONOLITHE (`calendar360.db`) UNIQUEMENT.
> Stratégie : E (remap par email + mark `__deleted__`) — identique Phase B.
> Audit storage : option **C** — JSON committé en git.
> Statut : **✅ SUCCESS**

---

## 1. Backup pré-modification

| Item | Valeur |
|---|---|
| Fichier | `/var/backups/planora/db-phaseC1/db-phaseC1-monolithe-pre-20260420-030653.tar.gz` |
| Taille | 825 KB |
| SHA-256 | `ae0dd9fb11f7f106ccad76626f897e488f5a904f3096cb12a8b624794aed6209` |
| Contenu | `calendar360.db` (uniquement, monolithe) |

---

## 2. Audit log durable

| Item | Valeur |
|---|---|
| Fichier audit JSON | [db-migrations/2026-04-20-phaseC1-audit-output.json](db-migrations/2026-04-20-phaseC1-audit-output.json) |
| Script source | [db-migrations/2026-04-20-phaseC1-execute-monolithe-bookings.js](db-migrations/2026-04-20-phaseC1-execute-monolithe-bookings.js) |
| Format | JSON 1080 lignes, snapshot before/after pour les 32 bookings |
| Persistance | Repo git |

---

## 3. Sanity checks pré-exécution

| Check | Résultat |
|---|---|
| `PRAGMA integrity_check` AVANT | `ok` |
| Les 7 contacts cibles existent dans monolithe ? | ✅ oui (vérifié row par row) |
| Placeholder `__deleted__` existe AVANT ? | ❌ non — créé par le script (1 INSERT additif) |
| Placeholder `__deleted__` existe APRÈS création ? | ✅ oui |

---

## 4. INSERT additif du placeholder `__deleted__`

| Champ | Valeur insérée | Raison |
|---|---|---|
| id | `__deleted__` | Identifiant placeholder |
| companyId | `c-monbilan` | Mirror exact de la tenant (toutes les marks viennent de bookings c-monbilan) |
| name | `[Contact supprime]` | Seule colonne `NOT NULL` de la table contacts |
| status | `prospect` | Mirror tenant |
| pipeline_stage | `nouveau` | Mirror tenant |
| Autres champs | NULL/empty (defaults) | — |

→ **1 row ajouté à `contacts`** (count : 287 → 288). Strictement additif, idempotent
(`INSERT OR IGNORE`).

---

## 5. Résumé de l'exécution

### Premier run (effectif)

| Item | Valeur |
|---|---|
| Démarré à | 2026-04-20T03:07:30Z (approx.) |
| Durée | ~40 ms |
| Transaction | committed |
| Placeholder `__deleted__` créé | **oui** |
| Remaps total | 20 (18 Phase B + 2 nouveaux test002) |
| Remaps appliqués (rows_changed=1) | **20** ✅ |
| Marks total | 12 (identique Phase B) |
| Marks appliqués (rows_changed=1) | **12** ✅ |
| Orphans restants (monolithe entier) | **0** ✅ |
| `PRAGMA integrity_check` APRÈS | `ok` |

### Test idempotence (re-run immédiat)

| Item | Valeur |
|---|---|
| Placeholder créé | **False** (déjà existant) ✅ |
| Remaps appliqués | 0 |
| Remaps déjà appliqués | **20** ✅ |
| Marks appliqués | 0 |
| Marks déjà appliqués | **12** ✅ |
| Orphans restants | **0** ✅ |

→ Idempotence validée. Le `WHERE id=X AND contactId=<old>` ne matche plus au 2e passage,
et `INSERT OR IGNORE` no-op sur le placeholder déjà présent.

---

## 6. Les 20 remaps effectués

Détails complets dans [db-migrations/2026-04-20-phaseC1-audit-output.json](db-migrations/2026-04-20-phaseC1-audit-output.json).

### 18 remaps identiques Phase B

| Cible | nb | email matché |
|---|---|---|
| `ct_1776273340046_5oz9u2` | 9 | rc.sitbon@gmail.com |
| `ct_1776145908058_wtaru9` | 3 | Melie.guillot@outlook.fr |
| `ct_1776145908236_gmn91t` | 3 | Rc@gmail.com |
| `ct_1776145908086_zo67ea` | 1 | orlanne.huet@icloud.com |
| `ct_1776206683167_iwx8p2` | 1 | juju@gmail.com |
| `ct_1776289668254_lqufr4` | 1 | marieange1978.maz@gmail.com |
| **Sous-total** | **18** | (idem Phase B) |

### 2 nouveaux remaps Phase C-1 (test002)

| id booking | from | to | email |
|---|---|---|---|
| `bk1776374105401` | `ct_1776362792698_ikea68` | `ct_1776535124719_e3g4j8` | test002@gmail.com |
| `b_inter_1776374144922_dbk1e3` | `ct_1776362792698_ikea68` | `ct_1776535124719_e3g4j8` | test002@gmail.com |

**Total : 20 remaps** ✅

---

## 7. Les 12 bookings marqués `__deleted__` (identique Phase B)

| Source contactId orphan | nb | description |
|---|---|---|
| `ct1774891551680` | 9 | romain.biotech@gmail.com (sans contact actif équivalent) |
| `ct1774907550965` | 1 | sitbon alain (orphelin pur) |
| `ct1774819397149pw56` | 1 | Romain charles charles (orphelin pur) |
| `ct17757957649807a5g` | 1 | Romain Sitbon tel 0616367116 (orphelin pur) |
| **Total** | **12** | ✅ |

---

## 8. Diff avant / après (monolithe entier)

### Distribution `bookings` par état du `contactId`

| État | AVANT (Phase C-1) | APRÈS (Phase C-1) | Δ |
|---|---|---|---|
| VALID (contact existe) | 11 | **31** | +20 (= remaps réussis) |
| PLACEHOLDER (`__deleted__`) | 0 | **12** | +12 (= marks réussis) |
| EMPTY (`contactId=''/NULL`, public propre) | 5 | 5 | 0 (intouchés) |
| ORPHAN (contactId pointe nulle part) | **32** | **0** | **−32** ✅ |
| Total | 48 | 48 | 0 |

### Distribution par companyId (post C-1)

| companyId | total bookings | empty cid | placeholder | orphans |
|---|---|---|---|---|
| (vide) | 2 | 2 | 0 | 0 |
| **c-monbilan** | **41** | 2 | 12 | **0** ✅ |
| c1775722958849 | 2 | 0 | 0 | 0 |
| c1776169036725 (CapFinances) | 2 | 0 | 0 | 0 |
| comp-first | 1 | 1 | 0 | 0 |

### Comptes ligne par table (vérification non-perte)

| Table | AVANT | APRÈS | Δ | Note |
|---|---|---|---|---|
| `bookings` | 48 | 48 | 0 ✅ | Aucune création/suppression, juste UPDATE de `contactId` sur 32 lignes |
| `collaborators` | 12 | 12 | 0 ✅ | Non touché |
| `contacts` | 287 | **288** | **+1** | INSERT placeholder `__deleted__` (additif, prévu) |
| `call_logs` | 227 | 227 | 0 ✅ | Hors scope C-1 (sera Phase C-2) |
| `audit_logs` | 1494 | 1494 | 0 ✅ | Non touché |

→ Exception attendue : +1 contact (`__deleted__`) ajouté de manière additive.
Toutes les autres données préservées.

---

## 9. `integrity_check`

| Check | Résultat |
|---|---|
| AVANT exécution | `ok` |
| APRÈS exécution | `ok` |
| Re-run idempotence (avant) | `ok` |
| Re-run idempotence (après) | `ok` |

---

## 10. Smoke test prod post-Phase C-1

| Check | Résultat |
|---|---|
| HTTPS https://calendar360.fr/ | **200** |
| pm2 `calendar360` | **online** (uptime 2h, 143.1 MB RAM, 0 restart) |

→ Aucune perturbation runtime. Les UPDATE en transaction sur 32 lignes sont passés
en moins de 40 ms sans bloquer le pm2.

---

## 11. Garanties tenues (vs contraintes du brief MH)

| Contrainte | Tenue |
|---|---|
| Aucune suppression | ✅ 0 DELETE (counts identiques sauf +1 INSERT additif) |
| Aucune activation FK | ✅ `PRAGMA foreign_keys = 0` toujours en vigueur |
| Aucune modification de schéma | ✅ 0 ALTER TABLE (le row INSERT n'est pas du schema) |
| Audit JSON en git (option C) | ✅ Fichier `db-migrations/2026-04-20-phaseC1-audit-output.json` |
| Stratégie remap + `__deleted__` | ✅ Identique Phase B + 2 nouveaux test002 |
| Inclure les 2 nouveaux test002 | ✅ Remappés vers `ct_1776535124719_e3g4j8` |
| Backup avant modification | ✅ Tarball SHA256 `ae0dd9fb…ed6209` |
| Transaction atomique | ✅ `db.transaction()` better-sqlite3 |
| `integrity_check` après | ✅ `ok` |
| Idempotence | ✅ Re-run = 0 modif, placeholder déjà existant |
| 4 sous-phases indépendantes | ✅ Cette phase couvre uniquement C-1 (bookings) |

---

## 12. Note technique : INSERT du placeholder `__deleted__`

Pour faire fonctionner les 12 marks, le placeholder `__deleted__` devait exister dans
`contacts` du monolithe. Il existait dans la tenant MonBilan (préexistant à mes
manipulations) mais pas dans le monolithe.

**Décision prise** : créer le placeholder dans le monolithe en mirror exact de celui de
la tenant. Cette opération est :
- **additive** (pas de schéma modifié, juste 1 row INSERT)
- **idempotente** (`INSERT OR IGNORE`, no-op si déjà présent)
- **non destructive** (rien ne casse pour les autres requêtes)
- **prévue par la stratégie E** (validée par MH comme stratégie globale en Phase B)

Il s'agit donc d'une étape implicitement nécessaire à la stratégie validée, exécutée
au sein de la transaction principale. Documenté ici pour transparence totale.

---

## 13. Rollback (si jamais besoin)

### Option A — Rollback complet via tarball
```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
  pm2 stop calendar360
  cd / && tar xzf /var/backups/planora/db-phaseC1/db-phaseC1-monolithe-pre-20260420-030653.tar.gz -C /var/www/planora-data/
  sqlite3 /var/www/planora-data/calendar360.db 'PRAGMA integrity_check;'
  pm2 restart calendar360
"
```
→ Restaure l'état exact de 03:06:53 UTC le 2026-04-20.

### Option B — Rollback granulaire via le JSON audit
[db-migrations/2026-04-20-phaseC1-audit-output.json](db-migrations/2026-04-20-phaseC1-audit-output.json)
contient `before_contactId` et `after_contactId` pour les 32 ops. Un script inverse
trivial peut générer les 32 UPDATE inverses + supprimer le placeholder créé :
```sql
DELETE FROM contacts WHERE id='__deleted__';
UPDATE bookings SET contactId='<before>' WHERE id='<bk>' AND contactId='<after>';
```
(à condition qu'aucun autre booking ne pointe vers `__deleted__`, ce qui est vrai
maintenant mais devrait être vérifié au moment du rollback)

---

## 14. État après Phase C-1 (résumé final)

- **Monolithe : 0 booking orphan** (était 32)
- **32 bookings ré-attachés** (20 vers vrais contacts recréés, 12 vers placeholder `__deleted__`)
- **+1 contact** (`__deleted__` placeholder additif, mirror tenant)
- **0 ligne supprimée** dans aucune table
- **0 modif schéma** (pas d'ALTER)
- **Cohérent avec Phase B** sur la tenant MonBilan
- **Prêt pour Phase D-tenant** sur c-monbilan : aucun booking orphan ne bloquera FK ON

---

## 15. Prochaines étapes (en attente de validation MH)

Conformément au brief :
- **Phase C-2** — Call_logs orphans (48 rows : 7 remaps + 41 marks `__deleted__`)
- **Phase C-3** — Contacts→collab : dé-assigner Préau (sans toucher à `efef efef`)
- **Phase C-4** — Cleanup fixtures `c1` : **bloqué** en attente PR frontend
- **Phase D** — FK ON, **après** validation C-1 + C-2
- **Outils alignement futur (point 7)** — diff-schema, schema_version, pre-commit hook

**Aucune de ces phases n'a été démarrée.** Validation MH requise après lecture
de ce rapport.
