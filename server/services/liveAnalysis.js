/**
 * Live Analysis Service — Calendar360
 * Periodic GPT analysis of live call transcript
 * Generates real-time suggestions, sentiment, trame step detection
 */

import { db } from '../db/database.js';
import { getTranscript, getSession, broadcastToSSE } from './liveTranscription.js';

const GPT_MODEL = 'gpt-4o-mini';
const GPT_URL = 'https://api.openai.com/v1/chat/completions';
const ANALYSIS_INTERVAL_MS = 15000; // 15 seconds

// Track active analysis intervals
const activeAnalyses = new Map();

// Circuit breaker: stop calling GPT after repeated 429 errors
let _gptFailCount = 0;
let _gptPausedUntil = 0;
const GPT_PAUSE_MS = 5 * 60 * 1000; // 5 min pause after 3 consecutive 429s

async function callGPT(systemPrompt, userMessage) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return { success: false, error: 'No API key' };

  // Circuit breaker: skip if paused
  if (Date.now() < _gptPausedUntil) return { success: false, error: 'GPT paused (quota exceeded)' };

  try {
    const res = await fetch(GPT_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GPT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.6,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) {
        _gptFailCount++;
        if (_gptFailCount >= 3) {
          _gptPausedUntil = Date.now() + GPT_PAUSE_MS;
          console.error('\x1b[31m[LIVE ANALYSIS]\x1b[0m GPT quota exceeded — pausing for 5 min');
        }
      }
      throw new Error(`GPT API error: ${res.status}`);
    }
    _gptFailCount = 0; // Reset on success
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return { success: true, data: JSON.parse(content) };
  } catch (err) {
    if (!err.message.includes('429') || _gptFailCount <= 3) console.error('\x1b[31m[LIVE ANALYSIS GPT ERR]\x1b[0m', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Run one analysis cycle for a call
 */
export async function analyzeLive(callSid) {
  const session = getSession(callSid);
  if (!session) return null;

  const transcript = getTranscript(callSid);
  if (!transcript || transcript.segments.length === 0) return null;

  // Load collaborator profile
  const collab = db.prepare(
    'SELECT name, ai_copilot_role, ai_copilot_objective, ai_copilot_target, ai_main_mission, ai_tone_style, ai_script_trame, ai_call_type_default FROM collaborators WHERE id = ?'
  ).get(session.collaboratorId);
  if (!collab) return null;

  // Load contact info if available
  let contactInfo = '';
  if (session.contactId) {
    const contact = db.prepare('SELECT name, email, phone, pipeline_stage, notes FROM contacts WHERE id = ?').get(session.contactId);
    if (contact) contactInfo = `\nCONTACT: ${contact.name} | Stage: ${contact.pipeline_stage || 'nouveau'} | Notes: ${(contact.notes || '').slice(0, 200)}`;
  }

  const systemPrompt = `Tu es le Mode Pilote IA de ${collab.name}, ${collab.ai_copilot_role || 'commercial'}.
Tu analyses une conversation telephonique EN DIRECT et tu guides le collaborateur.

PROFIL:
- Mission: ${collab.ai_main_mission || 'Vendre'}
- Objectif: ${collab.ai_copilot_objective || 'Conclure'}
- Cible: ${collab.ai_copilot_target || 'Prospect'}
- Ton: ${collab.ai_tone_style || 'commercial'}
${collab.ai_script_trame ? `\nTRAME D'APPEL A SUIVRE:\n${collab.ai_script_trame}` : ''}
${contactInfo}

REGLES:
- Analyse le dernier echange et donne une suggestion CONCRETE et COURTE a dire maintenant
- Detecte les objections et propose une reponse adaptee
- Identifie a quelle etape de la trame on se trouve
- Evalue le sentiment du client (pas du collaborateur)
- Propose une action si necessaire (prendre RDV, envoyer devis, etc.)
- Sois bref et actionnable — le collaborateur lit en plein appel

COACHING COMMERCIAL:
- Propose une phrase EXACTE prete a dire au client (pas un conseil, une VRAIE phrase mot pour mot)
- Propose une question ouverte pertinente pour faire avancer la vente
- Si objection detectee: donne la phrase de reponse MOT POUR MOT
- Techniques a utiliser: reformulation, mirroring, urgence douce, social proof, questionnement SPIN, alternative positive
- Adapte au ton: ${collab.ai_tone_style || 'commercial'}

Reponds TOUJOURS en JSON valide.`;

  const userMessage = `CONVERSATION EN COURS (${transcript.duration}s):

${transcript.fullTranscript || 'Pas encore de dialogue'}

Genere un JSON:
{
  "sentiment": "positive|neutral|negative",
  "currentTrameStep": "etape actuelle de la trame ou null",
  "nextSuggestion": "phrase courte a dire maintenant au client",
  "detectedObjection": "objection detectee dans le dernier echange ou null",
  "objectionResponse": "reponse suggeree a l'objection ou null",
  "actionToDo": "action concrete a faire maintenant ou null",
  "keyInsight": "observation cle en 1 phrase sur la conversation",
  "trameProgress": 50,
  "phraseToSay": "phrase EXACTE a dire maintenant au client, prete a l'emploi, naturelle et commerciale",
  "openQuestion": "question ouverte pertinente a poser pour avancer dans la vente",
  "salesTechnique": "technique de vente utilisee: reformulation, SPIN, mirroring, urgence douce, social proof, alternative positive"
}`;

  const result = await callGPT(systemPrompt, userMessage);
  if (!result.success) return null;

  const analysis = result.data;

  // Store in session
  const sessionRef = getSession(callSid);
  if (sessionRef) sessionRef.lastAnalysis = analysis;

  // Broadcast to frontend via SSE
  broadcastToSSE(callSid, 'analysis', analysis);

  // Also broadcast sentiment separately for quick updates
  if (analysis.sentiment) {
    broadcastToSSE(callSid, 'sentiment', { sentiment: analysis.sentiment });
  }

  console.log(`\x1b[32m[LIVE ANALYSIS]\x1b[0m ${callSid} — Sentiment: ${analysis.sentiment}, Step: ${analysis.currentTrameStep || '-'}, Suggestion: ${(analysis.nextSuggestion || '').slice(0, 50)}`);

  return analysis;
}

/**
 * Start periodic analysis for a call (every 15s)
 */
export function startPeriodicAnalysis(callSid) {
  if (activeAnalyses.has(callSid)) return;

  // First analysis after 10s (let some transcript accumulate)
  const firstTimeout = setTimeout(() => {
    analyzeLive(callSid);

    // Then every 15s
    const interval = setInterval(() => {
      const session = getSession(callSid);
      if (!session) {
        clearInterval(interval);
        activeAnalyses.delete(callSid);
        return;
      }
      analyzeLive(callSid);
    }, ANALYSIS_INTERVAL_MS);

    activeAnalyses.set(callSid, interval);
  }, 10000);

  activeAnalyses.set(callSid, firstTimeout);
  console.log(`\x1b[36m[LIVE ANALYSIS]\x1b[0m Periodic analysis started for ${callSid}`);
}

/**
 * Stop periodic analysis for a call
 */
export function stopPeriodicAnalysis(callSid) {
  const ref = activeAnalyses.get(callSid);
  if (ref) {
    clearInterval(ref);
    clearTimeout(ref);
    activeAnalyses.delete(callSid);
    console.log(`\x1b[33m[LIVE ANALYSIS]\x1b[0m Periodic analysis stopped for ${callSid}`);
  }
}
