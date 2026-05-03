# HANDOFF V2.1.b — AdminDash création contact branché sur DuplicateOnCreateModal

> **Date** : 2026-05-03
> **Tag** : `v2.1.b-admindash-duplicate-create`
> **Commit** : `eed2be7f`
> **Branche** : `clean-main` (pushed origin)
> **Bundle prod** : `index-5ua22y6p.js` md5 `90184b4620a86a2f2e5a1125677db97b`
> **Statut** : ✅ LIVE sur https://calendar360.fr

---

## 0. RÉSUMÉ EXÉCUTIF

V2.1.b livre le **6e chemin de création contact** branché sur `DuplicateOnCreateModal` :
**AdminDash `handleCreateContact`** (modale Nouveau contact CRM admin).

→ Pré-check anti-doublon **backend** (au lieu de `findDuplicateContact` local + `window.confirm`),
modale riche avec actions structurées, audit log enrichi via `_forceCreate` + raison + justification.

**Périmètre minimal Q2 (MH validé)** : 3 handlers wirés (`onForceCreate`, `onEnrich`, `onClose`).
Les 4 autres (`onShare`, `onCreateMyOwn`, `onArchive`, `onHardDelete`, `onDelete`) sont volontairement
**non wirés** → boutons MatchCard cachés (comportement natif V1.13.1.b si callback `undefined`).

---

## 1. CHANGEMENTS

### 1.1 Périmètre code (3 fichiers, 0 NEW, 0 backend, 0 DB)

| Fichier | Δ | Détail |
|---|---|---|
| [`CollabContext.jsx`](app/src/features/collab/context/CollabContext.jsx) | +3 | export raw `CollabContext` (permet `useContext` optionnel hors provider) |
| [`DuplicateOnCreateModal.jsx`](app/src/features/collab/modals/DuplicateOnCreateModal.jsx) | +6 / -3 | useContext optionnel + props `collab`/`contacts` prioritaires + fallback context |
| [`AdminDash.jsx`](app/src/features/admin/AdminDash.jsx) | +94 / -27 | imports + state + 2 handlers + submit helper + handleCreateContact rewrite + render top-level + suppression `findDuplicateContact` |
| [`AUDIT-V2.1.b-…md`](docs/audits/2026-05/AUDIT-V2.1.b-ADMINDASH-CREATION-CONTACTS-2026-05-03.md) | +480 (NEW) | audit READ-ONLY pré-implémentation |
| **Total** | **+583 / -30** | 4 fichiers commit |

### 1.2 Suppression code mort

`findDuplicateContact` (AdminDash.jsx:1152-1164) **supprimée**. Remplacée par helper `precheckCreate`
(shared/utils/duplicateCheck.js V2.1) → 1 source de vérité backend
`/api/data/contacts/check-duplicate-single`.

### 1.3 Architecture

```
AdminDash.handleCreateContact (async)
  └─ precheckCreate(nc, { api, onMatch, onClose })
       ├─ exists ? → setDuplicateOnCreateData(dupData) + setShowNewContact(false) + return true
       └─ no match → return false
                 └─ submitNewContactAdmin(nc, { forceCreate: false })

DuplicateOnCreateModal (rendered top-level dans AdminDash)
  ├─ collab={role:'admin'} (prop) → footer "Créer quand même" visible
  ├─ contacts={contacts} (prop)   → MatchCard enrichit diff
  ├─ onClose       → setDuplicateOnCreateData(null) + setShowNewContact(true) (restore modale source)
  ├─ onForceCreate → submitNewContactAdmin(snapshot, { forceCreate, reason, justification })
  └─ onEnrich      → handleDuplicateEnrichAdmin(matchId, payload) → PUT /:id append-only
```

---

## 2. DÉCISIONS Q1-Q4 VALIDÉES MH

| # | Question | Choix | Impact code |
|---|---|---|---|
| Q1 | Conserver `findDuplicateContact` local ? | **A : supprimer** | -13 lignes dette, 1 source vérité |
| Q2 | Périmètre handlers admin | **A : minimal** (onForceCreate + onEnrich + onClose) | 3 callbacks wirés, 4 cachés natif |
| Q3 | Stratégie context AdminDash hors CollabProvider | **A : props prioritaires + fallback context** | DuplicateOnCreateModal universel, CollabPortal régression-proof |
| Q4 | `collab` injecté dans AdminDash render | **A : `{role:'admin'}` constante** | suffit footer admin/supra, no extra fetch |

---

## 3. TESTS UI MH (10/10 PASS — 2026-05-03)

### V2.1.b cœur (5 tests)

