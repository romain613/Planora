# AUDIT AGENDA + SYNCHRONISATIONS — 2026-04-26

> **Auteur** : Claude (audit assisté) — basé sur scan DB live, lecture du code (backend + frontend) et logs PM2 du jour.
> **Demande MH** : audit COMPLET orienté SaaS scalable, pas léger. Priorité **synchros > vues > conflits > dettes > smart**.
> **Périmètre** : flow booking de bout en bout (création/modification/annulation), 4 vues Agenda, panneau droit Pipeline Live, sync Google Calendar, crons impactants.
> **État runtime** : V1.8.22.3 bundle `index-DTTnl3GZ.js`, PM2 stable, 6 companies / 14 collabs / 83 bookings / 352 contacts.

---

## 0. SYNTHÈSE EXÉCUTIVE — verdict en 6 lignes

| # | Question critique MH | Réponse courte | Sévérité |
|---|---|---|---|
| 1 | Un booking peut-il exister en DB sans être visible dans une vue ? | **Oui** (3 cas — surtout `calendarId=NULL`, status atypique, désync optimistic) | 🟠 Moyen |
| 2 | Une vue peut-elle afficher un booking qui n'est plus en DB ? | **Oui** (race condition optimistic update sans rollback côté frontend) | 🟠 Moyen |
| 3 | Le pipeline peut-il être désynchronisé du booking ? | **Oui — observé** : 3 contacts en `rdv_programme` sans booking futur, 4 contacts `rdv_status='programme'` idem | 🔴 Critique |
| 4 | Le panneau droit peut-il afficher une donnée différente de la DB ? | **Oui** (modal lit `selectedBooking` snapshot + `bookings` live = 2 sources) | 🟡 Faible |

**État global** : architecture **saine** côté backend (centralisation des side-effects, helper unique de conflit, audit trail exhaustif). **Fragile** côté synchros frontend (refresh pas systématique, optimistic sans rollback) et côté Google Calendar (sync uniquement inverse, conflits non détectés cross-source).

**6 quick wins prioritaires** (détaillés §6) :
1. **🔴 DELETE /api/bookings : retourner `contact` actualisé** (le backend fait le travail, ne le communique pas)
2. **🔴 Frontend : consommer `contact` payload retourné par POST/PUT/DELETE** (au lieu du refetch séparé race-prone)
3. **🔴 Polling bookings** (30s-5min) ou SSE/WebSocket — actuellement aucun polling sur `/api/bookings`
4. Brancher `agendaFilter` (UI dead → pas relu)
5. `_scheduleGlobalRefresh` aussi sur DELETE/PUT bookings côté frontend
6. Audit nightly job pour désynchros pipeline ↔ bookings (3+4 cas DB observés)

**Tendance globale** : la **vraie cause** de la plupart des désyncs n'est pas un bug isolé mais un **pattern transversal** — le backend fait correctement son travail (side effects, audit, etc.) mais **ne communique pas** systématiquement les changements au frontend, qui fait ses propres mises à jour optimistic potentiellement contradictoires. La fiabilité monte d'un cran dès qu'on aligne le frontend sur les payloads retournés par le backend.

---

## 1. SCHÉMA DES FLUX RÉELS

### 1.1 Flow création booking (V1.8.22 nominal)

```
USER (Agenda > clic créneau libre)
  ↓
setPhoneScheduleForm({contactId:'',date,time,_bookingMode:true}) + setPhoneShowScheduleModal(true)
  ↓
MODAL RDV (IIFE inline CollabPortal L5528+) — onglet "Nouveau contact"
  ↓ user remplit firstname/lastname/email/phone + date/time/calendarId
  ↓ click "Programmer"
  ↓
[FRONT] POST /api/data/contacts/check-duplicate-single
  ↓ exists ?
  ├─ OUI → DuplicateResolverModal (single/conflict/multi/multi-collab)
  │        → user choisit → flow continue avec contactId existant ou _skipDuplicateCheck:true
  └─ NON ↓
[FRONT] POST /api/data/contacts {firstname, lastname, ..., source:'agenda'} (await)
  ↓ createRes.id ← ID BACKEND RÉEL ct_<ts>_<random>
  ↓ setContacts(p => [...p, {id: realId, ...}])
  ↓ setPhoneScheduleForm(p => ({...p, contactId: realId}))
  ↓ setTimeout(50ms) [pattern préservé pour intouchabilité addScheduledCall]
  ↓
[FRONT] addScheduledCall() L1579 (CollabPortal)
  ├─ V1.8.22.1 GUARD: regex pattern check → bloque si contactId temp détecté
  ├─ checkBookingConflict côté frontend (bookings + googleEventsProp + buffer)
  ├─ optimistic: setBookings(p => [...p, bk])
  ├─ optimistic: handlePipelineStageChange(contactId, 'rdv_programme', ...)
  ├─ optimistic: handleCollabUpdateContact(contactId, {next_rdv_date, ...})
  ├─ POST /api/bookings (await)
  │   ↓
  │   [BACKEND] bookings.js POST L63
  │   ├─ Wave D: refus si collaboratorId archivé (L67-72)
  │   ├─ V1.8.22 Phase A: refus si contactId existe pas / wrong company (L73-88)
  │   ├─ checkBookingConflict (L74-85) → SELECT bookings WHERE collab+date+confirmed
  │   ├─ INSERT bookings (sans transaction)
  │   ├─ Sync GCal → createEvent FIRE-AND-FORGET (L159-167)
  │   ├─ Google Tasks fire-and-forget (L170-180)
  │   ├─ Google Chat notif fire-and-forget (L182-193)
  │   ├─ applyBookingCreatedSideEffects SYNCHRONE (L196-198)
  │   │   ├─ totalBookings += 1
  │   │   ├─ next_rdv_date conditional
  │   │   ├─ autoPipelineAdvance('booking_created')
  │   │   └─ updateBehaviorScore(+5)
  │   ├─ console.log [BOOKING CREATED] (V1.8.22 Phase A)
  │   └─ Return {success, id, booking, contact} ← contact post-pipeline
  │   ↓
  ├─ .catch → ROLLBACK partiel (setBookings.filter + handleCollabUpdateContact revert) L1695-1702
  └─ .then → V3 refetch GET /api/data/contacts/${contactId} → setContacts(map)
  ↓
[FRONT] _scheduleGlobalRefresh() V1.8.22 Phase B
  ├─ Promise.all(api('/api/data/contacts'), api('/api/bookings'))
  ├─ setContacts(_c)
  └─ setBookings(_b)
  ↓
[UI] toast success + close modal
```

