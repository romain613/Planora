// Phase S1 — Fingerprint "pas cher" de l'état d'un collab.
// Utilisé en Phase S2 pour change detection : si fingerprint identique au dernier snapshot,
// on skippe (pas de flash inutile).
//
// Philosophie : hash sha256 d'un tuple (id, updatedAt/colonne-mutable) sur les 3 tables
// les plus mouvementées. Pas exhaustif, mais capture 95 %+ des changements métier observables.

import { createHash } from 'crypto';
import { db } from '../../db/database.js';

/**
 * @param {{ companyId: string, collabId: string }} args
 * @returns {string} fingerprint hexadécimal (sha256).
 */
export function computeCollabFingerprint({ companyId, collabId }) {
  if (!companyId || !collabId) {
    throw new Error('computeCollabFingerprint: companyId and collabId required');
  }

  const parts = [];

  // 1. contacts — (id, updatedAt, pipeline_stage, status) trié par id.
  // V1.10.1 : aligné sur scope.js (5 colonnes ownership). Sans cet alignement,
  // un changement de pipeline_stage sur un contact assignedTo (sans owner/executor) ne déclenchait
  // PAS de snapshot dirty → bug critique invisible.
  const contacts = db
    .prepare(
      'SELECT id, updatedAt, pipeline_stage, status FROM contacts ' +
        "WHERE companyId = ? AND (ownerCollaboratorId = ? OR executorCollaboratorId = ? OR assignedTo = ? OR sharedWithId = ? OR shared_with_json LIKE '%\"' || ? || '\"%') " +
        'ORDER BY id'
    )
    .all(companyId, collabId, collabId, collabId, collabId, collabId);
  parts.push(
    'contacts:' +
      contacts
        .map((c) => `${c.id}|${c.updatedAt || ''}|${c.pipeline_stage || ''}|${c.status || ''}`)
        .join(';')
  );

  // 2. contact_followers actifs — (id, role, updatedAt)
  const followers = db
    .prepare(
      'SELECT id, role, updatedAt FROM contact_followers ' +
        'WHERE companyId = ? AND collaboratorId = ? AND isActive = 1 ' +
        'ORDER BY id'
    )
    .all(companyId, collabId);
  parts.push(
    'followers:' + followers.map((f) => `${f.id}|${f.role}|${f.updatedAt || ''}`).join(';')
  );

  // 3. bookings — (id, status, date)
  const bookings = db
    .prepare(
      'SELECT id, status, date, bookingOutcome FROM bookings ' +
        'WHERE companyId = ? AND (collaboratorId = ? OR meetingCollaboratorId = ? OR bookedByCollaboratorId = ? OR agendaOwnerId = ?) ' +
        'ORDER BY id'
    )
    .all(companyId, collabId, collabId, collabId, collabId);
  parts.push(
    'bookings:' +
      bookings
        .map((b) => `${b.id}|${b.status || ''}|${b.date || ''}|${b.bookingOutcome || ''}`)
        .join(';')
  );

  return createHash('sha256').update(parts.join('\n')).digest('hex');
}
