// V1.10.3 P3 — Bloc "📊 Suivi RDV transmis" dans la fiche contact
// Affiche les bookings share_transfer du contact + statuts reporting + actions.
// Visible côté sender, receiver, admin/supra. Auto-masqué si rien à afficher.

import React from "react";
import { T } from "../../../../../theme";
import { I } from "../../../../../shared/ui";
import { useCollabContext } from "../../../context/CollabContext";

// Statuts reporting (cohérent avec RdvReportingTab)
const STATUS_META = {
  pending:   { short: 'En attente',  color: '#F59E0B', icon: '🟡' },
  validated: { short: 'Validé',      color: '#22C55E', icon: '🟢' },
  signed:    { short: 'Signé',       color: '#16A34A', icon: '✅' },
  no_show:   { short: 'No-show',     color: '#EF4444', icon: '🔴' },
  cancelled: { short: 'Annulé',      color: '#94A3B8', icon: '⚪' },
  follow_up: { short: 'À suivre',    color: '#0EA5E9', icon: '🔵' },
  other:     { short: 'Autre',       color: '#64748B', icon: '⚫' },
};

const _capName = (n) => {
  const s = String(n || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
};

const fmtSlot = (date, time) => {
  if (!date) return '';
  try {
    const d = new Date(date + 'T' + (time || '00:00'));
    if (isNaN(d.getTime())) return date + (time ? ' à ' + time : '');
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + (time ? ' à ' + time : '');
  } catch {
    return date + (time ? ' à ' + time : '');
  }
};

const FicheReportingBlock = ({ ct }) => {
  const {
    collab, collabs, bookings,
    isAdminView,
    setPortalTab, setSelectedCrmContact,
  } = useCollabContext();

  if (!ct?.id) return null;

  const _isAdmin = collab?.role === 'admin' || collab?.role === 'supra' || isAdminView;

  // 1. Filtrer les bookings share_transfer du contact (hors cancelled)
  const allBk = (bookings || []).filter(
    b => b.contactId === ct.id
      && b.bookingType === 'share_transfer'
      && b.status !== 'cancelled'
  );

  // 2. Visibilité stricte : sender, receiver, admin, supra
  const visible = allBk.filter(b => {
    if (_isAdmin) return true;
    return b.bookedByCollaboratorId === collab.id || b.agendaOwnerId === collab.id;
  });

  if (visible.length === 0) return null;

  const collabName = (id) => {
    if (!id) return '—';
    const c = (collabs || []).find(x => x.id === id);
    return c?.name || id;
  };

  return (
    <div style={{
      marginBottom: 14,
      padding: 12,
      borderRadius: 12,
      background: '#F9731608',
      border: '1.5px solid #F9731635',
    }}>
      {/* Header bloc */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9,
          background: '#F9731620',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <I n="bar-chart-3" s={15} style={{ color: '#9A3412' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#9A3412', letterSpacing: -0.2 }}>
            📊 Suivi RDV transmis
          </div>
          <div style={{ fontSize: 10, color: T.text3 }}>
            {visible.length} RDV transmis sur ce contact
          </div>
        </div>
      </div>

      {/* Liste des bookings transmis */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(b => {
          const isSender = b.bookedByCollaboratorId === collab.id;
          const isReceiver = b.agendaOwnerId === collab.id;
          const senderName = collabName(b.bookedByCollaboratorId);
          const receiverName = collabName(b.agendaOwnerId);

          const status = b.bookingReportingStatus || '';
          const meta = STATUS_META[status] || STATUS_META.pending;

          // Header label selon rôle
          const headerLabel = (_isAdmin && !isSender && !isReceiver)
            ? `🤝 ${_capName(senderName)} → ${_capName(receiverName)}`
            : isSender
              ? `🤝 Transmis à ${_capName(receiverName)}`
              : `🤝 Reçu de ${_capName(senderName)}`;

          const slot = fmtSlot(b.date, b.time);
          const reporterId = b.bookingReportedBy || '';
          const reportedAt = b.bookingReportedAt || '';
          const canReportFromHere = isReceiver && !status;

          return (
            <div key={b.id} style={{
              padding: 10,
              borderRadius: 10,
              background: T.surface,
              border: '1px solid ' + T.border,
            }}>
              {/* Ligne 1 — Rôle + statut */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{headerLabel}</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '2px 8px', borderRadius: 10,
                  background: meta.color + '15',
                  border: '1px solid ' + meta.color + '40',
                  color: meta.color,
                  fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                }}>
                  <span>{meta.icon}</span> {meta.short}
                </span>
              </div>

              {/* Ligne 2 — Date RDV */}
              <div style={{ fontSize: 11, color: T.text2, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <I n="clock" s={11} style={{ color: T.text3, flexShrink: 0 }} />
                <span>{slot || '—'}</span>
              </div>

              {/* Note si présente */}
              {b.bookingReportingNote && (
                <div style={{
                  marginTop: 6,
                  padding: '6px 9px',
                  borderRadius: 8,
                  background: T.bg,
                  border: '1px solid ' + T.border,
                  fontSize: 11, color: T.text2, lineHeight: 1.5,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: T.text3, marginRight: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Note</span>
                  {b.bookingReportingNote}
                </div>
              )}

              {/* Méta reporting (qui + quand) */}
              {reporterId && reportedAt && (
                <div style={{ marginTop: 4, fontSize: 9, color: T.text3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <I n="check-circle" s={9} />
                  Rapporté par {collabName(reporterId)} · {(() => { try { return new Date(reportedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return reportedAt; } })()}
                </div>
              )}

              {/* CTA "Faire le reporting" — receiver only, status vide */}
              {canReportFromHere && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    // Ferme la fiche puis nav vers le tab Reporting RDV
                    if (typeof setSelectedCrmContact === 'function') setSelectedCrmContact(null);
                    if (typeof setPortalTab === 'function') setPortalTab('rdv-reporting');
                  }}
                  style={{
                    marginTop: 8,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 12px',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg,#7C3AED,#2563EB)',
                    color: '#fff',
                    fontSize: 11, fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(124,58,237,0.25)',
                  }}
                >
                  <I n="check-square" s={11} style={{ color: '#fff' }} /> Faire le reporting
                </div>
              )}

              {/* Sous-texte sender — reporting en attente */}
              {isSender && !status && (
                <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: '#F59E0B14', color: '#92400E', fontSize: 10, fontWeight: 700 }}>
                  ⏳ En attente de reporting
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FicheReportingBlock;
