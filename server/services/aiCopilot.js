/**
 * AI Sales Copilot Service for Calendar360
 * Post-call analysis, script generation, coaching, and objection database
 * Uses OpenAI GPT-4o-mini + Whisper for transcription
 */

import { db } from '../db/database.js';
import { transcribeCall } from './secureIaPhone.js';

const GPT_MODEL = 'gpt-4o-mini';
const GPT_URL = 'https://api.openai.com/v1/chat/completions';

// ─── GPT-4 Helper (with circuit breaker) ───
let _copilotFailCount = 0;
let _copilotPausedUntil = 0;
const COPILOT_PAUSE_MS = 5 * 60 * 1000; // 5 min

async function callGPT(systemPrompt, userMessage, jsonMode = true) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.log('\x1b[33m[AI COPILOT]\x1b[0m No OPENAI_API_KEY — skipping');
    return { success: false, error: 'No API key', demo: true };
  }

  // Circuit breaker: skip if paused
  if (Date.now() < _copilotPausedUntil) return { success: false, error: 'GPT paused (quota exceeded — retry in a few minutes)' };

  try {
    const body = {
      model: GPT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    };
    if (jsonMode) body.response_format = { type: 'json_object' };

    const res = await fetch(GPT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429) {
        _copilotFailCount++;
        if (_copilotFailCount >= 3) {
          _copilotPausedUntil = Date.now() + COPILOT_PAUSE_MS;
          console.error('\x1b[31m[AI COPILOT]\x1b[0m GPT quota exceeded — pausing for 5 min');
        }
      }
      throw new Error(`GPT API error: ${res.status} — ${errText.slice(0, 200)}`);
    }

    _copilotFailCount = 0; // Reset on success
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (jsonMode) {
      try {
        return { success: true, data: JSON.parse(content), tokens: data.usage };
      } catch {
        return { success: true, data: { raw: content }, tokens: data.usage };
      }
    }
    return { success: true, data: content, tokens: data.usage };

  } catch (err) {
    if (!err.message.includes('429') || _copilotFailCount <= 3) console.error('\x1b[31m[AI COPILOT GPT ERR]\x1b[0m', err.message);
    return { success: false, error: err.message };
  }
}

