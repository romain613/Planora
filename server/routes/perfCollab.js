/**
 * Performance Collaborateurs — Calendar360
 * Leaderboard, scoring multi-critères, bonus/pénalités, audit IA, manager insights
 */

import express from 'express';
import { db } from '../db/database.js';
import { requireAdmin, enforceCompany } from '../middleware/auth.js';
import { getCoachingInsights } from '../services/aiCopilot.js';

const router = express.Router();
const uid = () => 'perf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const GPT_MODEL = 'gpt-4o-mini';
const GPT_URL = 'https://api.openai.com/v1/chat/completions';

// ─── HELPERS ────────────────────────

function getWeights(companyId) {
  const row = db.prepare("SELECT * FROM perf_score_settings WHERE companyId = ?").get(companyId);
  if (row) return row;
  return { weight_calls:15, weight_quality:20, weight_conversion:25, weight_speed:10, weight_followup:10, weight_goals:10, weight_discipline:5, weight_regularity:5 };
}

function getPeriodDates(period, customStart, customEnd) {
  const now = new Date();
  let start, end, prevStart, prevEnd, label;

  if (period === 'custom' && customStart && customEnd) {
    start = customStart;
    end = customEnd;
    const diff = new Date(customEnd) - new Date(customStart);
    prevStart = new Date(new Date(customStart).getTime() - diff).toISOString().slice(0,10);
    prevEnd = customStart;
    label = `du ${customStart} au ${customEnd}`;
  } else {
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    const dow = now.getDay() || 7; // Monday=1

    switch(period) {
      case 'day':
        start = new Date(y,m,d).toISOString().slice(0,10);
        end = new Date(y,m,d+1).toISOString().slice(0,10);
        prevStart = new Date(y,m,d-1).toISOString().slice(0,10);
        prevEnd = start;
        label = "aujourd'hui";
        break;
      case 'week':
        start = new Date(y,m,d-dow+1).toISOString().slice(0,10);
        end = new Date(y,m,d-dow+8).toISOString().slice(0,10);
        prevStart = new Date(y,m,d-dow-6).toISOString().slice(0,10);
        prevEnd = start;
        label = 'cette semaine';
        break;
      case 'quarter': {
        const qm = Math.floor(m/3)*3;
        start = new Date(y,qm,1).toISOString().slice(0,10);
        end = new Date(y,qm+3,1).toISOString().slice(0,10);
        prevStart = new Date(y,qm-3,1).toISOString().slice(0,10);
        prevEnd = start;
        label = 'ce trimestre';
        break;
      }
      case 'year':
        start = new Date(y,0,1).toISOString().slice(0,10);
        end = new Date(y+1,0,1).toISOString().slice(0,10);
        prevStart = new Date(y-1,0,1).toISOString().slice(0,10);
        prevEnd = start;
        label = 'cette année';
        break;
      default: // month
        start = new Date(y,m,1).toISOString().slice(0,10);
        end = new Date(y,m+1,1).toISOString().slice(0,10);
        prevStart = new Date(y,m-1,1).toISOString().slice(0,10);
        prevEnd = start;
        label = 'ce mois';
    }
  }
  return { start, end, prevStart, prevEnd, label };
}

function countWeekdays(start, end) {
  let count = 0;
  const d = new Date(start);
  const e = new Date(end);
  while (d < e) { const dow = d.getDay(); if (dow > 0 && dow < 6) count++; d.setDate(d.getDate()+1); }
  return Math.max(count, 1);
}

