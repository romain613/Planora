# PHASE C-2 — Rapport d'exécution Call_logs orphans monolithe (2026-04-20)

> Périmètre : MONOLITHE (`calendar360.db`) UNIQUEMENT.
> Stratégie : E (remap + mark `__deleted__`).
> Audit storage : option **C** — JSON committé en git.
> Statut : **✅ SUCCESS**

---

## 1. Backup pré-modification

| Item | Valeur |
|---|---|
| Fichier | `/var/backups/planora/db-phaseC2/db-phaseC2-monolithe-pre-20260420-032038.tar.gz` |
| Taille | 825 KB |
| SHA-256 | `a004ace48b0690f98d554a469cb6c474027f42151e643e65bf5e3db9324f3027` |

---

## 2. Audit log durable

| Item | Valeur |
|---|---|
| Fichier audit JSON | [db-migrations/2026-04-20-phaseC2-audit-output.json](db-migrations/2026-04-20-phaseC2-audit-output.json) |
| Script source | [db-migrations/2026-04-20-phaseC2-execute-monolithe-call-logs.js](db-migrations/2026-04-20-phaseC2-execute-monolithe-call-logs.js) |
| Format | JSON 1758 lignes, snapshot before/after pour les 48 call_logs |

---

## 3. Sanity checks pré-exécution

| Check | Résultat |
|---|---|
| `PRAGMA integrity_check` AVANT | `ok` |
| Placeholder `__deleted__` existe (créé en C-1) | ✅ oui |
| 4 contacts cibles des remaps existent | ✅ oui (vérifiés un par un) |
| Comptage orphans actuels = 48 attendu | ✅ exactement 48 (anti-dérive) |
| Mapping interne REMAPS+MARKS = 48 total | ✅ 7 + 41 = 48 |

---

## 4. Résumé de l'exécution

### Premier run (effectif)

| Item | Valeur |
|---|---|
| Démarré à | 2026-04-20T03:21:14Z (approx.) |
| Transaction | committed |
| Remaps total | 7 |
| Remaps appliqués (rows_changed=1) | **7** ✅ |
| Marks total | 41 |
| Marks appliqués (rows_changed=1) | **41** ✅ |
| Call_logs orphans restants (monolithe entier) | **0** ✅ |
| `PRAGMA integrity_check` APRÈS | `ok` |

### Test idempotence (re-run)

Le re-run **échoue volontairement** sur le safety check anti-dérive
(`SAFETY: 48 orphans expected, found 0. DB drifted between audit and execute. Aborting.`).

