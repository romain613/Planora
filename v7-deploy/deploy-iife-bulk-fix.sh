#!/bin/bash
# Bulk fix — wrap ALL IIFEs with hooks in HookIsolator + rebuild + deploy
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

echo "=== BULK IIFE HOOK WRAP + BUILD + DEPLOY ==="

echo "[1/5] Upload patch..."
$SCP patches/fix-all-iife-hooks.js $VPS:/tmp/fix-all-iife-hooks.js

echo ""
echo "[2/5] Backup App.jsx current..."
$SSH "cp /var/www/planora/app/src/App.jsx /var/www/planora/app/src/App.jsx.pre-iife-bulk-\$(date +%Y%m%d-%H%M%S)"

echo ""
echo "[3/5] Apply bulk fix..."
$SSH "node /tmp/fix-all-iife-hooks.js"

echo ""
echo "[4/5] Build with sourcemap..."
$SSH 'cd /var/www/planora/app && NODE_OPTIONS="--max-old-space-size=2048" npx vite build --sourcemap=true 2>&1 | tail -10'

echo ""
echo "[5/5] Deploy to httpdocs..."
$SSH 'ls /var/www/planora/app/dist/assets/index-*.js >/dev/null 2>&1 || { echo "ERREUR BUILD"; exit 1; }'
$SSH 'rm -rf /var/www/vhosts/calendar360.fr/httpdocs/assets && cp -r /var/www/planora/app/dist/* /var/www/vhosts/calendar360.fr/httpdocs/'
$SSH 'ls /var/www/vhosts/calendar360.fr/httpdocs/assets/ | head -5'

echo ""
echo "=== DONE ==="
echo ""
echo "TEST :"
echo "1. Cmd+Shift+R pour recharger"
echo "2. CRM → clique un contact → doit s'ouvrir sans #310"
echo "3. Pipeline Live → clique Transférer → modale doit s'ouvrir"
echo "4. Aujourd'hui → doit toujours marcher"
