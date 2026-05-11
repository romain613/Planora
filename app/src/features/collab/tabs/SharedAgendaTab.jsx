// V1.10.4.J Phase 2 V1a — Agenda partagé (RDV transmis inter-collaborateurs)
// Mode liste filtrable + accordion détail + timeline réutilisée Phase 1.
// Standalone : ne touche PAS AgendaTab principal. Auto-fetch via /api/bookings/transmitted.
// V1b (grille agenda jour/semaine/mois + stacking) sera ajouté plus tard.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Spinner } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

// ── Constantes ──────────────────────────────────────────────────────────────
const REPORTING_STATUS_META = {
  pending:   { short: 'En attente', color: '#F59E0B', icon: '🟡' },
  validated: { short: 'Validé',     color: '#22C55E', icon: '🟢' },
  signed:    { short: 'Signé',      color: '#16A34A', icon: '✅' },
  no_show:   { short: 'No-show',    color: '#EF4444', icon: '🔴' },
  cancelled: { short: 'Annulé',     color: '#94A3B8', icon: '⚪' },
  follow_up: { short: 'À suivre',   color: '#0EA5E9', icon: '🔵' },
  other:     { short: 'Autre',      color: '#64748B', icon: '⚫' },
};

const DEFAULT_STAGE_LABELS = {
  nouveau:        { label: 'Nouveau',        color: '#94A3B8', emoji: '✨' },
  contacte:       { label: 'Contacté',       color: '#0EA5E9', emoji: '📞' },
  qualifie:       { label: 'Qualifié',       color: '#F59E0B', emoji: '🔥' },
  rdv_programme:  { label: 'RDV programmé',  color: '#2563EB', emoji: '📅' },
  nrp:            { label: 'NRP',            color: '#EF4444', emoji: '❌' },
  client_valide:  { label: 'Client validé',  color: '#22C55E', emoji: '🟢' },
  perdu:          { label: 'Perdu',          color: '#7F1D1D', emoji: '🔴' },
};

const TIMELINE_KIND_META = {
  pipeline_stage:   { icon: '📋', label: 'Stage',    color: '#2563EB' },
  audit:            { icon: '🔍', label: 'Action',   color: '#7C3AED' },
  field_change:     { icon: '✏️', label: 'Champ',    color: '#64748B' },
  booking_created:  { icon: '📅', label: 'RDV créé', color: '#0EA5E9' },
  booking_reported: { icon: '✅', label: 'Reporting',color: '#22C55E' },
  reminder:         { icon: '📧', label: 'Rappel',   color: '#F59E0B' },
  call:             { icon: '📞', label: 'Appel',    color: '#16A34A' },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmtDateTime = (date, time) => {
  if (!date) return '';
  try {
    const d = new Date(date + 'T' + (time || '00:00'));
    if (isNaN(d.getTime())) return date + (time ? ' ' + time : '');
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + (time ? ' à ' + time : '');
  } catch { return date + (time ? ' ' + time : ''); }
};
const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  } catch { return iso; }
};
const toIso = (d) => {
  const dd = new Date(d);
  if (isNaN(dd.getTime())) return '';
  return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
};

// ── Sous-composants ─────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const meta = REPORTING_STATUS_META[status || 'pending'] || REPORTING_STATUS_META.pending;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:12, background:meta.color+'15', border:'1px solid '+meta.color+'40', color:meta.color, fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>
      <span style={{ fontSize:11, lineHeight:1 }}>{meta.icon}</span> {meta.short}
    </span>
  );
};

