// Helper unique — archivage métier d'un collaborateur (Wave D commit 1, règles D.1-D.10).
//
// Comportement par défaut du DELETE /api/collaborators/:id (post-Wave D).
// Réversible via POST /api/collaborators/:id/restore (asymétrique : ne restore PAS les
// réassignations).
//
// Ordre interne strict (consigne MH) :
//   1. validations (collab exists, not already archived, no imminent bookings)
//   2. résolution cible admin (param > auto-select > rejet si pas allow_unassigned)
//   3. réassignation bookings futurs confirmés
//   4. réassignation contacts.assignedTo + nettoyage shared/executor/meeting
//   5. cleanup contact_followers
//   6. cleanup calendars (scope strict — réutilise pattern Phase B)
//   7. archivage collab (UPDATE archivedAt + archivedBy)
//   8. audit log

import { findArchiveTargetAdmin } from './findArchiveTargetAdmin.js';

const IMMINENT_HOURS = 24;

/**
 * @throws { COLLAB_NOT_FOUND | COLLAB_WRONG_COMPANY | ALREADY_ARCHIVED |
 *           BOOKINGS_IMMINENT | NO_ADMIN_AVAILABLE }
 */
export function archiveCollaborator(db, { collabId, actorCollaboratorId, companyId, targetAdminId, allowUnassigned }) {
  if (!collabId) throw new Error('COLLAB_ID_REQUIRED');
  if (!companyId) throw new Error('COMPANY_ID_REQUIRED');

  const collab = db.prepare('SELECT id, companyId, name, role, archivedAt FROM collaborators WHERE id = ?').get(collabId);
  if (!collab) throw new Error('COLLAB_NOT_FOUND');
  if (collab.companyId !== companyId) throw new Error('COLLAB_WRONG_COMPANY');
  if (collab.archivedAt && collab.archivedAt !== '') {
    const e = new Error('ALREADY_ARCHIVED');
    e.archivedAt = collab.archivedAt;
    throw e;
  }

  // D.2 — précondition : aucun booking confirmé dans les 24h
  const cutoff = new Date(Date.now() + IMMINENT_HOURS * 3600 * 1000).toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];
  const imminent = db.prepare(
    `SELECT id, date, time, visitorName FROM bookings
     WHERE collaboratorId = ? AND status = 'confirmed'
       AND date >= ? AND date <= ?
     ORDER BY date ASC, time ASC LIMIT 5`
  ).all(collabId, todayStr, cutoff);
  if (imminent.length > 0) {
    const e = new Error('BOOKINGS_IMMINENT');
    e.imminentCount = imminent.length;
    e.imminentBookings = imminent;
    throw e;
  }

  // D.3 — résolution cible admin
  let resolvedAdminId = targetAdminId || null;
  if (resolvedAdminId) {
    const candidate = db.prepare(
      "SELECT id FROM collaborators WHERE id = ? AND companyId = ? AND role = 'admin' AND (archivedAt IS NULL OR archivedAt = '')"
    ).get(resolvedAdminId, companyId);
    if (!candidate) resolvedAdminId = null; // ignore explicite invalide → re-resolve
  }
  if (!resolvedAdminId) {
    resolvedAdminId = findArchiveTargetAdmin(db, { companyId, exclude: collabId });
  }
  const useUnassigned = !resolvedAdminId && !!allowUnassigned;
  if (!resolvedAdminId && !useUnassigned) {
    throw new Error('NO_ADMIN_AVAILABLE');
  }
  const reassignTo = resolvedAdminId || ''; // '' = pool unassigned

  const now = new Date().toISOString();
  const stats = {
    targetAdminId: resolvedAdminId,
    fallbackUnassigned: useUnassigned,
    reassignedBookingsCount: 0,
    reassignedContactsCount: 0,
    clearedSharedWithCount: 0,
    clearedSharedByCount: 0,
    clearedExecutorCount: 0,
    clearedMeetingCount: 0,
    cleanedFollowersCount: 0,
    cleanedCalendarsCount: 0,
  };

  const run = db.transaction(() => {
    // 3. Réassigner bookings futurs confirmés
    const futureBookings = db.prepare(
      "SELECT id FROM bookings WHERE collaboratorId = ? AND status = 'confirmed' AND date > ?"
    ).all(collabId, cutoff);
    if (futureBookings.length > 0 && reassignTo) {
      // Réassign sur l'admin. Le calendar reste le même (sera potentiellement nettoyé en étape 6 si orphelin).
      const upd = db.prepare("UPDATE bookings SET collaboratorId = ? WHERE collaboratorId = ? AND status = 'confirmed' AND date > ?");
      stats.reassignedBookingsCount = upd.run(reassignTo, collabId, cutoff).changes;
    }
    // Si pool unassigned : on laisse collaboratorId à C, mais on bascule status='pending' pour résolution manuelle admin
    if (futureBookings.length > 0 && !reassignTo) {
      const upd = db.prepare("UPDATE bookings SET status = 'pending' WHERE collaboratorId = ? AND status = 'confirmed' AND date > ?");
      stats.reassignedBookingsCount = upd.run(collabId, cutoff).changes;
    }

    // 4. Réassigner contacts.assignedTo + nettoyer shared/executor/meeting
    const reassignContacts = db.prepare("UPDATE contacts SET assignedTo = ? WHERE assignedTo = ? AND companyId = ?");
    stats.reassignedContactsCount = reassignContacts.run(reassignTo, collabId, companyId).changes;

    const clearSharedWith = db.prepare(
      "UPDATE contacts SET sharedWithId = NULL, sharedById = NULL, sharedAt = NULL, shareNote = NULL WHERE sharedWithId = ? AND companyId = ?"
    );
    stats.clearedSharedWithCount = clearSharedWith.run(collabId, companyId).changes;

    const clearSharedBy = db.prepare(
      "UPDATE contacts SET sharedById = NULL WHERE sharedById = ? AND companyId = ?"
    );
    stats.clearedSharedByCount = clearSharedBy.run(collabId, companyId).changes;

    const clearExecutor = db.prepare("UPDATE contacts SET executorCollaboratorId = NULL WHERE executorCollaboratorId = ? AND companyId = ?");
    stats.clearedExecutorCount = clearExecutor.run(collabId, companyId).changes;

    const clearMeeting = db.prepare("UPDATE contacts SET meetingCollaboratorId = NULL WHERE meetingCollaboratorId = ? AND companyId = ?");
    stats.clearedMeetingCount = clearMeeting.run(collabId, companyId).changes;

    // 5. Cleanup contact_followers
    try {
      const delFollowers = db.prepare("DELETE FROM contact_followers WHERE collaboratorId = ?");
      stats.cleanedFollowersCount = delFollowers.run(collabId).changes;
    } catch (e) { /* table peut ne pas exister */ }

    // 6. Cleanup calendars — scope strict (réutilise pattern Phase B)
    const calsContainingC = db.prepare(
      "SELECT id, name, collaborators_json FROM calendars WHERE collaborators_json LIKE ?"
    ).all('%"' + collabId + '"%');
    for (const cal of calsContainingC) {
      let collabs = [];
      try { collabs = JSON.parse(cal.collaborators_json || '[]'); } catch { collabs = []; }
      if (!collabs.includes(collabId)) continue;
      const updated = collabs.filter(c => c !== collabId);
      db.prepare('UPDATE calendars SET collaborators_json = ? WHERE id = ?').run(JSON.stringify(updated), cal.id);
      if (updated.length === 0) {
        try {
          db.prepare('DELETE FROM calendars WHERE id = ?').run(cal.id);
          stats.cleanedCalendarsCount++;
        } catch (delErr) {
          // FK fail → calendar reste, masqué par filtre API. OK.
        }
      }
    }

    // 7. Archivage collab
    db.prepare("UPDATE collaborators SET archivedAt = ?, archivedBy = ? WHERE id = ?")
      .run(now, actorCollaboratorId || '', collabId);
  });

  run();

  // 8. Audit log (hors transaction — operation séparée, pas critique pour l'atomicité)
  const auditId = 'aud_arch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  try {
    db.prepare(
      `INSERT INTO audit_logs
        (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      auditId, companyId,
      actorCollaboratorId || '', '', '',
      'collaborator_archived', 'collaborator', 'collaborator', collabId,
      `Collaborateur "${collab.name}" archivé${useUnassigned ? ' (pool unassigned)' : ` → admin ${resolvedAdminId}`}`,
      JSON.stringify({
        collabId, collabName: collab.name, archivedBy: actorCollaboratorId,
        ...stats,
      }).slice(0, 2000),
      now
    );
  } catch (e) { console.warn('[ARCHIVE COLLAB] audit_logs insert failed:', e.message); }

  console.log(`[ARCHIVE COLLAB] id=${collabId} name="${collab.name}" by=${actorCollaboratorId || 'unknown'} → admin=${resolvedAdminId || '(unassigned)'} stats=${JSON.stringify(stats)}`);

  return { success: true, collabId, archivedAt: now, ...stats };
}
