# AUDIT V2.1.b — AdminDash création contact + DuplicateOnCreateModal (READ-ONLY)

> **Date** : 2026-05-03
> **Demandeur** : MH
> **Type** : audit READ-ONLY pré-implémentation
> **Statut** : ✅ STOP avant code
> **Source** : `clean-main` HEAD `585228c1`, post-V2.1
> **Pré-requis** : V2.1 A+B livré (helper `precheckCreate` + branchements CollabPortal Quick Add + linkVisitor)

---

## 0. RÉSUMÉ EXÉCUTIF

V2.1.b = brancher la **création contact AdminDash** (`handleCreateContact`) sur la même `DuplicateOnCreateModal` que le flow CollabPortal V1.13.0 + V2.1.

**Découverte critique** : `DuplicateOnCreateModal` consomme `useCollabContext()` (ligne 34) qui **throw** si pas de provider. AdminDash n'a PAS de `CollabProvider` autour → **render direct = crash ErrorBoundary**.

→ **Solution choisie** : rendre `useCollabContext` *optionnel* dans `DuplicateOnCreateModal` + accepter `collab` et `contacts` en **props prioritaires** (fallback context). Backward compat 100% pour CollabPortal.

**Périmètre minimal MH** :
- ✅ créer quand même → `onForceCreate` (admin/supra)
- ✅ compléter / fusionner si disponible → `onEnrich`
- ✅ voir fiche → bouton inline "Voir détails" déjà dans `DuplicateMatchCard` (rien à wirer)
- ✅ annuler → `onClose`

**Hors scope V2.1.b** (boutons cachés car handlers `undefined` = bouton non rendu dans MatchCard) :
- ❌ `onShare` → admin n'est pas un destinataire collab
- ❌ `onCreateMyOwn` → scope-collab parallel V1.13.1.e ne s'applique pas (admin pas un collab assigné par défaut)
- ❌ `onArchive` → reportable V2.1.c si MH le souhaite
- ❌ `onHardDelete` → nécessite render `HardDeleteContactModal` séparé (effort +30min)
- ❌ `onDelete` → soft archive owner-only, pas de notion d'owner pour admin

**Pattern minimal** : 3 handlers admin (`submitNewContactAdmin`, `handleDuplicateForceCreateAdmin`, `handleDuplicateEnrichAdmin`) + state `duplicateOnCreateData` + 1 render top-level.

**Effort total** : ~2h dev + workflow strict 17 étapes ~3-4h.

---

## 1. INVENTAIRE EXACT — état AdminDash actuel

### 1.1 `handleCreateContact` (AdminDash.jsx:1261-1274)

```js
const handleCreateContact = (c) => {
  // Duplicate detection (LOCAL — frontend only via findDuplicateContact)
  const dupes = findDuplicateContact(c.email, c.phone);
  if (dupes.length > 0) {
    const dupeNames = dupes.map(d=>d.name).join(", ");
    const go = window.confirm(
      `⚠️ Doublon possible !\n\nContact(s) similaire(s) trouvé(s) : ${dupeNames}\n\n` +
      `Voulez-vous quand même créer ce contact ?`
    );
    if (!go) return;
  }
  const nc = { ...c, id:"ct"+Date.now(), companyId:company.id, totalBookings:0, lastVisit:"",
    tags:c.tags||[], notes:c.notes||"", rating:null, docs:[], createdAt:new Date().toISOString() };
  setContacts(p => [...p, nc]);
  setShowNewContact(false);
  notif("Contact créé");
  api("/api/data/contacts", { method:"POST", body:nc });
};
```

**Diagnostic** :
- ✅ Détection doublon **locale** (state `contacts`, fonction `findDuplicateContact` ligne 1152)
- ❌ **Pas** de pré-check backend `/api/data/contacts/check-duplicate-single`
- ❌ UX = `window.confirm` natif (pas de modale riche)
- ❌ Pas de `_forceCreate` flag → backend V1.13.1.e silent merge possible (`_duplicate:true` retourné, perdu)
- ❌ Pas d'enrich path
- ❌ Pas de raison/justification audit

