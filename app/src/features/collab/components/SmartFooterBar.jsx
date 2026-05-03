// SmartFooterBar — V1 Smart Footer Performance Bar
// Remplace l'ancienne sticky action bar (Appeler/RDV/SMS/Contact + IA conditionnel)
// par une barre KPI performance live globale (toutes pages collab).
//
// V1 (Q1=A remplacement strict, Q2=A bouton IA conservé, Q3=A localStorage,
//     Q4=A frontend max + 1 SQL backend, Q5=A drill-down V3, Q6=A skip event V1)
//
// 4 KPI fixes V1 :
//   📞 Appels du jour   (backend GET /api/stats/collab/:id/footer-kpis)
//   📅 RDV programmés   (frontend filter bookings)
//   🔥 Intéressés        (frontend filter contacts pipeline_stage='qualifie')
//   ❌ NRP               (frontend filter contacts pipeline_stage='nrp')
//
// + bouton ➕ disabled (placeholder V2 personnalisation)
// + bouton IA conditionnel (parité bannière historique si collab.ai_copilot_enabled)
//
// Position/style : reproduit EXACTEMENT l'ancienne bannière
// (fixed bottom:0, left dynamique selon sidebar, z-index 9989, glassmorphism)
// pour ne rien casser : modaux >= 9990, bannière "RDV à venir" bottom:56 préservée.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { T } from "../../../theme";
import { I } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

const REFRESH_INTERVAL_MS = 60000; // 60s — Q6=A skip event callEnded V1

// Définitions KPI V1 fixes (V2 étendra avec personnalisation localStorage)
const KPI_DEFS = [
  {
    id: 'calls_today',
    emoji: '📞',
    label: 'appels',
    color: '#22C55E',
    source: 'backend',
    backendKey: 'callsToday',
  },
  {
    id: 'rdv_count',
    emoji: '📅',
    label: 'RDV',
    color: '#0EA5E9',
    source: 'bookings',
  },
  {
    id: 'stage_qualifie',
    emoji: '🔥',
    label: 'intéressés',
    color: '#7C3AED',
    source: 'contacts',
    stageId: 'qualifie',
  },
  {
    id: 'stage_nrp',
    emoji: '❌',
    label: 'NRP',
    color: '#EF4444',
    source: 'contacts',
    stageId: 'nrp',
  },
];

const SmartFooterBar = ({ navCollapsed = false }) => {
  const { collab, contacts, bookings, setShowIaWidget } = useCollabContext();
  const [backendStats, setBackendStats] = useState({ callsToday: 0 });

  // Fetch backend stats (1 SQL endpoint)
  const fetchStats = useCallback(() => {
    if (!collab?.id) return;
    api(`/api/stats/collab/${collab.id}/footer-kpis`)
      .then(r => { if (r && !r.error) setBackendStats(r); })
      .catch(() => {});
  }, [collab?.id]);

  // Initial fetch + refresh auto 60s
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Today ISO (yyyy-mm-dd) — pour filtre bookings frontend
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Calcul des valeurs KPI (memoized — recalcule si contacts/bookings/backendStats change)
  const kpiValues = useMemo(() => {
    return KPI_DEFS.map(def => {
      let value = 0;
      if (def.source === 'backend') {
        value = backendStats?.[def.backendKey] || 0;
      } else if (def.source === 'bookings') {
        value = (bookings || []).filter(b =>
          b && b.collaboratorId === collab?.id
          && b.date >= todayISO
          && (b.status === 'confirmed' || !b.status)
        ).length;
      } else if (def.source === 'contacts') {
        value = (contacts || []).filter(c =>
          c && c.assignedTo === collab?.id
          && c.pipeline_stage === def.stageId
          && (!c.archivedAt || c.archivedAt === '')
        ).length;
      }
      return { ...def, value };
    });
  }, [backendStats, bookings, contacts, collab?.id, todayISO]);

  if (!collab?.id) return null;

  const isAiEnabled = !!collab?.ai_copilot_enabled;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: navCollapsed ? 56 : 240,
      right: 0,
      zIndex: 9989,
      padding: '8px 16px',
      background: T.surface + 'EE',
      backdropFilter: 'blur(12px)',
      borderTop: '1px solid ' + T.border,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      transition: 'left .2s ease',
      flexWrap: 'wrap'
    }}>
      {/* KPI chips */}
      {kpiValues.map(kpi => (
        <div
          key={kpi.id}
          title={`${kpi.value} ${kpi.label} — aujourd'hui`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 11px',
            borderRadius: 10,
            background: kpi.color + '12',
            border: '1px solid ' + kpi.color + '25',
            cursor: 'default',
            transition: 'all .12s ease',
            minWidth: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = kpi.color + '20';
            e.currentTarget.style.borderColor = kpi.color + '50';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = kpi.color + '12';
            e.currentTarget.style.borderColor = kpi.color + '25';
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>{kpi.emoji}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text2, lineHeight: 1 }}>{kpi.label}</span>
        </div>
      ))}

      {/* Bouton ➕ disabled V1 (placeholder V2 personnalisation) */}
      <button
        disabled
        title="Personnaliser les KPI (bientôt disponible)"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '5px 11px',
          borderRadius: 10,
          border: '1px dashed ' + T.border,
          background: 'transparent',
          color: T.text3,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'not-allowed',
          opacity: 0.5,
          fontFamily: 'inherit',
          minWidth: 0,
        }}
      >
        ➕
      </button>

      {/* Bouton IA conservé (Q2=A — parité bannière historique) */}
      {isAiEnabled && (
        <button
          onClick={() => { try { setShowIaWidget?.(p => !p); } catch {} }}
          title="Copilot IA"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            padding: '4px 12px',
            borderRadius: 10,
            background: 'transparent',
            border: '1px solid transparent',
            cursor: 'pointer',
            transition: 'all .15s',
            color: '#F97316',
            fontFamily: 'inherit',
            minWidth: 48,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#F9731612';
            e.currentTarget.style.borderColor = '#F9731630';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'transparent';
          }}
        >
          <I n="cpu" s={16} style={{ color: '#F97316' }} />
          <span style={{ fontSize: 8, fontWeight: 700, color: '#F97316' }}>IA</span>
        </button>
      )}
    </div>
  );
};

export default SmartFooterBar;
