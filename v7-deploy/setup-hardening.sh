#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# SETUP HARDENING — Calendar360 / PLANORA
# ═══════════════════════════════════════════════════════════════════════
# Installe tout ce qui ferme les vrais trous de prod :
# - unattended-upgrades (patches sécurité Debian auto)
# - logrotate pour PM2 (évite que les logs explosent le disque)
# - cron-daily-backup (backup auto à 2h du matin)
# - rclone (optionnel, pour offsite B2/S3/Drive)
# ═══════════════════════════════════════════════════════════════════════
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

echo "═══ SETUP HARDENING ═══"
echo ""

# ── 1. Unattended-upgrades (patches sécurité automatiques) ──
echo "[1/5] Unattended-upgrades (patches sécurité Debian auto)..."
$SSH "bash -s" <<'REMOTE'
set -e
if ! dpkg -l unattended-upgrades 2>/dev/null | grep -q '^ii'; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y unattended-upgrades apt-listchanges >/dev/null
  echo "  installé"
else
  echo "  déjà installé"
fi

# Active les mises à jour automatiques (quotidien)
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

# Seulement les patches SECURITY (pas les upgrades majeurs qui pourraient casser)
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Origins-Pattern {
    "origin=Debian,codename=${distro_codename},label=Debian-Security";
    "origin=Debian,codename=${distro_codename}-security,label=Debian-Security";
};
Unattended-Upgrade::Package-Blacklist {
    "nodejs";
    "nginx";
    "plesk";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Mail "";
EOF

systemctl restart unattended-upgrades 2>/dev/null || true
echo "  config écrite (SECURITY uniquement, nodejs/nginx/plesk exclus)"
REMOTE
echo ""

# ── 2. Logrotate pour PM2 ──
echo "[2/5] Logrotate PM2 (évite le disque plein)..."
$SSH "bash -s" <<'REMOTE'
set -e
# PM2 a son propre module logrotate — installons-le
if ! pm2 list | grep -q "pm2-logrotate"; then
  pm2 install pm2-logrotate 2>&1 | tail -3
else
  echo "  pm2-logrotate déjà installé"
fi

# Config : rotate à 10 Mo, garde 30 fichiers compressés
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # minuit
pm2 save
echo "  config : max 10M, garde 30 fichiers compressés, rotation minuit"
REMOTE
echo ""

# ── 3. Cron daily backup ──
echo "[3/5] Cron daily backup (02:00 chaque nuit)..."
$SCP "cron-daily-backup.sh" "$VPS:/usr/local/bin/planora-backup.sh"
$SSH "chmod 700 /usr/local/bin/planora-backup.sh && chown root:root /usr/local/bin/planora-backup.sh"

# Installe le cron
$SSH "bash -s" <<'REMOTE'
cat > /etc/cron.d/planora-backup <<'EOF'
# Backup automatique Calendar360 / PLANORA — quotidien à 02:00
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 2 * * * root /usr/local/bin/planora-backup.sh
EOF
chmod 644 /etc/cron.d/planora-backup
systemctl restart cron 2>&1 | tail -2
echo "  cron installé — prochain backup $(date -d 'tomorrow 02:00' 2>/dev/null || date -v+1d -v2H 2>/dev/null || echo 'demain 2h')"

# Crée le fichier log s'il n'existe pas
touch /var/log/planora-backup.log
chmod 640 /var/log/planora-backup.log
echo "  log : /var/log/planora-backup.log"
REMOTE

# Lance le premier backup pour vérifier que le script tourne sans erreur
echo ""
echo "[3.5] Test : premier backup manuel..."
$SSH "/usr/local/bin/planora-backup.sh && tail -20 /var/log/planora-backup.log"
echo ""

# ── 4. Rclone (optionnel, pour offsite) ──
echo "[4/5] Rclone (offsite backup — optionnel)..."
$SSH "bash -s" <<'REMOTE'
set -e
if ! command -v rclone >/dev/null 2>&1; then
  curl -s https://rclone.org/install.sh | bash 2>&1 | tail -3
else
  echo "  rclone déjà installé : $(rclone version | head -1)"
fi
echo ""
echo "  Pour activer l'offsite backup, lance sur le VPS :"
echo "    ssh -i ~/.ssh/id_ed25519 root@136.144.204.115"
echo "    rclone config"
echo ""
echo "  Dans l'assistant rclone :"
echo "    n) new remote"
echo "    name: planora-offsite"
echo "    Choisis Backblaze B2 (option 10 environ)"
echo "    Colle tes keyId / applicationKey B2"
echo "    Accepte les défauts pour le reste"
echo ""
echo "  Ensuite le backup quotidien uploadera automatiquement vers B2."
echo ""
echo "  Pour créer un compte B2 (gratuit jusqu'à 10 Go) :"
echo "    1. https://www.backblaze.com/cloud-storage/b2 → Sign Up"
echo "    2. Créer un bucket 'planora-backups' (privé)"
echo "    3. App Keys → Add New Application Key → limit to bucket 'planora-backups'"
echo "    4. Note le keyId + applicationKey (affichés une seule fois)"
REMOTE
echo ""

# ── 5. Résumé ──
echo "[5/5] ═══ VÉRIFICATION FINALE ═══"
$SSH "bash -s" <<'REMOTE'
echo ""
echo "── Unattended-upgrades ──"
systemctl is-enabled unattended-upgrades 2>&1 | sed 's/^/  /'
systemctl is-active unattended-upgrades 2>&1 | sed 's/^/  /'

echo ""
echo "── PM2 logrotate ──"
pm2 list | grep logrotate | sed 's/^/  /' || echo "  (pas listé)"

echo ""
echo "── Cron backup ──"
cat /etc/cron.d/planora-backup | grep -v '^#' | grep -v '^$' | sed 's/^/  /'
echo "  Dernière exécution :"
tail -5 /var/log/planora-backup.log | sed 's/^/    /'

echo ""
echo "── Backups actuels ──"
ls -lh /var/www/backups/ | head -10 | sed 's/^/  /'

echo ""
echo "── Rclone ──"
if command -v rclone >/dev/null 2>&1; then
  echo "  version : $(rclone version | head -1)"
  echo "  remotes : $(rclone listremotes 2>/dev/null | tr '\n' ' ')"
else
  echo "  pas installé"
fi
REMOTE

echo ""
echo "═══ HARDENING COMPLET ═══"
echo ""
echo "ÉTAT FINAL :"
echo "  ✓ Patches sécurité Debian auto (quotidien)"
echo "  ✓ Logs PM2 rotés (10M max, 30 fichiers, compressés)"
echo "  ✓ Backup quotidien 02:00 (7 daily + 4 weekly + 3 monthly)"
echo "  ✓ Rotation automatique (pas de disque plein)"
echo "  ○ Offsite B2 : à configurer (optionnel, voir instructions ci-dessus)"
echo ""
echo "En cas de besoin :"
echo "  - Voir les logs backup    : ssh root@VPS 'tail -100 /var/log/planora-backup.log'"
echo "  - Forcer un backup        : ssh root@VPS '/usr/local/bin/planora-backup.sh'"
echo "  - Tester la restauration  : bash verify-restore.sh"
