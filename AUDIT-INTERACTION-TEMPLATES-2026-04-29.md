# AUDIT READ-ONLY — Évolution onglet Scripts → Modèles d'interaction (Scripts + Questionnaires + Checklists)

> **Date** : 2026-04-29
> **Auteur** : Claude Code (Opus 4.7) — mission audit READ-ONLY
> **Demandeur** : MH
> **Mode** : READ-ONLY strict — aucune modification code/DB/config/déploiement
> **Contexte** : V1.10.4 P1 phase d'observation active + V1.10.5 Phase 2 custom fields en attente validation
> **Périmètre** : Pipeline Live > onglet Scripts → transformation en espace "Modèles d'interaction"

---

## 0. TL;DR

🟢 **Très bonne nouvelle** : tables existantes (`call_forms`, `call_form_responses`, `company_scripts`) sont **toutes VIDES en prod** (0 rows × 6 companies). **Aucune migration nécessaire**, on peut redessiner l'architecture sans risque casse.

🟡 **Existant à 30% — infrastructure fantôme** :
- 2 tables présentes mais jamais peuplées
- 3 routes API CALLÉES côté frontend mais **JAMAIS implémentées** (les POST se perdent silencieusement)
- 1 sub-tab Scripts en `PhoneTab.jsx` rendu mais sans persistance backend
- 0 lien fiche contact

🔴 **Recommandation** : **Option 2 — créer `interaction_templates` + `interaction_responses`** (architecture neuve, propre, unifiée). Pas de regret de migration vu que les 3 tables existantes sont vides.

---

## A. Diagnostic système Scripts actuel

### A.1 État backend

| Table existante | Rôle prévu | Rows prod | Routes API | État |
|---|---|---:|---|---|
| `call_forms` | Questionnaires d'appel | **0** | ❌ AUCUNE route impl. | Fantôme |
| `call_form_responses` | Réponses formulaires | **0** | ❌ POST callé mais 404 backend | Cassé |
| `company_scripts` | Scripts company-wide | **0** | ❌ Jamais exposée | Orphelin |
| `collaborators.call_scripts_json` (colonne) | Scripts personnels | sérialisé | ❌ Routes inexistantes | localStorage fallback uniquement |
| `collaborators.ai_script_trame` (colonne) | Scripts AI | sérialisé | ❓ À vérifier (hors scope) | Inconnu |

**Tables liées hors scope** :
- `forms` / `form_submissions` : formulaires publics (sites publics, pas Pipeline Live)
- `pipeline_templates` : templates de pipeline (V1.8.19, distinct)

### A.2 Routes appelées par le frontend mais inexistantes backend

| Route | Frontend caller | Statut |
|---|---|---|
| `GET /api/call-forms` | (jamais set, `collabCallForms` undefined) | ❌ |
| `GET /api/call-forms/:id/responses?contactId=` | PhoneTab.jsx:2835 | ❌ |
| `POST /api/call-forms/:id/respond` | PhoneTab.jsx:2831 | ❌ |
| `PUT /api/collaborators/:id/call-scripts` | CollabPortal.jsx:1703 | ❌ |

→ **Les POST partent dans le vide**. Frontend ne reçoit pas d'erreur visible (catch silencieux ou pas de error UI).

### A.3 Frontend Pipeline Live > onglet Scripts

**Fichier** : [app/src/features/collab/tabs/PhoneTab.jsx](app/src/features/collab/tabs/PhoneTab.jsx)

- **Sub-tab "Scripts"** : `phoneRightTab === 'script'` (lignes ~1614-1667)
  - Dropdown sélection script via `phoneActiveScriptId`
  - Liste `phoneCallScripts` (depuis `collaborators.call_scripts_json` parse)
  - Affichage étapes hiérarchique (step + sub-steps)
  - **Read-only** : aucune saisie / persistance
  
- **Sub-tab "Forms"** : (lignes ~2746-2851)
  - Iteration sur `collabCallForms` (variable jamais hydratée → toujours vide)
  - Support 7 types de fields : `text`, `select`, `radio` (oui/non), `rating` (1-10), `date`, `nombre`, `textarea`
  - Bouton "Enregistrer" → POST `/api/call-forms/:id/respond` (route inexistante → silence)

