import { Router } from 'express';
import { db } from '../db/database.js';
import { sendSms } from '../services/brevoSms.js';

const router = Router();

// Generate a random 6-digit code
function genVerifyCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Clean phone: convert French format → international
function cleanPhone(phone) {
  let p = (phone || '').replace(/[^\d+]/g, '');
  if (p.startsWith('0') && p.length === 10) p = '+33' + p.substring(1);
  if (/^\d{10,15}$/.test(p) && !p.startsWith('+')) p = '+' + p;
  return p;
}

// ─── POST /api/verify/send-wa-code ───
// Sends a 6-digit verification code via SMS to the given phone number
router.post('/send-wa-code', async (req, res) => {
  try {
    const { phone, companyId } = req.body;
    if (!phone || phone.length < 10) {
      return res.status(400).json({ success: false, error: 'Numéro de téléphone invalide' });
    }

    const cleaned = cleanPhone(phone);

    // Rate limit: check if a code was sent to this phone in the last 60 seconds
    const recent = db.prepare(
      "SELECT id FROM wa_verifications WHERE phone = ? AND createdAt > datetime('now', '-60 seconds')"
    ).get(cleaned);
    if (recent) {
      return res.status(429).json({ success: false, error: 'Veuillez patienter 60 secondes avant de renvoyer un code' });
    }

    // Clean old codes for this phone
    db.prepare("DELETE FROM wa_verifications WHERE phone = ?").run(cleaned);

    // Generate and store code
    const code = genVerifyCode();
    const id = 'wv' + Date.now() + Math.random().toString(36).slice(2, 6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    db.prepare(
      "INSERT INTO wa_verifications (id, phone, code, attempts, expiresAt) VALUES (?, ?, ?, 0, ?)"
    ).run(id, cleaned, code, expiresAt);

    // Send via SMS
    const smsContent = `Calendar360 — Votre code de vérification WhatsApp : ${code}`;
    const smsCompany = companyId ? db.prepare('SELECT sms_sender_name FROM companies WHERE id = ?').get(companyId) : null;
    const smsSender = smsCompany?.sms_sender_name || null;
    const smsResult = await sendSms({ to: cleaned, content: smsContent, sender: smsSender });

    console.log(`\x1b[35m[VERIFY]\x1b[0m Code ${code} envoyé à ${cleaned} (SMS: ${smsResult.success ? 'OK' : 'ERR'})`);

    res.json({ success: true, sent: true });
  } catch (err) {
    console.error('[VERIFY SEND ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/verify/check-wa-code ───
// Verifies the code entered by the user
router.post('/check-wa-code', async (req, res) => {
  try {
    const { phone, code, calendarId } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ success: false, error: 'Numéro et code requis' });
    }

    const cleaned = cleanPhone(phone);

    // Find valid (non-expired) verification entry
    const entry = db.prepare(
      "SELECT * FROM wa_verifications WHERE phone = ? AND expiresAt > datetime('now')"
    ).get(cleaned);

    if (!entry) {
      return res.json({ success: false, error: 'Code expiré ou introuvable. Renvoyez un nouveau code.' });
    }

    if (entry.attempts >= 5) {
      db.prepare("DELETE FROM wa_verifications WHERE id = ?").run(entry.id);
      return res.json({ success: false, error: 'Trop de tentatives. Renvoyez un nouveau code.' });
    }

    if (entry.code !== code.trim()) {
      db.prepare("UPDATE wa_verifications SET attempts = attempts + 1 WHERE id = ?").run(entry.id);
      return res.json({ success: false, error: `Code incorrect. ${4 - entry.attempts} tentative(s) restante(s).` });
    }

    // Code is correct!
    db.prepare("DELETE FROM wa_verifications WHERE id = ?").run(entry.id);

    // Mark calendar as verified if calendarId provided
    if (calendarId) {
      db.prepare("UPDATE calendars SET whatsappVerified = 1 WHERE id = ?").run(calendarId);
    }

    console.log(`\x1b[32m[VERIFY OK]\x1b[0m ${cleaned} vérifié${calendarId ? ` (cal: ${calendarId})` : ''}`);
    res.json({ success: true, verified: true });
  } catch (err) {
    console.error('[VERIFY CHECK ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
