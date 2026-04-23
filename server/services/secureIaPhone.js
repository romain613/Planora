/**
 * Secure IA Phone Service for Calendar360
 * AI-powered forbidden words detection in collaborator phone calls
 *
 * Pipeline: Twilio Recording → Download MP3 → Whisper Transcription → Word Analysis → Alert
 *
 * Uses OpenAI Whisper API for French transcription (~$0.006/min)
 * Accent-insensitive and case-insensitive matching
 */

import { db } from '../db/database.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ─── NORMALIZE TEXT (remove accents, lowercase) ───
function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// ─── TRANSCRIBE CALL via Whisper API ───
export async function transcribeCall(recordingUrl, accountSid, authToken) {
  if (!OPENAI_API_KEY) {
    console.log('\x1b[33m[SECURE IA]\x1b[0m No OPENAI_API_KEY — skipping transcription');
    return { success: false, error: 'No API key', demo: true };
  }

  try {
    // 1. Download recording from Twilio (requires Basic auth)
    const audioUrl = recordingUrl.endsWith('.mp3') ? recordingUrl : recordingUrl + '.mp3';
    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    console.log(`\x1b[35m[SECURE IA]\x1b[0m Downloading recording: ${audioUrl.slice(0, 80)}...`);

    const audioRes = await fetch(audioUrl, {
      headers: { 'Authorization': authHeader },
      redirect: 'follow',
    });

    if (!audioRes.ok) {
      throw new Error(`Twilio download failed: ${audioRes.status} ${audioRes.statusText}`);
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    console.log(`\x1b[35m[SECURE IA]\x1b[0m Downloaded ${(audioBuffer.length / 1024).toFixed(0)}KB audio`);

    // 2. Send to OpenAI Whisper API
    const boundary = '----SecureIA' + Date.now();
    const formParts = [];

    // file field
    formParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="call.mp3"\r\n` +
      `Content-Type: audio/mpeg\r\n\r\n`
    );
    formParts.push(audioBuffer);
    formParts.push('\r\n');

    // model field
    formParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-1\r\n`
    );

    // language field (optimize for French)
    formParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `fr\r\n`
    );

    // response_format field
    formParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `verbose_json\r\n`
    );

    formParts.push(`--${boundary}--\r\n`);

    // Build the body as a single Buffer
    const bodyParts = formParts.map(p => typeof p === 'string' ? Buffer.from(p) : p);
    const body = Buffer.concat(bodyParts);

    console.log(`\x1b[35m[SECURE IA]\x1b[0m Sending to Whisper API...`);

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      throw new Error(`Whisper API error: ${whisperRes.status} — ${errText.slice(0, 200)}`);
    }

    const result = await whisperRes.json();
    console.log(`\x1b[32m[SECURE IA]\x1b[0m Transcription OK — ${result.text?.length || 0} chars, ${(result.duration || 0).toFixed(0)}s`);

    return {
      success: true,
      transcription: result.text || '',
      duration: result.duration || 0,
      segments: result.segments || [],
    };

  } catch (err) {
    console.error('\x1b[31m[SECURE IA TRANSCRIBE ERR]\x1b[0m', err.message);
    return { success: false, error: err.message };
  }
}

// ─── ANALYZE TRANSCRIPTION for forbidden words ───
export function analyzeTranscription(transcription, forbiddenWords) {
  if (!transcription || !forbiddenWords || forbiddenWords.length === 0) {
    return { detected: false, words: [], severity: 'none', totalViolations: 0 };
  }

  const normalizedText = normalize(transcription);
  const words = [];
  let totalViolations = 0;

  for (const forbidden of forbiddenWords) {
    const normalizedForbidden = normalize(forbidden);
    if (!normalizedForbidden) continue;

    // Find all occurrences
    let count = 0;
    const positions = [];
    let searchFrom = 0;

    while (true) {
      const idx = normalizedText.indexOf(normalizedForbidden, searchFrom);
      if (idx === -1) break;
      count++;
      positions.push(idx);
      searchFrom = idx + 1;
    }

    if (count > 0) {
      words.push({ word: forbidden, count, positions });
      totalViolations += count;
    }
  }

  // Severity based on total violations
  let severity = 'none';
  if (totalViolations >= 6) severity = 'high';
  else if (totalViolations >= 3) severity = 'medium';
  else if (totalViolations >= 1) severity = 'low';

  return {
    detected: totalViolations > 0,
    words,
    severity,
    totalViolations,
  };
}

