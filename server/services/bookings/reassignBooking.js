// V1.10.4.A — Helper centralisé pour les actions sur RDV transmis (cross-collab).
//
// Scope MVP sécurisé Niveau 1 :
//   - reassignBooking         : sender ré-attribue le RDV à un autre collaborateur
//   - cancelBookingTransmission : sender annule la transmission (booking revient chez lui)
//   - resumeBookingByReceiver  : receiver rend le RDV au sender (alias sémantique)
//
// Garde absolue Niveau 1 (CRITIQUE) :
//   Si booking.googleEventId OU booking.outlookEventId existe → REJET 409 EXTERNAL_SYNC_PRESENT.
//   La sync externe complète (delete + recreate atomique) est différée Phase 3 / V1.10.4.B.
//   Aucun état Planora ≠ Google/Outlook autorisé.
//
// Règles métier verrouillées (héritées V3.x.14 / V3.x.15.A/B / V3.x.17.6 / V1.10.3) :
//   - bookedByCollaboratorId IMMUABLE après création (sender reste sender, traçabilité)
//   - calendarId doit appartenir à agendaOwnerId (validateBookingCalendarOwnership)
//   - Pas de fallback calendars[0] (refus EXECUTOR_NO_CALENDAR si pas de cal valide)
//   - Reporting locked si bookingReportingStatus IN ('validated','signed','no_show','cancelled')
//   - Slot conflict via checkBookingConflict (source unique de vérité)
//   - Audit log obligatoire (category='booking_transfer', actions distinctes)
//   - Notifications obligatoires (ancien/nouveau receiver, sender selon action)
//
// Codes erreur retournés (statut HTTP) :
//   400 BOOKING_ID_MISSING / NEW_AGENDA_OWNER_ID_MISSING / EXECUTOR_NO_CALENDAR
//   403 FORBIDDEN
//   404 BOOKING_NOT_FOUND
//   409 EXTERNAL_SYNC_PRESENT / REPORTING_LOCKED / SLOT_CONFLICT
//   409 CALENDAR_OWNER_MISMATCH / CALENDAR_WRONG_COMPANY (via guard)
//   404 CALENDAR_NOT_FOUND (via guard)
//   409 COLLABORATOR_ARCHIVED
//   400 NOT_TRANSFER_BOOKING (si bookingType n'est pas un transfert)
//   500 INTERNAL_ERROR

import { validateBookingCalendarOwnership } from './validateBookingCalendarOwnership.js';
import { checkBookingConflict } from './checkBookingConflict.js';
import { createNotification } from '../../routes/notifications.js';

const REPORTING_LOCKED_STATUSES = ['validated', 'signed', 'no_show', 'cancelled'];

/**
 * Vérifie la garde EXTERNAL_SYNC_PRESENT (Niveau 1 absolute).
 * @returns {Object|null} ResponseObject si rejet, null si OK
 */
function _checkExternalSync(booking) {
  if (booking.googleEventId || booking.outlookEventId) {
    return {
      ok: false,
      code: 'EXTERNAL_SYNC_PRESENT',
      status: 409,
      detail: 'Ce RDV est synchronisé avec Google ou Outlook. Annulez puis recréez le RDV pour changer de collaborateur (sync externe différée Phase 3).',
      googleEventId: booking.googleEventId || null,
      outlookEventId: booking.outlookEventId || null,
    };
  }
  return null;
}

/**
 * Vérifie reporting locked.
 */
function _checkReportingLocked(booking) {
  if (booking.bookingReportingStatus && REPORTING_LOCKED_STATUSES.includes(booking.bookingReportingStatus)) {
    return {
      ok: false,
      code: 'REPORTING_LOCKED',
      status: 409,
      detail: `Le reporting est verrouillé (status=${booking.bookingReportingStatus}). Action impossible.`,
      bookingReportingStatus: booking.bookingReportingStatus,
    };
  }
  return null;
}

/**
 * Trouve un calendrier valide pour un collaborateur cible.
 * Pas de fallback calendars[0] (V3.x.15.B). Retourne null si aucun match.
 */
function _findCalendarForCollaborator(db, companyId, collaboratorId) {
  if (!collaboratorId) return null;
  const cal = db.prepare(
    "SELECT id FROM calendars WHERE companyId = ? AND collaborators_json LIKE ? ORDER BY id LIMIT 1"
  ).get(companyId, `%${collaboratorId}%`);
  return cal ? cal.id : null;
}

/**
 * Vérifie que le collaborateur cible existe et n'est pas archivé.
 */
