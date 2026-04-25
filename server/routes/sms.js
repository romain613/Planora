import { Router } from 'express';
import { db, getByCompany } from '../db/database.js';
import { debitTelecomCredits } from './marketplace.js';
import { requireSupra, requireAdmin, requireAuth, enforceCompany } from '../middleware/auth.js';
import { sendSms } from '../services/brevoSms.js';
import { sendTwilioSms } from '../services/twilioSms.js';
import { resolveFromPhone } from '../helpers/resolveContext.js';
import { getOrCreateConversation, addSmsEvent } from './conversations.js';
import { cleanPhone } from '../services/twilioVoip.js';
import { createNotification } from './notifications.js';
import twilio from 'twilio';

const router = Router();

// ─── TWILIO WEBHOOK VALIDATION (extrait de voip.js) ───
function validateTwilioSmsWebhook(req, res, next) {
  try {
    const sig = req.headers['x-twilio-signature'];
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sig || !token) { console.warn('[SMS WEBHOOK] No signature or token — allowing in dev'); return next(); }
    const host = req.get('x-forwarded-host') || req.get('host') || 'calendar360.fr';
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const urls = [
      `${proto}://${host}${req.originalUrl}`,
      `https://${host}${req.originalUrl}`,
      `https://calendar360.fr${req.originalUrl}`,
    ];
    const isValid = urls.some(url => twilio.validateRequest(token, sig, url, req.body));
    if (!isValid) console.warn(`[SMS WEBHOOK] Signature mismatch — allowing (proxy issue)`);
    next();
  } catch (err) { console.error('[SMS WEBHOOK VALIDATE ERR]', err.message); next(); }
}

// ─── SMS DEDUP (anti-retry Twilio) ───
const processedSmsWebhooks = new Map();
const SMS_DEDUP_TTL_MS = 120000;
function isSmsDedup(messageSid) {
  if (!messageSid) return false;
  if (processedSmsWebhooks.has(messageSid)) return true;
  processedSmsWebhooks.set(messageSid, Date.now());
  // Cleanup old entries
  if (processedSmsWebhooks.size > 500) {
    const now = Date.now();
    for (const [k, v] of processedSmsWebhooks) { if (now - v > SMS_DEDUP_TTL_MS) processedSmsWebhooks.delete(k); }
  }
  return false;
}

// ─── HELPER: Résoudre le provider SMS pour un collab ───
function getCollabTwilioNumber(collaboratorId, companyId) {
  if (!collaboratorId || !companyId) return null;
  return db.prepare("SELECT phoneNumber FROM phone_numbers WHERE collaboratorId = ? AND companyId = ? AND status = 'assigned' AND smsCapable = 1 LIMIT 1").get(collaboratorId, companyId);
}

