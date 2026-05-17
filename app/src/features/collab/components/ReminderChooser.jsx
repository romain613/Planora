// V1.10.4-r11.0.27.b — Phase 2 SAFE : ReminderChooser compact.
// Déclenché depuis ContacteChooser (option "🔔 Créer un rappel").
// Crée un booking type='reminder' interne Planora :
//   - durée 15min default (modifiable)
//   - status='confirmed' (créneau réservé localement)
//   - source='reminder' (distingue du flow ScheduleRdvModal)
//   - bookingType='reminder' (skip GCal+Outlook+Tasks via guards backend r11.0.27.b)
//   - Notification cloche déclenchée en Phase C (r11.0.27.c) via reminderFired flag.
//
// Style aligné ContacteChooser/PerduMotifModal (backdrop blur 6px rgba 0.7,
// carte 460px borderRadius 20). Pas de cascade undo (création booking jamais
// dans undoStack v1, aligné rdv_programme).

import React, { useState, useMemo } from "react";
import { I } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";
import { api } from "../../../shared/services/api";

const _pad = n => String(n).padStart(2, '0');
const _fmtDate = d => d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate());
const _fmtTime = d => _pad(d.getHours()) + ':' + _pad(d.getMinutes());

// Calcule la date+heure pour un preset donné. Heures arrondies au quart d'heure suivant.
const _presetDateTime = (preset) => {
  const now = new Date();
  if (preset === '1h') {
    const t = new Date(now.getTime() + 60 * 60 * 1000);
    // arrondi au quart d'heure supérieur
    const m = t.getMinutes();
    const next = m % 15 === 0 ? m : m + (15 - (m % 15));
    if (next >= 60) { t.setHours(t.getHours() + 1); t.setMinutes(0); } else t.setMinutes(next);
    t.setSeconds(0);
    return { date: _fmtDate(t), time: _fmtTime(t) };
  }
  const d = new Date(now);
  if (preset === 'tomorrow') d.setDate(d.getDate() + 1);
  if (preset === '3d') d.setDate(d.getDate() + 3);
  if (preset === '1w') d.setDate(d.getDate() + 7);
  d.setHours(10, 0, 0, 0); // default 10:00 pour presets multi-jours
  return { date: _fmtDate(d), time: _fmtTime(d) };
};

