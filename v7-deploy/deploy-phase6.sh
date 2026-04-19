#!/usr/bin/env bash
set -euo pipefail
VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

LOCAL_PATCH="$(dirname "$0")/patches/apply-phase6.js"
REMOTE_PATCH="/tmp/apply-phase6.js"
APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

echo "═══ PHASE 6 — 7 PUBLIC/CLIENT COMPONENTS ═══"
$SCP "$LOCAL_PATCH" "$VPS:$REMOTE_PATCH"
$SSH "node $REMOTE_PATCH $APP_JSX"

echo; echo "→ Build"
$SSH "cd /var/www/planora/app && rm -rf node_modules/.vite && npm run build 2>&1 | tail -20"

echo; echo "→ Copy dist → httpdocs"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/"
sleep 2
$SSH "curl -s -o /dev/null -w 'HTTP %{http_code}\n' https://calendar360.fr/"

echo; echo "→ Verify"
$SSH "wc -l $APP_JSX; echo; ls /var/www/planora/app/src/features/public/ /var/www/planora/app/src/features/client/"

echo; echo "═══ PHASE 6 DONE ═══"
