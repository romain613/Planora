/**
 * Brevo WhatsApp Service
 * Uses Brevo's WhatsApp Business API to send transactional messages
 * Documentation: https://developers.brevo.com/reference/sendwhatsappmessage
 */

const BREVO_WA_URL = 'https://api.brevo.com/v3/whatsapp/sendMessage';

/**
 * Send a WhatsApp message via Brevo
 * @param {Object} opts
 * @param {string} opts.to - Phone number (international format, e.g. +33612345678)
 * @param {string} opts.text - Plain text message to send
 * @param {string} [opts.senderNumber] - WhatsApp sender number (per-calendar override)
 */
export async function sendWhatsapp({ to, text, senderNumber: calSenderNumber }) {
  if (!to || to.length < 10) {
    console.log(`\x1b[33m[WA SKIP]\x1b[0m Pas de numéro de téléphone valide`);
    return { success: false, skipped: true, reason: 'no_phone' };
  }

  const apiKey = process.env.BREVO_API_KEY;
  let senderNumber = calSenderNumber || process.env.BREVO_WHATSAPP_NUMBER || '';
  // Clean sender number: convert French format to international
  senderNumber = senderNumber.replace(/[^\d+]/g, '');
  if (senderNumber.startsWith('0') && senderNumber.length === 10) {
    senderNumber = '+33' + senderNumber.substring(1);
  }
  if (/^\d{10,15}$/.test(senderNumber) && !senderNumber.startsWith('+')) {
    senderNumber = '+' + senderNumber;
  }

  // Clean phone number: keep only digits and +
  let cleanPhone = to.replace(/[^\d+]/g, '');

  // Convert French format 06/07 → +33
  if (cleanPhone.startsWith('0') && cleanPhone.length === 10) {
    cleanPhone = '+33' + cleanPhone.substring(1);
  }
  // Add + if starts with country code without +
  if (/^\d{10,15}$/.test(cleanPhone) && !cleanPhone.startsWith('+')) {
    cleanPhone = '+' + cleanPhone;
  }

  if (!apiKey || apiKey === 'your-brevo-api-key-here') {
    console.log(`\x1b[32m[WA DEMO]\x1b[0m → ${cleanPhone}`);
    console.log(`  💬 Message: ${text}`);
    return { success: true, demo: true, messageId: 'demo-wa-' + Date.now() };
  }

  if (!senderNumber) {
    console.log(`\x1b[33m[WA SKIP]\x1b[0m BREVO_WHATSAPP_NUMBER non configuré`);
    return { success: false, skipped: true, reason: 'no_sender_number' };
  }

  try {
    const response = await fetch(BREVO_WA_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        senderNumber,
        contactNumbers: [cleanPhone],
        text,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`\x1b[32m[WA OK]\x1b[0m → ${cleanPhone}`);
      return { success: true, messageId: data.messageId || data.reference || 'wa-' + Date.now() };
    } else {
      console.error(`\x1b[31m[WA ERR]\x1b[0m → ${cleanPhone} | ${data.message || JSON.stringify(data)}`);
      return { success: false, error: data.message || 'Brevo WhatsApp API error' };
    }
  } catch (err) {
    console.error(`\x1b[31m[WA ERR]\x1b[0m → ${cleanPhone} | ${err.message}`);
    return { success: false, error: err.message };
  }
}
