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

## 14. Historique des versions du document

| Version | Date | Auteur | Changement |
|---|---|---|---|
| v1 | 2026-04-21 | Claude (validé MH) | Création initiale post-audit Pipeline Live + validation conception complète |
