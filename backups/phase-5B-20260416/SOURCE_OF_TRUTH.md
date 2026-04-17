# SOURCE_OF_TRUTH.md — Calendar360 / PLANORA

> Regles fondamentales du SaaS. Toute deviation = regression ou faille.
> Derniere mise a jour : 2026-04-16 (STEP 5 Phase 5A — shadow mode fondations)

---

## 1. Multi-entreprise — Isolation absolue

### Principe
Chaque entreprise (company) est un tenant isole. Un collaborateur ne doit JAMAIS voir les donnees d'une autre company.

### Implementation (SQLite + Middleware)

| Couche | Mecanisme |
|--------|-----------|
| **Stockage** | SQLite unique avec `companyId` sur TOUTES les tables metier |
| **Auth** | Table `sessions` (token → collaboratorId + companyId + role) |
| **Middleware `requireAuth`** | Verifie le Bearer token, injecte `req.auth = { collaboratorId, companyId, role }` |
| **Middleware `enforceCompany`** | Verifie que `req.query.companyId` ou `req.body.companyId` match `req.auth.companyId` |
| **Middleware `requireAdmin`** | Verifie `req.auth.role === 'admin'` |
| **Middleware `requireSupra`** | Verifie que l'email est dans `supra_admins` |
| **`verifyOwnership(table, id, req, res)`** | SELECT par id, verifie que companyId match — utilise sur PUT/DELETE avec `:id` |

### Regles strictes

```
✅ GET  /api/contacts?companyId=X     → enforceCompany verifie X == req.auth.companyId
✅ PUT  /api/contacts/:id             → verifyOwnership('contacts', id, req, res)
✅ POST /api/contacts/bulk-delete     → WHERE companyId = ? dans la requete SQL
❌ companyId || 'c1'                  → INTERDIT — renvoyer 400 si manquant
❌ SELECT * FROM contacts WHERE id=?  → INTERDIT sans check companyId
```

### Tables sans companyId (exceptions)

**Vraies tables GLOBAL (control tower Phase 1 multi-tenant) :**
- `companies` — catalogue maitre (control tower)
- `sessions` — tokens auth (contiennent companyId mais restent globaux car lookup par token)
- `supra_admins` — comptes plateforme
- `phone_plans`, `voip_packs`, `sms_packs` — catalogues globaux
- `wa_verifications` — OTP WhatsApp indexe sur numero de telephone (cross-tenant par nature, un meme numero peut verifier plusieurs comptes)

**Tables TENANT INDIRECTES (pas de companyId mais scope tenant via parent)** — rattachement documente dans `server/db/tenantSchema.js` (`INDIRECT_TENANT_TABLES`) :

| Table | FK | Parent | Profondeur |
|---|---|---|---|
| `availabilities` | `collaboratorId` | `collaborators` | 1-hop |
| `bookings` | `calendarId` | `calendars` | 1-hop (critique) |
| `google_events` | `collaboratorId` | `collaborators` | 1-hop |
| `role_permissions` | `roleId` | `roles` | 1-hop |
| `ticket_messages` | `ticketId` | `tickets` | 1-hop |
| `reminder_logs` | `bookingId` | `bookings` → `calendars` | 2-hop |

**Regle absolue** : Toute nouvelle table doit declarer explicitement son scope : direct (companyId), indirect (ajouter dans INDIRECT_TENANT_TABLES), ou global (ajouter dans GLOBAL_TABLES). Le moteur de migration rejette toute table non classifiee via `note: 'no_companyId_and_not_indirect'` dans le report. Zero perte silencieuse.

### Tables STUB — FK declarees vers un parent GLOBAL

Certaines tables GLOBAL sont referencees par une `FOREIGN KEY` declaree (cassante) depuis une table tenant. Exemple : `collaborators.companyId REFERENCES companies(id)`. Si `companies` est absente de la tenant DB, `PRAGMA foreign_key_check` leve des violations en masse post-copie.

Solution : `TENANT_STUB_TABLES` (dans `server/db/tenantSchema.js`). Pour chaque stub :
- la STRUCTURE est repliquee dans la tenant DB (meme `CREATE TABLE` que la source)
- UNE SEULE ligne est seedee : celle qui correspond au tenant (ex: `SELECT * FROM companies WHERE id = :companyId`)
- zero fuite cross-tenant car filtrage par id
- les FK declarees sont satisfaites

Scan 2026-04-16 : seule `companies` est concernee. Scope a re-evaluer lors de l'ajout d'une nouvelle GLOBAL_TABLE referencee par une FK declaree.

### Orphelins FK implicites — placeholder `__deleted__`

**Probleme** : les FK nommees par convention (`xxxId` sans `FOREIGN KEY ... REFERENCES`) ne sont pas vues par `PRAGMA foreign_key_check`. Les contacts supprimes dans la monolithe laissent des references orphelines dans `call_logs`, `pipeline_history`, `notifications`, etc.

**Regle** : JAMAIS supprimer ces donnees (trace metier, RGPD, audit). Strategie de remap :
1. Detection via `validateOrphanFks(tenantDb)` qui scanne `IMPLICIT_FKS` (server/db/tenantSchema.js)
2. Si orphans detectes pour `parent = contacts` : insertion d'une ligne placeholder avec `id = '__deleted__'`, `companyId = tenantId`, `name = '[Contact supprime]'`
3. `UPDATE` generique : toutes les refs orphelines sont remappees vers `'__deleted__'`
4. `diffCounts` soustrait la ligne placeholder pour conserver la parite source/tenant

Implemente dans `remapOrphansForParent()` (server/services/tenantMigration.js). Generique : peut s'appliquer a n'importe quel parent en ajoutant une entree dans la constante `REMAP_PARENTS` du meme fichier. Idempotent : 2e appel = no-op.

**Parents remap-managed (2026-04-16 v3)** :

