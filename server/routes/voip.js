import { Router } from 'express';
import twilio from 'twilio';
import { db, getByCompany } from '../db/database.js';
import { debitTelecomCredits } from './marketplace.js';
import { autoPipelineAdvance } from '../helpers/pipelineAuto.js';
import { createNotification } from './notifications.js';
import { updateBehaviorScore } from '../helpers/behaviorScore.js';
import {
  generateAccessToken, generateOutboundTwiml, generateInboundTwiml, generateVoicemailDropTwiml,
  fetchCallDetails, getVoipSettings, cleanPhone,
  checkCallingHours, validateSmsContent, checkSmsHours
} from '../services/twilioVoip.js';
import { addSSEClient, removeSSEClient, getTranscript } from '../services/liveTranscription.js';

const { twiml: { VoiceResponse } } = twilio;

import { requireSupra, requireAdmin, requireAuth, enforceCompany } from '../middleware/auth.js';
import { getOrCreateConversation, addCallEvent } from './conversations.js';
import { analyzeTranscription } from '../services/secureIaPhone.js';
import { resolveFromCallSid, resolveFromPhone, validateWebhookContext } from '../helpers/resolveContext.js';
import { archiveCallTranscript } from '../services/transcriptArchive.js';

const router = Router();

// ─── AUTO-TRANSCRIBE + SEMANTIC ANALYSIS PIPELINE ─────────
// Called async after recording callback — transcribes audio via Deepgram,
// then runs semantic analysis (GPT) for forbidden words/phrases
async function autoTranscribeAndAnalyze(callLog) {
  const https = await import('https');
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramKey) { console.log('[AUTO-TRANSCRIBE] No DEEPGRAM_API_KEY — skipping'); return; }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const authHeader = twilioSid && twilioToken ? 'Basic ' + Buffer.from(twilioSid + ':' + twilioToken).toString('base64') : null;

  console.log(`\x1b[35m[AUTO-TRANSCRIBE]\x1b[0m Starting for ${callLog.id}...`);

  // Step 1: Download audio from Twilio
  const audioBuffer = await new Promise((resolve, reject) => {
    const urlObj = new URL(callLog.recordingUrl);
    const fetchAudio = (opts, depth = 0) => {
      if (depth > 3) { reject(new Error('Too many redirects')); return; }
      https.get(opts, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = new URL(res.headers.location);
          fetchAudio({ hostname: loc.hostname, path: loc.pathname + loc.search, headers: opts.headers }, depth + 1);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`Audio fetch ${res.statusCode}`)); return; }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    fetchAudio({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, headers: authHeader ? { 'Authorization': authHeader } : {} });
  });

  console.log(`\x1b[35m[AUTO-TRANSCRIBE]\x1b[0m Audio: ${audioBuffer.length} bytes`);

  // Step 2: Send to Deepgram
  const dgResult = await new Promise((resolve, reject) => {
    const dgReq = https.request({
      hostname: 'api.deepgram.com',
      path: '/v1/listen?model=nova-2&language=fr&smart_format=true&punctuate=true&diarize=true&utterances=true',
      method: 'POST',
      headers: { 'Authorization': 'Token ' + deepgramKey, 'Content-Type': 'audio/mpeg', 'Content-Length': audioBuffer.length },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch (e) { reject(e); }
      });
    });
    dgReq.on('error', reject);
    dgReq.write(audioBuffer);
    dgReq.end();
  });

  if (dgResult.status !== 200) {
    console.error(`[AUTO-TRANSCRIBE] Deepgram error ${dgResult.status}`);
    return;
  }

  const utterances = dgResult.body.results?.utterances || [];
  const fullText = dgResult.body.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  const segments = utterances.length > 0
    ? utterances.map(u => ({ speaker: u.speaker === 0 ? 'collab' : 'contact', text: u.transcript, timestamp: Math.round(u.start * 1000), confidence: u.confidence }))
    : fullText ? [{ speaker: 'collab', text: fullText, timestamp: 0 }] : [];

  // Step 3: Save transcript
  const trId = 'ct_' + Date.now() + Math.random().toString(36).slice(2, 5);
  db.prepare('INSERT INTO call_transcripts (id, callLogId, companyId, collaboratorId, segments_json, fullText, duration, createdAt) VALUES (?,?,?,?,?,?,?,?)')
    .run(trId, callLog.id, callLog.companyId, callLog.collaboratorId, JSON.stringify(segments), fullText, 0, new Date().toISOString());

  console.log(`\x1b[32m[AUTO-TRANSCRIBE]\x1b[0m Transcript saved: ${segments.length} segments, ${fullText.length} chars`);

  if (!fullText) return;

  // Step 4: Forbidden words analysis (exact match)
  const companyRow = db.prepare('SELECT forbidden_words_json FROM companies WHERE id = ?').get(callLog.companyId);
  const collabRow = db.prepare('SELECT secure_ia_words_json FROM collaborators WHERE id = ?').get(callLog.collaboratorId);
  const companyWords = JSON.parse(companyRow?.forbidden_words_json || '[]');
  const collabWords = JSON.parse(collabRow?.secure_ia_words_json || '[]');
  const allForbidden = [...new Set([...companyWords, ...collabWords])].filter(w => w && w.trim());

  let exactAnalysis = null;
  if (allForbidden.length > 0) {
    exactAnalysis = analyzeTranscription(fullText, allForbidden);
  }

  // Step 5: Semantic analysis via GPT (detect similar/subtle phrases)
  let semanticViolations = [];
  if (allForbidden.length > 0) {
    try {
      semanticViolations = await semanticAnalyzeGPT(fullText, allForbidden);
    } catch (e) { console.error('[SEMANTIC ANALYSIS]', e.message); }
  }

  // Step 6: Merge results and create alert if needed
  const exactWords = exactAnalysis?.words || [];
  const allViolations = [...exactWords];
  for (const sv of semanticViolations) {
    if (!allViolations.find(w => w.word === sv.word)) {
      allViolations.push(sv);
    }
  }

  if (allViolations.length > 0) {
    const existingAlert = db.prepare('SELECT id FROM secure_ia_alerts WHERE callLogId = ?').get(callLog.id);
    if (!existingAlert) {
      const totalV = allViolations.reduce((s, w) => s + (w.count || 1), 0);
      const severity = totalV >= 6 ? 'high' : totalV >= 3 ? 'medium' : 'low';
      const alertId = 'sia_' + Date.now() + Math.random().toString(36).slice(2, 5);
      const cl2 = db.prepare('SELECT toNumber, contactId FROM call_logs WHERE id = ?').get(callLog.id);
      const contact = cl2?.contactId ? db.prepare('SELECT name, phone FROM contacts WHERE id = ?').get(cl2.contactId) : null;

      db.prepare('INSERT INTO secure_ia_alerts (id, companyId, collaboratorId, callLogId, detectedWords_json, transcription, callDate, callDuration, contactName, contactPhone, severity, reviewed, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?)')
        .run(alertId, callLog.companyId, callLog.collaboratorId, callLog.id, JSON.stringify(allViolations), fullText, new Date().toISOString(), 0, contact?.name || '', contact?.phone || cl2?.toNumber || '', severity, new Date().toISOString());

      console.log(`\x1b[31m[SIGNALEMENT AUTO]\x1b[0m ${allViolations.length} violations pour ${callLog.id} (${severity})`);

      // Step 7: Notify collaborator via activity log
      try {
        const actId = 'notif_' + Date.now() + Math.random().toString(36).slice(2, 5);
        db.prepare('INSERT INTO activity_logs (id, companyId, collaboratorId, type, detail, meta_json, createdAt) VALUES (?,?,?,?,?,?,?)')
          .run(actId, callLog.companyId, callLog.collaboratorId, 'signalement',
            `Signalement: ${allViolations.map(w => w.word).join(', ')} détecté(s) dans votre appel`,
            JSON.stringify({ alertId, severity, words: allViolations.map(w => w.word), callLogId: callLog.id }),
            new Date().toISOString());
      } catch (e) { /* activity_logs may not have all columns */ }
    }
  }
}

// ─── SEMANTIC ANALYSIS VIA GPT ─────────
async function semanticAnalyzeGPT(transcription, forbiddenWords) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey || !transcription || forbiddenWords.length === 0) return [];

  const https = await import('https');
  const prompt = `Tu es un analyste de conformité téléphonique. Analyse cette transcription d'appel et détecte si le collaborateur a exprimé des idées SIMILAIRES ou SUBTILES aux mots/phrases interdits suivants, même sans utiliser les mots exacts.

MOTS/PHRASES INTERDITS:
${forbiddenWords.map((w, i) => `${i + 1}. "${w}"`).join('\n')}

TRANSCRIPTION:
"${transcription.substring(0, 3000)}"

Réponds UNIQUEMENT en JSON (pas de texte avant/après):
[{"word": "le mot interdit original", "detected_phrase": "la phrase similaire dite", "count": 1, "explanation": "pourquoi c'est similaire"}]

Si aucune violation similaire détectée, réponds: []
Ne détecte PAS les correspondances exactes (elles sont déjà gérées). Détecte UNIQUEMENT les reformulations, synonymes, contournements subtils.`;

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 500,
    });

    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + openaiKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          const content = result.choices?.[0]?.message?.content || '[]';
          const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const violations = JSON.parse(cleaned);
          if (Array.isArray(violations)) {
            resolve(violations.map(v => ({
              word: v.word || v.detected_phrase,
              count: v.count || 1,
              positions: [],
              semantic: true,
              detected_phrase: v.detected_phrase,
              explanation: v.explanation,
            })));
          } else { resolve([]); }
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.write(body);
    req.end();
  });
}

