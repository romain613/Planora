#!/bin/bash
# Fix Transfer modal scope + Suivi empty state button
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

echo "=== MODAL SCOPE + EMPTY BTN FIX + BUILD + DEPLOY ==="

echo "[1/5] Backup App.jsx..."
$SSH "cp /var/www/planora/app/src/App.jsx /var/www/planora/app/src/App.jsx.pre-modal-fix-\$(date +%Y%m%d-%H%M%S)"

echo ""
echo "[2/5] Upload patch..."
$SCP patches/fix-modal-scope-and-empty-btn.js $VPS:/tmp/fix-modal-scope-and-empty-btn.js

echo ""
echo "[3/5] Apply fix..."
$SSH "node /tmp/fix-modal-scope-and-empty-btn.js"

echo ""
echo "[4/5] Build with sourcemap..."
$SSH 'cd /var/www/planora/app && NODE_OPTIONS="--max-old-space-size=2048" npx vite build --sourcemap=true 2>&1 | tail -10'

echo ""
echo "[5/5] Deploy..."
$SSH 'rm -rf /var/www/vhosts/calendar360.fr/httpdocs/assets && cp -r /var/www/planora/app/dist/* /var/www/vhosts/calendar360.fr/httpdocs/ && ls /var/www/vhosts/calendar360.fr/httpdocs/assets/ | head -5'

echo ""
echo "=== DONE ==="
echo ""
echo "TEST :"
echo "1. Cmd+Shift+R pour recharger"
echo "2. CRM → clique contact → onglet Suivi → bouton Transférer apparaît + clique → modale s'ouvre"
echo "3. Pipeline Live → clique Transférer dans fiche latérale → modale s'ouvre"
echo "4. CRM kanban → clique Transférer sur carte → modale s'ouvre"
echo ""
echo "En cas de white screen après reload :"
echo "  → rollback immédiat : ssh root@VPS 'cp /var/www/planora/app/src/App.jsx.pre-modal-fix-* /var/www/planora/app/src/App.jsx && cd /var/www/planora/app && npm run build && cp -r dist/* /var/www/vhosts/calendar360.fr/httpdocs/'"
