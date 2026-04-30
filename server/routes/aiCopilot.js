/**
 * AI Sales Copilot Routes — Calendar360
 * API for call analysis, script generation, coaching, objection database
 */

import { Router } from 'express';
import { db } from '../db/database.js';
import { analyzeCall, generateScript, getCoachingInsights, getObjectionDatabase, crmAutoFill, getLiveCoaching, snapshotAiProfile, saveProfileHistory, getProfileChanges } from '../services/aiCopilot.js';
import { parseRow } from '../db/database.js';
import { requireAuth, enforceCompany, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ─── CALL ANALYSIS ──────────────────────────

// POST /api/ai-copilot/analyze/:callLogId — Analyze a call
router.post('/analyze/:callLogId', requireAuth, async (req, res) => {
  try {
    // Vérifier ownership du call log
    if (!req.auth.isSupra) {
      const cl = db.prepare('SELECT companyId FROM call_logs WHERE id = ?').get(req.params.callLogId);
      if (cl && cl.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    }
    const result = await analyzeCall(req.params.callLogId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai-copilot/analyses — List analyses
router.get('/analyses', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId, collaboratorId, limit = '30', offset = '0' } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    let sql = 'SELECT * FROM ai_copilot_analyses WHERE companyId = ?';
    const params = [companyId];

    if (collaboratorId) { sql += ' AND collaboratorId = ?'; params.push(collaboratorId); }
    sql += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const analyses = db.prepare(sql).all(...params);
    const parsed = analyses.map(a => {
      try { a.objections = JSON.parse(a.objections_json || '[]'); } catch { a.objections = []; }
      try { a.actionItems = JSON.parse(a.actionItems_json || '[]'); } catch { a.actionItems = []; }
      try { a.coachingTips = JSON.parse(a.coachingTips_json || '[]'); } catch { a.coachingTips = []; }
      try { a.tags = JSON.parse(a.tags_json || '[]'); } catch { a.tags = []; }
      delete a.objections_json; delete a.actionItems_json; delete a.coachingTips_json; delete a.tags_json;
      // Truncate transcription in list view
      a.transcriptionPreview = (a.transcription || '').slice(0, 200);
      delete a.transcription;
      // Get collab name
      const collab = db.prepare('SELECT name, color FROM collaborators WHERE id = ?').get(a.collaboratorId);
      a.collaboratorName = collab?.name || 'Inconnu';
      a.collaboratorColor = collab?.color || '#2563EB';
      return a;
    });

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai-copilot/analyses/:id — Full detail
router.get('/analyses/:id', requireAuth, (req, res) => {
  try {
    const a = db.prepare('SELECT * FROM ai_copilot_analyses WHERE id = ?').get(req.params.id);
    if (!a) return res.status(404).json({ error: 'Analysis not found' });
    if (!req.auth.isSupra && a.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });

    try { a.objections = JSON.parse(a.objections_json || '[]'); } catch { a.objections = []; }
    try { a.actionItems = JSON.parse(a.actionItems_json || '[]'); } catch { a.actionItems = []; }
    try { a.coachingTips = JSON.parse(a.coachingTips_json || '[]'); } catch { a.coachingTips = []; }
    try { a.tags = JSON.parse(a.tags_json || '[]'); } catch { a.tags = []; }
    delete a.objections_json; delete a.actionItems_json; delete a.coachingTips_json; delete a.tags_json;

    const collab = db.prepare('SELECT name, color FROM collaborators WHERE id = ?').get(a.collaboratorId);
    a.collaboratorName = collab?.name || 'Inconnu';

    const contact = a.contactId ? db.prepare('SELECT name, email, phone FROM contacts WHERE id = ?').get(a.contactId) : null;
    a.contactName = contact?.name || '';
    a.contactEmail = contact?.email || '';
    a.contactPhone = contact?.phone || '';

    res.json(a);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CONTACT ANALYSIS HISTORY ────────────────

// GET /api/ai-copilot/contact/:contactId/analyses — all analyses for a contact
router.get('/contact/:contactId/analyses', requireAuth, (req, res) => {
  try {
    const { contactId } = req.params;
    // Security: verify contact belongs to user's company
    const contact = db.prepare('SELECT companyId FROM contacts WHERE id = ?').get(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    if (!req.auth.isSupra && contact.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    const rows = db.prepare(`
      SELECT id, companyId, collaboratorId, callLogId, contactId, summary,
             sentimentScore, qualityScore, conversionScore,
             objections_json, actionItems_json, coachingTips_json,
             followupType, followupDate, pipelineStage, tags_json,
             extended_json, validation_status, validated_at, createdAt
      FROM ai_copilot_analyses WHERE contactId = ? ORDER BY createdAt DESC LIMIT 20
    `).all(contactId);

    const analyses = rows.map(r => ({
      ...r,
      objections: JSON.parse(r.objections_json || '[]'),
      actionItems: JSON.parse(r.actionItems_json || '[]'),
      coachingTips: JSON.parse(r.coachingTips_json || '[]'),
      tags: JSON.parse(r.tags_json || '[]'),
      extended: JSON.parse(r.extended_json || '{}'),
    }));

    res.json({ analyses, total: analyses.length });
  } catch (err) {
    console.error('[AI COPILOT CONTACT HISTORY]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── VALIDATE / REJECT ANALYSIS ─────────────

// POST /api/ai-copilot/validate/:analysisId — validate or reject, inject into contact
router.post('/validate/:analysisId', requireAuth, (req, res) => {
  try {
    const { analysisId } = req.params;
    const { action, editedSummary, editedBesoin, editedActions, editedInfos } = req.body;
    if (!action || !['validate', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be validate or reject' });
    }

    // Load analysis
    const analysis = db.prepare('SELECT * FROM ai_copilot_analyses WHERE id = ?').get(analysisId);
    if (!analysis) return res.status(404).json({ error: 'Analyse introuvable' });

    // Security: verify analysis belongs to a contact in user's company
    if (analysis.contactId) {
      const contact = db.prepare('SELECT companyId FROM contacts WHERE id = ?').get(analysis.contactId);
      if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
      if (!req.auth.isSupra && contact.companyId !== req.auth.companyId) {
        return res.status(403).json({ error: 'Accès interdit' });
      }
    } else if (!req.auth.isSupra && analysis.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    const now = new Date().toISOString();
    const userId = req.auth.collaboratorId;

    if (action === 'reject') {
      db.prepare('UPDATE ai_copilot_analyses SET validation_status = ?, rejected_at = ?, rejected_by = ? WHERE id = ?')
        .run('rejected', now, userId, analysisId);
      return res.json({ success: true, rejected: true });
    }

    // Validate — apply edits if provided
    if (editedSummary || editedBesoin || editedActions || editedInfos) {
      const updates = [];
      const params = [];
      if (editedSummary) { updates.push('summary = ?'); params.push(editedSummary); }
      if (editedBesoin || editedInfos) {
        const ext = JSON.parse(analysis.extended_json || '{}');
        if (editedBesoin) ext.besoinExprime = editedBesoin;
        if (editedInfos) ext.informationsImportantes = editedInfos;
        updates.push('extended_json = ?'); params.push(JSON.stringify(ext));
      }
      if (editedActions) { updates.push('actionItems_json = ?'); params.push(JSON.stringify(editedActions)); }
      if (updates.length > 0) {
        db.prepare(`UPDATE ai_copilot_analyses SET ${updates.join(', ')} WHERE id = ?`).run(...params, analysisId);
      }
    }

    // Mark as validated
    db.prepare('UPDATE ai_copilot_analyses SET validation_status = ?, validated_at = ?, validated_by = ? WHERE id = ?')
      .run('validated', now, userId, analysisId);

    // Update contact's last_ai_analysis_id — only if more recent
    if (analysis.contactId) {
      const current = db.prepare('SELECT last_ai_analysis_id FROM contacts WHERE id = ?').get(analysis.contactId);
      let shouldUpdate = true;
      if (current?.last_ai_analysis_id) {
        const currentAnalysis = db.prepare('SELECT createdAt FROM ai_copilot_analyses WHERE id = ?').get(current.last_ai_analysis_id);
        if (currentAnalysis && currentAnalysis.createdAt > analysis.createdAt) {
          shouldUpdate = false; // Don't overwrite with older analysis
        }
      }
      if (shouldUpdate) {
        db.prepare('UPDATE contacts SET last_ai_analysis_id = ? WHERE id = ?').run(analysisId, analysis.contactId);
      }
    }

    res.json({ success: true, contactId: analysis.contactId, analysisId });
  } catch (err) {
    console.error('[AI COPILOT VALIDATE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE RECOMMENDED ACTION STATUS ────────

// PUT /api/ai-copilot/recommended-actions/:id/status
router.put('/recommended-actions/:id/status', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'completed' | 'skipped'
    if (!status || !['completed', 'skipped', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'status must be completed, skipped or pending' });
    }
    const action = db.prepare('SELECT companyId FROM recommended_actions WHERE id = ?').get(id);
    if (!action) return res.status(404).json({ error: 'Action introuvable' });
    if (!req.auth.isSupra && action.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    db.prepare('UPDATE recommended_actions SET status = ? WHERE id = ?').run(status, id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CONTACT AI MEMORY ──────────────────────

// GET /api/ai-copilot/memory/:contactId — read AI memory for a contact
router.get('/memory/:contactId', requireAuth, (req, res) => {
  try {
    const { contactId } = req.params;
    const contact = db.prepare('SELECT companyId FROM contacts WHERE id = ?').get(contactId);
    if (!contact) return res.json({ exists: false, contactId });
    if (!req.auth.isSupra && contact.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });

    const memory = db.prepare('SELECT * FROM contact_ai_memory WHERE contactId = ?').get(contactId);
    if (!memory) return res.json({ exists: false, contactId });

    res.json({
      exists: true,
      ...memory,
      objections: JSON.parse(memory.objections_json || '[]'),
      promises_pending: JSON.parse(memory.promises_pending_json || '[]'),
      risk_flags: JSON.parse(memory.risk_flags_json || '[]'),
      tags: JSON.parse(memory.tags_json || '[]'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai-copilot/memories — all AI memories for company
router.get('/memories', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId || req.auth.companyId;
    const rows = db.prepare('SELECT contactId, short_summary, contact_temperature, conversion_score, interest_level, last_interaction_type, last_interaction_at, recommended_next_action, pipeline_stage, last_ai_update FROM contact_ai_memory WHERE companyId = ? ORDER BY last_ai_update DESC LIMIT 100').all(companyId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SCRIPT GENERATOR ───────────────────────

// POST /api/ai-copilot/generate-script
router.post('/generate-script', requireAuth, async (req, res) => {
  try {
    const { role, objective, target, customPrompt } = req.body;
    const result = await generateScript(role, objective, target, customPrompt);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STATS ──────────────────────────────────

// GET /api/ai-copilot/stats?companyId=...&collaboratorId=
router.get('/stats', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId, collaboratorId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    let whereClause = 'companyId = ?';
    const params = [companyId];
    if (collaboratorId) { whereClause += ' AND collaboratorId = ?'; params.push(collaboratorId); }

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM ai_copilot_analyses WHERE ${whereClause}`).get(...params)?.cnt || 0;
    const avgScores = db.prepare(`SELECT AVG(sentimentScore) as avgSentiment, AVG(qualityScore) as avgQuality, AVG(conversionScore) as avgConversion FROM ai_copilot_analyses WHERE ${whereClause}`).get(...params);

    // Recent trend (14 days)
    const trendStart = new Date();
    trendStart.setDate(trendStart.getDate() - 14);
    const trend = db.prepare(
      `SELECT date(createdAt) as day, COUNT(*) as cnt, AVG(conversionScore) as avgConv, AVG(qualityScore) as avgQual
       FROM ai_copilot_analyses WHERE ${whereClause} AND date(createdAt) >= ?
       GROUP BY date(createdAt) ORDER BY day`
    ).all(...params, trendStart.toISOString().split('T')[0]);

    // Total objections detected
    const allObjections = db.prepare(`SELECT objections_json FROM ai_copilot_analyses WHERE ${whereClause}`).all(...params);
    let totalObjections = 0;
    for (const a of allObjections) {
      try { totalObjections += JSON.parse(a.objections_json || '[]').length; } catch {}
    }

    // Follow-up breakdown
    const followups = db.prepare(
      `SELECT followupType, COUNT(*) as cnt FROM ai_copilot_analyses WHERE ${whereClause} AND followupType != '' GROUP BY followupType ORDER BY cnt DESC`
    ).all(...params);

    // Top performing (highest conversion)
    const topCalls = db.prepare(
      `SELECT id, conversionScore, qualityScore, summary, createdAt FROM ai_copilot_analyses WHERE ${whereClause} ORDER BY conversionScore DESC LIMIT 5`
    ).all(...params);

    res.json({
      totalAnalyzed: total,
      avgSentiment: Math.round(avgScores?.avgSentiment || 0),
      avgQuality: Math.round(avgScores?.avgQuality || 0),
      avgConversion: Math.round(avgScores?.avgConversion || 0),
      totalObjections,
      trend,
      followups,
      topCalls,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── COACHING ───────────────────────────────

// GET /api/ai-copilot/coaching/:collaboratorId
router.get('/coaching/:collaboratorId', requireAuth, (req, res) => {
  try {
    if (!req.auth.isSupra) {
      const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(req.params.collaboratorId);
      if (!collab || collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    }
    const result = getCoachingInsights(req.params.collaboratorId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── OBJECTION DATABASE ─────────────────────

// GET /api/ai-copilot/objections?companyId=...
router.get('/objections', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const result = getObjectionDatabase(companyId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CRM AUTO-FILL ──────────────────────────

// POST /api/ai-copilot/crm-autofill/:analysisId
router.post('/crm-autofill/:analysisId', requireAuth, (req, res) => {
  try {
    if (!req.auth.isSupra) {
      const analysis = db.prepare('SELECT companyId FROM ai_copilot_analyses WHERE id = ?').get(req.params.analysisId);
      if (!analysis || analysis.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    }
    const result = crmAutoFill(req.params.analysisId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LIVE COACHING (Mode Pilote) ──────────────

// POST /api/ai-copilot/live-coaching — Pre-call coaching for active calls
router.post('/live-coaching', requireAuth, enforceCompany, async (req, res) => {
  try {
    const { collaboratorId, contactId } = req.body;
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId required' });
    const safeCompanyId = req.auth.isSupra ? (req.body.companyId || req.auth.companyId) : req.auth.companyId;
    const result = await getLiveCoaching(collaboratorId, contactId || null, safeCompanyId);
    res.json(result);
  } catch (err) {
    console.error('[LIVE COACHING ROUTE ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── AI PROFILE SETUP CONVERSATION ──────────
// Conversational AI that asks smart questions to configure the Copilot profile

router.post('/setup-chat', requireAuth, enforceCompany, async (req, res) => {
  try {
    const { messages, step, baseProfile } = req.body;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return res.json({ error: 'No API key' });

    // Load KB if available — forcé à la company du user
    const safeCompanyId = req.auth.isSupra ? (baseProfile?.companyId || req.auth.companyId) : req.auth.companyId;
    let kbContext = '';
    if (safeCompanyId) {
      const kb = db.prepare('SELECT company_description, company_activity, target_audience, tone_style FROM company_knowledge_base WHERE companyId = ?').get(safeCompanyId);
      if (kb) {
        kbContext = `\nContexte entreprise : ${kb.company_description || ''} — Activité : ${kb.company_activity || ''} — Cible : ${kb.target_audience || ''} — Ton : ${kb.tone_style || ''}`;
      }
    }

    const systemPrompt = `Tu es un expert en configuration d'assistants IA pour la téléphonie professionnelle. Tu aides à configurer un "AI Copilot" pour un collaborateur dans n'importe quel domaine d'activité (commerce, santé, immobilier, formation, tech, juridique, finance, etc.).

TON RÔLE : Poser des questions intelligentes, une par une, pour comprendre précisément le métier du collaborateur et configurer son assistant IA de manière optimale pour SON domaine d'activité.

INFORMATIONS DÉJÀ CONNUES :
${baseProfile ? `- Niveau Copilot : ${baseProfile.ai_copilot_level || 'non défini'}
- Rôle prédéfini : ${baseProfile.ai_copilot_role || 'non défini'}
- Type de poste : ${baseProfile.ai_role_type || 'non défini'}
- Service : ${baseProfile.ai_service_type || 'non défini'}` : 'Aucune info de base.'}
${kbContext}

ÉTAPES DE LA CONVERSATION :
1. Demander ce que fait ce collaborateur au quotidien (sa mission)
2. Demander l'objectif principal de ses appels
3. Demander qui sont ses clients types (profil, secteur, besoins)
4. Demander les objections fréquentes qu'il rencontre
5. Demander le ton et style de communication souhaité
6. Demander s'il a une trame d'appel / script à suivre
7. Demander s'il y a des informations spécifiques à ne jamais oublier
8. QUAND TU AS ASSEZ D'INFOS → Générer le profil complet en JSON

RÈGLES :
- Pose UNE SEULE question à la fois
- Sois conversationnel, naturel, encourageant
- Reformule ce que l'utilisateur dit pour montrer que tu comprends
- Adapte tes questions selon les réponses précédentes
- Ne pose pas de question si la réponse est déjà évidente
- Quand tu as assez d'infos (après 4-7 échanges), propose le profil final

QUAND TU GÉNÈRES LE PROFIL FINAL :
Réponds avec un JSON dans un bloc \`\`\`json\`\`\` contenant :
{
  "ready": true,
  "profile": {
    "ai_main_mission": "...",
    "ai_copilot_objective": "...",
    "ai_copilot_target": "...",
    "ai_call_type_default": "sales|qualification|support|sav|closing|onboarding|follow_up|information",
    "ai_call_goal_default": "sell_product|sell_service|sell_training|book_meeting|qualify_lead|help_client|solve_problem|send_quote|follow_up",
    "ai_target_default": "prospect|client|pro|particulier|entreprise|premium|partner",
    "ai_tone_style": "commercial|neutre|formel|amical|premium|technique|persuasif",
    "ai_script_trame": "1. ACCROCHE\\n2. DÉCOUVERTE\\n...",
    "ai_objections": ["objection 1", "objection 2"],
    "ai_objection_responses": ["réponse 1", "réponse 2"],
    "ai_key_arguments": ["argument 1", "argument 2"],
    "ai_forbidden_phrases": ["phrase interdite 1"],
    "ai_summary": "Résumé complet du profil en 3-4 phrases pour que l'admin valide"
  }
}

Si tu n'as PAS encore assez d'infos, réponds simplement avec ta prochaine question (texte normal, pas de JSON).`;

    const gptMessages = [
      { role: 'system', content: systemPrompt },
      ...(messages || [])
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: gptMessages, temperature: 0.7, max_tokens: 1500 })
    });

    if (!response.ok) {
      const errData = await response.text();
      return res.status(500).json({ error: `GPT error: ${response.status}`, detail: errData });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    // Check if reply contains the final JSON profile
    const jsonMatch = reply.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const profile = JSON.parse(jsonMatch[1]);
        return res.json({ reply: reply.replace(/```json[\s\S]*```/, '').trim(), profile: profile.profile || profile, ready: true });
      } catch {}
    }

    res.json({ reply, ready: false });
  } catch (err) {
    console.error('[AI SETUP CHAT]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DAILY CHAT — Assistant IA interactif onglet Aujourd'hui ──────────────────────────

router.post('/daily-chat', requireAuth, enforceCompany, async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Message requis' });

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return res.json({ reply: "L'assistant IA n'est pas encore configure. Contactez votre administrateur.", suggestedActions: [] });

    const companyId = req.auth.companyId;
    const collaboratorId = req.auth.collaboratorId;
    const todayISO = new Date().toISOString().split('T')[0];

    // 1. Profil collaborateur
    const collab = db.prepare('SELECT name, ai_copilot_role, ai_copilot_objective, ai_main_mission, ai_tone_style, ai_copilot_target FROM collaborators WHERE id = ? AND companyId = ?').get(collaboratorId, companyId);
    const collabName = collab?.name || 'Collaborateur';

    // 2. Bookings aujourd'hui
    const todayBookings = db.prepare(`SELECT b.time, b.duration, b.status, b.visitorName, b.visitorPhone, c.name AS contactName
      FROM bookings b LEFT JOIN contacts c ON c.id = b.contactId
      WHERE b.date = ? AND b.collaboratorId = ? AND b.companyId = ? ORDER BY b.time`).all(todayISO, collaboratorId, companyId);

    // 3. Pipeline summary — avec labels lisibles
    const pipelineSummary = db.prepare(`SELECT pipeline_stage AS stage, COUNT(*) AS cnt FROM contacts WHERE assignedTo = ? AND companyId = ? GROUP BY pipeline_stage ORDER BY cnt DESC`).all(collaboratorId, companyId);
    // Charger les noms des stages custom pour les traduire en labels lisibles
    const pipelineStagesDB = db.prepare('SELECT id, label FROM pipeline_stages WHERE companyId = ?').all(companyId);
    const defaultLabels = {nouveau:'Nouveau',contacte:'Contacte',qualifie:'Qualifie',rdv_programme:'RDV Programme',client_valide:'Client Valide',perdu:'Perdu',nrp:'NRP',en_discussion:'En discussion',interesse:'Interesse'};
    const stageLabel = (id) => { const custom = pipelineStagesDB.find(s=>s.id===id); return custom?.label || defaultLabels[id] || id; };

    // 4. NRP à relancer (enrichi)
    const nrpList = db.prepare(`SELECT id, name, phone, mobile, email, company, notes, nrp_next_relance, nrp_followups_json, createdAt, lastVisit, source FROM contacts WHERE assignedTo = ? AND companyId = ? AND pipeline_stage = 'nrp' AND nrp_next_relance <= ? LIMIT 10`).all(collaboratorId, companyId, todayISO);

    // 5. Contacts récents/chauds (enrichi)
    const hotContacts = db.prepare(`SELECT id, name, phone, mobile, pipeline_stage, email, company, notes, lastVisit, createdAt, source, contact_type, tags_json FROM contacts WHERE assignedTo = ? AND companyId = ? AND pipeline_stage NOT IN ('perdu','client_valide') ORDER BY lastVisit DESC LIMIT 15`).all(collaboratorId, companyId);

    // 5b. Contacts inactifs (pas d'activité depuis 14j+)
    const inactiveContacts = db.prepare(`SELECT id, name, phone, mobile, pipeline_stage, lastVisit, createdAt, notes FROM contacts WHERE assignedTo = ? AND companyId = ? AND pipeline_stage NOT IN ('perdu','client_valide') AND (lastVisit IS NOT NULL AND lastVisit < datetime('now','-14 days') OR (lastVisit IS NULL AND createdAt < datetime('now','-14 days'))) LIMIT 10`).all(collaboratorId, companyId);

    // 5c. Nouveaux leads (jamais contactés)
    const newLeads = db.prepare(`SELECT id, name, phone, mobile, email, company, createdAt, source, notes FROM contacts WHERE assignedTo = ? AND companyId = ? AND pipeline_stage = 'nouveau' AND (lastVisit IS NULL OR lastVisit = '') LIMIT 10`).all(collaboratorId, companyId);

    // 6. Appels du jour
    const todayCalls = db.prepare(`SELECT cl.direction, cl.duration, cl.status, cl.toNumber, cl.fromNumber, c.name AS contactName
      FROM call_logs cl LEFT JOIN contacts c ON c.id = cl.contactId
      WHERE cl.collaboratorId = ? AND cl.companyId = ? AND cl.createdAt >= ? ORDER BY cl.createdAt DESC LIMIT 20`).all(collaboratorId, companyId, todayISO + 'T00:00:00');

    // 7. Knowledge base
    let kbContext = '';
    const kb = db.prepare('SELECT company_description, company_activity, target_audience, tone_style FROM company_knowledge_base WHERE companyId = ?').get(companyId);
    if (kb) kbContext = `Entreprise : ${kb.company_description || ''} — Activite : ${kb.company_activity || ''} — Cible : ${kb.target_audience || ''} — Ton : ${kb.tone_style || ''}`;

    // 8. Produits
    const products = db.prepare('SELECT name, type, description, pricing FROM company_products WHERE companyId = ? LIMIT 15').all(companyId);

    // Build context string
    const pipeStr = pipelineSummary.map(p => `${stageLabel(p.stage)}: ${p.cnt}`).join(', ');
    const bookStr = todayBookings.length > 0 ? todayBookings.map(b => `${b.time||'?'} - ${b.contactName||b.visitorName||'Visiteur'} (${b.duration}min, ${b.status})`).join('\n') : 'Aucun RDV aujourd\'hui';
    const daysSince = (d) => { if(!d) return '?'; const diff=Math.floor((Date.now()-new Date(d).getTime())/86400000); return diff; };
    const fmtD = (d) => d ? new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}) : '?';
    const nrpAttempts = (json) => { try { return JSON.parse(json||'[]').filter(f=>f.done).length; } catch { return 0; } };

    const nrpStr = nrpList.length > 0 ? nrpList.map(n => `- ${n.name} [id:${n.id}] | tel:${n.phone||n.mobile||'?'} | email:${n.email||'?'} | entreprise:${n.company||'?'} | cree le ${fmtD(n.createdAt)} | derniere activite: ${fmtD(n.lastVisit)} (${daysSince(n.lastVisit)}j) | ${nrpAttempts(n.nrp_followups_json)} tentatives NRP | relance prevue ${n.nrp_next_relance} | source:${n.source||'?'} | notes:${(n.notes||'').substring(0,100)||'aucune'}`).join('\n') : 'Aucun NRP a relancer';

    const hotStr = hotContacts.length > 0 ? hotContacts.map(c => `- ${c.name} [id:${c.id}] | stage:${stageLabel(c.pipeline_stage)} | tel:${c.phone||c.mobile||'?'} | email:${c.email||'?'} | entreprise:${c.company||'?'} | type:${c.contact_type||'?'} | cree le ${fmtD(c.createdAt)} | derniere activite: ${fmtD(c.lastVisit)} (${daysSince(c.lastVisit)}j sans contact) | source:${c.source||'?'} | notes:${(c.notes||'').substring(0,100)||'aucune'}`).join('\n') : 'Aucun contact recent';

    const inactiveStr = inactiveContacts.length > 0 ? inactiveContacts.map(c => `- ${c.name} [id:${c.id}] | stage:${stageLabel(c.pipeline_stage)} | tel:${c.phone||c.mobile||'?'} | cree le ${fmtD(c.createdAt)} | INACTIF depuis ${daysSince(c.lastVisit||c.createdAt)}j | notes:${(c.notes||'').substring(0,80)||'aucune'}`).join('\n') : 'Aucun contact inactif';

    const newLeadsStr = newLeads.length > 0 ? newLeads.map(c => `- ${c.name} [id:${c.id}] | tel:${c.phone||c.mobile||'?'} | email:${c.email||'?'} | entreprise:${c.company||'?'} | cree le ${fmtD(c.createdAt)} (${daysSince(c.createdAt)}j) | source:${c.source||'?'} | notes:${(c.notes||'').substring(0,80)||'aucune'} | JAMAIS CONTACTE`).join('\n') : 'Aucun nouveau lead';
    const callStr = todayCalls.length > 0 ? `${todayCalls.length} appels aujourd'hui (${todayCalls.filter(c=>c.direction==='outbound').length} sortants, ${todayCalls.filter(c=>c.direction==='inbound').length} entrants)` : 'Aucun appel aujourd\'hui';
    const prodStr = products.length > 0 ? products.map(p => `- ${p.name} (${p.type||''}, ${p.pricing||''})`).join('\n') : '';

    const systemPrompt = `Tu es l'assistant IA personnel de ${collabName} sur la plateforme Calendar360. Tu es son copilote commercial intelligent. Tu connais ses contacts, son pipeline, ses RDV, ses appels — tu es son bras droit.

DATE : ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
HEURE : ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}

PROFIL COLLABORATEUR :
- Nom : ${collabName}
- Role : ${collab?.ai_copilot_role || 'non defini'}
- Mission : ${collab?.ai_main_mission || 'non defini'}
- Objectif : ${collab?.ai_copilot_objective || 'non defini'}
- Cible : ${collab?.ai_copilot_target || 'non defini'}
- Ton : ${collab?.ai_tone_style || 'professionnel'}

PIPELINE ACTUEL : ${pipeStr || 'vide'}

RDV AUJOURD'HUI :
${bookStr}

NRP A RELANCER (contacts en attente de rappel) :
${nrpStr}

CONTACTS RECENTS / ACTIFS :
${hotStr}

CONTACTS INACTIFS (14j+ sans action) :
${inactiveStr}

NOUVEAUX LEADS (jamais contactes) :
${newLeadsStr}

APPELS DU JOUR : ${callStr}

${kbContext ? 'ENTREPRISE :\n' + kbContext : ''}
${prodStr ? '\nPRODUITS :\n' + prodStr : ''}

REGLES ABSOLUES :
1. Reponds TOUJOURS en JSON valide : {"reply": "ton message", "suggestedActions": [...]}
2. Ne mentionne JAMAIS le format JSON ni les IDs techniques — parle naturellement
3. Repondre dans la langue du collaborateur

REGLES DE CONTEXTE — TRES IMPORTANT :
4. Quand tu mentionnes un contact, TOUJOURS donner le contexte complet :
   - Date de creation ("cree le 15 mars")
   - Derniere activite ("derniere interaction il y a 8 jours")
   - Nombre de jours sans contact ("pas de nouvelles depuis 12j")
   - Stage pipeline actuel
   - Notes existantes si pertinentes
   - Source d'acquisition si connue
   Exemple : "Romain Sitbon est dans votre pipeline NRP depuis 3 tentatives. Cree le 2 avril, derniere activite il y a 5 jours. Aucune note enregistree — voulez-vous que je vous prepare une approche ?"

5. Quand tu donnes un conseil, TOUJOURS poser une question de suivi pour mieux comprendre la situation :
   - "Comment s'est passe votre dernier echange avec ce contact ?"
   - "Quel est le principal frein avec ce prospect ?"
   - "Souhaitez-vous que j'enrichisse la fiche avec ces informations ?"
   - "Quel produit/service l'interesse ?"
   Cela permet d'enrichir la base de connaissances sur chaque contact.

6. Quand tu proposes un plan d'action, structure-le clairement :
   - Priorite 1 (URGENT) : RDV passes, NRP a relancer aujourd'hui
   - Priorite 2 (IMPORTANT) : Contacts chauds sans action recente, leads jamais contactes
   - Priorite 3 (OPTIMISATION) : Contacts inactifs a relancer, pipeline a nettoyer
   Pour chaque contact mentionne : nom, anciennete, derniere activite, raison de l'action.

7. Si des informations manquent sur un contact (pas de notes, pas d'email, source inconnue), signale-le :
   "Je remarque que la fiche de [Contact] est incomplete : pas de notes, source inconnue. Voulez-vous que je vous aide a la completer ?"

ACTIONS SUGGEREES :
8. suggestedActions = tableau d'actions cliquables en un clic
9. Chaque action : {"type": "call|sms|fiche|rdv|qualifier", "label": "Texte du bouton", "contactId": "id si connu", "phone": "numero si connu", "name": "nom du contact"}
10. Types : call=appeler, sms=ouvrir SMS, fiche=voir CRM, rdv=planifier, qualifier=qualifier un RDV passe
11. Prioriser : RDV passes > NRP > contacts chauds > inactifs > nouveaux leads
12. Maximum 4 actions suggerees par message
13. Si on demande un SMS, propose le contenu du message + un bouton sms
14. Sois proactif, chaleureux, professionnel, avec des emojis en parcimonie`;

    // Truncate history to 20 messages
    const safeHistory = Array.isArray(history) ? history.slice(-20) : [];
    const gptMessages = [
      { role: 'system', content: systemPrompt },
      ...safeHistory,
      { role: 'user', content: message }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: gptMessages, temperature: 0.7, max_tokens: 1500, response_format: { type: 'json_object' } })
    });

    if (!response.ok) {
      console.error(`[AI DAILY CHAT] GPT error ${response.status}`);
      return res.json({ reply: "Je suis temporairement indisponible. Reessayez dans quelques instants.", suggestedActions: [] });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { reply: raw, suggestedActions: [] };
    }

    // Validate contactIds in suggestedActions against company
    if (parsed.suggestedActions && Array.isArray(parsed.suggestedActions)) {
      parsed.suggestedActions = parsed.suggestedActions.filter(a => {
        if (!a.contactId) return true;
        const ct = db.prepare('SELECT id FROM contacts WHERE id = ? AND companyId = ?').get(a.contactId, companyId);
        return !!ct;
      }).slice(0, 5);
    }

    res.json({ reply: parsed.reply || '', suggestedActions: parsed.suggestedActions || [] });
  } catch (err) {
    console.error('[AI DAILY CHAT ERROR]', err.message);
    res.json({ reply: "Une erreur est survenue. Reessayez.", suggestedActions: [] });
  }
});

// ─── PROFILE HISTORY ──────────────────────────

// GET /api/ai-copilot/profile-history/:collaboratorId — List profile history
router.get('/profile-history/:collaboratorId', requireAuth, (req, res) => {
  try {
    const { collaboratorId } = req.params;
    if (!req.auth.isSupra) {
      const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
      if (!collab || collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    }
    const { limit = '50', offset = '0' } = req.query;
    const rows = db.prepare('SELECT * FROM ai_profile_history WHERE collaboratorId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?')
      .all(collaboratorId, parseInt(limit), parseInt(offset));
    const parsed = rows.map(r => parseRow('ai_profile_history', r));
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai-copilot/profile-history/:id/restore — Restore a profile snapshot
router.post('/profile-history/:id/restore', requireAuth, requireAdmin, (req, res) => {
  try {
    const historyEntry = db.prepare('SELECT * FROM ai_profile_history WHERE id = ?').get(req.params.id);
    if (!historyEntry) return res.status(404).json({ error: 'History entry not found' });
    if (!req.auth.isSupra && historyEntry.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });

    const snapshot = JSON.parse(historyEntry.profile_snapshot_json);
    const collab = db.prepare('SELECT * FROM collaborators WHERE id = ?').get(historyEntry.collaboratorId);
    if (!collab) return res.status(404).json({ error: 'Collaborator not found' });

    // Save current state as history before restoring
    const currentSnapshot = snapshotAiProfile(collab);
    saveProfileHistory(collab.id, collab.companyId, currentSnapshot, req.body.modified_by || 'admin', req.body.modified_by_type || 'admin', `Restauration du profil du ${new Date(historyEntry.createdAt).toLocaleDateString('fr-FR')}`, 'Restauration complète');

    // Apply snapshot to collaborator
    const sets = Object.keys(snapshot).map(k => `${k} = ?`).join(',');
    const values = [...Object.values(snapshot), historyEntry.collaboratorId];
    db.prepare(`UPDATE collaborators SET ${sets} WHERE id = ?`).run(...values);

    res.json({ success: true, restoredProfile: snapshot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ai-copilot/profile-history/:id — Delete a history entry
router.delete('/profile-history/:id', requireAuth, (req, res) => {
  try {
    const entry = db.prepare('SELECT companyId FROM ai_profile_history WHERE id = ?').get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && entry.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    db.prepare('DELETE FROM ai_profile_history WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PROFILE SUGGESTIONS ──────────────────────────

// GET /api/ai-copilot/profile-suggestions/:collaboratorId — List suggestions
router.get('/profile-suggestions/:collaboratorId', requireAuth, (req, res) => {
  try {
    const { collaboratorId } = req.params;
    if (!req.auth.isSupra) {
      const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(collaboratorId);
      if (!collab || collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    }
    const { status = 'pending' } = req.query;
    let sql = 'SELECT * FROM ai_profile_suggestions WHERE collaboratorId = ?';
    const params = [collaboratorId];
    if (status !== 'all') { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY createdAt DESC LIMIT 50';
    const rows = db.prepare(sql).all(...params);
    const parsed = rows.map(r => parseRow('ai_profile_suggestions', r));
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ai-copilot/profile-suggestions/:id/respond — Accept/modify/reject suggestion
router.put('/profile-suggestions/:id/respond', requireAuth, (req, res) => {
  try {
    const { status, collab_response, applied_changes } = req.body; // status: accepted, partial, rejected
    const suggestion = db.prepare('SELECT * FROM ai_profile_suggestions WHERE id = ?').get(req.params.id);
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
    if (!req.auth.isSupra) {
      const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(suggestion.collaboratorId);
      if (!collab || collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    }

    // Update suggestion status
    db.prepare('UPDATE ai_profile_suggestions SET status = ?, collab_response = ?, respondedAt = ? WHERE id = ?')
      .run(status, collab_response || '', new Date().toISOString(), req.params.id);

    // If accepted or partial, apply changes to collaborator profile
    if ((status === 'accepted' || status === 'partial') && applied_changes) {
      const collab = db.prepare('SELECT * FROM collaborators WHERE id = ?').get(suggestion.collaboratorId);
      if (collab) {
        // Save current profile as history
        const currentSnapshot = snapshotAiProfile(collab);
        const suggestions = JSON.parse(suggestion.suggestion_json);
        const summary = suggestions.map(s => `${s.field}: ${s.action}`).join(', ');
        saveProfileHistory(collab.id, collab.companyId, currentSnapshot, suggestion.collaboratorId, 'ai', `Suggestion IA ${status === 'accepted' ? 'acceptée' : 'partiellement acceptée'}`, summary);

        // Apply the changes
        const allowedAiFields = ['ai_copilot_role','ai_copilot_objective','ai_copilot_target','ai_main_mission','ai_call_type_default','ai_call_goal_default','ai_target_default','ai_tone_style','ai_script_trame'];
        const safeChanges = {};
        for (const [k, v] of Object.entries(applied_changes)) {
          if (allowedAiFields.includes(k)) safeChanges[k] = v;
        }
        if (Object.keys(safeChanges).length > 0) {
          const sets = Object.keys(safeChanges).map(k => `${k} = ?`).join(',');
          const values = [...Object.values(safeChanges), suggestion.collaboratorId];
          db.prepare(`UPDATE collaborators SET ${sets} WHERE id = ?`).run(...values);
        }
      }
    }

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── COACHING REACTIONS TRACKING ──────────────────────────

// POST /api/ai-copilot/reactions — Save a coaching reaction
router.post('/reactions', requireAuth, enforceCompany, (req, res) => {
  try {
    const { collaboratorId, callLogId, suggestionText, suggestionCategory, accepted } = req.body;
    const safeCompanyId = req.auth.isSupra ? (req.body.companyId || req.auth.companyId) : req.auth.companyId;
    if (!safeCompanyId || !collaboratorId || !suggestionText) return res.status(400).json({ error: 'Missing fields' });
    const id = 'aicr_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    db.prepare(`INSERT INTO ai_copilot_reactions (id, companyId, collaboratorId, callLogId, suggestionText, suggestionCategory, accepted, timestamp) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, safeCompanyId, collaboratorId, callLogId || '', suggestionText, suggestionCategory || '', accepted ? 1 : 0, new Date().toISOString());
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai-copilot/reactions — Get reactions for a collaborator (or company)
router.get('/reactions', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId, collaboratorId, limit } = req.query;
    let rows;
    if (collaboratorId) {
      rows = db.prepare('SELECT * FROM ai_copilot_reactions WHERE collaboratorId = ? AND companyId = ? ORDER BY timestamp DESC LIMIT ?').all(collaboratorId, companyId, parseInt(limit) || 100);
    } else if (companyId) {
      rows = db.prepare('SELECT * FROM ai_copilot_reactions WHERE companyId = ? ORDER BY timestamp DESC LIMIT ?').all(companyId, parseInt(limit) || 200);
    } else {
      rows = [];
    }
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai-copilot/behavior-audit/:collaboratorId — Behavior audit summary
router.get('/behavior-audit/:collaboratorId', requireAuth, requireAdmin, (req, res) => {
  try {
    const cid = req.params.collaboratorId;
    if (!req.auth.isSupra) {
      const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(cid);
      if (!collab || collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    }
    const total = db.prepare('SELECT COUNT(*) as cnt FROM ai_copilot_reactions WHERE collaboratorId = ?').get(cid)?.cnt || 0;
    const accepted = db.prepare('SELECT COUNT(*) as cnt FROM ai_copilot_reactions WHERE collaboratorId = ? AND accepted = 1').get(cid)?.cnt || 0;
    const rejected = total - accepted;
    const acceptRate = total > 0 ? Math.round(accepted / total * 100) : 0;

    // Category breakdown
    const categories = db.prepare(`
      SELECT suggestionCategory as cat,
             COUNT(*) as total,
             SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) as accepted
      FROM ai_copilot_reactions
      WHERE collaboratorId = ? AND suggestionCategory != ''
      GROUP BY suggestionCategory
      ORDER BY total DESC
    `).all(cid);

    // Recent reactions (last 20)
    const recent = db.prepare('SELECT * FROM ai_copilot_reactions WHERE collaboratorId = ? ORDER BY timestamp DESC LIMIT 20').all(cid);

    // Trend: last 7 days vs previous 7 days
    const now = new Date();
    const week1 = new Date(now - 7*86400000).toISOString();
    const week2 = new Date(now - 14*86400000).toISOString();
    const thisWeek = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN accepted=1 THEN 1 ELSE 0 END) as accepted FROM ai_copilot_reactions WHERE collaboratorId = ? AND timestamp >= ?').get(cid, week1);
    const lastWeek = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN accepted=1 THEN 1 ELSE 0 END) as accepted FROM ai_copilot_reactions WHERE collaboratorId = ? AND timestamp >= ? AND timestamp < ?').get(cid, week2, week1);

    res.json({
      total, accepted, rejected, acceptRate,
      categories: categories.map(c => ({ ...c, acceptRate: c.total > 0 ? Math.round(c.accepted / c.total * 100) : 0 })),
      recent,
      trend: {
        thisWeek: { total: thisWeek?.total || 0, accepted: thisWeek?.accepted || 0 },
        lastWeek: { total: lastWeek?.total || 0, accepted: lastWeek?.accepted || 0 }
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── KNOWLEDGE BASE AI SYNTHESIS ──────────────
// Multi-turn conversation where AI explains what it understood from KB data
// and the company can refine / add information

router.post('/kb-synthesis', requireAuth, enforceCompany, async (req, res) => {
  try {
    const { messages, kbData } = req.body;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return res.json({ reply: "Clé API OpenAI non configurée. Contactez l'administrateur." });

    // Build context from KB data
    let kbContext = '';
    if (kbData) {
      const parts = [];
      if (kbData.company_description) parts.push(`Nom/Description courte : ${kbData.company_description}`);
      if (kbData.company_description_long) parts.push(`Description détaillée : ${kbData.company_description_long}`);
      if (kbData.company_activity) parts.push(`Activité : ${kbData.company_activity}`);
      if (kbData.target_audience) parts.push(`Cible : ${kbData.target_audience}`);
      if (kbData.geographic_zone) parts.push(`Zone géographique : ${kbData.geographic_zone}`);
      if (kbData.tone_style) parts.push(`Ton : ${kbData.tone_style}`);
      if (kbData.formality_level) parts.push(`Formalité : ${kbData.formality_level}`);
      if (kbData.commercial_style) parts.push(`Style commercial : ${kbData.commercial_style}`);
      if (kbData.support_style) parts.push(`Style support : ${kbData.support_style}`);
      if (kbData._offers_text) parts.push(`Offres : ${kbData._offers_text}`);
      if (kbData._faq_text) parts.push(`FAQ : ${kbData._faq_text}`);
      if (kbData._preferred_words_text) parts.push(`Mots préférés : ${kbData._preferred_words_text}`);
      if (kbData._forbidden_words_text) parts.push(`Mots interdits : ${kbData._forbidden_words_text}`);
      if (kbData._processes_text) parts.push(`Procédures : ${kbData._processes_text}`);
      // Also accept raw JSON fields
      try { const o = JSON.parse(kbData.offers_json || '[]'); if (o.length) parts.push(`Offres : ${o.join(', ')}`); } catch {}
      try { const f = JSON.parse(kbData.faq_json || '[]'); if (f.length) parts.push(`FAQ : ${f.map(x=>`Q:${x.q} R:${x.a}`).join(' | ')}`); } catch {}
      try { const w = JSON.parse(kbData.preferred_words_json || '[]'); if (w.length) parts.push(`Mots préférés : ${w.join(', ')}`); } catch {}
      try { const w = JSON.parse(kbData.forbidden_words_json || '[]'); if (w.length) parts.push(`Mots interdits : ${w.join(', ')}`); } catch {}
      try { const p = JSON.parse(kbData.internal_processes_json || '[]'); if (p.length) parts.push(`Procédures : ${p.map(x=>`${x.title}: ${x.content}`).join(' | ')}`); } catch {}
      kbContext = parts.join('\n');
    }

    // Products, scripts, templates context — forcé à la company du user
    const safeKbCompanyId = req.auth.isSupra ? (kbData?.companyId || req.auth.companyId) : req.auth.companyId;
    let extraContext = '';
    if (safeKbCompanyId) {
      try {
        const products = db.prepare('SELECT name, type, description, pricing FROM company_products WHERE companyId = ?').all(safeKbCompanyId);
        if (products.length) extraContext += '\n\nPRODUITS/SERVICES :\n' + products.map(p => `- ${p.name} (${p.type}) : ${p.description} — ${p.pricing}`).join('\n');
        const scripts = db.prepare('SELECT title, script_type, content FROM company_scripts WHERE companyId = ?').all(safeKbCompanyId);
        if (scripts.length) extraContext += '\n\nSCRIPTS :\n' + scripts.map(s => `- [${s.script_type}] ${s.title}`).join('\n');
      } catch {}
    }

    const systemPrompt = `Tu es l'assistant IA de la plateforme Calendar360/Planora. Ton rôle est d'analyser la Base de Connaissance de l'entreprise et d'expliquer clairement ce que tu as compris.

DONNÉES DE LA BASE DE CONNAISSANCE :
${kbContext || '(Aucune donnée renseignée pour le moment)'}
${extraContext}

TON COMPORTEMENT :
1. À chaque message, fais une SYNTHÈSE claire de ce que tu as compris de l'entreprise
2. Explique ce que chaque information va permettre au système :
   - Description → personnaliser les emails, SMS et scripts automatiques
   - Cible → adapter le ton et les arguments commerciaux
   - Offres → proposer les bons produits dans les scripts de vente
   - FAQ → répondre automatiquement aux questions fréquentes
   - Ton/Style → adapter la communication à l'image de l'entreprise
   - Procédures → guider les collaborateurs pendant les appels
   - Mots préférés/interdits → filtrer le langage du Copilot IA
3. Identifie les LACUNES : ce qui manque et pourquoi ce serait utile
4. Propose des suggestions concrètes pour enrichir la base
5. Si l'utilisateur ajoute des infos, confirme que tu les as bien intégrées

STYLE : Professionnel mais accessible, utilise des emojis modérément, structure avec des puces.
LANGUE : Français.`;

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...(messages || []).map(m => ({ role: m.role, content: m.content }))
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: chatMessages,
      max_tokens: 1500,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || "Désolé, je n'ai pas pu analyser les données.";
    res.json({ reply });
  } catch (err) {
    console.error('[KB SYNTHESIS ERROR]', err.message);
    res.status(500).json({ reply: `Erreur : ${err.message}` });
  }
});

export default router;