// ─── MAIN PIPELINE: Process a call for Secure IA ───
export async function processCallForSecureIa(callLogId) {
  try {
    // 1. Load call log
    const callLog = db.prepare('SELECT * FROM call_logs WHERE id = ?').get(callLogId);
    if (!callLog) {
      console.log(`\x1b[33m[SECURE IA]\x1b[0m Call log ${callLogId} not found`);
      return { success: false, error: 'Call log not found' };
    }

    if (!callLog.recordingUrl) {
      console.log(`\x1b[33m[SECURE IA]\x1b[0m No recording for call ${callLogId}`);
      return { success: false, error: 'No recording URL' };
    }

    // ── DEDUPLICATION: Skip if already analyzed ──
    const existingAlert = db.prepare('SELECT id FROM secure_ia_alerts WHERE callLogId = ?').get(callLogId);
    if (existingAlert) {
      console.log(`\x1b[33m[SECURE IA]\x1b[0m Call ${callLogId} already analyzed — skipping (alert ${existingAlert.id})`);
      return { success: true, skipped: true, existingAlertId: existingAlert.id };
    }

    // 2. Load collaborator
    const collab = db.prepare('SELECT * FROM collaborators WHERE id = ?').get(callLog.collaboratorId);
    if (!collab || !collab.secure_ia_phone) {
      return { success: false, error: 'Collaborator not found or Secure IA not enabled' };
    }

    // Parse forbidden words
    let forbiddenWords = [];
    try { forbiddenWords = JSON.parse(collab.secure_ia_words_json || '[]'); } catch {}
    if (!forbiddenWords.length) {
      console.log(`\x1b[33m[SECURE IA]\x1b[0m No forbidden words configured for ${collab.name}`);
      return { success: false, error: 'No forbidden words configured' };
    }

    // 3. Get Twilio credentials
    // Try marketplace credentials first (from env), then per-company settings
    let accountSid = process.env.TWILIO_ACCOUNT_SID;
    let authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      const voipSettings = db.prepare('SELECT twilioAccountSid, twilioAuthToken FROM voip_settings WHERE companyId = ?').get(callLog.companyId);
      if (voipSettings) {
        accountSid = voipSettings.twilioAccountSid;
        authToken = voipSettings.twilioAuthToken;
      }
    }

    if (!accountSid || !authToken) {
      return { success: false, error: 'No Twilio credentials available' };
    }

    // 4. Transcribe (with 10s delay for Twilio to make recording available)
    await new Promise(r => setTimeout(r, 10000));

    const transcriptionResult = await transcribeCall(callLog.recordingUrl, accountSid, authToken);
    if (!transcriptionResult.success) {
      return { success: false, error: `Transcription failed: ${transcriptionResult.error}` };
    }

    // 5. Analyze
    const analysis = analyzeTranscription(transcriptionResult.transcription, forbiddenWords);

    console.log(`\x1b[35m[SECURE IA]\x1b[0m Analysis for ${collab.name}: ${analysis.totalViolations} violations (${analysis.severity})`);

    // 6. Store alert (even if no violations, so we track analyzed calls)
    const alertId = 'sia' + Date.now() + Math.random().toString(36).slice(2, 5);

    // Get contact info if available
    let contactName = callLog.contactName || '';
    let contactPhone = callLog.direction === 'outbound' ? callLog.toNumber : callLog.fromNumber;
    if (!contactName && callLog.contactId) {
      const contact = db.prepare('SELECT name FROM contacts WHERE id = ?').get(callLog.contactId);
      if (contact) contactName = contact.name;
    }

    if (analysis.detected) {
      db.prepare(`INSERT INTO secure_ia_alerts (id, companyId, collaboratorId, callLogId, detectedWords_json, transcription, callDate, callDuration, contactName, contactPhone, severity, reviewed, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`).run(
        alertId,
        callLog.companyId,
        callLog.collaboratorId,
        callLogId,
        JSON.stringify(analysis.words),
        transcriptionResult.transcription,
        callLog.startedAt || callLog.createdAt || new Date().toISOString(),
        callLog.duration || 0,
        contactName,
        contactPhone || '',
        analysis.severity,
        new Date().toISOString()
      );

      console.log(`\x1b[31m[SECURE IA ALERT]\x1b[0m ${collab.name} — ${analysis.totalViolations} mots interdits détectés (${analysis.words.map(w => w.word).join(', ')})`);
    }

    return {
      success: true,
      detected: analysis.detected,
      violations: analysis.totalViolations,
      severity: analysis.severity,
      alertId: analysis.detected ? alertId : null,
    };

  } catch (err) {
    console.error('\x1b[31m[SECURE IA PIPELINE ERR]\x1b[0m', err.message);
    return { success: false, error: err.message };
  }
}

