import { Router } from 'express';
import { db } from '../db/database.js';
import { cleanPhone } from '../services/twilioVoip.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';
import { sendSms } from '../services/brevoSms.js';
import { sendTwilioSms } from '../services/twilioSms.js';

const router = Router();

// ═══════════════════════════════════════════════════
// CONVERSATIONS — Ringover-style threaded phone conversations
// Security: strict isolation by companyId + collaboratorId + role
// ═══════════════════════════════════════════════════

/**
 * Get or create a conversation thread for a client phone number.
 * Conversation key = companyId:collaboratorId:last9digits
 * This ensures strict isolation between companies and collaborators.
 */
export function getOrCreateConversation({ companyId, collaboratorId, clientPhone, businessPhone, contactId }) {
  const clean = cleanPhone(clientPhone);
  const last9 = clean.slice(-9);
  const key = `${companyId}:${collaboratorId || 'company'}:${last9}`;

  let conv = db.prepare('SELECT * FROM conversations WHERE conversationKey = ?').get(key);
  if (conv) return conv;

  const id = 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();

  // Auto-match contact by phone if not provided
  if (!contactId) {
    const ct = db.prepare("SELECT id FROM contacts WHERE companyId = ? AND phone LIKE ?")
      .get(companyId, '%' + last9 + '%');
    contactId = ct?.id || null;
  }

  db.prepare(`INSERT INTO conversations (id, companyId, collaboratorId, clientPhone, businessPhone, contactId, conversationKey, visibilityMode, lastActivityAt, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'individual', ?, 'open', ?)`)
    .run(id, companyId, collaboratorId || null, clean, businessPhone || null, contactId, key, now, now);

  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

/**
 * Add a call event to a conversation
 */
export function addCallEvent({ conversationId, companyId, collaboratorId, callLogId, type, clientPhone, businessPhone, duration, recordingUrl, status }) {
  const id = 'ce_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();
  const durationStr = duration ? `${Math.floor(duration / 60)}min${String(duration % 60).padStart(2, '0')}s` : '';
  const typeLabel = type === 'call_outbound' ? 'Appel sortant' : type === 'call_inbound' ? 'Appel entrant' : 'Appel manqué';
  const preview = durationStr ? `${typeLabel} · ${durationStr}` : typeLabel;

  db.prepare(`INSERT INTO conversation_events (id, conversationId, companyId, collaboratorId, type, callLogId, clientPhone, businessPhone, duration, recordingUrl, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, conversationId, companyId, collaboratorId || null, type, callLogId || null, cleanPhone(clientPhone || ''), businessPhone || null, duration || 0, recordingUrl || null, status || 'completed', now);

  // Update conversation last activity
  db.prepare(`UPDATE conversations SET lastActivityAt = ?, lastEventType = ?, lastEventPreview = ? WHERE id = ?`)
    .run(now, type, preview, conversationId);

  return id;
}

/**
 * Add an SMS event to a conversation
 */
export function addSmsEvent({ conversationId, companyId, collaboratorId, clientPhone, businessPhone, content, direction, smsMessageId }) {
  const id = 'ce_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();
  const preview = direction === 'outbound' ? `SMS envoyé · ${(content || '').slice(0, 40)}...` : `SMS reçu · ${(content || '').slice(0, 40)}...`;
  const type = direction === 'outbound' ? 'sms_out' : 'sms_in';

  db.prepare(`INSERT INTO conversation_events (id, conversationId, companyId, collaboratorId, type, clientPhone, businessPhone, content, status, metadata_json, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)`)
    .run(id, conversationId, companyId, collaboratorId || null, type, cleanPhone(clientPhone || ''), businessPhone || null, content, smsMessageId ? JSON.stringify({ smsMessageId }) : '{}', now);

  db.prepare(`UPDATE conversations SET lastActivityAt = ?, lastEventType = ?, lastEventPreview = ? WHERE id = ?`)
    .run(now, type, preview, conversationId);

  return id;
}

/**
 * Security helper: check if user can access a conversation
 */
function canAccessConversation(conv, auth) {
  if (auth.isSupra) return true;
  if (conv.companyId !== auth.companyId) return false;
  if (auth.isAdmin) return true; // Admin sees all company conversations
  // Member: only their own conversations
  return conv.collaboratorId === auth.collaboratorId;
}

// ─── POST /api/conversations — Create or find existing conversation ────────
router.post('/', requireAuth, (req, res) => {
  try {
    const { companyId, collaboratorId, clientPhone, clientName } = req.body;
    const cid = companyId || req.auth.companyId;
    if (!clientPhone) return res.status(400).json({ error: 'clientPhone requis' });

    const cleanedPhone = clientPhone.replace(/[^\d+]/g, '');
    const last9 = cleanedPhone.slice(-9);

    // Find existing conversation for this phone + collaborator
    const collabId = collaboratorId || req.auth.collaboratorId;
    const existing = db.prepare(`
      SELECT * FROM conversations
      WHERE companyId = ? AND collaboratorId = ? AND clientPhone LIKE ?
      ORDER BY lastActivityAt DESC LIMIT 1
    `).get(cid, collabId, '%' + last9);

    if (existing) return res.json(existing);

    // Create new conversation
    const id = 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const now = new Date().toISOString();
    const convKey = `${cid}_${collabId}_${last9}`;
    db.prepare(`INSERT INTO conversations (id, companyId, collaboratorId, clientPhone, conversationKey, status, createdAt, lastActivityAt)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`).run(
      id, cid, collabId, cleanedPhone, convKey, now, now
    );
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    res.json(conv);
  } catch (err) {
    console.error('[CONV CREATE ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/conversations — List conversations ────────
router.get('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId, limit = '50', offset = '0', status, search } = req.query;
    const cid = companyId || req.auth.companyId;
    let query, params;

    if (req.auth.isSupra) {
      // Supra sees all
      query = 'SELECT * FROM conversations WHERE companyId = ?';
      params = [cid];
    } else if (req.auth.isAdmin) {
      // Admin sees all company conversations
      query = 'SELECT * FROM conversations WHERE companyId = ?';
      params = [cid];
    } else {
      // Member sees only their own
      query = 'SELECT * FROM conversations WHERE companyId = ? AND collaboratorId = ?';
      params = [cid, req.auth.collaboratorId];
    }

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (clientPhone LIKE ? OR contactId IN (SELECT id FROM contacts WHERE name LIKE ?))';
      params.push('%' + search + '%', '%' + search + '%');
    }

    query += ' ORDER BY lastActivityAt DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const conversations = db.prepare(query).all(...params);

    // Enrich with contact names
    const enriched = conversations.map(conv => {
      let contactName = null;
      if (conv.contactId) {
        const ct = db.prepare('SELECT name, email, phone, pipeline_stage FROM contacts WHERE id = ?').get(conv.contactId);
        if (ct) contactName = ct.name;
        conv.contact = ct || null;
      }
      conv.contactName = contactName;
      return conv;
    });

    res.json(enriched);
  } catch (err) {
    console.error('[CONVERSATIONS]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/conversations/sms-history/:phone — SMS history for a phone ────
// MUST be before /:id to avoid Express matching 'sms-history' as :id
router.get('/sms-history/:phone', requireAuth, (req, res) => {
  try {
    const phone = req.params.phone.replace(/[^\d+]/g, '');
    const companyId = req.auth.companyId;
    const last9 = phone.slice(-9);
    // SECURITE: non-admin ne voit que SES SMS
    let messages;
    if (req.auth.role === 'admin' || req.auth.isSupra) {
      messages = db.prepare(`
        SELECT id, direction, content, status, createdAt, fromNumber, toNumber, collaboratorId
        FROM sms_messages
        WHERE companyId = ? AND (toNumber LIKE ? OR fromNumber LIKE ?)
        ORDER BY createdAt DESC LIMIT 50
      `).all(companyId, '%' + last9, '%' + last9);
    } else {
      messages = db.prepare(`
        SELECT id, direction, content, status, createdAt, fromNumber, toNumber, collaboratorId
        FROM sms_messages
        WHERE companyId = ? AND collaboratorId = ? AND (toNumber LIKE ? OR fromNumber LIKE ?)
        ORDER BY createdAt DESC LIMIT 50
      `).all(companyId, req.auth.collaboratorId, '%' + last9, '%' + last9);
    }
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/conversations/poll — Conversations modifiées depuis timestamp ────
router.get('/poll', requireAuth, enforceCompany, (req, res) => {
  try {
    const { since } = req.query;
    if (!since) return res.status(400).json({ error: 'since timestamp requis' });
    const companyId = req.auth.companyId;

    let conversations;
    if (req.auth.role === 'admin' || req.auth.isSupra) {
      conversations = db.prepare('SELECT * FROM conversations WHERE companyId = ? AND lastActivityAt > ? ORDER BY lastActivityAt DESC LIMIT 50').all(companyId, since);
    } else {
      conversations = db.prepare('SELECT * FROM conversations WHERE companyId = ? AND collaboratorId = ? AND lastActivityAt > ? ORDER BY lastActivityAt DESC LIMIT 50').all(companyId, req.auth.collaboratorId, since);
    }

    // Enrichir avec nom du contact
    for (const c of conversations) {
      if (c.contactId) {
        const ct = db.prepare('SELECT name FROM contacts WHERE id = ?').get(c.contactId);
        if (ct) c.contactName = ct.name;
      }
    }

    // Total unread
    let totalUnread = 0;
    if (req.auth.role === 'admin' || req.auth.isSupra) {
      totalUnread = db.prepare('SELECT SUM(unreadCount) as total FROM conversations WHERE companyId = ? AND unreadCount > 0').get(companyId)?.total || 0;
    } else {
      totalUnread = db.prepare('SELECT SUM(unreadCount) as total FROM conversations WHERE companyId = ? AND collaboratorId = ? AND unreadCount > 0').get(companyId, req.auth.collaboratorId)?.total || 0;
    }

    res.json({ conversations, totalUnread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/conversations/:id/read — Marquer comme lu ────
router.put('/:id/read', requireAuth, (req, res) => {
  try {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation non trouvée' });
    if (!canAccessConversation(conv, req.auth)) return res.status(403).json({ error: 'Accès interdit' });
    db.prepare('UPDATE conversations SET unreadCount = 0 WHERE id = ?').run(conv.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/conversations/:id — Get conversation with events ────
router.get('/:id', requireAuth, (req, res) => {
  try {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (!canAccessConversation(conv, req.auth)) return res.status(403).json({ error: 'Access denied' });

    // Get contact details
    if (conv.contactId) {
      conv.contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(conv.contactId);
    }

    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/conversations/:id/events — Get conversation events ────
router.get('/:id/events', requireAuth, (req, res) => {
  try {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (!canAccessConversation(conv, req.auth)) return res.status(403).json({ error: 'Access denied' });

    const { limit = '100', offset = '0' } = req.query;
    const events = db.prepare(
      'SELECT * FROM conversation_events WHERE conversationId = ? ORDER BY createdAt ASC LIMIT ? OFFSET ?'
    ).all(req.params.id, parseInt(limit), parseInt(offset));

    // Enrich call events with AI analysis data + call log details
    const enriched = events.map(ev => {
      if (ev.callLogId) {
        const analysis = db.prepare('SELECT summary, transcription, sentimentScore, qualityScore, conversionScore, objections_json, actionItems_json, coachingTips_json, followupType, followupDate, pipelineStage, tags_json FROM ai_copilot_analyses WHERE callLogId = ?').get(ev.callLogId);
        if (analysis) {
          ev.transcription = ev.transcription || analysis.transcription;
          ev.aiSummary = ev.aiSummary || analysis.summary;
          ev.sentimentScore = analysis.sentimentScore;
          ev.qualityScore = analysis.qualityScore;
          ev.conversionScore = analysis.conversionScore;
          try { ev.objections = JSON.parse(analysis.objections_json || '[]'); } catch { ev.objections = []; }
          try { ev.actionItems = JSON.parse(analysis.actionItems_json || '[]'); } catch { ev.actionItems = []; }
          try { ev.coachingTips = JSON.parse(analysis.coachingTips_json || '[]'); } catch { ev.coachingTips = []; }
          try { ev.aiTags = JSON.parse(analysis.tags_json || '[]'); } catch { ev.aiTags = []; }
          ev.followupType = analysis.followupType;
          ev.followupDate = analysis.followupDate;
          ev.suggestedPipelineStage = analysis.pipelineStage;
        }
        // Get call_log details
        const cl = db.prepare('SELECT notes, pipelineAction, recordingUrl, recordingSid, duration, fromNumber, toNumber, direction, collaboratorId FROM call_logs WHERE id = ?').get(ev.callLogId);
        if (cl) {
          ev.recordingUrl = ev.recordingUrl || cl.recordingUrl;
          ev.callNotes = cl.notes;
          ev.pipelineAction = cl.pipelineAction;
          ev.duration = ev.duration || cl.duration;
          ev.businessPhone = ev.businessPhone || cl.fromNumber;
          ev.clientPhone = ev.clientPhone || (cl.direction === 'outbound' ? cl.toNumber : cl.fromNumber);
        }
        // Get collaborator name
        if (ev.collaboratorId) {
          const coll = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(ev.collaboratorId);
          if (coll) ev.collaboratorName = coll.name;
        }
      }
      return ev;
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/conversations/:id/notes — Add a note ────
router.post('/:id/notes', requireAuth, (req, res) => {
  try {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (!canAccessConversation(conv, req.auth)) return res.status(403).json({ error: 'Access denied' });

    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Note content required' });

    const id = 'ce_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO conversation_events (id, conversationId, companyId, collaboratorId, type, content, createdAt)
      VALUES (?, ?, ?, ?, 'note', ?, ?)`)
      .run(id, conv.id, conv.companyId, req.auth.collaboratorId, content.trim(), now);

    db.prepare(`UPDATE conversations SET lastActivityAt = ?, lastEventType = 'note', lastEventPreview = ? WHERE id = ?`)
      .run(now, `Note · ${content.trim().slice(0, 40)}...`, conv.id);

    res.json({ success: true, id, createdAt: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/conversations/:id/sms — Send SMS in conversation ────
router.post('/:id/sms', requireAuth, (req, res) => {
  try {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (!canAccessConversation(conv, req.auth)) return res.status(403).json({ error: 'Access denied' });

    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'SMS content required' });

    // Check SMS credits
    const credits = db.prepare('SELECT credits FROM sms_credits WHERE companyId = ?').get(conv.companyId);
    if (!credits || credits.credits <= 0) return res.status(402).json({ error: 'Insufficient SMS credits' });

    // Lookup company custom sender name
    const company = db.prepare('SELECT sms_sender_name FROM companies WHERE id = ?').get(conv.companyId);
    const sender = company?.sms_sender_name || null;

    // Déterminer le provider : Twilio si le collab a un numéro assigné
    const twilioNum = db.prepare("SELECT phoneNumber FROM phone_numbers WHERE collaboratorId = ? AND companyId = ? AND status = 'assigned' AND smsCapable = 1 LIMIT 1").get(req.auth.collaboratorId, conv.companyId);
    let sendPromise, provider = 'brevo', usedFrom = sender || 'Calendar360';

    if (twilioNum) {
      provider = 'twilio';
      usedFrom = twilioNum.phoneNumber;
      sendPromise = sendTwilioSms({ from: twilioNum.phoneNumber, to: conv.clientPhone, content: content.trim() });
    } else {
      sendPromise = sendSms({ to: conv.clientPhone, content: content.trim(), sender });
    }

    sendPromise.then(result => {
        if (!result.success) {
          return res.status(500).json({ error: result.error || 'SMS send failed' });
        }

        // Debit credits
        db.prepare('UPDATE sms_credits SET credits = MAX(0, credits - 1) WHERE companyId = ?').run(conv.companyId);
        db.prepare(`INSERT INTO sms_transactions (id, companyId, date, type, count, detail, amount)
          VALUES (?, ?, ?, 'sent', -1, ?, 0)`)
          .run('stx' + Date.now(), conv.companyId, new Date().toISOString().split('T')[0], `SMS → ${conv.clientPhone}`);

        // Store SMS message avec provider + fromNumber tracés
        const smsId = 'sms_' + Date.now();
        db.prepare(`INSERT INTO sms_messages (id, companyId, collaboratorId, contactId, direction, fromNumber, toNumber, content, status, conversationId, provider, twilioMessageSid, createdAt)
          VALUES (?, ?, ?, ?, 'outbound', ?, ?, ?, 'sent', ?, ?, ?, ?)`)
          .run(smsId, conv.companyId, req.auth.collaboratorId, conv.contactId, usedFrom, conv.clientPhone, content.trim(), conv.id, provider, result?.messageSid || '', new Date().toISOString());

        // Add conversation event
        const eventId = addSmsEvent({
          conversationId: conv.id,
          companyId: conv.companyId,
          collaboratorId: req.auth.collaboratorId,
          clientPhone: conv.clientPhone,
          businessPhone: usedFrom,
          content: content.trim(),
          direction: 'outbound',
          smsMessageId: smsId
        });

        res.json({ success: true, smsId, eventId, provider, fromNumber: usedFrom });
      })
      .catch(err => {
        console.error('[CONV SMS ERR]', err);
        res.status(500).json({ error: err.message });
      });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/conversations/sms-history/:phone — SMS history for a phone number ────
// ─── PUT /api/conversations/:id — Update conversation ────
router.put('/:id', requireAuth, (req, res) => {
  try {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (!canAccessConversation(conv, req.auth)) return res.status(403).json({ error: 'Access denied' });

    const allowed = ['status', 'unreadCount', 'contactId'];
    const data = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    }
    if (Object.keys(data).length === 0) return res.json({ success: true });

    const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE conversations SET ${sets} WHERE id = ?`).run(...Object.values(data), conv.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Migration helper: backfill conversations from existing call_logs ────
router.post('/migrate', requireAuth, (req, res) => {
  if (!req.auth.isSupra) return res.status(403).json({ error: 'Supra admin only' });

  try {
    const callLogs = db.prepare('SELECT * FROM call_logs ORDER BY createdAt ASC').all();
    let created = 0, events = 0;

    for (const cl of callLogs) {
      const clientPhone = cl.direction === 'outbound' ? cl.toNumber : cl.fromNumber;
      const businessPhone = cl.direction === 'outbound' ? cl.fromNumber : cl.toNumber;
      if (!clientPhone) continue;

      const conv = getOrCreateConversation({
        companyId: cl.companyId,
        collaboratorId: cl.collaboratorId,
        clientPhone,
        businessPhone,
        contactId: cl.contactId
      });

      // Check if event already exists for this call_log
      const existing = db.prepare('SELECT id FROM conversation_events WHERE callLogId = ?').get(cl.id);
      if (existing) continue;

      const isMissed = cl.status === 'missed' || cl.status === 'no-answer' || cl.status === 'busy';
      const type = isMissed ? 'call_missed' : cl.direction === 'outbound' ? 'call_outbound' : 'call_inbound';

      addCallEvent({
        conversationId: conv.id,
        companyId: cl.companyId,
        collaboratorId: cl.collaboratorId,
        callLogId: cl.id,
        type,
        clientPhone,
        businessPhone,
        duration: cl.duration,
        recordingUrl: cl.recordingUrl,
        status: cl.status
      });
      events++;
    }

    res.json({ success: true, conversations: created, events });
  } catch (err) {
    console.error('[CONV MIGRATE ERR]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
