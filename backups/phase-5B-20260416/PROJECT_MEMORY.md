# PROJECT_MEMORY.md — Calendar360 / PLANORA

> Fichier de reference pour tout agent IA. A lire en debut de session.
> Derniere mise a jour : 2026-04-16 STEP 5 Phase 5B — Shadow wiring sur GET /api/data/contacts (code deploye dormant, aucune company flip). Exports ajoutes : `parseRows` (database.js), `getTenantDbForShadow` (tenantResolver.js). Route `/contacts` devenue `async` avec branchement mode : legacy inchange, shadow = shadowCompare avec exclusion placeholder `__deleted__`. Procedure deploy + flip SQL CAPFINANCES (puis MON BILAN 48h) documentee dans CONTEXT.md. Audit effectue : le tenant "Cabinet Dupont & Associes" affiche au login supra n'est PAS en DB — c'est un placeholder hardcode dans App.jsx (lignes 184, 186-191, 245-251, useState ligne 39107 sur COMPANIES[0]). Correction P0 prevue : `useState(null)` au lieu de `useState(COMPANIES[0])`.

---

## 1. Identite du projet

| Champ | Valeur |
|-------|--------|
| **Nom public** | Calendar360 |
| **Nom interne** | PLANORA |
| **Domaine** | calendar360.fr |
| **Type** | SaaS B2B multi-entreprise |
| **Cible** | PME avec equipes terrain / commerciales |
| **Objectif** | CRM + Agenda + Telephonie + IA — tout-en-un |

---

## 2. Stack technique

| Couche | Technologie |
|--------|-------------|
| **Frontend** | React 18 SPA — fichier unique `app/src/App.jsx` (~39 500 lignes, monolithe multi-composants : CollabPortal 673-19663, AdminDash 19664-35474, scope App-level >35474) |
| **Backend** | Node.js + Express.js |
| **Base de donnees** | SQLite (better-sqlite3) en mode WAL |
| **Auth** | JWT sessions en table `sessions` + middleware Express |
| **Email** | Brevo (ex-Sendinblue) API |
| **SMS** | Brevo SMS API |
| **WhatsApp** | Brevo WhatsApp API |
| **Telephonie** | Twilio Voice SDK + Media Streams |
| **STT live** | Deepgram (nova-2, francais, mulaw 8kHz) |
| **STT post-call** | OpenAI Whisper |
| **IA analyse** | OpenAI GPT-4o-mini |
| **Calendar sync** | Google Calendar OAuth2 |
| **Deploy** | rsync via deploy.sh → VPS 136.144.204.115 + PM2 |
| **Reverse proxy** | Plesk Nginx (443) → Apache (7081) → Node.js (3001) |
| **Build** | Vite (app/) |

---

## 3. Modules fonctionnels — Statut reel

