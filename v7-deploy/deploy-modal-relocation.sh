#!/bin/bash
# Move V7 Transfer Modal from dead code to render JSX + fix backend contact_followers for tenants
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

echo "=== MODAL RELOCATION + CONTACT_FOLLOWERS TENANT FIX ==="

echo "[1/6] Backup App.jsx..."
$SSH "cp /var/www/planora/app/src/App.jsx /var/www/planora/app/src/App.jsx.pre-relocation-\$(date +%Y%m%d-%H%M%S)"

echo ""
echo "[2/6] Upload frontend patch..."
$SCP patches/fix-modal-relocation.js $VPS:/tmp/fix-modal-relocation.js

echo ""
echo "[3/6] Apply modal relocation..."
$SSH "node /tmp/fix-modal-relocation.js"

echo ""
echo "[4/6] Copy contact_followers schema to tenant DBs (CapFinances + MonBilan)..."
$SSH 'bash -s' <<'REMOTE'
SCHEMA=$(sqlite3 /var/www/planora-data/calendar360.db '.schema contact_followers')
if [ -z "$SCHEMA" ]; then
  echo "  WARN: contact_followers schema is EMPTY in monolith — skipping"
else
  for TENANT in c1776169036725 c-monbilan; do
    TENANT_DB="/var/www/planora-data/tenants/$TENANT.db"
    if [ -f "$TENANT_DB" ]; then
      EXISTS=$(sqlite3 "$TENANT_DB" ".tables contact_followers" 2>&1)
      if [ "$EXISTS" = "contact_followers" ]; then
        echo "  $TENANT: contact_followers already exists, skip"
      else
        echo "$SCHEMA" | sqlite3 "$TENANT_DB" 2>&1
        echo "  $TENANT: created contact_followers"
      fi
    fi
  done
fi
REMOTE

echo ""
echo "[5/6] Build..."
$SSH 'cd /var/www/planora/app && NODE_OPTIONS="--max-old-space-size=2048" npx vite build --sourcemap=true 2>&1 | tail -8'

echo ""
echo "[6/6] Deploy..."
$SSH 'rm -rf /var/www/vhosts/calendar360.fr/httpdocs/assets && cp -r /var/www/planora/app/dist/* /var/www/vhosts/calendar360.fr/httpdocs/ && ls /var/www/vhosts/calendar360.fr/httpdocs/assets/ | head -5'

echo ""
echo "=== DONE ==="
echo ""
echo "TESTS :"
echo "1. Cmd+Shift+R"
echo "2. CRM kanban → clique Transférer sur carte → modale doit s'ouvrir ENFIN"
echo "3. Pipeline Live → fiche latérale → clique Transférer → modale s'ouvre"
echo "4. CRM fiche → onglet Suivi → plus de 500 dans console pour /api/transfer/followers"
echo ""
echo "Si white screen → rollback immédiat :"
echo "  ssh root@VPS 'ls -1t /var/www/planora/app/src/App.jsx.pre-relocation-* | head -1 | xargs -I{} cp {} /var/www/planora/app/src/App.jsx'"
echo "  puis rebuild + deploy"
