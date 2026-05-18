# R-007 — Baseline backup triple-redondance

> **Quand utiliser** : Sprint 0 J0 + avant chaque sprint Phase 1 + avant action critique
> **Source** : Audit 14 §13.4
> **Durée** : ~10 minutes (compression + scp + iCloud sync)
> **Impact runtime** : ZÉRO (sqlite3 .backup atomique, pas de pm2 stop)

## Préconditions

- SSH fonctionnel vers VPS
- `/usr/local/bin/planora-backup.sh` installé sur VPS (cf. setup hardening)
- Mac MH avec `~/Desktop/PLANORA/backups/` accessible
- iCloud Drive synchronisé localement

## Procédure

### Étape 1 — Trigger backup sur VPS

```bash
# Sur Mac MH
TYPE=baseline  # ou pre-sprint / pre-deploy / manual selon usage
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
  "/usr/local/bin/planora-backup.sh $TYPE"
```

Le script crée :
- `/var/backups/planora/<TYPE>-<TS>-mono.db.gz` (DB monolithe)
- `/var/backups/planora/<TYPE>-<TS>-ct.db.gz` (control_tower)
- `/var/backups/planora/<TYPE>-<TS>-server.tar.gz` (code server, si baseline/pre-sprint/pre-deploy)
- `/var/backups/planora/<TYPE>-<TS>-httpdocs.tar.gz` (frontend, si baseline/pre-deploy)
- `/var/backups/planora/<TYPE>-<TS>-configs.tar.gz` (ecosystem.config.cjs)
- `/var/backups/planora/<TYPE>-<TS>-SHA256.txt` (manifest)

Vérification intégrité automatique : `gunzip -t` + `PRAGMA integrity_check` sur chaque .db.gz.

### Étape 2 — Récupérer le timestamp

```bash
TS=$(ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
  "ls -t /var/backups/planora/${TYPE}-*-mono.db.gz | head -1 | \
   sed 's|.*/'${TYPE}'-||;s|-mono.db.gz||'")
echo "Baseline TS: $TS"
```

### Étape 3 — Copier sur Mac MH

```bash
mkdir -p ~/Desktop/PLANORA/backups
scp -i ~/.ssh/id_ed25519 \
  "root@136.144.204.115:/var/backups/planora/${TYPE}-${TS}-*.gz" \
  "root@136.144.204.115:/var/backups/planora/${TYPE}-${TS}-*.tar.gz" \
  "root@136.144.204.115:/var/backups/planora/${TYPE}-${TS}-SHA256.txt" \
  ~/Desktop/PLANORA/backups/
```

### Étape 4 — Copier sur iCloud Drive

```bash
ICLOUD=~/Library/Mobile\ Documents/com~apple~CloudDocs/PLANORA-backups
mkdir -p "$ICLOUD"
cp ~/Desktop/PLANORA/backups/${TYPE}-${TS}-* "$ICLOUD/"
```

### Étape 5 — Vérification SHA-256 triple

```bash
echo "=== VPS SHA-256 manifest ==="
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 \
  "cat /var/backups/planora/${TYPE}-${TS}-SHA256.txt"

echo ""
echo "=== Mac MH SHA-256 ==="
cd ~/Desktop/PLANORA/backups && shasum -a 256 ${TYPE}-${TS}-*.gz

echo ""
echo "=== iCloud SHA-256 ==="
cd "$ICLOUD" && shasum -a 256 ${TYPE}-${TS}-*.gz
```

**Acceptance** : les 3 listes doivent contenir des hashes SHA-256 identiques pour chaque fichier.

## Validation

- [ ] Backup VPS créé sans erreur (exit 0 du script)
- [ ] gunzip -t passe sur chaque .db.gz
- [ ] integrity_check = "ok" pour chaque DB du backup
- [ ] SHA-256 sur VPS capturé dans manifest
- [ ] Backup copié sur Mac MH
- [ ] SHA-256 Mac matche VPS
- [ ] Backup copié sur iCloud
- [ ] SHA-256 iCloud matche VPS

## Si écart SHA-256

| Cause possible | Action |
|---|---|
| Corruption pendant scp | Re-scp + vérif |
| Corruption pendant cp iCloud | Re-cp + vérif |
| Backup VPS corrompu | Re-trigger backup, gunzip -t |
| Disque plein local | df -h, cleanup |

## Cleanup ancien backup (mensuel manuel)

```bash
# Identifier les anciens backups locaux Mac
find ~/Desktop/PLANORA/backups -name "daily-*.db.gz" -mtime +30
find ~/Desktop/PLANORA/backups -name "pre-sprint-*.db.gz" -mtime +90
# Supprimer manuellement si nécessaire (jamais baselines)
```

## Garanties

- **RTO** : ~10 min
- **RPO** : moment du `sqlite3 .backup` (atomique, WAL-safe)
- **Impact runtime** : ZÉRO (sqlite3 .backup ne lock pas en read concurrent)
- **Redondance** : 3 emplacements physiques (VPS + Mac + iCloud)

## Référence

- Audit 14 §2 — Backup hardening
- Audit 14 §13.4 — Runbook H4 original
- AUDIT-PHASE1-EXECUTION-SAFETY-DEPLOYMENT-GOVERNANCE-2026-05-18.md §7
