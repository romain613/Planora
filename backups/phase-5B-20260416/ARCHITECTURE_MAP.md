# ARCHITECTURE_MAP.md — Calendar360 / PLANORA

> Cartographie technique complete. 93 tables, 33 routers, 12 services.
> Derniere mise a jour : 2026-04-16 — Multi-tenant STEP 4 moteur de migration durci. Scan complet : 93 tables, 46 FK declarees, 127 FK implicites. Classification tenant : 80 directes (companyId), 6 indirectes (INDIRECT_TENANT_TABLES), 7 globales (control tower).

---

## 1. Base de donnees — 77 tables SQLite

### Configuration globale
- **Engine** : better-sqlite3 (synchrone, pas de pool)
- **Mode** : WAL (Write-Ahead Logging) pour lectures concurrentes
- **Foreign keys** : actives
- **JSON fields** : 100+ champs JSON (parse/stringify automatique)
- **Fichier** : `server/db/database.js`

### Tables par domaine

#### Core Business (5)

| Table | Cles | Role |
|-------|------|------|
| `companies` | id (PK) | Entreprises (tenants) |
| `collaborators` | id (PK), companyId (FK) | Utilisateurs (40+ colonnes avec profil IA) |
| `calendars` | id (PK), companyId (FK) | Agendas configurables |
| `bookings` | id (PK), calendarId (FK), companyId | Rendez-vous |
| `availabilities` | collaboratorId (PK) | Disponibilites (schedule_json) |

#### CRM & Pipeline (4)

| Table | Cles | Role |
|-------|------|------|
| `contacts` | id (PK), companyId | Fiches contacts (30+ colonnes) |
| `pipeline_stages` | id (PK), companyId | Stages custom par company |
| `pipeline_history` | id (PK), contactId | Historique transitions de stage |
| `activity_logs` | id (PK), companyId | Journal d'activite |

#### VoIP & Telephonie (10 + 2 call forms)

| Table | Cles | Role |
|-------|------|------|
| `call_logs` | id (PK), companyId | Journal d'appels Twilio |
| `call_transcripts` | id (PK), callLogId (FK) | Transcriptions completes |
| `call_live_flags` | id (PK), callSid | Alertes mots interdits live |
| `call_contexts` | id (PK), callLogId | Contexte d'appel (type, objectif) |
| `recommended_actions` | id (PK), callLogId | Actions recommandees |
| `voip_settings` | companyId (PK) | Config Twilio par company |
| `voip_credits` | companyId (PK) | Credits VoIP |
| `voip_transactions` | id (PK), companyId | Historique transactions VoIP |
| `conversations` | id (PK), companyId | Fils unifies (appels+SMS+notes) |
| `conversation_events` | id (PK), conversationId (FK) | Evenements dans les conversations |
| `call_forms` | id (PK), companyId | Formulaires appel (name, description, fields_json, assignedCollabs_json, active) |
| `call_form_responses` | id (PK), formId (FK), contactId, collabId, companyId | Reponses formulaires appel (responses_json, createdAt) |

#### Marketplace Numeros (4)

| Table | Cles | Role |
|-------|------|------|
| `phone_numbers` | id (PK), phoneNumber (UNIQUE) | Numeros Twilio |
| `phone_plans` | id (PK) | Plans tarifaires numeros |
| `phone_transactions` | id (PK), companyId (FK) | Transactions numeros |
| `voip_packs` | id (PK) | Packs minutes VoIP |

#### AI Copilot (4)

| Table | Cles | Role |
|-------|------|------|
| `ai_copilot_analyses` | id (PK), callLogId | Analyses post-call |
| `ai_copilot_reactions` | id (PK), companyId | Reactions aux suggestions |
| `ai_profile_history` | id (PK), collaboratorId (FK) | Historique profil IA |
| `ai_profile_suggestions` | id (PK), collaboratorId (FK) | Suggestions d'amelioration |

#### Knowledge Base (5)

