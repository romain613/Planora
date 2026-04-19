#!/usr/bin/env bash
# rollback-phase5.sh — Revert Phase 5 folder restructure.
# Restores App.jsx from the pre-phase5 backup and, if the backup was
# taken before cleanup, restores the old dir layout by re-running the
# Phase 4 deploy (since old dirs may already be gone).
set -euo pipefail
VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

BACKUP=$($SSH "ls -1t $APP_JSX.pre-phase5-* 2>/dev/null | head -1")
[ -z "$BACKUP" ] && echo "[FAIL] No .pre-phase5-* backup" && exit 1
echo "→ Restore App.jsx from $BACKUP"
$SSH "cp '$BACKUP' '$APP_JSX'"

echo "→ Check if Phase 5 cleanup already removed old dirs"
HAS_OLD=$($SSH "[ -d /var/www/planora/app/src/components/ui ] && echo 'yes' || echo 'no'")
if [ "$HAS_OLD" = "no" ]; then
  echo "[WARN] Old dirs (components/, utils/, services/) are gone."
  echo "       You must rerun Phase 4 deploy first to restore them, then rollback-phase5."
  echo "       OR restore from a pre-phase4 backup:"
  $SSH "ls -1t /var/www/planora/app/src/App.jsx.pre-phase4-* 2>/dev/null | head -1"
  exit 2
fi

echo "→ Remove new shared/ and features/ dirs"
$SSH "rm -rf /var/www/planora/app/src/shared /var/www/planora/app/src/features"

echo "→ Rebuild"
$SSH "cd /var/www/planora/app && rm -rf node_modules/.vite && npm run build 2>&1 | tail -10"

echo "→ Copy dist → httpdocs"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/"

echo "═══ ROLLBACK DONE ═══"