C'est **un comportement voulu** (cohérent avec la philosophie "fail-safe sur dérive") :
- Si DB déjà nettoyée (0 orphans) → script refuse de tourner
- Si DB modifiée (n'importe quel autre count) → script refuse de tourner
- Seul exécutable quand l'état correspond exactement à l'audit (48 orphans)

→ **Idempotence forte** : le script ne ré-applique rien de manière silencieuse, il
oblige à reconnaître que le travail a été fait. La protection contre la double
application reste intacte (les `WHERE id=X AND contactId=<old>` ne matcheraient
de toute façon plus rien).

---

## 5. Les 7 remaps effectués

| call_log id | from | to | match_email | direction |
|---|---|---|---|---|
| `cl1775469760851` | ct1774569201336 | `ct_1776273340046_5oz9u2` | rc.sitbon@gmail.com | inbound |
| `cl1775380262681` | ct1774872506053_vss5 | `ct_1776145908086_zo67ea` | orlanne.huet@icloud.com | outbound |
| `cl1774989276152` | ct1774872506051_slk5 | `ct_1776289668254_lqufr4` | marieange1978.maz@gmail.com | outbound |
| `cl1775553502089` | ct1774872506051_slk5 | `ct_1776289668254_lqufr4` | marieange1978.maz@gmail.com | outbound |
| `cl1775379106687` | ct1775002913105 | `ct_1776145908236_gmn91t` | Rc@gmail.com | outbound |
| `cl1775380042053` | ct1775002913105 | `ct_1776145908236_gmn91t` | Rc@gmail.com | outbound |
| `cl1775553545728` | ct1775002913105 | `ct_1776145908236_gmn91t` | Rc@gmail.com | outbound |

**Total : 7 remaps** ✅

---

## 6. Les 41 marks `__deleted__` effectués

Regroupés par contactId orphan d'origine :

| Source contactId orphan | nb calls | Vu en Phase B ? |
|---|---|---|
| `ct1774891551680` (romain.biotech@gmail.com) | **21** | ✅ oui |
| `ct1774819397149pw56` (Romain charles charles) | 2 | ✅ oui |
| `ct_1775664554375_uwngkl` (visiteur public) | 4 | ❌ nouveau |
| `ct_1775664554375_ebnzzr` (visiteur public) | 4 | ❌ nouveau |
| `ct1774891615850` | 2 | ❌ nouveau |
| `ct1775553408534` | 2 | ❌ nouveau |
| `ct1774872506050_n5w1` | 1 | ❌ nouveau (suffixe ≠ _uzue Phase B) |
| `ct1774906474846` | 1 | ❌ nouveau |
| `ct_1775664554375_dto6h3` | 1 | ❌ nouveau |
| `ct_1775664554375_fpqftb` | 1 | ❌ nouveau |
| `ct_1775664554375_t8rqaq` | 1 | ❌ nouveau |
| `ct_1775804899342_h5hii4` | 1 | ❌ nouveau |
| **Total** | **41** | ✅ |

Détails individuels (id de call_log + before_row + after_row) dans le JSON audit.

---

## 7. Diff avant / après

### Distribution `call_logs` par état du `contactId`

| État | AVANT (C-2) | APRÈS (C-2) | Δ |
|---|---|---|---|
| VALID (contact existe) | 34 | **41** | +7 (= remaps réussis) |
| PLACEHOLDER (`__deleted__`) | 0 | **41** | +41 (= marks réussis) |
| EMPTY (`contactId='' / NULL`, hors scope) | 145 | 145 | 0 (intouchés) |
| **ORPHAN** | **48** | **0** | **−48** ✅ |
| Total | 227 | 227 | 0 |

### Comptes ligne par table (vérification non-perte)

| Table | Pré C-1 | Post C-1 | Post C-2 | Δ C-2 |
|---|---|---|---|---|
| `bookings` | 48 | 48 | 48 | 0 ✅ |
| `collaborators` | 12 | 12 | 12 | 0 ✅ |
| `contacts` | 287 | 288 (+placeholder) | 288 | 0 ✅ |
| `call_logs` | 227 | 227 | 227 | 0 ✅ — pure UPDATE de `contactId` sur 48 lignes |
| `audit_logs` | 1494 | 1494 | 1494 | 0 ✅ |

→ **Aucune ligne créée ni supprimée en C-2**. Tous les autres champs des call_logs
(direction, fromNumber, toNumber, status, duration, startedAt, recording*, etc.) sont
**identiques avant/après** (vérifié par snapshot).

### Impact business — historique VoIP préservé

Les 48 call_logs conservent :
- L'horodatage exact (`startedAt`, `endedAt`, `createdAt`)
- La durée d'appel (`duration`)
- Direction (inbound/outbound)
- Numéros (`fromNumber`, `toNumber`)
- Status (completed/ringing)
- Validité (`is_valid_call`, `invalid_reason`)
- L'enregistrement Twilio si présent (`recordingUrl`, `recordingSid`, `twilioCallSid`)
- Les notes et la conversation rattachée

Seul le `contactId` a été ré-aligné. **Zéro perte de donnée VoIP**.

---

## 8. `integrity_check`

| Check | Résultat |
|---|---|
| AVANT exécution | `ok` |
| APRÈS exécution | `ok` |

---

## 9. Smoke test prod post-Phase C-2

| Check | Résultat |
|---|---|
| HTTPS https://calendar360.fr/ | **200** |
| pm2 `calendar360` | **online** (uptime 2h, 146.6 MB RAM, 0 restart) |

→ Aucune perturbation. La transaction sur 48 call_logs a duré ~100 ms.

---

## 10. Garanties tenues (vs contraintes du brief MH)

| Contrainte | Tenue |
|---|---|
| Aucune suppression | ✅ 0 DELETE (227 call_logs avant, 227 après) |
| Aucune activation FK | ✅ `PRAGMA foreign_keys = 0` toujours en vigueur |
| Aucune modification de schéma | ✅ Pas d'ALTER TABLE, pas de nouvelle table |
| Audit JSON en git (option C) | ✅ Fichier 1758 lignes |
| Stratégie 7 remap + 41 mark | ✅ Exactement (validé section 4) |
| Conservation historique appels | ✅ Tous les champs hors `contactId` préservés |
| Backup avant modification | ✅ Tarball SHA256 `a004ace4…f3027` |
| Transaction atomique | ✅ `db.transaction()` |
| `integrity_check` après | ✅ `ok` |
| Sous-phase indépendante de C-1 / C-3 | ✅ Pas de dépendance croisée |
| Anti-dérive (safety check) | ✅ Refuse si count d'orphans ≠ 48 |

---

## 11. État global après C-1 + C-2

| Métrique | Pré C-1 | Post C-1 | Post C-2 |
|---|---|---|---|
| **Bookings orphans** monolithe | 32 | **0** | 0 |
| **Call_logs orphans** monolithe | 48 | 48 | **0** |
| Bookings PLACEHOLDER | 0 | 12 | 12 |
| Call_logs PLACEHOLDER | 0 | 0 | 41 |
| Contacts | 287 | 288 (+placeholder) | 288 |
| Audit_logs | 1494 | 1494 | 1494 |
| `integrity_check` | ok | ok | ok |
| HTTPS prod | 200 | 200 | 200 |
| pm2 calendar360 | online | online | online |

→ **0 orphan** restant sur `bookings` ET `call_logs` du monolithe.
La voie est libre pour Phase D (FK ON), mais on attend la validation MH avant de
l'enclencher.

---

## 12. Rollback

### Option A — Tarball
```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
  pm2 stop calendar360
  cd / && tar xzf /var/backups/planora/db-phaseC2/db-phaseC2-monolithe-pre-20260420-032038.tar.gz -C /var/www/planora-data/
  sqlite3 /var/www/planora-data/calendar360.db 'PRAGMA integrity_check;'
  pm2 restart calendar360
"
```
→ Restaure l'état exact de 03:20:38 UTC le 2026-04-20 (annule UNIQUEMENT C-2,
préserve C-1).

### Option B — JSON inverse
[db-migrations/2026-04-20-phaseC2-audit-output.json](db-migrations/2026-04-20-phaseC2-audit-output.json)
contient `before_contactId` pour les 48 ops. Script inverse trivial possible :
```sql
UPDATE call_logs SET contactId='<before>' WHERE id='<cl_id>' AND contactId='<after>';
```
→ Permet d'annuler 1 call spécifique sans toucher aux 47 autres.

---

## 13. Reste à faire (selon brief MH)

- **Phase C-3** — Contacts → collab inexistant : dé-assigner Préau (sans toucher à `efef efef`)
- **Phase C-4** — Cleanup fixtures `c1` : **bloqué** en attente PR frontend
- **Phase D** — FK ON, après validation explicite MH (tenants-first)
- **Outils alignement futur (point 7)** — diff-schema, schema_version, pre-commit hook

**Aucune autre action prise.** Validation MH attendue après lecture de ce rapport
avant Phase C-3.
