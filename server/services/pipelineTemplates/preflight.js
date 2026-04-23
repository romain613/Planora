// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Templates — pre-flight check (Phase 3 assignation)
// ═══════════════════════════════════════════════════════════════════════════
//
// Source : docs/product-pipeline-templates-v1.md §8.2 et §17 cas B/C.
// Invariant #6 (pre-flight systématique) + #7 (aucune perte silencieuse).
//
// Rôle : analyse l'impact d'un changement de mode/template sur les contacts
// d'un collaborateur AVANT toute exécution. Retourne un rapport structuré
// que l'UI admin affichera pour confirmation explicite.
//
// Retour :
//   {
//     collaboratorId, collaboratorName, companyId,
//     currentMode, currentTemplateId, currentSnapshotId,
//     targetMode, targetTemplateId, targetSnapshotId, targetTemplateName,
//     targetStagesIds: [...],
//     totalContacts, compatibleCount, incompatibleCount,
//     incompatibleContacts: [
//       { id, name, pipeline_stage, activeBookingsCount, hasContract }
//     ],
//     allTargetStages: [{ id, label, color, icon }],
//     sampleAllContactsStages: { stageId: count }
//   }
//
// N'effectue AUCUNE modification. Lecture seule.

import { resolvePipelineStages, DEFAULT_STAGES } from './resolve.js';

export function computePreflight(db, { collaboratorId, templateId }) {
  const collab = db
    .prepare('SELECT id, name, companyId, pipelineMode, pipelineSnapshotId FROM collaborators WHERE id = ?')
    .get(collaboratorId);
  if (!collab) throw new Error('COLLABORATOR_NOT_FOUND');

  // Résolution stages du template cible (ou mode free si templateId null)
  let targetStages;
  let targetSnapshot = null;
  let targetTemplate = null;

  if (templateId) {
    targetTemplate = db
      .prepare('SELECT id, name, companyId, isPublished, isArchived FROM pipeline_templates WHERE id = ?')
      .get(templateId);
    if (!targetTemplate) throw new Error('TEMPLATE_NOT_FOUND');
    if (targetTemplate.companyId !== collab.companyId) throw new Error('TEMPLATE_WRONG_COMPANY');
    if (targetTemplate.isArchived) throw new Error('TEMPLATE_ARCHIVED');
    if (!targetTemplate.isPublished) throw new Error('TEMPLATE_NOT_PUBLISHED');

    targetSnapshot = db
      .prepare('SELECT id, templateId, version, stagesJson FROM pipeline_template_snapshots WHERE templateId = ? ORDER BY version DESC LIMIT 1')
      .get(templateId);
    if (!targetSnapshot) throw new Error('TEMPLATE_NO_SNAPSHOT');
    try {
      targetStages = JSON.parse(targetSnapshot.stagesJson);
      if (!Array.isArray(targetStages)) throw new Error('invalid');
    } catch {
      throw new Error('SNAPSHOT_INVALID_JSON');
    }
  } else {
    // Retour mode free : union DEFAULT_STAGES + pipeline_stages company
    const customs = db
      .prepare('SELECT id, companyId, label, color, position FROM pipeline_stages WHERE companyId = ? ORDER BY position ASC')
      .all(collab.companyId);
    targetStages = [...DEFAULT_STAGES, ...customs];
  }

  const targetStageIds = new Set(targetStages.map(s => s.id));

  // Charger tous les contacts du collab (assignés via assignedTo OR shared_with_json)
  // Invariant : on ne touche QUE les contacts explicitement assignés au collab
  const contacts = db
    .prepare(
      `SELECT id, name, pipeline_stage, assignedTo, shared_with_json
       FROM contacts
       WHERE companyId = ?
         AND (assignedTo = ? OR shared_with_json LIKE ?)`
    )
    .all(collab.companyId, collaboratorId, '%' + collaboratorId + '%');

  const totalContacts = contacts.length;
  const incompatibleContacts = [];
  const distribution = {};
  for (const ct of contacts) {
    const stage = ct.pipeline_stage || 'nouveau';
    distribution[stage] = (distribution[stage] || 0) + 1;
    if (!targetStageIds.has(stage)) {
      // Contact incompatible : détailler les signaux importants
      const bookingsCount = db
        .prepare("SELECT COUNT(*) c FROM bookings WHERE contactId = ? AND status = 'confirmed' AND date >= date('now')")
        .get(ct.id)?.c || 0;
      const contract = db
        .prepare('SELECT contract_signed FROM contacts WHERE id = ?')
        .get(ct.id);
      incompatibleContacts.push({
        id: ct.id,
        name: ct.name || '(sans nom)',
        pipeline_stage: stage,
        activeBookingsCount: bookingsCount,
        hasContract: !!contract?.contract_signed,
      });
    }
  }

  const compatibleCount = totalContacts - incompatibleContacts.length;

  return {
    collaboratorId,
    collaboratorName: collab.name,
    companyId: collab.companyId,
    currentMode: collab.pipelineMode || 'free',
    currentTemplateId: null, // résolu plus bas si applicable
    currentSnapshotId: collab.pipelineSnapshotId || null,
    targetMode: templateId ? 'template' : 'free',
    targetTemplateId: templateId || null,
    targetSnapshotId: targetSnapshot?.id || null,
    targetTemplateName: targetTemplate?.name || null,
    targetVersion: targetSnapshot?.version || null,
    targetStagesIds: Array.from(targetStageIds),
    allTargetStages: targetStages.map(s => ({
      id: s.id, label: s.label, color: s.color, icon: s.icon || 'tag',
    })),
    totalContacts,
    compatibleCount,
    incompatibleCount: incompatibleContacts.length,
    incompatibleContacts,
    contactsStageDistribution: distribution,
  };
}
