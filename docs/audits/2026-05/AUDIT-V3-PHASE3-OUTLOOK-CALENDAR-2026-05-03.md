# AUDIT V3 — PHASE 3 Outlook Calendar (READ-ONLY)

> **Date** : 2026-05-03
> **Demandeur** : MH
> **Type** : audit READ-ONLY actualisé (post-V2.2.c)
> **Statut** : ✅ STOP après audit — aucune ligne de code
> **Source** : `clean-main` HEAD `1260869b`, post-PHASE 2 V2 contacts/doublons clôturée
> **Pré-requis** : aucun (sauf inputs MH §11)

---

## 0. RAPPORT À L'AUDIT ANTÉRIEUR — état **actualisé 2026-05-03**

📌 **Cet audit V3 ré-utilise et actualise** l'audit antérieur :
[AUDIT-OUTLOOK-CALENDAR-2026-04-30.md](AUDIT-OUTLOOK-CALENDAR-2026-04-30.md) (474 lignes)

Le diagnostic technique de cet audit reste **valide à 95%**. Les 5% qui ont changé :

| Item | Audit 2026-04-30 | Actualisé 2026-05-03 |
|---|---|---|
| **Phase 0 prérequis — gap repo↔VPS Google** | 🔴 BLOCKER | 🟢 ✅ **RÉSOLU** : 4 fichiers Google rapatriés (Phase 0ter Lot 1 livré 2026-04-30) |
| **Repo Google sync VPS** | ❌ ABSENT en local | ✅ md5 100% identique VPS↔local (`ec8636c4`, `ed2bcac8`, `cf02268d`, `8326e60b`, bookings.js `b804f93b`) |
| **PHASE 2 V2 contacts/doublons** | non démarrée | ✅ **CLÔTURÉE** (V2.1 → V2.2.c, 5 tags livrés sur 2026-05-03) |
| **Tag base de départ** | `pre-outlook-integration-2026-04-30` (pas créé) | HEAD actuel `1260869b` (post-V2.2.c) |
| **Référence schéma DB Google** | théorique | ✅ vérifié en DB live (4 cols `collaborators` + table `google_events` + 4 events live + 2 collabs connectés Guillaume/Jordan) |
| **Estimation Phase 0** | 0.5 j | **0 j** (déjà fait) |
| **Estimation totale** | ~8.5 j | **~8 j** |

→ **Tout le reste du diagnostic technique de l'audit 2026-04-30 demeure source de vérité**. Sections §1 à §13 valides en l'état. Cet audit V3 = **actualisation incrémentale** (nouvelle base de départ post-V2.2.c, vérifications terrain refaites, décisions Q1-Q9 redemandées car GO MH explicite requis pour relancer).

---

## 1. ÉTAT TERRAIN — vérifications 2026-05-03

### 1.1 Sync repo↔VPS Google (Phase 0 prérequis ✅ acquis)

```
                                Repo local      VPS prod        match
services/googleCalendar.js     ec8636c4...     ec8636c4...      ✅
services/googleChat.js         ed2bcac8...     ed2bcac8...      ✅
services/googleTasks.js        cf02268d...     cf02268d...      ✅
routes/google.js               8326e60b...     8326e60b...      ✅
routes/bookings.js             b804f93b...     b804f93b...      ✅
```

→ **Phase 0 audit 2026-04-30 § "rapatriement obligatoire" = ACQUIS**. Aucune action prérequis.

### 1.2 Schema DB Google (vérifié live VPS sqlite3)

**Colonnes `collaborators`** :
```
google_tokens_json     (TEXT — JSON {access_token, refresh_token, expiry_date, ...})
google_email           (TEXT)
google_last_sync       (TEXT — ISO)
google_events_private  (INTEGER DEFAULT 1)
```

**Table `google_events`** : présente, indexée `idx_google_events_collab (collaboratorId, startTime)`.

**État data live (2026-05-03)** : 4 events Google synchronisés actuellement, 2 collabs connectés (Guillaume + Jordan).

### 1.3 Schema Outlook — **TOTALEMENT ABSENT**

```
collaborators (cols outlook_*)  → ABSENT
table outlook_events            → ABSENT
bookings.outlookEventId         → ABSENT
services/outlookCalendar.js     → ABSENT
routes/outlook.js               → ABSENT
ENV vars OUTLOOK_*              → ABSENT
```