### 1.2 Imports AdminDash (lignes 1-44) — ce qui est dispo

| Import | Statut |
|---|---|
| `api` (services/api) | ✅ ligne 22 |
| `notif` / `showNotif` | ✅ déclaré ligne 1233-1238 |
| `setContacts`, `contacts` | ✅ props |
| `setAllContacts`, `allContacts` | ✅ props (pour sync supra) |
| `setShowNewContact`, `showNewContact` | ✅ state ligne 645 |
| `company` (id) | ✅ prop |
| `isSupraAdmin` | ✅ prop |
| `DuplicateOnCreateModal` | ❌ **PAS importé** (à ajouter) |
| `precheckCreate` | ❌ **PAS importé** (à ajouter — déjà créé V2.1) |
| `CollabContext` / `useCollabContext` | ❌ **AdminDash hors CollabProvider** (blocker §3) |

### 1.3 Modale source `Nouveau contact` (AdminDash.jsx:10639-10662)

Inline `<Card>` avec `ValidatedInput` × 4 (name/email/phone/notes) + `PlacesAutocomplete`. Bouton final ligne 10659 :

```js
onClick={()=>handleCreateContact({
  name: showNewContact.name,
  email: showNewContact.email||"",
  phone: showNewContact.phone||"",
  notes: showNewContact.notes||"",
  address: showNewContact.address||"",
  tags:[]
})}
```

Aucun changement requis sur la modale source elle-même : on patche `handleCreateContact` en aval.

### 1.4 `findDuplicateContact` (AdminDash.jsx:1152-1164)

Détection **locale** côté state contacts. Sera **conservée** comme **détection rapide pré-API** (UX optimiste) puis enrichie par le pré-check serveur. Ou **supprimée** (1 source de vérité backend). Recommandation §6.

---

## 2. RÉFÉRENCE PATTERN CIBLE — CollabPortal V2.1

### 2.1 Helper `precheckCreate` (shared/utils/duplicateCheck.js, V2.1)

Pure fonction déjà disponible :

```js
export const precheckCreate = (nc, { api, onMatch, onClose } = {}) => {
  if (!nc || (!nc.email && !nc.phone)) return Promise.resolve(false);
  if (typeof api !== 'function' || typeof onMatch !== 'function') return Promise.resolve(false);
  return api('/api/data/contacts/check-duplicate-single', {
    method: 'POST',
    body: { email: nc.email || '', phone: nc.phone || '' }
  }).then(checkRes => {
    if (checkRes && checkRes.exists) {
      if (typeof onClose === 'function') { try { onClose(); } catch {} }
      onMatch({
        matches: checkRes.matches || [],
        conflict: !!checkRes.conflict,
        pendingNewContact: { name: nc.name, email: nc.email, phone: nc.phone, _formSnapshot: nc },
      });
      return true;
    }
    return false;
  }).catch(() => false);  // fail-open
};
```

→ **Réutilisable tel quel** par AdminDash. Aucune modification du helper.

### 2.2 `submitNewContact` (CollabPortal:3410-3445) — pattern à dupliquer

Structure clé :
1. Stamp `_forceCreate`, `_forceCreateReason`, `_forceCreateJustification`, `_pending` flags
2. Optimistic `setContacts(p => [...p, ncWithFlags])`
3. Reset modale source
4. Toast "Contact créé" (ou "Contact créé (doublon ignoré)")
5. POST `/api/data/contacts`
6. Reconciliation : 5 cas
   - `r.error || r._forbidden` → rollback + toast danger
   - `r._duplicate` → rollback + toast info "fusionné" (sécurité legacy)
   - `r.id` manquant → rollback + toast danger
   - Succès → reconcile temp id → real backend id, clear `_pending` + `_forceCreate`

→ **Pattern admin variant** §4.

### 2.3 Backend `check-duplicate-single` (data.js:418)

