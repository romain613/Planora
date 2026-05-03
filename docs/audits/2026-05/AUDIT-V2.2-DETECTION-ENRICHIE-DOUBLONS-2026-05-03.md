# AUDIT V2.2 — Détection enrichie doublons (READ-ONLY)

> **Date** : 2026-05-03
> **Demandeur** : MH
> **Type** : audit READ-ONLY pré-implémentation
> **Statut** : ✅ STOP avant code
> **Source** : `clean-main` HEAD `0f21a554`, post-V2.1.b
> **Pré-requis** : V2.1.b livré (helper precheckCreate + DuplicateOnCreateModal universel)

---

## 0. RÉSUMÉ EXÉCUTIF

V2.2 enrichit la détection doublon (au-delà email/phone exact) et corrige le **bug latent ScheduleRdvModal `_duplicate.id`** (déjà identifié dans audit V2.1 §4.3, jamais corrigé).

**Découpage en sous-phases**, recommandé pour livraison incrémentale :

| Phase | Périmètre | Effort | Dépendances |
|---|---|:---:|---|
| **V2.2.a** | Backend `check-duplicate-single` enrichi (name + company + flag includeArchived) + fix bug ScheduleRdvModal | ~3h | aucune |
| **V2.2.b** | NEW endpoint `GET /api/data/contacts/duplicates-scan` (groupes existants) | ~2h | V2.2.a |
| **V2.2.c** | UI résolution AdminDash (liste groupes + Fusionner via MergeContactsModal) | ~4h | V2.2.b + même blocker context que V2.1.b |
| **V2.2.d** *(optionnel)* | Fuzzy léger Levenshtein (sans lib) | ~1h30 | V2.2.a |

**Total V2.2 complet** : ~10h dev + 3 cycles workflow strict 17 étapes ~3h = **~13h**.

**Reco découpage** : **V2.2.a livré seul** d'abord (backend + bug fix, sans UI nouvelle). V2.2.b+c en cycle séparé. V2.2.d optionnel.

**Données mesurées prod** :
- Max contacts/company : **185 actifs** (CapFinances ou GENETICAT)
- Index DB existants : `idx_contacts_company_email`, `idx_contacts_company_phone`, `idx_contacts_active`, `idx_contacts_companyId_stage` ✅
- Scan O(n²) sur 185 = 34 225 comparaisons → trivial (<10ms en SQLite WAL)

---

## 1. INVENTAIRE EXACT — état actuel

### 1.1 Backend `check-duplicate-single` ([data.js:418-498](server/routes/data.js#L418-L498))

```js
POST /api/data/contacts/check-duplicate-single
Body: { email, phone }
Auth: requireAuth + enforceCompany
Filtres SQL: companyId + LOWER(email) match exact OR phone last 9 digits
Exclusions: pipeline_stage='perdu' + archivedAt
Retour: { exists, conflict, matches: [{ id, name, email, phone, assignedTo, assignedName, sharedWith, pipelineStage, createdAt, matchedBy }] }
```

**Limites actuelles** :
- ❌ Pas de match par nom (firstname + lastname)
- ❌ Pas de match par société (`company` field)
- ❌ Pas de retour des archivés (filtre `archivedAt IS NULL`) → admin ne voit pas si un doublon existe en archive
- ✅ Scope company strict (correct)
- ✅ Exclusion `'perdu'` (soft-delete strict)

### 1.2 Backend `check-duplicates` batch CSV ([data.js:389-412](server/routes/data.js#L389-L412))

