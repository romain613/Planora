# HANDOFF V1.11 STABLE — Module Modèles d'interaction (scripts/questionnaires/checklists)

> **Date** : 2026-04-29
> **Tag** : `v1.11-stable`
> **Statut** : ✅ Phases 1→6 LIVE et VALIDÉES
> **Demandeur** : MH

---

## 1. Résumé exécutif

V1.11 livre le module complet **Scripts / Questionnaires / Checklists** dans Pipeline Live + Fiche contact :
- Création en 1 clic (3 boutons barre d'action)
- Saisie en cours d'appel avec autosave 800ms
- showByDefault lazy (limite 5/scope)
- Visibilité par contact (responses)
- Export CSV admin
- Bloc 🧠 Résumé en tête formulaire avec format `LABEL ✅ Oui`

**6 phases livrées**, 8 tags Git, 2 tables DB, 14 endpoints, 1 composant React autonome (≈600 lignes), tests UI 7/7 OK validés MH.

---

## 2. Pile complète (phases 1→6)

| Phase | Livrable | Tag | Commit |
|---|---|---|---|
| 1 | Doc règles métier figées | `v1.11-phase1-rules` | `94944c48` |
| 2 | DB schema (2 tables + 10 indexes + UNIQUE) | `v1.11-phase2-db-schema` | `3b597146` |
| 3 | Backend 14 endpoints | `v1.11-phase3-backend` | `86244942` |
| 4 | UI Pipeline Live | `v1.11-phase4-ui-pipeline` | `c95edd21` |
| 4-V | Validation tests UI 7/7 | `v1.11-phase4-validated` | `a11c99ba` |
| 5 | UI Fiche contact (8e onglet) | `v1.11-phase5-ui-fiche` | `a3372663` |
| 5-UX | Lisibilité + hiérarchie visuelle | `v1.11-phase5-ux` | `920ef032` |
| **6** | **Export CSV + finalisation stable** | **`v1.11-stable`** | (ce commit) |

---

## 3. Endpoints backend (14)

### 3.1 Templates (`/api/interaction-templates`)

| # | Méthode | Path | Permissions |
|---:|---|---|---|
| 1 | GET | `/` | auth (filtre auto perms) |
| 2 | POST | `/` | auth (admin si scope=company) |
| 3 | GET | `/:id` | auth + visibilité |
| 4 | PUT | `/:id` | owner ou admin |
| 5 | DELETE | `/:id` | owner ou admin (soft si responses) |
| 6 | POST | `/:id/duplicate` | auth (vers personal du caller) |
| 7 | POST | `/:id/toggle-default` | owner ou admin (limite 5/scope) |

### 3.2 Responses (`/api/interaction-responses`)

| # | Méthode | Path | Permissions |
|---:|---|---|---|
| 8 | GET | `/by-contact/:contactId` | auth + companyId strict |
| 9 | GET | `/export` | auth (CSV — utilisé par bouton UI) |
| 10 | POST | `/by-contact/:contactId` | auth (idempotent UNIQUE) |
| 11 | GET | `/:id` | owner contact + filler + admin |
| 12 | PUT | `/:id` | filler ou admin (audit post-completed) |
| 13 | POST | `/:id/complete` | filler ou admin |
| 14 | DELETE | `/:id` | admin only |

---

## 4. Schéma DB

### 4.1 `interaction_templates` (13 cols + 4 indexes)

```sql
id PK | companyId | createdByCollaboratorId | type | title | description |
scope | showByDefault | content_json | active | version | createdAt | updatedAt
```

Indexes : `company`, `company+scope`, `creator`, `showByDefault` partial.

### 4.2 `interaction_responses` (12 cols + 6 indexes)

```sql
id PK | companyId | templateId | templateType | contactId | collaboratorId |
status | answers_json | callLogId | completedAt | createdAt | updatedAt
```

Indexes : **UNIQUE(templateId, contactId, collaboratorId)** + 5 autres (contact / template / company / collab+company / callLogId partial).

---

## 5. Frontend — composants livrés

### 5.1 `app/src/features/interactions/InteractionTemplatesPanel.jsx` (≈600 lignes)

Composant autonome utilisé en 2 emplacements :

| Emplacement | Fichier | Ligne |
|---|---|---|
| Pipeline Live > onglet Script | [PhoneTab.jsx](app/src/features/collab/tabs/PhoneTab.jsx) | sub-tab `phoneRightTab==='script'` |
| Fiche contact > onglet "📋 Modèles" | [CrmTab.jsx](app/src/features/collab/tabs/CrmTab.jsx) | `collabFicheTab==='modeles'` |

### 5.2 Sous-composants inline (mutualisés)

- `TemplateEditor` — modale création/modification (3 types)
- `ScriptEditor` / `QuestionnaireEditor` / `ChecklistEditor` — éditeurs typés
- `ResponseFiller` — saisie avec autosave 800ms (lazy create + complete)
- `ResponseSummary` — bloc 🧠 Résumé en tête (format `LABEL ✅ Oui`)
- `ScriptViewer` / `QuestionnaireFiller` / `ChecklistFiller` — fillers typés
- `TemplateRow` — ligne template avec CTA principal + menu ⋯
- `MenuItem` — entrée menu dropdown
- `SectionHeading` — heading de section

### 5.3 UX clés

- **Barre d'action** : 3 boutons grands (+ Script / + Formulaire / + Checklist)
- **Filtres** : Tous / Mes modèles / Company + dropdown type + bouton Export CSV (admin)
- **Sections** : ★ Activés par défaut / 📋 Disponibles / ✓ Réponses contact
- **TemplateRow** : icône type colorée + titre + scope/count + CTA "Démarrer"/"Reprendre" + menu ⋯ (Modifier/Dupliquer/★/Supprimer)
- **ResponseFiller** : header sticky + 🧠 Résumé live + filler typé + bouton "Terminer"
- **Spacing** : padding 12px 14px, fontSize 13, hiérarchie visuelle claire

---

## 6. État DB en prod (post-validation)

| Table | Rows | Statut |
|---|---:|---|
| `interaction_templates` | 1 | tests MH actifs |
| `interaction_responses` | 5 | tests MH actifs |
| `call_forms` (legacy) | 0 | conservée — UI sub-tab forms encore branchée |
| `call_form_responses` (legacy) | 0 | conservée |
| `company_scripts` (legacy) | 0 | conservée |
| `collaborators.call_scripts_json` | sérialisé | lecture compat (sub-tab forms) |

→ DB integrity ok, FK 0 violation, 14 routes interaction-* HTTP 401.

---

## 7. Cleanup tables legacy — décision Phase 6

**Décision** : ❌ **NE PAS DROP en V1.11**, ✅ conserver (cohérent règles métier §L "DROP candidat V2").

**Raison** : audit code Phase 6 a révélé que `call_forms` est encore activement référencé par :
- `server/routes/callForms.js` (200 lignes, mounté `/api/call-forms`)
- `server/index.js` mount actif
- Frontend `PhoneTab.jsx` lignes 2707, 2790, 2794 (sub-tab forms en cours d'utilisation)
- Frontend `AdminCallFormsScreen.jsx` (UI admin dédiée)
- Frontend `CollabPortal.jsx` + `AdminDash.jsx`

DROP casserait le sub-tab "forms" Pipeline Live + l'écran admin call_forms. **Anti-régression prioritaire**.

**Plan V2** (à valider MH avant exécution) :
1. Phase A : déprécier le sub-tab "forms" en frontend (badge "legacy, utiliser Modèles")
2. Phase B : migrer les call_forms restantes vers `interaction_templates` (migration script)
3. Phase C : supprimer routes + UI admin + DROP tables

**Tables `call_form_responses` et `company_scripts`** : techniquement DROPpables (0 ref active) mais conservées par symétrie pour ne pas créer d'incohérence avec call_forms.

---

## 8. Anti-régression vérifié

| Module | Statut |
|---|:---:|
| Pipeline Live (sub-tabs forms / fiche / appels / sms / history / infos / action) | ✅ intacts |
| Fiche contact (7 onglets existants notes / messages / sms / history / appels / docs / suivi) | ✅ intacts |
| Onglet partage conditionnel | ✅ intact |
| Phase 4 UI Pipeline (composant mutualisé) | ✅ identique entre Pipeline et Fiche |
| Backend Phase 3 | ✅ inchangé |
| Leads V1.10.6.1 (hard delete) | ✅ inchangé |
| Custom fields V1.10.5 | ✅ inchangé |
| Appels (call_logs) | ✅ inchangé (lien lazy callLogId, pas de FK SQL) |
| `phoneCallScripts` legacy (`collaborators.call_scripts_json`) | ✅ lecture compat |

---

## 9. Workflow strict 11 étapes — bilan Phase 6

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST audit cleanup | ✅ usages call_forms identifiés |
| 2 | FIX export CSV button | ✅ Btn admin ajouté avec fetch token-aware |
| 3 | re-TEST | ✅ build OK |
| 4 | DEPLOY | ✅ Bundle `index-6MFZuIW_.js` |
| 5 | Healthcheck | ✅ uptime 17s, integrity ok, FK ok |
| 6 | COMMIT | ✅ (ce commit) |
| 7 | PUSH | ✅ origin/clean-main |
| 8 | MERGE | N/A (pas de merge main) |
| 9 | TAG | ✅ `v1.11-stable` |
| 10 | BACKUP VPS | ✅ tarball md5 `38bb2607` (2.1 MB) |
| 11 | SECURITY | ✅ 14 routes 401 + integrity + FK + companyId stricte |

---

## 10. Backups VPS verrouillés (V1.11 cumul)

| Backup | md5 | Contenu |
|---|---|---|
| `v111-phase2-db-20260429.tar.gz` | `48715419` | DB schema |
| `v111-phase3-backend-20260429.tar.gz` | `498b9d49` | Backend 14 endpoints |
| `v111-phase4-ui-pipeline-20260429.tar.gz` | `8e33d0c1` | UI Pipeline |
| `v111-phase4-validated-20260429.tar.gz` | `845c1db0` | Snapshot post-validation |
| `v111-phase5-fiche-20260429.tar.gz` | `12227f0f` | UI Fiche contact |
| `v111-phase5ux-20260429.tar.gz` | `2f8518eb` | UX améliorations |
| **`v111-stable-20260429.tar.gz`** | **`38bb2607`** | **Snapshot final stable** |

DB sha256 final : `ac50bc5a4ee4ebedae1d28fbab868ea5e46107ad49113cc95b7f9c0939080aa2`

Contenu `v111-stable` : DB prod + control_tower + 6 fichiers code + bundle `index-6MFZuIW_.js`.

---

## 11. Bundle live

`https://calendar360.fr/assets/index-6MFZuIW_.js`

---

## 12. Tags Git V1.11 cumulés (8)

```
v1.11-phase1-rules           (94944c48)
v1.11-phase2-db-schema       (3b597146)
v1.11-phase3-backend         (86244942)
v1.11-phase4-ui-pipeline     (c95edd21)
v1.11-phase4-validated       (a11c99ba)
v1.11-phase5-ui-fiche        (a3372663)
v1.11-phase5-ux              (920ef032)
v1.11-stable                 (ce commit) ← VERROU FINAL
```

---

## 13. Anomalie héritée — DB fantôme (toujours en suspens)

⚠ `server/calendar360.db*` toujours tracké dans repo PUBLIC GitHub (commit `c4312619`, 800 Ko).

**Hors scope V1.11**. Décision MH attendue entre 3 options (cf [AUDIT-DB-FANTOM-PLAN-2026-04-29.md](AUDIT-DB-FANTOM-PLAN-2026-04-29.md) §1bis) :
- A) `git rm --cached` (simple, blob reste historique)
- B) `git filter-repo` + force-push (purge complète)
- C) Repo neuf privé

PM2 utilise correctement `/var/www/planora-data/calendar360.db` — pas d'impact runtime.

---

## 14. Reprise nouvelle session

1. Lire MEMORY.md (auto-loaded)
2. Lire ce HANDOFF en priorité
3. État runtime stable : pm2 PID renouvelé, bundle `index-6MFZuIW_.js` LIVE, integrity ok
4. Si MH demande extension → workflow strict 11 étapes, backup pre obligatoire
5. Si MH ne demande rien → standby
6. Anomalie DB fantôme : décision MH à demander si nouvelle session sur ce sujet

---

**V1.11 STABLE — module Modèles d'interaction LIVE et VALIDÉ. Aucune dette technique introduite.**
