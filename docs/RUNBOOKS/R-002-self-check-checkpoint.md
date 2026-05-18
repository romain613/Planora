# R-002 — Self-check fin de sprint (Claude/MH)

> **Quand utiliser** : Avant proposer CHECKPOINT-N GO à MH (fin Sprint 1, 2, 3, 4)
> **Source** : Audit 13 §13.2
> **Durée** : ~5 min
> **Impact runtime** : ZÉRO (READ-ONLY)

## Procédure

```bash
cd /Users/design/Desktop/PLANORA

# Charger baseline
export PHASE1_BASELINE_PID=2318858
export PHASE1_BASELINE_BUNDLE_MD5=63b8d8e17c07620a3b46d8a141256a4b
export PHASE1_BASELINE_BUNDLE_FILENAME=index-B9BAx_hy.js
export PHASE1_BASELINE_DB_SHA=02cca29c11cc095b110506ba374dd4dbd5e7ec56e36fe589d2876a1ea55874dc

# 1. R9-PROTECT phase1 (4 checks)
./ops/r9-protect.sh phase1

# 2. Diff scope Phase 1 (uniquement server/shared/ + .eslint + README + docs autorisés)
echo ""
echo "=== Files modified vs clean-main ==="
git diff --name-only clean-main..HEAD | grep -vE '^(server/shared/|\.eslintrc|server/shared/README\.md|\.gitignore|docs/|INCIDENTS/|ops/r9-protect)' | head -10
# Attendu: vide

# 3. Tests shared/
echo ""
echo "=== npm test shared/ ==="
cd server && npm test -- shared/ 2>&1 | tail -10
cd ..

# 4. Smoke V1 baseline (vérif aucun effet de bord UX)
echo ""
echo "=== Smoke V1 ==="
cd ops/smoke && node collab-smoke.mjs 2>&1 | tail -5
cd ../..

# 5. Health VPS
echo ""
echo "=== /api/health ==="
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "curl -s --max-time 5 http://localhost:3001/api/health"
```

## Validation

- [ ] R9-PROTECT phase1 vert (exit 0)
- [ ] Diff hors scope vide
- [ ] Tests shared/ verts
- [ ] Smoke V1 vert
- [ ] /api/health 200

## Si rouge

Identifier le check rouge spécifique, voir [STOP-CONDITIONS.md](../STOP-CONDITIONS.md), escalade MH.

## Garanties

- Impact : zéro (READ-ONLY)
- Couvre : invariants I1-I4 + tests + smoke + health

## Référence

- Audit 13 §13.2 — Runbook B original
- Audit 13 §9.3 — Checklist self-check
