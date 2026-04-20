#!/usr/bin/env bash
# Planora FK violations monitor — D-3.1 mécanisme A
# Tail pm2 logs en continu, capture toute occurrence FK constraint, append au log dédié.

set -euo pipefail

LOG_FILE="/var/log/planora-fk-violations.log"
APP_NAME="calendar360"

# Garantir que le fichier log existe avec bonnes permissions (le service tourne en root)
touch "$LOG_FILE"
chown root:adm "$LOG_FILE"
chmod 640 "$LOG_FILE"

# Header au démarrage (pour traçabilité restart systemd)
echo "[$(date -u +%FT%TZ)] [MONITOR_START] planora-fk-monitor up, watching pm2 app=$APP_NAME" >> "$LOG_FILE"

# Trap SIGTERM/SIGINT pour shutdown propre
trap 'echo "[$(date -u +%FT%TZ)] [MONITOR_STOP] shutdown signal received" >> "$LOG_FILE"; exit 0' TERM INT

# Tail pm2 logs raw (stdout + stderr) à partir de NOW (pas l'historique)
# --lines 0 : ne pas dump l'historique
# --raw : pas de coloration ni timestamps pm2 (on ajoute le nôtre)
# stdbuf -oL : line-buffer la sortie pour que grep puisse traiter ligne par ligne
exec stdbuf -oL pm2 logs "$APP_NAME" --raw --lines 0 2>&1 \
  | stdbuf -oL grep -E "SQLITE_CONSTRAINT_FOREIGNKEY|FOREIGN KEY constraint failed" \
  | while IFS= read -r line; do
      echo "[$(date -u +%FT%TZ)] $line" >> "$LOG_FILE"
    done
