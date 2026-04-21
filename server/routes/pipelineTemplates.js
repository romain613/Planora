// ═══════════════════════════════════════════════════════════════════════════
// Routes Admin — Pipeline Templates (Phase 1 backend foundation)
// ═══════════════════════════════════════════════════════════════════════════
//
// Source : docs/product-pipeline-templates-v1.md §10 Phase 1 livrables.
//
// Endpoints (tous protégés requireAuth + requireAdmin + enforceCompany) :
//
//   Liste / lecture
//     GET    /api/admin/pipeline-templates              → liste templates company
//     GET    /api/admin/pipeline-templates/:id          → un template + snapshots
//     GET    /api/admin/pipeline-templates/:id/snapshots → liste snapshots d'un template
//
//   Écriture (brouillon)
//     POST   /api/admin/pipeline-templates              → crée un template en brouillon
//     PUT    /api/admin/pipeline-templates/:id          → met à jour (brouillon ou publié, sans auto-snapshot)
//
//   Publication / versioning
//     POST   /api/admin/pipeline-templates/:id/publish  → publie + crée snapshot v(N+1)
//
//   Archivage
//     POST   /api/admin/pipeline-templates/:id/archive  → archive (soft, préserve snapshots)
//
//   Assignation collab (Phase 1 prêt, UI Phase 3)
//     PUT    /api/admin/collaborators/:id/pipeline      → { templateId } ou { templateId: null }
//                                                          - si templateId : crée/réutilise snapshot + assigne
//                                                          - si null : retour mode free
//                                                          - NE MIGRE PAS les contacts (Phase 3)
//
// Invariants respectés :
//   #3 — tous les endpoints exigent requireAdmin (pas de collab qui modifie)
//   #4 — publish crée un snapshot, pas de binding live
//   #5 — pas d'auto-propagation : l'assignation n'affecte que le collab visé
//   #8 — scope company enforced via enforceCompany + WHERE companyId

import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, requireAdmin, enforceCompany } from '../middleware/auth.js';
import {
  createSnapshot,
  getLatestSnapshot,
  assignTemplateSnapshotToCollab,
} from '../services/pipelineTemplates/snapshots.js';
import { computePreflight } from '../services/pipelineTemplates/preflight.js';
import { migrateAndAssign } from '../services/pipelineTemplates/migration.js';

const router = Router();

// ─── Utilities ────────────────────────────────────────────────────────────
function newId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}
function nowIso() {
  return new Date().toISOString();
}
function validateStages(stagesJson) {
  try {
    const stages = JSON.parse(stagesJson);
    if (!Array.isArray(stages)) return { ok: false, error: 'stages must be an array' };
    if (stages.length < 2 && stages.length !== 0) return { ok: false, error: 'minimum 2 stages required to publish' };
    for (const s of stages) {
      if (!s.id || typeof s.id !== 'string') return { ok: false, error: 'each stage needs an id' };
      if (!s.label || typeof s.label !== 'string') return { ok: false, error: 'each stage needs a label' };
    }
    return { ok: true, stages };
  } catch (e) {
    return { ok: false, error: 'stagesJson invalid: ' + e.message };
  }
}