| Parent | Placeholder id | Nom placeholder | Decouvert via |
|---|---|---|---|
| `contacts` | `__deleted__` | `[Contact supprime]` | Dry-run VPS (call_logs, pipeline_history, notifications, sms_messages, conversations) |
| `collaborators` | `__deleted_collab__` | `[Collaborateur supprime]` | Dry-run MON BILAN (collab_heartbeat) |

Regle d'extension : si un futur dry-run remonte un orphan vers un parent non couvert (ex: `calendars`, `roles`), ajouter une entree `{ parent, placeholderId, extras }` dans `REMAP_PARENTS`. Le flow applique automatiquement detection + placeholder + remap + diff adjustment. Aucun autre changement requis.

### Contrat de forme du report de migration (v4)

Tout call a `migrateCompany()` DOIT retourner un objet avec AU MINIMUM :

| Champ | Type | Garantie |
|---|---|---|
| `ok` | boolean | toujours present |
| `dryRun` | boolean | toujours present |
| `companyId` | string | toujours present |
| `companyName` | string \| null | toujours present (null accepte si sanity echoue avant) |
| `companySlug` | string \| null | toujours present |
| `tenantDbPath` | string \| null | toujours present |
| `sizeBytes` | number | toujours present (0 si echec avant creation) |
| `elapsedMs` | number | toujours present (delta depuis `startedAt`) |
| `currentStep` | string | toujours present (derniere etape avant retour) |
| `error` | string \| undefined | present si `ok=false` |
| `stack` | string \| null | present si `ok=false` et exception capturee |
| `schema/stubs/copy/remap/fk/orphans/diff/mismatches` | object \| null | present meme a null |
| `commit` | `{ attempted, ok, storagePath?, error?, reason? }` \| undefined | present si passage par la phase commit |

Tout `return { ok: false, ... }` non conforme est interdit. Utiliser le helper `buildErrorReport()` (tetoile de `tenantMigration.js`) pour garantir le contrat — il ne faut JAMAIS retourner un objet d'erreur construit a la main.

Tout consumer (CLI, test, API) DOIT imprimer `report.error`, `report.stack`, `report.currentStep` des que `!report.ok`. Ne jamais se contenter d'un `if (report.ok) { ... } else { process.exit(1) }` silencieux.

### Codes d'erreur du moteur de migration

| Code | Signification | Action |
|---|---|---|
| `COMPANY_NOT_FOUND` | companyId absent de la source DB | verifier `SOURCE_DB_PATH` + id |
| `SANITY_QUERY_FAILED` | SELECT companies throw | DB source corrompue ou inaccessible |
| `TENANT_PATH_RESOLUTION_FAILED` | `mkdirSync(TENANTS_DIR)` throw | permissions / `TENANTS_DIR` invalide |
| `CONTROL_TOWER_LOOKUP_FAILED` | CT inaccessible pendant precheck | schema CT pas init, fichier absent |
| `TENANT_ALREADY_COMMITTED` | companyId deja dans `tenant_databases` | exit code 3 — `--rollback` puis retry |
| `OPEN_TENANT_DB_FAILED` | better-sqlite3 ne peut pas ouvrir le fichier | disque plein, permissions, fichier corrompu |
| `MIGRATION_STEP_FAILED[<step>]` | exception pendant schema/copy/remap/fk/diff | lire la stack, identifier la table/FK en cause |
| `COMMIT_WRITE_FAILED[<step>]` | migration ok mais INSERT CT throw | schema CT incomplet, lock, quota |

### Regle `--dry-run` → `--commit` sur meme TENANTS_DIR

Le flow attendu est : `--dry-run` cree la tenant DB pour inspection ; `--commit` reutilise la meme tenant DB OU la recree depuis zero. Le pre-existing artifact check (v4) croise `existsSync(tenantDbPath)` avec `tenant_databases` :
- Si `tenant_databases` contient le companyId ET `--commit` → refus `TENANT_ALREADY_COMMITTED`.
- Sinon → cleanup automatique du fichier leftover et migration propre.

Aucune intervention manuelle `rm tenant.db` n'est necessaire pour passer d'un dry-run a un commit.

### STEP 5 Phase 5A — Shadow mode : feature flag par route

Le lifecycle `companies.tenantMode` accepte desormais 3 valeurs : `legacy` | `shadow` | `tenant`. La colonne `companies.tenantFeatures` (JSON) permet d'override le mode par feature sans toucher au mode global.

**Resolution (via `getRouteMode(companyId, feature)`)** :
1. Si `tenantMode === 'legacy'` → `'legacy'` (kill-switch global, override toute feature)
2. Sinon, si `tenantFeatures[feature]` est dans `['legacy','shadow','tenant']` → ce mode
3. Sinon → `tenantMode` (fallback)
4. Si companyId inconnu / erreur → `'legacy'` (fail-closed vers comportement actuel)

**Regles non-negociables du shadow mode** :
- Monolithe reste TOUJOURS la source de verite pendant la phase shadow. `shadowCompare()` renvoie toujours le resultat monolithe, jamais le tenant.
- Si le fetch tenant throw : swallow + log dans `tenant_shadow_diffs` (avec `tenantError` populated), monolithe renvoyee sans bruit cote caller.
- Un `INSERT` dans `tenant_shadow_diffs` est fait UNIQUEMENT en cas de mismatch ou de tenant error. Les matches n'ecrivent rien (table reste compacte).
- Les hashes sont calcules via `stableStringify()` (tri recursif des cles) : l'ordre de colonnes entre 2 SELECT ne doit JAMAIS generer un faux diff.
- `payloadSample` est borne a ~2000 chars + arrays tronques aux 5 premiers items. Jamais stocker un payload complet dans la CT.
- Toute erreur DANS la machinerie shadow (hash, INSERT CT) est swallowed : la prod ne doit JAMAIS casser a cause de shadow.