const DetailRow = ({ label, value }) => (
  <div style={{ display:'flex', flexDirection:'column', gap:2, minWidth:0 }}>
    <span style={{ fontSize:9, fontWeight:700, color:'#9C998F', textTransform:'uppercase', letterSpacing:0.5 }}>{label}</span>
    <span style={{ fontSize:13, fontWeight:600, color:'#1A1917', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value || '—'}</span>
  </div>
);

const TimelineRow = ({ ev, resolveStageMeta }) => {
  const meta = TIMELINE_KIND_META[ev.kind] || { icon:'•', label:ev.kind, color:'#64748B' };
  let summary = '';
  if (ev.kind === 'pipeline_stage') {
    const fromMeta = ev.fromValue ? resolveStageMeta(ev.fromValue) : null;
    const toMeta = ev.toValue ? resolveStageMeta(ev.toValue) : null;
    summary = (fromMeta ? fromMeta.label : (ev.fromValue || '—')) + ' → ' + (toMeta ? toMeta.label : (ev.toValue || '—'));
    if (ev.detail) summary += ' (' + ev.detail + ')';
  } else if (ev.kind === 'audit') {
    summary = ev.action + (ev.detail ? ' — ' + ev.detail : '');
  } else if (ev.kind === 'field_change') {
    summary = ev.field + ' : ' + (ev.fromValue || '—') + ' → ' + (ev.toValue || '—');
  } else if (ev.kind === 'booking_created') {
    summary = 'RDV ' + (ev.bookingType || 'external') + ' le ' + (ev.bookingDate || '?') + ' à ' + (ev.bookingTime || '?');
    if (ev.agendaOwnerName) summary += ' (' + ev.agendaOwnerName + ')';
    if (ev.status === 'cancelled') summary += ' [annulé]';
  } else if (ev.kind === 'booking_reported') {
    summary = 'Reporting ' + (ev.reportingStatus || 'pending') + (ev.note ? ' — ' + ev.note : '');
  } else if (ev.kind === 'reminder') {
    summary = 'Rappel ' + (ev.reminderType || '') + ' via ' + (ev.channel || 'email');
  } else if (ev.kind === 'call') {
    summary = (ev.direction || 'call') + ' · ' + (ev.status || '') + (ev.duration ? ' (' + ev.duration + 's)' : '');
  }
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'6px 0', borderBottom:'1px dashed #E5E2DD' }}>
      <span style={{ fontSize:14, flexShrink:0, lineHeight:1.4 }}>{meta.icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, color:'#1A1917', lineHeight:1.4 }}>
          <span style={{ fontWeight:700, color:meta.color, marginRight:6 }}>{meta.label}</span>
          {summary}
        </div>
        <div style={{ fontSize:10, color:'#9C998F', marginTop:1, display:'flex', alignItems:'center', gap:6 }}>
          {ev.userName && <span><strong>{ev.userName}</strong></span>}
          <span>{fmtDate(ev.createdAt)}</span>
        </div>
      </div>
    </div>
  );
};

