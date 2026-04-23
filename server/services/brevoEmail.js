/**
 * Brevo Transactional Email Service
 * Documentation: https://developers.brevo.com/reference/sendtransacemail
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export async function sendEmail({ to, toName, subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@calendar360.fr';
  const senderName = process.env.BREVO_SENDER_NAME || 'Calendar360';

  if (!apiKey || apiKey === 'your-brevo-api-key-here') {
    console.log(`\x1b[33m[EMAIL DEMO]\x1b[0m → ${to}`);
    console.log(`  📧 Sujet: ${subject}`);
    console.log(`  📝 Contenu: ${htmlContent.replace(/<[^>]*>/g, '').substring(0, 120)}...`);
    return { success: true, demo: true, messageId: 'demo-' + Date.now() };
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`\x1b[32m[EMAIL OK]\x1b[0m → ${to} | ${subject}`);
      return { success: true, messageId: data.messageId };
    } else {
      console.error(`\x1b[31m[EMAIL ERR]\x1b[0m → ${to} | ${data.message || JSON.stringify(data)}`);
      return { success: false, error: data.message || 'Brevo API error' };
    }
  } catch (err) {
    console.error(`\x1b[31m[EMAIL ERR]\x1b[0m → ${to} | ${err.message}`);
    return { success: false, error: err.message };
  }
}
