# R-009 — Rollback bundle frontend

> **Quand utiliser** : Bundle déployé buggué, MD5 différent vs baseline, régression UX
> **Source** : Audit 14 §3.2
> **Durée** : ~5-15 min
> **Impact runtime** : ZÉRO côté backend (frontend statique seul)
> **GO requis** : MH explicite si Phase 1 (anormal)

## Préconditions

- Backup httpdocs récent disponible (`/var/backups/planora/*-httpdocs.tar.gz`)
- GO MH si Phase 1 (Phase 1 ne devrait JAMAIS déclencher rollback bundle)

## Méthode A — Restore depuis tarball backup (rapide ~5 min)

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 << 'EOF'
set -e

# 1. Identifier dernier backup httpdocs valide
LATEST=$(ls -t /var/backups/planora/*-httpdocs.tar.gz | head -5)
echo "Available backups:"
echo "$LATEST"
echo ""
# Choisir le bon (typiquement le pre-deploy avant la régression)
BACKUP=$(echo "$LATEST" | head -1)
echo "Selected: $BACKUP"

# 2. Backup état cassé pour autopsie
TS=$(date +%Y%m%d-%H%M%S)
tar czf "/var/backups/planora/CRASH-${TS}-httpdocs.tar.gz" \
  -C /var/www/vhosts/calendar360.fr/httpdocs .
echo "Pre-rollback snapshot: /var/backups/planora/CRASH-${TS}-httpdocs.tar.gz"

# 3. Restore via extraction (NE PAS rm -rf, préserve fichiers exclus)
tar xzf "$BACKUP" -C /var/www/vhosts/calendar360.fr/httpdocs/

# 4. Vérifier
echo ""
echo "=== Bundle après restore ==="
ls -la /var/www/vhosts/calendar360.fr/httpdocs/assets/index-*.js | tail -5
echo ""
echo "=== Health ==="
curl -s --max-time 5 http://localhost:3001/api/health
EOF
```

## Méthode B — Build depuis tag Git (15 min)

Si méthode A n'a pas de backup adéquat :

```bash
# Sur Mac MH
# 1. Identifier tag ancre stable
git tag --list 'v1.10.4-r11.0.28*' | sort | tail -5

# 2. Worktree temporaire
TAG=v1.10.4-r11.0.28.b.2-buffer-alignment-fix
git worktree add /tmp/rollback-target $TAG
cd /tmp/rollback-target

# 3. Build (Mac, JAMAIS VPS)
cd app
npm install --offline
npm run build
cd ..

# 4. R9-PROTECT check-bundle
./ops/r9-protect.sh check-bundle

# 5. Deploy via rsync (SANS --delete + 6 exclusions OBLIGATOIRES)
rsync -avz --no-times -e "ssh -i ~/.ssh/id_ed25519" \
  --exclude=.htaccess --exclude=mentions-legales.html \
  --exclude=privacy.html --exclude=terms.html \
  --exclude=favicon.svg --exclude=vite.svg \
  app/dist/ root@136.144.204.115:/var/www/vhosts/calendar360.fr/httpdocs/

# 6. Cleanup
cd /Users/design/Desktop/PLANORA
git worktree remove /tmp/rollback-target

# 7. Vérifier bundle live
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
  "md5sum /var/www/vhosts/calendar360.fr/httpdocs/assets/index-*.js | tail -3"
```

## Validation

- [ ] Backup état cassé créé
- [ ] Bundle restoré/redéployé
- [ ] `/api/health` 200 (backend pas affecté)
- [ ] Test fonctionnel UX (login + agenda + CRM + phone tab)
- [ ] R9-PROTECT check-bundle vert (si rebuild)
- [ ] Bundle MD5 attendu confirmé

## Garanties

- **RTO méthode A** : ~5 min
- **RPO méthode A** : moment du backup httpdocs (typiquement pre-deploy)
- **RTO méthode B** : ~15 min
- **RPO méthode B** : version du tag Git

## Anti-patterns

- ❌ Ne JAMAIS faire `rm -rf httpdocs/` puis `tar xzf` (perte fichiers exclus)
- ❌ Ne JAMAIS deploy bundle Mac vers VPS sans `--exclude` standard
- ❌ Ne JAMAIS rsync avec `--delete` sans les 6 exclusions standard

## Référence

- Audit 14 §3.2 — Axe B Rollback bundle frontend
- CLAUDE.md §1 — Règle R9-PROTECT deploy
- docs/FRONTEND-DEPLOY-CHECKLIST.md — checklist deploy
