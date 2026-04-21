// Phase L2/L3 — Options d'identité visuelle des enveloppes de leads.
// Liste business-first, focalisée sur la SOURCE du lead (aucune confusion
// avec les features d'appel/power dialer — `zap`/`phone` écartés d'office).
//
// Règle : les clés d'icône DOIVENT exister dans app/src/shared/ui/I.jsx.
// Si une icône stockée en DB n'est pas dans cette liste (legacy ou déprécié
// comme `zap`/`inbox`/`mail`), le rendu fallback sur DEFAULT_ENVELOPE_ICON.

import { I } from '../../../shared/ui';

export const DEFAULT_ENVELOPE_COLOR = '#6366F1';
export const DEFAULT_ENVELOPE_ICON = 'star';
export const DEFAULT_ENVELOPE_PRIORITY = 'medium';

// Liste curated — 10 icônes, orientées source de lead.
// Ordre = ordre d'affichage dans le dropdown (star en premier = défaut).
export const ENVELOPE_ICONS = [
  { key: 'star', label: 'Premium' },
  { key: 'mail', label: 'Email' },
  { key: 'tag', label: 'Campagne / Ads' },
  { key: 'globe', label: 'Web' },
  { key: 'map', label: 'Local' },
  { key: 'target', label: 'Inbound / Lead' },
  { key: 'user', label: 'Contact direct' },
  { key: 'building', label: 'Partenaire' },
  { key: 'users', label: 'Groupe / Référal' },
  { key: 'phone', label: 'Téléphone' },
];

const ICON_KEYS = new Set(ENVELOPE_ICONS.map((i) => i.key));

export function resolveEnvelopeIcon(iconName) {
  return ICON_KEYS.has(iconName) ? iconName : DEFAULT_ENVELOPE_ICON;
}

export const ENVELOPE_PRIORITIES = [
  { key: 'high', label: 'Haute', color: '#DC2626', accent: 'rgba(220,38,38,0.1)' },
  { key: 'medium', label: 'Moyenne', color: '#6366F1', accent: 'rgba(99,102,241,0.08)' },
  { key: 'low', label: 'Basse', color: '#94A3B8', accent: 'rgba(148,163,184,0.08)' },
];

const PRIORITY_KEYS = new Set(ENVELOPE_PRIORITIES.map((p) => p.key));

export function resolveEnvelopePriority(priority) {
  const key = PRIORITY_KEYS.has(priority) ? priority : DEFAULT_ENVELOPE_PRIORITY;
  return ENVELOPE_PRIORITIES.find((p) => p.key === key);
}