**State Pipeline Live** :
- `phoneActiveScriptId`, `setPhoneActiveScriptId`
- `phoneCallScripts` (liste personnelle)
- `collabCallForms` (jamais set)
- `scriptResponses` (?) à confirmer

### A.4 Frontend Fiche contact

**Fichier** : [app/src/features/collab/tabs/crm/fiche/FicheContactModal.jsx](app/src/features/collab/tabs/crm/fiche/FicheContactModal.jsx)

- 7 onglets actuels : `notes`, `messages`, `sms`, `history`, `appels`, `docs`, `suivi`
- **Aucun onglet** "Scripts" ou "Questionnaires"
- **Aucun bloc** affichant les réponses passées d'un contact à un script/form

### A.5 Limites actuelles

1. **Persistance impossible** : 4 routes manquantes côté backend
2. **Pas de typage** : un seul concept "script" (pas de distinction script vs questionnaire vs checklist)
3. **Pas de scope clair** : personnel vs company mélangé (2 sources de stockage)
4. **Pas de lien contact** : aucune relation contact ↔ réponse
5. **Pas d'option "afficher par défaut"** : aucune config
6. **Pas d'admin UI** : seul collab voit ses scripts personnels via dropdown
7. **Données silencieusement perdues** : POST forme cassé sans warning

---

## B. Tables / routes / composants existants — résumé

### B.1 Tables (à conserver pour backward compat ou réutiliser)

```sql
-- Table call_forms (vide, 0 rows)
CREATE TABLE call_forms (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  fields_json TEXT,         -- JSON array de questions
  assignedCollabs_json TEXT, -- JSON array collabIds
  active INTEGER DEFAULT 1,
  responseCount INTEGER DEFAULT 0,
  createdAt TEXT
);

-- Table call_form_responses (vide, 0 rows)
CREATE TABLE call_form_responses (
  id TEXT PRIMARY KEY,
  formId TEXT NOT NULL,
  companyId TEXT NOT NULL,
  contactId TEXT NOT NULL,
  collaboratorId TEXT NOT NULL,
  data_json TEXT,
  callLogId TEXT,
  createdAt TEXT
);

-- Table company_scripts (vide, 0 rows, orpheline)
CREATE TABLE company_scripts (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  script_type TEXT,
  title TEXT,
  content TEXT,
  category TEXT,
  createdAt TEXT
);
```

### B.2 Routes existantes

**Aucune** route impl. spécifique pour scripts/forms côté backend. Tout est fantôme.

### B.3 Composants frontend

