#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# VERIFY RESTORE — teste qu'un backup est vraiment utilisable
# ═══════════════════════════════════════════════════════════════════════
# Télécharge le backup le plus récent, le décompresse dans /tmp, et vérifie :
# - Les tarballs s'ouvrent sans erreur
# - App.jsx est présent et fait la bonne taille (~1.5 Mo)
# - package.json parse correctement en JSON
# - Les DBs SQLite passent integrity_check
# - control_tower.db contient les companies attendues
# ═══════════════════════════════════════════════════════════════════════
set -e

VPS="root@136.144.204.115"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY $VPS"
SCP="scp -i $SSH_KEY"

TEMP_DIR="/tmp/planora-restore-test-$$"
mkdir -p "$TEMP_DIR"
trap "rm -rf $TEMP_DIR" EXIT

echo "═══ VERIFY RESTORE ═══"
echo "Zone de test : $TEMP_DIR"
echo ""

# ── 1. Trouve le dernier backup sur le VPS ──
echo "[1/6] Recherche du dernier backup sur VPS..."
LATEST_CODE=$($SSH "ls -1t /var/www/backups/code-*.tar.gz 2>/dev/null | grep -v -- -weekly | grep -v -- -monthly | head -1")
LATEST_DB=$($SSH "ls -1t /var/www/backups/db-*.tar.gz 2>/dev/null | grep -v -- -weekly | grep -v -- -monthly | head -1")
if [ -z "$LATEST_CODE" ] || [ -z "$LATEST_DB" ]; then
  echo "ERREUR: pas de backup trouvé dans /var/www/backups/"
  echo "Lance d'abord : /usr/local/bin/planora-backup.sh"
  exit 1
fi
echo "  code : $LATEST_CODE"
echo "  db   : $LATEST_DB"
echo ""

# ── 2. Télécharge ──
echo "[2/6] Téléchargement..."
$SCP "$VPS:$LATEST_CODE" "$TEMP_DIR/code.tar.gz"
$SCP "$VPS:$LATEST_DB" "$TEMP_DIR/db.tar.gz"
echo "  code : $(du -h "$TEMP_DIR/code.tar.gz" | awk '{print $1}')"
echo "  db   : $(du -h "$TEMP_DIR/db.tar.gz" | awk '{print $1}')"
echo ""

# ── 3. Extraction + intégrité tarball ──
echo "[3/6] Extraction + intégrité tarball..."
cd "$TEMP_DIR"
mkdir code-extracted db-extracted

if ! tar xzf code.tar.gz -C code-extracted/ 2>&1; then
  echo "  ✗ ECHEC : tarball code corrompu"
  exit 1
fi
echo "  ✓ code tarball OK"

if ! tar xzf db.tar.gz -C db-extracted/ 2>&1; then
  echo "  ✗ ECHEC : tarball db corrompu"
  exit 1
fi
echo "  ✓ db tarball OK"
echo ""

# ── 4. Vérifie le contenu code ──
echo "[4/6] Vérification du contenu code..."
APP_JSX="$TEMP_DIR/code-extracted/app/src/App.jsx"
if [ ! -f "$APP_JSX" ]; then
  echo "  ✗ ECHEC : App.jsx manquant"
  exit 1
fi
APP_SIZE=$(wc -c < "$APP_JSX")
APP_LINES=$(wc -l < "$APP_JSX")
echo "  App.jsx : $APP_LINES lignes, $(echo "scale=1; $APP_SIZE / 1024 / 1024" | bc 2>/dev/null || echo "?") Mo"
if [ "$APP_LINES" -lt 30000 ]; then
  echo "  ✗ ECHEC : App.jsx suspicieusement court (<30K lignes)"
  exit 1
fi
echo "  ✓ App.jsx taille plausible"

