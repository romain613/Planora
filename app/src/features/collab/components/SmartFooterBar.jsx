// SmartFooterBar — V2 personnalisation KPI par collaborateur
// V1 : remplaçait sticky action bar globale par 4 KPI fixes (📞 appels, 📅 RDV, 🔥 intéressés, ❌ NRP)
//      + bouton ➕ disabled + bouton IA conditionnel.
// V2 : ➕ activé → popover ancré → ajout KPI dynamiques (stages PIPELINE_STAGES résolus du collab),
//      retirables 1 par 1 (✕ au hover), persist localStorage par collab,
//      multi-add (popover reste ouvert), max 6 KPI.
//
// Décisions Q1-Q4 MH 2026-05-03 :
// - Q1 ✅ A : KPI tous retirables (perso totale, y compris fixes V1)
// - Q2 ✅ B : popover reste ouvert pour multi-add
// - Q3 ✅ A : skip métriques avancées V2 (pipeline stages only)
// - Q4 ✅ A : skip bouton reset V2

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { T } from "../../../theme";
import { I } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

const REFRESH_INTERVAL_MS = 60000;
const MAX_KPIS = 6;

// Mapping emoji par stage id (cohérent V3.x PostCallResultModal STAGE_ICON_MAP).
// Stage custom (id non listé) → emoji fallback générique 🏷️.
const STAGE_EMOJI_MAP = {
  nouveau:        '✨',
  contacte:       '📞',
  qualifie:       '🔥',
  rdv_programme:  '📅',
  nrp:            '❌',
  client_valide:  '🟢',
  perdu:          '🔴',
  // Variants/customs courants (best effort) :
  interesse:      '🔥',
  en_discussion:  '📞',
  callback:       '🔁',
  gagne:          '🟢',
  not_interested: '👎',
  voicemail:      '📩',
  no_answer:      '🔕',
};

const getStageEmoji = (stageId) => STAGE_EMOJI_MAP[stageId] || '🏷️';

// V1 fixes (sont des KPI sources backend ou bookings, pas pipeline_stage)
const KPI_FIXED_DEFS = {
  calls_today: {
    id: 'calls_today',
    emoji: '📞',
    label: 'appels',
    color: '#22C55E',
    source: 'backend',
    backendKey: 'callsToday',
  },
  rdv_count: {
    id: 'rdv_count',
    emoji: '📅',
    label: 'RDV',
    color: '#0EA5E9',
    source: 'bookings',
  },
};

const DEFAULT_KPI_IDS = ['calls_today', 'rdv_count', 'stage_qualifie', 'stage_nrp'];

// --- localStorage helpers (Q1+Q3 = perso totale par collab, persist V2) ---
const KPI_STORAGE_KEY = (collabId) => `c360-footer-kpis-${collabId || 'default'}`;

const loadKpiList = (collabId) => {
  try {
    const raw = localStorage.getItem(KPI_STORAGE_KEY(collabId));
    if (!raw) return DEFAULT_KPI_IDS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_KPI_IDS;
    return parsed.slice(0, MAX_KPIS); // garde-fou
  } catch {
    return DEFAULT_KPI_IDS;
  }
};

const saveKpiList = (collabId, list) => {
  try {
    localStorage.setItem(KPI_STORAGE_KEY(collabId), JSON.stringify(list.slice(0, MAX_KPIS)));
  } catch {}
};

// --- Builder KPI def à partir id (V1 fixe OU stage_<id> dynamique) ---
const buildKpiDef = (kpiId, PIPELINE_STAGES) => {
  // V1 fixe ?
  if (KPI_FIXED_DEFS[kpiId]) return KPI_FIXED_DEFS[kpiId];
  // Stage dynamique ?
  if (kpiId.startsWith('stage_')) {
    const stageId = kpiId.slice(6);
    const stage = (PIPELINE_STAGES || []).find(s => s.id === stageId);
    if (!stage) return null; // stage retiré du pipeline → orphelin filtré (R2)
    return {
      id: kpiId,
      emoji: getStageEmoji(stageId),
      label: (stage.label || stageId).toLowerCase(),
      color: stage.color || T.text2,
      source: 'contacts',
      stageId,
    };
  }
  return null;
};

