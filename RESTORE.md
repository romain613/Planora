# PLANORA — Procédure de restauration

> **Dernière mise à jour** : 2026-04-26 (V1.8.24)
> **Audience** : MH, équipe technique, repreneur d'urgence
> **Prérequis** : accès SSH `root@136.144.204.115` (ou nouveau VPS) + accès rclone (GDrive + B2)

---

## 0. Architecture des backups (V1.8.24)

| Type | Fréquence | Source | Destinations off-site | Rétention locale |
|---|---|---|---|---|
| **DB SQLite (monolithe + control_tower)** | Toutes les 6h (cron 0h07/6h07/12h07/18h07) | `/var/www/planora-data/{calendar360,control_tower}.db` | GDrive `gdrive-backup:daily/` + Backblaze B2 `planora-offsite:planora-backups/db-6h/` | 30 jours |
| **Code complet (tar.gz)** | 1x/jour à 02:30 UTC | `/var/www/planora/` (sans node_modules/dist/.git) | GDrive `daily/` + Backblaze B2 `planora-backups/code-daily/` | 14 jours |

**Logs** : `/var/www/planora-data/backup.log` — rotation hebdomadaire (12 semaines via logrotate).

**Alerte automatique** : email Brevo vers `rc.sitbon@gmail.com` si **les 2 destinations off-site** échouent simultanément.

**Snapshots manuels** : `/var/backups/planora/snapshot-*.tar.gz` + `db-snapshot-*.db` (créés avant chaque release majeure).

---

## 1. Cas d'urgence — VPS principal HS

### 1.a Si SSH OK mais service KO

```bash
# Vérifier l'état pm2
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "pm2 list"

# Si process crashé, voir les logs
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "pm2 logs calendar360 --err --nostream --lines 50"

# Restart simple
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "pm2 restart calendar360"

# Si la DB est corrompue, voir 1.b
```

### 1.b DB corrompue — restaurer le dernier backup local

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
# 1. Stopper le serveur
pm2 stop calendar360

# 2. Sauvegarder l'état actuel (au cas où)
cp /var/www/planora-data/calendar360.db /var/www/planora-data/calendar360.db.broken-$(date +%Y%m%d-%H%M%S)

# 3. Restaurer depuis le dernier backup
LATEST_DB=\$(ls -t /var/www/planora-data/backups/auto-6h-*.db | grep -v '\\-ct\\.db' | head -1)
echo \"Restauration depuis : \$LATEST_DB\"
cp \$LATEST_DB /var/www/planora-data/calendar360.db

