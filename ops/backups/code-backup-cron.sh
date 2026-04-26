#!/bin/bash
# ═══════════════════════════════════════════════════════
# Calendar360 — Backup CODE complet (1x/jour)
# Appelé par crontab à 02:30 UTC
# Sécurités : lock, archive tar.gz, upload GDrive + B2, alerte Brevo
# Inclut : code backend + .env + ecosystem.config + dist build courant
# Exclut : node_modules, .git, dist (rebuilt sur restore), logs
# Rétention locale : 14 jours
# ═══════════════════════════════════════════════════════

APP_DIR="/var/www/planora"
BACKUP_DIR="/var/www/planora-data/backups"
LOG_FILE="/var/www/planora-data/backup.log"
LOCK_FILE="/var/www/planora-data/code-backup.lock"
ENV_FILE="/var/www/planora/server/.env"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/auto-code-$TIMESTAMP.tar.gz"

# ─── CHARGER .ENV DE MANIÈRE SÛRE (pour BREVO_API_KEY) ───
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

# ─── LOCK ANTI-CHEVAUCHEMENT ───
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$TIMESTAMP | CODE_SKIP | Un autre code-backup est déjà en cours" >> "$LOG_FILE"
  exit 0
fi

# ─── VÉRIFICATION SOURCE ───
if [ ! -d "$APP_DIR" ]; then
  echo "$TIMESTAMP | CODE_FAIL | App dir introuvable : $APP_DIR" >> "$LOG_FILE"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# ─── CRÉER ARCHIVE TAR.GZ ───
# Inclut : tout sauf node_modules, .git, dist, logs
# CRITIQUE : INCLUT .env (secrets) — protégé par accès SSH root + B2 IAM
if ! tar -czf "$BACKUP_FILE" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='*.log' \
    --exclude='*.bak' \
    --exclude='**/_vps-pull/**' \
    -C "$APP_DIR" . 2>>"$LOG_FILE"; then
  echo "$TIMESTAMP | CODE_FAIL | tar a échoué" >> "$LOG_FILE"
  exit 1
fi

SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)
if [ "$SIZE" -lt 100000 ]; then
  echo "$TIMESTAMP | CODE_FAIL | archive trop petite : $SIZE bytes" >> "$LOG_FILE"
  exit 1
fi

# ─── VÉRIFICATION ARCHIVE LISIBLE ───
if ! tar -tzf "$BACKUP_FILE" > /dev/null 2>>"$LOG_FILE"; then
  echo "$TIMESTAMP | CODE_FAIL | archive corrompue" >> "$LOG_FILE"
  exit 1
fi

NB_FILES=$(tar -tzf "$BACKUP_FILE" 2>/dev/null | wc -l)
SIZE_HUMAN=$(du -h "$BACKUP_FILE" | cut -f1)

echo "$TIMESTAMP | CODE_OK | taille: $SIZE_HUMAN | files: $NB_FILES | fichier: $BACKUP_FILE" >> "$LOG_FILE"

# ─── UPLOAD GOOGLE DRIVE ───
GDRIVE_OK=0
rclone copy "$BACKUP_FILE" gdrive-backup:daily/ --no-traverse 2>> "$LOG_FILE" && GDRIVE_OK=1
if [ "$GDRIVE_OK" -eq 1 ]; then
  echo "$TIMESTAMP | CODE_GDRIVE_OK | uploaded: $(basename $BACKUP_FILE)" >> "$LOG_FILE"
else
  echo "$TIMESTAMP | CODE_GDRIVE_FAIL | fichier: $BACKUP_FILE" >> "$LOG_FILE"
fi

# ─── UPLOAD BACKBLAZE B2 ───
B2_OK=0
rclone copy "$BACKUP_FILE" planora-offsite:planora-backups/code-daily/ --no-traverse 2>> "$LOG_FILE" && B2_OK=1
if [ "$B2_OK" -eq 1 ]; then
  echo "$TIMESTAMP | CODE_B2_OK | uploaded: $(basename $BACKUP_FILE)" >> "$LOG_FILE"
else
  echo "$TIMESTAMP | CODE_B2_FAIL | fichier: $BACKUP_FILE" >> "$LOG_FILE"
fi

# ─── ALERTE BREVO si AUCUNE des 2 destinations n'a réussi ───
if [ "$GDRIVE_OK" -eq 0 ] && [ "$B2_OK" -eq 0 ] && [ -n "${BREVO_API_KEY:-}" ]; then
  curl -s -X POST https://api.brevo.com/v3/smtp/email \
    -H "api-key: $BREVO_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"sender\":{\"name\":\"Calendar360\",\"email\":\"noreply@calendar360.fr\"},\"to\":[{\"email\":\"rc.sitbon@gmail.com\"}],\"subject\":\"⚠️ Backup CODE Calendar360 - DEUX destinations off-site ÉCHOUÉES\",\"htmlContent\":\"<p>Le backup CODE <b>$(basename $BACKUP_FILE)</b> n'a pas pu être uploadé.</p><p>Fichier local: $BACKUP_FILE</p><p>Timestamp: $TIMESTAMP</p>\"}" >> /dev/null 2>&1
fi

# ─── NETTOYAGE local ───
TO_DELETE=$(find "$BACKUP_DIR" -name "auto-code-*.tar.gz" -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)
if [ "$TO_DELETE" -gt 0 ]; then
  find "$BACKUP_DIR" -name "auto-code-*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null
  echo "$TIMESTAMP | CODE_CLEANUP | $TO_DELETE archives auto-code > ${RETENTION_DAYS}j supprimés" >> "$LOG_FILE"
fi

exit 0
