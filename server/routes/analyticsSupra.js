// ═══════════════════════════════════════════════════════
// Analytics Supra — Cockpit analytique global
// GET /api/analytics/supra?period=7d|30d|90d|custom&from=&to=&companyId=
//
// Retourne :
//  - totals       : metriques totales (periode courante)
//  - previous     : memes metriques sur la periode precedente (pour deltas)
//  - deltas       : variation J-1 et W-1
//  - timeseries   : serie temporelle journaliere (contacts, callSec, sms, credits)
//  - perCompany   : rollup par entreprise + growth 7j
//  - finance      : stubs MRR / cost / marge / projection (V2 IA)
//  - companyScore : score engagement (V2 IA)
//
// V2 (a brancher plus tard) :
//  - detection anomalies (baisse activite, explosion conso)
//  - scoring entreprises (engagement réel + clv)
//  - estimation valeur (MRR * multiple secteur)
//  - insights auto en langage naturel
// ═══════════════════════════════════════════════════════
import { Router } from 'express';
import { db } from '../db/database.js';
import { requireSupra } from '../middleware/auth.js';

const router = Router();

// Cache memoire 60s — evite de cramer la DB a chaque refresh (auto-refresh 30s cote front)
const CACHE_TTL_MS = 60_000;
const cache = new Map(); // key = JSON(params), value = { ts, data }

function isoDay(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; }

// ── HELPERS SQL ───────────────────────────────────────
function qCount(sql, params = []) { try { return db.prepare(sql).get(...params)?.c || 0; } catch { return 0; } }
function qSum(sql, params = []) { try { return db.prepare(sql).get(...params)?.s || 0; } catch { return 0; } }
function pctDelta(cur, prev) { if (!prev) return cur > 0 ? 100 : 0; return Math.round(((cur - prev) / prev) * 1000) / 10; }

