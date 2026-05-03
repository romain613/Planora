# AUDIT V2.2.c — UI AdminDash Doublons (READ-ONLY)

> **Date** : 2026-05-03
> **Demandeur** : MH
> **Type** : audit READ-ONLY pré-implémentation
> **Statut** : ✅ STOP avant code
> **Source** : `clean-main` HEAD `3b17ee54`, post-V2.2.b
> **Pré-requis** : V2.2.a + V2.2.b livrés (backend prêt à consommer)

---

## 0. RÉSUMÉ EXÉCUTIF

V2.2.c livre **l'interface admin** pour exploiter `GET /api/data/contacts/duplicates-scan` (V2.2.b) :
- 4e vue toggle **Doublons** dans AdminDash CRM tab (à côté Table/Pipeline/Funnel)
- NEW composant `DuplicatesPanel.jsx` (~170 lignes, séparé pour ne pas alourdir AdminDash 11.9k lignes)
- Réutilisation **MergeContactsModal V1.13.2.b** (fallback context — pattern V2.1.b)
- Réutilisation **useMergeContacts** hook (pure, déjà compatible)
- Bouton **Voir fiche** → ouvre `selectedContact` modal admin existante
- Bouton **Fusionner** → ouvre `MergeContactsModal` avec primary fixé
- Bouton **Ignorer ce groupe** → persist localStorage `c360-duplicates-ignored-<companyId>`

**Volumétrie** : 3 fichiers patchés + 1 NEW.

| Fichier | Δ | Détail |
|---|---|---|
| `MergeContactsModal.jsx` | +6/-2 | useContext optionnel + props prioritaires (pattern V2.1.b) |
| `AdminDash.jsx` | +60 | imports + hook + 4e toggle item + branche render + render modale top-level |
| `components/DuplicatesPanel.jsx` (NEW) | +170 | scan UI complet |
| **Total V2.2.c** | **+236 / -2** | 3 fichiers + 1 NEW, 0 backend, 0 DB |

**Effort** : ~3-4h dev + workflow strict 17 étapes ~1h30 = **~5h total**.

**Reco découpage** : 1 cycle unique. Tout le périmètre est couplé (UI + modale + scan endpoint déjà prêt).

---

## 1. INTÉGRATION VUE DOUBLONS DANS ADMINDASH

### 1.1 View toggle — extension à 4 items ([AdminDash.jsx:10026](app/src/features/admin/AdminDash.jsx#L10026))

**Avant** :
```jsx
{[
  {id:"table",icon:"list",label:"Table"},
  {id:"pipeline",icon:"trello",label:"Pipeline"},
  {id:"funnel",icon:"trending-up",label:"Funnel"}
].map(v => ...)}
```

**Après** :
```jsx
{[
  {id:"table",icon:"list",label:"Table"},
  {id:"pipeline",icon:"trello",label:"Pipeline"},
  {id:"funnel",icon:"trending-up",label:"Funnel"},
  {id:"duplicates",icon:"git-merge",label:"Doublons"}  // V2.2.c
].map(v => ...)}
```

→ +1 ligne, comportement existant inchangé pour les 3 autres vues.

### 1.2 Branche render — extension chain ternaire ([AdminDash.jsx:10754-10967](app/src/features/admin/AdminDash.jsx#L10754))

**Structure actuelle** :
```jsx
{crmView === "table" ? (
  /* table view */
) : crmView === "pipeline" ? (
  /* pipeline kanban */
) : (
  /* funnel view (default) */
)}
```

**Après V2.2.c** :
```jsx
{crmView === "table" ? (
  /* table view */
) : crmView === "pipeline" ? (
  /* pipeline kanban */
) : crmView === "duplicates" ? (
  /* V2.2.c — DuplicatesPanel */
  <DuplicatesPanel
    company={company}
    onOpenContact={setSelectedContact}
    onOpenMerge={openMerge}
    notif={notif}
  />
) : (
  /* funnel view (default) */
)}
```

→ +6 lignes, structure préservée.

### 1.3 Render `MergeContactsModal` top-level

