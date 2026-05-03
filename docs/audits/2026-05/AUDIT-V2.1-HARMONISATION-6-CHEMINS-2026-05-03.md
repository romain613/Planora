# AUDIT V2.1 — Harmonisation 6 chemins de création contact (READ-ONLY fin)

> **Date** : 2026-05-03
> **Demandeur** : MH
> **Type** : audit READ-ONLY fin pré-implémentation
> **Statut** : ✅ STOP avant code
> **Source** : `clean-main` HEAD `80db6f80`, post-V1.14.1.z
> **Pré-requis** : audit master V2 livré (`AUDIT-V2-DOUBLONS-INTELLIGENTS-2026-05-03.md`)

---

## 0. RÉSUMÉ EXÉCUTIF

V2.1 = **brancher DuplicateOnCreateModal sur tous les chemins de création**, en réutilisant strictement le pattern existant de `handleCollabCreateContact` (ligne 3566-3594).

**Périmètre réel V2.1 (après affinage)** :
- ✅ **3 patches obligatoires** : `handleQuickAddContact`, `linkVisitorToContacts`, AdminDash `_addContact`
- ⚠ **1 patch optionnel** : PhoneTab IA recommendation (faible volume, prompt() inline)
- ❌ **5 sites EXCLUS** : Import CSV (V2.2/V2.3), AdminDash auto-booking (cron-like), AdminDash undo restore (re-INSERT, pas création), ScheduleRdvModal (R1 critique), AdminDash CSV inline legacy (V2.2)

**Stratégie minimale** : extraire un helper `_precheckCreateAndOpenDup(nc)` exposé via `CollabContext` → réutilisable par les 3-4 sites sans duplication code.

**Effort** : ~1.5j dev + tests régression.

**Risque R1 ScheduleRdvModal** : analysé en détail §4 — **non impacté par V2.1** (utilise endpoint silent merge backend `_duplicate:true`, distinct du flow `check-duplicate-single`).

---

## 1. INVENTAIRE EXACT — sites de création (frontend)

### 1.1 Sites IN-SCOPE V2.1 (3 obligatoires + 1 optionnel)

| # | Site | Fichier:ligne | Volume | Action V2.1 |
|---|---|---|---|---|
| **A** | `handleQuickAddContact` (Hub SMS Quick Add téléphone) | `CollabPortal.jsx:3596-3672` | Élevé | **Pré-check obligatoire** |
| **B** | `linkVisitorToContacts` (visiteur web → CRM) | `CollabPortal.jsx:3114-3119` | Faible | **Pré-check obligatoire** |
| **C** | AdminDash `_addContact` (modale admin) | `AdminDash.jsx:1268-1274` | Moyen | **Pré-check obligatoire** |
| **D** | PhoneTab IA recommendation | `PhoneTab.jsx:2594` | Très faible (prompt inline) | **Optionnel** — peut être skip pour V2.1 |

### 1.2 Sites EXCLUS V2.1 (5)

| Site | Fichier:ligne | Raison exclusion |
|---|---|---|
| `submitNewContact` (référence — déjà OK) | `CollabPortal.jsx:3401` | ✅ Déjà branché V1.13.0 — ne pas toucher |
| AdminDash undo restore (delete + restore) | `AdminDash.jsx:1291` | ❌ PAS création réelle (re-INSERT du contact supprimé). Pré-check inutile. |
| AdminDash auto-booking (cron-like) | `AdminDash.jsx:1343` | ❌ Auto-création back-fill depuis booking. Aucun UX user. Cron-like. |
| AdminDash CSV inline legacy | `AdminDash.jsx:10218` | ❌ Import CSV legacy. Hors scope V2.1 (V2.2 import résolution interactive). |
| Import CSV unifié `CsvImportModal` | (modale séparée) | ❌ Hors scope V2.1. Déjà partiel (skip/merge/replace). V2.2 résolution. |
| **`ScheduleRdvModal` (V1.8.22)** | `modals/ScheduleRdvModal.jsx:240` | 🔴 R1 critique — utilise endpoint `POST /contacts` qui retourne `_duplicate:true` silent merge (V1.13.1.e). Casser ce flow = régression RDV. **À NE PAS TOUCHER**. |

