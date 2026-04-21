// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Templates — schéma DDL (Phase 1 backend foundation)
// ═══════════════════════════════════════════════════════════════════════════
//
// Source de vérité produit : docs/product-pipeline-templates-v1.md (v1.1)
// Invariants respectés : #4 (snapshot figé) + #8 (scope company).
//
// Modèle :
//   - pipeline_templates             : un template réutilisable, scope company
//   - pipeline_template_snapshots    : version figée (v1, v2, ...) référencée par les collabs
//   - collaborators.pipelineMode     : 'free' (legacy, défaut) ou 'template'
//   - collaborators.pipelineSnapshotId : FK vers snapshot si mode='template'
//
// Idempotence : CREATE TABLE IF NOT EXISTS + ALTER TABLE dans try/catch.
// Peut être ré-exécuté au restart sans effet de bord.
//
// Usage : appelé UNE fois depuis server/db/database.js au démarrage.

export function ensurePipelineTemplatesSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_templates (
      id TEXT PRIMARY KEY,
      companyId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT 'star',
      color TEXT DEFAULT '#7C3AED',
      stagesJson TEXT NOT NULL DEFAULT '[]',
      isPublished INTEGER DEFAULT 0,
      isArchived INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      createdBy TEXT DEFAULT '',
      updatedBy TEXT DEFAULT ''
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_template_snapshots (
      id TEXT PRIMARY KEY,
      templateId TEXT NOT NULL,
      version INTEGER NOT NULL,
      stagesJson TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (templateId) REFERENCES pipeline_templates(id)
    )
  `);

  // Indexes
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_templates_company ON pipeline_templates (companyId)'); } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_templates_published ON pipeline_templates (companyId, isPublished)'); } catch {}
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_template_snapshots_tv ON pipeline_template_snapshots (templateId, version)'); } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_template_snapshots_template ON pipeline_template_snapshots (templateId)'); } catch {}

  // Collaborators extensions (additive, idempotent)
  try { db.exec("ALTER TABLE collaborators ADD COLUMN pipelineMode TEXT DEFAULT 'free'"); } catch {}
  try { db.exec('ALTER TABLE collaborators ADD COLUMN pipelineSnapshotId TEXT DEFAULT NULL'); } catch {}
}