// Multi-select dropdown (compact)
const MultiSelect = ({ label, options, selectedIds, onChange, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const selectedCount = selectedIds.length;
  return (
    <div style={{ position:'relative', display:'inline-block' }}>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          padding:'6px 12px', borderRadius:8, border:'1px solid '+T.border,
          background: open ? T.accentBg : T.bg, color: T.text,
          fontSize:12, fontWeight:600, cursor: disabled ? 'not-allowed' : 'pointer',
          display:'inline-flex', alignItems:'center', gap:6, opacity: disabled ? 0.5 : 1,
          fontFamily:'inherit',
        }}
      >
        {label} {selectedCount > 0 && <span style={{ background:T.accent, color:'#fff', padding:'1px 6px', borderRadius:10, fontSize:10 }}>{selectedCount}</span>}
        <I n={open ? 'chevron-up' : 'chevron-down'} s={12}/>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'100%', left:0, marginTop:4, minWidth:220, maxHeight:280, overflowY:'auto', background:T.surface, border:'1px solid '+T.border, borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:100, padding:6 }}>
          {options.length === 0 && <div style={{ padding:8, fontSize:11, color:T.text3, fontStyle:'italic' }}>Aucune option</div>}
          {options.map(opt => {
            const isSel = selectedIds.includes(opt.id);
            return (
              <label key={opt.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, cursor:'pointer', background: isSel ? T.accentBg : 'transparent' }}
                onMouseEnter={e=>e.currentTarget.style.background=T.accentBg}
                onMouseLeave={e=>e.currentTarget.style.background = isSel ? T.accentBg : 'transparent'}
              >
                <input type="checkbox" checked={isSel} onChange={() => {
                  const next = isSel ? selectedIds.filter(x => x !== opt.id) : [...selectedIds, opt.id];
                  onChange(next);
                }} style={{ accentColor:T.accent }}/>
                <span style={{ fontSize:12, color:T.text, flex:1 }}>{opt.name}</span>
              </label>
            );
          })}
          {selectedCount > 0 && (
            <div onClick={() => onChange([])} style={{ marginTop:6, padding:'5px 8px', borderRadius:6, fontSize:10, color:T.text3, cursor:'pointer', textAlign:'center', borderTop:'1px solid '+T.border }}>
              ✕ Tout désélectionner ({selectedCount})
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Composant principal ─────────────────────────────────────────────────────
const SharedAgendaTab = () => {
  const ctx = useCollabContext();
  const { collab, contacts, collabs, PIPELINE_STAGES, showNotif } = ctx;
  const allCollabs = (collabs && collabs.length) ? collabs : [];
  const isAdmin = collab?.role === 'admin' || collab?.role === 'supra';

  // ── Filtres state ─────────────────────────────────────────────────────────
  // Mode défaut : Émis pour collab normal, Tous pour admin
  const [mode, setMode] = useState(() => isAdmin ? 'all' : 'sent');
  const [senderIds, setSenderIds] = useState([]);
  const [receiverIds, setReceiverIds] = useState([]);
  const [reportingStatusFilter, setReportingStatusFilter] = useState([]);
  const [pipelineStageFilter, setPipelineStageFilter] = useState([]);
  const [includeCancelled, setIncludeCancelled] = useState(false);

  // Plage date par défaut : J-30 → J+90
  const todayIso = toIso(new Date());
  const defaultFrom = toIso(new Date(Date.now() - 30 * 86400 * 1000));
  const defaultTo = toIso(new Date(Date.now() + 90 * 86400 * 1000));
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);

  // ── Data state ────────────────────────────────────────────────────────────
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  // ── Accordion + timeline state ────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState(null);
  const [timelineByContact, setTimelineByContact] = useState({});
  const [timelineLoading, setTimelineLoading] = useState({});

  // ── Resolvers ─────────────────────────────────────────────────────────────
  const resolveStageMeta = useCallback((stageId) => {
    if (!stageId) return null;
    if (DEFAULT_STAGE_LABELS[stageId]) return DEFAULT_STAGE_LABELS[stageId];
    if (Array.isArray(PIPELINE_STAGES)) {
      const s = PIPELINE_STAGES.find(x => x?.id === stageId);
      if (s) return { label: s.label || stageId, color: s.color || '#64748B', emoji: '🏷️' };
    }
    return { label: stageId, color: '#64748B', emoji: '🏷️' };
  }, [PIPELINE_STAGES]);

  const collabName = useCallback((id) => {
    if (!id) return '—';
    const c = allCollabs.find(x => x.id === id);
    return c?.name || id;
  }, [allCollabs]);

  const collabColor = useCallback((id) => {
    if (!id) return '#94A3B8';
    const c = allCollabs.find(x => x.id === id);
    return c?.color || '#94A3B8';
  }, [allCollabs]);

  // ── Fetch transmitted bookings ────────────────────────────────────────────
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setErrMsg('');
    try {
      const qs = new URLSearchParams();
      qs.set('mode', mode);
      qs.set('status', includeCancelled ? 'all' : 'confirmed');
      qs.set('from', dateFrom);
      qs.set('to', dateTo);
      if (senderIds.length) qs.set('senders', senderIds.join(','));
      if (receiverIds.length) qs.set('receivers', receiverIds.join(','));
      if (reportingStatusFilter.length) qs.set('reportingStatus', reportingStatusFilter.join(','));
      if (pipelineStageFilter.length) qs.set('pipelineStage', pipelineStageFilter.join(','));
      const data = await api('/api/bookings/transmitted?' + qs.toString());
      if (data && Array.isArray(data.bookings)) setBookings(data.bookings);
      else if (data?.error) setErrMsg(data.error);
      else setBookings([]);
    } catch (e) { setErrMsg(e?.message || 'Erreur réseau'); setBookings([]); }
    setLoading(false);
  }, [mode, includeCancelled, dateFrom, dateTo, senderIds, receiverIds, reportingStatusFilter, pipelineStageFilter]);

  // Refetch quand un filtre change (debounced via dep array)
  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // ── Accordion + lazy timeline ─────────────────────────────────────────────
  const toggleAccordion = useCallback((booking) => {
    if (!booking?.id) return;
    if (expandedId === booking.id) { setExpandedId(null); return; }
    setExpandedId(booking.id);
    const ctId = booking.contactId;
    if (!ctId || timelineByContact[ctId]) return;
    setTimelineLoading(prev => ({ ...prev, [ctId]: true }));
    api('/api/data/contacts/' + encodeURIComponent(ctId) + '/timeline?limit=50')
      .then(data => {
        setTimelineByContact(prev => ({ ...prev, [ctId]: (data && Array.isArray(data.events)) ? data.events : [] }));
      })
      .catch(() => setTimelineByContact(prev => ({ ...prev, [ctId]: [] })))
      .finally(() => setTimelineLoading(prev => ({ ...prev, [ctId]: false })));
  }, [expandedId, timelineByContact]);

  // ── Options pour multi-selects ────────────────────────────────────────────
  const collabOptions = useMemo(() => allCollabs.filter(c => !c.archivedAt).map(c => ({ id: c.id, name: c.name })), [allCollabs]);
  const reportingOptions = useMemo(() => Object.entries(REPORTING_STATUS_META).map(([id, m]) => ({ id, name: m.short })), []);
  const stageOptions = useMemo(() => {
    const defaults = Object.entries(DEFAULT_STAGE_LABELS).map(([id, m]) => ({ id, name: m.label }));
    const custom = Array.isArray(PIPELINE_STAGES) ? PIPELINE_STAGES.filter(s => s && !DEFAULT_STAGE_LABELS[s.id]).map(s => ({ id: s.id, name: s.label || s.id })) : [];
    return [...defaults, ...custom];
  }, [PIPELINE_STAGES]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:16, background:'linear-gradient(135deg,#0EA5E9,#2563EB)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 16px rgba(14,165,233,0.25)' }}>
            <I n="users" s={24} style={{ color:'#fff' }}/>
          </div>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:-0.5 }}>Agenda partagé</h1>
            <p style={{ fontSize:12, color:T.text3, margin:0 }}>Supervision des RDV transmis entre collaborateurs</p>
          </div>
        </div>
        <Btn small onClick={fetchBookings} title="Actualiser">
          <I n="refresh-cw" s={13}/> Actualiser
        </Btn>
      </div>

      {/* ── Toolbar filtres ─────────────────────────────────────────────────── */}
      <Card style={{ padding:14, marginBottom:14 }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' }}>
          {/* Mode toggle */}
          <div style={{ display:'flex', gap:4, padding:3, background:T.bg, borderRadius:10, border:'1px solid '+T.border }}>
            {[
              { id:'sent', label:'Émis', icon:'send' },
              { id:'received', label:'Reçus', icon:'inbox' },
              { id:'all', label:'Tous', icon:'shuffle' },
            ].map(m => (
              <div key={m.id} onClick={() => setMode(m.id)} style={{
                padding:'5px 12px', borderRadius:7, cursor:'pointer',
                background: mode === m.id ? T.accentBg : 'transparent',
                color: mode === m.id ? T.accent : T.text2,
                fontSize:12, fontWeight: mode === m.id ? 700 : 500,
                display:'inline-flex', alignItems:'center', gap:5,
                transition:'all .12s',
              }}>
                <I n={m.icon} s={12}/> {m.label}
              </div>
            ))}
          </div>

          {/* Multi-select : senders / receivers (admin uniquement) */}
          {isAdmin ? (
            <>
              <MultiSelect label="Senders" options={collabOptions} selectedIds={senderIds} onChange={setSenderIds}/>
              <MultiSelect label="Receivers" options={collabOptions} selectedIds={receiverIds} onChange={setReceiverIds}/>
            </>
          ) : (
            <span style={{ fontSize:11, color:T.text3, fontStyle:'italic', padding:'4px 8px' }}>Vue limitée à vos flux (sender ou receiver)</span>
          )}

          {/* Reporting status filter */}
          <MultiSelect label="Reporting" options={reportingOptions} selectedIds={reportingStatusFilter} onChange={setReportingStatusFilter}/>

          {/* Pipeline stage filter */}
          <MultiSelect label="Pipeline" options={stageOptions} selectedIds={pipelineStageFilter} onChange={setPipelineStageFilter}/>

          {/* Dates */}
          <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 8px', borderRadius:8, border:'1px solid '+T.border, background:T.bg }}>
            <span style={{ fontSize:11, color:T.text3 }}>Du</span>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ border:'none', background:'transparent', fontSize:12, fontFamily:'inherit', color:T.text, outline:'none' }}/>
            <span style={{ fontSize:11, color:T.text3 }}>au</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ border:'none', background:'transparent', fontSize:12, fontFamily:'inherit', color:T.text, outline:'none' }}/>
          </div>

          {/* Toggle Annulés */}
          <label style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:8, border:'1px solid '+(includeCancelled ? '#EF4444'+'40' : T.border), background: includeCancelled ? '#EF444412' : T.bg, cursor:'pointer', fontSize:12, fontWeight:600, color: includeCancelled ? '#EF4444' : T.text2 }}>
            <input type="checkbox" checked={includeCancelled} onChange={e=>setIncludeCancelled(e.target.checked)} style={{ accentColor:'#EF4444' }}/>
            Inclure annulés
          </label>
        </div>
      </Card>

      {/* ── Erreur ─────────────────────────────────────────────────────────── */}
      {errMsg && (
        <div style={{ padding:'10px 14px', borderRadius:10, background:'#EF444412', border:'1px solid #EF444430', color:'#EF4444', fontSize:12, marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
          <I n="alert-circle" s={14}/> {errMsg}
        </div>
      )}

      {/* ── Liste ──────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner/></div>
      )}

      {!loading && bookings.length === 0 && !errMsg && (
        <Card style={{ padding:40, textAlign:'center' }}>
          <I n="users" s={36} style={{ color:T.text3, marginBottom:12 }}/>
          <div style={{ fontSize:14, fontWeight:600, color:T.text2, marginBottom:4 }}>Aucun RDV transmis</div>
          <div style={{ fontSize:12, color:T.text3 }}>Aucun RDV ne correspond aux filtres actuels.</div>
        </Card>
      )}

      {!loading && bookings.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>{bookings.length} RDV trouvé{bookings.length>1?'s':''}</div>
          {bookings.map(b => {
            const isExpanded = expandedId === b.id;
            const isCancelled = b.status === 'cancelled';
            const stageMeta = resolveStageMeta(b.receiverPipelineStage);
            const reportingStatus = b.bookingReportingStatus || '';
            const senderColor = collabColor(b.bookedByCollaboratorId);
            const receiverColor = collabColor(b.agendaOwnerId);
            const tlEvents = (b.contactId && timelineByContact[b.contactId]) || [];
            const tlLoading = b.contactId && timelineLoading[b.contactId];

            return (
              <Card key={b.id} style={{ padding:0, overflow:'hidden', borderLeft:`4px solid ${receiverColor}`, opacity: isCancelled ? 0.7 : 1 }}>
                {/* Ligne principale cliquable */}
                <div
                  onClick={() => toggleAccordion(b)}
                  style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap', padding:14, cursor:'pointer', background: isExpanded ? T.accentBg + '40' : 'transparent', transition:'background .15s' }}
                  title={isExpanded ? 'Fermer le détail' : 'Voir le détail + timeline'}
                >
                  <div style={{ width:42, height:42, borderRadius:14, background:receiverColor+'18', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <I n="calendar" s={18} style={{ color:receiverColor }}/>
                  </div>
                  <div style={{ flex:1, minWidth:200 }}>
                    {/* Ligne 1 — nom contact + badges */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                      <span style={{ fontSize:14, fontWeight:700, color:T.text }}>{b.contactName || b.visitorName || 'Sans nom'}</span>
                      {b.contactPhone && (
                        <span style={{ fontSize:11, color:T.text3, display:'inline-flex', alignItems:'center', gap:3 }}>
                          <I n="phone" s={11}/> {b.contactPhone}
                        </span>
                      )}
                      {isCancelled && (
                        <span style={{ fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:4, background:'#EF444415', color:'#EF4444', border:'1px solid #EF444440' }}>🚫 ANNULÉ</span>
                      )}
                      <StatusBadge status={reportingStatus}/>
                      {stageMeta && (
                        <span title={`Statut actuel : ${stageMeta.label}`} style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10, background:stageMeta.color+'15', border:'1px solid '+stageMeta.color+'40', color:stageMeta.color, display:'inline-flex', alignItems:'center', gap:4 }}>
                          <span style={{ fontSize:11, lineHeight:1 }}>{stageMeta.emoji}</span> {stageMeta.label}
                        </span>
                      )}
                    </div>
                    {/* Ligne 2 — métadonnées (date RDV, sender→receiver, créé le) */}
                    <div style={{ fontSize:12, color:T.text2, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <I n="clock" s={11} style={{ color:T.text3 }}/>
                      <span>{fmtDateTime(b.date, b.time)}</span>
                      <span style={{ color:T.text3 }}>·</span>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                        <span style={{ display:'inline-block', width:10, height:10, borderRadius:5, background:senderColor }}/>
                        <span style={{ fontWeight:600 }}>{collabName(b.bookedByCollaboratorId)}</span>
                        <span style={{ color:T.text3 }}>→</span>
                        <span style={{ display:'inline-block', width:10, height:10, borderRadius:5, background:receiverColor }}/>
                        <span style={{ fontWeight:600 }}>{collabName(b.agendaOwnerId)}</span>
                      </span>
                      {b.createdAt && (
                        <>
                          <span style={{ color:T.text3 }}>·</span>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:4 }} title="Date de création du RDV">
                            <I n="plus-circle" s={11} style={{ color:T.text3 }}/>
                            <span style={{ color:T.text3 }}>Créé le</span>
                            <span style={{ fontWeight:600 }}>{fmtDate(b.createdAt)}</span>
                          </span>
                        </>
                      )}
                    </div>
                    {b.bookingReportingNote && (
                      <div style={{ marginTop:6, padding:'6px 10px', borderRadius:8, background:T.bg, border:'1px solid '+T.border, fontSize:12, color:T.text2 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:T.text3, marginRight:6 }}>Note :</span>
                        {b.bookingReportingNote}
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink:0, alignSelf:'center', color:T.text3 }}>
                    <I n={isExpanded ? 'chevron-up' : 'chevron-down'} s={16}/>
                  </div>
                </div>

                {/* Accordion détail */}
                {isExpanded && (
                  <div style={{ borderTop:'1px solid '+T.border, background:T.bg, padding:'14px 18px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'8px 18px', marginBottom:14 }}>
                      <DetailRow label="Contact" value={b.contactName || b.visitorName}/>
                      <DetailRow label="Email" value={b.contactEmail || b.visitorEmail}/>
                      <DetailRow label="Téléphone" value={b.contactPhone || b.visitorPhone}/>
                      <DetailRow label="Sender" value={collabName(b.bookedByCollaboratorId)}/>
                      <DetailRow label="Receiver" value={collabName(b.agendaOwnerId)}/>
                      <DetailRow label="Date RDV" value={fmtDateTime(b.date, b.time)}/>
                      <DetailRow label="Créé le" value={b.createdAt ? fmtDate(b.createdAt) : '—'}/>
                      <DetailRow label="Statut RDV" value={isCancelled ? '🚫 Annulé' : '✅ Confirmé'}/>
                      <DetailRow label="Statut reporting" value={REPORTING_STATUS_META[reportingStatus || 'pending']?.short || '—'}/>
                      <DetailRow label="Statut pipeline" value={stageMeta ? stageMeta.label : '—'}/>
                      {b.bookingReportedBy && b.bookingReportedAt && (
                        <DetailRow label="Reporté par" value={collabName(b.bookingReportedBy) + ' (' + fmtDate(b.bookingReportedAt) + ')'}/>
                      )}
                    </div>

                    {/* Timeline */}
                    <div style={{ marginTop:8 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:T.text2, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                        <I n="clock" s={12}/> Timeline ({tlEvents.length} derniers événements)
                      </div>
                      {tlLoading && <div style={{ padding:'12px 0', textAlign:'center' }}><Spinner size={16}/></div>}
                      {!tlLoading && tlEvents.length === 0 && (
                        <div style={{ fontSize:12, color:T.text3, fontStyle:'italic', padding:'8px 0' }}>Aucun événement historique.</div>
                      )}
                      {!tlLoading && tlEvents.length > 0 && (
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          {tlEvents.map((ev, idx) => <TimelineRow key={(ev.id || idx) + ':' + ev.kind} ev={ev} resolveStageMeta={resolveStageMeta}/>)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SharedAgendaTab;