- [PhoneTab.jsx](app/src/features/collab/tabs/PhoneTab.jsx) (sub-tab Scripts + sub-tab Forms)
- [CollabPortal.jsx:1703](app/src/features/collab/CollabPortal.jsx#L1703) (PUT call-scripts)
- Aucun dans `FicheContactModal.jsx`

---

## C. Proposition architecture DB

### C.1 Recommandation : Option 2 — table unifiée `interaction_templates` + `interaction_responses`

**Justification** :
- 0 données à migrer (call_forms vide, company_scripts vide, call_form_responses vide)
- Architecture propre avec 3 types unifiés (script / questionnaire / checklist)
- Scope explicite (personal vs company)
- Lien contact ↔ réponse first-class
- Extensible (futur : reporting, IA, analytics)

### C.2 Schéma proposé

```sql
CREATE TABLE interaction_templates (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  createdByCollaboratorId TEXT NOT NULL,
  type TEXT NOT NULL,                  -- 'script' | 'questionnaire' | 'checklist'
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  scope TEXT DEFAULT 'personal',       -- 'personal' | 'company'
  showByDefault INTEGER DEFAULT 0,     -- 0 | 1
  content_json TEXT NOT NULL DEFAULT '[]',
  -- format content_json :
  -- script:        [{ id, label, sub_steps?: [{label}] }]
  -- questionnaire: [{ id, label, type, required, options?, helpText? }]
  -- checklist:     [{ id, label, helpText? }]
  active INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX idx_int_tmpl_company ON interaction_templates(companyId);
CREATE INDEX idx_int_tmpl_company_scope ON interaction_templates(companyId, scope);
CREATE INDEX idx_int_tmpl_creator ON interaction_templates(createdByCollaboratorId);


CREATE TABLE interaction_responses (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  templateId TEXT NOT NULL,
  contactId TEXT NOT NULL,
  collaboratorId TEXT NOT NULL,        -- qui a rempli
  status TEXT DEFAULT 'draft',         -- 'draft' | 'completed'
  answers_json TEXT NOT NULL DEFAULT '{}',
  -- format answers_json :
  -- questionnaire: { question_id: value, ... }
  -- checklist:     { item_id: 'green' | 'red' | null, ... }
  -- script:        { notes: '...', step_id: 'note', ... }
  callLogId TEXT DEFAULT '',           -- lien optionnel appel
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(templateId, contactId, collaboratorId)
  -- 1 instance unique par (template, contact, collab)
  -- (modifiable, draft → completed)
);

CREATE INDEX idx_int_resp_contact ON interaction_responses(contactId);
CREATE INDEX idx_int_resp_template ON interaction_responses(templateId);
CREATE INDEX idx_int_resp_company ON interaction_responses(companyId);
```

### C.3 Tables existantes — sort proposé

| Table | Action |
|---|---|
| `call_forms` | Conserver (vide) — futurs imports legacy ou DROP en V2 |
| `call_form_responses` | Conserver (vide) — DROP en V2 |
| `company_scripts` | Conserver (vide) — DROP en V2 |
| `collaborators.call_scripts_json` | Conserver, deprecate progressivement |
| `collaborators.ai_script_trame` | Inchangé (hors scope, lié AI) |

→ **Aucun DROP immédiat** pour éviter régression silencieuse. Cleanup en V2 (Phase 6 documentation).

---

## D. Proposition UX

### D.1 Onglet Scripts (Pipeline Live) → "Modèles d'interaction"

**Renommer** sub-tab `Scripts` en `Modèles` ou conserver `Scripts` avec tabs internes :

```
┌──────────────────────────────────────────────────┐
│ 📋 Modèles d'interaction                          │
│ ────────────────────────────────────────────────  │
│ [+ Nouveau script] [+ Questionnaire] [+ Checklist] │
│                                                    │
│ Filtres : [Tous ▼] [Mes modèles] [Company]        │
│                                                    │
│ ┌─────────────────────────────────────────────┐  │
│ │ 📞 Script découverte client                  │  │
│ │ Type: script · Scope: personnel              │  │
│ │ ☐ Afficher par défaut                        │  │
│ │ 12 étapes · Modifié 3 jours                  │  │
│ │ [Modifier] [Dupliquer] [×]                   │  │
│ └─────────────────────────────────────────────┘  │
│                                                    │
│ ┌─────────────────────────────────────────────┐  │
│ │ ❓ Questionnaire qualification               │  │
│ │ Type: questionnaire · Scope: company         │  │
│ │ ☑ Afficher par défaut                        │  │
│ │ 8 questions · 142 réponses · Modifié 1 sem   │  │
│ │ [Modifier] [Dupliquer] [×]                   │  │
│ └─────────────────────────────────────────────┘  │
│                                                    │
│ ┌─────────────────────────────────────────────┐  │
│ │ ☑ Checklist conformité dossier              │  │
│ │ Type: checklist · Scope: personnel           │  │
│ │ ☐ Afficher par défaut                        │  │
│ │ 6 items · Modifié hier                       │  │
│ │ [Modifier] [Dupliquer] [×]                   │  │
│ └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### D.2 Modal de création (selon type)

**Script** : éditeur d'étapes hiérarchique (existant en partie)
**Questionnaire** : builder questions (label, type, required, options si select)
**Checklist** : liste items (label, helpText optionnel)

Champs communs :
- Titre (obligatoire)
- Description (optionnel)
- Scope : `personnel` (défaut) ou `company` (admin uniquement)
- Checkbox "Afficher par défaut sur les fiches contacts"

### D.3 Affichage Pipeline Live pendant un appel

Sub-panel droit pendant `phoneActiveCall` :
- Tab "Modèles disponibles" liste les templates assignables au contact actuel
- Click → instantiate `interaction_response` (status='draft')
- Saisie en temps réel → autosave debounce 800ms
- Indicateur status (draft / completed)

### D.4 Fiche contact (FicheContactModal) — nouveau bloc/onglet

**Option A** : Onglet dédié `📋 Modèles` (entre `appels` et `docs`)
- Liste des `interaction_responses` du contact (par template)
- Pour chaque : statut, date, dernière modif
- Bouton "Reprendre" / "Voir réponses"
- Section "Modèles disponibles" en bas pour démarrer un nouveau

**Option B** : Bloc dans onglet `notes` (similaire à FicheCustomFields)
- Plus compact mais moins lisible si beaucoup de modèles

→ **Reco** : Option A (onglet dédié) — meilleure scalabilité.

### D.5 Affichage par défaut sur fiche

Si `template.showByDefault === 1` :
- Le template apparaît automatiquement dans l'onglet `📋 Modèles` du contact
- Une `interaction_response` est créée à la première ouverture (status='draft')
- Si déjà répondu, affiche le statut existant

### D.6 Saisie en cours d'appel

Pendant `phoneActiveCall`, le sub-panel droit affiche :
- Si template `showByDefault = company` → pré-sélectionné automatiquement
- Sinon : dropdown de sélection
- Saisie en temps réel synchronisée avec la fiche

---

## E. Règles de sécurité

### E.1 Isolation par companyId

- **TOUS** les SELECT / INSERT / UPDATE / DELETE filtrent strictement sur `companyId`
- Backend `requireAuth + enforceCompany` middleware sur toutes les routes
- Pour role admin/supra : accès cross-collab dans la company (mais pas cross-company sauf supra)

### E.2 Scope `personal` vs `company`

| Action | personal scope | company scope |
|---|---|---|
| Créer | n'importe quel collab | admin uniquement |
| Voir | seul `createdByCollaboratorId` | tous collabs de la company |
| Modifier | `createdByCollaboratorId` ou admin | admin uniquement |
| Supprimer | `createdByCollaboratorId` ou admin | admin uniquement |
| Dupliquer (scope→personal) | tous collabs | tous collabs |

### E.3 Réponses

- `interaction_responses.collaboratorId` = qui a rempli
- Visibilité : owner du contact (`contacts.assignedTo`) + dans `shared_with` + admin
- Modification : seul collab qui a rempli ou admin
- 1 réponse unique par `(templateId, contactId, collaboratorId)` (UNIQUE constraint DB)

### E.4 Anti-fuite cross-company

- Aucune jointure cross-company possible (companyId obligatoire)
- Si un collab change de company (rare), ses templates personnels restent attachés à l'ancienne company (ou migration explicite)

---

## F. Plan d'implémentation par phases

### Phase 1 — Confirmations préalables (READ-ONLY, 0.5j)

- F1.1 — Audit existing routes côté frontend (PhoneTab, CollabPortal)
- F1.2 — Vérifier que `collabCallForms` peut être supprimé sans casse (assignedCollabs_json)
- F1.3 — Vérifier que `phoneCallScripts` peut être migré vers nouveau système
- F1.4 — Décider du format `content_json` exact pour les 3 types
- **Livrable** : note de confirmation MH

### Phase 2 — DB schema (0.5j)

- F2.1 — Créer `interaction_templates` table + 3 indexes
- F2.2 — Créer `interaction_responses` table + 3 indexes + UNIQUE constraint
- F2.3 — Migration script idempotent (`db.exec` au boot avec try/catch)
- F2.4 — Pas de DROP des anciennes tables (call_forms, etc.)
- F2.5 — Aucune donnée à migrer (toutes les tables sources sont vides)

### Phase 3 — Backend routes (1.5j)

```
GET    /api/interaction-templates                  list (filtre scope+permission)
POST   /api/interaction-templates                  create
PUT    /api/interaction-templates/:id              update
DELETE /api/interaction-templates/:id              delete
POST   /api/interaction-templates/:id/duplicate    duplicate

GET    /api/contacts/:id/interaction-responses     list responses for contact
GET    /api/interaction-responses/:id              get response detail
POST   /api/contacts/:id/interaction-responses     create (start filling)
PUT    /api/interaction-responses/:id              update answers
DELETE /api/interaction-responses/:id              delete (admin only)
```

Tests : curl scripts pour chaque endpoint + permissions.

### Phase 4 — UI Pipeline Live (sub-tab Scripts → Modèles) (2j)

- F4.1 — Refonte sub-tab existant : 3 boutons création
- F4.2 — Modals création (script / questionnaire / checklist)
- F4.3 — Liste filtrée (personal / company / all)
- F4.4 — Saisie en temps réel pendant appel + autosave 800ms
- F4.5 — Migration soft `phoneCallScripts` → nouveau système (lecture compat)

### Phase 5 — UI Fiche contact (1.5j)

- F5.1 — Nouvel onglet `📋 Modèles` dans `FicheContactModal.jsx`
- F5.2 — Liste responses existantes (statut, date, modifs)
- F5.3 — Section "Modèles disponibles" + auto-créés via `showByDefault`
- F5.4 — Modal de saisie réponses (réutilise composants Phase 4)
- F5.5 — Lecture/modification (selon permissions)

### Phase 6 — Documentation + Cleanup (0.5j)

- F6.1 — `docs/interaction-templates-v1.md`
- F6.2 — Update CLAUDE.md
- F6.3 — Cleanup tables anciennes (DROP `call_forms`, `call_form_responses`, `company_scripts` après confirmation MH)
- F6.4 — HANDOFF V1.11 ou V1.10.6

**Total estimé : 6-7 jours-homme** (DB + backend + 2 UI + docs).

---

## G. Risques

| # | Risque | Sévérité | Mitigation |
|---|---|:---:|---|
| R1 | Régression sub-tab Scripts existant lors refonte | 🟡 | Garder `phoneCallScripts` legacy en lecture jusqu'à migration UI complète |
| R2 | Perte UX en cours d'appel (saisie temps réel) | 🟡 | Autosave debounce + indicateur visuel "saving…" |
| R3 | UNIQUE `(templateId, contactId, collaboratorId)` cassé si conflit cross-collab | 🟢 | Acceptable : 1 collab = 1 instance par template. Si 2 collabs sur même contact : 2 instances distinctes (cohérent) |
| R4 | Performance : 50 templates × 5000 contacts × 10 collabs = 2.5M responses potentielles | 🟢 | Indexes en place. Utilisation réelle bien plus faible |
| R5 | Permission collab modifie template `company` | 🔴 | Backend strict : `req.auth.role === 'admin'` requis |
| R6 | Déshabilitation backend silencieuse (POST 404 actuel) si nouvelle route bug | 🟡 | Frontend doit afficher erreur visible si POST échoue |
| R7 | Champs `fields_json` → `content_json` rename casse l'existant | 🟢 | Aucun existant à casser (call_forms vide) |
| R8 | Concurrent V1.10.4 P1 + V1.10.5 P2 en attente validation | 🟡 | Ne PAS démarrer ce chantier avant validation Phase 2 + V1.10.4 P1 stable |
| R9 | Migration future si format `content_json` change | 🟡 | Ajouter `version` field dans templates pour migrer en lot |
| R10 | UX trop chargée si beaucoup de templates `showByDefault` | 🟡 | Limite UI : 5 max showByDefault par scope, sinon collapsible |

---

## H. Questions à valider MH

| # | Question | Reco par défaut |
|---|---|---|
| Q1 | Templates `personnels` par défaut ou `company` ? | **personal** par défaut, opt-in `company` (admin only) |
| Q2 | Qui peut créer un template global `company` ? | **admin / supra uniquement** |
| Q3 | Un collab peut-il modifier un template `company` ? | **NON** (admin uniquement). Peut **dupliquer** vers personal |
| Q4 | Une réponse peut-elle être modifiée après `status=completed` ? | **OUI** par le collab qui a rempli + admin (avec audit log) |
| Q5 | Historiser chaque version (versioning) ? | **NON V1** (juste snapshot current). V2 si besoin reporting historique |
| Q6 | Template `showByDefault` apparaît sur tous contacts existants ou seulement nouveaux ? | **Tous existants ET nouveaux** (lazy : créé `interaction_response` à la 1ère ouverture fiche) |
| Q7 | Réponses dans exports / reporting ? | **OUI V1** : export CSV par template (filtre contact + collab + dates) |
| Q8 | Onglet dédié dans fiche ou bloc dans `notes` ? | **Onglet dédié** "📋 Modèles" |
| Q9 | Conserver les 3 anciennes tables (`call_forms`, etc.) ? | **OUI** jusqu'à validation V2 ; DROP en Phase 6 si zéro régression |
| Q10 | Permissions UI : chaque collab voit "Mes modèles" + "Company" ? | **OUI** filtres "Tous / Mes modèles / Company" |
| Q11 | Limite N max `showByDefault` simultanés ? | **5 par scope** (UX) |
| Q12 | Lien `interaction_responses ↔ call_logs` (lié à un appel précis) ? | **OUI optional** : `callLogId` field, peuplé pendant appel actif |

---

## I. GO / NO-GO

### Décision recommandée : 🟢 **GO Audit validé** + **NO-GO immédiat sur l'implémentation**

**Justifications GO audit** :
- Diagnostic clair (3 tables vides, 4 routes manquantes, 1 sub-tab fantôme)
- Aucune migration nécessaire
- Architecture propre proposée (`interaction_templates` + `interaction_responses`)
- Plan en 6 phases, 6-7 jours-homme

**Justifications NO-GO immédiat** :
- ⚠ Phase d'observation V1.10.4 P1 active (24h+ démarrée 2026-04-28)
- ⚠ V1.10.5 Phase 2 custom fields en attente validation MH
- ⚠ Workflow strict : ne pas accumuler 3 chantiers en parallèle
- 12 questions à trancher MH avant Phase 1

**Conditions de démarrage** :
1. Validation V1.10.4 P1 (observation 24h+ stable, OK MH)
2. Validation V1.10.5 Phase 2 custom fields (test réel + GO Phase 3 mapping)
3. Réponses MH aux 12 questions Q1-Q12
4. Création `docs/product-rules-interaction-templates-v1.md` (cadrage produit, similaire à `product-rules-lead-envelopes-v1.md`)

**Ordre recommandé chantiers** :
1. ✅ V1.10.4 P1 — phase observation (en cours)
2. ⏸ V1.10.5 Phase 2 custom fields — validation MH attendue
3. ⏸ V1.10.5 Phase 3 UI mapping — après validation Phase 2
4. ⏸ V1.11 Interaction Templates — après V1.10.5 stabilisée

→ **Cet audit prépare le terrain** mais le démarrage est conditionné aux 2 chantiers en cours.

---

## CONTRAINTES RESPECTÉES

- ✅ READ-ONLY — aucune modification code/DB/config/déploiement
- ✅ Aucun code écrit ou patch proposé
- ✅ V1.10.4 P1 phase d'observation préservée (chantier indépendant)
- ✅ V1.10.5 Phase 2 préservée (chantiers distincts)
- ✅ Tables existantes conservées (pas de DROP)
- ✅ Compatibilité backward (call_forms / call_scripts_json restent en place)
- ✅ Isolation par companyId préservée

---

**Document audit READ-ONLY — Aucune modification code, DB, config, déploiement effectuée.**
**STOP. En attente :**
1. **Réponses MH aux 12 questions Q1-Q12** (§H)
2. **Validation cadrage produit** (création doc règles métier)
3. **Stabilisation V1.10.4 P1 + V1.10.5 Phase 2** avant démarrage Phase 1 implémentation
