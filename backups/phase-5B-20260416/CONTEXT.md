# CONTEXT.md — Calendar360 / PLANORA

> **Fichier de reference unique du projet.**
> A lire en debut de CHAQUE session pour comprendre l'etat complet.
> Penser comme un CTO qui documente un SaaS scalable.

---

## 1. Presentation du projet

| Champ | Valeur |
|-------|--------|
| **Nom public** | Calendar360 |
| **Nom interne** | PLANORA |
| **Domaine** | calendar360.fr |
| **Type** | SaaS B2B multi-entreprise |
| **Cible** | PME avec equipes terrain / commerciales |
| **Proposition** | CRM + Agenda + Telephonie VoIP + IA — tout-en-un |
| **Fondateur** | RC Sitbon (rc.sitbon@gmail.com) |
| **Supra Admin** | rc.sitbon@gmail.com |

### Hierarchie utilisateurs
```
Supra Admin (rc.sitbon) → gere TOUTES les entreprises
  └── Company Admin (ex: contact@monbilandecompetences.fr) → gere SA company
      └── Collaborator / Member (ex: Guillaume, Jordan) → son propre espace
```

---

## 2. Stack technique

| Couche | Technologie |
|--------|-------------|
| **Frontend** | React 18 SPA — fichier unique `app/src/App.jsx` (~28 000 lignes) |
| **Backend** | Node.js + Express.js (ESM modules) |
| **Base de donnees** | SQLite (better-sqlite3) en mode WAL |
| **Auth** | JWT sessions en table `sessions` + middleware Express |
| **Email** | Brevo (ex-Sendinblue) API |
| **SMS** | Brevo SMS API (sender name configurable par company) |
| **WhatsApp** | Brevo WhatsApp API |
| **Telephonie** | Twilio Voice SDK + Media Streams |
| **STT live** | Deepgram (nova-2, francais, mulaw 8kHz) |
| **STT post-call** | OpenAI Whisper |
| **IA analyse** | OpenAI GPT-4o-mini |
| **IA vision** | OpenAI GPT-4o (scan photo → extraction contacts) |
| **Calendar sync** | Google Calendar OAuth2 |
| **Backup cloud** | Google Drive via rclone |
| **Deploy** | deploy.sh securise → VPS 136.144.204.115 + PM2 |
| **Reverse proxy** | Plesk Nginx (443) → Apache (7081) → Node.js (3001) |
| **Build** | Vite (app/) |

---

## 3. Architecture serveur

### Separation code / data (SECURISE)
```
/var/www/planora/           ← CODE (deploye via rsync, SANS --delete)
  ├── server/               ← Backend Express
  ├── app/                  ← Frontend React (src + dist)
  ├── ecosystem.config.cjs  ← Config PM2 (avec DB_PATH)
  ├── deploy.sh             ← Script deploy securise
  └── deploy.log            ← Historique des deploys

/var/www/planora-data/      ← DATA (JAMAIS touche par rsync)
  ├── calendar360.db        ← DB active SQLite (WAL)
  ├── backup.log            ← Log des backups auto
  ├── backup.lock           ← Lock anti-chevauchement
  ├── backup-cron.sh        ← Script backup automatique
  └── backups/              ← Tous les backups DB
      ├── auto-6h-*.db      ← Backups cron toutes les 6h (retention 30j)
      ├── pre-deploy-*.db   ← Backups avant chaque deploy (jamais supprimes)
      └── manual-*.db       ← Backups manuels (jamais supprimes)
```

### DB Path
- Variable `DB_PATH` dans `ecosystem.config.cjs` et `.env`
- `database.js` lit `process.env.DB_PATH` avec fallback sur l'ancien chemin
- Log au demarrage : `[DB] DB PATH USED: /var/www/planora-data/calendar360.db`

### Backend : 35 routes, 12 services, 8 crons
- **Routes** : auth, init, data, bookings, calendars, collaborators, companies, settings, sms, voip, chat, messaging, analytics, backup, security, health, tickets, forms, pages, tables, tasks, google, notify, verify, public, manage, leads, goals, perfCollab, secureIa, aiCopilot, conversations, knowledgeBase, callContext, aiAgents, callForms, contactFields, marketplace
- **Services** : twilioVoip, brevoEmail, brevoSms, brevoWhatsapp, googleCalendar, googleChat, googleTasks, aiCopilot, aiAgent, secureIaPhone, liveTranscription, liveAnalysis, leadImportEngine
- **Crons** (8) : backups (12h/48h), reminders (5min), googleSync (5min), secureIaReports (daily), leadDispatch (15min), nrpRelance (30min), gsheetSync (10min), **transcriptArchive (5min) 🦅**

---

## 4. Fonctionnalites existantes (32 modules)

| # | Module | Description |
|---|--------|-------------|
| 1 | **Agenda / Bookings** | Calendriers multi-collab, creneaux, rappels, Google Calendar sync |
| 2 | **CRM Contacts** | Fiche contact unifiee (CRM + Telephone), champs editables, champs perso |
| 3 | **Pipeline CRM Pro** | Colonnes drag&drop reorganisables, regles logiques par statut, historique |
| 4 | **Dialer Pro** | Clavier VoIP browser, appels entrants/sortants, recording, DND |
| 5 | **Power Dialer** | Auto-dialer colonne par colonne, ring timeout configurable, pause/stop |
| 6 | **Live Transcription** | Deepgram temps reel, segments speaker, SSE vers frontend |
| 7 | **AI Copilot Live** | Coaching temps reel pendant l'appel (Accroche/Decouverte/Presentation/Objections/Closing) |
| 8 | **AI Copilot Post-call** | Resume, scores, coaching, CRM autofill, suggestions actions |
| 9 | **Secure IA Phone** | Mots interdits live + post-call, alertes admin, rapports |
| 10 | **Leads Manager** | Import CSV/GSheet, dispatch auto, scoring, deduplication |
| 11 | **Perf Collab** | Scoring 8 axes, leaderboard, bonus/penalty auto, audit |
| 12 | **Knowledge Base IA** | Produits, scripts, templates, docs — contexte pour l'IA |
| 13 | **Goals / Gamification** | Objectifs individuels/equipe, rewards |
| 14 | **Call Forms** | Formulaires pendant appels, reponses par contact |
| 15 | **Pages / Landing** | Builder de landing pages, capture leads |
| 16 | **Tables Dynamiques** | Airtable-like, export/import, GSheet sync |
| 17 | **Marketplace Numeros** | Achat/assignation numeros Twilio, plans, credits |
| 18 | **SMS Auto** | SMS auto NRP, SMS auto par colonne pipeline, templates |
| 19 | **AMD Messagerie** | Detection messagerie Twilio, voicemail drop audio/TTS, SMS auto |
| 20 | **Import Photo IA** | Scan image GPT-4o Vision → extraction multi-contacts |
| 21 | **Chat Interne** | Messagerie equipe temps reel |
| 22 | **Conversations Unifiees** | SMS + appels + notes dans un fil par contact |
| 23 | **Google Calendar** | Sync bidirectionnelle, Meet links |
| 24 | **Support / Tickets** | Systeme de tickets interne |
| 25 | **Notifications** | Email + SMS + WhatsApp + push |
| 26 | **Booking Public** | Pages de reservation publiques, formulaires |
| 27 | **Supra Admin** | Gestion multi-entreprise, telecom, monitoring |
| 28 | **Backup & Securite** | Dashboard securite, backups auto 6h, GDrive, health check |
| 29 | **Fiche Contact Unifiee** | Meme vue CRM et Telephone, sync bidirectionnelle |
| 30 | **Format Tel FR** | Auto +33 sur numeros 9 chiffres, partout |
| 31 | **Taux Remplissage Agenda** | Barre de progression creneaux pris/disponibles |
| 32 | **🦅 Corpus IA Auto-archive** | **Faucon P1** — service `transcriptArchive.js` + cron 5min. Archive automatique des appels >20s completed avec transcript. Zero action humaine. |

---

## 5. Securite & Infrastructure

### Deploy securise (deploy.sh)
```
1. Backup DB obligatoire (sqlite3 .backup) → verifie taille + integrity
2. Upload backup sur Google Drive (deploy/)
3. Build frontend (arret si echec)
4. Verification syntaxe backend (arret si echec)
5. rsync SANS --delete (exclusions: *.db, .env, backups/, data/)
6. npm install + copie frontend + restart PM2
7. Verification post-deploy (HTTP + companies + PM2)
8. Log deploy (date + git hash + backup + resultat)
```

