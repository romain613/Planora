#!/bin/bash
# Fix CRM Fiche React #310 — wrap Status History IIFE in HookIsolator
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

echo "=== STATUS HISTORY IIFE FIX + BUILD + DEPLOY ==="

echo "[1/4] Upload patch..."
$SCP patches/fix-status-history-hooks.js $VPS:/tmp/fix-status-history-hooks.js

echo ""
echo "[2/4] Apply patch..."
$SSH "node /tmp/fix-status-history-hooks.js"

echo ""
echo "[3/4] Build..."
$SSH 'cd /var/www/planora/app && NODE_OPTIONS="--max-old-space-size=2048" npx vite build --sourcemap=true 2>&1 | tail -8'

echo ""
echo "[4/4] Deploy..."
$SSH 'rm -rf /var/www/vhosts/calendar360.fr/httpdocs/assets && cp -r /var/www/planora/app/dist/* /var/www/vhosts/calendar360.fr/httpdocs/ && ls /var/www/vhosts/calendar360.fr/httpdocs/assets/ | head -5'

echo ""
echo "=== DONE ==="
echo ""
echo "TEST : Cmd+Shift+R → CRM → clique un contact → la fiche doit s'ouvrir sans #310"
