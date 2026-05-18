# R-008 — DR drill (test restore réel)

> **Quand utiliser** : Pré-Sprint 0 (obligatoire) + trimestriel Phase 2+
> **Source** : Audit 14 §13.3 + Audit 14 §2.4
> **Durée** : ~5 minutes
> **Impact runtime** : ZÉRO (restore dans /tmp scratch, pas /var/www/planora-data)

## Objectif

Valider qu'un backup peut être réellement restauré et que la DB est cohérente.
Distinction critique : backup qui passe `gunzip -t` ≠ backup qui charge dans SQLite.

## Préconditions

- Backup baseline existe sur VPS
- /tmp a au moins 100 Mo libre
- Aucune intervention prod en cours

## Procédure

```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 << 'EOF'
set -e

# 1. Identifier backup baseline le plus récent
LATEST=$(ls -t /var/backups/planora/baseline-*-mono.db.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  # Fallback sur backups historiques
  LATEST=$(ls -t /var/backups/planora/phaseE3-baseline-*-mono.db.gz 2>/dev/null | head -1)
fi
echo "Backup utilisé: $LATEST"

# 2. Scratch directory
SCRATCH=/tmp/dr-drill-$(date +%Y%m%d-%H%M%S)
mkdir -p "$SCRATCH"

# 3. Restore vers scratch (pas touche prod)
echo "Restoring to $SCRATCH/restored.db..."
gunzip -c "$LATEST" > "$SCRATCH/restored.db"

# 4. Vérifier integrity
INTEGRITY=$(sqlite3 "$SCRATCH/restored.db" "PRAGMA integrity_check;" | head -1)
echo "Integrity: $INTEGRITY"
[ "$INTEGRITY" = "ok" ] || { echo "FAIL integrity"; rm -rf "$SCRATCH"; exit 1; }

# 5. Vérifier FK
FK_VIOLATIONS=$(sqlite3 "$SCRATCH/restored.db" "PRAGMA foreign_key_check;" | wc -l)
echo "FK violations: $FK_VIOLATIONS"
[ "$FK_VIOLATIONS" -eq 0 ] || { echo "FAIL FK"; rm -rf "$SCRATCH"; exit 1; }

# 6. Compteurs métier — comparaison ratio (pas valeurs absolues)
echo ""
echo "=== Counters in restored backup ==="
sqlite3 "$SCRATCH/restored.db" "SELECT 'companies', COUNT(*) FROM companies;
SELECT 'collaborators', COUNT(*) FROM collaborators;
SELECT 'audit_logs', COUNT(*) FROM audit_logs;"

# 7. Tailles
echo ""
echo "=== DB sizes ==="
ls -lah "$SCRATCH/restored.db"
ls -lah /var/www/planora-data/calendar360.db

# 8. Cleanup
rm -rf "$SCRATCH"
echo ""
echo "=== DR drill : SUCCESS ==="
EOF
```

## Validation

- [ ] Backup gunzip OK
- [ ] integrity_check = ok
- [ ] FK violations = 0
- [ ] Compteurs métier > 0 (DB non vide)
- [ ] Scratch directory cleaned

## Acceptance criteria

| Item | Critère |
|---|---|
| Backup readable | gunzip -t exit 0 |
| Schema valid | PRAGMA integrity_check = "ok" |
| Referential integrity | PRAGMA foreign_key_check empty |
| Business data | Compteurs > 0 sur tables clés |
| Restore atomic | DB ouverte en SQLite sans erreur |

## Si DR drill échoue

| Symptôme | Cause probable | Action |
|---|---|---|
| `gunzip` exit != 0 | Backup corrompu (compression) | Investigate backup creation chain, retake backup |
| `integrity_check ≠ ok` | DB corrompue dans backup | Backup compromis, try older baseline |
| FK violations > 0 | DB write inconsistente capturée | Investigate, peut être backup pré-existant ok à archiver |
| Compteurs == 0 | DB vide | Wrong backup or empty restore |

## Garanties

- **RTO** : ~3 min (sur 18 MB DB)
- **RPO** : N/A (test, pas restauration)
- **Impact runtime** : ZÉRO (scratch /tmp isolé)

## Cadence recommandée

- **Pré-Sprint 0** : 1× obligatoire (validation backup baseline)
- **Phase 2+** : 1× par trimestre
- **Phase 4+** : 1× par mois ou auto-cron

## Référence

- Audit 14 §2.4 — DR drill recommandé pré-Sprint 0
- Audit 14 §13.3 — Runbook H3 original
- Audit 13 §7.4 — Restore validation 3 niveaux
