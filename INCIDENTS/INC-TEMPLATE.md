# INC-YYYYMMDD-NNN — <Titre court de l'incident>

> Template à dupliquer pour chaque incident.
> Source : Audit 13 §6.9 + Audit 14 §6
> Naming : `INC-YYYYMMDD-NNN-<slug>.md` où NNN est 001, 002, ... pour le jour.

## Métadonnées

| Champ | Valeur |
|---|---|
| **Date détection** | YYYY-MM-DD HH:MM UTC |
| **Sévérité** | P0 / P1 / P2 / P3 |
| **Reporter** | MH / Claude / Cron / Client |
| **Resolveur** | MH / Claude / Combinaison |
| **Durée downtime** | XmYs (0 si pas de downtime) |
| **Durée résolution totale** | XmYs (détection → service rétabli) |
| **Impact clients** | Aucun / N clients affectés / Tous |
| **Données perdues** | Aucune / N rows affectées |

## Symptômes

- Ce qui a été observé (avant diagnostic)
- Signal de détection (alerte, ticket, smoke rouge, etc.)
- Premiers logs ou screenshots si applicable

## Détection

- Comment l'incident a été détecté
- Quel signal exact (R9-PROTECT phase1 rouge ? /api/health 500 ? client ?)
- Timestamp précis première détection

## Containment

- Quelles actions de containment ont été prises
- Backup état cassé créé (chemin VPS)
- Logs collectés (chemin)

## Diagnostic

- Hypothèses initiales
- Investigation menée
- Cause racine identifiée

## Rollback / Correction exécutée

- Procédure suivie (référence runbook R-XXX)
- Backup utilisé pour restore (chemin + SHA-256)
- PM2 actions
- DB actions
- Timeline minute par minute

## Cause racine

- Cause technique exacte
- Trigger qui a causé l'incident
- Pourquoi les protections existantes n'ont pas bloqué (si applicable)

## Validation post-restore

- [ ] /api/health 200
- [ ] PM2 status online
- [ ] PID stable
- [ ] DB integrity = ok
- [ ] FK violations = 0
- [ ] Bundle MD5 attendu
- [ ] Smoke V1 vert
- [ ] 5 min observation logs sans erreur

## Actions correctives (post-incident)

- Action court terme
- Action moyen terme
- Action long terme

## Lessons learned

- Ce qui a bien fonctionné
- Ce qui aurait pu mieux fonctionner
- Pattern récurrent ? → ajouter au backlog audit

## Documents associés

- HANDOFF associé : `HANDOFF-YYYY-MM-DD-INC-XXX.md` (si nécessaire)
- Tag rollback utilisé : `<tag>`
- Backup référence : `<path>`

## Notification effectuée

- [ ] MH notifié (si non-self-reporter)
- [ ] Clients notifiés (si downtime > 5 min ou perte données)
- [ ] Documentation interne mise à jour
- [ ] CLAUDE.md mis à jour si nouvelle règle anti-récurrence

## Référence

- [STOP-CONDITIONS.md](../docs/STOP-CONDITIONS.md)
- [RUNBOOKS/R-004-incident-p0.md](../docs/RUNBOOKS/R-004-incident-p0.md)
- Audit 13 §6.9 — Incident log format