**Regle de cutover par route** :
1. Une route ne peut passer en `shadow` qu'apres tenant DB committee (`tenant_databases` row presente).
2. Une route ne peut passer en `tenant` qu'apres au moins 48h en `shadow` avec 0 diff persiste sur cette (company, feature).
3. Les WRITES ne suivent JAMAIS la meme bascule que les READS : elles attendent une phase dediee (STEP 5E).
4. Rollback instantane : `UPDATE companies SET tenantMode = 'legacy' WHERE id = ?` puis `invalidateTenant(id)`. Tout revient a la monolithe en < 5 sec.

**Endpoints admin (requireSupra)** :
- `GET /api/tenant-admin/shadow-diffs?companyId=&feature=&limit=&offset=` — liste paginee des diffs
- `GET /api/tenant-admin/shadow-diffs/summary?hours=24` — agregat par (companyId, feature) sur fenetre
- `GET /api/tenant-admin/mode/:companyId` — lit l'etat de routing d'une company

---

## 2. Pipeline CRM — Source de verite unique

### Les 7 stages par defaut

```javascript
const DEFAULT_STAGES = [
  { id: 'nouveau',         label: 'Nouveau',          color: '#6366f1' },
  { id: 'contacte',        label: 'Contacte',         color: '#f59e0b' },
  { id: 'qualifie',        label: 'Qualifie',         color: '#3b82f6' },
  { id: 'proposition',     label: 'Proposition',      color: '#8b5cf6' },
  { id: 'negociation',     label: 'Negociation',      color: '#ec4899' },
  { id: 'client_valide',   label: 'Client Valide',    color: '#10b981' },
  { id: 'perdu',           label: 'Perdu',             color: '#ef4444' },
];
```

### Regles

1. **UNE SEULE source** : `pipeline_stages` table (par company) + DEFAULT_STAGES en fallback
2. **JAMAIS** definir une autre liste de stages ailleurs dans le code
3. Les stages custom d'une company se mergent avec les defaults
4. La fiche contact utilise `pipeline_stage` (string = stage id)
5. Chaque changement de stage → INSERT dans `pipeline_history`
6. AdminDash recoit `pipelineStages` en prop pour merger custom + default

### Isolation des donnees pipeline (ajout 2026-03-27)

**Pipeline stages** = niveau company (partages entre tous les collabs de la company).

**Donnees pipeline (contacts, historique)** = niveau collaborateur (isoles par collab).

| Qui | Ce qu'il voit |
|-----|--------------|
| **Collaborateur** | Uniquement les contacts ou `assignedTo = son_id` OU `shared_with` contient son id |
| **Admin** | Tous les contacts de SA company |
| **Supra** | Bypass total — toutes les companies |

**Regles backend obligatoires pour toute route pipeline_history :**
- `GET /pipeline-history` : filtrer les contacts par `assignedTo` ou `shared_with` pour les non-admin (JOIN avec `contacts` table)
- `POST /pipeline-history` : meme verification d'appartenance + permission `pipeline.manage` (pas `pipeline.view`)
- Pattern safe pour les contacts supprimes : `if (!ct ||` → jamais `if (ct &&` (ce dernier bypass silencieusement le check si le contact est absent)
- `GET /pipeline-history?companyId=X&collabId=Y` : filtre par les contacts du collaborateur, pas juste par companyId

### Tables

| Table | Role |
|-------|------|
| `pipeline_stages` | Stages custom par company (id, companyId, label, color, position) |
| `pipeline_history` | Historique des transitions (contactId, fromStage, toStage, userId, note) |
| `contacts.pipeline_stage` | Stage actuel du contact |

---

## 3. Leads — Flux complet

### Flux d'import

```
Source (CSV / Google Sheet / Manuel)
  → leadImportEngine.js (parseCSV / autoDetectMapping / checkDuplicate)
    → incoming_leads (status: 'new')
      → Enveloppe (lead_envelopes) — batch logique
        → Dispatch (lead_dispatch_rules) — repartition par collaborateur
          → lead_assignments — affectation finale
            → contact_id → lien avec contacts CRM
```

### Deduplication

- Verification email ET phone (pas juste email)
- Fonction partagee `checkDuplicate()` dans `leadImportEngine.js`
- Utilisee par import CSV ET import Google Sheet (meme logique)
- Colonne `duplicate_of` dans `incoming_leads` pour tracer

### Google Sheet Sync

- `sync_mode`: 'manual' | 'auto' (cron)
- `sync_interval`: minutes entre syncs
- `last_row_count`: pour detecter les nouvelles lignes
- Sync incremental (ne reimporte pas les lignes deja traitees)

### Anti-triche appels

- `is_valid_call` + `invalid_reason` dans `call_logs`
- Validation : duree minimum, pas de numero interne, pas de boucle
- Les appels invalides ne comptent pas dans les scores

### Tables leads (8)

| Table | Role |
|-------|------|
| `lead_sources` | Sources configurees (CSV, GSheet, API) |
| `incoming_leads` | Leads bruts importes |
| `lead_envelopes` | Lots/batches de leads |
| `lead_dispatch_rules` | Regles de repartition (% par collab) |
| `lead_assignments` | Affectations lead → collab |
| `lead_distribution_scores` | Scores IA de distribution |
| `lead_import_logs` | Historique des imports |
| `lead_history` | Historique des actions sur les leads |

---

## 4. VoIP — Pipeline complet

### Flux d'appel sortant

```
Frontend (Btn "Appeler")
  → POST /api/voip/token (Twilio Access Token)
  → Twilio Voice SDK (browser → Twilio)
  → POST /api/voip/twiml/outbound (TwiML generation)
    ├── Compliance check (horaires FR, consentement)
    ├── Record: record-from-answer-dual
    └── Media Stream: wss://${APP_DOMAIN}/media-stream
        → WebSocket handler (index.js:493-581)
          ├── liveTranscription.js (Deepgram STT)
          │   ├── Segments speaker: collab/contact
          │   ├── Forbidden words LIVE check
          │   │   └── INSERT call_live_flags + SSE broadcast
          │   └── SSE → frontend (event: transcript, interim, forbidden_word)
          └── liveAnalysis.js (GPT-4o-mini toutes les 15s)
              └── SSE → frontend (event: analysis)
  → POST /api/voip/status (status callback)
    ├── UPDATE call_logs (status, duration, recording)
    ├── Conversation threading
    ├── user_activity_logs
    └── Si completed → post-call analysis:
        ├── secureIaPhone.js (Whisper → mots interdits)
        ├── aiCopilot.js (resume, scores, actions, coaching)
        └── INSERT ai_copilot_analyses + secure_ia_alerts
```