### 1.4 Branchement conflit actuel ([checkBookingConflict.js:54-83](server/services/bookings/checkBookingConflict.js#L54-L83))

```
1. Scan bookings confirmés (collaboratorId+date) → conflict source='booking'
2. Scan google_events (allDay=0, startTime in range) → conflict source='google'
3. PAS de scan outlook_events (à ajouter Phase 2)
4. Retourne premier conflit
```

→ **Pattern stable**. Phase 2 Outlook = ajouter scan symétrique 3e bloc avec `source='outlook'`.

---

## 2. ARCHITECTURE CIBLE — référence audit 2026-04-30 §9

```
┌─────────────────── COLLABORATEUR (1) ────────────────────────┐
│  google_tokens_json     outlook_tokens_json     ← NEW Phase 1│
│  google_email           outlook_email                         │
│  google_last_sync       outlook_last_sync                     │
│  google_events_private  outlook_events_private                │
└────────┬─────────────────────┬───────────────────────────────┘
         │                     │
   ┌─────▼─────┐         ┌─────▼──────┐
   │ google_   │         │ outlook_   │ ← NEW Phase 1
   │ events    │         │ events     │
   └─────┬─────┘         └─────┬──────┘
         │                     │
         └──────────┬──────────┘
                    ▼
       checkBookingConflict() — 3 scans
       ┌────────────────────────────────┐
       │ scan bookings (mono)           │
       │ scan google_events             │
       │ scan outlook_events  ← Phase 2 │
       │ retourne premier conflit       │
       └────────────────────────────────┘
                    │
                    ▼
            POST /api/bookings
       ┌────────────────────────────────────┐
       │ if (googleConnected) → push GCal   │
       │ if (outlookConnected) → push Outlook │ ← Phase 3
       │ stocke googleEventId + outlookEventId│
       └────────────────────────────────────┘
```

→ **Pattern miroir** (pas refacto unifiée). Détails complets dans audit 2026-04-30 §3-9.

---

## 3. POINTS DE BRANCHEMENT (8 emplacements — inchangés)

Détails identiques à audit 2026-04-30 §2 :

| # | Emplacement | Type modif |
|---|---|---|
| 1 | `server/services/outlookCalendar.js` | **CRÉER** miroir 9 fonctions de googleCalendar.js |
| 2 | `server/routes/outlook.js` | **CRÉER** 5 endpoints miroir |
| 3 | `server/index.js` | **MODIFIER** mount router + `/auth/outlook/callback` |
| 4 | `server/db/database.js` | **MODIFIER** ALTER `collaborators` + CREATE `outlook_events` + ALTER `bookings` |
| 5 | `server/services/bookings/checkBookingConflict.js` | **MODIFIER** ajout 3e scan symétrique |
| 6 | `server/routes/init.js` | **MODIFIER** SELECT outlook_events + masquage privé |
| 7 | `server/routes/bookings.js` | **MODIFIER** POST/PUT/DELETE → push Outlook en plus de Google |
| 8 | `app/src/features/collab/CollabPortal.jsx` | **MODIFIER** bloc UI "Connecter Outlook" sous Google + agrégation events |

**Hors-scope** : agenda layout général, prise de RDV UX, isolation companyId, Pipeline Live, fiche contact.

---

## 4. SCHEMA DB ADDITIF — référence audit 2026-04-30 §3

### 4.1 ALTER TABLE `collaborators` (4 nouvelles cols)

```sql
ALTER TABLE collaborators ADD COLUMN outlook_tokens_json TEXT;
ALTER TABLE collaborators ADD COLUMN outlook_email TEXT;
ALTER TABLE collaborators ADD COLUMN outlook_last_sync TEXT;
ALTER TABLE collaborators ADD COLUMN outlook_events_private INTEGER DEFAULT 1;
```

### 4.2 CREATE TABLE `outlook_events` (parallèle bit-à-bit `google_events`)