Pattern bulk pour import CSV : reçoit arrays `{emails, phones}`, retourne sets `{dupEmails, dupPhones}`. Pas pertinent pour V2.2 (resté tel quel — c'est l'endpoint de l'import, pas du scan UI).

### 1.3 Backend `POST /contacts/:primaryId/merge` ([data.js:1162-1330](server/routes/data.js#L1162-L1330))

Endpoint **MERGE** existant V1.13.2.b. Fonctionne. Cascade 14 tables, audit log enrichi. Backend prêt à recevoir merge depuis UI scan V2.2.c.

### 1.4 Frontend `MergeContactsModal` ([modals/MergeContactsModal.jsx](app/src/features/collab/modals/MergeContactsModal.jsx))

Utilise `useCollabContext()` (ligne 27) → **MÊME BLOCKER que V2.1.b pour AdminDash**. Solution identique : props prioritaires + fallback context.

### 1.5 Frontend `useMergeContacts` hook ([hooks/useMergeContacts.js](app/src/features/collab/hooks/useMergeContacts.js))

API : `{ mergeTarget, openMerge, closeMerge, lastMergeResult }`. Pure, pas de context. Réutilisable en l'état dans AdminDash.

### 1.6 🐛 ~~Bug latent ScheduleRdvModal~~ — **FAUX POSITIF (correction post V2.2.a 2026-05-03)**

> **🔴 CORRECTION 2026-05-03** : pendant l'implémentation V2.2.a, découverte que ce "bug latent" n'existe pas en runtime.
> - `app/src/features/collab/modals/ScheduleRdvModal.jsx` est **du code mort** (extraction S2.11 jamais branchée — grep `import.*ScheduleRdvModal` = 0 caller, bundle md5 inchangé après edit du fichier)
> - Le **flow scheduling actif** vit dans **`CollabPortal.jsx:6505-6577`** où le fix est déjà appliqué V1.8.22.1/V1.8.22.2 :
>   - L6556 : `const createRes = await api(...)`
>   - L6562-6563 : `// _duplicate:true géré silencieusement — l'id retourné est l'existant` + `const realContactId = createRes.id`
>   - L6567+ : `realContactId` propagé dans setContacts/setPhoneScheduleForm/setTimeout
> - **Le périmètre V2.2.a se réduit donc à 1 patch backend pur (data.js)**. Pas de fix ScheduleRdvModal nécessaire.
> - `ScheduleRdvModal.jsx` reste à supprimer en cleanup séparé (hors scope V2.x).

### 1.6 (texte original conservé pour traçabilité — analyse erronée)

```js
const newContactId = 'ct'+Date.now()+Math.random()...;  // temp ID local
const newContact = { id:newContactId, ... };
await api('/api/data/contacts', { method:'POST', body:newContact });  // ← retour ignoré !
setContacts(p=>[...p, {...newContact, ...}]);            // utilise temp ID
setPhoneScheduleForm(p=>({ ...p, contactId: newContactId, ... }));  // utilise temp ID
```

**Backend POST /contacts retourne** ([data.js:337](server/routes/data.js#L337)) :
```js
if (dupEmail) return res.json({ success: true, id: dupEmail.id, _duplicate: true });
```

→ Si duplicate silent merge V1.13.1.e : `r.id` ≠ `newContactId`. Frontend continue avec son ID temp → booking créé avec `contactId = ct_temp_local` → **orphelin DB** (FK invalide ou silent miss).

**Sévérité** : 🔴 latent depuis V1.8.22 (2026-04-26), non détecté car le silent merge déclenche rarement dans le flow ScheduleRdvModal (collab crée d'abord le contact dans son scope avant RDV → email rarement déjà en base chez **lui**). Mais reste un bug réel.

### 1.7 AdminDash CRM tab ([AdminDash.jsx:9993+](app/src/features/admin/AdminDash.jsx#L9993))

Structure :
- ligne 10010 : Pipeline Stats Bar
- ligne 10025-10028 : View toggle `[Table | Pipeline | Funnel]`
- ligne 10031-10046 : Funnel par étape avec filtres
- ligne 10048+ : Search + Filters
- ligne 10754+ : Vue table
- ligne 10850+ : Vue pipeline
- **Pas de section "Doublons"** actuellement

→ **V2.2.c** : ajouter une 4e vue `[Table | Pipeline | Funnel | Doublons]` ou un bouton dédié `[🔗 Scan doublons]` au-dessus des filtres. Reco §2.

---

## 2. PÉRIMÈTRE V2.2 + DÉCOUPAGE

### 2.1 V2.2.a — Backend enrichi + fix bug (~3h)

**1. Enrichir `check-duplicate-single`** :
- Body : `{ email, phone, firstname, lastname, company, includeArchived: false }`
- Match additionnel name (firstname + lastname normalisés lower-trim NFD) → SQL `WHERE LOWER(firstname)=? AND LOWER(lastname)=?`
- Match additionnel company → SQL `WHERE LOWER(company)=?`
- Flag `includeArchived` : si `true`, enlève filtre `archivedAt IS NULL` et ajoute `isArchived: true` dans chaque match
- Conserve sémantique : pas de bloc création, juste suggérer

**2. Fix bug ScheduleRdvModal** (5 lignes) :
```js
const r = await api('/api/data/contacts', { method:'POST', body:newContact });
const realId = r?.id || newContactId;        // ← V2.2.a fix : utilise ID backend si retourné
const realContact = { ...newContact, id: realId };
setContacts(p => [...p, { ...realContact, tags:[], notes:'', totalBookings:0, rating:0, createdAt:new Date().toISOString() }]);
setPhoneScheduleForm(p => ({ ...p, contactId: realId, contactName: newName }));
```

**Volumétrie V2.2.a** :
- `data.js` : +25/-5 lignes (enrichissement check-duplicate-single)
- `ScheduleRdvModal.jsx` : +5/-3 lignes (fix bug `_duplicate.id`)
- 0 NEW fichier, 0 DB

### 2.2 V2.2.b — Endpoint `/duplicates-scan` (~2h)

**NEW** `GET /api/data/contacts/duplicates-scan` :

```js
GET /api/data/contacts/duplicates-scan?type=email&page=0&pageSize=50
Auth: requireAuth + enforceCompany + requirePermission('contacts.view')
Query params:
  - type: 'email' | 'phone' | 'name' | 'company' | 'all' (default: 'all')
  - includeArchived: bool (default: false)
  - page, pageSize (pagination simple)
Retour:
  {
    groups: [
      {
        signature: 'jean.dupont@example.com',
        type: 'email',
        contacts: [
          { id, name, email, phone, assignedTo, assignedName, pipelineStage, createdAt, isArchived },
          { id, name, email, phone, assignedTo, assignedName, pipelineStage, createdAt, isArchived },
          ...
        ],
        count: 2
      },
      ...
    ],
    total: 12,         // nombre de groupes
    page: 0,
    pageSize: 50
  }
```

**SQL strategy** (perf 185 contacts max) :

```sql
-- Email groups
SELECT LOWER(TRIM(email)) AS sig, GROUP_CONCAT(id) AS ids, COUNT(*) AS n
FROM contacts
WHERE companyId = ? AND email != '' AND COALESCE(pipeline_stage,'') != 'perdu'
  AND (? OR archivedAt IS NULL OR archivedAt = '')
GROUP BY sig
HAVING n > 1
ORDER BY n DESC, sig
LIMIT ? OFFSET ?;

-- Phone groups (last 9 digits)
SELECT SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')',''), -9) AS sig, ...
WHERE LENGTH(sig) >= 6
GROUP BY sig HAVING n > 1;

-- Name groups (firstname+lastname normalisés)
-- Note: SQLite n'a pas LOWER+NFD natif → on fait en JS post-fetch (185 lignes max)

-- Company groups
SELECT LOWER(TRIM(company)) AS sig, ... GROUP BY sig HAVING n > 1;
```

**Implémentation** : 4 SQL séparés (email/phone/name/company), merge des groupes en JS, dédup, sort, pagination en JS (185 max → trivial).

**Volumétrie V2.2.b** :
- `data.js` : +80 lignes (NEW endpoint, helper `groupDuplicates`)
- 0 NEW fichier, 0 DB

### 2.3 V2.2.c — UI résolution AdminDash (~4h)

**NEW vue dans AdminDash CRM tab** : ajouter `Doublons` au view toggle.

**Composants à wirer** :
1. State `crmView === 'duplicates'`
2. Fetch `/duplicates-scan` au mount + refresh manuel
3. Liste groupes avec accordion par type (email/phone/name/company)
4. Par groupe :
   - Liste des N contacts (Avatar + nom + assignedTo + isArchived badge)
   - Bouton **"Fusionner"** sur chaque paire (si group=2) ou bouton **"Choisir primary"** (si group >2)
   - Bouton **"Ignorer ce groupe"** (state local AdminDash, persist localStorage `c360-duplicates-ignored`)
5. Render `<MergeContactsModal>` top-level (avec props `collab`/`contacts` prioritaires comme V2.1.b)

**Blocker context** : `MergeContactsModal` consomme `useCollabContext()` (ligne 27). **Patch identique à V2.1.b** :
- Modifier `MergeContactsModal.jsx` pour accepter `collab`/`contacts`/`showNotif` en props prioritaires + fallback context
- AdminDash injecte `collab={{ role: 'admin', id: <admin_id_from_session> }}`

**Volumétrie V2.2.c** :
- `MergeContactsModal.jsx` : +6/-2 lignes (useContext optionnel + props prioritaires + fallback)
- `useMergeContacts.js` : 0 (pure)
- `AdminDash.jsx` : +120 lignes (state + fetch + render groupes + render modale top-level)
- 1 fichier potentiel `app/src/features/admin/components/DuplicatesPanel.jsx` (~150 lignes) si on veut séparer la vue (reco)
- Total : ~280 lignes, 1 NEW fichier (DuplicatesPanel)

### 2.4 V2.2.d — Fuzzy léger Levenshtein (~1h30, optionnel)

Pour matcher "Jean Dupont" ≈ "jean dupond" / "Jean.Dupont@…" ≈ "jean_dupont@…" :

```js
// shared/utils/fuzzy.js (NEW ~25 lignes)
export const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i-1] === a[j-1]
        ? m[i-1][j-1]
        : Math.min(m[i-1][j-1] + 1, m[i][j-1] + 1, m[i-1][j] + 1);
    }
  }
  return m[b.length][a.length];
};

export const similarity = (a, b) => {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - (levenshtein(a, b) / max);
};
```

**Intégration backend** : dans `/duplicates-scan`, fuzzy seuil ≥ 0.85 sur (name+email) → groupe `type:'fuzzy'`. **Coût perf** : 185×185 = 34k Levenshtein → ~50-100ms (négligeable).

**Reco** : V2.2.d **NON livré V2.2 initial** car risque de faux positifs (à calibrer). Garder en backlog.

---

## 3. DIFF PREVIEW DÉTAILLÉ

### 3.1 V2.2.a — `data.js:418` enrichi

**Avant** (extrait) :
```js
router.post('/contacts/check-duplicate-single', requireAuth, enforceCompany, (req, res) => {
  const { email, phone } = req.body || {};
  ...
});
```

**Après** :
```js
router.post('/contacts/check-duplicate-single', requireAuth, enforceCompany, (req, res) => {
  const { email, phone, firstname = '', lastname = '', company = '', includeArchived = false } = req.body || {};
  const companyId = req.auth.companyId;
  if (!email && !phone && !firstname && !lastname && !company) {
    return res.json({ exists: false, conflict: false, matches: [] });
  }
  const matches = new Map();  // dedup par contact id
  const archivedFilter = includeArchived ? '' : "AND (archivedAt IS NULL OR archivedAt = '')";

  // Email match (existant)
  if (email) {
    const cleanEmail = String(email).trim().toLowerCase();
    const m = db.prepare(`SELECT ... FROM contacts WHERE companyId=? AND LOWER(email)=? AND email!='' AND COALESCE(pipeline_stage,'')!='perdu' ${archivedFilter}`).get(companyId, cleanEmail);
    if (m) matches.set(m.id, { ...m, matchedBy: 'email' });
  }

  // Phone match (existant)
  if (phone) { ... même logique avec last-9 digits ... }

  // V2.2.a — Name match (NEW)
  if (firstname && lastname) {
    const fn = String(firstname).trim().toLowerCase();
    const ln = String(lastname).trim().toLowerCase();
    const rows = db.prepare(`SELECT ... FROM contacts WHERE companyId=? AND LOWER(TRIM(firstname))=? AND LOWER(TRIM(lastname))=? AND COALESCE(pipeline_stage,'')!='perdu' ${archivedFilter}`).all(companyId, fn, ln);
    for (const r of rows) if (!matches.has(r.id)) matches.set(r.id, { ...r, matchedBy: 'name' });
  }

  // V2.2.a — Company match (NEW)
  if (company) {
    const c = String(company).trim().toLowerCase();
    const rows = db.prepare(`SELECT ... FROM contacts WHERE companyId=? AND LOWER(TRIM(company))=? AND company!='' AND COALESCE(pipeline_stage,'')!='perdu' ${archivedFilter}`).all(companyId, c);
    for (const r of rows) if (!matches.has(r.id)) matches.set(r.id, { ...r, matchedBy: 'company' });
  }

  const conflict = ... // recalcul avec emailMatch/phoneMatch IDs distincts

  const enriched = [...matches.values()].map(m => ({
    id: m.id,
    name: m.name,
    email: m.email || '',
    phone: m.phone || m.mobile || '',
    assignedTo: m.assignedTo || '',
    assignedName: ...,
    sharedWith: ...,
    pipelineStage: m.pipeline_stage || '',
    createdAt: m.createdAt || '',
    matchedBy: m.matchedBy,
    isArchived: !!(m.archivedAt && m.archivedAt !== '')  // V2.2.a — flag
  }));

  res.json({ exists: matches.size > 0, conflict, matches: enriched });
});
```

**Δ** : +25 / -5 lignes.

### 3.2 V2.2.a — `ScheduleRdvModal.jsx:236-251` fix

**Avant** :
```js
const newContactId = 'ct'+Date.now()+Math.random().toString(36).slice(2,6);
const newName = (f._newFirstName+' '+f._newLastName).trim();
const newContact = {id:newContactId, name:newName, ...};
await api('/api/data/contacts', {method:'POST', body:newContact});
setContacts(p=>[...p, {...newContact, tags:[], ...}]);
setPhoneScheduleForm(p=>({...p, contactId:newContactId, contactName:newName}));
setTimeout(()=>{
  phoneScheduleForm.contactId = newContactId;
  phoneScheduleForm.contactName = newName;
  ...
}, 50);
```

**Après** :
```js
const tempContactId = 'ct'+Date.now()+Math.random().toString(36).slice(2,6);
const newName = (f._newFirstName+' '+f._newLastName).trim();
const newContact = {id:tempContactId, name:newName, ...};
const r = await api('/api/data/contacts', {method:'POST', body:newContact});
// V2.2.a — fix bug latent V1.8.22 : si backend silent merge V1.13.1.e, utiliser ID retourné
const realId = r?.id || tempContactId;
setContacts(p=>[...p, {...newContact, id: realId, tags:[], notes:'', totalBookings:0, rating:0, createdAt:new Date().toISOString()}]);
setPhoneScheduleForm(p=>({...p, contactId: realId, contactName:newName}));
setTimeout(()=>{
  phoneScheduleForm.contactId = realId;
  phoneScheduleForm.contactName = newName;
  ...
}, 50);
```

**Δ** : +3 / -1 ligne (essentiellement renommage + lecture `r.id`).

### 3.3 V2.2.b — `data.js` NEW endpoint

**Position critique** : insérer **AVANT** `router.get('/contacts/:id', ...)` ligne 156 (sinon Express matche `:id='duplicates-scan'`).

```js
// V2.2.b — NEW : scan tous les groupes de doublons existants company.
// Read-only, non destructif. Pagination simple.
router.get('/contacts/duplicates-scan', requireAuth, enforceCompany, requirePermission('contacts.view'), (req, res) => {
  try {
    const companyId = req.auth.companyId;
    const type = String(req.query.type || 'all');
    const includeArchived = req.query.includeArchived === 'true';
    const page = Math.max(0, parseInt(req.query.page || '0', 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize || '50', 10)));
    const archivedFilter = includeArchived ? '' : "AND (archivedAt IS NULL OR archivedAt = '')";

    // Fetch all active contacts for this company (185 max → trivial)
    const all = db.prepare(`SELECT id, name, firstname, lastname, email, phone, mobile, company, assignedTo, pipeline_stage, archivedAt, createdAt, shared_with_json FROM contacts WHERE companyId = ? AND COALESCE(pipeline_stage,'') != 'perdu' ${archivedFilter}`).all(companyId);

    // Build collaborator name map (1 query)
    const collabRows = db.prepare('SELECT id, name FROM collaborators WHERE companyId = ?').all(companyId);
    const collabMap = Object.fromEntries(collabRows.map(c => [c.id, c.name]));

    const enrich = (c) => ({
      id: c.id,
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || c.mobile || '',
      company: c.company || '',
      assignedTo: c.assignedTo || '',
      assignedName: collabMap[c.assignedTo] || '',
      pipelineStage: c.pipeline_stage || '',
      createdAt: c.createdAt || '',
      isArchived: !!(c.archivedAt && c.archivedAt !== '')
    });

    const groupBy = (sigFn) => {
      const m = new Map();
      for (const c of all) {
        const sig = sigFn(c);
        if (!sig) continue;
        if (!m.has(sig)) m.set(sig, []);
        m.get(sig).push(c);
      }
      return [...m.entries()].filter(([, arr]) => arr.length > 1);
    };

    const groups = [];
    if (type === 'all' || type === 'email') {
      for (const [sig, arr] of groupBy(c => (c.email || '').trim().toLowerCase())) {
        groups.push({ signature: sig, type: 'email', contacts: arr.map(enrich), count: arr.length });
      }
    }
    if (type === 'all' || type === 'phone') {
      for (const [sig, arr] of groupBy(c => {
        const cleaned = (c.phone || c.mobile || '').replace(/[^\d]/g, '').slice(-9);
        return cleaned.length >= 6 ? cleaned : '';
      })) groups.push({ signature: sig, type: 'phone', contacts: arr.map(enrich), count: arr.length });
    }
    if (type === 'all' || type === 'name') {
      for (const [sig, arr] of groupBy(c => {
        const fn = (c.firstname || '').trim().toLowerCase();
        const ln = (c.lastname || '').trim().toLowerCase();
        return fn && ln ? fn + '|' + ln : '';
      })) groups.push({ signature: sig, type: 'name', contacts: arr.map(enrich), count: arr.length });
    }
    if (type === 'all' || type === 'company') {
      for (const [sig, arr] of groupBy(c => (c.company || '').trim().toLowerCase())) {
        groups.push({ signature: sig, type: 'company', contacts: arr.map(enrich), count: arr.length });
      }
    }

    // Sort: count desc, then signature
    groups.sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));
    const total = groups.length;
    const paged = groups.slice(page * pageSize, (page + 1) * pageSize);

    res.json({ groups: paged, total, page, pageSize });
  } catch (err) {
    console.error('[DUPLICATES-SCAN ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

**Δ** : +75 lignes ajoutées avant ligne 156.

### 3.4 V2.2.c — `MergeContactsModal.jsx` fallback context

Pattern identique V2.1.b :
```js
// Avant
import { useCollabContext } from "../context/CollabContext";
const MergeContactsModal = ({ primary, onClose, onSuccess }) => {
  const { contacts, collab, showNotif } = useCollabContext();

// Après
import { useContext } from "react";
import { CollabContext } from "../context/CollabContext";
const MergeContactsModal = ({ primary, onClose, onSuccess, collab: collabProp, contacts: contactsProp, showNotif: showNotifProp }) => {
  const ctx = useContext(CollabContext) || {};
  const collab = collabProp || ctx.collab;
  const contacts = contactsProp || ctx.contacts || [];
  const showNotif = showNotifProp || ctx.showNotif || (() => {});
```

**Δ** : +6 / -2 lignes.

### 3.5 V2.2.c — `AdminDash.jsx` UI

Ajouts :
1. State : `duplicateGroups`, `duplicatesLoading`, `duplicatesIgnored` (Set), `mergeTargetAdmin`
2. View toggle : ajouter `{id:"duplicates", icon:"git-merge", label:"Doublons"}`
3. Section conditionnelle si `crmView === 'duplicates'` → render `<DuplicatesPanel>` (NEW composant) OU inline accordion
4. Render `<MergeContactsModal>` top-level avec props `collab={{role:'admin', id:<adminId>}}` + `contacts={contacts}` + `showNotif={notif}`
5. Listener `crmContactMerged` (event window) → refetch `/duplicates-scan` pour resync

**Reco** : extraire `DuplicatesPanel.jsx` dans `app/src/features/admin/components/` (~150 lignes) pour pas alourdir AdminDash. Cohérent règle "code dans features/admin/components/".

**Δ AdminDash.jsx** : +60 lignes (imports + state + view toggle + render section + render modale)
**NEW `DuplicatesPanel.jsx`** : ~150 lignes

### 3.6 V2.2 récap volumétrie

| Phase | Fichier | Δ |
|---|---|---|
| **a** | `data.js` (check-duplicate-single) | +25/-5 |
| **a** | `ScheduleRdvModal.jsx` | +3/-1 |
| **b** | `data.js` (NEW /duplicates-scan) | +75 |
| **c** | `MergeContactsModal.jsx` | +6/-2 |
| **c** | `AdminDash.jsx` | +60 |
| **c** | `components/DuplicatesPanel.jsx` (NEW) | +150 |
| **Total** | **2 backend + 4 frontend** | **+319/-8** (+1 NEW) |

V2.2.a seul : +28/-6 lignes (~3h cycle complet workflow).

---

## 4. RISQUES + PERF

| # | Risque | Sévérité | Mitigation |
|---|---|:---:|---|
| **R1** | `check-duplicate-single` enrichi ralentit flow création (3 SELECT au lieu de 2) | 🟢 | 185 contacts max, 3 SELECT indexés → <5ms total |
| **R2** | `/duplicates-scan` charge tous les contacts en mémoire | 🟢 | 185 max → ~50KB RAM, négligeable |
| **R3** | Fuzzy V2.2.d : faux positifs (Jean ≠ Jeanne) | 🟡 | Skip V2.2.d initial, calibrer plus tard |
| **R4** | UI scan refresh fréquent | 🟢 | Bouton refresh manuel, pas d'auto-poll |
| **R5** | `MergeContactsModal` fallback context régression CollabPortal | 🟢 | Pattern identique V2.1.b validé (T6-T8 OK) |
| **R6** | Fix ScheduleRdvModal change comportement contact silent merge | 🟡 | Test critique : créer contact dans ScheduleRdvModal avec email DÉJÀ chez self → vérifier booking attaché au bon contact (pas de duplicate ni d'orphelin) |
| **R7** | `duplicates-scan` route ordering Express : `/contacts/:id` matchera `:id='duplicates-scan'` si pas en avant | 🔴→🟢 | Insérer AVANT ligne 156 — exigence stricte (ALERTE déjà connue V1.12.4 pour `/archived`) |
| **R8** | UI `Doublons` : si admin ignore un groupe → state local localStorage perdu si change device | 🟡 | OK pour V2.2 (pas critique). V2.3 pourrait persister DB. |
| **R9** | Match name SQL : `LOWER(TRIM(firstname))=?` ne profite pas d'index → full scan | 🟢 | 185 contacts, full scan = trivial. Si futur >10k, ajouter index `idx_contacts_name_lower` (functional index SQLite 3.9+) |
| **R10** | Backend retourne archivés → DuplicateOnCreateModal MatchCard doit afficher badge isArchived | 🟡 | `DuplicateMatchCard` (V1.13.1.b) accepte déjà `pipelineStage` mais pas `isArchived`. Patch léger MatchCard +5 lignes. |

---

## 5. TESTS

### Tests V2.2.a (~6)

| # | Scénario | Attendu |
|---|---|---|
| **T1** | POST `check-duplicate-single` avec `firstname:'Jean', lastname:'Dupont'` exact → match existant | matches[0].matchedBy='name' |
| **T2** | POST avec `company:'CapFinances SARL'` exact → match | matches[0].matchedBy='company' |
| **T3** | POST avec `email + firstname+lastname` mixed → 2 matches dédupliqués (1 contact) | matches.length=1 |
| **T4** | POST avec `includeArchived:true` → retourne aussi archivés avec flag isArchived:true | OK |
| **T5** | ScheduleRdvModal : créer contact dans modal RDV avec email déjà chez self → backend silent merge → booking créé avec ID backend | booking.contactId = ID backend (pas temp) |
| **T6** | Régression V1.13.0/V1.13.1.e : POST sans firstname/lastname → comportement V2.1.b inchangé | OK |

### Tests V2.2.b (~5)

| # | Scénario | Attendu |
|---|---|---|
| **T7** | GET `/duplicates-scan?type=email` → groupes email uniquement | Retour OK |
| **T8** | GET `/duplicates-scan?type=all` → groupes email+phone+name+company | OK |
| **T9** | Pagination `?page=0&pageSize=10` → 10 groupes max + total | OK |
| **T10** | Permissions : collab non-admin avec `contacts.view` | 200 OK |
| **T11** | Sécurité : autre company ne leak pas | 0 leak (companyId strict) |

### Tests V2.2.c (~5)

| # | Scénario | Attendu |
|---|---|---|
| **T12** | AdminDash → onglet Contacts → vue Doublons → liste affichée | OK |
| **T13** | Cliquer Fusionner sur groupe email → MergeContactsModal s'ouvre | OK (avec props) |
| **T14** | Fusion exécutée → MergeContactsModal close + refresh /duplicates-scan | OK |
| **T15** | Régression V1.13.2.b CrmTab MergeContactsModal (fallback context) | OK |
| **T16** | Bouton "Ignorer ce groupe" → groupe disparaît + persist localStorage | OK |

---

## 6. CONFORMITÉ CONTRAINTES MH

| Contrainte | Respect |
|---|---|
| IDENTITÉ = ID CONTACT (ne jamais bloquer création) | ✅ V2.2 enrichit suggestions, ne bloque jamais |
| Suggérer uniquement | ✅ MatchCard reste en mode suggestion, force-create admin disponible |
| Aucun refactor massif | ✅ V2.2.a = 30 lignes, V2.2.b = 80, V2.2.c = 220 |
| Réutiliser maximum existant | ✅ MergeContactsModal V1.13.2.b + DuplicateOnCreateModal V1.13.1.x + helper precheckCreate V2.1 |
| Audit complet avant code | ✅ ce doc |
| Diff preview minimal | ✅ §3 |
| Risques | ✅ §4 |
| Estimation | ✅ §2 sous-phases |
| Plan V2.2.a/V2.2.b | ✅ §2.1-2.4 |
| STOP avant code | ✅ aucune ligne écrite |

---

## 7. ESTIMATION FINALE V2.2

| Sous-phase | Effort dev | Workflow strict | Total |
|---|:---:|:---:|:---:|
| **V2.2.a** (backend enrichi + fix ScheduleRdvModal) | 1h | 1h30 | **2h30** |
| **V2.2.b** (NEW endpoint /duplicates-scan) | 1h | 1h | **2h** |
| **V2.2.c** (UI AdminDash + DuplicatesPanel) | 2h30 | 1h30 | **4h** |
| **V2.2.d** (fuzzy Levenshtein, optionnel) | 1h | 30min | **1h30** |
| **Total V2.2 a+b+c** | **4h30** | **4h** | **~8h30** |
| **Total V2.2 a+b+c+d** | **5h30** | **4h30** | **~10h** |

**Reco MH** : livrer en **3 cycles séparés** (a, b, c) pour valider à chaque étape. Bug ScheduleRdvModal seul (V2.2.a) débloque déjà un point critique en ~2h30.

---

## 8. DÉCISIONS OUVERTES — Q1-Q5

### Q1 — Périmètre matchers V2.2.a

| Option | |
|---|---|
| **A** name (firstname+lastname) + company + flag includeArchived | reco Claude — minimal utile |
| **B** A + alias mobile (déjà fait dans phone match actuel) | déjà OK, pas besoin |
| **C** A + match address normalisée | trop bruité (variantes orthographe) |

**Reco** : **A**.

### Q2 — Fuzzy V2.2.d

| Option | |
|---|---|
| **A** Skip V2.2 initial, garder backlog | reco Claude — éviter faux positifs |
| **B** Inclure dans V2.2 avec seuil 0.85 | risque calibration |

**Reco** : **A**.

### Q3 — UI résolution AdminDash

| Option | |
|---|---|
| **A** 4e vue toggle `Doublons` à côté Table/Pipeline/Funnel | reco Claude — cohérent UX existant |
| **B** Bouton dédié "Scan doublons" qui ouvre modale plein écran | + de friction |
| **C** Section accordion dans Stats Bar | encombre vue |

**Reco** : **A**.

### Q4 — Composant `DuplicatesPanel.jsx` séparé

| Option | |
|---|---|
| **A** NEW fichier `app/src/features/admin/components/DuplicatesPanel.jsx` (~150 lignes) | reco Claude — règle "pas d'empilage" |
| **B** Inline dans AdminDash.jsx | AdminDash déjà 11.8K lignes |

**Reco** : **A**.

### Q5 — Découpage livraison

| Option | |
|---|---|
| **A** 3 cycles : V2.2.a → V2.2.b → V2.2.c | reco Claude — validation incrémentale |
| **B** 1 cycle global V2.2 a+b+c | risque rollback gros si KO |
| **C** V2.2.a seul, V2.2.b+c reportés post observation | minimaliste |

**Reco** : **A** ou **C** selon urgence MH.

---

## 9. ✅ STOP — Aucune ligne de code écrite

Audit READ-ONLY V2.2 terminé. Aucune modification effectuée.

**Prochaine étape attendue** :
1. MH valide les 5 décisions Q1-Q5
2. MH choisit découpage (A 3 cycles ou C V2.2.a seul d'abord)
3. GO MH explicite par cycle
4. Workflow strict 17 étapes par cycle

**Aucune action sans GO MH explicite.**

---

**Sources** :
- Repo local : HEAD `0f21a554`
- Code lu :
  - [`server/routes/data.js:389-498`](server/routes/data.js#L389-L498) (check-duplicates batch + check-duplicate-single)
  - [`server/routes/data.js:297-410`](server/routes/data.js#L297-L410) (POST /contacts + silent merge V1.13.1.e)
  - [`server/routes/data.js:1142-1330`](server/routes/data.js#L1142-L1330) (POST /:primaryId/merge V1.13.2.b)
  - [`ScheduleRdvModal.jsx:236-251`](app/src/features/collab/modals/ScheduleRdvModal.jsx#L236-L251) (bug latent)
  - [`MergeContactsModal.jsx:23-68`](app/src/features/collab/modals/MergeContactsModal.jsx#L23-L68) (useCollabContext blocker)
  - [`useMergeContacts.js`](app/src/features/collab/hooks/useMergeContacts.js) (hook pure, réutilisable)
  - [`AdminDash.jsx:9993-10046`](app/src/features/admin/AdminDash.jsx#L9993-L10046) (CRM tab structure)
- Mesures DB prod (SSH 2026-05-03) :
  - 5 companies actives, max 185 contacts/company
  - 21 indexes sur table `contacts` dont `idx_contacts_company_email`, `idx_contacts_company_phone`, `idx_contacts_active`
- Audits antérieurs :
  - [AUDIT-V2.1.b-…](docs/audits/2026-05/AUDIT-V2.1.b-ADMINDASH-CREATION-CONTACTS-2026-05-03.md) (pattern fallback context)
  - [AUDIT-V2.1-HARMONISATION-6-CHEMINS](docs/audits/2026-05/AUDIT-V2.1-HARMONISATION-6-CHEMINS-2026-05-03.md) §4.3 (bug ScheduleRdvModal documenté)
  - [AUDIT-V2-DOUBLONS-INTELLIGENTS](docs/audits/2026-05/AUDIT-V2-DOUBLONS-INTELLIGENTS-2026-05-03.md) (master)
- Memory : `feedback_phase_workflow_17_steps.md`, `feedback_code_no_root_file_piling.md`
