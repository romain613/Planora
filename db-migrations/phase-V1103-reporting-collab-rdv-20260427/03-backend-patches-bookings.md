# V1.10.3 — Patches backend `server/routes/bookings.js` (VPS-only file)

> Le fichier `server/routes/bookings.js` n'est PAS tracké dans le repo local
> (cf. `server/routes/_vps-pull/` ignoré). Ce document trace les patches
> appliqués en prod pour reproductibilité + rollback.

## Patches appliqués

### Phase 1 (commit `76e8cf11` + `11530ee2` audit)

**Patch 1 — `GET /api/bookings` filtre élargi** (lignes ~32 et ~46)

Avant :
```js
rows = db.prepare('SELECT * FROM bookings WHERE calendarId = ? AND collaboratorId = ?').all(calendarId, req.auth.collaboratorId);
// ...
rows = db.prepare(`SELECT b.* FROM bookings b JOIN calendars c ON b.calendarId = c.id WHERE c.companyId = ? AND b.collaboratorId = ?`).all(safeCompanyId, req.auth.collaboratorId);
```

Après :
```js
const cid = req.auth.collaboratorId;
rows = db.prepare(
  'SELECT * FROM bookings WHERE calendarId = ? AND (collaboratorId = ? OR agendaOwnerId = ? OR bookedByCollaboratorId = ?)'
).all(calendarId, cid, cid, cid);
// ...
rows = db.prepare(
  `SELECT b.* FROM bookings b JOIN calendars c ON b.calendarId = c.id WHERE c.companyId = ? AND (b.collaboratorId = ? OR b.agendaOwnerId = ? OR b.bookedByCollaboratorId = ?)`
).all(safeCompanyId, cid, cid, cid);
```

**Patch 2 — `PUT /api/bookings/:id` ownership élargi** (ligne ~247)

Avant :
```js
if (req.auth.role !== 'admin' && oldBooking.collaboratorId !== req.auth.collaboratorId) {
  return res.status(403).json({ error: '...' });
}
```

Après :
```js
if (req.auth.role !== 'admin') {
  const cid = req.auth.collaboratorId;
  const isOwner    = oldBooking.collaboratorId === cid;
  const isSender   = oldBooking.bookedByCollaboratorId === cid;
  const isReceiver = oldBooking.agendaOwnerId === cid;
  if (!(isOwner || isSender || isReceiver)) {
    return res.status(403).json({ error: '...' });
  }
}
```

**Patch 3 — `DELETE /api/bookings/:id` ownership élargi** (ligne ~431) : même logique que Patch 2.

### Phase 2

**Patch 4 — Imports + constants en haut de fichier**
```js
import { createNotification } from './notifications.js';
const REPORTING_STATUSES = ['pending', 'validated', 'signed', 'no_show', 'cancelled', 'follow_up', 'other'];
const REPORTING_STATUSES_REQUIRING_NOTE = ['signed', 'cancelled', 'no_show', 'follow_up', 'other'];
```

**Patch 5 — Nouveau `GET /api/bookings/reporting?role=received|sent`** (ajouté avant `export default router`)

**Patch 6 — Nouveau `PUT /api/bookings/:id/report`** (ajouté avant `export default router`)
- Validation : company isolation, scope `share_transfer`, auth receiver/admin/supra, anti-double, enum status, note obligatoire
- Side-effects : audit_logs immutable + createNotification au sender (non-bloquants)

## Backups VPS (rollback)

| Fichier | Phase |
|---|---|
| `/var/www/planora/server/routes/bookings.js.pre-v1103-20260427-201307` | Phase 1 (avant fix isolation) |
| `/var/www/planora/server/routes/bookings.js.pre-v1103-phase2-20260427-202615` | Phase 2 (avant routes reporting) |

## Procédure rollback

```bash
ssh root@136.144.204.115 "
# Rollback Phase 2 only (garder fix isolation Phase 1) :
cp /var/www/planora/server/routes/bookings.js.pre-v1103-phase2-20260427-202615 /var/www/planora/server/routes/bookings.js
# OU rollback complet (revert vers état pré-V1.10.3) :
# cp /var/www/planora/server/routes/bookings.js.pre-v1103-20260427-201307 /var/www/planora/server/routes/bookings.js
pm2 restart calendar360
"
```

DB : pas besoin de DROP les colonnes (DEFAULT '' = no-op si non utilisées).
