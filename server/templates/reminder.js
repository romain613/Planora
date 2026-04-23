import { emailLayout, formatDate, tzNoticeHtml } from './layout.js';

export function reminderEmail(data) {
  const { visitorName, date, time, duration, calendarName, collaboratorName, companyName, location, manageToken } = data;
  const manageUrl = manageToken ? `https://calendar360.fr/manage/${manageToken}` : '';
  const start = date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
  const endDate = new Date(`${date}T${time}:00`);
  endDate.setMinutes(endDate.getMinutes() + (duration || 30));
  const end = endDate.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calendarName + ' — ' + companyName)}&dates=${start}/${end}&details=${encodeURIComponent('RDV avec ' + (collaboratorName || companyName) + ' — via Calendar360')}&location=${encodeURIComponent(location || '')}`;

  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="width:64px;height:64px;border-radius:32px;background:#EFF6FF;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
        <span style="font-size:28px;">🔔</span>
      </div>
      <h1 style="font-size:24px;font-weight:800;color:#1A1917;margin:0 0 6px;letter-spacing:-0.5px;">Rappel de votre rendez-vous</h1>
      <p style="font-size:14px;color:#5C5A54;margin:0;">Bonjour ${visitorName}, votre rendez-vous approche.</p>
    </div>

    <!-- Countdown Banner -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#2563EB,#3B82F6);border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:20px;text-align:center;">
        <p style="font-size:13px;color:rgba(255,255,255,0.8);margin:0 0 4px;">Votre rendez-vous est prévu</p>
        <p style="font-size:22px;font-weight:800;color:#ffffff;margin:0;">${formatDate(date)} à ${data.visitorTime && data.visitorTime !== time ? data.visitorTime : time}</p>
      </td></tr>
    </table>

    <!-- Details -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F5F2;border-radius:12px;border:1px solid #E4E2DD;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;">
              <span style="font-size:13px;color:#5C5A54;">📋 <strong>${calendarName}</strong> · ${duration} min</span>
            </td>
          </tr>
          ${collaboratorName ? `<tr><td style="padding:4px 0;">
            <span style="font-size:13px;color:#5C5A54;">👤 avec <strong>${collaboratorName}</strong></span>
          </td></tr>` : ''}
          ${location ? `<tr><td style="padding:4px 0;">
            <span style="font-size:13px;color:#5C5A54;">📍 <strong>${location}</strong></span>
          </td></tr>` : ''}
          <tr><td style="padding:4px 0;">
            <span style="font-size:13px;color:#5C5A54;">🏢 ${companyName}</span>
          </td></tr>
        </table>
      </td></tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:0 0 12px;">
          <a href="${gcalUrl}" target="_blank" style="display:inline-block;padding:12px 32px;background:#2563EB;color:#ffffff;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;">
            ✅ Voir dans mon agenda
          </a>
        </td>
      </tr>
      ${manageUrl ? `<tr>
        <td align="center" style="padding:8px 0 0;">
          <a href="${manageUrl}" target="_blank" style="font-size:13px;color:#DC2626;text-decoration:none;font-weight:600;">Je ne pourrai pas venir — annuler ou reprogrammer</a>
        </td>
      </tr>` : ''}
    </table>
  `;

  return {
    subject: `🔔 Rappel — ${calendarName} le ${formatDate(date)} à ${time}`,
    html: emailLayout('Rappel de rendez-vous', body),
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

export function reminderSms(data) {
  if (data.customReminderSms) return applyCustomTemplate(data.customReminderSms, data);
  return `🔔 Rappel ${data.visitorName} !\nVotre RDV approche :\n📅 ${formatDate(data.date)} à ${data.time}\n⏱ ${data.duration}min — ${data.calendarName}\n👤 ${data.collaboratorName || data.companyName}\n📍 ${data.location || 'À définir'}\n\nOn vous attend ! 😊 — ${data.companyName}`;
}

export function reminderWhatsapp(data) {
  if (data.customReminderWhatsapp) return applyCustomTemplate(data.customReminderWhatsapp, data);
  return `🔔 *Rappel de rendez-vous*\n\nBonjour ${data.visitorName},\nVotre rendez-vous approche !\n\n📅 ${formatDate(data.date)} à ${data.time}\n⏱ ${data.duration} min — ${data.calendarName}\n👤 ${data.collaboratorName || data.companyName}\n📍 ${data.location || 'À définir'}\n\nOn vous attend ! 😊\n_${data.companyName} via Calendar360_`;
}
