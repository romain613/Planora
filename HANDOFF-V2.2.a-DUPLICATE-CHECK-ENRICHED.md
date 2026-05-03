# HANDOFF V2.2.a — check-duplicate-single enrichi (name + company + includeArchived)

> **Date** : 2026-05-03
> **Tag** : `v2.2.a-duplicate-check-enriched`
> **Commit** : `2835ee64`
> **Branche** : `clean-main` (pushed origin)
> **Bundle prod** : `index-5ua22y6p.js` md5 `90184b46…` (V2.1.b inchangé — pas de modif frontend)
> **Backend VPS** : `data.js` md5 `3af23eb4…` (post-V2.2.a)
> **Statut** : ✅ LIVE sur https://calendar360.fr

---

## 0. RÉSUMÉ EXÉCUTIF

V2.2.a livre l'**enrichissement backend** de `POST /api/data/contacts/check-duplicate-single` :
- Match additionnel par **nom** (firstname + lastname normalisés)
- Match additionnel par **société** (`company` field normalisé)
- Flag **`includeArchived`** (default false) pour optionnellement inclure les contacts archivés
- Retour enrichi : champ `company` + flag `isArchived` sur chaque match

**Périmètre minimal Q1+Q5 validés MH** :
- Q1 : matchers name + company + includeArchived ✅
- Q2 : fuzzy → backlog V2.2.d ⏸
- Q3 : UI → V2.2.c ⏸
- Q4 : DuplicatesPanel → V2.2.c ⏸
- Q5 : V2.2.a seul (Option C) ✅

**Backward compat 100%** : default `includeArchived=false` + default `firstname/lastname/company=''` → callers existants (V1.13.0, V2.1, V2.1.b, V1.8.22) continuent de fonctionner sans modification.

**Zéro frontend** : aucun consommateur frontend n'utilise encore les nouveaux fields. Ils seront utilisés par V2.2.b/c.

---

## 1. CHANGEMENTS

### 1.1 Périmètre code (1 fichier backend, 0 frontend, 0 NEW, 0 DB)

