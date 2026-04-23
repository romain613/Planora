/**
 * Twilio SMS Service — Calendar360
 * Envoi de SMS via Twilio (pour les collabs avec numéro Twilio assigné)
 * Fallback : brevoSms.js pour les collabs sans numéro Twilio
 */

import twilio from 'twilio';
import { cleanPhone } from './twilioVoip.js';

// Raccourcisseurs URL interdits (ARCEP France)
const FORBIDDEN_SHORTENERS = /bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|bl\.ink|short\.io|cutt\.ly/i;

/**
 * Envoie un SMS via Twilio
 * @param {string} from - Numéro Twilio de l'expéditeur (format E.164)
 * @param {string} to - Numéro du destinataire
 * @param {string} content - Contenu du SMS
 * @returns {{ success: boolean, messageSid?: string, error?: string, demo?: boolean }}
 */
export async function sendTwilioSms({ from, to, content }) {
  try {
    if (!to || !content) return { success: false, error: 'to et content requis' };
    if (!from) return { success: false, error: 'from (numéro Twilio) requis' };

    // Normaliser les numéros
    const cleanTo = cleanPhone(to);
    const cleanFrom = cleanPhone(from);

    if (!cleanTo || cleanTo.length < 10) return { success: false, error: 'Numéro destinataire invalide' };

    // Compliance FR : raccourcisseurs URL interdits
    if (FORBIDDEN_SHORTENERS.test(content)) {
      return { success: false, error: 'Les raccourcisseurs d\'URL sont interdits dans les SMS (réglementation ARCEP)' };
    }

    // Mode demo si credentials absents
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken || accountSid === 'demo' || accountSid.startsWith('AC_TEST')) {
      console.log(`\x1b[33m[SMS-TWILIO DEMO]\x1b[0m ${cleanFrom} → ${cleanTo} : ${content.slice(0, 50)}...`);
      return { success: true, demo: true, messageSid: 'demo-twilio-sms-' + Date.now() };
    }

    // Envoi via Twilio
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({
      from: cleanFrom,
      to: cleanTo,
      body: content,
    });

    console.log(`\x1b[32m[SMS-TWILIO OK]\x1b[0m ${cleanFrom} → ${cleanTo} SID:${message.sid} (${content.length} chars)`);
    return { success: true, messageSid: message.sid };
  } catch (err) {
    console.error(`\x1b[31m[SMS-TWILIO ERR]\x1b[0m ${err.message}`);
    return { success: false, error: err.message };
  }
}
