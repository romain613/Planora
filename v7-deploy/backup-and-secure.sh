#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# BACKUP & SECURE — Calendar360 / PLANORA
# ═══════════════════════════════════════════════════════════════════════
# Snapshot de l'état v17 qui fonctionne + copie locale + audit sécurité
# ═══════════════════════════════════════════════════════════════════════
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOCAL_BACKUP_DIR="$HOME/Desktop/PLANORA/backups"
mkdir -p "$LOCAL_BACKUP_DIR"

echo "═══ BACKUP & SECURE — $TIMESTAMP ═══"
echo ""

# ── 1. CODE SNAPSHOT ──────────────────────────────────────────────
echo "[1/7] Snapshot du code (App.jsx + deploy config)..."
$SSH "bash -s" <<EOF
mkdir -p /var/www/backups
cd /var/www/planora
tar czf /var/www/backups/code-v17-$TIMESTAMP.tar.gz \
  app/src/App.jsx \
  app/src/App.jsx.bak-20260417 \
  app/src/App.jsx.pre-v7 \
  app/package.json \
  app/vite.config.* 2>/dev/null \
  server/ \
  ecosystem.config.cjs \
  2>&1 | tail -5
ls -lh /var/www/backups/code-v17-$TIMESTAMP.tar.gz
EOF
echo ""

# ── 2. DB SNAPSHOT (SQLite online backup — safe even with writes in flight) ──
echo "[2/7] Snapshot des DBs SQLite (online backup)..."
$SSH "bash -s" <<EOF
mkdir -p /var/www/backups/db-$TIMESTAMP
cd /var/www/planora-data
# Use sqlite3 .backup for consistent snapshots (safe with WAL)
for db in calendar360.db control_tower.db; do
  if [ -f "\$db" ]; then
    sqlite3 "\$db" ".backup /var/www/backups/db-$TIMESTAMP/\$db"
    echo "  \$db: \$(ls -lh /var/www/backups/db-$TIMESTAMP/\$db | awk '{print \$5}')"
  fi
done
# Also backup per-tenant DBs if any
if [ -d tenants ] && [ "\$(ls -A tenants)" ]; then
  tar czf /var/www/backups/db-$TIMESTAMP/tenants.tar.gz tenants/
  echo "  tenants/: \$(ls -lh /var/www/backups/db-$TIMESTAMP/tenants.tar.gz | awk '{print \$5}')"
fi
# Tarball the whole db-$TIMESTAMP folder for easy download
cd /var/www/backups
tar czf db-snapshot-$TIMESTAMP.tar.gz db-$TIMESTAMP/
rm -rf db-$TIMESTAMP/
ls -lh db-snapshot-$TIMESTAMP.tar.gz
EOF
echo ""

# ── 3. UPLOADS / STORAGE SNAPSHOT ──────────────────────────────────
echo "[3/7] Snapshot des fichiers uploadés..."
$SSH "bash -s" <<EOF
if [ -d /var/www/planora-data/storage ]; then
  cd /var/www/planora-data
  tar czf /var/www/backups/storage-$TIMESTAMP.tar.gz storage/ 2>&1 | tail -3
  ls -lh /var/www/backups/storage-$TIMESTAMP.tar.gz
else
  echo "  (pas de storage/ à sauvegarder)"
fi
EOF
echo ""

# ── 4. DOWNLOAD TO MAC (copie locale offsite) ──────────────────────
echo "[4/7] Téléchargement vers $LOCAL_BACKUP_DIR..."
mkdir -p "$LOCAL_BACKUP_DIR/$TIMESTAMP"
$SCP "$VPS:/var/www/backups/code-v17-$TIMESTAMP.tar.gz" "$LOCAL_BACKUP_DIR/$TIMESTAMP/"
$SCP "$VPS:/var/www/backups/db-snapshot-$TIMESTAMP.tar.gz" "$LOCAL_BACKUP_DIR/$TIMESTAMP/"
$SCP "$VPS:/var/www/backups/storage-$TIMESTAMP.tar.gz" "$LOCAL_BACKUP_DIR/$TIMESTAMP/" 2>/dev/null || echo "(pas de storage)"
echo ""
echo "Copies locales :"
ls -lh "$LOCAL_BACKUP_DIR/$TIMESTAMP/"
echo ""

