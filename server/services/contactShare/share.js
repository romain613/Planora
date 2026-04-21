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

  const targetCollab = db.prepare('SELECT id, companyId, name FROM collaborators WHERE id = ?').get(targetCollaboratorId);
  if (!targetCollab || targetCollab.companyId !== companyId) throw new Error('TARGET_COLLAB_INVALID');

  const actorCollab = db.prepare('SELECT id, companyId, name FROM collaborators WHERE id = ?').get(actorCollaboratorId);
  if (!actorCollab || actorCollab.companyId !== companyId) throw new Error('ACTOR_COLLAB_INVALID');

  // Autorisation : l'émetteur doit être owner OU déjà sharedWithId
  const isOwner = contact.assignedTo === actorCollaboratorId;
  const isShared = contact.sharedWithId === actorCollaboratorId;
  if (!isOwner && !isShared) throw new Error('NOT_AUTHORIZED_ON_CONTACT');

  // Si déjà un partage en cours : le remplacer (1 seul partage à la fois V1)
  const hasExistingShare = !!contact.sharedWithId;

  const now = nowIso();
  let createdBookingId = null;

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

      // Incrémenter totalBookings du contact
      try {
        db.prepare('UPDATE contacts SET totalBookings = COALESCE(totalBookings, 0) + 1 WHERE id = ?').run(contactId);
      } catch {}

      // Marquer le prochain RDV
      try {
        db.prepare(
          "UPDATE contacts SET next_rdv_date = ?, next_rdv_booking_id = ?, rdv_status = 'programme' WHERE id = ?"
        ).run(bookingDate + (bookingTime ? 'T' + bookingTime : ''), createdBookingId, contactId);
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