```sql
CREATE TABLE IF NOT EXISTS outlook_events (
  id TEXT PRIMARY KEY,                -- Microsoft Graph Event ID
  collaboratorId TEXT NOT NULL,
  summary TEXT,
  startTime TEXT NOT NULL,            -- ISO datetime UTC
  endTime TEXT NOT NULL,
  allDay INTEGER DEFAULT 0,
  status TEXT,                        -- 'confirmed' | 'cancelled' | 'tentative'
  transparency TEXT,                  -- 'free' → 'transparent', 'busy/oof/tentative/workingElsewhere' → 'opaque'
  FOREIGN KEY (collaboratorId) REFERENCES collaborators(id)
);
CREATE INDEX idx_outlook_events_collab ON outlook_events (collaboratorId, startTime);
```

### 4.3 ALTER TABLE `bookings` (1 col)

```sql
ALTER TABLE bookings ADD COLUMN outlookEventId TEXT;
```

→ **DDL strictement additive** (aucun DROP, aucune MUTATION). Pattern try/catch idempotent (cohérent V1.12.1).

---

## 5. AUTHENTIFICATION MICROSOFT GRAPH — référence audit 2026-04-30 §4-5

### 5.1 Flow OAuth (parité Google)

```
[Frontend Réglages collab]
   │ click "Connecter Outlook Calendar"
   ▼
GET /api/outlook/auth-url?collaboratorId=X    (requireAuth)
   │ → renvoie URL Microsoft OAuth (state=collabId, scopes)
   ▼
[Microsoft OAuth consent screen — login.microsoftonline.com]
   │ user accepte
   ▼
GET /auth/outlook/callback?code=&state=        (public, mount racine)
   │ échange code → tokens MSAL, stocke en DB
   ▼
[Redirect vers /collab?outlook=connected]
```

### 5.2 Scopes Microsoft Graph (delegated permissions)

| Scope | Rôle |
|---|---|
| `Calendars.ReadWrite` | Lecture + écriture events default calendar |
| `User.Read` | Récupérer email/profile (pour `outlook_email`) |
| `offline_access` | Refresh token (sinon expire 1h non-renouvelable) |

### 5.3 Lib Node recommandées

- `@azure/msal-node` (~1 Mo) — OAuth + token cache + refresh auto
- `@microsoft/microsoft-graph-client` (~1 Mo) — wrapper API Graph (events, users)

### 5.4 ENV vars (.env VPS)

```env
OUTLOOK_CLIENT_ID=<from Azure AD app registration>
OUTLOOK_CLIENT_SECRET=<from Azure AD app registration>
OUTLOOK_REDIRECT_URI=https://calendar360.fr/auth/outlook/callback
OUTLOOK_TENANT=common  # multi-tenant : perso + organisations
```

### 5.5 Setup Azure AD (action MH avant Phase 1)

1. https://portal.azure.com → Azure Active Directory → App registrations → New registration
2. Name : `Calendar360 Outlook Sync`
3. Supported account types : **Accounts in any organizational directory and personal Microsoft accounts** (multi-tenant)
4. Redirect URI : `https://calendar360.fr/auth/outlook/callback` (Web)
5. API permissions → Microsoft Graph → Delegated :
   - `Calendars.ReadWrite`
   - `User.Read`
   - `offline_access`
6. Certificates & secrets → New client secret → noter la valeur
7. Communiquer Client ID + Secret + Redirect URI → Claude pour `.env` VPS

→ **Sans cette étape, Phase 1 ne peut pas démarrer**.

---

## 6. SYNCHRONISATION — stratégie

### 6.1 Pull Outlook → Planora (`outlook_events`)

| Source événement | Mécanisme |
|---|---|
| Cron périodique 5 min | `[CRON OUTLOOK SYNC]` parallèle au `[CRON GCAL SYNC]` (cron isolé pour panne) |
| Bouton "Synchroniser" UI | Endpoint `POST /api/outlook/sync` (manuel) |
| Connexion initiale | Auto-sync immédiat après callback (parité Google) |

**Fenêtre temporelle** : 60 jours (parité Google audit 2026-04-30 §1.4).

**Optimisation V2** (hors V1) : delta sync via Microsoft Graph `delta` query token. Réduit drastiquement bandwidth + perf. Hors V1.

### 6.2 Push Planora → Outlook (booking → event)

Modifier `routes/bookings.js` :
- `POST /api/bookings` : si `outlookCalendar.isConnected(collabId)` → `outlookCalendar.createEvent()` → stocke `bookings.outlookEventId`
- `PUT /api/bookings/:id` : `updateEvent()`
- `DELETE /api/bookings/:id` : `deleteEvent()`

