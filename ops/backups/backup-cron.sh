#!/bin/bash
# ═══════════════════════════════════════════════════════
# Calendar360 — Backup automatique DB
# Appelé par crontab toutes les 6h
# Sécurités : lock, check DB, intégrité, upload GDrive + B2, alerte Brevo
# V1.8.24 — Ajout control_tower.db + double destination (GDrive + Backblaze B2)
# ═══════════════════════════════════════════════════════

DB_PATH="/var/www/planora-data/calendar360.db"
CT_PATH="/var/www/planora-data/control_tower.db"
BACKUP_DIR="/var/www/planora-data/backups"
LOG_FILE="/var/www/planora-data/backup.log"
LOCK_FILE="/var/www/planora-data/backup.lock"
ENV_FILE="/var/www/planora/server/.env"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/auto-6h-$TIMESTAMP.db"
BACKUP_CT_FILE="$BACKUP_DIR/auto-6h-$TIMESTAMP-ct.db"

# ─── CHARGER .ENV DE MANIÈRE SÛRE ───
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

# ─── LOCK ANTI-CHEVAUCHEMENT ───
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$TIMESTAMP | SKIP | Un autre backup est déjà en cours" >> "$LOG_FILE"
  exit 0
fi

# ─── VÉRIFICATION DB SOURCE EXISTE ───
if [ ! -f "$DB_PATH" ]; then
  echo "$TIMESTAMP | FAIL | DB source introuvable : $DB_PATH" >> "$LOG_FILE"
  exit 1
fi

DB_SIZE=$(stat -c%s "$DB_PATH" 2>/dev/null || echo 0)
if [ "$DB_SIZE" -lt 1000 ]; then
  echo "$TIMESTAMP | FAIL | DB source trop petite : $DB_SIZE bytes" >> "$LOG_FILE"
  exit 1
fi

# ─── CRÉER LE DOSSIER SI NÉCESSAIRE ───
mkdir -p "$BACKUP_DIR"

# ─── BACKUP MONOLITHE VIA SQLITE3 .BACKUP (safe pour WAL, aucun impact DB active) ───
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'" 2>> "$LOG_FILE"

# ─── VÉRIFICATION TAILLE ───
SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)
if [ "$SIZE" -lt 1000 ]; then
  echo "$TIMESTAMP | FAIL | backup taille invalide : $SIZE bytes | fichier: $BACKUP_FILE" >> "$LOG_FILE"
  exit 1
fi

# ─── VÉRIFICATION INTEGRITY ───
INTEGRITY=$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" 2>/dev/null)
if [ "$INTEGRITY" != "ok" ]; then
  echo "$TIMESTAMP | FAIL | integrity: $INTEGRITY | fichier: $BACKUP_FILE" >> "$LOG_FILE"
  exit 1
fi

# ─── VÉRIFICATION DONNÉES ───
COMPANIES=$(sqlite3 "$BACKUP_FILE" "SELECT COUNT(*) FROM companies;" 2>/dev/null)
COLLABS=$(sqlite3 "$BACKUP_FILE" "SELECT COUNT(*) FROM collaborators;" 2>/dev/null)

# ─── V1.8.24 — BACKUP CONTROL_TOWER.DB en parallèle ───
CT_OK=""
if [ -f "$CT_PATH" ]; then
  sqlite3 "$CT_PATH" ".backup '$BACKUP_CT_FILE'" 2>> "$LOG_FILE"
  CT_SIZE=$(stat -c%s "$BACKUP_CT_FILE" 2>/dev/null || echo 0)
  CT_INTEGRITY=$(sqlite3 "$BACKUP_CT_FILE" "PRAGMA integrity_check;" 2>/dev/null)
  if [ "$CT_SIZE" -gt 0 ] && [ "$CT_INTEGRITY" = "ok" ]; then
    CT_OK="ct_ok:$CT_SIZE"
  else
    CT_OK="ct_fail:$CT_SIZE/$CT_INTEGRITY"
  fi
fi

# ─── LOG SUCCÈS LOCAL ───
echo "$TIMESTAMP | OK | taille: $SIZE | integrity: $INTEGRITY | companies: $COMPANIES | collabs: $COLLABS | $CT_OK | fichier: $BACKUP_FILE" >> "$LOG_FILE"

# ─── UPLOAD GOOGLE DRIVE (destination 1) ───
GDRIVE_OK=0
rclone copy "$BACKUP_FILE" gdrive-backup:daily/ --no-traverse 2>> "$LOG_FILE" && GDRIVE_OK=1
if [ -f "$BACKUP_CT_FILE" ]; then
  rclone copy "$BACKUP_CT_FILE" gdrive-backup:daily/ --no-traverse 2>> "$LOG_FILE"
fi
if [ "$GDRIVE_OK" -eq 1 ]; then
  echo "$TIMESTAMP | GDRIVE_OK | uploaded: $(basename $BACKUP_FILE)" >> "$LOG_FILE"
else
  echo "$TIMESTAMP | GDRIVE_FAIL | fichier: $BACKUP_FILE" >> "$LOG_FILE"
fi

# ─── V1.8.24 — UPLOAD BACKBLAZE B2 (destination 2 — résilience double dest) ───
B2_OK=0
rclone copy "$BACKUP_FILE" planora-offsite:planora-backups/db-6h/ --no-traverse 2>> "$LOG_FILE" && B2_OK=1
if [ -f "$BACKUP_CT_FILE" ]; then
  rclone copy "$BACKUP_CT_FILE" planora-offsite:planora-backups/db-6h/ --no-traverse 2>> "$LOG_FILE"
fi
if [ "$B2_OK" -eq 1 ]; then
  echo "$TIMESTAMP | B2_OK | uploaded: $(basename $BACKUP_FILE)" >> "$LOG_FILE"
else
  echo "$TIMESTAMP | B2_FAIL | fichier: $BACKUP_FILE" >> "$LOG_FILE"
fi

# ─── ALERTE BREVO si AUCUNE des 2 destinations n'a réussi ───
if [ "$GDRIVE_OK" -eq 0 ] && [ "$B2_OK" -eq 0 ] && [ -n "${BREVO_API_KEY:-}" ]; then
  curl -s -X POST https://api.brevo.com/v3/smtp/email \
    -H "api-key: $BREVO_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"sender\":{\"name\":\"Calendar360\",\"email\":\"noreply@calendar360.fr\"},\"to\":[{\"email\":\"rc.sitbon@gmail.com\"}],\"subject\":\"⚠️ Backup Calendar360 - DEUX destinations off-site ÉCHOUÉES\",\"htmlContent\":\"<p>Le backup <b>$(basename $BACKUP_FILE)</b> n'a pas pu être uploadé sur Google Drive ni sur Backblaze B2.</p><p>Fichier local: $BACKUP_FILE</p><p>Timestamp: $TIMESTAMP</p><p>Action requise : vérifier rclone et les credentials.</p>\"}" >> /dev/null 2>&1
fi

# ─── NETTOYAGE local : compter d'abord, supprimer ensuite, loguer ───
TO_DELETE=$(find "$BACKUP_DIR" -name "auto-6h-*.db" -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)
if [ "$TO_DELETE" -gt 0 ]; then
  find "$BACKUP_DIR" -name "auto-6h-*.db" -mtime +$RETENTION_DAYS -delete 2>/dev/null
  echo "$TIMESTAMP | CLEANUP | $TO_DELETE fichiers auto-6h > ${RETENTION_DAYS}j supprimés" >> "$LOG_FILE"
fi

# ─── LIBÉRER LE LOCK (automatique via flock + fd 9) ───
exit 0
