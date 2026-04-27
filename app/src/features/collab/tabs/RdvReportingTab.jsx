// V1.10.3 Phase 3 — Reporting Collab RDV (frontend)
// Onglet collab : 2 sous-vues "Reçus" / "Transmis" + modal "Faire le reporting"
// Dépendances : api (HTTP), T theme, I/Btn/Card/Spinner (UI), useCollabContext (collab+showNotif)

import React, { useState, useEffect, useCallback } from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Spinner } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

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

// ── Composant principal ─────────────────────────────────────────────────────
const RdvReportingTab = () => {
  const ctx = useCollabContext();
  const { collab, contacts, collabs, showNotif } = ctx;
  const allCollabs = (collabs && collabs.length) ? collabs : [];

  const [subTab, setSubTab] = useState('received'); // 'received' | 'sent'
  const [loadingReceived, setLoadingReceived] = useState(false);
  const [loadingSent, setLoadingSent] = useState(false);
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [errMsg, setErrMsg] = useState('');

  // Modal reporting
  const [reportingBooking, setReportingBooking] = useState(null);
  const [reportStatus, setReportStatus] = useState('validated');
  const [reportNote, setReportNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  const list = subTab === 'received' ? received : sent;
  const loading = subTab === 'received' ? loadingReceived : loadingSent;
  const onRefresh = subTab === 'received' ? fetchReceived : fetchSent;

  return (
    <div>
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
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
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
            const peerId = subTab === 'received' ? b.bookedByCollaboratorId : b.agendaOwnerId;
            const peerLabel = subTab === 'received' ? 'Transmis par' : 'Pour';
            const canReport = subTab === 'received' && !status;
            const reporterId = b.bookingReportedBy || '';
            const reportedAt = b.bookingReportedAt || '';
            return (
              <Card key={b.id} style={{ padding:14 }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap' }}>
                  {/* Avatar */}
                  <div style={{ width:42, height:42, borderRadius:14, background:T.accentBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <I n="calendar" s={18} style={{ color:T.accent }}/>
                  </div>
                  {/* Info principale */}
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                      <span style={{ fontSize:14, fontWeight:700, color:T.text }}>{contactName(b)}</span>
                      {contactPhone(b) && (
                        <span style={{ fontSize:11, color:T.text3, display:'inline-flex', alignItems:'center', gap:3 }}>
                          <I n="phone" s={11}/> {contactPhone(b)}
                        </span>
                      )}
                      {status ? <StatusBadge status={status}/> : <StatusBadge status="pending"/>}
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
                  {/* CTA reporting (Reçus uniquement, si pas encore rapporté) */}
                  {canReport && (
                    <Btn primary onClick={()=>openReporting(b)} style={{ flexShrink:0 }}>
                      <I n="check-square" s={13}/> Faire le reporting
                    </Btn>
                  )}
                </div>
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
    </div>
  );
};

export default RdvReportingTab;
