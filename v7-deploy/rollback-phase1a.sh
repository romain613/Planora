#!/usr/bin/env bash
# rollback-phase1a.sh — Revert Phase 1A if smoke-test fails
#
# Restores App.jsx from the most recent .pre-phase1a-* backup,
# deletes the new theme/utils files, rebuilds, redeploys.

set -euo pipefail

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"

APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

echo "═══════════════════════════════════════════════════════════════"
echo "  PHASE 1A — ROLLBACK"
echo "═══════════════════════════════════════════════════════════════"

echo
echo "→ 1/4  Locate most recent .pre-phase1a backup"
BACKUP=$($SSH "ls -1t $APP_JSX.pre-phase1a-* 2>/dev/null | head -1")
if [ -z "$BACKUP" ]; then
  echo "[FAIL] No .pre-phase1a-* backup found. Aborting."
  exit 1
fi
echo "     Found: $BACKUP"

echo
echo "→ 2/4  Restore App.jsx + delete new files"
$SSH "
  cp '$BACKUP' '$APP_JSX'
  rm -f /var/www/planora/app/src/theme.js
  rm -f /var/www/planora/app/src/utils/phone.js
  rm -f /var/www/planora/app/src/utils/validators.js
  rm -f /var/www/planora/app/src/utils/constants.js
  rmdir /var/www/planora/app/src/utils 2>/dev/null || true
  echo 'Restored and cleaned.'
"

echo
echo "→ 3/4  Rebuild on VPS"
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -15"

echo
echo "→ 4/4  Copy dist → httpdocs"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/"

echo
echo "═══════════════════════════════════════════════════════════════"
echo "  ROLLBACK DONE — Phase 1A reverted."
echo "═══════════════════════════════════════════════════════════════"
echo "Hard-refresh browser (Cmd+Shift+R) and verify app is back to Phase 0 state."