---

## 2. PATTERN UNIQUE RECOMMANDÉ

### 2.1 Référence canonique : `handleCollabCreateContact` (CollabPortal:3566-3594)

```js
const handleCollabCreateContact = () => {
  const nc = { id, companyId, name, email, phone, ..., source:'manual', createdAt };
  if (nc.email || nc.phone) {
    api('/api/data/contacts/check-duplicate-single', {
      method:'POST',
      body:{ email: nc.email||'', phone: nc.phone||'' }
    }).then(checkRes => {
      if (checkRes && checkRes.exists) {
        setShowNewContact(false);  // ferme modale source si applicable
        setDuplicateOnCreateData({
          matches: checkRes.matches || [],
          conflict: !!checkRes.conflict,
          pendingNewContact: { name: nc.name, email: nc.email, phone: nc.phone, _formSnapshot: nc },
        });
        return;
      }
      submitNewContact(nc, { forceCreate: false });
    }).catch(() => submitNewContact(nc, { forceCreate: false }));
    return;
  }
  submitNewContact(nc, { forceCreate: false });
};
```

### 2.2 Helper proposé `_precheckCreateAndOpenDup(nc, opts)` — exposé via CollabContext

```js
// CollabPortal — top-level scope
// Helper unifié pour pré-check anti-doublon V2.1.
// Si match → ouvre DuplicateOnCreateModal et retourne true (caller stop)
// Sinon → caller continue avec son submit normal
const _precheckCreateAndOpenDup = (nc, { onClose = null } = {}) => {
  if (!nc.email && !nc.phone) return Promise.resolve(false);
  return api('/api/data/contacts/check-duplicate-single', {
    method: 'POST',
    body: { email: nc.email || '', phone: nc.phone || '' }
  }).then(checkRes => {
    if (checkRes && checkRes.exists) {
      if (typeof onClose === 'function') onClose();  // ferme modale source (NewContact, QuickAdd, etc.)
      setDuplicateOnCreateData({
        matches: checkRes.matches || [],
        conflict: !!checkRes.conflict,
        pendingNewContact: { name: nc.name, email: nc.email, phone: nc.phone, _formSnapshot: nc },
      });
      return true;  // duplicate detected, modal opened
    }
    return false;  // no duplicate, caller proceeds
  }).catch(() => false);  // backend error → fail-open (caller proceeds)
};
```

**Exposition dans CollabContext** (1 ligne dans le `<CollabProvider value={{...}}>`).

### 2.3 Usage dans chaque site (pattern d'appel)

```js
// Site A — handleQuickAddContact
const handleQuickAddContact = async () => {
  const nc = { ... };  // payload existant
  const isDup = await _precheckCreateAndOpenDup(nc, {
    onClose: () => setPhoneQuickAddPhone(null)  // ferme la modale Quick Add
  });
  if (isDup) return;  // modal ouverte, caller stop
  // ... code existant : setContacts + api POST + auto-relink conv etc.
};
```

**Avantages pattern** :
- ✅ Réutilise `_formSnapshot: nc` → DuplicateOnCreateModal `onForceCreate` passera correctement à `submitNewContact(snapshot, { forceCreate: true, reason, justification })`
- ✅ `onCreateMyOwn` (V1.13.1.e scope-collab) déjà branché via `handleDuplicateCreateMyOwn` — fonctionne aussi avec QuickAdd/visitor/admin
- ✅ Backend POST `/contacts` continue de scope-collab dedup automatiquement (V1.13.1.e) → safety net si frontend skip pré-check

---

## 3. POINTS D'INJECTION CONCRETS — DIFF PREVIEW

### 3.1 NEW helper dans CollabPortal (top-level scope)

Insérer après `handleCollabCreateContact` (~ligne 3595) :