- Scope **company** (pas par collab) — admin verra **tous** les contacts company
- Auth `requireAuth` + `enforceCompany` — admin a session valide ✅
- Exclut `pipeline_stage='perdu'` + `archivedAt`
- Match email exact OR phone (last 9 digits)
- Retour `{ exists, conflict, matches: [{id, name, email, phone, assignedTo, assignedName, sharedWith, pipelineStage, createdAt, matchedBy}] }`

→ **Aucune modification backend nécessaire** pour V2.1.b.

### 2.4 `handleDuplicateEnrich` (CollabPortal:3455-3468)

PUT `/api/data/contacts/:matchId` avec payload calculé par `computeEnrichPayload(target, snapshot)` (DuplicateMatchCard ligne 58). Append-only, fields vides target uniquement.

→ **Réutilisable** : `handleDuplicateEnrichAdmin` = même code, accès `setContacts` admin.

### 2.5 Render `DuplicateOnCreateModal` (CollabPortal:6805-6825)

7 callbacks wirés. Pour V2.1.b minimal : **3 wirés** (`onClose`, `onForceCreate`, `onEnrich`). Les 4 autres `undefined` → boutons cachés dans `DuplicateMatchCard` (comportement natif V1.13.1.b).

---

## 3. 🔴 BLOCKER CRITIQUE — `useCollabContext` dans DuplicateOnCreateModal

### 3.1 Le problème

`DuplicateOnCreateModal.jsx:34` :

```js
const DuplicateOnCreateModal = ({ data, onClose, onForceCreate, ... }) => {
  const { collab, contacts } = useCollabContext();  // <-- THROW si pas de provider
```

`useCollabContext.jsx:48-52` :

```js
export const useCollabContext = () => {
  const ctx = useContext(CollabContext);
  if (!ctx) throw new Error("useCollabContext must be used within CollabProvider");
  return ctx;
};
```

→ Render dans AdminDash → throw → crash ErrorBoundary.

### 3.2 Usage interne du context

`DuplicateOnCreateModal` utilise :
- `collab.role` (ligne 42) — pour décider d'afficher footer "Créer quand même" admin/supra
- `contacts` (ligne 48) — pour `findFullTarget(matchId)` (enrichit diff MatchCard)

**Aucun setter, aucun side-effect**. Pure lecture.

### 3.3 Solutions analysées

| # | Option | Effort | Risque | Backward compat |
|---|---|:---:|:---:|:---:|
| **A** | Rendre `useCollabContext` optionnel + props prioritaires | ~5 lignes | 🟢 | ✅ 100% (si props absent → context, sinon → props) |
| B | Wrapper AdminDash dans mini `CollabProvider` (admin user) | ~15 lignes | 🟡 | ✅ mais sémantique douteuse (admin ≠ collab) |
| C | Variante `AdminDuplicateOnCreateModal` (duplication) | ~80 lignes | 🔴 | DRY violation grave |
| D | Forcer AdminDash entier dans CollabProvider | ~50 lignes | 🔴 | Risque régression CollabPortal — refus |

**Reco Claude** : **A** — la plus minimale, propre, alignée règle "pas d'empilage".

### 3.4 Patch DuplicateOnCreateModal proposé (Option A)

```js
// Avant
import { useCollabContext } from "../context/CollabContext";
const DuplicateOnCreateModal = ({ data, onClose, onForceCreate, onEnrich, onShare, onArchive, onHardDelete, onCreateMyOwn, onDelete }) => {
  const { collab, contacts } = useCollabContext();

// Après (V2.1.b — context optionnel + props prioritaires)
import { useContext } from "react";
import CollabContextRaw from "../context/CollabContext";  // export raw (à exposer)
// OU plus simple : importer useCollabContext mais wrap try/catch via lazy hook
const DuplicateOnCreateModal = ({ data, onClose, onForceCreate, onEnrich, onShare, onArchive, onHardDelete, onCreateMyOwn, onDelete, collab: collabProp, contacts: contactsProp }) => {
  // V2.1.b — props prioritaires (AdminDash usage). Fallback context (CollabPortal usage).
  const ctx = useContext(CollabContextRaw) || {};
  const collab = collabProp || ctx.collab;
  const contacts = contactsProp || ctx.contacts || [];
```

