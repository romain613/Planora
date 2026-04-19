#!/bin/bash
# ROLLBACK URGENT — Restaure App.jsx.bak-20260417 (état propre, sans V7)
set -e
VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"

echo "═══ ROLLBACK URGENT ═══"
echo ""

echo "[1/4] Restauration App.jsx.bak-20260417..."
$SSH 'bash -s' << 'EOF'
cd /var/www/planora/app/src
cp App.jsx App.jsx.broken-backup
cp App.jsx.bak-20260417 App.jsx
echo "Restauré depuis App.jsx.bak-20260417"
echo "Lignes: $(wc -l < App.jsx)"
EOF
echo ""

echo "[2/4] Build..."
$SSH "cd /var/www/planora/app && rm -rf dist && npm run build 2>&1 | tail -5"
echo ""

echo "[3/4] Copie vers httpdocs..."
$SSH "rm -f /var/www/vhosts/calendar360.fr/httpdocs/assets/index-*.js /var/www/vhosts/calendar360.fr/httpdocs/assets/index-*.css"
$SSH "cp -r /var/www/planora/app/dist/* /var/www/vhosts/calendar360.fr/httpdocs/"
echo ""

echo "[4/4] Restart PM2..."
$SSH "cd /var/www/planora && pm2 restart ecosystem.config.cjs 2>&1 | tail -3"
echo ""

echo "═══ ROLLBACK DONE ═══"
echo "L'app est revenue à l'état du 17 avril matin (sans V7, sans fixes)."
echo "Les bugs pre-existants (selectedCrmContact) seront présents."
echo "Recharge la page (Cmd+Shift+R) pour vérifier."