| Table | Cles | Role |
|-------|------|------|
| `company_knowledge_base` | id (PK), companyId (UNIQUE) | Config KB principale |
| `company_products` | id (PK), companyId (FK) | Produits/services |
| `company_scripts` | id (PK), companyId (FK) | Scripts de vente |
| `company_email_templates` | id (PK), companyId (FK) | Templates email |
| `company_sms_templates` | id (PK), companyId (FK) | Templates SMS |
| `company_documents` | id (PK), companyId (FK) | Documents/liens |

#### Secure IA (2)

| Table | Cles | Role |
|-------|------|------|
| `secure_ia_alerts` | id (PK), collaboratorId (FK) | Alertes mots interdits post-call |
| `secure_ia_reports` | id (PK), collaboratorId (FK) | Rapports periodiques |

#### Leads Management (8)

| Table | Cles | Role |
|-------|------|------|
| `lead_sources` | id (PK), companyId | Sources configurees |
| `incoming_leads` | id (PK), companyId | Leads bruts importes |
| `lead_envelopes` | id (PK), companyId | Lots/batches |
| `lead_dispatch_rules` | id (PK), envelope_id (FK) | Regles de repartition |
| `lead_assignments` | id (PK), companyId | Affectations lead → collab |
| `lead_distribution_scores` | id (PK), collaborator_id (FK) | Scores IA distribution |
| `lead_import_logs` | id (PK), companyId | Historique imports |
| `lead_history` | id (PK), companyId | Actions sur les leads |

#### Goals & Gamification (3)

| Table | Cles | Role |
|-------|------|------|
| `user_goals` | id (PK), collaborator_id (FK) | Objectifs individuels |
| `team_goals` | id (PK), companyId | Objectifs equipe |
| `goal_rewards` | id (PK), goal_id | Rewards gagnes |

#### Performance Collab (4)

| Table | Cles | Role |
|-------|------|------|
| `perf_score_settings` | id (PK), companyId (UNIQUE) | Poids et regles |
| `perf_bonus_penalty_logs` | id (PK), companyId | Historique bonus/penalties |
| `perf_audit_reports` | id (PK), companyId | Rapports d'audit |
| `perf_snapshots` | id (PK), companyId | Snapshots periodiques |

#### SMS & Credits (4)

| Table | Cles | Role |
|-------|------|------|
| `sms_credits` | companyId (PK) | Credits SMS |
| `sms_transactions` | id (PK), companyId | Transactions SMS |
| `sms_messages` | id (PK), companyId, collabId | Messages SMS (toNumber, fromNumber, content, direction, status, createdAt) |
| `sms_packs` | id (PK) | Packs SMS disponibles |

#### Telecom Credits (2)

| Table | Cles | Role |
|-------|------|------|
| `telecom_credits` | companyId (PK) | Balance credits telecom |
| `telecom_credit_logs` | id (PK), companyId | Historique mouvements |

#### Forms & Pages (4)

| Table | Cles | Role |
|-------|------|------|
| `forms` | id (PK), companyId (FK) | Formulaires configurables |
| `form_submissions` | id (PK), formId (FK) | Soumissions |
| `pages` | id (PK), companyId (FK) | Pages landing/vente |
| `page_leads` | id (PK), pageId (FK) | Leads captures sur pages |

#### Tables Dynamiques (2)

| Table | Cles | Role |
|-------|------|------|
| `custom_tables` | id (PK), companyId | Tables Airtable-like |
| `custom_rows` | id (PK), tableId | Lignes de donnees |

#### Dispatch IA (1)

| Table | Cles | Role |
|-------|------|------|
| `dispatch_tasks` | id (PK), companyId | Taches dispatch IA |

#### Chat & Messaging (3)

| Table | Cles | Role |
|-------|------|------|
| `chat_messages` | id (PK), companyId | Messages chat interne |
| `collab_heartbeat` | collaboratorId (PK) | Presence en ligne |
| `reminder_logs` | id (PK), bookingId (FK) | Log des rappels envoyes |

#### Support (2)

| Table | Cles | Role |
|-------|------|------|
| `tickets` | id (PK), companyId (FK) | Tickets support |
| `ticket_messages` | id (PK), ticketId (FK) | Messages dans tickets |

#### Workflows & Routing (2)