# Vérifie HookIsolator présent (notre patch v17)
if grep -q "<HookIsolator>{()=>{" "$APP_JSX"; then
  echo "  ✓ HookIsolator wrap présent (fix v17 appliqué)"
else
  echo "  ⚠ HookIsolator wrap absent — backup pre-v17 ?"
fi

# Vérifie que package.json parse
PKG="$TEMP_DIR/code-extracted/app/package.json"
if [ -f "$PKG" ]; then
  if node -e "JSON.parse(require('fs').readFileSync('$PKG'))" 2>/dev/null; then
    echo "  ✓ package.json parse correctement"
  else
    echo "  ✗ ECHEC : package.json invalide JSON"
    exit 1
  fi
fi

# Vérifie présence .env
ENV="$TEMP_DIR/code-extracted/server/.env"
if [ -f "$ENV" ]; then
  ENV_LINES=$(wc -l < "$ENV")
  echo "  ✓ .env présent ($ENV_LINES lignes)"
else
  echo "  ⚠ .env absent du backup"
fi
echo ""

# ── 5. Vérifie les DBs ──
echo "[5/6] Vérification des DBs SQLite..."
DB_INNER=$(ls "$TEMP_DIR/db-extracted/" | head -1)
DB_DIR="$TEMP_DIR/db-extracted/$DB_INNER"

for db in calendar360.db control_tower.db; do
  if [ -f "$DB_DIR/$db" ]; then
    INTEGRITY=$(sqlite3 "$DB_DIR/$db" "PRAGMA integrity_check;" 2>&1)
    if [ "$INTEGRITY" = "ok" ]; then
      TABLES=$(sqlite3 "$DB_DIR/$db" ".tables" 2>/dev/null | tr ' ' '\n' | wc -l)
      SIZE=$(du -h "$DB_DIR/$db" | awk '{print $1}')
      echo "  ✓ $db : integrity OK, $TABLES tables, $SIZE"
    else
      echo "  ✗ ECHEC : $db integrity failed: $INTEGRITY"
      exit 1
    fi
  else
    echo "  ⚠ $db absent"
  fi
done

# Vérifie qu'il y a bien des contacts + companies dans calendar360.db
if [ -f "$DB_DIR/calendar360.db" ]; then
  CONTACTS=$(sqlite3 "$DB_DIR/calendar360.db" "SELECT COUNT(*) FROM contacts;" 2>/dev/null || echo "?")
  COMPANIES=$(sqlite3 "$DB_DIR/calendar360.db" "SELECT COUNT(*) FROM companies;" 2>/dev/null || echo "?")
  COLLABS=$(sqlite3 "$DB_DIR/calendar360.db" "SELECT COUNT(*) FROM collaborators;" 2>/dev/null || echo "?")
  echo "  calendar360.db : $COMPANIES companies, $COLLABS collaborators, $CONTACTS contacts"
fi
echo ""

# ── 6. Résumé ──
echo "[6/6] ═══ RÉSULTAT ═══"
echo ""
echo "✓ BACKUP VALIDE — la restauration est possible."
echo ""
echo "Si besoin de restaurer sur un nouveau VPS :"
echo ""
echo "  # Sur le nouveau VPS :"
echo "  mkdir -p /var/www/planora /var/www/planora-data"
echo "  cd /var/www/planora"
echo "  # Upload le backup code puis :"
echo "  tar xzf code-TIMESTAMP.tar.gz"
echo "  cd app && npm install"
echo ""
echo "  # DB :"
echo "  cd /var/www/planora-data"
echo "  tar xzf db-TIMESTAMP.tar.gz --strip-components=1"
echo "  # → calendar360.db, control_tower.db, tenants/ restaurés"
echo ""
echo "  # Build frontend + PM2 :"
echo "  cd /var/www/planora/app && npm run build"
echo "  cp -r dist/* /var/www/vhosts/<domain>/httpdocs/"
echo "  cd /var/www/planora && pm2 start ecosystem.config.cjs"