⚠ **Sous-condition** : `CollabContext.jsx` ne ré-exporte pas `CollabContext` raw (juste `CollabProvider` + `useCollabContext`). Il faut **ajouter** un export :

```js
// CollabContext.jsx (V2.1.b)
export { CollabContext };  // ou export default — à choisir
```

**Lignes ajoutées DuplicateOnCreateModal** : ~5
**Lignes ajoutées CollabContext** : 1

---

## 4. PATCHES PROPOSÉS — DIFF PREVIEW V2.1.b

### 4.1 NEW exports — `CollabContext.jsx` (+1 ligne)

**Avant** (ligne 44-52) :
```js
const CollabContext = createContext(null);
export const CollabProvider = CollabContext.Provider;
export const useCollabContext = () => { ... };
```

**Après** :
```js
const CollabContext = createContext(null);
export { CollabContext };  // V2.1.b — export raw pour useContext optionnel (AdminDash flow)
export const CollabProvider = CollabContext.Provider;
export const useCollabContext = () => { ... };
```

### 4.2 PATCH — `DuplicateOnCreateModal.jsx` (+5/-2 lignes)

**Avant** (ligne 20-34) :
```js
import React, { useState } from "react";
import { T } from "../../../theme";
import { I, Btn, Modal } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";
import DuplicateMatchCard from "./DuplicateMatchCard";
...
const DuplicateOnCreateModal = ({ data, onClose, onForceCreate, onEnrich, onShare, onArchive, onHardDelete, onCreateMyOwn, onDelete }) => {
  const { collab, contacts } = useCollabContext();
```

**Après** :
```js
import React, { useState, useContext } from "react";
import { T } from "../../../theme";
import { I, Btn, Modal } from "../../../shared/ui";
import { CollabContext } from "../context/CollabContext";  // V2.1.b — context raw (optionnel)
import DuplicateMatchCard from "./DuplicateMatchCard";
...
const DuplicateOnCreateModal = ({ data, onClose, onForceCreate, onEnrich, onShare, onArchive, onHardDelete, onCreateMyOwn, onDelete, collab: collabProp, contacts: contactsProp }) => {
  // V2.1.b — props prioritaires (AdminDash). Fallback context (CollabPortal).
  const ctx = useContext(CollabContext) || {};
  const collab = collabProp || ctx.collab;
  const contacts = contactsProp || ctx.contacts || [];
```

### 4.3 PATCH — `AdminDash.jsx` — imports (+2 lignes)

Après ligne 42 (templates barrel) :
```js
// V2.1.b — Anti-doublon admin (helper unifié + modale)
import { precheckCreate } from "../../shared/utils/duplicateCheck";
import DuplicateOnCreateModal from "../collab/modals/DuplicateOnCreateModal";
```

### 4.4 PATCH — `AdminDash.jsx` — state (+1 ligne)

Après ligne 645 (`const [showNewContact, setShowNewContact] = useState(false);`) :
```js
const [duplicateOnCreateData, setDuplicateOnCreateData] = useState(null);  // V2.1.b
```

### 4.5 PATCH — `AdminDash.jsx` — helpers (+50 lignes)

Insérer après `handleCreateContact` (ligne 1274) :

