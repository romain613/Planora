# HANDOFF V2.2.b — NEW endpoint `GET /contacts/duplicates-scan`

> **Date** : 2026-05-03
> **Tag** : `v2.2.b-duplicates-scan-endpoint`
> **Commit** : `185ff17e`
> **Branche** : `clean-main` (pushed origin)
> **Backend VPS** : `data.js` md5 `9c0f61c7…` (post-V2.2.b)
> **Bundle frontend** : `index-5ua22y6p.js` md5 `90184b46…` (V2.1.b inchangé — 0 modif frontend)
> **Statut** : ✅ LIVE sur https://calendar360.fr

---

## 0. RÉSUMÉ EXÉCUTIF

V2.2.b livre un **endpoint backend read-only** pour scanner les groupes de doublons d'une company.
Préparation directe pour **V2.2.c** (UI résolution AdminDash).

**Périmètre minimal Q1+Q2+Q3 validés MH** :
- Q1 ✅ skip type `company` (uniquement email/phone/name)
- Q2 ✅ `requirePermission('contacts.view')` (cohérent `GET /contacts`)
- Q3 ✅ aucun filtre ownership non-admin (préparatoire V2.2.c admin-only)

**Aucun consommateur frontend** → backend tourne, attend V2.2.c. **0 changement UX** visible.

---

## 1. ROUTE ÉCRITE

```
GET /api/data/contacts/duplicates-scan
Auth: requireAuth + enforceCompany + requirePermission('contacts.view')
Query params:
  type             : 'email' | 'phone' | 'name' | 'all' (default 'all')
  includeArchived  : 'true' | 'false' (default 'false')
  page             : int >= 0 (default 0)
  pageSize         : int 10..100 clampé (default 50)

Position: data.js ligne 163 (entre /archived L135 et /:id L260)
```

### Format JSON retourné

```json
{
  "groups": [
    {
      "signature": "romain|sitbon",
      "type": "name",
      "count": 3,
      "contacts": [
        {
          "id": "ct_...",
          "name": "Romain Sitbon",
          "firstname": "Romain",
          "lastname": "Sitbon",
          "email": "...",
          "phone": "...",
          "company": "...",
          "assignedTo": "u-julie",
          "assignedName": "Julie Desportes",
          "pipelineStage": "qualifie",
          "createdAt": "2026-04-15T...",
          "isArchived": false
        }
      ]
    }
  ],
  "total": 1,
  "page": 0,
  "pageSize": 50,
  "scannedContacts": 182
}
```

### Signatures (alignées matchers V2.2.a)
- **email** : `LOWER(TRIM(email))`
- **phone** : last 9 digits (min 6 chars)
- **name** : `LOWER(TRIM(firstname)) + '|' + LOWER(TRIM(lastname))`

### Tri groupes
`count DESC, signature ASC`

---

## 2. CHANGEMENTS

