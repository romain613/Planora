/**
 * Twilio VoIP Service for Calendar360
 * Handles access token generation, TwiML generation, and call management
 * Pattern: identical to brevoSms.js — async exports, demo mode, colored logs
 *
 * ═══════════════════════════════════════════════════════
 * FRENCH REGULATORY COMPLIANCE (ARCEP / CNIL / DGCCRF)
 * ═══════════════════════════════════════════════════════
 * - Calling hours: Mon-Fri 10h-13h & 14h-20h (décret n°2022-1313)
 * - Recording: dual consent required (CNIL/RGPD Art.6 + Art.13)
 * - Caller ID: must be valid, recallable number (ARCEP L.44)
 * - Bloctel: commercial calls must check do-not-call registry
 * - Frequency: max 4 calls / consumer / 30 days
 * ═══════════════════════════════════════════════════════
 */

import twilio from 'twilio';
const { jwt: { AccessToken }, twiml: { VoiceResponse } } = twilio;
const VoiceGrant = AccessToken.VoiceGrant;

/**
 * ── FRENCH CALLING HOURS ENFORCEMENT ──
 * Décret n°2022-1313 du 13 octobre 2022 :
 * Démarchage téléphonique autorisé UNIQUEMENT :
 *   Lundi → Vendredi : 10h00-13h00 et 14h00-20h00
 *   Samedi, Dimanche, Jours fériés : INTERDIT
 *
 * Returns { allowed, reason } — server-side enforcement
 */
export function checkCallingHours() {
  const now = new Date();
  // Convert to Paris timezone
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const day = paris.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const hour = paris.getHours();
  const minute = paris.getMinutes();
  const timeDecimal = hour + minute / 60;

  // Weekend check
  if (day === 0 || day === 6) {
    return { allowed: false, reason: 'Appels commerciaux interdits le week-end (décret n°2022-1313)' };
  }

  // Morning slot: 10:00 - 13:00
  const inMorning = timeDecimal >= 10 && timeDecimal < 13;
  // Afternoon slot: 14:00 - 20:00
  const inAfternoon = timeDecimal >= 14 && timeDecimal < 20;

  if (!inMorning && !inAfternoon) {
    return {
      allowed: false,
      reason: `Appels commerciaux autorisés uniquement 10h-13h et 14h-20h en semaine (actuellement ${hour}h${String(minute).padStart(2, '0')} heure de Paris)`
    };
  }

  return { allowed: true };
}

/**
 * Get VoIP settings for a company from DB
 */
export function getVoipSettings(db, companyId) {
  const row = db.prepare('SELECT * FROM voip_settings WHERE companyId = ? AND active = 1').get(companyId);
  if (!row) return null;
  return row;
}

/**
 * Generate a Twilio Access Token for the browser Client SDK
 * Short-lived (1 hour) token with Voice grant
 */
