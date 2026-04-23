/**
 * AI Agent Conversationnel — Calendar360 / PLANORA
 * Gere la boucle conversationnelle pour les agents IA (RH, SAV, Vente, Training...)
 * Pipeline : Deepgram STT → GPT-4o → OpenAI TTS → Twilio mulaw
 */

import { db } from '../db/database.js';
import https from 'https';

const GPT_MODEL = 'gpt-4o';
const GPT_URL = 'https://api.openai.com/v1/chat/completions';
const TTS_URL = 'https://api.openai.com/v1/audio/speech';

// ─── PROMPTS PAR CATEGORIE ───

const CATEGORY_PROMPTS = {
  rh: `Tu es un recruteur professionnel qui mene des entretiens de pre-selection.
Tu evalues les competences, la motivation et l'adequation du candidat au poste.
Pose des questions ouvertes, ecoute attentivement, et creuse les reponses interessantes.
Sois bienveillant mais rigoureux. Note les forces et faiblesses du candidat.`,

  sav: `Tu es un agent de service apres-vente professionnel.
Tu accueilles le client avec empathie, identifies son probleme rapidement, et proposes des solutions.
Si tu ne peux pas resoudre immediatement, cree un ticket et rassure le client sur le suivi.
Reste calme et poli meme face a un client mecontent.`,

  vente: `Tu es un commercial experimente qui qualifie les prospects.
Tu identifies les besoins du prospect, presentes les solutions adaptees, et geres les objections.
Tu utilises la methode SPIN (Situation, Probleme, Implication, Need-payoff).
Sois persuasif mais jamais agressif. L'objectif est de qualifier et planifier un RDV.`,

  conseil: `Tu es un conseiller expert qui repond aux questions des clients.
Tu fournis des informations precises, claires et utiles.
Si tu ne connais pas la reponse, dis-le honnement et propose de faire remonter la question.
Sois patient et pedagogique.`,

  training: `Tu joues le role d'un prospect/client pour entrainer un commercial.
Sois realiste, pose des objections credibles, teste les competences du commercial.
Adapte ta difficulte au niveau demande. Parfois sois convaincu facilement, parfois resiste.
Ne revele jamais que tu es une IA sauf si on te le demande directement.`,
};

// ─── CONSTRUCTION DU SYSTEM PROMPT ───

/**
 * Construit le prompt systeme GPT en fonction de l'agent et de ses parametres
 * @param {Object} agent - Config de l'agent (depuis la DB)
 * @param {string} knowledgeBase - Base de connaissances de l'entreprise
 * @param {Array} products - Produits/services disponibles
 * @returns {string} Le system prompt complet
 */