function computeCollabScore(collabId, companyId, start, end, weights) {
  // --- CALLS ---
  const validCalls = db.prepare("SELECT COUNT(*) as cnt FROM call_logs WHERE companyId=? AND collaboratorId=? AND createdAt>=? AND createdAt<? AND is_valid_call=1").get(companyId, collabId, start, end)?.cnt || 0;
  const totalCalls = db.prepare("SELECT COUNT(*) as cnt FROM call_logs WHERE companyId=? AND collaboratorId=? AND createdAt>=? AND createdAt<?").get(companyId, collabId, start, end)?.cnt || 0;
  const invalidCalls = totalCalls - validCalls;
  const invalidRatio = totalCalls > 0 ? invalidCalls / totalCalls : 0;
  let scoreCalls = Math.min(100, Math.round(validCalls * 2));
  if (invalidRatio > 0.3) scoreCalls = Math.max(10, scoreCalls - 20);

  // --- QUALITY (AI) ---
  let scoreQuality = 50;
  let avgQualityAI = 0, avgConversionAI = 0, avgSentimentAI = 0;
  try {
    const ai = db.prepare("SELECT AVG(qualityScore) as q, AVG(conversionScore) as cv, AVG(sentimentScore) as s FROM ai_copilot_analyses WHERE companyId=? AND collaboratorId=? AND createdAt>=? AND createdAt<?").get(companyId, collabId, start, end);
    if (ai?.q != null && !isNaN(ai.q)) { scoreQuality = Math.round(Math.min(100, ai.q)); avgQualityAI = Math.round(ai.q); }
    avgConversionAI = Math.round(ai?.cv || 0);
    avgSentimentAI = Math.round(ai?.s || 0);
  } catch {}

  // --- CONVERSION ---
  const converted = db.prepare("SELECT COUNT(*) as cnt FROM incoming_leads WHERE companyId=? AND assigned_to=? AND status='converted' AND assigned_at>=? AND assigned_at<?").get(companyId, collabId, start, end)?.cnt || 0;
  const totalAssigned = db.prepare("SELECT COUNT(*) as cnt FROM lead_assignments WHERE companyId=? AND collaborator_id=? AND assigned_at>=? AND assigned_at<?").get(companyId, collabId, start, end)?.cnt || 0;
  const scoreConversion = totalAssigned > 0 ? Math.min(100, Math.round((converted / totalAssigned) * 200)) : 50;

  // --- SPEED ---
  let scoreSpeed = 50;
  try {
    const firstCalls = db.prepare(`SELECT la.assigned_at, MIN(cl.createdAt) as firstCall
      FROM lead_assignments la LEFT JOIN call_logs cl ON cl.contactId = la.contact_id AND cl.collaboratorId = la.collaborator_id AND cl.createdAt >= la.assigned_at
      WHERE la.companyId=? AND la.collaborator_id=? AND la.assigned_at>=? AND la.assigned_at<?
      GROUP BY la.id`).all(companyId, collabId, start, end);
    if (firstCalls.length > 0) {
      const avgHours = firstCalls.filter(f=>f.firstCall).reduce((s,f) => s + (new Date(f.firstCall) - new Date(f.assigned_at)) / 3600000, 0) / Math.max(firstCalls.filter(f=>f.firstCall).length, 1);
      scoreSpeed = avgHours < 1 ? 100 : avgHours < 4 ? 80 : avgHours < 24 ? 60 : avgHours < 72 ? 40 : 20;
    }
  } catch {}

  // --- FOLLOW-UP ---
  const pipelineMoves = db.prepare("SELECT COUNT(*) as cnt FROM pipeline_history WHERE companyId=? AND userId=? AND createdAt>=? AND createdAt<?").get(companyId, collabId, start, end)?.cnt || 0;
  const nrpFollowups = db.prepare("SELECT COUNT(*) as cnt FROM call_logs WHERE companyId=? AND collaboratorId=? AND direction='outbound' AND is_valid_call=1 AND createdAt>=? AND createdAt<?").get(companyId, collabId, start, end)?.cnt || 0;
  const scoreFollowup = Math.min(100, Math.round((pipelineMoves + nrpFollowups) * 3));

  // --- GOALS ---
  const goalsCompleted = db.prepare("SELECT COUNT(*) as cnt FROM user_goals WHERE companyId=? AND collaborator_id=? AND status='completed' AND period_end>=? AND period_start<?").get(companyId, collabId, start, end)?.cnt || 0;
  const goalsTotal = db.prepare("SELECT COUNT(*) as cnt FROM user_goals WHERE companyId=? AND collaborator_id=? AND period_end>=? AND period_start<?").get(companyId, collabId, start, end)?.cnt || 0;
  const scoreGoals = goalsTotal > 0 ? Math.min(100, Math.round((goalsCompleted / goalsTotal) * 100)) : 50;

  // --- DISCIPLINE ---
  const activeDays = db.prepare("SELECT COUNT(DISTINCT DATE(created_at)) as cnt FROM user_activity_logs WHERE companyId=? AND collaborator_id=? AND created_at>=? AND created_at<?").get(companyId, collabId, start, end)?.cnt || 0;
  const totalDays = countWeekdays(start, end);
  const scoreDiscipline = Math.min(100, Math.round((activeDays / totalDays) * 50) + Math.min(50, pipelineMoves * 2));

  // --- REGULARITY ---
  const callDays = db.prepare("SELECT COUNT(DISTINCT DATE(createdAt)) as cnt FROM call_logs WHERE companyId=? AND collaboratorId=? AND is_valid_call=1 AND createdAt>=? AND createdAt<?").get(companyId, collabId, start, end)?.cnt || 0;
  const scoreRegularity = Math.min(100, Math.round((callDays / totalDays) * 100));

  // --- Additional stats ---
  const avgDuration = db.prepare("SELECT AVG(duration) as avg FROM call_logs WHERE companyId=? AND collaboratorId=? AND is_valid_call=1 AND createdAt>=? AND createdAt<?").get(companyId, collabId, start, end)?.avg || 0;
  const outboundCalls = db.prepare("SELECT COUNT(*) as cnt FROM call_logs WHERE companyId=? AND collaboratorId=? AND direction='outbound' AND createdAt>=? AND createdAt<?").get(companyId, collabId, start, end)?.cnt || 0;
  const inboundCalls = totalCalls - outboundCalls;
  const smsCount = db.prepare("SELECT COUNT(*) as cnt FROM sms_messages WHERE companyId=? AND collaboratorId=? AND direction='outbound' AND createdAt>=? AND createdAt<?").get(companyId, collabId, start, end)?.cnt || 0;
  const activeLeads = db.prepare("SELECT COUNT(*) as cnt FROM incoming_leads WHERE companyId=? AND assigned_to=? AND status='assigned'").get(companyId, collabId)?.cnt || 0;
  const lostLeads = db.prepare("SELECT COUNT(*) as cnt FROM incoming_leads WHERE companyId=? AND assigned_to=? AND status='lost' AND assigned_at>=? AND assigned_at<?").get(companyId, collabId, start, end)?.cnt || 0;
  const bookingsCount = db.prepare("SELECT COUNT(*) as cnt FROM bookings WHERE collaboratorId=? AND date>=? AND date<? AND status='confirmed'").get(collabId, start, end)?.cnt || 0;

  // --- GLOBAL SCORE ---
  const w = weights;
  const totalWeight = (w.weight_calls + w.weight_quality + w.weight_conversion + w.weight_speed + w.weight_followup + w.weight_goals + w.weight_discipline + w.weight_regularity) || 100;
  const scoreGlobal = Math.round(
    (scoreCalls * w.weight_calls + scoreQuality * w.weight_quality + scoreConversion * w.weight_conversion +
     scoreSpeed * w.weight_speed + scoreFollowup * w.weight_followup + scoreGoals * w.weight_goals +
     scoreDiscipline * w.weight_discipline + scoreRegularity * w.weight_regularity) / totalWeight
  );

  return {
    scores: { calls: scoreCalls, quality: scoreQuality, conversion: scoreConversion, speed: scoreSpeed, followup: scoreFollowup, goals: scoreGoals, discipline: scoreDiscipline, regularity: scoreRegularity },
    scoreGlobal,
    stats: {
      validCalls, invalidCalls, totalCalls, outboundCalls, inboundCalls, avgDuration: Math.round(avgDuration),
      totalLeads: totalAssigned, convertedLeads: converted, activeLeads, lostLeads,
      bookings: bookingsCount, smsCount, pipelineMoves, nrpFollowups,
      avgQualityAI, avgConversionAI, avgSentimentAI, goalsCompleted, goalsTotal, activeDays,
    }
  };
}

