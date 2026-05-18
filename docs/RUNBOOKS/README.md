# PLANORA — RUNBOOKS

> Runbooks opérateur-grade pour Phase 1 PLANORA (Audit 12-13-14).
> Tous READ-ONLY ou READ-WRITE contrôlé, jamais d'improvisation runtime live.

## Index

| ID | Titre | Source | Quand utiliser |
|---|---|---|---|
| R-001 | [Démarrer Sprint 0](R-001-sprint-0-startup.md) | Audit 13 §13.1 | GO Sprint 0 J0 |
| R-002 | [Self-check fin de sprint](R-002-self-check-checkpoint.md) | Audit 13 §13.2 | Avant chaque CHECKPOINT |
| R-003 | [Rollback complet Phase 1](R-003-rollback-phase1.md) | Audit 13 §13.3 | Abandon Phase 1 |
| R-004 | [Incident response P0](R-004-incident-p0.md) | Audit 13 §13.4 | Crash prod inattendu |
| R-005 | [Restore DB depuis backup](R-005-restore-db.md) | Audit 13 §13.5 | DB corrompue / erreur humaine |
| R-006 | [Vérification invariants I1-I4](R-006-verify-invariants.md) | Audit 13 §13.6 | Tout CHECKPOINT |
| R-007 | [Baseline backup triple-redondance](R-007-backup-baseline.md) | Audit 14 §13.4 | Sprint 0 + pré-sprint |
| R-008 | [DR drill](R-008-dr-drill.md) | Audit 14 §13.3 | Pré-Sprint 0 + trimestriel |
| R-009 | [Rollback bundle frontend](R-009-rollback-bundle.md) | Audit 14 §3.2 | Bug front prod |
| R-010 | [Rollback PM2 config](R-010-rollback-pm2.md) | Audit 14 §3.3 | Bug ecosystem ou crash loop |

## Convention runbook

Chaque runbook suit la structure :

1. **Quand l'utiliser** — déclencheurs explicites
2. **Préconditions** — état requis avant exécution
3. **Procédure** — commandes shell prêtes copier-coller
4. **Validation** — comment vérifier le succès
5. **Rollback du runbook** — si la procédure elle-même échoue
6. **Garanties** — RTO / RPO / impact

## Règles d'exécution

- ✅ Toujours lire le runbook complet AVANT exécution
- ✅ Toujours backupé avant action critique (cf. R-007)
- ✅ Toujours vérifier les invariants I1-I4 post-action (cf. R-006)
- ❌ Aucune improvisation hors runbook sans GO MH explicite
- ❌ Aucun raccourci destructif (rm -rf, force-push, pm2 kill)

## Référence croisée

- [CLAUDE.md](../../CLAUDE.md) §0 / §10 — règles fondamentales
- [AUDIT-PHASE1-INVISIBLE-FOUNDATION-IMPLEMENTATION-PLAN-2026-05-18.md](../../AUDIT-PHASE1-INVISIBLE-FOUNDATION-IMPLEMENTATION-PLAN-2026-05-18.md) — Audit 12 PLAN
- [AUDIT-PHASE1-EXECUTION-SAFETY-DEPLOYMENT-GOVERNANCE-2026-05-18.md](../../AUDIT-PHASE1-EXECUTION-SAFETY-DEPLOYMENT-GOVERNANCE-2026-05-18.md) — Audit 13 GOUVERNANCE
- [AUDIT-SAFE-FREEZE-BACKUP-GOVERNANCE-HARDENING-2026-05-18.md](../../AUDIT-SAFE-FREEZE-BACKUP-GOVERNANCE-HARDENING-2026-05-18.md) — Audit 14 HARDENING
- [docs/STOP-CONDITIONS.md](../STOP-CONDITIONS.md) — conditions STOP immédiat
- [docs/GO-CONDITIONS.md](../GO-CONDITIONS.md) — conditions GO CHECKPOINT
- [docs/PHASE1-BASELINE.md](../PHASE1-BASELINE.md) — fingerprints baseline immuables