```js
// V2.1 — Helper pré-check anti-doublon réutilisable par tous les chemins de création.
// Pattern identique a handleCollabCreateContact (V1.13.0 reference).
// Returns Promise<boolean> : true si duplicate detected (modal opened, caller stop),
// false sinon (caller proceeds avec son submit normal).
const _precheckCreateAndOpenDup = (nc, { onClose = null } = {}) => {
  if (!nc?.email && !nc?.phone) return Promise.resolve(false);
  return api('/api/data/contacts/check-duplicate-single', {
    method: 'POST',
    body: { email: nc.email || '', phone: nc.phone || '' }
  }).then(checkRes => {
    if (checkRes && checkRes.exists) {
      if (typeof onClose === 'function') { try { onClose(); } catch {} }
      setDuplicateOnCreateData({
        matches: checkRes.matches || [],
        conflict: !!checkRes.conflict,
        pendingNewContact: { name: nc.name, email: nc.email, phone: nc.phone, _formSnapshot: nc },
      });
      return true;
    }
    return false;
  }).catch(() => false);
};
```

**Lignes ajoutées** : ~22 lignes (dont 4 commentaire). Conforme règle "pas d'empilage" (helper logique pure, expose via context).

### 3.2 Patch A — `handleQuickAddContact` (CollabPortal:3596)

**Avant** (ligne 3617) :
```js
setContacts(p => [...p, nc]);
api('/api/data/contacts', { method:'POST', body: nc }).then(r => { ... });
```

**Après** :
```js
// V2.1 — Pré-check anti-doublon avant création
const isDup = await _precheckCreateAndOpenDup(nc, {
  onClose: () => { setPhoneQuickAddPhone(null); /* ferme modale Quick Add */ }
});
if (isDup) return;  // modal ouverte, _formSnapshot conserve nc pour force-create si admin
setContacts(p => [...p, nc]);
api('/api/data/contacts', { method:'POST', body: nc }).then(r => { ... });
```

⚠ **Implications** :
- Convertir `handleQuickAddContact = ()=>{...}` en `async () => {...}` pour `await`
- Ou utiliser `.then()` chain (préserve syntax)

**Lignes ajoutées** : ~4 lignes.

### 3.3 Patch B — `linkVisitorToContacts` (CollabPortal:3114)

**Avant** :
```js
const linkVisitorToContacts = (visitor) => {
  const nc = { id, companyId, name:visitor.name, email:visitor.email, phone:visitor.phone||"", ... };
  setContacts(p => [...p, nc]);
  api("/api/data/contacts", { method:"POST", body:nc });
  return nc;
};
```

**Après** :
```js
const linkVisitorToContacts = (visitor) => {
  const nc = { id, companyId, name:visitor.name, email:visitor.email, phone:visitor.phone||"", ... };
  // V2.1 — Pré-check anti-doublon. Si dup → modal ouverte, on retourne null pour signaler caller.
  // Caller doit gérer le cas null (ne pas linker, attendre choix user dans modal).
  _precheckCreateAndOpenDup(nc).then(isDup => {
    if (isDup) return;  // modal s'occupe du flow
    setContacts(p => [...p, nc]);
    api("/api/data/contacts", { method:"POST", body:nc });
  });
  return nc;  // legacy return pour compat callers (CrmTab.jsx:967, CrmKanbanView etc.)
};
```

⚠ **Sémantique change** : avant, `linkVisitorToContacts` retournait `nc` immédiatement (synchrone). Après, le call backend se fait dans le `.then()`, mais `nc` est retourné synchrone (legacy compat).

**Risque** : 4 callers existent (CrmTab:965, CrmKanbanView:244, etc.) qui attendent le retour `nc` immédiat pour mettre à jour leur state local. Vérifier qu'aucun ne dépend de `setContacts` synchrone.

**Lignes ajoutées** : ~6 lignes.

### 3.4 Patch C — AdminDash `_addContact` (AdminDash.jsx:1268-1274)

**Avant** :
```js
const _addContact = (c) => {
  // (validation déjà faite ligne 1265 : email collab check)
  const nc = { ...c, id:"ct"+Date.now(), companyId:company.id, totalBookings:0, ..., createdAt:new Date().toISOString() };
  setContacts(p => [...p, nc]);
  setShowNewContact(false);
  notif("Contact créé");
  api("/api/data/contacts", { method:"POST", body:nc });
};
```

