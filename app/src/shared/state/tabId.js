// V3 — TAB ISOLATION : identifiant unique par onglet, volatile, jamais persisté.
// Généré 1× par chargement de tab, utilisé côté backend pour distinguer les
// écritures concurrentes d'un même user dans plusieurs onglets.

export const TAB_ID = crypto.randomUUID
  ? crypto.randomUUID()
  : 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
