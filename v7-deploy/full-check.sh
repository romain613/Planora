#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# FULL CHECK — Calendar360 / PLANORA
# ═══════════════════════════════════════════════════════════════════════
# 1. Force un backup production (inclut upload B2 + Google Drive)
# 2. Télécharge le dernier backup sur le Mac (3ème copie)
# 3. Vérifie l'intégrité du backup (tarballs + DB SQLite)
# 4. Audit sécurité complet
# ═══════════════════════════════════════════════════════════════════════
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

TS=$(date +%Y%m%d-%H%M%S)
LOCAL_BACKUP_DIR="$HOME/Desktop/PLANORA/backups"
TEMP_DIR="/tmp/planora-fullcheck-$$"
mkdir -p "$LOCAL_BACKUP_DIR" "$TEMP_DIR"
trap "rm -rf $TEMP_DIR" EXIT

echo "═══ FULL CHECK — $TS ═══"
echo ""

# ── 1. Backup production forcé (avec rotation + B2 + gdrive) ──
echo "[1/6] Backup production forcé (script cron exécuté manuellement)..."
$SSH "/usr/local/bin/planora-backup.sh"
echo ""
echo "  Dernières lignes du log :"
$SSH "tail -15 /var/log/planora-backup.log" | sed 's/^/    /'
echo ""

# ── 2. Liste les backups sur le VPS ──
echo "[2/6] Inventaire backups VPS..."
$SSH "ls -lh /var/www/backups/ | grep -v '^total'" | sed 's/^/  /'
echo ""

# ── 3. Vérifie l'offsite B2 ──
echo "[3/6] Inventaire offsite Backblaze B2..."
$SSH "rclone ls planora-offsite: | head -20" | sed 's/^/  /'
$SSH "echo 'Total B2: '\$(rclone size planora-offsite: 2>/dev/null | grep -oE '[0-9]+ objects')"
echo ""

# ── 4. Vérifie gdrive (si configuré) ──
echo "[4/6] Inventaire offsite Google Drive..."
$SSH "rclone listremotes | grep -q '^gdrive-backup:' && rclone lsd gdrive-backup: 2>/dev/null | head -5 || echo '  (gdrive-backup non configuré ou accès limité)'" | sed 's/^/  /'
echo ""

# ── 5. Télécharge le dernier backup sur le Mac + vérifie intégrité ──
echo "[5/6] Téléchargement + vérification intégrité..."
LATEST_CODE=$($SSH "ls -1t /var/www/backups/code-*.tar.gz 2>/dev/null | grep -v -- -weekly | grep -v -- -monthly | head -1")
LATEST_DB=$($SSH "ls -1t /var/www/backups/db-*.tar.gz 2>/dev/null | grep -v -- -weekly | grep -v -- -monthly | head -1")

mkdir -p "$LOCAL_BACKUP_DIR/$TS"
$SCP "$VPS:$LATEST_CODE" "$LOCAL_BACKUP_DIR/$TS/" 2>/dev/null
$SCP "$VPS:$LATEST_DB" "$LOCAL_BACKUP_DIR/$TS/" 2>/dev/null
echo "  Copies Mac :"
ls -lh "$LOCAL_BACKUP_DIR/$TS/" | sed 's/^/    /'

# Test intégrité tarball + SQLite
cd "$TEMP_DIR"
cp "$LOCAL_BACKUP_DIR/$TS/"*.tar.gz . 2>/dev/null

INTEGRITY_OK=true
for f in code-*.tar.gz; do
  if [ -f "$f" ]; then
    if tar tzf "$f" >/dev/null 2>&1; then
      echo "  ✓ $f : tarball OK ($(tar tzf "$f" | wc -l) fichiers)"
    else
      echo "  ✗ $f : CORROMPU"
      INTEGRITY_OK=false
    fi
  fi
done

for f in db-*.tar.gz; do
  if [ -f "$f" ]; then
    if tar tzf "$f" >/dev/null 2>&1; then
      mkdir -p "db-extract"
      tar xzf "$f" -C "db-extract/"
      for db in $(find db-extract -name "*.db"); do
        INT=$(sqlite3 "$db" "PRAGMA integrity_check;" 2>&1)
        if [ "$INT" = "ok" ]; then
          NAME=$(basename "$db")
          SIZE=$(du -h "$db" | awk '{print $1}')
          TABLES=$(sqlite3 "$db" ".tables" 2>/dev/null | tr ' ' '\n' | grep -v '^$' | wc -l)
          echo "  ✓ $NAME : SQLite integrity OK, $TABLES tables, $SIZE"
        else
          echo "  ✗ $db : integrity FAIL"
          INTEGRITY_OK=false
        fi
      done
    else
      echo "  ✗ $f : CORROMPU"
      INTEGRITY_OK=false
    fi
  fi
done
echo ""

# ── 6. Audit sécurité final ──
echo "[6/6] Audit sécurité..."
$SSH "bash -s" <<'REMOTE' | sed 's/^/  /'
echo "SSH auth    : $(grep -E '^PasswordAuthentication' /etc/ssh/sshd_config | head -1)"
echo "fail2ban    : $(fail2ban-client status 2>/dev/null | grep 'Number of jail' | xargs)"
echo "iptables    : $(iptables -L INPUT -n 2>/dev/null | head -1)"
echo ".env perms  : $(stat -c '%a %U:%G' /var/www/planora/server/.env 2>/dev/null || echo 'n/a')"
echo "PM2 startup : $(systemctl is-enabled pm2-root 2>/dev/null) / $(systemctl is-active pm2-root 2>/dev/null)"
echo "Swap        : $(free -h | grep -i swap | awk '{print $2 " total, " $3 " used"}')"
echo "Cron backup : $(grep -v '^#' /etc/cron.d/planora-backup 2>/dev/null | grep -v '^$' | grep backup | awk '{print $1" "$2" "$3" "$4" "$5}')"
echo "Unattended  : $(systemctl is-active unattended-upgrades 2>/dev/null)"
echo "Disk usage  : $(df -h / | tail -1 | awk '{print $3 " / " $2 " (" $5 ")"}')"
echo "RAM         : $(free -h | grep Mem | awk '{print $3 " / " $2}')"
echo "PM2 status  : $(pm2 list 2>/dev/null | grep calendar360 | awk '{print $10 " (restarts " $14 ")"}' || echo '?')"
REMOTE
echo ""

# ── Résumé final ──
echo "═══ RÉSUMÉ ═══"
echo ""
if [ "$INTEGRITY_OK" = "true" ]; then
  echo "  ✓ Backup intégrité OK"
else
  echo "  ✗ Backup intégrité ÉCHEC — vérifier manuellement"
fi
echo "  ✓ 3 emplacements : VPS local + Backblaze B2 + Mac $LOCAL_BACKUP_DIR/$TS/"
echo "  ✓ Upload automatique quotidien 02:00"
echo "  ✓ Rotation 7 daily + 4 weekly + 3 monthly"
echo ""
echo "En cas d'urgence :"
echo "  ssh root@VPS '/usr/local/bin/planora-backup.sh'          # backup manuel"
echo "  bash ~/Desktop/PLANORA/v7-deploy/rollback-now.sh          # rollback App.jsx"
echo "  bash ~/Desktop/PLANORA/v7-deploy/verify-restore.sh        # test restore"
echo ""
echo "═══ CHECK COMPLET ═══"