router.get('/supra', requireSupra, (req, res) => {
  try {
    const period = String(req.query.period || '30d');
    const companyId = String(req.query.companyId || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');

    const cacheKey = JSON.stringify({ period, companyId, from, to });
    const hit = cache.get(cacheKey);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) {
      return res.json({ ...hit.data, _cached: true, _age: Date.now() - hit.ts });
    }

    // ── Periode ──
    let days = 30;
    if (period === '7d') days = 7; else if (period === '90d') days = 90;
    let startDate, endDate;
    if (period === 'custom' && from && to) {
      startDate = new Date(from); endDate = new Date(to);
      days = Math.max(1, Math.round((endDate - startDate) / 86400000));
    } else {
      endDate = new Date();
      startDate = daysAgo(days);
    }
    const startIso = startDate.toISOString();
    const prevStartIso = new Date(startDate.getTime() - days * 86400000).toISOString();
    const prevEndIso = startIso;

    // ── Filtre entreprise ──
    const coFilter = companyId ? ' AND companyId = ?' : '';
    const coFilterStart = companyId ? ' WHERE companyId = ?' : '';
    const coParams = companyId ? [companyId] : [];

    // ─────────────────────────────────────────────────────
    // 1) TOTALS (cumul all-time)
    // ─────────────────────────────────────────────────────
    const totals = {
      contactsCount: qCount(`SELECT COUNT(*) c FROM contacts${coFilterStart}`, coParams),
      callSec: qSum(`SELECT COALESCE(SUM(duration),0) s FROM call_logs${coFilterStart}`, coParams),
      callCount: qCount(`SELECT COUNT(*) c FROM call_logs${coFilterStart}`, coParams),
      smsCount: qCount(`SELECT COUNT(*) c FROM sms_messages${coFilterStart}`, coParams),
      creditsSpent: qSum(`SELECT COALESCE(SUM(amount),0) s FROM telecom_credit_logs WHERE type='debit'${coFilter}`, coParams),
      companiesActive: companyId ? 1 : qCount(`SELECT COUNT(*) c FROM companies WHERE active = 1`),
      collabsActive: qCount(`SELECT COUNT(*) c FROM collaborators${coFilterStart}`, coParams),
    };

    // ─────────────────────────────────────────────────────
    // 2) DELTAS J-1 et W-1 (metriques flow : contacts, calls, sms, credits)
    // ─────────────────────────────────────────────────────
    const today = isoDay(new Date());
    const yesterday = isoDay(daysAgo(1));
    const twoDaysAgo = isoDay(daysAgo(2));
    const weekAgo = isoDay(daysAgo(7));
    const twoWeeksAgo = isoDay(daysAgo(14));

    const flowInRange = (table, col, fromIso, toIso) => {
      const isSum = col !== '*';
      const agg = isSum ? `COALESCE(SUM(${col}),0) s` : 'COUNT(*) c';
      const sql = `SELECT ${agg} FROM ${table} WHERE createdAt >= ? AND createdAt < ?${coFilter}`;
      const row = db.prepare(sql).get(fromIso, toIso, ...coParams);
      return (isSum ? row?.s : row?.c) || 0;
    };
    const flowDebitInRange = (fromIso, toIso) => {
      const sql = `SELECT COALESCE(SUM(amount),0) s FROM telecom_credit_logs WHERE type='debit' AND createdAt >= ? AND createdAt < ?${coFilter}`;
      return db.prepare(sql).get(fromIso, toIso, ...coParams)?.s || 0;
    };

    const metric = (table, col, dayFrom, dayTo) => flowInRange(table, col, dayFrom, dayTo);
    // Today vs yesterday
    const contactsToday = metric('contacts', '*', today, '9999');
    const contactsYesterday = metric('contacts', '*', yesterday, today);
    const contactsTwoDaysAgo = metric('contacts', '*', twoDaysAgo, yesterday);
    const callSecToday = metric('call_logs', 'duration', today, '9999');
    const callSecYesterday = metric('call_logs', 'duration', yesterday, today);
    const smsToday = metric('sms_messages', '*', today, '9999');
    const smsYesterday = metric('sms_messages', '*', yesterday, today);
    const creditsToday = flowDebitInRange(today, '9999');
    const creditsYesterday = flowDebitInRange(yesterday, today);
    // This week vs previous week
    const contactsThisWeek = metric('contacts', '*', weekAgo, '9999');
    const contactsPrevWeek = metric('contacts', '*', twoWeeksAgo, weekAgo);
    const callSecThisWeek = metric('call_logs', 'duration', weekAgo, '9999');
    const callSecPrevWeek = metric('call_logs', 'duration', twoWeeksAgo, weekAgo);
    const smsThisWeek = metric('sms_messages', '*', weekAgo, '9999');
    const smsPrevWeek = metric('sms_messages', '*', twoWeeksAgo, weekAgo);
    const creditsThisWeek = flowDebitInRange(weekAgo, '9999');
    const creditsPrevWeek = flowDebitInRange(twoWeeksAgo, weekAgo);

    const deltas = {
      contacts: {
        today: contactsToday, yesterday: contactsYesterday, deltaDay: pctDelta(contactsToday, contactsYesterday),
        thisWeek: contactsThisWeek, prevWeek: contactsPrevWeek, deltaWeek: pctDelta(contactsThisWeek, contactsPrevWeek),
      },
      callSec: {
        today: callSecToday, yesterday: callSecYesterday, deltaDay: pctDelta(callSecToday, callSecYesterday),
        thisWeek: callSecThisWeek, prevWeek: callSecPrevWeek, deltaWeek: pctDelta(callSecThisWeek, callSecPrevWeek),
      },
      sms: {
        today: smsToday, yesterday: smsYesterday, deltaDay: pctDelta(smsToday, smsYesterday),
        thisWeek: smsThisWeek, prevWeek: smsPrevWeek, deltaWeek: pctDelta(smsThisWeek, smsPrevWeek),
      },
      credits: {
        today: creditsToday, yesterday: creditsYesterday, deltaDay: pctDelta(creditsToday, creditsYesterday),
        thisWeek: creditsThisWeek, prevWeek: creditsPrevWeek, deltaWeek: pctDelta(creditsThisWeek, creditsPrevWeek),
      },
    };

    // Previous period (pour deltas "vs periode precedente")
    const previous = {
      contacts: flowInRange('contacts', '*', prevStartIso, prevEndIso),
      callSec: flowInRange('call_logs', 'duration', prevStartIso, prevEndIso),
      sms: flowInRange('sms_messages', '*', prevStartIso, prevEndIso),
      credits: flowDebitInRange(prevStartIso, prevEndIso),
    };
    const current = {
      contacts: flowInRange('contacts', '*', startIso, new Date(Date.now() + 86400000).toISOString()),
      callSec: flowInRange('call_logs', 'duration', startIso, new Date(Date.now() + 86400000).toISOString()),
      sms: flowInRange('sms_messages', '*', startIso, new Date(Date.now() + 86400000).toISOString()),
      credits: flowDebitInRange(startIso, new Date(Date.now() + 86400000).toISOString()),
    };

    // ─────────────────────────────────────────────────────
    // 3) TIMESERIES journaliere
    // ─────────────────────────────────────────────────────
    const dayList = [];
    for (let i = days - 1; i >= 0; i--) dayList.push(isoDay(daysAgo(i)));

    const bucketDaily = (table, col) => {
      const isSum = col !== '*';
      const agg = isSum ? `COALESCE(SUM(${col}),0) v` : 'COUNT(*) v';
      const sql = `SELECT substr(createdAt,1,10) d, ${agg} FROM ${table} WHERE createdAt >= ?${coFilter} GROUP BY d`;
      const rows = db.prepare(sql).all(startIso, ...coParams);
      const m = {}; rows.forEach(r => { if (r.d) m[r.d] = r.v; });
      return m;
    };
    const bucketDebitDaily = () => {
      const sql = `SELECT substr(createdAt,1,10) d, COALESCE(SUM(amount),0) v FROM telecom_credit_logs WHERE type='debit' AND createdAt >= ?${coFilter} GROUP BY d`;
      const rows = db.prepare(sql).all(startIso, ...coParams);
      const m = {}; rows.forEach(r => { if (r.d) m[r.d] = r.v; });
      return m;
    };

    const mapContacts = bucketDaily('contacts', '*');
    const mapCalls = bucketDaily('call_logs', 'duration');
    const mapSms = bucketDaily('sms_messages', '*');
    const mapCredits = bucketDebitDaily();

    const timeseries = dayList.map(d => ({
      date: d,
      contacts: mapContacts[d] || 0,
      callSec: mapCalls[d] || 0,
      sms: mapSms[d] || 0,
      credits: mapCredits[d] || 0,
    }));

    // ─────────────────────────────────────────────────────
    // 4) PER COMPANY (bulk) + growth 7j
    // ─────────────────────────────────────────────────────
    const companies = db.prepare('SELECT id, name, plan, active, createdAt FROM companies').all();
    const grp = (sql) => { const m = {}; try { db.prepare(sql).all().forEach(r => { m[r.companyId] = r.v; }); } catch {} return m; };

    const totContacts = grp(`SELECT companyId, COUNT(*) v FROM contacts GROUP BY companyId`);
    const totCallSec = grp(`SELECT companyId, COALESCE(SUM(duration),0) v FROM call_logs GROUP BY companyId`);
    const totSms = grp(`SELECT companyId, COUNT(*) v FROM sms_messages GROUP BY companyId`);
    const totCredits = grp(`SELECT companyId, COALESCE(SUM(amount),0) v FROM telecom_credit_logs WHERE type='debit' GROUP BY companyId`);
    const totCollabs = grp(`SELECT companyId, COUNT(*) v FROM collaborators GROUP BY companyId`);

    // Growth 7j : contacts created in last 7d vs 7d before
    const grpSince = (sql, since, since2) => {
      const m = {};
      try { db.prepare(sql).all(since, since2).forEach(r => { m[r.companyId] = r.v; }); } catch {}
      return m;
    };
    const contactsLast7 = grpSince(`SELECT companyId, COUNT(*) v FROM contacts WHERE createdAt >= ? AND createdAt < ? GROUP BY companyId`, weekAgo, '9999');
    const contactsPrev7 = grpSince(`SELECT companyId, COUNT(*) v FROM contacts WHERE createdAt >= ? AND createdAt < ? GROUP BY companyId`, twoWeeksAgo, weekAgo);

    // Last activity (max createdAt across call_logs / sms_messages / contacts)
    const lastAct = {};
    try {
      db.prepare(`SELECT companyId, MAX(createdAt) v FROM (
        SELECT companyId, createdAt FROM call_logs
        UNION ALL SELECT companyId, createdAt FROM sms_messages
        UNION ALL SELECT companyId, createdAt FROM contacts WHERE createdAt != ''
      ) GROUP BY companyId`).all().forEach(r => { lastAct[r.companyId] = r.v; });
    } catch {}

    const perCompany = companies.map(co => {
      const contacts = totContacts[co.id] || 0;
      const callSec = totCallSec[co.id] || 0;
      const smsCount = totSms[co.id] || 0;
      const credits = totCredits[co.id] || 0;
      const collabs = totCollabs[co.id] || 0;
      const c7 = contactsLast7[co.id] || 0;
      const p7 = contactsPrev7[co.id] || 0;
      const growth7d = pctDelta(c7, p7);

      // ── V2 IA — champs prepares (stubs, non calcules en V1) ──
      // TODO V2 : MRR reel depuis table `billing` / `subscriptions`
      const mrrEstimated = null;
      // TODO V2 : coût reel depuis `cost_tracking` (Twilio/Brevo) + cout infra proportionnel
      const costEstimated = null;
      // TODO V2 : marge = mrrEstimated - costEstimated
      const marginEstimated = null;
      // TODO V2 : scoring engagement (usage * freshness * growth)
      const companyScore = null;
      // TODO V2 : projection 30j basee sur trend 7j/30j + saisonnalite
      const revenueProjection30d = null;

      return {
        id: co.id,
        name: co.name,
        plan: co.plan,
        active: !!co.active,
        createdAt: co.createdAt,
        contacts,
        callSec,
        smsCount,
        credits,
        collabs,
        contactsLast7: c7,
        growth7d,
        lastActivity: lastAct[co.id] || null,
        mrrEstimated,
        costEstimated,
        marginEstimated,
        companyScore,
        revenueProjection30d,
      };
    });

    // ─────────────────────────────────────────────────────
    // 5) FINANCE (stub V1 — calcul reel en V2)
    // ─────────────────────────────────────────────────────
    // TODO V2 : brancher sur table billing / subscriptions + cost_tracking
    const finance = {
      mrrEstimated: null,           // Somme des MRR par entreprise (depuis plans + add-ons)
      costEstimated: null,          // Cout infra + API tiers (Twilio, Brevo, Deepgram, OpenAI)
      marginEstimated: null,        // mrrEstimated - costEstimated
      revenueProjection30d: null,   // Projection linear basee sur trend
      available: false,             // Flag : donnees finance non disponibles en V1
      note: 'V2 : brancher billing + cost_tracking pour activer les metriques financieres',
    };

    // ─────────────────────────────────────────────────────
    // 6) INSIGHTS IA (stubs V2)
    // ─────────────────────────────────────────────────────
    // TODO V2 : detection anomalies (z-score sur timeseries), classification engagement, insights NLP
    const insights = {
      anomalies: [],           // TODO V2 : ex [{companyId, type:'activity_drop', severity:'high', detail:'...'}]
      topGrowth: [],           // TODO V2 : top 3 entreprises en croissance
      topRisk: [],             // TODO V2 : top 3 entreprises a risque (baisse activite)
      available: false,
      note: 'V2 : brancher detection anomalies + scoring NLP',
    };

    const payload = {
      generatedAt: new Date().toISOString(),
      period, days, companyId: companyId || null,
      totals,
      current,
      previous,
      deltas,
      timeseries,
      perCompany,
      finance,
      insights,
    };

    cache.set(cacheKey, { ts: Date.now(), data: payload });
    res.json(payload);
  } catch (err) {
    console.error('[ANALYTICS SUPRA]', err);
    res.status(500).json({ error: err.message });
  }
});

// Invalidate cache endpoint (pour forcer refresh apres action admin)
router.post('/supra/invalidate', requireSupra, (req, res) => {
  cache.clear();
  res.json({ success: true });
});

export default router;
