// V1.10.4.A Étape 2 — Modal de réassignation d'un RDV transmis cross-collab.
//
// Backend : PUT /api/bookings/:id/reassign
//   Body : { newAgendaOwnerId, newCalendarId? }
//   Auth : admin/supra OU sender (bookedByCollaboratorId)
//
// Garanties Niveau 1 :
//   - Si googleEventId/outlookEventId présent → backend renvoie 409 EXTERNAL_SYNC_PRESENT
//     (le bouton qui ouvre ce modal est déjà disabled côté PhoneTab, ce modal sert de
//     garde-fou défensif côté UI au cas où).
//   - bookedByCollaboratorId IMMUABLE (sender reste sender, pas modifiable ici).
//
// Picker collaborateur cible : filtré pour exclure :
//   - le sender (bookedByCollaboratorId) — pas de réassign à soi-même
//   - le receiver actuel (agendaOwnerId) — pas de no-op
//   - les collabs archivés
//   - les collabs sans calendrier (le backend rejetterait EXECUTOR_NO_CALENDAR de toute
//     façon, on filtre côté UI pour UX claire)
//
// Picker calendarId : si le collab cible a plusieurs calendriers → choix; sinon auto-résolu.
//
// Affichage erreurs backend :
//   EXTERNAL_SYNC_PRESENT (409) — RDV synchronisé Google/Outlook (Phase 3 différée)
//   REPORTING_LOCKED (409)      — reporting validé/signé/no_show/cancelled
//   SLOT_CONFLICT (409)         — créneau occupé chez nouveau collab
//   EXECUTOR_NO_CALENDAR (400)  — collab cible sans calendrier
//   CALENDAR_OWNER_MISMATCH (409) — calendarId pas membre du nouveau collab (V3.x.15.A)
//   CALENDAR_NOT_FOUND (404), CALENDAR_WRONG_COMPANY (403)
//   COLLABORATOR_ARCHIVED (409) — collab cible archivé
//   FORBIDDEN (403), BOOKING_NOT_FOUND (404), NOT_TRANSFER_BOOKING (400)

import React, { useState, useMemo, useEffect } from "react";
import { T } from "../../../theme";
import { I, Btn } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

