# HANDOFF Phase 0ter — Lot 1 — Rapatriement repo↔VPS critique V1.12

> **Date** : 2026-04-30
> **Tag** : `phase-0ter-lot1-done`
> **Commit** : `ad2cbfd6`
> **Statut** : ✅ poussé prod (GitHub) — VPS prod **non modifié** (pure synchro)
> **Prochaine étape** : Lot 2 (services AI/voice/lead) sur GO MH

---

## 1. Résumé exécutif

Lot 1 de la Phase 0ter clôturé : **37 fichiers backend critiques rapatriés** depuis VPS prod vers le repo Git local, sans aucune modification fonctionnelle. Le repo enregistre désormais en versionné les patches V1.11.4 (`bookings.js`) et V1.11.5 (`data.js`) qui étaient appliqués à la prod mais hors-repo.

**Pure synchronisation prod↔repo. Zéro impact runtime.**

---

## 2. Workflow strict 9 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | Pré-déploiement (git status, healthcheck, backup global) | ✅ |
| 2 | Déploiement test (N/A — pas de SCP vers VPS) | ⏭ skip |
| 3 | Tests post-deploy (md5 + node --check + audit PII) | ✅ 37/37 |
| 4 | Fix si KO | N/A (rien à fixer) |
| 5 | Commit + push + tag | ✅ |
| 6 | Merge / stabilisation | ✅ déjà sur clean-main |
| 7 | Sauvegarde finale | ✅ |
| 8 | Sécurisation (PII, secrets, alignement) | ✅ |
| 9 | Documentation (ce HANDOFF + memory) | ✅ |

⚠️ **Étape 2-3 adapted** : Lot 1 est une synchro repo only — pas de SCP vers VPS, pas de PM2 restart, pas de build frontend. Les fichiers existaient déjà sur VPS bit-à-bit identiques.

---

## 3. Périmètre Lot 1 — 37 fichiers

### Middleware (3)
```
middleware/auth.js               md5 8ce0fffaaeb4188a6b9dbea8d3a813d9
middleware/permissions.js        md5 6ad6e1372fe19e8ff5983d5e7b2ca443
middleware/resolveContext.js     md5 8e7c014a808e5f1d772710bf4c04d368
```

### Routes auth/sécurité (4)
```
routes/auth.js                   md5 85074b00fb1c9f7d3edbf7783c528da5
routes/security.js               md5 88e547c84425342d0613d61aea77e0c6
routes/verify.js                 md5 584a37b16bcd7b9abac0db36c5fe9848
routes/backup.js                 md5 128eb9984a360ee37dbd6592ea1c4668
```

### Routes business critiques V1.12 (30)
```
routes/data.js                   md5 e150bf2327c7c6f9af37581299c1f247  (V1.11.5 patché live)
routes/bookings.js               md5 dae6e3ac3744b404d7c5426c7f60d284  (V1.11.4 patché live)
routes/voip.js                   md5 e7556db46a9433318dbecb17eaabd731  (V1.11.4 audit)
routes/transfer.js               md5 8e3fbb5b2a3b50da203f68276cad7f90
routes/calendars.js              md5 5638ef09d1079e8203ca6c4def0b819c
routes/manage.js                 md5 e06b6ea547e2b0b16a514f1fbd44c115
routes/marketplace.js            md5 3ed78098a8c52a7650741b431a6850e5
routes/notifications.js          md5 8215ef1d09fd2a7ee2c736543084adca
routes/messaging.js              md5 0768cf645fb94981e2952d9243f18ff2
routes/notify.js                 md5 a3ef7a209bdf5b7237cfa9cde223945d
routes/tickets.js                md5 1e4c35d227df89063bf70e2f16f63f44
routes/tasks.js                  md5 d786c24c275e5c26087aaebaf9cf7ed0
routes/companies.js              md5 be0e922e04eefa3abdc4a3157d790491
routes/collaborators.js          md5 bb9f87a5317ffac58fc9a67877e57316
routes/contactDocuments.js       md5 c75f833910041ec243d6f88242e07535
routes/contactFields.js          md5 b71eb40c5e09cd3d9fc213d1b9954306
routes/aiAgents.js               md5 e1541998b3200b5958788773624d773c
routes/aiCopilot.js              md5 9b29dc905f83244baf8375a816d5a01d
routes/auditLogs.js              md5 3553028d2f4a125770ad7f4378d6389f
routes/callForms.js              md5 5422c68be09d306215809fa24b050aa5
routes/callContext.js            md5 d5b0226377ddbf1c758549b77abb6621
routes/chat.js                   md5 44f9f62800eeb90fdaa68dee6cf20814
routes/clientPortal.js           md5 4627923e865db962752cd1e8b27c4137
routes/health.js                 md5 f4069094f4d81373a7d8e5b6487cb095
routes/interMeetings.js          md5 f62a4cc27c0c326b7b60f8cd6b24b15d
routes/perfCollab.js             md5 7452a8dbd1c8612ba46ba3a47d1909ce
routes/secureIa.js               md5 5c273af749fd7537dbb91b2f0fe8a6e2
routes/tables.js                 md5 236314dfc6e87d62d9a68246963ce041
routes/forms.js                  md5 87f93229bd3fa9a370587422bdc96016
routes/goals.js                  md5 3b8d740c46980befed575efc31ae388a
```