À insérer juste avant `</div>` final du composant (cohérent avec V2.1.b qui a placé `DuplicateOnCreateModal` ligne 11866-11883) :

```jsx
{/* V2.2.c — Modale fusion admin (props collab/contacts/showNotif injectés, AdminDash hors CollabProvider) */}
{mergeTarget && (
  <MergeContactsModal
    primary={mergeTarget}
    onClose={closeMerge}
    onSuccess={() => closeMerge()}
    collab={adminCollabUser}
    contacts={contacts}
    showNotif={notif}
  />
)}
```

→ +12 lignes.

### 1.4 Hook `useMergeContacts` au top de AdminDash

```jsx
import { useMergeContacts } from "../collab/hooks/useMergeContacts";
import MergeContactsModal from "../collab/modals/MergeContactsModal";
import DuplicatesPanel from "./components/DuplicatesPanel";

// V2.2.c — admin user object pour MergeContactsModal (collab.role='admin' suffit)
const adminCollabUser = useMemo(() => {
  try {
    const s = JSON.parse(localStorage.getItem("calendar360-session") || "null");
    return { id: s?.collaboratorId || s?.userId || 'admin', role: 'admin', name: s?.name || 'Admin' };
  } catch { return { id: 'admin', role: 'admin', name: 'Admin' }; }
}, []);

// V2.2.c — Hook merge pour gérer state mergeTarget
const { mergeTarget, openMerge, closeMerge } = useMergeContacts({
  onMergeSuccess: () => {
    // Trigger refetch DuplicatesPanel via window event (déjà dispatché par modale via 'crmContactMerged')
  }
});
```

→ +12 lignes imports + state.

---

## 2. APPEL `/duplicates-scan`

### 2.1 Pattern fetch dans `DuplicatesPanel.jsx`

```js
import { api } from "../../../shared/services/api";
import { useState, useEffect, useCallback } from "react";

const DuplicatesPanel = ({ company, onOpenContact, onOpenMerge, notif }) => {
  const [groups, setGroups] = useState([]);
  const [scannedContacts, setScannedContacts] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [type, setType] = useState('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [ignored, setIgnored] = useState(() => loadIgnoredSet(company?.id));
  // pageSize fixe 50 (cohérent backend default)

  const fetchScan = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        type, includeArchived: String(includeArchived), page: String(page), pageSize: '50'
      });
      const r = await api(`/api/data/contacts/duplicates-scan?${params}`);
      if (r?.error) {
        setError(r.error);
        setGroups([]);
      } else {
        setGroups(r.groups || []);
        setTotal(r.total || 0);
        setScannedContacts(r.scannedContacts || 0);
      }
    } catch (err) {
      setError(err.message || 'Erreur réseau');
      setGroups([]);
    }
    setLoading(false);
  }, [type, includeArchived, page]);

  useEffect(() => { fetchScan(); }, [fetchScan]);

  // Listener crmContactMerged pour refetch après fusion
  useEffect(() => {
    const onMerged = () => fetchScan();
    window.addEventListener('crmContactMerged', onMerged);
    return () => window.removeEventListener('crmContactMerged', onMerged);
  }, [fetchScan]);

  // ... render
};
```

### 2.2 Helpers localStorage (ignored set)

```js
const ignoredKey = (companyId) => `c360-duplicates-ignored-${companyId || 'default'}`;

const loadIgnoredSet = (companyId) => {
  try { return new Set(JSON.parse(localStorage.getItem(ignoredKey(companyId)) || '[]')); }
  catch { return new Set(); }
};

const saveIgnoredSet = (companyId, set) => {
  try { localStorage.setItem(ignoredKey(companyId), JSON.stringify([...set])); } catch {}
};

const ignoreGroup = (signature) => {
  const next = new Set(ignored);
  next.add(signature);
  setIgnored(next);
  saveIgnoredSet(company?.id, next);
};
```

→ Persistance per-company. Aucune action backend (pas de DB).

---

## 3. AFFICHAGE GROUPES — `DuplicatesPanel.jsx`

### 3.1 Structure render (squelette)