const ReminderChooser = () => {
  const {
    reminderChooser,
    setReminderChooser,
    contacts,
    bookings,
    setBookings,
    calendars,
    collab,
    company,
    showNotif,
  } = useCollabContext();

  const open = !!reminderChooser;
  const contactId = reminderChooser?.contactId || '';
  const contact = useMemo(
    () => (contacts || []).find(c => c.id === contactId),
    [contacts, contactId]
  );

  const _initial = useMemo(() => _presetDateTime('tomorrow'), []);
  const [preset, setPreset] = useState('tomorrow');
  const [date, setDate] = useState(_initial.date);
  const [time, setTime] = useState(_initial.time);
  const [duration, setDuration] = useState(15);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const contactName = contact?.name
    || (((contact?.firstname || '') + ' ' + (contact?.lastname || '')).trim())
    || 'ce contact';

  const onPresetClick = (id) => {
    setPreset(id);
    if (id !== 'custom') {
      const dt = _presetDateTime(id);
      setDate(dt.date);
      setTime(dt.time);
    }
  };

  const onClose = () => {
    setReminderChooser(null);
    // Reset local state pour la prochaine ouverture
    setPreset('tomorrow');
    const dt = _presetDateTime('tomorrow');
    setDate(dt.date);
    setTime(dt.time);
    setDuration(15);
    setNote('');
    setSubmitting(false);
  };

  const onCreate = () => {
    if (submitting) return;
    if (!date || !time) {
      if (typeof showNotif === 'function') showNotif('Date et heure obligatoires', 'danger');
      return;
    }
    setSubmitting(true);
    const bkId = 'bk' + Date.now();
    // Calendrier par défaut du collab courant (même résolution que ScheduleRdvModal).
    const _firstCal = (calendars || []).find(c => c.collaboratorId === collab?.id) || (calendars || [])[0];
    const calId = _firstCal?.id || '';
    if (!calId) {
      setSubmitting(false);
      if (typeof showNotif === 'function') showNotif("Aucun calendrier trouvé pour ce collab", 'danger');
      return;
    }
    const bk = {
      id: bkId,
      companyId: company?.id || '',
      collaboratorId: collab?.id || '',
      agendaOwnerId: collab?.id || '',
      bookedByCollaboratorId: collab?.id || '',
      calendarId: calId,
      contactId,
      visitorName: contactName,
      visitorEmail: '', // rappel interne : pas d'email visiteur
      visitorPhone: contact?.phone || '',
      title: '🔔 Rappel · ' + contactName,
      date,
      time,
      duration: Number(duration) || 15,
      status: 'confirmed',
      source: 'reminder',
      notes: note.trim(),
      bookingType: 'reminder', // ⚠ critique — sync GCal/Outlook/Tasks skip via guards backend
      reminderFired: 0, // Phase C r11.0.27.c utilisera ce flag pour déclencher la notif
    };
    // Optimistic update
    setBookings(p => [...(p || []), bk]);
    api('/api/bookings', { method: 'POST', body: bk })
      .then(r => {
        if (r && r.error) throw new Error(r.error);
        if (r?.booking?.id) {
          setBookings(p => (p || []).map(b => b.id === r.booking.id ? { ...b, ...r.booking } : b));
        }
        if (typeof showNotif === 'function') showNotif('🔔 Rappel créé pour ' + contactName);
        onClose();
      })
      .catch(err => {
        console.error('[REMINDER CREATE ERROR]', err);
        // Rollback optimistic
        setBookings(p => (p || []).filter(b => b.id !== bkId));
        setSubmitting(false);
        if (typeof showNotif === 'function') showNotif('Erreur création rappel : ' + (err.message || ''), 'danger');
      });
  };

  const presets = [
    { id: '1h', icon: 'clock', label: 'Dans 1h', hint: 'Heure modifiable ci-dessous' },
    { id: 'tomorrow', icon: 'sunrise', label: 'Demain', hint: '10:00 par défaut' },
    { id: '3d', icon: 'calendar', label: '3 jours', hint: 'Dans 3 jours' },
    { id: '1w', icon: 'calendar', label: '1 semaine', hint: 'Dans 7 jours' },
    { id: 'custom', icon: 'settings', label: 'Personnalisé', hint: 'Date + heure libres' },
  ];

  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:10002, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(6px)', padding:16, boxSizing:'border-box' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:460, borderRadius:20, background:'#fff', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:24, boxSizing:'border-box', maxHeight:'92vh', overflow:'auto' }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'#F59E0B15', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <I n="bell" s={22} style={{ color:'#F59E0B' }} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:17, fontWeight:800, color:'#1F2937' }}>Créer un rappel</div>
            <div style={{ fontSize:11, color:'#6B7280', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{contactName}</div>
          </div>
          <div onClick={onClose} title="Annuler" style={{ cursor:'pointer', padding:6, borderRadius:8, background:'#F3F4F6' }}>
            <I n="x" s={16} />
          </div>
        </div>

        {/* Presets */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:6, marginBottom:14 }}>
          {presets.map(p => {
            const active = preset === p.id;
            return (
              <div
                key={p.id}
                onClick={() => onPresetClick(p.id)}
                title={p.hint}
                style={{
                  padding:'10px 6px',
                  borderRadius:10,
                  border:'1.5px solid ' + (active ? '#F59E0B' : '#E5E7EB'),
                  background: active ? '#FEF3C7' : '#F9FAFB',
                  cursor:'pointer',
                  transition:'all .15s',
                  display:'flex',
                  flexDirection:'column',
                  alignItems:'center',
                  gap:4,
                  textAlign:'center',
                }}
              >
                <I n={p.icon} s={16} style={{ color: active ? '#B45309' : '#6B7280' }} />
                <div style={{ fontSize:10, fontWeight:700, color: active ? '#92400E' : '#374151', whiteSpace:'nowrap' }}>{p.label}</div>
              </div>
            );
          })}
        </div>

        {/* Date + Time + Duration inputs */}
        <div style={{ display:'flex', gap:8, marginBottom:14 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase', letterSpacing:0.4 }}>Date</div>
            <input
              type="date"
              value={date}
              onChange={e => { setDate(e.target.value); setPreset('custom'); }}
              style={{ width:'100%', padding:'9px 10px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'#F9FAFB', fontSize:13, fontFamily:'inherit', color:'#1F2937', outline:'none', boxSizing:'border-box' }}
            />
          </div>
          <div style={{ width:110 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase', letterSpacing:0.4 }}>Heure</div>
            <input
              type="time"
              value={time}
              onChange={e => { setTime(e.target.value); setPreset('custom'); }}
              style={{ width:'100%', padding:'9px 10px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'#F9FAFB', fontSize:13, fontFamily:'inherit', color:'#1F2937', outline:'none', boxSizing:'border-box' }}
            />
          </div>
          <div style={{ width:80 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase', letterSpacing:0.4 }}>Durée</div>
            <input
              type="number"
              min={5}
              max={120}
              step={5}
              value={duration}
              onChange={e => setDuration(e.target.value)}
              style={{ width:'100%', padding:'9px 10px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'#F9FAFB', fontSize:13, fontFamily:'inherit', color:'#1F2937', outline:'none', boxSizing:'border-box' }}
            />
          </div>
        </div>

        {/* Note */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase', letterSpacing:0.4 }}>Note (optionnelle)</div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Ex: rappeler après devis, client hésitant, attente documents…"
            rows={3}
            style={{ width:'100%', padding:10, borderRadius:10, border:'1.5px solid #E5E7EB', background:'#F9FAFB', fontSize:13, fontFamily:'inherit', color:'#1F2937', resize:'vertical', outline:'none', boxSizing:'border-box' }}
            onFocus={e => e.target.style.borderColor = '#F59E0B'}
            onBlur={e => e.target.style.borderColor = '#E5E7EB'}
          />
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:8 }}>
          <div onClick={onClose} style={{ flex:1, padding:'11px 0', textAlign:'center', borderRadius:10, border:'1px solid #E5E7EB', cursor:'pointer', fontSize:13, fontWeight:600, color:'#6B7280', background:'#fff' }}>
            Annuler
          </div>
          <div
            onClick={onCreate}
            style={{
              flex:1.5,
              padding:'11px 0',
              textAlign:'center',
              borderRadius:10,
              background: submitting ? '#FBBF24' : '#F59E0B',
              cursor: submitting ? 'wait' : 'pointer',
              fontSize:13,
              fontWeight:700,
              color:'#fff',
              opacity: submitting ? 0.85 : 1,
            }}
          >
            {submitting ? 'Création…' : '🔔 Créer le rappel'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReminderChooser;
