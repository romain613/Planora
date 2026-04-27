# AUDIT — Reporting Collab RDV (V1.10.3 préparation)

> **Date** : 2026-04-27
> **Auteur** : Claude Code (Opus 4.7)
> **Mode** : READ-ONLY — aucune modification code/DB/config/déploiement
> **Demandeur** : MH
> **État** : ⏸ EN ATTENTE VALIDATION MH (7 questions ouvertes §9)

---

## 0. TL;DR

🟢 **Infrastructure à 80% déjà présente** — phaseA migration (V1.8.22, 2026-04-20) a déjà ajouté la majorité des colonnes nécessaires.

| Item | État |
|---|---|
| Colonnes booking sender/receiver/outcome | ✅ existent (phaseA) |
| Sémantique `bookedByCollaboratorId` / `agendaOwnerId` | ✅ exploitable |
| Tables `audit_logs` + `notifications` | ✅ réutilisables |
| Patterns Contact Share V1 (V1.8.13) à imiter | ✅ disponibles |
| Routes `GET /reporting` + `PUT /:id/report` | ❌ à créer |
| Colonnes `bookingReportedBy`, `bookingReportingStatus`, `bookingReportingCategory` | ❌ à ajouter (3) |
| **BUG isolation `GET /api/bookings`** | 🔴 **CRITIQUE pré-existant** |

**Ce qui manque** : 3 colonnes + 2 routes + 1 tab UI + 1 hotfix isolation. **~10h** dev cumulé estimé.

---

## 1. Schéma `bookings` actuel (post-phaseA)

### 1.1 Colonnes initiales (V0)

```sql
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  calendarId TEXT NOT NULL,
  collaboratorId TEXT,           -- assigné historiquement (legacy)
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  duration INTEGER DEFAULT 30,
  visitorName TEXT NOT NULL,
  visitorEmail TEXT,
  visitorPhone TEXT,
  status TEXT DEFAULT 'confirmed',
  notes TEXT,
  noShow INTEGER DEFAULT 0,
  source TEXT DEFAULT 'link',
  rating INTEGER,
  tags_json TEXT DEFAULT '[]',
  checkedIn INTEGER DEFAULT 0,
  internalNotes TEXT,
  reconfirmed INTEGER DEFAULT 0,
  FOREIGN KEY (calendarId) REFERENCES calendars(id)
);
```

### 1.2 Colonnes ajoutées par migration `phaseA` (2026-04-20)

| Colonne | Type | Default | Rôle V1.10.3 |
|---|---|---|---|
| `bookedByCollaboratorId` | TEXT | `''` | **= sender (collab A qui transmet)** |
| `meetingCollaboratorId` | TEXT | `''` | Collab qui réalise le RDV (souvent = receiver) |
| `agendaOwnerId` | TEXT | `''` | **= receiver (collab B qui reçoit & rapporte)** |
| `bookingType` | TEXT | `'external'` | discriminant `'share_transfer'` pour reporting |
| `bookingOutcome` | TEXT | `''` | **= reportingStatus** |
| `bookingOutcomeNote` | TEXT | `''` | **= reportingNote** |
| `bookingOutcomeAt` | TEXT | `''` | **= reportedAt** |
| `transferMode` | TEXT | `''` | mode transfert (rare) |
| `companyId` | TEXT | — | FK implicite ; **CRITICAL** |
| `contactId` | TEXT | `''` | FK contacts |
| `rdv_category` | TEXT | `''` | catégorie métier RDV |
| `rdv_subcategory` | TEXT | `''` | sous-catégorie |

### 1.3 Indexes existants

```sql
idx_bookings_agenda_owner   ON bookings(agendaOwnerId)
idx_bookings_meeting_collab ON bookings(meetingCollaboratorId)
idx_bookings_type           ON bookings(bookingType)
idx_bookings_token          ON bookings(manageToken)
```

---

## 2. Routes booking existantes

### 2.1 `GET /api/bookings`

