// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Templates — résolution runtime (Phase 1 backend foundation)
// ═══════════════════════════════════════════════════════════════════════════
//
// Source : docs/product-pipeline-templates-v1.md §5 "Logique métier — résolution runtime".
//
// Rôle : fonction pure qui résout, pour un (companyId, collabId), la liste
// unifiée des stages pipeline à afficher. Consommée par l'endpoint
// GET /api/data/pipeline-stages-resolved.
//
// Comportement :
//   - mode='free' (défaut legacy) : DEFAULT_STAGES frontend + stages custom company
//   - mode='template' avec snapshot valide : stages issus du snapshot figé
//   - mode='template' mais snapshot introuvable (fallback défensif) : même sortie
//     que 'free' avec _warning:'snapshot_not_found' pour monitoring
//
// Garantie : jamais d'exception, toujours une liste non-vide de stages.

// DEFAULT_STAGES miroir des constantes frontend (app/src/features/collab/CollabPortal.jsx L2282).
// Kept in sync manually — futur refacto Phase ≥2 pourra les data-driver.
const DEFAULT_STAGES = [
  { id: 'nouveau',       label: 'Nouveau',        color: '#2563EB', icon: 'plus',          position: 10, isDefault: 1 },
  { id: 'contacte',      label: 'En discussion',  color: '#F59E0B', icon: 'message-circle',position: 20, isDefault: 1 },
  { id: 'qualifie',      label: 'Intéressé',      color: '#7C3AED', icon: 'star',          position: 30, isDefault: 1 },
  { id: 'rdv_programme', label: 'RDV Programmé',  color: '#0EA5E9', icon: 'calendar',      position: 40, isDefault: 1 },
  { id: 'nrp',           label: 'NRP',            color: '#EF4444', icon: 'phone-off',     position: 50, isDefault: 1 },
  { id: 'client_valide', label: 'Client Validé',  color: '#22C55E', icon: 'check-circle',  position: 60, isDefault: 1 },
  { id: 'perdu',         label: 'Perdu',          color: '#64748B', icon: 'x-circle',      position: 70, isDefault: 1 },
];

export function resolvePipelineStages(db, { companyId, collaboratorId }) {
  // Mode free par défaut quand pas de collab (ex: admin vue globale)
  const collab = collaboratorId
    ? db.prepare('SELECT pipelineMode, pipelineSnapshotId FROM collaborators WHERE id = ?').get(collaboratorId)
    : null;

  const mode = (collab?.pipelineMode === 'template' && collab?.pipelineSnapshotId) ? 'template' : 'free';

  if (mode === 'free') {
    const customs = db
      .prepare('SELECT id, companyId, label, color, position, isDefault FROM pipeline_stages WHERE companyId = ? ORDER BY position ASC')
      .all(companyId || '');
    const stages = [...DEFAULT_STAGES, ...customs.map(c => ({ ...c, icon: c.icon || 'tag' }))];
    return { mode: 'free', stages, readOnly: false, templateMeta: null };
  }

  // Mode template — résolution du snapshot
  const snapshot = db
    .prepare('SELECT id, templateId, version, stagesJson FROM pipeline_template_snapshots WHERE id = ?')
    .get(collab.pipelineSnapshotId);

  if (!snapshot) {
    // Fallback défensif : snapshot introuvable → dégrader en mode free pour ne pas bloquer le collab.
    const customs = db
      .prepare('SELECT id, companyId, label, color, position, isDefault FROM pipeline_stages WHERE companyId = ? ORDER BY position ASC')
      .all(companyId || '');
    const stages = [...DEFAULT_STAGES, ...customs.map(c => ({ ...c, icon: c.icon || 'tag' }))];
    return {
      mode: 'free',
      stages,
      readOnly: false,
      templateMeta: null,
      _warning: 'snapshot_not_found',
    };
  }

  let stages;
  try {
    stages = JSON.parse(snapshot.stagesJson);
    if (!Array.isArray(stages) || stages.length === 0) throw new Error('empty stages');
  } catch {
    // JSON corrompu → fallback défensif
    stages = DEFAULT_STAGES;
    return {
      mode: 'free',
      stages,
      readOnly: false,
      templateMeta: null,
      _warning: 'snapshot_invalid_json',
    };
  }

  const template = db
    .prepare('SELECT id, name, icon, color FROM pipeline_templates WHERE id = ?')
    .get(snapshot.templateId);

  return {
    mode: 'template',
    stages,
    readOnly: true,
    templateMeta: {
      templateId: snapshot.templateId,
      snapshotId: snapshot.id,
      version: snapshot.version,
      name: template?.name || '',
      icon: template?.icon || 'star',
      color: template?.color || '#7C3AED',
    },
  };
}

export { DEFAULT_STAGES };