| # | Scénario | Résultat |
|---|---|:---:|
| **T1** | AdminDash → Nouveau contact email existant → DuplicateOnCreateModal | ✅ |
| **T2** | AdminDash → Nouveau contact phone existant → DuplicateOnCreateModal | ✅ |
| **T3** | AdminDash → email/phone nouveau → création directe | ✅ |
| **T4** | T1/T2 → "Créer quand même" → raison + justif → audit log enrichi | ✅ |
| **T5** | T1/T2 → "Annuler" → modale source ré-ouverte intacte | ✅ |
| **T_ENRICH** | "Compléter cette fiche" depuis MatchCard | ✅ |

### Régression V2.1 A+B (3 tests)

| # | Scénario | Résultat |
|---|---|:---:|
| **T6** | CollabPortal NewContactModal V1.13.0 → email existant | ✅ fallback context préservé |
| **T7** | CollabPortal Quick Add Hub SMS V2.1 → phone existant | ✅ |
| **T8** | CollabPortal linkVisitorToContacts V2.1 → email existant | ✅ |

### Régression sanitaire (2 tests)

| # | Scénario | Résultat |
|---|---|:---:|
| **T9** | V1.14.1.z hard delete archivés (admin) | ✅ intact |
| **T10** | ScheduleRdvModal silent merge `_duplicate:true` | ✅ intact (R1 hors scope) |

---

## 4. DÉPLOIEMENT

### 4.1 Workflow strict 17 étapes — exécuté