### Backups automatiques
| Type | Frequence | Retention | Stockage |
|------|-----------|-----------|----------|
| **auto-6h** | Toutes les 6h (crontab systeme) | 30 jours | Local + Google Drive daily/ |
| **pre-deploy** | Avant chaque deploy | Infini | Local + Google Drive deploy/ |
| **manuel** | Supra Admin UI | Infini | Local |

### Verification backup (backup-cron.sh)
- Lock anti-chevauchement (flock)
- Verification DB source existe + taille > 1KB
- Backup via `sqlite3 .backup` (safe WAL)
- Verification backup : taille > 0 + integrity_check + count companies/collabs
- Upload Google Drive
- Alerte email Brevo si echec upload
- Log complet : `TIMESTAMP | OK/FAIL/GDRIVE_OK/GDRIVE_FAIL | details`

### Endpoints de surveillance
| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | DB connected, companies, collabs, dbPath, uptime |
| `GET /api/security/dashboard` | Dashboard complet (DB, backups, GDrive, deploy, alertes) |
| `GET /api/security/backup-log` | 50 dernieres lignes du backup.log (raw + parsed) |
| `GET /api/security/deploy-log` | 20 dernieres lignes du deploy.log (raw + parsed) |

### Isolation donnees
```
REGLE ABSOLUE : Chaque collaborateur ne voit QUE ses propres donnees.
- contacts filtres par assignedTo === collabId (init.js + auto-refresh)
- Admin voit tout. Collab ne voit que le sien.
- Contacts assignedTo vide → invisibles (sauf admin)
- Pipeline telephone = memes contacts que Mon CRM (meme state)
- Sync-batch ne sync que contacts du collab connecte
- Chaque company est un tenant isole (enforceCompany middleware)
- pipeline_history : filtre par assignedTo/shared_with pour les non-admin
  → GET /pipeline-history JOIN contacts + filtre collab
  → POST /pipeline-history verifie contact ownership avant INSERT
  → Pattern guard : if (!ct ||  — JAMAIS if (ct && (bypass silencieux si contact supprimé)
  → Frontend pipeline telephone : contacts filtres par assignedTo === collab.id || shared_with.includes(collab.id)
```

---

## 6. Regles de developpement (PERMANENTES)

### Hooks React
- **JAMAIS** `useState`/`useEffect` dans un IIFE conditionnel `(()=>{ ... })()`
- Utiliser le state parent ou des refs

### Changement de statut pipeline
- **TOUT** changement de statut DOIT passer par `handlePipelineStageChange()`
- Regles par statut : RDV obligatoire, motif Perdu, note Qualifie, NRP x5, post-appel
- Identique partout : CRM modale, pipeline telephone, fiche droite, post-appel

### Deploy
- **JAMAIS** `rsync --delete` vers le VPS
- **JAMAIS** `cp` pour backup DB (incompatible WAL) → utiliser `sqlite3 .backup`
- **JAMAIS** deploy sans backup DB prealable
- **TOUJOURS** backup DB → build → check syntaxe → rsync → restart → verify

### Donnees
- **JAMAIS** supprimer une regle existante sans autorisation explicite
- **JAMAIS** modifier une regle existante sans autorisation explicite
- **JAMAIS** creer de contact en doublon (verifier email + phone avant INSERT)
- **JAMAIS** permettre qu'un booking confirme disparaisse silencieusement
- **TOUJOURS** assigner un contact au collab qui le cree (assignedTo)
- **TOUJOURS** afficher +33 devant les numeros FR a 9 chiffres

### Auto-provisioning
- Chaque nouveau collaborateur recoit automatiquement :
  - Un calendrier unique
  - Des disponibilites par defaut (Lun-Ven 9h-12h + 14h-18h)

### Fichiers de reference
- A CHAQUE sauvegarde/commit, mettre a jour :
  1. `CONTEXT.md` — ce fichier
  2. `SOURCE_OF_TRUTH.md` — regles metier/logique/securite
  3. `PROJECT_MEMORY.md` — modules, stack, etat
  4. `ARCHITECTURE_MAP.md` — tables, routes, services

---

## 7. Regles pipeline logique

| Vers statut | Regle entree | Regle sortie |
|-------------|-------------|--------------|
| **RDV Programme** | Date + heure obligatoire → cree booking → bloque creneaux | Confirmation annulation → supprime booking |
| **Contacte** | Post-appel obligatoire (popup resultat) | — |
| **Qualifie** | Note obligatoire "Pourquoi qualifie ?" | — |
| **Client Valide** | Montant + numero contrat | Annulation contrat avec motif |
| **Perdu** | Motif obligatoire (8 motifs + champ libre) | — |
| **NRP** | Auto-relances 3/7/14j | NRP x5 → propose Perdu |

Regles transversales :
- RDV passe sans action → notification "qualifier le contact ?"
- Contact sans activite >7j → badge "A relancer"
- Contact sans activite >14j → badge rouge fonce
- Contact sans activite >30j → badge "Inactif"

---

## 8. Entreprises actives

| Company | Admin | Collabs | Plan |
|---------|-------|---------|------|
| Calendar360 | (plateforme) | — | pro |
| Competences First | Anthony Pika | RC Sitbon | pro |
| MonBilandeCompetences.fr | contact@monbilan... | Guillaume SIMONNET, Jordan Casimirius | free |

### Comptes cles
- **Supra Admin** : rc.sitbon@gmail.com
- **Guillaume** : simonnet.guillaume@gmail.com / GUILLAUME123#
- **Jordan** : Jordan.casimirius@gmail.com / JORDAN123#

---

## 9. Infrastructure VPS

| Element | Valeur |
|---------|--------|
| **IP** | 136.144.204.115 |
| **SSH** | `ssh -i ~/.ssh/id_ed25519 root@136.144.204.115` |
| **Code** | `/var/www/planora` |
| **Data** | `/var/www/planora-data` (hors rsync) |
| **DB active** | `/var/www/planora-data/calendar360.db` |
| **Htdocs** | `/var/www/vhosts/calendar360.fr/httpdocs` |
| **PM2** | `pm2 restart calendar360`, config dans `ecosystem.config.cjs` |
| **Crontab** | `7 */6 * * *` → backup-cron.sh |
| **rclone** | Remote `gdrive-backup:` → Google Drive (daily/, deploy/, manual/) |
| **Twilio** | 5 numeros FR (01 59 58 XX XX) + 1 US |
| **.env** | 20 variables (Twilio, Brevo, OpenAI, Deepgram, Google, DB_PATH) |

---

## 10. Roadmap / Modules a construire

### 🦅 PLAN FAUCON — Phase 1 SOCLE
- [x] **Auto-archive transcripts** (service + cron) — ✅ **ACTIF EN PROD depuis 2026-04-12**
- [ ] **Génération de volume** — faire tourner la plateforme pour nourrir le corpus (priorité immédiate)
- [ ] Observation qualité des archives (T+1 semaine)
- [ ] Fix Deepgram API key (401) — differé tant qu'on n'a pas le volume
- [ ] AI Copilot activé par défaut sur nouveaux collabs
- [ ] Consentement RGPD (3 ALTER TABLE + CGU + message TwiML)

### ✅ V3 — Securisation memoire front (14/04/2026)
- TAB_ID unique par onglet (isolation inter-onglets)
- 37 variables window._ migrees vers _T module-scope
- localStorage metier supprime (notifications, checklist, SMS templates)
- useEffect deps stabilisees (contactsRef, chatMsgsRef)
- Chat polling dedup par ID, refetch individuel on error
- Verrou anti-double-clic pipelineActionLockRef

### ✅ V4 — Verrou metier + Tracabilite (14/04/2026)
- Table contact_status_history (12 colonnes) — tracabilite 100% des changements de statut
- Table system_anomaly_logs (11 colonnes) — transitions bloquees, 409, regressions
- ALLOWED_TRANSITIONS : map stricte des transitions autorisees
- _source/_origin/_tabId dans chaque PUT contacts
- Automations ne peuvent JAMAIS descendre un stage
- Panneau Historique statuts sur fiche CRM

