import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ═══ GET /api/audit-logs — Query audit logs with filters ═══
// Admin: sees own company. Supra: can query any company or all.
router.get('/', requireAuth, requireAdmin, (req, res) => {
  try {
    const { companyId, userId, action, category, entityType, entityId, from, to, limit: lim } = req.query;
    const maxResults = Math.min(parseInt(lim) || 100, 500);

    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    // Company isolation: non-supra sees only own company
    if (req.auth.isSupra && companyId) {
      sql += ' AND companyId = ?';
      params.push(companyId);
    } else if (!req.auth.isSupra) {
      sql += ' AND companyId = ?';
      params.push(req.auth.companyId);
    }

    // Filters
    if (userId) { sql += ' AND userId = ?'; params.push(userId); }
    if (action) { sql += ' AND action = ?'; params.push(action); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (entityType) { sql += ' AND entityType = ?'; params.push(entityType); }
    if (entityId) { sql += ' AND entityId = ?'; params.push(entityId); }
    if (from) { sql += ' AND createdAt >= ?'; params.push(from); }
    if (to) { sql += ' AND createdAt <= ?'; params.push(to); }

    sql += ' ORDER BY createdAt DESC LIMIT ?';
    params.push(maxResults);

    const logs = db.prepare(sql).all(...params);

    // Parse metadata_json
    const parsed = logs.map(l => {
      try { l.metadata = JSON.parse(l.metadata_json || '{}'); } catch { l.metadata = {}; }
      return l;
    });

    res.json({ logs: parsed, count: parsed.length, limit: maxResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ GET /api/audit-logs/stats — Quick stats for dashboard ═══
router.get('/stats', requireAuth, requireAdmin, (req, res) => {
  try {
    const companyFilter = req.auth.isSupra ? '' : 'WHERE companyId = ?';
    const params = req.auth.isSupra ? [] : [req.auth.companyId];

    const total = db.prepare('SELECT COUNT(*) as cnt FROM audit_logs ' + companyFilter).get(...params).cnt;
    const today = db.prepare('SELECT COUNT(*) as cnt FROM audit_logs ' + (companyFilter ? companyFilter + ' AND' : 'WHERE') + " createdAt >= date('now')").get(...params).cnt;

    // Top actions
    const topActions = db.prepare(
      'SELECT action, COUNT(*) as cnt FROM audit_logs ' + companyFilter +
      ' GROUP BY action ORDER BY cnt DESC LIMIT 10'
    ).all(...params);

    // Top users
    const topUsers = db.prepare(
      'SELECT userName, COUNT(*) as cnt FROM audit_logs ' + (companyFilter ? companyFilter + " AND userName != ''" : "WHERE userName != ''") +
      ' GROUP BY userName ORDER BY cnt DESC LIMIT 10'
    ).all(...params);

    res.json({ total, today, topActions, topUsers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ GET /api/audit-logs/entity/:entityType/:entityId — History for a specific entity ═══
// Admin only — members ne doivent pas voir l'historique d'entités d'autres collabs
router.get('/entity/:entityType/:entityId', requireAuth, requireAdmin, (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    // Audit logs for this entity
    let sql = 'SELECT * FROM audit_logs WHERE entityType = ? AND entityId = ?';
    const params = [entityType, entityId];

    // Company isolation
    if (!req.auth.isSupra) {
      sql += ' AND companyId = ?';
      params.push(req.auth.companyId);
    }

    sql += ' ORDER BY createdAt DESC LIMIT ?';
    params.push(limit);

    const auditLogs = db.prepare(sql).all(...params);

    // Entity history (field-level changes) for this entity
    let histSql = 'SELECT * FROM entity_history WHERE entityType = ? AND entityId = ?';
    const histParams = [entityType, entityId];

    if (!req.auth.isSupra) {
      histSql += ' AND companyId = ?';
      histParams.push(req.auth.companyId);
    }

    histSql += ' ORDER BY createdAt DESC LIMIT ?';
    histParams.push(limit);

    const entityHistory = db.prepare(histSql).all(...histParams);

    res.json({ auditLogs, entityHistory, entityType, entityId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
