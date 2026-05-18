# R-003 — Rollback complet Phase 1

> **Quand utiliser** : Abandon Phase 1 décidé par MH
> **Source** : Audit 13 §13.3
> **Durée** : ~5 min
> **Impact runtime** : ZÉRO (rien n'a été déployé)

## Contexte

Phase 1 vit dans `feature/phase1-invisible-foundation` isolée — jamais mergée. Rollback = simple checkout clean-main, optionnellement supprimer la branche feature.

## Procédure

### Option A — Conserver la branche (recommandé)

```bash
cd /Users/design/Desktop/PLANORA
git checkout clean-main

# Vérifier état runtime (devrait être inchangé)
export PHASE1_BASELINE_PID=2318858
./ops/r9-protect.sh check-pm2
```

La branche `feature/phase1-invisible-foundation` reste accessible pour reprise future.

### Option B — Supprimer la branche feature

⚠ GO MH explicite obligatoire.

```bash
git checkout clean-main
git branch -D feature/phase1-invisible-foundation

# Remote (si pushée)
ALLOW_DESTRUCTIVE_PUSH=1 git push origin --delete feature/phase1-invisible-foundation
```

### Étape 3 — Documentation

```bash
TS=$(date +%Y%m%d)
cat > HANDOFF-PHASE1-ABANDON-${TS}.md << EOF
# HANDOFF Phase 1 abandon — ${TS}

## Raison
- ...

## État runtime préservé
- PM2 PID: $(ssh root@VPS "pm2 list | grep calendar360 | awk -F'│' '{print \$7}'")
- Bundle MD5: $(ssh root@VPS "md5sum /var/www/vhosts/calendar360.fr/httpdocs/assets/index-*.js | head -1")
- DB SHA: $(ssh root@VPS "sha256sum /var/www/planora-data/calendar360.db | awk '{print \$1}'")

## Branche feature
- État: <conservée|supprimée>
- Tag final: <none>

## Prochaine action
- ...
EOF
```

## Validation

- [ ] Sur clean-main
- [ ] check-pm2 vert (PID 2318858 inchangé)
- [ ] Bundle MD5 inchangé
- [ ] DB SHA inchangé
- [ ] /api/health 200
- [ ] HANDOFF-PHASE1-ABANDON-*.md créé

## Garanties

- **RTO** : ~5 min
- **RPO** : N/A
- **Impact** : ZÉRO (Phase 1 n'a jamais touché le runtime)

## Référence

- Audit 13 §13.3 — Runbook C original
- Audit 14 §12.7 — Rollback immédiat