# 4. Restaurer aussi control_tower (V1.8.24+)
LATEST_CT=\$(ls -t /var/www/planora-data/backups/auto-6h-*-ct.db 2>/dev/null | head -1)
[ -n \"\$LATEST_CT\" ] && cp \$LATEST_CT /var/www/planora-data/control_tower.db

# 5. Vérifier intégrité
sqlite3 /var/www/planora-data/calendar360.db 'PRAGMA integrity_check;'

# 6. Redémarrer
pm2 start calendar360

# 7. Healthcheck
sleep 5 && curl -s http://localhost:3001/api/health
"
```

### 1.c VPS principal totalement inaccessible (perte SSH ou hardware)

Voir §2 (restore from off-site) sur un nouveau VPS.

---

## 2. Restauration complète depuis off-site (cas catastrophe)

### 2.a Préparer un nouveau VPS

Sur le nouveau serveur (ex: `srv1620353.hstgr.cloud` AlmaLinux 9 KVM 8) :

```bash
# Connexion (selon credentials Hostinger)
ssh root@srv1620353.hstgr.cloud

# Installer Node 20 + sqlite3 + nginx + pm2
dnf install -y nodejs sqlite git nginx tar
npm install -g pm2 rclone

# Créer les dossiers cibles
mkdir -p /var/www/planora /var/www/planora-data /var/backups/planora /var/log
```

### 2.b Configurer rclone (GDrive + B2)

```bash
# Récupérer la config depuis l'ancien VPS (si SSH encore possible)
scp -i ~/.ssh/id_ed25519 root@136.144.204.115:/root/.config/rclone/rclone.conf /root/.config/rclone/

# OU configurer manuellement (token GDrive + B2 keyId/key)
rclone config
```

### 2.c Pull les backups depuis B2 (recommandé) ou GDrive

```bash
# Récupérer le dernier code complet
LATEST_CODE=$(rclone ls planora-offsite:planora-backups/code-daily/ | sort -k2 | tail -1 | awk '{print $2}')
rclone copy "planora-offsite:planora-backups/code-daily/$LATEST_CODE" /tmp/

# Récupérer le dernier DB monolithe
LATEST_DB=$(rclone ls planora-offsite:planora-backups/db-6h/ | grep -v '\-ct\.db' | sort -k2 | tail -1 | awk '{print $2}')
rclone copy "planora-offsite:planora-backups/db-6h/$LATEST_DB" /tmp/

# Récupérer le dernier control_tower
LATEST_CT=$(rclone ls planora-offsite:planora-backups/db-6h/ | grep '\-ct\.db' | sort -k2 | tail -1 | awk '{print $2}')
rclone copy "planora-offsite:planora-backups/db-6h/$LATEST_CT" /tmp/
```

**Alternative GDrive** : remplacer `planora-offsite:planora-backups/code-daily/` par `gdrive-backup:daily/`.

### 2.d Restaurer le code

```bash
cd /var/www/planora
tar -xzf /tmp/$LATEST_CODE
cd app && npm install && npm run build
cd ../server && npm install
```

### 2.e Restaurer la DB

```bash
cp /tmp/$LATEST_DB /var/www/planora-data/calendar360.db
cp /tmp/$LATEST_CT /var/www/planora-data/control_tower.db

# Vérifier intégrité
sqlite3 /var/www/planora-data/calendar360.db 'PRAGMA integrity_check;'
sqlite3 /var/www/planora-data/control_tower.db 'PRAGMA integrity_check;'
sqlite3 /var/www/planora-data/calendar360.db 'SELECT COUNT(*) FROM companies;'
```

### 2.f Configurer pm2 + lancer

Le fichier `ecosystem.config.cjs` est inclus dans le backup code. Vérifier les variables :

```bash
cat /var/www/planora/ecosystem.config.cjs
# Vérifier : DB_PATH, CONTROL_TOWER_PATH, TENANTS_DIR, STORAGE_DIR

cd /var/www/planora
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # auto-start au boot
```

### 2.g Configurer nginx + DNS

```bash
# Copier la config nginx (à adapter selon Plesk/cPanel sur le nouveau VPS)
# Tester localement d'abord
curl http://localhost:3001/api/health

# Si OK, basculer le DNS de calendar360.fr vers le nouveau VPS
# (changer A record côté registrar)
```

---

## 3. Test à blanc (validation périodique)

À faire **1x par mois** pour valider que la procédure fonctionne et que les backups sont restaurables.

```bash
# Sur n'importe quel VPS de test (ex: nouveau Hostinger)
# 1. Créer un dossier de test
mkdir -p /tmp/restore-test && cd /tmp/restore-test

# 2. Pull le dernier DB depuis B2
rclone copy "planora-offsite:planora-backups/db-6h/$(rclone ls planora-offsite:planora-backups/db-6h/ | grep -v '\-ct\.db' | sort -k2 | tail -1 | awk '{print $2}')" .

# 3. Vérifier intégrité + comptes
DB=$(ls auto-6h-*.db | grep -v '\-ct\.db' | tail -1)
sqlite3 $DB 'PRAGMA integrity_check;'  # doit retourner "ok"
sqlite3 $DB 'SELECT COUNT(*) FROM companies;' # doit retourner 6 (ou nombre attendu)
sqlite3 $DB 'SELECT COUNT(*) FROM contacts;'  # ~352
sqlite3 $DB 'SELECT COUNT(*) FROM bookings;'  # ~83

# 4. Si OK, supprimer le test
cd /tmp && rm -rf restore-test
```

**À ajouter au calendrier MH** : test à blanc le 1er de chaque mois.

---

## 4. Snapshot manuel rapide (avant release)

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
TS=\$(date +%Y%m%d-%H%M%S)
tar -czf /var/backups/planora/snapshot-manual-\$TS.tar.gz --exclude='node_modules' --exclude='.git' --exclude='dist' -C /var/www/planora .
sqlite3 /var/www/planora-data/calendar360.db \".backup /var/backups/planora/db-snapshot-\$TS.db\"
sqlite3 /var/www/planora-data/control_tower.db \".backup /var/backups/planora/db-snapshot-\$TS-ct.db\"
ls -lh /var/backups/planora/snapshot-manual-\$TS* /var/backups/planora/db-snapshot-\$TS*
"
```

---

## 5. Sécurité

- **Accès SSH** : clé Ed25519 uniquement, pas de mot de passe (`PasswordAuthentication no` dans `/etc/ssh/sshd_config`)
- **Accès rclone GDrive** : token OAuth dans `/root/.config/rclone/rclone.conf` (chmod 600)
- **Accès B2** : keyId + key dans rclone config (idem 600)
- **`.env`** : contient secrets API (Brevo, Twilio, Google) — inclus dans backup CODE
  - **Risque** : un attaquant qui accède à GDrive ou B2 peut lire les secrets
  - **Mitigation court terme** : IAM strict côté GDrive (rc.sitbon@gmail.com only) + B2 application key avec restrictions au bucket
  - **Mitigation long terme** : chiffrer le tar.gz avec GPG symétrique avant push (TODO V1.8.25)

---

## 6. Surveillance — vérifier que les backups tournent bien

### 6.a Health-check rapide

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
# Dernier backup DB OK ?
echo '=== Dernier backup DB ==='
tail -3 /var/www/planora-data/backup.log

# Dernier fichier local (DB)
echo '=== Dernier fichier auto-6h ==='
ls -lt /var/www/planora-data/backups/auto-6h-*.db | head -2

# Dernier code daily
echo '=== Dernier auto-code ==='
ls -lt /var/www/planora-data/backups/auto-code-*.tar.gz 2>/dev/null | head -2

# Cron actif ?
echo '=== Cron actif ==='
crontab -l | grep -i backup

# Espace disque
echo '=== Espace ==='
df -h /var/backups /var/www
"
```

### 6.b Si pas de backup depuis >12h

```bash
# Vérifier le lock (peut-être stuck)
ssh root@136.144.204.115 "ls -la /var/www/planora-data/backup.lock /var/www/planora-data/code-backup.lock"

# Si le lock est ancien, le lever
ssh root@136.144.204.115 "rm /var/www/planora-data/backup.lock"

# Run manuel pour vérifier
ssh root@136.144.204.115 "/var/www/planora-data/backup-cron.sh && tail -5 /var/www/planora-data/backup.log"
```

---

## 7. Contacts d'urgence

- **Mainteneur** : MH (`rc.sitbon@gmail.com`)
- **VPS hébergeur (actuel)** : TransIP (https://www.transip.nl/cp/)
- **VPS de secours** : Hostinger `srv1620353.hstgr.cloud` (KVM 8 AlmaLinux 9 + cPanel)
- **DNS registrar** : (à compléter selon le registrar utilisé pour calendar360.fr)
- **Brevo** (alertes) : configuré dans `.env` `BREVO_API_KEY`

---

## 8. Roadmap fiabilisation

- [x] V1.8.24 : DB toutes 6h + GDrive + B2 + control_tower + alerte Brevo + code daily
- [ ] V1.8.25 (optionnel) : chiffrement GPG des backups CODE avant push externe
- [ ] V1.8.26 (optionnel) : streaming WAL replication (litestream) pour RPO < 1min
- [ ] Standby VPS Hostinger en hot-spare (script de switch DNS auto)
