# PHASE1-BASELINE — PLANORA

> **Fingerprints baseline IMMUTABLES** capturés au démarrage hardening Phase 1.
> Source : Audit 14 §6
>
> ⚠ Ce document doit être **strictement préservé** durant toute Phase 1.
> Toute valeur ci-dessous est référence pour les checks invariants I1-I4.

## Date de capture

**2026-05-18 19:48:28 UTC** (session GO Hardening)

## Git baseline

| Item | Valeur |
|---|---|
| Branche | `clean-main` |
| HEAD | `7ea8a364b35bff3c08c51417c1b52f1d7e33b860` |
| HEAD short | `7ea8a364` |
| Commit | `fix(planora): agenda buffer alignment z-index + cleanup SAFE r11.0.28.b.2` |
| Cycle release | r11.0.28 (sous-deploy .b.2) |

## Frontend bundle baseline

| Item | Valeur |
|---|---|
| Bundle filename | `index-B9BAx_hy.js` |
| Bundle MD5 | `63b8d8e17c07620a3b46d8a141256a4b` |
| Bundle short MD5 | `63b8d8e1` |
| Path live | `/var/www/vhosts/calendar360.fr/httpdocs/assets/index-B9BAx_hy.js` |
| Date deploy | 2026-05-18 (cycle r11.0.28.b.2 SAFE LIVE) |

## PM2 baseline

| Item | Valeur |
|---|---|
| Process name | `calendar360` |
| **PID** | **2318858** |
| Status | online |
| Mode | fork |
| Restart count | 177 |
| Uptime at capture | 21h |
| Memory | 220.9 MB |
| User | root |
| Watching | disabled |
| Version | 1.0.0 |
| Node version | 22.22.2 |

## PM2 env vars (E.3.8-E injection)

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DB_PATH` | `/var/www/planora-data/calendar360.db` |
| `CONTROL_TOWER_PATH` | `/var/www/planora-data/control_tower.db` |
| `TENANTS_DIR` | `/var/www/planora-data/tenants` |
| `STORAGE_DIR` | `/var/www/planora-data/storage` |

## DB baseline

### calendar360.db (monolithe — source de vérité Option A)

| Item | Valeur |
|---|---|
| Path | `/var/www/planora-data/calendar360.db` |
| **SHA-256** | **`02cca29c11cc095b110506ba374dd4dbd5e7ec56e36fe589d2876a1ea55874dc`** |
| Size | 18 284 544 bytes (~18 MB) |
| WAL size | 4 754 512 bytes (~4.7 MB) |
| SHM size | 32 768 bytes |
| Last modified | 2026-05-18 18:55 |
| Integrity | `ok` ✅ |
| FK violations | 0 ✅ |
| Journal mode | WAL |

### control_tower.db (CT — registre 6 companies legacy)

| Item | Valeur |
|---|---|
| Path | `/var/www/planora-data/control_tower.db` |
| **SHA-256** | **`2b44e752fdf7c791609ba0b64f7489e5081b7ad9f5a7bd8cb25605f34598e136`** |
| Size | 110 592 bytes |
| Last modified | 2026-04-20 13:11 |
| Integrity | `ok` ✅ |
| FK violations | 0 ✅ |

## Health baseline

| Endpoint | Valeur |
|---|---|
| `GET /api/health` | HTTP 200 / 2.8ms |
| db status | connected |
| companies | 6 (legacy) |
| collaborators | 16 |

## Server baseline

| Item | Valeur |
|---|---|
| Routes count | 56 fichiers `.js` dans `server/routes/` |
| Routes dir size | 2.8 MB |
| `server/shared/` | **n'existe pas** (attendu Phase 1 pre-Sprint 0) |

## Routes baseline (filenames pour I2 diff)

```
aiAgents.js, aiCopilot.js, analytics.js, analyticsSupra.js, auditLogs.js,
auth.js, backup.js, bookings.js, calendars.js, callContext.js, callForms.js,
chat.js, clientPortal.js, collabSnapshots.js, collaborators.js, companies.js,
consent.js, consentAdmin.js, contactDocuments.js, contactFields.js, contactShare.js,
conversations.js, data.js, faucon.js, forms.js, goals.js, google.js, health.js,
init.js, interMeetings.js, interactionTemplates.js, knowledgeBase.js, leads.js,
manage.js, marketplace.js, messaging.js, notifications.js, notify.js, outlook.js,
pages.js, perfCollab.js, pipelineTemplates.js, public.js, roles.js, secureIa.js,
security.js, settings.js, sms.js, stats.js, tables.js, tasks.js, tenantAdmin.js,
tickets.js, transfer.js, verify.js, voip.js
```

Total : 56 routes.

## Infrastructure baseline

| Item | Valeur |
|---|---|
| VPS IP | 136.144.204.115 |
| OS | Debian 12 |
| Disk free (`/var/www/planora-data`) | 234 GB sur 296 GB (18% used) |
| RAM total | 1.8 Gi |
| RAM used | 933 Mi |
| RAM available | 946 Mi |
| Swap | 8 Gi total, 681 Mi used |
| Plesk | actif |

## Variables baseline à exporter pour R9-PROTECT

```bash
export PHASE1_BASELINE_PID=2318858
export PHASE1_BASELINE_BUNDLE_MD5=63b8d8e17c07620a3b46d8a141256a4b
export PHASE1_BASELINE_BUNDLE_FILENAME=index-B9BAx_hy.js
export PHASE1_BASELINE_DB_SHA=02cca29c11cc095b110506ba374dd4dbd5e7ec56e36fe589d2876a1ea55874dc
```

## Fichier source fingerprints brut

`/Users/design/Desktop/PLANORA/backups/baseline-fingerprints-20260518-214827.txt`

Contient le snapshot complet (248 lignes) : git + PM2 + bundle MD5 (87 bundles dans httpdocs) + DB SHA + DB sizes + integrity + FK check + health + disk + memory + backup dir inventory + planora-* scripts + cron + routes filenames + env vars PM2.

## Tags rollback ancres associés

| Tag | Description | Usage rollback |
|---|---|---|
| `v1.10.4-r11.0.28.b.2-buffer-alignment-fix` | HEAD actuel, baseline Phase 1 | Rollback prod si Phase 1 corrompue |
| `v1.10.4-r11.0.28.c` | Today + now-line Google-style | Rollback cycle agenda UX |
| `v1.10.4-r11.0.27.e-command-center-reminder-fix` | Fin Reminder System | Rollback avant Agenda UX |

## Procédure de vérification baseline

Cf. [RUNBOOKS/R-006-verify-invariants.md](RUNBOOKS/R-006-verify-invariants.md).

```bash
./ops/r9-protect.sh phase1
```

## Règles d'immutabilité

- ❌ **Aucune valeur ci-dessus ne doit changer Phase 1** (sauf DB SHA si writes runtime légitimes — warning only)
- ❌ **Aucune réécriture de ce document Phase 1** (pas d'update post-Sprint 0 sans GO MH)
- ✅ **Update post-clôture Phase 1** : sera ajouté une section "Phase 1 closure" avec nouveaux hashes (Phase 2 baseline)

## Référence

- Audit 14 §6 — Runtime freeze snapshot complet
- Audit 13 §11 — État runtime préservé bout-en-bout
- AUDIT-SAFE-FREEZE-BACKUP-GOVERNANCE-HARDENING-2026-05-18.md
- AUDIT-PHASE1-EXECUTION-SAFETY-DEPLOYMENT-GOVERNANCE-2026-05-18.md §15