**Après** :
```js
const _addContact = async (c) => {
  const nc = { ...c, id:"ct"+Date.now(), companyId:company.id, totalBookings:0, ..., createdAt:new Date().toISOString() };
  // V2.1 — Pré-check anti-doublon (admin peut quand même force-create via modale)
  const isDup = await _precheckCreateAndOpenDup(nc, {
    onClose: () => setShowNewContact(false)
  });
  if (isDup) return;
  setContacts(p => [...p, nc]);
  setShowNewContact(false);
  notif("Contact créé");
  api("/api/data/contacts", { method:"POST", body:nc });
};
```

⚠ **AdminDash n'a pas accès au CollabContext** (composant supra). Solution :
- **Option 1** : dupliquer le helper inline dans AdminDash (DRY violation mais simple)
- **Option 2** : extraire le helper dans `app/src/shared/utils/duplicateCheck.js` (NEW fichier — cohérent règle code mais 1 NEW)
- **Option 3** : utiliser directement `api('check-duplicate-single')` inline + `setDuplicateOnCreateData` props (mais AdminDash n'a pas DuplicateOnCreateModal rendu... à vérifier)

**Reco Claude** : **Option 2** pour cohérence — NEW `app/src/shared/utils/duplicateCheck.js` avec fonction `precheckCreate(nc, { api, onMatch, onClose }) → Promise<bool>`, puis CollabPortal et AdminDash l'importent.

**Lignes ajoutées AdminDash** : ~5 lignes.

### 3.5 Patch D (optionnel) — PhoneTab IA recommendation (PhoneTab:2594)

**Code actuel** (inline dans onClick) :
```js
const newId='ct'+Date.now();
const nc={id:newId, companyId, name:name.trim(), firstname, lastname, pipeline_stage:'nouveau', source:'referral', notes:'Recommandé par '+(e.contactName||'un contact'), assignedTo, createdAt};
api('/api/data/contacts',{method:'POST',body:nc}).then(r=>{...});
```

**Particularité** : recommandation IA n'a **ni email ni phone** dans la plupart des cas (juste un nom). Pré-check email/phone serait inopérant.

**Reco Claude** : **SKIP V2.1** pour ce site. Si nom matching V2.2 livré, alors brancher pré-check avec nom seul.

---

## 4. ANALYSE PRÉCISE RISQUE R1 — ScheduleRdvModal (V1.8.22)

> **🔴 CORRECTION 2026-05-03 (post V2.2.a)** : §4.3 contient un **faux positif** découvert pendant l'implémentation V2.2.a.
> - Le fichier `app/src/features/collab/modals/ScheduleRdvModal.jsx` est **du code mort**, jamais importé (extraction S2.11 jamais branchée). Vite ne le bundle pas (vérifié : grep `import.*ScheduleRdvModal` = 0 caller, bundle md5 inchangé après edit).
> - Le **flow scheduling actif** vit dans **`CollabPortal.jsx:6505-6577`** où il a déjà été corrigé en **V1.8.22.1/V1.8.22.2** :
>   - L6556 : `const createRes = await api(...)`
>   - L6562-6563 : `// _duplicate:true géré silencieusement — l'id retourné est l'existant` + `const realContactId = createRes.id`
>   - L6567+ : `realContactId` propagé dans `setContacts` / `setPhoneScheduleForm` / `setTimeout`
> - **Conclusion** : R1 reste NON-RISQUE pour V2.1 (correct), MAIS le "bug latent §4.3" n'existe pas en runtime — déjà fixé.
> - `ScheduleRdvModal.jsx` reste à supprimer en cleanup séparé (hors scope V2.x).

### 4.1 Flow actuel

**Fichier** : [`modals/ScheduleRdvModal.jsx:231-240`](app/src/features/collab/modals/ScheduleRdvModal.jsx#L231-L240)

```js
if (f._bookingMode && !hasPrefilledContact && schedContactMode === 'new') {
  const newContact = { id, companyId, name, email, phone, source:'rdv', ... };
  await api('/api/data/contacts', { method: 'POST', body: newContact });
  // ... continue avec création booking
}
```

### 4.2 Comportement backend reçu

Backend `POST /contacts` (V1.13.1.e ligne 339-341) :
```js
if (!c._forceCreate && c.email) {
  const dupEmail = db.prepare(...AND assignedTo = ?...).get(...);
  if (dupEmail) return res.json({ success: true, id: dupEmail.id, _duplicate: true });
}
```

→ Si email/phone match dans le scope du collab : retourne `id` existant + `_duplicate:true` (silent merge).

### 4.3 ScheduleRdvModal lit-il `_duplicate` ?

À vérifier dans le code ScheduleRdvModal :

```js
await api('/api/data/contacts', {method:'POST', body:newContact});
// Que fait-il du retour ?
```

Le code utilise `await api(...)` mais ne stocke pas le retour. **Le contact est créé dans le state via `setContacts(p => [...p, newContact])` AVEC L'ID GÉNÉRÉ FRONTEND (`id: 'ct'+Date.now()+..`)**, pas l'ID backend.

→ **Si backend retourne `_duplicate:true` avec un autre ID** (existant), le frontend continue avec son ID local. Le booking est créé avec `contactId = ct_temp_local`, qui n'existe pas en DB. **C'est un BUG LATENT pré-existant V1.13.1.e**, pas dû à V2.1.

### 4.4 Impact V2.1 sur ScheduleRdvModal

**ScheduleRdvModal n'est PAS modifié par V2.1**. Donc :
- ✅ Le flow continue d'utiliser silent merge backend `_duplicate:true`
- ✅ Aucune nouvelle régression introduite par V2.1
- 🟡 Le bug latent décrit §4.3 reste (à traiter séparément hors V2.1, peut-être V2.2 qui retraite l'import et l'enrichissement)

### 4.5 Verdict R1

→ **R1 est NON-RISQUE pour V2.1**. Le flow ScheduleRdvModal n'est pas dans le périmètre. Le silent merge backend reste actif. Bug latent §4.3 documenté pour traitement futur (V2.2 ou plus tard).

---

## 5. ARCHITECTURE PROPOSÉE V2.1 — FICHIERS

### 5.1 NEW fichier (1)

| Fichier | Lignes | Rôle |
|---|---|---|
| `app/src/shared/utils/duplicateCheck.js` | ~25 | Helper pur `precheckCreate(nc, { api, onMatch })` réutilisable CollabPortal + AdminDash |

### 5.2 PATCHES fichiers existants

| Fichier | Δ | Détail |
|---|---|---|
| `app/src/features/collab/CollabPortal.jsx` | +12 / -2 | Import helper + wrapper `_precheckCreateAndOpenDup` (qui appelle helper avec setDuplicateOnCreateData) + 2 patches `handleQuickAddContact` + `linkVisitorToContacts` |
| `app/src/features/admin/AdminDash.jsx` | +6 / -1 | Import helper + patch `_addContact` |

**Total V2.1 : ~43 lignes** (1 NEW + 2 PATCH). **Strictement minimal.**

---

## 6. CONFORMITÉ CONTRAINTES MH

| Contrainte | Respect |
|---|---|
| Pas de DB | ✅ |
| Pas de backend si possible | ✅ aucun changement backend |
| Pas de refactor massif | ✅ 1 NEW utils + 2 patches inline |
| Réutiliser DuplicateOnCreateModal | ✅ pas de NEW modale |
| Ne jamais bloquer la création | ✅ caller continue si pas de match (fail-open sur erreur réseau aussi) |
| Préserver `_forceCreate` | ✅ DuplicateOnCreateModal flow intact |
| Préserver ScheduleRdvModal silent merge | ✅ flow non modifié (R1 §4) |
| Diff preview obligatoire | ✅ §3 |
| STOP avant code | ✅ |

---

## 7. RISQUES SPÉCIFIQUES V2.1

| # | Risque | Sévérité | Mitigation |
|---|---|:---:|---|
| **R1.1** | Régression `linkVisitorToContacts` callers attendent retour synchrone | 🟡 | Conserver `return nc` synchrone, déléguer le check dans `.then()`. Tester CrmTab:967 + CrmKanbanView:244 |
| **R1.2** | Async/await dans `handleQuickAddContact` (impact existing code) | 🟢 | Convertir signature `async` ou utiliser `.then()` chain |
| **R1.3** | AdminDash `_addContact` accès DuplicateOnCreateModal | 🟡 | AdminDash doit aussi RENDER DuplicateOnCreateModal en cas de dup. Vérifier si déjà rendu (probablement non). Si non : NEW state + render top-level admin. ~10 lignes extra. |
| **R1.4** | Backend lent → user voit délai 200-500ms avant modale | 🟢 | Acceptable. Pattern `handleCollabCreateContact` a déjà ce comportement V1.13.0 |
| **R1.5** | Erreur réseau check-duplicate-single | 🟢 | Fail-open : caller continue (création directe) — comportement actuel V1.13.0 |
| **R1.6** | Visiteur web (B) sans email/phone | 🟢 | Helper return false immédiat → caller continue (comportement avant V2.1) |
| **R1.7** | DuplicateOnCreateModal `onCreateMyOwn` re-déclenche `submitNewContact` qui n'existe pas dans AdminDash | 🔴 | AdminDash devra avoir son propre `submitNewContactAdmin` callback. Sinon crash |

### Mitigation R1.3 + R1.7

AdminDash doit avoir :
1. State local `duplicateOnCreateDataAdmin`
2. Render `<DuplicateOnCreateModal>` top-level avec ses propres handlers (`onForceCreate`, `onEnrich`, etc.)
3. Handler `submitNewContactAdmin(nc, { forceCreate, reason, justification })` (~15 lignes)

→ **Sous-effort AdminDash** : ~+25 lignes au lieu de ~6. Peut justifier de **REPORTER patch C en V2.1.b** si MH veut V2.1 vraiment minimal.

**Reco Claude** : V2.1 livre A + B (CollabPortal patches), reporter C (AdminDash) en V2.1.b. Effort A+B ~0.75j seulement.

---

## 8. TESTS V2.1 À PRÉVOIR

### Tests fonctionnels (T1-T6)

| # | Scénario | Attendu |
|---|---|---|
| **T1** | NewContactModal CRM avec email existant | DuplicateOnCreateModal s'ouvre (régression V1.13.0 OK) |
| **T2** | Quick Add Hub SMS avec phone existant chez moi | DuplicateOnCreateModal s'ouvre (NEW V2.1) |
| **T3** | Quick Add Hub SMS avec nouveau phone | Création directe (pas de modal) |
| **T4** | linkVisitorToContacts (visiteur web) avec email existant | DuplicateOnCreateModal s'ouvre (NEW V2.1) |
| **T5** | linkVisitorToContacts callers : cards Kanban affichent toujours visiteur après "+ Ajouter" cliqué (sync state local) | Sync préservé (legacy `return nc`) |
| **T6** | AdminDash `_addContact` avec email existant (V2.1.b si reporté) | DuplicateOnCreateModal s'ouvre |

### Tests régression (T7-T12)

| # | Scénario | Attendu |
|---|---|---|
| **T7** | ScheduleRdvModal "Nouveau contact" avec email existant chez moi | Silent merge V1.8.22 + V1.13.1.e (`_duplicate:true` retourné, contact lié au booking) |
| **T8** | NewContactModal admin force-create | Audit log enrichi V1.13.1.a OK |
| **T9** | DuplicateOnCreateModal "Compléter cette fiche" | Enrich V1.13.1.d OK |
| **T10** | DuplicateOnCreateModal "Créer ma fiche" (V1.13.1.e scope-collab) | Création parallèle OK |
| **T11** | Hub SMS V1.14.1.x (📦 archivé / inconnu / actif) | UI 3 états intacts |
| **T12** | CrmTab "Fusionner" V1.13.2.b | OK |

### Tests réseau (T13-T14)

| # | Scénario | Attendu |
|---|---|---|
| **T13** | check-duplicate-single timeout/erreur | Fail-open : création directe (caller continue) |
| **T14** | Backend retourne 401/403 | Modal ne s'ouvre pas, création continue (fail-open) |

---

## 9. ESTIMATION FINALE V2.1

### Périmètre A + B (recommandé pour V2.1 minimal)

| Tâche | Effort |
|---|:---:|
| NEW `shared/utils/duplicateCheck.js` (helper pur) | 30 min |
| Patch CollabPortal `_precheckCreateAndOpenDup` wrapper + handleQuickAddContact + linkVisitorToContacts | 45 min |
| Tests + build + diff preview | 30 min |
| Workflow strict 17 étapes | 1h |
| **Total V2.1 (A+B)** | **~2.5-3h** |

### Périmètre A + B + C (V2.1 complet, si MH GO)

| Tâche additionnelle | Effort |
|---|:---:|
| Patch AdminDash + render DuplicateOnCreateModal top-level + handler `submitNewContactAdmin` | 1.5h |
| Tests régression admin | 30 min |
| **Total V2.1 (A+B+C)** | **~5h** |

### Patch D (PhoneTab IA reco) — SKIP V2.1

Reporté V2.2 (matching nom car pas d'email/phone).

---

## 10. DÉCISIONS OUVERTES — Q1-Q3

### Q1 — Stratégie helper

| Option | |
|---|---|
| **A** — NEW `shared/utils/duplicateCheck.js` (helper pur, importable CollabPortal + AdminDash) | reco Claude |
| **B** — Wrapper inline CollabPortal exposé via context (mais AdminDash ne consomme pas CollabContext) | partiel |
| **C** — Duplication code inline dans chaque site | DRY violation |

**Reco** : **A**.

### Q2 — Périmètre V2.1

| Option | |
|---|---|
| **A+B** | Quick Add + linkVisitor (CollabPortal seul, ~3h) |
| **A+B+C** | + AdminDash `_addContact` (~5h, render extra modale top-level admin) |
| **A+B+C+D** | + PhoneTab IA reco (skip V2.1, V2.2 nom matching) |

**Reco** : **A+B en V2.1**, **C en V2.1.b** (sous-phase distincte). D reporté V2.2.

### Q3 — Validation R1 ScheduleRdvModal

→ R1 NON-RISQUE confirmé §4. Bug latent §4.3 documenté pour V2.2+.

**Reco** : Pas d'action V2.1 sur ScheduleRdvModal.

---

## 11. ✅ STOP — Aucune ligne de code écrite

Audit READ-ONLY fin V2.1. Aucune modification effectuée.

**Prochaine étape attendue** :
1. MH valide les 3 décisions Q1-Q3
2. MH choisit périmètre exact (A+B seul OU A+B+C ?)
3. Diff preview généré sur la base des décisions
4. GO MH explicite avant FIX
5. Workflow strict 17 étapes

**Aucune action sans validation MH explicite.**

---

**Sources** :
- Repo local : HEAD `80db6f80`
- Code lu :
  - `CollabPortal.jsx:3114-3119` (linkVisitorToContacts)
  - `CollabPortal.jsx:3401-3437` (submitNewContact reference)
  - `CollabPortal.jsx:3566-3594` (handleCollabCreateContact reference V1.13.0)
  - `CollabPortal.jsx:3596-3672` (handleQuickAddContact)
  - `AdminDash.jsx:1268-1274` (_addContact)
  - `AdminDash.jsx:1291` (undo restore — exclu)
  - `AdminDash.jsx:1343` (auto-booking — exclu)
  - `AdminDash.jsx:10218` (CSV legacy — exclu)
  - `PhoneTab.jsx:2594` (IA reco — optionnel)
  - `ScheduleRdvModal.jsx:231-240` (R1 analysé)
- Documentation antérieure :
  - `docs/audits/2026-05/AUDIT-V2-DOUBLONS-INTELLIGENTS-2026-05-03.md` (master)
  - `HANDOFF-V1.13.0-STABLE-PHASE1-CLOSURE.md`
  - `HANDOFF-V1.13.2.b-MERGE-CRM.md`
- Memory rules :
  - `feedback_phase_workflow_17_steps.md`
  - `feedback_code_no_root_file_piling.md`