// ─── ANALYZE CALL (Post-call) ───
export async function analyzeCall(callLogId) {
  try {
    // 0. DEDUPLICATION: Skip if already analyzed
    const existingAnalysis = db.prepare('SELECT id FROM ai_copilot_analyses WHERE callLogId = ?').get(callLogId);
    if (existingAnalysis) {
      console.log(`\x1b[33m[AI COPILOT]\x1b[0m Call ${callLogId} already analyzed — skipping (analysis ${existingAnalysis.id})`);
      return { success: true, skipped: true, existingAnalysisId: existingAnalysis.id };
    }

    // 1. Load call log
    const callLog = db.prepare('SELECT * FROM call_logs WHERE id = ?').get(callLogId);
    if (!callLog) return { success: false, error: 'Call log not found' };

    // 2. Load collaborator
    const collab = db.prepare('SELECT * FROM collaborators WHERE id = ?').get(callLog.collaboratorId);
    if (!collab) return { success: false, error: 'Collaborator not found' };

    // 3. Get contact info
    let contact = null;
    if (callLog.contactId) {
      contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(callLog.contactId);
    }
    const contactName = contact?.name || callLog.contactName || '';
    const contactPhone = callLog.direction === 'outbound' ? callLog.toNumber : callLog.fromNumber;

    // 4. Transcribe if recording exists
    let transcription = '';
    if (callLog.recordingUrl) {
      let accountSid = process.env.TWILIO_ACCOUNT_SID;
      let authToken = process.env.TWILIO_AUTH_TOKEN;
      if (!accountSid || !authToken) {
        const vs = db.prepare('SELECT twilioAccountSid, twilioAuthToken FROM voip_settings WHERE companyId = ?').get(callLog.companyId);
        if (vs) { accountSid = vs.twilioAccountSid; authToken = vs.twilioAuthToken; }
      }

      if (accountSid && authToken) {
        // Wait for recording availability
        await new Promise(r => setTimeout(r, 8000));
        const txResult = await transcribeCall(callLog.recordingUrl, accountSid, authToken);
        if (txResult.success) transcription = txResult.transcription;
        else console.log(`\x1b[33m[AI COPILOT]\x1b[0m Transcription failed: ${txResult.error}`);
      }
    }

    if (!transcription) {
      // Even without transcription, we can store basic metadata
      transcription = '[Aucun enregistrement disponible pour cet appel]';
    }

    // 5. Build GPT prompt with collaborator context (v2 — extended profile)
    const role = collab.ai_copilot_role || 'commercial';
    const objective = collab.ai_copilot_objective || 'conclure une vente';
    const target = collab.ai_copilot_target || 'prospect';
    const roleType = collab.ai_role_type || '';
    const serviceType = collab.ai_service_type || '';
    const mainMission = collab.ai_main_mission || '';
    const callTypeDefault = collab.ai_call_type_default || '';
    const callGoalDefault = collab.ai_call_goal_default || '';
    const targetDefault = collab.ai_target_default || '';
    const toneStyle = collab.ai_tone_style || 'commercial';
    const language = collab.ai_language || 'fr';
    const scriptTrame = collab.ai_script_trame || '';
    const copilotLevel = collab.ai_copilot_level || 'normal';

    const langInstr = language === 'fr' ? 'Réponds en français.' : language === 'en' ? 'Answer in English.' : `Réponds en ${language}.`;

    // 5b. Load call context if available
    let callCtx = null;
    try { callCtx = db.prepare('SELECT * FROM call_contexts WHERE callLogId = ?').get(callLog.id); } catch {}

    // 5c. Load company knowledge base
    let kb = null;
    try { kb = db.prepare('SELECT * FROM company_knowledge_base WHERE companyId = ?').get(callLog.companyId); } catch {}

    // 5d. Load company products for context
    let products = [];
    try { products = db.prepare('SELECT name, type, description, pricing FROM company_products WHERE companyId = ? LIMIT 20').all(callLog.companyId); } catch {}

    // Build KB context string
    let kbContext = '';
    if (kb) {
      kbContext = `\nCONTEXTE ENTREPRISE (Knowledge Base):`;
      if (kb.company_description) kbContext += `\n- Entreprise: ${kb.company_description}`;
      if (kb.company_activity) kbContext += `\n- Activité: ${kb.company_activity}`;
      if (kb.company_description_long) kbContext += `\n- Description: ${kb.company_description_long}`;
      if (kb.target_audience) kbContext += `\n- Cible: ${kb.target_audience}`;
      if (kb.tone_style) kbContext += `\n- Ton entreprise: ${kb.tone_style}`;
      if (kb.commercial_style) kbContext += `\n- Style commercial: ${kb.commercial_style}`;
      try {
        const faq = JSON.parse(kb.faq_json || '[]');
        if (faq.length > 0) kbContext += `\n- FAQ: ${faq.slice(0,5).map(f=>`Q:${f.q} R:${f.a}`).join(' | ')}`;
      } catch {}
      try {
        const offers = JSON.parse(kb.offers_json || '[]');
        if (offers.length > 0) kbContext += `\n- Offres: ${offers.join(', ')}`;
      } catch {}
      try {
        const forbidden = JSON.parse(kb.forbidden_words_json || '[]');
        if (forbidden.length > 0) kbContext += `\n- Mots interdits: ${forbidden.join(', ')}`;
      } catch {}
    }
    if (products.length > 0) {
      kbContext += `\nPRODUITS/SERVICES DISPONIBLES: ${products.map(p => `${p.name} (${p.type}) — ${p.pricing || 'tarif non précisé'}: ${(p.description||'').slice(0,100)}`).join(' | ')}`;
    }

    // Build call context string
    let callCtxStr = '';
    if (callCtx) {
      callCtxStr = `\nCONTEXTE D'APPEL SPÉCIFIQUE:
- Provenance: ${callCtx.call_origin}
- Type: ${callCtx.call_type}
- Objectif: ${callCtx.call_goal}
- Cible: ${callCtx.target_type}
${callCtx.campaign_name ? `- Campagne: ${callCtx.campaign_name}` : ''}
${callCtx.lead_source ? `- Source lead: ${callCtx.lead_source}` : ''}
${callCtx.priority_level && callCtx.priority_level !== 'normal' ? `- Priorité: ${callCtx.priority_level}` : ''}
${callCtx.deal_stage ? `- Étape deal: ${callCtx.deal_stage}` : ''}
${callCtx.service_requested ? `- Service demandé: ${callCtx.service_requested}` : ''}
${callCtx.free_note ? `- Note: ${callCtx.free_note}` : ''}`;
    }

    const systemPrompt = `Tu es un coach ${roleType || 'commercial'} expert et un analyste IA. Tu analyses des appels téléphoniques.
Ton rôle est de fournir une analyse complète et actionnable.
${mainMission ? `La mission du collaborateur : ${mainMission}` : ''}
${toneStyle ? `Adopte un ton ${toneStyle}.` : ''}
${langInstr}
${scriptTrame ? `\nTRAME D'APPEL À SUIVRE :\n${scriptTrame}\nÉvalue si le collaborateur a bien suivi cette trame.` : ''}
RÈGLES STRICTES:
- Ne jamais inventer un produit, service ou tarif qui n'existe pas dans la knowledge base.
- Utiliser en priorité: 1) contexte d'appel 2) profil collaborateur 3) knowledge base entreprise.
- Les actions recommandées doivent correspondre à des fonctionnalités réelles (email, SMS, RDV, devis...).
Réponds TOUJOURS en JSON valide avec exactement la structure demandée.`;

    const userMessage = `Analyse cette transcription d'appel téléphonique.

CONTEXTE DU COLLABORATEUR:
- Nom: ${collab.name || 'Non renseigné'}
- Rôle: ${role}${roleType ? ` (${roleType})` : ''}
- Service: ${serviceType || 'Non précisé'}
- Mission: ${mainMission || objective}
- Objectif: ${objective}
- Cible client: ${target}${targetDefault ? ` (type: ${targetDefault})` : ''}
- Type d'appel: ${callCtx?.call_type || callTypeDefault || 'Non précisé'}
- Objectif d'appel: ${callCtx?.call_goal || callGoalDefault || 'Non précisé'}
- Ton attendu: ${kb?.tone_style || toneStyle}
- Direction: ${callLog.direction === 'outbound' ? 'Appel sortant' : 'Appel entrant'}
- Durée: ${callLog.duration || 0} secondes
- Niveau Copilot: ${copilotLevel}
${contactName ? `- Contact: ${contactName}` : ''}
${callCtxStr}${kbContext}

TRANSCRIPTION:
${transcription}

Génère un JSON avec exactement ces champs:
{
  "summary": "Résumé structuré de l'appel (2-4 phrases). Inclure: besoin client, objections, intérêt, décision.",
  "sentimentScore": 50,  // 0-100 : sentiment global du prospect (0=très négatif, 100=très positif)
  "qualityScore": 50,    // 0-100 : qualité de l'appel du commercial
  "conversionScore": 50, // 0-100 : probabilité de conversion
  "objections": [{"objection": "...", "suggestedResponse": "..."}],  // max 5
  "actionItems": ["action 1", "action 2"],  // recommandations concrètes
  "coachingTips": ["conseil 1", "conseil 2"],  // conseils pour le commercial
  "followupType": "email",  // "email" | "sms" | "call" | "offer" | "none"
  "followupDate": "2026-03-18",  // date suggérée (ISO)
  "pipelineStage": "en_cours",   // "nouveau" | "en_cours" | "proposition" | "gagne" | "perdu"
  "tags": ["tag1", "tag2"],  // tags pertinents pour le contact
  "sentiment": "Positif",  // "Très positif" | "Positif" | "Neutre" | "Négatif"
  "besoinExprime": "Besoin principal exprimé par le prospect en 1-2 phrases claires",
  "informationsImportantes": "Informations clés à retenir: budget, deadline, décisionnaire, contraintes, contexte particulier",
  "recommendedActions": [
    {"type": "send_email", "label": "Envoyer email de suivi", "content": "texte email suggéré"},
    {"type": "send_sms", "label": "Envoyer SMS confirmation", "content": "texte SMS suggéré"},
    {"type": "book_meeting", "label": "Planifier un RDV", "content": ""},
    {"type": "send_quote", "label": "Envoyer devis", "content": ""},
    {"type": "schedule_callback", "label": "Programmer relance", "content": ""}
  ]
}
NOTE: Pour recommendedActions, utilise UNIQUEMENT les types suivants: send_email, send_sms, book_meeting, send_quote, send_invoice, send_document, schedule_callback, change_pipeline, create_note, create_task. Ne propose que 2-4 actions pertinentes. Pour send_email et send_sms, génère le contenu complet dans "content".`;

    console.log(`\x1b[36m[AI COPILOT]\x1b[0m Analyzing call ${callLogId} for ${collab.name}...`);

    const gptResult = await callGPT(systemPrompt, userMessage);
    if (!gptResult.success) {
      return { success: false, error: `GPT analysis failed: ${gptResult.error}` };
    }

    const analysis = gptResult.data;

    // 6. Store in database
    const analysisId = 'aic' + Date.now() + Math.random().toString(36).slice(2, 5);
    db.prepare(`INSERT INTO ai_copilot_analyses (id, companyId, collaboratorId, callLogId, contactId, transcription, summary,
      sentimentScore, qualityScore, conversionScore, objections_json, actionItems_json, coachingTips_json,
      followupType, followupDate, pipelineStage, tags_json, crmAutoFilled, extended_json, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).run(
      analysisId,
      callLog.companyId,
      callLog.collaboratorId,
      callLogId,
      callLog.contactId || null,
      transcription,
      analysis.summary || '',
      Math.min(100, Math.max(0, analysis.sentimentScore || 50)),
      Math.min(100, Math.max(0, analysis.qualityScore || 50)),
      Math.min(100, Math.max(0, analysis.conversionScore || 50)),
      JSON.stringify(analysis.objections || []),
      JSON.stringify(analysis.actionItems || []),
      JSON.stringify(analysis.coachingTips || []),
      analysis.followupType || '',
      analysis.followupDate || null,
      analysis.pipelineStage || '',
      JSON.stringify(analysis.tags || []),
      JSON.stringify({ besoinExprime: analysis.besoinExprime || '', informationsImportantes: analysis.informationsImportantes || '' }),
      new Date().toISOString()
    );

    console.log(`\x1b[32m[AI COPILOT]\x1b[0m Analysis stored: ${analysisId} — Conversion: ${analysis.conversionScore}%, Quality: ${analysis.qualityScore}%`);

    // ── Update contact_ai_memory ──
    if (callLog.contactId) {
      try {
        const memId = 'aim_' + callLog.contactId;
        const contact = db.prepare('SELECT pipeline_stage, lastVisit FROM contacts WHERE id = ?').get(callLog.contactId);
        const convScore = Math.min(100, Math.max(0, analysis.conversionScore || 50));
        const sentScore = Math.min(100, Math.max(0, analysis.sentimentScore || 50));
        const qualScore = Math.min(100, Math.max(0, analysis.qualityScore || 50));
        const temp = convScore >= 65 ? 'hot' : convScore >= 35 ? 'warm' : 'cold';
        const interest = sentScore >= 60 ? 'high' : sentScore >= 30 ? 'medium' : 'low';
        const objections = analysis.objections || [];
        const lastObj = objections.length > 0 ? (typeof objections[0] === 'string' ? objections[0] : objections[0].objection || '') : '';
        const promises = (analysis.actionItems || []).filter(a => typeof a === 'string' && (a.includes('envoyer') || a.includes('rappeler') || a.includes('email') || a.includes('SMS')));
        const nextAction = analysis.followupType || '';
        const nextReason = analysis.summary ? analysis.summary.substring(0, 200) : '';
        const ext = analysis.besoinExprime || analysis.informationsImportantes ? JSON.stringify({ besoin: analysis.besoinExprime || '', infos: analysis.informationsImportantes || '' }) : '{}';
        const now = new Date().toISOString();

        db.prepare(`INSERT INTO contact_ai_memory (id, companyId, contactId, short_summary, last_interaction_type, last_interaction_at, interest_level, contact_temperature, conversion_score, engagement_score, responsiveness_score, urgency_score, fatigue_score, opportunity_score, last_objection, objections_json, promises_pending_json, pipeline_stage, recommended_next_action, recommended_action_reason, risk_flags_json, tags_json, last_ai_update, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 'call', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?)
          ON CONFLICT(contactId) DO UPDATE SET
            short_summary = excluded.short_summary,
            last_interaction_type = 'call',
            last_interaction_at = excluded.last_interaction_at,
            interest_level = excluded.interest_level,
            contact_temperature = excluded.contact_temperature,
            conversion_score = excluded.conversion_score,
            engagement_score = CASE WHEN excluded.engagement_score > 0 THEN excluded.engagement_score ELSE contact_ai_memory.engagement_score END,
            responsiveness_score = CASE WHEN excluded.responsiveness_score > 0 THEN excluded.responsiveness_score ELSE contact_ai_memory.responsiveness_score END,
            last_objection = CASE WHEN excluded.last_objection != '' THEN excluded.last_objection ELSE contact_ai_memory.last_objection END,
            objections_json = excluded.objections_json,
            promises_pending_json = excluded.promises_pending_json,
            pipeline_stage = excluded.pipeline_stage,
            recommended_next_action = excluded.recommended_next_action,
            recommended_action_reason = excluded.recommended_action_reason,
            tags_json = excluded.tags_json,
            last_ai_update = excluded.last_ai_update,
            updatedAt = excluded.updatedAt
        `).run(
          memId, callLog.companyId, callLog.contactId,
          analysis.summary || '',
          now, interest, temp,
          convScore, sentScore, qualScore, 0, 0, 0,
          lastObj, JSON.stringify(objections), JSON.stringify(promises),
          contact?.pipeline_stage || 'nouveau',
          nextAction, nextReason,
          JSON.stringify(analysis.tags || []),
          now, now, now
        );
        console.log(`\x1b[35m[AI MEMORY]\x1b[0m Updated memory for contact ${callLog.contactId} — ${temp} (${convScore}%)`);
      } catch (memErr) {
        console.error('[AI MEMORY ERROR]', memErr.message);
      }
    }

    // Auto-detect pipeline change from AI analysis
    if (callLog.contactId && analysis.pipelineStage) {
      try {
        const contact = db.prepare('SELECT pipeline_stage FROM contacts WHERE id = ?').get(callLog.contactId);
        const currentStage = contact?.pipeline_stage || 'nouveau';
        const suggestedStage = analysis.pipelineStage;
        // Map AI stages to valid CRM stages
        const STAGE_MAP = { 'gagne':'client_valide', 'perdu':'perdu', 'proposition':'proposition', 'en_cours':'qualifie', 'nouveau':'nouveau', 'client_valide':'client_valide', 'qualifie':'qualifie', 'contacte':'contacte', 'nrp':'nrp' };
        const mappedStage = STAGE_MAP[suggestedStage] || suggestedStage;
        if (mappedStage && mappedStage !== currentStage) {
          const actId = 'act_' + Date.now() + Math.random().toString(36).slice(2, 5);
          db.prepare('INSERT INTO recommended_actions (id, companyId, collaboratorId, callLogId, conversationId, contactId, action_type, action_label, action_payload_json, status, generated_content, source, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .run(actId, callLog.companyId, callLog.collaboratorId, callLogId, null, callLog.contactId, 'change_pipeline', 'Pipeline: ' + currentStage + ' → ' + mappedStage, JSON.stringify({ from: currentStage, to: mappedStage, reason: analysis.summary || '' }), 'pending', mappedStage, 'ai_auto', new Date().toISOString());
          console.log('[AI COPILOT] Auto-detected pipeline change:', currentStage, '→', mappedStage, 'for contact', callLog.contactId);
        }
      } catch (e) { console.error('[AI COPILOT PIPELINE]', e.message); }
    }


    // 7. Store recommended actions in database
    const recActions = analysis.recommendedActions || [];
    for (const act of recActions) {
      try {
        const actId = 'act_' + Date.now() + Math.random().toString(36).slice(2, 5);
        db.prepare('INSERT INTO recommended_actions (id, companyId, collaboratorId, callLogId, conversationId, contactId, action_type, action_label, action_payload_json, status, generated_content, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
          actId, callLog.companyId, callLog.collaboratorId, callLogId,
          null, callLog.contactId || null,
          act.type || 'create_note', act.label || '', JSON.stringify(act),
          'pending', act.content || '', 'ai'
        );
      } catch (e) { console.error('[AI COPILOT] Action save error:', e.message); }
    }
    if (recActions.length > 0) console.log(`\x1b[32m[AI COPILOT]\x1b[0m ${recActions.length} recommended actions stored`);

    // 8. Generate profile improvement suggestions (async, non-blocking)
    let profileSuggestions = null;
    try {
      profileSuggestions = await generateProfileSuggestions(
        callLog.collaboratorId, callLog.companyId, analysisId, callLogId,
        transcription, analysis, collab
      );
    } catch (e) { console.error('[AI COPILOT] Profile suggestion error (non-blocking):', e.message); }

    // Return full analysis for frontend
    return {
      success: true,
      id: analysisId,
      ...analysis,
      recommendedActions: recActions,
      transcription,
      contactName,
      contactPhone,
      duration: callLog.duration || 0,
      direction: callLog.direction,
      createdAt: new Date().toISOString(),
      profileSuggestions: profileSuggestions?.hasSuggestions ? profileSuggestions : null,
    };

  } catch (err) {
    console.error('\x1b[31m[AI COPILOT ANALYZE ERR]\x1b[0m', err.message);
    return { success: false, error: err.message };
  }
}

// ─── GENERATE SCRIPT ───
export async function generateScript(role, objective, target, customPrompt) {
  const systemPrompt = `Tu es un expert en scripts commerciaux pour le marché français. Tu crées des scripts de vente structurés, naturels et efficaces.
Réponds TOUJOURS en JSON valide.`;

  const description = customPrompt || `Rôle: ${role || 'commercial'}, Objectif: ${objective || 'vendre'}, Cible: ${target || 'prospects'}`;

  const userMessage = `Crée un script commercial complet pour ce contexte:
${description}

Génère un JSON avec exactement cette structure:
{
  "title": "Titre du script (court)",
  "introduction": "Phrase d'accroche d'ouverture (1-2 phrases)",
  "decouverte": ["Question de découverte 1", "Question 2", "Question 3", "Question 4"],
  "argumentaire": ["Argument clé 1 (1-2 phrases)", "Argument 2", "Argument 3"],
  "objections": [
    {"objection": "Objection commune 1", "reponse": "Réponse persuasive"},
    {"objection": "Objection 2", "reponse": "Réponse"},
    {"objection": "Objection 3", "reponse": "Réponse"},
    {"objection": "Objection 4", "reponse": "Réponse"},
    {"objection": "Objection 5", "reponse": "Réponse"}
  ],
  "closing": "Technique de closing (1-2 phrases pour conclure)"
}`;

  console.log(`\x1b[36m[AI COPILOT]\x1b[0m Generating script: ${description.slice(0, 60)}...`);

  const result = await callGPT(systemPrompt, userMessage);
  if (!result.success) return result;

  console.log(`\x1b[32m[AI COPILOT]\x1b[0m Script generated: "${result.data.title}"`);
  return { success: true, script: result.data };
}

// ─── COACHING INSIGHTS ───
export function getCoachingInsights(collaboratorId) {
  try {
    const collab = db.prepare('SELECT name, ai_copilot_role FROM collaborators WHERE id = ?').get(collaboratorId);

    // Get last 20 analyses
    const analyses = db.prepare(
      'SELECT sentimentScore, qualityScore, conversionScore, objections_json, coachingTips_json, createdAt FROM ai_copilot_analyses WHERE collaboratorId = ? ORDER BY createdAt DESC LIMIT 20'
    ).all(collaboratorId);

    if (analyses.length === 0) {
      return { success: true, insights: { totalAnalyzed: 0, tips: ['Passez vos premiers appels pour recevoir du coaching IA personnalisé.'], strengths: [], weaknesses: [] } };
    }

    // Aggregate scores
    const avgSentiment = Math.round(analyses.reduce((s, a) => s + a.sentimentScore, 0) / analyses.length);
    const avgQuality = Math.round(analyses.reduce((s, a) => s + a.qualityScore, 0) / analyses.length);
    const avgConversion = Math.round(analyses.reduce((s, a) => s + a.conversionScore, 0) / analyses.length);

    // Aggregate coaching tips frequency
    const tipMap = {};
    for (const a of analyses) {
      let tips = [];
      try { tips = JSON.parse(a.coachingTips_json || '[]'); } catch {}
      for (const tip of tips) {
        tipMap[tip] = (tipMap[tip] || 0) + 1;
      }
    }
    const topTips = Object.entries(tipMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tip, count]) => ({ tip, count }));

    // Identify strengths/weaknesses
    const strengths = [];
    const weaknesses = [];

    if (avgQuality >= 70) strengths.push('Qualité d\'appel élevée');
    else if (avgQuality < 50) weaknesses.push('Qualité d\'appel à améliorer');

    if (avgSentiment >= 70) strengths.push('Excellent rapport avec les prospects');
    else if (avgSentiment < 40) weaknesses.push('Les prospects semblent peu réceptifs');

    if (avgConversion >= 60) strengths.push('Bon taux de conversion estimé');
    else if (avgConversion < 30) weaknesses.push('Taux de conversion faible');

    // Score trend (last 5 vs previous 5)
    if (analyses.length >= 10) {
      const recent5 = analyses.slice(0, 5);
      const prev5 = analyses.slice(5, 10);
      const recentAvg = recent5.reduce((s, a) => s + a.qualityScore, 0) / 5;
      const prevAvg = prev5.reduce((s, a) => s + a.qualityScore, 0) / 5;
      if (recentAvg > prevAvg + 5) strengths.push('En progression constante 📈');
      else if (recentAvg < prevAvg - 5) weaknesses.push('Performances en baisse récemment 📉');
    }

    return {
      success: true,
      insights: {
        collabName: collab?.name || 'Inconnu',
        role: collab?.ai_copilot_role || '',
        totalAnalyzed: analyses.length,
        avgSentiment,
        avgQuality,
        avgConversion,
        topTips,
        strengths,
        weaknesses,
      },
    };

  } catch (err) {
    console.error('[AI COPILOT COACHING ERR]', err.message);
    return { success: false, error: err.message };
  }
}