**Stats** : 14 232 lignes insérées, 752 Ko, plus gros = `voip.js` (1621 lignes).

---

## 4. Backups disponibles

| Étape | Fichier | md5 | Taille |
|---|---|---|---|
| **Pre-Phase-0ter (global)** | `/var/backups/planora/phase0ter-pre/server-prephase0ter-20260430-141427.tar.gz` | `9fe8d06ee3420c89b13603c9ad45ad03` | 530 Ko |
| **Post-Lot 1** | `/var/backups/planora/phase0ter-lot1-post/server-postlot1-20260430-145659.tar.gz` | `c49c0813a4077b8139944714d70c0bb6` | 235 Ko |

### Procédure rollback (si nécessaire)

```bash
# Rollback repo local + push (annule le commit Lot 1)
git reset --hard d8d4db95  # revient à V1.11.5
git push origin clean-main --force-with-lease  # ⚠ destructif

# VPS prod inchangé — pas besoin de rollback côté VPS
```

⚠ Force-push à utiliser uniquement avec validation MH explicite. Risque coordination clones.

---

## 5. Audit PII — résultat clean

| Section | Résultat | Détail |
|---|:---:|---|
| API keys / secrets hardcodés dans commit | ✅ aucun | grep clean |
| Twilio SIDs (AC../SK../MG..) | ✅ aucun | clean |
| Stripe live keys (sk_live/pk_live) | ✅ aucun | clean |
| `.env` tracked | ✅ seul `.env.example` (template) | OK |
| Phone numbers dans code | ⚠ 1 occurrence docstring | `voip.js` exemple `+33612345678` (fictif) |
| Personal emails | ⚠ 1 occurrence | `backup.js` mention `rc.sitbon@gmail.com` (déjà publique CLAUDE.md) |
| IPs internes (136.144./192.168./10./172.16.) | ✅ aucune | clean |
| Permissions SSH key | ✅ `-rw-------` (600) | OK |

**Verdict** : 🟢 **clean Lot 1**. Les 2 findings sont des docstrings/commentaires acceptables et **pré-existants** sur VPS depuis longtemps.

---

## 6. ⚠️ Anomalie pré-existante héritée (HORS scope Lot 1)

Détectée pendant security check :

```
git ls-files server/ | grep -E '\.db'
  server/calendar360.db
  server/calendar360.db-shm
  server/calendar360.db-wal
  server/db/calendar360.db
  server/db/planora.db
```

**5 fichiers DB SQLite trackés dans le repo public** `romain613/Planora` malgré le `.gitignore` qui contient `*.db`. Le `.gitignore` n'agit que sur les nouveaux fichiers — les fichiers déjà tracked persistent.

→ **Anomalie historique connue** documentée dans :
- `CLAUDE.md` §1bis du MEMORY → "ALERTE PII repo public"
- [AUDIT-DB-FANTOM-PLAN-2026-04-29.md §1bis](AUDIT-DB-FANTOM-PLAN-2026-04-29.md) → 3 options (A/B/C)

**PAS introduit par Lot 1.** À traiter séparément (décision MH en attente : `git filter-repo` / nouveau repo / accepter risque).

---

## 7. Alignement repo↔VPS — sample 5 fichiers

| Fichier | Local md5 | VPS md5 | État |
|---|---|---|:---:|
| middleware/auth.js | 8ce0fffa... | 8ce0fffa... | ALIGN |
| routes/data.js | e150bf23... | e150bf23... | ALIGN |
| routes/bookings.js | dae6e3ac... | dae6e3ac... | ALIGN |
| routes/voip.js | e7556db4... | e7556db4... | ALIGN |
| routes/transfer.js | 8e3fbb5b... | 8e3fbb5b... | ALIGN |

✅ **5/5 ALIGN** sur le sample. Audit complet 37/37 lors du SCP initial.

---

## 8. État runtime VPS (avant et après)

### Healthcheck pre-Lot 1 (référence)

```
{"status":"ok","db":"connected","companies":6,"collaborateurs":16,
 "dbPath":"/var/www/planora-data/calendar360.db","uptime":5121}
PM2 PID 882026, online, 85min uptime, 201 Mo
DB integrity_check : ok
```