```js
// ─────────────────────────────────────────────────────────
// V2.1.b — Anti-doublon admin (alignement V1.13.0/V2.1 CollabPortal)
// ─────────────────────────────────────────────────────────
// Source unique : helper precheckCreate (shared/utils/duplicateCheck).
// Pattern submitNewContactAdmin = équivalent admin de submitNewContact V1.13.0.
// 3 handlers wirés : onForceCreate, onEnrich, onClose.
// Autres handlers (share/archive/hardDelete/createMyOwn/delete) NON wirés
// V2.1.b — boutons MatchCard cachés (comportement natif si callback undefined).

const submitNewContactAdmin = (nc, { forceCreate = false, reason = '', justification = '' } = {}) => {
  const ncWithFlags = {
    ...nc,
    _forceCreate: !!forceCreate,
    _forceCreateReason: forceCreate && reason ? reason : undefined,
    _forceCreateJustification: forceCreate && justification ? justification : undefined,
    _pending: true,
  };
  setContacts(p => [...p, ncWithFlags]);
  setShowNewContact(false);
  notif(forceCreate ? 'Contact créé (doublon ignoré)' : 'Contact créé');
  api('/api/data/contacts', { method:'POST', body: ncWithFlags }).then(r => {
    if (!r || r.error || r._forbidden) {
      setContacts(p => p.filter(c => c.id !== ncWithFlags.id));
      notif('Erreur: ' + (r?.error || 'création contact échouée'), 'danger');
      return;
    }
    if (r._duplicate) {
      setContacts(p => p.filter(c => c.id !== ncWithFlags.id));
      notif('Ce contact existait déjà — fusionné', 'success');
      return;
    }
    if (!r.id) {
      setContacts(p => p.filter(c => c.id !== ncWithFlags.id));
      notif('Erreur: id serveur manquant', 'danger');
      return;
    }
    setContacts(p => p.map(c => c.id === ncWithFlags.id ? { ...c, id: r.id, _pending: false, _forceCreate: undefined } : c));
    if (typeof setAllContacts === 'function') {
      try { setAllContacts(p => Array.isArray(p) ? p.map(c => c.id === ncWithFlags.id ? { ...c, id: r.id } : c) : p); } catch {}
    }
  });
};

// V2.1.b — Compléter cette fiche (enrich-only, append-only) — équivalent CollabPortal:3455
const handleDuplicateEnrichAdmin = async (matchId, enrichPayload) => {
  const body = { ...enrichPayload, companyId: company?.id };
  const r = await api(`/api/data/contacts/${matchId}`, { method:'PUT', body });
  if (r?.success || r?.id || (!r?.error && !r?._forbidden)) {
    setContacts(p => p.map(c => c.id === matchId ? { ...c, ...enrichPayload } : c));
    if (typeof setAllContacts === 'function') {
      try { setAllContacts(p => Array.isArray(p) ? p.map(c => c.id === matchId ? { ...c, ...enrichPayload } : c) : p); } catch {}
    }
    notif('Fiche enrichie avec succès');
  } else {
    notif('Erreur enrichissement : ' + (r?.error || 'inconnu'), 'danger');
  }
  setDuplicateOnCreateData(null);
};
```

### 4.6 PATCH — `AdminDash.jsx` — `handleCreateContact` rewrite (+10/-10 lignes)

**Avant** (ligne 1261-1274) :
```js
const handleCreateContact = (c) => {
  const dupes = findDuplicateContact(c.email, c.phone);
  if (dupes.length > 0) {
    const dupeNames = dupes.map(d=>d.name).join(", ");
    const go = window.confirm(`⚠️ Doublon possible !\n\nContact(s) similaire(s) trouvé(s) : ${dupeNames}\n\nVoulez-vous quand même créer ce contact ?`);
    if (!go) return;
  }
  const nc = { ...c, id:"ct"+Date.now(), companyId:company.id, totalBookings:0, lastVisit:"", tags:c.tags||[], notes:c.notes||"", rating:null, docs:[], createdAt:new Date().toISOString() };
  setContacts(p => [...p, nc]);
  setShowNewContact(false);
  notif("Contact créé");
  api("/api/data/contacts", { method:"POST", body:nc });
};
```

