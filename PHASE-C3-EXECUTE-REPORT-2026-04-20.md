# PHASE C-3 — Rapport d'exécution Dé-assignation Préau (2026-04-20)

> Périmètre : MONOLITHE (`calendar360.db`) UNIQUEMENT.
> Action : 1 seul UPDATE — dé-assignation de Préau.
> `efef efef` strictement intouché (réservé pour phase future cleanup tests).
> Statut : **✅ SUCCESS**

---

## 1. Backup pré-modification

| Item | Valeur |
|---|---|
| Fichier | `/var/backups/planora/db-phaseC3/db-phaseC3-monolithe-pre-20260420-033649.tar.gz` |
| Taille | 825 KB |
| SHA-256 | `f03245cd1cbdd725844a683dd45bff77f7a03b07354870bb469ad7ecee829ced` |

---

## 2. Audit log durable

| Item | Valeur |
|---|---|
| Fichier audit JSON | [db-migrations/2026-04-20-phaseC3-audit-output.json](db-migrations/2026-04-20-phaseC3-audit-output.json) |
| Script source | [db-migrations/2026-04-20-phaseC3-execute-monolithe-deassign-preau.js](db-migrations/2026-04-20-phaseC3-execute-monolithe-deassign-preau.js) |

---

## 3. Sanity checks pré-exécution

| Check | Résultat |
|---|---|
| `PRAGMA integrity_check` AVANT | `ok` |
| Contact Préau (`ct1774812199599`) existe ? | ✅ oui |
| Préau.assignedTo = `'u1774811266836'` ? | ✅ oui |
| Collab `u1774811266836` toujours inexistant dans `collaborators` ? | ✅ oui (0 rows) — dé-assignation justifiée |
| Contact efef (`ct1774872603359`) existe (contrôle pré) ? | ✅ oui |

---

## 4. Opération effectuée

```sql
UPDATE contacts
   SET assignedTo = ''
 WHERE id = 'ct1774812199599'
   AND assignedTo = 'u1774811266836';
```

**1 row affectée**. Aucune autre opération.

### Avant / Après — Préau

| Champ | AVANT | APRÈS |
|---|---|---|
| id | ct1774812199599 | ct1774812199599 |
| firstname | Préau | Préau |
| lastname | Préau | Préau |
| name | _(vide)_ | _(vide)_ |
| email | Sitbon.alain@creatland.com | Sitbon.alain@creatland.com |
| phone | _(préservé)_ | _(préservé)_ |
| companyId | c1774809632450 (Creatland) | c1774809632450 (Creatland) |
| **assignedTo** | **`u1774811266836`** ⚠ inexistant | **`''`** ✅ FK-safe |

→ Seul `assignedTo` a changé. Tout le reste préservé.

### Contrôle non-régression — efef intouché

Comparaison byte-par-byte du row efef AVANT/APRÈS :

| Champ | AVANT | APRÈS | Identique |
|---|---|---|---|
| id | ct1774872603359 | ct1774872603359 | ✅ |
| firstname | efef | efef | ✅ |
| lastname | _(vide)_ | _(vide)_ | ✅ |
| name | efef | efef | ✅ |
| email | dee | dee | ✅ |
| phone | _(vide)_ | _(vide)_ | ✅ |
| companyId | comp-first | comp-first | ✅ |
| assignedTo | u-rcsitbon | u-rcsitbon | ✅ |

→ **efef strictement intouché** (vérifié par sanity check 6 dans le script — `JSON.stringify` égalité).

---

## 5. Test idempotence (re-run)

| Item | Valeur |
|---|---|
| `preau_rows_changed` | **0** ✅ (attendu : 0) |
| `preau_already_applied` | **True** ✅ |
| `efef_intouched` | True |
| `contacts_to_collab_orphans_remaining_global` | **1** (= efef seul, conforme demande) |
| `integrity_after` | `ok` |

→ Idempotence parfaite : le `WHERE assignedTo='u1774811266836'` ne match plus
(assignedTo est maintenant `''`), donc 0 row touchée.

---

## 6. État global après C-3

### Contacts → collab inexistant

| AVANT C-3 | APRÈS C-3 |
|---|---|
| 2 contacts orphans : Préau + efef | 1 contact orphan : efef seul (conservé volontairement) |

