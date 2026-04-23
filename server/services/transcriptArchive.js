// server/services/transcriptArchive.js
// ─────────────────────────────────────────────────────────────────
// Service d'archivage de transcription d'appel pour le corpus IA.
// Logique pure, sans dépendance Express. Réutilisée par :
//   1. La route POST /api/voip/archive-transcript/:callLogId (action humaine)
//   2. Le cron server/cron/transcriptArchive.js (auto-archive)
//
// Contrat :
//   archiveCallTranscript(callLogId, { force = false }) →
//     { ok: true, archiveId, filename, text, segments, hasLive, hasAudio, reused }
//     | { ok: false, reason: 'not_found'|'no_transcript'|'empty_transcript'|'too_short'|'not_completed', detail? }
//
// NOTE : aucune vérification d'ownership ici. La route doit faire le check
// avant d'appeler. Le cron s'en fiche (batch supra-level).
// ─────────────────────────────────────────────────────────────────

import { db } from '../db/database.js';

const MIN_DURATION_SECONDS = 20;

/**
 * Formate une durée en secondes en "m ss s".
 */
function formatDuration(s) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m${String(sec).padStart(2, '0')}s`;
}

/**
 * Convertit les segments d'une transcription en texte lisible.
 */
function segmentsToText(tr) {
  if (!tr) return '';
  const segs = tr._segments || [];
  if (segs.length > 0) {
    return segs.map(s => {
      const who = (s.speaker === 'agent' || s.speaker === 'collab' || s.speaker === 'me') ? 'VOUS     ' : 'CONTACT  ';
      return `${who}: ${s.text}`;
    }).join('\n');
  }
  return tr.fullText || '';
}

/**
 * Construit le texte formaté complet (header + segments).
 */
function buildFormattedText({ archiveId, contact, call, company, liveTr, audioTr, hasLive, hasAudio }) {
  const dt = new Date(call.createdAt || Date.now());

  let txt = '═══════════════════════════════════════════════════\n';
  txt += '         TRANSCRIPTION D\'APPEL — CALENDAR360\n';
  txt += '═══════════════════════════════════════════════════\n\n';
  txt += `Archive ID : ${archiveId}\n`;
  txt += `\n── CONTACT ──\n`;
  txt += `Nom         : ${contact.name}\n`;
  txt += `Téléphone   : ${contact.phone || '—'}\n`;
  if (contact.email) txt += `Email       : ${contact.email}\n`;
  txt += `Type        : ${contact.type === 'btb' ? 'Entreprise (B2B)' : 'Particulier (B2C)'}\n`;
  if (contact.company) txt += `Entreprise  : ${contact.company}\n`;
  if (contact.siret) txt += `SIRET       : ${contact.siret}\n`;
  if (contact.sector) txt += `Source      : ${contact.sector}\n`;
  txt += `\n── APPEL ──\n`;
  txt += `Sens        : ${call.direction === 'outbound' ? 'Sortant' : 'Entrant'}\n`;
  txt += `Date        : ${dt.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}\n`;
  txt += `Durée       : ${formatDuration(call.duration)}\n`;
  txt += `Statut      : ${call.status || 'completed'}\n`;
  if (company?.name) txt += `Société     : ${company.name}\n`;
  txt += `\n───────────────────────────────────────────────────\n`;

  if (hasLive) {
    txt += '\n  ━━━ TRANSCRIPTION LIVE (Deepgram) ━━━\n\n';
    txt += segmentsToText(liveTr) + '\n';
  }
  if (hasAudio) {
    txt += '\n  ━━━ TRANSCRIPTION AUDIO (Whisper) ━━━\n\n';
    txt += segmentsToText(audioTr) + '\n';
  }

  txt += '\n═══════════════════════════════════════════════════\n';
  txt += `Généré par Calendar360 · ${new Date().toLocaleString('fr-FR')}\n`;
  txt += `Archive ID  : ${archiveId}\n`;
  txt += '═══════════════════════════════════════════════════\n';

  return txt;
}

/**
 * Génère un archiveId unique : YYYYMMDD-HHMM-<last9phone>-<shortId>
 */
function generateArchiveId(callCreatedAt, contactPhone) {
  const dt = new Date(callCreatedAt || Date.now());
  const yyyymmdd = dt.toISOString().slice(0, 10).replace(/-/g, '');
  const hhmm = dt.toTimeString().slice(0, 5).replace(':', '');
  const last9 = (contactPhone || '').replace(/[^\d]/g, '').slice(-9) || 'nonum';
  const shortId = Math.random().toString(36).slice(2, 8);
  return `${yyyymmdd}-${hhmm}-${last9}-${shortId}`;
}

/**
 * Construit le filename de téléchargement pour cet archive.
 */
function buildFilename(contactName, callCreatedAt, contactPhone) {
  const dt = new Date(callCreatedAt || Date.now());
  const yyyymmdd = dt.toISOString().slice(0, 10).replace(/-/g, '');
  const last9 = (contactPhone || '').replace(/[^\d]/g, '').slice(-9) || 'nonum';
  const slug = (contactName || 'appel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'appel';
  return `transcription-${slug}-${yyyymmdd}-${last9}.txt`;
}

/**
 * Archive une transcription d'appel.
 *
 * @param {string} callLogId
 * @param {object} [opts]
 * @param {boolean} [opts.force=false] — si true, incrémente downloadCount même si déjà archivé
 * @returns {{ok:true, archiveId, filename, text, segments, hasLive, hasAudio, reused}
 *           | {ok:false, reason, detail?}}
 */
export function archiveCallTranscript(callLogId, opts = {}) {
  const force = !!opts.force;

  // 1. Fetch call_log
  const callLog = db.prepare('SELECT * FROM call_logs WHERE id = ?').get(callLogId);
  if (!callLog) return { ok: false, reason: 'not_found' };

  // 2. Skip si appel non complété (cron seulement — la route peut forcer)
  const status = (callLog.status || '').toLowerCase();
  if (!force && status !== 'completed') {
    return { ok: false, reason: 'not_completed', detail: status };
  }

  // 3. Skip si trop court (cron — le bruit n'apporte rien au corpus)
  const duration = callLog.duration || 0;
  if (!force && duration < MIN_DURATION_SECONDS) {
    return { ok: false, reason: 'too_short', detail: `${duration}s` };
  }

  // 4. Fetch transcripts (live + audio)
  const transcripts = db.prepare('SELECT * FROM call_transcripts WHERE callLogId = ?').all(callLogId);
  if (!transcripts.length) {
    return { ok: false, reason: 'no_transcript' };
  }
  let liveTr = null, audioTr = null;
  for (const t of transcripts) {
    try { t._segments = JSON.parse(t.segments_json || '[]'); } catch { t._segments = []; }
    if ((t.source || '') === 'live') liveTr = t;
    else audioTr = t;
  }
  const hasLive = !!(liveTr && (liveTr._segments.length > 0 || liveTr.fullText));
  const hasAudio = !!(audioTr && (audioTr._segments.length > 0 || audioTr.fullText));
  if (!hasLive && !hasAudio) {
    return { ok: false, reason: 'empty_transcript' };
  }

  // 5. Fetch contact + company
  const phoneRaw = callLog.direction === 'outbound' ? callLog.toNumber : callLog.fromNumber;
  let contact = null;
  if (callLog.contactId) {
    contact = db.prepare('SELECT id, name, firstName, lastName, email, phone, mobile, company, contact_type, siret, source FROM contacts WHERE id = ?').get(callLog.contactId);
  }
  if (!contact && phoneRaw) {
    const last9 = (phoneRaw || '').replace(/[^\d]/g, '').slice(-9);
    if (last9.length >= 9) {
      contact = db.prepare("SELECT id, name, firstName, lastName, email, phone, mobile, company, contact_type, siret, source FROM contacts WHERE companyId = ? AND (REPLACE(REPLACE(REPLACE(phone,' ',''),'.',''),'-','') LIKE ? OR REPLACE(REPLACE(REPLACE(mobile,' ',''),'.',''),'-','') LIKE ?) LIMIT 1").get(callLog.companyId, '%' + last9, '%' + last9);
    }
  }
  const company = db.prepare('SELECT name, slug FROM companies WHERE id = ?').get(callLog.companyId);

  const contactNorm = {
    name: contact?.name || [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || 'Inconnu',
    phone: contact?.phone || contact?.mobile || phoneRaw || '',
    email: contact?.email || '',
    company: contact?.company || '',
    type: (contact?.contact_type || 'btc').toLowerCase(),
    siret: contact?.siret || '',
    sector: contact?.source || '',
  };

  const callNorm = {
    createdAt: callLog.createdAt,
    duration: callLog.duration,
    direction: callLog.direction,
    status: callLog.status,
  };

  // 6. Generate id + filename
  const archiveId = generateArchiveId(callLog.createdAt, contactNorm.phone);
  const filename = buildFilename(contactNorm.name, callLog.createdAt, contactNorm.phone);

  // 7. Build formatted text
  const txt = buildFormattedText({
    archiveId,
    contact: contactNorm,
    call: callNorm,
    company,
    liveTr,
    audioTr,
    hasLive,
    hasAudio,
  });

  // 8. Merged segments for AI corpus
  const mergedSegments = [];
  if (liveTr?._segments?.length) liveTr._segments.forEach(s => mergedSegments.push({ ...s, source: 'live' }));
  if (audioTr?._segments?.length) audioTr._segments.forEach(s => mergedSegments.push({ ...s, source: 'whisper' }));

  // 9. Dedup par callLogId
  const existing = db.prepare('SELECT id FROM call_transcript_archive WHERE callLogId = ?').get(callLogId);
  const nowIso = new Date().toISOString();

  if (existing) {
    if (force) {
      db.prepare('UPDATE call_transcript_archive SET downloadCount = COALESCE(downloadCount, 0) + 1, lastAccessedAt = ? WHERE id = ?').run(nowIso, existing.id);
    }
    return {
      ok: true,
      archiveId: existing.id,
      filename,
      text: txt,
      segments: mergedSegments,
      hasLive,
      hasAudio,
      reused: true,
    };
  }

  // 10. INSERT new archive
  db.prepare(`INSERT INTO call_transcript_archive
    (id, callLogId, companyId, collaboratorId, contactId, contactName, contactPhone, contactEmail,
     contactCompany, contactType, contactSiret, contactSector,
     callDirection, callDate, callDuration, callStatus,
     hasLive, hasAudio, transcriptText, segmentsJson, thematics_json,
     sentimentScore, aiSummary, downloadCount, lastAccessedAt, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    archiveId, callLogId, callLog.companyId, callLog.collaboratorId || null, contact?.id || null,
    contactNorm.name, contactNorm.phone, contactNorm.email,
    contactNorm.company, contactNorm.type, contactNorm.siret, contactNorm.sector,
    callLog.direction || '', callLog.createdAt || nowIso, callLog.duration || 0, callLog.status || '',
    hasLive ? 1 : 0, hasAudio ? 1 : 0, txt, JSON.stringify(mergedSegments), '[]',
    0, '', force ? 1 : 0, force ? nowIso : '', nowIso
  );

  console.log(`[TRANSCRIPT ARCHIVE] ${archiveId} — ${contactNorm.name} (${callLog.direction}, ${formatDuration(callLog.duration)})`);

  return {
    ok: true,
    archiveId,
    filename,
    text: txt,
    segments: mergedSegments,
    hasLive,
    hasAudio,
    reused: false,
  };
}

/**
 * Liste les callLogs éligibles à l'auto-archivage.
 * Utilisé par le cron transcriptArchive.js.
 *
 * Critères :
 *   - status = completed
 *   - duration >= MIN_DURATION_SECONDS
 *   - a au moins un call_transcripts non vide
 *   - pas encore dans call_transcript_archive
 *
 * @param {number} [limit=100]
 * @returns {Array<{id:string, companyId:string, collaboratorId:string, duration:number}>}
 */
export function findCallLogsEligibleForArchive(limit = 100) {
  const rows = db.prepare(`
    SELECT cl.id, cl.companyId, cl.collaboratorId, cl.duration, cl.createdAt
    FROM call_logs cl
    INNER JOIN call_transcripts ct ON ct.callLogId = cl.id
    LEFT JOIN call_transcript_archive cta ON cta.callLogId = cl.id
    WHERE cta.id IS NULL
      AND LOWER(COALESCE(cl.status, '')) = 'completed'
      AND COALESCE(cl.duration, 0) >= ?
    GROUP BY cl.id
    ORDER BY cl.createdAt DESC
    LIMIT ?
  `).all(MIN_DURATION_SECONDS, limit);
  return rows;
}

export { MIN_DURATION_SECONDS };