**Après** :
```js
const handleCreateContact = async (c) => {
  const nc = { ...c, id:"ct"+Date.now(), companyId:company.id, totalBookings:0, lastVisit:"",
    tags:c.tags||[], notes:c.notes||"", rating:null, docs:[],
    pipeline_stage: c.pipeline_stage || 'nouveau',
    createdAt:new Date().toISOString() };
  // V2.1.b — Pré-check anti-doublon backend (remplace findDuplicateContact + window.confirm).
  // Si dup → DuplicateOnCreateModal s'ouvre, _formSnapshot conserve nc pour onForceCreate.
  const isDup = await precheckCreate(nc, {
    api,
    onMatch: (dupData) => setDuplicateOnCreateData(dupData),
    onClose: () => setShowNewContact(false),
  });
  if (isDup) return;
  submitNewContactAdmin(nc, { forceCreate: false });
};
```

### 4.7 PATCH — `AdminDash.jsx` — render `DuplicateOnCreateModal` top-level (+15 lignes)

Insérer **avant** `</div>` final du composant AdminDash (à localiser via Read final lignes — généralement avant `)` de return). Render conditionnel :

```jsx
{/* V2.1.b — Modale doublon admin. Props collab/contacts injectés (AdminDash hors CollabProvider). */}
{duplicateOnCreateData && (
  <DuplicateOnCreateModal
    data={duplicateOnCreateData}
    collab={{ role: 'admin' }}  // V2.1.b — admin AdminDash : footer "Créer quand même" visible
    contacts={contacts}
    onClose={() => {
      setDuplicateOnCreateData(null);
      setShowNewContact(true);  // restaure modale source (formulaire intact)
    }}
    onForceCreate={(reason, justification) => {
      const snapshot = duplicateOnCreateData?.pendingNewContact?._formSnapshot;
      setDuplicateOnCreateData(null);
      if (snapshot) submitNewContactAdmin(snapshot, { forceCreate: true, reason, justification });
    }}
    onEnrich={handleDuplicateEnrichAdmin}
    // V2.1.b minimal : onShare/onArchive/onHardDelete/onCreateMyOwn/onDelete NON wirés (boutons cachés MatchCard)
  />
)}
```

### 4.8 Récap volumétrie V2.1.b

| Fichier | Δ | Détail |
|---|---|---|
| `CollabContext.jsx` | +1 | export raw `CollabContext` |
| `DuplicateOnCreateModal.jsx` | +5 / -2 | useContext optionnel + props collab/contacts prioritaires |
| `AdminDash.jsx` | +78 / -10 | imports + state + 2 handlers + helper submit + patch handleCreateContact + render top-level |
| **Total** | **+84 / -12** | **3 fichiers patchés, 0 NEW** |

Conforme à la règle "pas d'empilage" (réutilise helper V2.1, pas de nouveau composant, pas de nouvelle modale).

---

## 5. COUVERTURE TESTS V2.1.b

### Tests fonctionnels (T1-T5)

| # | Scénario | Attendu |
|---|---|---|
| **T1** | AdminDash → Nouveau contact → email **existant** chez Julie (collab) → Créer | DuplicateOnCreateModal s'ouvre, match Julie affichée |
| **T2** | AdminDash → Nouveau contact → téléphone **existant** chez Thomas (collab) → Créer | DuplicateOnCreateModal s'ouvre, match Thomas affichée |
| **T3** | AdminDash → Nouveau contact → email/phone **nouveaux** → Créer | Création directe, toast "Contact créé", contact apparaît dans liste |
| **T4** | T1/T2 → "Créer quand même…" → Raison "test_data" + justification 10+ chars → Confirmer | Force-create OK, toast "Contact créé (doublon ignoré)", audit log enrichi backend |
| **T5** | T1/T2 → "Annuler" | Modale doublon ferme, modale Nouveau contact se ré-ouvre (formulaire intact) |

### Tests régression (T6-T11)

| # | Scénario | Attendu |
|---|---|---|
| **T6** | CollabPortal NewContactModal V1.13.0 → email existant | DuplicateOnCreateModal OK (props absent → fallback context) |
| **T7** | CollabPortal Quick Add Hub SMS V2.1 → phone existant | DuplicateOnCreateModal OK (régression V2.1) |
| **T8** | CollabPortal linkVisitorToContacts V2.1 → email existant | DuplicateOnCreateModal OK (régression V2.1) |
| **T9** | V1.14.1.z hard delete archivés (admin) | Inchangé |
| **T10** | V1.14.1.x.1 archived fiche fix | Inchangé |
| **T11** | ScheduleRdvModal silent merge `_duplicate:true` | Inchangé (R1 hors scope) |

