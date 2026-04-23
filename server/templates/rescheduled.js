import { emailLayout, formatDate } from './layout.js';

export function rescheduledEmail(data) {
  const { visitorName, date, time, newDate, newTime, calendarName, collaboratorName, companyName, duration, location } = data;

  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="width:64px;height:64px;border-radius:32px;background:#FFFBEB;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
        <span style="font-size:28px;">🔄</span>
      </div>
      <h1 style="font-size:24px;font-weight:800;color:#1A1917;margin:0 0 6px;letter-spacing:-0.5px;">Rendez-vous replanifié</h1>
      <p style="font-size:14px;color:#5C5A54;margin:0;">Bonjour ${visitorName}, votre rendez-vous a été déplacé.</p>
    </div>

    <!-- Old → New comparison -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="48%" style="vertical-align:top;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF2F2;border-radius:12px;border:1px solid #FECACA;">
            <tr><td style="padding:16px 20px;text-align:center;">
              <p style="font-size:11px;color:#DC2626;font-weight:700;margin:0 0 6px;text-transform:uppercase;">Ancien créneau</p>
              <p style="font-size:14px;font-weight:700;color:#1A1917;margin:0;text-decoration:line-through;opacity:0.6;">${formatDate(date)}</p>
              <p style="font-size:14px;color:#5C5A54;margin:2px 0 0;text-decoration:line-through;opacity:0.6;">${time}</p>
            </td></tr>
          </table>
        </td>
        <td width="4%" style="text-align:center;vertical-align:middle;font-size:20px;color:#9C998F;">→</td>
        <td width="48%" style="vertical-align:top;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ECFDF5;border-radius:12px;border:1px solid #A7F3D0;">
            <tr><td style="padding:16px 20px;text-align:center;">
              <p style="font-size:11px;color:#059669;font-weight:700;margin:0 0 6px;text-transform:uppercase;">Nouveau créneau</p>
              <p style="font-size:14px;font-weight:700;color:#1A1917;margin:0;">${formatDate(newDate || date)}</p>
              <p style="font-size:14px;font-weight:700;color:#059669;margin:2px 0 0;">${newTime || time}</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Details -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F5F2;border-radius:12px;border:1px solid #E4E2DD;margin-bottom:24px;">
      <tr><td style="padding:16px 24px;">
        <span style="font-size:13px;color:#5C5A54;">📋 ${calendarName} · ${duration} min${collaboratorName ? ` · 👤 ${collaboratorName}` : ''}${location ? ` · 📍 ${location}` : ''}</span>
      </td></tr>
    </table>

    <p style="font-size:13px;color:#5C5A54;text-align:center;margin:0 0 24px;">${companyName}</p>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="#" style="display:inline-block;padding:12px 32px;background:#2563EB;color:#ffffff;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;">
            Ajouter à mon calendrier
          </a>
        </td>
      </tr>
    </table>
  `;

  return {
    subject: `🔄 RDV replanifié — ${calendarName} maintenant le ${formatDate(newDate || date)} à ${newTime || time}`,
    html: emailLayout('Rendez-vous replanifié', body),
  };
}