function computeAutoBonusPenalty(collabId, companyId, stats, periodRef) {
  // Delete previous auto entries for this period
  db.prepare("DELETE FROM perf_bonus_penalty_logs WHERE companyId=? AND collaborator_id=? AND is_auto=1 AND period_ref=?").run(companyId, collabId, periodRef);

  const entries = [];
  const now = new Date().toISOString();

  // Auto-bonus
  if (stats.convertedLeads > 0) entries.push({ type:'bonus', category:'vente', value: stats.convertedLeads * 50, reason: `${stats.convertedLeads} conversion(s)` });
  if (stats.validCalls >= 10) entries.push({ type:'bonus', category:'volume_appels', value: 20, reason: `${stats.validCalls} appels valides` });
  if (stats.bookings >= 5) entries.push({ type:'bonus', category:'rdv', value: 30, reason: `${stats.bookings} RDV confirmés` });
  if (stats.goalsCompleted > 0) entries.push({ type:'bonus', category:'objectif', value: stats.goalsCompleted * 100, reason: `${stats.goalsCompleted} objectif(s) atteint(s)` });
  if (stats.avgQualityAI >= 85) entries.push({ type:'bonus', category:'excellence_qualite', value: 25, reason: `Qualité IA ${stats.avgQualityAI}%` });

  // Auto-penalty
  const invalidRatio = stats.totalCalls > 0 ? stats.invalidCalls / stats.totalCalls : 0;
  if (invalidRatio > 0.3) entries.push({ type:'penalty', category:'faux_appels', value: -30, reason: `${Math.round(invalidRatio*100)}% appels invalides` });

  // Leads non traités (assigned > 7j sans appel)
  try {
    const unworked = db.prepare(`SELECT COUNT(*) as cnt FROM incoming_leads il
      WHERE il.companyId=? AND il.assigned_to=? AND il.status='assigned'
      AND il.assigned_at < datetime('now', '-7 days')
      AND NOT EXISTS (SELECT 1 FROM call_logs cl WHERE cl.contactId = il.contact_id AND cl.collaboratorId = il.assigned_to)`
    ).get(companyId, collabId)?.cnt || 0;
    if (unworked > 0) entries.push({ type:'penalty', category:'leads_oublies', value: -20, reason: `${unworked} lead(s) non traité(s) depuis 7j+` });
  } catch {}

  if (stats.activeDays === 0) entries.push({ type:'penalty', category:'inactivite', value: -50, reason: 'Aucune activité sur la période' });
  if (stats.avgQualityAI > 0 && stats.avgQualityAI < 40) entries.push({ type:'penalty', category:'mauvaise_qualite', value: -25, reason: `Qualité IA ${stats.avgQualityAI}%` });

  // Live forbidden word violations
  try {
    const liveFlags = db.prepare("SELECT COUNT(*) as cnt FROM call_live_flags WHERE companyId=? AND collaboratorId=? AND created_at>=? AND created_at<?").get(companyId, collabId, periodRef, new Date().toISOString())?.cnt || 0;
    if (liveFlags > 0) entries.push({ type:'penalty', category:'mots_interdits_live', value: -Math.min(liveFlags * 10, 100), reason: `${liveFlags} mot(s) interdit(s) détecté(s) en live` });
  } catch {}

  // Insert
  const stmt = db.prepare("INSERT INTO perf_bonus_penalty_logs (id, companyId, collaborator_id, type, category, value, reason, is_auto, period_ref, created_at) VALUES (?,?,?,?,?,?,?,1,?,?)");
  for (const e of entries) {
    stmt.run(uid(), companyId, collabId, e.type, e.category, e.value, e.reason, periodRef, now);
  }

  const bonusTotal = entries.filter(e=>e.type==='bonus').reduce((s,e)=>s+e.value, 0);
  const penaltyTotal = entries.filter(e=>e.type==='penalty').reduce((s,e)=>s+e.value, 0);
  return { bonusTotal, penaltyTotal, entries };
}