// ══════════════════════════════════════════════════════
// POST /api/sms/webhook — Twilio SMS inbound webhook
// ══════════════════════════════════════════════════════
router.post('/webhook', validateTwilioSmsWebhook, (req, res) => {
  try {
    const { MessageSid, From, To, Body } = req.body;
    console.log(`\x1b[36m[SMS INBOUND]\x1b[0m ${From} → ${To} (SID:${MessageSid}) : ${(Body||'').slice(0, 80)}`);

    // Dedup
    if (isSmsDedup(MessageSid)) {
      console.log(`\x1b[33m[SMS INBOUND]\x1b[0m Duplicate ${MessageSid} — skipped`);
      res.type('text/xml'); return res.send('<Response/>');
    }

    // SECURITE: résolution centralisée via resolveFromPhone()
    const ctx = resolveFromPhone({ twilioNumber: To, clientPhone: From });
    if (!ctx.isValid || !ctx.companyId) {
      console.warn(`\x1b[31m[SMS INBOUND]\x1b[0m Numéro ${To} non résolu — SMS droppé`);
      res.type('text/xml'); return res.send('<Response/>');
    }

    const now = new Date().toISOString();
    const smsId = 'sms_in_' + Date.now() + Math.random().toString(36).slice(2, 5);

    // 1. INSERT sms_messages
    db.prepare('INSERT OR IGNORE INTO sms_messages (id, companyId, collaboratorId, contactId, direction, fromNumber, toNumber, content, status, twilioMessageSid, provider, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(smsId, ctx.companyId, ctx.collaboratorId || '', ctx.contactId || '', 'inbound', From, To, Body || '', 'received', MessageSid, 'twilio', now);

    // 2. Créer/trouver conversation
    const conv = getOrCreateConversation({
      companyId: ctx.companyId,
      collaboratorId: ctx.collaboratorId,
      clientPhone: From,
      businessPhone: To,
      contactId: ctx.contactId,
    });

    // 3. Ajouter événement conversation
    if (conv) {
      addSmsEvent({
        conversationId: conv.id, companyId: ctx.companyId, collaboratorId: ctx.collaboratorId,
        clientPhone: From, businessPhone: To,
        content: Body || '', direction: 'inbound', smsMessageId: smsId,
      });
      // 4. Incrémenter unread
      db.prepare('UPDATE conversations SET unreadCount = unreadCount + 1 WHERE id = ?').run(conv.id);
    }

    // 5. Notification pour le collab
    if (ctx.collaboratorId) {
      let contactName = From;
      if (ctx.contactId) {
        const ct = db.prepare('SELECT name FROM contacts WHERE id = ?').get(ctx.contactId);
        if (ct?.name) contactName = ct.name;
      }
      createNotification({
        companyId: ctx.companyId, collaboratorId: ctx.collaboratorId,
        type: 'sms_inbound',
        title: 'SMS reçu de ' + contactName,
        detail: (Body || '').slice(0, 100),
        contactId: ctx.contactId || '', contactName,
      });
    }

    console.log(`\x1b[32m[SMS INBOUND OK]\x1b[0m company:${ctx.companyId} collab:${ctx.collaboratorId} contact:${ctx.contactId} conv:${conv?.id}`);
    res.type('text/xml'); res.send('<Response/>');
  } catch (err) {
    console.error('[SMS WEBHOOK ERR]', err.message);
    res.type('text/xml'); res.send('<Response/>');
  }
});

// ══════════════════════════════════════════════════════
// POST /api/sms/send — Envoi SMS hybride (Twilio prioritaire, Brevo fallback)
// ══════════════════════════════════════════════════════
router.post('/send', requireAuth, enforceCompany, async (req, res) => {
  try {
    const { content, message, contactId } = req.body;
    // SMS historique : normaliser les phones en E.164 dès l'entrée — garantit que
    // les valeurs stockées en DB matchent les requêtes LIKE du front (sms-history).
    const to = cleanPhone(req.body.to || '');
    const requestedFrom = req.body.fromNumber ? cleanPhone(req.body.fromNumber) : '';
    const companyId = req.auth.companyId;
    const collaboratorId = req.auth.collaboratorId;
    const smsContent = content || message;
    if (!to || !smsContent) return res.status(400).json({ error: 'to et content requis' });

    // Check SMS credits
    const credits = db.prepare('SELECT credits FROM sms_credits WHERE companyId = ?').get(companyId);
    if (credits && credits.credits <= 0) return res.status(402).json({ error: 'Pas de crédits SMS', success: false });

    // Déterminer le provider : Twilio si le collab a un numéro assigné
    let result, provider = 'brevo', usedFromNumber = '';

    // Si fromNumber spécifié, valider qu'il appartient au collab
    let twilioNum = null;
    if (requestedFrom) {
      twilioNum = db.prepare("SELECT phoneNumber FROM phone_numbers WHERE phoneNumber = ? AND collaboratorId = ? AND companyId = ? AND status = 'assigned'").get(requestedFrom, collaboratorId, companyId);
    }
    // Sinon, chercher le premier numéro Twilio du collab
    if (!twilioNum) {
      twilioNum = getCollabTwilioNumber(collaboratorId, companyId);
    }

    if (twilioNum) {
      // TWILIO
      provider = 'twilio';
      usedFromNumber = twilioNum.phoneNumber;
      result = await sendTwilioSms({ from: twilioNum.phoneNumber, to, content: smsContent });
    } else {
      // BREVO (fallback)
      const comp = db.prepare('SELECT sms_sender_name FROM companies WHERE id = ?').get(companyId);
      usedFromNumber = comp?.sms_sender_name || 'Calendar360';
      result = await sendSms({ to, content: smsContent, sender: comp?.sms_sender_name || null });
    }

    // Debit 1 credit
    if (result?.success) {
      try { db.prepare('UPDATE sms_credits SET credits = MAX(0, credits - 1) WHERE companyId = ?').run(companyId); } catch {}
    }

    // Log SMS
    if (result?.success) {
      try {
        const logId = 'sms_' + Date.now() + Math.random().toString(36).slice(2, 5);
        const _cleanFrom = cleanPhone(usedFromNumber || '');
        const _cleanTo   = to; // déjà normalisé
        db.prepare('INSERT OR IGNORE INTO sms_messages (id, companyId, collaboratorId, contactId, direction, fromNumber, toNumber, content, status, brevoMessageId, twilioMessageSid, provider, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(logId, companyId, collaboratorId, contactId || '', 'outbound', _cleanFrom, _cleanTo, smsContent, 'sent', result?.messageId || null, result?.messageSid || null, provider, new Date().toISOString());

        // Créer/update conversation
        try {
          const conv = getOrCreateConversation({ companyId, collaboratorId, clientPhone: to, businessPhone: usedFromNumber, contactId });
          if (conv) addSmsEvent({ conversationId: conv.id, companyId, collaboratorId, clientPhone: to, businessPhone: usedFromNumber, content: smsContent, direction: 'outbound', smsMessageId: logId });
        } catch {}
      } catch {}
    }

    res.json({ success: result?.success || false, messageId: result?.messageId || result?.messageSid, provider, fromNumber: usedFromNumber, demo: result?.demo, error: result?.error });
  } catch (err) {
    console.error('[SMS SEND ERROR]', err.message);
    res.status(500).json({ error: err.message, success: false });
  }
});

// GET /api/sms/credits?companyId=xxx
router.get('/credits', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId; // enforceCompany injects from session — NEVER fallback to 'c1'
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const row = db.prepare('SELECT credits FROM sms_credits WHERE companyId = ?').get(companyId);
    res.json({ credits: row ? row.credits : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sms/recharge
router.post('/recharge', requireSupra, (req, res) => {
  try {
    const { companyId, count, amount } = req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    // Add credits
    db.prepare('INSERT INTO sms_credits (companyId, credits) VALUES (?, ?) ON CONFLICT(companyId) DO UPDATE SET credits = credits + ?')
      .run(companyId, count, count);
    // Log transaction
    const txId = 'stx' + Date.now();
    db.prepare('INSERT INTO sms_transactions (id, companyId, date, type, count, detail, amount) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(txId, companyId, new Date().toISOString().split('T')[0], 'recharge', count, `Recharge ${count} SMS`, amount);
    const row = db.prepare('SELECT credits FROM sms_credits WHERE companyId = ?').get(companyId);
    res.json({ success: true, credits: row.credits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sms/transactions?companyId=xxx
router.get('/transactions', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId; // enforceCompany injects from session — NEVER fallback to 'c1'
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    res.json(getByCompany('sms_transactions', companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN COMPANY: SMS MONITORING ──────────────────

// GET /api/sms/messages — Admin: historique SMS complet de la company (paginé, filtrable)
router.get('/messages', requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    const { collaboratorId, dateFrom, dateTo, status, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    // Build dynamic WHERE clause
    const conditions = ['sm.companyId = ?'];
    const params = [companyId];

    if (collaboratorId) { conditions.push('sm.collaboratorId = ?'); params.push(collaboratorId); }
    if (dateFrom) { conditions.push('sm.createdAt >= ?'); params.push(dateFrom); }
    if (dateTo) { conditions.push('sm.createdAt <= ?'); params.push(dateTo + 'T23:59:59'); }
    if (status) { conditions.push('sm.status = ?'); params.push(status); }
    if (search) {
      conditions.push('(sm.toNumber LIKE ? OR sm.content LIKE ? OR c.name LIKE ?)');
      const s = '%' + search + '%';
      params.push(s, s, s);
    }

    const where = conditions.join(' AND ');

    // Count total for pagination
    const countParams = [...params];
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM sms_messages sm LEFT JOIN collaborators c ON c.id = sm.collaboratorId WHERE ${where}`).get(...countParams)?.cnt || 0;

    // Fetch page with collaborator name joined
    const rows = db.prepare(`
      SELECT sm.id, sm.companyId, sm.collaboratorId, COALESCE(c.name, 'Inconnu') as collaboratorName,
             sm.contactId, sm.direction, sm.fromNumber, sm.toNumber, sm.content, sm.status,
             sm.brevoMessageId, sm.createdAt
      FROM sms_messages sm
      LEFT JOIN collaborators c ON c.id = sm.collaboratorId
      WHERE ${where}
      ORDER BY sm.createdAt DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({ messages: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[SMS MESSAGES ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sms/collab-stats — Admin: ventilation SMS par collaborateur
router.get('/collab-stats', requireAdmin, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const stats = db.prepare(`
      SELECT sm.collaboratorId,
             COALESCE(c.name, 'Inconnu') as collaboratorName,
             COUNT(*) as totalSent,
             COUNT(CASE WHEN sm.createdAt >= ? THEN 1 END) as sentThisMonth,
             COUNT(CASE WHEN sm.status = 'failed' THEN 1 END) as totalFailed,
             MAX(sm.createdAt) as lastSentAt
      FROM sms_messages sm
      LEFT JOIN collaborators c ON c.id = sm.collaboratorId
      WHERE sm.companyId = ?
      GROUP BY sm.collaboratorId
      ORDER BY totalSent DESC
    `).all(monthStart, companyId);

    const totalAllTime = db.prepare('SELECT COUNT(*) as cnt FROM sms_messages WHERE companyId = ?').get(companyId)?.cnt || 0;
    const totalThisMonth = db.prepare('SELECT COUNT(*) as cnt FROM sms_messages WHERE companyId = ? AND createdAt >= ?').get(companyId, monthStart)?.cnt || 0;
    const totalFailed = db.prepare("SELECT COUNT(*) as cnt FROM sms_messages WHERE companyId = ? AND status = 'failed'").get(companyId)?.cnt || 0;

    // Credits from sms_credits table (source unique)
    const creditsRow = db.prepare('SELECT credits FROM sms_credits WHERE companyId = ?').get(companyId);
    const credits = creditsRow ? creditsRow.credits : 0;

    res.json({ stats, totalAllTime, totalThisMonth, totalFailed, credits });
  } catch (err) {
    console.error('[SMS COLLAB-STATS ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sms/global-stats — Supra admin: all companies credits + total + all transactions + Brevo balance
router.get('/global-stats', requireSupra, async (req, res) => {
  try {
    // All credits per company
    const creditsRows = db.prepare('SELECT sc.companyId, sc.credits, c.name as companyName FROM sms_credits sc LEFT JOIN companies c ON c.id = sc.companyId').all();
    const totalCredits = creditsRows.reduce((sum, r) => sum + (r.credits || 0), 0);

    // All transactions (last 100)
    const transactions = db.prepare(`
      SELECT st.*, c.name as companyName
      FROM sms_transactions st
      LEFT JOIN companies c ON c.id = st.companyId
      ORDER BY st.date DESC, st.id DESC
      LIMIT 100
    `).all();

    // Stats
    const totalSent = db.prepare("SELECT COALESCE(SUM(ABS(count)), 0) as total FROM sms_transactions WHERE type = 'sent'").get()?.total || 0;
    const totalRecharged = db.prepare("SELECT COALESCE(SUM(count), 0) as total FROM sms_transactions WHERE type = 'recharge'").get()?.total || 0;
    const companiesWithCredits = creditsRows.filter(r => r.credits > 0).length;

    // Fetch real Brevo account balance
    let brevoBalance = null;
    const brevoKey = process.env.BREVO_API_KEY;
    if (brevoKey) {
      try {
        const brevoRes = await fetch('https://api.brevo.com/v3/account', {
          headers: { 'api-key': brevoKey, 'Accept': 'application/json' },
        });
        if (brevoRes.ok) {
          const account = await brevoRes.json();
          // Brevo returns plan info with credits
          const smsPlan = (account.plan || []).find(p => p.type === 'sms');
          brevoBalance = {
            smsCredits: smsPlan?.credits ?? account.credits?.sms ?? null,
            email: account.email || null,
            companyName: account.companyName || null,
            plan: smsPlan ? { type: smsPlan.type, credits: smsPlan.credits } : null,
          };
        }
      } catch (brevoErr) {
        console.error('[BREVO BALANCE ERROR]', brevoErr.message);
      }
    }

    res.json({
      totalCredits,
      totalSent,
      totalRecharged,
      companiesWithCredits,
      credits: creditsRows,
      transactions,
      brevoBalance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sms/set-credits — Supra admin: set exact credits for a company
router.post('/set-credits', requireSupra, (req, res) => {
  try {
    const { companyId, credits } = req.body;
    if (!companyId || credits == null) return res.status(400).json({ error: 'companyId and credits required' });
    db.prepare('INSERT INTO sms_credits (companyId, credits) VALUES (?, ?) ON CONFLICT(companyId) DO UPDATE SET credits = ?')
      .run(companyId, credits, credits);
    const txId = 'stx' + Date.now();
    db.prepare('INSERT INTO sms_transactions (id, companyId, date, type, count, detail, amount) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(txId, companyId, new Date().toISOString().split('T')[0], 'recharge', credits, `Crédits définis à ${credits} par Supra Admin`, 0);
    res.json({ success: true, credits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sms/debit — Called when an SMS is sent
router.post('/debit', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    const { count = 1, detail = 'SMS envoyé' } = req.body;
    db.prepare('UPDATE sms_credits SET credits = MAX(0, credits - ?) WHERE companyId = ?').run(count, companyId);
    const txId = 'stx' + Date.now();
    db.prepare('INSERT INTO sms_transactions (id, companyId, date, type, count, detail, amount) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(txId, companyId, new Date().toISOString().split('T')[0], 'sent', -count, detail, 0);
    const row = db.prepare('SELECT credits FROM sms_credits WHERE companyId = ?').get(companyId);
    res.json({ success: true, credits: row ? row.credits : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SMS PACKS (enterprise purchase) ──────────────

// GET /api/sms/packs — List active SMS packs
router.get('/packs', requireAuth, (req, res) => {
  try {
    const all = req.query.all === '1';
    const packs = all
      ? db.prepare('SELECT * FROM sms_packs ORDER BY price ASC').all()
      : db.prepare('SELECT * FROM sms_packs WHERE active = 1 ORDER BY price ASC').all();
    res.json(packs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sms/packs — Create an SMS pack (supra admin)
router.post('/packs', requireSupra, (req, res) => {
  try {
    const { name, quantity, price, description, popular } = req.body;
    if (!name || !quantity || !price) return res.status(400).json({ error: 'name, quantity et price requis' });
    const id = 'sp_' + Date.now();
    db.prepare('INSERT INTO sms_packs (id, name, quantity, price, description, popular, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
      .run(id, name, quantity, price, description || '', popular ? 1 : 0, new Date().toISOString());
    const pack = db.prepare('SELECT * FROM sms_packs WHERE id = ?').get(id);
    console.log(`\x1b[35m[SMS-PACKS]\x1b[0m Pack créé: ${name} (${quantity} SMS / ${price}€)`);
    res.json({ success: true, pack });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sms/packs/:id — Update an SMS pack
router.put('/packs/:id', requireSupra, (req, res) => {
  try {
    const { name, quantity, price, description, popular, active } = req.body;
    db.prepare('UPDATE sms_packs SET name = ?, quantity = ?, price = ?, description = ?, popular = ?, active = ? WHERE id = ?')
      .run(name, quantity, price, description || '', popular ? 1 : 0, active !== undefined ? (active ? 1 : 0) : 1, req.params.id);
    const pack = db.prepare('SELECT * FROM sms_packs WHERE id = ?').get(req.params.id);
    res.json({ success: true, pack });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sms/packs/:id — Delete an SMS pack
router.delete('/packs/:id', requireSupra, (req, res) => {
  try {
    db.prepare('DELETE FROM sms_packs WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sms/purchase-pack — Enterprise buys an SMS pack (debits telecom credits)
router.post('/purchase-pack', requireAdmin, enforceCompany, (req, res) => {
  try {
    const { companyId, packId } = req.body;
    if (!companyId || !packId) return res.status(400).json({ error: 'companyId et packId requis' });

    const pack = db.prepare('SELECT * FROM sms_packs WHERE id = ? AND active = 1').get(packId);
    if (!pack) return res.status(404).json({ error: 'Pack non trouvé ou inactif' });

    // Check and debit telecom credits
    const debitResult = debitTelecomCredits(companyId, pack.price, `Achat pack SMS "${pack.name}" — ${pack.quantity} SMS`);
    if (!debitResult.success) {
      return res.status(400).json({ error: debitResult.error });
    }

    // Add SMS credits to wallet
    db.prepare('INSERT INTO sms_credits (companyId, credits) VALUES (?, ?) ON CONFLICT(companyId) DO UPDATE SET credits = credits + ?')
      .run(companyId, pack.quantity, pack.quantity);

    // Log transaction
    const txId = 'stx' + Date.now();
    db.prepare('INSERT INTO sms_transactions (id, companyId, date, type, count, detail, amount) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(txId, companyId, new Date().toISOString().split('T')[0], 'recharge', pack.quantity,
        `Achat pack "${pack.name}" — ${pack.quantity} SMS`, pack.price);

    const row = db.prepare('SELECT credits FROM sms_credits WHERE companyId = ?').get(companyId);
    console.log(`\x1b[32m[SMS-PACKS]\x1b[0m ${companyId} a acheté "${pack.name}" (${pack.quantity} SMS / ${pack.price}€) — solde crédits: ${debitResult.balance.toFixed(2)}€`);
    res.json({ success: true, credits: row.credits, pack, telecomBalance: debitResult.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