// ─── TWILIO WEBHOOK SIGNATURE VALIDATION ─────────
// Validates that webhook requests genuinely come from Twilio (not forged)
function validateTwilioWebhook(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // Skip validation if no auth token configured (dev/demo mode)
  if (!authToken) return next();

  const twilioSignature = req.headers['x-twilio-signature'];
  if (!twilioSignature) {
    console.warn('\x1b[33m[VOIP SECURITY]\x1b[0m Missing X-Twilio-Signature header — allowing (may be direct test)');
    return next();
  }

  // Build the full URL Twilio used to sign the request
  // Try multiple URL constructions because proxy headers may differ from what Twilio signed
  const appDomain = process.env.APP_DOMAIN || 'calendar360.fr';
  const candidateUrls = [
    `https://${appDomain}${req.originalUrl}`,
    `https://${req.headers['host'] || appDomain}${req.originalUrl}`,
    `https://${req.headers['x-forwarded-host'] || appDomain}${req.originalUrl}`,
    `http://${appDomain}${req.originalUrl}`,
  ];

  const isValid = candidateUrls.some(url =>
    twilio.validateRequest(authToken, twilioSignature, url, req.body || {})
  );

  if (!isValid) {
    // Log warning but DON'T block — proxy URL mismatch is common with Plesk/Nginx/Apache chain
    console.warn(`\x1b[33m[VOIP SECURITY]\x1b[0m Twilio signature mismatch for ${req.originalUrl} (tried ${candidateUrls.length} URLs) — allowing with warning`);
  }
  next();
}

// ─── STATUS CALLBACK DEDUPLICATION ─────────────
// Prevents processing the same Twilio status event twice (Twilio can retry)
const processedStatusCallbacks = new Map(); // key: `${CallSid}:${CallStatus}` → timestamp
const STATUS_DEDUP_TTL_MS = 60000; // 60s window

function isStatusDuplicate(callSid, callStatus) {
  const key = `${callSid}:${callStatus}`;
  const now = Date.now();
  // Cleanup old entries every call
  if (processedStatusCallbacks.size > 500) {
    for (const [k, ts] of processedStatusCallbacks) {
      if (now - ts > STATUS_DEDUP_TTL_MS) processedStatusCallbacks.delete(k);
    }
  }
  if (processedStatusCallbacks.has(key)) {
    const age = now - processedStatusCallbacks.get(key);
    if (age < STATUS_DEDUP_TTL_MS) return true;
  }
  processedStatusCallbacks.set(key, now);
  return false;
}

// ─── TOKEN ───────────────────────────────────────

