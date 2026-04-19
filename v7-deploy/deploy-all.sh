#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# DEPLOY ALL v17 — Clean restore + V7 patches + NBA HookIsolator + scope fix
# Calendar360 / PLANORA
# ═══════════════════════════════════════════════════════════════════════
# v17 FIX: NBA IIFE wrapped in HookIsolator to fix Aujourd'hui React #310.
#   Root cause: the "MES ACTIONS DU JOUR" (NBA) IIFE in the home tab had
#   3 hooks (useState x2, useEffect) called directly inside {(()=>{...})()}
#   instead of being isolated. When portalTab changes from "home" to any
#   other tab, the IIFE stops executing — so the parent ClientPortal's
#   hook count drops by 3. Switching back to "home" re-adds them → React
#   error #310 "Rendered more hooks than during the previous render".
#   Fix: fix-nba-hooks-isolation.js rewrites the IIFE opener/closer to use
#   <HookIsolator>{()=>{...}}</HookIsolator> instead of {(()=>{...})()}.
#   The hooks now live on HookIsolator's own fiber, not the parent.
# v16: Scope fix v5.0 — BLOCKLIST REMOVED (see below).
#   The massive 200+ word blocklist (v3.1-v3.2) was HIDING real bugs.
#   Variables like "loading", "status", "contact" etc. that are used
#   out-of-scope in the Aujourd'hui tab were being skipped → React #310.
#   Since v3.3-v4.0 added 13 classes of smart detection (object keys,
#   destructuring, dot accessors, string literals, const declarations,
#   word boundaries...), the blocklist is no longer needed.
#   v5.0 keeps only a micro-blocklist (map, set, get, key, ref, id, log)
#   and MIN_NAME_LENGTH=3 instead of 5.
#   All 13 smart detection classes from v4.0 are preserved.
# Previous versions: v5-v15 (see git history for changelog)
# ═══════════════════════════════════════════════════════════════════════
set -e
set -o pipefail

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"
PATCHES_DIR="$(cd "$(dirname "$0")/patches" && pwd)"

echo "═══ DEPLOY ALL v18 — V7 complet + HookIsolator x2 + Modal relocation + Scope Fix ═══"
echo ""

# ── 0. Upload ALL patches ──
echo "[0/14] Upload des patches..."
$SSH "mkdir -p /tmp/p0-patches"
$SCP "$PATCHES_DIR/fix-selectedCrmContact.js" "$VPS:/tmp/p0-patches/"
$SCP "$PATCHES_DIR/fix-all-scope-issues-v3.js" "$VPS:/tmp/p0-patches/"
$SCP "$PATCHES_DIR/diagnose-scope.js" "$VPS:/tmp/p0-patches/"
$SCP "$PATCHES_DIR/p0-step1-v7base.js" "$VPS:/tmp/p0-patches/"
$SCP "$PATCHES_DIR/p0-step2-pipeline-btn.js" "$VPS:/tmp/p0-patches/"
$SCP "$PATCHES_DIR/p0-fix-badge.js" "$VPS:/tmp/p0-patches/"
$SCP "$PATCHES_DIR/p0-step4-suivi-tab.js" "$VPS:/tmp/p0-patches/"
$SCP "$PATCHES_DIR/fix-nba-hooks-isolation.js" "$VPS:/tmp/p0-patches/"
$SCP "$PATCHES_DIR/fix-status-history-hooks.js" "$VPS:/tmp/p0-patches/"
$SCP "$PATCHES_DIR/fix-modal-relocation.js" "$VPS:/tmp/p0-patches/"
echo "10 fichiers uploadés"
echo ""

# ── 1. Restore from bak-20260417 (état prod propre) ──
echo "[1/12] Restauration depuis bak-20260417..."
$SSH 'bash -s' << 'EOF'
cd /var/www/planora/app/src
cp App.jsx App.jsx.pre-deploy-v5-backup
cp App.jsx.bak-20260417 App.jsx
echo "Restauré ($(wc -l < App.jsx) lignes)"
EOF
echo ""

# ── 2. Fix selectedCrmContact bug (targeted fix, no anchor issues) ──
echo "[2/12] Fix bug selectedCrmContact..."
$SSH "node /tmp/p0-patches/fix-selectedCrmContact.js"
echo ""

# ── 3. V7 base (states + handler + modal + CRM button + CRM badges) ──
echo "[3/12] V7 base..."
$SSH "node /tmp/p0-patches/p0-step1-v7base.js"
echo ""

# ── 4. P0.1 — Pipeline Live transfer button ──
echo "[4/12] P0.1 — Bouton Transférer Pipeline Live..."
$SSH "node /tmp/p0-patches/p0-step2-pipeline-btn.js"
echo ""

# ── 5. P0.2 — Pipeline Live executor badge ──
echo "[5/12] P0.2 — Badge executor Pipeline Live..."
$SSH "node /tmp/p0-patches/p0-fix-badge.js"
echo ""

# ── 6. P0.3 — Suivi tab ──
echo "[6/12] P0.3 — Onglet Suivi..."
$SSH "node /tmp/p0-patches/p0-step4-suivi-tab.js"
echo ""

# ── 7. NBA IIFE → HookIsolator (fix Aujourd'hui React #310) ──
echo "[7/14] NBA IIFE → HookIsolator (fix Aujourd'hui #310)..."
$SSH "node /tmp/p0-patches/fix-nba-hooks-isolation.js"
echo ""