// ─── OBJECTION DATABASE ───
export function getObjectionDatabase(companyId) {
  try {
    const analyses = db.prepare(
      'SELECT objections_json FROM ai_copilot_analyses WHERE companyId = ? ORDER BY createdAt DESC LIMIT 100'
    ).all(companyId);

    const objMap = {};
    for (const a of analyses) {
      let objs = [];
      try { objs = JSON.parse(a.objections_json || '[]'); } catch {}
      for (const o of objs) {
        const key = (o.objection || '').toLowerCase().trim();
        if (!key) continue;
        if (!objMap[key]) objMap[key] = { objection: o.objection, responses: [], count: 0 };
        objMap[key].count++;
        if (o.suggestedResponse && objMap[key].responses.length < 3) {
          objMap[key].responses.push(o.suggestedResponse);
        }
      }
    }

    const objections = Object.values(objMap).sort((a, b) => b.count - a.count).slice(0, 20);

    return { success: true, objections, totalAnalyzed: analyses.length };

  } catch (err) {
    console.error('[AI COPILOT OBJECTIONS ERR]', err.message);
    return { success: false, error: err.message };
  }
}

// ─── CRM AUTO-FILL ───
export function crmAutoFill(analysisId) {
  try {
    const analysis = db.prepare('SELECT * FROM ai_copilot_analyses WHERE id = ?').get(analysisId);
    if (!analysis) return { success: false, error: 'Analysis not found' };
    if (!analysis.contactId) return { success: false, error: 'No contact linked to this call' };

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(analysis.contactId);
    if (!contact) return { success: false, error: 'Contact not found' };

    // Build updated notes
    const dateStr = new Date().toISOString().split('T')[0];
    const newNote = `[AI Copilot ${dateStr}] ${analysis.summary || 'Appel analysé'}`;
    const updatedNotes = contact.notes ? `${contact.notes}\n\n${newNote}` : newNote;

    // Parse tags
    let existingTags = [];
    try { existingTags = JSON.parse(contact.tags_json || '[]'); } catch {}
    let analysisTags = [];
    try { analysisTags = JSON.parse(analysis.tags_json || '[]'); } catch {}
    const mergedTags = [...new Set([...existingTags, ...analysisTags])];

    // Update contact — WHITELISTED columns only (prevents SQL injection)
    const ALLOWED_CRM_FIELDS = ['notes', 'tags_json', 'pipeline_stage'];
    const updates = { notes: updatedNotes, tags_json: JSON.stringify(mergedTags) };
    if (analysis.pipelineStage) updates.pipeline_stage = analysis.pipelineStage;

    const safeKeys = Object.keys(updates).filter(k => ALLOWED_CRM_FIELDS.includes(k));
    if (safeKeys.length === 0) return { success: false, error: 'No valid fields to update' };
    const sets = safeKeys.map(k => `${k} = ?`).join(',');
    db.prepare(`UPDATE contacts SET ${sets} WHERE id = ?`).run(...safeKeys.map(k => updates[k]), analysis.contactId);

    // Mark as auto-filled
    db.prepare('UPDATE ai_copilot_analyses SET crmAutoFilled = 1 WHERE id = ?').run(analysisId);

    console.log(`\x1b[32m[AI COPILOT CRM]\x1b[0m Auto-filled contact ${contact.name}: pipeline=${analysis.pipelineStage}, +${analysisTags.length} tags`);

    return { success: true, contactId: analysis.contactId, pipelineStage: analysis.pipelineStage, tagsAdded: analysisTags.length };

  } catch (err) {
    console.error('[AI COPILOT CRM ERR]', err.message);
    return { success: false, error: err.message };
  }
}