function computeBadges(leaderboard) {
  if (!leaderboard.length) return {};
  const badges = {};
  const best = (key) => leaderboard.reduce((a,b) => (b.stats[key]||0) > (a.stats[key]||0) ? b : a, leaderboard[0]);
  const bestScore = (key) => leaderboard.reduce((a,b) => (b.scores[key]||0) > (a.scores[key]||0) ? b : a, leaderboard[0]);
  const bestTrend = leaderboard.reduce((a,b) => (b.trend||0) > (a.trend||0) ? b : a, leaderboard[0]);

  const convRate = (c) => c.stats.totalLeads > 0 ? c.stats.convertedLeads / c.stats.totalLeads : 0;
  const bestCloser = leaderboard.reduce((a,b) => convRate(b) > convRate(a) ? b : a, leaderboard[0]);

  if (bestCloser.stats.convertedLeads > 0) badges.closer = { id:bestCloser.id, name:bestCloser.name, value: Math.round(convRate(bestCloser)*100)+'%' };
  const vol = best('validCalls'); if (vol.stats.validCalls > 0) badges.volume = { id:vol.id, name:vol.name, value: vol.stats.validCalls+'' };
  const qual = bestScore('quality'); if (qual.scores.quality > 50) badges.qualite = { id:qual.id, name:qual.name, value: qual.scores.quality+'' };
  const rel = bestScore('followup'); if (rel.scores.followup > 0) badges.relanceur = { id:rel.id, name:rel.name, value: rel.scores.followup+'' };
  const reg = bestScore('regularity'); if (reg.scores.regularity > 0) badges.regulier = { id:reg.id, name:reg.name, value: reg.scores.regularity+'%' };
  if (bestTrend.trend > 0) badges.progression = { id:bestTrend.id, name:bestTrend.name, value: '+'+bestTrend.trend };

  return badges;
}