| Table | Cles | Role |
|-------|------|------|
| `workflows` | id (PK), companyId | Workflows automatises |
| `routings` | id (PK), companyId | Regles de routage |

#### Divers (5)

| Table | Cles | Role |
|-------|------|------|
| `settings` | id (PK), companyId (UNIQUE) | Config globale par company |
| `sessions` | token (PK) | Sessions auth JWT |
| `supra_admins` | email (PK) | Admins plateforme |
| `polls` | id (PK), companyId | Sondages internes |
| `google_events` | id (PK), collaboratorId (FK) | Evenements Google importes |
| `wa_verifications` | id (PK) | Verifications WhatsApp |
| `user_activity_logs` | id (PK), companyId | Logs d'activite utilisateur |

---

## 2. Routes Express — 33 fichiers, 400+ endpoints

### Fichiers de routes

| Fichier | Prefix | Auth | Endpoints |
|---------|--------|------|-----------|
| `auth.js` | /api/auth | Public + Auth | 6 (login, register, google, supra, config, logout) |
| `data.js` | /api/data | requireAuth | ~20 (contacts, workflows, routings, pipeline, polls, activity) — bulk-delete via POST (not DELETE), sync-batch with pipeline_stage PROTECTED |
| `collaborators.js` | /api/collaborators | requireAuth | 5 (CRUD + availability) |
| `companies.js` | /api/companies | requireSupra | 4 (CRUD companies) |
| `calendars.js` | /api/calendars | requireAuth | 6 (CRUD + slug) |
| `bookings.js` | /api/bookings | requireAuth | 4 (CRUD) |
| `voip.js` | /api/voip | requireAuth + Public | ~25 (calls, token, TwiML, live-stream, flags, credits, settings) |
| `leads.js` | /api/leads | requireAuth | ~30 (sources, incoming, import, envelopes, dispatch, stats) |
| `aiCopilot.js` | /api/ai-copilot | requireAuth | ~20 (analyze, coaching, scripts, objections, profile, KB) |
| `secureIa.js` | /api/secure-ia | requireAuth | 8 (stats, alerts, reports, analyze, words) |
| `knowledgeBase.js` | /api/knowledge-base | requireAuth | ~18 (KB, products, scripts, templates, documents) |
| `perfCollab.js` | /api/perf-collab | requireAuth | 8 (dashboard, settings, history, audit, bonus, penalty) |
| `goals.js` | /api/goals | requireAuth | ~12 (user goals, team goals, rewards, progress) |
| `forms.js` | /api/forms | requireAuth + Public | ~10 (CRUD + submit + PDF) |
| `pages.js` | /api/pages | requireAuth + Public | ~9 (CRUD + leads + generate) |
| `tables.js` | /api/tables | requireAuth | ~18 (CRUD + rows + export + import + tasks + dispatch) |
| `marketplace.js` | /api/marketplace | requireAuth | ~25 (numbers, plans, credits, Twilio buy/search) |
| `sms.js` | /api/sms | requireAuth | ~12 (credits, packs, recharge, transactions) |
| `conversations.js` | /api/conversations | requireAuth | 7 (list, detail, events, notes, SMS, migrate) |
| `callContext.js` | /api/call-context | requireAuth | 8 (context, actions, auto-detect) |
| `messaging.js` | /api/messages | requireAuth | 8 (CRUD + DM + reactions + heartbeat) |
| `tickets.js` | /api/tickets | requireAuth | 8 (CRUD + messages + stats) |
| `settings.js` | /api/settings | requireAuth | 2 (GET + PUT) |
| `google.js` | /api/google | requireAuth | 5 (auth-url, callback, status, disconnect, sync) |
| `public.js` | /api/public | Public | 5 (calendar, slots, book — par slug) |
| `manage.js` | /api/manage | Public | 4 (booking par token — cancel, reschedule) |
| `notify.js` | /api/notify | requireAuth | 6 (welcome, confirmed, reminder, reschedule, cancel, noshow) |
| `chat.js` | /api/chat | requireAuth | 2 (test, daily-summary) |
| `analytics.js` | /api/analytics | requireAuth | 1 (GA4) |
| `backup.js` | /api/backup | requireSupra | 3 (list, trigger, download) |
| `verify.js` | /api/verify | requireAuth | 2 (send-wa-code, check-wa-code) |
| `callForms.js` | /api/call-forms | requireAuth | CRUD formulaires appel, /my pour collab, reponses |
| `init.js` | /api/init | requireAuth | 1 (init data) |