### Comptes ligne par table (vérification non-perte)

| Table | Pré C-3 | Post C-3 | Δ |
|---|---|---|---|
| `bookings` | 48 | 48 | 0 ✅ |
| `collaborators` | 12 | 12 | 0 ✅ |
| `contacts` | 288 | 288 | 0 ✅ — pure UPDATE de `assignedTo` |
| `call_logs` | 227 | 227 | 0 ✅ |
| `audit_logs` | 1494 | 1494 | 0 ✅ |

→ Aucune création ni suppression. 1 seul UPDATE, 1 seul champ modifié.

---

## 7. `integrity_check`

| Check | Résultat |
|---|---|
| AVANT exécution | `ok` |
| APRÈS exécution | `ok` |
| Re-run idempotence | `ok` |

---

## 8. Smoke test prod post-Phase C-3

| Check | Résultat |
|---|---|
| HTTPS https://calendar360.fr/ | **200** |
| pm2 `calendar360` | **online** (uptime 3h, 146.6 MB RAM, 0 restart) |

---

## 9. Garanties tenues (vs contraintes du brief MH)

| Contrainte | Tenue |
|---|---|
| Dé-assigner Préau (assignedTo='') | ✅ Fait |
| Ne pas supprimer Préau | ✅ Préau toujours en base, juste assignedTo vidé |
| Ne pas supprimer efef | ✅ efef intouché (vérification byte-par-byte) |
| Aucune autre action | ✅ 1 seul UPDATE total |
| Aucune activation FK | ✅ |
| Aucune modif schéma | ✅ |
| Backup avant | ✅ Tarball SHA256 `f03245cd…29ced` |
| Transaction | ✅ |
| `integrity_check` après | ✅ ok |
| Audit JSON en git | ✅ |
| Sous-phase indépendante | ✅ (n'affecte pas C-1/C-2/C-4/D) |

---

## 10. Rollback

### Option A — Tarball
```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
  pm2 stop calendar360
  cd / && tar xzf /var/backups/planora/db-phaseC3/db-phaseC3-monolithe-pre-20260420-033649.tar.gz -C /var/www/planora-data/
  sqlite3 /var/www/planora-data/calendar360.db 'PRAGMA integrity_check;'
  pm2 restart calendar360
"
```
→ Restaure l'état exact de 03:36:49 UTC le 2026-04-20 (rollback C-3 uniquement,
préserve C-1 + C-2).

### Option B — UPDATE inverse manuel
```sql
UPDATE contacts SET assignedTo = 'u1774811266836' WHERE id = 'ct1774812199599';
```
(rollback unitaire de la dé-assignation)

---

## 11. Bilan global C-1 + C-2 + C-3

| Métrique | Pré C-1 | Post C-3 | Δ |
|---|---|---|---|
| Bookings orphans | 32 | **0** | −32 ✅ |
| Call_logs orphans | 48 | **0** | −48 ✅ |
| Contacts → collab orphans | 2 | **1** (efef gardé) | −1 |
| Bookings PLACEHOLDER `__deleted__` | 0 | 12 | +12 |
| Call_logs PLACEHOLDER `__deleted__` | 0 | 41 | +41 |
| Contacts (count total) | 287 | 288 | +1 (`__deleted__` placeholder) |
| Schéma modifié | — | 0 | — |
| Lignes supprimées | — | 0 | — |
| `integrity_check` | ok | ok | ok |
| Prod HTTPS / pm2 | 200 / online | 200 / online | inchangé |

---

## 12. Reste à faire

- **Phase C-4** — Cleanup fixtures `c1` (40 contacts) : **bloqué** en attente PR frontend
  fix `companyId=c1` dans [`fixtures.js`](app/src/data/fixtures.js)
- **Phase nettoyage tests** (futur) — traiter `efef efef` + autres contacts test similaires
- **Phase D** — FK ON, **après** validation explicite MH (recommandé : tenants-first
  car déjà propres post Phase B)
- **Outils alignement futur (point 7)** — diff-schema, schema_version, pre-commit hook

**Aucune action prise hors C-3.** En attente de tes instructions pour la suite.
