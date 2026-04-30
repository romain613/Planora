// ═══════════════════════════════════════════════════════════════════════════
// Routes Contact Share V1 — partage contact + RDV inter-collab
// ═══════════════════════════════════════════════════════════════════════════
//
// Endpoints :
//   POST /api/contact-share/send              — partage un contact + crée un RDV
//   POST /api/contact-share/desync/:contactId — désynchronise le partage
//
// Toutes les routes : requireAuth + enforceCompany (scope company).

import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';
import { sendContactToCollab, desyncContactShare } from '../services/contactShare/share.js';

const router = Router();

// Map message → HTTP status
const ERR_MAP = {
  CONTACT_ID_REQUIRED: 400,
  TARGET_COLLAB_REQUIRED: 400,
  ACTOR_COLLAB_REQUIRED: 401,
  COMPANY_ID_REQUIRED: 400,
  CANNOT_SHARE_WITH_SELF: 400,
  CONTACT_NOT_FOUND: 404,
  CONTACT_WRONG_COMPANY: 403,
  TARGET_COLLAB_INVALID: 404,
  ACTOR_COLLAB_INVALID: 401,
  NOT_AUTHORIZED_ON_CONTACT: 403,
  NOT_AUTHORIZED_ON_SHARE: 403,
  CONTACT_NOT_SHARED: 400,
  CONTACT_ALREADY_SHARED: 409,
  SLOT_CONFLICT: 409,
  TARGET_COLLAB_ARCHIVED: 409,
  ACTOR_COLLAB_ARCHIVED: 409,
  CONTACT_ARCHIVED: 409,
};

// ─── POST /api/contact-share/send ──────────────────────────────────────────
router.post('/send', requireAuth, enforceCompany, (req, res) => {
  try {
    const {
      contactId,
      targetCollaboratorId,
      bookingDate,
      bookingTime,
      bookingDuration,
      calendarId,
      note,
    } = req.body || {};

    const actorCollaboratorId = req.auth.collaboratorId;
    const companyId = req.auth.companyId || req.auth._activeCompanyId || req.body.companyId;
    if (!actorCollaboratorId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

    // V1.12.6 — refus partage si contact archive
    if (contactId) {
      const ct = db.prepare('SELECT archivedAt FROM contacts WHERE id = ? AND companyId = ?').get(contactId, companyId);
      if (ct?.archivedAt && ct.archivedAt !== '') {
        return res.status(409).json({ error: 'CONTACT_ARCHIVED', contactId, archivedAt: ct.archivedAt });
      }
    }

    const result = sendContactToCollab(db, {
      contactId,
      targetCollaboratorId,
      actorCollaboratorId,
      companyId,
      bookingDate,
      bookingTime,
      bookingDuration,
      calendarId,
      note,
    });
    res.json(result);
  } catch (err) {
    console.error('[CONTACT_SHARE SEND]', err);
    const status = ERR_MAP[err.message] || 500;
    const body = { error: err.message };
    // Détails utiles pour CONTACT_ALREADY_SHARED → l'UI peut afficher avec qui
    if (err.message === 'CONTACT_ALREADY_SHARED') {
      if (err.sharedWithId) body.sharedWithId = err.sharedWithId;
      if (err.sharedById) body.sharedById = err.sharedById;
    }
    if (err.message === 'SLOT_CONFLICT') {
      if (err.conflictBookingId) body.conflictBookingId = err.conflictBookingId;
      if (err.conflictTime) body.conflictTime = err.conflictTime;
    }
    res.status(status).json(body);
  }
});

// ─── POST /api/contact-share/desync/:contactId ──────────────────────────────
router.post('/desync/:contactId', requireAuth, enforceCompany, (req, res) => {
  try {
    const contactId = req.params.contactId;
    const actorCollaboratorId = req.auth.collaboratorId;
    const companyId = req.auth.companyId || req.auth._activeCompanyId;
    if (!actorCollaboratorId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

    // V1.12.6 — refus desync si contact archive
    const ct = db.prepare('SELECT archivedAt FROM contacts WHERE id = ? AND companyId = ?').get(contactId, companyId);
    if (ct?.archivedAt && ct.archivedAt !== '') {
      return res.status(409).json({ error: 'CONTACT_ARCHIVED', contactId, archivedAt: ct.archivedAt });
    }

    const result = desyncContactShare(db, { contactId, actorCollaboratorId, companyId });
    res.json(result);
  } catch (err) {
    console.error('[CONTACT_SHARE DESYNC]', err);
    const status = ERR_MAP[err.message] || 500;
    res.status(status).json({ error: err.message });
  }
});

export default router;