// ─── LIVE COACHING (Mode Pilote) ───
export async function getLiveCoaching(collaboratorId, contactId, companyId) {
  try {
    // 1. Load collaborator copilot config (v2 — extended profile)
    const collab = db.prepare('SELECT name, ai_copilot_role, ai_copilot_objective, ai_copilot_target, ai_copilot_level, ai_role_type, ai_service_type, ai_main_mission, ai_call_type_default, ai_call_goal_default, ai_target_default, ai_language, ai_tone_style, ai_script_trame FROM collaborators WHERE id = ?').get(collaboratorId);
    if (!collab) return { success: false, error: 'Collaborator not found' };

    const role = collab.ai_copilot_role || 'commercial';
    const objective = collab.ai_copilot_objective || 'conclure une vente';
    const target = collab.ai_copilot_target || 'prospect';
    const toneStyle = collab.ai_tone_style || 'commercial';
    const scriptTrame = collab.ai_script_trame || '';
    const mainMission = collab.ai_main_mission || '';

    // 2. Load contact if provided
    let contact = null;
    if (contactId) {
      contact = db.prepare('SELECT id, name, email, phone, mobile, pipeline_stage, notes, tags_json FROM contacts WHERE id = ?').get(contactId);
    }

    // 3. Load previous analyses for this contact
    let previousAnalyses = [];
    if (contactId) {
      previousAnalyses = db.prepare(
        'SELECT summary, sentimentScore, qualityScore, conversionScore, objections_json, actionItems_json, pipelineStage, followupType, createdAt FROM ai_copilot_analyses WHERE contactId = ? ORDER BY createdAt DESC LIMIT 5'
      ).all(contactId);
    }

    // 4. Get top company objections
    const objRows = db.prepare(
      'SELECT objections_json FROM ai_copilot_analyses WHERE companyId = ? ORDER BY createdAt DESC LIMIT 50'
    ).all(companyId || 'c1');
    const objMap = {};
    for (const r of objRows) {
      let objs = [];
      try { objs = JSON.parse(r.objections_json || '[]'); } catch {}
      for (const o of objs) {
        const key = (o.objection || '').toLowerCase().trim();
        if (!key) continue;
        if (!objMap[key]) objMap[key] = { objection: o.objection, response: o.suggestedResponse || '', count: 0 };
        objMap[key].count++;
        if (o.suggestedResponse && !objMap[key].response) objMap[key].response = o.suggestedResponse;
      }
    }
    const topObjections = Object.values(objMap).sort((a, b) => b.count - a.count).slice(0, 8);

    // 5. Build GPT prompt
    const systemPrompt = `Tu es un assistant de coaching ${collab.ai_role_type || 'commercial'} en temps réel pour des collaborateurs francophones.
Tu fournis du coaching PRÉ-APPEL et PENDANT L'APPEL sous forme de conseils structurés, suggestions contextuelles, et réponses aux objections.
${mainMission ? `Mission du collaborateur : ${mainMission}` : ''}
${toneStyle ? `Ton style de communication : ${toneStyle}.` : 'Ton ton est direct, professionnel et encourageant.'}
Chaque suggestion doit être actionnable immédiatement pendant un appel téléphonique.
${scriptTrame ? `\nTRAME D'APPEL À SUIVRE (guide le collaborateur étape par étape) :\n${scriptTrame}\n` : ''}
Réponds TOUJOURS en JSON valide avec exactement la structure demandée.`;

    let contactContext = 'APPEL VERS UN NUMÉRO INCONNU (pas de fiche contact — premier contact potentiel)';
    if (contact) {
      let contactTags = [];
      try { contactTags = JSON.parse(contact.tags_json || '[]'); } catch {}
      contactContext = `CONTACT APPELÉ:
- Nom: ${contact.name || 'Non renseigné'}
- Email: ${contact.email || 'Non renseigné'}
- Téléphone: ${contact.phone || contact.mobile || 'Non renseigné'}
- Étape pipeline: ${contact.pipeline_stage || 'nouveau'}
- Notes CRM: ${(contact.notes || '').slice(0, 300)}
- Tags: ${JSON.stringify(contactTags)}`;
    }

    let historyContext = 'AUCUN HISTORIQUE D\'APPEL AVEC CE CONTACT';
    if (previousAnalyses.length > 0) {
      historyContext = `HISTORIQUE DES APPELS PRÉCÉDENTS (${previousAnalyses.length}):
${previousAnalyses.map((a, i) => {
  let objs = [];
  try { objs = JSON.parse(a.objections_json || '[]'); } catch {}
  return `Appel ${i + 1} (${(a.createdAt || '').split('T')[0]}): Sentiment ${a.sentimentScore}%, Qualité ${a.qualityScore}%, Conversion ${a.conversionScore}%. Résumé: ${a.summary || 'N/A'}${objs.length > 0 ? `. Objections: ${objs.map(o => o.objection).join(', ')}` : ''}`;
}).join('\n')}`;
    }

    let objectionContext = '';
    if (topObjections.length > 0) {
      objectionContext = `\nOBJECTIONS FRÉQUENTES DANS L'ENTREPRISE:\n${topObjections.map(o => `- "${o.objection}" (${o.count}x)`).join('\n')}`;
    }

    const userMessage = `Prépare un coaching en temps réel pour cet appel commercial.

PROFIL DU COMMERCIAL:
- Nom: ${collab.name || 'Commercial'}
- Rôle: ${role}
- Objectif principal: ${objective}
- Cible client: ${target}

${contactContext}

${historyContext}
${objectionContext}

Génère un JSON avec EXACTEMENT cette structure:
{
  "briefing": {
    "contactSummary": "Résumé de la relation avec ce contact (1-2 phrases). Si inconnu, dire 'Premier contact — aucun historique'",
    "lastCallHighlight": "Point saillant du dernier appel (1 phrase) ou null si pas d'historique",
    "lastScores": {"sentiment": 0, "quality": 0, "conversion": 0},
    "pipelineStage": "nouveau",
    "keyInsight": "L'insight le plus important à garder en tête pour cet appel"
  },
  "suggestions": [
    {"text": "texte de la suggestion", "category": "opening", "priority": 1}
  ],
  "objectionResponses": [
    {"objection": "texte objection", "response": "réponse suggérée", "frequency": "frequent"}
  ],
  "keyPhrases": [
    {"phrase": "phrase à utiliser", "context": "Quand utiliser cette phrase"}
  ],
  "pointsToCover": [
    {"point": "point à aborder", "priority": "high"}
  ]
}

Règles STRICTES:
- suggestions: exactement 6 à 8 items, category parmi: opening, discovery, objection, closing, relationship. priority: 1=plus important
- objectionResponses: exactement 5 items, les plus probables pour CE contexte (pas génériques)
- keyPhrases: exactement 4 à 6 phrases prêtes à l'emploi
- pointsToCover: exactement 5 à 8 items, priority: "high" ou "medium"
- TOUT en français
- Adapte au rôle "${role}", objectif "${objective}" et cible "${target}" spécifiques
- Si historique existe, personnalise en fonction des appels précédents
- lastScores = scores du DERNIER appel si historique existe, sinon null`;

    console.log(`\x1b[36m[MODE PILOTE]\x1b[0m Generating live coaching for ${collab.name} → ${contact?.name || 'unknown contact'}...`);

    const gptResult = await callGPT(systemPrompt, userMessage);

    if (!gptResult.success) {
      // Return demo/fallback data
      return {
        success: true,
        demo: true,
        coaching: {
          briefing: { contactSummary: contact ? `Contact: ${contact.name}` : 'Premier contact', lastCallHighlight: null, lastScores: null, pipelineStage: contact?.pipeline_stage || 'nouveau', keyInsight: `Objectif: ${objective}` },
          suggestions: [
            { text: 'Commencez par vous présenter et rappeler le contexte', category: 'opening', priority: 1 },
            { text: 'Posez des questions ouvertes sur les besoins', category: 'discovery', priority: 2 },
            { text: 'Identifiez le budget et le calendrier de décision', category: 'discovery', priority: 3 },
            { text: 'Présentez votre valeur ajoutée unique', category: 'closing', priority: 4 },
            { text: 'Écoutez activement avant de proposer', category: 'relationship', priority: 5 },
            { text: 'Proposez un rendez-vous ou une démo', category: 'closing', priority: 6 },
          ],
          objectionResponses: [
            { objection: 'C\'est trop cher', response: 'Je comprends votre préoccupation. Considérez le retour sur investissement...', frequency: 'frequent' },
            { objection: 'Je dois réfléchir', response: 'Bien sûr, quels points aimeriez-vous clarifier pour vous aider dans votre réflexion ?', frequency: 'frequent' },
            { objection: 'Je travaille déjà avec un concurrent', response: 'Intéressant ! Qu\'est-ce qui vous plaît chez eux ? Je peux vous montrer nos avantages différenciants.', frequency: 'occasional' },
            { objection: 'Ce n\'est pas le bon moment', response: 'Je comprends. Quand serait le meilleur moment pour en reparler ?', frequency: 'occasional' },
            { objection: 'Envoyez-moi un email', response: 'Avec plaisir ! Avant cela, 2 minutes pour cibler exactement ce qui vous intéresse ?', frequency: 'frequent' },
          ],
          keyPhrases: [
            { phrase: 'Qu\'est-ce qui est le plus important pour vous dans ce domaine ?', context: 'Phase de découverte' },
            { phrase: 'Si je comprends bien, votre besoin principal est...', context: 'Reformulation' },
            { phrase: 'Beaucoup de nos clients dans votre secteur ont obtenu...', context: 'Preuve sociale' },
            { phrase: 'Qu\'est-ce qui vous empêcherait d\'avancer aujourd\'hui ?', context: 'Identifier les freins' },
          ],
          pointsToCover: [
            { point: 'Se présenter et rappeler le contexte', priority: 'high' },
            { point: 'Identifier le besoin principal du prospect', priority: 'high' },
            { point: 'Présenter la solution adaptée', priority: 'high' },
            { point: 'Répondre aux objections', priority: 'medium' },
            { point: 'Proposer une prochaine étape concrète', priority: 'high' },
            { point: 'Confirmer les coordonnées de suivi', priority: 'medium' },
          ],
        },
        contact: contact ? { name: contact.name, phone: contact.phone || contact.mobile, email: contact.email, pipelineStage: contact.pipeline_stage } : null,
        previousAnalyses: [],
      };
    }

    console.log(`\x1b[32m[MODE PILOTE]\x1b[0m Coaching generated for ${collab.name} ✓`);

    return {
      success: true,
      coaching: gptResult.data,
      contact: contact ? { name: contact.name, phone: contact.phone || contact.mobile, email: contact.email, pipelineStage: contact.pipeline_stage } : null,
      previousAnalyses: previousAnalyses.map(a => ({
        date: a.createdAt,
        sentimentScore: a.sentimentScore,
        qualityScore: a.qualityScore,
        conversionScore: a.conversionScore,
        summary: a.summary,
        pipelineStage: a.pipelineStage,
      })),
      tokens: gptResult.tokens,
    };

  } catch (err) {
    console.error('\x1b[31m[MODE PILOTE ERR]\x1b[0m', err.message);
    return { success: false, error: err.message };
  }
}

