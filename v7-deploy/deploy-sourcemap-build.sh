#!/bin/bash
# Safe build with sourcemaps — keeps minification, adds .js.map for browser
# Memory-capped to prevent OOM
set -e

SSH="ssh -i ~/.ssh/id_ed25519 root@136.144.204.115"

echo "=== SOURCEMAP BUILD — safe memory mode ==="

$SSH "bash -s" <<'REMOTE'
set -e
cd /var/www/planora/app

echo "Free RAM before build:"
free -h | head -2

echo ""
echo "[1/4] Building with sourcemap (Node capped at 2 GB)..."
NODE_OPTIONS="--max-old-space-size=2048" npx vite build --sourcemap=true 2>&1 | tail -20

if [ ! -d dist/assets ]; then
  echo "ERREUR: pas de dist/assets/"
  exit 1
fi

echo ""
echo "[2/4] Build output:"
ls -lh dist/assets/*.js dist/assets/*.map 2>/dev/null | head -5

echo ""
echo "[3/4] Deploying to httpdocs..."
rm -rf /var/www/vhosts/calendar360.fr/httpdocs/assets
cp -r dist/* /var/www/vhosts/calendar360.fr/httpdocs/

echo ""
echo "[4/4] Verification:"
ls /var/www/vhosts/calendar360.fr/httpdocs/assets/ | head -8

echo ""
echo "Free RAM after build:"
free -h | head -2

echo ""
echo "=== DONE ==="
REMOTE

echo ""
echo "=== MAINTENANT : ==="
echo "1. Recharge avec Cmd+Shift+R"
echo "2. Ouvre DevTools (Cmd+Option+I) AVANT de cliquer Aujourd'hui"
echo "3. Onglet Console"
echo "4. Clique Aujourd'hui"
echo "5. L'erreur devrait maintenant afficher des noms lisibles + fichier App.jsx:ligne"
echo "6. Copie-colle-moi l'erreur + la pile"
