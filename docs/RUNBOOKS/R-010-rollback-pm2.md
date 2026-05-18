# R-010 — Rollback PM2 config / process

> **Quand utiliser** : Process crash loop, ecosystem.config.cjs modifié à tort, env var erronée
> **Source** : Audit 14 §3.3
> **Durée** : ~2 min
> **Impact runtime** : `pm2 restart` requis — **downtime ~5-10s**
> **GO requis** : MH si Phase 1 (anormal)

## Cas A — Process crash loop

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 << 'EOF'
# 1. Stop le restart infinite
pm2 stop calendar360

# 2. Lire logs récents
pm2 logs calendar360 --lines 200 --nostream --err
EOF
```

**Diagnostic possible** :
- Port déjà pris : `lsof -i :3001`
- DB locked : `sqlite3 .../calendar360.db "BEGIN; ROLLBACK;"`
- Env var manquant : `cat /proc/<old_pid>/environ`
- Bug code récent : voir derniers commits

**Action selon cause** :
- Bug code → rollback Git (checkout tag stable)
- Port pris → kill process orphelin
- DB locked → restart sqlite via PRAGMA wal_checkpoint
- Env var → restore ecosystem.config.cjs

## Cas B — ecosystem.config.cjs modifié à tort

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 << 'EOF'
# 1. Identifier dernier configs backup baseline
LATEST_CONFIGS=$(ls -t /var/backups/planora/baseline-*-configs.tar.gz 2>/dev/null | head -1)
echo "Restoring configs from: $LATEST_CONFIGS"

# 2. Extract dans /tmp pour inspection
mkdir -p /tmp/configs-restore
tar xzf "$LATEST_CONFIGS" -C /tmp/configs-restore

# 3. Diff
diff /tmp/configs-restore/var/www/planora/ecosystem.config.cjs \
     /var/www/planora/ecosystem.config.cjs

# 4. Si confirmé, restore (ATTENTION : pm2 restart triggered)
# cp /tmp/configs-restore/var/www/planora/ecosystem.config.cjs \
#    /var/www/planora/ecosystem.config.cjs
# pm2 restart calendar360

# 5. Cleanup
rm -rf /tmp/configs-restore
EOF
```

## Cas C — PM2 daemon down

```bash
ssh root@VPS << 'EOF'
# 1. Status
pm2 list 2>&1 | head -5

# 2. Si "pm2 daemon not running"
pm2 resurrect

# 3. Si resurrect échoue
pm2 start /var/www/planora/ecosystem.config.cjs

# 4. Verify
sleep 3
pm2 list | grep calendar360
curl -s http://localhost:3001/api/health
EOF
```

## Validation

- [ ] Cause racine identifiée
- [ ] Action de restore appliquée
- [ ] PM2 status online
- [ ] PID stable (idéalement = baseline 2318858, sinon nouveau PID accepté = restart contrôlé)
- [ ] `/api/health` 200
- [ ] Logs 30s sans erreur nouvelle
- [ ] INC document créé si Phase 1

## Anti-patterns

- ❌ `pm2 kill` (tue tous process, perte registry)
- ❌ `pm2 delete calendar360` (supprime registry, repart de zéro)
- ❌ Modifier ecosystem.config.cjs sans backup
- ❌ Restart sans avoir backupé DB avant

## Garanties

- **RTO** : ~2 min
- **Downtime** : 5-10s pendant pm2 restart
- **PID change** : oui (nouveau PID après restart = signal d'alerte pour I2 si Phase 1)

## Référence

- Audit 14 §3.3 — Axe C Rollback PM2
- Audit 13 §6.6 — PM2 failure
- Audit 13 §3.1 — PM2 safety