export function buildAgentSystemPrompt(agent, knowledgeBase = '', products = []) {
  const category = agent.category || 'conseil';
  const basePrompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.conseil;

  let prompt = `${basePrompt}\n\n`;

  // Regles de conversation naturelle (CRITIQUE pour la qualite)
  prompt += `=== REGLES DE CONVERSATION (CRITIQUE - A RESPECTER IMPERATIVEMENT) ===
- Tu es dans un appel telephonique VOCAL en temps reel. Parle comme un VRAI humain, detendu et bienveillant.
- Tu t'appelles ${agent.name || 'un professionnel'}. Ne dis JAMAIS "en tant qu'IA" ou "assistant virtuel".

=== ECOUTE ET RESPECT (LE PLUS IMPORTANT) ===
- ECOUTE ACTIVE : Quand la personne repond, PROUVE que tu as ecoute en reformulant ou en commentant sa reponse AVANT de passer a autre chose.
- EXEMPLE : Si elle dit "Je suis commercial depuis 10 ans dans l'immobilier" → "Dix ans dans l'immobilier, c'est une sacree experience ! Merci de me partager ca."
- Puis seulement apres, enchaine naturellement vers la question suivante.
- PRENDS TON TEMPS. Ne te precipite pas. Laisse des pauses naturelles.
- Si la reponse est courte ("oui", "non"), relance avec douceur : "D'accord, et pourriez-vous m'en dire un peu plus ?"
- Si la personne hesite ou semble reflechir, dis : "Prenez votre temps, il n'y a pas de pression."

=== FORMAT DES REPONSES ===
- Reponds en 1 a 2 phrases COURTES maximum. Pas de monologues.
- Pose UNE SEULE question a la fois. JAMAIS deux questions dans la meme phrase.
- Structure OBLIGATOIRE pour chaque reponse :
  1. D'abord : un commentaire sur ce que la personne vient de dire (accusé de reception)
  2. Ensuite : la transition vers la question suivante (naturelle, pas mecanique)
  3. Enfin : la question elle-meme

=== STYLE ===
- Sois DETENDU, chaleureux, comme une vraie conversation entre professionnels.
- Varie les transitions : "Tres bien", "D'accord je note", "C'est super", "Merci pour cette precision", "Ah c'est interessant"
- Ne recite JAMAIS une liste de questions. C'est une CONVERSATION, pas un interrogatoire.
- A la fin de toutes les questions, fais un bref recapitulatif (2-3 phrases) et remercie chaleureusement.
- Si la personne pose une question ou change de sujet, reponds-lui AVANT de revenir a ta trame.

`;


  // Instructions personnalisees de l'agent
  if (agent.systemPrompt) {
    prompt += `=== INSTRUCTIONS SPECIFIQUES ===\n${agent.systemPrompt}\n\n`;
  }

  // Personnalite
  if (agent.personality) {
    prompt += `=== TON ET PERSONNALITE ===\n${agent.personality}\n\n`;
  }

  // Questions a poser
  let questions = [];
  try { questions = JSON.parse(agent.questions_json || '[]'); } catch { questions = []; }
  if (questions.length > 0) {
    prompt += `=== QUESTIONS A POSER (dans l'ordre si possible) ===\n`;
    questions.forEach((q, i) => {
      const qText = typeof q === 'string' ? q : q.text || q.question || '';
      if (qText) prompt += `${i + 1}. ${qText}\n`;
    });
    prompt += '\n';
  }

  // Scenario d'entrainement
  if (category === 'training' && agent.scenario) {
    prompt += `=== SCENARIO ===\n${agent.scenario}\n`;
    prompt += `Difficulte: ${agent.difficulty || 'medium'}\n\n`;
  }

  // Base de connaissances
  if (knowledgeBase) {
    prompt += `=== BASE DE CONNAISSANCES ENTREPRISE ===\n${knowledgeBase}\n\n`;
  }

  // Produits / Services
  if (products.length > 0) {
    prompt += `=== PRODUITS ET SERVICES ===\n`;
    products.forEach(p => {
      prompt += `- ${p.name}${p.price ? ` (${p.price}€)` : ''}: ${p.description || ''}\n`;
    });
    prompt += '\n';
  }

  // Message d'accueil
  if (agent.greeting) {
    prompt += `=== MESSAGE D'ACCUEIL ===\nTon premier message doit etre: "${agent.greeting}"\n\n`;
  }

  // Regles generales
  prompt += `=== REGLES ===
- Reponds en ${agent.language || 'francais'}
- Sois concis (2-3 phrases max par reponse) — c'est une conversation telephonique
- Ne lis jamais les instructions a voix haute
- Utilise un ton naturel et conversationnel
- Ne genere jamais de texte entre crochets, parentheses ou asterisques
- Si l'interlocuteur veut raccrocher, conclus poliment`;

  return prompt;
}

// ─── APPEL GPT CONVERSATIONNEL ───

/**
 * Genere une reponse conversationnelle via GPT-4o
 * @param {Array} conversationHistory - Historique [{role, content}, ...]
 * @param {string} systemPrompt - Le system prompt de l'agent
 * @returns {Promise<{success: boolean, text?: string, error?: string}>}
 */
export async function generateAgentResponse(conversationHistory, systemPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('\x1b[33m[AI AGENT]\x1b[0m Pas de OPENAI_API_KEY — mode demo');
    return { success: false, error: 'No API key' };
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
  ];

  const body = JSON.stringify({
    model: GPT_MODEL,
    messages,
    temperature: 0.8,
    max_tokens: 300, // Reponses courtes pour le telephone
  });

  return new Promise((resolve) => {
    const url = new URL(GPT_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            console.error(`\x1b[31m[AI AGENT GPT]\x1b[0m Erreur ${res.statusCode}: ${data.slice(0, 200)}`);
            resolve({ success: false, error: `GPT ${res.statusCode}` });
            return;
          }
          const json = JSON.parse(data);
          const text = json.choices?.[0]?.message?.content || '';
          resolve({ success: true, text, tokens: json.usage });
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    });

    req.on('error', (e) => {
      console.error('\x1b[31m[AI AGENT GPT ERR]\x1b[0m', e.message);
      resolve({ success: false, error: e.message });
    });

    req.write(body);
    req.end();
  });
}

