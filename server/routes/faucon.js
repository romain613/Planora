// server/routes/faucon.js
// ─────────────────────────────────────────────────────────────────
// 🦅 PLAN FAUCON — Dashboard monitoring V1
//
// Endpoint unique pour piloter la progression du corpus IA en temps réel.
// Retourne toutes les métriques utiles en un seul appel (pas de N+1).
//
// Accès : supra admin uniquement (vue cross-entreprise).
//
// Route : GET /api/faucon/stats
// ─────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { db } from '../db/database.js';
import { requireSupra } from '../middleware/auth.js';
import { MIN_DURATION_SECONDS } from '../services/transcriptArchive.js';

const router = Router();

// ─── GET /api/faucon/stats ───
router.get('/stats', requireSupra, (req, res) => {
  try {
    // ── 1. Totaux ──────────────────────────────────────────────
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN DATE(createdAt) = DATE('now')              THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN createdAt >= DATETIME('now', '-7 days')    THEN 1 ELSE 0 END) AS last_7d,
        SUM(CASE WHEN createdAt >= DATETIME('now', '-30 days')   THEN 1 ELSE 0 END) AS last_30d
      FROM call_transcript_archive
    `).get();

    // ── 2. Couverture : appels éligibles vs archivés ───────────
    // Éligibles = call_logs completed + duration >= MIN + a un transcript
    const eligibleTotal = db.prepare(`
      SELECT COUNT(DISTINCT cl.id) AS n
      FROM call_logs cl
      INNER JOIN call_transcripts ct ON ct.callLogId = cl.id
      WHERE LOWER(COALESCE(cl.status,'')) = 'completed'
        AND COALESCE(cl.duration, 0) >= ?
    `).get(MIN_DURATION_SECONDS).n;

    // Archives *qui correspondent* à la définition éligible (exclut les archives manuelles de calls courts)
    // → c'est ce qui compte pour le taux de couverture du cron
    const archivedFromEligible = db.prepare(`
      SELECT COUNT(DISTINCT cta.callLogId) AS n
      FROM call_transcript_archive cta
      INNER JOIN call_logs cl ON cl.id = cta.callLogId
      WHERE LOWER(COALESCE(cl.status,'')) = 'completed'
        AND COALESCE(cl.duration, 0) >= ?
    `).get(MIN_DURATION_SECONDS).n;

    const coveragePct = eligibleTotal > 0
      ? Math.round((archivedFromEligible / eligibleTotal) * 100)
      : 0;

    // ── 3. Orphelins : éligibles non archivés (détection trous) ──
    const orphansCount = db.prepare(`
      SELECT COUNT(DISTINCT cl.id) AS n
      FROM call_logs cl
      INNER JOIN call_transcripts ct ON ct.callLogId = cl.id
      LEFT JOIN call_transcript_archive cta ON cta.callLogId = cl.id
      WHERE cta.id IS NULL
        AND LOWER(COALESCE(cl.status,'')) = 'completed'
        AND COALESCE(cl.duration, 0) >= ?
    `).get(MIN_DURATION_SECONDS).n;

    const orphansSample = db.prepare(`
      SELECT
        cl.id,
        cl.companyId,
        cl.collaboratorId,
        cl.duration,
        cl.direction,
        cl.createdAt,
        cl.fromNumber,
        cl.toNumber
      FROM call_logs cl
      INNER JOIN call_transcripts ct ON ct.callLogId = cl.id
      LEFT JOIN call_transcript_archive cta ON cta.callLogId = cl.id
      WHERE cta.id IS NULL
        AND LOWER(COALESCE(cl.status,'')) = 'completed'
        AND COALESCE(cl.duration, 0) >= ?
      GROUP BY cl.id
      ORDER BY cl.createdAt DESC
      LIMIT 10
    `).all(MIN_DURATION_SECONDS);

    // ── 4. Répartition par collaborateur ───────────────────────
    const byCollab = db.prepare(`
      SELECT
        cta.collaboratorId AS collaboratorId,
        COALESCE(c.name, '(supprimé)') AS name,
        COUNT(*) AS archives,
        ROUND(AVG(cta.callDuration)) AS avg_duration,
        SUM(cta.hasLive)  AS with_live,
        SUM(cta.hasAudio) AS with_audio
      FROM call_transcript_archive cta
      LEFT JOIN collaborators c ON c.id = cta.collaboratorId
      GROUP BY cta.collaboratorId
      ORDER BY archives DESC
      LIMIT 20
    `).all();

    // ── 5. Répartition par company ─────────────────────────────
    const byCompany = db.prepare(`
      SELECT
        cta.companyId AS companyId,
        COALESCE(co.name, '(supprimée)') AS name,
        COUNT(*) AS archives,
        ROUND(AVG(cta.callDuration)) AS avg_duration
      FROM call_transcript_archive cta
      LEFT JOIN companies co ON co.id = cta.companyId
      GROUP BY cta.companyId
      ORDER BY archives DESC
    `).all();

    // ── 6. Durée moyenne globale + min/max ─────────────────────
    const durationAgg = db.prepare(`
      SELECT
        ROUND(AVG(callDuration)) AS avg,
        MIN(callDuration) AS min,
        MAX(callDuration) AS max,
        SUM(callDuration) AS total_seconds
      FROM call_transcript_archive
    `).get();

    // ── 7. Répartition live vs audio ───────────────────────────
    const sourceSplit = db.prepare(`
      SELECT
        SUM(CASE WHEN hasLive = 1 AND hasAudio = 1 THEN 1 ELSE 0 END) AS both,
        SUM(CASE WHEN hasLive = 1 AND hasAudio = 0 THEN 1 ELSE 0 END) AS live_only,
        SUM(CASE WHEN hasLive = 0 AND hasAudio = 1 THEN 1 ELSE 0 END) AS audio_only,
        SUM(CASE WHEN hasLive = 0 AND hasAudio = 0 THEN 1 ELSE 0 END) AS neither
      FROM call_transcript_archive
    `).get();

    // ── 8. Timeline 14 derniers jours (pour courbe) ────────────
    const timeline = db.prepare(`
      SELECT
        DATE(createdAt) AS day,
        COUNT(*) AS archives
      FROM call_transcript_archive
      WHERE createdAt >= DATETIME('now', '-14 days')
      GROUP BY DATE(createdAt)
      ORDER BY day ASC
    `).all();

    // ── Response ───────────────────────────────────────────────
    res.json({
      generatedAt: new Date().toISOString(),
      minDurationSeconds: MIN_DURATION_SECONDS,
      totals: {
        archives: totals.total || 0,
        today: totals.today || 0,
        last_7d: totals.last_7d || 0,
        last_30d: totals.last_30d || 0,
      },
      coverage: {
        eligible: eligibleTotal,
        archived_from_eligible: archivedFromEligible,
        pct: coveragePct,
      },
      orphans: {
        count: orphansCount,
        sample: orphansSample,
      },
      duration: {
        avg: durationAgg.avg || 0,
        min: durationAgg.min || 0,
        max: durationAgg.max || 0,
        total_seconds: durationAgg.total_seconds || 0,
      },
      source: {
        both: sourceSplit.both || 0,
        live_only: sourceSplit.live_only || 0,
        audio_only: sourceSplit.audio_only || 0,
        neither: sourceSplit.neither || 0,
      },
      byCollab,
      byCompany,
      timeline,
    });
  } catch (err) {
    console.error('[FAUCON STATS ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