### Healthcheck post-Lot 1

**Inchangé** — Lot 1 = synchro repo uniquement. **Aucun deploy VPS**, **aucun PM2 restart**. La prod n'a pas bougé.

---

## 9. État Git final

```
ad2cbfd6 (HEAD -> clean-main, origin/clean-main, tag: phase-0ter-lot1-done)
         chore(server): Phase 0ter Lot 1 — rapatrier middleware + 34 routes critiques V1.12

d8d4db95 V1.11.5 — Fix duplicate-check ignorait pipeline_stage='perdu'
9cb3f50c docs(handoff): V1.11.4 reporting RDV fix handoff complet (13 sections)
532d45dd V1.11.4 — Fix bug logique Reporting RDV "Reçus" en mode admin/supra
f7d3a798 chore(server): rapatrier package.json depuis VPS (alignement prod)
6f66029c chore(google): rapatrier services Google manquants du VPS dans le repo
```

Branche : `clean-main`
HEAD : `ad2cbfd6`
origin/clean-main : aligned
Tag local + distant : `phase-0ter-lot1-done` ✅

---

## 10. Reste de la Phase 0ter

### Lot 2 — Services AI / Voice / Lead (11 fichiers)

```
services/aiAgent.js
services/aiCopilot.js
services/liveAnalysis.js
services/liveTranscription.js
services/secureIaPhone.js
services/transcriptArchive.js
services/twilioVoip.js                  ← V1.11.4 audit lié
services/twilioSms.js
services/nextBestAction.js
services/leadImportEngine.js
services/leadScoring.js
```

### Lot 3 — Crons + Brevo + DB tenant (19 fichiers)

```
cron/* (9 fichiers)
services/brevoEmail.js, brevoSms.js, brevoWhatsapp.js (3)
db/controlTower.js, controlTowerSchema.js, tenantDbCache.js, tenantResolver.js, tenantSchema.js (5)
services/shadowCompare.js, tenantMigration.js (2)
```

### Lot 4 — Routes auxiliaires + admin (12 fichiers)

```
routes/analytics.js, analyticsSupra.js
routes/faucon.js, knowledgeBase.js
routes/tenantAdmin.js, roles.js, settings.js
routes/pages.js, public.js
routes/init.js (à vérifier divergence)
```

### Lot 5 — Cleanup `_vps-pull/` (3 fichiers)

**Différé par MH** — pas critique, à traiter après V1.12 stabilisée.

---

## 11. État global Phase 0ter

| Lot | Statut | Fichiers | Tag |
|---|:---:|---:|---|
| **Lot 1** | ✅ DONE | 37 | `phase-0ter-lot1-done` |
| Lot 2 | ⏸ pending | 11 | `phase-0ter-lot2-done` (à venir) |
| Lot 3 | ⏸ pending | 19 | `phase-0ter-lot3-done` (à venir) |
| Lot 4 | ⏸ pending | 12 | `phase-0ter-lot4-done` (à venir) |
| Lot 5 | ⏸ différé MH | 3 | `phase-0ter-lot5-done` (différé) |
| **Total** | **20% (1/5 lots)** | 82 (37 fait / 45 reste) | — |

Sur GO MH, Lot 2 (~30 min) puis Lot 3 (~30 min) puis Lot 4 (~30 min). Estimation reste ~2h.

---

## 12. Recommandations next step

1. **Lot 2 next** — sur GO MH, démarrer le rapatriement des services AI/voice/lead (11 fichiers, 30 min)
2. **Anomalie DB tracked** — décider Option A/B/C ([AUDIT-DB-FANTOM-PLAN-2026-04-29.md](AUDIT-DB-FANTOM-PLAN-2026-04-29.md)) avant ou après Phase 0ter
3. **V1.12** — démarrer **après Phase 0ter complète** (Lots 2-4 terminés)
4. **V1.11.4 tests fonctionnels Thomas↔Julie** — toujours en attente côté MH
5. **Outlook Calendar V1** — bloqué credentials Azure AD

---

## 13. Reprise nouvelle session

1. Lire MEMORY.md (auto-loaded)
2. Lire ce HANDOFF en priorité
3. État runtime stable, Lot 1 push validé GitHub + tag
4. Repo enrichi de 37 fichiers backend critiques V1.12
5. Sur GO MH : démarrer Lot 2 (mêmes étapes : SCP /tmp + md5 + PII audit + node --check + diff + GO + commit + push + tag + backup + handoff)

---

**Phase 0ter Lot 1 clôturé. Repo Git local enfin enrichi de 37 fichiers backend prod critiques. Pure synchro, 0 régression. Diff montrée à MH avant push, GO explicite reçu.**
