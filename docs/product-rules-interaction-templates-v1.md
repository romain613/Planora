# Règles métier — Modèles d'interaction (v1, figé 2026-04-29)

**Statut** : v1 validée MH, 2026-04-29. Source de vérité produit pour tout le chantier V1.11 "Modèles d'interaction" (phases 2 → 6).

**Principe directeur** :

> Un modèle = une **structure** vide.
> Une réponse = des **données** remplies par un collaborateur sur un contact.
> Création rapide, utilisation fluide en appel, sauvegarde sans friction.
> Aucune complexification : si une fonctionnalité n'est pas utilisée en situation réelle d'appel, elle ne va pas en V1.

---

## A. Concepts

| Terme | Sens | Stockage |
|---|---|---|
| **Template** | structure réutilisable (script, questionnaire, ou checklist) | `interaction_templates` |
| **Réponse** | instance remplie par un collaborateur pour un contact donné | `interaction_responses` |
| **Type** | nature du template : `script`, `questionnaire`, `checklist` | colonne `type` |
| **Scope** | visibilité : `personal` (créateur seul) ou `company` (toute l'entreprise) | colonne `scope` |
| **showByDefault** | option : "afficher automatiquement sur toutes les fiches contacts" | colonne `showByDefault` |

**Règle stricte** : un template ne contient **jamais** de données réponse. Une réponse référence toujours un template existant via `templateId`.

---

## B. Les 3 types de templates — formats figés

### B.1 — Script (5 sections)

Conçu pour guider un appel commercial. Affiché en lecture pendant l'appel + saisie de notes.

```json
{
  "steps":      [{ "id": "s1", "label": "Étape 1", "text": "...", "subSteps": [...] }],
  "notes":      "Notes générales du script (mémo collaborateur)",
  "objections": [{ "id": "o1", "label": "Objection client", "response": "Réponse type" }],
  "keyPhrases": [{ "id": "k1", "label": "Phrase clé", "context": "" }],
  "cta":        { "label": "CTA final", "text": "..." }
}
```

### B.2 — Questionnaire (8 types de champs)

Conçu pour collecter des données structurées sur un contact pendant un appel.

```json
{
  "fields": [
    {
      "id": "f_xxx",
      "label": "Question",
      "type": "text" | "textarea" | "yesno" | "single" | "multiple" | "date" | "number" | "url",
      "required": false,
      "options": ["A", "B", "C"],   // requis pour single + multiple uniquement
      "helpText": ""
    }
  ]
}
```

| `type` | UI input | Stockage réponse |
|---|---|---|
| `text` | input ligne courte | string |
| `textarea` | textarea | string |
| `yesno` | toggle / 2 boutons | `"yes"` ou `"no"` |
| `single` | radio buttons | string (option choisie) |
| `multiple` | checkboxes | array de strings |
| `date` | date picker | ISO `YYYY-MM-DD` |
| `number` | input numérique | number |
| `url` | input avec validation URL | string |

### B.3 — Checklist (3 états)

Conçu pour valider point par point une conformité ou un déroulé.

```json
{
  "items": [
    { "id": "i_xxx", "label": "Item à valider", "helpText": "" }
  ]
}
```

Réponse : chaque item a un état parmi `validated`, `refused`, `neutral` (défaut `neutral`).

---

## C. Création d'un template

**Champs communs aux 3 types** :

| Champ | Obligatoire | Comportement |
|---|---|---|
| `title` | ✅ | Affiché partout |
| `description` | ❌ | Aide contextuelle |
| `type` | ✅ | `script` / `questionnaire` / `checklist` (immuable après création) |
| `scope` | ✅ | `personal` (défaut) / `company` (admin only) |
| `showByDefault` | ❌ | `false` (défaut) / `true` |
| `content_json` | ✅ | Format selon §B |

**Auteur** : `createdByCollaboratorId` = collab caller (immuable).

**Création autorisée** : tout collab pour scope `personal`. Admin/supra uniquement pour scope `company`.

---

## D. Permissions par action

| Action | scope `personal` | scope `company` |
|---|---|---|
| Créer | tout collab | admin / supra uniquement |
| Voir | seul `createdByCollaboratorId` + admin | tous collabs de la company |
| Modifier | `createdByCollaboratorId` ou admin | admin uniquement |
| Supprimer | `createdByCollaboratorId` ou admin | admin uniquement |
| Dupliquer (vers `personal` du caller) | tout collab | tout collab |
| Toggle `showByDefault` | `createdByCollaboratorId` ou admin | admin uniquement |

**Règle d'or** : un collab ne peut pas modifier un template `company`. Il peut le **dupliquer** vers son scope `personal` puis modifier la copie.

---

## E. Suppression d'un template

| Cas | Action backend |
|---|---|
| 0 réponse rattachée | **Hard delete** (DELETE FROM interaction_templates) |
| ≥ 1 réponse rattachée | **Soft delete** : `active = 0`. Templates inactifs disparaissent des listes mais leurs réponses restent consultables sur les fiches contacts (statut "template archivé"). |

**Audit** : toute suppression est loguée via `audit_logs` (action `interaction_template_deleted`).

---

## F. Cycle de vie d'une réponse

```
[user ouvre fiche contact]
    │
    ├─► template.showByDefault = 1 → réponse créée lazy en 'draft'
    │
    └─► user clique "Démarrer" sur un template → réponse 'draft'
                                                       │
                                                       ▼
                                          [user remplit, autosave 800ms]
                                                       │
                                                       ▼
                                          [user clique "Terminer"]
                                                       │
                                                       ▼
                                                  status = 'completed'
                                                  completedAt = ISO now
```

**Règles** :

1. **1 réponse unique** par triplet `(templateId, contactId, collaboratorId)` (UNIQUE constraint DB).
2. Si 2 collabs remplissent le même template sur le même contact → 2 réponses distinctes (cohérent : l'auteur compte).
3. **Modification post-`completed`** autorisée : owner (`collaboratorId`) ou admin uniquement, avec audit log.
4. **Pas de versioning V1** : chaque modification écrase la précédente. Si MH veut un historique en V2, ajouter table `interaction_response_history`.
5. **Pas de suppression utilisateur** : seul admin peut supprimer une réponse (hard delete avec audit).

---

## G. `showByDefault` — comportement

| État | Effet |
|---|---|
| `showByDefault = 0` (défaut) | Template invisible sauf si user le démarre explicitement |
| `showByDefault = 1` (template `personal`) | Apparaît sur fiches contacts vues par le créateur uniquement |
| `showByDefault = 1` (template `company`) | Apparaît sur fiches contacts vues par tous collabs de la company |

**Création lazy** : la `interaction_response` n'est créée **qu'à la 1ère ouverture** de la fiche contact (pas en bulk pour tous contacts existants à l'activation du flag). Évite explosion de rows.

**Limite UI** : 5 templates `showByDefault` simultanés par scope max. Au-delà, UI affiche "Trop de modèles par défaut, masquez-en certains" (sécurité UX).

---

## H. Lien réponse ↔ appel (`callLogId`)

Optionnel. Pendant un appel actif :

- Si user ouvre un template → la réponse créée porte `callLogId = <id de l'appel en cours>`
- Permet reporting "tous les questionnaires remplis pendant tel appel"
- Hors appel : `callLogId = ''`

**Pas de FK SQL** : lien lazy via JOIN, aucun trigger DB. Si le call_log est supprimé, la réponse reste (callLogId orphelin acceptable).

---

## I. Affichage UX — règles strictes

### I.1 — Onglet Script (Pipeline Live)

**Barre d'action en haut, 3 boutons en 1 clic** :

```
[+ Nouveau script]  [+ Nouveau formulaire]  [+ Nouvelle checklist]
```

3 sections en dessous :

1. **Modèles disponibles** — tous templates accessibles selon permissions
2. **Modèles activés par défaut** — sous-ensemble avec `showByDefault = 1`
3. **Réponses récentes** — `interaction_responses` du collab connecté, triées date

### I.2 — Fiche contact

Nouvel onglet dédié `📋 Modèles` (à côté de `appels`, `docs`, `suivi`).

2 sections :

1. **Réponses du contact** — toutes `interaction_responses` rattachées (toutes status, tous collabs si admin)
2. **Modèles disponibles** — templates `showByDefault = 1` + ceux assignables manuellement

### I.3 — Pendant un appel

Sub-panel droit du Pipeline Live affiche :

- Templates `showByDefault = 1` pré-affichés
- Saisie temps réel avec **autosave debounce 800ms**
- Indicateur visuel "saving…" pendant écriture
- Status `draft` → `completed` au clic "Terminer"

---

## J. Sécurité — invariants non-négociables

1. ✅ Filtre `WHERE companyId = ?` sur **toutes** les requêtes templates et responses
2. ✅ Aucune jointure cross-company possible
3. ✅ `requireAuth + enforceCompany` middleware sur les 14 endpoints
4. ✅ Permissions admin enforcées **côté backend** (jamais uniquement côté UI)
5. ✅ Audit log pour : create/update/delete template, delete response, modification post-completed

---

## K. Ce qui ne casse PAS

| Module | Garantie |
|---|---|
| **Pipeline Live** | sub-tab Scripts existant gardé en lecture compat tant que la migration UI n'est pas finalisée |
| **CRM (FicheContactModal)** | les 7 onglets actuels (`notes`, `messages`, `sms`, `history`, `appels`, `docs`, `suivi`) restent intacts. Ajout 8e onglet `📋 Modèles` |
| **Appels (call_logs)** | aucune modification. Lien `callLogId` lazy, sans FK |
| **Leads** (V1.10.6.1 stable) | aucun croisement direct |
| **Contacts CRM** | aucune modification de schéma `contacts.*`. Aucun trigger |
| **Custom fields** (V1.10.5) | structure séparée. `custom_fields_json` ≠ `interaction_responses.answers_json` |

---

## L. Tables existantes — sort

| Table | V1 (maintenant) | V2 (futur) |
|---|---|---|
| `call_forms` (vide) | conserver intacte | DROP candidat après audit zéro régression |
| `call_form_responses` (vide) | conserver intacte | DROP candidat |
| `company_scripts` (vide) | conserver intacte | DROP candidat |
| `collaborators.call_scripts_json` | lecture compat read-only (UI Pipeline Live) | migration auto si non-vide |
| `collaborators.ai_script_trame` | inchangée (hors scope, AI) | inchangée |

**Règle** : aucun DROP en V1. Le cleanup est une étape Phase 6 conditionnée à 0 régression observée.

---

## M. Décisions figées Q1-Q12 + P1-P3

### Q1-Q12 (audit §H — recos par défaut validées MH 2026-04-29)

| # | Décision |
|---|---|
| Q1 | Templates `personal` par défaut, opt-in `company` (admin only) |
| Q2 | Création template `company` : admin / supra uniquement |
| Q3 | Collab ne peut pas modifier template `company` ; il peut **dupliquer** vers `personal` |
| Q4 | Modification réponse `completed` autorisée pour owner + admin avec audit log |
| Q5 | Pas de versioning V1. Snapshot écrasé. V2 si besoin |
| Q6 | `showByDefault` apparaît sur tous contacts (existants ET nouveaux) en mode lazy (création réponse à la 1ère ouverture) |
| Q7 | Export CSV V1 (filtres template, dates, collab) |
| Q8 | Onglet dédié `📋 Modèles` dans fiche contact (pas bloc dans notes) |
| Q9 | 3 anciennes tables conservées V1 ; DROP candidat V2 |
| Q10 | Filtres UI : "Tous / Mes modèles / Company" |
| Q11 | Limite 5 `showByDefault` simultanés par scope (sécurité UX) |
| Q12 | Lien réponse ↔ call_log via `callLogId` optionnel |

### P1-P3 (précisions MH validées 2026-04-29)

| # | Décision |
|---|---|
| P1 | Checklist 3 états : `validated` / `refused` / `neutral` |
| P2 | Questionnaire 8 types : `text` / `textarea` / `yesno` / `single` / `multiple` / `date` / `number` / `url` |
| P3 | Script 5 sections : `steps` / `notes` / `objections` / `keyPhrases` / `cta` |

---

## N. Anti-usine-à-gaz — limites V1

**Volontairement HORS V1, pour livrer rapide et utile** :

- ❌ Versioning historique des réponses → si demande, V2 avec table `interaction_response_history`
- ❌ Conditional logic (ex: question 3 visible si question 2 = "oui") → V2 si MH le demande
- ❌ Templates partagés cross-company → jamais (sécurité)
- ❌ AI assist génération template → V2 (lien possible avec `ai_script_trame`)
- ❌ Multi-langue → V2
- ❌ Templates publics (URL externe pour répondants non-collab) → utiliser table `forms` séparée (hors scope)
- ❌ Workflow validation/approbation des templates `company` → V2
- ❌ Notifications complexes ("X a complété un questionnaire sur Y") → V2

**V1 = strict minimum pour usage en situation réelle d'appel.**

---

## O. Commandes de référence (à utiliser pendant développement)

```sql
-- Compter les templates par company / type / scope
SELECT companyId, type, scope, COUNT(*) FROM interaction_templates
WHERE active = 1 GROUP BY companyId, type, scope;

-- Réponses d'un contact
SELECT * FROM interaction_responses
WHERE contactId = ? AND companyId = ?
ORDER BY updatedAt DESC;

-- Templates showByDefault d'une company
SELECT * FROM interaction_templates
WHERE companyId = ? AND active = 1 AND showByDefault = 1
ORDER BY type, title;

-- Audit suppression
SELECT * FROM audit_logs
WHERE action IN ('interaction_template_deleted', 'interaction_response_deleted')
ORDER BY createdAt DESC LIMIT 100;
```

---

**Source de vérité — toute déviation V1 doit être validée explicitement par MH.**
**Document figé 2026-04-29. Mises à jour V1.x via amendement nommé en bas de page.**