### Flux d'appel entrant

```
Twilio → POST /api/voip/twiml/inbound
  → Lookup collaborator par numero
  → TwiML response (ring collab)
  → Meme pipeline que sortant (Media Stream, transcription, etc.)
```

### Services VoIP

| Service | Fichier | Role |
|---------|---------|------|
| Token generation | twilioVoip.js | Twilio Access Token pour SDK browser |
| TwiML generation | twilioVoip.js | Reponses XML pour Twilio |
| Compliance FR | twilioVoip.js | Horaires, consentement, frequence |
| WebSocket handler | index.js | /media-stream — audio Twilio → Deepgram |
| STT live | liveTranscription.js | Deepgram nova-2 temps reel |
| Analyse live | liveAnalysis.js | GPT-4o-mini toutes les 15s |
| Mots interdits live | liveTranscription.js | Detection + call_live_flags + SSE |
| STT post-call | secureIaPhone.js | Whisper (telecharge recording) |
| Analyse post-call | aiCopilot.js | Resume, scores, coaching, CRM autofill |
| SSE streaming | liveTranscription.js | Evenements: transcript, interim, analysis, forbidden_word, end |

### Tables VoIP

| Table | Role |
|-------|------|
| `call_logs` | Journal d'appels (direction, duree, recording, status, is_valid_call) |
| `call_transcripts` | Transcriptions completes (segments_json, fullText) |
| `call_live_flags` | Alertes temps reel (forbidden_word, severity) |
| `call_contexts` | Contexte d'appel (type, objectif, campagne) |
| `recommended_actions` | Actions recommandees post-appel |
| `voip_settings` | Config Twilio par company |
| `voip_credits` | Credits VoIP par company |
| `voip_transactions` | Historique achats/consommation |
| `conversations` | Fils de conversation unifies |
| `conversation_events` | Evenements dans les conversations |

---

## 5. AI Copilot — Flux post-call

### Analyse complete

```
Appel termine
  → aiCopilot.analyzeCall(callLogId)
    → Fetch call_logs + call_transcripts + contacts + knowledge_base
    → GPT-4o-mini prompt (role, objectif, transcript, KB)
    → Resultats:
        ├── summary (resume en 3 phrases)
        ├── sentimentScore (0-100)
        ├── qualityScore (0-100)
        ├── conversionScore (0-100)
        ├── objections_json (objections detectees)
        ├── actionItems_json (actions a faire)
        ├── coachingTips_json (conseils)
        ├── followupType + followupDate
        ├── pipelineStage suggestion
        └── tags_json
    → INSERT ai_copilot_analyses
    → CRM autofill (mise a jour contact)
    → Profile suggestions (amelioration profil IA)
```

### Fonctionnalites additionnelles

| Feature | Route | Description |
|---------|-------|-------------|
| Live Coaching | POST /live-coaching | Coaching pre-appel (Mode Pilote) |
| Script Generation | POST /generate-script | Generation de scripts de vente |
| Objection Database | GET /objections | Base d'objections extraites des appels |
| CRM Autofill | POST /crm-autofill/:id | Remplissage auto du contact |
| Behavior Audit | GET /behavior-audit/:id | Audit comportemental collaborateur |
| KB Synthesis | POST /kb-synthesis | Conversation multi-tour sur la KB |
| Profile History | GET /profile-history/:id | Historique des changements de profil IA |
| Profile Suggestions | GET /profile-suggestions/:id | Suggestions d'amelioration |

---

## 6. Perf Collab — Scoring

### 8 axes de scoring (poids configurables)

| Axe | Source de donnees |
|-----|-------------------|
| `calls` | Nombre d'appels valides (call_logs WHERE is_valid_call=1) |
| `quality` | qualityScore moyen (ai_copilot_analyses) |
| `conversion` | conversionScore moyen (ai_copilot_analyses) |
| `speed` | Temps de reponse leads (lead_assignments → premier appel) |
| `followup` | Taux de suivi NRP (contacts.nrp_followups_json) |
| `goals` | Objectifs atteints (user_goals WHERE status='completed') |
| `discipline` | Regularity + connexion (user_activity_logs) |
| `regularity` | Distribution des appels dans la semaine |

### Auto-bonus / Auto-penalty

- Mots interdits live : -10 par violation (max -100) — source: `call_live_flags`
- Mots interdits post-call : -10 par alerte — source: `secure_ia_alerts`
- Appels invalides : -5 par faux appel — source: `call_logs WHERE is_valid_call=0`
- Regles custom : `perf_score_settings.bonus_rules_json` / `penalty_rules_json`

### Tables perf (4)

| Table | Role |
|-------|------|
| `perf_score_settings` | Poids et regles par company |
| `perf_bonus_penalty_logs` | Historique bonus/penalties |
| `perf_audit_reports` | Rapports d'audit generes |
| `perf_snapshots` | Snapshots periodiques des scores |

---

## 7. Secure IA — Double couche

### Post-call (secureIaPhone.js)
1. Telecharge le recording Twilio
2. Transcription via OpenAI Whisper
3. Comparaison avec `collaborators.secure_ia_words_json`
4. Si mots interdits → INSERT `secure_ia_alerts`
5. Generation de rapports periodiques → `secure_ia_reports`

