# Pipeline Templates v1 — Cadrage produit & architecture

**Statut** : conception figée, non démarrée
**Date** : 2026-04-21
**Source** : validation MH de la conception complète (message du 2026-04-21 post-audit Pipeline Live)
**Prérequis bloquant** : clôture de la phase d'observation Pipeline Live (2026-04-21 → ~2026-05-01) sans apparition de nouveau cas de lock non libéré.

---

## 0. Règle d'or du document

Ce document est **la source de vérité produit** pour la feature Templates Admin de Pipeline. Toute décision d'implémentation doit s'y référer. Toute évolution de cadrage passe par un amendement explicite ici, pas par dérive silencieuse dans le code ou les commits.

Si le code diverge de ce document, c'est le document qui a raison jusqu'à amendement validé MH. Même règle que `docs/product-rules-lead-envelopes-v1.md`.

---

## 1. Objectif produit

Permettre à un admin company de créer des **templates de pipeline** prêts à l'emploi (immobilier, closing, relance, assurance, onboarding, etc.), puis de décider à la création de chaque collaborateur s'il travaille :

- en **mode libre** (comportement legacy, DEFAULT_STAGES frontend + stages custom company) — défaut
- en **mode template imposé** (snapshot figé d'un template, non modifiable par le collab)

La cible est de standardiser les équipes commerciales en gardant une **couche évolutive**, pas un remplacement brutal du système actuel.

---

## 2. Invariants non-négociables

Ces 8 règles priment sur toute autre demande. Elles reflètent les décisions prises lors du cadrage et ne peuvent être remises en cause qu'en amendant ce document.

1. **Les collaborateurs existants restent en mode libre par défaut.** Aucune migration brutale n'est supposée.
2. **Un collab en mode template ne peut PAS modifier son pipeline.** Ni colonne ajoutée, ni supprimée, ni renommée, ni réordonnée, ni recolorée.
3. **Double verrou** UI + backend sur l'enforcement. L'UI cache les boutons, le backend rejette les tentatives (403 + audit_log). Jamais UI seule.
4. **Snapshot figé à l'assignation.** Un collab ne référence jamais un template live. Il pointe sur un snapshot immuable. Une nouvelle version de template crée un nouveau snapshot ; les collabs existants restent sur l'ancien tant qu'une migration explicite n'est pas déclenchée.
5. **Aucune auto-propagation.** Quand l'admin édite ou publie une nouvelle version de template, rien ne change pour les collabs déjà assignés sans action admin explicite. Pas d'auto-sync, jamais.
6. **Pre-flight check systématique** pour toute opération qui affecte des contacts existants (assignation d'un template, suppression d'une colonne, migration de version). L'admin voit la liste des contacts concernés avant de confirmer.
7. **Aucune perte de données silencieuse.** Un contact dont le stage disparaît d'un template est migré explicitement vers un stage choisi par l'admin (jamais vers un "bit bucket" ou caché).
8. **v1 = scope company uniquement.** Le multi-brand (templates partagés entre companies d'un même brand) est une extension v2 traitée séparément.

---

## 3. État de l'existant (référence 2026-04-21)

Vérifié directement sur la base prod `calendar360.db` :

| Élément | État |
|---|---|
| Table `pipeline_stages` | Existe, scopée `companyId`, 8 rows total (toutes companies confondues) |
| `DEFAULT_STAGES` | Hardcodés frontend en 3 endroits : `app/src/features/collab/CollabPortal.jsx:2282`, `app/src/features/admin/AdminDash.jsx:3674`, consommé par `CrmTab.jsx` |
| Table `collaborators` | **Aucune colonne liée au pipeline** — pas de `pipelineMode`, pas de `pipelineTemplateId`, pas de `pipelineSnapshotId` |
| Table `companies` | Pas de `brand_id`. Brand est config-static depuis commit `7063e253`, pas data-linked |
| Endpoints `/api/data/pipeline-stages` POST/PUT/DELETE | Aucune vérification de permission au-delà de `enforceCompany` |
| Broadcast admin → collab sur modif stage | N'existe pas |
| Usage réel stages custom | Minime : sur 341 contacts en prod, **1 seul** utilise un stage custom (`ps_1776173824754_sg85`) |

Conséquence stratégique : l'ajout de templates est **quasi-greenfield**, pas un refactor destructif. La data existante ne constitue pas un blocker.

---

## 4. Modèle de données

### 4.1 Nouvelles tables

**`pipeline_templates`** — un template réutilisable.

| Colonne | Type | Rôle |
|---|---|---|
| `id` | TEXT PRIMARY KEY | `tpl_<timestamp>_<rand>` |
| `companyId` | TEXT NOT NULL | Scope company (indexé). En v2 : nullable pour master-brand. |
| `name` | TEXT NOT NULL | "Closing", "Immobilier"… |
| `description` | TEXT | Phrase de contexte (optionnelle) |
| `icon` | TEXT | Nom d'icône lucide (cohérent avec leads envelopes) |
| `color` | TEXT | Hex, identité visuelle du template |
| `stagesJson` | TEXT NOT NULL | JSON `[{id, label, color, icon, position, rules?}]` |
| `isPublished` | INTEGER DEFAULT 0 | 0=brouillon non assignable, 1=publié assignable |
| `isArchived` | INTEGER DEFAULT 0 | Archivé ≠ supprimé (préserve les snapshots) |
| `createdAt` | TEXT NOT NULL | ISO timestamp |
| `updatedAt` | TEXT NOT NULL | |
| `createdBy` | TEXT | collaboratorId admin |
| `updatedBy` | TEXT | |

**`pipeline_template_snapshots`** — version figée d'un template à un instant donné.

| Colonne | Type | Rôle |
|---|---|---|
| `id` | TEXT PRIMARY KEY | `snap_<timestamp>_<rand>` |
| `templateId` | TEXT NOT NULL | FK vers `pipeline_templates.id` |
| `version` | INTEGER NOT NULL | Incrémental par template (v1, v2…) |
| `stagesJson` | TEXT NOT NULL | Copie figée des stages au moment du snapshot |
| `createdAt` | TEXT NOT NULL | |

Index : `(templateId, version)` unique.

### 4.2 Extensions sur tables existantes

**`collaborators`** — 2 nouvelles colonnes (migration additive, non destructive) :

| Colonne | Type | Défaut | Rôle |
|---|---|---|---|
| `pipelineMode` | TEXT | `'free'` | `'free'` ou `'template'` |
| `pipelineSnapshotId` | TEXT NULL | NULL | FK vers `pipeline_template_snapshots.id` si `mode='template'` |

**Pas de `pipelineTemplateId` direct sur collab.** On pointe le snapshot, jamais le template live. C'est le mécanisme qui garantit le freeze (invariant #4).

### 4.3 Choix de stockage : JSON embedded vs table relationnelle

Les stages d'un template sont édités atomiquement (l'admin sauvegarde le builder d'un coup). JSON embedded dans `stagesJson` :

- Évite une table de liaison à maintenir
- Évite les cascades INSERT/DELETE complexes
- Préserve la cohérence transactionnelle naturellement
- Aligné avec le pattern déjà utilisé pour d'autres configs (`nrp_followups_json`, etc.)

Trade-off accepté : impossibilité de requêter "tous les templates qui ont la colonne X". Use-case faible en CRM.

---

## 5. Logique métier — résolution runtime

### 5.1 Distinction des deux modes

| Aspect | Collab libre (`free`) | Collab avec template (`template`) |
|---|---|---|
| Source des stages | `DEFAULT_STAGES` frontend + `pipeline_stages WHERE companyId` | `pipeline_template_snapshots.stagesJson` du snapshot du collab |
| Peut ajouter/supprimer/renommer/réordonner stages | Oui (UI existante) | **Non** (UI cachée + backend 403) |
| Peut changer couleur d'un stage | Oui | **Non** |
| Initialisation | Aucune (comportement legacy) | Snapshot créé à l'assignation par l'admin |
| Badge UI pipeline | Aucun | "Pipeline imposé : [nom du template]" en entête + hover info |

### 5.2 Endpoint de résolution unifié

`GET /api/data/pipeline-stages-resolved` — appelé par le frontend au chargement du portail collab.

Réponse :

```json
{
  "mode": "free" | "template",
  "stages": [
    { "id": "...", "label": "...", "color": "...", "icon": "...", "position": 0 }
  ],
  "readOnly": true | false,
  "templateMeta": { "id", "name", "version", "color", "icon" } | null
}
```

Le frontend consomme un **tableau unique de stages**, peu importe la source. Le flag `readOnly` contrôle l'UI.

### 5.3 Impact sur les endpoints existants

Les endpoints `POST/PUT/DELETE /api/data/pipeline-stages` sont **conservés** pour les collabs libres. Un middleware `requirePipelineFreeMode` est monté au-dessus :

```
Si collab.pipelineMode === 'template' :
  → 403 PIPELINE_TEMPLATE_LOCKED
  → audit_log { action:'pipeline_lock_bypass_attempt', ... }
```

Aucune rupture pour les 100% de collabs existants (tous en `free`).

---

## 6. Permissions — double verrou

### 6.1 UI (convenance UX)

Quand `readOnly=true` dans la résolution :

- Cacher les boutons "Ajouter statut", "Supprimer", "Renommer", "Réordonner"
- Afficher un badge en entête du pipeline : "Pipeline imposé : [nom du template]"
- Tooltip au hover : "Ce pipeline est défini par votre administrateur. Contactez-le pour toute modification."

### 6.2 Backend (source de vérité)

Middleware `requirePipelineFreeMode` sur les 3 endpoints de mutation `/api/data/pipeline-stages`. L'UI est un garde-fou UX ; le backend est la barrière de sécurité.

**Règle absolue** : un collab curl peut bypasser l'UI, le backend doit refuser. L'audit_log doit enregistrer ces tentatives pour détecter des comportements anormaux.

---

## 7. Synchronisation & propagation

### 7.1 Admin modifie un template déjà assigné

**Position figée : frozen snapshot + re-sync explicite**. Jamais d'auto-propagation (invariant #5).

Flow :

1. Admin édite "Template Closing" dans le builder → clique **Publier nouvelle version**
2. Backend crée `pipeline_template_snapshots` v(N+1) avec le nouveau `stagesJson`
3. Les collabs pointant sur v(N) restent sur v(N). Leur `pipelineSnapshotId` n'est pas modifié.
4. L'UI admin affiche : "12 collabs utilisent v1 de ce template, 2 utilisent v2"
5. Admin peut cliquer **Migrer les collabs vers v2** → pre-flight check → confirmation → migration
6. Les sessions collabs connectées reçoivent un signal de refetch (§7.3)

### 7.2 Migration de version : flow contrôlé

Quand l'admin migre collabs de v(N) → v(N+1) :

1. **Pre-flight check** côté backend : lister les contacts dont le `pipeline_stage` n'existe pas en v(N+1), groupés par collab
2. UI admin affiche : "3 contacts sont sur la colonne 'Closing hot' qui n'existe plus en v2. Sélectionnez une colonne de destination : [Nouveau / Contacté / Perdu / …]. Ou annulez."
3. Si confirmation :
   - Backend exécute `UPDATE contacts SET pipeline_stage=<cible> WHERE assignedTo IN (...) AND pipeline_stage NOT IN (<stages v(N+1)>)`
   - Chaque migration ajoute un audit_log et un pipeline_history
   - Puis `UPDATE collaborators SET pipelineSnapshotId=<id v(N+1)> WHERE ...`
4. Les sessions connectées reçoivent le signal de refetch pipeline-stages-resolved

### 7.3 Propagation vers collabs connectés

Deux options techniques, à trancher en Phase 1 :

- **Option A — SSE (Server-Sent Events)** : le serveur push l'événement `pipeline_template_updated` aux sessions connectées. Plus réactif, infra plus lourde.
- **Option B — Polling piggyback** : `syncContacts` existant (interval 5 min côté `CollabPortal.jsx:2891`) est étendu pour récupérer aussi la version de snapshot. Simple, retardé max 5 min.

**Recommandation v1** : Option B (polling piggyback). Passer à SSE si démontré insuffisant.

### 7.4 Race condition : admin migre pendant que collab drag-drop

Si un collab est en train de drag-drop sur un stage au moment où l'admin migre son template :

1. Le backend détecte que le stage ciblé n'existe plus dans le snapshot actualisé du collab → retourne 409 Conflict
2. Le frontend affiche un toast : "Votre pipeline vient d'être mis à jour, vos modifications ont été annulées"
3. Force un refetch immédiat de `/api/data/pipeline-stages-resolved`

Le mécanisme 409 Conflict est déjà en place dans `handleCollabUpdateContact` (voir `CollabPortal.jsx:2787`), il suffit de l'étendre pour inclure la détection de version de snapshot.

---

## 8. Arbitrages produit (4 cas)

### 8.1 Template modifié après assignation

**Snapshot figé + re-sync explicite.** Voir §7.1. Position ferme, non négociable (invariant #4, #5).

Justification : si l'auto-sync était activée, un collab verrait sa configuration changer de couleurs/ordre/labels sans préavis → rupture de muscle memory → baisse productivité → tickets support. Explicit > implicit toujours en CRM.

### 8.2 Collab passe de `free` → `template` (admin assigne un template)

Flow obligatoire (admin-initiated) :

1. Admin sélectionne le collab → "Imposer un template" → liste des templates publiés
2. Backend calcule le pre-flight : contacts du collab dont le `pipeline_stage` n'est pas dans le nouveau template
3. UI admin affiche : "42 contacts seront migrés. Sélectionnez une colonne de destination : [...]. 3 ont des RDV confirmés à venir (voir détails). Continuer ?"
4. Si confirmation :
   - Création snapshot (ou référence à snapshot v1 existant si template déjà utilisé)
   - `UPDATE collaborators SET pipelineMode='template', pipelineSnapshotId=<id>`
   - Migration contacts + audit_logs + pipeline_history
5. Si annulation : rien n'est modifié

Pas de migration implicite, jamais (invariant #6, #7).

### 8.3 Collab passe de `template` → `free` (admin retire le template)

Comportement : **autorisé, non destructif par défaut**.

- `UPDATE collaborators SET pipelineMode='free', pipelineSnapshotId=NULL`
- Les contacts conservent leur `pipeline_stage` tel quel (pas de reset)
- Les stages custom hérités du template restent dans la donnée mais ne sont plus dans la liste visible
- Le fallback `STAGES.find(...) || STAGES[0]` côté rendu évite tout crash (garantie déjà présente dans le code actuel)
- UI admin propose : "X contacts sont sur des stages qui n'existent plus en mode libre. Les migrer vers 'Nouveau' ou les laisser ?" (deux options explicites)

### 8.4 Colonne disparaît d'un template (admin édite et supprime)

**Règle absolue** : jamais de perte silencieuse (invariant #7).

Flow lors de l'édition admin :

1. Admin édite le template dans le builder → supprime la colonne "Closing"
2. Aucun collab n'utilise encore cette version → suppression directe dans le brouillon
3. Si la colonne existe dans une version publiée assignée à N collabs : la suppression est différée jusqu'à la publication de la nouvelle version et la migration des collabs (§7.2)
4. Le pre-flight check de la migration obligera l'admin à choisir une colonne de destination avant de valider

Le fallback `STAGES.find() || STAGES[0]` reste une safety net de dernière ligne, mais ne doit jamais être le chemin normal de gestion d'un stage orphelin.

---

## 9. Compatibilité multi-brand / white-label

### v1 (cette spec)

- Templates scopés par `companyId`
- Pas de `brand_id` sur `companies`, cohérent avec l'état actuel (brand config-static)

### v2 future (déclenchée quand STRIKOR ou 2ᵉ brand réel démarre)

- Ajouter `companies.brand_id` + table `brands`
- Option préférée : `pipeline_templates.brandId` nullable. Si rempli, le template est assignable à **toutes les companies du brand** (master-brand template).
- Le scope `companyId` reste comme fallback (template spécifique à une company).
- Migration additive, pas destructive.

**Position pour v1** : ignorer complètement brand_id. La feature n'est pas bloquée par l'absence, elle est juste company-scope.

---

## 10. Plan d'implémentation progressif

Chaque phase produit **1 PR shippable indépendamment** avec possibilité de rollback sans casser les phases précédentes. Le modèle suit ce qui a été fait pour V7 et L1-L3.

### Phase 0 — Prérequis

- ✅ Clôture phase observation Pipeline Live (2026-04-21 → ~2026-05-01)
- ✅ Aucun nouveau cas `[PIPELINE] Action en cours pour` apparu pendant l'observation
- ✅ Validation explicite MH pour démarrer Phase 1

Si un 6ᵉ cas de lock apparaît : **stabilisation structurelle du handler en premier**, Phase 1 templates reportée.

### Phase 1 — Backend foundation

Livrable : schéma + API core + permissions.

- Migration DDL : créer `pipeline_templates`, `pipeline_template_snapshots`
- Ajouter `pipelineMode`, `pipelineSnapshotId` sur `collaborators` (valeurs par défaut assurant la non-régression)
- Endpoints admin : `POST/GET/PUT/DELETE /api/admin/pipeline-templates`
- Endpoint `GET /api/data/pipeline-stages-resolved` (résolution unifiée)
- Middleware `requirePipelineFreeMode` monté sur les 3 endpoints `/api/data/pipeline-stages` existants
- Tests automatiques : permissions, création snapshot, résolution runtime en mode free vs template
- Aucun changement UI collab à ce stade, comportement legacy totalement préservé

### Phase 2 — Admin UI (builder LEGO)

Livrable : interface admin de création/édition de templates.

- Menu "Templates Pipeline" dans `AdminDash`
- Builder visuel drag-drop : ajouter colonne, picker couleur, picker icône, réordonner, renommer
- Preview en temps réel du pipeline rendu tel qu'il apparaîtra au collab
- Liste : brouillons / publiés / archivés avec compteurs d'usage
- Actions : publier, dupliquer, archiver
- Pas encore d'assignation à des collabs

### Phase 3 — Assignation + migration contacts

Livrable : possibilité d'assigner un template à un collab.

- Champ "Template de pipeline" dans la modale création/édition collaborateur (liste déroulante des templates publiés + option "Mode libre")
- Pre-flight check (§8.2) affiché en modal de confirmation avec liste nominative des contacts impactés
- Migration contacts avec audit_logs + pipeline_history
- Affichage du badge "Pipeline imposé" côté collab

### Phase 4 — Enforcement du verrou runtime

Livrable : le collab ne peut plus modifier son pipeline en mode template.

- Côté frontend : consommer `readOnly` dans `/api/data/pipeline-stages-resolved` et cacher les boutons de mutation
- Côté backend : le middleware `requirePipelineFreeMode` devient opérationnel (était monté dès Phase 1 mais sans effet si aucun collab en mode template)
- Smoke test : un collab fictif en mode template tente une mutation via curl → 403 + audit_log

### Phase 5 — Versioning + re-sync admin-pushed

Livrable : l'admin peut publier de nouvelles versions et migrer les collabs.

- UI admin "Publier nouvelle version" crée un snapshot v(N+1)
- Tableau récapitulatif "X collabs en v1, Y collabs en v2" dans la page template
- Bouton "Migrer les collabs vers v2" avec pre-flight check (§7.2)
- Notification collabs connectés (mécanisme choisi en Phase 1 : polling piggyback ou SSE)
- Migration contacts orphelins vers la colonne cible choisie par l'admin

### Phase 6 — Observabilité

Livrable : l'admin peut observer l'adoption et l'usage.

- Reporting : nb de templates, nb d'assignations par template, historique de migrations
- Audit trail consultable admin (filtre par template, par collab, par période)
- Export CSV si besoin

---

## 11. Risques & anti-patterns

### À ne surtout pas faire

| Anti-pattern | Conséquence |
|---|---|
| Auto-sync d'un template modifié sur les collabs en cours | Muscle memory cassée, tickets support, rupture de confiance |
| Migration de contacts sans pre-flight check | Perte de données visible ("mes contacts ont disparu !") |
| UI-only enforcement, pas de middleware backend | Bypass trivial par curl, collab peut contourner |
| Binding direct collab → template (pas de snapshot) | Admin édite template → tous les collabs voient le changement immédiatement = chaos |
| Lancer la feature sans le middleware `requirePipelineFreeMode` | Feature neutralisée dès qu'un collab appelle POST/PUT/DELETE sur `pipeline-stages` |
| Templates modifiables après publication sans versioning | Impossible de faire de l'audit, du reporting, ou des comparaisons dans le temps |

### Risques à surveiller en phase d'exécution

- **Explosion du nombre de snapshots** si l'admin publie souvent : mettre en place un housekeeping (garder toutes les versions référencées par ≥1 collab, archiver les orphelines après 90 jours)
- **Performance de l'endpoint de résolution** si appelé sur chaque page : cache côté client + ETag côté serveur
- **Race condition admin migre / collab édite** : le 409 Conflict doit être propre et informatif (pas un simple "erreur serveur")

### Dettes qui vont apparaître et seront traitées séparément

- Migration des `DEFAULT_STAGES` hardcodés frontend vers une approche data-driven serait cohérente avec la feature mais **hors scope v1**
- Respect de la règle §0bis CLAUDE.md : chaque nouveau state côté CollabPortal et AdminDash doit passer par Context, pas par closure lexicale

---

## 12. Impacts sur le système actuel

| Module | Impact |
|---|---|
| `CollabPortal.jsx` | Consomme `/api/data/pipeline-stages-resolved` au lieu de construire `PIPELINE_STAGES` en local. Les boutons de mutation de colonnes sont conditionnés par `readOnly`. |
| `PhoneTab.jsx` (kanban pipeline) | Aucun changement logique. Les colonnes viennent de la résolution unifiée, pas de `PIPELINE_STAGES` local. |
| `CrmTab.jsx` | Idem : consomme la résolution unifiée. |
| `AdminDash.jsx` | Nouvelle section "Templates Pipeline" ajoutée. La création/édition collab gagne un champ "Template de pipeline". |
| Base de données | +2 tables (`pipeline_templates`, `pipeline_template_snapshots`) + 2 colonnes (`collaborators.pipelineMode`, `collaborators.pipelineSnapshotId`) |
| Endpoints existants `/api/data/pipeline-stages` | Conservés, gagnent un middleware `requirePipelineFreeMode` |
| `syncContacts` polling | Étendu pour inclure la version de snapshot (option B §7.3) |

Aucun module ne subit de rupture. Tout est additif.

---

## 13. TL;DR décisionnel

1. Feature 🟢 faisable, prérequis cadré : clôture observation Pipeline Live + 3 blockers backend (#1 verrou, #2 broadcast, #5 migration backend).
2. Stockage JSON embedded dans les templates et snapshots : simplicité > queryabilité.
3. Snapshot figé + re-sync explicite pour le versioning. Pas d'auto-sync, jamais.
4. Pre-flight check systématique pour toute opération affectant des contacts.
5. Double verrou UI + backend. Jamais un seul des deux.
6. Multi-brand = v2. v1 = company-scope.
7. 6 phases shippables indépendamment, rollback propre entre chaque.
8. Anti-pattern absolu à éviter : auto-propagation. Tout explicite, traçable, réversible.

---

## 14. Placement & navigation dans l'app

### Décision figée

> Admin → **Équipe** → nouvel onglet **« Templates Pipeline Live »**

Pas dans « Paramètres ». Raisons :

- « Paramètres » contient les configs techniques globales (SMS sender, forecast, etc.)
- « Templates Pipeline Live » est une **brique organisationnelle** (qui fait quoi dans l'équipe), sa place logique est à côté de la gestion des collaborateurs
- Proximité immédiate avec la modale création/édition collab (où s'opère l'assignation)

### Visibilité

- Onglet visible uniquement si `req.auth.role === 'admin'` OU `req.auth.role === 'supra'`
- Collab standard : onglet masqué, accès direct par URL bloqué backend (403)
- Si company n'a pas encore la feature activée (flag `companies.featuresJson` ou équivalent) : onglet grisé avec badge "Premium" → cohérence monétisation future

### Wireframe textuel de navigation

```
┌──────────────────────────────────────────────────────────┐
│  ÉQUIPE                                                  │
│  ┌──────────┬──────────┬──────────────────────────────┐  │
│  │ Membres  │ Rôles    │ Templates Pipeline Live      │  │
│  └──────────┴──────────┴──────────────────────────────┘  │
│                                                          │
│  [ + Nouveau template ]   [ Filtrer ] [ Trier ]          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Immobilier — v2 publié    3 collabs    [⋮]         │  │
│  │ Closing IV — v1 publié    5 collabs    [⋮]         │  │
│  │ Relance tiède — brouillon 0 collabs    [⋮]         │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 15. Architecture d'écran — Builder LEGO (Phase 2)

### Structure en 3 zones + header

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER : [Nom template] [Description]  [Statut ▼] [Preview] [Save]│
├────────────────┬───────────────────────────────┬─────────────────┤
│ A. BIBLIOTHÈQUE│  B. CANVAS (drag & drop)      │ C. CONFIG COL.  │
│                │                               │                 │
│ Presets        │   [New] [Cont] [Qual] [RDV]   │ Nom             │
│ - Standard     │                               │ Couleur         │
│ - Immobilier   │   [drop zone]                 │ Icône           │
│ - Closing      │                               │ Position        │
│                │   [Perdu]                     │                 │
│ Colonne vide   │                               │ Règles (v1.1+)  │
│ Recherche      │                               │                 │
└────────────────┴───────────────────────────────┴─────────────────┘
```

### Zone A — Bibliothèque (gauche, ~220 px)

- **Presets Planora** (ship-with v1) — 5-7 templates prêts à dupliquer :
  - Standard (≈ DEFAULT_STAGES actuels)
  - Immobilier
  - Closing
  - Relance tiède
  - Onboarding SaaS
  - Assurance
  - B2B long cycle
- **Colonnes types** drag-to-canvas : Nouveau, Contacté, Qualifié, RDV programmé, Négociation, Signature, Client validé, Perdu, NRP, Relance, Onboarding, etc.
- Bouton **« Colonne vide »** pour créer sans preset
- Recherche par libellé
- Filtre par couleur (repérage visuel rapide)

### Zone B — Canvas (centre, flex-1)

- Rendu mini-kanban **exactement comme le verra le collab** (couleur, icône, label, position)
- Chaque colonne = carte draggable
- Dropzones entre colonnes (surbrillance au hover) pour insertion
- Drop sur colonne existante = no-op (évite accidents)
- Corbeille en bas pour supprimer par drag-out
- Indicateur "Position N" en coin bas de chaque carte
- Zoom contextuel 80 % pour voir 8+ colonnes sans scroll

### Zone C — Panneau de configuration (droite, ~300 px)

Apparaît au clic sur une colonne du canvas. Champs :

- **Libellé** (input, max 30 chars, requis)
- **Couleur** (color picker + palette de 8 présets)
- **Icône** (picker lucide avec recherche, 20 icônes business curées par défaut)
- **Position** (input number, auto-ajusté au drag mais éditable)
- **Règles métier** (toggles désactivés en v1, actifs en v1.1+) :
  - Exige une note pour entrer dans cette colonne
  - Exige un RDV confirmé
  - Exige un contrat signé
  - SMS auto entrée / sortie (réutilise l'infra SMS existante)
  - Bloque manuellement la sortie (colonne terminale)
- **Supprimer cette colonne** (confirm si contacts potentiellement impactés en mode édition de template publié)

### Header

- Nom du template (inline edit)
- Description (inline edit, tooltip)
- Icône + couleur du template (identité visuelle dans la liste)
- Statut : dropdown `Brouillon / Publié / Archivé`
- **Preview** : overlay plein écran montrant le pipeline tel qu'il apparaîtrait au collab, avec 3 contacts fictifs dans chaque colonne
- **Save** : valide le builder et retour liste
- **Historique** (icône 🕐) : ouvre la liste des snapshots passés (v1, v2…) en lecture seule

---

## 16. Flow UX admin — création d'un template

### Étapes

1. Équipe → Templates Pipeline Live → `+ Nouveau template`
2. **Modal de démarrage** :
   - Choix 1 : « Partir d'un preset » (ouvre bibliothèque dans modal → clone)
   - Choix 2 : « Partir d'un vide »
   - Choix 3 : « Dupliquer un existant » (dropdown des templates de la company)
3. **Saisie meta** (petit form initial) :
   - Nom (requis, 3-40 chars)
   - Description (optionnel)
   - Icône + couleur (identité dans la liste)
4. Redirection vers le builder en mode brouillon automatique
5. Admin travaille : ajoute, supprime, réordonne, configure
6. **Auto-save en brouillon** toutes les 30 s (toast discret « Sauvegardé »)
7. Satisfait → **Preview** → valide visuellement → **Publier**
8. Confirm modal : « Publier rendra ce template assignable aux collaborateurs. Vous pourrez toujours le modifier, mais les modifs créeront une v2 qui ne sera pas propagée automatiquement. Continuer ? »
9. Publication → retour liste avec badge « Publié v1 ✓ »

### Modes brouillon / publié / archivé

| Mode | Assignable ? | Modifiable ? | Supprimable ? |
|---|---|---|---|
| Brouillon | ❌ non | ✅ oui (in-place) | ✅ oui (zéro dépendance) |
| Publié | ✅ oui | ✅ oui → crée v(N+1) | ❌ non (archiver à la place) |
| Archivé | ❌ non | ❌ non | ✅ oui **si et seulement si** aucun snapshot référencé par un collab actif |

### Edge cases du builder

- **Template sans colonne** : validation empêche la publication (minimum 2 colonnes requises)
- **Deux colonnes même label** : warning soft, non bloquant (ex : deux étapes « En attente » à phases différentes)
- **Couleur à contraste insuffisant** : warning soft, non bloquant
- **Plus de 12 colonnes** : warning « Pipeline très long, risque UX dégradée pour le collab. Continuer ? » → non bloquant

---

## 17. Flow UX admin — assignation à un collab

### Champ dans la modale création/édition collab

Nouveau champ entre « Rôle » et « Capacité » :

```
Template Pipeline Live
┌─────────────────────────────────────┐
│ [Sélectionner un template     ▼]    │
└─────────────────────────────────────┘
Si aucun template : le collaborateur
configure lui-même son pipeline.
```

Dropdown :
- Option 1 : **« Mode libre (aucun template) »** ← défaut
- Séparateur
- Options 2+ : liste des templates **publiés** de la company, avec icône + couleur + nom + « vN »

### Preview au survol

Au hover sur une option, popover à droite affiche :
- Mini-kanban (8 colonnes max visibles, reste en « + N autres »)
- Nom template + version + nb de collabs déjà assignés
- Description

### Pre-flight check (changement de mode)

#### Cas A — nouveau collab avec template

Zéro contact, zéro impact. Save direct.

#### Cas B — collab existant : `free` → `template` (ou changement de template)

Modal pre-flight obligatoire :

```
┌─────────────────────────────────────────────────────┐
│ Impact de ce changement                             │
│                                                     │
│ Julie Desportes a 42 contacts dans son pipeline.    │
│                                                     │
│ • 39 contacts compatibles avec le nouveau template  │
│ • 3 contacts sont sur des colonnes absentes :       │
│   ┌──────────────────────────────────────────────┐  │
│   │ • 2 sur "Qualification froide"               │  │
│   │ • 1 sur "Relance J+7"                        │  │
│   └──────────────────────────────────────────────┘  │
│                                                     │
│ Ces 3 contacts seront migrés vers :                 │
│ [ Nouveau                              ▼ ]          │
│                                                     │
│ 3 contacts ont un RDV confirmé à venir, vérifiez    │
│ leur suivi après migration. [ Voir détails ]        │
│                                                     │
│   [ Annuler ]       [ Confirmer la migration ]      │
└─────────────────────────────────────────────────────┘
```

#### Cas C — collab existant : `template` → `free`

Modal symétrique, 2 options explicites :

```
┌─────────────────────────────────────────────────────┐
│ Passage en mode libre                               │
│                                                     │
│ Julie pourra modifier librement son pipeline.       │
│                                                     │
│ • 28 contacts conservent leur colonne               │
│ • 2 contacts sont sur "Closing hot" (colonne du     │
│   template Closing qui n'existe pas en mode libre)  │
│                                                     │
│ Que faire de ces 2 contacts ?                       │
│ ◉ Les migrer vers : [ Nouveau     ▼ ]               │
│ ○ Les conserver tels quels (stage orphelin, affiché │
│   comme "Nouveau" avec étiquette d'origine)         │
│                                                     │
│   [ Annuler ]       [ Confirmer ]                   │
└─────────────────────────────────────────────────────┘
```

---

## 18. Flow UX collab — réception du template

### Première connexion après assignation

1. Collab se connecte au portail
2. Chargement portail → `GET /api/data/pipeline-stages-resolved`
3. Résolution : mode `template`, stages du snapshot
4. **Notification in-app discrète** en haut à droite :
   > Votre pipeline a été configuré par votre administrateur : **Closing IV**. [ En savoir plus ]
5. **Badge permanent** au-dessus du kanban Pipeline Live :

```
┌─────────────────────────────────────────────────────────┐
│ Pipeline Équipe : Closing IV                            │
│ Défini par Romain (admin). Contactez-le pour toute      │
│ modification de structure.                              │
└─────────────────────────────────────────────────────────┘
```

### Choix du libellé badge — décision figée

**« Pipeline Équipe »** plutôt que « Pipeline imposé ». Raisons :

- Connotation positive et collective vs contrainte subie
- Aligne le collab sur l'identité équipe, pas sur la restriction individuelle
- Réduit le risque de ticket support « mon pipeline est bloqué »

Hover tooltip : date d'assignation + version du template.
Clic : modal read-only « Template Closing IV v2 — 8 colonnes — Admin : Romain — En vigueur depuis le 15/05/2026 ».

### UI mutations cachées en mode template

Sont masqués :
- Bouton « + Ajouter un statut » dans le menu Pipeline
- Menu contextuel « Renommer / Supprimer / Changer couleur » sur chaque colonne
- Drag-réorder des colonnes

Restent disponibles (non impactés) :
- Tout le reste du portail : CRM, fiche contact, actions rapides, VoIP, etc.
- Drag-drop des CONTACTS entre colonnes (pipeline fonctionne normalement)
- Zoom, collapse de colonne, filtres

### Notification de nouvelle version disponible (Phase 5)

Si admin publie v2 du template assigné :
- Toast in-app discret à la prochaine connexion : « Une nouvelle version de votre pipeline est disponible. Elle sera appliquée lorsque votre administrateur la déploiera. »
- Pas d'action requise côté collab (attend la push admin)

---

## 19. Flow migration entre versions (Phase 5) — UX détaillée

### Vue admin — page d'un template publié

```
┌─────────────────────────────────────────────────────────┐
│ Template : Closing IV                                   │
│                                                         │
│ Versions :                                              │
│   ● v2 (publié)  ────  0 collabs    [Éditer] [Publier]  │
│   ○ v1 (ancien)  ────  5 collabs    [Voir]              │
│                                                         │
│ 5 collabs utilisent la version 1 de ce template.        │
│ Voulez-vous les migrer vers la v2 ?                     │
│                                                         │
│   [ Migrer vers v2 (pre-flight check) ]                 │
└─────────────────────────────────────────────────────────┘
```

### Clic « Migrer vers v2 » → pre-flight modal

Affiche :
- Diff visuel v1 → v2 (colonnes ajoutées, supprimées, renommées, réordonnées)
- Nombre de contacts sur chaque colonne disparue
- Pour chaque colonne disparue, dropdown de mapping vers une colonne v2
- Alertes : contacts avec RDV confirmés, contacts avec contrat actif

### Diff visuel (exemple)

```
v1                          v2
┌────────────┐              ┌────────────┐
│ Nouveau    │──identique──►│ Nouveau    │
├────────────┤              ├────────────┤
│ Contacté   │──identique──►│ Contacté   │
├────────────┤              ├────────────┤
│ Qualifié   │──renommé────►│ Qualifié + │
│            │              │ engagé     │
├────────────┤              ├────────────┤
│ Closing    │──supprimée──►(aucune)
│ hot        │              ⚠ 3 contacts à migrer
├────────────┤              ├────────────┤
│ Perdu      │──identique──►│ Perdu      │
└────────────┘              ├────────────┤
                            │ Abandonné  │  ← nouvelle
                            └────────────┘
```

### Mapping obligatoire

Pour chaque colonne supprimée v1→v2 contenant ≥1 contact : admin doit **choisir une cible** parmi les colonnes v2 (pas d'option « aucune migration »). Garantit l'invariant #7.

### Exécution

- Animation de progression : « Migration en cours... 3/3 collabs »
- Par collab : migration contacts → update `pipelineSnapshotId` → invalidation cache
- Si contact a transaction en cours (édition concurrente) → 409 Conflict → migration différée, log explicite
- Rapport final : « Migration terminée : 15 contacts migrés, 0 erreur. [Voir audit log] »

---

## 20. Positionnement SaaS — HubSpot / Pipedrive

### Références

**HubSpot CRM**
- Pipelines multiples par company, assignables par rôle/équipe
- Stages éditables, propagation automatique (pas de versioning visible)
- Probabilité de closing par stage (%) pour forecast
- Automation par stage (send email, assign task, change property)

**Pipedrive**
- Pipelines multiples par owner (user-owned ou partagés)
- Rotten days (stage time limit), auto-warn si deal stagnant
- Permissions granulaires par pipeline
- Stages avec `probability` et `duration`

### Ce qu'on garde
- Pipelines assignables par rôle (adapté à notre notion de template par collab)
- Stage templates prédéfinis (bibliothèque de presets)
- Probability / duration / automation par stage → ≥ v1.1/v2

### Ce qu'on fait différemment
- **Mode libre coexistant** : HubSpot/Pipedrive imposent à tous ; nous gardons la flexibilité hybride
- **Snapshot figé + re-sync explicite** : innovation UX vs auto-propagation HubSpot. Cible : équipes sensibles à la stabilité (immobilier, closing, assurance)
- **Verrou UI + backend strict** systématique

### Ce qu'on n'innove pas en v1
- Pas de multi-pipelines par collab (1 template / collab en v1)
- Pas de deal probability / forecast par stage (module forecast existant)
- Pas d'automation complète par stage (sauf SMS auto existant)

### Positionnement marketing potentiel

> Planora Pipeline Templates — imposez la structure sans sacrifier la liberté. Équipes expérimentées en mode libre, équipes structurées sur un modèle cadré. Migration de version sous contrôle, zéro surprise.

---

## 21. Challenge / auto-critique de la conception

### Tensions identifiées et mitigations

#### Tension 1 — Badge « imposé » perçu négativement
- **Mitigation** : renommage « **Pipeline Équipe** » (fait §18)
- Tooltip expliquant la valeur ajoutée
- Onboarding first-connection : walkthrough 3 étapes

#### Tension 2 — 1 template par collab : trop restrictif ?
- **Décision v1** : rester à 1/collab
- Multi-templates = design majeur (navigation, bascule, reporting), reporté v2
- Compromis v1 : template unique avec toutes les colonnes si besoin double-flux

#### Tension 3 — Builder trop complexe si règles métier dès v1
- **Décision** : v1 = builder simple (label + couleur + icône + ordre)
- Règles métier → v1.1+ ou v2
- Trade-off accepté : moins « premium » mais expédiable plus vite

#### Tension 4 — Overlap avec les leads envelopes
- **Clarification** : deux axes orthogonaux
  - **Enveloppe** = classification du **contact**
  - **Template pipeline** = structure de travail du **collab**
- Un contact X dans enveloppe « Lead SEO » traité par Julie (template Closing IV) peut être dans la colonne « Qualifié » du template. Cohabitent sans conflit.
- Recommandation : documenter cette dualité dans l'onboarding admin.

#### Tension 5 — Admin oublie de mettre à jour un template
- Pas de TTL forcé en v1
- Dashboard admin : affichage « Dernière modification v1 : il y a 183 jours » + alerte soft > 180 j
- v2 potentiel : templates « recommandés » par Planora (plateforme)

#### Tension 6 — Race condition admin A + admin B éditent le même template
- **Mitigation** : locking optimiste via `updatedAt`
- Si admin B save avec un `updatedAt` stale → 409 Conflict + message clair « Un autre admin a modifié ce template, rechargez pour fusionner »
- Pattern déjà éprouvé dans `handleCollabUpdateContact`

#### Tension 7 — Preview dans la modale assignation est-il fidèle ?
- Le preview réutilise le composant de rendu du kanban collab (même code)
- 3 contacts fictifs injectés pour visualiser
- Zero drift visuel garanti

### Alternatives considérées et rejetées

| Alternative | Rejet, pourquoi |
|---|---|
| Live binding collab → template (pas de snapshot) | Invariant #4 — tracking versions impossible, collabs subissent modifs |
| Auto-sync nouvelle version | Invariant #5 — casse muscle memory |
| UI-only enforcement | Bypass trivial par curl |
| Templates modifiables in-place sans versioning | Pas d'audit, pas de reporting, pas de rollback |
| Bibliothèque globale Planora (templates shared cross-company) | v1 = company-scope. Bibliothèque globale = v3 « marketplace templates » |
| Multi-templates par collab | Design majeur navigation, reporté v2 |
| Règles métier complètes dès v1 | Complexité explosive, reporté v1.1/v2 |

---

## 22. Indicateurs de succès (post-launch)

| KPI | Cible v1 | Mesure |
|---|---|---|
| Adoption | > 30 % des collabs actifs sous template à 3 mois | `COUNT(collabs WHERE pipelineMode='template') / COUNT(active collabs)` |
| Usage admin | ≥ 2 templates publiés par company active | `COUNT(DISTINCT pipelineTemplates WHERE isPublished=1 GROUP BY companyId) HAVING count ≥ 2` |
| Stabilité migrations | 0 perte de données détectée sur 6 mois | Audit logs + comparaison pre/post migration |
| Support | ≤ 1 ticket / 100 collabs / mois liés à pipeline locked | Tracking support Planora |
| Satisfaction admin | NPS feature > 30 à J+30 après adoption | Survey in-app |

---

## 23. Récap des décisions de conception (amendement v1.1)

| Point | Décision |
|---|---|
| Emplacement | Admin → Équipe → « Templates Pipeline Live » (pas Paramètres) |
| Builder | 3 zones (biblio / canvas / config) + header |
| Presets ship-with | 5-7 templates (Standard, Immobilier, Closing, Relance, Onboarding SaaS, Assurance, B2B long cycle) |
| Règles métier par colonne | Reporté v1.1+ |
| Multi-templates par collab | Reporté v2+ |
| Badge collab | « Pipeline Équipe » (pas « imposé ») |
| Assignation UX | Dropdown + hover preview + pre-flight check modal |
| Migration versions | Diff visuel + mapping obligatoire + rapport final |
| Free ↔ Template | 2 directions, pre-flight check dans les deux sens |
| Orphelins (direction template→free) | Option « migrer » OU « conserver avec étiquette d'origine » |
| Optimistic locking templates | `updatedAt` check, 409 si édition admin concurrente |
| Inspiration SaaS | HubSpot (assignation par rôle) + Pipedrive (bibliothèque stages). Innovation = coexistence libre + snapshot figé |

---

## 24. Historique des versions du document

| Version | Date | Auteur | Changement |
|---|---|---|---|
| v1 | 2026-04-21 | Claude (validé MH) | Création initiale post-audit Pipeline Live + validation conception complète |
| v1.1 | 2026-04-21 | Claude (validé MH) | Amendement — UX builder + flows détaillés (sections 14-23) : placement navigation, architecture écran 3 zones, flows admin/collab, migration versionnée UX, positionnement SaaS, auto-critique, KPIs |
