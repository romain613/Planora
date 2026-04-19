// Shared constants and pure helpers (extracted from App.jsx Phase 1A)

export const COMMON_TIMEZONES = ["Europe/Paris","Europe/London","Europe/Berlin","Europe/Brussels","Europe/Zurich","Europe/Madrid","Europe/Rome","America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Toronto","America/Montreal","America/Sao_Paulo","Asia/Dubai","Asia/Tokyo","Asia/Shanghai","Asia/Singapore","Asia/Kolkata","Australia/Sydney","Pacific/Auckland","Africa/Casablanca","Indian/Reunion"];

export const genCode = () => {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = ""; for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
};