const ReassignBookingModal = () => {
  const ctx = useCollabContext();
  const {
    reassignBookingModal,
    setReassignBookingModal,
    collab, company, collabs, calendars, bookings, contacts, showNotif,
    setBookings, setContacts,
  } = ctx;

  const booking = reassignBookingModal;
  const [targetCollabId, setTargetCollabId] = useState("");
  const [targetCalendarId, setTargetCalendarId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

  // Reset au open/close
  useEffect(() => {
    setTargetCollabId("");
    setTargetCalendarId("");
    setSubmitting(false);
    setErrorCode("");
    setErrorDetail("");
  }, [booking?.id]);

  // ── Calendars filtrés par collab cible (V3.x.15.A — appartient à agendaOwnerId) ──
  const targetCalendars = useMemo(() => {
    if (!targetCollabId) return [];
    return (calendars || []).filter(cal => {
      try {
        const members = Array.isArray(cal.collaborators) ? cal.collaborators
          : (typeof cal.collaborators_json === 'string' ? JSON.parse(cal.collaborators_json) : []);
        return Array.isArray(members) && members.includes(targetCollabId);
      } catch { return false; }
    });
  }, [calendars, targetCollabId]);

  // Auto-set calendarId si un seul disponible pour le collab cible
  useEffect(() => {
    if (targetCalendars.length === 1) setTargetCalendarId(targetCalendars[0].id);
    else if (targetCalendars.length === 0) setTargetCalendarId("");
    else if (!targetCalendars.find(c => c.id === targetCalendarId)) setTargetCalendarId("");
  }, [targetCalendars]);

  // ── Collabs filtrés (target picker) ──
  const eligibleCollabs = useMemo(() => {
    if (!booking) return [];
    return (collabs || []).filter(c => {
      if (!c || !c.id) return false;
      if (c.id === booking.bookedByCollaboratorId) return false;  // pas le sender
      if (c.id === booking.agendaOwnerId) return false;            // pas le receiver actuel (no-op)
      if (c.archivedAt && c.archivedAt !== '') return false;       // pas archivés
      // Vérifier qu'au moins un calendrier appartient à ce collab
      const hasCal = (calendars || []).some(cal => {
        try {
          const members = Array.isArray(cal.collaborators) ? cal.collaborators
            : (typeof cal.collaborators_json === 'string' ? JSON.parse(cal.collaborators_json) : []);
          return Array.isArray(members) && members.includes(c.id);
        } catch { return false; }
      });
      return hasCal;
    });
  }, [collabs, calendars, booking]);

  if (!booking) return null;

  const _ownerName = (collabs || []).find(c => c.id === booking.agendaOwnerId)?.name || booking.agendaOwnerId || '—';
  const _senderName = (collabs || []).find(c => c.id === booking.bookedByCollaboratorId)?.name || booking.bookedByCollaboratorId || '—';
  const _contactName = booking.visitorName || (booking.contactId
    ? ((contacts || []).find(c => c.id === booking.contactId)?.name || '—')
    : '—');

  const close = () => {
    if (submitting) return;
    setReassignBookingModal && setReassignBookingModal(null);
  };

  const ERROR_LABELS = {
    EXTERNAL_SYNC_PRESENT: "RDV synchronisé Google/Outlook — réassignation Phase 3 (différée). Annulez puis recréez.",
    REPORTING_LOCKED: "Le reporting est verrouillé (validé/signé/no-show/annulé) — réassignation impossible.",
    SLOT_CONFLICT: "Le créneau est déjà occupé sur le collaborateur cible.",
    EXECUTOR_NO_CALENDAR: "Le collaborateur cible n'a aucun calendrier configuré.",
    CALENDAR_OWNER_MISMATCH: "Le calendrier sélectionné n'appartient pas au collaborateur cible.",
    CALENDAR_NOT_FOUND: "Calendrier introuvable.",
    CALENDAR_WRONG_COMPANY: "Calendrier hors entreprise.",
    COLLABORATOR_ARCHIVED: "Le collaborateur cible est archivé.",
    COLLABORATOR_NOT_FOUND: "Collaborateur cible introuvable.",
    FORBIDDEN: "Vous n'avez pas l'autorisation de réassigner ce RDV.",
    BOOKING_NOT_FOUND: "Le RDV est introuvable.",
    NOT_TRANSFER_BOOKING: "Ce booking n'est pas un RDV transmis.",
    ALREADY_ASSIGNED: "Le RDV est déjà assigné à ce collaborateur.",
    NEW_AGENDA_OWNER_ID_MISSING: "Sélectionnez un collaborateur cible.",
    BOOKING_ID_MISSING: "ID booking manquant.",
    BOOKING_WRONG_COMPANY: "Booking hors entreprise.",
  };

  const submit = async () => {
    if (submitting) return;
    if (!targetCollabId) { setErrorCode('NEW_AGENDA_OWNER_ID_MISSING'); setErrorDetail('Sélectionnez un collaborateur cible.'); return; }
    setErrorCode(''); setErrorDetail('');
    setSubmitting(true);
    try {
      const r = await api(`/api/bookings/${booking.id}/reassign`, {
        method: 'PUT',
        body: {
          newAgendaOwnerId: targetCollabId,
          ...(targetCalendarId ? { newCalendarId: targetCalendarId } : {}),
        },
      });
      if (r?.success && r?.booking) {
        // Resync state local
        if (typeof setBookings === 'function') {
          setBookings(prev => (prev || []).map(b => b.id === r.booking.id ? { ...b, ...r.booking } : b));
        }
        showNotif && showNotif('RDV réassigné — ' + ((collabs||[]).find(c=>c.id===targetCollabId)?.name || ''), 'success');
        setReassignBookingModal && setReassignBookingModal(null);
      } else {
        const code = r?.error || 'UNKNOWN_ERROR';
        setErrorCode(code);
        setErrorDetail(r?.detail || ERROR_LABELS[code] || 'Erreur inconnue');
      }
    } catch (e) {
      setErrorCode('NETWORK_ERROR');
      setErrorDetail(e?.message || 'Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  };

  const _hasExternalSync = !!(booking.googleEventId || booking.outlookEventId);

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={close}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:20,padding:24,maxWidth:480,width:'90%',boxShadow:'0 25px 50px rgba(0,0,0,0.25)',maxHeight:'90vh',overflowY:'auto'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
          <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#7C3AED,#6D28D9)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <I n="users" s={18} style={{color:'#fff'}}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <h3 style={{fontSize:16,fontWeight:700,margin:0}}>Réattribuer ce RDV</h3>
            <div style={{fontSize:12,color:T.text3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{_contactName} · {booking.date} {booking.time}</div>
          </div>
          <span onClick={close} style={{cursor:'pointer',color:T.text3}}><I n="x" s={18}/></span>
        </div>

        {/* Contexte transmission */}
        <div style={{padding:'8px 12px',borderRadius:10,background:'#F5F3FF',border:'1px solid #DDD6FE',marginBottom:12,fontSize:12,color:'#5B21B6'}}>
          <div><b>🤝 Apporté par</b> : {_senderName}</div>
          <div><b>🎯 Géré actuellement par</b> : {_ownerName}</div>
        </div>

        {/* Garde-fou : sync externe — modal devrait rarement s'ouvrir ici car bouton disabled, mais défense en profondeur */}
        {_hasExternalSync && (
          <div style={{padding:'10px 12px',borderRadius:10,background:'#FEF2F2',border:'1px solid #FECACA',marginBottom:12,fontSize:12,color:'#991B1B'}}>
            <b>🔗 RDV synchronisé externe</b> — la réassignation est impossible Niveau 1 (Phase 3 requise pour delete+recreate Google/Outlook). Annulez le RDV puis recréez-le pour changer de collaborateur.
          </div>
        )}

        {/* Picker collaborateur cible */}
        <div style={{marginBottom:12}}>
          <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Réattribuer à</label>
          <select
            value={targetCollabId}
            onChange={e => setTargetCollabId(e.target.value)}
            disabled={_hasExternalSync || submitting}
            style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',fontFamily:'inherit'}}
          >
            <option value="">— Choisir un collaborateur —</option>
            {eligibleCollabs.map(c => (
              <option key={c.id} value={c.id}>{c.name || c.firstName || c.id}</option>
            ))}
          </select>
          {eligibleCollabs.length === 0 && !_hasExternalSync && (
            <div style={{fontSize:11,color:'#92400E',marginTop:4,fontStyle:'italic'}}>
              Aucun collaborateur éligible (autre que sender/receiver, non archivé, avec calendrier).
            </div>
          )}
        </div>

        {/* Picker calendarId si plusieurs disponibles */}
        {targetCollabId && targetCalendars.length > 1 && (
          <div style={{marginBottom:12}}>
            <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Calendrier cible</label>
            <select
              value={targetCalendarId}
              onChange={e => setTargetCalendarId(e.target.value)}
              disabled={submitting}
              style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',fontFamily:'inherit'}}
            >
              <option value="">— Calendrier auto-résolu —</option>
              {targetCalendars.map(c => (
                <option key={c.id} value={c.id}>{c.name || c.id}</option>
              ))}
            </select>
          </div>
        )}
        {targetCollabId && targetCalendars.length === 1 && (
          <div style={{marginBottom:12,fontSize:11,color:T.text3,fontStyle:'italic'}}>
            Calendrier auto-résolu : <b>{targetCalendars[0].name || targetCalendars[0].id}</b>
          </div>
        )}

        {/* Erreur backend */}
        {errorCode && (
          <div style={{padding:'10px 14px',borderRadius:10,background:'#FEE2E2',border:'1px solid #FECACA',color:'#DC2626',fontSize:13,fontWeight:600,marginBottom:12,display:'flex',alignItems:'flex-start',gap:8}}>
            <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
            <div>
              <div>{ERROR_LABELS[errorCode] || errorCode}</div>
              {errorDetail && errorDetail !== ERROR_LABELS[errorCode] && (
                <div style={{fontSize:11,fontWeight:400,marginTop:4,opacity:0.85}}>{errorDetail}</div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <Btn small style={{flex:1,justifyContent:'center'}} onClick={close} disabled={submitting}>Annuler</Btn>
          <Btn
            small
            primary
            disabled={submitting || _hasExternalSync || !targetCollabId}
            style={{flex:1,justifyContent:'center',opacity:(submitting || _hasExternalSync || !targetCollabId)?0.6:1}}
            onClick={submit}
          >
            <I n="users" s={14}/> {submitting ? 'En cours...' : 'Réattribuer'}
          </Btn>
        </div>
      </div>
    </div>
  );
};

export default ReassignBookingModal;
