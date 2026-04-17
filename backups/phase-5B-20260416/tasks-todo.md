# TODO — Calendar360

## 🛠 2026-04-16 v2 — Multi-tenant STEP 4 durci (stubs + remap orphans, EN COURS, non branche prod)

### STEP 4 v1 (done 2026-04-16 matin, valide Mac user : 11/11 + 21/21)
- [x] Scan exhaustif `server/db/database.js` : 93 tables, 46 FK declarees, 127 FK implicites identifiees
- [x] Classification des 6 tables sans companyId hors GLOBAL : availabilities / bookings / google_events / role_permissions / ticket_messages (1-hop) + reminder_logs (2-hop)
- [x] Reclassement `wa_verifications` en GLOBAL (OTP WhatsApp, cross-tenant par numero)
- [x] `INDIRECT_TENANT_TABLES` (Map) + `IMPLICIT_FKS` (42 entries) dans `server/db/tenantSchema.js`
- [x] `buildParentIdsSubquery` recursif (2-hop reminder_logs -> bookings -> calendars) dans tenantMigration.js
- [x] copyTenantData 3 modes (direct / indirect / skipped), diffCounts applique la logique aux indirectes
- [x] `validateOrphanFks` pour FK implicites (PRAGMA ne les voit pas)
- [x] CLI enrichi + test dedie (0 fuite cross-tenant + 2-hop + orphelin injecte)

### STEP 4 v2 (2026-04-16 apres-midi — stubs + remap, suite au dry-run reel)
Dry-run sur snapshot VPS a revele : (a) FK violations massives sur `companies` (table GLOBAL mais referencee par FK declaree depuis collaborators, calendars, contacts...), (b) centaines de contacts orphelins dans call_logs / pipeline_history / notifications / sms_messages / conversations.
- [x] Decision user : stub `companies` (structure + 1 ligne par tenant) + placeholder `__deleted__` dans contacts (conserver historique, pas de DELETE)
- [x] `server/db/tenantSchema.js` : +`TENANT_STUB_TABLES = new Set(['companies'])`, listTenantTables/listTenantIndexes incluent stubs, computeMigrationOrder traite stubs comme parents ordonnables (companies avant collaborators)
- [x] `server/services/tenantMigration.js` : +`seedTenantStubs` (1 ligne companies WHERE id=companyId), +`remapOrphansForParent` generique (detecte orphans via IMPLICIT_FKS + insere placeholder + UPDATE refs, idempotent), +`insertPlaceholderRow` (auto-fill NOT NULL sans defaut : 0/''/Buffer.alloc(0) selon type), reorder migrateCompany (schema -> FK OFF -> stubs -> copy -> remap -> FK ON -> checks -> diff), diffCounts soustrait placeholder pour conserver parite
- [x] `server/scripts/migratePilotTenant.js` : affiche `stubs seeded` + `remap orphans: parent -> placeholder 'id'  N refs` avec breakdown par table enfant
- [x] `server/db/test/testTenantMigration.mjs` : +table `pipeline_history` + 3 rows (1 valide + 2 orphelins), +TEST 8 (stub companies + 1 ligne + id=C1 + pas de fuite C2), +TEST 9 (placeholder __deleted__ + refs remappees + 0 orphan post-remap), +TEST 10 (remapOrphansForParent idempotent)
- [x] Syntax check `node --check` OK sur tenantSchema.js, tenantMigration.js, migratePilotTenant.js, testTenantMigration.mjs
- [x] User : `node server/db/test/testTenantMigration.mjs` sur Mac → 30+ pass OK
- [x] User : dry-run MON BILAN → remonte 1 dernier orphan (collab_heartbeat.collaboratorId -> collaborators), valide manuellement

### STEP 4 v3 (2026-04-16 soir — extension remap a collaborators)
- [x] Decision user : generaliser le pattern remap a `collaborators` avec placeholder `__deleted_collab__`
- [x] `server/services/tenantMigration.js` : +constante `REMAP_PARENTS` en tete de fichier (liste extensible), flow remap itere sur cette liste
- [x] `server/db/test/testTenantMigration.mjs` : +table `collab_heartbeat` + 2 rows (1 valide + 1 orphan), +TEST 11 (placeholder __deleted_collab__ + remap collab_heartbeat + report.remap.collaborators assertions), TEST 12 = control tower unchanged
- [x] Syntax check `node --check` OK sur les 4 fichiers
- [x] Docs mises a jour : SOURCE_OF_TRUTH §1 (tableau REMAP_PARENTS), CONTEXT.md (checkpoint v3)
- [x] User : dry-runs CAPFINANCES + MON BILAN → `ok=true`, remap.collaborators.placeholderInserted=true pour MON BILAN