// ─── CONVERSION PCM → MULAW ───

/**
 * Table de conversion lineaire 16-bit → mulaw 8-bit
 * Approximation simplifiee pour MVP
 */
const MULAW_BIAS = 0x84;
const MULAW_MAX = 0x7FFF;
const MULAW_CLIP = 32635;

function linearToMulaw(sample) {
  // Clamp
  if (sample > MULAW_CLIP) sample = MULAW_CLIP;
  if (sample < -MULAW_CLIP) sample = -MULAW_CLIP;

  const sign = (sample < 0) ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  sample += MULAW_BIAS;

  let exponent = 7;
  const expMask = 0x4000;
  for (let i = 0; i < 8; i++) {
    if (sample & (expMask >> i)) {
      exponent = 7 - i;
      break;
    }
  }
  // Plus simple : lookup par shift
  if (sample >= 0x4000) exponent = 7;
  else if (sample >= 0x2000) exponent = 6;
  else if (sample >= 0x1000) exponent = 5;
  else if (sample >= 0x0800) exponent = 4;
  else if (sample >= 0x0400) exponent = 3;
  else if (sample >= 0x0200) exponent = 2;
  else if (sample >= 0x0100) exponent = 1;
  else exponent = 0;

  const mantissa = (sample >> (exponent + 3)) & 0x0F;
  const mulawByte = ~(sign | (exponent << 4) | mantissa) & 0xFF;
  return mulawByte;
}

/**
 * Convertit un buffer PCM 16-bit 24kHz → mulaw 8-bit 8kHz
 * Resample 24kHz→8kHz = prendre 1 echantillon sur 3
 * @param {Buffer} pcmBuffer - Audio PCM 16-bit signed LE, 24kHz
 * @returns {Buffer} Audio mulaw 8-bit, 8kHz
 */
export function pcmToMulaw(pcmBuffer) {
  // Chaque echantillon PCM = 2 octets (16-bit signed LE)
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  // Resample 24kHz → 8kHz : 1 echantillon sur 3
  const outputCount = Math.floor(sampleCount / 3);
  const output = Buffer.alloc(outputCount);

  for (let i = 0; i < outputCount; i++) {
    const srcIdx = i * 3; // Prendre chaque 3eme echantillon
    const sample = pcmBuffer.readInt16LE(srcIdx * 2);
    output[i] = linearToMulaw(sample);
  }

  return output;
}

// ─── TEXT TO SPEECH (OpenAI TTS) ───

/**
 * Convertit du texte en audio via OpenAI TTS
 * Retourne un Buffer PCM brut (24kHz 16-bit)
 * @param {string} text - Texte a synthetiser
 * @param {string} voice - Voix OpenAI (alloy/nova/shimmer/echo/fable/onyx)
 * @returns {Promise<{success: boolean, audio?: Buffer, error?: string}>}
 */
export async function textToSpeech(text, voice = 'alloy') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'No API key' };
  }

  const body = JSON.stringify({
    model: 'tts-1',
    input: text,
    voice: voice,
    response_format: 'pcm', // PCM brut 24kHz 16-bit signed LE
  });

  return new Promise((resolve) => {
    const url = new URL(TTS_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const errText = Buffer.concat(chunks).toString('utf-8').slice(0, 200);
          console.error(`\x1b[31m[AI AGENT TTS]\x1b[0m Erreur ${res.statusCode}: ${errText}`);
          resolve({ success: false, error: `TTS ${res.statusCode}` });
          return;
        }
        const audio = Buffer.concat(chunks);
        console.log(`\x1b[36m[AI AGENT TTS]\x1b[0m Audio genere: ${audio.length} octets pour "${text.slice(0, 50)}..."`);
        resolve({ success: true, audio });
      });
    });

    req.on('error', (e) => {
      console.error('\x1b[31m[AI AGENT TTS ERR]\x1b[0m', e.message);
      resolve({ success: false, error: e.message });
    });

    req.write(body);
    req.end();
  });
}

