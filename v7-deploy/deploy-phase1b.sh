#!/usr/bin/env bash
# deploy-phase1b.sh — Phase 1B — Extract 20 UI atomics to components/ui/
set -euo pipefail

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

LOCAL_PATCH="$(dirname "$0")/patches/apply-phase1b.js"
REMOTE_PATCH="/tmp/apply-phase1b.js"
APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

DRY_RUN=""
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN="--dry-run"
  echo "═══ PHASE 1B — DRY RUN ═══"
else
  echo "═══ PHASE 1B — EXTRACT 20 UI ATOMICS ═══"
fi

echo; echo "→ 1/6  Upload patcher"
$SCP "$LOCAL_PATCH" "$VPS:$REMOTE_PATCH"

echo; echo "→ 2/6  Run patcher on VPS ($DRY_RUN)"
$SSH "node $REMOTE_PATCH $APP_JSX $DRY_RUN"

if [ -n "$DRY_RUN" ]; then
  echo; echo "═══ DRY RUN DONE — no changes ═══"
  exit 0
fi

echo; echo "→ 3/6  Verify new files"
$SSH "ls /var/www/planora/app/src/components/ui/ | wc -l && ls /var/www/planora/app/src/components/ui/ | head -25"

echo; echo "→ 4/6  Build on VPS"
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -20"

echo; echo "→ 5/6  Copy dist → httpdocs"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/ && ls $HTTPDOCS/assets/"

echo; echo "→ 6/6  Final verification"
$SSH "echo 'App.jsx lines:'; wc -l $APP_JSX; echo; echo 'Barrel import in App.jsx:'; grep -n 'from \"./components/ui\"' $APP_JSX; echo; echo 'Components/ui/ count:'; ls /var/www/planora/app/src/components/ui/ | wc -l"

echo
echo "═══ PHASE 1B DEPLOY DONE ═══"
echo
echo "SMOKE TEST (Cmd+Shift+R first):"
echo "  [ ] Login Julie, dashboard charge"
echo "  [ ] Tous les onglets CollabPortal — icônes affichées, boutons stylés"
echo "  [ ] Ouvre une fiche contact — Card, Badge, Avatar OK"
echo "  [ ] Ouvre une modale (ex: Transfert V7) — Modal OK"
echo "  [ ] Form avec champ requis — ValidatedInput + tooltip HelpTip OK"
echo "  [ ] sms-monitoring tab — HookIsolator, pas de #310"
echo "  [ ] Console browser — zéro erreur"
echo
echo "Rollback si KO: ./rollback-phase1b.sh"
