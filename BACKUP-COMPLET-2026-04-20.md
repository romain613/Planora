# BACKUP COMPLET SÉCURISÉ — 2026-04-20

> Triple-redondance VPS + Mac + iCloud Drive.
> Statut : **✅ SUCCESS** (3 SHA256 identiques sur les 3 emplacements pour chaque tarball).

---

## 1. Tarball A — DB + Code + Scripts + Bundle prod (VPS-origin)

### Métadonnées

| Item | Valeur |
|---|---|
| Nom du fichier | `planora-full-backup-20260420-040708.tar.gz` |
| Taille | **458 MB** (459M brut) |
| **SHA-256** | `f9e7be8e0bbf83ddd71651660ecba822928b0f2f55e3fc3400e3a96a5ec3b508` |
| Permissions | `chmod 600` (root-only sur VPS, user-only sur Mac/iCloud) |
| Created | 2026-04-20T04:07:08Z |

### Contenu

| Catégorie | Contenu |
|---|---|
| **DBs SQLite** | `calendar360.db` (monolithe post-A+C-1+C-2+C-3+C-4) + `control_tower.db` + `tenants/c1776169036725.db` (CapFinances post-A) + `tenants/c-monbilan.db` (MonBilan post-A+B) + WAL/SHM checkpoints + `backup-manual-AVANT-MIGRATION.db` + `backups/pre-deploy-*.db` |
| **Backend** | `/var/www/planora/server/` (sans `node_modules`) |
| **Frontend** | `/var/www/planora/app/src/` (avec fix C-4) + `package.json` + `vite.config.js` + `index.html` |
| **DB migrations** | `/var/www/planora/db-migrations/` — 6 scripts (Phase A, B, C-1, C-2, C-3, C-4) |
| **Config PM2** | `ecosystem.config.cjs` + `package.json` racine |
| **Bundle prod servi** | `/var/www/vhosts/calendar360.fr/httpdocs/` (avec `index-B03ZyChL.js` post-fix C-4) |

### Exclusions (pour réduire la taille)
`node_modules`, `*.log`, `.git`, `*.bak*`, `.cache`, `dist` (dans app/), `*.pre-*`

### Localisation triple-redondance

| Emplacement | Chemin | SHA256 vérifié |
|---|---|---|
| **VPS** | `/var/backups/planora/full-backup/planora-full-backup-20260420-040708.tar.gz` | ✅ `f9e7be8e…ec3b508` |
| **Mac** | `/Users/design/Desktop/PLANORA/backups/planora-full-backup-20260420-040708.tar.gz` | ✅ `f9e7be8e…ec3b508` |
| **iCloud Drive** | `~/Library/Mobile Documents/com~apple~CloudDocs/PLANORA-backups/planora-full-backup-20260420-040708.tar.gz` | ✅ `f9e7be8e…ec3b508` |

→ **Les 3 SHA256 sont strictement identiques** = les 3 copies sont byte-for-byte.

---

## 2. Tarball B — Docs (rapports + audits + scripts locaux)

### Métadonnées

| Item | Valeur |
|---|---|
| Nom du fichier | `planora-docs-backup-20260420-061033.tar.gz` |
| Taille | **189 KB** |
| **SHA-256** | `2fa3c47b0af8fff56e5fb87bdae03dc422e8fd5ca4758a938f8ed95759583032` |
| Permissions | `chmod 600` |
| Created | 2026-04-20T06:10:33Z |

### Contenu

| Fichier | Description |
|---|---|
| `CLAUDE.md` | Règles projet (règle §0 isolation DB) |
| `HANDOFF-2026-04-19.md` | État refactor + audit DB |
| `AUDIT-DB-2026-04-20.md` | Audit initial monolithe vs tenants |
| `PHASE-A-REPORT-2026-04-20.md` | Propagation schéma → tenants (20 cols + 6 idx + 2 triggers) |
| `PHASE-B-REPORT-2026-04-20.md` | Investigation 30 bookings MonBilan |
| `PHASE-B-EXECUTE-REPORT-2026-04-20.md` | Stratégie E sur MonBilan tenant (18 remaps + 12 marks) |
| `PHASE-C-REPORT-2026-04-20.md` | Investigation dette monolithe complète |
| `PHASE-C1-EXECUTE-REPORT-2026-04-20.md` | Bookings monolithe (20 remaps + 12 marks) |
| `PHASE-C2-EXECUTE-REPORT-2026-04-20.md` | Call_logs monolithe (7 remaps + 41 marks) |
| `PHASE-C3-EXECUTE-REPORT-2026-04-20.md` | Dé-assignation Préau |
| `PHASE-C4-EXECUTE-REPORT-2026-04-20.md` | Fix frontend + DELETE 40 contacts c1 |
| `db-migrations/*.json` | 5 audit JSONs (Phase B, C-1, C-2, C-3, C-4) |
| `db-migrations/*.js` | 6 scripts Node.js idempotents |
| `v7-deploy/` | Scripts deploy + smoke test |

### Localisation double-redondance (Mac + iCloud)

| Emplacement | Chemin | SHA256 vérifié |
|---|---|---|
| **Mac** | `/Users/design/Desktop/PLANORA/backups/planora-docs-backup-20260420-061033.tar.gz` | ✅ `2fa3c47b…9583032` |
| **iCloud Drive** | `~/Library/Mobile Documents/com~apple~CloudDocs/PLANORA-backups/planora-docs-backup-20260420-061033.tar.gz` | ✅ `2fa3c47b…9583032` |

