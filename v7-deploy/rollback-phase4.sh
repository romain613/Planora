#!/usr/bin/env bash
set -euo pipefail
VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

BACKUP=$($SSH "ls -1t $APP_JSX.pre-phase4-* 2>/dev/null | head -1")
[ -z "$BACKUP" ] && echo "[FAIL] No .pre-phase4-* backup" && exit 1
echo "→ Restore $BACKUP"
$SSH "
  cp '$BACKUP' '$APP_JSX'
  rm -rf /var/www/planora/app/src/components/screens
"
echo "→ Rebuild"
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -10"
echo "→ Copy dist → httpdocs"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/"
echo "═══ ROLLBACK DONE ═══"
