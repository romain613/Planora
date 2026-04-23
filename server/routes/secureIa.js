/**
 * Secure IA Phone Routes — Calendar360
 * API for alerts, reports, stats, and forbidden word management
 */

import { Router } from 'express';
import { db } from '../db/database.js';
import { processCallForSecureIa, generateReport } from '../services/secureIaPhone.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// ─── ALERTS ──────────────────────────────────

// GET /api/secure-ia/alerts?companyId=c1&collaboratorId=&severity=&reviewed=&limit=50&offset=0
router.get('/alerts', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId, collaboratorId, severity, reviewed, limit = '50', offset = '0' } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    let sql = 'SELECT * FROM secure_ia_alerts WHERE companyId = ?';
    const params = [companyId];

    if (collaboratorId) { sql += ' AND collaboratorId = ?'; params.push(collaboratorId); }
    if (severity) { sql += ' AND severity = ?'; params.push(severity); }
    if (reviewed !== undefined && reviewed !== '') { sql += ' AND reviewed = ?'; params.push(parseInt(reviewed)); }

    sql += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const alerts = db.prepare(sql).all(...params);

    // Parse JSON fields
    const parsed = alerts.map(a => {
      try { a.detectedWords = JSON.parse(a.detectedWords_json || '[]'); } catch { a.detectedWords = []; }
      delete a.detectedWords_json;
      // Don't send full transcription in list view (too heavy)
      a.transcriptionPreview = (a.transcription || '').slice(0, 200);
      delete a.transcription;
      return a;
    });

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/secure-ia/alerts/:id — Full detail with transcription
router.get('/alerts/:id', requireAuth, (req, res) => {
  try {
    const alert = db.prepare(`
      SELECT a.*, cl.recordingUrl, cl.recordingSid
      FROM secure_ia_alerts a
      LEFT JOIN call_logs cl ON cl.id = a.callLogId
      WHERE a.id = ?
    `).get(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    if (!req.auth.isSupra && alert.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });

    try { alert.detectedWords = JSON.parse(alert.detectedWords_json || '[]'); } catch { alert.detectedWords = []; }
    delete alert.detectedWords_json;

    // Get collaborator name
    const collab = db.prepare('SELECT name, color FROM collaborators WHERE id = ?').get(alert.collaboratorId);
    alert.collaboratorName = collab?.name || 'Inconnu';
    alert.collaboratorColor = collab?.color || '#2563EB';

    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/secure-ia/alerts/:id/review — Mark as reviewed
router.put('/alerts/:id/review', requireAuth, (req, res) => {
  try {
    const existing = db.prepare('SELECT companyId FROM secure_ia_alerts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Alert not found' });
    if (!req.auth.isSupra && existing.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const { reviewed = 1 } = req.body;
    db.prepare('UPDATE secure_ia_alerts SET reviewed = ? WHERE id = ?').run(reviewed ? 1 : 0, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REPORTS ─────────────────────────────────

// GET /api/secure-ia/reports?companyId=c1&collaboratorId=&period=day|week|month
router.get('/reports', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId, collaboratorId, period } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    let sql = 'SELECT * FROM secure_ia_reports WHERE companyId = ?';
    const params = [companyId];

    if (collaboratorId) { sql += ' AND collaboratorId = ?'; params.push(collaboratorId); }
    if (period) { sql += ' AND period = ?'; params.push(period); }

    sql += ' ORDER BY periodDate DESC LIMIT 50';

    const reports = db.prepare(sql).all(...params);
    const parsed = reports.map(r => {
      try { r.wordBreakdown = JSON.parse(r.wordBreakdown_json || '[]'); } catch { r.wordBreakdown = []; }
      delete r.wordBreakdown_json;
      // Get collab name
      const collab = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(r.collaboratorId);
      r.collaboratorName = collab?.name || 'Inconnu';
      return r;
    });

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STATS ───────────────────────────────────

// GET /api/secure-ia/stats?companyId=c1&period=day|week|month
router.get('/stats', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId, period = 'day' } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    // Get all alerts for this company
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Date ranges
    const todayStr = today;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const monthStartStr = today.slice(0, 7) + '-01';

    // Alerts counts
    const alertsToday = db.prepare('SELECT COUNT(*) as cnt FROM secure_ia_alerts WHERE companyId = ? AND date(callDate) = ?').get(companyId, todayStr)?.cnt || 0;
    const alertsWeek = db.prepare('SELECT COUNT(*) as cnt FROM secure_ia_alerts WHERE companyId = ? AND date(callDate) >= ?').get(companyId, weekStartStr)?.cnt || 0;
    const alertsMonth = db.prepare('SELECT COUNT(*) as cnt FROM secure_ia_alerts WHERE companyId = ? AND date(callDate) >= ?').get(companyId, monthStartStr)?.cnt || 0;
    const alertsTotal = db.prepare('SELECT COUNT(*) as cnt FROM secure_ia_alerts WHERE companyId = ?').get(companyId)?.cnt || 0;

    // Pending review
    const pendingReview = db.prepare('SELECT COUNT(*) as cnt FROM secure_ia_alerts WHERE companyId = ? AND reviewed = 0').get(companyId)?.cnt || 0;

    // Monitored collaborators
    const monitoredCollabs = db.prepare('SELECT COUNT(*) as cnt FROM collaborators WHERE companyId = ? AND secure_ia_phone = 1').get(companyId)?.cnt || 0;

    // Top violated words (all time or period)
    let dateFilter = todayStr;
    if (period === 'week') dateFilter = weekStartStr;
    else if (period === 'month') dateFilter = monthStartStr;

    const periodAlerts = db.prepare('SELECT detectedWords_json FROM secure_ia_alerts WHERE companyId = ? AND date(callDate) >= ?').all(companyId, dateFilter);
    const wordMap = {};
    for (const a of periodAlerts) {
      let words = [];
      try { words = JSON.parse(a.detectedWords_json || '[]'); } catch {}
      for (const w of words) {
        if (!wordMap[w.word]) wordMap[w.word] = { word: w.word, count: 0, calls: 0 };
        wordMap[w.word].count += w.count;
        wordMap[w.word].calls += 1;
      }
    }
    const topWords = Object.values(wordMap).sort((a, b) => b.count - a.count).slice(0, 10);

    // Per-collaborator breakdown
    const collabAlerts = db.prepare(
      `SELECT a.collaboratorId, c.name, c.color, COUNT(*) as alertCount,
       SUM(CASE WHEN a.severity = 'high' THEN 1 ELSE 0 END) as highCount,
       SUM(CASE WHEN a.severity = 'medium' THEN 1 ELSE 0 END) as mediumCount,
       SUM(CASE WHEN a.severity = 'low' THEN 1 ELSE 0 END) as lowCount
       FROM secure_ia_alerts a
       LEFT JOIN collaborators c ON c.id = a.collaboratorId
       WHERE a.companyId = ? AND date(a.callDate) >= ?
       GROUP BY a.collaboratorId
       ORDER BY alertCount DESC`
    ).all(companyId, dateFilter);

    // Daily trend (last 14 days)
    const trendDays = 14;
    const trendStart = new Date(now);
    trendStart.setDate(now.getDate() - trendDays);
    const trend = db.prepare(
      `SELECT date(callDate) as day, COUNT(*) as cnt
       FROM secure_ia_alerts WHERE companyId = ? AND date(callDate) >= ?
       GROUP BY date(callDate) ORDER BY day`
    ).all(companyId, trendStart.toISOString().split('T')[0]);

    res.json({
      alertsToday,
      alertsWeek,
      alertsMonth,
      alertsTotal,
      pendingReview,
      monitoredCollabs,
      topWords,
      collabAlerts,
      trend,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── WORDS MANAGEMENT ────────────────────────

// PUT /api/secure-ia/words/:collaboratorId — Update forbidden words
router.put('/words/:collaboratorId', requireAuth, (req, res) => {
  try {
    const { words } = req.body;
    if (!Array.isArray(words)) return res.status(400).json({ error: 'words must be an array' });

    // Verify collaborator belongs to user's company
    const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(req.params.collaboratorId);
    if (!collab) return res.status(404).json({ error: 'Collaborator not found' });
    if (!req.auth.isSupra && collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });

    // Clean and deduplicate
    const cleaned = [...new Set(words.map(w => w.trim()).filter(Boolean))];

    db.prepare('UPDATE collaborators SET secure_ia_words_json = ? WHERE id = ? AND companyId = ?')
      .run(JSON.stringify(cleaned), req.params.collaboratorId, collab.companyId);

    res.json({ success: true, count: cleaned.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MANUAL ANALYSIS ─────────────────────────

// POST /api/secure-ia/analyze/:callLogId — Manually trigger analysis
router.post('/analyze/:callLogId', requireAuth, async (req, res) => {
  try {
    // Verify call belongs to user's company
    const call = db.prepare('SELECT companyId FROM call_logs WHERE id = ?').get(req.params.callLogId);
    if (!call) return res.status(404).json({ error: 'Call not found' });
    if (!req.auth.isSupra && call.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const result = await processCallForSecureIa(req.params.callLogId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GENERATE REPORT ON DEMAND ───────────────

// POST /api/secure-ia/report — Generate report on demand
router.post('/report', requireAuth, (req, res) => {
  try {
    const { collaboratorId, period = 'day', periodDate } = req.body;
    const companyId = req.auth.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    if (!collaboratorId || !periodDate) return res.status(400).json({ error: 'collaboratorId and periodDate required' });

    const result = generateReport(companyId, collaboratorId, period, periodDate);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── COMPANY-WIDE FORBIDDEN WORDS CONFIG ──────────

// GET /api/secure-ia/company-words?companyId=c1
router.get('/company-words', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const row = db.prepare('SELECT forbidden_words_json FROM companies WHERE id = ?').get(companyId);
    const words = JSON.parse(row?.forbidden_words_json || '[]');
    res.json({ words });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/secure-ia/company-words — Update company-wide forbidden words
router.put('/company-words', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId, words } = req.body;
    if (!companyId || !Array.isArray(words)) return res.status(400).json({ error: 'companyId et words[] requis' });
    const cleaned = [...new Set(words.map(w => w.trim()).filter(w => w))];
    db.prepare('UPDATE companies SET forbidden_words_json = ? WHERE id = ?').run(JSON.stringify(cleaned), companyId);
    res.json({ success: true, words: cleaned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/secure-ia/words-multi — Set forbidden words for multiple collaborators at once
router.put('/words-multi', requireAuth, (req, res) => {
  try {
    const { companyId, collaboratorIds, words } = req.body;
    if (!companyId || !Array.isArray(collaboratorIds) || !Array.isArray(words)) return res.status(400).json({ error: 'companyId, collaboratorIds[], words[] requis' });
    const cleaned = [...new Set(words.map(w => w.trim()).filter(w => w))];
    const stmt = db.prepare('UPDATE collaborators SET secure_ia_words_json = ?, secure_ia_phone = 1 WHERE id = ? AND companyId = ?');
    let updated = 0;
    for (const cid of collaboratorIds) {
      const r = stmt.run(JSON.stringify(cleaned), cid, companyId);
      updated += r.changes;
    }
    res.json({ success: true, updated, words: cleaned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/secure-ia/signalements?companyId=c1 — Full signalement dashboard data
router.get('/signalements', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    // Stats globales
    const total = db.prepare('SELECT COUNT(*) as c FROM secure_ia_alerts WHERE companyId = ? AND severity != ?').get(companyId, 'none')?.c || 0;
    const pending = db.prepare("SELECT COUNT(*) as c FROM secure_ia_alerts WHERE companyId = ? AND severity != 'none' AND reviewed = 0").get(companyId)?.c || 0;
    const high = db.prepare("SELECT COUNT(*) as c FROM secure_ia_alerts WHERE companyId = ? AND severity = 'high'").get(companyId)?.c || 0;
    const medium = db.prepare("SELECT COUNT(*) as c FROM secure_ia_alerts WHERE companyId = ? AND severity = 'medium'").get(companyId)?.c || 0;
    const low = db.prepare("SELECT COUNT(*) as c FROM secure_ia_alerts WHERE companyId = ? AND severity = 'low'").get(companyId)?.c || 0;

    // Par collaborateur
    const collabStats = db.prepare(`
      SELECT a.collaboratorId, c.name, c.email, c.color,
        COUNT(*) as alertCount,
        SUM(CASE WHEN a.severity='high' THEN 1 ELSE 0 END) as highCount,
        SUM(CASE WHEN a.severity='medium' THEN 1 ELSE 0 END) as mediumCount,
        SUM(CASE WHEN a.severity='low' THEN 1 ELSE 0 END) as lowCount,
        SUM(CASE WHEN a.reviewed=0 THEN 1 ELSE 0 END) as pendingCount,
        MAX(a.createdAt) as lastAlert
      FROM secure_ia_alerts a
      LEFT JOIN collaborators c ON c.id = a.collaboratorId
      WHERE a.companyId = ? AND a.severity != 'none'
      GROUP BY a.collaboratorId
      ORDER BY alertCount DESC
    `).all(companyId);

    // Top mots détectés
    const allAlerts = db.prepare("SELECT detectedWords_json FROM secure_ia_alerts WHERE companyId = ? AND severity != 'none'").all(companyId);
    const wordMap = {};
    for (const a of allAlerts) {
      try {
        const words = JSON.parse(a.detectedWords_json || '[]');
        for (const w of words) { wordMap[w.word] = (wordMap[w.word] || 0) + w.count; }
      } catch {}
    }
    const topWords = Object.entries(wordMap).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([word, count]) => ({ word, count }));

    // Dernières alertes
    const recentAlerts = db.prepare(`
      SELECT a.*, c.name as collabName, c.color as collabColor, cl.recordingUrl, cl.recordingSid
      FROM secure_ia_alerts a
      LEFT JOIN collaborators c ON c.id = a.collaboratorId
      LEFT JOIN call_logs cl ON cl.id = a.callLogId
      WHERE a.companyId = ? AND a.severity != 'none'
      ORDER BY a.createdAt DESC LIMIT 50
    `).all(companyId);
    for (const a of recentAlerts) {
      try { a.detectedWords = JSON.parse(a.detectedWords_json || '[]'); } catch { a.detectedWords = []; }
      a.transcriptionPreview = (a.transcription || '').substring(0, 200);
      delete a.detectedWords_json;
      delete a.transcription;
    }

    // Config actuelle
    const companyWords = JSON.parse(db.prepare('SELECT forbidden_words_json FROM companies WHERE id = ?').get(companyId)?.forbidden_words_json || '[]');
    const collabsConfig = db.prepare('SELECT id, name, email, secure_ia_phone, secure_ia_words_json FROM collaborators WHERE companyId = ?').all(companyId);
    for (const c of collabsConfig) {
      try { c.words = JSON.parse(c.secure_ia_words_json || '[]'); } catch { c.words = []; }
      delete c.secure_ia_words_json;
    }

    res.json({
      stats: { total, pending, high, medium, low },
      collabStats,
      topWords,
      recentAlerts,
      config: { companyWords, collabs: collabsConfig },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/secure-ia/signalements/:collaboratorId — Detail for a specific collaborator
router.get('/signalements/:collaboratorId', requireAuth, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const alerts = db.prepare(`
      SELECT a.*, c.name as collabName, cl.recordingUrl, cl.recordingSid
      FROM secure_ia_alerts a
      LEFT JOIN collaborators c ON c.id = a.collaboratorId
      LEFT JOIN call_logs cl ON cl.id = a.callLogId
      WHERE a.collaboratorId = ? AND a.companyId = ? AND a.severity != 'none'
      ORDER BY a.createdAt DESC LIMIT 100
    `).all(req.params.collaboratorId, companyId);
    for (const a of alerts) {
      try { a.detectedWords = JSON.parse(a.detectedWords_json || '[]'); } catch { a.detectedWords = []; }
      delete a.detectedWords_json;
    }
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── COLLABORATOR ROUTES ─────────────────────────────────

// GET /api/secure-ia/my-alerts — Alerts for the authenticated collaborator
router.get('/my-alerts', requireAuth, (req, res) => {
  try {
    const collaboratorId = req.auth.collaboratorId;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });

    const alerts = db.prepare(`
      SELECT a.*, cl.toNumber, cl.fromNumber, cl.direction, cl.duration, cl.recordingUrl, cl.recordingSid
      FROM secure_ia_alerts a
      LEFT JOIN call_logs cl ON cl.id = a.callLogId
      WHERE a.collaboratorId = ?
      ORDER BY a.createdAt DESC LIMIT 100
    `).all(collaboratorId);

    const parsed = alerts.map(a => {
      try { a.detectedWords = JSON.parse(a.detectedWords_json || '[]'); } catch { a.detectedWords = []; }
      delete a.detectedWords_json;
      a.transcriptionPreview = (a.transcription || '').slice(0, 300);
      return a;
    });

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/secure-ia/my-alerts/count — Unread count for badge (uses auth)
router.get('/my-alerts/count', requireAuth, (req, res) => {
  try {
    const collaboratorId = req.auth.collaboratorId;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });

    const row = db.prepare('SELECT COUNT(*) as count FROM secure_ia_alerts WHERE collaboratorId = ? AND (collabRead IS NULL OR collabRead = 0)').get(collaboratorId);
    res.json({ count: row?.count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/secure-ia/my-alerts/:id/read — Collaborator marks alert as read
router.put('/my-alerts/:id/read', requireAuth, (req, res) => {
  try {
    const existing = db.prepare('SELECT collaboratorId FROM secure_ia_alerts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Alert not found' });
    if (existing.collaboratorId !== req.auth.collaboratorId) return res.status(403).json({ error: 'Accès interdit' });
    db.prepare('UPDATE secure_ia_alerts SET collabRead = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/secure-ia/my-alerts/:id/explain — Collaborator provides explanation
router.put('/my-alerts/:id/explain', requireAuth, (req, res) => {
  try {
    const { explanation } = req.body;
    if (!explanation) return res.status(400).json({ error: 'explanation required' });

    // Verify ownership
    const existing = db.prepare('SELECT collaboratorId FROM secure_ia_alerts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Alert not found' });
    if (existing.collaboratorId !== req.auth.collaboratorId) return res.status(403).json({ error: 'Accès interdit' });

    db.prepare('UPDATE secure_ia_alerts SET collabExplanation = ?, collabRead = 1 WHERE id = ?')
      .run(explanation, req.params.id);

    // Notify admin via activity_logs
    const alert = db.prepare('SELECT companyId, collaboratorId FROM secure_ia_alerts WHERE id = ?').get(req.params.id);
    if (alert) {
      const collab = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(alert.collaboratorId);
      try {
        db.prepare('INSERT INTO activity_logs (id, companyId, collaboratorId, type, detail, meta_json, createdAt) VALUES (?,?,?,?,?,?,?)')
          .run('alog_' + Date.now(), alert.companyId, alert.collaboratorId, 'signalement_reply',
            `${collab?.name || 'Collaborateur'} a répondu à un signalement: "${explanation.substring(0, 100)}"`,
            JSON.stringify({ alertId: req.params.id }), new Date().toISOString());
      } catch (e) { /* ok */ }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
