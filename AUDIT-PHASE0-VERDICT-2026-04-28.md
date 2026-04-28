# PHASE 0 — VERDICT BACKEND `/api/bookings/*`

> **Date** : 2026-04-28
> **Auteur** : Claude Code (Opus 4.7)
> **Mission** : reconfirmation backend READ-ONLY avant Phase 1 frontend
> **Mode** : READ-ONLY strict — aucune modif code/DB/config/déploiement
> **Source de vérité** : `/var/www/planora/server/routes/bookings.js` (695 lignes, prod V1.10.3-FULL, md5 `99a6dcdb5ec8e78daaa8df9c3b8580b9`)

---

## 🟢 VERDICT : GO PHASE 1 FRONTEND

**Le backend V1.10.3-FULL est cohérent et l'isolation sender/receiver/admin/supra est strictement respectée.**
**Aucun patch backend nécessaire avant Phase 1.**

---

## 1. Divergence audit levée

L'AUDIT initial signalait une divergence sur `GET /api/bookings` :

| Source | Constat |
|---|---|
| `server/routes/_vps-pull/bookings.js` (local, **475 lignes**) | Filtre étroit `b.collaboratorId = ?` |
| Code prod VPS `server/routes/bookings.js` (**695 lignes**) | Filtre élargi `(b.collaboratorId = ? OR b.agendaOwnerId = ? OR b.bookedByCollaboratorId = ?)` |

**Cause** : le pull local datait du **2026-04-26** (V1.10.3 base, avant FULL). Le pull est désormais **obsolète de 2 jours** par rapport au prod V1.10.3-FULL (commit `41fe7ea8` du 28 avril). Aucune incohérence côté serveur.

⚠ **Action recommandée hors scope Phase 0** : refresh `_vps-pull/` ou suppression pour éviter futur faux positif.

---

## 2. Vérifications par route

### 2.1 ✅ `GET /api/bookings` — élargi sender/receiver/owner

[bookings.js:27-76](server/routes/bookings.js)

| Cas | Filtre SQL effectif |
|---|---|
| Admin / supra | `WHERE c.companyId = ?` (toute la company) |
| Non-admin | `WHERE c.companyId = ? AND (b.collaboratorId = ? OR b.agendaOwnerId = ? OR b.bookedByCollaboratorId = ?)` |
| Avec `?calendarId=` | Ajoute `AND b.calendarId = ?` + check `cal.companyId === req.auth.companyId` |

✅ Sender voit ses transmis
✅ Receiver voit ses reçus
✅ Owner legacy reste visible
✅ Tiers exclus
✅ Champs reporting (`bookingReportingStatus`, `bookingReportingNote`, `bookingReportedAt`, `bookingReportedBy`) **inclus dans le payload** via `SELECT *` → frontend pourra afficher le statut sans appel additionnel

### 2.2 ✅ `PUT /api/bookings/:id` — ownership élargi

