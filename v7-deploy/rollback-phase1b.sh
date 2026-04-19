#!/usr/bin/env bash
# rollback-phase1b.sh — Revert Phase 1B
set -euo pipefail

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

echo "═══ PHASE 1B ROLLBACK ═══"

BACKUP=$($SSH "ls -1t $APP_JSX.pre-phase1b-* 2>/dev/null | head -1")
if [ -z "$BACKUP" ]; then
  echo "[FAIL] No .pre-phase1b-* backup found."
  exit 1
fi
echo "→ Restore $BACKUP"

$SSH "
  cp '$BACKUP' '$APP_JSX'
  rm -rf /var/www/planora/app/src/components/ui
  # Remove empty components dir if possible
  rmdir /var/www/planora/app/src/components 2>/dev/null || true
  echo 'Restored and cleaned.'
"

echo "→ Rebuild"
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -10"

echo "→ Copy dist → httpdocs"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/"

echo "═══ ROLLBACK DONE ═══"
