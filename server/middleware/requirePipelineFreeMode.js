// ═══════════════════════════════════════════════════════════════════════════
// Middleware requirePipelineFreeMode — verrou backend (Phase 1)
// ═══════════════════════════════════════════════════════════════════════════
//
// Source : docs/product-pipeline-templates-v1.md §6.2 (invariant #3 — double verrou).
//
// Rôle : rejette toute tentative de mutation du pipeline par un collaborateur
// dont le mode est 'template'. L'UI est un garde-fou UX ; ce middleware est
// la barrière de sécurité. Tout bypass (curl, client custom, bug UI) est
// stoppé ici et audit-loggé.
//
// Montage : sur POST/PUT/DELETE /api/data/pipeline-stages (voir data.js).
//
// Comportement :
//   - req.auth.isSupra : bypass (supra peut forcer des modifs en mode impersonation)
//   - req.auth.collaboratorId : lookup pipelineMode en DB
//   - si mode='template' : 403 PIPELINE_TEMPLATE_LOCKED + audit_log
//   - sinon : next()
//
// Préserve 100% le comportement actuel pour tous les collabs en mode 'free'
// (l'ensemble des collabs au moment de Phase 1).

import { db } from '../db/database.js';

export function requirePipelineFreeMode(req, res, next) {
  // Supra bypass (impersonation forcée)
  if (req.auth?.isSupra) return next();

  const collabId = req.auth?.collaboratorId;
  if (!collabId) return next(); // Non-collab : laisser l'auth du route gérer

  let collab;
  try {
    collab = db.prepare('SELECT pipelineMode FROM collaborators WHERE id = ?').get(collabId);
  } catch (e) {
    // Colonne pipelineMode absente = schema pas encore migré = fallback sûr vers 'free'
    console.warn('[PIPELINE_FREE_MODE] schema lookup failed, defaulting to free:', e.message);
    return next();
  }
  if (!collab) return next();

  if (collab.pipelineMode === 'template') {
    // Log la tentative de bypass pour monitoring
    try {
      db.prepare(
        'INSERT INTO audit_logs (id, companyId, collaboratorId, action, entityType, entityId, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        req.auth.companyId || '',
        collabId,
        'pipeline_lock_bypass_attempt',
        'pipeline_stage',
        req.params?.id || '',
        JSON.stringify({
          method: req.method,
          path: req.path,
          body: req.body,
        }).slice(0, 500),
        new Date().toISOString()
      );
    } catch (e) {
      console.warn('[PIPELINE_LOCK AUDIT]', e.message);
    }
    return res.status(403).json({
      error: 'PIPELINE_TEMPLATE_LOCKED',
      detail:
        'Votre pipeline est imposé par un template. Contactez votre administrateur pour toute modification.',
    });
  }

  next();
}
