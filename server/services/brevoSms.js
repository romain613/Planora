/**
 * Brevo Transactional SMS Service
 * Documentation: https://developers.brevo.com/reference/sendtransacsms
 *
 * ═══════════════════════════════════════════════════════
 * FRENCH SMS REGULATORY COMPLIANCE (ARCEP / AF2M / CNIL)
 * ═══════════════════════════════════════════════════════
 * - Marketing SMS: 8h-22h working days only
 * - URL shorteners (bit.ly, tiny.url, etc.): STRICTLY FORBIDDEN
 * - Must support STOP keyword for opt-out
 * - Alphanumeric Sender ID required for A2P
 * - No mobile numbers (06/07) as opt-out mechanism
 * ═══════════════════════════════════════════════════════
 */

const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/sms';

// Forbidden URL shorteners in France (ARCEP regulation)
const FORBIDDEN_SHORTENERS = /\b(bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|bl\.ink|short\.io|cutt\.ly)\b/i;

export async function sendSms({ to, content, isTransactional = true, sender: customSender = null }) {
  // Normaliser le numéro FR : 6xxxxxxxx ou 7xxxxxxxx → +336xxxxxxxx
  if (to && /^\d{9}$/.test(to.replace(/\s/g, '')) && /^[67]/.test(to.replace(/\s/g, ''))) {
    to = '+33' + to.replace(/\s/g, '');
  } else if (to && /^0[67]\d{8}$/.test(to.replace(/[\s.-]/g, ''))) {
    to = '+33' + to.replace(/[\s.-]/g, '').slice(1);
  }
  if (!to || to.replace(/[^\d+]/g, '').length < 10) {
    console.log(`\x1b[33m[SMS SKIP]\x1b[0m Pas de numéro de téléphone valide: ${to}`);
    return { success: false, skipped: true, reason: 'no_phone' };
  }

  // ── FRENCH COMPLIANCE: Check for forbidden URL shorteners ──
  if (FORBIDDEN_SHORTENERS.test(content)) {
    console.log(`\x1b[31m[SMS COMPLIANCE]\x1b[0m Blocked: URL shortener detected in message`);
    return { success: false, error: 'Les raccourcisseurs d\'URL (bit.ly, tinyurl, etc.) sont strictement interdits en France.' };
  }

  // ── FRENCH COMPLIANCE: Marketing SMS hours check ──
  if (!isTransactional) {
    const now = new Date();
    const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const hour = paris.getHours();
    const day = paris.getDay();
    if (day === 0 || hour < 8 || hour >= 22) {
      console.log(`\x1b[33m[SMS COMPLIANCE]\x1b[0m Marketing SMS blocked outside hours (${hour}h, day ${day})`);
      return { success: false, error: 'SMS marketing autorisé uniquement entre 8h et 22h, jours ouvrés.' };
    }
  }

  const apiKey = process.env.BREVO_API_KEY;
  // Priorité: sender custom (par company) > env var > défaut
  const sender = customSender || process.env.BREVO_SMS_SENDER || 'Calendar360';

  // Nettoyer le numéro : garder uniquement chiffres et +
  let cleanPhone = to.replace(/[^\d+]/g, '');

  // Convertir format français 06/07 → +33
  if (cleanPhone.startsWith('0') && cleanPhone.length === 10) {
    cleanPhone = '+33' + cleanPhone.substring(1);
  }
  // Ajouter + si commence par 33 sans +
  if (cleanPhone.startsWith('33') && !cleanPhone.startsWith('+')) {
    cleanPhone = '+' + cleanPhone;
  }

  if (!apiKey || apiKey === 'your-brevo-api-key-here') {
    console.log(`\x1b[33m[SMS DEMO]\x1b[0m → ${cleanPhone}`);
    console.log(`  📱 Message: ${content}`);
    return { success: true, demo: true, messageId: 'demo-sms-' + Date.now() };
  }

  try {
    const response = await fetch(BREVO_SMS_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        type: 'transactional',
        unicodeEnabled: true,
        sender,
        recipient: cleanPhone,
        content,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`\x1b[32m[SMS OK]\x1b[0m → ${cleanPhone}`);
      return { success: true, messageId: data.reference };
    } else {
      console.error(`\x1b[31m[SMS ERR]\x1b[0m → ${cleanPhone} | ${data.message || JSON.stringify(data)}`);
      return { success: false, error: data.message || 'Brevo SMS API error' };
    }
  } catch (err) {
    console.error(`\x1b[31m[SMS ERR]\x1b[0m → ${cleanPhone} | ${err.message}`);
    return { success: false, error: err.message };
  }
}
