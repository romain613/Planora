import { emailLayout, formatDate, tzNoticeHtml } from './layout.js';

function buildGoogleCalUrl(data) {
  const { date, time, duration, calendarName, collaboratorName, companyName, location } = data;
  const start = date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
  const h = Math.floor((duration || 30) / 60);
  const m = (duration || 30) % 60;
  const endDate = new Date(`${date}T${time}:00`);
  endDate.setMinutes(endDate.getMinutes() + (duration || 30));
  const end = endDate.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const title = encodeURIComponent(`${calendarName} — ${companyName}`);
  const details = encodeURIComponent(`RDV avec ${collaboratorName || companyName}\nOrganisé via Calendar360`);
  const loc = encodeURIComponent(location || '');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${loc}`;
}

export function bookingConfirmedEmail(data) {
  const { visitorName, date, time, duration, calendarName, collaboratorName, companyName, location, meetLink, manageToken } = data;
  const gcalUrl = buildGoogleCalUrl(data);
  const manageUrl = manageToken ? `https://calendar360.fr/manage/${manageToken}` : '';

  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="width:64px;height:64px;border-radius:32px;background:#ECFDF5;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
        <span style="font-size:28px;">✅</span>
      </div>
      <h1 style="font-size:24px;font-weight:800;color:#1A1917;margin:0 0 6px;letter-spacing:-0.5px;">Rendez-vous confirmé !</h1>
      <p style="font-size:14px;color:#5C5A54;margin:0;">Bonjour ${visitorName}, votre rendez-vous est confirmé.</p>
    </div>

    <!-- Details Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F5F2;border-radius:12px;border:1px solid #E4E2DD;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">📅 DATE</span><br/>
              <span style="font-size:15px;font-weight:700;color:#1A1917;">${formatDate(date)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">🕐 HEURE</span><br/>
              <span style="font-size:15px;font-weight:700;color:#1A1917;">${data.visitorTime && data.visitorTime !== time ? data.visitorTime : time} · ${duration} minutes</span>
              ${tzNoticeHtml(data)}
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">📋 TYPE</span><br/>
              <span style="font-size:15px;font-weight:700;color:#1A1917;">${calendarName}</span>
            </td>
          </tr>
          ${collaboratorName ? `<tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">👤 AVEC</span><br/>
              <span style="font-size:15px;font-weight:700;color:#1A1917;">${collaboratorName}</span>
            </td>
          </tr>` : ''}
          ${location ? `<tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">📍 LIEU</span><br/>
              <span style="font-size:15px;font-weight:700;color:#1A1917;">${meetLink ? 'Google Meet (lien ci-dessous)' : location}</span>
            </td>
          </tr>` : ''}
          ${meetLink ? `<tr>
            <td style="padding:10px 0 4px;">
              <a href="${meetLink}" target="_blank" style="display:inline-block;padding:10px 24px;background:#00897B;color:#ffffff;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">
                📹 Rejoindre Google Meet
              </a>
              <div style="margin-top:6px;font-size:11px;color:#9C998F;word-break:break-all;">${meetLink}</div>
            </td>
          </tr>` : ''}
        </table>
      </td></tr>
    </table>

    <!-- Company -->
    <p style="font-size:13px;color:#5C5A54;text-align:center;margin:0 0 24px;">
      Organisé par <strong>${companyName}</strong>
    </p>

    <!-- CTA Buttons -->
    <table width="100%" cellpadding="0" cellspacing="0">
      ${meetLink ? `<tr>
        <td align="center" style="padding:0 0 12px;">
          <a href="${meetLink}" target="_blank" style="display:inline-block;padding:14px 36px;background:#00897B;color:#ffffff;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;">
            📹 Rejoindre Google Meet
          </a>
        </td>
      </tr>` : ''}
      <tr>
        <td align="center" style="padding:0 0 12px;">
          <a href="${gcalUrl}" target="_blank" style="display:inline-block;padding:12px 32px;background:#2563EB;color:#ffffff;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;">
            📅 Ajouter à Google Agenda
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:0 0 8px;">
          <a href="https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(calendarName + ' — ' + companyName)}&startdt=${date}T${time}:00&enddt=${date}T${time}:00&location=${encodeURIComponent(location || '')}&body=${encodeURIComponent('RDV avec ' + (collaboratorName || companyName) + ' — via Calendar360')}" target="_blank" style="display:inline-block;padding:10px 28px;background:#ffffff;color:#2563EB;border:2px solid #2563EB;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;">
            📧 Ajouter à Outlook
          </a>
        </td>
      </tr>
      ${manageUrl ? `<tr>
        <td align="center" style="padding:16px 0 0;">
          <a href="${manageUrl}" target="_blank" style="font-size:12px;color:#64748B;text-decoration:none;">Modifier ou annuler ce rendez-vous</a>
        </td>
      </tr>` : ''}
    </table>
  `;

  return {
    subject: `✅ RDV confirmé — ${calendarName} le ${formatDate(date)} à ${time}`,
    html: emailLayout('Rendez-vous confirmé', body),
  };
}

function applyCustomTemplate(template, data) {
  return template
    .replace(/\{visitorName\}/g, data.visitorName || '')
    .replace(/\{date\}/g, formatDate(data.date))
    .replace(/\{time\}/g, data.time || '')
    .replace(/\{duration\}/g, data.duration || '30')
    .replace(/\{calendarName\}/g, data.calendarName || '')
    .replace(/\{collaboratorName\}/g, data.collaboratorName || data.companyName || '')
    .replace(/\{companyName\}/g, data.companyName || '')
    .replace(/\{location\}/g, data.location || 'À définir');
}

export function bookingConfirmedSms(data) {
  if (data.customConfirmSms) return applyCustomTemplate(data.customConfirmSms, data);
  const meetPart = data.meetLink ? `\n📹 Meet: ${data.meetLink}` : '';
  return `✅ ${data.visitorName}, votre RDV est confirmé !\n📅 ${formatDate(data.date)} à ${data.time}\n⏱ ${data.duration}min — ${data.calendarName}\n👤 ${data.collaboratorName || data.companyName}\n📍 ${data.meetLink ? 'Google Meet' : (data.location || 'À définir')}${meetPart}\n\nÀ bientôt ! — ${data.companyName}`;
}

export function bookingConfirmedWhatsapp(data) {
  if (data.customConfirmWhatsapp) return applyCustomTemplate(data.customConfirmWhatsapp, data);
  const meetPart = data.meetLink ? `\n📹 Google Meet: ${data.meetLink}` : '';
  return `✅ *Rendez-vous confirmé !*\n\nBonjour ${data.visitorName},\nVotre rendez-vous est bien enregistré.\n\n📅 ${formatDate(data.date)} à ${data.time}\n⏱ ${data.duration} min — ${data.calendarName}\n👤 ${data.collaboratorName || data.companyName}\n📍 ${data.meetLink ? 'Google Meet' : (data.location || 'À définir')}${meetPart}\n\nÀ bientôt ! 😊\n_${data.companyName} via Calendar360_`;
}