function _checkCollaboratorActive(db, collaboratorId, companyId) {
  if (!collaboratorId) return { ok: false, code: 'COLLABORATOR_ID_MISSING', status: 400 };
  const collab = db.prepare(
    "SELECT id, name, archivedAt FROM collaborators WHERE id = ? AND companyId = ?"
  ).get(collaboratorId, companyId);
  if (!collab) return { ok: false, code: 'COLLABORATOR_NOT_FOUND', status: 404 };
  if (collab.archivedAt && collab.archivedAt !== '') {
    return { ok: false, code: 'COLLABORATOR_ARCHIVED', status: 409, collaboratorId };
  }
  return { ok: true, collab };
}

/**
 * Insère un audit log structuré.
 */
function _insertAudit(db, { companyId, userId, userName, userRole, action, entityId, detail, metadata }) {
  try {
    const auditId = 'aud' + Date.now() + Math.random().toString(36).slice(2, 6);
    db.prepare(
      `INSERT INTO audit_logs (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      auditId,
      companyId || '',
      userId || '',
      userName || '',
      userRole || '',
      action,
      'booking_transfer',
      'booking',
      entityId,
      detail || '',
      JSON.stringify(metadata || {}),
      new Date().toISOString()
    );
  } catch (e) {
    console.error('[REASSIGN AUDIT ERR]', e.message);
    // Non-bloquant : action validée même si audit fail
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action 1 — Réassignation (sender → nouveau receiver)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param db better-sqlite3 instance
 * @param params {
 *   bookingId, newAgendaOwnerId, newCalendarId? (optionnel — résolu auto si absent),
 *   actorCollabId, actorRole, actorName, companyId
 * }
 * @returns { ok: true, booking, oldAgendaOwnerId } | { ok: false, code, status, detail, ... }
 */
export function reassignBooking(db, { bookingId, newAgendaOwnerId, newCalendarId, actorCollabId, actorRole, actorName, companyId }) {
  if (!bookingId) return { ok: false, code: 'BOOKING_ID_MISSING', status: 400 };
  if (!newAgendaOwnerId) return { ok: false, code: 'NEW_AGENDA_OWNER_ID_MISSING', status: 400 };

  // 1. Lookup booking
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) return { ok: false, code: 'BOOKING_NOT_FOUND', status: 404 };

  const isAdmin = actorRole === 'admin' || actorRole === 'supra';

  // 2. Company isolation (sauf supra)
  if (!isAdmin && companyId && booking.companyId && booking.companyId !== companyId) {
    return { ok: false, code: 'BOOKING_WRONG_COMPANY', status: 403 };
  }
  const safeCompanyId = booking.companyId || companyId || '';

  // 3. Garde EXTERNAL_SYNC_PRESENT (Niveau 1 absolute)
  const extCheck = _checkExternalSync(booking);
  if (extCheck) return extCheck;

  // 4. Permissions : admin/supra OR sender (bookedByCollaboratorId)
  const isSender = booking.bookedByCollaboratorId === actorCollabId && actorCollabId !== '';
  if (!isAdmin && !isSender) {
    return { ok: false, code: 'FORBIDDEN', status: 403, detail: 'Seul le sender (bookedByCollaboratorId) ou un admin peut réassigner ce RDV.' };
  }

  // 5. Reporting locked
  const repCheck = _checkReportingLocked(booking);
  if (repCheck) return repCheck;

  // 6. bookingType doit être un transfert (cohérence métier)
  const isTransferType = ['share_transfer', 'transfer', 'internal'].includes(booking.bookingType);
  if (!isTransferType) {
    return { ok: false, code: 'NOT_TRANSFER_BOOKING', status: 400, detail: `bookingType='${booking.bookingType}' n'est pas un RDV transmis. Réassignation refusée.` };
  }

  // 7. Nouveau collaborateur valide ?
  const collabCheck = _checkCollaboratorActive(db, newAgendaOwnerId, safeCompanyId);
  if (!collabCheck.ok) return collabCheck;
  const newCollab = collabCheck.collab;

  // 8. Résoudre newCalendarId (sans fallback calendars[0])
  let finalCalendarId = newCalendarId;
  if (!finalCalendarId) {
    finalCalendarId = _findCalendarForCollaborator(db, safeCompanyId, newAgendaOwnerId);
    if (!finalCalendarId) {
      return {
        ok: false,
        code: 'EXECUTOR_NO_CALENDAR',
        status: 400,
        detail: `Le collaborateur ${newCollab.name} n'a aucun calendrier configuré. Impossible de réassigner.`,
        newAgendaOwnerId,
      };
    }
  }

  // 9. Guard V3.x.15.A — calendarId doit appartenir à newAgendaOwnerId
  const guard = validateBookingCalendarOwnership(db, { companyId: safeCompanyId, calendarId: finalCalendarId, agendaOwnerId: newAgendaOwnerId });
  if (!guard.ok) return guard;

  // 10. Conflit créneau sur nouveau collab même date/time/duration.
  // V1.10.4.A.fix no-op : excludeBookingId pour ne pas matcher le booking lui-même
  // (cas reassign Ilane→Ilane no-op et bug latent si booking déjà chez nouvelle cible).
  const conflictResult = checkBookingConflict(db, {
    collaboratorId: newAgendaOwnerId,
    date: booking.date,
    startTime: booking.time,
    duration: booking.duration || 30,
    excludeBookingId: bookingId,
  });
  if (conflictResult && conflictResult.conflict) {
    return {
      ok: false,
      code: 'SLOT_CONFLICT',
      status: 409,
      detail: 'Le créneau est déjà occupé sur le nouveau collaborateur.',
      conflictBookingId: conflictResult.existingBooking?.id || null,
    };
  }

  // 11. Si déjà chez ce collab → no-op
  if (booking.agendaOwnerId === newAgendaOwnerId) {
    return { ok: false, code: 'ALREADY_ASSIGNED', status: 400, detail: 'Le RDV est déjà assigné à ce collaborateur.' };
  }

  const oldAgendaOwnerId = booking.agendaOwnerId;
  const oldCalendarId = booking.calendarId;
  const oldReportingStatus = booking.bookingReportingStatus || '';
  const oldReportingNote = booking.bookingReportingNote || '';

  // 12. UPDATE atomique — bookedByCollaboratorId IMMUABLE
  const run = db.transaction(() => {
    db.prepare(
      `UPDATE bookings SET
         agendaOwnerId         = ?,
         collaboratorId        = ?,
         meetingCollaboratorId = ?,
         calendarId            = ?,
         bookingReportingStatus = '',
         bookingReportingNote   = '',
         bookingReportedAt      = '',
         bookingReportedBy      = ''
       WHERE id = ?`
    ).run(newAgendaOwnerId, newAgendaOwnerId, newAgendaOwnerId, finalCalendarId, bookingId);

    _insertAudit(db, {
      companyId: safeCompanyId,
      userId: actorCollabId,
      userName: actorName || '',
      userRole: actorRole || 'member',
      action: 'booking_reassigned',
      entityId: bookingId,
      detail: `Réassignation RDV ${booking.visitorName || ''} → ${newCollab.name}`,
      metadata: {
        oldAgendaOwnerId,
        newAgendaOwnerId,
        oldCalendarId,
        newCalendarId: finalCalendarId,
        bookedByCollaboratorId: booking.bookedByCollaboratorId || '',
        bookingDate: booking.date,
        bookingTime: booking.time,
        contactId: booking.contactId || '',
        oldReportingStatus,
        oldReportingNote,
        bookingType: booking.bookingType,
      },
    });
  });
  run();

  // 13. Notifications (hors transaction, fire-and-forget)
  try {
    if (oldAgendaOwnerId && oldAgendaOwnerId !== actorCollabId) {
      createNotification({
        companyId: safeCompanyId,
        collaboratorId: oldAgendaOwnerId,
        type: 'booking_transmission_cancelled',
        title: 'RDV retiré de votre agenda',
        detail: `Le RDV ${booking.visitorName || ''} du ${booking.date} ${booking.time} a été réassigné à ${newCollab.name}.`,
        contactId: booking.contactId || '',
        contactName: booking.visitorName || '',
      });
    }
    if (newAgendaOwnerId !== actorCollabId) {
      createNotification({
        companyId: safeCompanyId,
        collaboratorId: newAgendaOwnerId,
        type: 'booking_reassigned_incoming',
        title: 'Nouveau RDV réassigné',
        detail: `Un RDV vous a été réassigné par ${actorName || 'un collaborateur'} : ${booking.visitorName || ''} le ${booking.date} ${booking.time}.`,
        contactId: booking.contactId || '',
        contactName: booking.visitorName || '',
      });
    }
  } catch (e) {
    console.error('[REASSIGN NOTIF ERR]', e.message);
  }

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  return { ok: true, booking: updated, oldAgendaOwnerId, oldCalendarId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Action 2 — Annulation transmission (sender retire le RDV → revient chez lui)
// Action 3 — Resume (alias sémantique : receiver rend le RDV au sender)
//
// Effet métier IDENTIQUE pour les 2 actions :
//   le booking revient chez bookedByCollaboratorId (sender) — bookedByCollaboratorId reste lui-même.
// Différences :
//   - cancel-transmission → actor=sender (audit action='booking_transmission_cancelled')
//   - resume              → actor=receiver (audit action='booking_transmission_resumed_by_receiver')
//
// NOTE AMBIGUITÉ MÉTIER : si à la lecture des tests MH veut une autre sémantique
// (ex: "resume" = le sender reprend, identique à cancel-transmission), il suffit
// de changer la garde permission (actor=sender vs actor=receiver) sans modifier
// le reste de la logique.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param mode 'cancel' (sender) | 'resume' (receiver)
 */
function _cancelOrResume(db, { bookingId, actorCollabId, actorRole, actorName, companyId, mode }) {
  if (!bookingId) return { ok: false, code: 'BOOKING_ID_MISSING', status: 400 };
  if (!['cancel', 'resume'].includes(mode)) return { ok: false, code: 'INVALID_MODE', status: 500 };

  // 1. Lookup booking
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) return { ok: false, code: 'BOOKING_NOT_FOUND', status: 404 };

  const isAdmin = actorRole === 'admin' || actorRole === 'supra';

  // 2. Company isolation
  if (!isAdmin && companyId && booking.companyId && booking.companyId !== companyId) {
    return { ok: false, code: 'BOOKING_WRONG_COMPANY', status: 403 };
  }
  const safeCompanyId = booking.companyId || companyId || '';

  // 3. Garde EXTERNAL_SYNC_PRESENT
  const extCheck = _checkExternalSync(booking);
  if (extCheck) return extCheck;

  // 4. Permissions selon mode
  const isSender   = booking.bookedByCollaboratorId === actorCollabId && actorCollabId !== '';
  const isReceiver = booking.agendaOwnerId === actorCollabId && actorCollabId !== '';
  if (mode === 'cancel') {
    if (!isAdmin && !isSender) {
      return { ok: false, code: 'FORBIDDEN', status: 403, detail: 'Seul le sender (bookedByCollaboratorId) ou un admin peut annuler la transmission.' };
    }
  } else {
    // mode = 'resume' : actor doit être le receiver actuel (agendaOwnerId)
    if (!isAdmin && !isReceiver) {
      return { ok: false, code: 'FORBIDDEN', status: 403, detail: 'Seul le receiver (agendaOwnerId) ou un admin peut rendre ce RDV au sender.' };
    }
  }

  // 5. Reporting locked
  const repCheck = _checkReportingLocked(booking);
  if (repCheck) return repCheck;

  // 6. bookingType doit être un transfert
  const isTransferType = ['share_transfer', 'transfer', 'internal'].includes(booking.bookingType);
  if (!isTransferType) {
    return { ok: false, code: 'NOT_TRANSFER_BOOKING', status: 400 };
  }

  // 7. Sender doit exister (bookedByCollaboratorId)
  const senderId = booking.bookedByCollaboratorId;
  if (!senderId) {
    return { ok: false, code: 'NO_SENDER_TO_RESTORE', status: 400, detail: 'bookedByCollaboratorId est vide — impossible de rendre le RDV au sender.' };
  }

  // 8. Sender actif ?
  const senderCheck = _checkCollaboratorActive(db, senderId, safeCompanyId);
  if (!senderCheck.ok) return senderCheck;
  const senderCollab = senderCheck.collab;

  // 9. Calendrier valide pour sender (sans fallback calendars[0])
  const senderCalId = _findCalendarForCollaborator(db, safeCompanyId, senderId);
  if (!senderCalId) {
    return {
      ok: false,
      code: 'EXECUTOR_NO_CALENDAR',
      status: 400,
      detail: `Le sender ${senderCollab.name} n'a aucun calendrier configuré. Impossible de lui rendre le RDV.`,
      senderId,
    };
  }

  // 10. Guard V3.x.15.A
  const guard = validateBookingCalendarOwnership(db, { companyId: safeCompanyId, calendarId: senderCalId, agendaOwnerId: senderId });
  if (!guard.ok) return guard;

  // 11. Conflit créneau chez sender.
  // V1.10.4.A.fix no-op : excludeBookingId pour ne pas matcher le booking lui-même
  // (cas cancel/resume où agendaOwnerId === collaboratorId === senderId déjà → 409 SLOT_CONFLICT
  // erroné car le booking lui-même apparaît dans le scan SQL).
  const conflictResult = checkBookingConflict(db, {
    collaboratorId: senderId,
    date: booking.date,
    startTime: booking.time,
    duration: booking.duration || 30,
    excludeBookingId: bookingId,
  });
  if (conflictResult && conflictResult.conflict) {
    return {
      ok: false,
      code: 'SLOT_CONFLICT',
      status: 409,
      detail: 'Le créneau est déjà occupé chez le sender.',
      conflictBookingId: conflictResult.existingBooking?.id || null,
    };
  }

  // 12. Si déjà chez sender → no-op
  if (booking.agendaOwnerId === senderId) {
    return { ok: false, code: 'ALREADY_AT_SENDER', status: 400, detail: 'Le RDV est déjà chez le sender.' };
  }

  const oldAgendaOwnerId = booking.agendaOwnerId;
  const oldCalendarId = booking.calendarId;
  const oldReportingStatus = booking.bookingReportingStatus || '';
  const oldReportingNote = booking.bookingReportingNote || '';

  // 13. UPDATE atomique — bookedByCollaboratorId IMMUABLE
  const auditAction = mode === 'cancel' ? 'booking_transmission_cancelled' : 'booking_transmission_resumed_by_receiver';
  const auditDetail = mode === 'cancel'
    ? `Sender annule la transmission RDV ${booking.visitorName || ''} → revient chez ${senderCollab.name}`
    : `Receiver renvoie RDV ${booking.visitorName || ''} au sender ${senderCollab.name}`;

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE bookings SET
         agendaOwnerId         = ?,
         collaboratorId        = ?,
         meetingCollaboratorId = ?,
         calendarId            = ?,
         bookingReportingStatus = '',
         bookingReportingNote   = '',
         bookingReportedAt      = '',
         bookingReportedBy      = ''
       WHERE id = ?`
    ).run(senderId, senderId, senderId, senderCalId, bookingId);

    _insertAudit(db, {
      companyId: safeCompanyId,
      userId: actorCollabId,
      userName: actorName || '',
      userRole: actorRole || 'member',
      action: auditAction,
      entityId: bookingId,
      detail: auditDetail,
      metadata: {
        oldAgendaOwnerId,
        newAgendaOwnerId: senderId,
        oldCalendarId,
        newCalendarId: senderCalId,
        bookedByCollaboratorId: booking.bookedByCollaboratorId || '',
        bookingDate: booking.date,
        bookingTime: booking.time,
        contactId: booking.contactId || '',
        oldReportingStatus,
        oldReportingNote,
        bookingType: booking.bookingType,
        mode,
      },
    });
  });
  run();

  // 14. Notifications
  try {
    if (mode === 'cancel') {
      // Sender annule → notifier l'ancien receiver
      if (oldAgendaOwnerId && oldAgendaOwnerId !== actorCollabId) {
        createNotification({
          companyId: safeCompanyId,
          collaboratorId: oldAgendaOwnerId,
          type: 'booking_transmission_cancelled',
          title: 'Transmission de RDV annulée',
          detail: `${actorName || 'Le sender'} a annulé la transmission du RDV ${booking.visitorName || ''} (${booking.date} ${booking.time}).`,
          contactId: booking.contactId || '',
          contactName: booking.visitorName || '',
        });
      }
    } else {
      // Receiver rend → notifier le sender
      if (senderId !== actorCollabId) {
        createNotification({
          companyId: safeCompanyId,
          collaboratorId: senderId,
          type: 'booking_transmission_resumed_by_receiver',
          title: 'Un RDV vous a été rendu',
          detail: `${actorName || 'Un collaborateur'} vous a rendu le RDV ${booking.visitorName || ''} (${booking.date} ${booking.time}).`,
          contactId: booking.contactId || '',
          contactName: booking.visitorName || '',
        });
      }
    }
  } catch (e) {
    console.error('[CANCEL/RESUME NOTIF ERR]', e.message);
  }

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  return { ok: true, booking: updated, oldAgendaOwnerId, oldCalendarId, restoredToSenderId: senderId };
}

export function cancelBookingTransmission(db, params) {
  return _cancelOrResume(db, { ...params, mode: 'cancel' });
}

export function resumeBookingByReceiver(db, params) {
  return _cancelOrResume(db, { ...params, mode: 'resume' });
}