**Idempotence** : skip push si `bookings.outlookEventId` déjà rempli (évite doublons sur retry).

### 6.3 Mapping API Microsoft Graph → schéma DB

| Champ Microsoft Graph | Champ DB | Notes |
|---|---|---|
| `id` | `id` | string immuable |
| `subject` | `summary` | titre événement |
| `start.dateTime` + `start.timeZone` | `startTime` (ISO UTC) | conversion via Luxon |
| `end.dateTime` + `end.timeZone` | `endTime` | idem |
| `isAllDay` | `allDay` | boolean → 0/1 |
| `showAs` | `transparency` | `free` → `transparent`, autres → `opaque` |
| `isCancelled` ou `responseStatus.response='declined'` | `status` | → `cancelled`, sinon `confirmed` |

---

## 7. GESTION DES CONFLITS AGENDA

### 7.1 Branchement `checkBookingConflict.js` Phase 2

Logique **strictement additive** :

```
1. Scan bookings (existant)            → source='booking'
2. Scan google_events (existant)       → source='google'
3. Scan outlook_events (NEW Phase 2)   → source='outlook'    ← AJOUT 30 lignes
4. Retourne premier conflit
```

**Test régression critique** : conflits Google doivent retourner `source='google'` exactement comme avant. Toute modification du bloc Google (lignes 60-83) = NON. Ajout strict en bloc 3.

### 7.2 Disponibilité fusionnée (frontend)

```
disponibilité réelle = (collab availabilities)
                     - (planora bookings)
                     - (google_events opaque)
                     - (outlook_events opaque)    ← NEW Phase 4
```

