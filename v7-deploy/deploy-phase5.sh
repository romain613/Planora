#!/usr/bin/env bash
# deploy-phase5.sh — Phase 5 — Folder restructure (shared/ + features/)
# Two stages: create new tree + rewrite imports → build → verify → cleanup old dirs
set -euo pipefail

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

LOCAL_PATCH="$(dirname "$0")/patches/apply-phase5.js"
REMOTE_PATCH="/tmp/apply-phase5.js"
APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

echo "═══ PHASE 5 — FOLDER RESTRUCTURE ═══"

echo; echo "→ 1/7  Upload patcher"
$SCP "$LOCAL_PATCH" "$VPS:$REMOTE_PATCH"

echo; echo "→ 2/7  Run patcher (CREATE stage — old dirs kept for safety)"
$SSH "node $REMOTE_PATCH $APP_JSX"

echo; echo "→ 3/7  Build on VPS (validates new import paths)"
$SSH "cd /var/www/planora/app && rm -rf node_modules/.vite && npm run build 2>&1 | tail -20"

echo; echo "→ 4/7  Copy dist → httpdocs"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/ && ls $HTTPDOCS/assets/"

echo; echo "→ 5/7  Verify site responds"
sleep 2
$SSH "curl -s -o /dev/null -w 'HTTP %{http_code} (%{time_total}s)\n' https://calendar360.fr/"

echo; echo "→ 6/7  CLEANUP STAGE — remove orphaned old dirs"
$SSH "node $REMOTE_PATCH $APP_JSX --cleanup"

echo; echo "→ 7/7  Final check — new structure in place"
$SSH "echo '--- app/src top level ---'; ls /var/www/planora/app/src/; echo; echo '--- shared/ ---'; ls /var/www/planora/app/src/shared/; echo; echo '--- features/ ---'; ls /var/www/planora/app/src/features/; echo; echo '--- App.jsx imports (first 22 lines) ---'; head -22 $APP_JSX | grep -E '^import' | head -15"

echo
echo "═══ PHASE 5 DEPLOY DONE ═══"
echo "SMOKE TEST: Cmd+Shift+R puis cliquer 3 onglets au moins (home, CRM, un admin)"
echo "Rollback: ./rollback-phase5.sh"