// ─── AI PROFILE UTILITIES ───

const AI_PROFILE_FIELDS = [
  'ai_copilot_enabled','ai_copilot_role','ai_copilot_objective','ai_copilot_target',
  'ai_copilot_level','ai_role_type','ai_service_type','ai_main_mission',
  'ai_call_type_default','ai_call_goal_default','ai_target_default',
  'ai_language','ai_tone_style','ai_script_trame'
];

export function snapshotAiProfile(collab) {
  const snapshot = {};
  for (const f of AI_PROFILE_FIELDS) {
    snapshot[f] = collab[f] || '';
  }
  return snapshot;
}

export function saveProfileHistory(collaboratorId, companyId, snapshot, modifiedBy, modifiedByType, reason, changesSummary) {
  const id = 'aph_' + Date.now() + Math.random().toString(36).slice(2, 5);
  db.prepare(`INSERT INTO ai_profile_history (id, collaboratorId, companyId, profile_snapshot_json, modified_by, modified_by_type, reason, changes_summary, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, collaboratorId, companyId, JSON.stringify(snapshot), modifiedBy, modifiedByType, reason || '', changesSummary || '', new Date().toISOString()
  );
  return id;
}

export function getProfileChanges(oldProfile, newData) {
  const changes = [];
  for (const f of AI_PROFILE_FIELDS) {
    const oldVal = (oldProfile[f] || '').toString();
    const newVal = newData[f] !== undefined ? (newData[f] || '').toString() : null;
    if (newVal !== null && newVal !== oldVal) {
      changes.push({ field: f, oldValue: oldVal, newValue: newVal });
    }
  }
  return changes;
}

// ─── GENERATE PROFILE SUGGESTIONS (Post-call) ───
export async function generateProfileSuggestions(collaboratorId, companyId, analysisId, callLogId, transcription, analysis, collabProfile) {
  try {
    const currentProfile = snapshotAiProfile(collabProfile);

    const systemPrompt = `Tu es un expert en optimisation de profils commerciaux IA. Tu analyses un appel qui vient d'être réalisé et tu compares avec le profil actuel du collaborateur.
Ton rôle est d'identifier des améliorations concrètes à apporter au profil IA (trame d'appel, objections, arguments, ton, mission, etc.).

RÈGLES:
- Ne suggère que des améliorations PERTINENTES basées sur l'appel analysé
- Si le profil actuel est déjà bon et rien de nouveau n'a été observé, retourne un tableau vide
- Les suggestions doivent être spécifiques et actionables
- Maximum 3 suggestions par appel
- Privilégie les ajouts/améliorations à la trame d'appel et aux réponses aux objections

Réponds TOUJOURS en JSON valide.`;

    const userMessage = `PROFIL ACTUEL DU COLLABORATEUR:
- Mission: ${currentProfile.ai_main_mission || 'Non définie'}
- Rôle: ${currentProfile.ai_copilot_role || 'Non défini'} (${currentProfile.ai_role_type || ''})
- Objectif: ${currentProfile.ai_copilot_objective || 'Non défini'}
- Cible: ${currentProfile.ai_copilot_target || 'Non définie'}
- Ton: ${currentProfile.ai_tone_style || 'commercial'}
- Trame d'appel: ${currentProfile.ai_script_trame || 'Aucune trame définie'}

RÉSUMÉ DE L'APPEL:
${analysis.summary || ''}

SCORE QUALITÉ: ${analysis.qualityScore || 50}/100
SCORE CONVERSION: ${analysis.conversionScore || 50}/100

OBJECTIONS DÉTECTÉES:
${(analysis.objections || []).map(o => `- ${o.objection}`).join('\n') || 'Aucune'}

CONSEILS COACHING:
${(analysis.coachingTips || []).join('\n') || 'Aucun'}

TRANSCRIPTION (extrait):
${(transcription || '').slice(0, 2000)}

Génère un JSON avec cette structure:
{
  "suggestions": [
    {
      "field": "ai_script_trame",
      "section": "DÉCOUVERTE",
      "action": "add",
      "currentValue": "valeur actuelle du champ (extrait pertinent)",
      "suggestedValue": "nouvelle valeur complète ou ajout proposé",
      "reason": "Explication claire de pourquoi cet ajout est recommandé"
    }
  ],
  "summary": "Résumé en 1 phrase de ce que l'IA propose d'améliorer",
  "hasSuggestions": true
}

Les champs possibles pour "field": ai_script_trame, ai_copilot_objective, ai_copilot_target, ai_main_mission, ai_tone_style
Les actions possibles: "add" (ajouter), "modify" (modifier), "replace" (remplacer)

Si aucune amélioration n'est nécessaire:
{"suggestions": [], "summary": "", "hasSuggestions": false}`;

    const gptResult = await callGPT(systemPrompt, userMessage);
    if (!gptResult.success || !gptResult.data?.hasSuggestions) {
      return { success: true, hasSuggestions: false };
    }

    const result = gptResult.data;
    if (!result.suggestions || result.suggestions.length === 0) {
      return { success: true, hasSuggestions: false };
    }

    // Store in database
    const id = 'aps_' + Date.now() + Math.random().toString(36).slice(2, 5);
    db.prepare(`INSERT INTO ai_profile_suggestions (id, collaboratorId, companyId, analysisId, callLogId, suggestion_json, summary, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).run(
      id, collaboratorId, companyId, analysisId || null, callLogId || null,
      JSON.stringify(result.suggestions), result.summary || '', new Date().toISOString()
    );

    console.log(`\x1b[32m[AI COPILOT]\x1b[0m Profile suggestions generated: ${result.suggestions.length} for ${collaboratorId}`);

    return { success: true, hasSuggestions: true, suggestionId: id, suggestions: result.suggestions, summary: result.summary };
  } catch (err) {
    console.error('\x1b[31m[AI COPILOT SUGGEST ERR]\x1b[0m', err.message);
    return { success: false, error: err.message };
  }
}
