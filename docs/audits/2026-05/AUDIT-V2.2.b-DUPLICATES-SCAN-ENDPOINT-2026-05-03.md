# AUDIT V2.2.b — NEW endpoint `GET /contacts/duplicates-scan` (READ-ONLY)

> **Date** : 2026-05-03
> **Demandeur** : MH
> **Type** : audit READ-ONLY pré-implémentation
> **Statut** : ✅ STOP avant code
> **Source** : `clean-main` HEAD `11a52abb`, post-V2.2.a
> **Pré-requis** : V2.2.a livré (check-duplicate-single enrichi)

---

## 0. RÉSUMÉ EXÉCUTIF

V2.2.b livre un endpoint **read-only** pour scanner tous les groupes de doublons d'une company existants en DB. Aucune mutation, aucune UI, juste une vue agrégée pour préparer V2.2.c (UI résolution AdminDash).

**Périmètre minimal** :
- 1 NEW route : `GET /api/data/contacts/duplicates-scan`
- 3 types de groupes : `email`, `phone`, `name` (firstname+lastname normalisés)
- Pagination simple (`page` + `pageSize`)
- Scope `companyId` strict + filtre `'perdu'`
- Flag `includeArchived` (default false)
- Retour avec flag `isArchived` par contact

**Hors scope confirmé** :
- ❌ pas de match `company` (différé V2.2.c si MH le veut — pas demandé)
- ❌ pas de fuzzy
- ❌ pas d'UI
- ❌ pas de cleanup ScheduleRdvModal

**Volumétrie** : +85 lignes data.js, 0 NEW fichier, 0 frontend, 0 DB, 0 backward-incompat.

**Effort** : ~2h dev + workflow strict 17 étapes ~1h = **~3h total**.

---

## 1. DÉFINITION ROUTE EXACTE

### 1.1 Signature

```
GET /api/data/contacts/duplicates-scan
Auth        : requireAuth + enforceCompany + requirePermission('contacts.view')
Query params:
  - type         : 'email' | 'phone' | 'name' | 'all' (default: 'all')
  - includeArchived : 'true' | 'false' (default: 'false')
  - page         : int >= 0 (default: 0)
  - pageSize     : int 10..100 (default: 50, clamp)
```

### 1.2 Position critique dans data.js

**Insérer entre ligne 153 (fin `/contacts/archived`) et ligne 156 (début `/contacts/:id`)**.

Sinon Express matche `:id='duplicates-scan'` → 404 dans la route `/:id` ou pire response unexpected. Pattern déjà connu V1.12.4 pour `/contacts/archived`.

**Ordre final attendu** :
```
ligne 115 : GET /contacts                      (list)
ligne 135 : GET /contacts/archived             (archived list)
ligne XXX : GET /contacts/duplicates-scan      ← NEW V2.2.b (à insérer ici)
ligne 156 : GET /contacts/:id                  (single by id, wildcard)
```

### 1.3 Format JSON retourné

```json
{
  "groups": [
    {
      "signature": "jean.dupont@example.com",
      "type": "email",
      "count": 2,
      "contacts": [
        {
          "id": "ct_1776169517823_mng9ix",
          "name": "Jean Dupont",
          "firstname": "Jean",
          "lastname": "Dupont",
          "email": "jean.dupont@example.com",
          "phone": "+33612345678",
          "company": "Acme Corp",
          "assignedTo": "u-julie",
          "assignedName": "Julie Desportes",
          "pipelineStage": "qualifie",
          "createdAt": "2026-04-15T10:23:00.000Z",
          "isArchived": false
        },
        {
          "id": "ct_1776170016004_jfrbly",
          "name": "Jean DUPONT",
          ...
          "isArchived": true
        }
      ]
    },
    {
      "signature": "612345678",
      "type": "phone",
      "count": 3,
      "contacts": [...]
    },
    {
      "signature": "jean|dupont",
      "type": "name",
      "count": 2,
      "contacts": [...]
    }
  ],
  "total": 12,
  "page": 0,
  "pageSize": 50,
  "scannedContacts": 184
}
```

**Règles de signature** :
- `email` : `LOWER(TRIM(email))` exact (cohérent matcher V2.2.a)
- `phone` : last 9 digits (cohérent matcher V2.2.a) — minimum 6 chiffres requis
- `name` : `LOWER(TRIM(firstname)) + '|' + LOWER(TRIM(lastname))` (cohérent matcher V2.2.a)

