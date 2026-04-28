# AUDIT READ-ONLY — Visibilité RDV transmis dans Pipeline / CRM / Agenda / Fiche

> **Date** : 2026-04-28
> **Auteur** : Claude Code (Opus 4.7) — mission audit READ-ONLY
> **Demandeur** : MH
> **Périmètre** : suivi sender d'un RDV transmis (Jordan → Guillaume) sur les 4 vues
> **Mode** : READ-ONLY strict — aucune modification code/DB/config/déploiement
> **Base** : V1.10.3-FULL en prod (commit `41fe7ea8`, bundle `index-Dq8iWhp4.js`), phase observation 24h+

---

## 0. TL;DR

🟢 **V1.10.3-FULL a livré 60% du besoin** : auto-mark `bookingType='share_transfer'`, route `GET /api/bookings` élargie (P1), tab Reporting (P2), bloc `FicheReportingBlock` (P3 - fiche), badges PhoneTab `🤝 Transmis à X` côté card.

🔴 **40% manquent — 4 filtres de cloisonnement** persistent côté frontend qui rendent le contact/RDV transmis **invisible côté sender** dans :

| Vue | Symptôme côté Jordan (sender) | Filtre fautif | Sévérité |
|---|---|---|---|
| **Pipeline Live** | Contact disparaît après transmission | [PhoneTab.jsx:5177](app/src/features/collab/tabs/PhoneTab.jsx#L5177) | 🔴 HAUTE |
| **CRM** | Contact disparaît du CRM perso | [CollabPortal.jsx:2879](app/src/features/collab/CollabPortal.jsx#L2879) + [:2894](app/src/features/collab/CollabPortal.jsx#L2894) | 🔴 HAUTE |
| **Agenda** (jour/sem/mois/liste) | RDV non affiché | [CollabPortal.jsx:2424](app/src/features/collab/CollabPortal.jsx#L2424) | 🔴 HAUTE |
| **Fiche → onglet Historique RDV** | Compteur "RDV (0)" même avec RDV transmis | [FicheContactModal.jsx:158](app/src/features/collab/tabs/crm/fiche/FicheContactModal.jsx#L158) | 🟡 MOYENNE |

**Diagnostic root cause unique** : les 4 filtres sont basés sur `assignedTo === collab.id` ou `collaboratorId === collab.id` **sans considérer** les nouveaux champs `bookedByCollaboratorId` / `agendaOwnerId` / `bookingType='share_transfer'` introduits en phaseA + V1.10.3.

**Aucune modification DB nécessaire** — les colonnes existent et sont peuplées correctement par le backend depuis V1.10.3-FULL.

---

## A. CAUSE EXACTE PAR VUE

### A.1 Pipeline Live (PhoneTab — sub-tab "pipeline")

**Fichier** : [app/src/features/collab/tabs/PhoneTab.jsx:5172-5178](app/src/features/collab/tabs/PhoneTab.jsx#L5172-L5178)

```js
const myPipeContacts = (contacts||[]).filter(c => {
  if (c.email && _collabEmails.has(c.email.toLowerCase())) return false;
  if (c.name && _collabNames.has(c.name.toLowerCase())) return false;
  if (isAdminView) return c.companyId === company?.id;
  const sw = Array.isArray(c.shared_with) ? c.shared_with
    : (()=>{ try { return JSON.parse(c.shared_with_json||'[]') } catch { return [] } })();
  return c.assignedTo === collab.id || sw.includes(collab.id);   // ← LIGNE FAUTIVE
});
```

**Problème** : si Jordan transmet un RDV pour un contact `assignedTo=Guillaume` (ou non-assigné), le contact n'apparaît dans le Pipeline de Jordan **que si Jordan est dans `shared_with`**. Or `shared_with` n'est pas automatiquement peuplé lors d'un `share_transfer` booking (cf. §B.5).

**Note importante** : la card orange + badge "Transmis à X" déjà livré V1.10.3-FULL P2 (PhoneTab L5475-5493) **ne s'affiche jamais côté sender** car `myPipeContacts` exclut le contact en amont. Le code visuel existe mais est unreachable.

---

### A.2 CRM (CollabPortal `myCrmContacts` mémoize)

**Fichier** : [app/src/features/collab/CollabPortal.jsx:2837-2902](app/src/features/collab/CollabPortal.jsx#L2837-L2902)

Deux filtres en cascade :

**Étape 1 — par bookings → contacts** ([:2879](app/src/features/collab/CollabPortal.jsx#L2879)) :
```js
const contactRecord = (contacts || []).find(c =>
  c.email?.toLowerCase() === key
  && c.companyId === company.id
  && (c.assignedTo === collab.id
      || (Array.isArray(c.shared_with) && c.shared_with.includes(collab.id))
      || isAdminView2)
);
```

**Étape 2 — contacts manuels** ([:2894-2896](app/src/features/collab/CollabPortal.jsx#L2894-L2896)) :
```js
const isOwned = c.assignedTo === collab.id;
const isShared = Array.isArray(c.shared_with) && c.shared_with.includes(collab.id);
if (!isAdminView2 && !isOwned && !isShared) return;   // ← REJET
```

**Problème** : même logique que Pipeline. Le contact transmis par Jordan disparaît de son CRM. **`FicheReportingBlock` est unreachable** car il est rendu **dans la fiche** d'un contact, et la fiche n'est ouvrable que depuis la liste CRM filtrée.

---

### A.3 Agenda (toutes vues)

**Fichier** : [app/src/features/collab/CollabPortal.jsx:2424](app/src/features/collab/CollabPortal.jsx#L2424)

```js
const myBookings = bookings.filter(b => b.collaboratorId === collab.id);
```

**Problème** : filtre binaire sur `collaboratorId` uniquement. Toutes les vues qui dérivent de `myBookings` n'affichent jamais les RDV transmis :

| Vue | Variable | Ligne |
|---|---|---|
| Vue Semaine | `weekBookings = myBookings.filter(...)` | [:2425](app/src/features/collab/CollabPortal.jsx#L2425) |
| Vue Jour | `dayBookings` | [:2455](app/src/features/collab/CollabPortal.jsx#L2455) |
| Vue Mois | `agendaFillRate` boucle `myBookings.some(...)` | [:2490-2508](app/src/features/collab/CollabPortal.jsx#L2490-L2508) |
| Vue Liste | `_filteredMyBookings` | [:827-830](app/src/features/collab/CollabPortal.jsx#L827-L830) |

**Aspect backend complémentaire** : pour les non-admin, le backend `GET /api/bookings` (cf. `server/routes/_vps-pull/bookings.js:44`) filtre lui-même sur `b.collaboratorId = ?` → **les bookings share_transfer où l'user est sender uniquement ne remontent même pas dans le payload**. Double cloisonnement (backend + frontend) à élargir.

> ⚠ **À confirmer** : un agent a indiqué que V1.10.3-P1 a élargi `GET /api/bookings` à `(collaboratorId OR agendaOwnerId OR bookedByCollaboratorId)` mais un autre agent a vu le filtre étroit dans `_vps-pull/bookings.js`. Cette divergence doit être levée par un check direct sur le code prod **avant phase de correction** (cf. §F étape 0).

---

### A.4 Fiche client — onglet "Historique RDV"

**Fichier** : [app/src/features/collab/tabs/crm/fiche/FicheContactModal.jsx:158](app/src/features/collab/tabs/crm/fiche/FicheContactModal.jsx#L158)

```js
const contactBookings = (bookings||[])
  .filter(b => b.contactId === ct.id && b.collaboratorId === collab.id)
  .sort(...);
```

**Problème** : badge `RDV (${contactBookings.length})` affiche `0` même quand le contact a des RDV transmis (sender ou receiver). Discrimination silencieuse.

**Note** : `FicheReportingBlock` (V1.10.3 P3, [CrmTab.jsx:1085](app/src/features/collab/tabs/CrmTab.jsx#L1085)) est correctement implémenté avec scope sender/receiver/admin et auto-masquage si vide. **Il est fonctionnel mais ne corrige pas le compteur historique** : sont deux blocs distincts dans la fiche.

---

## B. CHAMPS DB UTILISÉS

### B.1 Table `bookings` (déjà en place, peuplée correctement)

| Colonne | Type | Sémantique | Source |
|---|---|---|---|
| `collaboratorId` | TEXT | Assigné historique (legacy V7) | V0 |
| `bookedByCollaboratorId` | TEXT | **Sender** (qui a transmis) | phaseA 2026-04-20 |
| `agendaOwnerId` | TEXT | **Receiver** (qui reçoit + rapporte) | phaseA 2026-04-20 |
| `meetingCollaboratorId` | TEXT | Réalisateur RDV (souvent = receiver) | phaseA 2026-04-20 |
| `bookingType` | TEXT | `'share_transfer'` ⇔ RDV transmis | phaseA |
| `bookingReportingStatus` | TEXT | enum 7 statuts FR (`pending`/`validated`/`signed`/`no_show`/`cancelled`/`follow_up`/`other`) | V1.10.3 P1 |
| `bookingReportingNote` | TEXT | Note structurée du reporting | V1.10.3 P1 |
| `bookingReportedAt` | TEXT | Timestamp ISO UTC | V1.10.3 P1 |
| `bookingReportedBy` | TEXT | collabId qui a posé le report | V1.10.3 P1 |

Indexes pertinents (V1.10.3 P1) : `idx_bookings_reporting_status`, `idx_bookings_reported_by`, `idx_bookings_agenda_owner`, `idx_bookings_type`.

### B.2 Table `contacts`

| Colonne | Sémantique |
|---|---|
| `assignedTo` (= `ownerCollaboratorId`) | Owner courant |
| `executorCollaboratorId` | Executor V7 (si transfert "long") |
| `shared_with_json` | Array JSON serialized des collabIds partagés (Contact Share V1) |
| `sharedBy` / `sharedAt` / `sharedNote` | Métadonnées share contact (≠ booking share_transfer) |

### B.3 Liaison booking ↔ contact

**Pas de propagation automatique** : un booking `share_transfer` n'ajoute **pas** automatiquement le sender dans `contacts.shared_with_json`. Conséquence : le contact reste `assignedTo=receiver` et `shared_with=[]` côté Jordan → invisible au filtre actuel.

> 💡 **Implication design** : la solution la plus propre est d'**élargir les filtres** plutôt que de modifier `shared_with` (qui est une sémantique distincte du Contact Share, à ne pas mélanger avec le suivi sender d'un share_transfer).

---

## C. FILTRES FRONTEND/BACKEND RESPONSABLES

### C.1 Frontend (4 hotspots)

| # | Fichier | Ligne | Type | Action |
|---|---|---|---|---|
| 1 | `PhoneTab.jsx` | 5177 | Filter `myPipeContacts` | élargir |
| 2 | `CollabPortal.jsx` | 2879 | Find `contactRecord` (CRM via bookings) | élargir |
| 3 | `CollabPortal.jsx` | 2894 | Filter `myCrmContacts` (manuels) | élargir |
| 4 | `CollabPortal.jsx` | 2424 | Filter `myBookings` (Agenda) | élargir |
| 5 | `FicheContactModal.jsx` | 158 | Filter `contactBookings` (compteur fiche) | élargir |

### C.2 Backend (à confirmer)

| Route | État supposé | À vérifier |
|---|---|---|
| `GET /api/bookings` | V1.10.3-P1 a élargi (selon CLOSURE) | ⚠ Divergence audit ; check direct nécessaire sur le code monté |
| `GET /api/contacts` | Inchangé — scope inclut tous les contacts companyId, le frontend filtre ensuite | OK |
| `GET /api/bookings/reporting?role=sent` | Livré V1.10.3 P2 | OK |
| `PUT /api/bookings/:id` ownership | V1.10.3-P1 a élargi à `(owner OR sender OR receiver OR admin)` | À reconfirmer |
| `DELETE /api/bookings/:id` ownership | V1.10.3-P1 a élargi | À reconfirmer |

---

## D. SOLUTION MINIMALE RECOMMANDÉE

> **Principe directeur** : un seul concept à introduire — **"contact en suivi"** côté sender = contact où l'user a au moins un booking `share_transfer` actif. À calculer via dérivation, pas via nouvelle colonne DB.

### D.1 Helper unique (dérivation locale)

Créer un helper `isContactInSuiviForCollab(contact, bookings, collabId)` qui retourne `true` si :
- `contact.assignedTo === collabId` (owner) **OU**
- `contact.shared_with.includes(collabId)` (Contact Share V1) **OU**
- au moins 1 booking `share_transfer` lié au contact où user est `bookedByCollaboratorId` ou `agendaOwnerId`

→ Helper réutilisé par les 5 hotspots frontend. Source unique de vérité visibilité.

### D.2 Adaptation des filtres (chirurgie)

| Hotspot | Avant | Après |
|---|---|---|
| `myBookings` (Agenda) | `b.collaboratorId === collab.id` | `b.collaboratorId === collab.id \|\| b.agendaOwnerId === collab.id \|\| b.bookedByCollaboratorId === collab.id` |
| `contactBookings` (Fiche) | idem | idem |
| `myPipeContacts` (Pipeline) | `c.assignedTo === collab.id \|\| sw.includes(collab.id)` | + `\|\| isContactInSuiviForCollab(c, bookings, collab.id)` |
| `myCrmContacts` (CRM) | idem (×2 emplacements) | idem |

### D.3 Décoration "mode suivi" (UI uniquement)

Tag chaque contact/booking dans le payload visuel avec un flag dérivé `_suiviRole`:
- `'owner'` (RDV personnel ou contact assigné)
- `'sender'` (contact transmis par moi, en suivi)
- `'receiver'` (contact reçu de quelqu'un)
- `'admin-view'` (vue admin globale)

Ce flag pilote le visuel (couleur/badge) sans toucher au modèle DB.

---

## E. DESIGN UX RECOMMANDÉ — palette saumon/orange

### E.1 Tokens couleur

```
COLORS.suivi = {
  bg:        '#FFF7F0',   // saumon très léger (fond card)
  bgStrong:  '#FFEDDD',   // saumon (highlight hover/active)
  border:    '#FB923C',   // orange-400 (contour 1.5px)
  borderSoft:'#FED7AA',   // orange-200 (contour subtil)
  text:      '#9A3412',   // orange-900 (texte badges)
  textSoft:  '#C2410C',   // orange-700 (sous-texte)
  pendingBg: '#FEF3C7',   // ambre-100 (badge "⏳ Reporting en attente")
  pendingTx: '#92400E',   // ambre-800
}
```

### E.2 Pipeline Live — card "en suivi"

- Fond : `#FFF7F0` (vs blanc pour cards normales)
- Contour : 1.5px `#FB923C` (vs 1px gris)
- Badge en haut-droite (déjà existant) : `🤝 Transmis à Guillaume` sur fond `#FED7AA` texte `#9A3412`
- Sous-texte en bas card : `⏳ En attente de reporting` ou `✅ Signé · 28 avr` selon `bookingReportingStatus`
- Drag-drop : **désactivé** côté sender (read-only en mode suivi)

### E.3 CRM — ligne contact

- Pastille colorée à gauche : ronde `#FB923C` 8px (vs gris pour normaux)
- Label discret en colonne "Statut" : `Transmis à Guillaume`
- Tri possible "Mes contacts en suivi" via filtre rapide nouveau

### E.4 Agenda — slot RDV

- Fond slot : `#FFEDDD` (saumon plus marqué)
- Contour : 1.5px `#FB923C` (vs couleur owner pour normaux)
- Texte slot : `🤝 [Contact] · → Guillaume` (préfixe `🤝` distingue immédiatement)
- Cliquable mais **non draggable** côté sender
- Légende agenda : ajouter ligne "🤝 Transmis (suivi)"

### E.5 Fiche — bloc "Transmission / Reporting"

Le bloc `FicheReportingBlock.jsx` existant (V1.10.3 P3) est conforme. Améliorations recommandées :
- Renommer le titre pour le sender : `📊 Suivi de votre transmission` (vs `📊 RDV reçus à reporter` pour receiver)
- Ajouter une mini-timeline : `Transmis le X · RDV prévu le Y · Reporté le Z`
- Si statut = `pending` côté sender : encadré ambre + texte `⏳ Guillaume n'a pas encore reporté`
- Si statut posé : badge couleur du statut + extrait note (max 120 chars, "Lire plus" pour détails)

### E.6 Onglet "Historique RDV" dans fiche

Mettre 2 sections distinctes :
- **Mes RDV** (collaboratorId = moi) — affichage classique
- **RDV transmis** (sender ou receiver) — fond saumon léger, badge "🤝 → [Nom]" ou "🤝 ← [Nom]"

---

## F. PLAN DE CORRECTION PAR PHASE

> Aucune phase ne touche au schéma DB. Chaque phase est shippable indépendamment et reversible (revert frontend simple).

### Phase 0 — Reconfirmation backend (READ-ONLY, 0.5j)

- F0.1 — Auditer le code prod monté pour trancher la divergence § A.3 :
  - `GET /api/bookings` filtre-t-il sur `(collaboratorId OR agendaOwnerId OR bookedByCollaboratorId)` ou seulement `collaboratorId` ?
  - `PUT/DELETE /api/bookings/:id` ownership élargi ou non ?
- F0.2 — Si backend NON élargi → corriger backend en P1 avant frontend (sinon frontend tirerait un payload incomplet).
- F0.3 — Healthcheck post-vérif via curl : un sender doit récupérer ses bookings transmis dans `GET /api/bookings`.

### Phase 1 — Helper `isContactInSuiviForCollab` + filtre Agenda (1j)

- F1.1 — Créer helper dans `app/src/shared/data/suivi.js` (ou équivalent existant) — pure function
- F1.2 — Élargir `myBookings` filter (CollabPortal:2424) → 4 vues Agenda OK d'un coup
- F1.3 — Visuel mode suivi sur slot Agenda (couleur + badge `🤝 → [Nom]`)
- F1.4 — Test manuel : Jordan crée booking pour Guillaume → voit le RDV en orange dans son agenda jour/sem/mois/liste

### Phase 2 — Pipeline Live + CRM (1.5j)

- F2.1 — Élargir `myPipeContacts` (PhoneTab:5177) avec helper
- F2.2 — Élargir `myCrmContacts` (CollabPortal:2879 + 2894) avec helper
- F2.3 — Décoration card Pipeline (fond saumon + contour orange + badge déjà-livré devient reachable)
- F2.4 — Décoration ligne CRM (pastille + label "Transmis à X")
- F2.5 — Désactiver drag-drop pipeline pour cards en mode suivi (sender) — read-only
- F2.6 — Test manuel : contact transmis reste visible Pipeline Live + CRM côté Jordan, drag-drop désactivé

### Phase 3 — Fiche : compteur historique + bloc enrichi (1j)

- F3.1 — Élargir `contactBookings` (FicheContactModal:158) avec OR multi-champ
- F3.2 — Section dédiée "RDV transmis" dans onglet Historique avec préfixe `🤝`
- F3.3 — Enrichir `FicheReportingBlock.jsx` :
  - titre role-aware (`📊 Suivi de votre transmission` vs `📊 RDV reçus à reporter`)
  - mini-timeline transmis/RDV/reporté
  - encadré ambre `⏳ En attente de reporting` côté sender quand `pending`
- F3.4 — Test manuel : compteur RDV affiche le bon nombre côté sender ; bloc Reporting affiche timeline

### Phase 4 — Notifications + traçabilité (0.5j, optionnel V1.10.4)

- F4.1 — Vérifier que la notif sender post-`PUT /api/bookings/:id/report` (V1.10.3 P2) est bien reçue
- F4.2 — Ajouter timeline dans bloc Reporting : `Transmis le X · RDV prévu le Y · Reporté le Z par Guillaume`
- F4.3 — Cohérence avec memory `feedback_cross_collab_followups` : badges agenda 🤝 (jour/semaine/mois/Prochain RDV/modal détail) + timeline frontend

### Phase 5 — Documentation + handoff (0.5j)

- F5.1 — `docs/rdv-transmis-suivi-v1104.md` (procédure utilisateur sender/receiver)
- F5.2 — Update CLAUDE.md §10.3 (pattern dérivation `isContactInSuiviForCollab`)
- F5.3 — HANDOFF V1.10.4 + tag git
- F5.4 — Memory `project_v1104_rdv_transmis_full_visibility` delivered

**Total estimé : 4-5 jours-homme** (selon résultat Phase 0). Phasing strict, chaque phase shippable individuellement.

---

## G. TESTS OBLIGATOIRES

### G.1 Tests fonctionnels (chaque phase)

| # | Scénario | Vue | Acteur | Résultat attendu |
|---|---|---|---|---|
| T1 | Jordan crée booking pour Guillaume (share_transfer) | — | Jordan | `bookingType='share_transfer'` auto-marqué backend |
| T2 | Jordan ouvre Agenda jour | Agenda | Jordan | Slot orange visible avec mention `🤝 → Guillaume` |
| T3 | Jordan ouvre Agenda semaine | Agenda | Jordan | Idem T2, dans la grille semaine |
| T4 | Jordan ouvre Agenda mois | Agenda | Jordan | Compteur jour incrémenté + couleur distincte |
| T5 | Jordan ouvre Agenda liste | Agenda | Jordan | RDV apparaît avec badge transmis |
| T6 | Jordan ouvre Pipeline Live | Pipeline | Jordan | Contact reste visible, card fond saumon, badge "Transmis à Guillaume", drag-drop désactivé |
| T7 | Jordan ouvre Mon CRM | CRM | Jordan | Contact reste visible, pastille orange, label "Transmis à Guillaume" |
| T8 | Jordan ouvre fiche contact | Fiche | Jordan | Compteur "RDV (X)" inclut share_transfer ; bloc Reporting affiche statut+timeline |
| T9 | Guillaume ouvre fiche contact | Fiche | Guillaume | Bloc Reporting affiche "Reçu de Jordan" + bouton "Faire le reporting" |
| T10 | Guillaume rapporte (status=signed, note) | Fiche | Guillaume | Notif Jordan + status mis à jour |
| T11 | Jordan revient sur fiche | Fiche | Jordan | Bloc Reporting affiche ✅ Signé + note Guillaume + horodatage |
| T12 | Anthony (ni sender ni receiver) ouvre fiche | Fiche | Anthony | Bloc Reporting masqué (auto-hide si vide pour ce role) |

### G.2 Tests d'isolation stricte

| # | Scénario | Résultat attendu |
|---|---|---|
| I1 | Anthony ouvre Pipeline Live / CRM / Agenda | Aucune trace du contact ou booking transmis |
| I2 | Admin ouvre toutes vues | Voit tout (admin override existant) |
| I3 | Tentative `PUT /api/bookings/:id/report` par Anthony | HTTP 403 (déjà couvert V1.10.3 P2) |
| I4 | Jordan tente `PUT /:id/report` (sender, pas receiver) | HTTP 403 (réservé receiver+admin) |

### G.3 Tests de régression V1.10.3-FULL

| # | Vérification | Résultat attendu |
|---|---|---|
| R1 | Tab Reporting RDV (sub-tabs Reçus/Transmis) | Inchangé, fonctionnel |
| R2 | Reporting modal 6 statuts FR | Inchangé |
| R3 | PhoneTab card existant (V1.10.3-P2) "Transmis à X" | Inchangé, désormais visible côté sender (consequence positive du fix) |
| R4 | Backend POST `/api/bookings` auto-mark `share_transfer` | Inchangé |
| R5 | Audit_logs / notif `_source` cross-collab UX | Inchangé |
| R6 | Refactor S1.4 dormant non touché | Inchangé |

### G.4 Tests de non-régression DB

| # | Vérification | Résultat attendu |
|---|---|---|
| D1 | `PRAGMA integrity_check` | ok |
| D2 | `PRAGMA foreign_key_check` | 0 violation |
| D3 | Aucune nouvelle colonne / table | confirmé |
| D4 | Aucune migration script | confirmé |

### G.5 Tests d'observation post-deploy

- O1 — 24h après deploy : vérifier `audit_logs` pour `entityType='booking'` + `action LIKE '%report%'`
- O2 — 48h : compter contacts "en suivi" actifs par collab (devrait corréler avec `bookings WHERE bookingType='share_transfer'`)
- O3 — 7j : aucun ticket utilisateur "contact disparu" type V1.10.3 pré-FULL

---

## 7 questions audit (réponses synthétiques)

1. **Pourquoi le RDV transmis est visible Reporting mais pas Pipeline Live côté Jordan ?**
   Le tab Reporting tape directement sur `GET /api/bookings/reporting?role=sent` (route dédiée scope sender). Le Pipeline Live filtre côté frontend sur `c.assignedTo === collab.id || sw.includes(collab.id)` qui ne capte pas la relation booking-share_transfer.

2. **Le contact est-il dans `shared_with_json` ?**
   **Non.** Le `share_transfer` booking ne propage pas le sender dans `contacts.shared_with_json`. C'est une sémantique distincte (Contact Share V1.8.13 ≠ booking share_transfer V1.10.3) et la solution recommandée n'y touche pas.

3. **Le filtre Pipeline Live exclut-il encore certains contacts partagés ?**
   Oui — toute relation transmise via booking share_transfer est invisible. Les contacts vrais "Contact Share" (sharedWith peuplé) sont OK.

4. **Le CRM liste seulement `assignedTo` ?**
   Non — il liste `assignedTo` OU `shared_with` (Contact Share). Mais ne capte pas la dérivation booking-share_transfer.

5. **L'Agenda filtre seulement `collaboratorId`/`agendaOwnerId` et oublie `bookedByCollaboratorId` ?**
   Le frontend filtre **uniquement sur `collaboratorId`** (étroit). Le backend a probablement été élargi en V1.10.3-P1 (à reconfirmer Phase 0). Dans tous les cas, le frontend est le bottleneck principal.

6. **La fiche client récupère bien les bookings share_transfer liés au contact ?**
   Le bloc `FicheReportingBlock` (V1.10.3 P3) oui. L'onglet Historique RDV (compteur) non — filtre `b.collaboratorId === collab.id` strict.

7. **Les statuts reporting sont-ils disponibles dans Pipeline/CRM/Agenda ?**
   Les **données** sont disponibles (`bookingReportingStatus` peuplé V1.10.3). Le **rendu** est absent : les vues n'affichent pas le statut faute de l'avoir intégré dans leur visuel (préfixe statut sur card / slot agenda / ligne CRM).

---

## CONTRAINTES RESPECTÉES

- ✅ READ-ONLY — aucune modification code/DB/config/déploiement
- ✅ Pas de patch sans validation MH (rapport diagnostic uniquement)
- ✅ Pas de risque de casser V1.10.3-FULL — plan préserve l'existant
- ✅ Isolation stricte sender/receiver/admin maintenue dans le plan
- ✅ Workflow obligatoire 11 étapes respecté (test → diag → validation MH avant code)

---

**Document d'audit READ-ONLY — Aucune modification code, DB, config, déploiement effectuée.**
**En attente décision MH sur §F (Phase 0 + lancement Phase 1) avant tout code.**
