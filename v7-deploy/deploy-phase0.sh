#!/usr/bin/env bash
# deploy-phase0.sh — Phase 0 — Wrap sms-monitoring IIFE in HookIsolator
#
# Scope strictly limited to:
#   1. Upload the patcher to VPS
#   2. Run it (auto-backup + apply patch)
#   3. npm run build on VPS
#   4. Copy dist → httpdocs
#   5. Print smoke-test checklist
#
# NO backend change, NO DB change, NO pm2 restart (frontend-only).
#
# Usage:
#   ./deploy-phase0.sh            # apply + deploy
#   ./deploy-phase0.sh --dry-run  # verify patcher targets the right IIFE, no write

set -euo pipefail

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

LOCAL_PATCH="$(dirname "$0")/patches/fix-phase0-sms-monitoring.js"
REMOTE_PATCH="/tmp/fix-phase0-sms-monitoring.js"
APP_JSX="/var/www/planora/app/src/App.jsx"
DIST="/var/www/planora/app/dist"
HTTPDOCS="/var/www/vhosts/calendar360.fr/httpdocs"

DRY_RUN=""
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN="--dry-run"
  echo "═══════════════════════════════════════════════════════════════"
  echo "  PHASE 0 — DRY RUN (no changes will be written to VPS)"
  echo "═══════════════════════════════════════════════════════════════"
else
  echo "═══════════════════════════════════════════════════════════════"
  echo "  PHASE 0 — APPLY + DEPLOY"
  echo "═══════════════════════════════════════════════════════════════"
fi

if [ ! -f "$LOCAL_PATCH" ]; then
  echo "[FAIL] Local patcher not found: $LOCAL_PATCH"
  exit 1
fi

echo
echo "→ 1/5  Upload patcher to VPS"
$SCP "$LOCAL_PATCH" "$VPS:$REMOTE_PATCH"

echo
echo "→ 2/5  Run patcher on VPS ($DRY_RUN)"
$SSH "node $REMOTE_PATCH $APP_JSX $DRY_RUN"

if [ -n "$DRY_RUN" ]; then
  echo
  echo "═══════════════════════════════════════════════════════════════"
  echo "  DRY RUN DONE — nothing changed on VPS."
  echo "  Re-run without --dry-run to actually apply + deploy."
  echo "═══════════════════════════════════════════════════════════════"
  exit 0
fi

echo
echo "→ 3/5  Build on VPS"
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -20"

echo
echo "→ 4/5  Copy dist → httpdocs (clean + copy)"
$SSH "rm -rf $HTTPDOCS/assets && cp -r $DIST/* $HTTPDOCS/ && ls -la $HTTPDOCS/index.html $HTTPDOCS/assets/ | head -5"

echo
echo "→ 5/5  Verify patched App.jsx on VPS"
$SSH "grep -c 'portalTab === \"sms-monitoring\" && <HookIsolator>' $APP_JSX"
echo "     (expected: 1)"

echo
echo "═══════════════════════════════════════════════════════════════"
echo "  PHASE 0 DEPLOY DONE"
echo "═══════════════════════════════════════════════════════════════"
echo
echo "SMOKE TEST (hard-refresh browser Cmd+Shift+R first):"
echo
echo "  [ ] 1. Login as Julie → dashboard loads, no console error"
echo "  [ ] 2. Click each CollabPortal tab in sequence:"
echo "          home → agenda → crm → phone → availability → messages"
echo "          → tables → ai-profile → sms-monitoring → settings"
echo "          → signalements → objectifs"
echo "  [ ] 3. On each tab switch: NO React #310 in console"
echo "  [ ] 4. Open SMS Monitoring tab specifically:"
echo "          - table of SMS renders"
echo "          - search input works"
echo "          - filter dropdowns work"
echo "          - pagination works"
echo "  [ ] 5. Switch AWAY from sms-monitoring then BACK: no crash"
echo "  [ ] 6. Return to home → NBA (Mes actions du jour) still renders"
echo "  [ ] 7. Open a CRM contact fiche → no crash"
echo "  [ ] 8. Browser console: zero uncaught errors"
echo
echo "If any step FAILS, run: ./rollback-now.sh  (OR restore the .pre-phase0-* backup on VPS)"
echo
echo "If all PASS, tag git:  git -C ~/Documents/planora-code tag pre-refactor-phase1 && git push --tags"