[server/routes/bookings.js:19-60](server/routes/bookings.js#L19)

- **Auth** : requireAuth + enforceCompany + requirePermission('bookings.view')
- **Filtre actuel non-admin** : `WHERE collaboratorId = req.auth.collaboratorId` ⚠️
- **🔴 BUG** : ignore `agendaOwnerId` et `meetingCollaboratorId` → un RDV partagé via Contact Share est invisible côté receiver

### 2.2 `POST /api/bookings`

[server/routes/bookings.js:62-231](server/routes/bookings.js#L62)

- Side-effects : V5-BOOKING auto-create contact, Google Calendar sync, applyBookingCreatedSideEffects (totalBookings++, pipeline)
- ⚠️ Auto-assigne `collaboratorId` depuis le body sans vérif strict que ce collab appartient à la company

### 2.3 `PUT /api/bookings/:id`

[server/routes/bookings.js:233-416](server/routes/bookings.js#L233)

- Ownership check : `req.auth.role !== 'admin' && oldBooking.collaboratorId !== req.auth.collaboratorId`
- 🔴 Limite : ne couvre pas `agendaOwnerId` / `meetingCollaboratorId`

### 2.4 `DELETE /api/bookings/:id`

[server/routes/bookings.js:418-472](server/routes/bookings.js#L418)

- Soft cancel (status='cancelled') + side-effects pipeline

---

## 3. Systèmes inter-collab existants

| Système | Concept | Stockage | Réutilisation V1.10.3 |
|---|---|---|---|
| **V7 Transfer** (`contact_followers`) | source/executor/viewer ongoing relation **contact** | table dédiée | ❌ ne pas réutiliser (sémantique relation contact ≠ événement RDV one-shot) |
| **Contact Share V1** (V1.8.13) | sharedWithId/sharedById/sharedAt/shareNote | colonnes inline `contacts` | ✅ pattern à imiter |
| **Audit logs** | actions immutables (transfer_contact, contact_shared, etc.) | table `audit_logs` + triggers PREVENT_UPDATE/DELETE | ✅ ajouter action `booking_reported` |
| **Notifications** | in-app push (transfer_received) | table `notifications` | ✅ ajouter type `booking_reported` |

### 3.1 Contact Share V1 — pattern à imiter

[server/routes/contactShare.js](server/routes/contactShare.js)

- Atomic TX : UPDATE `contacts` (sharedWith*) + INSERT `bookings` + audit_log
- Bookings créés avec : `bookedByCollaboratorId=actor`, `meetingCollaboratorId=target`, `agendaOwnerId=target`, `bookingType='share_transfer'`
- Donc **les bookings issus de Contact Share ont déjà toute la signalétique sender/receiver**

---

## 4. Visibilité / isolation actuelle

### 4.1 Contacts (correct)

```sql
WHERE companyId = ? AND (assignedTo = ? OR sharedWithId = ? OR shared_with_json LIKE ?)
```

### 4.2 Bookings (incomplet)

```sql
-- Non-admin :
WHERE c.companyId = ? AND b.collaboratorId = ?
-- ❌ ne tient pas compte de agendaOwnerId / meetingCollaboratorId
```

### 4.3 Conséquence concrète

Si A partage un RDV vers B via Contact Share :
- `collaboratorId` reste celui de A (legacy)
- `agendaOwnerId = B`
- B ne voit PAS ce RDV dans `GET /api/bookings`

→ **Bug latent depuis V1.8.13** (Contact Share V1). À fixer en hotfix V1.10.2.1 OU intégré V1.10.3 phase 1.

---

## 5. Notifications

### 5.1 Schéma

```sql
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  collaboratorId TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT DEFAULT '',
  contactId TEXT,
  contactName TEXT DEFAULT '',
  linkUrl TEXT DEFAULT '',
  readAt TEXT,
  createdAt TEXT NOT NULL
);
```

### 5.2 Types existants

- `transfer_received` (V7 transfer) — déclenché à l'executor receveur
- (Contact Share V1.8.13 ne crée PAS de notif explicite — TODO)

### 5.3 V1.10.3 — types à ajouter

- `booking_ready_reporting` → notifié au receveur quand RDV partagé créé
- `booking_reported` → notifié au sender (`bookedByCollaboratorId`) quand le receveur rapporte

---

## 6. Frontend — pattern tab

### 6.1 Tabs existants CollabPortal

`app/src/features/collab/CollabPortal.jsx` — tabs : home, agenda, crm, telephone, messages, ai-profile, objectifs, tables, availability + sub-tabs.

### 6.2 Pattern recommandé V1.10.3

1. Créer `app/src/features/collab/screens/CollabRdvReportingScreen.jsx`
2. Ajouter route + entrée nav dans CollabPortal
3. 2 sous-onglets : "Reçus" (filter `agendaOwnerId=collab`) / "Transmis" (filter `bookedByCollaboratorId=collab`)
4. Modal "Faire le reporting" → POST `/api/bookings/:id/report`
5. Badges : 🟡 pending / 🟢 validated / ✅ signed / 🔴 no-show / ⚪ cancelled / 🔵 follow-up

---

## 7. Champs reporting — gap analysis

| Champ user | Mapping actuel | Gap |
|---|---|---|
| `senderCollaboratorId` | = `bookedByCollaboratorId` | ✅ existant |
| `receiverCollaboratorId` | = `agendaOwnerId` | ✅ existant |
| `reportingStatus` | = `bookingOutcome` | ✅ existant (à standardiser enum) |
| `reportingNote` | = `bookingOutcomeNote` | ✅ existant |
| `reportingUpdatedAt` | = `bookingOutcomeAt` | ✅ existant |
| `reportedBy` | ❌ absent | **NEW: `bookingReportedBy`** |
| Catégorie raison (no_show vs rescheduled vs other...) | ❌ absent | **NEW: `bookingReportingCategory`** |

→ **Total ALTER : 2 colonnes nouvelles** (j'avais initialement compté 3 mais `bookingReportingStatus` peut être un alias logique de `bookingOutcome` standardisé). Si on veut découpler "outcome historique" de "reporting structuré", alors 3 colonnes.

**Recommandation** : 3 colonnes (clean separation). `bookingOutcome` reste pour legacy/audit, `bookingReportingStatus` pour la nouvelle logique stricte enum.

---

## 8. Risques isolation détectés

| # | Risque | Sévérité | Fix |
|---|---|---|---|
| 1 | `GET /api/bookings` filtre incomplet (pas d'agendaOwnerId/meetingCollaboratorId) | 🔴 CRITIQUE | hotfix isolation phase 1 |
| 2 | `PUT /api/bookings/:id` ownership ne couvre pas agendaOwnerId | 🟠 HAUTE | élargir ownership phase 1 |
| 3 | `POST /api/bookings` accepte n'importe quel collaboratorId du body | 🟠 HAUTE | enforce collaboratorId ∈ company |
| 4 | Contact Share V1 ne crée pas notif `booking_ready_reporting` | 🟡 MOYENNE | trigger notification dans contactShare.js |
| 5 | Audit logs sans trace champ "qui a posé bookingOutcome" | 🟡 MOYENNE | logger action `booking_reported` |
| 6 | Aucun TTL sur notifications | 🟢 BASSE | non bloquant V1, future cleanup |

---

## 9. Décisions à valider MH (7 questions)

1. **Sémantique collab** : réutiliser `bookedByCollaboratorId` (sender) + `agendaOwnerId` (receiver), pas de nouvelle paire ? **(reco : OUI)**

2. **Enum statuts** : confirmer la liste finale `{pending, validated, signed, cancelled, no_show, follow_up, rescheduled, other}` (8 valeurs) ?

3. **Note obligatoire serveur-side** : valider HTTP 400 si `note` vide pour `signed/cancelled/no_show/follow_up/other` ?

4. **Périmètre V1** : reporting **uniquement sur `bookingType='share_transfer'`** ou **tous les bookings** ? **(reco : share_transfer V1)**

5. **Bug isolation `GET /api/bookings`** : fix dans V1.10.3 phase 1 (intégré) ou hotfix séparé V1.10.2.1 ? **(reco : intégré V1.10.3 phase 1)**

6. **Migration phaseA validation** : OK pour script SQL READ-ONLY de vérification du backfill `bookedByCollaboratorId` avant code ?

7. **Notifications** : in-app uniquement (table existante) ou aussi email/SMS ? **(reco : in-app V1)**

---

## 10. Plan d'implémentation V1.10.3 (post-validation)

### Phase 1 — Schema + isolation fix (~2h)

- [ ] SQL READ-ONLY check : `SELECT COUNT(*) FROM bookings WHERE bookingType='share_transfer' AND bookedByCollaboratorId=''`
- [ ] ALTER TABLE bookings ADD COLUMN `bookingReportedBy` TEXT DEFAULT ''
- [ ] ALTER TABLE bookings ADD COLUMN `bookingReportingStatus` TEXT DEFAULT ''
- [ ] ALTER TABLE bookings ADD COLUMN `bookingReportingCategory` TEXT DEFAULT ''
- [ ] HOTFIX `GET /api/bookings` : élargir filtre à `(collaboratorId = ? OR agendaOwnerId = ? OR meetingCollaboratorId = ?)`
- [ ] HOTFIX `PUT /api/bookings/:id` : élargir ownership idem
- [ ] Tests régression : visibilité bookings owner / shared / admin / supra

### Phase 2 — Backend reporting (~3h)

- [ ] `GET /api/bookings/reporting?role=received|sent` (filtre par receiver ou sender + admin bypass)
- [ ] `PUT /api/bookings/:id/report` : auth strict (`agendaOwnerId === req.auth.collaboratorId` OU admin), validation enum + note obligatoire
- [ ] Audit log immutable `action='booking_reported'`, `category='rdv_reporting'`
- [ ] Notification automatique au sender `bookedByCollaboratorId`
- [ ] Tests E2E : A partage → B rapporte → A reçoit notif → audit log présent

### Phase 3 — Frontend (~4h)

- [ ] `CollabRdvReportingScreen.jsx` (2 sous-onglets Reçus/Transmis)
- [ ] Modal "Faire le reporting" (statut + catégorie + note + suggestions pipeline)
- [ ] Nav entry "Reporting collab RDV" 📊
- [ ] Badges visuels 🟡🟢✅🔴⚪🔵
- [ ] Tests : C ne voit rien, B voit reçus, A voit transmis, admin voit tout

### Phase 4 — Intégrations (~1h)

- [ ] Notification cloche cliquable → ouvre `Reporting collab RDV`
- [ ] Suggestions pipeline post-reporting (signed → client_valide, no_show → nrp, follow_up → relance) — bouton seul, pas auto

**Total estimé : ~10h cumulé.**

---

## 11. Ce qu'on **ne fait PAS** en V1

- ❌ Table dédiée `booking_reports` (flatten sur bookings)
- ❌ Réutiliser `contact_followers` role pour reporting (sémantique différente)
- ❌ Auto-promotion pipeline post-reporting (suggestion uniquement)
- ❌ Email/SMS natif (in-app suffit V1)
- ❌ Reporting deadline / escalation (future)
- ❌ Reporting modifiable par senders ou admin (strict ownership receiver)

---

## 12. Bilan

**Mission V1.10.3** est largement **dérisquée** par phaseA (V1.8.22) :
- **80% de l'infrastructure DB existe**
- **Patterns** Contact Share + Audit + Notifications sont prouvés
- **Bug latent isolation** doit être traité (mais c'est un nettoyage de dette, pas un blocker majeur)

**Effort total** : ~10h dev + tests, livrable en 4 phases incrémentales (chaque phase shippable + rollback isolé).

**En attente de validation MH des 7 questions §9 avant tout code.**