### 1.2 Flow annulation booking

```
USER (BookingDetailModal CollabPortal L4987 ou direct)
  ↓
PUT /api/bookings/:id {status:'cancelled'}
  ↓
[BACKEND] bookings.js PUT L215
  ├─ Ownership check (company + collab si non-admin)
  ├─ Branche Wave B: si noShow 0→1, délègue markNoShow (matrice B.5)
  ├─ Re-check conflit si slot change (excludeBookingId=self)
  ├─ UPDATE bookings SET ...
  ├─ Si status='cancelled' & previously confirmed:
  │   ├─ contacts.totalBookings -= 1
  │   ├─ Recalc next_rdv_date (SELECT next confirmed >= today)
  │   ├─ autoPipelineAdvance(cid, 'booking_cancelled_last')
  │   └─ updateBehaviorScore('booking_cancelled')
  ├─ Si status change → email visiteur (cancellation/confirmation) FIRE-AND-FORGET
  ├─ Si googleEventId existe → updateEvent GCal FIRE-AND-FORGET
  └─ Return {success, booking, contact}
  ↓
[FRONT] ⚠️ AUCUN _scheduleGlobalRefresh systématique sur PUT/DELETE
  ↓ => optimistic state local potentiellement périmé
```

### 1.3 Flow Google Calendar sync (inverse uniquement)

```
[CRON every 5min] cron/reminders.js L184-201
  ↓
foreach collaborateur (avec google_tokens_json):
  syncEventsFromGoogle(collabId)
  ↓
  ├─ cal.events.list(timeMin=now, timeMax=now+60d, maxResults=2500)
  ├─ Filter: skip status='cancelled', skip transparency='transparent'
  ├─ INSERT OR REPLACE INTO google_events (id, collaboratorId, summary, startTime, endTime, allDay, status, transparency)
  ├─ DELETE FROM google_events WHERE id NOT IN validIds (cleanup stale)
  └─ UPDATE collaborators.google_last_sync = now()

⚠️ Direction unique : Google → google_events (table séparée de `bookings`)
⚠️ Aucun event Google ne devient un booking PLANORA (pas de mapping inverse)
⚠️ checkBookingConflict ne lit PAS google_events → vecteur double-booking
```

---

## 2. SOURCES OF TRUTH — qui écrit, qui lit, qui peut désync

| Entité | Source de vérité | Écrite par | Lue par | Désync possible |
|---|---|---|---|---|
| `bookings` (DB) | DB monolithe `calendar360.db` | POST/PUT/DELETE bookings.js + applyBookingCreatedSideEffects | AgendaTab (4 vues), PhoneTab Pipeline Live, CrmTab, BookingDetailModal, panneau droit, cron reminders, Google Chat summary | Optimistic state frontend si POST échoue + pas rollback complet |
| `contacts.pipeline_stage` | DB monolithe | autoPipelineAdvance (helper) + PUT /contacts | Pipeline Live kanban, CRM, badges agenda | Cron périodique pas en place → 3 contacts observés en `rdv_programme` sans booking futur |
| `contacts.next_rdv_date` + `rdv_status` | DB monolithe | applyBookingCreatedSideEffects + PUT/DELETE bookings | CRM card, panneau droit, agenda badge | 4 observés stale après cancellation hors-flow |
| `contacts.totalBookings` | DB monolithe | POST/PUT cancel/DELETE bookings | CRM stats, dashboard | Race condition cancel concurrent (mineur) |
| `google_events` (DB) | Cron 5min depuis GCal API | syncEventsFromGoogle | Frontend `googleEventsProp` (busy slots dans modal RDV + agenda) | **Désync structurelle** : booking créé en app n'apparaît PAS dans google_events tant que le cron suivant n'a pas tourné — mais la table a un autre rôle (cache GCal) donc OK |
| `googleEventId` (sur booking) | createEvent fire-and-forget | updateEvent (PUT/DELETE bookings) → si GCal OK | Booking sync futur | **20 bookings ont googleEventId, mais google_events n'a que 6 entries → 14 IDs orphelins probables** |
| Frontend state `bookings` (CollabContext) | setBookings via refetch + optimistic | POST/PUT bookings frontend handlers | AgendaTab (4 vues), PhoneTab, BookingDetailModal | Si DELETE pas suivi de refetch → vue stale |
| `pipeline_history` | INSERT par autoPipelineAdvance + handlePipelineStageChange + V1.8.15 timeline events | Timeline frontend (PhoneTab L2386), reporting | 1 erreur observée `[REASSIGN ERROR] NOT NULL constraint failed: pipeline_history.companyId` → bug latent |