### STEP 4 v4 (2026-04-16 nuit — commit flow hardening + visible errors)
Probleme : `--commit` a renvoye `ok: false`, `size: NaN KB`, `elapsed: undefined ms` sans aucun detail d'erreur exploitable. Cause racine : early return de la forme `{ ok: false, error: '...' }` sans `sizeBytes`/`elapsedMs`/`stack`, et le CLI n'imprimait ni `report.error` ni `report.stack`. De plus, un dry-run precedent laisse une tenant DB sur disque qui faisait echouer tout commit ulterieur en silence.
- [x] `server/services/tenantMigration.js` : +helper `buildErrorReport()` garantit la forme complete du report (ok/dryRun/companyId/companyName/companySlug/tenantDbPath/sizeBytes=0/elapsedMs/currentStep/error/stack + sections nullables schema/stubs/copy/remap/fk/orphans/diff/mismatches)
- [x] `tenantMigration.js` : +tracker `currentStep` traverse 14 phases (sanity, resolve_tenant_path, preexisting_artifact_check, open_tenant_db, schema_init, seed_stubs, copy_data, remap_orphans, fk_check, validate_orphan_fks, diff_counts, close_tenant_db, migration_done, commit_control_tower)
- [x] `tenantMigration.js` : pre-existing artifact check intelligent — si companyId deja present dans `tenant_databases` ET `!dryRun` → refus `TENANT_ALREADY_COMMITTED` (hint + commande rollback). Sinon (leftover de dry-run ou commit echouee sans CT entry) → cleanup auto des fichiers `.db`/`-wal`/`-shm` et on continue. Debloque le flow dry-run → commit.
- [x] `tenantMigration.js` : commit write (INSERT tenant_databases + INSERT tenant_status_history) isole dans son propre try/catch. Si ca throw, `report.ok=false`, `report.error=COMMIT_WRITE_FAILED[step]`, `report.commit={attempted:true,ok:false,error}`, tenant DB preservee pour diagnostic.
- [x] `tenantMigration.js` : INSERT `tenant_databases` inclut desormais `lastMigrationAt=datetime('now')` (colonne existait deja dans le schema, on ne l'ecrivait juste pas).
- [x] `tenantMigration.js` : catch global autour de la phase migration ferme tenant DB + unlink fichiers + retourne buildErrorReport complet (evite tenant DB orpheline en cas de crash mid-flow).
- [x] `server/scripts/migratePilotTenant.js` : safe-guard formatting `((report.sizeBytes || 0) / 1024).toFixed(1)` + `report.elapsedMs ?? 'n/a'` → plus jamais de `NaN KB` ou `undefined ms`.
- [x] `migratePilotTenant.js` : bloc `ERROR` proeminent quand `!report.ok` → code, failed-at step, stack trace complete, hint specifique pour `TENANT_ALREADY_COMMITTED` / `COMPANY_NOT_FOUND` / `TENANT_DIR_NOT_WRITABLE`.
- [x] `migratePilotTenant.js` : bloc `commit phase` affiche `report.commit.attempted`/`ok`/`storagePath`/`error` quand present.
- [x] `migratePilotTenant.js` : exit code 3 pour `TENANT_ALREADY_COMMITTED` (actionnable), 1 pour tout autre echec, 0 si ok.
- [x] `migratePilotTenant.js` : handler `main().catch()` imprime message + stack complete (remplace le `console.error('[FATAL]', e)` qui tronquait).
- [x] Syntax check `node --check` OK sur tenantMigration.js, migratePilotTenant.js, tenantSchema.js, controlTowerSchema.js
- [x] User : `--commit MON BILAN` → **ok=true**, 0 FK declared, 0 FK implicit, **609 contacts remappes + 1 collaborator remappe**, integrity ok
- [x] User : `--commit CAPFINANCES` → **ok=true**, 0 FK declared, 0 FK implicit, remap none needed, integrity ok
- [x] Control tower : 2 lignes `tenant_databases` inscrites. `tenantMode` reste `legacy` sur les 2 companies (pas de cutover). Prod inchangee.

### STEP 4 — STATUS FINAL : DONE
Architecture multi-tenant posee. DBs tenant isolees. Migration reproductible. Rollback disponible (`--rollback` par company). Aucun route refactoree = aucun impact prod. Le monolithe reste source de verite active.

---

## 🎯 2026-04-16 STEP 5 — Cutover progressif (PLAN a valider avant implementation)

### Situation
- 2 tenants committes : MON BILAN (tenantMode=legacy) + CAPFINANCES (tenantMode=legacy)
- 91+ autres companies encore en legacy pur (pas de tenant DB)
- Toutes les routes lisent encore la monolithe via `db` (singleton better-sqlite3 dans `server/db/database.js`)
- `control_tower.db` : operationnelle, contient 2 entrees `tenant_databases` + historique dans `tenant_status_history`

### Principes non-negociables (deja valides user)
- PAS de bascule big-bang : route par route, company par company
- PAS de touche aux routes toutes d'un coup : commencer par les LECTURES, et sur 1-2 features seulement
- PAS de suppression de la monolithe tant que shadow mode n'a pas tourne 2 semaines sans divergence
- Rollback instantane < 5 min : un UPDATE `tenantMode='legacy'` doit suffire a remettre la route sur la monolithe
- Un test de regression end-to-end par feature cutover (CRM, pipeline, bookings, calls, SMS) AVANT passage en mode tenant

### Lifecycle propose `companies.tenantMode`
```
legacy   → shadow   → tenant   → (eventual) mono_removed
 |          |          |
 |          |          └─ lecture+ecriture sur tenant DB. Monolithe n'est plus lue mais on y ecrit encore (double-write) en filet.
 |          └─ lecture sur tenant DB ET sur monolithe, on compare, on log les diffs. Reponse renvoyee = monolithe (source de verite).
 └─ toute lecture et ecriture sur la monolithe (comportement actuel).
```

### Phase 5A — Fondations (ecrire sans bug avant de brancher) — DONE
- [x] 5A.1 : `server/db/controlTowerSchema.js` — `ALTER TABLE companies ADD COLUMN tenantFeatures TEXT DEFAULT '{}'` (idempotent via try/catch "duplicate column") + `CREATE TABLE tenant_shadow_diffs` (id, companyId, route, feature, timestamp, monolithHash, tenantHash, monolithRowCount, tenantRowCount, payloadSample, tenantError) + index `idx_shadow_diffs_lookup (companyId, feature, timestamp DESC)`
- [x] 5A.2 : `server/db/tenantResolver.js` — `resolveTenant()` renvoie maintenant aussi `tenantFeatures` (parse JSON safe, fallback `{}`). +`getRouteMode(companyId, feature)` qui retourne `'legacy'|'shadow'|'tenant'` avec regle : kill-switch legacy global, sinon `tenantFeatures[feature]`, sinon fallback `tenantMode`. Fail-closed vers `'legacy'` si companyId inconnu. +`ROUTE_MODES` const gelee.
- [x] 5A.3 : `server/services/shadowCompare.js` — nouveau fichier. `stableStringify()` avec tri de cles recursif (undefined→null, Date→ISO, Buffer→base64). `shadowCompare({companyId, feature, route, fetchMonolith, fetchTenant})` async qui lance `Promise.allSettled`, hash sha256 des 2 payloads, INSERT diff UNIQUEMENT si mismatch ou tenant throw. PayloadSample borne a 2000 chars + arrays tronques a 5 rows. Safe-failure : toute erreur interne swallowed, monolith toujours renvoyee. Si monolith throw → propage.
- [x] 5A.4 : `server/routes/tenantAdmin.js` — nouveau routeur monte sur `/api/tenant-admin`. 3 endpoints tous `requireAuth + requireSupra` : `GET /shadow-diffs?companyId&feature&limit&offset`, `GET /shadow-diffs/summary?hours` (agregat par companyId/feature sur fenetre), `GET /mode/:companyId` (lit `tenantMode` + `tenantFeatures` + presence tenant DB). Mount dans `server/index.js`.
- [x] 5A.5 : `server/db/test/testShadowCompare.mjs` — 14 tests : stableStringify determinisme (1), Date/undefined stringify (2), match no-diff (3), mismatch diff-row (4), tenant throws captures tenantError (5), monolith throws propagates (6), kill-switch legacy (7), shadow+feature=tenant (8), tenant+feature=shadow (9), unknown companyId fail-closed (10), missing feature fallback (11), invalid feature value fallback (12), initControlTowerSchema idempotent 2nd call (13), table+index present (14).
- [x] Syntax check `node --check` OK sur : controlTowerSchema.js, tenantResolver.js, shadowCompare.js, tenantAdmin.js, testShadowCompare.mjs, index.js
- [ ] User : `CONTROL_TOWER_PATH=/tmp/ct-shadowtest.db node server/db/test/testShadowCompare.mjs` → attendu 14/14 pass
- [ ] User : smoke test prod — curl `GET /api/tenant-admin/mode/<capfinances_id>` avec token supra → attendu `{tenantMode: 'legacy', tenantFeatures: {}, hasTenantDb: true}`
- [ ] User : `GET /api/tenant-admin/shadow-diffs` → attendu `{items: [], total: 0}` (aucune route n'a encore ete cablee en shadow)

### Phase 5B — Premiere route en shadow (READ-ONLY, feature la moins critique)
- [ ] 5B.1 : choisir la feature pilote. Candidats ranges (moins critique -> plus critique) :
  - GET `/api/data/contacts` (lecture seule, pas de side-effect, haute frequence = bonne couverture statistique)
  - GET `/api/pipeline/stages`
  - GET `/api/bookings` (attention : plus de volume, plus de jointures indirectes)
  - GET `/api/calls`
- [ ] 5B.2 : refactorer la route pilote pour passer par `shadowCompare` quand `tenantMode==='shadow'`. Laisser intacte quand `tenantMode==='legacy'`.
- [ ] 5B.3 : passer CAPFINANCES en `tenantMode='shadow'` via control tower (update direct, ou endpoint admin dedie cote step 5D).
- [ ] 5B.4 : laisser tourner 48h. Consulter `tenant_shadow_diffs`. Tolerance : 0 diff attendu sur une route stable. Si diffs : investiguer source (timestamp format, trim, trailing whitespace, row order, jointure manquante).
- [ ] 5B.5 : si 0 diff → passer MON BILAN en `shadow` aussi. Laisser 48h.

### Phase 5C — Promotion en READ-TENANT (migration inversee de la source de verite en lecture)
- [ ] 5C.1 : sur la meme route pilote, basculer `tenantMode==='tenant'` → lecture = tenant DB uniquement. Monolithe lue UNIQUEMENT en fallback si tenant throw (`try { tenant } catch { monolith }`).
- [ ] 5C.2 : les ECRITURES continuent d'aller sur la monolithe ET sur la tenant DB (double-write). Pattern classique de migration Stripe / GitHub. Eviter : une ecriture en mode tenant pur avant que TOUTES les routes de lecture soient tenantisees = risque de lecture stale.
- [ ] 5C.3 : repliquer sur les autres features READ-ONLY (une a une, 24h min entre chaque).

### Phase 5D — Admin panel cutover controls
- [ ] 5D.1 : UI admin (dans AdminDash Vision Supra > Entreprises) avec toggle par company et par feature : legacy / shadow / tenant. Cable sur `POST /api/admin/tenant/mode` (requireSupra, insert tenant_status_history).
- [ ] 5D.2 : dashboard temps reel des diffs shadow : company, feature, diff rate, derniere divergence.
- [ ] 5D.3 : bouton "rollback to legacy" par company, ecrit history, reset mode en 1 click.

### Phase 5E — Promotion des ECRITURES (risquee, feature par feature)
- [ ] 5E.1 : pour une feature donnee (commencer par les notes de contact, faibles enjeux), basculer l'ECRITURE en priorite tenant, double-write asynchrone vers monolith, log si mismatch.
- [ ] 5E.2 : apres 1 semaine clean : couper le double-write. La monolithe cesse de recevoir des INSERT/UPDATE sur cette feature pour cette company.
- [ ] 5E.3 : iterer feature par feature. Ordre de risque : notes < tags < pipeline_history < contacts < bookings < calls < sms.

### Phase 5F — Decommission monolithe (loin, apres 100% des features + 100% des companies en tenant)
- [ ] 5F.1 : dump final monolithe pour cold archive.
- [ ] 5F.2 : pointer toutes les routes vers tenantResolver sans fallback monolithe.
- [ ] 5F.3 : retirer `server/db/calendar360.db` de la stack active.
- [ ] 5F.4 : NE PAS supprimer le fichier. Garder 6 mois minimum en read-only.

### Decisions a valider AVANT de coder 5A
1. **Granularite feature flag** : par company uniquement (`tenantMode`) ou par company+feature (`tenantFeatures` JSON) ? Recommendation : les deux. `tenantMode` sert d'override global (legacy force tout en legacy), `tenantFeatures` permet un rollout fin sans toucher au global.
2. **Route pilote** : laquelle de GET `/api/data/contacts`, GET `/api/pipeline/stages`, GET `/api/bookings` ? Recommendation : contacts (volume + stabilite du schema + couverture des 609 remaps sur MON BILAN = excellent signal).
3. **Company pilote** : CAPFINANCES (petite, 0 remap, risque minimal) ou MON BILAN (grosse, 609 remaps, couverture forte) ? Recommendation : CAPFINANCES en premier (verifier le plumbing), MON BILAN en second (verifier le gros volume).

## ✅ 2026-04-15 — Audit global scope CollabPortal <-> AdminDash : 5 ReferenceError latentes corrigees
- [x] Verification script Python : cross-reference 262 useStates CollabPortal avec occurrences AdminDash + App, filtrage redeclarations et gardes `typeof`
- [x] Faux positifs ecartes : docs/loaded/msgs (property access, comments, closures), 26 refs csvImportModal dans `{false && (()=>{...})()}` dead code
- [x] Liste finale verrouillee : 5 points exacts (L20966, L23350, L31064, L31954, L39261)
- [x] Patch groupe applique en 1 passe sur app/src/App.jsx (5 diffs, zero changement metier)
- [x] Pattern uniforme : `typeof X !== 'undefined' && X && typeof setX === 'function'`
- [x] Build frontend OK, deploy VPS OK, PM2 online, restart count stable
- [x] Tests prod (a)-(e) : plus aucun `ReferenceError: pipelineRightContact` ni `selectedCrmContact` — UI stable, aucun effet de bord
- [x] Leçon ajoutee dans lessons.md : `x?.y` ne protege PAS contre ReferenceError, seul `typeof` le fait

## ✅ 2026-04-15 — Bug Marie-Ange : suppression contact bloquee (FK contact_documents + ReferenceError frontend)
- [x] Diagnostic : POST /api/data/contacts/bulk-delete → 500 "FOREIGN KEY constraint failed"
- [x] Cause racine : FK `contact_documents.contactId REFERENCES contacts(id)` sans CASCADE
- [x] Fix backend `server/routes/data.js` : transaction SQLite, DELETE contact_documents AVANT contacts, `.changes` reel, logs enrichis [CONTACTS BULK-DELETE ERROR]
- [x] Fix frontend `app/src/App.jsx` L20962 + L39255 : guards `typeof selectedCrmContact !== 'undefined'` (variable hors scope dans AdminDash)
- [x] Deploy VPS via deploy.sh (frontend rebuilt, PM2 restart)
- [x] Tests valides : DB 0/0, log `deleted=1 cleanedDocs=1`, persistance 5min OK (sync-batch ne recree pas)
- [x] Politique conservatrice : bookings / call_logs / pipeline_history / contact_status_history conserves (historique metier)

## ⏳ 2026-04-15 — Bugs collateraux identifies en prod (NON URGENT, a traiter separement)
- [ ] `[MEDIA STREAM] DB save error: FOREIGN KEY constraint failed` — recurrent ~6×/jour, FK ailleurs (probablement call_logs ou call_transcript_archive)
- [ ] `[DB] backfill lastActivityAt skipped: misuse of aggregate: MAX()` — SQL mal formee
- [ ] PM2 restart count = 1052 — investigue les crashs frequents (PARTIELLEMENT TRAITE : 5 ReferenceError cross-scope neutralises le 15/04 apres-midi, re-mesurer apres 24-48h)

## ✅ 2026-04-15 — Vision Supra : colonnes Contacts + Heures totales
- [x] Backend : GET /api/companies/stats (requireSupra) — COUNT contacts/collabs/calendars/bookings + SUM call_logs.duration par companyId en LIVE
- [x] Frontend : useEffect Vision enrichi (fetch /stats en parallele, merge dans allCompanies, deps [tab, visionSubTab])
- [x] Frontend : 2 colonnes ajoutees au tableau Entreprises (Contacts teal, Heures purple au format XhYY / Xmin)
- [x] Tooltip : nombre de contacts exact / nombre d'appels + total secondes
- [x] Zero hook ajoute (conforme regle V3)
- [ ] Deploy VPS via deploy.sh + verifier live

## 🦅 CHANTIER STRATEGIQUE — PLAN FAUCON (en attente validation)

**Corpus IA conversationnel sectoriel** — Roadmap 6 mois pour entrainer des agents IA par secteur.

Voir `tasks/PLAN_FAUCON.md` pour le plan complet.

### Etat actuel (10/04/2026)
- ✅ Infrastructure prete : table `call_transcript_archive`, endpoint d'archivage, UI historique avec preview
- ⏳ En attente : demarrage Phase 1 (Socle) sur validation utilisateur
- 📊 Data : 172 appels / 14 transcripts en DB (7% couverture)
- 🎯 Objectif M1 : 500 conversations archivees automatiquement

### Actions Phase 1 (validees, pretes a lancer)
1. Fix DEEPGRAM_API_KEY (401 actuellement)
2. Cron auto-archive transcripts (toutes les 5 min)
3. Activer AI Copilot par defaut sur nouveaux collabs
4. Consentement RGPD (3 colonnes + CGU + TwiML message)

---

## PRIORITE 1 — Refonte complete onglet Telephone (Dialer Pro)

### Objectif
Refaire completement l'onglet telephone pour avoir une interface pro type Ringover/Aircall/Dialpad :
- Dialer central toujours visible
- Copilot IA integre dans le meme ecran (panneau droit)
- Conversations a gauche
- Favoris sous le clavier
- Mass Dialer / Power Dialer
- CSV import pour appels en masse
- Tout centralise, pas d'onglets inutiles

### Structure UI cible
```
+-------------------+-------------------+-------------------+
|  CONVERSATIONS    |   DIALER CENTRAL  |   COPILOT IA      |
|  (gauche)         |   (centre)        |   (droite)        |
|                   |                   |                   |
|  - Liste convs    |  - Header appel   |  - Transcription  |
|  - Appels         |    (numero, nom,  |  - Analyse live   |
|  - SMS            |     duree, statut)|  - Suggestions    |
|  - Audio          |  - Clavier        |  - Sentiment      |
|  - Resume IA      |  - Controles      |  - Script/Trame   |
|  - Notes          |    (mute, hold,   |  - Actions rapides|
|                   |     record, etc.) |  - Resume         |
|                   |  - Favoris        |  - Context        |
|                   |  - Recents        |  - Notes          |
|                   |                   |                   |
+-------------------+-------------------+-------------------+
```

### Sous-taches
- [x] Concevoir le layout 3 colonnes (conversations | dialer | copilot)
- [x] Refaire le dialer central (header appel + clavier + controles)
- [x] Integrer Copilot IA dans le panneau droit (transcription live + suggestions + actions)
- [x] Liste conversations a gauche (appels + SMS + notes + resume IA)
- [x] Favoris + contacts recents sous le clavier
- [x] Deplacer blacklist dans Settings
- [x] Actions pendant appel (ajouter contact, SMS, email, tache, RDV, note, tag)
- [x] Chaque appel = conversation + event + audio + resume IA + transcription
- [x] Mass Dialer / Power Dialer (appel en masse)
- [x] Import CSV (phone, name, email, note, company)
- [x] Mode appel en chaine (auto next, pause, skip, callback)
- [x] Copilot compatible mass dialer (context + campaign + goal)
- [x] Verification connexion complete (Twilio, wallet, numero, etc.)
- [x] Tests en production — deploye le 2026-03-19, a valider
- [x] Fix enregistrements appels : ajout recordingStatusCallback dans TwiML + endpoint /recording-callback

---

## PRIORITE 2 — Live Transcription (en cours)

### Etat actuel
- [x] WebSocket server Node.js operationnel
- [x] Nginx proxy WebSocket configure
- [x] Twilio Media Stream via REST API fonctionne
- [x] Deepgram SDK installe + cle configuree
- [x] Service liveTranscription.js cree
- [x] Service liveAnalysis.js cree (GPT periodique)
- [x] SSE endpoint /api/voip/live-stream/:callSid
- [x] Table call_transcripts en DB
- [x] Frontend SSE + panel IA LIVE + transcript bulles
- [ ] **Tester un appel complet** avec transcription live + analyse GPT
- [ ] Verifier que le transcript apparait dans le panneau d'appel
- [ ] Sauvegarder le transcript en DB apres appel

---

## PRIORITE 3 — Synchronisation Pipeline + Dialer Central (termine)

### Corrections effectuees
- [x] **BUGFIX CRITIQUE** : Stages pipeline desynchronises — fiche contact utilisait 5 vieux stages (en_cours, proposition, gagne) au lieu des 7 CRM (contacte, qualifie, client_valide) → contacts disparaissaient du pipeline
- [x] Migration DB : en_cours→contacte, proposition→qualifie, gagne→client_valide
- [x] 4 endroits corriges dans App.jsx (contact list, contact detail, quick add modal)
- [x] Dialer central : tous les boutons "Appeler" du CRM redirigent vers l'onglet Telephone + startPhoneCall
- [x] Popup contact pipeline : clic sur card = popup avec infos + actions (appeler, SMS, email, fiche, notes, changer stage) sans quitter le pipeline
- [x] Champ source contacts : DB (manual, lead, agenda, form, ads, import, campaign, api) + formulaire edition + affichage Info
- [x] Verification logique raccrocher : endPhoneCall correcte et comprehensive
- [x] Pipeline CRM et Pipeline Telephone utilisent la meme source de donnees (contacts.pipeline_stage)

---

## Termine (2026-03-19)
- [x] Refonte complete onglet Telephone — layout 3 colonnes pro (Conversations | Dialer | Copilot IA)
- [x] 15 sous-onglets remplaces par toolbar + modals, interface type Ringover/Aircall
- [x] Import CSV pour campagnes d'appels en masse
- [x] Blacklist deplace dans Settings
- [x] Deploye sur VPS via deploy.sh
- [x] Historique profil IA + suggestions post-appel
- [x] Onglet "Mon Profil IA" dans CollabPortal
- [x] Fix deploy.sh, DB restore, React hooks, call scope, auth middleware
- [x] UI appel entrant (overlay decrocher/refuser)
- [x] CLAUDE.md + tasks + lessons
- [x] WebSocket + Nginx + Twilio Stream + Deepgram pipeline

## PRIORITE 4 — Audit Global + Corrections (termine 2026-03-19)

### Audit complet effectue
- [x] Audit DB : 59 tables analysees, schema multi-tenant verifie
- [x] Audit Routes : 6 fichiers critiques sans auth identifies
- [x] Audit Frontend : 5 appels pipeline directs, AdminDash stages manquants

### Corrections DB
- [x] 12 index de performance ajoutes (contacts, bookings, calendars, forms, phone_numbers, tickets, call_logs, activity_logs, conversations, sms_messages)
- [x] Colonne `conversationId` ajoutee sur call_logs (lien appels ↔ conversations)
- [x] Colonne `companyId` ajoutee sur bookings (filtrage multi-tenant direct)

### Corrections Routes — Securite CRITIQUE
- [x] `data.js` : requireAuth + enforceCompany sur TOUTES les routes (workflows, routings, polls, contacts, pipeline-stages, activity)
- [x] `data.js` : suppression du fallback `companyId || 'c1'` → retourne 400 si manquant
- [x] `data.js` : GET /activity filtre par companyId (ne renvoie plus TOUS les logs)
- [x] `collaborators.js` : requireAuth sur toutes les routes (GET, POST, PUT, DELETE)
- [x] `companies.js` : requireSupra sur toutes les routes (seuls supra-admins gerent les companies)
- [x] `aiCopilot.js` : requireAuth sur les 17 routes
- [x] `bookings.js` : requireAuth sur les 4 routes
- [x] `voip.js` : enforceCompany ajoute sur PUT /calls/:id et GET /calls/contact/:contactId
- [x] `voip.js` : requireAuth ajoute sur GET /live-stream/:callSid et GET /transcript/:callLogId

### Corrections Frontend
- [x] AdminDash : CRM_STAGES fusionne maintenant les custom pipeline stages avec DEFAULT_CRM_STAGES
- [x] AdminDash : pipelineStages et setPipelineStages passes en props
- [x] AdminDash : stageLookup useMemo depends de [pipelineStages]
- [x] 5 appels directs pipeline_stage remplaces par handleCollabUpdateContact / handleUpdateContactLogged
- [x] handleCollabUpdateContact : inclut companyId dans le body PUT
- [x] handleUpdateContact : inclut companyId dans le body PUT
- [x] handleDeleteContact : inclut companyId dans le body DELETE
- [x] 8 appels directs contacts PUT/DELETE : companyId ajoute

### Deploye
- [x] Build frontend OK (vite build 1.74s)
- [x] 7 fichiers serveur : syntaxe verifiee (node --check)
- [x] Deploy VPS via deploy.sh
- [x] PM2 restart OK, serveur en ligne sans erreur

---

## PRIORITE 5 — Module LEADS + OBJECTIFS (termine 2026-03-20)

### Backend
- [x] 8 tables DB : lead_sources, incoming_leads, lead_envelopes, lead_dispatch_rules, lead_assignments, user_goals, team_goals, goal_rewards
- [x] 13 index de performance sur les nouvelles tables
- [x] JSON_FIELDS pour lead_sources, incoming_leads, team_goals
- [x] `server/routes/leads.js` : 22 endpoints (sources CRUD, inbox, envelopes, dispatch rules, import CSV/GSheet, dispatch engine, assignments, stats)
- [x] `server/routes/goals.js` : 13 endpoints (user goals CRUD, team goals CRUD, rewards, progress, check-rewards, stats)
- [x] `server/cron/leadDispatch.js` : dispatch auto toutes les 15 min (hourly, daily, on_import)
- [x] Routes enregistrees dans index.js + cron importe

### Frontend
- [x] TAB_TITLES + navCategories (categorie "Leads & Objectifs")
- [x] Onglet LEADS complet (~600 lignes IIFE) : Dashboard, Sources, Inbox, Envelopes, Regles, Historique + 7 modals (import CSV, import GSheet, ajout source, ajout enveloppe, mapping colonnes, ajout regle)
- [x] Onglet OBJECTIFS complet (~400 lignes IIFE) : Dashboard, Individuels, Equipe, Recompenses, Classement + 2 modals

### Deploye
- [x] Build frontend OK (vite build 1.90s)
- [x] node --check OK sur leads.js, goals.js, leadDispatch.js, index.js
- [x] Deploy VPS via deploy.sh
- [x] 8 tables creees manuellement sur production (fix semicolon manquant dans db.exec)
- [x] 13 index crees sur production
- [x] PM2 restart OK, cron lead dispatch actif
- [x] API /api/leads et /api/goals repondent (requireAdmin protege)

---

## PRIORITE 6 — Pipeline CRM Pro : Corrections + Ameliorations (termine 2026-03-20)

### DB Schema
- [x] Table `pipeline_history` (id, contactId, companyId, fromStage, toStage, userId, userName, note, createdAt)
- [x] 6 colonnes contacts : rdv_status, next_rdv_date, next_rdv_booking_id, nrp_followups_json, nrp_next_relance, createdAt
- [x] 3 colonnes collaborators : nrp_delay_1, nrp_delay_2, nrp_delay_3
- [x] 1 colonne bookings : contactId
- [x] 5 index (pipeline_history contact+company, contacts next_rdv+nrp_relance, bookings contactId)

### Backend
- [x] GET/POST /api/data/pipeline-history (historique mouvements pipeline)
- [x] contactId dans POST /api/bookings (lien RDV ↔ contact CRM)
- [x] Cron NRP auto-relance (nrpRelance.js, toutes les 30 min)

### Frontend — Corrections
- [x] 5 stages pipeline hardcodees remplacees par PIPELINE_STAGES (popup, phone pipeline, phone contact detail x2, phone quick-add)
- [x] handlePipelineStageChange enrichi : NRP auto-followup (3/7/14j configurable), pipeline-history logging

### Frontend — Popup enrichi
- [x] Section historique pipeline (5 dernieres transitions)
- [x] Badge NRP avec prochaine relance ou "Relancer maintenant !"
- [x] Badge RDV sous-statut (pris, confirme, en attente, passe, annule)
- [x] Infos enrichies (source, owner, prochain RDV)
- [x] Bouton RDV entre SMS et Email → ouvre modal creation RDV
- [x] Email pre-rempli avec sujet "Suivi - {nom}"

### Frontend — Modal RDV depuis pipeline
- [x] Modal complet : Agenda, Date, Heure, Duree, Note
- [x] Creation booking via POST /api/bookings avec contactId
- [x] Auto-deplacement vers rdv_programme + set rdv_status + next_rdv_date
- [x] Icone RDV rapide sur les cards pipeline kanban

### Frontend — Tri + Countdown
- [x] Colonne rdv_programme triee par next_rdv_date ASC (plus proche en haut)
- [x] Colonne nrp triee par nrp_next_relance ASC (plus urgent en haut)
- [x] Tri applique aux 3 kanbans (collab, phone, admin)
- [x] Barre countdown RDV en bas (bookings confirmes dans les 2h)
- [x] Code couleur : bleu >15min, orange ≤15min, rouge passe
- [x] Boutons post-RDV : Termine, Reporte, Annule
- [x] Countdown inline sur cards rdv_programme

### Frontend — Admin
- [x] Pipeline-history logging dans handleUpdateContactLogged
- [x] Tri colonnes admin pipeline (rdv_programme + nrp)
- [x] Settings NRP delays par collaborateur (3 inputs dans form edition)

### Deploye
- [x] Build frontend OK (vite build 1.97s)
- [x] 5 fichiers serveur : syntaxe verifiee (node --check)
- [x] Deploy VPS via deploy.sh
- [x] Table pipeline_history + colonnes + index crees manuellement en production
- [x] PM2 restart OK, cron NRP actif, 0 erreurs

---

## PRIORITE 7 — Leads V4 : Dispatch date + GSheet live + Anti-triche + Manager (termine 2026-03-20)

### DB Schema (Phase 1)
- [x] 9 ALTER TABLE : dispatch_start_date (envelopes), sync_mode/gsheet_url/last_row_count/sync_interval/sync_envelope_id (sources), is_valid_call/invalid_reason (call_logs), dispatched (incoming_leads)
- [x] Table user_activity_logs (10 colonnes)
- [x] 7 index (activity company/collab/type, dispatched+status, valid+company, sync+active)
- [x] JSON_FIELDS : user_activity_logs metadata_json

### Backend (Phase 2)
- [x] leadImportEngine.js : 7 fonctions extraites de leads.js (uid, logHistory, cleanPhoneForCompare, checkDuplicate, parseCSV, autoDetectMapping, executeImport)
- [x] dispatch_start_date dans POST/PUT /envelopes
- [x] Dispatch engine filtre par dispatch_start_date + dispatched=0
- [x] assignLeadToCollab set dispatched=1
- [x] recalcScores enhanced : anti-triche (valid calls only, penalite >30% invalides), AI quality (AVG qualityScore), poids 30/25/20/15/10
- [x] Goals bonus dans dispatch AI/hybrid (+3 par goal complete max +15, -10 si aucun goal)
- [x] PUT /sources/:id/sync — config sync GSheet
- [x] POST /sources/:id/sync-now — sync immediate
- [x] GET /manager-stats — stats par collaborateur

### Anti-triche + IA (Phase 3)
- [x] voip.js : is_valid_call < 15s = invalide, status failed = invalide
- [x] voip.js : user_activity_logs insert pour chaque appel
- [x] aiCopilot.js : auto-detect pipeline change apres analyse → recommended_actions
- [x] leadDispatch.js : status IN ('new','queued') + dispatched=0 + dispatch_start_date + 4 modes
- [x] gsheetSync.js : cron 10 min, incremental sync, auto-dedup, status queued

### Frontend (Phase 4 — 0 hooks ajoutes)
- [x] newSource default + sync fields, newEnvelope default + dispatch_start_date
- [x] loadData 8 fetches (ajout manager-stats), merger dans leadStats
- [x] Sub-tab Manager : cards par collab (score, calls valid/invalid, AI quality, anti-triche alert)
- [x] Source cards : badges sync (live=vert, schedule=bleu) + Sync Now + last_sync
- [x] Envelope cards : badge dispatch_start_date
- [x] Envelope modal : date picker dispatch_start_date
- [x] Source modal : GSheet sync config (URL, sync_mode, enveloppe destination)

### Deploye (Phase 5)
- [x] Syntaxe OK (node --check sur 8 fichiers)
- [x] Build frontend OK (vite build 1,919 kB)
- [x] Deploy VPS via deploy.sh
- [x] Schema migration manuelle : 9 ALTER TABLE + 1 CREATE TABLE + 7 index
- [x] PM2 restart OK, cron GSheet sync actif (every 10 min), 0 erreurs

---

## PRIORITE 8 — Module Perf Collab complet (termine 2026-03-20)

### DB Schema (Phase 1)
- [x] 4 tables : perf_score_settings, perf_bonus_penalty_logs, perf_audit_reports, perf_snapshots
- [x] 6 index de performance
- [x] JSON_FIELDS pour bonus_rules_json, penalty_rules_json, summary_json, stats_json

### Backend (Phase 2)
- [x] server/routes/perfCollab.js : ~350 lignes, 8 endpoints
- [x] GET /dashboard : leaderboard + 8 sous-scores + auto-bonus/penalty + badges + insights
- [x] GET /audit/:id : audit detaille 7 sections + coaching IA
- [x] POST /bonus + /penalty : ajout manuel
- [x] POST /generate-audit/:id : rapport IA via GPT-4o-mini
- [x] GET/PUT /settings : ponderation configurable (somme = 100%)
- [x] computeCollabScore : 8 criteres (calls, quality, conversion, speed, followup, goals, discipline, regularity)
- [x] computeAutoBonusPenalty : 5 auto-bonus + 5 auto-penalty
- [x] computeBadges : closer, volume, qualite, relanceur, regulier, progression

### Frontend (Phase 4)
- [x] Remplacement IIFE perfCollab (232 → 531 lignes, 9 hooks FIXES)
- [x] 5 sub-tabs : Classement, Audit, Bonus & Penalites, Insights, Parametres
- [x] Leaderboard : stats globales, podium top 3, badges, tableau classement, detail 8 scores inline
- [x] Audit : selection collab → resume, activite, commercial, qualite IA (gauges SVG), discipline, bonus/penalites, resume IA
- [x] Bonus & Penalites : ajout manuel (modal) + historique
- [x] Manager Insights : top performers, a risque, a coacher, sous-exploites, surcharges
- [x] Parametres : 8 sliders poids (validation total=100%), regles auto affichees

### Deploye (Phase 5)
- [x] Syntaxe OK (node --check sur 3 fichiers)
- [x] Build frontend OK (vite build 1,941 kB)
- [x] Deploy VPS via deploy.sh
- [x] Schema migration manuelle : 4 CREATE TABLE + 6 index
- [x] PM2 restart OK, 0 erreurs, route /api/perf active

---

## PRIORITE 9 — VoIP Live Transcription : Audit + Mots Interdits Live + Reconnexion ✅

### Objectif
Audit complet du pipeline VoIP existant (Twilio → Media Streams → Deepgram → GPT live → AI Copilot) et ajout des gaps manquants : detection LIVE des mots interdits, alertes admin, reconnexion Deepgram, fix domaine hardcode.

### Audit : Ce qui existait deja (REUTILISE, pas recree)
- ✅ Twilio Voice SDK (token, TwiML, inbound/outbound) — twilioVoip.js
- ✅ Media Streams WebSocket /media-stream — index.js:493-581
- ✅ Deepgram STT (nova-2, fr, mulaw, 8kHz) — liveTranscription.js
- ✅ Live GPT-4o-mini analyse toutes les 15s — liveAnalysis.js
- ✅ SSE streaming vers frontend — liveTranscription.js
- ✅ Post-call AI Copilot (transcription + scores + actions) — aiCopilot.js
- ✅ Post-call Secure IA (Whisper → mots interdits) — secureIaPhone.js
- ✅ Call recording (record-from-answer-dual) — twilioVoip.js
- ✅ Anti-fake call validation — voip.js
- ✅ French compliance (horaires, consentement) — twilioVoip.js
- ✅ Live coaching pre-appel (Mode Pilote) — aiCopilot.js

### Corrections appliquees
- [x] Fix domaine hardcode wss://calendar360.fr → process.env.APP_DOMAIN (voip.js:374-378)
- [x] Ajout DEEPGRAM_API_KEY + APP_DOMAIN dans .env
- [x] Reconnexion auto Deepgram si deconnexion mid-call (liveTranscription.js)

### Ajouts (les SEULS gaps)
- [x] Detection LIVE mots interdits dans le stream Deepgram (liveTranscription.js)
  - Hook dans handler `transcript` apres chaque segment final
  - Charge secure_ia_words_json du collaborateur au demarrage session
  - Normalisation accents (normalize()) identique a secureIaPhone.js
  - INSERT dans call_live_flags + broadcast SSE `forbidden_word`
- [x] Table call_live_flags + 2 index (database.js)
- [x] 2 endpoints GET /api/voip/live-flags/:callSid et /collab/:id (voip.js)
- [x] Integration Perf Collab : auto-penalite -10/violation (perfCollab.js)

### Deploye
- [x] node --check : 4 fichiers OK
- [x] npm run build : 1,942 kB OK
- [x] deploy.sh : PM2 online
- [x] VPS : CREATE TABLE call_live_flags + 2 index
- [x] PM2 restart : 0 erreurs

### Note
DEEPGRAM_API_KEY non fournie → transcription live en demo mode. A remplir quand la cle sera disponible.

---

## 🛠 2026-04-16 STEP 5 Phase 5B — Shadow wiring sur GET /api/data/contacts (code deploye dormant)

### Contexte
Phase 5A (fondations shadow) deja deployee + CAPFINANCES et MON BILAN re-enregistres dans la vraie CT prod (`hasTenantDb: true`, `tenantMode: 'legacy'`). User valide le passage a 5B.

### Livrables (code)
- [x] `server/db/database.js` : export de `parseRows` (ligne 2042, ajout mot-cle `export`).
- [x] `server/db/tenantResolver.js` : nouvelle fonction exportee `getTenantDbForShadow(companyId)` qui accepte `tenantMode==='shadow'` OU `'tenant'`, refuse `'legacy'` et `!dbPath`.
- [x] `server/routes/data.js` : imports `parseRows` + `getRouteMode` + `getTenantDbForShadow` + `shadowCompare`. `GET /contacts` devenu `async`. `fetchMonolith` = logique legacy exacte. Si `mode !== 'shadow'` : return monolith direct (zero overhead). Sinon : `shadowCompare` avec `fetchTenant` de meme shape + exclusion `id != '__deleted__'`.
- [x] Syntax check `node --check` OK sur database.js, tenantResolver.js, data.js, shadowCompare.js.
- [x] Sauvegarde : `backups/phase-5B-20260416/` (copies + README + git diff).

### A faire par l'utilisateur
- [ ] `cd app && npm run build` + `./deploy.sh`
- [ ] `pm2 status` + `pm2 logs calendar360 --lines 50 --nostream` (verifier 0 erreur au boot)
- [ ] Smoke PRE-flip : `curl /api/tenant-admin/mode/c1776169036725` → `tenantMode:'legacy'`
- [ ] Backup CT + monolith : `cp /var/www/planora-data/control_tower.db /var/www/planora/backups/ct-before-5B-flip-capfinances-<ts>.db`
- [ ] SQL flip CAPFINANCES : `UPDATE companies SET tenantMode='shadow', tenantFeatures='{"contacts":"shadow"}' WHERE id='c1776169036725';`
- [ ] `pm2 restart calendar360` (invalide metaCache)
- [ ] Smoke POST-flip : `curl /api/tenant-admin/mode/c1776169036725` → `tenantMode:'shadow'`
- [ ] Smoke metier : `GET /api/data/contacts?companyId=c1776169036725` avec token admin CAPFINANCES → meme nombre de contacts qu'avant
- [ ] Observer `/api/tenant-admin/shadow-diffs/summary?hours=24` et `/shadow-diffs?companyId=c1776169036725&feature=contacts` a H+5min, H+1h, H+24h, H+48h
- [ ] Si 0 diff stable apres 48h → repeter les 6 etapes pour MON BILAN (`c1772832020988`)

### Rollback immediat (si diff massif ou erreur)
- [ ] `UPDATE companies SET tenantMode='legacy', tenantFeatures='{}' WHERE id='c1776169036725';` + `pm2 restart calendar360`
- [ ] Le code Phase 5B reste present mais dormant. Aucun rollback code necessaire.

---

## 🛡 2026-04-16 SECURITE — Placeholder tenant fantome `Cabinet Dupont & Associes` (audit fait, corrections a planifier)

### Constat
Le supra admin `rc.sitbon@gmail.com` atterrit en sidebar sur "Cabinet Dupont & Associes / dupont-associes.calendar360.fr" avec 4 collabs (Marie/Sophie/Lucas/Antoine). Ce tenant N'EXISTE PAS en DB (absent de Vision → Entreprises qui liste 6 companies reelles).

### Origine
Fixtures hardcodees dans `app/src/App.jsx` :
- L184 : `COMPANIES = [{id:"c1", name:"Cabinet Dupont...", slug:"dupont-associes", ...}]`
- L186-191 : `INIT_COLLABS` (4 collabs avec **mots de passe en clair** dans le bundle JS : `mdupont2026`, `lmartin2026`, `sbernard2026`, `amoreau2026`)
- L204-222 : `INIT_CALS` / `INIT_BOOKINGS`
- L236-241 : `INIT_CONTACTS`
- L245-251 : `INIT_ALL_COMPANIES` (5 placeholders : Dupont + Clinique Saint-Louis + Studio Graphique + Immo Provence + Coach Lyon)
- L252+ : `INIT_ALL_USERS`
- L39107 : `const [company, setCompany] = useState(COMPANIES[0]);` → cause racine de l'affichage au boot

### Impact
- Pas de fuite multi-tenant reelle (Dupont n'existe nulle part en DB).
- Mots de passe demo en clair dans le bundle prod.
- Confusion UX severe : supra admin croit editer Dupont → requetes `companyId='c1'` → 404 ou fantomes.
- Risque zero de collision d'ID (vraies companies ont id `c<timestamp13>`, jamais `c1..c5`).
- A verifier : `server/seed.js` doit ABSOLUMENT n'avoir jamais ete execute en prod. Verif : `sqlite3 /var/www/planora-data/calendar360.db "SELECT id FROM companies WHERE id='c1' OR slug='dupont-associes';"` → attendu : 0 ligne.

### Plan de correction (par priorite)
- [ ] **P0** — `app/src/App.jsx` L39107 : `useState(null)` au lieu de `useState(COMPANIES[0])` + gate rendu : si `!company && auth.isSupra` → rediriger Vision ; si `!company && !auth.isSupra` → spinner loading jusqu'a fetch. 1 ligne + 1 guard.
- [ ] **P1** — Supprimer les 8 constantes demo (`COMPANIES`, `INIT_COLLABS`, `INIT_AVAILS`, `INIT_CALS`, `INIT_BOOKINGS`, `INIT_WORKFLOWS`, `INIT_ROUTING`, `INIT_POLLS`, `INIT_CONTACTS`, `COMPANY_SETTINGS`, `INIT_ALL_COMPANIES`, `INIT_ALL_USERS`) + reinit states a `[]` / `null`. Les vrais fetch `/api/init`, `/api/companies` peuplent ensuite.
- [ ] **P2** — Flow restore session supra (JWT valide detecte au boot) : bypass du placeholder, go directement Vision.
- [ ] **P3** — `server/seed.js` : deplacer vers `server/scripts/seedDemo.js` + ajouter garde `if (process.env.NODE_ENV === 'production') { process.exit(1); }`. Verifier qu'aucun `postinstall` / `npm start` ne le declenche.
- [ ] **P4** — Verification en prod : SQL `SELECT id, slug FROM companies WHERE id='c1' OR slug='dupont-associes';` → doit renvoyer 0 ligne. Sinon `DELETE FROM companies WHERE id='c1';` + cascade sur collaborators / bookings / etc.
