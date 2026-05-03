# AUDIT V1.13.2.b — Merge CRM réel (READ-ONLY)

> **Date** : 2026-05-03
> **Demandeur** : MH
> **Type** : audit READ-ONLY exhaustif — aucune modification effectuée
> **Statut** : ✅ STOP avant code/deploy — attendant 11 décisions Q1-Q11
> **Contexte** : PHASE 1 contacts/doublons, sub-phase V1.13.2.b. Backend `POST /:primaryId/merge` déjà en place depuis V1.13.2.a (DORMANT — 0 consommateur frontend).

---

## 1. CONSTAT EXISTANT (V1.13.2.a)

### Backend `POST /api/data/contacts/:primaryId/merge` — déjà déployé

Source : [server/routes/data.js:1136-1259](server/routes/data.js#L1136-L1259)

**Body** : `{ secondaryId, confirm: 'CONFIRM_MERGE' }`

**Permissions Q5 V1.13.2.a** : admin/supra OR (collab is owner/shared on **BOTH** contacts).

**Cascade actuel V1.13.2.a (transactionnel)** :

| Table | Action V1.13.2.a | Note |
|---|---|---|
| bookings | UPDATE contactId | RDV préservés ✅ |
| call_logs | UPDATE contactId | |
| call_contexts | UPDATE contactId | |
| call_form_responses | UPDATE contactId | |
| call_transcript_archive | UPDATE contactId | |
| sms_messages | UPDATE contactId | |
| pipeline_history | UPDATE contactId | |
| contact_status_history | UPDATE contactId | |
| contact_documents | UPDATE contactId | |
| conversations | UPDATE contactId | |
| interaction_responses | UPDATE + fallback DELETE si UNIQUE conflit (Q7) | |
| contact_followers | DELETE secondary (UNIQUE + FK CASCADE) | |
| recommended_actions | DELETE secondary (UNIQUE) | |
| contact_ai_memory | DELETE secondary (UNIQUE) | |
| contacts.notes | UPDATE primary (Q6 append `[Fusionne depuis X]`) | |
| contacts | DELETE secondary (Q4 hard) | |
| audit_logs | INSERT `contact_merged` enrichi (Q8) | immutable |

### ⚠ Tables avec `contactId` NON couvertes V1.13.2.a (découverte 2026-05-03)

| Table | Rows total | Rows avec `contactId` | Décision V1.13.2.b |
|---|---:|---:|---|
| `ai_copilot_analyses` | 36 | 1 | **À UPDATE** ? (Q1) |
| `client_messages` | 1 | 1 | **À UPDATE** ? (Q1) |
| `notifications` | 364 | 55 | **À UPDATE** ? (Q1) |
| `system_anomaly_logs` | 3 | 3 | **Laisser tel quel** ? (Q1 — logs système, pas runtime) |

→ 4 tables identifiées, 60 rows orphelines potentielles si non patchées.

### Frontend — ZÉRO consommateur V1.13.2.a

- `DuplicateOnCreateModal.jsx` ne contient **aucun** bouton Fusionner (retiré en correction sémantique sur GO MH 2026-05-03).
- `CrmTab.jsx` (1812 lignes) ne contient **aucune** action merge.
- `FicheActionsBar.jsx` (77 lignes, sub-component dormant via refactor S1.4b non activé runtime) ne contient pas de bouton merge.

---

## 2. CONTRAINTES MH V1.13.2.b (rappel)

| # | Contrainte | Implication |
|---|---|---|
| C1 | Uniquement fiches existantes CRM (déjà persistées) | Bouton dans CrmTab/FicheActionsBar, pas dans DuplicateOnCreateModal |
| C2 | Pas dans le flow création | Aucune liaison à NewContactModal / DuplicateOnCreateModal |
| C3 | Choisir fiche principale | UX permet sélection explicite primary vs secondary |
| C4 | Confirmation obligatoire | Modale dédiée + saisie/checkbox confirmation |
| C5 | Audit log obligatoire | `contact_merged` enrichi (déjà en place V1.13.2.a) |
| C6 | Aucun RDV supprimé | bookings UPDATE (déjà en place) |
| C7 | Bookings/Reporting/Agenda préservés | Reporting V1.11.4 fonctionne sur bookingType='share_transfer' avec agendaOwnerId/bookedBy → inchangé après UPDATE contactId |
| C8 | Backup DB obligatoire | étape 7 workflow strict |

---

## 3. ARCHITECTURE FRONTEND PROPOSÉE (respect règle code "pas d'empilage")

### Nouveaux fichiers (3, isolés)

| Fichier | Lignes estim. | Rôle |
|---|---:|---|
| **`app/src/features/collab/modals/MergeContactsModal.jsx`** | ~220 | Modale standalone : 2 panneaux primary/secondary, sélecteur autocomplete, preview cascade, input "FUSIONNER" exact, call POST /merge, window event |
| **`app/src/features/collab/hooks/useMergeContacts.js`** | ~60 | Custom hook : `{ mergeTarget, openMerge, closeMerge, executeMerge }` + listener `crmContactMerged` |
| **`app/src/features/collab/handlers/contactMergeHandlers.js`** | ~80 | Handlers purs : `fetchMergeablePeers(primaryId)`, `fetchMergePreview(secondaryId)`, `executeMergeRequest(primary, secondary)` |

### Modifs minimales fichiers existants

| Fichier | Lignes ajoutées | Détail |
|---|---:|---|
| `app/src/features/collab/tabs/CrmTab.jsx` | ≤ 30 | 1 import + 1 hook call + 1 bouton dans actions bar (ligne ~1138, à côté de Archiver) + 1 render modale top-level |
| `server/routes/data.js` | ≤ 25 | Compléter cascade : ajouter 3 UPDATE selon Q1 (ai_copilot_analyses, client_messages, notifications) + retirer le tag "DORMANT" + actualiser commentaire |

### Architecture data flow

```
User clique "Fusionner" depuis fiche CRM (primary = ct courant)
   ↓
useMergeContacts.openMerge(ct)
   ↓
<MergeContactsModal primary={ct} />
   ↓
1. Sélecteur autocomplete secondary (contactMergeHandlers.fetchMergeablePeers)
2. Preview cascade (contactMergeHandlers.fetchMergePreview du secondary)
3. Saisie "FUSIONNER" exact
4. Confirm → contactMergeHandlers.executeMergeRequest(primary, secondary)
   ↓
POST /api/data/contacts/:primaryId/merge body {secondaryId, confirm:'CONFIRM_MERGE'}
   ↓
window event 'crmContactMerged' { primaryId, secondaryId, cascadeCounts }
   ↓
CrmTab listener → setContacts(p => p.filter(c => c.id !== secondaryId))
   + setSelectedCrmContact(primary refreshed)
   + showNotif("Fiches fusionnees, X bookings + Y calls rattaches")
```

---

## 4. DÉCISIONS OUVERTES — 11 questions Q1-Q11

### Q1 — Tables additionnelles à couvrir dans le cascade ?

| Table | Reco | Justification |
|---|---|---|
| `ai_copilot_analyses` | **UPDATE** | 1 row avec contactId → préserver historique IA. Faible volume. |
| `client_messages` | **UPDATE** | 1 row → préserver thread message client. |
| `notifications` | **UPDATE** | 55 rows → notifs liées au contact, à rattacher au primary. |
| `system_anomaly_logs` | **LAISSER** | 3 rows → logs système, valeur historique nulle après merge. |

**Décision MH attendue** : valider en bloc OU ajuster table par table.

### Q2 — Position du bouton "Fusionner avec…"

| Option | Avantage | Inconvénient |
|---|---|---|
| **A — Barre actions Fiche CRM** | naturel, visible | encombre la barre (déjà 7+ boutons) |
| **B — Menu kebab/dropdown** | discret | clic supplémentaire |
| **C — Sub-tab "Doublons" Fiche** | cohérent avec V1.13.x | non standard |

**Reco Claude** : **A** (à côté de Archiver) avec icône `git-merge` cyan, lib comme V1.13.2.a précédent.

### Q3 — Sélection de la fiche secondaire (à fusionner DANS le primary)

| Option | UX | Implémentation |
|---|---|---|
| **A — Autocomplete contacts (nom/email/phone)** | rapide, familier | filtre local sur `contacts` state |
| **B — Suggestion automatique de doublons potentiels** | proactif | nouvel endpoint `/api/data/contacts/:id/find-duplicates` |
| **C — Drag/drop carte Pipeline** | visuel | complexité haute |

**Reco Claude** : **A** pour V1.13.2.b (rapide) + B reporté V1.13.2.c ou V1.14 (suggestion intelligente).

### Q4 — Preview avant confirmation finale

| Option | Détail |
|---|---|
| **A — Cascade counts simulés** | fetch GET `/contacts/:secondaryId/delete-preview` (existe déjà) → afficher bookings/calls/sms à rattacher |
| **B — Texte rassurant minimaliste** | "Tous les RDV, appels, messages, notes seront rattachés à la fiche principale" |
| **C — 2 modales (preview puis confirm)** | flow plus lourd |

**Reco Claude** : **A** (counts précis = confiance utilisateur, /delete-preview déjà existant).

### Q5 — Type de confirmation finale

| Option | Difficulté |
|---|---|
| **A — Input "FUSIONNER" exact** | strict (pattern HardDeleteContactModal V1.12.9.d) |
| **B — Checkbox "Je confirme"** | léger |
| **C — Double window.confirm** | rapide mais peu UX-friendly |

**Reco Claude** : **A** (cohérence avec V1.12.9.d hard delete, fusion = action irréversible identique).

### Q6 — Que faire si secondary est `archivedAt != ''` ?

| Option | Sémantique |
|---|---|
| **A — Autorisé** | "j'ai un secondary archivé que je veux absorber dans un primary actif" — OK |
| **B — Refusé** | "restaurer d'abord, puis fusionner" — protection mais friction |
| **C — Conditionnel** | autorisé seulement si primary aussi archivé |

**Reco Claude** : **A** (cas légitime : un doublon archivé qu'on retrouve, fusion = nettoyage final).

### Q7 — Que faire si primary `archivedAt != ''` ?

| Option | Sémantique |
|---|---|
| **A — Refusé (409 PRIMARY_ARCHIVED)** | un archivé ne devrait pas absorber un actif |
| **B — Autorisé** | merge libre |
| **C — Forcer restore avant** | demander à l'user |

**Reco Claude** : **A** (on ne fusionne PAS dans un archivé, l'opération inverse demande Restore d'abord — protection logique).

### Q8 — `pipeline_stage` du primary après merge

| Option | Effet |
|---|---|
| **A — Inchangé** | primary.pipeline_stage conservé |
| **B — Préférer le plus avancé** | si secondary='client_valide' et primary='nouveau' → primary devient 'client_valide' |
| **C — Sélection user** | l'user choisit dans la modale |

**Reco Claude** : **A** (V1.13.2.a actuel, principle of least surprise — primary reste cohérent avec ce qu'il était).

### Q9 — Bouton accessible quand ?

| Option | Visibilité |
|---|---|
| **A — Toujours (si !archivedPrimary && permission admin/owner-shared)** | natif |
| **B — Uniquement si doublon détecté** | proactif mais limité |
| **C — Mode "fusion explicite" enclenché par un panneau** | sécurisé mais friction |

**Reco Claude** : **A** (cohérence avec autres actions Fiche, l'user décide quand fusionner).

### Q10 — Sync UI temps réel post-merge

| Option | Effet |
|---|---|
| **A — Window event `crmContactMerged` + listener CrmTab** | pattern éprouvé V1.12.9.d |
| **B — Update local state + redirect vers primary** | direct |
| **C — A + B combinés** | redondant mais robuste |

**Reco Claude** : **C** (event pour broadcast cross-tabs, update local pour réactivité).

### Q11 — Scope V1.13.2.b — multi-merge ?

| Option | Effet |
|---|---|
| **A — 2 fiches uniquement (1→1)** | scope V1.13.2.b strict, simple |
| **B — Multi-merge (sélection plusieurs secondary → 1 primary)** | UX puissante mais risquée |

**Reco Claude** : **A** pour V1.13.2.b, B reporté V1.14+ après stabilisation.

---

## 5. EFFORT ESTIMÉ V1.13.2.b

| Phase | Description | Effort |
|---|---|---|
| Backend extension cascade Q1 | +3 UPDATE tables ai_copilot_analyses + client_messages + notifications + retrait tag DORMANT | 30 min |
| Backend ajustements Q6/Q7 | +2 checks archivedAt si Q7=A | 15 min |
| `contactMergeHandlers.js` | NEW handlers purs | 45 min |
| `useMergeContacts.js` | NEW custom hook | 30 min |
| `MergeContactsModal.jsx` | NEW modale 2-panneaux + autocomplete + preview + input FUSIONNER | 2h |
| Wire `CrmTab.jsx` | 1 import + 1 hook + 1 bouton + 1 listener + 1 render | 30 min |
| Tests SQL smoke | 8-10 tests cascade + isolation | 45 min |
| Tests UI MH | F1-F8 visuels | (MH) |
| Workflow 17 étapes | backup pré/post + commit/tag/push + handoff + memory | 1h |

**Total estimé : 5-6 heures dev + tests MH**.

---

## 6. RISQUES IDENTIFIÉS

| # | Risque | Sévérité | Mitigation |
|---|---|:---:|---|
| R1 | Tables non couvertes (60 rows orphelines) | 🔴 | Q1 décide cascade complet |
| R2 | UNIQUE conflit non couvert (au-delà interaction_responses) | 🟡 | try/catch fallback DELETE secondary, pattern Q7 |
| R3 | Reporting V1.11.4 (`agendaOwnerId`/`bookedBy` distinct de contactId) → préservé | 🟢 | UPDATE contactId n'affecte PAS Reporting |
| R4 | Pipeline Live cards ↔ contact disparu (secondary DELETE) | 🟡 | Window event + listener forcent refresh |
| R5 | Notes append > 64KB SQLite TEXT limit | 🟢 | TEXT illimité, mais ajouter check < 100KB en preview |
| R6 | User merge fiche partagée par 3 collabs → 1 désync | 🟡 | sharedWith primary garde, secondary disparaît, audit suffit |
| R7 | Backup DB pré-V1.13.2.b oublié | 🔴 | Workflow étape 7 obligatoire |
| R8 | Permission Q5 owner/shared check à re-vérifier au backend | 🟢 | déjà en place V1.13.2.a |
| R9 | Idempotence si user double-clic | 🟡 | secondary DELETE → 2e call retourne 404 SECONDARY_NOT_FOUND |
| R10 | Audit log SQL `prevent_audit_update` trigger | 🟢 | INSERT pas affecté, trigger sur UPDATE seul |

---

## 7. ORDRE D'EXÉCUTION RECOMMANDÉ V1.13.2.b

Selon workflow 17 étapes :

| # | Étape | Détail |
|---|---|---|
| 1 | AUDIT READ-ONLY | ✅ ce document |
| 2 | DIFF PREVIEW | après GO Q1-Q11 — montrer fichiers cibles, lignes |
| 3 | GO MH explicite | validation 11 décisions |
| 4 | TEST local | node --check + vite build |
| 5 | FIX si besoin | itérations |
| 6 | VALIDATION diff final | montre à MH |
| 7 | BACKUP pré | DB + data.js + httpdocs |
| 8 | DEPLOY | SCP + PM2 restart |
| 9 | SMOKE | health, /merge mounted, bundle md5 |
| 10 | COMMIT | -F file (pattern V1.13.2.a) |
| 11 | PUSH | origin clean-main |
| 12 | MERGE branche | n/a (clean-main directe) |
| 13 | TAG | `v1.13.2.b-merge-crm` |
| 14 | BACKUP post | mêmes 3 sources |
| 15 | HANDOFF | HANDOFF-V1.13.2.b-MERGE-CRM.md |
| 16 | MEMORY | 1 ligne + topic |
| 17 | CLASSEMENT | ranger AUDIT, .pre-* |

---

## 8. ✅ STOP — Aucune ligne de code écrite

Audit pur READ-ONLY. Aucune modification effectuée.

**Prochaine étape attendue** :
1. MH valide les 11 décisions Q1-Q11 (en bloc avec recos OU corrections)
2. Diff preview généré sur la base des décisions
3. GO MH explicite avant FIX
4. Workflow strict 17 étapes

**Aucune action sans validation MH explicite.**

---

**Sources** :
- VPS prod : `ssh root@136.144.204.115` schema 2026-05-03
- Repo local : `/Users/design/Desktop/PLANORA` HEAD `702f7943` (post-V1.13.2.a)
- Backend dormant : [server/routes/data.js:1136-1259](server/routes/data.js#L1136-L1259)
- Documentation antérieure : [HANDOFF-V1.13.2.a-DELETE-OWN.md](HANDOFF-V1.13.2.a-DELETE-OWN.md)
- Memory rules appliquées :
  - `feedback_phase_workflow_17_steps.md` (workflow strict 17 étapes)
  - `feedback_code_no_root_file_piling.md` (pas d'empilage gros fichiers)
  - `project_phases_roadmap_2026-05-03.md` (PHASE 1 contacts/doublons)