### Tests réseau (T12-T13)

| # | Scénario | Attendu |
|---|---|---|
| **T12** | check-duplicate-single timeout/erreur (admin) | Fail-open : création directe |
| **T13** | Backend retourne 401/403 | Création directe (fail-open) — éventuel toast erreur sur POST suivant |

---

## 6. DÉCISIONS OUVERTES — Q1-Q4

### Q1 — Conserver `findDuplicateContact` (détection locale) ?

| Option | Reco |
|---|---|
| **A** Supprimer entièrement (1 source vérité backend) | reco Claude — DRY |
| **B** Garder en complément (UX optimiste avant API call) | redondant, +risque divergence |

**Reco** : **A** — supprimer `findDuplicateContact` (lignes 1152-1164) après migration. Réduit dette code.

### Q2 — Périmètre handlers admin

| Option | Description |
|---|---|
| **A (minimal)** | onForceCreate + onEnrich + onClose seuls (V2.1.b strict) |
| **B (étendu)** | + onArchive (admin peut archiver doublon) |
| **C (complet)** | + onHardDelete (modale séparée à render) + onShare + onDelete |

**Reco** : **A** pour V2.1.b. **B-C** = V2.1.c séparé si MH le veut.

### Q3 — Stratégie context

| Option | |
|---|---|
| **A** Rendre `useCollabContext` optionnel + props (Option A §3) | reco Claude |
| **B** Wrapper AdminDash dans mini-provider | semantically wrong |

**Reco** : **A**.

### Q4 — `collab` injecté dans AdminDash render

| Option | |
|---|---|
| **A** `collab={{ role: 'admin' }}` (constante) | suffit pour le footer admin |
| **B** Récupérer depuis localStorage session | + précis mais 5 lignes extra |

**Reco** : **A** pour V2.1.b. AdminDash = admin par définition.

---

## 7. RISQUES SPÉCIFIQUES V2.1.b

| # | Risque | Sévérité | Mitigation |
|---|---|:---:|---|
| **R1** | DuplicateOnCreateModal CollabPortal régression (props absent → fallback context) | 🟢 | Pattern try/catch absent, useContext returns null si pas de provider → `|| {}` safe. T6-T8 valident. |
| **R2** | Render top-level AdminDash : position du JSX (composant fait 13 000+ lignes) | 🟡 | Localiser le `return (...)` final via grep `<\/div>\s*\)\;\s*\}\;` ou similaire. Render avant fermeture. |
| **R3** | `setAllContacts` sync (admin context supra) | 🟢 | Déjà géré pattern existant ligne 1282 (typeof check + try/catch) |
| **R4** | Admin modal Z-index conflit avec autres modales AdminDash | 🟡 | `Modal` shared/ui gère z-index correct (testé V1.13.0). À tester T4 si admin a `<ConfirmModal>` ouvert. |
| **R5** | Backend `_forceCreate` flag : audit_logs admin sans `companyId` (dette §5bis.1) | 🟢 | requireAuth + enforceCompany → `req.auth.companyId` présent côté admin. Pas de bug latent. |
| **R6** | `findDuplicateContact` supprimé → callers cassés | 🟢 | Grep confirme : 1 seul caller (handleCreateContact ligne 1263). Suppression safe. |

---

## 8. CONFORMITÉ CONTRAINTES MH

| Contrainte | Respect |
|---|---|
| Pas de DB | ✅ |
| Backend uniquement si indispensable | ✅ aucun changement backend |
| Réutiliser DuplicateOnCreateModal existante | ✅ Option A — props prioritaires fallback context |
| Ne jamais bloquer la création | ✅ fail-open helper precheckCreate |
| Fail-open si erreur réseau | ✅ helper retourne false sur catch |
| Préserver `_forceCreate` | ✅ submitNewContactAdmin propage flags |
| Patch minimal | ✅ +84 / -12 lignes, 0 NEW fichier |
| Audit READ-ONLY avant code | ✅ ce document |
| Diff preview obligatoire | ✅ §4 |
| STOP avant SCP | ✅ aucune ligne écrite |