export function generateAccessToken({ accountSid, twimlAppSid, identity }) {
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;

  if (!accountSid || !apiKey || !apiSecret || accountSid === 'your-twilio-account-sid') {
    console.log(`\x1b[33m[VOIP DEMO]\x1b[0m Token requested for ${identity} (no credentials)`);
    return { success: true, demo: true, token: 'demo-token-' + Date.now(), identity };
  }

  try {
    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity,
      ttl: 3600, // 1 hour
    });

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    });
    token.addGrant(voiceGrant);

    console.log(`\x1b[32m[VOIP TOKEN]\x1b[0m Generated for ${identity}`);
    return { success: true, token: token.toJwt(), identity };
  } catch (err) {
    console.error(`\x1b[31m[VOIP TOKEN ERR]\x1b[0m ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Generate TwiML for outbound call (browser -> phone)
 * Called by Twilio when the TwiML App receives a call from the browser
 */
export function generateOutboundTwiml({ to, callerId, recordingEnabled, recordingConsent, streamUrl, streamParams, recordingCallbackUrl, amdEnabled, amdCallbackUrl }) {
  const response = new VoiceResponse();

  // ── FRENCH REGULATORY COMPLIANCE ──
  const shouldRecord = recordingEnabled && recordingConsent;

  if (shouldRecord) {
    response.say({ voice: 'alice', language: 'fr-FR' },
      'Cet appel peut être enregistré à des fins de qualité et de formation. Si vous ne souhaitez pas être enregistré, veuillez raccrocher et rappeler.');
  }

  // Start live transcription stream directly in TwiML (if AI Copilot enabled)
  if (streamUrl) {
    const start = response.start();
    const stream = start.stream({ url: streamUrl, track: 'both_tracks', name: 'live-transcription' });
    if (streamParams) {
      Object.entries(streamParams).forEach(([key, value]) => {
        stream.parameter({ name: key, value: String(value) });
      });
    }
    console.log(`\x1b[32m[VOIP TWIML]\x1b[0m Stream added: ${streamUrl}`);
  }

  const dialOpts = {
    callerId,
    record: shouldRecord ? 'record-from-answer-dual' : 'do-not-record',
  };
  // Recording callback
  if (shouldRecord && recordingCallbackUrl) {
    dialOpts.recordingStatusCallback = recordingCallbackUrl;
    dialOpts.recordingStatusCallbackEvent = 'completed';
    dialOpts.recordingStatusCallbackMethod = 'POST';
  }
  // AMD: action callback so we can handle voicemail detection
  if (amdEnabled && amdCallbackUrl) {
    dialOpts.action = amdCallbackUrl;
    dialOpts.method = 'POST';
  }

  // AMD: machineDetection on the <Number> element
  const dial = response.dial(dialOpts);
  if (amdEnabled) {
    dial.number({ machineDetection: 'DetectMessageEnd', machineDetectionTimeout: 5 }, to);
    console.log(`\x1b[32m[VOIP TWIML]\x1b[0m AMD ENABLED for ${to}`);
  } else {
    dial.number(to);
  }

  console.log(`\x1b[32m[VOIP TWIML]\x1b[0m Outbound → ${to} (caller: ${callerId}, recording: ${shouldRecord}, amd: ${!!amdEnabled})`);
  return response.toString();
}

/**
 * Generate TwiML for voicemail drop (plays audio message then hangs up)
 */
export function generateVoicemailDropTwiml({ audioUrl, textMessage }) {
  const response = new VoiceResponse();
  if (audioUrl) {
    response.play(audioUrl);
  } else if (textMessage) {
    response.say({ voice: 'alice', language: 'fr-FR' }, textMessage);
  } else {
    response.say({ voice: 'alice', language: 'fr-FR' },
      "Bonjour, j'ai essayé de vous joindre. N'hésitez pas à me rappeler. Merci.");
  }
  response.hangup();
  return response.toString();
}

/**
 * Generate TwiML for inbound call (phone -> browser)
 * Called by Twilio when someone calls the Twilio phone number
 */
export function generateInboundTwiml({ clientIdentity, recordingEnabled, recordingConsent, streamUrl, streamParams, recordingCallbackUrl }) {
  const response = new VoiceResponse();

  // ── FRENCH REGULATORY COMPLIANCE ──
  // Inbound calls: consent message played to caller before recording
  const shouldRecord = recordingEnabled && recordingConsent;

  if (shouldRecord) {
    response.say({ voice: 'alice', language: 'fr-FR' },
      'Cet appel peut être enregistré à des fins de qualité.');
  }

  // Start live transcription stream directly in TwiML (if AI Copilot enabled)
  if (streamUrl) {
    const start = response.start();
    const stream = start.stream({ url: streamUrl, track: 'both_tracks', name: 'live-transcription' });
    if (streamParams) {
      Object.entries(streamParams).forEach(([key, value]) => {
        stream.parameter({ name: key, value: String(value) });
      });
    }
    console.log(`\x1b[32m[VOIP TWIML]\x1b[0m Inbound stream added: ${streamUrl}`);
  }

  const dialOpts = {
    record: shouldRecord ? 'record-from-answer-dual' : 'do-not-record',
  };
  if (shouldRecord && recordingCallbackUrl) {
    dialOpts.recordingStatusCallback = recordingCallbackUrl;
    dialOpts.recordingStatusCallbackEvent = 'completed';
    dialOpts.recordingStatusCallbackMethod = 'POST';
  }
  const dial = response.dial(dialOpts);
  dial.client(clientIdentity);

  console.log(`\x1b[32m[VOIP TWIML]\x1b[0m Inbound → client:${clientIdentity} (recording: ${shouldRecord})`);
  return response.toString();
}

/**
 * Look up a Twilio call by SID to get final duration/status
 */
export async function fetchCallDetails({ accountSid, authToken, callSid }) {
  if (!accountSid || accountSid === 'your-twilio-account-sid') {
    console.log(`\x1b[33m[VOIP DEMO]\x1b[0m Fetch call details for ${callSid}`);
    return { success: true, demo: true, duration: 120, status: 'completed' };
  }

  try {
    const client = twilio(accountSid, authToken);
    const call = await client.calls(callSid).fetch();
    console.log(`\x1b[32m[VOIP CALL]\x1b[0m ${callSid} \u2192 ${call.status} (${call.duration}s)`);
    return {
      success: true,
      status: call.status,
      duration: parseInt(call.duration) || 0,
      startTime: call.startTime,
      endTime: call.endTime,
      price: call.price,
    };
  } catch (err) {
    console.error(`\x1b[31m[VOIP CALL ERR]\x1b[0m ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Clean phone number to international format
 * Reuses pattern from brevoSms.js
 */
export function cleanPhone(phone) {
  let clean = (phone || '').replace(/[^\d+]/g, '');
  // 06XXXXXXXX or 07XXXXXXXX (10 digits starting with 0)
  if (clean.startsWith('0') && clean.length === 10) {
    clean = '+33' + clean.substring(1);
  }
  // 6XXXXXXXX or 7XXXXXXXX (9 digits — missing leading 0, French mobile)
  if (!clean.startsWith('+') && !clean.startsWith('0') && clean.length === 9 && (clean.startsWith('6') || clean.startsWith('7') || clean.startsWith('1') || clean.startsWith('2') || clean.startsWith('3') || clean.startsWith('4') || clean.startsWith('5') || clean.startsWith('8') || clean.startsWith('9'))) {
    clean = '+33' + clean;
  }
  // 33XXXXXXXXX without +
  if (clean.startsWith('33') && !clean.startsWith('+') && clean.length >= 11) {
    clean = '+' + clean;
  }
  return clean;
}

/**
 * ── SMS COMPLIANCE CHECKS ──
 * France SMS regulations (ARCEP + AF2M Code of Conduct):
 * - No URL shorteners (bit.ly, tiny.url, etc.) — strictly forbidden
 * - Marketing SMS: 8h-22h working days only
 * - Must support STOP keyword for opt-out
 * - Must include sender identification
 */
export function validateSmsContent(content) {
  const warnings = [];

  // Check for forbidden URL shorteners
  const shortenerPattern = /\b(bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|bl\.ink|short\.io|cutt\.ly)\b/i;
  if (shortenerPattern.test(content)) {
    warnings.push({
      level: 'error',
      code: 'URL_SHORTENER_FORBIDDEN',
      message: 'Les raccourcisseurs d\'URL (bit.ly, tinyurl, etc.) sont strictement interdits en France et peuvent entraîner des amendes opérateur.'
    });
  }

  // Check for STOP mention in marketing messages
  if (content.length > 0 && !/(STOP|stop|Arrêt|ARRÊT|désinscrire|désinscription)/i.test(content)) {
    warnings.push({
      level: 'warning',
      code: 'MISSING_STOP',
      message: 'Les SMS marketing doivent inclure une mention STOP pour le désabonnement (ex: "STOP au XXXXX").'
    });
  }

  return warnings;
}

/**
 * Check SMS sending hours (France)
 * Marketing SMS: 8h-22h on working days only
 */
export function checkSmsHours() {
  const now = new Date();
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const day = paris.getDay();
  const hour = paris.getHours();

  if (day === 0) {
    return { allowed: false, reason: 'SMS marketing interdit le dimanche' };
  }
  if (hour < 8 || hour >= 22) {
    return { allowed: false, reason: 'SMS marketing autorisé uniquement entre 8h et 22h' };
  }
  return { allowed: true };
}
