// Helper — hard-delete collaborateur (Wave D commit 2, règle D.7).
// Cas exceptionnel, conditions cumulatives strictes. Cascade DELETE alignée
// sur la logique historique (availabilities, google_events, secure_ia_*,
// ai_copilot_analyses, calendars scope strict), puis DELETE collaborators.
//
// Ne pas contourner l'archivage — ce helper est conçu pour être appelé APRÈS
// que l'archivage a déjà vidé les contacts/bookings actifs.

const MIN_ARCHIVED_DAYS = 30;

/**
 * @throws { COLLAB_ID_REQUIRED | COMPANY_ID_REQUIRED | COLLAB_NOT_FOUND |
 *           COLLAB_WRONG_COMPANY | NOT_ARCHIVED | ARCHIVED_TOO_RECENT |
 *           ACTIVE_CONTACTS_REMAINING | BOOKINGS_REMAINING }
 */
export function hardDeleteCollaborator(db, { collabId, actorCollaboratorId, companyId }) {
  if (!collabId) throw new Error('COLLAB_ID_REQUIRED');
  if (!companyId) throw new Error('COMPANY_ID_REQUIRED');

  // 1. Existence + company match
  const collab = db.prepare('SELECT id, companyId, name, archivedAt FROM collaborators WHERE id = ?').get(collabId);
  if (!collab) throw new Error('COLLAB_NOT_FOUND');
  if (collab.companyId !== companyId) throw new Error('COLLAB_WRONG_COMPANY');

  // 2. Doit être archivé
  if (!collab.archivedAt || collab.archivedAt === '') {
    throw new Error('NOT_ARCHIVED');
  }

  // 3. Archivé depuis > 30 jours
  const archivedMs = new Date(collab.archivedAt).getTime();
  if (isNaN(archivedMs)) {
    const e = new Error('ARCHIVED_TOO_RECENT');
    e.reason = 'invalid_archivedAt';
    throw e;
  }
  const daysSinceArchive = (Date.now() - archivedMs) / (24 * 3600 * 1000);
  if (daysSinceArchive < MIN_ARCHIVED_DAYS) {
    const e = new Error('ARCHIVED_TOO_RECENT');
    e.daysSinceArchive = Math.floor(daysSinceArchive);
    e.minRequiredDays = MIN_ARCHIVED_DAYS;
    throw e;
  }

  // 4. Aucun contact actif référençant encore le collab (défense profonde post-archivage)
  const activeContactsRow = db.prepare(
    `SELECT COUNT(*) n FROM contacts
     WHERE assignedTo = ? OR sharedWithId = ? OR sharedById = ?
        OR executorCollaboratorId = ? OR meetingCollaboratorId = ? OR ownerCollaboratorId = ?`
  ).get(collabId, collabId, collabId, collabId, collabId, collabId);
  if (activeContactsRow.n > 0) {
    const e = new Error('ACTIVE_CONTACTS_REMAINING');
    e.count = activeContactsRow.n;
    throw e;
  }

  // 5. Aucun booking référençant encore le collab (tout status, passé ou futur)
  const bookingsRow = db.prepare("SELECT COUNT(*) n FROM bookings WHERE collaboratorId = ?").get(collabId);
  if (bookingsRow.n > 0) {
    const e = new Error('BOOKINGS_REMAINING');
    e.count = bookingsRow.n;
    throw e;
  }

  // 6. Cascade DELETE (aligné sur logique historique pré-Wave D)
  const stats = {
    availabilities: 0, google_events: 0, secure_ia_alerts: 0, secure_ia_reports: 0,
    ai_copilot_analyses: 0, calendars_cleaned: 0,
  };
  const run = db.transaction(() => {
    try { stats.availabilities = db.prepare('DELETE FROM availabilities WHERE collaboratorId = ?').run(collabId).changes; } catch {}
    try { stats.google_events = db.prepare('DELETE FROM google_events WHERE collaboratorId = ?').run(collabId).changes; } catch {}
    try { stats.secure_ia_alerts = db.prepare('DELETE FROM secure_ia_alerts WHERE collaboratorId = ?').run(collabId).changes; } catch {}
    try { stats.secure_ia_reports = db.prepare('DELETE FROM secure_ia_reports WHERE collaboratorId = ?').run(collabId).changes; } catch {}
    try { stats.ai_copilot_analyses = db.prepare('DELETE FROM ai_copilot_analyses WHERE collaboratorId = ?').run(collabId).changes; } catch {}

    // Calendars scope strict : pré-filtre SQL + runtime guard (pattern Phase B)
    const cals = db.prepare(
      "SELECT id, name, collaborators_json FROM calendars WHERE collaborators_json LIKE ?"
    ).all('%"' + collabId + '"%');
    for (const cal of cals) {
      let arr = [];
      try { arr = JSON.parse(cal.collaborators_json || '[]'); } catch { arr = []; }
      if (!arr.includes(collabId)) continue;
      const filtered = arr.filter(c => c !== collabId);
      db.prepare('UPDATE calendars SET collaborators_json = ? WHERE id = ?').run(JSON.stringify(filtered), cal.id);
      if (filtered.length === 0) {
        try {
          db.prepare('DELETE FROM calendars WHERE id = ?').run(cal.id);
          stats.calendars_cleaned++;
        } catch (delErr) { /* FK fail → reste orphelin, masqué par filtre API */ }
      }
    }

    // DELETE collaborator
    db.prepare('DELETE FROM collaborators WHERE id = ?').run(collabId);
  });

  run();

  // 7. Audit log (hors transaction)
  const auditId = 'aud_hard_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  try {
    db.prepare(
      `INSERT INTO audit_logs
        (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      auditId, companyId,
      actorCollaboratorId || '', '', '',
      'collaborator_hard_deleted', 'collaborator', 'collaborator', collabId,
      `Hard-delete collaborateur "${collab.name}" (archivé depuis ${Math.floor(daysSinceArchive)}j)`,
      JSON.stringify({
        collabId, collabName: collab.name, archivedAt: collab.archivedAt,
        daysSinceArchive: Math.floor(daysSinceArchive),
        cascadeStats: stats,
      }).slice(0, 2000),
      new Date().toISOString()
    );
  } catch (e) { console.warn('[HARD DELETE COLLAB] audit_logs insert failed:', e.message); }

  console.log(`[HARD DELETE COLLAB] id=${collabId} name="${collab.name}" by=${actorCollaboratorId || 'unknown'} daysSinceArchive=${Math.floor(daysSinceArchive)} stats=${JSON.stringify(stats)}`);

  return { success: true, collabId, daysSinceArchive: Math.floor(daysSinceArchive), cascadeStats: stats };
}