| # | Module | Status | Fichiers principaux |
|---|--------|--------|---------------------|
| 1 | **Agenda / Bookings** | ✅ Complet | calendars.js, bookings.js, availabilities |
| 2 | **CRM Contacts** | ✅ Complet | data.js (contacts, workflows, routings, polls) |
| 3 | **Pipeline CRM Pro** | ✅ Complet + isolation collab | data.js (pipeline_stages, pipeline_history), NRP auto-relance, isolation par assignedTo/shared_with |
| 4 | **Dialer Pro (Telephone)** | ✅ Complet | voip.js, twilioVoip.js, conversations.js |
| 5 | **Live Transcription** | ✅ Complet | liveTranscription.js, liveAnalysis.js, index.js (WebSocket) |
| 6 | **AI Copilot (post-call)** | ✅ Complet | aiCopilot.js (analyse, coaching, CRM autofill, objections, scripts) |
| 7 | **Secure IA Phone (post-call)** | ✅ Complet | secureIaPhone.js (Whisper → mots interdits) |
| 8 | **Mots interdits LIVE** | ✅ Complet | liveTranscription.js (detection temps reel + SSE + call_live_flags) |
| 9 | **Leads Manager V4** | ✅ Complet | leads.js, leadImportEngine.js (CSV, GSheet, dispatch, scoring) |
| 10 | **Perf Collab** | ✅ Complet | perfCollab.js (scores, leaderboard, bonus/penalty, audit) |
| 11 | **Knowledge Base IA** | ✅ Complet | knowledgeBase.js (produits, scripts, templates, docs) |
| 12 | **Goals / Gamification** | ✅ Complet | goals.js (individuels, equipe, rewards) |
| 13 | **Forms Builder** | ✅ Complet | forms.js (builder, soumissions, PDF export) |
| 14 | **Pages / Landing** | ✅ Complet | pages.js (builder, leads capture, generation IA) |
| 15 | **Tables Dynamiques** | ✅ Complet | tables.js (Airtable-like, export, import, GSheet sync, dispatch IA) |
| 16 | **Marketplace Numeros** | ✅ Complet | marketplace.js (numeros Twilio, plans, credits telecom) |
| 17 | **SMS & Credits** | ✅ Complet | sms.js, brevoSms.js |
| 18 | **Chat Interne** | ✅ Complet | messaging.js, chat.js |
| 19 | **Conversations Unifiees** | ✅ Complet | conversations.js (SMS + appels + notes dans un fil) |
| 20 | **Google Calendar** | ✅ Complet | google.js, googleCalendar.js, googleTasks.js |
| 21 | **Support / Tickets** | ✅ Complet | tickets.js |
| 22 | **Notifications** | ✅ Complet | notify.js (email, SMS, WhatsApp) |
| 23 | **Booking Public** | ✅ Complet | public.js, manage.js (booking + gestion token) |
| 24 | **Supra Admin** | ✅ Complet | companies.js (gestion multi-entreprise) |
| 25 | **Backup** | ✅ Complet | backup.js (liste, trigger, download) |
| 26 | **Analytics** | ✅ Complet | analytics.js (GA4) |
| 27 | **Call Forms** | ✅ Complet | callForms.js (formulaires pendant appels, reponses par contact) |
| 28 | **Power Dialer** | ✅ Complet | App.jsx (auto-dialer colonne par colonne, ring timeout configurable) |
| 29 | **AMD Messagerie** | ✅ Complet | twilioVoip.js (machineDetection, voicemail drop audio/TTS, SMS auto) |
| 30 | **Import Photo IA** | ✅ Complet | App.jsx + index.js (GPT-4o Vision, scan multi-contacts depuis image) |
| 31 | **SMS Auto NRP** | ✅ Complet | App.jsx + sms.js (SMS automatique si appel emis sans reponse) |
| 32 | **🦅 Corpus IA — Auto-archive (Faucon P1)** | ✅ **ACTIF EN PROD** | transcriptArchive.js (service + cron 5min), voip.js (route refactoree), call_transcript_archive |

---

## 🦅 Plan Faucon — Phase 1 SOCLE (active en prod depuis 2026-04-12)

**Objectif** : Construire un corpus de conversations telephoniques reelles pour nourrir une IA commerciale sectorielle. **On ne fait PAS encore d'IA — on construit une base propre, massive, exploitable.**

### Ce qui est live (2026-04-12)
| Composant | Fichier | Statut |
|---|---|---|
| Service d'archivage | `server/services/transcriptArchive.js` | ✅ Pur, reutilisable (route + cron) |
| Route manuelle | `POST /api/voip/archive-transcript/:callLogId` | ✅ Refactoree (176→44 lignes) |
| Cron auto-archive | `server/cron/transcriptArchive.js` | ✅ Tick `*/5 * * * *` + 1er tick T+45s |
| Table corpus | `call_transcript_archive` (26 col + 4 index) | ✅ Existante |

### Contrat du service
```
archiveCallTranscript(callLogId, { force })
  force=true  (route humaine) : ignore filtres status/duration
  force=false (cron)          : skip si status != completed OU duration < 20s
  Retourne { ok, reason?, archiveId, filename, text, segments, hasLive, hasAudio, reused }
```

### Garanties en production
- ✅ **Zero action humaine** requise pour alimenter le corpus
- ✅ Dedup par `callLogId` (UNIQUE)
- ✅ Skip automatique des appels non-completed et < 20s (corpus propre)
- ✅ Ownership check preserve sur la route humaine
- ✅ archiveId pattern : `YYYYMMDD-HHMM-<last9>-<shortId>`
- ✅ Rattrapage historique au 1er tick : 12 appels d'un coup le 2026-04-12

### Objectif M1 (4 semaines a partir du 2026-04-12)
- Atteindre **500 conversations archivees** (actuellement 13)
- **100% des appels > 20s completed avec transcript** archives automatiquement
- Volume reel a generer (etape suivante = faire tourner la plateforme)

### Roadmap Faucon (voir `tasks/PLAN_FAUCON.md`)
- **Phase 1 SOCLE** : ✅ active (auto-archive + fix Deepgram a venir + AI Copilot default + RGPD)
- **Phase 2 ENRICHISSEMENT** : en attente (taxonomie 3 niveaux, outcome, anonymisation)
- **Phase 3 ACTIVATION** : en attente (curation, JSONL, RAG, fine-tuning sectoriel)

---

## 4. Architecture fichiers

