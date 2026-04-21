// Source unique de vérité des brands frontend.
// Planora = core interne ; chaque entrée ici = un brand visible assis dessus.
// Étape 1 (2026-04-21) : une seule entrée `calendar360`, brand par défaut.

export const BRANDS = {
  calendar360: {
    id: 'calendar360',
    name: 'Calendar360',
    legalName: 'COMPETENCES FIRST',
    domain: 'calendar360.fr',
    email: {
      support: 'support@calendar360.fr',
      noreply: 'noreply@calendar360.fr',
    },
    brevoSender: 'Calendar360',
    smsSender: 'Calendar360',
    favicon: '/favicon.svg',
    logoText: 'Calendar360',
    poweredByVisible: true,
    isDefault: true,
  },
};

export const DEFAULT_BRAND_ID = 'calendar360';