// ─── LIST — GET /api/admin/pipeline-templates ─────────────────────────────
router.get('/', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId || req.auth.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const rows = db
      .prepare(
        'SELECT id, companyId, name, description, icon, color, isPublished, isArchived, createdAt, updatedAt, createdBy, updatedBy FROM pipeline_templates WHERE companyId = ? ORDER BY isArchived ASC, updatedAt DESC'
      )
      .all(companyId);
    // Enrich with latest snapshot info (for display)
    const enriched = rows.map(r => {
      const latest = db
        .prepare('SELECT id AS snapshotId, version FROM pipeline_template_snapshots WHERE templateId = ? ORDER BY version DESC LIMIT 1')
        .get(r.id) || {};
      const collabsCount = db
        .prepare(
          "SELECT COUNT(*) AS c FROM collaborators WHERE companyId = ? AND pipelineMode = 'template' AND pipelineSnapshotId IN (SELECT id FROM pipeline_template_snapshots WHERE templateId = ?)"
        )
        .get(companyId, r.id)?.c || 0;
      return { ...r, latestSnapshotId: latest.snapshotId || null, latestVersion: latest.version || 0, collabsCount };
    });
    res.json(enriched);
  } catch (err) {
    console.error('[PIPELINE_TEMPLATES GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── READ — GET /api/admin/pipeline-templates/:id ─────────────────────────
router.get('/:id', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM pipeline_templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    if (!req.auth.isSupra && row.companyId !== req.auth.companyId)
      return res.status(403).json({ error: 'forbidden' });
    const snapshots = db
      .prepare('SELECT id, version, createdAt FROM pipeline_template_snapshots WHERE templateId = ? ORDER BY version DESC')
      .all(req.params.id);
    res.json({ ...row, snapshots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SNAPSHOTS LIST — GET /api/admin/pipeline-templates/:id/snapshots ─────
router.get('/:id/snapshots', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const t = db.prepare('SELECT companyId FROM pipeline_templates WHERE id = ?').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    if (!req.auth.isSupra && t.companyId !== req.auth.companyId)
      return res.status(403).json({ error: 'forbidden' });
    const rows = db
      .prepare('SELECT id, templateId, version, stagesJson, createdAt FROM pipeline_template_snapshots WHERE templateId = ? ORDER BY version DESC')
      .all(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CREATE — POST /api/admin/pipeline-templates ──────────────────────────
router.post('/', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.body.companyId || req.auth.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const { name, description = '', icon = 'star', color = '#7C3AED', stagesJson = '[]' } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 2)
      return res.status(400).json({ error: 'name required (min 2 chars)' });
    const check = validateStages(stagesJson);
    if (!check.ok) return res.status(400).json({ error: check.error });

    const id = newId('tpl');
    const now = nowIso();
    db.prepare(
      'INSERT INTO pipeline_templates (id, companyId, name, description, icon, color, stagesJson, isPublished, isArchived, createdAt, updatedAt, createdBy, updatedBy) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)'
    ).run(
      id,
      companyId,
      name.trim(),
      description,
      icon,
      color,
      stagesJson,
      now,
      now,
      req.auth.collaboratorId || 'supra',
      req.auth.collaboratorId || 'supra'
    );
    res.json({ success: true, id, companyId, name, description, icon, color, stagesJson, isPublished: 0, isArchived: 0, createdAt: now, updatedAt: now });
  } catch (err) {
    console.error('[PIPELINE_TEMPLATES POST]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE — PUT /api/admin/pipeline-templates/:id ───────────────────────
// Modifie un template (brouillon ou publié). Pas de snapshot auto — il faut
// appeler POST /:id/publish pour créer une nouvelle version.
router.put('/:id', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM pipeline_templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    if (!req.auth.isSupra && row.companyId !== req.auth.companyId)
      return res.status(403).json({ error: 'forbidden' });
    if (row.isArchived)
      return res.status(400).json({ error: 'template archived, cannot modify' });

    const sets = [];
    const vals = [];
    for (const field of ['name', 'description', 'icon', 'color', 'stagesJson']) {
      if (req.body[field] !== undefined) {
        if (field === 'stagesJson') {
          const check = validateStages(req.body.stagesJson);
          if (!check.ok) return res.status(400).json({ error: check.error });
        }
        sets.push(`${field} = ?`);
        vals.push(req.body[field]);
      }
    }
    if (sets.length === 0) return res.json({ success: true, changed: false });
    sets.push('updatedAt = ?', 'updatedBy = ?');
    vals.push(nowIso(), req.auth.collaboratorId || 'supra');
    vals.push(req.params.id);

    db.prepare(`UPDATE pipeline_templates SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ success: true, changed: true });
  } catch (err) {
    console.error('[PIPELINE_TEMPLATES PUT]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUBLISH — POST /api/admin/pipeline-templates/:id/publish ─────────────
// Marque le template comme publié ET crée un snapshot v(N+1) depuis l'état actuel.
router.post('/:id/publish', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM pipeline_templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    if (!req.auth.isSupra && row.companyId !== req.auth.companyId)
      return res.status(403).json({ error: 'forbidden' });
    if (row.isArchived)
      return res.status(400).json({ error: 'template archived, cannot publish' });

    const check = validateStages(row.stagesJson);
    if (!check.ok) return res.status(400).json({ error: 'cannot publish: ' + check.error });
    if (check.stages.length < 2)
      return res.status(400).json({ error: 'cannot publish: minimum 2 stages required' });

    const snapshot = createSnapshot(db, req.params.id);
    db.prepare('UPDATE pipeline_templates SET isPublished = 1, updatedAt = ?, updatedBy = ? WHERE id = ?').run(
      nowIso(),
      req.auth.collaboratorId || 'supra',
      req.params.id
    );
    res.json({ success: true, snapshot });
  } catch (err) {
    console.error('[PIPELINE_TEMPLATES PUBLISH]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── ARCHIVE — POST /api/admin/pipeline-templates/:id/archive ─────────────
// Soft delete. Le template ne peut plus être assigné mais les snapshots
// existants restent (pour ne pas casser les collabs déjà assignés).
router.post('/:id/archive', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const row = db.prepare('SELECT companyId FROM pipeline_templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    if (!req.auth.isSupra && row.companyId !== req.auth.companyId)
      return res.status(403).json({ error: 'forbidden' });
    db.prepare('UPDATE pipeline_templates SET isArchived = 1, isPublished = 0, updatedAt = ? WHERE id = ?').run(
      nowIso(),
      req.params.id
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ASSIGN to COLLAB — PUT /api/admin/collaborators/:id/pipeline ─────────
// Bascule un collab en mode template (avec le dernier snapshot publié) ou en mode free.
// Body: { templateId } ou { templateId: null }
// NE MIGRE PAS les contacts (Phase 3). En Phase 1, simple switch du mode.
router.put('/collaborators/:collabId/pipeline', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const { templateId } = req.body;
    const collab = db.prepare('SELECT id, companyId FROM collaborators WHERE id = ?').get(req.params.collabId);
    if (!collab) return res.status(404).json({ error: 'collaborator not found' });
    if (!req.auth.isSupra && collab.companyId !== req.auth.companyId)
      return res.status(403).json({ error: 'forbidden' });

    if (!templateId) {
      const r = assignTemplateSnapshotToCollab(db, collab.id, null);
      return res.json({ success: true, ...r });
    }

    const template = db.prepare('SELECT id, companyId, isPublished, isArchived FROM pipeline_templates WHERE id = ?').get(templateId);
    if (!template) return res.status(404).json({ error: 'template not found' });
    if (template.companyId !== collab.companyId && !req.auth.isSupra)
      return res.status(403).json({ error: 'template belongs to another company' });
    if (template.isArchived) return res.status(400).json({ error: 'template archived' });
    if (!template.isPublished) return res.status(400).json({ error: 'template not published' });

    const snapshot = getLatestSnapshot(db, templateId);
    if (!snapshot) return res.status(400).json({ error: 'no snapshot available, publish first' });

    const r = assignTemplateSnapshotToCollab(db, collab.id, snapshot.id);
    res.json({ success: true, snapshot, ...r });
  } catch (err) {
    console.error('[PIPELINE_TEMPLATES ASSIGN]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PRE-FLIGHT CHECK (Phase 3) ──────────────────────────────────────────
// GET /api/admin/pipeline-templates/preflight?collaboratorId=X&templateId=Y
// Analyse l'impact d'un changement de mode/template AVANT exécution.
// templateId peut être vide/null pour simuler un retour en mode libre.
router.get('/preflight', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const { collaboratorId } = req.query;
    const templateId = req.query.templateId && req.query.templateId !== 'null' ? req.query.templateId : null;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });

    // Vérif appartenance company
    const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
    if (!collab) return res.status(404).json({ error: 'collaborator not found' });
    if (!req.auth.isSupra && collab.companyId !== req.auth.companyId)
      return res.status(403).json({ error: 'forbidden' });

    const pf = computePreflight(db, { collaboratorId, templateId });
    res.json(pf);
  } catch (err) {
    console.error('[PIPELINE_TEMPLATES PREFLIGHT]', err);
    const map = {
      COLLABORATOR_NOT_FOUND: 404,
      TEMPLATE_NOT_FOUND: 404,
      TEMPLATE_WRONG_COMPANY: 403,
      TEMPLATE_ARCHIVED: 400,
      TEMPLATE_NOT_PUBLISHED: 400,
      TEMPLATE_NO_SNAPSHOT: 400,
      SNAPSHOT_INVALID_JSON: 500,
    };
    res.status(map[err.message] || 500).json({ error: err.message });
  }
});

// ─── MIGRATE & ASSIGN (Phase 3) ──────────────────────────────────────────
// POST /api/admin/pipeline-templates/collaborators/:collabId/migrate
// Body: { templateId: string|null, fallbackStage: string|null }
// Transaction atomique : migration contacts + switch mode + audit_logs.
// Requiert fallbackStage si incompatibleCount > 0 (invariant #7).
router.post('/collaborators/:collabId/migrate', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const { templateId, fallbackStage } = req.body || {};
    const collabId = req.params.collabId;

    const collab = db.prepare('SELECT companyId, name FROM collaborators WHERE id = ?').get(collabId);
    if (!collab) return res.status(404).json({ error: 'collaborator not found' });
    if (!req.auth.isSupra && collab.companyId !== req.auth.companyId)
      return res.status(403).json({ error: 'forbidden' });

    const actorId = req.auth.collaboratorId || (req.auth.isSupra ? 'supra' : '');
    const actorName = req.auth.isSupra ? 'supra admin' : (
      db.prepare('SELECT name FROM collaborators WHERE id = ?').get(actorId)?.name || 'admin'
    );

    const result = migrateAndAssign(db, {
      collaboratorId: collabId,
      templateId: templateId || null,
      fallbackStage: fallbackStage || null,
      actorId,
      actorName,
    });
    res.json(result);
  } catch (err) {
    console.error('[PIPELINE_TEMPLATES MIGRATE]', err);
    const msg = err.message || 'unknown';
    const map = {
      COLLABORATOR_NOT_FOUND: 404,
      TEMPLATE_NOT_FOUND: 404,
      TEMPLATE_WRONG_COMPANY: 403,
      TEMPLATE_ARCHIVED: 400,
      TEMPLATE_NOT_PUBLISHED: 400,
      TEMPLATE_NO_SNAPSHOT: 400,
      FALLBACK_STAGE_REQUIRED: 400,
      FALLBACK_STAGE_INVALID: 400,
    };
    const statusKey = msg.split(':')[0];
    res.status(map[statusKey] || 500).json({ error: msg });
  }
});

export default router;
