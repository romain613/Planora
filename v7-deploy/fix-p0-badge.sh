#!/bin/bash
# Fix P0.2 — Badge executor sur Pipeline Live
set -e
VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
PATCHES_DIR="$(cd "$(dirname "$0")/patches" && pwd)"

echo "═══ FIX P0.2 — Badge executor Pipeline Live ═══"
echo ""

echo "[1/3] Upload patch..."
scp -i $SSH_KEY "$PATCHES_DIR/p0-fix-badge.js" "$VPS:/tmp/"
echo ""

echo "[2/3] Exécution patch..."
ssh -i $SSH_KEY $VPS "node /tmp/p0-fix-badge.js"
echo ""

echo "[3/3] Build & restart..."
ssh -i $SSH_KEY $VPS "cd /var/www/planora/app && npm run build 2>&1 | tail -3"
ssh -i $SSH_KEY $VPS "cd /var/www/planora && pm2 restart ecosystem.config.cjs 2>&1 | tail -3"
echo ""

echo "— Vérification —"
ssh -i $SSH_KEY $VPS "echo 'badge fontSize:7 + 8B5CF6:' \$(grep -c 'fontSize:7.*8B5CF6\|8B5CF6.*fontSize:7' /var/www/planora/app/src/App.jsx)"
ssh -i $SSH_KEY $VPS "rm /tmp/p0-fix-badge.js"
echo ""
echo "═══ DONE ═══"