### Live (liveTranscription.js)
1. Chaque segment final Deepgram → normalisation accent-insensitive
2. Comparaison avec `session._forbiddenWords` (charge au startSession)
3. Si mot interdit → INSERT `call_live_flags` + SSE broadcast `forbidden_word`
4. Admin recoit l'alerte en temps reel

### Complementarite
- Post-call = filet de securite (Whisper plus precis sur audio complet)
- Live = alerte instantanee (permet intervention pendant l'appel)
- Les deux alimentent Perf Collab (auto-penalties)

---

## 8. Notifications — Canaux

| Canal | Service | Usage |
|-------|---------|-------|
| Email | brevoEmail.js | Confirmations, rappels, bienvenue |
| SMS | brevoSms.js | Rappels, confirmations courtes |
| WhatsApp | brevoWhatsapp.js | Messages enrichis |
| Google Chat | googleChat.js | Webhooks equipe |
| SSE | index.js + liveTranscription.js | Temps reel (transcription, flags) |

### Rappels configurables par calendrier
- `confirmEmail`, `confirmSms`, `confirmWhatsapp`
- `reminderEmail`, `reminderSms`, `reminderWhatsapp`
- `customReminders` + `calReminder24h`, `calReminder1h`, `calReminder15min`

---

## 9. Google Calendar

### Flux sync

```
Collaborateur → "Connecter Google"
  → OAuth2 (GOOGLE_CLIENT_ID + SECRET)
    → Tokens stockes dans collaborators.google_tokens_json
      → Sync bidirectionnelle:
          ├── Google → Calendar360 : google_events table
          └── Calendar360 → Google : creation googleEventId + meetLink
```

### Tables

| Table | Role |
|-------|------|
| `google_events` | Evenements importes de Google (pour affichage) |
| `collaborators.google_tokens_json` | Tokens OAuth2 |
| `collaborators.google_email` | Email Google connecte |
| `bookings.googleEventId` | Lien vers l'evenement Google |
| `bookings.meetLink` | Lien Google Meet auto-genere |

---

## 10. Deploy — Procedure

```bash
# 1. Builder le frontend
cd app && npm run build

# 2. Verifier la syntaxe backend
node --check server/index.js
node --check server/db/database.js

# 3. Deployer
./deploy.sh
# → rsync vers VPS (exclut server/db/*.db, node_modules, .env)

# 4. Sur le VPS — verifier les tables
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115
cd /var/www/planora
sqlite3 server/db/calendar360.db ".tables"
# Si nouvelles tables manquantes → les creer manuellement

# 5. Redemarrer PM2
pm2 restart calendar360
pm2 logs calendar360 --lines 50
# Verifier 0 erreurs

# 6. Verifier le site
curl -s https://calendar360.fr | head -5
```

### ATTENTION
- Les `CREATE TABLE IF NOT EXISTS` et `ALTER TABLE` dans database.js sont wrapes dans des try/catch
- Ils peuvent echouer SILENCIEUSEMENT en production
- TOUJOURS verifier manuellement apres deploy

---

## 11. Regles Pipeline Logique (ajout 2026-03-26)

Chaque changement de statut a des regles obligatoires :

| Vers statut | Regle entree | Regle sortie |
|-------------|-------------|--------------|
| **RDV Programme** | Date + heure obligatoire → cree booking agenda → bloque creneaux | Confirmation annulation → supprime booking → libere creneaux |
| **Contacte** | Post-appel obligatoire : popup resultat (RDV/Rappeler/Qualifie/Perdu/Autre) | — |
| **Qualifie** | Note obligatoire : "Pourquoi qualifie ?" | — |
| **Client Valide** | Montant + numero contrat obligatoire | Annulation contrat avec motif |
| **Perdu** | Motif obligatoire (8 motifs pre-definis + champ libre) | — |
| **NRP** | Auto-relances 3/7/14j | NRP x5 sans reponse → propose Perdu |

Regles transversales :
- RDV passe sans action → notification "RDV termine, qualifier le contact ?"
- Contact sans activite >7j → badge rouge "A relancer"
- Contact sans activite >14j → badge rouge fonce
- Contact sans activite >30j → badge "Inactif"

---

## 12. Isolation Donnees Collaborateurs (ajout 2026-03-26, mis a jour 2026-03-27)

**REGLE ABSOLUE** : Chaque collaborateur ne voit QUE ses propres donnees.

- `contacts` filtre par `assignedTo === collabId` dans init.js
- Auto-refresh (30s) filtre aussi par collabId quand `view === 'portal'`
- Sync-batch ne sync que `contacts.filter(c => c.assignedTo === collab.id)`
- Admin voit tout. Collab ne voit que le sien.
- Contacts avec `assignedTo` vide ne sont visibles par personne (sauf admin)
- Pipeline telephone = memes contacts que Mon CRM (meme state `contacts`)
- **Pipeline history** : filtre aussi par assignedTo/shared_with — un collab ne voit que l'historique de SES contacts (voir section 2)

---

## 13. AMD Detection Messagerie (ajout 2026-03-26)

- `machineDetection: 'DetectMessageEnd'` sur les appels sortants Twilio
- Si messagerie detectee :
  1. Joue le message audio personnalise (ou TTS si pas d'audio)
  2. Envoie SMS NRP au prospect
  3. Raccroche automatiquement
- Config dans Parametres collaborateur : toggle + audio URL + texte TTS
- Champs DB : `amd_enabled`, `amd_audio_url`, `amd_tts_text` sur collaborators

---

## 14. Fiche Contact Unifiee (ajout 2026-03-26)

La fiche contact est identique entre Mon CRM (modale) et Telephone (colonne droite).
Onglets : Info & Notes | SMS | RDV | Appels | Partage

- Modification sur l'un → mis a jour sur l'autre (meme state `contacts`)
- Champs editables : nom, email, telephone (inline, sauvegarde auto 800ms)
- Champs personnalises : stockes dans `custom_fields_json` sur contacts
- Notes : textarea avec sauvegarde auto
- Changement d'etape : select deroulant (pas pills multiples)
- Donnees source : affichees depuis `source_data_json`

---

## 15. Anti-Doublons Contacts (ajout 2026-03-26)

**REGLE ABSOLUE** : Avant de creer un contact automatiquement, verifier par EMAIL **ET** par PHONE.

- Auto-creation depuis bookings : verifie email + phone avant INSERT
- Un meme numero de telephone = un seul contact (pas de doublons par phone)
- Si doublon detecte : merger les notes, rattacher les bookings au contact principal
- Les contacts `ct-auto-*` sont crees lors de bookings sans contact existant
- Score de merge : garder le contact avec le plus de donnees (notes, stage, RDV)

### Compteur totalBookings
- Mis a jour a chaque creation/suppression de booking
- Matche par `contactId` OU par `visitorPhone` si contactId manquant

---

## 16. Historique RDV dans Fiche Contact (ajout 2026-03-26)

Dans l'onglet Info de la fiche droite telephone :
- Section "RDV (N)" affichee avant "Changer d'etape"
- Sous-sections "A venir" (vert) et "Passes" (gris)
- Matche par `contactId` ET par `visitorPhone` (pour couvrir les anciens bookings)
- Affiche max 3 RDV passes + compteur "+N anciens"

---

## 17. Theme T.card (ajout 2026-03-26)

**REGLE** : `T.card` doit TOUJOURS etre defini dans le theme.
- Mode clair : `card: "#FFFFFF"` (blanc pur)
- Mode sombre : `card: "#1E1E1E"`
- 119+ endroits utilisent `T.card` — si undefined = fond transparent = bug visuel
- Toutes les modales, cartes, popups, fiches utilisent `T.card`

---

## 18. Regle unique de changement de statut (ajout 2026-03-26)

**REGLE ABSOLUE** : Tout changement de statut d'un contact, quel que soit l'endroit (fiche CRM, pipeline telephone, fiche droite, popup pipeline), DOIT passer par `handlePipelineStageChange()`.

- NE JAMAIS mettre a jour `pipeline_stage` directement via `setSelectedCrmContact`, `setPipelineRightContact`, ou `setPipelinePopupContact`
- `handlePipelineStageChange` gere toutes les regles : modale RDV, motif Perdu, note Qualifie, NRP x5, SMS auto pipeline, etc.
- Le state contact se met a jour via `handleCollabUpdateContact` appele a l'interieur de `handlePipelineStageChange`
- Les prompts/modales dans `handlePipelineStageChange` peuvent faire un `return` → donc pas de mise a jour optimiste du state avant l'appel

---

## 19. Protection Bookings (ajout 2026-03-26)

**REGLE ABSOLUE** : Un booking confirmé ne peut JAMAIS disparaître silencieusement.

Un booking ne peut être supprimé/annulé QUE par :
1. Annulation explicite avec confirmation ("Annuler ce RDV ?")
2. Changement de statut depuis "RDV Programmé" → confirmation annulation
3. Suppression du contact → annule ses bookings
4. Modification de l'heure/date (= annule l'ancien, crée un nouveau)

**Heure RDV** : toujours arrondie aux créneaux de 30 min (select, pas input time libre).

**getBookingAt** : affiche un booking si il CHEVAUCHE le slot (pas juste s'il commence exactement au slot).

---

## 20. Format Telephone FR (ajout 2026-03-26)

**REGLE ABSOLUE** : Tout numero de telephone a 9 chiffres doit etre affiche avec +33 devant.

### Fonctions utilitaires (definies en haut de App.jsx)

- `formatPhoneFR(phone)` : normalise un numero → ajoute +33 si 9 chiffres, convertit 0X en +33X
- `displayPhone(phone)` : affichage lisible → +33612345678 devient "06 12 34 56 78"
- `autoFormatFR(num)` : dans CollabPortal, meme logique pour les appels VoIP

### Ou appliquer
- **PARTOUT** ou un numero est affiche : `{displayPhone(ct.phone)}` au lieu de `{ct.phone}`
- Les appels VoIP passent par `autoFormatFR` automatiquement dans `startPhoneCall`
- Les SMS utilisent `formatPhoneFR` pour normaliser le destinataire

### Regles
- 9 chiffres sans prefixe → +33 devant (ex: 612345678 → +33612345678)
- 10 chiffres avec 0 → +33 sans le 0 (ex: 0612345678 → +33612345678)
- Deja en +33 → garder tel quel
- Format international autre → garder tel quel

---

## 21. Recherche Pipeline Telephone (ajout 2026-03-26)

- Barre de recherche dans le header du pipeline telephone
- State `phonePipeSearch` filtre par nom, email, phone, firstname, lastname
- Se cumule avec le filtre favoris
- Bouton × pour effacer la recherche

---

## 22. Deploy Securise — REGLE CRITIQUE (ajout 2026-03-26)

**JAMAIS `rsync --delete` vers le VPS.** Le 26/03 un `rsync --delete` a efface la DB production.

### Procedure obligatoire
1. **Backup DB** via `db.backup()` (SQLite API, PAS `cp` qui ne copie pas WAL)
2. **Build** : `cd app && npm run build`
3. **Deploy frontend** : `scp -r dist/* root@VPS:/httpdocs/`
4. **Deploy backend** : `rsync -avz` SANS `--delete`, avec exclusion `db/*.db*`
5. **Restart** : `pm2 restart calendar360`

### Interdit absolu
- `rsync --delete` vers le VPS
- `cp` pour backup DB (incompatible WAL)
- Deploy sans backup DB prealable

---

## 23. Modale RDV Globale — REGLE UX (ajout 2026-03-26)

- La modale RDV est rendue au niveau GLOBAL (hors bloc `portalTab === 'phone'`)
- Accessible depuis TOUT onglet sans changer d'onglet
- REGLE : toute modale (RDV, contrat, resultat appel) = `position:fixed` + rendue hors blocs conditionnels

### RDV / Agenda — Regles de reservation
- Un booking bloque tout l'espace temps debut → fin (pas juste le slot de debut)
- Verification conflit : `newStart < bEnd && newEnd > bStart`
- Bookings `cancelled` exclus de l'affichage "A venir"
- Grille : bloc proportionnel a la duree, affiche "14:30 → 15:00 · 30min"
- Un RDV ne disparait QUE si : annulation explicite, changement statut, modification horaire, ou suppression contact

---

## 24. Changement de statut — REGLE UNIQUE (ajout 2026-03-26)

**TOUT changement de statut DOIT passer par `handlePipelineStageChange`**, peu importe d'ou :
- Pipeline telephone
- Fiche CRM modale (pills + select)
- Fiche droite telephone
- Post-appel popup
- Power dialer

Les regles (RDV obligatoire, motif Perdu, note Qualifie) s'appliquent PARTOUT de maniere identique.

---

## 25. Creation Collaborateur — Auto-provisioning (ajout 2026-03-26)

**REGLE** : Chaque nouveau collaborateur recoit automatiquement :

1. **Un calendrier unique** → `Agenda [nom du collab]` dans table `calendars`
2. **Des disponibilites par defaut** → Lun-Ven 9h-12h + 14h-18h, Sam-Dim ferme
3. **Un ID unique** lie a son `companyId`

Implemente dans :
- `collaborators.js` POST → creation par l'admin
- `auth.js` POST /register → inscription directe
- `auth.js` POST /google → inscription Google OAuth

---

## 26. SMS Automatiques par Colonne Pipeline (ajout 2026-03-26)

Chaque collaborateur peut configurer des SMS automatiques par colonne :

| Evenement | Description |
|-----------|-------------|
| **Entree** | SMS envoye quand une fiche ARRIVE dans la colonne |
| **Sortie** | SMS envoye quand une fiche QUITTE la colonne |

- Config stockee dans `localStorage` cle `c360-sms-auto-pipeline-[collabId]`
- Variables dynamiques : `{nom}`, `{prenom}`, `{date_rdv}`, `{heure_rdv}`
- Trames pre-remplies par defaut pour chaque colonne (activables en 1 clic)
- Declenchement dans `handlePipelineStageChange` (verifie old stage sortie + new stage entree)

---

## 27. Backup Complet — Procedure (ajout 2026-03-26)

### Bouton Supra Admin "Backup COMPLET"
Cree un `.tar.gz` contenant :
- DB SQLite (via `db.backup()` — safe pour WAL)
- Tout le code source (server/, app/src/, app/dist/)
- Config (.env, ecosystem.config.cjs, deploy.sh, .htaccess)
- Docs de reference (SOURCE_OF_TRUTH.md, PROJECT_MEMORY.md, ARCHITECTURE_MAP.md, CLAUDE.md)
- Script `setup-server.sh` pour restauration sur VPS vierge

### Bouton "SET COMPLET"
Ajoute en plus : script d'installation Node.js, PM2, Nginx config, SSL auto.

### Restauration
```bash
tar -xzf calendar360-FULL-XXXX.tar.gz
cd planora && chmod +x setup-server.sh
./setup-server.sh  # Installe tout + demarre l'app
```

---

## 28. Taux de Remplissage Agenda (ajout 2026-03-26)

Affiche en haut de l'agenda collaborateur :
- Barre de progression coloree (vert < 50%, orange 50-80%, rouge > 80%)
- Texte : "X/Y creneaux pris · Z% rempli cette [vue]"
- Calcul : creneaux occupes / creneaux disponibles sur la periode affichee
- Source : `availabilities.schedule_json` (creneaux dispo) + `bookings` (creneaux pris)
- Exclut les creneaux passes (avant maintenant)

---

## 29. Power Dialer (ajout 2026-03-26)

- Ring timeout configurable dans Parametres (5-60 sec, defaut 15)
- Stocke dans `localStorage` cle `c360-pd-ring-timeout-[collabId]`
- Utilise `voipStateRef` (ref mirror) pour eviter les closures stale
- Bouton Stop visible pendant le dialing
- Surligne la carte en cours d'appel dans le pipeline

---

## N. Regle critique — Scope cross-composants dans le monolithe App.jsx

### Principe
`app/src/App.jsx` est un monolithe (~39.5k lignes) contenant plusieurs composants React avec des `useState` locaux. Une variable declaree dans CollabPortal (lignes 673-19663) n'existe PAS dans AdminDash (19664-35474) ni au scope App-level (>35474), meme si le code semble "proche" dans le meme fichier.

### Regles strictes

```
❌ pipelineRightContact?.id === id                  → ReferenceError si non declaree dans ce scope
❌ setCsvImportModal({...})                          → ReferenceError si setter non declare
✅ typeof x !== 'undefined' && x && x.id === id     → protection correcte
✅ typeof setX === 'function' && setX({...})         → protection correcte pour setter-only
```

**`?.` (optional chaining) NE PROTEGE PAS contre un ReferenceError** : il court-circuite une valeur `null`/`undefined`, pas un identifiant non declare. Seul `typeof x !== 'undefined'` le fait.

### Pattern standard (guard cross-scope)
```js
if (typeof X !== 'undefined' && X && X.id === id && typeof setX === 'function') {
  setX(p => p ? {...p, ...updates} : p);
}
```
Pour un setter sans reading du state :
```js
if (typeof setX === 'function') { setX({...}); } else { console.warn('[CTX] setX unavailable in this scope'); }
```

### Methodologie d'audit avant fix cross-scope
1. Delimiter les scopes composants (grep `^const <Name> = \|^function <Name>(`)
2. Extraire toutes les `const [x, setX] = useState(...)` par scope
3. Cross-reference : chercher `\bx\b` et `\bsetX\b` dans les scopes externes
4. Filtrer les redeclarations du meme nom dans le scope cible
5. Filtrer les lignes deja gardees par `typeof x`
6. Examiner manuellement les faux positifs : property access (`obj.x`), commentaires, parametres de closure, code dans `{false && ...}` DEAD CODE
7. Verrouiller la liste exhaustive AVANT patch — jamais fix variable par variable au hasard
8. Appliquer en lot groupe, puis re-verifier par grep que chaque ligne cible est bien guardee

---

## REGLE META — Auto-mise a jour des fichiers de reference

**A CHAQUE sauvegarde ou fin de session, les 3 fichiers suivants DOIVENT etre mis a jour :**

1. `SOURCE_OF_TRUTH.md` — Regles metier, logique, securite
2. `PROJECT_MEMORY.md` — Modules, stack, etat du projet
3. `ARCHITECTURE_MAP.md` — Tables, routes, structure

**Toute nouvelle regle implementee doit etre ajoutee dans SOURCE_OF_TRUTH.md AVANT le commit.**
**Toute nouvelle table/route doit etre ajoutee dans ARCHITECTURE_MAP.md AVANT le commit.**
**Ne JAMAIS supprimer une regle existante sans autorisation explicite de l'utilisateur.**

---

## REGLES MULTI-TENANT — Shadow mode (STEP 5 Phase 5B)

### Routage par feature flag — invariants
1. **Kill-switch legacy global** : si `companies.tenantMode = 'legacy'`, `getRouteMode()` renvoie TOUJOURS `'legacy'`, peu importe `tenantFeatures`. Un flip d'urgence a `legacy` redonne IMMEDIATEMENT la prod intacte apres `pm2 restart` (metaCache busted).
2. **Fail-closed** : tout `companyId` inconnu, toute erreur de resolution → `getRouteMode()` renvoie `'legacy'`. Jamais de shadow/tenant implicite.
3. **Cache metadata 10 min** : apres tout flip SQL sur `tenant_databases` ou `companies.tenantMode/tenantFeatures`, il FAUT invalider. Options : `invalidateTenant(companyId)` via un admin endpoint, OU `pm2 restart calendar360` (cache in-memory detruit).

### Shadow mode — invariants non negociables
1. **Monolith = source de verite UNIQUE** tant qu'aucune company n'est en `tenantMode='tenant'`. Aucune donnee n'est JAMAIS lue depuis la tenant DB pour le client final.
2. **fetchTenant est en try/swallow** : toute erreur tenant (DB absente, schema drift, requete qui throw) est capturee par `shadowCompare`, loggee dans `tenant_shadow_diffs` en CT, JAMAIS propagee au client.
3. **Monolith throw = propage** (comportement legacy preserve). Pas de masquage d'erreur serveur par la machinerie shadow.
4. **fetchTenant DOIT produire la meme shape que fetchMonolith** : memes cles, meme type (string vs parsed JSON), meme transformation (`parseRows` si applicable). Sinon faux positif de diff systematique.
5. **Exclure `id = '__deleted__'`** (contacts) et `id = '__deleted_collab__'` (collaborators) dans TOUT `fetchTenant`. Ces placeholders sont inseres par le remap d'orphelins de `tenantMigration.js` et n'ont PAS d'equivalent monolith.
6. **Pas de sort implicite** : si le SELECT monolith n'a pas de `ORDER BY`, le SELECT tenant ne doit pas en avoir non plus. Si faux positifs sur hash apparaissent avec `rowCount` egal, ajouter `ORDER BY id` AUX DEUX fetchs simultanement (jamais un seul cote).
7. **payloadSample borne** (~2000 chars, arrays tronques 5 rows) — deja applique par `shadowCompare`. Ne pas retirer.

### Procedure de flip d'une company en shadow (pilote)
1. Backup CT + monolith avant toute modification.
2. Verifier que la feature est cablee a `shadowCompare` dans le code (deploy fait, `pm2 status` OK).
3. Smoke `GET /api/tenant-admin/mode/<id>` → attendu `tenantMode: 'legacy'`.
4. SQL en direct sur la VRAIE CT prod : `UPDATE companies SET tenantMode='shadow', tenantFeatures='{"<feature>":"shadow"}' WHERE id = '<id>';`.
5. `pm2 restart calendar360` (invalide metaCache).
6. Smoke `GET /api/tenant-admin/mode/<id>` → attendu `tenantMode: 'shadow'`.
7. Smoke metier (ex: `GET /api/data/contacts`) → shape monolith OK, aucune erreur cliente.
8. Observer `GET /api/tenant-admin/shadow-diffs/summary?hours=24` sur 24-48h. Zero diff = feature validee.
9. Rollback instantane si probleme : `UPDATE companies SET tenantMode='legacy', tenantFeatures='{}' WHERE id = '<id>';` + `pm2 restart`.

### Ordre du pilote (decide 2026-04-16)
1. Feature `contacts` sur CAPFINANCES (`c1776169036725`) — 48h.
2. Si 0 diff → CAPFINANCES.contacts OK → MON BILAN (`c1772832020988`) — 48h.
3. Si 0 diff → elargir a une autre feature (choix ulterieur).

### Rappel securite — placeholder tenant fantome (audit 2026-04-16)
- `Cabinet Dupont & Associes` / `dupont-associes.calendar360.fr` affiche au login supra = **placeholder frontend hardcode**. N'existe PAS en DB, ne representate PAS un tenant reel.
- Origine : `app/src/App.jsx` lignes 184, 186-191, 245-251 + `useState(COMPANIES[0])` ligne 39107.
- Risque : confusion UX du supra admin + mots de passe de demo en clair dans le bundle JS (`mdupont2026`, etc.).
- Non-regression : lors de tout test shadow/tenant sur CAPFINANCES ou MON BILAN, verifier que la sidebar affiche la VRAIE company (pas Dupont). Si elle reste sur Dupont, le supra doit forcer via Vision → Connecter.
- Correctif P0 minimal : `useState(null)` au lieu de `useState(COMPANIES[0])` + redirect Vision si supra sans company.
