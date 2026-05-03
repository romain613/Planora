// stats.js — V3.x — endpoints stats post-call et pipeline
// Source : pipeline_history (table audit existante).
// Premier endpoint : pipeline-top par collab (alimente PostCallResultModal V3.x).

import express from 'express';
import { db } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = express.Router();

// V3.x — Top stages utilisés par un collab sur la fenêtre [now - days, now].
// Source : pipeline_history (toStage). Filtre : exclure 'nouveau' (cohérent UX popup).
// Permission : collab voit ses propres stats OR admin/supra.
// Read-only, non destructif. Cache short-lived côté client recommandé (5 min).
router.get('/collab/:collaboratorId/pipeline-top', requireAuth, enforceCompany, (req, res) => {
  try {
    const collabId = req.params.collaboratorId;
    const companyId = req.auth.companyId;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days || '30', 10) || 30));
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit || '4', 10) || 4));

    // Permission : collab voit ses propres stats OR admin/supra
    if (collabId !== req.auth.collaboratorId && !req.auth.isAdmin && !req.auth.isSupra) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const since = new Date(Date.now() - days * 86400000).toISOString();
    const rows = db.prepare(
      `SELECT toStage AS stage, COUNT(*) AS n
       FROM pipeline_history
       WHERE companyId = ?
         AND userId = ?
         AND toStage != 'nouveau'
         AND toStage != ''
         AND createdAt >= ?
       GROUP BY toStage
       ORDER BY n DESC, toStage ASC
       LIMIT ?`
    ).all(companyId, collabId, since, limit);

    res.json({
      topStages: rows.map(r => r.stage),
      counts: rows,
      window: { days, since }
    });
  } catch (err) {
    console.error('[STATS PIPELINE-TOP ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
