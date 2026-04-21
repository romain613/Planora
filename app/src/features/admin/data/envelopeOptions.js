// Phase L2 — Options d'identité visuelle des enveloppes de leads.
// Source de vérité : liste fixe, dropdown admin, pas de texte libre.
//
// Règle : les clés d'icône DOIVENT exister dans app/src/shared/ui/I.jsx.
// Si une icône stockée en DB n'est pas dans cette liste (legacy), le rendu
// fallback sur DEFAULT_ENVELOPE_ICON.

import { I } from '../../../shared/ui';

export const DEFAULT_ENVELOPE_COLOR = '#6366F1';
export const DEFAULT_ENVELOPE_ICON = 'mail';
export const DEFAULT_ENVELOPE_PRIORITY = 'medium';

export const ENVELOPE_ICONS = [
  { key: 'mail', label: 'Email' },
  { key: 'phone', label: 'Téléphone' },
  { key: 'globe', label: 'Web' },
  { key: 'building', label: 'Entreprise' },
  { key: 'tag', label: 'Campagne' },
  { key: 'target', label: 'Cible' },
  { key: 'star', label: 'Premium' },
  { key: 'zap', label: 'Urgent' },
  { key: 'flag', label: 'Priorité' },
  { key: 'users', label: 'Groupe' },
  { key: 'award', label: 'Récompense' },
  { key: 'bell', label: 'Alerte' },
  { key: 'layers', label: 'Lot' },
  { key: 'send', label: 'Envoi' },
  { key: 'shield', label: 'Qualifié' },
  { key: 'dollar', label: 'Chaud' },
  { key: 'list', label: 'Liste' },
  { key: 'trending', label: 'Tendance' },
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
