# R-004 — Incident response P0 (site down / DB corrompue)

> **Quand utiliser** : `/api/health` non-200, PM2 down, DB corrompue, crash inattendu
> **Source** : Audit 13 §13.4 + Audit 14 §6
> **Durée** : T+0 → T+10 min cible
> **Impact runtime** : VARIABLE selon action (incident déjà en cours)

## T+0 — Détection

Signaux possibles :
- `/api/health` non-200
- `pm2 list` status ≠ online
- Plainte client / alerting externe
- Bundle MD5 changement détecté inattendu

## T+1 min — Containment

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 << 'EOF'
TS=$(date +%Y%m%d-%H%M%S)

# 1. Backup état cassé pour autopsie
mkdir -p /var/backups/planora/CRASH-${TS}
tar czf "/var/backups/planora/CRASH-${TS}-server.tar.gz" \
  -C /var/www/planora server --exclude=node_modules --exclude='*.log' 2>&1 | tail -3
tar czf "/var/backups/planora/CRASH-${TS}-httpdocs.tar.gz" \
  -C /var/www/vhosts/calendar360.fr httpdocs 2>&1 | tail -3

# 2. Snapshot DB état actuel (sqlite3 .backup pour WAL safety)
if [ -f /var/www/planora-data/calendar360.db ]; then
  sqlite3 /var/www/planora-data/calendar360.db ".backup /tmp/CRASH-${TS}-mono.db" 2>&1
fi

# 3. Logs récents
pm2 logs calendar360 --lines 200 --nostream --err > "/tmp/CRASH-${TS}-logs.txt" 2>&1
echo "Crash artifacts in /tmp/CRASH-${TS}-* and /var/backups/planora/CRASH-${TS}-*"

# 4. État PM2 + health
pm2 list | grep calendar360
curl -s --max-time 5 http://localhost:3001/api/health 2>&1 | head -3
EOF
```

## T+3 min — Diagnostic

Identifier la cause :

| Cause | Vérifier |
|---|---|
| PM2 process down | `pm2 list`, `pm2 logs --err` |
| DB corrompue | `sqlite3 ... "PRAGMA integrity_check"` |
| Bundle corrompu | `md5sum httpdocs/assets/index-*.js` vs baseline |
| Disk full | `df -h` |
| Memory full | `free -h` |
| Network/upstream | `curl -v localhost:3001/api/health` + nginx logs |

## T+5 min — Restore selon cause

### Si PM2 crash loop :

```bash
pm2 stop calendar360
pm2 logs calendar360 --lines 200 --nostream --err
# Identifier la cause root (port pris, env var manquant, code bug)
# Si bug code: checkout tag stable + restart
```

### Si DB corrompue :

Suivre [R-005-restore-db.md](R-005-restore-db.md).

### Si bundle cassé :

Suivre [R-009-rollback-bundle.md](R-009-rollback-bundle.md).

## T+8 min — Validation post-restore

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 << 'EOF'
# Health
curl -s --max-time 5 http://localhost:3001/api/health
echo ""
# PM2
pm2 list | grep calendar360
# Logs 30s
pm2 logs calendar360 --lines 100 --nostream | tail -20
EOF
```

## T+10 min — Documentation

```bash
TS=$(date +%Y%m%d)
cp INCIDENTS/INC-TEMPLATE.md INCIDENTS/INC-${TS}-001-<slug>.md
# Éditer avec timeline + cause racine + actions correctives
```

## Validation

- [ ] Crash artifacts capturés (`/var/backups/planora/CRASH-*`)
- [ ] Logs collectés (`/tmp/CRASH-*-logs.txt`)
- [ ] Cause racine identifiée
- [ ] Restore exécuté selon procédure adéquate
- [ ] `/api/health` 200
- [ ] PM2 online
- [ ] 5 min observation logs sans nouvelle erreur
- [ ] INC document créé

## Garanties

- **RTO cible** : 5-10 min selon cause
- **Préservation forensic** : tous artifacts capturés avant action

## Notification

Si downtime > 5 min ou perte données : notification clients via canal officiel.

## Référence

- Audit 13 §13.4 — Runbook D original
- Audit 13 §6 — Incident management
- Audit 14 §6.9 — Incident log format