---

## 3. Services backend — 12 fichiers

| Service | Fichier | API externe | Role |
|---------|---------|-------------|------|
| AI Copilot | `aiCopilot.js` | OpenAI GPT-4o-mini | Analyse post-call, coaching, scripts, CRM autofill |
| Live Transcription | `liveTranscription.js` | Deepgram | STT temps reel, mots interdits live, SSE |
| Live Analysis | `liveAnalysis.js` | OpenAI GPT-4o-mini | Analyse GPT toutes les 15s pendant l'appel |
| Secure IA Phone | `secureIaPhone.js` | OpenAI Whisper | Transcription post-call, detection mots interdits |
| Twilio VoIP | `twilioVoip.js` | Twilio | Token, TwiML, compliance, recording |
| Lead Import Engine | `leadImportEngine.js` | — | CSV/GSheet parsing, dedup, import |
| Brevo Email | `brevoEmail.js` | Brevo | Envoi emails transactionnels |
| Brevo SMS | `brevoSms.js` | Brevo | Envoi SMS |
| Brevo WhatsApp | `brevoWhatsapp.js` | Brevo | Messages WhatsApp |
| Google Calendar | `googleCalendar.js` | Google Calendar | Sync bidirectionnelle |
| Google Tasks | `googleTasks.js` | Google Tasks | Creation taches de suivi |
| Google Chat | `googleChat.js` | Google Chat | Webhooks notifications equipe |

---

## 4. Frontend — Structure App.jsx

### Layout monolithique

```
App.jsx (~26 000+ lignes)
│
├── Lignes 1-100      : Imports, constantes, theme T, formatPhoneFR(), displayPhone()
├── Lignes 100-540    : Composants UI inline (Card, Btn, Modal, Input, Toggle, etc.)
├── Lignes 540-8159   : CollabPortal (portail collaborateur)
│   ├── Dashboard
│   ├── Agenda / Bookings
│   ├── Contacts CRM (+ Import Photo GPT-4o Vision scan modal)
│   ├── Telephone (Dialer Pro)
│   │   ├── Power Dialer : ~lines 1340-1750 (auto-dialer, ring timeout ref, AMD handling)
│   │   └── Post-call popup : obligatory result selection after calls >10s
│   ├── Unified contact sheet (same component for CRM modal and phone right panel)
│   │   └── Info tab: RDV history (upcoming green + past gray), matched by contactId + visitorPhone
│   ├── Conversations
│   ├── Forms / Pages
│   ├── Tables
│   ├── Leads Manager
│   ├── Goals
│   └── Settings
├── Lignes 8200+      : AdminDash (interface admin)
│   ├── Dashboard admin
│   ├── Collaborateurs
│   ├── Calendriers
│   ├── Pipeline CRM (draggable column headers, localStorage order persistence)
│   ├── AI Copilot
│   ├── Secure IA
│   ├── Knowledge Base
│   ├── Perf Collab
│   ├── Marketplace
│   ├── SMS
│   ├── Tickets
│   ├── Settings
│   └── Supra Admin
└── Lignes finales    : App root, routing, exports
```

### IIFEs conditionnels

Les onglets sont rendus via des IIFEs conditionnels :
```jsx
{activeTab === 'leads' && (() => {
  const [state1, setState1] = useState(...); // 30 hooks pour Leads
  // ... logique complete de l'onglet
  return <div>...</div>;
})()}
```

**REGLE CRITIQUE** : Le nombre de hooks dans chaque IIFE est FIXE. Ne JAMAIS en ajouter/supprimer.

| IIFE | Hooks | Lignes approx |
|------|-------|---------------|
| Leads Manager | 30 useState/useEffect | ~2500 lignes |
| Perf Collab | 9 useState/useEffect | ~530 lignes |
| Phone/Dialer | ~20 hooks | ~1800 lignes |
| Contacts CRM | ~15 hooks | ~1200 lignes |