```
PLANORA/
├── app/                          # Frontend React (Vite)
│   ├── src/App.jsx               # SPA monolithique (~26k lignes)
│   ├── dist/                     # Build production
│   └── package.json
├── server/
│   ├── index.js                  # Express + WebSocket server
│   ├── db/
│   │   └── database.js           # Schema SQLite (77 tables, 100+ index)
│   ├── routes/                   # 33 fichiers Express Router
│   │   ├── auth.js               # Login, register, Google OAuth
│   │   ├── voip.js               # Twilio calls, streams, live-flags
│   │   ├── leads.js              # Leads manager complet
│   │   ├── perfCollab.js         # Performance collaborateurs
│   │   ├── aiCopilot.js          # IA post-call + coaching
│   │   ├── secureIa.js           # Secure IA routes
│   │   ├── knowledgeBase.js      # Base de connaissances IA
│   │   ├── data.js               # CRM contacts + pipeline + workflows
│   │   ├── tables.js             # Tables dynamiques
│   │   ├── marketplace.js        # Marketplace numeros
│   │   └── ... (23 autres)
│   ├── services/                 # 13 services metier
│   │   ├── aiCopilot.js          # Analyse IA post-call
│   │   ├── liveTranscription.js  # STT Deepgram temps reel
│   │   ├── liveAnalysis.js       # GPT live toutes les 15s
│   │   ├── secureIaPhone.js      # Whisper + mots interdits post-call
│   │   ├── transcriptArchive.js  # 🦅 Faucon P1 — archive corpus IA (pure)
│   │   ├── twilioVoip.js         # Twilio Voice SDK
│   │   ├── leadImportEngine.js   # Import CSV/GSheet partage
│   │   ├── brevoEmail.js         # Email Brevo
│   │   ├── brevoSms.js           # SMS Brevo
│   │   ├── brevoWhatsapp.js      # WhatsApp Brevo
│   │   ├── googleCalendar.js     # Google Calendar sync
│   │   ├── googleTasks.js        # Google Tasks
│   │   └── googleChat.js         # Google Chat webhooks
│   ├── cron/                     # 8 crons
│   │   ├── backups.js            # Backups DB 12h/48h
│   │   ├── reminders.js          # Rappels RDV (5 min)
│   │   ├── secureIaReports.js    # Rapports mots interdits
│   │   ├── leadDispatch.js       # Dispatch leads (15 min)
│   │   ├── nrpRelance.js         # NRP auto-relance (30 min)
│   │   ├── gsheetSync.js         # Sync GSheet (10 min)
│   │   └── transcriptArchive.js  # 🦅 Faucon P1 — auto-archive (5 min)
│   └── .env                      # Config (API keys, ports)
├── tasks/
│   ├── todo.md                   # Etat actuel du projet
│   └── lessons.md                # Lecons apprises (a lire!)
├── deploy.sh                     # Script de deploiement rsync
├── CLAUDE.md                     # Instructions pour l'IA
└── ecosystem.config.cjs          # Config PM2
```

---

## 5. Conventions frontend

| Element | Convention |
|---------|-----------|
| **Theme** | Objet global `T` (T.bg, T.text, T.border, T.card, T.accent, etc.) |
| **Composants UI** | `Card`, `Btn`, `Modal`, `Input`, `Toggle`, `Avatar`, `Stat`, `LoadBar`, `Badge` — tous inline |
| **Icones** | `I` wrapper autour de Lucide React |
| **API calls** | `api(path, opts)` — auto-injecte Bearer token |
| **Notifications (collab)** | `showNotif(msg, type)` |
| **Notifications (admin)** | `pushNotification(title, detail, type)` |
| **Portail collaborateur** | Lignes ~540–8159 dans App.jsx |
| **Interface admin** | Lignes 8200+ dans App.jsx |

---

## 6. Securite multi-entreprise

| Couche | Implementation |
|--------|----------------|
| **Auth** | JWT token dans table `sessions` (token, collaboratorId, companyId, role, expiresAt) |
| **Middleware** | `requireAuth` (token valide), `enforceCompany` (companyId match), `requireAdmin` (role admin), `requireSupra` (supra admin plateforme) |
| **Routes GET** | `enforceCompany` → filtre par companyId |
| **Routes PUT/DELETE** | `verifyOwnership(table, id, req, res)` → verifie que la ressource appartient a la company |
| **Routes bulk** | WHERE companyId = ? dans toutes les clauses |
| **Fallback interdit** | JAMAIS de `companyId \|\| 'c1'` — renvoyer 400 si manquant |

---

## 7. VPS Production

