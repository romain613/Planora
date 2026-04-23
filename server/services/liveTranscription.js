/**
 * Live Transcription Service — Calendar360
 * Pipeline: Twilio Media Stream → Deepgram STT → Real-time transcript
 * Manages active transcription sessions per callSid
 */

import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { db } from '../db/database.js';

// Read API key lazily (after dotenv loads in index.js)
const getDeepgramKey = () => process.env.DEEPGRAM_API_KEY || '';

// Active transcription sessions: callSid → session data
const activeSessions = new Map();

// ─── RECONNECTION CONFIG ───
const MAX_RECONNECT_RETRIES = 3;
const BASE_RECONNECT_DELAY_MS = 2000; // 2s, 4s, 8s (exponential backoff)

// ─── NORMALIZE TEXT (accent-insensitive, lowercase) ───
function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// ─── LOAD FORBIDDEN WORDS for a collaborator ───
function loadForbiddenWords(collaboratorId) {
  try {
    const collab = db.prepare('SELECT secure_ia_phone, secure_ia_words_json FROM collaborators WHERE id = ?').get(collaboratorId);
    if (!collab?.secure_ia_phone) return [];
    return JSON.parse(collab.secure_ia_words_json || '[]');
  } catch { return []; }
}

// SSE clients waiting for updates: callSid → Set<response>
const sseClients = new Map();

/**
 * Start a new transcription session for a call
 */
export function startSession(callSid, { collaboratorId, companyId, contactId, direction }) {
  if (activeSessions.has(callSid)) return activeSessions.get(callSid);

  const session = {
    callSid,
    collaboratorId,
    companyId,
    contactId,
    direction,
    startTime: Date.now(),
    segments: [],        // { speaker: 'collab'|'contact', text, timestamp, isFinal }
    fullTranscript: '',
    deepgramConnection: null,      // outbound (collab voice)
    deepgramConnectionInbound: null, // inbound (contact voice)
    lastAnalysis: null,
    analysisInterval: null,
    _closing: false,
    _reconnectAttempts: 0,
    _forbiddenWords: loadForbiddenWords(collaboratorId),
    _lastFlaggedWords: {},  // word → timestamp (debounce: skip same word within 10s)
  };

  activeSessions.set(callSid, session);
  console.log(`\x1b[36m[LIVE TRANSCRIPTION]\x1b[0m Session started for ${callSid}`);
  return session;
}

/**
 * Connect Deepgram for a session and start streaming audio
 */
