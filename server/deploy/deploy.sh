#!/bin/bash
# ─── Calendar360 VPS Deployment Script ───
# Run: bash deploy.sh
# Tested on Ubuntu 22.04 / 24.04 (VPS Amen)

set -e

DOMAIN="calendar360.fr"
APP_DIR="/var/www/calendar360"
LOG_DIR="/var/log/calendar360"

echo "╔══════════════════════════════════════════╗"
echo "║  Calendar360 — VPS Deployment            ║"
echo "╚══════════════════════════════════════════╝"

# 1. System update
echo "→ Updating system..."
apt update && apt upgrade -y

# 2. Install Node.js 20
echo "→ Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 3. Install Nginx
echo "→ Installing Nginx..."
apt install -y nginx

# 4. Install PM2
echo "→ Installing PM2..."
npm install -g pm2

# 5. Create app directory
echo "→ Setting up app directory..."
mkdir -p $APP_DIR
mkdir -p $LOG_DIR

# 6. Copy files (assumes you've uploaded them to $APP_DIR)
echo "→ Installing dependencies..."
cd $APP_DIR/server
npm install --production

# 7. Seed database (first deploy only)
echo "→ Seeding database..."
node seed.js

# 8. Build frontend
echo "→ Building frontend..."
cd $APP_DIR/app
npm install
npm run build

# 9. Configure Nginx
echo "→ Configuring Nginx..."
cp $APP_DIR/server/deploy/nginx.conf /etc/nginx/sites-available/calendar360
ln -sf /etc/nginx/sites-available/calendar360 /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 10. SSL with Let's Encrypt
echo "→ Setting up SSL..."
apt install -y certbot python3-certbot-nginx
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || echo "⚠ SSL setup failed — run certbot manually"

# 11. Start with PM2
echo "→ Starting Calendar360..."
cd $APP_DIR/server
NODE_ENV=production pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup | tail -1 | bash

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ Calendar360 deployed!                ║"
echo "║  https://$DOMAIN                 ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Commands:"
echo "  pm2 status          — voir le statut"
echo "  pm2 logs calendar360 — voir les logs"
echo "  pm2 restart calendar360 — redémarrer"
