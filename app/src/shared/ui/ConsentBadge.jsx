// ═══════════════════════════════════════════════════════════════════════
// ConsentBadge — Phase 5
// Pastille visuelle du statut de consentement (7 états + non-applicable).
// Usage : <ConsentBadge status="validated" /> ou {leads.map(l => <ConsentBadge .../>)}
// ═══════════════════════════════════════════════════════════════════════

import React from "react";

const STATUS_MAP = {
  not_requested: { icon: '⚪', label: 'Non demandé', color: '#94A3B8', bg: '#F1F5F9' },
  pending:       { icon: '🕓', label: 'En attente',  color: '#64748B', bg: '#F1F5F9' },
  sms_sent:      { icon: '🟠', label: 'SMS envoyé',  color: '#EA580C', bg: '#FFEDD5' },
  clicked:       { icon: '🟡', label: 'Lien cliqué', color: '#CA8A04', bg: '#FEF9C3' },
  validated:     { icon: '🟢', label: 'Approuvé',    color: '#15803D', bg: '#DCFCE7' },
  refused:       { icon: '🔴', label: 'Refusé',      color: '#B91C1C', bg: '#FEE2E2' },
  revoked:       { icon: '🔴', label: 'Révoqué',     color: '#B91C1C', bg: '#FEE2E2' },
  expired:       { icon: '⚫', label: 'Expiré',      color: '#475569', bg: '#E2E8F0' },
};

/**
 * @param {object} props
 * @param {string} [props.status]            consent status from incoming_leads.consentStatus
 * @param {boolean} [props.callable]         optional explicit callable flag
 * @param {boolean} [props.consentRequired]  if false, badge shows as "—" (workflow classique)
 * @param {'compact'|'full'} [props.variant] compact = icon only, full = icon + label
 */
export default function ConsentBadge({ status, callable, consentRequired = true, variant = 'compact', title }) {
  // Workflow classique (envelope consent disabled) → discreet em-dash
  if (consentRequired === false) {
    return (
      <span title={title || 'Consentement non requis (workflow classique)'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#F8FAFC', color: '#94A3B8', fontSize: 11, fontWeight: 600 }}>
        —
      </span>
    );
  }

  const cfg = STATUS_MAP[status] || STATUS_MAP.not_requested;
  const tip = title || `${cfg.label}${callable === true ? ' (appelable)' : callable === false && status === 'validated' ? ' (callable=0 — sync ?)' : ''}`;

  if (variant === 'compact') {
    return (
      <span title={tip}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 999, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700, lineHeight: 1.2 }}>
        <span style={{ fontSize: 10 }}>{cfg.icon}</span>
        {cfg.label}
      </span>
    );
  }
  // full
  return (
    <span title={tip}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: cfg.bg, color: cfg.color, fontSize: 12, fontWeight: 700 }}>
      <span style={{ fontSize: 13 }}>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}
