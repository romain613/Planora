// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Templates — logique snapshots (Phase 1 backend foundation)
// ═══════════════════════════════════════════════════════════════════════════
//
// Source : docs/product-pipeline-templates-v1.md §4.2 + §7.1.
//
// Invariant #4 (snapshot figé) : un template publié produit un snapshot immuable.
// L'édition d'un template publié crée un nouveau snapshot (v+1), jamais une
// modification in-place du snapshot existant.
//
// Fonctions :
//   - createSnapshot(db, templateId) : crée un snapshot v(N+1) depuis le template live
//   - getLatestSnapshot(db, templateId) : récupère la dernière version
//   - assignTemplateSnapshotToCollab(db, collabId, snapshotId) : assigne un snapshot
//     à un collab (basculement mode free → template)

export function createSnapshot(db, templateId) {
  const template = db
    .prepare('SELECT id, stagesJson FROM pipeline_templates WHERE id = ?')
    .get(templateId);
  if (!template) throw new Error('TEMPLATE_NOT_FOUND');

  const latest = db
    .prepare('SELECT MAX(version) AS v FROM pipeline_template_snapshots WHERE templateId = ?')
    .get(templateId);
  const version = (latest?.v || 0) + 1;

  const id = 'snap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO pipeline_template_snapshots (id, templateId, version, stagesJson, createdAt) VALUES (?, ?, ?, ?, ?)'
  ).run(id, templateId, version, template.stagesJson, now);

  return { id, templateId, version, stagesJson: template.stagesJson, createdAt: now };
}

export function getLatestSnapshot(db, templateId) {
  return db
    .prepare('SELECT * FROM pipeline_template_snapshots WHERE templateId = ? ORDER BY version DESC LIMIT 1')
    .get(templateId);
}

export function getSnapshot(db, snapshotId) {
  return db
    .prepare('SELECT * FROM pipeline_template_snapshots WHERE id = ?')
    .get(snapshotId);
}

// Assigne un snapshot à un collab. Ne migre PAS les contacts (géré Phase 3).
// Retourne l'état précédent pour audit / rollback.
export function assignTemplateSnapshotToCollab(db, collaboratorId, snapshotId) {
  const prev = db
    .prepare('SELECT pipelineMode, pipelineSnapshotId FROM collaborators WHERE id = ?')
    .get(collaboratorId);
  if (!prev) throw new Error('COLLABORATOR_NOT_FOUND');

  const snapshot = snapshotId ? getSnapshot(db, snapshotId) : null;
  if (snapshotId && !snapshot) throw new Error('SNAPSHOT_NOT_FOUND');

  if (snapshotId) {
    db.prepare(
      "UPDATE collaborators SET pipelineMode = 'template', pipelineSnapshotId = ? WHERE id = ?"
    ).run(snapshotId, collaboratorId);
  } else {
    // Retour en mode free
    db.prepare(
      "UPDATE collaborators SET pipelineMode = 'free', pipelineSnapshotId = NULL WHERE id = ?"
    ).run(collaboratorId);
  }

  return {
    previous: prev,
    current: {
      pipelineMode: snapshotId ? 'template' : 'free',
      pipelineSnapshotId: snapshotId || null,
    },
  };
}