### ✅ V5 — IA Commerciale (14/04/2026)
- Lead Scoring V2 : 8 criteres (fraicheur, urgence temporelle, stage, NRP, interactions, contrat, IA, bonus 1er contact)
- Temperature hot/warm/cold + raisons explicites
- Next Best Action V2 : 7 types actions, raisons contextualisees, suggestion horaire
- Dashboard collab "Mes actions du jour"
- Badges lead_score sur pipeline kanban
- Smart Automations cron 30min (4 regles, anti-spam 24h)
- Scoring cron 2h (dirty flag)

### ✅ V5-Dispatch (14/04/2026)
- Fix last_dispatch_at dans POST /dispatch
- Mode immediate (dispatch des l'import)
- UNIQUE index anti double-dispatch
- Notification admin si leads non dispatches
- Volume par cycle (dispatch_limit) dans wizard
- Visibilite timing sur cartes enveloppes

### ✅ V5-Supervision (14/04/2026)
- Control Tower leads admin (alertes, vue equipe, flags enveloppes)
- Flags visuels : Bloque/Retard/Actif/Manuel/Termine
- Fix cron dispatch leads unassigned

### ✅ V5.2 — Isolation CRM + Booking→CRM (15/04/2026)
- Isolation CRM : collab ne voit QUE ses contacts (owned + shared)
- Plus de contacts temporaires booking (tmp_)
- Booking→CRM : creation auto contact avec dedup (email+phone, meme company+collab)
- contactId sauvegarde dans le booking public
- source='booking' + badge teal "Booking"
- Suppression securisee : contactsRef nettoye, protection 60s, message si non-assigne
- Log suppression enrichi (qui, combien, noms, origine CRM/pipeline)
- Compteurs alignes (fiche collab = CRM = pipeline)

### En cours / A faire
- [ ] Roles & permissions granulaires (admin features)
- [ ] Parametrage admin scoring (poids, seuils hot/warm/cold)
- [ ] KPI intelligence (% leads chauds traites, delai reaction, taux conversion par score)
- [ ] Copie backup hors serveur automatique (Google Drive OK, S3 a evaluer)

### A venir
- [ ] SMS campaigns avec sequences
- [ ] Merge contacts doublons (UI)
- [ ] Calendrier inline dans telephone (au lieu de redirect)
- [ ] Webhooks API pour integrations externes
- [ ] App mobile (React Native ou PWA)
- [ ] Multi-langue (EN, ES)
- [ ] Stripe billing pour plans payants

---

## 11. Contraintes techniques importantes

1. **App.jsx = 28 000 lignes** — fichier unique, pas de composants separes. Toute modification doit etre chirurgicale.
2. **SQLite = pas de migration** — les ALTER TABLE sont dans database.js en try/catch. Verifier manuellement apres deploy.
3. **Pas de hot reload en prod** — chaque changement necessite build + deploy + PM2 restart.
4. **Twilio couts** — chaque appel/SMS/numero coute. Monitorer les credits.
5. **Deepgram STT** — websocket fragile, gestion reconnexion necessaire.
6. **Google OAuth** — tokens expirent, refresh automatique dans googleCalendar.js.
7. **rsync timing** — deploy prend ~15-30s. Le site est accessible pendant le rsync mais PM2 restart = 3-5s de downtime.

---

## 12. Fichiers de reference complementaires

| Fichier | Contenu |
|---------|---------|
| `CONTEXT.md` | **CE FICHIER** — vue complete du projet |
| `SOURCE_OF_TRUTH.md` | Regles metier detaillees (29 sections), flux techniques, tables par domaine |
| `PROJECT_MEMORY.md` | Liste modules, stack, etat detaille |
| `ARCHITECTURE_MAP.md` | 83 tables SQLite, 35 routes, 12 services, schemas complets |
| `CLAUDE.md` | Instructions pour l'agent IA (workflow, regles, conventions) |
| `tasks/lessons.md` | Lecons apprises (bugs, corrections, regles) |
| `tasks/todo.md` | Taches en cours |

---

## 13. Derniers incidents & resolutions

| Date | Incident | Cause | Resolution |
|------|----------|-------|------------|
| 26/03 | DB ecrasee, donnees perdues | `rsync --delete` a supprime la DB | Restauration depuis backup 12h, separation code/data |
| 26/03 | Contacts mutualises entre collabs | `assignedTo` vide sur contacts importes | Fix init.js + sync-batch : filtrage strict par collabId |
| 26/03 | Hooks React crash (#310) | useState dans IIFE conditionnelle | Deplace vers state parent |
| 26/03 | contactsLocalEditRef undefined | Variable non accessible dans le scope | Declare au bon niveau |
| 26/03 | Noms contacts en doublon | Import CSV met le nom complet dans firstName ET lastName | Fix DB + protection sync-batch |
| 26/03 | Bookings disparaissent | Pas de protection contre suppression silencieuse | Regle : booking ne disparait que par annulation explicite |
| 27/03 | Pipeline history cross-collab | GET/POST /pipeline-history filtraient par companyId uniquement, pas assignedTo | Fix : JOIN contacts + filtre assignedTo/shared_with ; guard `if (!ct \|\|` ; permission pipeline.manage sur POST ; frontend filtre par assignedTo |

---

## 14. Risques techniques actuels

| Risque | Severite | Mitigation |
|--------|----------|------------|
| **App.jsx monolithique (28K lignes)** | 🟡 Moyen | Refactoring progressif en composants — mais risque de regression a chaque changement |
| **SQLite en production** | 🟡 Moyen | Fonctionne bien pour 50-100 entreprises. Migration PostgreSQL necessaire si scaling > 500 |
| **Pas de CI/CD** | 🟡 Moyen | Deploy manuel via deploy.sh. Ajouter GitHub Actions si equipe de dev grandit |
| **Pas de tests automatises** | 🔴 Haut | Aucun test unitaire/integration. Regressions possibles a chaque deploy |
| **Fichier .env sur le VPS** | 🟡 Moyen | Cles API en clair. Vault ou secret manager a envisager |
| **Twilio couts non plafonnes** | 🟡 Moyen | Un bug power dialer pourrait generer des centaines d'appels. Rate limiting a ajouter |
| **Single point of failure** | 🟡 Moyen | 1 seul VPS, 1 seule DB. Pas de HA ni de replica |
| **Google OAuth tokens** | 🟢 Faible | Refresh automatique, mais si le refresh token expire (6 mois inactif) → perte sync |

---

## 15. Prochaines priorites (ordre recommande)

### Priorite 1 — Stabilite & fiabilite
- [ ] Corriger tous les bugs UX remontes (fiche CRM, modale RDV, statuts)
- [ ] Nettoyer les anciens fichiers JS orphelins dans htdocs
- [ ] Tester chaque feature manuellement (checklist QA)

### Priorite 2 — Securite applicative
- [ ] Roles & permissions granulaires (can_delete, can_export, can_import_csv)
- [ ] Audit trail / historique des actions (qui a fait quoi quand)
- [ ] Rate limiting sur les API sensibles (auth, sms, voip)

### Priorite 3 — Experience utilisateur
- [ ] Finaliser la fiche contact unifiee (CRM = Telephone, identique)
- [ ] SMS dans onglet fiche (pas modale separee)
- [ ] IA Copilot dans onglet fiche (pas overlay qui cache)
- [ ] Automatisation SMS par colonne (UI dans Parametres)
- [ ] Taux de remplissage agenda fonctionnel

### Chantier structurel — Pipeline individuel par collaborateur
> Actuellement `pipeline_stages` est au niveau company (companyId). Chaque collab voit les memes stages.
> Le produit necessite un pipeline individuel par collaborateur.
> **Migration prevue :**
> - ALTER TABLE pipeline_stages ADD COLUMN collaboratorId TEXT DEFAULT NULL
> - `collaboratorId = NULL` → stage partage company (backward compatible)
> - `collaboratorId = 'u-xxx'` → stage personnel du collab
> - Logique lecture : DEFAULT_STAGES + stages company-wide + stages perso
> - Logique ecriture : member cree/modifie/supprime SES stages, admin gere tout
> - Impacts : backend (GET/POST/PUT/DELETE filtres par collaboratorId) + frontend (scope collab)
> - **A planifier en chantier separe avec analyse + validation**

### Priorite 4 — Croissance produit
- [ ] Stripe billing (plans payants, facturation auto)
- [ ] SMS campaigns avec sequences
- [ ] API webhooks pour integrations externes
- [ ] App mobile (PWA ou React Native)
- [ ] Multi-langue (EN, ES)

---

## 🕒 Last Update — 12 avril 2026

### 🦅 Session 12 avril 2026 — PLAN FAUCON Phase 1 SOCLE ACTIVÉ EN PROD

**Statut** : Phase 1 du Plan Faucon **officiellement active** — socle d'auto-archive opérationnel en production.

#### Ce qui est livré en prod (commit à venir)
1. **Service `transcriptArchive.js`** (280 lignes, logique pure réutilisable)
   - `archiveCallTranscript(callLogId, { force })` — refactor de la logique sortie de voip.js
   - `findCallLogsEligibleForArchive(limit)` — requête optimisée (INNER JOIN call_transcripts + LEFT JOIN archive)
   - Constante `MIN_DURATION_SECONDS = 20`
   - `force=true` (route humaine) : ignore filtres status/duration
   - `force=false` (cron) : skip si status ≠ completed OU duration < 20s
2. **Route `POST /api/voip/archive-transcript/:callLogId` refactorée**
   - Passée de 176 → 44 lignes
   - Ownership check préservé
   - Délègue tout au service
3. **Cron `server/cron/transcriptArchive.js`**
   - Tick `*/5 * * * *` + 1er tick différé de 45s au boot
   - Batch 100 max / tick
   - Logs compacts : `[CRON ARCHIVE] found N · archived X · skipped ...`
   - Silence si 0 archive / 0 fail
4. **Wiring `server/index.js:74`** — import du cron après `gsheetSync`

#### Protocole de sécurisation appliqué (à réutiliser pour les prochains chantiers Faucon)
1. Refactor + syntaxe `node --check` local
2. Build frontend
3. **Dry-run sur copie snapshot prod** (SCP read-only du backup VPS vers `/tmp`)
4. Transaction SQLite globale avec ROLLBACK → simulation sans écriture
5. Contrôle croisé SQL brute vs résultat service → cohérence
6. Rapport précis (candidats, archivés, skipped, failed)
7. Deploy si propre
8. Vérif post-deploy : health + premier tick cron

#### Résultat dry-run (snapshot 2026-04-10 — 172 appels / 14 transcripts / 1 archive existante)
- **12 candidats trouvés** par le service
- **12 archivés** dans la transaction (INSERT propre)
- **0 réutilisés** / **0 skipped** / **0 failed**
- Rollback vérifié (retour à 1 archive après ROLLBACK)
- Contrôle croisé SQL brute = 12 ✅
- Aucun cas inattendu

#### Résultat prod après deploy
- ✅ HTTP 200 — health OK, 5 companies, 10 collabs
- ✅ PM2 restart propre, cron chargé au boot
- ✅ **Premier tick cron T+45s** : `[CRON ARCHIVE] found 12 · archived 12` — EXACTEMENT les chiffres du dry-run
- ✅ Total archives en prod : **13** (1 pré-existante + 12 rattrapées)
- ✅ Zéro erreur, zéro action humaine requise
- Backup pré-deploy : `pre-deploy-20260412-033125.db`

#### Garantie désormais active
**Tout appel > 20s completed avec transcript → automatiquement dans le corpus dans les 5 minutes suivant la fin de l'appel.** Plus aucune dépendance à un clic utilisateur.

#### Prochaine étape Plan Faucon
**Génération de volume réel d'appels** pour nourrir le corpus. Pas de nouveau code pour l'instant — on fait tourner la plateforme, on observe la qualité des archives, puis on attaque les autres chantiers Phase 1 (Deepgram fix, AI Copilot default, RGPD) quand le terrain aura parlé.

**Logique de priorisation acceptée** :
1. Documentation / checkpoint (CETTE SESSION)
2. Volume terrain réel
3. Observation qualité des archives
4. Phases suivantes seulement après

---

### Session 10 avril 2026 (soir) — Pre-Plan Faucon :

#### Corpus IA conversationnel — Base technique prête
- **Table `call_transcript_archive`** (26 colonnes + 4 index) pour corpus IA thématique
- **Endpoint `POST /api/voip/archive-transcript/:callLogId`** — génère archiveId unique + archive
- **Format export enrichi** : header complet (contact, entreprise, type B2B/B2C, SIRET, secteur)
- **archiveId pattern** : `YYYYMMDD-HHMM-<last9phone>-<shortId>`
- **UI accordéon historique IA Copilot** : preview bulles chat + boutons Copier/Download
- **Cache window._archiveCache** pour éviter requêtes redondantes
- **Fix callsForNumber** : fusionne matches par contactId + phone (ne cache plus les appels sans contactId)

#### 🦅 PLAN FAUCON — Audit complet terminé
- Roadmap 3 phases sur 6 mois sauvegardée dans `tasks/PLAN_FAUCON.md`
- Phase 1 (Socle) : fix Deepgram, auto-archive, AI Copilot default, RGPD → 500 conversations
- Phase 2 (Enrichissement) : taxonomie 3 niveaux, outcome, anonymisation → 2 000 conversations
- Phase 3 (Activation IA) : curation, export JSONL, RAG, fine-tuning sectoriel → agent Copilot V1
- Status : **EN ATTENTE DE VALIDATION** pour démarrer Phase 1

#### Autres sessions du 10 avril :
- Fix auth : email case-sensitive + bypass password null + rate limit + wizard inscription entreprise
- Split agenda MonBilan en 2 agendas isolés (Jordan + Guillaume)
- Phase 2 sécurité public.js : validation collaboratorId, companyId INSERT, routes legacy 410
- Pipeline : système core/flexible + renommage En discussion/Intéressé
- SMS Hub complet + Cockpit appel flottant
- UX agenda collab : bloc lien de réservation compact + modal édition + stats cliquables

### Commits récents
- `ad22c61` — SMS Hub pre-Plan Faucon + Corpus IA base
- `cea2b26` — Auth security + SMS Hub + Cockpit + Agenda split + UX

### Backup de référence
- `manual-faucon-pause-20260410-155526.db` (3.3 MB, integrity OK, Google Drive)
- Stats : 5 companies · 10 collabs · 346 contacts · 44 bookings · 172 calls · 14 transcripts · 1 archive

---

### Session 7 avril 2026 :

#### Sécurisation Import CSV (Leads + Contacts) :
1. **Limite taille** : max 10 Mo backend (parseCSV) + frontend (3 circuits)
2. **Limite lignes** : max 50 000 lignes backend + frontend
3. **Dedup O(1)** : buildDedupIndex() + checkDuplicateFast() via Map/Set (remplace O(n²))
4. **assignedTo forcé** : non-admin = req.auth.collaboratorId (anti-spoof)
5. **Validation email/phone** : isValidEmail() + isValidPhone() sur import leads + POST contacts
6. **Rate limit** : 5 imports/h/company (Map in-memory) sur /import/csv et /import/gsheet
7. **UUID backend** : ID généré serveur, frontend utilise tempId + reconcilie
8. **Dédup DB contacts** : POST /contacts/check-duplicates + 2 index composés (companyId+email, companyId+phone)
9. **Logging merges** : logHistory() avec before/after sur chaque merge/replace

#### Import CSV V2 — Modal unifiée 4 étapes :
1. **Step 1 Upload** : drag & drop + file picker, checks taille/lignes, parse CSV robuste (,;\\t + quotes)
2. **Step 2 Mapping** : auto-detect fuzzy FR/EN (14 champs), match custom fields existants, "Nouveau champ perso" avec label + type (texte/nombre/date/boolean), badge AUTO
3. **Step 3 Preview** : tableau 20 lignes, cartes résumé, validation email/phone, stratégie doublons skip/merge/replace
4. **Step 4 Résumé** : compteurs colorés, détail erreurs, export CSV erreurs
5. **Backend** : POST /contacts/import-batch (batch atomique, transaction DB, skip/merge/replace)
6. **Backend** : POST /contact-fields/ensure-batch (création batch champs perso, dédup fieldKey normalisé)
7. Fusion Circuits 1 + 3, boutons branchés sur la nouvelle modal

#### Fix RDV :
- Catégorie de RDV maintenant obligatoire (validation ajoutée dans addScheduledCall)
- Messages erreur améliorés (conflit créneau booking vs GCal, calendrier absent)
- Logs console succès/échec booking

#### Checkpoint :
- **Git** : fc1630e — 26 fichiers, +2556 -754 lignes
- **PM2** : online, PID 2718059
- **DB** : 2.6 MB, 10 companies, 13 collabs, 316 contacts
- **Backup** : manual-20260407-session.db + Google Drive
- **Site** : https://calendar360.fr — HTTP 200

---

### Session 6 avril 2026 :
1. **Footer COMPETENCES FIRST supprime** — Remplace par "CALENDAR360.FR" dans index.html, server/index.js, mentions-legales.html. Page /competencesfirst redirige vers /mentions-legales.
2. **Appel entrant auto-fiche** — acceptCollabIncomingCall ouvre automatiquement le panneau droit + onglet IA Copilot. Auto-creation contact si numero inconnu (assignedTo = collab.id, source = phone-inbound).
3. **POST /voip/calls direction dynamique** — Direction inbound/outbound depuis le body (plus hardcode outbound). Retourne conversationId dans la reponse.
4. **Retour admin / Deconnexion en haut** — Boutons deplaces du bas de la sidebar vers le haut, sous le nom du collab.
5. **Onglet Aujourd'hui enrichi** — Plus jamais vide : contacts chauds (HOT/WARM), pipeline rapide (barres), derniers appels, prochains RDV, assistant IA (conseils contextuels). "Tout est a jour" reduit en bandeau compact.
6. **Bug Ajouter au CRM** — La fiche reste ouverte et passe en mode _linked:true immediatement (plus de fermeture).
7. **Badge temperature** — HOT/WARM/COLD deplace sur la ligne du statut (plus a cote du nom).
8. **Contact AI Memory** — Table contact_ai_memory (26 colonnes), routes GET /memory/:contactId + /memories, auto-update apres chaque analyse post-appel.
9. **Reset mot de passe MonBilan admin** — contact@monbilandecompetences.fr → MONBILAN123#.

### Audit securite + corrections isolation (13 routes) :

**Failles critiques corrigees :**
- GET /bookings → filtre collaboratorId pour non-admin
- GET /voip/lookup → filtre assignedTo + shared_with, retourne donnees minimales
- GET /conversations/sms-history/:phone → filtre collaboratorId pour non-admin
- POST /collaborators/:id/voicemail-audio → check company + ownership
- POST /goals/sync-daily → force companyId/collaboratorId depuis session
- POST /voip/transcribe/:callLogId → check companyId + ownership collab
- POST /voip/transcribe-all → enforceCompany + filtre SQL par companyId
- GET /voip/live-flags/:callSid → filtre companyId
- PUT /data/companies/:id/forecast → admin only + check ownership company
- POST /data/activity → force companyId depuis session

**Failles moyennes corrigees :**
- PUT /collaborators/:id → non-admin ne peut modifier que SES propres infos
- DELETE /collaborators/:id → admin uniquement
- PUT /bookings/:id → check ownership collab
- DELETE /bookings/:id → check ownership collab
- PUT /voip/calls/:id → check ownership collab + companyId dans SQL
- DELETE /contacts/:id → check assignedTo pour non-admin
- POST /contacts/bulk-delete → filtre assignedTo pour non-admin
- POST /contacts/sync-batch → skip contacts d'autres collabs pour non-admin
- PUT /contacts/:id/cancel-contract → check assignedTo
- DELETE /pipeline-automations/:id → check ownership collaboratorId
- GET /voip/live-stream/:callSid → check ownership call_logs

### Regle universelle d'isolation appliquee :
```
1. requireAuth — user connecte
2. enforceCompany — company boundary
3. ownership collab — assignedTo/collaboratorId pour non-admin
4. admin bypass — dans SA company uniquement
5. supra bypass — global
```

### Checkpoint :
- **PM2** : online, PID 2650153
- **DB** : /var/www/planora-data/calendar360.db, 2.5 MB, 10 companies, 13 collabs, 253 contacts
- **Site** : https://calendar360.fr — HTTP 200
- **Deploy** : dernier deploy 06/04 17:23 — git:5825b93 — result: OK
- **Backups** : crontab 6h actif, Google Drive connecte
- **Isolation** : 13 routes corrigees, regle universelle appliquee sur 6 fichiers
- **Donnees orphelines** : 219 contacts sans assignedTo (a nettoyer), 3 bookings orphelins, 1 call_log orphelin

### Security Resolution Layer (deploye) :
- **Fichier** : `server/helpers/resolveContext.js`
- **Fonctions** : `resolveFromCallSid()`, `resolveFromPhone()`, `resolveFromSession()`, `validateWebhookContext()`
- **Webhooks securises** : `/amd-callback` (resolveFromCallSid), `/recording-callback` (fallback supprime), `/status` (fallback 15s)
- **Architecture** : TOUT ce qui vient de l'exterieur → reconstruit cote serveur depuis DB
- **Point de surveillance** : fallback 15s sur /status (provisoire, cible = suppression)

### Prochaine etape :
- **Phase SMS** : coverage audit de resolveContext + extension au flux SMS complet (inbound/outbound/threads/notifications/realtime/automations/IA)
- **Methode** : audit couverture d'abord, plan d'extension ensuite, implementation apres validation

---

## Checkpoint 2026-04-15 — Audit cross-scope CollabPortal <-> AdminDash

### Contexte
Apres le fix Marie-Ange (suppression contact bloquee par FK + 2 gardes `typeof selectedCrmContact`), la console utilisateur crachait encore `ReferenceError: Can't find variable: pipelineRightContact` (x3, enqueueJob x5). Un premier audit etait errone (confusion semantique `?.` vs `typeof`). Politique adoptee : audit exhaustif par script AVANT tout patch, puis lot groupe en une passe.

### Actions effectuees
1. **Script de verification** (Python) : cross-reference les 262 `useState` declares dans CollabPortal (673-19663) avec toutes leurs references hors scope dans AdminDash (19664-35474) et App-level (>35474), filtrage des redeclarations et des gardes `typeof` existantes. Examen manuel des faux positifs (property access, commentaires, params de closure, code mort `{false && ...}`).
2. **Liste finale verrouillee** : 5 points exacts, 1 seul fichier (`app/src/App.jsx`).
3. **Patch groupe applique en une passe** : pattern uniforme `typeof X !== 'undefined' && X && typeof setX === 'function'`.

### 5 locations corrigees (App.jsx)
| Ligne | Contexte | Variables guardees |
|-------|----------|---------------------|
| L20966 | `handleUpdateContact` admin | `pipelineRightContact` / `setPipelineRightContact` |
| L23350 | IIFE `_updateContact` booking modal admin | `selectedCrmContact` + `pipelineRightContact` |
| L31064 | bouton Import CSV admin | `setCsvImportModal` |
| L31954 | bouton RDV admin | `setPhoneScheduleForm` + `setPhoneShowScheduleModal` |
| L39261 | auto-refresh App-level | `pipelineRightContact` / `setPipelineRightContact` |

### Validation prod (2026-04-15)
- Build frontend : OK
- Deploy VPS : OK, PM2 calendar360 online, restart count stable
- Logs PM2 : aucun ReferenceError au demarrage ni au runtime
- Tests navigateur admin (a)-(e) : edition contact / pipeline droite / Import CSV / bouton RDV / auto-refresh → tous OK, UI stable, aucun effet de bord

### Regle ajoutee (voir SOURCE_OF_TRUTH.md §N)
**`x?.y` NE PROTEGE PAS contre un ReferenceError sur variable non declaree — seul `typeof x !== 'undefined'` le fait.** Pour tout monolithe multi-composants partageant un fichier, auditer par script AVANT tout fix cross-scope et appliquer en lot groupe.

### Prochaine etape
- Re-mesurer le PM2 restart count sous 24-48h (hypothese : les 1052 restarts etaient lies aux ReferenceError maintenant neutralises)
- Collecte logs enrichis MEDIA STREAM (instrumente le 14/04, 24-48h pour premier cas)
- Investiguer `[DB] backfill lastActivityAt skipped: misuse of aggregate: MAX()` (bug SQL separe)

---

## Checkpoint 2026-04-16 — Multi-tenant STEP 4 durci (moteur de migration)

### Contexte
Suite de la fondation Phase 1 multi-tenant (STEP 2 validee + STEP 3 test 8/8 passed). STEP 4 = moteur de migration + CLI pilote. User a impose un STEP A de verification exhaustive des tables sans `companyId` AVANT tout dry-run. Verification effectuee, correctifs majeurs apportes.

### Scan database.js (2026-04-16)
- **93 tables** au total
- **46 FK declarees** (couvertes par `PRAGMA foreign_key_check`)
- **127 FK implicites** (colonnes `xxxId` non declarees FOREIGN KEY — invisibles au PRAGMA)
  - Dont 42 vers tables TENANT presentes en tenant DB → validation manuelle obligatoire
  - Reste vers parents GLOBAL (companies) ou inconnus (callLogId, users...) → skip

### Classification des 6 tables sans companyId hors GLOBAL
| Table | Rattachement | Profondeur | Classification |
|---|---|---|---|
| `availabilities` | `collaboratorId` → `collaborators.companyId` | 1-hop | TENANT indirect |
| `bookings` | `calendarId` → `calendars.companyId` | 1-hop (critique) | TENANT indirect |
| `google_events` | `collaboratorId` → `collaborators.companyId` | 1-hop | TENANT indirect |
| `role_permissions` | `roleId` → `roles.companyId` | 1-hop | TENANT indirect |
| `ticket_messages` | `ticketId` → `tickets.companyId` | 1-hop | TENANT indirect |
| `reminder_logs` | `bookingId` → `bookings` → `calendars.companyId` | 2-hop | TENANT indirect |
| `wa_verifications` | (numero tel, cross-tenant) | — | RECLASSE GLOBAL |

### Correctifs appliques
1. **`server/db/tenantSchema.js`** : +`INDIRECT_TENANT_TABLES` (Map), +`IMPLICIT_FKS` (42 entries), +`wa_verifications` dans `GLOBAL_TABLES`. computeMigrationOrder prend en compte les dep implicites pour ordre topo.
2. **`server/services/tenantMigration.js`** : +`buildParentIdsSubquery` recursif (paramCount correct meme en multi-hop), copyTenantData 3 modes (direct/indirect/skipped) avec report enrichi (`mode`, `path`), diffCounts applique la logique aux indirectes (sinon diffs fausses), +`validateOrphanFks` pour orphelins implicites avec sample IDs pour debug.
3. **`server/scripts/migratePilotTenant.js`** : CLI affiche orphelins implicites + modes + tables skipped.
4. **`server/db/test/testTenantMigration.mjs`** : test dedie avec source DB synthetique (2 companies, donnees realistes inclut 2-hop reminder_logs + orphelin injecte). 8 assertions : buildParentIdsSubquery recursion, migration ok, direct/indirect/2-hop, 0 fuite cross-tenant, diff OK, orphans detectes, wa_verifications absent, control tower inchange en dry-run.

### Risque evite (avant impact)
Sans ces correctifs, le dry-run aurait produit `ok=true` en **skippant silencieusement bookings** (table critique coeur produit), availabilities, google_events, role_permissions, ticket_messages et reminder_logs. Tenant DB techniquement valide mais produit casse.

### Regles ajoutees (voir SOURCE_OF_TRUTH.md §1 mis a jour)
- GLOBAL_TABLES = 7 entrees (ajout wa_verifications)
- Tables TENANT indirectes documentees avec rattachement FK + profondeur
- Toute nouvelle table DOIT declarer son scope : direct / indirect / global. Le moteur rejette les tables non classifiees.

### Prochaine etape
1. User rebuild natifs sur Mac (sandbox ARM-linux non compatible better-sqlite3 pre-built)
2. Lancer `testTenantMigration.mjs` + `testMultitenantPhase1.mjs` → attendre 2 × pass
3. Choisir company cobaye (petite, <20k bookings), scp DB VPS en local
4. `node server/scripts/migratePilotTenant.js <companyId> --dry-run`
5. Analyser report dry-run avant commit STEP 4

---

## Checkpoint 2026-04-16 v4 — Commit flow hardening + visible errors (post dry-runs OK)

### Contexte
Les dry-runs CAPFINANCES et MON BILAN ont valide ok=true avec le moteur v3. User a lance `--commit` sur MON BILAN : echec silencieux, aucune info exploitable. Symptomes : `ok: false`, `size: NaN KB`, `elapsed: undefined ms`, pas d'`error`, pas de `stack`, pas de `currentStep` a l'ecran. Diagnostic impossible.

### Cause racine (double defaut)
1. **Moteur** : un early-return (`{ ok: false, error: 'TENANT_DB_ALREADY_EXISTS', tenantDbPath }`) ne remplissait ni `sizeBytes` ni `elapsedMs` ni `stack` ni `currentStep`. Tout calcul CLI downstream produisait `NaN`/`undefined`.
2. **CLI** : le script d'affichage n'imprimait JAMAIS `report.error` / `report.stack` / `report.currentStep`. Meme un report propre aurait masque l'erreur.

Declencheur du blocage silencieux : un dry-run prealable laisse une tenant DB sur disque (legitime pour inspection). Le commit suivant heurtait la garde `existsSync(tenantDbPath)` et sortait en early-return mal forme.

### Correctifs v4
1. **`server/services/tenantMigration.js`** :
   - Helper `buildErrorReport()` garantit la forme complete du report (ok/dryRun/companyId/companyName/companySlug/tenantDbPath/sizeBytes=0/elapsedMs/currentStep/error/stack + toutes sections nullables).
   - Tracker `currentStep` traverse 14 phases : sanity → resolve_tenant_path → preexisting_artifact_check → open_tenant_db → schema_init → seed_stubs → copy_data → remap_orphans → fk_check → validate_orphan_fks → diff_counts → close_tenant_db → migration_done → commit_control_tower.
   - Pre-existing artifact check INTELLIGENT : lookup `tenant_databases` d'abord. Si companyId deja commit ET !dryRun → `TENANT_ALREADY_COMMITTED` (hint + commande rollback exacte). Sinon (leftover dry-run OU commit abortee sans CT entry) → cleanup auto des `.db`/`-wal`/`-shm` et on continue. Debloque le flow standard dry-run → commit.
   - Commit write (INSERT tenant_databases + INSERT tenant_status_history) isole dans son propre try/catch. Si echec : `report.ok=false`, `report.commit={attempted:true,ok:false,error}`, tenant DB preservee pour diagnostic, report migration conserve.
   - INSERT `tenant_databases` inclut desormais `lastMigrationAt=datetime('now')`.
   - Catch global autour de la phase migration : ferme tenant DB + unlink fichiers + retourne report complet (plus de tenant DB orpheline apres crash).
2. **`server/scripts/migratePilotTenant.js`** :
   - Number formatting safe-guarde : `((report.sizeBytes || 0) / 1024).toFixed(1)` + `report.elapsedMs ?? 'n/a'`.
   - Bloc `ERROR` proeminent quand `!report.ok` : code + failed-at step + stack trace complete + hints par code (`TENANT_ALREADY_COMMITTED` / `COMPANY_NOT_FOUND` / `TENANT_DIR_NOT_WRITABLE`).
   - Bloc `commit phase` : `attempted`/`ok`/`storagePath`/`error`.
   - Exit codes : 0 si ok, 3 si `TENANT_ALREADY_COMMITTED` (actionnable), 1 sinon.
   - Handler `main().catch()` imprime message + stack complete (remplace `console.error('[FATAL]', e)` qui tronquait).

### Syntax check v4
- tenantMigration.js OK
- migratePilotTenant.js OK
- tenantSchema.js OK
- controlTowerSchema.js OK

### Resultat (2026-04-16 nuit)
- **`--commit MON BILAN`** : `ok=true`, 0 FK declared, 0 FK implicit, **609 contacts** remappes vers `__deleted__` + **1 collaborator** remappe vers `__deleted_collab__`, integrity `ok`, tenant DB creee, `tenant_databases` INSERT reussi.
- **`--commit CAPFINANCES`** : `ok=true`, 0 FK declared, 0 FK implicit, 0 remap (aucun orphan), integrity `ok`, tenant DB creee, `tenant_databases` INSERT reussi.
- Les 2 companies restent en `tenantMode='legacy'`. Aucune route refactoree. Prod inchangee.

### STATUS STEP 4 : DONE
Architecture multi-tenant posee et validee sur donnees reelles. Prochaine etape = STEP 5 (cutover progressif, plan detaille dans `tasks/todo.md`).

---

## Checkpoint 2026-04-16 STEP 5 Phase 5A — Shadow mode : fondations posees (impact prod = 0)

### Contexte
Apres STEP 4 DONE (2 tenants commits), le cutover progressif commence. Phase 5A = fondations techniques SANS brancher aucune route. Choix valides par user (2026-04-16 nuit) :
- Feature flag hybride : `tenantMode` global + `tenantFeatures` JSON par feature
- Route pilote pour premier shadow : GET `/api/data/contacts`
- Company pilote pour premier shadow : CAPFINANCES (puis MON BILAN 48h plus tard)

### Garde-fous user (respectes)
- Stable stringify avec tri recursif des cles (evite faux diffs sur ordre de colonnes SQLite)
- `payloadSample` borne (~2000 chars, arrays tronques a 5 rows) pour eviter gonflement CT

### Livrables 5A
1. **`server/db/controlTowerSchema.js`** :
   - `ALTER TABLE companies ADD COLUMN tenantFeatures TEXT DEFAULT '{}'` (idempotent : try/catch sur "duplicate column")
   - Nouvelle table `tenant_shadow_diffs` (id, companyId, route, feature, timestamp, monolithHash, tenantHash, monolithRowCount, tenantRowCount, payloadSample, tenantError)
   - Index `idx_shadow_diffs_lookup (companyId, feature, timestamp DESC)`
2. **`server/db/tenantResolver.js`** :
   - `resolveTenant()` renvoie desormais `tenantFeatures` (parsed JSON, fallback `{}` si null/invalide)
   - Nouvelle fonction `getRouteMode(companyId, feature)` : kill-switch legacy global, puis `tenantFeatures[feature]`, puis fallback `tenantMode`. Fail-closed vers `'legacy'` si companyId inconnu ou erreur.
   - Export const `ROUTE_MODES = ['legacy','shadow','tenant']`
3. **`server/services/shadowCompare.js`** (NEW) :
   - `stableStringify()` : tri recursif des cles, undefined → null, Date → ISO, Buffer → base64
   - `shadowCompare({companyId, feature, route, fetchMonolith, fetchTenant})` : `Promise.allSettled`, hash sha256, INSERT diff uniquement en cas de mismatch ou tenant throw. Safe-failure absolue : aucune erreur interne ne remonte. Monolith throw → propage (comportement actuel).
4. **`server/routes/tenantAdmin.js`** (NEW, monte sur `/api/tenant-admin`, `requireAuth+requireSupra`) :
   - `GET /shadow-diffs?companyId&feature&limit&offset` — liste paginee
   - `GET /shadow-diffs/summary?hours=24` — agregat par (companyId, feature)
   - `GET /mode/:companyId` — etat routing complet
5. **`server/db/test/testShadowCompare.mjs`** (NEW) : 14 tests couvrant stableStringify, shadowCompare (match/mismatch/tenant-throw/monolith-throw), getRouteMode (kill-switch/feature-override/fallback/fail-closed), idempotence schema, table+index presence

### Syntax check 5A
- controlTowerSchema.js OK
- tenantResolver.js OK
- shadowCompare.js OK
- tenantAdmin.js OK
- testShadowCompare.mjs OK
- index.js OK

### Impact prod
- 0 (aucune route metier touchee)
- 0 (aucune company basculee en shadow ou tenant ; toutes restent en `legacy`)
- Nouvelle colonne `tenantFeatures` ajoutee de maniere additive idempotente : aucun reseed ni migration breaking.
- Nouveau endpoint `/api/tenant-admin` cablable mais sans effet cote app tant qu'aucune route ne l'utilise.

### Prochaine etape immediate
1. User : `node server/db/test/testShadowCompare.mjs` sur Mac → attendu 14/14 pass
2. User : deploy (rsync + pm2 restart) → verifier que `initControlTowerSchema()` applique l'ALTER sans bruit
3. User : smoke `GET /api/tenant-admin/mode/<capfinances_id>` avec token supra → attendu `{tenantMode:'legacy', tenantFeatures:{}, hasTenantDb:true, validModes:['legacy','shadow','tenant']}`
4. Quand OK → Phase 5B : brancher `shadowCompare` sur GET `/api/data/contacts`, puis `UPDATE companies SET tenantMode='shadow', tenantFeatures='{"contacts":"shadow"}' WHERE id=<capfinances>` et observer les diffs pendant 48h

---

## Checkpoint 2026-04-16 STEP 5 Phase 5B — Shadow wiring sur GET /api/data/contacts (code deploye en mode dormant, 0 flip SQL fait)

### Contexte
Post-Phase-5A (fondations shadow cotes CT + services OK) et apres re-enregistrement propre de CAPFINANCES + MON BILAN dans la vraie control tower prod (`/var/www/planora-data/control_tower.db`, les 2 companies en `hasTenantDb: true`, `tenantMode='legacy'`, `tenantFeatures='{}'`).

Decision user (2026-04-16) : "passer a la Phase 5B" — cabler la 1re route metier a `shadowCompare` SANS flip SQL. Le code shipping est dormant jusqu'au UPDATE CT.

### Garde-fous respectes
- Branche `legacy` du routeur strictement identique a l'avant-5B (aucun overhead, aucun changement de shape payload)
- `fetchTenant` reproduit la MEME forme que `fetchMonolith` (admin : `parseRows('contacts', rows)` ; non-admin : RAW rows, `shared_with_json` string)
- Exclusion `id != '__deleted__'` dans `fetchTenant` pour ne pas faire diff sur le placeholder insere par le remap d'orphelins (MON BILAN : 609 refs remappees)
- Erreur tenant = swallow + log CT (voir shadowCompare 5A). Jamais propagee a l'utilisateur.
- Kill-switch inchange : tant que `tenantMode='legacy'` → `getRouteMode()` renvoie `'legacy'` → zero lecture tenant.

### Livrables 5B (3 fichiers modifies)
1. **`server/db/database.js`** : `export function parseRows(...)` (ajout mot-cle `export` ligne 2042). `parseRow` etait deja exporte via `export { db, parseRow }` ligne 2289 ; `parseRows` etait prive.
2. **`server/db/tenantResolver.js`** : nouvelle fonction exportee `getTenantDbForShadow(companyId)`. Difference avec `getTenantDb` : accepte `tenantMode==='shadow'` OU `'tenant'`, refuse uniquement `'legacy'` (kill-switch) et `!dbPath`. Contrat : utilise EXCLUSIVEMENT par shadowCompare, toute erreur levee est swallow cote service.
3. **`server/routes/data.js`** :
   - Imports ajoutes : `parseRows` (database.js), `getRouteMode` + `getTenantDbForShadow` (tenantResolver.js), `shadowCompare` (services).
   - `router.get('/contacts', ...)` devient `async`. 
   - Extraction `fetchMonolith` = logique legacy EXACTE (aucune modification du SELECT, des params, de `getByCompany`, de `parseRows`).
   - Si `mode !== 'shadow'` : `return res.json(fetchMonolith())` immediatement. Zero overhead en legacy.
   - Si `mode === 'shadow'` : `fetchTenant` construit meme forme sur tenant DB + exclusion `__deleted__`, puis `shadowCompare({companyId, feature:'contacts', route:'GET /api/data/contacts', fetchMonolith, fetchTenant})` renvoie TOUJOURS monolith.

### Syntax check 5B
- database.js OK (`node --check`)
- tenantResolver.js OK
- data.js OK
- shadowCompare.js OK (non modifie — reference uniquement)

### Sauvegarde faite
- `backups/phase-5B-20260416/` : copies des 3 fichiers modifies + shadowCompare.js + tenantAdmin.js + README.md de restauration + `phase-5B.patch` (git diff sur les 2 fichiers tracks, tenantResolver.js etant untracked).

### Impact prod
- **0 tant qu'aucun flip SQL n'est fait**. Le code shadow est en place mais dormant.
- Quand flip `UPDATE companies SET tenantMode='shadow', tenantFeatures='{"contacts":"shadow"}' WHERE id='c1776169036725'` + `pm2 restart` :
  - GET `/api/data/contacts?companyId=c1776169036725` lit monolith + tenant en parallele, renvoie monolith.
  - Diffs loggues dans `tenant_shadow_diffs` CT.
  - Toutes les autres routes et toutes les autres companies inchangees.

### Prochaine etape immediate
1. User : `./deploy.sh` (backup auto pre-deploy deja fait par le script) → `pm2 status` + `pm2 logs`
2. User : smoke pre-bascule `GET /api/tenant-admin/mode/c1776169036725` → attendu `tenantMode:'legacy'`
3. User : SQL flip CAPFINANCES + `pm2 restart calendar360` (invalide metaCache)
4. User : smoke post-bascule (`/mode/:id`, `GET /contacts` avec admin CAPFINANCES, `/shadow-diffs/summary?hours=1`)
5. User : observer 48h
6. Si 0 diff : repeter pour MON BILAN (`c1772832020988`)

### Rollback immediat (si diff massif ou erreur)
- **Pas de rollback code necessaire.** SQL seul :
  `UPDATE companies SET tenantMode='legacy', tenantFeatures='{}' WHERE id='c1776169036725';` + `pm2 restart`.
- Code Phase 5B reste present mais dormant.

---

## Checkpoint 2026-04-16 v3 — Remap etendu a collaborators (post-dry-run MON BILAN)

### Contexte
Apres v2 (stubs + remap contacts), le dry-run MON BILAN a remonte un dernier blocage : `collab_heartbeat.collaboratorId` pointe vers des collaborateurs supprimes. User a valide manuellement le fix en DB (INSERT placeholder + UPDATE) et confirme que c'est le DERNIER orphan non couvert.

### Correctif v3 (generalisation du pattern)
1. **`server/services/tenantMigration.js`** : extraction d'une constante `REMAP_PARENTS` (en tete de fichier) qui liste les parents scope tenant dont les enfants peuvent avoir des refs orphelines. Le flow remap itere sur cette liste. Ajouter un parent = 1 ligne.
   - `{ parent: 'contacts', placeholderId: '__deleted__', extras: {...} }`
   - `{ parent: 'collaborators', placeholderId: '__deleted_collab__', extras: {...} }` (NOUVEAU)
2. **`server/db/test/testTenantMigration.mjs`** : +table `collab_heartbeat` synthetique (1 row valide + 1 orphan injecte `col_GHOST`), +TEST 11 (placeholder __deleted_collab__ + remap collab_heartbeat + report.remap.collaborators assertions). Tests renumerotees : TEST 12 = control tower unchanged.
3. `diffCounts` inchange : il itere deja `remapReport` donc gere le nouveau parent automatiquement (soustrait +1 au count collaborators pour la parite source/tenant).

### Impact production
- Tables touchees par le remap collaborators (via IMPLICIT_FKS) : collab_heartbeat confirmee sur MON BILAN. D'autres enfants potentiels (bookings, call_logs, notifications, tickets, etc.) n'auront un INSERT placeholder que SI orphans detectes — pas d'effet de bord sur les DBs sans orphan.
- Zero modification de la source. Zero ecriture control tower en dry-run.

### Pattern etabli pour futurs blocages
Si un dry-run futur remonte un orphan vers un parent non couvert (ex: `calendars`, `roles`) : ajouter UNE entree dans `REMAP_PARENTS`, rien d'autre. Le moteur fait le reste (detection + placeholder + UPDATE + diff adjustment).

### Syntax check 2026-04-16 v3
- tenantSchema.js OK
- tenantMigration.js OK
- migratePilotTenant.js OK
- testTenantMigration.mjs OK

### Prochaine etape immediate
1. User : `node server/db/test/testTenantMigration.mjs` (attendu : 35+ pass)
2. User : relance dry-run MON BILAN avec le moteur patche (sans modifs manuelles DB)
3. Cibles finales : `ok=true` / 0 declared violations / 0 implicit orphans / 0 mismatches / integrity='ok' / `remap.collaborators.placeholderInserted=true` / `remap.collaborators.remapped.collab_heartbeat=N`
4. Si OK : `--commit` MON BILAN cobaye

---

## Checkpoint 2026-04-16 v2 — STEP 4 durci (stubs + remap orphans)

### Contexte
Premier vrai dry-run sur snapshot VPS (prod read-only) a revele deux blocages :
1. **FK violations `companies`** : tables tenant ont `FOREIGN KEY (companyId) REFERENCES companies(id)` declare en SQL. Comme `companies` etait exclue de la tenant DB (GLOBAL), `PRAGMA foreign_key_check` a leve des violations en masse.
2. **Orphans `contacts`** : centaines de refs dans `call_logs`, `pipeline_history`, `sms_messages`, `notifications`, `conversations` pointent vers des contacts supprimes. `validateOrphanFks` a bloque `ok=true`.

### Decision utilisateur
- **Ne PAS** supprimer les FK declarees (trop risque, casse schema legacy)
- **Ne PAS** supprimer les donnees orphelines (trace metier / RGPD)
- **OUI** : stub minimal `companies` (1 ligne) dans chaque tenant DB
- **OUI** : placeholder `__deleted__` dans `contacts` + remap des refs orphelines

### Correctifs appliques (v2)

1. **`server/db/tenantSchema.js`**
   - +`TENANT_STUB_TABLES = new Set(['companies'])`
   - `listTenantTables` / `listTenantIndexes` : incluent les stubs (filter `!GLOBAL || STUB`)
   - `computeMigrationOrder` : n'ignore plus les FK vers stubs → `companies` ordonnee avant `collaborators`, `calendars`, etc.

2. **`server/services/tenantMigration.js`**
   - +`seedTenantStubs(sourceDb, tenantDb, companyId)` : pour chaque stub, copie la ligne matching companyId. Throw si absente.
   - +`remapOrphansForParent(tenantDb, companyId, parent, placeholderId, extras)` : generique, detecte orphans via IMPLICIT_FKS, insere placeholder, UPDATE refs. Idempotent.
   - +`insertPlaceholderRow` : auto-remplit colonnes NOT NULL sans defaut (0 pour INT, '' pour TEXT, Buffer.alloc(0) pour BLOB)
   - `migrateCompany` reordonne : schema → FK OFF → stubs → copy → remap → FK ON → PRAGMA checks → diffCounts
   - `diffCounts` ajuste : stubs comparent `COUNT(*) WHERE id=companyId` source vs tenant ; placeholders soustraient +1 au count tenant

3. **`server/scripts/migratePilotTenant.js`** : CLI affiche `stubs seeded` + `remap orphans` avec breakdown par table enfant.

4. **`server/db/test/testTenantMigration.mjs`** : passe de 21 a 30+ assertions. Ajout tables `pipeline_history` (3 rows dont 2 orphelins injectes), 3 nouvelles suites :
   - TEST 8 : stub companies present + 1 seule ligne + id=companyId + pas de fuite C2
   - TEST 9 : placeholder `__deleted__` insere + refs orphelines remappees + 0 orphan apres remap
   - TEST 10 : `remapOrphansForParent` idempotent (2e appel = no-op)

### Flow de migration final
```
1. pragma foreign_keys = OFF
2. initTenantSchemaFromSource (cree structures + stubs)
3. seedTenantStubs (1 ligne companies)
4. copyTenantData (direct + indirect, skip stubs)
5. remapOrphansForParent(contacts, __deleted__)
6. pragma foreign_keys = ON
7. PRAGMA foreign_key_check (doit etre []])
8. PRAGMA integrity_check (doit etre 'ok')
9. validateOrphanFks (doit etre [])
10. diffCounts (doit avoir 0 mismatch)
```

### Invariants garantis
- Source JAMAIS modifiee (readonly + query_only)
- Control tower JAMAIS ecrit en dry-run
- Zero fuite cross-tenant (stub filtre par id = companyId)
- Parite source/tenant sur toutes les tables (compte ajuste pour placeholder)
- Historique preserve (remap au lieu de delete)

### Prochaine etape
1. User rebuild natifs sur Mac (si non fait)
2. `node server/db/test/testTenantMigration.mjs` → attendre 30+ pass
3. Re-dry-run sur snapshot VPS MON BILAN DE COMPETENCES + CAPFINANCES
4. Cibles : `ok=true`, `0 mismatches`, `0 implicit orphans`, `0 declared violations`, `integrity='ok'`
5. Si OK : commit STEP 4 (inscrit tenant_databases, `tenantMode` reste `legacy`, pas de cutover)

---

> **REGLE** : A chaque evolution importante du projet, proposer automatiquement une mise a jour de ce fichier CONTEXT.md.
