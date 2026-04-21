// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Templates — migration atomique (Phase 3)
// ═══════════════════════════════════════════════════════════════════════════
//
// Source : docs/product-pipeline-templates-v1.md §7.2 + §17 cas B/C.
//
// Invariants respectés :
//   #5 — pas d'auto-propagation : l'admin déclenche explicitement
//   #6 — pre-flight check obligatoire effectué avant appel (UI)
//   #7 — aucune perte silencieuse : fallbackStage REQUIS si incompatibles
//   #8 — scope company (WHERE companyId)
//
// Transaction atomique :
//   1. Migre les contacts incompatibles (pipeline_stage → fallbackStage)
//   2. Met à jour collaborators.pipelineMode + pipelineSnapshotId
//   3. Loggue chaque migration dans audit_logs + pipeline_history
// Si une étape échoue : rollback complet.

import { createSnapshot, getLatestSnapshot } from './snapshots.js';
import { computePreflight } from './preflight.js';

/**
 * migrateAndAssign — exécute la transition du collab vers un nouveau mode
 *
 * @param {Database} db
 * @param {Object} params
 * @param {string} params.collaboratorId
 * @param {string|null} params.templateId - ID du template cible, null = retour mode free
 * @param {string|null} params.fallbackStage - ID du stage cible pour les contacts incompatibles (requis si incompatibleCount > 0)
 * @param {string} params.actorId - ID du collab admin qui déclenche (pour audit)
 * @param {string} params.actorName - Nom affiché dans audit
 * @returns {Object} { success, contactsMigrated, snapshot, preflight, previousMode }
 */
export function migrateAndAssign(db, { collaboratorId, templateId, fallbackStage, actorId, actorName }) {
  // 1. Pre-flight re-calculé côté serveur (ne pas faire confiance au client)
  const pf = computePreflight(db, { collaboratorId, templateId });

  if (pf.incompatibleCount > 0) {
    if (!fallbackStage) throw new Error('FALLBACK_STAGE_REQUIRED');
    if (!pf.targetStagesIds.includes(fallbackStage)) throw new Error('FALLBACK_STAGE_INVALID');
  }

  // 2. Créer le snapshot si template cible (ou réutiliser le dernier)
  let targetSnapshotId = null;
  if (templateId) {
    const latest = getLatestSnapshot(db, templateId);
    targetSnapshotId = latest?.id || createSnapshot(db, templateId).id;
  }

  // 3. Transaction atomique
  const now = new Date().toISOString();
  const runInTransaction = db.transaction(() => {
    const contactsMigrated = [];

    // 3.a Migrer les contacts incompatibles
    for (const ct of pf.incompatibleContacts) {
      const previousStage = ct.pipeline_stage;
      // Update contact
      db.prepare(
        "UPDATE contacts SET pipeline_stage = ?, updatedAt = ? WHERE id = ? AND companyId = ?"
      ).run(fallbackStage, now, ct.id, pf.companyId);

      // pipeline_history entry
      const phId = 'ph_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      db.prepare(
        `INSERT INTO pipeline_history
          (id, contactId, companyId, fromStage, toStage, userId, userName, note, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        phId,
        ct.id,
        pf.companyId,
        previousStage,
        fallbackStage,
        actorId || 'system',
        (actorName || 'admin') + ' (template migration)',
        'Migration template: ' + (pf.targetTemplateName || 'mode libre'),
        now
      );

      // audit_logs entry (schema réel : userId/userName/userRole/category/detail/metadata_json)
      const auId = 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      db.prepare(
        `INSERT INTO audit_logs
          (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        auId,
        pf.companyId,
        actorId || '',
        actorName || 'admin',
        'admin',
        'pipeline_template_contact_migrated',
        'pipeline_templates',
        'contact',
        ct.id,
        `Contact migré ${previousStage} → ${fallbackStage} (template ${pf.targetTemplateName || 'mode libre'})`,
        JSON.stringify({
          collaboratorId,
          templateId: templateId || null,
          previousStage,
          fallbackStage,
          targetTemplateName: pf.targetTemplateName,
          reason: 'stage_not_in_target_template',
        }).slice(0, 2000),
        now
      );

      contactsMigrated.push({ id: ct.id, name: ct.name, previousStage, newStage: fallbackStage });
    }

    // 3.b Update collaborator mode + snapshot
    db.prepare(
      "UPDATE collaborators SET pipelineMode = ?, pipelineSnapshotId = ? WHERE id = ?"
    ).run(templateId ? 'template' : 'free', targetSnapshotId, collaboratorId);

    // 3.c audit_log du switch global
    const auSwitchId = 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    db.prepare(
      `INSERT INTO audit_logs
        (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      auSwitchId,
      pf.companyId,
      actorId || '',
      actorName || 'admin',
      'admin',
      templateId ? 'pipeline_template_assigned' : 'pipeline_template_removed',
      'pipeline_templates',
      'collaborator',
      collaboratorId,
      `${pf.currentMode} → ${templateId ? 'template' : 'free'} (${contactsMigrated.length} contacts migrés)`,
      JSON.stringify({
        collaboratorName: pf.collaboratorName,
        previousMode: pf.currentMode,
        newMode: templateId ? 'template' : 'free',
        templateId: templateId || null,
        templateName: pf.targetTemplateName,
        snapshotId: targetSnapshotId,
        version: pf.targetVersion,
        contactsMigrated: contactsMigrated.length,
        fallbackStage: fallbackStage || null,
      }).slice(0, 2000),
      now
    );

    return contactsMigrated;
  });

  let migrated;
  try {
    migrated = runInTransaction();
  } catch (e) {
    throw new Error('MIGRATION_FAILED: ' + e.message);
  }

  return {
    success: true,
    previousMode: pf.currentMode,
    newMode: templateId ? 'template' : 'free',
    contactsMigrated: migrated,
    contactsMigratedCount: migrated.length,
    snapshotId: targetSnapshotId,
    targetTemplateName: pf.targetTemplateName,
  };
}