**Règles d'inclusion contact** :
- companyId strict
- `pipeline_stage != 'perdu'` (cohérent V1.11.5 + V2.2.a)
- `archivedAt IS NULL OR archivedAt = ''` SAUF si `includeArchived=true`
- Champ `isArchived: true` si `archivedAt != ''` (visible si includeArchived=true)

**Tri groupes** : `count DESC, signature ASC`.

**Pagination** : appliquée APRÈS construction et tri des groupes (pas en SQL — 184 contacts max → trivial en mémoire).

---

## 2. STRATÉGIE D'IMPLÉMENTATION

### 2.1 Approche : 1 SELECT + 3 group-by JS (pas 3 SQL séparés)

**Pourquoi pas 3 SQL séparés (email/phone/name)** :
- Signature `name` nécessite normalisation firstname AND lastname (TRIM+LOWER) → SQLite peut le faire mais perd les contact details
- Phone normalisation (last 9 digits) → SQLite a `SUBSTR(REPLACE(...))` mais lourd à composer
- 3 round-trips DB pour 184 contacts max = waste

**Approche choisie** :
1. 1 SELECT all contacts company (max 184) avec tous les fields nécessaires
1bis. 1 SELECT collaborators company (1 query) → Map id→name pour `assignedName`
2. 3 group-by en JS pur (Map signature → contacts[])
3. Filter groups where `count > 1`
4. Sort + pagination en JS

**Coût mesuré** : 184 contacts × 3 group-by = ~600 ops Map → <5ms même en single-thread.

### 2.2 Pseudo-code helper inline

```js
// Inline dans la route — pas d'extraction utils (pour patch minimal V2.2.b)
const groupBy = (sigFn) => {
  const m = new Map();
  for (const c of all) {
    const sig = sigFn(c);
    if (!sig) continue;  // skip si signature vide (email/phone/name absent)
    if (!m.has(sig)) m.set(sig, []);
    m.get(sig).push(c);
  }
  // Garde uniquement groupes >1
  return [...m.entries()].filter(([, arr]) => arr.length > 1);
};

const sigEmail = (c) => (c.email || '').trim().toLowerCase();
const sigPhone = (c) => {
  const cleaned = (c.phone || c.mobile || '').replace(/[^\d]/g, '').slice(-9);
  return cleaned.length >= 6 ? cleaned : '';
};
const sigName = (c) => {
  const fn = (c.firstname || '').trim().toLowerCase();
  const ln = (c.lastname || '').trim().toLowerCase();
  return fn && ln ? fn + '|' + ln : '';
};
```

---

## 3. DIFF PREVIEW — code complet

### 3.1 Insertion ligne ~155 (entre `/archived` et `/:id`)