| Parametre | Valeur |
|-----------|--------|
| **IP** | 136.144.204.115 |
| **SSH** | `ssh -i ~/.ssh/id_ed25519 root@136.144.204.115` |
| **App** | /var/www/planora |
| **Htdocs** | /var/www/vhosts/calendar360.fr/httpdocs |
| **DB** | /var/www/planora/server/db/calendar360.db (WAL mode) |
| **Backups** | /var/www/planora/backups/ |
| **PM2** | `pm2 restart calendar360`, `pm2 logs calendar360` |
| **Nginx custom** | /var/www/vhosts/system/calendar360.fr/conf/vhost_nginx_ssl.conf |
| **Port Node** | 3001 |

---

## 8. Regles critiques (resume)

1. **JAMAIS de hooks dans les IIFEs** sauf si le nombre est FIXE et IMMUABLE
2. **JAMAIS deployer sans exclure les DB** dans rsync (server/db/)
3. **TOUJOURS verifier les tables/colonnes** sur le VPS apres deploy (try/catch silencieux)
4. **TOUJOURS builder** (`cd app && npm run build`) avant deploy
5. **TOUJOURS utiliser les handlers centralises** pour modifier les contacts
6. **TOUJOURS inclure companyId** dans les appels PUT/DELETE
7. **Lire tasks/lessons.md** en debut de chaque session
8. Pour les gros remplacements (>100 lignes) dans App.jsx : script Python splice
9. PM2 en mode fork (pas cluster) pour les WebSockets
10. Nginx custom dans vhost_nginx_ssl.conf — JAMAIS toucher les fichiers Plesk
11. **JAMAIS** mutualiser les donnees entre collaborateurs d'une meme entreprise. Chaque collab a son propre CRM, pipeline, contacts (filtre par assignedTo). Cela inclut pipeline_history : chaque route doit verifier assignedTo/shared_with pour les non-admin.
12. **JAMAIS** laisser sync-batch ecraser pipeline_stage ou name. Ces champs sont PROTEGES cote backend
13. **JAMAIS** retirer une regle de logique pipeline (motif Perdu, note Qualifie, RDV obligatoire) sans demander
14. **TOUJOURS** filtrer les contacts par assignedTo dans auto-refresh quand view === 'portal'
15. **TOUJOURS** utiliser contactsLocalEditRef pour empecher auto-refresh d'ecraser les edits locaux (delai 10s)
16. Power Dialer ring timeout: utiliser voipStateRef (pas voipState direct) pour eviter stale closures
17. **TOUJOURS** verifier par email ET phone avant de creer un contact auto (anti-doublons)
18. **T.card** doit etre defini dans T_LIGHT et T_DARK — sinon 119+ endroits ont un fond transparent
19. Les bookings doivent etre rattaches par contactId ET visitorPhone pour couvrir les anciens
20. Barre de recherche pipeline telephone : state `phonePipeSearch`, se cumule avec filtre favoris
21. **TOUJOURS** afficher les numeros FR avec +33 devant (9 chiffres → +33). Fonctions `formatPhoneFR()` et `displayPhone()` definies en haut de App.jsx. `displayPhone` pour l'affichage visuel, `autoFormatFR` pour les appels VoIP.
22. **Modales pipeline (RDV, Perdu, Contrat, Post-appel)** : zIndex 10001, AU-DESSUS de la modale CRM (9999)
23. **TOUT changement de statut** passe par `handlePipelineStageChange()`. Pas de mise a jour directe de pipeline_stage.
24. **handleCollabUpdateContact** synchronise automatiquement `selectedCrmContact` + `pipelineRightContact` + `contacts`
25. **RDV heure** : select avec creneaux 30min (pas input time libre). getBookingAt verifie le chevauchement, pas l'inclusion stricte.
26. **Bookings proteges** : un booking confirme ne disparait que par annulation explicite, changement de statut, ou suppression du contact
27. **Multi-tenant Phase 5B** : `getRouteMode(companyId, feature)` retourne `'legacy' | 'shadow' | 'tenant'`. En `shadow`, la route metier DOIT appeler `shadowCompare({fetchMonolith, fetchTenant})` qui renvoie toujours la valeur monolith. `fetchTenant` DOIT exclure `id = '__deleted__'` (placeholder insere par remap d'orphelins lors migration). `fetchTenant` DOIT produire la meme shape que `fetchMonolith` sinon diff systematique.
28. **Tenant fantome `Cabinet Dupont & Associes`** : placeholder hardcode dans `app/src/App.jsx` lignes 184 (`COMPANIES`), 186-191 (`INIT_COLLABS` avec mots de passe en clair), 245-251 (`INIT_ALL_COMPANIES`). `useState(COMPANIES[0])` ligne 39107 le selectionne comme company active au boot. N'existe PAS en DB. Correction P0 : `useState(null)` + redirect Vision pour supra sans company. Fixtures + passwords demo a purger du bundle prod (P1). `server/seed.js` a isoler hors autoload (P3).
