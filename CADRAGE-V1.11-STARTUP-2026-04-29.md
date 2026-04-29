# CADRAGE V1.11 — Démarrage module Scripts / Questionnaires / Checklists

> **Date** : 2026-04-29
> **Demandeur** : MH
> **Mode** : cadrage de démarrage, **0 code écrit**
> **Document parent** : [AUDIT-INTERACTION-TEMPLATES-2026-04-29.md](AUDIT-INTERACTION-TEMPLATES-2026-04-29.md) (493 lignes — diagnostic complet)

---

## 0. TL;DR

✅ **Audit complet déjà livré** ce matin (493 lignes). Architecture validée par MH alignée avec recommandation Option 2 : `interaction_templates` + `interaction_responses`.

✅ **Conditions de démarrage réunies** depuis V1.10.6.1 stable (2026-04-29 08:00) :
- V1.10.4 P1 : ✅ phase observation passée
- V1.10.5 Phase 2 + 3 + enrich diagnostic : ✅ validés MH
- V1.10.6 + V1.10.6.1 : ✅ verrouillés stables (tag `v1.10.6.1-stable`)

🟡 **12 questions Q1-Q12 de l'audit** toujours en attente de validation MH. Ce document précise les **3 nouveaux détails** apportés par MH dans sa demande de démarrage et propose un plan d'attaque actionnable.

