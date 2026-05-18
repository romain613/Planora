# R-001 — Démarrer Sprint 0

> **Quand utiliser** : Au démarrage Phase 1, après GO Hardening complet validé
> **Source** : Audit 13 §13.1
> **Durée** : ~30-45 min
> **Impact runtime** : ZÉRO (backup atomique + créa branche locale)
> **GO requis** : MH explicite

## Préconditions

- ✅ Hardening complet exécuté (cf. AUDIT-SAFE-FREEZE-BACKUP-GOVERNANCE-HARDENING-2026-05-18.md §12.1)
- ✅ Pre-commit/commit-msg/pre-push hooks installés + testés
- ✅ ops/r9-protect.sh étendu (phase1 mode green)
- ✅ Scripts VPS installés (planora-backup.sh, integrity-check.sh)
- ✅ Branch protection GitHub clean-main + main activée

## Procédure

### Étape 1 — Vérifier état clean-main

```bash
cd /Users/design/Desktop/PLANORA
git checkout clean-main
git log -1 --oneline
# Attendu: 7ea8a364 fix(planora): agenda buffer alignment ... r11.0.28.b.2
```

### Étape 2 — Vérifier prod runtime intact

```bash
export PHASE1_BASELINE_PID=2318858
export PHASE1_BASELINE_BUNDLE_MD5=63b8d8e17c07620a3b46d8a141256a4b
export PHASE1_BASELINE_BUNDLE_FILENAME=index-B9BAx_hy.js
export PHASE1_BASELINE_DB_SHA=02cca29c11cc095b110506ba374dd4dbd5e7ec56e36fe589d2876a1ea55874dc

./ops/r9-protect.sh phase1
```

Doit être vert. Sinon STOP.

### Étape 3 — Baseline backup triple-redondance

Suivre [R-007-backup-baseline.md](R-007-backup-baseline.md) avec `TYPE=baseline`.

### Étape 4 — DR drill

Suivre [R-008-dr-drill.md](R-008-dr-drill.md).

### Étape 5 — Créer branche feature

```bash
git checkout clean-main
git pull origin clean-main --ff-only
git checkout -b feature/phase1-invisible-foundation
git push -u origin feature/phase1-invisible-foundation
```

### Étape 6 — Tag Sprint 0

```bash
git tag -a phase1-sprint-0-closure -m "Phase 1 Sprint 0 closure — baseline + branche feature + hardening

Baseline:
- HEAD: 7ea8a364 (r11.0.28.b.2)
- PM2 PID: 2318858
- Bundle MD5: 63b8d8e1...
- DB SHA-256: 02cca29c...

Hardening installed:
- Pre-commit/commit-msg/pre-push hooks
- R9-PROTECT phase1 mode + 5 nouveaux checks
- /usr/local/bin/planora-backup.sh + cron auto
- Triple-redondance backup baseline

Refs: Audit 12/13/14"

git push origin phase1-sprint-0-closure
```

### Étape 7 — CHECKPOINT-0 validation

Cocher Audit 13 §1.4 CHECKPOINT-0 checklist + Audit 14 §10.1.
Si toutes vertes → MH dit "GO Sprint 1".

## Validation

- [ ] git status propre sur clean-main avant
- [ ] R9-PROTECT phase1 vert
- [ ] Baseline backup triple-redondance créé + SHA-256 matching
- [ ] DR drill SUCCESS
- [ ] Branche `feature/phase1-invisible-foundation` créée + pushée
- [ ] Tag `phase1-sprint-0-closure` créé + pushé
- [ ] CHECKPOINT-0 checklist 100% verte
- [ ] MH dit "GO Sprint 1" explicitement

## Rollback du runbook

Si problème détecté avant tag :
```bash
git checkout clean-main
git branch -D feature/phase1-invisible-foundation
git push origin --delete feature/phase1-invisible-foundation  # si pushée
```

Si tag créé par erreur :
```bash
# Tag local seulement (pas push)
git tag -d phase1-sprint-0-closure
# Si pushé, le pre-push hook refuse delete → bypass MH only
```

## Garanties

- **RTO** : ~30 min total
- **RPO** : N/A (no data modified)
- **Impact runtime** : ZÉRO

## Référence

- Audit 13 §13.1 — Runbook A original
- Audit 14 §10 — Checklist finale pré-Sprint 0