# ── 5. CLEAN UP OLD VPS BACKUPS (garde les 5 plus récents) ─────────
echo "[5/7] Nettoyage des anciens backups VPS (garde 5 plus récents)..."
$SSH "cd /var/www/backups && ls -1t code-v17-*.tar.gz | tail -n +6 | xargs -r rm -v"
$SSH "cd /var/www/backups && ls -1t db-snapshot-*.tar.gz | tail -n +6 | xargs -r rm -v"
$SSH "cd /var/www/backups && ls -1t storage-*.tar.gz | tail -n +6 | xargs -r rm -v"
echo "Backups VPS actuels :"
$SSH "ls -lh /var/www/backups/ | head -20"
echo ""

# ── 6. SECURITY AUDIT ──────────────────────────────────────────────
echo "[6/7] ═══ AUDIT SÉCURITÉ ═══"
$SSH "bash -s" <<'EOF'
echo ""
echo "── SSH: authentification ──"
grep -iE "^(PasswordAuthentication|PermitRootLogin|PubkeyAuthentication)" /etc/ssh/sshd_config | sed 's/^/  /'

echo ""
echo "── Firewall (ufw) ──"
if command -v ufw >/dev/null 2>&1; then
  ufw status | sed 's/^/  /'
else
  echo "  ufw non installé"
fi

echo ""
echo "── Firewall (iptables/Plesk) ──"
iptables -L INPUT -n --line-numbers 2>/dev/null | head -15 | sed 's/^/  /' || echo "  iptables non accessible"

echo ""
echo "── fail2ban ──"
if command -v fail2ban-client >/dev/null 2>&1; then
  fail2ban-client status 2>&1 | sed 's/^/  /'
else
  echo "  fail2ban non installé"
fi

echo ""
echo "── Permissions fichiers sensibles ──"
for f in /var/www/planora/server/.env /var/www/planora/ecosystem.config.cjs /root/.ssh/authorized_keys /root/.ssh/id_ed25519 /etc/ssh/sshd_config; do
  if [ -e "$f" ]; then
    stat -c "  %a %U:%G %n" "$f"
  fi
done

echo ""
echo "── Swap actif (persistant ?) ──"
grep -E "^[^#].*swap" /etc/fstab | sed 's/^/  /' || echo "  pas d'entrée swap dans fstab"
free -h | grep -i swap | sed 's/^/  /'

echo ""
echo "── Disk usage ──"
df -h / /var 2>/dev/null | sed 's/^/  /'

echo ""
echo "── PM2 status ──"
pm2 list 2>&1 | tail -5 | sed 's/^/  /'
echo "  Startup configuré : $(pm2 startup 2>&1 | grep -q 'already' && echo 'OUI' || echo 'NON — lance pm2 startup puis pm2 save')"
EOF
echo ""

# ── 7. RÉSUMÉ ───────────────────────────────────────────────────────
echo "[7/7] ═══ RÉSUMÉ ═══"
echo ""
echo "Backups VPS         : /var/www/backups/*-$TIMESTAMP.tar.gz"
echo "Backups Mac         : $LOCAL_BACKUP_DIR/$TIMESTAMP/"
echo ""
echo "En cas d'urgence (site DOWN) :"
echo "  1. Vérifier SSH + pm2 list"
echo "  2. Si App.jsx cassé : cp App.jsx.bak-20260417 App.jsx && rebuild"
echo "  3. Si tout cassé : restaurer depuis $LOCAL_BACKUP_DIR/$TIMESTAMP/code-v17-$TIMESTAMP.tar.gz"
echo "     → scp le tarball vers le VPS, tar xzf, rebuild"
echo "  4. Si DB corrompue : restaurer depuis db-snapshot-$TIMESTAMP.tar.gz"
echo ""
echo "═══ BACKUP COMPLET ═══"
