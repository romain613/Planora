#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# P0 CLEAN v2 — Fichiers .js séparés, plus de quoting hell
# Calendar360 / PLANORA
# ═══════════════════════════════════════════════════════════════════════
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"
PATCHES_DIR="$(cd "$(dirname "$0")/patches" && pwd)"

echo "═══ P0 CLEAN v2 DEPLOYMENT ═══"
echo ""

# ── 0. Upload patch files to VPS ──
echo "[0/7] Upload des patches sur le VPS..."
$SSH "mkdir -p /tmp/p0-patches"
$SCP "$PATCHES_DIR/p0-step1-v7base.js" "$VPS:/tmp/p0-patches/"
$SCP "$PATCHES_DIR/p0-step2-pipeline-btn.js" "$VPS:/tmp/p0-patches/"
$SCP "$PATCHES_DIR/p0-step3-pipeline-badge.js" "$VPS:/tmp/p0-patches/"
$SCP "$PATCHES_DIR/p0-step4-suivi-tab.js" "$VPS:/tmp/p0-patches/"
echo "4 fichiers uploadés"
echo ""

# ── 1. Restore clean App.jsx ──
echo "[1/7] Restauration App.jsx.pre-v7 (état propre)..."
$SSH 'bash -s' << 'RESTORE'
cd /var/www/planora/app/src
if [ ! -f App.jsx.pre-v7 ]; then
  echo "ERREUR: App.jsx.pre-v7 introuvable"
  exit 1
fi
cp App.jsx App.jsx.pre-p0-v2-backup
cp App.jsx.pre-v7 App.jsx
if grep -q "v7TransferModal" App.jsx; then
  echo "ERREUR: App.jsx.pre-v7 contient du V7 — pas un backup propre"
  exit 1
fi
echo "App.jsx restauré — fichier propre confirmé"
RESTORE
echo ""

# ── 2. Step 1: V7 base ──
echo "[2/7] V7 base (states + handler + modal + CRM button + CRM badges)..."
$SSH "node /tmp/p0-patches/p0-step1-v7base.js"
echo ""

# ── 3. Step 2: Pipeline Live transfer button ──
echo "[3/7] P0.1 — Bouton Transférer sur Pipeline Live..."
$SSH "node /tmp/p0-patches/p0-step2-pipeline-btn.js"
echo ""

# ── 4. Step 3: Pipeline Live executor badge ──
echo "[4/7] P0.2 — Badge executor sur Pipeline Live..."
$SSH "node /tmp/p0-patches/p0-step3-pipeline-badge.js"
echo ""

# ── 5. Step 4: Suivi tab ──
echo "[5/7] P0.3 — Onglet Suivi..."
$SSH "node /tmp/p0-patches/p0-step4-suivi-tab.js"
echo ""

# ── 6. Build & Restart ──
echo "[6/7] Build frontend & restart PM2..."
$SSH "cd /var/www/planora/app && npm run build 2>&1 | tail -5"
$SSH "cd /var/www/planora && pm2 restart ecosystem.config.cjs 2>&1 | tail -3"
echo ""

# ── 7. Verification ──
echo "[7/7] ═══ VERIFICATION ═══"
echo ""
echo "— V7 base —"
$SSH "echo 'v7TransferModal:' \$(grep -c 'v7TransferModal' /var/www/planora/app/src/App.jsx)"
$SSH "echo 'handleV7Transfer:' \$(grep -c 'handleV7Transfer' /var/www/planora/app/src/App.jsx)"
echo ""
echo "— P0.1: Pipeline Live transfer button —"
$SSH "echo 'fromPhonePipeline:' \$(grep -c 'fromPhonePipeline' /var/www/planora/app/src/App.jsx)"
echo ""
echo "— P0.2: Pipeline Live executor badge —"
$SSH "echo 'fontSize:7.*8B5CF6:' \$(grep -c 'fontSize:7.*8B5CF6' /var/www/planora/app/src/App.jsx)"
echo ""
echo "— P0.3: Suivi tab —"
$SSH "echo 'suivi tab def:' \$(grep -c '\"suivi\"' /var/www/planora/app/src/App.jsx)"
$SSH "echo 'suivi tab content:' \$(grep -c 'collabFicheTab===\"suivi\"' /var/www/planora/app/src/App.jsx)"
echo ""
echo "— PM2 status —"
$SSH "pm2 logs planora --lines 3 --nostream 2>&1 | tail -3"
echo ""

# Cleanup
$SSH "rm -rf /tmp/p0-patches"

echo "═══ P0 v2 DEPLOYMENT COMPLETE ═══"
echo ""
echo "Recharge la page et vérifie :"
echo "  1. Pipeline Live → icône users violet à côté de SMS"
echo "  2. Pipeline Live → badge violet si contact transféré"
echo "  3. Fiche contact → onglet 📋 Suivi"
