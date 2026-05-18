# R-006 — Vérification invariants I1, I2, I3, I4

> **Quand utiliser** : Avant chaque CHECKPOINT Phase 1, ou après toute action suspecte
> **Source** : Audit 13 §13.6 + Audit 14 §7
> **Durée** : ~10 secondes
> **Impact runtime** : ZÉRO (READ-ONLY)

## Préconditions

- SSH `~/.ssh/id_ed25519` fonctionnel vers VPS
- Variables baseline exportées dans le shell (cf. PHASE1-BASELINE.md)

## Procédure

### Méthode 1 — Script R9-PROTECT phase1 (recommandée)

```bash
# Depuis Mac MH, /Users/design/Desktop/PLANORA

# Charger les variables baseline (à faire 1× par session shell)
export PHASE1_BASELINE_PID=2318858
export PHASE1_BASELINE_BUNDLE_MD5=63b8d8e17c07620a3b46d8a141256a4b
export PHASE1_BASELINE_BUNDLE_FILENAME=index-B9BAx_hy.js
export PHASE1_BASELINE_DB_SHA=02cca29c11cc095b110506ba374dd4dbd5e7ec56e36fe589d2876a1ea55874dc

# Lancer R9-PROTECT phase1 (4 checks invariants)
./ops/r9-protect.sh phase1
```

**Sortie attendue (tout vert)** :
```
[r9] DB check — intégrité + FK (READ-ONLY via SSH)
[r9] calendar360.db integrity : ok
[r9] calendar360.db FK : clean
[r9] control_tower.db integrity : ok
[r9] control_tower.db FK : clean
[r9] PM2 check — PID + status (jq parsing)
[r9] PM2 PID stable : 2318858
[r9] PM2 status : online
[r9] PM2 restart_count : 177
[r9] Routes check — invariant I2 (aucune route shared/ montée)
[r9] server/index.js : aucune route shared/ montée
[r9] Invariants check — I1, I2, I3, I4
[r9] I1 : aucun fichier legacy modifié
[r9] I3 : bundle MD5 inchangé (63b8d8e17c07620a3b46d8a141256a4b)
[r9] I4 : DB SHA-256 inchangé
[r9] R9-PROTECT phase1 : TOUS LES CHECKS PASSENT
```

Exit code 0 = tout vert. Exit code ≠ 0 = STOP, voir docs/STOP-CONDITIONS.md.

### Méthode 2 — Checks manuels individuels

Si R9-PROTECT phase1 fail, identifier le check individuel rouge :

```bash
./ops/r9-protect.sh check-db
./ops/r9-protect.sh check-pm2
./ops/r9-protect.sh check-routes
./ops/r9-protect.sh check-invariants
```

## Validation

- [ ] Exit code 0
- [ ] PID PM2 = 2318858 (baseline)
- [ ] Bundle MD5 = `63b8d8e1...` (baseline)
- [ ] DB SHA-256 = `02cca29c...` (baseline, peut warning si writes runtime — normal)
- [ ] `integrity_check` = ok pour 2 DBs
- [ ] `foreign_key_check` = vide pour 2 DBs
- [ ] Aucune route shared/ montée
- [ ] Aucun fichier legacy modifié (si branche feature/phase1-*)

## Si check rouge

| Check rouge | Action |
|---|---|
| `PM2 PID changé` | STOP immédiat. Investigation : `pm2 logs calendar360 --err`. Vérifier si restart non autorisé. |
| `Bundle MD5 changé` | STOP. Vérifier qu'aucun deploy frontend a été lancé. Restore bundle si nécessaire (R-009). |
| `DB SHA-256 changé` (warning seul) | Normal si writes runtime légitimes. Suspect si pendant Phase 1 et hors heure de pointe. |
| `integrity_check ≠ ok` | STOP critique. DB corrompue. Restore baseline (R-005). |
| `FK violations > 0` | STOP. Investigation FK. Hot incident. |
| `Route shared/ montée` | STOP. Violation I2. Identifier le mount, retirer immédiatement. |
| `Fichier legacy modifié` | STOP. Violation I1. Revert le fichier sur branche feature. |

## Rollback du runbook lui-même

Aucun — runbook READ-ONLY.

## Garanties

- **RTO** : N/A (vérification, pas action)
- **RPO** : N/A
- **Impact** : zéro (READ-ONLY)
- **Préconditions** : ssh + jq sur VPS (déjà installés)

## Référence

- Audit 13 §13.6 — Runbook F original
- Audit 14 §7 — R9-PROTECT hardening
- [PHASE1-BASELINE.md](../PHASE1-BASELINE.md) — valeurs baseline
