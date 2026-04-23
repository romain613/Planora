import { emailLayout } from './layout.js';

export function welcomeEmail(data) {
  const { name, email, password, code, companyName } = data;

  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="width:64px;height:64px;border-radius:32px;background:#EFF6FF;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
        <span style="font-size:28px;">👋</span>
      </div>
      <h1 style="font-size:24px;font-weight:800;color:#1A1917;margin:0 0 6px;letter-spacing:-0.5px;">Bienvenue sur Calendar360 !</h1>
      <p style="font-size:14px;color:#5C5A54;margin:0;">Bonjour ${name}, votre compte collaborateur a été créé pour <strong>${companyName}</strong>.</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F5F2;border-radius:12px;border:1px solid #E4E2DD;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">📧 EMAIL</span><br/>
              <span style="font-size:15px;font-weight:700;color:#1A1917;">${email}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">🔑 MOT DE PASSE</span><br/>
              <span style="font-size:18px;font-weight:800;color:#2563EB;font-family:monospace;letter-spacing:2px;">${password}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;">
              <span style="font-size:12px;color:#9C998F;font-weight:600;">🔢 CODE D'ACCÈS</span><br/>
              <span style="font-size:18px;font-weight:800;color:#059669;font-family:monospace;letter-spacing:2px;">${code}</span>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:0 0 12px;">
          <a href="https://calendar360.fr" target="_blank" style="display:inline-block;padding:12px 32px;background:#2563EB;color:#ffffff;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;">
            Se connecter
          </a>
        </td>
      </tr>
    </table>

    <p style="font-size:12px;color:#9C998F;text-align:center;margin:16px 0 0;">
      Vous pouvez vous connecter avec votre email + mot de passe ou avec votre code d'accès.
    </p>
  `;

  return {
    subject: `👋 Bienvenue ${name} — Vos identifiants Calendar360`,
    html: emailLayout('Bienvenue', body),
  };
}
