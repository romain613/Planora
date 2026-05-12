// V1.10.3 Phase 3 — Reporting Collab RDV (frontend)
// V1.10.4.I — Accordion détaillé + Créé le + Statut pipeline actuel + Timeline 50 events.
// V1.10.4.J merge — Agenda partagé devient parent-tab interne (Reporting | Agenda partagé).
// Onglet collab : 2 sous-vues "Reçus" / "Transmis" + modal "Faire le reporting"
// Dépendances : api (HTTP), T theme, I/Btn/Card/Spinner (UI), useCollabContext (collab+showNotif)

import React, { useState, useEffect, useCallback } from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Spinner } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";
import SharedAgendaTab from "./SharedAgendaTab"; // V1.10.4.J merge — Agenda partagé en parent-tab

// ── Enum + libellés FR + badges (source : brief MH 2026-04-27) ─────────────
const REPORTING_STATUSES = ['pending', 'validated', 'signed', 'no_show', 'cancelled', 'follow_up', 'other'];
const NOTE_REQUIRED_STATUSES = ['signed', 'cancelled', 'no_show', 'follow_up', 'other'];

const STATUS_META = {
  pending:   { label: 'Reporting en attente', short: 'En attente', color: '#F59E0B', icon: '🟡' },
  validated: { label: 'RDV validé',           short: 'Validé',     color: '#22C55E', icon: '🟢' },
  signed:    { label: 'Signé',                short: 'Signé',      color: '#16A34A', icon: '✅' },
  no_show:   { label: 'No-show',              short: 'No-show',    color: '#EF4444', icon: '🔴' },
  cancelled: { label: 'Annulé',               short: 'Annulé',     color: '#94A3B8', icon: '⚪' },
  follow_up: { label: 'À suivre',             short: 'À suivre',   color: '#0EA5E9', icon: '🔵' },
  other:     { label: 'Autre',                short: 'Autre',      color: '#64748B', icon: '⚫' },
};

// V1.10.4.I — Labels pipeline_stage par défaut (fallback si PIPELINE_STAGES context absent).
const DEFAULT_STAGE_LABELS = {
  nouveau:        { label: 'Nouveau',        color: '#94A3B8', emoji: '✨' },
  contacte:       { label: 'Contacté',       color: '#0EA5E9', emoji: '📞' },
  qualifie:       { label: 'Qualifié',       color: '#F59E0B', emoji: '🔥' },
  rdv_programme:  { label: 'RDV programmé',  color: '#2563EB', emoji: '📅' },
  nrp:            { label: 'NRP',            color: '#EF4444', emoji: '❌' },
  client_valide:  { label: 'Client validé',  color: '#22C55E', emoji: '🟢' },
  perdu:          { label: 'Perdu',          color: '#7F1D1D', emoji: '🔴' },
};

// V1.10.4.I — Icones + libellés timeline par kind d'événement.
const TIMELINE_KIND_META = {
  pipeline_stage:   { icon: '📋', label: 'Stage',    color: '#2563EB' },
  audit:            { icon: '🔍', label: 'Action',   color: '#7C3AED' },
  field_change:     { icon: '✏️', label: 'Champ',    color: '#64748B' },
  booking_created:  { icon: '📅', label: 'RDV créé', color: '#0EA5E9' },
  booking_reported: { icon: '✅', label: 'Reporting',color: '#22C55E' },
  reminder:         { icon: '📧', label: 'Rappel',   color: '#F59E0B' },
  call:             { icon: '📞', label: 'Appel',    color: '#16A34A' },
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  } catch { return iso; }
};

const fmtDateTime = (date, time) => {
  if (!date) return '';
  try {
    const d = new Date(date + 'T' + (time || '00:00'));
    if (isNaN(d.getTime())) return date + (time ? ' ' + time : '');
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + (time ? ' à ' + time : '');
  } catch { return date + (time ? ' ' + time : ''); }
};

const StatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 12,
      background: meta.color + '15', border: '1px solid ' + meta.color + '40',
      color: meta.color, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap'
    }}>
      <span style={{ fontSize: 11, lineHeight: 1 }}>{meta.icon}</span> {meta.short}
    </span>
  );
};

