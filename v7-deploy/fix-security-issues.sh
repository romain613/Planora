#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# FIX SECURITY ISSUES — Calendar360 / PLANORA
# ═══════════════════════════════════════════════════════════════════════
# 1. Lock down .env + ecosystem.config.cjs to 600
# 2. Reset ownership to root:root (fix UNKNOWN:staff)
# 3. Configure PM2 startup (auto-restart après reboot)
# ═══════════════════════════════════════════════════════════════════════
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"

echo "═══ FIX SECURITY ISSUES ═══"
echo ""

# ── 1. Fix file permissions ──
echo "[1/3] Lock down des permissions sensibles..."
$SSH "bash -s" <<'EOF'
# .env → 600 (read/write only by owner)
if [ -f /var/www/planora/server/.env ]; then
  chmod 600 /var/www/planora/server/.env
  chown root:root /var/www/planora/server/.env
  echo "  .env → $(stat -c '%a %U:%G' /var/www/planora/server/.env)"
fi

# ecosystem.config.cjs → 600 (contient des variables d'env)
if [ -f /var/www/planora/ecosystem.config.cjs ]; then
  chmod 600 /var/www/planora/ecosystem.config.cjs
  chown root:root /var/www/planora/ecosystem.config.cjs
  echo "  ecosystem.config.cjs → $(stat -c '%a %U:%G' /var/www/planora/ecosystem.config.cjs)"
fi

# Fix UNKNOWN:staff ownership pour /var/www/planora
# Met tout en root:root (le process PM2 tourne en root de toute façon)
chown -R root:root /var/www/planora/ 2>/dev/null
chown -R root:root /var/www/planora-data/ 2>/dev/null
echo "  Ownership /var/www/planora : root:root"
echo "  Ownership /var/www/planora-data : root:root"
EOF
echo ""

# ── 2. Configure PM2 startup ──
echo "[2/3] Configuration PM2 startup (auto-restart après reboot)..."
$SSH "bash -s" <<'EOF'
# Crée le service systemd qui relance PM2 au boot
STARTUP_CMD=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo env" | head -1 || true)
if [ -n "$STARTUP_CMD" ]; then
  # PM2 renvoie la commande à exécuter — on l'exécute
  eval "$STARTUP_CMD"
  echo "  Service systemd créé"
else
  # Peut-être déjà configuré
  echo "  PM2 startup probablement déjà configuré"
fi

# Sauvegarde l'état actuel de PM2 (liste des process à restaurer au boot)
pm2 save
echo "  État PM2 sauvegardé dans /root/.pm2/dump.pm2"

# Vérification
systemctl status pm2-root --no-pager 2>&1 | head -10 | sed 's/^/  /'
EOF
echo ""

# ── 3. Vérification finale ──
echo "[3/3] ═══ VÉRIFICATION ═══"
$SSH "bash -s" <<'EOF'
echo "Permissions fichiers sensibles :"
for f in /var/www/planora/server/.env /var/www/planora/ecosystem.config.cjs /root/.ssh/authorized_keys; do
  if [ -e "$f" ]; then
    stat -c "  %a %U:%G %n" "$f"
  fi
done

echo ""
echo "PM2 systemd service :"
systemctl is-enabled pm2-root 2>&1 | sed 's/^/  /'
systemctl is-active pm2-root 2>&1 | sed 's/^/  /'

echo ""
echo "PM2 dump :"
if [ -f /root/.pm2/dump.pm2 ]; then
  echo "  dump.pm2 existe ($(wc -c < /root/.pm2/dump.pm2) octets)"
  grep -o '"name":"[^"]*"' /root/.pm2/dump.pm2 | sed 's/^/    /'
else
  echo "  PAS de dump — pm2 save a échoué"
fi
EOF
echo ""
echo "═══ SÉCURITÉ CONSOLIDÉE ═══"
echo ""
echo "Test facultatif : reboot du VPS et vérifier que calendar360 redémarre seul"
echo "  Depuis TransIP panel → VPS → Redémarrer"
echo "  Puis attendre 90s et tester https://calendar360.fr/"