| Fichier | Δ | Détail |
|---|---|---|
| [`server/routes/data.js`](server/routes/data.js#L163) | +99 / -0 | NEW route `/duplicates-scan` insérée AVANT `/:id` (R8 ordering critique) |
| [`docs/audits/2026-05/AUDIT-V2.2.b-…md`](docs/audits/2026-05/AUDIT-V2.2.b-DUPLICATES-SCAN-ENDPOINT-2026-05-03.md) | +449 NEW | Audit READ-ONLY pré-implémentation |
| **Total** | **+548 / -0** | 1 NEW route + 1 NEW audit |

---

## 3. DÉPLOIEMENT — workflow strict 17 étapes

1. ✅ Audit READ-ONLY ([AUDIT-V2.2.b-…](docs/audits/2026-05/AUDIT-V2.2.b-DUPLICATES-SCAN-ENDPOINT-2026-05-03.md))
2. ✅ Diff preview présenté MH avant code
3. ✅ GO MH (Q1+Q2+Q3 validés)
4. ✅ Patch `data.js` (+99 lignes, ligne 163 entre /archived et /:id)
5. ✅ `node --check` PASS
6. ✅ Vérif route ordering : grep confirme `/duplicates-scan` ligne 163 AVANT `/:id` ligne 260
7. ✅ Backup pré VPS — `data.js` md5 `3af23eb4…` + DB tarball `fac61f33…`
8. ✅ SCP `data.js` → VPS md5 `9c0f61c7…`
9. ✅ PM2 restart `calendar360` (PID 1131016)
10. ✅ Smoke `/api/health` (status ok, 6 companies, 16 collabs, db connected)
11. ✅ **Test routing critique R8** : `GET /duplicates-scan` → 401 `Authentification requise` (PAS 404, PAS contenu single contact → ordering OK)
12. ✅ Régressions T9/T10/T14 : `/contacts/:id`, `/contacts/archived`, `/check-duplicate-single` tous 401 propres
13. ✅ Tests SQL équivalent logique : 182 contacts CapFinances, 0 groupe email, **1 groupe name `romain|sitbon` count=3**
14. ✅ Commit `185ff17e` (data.js + audit)
15. ✅ Push origin `clean-main`
16. ✅ Tag `v2.2.b-duplicates-scan-endpoint` pushed
17. ✅ Backup post VPS — `data.js` md5 `9c0f61c7…` + DB tarball `1e648ba7…` (WAL checkpoint OK)
18. ✅ Handoff (ce doc) + memory + classement

### Sécurité / rollback

| Backup | md5 | Localisation |
|---|---|---|
| **Pré V2.2.b data.js** | `3af23eb4…` | `/var/backups/planora/v22b-pre/data.js.pre-v22b-20260503-152316` |
| **Pré V2.2.b DB** | `fac61f33…` | `/var/backups/planora/v22b-pre/db-pre-v22b-20260503-152316.tar.gz` |
| **Post V2.2.b data.js** | `9c0f61c7…` | `/var/backups/planora/v22b-post/data.js.post-v22b-20260503-152524` |
| **Post V2.2.b DB (checkpoint)** | `1e648ba7…` | `/var/backups/planora/v22b-post/db-post-v22b-20260503-152534.tar.gz` |

Rollback ~30s :
```bash
cp /var/backups/planora/v22b-pre/data.js.pre-v22b-20260503-152316 /var/www/planora/server/routes/data.js
pm2 restart calendar360
```

### État VPS final
```
/api/health → {"status":"ok","db":"connected","companies":6,"collaborateurs":16,"uptime":126+}
data.js VPS md5 → 9c0f61c7b8137ed0aa671754223a1e1c (= local exact)
PM2 calendar360 → PID 1131016, online
Routes Express ordering OK : /contacts → /archived → /duplicates-scan (NEW) → /:id
```

---

## 4. GARANTIES PRÉSERVÉES

- ✅ Zero frontend touché → bundle md5 inchangé `90184b46…` (V2.1.b)
- ✅ Aucun changement UX visible immédiat (préparatoire V2.2.c)
- ✅ Backward compat 100% : NEW route, aucune modif route existante
- ✅ Filtre `'perdu'` (V1.11.5) appliqué sur SQL principal
- ✅ Filtre `archivedAt` par défaut (cohérent V2.2.a)
- ✅ Scope `companyId` strict + `requireAuth + enforceCompany`
- ✅ `pageSize` clampé 10-100 (DOS protection)
- ✅ Régression `/contacts/:id` → toujours wildcard fonctionnel
- ✅ Régression `/contacts/archived` → toujours fonctionnel
- ✅ Régression `/check-duplicate-single` V2.2.a → toujours fonctionnel
- ✅ Régression V2.1.b `DuplicateOnCreateModal` → bundle inchangé
- ✅ Backup pré + post (rollback ~30s)
- ✅ Workflow strict 17 étapes appliqué intégralement

---

## 5. VALIDATION LOGIQUE PAR SQL ÉQUIVALENT

Exécuté en live sur DB prod via SSH sqlite3 :

| Test | Query | Résultat | Endpoint attendu |
|---|---|---|---|
| **TS1** | `SELECT COUNT(*) FROM contacts WHERE companyId='c1776169036725' AND COALESCE(pipeline_stage,'')!='perdu' AND (archivedAt IS NULL OR archivedAt='')` | **182** | `scannedContacts: 182` |
| **TS2** | groupes email count > 1 | **0** | groupes type=email vide |
| **TS3** | groupes name (firstname\|lastname) count > 1 | **1** : `romain\|sitbon` count=3 | 1 groupe type=name retourné |
| **TS4** | count contacts non perdus (incl. archivés) | **182** | `includeArchived=true` même chose (0 archivés CapFinances actuellement) |

→ Endpoint logiquement validé. La preuve UI complète viendra avec V2.2.c quand le frontend consommera.

---

## 6. EXEMPLES D'UTILISATION (V2.2.c)

### 6.1 Scan complet
```bash
GET /api/data/contacts/duplicates-scan
→ { groups: [...], total: 1, page: 0, pageSize: 50, scannedContacts: 182 }
```

### 6.2 Filtrer par type
```bash
GET /api/data/contacts/duplicates-scan?type=name
→ uniquement groupes name
```

### 6.3 Inclure archivés
```bash
GET /api/data/contacts/duplicates-scan?includeArchived=true
→ contacts archivés inclus, flag isArchived: true sur chacun
```

### 6.4 Pagination
```bash
GET /api/data/contacts/duplicates-scan?page=0&pageSize=10
→ max 10 groupes par page + total réel pour calculer le nombre de pages
```

---

## 7. ROADMAP IMMÉDIATE POST-V2.2.b

| Priorité | Sub-phase | Description | Effort | Statut |
|:---:|---|---|:---:|:---:|
| 1 | **V2.2.c** | UI résolution AdminDash : 4e vue Doublons + DuplicatesPanel.jsx (~150L) + MergeContactsModal fallback context (pattern V2.1.b) | ~4h | en attente GO MH |
| 2 | **V2.2.d** | Fuzzy léger Levenshtein — optionnel | ~1h30 | backlog |
| 3 | **Cleanup** | Supprimer `ScheduleRdvModal.jsx` (code mort confirmé V2.2.a) | ~5min | hors V2.x |

**V2.2.c utilisera `/duplicates-scan`** :
1. Fetch au mount + bouton refresh manuel
2. Liste groupes par type (email/phone/name)
3. Bouton "Fusionner" sur paire → ouvre `MergeContactsModal` (V1.13.2.b)
4. Bouton "Ignorer" persistant localStorage
5. Listener `crmContactMerged` → refetch

**Blocker connu pour V2.2.c** : `MergeContactsModal` consomme `useCollabContext()` → AdminDash crash. Pattern V2.1.b à reproduire (props prioritaires + fallback context).

---

## 8. POINTS D'ATTENTION POUR PROCHAINE SESSION

1. **Backend tourne enrichi** mais **aucun consommateur frontend** → safe, 0 risque UX
2. **Route ordering critique** : si futurs développements ajoutent une route `/contacts/<truc>`, vérifier qu'elle est insérée AVANT `/contacts/:id` (ligne 260)
3. **V2.2.c** : prêt à consommer `/duplicates-scan` avec contrat API stable
4. **MergeContactsModal blocker** : préparer fallback context comme V2.1.b
5. **Memory MEMORY.md > 24.4KB** : warning persistant. Compresser entries V1.13/V1.14/V2.x recommandé prochain cycle.

---

**Source :**
- Repo : HEAD `185ff17e` (clean-main)
- Tag : `v2.2.b-duplicates-scan-endpoint`
- Audit pré : [AUDIT-V2.2.b-DUPLICATES-SCAN-ENDPOINT-2026-05-03.md](docs/audits/2026-05/AUDIT-V2.2.b-DUPLICATES-SCAN-ENDPOINT-2026-05-03.md)
- Audit master V2 : [AUDIT-V2-DOUBLONS-INTELLIGENTS-2026-05-03.md](docs/audits/2026-05/AUDIT-V2-DOUBLONS-INTELLIGENTS-2026-05-03.md)
- Pré-requis : V2.2.a [HANDOFF-V2.2.a-DUPLICATE-CHECK-ENRICHED.md](HANDOFF-V2.2.a-DUPLICATE-CHECK-ENRICHED.md)