---

## 5. WebSocket — Media Stream

### Endpoint : `wss://calendar360.fr/media-stream`

```
Handler: index.js lignes 493-581

Twilio Audio (mulaw, 8kHz, mono)
  → ws.on('message')
    → JSON parse
    → switch(msg.event):
        'start'  → liveTranscription.startSession() + connectDeepgram()
        'media'  → liveTranscription.sendAudio(payload, track)
        'stop'   → liveTranscription.endSession() → save transcript to DB
```

### SSE Endpoint : `GET /api/voip/live-stream/:callSid`

Evenements :
- `transcript` — segment final (speaker + text + timestamp)
- `interim` — segment temporaire
- `analysis` — analyse GPT periodique
- `forbidden_word` — mot interdit detecte (word + severity + flagId)
- `utterance_end` — fin de phrase
- `end` — session terminee

---

## 6. Index des 100+ indexes

Les indexes sont organises par domaine dans database.js. Points cles :
- **Bookings** : 6 indexes (date, status, collaborator, contact)
- **Contacts** : 5 indexes (company, email, assigned, stage, next_rdv)
- **Call logs** : 5 indexes (company, contact, twilio, valid)
- **Conversations** : 5 indexes (company, key, collab, activity)
- **Leads** : 15 indexes (company, status, envelope, source, email, phone, dispatched)
- **Performance** : 6 indexes (company, collab, type, period)
- **AI Copilot** : 5 indexes (company, collab, call)
- **Secure IA** : 5 indexes (company, collab, call)
- **Live flags** : 2 indexes (callSid, company+collab)

---

## 7. APIs externes

| API | Cle env | Usage |
|-----|---------|-------|
| Twilio | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY, TWILIO_API_SECRET | Voice, recording, Media Streams |
| Deepgram | DEEPGRAM_API_KEY | Live transcription STT |
| OpenAI | OPENAI_API_KEY | GPT-4o-mini (analyse), Whisper (transcription) |
| Brevo | BREVO_API_KEY | Email, SMS, WhatsApp |
| Google | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | Calendar, Tasks, OAuth2 |

---

## 8. Variables d'environnement (.env)

```
PORT=3001
APP_DOMAIN=calendar360.fr

# Brevo
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=noreply@calendar360.fr
BREVO_SENDER_NAME=Calendar360
BREVO_SMS_SENDER=Calendar360

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_API_KEY=...
TWILIO_API_SECRET=...
TWILIO_TWIML_APP_SID=...
TWILIO_TEST_ACCOUNT_SID=...
TWILIO_TEST_AUTH_TOKEN=...

# Deepgram
DEEPGRAM_API_KEY=...

# OpenAI
OPENAI_API_KEY=...

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://calendar360.fr/auth/google/callback
```

---

## Multi-tenant — Shadow mode (STEP 5)

### Modules
- `server/db/controlTower.js` — ouvre la CT en WAL, env `CONTROL_TOWER_PATH` (defaut `/var/www/planora-data/control_tower.db`).
- `server/db/controlTowerSchema.js` — schema CT : `companies` (avec `tenantMode`, `tenantFeatures`), `tenant_databases`, `sessions`, `supra_admins`, `tenant_shadow_diffs`, `tenant_status_history`. ALTER COLUMN idempotent pour `tenantFeatures`.
- `server/db/tenantResolver.js` — resolution tenant + cache 10 min + feature flag.
  - `resolveTenant(companyId)` → `{id, slug, status, plan, tenantMode, tenantFeatures, dbPath, storagePath, schemaVersion}`
  - `getRouteMode(companyId, feature)` → `'legacy' | 'shadow' | 'tenant'`. Kill-switch legacy, fallback fail-closed.
  - `getTenantDb(companyId)` → handle DB, refuse si `tenantMode !== 'tenant'`.
  - **5B : `getTenantDbForShadow(companyId)`** → handle DB en `shadow` OU `tenant` (refuse `legacy`). Reserve a shadowCompare (erreur swallow).
  - `invalidateTenant(companyId)` → bust cache metadata apres flip.