// V1.10.4.I — DetailRow accordion : label + value 2 lignes compact.
const DetailRow = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    <span style={{ fontSize: 9, fontWeight: 700, color: '#9C998F', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</span>
  </div>
);

// V1.10.4.I — TimelineRow : ligne d'événement compacte avec icône + collab + détail + date.
const TimelineRow = ({ ev, resolveStageMeta, collabName }) => {
  const meta = TIMELINE_KIND_META[ev.kind] || { icon: '•', label: ev.kind, color: '#64748B' };
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
    summary = 'RDV ' + (ev.bookingType || 'external') + ' pour le ' + (ev.bookingDate || '?') + ' à ' + (ev.bookingTime || '?');
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
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderBottom: '1px dashed #E5E2DD' }}>
      <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>{meta.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#1A1917', lineHeight: 1.4 }}>
          <span style={{ fontWeight: 700, color: meta.color, marginRight: 6 }}>{meta.label}</span>
          {summary}
        </div>
        <div style={{ fontSize: 10, color: '#9C998F', marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          {ev.userName && <span><strong>{ev.userName}</strong></span>}
          <span>{fmtDate(ev.createdAt)}</span>
        </div>
      </div>
    </div>
  );
};

// ── Composant principal ─────────────────────────────────────────────────────
const RdvReportingTab = () => {
  const ctx = useCollabContext();
  const { collab, contacts, collabs, PIPELINE_STAGES, showNotif, handleCollabUpdateContact } = ctx;
  const allCollabs = (collabs && collabs.length) ? collabs : [];

  // V1.10.4.J merge — Parent-tab : Reporting | Agenda partagé. Défaut : reporting.
  const _mainTabStorageKey = `c360-rdv-reporting-main-tab-${collab?.id || 'default'}`;
  const [mainTab, setMainTab] = useState(() => {
    try { const v = localStorage.getItem(_mainTabStorageKey); return v === 'shared' ? 'shared' : 'reporting'; } catch { return 'reporting'; }
  });
  useEffect(() => { try { localStorage.setItem(_mainTabStorageKey, mainTab); } catch {} }, [mainTab, _mainTabStorageKey]);

  const [subTab, setSubTab] = useState('received'); // 'received' | 'sent'
  const [loadingReceived, setLoadingReceived] = useState(false);
  const [loadingSent, setLoadingSent] = useState(false);
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [errMsg, setErrMsg] = useState('');

  // V1.10.4.I — Accordion + timeline state
  const [expandedId, setExpandedId] = useState(null);
  const [timelineByContact, setTimelineByContact] = useState({});
  const [timelineLoading, setTimelineLoading] = useState({});

  // Modal reporting
  const [reportingBooking, setReportingBooking] = useState(null);
  const [reportStatus, setReportStatus] = useState('validated');
  const [reportNote, setReportNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // V1.10.4.I — Resolve pipeline stage meta (label, color, emoji) avec fallback default.
  const resolveStageMeta = useCallback((stageId) => {
    if (!stageId) return null;
    if (DEFAULT_STAGE_LABELS[stageId]) return DEFAULT_STAGE_LABELS[stageId];
    if (Array.isArray(PIPELINE_STAGES)) {
      const s = PIPELINE_STAGES.find(x => x?.id === stageId);
      if (s) return { label: s.label || stageId, color: s.color || '#64748B', emoji: '🏷️' };
    }
    return { label: stageId, color: '#64748B', emoji: '🏷️' };
  }, [PIPELINE_STAGES]);

  // V1.10.4.I — Toggle accordion + fetch timeline si pas en cache.
  const toggleAccordion = useCallback((booking) => {
    if (!booking?.id) return;
    if (expandedId === booking.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(booking.id);
    const ctId = booking.contactId;
    if (!ctId) return;
    if (timelineByContact[ctId]) return; // déjà en cache
    setTimelineLoading(prev => ({ ...prev, [ctId]: true }));
    api('/api/data/contacts/' + encodeURIComponent(ctId) + '/timeline?limit=50')
      .then(data => {
        if (data && Array.isArray(data.events)) {
          setTimelineByContact(prev => ({ ...prev, [ctId]: data.events }));
        } else {
          setTimelineByContact(prev => ({ ...prev, [ctId]: [] }));
        }
      })
      .catch(() => setTimelineByContact(prev => ({ ...prev, [ctId]: [] })))
      .finally(() => setTimelineLoading(prev => ({ ...prev, [ctId]: false })));
  }, [expandedId, timelineByContact]);

  const fetchReceived = useCallback(async () => {
    setLoadingReceived(true);
    setErrMsg('');
    try {
      const data = await api('/api/bookings/reporting?role=received');
      if (Array.isArray(data)) setReceived(data);
      else setErrMsg(data?.error || 'Erreur de chargement');
    } catch (e) { setErrMsg(e?.message || 'Erreur réseau'); }
    setLoadingReceived(false);
  }, []);

  const fetchSent = useCallback(async () => {
    setLoadingSent(true);
    setErrMsg('');
    try {
      const data = await api('/api/bookings/reporting?role=sent');
      if (Array.isArray(data)) setSent(data);
      else setErrMsg(data?.error || 'Erreur de chargement');
    } catch (e) { setErrMsg(e?.message || 'Erreur réseau'); }
    setLoadingSent(false);
  }, []);

  useEffect(() => {
    if (subTab === 'received' && received.length === 0) fetchReceived();
    if (subTab === 'sent' && sent.length === 0) fetchSent();
  }, [subTab]);

  // Premier chargement
  useEffect(() => { fetchReceived(); }, [fetchReceived]);

  const openReporting = (booking) => {
    if (!booking) return;
    if (booking.bookingReportingStatus) {
      showNotif && showNotif('Ce RDV a déjà été rapporté', 'info');
      return;
    }
    setReportingBooking(booking);
    setReportStatus('validated');
    setReportNote('');
  };

  const closeReporting = () => {
    setReportingBooking(null);
    setReportStatus('validated');
    setReportNote('');
    setSubmitting(false);
  };

  const submitReporting = async () => {
    if (!reportingBooking) return;
    const trimmedNote = reportNote.trim();
    if (NOTE_REQUIRED_STATUSES.includes(reportStatus) && trimmedNote.length === 0) {
      showNotif && showNotif('Une note est obligatoire pour ce statut', 'danger');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api('/api/bookings/' + reportingBooking.id + '/report', {
        method: 'PUT',
        body: { status: reportStatus, note: trimmedNote }
      });
      if (res?.success) {
        showNotif && showNotif('Reporting enregistré', 'success');
        closeReporting();
        // Refresh listes (Reçus toujours, Transmis si déjà chargée)
        fetchReceived();
        if (sent.length > 0) fetchSent();
      } else {
        const msg = res?.error || 'Erreur lors de l\'enregistrement';
        showNotif && showNotif(msg, 'danger');
        setSubmitting(false);
      }
    } catch (e) {
      showNotif && showNotif(e?.message || 'Erreur réseau', 'danger');
      setSubmitting(false);
    }
  };

  // Helpers résolution noms
  const collabName = (id) => {
    if (!id) return '—';
    const c = allCollabs.find(x => x.id === id);
    return c?.name || id;
  };
  const contactName = (b) => {
    if (b.visitorName) return b.visitorName;
    if (b.contactId && contacts) {
      const ct = contacts.find(c => c.id === b.contactId);
      if (ct?.name) return ct.name;
    }
    return 'Sans nom';
  };
  const contactPhone = (b) => {
    if (b.visitorPhone) return b.visitorPhone;
    if (b.contactId && contacts) {
      const ct = contacts.find(c => c.id === b.contactId);
      if (ct?.phone) return ct.phone;
    }
    return '';
  };

  const rawList = subTab === 'received' ? received : sent;
  const loading = subTab === 'received' ? loadingReceived : loadingSent;
  const onRefresh = subTab === 'received' ? fetchReceived : fetchSent;

  // V1.10.4-r9.4 — Filtre métier : Tous / Confirmés / Perdus (pas "Annulés").
  // Le booking.status='cancelled' n'est PAS un statut métier : un RDV agenda annulé
  // peut représenter un lead encore actif (R2, contacté, en réflexion, etc.).
  // Les vrais "Perdus" sont définis par le pipeline_stage receveur OU par un
  // bookingReportingStatus signalant une perte (no_show, cancelled au sens reporting).
  const isPerdu = (b) => (
    b.receiverPipelineStage === 'perdu'
    || b.bookingReportingStatus === 'no_show'
    || b.bookingReportingStatus === 'cancelled'
  );
  const [statusFilter, setStatusFilter] = useState('all');
  const list = rawList.filter(b => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'confirmed') return b.status === 'confirmed';
    if (statusFilter === 'perdu') return isPerdu(b);
    return true;
  });
  const countByStatus = {
    all: rawList.length,
    confirmed: rawList.filter(b => b.status === 'confirmed').length,
    perdu: rawList.filter(isPerdu).length,
  };

  return (
    <div>
      {/* ── V1.10.4.J merge — Parent-tabs : Reporting | Agenda partagé ───── */}
      <div style={{ display:'flex', gap:6, marginBottom:18, padding:4, background:T.bg, borderRadius:12, border:'1px solid '+T.border, width:'fit-content' }}>
        {[
          { id:'reporting', label:'Reporting',      icon:'bar-chart-3', hint:'Mes RDV transmis et reçus à rapporter' },
          { id:'shared',    label:'Agenda partagé', icon:'users',       hint:'Console de supervision des RDV transmis inter-collaborateurs' },
        ].map(t => {
          const isActive = mainTab === t.id;
          return (
            <div key={t.id} onClick={() => setMainTab(t.id)} title={t.hint} style={{
              padding:'7px 16px', borderRadius:8, cursor:'pointer',
              background: isActive ? T.surface : 'transparent',
              color: isActive ? T.accent : T.text2,
              fontSize:13, fontWeight: isActive ? 700 : 500,
              display:'inline-flex', alignItems:'center', gap:7,
              transition:'all .15s cubic-bezier(0.4,0,0.2,1)',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px '+T.accent+'30' : 'none',
            }}
            onMouseEnter={e=>{ if (!isActive) e.currentTarget.style.color = T.text; }}
            onMouseLeave={e=>{ if (!isActive) e.currentTarget.style.color = T.text2; }}
            >
              <I n={t.icon} s={14}/> {t.label}
            </div>
          );
        })}
      </div>

      {/* ── V1.10.4.J merge — Mode "Agenda partagé" : render SharedAgendaTab tel quel ── */}
      {mainTab === 'shared' && <SharedAgendaTab/>}

      {/* ── V1.10.4.J merge — Mode "Reporting" : contenu Phase 1 inchangé ── */}
      {mainTab === 'reporting' && (<>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:16, background:'linear-gradient(135deg,#7C3AED,#2563EB)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 16px rgba(124,58,237,0.25)' }}>
            <I n="bar-chart-3" s={24} style={{ color:'#fff' }}/>
          </div>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:-0.5 }}>Reporting collab RDV</h1>
            <p style={{ fontSize:12, color:T.text3, margin:0 }}>RDV transmis entre collaborateurs — suivi des résultats</p>
          </div>
        </div>
        <Btn small onClick={onRefresh} title="Actualiser">
          <I n="refresh-cw" s={13}/> Actualiser
        </Btn>
      </div>

      {/* ── Sous-onglets Reçus / Transmis ─────────────────────────────── */}
      <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
        {[
          { id:'received', label:'Reçus',    icon:'inbox',  count: received.length, hint:'RDV transmis pour moi' },
          { id:'sent',     label:'Transmis', icon:'send',   count: sent.length,     hint:'RDV que j\'ai transmis' },
        ].map(t => (
          <div key={t.id} onClick={()=>setSubTab(t.id)} title={t.hint} style={{
            display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
            borderRadius:10, cursor:'pointer',
            background: subTab===t.id ? T.accentBg : 'transparent',
            border: '1px solid ' + (subTab===t.id ? T.accent+'40' : T.border),
            color: subTab===t.id ? T.accent : T.text2,
            fontSize:13, fontWeight: subTab===t.id ? 700 : 500,
            transition: 'all .15s'
          }}>
            <I n={t.icon} s={14}/> {t.label}
            {t.count > 0 && <span style={{ fontSize:10, fontWeight:800, background:subTab===t.id?T.accent:T.text3+'30', color:subTab===t.id?'#fff':T.text3, padding:'1px 7px', borderRadius:10 }}>{t.count}</span>}
          </div>
        ))}
      </div>

      {/* V1.10.4-r9.4 — Filtre métier client-side : Tous / Confirmés / Perdus.
          "Annulés" (booking.status='cancelled') retiré comme catégorie principale —
          il s'agit d'une donnée technique secondaire affichée discrètement sur la
          ligne via le badge "📅 RDV initial annulé". Le vrai indicateur métier
          d'un lead perdu = pipeline_stage='perdu' OU reporting no_show/cancelled. */}
      <div style={{ display:'flex', gap:5, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:10, fontWeight:700, color:T.text3, textTransform:'uppercase', letterSpacing:0.5, marginRight:4 }}>Filtre :</span>
        {[
          { id:'all',       label:'Tous',      color:T.text2,  count: countByStatus.all },
          { id:'confirmed', label:'Confirmés', color:'#22C55E', count: countByStatus.confirmed, hint:'RDV encore programmés (booking.status=confirmed)' },
          { id:'perdu',     label:'Perdus',    color:'#EF4444', count: countByStatus.perdu,     hint:'Leads marqués perdu (pipeline ou reporting)' },
        ].map(f => {
          const isActive = statusFilter === f.id;
          return (
            <div key={f.id} onClick={()=>setStatusFilter(f.id)} title={f.hint || ''} style={{
              display:'inline-flex', alignItems:'center', gap:5,
              padding:'4px 10px', borderRadius:8, cursor:'pointer',
              background: isActive ? f.color+'15' : 'transparent',
              border: '1px solid ' + (isActive ? f.color+'50' : T.border),
              color: isActive ? f.color : T.text2,
              fontSize:11, fontWeight: isActive ? 700 : 500,
              transition: 'all .15s'
            }}>
              {f.label}
              <span style={{ fontSize:9, fontWeight:800, background: isActive ? f.color : T.text3+'25', color: isActive ? '#fff' : T.text3, padding:'1px 6px', borderRadius:8 }}>{f.count}</span>
            </div>
          );
        })}
      </div>

      {/* ── Erreur globale ───────────────────────────────────────────── */}
      {errMsg && (
        <div style={{ padding:'10px 14px', borderRadius:10, background:'#EF444412', border:'1px solid #EF444430', color:'#EF4444', fontSize:12, marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
          <I n="alert-circle" s={14}/> {errMsg}
        </div>
      )}

      {/* ── Liste ─────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner/></div>
      )}

      {!loading && list.length === 0 && (
        <Card style={{ padding:40, textAlign:'center' }}>
          <I n={subTab==='received'?'inbox':'send'} s={36} style={{ color:T.text3, marginBottom:12 }}/>
          <div style={{ fontSize:14, fontWeight:600, color:T.text2, marginBottom:4 }}>
            {subTab === 'received' ? 'Aucun RDV à rapporter' : 'Aucun RDV transmis'}
          </div>
          <div style={{ fontSize:12, color:T.text3 }}>
            {subTab === 'received'
              ? 'Vous n\'avez pas de RDV transmis par d\'autres collaborateurs.'
              : 'Vous n\'avez transmis aucun RDV à un autre collaborateur.'}
          </div>
        </Card>
      )}

      {!loading && list.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {list.map(b => {
            const status = b.bookingReportingStatus || '';
            // V1.10.4-r9 — Suivi des transmissions cancelled côté Transmis :
            // l'apporteur (sender) doit voir tous ses transferts, même annulés par le receveur.
            const isCancelled = b.status === 'cancelled';
            // V1.10.4-r9 — Contact hard-supprimé : le flag _contactGhost vient du backend
            // via LEFT JOIN. La transmission reste tracée, fallback sur visitorName du booking.
            const isGhost = !!b._contactGhost;
            const peerId = subTab === 'received' ? b.bookedByCollaboratorId : b.agendaOwnerId;
            const peerLabel = subTab === 'received' ? 'Transmis par' : 'Pour';
            // V1.11.4 — Garde defensive : "Faire le reporting" affiche uniquement si
            // collab connecte est receveur ET non-transmetteur (anti-regression au cas ou
            // le backend renverrait des donnees incoherentes en mode admin/supra).
            const canReport = subTab === 'received'
              && !status
              && b.agendaOwnerId === collab.id
              && b.bookedByCollaboratorId !== collab.id;
            const reporterId = b.bookingReportedBy || '';
            const reportedAt = b.bookingReportedAt || '';
            // V1.10.4.I — Pipeline stage meta + accordion state
            const isExpanded = expandedId === b.id;
            const stageMeta = resolveStageMeta(b.receiverPipelineStage);
            const tlEvents = (b.contactId && timelineByContact[b.contactId]) || [];
            const tlLoading = b.contactId && timelineLoading[b.contactId];
            return (
              <Card key={b.id} style={{ padding:0, overflow:'hidden' }}>
                {/* ── Ligne principale cliquable (toggle accordion) ───────────── */}
                <div
                  onClick={() => toggleAccordion(b)}
                  style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap', padding:14, cursor:'pointer', background: isExpanded ? T.accentBg + '40' : 'transparent', transition:'background .15s' }}
                  title={isExpanded ? 'Fermer le détail' : 'Voir le détail + timeline'}
                >
                  {/* Avatar */}
                  <div style={{ width:42, height:42, borderRadius:14, background:T.accentBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <I n="calendar" s={18} style={{ color:T.accent }}/>
                  </div>
                  {/* Info principale */}
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                      <span style={{ fontSize:14, fontWeight:700, color: isGhost ? T.text3 : T.text, fontStyle: isGhost ? 'italic' : 'normal' }}>
                        {contactName(b)}
                      </span>
                      {contactPhone(b) && (
                        <span style={{ fontSize:11, color:T.text3, display:'inline-flex', alignItems:'center', gap:3 }}>
                          <I n="phone" s={11}/> {contactPhone(b)}
                        </span>
                      )}
                      {/* V1.10.4-r9.3 — RÈGLE UX : Le Reporting suit le LEAD, pas l'état technique
                          du RDV. Le pipeline_stage actuel du receveur est l'info PRINCIPALE.
                          Ordre des badges : stage (principal) → reporting → ghost/archived → cancelled (discret). */}
                      {/* Badge stage = info principale (pipeline actuel chez le receveur) */}
                      {stageMeta && (
                        <span title={`Statut actuel du contact${subTab === 'sent' ? ' chez ' + collabName(b.agendaOwnerId) : ''} : ${stageMeta.label}`} style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10, background:stageMeta.color+'15', border:'1px solid '+stageMeta.color+'40', color:stageMeta.color, display:'inline-flex', alignItems:'center', gap:4 }}>
                          <span style={{ fontSize:11, lineHeight:1 }}>{stageMeta.emoji}</span>
                          {subTab === 'sent' && (
                            <span style={{ fontWeight:600, opacity:0.85 }}>Chez {collabName(b.agendaOwnerId)} : </span>
                          )}
                          {stageMeta.label}
                        </span>
                      )}
                      {/* Badge reporting = info secondaire (statut reporting du RDV) */}
                      {status ? <StatusBadge status={status}/> : <StatusBadge status="pending"/>}
                      {/* V1.10.4-r9 — Badge "Contact supprimé" : fiche hard-deleted mais transmission
                          conservée pour l'historique reporting. */}
                      {isGhost && (
                        <span
                          title={"Fiche contact supprimée — transmission tracée via bookingId=" + b.id + ". Données affichées depuis le booking."}
                          style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'#FEF3C7', border:'1px solid #FCD34D', color:'#92400E', display:'inline-flex', alignItems:'center', gap:3 }}>
                          📂 Contact supprimé
                        </span>
                      )}
                      {/* V1.12.x.2 — badge contact archivé (RDV reste visible pour traçabilité) */}
                      {!isGhost && b.contactArchivedAt && b.contactArchivedAt !== '' && (
                        <span
                          title="Ce contact est archivé mais ce RDV reste visible pour conserver la traçabilité."
                          style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, background:'#64748B18', color:'#64748B', display:'inline-flex', alignItems:'center', gap:3, cursor:'help' }}>
                          📦 Contact archivé
                        </span>
                      )}
                      {/* V1.10.4-r9.3 — Badge "RDV initial annulé" DISCRET (gris, fin de ligne).
                          Le RDV agenda annulé n'implique PAS un lead perdu : Julie peut avoir
                          annulé le RDV après contact téléphonique et reclassé le contact en R2,
                          Contacté, En réflexion, etc. Le lead reste actif. */}
                      {isCancelled && (
                        <span
                          title="Le RDV agenda initial a été annulé. Le lead reste suivi selon son pipeline actuel."
                          style={{ fontSize:9, fontWeight:600, padding:'2px 6px', borderRadius:4, background:T.bg, border:`1px solid ${T.border}`, color:T.text3, display:'inline-flex', alignItems:'center', gap:3, cursor:'help' }}>
                          📅 RDV initial annulé
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:12, color:T.text2, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <I n="clock" s={11} style={{ color:T.text3 }}/>
                      <span>{fmtDateTime(b.date, b.time)}</span>
                      <span style={{ color:T.text3 }}>·</span>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                        <I n="user" s={11} style={{ color:T.text3 }}/>
                        <span style={{ color:T.text3 }}>{peerLabel}</span>
                        <span style={{ fontWeight:600 }}>{collabName(peerId)}</span>
                      </span>
                      {/* V1.10.4.I — "Créé le" */}
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
                    {/* Note de reporting si déjà fait */}
                    {b.bookingReportingNote && (
                      <div style={{ marginTop:8, padding:'8px 10px', borderRadius:8, background:T.bg, border:'1px solid '+T.border, fontSize:12, color:T.text2, lineHeight:1.5 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:T.text3, marginRight:6 }}>Note :</span>
                        {b.bookingReportingNote}
                      </div>
                    )}
                    {/* Méta reporting (qui + quand) */}
                    {reporterId && reportedAt && (
                      <div style={{ marginTop:6, fontSize:10, color:T.text3, display:'flex', alignItems:'center', gap:4 }}>
                        <I n="check-circle" s={10}/> Rapporté par {collabName(reporterId)} · {new Date(reportedAt).toLocaleString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </div>
                    )}
                  </div>
                  {/* V1.10.4-r9.3 — Quick actions zone (flex column pour empilage sur petit écran) */}
                  <div style={{ flexShrink:0, display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end' }}>
                    {/* CTA reporting (Reçus uniquement, si pas encore rapporté) */}
                    {canReport && (
                      <Btn primary onClick={(e)=>{ e.stopPropagation(); openReporting(b); }}>
                        <I n="check-square" s={13}/> Faire le reporting
                      </Btn>
                    )}
                    {/* V1.10.4-r9.3 — Bouton rapide "Marquer perdu" — RECEIVER UNIQUEMENT
                        (le sender n'a pas l'ownership pour modifier le pipeline du contact).
                        Visible uniquement si :
                          - subTab='received' (Julie sur ses propres reçus)
                          - elle est bien l'agendaOwner (defensive vs admin override)
                          - le contact existe (pas ghost)
                          - le contact n'est pas DÉJÀ en stage 'perdu'
                          - handleCollabUpdateContact disponible dans le context */}
                    {subTab === 'received' && !isGhost && b.agendaOwnerId === collab.id
                      && b.receiverPipelineStage !== 'perdu'
                      && typeof handleCollabUpdateContact === 'function' && (
                      <button
                        type="button"
                        onClick={(e)=>{
                          e.stopPropagation();
                          if (!confirm(`Marquer "${contactName(b)}" comme perdu ?\n\nLe contact sera déplacé dans la colonne "Perdu" de votre pipeline.`)) return;
                          handleCollabUpdateContact(b.contactId, {
                            pipeline_stage: 'perdu',
                            _source: 'reporting_quick_lost',
                            _origin: 'reporting_tab',
                            _reason: 'Marqué perdu depuis Reporting Reçus',
                          });
                          showNotif && showNotif(`${contactName(b)} marqué perdu`, 'success');
                          // Refresh la liste pour que le badge stage se mette à jour
                          setTimeout(() => fetchReceived(), 300);
                        }}
                        title="Marquer ce contact comme perdu (déplace en colonne Perdu du pipeline)"
                        style={{ fontSize:11, fontWeight:600, padding:'5px 10px', borderRadius:8,
                          border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#B91C1C',
                          cursor:'pointer', fontFamily:'inherit', display:'inline-flex',
                          alignItems:'center', gap:5, transition:'all .15s' }}
                      >
                        🔴 Marquer perdu
                      </button>
                    )}
                  </div>
                  {/* V1.10.4.I — Chevron expand/collapse */}
                  <div style={{ flexShrink:0, alignSelf:'center', color:T.text3 }}>
                    <I n={isExpanded ? 'chevron-up' : 'chevron-down'} s={16}/>
                  </div>
                </div>

                {/* V1.10.4.I — Accordion section (Détails + Timeline) ─────────── */}
                {isExpanded && (
                  <div style={{ borderTop:'1px solid '+T.border, background:T.bg, padding:'14px 18px' }}>
                    {/* Détails enrichis */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'8px 18px', marginBottom:14 }}>
                      <DetailRow label="Sender" value={collabName(b.bookedByCollaboratorId)}/>
                      <DetailRow label="Receiver" value={collabName(b.agendaOwnerId)}/>
                      <DetailRow label="Date RDV" value={fmtDateTime(b.date, b.time)}/>
                      <DetailRow label="Créé le" value={b.createdAt ? fmtDate(b.createdAt) : '—'}/>
                      <DetailRow label="Statut reporting" value={STATUS_META[status || 'pending']?.label || status || 'En attente'}/>
                      <DetailRow label="Statut pipeline actuel" value={stageMeta ? stageMeta.label : '—'}/>
                      {b.contactEmail && <DetailRow label="Email" value={b.contactEmail}/>}
                      {b.contactPhone && <DetailRow label="Téléphone" value={b.contactPhone}/>}
                      {b.contactNextActionLabel && <DetailRow label="Prochaine action" value={b.contactNextActionLabel + (b.contactNextActionDate ? ' (' + b.contactNextActionDate + ')' : '')}/>}
                      {b.contactLastActivityAt && <DetailRow label="Dernière activité" value={fmtDate(b.contactLastActivityAt)}/>}
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
                          {tlEvents.map((ev, idx) => <TimelineRow key={(ev.id || idx) + ':' + ev.kind} ev={ev} resolveStageMeta={resolveStageMeta} collabName={collabName}/>)}
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

      {/* ── Modal reporting ──────────────────────────────────────────── */}
      {reportingBooking && (
        <div onClick={closeReporting} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16, boxSizing:'border-box' }}>
          <div onClick={e=>e.stopPropagation()} style={{ boxSizing:'border-box', background:T.surface, borderRadius:16, padding:22, width:'100%', maxWidth:480, maxHeight:'calc(100vh - 32px)', overflow:'auto', boxShadow:'0 20px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, minWidth:0 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:'linear-gradient(135deg,#7C3AED,#2563EB)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <I n="check-square" s={18} style={{ color:'#fff' }}/>
              </div>
              <div style={{ flex:1, minWidth:0, overflow:'hidden' }}>
                <div style={{ fontWeight:800, fontSize:15 }}>Faire le reporting</div>
                <div style={{ fontSize:11, color:T.text3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {contactName(reportingBooking)} · {fmtDateTime(reportingBooking.date, reportingBooking.time)}
                </div>
              </div>
              <div onClick={closeReporting} title="Fermer" style={{ flexShrink:0, width:28, height:28, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', background:T.bg, border:'1px solid '+T.border, color:T.text3 }}>
                <I n="x" s={14}/>
              </div>
            </div>

            {/* Statut */}
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:T.text3, marginBottom:6, textTransform:'uppercase', letterSpacing:0.5 }}>Statut</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {REPORTING_STATUSES.filter(s=>s!=='pending').map(s => {
                  const meta = STATUS_META[s];
                  const active = reportStatus === s;
                  return (
                    <div key={s} onClick={()=>setReportStatus(s)} style={{
                      padding:'7px 12px', borderRadius:10, cursor:'pointer',
                      background: active ? meta.color+'18' : T.bg,
                      border: '1.5px solid ' + (active ? meta.color : T.border),
                      color: active ? meta.color : T.text2,
                      fontSize:12, fontWeight: active ? 700 : 500,
                      display:'inline-flex', alignItems:'center', gap:5,
                      transition:'all .12s'
                    }}>
                      <span style={{ fontSize:12 }}>{meta.icon}</span> {meta.short}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Note */}
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:T.text3, marginBottom:6, textTransform:'uppercase', letterSpacing:0.5 }}>
                Note {NOTE_REQUIRED_STATUSES.includes(reportStatus) && <span style={{ color:'#EF4444' }}>*</span>}
              </label>
              <textarea
                value={reportNote}
                onChange={e=>setReportNote(e.target.value)}
                placeholder={NOTE_REQUIRED_STATUSES.includes(reportStatus) ? 'Note obligatoire pour ce statut...' : 'Note (optionnelle)'}
                rows={4}
                style={{ boxSizing:'border-box', width:'100%', minWidth:0, padding:'10px 12px', borderRadius:10, border:'1.5px solid '+T.border, background:T.bg, fontSize:13, fontFamily:'inherit', color:T.text, outline:'none', resize:'vertical', lineHeight:1.5 }}
              />
              {NOTE_REQUIRED_STATUSES.includes(reportStatus) && reportNote.trim().length === 0 && (
                <div style={{ fontSize:10, color:'#EF4444', marginTop:4, display:'flex', alignItems:'center', gap:4 }}>
                  <I n="alert-circle" s={10}/> Note obligatoire pour ce statut
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display:'flex', gap:8, marginTop:6 }}>
              <div onClick={closeReporting} style={{ flex:1, padding:'10px 0', borderRadius:10, textAlign:'center', fontSize:13, fontWeight:600, cursor:'pointer', background:T.bg, border:'1px solid '+T.border, color:T.text2 }}>
                Annuler
              </div>
              <div
                onClick={submitting ? undefined : submitReporting}
                style={{
                  flex:1, padding:'10px 0', borderRadius:10, textAlign:'center', fontSize:13, fontWeight:700,
                  cursor: submitting ? 'wait' : 'pointer',
                  background: submitting ? T.text3 : 'linear-gradient(135deg,#7C3AED,#2563EB)',
                  color:'#fff',
                  boxShadow: submitting ? 'none' : '0 2px 8px rgba(124,58,237,0.3)',
                  opacity: submitting ? 0.7 : 1
                }}
              >
                {submitting ? 'Enregistrement...' : 'Enregistrer'}
              </div>
            </div>
          </div>
        </div>
      )}
      </>)}{/* V1.10.4.J merge — fin du wrap mainTab === 'reporting' */}
    </div>
  );
};

export default RdvReportingTab;