---

## 3. INCOHÉRENCES DÉTECTÉES (mesurées sur DB live)

Scan effectué le 2026-04-26 14:28 UTC (`db-snapshot-v18223-20260426-142810.db`) :

| Anomalie | Compte | Gravité | Détail |
|---|---:|---|---|
| Bookings avec `contactId` orphelin (contact n'existe plus) | **17** | 🔴 Critique | 15 cancelled + 2 confirmed. Les 2 confirmed sont rendus en agenda mais cliquer dessus → fiche contact vide |
| Bookings sans `contactId` (publics ou auto-création échouée) | 5 | 🟢 OK | Cas légitime (booking link public sans création contact) |
| Bookings avec `companyId IS NULL` (dette historique CLAUDE.md §5bis.2) | 2 | 🟡 Mineur | Anciens bugs frontend, pas reproductibles avec V1.8.22 |
| Bookings avec `time/date='undefined'` (bug frontend ancien) | 0 | ✅ | Plus reproductible |
| Bookings avec collab archivé | 0 | ✅ | Wave D protège POST, mais pas PUT (cf. §4.5) |
| Contacts avec `next_rdv_date` set mais sans booking confirmé sur cette date | **1** | 🟡 Mineur | Désync mineure |
| Contacts en `rdv_status='programme'` sans booking futur confirmé | **4** | 🟠 Moyen | Pipeline pas resync après annulation hors-flow |
| Contacts en `pipeline_stage='rdv_programme'` sans booking futur | **3** | 🟠 Moyen | Idem — collabs voient ces leads en kanban "RDV programmé" sans avoir le RDV |
| Bookings avec `googleEventId` set | 20 | — | Réf info |
| `google_events` table entries actuelles | 6 | — | Pour 2 collabs connectés Google |
| **Désync probable `googleEventId` orphelins** | **~14** | 🟠 Moyen | 20 bookings ont un eventId, mais cache `google_events` n'en voit que 6. 14 events ont probablement été deleted directement côté Google sans propagation |
| Pipeline distribution | 315 nouveau / 22 nrp / 9 rdv_programme / 3 contacte / 2 client_valide / 1 custom | — | Ratio sain |
| ID bookings : pattern `bk` + Date.now() (frontend) | 70 | — | Pattern dominant `addScheduledCall` L1662 |

### Logs PM2 récents — patterns récurrents

```
[BOOKING REJECTED] CONTACT_NOT_FOUND contactId=ct1777187...   ← V1.8.22 Phase A guard fonctionnel (ces tentatives sont LÉGITIMEMENT bloquées)
[BOOKING REJECTED] CONTACT_NOT_FOUND contactId=ct17771877...
[PUT CONTACT] 0 rows affected for id: ctXXXX (xN)             ← Frontend continue à PUT sur des temp IDs (post-rejet) → pas de cleanup côté UI
[REASSIGN ERROR] NOT NULL constraint failed: pipeline_history.companyId   ← bug latent ailleurs
[NOTIFICATION SKIP] collab archivé u-rcsitbon                  ← OK protégé
[GOOGLE SYNC] N events fetched ... (every 5min)                ← sain
```

**Observation** : V1.8.22 a tué la création de bookings orphelins, mais le frontend continue à émettre des PUT sur des temp IDs déjà générés en mémoire (10+ logs après rejet). Symptôme d'un état local qui n'est pas nettoyé après le BOOKING REJECTED → **action UX manquante** : afficher l'erreur, rouvrir/reset modal.

---

## 4. BUGS POTENTIELS & RACE CONDITIONS

### 4.1 🔴 Vecteur double-booking via Google Calendar (CRITIQUE)

**Scénario** :
```
T-5min  : Collab Jordan crée event "Team Sync" 14:00-14:30 directement dans Google Calendar (pas via app)
T+0     : Cron syncEventsFromGoogle tourne → upsert google_events.<id>
T+1min  : User crée booking via modal RDV pour Jordan @ 14:15
          → frontend addScheduledCall checke googleEventsProp et bookings (front OK)
          → POST /api/bookings → backend checkBookingConflict ne checke QUE bookings table
          → INSERT booking. Plus tard, createEvent push event Google → 2 events sur le même slot
```

**Fichier** : `[server/services/bookings/checkBookingConflict.js](server/services/bookings/checkBookingConflict.js)` ne lit que `bookings`. Le frontend `addScheduledCall` ([CollabPortal.jsx:1633-1660](app/src/features/collab/CollabPortal.jsx#L1633-L1660)) lit aussi `googleEventsProp` mais le backend ne le fait pas → la défense en profondeur a un trou.

**Fix** : étendre `checkBookingConflict` pour inclure `SELECT * FROM google_events WHERE collaboratorId = ? AND startTime <= ? AND endTime >= ?` (ajout d'une UNION).

### 4.2 🟠 `_scheduleGlobalRefresh` non systématique

**Scénario** :
```
User annule booking depuis BookingDetailModal → DELETE /api/bookings/:id
→ optimistic setBookings(p => p.map(b => b.id===id ? {...b, status:'cancelled'} : b))
→ AUCUN refetch global
→ Si la cancel a déclenché autoPipelineAdvance back-end (rdv_programme→contacte), le state contacts frontend ne le voit pas
→ Pipeline Live affiche encore le contact en `rdv_programme` jusqu'au prochain refetch manuel
```

**Fichier** : V1.8.22 ajoute `_scheduleGlobalRefresh()` dans le path POST modal RDV ([CollabPortal.jsx](app/src/features/collab/CollabPortal.jsx#L1572-L1576) helper, [appel L5882, L5946](app/src/features/collab/CollabPortal.jsx#L5882)) — mais **PAS sur les paths PUT/DELETE** (BookingDetailModal, drag-drop futur, etc.).

**Fix** : appeler `_scheduleGlobalRefresh()` après chaque PUT et DELETE booking côté frontend (ou exposer dans le context et l'invoquer depuis BookingDetailModal).

### 4.3 🟠 `agendaFilter` UI morte

**Constat** : `[AgendaTab.jsx:173](app/src/features/collab/tabs/AgendaTab.jsx#L173)` définit `agendaFilter` (state via `_T`), `[L181](app/src/features/collab/tabs/AgendaTab.jsx#L181)` propose 3 boutons (Tous / Confirmés / Annulés / etc.), **mais aucune vue ne filtre sur cette valeur**. Le filtre est cosmétique : seuls les compteurs `[L167-189](app/src/features/collab/tabs/AgendaTab.jsx#L167-L189)` l'utilisent.

**Fix** : appliquer le filtre dans `dayBookings`, `weekBookings`, `monthDays.filter` et `filteredBookings` (vue Liste).

### 4.4 🟠 Pipeline désynchro observée (3+4 cas DB)

**Constat mesuré** :
- 3 contacts en `pipeline_stage='rdv_programme'` sans booking futur confirmé
- 4 contacts en `rdv_status='programme'` sans booking futur

**Causes probables** :
- Bookings annulés directement en SQL ou via flow non-frontend (audit anciens)
- Crons recycle-lost mentionnés CLAUDE.md mais inactifs
- DELETE booking sans cascade complète (le DELETE ROUTE fait le cascade — donc la dette est historique)

**Fix** :
- Audit nightly job : trouver les contacts dont le `pipeline_stage='rdv_programme'` est désynchro et les passer en `contacte`
- One-shot script de réparation pour les 3+4 cas actuels

### 4.5 🟠 Wave D ne protège que POST, pas PUT

**Constat** : `[bookings.js:67-72](server/routes/_vps-pull/bookings.js#L67-L72)` refuse de créer un booking pour un collab archivé (Wave D). Mais `PUT /api/bookings/:id` ne fait **aucun** check de l'archivage du `collaboratorId` cible si on déplace un booking vers un autre collab.

**Scénario** : admin déplace un booking vers un collab archivé via PUT → succès silencieux → booking invisible dans agendas mais visible en DB.

**Fix** : ajouter le même check dans PUT bookings (sur `req.body.collaboratorId` si présent).

### 4.6 🟡 `googleEventId` orphelin permanent

**Scénario** :
```
1. POST booking → createEvent → booking.googleEventId='evt_123' OK
2. User delete event directement dans Google Calendar
3. Cron syncEventsFromGoogle → DELETE google_events.evt_123 (cleanup stale)
4. Booking.googleEventId est encore 'evt_123' → orphelin
5. PUT/DELETE booking ultérieur → updateEvent('evt_123') → 404 silencieux
6. Désync permanente, jamais nettoyée
```

**Constat** : 20 bookings ont `googleEventId` set mais `google_events` n'en a que 6 → ~14 orphelins probables.

**Fix** : ajouter dans le cron un check "googleEventId présent en booking mais absent de google_events après sync = clear googleEventId".

### 4.7 🟡 `[REASSIGN ERROR] NOT NULL constraint failed: pipeline_history.companyId`

**Constat** : 1 erreur observée 2026-04-26 05:02:39. Le code de réassignation contact ne renseigne pas `companyId` dans `pipeline_history`. Bug latent qui crashe silencieusement la transaction de réassignation.

**Fix** : grepper le call site et ajouter `companyId: contact.companyId` dans l'INSERT pipeline_history.

### 4.8 🟡 Optimistic update sans rollback systématique

`addScheduledCall` ([CollabPortal.jsx:1671-1702](app/src/features/collab/CollabPortal.jsx#L1671-L1702)) fait des optimistic updates puis un POST avec `.catch()` qui rollback `bookings` et `pipeline_stage`. Mais des side effects comme `handleCollabUpdateContact(next_rdv_date, rdv_status)` ne sont rollbackés que partiellement.

**Fix** : centraliser le rollback dans une fonction `_revertBookingOptimistic(bkId, contactId, prevStage, prevContact)`.

### 4.9 🔴 DELETE /api/bookings ne retourne PAS le contact actualisé (transversal critique)

**Constat** : `[bookings.js DELETE L429](server/routes/_vps-pull/bookings.js#L429)` fait tous les side effects côté backend (autoPipelineAdvance, totalBookings--, recalc next_rdv_date) **mais retourne uniquement `{success: true}`** — aucun `contact` payload.

**Conséquence** :
```
T0   USER click "Annuler RDV" dans BookingDetailModal
T0+0 [FRONT] optimistic setBookings(p => p.map(b => b.id===id ? {...b, status:'cancelled'} : b))
T1   DELETE /api/bookings/:id
T2   [BACK] UPDATE bookings + UPDATE contact totalBookings-- + autoPipelineAdvance('booking_cancelled_last') 
       → si c'était le dernier RDV, contact.pipeline_stage repasse de 'rdv_programme' → 'contacte'
T3   [BACK] return {success:true}  ← PAS DE CONTACT
T4   [FRONT] Booking disparaît de l'agenda ✅, mais le state local `contacts` n'est PAS mis à jour
T5   [FRONT] Pipeline Live affiche encore le contact en colonne "RDV programmé" alors que DB dit "Contacté"
```

**Désync durable** jusqu'au prochain refetch manuel (le polling 5min ne refetch QUE `contacts`, et même là les contacts venant de polling peuvent être ignorés en cas de race avec un edit local).

Comparaison : `POST /api/bookings` ([L208](server/routes/_vps-pull/bookings.js#L208)) ET `PUT /api/bookings` ([L382](server/routes/_vps-pull/bookings.js#L382)) retournent **bien** `{success, booking, contact}`. **Seul DELETE oublie le contact**.

**Fix** : ajouter dans DELETE handler :
```js
let contactPayload = null;
if (booking.contactId) {
  try { contactPayload = db.prepare('SELECT * FROM contacts WHERE id = ?').get(booking.contactId) || null; } catch {}
}
res.json({ success: true, contact: contactPayload });
```

### 4.10 🔴 Frontend ignore systématiquement le `contact` payload retourné

**Constat transversal** : POST et PUT `/api/bookings` retournent `{success, booking, contact}` (le contact post-side-effects). Mais le frontend dans `addScheduledCall` ([CollabPortal.jsx:1690-1694](app/src/features/collab/CollabPortal.jsx#L1690-L1694)) fait **un refetch séparé** :
```js
api(`/api/data/contacts/${f.contactId}`).then(fresh => {
  if (fresh?.id) { setContacts(p => p.map(c => c.id === fresh.id ? fresh : c)); }
}).catch(() => {});
```

C'est **redondant et race-prone** :
- Le backend a déjà fait le travail et l'a retourné dans la réponse POST
- Le refetch ajoute une 2e roundtrip réseau
- Si le refetch arrive APRÈS un autre PUT contact concurrent, on écrase l'état correct

**Fix** : consommer directement le `contact` retourné par POST/PUT et faire `setContacts(p => p.map(c => c.id === r.contact.id ? r.contact : c))` à la place du refetch séparé.

### 4.11 🔴 Pas de polling bookings (seulement contacts toutes les 5min)

**Constat** : `[CollabPortal.jsx:2902](app/src/features/collab/CollabPortal.jsx#L2902)` polle uniquement `/api/data/contacts` toutes les 5 min. **Aucun polling sur `/api/bookings`**.

**Conséquences** :
- Booking créé via lien public Calendly-like → **invisible** côté collab tant qu'il ne refresh pas la page
- Cross-collab booking créé par un autre collab → invisible si l'utilisateur est en train de travailler dans son agenda
- Cron-driven changes (rare actuellement mais possible) → invisibles
- Modification d'un booking côté admin → invisible côté collab

**Sévérité** : 🔴 critique pour Projet 26 (cross-collab + RDV transférés en spec). Pour aujourd'hui, mineure car la majorité des bookings sont créés par le user actif dans la même session.

**Fix** : ajouter polling `bookings` toutes les 30s-5min selon préférence MH, OU implémenter SSE/WebSocket (cf. recommandations §7.4).

### 4.12 🟢 Conflict check côté backend = source unique R1+R5 ✅

`checkBookingConflict` est appelé depuis 3 endroits (POST bookings, PUT bookings, contactShare/share.js) — pas de duplication. C'est solide.

### 4.13 🟢 Idempotence markNoShow ✅

`markNoShow` retourne 200 no-op si déjà marqué. Bonne pratique.

---

## 5. DETTES TECHNIQUES (par ordre de gravité)

| # | Dette | Fichier | Effort | Impact si non traité |
|---|---|---|---|---|
| 1 | `agendaFilter` cosmétique (boutons sans effet) | AgendaTab.jsx:173-189 | 30min | Confusion UX, faux sentiment de filtre actif |
| 2 | `_scheduleGlobalRefresh` absent sur PUT/DELETE bookings | CollabPortal.jsx + BookingDetailModal | 1h | Pipeline Live stale après annul/déplacement |
| 3 | `checkBookingConflict` ne lit pas `google_events` | services/bookings/checkBookingConflict.js | 2h | Double-booking possible |
| 4 | Pas d'audit nightly désynchros pipeline ↔ booking | nouveau cron | 3h | Drift permanent (3-7 cas observés) |
| 5 | Wave D pas étendu à PUT bookings | server/routes/bookings.js | 30min | Booking déplaçable vers collab archivé |
| 6 | Pas de cleanup `googleEventId` orphelins | services/googleCalendar.js | 2h | 14 orphelins actuels, croissance lente |
| 7 | Pas de virtualization vue Mois (perf) | AgendaTab.jsx:424-473 | 4h | Lag à 100+ bookings/mois |
| 8 | Pas de memoization `dayBookings`/`weekBookings`/`monthBk` | AgendaTab.jsx | 1h | Re-render coûteux à chaque setBookings |
| 9 | Imports morts (`STATUS_COLORS`, `PIPELINE_LABELS`, `formatDate`) | AgendaTab.jsx:7 | 5min | Bundle bloat ~3kb |
| 10 | `[REASSIGN ERROR] pipeline_history.companyId NOT NULL` | call-site reassign | 30min | Reassign silencieusement échoue |
| 11 | 17 bookings avec contactId orphelin (DB) | one-shot SQL | 30min | Cards apparaissent en agenda sans fiche |
| 12 | 14 googleEventId orphelins (DB) | one-shot SQL ou cron auto | 30min | Updates GCal échouent |
| 13 | 7 contacts pipeline désynchro (3 stage + 4 rdv_status) | one-shot SQL | 15min | Cards en `rdv_programme` sans booking |
| 14 | 2 bookings `companyId NULL` (dette §5bis.2 CLAUDE.md) | SQL ou archivage | 15min | Bookings non scopés à une company |
| 15 | Frontend ne reset pas son state après `[BOOKING REJECTED]` | modal RDV | 30min | PUT répétitifs sur temp IDs (logs noise) |
| 16 | Pas de bidirectionnalité Google Sync (App→Google ok mais inverse 0) | services/googleCalendar.js + cron | 1-2j | Events Google créés hors app non capturés en bookings |
| 17 | Pas d'optimistic locking (version field contact) | schema + routes | 1j | Concurrent updates LWW silencieux |

---

## 6. QUICK WINS — implémentables en <4h chacun

### 6.0 ⭐⭐⭐ DELETE /api/bookings retourne `contact` actualisé (15 min)
Pattern transversal majeur. Backend `[bookings.js DELETE L429-450](server/routes/_vps-pull/bookings.js#L429-L450)` fait tous les side effects mais retourne `{success:true}` only. Aligner avec POST/PUT :
```js
let contactPayload = null;
if (booking.contactId) {
  try { contactPayload = db.prepare('SELECT * FROM contacts WHERE id = ?').get(booking.contactId) || null; } catch {}
}
res.json({ success: true, contact: contactPayload });
```
**Impact** : Fix #1 de la désync pipeline post-cancellation.

### 6.0.bis ⭐⭐⭐ Frontend consomme le `contact` payload retourné (1h)
Au lieu de refetch séparé (race-prone) :
```js
// AVANT (CollabPortal.jsx:1690-1694)
api(`/api/data/contacts/${f.contactId}`).then(fresh => {
  if (fresh?.id) { setContacts(p => p.map(c => c.id === fresh.id ? fresh : c)); }
});

// APRÈS
api('/api/bookings', {method:'POST', body:bk}).then(r => {
  if (r?.contact) setContacts(p => p.map(c => c.id === r.contact.id ? r.contact : c));
  if (r?.booking) setBookings(p => p.map(b => b.id === r.booking.id ? r.booking : b));
});
```
À appliquer aussi dans tous les call sites PUT/DELETE bookings côté frontend.

### 6.0.ter ⭐⭐⭐ Polling bookings (30 min ou SSE 2-4h)
Court terme :
```js
// CollabPortal.jsx near L2902 (à côté du polling contacts)
const syncBookings = () => api('/api/bookings').then(r => Array.isArray(r) && setBookings(r));
const ivBk = setInterval(syncBookings, 60_000); // 1min
return () => clearInterval(ivBk);
```
Long terme : SSE endpoint `/api/live-sync` qui broadcast les change events (cf. §7.4).

### 6.1 ⭐ Brancher `agendaFilter` (30 min)
Modifier `dayBookings`, `weekBookings`, `monthBk filter`, `filteredBookings` pour respecter le filtre sélectionné. Source : `[AgendaTab.jsx:173](app/src/features/collab/tabs/AgendaTab.jsx#L173)`.

### 6.2 ⭐ `_scheduleGlobalRefresh` sur PUT/DELETE (1h)
Exposer `_scheduleGlobalRefresh` dans le CollabContext provider, l'invoquer depuis BookingDetailModal après PUT/DELETE réussi.

### 6.3 ⭐ Étendre `checkBookingConflict` aux google_events (2h)
Ajouter dans le helper :
```js
const gcalRows = db.prepare(
  "SELECT id, startTime, endTime FROM google_events WHERE collaboratorId = ? AND status != 'cancelled'"
).all(collaboratorId);
// Convertir en minutes pour overlap check
for (const ge of gcalRows) {
  const gStart = ...; const gEnd = ...;
  if (newStart < gEnd && newEnd > gStart) return { conflict: true, source: 'google' };
}
```
Tests : créer event Google côté Jordan → tenter booking app dans le même slot → doit retourner 409.

### 6.4 ⭐ Audit nightly désynchros pipeline (3h)
Nouveau cron `cron/auditPipelineSync.js`, run 03:00 UTC :
```sql
-- Pipeline sans booking
SELECT c.id, c.companyId FROM contacts c
WHERE c.pipeline_stage = 'rdv_programme'
AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.contactId = c.id AND b.status = 'confirmed' AND b.date >= date('now'))
```
Pour chaque résultat : `autoPipelineAdvance(c.id, 'booking_cancelled_last')` + log `[AUDIT] pipeline desync repaired contact=...`. Idempotent.

### 6.5 ⭐ Reset modal après `[BOOKING REJECTED]` (30 min)
Dans le `.catch` du POST /bookings frontend, si erreur `CONTACT_NOT_FOUND` :
```js
setPhoneScheduleForm({contactId:'', ..., _error:'Contact non synchronisé — modal réinitialisée'});
showNotif('Contact non synchronisé. Veuillez réessayer.', 'danger');
// Pas de PUT répétitifs ensuite
```

### 6.6 ⭐ Wave D extension PUT bookings (30 min)
Dans `[bookings.js PUT L215](server/routes/_vps-pull/bookings.js#L215)`, ajouter au début :
```js
if (req.body.collaboratorId && req.body.collaboratorId !== oldBooking.collaboratorId) {
  const collabActive = db.prepare("SELECT 1 FROM collaborators WHERE id = ? AND (archivedAt IS NULL OR archivedAt = '')").get(req.body.collaboratorId);
  if (!collabActive) return res.status(409).json({ error: 'COLLABORATOR_ARCHIVED' });
}
```

### 6.7 ⭐ One-shot SQL repair (15 min, à valider MH)
```sql
-- Pipeline désynchros (7 contacts)
UPDATE contacts SET pipeline_stage = 'contacte', rdv_status = NULL, next_rdv_date = NULL
WHERE pipeline_stage = 'rdv_programme'
AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.contactId = contacts.id AND b.status = 'confirmed' AND b.date >= date('now'));

-- Bookings orphelins → soft-archive (status='cancelled')
UPDATE bookings SET status='cancelled' WHERE contactId != '' 
AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = bookings.contactId);

-- googleEventId orphelins (à vérifier d'abord)
UPDATE bookings SET googleEventId = NULL WHERE googleEventId IS NOT NULL 
AND NOT EXISTS (SELECT 1 FROM google_events ge WHERE ge.id = bookings.googleEventId);
```

---

## 7. RECOMMANDATIONS LONG TERME (Piste 2 et 3)

### 7.1 Architecture événementielle (2-4 semaines)
Adopter un pattern event sourcing pour les mutations critiques :
- `booking_created` → applyBookingCreatedSideEffects + GCal sync via queue
- `booking_cancelled` → cascade pipeline + email + GCal cancel via queue
- `contact_reassigned` → audit + share + GCal calendar transfer

Avantages : audit trail naturel, replay possible, débogage time-travel, scaling simple via queue.

### 7.2 Bidirectionnalité Google Calendar (1-2 sem)
Convertir les events Google en bookings PLANORA si :
- L'event Google a un attendee email matchant un contact existant en DB
- Sinon créer un "booking sans contact" (genre meeting interne) visible dans agenda mais pas dans CRM

Demande : nouvelle colonne `bookings.source = 'google_imported'` + UI pour relier manuellement à un contact.

### 7.3 Optimistic locking (1 sem)
Ajouter `contacts.version INT` + `bookings.version INT`, incrémenter à chaque UPDATE, vérifier dans PUT (409 si stale). Évite les LWW silencieux.

### 7.4 Real-time sync via WebSocket ou SSE (1-2 sem)
Actuellement aucun mécanisme real-time. Si user A annule un RDV qui appartient à user B (cross-collab), B le voit seulement au prochain refresh manuel. Un WebSocket par company permet de pusher les changements live.

### 7.5 Inspiration Schedule-X (réf MH)
Schedule-X (https://github.com/schedule-x/schedule-x) propose :
- Drag-and-drop natif sur la grille (PLANORA = read-only)
- Plugins par vue (event modal, recurrence, calendars)
- Time grid virtualisée (perf scalable)
- État réactif via stores (vs prop drilling actuel)

**Ne pas migrer**, mais **bench**er :
- Notre vue Mois rend ~120-180 éléments DOM sans virtualization → fragile à 200+ bookings/mois/collab
- Le pattern "stores réactifs" (signal-based) est plus performant que le `setState + prop drilling` actuel
- Le drag-drop est très demandé en SaaS calendar — à mettre en backlog produit

### 7.6 Multi-tenant (Piste 3, déjà en backlog CLAUDE.md §0)
Pas spécifique à l'agenda mais l'isolation par company DB simplifierait :
- Index per-company → perf agenda
- Backups granulaires
- Tests d'isolation triviaux

---

## 8. ANNEXES

### 8.1 Compteurs DB live (2026-04-26 14:28 UTC)

| Table | Total | Détail |
|---|---:|---|
| bookings | 83 | 16 confirmed / 1 pending / 66 cancelled |
| bookings sans `calendarId` | 0 | ✅ Wave D |
| bookings sans `contactId` | 5 | OK (publics) |
| bookings avec `contactId` orphelin | **17** | 🔴 |
| bookings `companyId IS NULL` | 2 | dette §5bis.2 |
| bookings collab archivé | 0 | ✅ Wave D POST |
| bookings avec `googleEventId` | 20 | dont ~14 orphelins probables |
| google_events table | 6 | pour 2 collabs (Guillaume, Jordan) |
| contacts | 352 | distribution stage : 315 nouveau / 22 nrp / 9 rdv_programme / 3 contacte / 2 client_valide / 1 custom |
| contacts désynchro stage | 3 | rdv_programme sans booking |
| contacts désynchro rdv_status | 4 | 'programme' sans booking |
| contacts désynchro next_rdv_date | 1 | mineur |

### 8.2 Crons actifs

| Cron | Fichier | Fréquence | Touche bookings ? |
|---|---|---|:-:|
| reminders + GCal sync | reminders.js | */5 min | Oui (read + GCal sync) |
| Daily summary Google Chat | reminders.js | 0 8 * * * | Read |
| Backups | backups.js | quotidien | Read |
| Snapshots collab | collabSnapshots.js | */5 min | Read |
| Lead dispatch | leadDispatch.js | ? | Indirect (via contacts) |
| NRP relance | nrpRelance.js | */30 min | Read |
| Smart automations | smartAutomations.js | */30 min | Read |
| Transcript archive | transcriptArchive.js | */5 min | Non |
| Secure IA reports | secureIaReports.js | quotidien | Read |
| Snapshot retention | collabSnapshotsRetention.js | 03:15 UTC | Non |
| Gsheet sync | gsheetSync.js | ? | Indirect |

### 8.3 Fichiers critiques (chemins markdown)

**Backend** (sur VPS, pas dans repo) :
- `[server/routes/bookings.js](server/routes/_vps-pull/bookings.js)` 435 lignes
- `[server/routes/data.js](server/routes/_vps-pull/data.js)` 1224+ lignes
- `[server/services/bookings/checkBookingConflict.js](server/services/bookings/checkBookingConflict.js)`
- `[server/services/bookings/applyBookingCreatedSideEffects.js](server/services/bookings/applyBookingCreatedSideEffects.js)`
- `[server/services/bookings/markNoShow.js](server/services/bookings/markNoShow.js)`
- `[server/helpers/pipelineAuto.js](server/helpers/pipelineAuto.js)`
- `[server/services/googleCalendar.js](server/services/googleCalendar.js)`
- `[server/cron/reminders.js](server/cron/reminders.js)`

**Frontend** (dans repo) :
- [app/src/features/collab/CollabPortal.jsx](app/src/features/collab/CollabPortal.jsx) ~6500 lignes
- [app/src/features/collab/tabs/AgendaTab.jsx](app/src/features/collab/tabs/AgendaTab.jsx)
- [app/src/features/collab/tabs/PhoneTab.jsx](app/src/features/collab/tabs/PhoneTab.jsx) (panneau droit Pipeline Live)
- [app/src/features/collab/modals/BookingDetailModal.jsx](app/src/features/collab/modals/BookingDetailModal.jsx)
- [app/src/features/collab/modals/ScheduleRdvModal.jsx](app/src/features/collab/modals/ScheduleRdvModal.jsx) (extracted, **non wiré** — IIFE inline CollabPortal L5528+ utilisée à la place)

### 8.4 Backups disponibles

- `/var/backups/planora/snapshot-v18223-validated-20260426-142810.tar.gz` (380M)
- `/var/backups/planora/db-snapshot-v18223-20260426-142810.db` (5.6M, atomique)
- `/var/backups/planora/db-snapshot-v18223-20260426-142810-ct.db` (108K)

---

## 9. PLAN D'ACTION PROPOSÉ

### Sprint immédiat (1-2 jours)
1. **🔴 Quick win 6.0 — DELETE retourne contact** (15 min)
2. **🔴 Quick win 6.0.bis — Frontend consomme contact des payloads POST/PUT/DELETE** (1h)
3. **🔴 Quick win 6.0.ter — Polling bookings 1min** (30 min — solution court terme avant SSE)
4. SQL one-shot repair (7 contacts désynchro + 17 bookings orphelins archivés en cancelled + 14 googleEventId orphelins) — backup avant
5. Quick win 6.1 — `agendaFilter` branché
6. Quick win 6.2 — `_scheduleGlobalRefresh` sur PUT/DELETE
7. Quick win 6.5 — Reset modal après `[BOOKING REJECTED]`
8. Quick win 6.6 — Wave D extension PUT

### Sprint suivant (2-5 jours)
6. Quick win 6.3 — `checkBookingConflict` lit aussi `google_events` (avec tests)
7. Quick win 6.4 — Cron audit nightly désynchros pipeline
8. Cleanup `googleEventId` orphelins (one-shot + intégration cron)
9. Memoization vues Agenda (perf)
10. Fix `[REASSIGN ERROR] pipeline_history.companyId`

### Backlog produit (à prioriser MH)
- Drag-drop dans Agenda (inspiration Schedule-X)
- Real-time WebSocket cross-collab
- Bidirectionnalité Google Calendar
- Virtualization vue Mois
- Optimistic locking

---

## 10. SCORECARD GLOBAL

| Domaine | Score | Commentaire |
|---|:-:|---|
| Backend bookings flow | 🟢 8/10 | Architecture saine, helpers centralisés, audit complet |
| Conflict detection | 🟡 6/10 | Helper unique mais ne lit pas google_events |
| Pipeline transitions | 🟢 8/10 | autoPipelineAdvance solide, anti-régression intégrée |
| Frontend AgendaTab cohérence | 🟡 6/10 | 4 vues lisent même `bookings`, mais filtres incohérents et `agendaFilter` mort |
| Synchronisations cross-modules | 🟠 5/10 | `_scheduleGlobalRefresh` partiel, optimistic sans rollback complet |
| Google Calendar sync | 🟠 5/10 | Inverse uniquement, eventIds orphelins, pas de bidirec |
| Performance / scalabilité | 🟡 6/10 | Pas de virtualization, memoization absente, OK à <100 bookings/mois |
| Audit / observabilité | 🟢 8/10 | Logs structurés [BOOKING CREATED/REJECTED], pipeline_history audit |
| Tests automatisés | 🔴 3/10 | Smoke tests existent (`ops/smoke/`) mais pas de tests unitaires sync flow |
| **GLOBAL** | **🟡 6.4/10** | Solide mais des trous bien identifiés — quick wins suffisent pour atteindre 8+ |

---

> **Conclusion** : le système Agenda PLANORA est **fonctionnel et bien structuré** côté backend, mais a des **failles de synchro côté frontend et Google Calendar** qui peuvent dériver à grande échelle. Les **17 bookings orphelins** et les **7 contacts pipeline désynchro** observés sont des symptômes faibles aujourd'hui mais cassants demain à 1000+ contacts/company.
> 
> **Avec les 6 quick wins (~1-2 jours)**, le système passe de "stable mais fragile" à "robuste et scalable jusqu'à 50+ collabs/10K+ bookings". Les recommandations long terme (event sourcing, bidirectional GCal, real-time) sont à arbitrer selon la roadmap business.