```jsx
return (
  <Card style={{ padding: 20 }}>
    {/* Header — controls */}
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
      <h3 style={{ fontSize:16, fontWeight:700 }}>
        <I n="git-merge" s={18}/> Doublons potentiels
        <span style={{ fontSize:11, color:T.text3, marginLeft:8 }}>
          {total} groupes sur {scannedContacts} contacts
        </span>
      </h3>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        {/* Filtre type */}
        <select value={type} onChange={e => { setType(e.target.value); setPage(0); }}>
          <option value="all">Tous types</option>
          <option value="email">Email</option>
          <option value="phone">Téléphone</option>
          <option value="name">Nom</option>
        </select>
        {/* Inclure archivés */}
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
          <input type="checkbox" checked={includeArchived} onChange={e => { setIncludeArchived(e.target.checked); setPage(0); }} />
          Inclure archivés
        </label>
        {/* Refresh */}
        <Btn small onClick={fetchScan} disabled={loading}><I n="refresh-cw" s={12}/> Actualiser</Btn>
      </div>
    </div>

    {/* Loading / Error / Empty */}
    {loading && <Spinner />}
    {error && <div style={{ color: T.danger, padding:12 }}>Erreur : {error}</div>}
    {!loading && !error && groups.length === 0 && (
      <EmptyState icon="check-circle" title="Aucun doublon" subtitle="Tous les contacts sont uniques selon les critères sélectionnés." />
    )}

    {/* Liste groupes */}
    {!loading && groups.filter(g => !ignored.has(g.signature)).map(group => (
      <Card key={group.type + ':' + group.signature} style={{ padding:14, marginBottom:10, border:`1.5px solid ${typeColor(group.type)}40` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div>
            <Badge color={typeColor(group.type)}>{typeLabel(group.type)}</Badge>
            <span style={{ marginLeft:8, fontSize:13, fontWeight:700 }}>{group.signature}</span>
            <span style={{ marginLeft:8, fontSize:11, color:T.text3 }}>{group.count} fiches</span>
          </div>
          <Btn small onClick={() => ignoreGroup(group.signature)}>
            <I n="x" s={11}/> Ignorer ce groupe
          </Btn>
        </div>

        {/* Cards contacts */}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {group.contacts.map(c => (
            <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:8, background:T.bg }}>
              <Avatar name={c.name} size={28} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                  {c.name}
                  {c.isArchived && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:6, background:'#EF444418', color:'#EF4444', fontWeight:700 }}>📦 archivé</span>}
                </div>
                <div style={{ fontSize:11, color:T.text3, display:'flex', gap:10, flexWrap:'wrap' }}>
                  {c.email && <span><I n="mail" s={10}/> {c.email}</span>}
                  {c.phone && <span><I n="phone" s={10}/> {c.phone}</span>}
                  {c.assignedName && <span><I n="user" s={10}/> {c.assignedName}</span>}
                  {c.pipelineStage && <span style={{ color:stageColor(c.pipelineStage) }}>● {c.pipelineStage}</span>}
                </div>
              </div>
              <Btn small onClick={() => onOpenContact(c)}>
                <I n="eye" s={12}/> Fiche
              </Btn>
              <Btn small primary onClick={() => onOpenMerge(c)}>
                <I n="git-merge" s={12}/> Fusionner…
              </Btn>
            </div>
          ))}
        </div>
      </Card>
    ))}

    {/* Pagination */}
    {total > 50 && (
      <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:14 }}>
        <Btn small disabled={page === 0} onClick={() => setPage(p => p - 1)}><I n="chevron-left" s={12}/></Btn>
        <span style={{ fontSize:12, padding:'6px 10px' }}>Page {page+1} / {Math.ceil(total/50)}</span>
        <Btn small disabled={(page+1) * 50 >= total} onClick={() => setPage(p => p + 1)}><I n="chevron-right" s={12}/></Btn>
      </div>
    )}
  </Card>
);
```

### 3.2 Helpers visuels