```js
// V2.2.b — Scan tous les groupes de doublons d'une company. Read-only, non destructif.
// Pagination simple (page + pageSize). 3 types : email, phone, name.
// Match identique au matcher V2.2.a (cohérence). Scope companyId strict.
// Ordre Express : DOIT être inséré AVANT GET /contacts/:id (sinon :id matche 'duplicates-scan').
router.get('/contacts/duplicates-scan', requireAuth, enforceCompany, requirePermission('contacts.view'), (req, res) => {
  try {
    const companyId = req.auth.companyId;
    const type = String(req.query.type || 'all');
    const includeArchived = String(req.query.includeArchived) === 'true';
    const page = Math.max(0, parseInt(req.query.page || '0', 10) || 0);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize || '50', 10) || 50));
    const archivedFilter = includeArchived ? '' : "AND (archivedAt IS NULL OR archivedAt = '')";

    // 1 SELECT all contacts company (184 max — full scan en mémoire ensuite)
    const all = db.prepare(
      `SELECT id, name, firstname, lastname, email, phone, mobile, company,
              assignedTo, pipeline_stage, archivedAt, createdAt
       FROM contacts
       WHERE companyId = ?
         AND COALESCE(pipeline_stage, '') != 'perdu'
         ${archivedFilter}`
    ).all(companyId);

    // 1 SELECT collaborators (Map id → name pour assignedName)
    const collabRows = db.prepare('SELECT id, name FROM collaborators WHERE companyId = ?').all(companyId);
    const collabMap = Object.fromEntries(collabRows.map(c => [c.id, c.name]));

    // Helper enrichissement contact (utilisé dans groupes)
    const enrich = (c) => ({
      id: c.id,
      name: c.name || '',
      firstname: c.firstname || '',
      lastname: c.lastname || '',
      email: c.email || '',
      phone: c.phone || c.mobile || '',
      company: c.company || '',
      assignedTo: c.assignedTo || '',
      assignedName: collabMap[c.assignedTo] || '',
      pipelineStage: c.pipeline_stage || '',
      createdAt: c.createdAt || '',
      isArchived: !!(c.archivedAt && c.archivedAt !== '')
    });

    // 3 signatures normalisées (alignées matcher V2.2.a)
    const sigEmail = (c) => (c.email || '').trim().toLowerCase();
    const sigPhone = (c) => {
      const cleaned = (c.phone || c.mobile || '').replace(/[^\d]/g, '').slice(-9);
      return cleaned.length >= 6 ? cleaned : '';
    };
    const sigName = (c) => {
      const fn = (c.firstname || '').trim().toLowerCase();
      const ln = (c.lastname || '').trim().toLowerCase();
      return fn && ln ? fn + '|' + ln : '';
    };

    // Group helper (filter count > 1)
    const groupBy = (sigFn, typeName) => {
      const m = new Map();
      for (const c of all) {
        const sig = sigFn(c);
        if (!sig) continue;
        if (!m.has(sig)) m.set(sig, []);
        m.get(sig).push(c);
      }
      return [...m.entries()]
        .filter(([, arr]) => arr.length > 1)
        .map(([sig, arr]) => ({
          signature: sig,
          type: typeName,
          count: arr.length,
          contacts: arr.map(enrich)
        }));
    };

    const groups = [];
    if (type === 'all' || type === 'email') groups.push(...groupBy(sigEmail, 'email'));
    if (type === 'all' || type === 'phone') groups.push(...groupBy(sigPhone, 'phone'));
    if (type === 'all' || type === 'name')  groups.push(...groupBy(sigName,  'name'));

    // Tri : count desc puis signature asc
    groups.sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));

    const total = groups.length;
    const paged = groups.slice(page * pageSize, (page + 1) * pageSize);

    console.log(`[DUPLICATES-SCAN] company=${companyId} type=${type} archived=${includeArchived} → ${total} groupes (page ${page}/${Math.ceil(total/pageSize)||1}) sur ${all.length} contacts`);

    res.json({
      groups: paged,
      total,
      page,
      pageSize,
      scannedContacts: all.length
    });
  } catch (err) {
    console.error('[DUPLICATES-SCAN ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

**Volumétrie** : +85 lignes (commentaires + code).

---

## 4. RISQUES + MITIGATION

| # | Risque | Sévérité | Mitigation |
|---|---|:---:|---|
| **R1** | Route ordering : Express matche `:id='duplicates-scan'` si insérée APRÈS `/contacts/:id` | 🔴→🟢 | Insertion stricte AVANT ligne 156. Pattern déjà connu V1.12.4 (`/archived`). Test smoke obligatoire (T8 ci-dessous). |
| **R2** | Charge mémoire `SELECT all contacts` | 🟢 | 184 contacts max × ~14 fields = ~50KB RAM. Négligeable. |
| **R3** | Perf 3 group-by + sort | 🟢 | 184×3 = 552 ops Map + sort O(n log n) sur ~12 groupes max → <5ms |
| **R4** | Permission : non-admin scan tous les contacts company | 🟡 | `requirePermission('contacts.view')` existant. Cohérent `GET /contacts` ligne 115. Si MH veut restreindre admin only → +3 lignes. |
| **R5** | Sécurité : leak inter-company | 🟢 | `companyId = req.auth.companyId` strict, jamais query param. |
| **R6** | `pageSize` user-controlled large → DOS | 🟢 | Clamp `Math.min(100, Math.max(10, ...))` : entre 10 et 100 forcé. |
| **R7** | Valeur `type` invalide ('foo') | 🟢 | Fallback comportement : aucune branche match → groups=[]. Pas d'erreur. |
| **R8** | Test ordering : appel `GET /contacts/duplicates-scan` matche `/:id` après deploy | 🔴 | Smoke test obligatoire post-deploy : `curl /api/data/contacts/duplicates-scan` doit retourner JSON `{groups, total, ...}` PAS 404 ni response single contact. |
| **R9** | Backend retourne archivés si `includeArchived=true` mais collab non-admin | 🟡 | Cohérent `/contacts/archived` (admin/supra OR own). V2.2.b par défaut OFF. Si MH veut filtre par ownership → +5 lignes. À trancher Q3. |
| **R10** | Match `name` requiert firstname AND lastname (skip si l'un est vide) | 🟢 | Documenté §2.2 — comportement attendu (sinon trop bruité avec contacts incomplets). |

### Mitigation R8 (route ordering — CRITIQUE)

Smoke test obligatoire **immédiatement après PM2 restart** :
```bash
# Test mounting + route ordering
curl -s http://localhost:3001/api/data/contacts/duplicates-scan → doit renvoyer "Authentification requise" 401 (mounting OK + auth middleware OK)
# JAMAIS retourner 404 (Express :id matche)
# JAMAIS retourner contenu d'un contact spécifique
```

---

## 5. TESTS V2.2.b

### Tests SQL pré-deploy (validation queries)

| # | SQL test | Attendu |
|---|---|---|
| **TS1** | `SELECT COUNT(*) FROM contacts WHERE companyId='c1776169036725' AND COALESCE(pipeline_stage,'')!='perdu' AND (archivedAt IS NULL OR archivedAt='')` | ~184 (matches scan default) |
| **TS2** | `SELECT LOWER(TRIM(email)) AS sig, COUNT(*) FROM contacts WHERE companyId=? AND email!='' GROUP BY sig HAVING COUNT(*)>1` | groupes email réels (présents si data vraiment dupliquée) |

### Tests endpoint post-deploy

| # | Scénario | Attendu |
|---|---|---|
| **T1** | `GET /duplicates-scan` sans auth | 401 Authentification requise |
| **T2** | `GET /duplicates-scan` authentifié admin CapFinances | 200 JSON `{groups, total, page, pageSize, scannedContacts}` |
| **T3** | `GET /duplicates-scan?type=email` | groups uniquement type=email |
| **T4** | `GET /duplicates-scan?type=phone` | groups uniquement type=phone |
| **T5** | `GET /duplicates-scan?type=name` | groups uniquement type=name (firstname+lastname renseignés) |
| **T6** | `GET /duplicates-scan?includeArchived=true` | groups peuvent contenir contacts avec isArchived:true |
| **T7** | `GET /duplicates-scan?page=0&pageSize=10` | max 10 groupes + total réel |
| **T8** | **CRITIQUE route ordering** : appel ne doit JAMAIS retourner contenu single contact ni 404 | Confirmation 401 ou 200 JSON groupes |
| **T9** | Régression `GET /contacts/abc123` (id existant) → toujours retourne contact ou 404 propre | OK |
| **T10** | Régression `GET /contacts/archived` → toujours liste archivés | OK |
| **T11** | Sécurité inter-company : login Julie (CapFinances) → `?` ne leak PAS contacts MonBilan | OK (companyId strict) |
| **T12** | `pageSize=5000` → clampé à 100 | OK |
| **T13** | `type=foo` invalide → groups=[] sans erreur | OK |
| **T14** | Régression `/check-duplicate-single` V2.2.a → toujours fonctionnel | OK |
| **T15** | Régression `/check-duplicates` batch (CSV import) → toujours fonctionnel | OK |

---

## 6. CONFORMITÉ CONTRAINTES MH

| Contrainte | Respect |
|---|---|
| Audit READ-ONLY avant code | ✅ ce doc |
| Diff preview obligatoire | ✅ §3.1 (code complet) |
| Patch minimal backend | ✅ +85 lignes data.js, 0 NEW fichier |
| Route AVANT `/contacts/:id` | ✅ §1.2 + R1/R8 mitigations |
| Respecter companyId | ✅ `req.auth.companyId` strict |
| Exclure `pipeline_stage='perdu'` | ✅ SQL principal |
| Inclure archivedAt avec flag | ✅ `includeArchived` opt-in + `isArchived` flag |
| Pas d'UI AdminDash | ✅ V2.2.c séparé |
| Pas de fuzzy | ✅ V2.2.d backlog |
| Pas de multi-email/phone | ✅ V2.3 séparé |
| Pas de cleanup ScheduleRdvModal | ✅ hors V2.x |
| STOP avant SCP | ✅ aucune ligne écrite |
| Workflow strict complet | ✅ planifié post-GO |

---

## 7. ESTIMATION FINALE V2.2.b

| Tâche | Effort |
|---|:---:|
| Patch `data.js` insertion route (~85 lignes) | 30 min |
| Build local + node --check | 5 min |
| Backup pré VPS (data.js + DB) | 5 min |
| SCP data.js + PM2 restart | 5 min |
| Smoke `/api/health` + `/duplicates-scan` (T1-T15) | 20 min |
| Test ordering critique R8 | 5 min |
| Commit + push + tag `v2.2.b-duplicates-scan-endpoint` | 10 min |
| Backup post VPS | 5 min |
| Handoff + memory + classement | 30 min |
| **Total V2.2.b** | **~2h** |

---

## 8. DÉCISIONS OUVERTES — Q1-Q3

### Q1 — Inclure type `company` dans V2.2.b ?

| Option | |
|---|---|
| **A** Skip — différer V2.2.c (besoin UI dédiée pour utilité) | reco Claude — minimal cohérent demande MH |
| **B** Inclure (cohérent V2.2.a qui matche déjà company) | +5 lignes, pas de coût |

**Reco** : **A** car MH a explicitement listé `email/phone/name` dans le brief V2.2.b, pas company.

### Q2 — Permission `requirePermission('contacts.view')` ou admin only ?

| Option | |
|---|---|
| **A** `contacts.view` (cohérent `GET /contacts` ligne 115) | reco Claude — collabs peuvent voir leurs propres doublons |
| **B** `admin` only | + restrictif, mais le scan voit tous les contacts company |

**Reco** : **A**. Si MH veut B, +3 lignes (`if (!req.auth.isAdmin && !req.auth.isSupra) return res.status(403)...`).

### Q3 — Filtre ownership pour non-admin ?

| Option | |
|---|---|
| **A** Aucun filtre — collab voit tous les groupes company (cohérent `GET /contacts` actuel admin/supra OR own ownership pattern) | demande MH précise pas |
| **B** Filtre : collab non-admin voit uniquement les groupes contenant un de ses contacts | +10 lignes, plus restrictif |

**Reco** : **A** par défaut (cohérent V2.2.b "préparation V2.2.c" qui sera admin-only de toute façon). Si MH veut B, à trancher.

---

## 9. ✅ STOP — Aucune ligne de code écrite

Audit READ-ONLY V2.2.b terminé. Aucune modification effectuée.

**Prochaine étape attendue** :
1. MH valide les 3 décisions Q1-Q3
2. GO MH explicite
3. Patch `data.js` (insertion ~85 lignes ligne 154)
4. Workflow strict 17 étapes

**Aucune action sans GO MH explicite.**

---

**Sources** :
- Repo local : HEAD `11a52abb`
- Code lu :
  - [`server/routes/data.js:115`](server/routes/data.js#L115) (GET /contacts list)
  - [`server/routes/data.js:135-153`](server/routes/data.js#L135-L153) (GET /contacts/archived — pattern position critique)
  - [`server/routes/data.js:156`](server/routes/data.js#L156) (GET /contacts/:id wildcard)
  - [`server/routes/data.js:418-516`](server/routes/data.js#L418-L516) (check-duplicate-single V2.2.a — matchers de référence)
- Mesures DB prod (post-V2.2.a) :
  - 5 companies actives, max 184 contacts actifs CapFinances
  - 21 indexes contacts (email, phone, active disponibles)
- Audits antérieurs :
  - [AUDIT-V2.2-DETECTION-…](docs/audits/2026-05/AUDIT-V2.2-DETECTION-ENRICHIE-DOUBLONS-2026-05-03.md) §2.2 + §3.3 (matière initiale endpoint)
  - [HANDOFF-V2.2.a-…](HANDOFF-V2.2.a-DUPLICATE-CHECK-ENRICHED.md) (signatures matchers de référence)
- Memory : `feedback_phase_workflow_17_steps.md`, `feedback_code_no_root_file_piling.md`
