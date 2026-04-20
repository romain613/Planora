#!/bin/bash
# PLANORA — Smart Deploy
# Pipeline complet : TEST local → FIX abort → DEPLOY VPS → smoke test → GIT commit → PUSH → MERGE
#
# Usage:
#   ./v7-deploy/deploy.sh                       # Full pipeline (auto commit msg)
#   ./v7-deploy/deploy.sh "Phase 15 — extract"  # Full pipeline avec commit msg custom
#   ./v7-deploy/deploy.sh --check               # Smoke test SEUL (vérifier prod actuelle)
#   ./v7-deploy/deploy.sh --no-git              # Deploy sans commit/push/merge
#   ./v7-deploy/deploy.sh --no-test             # Skip le local test (déconseillé)
#
# Pipeline complet (mode default) :
#   1. TEST   : build local (vite build) — catche les compile errors avant d'aller sur VPS
#   2. FIX    : si build local échoue → ABORT (pas de fix auto, le user doit corriger)
#   3. DEPLOY : sync local→VPS + build VPS + deploy httpdocs
#   4. SMOKE  : 8 checks post-deploy classifiés CRITIQUE/MAJEUR/MINEUR
#              Si CRITIQUE → rollback auto + abort (pas de git/push)
#   5. GIT    : git add (changes app/src/ et v7-deploy/) + git commit avec message
#   6. PUSH   : git push origin clean-main:main
#   7. MERGE  : git pull --ff-only origin main (sync local avec remote)
#
# Logs:
#   VPS: /var/log/planora-deploys.jsonl (1 ligne JSON par check)

set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY -o ConnectTimeout=15"
RSYNC_SSH="ssh -i $SSH_KEY"
PROJECT_ROOT="$HOME/Desktop/PLANORA"
LOCAL_SRC="$PROJECT_ROOT/app/src/"
LOCAL_APP="$PROJECT_ROOT/app"
VPS_SRC="$VPS:/var/www/planora/app/src/"
URL="https://calendar360.fr/"

DEPLOY_ID="d-$(date -u +%Y%m%d-%H%M%S)"

# Parse args: support --check, --no-git, --no-test, or commit message string
MODE="deploy"
SKIP_TEST=0
SKIP_GIT=0
COMMIT_MSG=""
for arg in "$@"; do
  case "$arg" in
    --check)   MODE="--check" ;;
    --no-git)  SKIP_GIT=1 ;;
    --no-test) SKIP_TEST=1 ;;
    --*)       echo "Unknown flag: $arg"; exit 1 ;;
    *)         COMMIT_MSG="$arg" ;;
  esac
done

# ─── Couleurs ─────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[0;33m'; B='\033[0;34m'; N='\033[0m'; BOLD='\033[1m'

log() { echo -e "[${B}$(date +%H:%M:%S)${N}] $1"; }
ok() { echo -e "  ${G}✅${N} $1"; }
warn() { echo -e "  ${Y}⚠${N}  $1"; }
fail() { echo -e "  ${R}❌${N} $1"; }
section() { echo -e "\n${BOLD}═══ $1 ═══${N}"; }

# ─── PRECHECKS ────────────────────────────────────────────
section "PRECHECKS — $DEPLOY_ID"

log "VPS reachable?"
if ! $SSH $VPS "echo OK" >/dev/null 2>&1; then
  fail "SSH timeout — abort"
  exit 1
fi
ok "SSH OK"