// ─── GENERATE REPORT for a period ───
export function generateReport(companyId, collaboratorId, period, periodDate) {
  try {
    // Determine date range
    let dateFrom, dateTo;
    const d = new Date(periodDate);

    if (period === 'day') {
      dateFrom = periodDate;
      dateTo = periodDate;
    } else if (period === 'week') {
      // Monday to Sunday
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      dateFrom = monday.toISOString().split('T')[0];
      dateTo = sunday.toISOString().split('T')[0];
    } else if (period === 'month') {
      dateFrom = periodDate.slice(0, 7) + '-01';
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      dateTo = lastDay.toISOString().split('T')[0];
    }

    // Count total calls for this collaborator in the period
    const totalCalls = db.prepare(
      `SELECT COUNT(*) as cnt FROM call_logs WHERE collaboratorId = ? AND date(startedAt) >= ? AND date(startedAt) <= ?`
    ).get(collaboratorId, dateFrom, dateTo)?.cnt || 0;

    // Get alerts in this period
    const alerts = db.prepare(
      `SELECT * FROM secure_ia_alerts WHERE collaboratorId = ? AND date(callDate) >= ? AND date(callDate) <= ?`
    ).all(collaboratorId, dateFrom, dateTo);

    const analyzedCalls = alerts.length;
    const flaggedCalls = alerts.filter(a => a.severity !== 'none').length;

    // Aggregate word breakdown
    const wordMap = {};
    for (const alert of alerts) {
      let words = [];
      try { words = JSON.parse(alert.detectedWords_json || '[]'); } catch {}
      for (const w of words) {
        if (!wordMap[w.word]) wordMap[w.word] = { word: w.word, totalCount: 0, calls: 0 };
        wordMap[w.word].totalCount += w.count;
        wordMap[w.word].calls += 1;
      }
    }
    const wordBreakdown = Object.values(wordMap).sort((a, b) => b.totalCount - a.totalCount);

    // Build summary
    const collabName = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(collaboratorId)?.name || 'Inconnu';
    const periodLabel = period === 'day' ? periodDate : period === 'week' ? `Semaine du ${dateFrom}` : `Mois ${periodDate.slice(0, 7)}`;
    const summary = flaggedCalls > 0
      ? `${collabName} — ${periodLabel} : ${flaggedCalls} appel(s) avec mots interdits sur ${analyzedCalls} analysé(s). Top: ${wordBreakdown.slice(0, 3).map(w => `"${w.word}" (${w.totalCount}x)`).join(', ')}`
      : `${collabName} — ${periodLabel} : Aucune violation détectée sur ${analyzedCalls} appel(s) analysé(s).`;

    // Check if report already exists for this period
    const existing = db.prepare(
      'SELECT id FROM secure_ia_reports WHERE collaboratorId = ? AND period = ? AND periodDate = ?'
    ).get(collaboratorId, period, periodDate);

    if (existing) {
      // Update existing report
      db.prepare(`UPDATE secure_ia_reports SET totalCalls = ?, analyzedCalls = ?, flaggedCalls = ?, wordBreakdown_json = ?, summary = ? WHERE id = ?`)
        .run(totalCalls, analyzedCalls, flaggedCalls, JSON.stringify(wordBreakdown), summary, existing.id);
      return { success: true, id: existing.id, updated: true };
    }

    // Insert new report
    const reportId = 'sir' + Date.now() + Math.random().toString(36).slice(2, 5);
    db.prepare(`INSERT INTO secure_ia_reports (id, companyId, collaboratorId, period, periodDate, totalCalls, analyzedCalls, flaggedCalls, wordBreakdown_json, summary, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      reportId, companyId, collaboratorId, period, periodDate,
      totalCalls, analyzedCalls, flaggedCalls,
      JSON.stringify(wordBreakdown), summary,
      new Date().toISOString()
    );

    console.log(`\x1b[35m[SECURE IA REPORT]\x1b[0m ${period} report for ${collabName}: ${flaggedCalls}/${analyzedCalls} flagged`);
    return { success: true, id: reportId, updated: false };

  } catch (err) {
    console.error('\x1b[31m[SECURE IA REPORT ERR]\x1b[0m', err.message);
    return { success: false, error: err.message };
  }
}
