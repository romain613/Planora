/**
 * Calendar360 Email Layout — Shared HTML wrapper
 * Uses exact Calendar360 brand colors for consistency
 */

export function emailLayout(title, bodyContent) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#F6F5F2;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F5F2;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <!-- Header -->
        <tr><td style="padding:0 0 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:16px 0;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="width:36px;height:36px;background:linear-gradient(135deg,#2563EB,#3B82F6);border-radius:10px;text-align:center;vertical-align:middle;">
                    <span style="color:#fff;font-weight:800;font-size:16px;line-height:36px;">C</span>
                  </td>
                  <td style="padding-left:10px;font-size:20px;font-weight:800;color:#1A1917;letter-spacing:-0.5px;">Calendar360</td>
                </tr></table>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Body Card -->
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:16px;border:1px solid #E4E2DD;overflow:hidden;">
            <tr><td style="padding:36px 32px;">
              ${bodyContent}
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 0;text-align:center;">
          <p style="font-size:12px;color:#9C998F;margin:0 0 8px;">Cet email a été envoyé par Calendar360 pour le compte de votre praticien.</p>
          <p style="font-size:11px;color:#9C998F;margin:0;">
            <a href="#" style="color:#2563EB;text-decoration:none;">Se désinscrire</a> ·
            <a href="#" style="color:#2563EB;text-decoration:none;">Politique de confidentialité</a>
          </p>
          <p style="font-size:11px;color:#D6D3CC;margin:12px 0 0;">© 2026 Calendar360. Tous droits réservés.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Format date "Mar 10 Mars 2026" */
export function formatDate(dateStr) {
  const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Format timezone name for display in emails */
export function formatTzName(tz) {
  if (!tz) return '';
  try {
    const name = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, timeZoneName: 'long' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value;
    return name || tz;
  } catch { return tz; }
}

/** Build timezone notice HTML for emails (only if TZs differ) */
export function tzNoticeHtml(data) {
  if (!data.visitorTimezone || !data.collaboratorTimezone || data.visitorTimezone === data.collaboratorTimezone) return '';
  const visitorTime = data.visitorTime || data.time;
  return `<div style="background:#FFF7ED;border:1px solid #FDBA7422;border-radius:8px;padding:10px 14px;margin-top:8px;font-size:12px;color:#9A3412;">
    🌍 Votre heure : <strong>${visitorTime}</strong> (${formatTzName(data.visitorTimezone)})<br/>
    Heure du praticien : <strong>${data.time}</strong> (${formatTzName(data.collaboratorTimezone)})
  </div>`;
}
