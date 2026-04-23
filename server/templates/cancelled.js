import { emailLayout, formatDate } from './layout.js';

export function cancelledEmail(data) {
  const { visitorName, date, time, calendarName, collaboratorName, companyName, rebookUrl } = data;

  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="width:64px;height:64px;border-radius:32px;background:#FEF2F2;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
        <span style="font-size:28px;">❌</span>
      </div>
      <h1 style="font-size:24px;font-weight:800;color:#1A1917;margin:0 0 6px;letter-spacing:-0.5px;">Rendez-vous annulé</h1>
      <p style="font-size:14px;color:#5C5A54;margin:0;">Bonjour ${visitorName}, votre rendez-vous a été annulé.</p>
    </div>

    <!-- Cancelled details -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF2F2;border-radius:12px;border:1px solid #FECACA;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <p style="font-size:14px;color:#DC2626;font-weight:600;margin:0 0 8px;">Rendez-vous annulé :</p>
        <p style="font-size:15px;font-weight:700;color:#1A1917;margin:0 0 4px;">${calendarName}</p>
        <p style="font-size:13px;color:#5C5A54;margin:0;">📅 ${formatDate(date)} · 🕐 ${time}${collaboratorName ? ` · 👤 ${collaboratorName}` : ''}</p>
      </td></tr>
    </table>

    <p style="font-size:13px;color:#5C5A54;text-align:center;margin:0 0 24px;">
      Si cette annulation est une erreur, vous pouvez reprendre rendez-vous ci-dessous.
    </p>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="${rebookUrl || '#'}" target="_blank" style="display:inline-block;padding:12px 32px;background:#2563EB;color:#ffffff;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;">
            Reprendre un rendez-vous
          </a>
        </td>
      </tr>
    </table>
  `;

  return {
    subject: `❌ RDV annulé — ${calendarName} du ${formatDate(date)}`,
    html: emailLayout('Rendez-vous annulé', body),
  };
}