// POST /api/voip/token — Generate Twilio access token for browser SDK
// Dual mode: marketplace (platform credentials) or legacy (per-company credentials)
router.post('/token', requireAuth, enforceCompany, (req, res) => {
  try {
    const { collaboratorId, identity } = req.body;
    const companyId = req.auth.companyId;
    const finalIdentity = identity || collaboratorId;

    // Check marketplace mode: does this company have assigned numbers?
    const marketplaceNumber = db.prepare("SELECT id FROM phone_numbers WHERE companyId = ? AND status = 'assigned' LIMIT 1").get(companyId);

    if (marketplaceNumber) {
      // Marketplace mode: use platform credentials from .env
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
      if (!accountSid || !twimlAppSid) {
        return res.json({ success: false, error: 'Credentials plateforme non configurées', demo: true, token: 'demo-token-' + Date.now(), identity: finalIdentity });
      }
      const result = generateAccessToken({ accountSid, twimlAppSid, identity: finalIdentity });
      res.json({ ...result, marketplace: true });
    } else {
      // Legacy mode: per-company credentials
      const settings = getVoipSettings(db, companyId);
      if (!settings) {
        return res.json({ success: false, error: 'VoIP non configur\u00e9', demo: true, token: 'demo-token-' + Date.now(), identity: finalIdentity });
      }
      const result = generateAccessToken({
        accountSid: settings.twilioAccountSid,
        twimlAppSid: settings.twilioTwimlAppSid,
        identity: finalIdentity,
      });
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── COMPLIANCE CHECK ENDPOINTS ─────────────────

// GET /api/voip/compliance/calling-hours — Check if outbound calls are allowed now
router.get('/compliance/calling-hours', requireAuth, (req, res) => {
  try {
    const result = checkCallingHours();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/voip/compliance/validate-sms — Validate SMS content for French compliance
router.post('/compliance/validate-sms', requireAuth, (req, res) => {
  try {
    const { content = '' } = req.body;
    const contentWarnings = validateSmsContent(content);
    const hoursCheck = checkSmsHours();
    res.json({
      hoursAllowed: hoursCheck.allowed,
      hoursReason: hoursCheck.reason || null,
      contentWarnings,
      compliant: hoursCheck.allowed && contentWarnings.filter(w => w.level === 'error').length === 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/voip/compliance/call-frequency?companyId=c1&toNumber=+33... — Check call frequency to a number
router.get('/compliance/call-frequency', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    const { toNumber } = req.query;
    if (!toNumber) return res.json({ allowed: true, count: 0 });
    const clean = cleanPhone(toNumber);
    const last9 = clean.slice(-9);
    // Count calls to this number in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const count = db.prepare(
      "SELECT COUNT(*) as cnt FROM call_logs WHERE companyId = ? AND direction = 'outbound' AND toNumber LIKE ? AND createdAt > ?"
    ).get(companyId, '%' + last9 + '%', thirtyDaysAgo)?.cnt || 0;
    res.json({
      allowed: count < 4,
      count,
      limit: 4,
      reason: count >= 4 ? `Limite de 4 appels/30 jours atteinte pour ce numéro (${count} appels effectués)` : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TWIML WEBHOOKS (called by Twilio, not by frontend) ───

// POST /api/voip/twiml/outbound — TwiML App "Voice URL"
// Twilio POSTs here when browser initiates an outbound call
// Dual mode: marketplace (caller ID from phone_numbers) or legacy (from voip_settings)
router.post('/twiml/outbound', validateTwilioWebhook, (req, res) => {
  try {
    const { To, From, companyId, collaboratorId, fromNumber, skipHoursCheck } = req.body;

    // ── FRENCH REGULATORY: Calling hours (informational only) ──
    // Calendar360 is used for SAV/service calls, not cold-calling/démarchage
    // The restriction is logged but NOT enforced (skipHoursCheck always true for service calls)
    {
      const hoursCheck = checkCallingHours();
      if (!hoursCheck.allowed) {
        console.log(`\x1b[33m[VOIP INFO]\x1b[0m Appel hors horaires commerciaux (SAV/service autorisé): ${hoursCheck.reason}`);
      }
    }

    let callerId = From;
    let recordingEnabled = false;
    let recordingConsent = false;

    // PRIORITY 1: Explicit fromNumber (user selected a specific line)
    // Verify the number actually belongs to the collaborator for security
    if (fromNumber && collaboratorId) {
      const verified = db.prepare(
        "SELECT * FROM phone_numbers WHERE phoneNumber = ? AND collaboratorId = ? AND status = 'assigned'"
      ).get(fromNumber, collaboratorId);
      if (verified) {
        callerId = verified.phoneNumber;
        const vs = companyId ? getVoipSettings(db, companyId) : null;
        recordingEnabled = !!vs?.recordingEnabled;
        recordingConsent = !!vs?.recordingConsent;
      }
    }

    // PRIORITY 2: First assigned number for this collaborator
    if (callerId === From && collaboratorId) {
      const assignedNumber = db.prepare("SELECT * FROM phone_numbers WHERE collaboratorId = ? AND status = 'assigned' LIMIT 1").get(collaboratorId);
      if (assignedNumber) {
        callerId = assignedNumber.phoneNumber;
        const vs = companyId ? getVoipSettings(db, companyId) : null;
        recordingEnabled = !!vs?.recordingEnabled;
        recordingConsent = !!vs?.recordingConsent;
      }
    }

    // PRIORITY 3: First company marketplace number
    if (callerId === From && companyId) {
      const companyNumber = db.prepare("SELECT * FROM phone_numbers WHERE companyId = ? AND status = 'assigned' LIMIT 1").get(companyId);
      if (companyNumber) {
        callerId = companyNumber.phoneNumber;
        const vs = getVoipSettings(db, companyId);
        recordingEnabled = !!vs?.recordingEnabled;
        recordingConsent = !!vs?.recordingConsent;
      }
    }

    // PRIORITY 4: Legacy per-company settings
    if (callerId === From && companyId) {
      const settings = getVoipSettings(db, companyId);
      if (settings) {
        callerId = settings.twilioPhoneNumber || From;
        recordingEnabled = !!settings.recordingEnabled;
        recordingConsent = !!settings.recordingConsent;
      }
    }

    // Check if AI copilot enabled for live transcription stream
    let streamUrl = null;
    let streamParams = null;
    if (collaboratorId) {
      // REGLE: Toujours activer le media stream pour la transcription live
      // (même sans AI Copilot — la transcription est un feature de base)
      const collabCheck = db.prepare('SELECT ai_copilot_enabled FROM collaborators WHERE id = ?').get(collaboratorId);
      {
        const host = req.get('x-forwarded-host') || req.get('host') || 'calendar360.fr';
        const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
        const protocol = isLocal ? 'ws' : 'wss';
        const publicHost = isLocal ? 'calendar360.fr' : host;
        streamUrl = `${protocol}://${publicHost}/media-stream`;
        streamParams = { collaboratorId, companyId: companyId || '', contactId: '', direction: 'outbound', aiCopilotEnabled: collabCheck?.ai_copilot_enabled ? '1' : '0' };
      }
    }

    // Build recording callback URL (Twilio sends RecordingUrl here)
    const cbHost = req.get('x-forwarded-host') || req.get('host') || 'calendar360.fr';
    const cbPublicHost = (cbHost.includes('localhost') || cbHost.includes('127.0.0.1')) ? 'calendar360.fr' : cbHost;
    const recordingCallbackUrl = `https://${cbPublicHost}/api/voip/recording-callback`;

    // AMD: check if collaborator has AMD enabled
    let amdEnabled = false;
    let amdCallbackUrl = null;
    if (collaboratorId) {
      const amdCheck = db.prepare('SELECT amd_enabled, voicemail_audio_url, voicemail_text FROM collaborators WHERE id = ?').get(collaboratorId);
      if (amdCheck?.amd_enabled) {
        amdEnabled = true;
        const amdHost = req.get('x-forwarded-host') || req.get('host') || 'calendar360.fr';
        const amdPublicHost = (amdHost.includes('localhost') || amdHost.includes('127.0.0.1')) ? 'calendar360.fr' : amdHost;
        amdCallbackUrl = `https://${amdPublicHost}/api/voip/amd-callback?collaboratorId=${collaboratorId}&companyId=${companyId || ''}&to=${encodeURIComponent(cleanPhone(To))}`;
      }
    }

    const twiml = generateOutboundTwiml({
      to: cleanPhone(To),
      callerId,
      recordingEnabled,
      recordingConsent,
      streamUrl,
      streamParams,
      recordingCallbackUrl,
      amdEnabled,
      amdCallbackUrl,
    });
    res.type('text/xml');
    res.send(twiml);
  } catch (err) {
    console.error('[VOIP TWIML ERR]', err);
    res.type('text/xml');
    res.send('<Response><Say language="fr-FR">Erreur de connexion</Say></Response>');
  }
});

// POST /api/voip/amd-callback — AMD result callback
// Twilio POSTs here after Dial completes with AMD enabled
router.post('/amd-callback', (req, res) => {
  try {
    const { AnsweredBy, CallSid, DialCallStatus } = req.body;
    const { to } = req.query;

    // SECURITE: re-valider le contexte via CallSid (ne JAMAIS faire confiance aux query params)
    const ctx = resolveFromCallSid(CallSid);
    const webhookCtx = validateWebhookContext({ companyId: req.query.companyId, collaboratorId: req.query.collaboratorId });
    // Priorite : contexte resolve depuis CallSid > query params valides
    const companyId = ctx.companyId || webhookCtx.companyId;
    const collaboratorId = ctx.collaboratorId || webhookCtx.collaboratorId;

    console.log(`\x1b[33m[AMD]\x1b[0m CallSid=${CallSid} AnsweredBy=${AnsweredBy} DialStatus=${DialCallStatus} to=${to} ctx=${ctx.isValid?'RESOLVED':'FALLBACK'}`);

    // If machine detected → play voicemail drop + send SMS
    if (AnsweredBy && AnsweredBy.startsWith('machine')) {
      console.log(`\x1b[33m[AMD]\x1b[0m VOICEMAIL DETECTED for ${to} — dropping message`);

      // Get collab voicemail config
      const collabConfig = collaboratorId ? db.prepare('SELECT voicemail_audio_url, voicemail_text, name FROM collaborators WHERE id = ? AND companyId = ?').get(collaboratorId, companyId) : null;

      // Send SMS NRP auto — uniquement si contexte valide
      if (to && companyId && (ctx.isValid || webhookCtx.isValid)) {
        try {
          const smsCredits = db.prepare('SELECT credits FROM sms_credits WHERE companyId = ?').get(companyId);
          if (smsCredits?.credits > 0) {
            const company = db.prepare('SELECT sms_sender_name FROM companies WHERE id = ?').get(companyId);
            const senderName = company?.sms_sender_name || 'Calendar360';
            const smsText = collabConfig?.voicemail_text || "Bonjour, j'ai essayé de vous joindre. N'hésitez pas à me rappeler. Cordialement.";
            // Import Brevo SMS sender
            import('../services/brevoSms.js').then(({ sendSms }) => {
              sendSms({ to, content: smsText, sender: senderName }).then(r => {
                if (r?.success) {
                  db.prepare('UPDATE sms_credits SET credits = credits - 1 WHERE companyId = ?').run(companyId);
                  db.prepare('INSERT INTO sms_messages (id, companyId, collaboratorId, toNumber, content, direction, status, createdAt) VALUES (?,?,?,?,?,?,?,?)').run(
                    'sms'+Date.now(), companyId, collaboratorId||'', to, smsText, 'outbound', 'sent', new Date().toISOString()
                  );
                  console.log(`\x1b[32m[AMD SMS]\x1b[0m SMS NRP auto sent to ${to}`);
                }
              }).catch(e => console.error('[AMD SMS ERR]', e.message));
            }).catch(e => console.error('[AMD SMS IMPORT ERR]', e.message));
          }
        } catch (e) { console.error('[AMD SMS ERR]', e.message); }
      }

      // Return TwiML: play voicemail audio then hangup
      const twiml = generateVoicemailDropTwiml({
        audioUrl: collabConfig?.voicemail_audio_url || null,
        textMessage: collabConfig?.voicemail_text || null,
      });
      res.type('text/xml');
      return res.send(twiml);
    }

    // Human answered or call ended normally — return empty TwiML
    res.type('text/xml');
    res.send('<Response></Response>');
  } catch (err) {
    console.error('[AMD CALLBACK ERR]', err);
    res.type('text/xml');
    res.send('<Response></Response>');
  }
});

// POST /api/voip/twiml/inbound — Twilio Phone Number "Voice URL"
// Twilio POSTs here when someone calls the Twilio number
// Dual mode: marketplace (route to assigned collaborator) or legacy (route to first admin)
router.post('/twiml/inbound', validateTwilioWebhook, (req, res) => {
  try {
    const { From, To } = req.body;
    const cleanFrom = cleanPhone(From);

    // SECURITE: Resolution centralisee via resolveFromPhone()
    const ctx = resolveFromPhone({ twilioNumber: To, clientPhone: From });

    if (!ctx.isValid || !ctx.companyId) {
      console.warn(`\x1b[31m[VOIP INBOUND]\x1b[0m Numero non configure: ${To} — DROP`);
      res.type('text/xml');
      return res.send('<Response><Say language="fr-FR">Ce num\u00e9ro n\'est pas configur\u00e9.</Say></Response>');
    }

    const clientIdentity = ctx.collaboratorId || ctx.companyId;

    // Log inbound call avec contexte resolu
    const callId = 'cl' + Date.now();
    db.prepare(`INSERT INTO call_logs (id, companyId, contactId, collaboratorId, direction, fromNumber, toNumber, status, createdAt)
      VALUES (?, ?, ?, ?, 'inbound', ?, ?, 'ringing', ?)`)
      .run(callId, ctx.companyId, ctx.contactId || null, ctx.collaboratorId || null, cleanFrom, To, new Date().toISOString());

    const vs = getVoipSettings(db, ctx.companyId);

    // Check AI copilot for live stream
    let inStreamUrl = null, inStreamParams = null;
    if (ctx.collaboratorId) {
      const collabInCheck = db.prepare('SELECT ai_copilot_enabled FROM collaborators WHERE id = ?').get(ctx.collaboratorId);
      if (collabInCheck?.ai_copilot_enabled) {
        const host = req.get('x-forwarded-host') || req.get('host') || 'calendar360.fr';
        const publicHost = (host.includes('localhost') || host.includes('127.0.0.1')) ? 'calendar360.fr' : host;
        inStreamUrl = `wss://${publicHost}/media-stream`;
        inStreamParams = { collaboratorId: ctx.collaboratorId, companyId: ctx.companyId, contactId: ctx.contactId || '', direction: 'inbound', aiCopilotEnabled: '1' };
      }
    }

    const inCbHost = req.get('x-forwarded-host') || req.get('host') || 'calendar360.fr';
    const inCbPublicHost = (inCbHost.includes('localhost') || inCbHost.includes('127.0.0.1')) ? 'calendar360.fr' : inCbHost;

    const twiml = generateInboundTwiml({
      clientIdentity,
      recordingEnabled: !!vs?.recordingEnabled,
      recordingConsent: !!vs?.recordingConsent,
      streamUrl: inStreamUrl,
      streamParams: inStreamParams,
      recordingCallbackUrl: `https://${inCbPublicHost}/api/voip/recording-callback`,
    });
    console.log(`\x1b[32m[VOIP INBOUND]\x1b[0m ${From} → ${To} → ctx:${ctx.source} company:${ctx.companyId} collab:${ctx.collaboratorId} contact:${ctx.contactId}`);
    res.type('text/xml');
    res.send(twiml);
  } catch (err) {
    console.error('[VOIP INBOUND ERR]', err);
    res.type('text/xml');
    res.send('<Response><Say language="fr-FR">Erreur de connexion</Say></Response>');
  }
});

// ─── RECORDING CALLBACK (called by Twilio when recording is ready) ───

// POST /api/voip/recording-callback — Twilio sends RecordingUrl here
router.post('/recording-callback', validateTwilioWebhook, (req, res) => {
  try {
    const { CallSid, RecordingUrl, RecordingSid, RecordingStatus, RecordingDuration } = req.body;
    console.log(`\x1b[32m[VOIP RECORDING]\x1b[0m ${CallSid} → ${RecordingStatus} (${RecordingDuration || 0}s) URL: ${RecordingUrl}`);

    let matchedCallLogId = null;

    if (RecordingUrl && CallSid) {
      const publicUrl = RecordingUrl.endsWith('.mp3') ? RecordingUrl : RecordingUrl + '.mp3';

      // SECURITE: resolution centralisee via resolveFromCallSid()
      const ctx = resolveFromCallSid(CallSid);
      if (ctx.isValid && ctx.callLogId) {
        db.prepare('UPDATE call_logs SET recordingUrl = ?, recordingSid = ? WHERE id = ?')
          .run(publicUrl, RecordingSid || null, ctx.callLogId);
        matchedCallLogId = ctx.callLogId;
        console.log(`\x1b[32m[VOIP RECORDING]\x1b[0m Saved recording for call ${ctx.callLogId} (company:${ctx.companyId})`);

        try {
          db.prepare('UPDATE conversation_events SET recordingUrl = ? WHERE callLogId = ?')
            .run(publicUrl, ctx.callLogId);
        } catch (e) { /* ok */ }
      } else {
        // SECURITE: PAS de fallback aveugle — log le probleme mais ne rattache PAS au mauvais appel
        console.warn(`\x1b[31m[VOIP RECORDING]\x1b[0m No call_log found for SID ${CallSid} — recording DROPPED (pas de fallback dangereux)`);
      }

      // ── AUTO-TRANSCRIBE + ANALYSE (async, non-blocking) ──
      if (matchedCallLogId) {
        const callLogForTranscribe = db.prepare('SELECT id, companyId, collaboratorId, recordingUrl FROM call_logs WHERE id = ?').get(matchedCallLogId);
        if (callLogForTranscribe?.recordingUrl) {
          const existingTr = db.prepare('SELECT id FROM call_transcripts WHERE callLogId = ?').get(callLogForTranscribe.id);
          if (!existingTr) {
            autoTranscribeAndAnalyze(callLogForTranscribe).catch(err => {
              console.error('[AUTO-TRANSCRIBE ERR]', err.message);
            });
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[VOIP RECORDING ERR]', err.message);
    res.sendStatus(500);
  }
});

// ─── STATUS CALLBACK (called by Twilio for call events) ───

// POST /api/voip/status — Twilio status callback
router.post('/status', validateTwilioWebhook, (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration, RecordingUrl, RecordingSid } = req.body;
    console.log(`\x1b[35m[VOIP STATUS]\x1b[0m ${CallSid} \u2192 ${CallStatus} (${CallDuration || 0}s)`);

    // ── DEDUPLICATION: Skip if already processed (Twilio can retry) ──
    if (isStatusDuplicate(CallSid, CallStatus)) {
      console.log(`\x1b[33m[VOIP STATUS]\x1b[0m Duplicate callback ${CallSid}:${CallStatus} — skipping`);
      return res.json({ success: true, skipped: true });
    }

    // SECURITE: resolution centralisee via resolveFromCallSid()
    const ctx = resolveFromCallSid(CallSid);
    let existing = ctx.isValid ? { id: ctx.callLogId, companyId: ctx.companyId } : null;
    if (!existing && CallSid) {
      // Fallback restreint — 10s max, appel initie sans SID, journalise comme ANOMALIE
      const recent = db.prepare("SELECT id, companyId FROM call_logs WHERE twilioCallSid IS NULL AND status IN ('initiated','in-progress') AND createdAt > datetime('now', '-10 seconds') ORDER BY createdAt DESC LIMIT 1").get();
      if (recent) {
        db.prepare('UPDATE call_logs SET twilioCallSid = ? WHERE id = ?').run(CallSid, recent.id);
        existing = recent;
        console.warn(`\x1b[33m[VOIP STATUS ANOMALY]\x1b[0m Fallback match: SID ${CallSid} → call ${recent.id} (heuristique 10s — a surveiller)`);
      }
    }
    if (existing) {
      const updates = { status: CallStatus };
      if (CallDuration) updates.duration = parseInt(CallDuration);

      // ── Anti-fake call validation ──
      if (CallStatus === 'completed' && CallDuration) {
        const dur = parseInt(CallDuration);
        if (dur < 15) {
          updates.is_valid_call = 0;
          updates.invalid_reason = 'duration_too_short:' + dur + 's';
        } else {
          updates.is_valid_call = 1;
          updates.invalid_reason = '';
        }
      } else if (['busy', 'no-answer', 'canceled', 'failed'].includes(CallStatus)) {
        updates.is_valid_call = 0;
        updates.invalid_reason = 'status:' + CallStatus;
      }
      if (RecordingUrl) updates.recordingUrl = RecordingUrl;
      if (RecordingSid) updates.recordingSid = RecordingSid;
      if (['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(CallStatus)) {
        updates.endedAt = new Date().toISOString();
      }

      const sets = Object.keys(updates).map(k => `${k} = ?`).join(',');
      db.prepare(`UPDATE call_logs SET ${sets} WHERE twilioCallSid = ?`).run(...Object.values(updates), CallSid);

      // ── Log user activity for completed calls ──
      if (existing && ['completed'].includes(CallStatus)) {
        try {
          const callLogFull = db.prepare('SELECT collaboratorId, companyId, duration FROM call_logs WHERE twilioCallSid = ?').get(CallSid);
          if (callLogFull?.collaboratorId) {
            const actId = 'ua_' + Date.now() + Math.random().toString(36).slice(2, 5);
            db.prepare('INSERT INTO user_activity_logs (id, companyId, collaborator_id, action_type, action_detail, entity_type, entity_id, duration, metadata_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
              .run(actId, callLogFull.companyId, callLogFull.collaboratorId, 'call_completed',
                CallDuration ? CallDuration + 's' : '', 'call_log', existing.id || '',
                parseInt(CallDuration) || 0, JSON.stringify({ status: CallStatus, isValid: updates.is_valid_call !== undefined ? updates.is_valid_call : 1 }),
                new Date().toISOString());
          }
        } catch (e) { console.error('[ACTIVITY LOG]', e.message); }
      }

      // ── START LIVE TRANSCRIPTION STREAM when call is in-progress ──
      if (CallStatus === 'in-progress') {
        try {
          const callLog = db.prepare('SELECT collaboratorId, contactId FROM call_logs WHERE twilioCallSid = ?').get(CallSid);
          if (callLog?.collaboratorId) {
            const collabCheck = db.prepare('SELECT ai_copilot_enabled FROM collaborators WHERE id = ?').get(callLog.collaboratorId);
            if (collabCheck?.ai_copilot_enabled) {
              // Start stream via Twilio REST API
              const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
              const appDomain = process.env.APP_DOMAIN || 'calendar360.fr';
              twilioClient.calls(CallSid).streams.create({
                url: `wss://${appDomain}/media-stream`,
                track: 'both_tracks',
                name: 'live-transcription',
                statusCallback: `https://${appDomain}/api/voip/stream-status`,
                parameters: {
                  collaboratorId: callLog.collaboratorId,
                  companyId: existing.companyId,
                  contactId: callLog.contactId || '',
                  aiCopilotEnabled: '1',
                },
              }).then(stream => {
                console.log(`\x1b[32m[LIVE STREAM]\x1b[0m Started stream ${stream.sid} for call ${CallSid}`);
              }).catch(err => {
                console.error(`\x1b[31m[LIVE STREAM ERR]\x1b[0m ${err.message}`);
              });
            }
          }
        } catch (e) { console.error('[LIVE STREAM] Error starting stream:', e.message); }
      }

      // Debit credits if call completed (1 credit per minute, minimum 1)
      if (CallStatus === 'completed' && CallDuration) {
        const minutes = Math.max(1, Math.ceil(parseInt(CallDuration) / 60));
        db.prepare('UPDATE voip_credits SET credits = MAX(0, credits - ?) WHERE companyId = ?').run(minutes, existing.companyId);
        const txId = 'vtx' + Date.now();
        db.prepare('INSERT INTO voip_transactions (id, companyId, date, type, count, detail, amount) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(txId, existing.companyId, new Date().toISOString().split('T')[0], 'call', -minutes, `Appel ${minutes}min`, 0);

        // Also debit minutes on the marketplace phone number if applicable
        const callLog = db.prepare('SELECT fromNumber, toNumber, direction, collaboratorId FROM call_logs WHERE twilioCallSid = ?').get(CallSid);
        if (callLog) {
          const numberToDebit = callLog.direction === 'outbound' ? callLog.fromNumber : callLog.toNumber;
          db.prepare("UPDATE phone_numbers SET minutesUsed = minutesUsed + ? WHERE phoneNumber = ? AND status = 'assigned'")
            .run(minutes, numberToDebit);
          // Also try by collaboratorId
          if (callLog.collaboratorId) {
            db.prepare("UPDATE phone_numbers SET minutesUsed = minutesUsed + ? WHERE collaboratorId = ? AND status = 'assigned' AND phoneNumber != ?")
              .run(minutes, callLog.collaboratorId, numberToDebit || '');
          }
        }
      }
    }

    // ── Update conversation event with final call data ──
    if (existing && ['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(CallStatus)) {
      try {
        const convEvent = db.prepare('SELECT id, conversationId FROM conversation_events WHERE callLogId = ?').get(existing.id);
        if (convEvent) {
          const isMissed = ['busy', 'no-answer', 'canceled', 'failed'].includes(CallStatus);
          const dur = CallDuration ? parseInt(CallDuration) : 0;
          const durStr = dur ? `${Math.floor(dur / 60)}min${String(dur % 60).padStart(2, '0')}s` : '';
          const newType = isMissed ? 'call_missed' : undefined;
          db.prepare(`UPDATE conversation_events SET duration = ?, recordingUrl = COALESCE(?, recordingUrl), status = ?${newType ? ', type = ?' : ''} WHERE id = ?`)
            .run(dur, RecordingUrl || null, CallStatus, ...(newType ? [newType] : []), convEvent.id);
          const callLog = db.prepare('SELECT direction FROM call_logs WHERE id = ?').get(existing.id);
          const typeLabel = isMissed ? 'Appel manqué' : callLog?.direction === 'outbound' ? 'Appel sortant' : 'Appel entrant';
          const preview = durStr ? `${typeLabel} · ${durStr}` : typeLabel;
          db.prepare('UPDATE conversations SET lastActivityAt = ?, lastEventType = ?, lastEventPreview = ? WHERE id = ?')
            .run(new Date().toISOString(), newType || (callLog?.direction === 'outbound' ? 'call_outbound' : 'call_inbound'), preview, convEvent.conversationId);
        }
      } catch (convErr) { console.error('[CONV STATUS]', convErr.message); }
    }

    // ── SECURE IA PHONE: trigger analysis if enabled ──
    if (existing && ['completed'].includes(CallStatus) && (RecordingUrl || RecordingSid)) {
      try {
        const callLog = db.prepare('SELECT collaboratorId FROM call_logs WHERE twilioCallSid = ?').get(CallSid);
        if (callLog?.collaboratorId) {
          const collab = db.prepare('SELECT secure_ia_phone FROM collaborators WHERE id = ?').get(callLog.collaboratorId);
          if (collab?.secure_ia_phone) {
            // Async — don't block Twilio callback
            import('../services/secureIaPhone.js').then(({ processCallForSecureIa }) => {
              processCallForSecureIa(existing.id).catch(err => {
                console.error('\x1b[31m[SECURE IA]\x1b[0m', err.message);
              });
            });
          }
        }
      } catch (secureErr) {
        console.error('[SECURE IA HOOK ERR]', secureErr.message);
      }
    }

    // ── AI SALES COPILOT: auto-analyze if enabled ──
    if (existing && ['completed'].includes(CallStatus) && (RecordingUrl || RecordingSid)) {
      try {
        const callLog2 = db.prepare('SELECT collaboratorId FROM call_logs WHERE twilioCallSid = ?').get(CallSid);
        if (callLog2?.collaboratorId) {
          const collab2 = db.prepare('SELECT ai_copilot_enabled FROM collaborators WHERE id = ?').get(callLog2.collaboratorId);
          if (collab2?.ai_copilot_enabled) {
            import('../services/aiCopilot.js').then(({ analyzeCall }) => {
              analyzeCall(existing.id).catch(err => {
                console.error('\x1b[31m[AI COPILOT]\x1b[0m', err.message);
              });
            });
          }
        }
      } catch (copilotErr) {
        console.error('[AI COPILOT HOOK ERR]', copilotErr.message);
      }
    }

    // ── Pipeline Auto + Notification sur événement appel ──
    if (existing && ['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(CallStatus)) {
      try {
        const callLog = db.prepare('SELECT contactId, collaboratorId, companyId, direction, fromNumber, toNumber FROM call_logs WHERE twilioCallSid = ?').get(CallSid);
        if (callLog?.contactId) {
          const isAnswered = CallStatus === 'completed' && parseInt(CallDuration || 0) >= 10;
          const isMissed = ['busy', 'no-answer', 'canceled', 'failed'].includes(CallStatus);
          const event = isAnswered ? 'call_answered' : isMissed ? 'call_missed' : null;

          if (event) {
            const result = autoPipelineAdvance(callLog.contactId, event);
            updateBehaviorScore(callLog.contactId, event);
            // Notification
            const ct = db.prepare('SELECT name, firstname, lastname FROM contacts WHERE id = ?').get(callLog.contactId);
            const ctName = ct?.firstname ? `${ct.firstname} ${ct.lastname || ''}`.trim() : (ct?.name || 'Contact');
            const pipelineNote = result.changed ? ` → Pipeline: ${result.from} → ${result.to}` : (result.reason === 'call_missed_but_rdv_exists' ? ' (Pipeline inchangé : un RDV est déjà programmé)' : '');
            createNotification({
              companyId: callLog.companyId,
              collaboratorId: callLog.collaboratorId,
              type: event,
              title: isAnswered ? `📞 Appel répondu avec ${ctName}` : `📵 Appel manqué avec ${ctName}`,
              detail: (isAnswered ? `Durée: ${CallDuration}s` : `Statut: ${CallStatus}`) + pipelineNote,
              contactId: callLog.contactId,
              contactName: ctName,
            });
          }
        }
      } catch (pipeErr) { console.error('[VOIP PIPELINE AUTO]', pipeErr.message); }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[VOIP STATUS ERR]', err);
    res.json({ success: false });
  }
});

// ─── CALL LOGS CRUD ──────────────────────────────

// POST /api/voip/calls — Create a call log entry (when browser initiates call)
router.post('/calls', requireAuth, enforceCompany, (req, res) => {
  try {
    const { contactId, collaboratorId, toNumber, fromNumber, twilioCallSid, direction: reqDirection } = req.body;
    const companyId = req.auth.companyId;
    const dir = reqDirection === 'inbound' ? 'inbound' : 'outbound';
    const id = 'cl' + Date.now();
    db.prepare(`INSERT INTO call_logs (id, companyId, contactId, collaboratorId, direction, toNumber, fromNumber, status, twilioCallSid, createdAt, startedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'initiated', ?, ?, ?)`)
      .run(id, companyId, contactId || null, collaboratorId || null, dir, cleanPhone(toNumber || fromNumber), fromNumber || null, twilioCallSid || null, new Date().toISOString(), new Date().toISOString());
    // Auto-create/attach to conversation thread
    let convId = null;
    try {
      const clientPh = dir === 'inbound' ? fromNumber : toNumber;
      const bizPh = dir === 'inbound' ? toNumber : fromNumber;
      const conv = getOrCreateConversation({ companyId, collaboratorId, clientPhone: clientPh, businessPhone: bizPh, contactId });
      convId = conv?.id || null;
      addCallEvent({ conversationId: conv.id, companyId, collaboratorId, callLogId: id, type: dir === 'inbound' ? 'call_inbound' : 'call_outbound', clientPhone: clientPh, businessPhone: bizPh, duration: 0, status: 'initiated' });
    } catch (convErr) { console.error('[CONV] Error creating conversation for call:', convErr.message); }
    res.json({ success: true, id, conversationId: convId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/voip/calls/:id — Update call log (notes, pipeline action, duration)
// WHITELISTED columns only — prevents SQL injection via dynamic keys
const ALLOWED_CALL_LOG_FIELDS = ['notes', 'status', 'duration', 'contactId', 'contactName', 'toNumber', 'fromNumber', 'recordingUrl', 'recordingSid', 'tags_json', 'disposition', 'endedAt', 'is_valid_call', 'invalid_reason'];

router.put('/calls/:id', requireAuth, enforceCompany, (req, res) => {
  try {
    // SECURITE: verifier que le call_log appartient a la company + ownership collab
    const callLog = db.prepare('SELECT companyId, collaboratorId FROM call_logs WHERE id = ?').get(req.params.id);
    if (!callLog) return res.status(404).json({ error: 'Appel non trouvé' });
    if (!req.auth.isSupra && callLog.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    if (!req.auth.isAdmin && !req.auth.isSupra && callLog.collaboratorId !== req.auth.collaboratorId) return res.status(403).json({ error: 'Accès interdit — appel d\'un autre collaborateur' });
    const data = { ...req.body };
    delete data.id;
    delete data.companyId; // Never allow changing companyId
    // Filter to whitelisted fields only
    const safeKeys = Object.keys(data).filter(k => ALLOWED_CALL_LOG_FIELDS.includes(k));
    if (safeKeys.length === 0) return res.json({ success: true });
    const sets = safeKeys.map(k => `${k} = ?`).join(',');
    db.prepare(`UPDATE call_logs SET ${sets} WHERE id = ? AND companyId = ?`).run(...safeKeys.map(k => data[k]), req.params.id, req.auth.companyId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/voip/calls?companyId=c1 — All calls for a company
// Admin/Supra: all calls. Member: only own calls + shared with them.
router.get('/calls', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    let calls;
    if (req.auth.isAdmin) {
      calls = db.prepare('SELECT * FROM call_logs WHERE companyId = ? ORDER BY createdAt DESC LIMIT 200').all(companyId);
    } else {
      const collabId = req.auth.collaboratorId;
      calls = db.prepare(
        "SELECT * FROM call_logs WHERE companyId = ? AND (collaboratorId = ? OR shared_with_json LIKE ?) ORDER BY createdAt DESC LIMIT 200"
      ).all(companyId, collabId, `%${collabId}%`);
    }
    res.json(calls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/voip/calls/contact/:contactId — All calls for a specific contact
// Admin/Supra: all calls for contact. Member: only own + shared.
router.get('/calls/contact/:contactId', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId || req.auth.companyId;
    let calls;
    if (req.auth.isAdmin) {
      calls = db.prepare('SELECT * FROM call_logs WHERE contactId = ? AND companyId = ? ORDER BY createdAt DESC').all(req.params.contactId, companyId);
    } else {
      const collabId = req.auth.collaboratorId;
      calls = db.prepare(
        "SELECT * FROM call_logs WHERE contactId = ? AND companyId = ? AND (collaboratorId = ? OR shared_with_json LIKE ?) ORDER BY createdAt DESC"
      ).all(req.params.contactId, companyId, collabId, `%${collabId}%`);
    }
    res.json(calls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/voip/calls/:id/share — Share a recording with other collaborators
router.post('/calls/:id/share', requireAuth, enforceCompany, (req, res) => {
  try {
    const { collaboratorIds } = req.body;
    if (!Array.isArray(collaboratorIds)) return res.status(400).json({ error: 'collaboratorIds must be an array' });
    const callLog = db.prepare('SELECT id, collaboratorId, companyId FROM call_logs WHERE id = ?').get(req.params.id);
    if (!callLog) return res.status(404).json({ error: 'Call not found' });
    // Only the owner or admin can share
    if (!req.auth.isAdmin && callLog.collaboratorId !== req.auth.collaboratorId) {
      return res.status(403).json({ error: 'Seul le propriétaire peut partager cet enregistrement' });
    }
    if (callLog.companyId !== req.auth.companyId && !req.auth.isSupra) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    db.prepare('UPDATE call_logs SET shared_with_json = ? WHERE id = ?')
      .run(JSON.stringify(collaboratorIds), req.params.id);
    res.json({ success: true, shared_with: collaboratorIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── RECORDING PROXY (serve recordings without exposing Twilio URLs) ───

// GET /api/voip/recording/:callLogId — Stream the recording audio
// Ownership check: only owner, shared-with, or admin can access
router.get('/recording/:callLogId', requireAuth, (req, res) => {
  try {
    const callLog = db.prepare('SELECT id, collaboratorId, companyId, recordingUrl, shared_with_json FROM call_logs WHERE id = ?').get(req.params.callLogId);
    if (!callLog || !callLog.recordingUrl) return res.status(404).json({ error: 'Enregistrement non trouvé' });

    // Ownership check
    if (!req.auth.isAdmin && !req.auth.isSupra) {
      if (callLog.collaboratorId !== req.auth.collaboratorId) {
        const shared = JSON.parse(callLog.shared_with_json || '[]');
        if (!shared.includes(req.auth.collaboratorId)) {
          return res.status(403).json({ error: 'Accès interdit' });
        }
      }
      if (callLog.companyId !== req.auth.companyId) {
        return res.status(403).json({ error: 'Accès interdit' });
      }
    }

    // Fetch from Twilio with auth and proxy to client (hide provider URLs)
    const url = callLog.recordingUrl;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const authHeader = accountSid && authToken
      ? 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64')
      : null;

    import('https').then(https => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: authHeader ? { 'Authorization': authHeader } : {},
      };
      const fetchWithRedirect = (opts, depth = 0) => {
        if (depth > 3) { res.status(502).json({ error: 'Trop de redirections' }); return; }
        https.get(opts, (proxyRes) => {
          if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302) {
            const loc = proxyRes.headers.location;
            const rUrl = new URL(loc);
            fetchWithRedirect({ hostname: rUrl.hostname, path: rUrl.pathname + rUrl.search, headers: opts.headers }, depth + 1);
          } else if (proxyRes.statusCode === 200) {
            res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'audio/mpeg');
            res.setHeader('Content-Disposition', `inline; filename="recording-${req.params.callLogId}.mp3"`);
            if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
            proxyRes.pipe(res);
          } else {
            console.error(`[RECORDING PROXY] Provider returned ${proxyRes.statusCode}`);
            res.status(502).json({ error: 'Enregistrement indisponible' });
          }
        }).on('error', (e) => {
          console.error('[RECORDING PROXY] Fetch error:', e.message);
          res.status(502).json({ error: 'Erreur de connexion' });
        });
      };
      fetchWithRedirect(options);
    });
  } catch (err) {
    console.error('[RECORDING PROXY ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── VOIP SETTINGS ──────────────────────────────

// GET /api/voip/settings?companyId=c1
router.get('/settings', requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    const row = db.prepare('SELECT * FROM voip_settings WHERE companyId = ?').get(companyId);
    if (!row) return res.json({ configured: false });
    // Mask auth token for security
    res.json({
      configured: true,
      twilioAccountSid: row.twilioAccountSid || '',
      twilioAuthToken: row.twilioAuthToken ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' + row.twilioAuthToken.slice(-4) : '',
      twilioTwimlAppSid: row.twilioTwimlAppSid || '',
      twilioPhoneNumber: row.twilioPhoneNumber || '',
      recordingEnabled: !!row.recordingEnabled,
      recordingConsent: !!row.recordingConsent,
      voicemailEnabled: !!row.voicemailEnabled,
      voicemailGreeting: row.voicemailGreeting || '',
      active: !!row.active,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/voip/settings
router.put('/settings', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { ...s } = req.body;
    const companyId = req.auth.companyId;
    const existing = db.prepare('SELECT * FROM voip_settings WHERE companyId = ?').get(companyId);
    const merged = {
      twilioAccountSid: s.twilioAccountSid ?? existing?.twilioAccountSid ?? '',
      twilioAuthToken: (s.twilioAuthToken && !s.twilioAuthToken.startsWith('\u2022')) ? s.twilioAuthToken : (existing?.twilioAuthToken ?? ''),
      twilioTwimlAppSid: s.twilioTwimlAppSid ?? existing?.twilioTwimlAppSid ?? '',
      twilioPhoneNumber: s.twilioPhoneNumber ?? existing?.twilioPhoneNumber ?? '',
      recordingEnabled: 'recordingEnabled' in s ? (s.recordingEnabled ? 1 : 0) : (existing?.recordingEnabled ?? 0),
      recordingConsent: 'recordingConsent' in s ? (s.recordingConsent ? 1 : 0) : (existing?.recordingConsent ?? 0),
      voicemailEnabled: 'voicemailEnabled' in s ? (s.voicemailEnabled ? 1 : 0) : (existing?.voicemailEnabled ?? 0),
      voicemailGreeting: s.voicemailGreeting ?? existing?.voicemailGreeting ?? '',
      active: 'active' in s ? (s.active ? 1 : 0) : (existing?.active ?? 1),
    };
    db.prepare(`INSERT OR REPLACE INTO voip_settings (companyId, twilioAccountSid, twilioAuthToken, twilioTwimlAppSid, twilioPhoneNumber, recordingEnabled, recordingConsent, voicemailEnabled, voicemailGreeting, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(companyId, merged.twilioAccountSid, merged.twilioAuthToken, merged.twilioTwimlAppSid, merged.twilioPhoneNumber, merged.recordingEnabled, merged.recordingConsent, merged.voicemailEnabled, merged.voicemailGreeting, merged.active);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── VOIP CREDITS (same pattern as sms.js) ──────

// GET /api/voip/credits?companyId=c1
router.get('/credits', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    const row = db.prepare('SELECT credits FROM voip_credits WHERE companyId = ?').get(companyId);
    res.json({ credits: row ? row.credits : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/voip/recharge
router.post('/recharge', requireSupra, (req, res) => {
  try {
    const { count, amount } = req.body;
    const companyId = req.body.companyId; // supra — doit fournir la company cible
    db.prepare('INSERT INTO voip_credits (companyId, credits) VALUES (?, ?) ON CONFLICT(companyId) DO UPDATE SET credits = credits + ?')
      .run(companyId, count, count);
    const txId = 'vtx' + Date.now();
    db.prepare('INSERT INTO voip_transactions (id, companyId, date, type, count, detail, amount) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(txId, companyId, new Date().toISOString().split('T')[0], 'recharge', count, `Recharge ${count} minutes VoIP`, amount || 0);
    const row = db.prepare('SELECT credits FROM voip_credits WHERE companyId = ?').get(companyId);
    res.json({ success: true, credits: row.credits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/voip/transactions?companyId=c1
router.get('/transactions', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    const rows = db.prepare('SELECT * FROM voip_transactions WHERE companyId = ? ORDER BY date DESC LIMIT 100').all(companyId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CONTACT LOOKUP (for inbound calls) ─────────

// GET /api/voip/lookup?phone=+33612345678&companyId=c1
router.get('/lookup', requireAuth, enforceCompany, (req, res) => {
  try {
    const { phone } = req.query;
    const companyId = req.auth.companyId;
    const clean = cleanPhone(phone);
    const last9 = clean.slice(-9);
    // SECURITE: non-admin ne peut lookup que SES contacts (assignedTo ou shared_with)
    let contact;
    if (req.auth.role === 'admin' || req.auth.isSupra) {
      contact = db.prepare('SELECT * FROM contacts WHERE companyId = ? AND phone LIKE ?').get(companyId, '%' + last9 + '%');
    } else {
      contact = db.prepare("SELECT * FROM contacts WHERE companyId = ? AND phone LIKE ? AND (assignedTo = ? OR shared_with_json LIKE ?)").get(companyId, '%' + last9 + '%', req.auth.collaboratorId, '%' + req.auth.collaboratorId + '%');
    }
    // Retourner uniquement id, name, phone (pas toutes les données)
    const safe = contact ? { id: contact.id, name: contact.name, phone: contact.phone, pipeline_stage: contact.pipeline_stage } : null;
    res.json({ found: !!contact, contact: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── VOIP PACKS (enterprise purchase) ──────────────

// GET /api/voip/packs — List active VoIP packs
router.get('/packs', requireAuth, (req, res) => {
  try {
    const all = req.query.all === '1';
    const packs = all
      ? db.prepare('SELECT * FROM voip_packs ORDER BY price ASC').all()
      : db.prepare('SELECT * FROM voip_packs WHERE active = 1 ORDER BY price ASC').all();
    res.json(packs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/voip/packs — Create a VoIP pack (supra admin)
router.post('/packs', requireSupra, (req, res) => {
  try {
    const { name, minutes, price, description, popular } = req.body;
    if (!name || !minutes || !price) return res.status(400).json({ error: 'name, minutes et price requis' });
    const id = 'vp_' + Date.now();
    db.prepare('INSERT INTO voip_packs (id, name, minutes, price, description, popular, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
      .run(id, name, minutes, price, description || '', popular ? 1 : 0, new Date().toISOString());
    const pack = db.prepare('SELECT * FROM voip_packs WHERE id = ?').get(id);
    console.log(`\x1b[35m[VOIP-PACKS]\x1b[0m Pack créé: ${name} (${minutes}min / ${price}€)`);
    res.json({ success: true, pack });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/voip/packs/:id — Update a VoIP pack
router.put('/packs/:id', requireSupra, (req, res) => {
  try {
    const { name, minutes, price, description, popular, active } = req.body;
    db.prepare('UPDATE voip_packs SET name = ?, minutes = ?, price = ?, description = ?, popular = ?, active = ? WHERE id = ?')
      .run(name, minutes, price, description || '', popular ? 1 : 0, active !== undefined ? (active ? 1 : 0) : 1, req.params.id);
    const pack = db.prepare('SELECT * FROM voip_packs WHERE id = ?').get(req.params.id);
    res.json({ success: true, pack });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/voip/packs/:id — Delete a VoIP pack
router.delete('/packs/:id', requireSupra, (req, res) => {
  try {
    db.prepare('DELETE FROM voip_packs WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/voip/purchase-pack — Enterprise buys a VoIP pack (debits telecom credits)
router.post('/purchase-pack', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { companyId, packId } = req.body;
    if (!companyId || !packId) return res.status(400).json({ error: 'companyId et packId requis' });

    const pack = db.prepare('SELECT * FROM voip_packs WHERE id = ? AND active = 1').get(packId);
    if (!pack) return res.status(404).json({ error: 'Pack non trouvé ou inactif' });

    // Check and debit telecom credits
    const debitResult = debitTelecomCredits(companyId, pack.price, `Achat pack VoIP "${pack.name}" — ${pack.minutes} minutes`);
    if (!debitResult.success) {
      return res.status(400).json({ error: debitResult.error });
    }

    // Add VoIP minutes to wallet
    db.prepare('INSERT INTO voip_credits (companyId, credits) VALUES (?, ?) ON CONFLICT(companyId) DO UPDATE SET credits = credits + ?')
      .run(companyId, pack.minutes, pack.minutes);

    // Log transaction
    const txId = 'vtx' + Date.now();
    db.prepare('INSERT INTO voip_transactions (id, companyId, date, type, count, detail, amount) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(txId, companyId, new Date().toISOString().split('T')[0], 'recharge', pack.minutes,
        `Achat pack "${pack.name}" — ${pack.minutes} minutes`, pack.price);

    const row = db.prepare('SELECT credits FROM voip_credits WHERE companyId = ?').get(companyId);
    console.log(`\x1b[32m[VOIP-PACKS]\x1b[0m ${companyId} a acheté "${pack.name}" (${pack.minutes}min / ${pack.price}€) — solde crédits: ${debitResult.balance.toFixed(2)}€`);
    res.json({ success: true, credits: row.credits, pack, telecomBalance: debitResult.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SSE LIVE STREAM (Real-time transcript + AI analysis) ───

// GET /api/voip/live-stream/:callSid — SSE endpoint for live transcript & coaching
router.get('/live-stream/:callSid', requireAuth, (req, res) => {
  const { callSid } = req.params;

  // SECURITE: vérifier que le call appartient au collab (ou admin)
  const callCheck = db.prepare('SELECT companyId, collaboratorId FROM call_logs WHERE twilioCallSid = ? OR id = ?').get(callSid, callSid);
  if (callCheck) {
    if (!req.auth.isSupra && callCheck.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    if (req.auth.role !== 'admin' && !req.auth.isSupra && callCheck.collaboratorId !== req.auth.collaboratorId) return res.status(403).json({ error: 'Accès interdit — appel d\'un autre collaborateur' });
  }

  // SSE headers — disable ALL proxy buffering (Apache/Nginx/Cloudflare)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',           // Nginx
    'X-Content-Type-Options': 'nosniff', // Prevent proxy content sniffing
  });
  // Disable Node.js response buffering
  res.flushHeaders();

  // Send initial heartbeat
  res.write('event: connected\ndata: {"status":"connected"}\n\n');

  console.log(`\x1b[32m[SSE]\x1b[0m Client connected for live-stream ${callSid}`);

  // Register this client for live updates
  addSSEClient(callSid, res);

  // Replay recent segments (catch up if SSE connected late)
  try {
    const existing = getTranscript(callSid);
    if (existing && existing.segments && existing.segments.length > 0) {
      console.log(`\x1b[32m[SSE]\x1b[0m Replaying ${existing.segments.length} segments for ${callSid}`);
      for (const seg of existing.segments) {
        res.write(`event: transcript\ndata: ${JSON.stringify({ speaker: seg.speaker, text: seg.text, timestamp: seg.timestamp })}\n\n`);
      }
    }
  } catch (e) { console.error('[SSE REPLAY ERR]', e.message); }

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write('event: heartbeat\ndata: {}\n\n'); } catch { clearInterval(heartbeat); }
  }, 30000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    removeSSEClient(callSid, res);
  });
});

// GET /api/voip/transcript/:callLogId — Get saved transcript for a call
// Ownership check: only owner, shared-with, or admin can access
router.get('/transcript/:callLogId', requireAuth, (req, res) => {
  try {
    // Verify ownership + companyId
    if (!req.auth.isSupra) {
      const callLog = db.prepare('SELECT collaboratorId, companyId, shared_with_json FROM call_logs WHERE id = ?').get(req.params.callLogId);
      if (callLog && callLog.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
      if (!req.auth.isAdmin && callLog && callLog.collaboratorId !== req.auth.collaboratorId) {
        const shared = JSON.parse(callLog.shared_with_json || '[]');
        if (!shared.includes(req.auth.collaboratorId)) {
          return res.status(403).json({ error: 'Accès interdit à ce transcript' });
        }
      }
    }
    const transcripts = db.prepare('SELECT * FROM call_transcripts WHERE callLogId = ? ORDER BY source ASC').all(req.params.callLogId);
    if (!transcripts.length) return res.json(null);
    const result = {};
    for (const t of transcripts) {
      try { t.segments = JSON.parse(t.segments_json); } catch { t.segments = []; }
      delete t.segments_json;
      const src = t.source || 'whisper';
      result[src] = t;
    }
    // Backward compat: if only one transcript, return it flat
    if (transcripts.length === 1 && !result.live) return res.json(result.whisper || transcripts[0]);
    // If both exist, return object with both
    res.json({ ...result.whisper, live: result.live || null, _hasLive: !!result.live, _hasWhisper: !!result.whisper });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/voip/save-live-transcript — Save the live (Deepgram) transcript after call ends
router.post('/save-live-transcript', requireAuth, (req, res) => {
  try {
    const { callLogId, segments, fullText } = req.body;
    if (!callLogId || (!segments?.length && !fullText)) return res.status(400).json({ error: 'callLogId + transcript requis' });
    // Check ownership
    const cl = db.prepare('SELECT id, collaboratorId, companyId FROM call_logs WHERE id = ?').get(callLogId);
    if (!cl) return res.status(404).json({ error: 'Appel non trouvé' });
    if (!req.auth.isSupra && cl.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    // Check if live transcript already exists
    const existing = db.prepare("SELECT id FROM call_transcripts WHERE callLogId = ? AND source = 'live'").get(callLogId);
    if (existing) return res.json({ success: true, id: existing.id, existing: true });
    // Save
    const id = 'clt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const segJson = JSON.stringify(segments || []);
    const text = fullText || (segments || []).map(s => `[${s.speaker || '?'}] ${s.text}`).join('\n');
    db.prepare('INSERT INTO call_transcripts (id, callLogId, companyId, collaboratorId, segments_json, fullText, duration, createdAt, source) VALUES (?,?,?,?,?,?,?,?,?)').run(
      id, callLogId, cl.companyId, cl.collaboratorId, segJson, text, 0, new Date().toISOString(), 'live'
    );
    console.log(`[LIVE TRANSCRIPT] Saved for call ${callLogId}: ${(segments||[]).length} segments, ${text.length} chars`);
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/voip/archive-transcript/:callLogId
// Archive a call transcript for AI corpus (thematic conversational AI training).
// Logique déléguée au service transcriptArchive.js (réutilisé par le cron).
// Cette route ne fait que : ownership check → appel service → traduction erreurs.
router.post('/archive-transcript/:callLogId', requireAuth, (req, res) => {
  try {
    const callLogId = req.params.callLogId;

    // Ownership check (spécifique à l'action humaine — le cron s'en passe)
    const callLog = db.prepare('SELECT id, companyId, collaboratorId, shared_with_json FROM call_logs WHERE id = ?').get(callLogId);
    if (!callLog) return res.status(404).json({ error: 'Appel introuvable' });
    if (!req.auth.isSupra && callLog.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'Accès interdit à cet appel' });
    }
    if (!req.auth.isSupra && !req.auth.isAdmin && callLog.collaboratorId !== req.auth.collaboratorId) {
      let shared = [];
      try { shared = JSON.parse(callLog.shared_with_json || '[]'); } catch {}
      if (!shared.includes(req.auth.collaboratorId)) {
        return res.status(403).json({ error: 'Accès interdit à cet appel' });
      }
    }

    // Action humaine → force=true (ignore les filtres status/duration, incrémente downloadCount si déjà archivé)
    const result = archiveCallTranscript(callLogId, { force: true });

    if (!result.ok) {
      const map = {
        not_found: [404, 'Appel introuvable'],
        no_transcript: [404, 'Aucune transcription disponible pour cet appel'],
        empty_transcript: [404, 'Transcription vide pour cet appel'],
      };
      const [code, msg] = map[result.reason] || [500, 'Erreur d\'archivage'];
      return res.status(code).json({ error: msg });
    }

    res.json({
      success: true,
      archiveId: result.archiveId,
      filename: result.filename,
      text: result.text,
      segments: result.segments,
      hasLive: result.hasLive,
      hasAudio: result.hasAudio,
      reused: result.reused,
    });
  } catch (err) {
    console.error('[ARCHIVE TRANSCRIPT ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/voip/transcribe/:callLogId — Transcribe an existing recording via Deepgram
router.post('/transcribe/:callLogId', requireAuth, (req, res) => {
  try {
    const callLog = db.prepare('SELECT id, collaboratorId, companyId, recordingUrl FROM call_logs WHERE id = ?').get(req.params.callLogId);
    if (!callLog || !callLog.recordingUrl) return res.status(404).json({ error: 'Enregistrement non trouvé' });
    // SECURITE: verifier que le call_log appartient a la company du user
    if (!req.auth.isSupra && callLog.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    // SECURITE: non-admin ne peut transcrire que ses propres appels
    if (!req.auth.isAdmin && !req.auth.isSupra && callLog.collaboratorId !== req.auth.collaboratorId) return res.status(403).json({ error: 'Accès interdit — appel d\'un autre collaborateur' });

    // Check if transcript already exists
    const existing = db.prepare('SELECT id FROM call_transcripts WHERE callLogId = ?').get(callLog.id);
    if (existing) return res.json({ success: true, exists: true, message: 'Transcription déjà disponible' });

    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey) return res.status(500).json({ error: 'Clé Deepgram non configurée' });

    // Send recording URL to Deepgram pre-recorded API
    const audioUrl = callLog.recordingUrl;
    // Twilio needs auth to fetch the recording
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;

    // First download the audio, then send to Deepgram
    import('https').then(https => {
      const urlObj = new URL(audioUrl);
      const authHeader = twilioSid && twilioToken
        ? 'Basic ' + Buffer.from(twilioSid + ':' + twilioToken).toString('base64')
        : null;

      const fetchAudio = (opts, depth = 0) => {
        if (depth > 3) { res.status(502).json({ error: 'Trop de redirections' }); return; }
        https.get(opts, (audioRes) => {
          if (audioRes.statusCode === 301 || audioRes.statusCode === 302) {
            const loc = new URL(audioRes.headers.location);
            fetchAudio({ hostname: loc.hostname, path: loc.pathname + loc.search, headers: opts.headers }, depth + 1);
            return;
          }
          if (audioRes.statusCode !== 200) {
            console.error(`[TRANSCRIBE] Audio fetch failed: ${audioRes.statusCode}`);
            res.status(502).json({ error: 'Impossible de récupérer l\'audio' });
            return;
          }
          const chunks = [];
          audioRes.on('data', c => chunks.push(c));
          audioRes.on('end', () => {
            const audioBuffer = Buffer.concat(chunks);
            console.log(`\x1b[35m[TRANSCRIBE]\x1b[0m Audio fetched: ${audioBuffer.length} bytes for ${callLog.id}`);

            // Send to Deepgram pre-recorded API
            const dgBody = audioBuffer;
            const dgReq = https.request({
              hostname: 'api.deepgram.com',
              path: '/v1/listen?model=nova-2&language=fr&smart_format=true&punctuate=true&diarize=true&utterances=true',
              method: 'POST',
              headers: {
                'Authorization': 'Token ' + deepgramKey,
                'Content-Type': 'audio/mpeg',
                'Content-Length': dgBody.length,
              },
            }, (dgRes) => {
              let dgData = '';
              dgRes.on('data', c => dgData += c);
              dgRes.on('end', () => {
                try {
                  const result = JSON.parse(dgData);
                  if (dgRes.statusCode !== 200) {
                    console.error(`[TRANSCRIBE] Deepgram error ${dgRes.statusCode}:`, dgData.substring(0, 200));
                    res.status(502).json({ error: 'Erreur Deepgram: ' + (result.err_msg || dgRes.statusCode) });
                    return;
                  }

                  // Extract segments from utterances or words
                  const utterances = result.results?.utterances || [];
                  const fullText = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
                  const segments = utterances.length > 0
                    ? utterances.map(u => ({
                        speaker: u.speaker === 0 ? 'collab' : 'contact',
                        text: u.transcript,
                        timestamp: Math.round(u.start * 1000),
                        confidence: u.confidence,
                      }))
                    : fullText ? [{ speaker: 'collab', text: fullText, timestamp: 0 }] : [];

                  // Save to call_transcripts
                  const id = 'ct_' + Date.now() + Math.random().toString(36).slice(2, 5);
                  db.prepare(
                    'INSERT INTO call_transcripts (id, callLogId, companyId, collaboratorId, segments_json, fullText, duration, createdAt) VALUES (?,?,?,?,?,?,?,?)'
                  ).run(id, callLog.id, callLog.companyId, callLog.collaboratorId, JSON.stringify(segments), fullText, 0, new Date().toISOString());

                  console.log(`\x1b[32m[TRANSCRIBE]\x1b[0m Saved transcript for ${callLog.id}: ${segments.length} segments, ${fullText.length} chars`);

                  // ── AUTO-DETECT forbidden words in transcript ──
                  try {
                    // analyzeTranscription imported at top of file
                    // Merge company-wide + collaborator-specific forbidden words
                    const companyRow = db.prepare('SELECT forbidden_words_json FROM companies WHERE id = ?').get(callLog.companyId);
                    const collabRow = db.prepare('SELECT secure_ia_words_json, secure_ia_phone FROM collaborators WHERE id = ?').get(callLog.collaboratorId);
                    const companyWords = JSON.parse(companyRow?.forbidden_words_json || '[]');
                    const collabWords = JSON.parse(collabRow?.secure_ia_words_json || '[]');
                    const allForbidden = [...new Set([...companyWords, ...collabWords])].filter(w => w && w.trim());

                    if (allForbidden.length > 0 && fullText) {
                      const analysis = analyzeTranscription(fullText, allForbidden);
                      if (analysis.detected) {
                        // Check dedup
                        const existingAlert = db.prepare('SELECT id FROM secure_ia_alerts WHERE callLogId = ?').get(callLog.id);
                        if (!existingAlert) {
                          const alertId = 'sia_' + Date.now() + Math.random().toString(36).slice(2, 5);
                          const cl2 = db.prepare('SELECT toNumber, contactId FROM call_logs WHERE id = ?').get(callLog.id);
                          const contact = cl2?.contactId ? db.prepare('SELECT name, phone FROM contacts WHERE id = ?').get(cl2.contactId) : null;
                          db.prepare('INSERT INTO secure_ia_alerts (id, companyId, collaboratorId, callLogId, detectedWords_json, transcription, callDate, callDuration, contactName, contactPhone, severity, reviewed, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?)')
                            .run(alertId, callLog.companyId, callLog.collaboratorId, callLog.id, JSON.stringify(analysis.words), fullText, new Date().toISOString(), 0, contact?.name || '', contact?.phone || cl2?.toNumber || '', analysis.severity, new Date().toISOString());
                          console.log(`\x1b[31m[SIGNALEMENT]\x1b[0m ${analysis.totalViolations} mots interdits détectés pour ${callLog.id} (${analysis.severity})`);
                        }
                      }
                    }
                  } catch (siaErr) { console.error('[SIGNALEMENT AUTO]', siaErr.message); }

                  res.json({ success: true, id, segments, fullText });
                } catch (e) {
                  console.error('[TRANSCRIBE] Parse error:', e.message);
                  res.status(500).json({ error: 'Erreur de parsing' });
                }
              });
            });
            dgReq.on('error', (e) => {
              console.error('[TRANSCRIBE] Deepgram request error:', e.message);
              res.status(502).json({ error: 'Erreur connexion Deepgram' });
            });
            dgReq.write(dgBody);
            dgReq.end();
          });
        }).on('error', (e) => {
          console.error('[TRANSCRIBE] Audio fetch error:', e.message);
          res.status(502).json({ error: 'Erreur de connexion audio' });
        });
      };

      fetchAudio({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: authHeader ? { 'Authorization': authHeader } : {},
      });
    });
  } catch (err) {
    console.error('[TRANSCRIBE ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/voip/transcribe-all — Transcribe all recordings that don't have transcripts yet
router.post('/transcribe-all', requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId || req.body.companyId || req.auth.companyId;
    const pending = db.prepare(
      "SELECT cl.id FROM call_logs cl LEFT JOIN call_transcripts ct ON ct.callLogId = cl.id WHERE cl.companyId = ? AND cl.recordingUrl IS NOT NULL AND cl.recordingUrl != '' AND ct.id IS NULL"
    ).all(companyId);
    res.json({ success: true, pending: pending.length, ids: pending.map(p => p.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LIVE FLAGS (real-time forbidden word detection) ───

// GET /api/voip/live-flags/:callSid — Get live flags for a specific call
router.get('/live-flags/:callSid', requireAuth, (req, res) => {
  try {
    // SECURITE: filtrer par companyId pour empecher l'acces cross-company
    const flags = db.prepare('SELECT * FROM call_live_flags WHERE callSid = ? AND companyId = ? ORDER BY created_at DESC').all(req.params.callSid, req.auth.companyId);
    res.json(flags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/voip/live-flags/collab/:collaboratorId — Get live flags for a collaborator
router.get('/live-flags/collab/:collaboratorId', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { companyId } = req.query;
    const flags = db.prepare('SELECT * FROM call_live_flags WHERE companyId = ? AND collaboratorId = ? ORDER BY created_at DESC LIMIT 100').all(companyId, req.params.collaboratorId);
    res.json(flags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