const SmartFooterBar = ({ navCollapsed = false }) => {
  const { collab, contacts, bookings, PIPELINE_STAGES, setShowIaWidget } = useCollabContext();
  const [backendStats, setBackendStats] = useState({ callsToday: 0 });
  const [kpiList, setKpiList] = useState(() => loadKpiList(collab?.id));
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [hoveredKpi, setHoveredKpi] = useState(null);
  const popoverRef = useRef(null);
  const addBtnRef = useRef(null);

  // Recharge la liste si change de collab
  useEffect(() => {
    setKpiList(loadKpiList(collab?.id));
  }, [collab?.id]);

  // Fetch backend stats (1 SQL endpoint) + auto-refresh
  const fetchStats = useCallback(() => {
    if (!collab?.id) return;
    api(`/api/stats/collab/${collab.id}/footer-kpis`)
      .then(r => { if (r && !r.error) setBackendStats(r); })
      .catch(() => {});
  }, [collab?.id]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Click outside popover → ferme
  useEffect(() => {
    if (!showAddMenu) return;
    const onDocClick = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        addBtnRef.current && !addBtnRef.current.contains(e.target)
      ) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showAddMenu]);

  // Today ISO pour filtre bookings
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Génère les KPI affichables : intersection kpiList × définitions valides (R2 filter orphelin)
  const kpis = useMemo(() => {
    return kpiList
      .map(id => buildKpiDef(id, PIPELINE_STAGES))
      .filter(Boolean) // drop orphelins
      .slice(0, MAX_KPIS)
      .map(def => {
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
  }, [kpiList, backendStats, bookings, contacts, collab?.id, todayISO, PIPELINE_STAGES]);

  // KPI candidats à ajouter : V1 fixes (si pas déjà) + stages pipeline (filter 'nouveau' + déjà ajoutés)
  const availableKpis = useMemo(() => {
    const activeIds = new Set(kpiList);
    const candidates = [];
    // V1 fixes non encore ajoutés
    Object.values(KPI_FIXED_DEFS).forEach(def => {
      if (!activeIds.has(def.id)) candidates.push({ ...def, _kpiId: def.id });
    });
    // Stages PIPELINE_STAGES (exclude 'nouveau')
    (PIPELINE_STAGES || []).forEach(s => {
      if (!s || s.id === 'nouveau') return;
      const kpiId = 'stage_' + s.id;
      if (activeIds.has(kpiId)) return;
      candidates.push({
        _kpiId: kpiId,
        emoji: getStageEmoji(s.id),
        label: s.label || s.id,
        color: s.color || T.text2,
      });
    });
    return candidates;
  }, [kpiList, PIPELINE_STAGES]);

  const limitReached = kpiList.length >= MAX_KPIS;

  const addKpi = (kpiId) => {
    if (limitReached) return;
    if (kpiList.includes(kpiId)) return;
    const next = [...kpiList, kpiId];
    setKpiList(next);
    saveKpiList(collab?.id, next);
    // Q2=B : popover reste ouvert pour multi-add
  };

  const removeKpi = (kpiId) => {
    const next = kpiList.filter(id => id !== kpiId);
    setKpiList(next);
    saveKpiList(collab?.id, next);
    setHoveredKpi(null);
  };

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
      {/* KPI chips (retirables au hover) */}
      {kpis.map(kpi => {
        const showRemove = hoveredKpi === kpi.id;
        return (
          <div
            key={kpi.id}
            title={`${kpi.value} ${kpi.label} — aujourd'hui`}
            onMouseEnter={() => setHoveredKpi(kpi.id)}
            onMouseLeave={() => setHoveredKpi(null)}
            style={{
              position: 'relative',
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
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>{kpi.emoji}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.text2, lineHeight: 1 }}>{kpi.label}</span>
            {/* Bouton ✕ retirer (Q1=A tous retirables, hover only) */}
            {showRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); removeKpi(kpi.id); }}
                title="Retirer ce KPI"
                style={{
                  marginLeft: 2,
                  padding: 0,
                  width: 16, height: 16,
                  borderRadius: 4,
                  border: 'none',
                  background: kpi.color + '40',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 11,
                  lineHeight: 1,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = kpi.color + '90'}
                onMouseLeave={e => e.currentTarget.style.background = kpi.color + '40'}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}

      {/* Bouton ➕ activé V2 (popover anchor) */}
      <div style={{ position: 'relative' }}>
        <button
          ref={addBtnRef}
          onClick={() => setShowAddMenu(s => !s)}
          disabled={limitReached && !showAddMenu}
          title={limitReached ? `Maximum ${MAX_KPIS} KPI atteint` : 'Ajouter un indicateur'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '5px 11px',
            borderRadius: 10,
            border: '1px dashed ' + (showAddMenu ? T.accent : T.border),
            background: showAddMenu ? (T.accentBg || (T.accent + '12')) : 'transparent',
            color: showAddMenu ? T.accent : T.text3,
            fontSize: 13,
            fontWeight: 600,
            cursor: limitReached ? 'not-allowed' : 'pointer',
            opacity: limitReached ? 0.5 : 1,
            fontFamily: 'inherit',
            minWidth: 0,
            transition: 'all .12s ease',
          }}
        >
          ➕
        </button>

        {/* Popover ancré sous le bouton (s'ouvre vers le haut car footer en bas écran) */}
        {showAddMenu && (
          <div
            ref={popoverRef}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              right: 0,
              minWidth: 260,
              maxWidth: 320,
              maxHeight: 360,
              overflowY: 'auto',
              padding: 10,
              borderRadius: 14,
              background: T.surface,
              border: `1px solid ${T.border}`,
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
              zIndex: 9991,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>Ajouter un indicateur</div>
              <button
                onClick={() => setShowAddMenu(false)}
                title="Fermer"
                style={{ padding: 2, border: 'none', background: 'transparent', cursor: 'pointer', color: T.text3, fontSize: 14, lineHeight: 1, fontFamily: 'inherit' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Statuts pipeline & métriques
            </div>

            {availableKpis.length === 0 ? (
              <div style={{ padding: '12px 8px', fontSize: 12, color: T.text3, textAlign: 'center', fontStyle: 'italic' }}>
                {limitReached ? `Maximum ${MAX_KPIS} KPI atteint` : 'Tous les KPI disponibles sont déjà ajoutés'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {availableKpis.map(item => (
                  <button
                    key={item._kpiId}
                    onClick={() => addKpi(item._kpiId)}
                    disabled={limitReached}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: `1px solid ${item.color}25`,
                      background: 'transparent',
                      cursor: limitReached ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all .12s ease',
                      opacity: limitReached ? 0.4 : 1,
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => { if (!limitReached) { e.currentTarget.style.background = item.color + '12'; e.currentTarget.style.borderColor = item.color + '60'; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = item.color + '25'; }}
                  >
                    <span style={{ fontSize: 14, lineHeight: 1 }}>{item.emoji}</span>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: T.text, lineHeight: 1.2 }}>{item.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: item.color }}>+</span>
                  </button>
                ))}
              </div>
            )}

            <div style={{ marginTop: 8, padding: '6px 8px', borderTop: `1px solid ${T.border}`, fontSize: 10, color: T.text3, textAlign: 'center' }}>
              {kpiList.length} / {MAX_KPIS} KPI affichés
            </div>
          </div>
        )}
      </div>

      {/* Bouton IA conservé (Q2 V1 = A — parité bannière historique) */}
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