| Fichier | Δ | Détail |
|---|---|---|
| [`server/routes/data.js`](server/routes/data.js#L418) | +45 / -14 | check-duplicate-single enrichi (4 matchers + Map dédup + retour enrichi) |
| [`docs/audits/2026-05/AUDIT-V2.1-HARMONISATION-…md`](docs/audits/2026-05/AUDIT-V2.1-HARMONISATION-6-CHEMINS-2026-05-03.md) | +9 | Correction §4 : faux positif ScheduleRdvModal |
| [`docs/audits/2026-05/AUDIT-V2.2-DETECTION-…md`](docs/audits/2026-05/AUDIT-V2.2-DETECTION-ENRICHIE-DOUBLONS-2026-05-03.md) | +12 | Correction §1.6 : faux positif ScheduleRdvModal |
| **Total** | **+1242 / -14** | (audits = NEW fichiers, contenu déjà rédigé en READ-ONLY) |

### 1.2 Architecture après V2.2.a

```
POST /api/data/contacts/check-duplicate-single
  Body: { email?, phone?, firstname?, lastname?, company?, includeArchived? }
  Auth: requireAuth + enforceCompany
  
  Logique :
    1. Validation au moins 1 critère présent
    2. archivedFilter conditionnel selon includeArchived
    3. Map dédup par contact id (évite doublons multi-matchers)
    4. 4 matchers en cascade (skip si pas de critère) :
       - Email (LOWER exact)
       - Phone (last 9 digits)
       - Name (LOWER+TRIM firstname AND lastname)
       - Company (LOWER+TRIM)
    5. Conflict logic préservé (email vs phone different ids)
    6. Enrichissement matches : assignedName + sharedWith + company + isArchived
    7. Retour: { exists, conflict, matches: [...] }
```

---

## 2. DÉCOUVERTE CRITIQUE — faux positif ScheduleRdvModal corrigé

Pendant l'implémentation V2.2.a, découverte que le "bug latent" documenté dans **2 audits antérieurs** était un faux positif :

- `app/src/features/collab/modals/ScheduleRdvModal.jsx` est **du code mort** (extraction S2.11 jamais branchée)
- Preuves :
  - `grep -rn "import.*ScheduleRdvModal" app/src` → 0 caller
  - Bundle md5 inchangé après edit du fichier (Vite tree-shake)
- Le **flow scheduling actif** vit dans **`CollabPortal.jsx:6505-6577`** où il a déjà été corrigé V1.8.22.1/.2 :
  - L6556 : `const createRes = await api(...)`
  - L6562-6563 : `// _duplicate:true géré silencieusement — l'id retourné est l'existant` + `const realContactId = createRes.id`
  - L6567+ : `realContactId` propagé dans `setContacts` / `setPhoneScheduleForm` / `setTimeout`

→ **Pas de fix ScheduleRdvModal nécessaire**. Périmètre V2.2.a réduit à 1 patch backend pur.

**Audits corrigés** :
- [AUDIT-V2.1 §4](docs/audits/2026-05/AUDIT-V2.1-HARMONISATION-6-CHEMINS-2026-05-03.md) — note correction ajoutée en tête de §4
- [AUDIT-V2.2 §1.6](docs/audits/2026-05/AUDIT-V2.2-DETECTION-ENRICHIE-DOUBLONS-2026-05-03.md) — section barrée + note correction

`ScheduleRdvModal.jsx` reste à supprimer en cleanup séparé (hors scope V2.x).

---

## 3. DÉPLOIEMENT

### 3.1 Workflow strict 17 étapes — exécuté

1. ✅ Audit READ-ONLY ([AUDIT-V2.2-…](docs/audits/2026-05/AUDIT-V2.2-DETECTION-ENRICHIE-DOUBLONS-2026-05-03.md))
2. ✅ Diff preview présenté MH avant code
3. ✅ GO MH (Q1+Q5 validés, Q2-Q4 reportés)
4. ✅ Patch `data.js` (+45/-14 lignes)
5. ✅ Découverte ScheduleRdvModal dead code → revert + audits corrigés
6. ✅ Build frontend (no-op, bundle md5 identique V2.1.b)
7. ✅ STOP avant SCP — diff final + découverte présentés MH
8. ✅ Backup pré VPS — `data.js` md5 `5ca1e08d…` + DB tarball `31700e18…`
9. ✅ SCP `data.js` → VPS (md5 VPS `3af23eb4…`)
10. ✅ PM2 restart `calendar360` (PID 1130371)
11. ✅ Smoke `/api/health` (status ok, 6 companies, 16 collabs, db connected)
12. ✅ Smoke SQL queries enrichies sur DB live (T1 name=3 matches, T2 company=0, T3 archived filter, T4 184 actifs CapFinances)
13. ✅ Endpoint répond `401` sans auth (mounting + middleware OK)
14. ✅ Commit `2835ee64` (+1242/-14 = data.js + 2 audits)
15. ✅ Push origin `clean-main`
16. ✅ Tag `v2.2.a-duplicate-check-enriched` pushed
17. ✅ Backup post VPS — `data.js` md5 `3af23eb4…` + DB tarball `60a73b21…`
18. ✅ Handoff (ce doc) + memory + audits classés

### 3.2 Sécurité / rollback

| Backup | md5 | Localisation |
|---|---|---|
| **Pré V2.2.a data.js** | `5ca1e08d…` | `/var/backups/planora/v22a-pre/data.js.pre-v22a-20260503-151000` |
| **Pré V2.2.a DB** | `31700e18…` | `/var/backups/planora/v22a-pre/db-pre-v22a-20260503-151000.tar.gz` |
| **Post V2.2.a data.js** | `3af23eb4…` | `/var/backups/planora/v22a-post/data.js.post-v22a-20260503-151344` |
| **Post V2.2.a DB** | `60a73b21…` | `/var/backups/planora/v22a-post/db-post-v22a-20260503-151344.tar.gz` |

Rollback en ~30s :
```bash
cp /var/backups/planora/v22a-pre/data.js.pre-v22a-20260503-151000 /var/www/planora/server/routes/data.js
pm2 restart calendar360
```

### 3.3 État VPS final

```
/api/health → {"status":"ok","db":"connected","companies":6,"collaborateurs":16,
               "dbPath":"/var/www/planora-data/calendar360.db","uptime":200+}
data.js VPS md5 → 3af23eb4c4ee148996f46e3c025ef901 (= local exact)
PM2 calendar360 → PID 1130371, online
SQL enrichi T1-T4 → PASS sur DB live
```

---

## 4. GARANTIES PRÉSERVÉES

- ✅ Zero frontend touché → bundle md5 inchangé `90184b46…` (V2.1.b)
- ✅ Backward compat 100% : default `includeArchived=false` + default fields vides
- ✅ Email exact match : SQL inchangé fonctionnel
- ✅ Phone last-9 digits : SQL inchangé fonctionnel
- ✅ Filtre `'perdu'` (V1.11.5) préservé sur les 4 matchers
- ✅ Filtre archivedAt par défaut préservé (sauf si `includeArchived=true` opt-in)
- ✅ Scope `companyId` strict + `requireAuth` + `enforceCompany` inchangés
- ✅ Conflict logic email vs phone preserved
- ✅ Audit log enrichi (trace name + company + archived flag)
- ✅ Régression V1.13.0 / V2.1 A+B / V2.1.b → comportement identique
- ✅ Régression CollabPortal:6505 scheduling silent merge V1.8.22 → intact
- ✅ Backup pré + post (rollback ~30s)
- ✅ Workflow strict 17 étapes appliqué intégralement

---

## 5. NOUVEAUX FIELDS — exemples d'utilisation (V2.2.b/c)

### 5.1 Match name (firstname + lastname)

```js
fetch('/api/data/contacts/check-duplicate-single', {
  method: 'POST',
  body: JSON.stringify({
    firstname: 'Jean',
    lastname: 'Dupont'
  })
})
// Retour :
// { exists: true, conflict: false, matches: [
//   { id: 'ct_...', name: 'Jean Dupont', firstname:..., lastname:..., 
//     email:..., phone:..., company:..., assignedTo:..., assignedName:...,
//     pipelineStage:..., createdAt:..., matchedBy: 'name', isArchived: false }
// ] }
```

### 5.2 Match company

```js
{ company: 'CapFinances SARL' }
// → matchedBy: 'company'
```

### 5.3 Inclusion archivés

```js
{ email: 'jean@example.com', includeArchived: true }
// Retour inclut aussi les contacts avec archivedAt != ''
// chaque match a flag isArchived: true|false
```

### 5.4 Multi-matchers combinés (déduplication par id)

```js
{ email: 'jean@example.com', firstname: 'Jean', lastname: 'Dupont' }
// Si même contact match email ET name → 1 seul retour
// matchedBy = premier matcher détecté (priorité email > phone > name > company)
```

---

## 6. ROADMAP IMMÉDIATE POST-V2.2.a

| Priorité | Sub-phase | Description | Effort | Statut |
|:---:|---|---|:---:|:---:|
| 1 | **V2.2.b** | NEW endpoint `GET /api/data/contacts/duplicates-scan` (groupes existants par type, pagination) | ~2h | en attente GO MH |
| 2 | **V2.2.c** | UI résolution AdminDash (4e vue Doublons + DuplicatesPanel + MergeContactsModal fallback context) | ~4h | en attente V2.2.b |
| 3 | **V2.2.d** | Fuzzy léger Levenshtein (sans lib) — optionnel | ~1h30 | backlog |
| 4 | **Cleanup** | Supprimer `ScheduleRdvModal.jsx` (code mort confirmé) | ~5min | hors V2.x |

**Note** : V2.2.b/c sont **prêts à utiliser les nouveaux fields backend** dès leur livraison. Le contrat API est défini et stable.

---

## 7. POINTS D'ATTENTION POUR PROCHAINE SESSION

1. **Aucun consommateur frontend** des nouveaux fields tant que V2.2.b/c pas livrés. Le backend tourne enrichi mais inutilisé côté UX → safe.
2. **Frontend bundle V2.1.b inchangé** → callers existants ne casseront pas.
3. **Cleanup ScheduleRdvModal** : à programmer hors V2.x. C'est un dead code de l'extraction S2.11 (refactor frontend) jamais finalisée.
4. **Q2 fuzzy** : si MH revient sur cette demande, calibration nécessaire (seuil + tests faux positifs).
5. **Memory MEMORY.md > 24.4KB** : warning persistant. Compresser entries V1.13/V1.14 vers meta-entry recommandé.

---

**Source :**
- Repo : HEAD `2835ee64` (clean-main)
- Tag : `v2.2.a-duplicate-check-enriched`
- Audit pré : [AUDIT-V2.2-DETECTION-ENRICHIE-DOUBLONS-2026-05-03.md](docs/audits/2026-05/AUDIT-V2.2-DETECTION-ENRICHIE-DOUBLONS-2026-05-03.md)
- Audit master V2 : [AUDIT-V2-DOUBLONS-INTELLIGENTS-2026-05-03.md](docs/audits/2026-05/AUDIT-V2-DOUBLONS-INTELLIGENTS-2026-05-03.md)
- Pré-requis : V2.1.b [HANDOFF-V2.1.b-ADMINDASH-DUPLICATE-CREATE.md](HANDOFF-V2.1.b-ADMINDASH-DUPLICATE-CREATE.md)
