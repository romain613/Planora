// V1.10.4.D Étape 2 — Modal conflit créneau lors recover sender d'un RDV transmis.
//
// Triggered : backend renvoie 409 SENDER_SLOT_CONFLICT sur cancel-transmission/resume
//             (cf. server/services/bookings/reassignBooking.js _cancelOrResume).
//
// 3 actions proposées (spec MH V1.10.4.D) :
//   ❌ Annuler ce RDV transmis    → PUT /api/bookings/:id { status:'cancelled' }
//   📅 Déplacer le RDV            → close + setSelectedBooking (ouvre BookingDetailModal,
//                                     user clique "Replanifier" pour changer date/heure)
//   ↩️ Réattribuer à un autre     → close + setReassignBookingModal (ouvre picker existant)
//
// Aucune restauration auto chez le sender — le RDV reste chez le receiver tant que MH
// n'a pas tranché (cf. spec V1.10.4.D §ÉTAPE 3 "NE PAS faire récupération automatique").

import React, { useState } from "react";
import { T } from "../../../theme";
import { I, Btn } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

const SenderConflictModal = () => {
  const ctx = useCollabContext();
  const {
    senderConflictModal,
    setSenderConflictModal,
    setReassignBookingModal,
    setSelectedBooking,
    collabs, contacts, showNotif, setBookings,
  } = ctx;

  const data = senderConflictModal; // { booking, conflictBookingId?, detail? }
  const [submitting, setSubmitting] = useState(false);

  if (!data || !data.booking) return null;
  const booking = data.booking;

  const _close = () => {
    if (submitting) return;
    setSenderConflictModal && setSenderConflictModal(null);
  };

  const _doCancelBooking = async () => {
    if (submitting) return;
    if (!confirm("Annuler définitivement ce RDV ?\n\nLe RDV sera marqué status='cancelled'. Action tracée dans audit_logs.")) return;
    setSubmitting(true);
    try {
      const r = await api(`/api/bookings/${booking.id}`, { method: 'PUT', body: { status: 'cancelled' } });
      if (r?.success || r?.booking || r?.id) {
        if (typeof setBookings === 'function') {
          setBookings(prev => (prev || []).map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b));
        }
        showNotif && showNotif('RDV annulé', 'success');
        setSenderConflictModal && setSenderConflictModal(null);
      } else {
        showNotif && showNotif('Erreur annulation : ' + (r?.error || 'UNKNOWN'), 'danger');
      }
    } catch (e) {
      showNotif && showNotif('Erreur réseau : ' + (e?.message || ''), 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const _doMove = () => {
    if (submitting) return;
    setSenderConflictModal && setSenderConflictModal(null);
    if (typeof setSelectedBooking === 'function') setSelectedBooking(booking);
    showNotif && showNotif('Cliquez "Replanifier" dans la fiche RDV pour changer date/heure', 'success');
  };

  const _doReassign = () => {
    if (submitting) return;
    setSenderConflictModal && setSenderConflictModal(null);
    if (typeof setReassignBookingModal === 'function') setReassignBookingModal(booking);
  };

  const _contactName = booking.visitorName || (booking.contactId
    ? ((contacts || []).find(c => c.id === booking.contactId)?.name || '—')
    : '—');
  const _conflictBookingId = data.conflictBookingId || null;
  const _detail = data.detail || 'Le créneau est déjà occupé dans votre agenda.';

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={_close}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:20,padding:24,maxWidth:480,width:'90%',boxShadow:'0 25px 50px rgba(0,0,0,0.25)',maxHeight:'90vh',overflowY:'auto'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
          <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#F59E0B,#D97706)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <span style={{fontSize:20}}>⚠️</span>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <h3 style={{fontSize:16,fontWeight:700,margin:0}}>Créneau déjà occupé</h3>
            <div style={{fontSize:12,color:T.text3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{_contactName} · {booking.date} {booking.time}</div>
          </div>
          <span onClick={_close} style={{cursor:'pointer',color:T.text3,flexShrink:0}}><I n="x" s={18}/></span>
        </div>

        {/* Bandeau explication */}
        <div style={{padding:'10px 14px',borderRadius:10,background:'#FEF3C7',border:'1px solid #FDE68A',marginBottom:14,fontSize:13,color:'#92400E',lineHeight:1.5}}>
          {_detail}
          {_conflictBookingId && (
            <div style={{fontSize:11,marginTop:6,opacity:0.75}}>
              RDV bloqueur : <code style={{background:'#FFFBEB',padding:'1px 4px',borderRadius:3}}>{_conflictBookingId}</code>
            </div>
          )}
        </div>

        <div style={{fontSize:11,color:T.text3,marginBottom:10,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>
          Que souhaitez-vous faire ?
        </div>

        {/* Actions */}
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
          <button
            type="button"
            onClick={_doCancelBooking}
            disabled={submitting}
            style={{padding:'12px 14px',borderRadius:10,border:'1px solid #FCA5A5',background:'#FEF2F2',color:'#B91C1C',cursor:submitting?'not-allowed':'pointer',fontWeight:600,fontSize:13,fontFamily:'inherit',textAlign:'left',opacity:submitting?0.6:1,display:'flex',alignItems:'center',gap:10}}
          >
            <span style={{fontSize:18,flexShrink:0}}>❌</span>
            <span style={{flex:1}}>
              <div>Annuler ce RDV transmis</div>
              <div style={{fontSize:11,fontWeight:400,color:'#7F1D1D',marginTop:2}}>Marque le booking <code>status=cancelled</code>. Action tracée.</div>
            </span>
          </button>

          <button
            type="button"
            onClick={_doMove}
            disabled={submitting}
            style={{padding:'12px 14px',borderRadius:10,border:'1px solid #93C5FD',background:'#EFF6FF',color:'#1E40AF',cursor:submitting?'not-allowed':'pointer',fontWeight:600,fontSize:13,fontFamily:'inherit',textAlign:'left',opacity:submitting?0.6:1,display:'flex',alignItems:'center',gap:10}}
          >
            <span style={{fontSize:18,flexShrink:0}}>📅</span>
            <span style={{flex:1}}>
              <div>Déplacer le RDV</div>
              <div style={{fontSize:11,fontWeight:400,color:'#1E3A8A',marginTop:2}}>Ouvre la fiche RDV — utilisez "Replanifier" pour changer date/heure.</div>
            </span>
          </button>

          <button
            type="button"
            onClick={_doReassign}
            disabled={submitting}
            style={{padding:'12px 14px',borderRadius:10,border:'1px solid #C4B5FD',background:'#F5F3FF',color:'#6D28D9',cursor:submitting?'not-allowed':'pointer',fontWeight:600,fontSize:13,fontFamily:'inherit',textAlign:'left',opacity:submitting?0.6:1,display:'flex',alignItems:'center',gap:10}}
          >
            <span style={{fontSize:18,flexShrink:0}}>↩️</span>
            <span style={{flex:1}}>
              <div>Réattribuer à un autre collaborateur</div>
              <div style={{fontSize:11,fontWeight:400,color:'#5B21B6',marginTop:2}}>Ouvre le sélecteur de collab cible (RDV reste actif).</div>
            </span>
          </button>
        </div>

        {/* Footer */}
        <div style={{display:'flex',gap:8,marginTop:14,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
          <Btn small style={{flex:1,justifyContent:'center'}} onClick={_close} disabled={submitting}>Fermer (ne rien faire)</Btn>
        </div>
      </div>
    </div>
  );
};

export default SenderConflictModal;
