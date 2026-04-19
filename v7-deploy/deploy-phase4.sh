#!/usr/bin/env bash
# deploy-phase4.sh — Phase 4 — Extract 15 HookIsolator screens to components/screens/
set -euo pipefail

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

LOCAL_PATCH="$(dirname "$0")/patches/apply-phase4.js"
REMOTE_PATCH="/tmp/apply-phase4.js"
APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

DRY_RUN=""
[ "${1:-}" = "--dry-run" ] && DRY_RUN="--dry-run" && echo "═══ PHASE 4 DRY RUN ═══" || echo "═══ PHASE 4 — 15 SCREENS EXTRACTION ═══"

echo; echo "→ 1/6  Upload patcher"
$SCP "$LOCAL_PATCH" "$VPS:$REMOTE_PATCH"

echo; echo "→ 2/6  Run patcher ($DRY_RUN)"
$SSH "node $REMOTE_PATCH $APP_JSX $DRY_RUN"

[ -n "$DRY_RUN" ] && echo && echo "═══ DRY RUN DONE ═══" && exit 0

echo; echo "→ 3/6  Verify new files"
$SSH "ls /var/www/planora/app/src/components/screens/ | wc -l; echo '—'; ls /var/www/planora/app/src/components/screens/"

echo; echo "→ 4/6  Build on VPS"
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -20"

echo; echo "→ 5/6  Copy dist → httpdocs"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/ && ls $HTTPDOCS/assets/"

echo; echo "→ 6/6  Verify"
$SSH "echo 'App.jsx lines:'; wc -l $APP_JSX; echo; echo 'Screens barrel import:'; grep -n 'from \"./components/screens\"' $APP_JSX | head -2"

echo
echo "═══ PHASE 4 DEPLOY DONE ═══"
echo "SMOKE TEST: Naviguer tous les 15 onglets extraits:"
echo "  Collab: fiche contact (client_msg/suivi/docs), signalements, téléphone (training)"
echo "  Admin:  perfCollab, knowledge-base, leads, objectifs, ai-agents, signalements, call-forms"
echo "  Vision: inscriptions, faucon"
echo "Rollback: ./rollback-phase4.sh"
