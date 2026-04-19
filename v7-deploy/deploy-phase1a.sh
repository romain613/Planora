#!/usr/bin/env bash
# deploy-phase1a.sh — Phase 1A — Extract theme + pure utils from App.jsx
#
# Scope:
#   1. Upload the patcher to VPS
#   2. Run it (auto-backup + create 4 new files + modify App.jsx imports)
#   3. npm run build on VPS
#   4. Copy dist → httpdocs
#   5. Print smoke-test checklist
#
# NO backend change, NO DB change, NO pm2 restart (frontend-only).
#
# Usage:
#   ./deploy-phase1a.sh            # apply + deploy
#   ./deploy-phase1a.sh --dry-run  # run patcher in dry-run, no write

set -euo pipefail

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

LOCAL_PATCH="$(dirname "$0")/patches/apply-phase1a.js"
REMOTE_PATCH="/tmp/apply-phase1a.js"
APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

DRY_RUN=""
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN="--dry-run"
  echo "═══════════════════════════════════════════════════════════════"
  echo "  PHASE 1A — DRY RUN (nothing will be written to VPS)"
  echo "═══════════════════════════════════════════════════════════════"
else
  echo "═══════════════════════════════════════════════════════════════"
  echo "  PHASE 1A — EXTRACT THEME + PURE UTILS"
  echo "═══════════════════════════════════════════════════════════════"
fi

if [ ! -f "$LOCAL_PATCH" ]; then
  echo "[FAIL] Local patcher not found: $LOCAL_PATCH"
  exit 1
fi

echo
echo "→ 1/6  Upload patcher to VPS"
$SCP "$LOCAL_PATCH" "$VPS:$REMOTE_PATCH"

echo
echo "→ 2/6  Run patcher on VPS ($DRY_RUN)"
$SSH "node $REMOTE_PATCH $APP_JSX $DRY_RUN"

if [ -n "$DRY_RUN" ]; then
  echo
  echo "═══════════════════════════════════════════════════════════════"
  echo "  DRY RUN DONE — nothing changed on VPS."
  echo "═══════════════════════════════════════════════════════════════"
  exit 0
fi

echo
echo "→ 3/6  Verify new files exist on VPS"
$SSH "ls -la /var/www/planora/app/src/theme.js /var/www/planora/app/src/utils/*.js"

echo
echo "→ 4/6  Build on VPS"
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -25"

echo
echo "→ 5/6  Copy dist → httpdocs"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/ && ls -la $HTTPDOCS/index.html $HTTPDOCS/assets/ | head -5"

echo
echo "→ 6/6  Final verification"
$SSH "
echo '— App.jsx line count:'
wc -l $APP_JSX
echo '— Imports present:'
grep -c 'from \"./theme\"' $APP_JSX
grep -c 'from \"./utils/' $APP_JSX
echo '— Old definitions gone:'
grep -c 'const T_LIGHT = {' $APP_JSX
grep -c 'let T = T_LIGHT' $APP_JSX
"

echo
echo "═══════════════════════════════════════════════════════════════"
echo "  PHASE 1A DEPLOY DONE"
echo "═══════════════════════════════════════════════════════════════"
echo
echo "SMOKE TEST (hard-refresh browser Cmd+Shift+R first):"
echo
echo "  [ ] 1. Login → dashboard loads, zero console error"
echo "  [ ] 2. Visit all 12 CollabPortal tabs — colors look correct (T.* imports work)"
echo "  [ ] 3. Open fiche contact → phone numbers display formatted (06 12 34 56 78)"
echo "  [ ] 4. Fill a form with required fields (ex: nouveau contact) → validation works"
echo "  [ ] 5. Check timezone dropdown (settings?) — list renders with all 23 zones"
echo "  [ ] 6. Generate a test code somewhere if UI exists (genCode)"
echo "  [ ] 7. Test sms-monitoring (Phase 0 verification): no React #310"
echo "  [ ] 8. Browser console: zero uncaught errors"
echo
echo "If any step FAILS: ./rollback-phase1a.sh (use .pre-phase1a-* backup on VPS)"
echo
echo "If all PASS:"
echo "  git -C ~/Desktop/PLANORA tag refactor-phase1a-done"
echo "  Then proceed to Phase 1B (UI atomics extraction)."