1. ✅ Audit READ-ONLY ([AUDIT-V2.1.b-…md](docs/audits/2026-05/AUDIT-V2.1.b-ADMINDASH-CREATION-CONTACTS-2026-05-03.md))
2. ✅ Diff preview présenté MH avant code
3. ✅ GO MH (Q1-Q4 validés)
4. ✅ Patch 3 fichiers (commits restés en local jusqu'à validation tests)
5. ✅ Build local Vite — `index-5ua22y6p.js` md5 `90184b46…` — 2.43s
6. ✅ STOP avant SCP — diff final présenté MH
7. ✅ Backup pré VPS — `httpdocs-pre-v21b-20260503-163058.tar.gz` md5 `5d7ccc9e…` (96 Mo)
8. ✅ Deploy SCP `dist/*` → `/var/www/vhosts/calendar360.fr/httpdocs/`
9. ✅ Smoke health + bundle hash VPS=local
10. ✅ Tests UI MH (T1-T10 PASS)
11. ✅ Pas de fix nécessaire (10/10 PASS direct)
12. ✅ Re-test : N/A
13. ✅ Commit `eed2be7f` (4 fichiers, +714/-30)
14. ✅ Push origin `clean-main`
15. ✅ Tag `v2.1.b-admindash-duplicate-create` pushed
16. ✅ Backup post VPS — `httpdocs-post-v21b-20260503-164404.tar.gz` md5 `fd85f159…`
17. ✅ Handoff + memory + classement (ce doc + index ligne MEMORY.md)

### 4.2 Sécurité / rollback

| Backup | md5 | Localisation |
|---|---|---|
| **Pré V2.1.b** | `5d7ccc9ed64cd89bb07fdb8cfec8f65e` | `/var/backups/planora/v21b-pre/httpdocs-pre-v21b-20260503-163058.tar.gz` |
| **Post V2.1.b** | `fd85f159959a78597e1d4ba6c5664c8b` | `/var/backups/planora/v21b-post/httpdocs-post-v21b-20260503-164404.tar.gz` |

Rollback en ~30s : `cd /var/www/vhosts/calendar360.fr && rm -rf httpdocs && tar xzf /var/backups/planora/v21b-pre/httpdocs-pre-v21b-20260503-163058.tar.gz`.

### 4.3 État VPS final

```
/api/health → {"status":"ok","db":"connected","companies":6,"collaborateurs":16,
               "dbPath":"/var/www/planora-data/calendar360.db","uptime":14503}
HTTPS GET / → HTTP/2 200 nginx
index.html → ref index-5ua22y6p.js
Bundle md5 (VPS) → 90184b4620a86a2f2e5a1125677db97b (= local exact)
```

---

## 5. GARANTIES PRÉSERVÉES

- ✅ Aucun backend touché (data.js:418 inchangé)
- ✅ Aucune DB touchée
- ✅ CollabPortal NewContactModal V1.13.0 → fallback context (T6 PASS)
- ✅ CollabPortal Quick Add Hub SMS V2.1 → fallback context (T7 PASS)
- ✅ CollabPortal linkVisitorToContacts V2.1 → fallback context (T8 PASS)
- ✅ ScheduleRdvModal silent merge `_duplicate:true` → R1 hors scope, intact (T10 PASS)
- ✅ V1.14.1.z hard delete archivés admin → intact (T9 PASS)
- ✅ Audit log enrichi V1.13.1.a → continue de fonctionner (`_forceCreate` flag propagé)
- ✅ Backend `requireAuth` + `enforceCompany` → admin session valide
- ✅ Backup pré + post (rollback ~30s)
- ✅ Workflow strict 17 étapes appliqué intégralement

---

## 6. ROADMAP IMMÉDIATE POST-V2.1.b

| Priorité | Sub-phase | Description | Effort |
|:---:|---|---|:---:|
| 1 | **V2.1.c** (optionnel) | Wirer onArchive (admin peut archiver doublon depuis modale) — V2.1.b minimal n'a pas inclus | ~30min |
| 2 | **V2.1.d** (optionnel) | Wirer onHardDelete + render `HardDeleteContactModal` admin | ~1h30 |
| 3 | **V2.2** | Détection nom/société/fuzzy + archivés + `/duplicates-scan` + UI résolution + PhoneTab IA + fix bug ScheduleRdvModal `_duplicate.id` | ~2-3j |
| 4 | **V2.3** | Multi-emails/phones JSON + refacto UX (DB schema impact) | ~5-7j |

**Note V2.1.c/d** : optionnel uniquement si MH le demande. Le périmètre Q2=A
(minimal) est stable et fonctionnel pour la majorité des cas admin.

---

## 7. SOURCE DE VÉRITÉ POST-V2.1.b

### 7.1 Helper unifié
[`shared/utils/duplicateCheck.js`](app/src/shared/utils/duplicateCheck.js) (V2.1) — `precheckCreate(nc, { api, onMatch, onClose }) → Promise<boolean>`

### 7.2 Backend pré-check (inchangé)
[`server/routes/data.js:418`](server/routes/data.js#L418) — `POST /api/data/contacts/check-duplicate-single`. Scope **company**, exclusion `pipeline_stage='perdu'` + `archivedAt`.

### 7.3 Modale universelle (V2.1.b)
[`DuplicateOnCreateModal.jsx`](app/src/features/collab/modals/DuplicateOnCreateModal.jsx) — props `collab`/`contacts` prioritaires (AdminDash), fallback context (CollabPortal). 7 handlers props (3 wirés AdminDash, 7 wirés CollabPortal).

### 7.4 Sites de création contact branchés (post-V2.1.b)

| # | Site | Fichier | Statut |
|---|---|---|:---:|
| 1 | `submitNewContact` (NewContactModal CRM) | CollabPortal | ✅ V1.13.0 |
| 2 | `handleQuickAddContact` (Hub SMS) | CollabPortal | ✅ V2.1 |
| 3 | `linkVisitorToContacts` (visiteur web) | CollabPortal | ✅ V2.1 |
| 4 | `handleCollabCreateContact` (legacy?) | CollabPortal | ✅ V1.13.0 |
| 5 | ScheduleRdvModal | modals/ScheduleRdvModal | 🟡 silent merge backend (R1 distinct) |
| **6** | **`handleCreateContact` AdminDash** | **AdminDash** | **✅ V2.1.b (NEW)** |
| 7 | PhoneTab IA reco (prompt inline) | PhoneTab:2594 | ⏳ V2.2 (matching nom) |
| 8 | AdminDash auto-booking cron-like | AdminDash:1343 | ❌ exclu (cron, pas UX) |
| 9 | AdminDash CSV legacy | AdminDash:10218 | ❌ exclu (V2.2 import résolution) |
| 10 | CsvImportModal | CsvImportModal | ❌ exclu (V2.2) |

→ **6/10 sites couverts par DuplicateOnCreateModal**. Reste 1 IA reco + 3 cas spéciaux/exclus.

---

## 8. POINTS D'ATTENTION POUR PROCHAINE SESSION

1. **V2.1.b stable, aucun fix attendu**. Si retour utilisateur sur archive/hardDelete admin → V2.1.c/d à programmer.
2. **R2 audit (V2.1.b §7)** : modale Z-index AdminDash si `<ConfirmModal>` ouvert simultanément → non testé spécifiquement, à surveiller.
3. **Memory MEMORY.md > 24.4KB** : warning persistant, entries existantes trop longues. Prochain cycle V2.x : compresser entries V1.13/V1.14 vers une meta-entry "PHASE 1 contacts/doublons clôturée".
4. Aucune nouvelle feature ne sera lancée sans GO MH explicite. Sub-phases V2.2/V2.3 cadencées validation MH.

---

**Source :**
- Repo : HEAD `eed2be7f` (clean-main)
- Tag : `v2.1.b-admindash-duplicate-create`
- Audit pré : [AUDIT-V2.1.b-ADMINDASH-CREATION-CONTACTS-2026-05-03.md](docs/audits/2026-05/AUDIT-V2.1.b-ADMINDASH-CREATION-CONTACTS-2026-05-03.md)
- Audit master : [AUDIT-V2-DOUBLONS-INTELLIGENTS-2026-05-03.md](docs/audits/2026-05/AUDIT-V2-DOUBLONS-INTELLIGENTS-2026-05-03.md)
- Pré-requis : V2.1 A+B [HANDOFF-V2.1-HARMONISATION-CREATION-CONTACTS.md](HANDOFF-V2.1-HARMONISATION-CREATION-CONTACTS.md)
