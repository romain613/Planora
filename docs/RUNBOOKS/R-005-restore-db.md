# R-005 — Restore DB depuis backup

> **Quand utiliser** : DB corrompue, erreur humaine (DELETE massif), incident P0
> **Source** : Audit 13 §13.5 + Audit 14 §3.1
> **Durée** : ~3 minutes
> **Impact runtime** : `pm2 stop` requis pendant restore — **downtime ~30-60s**
> **Sévérité d'exécution** : ⚠️ ACTION CRITIQUE — GO MH obligatoire

## ⚠ Avertissement

Cette procédure provoque un downtime court (pm2 stop pendant restore + restart).
Réserver aux **incidents réels** ou **drill** prévus.
**Jamais Phase 1 sauf incident**.

## Préconditions

- Backup baseline ou récent identifié, SHA-256 vérifié
- GO MH explicite (incident P0/P1)
- Fenêtre creuse si possible (cf. Audit 13 §8.4)

## Procédure

### Étape 1 — Identifier le backup cible

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
  "ls -t /var/backups/planora/*-mono.db.gz | head -10"
```

Choisir le plus récent backup **antérieur à l'incident**.

### Étape 2 — Vérifier intégrité du backup avant restore

```bash
BACKUP=/var/backups/planora/<BASELINE_FILE>-mono.db.gz

ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 << EOF
# Vérifier SHA si manifest disponible
MANIFEST=\$(echo "$BACKUP" | sed 's|-mono.db.gz|-SHA256.txt|')
if [ -f "\$MANIFEST" ]; then
  cd \$(dirname "$BACKUP") && sha256sum -c "\$MANIFEST" 2>&1 | grep mono
fi

# Vérifier gunzip + integrity
gunzip -t "$BACKUP" && echo "Gunzip OK"
gunzip -c "$BACKUP" | sqlite3 :memory: "PRAGMA integrity_check;" | head -1
EOF
```

**Acceptance** : SHA match (ou pas de manifest = pas grave), gunzip -t OK, integrity = "ok".

### Étape 3 — Restore

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 << EOF
set -e

BACKUP=$BACKUP
DB_TARGET=/var/www/planora-data/calendar360.db
TS_RESTORE=\$(date +%Y%m%d-%H%M%S)

# 3.1 Stop PM2 (downtime START)
echo "[\$(date)] Stopping PM2..."
pm2 stop calendar360
sleep 2

# 3.2 Backup état actuel pour autopsie
mv "\$DB_TARGET" "\${DB_TARGET}.pre-restore-\${TS_RESTORE}"
rm -f "\${DB_TARGET}-wal" "\${DB_TARGET}-shm"

# 3.3 Restore via gunzip
gunzip -c "\$BACKUP" > "\$DB_TARGET"
chown root:root "\$DB_TARGET"
chmod 640 "\$DB_TARGET"

# 3.4 Vérifier intégrité post-restore
INTEGRITY=\$(sqlite3 "\$DB_TARGET" "PRAGMA integrity_check;" | head -1)
echo "Post-restore integrity: \$INTEGRITY"
[ "\$INTEGRITY" = "ok" ] || { echo "FAIL"; exit 1; }

FK_VIOLATIONS=\$(sqlite3 "\$DB_TARGET" "PRAGMA foreign_key_check;" | wc -l)
echo "FK violations: \$FK_VIOLATIONS"
[ "\$FK_VIOLATIONS" -eq 0 ] || { echo "FAIL FK"; exit 1; }

# 3.5 Restart PM2 (downtime END)
echo "[\$(date)] Restarting PM2..."
pm2 restart calendar360
sleep 3
EOF
```

### Étape 4 — Validation post-restore

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 << 'EOF'
# Health endpoint
curl -s --max-time 5 http://localhost:3001/api/health | head -3
echo ""

# PM2 status
pm2 list | grep calendar360
echo ""

# Logs récents (vérifier pas d'erreur)
pm2 logs calendar360 --lines 50 --nostream | tail -20
EOF
```

**Acceptance** : `/api/health` 200, PM2 online, logs sans ERROR récente.

### Étape 5 — Notification + documentation

```bash
# Créer doc incident (depuis Mac MH)
TS=$(date +%Y%m%d)
cat > INCIDENTS/INC-${TS}-001-db-restore.md << EOF
# INC-${TS}-001 — DB restore from backup

**Date** : $(date -u +"%Y-%m-%d %H:%M UTC")
**Sévérité** : <P0/P1>
**Reporter** : <name>
**Resolveur** : <name>
**Durée downtime** : ~Xmin
**Backup utilisé** : $BACKUP

## Symptômes
- ...

## Diagnostic
- ...

## Restore exécuté
- Backup: $BACKUP
- Pre-restore DB renommée: calendar360.db.pre-restore-XXX

## Cause racine
- ...

## Actions correctives
- ...

## Lessons learned
- ...
EOF
```

## Validation

- [ ] Backup SHA-256 vérifié
- [ ] gunzip -t passe
- [ ] integrity_check pré-restore = ok
- [ ] PM2 stopped propre
- [ ] Restore exécuté
- [ ] integrity_check post-restore = ok
- [ ] FK violations = 0
- [ ] PM2 restarted online
- [ ] /api/health 200
- [ ] Logs sans erreur 30s post-restart
- [ ] INC document créé

## Rollback du runbook lui-même

Si restore échoue :

```bash
ssh root@VPS << 'EOF'
# Remettre la DB pré-restore
DB=/var/www/planora-data/calendar360.db
LATEST_PRE_RESTORE=$(ls -t ${DB}.pre-restore-* | head -1)
mv "$LATEST_PRE_RESTORE" "$DB"
rm -f ${DB}-wal ${DB}-shm

# Vérifier
sqlite3 "$DB" "PRAGMA integrity_check;"

# Restart PM2
pm2 restart calendar360
EOF
```

## Garanties

- **RTO** : ~3 min (incluant downtime ~30-60s)
- **RPO** : moment du backup utilisé (idéalement daily = ≤24h)
- **Préservation** : DB pré-restore conservée (`.pre-restore-TS` pour autopsie)
- **Atomicité** : PM2 stop garantit aucun écrit pendant restore

## Référence

- Audit 13 §13.5 — Runbook E original
- Audit 14 §3.1 — Axe A Rollback DB
- Audit 14 §3.4 — Matrice rollback combiné