log "VPS health snapshot"
VPS_INFO=$($SSH $VPS "
  echo \"uptime=\$(uptime -p)\"
  echo \"ram_used=\$(free -m | awk 'NR==2{print \$3}')MB\"
  echo \"ram_total=\$(free -m | awk 'NR==2{print \$2}')MB\"
  echo \"disk_used=\$(df / | awk 'NR==2{print \$5}')\"
  echo \"pm2_calendar=\$(pm2 list | grep calendar360 | awk '{print \$10}' || echo unknown)\"
")
echo "$VPS_INFO" | sed 's/^/    /'

# ─── SMOKE-CHECK ONLY MODE ────────────────────────────────
# In check mode: skip test/backup/sync/build/deploy, jump straight to smoke test.
# In deploy mode: do everything.

CHECK_ONLY=0
if [ "$MODE" = "--check" ]; then
  CHECK_ONLY=1
  section "SMOKE TEST (check only — no deploy)"
  # We need BUILD_HASH for hash-match check. In check-only mode, read it from VPS.
  BUILD_HASH=$($SSH $VPS "grep -oE 'index-[A-Za-z0-9_]+\.js' /var/www/vhosts/calendar360.fr/httpdocs/index.html | head -1")
  HTTPDOCS_BACKUP=""  # no backup in check mode = no rollback possible
fi

# ─── STEP 1: TEST LOCAL (build vite) ──────────────────────
# Runs BEFORE touching the VPS — catches compile errors locally.
# If FAILS → abort with clear message (FIX step = user must fix manually).

if [ "$CHECK_ONLY" = "0" ] && [ "$SKIP_TEST" = "0" ]; then
  section "STEP 1: TEST LOCAL (vite build)"
  log "Running local vite build to catch compile errors before deploy"

  if [ ! -x "$LOCAL_APP/node_modules/.bin/vite" ]; then
    fail "vite not installed locally — run 'npm install' in $LOCAL_APP first"
    exit 1
  fi

  TEST_OUTPUT=$(cd "$LOCAL_APP" && ./node_modules/.bin/vite build 2>&1)
  TEST_EXIT=$?
  if [ $TEST_EXIT -ne 0 ]; then
    fail "LOCAL BUILD FAILED — abort before any VPS change"
    echo
    echo "$TEST_OUTPUT" | tail -20 | sed 's/^/    /'
    echo
    echo -e "${R}${BOLD}→ STEP 2 (FIX) requise: corriger le code local puis relancer${N}"
    echo "  Pour skipper le test (déconseillé): ./v7-deploy/deploy.sh --no-test"
    exit 1
  fi
  ok "Local build OK"
  echo "$TEST_OUTPUT" | tail -3 | sed 's/^/    /'
fi

# ─── BACKUP PRE-DEPLOY ────────────────────────────────────
if [ "$CHECK_ONLY" = "0" ]; then
section "BACKUP"
log "Backing up current src/ + httpdocs on VPS"
$SSH $VPS "
  mkdir -p /var/backups/planora/refactor /var/backups/planora/httpdocs
  TS=\$(date +%Y%m%d-%H%M%S)
  cp /var/www/planora/app/src/App.jsx /var/backups/planora/refactor/App.jsx.predeploy-\$TS
  tar czf /var/backups/planora/httpdocs/httpdocs-predeploy-\$TS.tar.gz -C /var/www/vhosts/calendar360.fr httpdocs/ 2>/dev/null
  echo HTTPDOCS_BACKUP=/var/backups/planora/httpdocs/httpdocs-predeploy-\$TS.tar.gz
" | tee /tmp/planora_backup_info.txt
HTTPDOCS_BACKUP=$(grep HTTPDOCS_BACKUP /tmp/planora_backup_info.txt | cut -d= -f2)
ok "Backup: $HTTPDOCS_BACKUP"

# ─── SYNC ─────────────────────────────────────────────────
section "SYNC LOCAL → VPS"
rsync -az --exclude='*.bak*' --exclude='*.pre-*' --exclude='node_modules' \
  -e "$RSYNC_SSH" \
  $LOCAL_SRC $VPS_SRC 2>&1 | tail -3 | sed 's/^/    /'
ok "Sync done"

# ─── BUILD VPS ────────────────────────────────────────────
section "BUILD VPS"
$SSH $VPS "cd /var/www/planora/app && npm run build 2>&1 | tail -8" | sed 's/^/    /'
BUILD_HASH=$($SSH $VPS "grep -oE 'index-[A-Za-z0-9_]+\.js' /var/www/planora/app/dist/index.html | head -1")
ok "Build OK — bundle: $BUILD_HASH"

# ─── DEPLOY ───────────────────────────────────────────────
section "DEPLOY → httpdocs"
$SSH $VPS "
  rm -rf /var/www/vhosts/calendar360.fr/httpdocs/assets
  cp -r /var/www/planora/app/dist/* /var/www/vhosts/calendar360.fr/httpdocs/
"
ok "Deployed"
fi  # end if CHECK_ONLY=0

# ─── SMOKE TEST + CLASSIFY + DECIDE ──────────────────────
if [ "$CHECK_ONLY" = "0" ]; then
  section "SMOKE TEST"
fi
sleep 3  # let nginx settle

# Run all checks via SSH, capture results as JSON lines
RESULTS=$($SSH $VPS "bash -s" <<EOF
set +e
DEPLOY_ID="$DEPLOY_ID"
EXPECTED_HASH="$BUILD_HASH"
URL="$URL"
LOG="/var/log/planora-deploys.jsonl"
mkdir -p /var/log
touch \$LOG

emit() {
  local severity=\$1 name=\$2 status=\$3 detail=\$4
  local ts=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local detail_escaped=\$(echo "\$detail" | sed 's/"/\\\\"/g' | tr -d '\n')
  echo "{\"ts\":\"\$ts\",\"deploy_id\":\"\$DEPLOY_ID\",\"event\":\"check\",\"severity\":\"\$severity\",\"name\":\"\$name\",\"status\":\"\$status\",\"detail\":\"\$detail_escaped\",\"bundle\":\"\$EXPECTED_HASH\"}" | tee -a \$LOG
}

# CHECK 1: HTTPS root status
HTTP=\$(curl -s -o /tmp/_root.html -w '%{http_code}' --max-time 10 \$URL)
if [ "\$HTTP" = "200" ]; then
  emit info http-status pass "HTTP 200"
else
  emit critique http-status fail "HTTP \$HTTP"
fi

# CHECK 2: Bundle hash match (HTML points to expected JS)
LIVE_HASH=\$(grep -oE 'index-[A-Za-z0-9_]+\.js' /tmp/_root.html | head -1)
if [ "\$LIVE_HASH" = "\$EXPECTED_HASH" ]; then
  emit info bundle-hash pass "matches \$EXPECTED_HASH"
else
  emit critique bundle-hash fail "expected \$EXPECTED_HASH got \$LIVE_HASH"
fi

# CHECK 3: Bundle JS downloadable + size sanity
BSIZE=\$(curl -s -o /tmp/_bundle.js -w '%{size_download}' --max-time 30 "\$URL"assets/\$EXPECTED_HASH)
if [ -n "\$BSIZE" ] && [ "\$BSIZE" -gt 500000 ] && [ "\$BSIZE" -lt 10000000 ]; then
  emit info bundle-download pass "\$BSIZE bytes"
elif [ -n "\$BSIZE" ] && [ "\$BSIZE" -gt 0 ]; then
  emit critique bundle-download fail "size \$BSIZE bytes (expected 0.5-10MB)"
else
  emit critique bundle-download fail "bundle not downloadable"
fi

# CHECK 4: HTML contains React mount point
if grep -q 'id="root"' /tmp/_root.html; then
  emit info html-root pass "div#root present"
else
  emit critique html-root fail "div#root missing in HTML"
fi

# CHECK 5: Bundle contains expected app symbols (sanity vs random text)
if grep -qE "calendar360|planora|CollabPortal|AdminDash|React" /tmp/_bundle.js 2>/dev/null; then
  emit info bundle-content pass "contains app symbols"
else
  # Bundle may be minified, check size as fallback
  if [ "\$BSIZE" -gt 1000000 ]; then
    emit info bundle-content pass "size OK (minified)"
  else
    emit majeur bundle-content fail "no app symbols in bundle"
  fi
fi

# CHECK 6: Backend pm2 status (use jlist + jq for stable JSON parsing)
PM2_INFO=\$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="calendar360") | "\(.pm2_env.status) \(.monit.memory)"' 2>/dev/null)
PM2_STATUS=\$(echo "\$PM2_INFO" | awk '{print \$1}')
PM2_RAM_BYTES=\$(echo "\$PM2_INFO" | awk '{print \$2}')
PM2_RAM_MB=\$(( \${PM2_RAM_BYTES:-0} / 1024 / 1024 ))
if [ "\$PM2_STATUS" = "online" ]; then
  emit info pm2-status pass "online (\${PM2_RAM_MB}MB)"
elif [ "\$PM2_STATUS" = "stopped" ] || [ "\$PM2_STATUS" = "errored" ]; then
  emit critique pm2-status fail "calendar360 \$PM2_STATUS"
else
  emit majeur pm2-status fail "calendar360 status unknown"
fi

# CHECK 7: Critical API endpoints
API_AUTH=\$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "\$URL"api/auth/me)
if [ "\$API_AUTH" = "200" ] || [ "\$API_AUTH" = "401" ]; then
  emit info api-auth-me pass "HTTP \$API_AUTH (expected 200 or 401)"
elif [ "\$API_AUTH" = "500" ] || [ "\$API_AUTH" = "503" ]; then
  emit critique api-auth-me fail "HTTP \$API_AUTH (server error)"
else
  emit majeur api-auth-me fail "HTTP \$API_AUTH (unexpected)"
fi

# CHECK 8: Backend errors since deploy (last 60s)
SINCE=\$(date -d '60 seconds ago' '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -v-60S '+%Y-%m-%d %H:%M:%S')
ERR_COUNT=\$(pm2 logs calendar360 --lines 100 --nostream --err 2>/dev/null | awk -v since="\$SINCE" '\$0 ~ since {found=1} found' | wc -l | tr -d ' ')
if [ "\$ERR_COUNT" -lt 5 ]; then
  emit info backend-errors pass "\$ERR_COUNT errors since deploy"
elif [ "\$ERR_COUNT" -lt 30 ]; then
  emit mineur backend-errors warn "\$ERR_COUNT errors since deploy"
else
  emit majeur backend-errors fail "\$ERR_COUNT errors since deploy (high volume)"
fi

# Cleanup
rm -f /tmp/_root.html /tmp/_bundle.js
EOF
)

# Print results to user
echo "$RESULTS" | while IFS= read -r line; do
  SEV=$(echo "$line" | grep -oE '"severity":"[^"]+"' | cut -d'"' -f4)
  NAME=$(echo "$line" | grep -oE '"name":"[^"]+"' | cut -d'"' -f4)
  STATUS=$(echo "$line" | grep -oE '"status":"[^"]+"' | cut -d'"' -f4)
  DETAIL=$(echo "$line" | grep -oE '"detail":"[^"]+"' | cut -d'"' -f4)
  case "$SEV" in
    info) [ "$STATUS" = "pass" ] && ok "$NAME — $DETAIL" || warn "$NAME — $DETAIL" ;;
    mineur) warn "MINEUR  $NAME — $DETAIL" ;;
    majeur) warn "MAJEUR  $NAME — $DETAIL" ;;
    critique) fail "CRITIQUE $NAME — $DETAIL" ;;
  esac
done

# ─── VERDICT ──────────────────────────────────────────────
section "VERDICT"

CRIT_COUNT=$(echo "$RESULTS" | grep -c '"severity":"critique"' || true)
MAJOR_COUNT=$(echo "$RESULTS" | grep -c '"severity":"majeur"' || true)
MINOR_COUNT=$(echo "$RESULTS" | grep -c '"severity":"mineur"' || true)

# Filter only failed checks (status: fail/warn)
CRIT_FAILED=$(echo "$RESULTS" | grep '"severity":"critique"' | grep -c '"status":"fail"' || true)
MAJOR_FAILED=$(echo "$RESULTS" | grep '"severity":"majeur"' | grep -c '"status":"fail"' || true)
MINOR_WARNED=$(echo "$RESULTS" | grep '"severity":"mineur"' | grep -c '"status":"warn"' || true)

# Verdict status: 0=SUCCESS, 1=MINOR, 2=MAJOR, 3=CRITICAL
VERDICT=0
if [ "$CRIT_FAILED" -gt 0 ]; then VERDICT=3
elif [ "$MAJOR_FAILED" -gt 0 ]; then VERDICT=2
elif [ "$MINOR_WARNED" -gt 0 ]; then VERDICT=1
fi

if [ $VERDICT -eq 3 ]; then
  fail "VERDICT: BUG CRITIQUE détecté ($CRIT_FAILED check(s))"
  echo
  if [ -n "$HTTPDOCS_BACKUP" ]; then
    log "Restoring previous httpdocs from $HTTPDOCS_BACKUP"
    $SSH $VPS "
      rm -rf /var/www/vhosts/calendar360.fr/httpdocs/assets
      tar xzf $HTTPDOCS_BACKUP -C /var/www/vhosts/calendar360.fr/
    "
    ok "Rollback done — restored from $HTTPDOCS_BACKUP"
    $SSH $VPS "echo \"{\\\"ts\\\":\\\"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\\\",\\\"deploy_id\\\":\\\"$DEPLOY_ID\\\",\\\"event\\\":\\\"rollback\\\",\\\"reason\\\":\\\"$CRIT_FAILED critical checks failed\\\"}\" >> /var/log/planora-deploys.jsonl"
  else
    warn "Mode --check: pas de rollback possible (aucun backup pré-deploy)"
  fi
  echo
  echo -e "${R}${BOLD}→ ACTION REQUIRED: Bug critique détecté → correction requise immédiatement${N}"
  echo -e "${R}→ STEP 5-7 (git/push/merge) SKIP car deploy a roll-back${N}"
  echo "  Voir: ./v7-deploy/incidents.sh latest"
  exit 2
elif [ $VERDICT -eq 2 ]; then
  warn "VERDICT: BUG MAJEUR non bloquant ($MAJOR_FAILED check(s)) — deploy maintenu"
  echo
  echo -e "${Y}${BOLD}→ ACTION RECOMMENDED: Bug majeur détecté (feature partiellement KO) → à corriger rapidement mais pas bloquant${N}"
  echo "  Voir: ./v7-deploy/incidents.sh latest"
elif [ $VERDICT -eq 1 ]; then
  warn "VERDICT: BUG MINEUR ($MINOR_WARNED check(s)) — deploy OK"
  echo
  echo -e "${Y}→ INFO: Bug mineur détecté (UI non bloquante) → OK pour continuer, correction plus tard${N}"
  echo "  Voir: ./v7-deploy/incidents.sh latest"
else
  ok "VERDICT: SUCCESS — tous les checks passent"
  echo
  echo -e "${G}${BOLD}→ Deploy ${DEPLOY_ID} live — bundle ${BUILD_HASH}${N}"
fi

# ─── STEP 5-7: GIT COMMIT + PUSH + MERGE ─────────────────
# Only runs if VERDICT < 3 (no rollback) and --no-git not set and not --check mode.

if [ "$CHECK_ONLY" = "1" ] || [ "$SKIP_GIT" = "1" ]; then
  exit $VERDICT
fi

# Check if there's anything to commit
cd "$PROJECT_ROOT"
GIT_STATUS=$(git status --porcelain app/src/ v7-deploy/ HANDOFF-2026-04-19.md 2>/dev/null | grep -v '^.. app/src/.*\.pre-' | grep -v '^.. app/src/.*\.bak')
if [ -z "$GIT_STATUS" ]; then
  echo
  log "STEP 5-7 (GIT): aucun changement dans app/src/ ou v7-deploy/ ou HANDOFF — skip git/push/merge"
  exit $VERDICT
fi

section "STEP 5: GIT COMMIT"
echo "  Changes detected:"
echo "$GIT_STATUS" | head -10 | sed 's/^/    /'
echo

# Stage relevant changes (avoid staging local backups, dist, etc.)
git add app/src/ v7-deploy/ HANDOFF-2026-04-19.md 2>/dev/null || true
# Remove any accidentally staged backup files
git reset HEAD -- 'app/src/**/*.pre-*' 'app/src/**/*.bak*' 2>/dev/null || true

# Auto-generate commit message if not provided
if [ -z "$COMMIT_MSG" ]; then
  CHANGED_TABS=$(git diff --cached --name-only | grep -oE 'features/collab/tabs/[A-Z][a-zA-Z]+Tab\.jsx' | sort -u | sed 's|features/collab/tabs/||' | tr '\n' ',' | sed 's/,$//')
  CHANGED_FILES_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
  if [ -n "$CHANGED_TABS" ]; then
    COMMIT_MSG="Deploy $DEPLOY_ID — touched: $CHANGED_TABS"
  else
    COMMIT_MSG="Deploy $DEPLOY_ID — $CHANGED_FILES_COUNT files"
  fi
fi

git commit -m "$COMMIT_MSG

Smart deploy verdict: $([ $VERDICT -eq 0 ] && echo SUCCESS || echo "with $MINOR_WARNED minor / $MAJOR_FAILED major warnings")
Bundle: $BUILD_HASH
Deploy ID: $DEPLOY_ID

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" 2>&1 | tail -3 | sed 's/^/  /'
ok "Git commit done — message: \"$COMMIT_MSG\""

section "STEP 6: PUSH origin/main"
PUSH_OUT=$(git push origin clean-main:main 2>&1)
if [ $? -ne 0 ]; then
  fail "Git push failed"
  echo "$PUSH_OUT" | sed 's/^/    /'
  exit $VERDICT
fi
echo "$PUSH_OUT" | tail -3 | sed 's/^/    /'
ok "Push done"

section "STEP 7: MERGE (sync local with remote)"
git fetch origin 2>&1 | tail -2 | sed 's/^/    /'
# Try fast-forward merge — if remote has changes, integrate them
if git merge --ff-only origin/main 2>&1 | tail -2 | sed 's/^/    /'; then
  ok "Local in sync with origin/main"
else
  warn "Cannot fast-forward — divergence detected. Run 'git status' to inspect"
fi

echo
echo -e "${G}${BOLD}═══ PIPELINE COMPLETE — TEST → FIX → DEPLOY → SMOKE → GIT → PUSH → MERGE ═══${N}"
echo -e "${G}  Deploy ID: $DEPLOY_ID${N}"
echo -e "${G}  Bundle:    $BUILD_HASH${N}"
echo -e "${G}  Commit:    $(git rev-parse --short HEAD)${N}"
echo -e "${G}  Verdict:   $([ $VERDICT -eq 0 ] && echo "SUCCESS" || echo "with warnings (exit $VERDICT)")${N}"

exit $VERDICT
