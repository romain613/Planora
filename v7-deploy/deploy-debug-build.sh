#!/bin/bash
# Deploy a NON-MINIFIED build to get real error messages
# Streams output in real time — no buffering
set -e

SSH="ssh -i ~/.ssh/id_ed25519 root@136.144.204.115"

echo "=== DEBUG BUILD — non-minified ==="
echo "Connecting to VPS... (if stuck here, SSH key issue)"

$SSH -t "cd /var/www/planora/app && \
  echo '[1/4] Backing up vite config...' && \
  ls vite.config.* 2>/dev/null && \
  echo '[2/4] Building without minification (slow ~60s)...' && \
  npx vite build --minify=false 2>&1 && \
  echo '[3/4] Build complete. Checking output...' && \
  ls -lh dist/assets/*.js | head -3 && \
  echo '[4/4] Deploying to httpdocs...' && \
  rm -rf /var/www/vhosts/calendar360.fr/httpdocs/assets && \
  cp -r dist/* /var/www/vhosts/calendar360.fr/httpdocs/ && \
  echo '=== DONE ===' && \
  ls /var/www/vhosts/calendar360.fr/httpdocs/assets/ | head -5"

echo ""
echo "=== MAINTENANT : ==="
echo "1. Recharge la page avec Cmd+Shift+R"
echo "2. Clique sur Aujourd'hui"
echo "3. L'erreur affichera le vrai nom de variable"
echo "4. Copie-colle-moi le texte complet"
