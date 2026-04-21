// Phase L3 — Chip visuel compact affiché sur les cartes lead du pipeline collab.
//
// Contrat strict :
//   - Render null si envelope absente/null/undefined (aucun DOM node).
//   - Zéro event handler (hors tooltip title natif). Ne perturbe pas le drag.
//   - 14-16 px, positioned en coin haut-droit via wrapper (position:absolute géré
//     par le parent, ce composant est neutre sur le layout).
//   - priority='high' → ring subtile rouge. medium/low → aucune emphase additionnelle.

import React from 'react';
import I from './I.jsx';
import {
  resolveEnvelopeIcon,
  resolveEnvelopePriority,
  DEFAULT_ENVELOPE_COLOR,
} from '../../features/admin/data/envelopeOptions.js';

export default function EnvelopeBadge({ envelope, size = 16 }) {
  if (!envelope) return null;
  const color = envelope.color || DEFAULT_ENVELOPE_COLOR;
  const icon = resolveEnvelopeIcon(envelope.icon);
  const priorityMeta = resolveEnvelopePriority(envelope.priority);
  const isHigh = envelope.priority === 'high';
  const iconPx = Math.round(size * 0.65);
  const tooltip = `${envelope.name || ''} — ${priorityMeta.label}`.trim();

  return (
    <div
      title={tooltip}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 3),
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        boxShadow: isHigh ? `0 0 0 1.5px ${priorityMeta.color}, 0 0 6px ${priorityMeta.color}60` : 'none',
        pointerEvents: 'none',
        flexShrink: 0,
      }}
    >
      <I n={icon} s={iconPx} />
    </div>
  );
}