// ─── ROUTES ────────────────────────

// Dashboard / Leaderboard
router.get('/dashboard', requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    const { period, customStart, customEnd } = req.query;
    const dates = getPeriodDates(period || 'month', customStart, customEnd);
    const prevDates = { start: dates.prevStart, end: dates.prevEnd };
    const weights = getWeights(companyId);

    const collabs = db.prepare("SELECT id, name, color, email, role FROM collaborators WHERE companyId = ?").all(companyId);

    const leaderboard = collabs.map(c => {
      const current = computeCollabScore(c.id, companyId, dates.start, dates.end, weights);
      const prev = computeCollabScore(c.id, companyId, prevDates.start, prevDates.end, weights);
      const bp = computeAutoBonusPenalty(c.id, companyId, current.stats, dates.start);

      // Manual bonus/penalties for this period
      const manualBP = db.prepare("SELECT SUM(CASE WHEN type='bonus' THEN value ELSE 0 END) as bonusM, SUM(CASE WHEN type='penalty' THEN value ELSE 0 END) as penaltyM FROM perf_bonus_penalty_logs WHERE companyId=? AND collaborator_id=? AND is_auto=0 AND created_at>=? AND created_at<?").get(companyId, c.id, dates.start, dates.end);

      // Compute collab badges
      const collabBadges = [];

      return {
        id: c.id, name: c.name, color: c.color, email: c.email, role: c.role,
        scoreGlobal: current.scoreGlobal,
        scores: current.scores,
        stats: current.stats,
        bonusTotal: bp.bonusTotal + (manualBP?.bonusM || 0),
        penaltyTotal: bp.penaltyTotal + (manualBP?.penaltyM || 0),
        trend: current.scoreGlobal - prev.scoreGlobal,
        prevScore: prev.scoreGlobal,
        badges: collabBadges,
      };
    }).sort((a,b) => b.scoreGlobal - a.scoreGlobal);

    // Assign ranks and badges
    leaderboard.forEach((c,i) => { c.rank = i+1; });
    const badges = computeBadges(leaderboard);
    // Assign per-collab badges
    for (const [badge, data] of Object.entries(badges)) {
      const c = leaderboard.find(l=>l.id===data.id);
      if (c) c.badges.push(badge);
    }

    // Global stats
    const globalStats = {
      totalCalls: leaderboard.reduce((s,c) => s + c.stats.totalCalls, 0),
      totalLeads: leaderboard.reduce((s,c) => s + c.stats.totalLeads, 0),
      totalConverted: leaderboard.reduce((s,c) => s + c.stats.convertedLeads, 0),
      avgScore: leaderboard.length ? Math.round(leaderboard.reduce((s,c) => s + c.scoreGlobal, 0) / leaderboard.length) : 0,
      topPerformerName: leaderboard[0]?.name || '',
      totalBonuses: leaderboard.reduce((s,c) => s + c.bonusTotal, 0),
      totalPenalties: leaderboard.reduce((s,c) => s + c.penaltyTotal, 0),
      activePeriod: dates.label,
    };

    // Manager insights
    const insights = {
      topPerformers: leaderboard.filter(c => c.scoreGlobal >= 75).slice(0,5),
      atRisk: leaderboard.filter(c => c.scoreGlobal < 40 || c.trend < -15),
      toCoach: leaderboard.filter(c => c.scoreGlobal >= 40 && c.scoreGlobal < 60 && c.scores.quality < 50),
      underUtilized: leaderboard.filter(c => c.stats.activeLeads < 5 && c.scoreGlobal > 60),
      overLoaded: leaderboard.filter(c => c.stats.activeLeads > 30),
    };

    res.json({ success: true, leaderboard, globalStats, badges, insights, weights, period: dates });
  } catch (err) {
    console.error('[PERF DASHBOARD ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Detailed Audit
router.get('/audit/:collaboratorId', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { companyId, period, customStart, customEnd } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const collabId = req.params.collaboratorId;
    const collab = db.prepare("SELECT id, name, color, email, role FROM collaborators WHERE id=? AND companyId=?").get(collabId, companyId);
    if (!collab) return res.status(404).json({ error: 'Collaborateur non trouvé' });

    const dates = getPeriodDates(period || 'month', customStart, customEnd);
    const prevDates = { start: dates.prevStart, end: dates.prevEnd };
    const weights = getWeights(companyId);

    const current = computeCollabScore(collabId, companyId, dates.start, dates.end, weights);
    const prev = computeCollabScore(collabId, companyId, prevDates.start, prevDates.end, weights);

    // Rank
    const allScores = db.prepare("SELECT id FROM collaborators WHERE companyId=?").all(companyId)
      .map(c => ({ id: c.id, score: computeCollabScore(c.id, companyId, dates.start, dates.end, weights).scoreGlobal }))
      .sort((a,b) => b.score - a.score);
    const rank = allScores.findIndex(c => c.id === collabId) + 1;

    // Bonus/Penalty history for period
    const bpHistory = db.prepare("SELECT * FROM perf_bonus_penalty_logs WHERE companyId=? AND collaborator_id=? AND created_at>=? AND created_at<? ORDER BY created_at DESC").all(companyId, collabId, dates.start, dates.end);
    const bonusTotal = bpHistory.filter(b=>b.type==='bonus').reduce((s,b)=>s+b.value, 0);
    const penaltyTotal = bpHistory.filter(b=>b.type==='penalty').reduce((s,b)=>s+b.value, 0);

    // Activity by day of week
    const activityByDay = {};
    try {
      const rows = db.prepare("SELECT strftime('%w', created_at) as dow, COUNT(*) as cnt FROM user_activity_logs WHERE companyId=? AND collaborator_id=? AND created_at>=? AND created_at<? GROUP BY dow").all(companyId, collabId, dates.start, dates.end);
      for (const r of rows) activityByDay[r.dow] = r.cnt;
    } catch {}

    // Coaching insights
    let coaching = null;
    try {
      const ci = getCoachingInsights(collabId);
      if (ci?.success) coaching = ci.insights;
    } catch {}

    // Last AI report
    const lastReport = db.prepare("SELECT * FROM perf_audit_reports WHERE companyId=? AND collaborator_id=? ORDER BY generated_at DESC LIMIT 1").get(companyId, collabId);
    let parsedReport = null;
    if (lastReport) {
      try { parsedReport = typeof lastReport.summary_json === 'string' ? JSON.parse(lastReport.summary_json) : lastReport.summary_json; } catch {}
      parsedReport = { ...parsedReport, generated_at: lastReport.generated_at, period_type: lastReport.period_type };
    }

    res.json({
      success: true,
      collab,
      summary: { scoreGlobal: current.scoreGlobal, rank, total: allScores.length, trend: current.scoreGlobal - prev.scoreGlobal, prevScore: prev.scoreGlobal, bonusTotal, penaltyTotal },
      scores: current.scores,
      stats: current.stats,
      activityByDay,
      bpHistory,
      coaching,
      aiReport: parsedReport,
      period: dates,
    });
  } catch (err) {
    console.error('[PERF AUDIT ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Add manual bonus
router.post('/bonus', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { companyId, collaborator_id, category, value, reason } = req.body;
    if (!companyId || !collaborator_id || !value) return res.status(400).json({ error: 'Champs requis: companyId, collaborator_id, value' });
    db.prepare("INSERT INTO perf_bonus_penalty_logs (id, companyId, collaborator_id, type, category, value, reason, is_auto, period_ref, created_at) VALUES (?,?,?,'bonus',?,?,?,0,'',?)").run(uid(), companyId, collaborator_id, category || 'autre', Math.abs(value), reason || '', new Date().toISOString());
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add manual penalty
router.post('/penalty', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { companyId, collaborator_id, category, value, reason } = req.body;
    if (!companyId || !collaborator_id || !value) return res.status(400).json({ error: 'Champs requis: companyId, collaborator_id, value' });
    db.prepare("INSERT INTO perf_bonus_penalty_logs (id, companyId, collaborator_id, type, category, value, reason, is_auto, period_ref, created_at) VALUES (?,?,?,'penalty',?,?,?,0,'',?)").run(uid(), companyId, collaborator_id, category || 'autre', -Math.abs(value), reason || '', new Date().toISOString());
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bonus/Penalty history
router.get('/history/:collaboratorId', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { companyId, limit } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const rows = db.prepare("SELECT * FROM perf_bonus_penalty_logs WHERE companyId=? AND collaborator_id=? ORDER BY created_at DESC LIMIT ?").all(companyId, req.params.collaboratorId, parseInt(limit) || 50);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Generate AI Audit Report
router.post('/generate-audit/:collaboratorId', requireAdmin, enforceCompany, async (req, res) => {
  try {
    const { companyId, period, customStart, customEnd } = req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const collabId = req.params.collaboratorId;
    const collab = db.prepare("SELECT name, email, ai_copilot_role FROM collaborators WHERE id=? AND companyId=?").get(collabId, companyId);
    if (!collab) return res.status(404).json({ error: 'Collaborateur non trouvé' });

    const dates = getPeriodDates(period || 'month', customStart, customEnd);
    const weights = getWeights(companyId);
    const scoreData = computeCollabScore(collabId, companyId, dates.start, dates.end, weights);

    let coaching = null;
    try { const ci = getCoachingInsights(collabId); if (ci?.success) coaching = ci.insights; } catch {}

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return res.json({ success: false, error: 'No OpenAI API key configured' });

    const prompt = `Tu es un manager expert en performance commerciale. Analyse les performances du collaborateur "${collab.name}" (rôle: ${collab.ai_copilot_role || 'commercial'}) sur la période ${dates.start} au ${dates.end}.

Données de performance:
- Score global: ${scoreData.scoreGlobal}/100
- Scores détaillés: Appels=${scoreData.scores.calls}, Qualité=${scoreData.scores.quality}, Conversion=${scoreData.scores.conversion}, Rapidité=${scoreData.scores.speed}, Suivi=${scoreData.scores.followup}, Objectifs=${scoreData.scores.goals}, Discipline=${scoreData.scores.discipline}, Régularité=${scoreData.scores.regularity}
- Appels valides: ${scoreData.stats.validCalls}, invalides: ${scoreData.stats.invalidCalls}
- Durée moyenne: ${scoreData.stats.avgDuration}s
- Leads convertis: ${scoreData.stats.convertedLeads}/${scoreData.stats.totalLeads}
- RDV confirmés: ${scoreData.stats.bookings}
- Qualité IA moyenne: ${scoreData.stats.avgQualityAI}%
- Jours actifs: ${scoreData.stats.activeDays}
${coaching ? `\nCoaching IA: Forces: ${coaching.strengths?.join(', ') || 'N/A'}, Faiblesses: ${coaching.weaknesses?.join(', ') || 'N/A'}` : ''}

Génère un JSON avec exactement ces champs:
{
  "summary": "Résumé en 3-4 phrases de la performance globale",
  "strengths": ["3 à 5 points forts concrets"],
  "weaknesses": ["3 à 5 points faibles concrets"],
  "improvements": ["3 à 5 axes d'amélioration concrets et actionnables"],
  "quality_label": "excellent" ou "bon" ou "moyen" ou "faible",
  "defects": ["Défauts observés dans la performance"]
}`;

    const gptRes = await fetch(GPT_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GPT_MODEL, messages: [{ role:'system', content:'Tu es un expert en management de performance commerciale. Réponds uniquement en JSON valide.' }, { role:'user', content: prompt }], temperature: 0.7, max_tokens: 1500, response_format: { type: 'json_object' } })
    });

    if (!gptRes.ok) throw new Error(`GPT API error: ${gptRes.status}`);
    const gptData = await gptRes.json();
    const content = gptData.choices?.[0]?.message?.content || '{}';
    let report;
    try { report = JSON.parse(content); } catch { report = { summary: content, strengths: [], weaknesses: [], improvements: [], quality_label: 'moyen', defects: [] }; }

    const id = uid();
    db.prepare("INSERT INTO perf_audit_reports (id, companyId, collaborator_id, period_type, period_start, period_end, summary_json, generated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, companyId, collabId, period || 'month', dates.start, dates.end, JSON.stringify(report), new Date().toISOString());

    res.json({ success: true, report: { ...report, generated_at: new Date().toISOString() } });
  } catch (err) {
    console.error('[PERF AI AUDIT ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Settings
router.get('/settings', requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const weights = getWeights(companyId);
    res.json({ success: true, data: weights });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/settings', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { companyId, weight_calls, weight_quality, weight_conversion, weight_speed, weight_followup, weight_goals, weight_discipline, weight_regularity } = req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    const total = (weight_calls||0) + (weight_quality||0) + (weight_conversion||0) + (weight_speed||0) + (weight_followup||0) + (weight_goals||0) + (weight_discipline||0) + (weight_regularity||0);
    if (total !== 100) return res.status(400).json({ error: `La somme des poids doit être 100 (actuellement ${total})` });

    const existing = db.prepare("SELECT id FROM perf_score_settings WHERE companyId=?").get(companyId);
    if (existing) {
      db.prepare("UPDATE perf_score_settings SET weight_calls=?, weight_quality=?, weight_conversion=?, weight_speed=?, weight_followup=?, weight_goals=?, weight_discipline=?, weight_regularity=?, updated_at=? WHERE companyId=?")
        .run(weight_calls, weight_quality, weight_conversion, weight_speed, weight_followup, weight_goals, weight_discipline, weight_regularity, new Date().toISOString(), companyId);
    } else {
      db.prepare("INSERT INTO perf_score_settings (id, companyId, weight_calls, weight_quality, weight_conversion, weight_speed, weight_followup, weight_goals, weight_discipline, weight_regularity, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run(uid(), companyId, weight_calls, weight_quality, weight_conversion, weight_speed, weight_followup, weight_goals, weight_discipline, weight_regularity, new Date().toISOString());
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