---

## 9. ESTIMATION FINALE V2.1.b

| Tâche | Effort |
|---|:---:|
| Patch `CollabContext.jsx` (+1 ligne export) | 5 min |
| Patch `DuplicateOnCreateModal.jsx` (useContext optionnel) | 15 min |
| Patch `AdminDash.jsx` (imports + state + 2 handlers + submit helper) | 45 min |
| Patch `handleCreateContact` rewrite + render top-level | 30 min |
| Suppression `findDuplicateContact` (Q1=A) | 5 min |
| Build + diff preview review | 20 min |
| Workflow strict 17 étapes (backup pré + deploy + smoke + tests UI + commit + push + tag + backup post + handoff) | 1h30 |
| **Total V2.1.b** | **~3h30** |

---

## 10. ✅ STOP — Aucune ligne de code écrite

Audit READ-ONLY V2.1.b terminé. Aucune modification effectuée.

**Prochaine étape attendue** :
1. MH valide les 4 décisions Q1-Q4
2. MH confirme **GO V2.1.b**
3. Patch dans l'ordre : `CollabContext` → `DuplicateOnCreateModal` → `AdminDash`
4. Build + STOP avant SCP
5. Workflow strict 17 étapes

**Aucune action sans GO MH explicite.**

---

**Sources** :
- Repo local : HEAD `585228c1`
- Code lu :
  - [`AdminDash.jsx:1152-1164`](app/src/features/admin/AdminDash.jsx#L1152-L1164) (findDuplicateContact)
  - [`AdminDash.jsx:1261-1274`](app/src/features/admin/AdminDash.jsx#L1261-L1274) (handleCreateContact)
  - [`AdminDash.jsx:10639-10662`](app/src/features/admin/AdminDash.jsx#L10639-L10662) (modale source)
  - [`CollabPortal.jsx:3410-3445`](app/src/features/collab/CollabPortal.jsx#L3410-L3445) (submitNewContact reference)
  - [`CollabPortal.jsx:3455-3567`](app/src/features/collab/CollabPortal.jsx#L3455-L3567) (handleDuplicate* handlers)
  - [`CollabPortal.jsx:3608-3612`](app/src/features/collab/CollabPortal.jsx#L3608-L3612) (_precheckCreateAndOpenDup wrapper)
  - [`CollabPortal.jsx:6805-6825`](app/src/features/collab/CollabPortal.jsx#L6805-L6825) (render reference)
  - [`DuplicateOnCreateModal.jsx`](app/src/features/collab/modals/DuplicateOnCreateModal.jsx) (entier — blocker §3)
  - [`DuplicateMatchCard.jsx`](app/src/features/collab/modals/DuplicateMatchCard.jsx) (pas useCollabContext)
  - [`CollabContext.jsx`](app/src/features/collab/context/CollabContext.jsx) (throw si pas provider)
  - [`shared/utils/duplicateCheck.js`](app/src/shared/utils/duplicateCheck.js) (helper V2.1)
  - [`server/routes/data.js:418`](server/routes/data.js#L418) (check-duplicate-single backend, scope company)
- Audits antérieurs :
  - [`AUDIT-V2.1-HARMONISATION-6-CHEMINS-2026-05-03.md`](docs/audits/2026-05/AUDIT-V2.1-HARMONISATION-6-CHEMINS-2026-05-03.md) §3.4 (R1.7 alerte AdminDash submitNewContactAdmin)
  - `AUDIT-V2-DOUBLONS-INTELLIGENTS-2026-05-03.md` (master)
- Memory rules :
  - `feedback_phase_workflow_17_steps.md`
  - `feedback_code_no_root_file_piling.md`
  - `feedback_deploy_process_strict_12_steps.md`