```js
const typeColor = (t) => ({
  email:  '#2563EB',
  phone:  '#22C55E',
  name:   '#A855F7'
})[t] || T.text3;

const typeLabel = (t) => ({
  email: 'Même email',
  phone: 'Même téléphone',
  name:  'Même nom'
})[t] || t;
```

### 3.3 Comportement clé

- **Voir fiche** → `onOpenContact(c)` qui appelle `setSelectedContact(c)` → modal Fiche admin existante (déjà rendue ligne 10972)
- **Fusionner** → `onOpenMerge(c)` qui appelle `openMerge(c)` (du hook `useMergeContacts`) → ouvre `MergeContactsModal` avec `primary=c`
- **Ignorer** → state local + localStorage. Filtre côté UI (`groups.filter(g => !ignored.has(g.signature))`). Pas de backend.

**UX subtile** : l'utilisateur doit choisir lequel des contacts du groupe est le "primary" (celui qui survit). Bouton **Fusionner** sur chaque ligne ouvre la modale avec ce contact comme primary, puis l'utilisateur sélectionne le secondary dans la modale (autocomplete préfiltré sur les autres du groupe via la query).

---

## 4. BLOCKER MergeContactsModal — fallback context (pattern V2.1.b)

### 4.1 Le problème

[`MergeContactsModal.jsx:67-68`](app/src/features/collab/modals/MergeContactsModal.jsx#L67-L68) :

```js
const MergeContactsModal = ({ primary: initialPrimary, onClose, onSuccess }) => {
  const { contacts, collab, showNotif } = useCollabContext();  // ← THROW si AdminDash
```

→ AdminDash hors `CollabProvider` → render direct = crash. **Identique au cas V2.1.b**.

### 4.2 Patch fallback context (Option A V2.1.b)

```js
// Avant
import { useCollabContext } from "../context/CollabContext";

const MergeContactsModal = ({ primary: initialPrimary, onClose, onSuccess }) => {
  const { contacts, collab, showNotif } = useCollabContext();

// Après (V2.2.c — pattern V2.1.b)
import { useContext } from "react";
import { CollabContext } from "../context/CollabContext";

const MergeContactsModal = ({
  primary: initialPrimary, onClose, onSuccess,
  collab: collabProp, contacts: contactsProp, showNotif: showNotifProp  // V2.2.c
}) => {
  // V2.2.c — props prioritaires (AdminDash). Fallback context (CrmTab CollabPortal).
  const ctx = useContext(CollabContext) || {};
  const collab = collabProp || ctx.collab;
  const contacts = contactsProp || ctx.contacts || [];
  const showNotif = showNotifProp || ctx.showNotif || (() => {});
```

**Δ** : +6 / -2 lignes. Backward compat 100% (CrmTab CollabPortal continue de passer par context, AdminDash injecte props).

### 4.3 Précondition validée

`useMergeContacts` hook (pure, no context) ✅
`contactMergeHandlers.js` (pure, no context) ✅

→ Seul `MergeContactsModal` nécessite le patch fallback. Les helpers/hook sont neutres.

---

## 5. DIFF PREVIEW MINIMAL

### 5.1 NEW `app/src/features/admin/components/DuplicatesPanel.jsx` (~170 lignes)

Squelette complet §3.1 + helpers §3.2 + state §2.1 + localStorage §2.2.

### 5.2 PATCH `MergeContactsModal.jsx` (+6/-2)

Voir §4.2.

### 5.3 PATCH `AdminDash.jsx` (+60/-1)

#### Import
```js
// V2.2.c — UI résolution doublons admin
import { useMergeContacts } from "../collab/hooks/useMergeContacts";
import MergeContactsModal from "../collab/modals/MergeContactsModal";
import DuplicatesPanel from "./components/DuplicatesPanel";
```

#### Hook + admin user (top-level component, après autres useState)
```js
// V2.2.c — Admin user pour MergeContactsModal props (collab.role='admin' suffit pour autoriser merge)
const adminCollabUser = useMemo(() => {
  try {
    const s = JSON.parse(localStorage.getItem("calendar360-session") || "null");
    return { id: s?.collaboratorId || s?.userId || 'admin', role: 'admin', name: s?.name || 'Admin' };
  } catch { return { id: 'admin', role: 'admin', name: 'Admin' }; }
}, []);

// V2.2.c — Hook merge (gère state mergeTarget + listener crmContactMerged cross-tabs)
const { mergeTarget, openMerge, closeMerge } = useMergeContacts();
```

#### Toggle item (ligne 10026)
```jsx
{[
  {id:"table",icon:"list",label:"Table"},
  {id:"pipeline",icon:"trello",label:"Pipeline"},
  {id:"funnel",icon:"trending-up",label:"Funnel"},
  {id:"duplicates",icon:"git-merge",label:"Doublons"}  // V2.2.c
].map(v => ...)}
```

#### Branche render (ligne 10905, juste avant funnel default)
```jsx
) : crmView === "duplicates" ? (
  /* V2.2.c — Vue doublons */
  <DuplicatesPanel
    company={company}
    onOpenContact={(c) => { setSelectedContact(c); setFicheTab("history"); }}
    onOpenMerge={openMerge}
    notif={notif}
  />
) : (
```

#### Render modale top-level (avant `</div>` final, juste après DuplicateOnCreateModal V2.1.b)
```jsx
{/* V2.2.c — Modale fusion admin (props collab/contacts/showNotif injectés) */}
{mergeTarget && (
  <MergeContactsModal
    primary={mergeTarget}
    onClose={closeMerge}
    onSuccess={() => closeMerge()}
    collab={adminCollabUser}
    contacts={contacts}
    showNotif={notif}
  />
)}
```

### 5.4 Récap volumétrie

| Fichier | Δ | Type |
|---|---|---|
| `MergeContactsModal.jsx` | +6 / -2 | PATCH (fallback context) |
| `AdminDash.jsx` | +60 / -1 | PATCH (imports + hook + toggle + render branche + modale top-level) |
| `components/DuplicatesPanel.jsx` | +170 NEW | NEW fichier |
| **Total** | **+236 / -3** | 2 PATCH + 1 NEW |

---

## 6. RISQUES + MITIGATION

| # | Risque | Sévérité | Mitigation |
|---|---|:---:|---|
| **R1** | `MergeContactsModal` régression CrmTab CollabPortal après fallback context | 🟢 | Pattern V2.1.b validé (T6-T8 V2.1.b PASS). useContext returns null si pas provider → `\|\| {}` safe. |
| **R2** | `useMergeContacts` listener `crmContactMerged` double-fire (CrmTab + AdminDash si tab CRM ouvert simultanément) | 🟡 | Pas critique : refetch idempotent. Mais à valider T10 ci-dessous. |
| **R3** | Modale Z-index conflit avec `selectedContact` modal admin | 🟡 | `Modal` shared/ui handle z-index correctement. À tester T7. |
| **R4** | `MergeContactsModal` autocomplete `filterMergeablePeers` opère sur `contacts` AdminDash entiers (184 max) | 🟢 | Limit=8 dans handler, perf ok |
| **R5** | `adminCollabUser.id` peut être null si session corrompue | 🟢 | Fallback `'admin'` literal, pas crash. Backend re-vérifie permissions Q5 (admin ou owner+shared sur les 2). |
| **R6** | localStorage `c360-duplicates-ignored-<companyId>` perdu si change device | 🟡 | Acceptable V2.2.c. V2.3 pourra persister DB si besoin. |
| **R7** | `DuplicatesPanel` fetch automatique au mount sur tab pas affiché → réseau gaspillé | 🟢 | Render conditionnel `crmView === 'duplicates'` → fetch déclenché uniquement à l'affichage |
| **R8** | Refresh fréquent si user clique sur Doublons puis Table puis Doublons | 🟡 | useEffect mount = 1 fetch par switch. Pas dramatique. Si MH veut cache, V2.3 backlog. |
| **R9** | Bundle frontend grossit (~+170 lignes JSX + imports) | 🟢 | <1% sur bundle 3.1MB. Négligeable. |
| **R10** | Listener `crmContactMerged` dans `DuplicatesPanel` → refetch après fusion sur le bon tab | 🟢 | `useMergeContacts` dispatch déjà l'event ; DuplicatesPanel écoute → refetch automatique |

---

## 7. TESTS UI ATTENDUS V2.2.c

### Tests fonctionnels (T1-T7)

| # | Scénario | Attendu |
|---|---|:---:|
| **T1** | AdminDash → Contacts CRM → toggle → cliquer **Doublons** | Vue change, fetch `/duplicates-scan?type=all`, groupes affichés |
| **T2** | Sur groupe `name:romain\|sitbon` count=3 → cliquer **Voir fiche** sur 1er | Fiche admin modal s'ouvre |
| **T3** | Cliquer **Fusionner** sur 1er contact du groupe | MergeContactsModal s'ouvre avec primary fixé |
| **T4** | Dans modale : sélectionner secondary du groupe → preview → confirmer "FUSIONNER" | Fusion exécutée, modal close, refetch `/duplicates-scan` (event `crmContactMerged`) |
| **T5** | Cliquer **Ignorer ce groupe** | Groupe disparaît UI + persist localStorage `c360-duplicates-ignored-<companyId>` |
| **T6** | Toggle **Inclure archivés** → re-fetch | Groupes peuvent contenir contacts avec badge 📦 archivé |
| **T7** | Filtre type `Email` / `Téléphone` / `Nom` | Groupes filtrés par type |

### Tests régression (T8-T11)

| # | Scénario | Attendu |
|---|---|:---:|
| **T8** | CrmTab CollabPortal `MergeContactsModal` (V1.13.2.b) → ouverture depuis CRM | OK (fallback context préservé) |
| **T9** | CrmTab → fusion exécutée | OK + listener AdminDash refetch si tab Doublons ouvert (R2) |
| **T10** | V2.1.b NewContactModal admin → DuplicateOnCreateModal | OK (intact) |
| **T11** | V2.2.a `/check-duplicate-single` enrichi + V2.2.b `/duplicates-scan` | OK (déjà LIVE) |

### Tests réseau (T12-T13)

| # | Scénario | Attendu |
|---|---|:---:|
| **T12** | `/duplicates-scan` timeout/erreur | Affiche message erreur, fallback empty state |
| **T13** | Backend retourne 401/403 | Affiche message erreur, pas de crash |

---

## 8. CONFORMITÉ CONTRAINTES MH

| Contrainte | Respect |
|---|:---:|
| Pas de DB | ✅ |
| Backend uniquement si indispensable | ✅ aucun changement backend (V2.2.b déjà LIVE) |
| Patch minimal | ✅ +236 / -3 (2 patch + 1 NEW) |
| Pas de fuzzy | ✅ V2.2.d backlog |
| Pas de multi-email/phone | ✅ V2.3 séparé |
| Diff preview obligatoire | ✅ §5 (code complet pour les 3 fichiers) |
| STOP avant code | ✅ aucune ligne écrite |
| Workflow strict complet | ✅ planifié post-GO |
| Réutiliser MergeContactsModal | ✅ avec fallback context (pattern V2.1.b) |
| Bouton ignorer | ✅ localStorage persist |

---

## 9. ESTIMATION FINALE V2.2.c

| Tâche | Effort |
|---|:---:|
| NEW `DuplicatesPanel.jsx` (~170 lignes) | 1h30 |
| Patch `MergeContactsModal.jsx` (fallback context) | 15 min |
| Patch `AdminDash.jsx` (imports + hook + toggle + render branche + modale top-level) | 30 min |
| Build + grep régression + diff preview review | 30 min |
| Backup pré + SCP frontend + smoke | 15 min |
| Tests UI MH (T1-T13) | 30-60 min (selon MH) |
| Workflow strict (commit + push + tag + backup post + handoff) | 1h |
| **Total V2.2.c** | **~5h** |

---

## 10. DÉCISIONS OUVERTES — Q1-Q4

### Q1 — Bouton Ignorer per-groupe localStorage ?

| Option | |
|---|---|
| **A** Oui, localStorage `c360-duplicates-ignored-<companyId>` (Set des signatures) | reco Claude — simple, demandé MH "si simple" |
| **B** Backlog (pas de bouton Ignorer V2.2.c) | minimal mais frustrant UX |

**Reco** : **A** — patch +5 lignes, valeur UX immédiate.

### Q2 — Position du composant `DuplicatesPanel`

| Option | |
|---|---|
| **A** NEW `app/src/features/admin/components/DuplicatesPanel.jsx` | reco Claude — règle "pas d'empilage" |
| **B** Inline dans AdminDash.jsx | déjà 11.9k lignes, +170 = augmente la dette |

**Reco** : **A**.

### Q3 — Pagination simple OU virtualisée ?

| Option | |
|---|---|
| **A** Pagination simple `page/pageSize=50` (cohérent backend V2.2.b) | reco Claude — total rare > 50 groupes pour 184 contacts |
| **B** Virtualisée infinite scroll | complexité injustifiée pour le volume actuel |

**Reco** : **A**.

### Q4 — Refetch automatique après merge ?

| Option | |
|---|---|
| **A** Listener `crmContactMerged` dans DuplicatesPanel → refetch | reco Claude — UX correcte |
| **B** Bouton refresh manuel uniquement | + de friction |

**Reco** : **A**.

---

## 11. ✅ STOP — Aucune ligne de code écrite

Audit READ-ONLY V2.2.c terminé. Aucune modification effectuée.

**Prochaine étape attendue** :
1. MH valide les 4 décisions Q1-Q4
2. GO MH explicite
3. Patch dans l'ordre :
   1. `MergeContactsModal.jsx` (fallback context — précondition)
   2. NEW `components/DuplicatesPanel.jsx`
   3. `AdminDash.jsx` (imports + hook + toggle + render + modale top-level)
4. Build local + STOP avant SCP
5. Tests UI MH T1-T13
6. Workflow strict 17 étapes

**Aucune action sans GO MH explicite.**

---

**Sources** :
- Repo local : HEAD `3b17ee54`
- Code lu :
  - [`AdminDash.jsx:10025-10046`](app/src/features/admin/AdminDash.jsx#L10025-L10046) (view toggle bar + funnel display)
  - [`AdminDash.jsx:10754-10967`](app/src/features/admin/AdminDash.jsx#L10754-L10967) (chain ternaire table/pipeline/funnel)
  - [`AdminDash.jsx:10972`](app/src/features/admin/AdminDash.jsx#L10972) (selectedContact modal — réutilisable pour Voir fiche)
  - [`MergeContactsModal.jsx:67-101`](app/src/features/collab/modals/MergeContactsModal.jsx#L67-L101) (useCollabContext blocker)
  - [`useMergeContacts.js:31-57`](app/src/features/collab/hooks/useMergeContacts.js#L31-L57) (hook pure, réutilisable)
  - [`contactMergeHandlers.js:29-50`](app/src/features/collab/handlers/contactMergeHandlers.js#L29-L50) (handlers purs, no context)
  - [`server/routes/data.js:163`](server/routes/data.js#L163) (V2.2.b endpoint déjà LIVE)
- Audits antérieurs :
  - [AUDIT-V2.2.b-DUPLICATES-SCAN-…](docs/audits/2026-05/AUDIT-V2.2.b-DUPLICATES-SCAN-ENDPOINT-2026-05-03.md)
  - [AUDIT-V2.1.b-…](docs/audits/2026-05/AUDIT-V2.1.b-ADMINDASH-CREATION-CONTACTS-2026-05-03.md) §4.2 (pattern fallback context)
  - [HANDOFF-V2.1.b-…](HANDOFF-V2.1.b-ADMINDASH-DUPLICATE-CREATE.md)
  - [HANDOFF-V2.2.b-…](HANDOFF-V2.2.b-DUPLICATES-SCAN-ENDPOINT.md)
- Memory : `feedback_phase_workflow_17_steps.md`, `feedback_code_no_root_file_piling.md`
