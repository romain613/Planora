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

// ── V1.10.4.J V1b — Helpers grille agenda (date math local, sans dep AgendaTab) ─
// Plage 07:00-21:00 fixe par défaut. Slot = 30 min. 28 slots/jour.
const GRID_HOURS = (() => {
  const out = [];
  for (let h = 7; h < 21; h++) {
    out.push(`${String(h).padStart(2,'0')}:00`);
    out.push(`${String(h).padStart(2,'0')}:30`);
  }
  return out;
})();
const DAYS_SHORT = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const MONTHS_SHORT = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];

const mondayOf = (dateIso) => {
  const d = new Date(dateIso + 'T00:00:00');
  if (isNaN(d.getTime())) return dateIso;
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toIso(d);
};
const weekDatesFrom = (mondayIso) => {
  const out = [];
  const m = new Date(mondayIso + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(m); d.setDate(m.getDate() + i);
    out.push(toIso(d));
  }
  return out;
};
const addDays = (dateIso, n) => {
  const d = new Date(dateIso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toIso(d);
};
// V1.10.4.J V1c — Helpers Mois
const addMonths = (dateIso, n) => {
  const d = new Date(dateIso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return toIso(d);
};
const firstOfMonth = (dateIso) => {
  const d = new Date(dateIso + 'T00:00:00');
  d.setDate(1);
  return toIso(d);
};
const lastOfMonth = (dateIso) => {
  const d = new Date(dateIso + 'T00:00:00');
  d.setMonth(d.getMonth() + 1, 0);
  return toIso(d);
};
const monthLabel = (dateIso) => {
  const d = new Date(dateIso + 'T00:00:00');
  if (isNaN(d.getTime())) return dateIso;
  const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  return `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
};
// 42 cells max (6 rangées × 7 cols) lundi-aligné. Inclut quelques jours du mois précédent/suivant pour remplir.
const monthGridDays = (dateIso) => {
  const first = new Date(firstOfMonth(dateIso) + 'T00:00:00');
  // Premier jour de la grille = lundi de la semaine contenant le 1er du mois
  const startDow = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startDow);
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    out.push(toIso(d));
  }
  return out;
};
const dateDiffDays = (fromIso, toIso2) => {
  const a = new Date(fromIso + 'T00:00:00');
  const b = new Date(toIso2 + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
};
const fmtDayLabel = (dateIso) => {
  const d = new Date(dateIso + 'T00:00:00');
  if (isNaN(d.getTime())) return dateIso;
  return `${DAYS_SHORT[(d.getDay()+6)%7]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

// Aligne booking.time sur slot 30 min (floor)
const slotKeyFor = (b) => {
  const t = b.time || '00:00';
  const [hh, mm] = t.split(':').map(Number);
  const slotMin = Math.floor(((hh || 0) * 60 + (mm || 0)) / 30) * 30;
  return `${String(Math.floor(slotMin / 60)).padStart(2,'0')}:${String(slotMin % 60).padStart(2,'0')}`;
};

// Group bookings d'un jour par slot HH:MM
const groupByHourSlot = (bookings, dateIso) => {
  const map = new Map(GRID_HOURS.map(h => [h, []]));
  for (const b of (bookings || [])) {
    if (b.date !== dateIso) continue;
    const k = slotKeyFor(b);
    if (map.has(k)) map.get(k).push(b);
  }
  // Sort each slot by time (puis duration desc pour le visuel)
  for (const arr of map.values()) {
    arr.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }
  return map;
};

// ── SlotCard : carte compacte d'un RDV dans la grille ────────────────────────
const SlotCard = ({ b, onClick, resolveStageMeta, collabName, collabColor, compact = false }) => {
  const isCancelled = b.status === 'cancelled';
  const stageMeta = resolveStageMeta(b.receiverPipelineStage);
  const reportingMeta = REPORTING_STATUS_META[b.bookingReportingStatus || 'pending'] || REPORTING_STATUS_META.pending;
  const receiverColor = collabColor(b.agendaOwnerId);
  const senderColor = collabColor(b.bookedByCollaboratorId);
  const ctName = b.contactName || b.visitorName || 'Sans nom';
  const title = `${b.time || ''} — ${ctName}\n${collabName(b.bookedByCollaboratorId)} → ${collabName(b.agendaOwnerId)}${stageMeta ? '\nPipeline : ' + stageMeta.label : ''}${reportingMeta ? '\nReporting : ' + reportingMeta.short : ''}${isCancelled ? '\n⚠ ANNULÉ' : ''}`;
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick && onClick(b); }}
      title={title}
      style={{
        flex: '1 1 auto', minWidth: 0,
        padding: compact ? '3px 5px' : '4px 7px',
        borderRadius: 6,
        background: receiverColor + (isCancelled ? '10' : '18'),
        borderLeft: `3px solid ${receiverColor}`,
        cursor: 'pointer',
        overflow: 'hidden',
        opacity: isCancelled ? 0.55 : 1,
        textDecoration: isCancelled ? 'line-through' : 'none',
        transition: 'transform .1s, background .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.background = receiverColor + '28'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = receiverColor + (isCancelled ? '10' : '18'); }}
    >
      <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom: compact ? 0 : 2 }}>
        <span style={{ fontSize: compact ? 9 : 10, fontWeight:800, color:receiverColor, flexShrink:0 }}>{b.time}</span>
        <span style={{ fontSize: compact ? 10 : 11, fontWeight:700, color:'#1A1917', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>{ctName}</span>
      </div>
      {!compact && (
        <div style={{ display:'flex', alignItems:'center', gap:3, fontSize:8, color:'#5C5A54' }}>
          <span style={{ display:'inline-block', width:6, height:6, borderRadius:3, background:senderColor, flexShrink:0 }}/>
          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>→</span>
          <span style={{ display:'inline-block', width:6, height:6, borderRadius:3, background:receiverColor, flexShrink:0 }}/>
          {stageMeta && (
            <span style={{ marginLeft:'auto', padding:'1px 4px', borderRadius:3, background:stageMeta.color+'18', color:stageMeta.color, fontSize:8, fontWeight:700, lineHeight:1 }}>{stageMeta.emoji}</span>
          )}
          {b.bookingReportingStatus && (
            <span style={{ padding:'1px 4px', borderRadius:3, background:reportingMeta.color+'18', color:reportingMeta.color, fontSize:8, fontWeight:700, lineHeight:1 }}>{reportingMeta.icon}</span>
          )}
        </div>
      )}
    </div>
  );
};

// ── DayGrid : grille vue Jour (28 slots × 1 colonne) ────────────────────────
// V1c polish : highlight slot horaire courant si dateIso = aujourd'hui.
const DayGrid = ({ bookings, dateIso, onClickBooking, onOverflowClick, resolveStageMeta, collabName, collabColor }) => {
  const slots = useMemo(() => groupByHourSlot(bookings, dateIso), [bookings, dateIso]);
  const todayIso = toIso(new Date());
  const isToday = dateIso === todayIso;
  // Slot courant = HH:MM aligné sur 30 min de l'heure actuelle (uniquement si aujourd'hui)
  const currentSlot = useMemo(() => {
    if (!isToday) return null;
    const now = new Date();
    const slotMin = Math.floor((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
    return `${String(Math.floor(slotMin / 60)).padStart(2,'0')}:${String(slotMin % 60).padStart(2,'0')}`;
  }, [isToday]);
  return (
    <Card style={{ padding:0, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'70px 1fr' }}>
        {GRID_HOURS.map((h, idx) => {
          const events = slots.get(h) || [];
          const visible = events.slice(0, 3);
          const overflow = events.length - visible.length;
          const isHourStart = h.endsWith(':00');
          const isCurrentSlot = h === currentSlot;
          return (
            <React.Fragment key={h}>
              <div style={{ padding:'6px 10px', borderTop: idx === 0 ? 'none' : '1px solid '+T.border, fontSize: isHourStart ? 11 : 10, color: isCurrentSlot ? '#0EA5E9' : (isHourStart ? T.text2 : T.text3), fontWeight: isCurrentSlot ? 800 : (isHourStart ? 700 : 500), background: isCurrentSlot ? '#0EA5E912' : T.bg, transition:'background .15s' }}>{h}</div>
              <div style={{ display:'flex', gap:4, padding:'4px 8px', borderTop: idx === 0 ? 'none' : '1px solid '+T.border, minHeight: 34, alignItems: 'center', background: isCurrentSlot ? '#0EA5E908' : 'transparent', borderLeft: isCurrentSlot ? '2px solid #0EA5E9' : '2px solid transparent', transition:'background .15s' }}>
                {visible.map(b => <SlotCard key={b.id} b={b} onClick={onClickBooking} resolveStageMeta={resolveStageMeta} collabName={collabName} collabColor={collabColor}/>)}
                {overflow > 0 && (
                  <div onClick={() => onOverflowClick(dateIso, h, events)} style={{ padding:'3px 9px', borderRadius:5, background:T.accentBg, color:T.accent, fontSize:11, fontWeight:800, cursor:'pointer', flexShrink:0, border:'1px solid '+T.accent+'40', transition:'background .12s' }}
                    onMouseEnter={e=>e.currentTarget.style.background=T.accentBg+'80'}
                    onMouseLeave={e=>e.currentTarget.style.background=T.accentBg}
                  >+{overflow}</div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </Card>
  );
};

// ── WeekGrid : grille vue Semaine (28 slots × 7 colonnes) ───────────────────
const WeekGrid = ({ bookings, mondayIso, onClickBooking, onOverflowClick, resolveStageMeta, collabName, collabColor }) => {
  const dates = useMemo(() => weekDatesFrom(mondayIso), [mondayIso]);
  const todayIso = toIso(new Date());
  // Pré-calcul groupage par jour pour éviter recompute par slot
  const slotsByDay = useMemo(() => dates.map(d => groupByHourSlot(bookings, d)), [bookings, dates]);
  return (
    <Card style={{ padding:0, overflow:'hidden' }}>
      <div style={{ display:'grid', gridTemplateColumns:'60px repeat(7, 1fr)' }}>
        {/* Header row : jours */}
        <div style={{ background:T.bg, borderBottom:'1px solid '+T.border }}></div>
        {dates.map(d => {
          const isToday = d === todayIso;
          return (
            <div key={d} style={{ padding:'8px 6px', textAlign:'center', borderBottom:'1px solid '+T.border, background: isToday ? T.accentBg : T.bg }}>
              <div style={{ fontSize:10, color: isToday ? T.accent : T.text3, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5 }}>{DAYS_SHORT[(new Date(d+'T00:00:00').getDay()+6)%7]}</div>
              <div style={{ fontSize:14, fontWeight: isToday ? 800 : 600, color: isToday ? T.accent : T.text }}>{new Date(d+'T00:00:00').getDate()}</div>
            </div>
          );
        })}
        {/* Slots rows */}
        {GRID_HOURS.map((h, hIdx) => {
          const isHourStart = h.endsWith(':00');
          return (
            <React.Fragment key={h}>
              <div style={{ padding:'4px 8px', borderTop:'1px solid '+T.border, fontSize: isHourStart ? 10 : 9, color: isHourStart ? T.text2 : T.text3, fontWeight: isHourStart ? 700 : 500, background:T.bg, textAlign:'right' }}>{h}</div>
              {dates.map((d, dIdx) => {
                const events = slotsByDay[dIdx].get(h) || [];
                const visible = events.slice(0, 2);
                const overflow = events.length - visible.length;
                return (
                  <div key={d + h} style={{ display:'flex', flexDirection:'column', gap:2, padding:'2px 3px', borderTop:'1px solid '+T.border, borderLeft:'1px solid '+T.border+'80', minHeight:26 }}>
                    {visible.map(b => <SlotCard key={b.id} b={b} onClick={onClickBooking} resolveStageMeta={resolveStageMeta} collabName={collabName} collabColor={collabColor} compact/>)}
                    {overflow > 0 && (
                      <div onClick={() => onOverflowClick(d, h, events)} style={{ padding:'1px 5px', borderRadius:4, background:T.accentBg, color:T.accent, fontSize:9, fontWeight:800, cursor:'pointer', textAlign:'center', border:'1px solid '+T.accent+'30' }}>
                        +{overflow}
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </Card>
  );
};

// ── V1.10.4.J V1c — MonthGrid : grille vue Mois supervision premium ─────────
// Compact, peu saturé, lisibilité management. Clic numéro jour → focus jour.
// ultraCompact = true → cells réduites pour plages > 31 jours (mode hybrid extended).
const MonthGrid = ({ bookings, refDateIso, onClickBooking, onOverflowClick, onFocusDay, resolveStageMeta, collabName, collabColor, ultraCompact = false }) => {
  const days = useMemo(() => monthGridDays(refDateIso), [refDateIso]);
  const currentMonth = new Date(refDateIso + 'T00:00:00').getMonth();
  const todayIso = toIso(new Date());
  // Group bookings par date (1 seul pass)
  const byDate = useMemo(() => {
    const m = new Map();
    for (const b of (bookings || [])) {
      if (!b.date) continue;
      if (!m.has(b.date)) m.set(b.date, []);
      m.get(b.date).push(b);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return m;
  }, [bookings]);

  // Dimensions adaptatives selon ultraCompact
  const cellMinHeight = ultraCompact ? 58 : 86;
  const maxVisibleEvents = ultraCompact ? 2 : 3;
  const eventFontSize = ultraCompact ? 8 : 9;
  const dayNumFontSize = ultraCompact ? 10 : 11;

  return (
    <Card style={{ padding:0, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
      {/* Header jours semaine */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', background:T.bg, borderBottom:'1px solid '+T.border }}>
        {DAYS_SHORT.map(d => (
          <div key={d} style={{ padding: ultraCompact ? '6px 4px' : '8px 6px', textAlign:'center', fontSize: ultraCompact ? 9 : 10, fontWeight:700, color:T.text3, textTransform:'uppercase', letterSpacing:0.6 }}>{d}</div>
        ))}
      </div>
      {/* 6 rangées × 7 jours */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)' }}>
        {days.map(d => {
          const dDate = new Date(d + 'T00:00:00');
          const isCurrentMonth = dDate.getMonth() === currentMonth;
          const isToday = d === todayIso;
          const dayEvents = byDate.get(d) || [];
          const visible = dayEvents.slice(0, maxVisibleEvents);
          const overflow = dayEvents.length - visible.length;
          const cancelledCount = dayEvents.filter(b => b.status === 'cancelled').length;
          return (
            <div
              key={d}
              style={{
                minHeight: cellMinHeight,
                padding: ultraCompact ? 3 : 4,
                borderTop: '1px solid '+T.border,
                borderRight: '1px solid '+T.border+'30',
                // Couleurs supervision : saturation réduite, distinction subtile
                background: isToday ? '#0EA5E912' : (isCurrentMonth ? T.surface : T.bg+'80'),
                opacity: isCurrentMonth ? 1 : 0.55,
                position: 'relative',
                transition: 'background .15s ease',
              }}
              onMouseEnter={e => { if (isCurrentMonth) e.currentTarget.style.background = isToday ? '#0EA5E91A' : T.accentBg+'30'; }}
              onMouseLeave={e => { if (isCurrentMonth) e.currentTarget.style.background = isToday ? '#0EA5E912' : T.surface; }}
            >
              {/* Numéro jour (cliquable = focus Jour) + compteur */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: ultraCompact ? 2 : 3, padding:'1px 3px' }}>
                <span
                  onClick={(e) => { e.stopPropagation(); if (isCurrentMonth && onFocusDay) onFocusDay(d); }}
                  title={isCurrentMonth ? `Focus sur ${fmtDayLabel(d)}` : ''}
                  style={{
                    fontSize: dayNumFontSize,
                    fontWeight: isToday ? 800 : (isCurrentMonth ? 700 : 500),
                    color: isToday ? '#0EA5E9' : (isCurrentMonth ? T.text : T.text3),
                    cursor: isCurrentMonth ? 'pointer' : 'default',
                    padding: isToday ? '1px 6px' : '1px 4px',
                    borderRadius: 6,
                    background: isToday ? '#0EA5E920' : 'transparent',
                    transition: 'all .12s',
                  }}
                  onMouseEnter={e => { if (isCurrentMonth && !isToday) e.currentTarget.style.background = T.accentBg; }}
                  onMouseLeave={e => { if (isCurrentMonth && !isToday) e.currentTarget.style.background = 'transparent'; }}
                >{dDate.getDate()}</span>
                <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                  {cancelledCount > 0 && (
                    <span title={`${cancelledCount} annulé${cancelledCount>1?'s':''}`} style={{ fontSize:8, fontWeight:700, color:'#EF4444', padding:'0 3px', borderRadius:3, background:'#EF444412' }}>🚫{cancelledCount}</span>
                  )}
                  {dayEvents.length > 0 && (
                    <span style={{ fontSize:8, fontWeight:700, color:T.text2, padding:'0 4px', borderRadius:3, background:T.bg, border:'1px solid '+T.border+'80' }}>{dayEvents.length}</span>
                  )}
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                {visible.map(b => {
                  const isCancelled = b.status === 'cancelled';
                  const stageMeta = resolveStageMeta(b.receiverPipelineStage);
                  const receiverColor = collabColor(b.agendaOwnerId);
                  const ctName = b.contactName || b.visitorName || '—';
                  const title = `${b.time || ''} — ${ctName}\n${collabName(b.bookedByCollaboratorId)} → ${collabName(b.agendaOwnerId)}${stageMeta ? '\n' + stageMeta.label : ''}${isCancelled ? '\n⚠ ANNULÉ' : ''}`;
                  return (
                    <div
                      key={b.id}
                      onClick={(e) => { e.stopPropagation(); onClickBooking(b); }}
                      title={title}
                      style={{
                        padding: ultraCompact ? '0 4px' : '1px 5px',
                        borderRadius:3,
                        // Saturation réduite : 12 (au lieu de 20) pour fond clair management
                        background: receiverColor + (isCancelled ? '08' : '14'),
                        borderLeft: `2px solid ${receiverColor}`,
                        cursor:'pointer',
                        fontSize: eventFontSize,
                        fontWeight: 600,
                        color:'#1A1917',
                        whiteSpace:'nowrap',
                        overflow:'hidden',
                        textOverflow:'ellipsis',
                        opacity: isCancelled ? 0.5 : 1,
                        textDecoration: isCancelled ? 'line-through' : 'none',
                        transition: 'background .1s, transform .08s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = receiverColor + (isCancelled ? '12' : '22'); }}
                      onMouseLeave={e => { e.currentTarget.style.background = receiverColor + (isCancelled ? '08' : '14'); }}
                    >
                      <span style={{ color:receiverColor, fontWeight:800 }}>{b.time}</span> {ctName}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div onClick={() => onOverflowClick(d, '00:00', dayEvents)} title={`Voir les ${overflow} autres RDV`} style={{ padding: ultraCompact ? '0 5px' : '1px 5px', borderRadius:3, background:T.accentBg, color:T.accent, fontSize: eventFontSize, fontWeight:800, cursor:'pointer', textAlign:'center', border:'1px solid '+T.accent+'30', transition:'background .1s' }}
                    onMouseEnter={e=>e.currentTarget.style.background=T.accentBg+'80'}
                    onMouseLeave={e=>e.currentTarget.style.background=T.accentBg}
                  >+{overflow}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
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

  // ── V1.10.4.J V1b — Grille view state ─────────────────────────────────────
  const _viewStorageKey = `c360-shared-agenda-view-${collab?.id || 'default'}`;
  const [viewType, setViewType] = useState(() => {
    try { const raw = localStorage.getItem(_viewStorageKey); const p = raw ? JSON.parse(raw) : null; return p?.viewType === 'grid' ? 'grid' : 'list'; } catch { return 'list'; }
  });
  const [gridView, setGridView] = useState(() => {
    // V1.10.4.J V1c — accepte day/week/month/custom (sécurité fallback day)
    try { const raw = localStorage.getItem(_viewStorageKey); const p = raw ? JSON.parse(raw) : null; const v = p?.gridView; return ['day','week','month','custom'].includes(v) ? v : 'day'; } catch { return 'day'; }
  });
  const [gridRefDate, setGridRefDate] = useState(() => toIso(new Date()));
  const [slotOverflowModal, setSlotOverflowModal] = useState(null); // { dateIso, hour, bookings }
  // Persistence viewType + gridView par collab (localStorage)
  useEffect(() => {
    try { localStorage.setItem(_viewStorageKey, JSON.stringify({ viewType, gridView })); } catch {}
  }, [viewType, gridView, _viewStorageKey]);
  // Mobile detection : auto-bascule Liste si < 768 px (vue Grille non adaptée)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const effectiveViewType = isMobile ? 'list' : viewType;
  // V1.10.4.J V1c — Garde-fou mobile : si gridView est month/custom (réservés desktop) → fallback day
  useEffect(() => {
    if (isMobile && (gridView === 'month' || gridView === 'custom')) setGridView('day');
  }, [isMobile, gridView]);
  // V1.10.4.J V1c — Auto-extend dateFrom/dateTo si navigation grille sort de la plage.
  // Adapté pour Jour / Semaine / Mois (Personnalisé pilote directement dateFrom/dateTo).
  useEffect(() => {
    if (effectiveViewType !== 'grid') return;
    if (gridView === 'day') {
      if (gridRefDate < dateFrom) setDateFrom(gridRefDate);
      if (gridRefDate > dateTo) setDateTo(gridRefDate);
    } else if (gridView === 'week') {
      const monday = mondayOf(gridRefDate);
      const sunday = addDays(monday, 6);
      if (monday < dateFrom) setDateFrom(monday);
      if (sunday > dateTo) setDateTo(sunday);
    } else if (gridView === 'month') {
      const first = firstOfMonth(gridRefDate);
      const last = lastOfMonth(gridRefDate);
      if (first < dateFrom) setDateFrom(first);
      if (last > dateTo) setDateTo(last);
    }
    // Custom : dateFrom/dateTo sont la source de vérité directe (pilotés par les inputs + presets)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveViewType, gridView, gridRefDate]);

  // V1.10.4.J V1c — Presets rapides mode Personnalisé
  const applyPreset = useCallback((presetId) => {
    const today = new Date();
    const todayIsoLocal = toIso(today);
    let from = todayIsoLocal, to = todayIsoLocal;
    switch (presetId) {
      case '7d':
        from = todayIsoLocal; to = addDays(todayIsoLocal, 7); break;
      case '30d':
        from = todayIsoLocal; to = addDays(todayIsoLocal, 30); break;
      case 'thisMonth':
        from = firstOfMonth(todayIsoLocal); to = lastOfMonth(todayIsoLocal); break;
      case 'lastMonth': {
        const lastMonthRef = addMonths(todayIsoLocal, -1);
        from = firstOfMonth(lastMonthRef); to = lastOfMonth(lastMonthRef);
        break;
      }
      case 'quarter':
        from = todayIsoLocal; to = addMonths(todayIsoLocal, 3); break;
      case 'year':
        from = todayIsoLocal; to = addMonths(todayIsoLocal, 12); break;
      default: return;
    }
    setDateFrom(from);
    setDateTo(to);
  }, []);

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

          {/* V1.10.4.J V1b — Toggle Liste / Grille (désactivé si mobile = auto Liste) */}
          {!isMobile && (
            <div style={{ marginLeft:'auto', display:'flex', gap:4, padding:3, background:T.bg, borderRadius:10, border:'1px solid '+T.border }}>
              {[
                { id:'list', label:'Liste', icon:'list' },
                { id:'grid', label:'Grille', icon:'grid' },
              ].map(v => (
                <div key={v.id} onClick={() => setViewType(v.id)} style={{
                  padding:'5px 12px', borderRadius:7, cursor:'pointer',
                  background: viewType === v.id ? T.accentBg : 'transparent',
                  color: viewType === v.id ? T.accent : T.text2,
                  fontSize:12, fontWeight: viewType === v.id ? 700 : 500,
                  display:'inline-flex', alignItems:'center', gap:5,
                  transition:'all .12s',
                }}>
                  <I n={v.icon} s={12}/> {v.label}
                </div>
              ))}
            </div>
          )}
          {isMobile && (
            <div style={{ marginLeft:'auto', fontSize:10, color:T.text3, fontStyle:'italic' }}>Mode liste (mobile)</div>
          )}
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

      {/* V1.10.4.J V1c — Vue Grille (Jour/Semaine/Mois/Personnalisé) ────────── */}
      {!loading && bookings.length > 0 && effectiveViewType === 'grid' && (
        <div style={{ marginBottom:14 }}>
          {/* Toolbar navigation grille — adaptée selon gridView */}
          <Card style={{ padding:'10px 14px', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                {/* Nav prev / today / next — masqué en mode Personnalisé (presets pilote) */}
                {gridView !== 'custom' && (
                  <>
                    <div onClick={() => {
                      if (gridView === 'day') setGridRefDate(addDays(gridRefDate, -1));
                      else if (gridView === 'week') setGridRefDate(addDays(gridRefDate, -7));
                      else if (gridView === 'month') setGridRefDate(addMonths(gridRefDate, -1));
                    }} style={{ padding:'6px 11px', borderRadius:8, border:'1px solid '+T.border, background:T.surface, cursor:'pointer', fontSize:12, fontWeight:600, color:T.text2, display:'inline-flex', alignItems:'center', gap:4, transition:'all .15s cubic-bezier(0.4,0,0.2,1)' }}
                      onMouseEnter={e=>{e.currentTarget.style.background=T.accentBg;e.currentTarget.style.borderColor=T.accent+'40';e.currentTarget.style.color=T.accent;}}
                      onMouseLeave={e=>{e.currentTarget.style.background=T.surface;e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.text2;}}
                      title="Période précédente">
                      <I n="chevron-left" s={14}/>
                    </div>
                    <div onClick={() => setGridRefDate(toIso(new Date()))} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid '+T.accent+'40', background:T.accentBg, cursor:'pointer', fontSize:12, fontWeight:700, color:T.accent, transition:'all .15s cubic-bezier(0.4,0,0.2,1)', boxShadow:'0 1px 2px '+T.accent+'15' }}
                      onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 2px 6px '+T.accent+'25';e.currentTarget.style.transform='translateY(-1px)';}}
                      onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 2px '+T.accent+'15';e.currentTarget.style.transform='translateY(0)';}}
                    >Aujourd'hui</div>
                    <div onClick={() => {
                      if (gridView === 'day') setGridRefDate(addDays(gridRefDate, 1));
                      else if (gridView === 'week') setGridRefDate(addDays(gridRefDate, 7));
                      else if (gridView === 'month') setGridRefDate(addMonths(gridRefDate, 1));
                    }} style={{ padding:'6px 11px', borderRadius:8, border:'1px solid '+T.border, background:T.surface, cursor:'pointer', fontSize:12, fontWeight:600, color:T.text2, display:'inline-flex', alignItems:'center', gap:4, transition:'all .15s cubic-bezier(0.4,0,0.2,1)' }}
                      onMouseEnter={e=>{e.currentTarget.style.background=T.accentBg;e.currentTarget.style.borderColor=T.accent+'40';e.currentTarget.style.color=T.accent;}}
                      onMouseLeave={e=>{e.currentTarget.style.background=T.surface;e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.text2;}}
                      title="Période suivante">
                      <I n="chevron-right" s={14}/>
                    </div>
                  </>
                )}
                {/* En mode custom : nav qui décale la plage entière de sa durée */}
                {gridView === 'custom' && (
                  <>
                    <div onClick={() => {
                      const delta = Math.max(1, dateDiffDays(dateFrom, dateTo) + 1);
                      setDateFrom(addDays(dateFrom, -delta));
                      setDateTo(addDays(dateTo, -delta));
                    }} style={{ padding:'6px 11px', borderRadius:8, border:'1px solid '+T.border, background:T.surface, cursor:'pointer', fontSize:12, fontWeight:600, color:T.text2, display:'inline-flex', alignItems:'center', gap:4, transition:'all .15s cubic-bezier(0.4,0,0.2,1)' }}
                      onMouseEnter={e=>{e.currentTarget.style.background=T.accentBg;e.currentTarget.style.borderColor=T.accent+'40';e.currentTarget.style.color=T.accent;}}
                      onMouseLeave={e=>{e.currentTarget.style.background=T.surface;e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.text2;}}
                      title="Plage précédente">
                      <I n="chevron-left" s={14}/>
                    </div>
                    <div onClick={() => { const today = toIso(new Date()); setDateFrom(today); setDateTo(addDays(today, 30)); }} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid '+T.accent+'40', background:T.accentBg, cursor:'pointer', fontSize:12, fontWeight:700, color:T.accent, transition:'all .15s cubic-bezier(0.4,0,0.2,1)', boxShadow:'0 1px 2px '+T.accent+'15' }}
                      onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 2px 6px '+T.accent+'25';e.currentTarget.style.transform='translateY(-1px)';}}
                      onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 2px '+T.accent+'15';e.currentTarget.style.transform='translateY(0)';}}
                      title="Recentrer sur aujourd'hui (30 jours)">Aujourd'hui</div>
                    <div onClick={() => {
                      const delta = Math.max(1, dateDiffDays(dateFrom, dateTo) + 1);
                      setDateFrom(addDays(dateFrom, delta));
                      setDateTo(addDays(dateTo, delta));
                    }} style={{ padding:'6px 11px', borderRadius:8, border:'1px solid '+T.border, background:T.surface, cursor:'pointer', fontSize:12, fontWeight:600, color:T.text2, display:'inline-flex', alignItems:'center', gap:4, transition:'all .15s cubic-bezier(0.4,0,0.2,1)' }}
                      onMouseEnter={e=>{e.currentTarget.style.background=T.accentBg;e.currentTarget.style.borderColor=T.accent+'40';e.currentTarget.style.color=T.accent;}}
                      onMouseLeave={e=>{e.currentTarget.style.background=T.surface;e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.text2;}}
                      title="Plage suivante">
                      <I n="chevron-right" s={14}/>
                    </div>
                  </>
                )}
                {/* Label période dynamique */}
                <div style={{ marginLeft:8, fontSize:14, fontWeight:700, color:T.text }}>
                  {gridView === 'day' && fmtDayLabel(gridRefDate) + ' ' + new Date(gridRefDate+'T00:00:00').getFullYear()}
                  {gridView === 'week' && (() => {
                    const m = mondayOf(gridRefDate); const s = addDays(m, 6);
                    return `${fmtDayLabel(m)} → ${fmtDayLabel(s)}`;
                  })()}
                  {gridView === 'month' && monthLabel(gridRefDate)}
                  {gridView === 'custom' && `${fmtDayLabel(dateFrom)} → ${fmtDayLabel(dateTo)} ${new Date(dateTo+'T00:00:00').getFullYear()}`}
                </div>
              </div>
              {/* Toggle 4 modes — Mois/Personnalisé masqués si mobile */}
              <div style={{ display:'flex', gap:3, padding:3, background:T.bg, borderRadius:10, border:'1px solid '+T.border, flexWrap:'wrap' }}>
                {[
                  { id:'day', label:'Jour' },
                  { id:'week', label:'Semaine' },
                  ...(!isMobile ? [
                    { id:'month', label:'Mois' },
                    { id:'custom', label:'Personnalisé' },
                  ] : []),
                ].map(v => {
                  const isActive = gridView === v.id;
                  return (
                    <div key={v.id} onClick={() => setGridView(v.id)} style={{
                      padding:'5px 13px', borderRadius:7, cursor:'pointer',
                      background: isActive ? T.surface : 'transparent',
                      color: isActive ? T.accent : T.text2,
                      fontSize:12, fontWeight: isActive ? 700 : 500,
                      transition:'all .15s cubic-bezier(0.4,0,0.2,1)',
                      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px '+T.accent+'30' : 'none',
                    }}
                    onMouseEnter={e=>{ if (!isActive) e.currentTarget.style.color = T.text; }}
                    onMouseLeave={e=>{ if (!isActive) e.currentTarget.style.color = T.text2; }}
                    >{v.label}</div>
                  );
                })}
              </div>
            </div>
            {/* En mode Personnalisé : inputs date + presets rapides en sous-ligne */}
            {gridView === 'custom' && (
              <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid '+T.border, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 8px', borderRadius:8, border:'1px solid '+T.border, background:T.bg }}>
                  <span style={{ fontSize:11, color:T.text3, fontWeight:600 }}>Du</span>
                  <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ border:'none', background:'transparent', fontSize:12, fontFamily:'inherit', color:T.text, outline:'none' }}/>
                  <span style={{ fontSize:11, color:T.text3, fontWeight:600 }}>au</span>
                  <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ border:'none', background:'transparent', fontSize:12, fontFamily:'inherit', color:T.text, outline:'none' }}/>
                </div>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  {[
                    { id:'7d', label:'7 jours' },
                    { id:'30d', label:'30 jours' },
                    { id:'thisMonth', label:'Ce mois' },
                    { id:'lastMonth', label:'Mois dernier' },
                    { id:'quarter', label:'Trimestre' },
                    { id:'year', label:'Année' },
                  ].map(p => (
                    <div key={p.id} onClick={() => applyPreset(p.id)} style={{ padding:'4px 10px', borderRadius:7, border:'1px solid '+T.border, background:T.surface, cursor:'pointer', fontSize:11, fontWeight:600, color:T.text2, transition:'all .12s' }}
                      onMouseEnter={e=>{e.currentTarget.style.background=T.accentBg;e.currentTarget.style.color=T.accent;e.currentTarget.style.borderColor=T.accent+'40';}}
                      onMouseLeave={e=>{e.currentTarget.style.background=T.surface;e.currentTarget.style.color=T.text2;e.currentTarget.style.borderColor=T.border;}}
                    >{p.label}</div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Compteur RDV affichés selon mode */}
          {(() => {
            let visibleDates = [];
            let label = '';
            if (gridView === 'day') { visibleDates = [gridRefDate]; label = 'ce jour'; }
            else if (gridView === 'week') { visibleDates = weekDatesFrom(mondayOf(gridRefDate)); label = 'cette semaine'; }
            else if (gridView === 'month') {
              const first = firstOfMonth(gridRefDate); const last = lastOfMonth(gridRefDate);
              visibleDates = []; for (let d = first; d <= last; d = addDays(d, 1)) visibleDates.push(d);
              label = 'ce mois';
            } else if (gridView === 'custom') {
              visibleDates = []; for (let d = dateFrom; d <= dateTo; d = addDays(d, 1)) visibleDates.push(d);
              label = 'sur la plage';
            }
            const visibleCount = bookings.filter(b => visibleDates.includes(b.date)).length;
            return (
              <div style={{ fontSize:11, color:T.text3, marginBottom:8 }}>{visibleCount} RDV {label} (sur {bookings.length} dans la plage filtrée)</div>
            );
          })()}

          {/* Rendering selon mode + comportement intelligent pour Personnalisé */}
          {gridView === 'day' && (
            <DayGrid
              bookings={bookings}
              dateIso={gridRefDate}
              onClickBooking={toggleAccordion}
              onOverflowClick={(dateIso, hour, bks) => setSlotOverflowModal({ dateIso, hour, bookings: bks })}
              resolveStageMeta={resolveStageMeta}
              collabName={collabName}
              collabColor={collabColor}
            />
          )}
          {gridView === 'week' && (
            <WeekGrid
              bookings={bookings}
              mondayIso={mondayOf(gridRefDate)}
              onClickBooking={toggleAccordion}
              onOverflowClick={(dateIso, hour, bks) => setSlotOverflowModal({ dateIso, hour, bookings: bks })}
              resolveStageMeta={resolveStageMeta}
              collabName={collabName}
              collabColor={collabColor}
            />
          )}
          {gridView === 'month' && (
            <MonthGrid
              bookings={bookings}
              refDateIso={gridRefDate}
              onClickBooking={toggleAccordion}
              onOverflowClick={(dateIso, hour, bks) => setSlotOverflowModal({ dateIso, hour, bookings: bks })}
              onFocusDay={(d) => { setGridView('day'); setGridRefDate(d); }}
              resolveStageMeta={resolveStageMeta}
              collabName={collabName}
              collabColor={collabColor}
            />
          )}
          {gridView === 'custom' && (() => {
            // V1.10.4.J V1c polish — 3 tiers de rendering intelligent :
            //   <=7 jours      → WeekGrid (vue détaillée slots horaires)
            //   8-31 jours     → MonthGrid normal (hybrid compact)
            //   >31 jours      → MonthGrid ultraCompact (cellules réduites pour grandes plages)
            const rangeDays = dateDiffDays(dateFrom, dateTo) + 1;
            if (rangeDays <= 7) {
              return (
                <WeekGrid
                  bookings={bookings}
                  mondayIso={mondayOf(dateFrom)}
                  onClickBooking={toggleAccordion}
                  onOverflowClick={(dateIso, hour, bks) => setSlotOverflowModal({ dateIso, hour, bookings: bks })}
                  resolveStageMeta={resolveStageMeta}
                  collabName={collabName}
                  collabColor={collabColor}
                />
              );
            }
            return (
              <MonthGrid
                bookings={bookings}
                refDateIso={dateFrom}
                onClickBooking={toggleAccordion}
                onOverflowClick={(dateIso, hour, bks) => setSlotOverflowModal({ dateIso, hour, bookings: bks })}
                onFocusDay={(d) => { setGridView('day'); setGridRefDate(d); }}
                resolveStageMeta={resolveStageMeta}
                collabName={collabName}
                collabColor={collabColor}
                ultraCompact={rangeDays > 31}
              />
            );
          })()}

          {/* Accordion inline du booking sélectionné (sous la grille) */}
          {expandedId && (() => {
            const b = bookings.find(x => x.id === expandedId);
            if (!b) return null;
            const stageMeta = resolveStageMeta(b.receiverPipelineStage);
            const reportingStatus = b.bookingReportingStatus || '';
            const tlEvents = (b.contactId && timelineByContact[b.contactId]) || [];
            const tlLoading = b.contactId && timelineLoading[b.contactId];
            const isCancelled = b.status === 'cancelled';
            return (
              <Card style={{ marginTop:12, padding:0, overflow:'hidden', borderLeft:`4px solid ${collabColor(b.agendaOwnerId)}` }}>
                <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid '+T.border, background:T.accentBg+'40' }}>
                  <I n="calendar" s={18} style={{ color:collabColor(b.agendaOwnerId) }}/>
                  <span style={{ fontSize:14, fontWeight:700, color:T.text, flex:1 }}>{b.contactName || b.visitorName || 'Sans nom'} · {fmtDateTime(b.date, b.time)}</span>
                  <div onClick={() => setExpandedId(null)} title="Fermer" style={{ padding:4, cursor:'pointer', color:T.text3 }}><I n="x" s={16}/></div>
                </div>
                <div style={{ padding:'14px 18px' }}>
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
                  {b.bookingReportingNote && (
                    <div style={{ marginBottom:12, padding:'8px 10px', borderRadius:8, background:T.bg, border:'1px solid '+T.border, fontSize:12, color:T.text2 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:T.text3, marginRight:6 }}>Note reporting :</span>
                      {b.bookingReportingNote}
                    </div>
                  )}
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
              </Card>
            );
          })()}

          {/* Modal overflow "+N" : liste compacte des RDV du créneau */}
          {slotOverflowModal && (
            <div onClick={() => setSlotOverflowModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16, boxSizing:'border-box' }}>
              <div onClick={e=>e.stopPropagation()} style={{ boxSizing:'border-box', background:T.surface, borderRadius:16, padding:18, width:'100%', maxWidth:520, maxHeight:'calc(100vh - 32px)', overflow:'auto', boxShadow:'0 20px 50px rgba(0,0,0,0.25)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:T.accentBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <I n="layers" s={18} style={{ color:T.accent }}/>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:T.text }}>{slotOverflowModal.bookings.length} RDV à {slotOverflowModal.hour}</div>
                    <div style={{ fontSize:11, color:T.text3 }}>{fmtDayLabel(slotOverflowModal.dateIso)}</div>
                  </div>
                  <div onClick={() => setSlotOverflowModal(null)} title="Fermer" style={{ width:28, height:28, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', background:T.bg, border:'1px solid '+T.border, color:T.text3 }}>
                    <I n="x" s={14}/>
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {slotOverflowModal.bookings.map(b => {
                    const stageMeta = resolveStageMeta(b.receiverPipelineStage);
                    const reportingMeta = REPORTING_STATUS_META[b.bookingReportingStatus || 'pending'] || REPORTING_STATUS_META.pending;
                    const isCancelled = b.status === 'cancelled';
                    return (
                      <div key={b.id} onClick={() => { setSlotOverflowModal(null); toggleAccordion(b); }}
                        style={{ padding:'10px 12px', borderRadius:10, border:'1px solid '+T.border, background: isCancelled ? T.bg : T.surface, borderLeft:`4px solid ${collabColor(b.agendaOwnerId)}`, cursor:'pointer', opacity: isCancelled ? 0.6 : 1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                          <span style={{ fontSize:13, fontWeight:700, color:T.text }}>{b.contactName || b.visitorName || 'Sans nom'}</span>
                          {isCancelled && <span style={{ fontSize:9, fontWeight:800, padding:'1px 5px', borderRadius:3, background:'#EF444415', color:'#EF4444' }}>ANNULÉ</span>}
                          {stageMeta && (
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:8, background:stageMeta.color+'15', color:stageMeta.color }}>{stageMeta.emoji} {stageMeta.label}</span>
                          )}
                          <span style={{ marginLeft:'auto', fontSize:11, fontWeight:700, color:reportingMeta.color }}>{reportingMeta.icon} {reportingMeta.short}</span>
                        </div>
                        <div style={{ fontSize:11, color:T.text3, display:'flex', alignItems:'center', gap:5 }}>
                          <span>{b.time}</span>
                          <span>·</span>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
                            <span style={{ display:'inline-block', width:8, height:8, borderRadius:4, background:collabColor(b.bookedByCollaboratorId) }}/>
                            <span style={{ fontWeight:600 }}>{collabName(b.bookedByCollaboratorId)}</span>
                            <span>→</span>
                            <span style={{ display:'inline-block', width:8, height:8, borderRadius:4, background:collabColor(b.agendaOwnerId) }}/>
                            <span style={{ fontWeight:600 }}>{collabName(b.agendaOwnerId)}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* V1.10.4.J V1a — Vue Liste (préservée intacte) ───────────────────────── */}
      {!loading && bookings.length > 0 && effectiveViewType === 'list' && (
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