Frontend Phase 4 :
- Agréger `myGoogleEvents + myOutlookEvents` dans `isAvailableSlot()` ([CollabPortal.jsx:2438](app/src/features/collab/CollabPortal.jsx#L2438))
- Reco audit 2026-04-30 Q8 : créer fonction parallèle `getOutlookEventAt()` (zéro impact existant `getGoogleEventAt`)

---

## 8. PLAN PAR PHASES — actualisé

| Phase | Périmètre | Effort | État après livraison |
|---|---|:---:|---|
| ~~**Phase 0**~~ | ~~Rapatriement Google~~ | ~~0.5 j~~ | ✅ **DÉJÀ FAIT** |
| **Phase 1** | Backend service outlookCalendar.js + routes (5) + DDL | 2 j | curl 5 endpoints → tokens en DB + 1 event sync. Aucune UI. **0 impact prod**. |
| **Phase 2** | Branchement conflits (3e scan checkBookingConflict + init.js) | 1 j | event Outlook bloque créneau RDV (backend). Frontend inchangé. **0 impact UX**. |
| **Phase 3** | Push bookings → Outlook (POST/PUT/DELETE) | 1 j | RDV Calendar360 propagé Google + Outlook. **0 impact UI**. |
| **Phase 4** | Frontend Réglages collab UI | 1.5 j | UI Réglages 2 blocs (Google + Outlook). Connexion fonctionnelle. **Mode dégradé : si Outlook KO, Google continue**. |
| **Phase 5** | Cron sync Outlook séparé | 0.5 j | pull GCal + pull Outlook tournent en parallèle. |
| **Phase 6** | Affichage events Outlook agenda 4 vues | 1 j | parité visuelle Google ↔ Outlook. |
| **Tests + finitions** | Tests régression + audit MH 12/12 | 1 j | tag final `v3.0.0-outlook-stable`. |
| **Total** | | **~8 j** | feature complète shippable. |

**Reco découpage** : 1 phase par cycle workflow strict 17 étapes, validation MH entre chaque. Permet rollback isolé si KO.

---

## 9. RISQUES — référence audit 2026-04-30 §8 + actualisations

| # | Risque | Sévérité | Mitigation |
|---:|---|:---:|---|
| ~~R1~~ | ~~Gap repo↔VPS Google~~ | ~~🔴~~ | ✅ **RÉSOLU** (Phase 0ter Lot 1) |
| **R2** | Régression Google par modif `checkBookingConflict.js` Phase 2 | 🔴 | Tests régression Phase 2 + scan `google_events` strictement préservé bloc 2 |
| **R3** | Microsoft Graph API rate limits (10k req / 10 min / app) | 🟡 | Cron 5 min OK pour 50 collabs ; à monitorer si scale |
| **R4** | Refresh token Microsoft expire 90j inactivité | 🟡 | UI "Token expiré → Reconnecter" (parité Google) |
| **R5** | Timezone Microsoft Graph (Windows tz vs IANA) | 🟡 | `@microsoft/microsoft-graph-client` gère ; tester collab fuseau non-Paris |
| **R6** | `showAs='oof'` interprétation : bloque ? | 🟢 | Reco : `oof` → `opaque` (parité busy). Q2 §11. |
| **R7** | Multi-calendar par compte Outlook (perso + pro) | 🟢 | V1 default uniquement (parité Google). Multi-cal = V2. Q3 §11. |
| **R8** | Frontend state explosion (Google + Outlook) | 🟢 | Approche miroir limite à 2 jeux. Pas d'abstraction immédiate. |
| **R9** | Conflit `/auth/outlook/callback` route | 🟢 | Pattern racine identique Google, aucun conflit. |
| **R10** | Companion services Microsoft (Teams, To Do) | 🟢 | **Hors V1**. Q7 §11. |
| **R11** | Révocation externe Outlook (côté Microsoft) | 🟡 | API 401 → catch service → marquer `outlook_tokens_json=NULL` + UI "Non connecté" |
| **R12** | Migration DB ALTER TABLE prod live | 🟢 | SQLite ALTER ADD COLUMN atomique sans downtime. Pattern V1.12.1 éprouvé. |
| **R13** ✨ | **Régression Reporting V1.11.4 / V1.11.5 / V1.12.x** (filtres `'perdu'`/`archivedAt`) | 🟡 | Phase 2 ajout `outlook_events` ne touche pas les filtres existants. Test smoke à inclure. |
| **R14** ✨ | **Conflit DuplicateOnCreateModal V2.1.b / MergeContactsModal V1.13.2.b post-Outlook** | 🟢 | Outlook = agenda only, n'impacte pas le flux contact. **0 risque** sur PHASE 2 V2 clôturée. |

→ R13 + R14 nouveaux car PHASE 2 V2 livrée depuis l'audit antérieur. Mitigations confirmées safe.

---

## 10. TESTS — référence audit 2026-04-30 §7

12 tests fonctionnels MH (T1-T12) + non-régression critique. Détails inchangés. Voir audit 2026-04-30 §7.1-7.3.

**Ajouts V3 actualisés** :
- T13 ✨ : créer RDV avec collab connecté Outlook → vérifier que le contact créé via DuplicateOnCreateModal (V2.1.b) → booking propagé Outlook OK
- T14 ✨ : Régression V2.2.c DuplicatesPanel admin → toujours fonctionnel (pas d'impact agenda)

---

## 11. DÉCISIONS À TRANCHER PAR MH (Q1-Q9 — re-validation requise)

Identiques à audit 2026-04-30 §11. **Re-validation MH explicite requise** car :
- Temps écoulé depuis 2026-04-30 (3 jours)
- Contexte évolué (PHASE 2 V2 contacts/doublons clôturée)
- Workflow strict 17 étapes nécessite GO explicite à chaque cycle

| # | Question | Reco par défaut |
|---:|---|---|
| Q1 | Approche miroir vs unifiée (`external_calendar_events`) ? | **Miroir** (isolation risque) |
| Q2 | `showAs='oof'` (out of office) bloque ou non ? | **Bloque** (parité busy) |
| Q3 | Sync default calendar uniquement V1, ou multi-calendar ? | **Default uniquement V1** |
| Q4 | Style visuel events Outlook : badge `O` ? Couleur distincte ? | **Badge O + même couleur Google** |
| Q5 | Scope `Calendars.ReadWrite` vs `Calendars.ReadWrite.Shared` ? | **ReadWrite simple V1** |
| Q6 | Cron Outlook séparé ou fusionné Google ? | **Séparé** (isolation panne) |
| Q7 | Companion Microsoft (Teams, To Do) hors V1 ? | **OUT V1** |
| Q8 | Frontend : alias rétrocompat ou parallèle `getOutlookEventAt` ? | **Parallèle** (zéro impact existant) |
| Q9 | Hard delete events Outlook si collab quitte boîte ? | **Oui** (parité Google `disconnectGoogle` cleanup) |

**+ Q10 ✨ NEW** : démarrage immédiat Phase 1 ou attendre setup Azure AD MH ?

| Option | |
|---|---|
| **A** Stop strict tant que MH n'a pas créé app Azure AD + transmis Client ID/Secret | reco Claude — sinon Phase 1 bloquée à mi-parcours |
| **B** Démarrer scaffolding service avec credentials placeholder, swap au moment du test | risqué (dépendance externe non vérifiée) |

**Reco** : **A**.

---

## 12. CONFORMITÉ CONTRAINTES MH

| Contrainte | Respect |
|---|:---:|
| Audit READ-ONLY complet | ✅ ce doc + audit 2026-04-30 |
| STOP après audit, aucune ligne de code | ✅ |
| Pas de refonte agenda | ✅ approche miroir, pas refacto |
| Préserver Google existant | ✅ DDL additive, scan additif, push additif |
| Plan par phases shippables | ✅ 6 phases (sans Phase 0 résolu) |
| Estimation chiffrée | ✅ ~8 jours total |
| Risques + mitigations | ✅ §9 (R2-R14) |
| Décisions ouvertes | ✅ Q1-Q10 |
| Préserver V2.x PHASE 2 contacts/doublons | ✅ Outlook agenda-only, 0 impact |

---

## 13. ✅ STOP — Aucune ligne de code écrite

Audit V3 PHASE 3 Outlook Calendar terminé. Aucune modification effectuée.

**Prochaine étape attendue** :
1. **MH valide les 10 décisions Q1-Q10** (re-validation des 9 + Q10 NEW timing)
2. **MH crée l'app Azure AD** + transmet Client ID + Secret (sinon Phase 1 bloquée)
3. **GO MH explicite Phase 1** — patch dans l'ordre :
   1. ENV vars VPS
   2. NEW `services/outlookCalendar.js` (miroir 9 fonctions)
   3. NEW `routes/outlook.js` (5 endpoints)
   4. MODIFY `index.js` (mount + callback racine)
   5. MODIFY `db/database.js` (DDL additive)
4. Workflow strict 17 étapes par phase
5. Validation MH entre chaque phase

**Aucune action sans GO MH explicite.**

---

## 14. RÉFÉRENCE — sources de vérité

### Code lu (vérification 2026-05-03)

- [`server/services/bookings/checkBookingConflict.js`](server/services/bookings/checkBookingConflict.js) — pattern conflict 2 scans actuels
- [`server/db/database.js:262-263, 386-403`](server/db/database.js#L262-L403) — schema Google
- [`server/services/googleCalendar.js`](server/services/googleCalendar.js) — référence à mirrorer (md5 `ec8636c4`)
- [`server/routes/google.js`](server/routes/google.js) — référence routes (md5 `8326e60b`)
- [`server/routes/bookings.js`](server/routes/bookings.js) — point d'injection push (md5 `b804f93b`)
- VPS prod sqlite3 — schema cols + tables + data live (4 google_events, 2 collabs connectés)

### Audits antérieurs

- [AUDIT-OUTLOOK-CALENDAR-2026-04-30.md](AUDIT-OUTLOOK-CALENDAR-2026-04-30.md) (474 lignes) — **source primaire technique**, valide à 95%
- [HANDOFF-V2.2.c-UI-ADMINDASH-DOUBLONS.md](HANDOFF-V2.2.c-UI-ADMINDASH-DOUBLONS.md) — clôture PHASE 2 V2 (état départ Phase 3)
- [docs/audits/2026-05/AUDIT-V2.2.c-UI-ADMINDASH-DOUBLONS-2026-05-03.md](docs/audits/2026-05/AUDIT-V2.2.c-UI-ADMINDASH-DOUBLONS-2026-05-03.md)

### Memory rules

- `feedback_phase_workflow_17_steps.md`
- `feedback_code_no_root_file_piling.md`
- `feedback_deploy_process_strict_12_steps.md`

### Repo

- HEAD `1260869b` (clean-main) — post-V2.2.c
- Tag dernier livré : `v2.2.c-ui-admindash-doublons`