export function connectDeepgram(callSid) {
  const session = activeSessions.get(callSid);
  if (!session) return null;

  if (!getDeepgramKey()) {
    console.warn('\x1b[33m[LIVE TRANSCRIPTION]\x1b[0m No DEEPGRAM_API_KEY — using demo mode');
    return null;
  }

  // Create TWO separate Deepgram connections: one per speaker track
  // This gives perfect speaker separation since Twilio sends separate inbound/outbound tracks
  const createConnection = (trackName, speakerLabel) => {
    try {
      const deepgram = createClient(getDeepgramKey());
      const connection = deepgram.listen.live({
        model: 'nova-2',
        language: 'fr',
        smart_format: true,
        interim_results: true,
        utterance_end_ms: 1500,
        vad_events: true,
        encoding: 'mulaw',
        sample_rate: 8000,
        channels: 1,
        punctuate: true,
      });

      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log(`\x1b[32m[LIVE TRANSCRIPTION]\x1b[0m Deepgram ${trackName} connected for ${callSid}`);
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (!transcript) return;

        const isFinal = data.is_final;
        const segment = {
          speaker: speakerLabel,
          text: transcript,
          timestamp: Date.now() - session.startTime,
          isFinal,
        };

        if (isFinal) {
          session.segments.push(segment);
          session.fullTranscript += (session.fullTranscript ? '\n' : '') +
            `${speakerLabel === 'collab' ? 'Collaborateur' : 'Interlocuteur'}: ${transcript}`;

          broadcastToSSE(callSid, 'transcript', {
            speaker: speakerLabel,
            text: transcript,
            timestamp: segment.timestamp,
          });

          console.log(`\x1b[36m[LIVE TRANSCRIPTION]\x1b[0m [${speakerLabel}] ${transcript.slice(0, 80)}`);

          // Forbidden words check (only on collab's speech)
          if (speakerLabel === 'collab' && session._forbiddenWords?.length > 0) {
            const normalizedText = normalize(transcript);
            const now = Date.now();
            for (const fw of session._forbiddenWords) {
              const normalizedFw = normalize(fw);
              if (normalizedFw && normalizedText.includes(normalizedFw)) {
                const lastFlagged = session._lastFlaggedWords?.[normalizedFw] || 0;
                if (now - lastFlagged < 10000) continue;
                session._lastFlaggedWords[normalizedFw] = now;
                const flagId = 'clf_' + Date.now() + Math.random().toString(36).slice(2, 5);
                try {
                  db.prepare('INSERT INTO call_live_flags (id, companyId, collaboratorId, callSid, flag_type, word_detected, segment_text, timestamp_ms, severity, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
                    .run(flagId, session.companyId, session.collaboratorId, callSid,
                      'forbidden_word', fw, transcript.slice(0, 500), segment.timestamp, 'high',
                      new Date().toISOString());
                } catch (dbErr) {
                  console.error(`\x1b[31m[LIVE FORBIDDEN DB]\x1b[0m ${dbErr.message}`);
                }
                broadcastToSSE(callSid, 'forbidden_word', {
                  word: fw, text: transcript.slice(0, 200), timestamp: segment.timestamp, flagId, severity: 'high'
                });
                console.log(`\x1b[31m[LIVE FORBIDDEN]\x1b[0m ${session.collaboratorId} said "${fw}" in call ${callSid}`);
              }
            }
          }
        } else {
          broadcastToSSE(callSid, 'interim', {
            speaker: speakerLabel,
            text: transcript,
          });
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (err) => {
        console.error(`\x1b[31m[LIVE TRANSCRIPTION ERR ${trackName}]\x1b[0m ${err.message || err}`);
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log(`\x1b[33m[LIVE TRANSCRIPTION]\x1b[0m Deepgram ${trackName} closed for ${callSid}`);
      });

      return connection;
    } catch (err) {
      console.error(`\x1b[31m[LIVE TRANSCRIPTION ERR]\x1b[0m Failed to connect Deepgram ${trackName}:`, err.message);
      return null;
    }
  };

  // Outbound track = collab's voice (the browser/caller)
  session.deepgramConnection = createConnection('outbound', 'collab');
  // Inbound track = contact's voice (the remote party)
  session.deepgramConnectionInbound = createConnection('inbound', 'contact');

  return session.deepgramConnection;
}

/**
 * Send audio data to Deepgram for a session
 */
export function sendAudio(callSid, audioPayload, track) {
  const session = activeSessions.get(callSid);
  if (!session) return;

  // Track which speaker is talking (Twilio sends separate tracks)
  session._currentTrack = track || 'inbound';
  // Count audio chunks per track for diagnostics
  if (!session._trackCounts) session._trackCounts = { inbound: 0, outbound: 0 };
  session._trackCounts[track || 'inbound'] = (session._trackCounts[track || 'inbound'] || 0) + 1;
  if ((session._trackCounts.inbound + session._trackCounts.outbound) % 200 === 0) {
    console.log(`\x1b[36m[AUDIO TRACKS]\x1b[0m ${callSid} — inbound: ${session._trackCounts.inbound}, outbound: ${session._trackCounts.outbound}`);
  }

  // Route audio to the correct Deepgram connection based on track
  const conn = (track === 'outbound') ? session.deepgramConnection : session.deepgramConnectionInbound;
  if (conn) {
    try {
      const audioBuffer = Buffer.from(audioPayload, 'base64');
      conn.send(audioBuffer);
    } catch (err) {
      // Silently ignore send errors during cleanup
    }
  }
}

/**
 * End a transcription session
 */
export function endSession(callSid) {
  const session = activeSessions.get(callSid);
  if (!session) return null;

  // Mark as closing to prevent Deepgram auto-reconnect
  session._closing = true;

  // Stop periodic analysis
  if (session.analysisInterval) {
    clearInterval(session.analysisInterval);
    session.analysisInterval = null;
  }

  // Close both Deepgram connections (outbound + inbound)
  if (session.deepgramConnection) {
    try { session.deepgramConnection.finish?.() || session.deepgramConnection.close?.(); } catch {}
  }
  if (session.deepgramConnectionInbound) {
    try { session.deepgramConnectionInbound.finish?.() || session.deepgramConnectionInbound.close?.(); } catch {}
  }

  // Close all SSE clients for this call
  const clients = sseClients.get(callSid);
  if (clients) {
    for (const res of clients) {
      try { res.write('event: end\ndata: {}\n\n'); res.end(); } catch {}
    }
    sseClients.delete(callSid);
  }

  const result = {
    callSid,
    collaboratorId: session.collaboratorId,
    companyId: session.companyId,
    contactId: session.contactId,
    segments: session.segments,
    fullTranscript: session.fullTranscript,
    duration: Math.round((Date.now() - session.startTime) / 1000),
  };

  activeSessions.delete(callSid);
  console.log(`\x1b[32m[LIVE TRANSCRIPTION]\x1b[0m Session ended for ${callSid} — ${session.segments.length} segments, ${result.duration}s`);

  return result;
}

/**
 * Get current transcript for a session
 */
export function getTranscript(callSid) {
  const session = activeSessions.get(callSid);
  if (!session) return null;
  return {
    segments: session.segments,
    fullTranscript: session.fullTranscript,
    duration: Math.round((Date.now() - session.startTime) / 1000),
  };
}

/**
 * Get session info
 */
export function getSession(callSid) {
  return activeSessions.get(callSid) || null;
}

/**
 * Get all active sessions
 */
export function getActiveSessions() {
  return Array.from(activeSessions.entries()).map(([sid, s]) => ({
    callSid: sid,
    collaboratorId: s.collaboratorId,
    segmentCount: s.segments.length,
    duration: Math.round((Date.now() - s.startTime) / 1000),
  }));
}

// ─── SSE Management ───

/**
 * Register an SSE client for a call
 */
export function addSSEClient(callSid, res) {
  if (!sseClients.has(callSid)) sseClients.set(callSid, new Set());
  sseClients.get(callSid).add(res);

  // Send existing transcript to the new client
  const session = activeSessions.get(callSid);
  if (session) {
    for (const seg of session.segments) {
      res.write(`event: transcript\ndata: ${JSON.stringify({ speaker: seg.speaker, text: seg.text, timestamp: seg.timestamp })}\n\n`);
    }
    if (session.lastAnalysis) {
      res.write(`event: analysis\ndata: ${JSON.stringify(session.lastAnalysis)}\n\n`);
    }
  }
}

/**
 * Remove an SSE client
 */
export function removeSSEClient(callSid, res) {
  const clients = sseClients.get(callSid);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) sseClients.delete(callSid);
  }
}

/**
 * Broadcast an event to all SSE clients for a call
 */
export function broadcastToSSE(callSid, event, data) {
  const clients = sseClients.get(callSid);
  if (!clients || clients.size === 0) {
    if (event === 'transcript') console.log(`\x1b[33m[SSE BROADCAST]\x1b[0m No SSE clients for ${callSid} — ${sseClients.size} total sessions`);
    return;
  }

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let sent = 0;
  for (const res of clients) {
    try { res.write(message); if (res.flush) res.flush(); sent++; } catch {
      clients.delete(res);
    }
  }
  if (event === 'transcript') console.log(`\x1b[32m[SSE BROADCAST]\x1b[0m Sent "${event}" to ${sent}/${clients.size} clients for ${callSid}`);
}
