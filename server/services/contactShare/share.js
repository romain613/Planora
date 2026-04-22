// ═══════════════════════════════════════════════════════════════════════════
// Contact Share V1 — logique partage + RDV + désynchronisation
// ═══════════════════════════════════════════════════════════════════════════
//
// Source : règle MH 2026-04-21 "V1 simple, rapide à livrer, stable".
//
// Opérations atomiques (transaction better-sqlite3) :
//   - sendContactToCollab : marque le partage + crée un RDV dans l'agenda
//     du destinataire + logue audit
//   - desyncContactShare : le destinataire devient owner, les champs share
//     sont nettoyés, le contact disparaît du pipeline de l'émetteur

import { checkBookingConflict } from '../bookings/checkBookingConflict.js';
import { applyBookingCreatedSideEffects } from '../bookings/applyBookingCreatedSideEffects.js';

// Helper : génère un id court style "bk_<ts>_<rand>"
function newId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}
function nowIso() {
  return new Date().toISOString();
}

// ─── sendContactToCollab ────────────────────────────────────────────────
// Partage un contact + crée un RDV dans l'agenda du collaborateur cible.
//
// @param db
// @param params {
//   contactId,
//   targetCollaboratorId,     // destinataire
//   actorCollaboratorId,      // émetteur (= caller)
//   companyId,
//   bookingDate,              // 'YYYY-MM-DD' (optionnel — si absent, pas de RDV créé)
//   bookingTime,              // 'HH:MM'
//   bookingDuration,          // minutes (défaut 30)
//   calendarId,               // calendrier cible (à choisir dans l'UI)
//   note,                     // note de transmission (optionnelle)
// }
// @returns { success, contactId, sharedWithId, sharedById, bookingId? }
export function sendContactToCollab(db, params) {
  const {
    contactId,
    targetCollaboratorId,
    actorCollaboratorId,
    companyId,
    bookingDate,
    bookingTime,
    bookingDuration = 30,
    calendarId,
    note = '',
  } = params;

  if (!contactId) throw new Error('CONTACT_ID_REQUIRED');
  if (!targetCollaboratorId) throw new Error('TARGET_COLLAB_REQUIRED');
  if (!actorCollaboratorId) throw new Error('ACTOR_COLLAB_REQUIRED');
  if (!companyId) throw new Error('COMPANY_ID_REQUIRED');
  if (targetCollaboratorId === actorCollaboratorId) throw new Error('CANNOT_SHARE_WITH_SELF');

  // Vérifications
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!contact) throw new Error('CONTACT_NOT_FOUND');
  if (contact.companyId !== companyId) throw new Error('CONTACT_WRONG_COMPANY');

  const targetCollab = db.prepare('SELECT id, companyId, name, archivedAt FROM collaborators WHERE id = ?').get(targetCollaboratorId);
  if (!targetCollab || targetCollab.companyId !== companyId) throw new Error('TARGET_COLLAB_INVALID');
  if (targetCollab.archivedAt && targetCollab.archivedAt !== '') throw new Error('TARGET_COLLAB_ARCHIVED');

  const actorCollab = db.prepare('SELECT id, companyId, name, archivedAt FROM collaborators WHERE id = ?').get(actorCollaboratorId);
  if (!actorCollab || actorCollab.companyId !== companyId) throw new Error('ACTOR_COLLAB_INVALID');
  if (actorCollab.archivedAt && actorCollab.archivedAt !== '') throw new Error('ACTOR_COLLAB_ARCHIVED');

  // Autorisation : l'émetteur doit être owner OU déjà sharedWithId
  const isOwner = contact.assignedTo === actorCollaboratorId;
  const isShared = contact.sharedWithId === actorCollaboratorId;
  if (!isOwner && !isShared) throw new Error('NOT_AUTHORIZED_ON_CONTACT');

  // Blocage si déjà partagé (ajustement post-V1 — éviter les ré-assignations accidentelles).
  // Le collab doit d'abord désynchroniser avant de re-partager. Le flag `force` peut être
  // passé pour bypass explicite (réservé usage interne / admin tools).
  const hasExistingShare = !!contact.sharedWithId;
  if (hasExistingShare && !params.force) {
    const err = new Error('CONTACT_ALREADY_SHARED');
    err.sharedWithId = contact.sharedWithId;
    err.sharedById = contact.sharedById;
    throw err;
  }

  const now = nowIso();
  let createdBookingId = null;

  // R1 + R5 — check conflit AVANT d'ouvrir la transaction (rejet propre, pas de rollback silencieux)
  if (bookingDate && bookingTime && calendarId) {
    const { conflict, existingBooking } = checkBookingConflict(db, {
      collaboratorId: targetCollaboratorId,
      date: bookingDate,
      startTime: bookingTime,
      duration: bookingDuration || 30,
    });
    if (conflict) {
      console.log(`[CONTACT-SHARE CONFLICT] target=${targetCollaboratorId} date=${bookingDate} time=${bookingTime} vs existing=${existingBooking.id}@${existingBooking.time}`);
      const err = new Error('SLOT_CONFLICT');
      err.conflictBookingId = existingBooking.id;
      err.conflictTime = existingBooking.time;
      throw err;
    }
  }

  const run = db.transaction(() => {
    // 1. Update contact — marquer le partage
    // Règle : l'owner reste inchangé (l'émetteur). Le destinataire prend sharedWithId.
    db.prepare(
      `UPDATE contacts
       SET sharedWithId = ?, sharedById = ?, sharedAt = ?, shareNote = ?, updatedAt = ?
       WHERE id = ? AND companyId = ?`
    ).run(targetCollaboratorId, actorCollaboratorId, now, note || null, now, contactId, companyId);

    // 2. Créer booking dans l'agenda du destinataire (si date/time fournis)
    if (bookingDate && bookingTime && calendarId) {
      createdBookingId = newId('bk');
      const visitorName = contact.name || '';
      const visitorEmail = contact.email || '';
      const visitorPhone = contact.phone || '';
      db.prepare(
        `INSERT INTO bookings (
          id, calendarId, collaboratorId, date, time, duration,
          visitorName, visitorEmail, visitorPhone,
          status, notes, internalNotes,
          source, companyId, contactId,
          bookedByCollaboratorId, meetingCollaboratorId, agendaOwnerId, bookingType
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, 'share_transfer', ?, ?, ?, ?, ?, 'share_transfer')`
      ).run(
        createdBookingId,
        calendarId,
        targetCollaboratorId,
        bookingDate,
        bookingTime,
        bookingDuration,
        visitorName,
        visitorEmail,
        visitorPhone,
        note || '',
        `Contact partagé par ${actorCollab.name}${note ? ' — ' + note : ''}`,
        companyId,
        contactId,
        actorCollaboratorId,
        targetCollaboratorId,
        targetCollaboratorId
      );

      // Lien booking ↔ contact (champ spécifique V1 share — pas géré par le helper).
      // totalBookings, next_rdv_date, rdv_status, pipeline_stage, behavior_score
      // sont appliqués via applyBookingCreatedSideEffects() après la transaction.
      try {
        db.prepare('UPDATE contacts SET next_rdv_booking_id = ? WHERE id = ?').run(createdBookingId, contactId);
      } catch {}
    }

    // 3. Audit log (respect schéma réel : userId/userName/userRole/category/detail/metadata_json)
    const auditId = 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    db.prepare(
      `INSERT INTO audit_logs
        (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      auditId,
      companyId,
      actorCollaboratorId,
      actorCollab.name || '',
      'member',
      'contact_shared',
      'contact_share',
      'contact',
      contactId,
      `${actorCollab.name} → ${targetCollab.name}${hasExistingShare ? ' (remplace partage antérieur)' : ''}${createdBookingId ? ' avec RDV' : ''}`,
      JSON.stringify({
        contactId,
        targetCollaboratorId,
        targetName: targetCollab.name,
        bookingId: createdBookingId,
        bookingDate: bookingDate || null,
        bookingTime: bookingTime || null,
        note: note || null,
        replacedExisting: hasExistingShare,
      }).slice(0, 2000),
      now
    );
  });

  run();

  // Effets de bord booking créé (hors transaction — autoPipelineAdvance + behavior_score + totalBookings + rdv_status)
  // Uniquement si un vrai RDV a été créé. Si share sans RDV → pas d'effet pipeline.
  if (createdBookingId) {
    applyBookingCreatedSideEffects(db, {
      contactId,
      bookingDate,
      source: 'contact_share_booking',
    });
  }

  return {
    success: true,
    contactId,
    sharedWithId: targetCollaboratorId,
    sharedById: actorCollaboratorId,
    sharedAt: now,
    bookingId: createdBookingId,
  };
}

// ─── desyncContactShare ─────────────────────────────────────────────────
// L'émetteur se désynchronise : le destinataire devient owner.
//
// @param db
// @param params { contactId, actorCollaboratorId, companyId }
// @returns { success, contactId, newOwnerId, previousOwnerId }
export function desyncContactShare(db, params) {
  const { contactId, actorCollaboratorId, companyId } = params;
  if (!contactId) throw new Error('CONTACT_ID_REQUIRED');
  if (!actorCollaboratorId) throw new Error('ACTOR_COLLAB_REQUIRED');
  if (!companyId) throw new Error('COMPANY_ID_REQUIRED');

  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!contact) throw new Error('CONTACT_NOT_FOUND');
  if (contact.companyId !== companyId) throw new Error('CONTACT_WRONG_COMPANY');
  if (!contact.sharedWithId) throw new Error('CONTACT_NOT_SHARED');

  // Seul l'émetteur actuel (sharedById) peut désynchroniser.
  // Le destinataire (sharedWithId) peut aussi : dans tous les cas, le contact bascule
  // vers le destinataire. Ici on autorise les 2 pour la V1 simple.
  const isSender = contact.sharedById === actorCollaboratorId;
  const isReceiver = contact.sharedWithId === actorCollaboratorId;
  if (!isSender && !isReceiver) throw new Error('NOT_AUTHORIZED_ON_SHARE');

  const newOwnerId = contact.sharedWithId;
  const previousOwnerId = contact.assignedTo;
  const now = nowIso();

  const actorCollab = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(actorCollaboratorId);

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE contacts
       SET assignedTo = ?, sharedWithId = NULL, sharedById = NULL, sharedAt = NULL, shareNote = NULL, updatedAt = ?
       WHERE id = ? AND companyId = ?`
    ).run(newOwnerId, now, contactId, companyId);

    const auditId = 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    db.prepare(
      `INSERT INTO audit_logs
        (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      auditId,
      companyId,
      actorCollaboratorId,
      actorCollab?.name || '',
      isSender ? 'sender' : 'receiver',
      'contact_share_desync',
      'contact_share',
      'contact',
      contactId,
      `Désynchronisation — owner bascule vers ${newOwnerId}`,
      JSON.stringify({
        contactId,
        previousOwnerId,
        newOwnerId,
        triggeredBy: isSender ? 'sender' : 'receiver',
      }).slice(0, 2000),
      now
    );
  });

  run();

  return { success: true, contactId, newOwnerId, previousOwnerId };
}