# ── 8. Status History IIFE → HookIsolator (fix CRM fiche React #310) ──
echo "[8/14] Status History IIFE → HookIsolator (fix CRM fiche #310)..."
$SSH "node /tmp/p0-patches/fix-status-history-hooks.js"
echo ""

# ── 9. V7 Modal relocation (move from dead code to render JSX) ──
echo "[9/14] V7 Modal relocation (move from dead code to render JSX)..."
$SSH "node /tmp/p0-patches/fix-modal-relocation.js"
echo ""

# ── 10. Backend — create contact_followers in tenant DBs (shadow mode support) ──
echo "[10/14] Créer contact_followers dans les tenant DBs..."
$SSH 'bash -s' <<'REMOTE'
SCHEMA=$(sqlite3 /var/www/planora-data/calendar360.db '.schema contact_followers')
if [ -n "$SCHEMA" ]; then
  for TENANT in c1776169036725 c-monbilan; do
    TENANT_DB="/var/www/planora-data/tenants/$TENANT.db"
    if [ -f "$TENANT_DB" ]; then
      EXISTS=$(sqlite3 "$TENANT_DB" ".tables contact_followers" 2>&1)
      if [ "$EXISTS" != "contact_followers" ]; then
        echo "$SCHEMA" | sqlite3 "$TENANT_DB" 2>&1
        echo "  $TENANT: contact_followers créée"
      else
        echo "  $TENANT: déjà OK"
      fi
    fi
  done
else
  echo "  WARN: contact_followers schema vide dans monolithe"
fi
REMOTE
echo ""

# ── 11. SMART scope fix v5.0 (AFTER all patches — protects everything) ──
echo "[11/14] Scope fix v5.0 (NO BLOCKLIST — smart detect only)..."
$SSH "node /tmp/p0-patches/fix-all-scope-issues-v3.js"
echo ""

# ── 12. Run diagnostic to verify nothing is missed ──
echo "[12/14] Diagnostic final..."
$SSH "node /tmp/p0-patches/diagnose-scope.js"
echo ""

# ── 13. Build ──
echo "[13/14] Build frontend..."
$SSH "sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null; cd /var/www/planora/app && rm -rf dist && NODE_OPTIONS='--max-old-space-size=2048' npm run build 2>&1 | tail -15"
$SSH "cd /var/www/planora && pm2 restart ecosystem.config.cjs 2>&1 | tail -3"
echo ""

# ── 14. VERIFY BUILD then Clean old assets + Copy to httpdocs + Verification ──
echo "[14/14] Vérification build + copie vers httpdocs + checks finaux..."
$SSH "ls /var/www/planora/app/dist/assets/index-*.js >/dev/null 2>&1 || { echo 'ERREUR: BUILD ECHOUÉ — pas de fichier JS dans dist/assets/'; exit 1; }"
$SSH "rm -f /var/www/vhosts/calendar360.fr/httpdocs/assets/index-*.js /var/www/vhosts/calendar360.fr/httpdocs/assets/index-*.css"
$SSH "cp -r /var/www/planora/app/dist/* /var/www/vhosts/calendar360.fr/httpdocs/"
echo "Copié vers httpdocs"
echo ""
echo "═══ VERIFICATION ═══"
echo ""
$SSH "echo 'Lines:' \$(wc -l < /var/www/planora/app/src/App.jsx)"
$SSH "echo 'v7TransferModal:' \$(grep -c 'v7TransferModal' /var/www/planora/app/src/App.jsx)"
$SSH "echo 'fromPhonePipeline:' \$(grep -c 'fromPhonePipeline' /var/www/planora/app/src/App.jsx)"
$SSH "echo 'suivi tab:' \$(grep -c 'collabFicheTab===\"suivi\"' /var/www/planora/app/src/App.jsx || echo 0)"
$SSH "echo 'typeof count:' \$(grep -c 'typeof ' /var/www/planora/app/src/App.jsx)"
$SSH "echo 'HookIsolator defined:' \$(grep -c 'function HookIsolator' /var/www/planora/app/src/App.jsx)"
$SSH "echo 'HookIsolator used:' \$(grep -c '<HookIsolator>{()=>{' /var/www/planora/app/src/App.jsx)"
$SSH "echo 'V7 modal in render:' \$(awk '/^  return \(/{f=1} f && /\\{\\/\\* V7 TRANSFER MODAL/{print \"YES\"; f=0}' /var/www/planora/app/src/App.jsx | head -1)"
$SSH "echo 'contact_followers in CapFinances tenant:' \$(sqlite3 /var/www/planora-data/tenants/c1776169036725.db '.tables contact_followers' 2>&1)"
$SSH "echo 'build hash:' \$(ls /var/www/planora/app/dist/assets/index-*.js)"
$SSH "echo 'httpdocs hash:' \$(ls /var/www/vhosts/calendar360.fr/httpdocs/assets/index-*.js)"
echo ""

# Cleanup
$SSH "rm -rf /tmp/p0-patches"

echo "═══ DEPLOY ALL v18 COMPLETE (V7 complet : modal + buttons + badges + suivi + status history fix + modal relocation) ═══"
echo ""
echo "Recharge la page (Cmd+Shift+R) et vérifie :"
echo "  1. Onglet Aujourd'hui → plus d'erreur de rendu"
echo "  2. Pipeline Live → bouton Transférer (icône users violet)"
echo "  3. Pipeline Live → clic Transférer → modale s'ouvre"
echo "  4. Fiche contact → onglet 📋 Suivi"
echo "  5. Mon CRM → bouton Transférer + badges"
echo "  6. Console → plus de ReferenceError"
