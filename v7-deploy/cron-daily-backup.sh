#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# CRON DAILY BACKUP — runs on VPS at 02:00 daily via /etc/cron.d/planora
# ═══════════════════════════════════════════════════════════════════════
# - Snapshots code + DB + storage
# - Rotates: keeps 7 daily + 4 weekly + 3 monthly
# - Optional offsite via rclone (if ~/.config/rclone/rclone.conf exists with remote 'planora-offsite')
# - Logs to /var/log/planora-backup.log
# ═══════════════════════════════════════════════════════════════════════
set -e

BACKUP_DIR="/var/www/backups"
LOG_FILE="/var/log/planora-backup.log"
TS=$(date +%Y%m%d-%H%M%S)
DAY_OF_WEEK=$(date +%u)     # 1-7 (Mon-Sun)
DAY_OF_MONTH=$(date +%d)    # 01-31

mkdir -p "$BACKUP_DIR"
exec >> "$LOG_FILE" 2>&1

echo ""
echo "═══ BACKUP $TS ═══"

# ── 1. Code snapshot ──
cd /var/www/planora
tar czf "$BACKUP_DIR/code-$TS.tar.gz" \
  app/src/App.jsx \
  app/src/App.jsx.bak-20260417 \
  app/src/App.jsx.pre-v7 \
  app/package.json \
  app/package-lock.json 2>/dev/null \
  app/vite.config.* 2>/dev/null \
  server/ \
  ecosystem.config.cjs \
  2>/dev/null || true
echo "  code: $(du -h "$BACKUP_DIR/code-$TS.tar.gz" | awk '{print $1}')"

# ── 2. DB snapshot (SQLite online backup) ──
mkdir -p "$BACKUP_DIR/db-$TS"
cd /var/www/planora-data
for db in calendar360.db control_tower.db; do
  if [ -f "$db" ]; then
    sqlite3 "$db" ".backup $BACKUP_DIR/db-$TS/$db"
  fi
done
if [ -d tenants ] && [ "$(ls -A tenants 2>/dev/null)" ]; then
  tar czf "$BACKUP_DIR/db-$TS/tenants.tar.gz" tenants/
fi
cd "$BACKUP_DIR"
tar czf "db-$TS.tar.gz" "db-$TS/"
rm -rf "db-$TS/"
echo "  db:   $(du -h "$BACKUP_DIR/db-$TS.tar.gz" | awk '{print $1}')"

# ── 3. Storage snapshot (if exists) ──
if [ -d /var/www/planora-data/storage ] && [ "$(ls -A /var/www/planora-data/storage 2>/dev/null)" ]; then
  cd /var/www/planora-data
  tar czf "$BACKUP_DIR/storage-$TS.tar.gz" storage/ 2>/dev/null || true
  echo "  storage: $(du -h "$BACKUP_DIR/storage-$TS.tar.gz" 2>/dev/null | awk '{print $1}')"
fi

# ── 4. Tag as weekly (sunday) or monthly (1st of month) ──
# Keep separate suffixes so rotation doesn't delete them
if [ "$DAY_OF_MONTH" = "01" ]; then
  cp "$BACKUP_DIR/code-$TS.tar.gz" "$BACKUP_DIR/code-$TS-monthly.tar.gz"
  cp "$BACKUP_DIR/db-$TS.tar.gz"   "$BACKUP_DIR/db-$TS-monthly.tar.gz"
  echo "  → tagged MONTHLY"
elif [ "$DAY_OF_WEEK" = "7" ]; then  # Sunday
  cp "$BACKUP_DIR/code-$TS.tar.gz" "$BACKUP_DIR/code-$TS-weekly.tar.gz"
  cp "$BACKUP_DIR/db-$TS.tar.gz"   "$BACKUP_DIR/db-$TS-weekly.tar.gz"
  echo "  → tagged WEEKLY"
fi

# ── 5. Rotation ──
cd "$BACKUP_DIR"
# Daily: keep 7 (exclude weekly + monthly tagged files)
ls -1t code-*.tar.gz 2>/dev/null | grep -v -- -weekly | grep -v -- -monthly | tail -n +8 | xargs -r rm
ls -1t db-*.tar.gz 2>/dev/null   | grep -v -- -weekly | grep -v -- -monthly | tail -n +8 | xargs -r rm
ls -1t storage-*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm
# Weekly: keep 4
ls -1t code-*-weekly.tar.gz 2>/dev/null | tail -n +5 | xargs -r rm
ls -1t db-*-weekly.tar.gz 2>/dev/null   | tail -n +5 | xargs -r rm
# Monthly: keep 3
ls -1t code-*-monthly.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm
ls -1t db-*-monthly.tar.gz 2>/dev/null   | tail -n +4 | xargs -r rm

echo "  rotation done ($(ls -1 "$BACKUP_DIR" | wc -l) files, $(du -sh "$BACKUP_DIR" | awk '{print $1}') total)"

# ── 6. Offsite upload (if rclone configured) ──
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q "^planora-offsite:"; then
  echo "  offsite: uploading via rclone..."
  # Sync only today's backups (fast)
  for f in code-$TS.tar.gz db-$TS.tar.gz storage-$TS.tar.gz code-$TS-weekly.tar.gz code-$TS-monthly.tar.gz db-$TS-weekly.tar.gz db-$TS-monthly.tar.gz; do
    if [ -f "$BACKUP_DIR/$f" ]; then
      rclone copy "$BACKUP_DIR/$f" planora-offsite:planora-backups/ --quiet 2>&1 | tail -3
    fi
  done
  # Mirror retention (delete old offsite files too)
  rclone sync "$BACKUP_DIR/" planora-offsite:planora-backups/ --quiet --exclude "*.partial" 2>&1 | tail -3
  echo "  offsite: done"
else
  echo "  offsite: rclone not configured (optional)"
fi

echo "═══ BACKUP OK $TS ═══"