// ─── ELEVENLABS TTS ───

/**
 * Convertit du texte en audio via ElevenLabs API
 * Retourne un buffer PCM 24kHz 16-bit mono (meme format que OpenAI TTS)
 */
export async function textToSpeechElevenLabs(text, voiceId = '21m00Tcm4TlvDq8ikWAM') {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { success: false, error: 'No ElevenLabs API key' };

  const body = JSON.stringify({
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${voiceId}?output_format=pcm_24000`,
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const errText = Buffer.concat(chunks).toString('utf-8').slice(0, 200);
          console.error(`\x1b[31m[ELEVENLABS TTS]\x1b[0m Erreur ${res.statusCode}: ${errText}`);
          resolve({ success: false, error: `ElevenLabs TTS ${res.statusCode}` });
          return;
        }
        const audio = Buffer.concat(chunks);
        console.log(`\x1b[36m[ELEVENLABS TTS]\x1b[0m Audio genere: ${audio.length} octets pour "${text.slice(0, 50)}..."`);
        resolve({ success: true, audio });
      });
    });
    req.on('error', (e) => {
      console.error('\x1b[31m[ELEVENLABS TTS ERR]\x1b[0m', e.message);
      resolve({ success: false, error: e.message });
    });
    req.write(body);
    req.end();
  });
}

// ─── RESUME DE SESSION ───

/**
 * Genere un resume structure de la conversation selon le type d'agent
 * @param {Object} agent - Config de l'agent
 * @param {string} transcription - Transcription complete
 * @returns {Promise<{success: boolean, summary?: string, error?: string}>}
 */
export async function generateSessionSummary(agent, transcription) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { success: false, error: 'No API key' };

  const category = agent.category || 'conseil';

  const summaryPrompts = {
    rh: `Analyse cet entretien de recrutement et genere un resume structure en JSON:
{
  "candidateAssessment": "evaluation globale du candidat",
  "strengths": ["force 1", "force 2"],
  "weaknesses": ["faiblesse 1"],
  "technicalFit": "adequation technique (1-5)",
  "culturalFit": "adequation culturelle (1-5)",
  "recommendation": "RETENU / A_REVOIR / REJETE",
  "notes": "remarques complementaires"
}`,

    sav: `Analyse cette conversation SAV et genere un resume structure en JSON:
{
  "problemDescription": "description du probleme client",
  "category": "categorie du probleme",
  "resolutionStatus": "RESOLU / EN_COURS / ESCALADE",
  "solutionApplied": "solution proposee/appliquee",
  "customerSatisfaction": "estimation satisfaction (1-5)",
  "ticketNeeded": true/false,
  "followUpRequired": true/false,
  "notes": "remarques"
}`,

    vente: `Analyse cette conversation commerciale et genere un resume structure en JSON:
{
  "prospectQualification": "chaud / tiede / froid",
  "identifiedNeeds": ["besoin 1", "besoin 2"],
  "budget": "budget evoque ou estimation",
  "decisionTimeline": "delai de decision",
  "objections": ["objection 1"],
  "interestLevel": 1-5,
  "nextSteps": "prochaines etapes",
  "rdvScheduled": true/false,
  "notes": "remarques"
}`,

    training: `Analyse cette session d'entrainement commercial et genere un resume structure en JSON:
{
  "performanceOverall": "evaluation globale",
  "approachUsed": "methode de vente identifiee",
  "strongPoints": ["point fort 1"],
  "areasOfImprovement": ["axe d'amelioration 1"],
  "objectionsHandled": true/false,
  "closingAttempt": true/false,
  "coachingTips": ["conseil 1", "conseil 2"],
  "readyForReal": true/false
}`,

    conseil: `Analyse cette conversation de conseil et genere un resume structure en JSON:
{
  "questionsAsked": ["question 1"],
  "answersProvided": ["reponse 1"],
  "satisfactionEstimate": 1-5,
  "unresolvedQuestions": ["question non resolue"],
  "followUpNeeded": true/false,
  "notes": "remarques"
}`,
  };

  const systemPrompt = summaryPrompts[category] || summaryPrompts.conseil;

  const body = JSON.stringify({
    model: GPT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Voici la transcription de la conversation:\n\n${transcription}` },
    ],
    temperature: 0.3,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  return new Promise((resolve) => {
    const url = new URL(GPT_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            resolve({ success: false, error: `GPT ${res.statusCode}` });
            return;
          }
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.message?.content || '{}';
          resolve({ success: true, summary: content });
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    });

    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

// ─── SCORING TRAINING ───

/**
 * Evalue les performances d'un collaborateur en session d'entrainement
 * @param {Object} agent - Config de l'agent
 * @param {string} transcription - Transcription complete
 * @returns {Promise<{success: boolean, score?: Object, error?: string}>}
 */
export async function scoreTraining(agent, transcription) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { success: false, error: 'No API key' };

  const systemPrompt = `Tu es un coach commercial expert. Evalue la performance du commercial dans cette conversation d'entrainement.
Retourne un JSON avec exactement cette structure:
{
  "overall": <score 0-100>,
  "argumentation": <score 0-100>,
  "objection_handling": <score 0-100>,
  "closing": <score 0-100>,
  "tone": <score 0-100>,
  "discovery": <score 0-100>,
  "recommendations": ["conseil actionnable 1", "conseil actionnable 2", "conseil actionnable 3"]
}

Criteres:
- argumentation: clarte des arguments, pertinence des benefices presentes
- objection_handling: capacite a gerer les resistances et objections
- closing: tentative de conclusion, proposition de prochaine etape
- tone: ton professionnel, ecoute active, empathie
- discovery: qualite des questions de decouverte des besoins
- overall: moyenne ponderee avec bonus/malus

Scenario de l'entrainement: ${agent.scenario || 'Entretien commercial standard'}
Difficulte: ${agent.difficulty || 'medium'}`;

  const body = JSON.stringify({
    model: GPT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Voici la transcription:\n\n${transcription}` },
    ],
    temperature: 0.3,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });

  return new Promise((resolve) => {
    const url = new URL(GPT_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            resolve({ success: false, error: `GPT ${res.statusCode}` });
            return;
          }
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.message?.content || '{}';
          const score = JSON.parse(content);
          resolve({ success: true, score });
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    });

    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

// ─── SAUVEGARDE SESSION EN DB ───

/**
 * Sauvegarde une session d'agent IA en base de donnees
 */
export function saveAgentSession({ agentId, companyId, collaboratorId, callerPhone, callerName, callLogId, transcription, summary, score, evaluation, duration, status, recordingUrl }) {
  const id = 'as_' + Date.now() + Math.random().toString(36).slice(2, 5);
  try {
    db.prepare(`INSERT INTO ai_agent_sessions (id, agentId, companyId, collaboratorId, callerPhone, callerName, callLogId, transcription, summary, score_json, evaluation, duration, status, recordingUrl, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, agentId, companyId, collaboratorId || '', callerPhone || '', callerName || '', callLogId || '', transcription || '', summary || '', JSON.stringify(score || {}), evaluation || '', duration || 0, status || 'completed', recordingUrl || '', new Date().toISOString());

    // Mettre a jour les stats de l'agent
    // P2-D6 (2026-04-20) : fix SQLite JSON path — double-quotes etaient interpretees comme identifier.
    // Pattern correct : outer backtick + inner single-quote pour '$.overall'.
    const stats = db.prepare(`SELECT COUNT(*) as total, AVG(json_extract(score_json, '$.overall')) as avg FROM ai_agent_sessions WHERE agentId = ?`).get(agentId);
    db.prepare('UPDATE ai_agents SET totalCalls = ?, avgScore = ?, updatedAt = ? WHERE id = ?')
      .run(stats?.total || 0, Math.round((stats?.avg || 0) * 10) / 10, new Date().toISOString(), agentId);

    console.log(`\x1b[32m[AI AGENT]\x1b[0m Session sauvegardee: ${id} (agent: ${agentId})`);
    return { success: true, sessionId: id };
  } catch (e) {
    console.error('\x1b[31m[AI AGENT DB ERR]\x1b[0m', e.message);
    return { success: false, error: e.message };
  }
}