(Pas sur VPS car ces fichiers résident uniquement sur Mac/iCloud par design.)

---

## 3. Sécurisation

| Mesure | Statut |
|---|---|
| `chmod 600` sur tarballs et SHA256 (root-only / user-only) | ✅ |
| WAL `PRAGMA wal_checkpoint(TRUNCATE)` avant tar (DB consistent) | ✅ |
| SHA-256 calculé à 3 endroits (VPS, Mac, iCloud) pour tarball A | ✅ identiques |
| SHA-256 calculé à 2 endroits (Mac, iCloud) pour tarball B | ✅ identiques |
| Aucune coupure prod (pas de `pm2 stop`) | ✅ |
| Backups antérieurs préservés (Phase A, B, C-1, C-2, C-3, C-4 individuels) | ✅ |

---

## 4. État DB capturé dans ce backup (pour rappel)

### Bilan global (post Phase C-4)

| Métrique | Valeur |
|---|---|
| Bookings orphans (monolithe) | **0** ✅ |
| Call_logs orphans (monolithe) | **0** ✅ |
| Contacts→collab orphans | 1 (efef gardé volontairement) |
| Contacts `companyId='c1'` polluants | **0** ✅ |
| Doublons emails groupes | 3 (cross-company légitimes MH) |
| Doublons phones groupes | 3 (cross-company légitimes MH) |
| Schéma monolithe ↔ tenants | **100% aligné** (Phase A) |
| `integrity_check` (3 DBs) | **ok / ok / ok** |
| Bug frontend `useState(COMPANIES[0])` | **corrigé** (deploy `d-20260420-040149`) |
| Prod HTTPS | **200** |
| pm2 calendar360 | **online** |
| Bundle servi | `index-B03ZyChL.js` (post-fix C-4) |

### Comptes de table

| Table | Count |
|---|---|
| companies | 6 (c1 Calendar360 intacte) |
| collaborators | 12 |
| contacts | **248** (vs 287 initial : +1 placeholder `__deleted__`, −40 fixtures c1) |
| bookings | 48 |
| call_logs | 227 |
| audit_logs | 1494 |

---

## 5. Procédure de restore (si nécessaire)

### Option A — Restore complet DB + Code (depuis tarball A)

```bash
# 1. Stop prod
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "pm2 stop calendar360"

# 2. Restore depuis tarball
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
  cd / && tar xzf /var/backups/planora/full-backup/planora-full-backup-20260420-040708.tar.gz
  sqlite3 /var/www/planora-data/calendar360.db 'PRAGMA integrity_check;'
  sqlite3 /var/www/planora-data/tenants/c1776169036725.db 'PRAGMA integrity_check;'
  sqlite3 /var/www/planora-data/tenants/c-monbilan.db 'PRAGMA integrity_check;'
"

# 3. Restart prod
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "pm2 restart calendar360"

# 4. Smoke test
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
  curl -s -o /dev/null -w 'HTTPS: %{http_code}\n' https://calendar360.fr/
"
```

### Option B — Restore depuis Mac/iCloud (si VPS inaccessible)

```bash
# Depuis Mac
scp -i ~/.ssh/id_ed25519 \
  /Users/design/Desktop/PLANORA/backups/planora-full-backup-20260420-040708.tar.gz \
  root@136.144.204.115:/tmp/

# Puis SSH et restore (idem Option A)
```

### Option C — Restore depuis iCloud sur un autre Mac

```bash
# Sur un autre Mac avec iCloud Drive
cp "$HOME/Library/Mobile Documents/com~apple~CloudDocs/PLANORA-backups/planora-full-backup-20260420-040708.tar.gz" .
shasum -a 256 planora-full-backup-20260420-040708.tar.gz
# Vérifier que le SHA = f9e7be8e0bbf83ddd71651660ecba822928b0f2f55e3fc3400e3a96a5ec3b508
```

---

## 6. Vérification d'intégrité (à reproduire à tout moment)

```bash
# Sur VPS
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
  "cd /var/backups/planora/full-backup && sha256sum -c planora-full-backup-20260420-040708.tar.gz.sha256"

# Sur Mac
cd /Users/design/Desktop/PLANORA/backups && \
  shasum -a 256 -c planora-full-backup-20260420-040708.tar.gz.sha256

# Sur iCloud
cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/PLANORA-backups" && \
  shasum -a 256 -c planora-full-backup-20260420-040708.tar.gz.sha256
```

→ Toutes les 3 commandes doivent retourner `OK`.

---

## 7. Récap des SHA256

| Tarball | SHA-256 |
|---|---|
| **A — Full backup** (DB + Code + Bundle) | `f9e7be8e0bbf83ddd71651660ecba822928b0f2f55e3fc3400e3a96a5ec3b508` |
| **B — Docs backup** (rapports + audits + scripts) | `2fa3c47b0af8fff56e5fb87bdae03dc422e8fd5ca4758a938f8ed95759583032` |

Sauvegarde complète sécurisée terminée. Triple-redondance pour le critique (DB+code), double-redondance pour les docs (Mac+iCloud).