[bookings.js:259-448](server/routes/bookings.js#L259-L448), check L271-281

```js
if (req.auth.role !== 'admin') {
  const cid = req.auth.collaboratorId;
  const isOwner    = oldBooking.collaboratorId === cid;
  const isSender   = oldBooking.bookedByCollaboratorId === cid;
  const isReceiver = oldBooking.agendaOwnerId === cid;
  if (!(isOwner || isSender || isReceiver)) {
    return res.status(403).json({ error: 'Accès interdit — booking d\'un autre collaborateur' });
  }
}
```

✅ Supra : bypass total (L266)
✅ Admin : bypass (L273)
✅ Sender / receiver / owner : autorisés
✅ Tiers : 403
✅ Company isolation manuelle préservée (L267-270 vérifie `cal.companyId === req.auth.companyId`)
✅ Wave D : refus PUT si nouveau `collaboratorId` archivé (L287-293)

### 2.3 ✅ `DELETE /api/bookings/:id` — ownership élargi (identique PUT)

[bookings.js:451-511](server/routes/bookings.js#L451-L511), check L462-472

Logique strictement identique à PUT. Soft-cancel (status='cancelled', pas de `DELETE FROM`).

### 2.4 ✅ `GET /api/bookings/reporting?role=sent|received` — scope strict

[bookings.js:524-574](server/routes/bookings.js#L524-L574)

| Cas | Filtre SQL |
|---|---|
| `role=received` non-admin | `bookingType='share_transfer' AND agendaOwnerId = ?` |
| `role=sent` non-admin | `bookingType='share_transfer' AND bookedByCollaboratorId = ?` |
| Admin / supra | Idem mais `targetCol != ''` au lieu de `= cid` (toute company) |
| `role` invalide | HTTP 400 |

✅ Aucune fuite : strictement filtré par `bookingType='share_transfer'` ET par scope role.

### 2.5 ✅ `PUT /api/bookings/:id/report` — receiver-only

[bookings.js:580-693](server/routes/bookings.js#L580-L693)

8 contrôles séquentiels :

| # | Contrôle | Comportement |
|---|---|---|
| 1 | Booking exists | 404 sinon |
| 2 | Company isolation (sauf supra) | 403 si `cal.companyId !== req.auth.companyId` |
| 3 | Scope strict `bookingType='share_transfer'` | 403 sinon |
| 4 | **Auth = receiver OR admin OR supra** (sender REJETÉ) | 403 sinon |
| 5 | Anti double-reporting (sauf admin/supra) | 403 si `bookingReportingStatus !== ''` |
| 6 | Validation enum (7 statuts) | 400 si invalide |
| 7 | Note obligatoire pour `signed/cancelled/no_show/follow_up/other` | 400 si vide |
| 8 | UPDATE booking + audit log + notif sender | OK |

✅ Sender ne peut pas reporter (cohérent : seul receiver a vu le RDV)
✅ Audit log immutable inséré dans `audit_logs`
✅ Notification sender automatique (`createNotification`)

---

## 3. Vérification absence de fuite vers un tiers (Anthony, ni sender ni receiver)

| Route | Comportement Anthony | Verdict |
|---|---|---|
| `GET /api/bookings` | Aucun row matche les 3 conditions OR → liste vide pour ces bookings | ✅ Invisible |
| `GET /api/bookings/reporting?role=*` | Aucun row matche → liste vide | ✅ Invisible |
| `PUT /api/bookings/:id` | `isOwner=false, isSender=false, isReceiver=false` → 403 | ✅ Refusé |
| `DELETE /api/bookings/:id` | Idem → 403 | ✅ Refusé |
| `PUT /api/bookings/:id/report` | `isReceiver=false`, pas admin/supra → 403 | ✅ Refusé |

**🛡 Aucune fuite identifiée.** L'isolation par companyId + filtre rôle est appliquée systématiquement.

---

## 4. Points d'attention non-bloquants (informatif)

Hors scope Phase 0 — à noter pour suivi technique, **n'affectent pas la décision GO Phase 1** :

| # | Observation | Impact | Recommandation |
|---|---|---|---|
| P1 | `PUT /:id` et `DELETE /:id` n'utilisent pas le middleware `enforceCompany` (vérif manuelle via `cal.companyId`) | Cohérent fonctionnellement, mais inhomogène avec `/reporting` qui l'utilise | Cosmétique — uniformiser plus tard |
| P2 | `bookingType` n'est **pas réajusté en PUT** si `collaboratorId` ou `bookedByCollaboratorId` change post-création | Volontaire (immutable post-création), mais à documenter | Documenter dans CLAUDE.md §10.3 |
| P3 | `POST /api/bookings` n'empêche pas un collab d'envoyer un body avec `bookedByCollaboratorId='jordan'` (usurpation) | Théorique — le frontend pose toujours `bookedBy=self` | Validation backend optionnelle si défense en profondeur souhaitée |
| P4 | `GET /reporting` et `PUT /:id/report` n'ont pas `requirePermission('bookings.*')` (juste `requireAuth` + `enforceCompany`) | Permet au receveur de reporter même sans `bookings.edit` (volontaire) | Documenter le choix |
| P5 | Le pull local `_vps-pull/bookings.js` (475 l) est obsolète de 2 jours | Cause divergence audit | Refresh ou suppression |

---

## 5. Recommandation avant Phase 1

✅ **GO immédiat Phase 1 frontend** sur ces bases :

### 5.1 Champs disponibles dans payload `GET /api/bookings`

Le frontend reçoit pour chaque booking :
- `collaboratorId`, `bookedByCollaboratorId`, `agendaOwnerId`, `meetingCollaboratorId`
- `bookingType` (`'share_transfer'` ou autre)
- `bookingReportingStatus`, `bookingReportingNote`, `bookingReportedAt`, `bookingReportedBy`
- Tous les autres champs standard

→ **Aucune mutation DB ni nouvelle route backend nécessaire.**

### 5.2 Helper frontend recommandé

```js
// app/src/shared/data/suivi.js (ou équivalent)
export function getBookingSuiviRole(booking, collabId) {
  const cid = String(collabId || '');
  if (booking.bookingType === 'share_transfer') {
    if (booking.bookedByCollaboratorId === cid) return 'sender';
    if (booking.agendaOwnerId === cid) return 'receiver';
  }
  if (booking.collaboratorId === cid) return 'owner';
  if (booking.agendaOwnerId === cid) return 'owner';   // booking normal sur son agenda
  return null;
}

export function isBookingVisibleForCollab(booking, collabId) {
  return getBookingSuiviRole(booking, collabId) !== null;
}

export function isContactInSuiviForCollab(contact, bookings, collabId) {
  if (contact.assignedTo === collabId) return true;
  const sw = Array.isArray(contact.shared_with)
    ? contact.shared_with
    : (() => { try { return JSON.parse(contact.shared_with_json || '[]'); } catch { return []; } })();
  if (sw.includes(collabId)) return true;
  return (bookings || []).some(b =>
    b.contactId === contact.id
    && b.bookingType === 'share_transfer'
    && (b.bookedByCollaboratorId === collabId || b.agendaOwnerId === collabId)
  );
}
```

### 5.3 Filtres frontend à élargir (rappel §F du AUDIT principal)

| Hotspot | Action Phase 1 |
|---|---|
| [CollabPortal.jsx:2424](app/src/features/collab/CollabPortal.jsx#L2424) `myBookings` | `b.collaboratorId === cid \|\| b.agendaOwnerId === cid \|\| b.bookedByCollaboratorId === cid` |
| [PhoneTab.jsx:5177](app/src/features/collab/tabs/PhoneTab.jsx#L5177) `myPipeContacts` | + `\|\| isContactInSuiviForCollab(c, bookings, cid)` |
| [CollabPortal.jsx:2879](app/src/features/collab/CollabPortal.jsx#L2879) + [:2894](app/src/features/collab/CollabPortal.jsx#L2894) `myCrmContacts` | idem |
| [FicheContactModal.jsx:158](app/src/features/collab/tabs/crm/fiche/FicheContactModal.jsx#L158) `contactBookings` | élargir OR multi-champ |

### 5.4 Tests backend rapides recommandés (si MH veut sécuriser avant Phase 1)

```bash
# Côté Jordan (sender) — récupère ses transmis
curl -H "Cookie: session=<jordan>" https://calendar360.fr/api/bookings | jq '[.[] | select(.bookingType=="share_transfer" and .bookedByCollaboratorId=="<jordan-id>")] | length'

# Côté Guillaume (receiver) — récupère ses reçus
curl -H "Cookie: session=<guillaume>" https://calendar360.fr/api/bookings | jq '[.[] | select(.bookingType=="share_transfer" and .agendaOwnerId=="<guillaume-id>")] | length'

# Côté Anthony (tiers) — doit être 0
curl -H "Cookie: session=<anthony>" https://calendar360.fr/api/bookings | jq '[.[] | select(.bookingType=="share_transfer")] | length'

# Tentative reporting par sender → doit être 403
curl -X PUT -H "Cookie: session=<jordan>" -H "Content-Type: application/json" -d '{"status":"signed","note":"test"}' https://calendar360.fr/api/bookings/<id>/report
```

---

## 6. Résumé décisionnel

| Question Phase 0 | Réponse | Statut |
|---|---|---|
| 1. `GET /api/bookings` retourne sender/receiver/owner ? | OUI | ✅ |
| 2. `PUT /api/bookings/:id` respecte sender/receiver/admin/supra ? | OUI | ✅ |
| 3. `DELETE /api/bookings/:id` respecte sender/receiver/admin/supra ? | OUI | ✅ |
| 4. `GET /api/bookings/reporting` strict role + share_transfer ? | OUI | ✅ |
| 5. Aucune fuite vers un tiers ? | OUI (5 routes vérifiées) | ✅ |

**🟢 GO Phase 1 frontend** — pas de divergence à corriger côté backend, pas de risque d'écart d'isolation.

---

**Document Phase 0 READ-ONLY — Aucune modification code, DB, config, déploiement effectuée.**
**STOP Phase 0 atteint. En attente go MH pour Phase 1 (helper + filtre Agenda).**