- `server/db/tenantDbCache.js` — LRU de 50 handles better-sqlite3.
- `server/services/shadowCompare.js` — `{companyId, feature, route, fetchMonolith, fetchTenant}` → renvoie toujours monolith, log diff en CT uniquement si mismatch ou tenant throw. `stableStringify()` tri recursif des cles (evite faux diffs).
- `server/routes/tenantAdmin.js` — endpoints supra : `GET /api/tenant-admin/shadow-diffs`, `GET /shadow-diffs/summary?hours=24`, `GET /mode/:companyId`.
- `server/scripts/migratePilotTenant.js` — CLI `--dry-run | --commit | --rollback | --list` sur une company.
- `server/services/tenantMigration.js` — moteur migration. Placeholder `__deleted__` sur contacts, `__deleted_collab__` sur collaborators (remap orphans).

### Route pilote Phase 5B
- `GET /api/data/contacts` — `async`. En `shadow`, execute `shadowCompare()` avec :
  - `fetchMonolith` = logique legacy EXACTE (2 branches admin/non-admin).
  - `fetchTenant` = meme forme + exclusion `id != '__deleted__'`.
- `parseRows('contacts', rows)` (export added in Phase 5B) est appele sur le payload tenant branche admin pour reproduire la transformation `getByCompany`.

### Feature flag — etats CT (colonnes `companies`)
| tenantMode | tenantFeatures             | Effet sur `/contacts` |
|------------|----------------------------|-----------------------|
| `legacy`   | n'importe quoi             | legacy pur (kill-switch) |
| `shadow`   | `{}`                       | shadow global → toutes routes en shadow |
| `shadow`   | `{"contacts":"shadow"}`    | shadow uniquement sur `/contacts` (pilote 5B) |
| `tenant`   | `{}`                       | tenant global (non utilise avant 5C) |

### Chemins data prod
- Monolith : `/var/www/planora-data/calendar360.db`
- Control tower : `/var/www/planora-data/control_tower.db`
- Tenants : `/var/www/planora-data/tenants/<companyId>.db`
- Storage : `/var/www/planora-data/storage/<companyId>/`

---

## Frontend — Placeholders demo a purger (audit 2026-04-16)

Fixtures hardcodees dans `app/src/App.jsx` (heritage mono-tenant, dangereuses) :
| Ligne  | Constante              | Contenu |
|--------|------------------------|---------|
| 184    | `COMPANIES`            | Cabinet Dupont & Associes (id `c1`) |
| 186-191| `INIT_COLLABS`         | 4 collabs Dupont + **mots de passe en clair** (`mdupont2026`, etc.) |
| 202    | `INIT_AVAILS`          | disponibilites u1-u4 |
| 204-209| `INIT_CALS`            | 4 calendriers Dupont |
| 211-222| `INIT_BOOKINGS`        | 10 RDV fake |
| 223+   | `INIT_WORKFLOWS`/`INIT_ROUTING`/`INIT_POLLS`/`INIT_CONTACTS` | fixtures demo |
| 242    | `COMPANY_SETTINGS`     | blackoutDates fake |
| 245-251| `INIT_ALL_COMPANIES`   | 5 companies fantomes (Dupont + Clinique Saint-Louis + Studio Graphique + Immo Provence + Coach Lyon) |
| 252+   | `INIT_ALL_USERS`       | users fake rattaches aux companies ci-dessus |
| 39107  | `useState(COMPANIES[0])` | state `company` initialise sur Dupont → explique le placeholder en sidebar |
| 36872  | `<div>dupont-associes.calendar360.fr</div>` | hero mockup |

Correctifs prevus :
- P0 : `useState(null)` + redirect Vision pour supra sans company (1 ligne frontend).
- P1 : supprimer toutes les constantes `INIT_*` + `COMPANIES` + `COMPANY_SETTINGS` + reinit states a `[]`/`null`.
- P3 : deplacer `server/seed.js` vers `server/scripts/seedDemo.js` + garde `NODE_ENV==='production'` → refuse.
