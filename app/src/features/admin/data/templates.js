// AdminDash form template constants and helpers
// Extracted from AdminDash.jsx in Phase 9a

export const DEFAULT_TEMPLATES = {
  confirmSms: "✅ {visitorName}, votre RDV est confirmé !\n📅 {date} à {time}\n⏱ {duration}min — {calendarName}\n👤 {collaboratorName}\n📍 {location}\n\nÀ bientôt ! — {companyName}",
  confirmWhatsapp: "✅ *Rendez-vous confirmé !*\n\nBonjour {visitorName},\nVotre rendez-vous est bien enregistré.\n\n📅 {date} à {time}\n⏱ {duration} min — {calendarName}\n👤 {collaboratorName}\n📍 {location}\n\nÀ bientôt ! 😊\n_{companyName} via Calendar360_",
  reminderSms: "🔔 Rappel {visitorName} !\nVotre RDV approche :\n📅 {date} à {time}\n⏱ {duration}min — {calendarName}\n👤 {collaboratorName}\n📍 {location}\n\nOn vous attend ! 😊 — {companyName}",
  reminderWhatsapp: "🔔 *Rappel de rendez-vous*\n\nBonjour {visitorName},\nVotre rendez-vous approche !\n\n📅 {date} à {time}\n⏱ {duration} min — {calendarName}\n👤 {collaboratorName}\n📍 {location}\n\nOn vous attend ! 😊\n_{companyName} via Calendar360_",
};

export const TEMPLATE_VARS = [
  { key: '{visitorName}', example: 'Jean Dupont' },
  { key: '{date}', example: '15 mars 2026' },
  { key: '{time}', example: '14:30' },
  { key: '{duration}', example: '30' },
  { key: '{calendarName}', example: 'Consultation' },
  { key: '{collaboratorName}', example: 'Dr. Martin' },
  { key: '{companyName}', example: 'Mon Cabinet' },
  { key: '{location}', example: 'Paris 8e' },
];

export function applyTemplatePreview(text) {
  let r = text || '';
  for (const v of TEMPLATE_VARS) r = r.replace(new RegExp(v.key.replace(/[{}]/g, '\\$&'), 'g'), v.example);
  return r;
}
