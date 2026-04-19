#!/usr/bin/env bash
# deploy-phase3.sh — Phase 3 — Extract api service
set -euo pipefail

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

LOCAL_PATCH="$(dirname "$0")/patches/apply-phase3.js"
REMOTE_PATCH="/tmp/apply-phase3.js"
APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

DRY_RUN=""
[ "${1:-}" = "--dry-run" ] && DRY_RUN="--dry-run" && echo "═══ PHASE 3 DRY RUN ═══" || echo "═══ PHASE 3 — API SERVICE ═══"

echo; echo "→ 1/6  Upload patcher"
$SCP "$LOCAL_PATCH" "$VPS:$REMOTE_PATCH"

echo; echo "→ 2/6  Run patcher ($DRY_RUN)"
$SSH "node $REMOTE_PATCH $APP_JSX $DRY_RUN"

[ -n "$DRY_RUN" ] && echo && echo "═══ DRY RUN DONE ═══" && exit 0

echo; echo "→ 3/6  Verify new file"
$SSH "ls -la /var/www/planora/app/src/services/api.js"

echo; echo "→ 4/6  Build on VPS"
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -15"

echo; echo "→ 5/6  Copy dist → httpdocs"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/ && ls $HTTPDOCS/assets/"

echo; echo "→ 6/6  Verify"
$SSH "echo 'App.jsx lines:'; wc -l $APP_JSX; echo; echo 'New import:'; grep -n 'from \"./services/api\"' $APP_JSX; echo; echo 'Setter calls:'; grep -n 'setAutoTicketCompanyId' $APP_JSX"

echo
echo "═══ PHASE 3 DEPLOY DONE ═══"
echo "SMOKE TEST: login, appels API, VoIP recordings, auto-ticket sur erreur 500"
echo "Rollback: ./rollback-phase3.sh"
