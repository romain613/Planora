# HANDOFF V1.11.3 — Fiche CRM synchronisée + fix crash imports onglets

> **Date** : 2026-04-30
> **Tag** : `v1.11.3-fiche-crm-sync`
> **Commit** : `f1e0f0b3`
> **Statut** : ✅ tests MH 4/4 OK, verrou final posé
> **Demandeur** : MH

---

## 1. Résumé exécutif

2 bugs critiques fiche contact CRM corrigés en frontend uniquement :

1. **Fiche CRM non synchronisée** avec Pipeline Live > Info — les champs custom du Sheet ne remontaient pas dans l'onglet "Info & Notes"
2. **Crash "Can't find variable: FicheClientMsgScreen"** sur certains onglets fiche CRM

Solution : 1 import composant + 1 import barrel + 1 ligne JSX. Réutilisation 100% de `ContactInfoEnriched.jsx` livré V1.11.2.

---

## 2. Cause racine

### Bug 1 — Fiche CRM non synchronisée

[CrmTab.jsx:~1305](app/src/features/collab/tabs/CrmTab.jsx#L1305) : le bloc "Champs personnalisés" itérait sur `defs.map(...)` (`contactFieldDefs`) → affichait UNIQUEMENT les fieldKeys avec definition matchante.

Les champs auto-importés du Sheet (`PERMIS_B`, `IAS`, `FREELANCE`, `COMPETENCES`, `LIEN_CV`, `LIEN_FICHE`, etc.) sans `contact_field_definitions` correspondante → **invisibles côté CRM**.

Bug identique à celui corrigé V1.11.2 côté Pipeline Live > Info — mais CrmTab.jsx n'avait pas été touché.

### Bug 2 — Crash imports onglets

3 composants utilisés sans import dans CrmTab.jsx :

| Composant | Ligne | Onglet |
|---|---:|---|
| `FicheClientMsgScreen` | 1189 | 💬 Messages |
| `FicheSuiviScreen` | 1652 | 📋 Suivi |
| `FicheDocsLinkedScreen` | 1666 | 📎 Docs |

Tous existent dans [app/src/features/collab/screens/](app/src/features/collab/screens/) et sont exportés par le barrel `screens/index.js`, mais l'import était absent dans CrmTab → `ReferenceError` au render.

---

## 3. Correction

### 3.1 Imports ajoutés ([CrmTab.jsx:21-23](app/src/features/collab/tabs/CrmTab.jsx#L21-L23))

```js
import FicheReportingBlock from "./crm/fiche/FicheReportingBlock";
import InteractionTemplatesPanel from "../../interactions/InteractionTemplatesPanel.jsx";
import ContactInfoEnriched from "../../contacts/ContactInfoEnriched.jsx";          // ← V1.11.3
import { FicheClientMsgScreen, FicheDocsLinkedScreen, FicheSuiviScreen } from "../screens";  // ← V1.11.3
```

### 3.2 JSX ajouté ([CrmTab.jsx:~1338](app/src/features/collab/tabs/CrmTab.jsx#L1338))

```jsx
{/* V1.11.3 — Données enrichies (sections lisibles, badges, liens) */}
<ContactInfoEnriched T={T} contact={ct}/>
```

Position : après le bloc "Champs personnalisés" (édition via defs), avant le textarea Notes.

---

## 4. Réutilisation 100% du composant V1.11.2

`ContactInfoEnriched.jsx` est désormais **mutualisé** entre :

| Vue | Fichier | Ligne |
|---|---|---|
| Pipeline Live > col droite > onglet Info | [PhoneTab.jsx:~1765](app/src/features/collab/tabs/PhoneTab.jsx#L1765) | V1.11.2 |
| Fiche CRM > onglet "Info & Notes" | [CrmTab.jsx:~1338](app/src/features/collab/tabs/CrmTab.jsx#L1338) | V1.11.3 |

**Aucune duplication de logique** : le même rendu, les mêmes 5 sections, les mêmes badges/couleurs partout.

---

## 5. Tests MH 4/4 OK (validation 2026-04-30)

| # | Test | Statut |
|---:|---|:---:|
| 1 | Fiche CRM synchronisée avec Pipeline Live > Info | ✅ |
| 2 | Sections enrichies visibles (Profil / Qualif / Liens / Localisation) | ✅ |
| 3 | Lien CV cliquable depuis fiche CRM | ✅ |
| 4 | Tous les onglets fonctionnels (plus aucun crash) | ✅ |

Verdict MH : "Aucune régression constatée."

---

## 6. État runtime sécurité

### 6.1 Healthcheck

```
GET /api/health
{"status":"ok","db":"connected","companies":6,"collaborateurs":15,
 "dbPath":"/var/www/planora-data/calendar360.db","uptime":456}
```

PM2 PID 829618, online uptime 7m+ stable.

### 6.2 DB

```
PRAGMA integrity_check     → ok
PRAGMA foreign_key_check   → (empty = aucune violation)
```

### 6.3 Tables interaction (héritage V1.11)

```
interaction_templates  : 1 row
interaction_responses  : 5 rows
```

### 6.4 14 routes interaction-* HTTP 401 (auth strict, héritage V1.11)

---

## 7. Anti-régression strict vérifié

| Module | Statut |
|---|:---:|
| Backend / import / merge / `custom_fields_json` | ✅ ZERO modification |
| Pipeline Live > Info (V1.11.2) | ✅ INTACT (composant mutualisé) |
| Bloc Coordonnées CrmTab (firstname/phone/email/etc.) | ✅ INTACT |
| Bloc Champs personnalisés CrmTab (édition via defs) | ✅ INTACT |
| Textarea Notes | ✅ INTACT |
| 8 onglets fiche CRM (Info & Notes / 💬 Messages / SMS / RDV / Appels / 📎 Docs / 📋 Suivi / 📋 Modèles + Partage conditionnel) | ✅ INTACTS et plus aucun crash |
| FicheReportingBlock | ✅ INTACT |
| Onglet "📋 Modèles" V1.11 P5 | ✅ INTACT |
| Leads V1.10.6.1 / V1.10.5 | ✅ INTACTS |

---

## 8. Workflow 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1-3 | TEST / FIX / RE-TEST | ✅ MH valide 4/4 |
| 4 | DEPLOY | ✅ bundle pré-validation déjà LIVE |
| 5 | Healthcheck | ✅ uptime 7m, integrity ok |
| 6 | COMMIT | ✅ `f1e0f0b3` (CrmTab.jsx — 4 insertions) |
| 7 | PUSH | ✅ origin/clean-main |
| 8 | MERGE | N/A |
| 9 | TAG | ✅ `v1.11.3-fiche-crm-sync` |
| 10 | BACKUP VPS | ✅ tarball md5 `265aee95d4255393e07f68591533cbb4` |
| 11 | SECURITY check | ✅ integrity + FK + 14 routes 401 + companyId stricte |
| 12 | HANDOFF + MEMORY | ✅ ce doc + memory `project_v1112_v1113_contact_info_enriched.md` |

---

## 9. Backups VPS

| Fichier | md5 | Contenu |
|---|---|---|
| pre `CrmTab.jsx.pre-v1113-fix-20260429-220000` | (sur VPS) | rollback rapide |
| **`v1113-fiche-crm-sync-20260430.tar.gz`** | **`265aee95d4255393e07f68591533cbb4`** | CrmTab + ContactInfoEnriched + bundle |

Backups V1.11 cumulés (référence) :
- `v111-stable-20260429.tar.gz` md5 `38bb2607` (snapshot global V1.11)
- `v1112-fiche-info-enriched-20260429.tar.gz` md5 `402ac94f`
- `v1113-fiche-crm-sync-20260430.tar.gz` md5 `265aee95`

---

## 10. Bundle live

`https://calendar360.fr/assets/index-DCc_cymf.js`

---

## 11. Tags Git V1.11 cumulés (10)

```
v1.11-phase1-rules           (94944c48)
v1.11-phase2-db-schema       (3b597146)
v1.11-phase3-backend         (86244942)
v1.11-phase4-ui-pipeline     (c95edd21)
v1.11-phase4-validated       (a11c99ba)
v1.11-phase5-ui-fiche        (a3372663)
v1.11-phase5-ux              (920ef032)
v1.11-stable                 (6f6fe65b)
v1.11.2-fiche-info-enriched  (36428406)
v1.11.3-fiche-crm-sync       (f1e0f0b3) ← VERROU FINAL
```

---

## 12. Reprise nouvelle session

1. Lire MEMORY.md (auto-loaded)
2. Lire ce HANDOFF en priorité
3. État runtime stable, aucune action urgente
4. Prochain chantier annoncé MH : **Outlook Calendar integration** (même logique que Google Calendar)
5. Anomalie héritée DB fantôme `server/calendar360.db` repo public toujours en attente décision MH (cf [AUDIT-DB-FANTOM-PLAN-2026-04-29.md](AUDIT-DB-FANTOM-PLAN-2026-04-29.md) §1bis)

---

**V1.11.3 verrouillé. Fiche CRM 100% synchronisée avec Pipeline Live. Aucune dette technique introduite.**
