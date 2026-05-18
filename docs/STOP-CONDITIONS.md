# STOP-CONDITIONS — PLANORA

> Conditions de STOP immédiat. Si **une seule** est vraie : **STOP, escalade MH explicite**.
> Source : Audit 13 §9 + Audit 14 §10.2

## STOP runtime (toutes phases)

| Signal | Détection | Action |
|---|---|---|
| **PM2 PID changé inattendu** | `./ops/r9-protect.sh check-pm2` rouge | STOP. Audit logs pm2. R-004 incident. |
| **Bundle MD5 changé inattendu** | `./ops/r9-protect.sh check-bundle` rouge | STOP. Identifier qui a build/deploy. R-009 si nécessaire. |
| **DB SHA-256 changé inattendu** Phase 1 | `./ops/r9-protect.sh check-db` warning | Investigation. Writes runtime légitimes ? Si suspect, R-004. |
| **/api/health non-200** | `curl http://localhost:3001/api/health` | STOP. R-004 incident P0. |
| **PRAGMA integrity_check ≠ ok** | `./ops/r9-protect.sh check-db` rouge | STOP critique. DB corrompue. R-005 restore. |
| **PRAGMA foreign_key_check non-vide** | check-db rouge | STOP. Investigation FK. |
| **PM2 status ≠ online** | `pm2 list` | STOP. R-010 rollback PM2. |
| **PM2 crash loop (restarts incrémente)** | `pm2 describe` | STOP. `pm2 stop` immédiat, lire logs. |
| **Disk free < 10%** | `df -h /var/www/planora-data` | STOP. Cleanup `/var/backups/planora/`. |
| **Memory > 95%** | `free -h` | STOP. Investigation leak. |

## STOP Phase 1 spécifique

| Signal | Cause |
|---|---|
| **Fichier hors `server/shared/*` modifié** sur branche feature/phase1-* | Violation I1. Revert immédiat. |
| **Route `shared/` montée dans `server/index.js`** | Violation I2. Retirer le mount. |
| **Bundle frontend rebuildé sans raison** | Violation I3. Investiguer. |
| **`calendar360.db` SHA change Phase 1** | Investigation : write Phase 1 ou runtime ? |
| **PM2 restart count incrémente Phase 1** | Violation I2 corollaire. Investigation. |
| **Smoke V1/V2/V3 rouge inattendu** | Régression UX détectée. STOP. |
| **R9-PROTECT phase1 rouge** | Un check invariant fail. STOP. |

## STOP Git

| Signal | Cause | Action |
|---|---|---|
| **Commit accidentel sur clean-main** | Pre-commit hook bypassé | Revert commit + investigation hook |
| **Fichier .env/.db/.tar.gz commité par erreur** | Pre-commit hook bypassé | `git reset HEAD~1 --hard` + investigation |
| **Force-push détecté** sur branche partagée | Pre-push hook bypassé | Investigation + revert depuis backup local |
| **Tag immutable supprimé/re-pointé** | Pre-push hook bypassé | Restore tag depuis local |

## STOP backups

| Signal | Cause | Action |
|---|---|---|
| **Backup baseline corrompu** | gunzip fail OU integrity_check fail | Re-trigger backup, identifier cause |
| **SHA-256 mismatch** entre VPS/Mac/iCloud | Corruption pendant transfert | Re-scp, re-cp, vérif |
| **DR drill restore counters incohérents** | Backup invalide | Investigation, try older baseline |
| **Cron backup auto silent fail** | Script absent ou env brisé | Vérifier `/var/log/planora-backup.log` |

## STOP gouvernance

| Signal | Cause |
|---|---|
| **Incident P0/P1 en cours** sur calendar360.fr | Tout en pause, focus incident. |
| **Hotfix legacy en cours** sur clean-main | Pas de Phase 1 jusqu'à hotfix mergé. |
| **Disponibilité MH compromise** > 24 h | Pause Phase 1 jusqu'à retour. |
| **Pre-commit/pre-push hook désactivé** | Investigation pourquoi. Réinstaller. |

## Comment escalader

1. Documenter le signal STOP dans `INCIDENTS/INC-YYYYMMDD-NNN-<slug>.md` (cf. INC-TEMPLATE.md)
2. Notifier MH avec :
   - Quel STOP condition est vraie
   - Quand détectée (timestamp UTC)
   - Quels artifacts capturés
   - Aucune action correctrice prise sans GO MH
3. Attendre instruction explicite MH

## Bypass autorisé

**Aucun bypass STOP autorisé** sans GO MH écrit. Les hooks Git ont des bypass (`ALLOW_*`) pour les cas exceptionnels documentés, mais l'usage doit être traçable.

## Référence

- Audit 13 §9.4 — Checklist incident response
- Audit 14 §10.2 — Conditions STOP immédiates
- AUDIT-PHASE1-EXECUTION-SAFETY-DEPLOYMENT-GOVERNANCE-2026-05-18.md §6
- AUDIT-SAFE-FREEZE-BACKUP-GOVERNANCE-HARDENING-2026-05-18.md §11
