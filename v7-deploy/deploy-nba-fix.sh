#!/bin/bash
# Fix Aujourd'hui tab React #310 — wrap NBA IIFE in HookIsolator
# Then rebuild with sourcemap + deploy to httpdocs
set -e

SSH="ssh -i ~/.ssh/id_ed25519 root@136.144.204.115"
SCP="scp -i ~/.ssh/id_ed25519"

echo "=== NBA HOOK ISOLATION FIX + BUILD + DEPLOY ==="

# 1. Upload patch
echo "[1/5] Uploading patch..."
$SCP patches/fix-nba-hooks-isolation.js root@136.144.204.115:/tmp/fix-nba-hooks-isolation.js

# 2. Apply patch
echo ""
echo "[2/5] Applying patch on VPS..."
$SSH "node /tmp/fix-nba-hooks-isolation.js"

# 3. Build
echo ""
echo "[3/5] Building with sourcemap (Node capped at 2 GB)..."
$SSH 'cd /var/www/planora/app && NODE_OPTIONS="--max-old-space-size=2048" npx vite build --sourcemap=true 2>&1 | tail -15'

# 4. Verify build
echo ""
echo "[4/5] Build verification..."
$SSH 'ls -lh /var/www/planora/app/dist/assets/*.js 2>&1 | head -3'

# 5. Deploy
echo ""
echo "[5/5] Deploying to httpdocs..."
$SSH 'rm -rf /var/www/vhosts/calendar360.fr/httpdocs/assets && cp -r /var/www/planora/app/dist/* /var/www/vhosts/calendar360.fr/httpdocs/ && ls /var/www/vhosts/calendar360.fr/httpdocs/assets/ | head -5'

echo ""
echo "=== DONE ==="
echo ""
echo "=== TEST : ==="
echo "1. Cmd+Shift+R pour recharger"
echo "2. Clique Aujourd'hui"
echo "3. Si pas d'erreur, clique ensuite CRM, Agenda, Pipeline — aucun doit crash"
echo "4. Si erreur encore → envoie-moi la nouvelle pile (avec source maps elle sera lisible)"
