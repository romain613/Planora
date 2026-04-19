#!/usr/bin/env bash
set -euo pipefail
VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

LOCAL_PATCH="$(dirname "$0")/patches/apply-phase5-5.js"
REMOTE_PATCH="/tmp/apply-phase5-5.js"
APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

echo "═══ PHASE 5.5 — _T → shared/state/tabState.js ═══"
echo; echo "→ Upload + run patcher"
$SCP "$LOCAL_PATCH" "$VPS:$REMOTE_PATCH"
$SSH "node $REMOTE_PATCH $APP_JSX"

echo; echo "→ Build"
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -15"

echo; echo "→ Copy dist → httpdocs"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/"
sleep 2
$SSH "curl -s -o /dev/null -w 'HTTP %{http_code}\n' https://calendar360.fr/"

echo; echo "→ Verify"
$SSH "wc -l $APP_JSX; ls -la /var/www/planora/app/src/shared/state/"

echo "═══ PHASE 5.5 DONE ═══"