⚠ **Aucune implémentation** dans ce document. Reste à valider :
1. Réponses aux 12 questions (annexe §H de l'audit + précisions §3 ci-dessous)
2. Création doc règles métier `docs/product-rules-interaction-templates-v1.md`
3. GO Phase 1

---

## 1. Référence audit existant — résumé 1 page

L'audit du 2026-04-29 06:22 a déjà couvert exhaustivement :

| Section audit | Conclusion clé |
|---|---|
| §A Diagnostic actuel | 3 tables vides + 4 routes manquantes + sub-tab Scripts fantôme |
| §B Tables/routes/composants existants | Inventaire complet (call_forms, call_form_responses, company_scripts, collaborators.call_scripts_json + ai_script_trame) |
| §C Architecture DB | `interaction_templates` (10 colonnes) + `interaction_responses` (9 colonnes) + 6 indexes + 1 UNIQUE constraint |
| §D Proposition UX | 3 boutons création + filtres scope + onglet dédié fiche contact |
| §E Sécurité | Isolation companyId stricte + scope personal/company + matrices permissions |
| §F Plan 6 phases | DB → Backend → UI Pipeline → UI Fiche → Docs (6-7 j-h) |
| §G Risques | 10 risques classifiés (R1-R10) |
| §H 12 questions MH | Q1-Q12 avec recos par défaut |
| §I GO/NO-GO | NO-GO immédiat, GO conditionnel (3 préreqs) |

**Lecture obligatoire pour tout développeur reprenant le chantier** : audit complet en référence.

---

## 2. État conditions de démarrage — RÉ-ÉVALUÉES

| Préreq audit | Statut 2026-04-29 06:22 | Statut 2026-04-29 08:00 |
|---|---|---|
| V1.10.4 P1 phase observation 24h+ | ⏳ démarrée 28/04 | ✅ passée stable |
| V1.10.5 Phase 2 custom fields validation MH | ⏸ attente | ✅ validée + enrichie Phase 3 + diagnostic clos |
| V1.10.5 Phase 3 UI mapping | non démarrée | ✅ déployée + LIVE |
| V1.10.6 hard delete enveloppe | non démarrée | ✅ tag `v1.10.6-envelope-hard-delete` |
| V1.10.6.1 hard delete bulk leads | non démarrée | ✅ tag `v1.10.6.1-stable` (verrou final) |

→ **Tous les préreqs sont remplis**. V1.11 peut démarrer.

---

## 3. Précisions MH ajoutées dans la demande de démarrage

L'audit initial a couvert l'essentiel mais MH a apporté **3 précisions** qui doivent être intégrées avant Phase 1 :

### 3.1 Checklist — 3 états explicites (audit disait 'green/red/null')

**Demande MH** :
> La checklist doit permettre : `validé` / `refusé` / `neutre`

**Format `answers_json` final** :
```json
{
  "<itemId>": "validated" | "refused" | "neutral",
  ...
}
```

→ Remplace la spec audit `'green' | 'red' | null`. Plus lisible et exportable.

### 3.2 Questionnaire — 8 types de champs (audit disait 7)

**Demande MH** :
> Champs possibles : texte court, texte long, oui/non, choix unique, choix multiple, date, nombre, URL

**Format `content_json` field** :
```json
{
  "id": "f_xxx",
  "label": "Question",
  "type": "text" | "textarea" | "yesno" | "single" | "multiple" | "date" | "number" | "url",
  "required": false,
  "options": [...],   // pour single/multiple uniquement
  "helpText": ""
}
```

**Différence vs audit** :
- Audit avait `text, select, radio, rating, date, nombre, textarea` (7, dont `rating 1-10` pas demandé par MH)
- MH ajoute `choix multiple` et `URL`, retire `rating`

### 3.3 Script — 5 sections structurées

**Demande MH** :
> Un script doit permettre : étapes texte, notes, objections, phrases clés, CTA final

**Format `content_json` final** :
```json
{
  "steps": [
    { "id": "s1", "label": "Étape 1", "text": "...", "subSteps": [...] }
  ],
  "notes": "Notes générales du script",
  "objections": [
    { "id": "o1", "label": "Objection client", "response": "Réponse type" }
  ],
  "keyPhrases": [
    { "id": "k1", "label": "Phrase clé", "context": "" }
  ],
  "cta": { "label": "CTA final", "text": "..." }
}
```

→ Remplace l'audit qui proposait juste `[{ id, label, sub_steps }]`. Structure plus riche, alignée business call.

---

## 4. Schéma DB final consolidé (audit + précisions MH)

### 4.1 `interaction_templates`

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
  content_json TEXT NOT NULL DEFAULT '{}',
  -- script:        { steps:[], notes:'', objections:[], keyPhrases:[], cta:{} }
  -- questionnaire: { fields:[{id,label,type,required,options?,helpText?}] }
  -- checklist:     { items:[{id,label,helpText?}] }
  active INTEGER DEFAULT 1,
  version INTEGER DEFAULT 1,           -- pour migrations futures de format
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX idx_int_tmpl_company ON interaction_templates(companyId);
CREATE INDEX idx_int_tmpl_company_scope ON interaction_templates(companyId, scope);
CREATE INDEX idx_int_tmpl_creator ON interaction_templates(createdByCollaboratorId);
CREATE INDEX idx_int_tmpl_show_default ON interaction_templates(companyId, showByDefault) WHERE showByDefault = 1;
```

**Évolution vs audit** : ajout colonne `version INTEGER DEFAULT 1` + index partiel `showByDefault` pour requête rapide "templates à afficher par défaut".

### 4.2 `interaction_responses`

```sql
CREATE TABLE interaction_responses (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  templateId TEXT NOT NULL,
  templateType TEXT NOT NULL,          -- snapshot type au moment de la réponse (resilience si template modifié)
  contactId TEXT NOT NULL,
  collaboratorId TEXT NOT NULL,        -- qui a rempli
  status TEXT DEFAULT 'draft',         -- 'draft' | 'completed'
  answers_json TEXT NOT NULL DEFAULT '{}',
  -- questionnaire: { <fieldId>: <value>, ... }
  -- checklist:     { <itemId>: 'validated'|'refused'|'neutral', ... }
  -- script:        { notes:'...', usedSteps:[stepId,...], usedObjections:[oId,...] }
  callLogId TEXT DEFAULT '',           -- lien optionnel vers call_logs
  completedAt TEXT DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(templateId, contactId, collaboratorId)
);

CREATE INDEX idx_int_resp_contact ON interaction_responses(contactId);
CREATE INDEX idx_int_resp_template ON interaction_responses(templateId);
CREATE INDEX idx_int_resp_company ON interaction_responses(companyId);
CREATE INDEX idx_int_resp_collab ON interaction_responses(collaboratorId, companyId);
CREATE INDEX idx_int_resp_calllog ON interaction_responses(callLogId) WHERE callLogId != '';
```

**Évolutions vs audit** :
- Ajout `templateType` (snapshot pour résilience si template modifié)
- Ajout `completedAt` (transition draft → completed traçable)
- Ajout 2 indexes (collab+company, callLogId partiel)

### 4.3 Tables existantes — sort

| Table | Décision V1.11 | Décision V2 |
|---|---|---|
| `call_forms` | Conserver intacte (vide) | DROP candidat |
| `call_form_responses` | Conserver intacte (vide) | DROP candidat |
| `company_scripts` | Conserver intacte (vide) | DROP candidat |
| `collaborators.call_scripts_json` | Lecture compat (read-only) | Migration auto si non-vide en V2 |
| `collaborators.ai_script_trame` | Inchangée (hors scope, AI) | Inchangée |

---

## 5. Endpoints — version finale (audit + précisions)

### 5.1 Templates

```
GET    /api/interaction-templates                    list — filtre scope+permission+type
       Query : ?type=script|questionnaire|checklist&scope=personal|company|all
POST   /api/interaction-templates                    create — body {type, title, description, scope, showByDefault, content_json}
GET    /api/interaction-templates/:id                detail
PUT    /api/interaction-templates/:id                update
DELETE /api/interaction-templates/:id                delete (soft : active=0 si réponses existent, sinon hard)
POST   /api/interaction-templates/:id/duplicate      duplicate (vers personal du caller)
POST   /api/interaction-templates/:id/toggle-default toggle showByDefault (admin si scope=company)
```

### 5.2 Responses

```
GET    /api/contacts/:id/interaction-responses       list responses for contact (toutes, scoped companyId)
GET    /api/interaction-responses/:id                detail
POST   /api/contacts/:id/interaction-responses       create — body {templateId} (status='draft', answers_json='{}')
PUT    /api/interaction-responses/:id                update answers (autosave)
POST   /api/interaction-responses/:id/complete       transition draft → completed (+ completedAt)
DELETE /api/interaction-responses/:id                delete (admin only, audit)
GET    /api/interaction-responses/export             CSV export (Q7) - filtre template, dates, collab
```

**Authentification** : tous endpoints `requireAuth + enforceCompany`. Permissions admin enforcées en backend pour scope=company create/update/delete.

---

## 6. UX — récap selon demande MH

### 6.1 Onglet "Script" (Pipeline Live)

```
┌─────────────────────────────────────────────────────┐
│ 📋 Modèles d'interaction                             │
│                                                       │
│ [+ Nouveau script] [+ Questionnaire] [+ Checklist]   │
│ ────────────────────────────────────────────────────  │
│ Filtres : [Tous ▼] [Mes modèles] [Company]           │
│                                                       │
│ ┌─────── Modèles disponibles ───────┐                │
│ │ • Script découverte client          │                │
│ │   12 étapes · personnel · ☐        │                │
│ │ • Checklist conformité              │                │
│ │   6 items · company · ☑ par défaut │                │
│ └─────────────────────────────────────┘                │
│                                                       │
│ ┌─── Modèles activés par défaut ────┐                │
│ │ • Questionnaire qualif (☑)          │                │
│ └─────────────────────────────────────┘                │
│                                                       │
│ ┌── Réponses récentes (mes contacts) ──┐              │
│ │ • Marie Dupont · Questionnaire qualif  │              │
│ │   completed · il y a 2h                │              │
│ │ • Jean Martin · Script découverte      │              │
│ │   draft · maintenant                    │              │
│ └─────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────┘
```

### 6.2 Modals création (3 types)

**Champs communs** :
- Titre (obligatoire)
- Description
- Scope : `personal` (défaut) / `company` (admin only)
- ☐ Afficher par défaut sur les fiches contacts

**Spécifique script** : éditeur 5 sections (étapes hiérarchique + notes + objections + phrases clés + CTA)
**Spécifique questionnaire** : builder 8 types fields (cf §3.2)
**Spécifique checklist** : liste items + helpText

### 6.3 Fiche contact — onglet "📋 Modèles" (recommandé)

```
┌──────────────────────────────────────────────┐
│ Onglets fiche : … appels · docs · 📋 Modèles  │
│                                                │
│ ┌─── Réponses du contact ───┐                  │
│ │ • Questionnaire qualif      │                  │
│ │   ✓ completed 2h            │                  │
│ │   [Voir réponses]           │                  │
│ │                              │                  │
│ │ • Script découverte         │                  │
│ │   ⋯ draft (3/12 étapes)     │                  │
│ │   [Reprendre]               │                  │
│ └──────────────────────────────┘                  │
│                                                │
│ ┌── Modèles disponibles ───┐                  │
│ │ • Checklist conformité     │                  │
│ │   [Démarrer]               │                  │
│ │ • Nouveau questionnaire    │                  │
│ │   [Démarrer]               │                  │
│ └──────────────────────────────┘                  │
└──────────────────────────────────────────────┘
```

`showByDefault` templates apparaissent automatiquement dans "Modèles disponibles" + crée `interaction_response` lazy à la 1ère ouverture (status='draft').

---

## 7. 12 questions à valider MH (audit §H + 3 précisions §3)

| # | Question | Reco audit | Précisions MH demande | Décision MH |
|---|---|---|---|:---:|
| Q1 | Templates personnels par défaut ? | personal | (implicite : oui) | ⏸ |
| Q2 | Qui crée company global ? | admin/supra | (implicite : oui) | ⏸ |
| Q3 | Collab modifie company template ? | NON, peut dupliquer | (implicite : oui) | ⏸ |
| Q4 | Modifier réponse `completed` ? | OUI par owner+admin avec audit | (à confirmer) | ⏸ |
| Q5 | Versioning historique ? | NON V1, snapshot only | (à confirmer) | ⏸ |
| Q6 | `showByDefault` sur contacts existants ? | OUI lazy | (à confirmer) | ⏸ |
| Q7 | Export CSV reporting ? | OUI V1 | (à confirmer) | ⏸ |
| Q8 | Onglet dédié vs bloc notes ? | onglet dédié | "bloc OU onglet" → onglet dédié recommandé | ⏸ |
| Q9 | DROP anciennes tables ? | conserver V1, DROP V2 | (à confirmer) | ⏸ |
| Q10 | Filtres "Tous/Mes/Company" ? | OUI | (implicite : oui via "modèles disponibles" / "activés par défaut" / "réponses") | ⏸ |
| Q11 | Limite N showByDefault ? | 5 par scope | (à confirmer) | ⏸ |
| Q12 | Lien `interaction_responses ↔ call_logs` ? | OUI optional callLogId | (implicite : oui) | ⏸ |

**Précisions §3 supplémentaires à valider** :
| # | Précision | Décision MH |
|---|---|:---:|
| P1 | Checklist 3 états : `validated` / `refused` / `neutral` (vs audit `green/red/null`) | ⏸ |
| P2 | Questionnaire 8 types : text / textarea / yesno / single / multiple / date / number / url (rating retiré) | ⏸ |
| P3 | Script 5 sections : steps / notes / objections / keyPhrases / cta (vs audit steps only) | ⏸ |

---

## 8. Plan d'implémentation par phases — actualisé

| Phase | Livrable | Durée | Dépendances |
|---|---|---|---|
| **Phase 0** Validation cadrage | Réponses MH 12 Q + 3 P + GO | 0.5j MH | Lecture audit + ce doc |
| **Phase 1** Doc règles métier | `docs/product-rules-interaction-templates-v1.md` | 0.5j Claude | Phase 0 |
| **Phase 2** DB schema | 2 tables + 8 indexes + UNIQUE + migration idempotent boot | 0.5j | Phase 1 |
| **Phase 3** Backend routes | 14 endpoints + tests curl | 2j | Phase 2 |
| **Phase 4** UI Pipeline Live | Onglet Script refondu + 3 modals création + filtres + autosave | 2j | Phase 3 |
| **Phase 5** UI Fiche contact | Onglet "📋 Modèles" + showByDefault lazy + reprise draft | 1.5j | Phase 4 |
| **Phase 6** Export + cleanup | CSV export + handoff + memory + DROP audit | 0.5j | Phase 5 |

**Total : 7 jours-homme** (vs 6-7j audit initial). Augmentation de 0.5j due aux précisions MH (5 sections script + 8 types + 3 états checklist) qui ajoutent complexité UI.

**Workflow strict 11 étapes** appliqué à chaque phase.

---

## 9. Risques actualisés (audit §G + nouveaux)

| # | Risque | Sév | Mitigation |
|---|---|:---:|---|
| R1-R10 | (cf audit §G — toujours valides) | — | inchangé |
| **R11** | Format `content_json` script (5 sections) trop complexe pour V1 | 🟡 | Découper UI en sub-modals : étapes / objections / phrases / CTA dans des écrans séparés |
| **R12** | UX questionnaire 8 types : effort builder trop lourd pour V1 | 🟡 | Démarrer avec 4 types : text, textarea, yesno, single. Ajouter multi/date/number/url en V1.1 |
| **R13** | Collision avec `forms` / `form_submissions` (tables publiques existantes) | 🟢 | Namespace clair : `interaction_*` pour appel, `forms_*` pour public. Documenter |
| **R14** | Migration `collaborators.call_scripts_json` non-vide en prod | 🟢 | À ce jour 0 collab a peuplé cette colonne. Vérifier en Phase 0 et migrer si besoin (1 collab × 1 company) |
| **R15** | Performance reporting V1 si beaucoup de réponses | 🟢 | Index partiels + LIMIT par défaut. Pagination V1.1 |

---

## 10. Régressions à monitorer (cf demande MH "ne pas casser")

| Module | Risque V1.11 | Mitigation |
|---|---|---|
| Pipeline Live | sub-tab Scripts existant fantôme — refonte → casse possible si autre code lit `phoneCallScripts` | Phase 3 : grep `phoneCallScripts` exhaustif, garder lecture compat |
| CRM (FicheContactModal) | Ajout onglet → potentiel conflit avec onglets existants (notes, messages, etc.) | Phase 5 : tests visuels stricts sur 7 onglets actuels |
| Appels (call_logs) | Lien `interaction_responses.callLogId` → potentielle FK cascade | Pas de FK SQL : lien lazy via JOIN. Aucun trigger DB |
| Leads (V1.10.6.1) | Aucun croisement direct | Aucun |
| Fiches contacts | Lazy creation `interaction_response` à l'ouverture fiche → potentiel ralentissement render | Phase 5 : load async non-bloquant + fallback skeleton |
| Custom fields (V1.10.5) | Aucun croisement direct (custom_fields_json vs interaction_responses séparés) | Aucun |

---

## 11. Conditions de démarrage Phase 1

✅ Préreqs runtime : V1.10.6.1 stable verrouillé (tag `v1.10.6.1-stable`)
⏸ **Réponses MH** aux 12 questions Q1-Q12 + 3 précisions P1-P3 (§7)
⏸ **GO MH** explicite sur le plan 7 phases (§8)
⏸ **Création doc règles métier** (Phase 1) avant tout code

---

## CONTRAINTES RESPECTÉES

- ✅ **Aucune implémentation** code/DB/config/déploiement effectuée
- ✅ **Audit existant** référencé et non duplicé
- ✅ **Conditions de démarrage** vérifiées (DB tables toujours vides : `call_forms=0, call_form_responses=0, company_scripts=0`)
- ✅ **3 précisions MH** intégrées (checklist 3 états / 8 types fields / 5 sections script)
- ✅ **Pas de régression** : aucun module critique touché par ce cadrage

---

**Document de cadrage de démarrage. STOP. En attente :**
1. **Réponses MH 12 Q + 3 P** (§7)
2. **GO Phase 1** (création `docs/product-rules-interaction-templates-v1.md`)
3. **Validation plan 7 phases** (§8)

Une fois validation reçue → exécution Phase 1 (workflow strict 11 étapes).
