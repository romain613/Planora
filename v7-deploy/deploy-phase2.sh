#!/usr/bin/env bash
# deploy-phase2.sh — Phase 2 — Extract fixtures + date/pipeline/notification helpers
set -euo pipefail

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

LOCAL_PATCH="$(dirname "$0")/patches/apply-phase2.js"
REMOTE_PATCH="/tmp/apply-phase2.js"
APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

DRY_RUN=""
[ "${1:-}" = "--dry-run" ] && DRY_RUN="--dry-run" && echo "═══ PHASE 2 DRY RUN ═══" || echo "═══ PHASE 2 — FIXTURES + UTILS ═══"

echo; echo "→ 1/6  Upload patcher"
$SCP "$LOCAL_PATCH" "$VPS:$REMOTE_PATCH"

echo; echo "→ 2/6  Run patcher on VPS ($DRY_RUN)"
$SSH "node $REMOTE_PATCH $APP_JSX $DRY_RUN"

if [ -n "$DRY_RUN" ]; then echo; echo "═══ DRY RUN DONE ═══"; exit 0; fi

echo; echo "→ 3/6  Verify new files"
$SSH "ls /var/www/planora/app/src/utils/{dates,pipeline,notifications}.js /var/www/planora/app/src/data/fixtures.js"

echo; echo "→ 4/6  Build on VPS"
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -15"

echo; echo "→ 5/6  Copy dist → httpdocs"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/ && ls $HTTPDOCS/assets/"

echo; echo "→ 6/6  Verify"
$SSH "echo 'App.jsx lines:'; wc -l $APP_JSX; echo; echo 'New imports:'; grep -nE 'from \"./(data/fixtures|utils/(dates|pipeline|notifications))\"' $APP_JSX"

echo
echo "═══ PHASE 2 DEPLOY DONE ═══"
echo "SMOKE TEST: navigation complète, formats de date, pipeline cartes, notifications"
echo "Rollback si KO: ./rollback-phase2.sh"
