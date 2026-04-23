import { emailLayout, formatDate, formatTzName } from './layout.js';

/**
 * Email sent to the collaborator when a new booking is made
 */
export function newBookingNotifyEmail(data) {
  const { visitorName, visitorEmail, visitorPhone, date, time, duration, calendarName, collaboratorName, companyName, location, meetLink } = data;

  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="width:64px;height:64px;border-radius:32px;background:#EFF6FF;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
        <span style="font-size:28px;">🔔</span>
      </div>
      <h1 style="font-size:24px;font-weight:800;color:#1A1917;margin:0 0 6px;letter-spacing:-0.5px;">Nouveau rendez-vous !</h1>
      <p style="font-size:14px;color:#5C5A54;margin:0;">${collaboratorName}, un nouveau RDV vient d'être réservé.</p>
    </div>

    <!-- Details Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F5F2;border-radius:12px;border:1px solid #E4E2DD;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">👤 CLIENT</span><br/>
              <span style="font-size:15px;font-weight:700;color:#1A1917;">${visitorName}</span>
              ${visitorEmail ? `<br/><span style="font-size:13px;color:#5C5A54;">${visitorEmail}</span>` : ''}
              ${visitorPhone ? `<br/><span style="font-size:13px;color:#5C5A54;">${visitorPhone}</span>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">📅 DATE</span><br/>
              <span style="font-size:15px;font-weight:700;color:#1A1917;">${formatDate(date)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">🕐 HEURE</span><br/>
              <span style="font-size:15px;font-weight:700;color:#1A1917;">${time} · ${duration} minutes</span>
              ${data.visitorTimezone && data.collaboratorTimezone && data.visitorTimezone !== data.collaboratorTimezone
                ? `<br/><span style="font-size:12px;color:#9C998F;">🌍 Fuseau du client : ${formatTzName(data.visitorTimezone)}</span>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">📋 TYPE</span><br/>
              <span style="font-size:15px;font-weight:700;color:#1A1917;">${calendarName}</span>
            </td>
          </tr>
          ${location ? `<tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">📍 LIEU</span><br/>
              <span style="font-size:15px;font-weight:700;color:#1A1917;">${meetLink ? 'Google Meet' : location}</span>
            </td>
          </tr>` : ''}
          ${meetLink ? `<tr>
            <td style="padding:10px 0 4px;">
              <a href="${meetLink}" target="_blank" style="display:inline-block;padding:10px 24px;background:#00897B;color:#ffffff;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">
                📹 Lien Google Meet
              </a>
              <div style="margin-top:6px;font-size:11px;color:#9C998F;word-break:break-all;">${meetLink}</div>
            </td>
          </tr>` : ''}
        </table>
      </td></tr>
    </table>

    <p style="font-size:13px;color:#5C5A54;text-align:center;margin:0 0 24px;">
      Connectez-vous sur <a href="https://calendar360.fr" style="color:#2563EB;text-decoration:none;font-weight:600;">Calendar360</a> pour gérer vos rendez-vous.
    </p>
  `;

  return {
    subject: `🔔 Nouveau RDV — ${visitorName} le ${formatDate(date)} à ${time}`,
    html: emailLayout('Nouveau rendez-vous', body),
  };
}

export function newBookingNotifySms(data) {
  const meetPart = data.meetLink ? `\n📹 Meet: ${data.meetLink}` : '';
  return `🔔 Nouveau RDV !\n👤 ${data.visitorName}\n📅 ${formatDate(data.date)} à ${data.time}\n⏱ ${data.duration}min — ${data.calendarName}\n📍 ${data.meetLink ? 'Google Meet' : (data.location || 'À définir')}${meetPart}\n\n— ${data.companyName}`;
}
