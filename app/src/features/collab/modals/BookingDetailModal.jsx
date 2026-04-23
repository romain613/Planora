// BookingDetailModal — extraction S2.10 depuis CollabPortal.jsx L4871-5068
// Responsabilité : modal d'édition d'un booking (RDV) avec 3 onglets :
//   - RDV     : détails + statut modifiable + timezone + replanification + actions
//   - Contact : info contact + pipeline stage + tags + historique RDV + quick actions
//   - Notes   : textarea note contact + dernier contact + rating
//
// Logique métier complexe préservée à l'identique :
//   - Status change déclenche updateBooking + sendNotification(booking-confirmed/cancelled)
//   - Timezone display : calcul offset DST-aware via Intl.DateTimeFormat
//   - Reschedule : updateBooking + sendNotification(rescheduled) avec newDate/newTime
//   - Notification reminder : sendNotification(reminder) + actionLoading transient
//   - Delete : deleteBooking (wrapper updateBooking + setSelectedBooking null)
//   - Quick actions contact : startVoipCall / mailto / Fiche complète (portal navigation)
//
// NOTE VIGILANCE : le onClick "Confirmer" du reschedule (L~115 de ce fichier)
// passe `collaborators` à buildNotifyPayload — ce symbole n'est DÉCLARÉ NULLE PART
// dans CollabPortal.jsx (vérifié par grep exhaustif). Ce reference bug était
// latent dans le bloc inline original et est PRÉSERVÉ VERBATIM côté extraction
// (aucune modification de logique métier). Si l'action "Confirmer replanification"
// est effectivement cliquée → ReferenceError. Préexistant, pas introduit par S2.10.
//
// Shape du booking consommé : { id, calendarId, contactId, visitorEmail,
// visitorName, visitorTimezone, visitorPhone, date, time, duration, status,
// notes, collaboratorId }. Non typé.

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Badge, Input, Spinner, Modal } from "../../../shared/ui";
import { displayPhone } from "../../../shared/utils/phone";
import { fmtDate } from "../../../shared/utils/dates";
import { sendNotification, buildNotifyPayload } from "../../../shared/utils/notifications";
import { useCollabContext } from "../context/CollabContext";

const BookingDetailModal = () => {
  const {
    selectedBooking, setSelectedBooking,
    bookingDetailTab, setBookingDetailTab,
    rescheduleData, setRescheduleData,
    actionLoading, setActionLoading,
    calendars, contacts, bookings, collabs, collab, company,
    pipelineStages, DEFAULT_STAGES,
    updateBooking, deleteBooking, toGoogleCalUrl,
    handleCollabUpdateContact,
    setSelectedCrmContact, setCollabFicheTab,
    startVoipCall,
    cScoreColor,
    showNotif,
  } = useCollabContext();

  return (
    <Modal open={!!selectedBooking} onClose={() => { setSelectedBooking(null); setRescheduleData(null); setBookingDetailTab('rdv'); }} title="" width={640}>
      {selectedBooking && (() => {
        const b = selectedBooking;
        const cal = calendars.find(c => c.id === b.calendarId);
        const _bContact = b.contactId ? (contacts||[]).find(c => c.id === b.contactId) : (contacts||[]).find(c => c.email && b.visitorEmail && c.email.toLowerCase() === b.visitorEmail.toLowerCase());
        const _bContactBookings = _bContact ? (bookings||[]).filter(bk => bk.contactId === _bContact.id).sort((a,bb) => (bb.date+bb.time).localeCompare(a.date+a.time)) : [];
        const _bStages = [...(DEFAULT_STAGES||[{id:"nouveau",label:"Nouveau",color:"#2563EB"},{id:"contacte",label:"En discussion",color:"#F59E0B"},{id:"qualifie",label:"Intéressé",color:"#7C3AED"},{id:"rdv_programme",label:"RDV Programmé",color:"#0EA5E9"},{id:"nrp",label:"NRP",color:"#EF4444"},{id:"client_valide",label:"Client Validé",color:"#22C55E"},{id:"perdu",label:"Perdu",color:"#64748B"}]), ...(pipelineStages||[])];
        const _bCurrentStage = _bContact ? _bStages.find(s => s.id === _bContact.pipeline_stage) : null;
        return (
          <div>
            {/* ── Header: Nom + Statut RDV ── */}
            <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:16 }}>
              <div style={{ width:48, height:48, borderRadius:14, background:(cal?.color||T.accent)+"14", display:"flex", alignItems:"center", justifyContent:"center", color:cal?.color||T.accent, fontWeight:700, fontSize:18 }}>{(b.visitorName||'?')[0]}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{ fontSize:18, fontWeight:700 }}>{b.visitorName}</div>
                <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:2 }}>
                  <span style={{ fontSize:12, color:T.text3 }}>{cal?.name||''}</span>
                  {_bContact && <span style={{ fontSize:10, padding:"1px 6px", borderRadius:6, background:(_bCurrentStage?.color||T.text3)+"14", color:_bCurrentStage?.color||T.text3, fontWeight:600 }}>{_bCurrentStage?.label||_bContact.pipeline_stage||''}</span>}
                  {_bContact?._score !== undefined && <span style={{ fontSize:10, fontWeight:700, color:cScoreColor(_bContact._score) }}>Score {_bContact._score}</span>}
                </div>
              </div>
              <Badge color={b.status==="confirmed"?T.success:b.status==="pending"?T.warning:T.danger}>{b.status==="confirmed"?"Confirmé":b.status==="pending"?"En attente":"Annulé"}</Badge>
            </div>

            {/* ── Tabs ── */}
            <div style={{ display:"flex", gap:0, marginBottom:16, borderBottom:`2px solid ${T.border}` }}>
              {[
                {id:'rdv', label:'RDV', icon:'calendar'},
                {id:'contact', label:'Contact', icon:'user', disabled:!_bContact},
                {id:'notes', label:'Notes', icon:'edit-3', disabled:!_bContact},
              ].map(t => (
                <div key={t.id} onClick={() => !t.disabled && setBookingDetailTab(t.id)} style={{ padding:"8px 16px", fontSize:13, fontWeight:bookingDetailTab===t.id?700:500, color:t.disabled?T.text3+'60':bookingDetailTab===t.id?T.accent:T.text2, borderBottom:bookingDetailTab===t.id?`2px solid ${T.accent}`:'2px solid transparent', marginBottom:-2, cursor:t.disabled?'default':'pointer', display:'flex', alignItems:'center', gap:5, opacity:t.disabled?0.4:1, transition:'all .15s' }}>
                  <I n={t.icon} s={14}/> {t.label}
                </div>
              ))}
            </div>

            {/* ══════ ONGLET RDV ══════ */}
            {bookingDetailTab === 'rdv' && (
              <div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                  {[
                    { icon:"calendar", label:"Date", value:fmtDate(b.date) },
                    { icon:"clock", label:"Heure", value:`${b.time} · ${b.duration}min` },
                    { icon:"mail", label:"Email", value:b.visitorEmail||'—' },
                    { icon:"phone", label:"Téléphone", value:b.visitorPhone||"—" },
                  ].map((f,i) => (
                    <div key={i} style={{ padding:"10px 14px", borderRadius:8, background:T.bg, display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ color:T.text3 }}><I n={f.icon} s={15}/></span>
                      <div>
                        <div style={{ fontSize:10, color:T.text3 }}>{f.label}</div>
                        <div style={{ fontSize:13, fontWeight:600 }}>{f.value}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Statut modifiable */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:T.text3, marginBottom:6 }}>Statut du RDV</div>
                  <div style={{ display:'flex', gap:6 }}>
                    {[{id:'confirmed',label:'Confirmé',color:T.success,icon:'check'},{id:'pending',label:'En attente',color:T.warning,icon:'clock'},{id:'cancelled',label:'Annulé',color:T.danger,icon:'x'}].map(s => (
                      <div key={s.id} onClick={() => { if(b.status!==s.id){ updateBooking(b.id,{status:s.id}); setSelectedBooking({...b,status:s.id}); showNotif(`RDV ${s.label.toLowerCase()}`); if(s.id==='confirmed') sendNotification('booking-confirmed',buildNotifyPayload(b,calendars,[collab],company)); if(s.id==='cancelled') sendNotification('cancelled',buildNotifyPayload(b,calendars,[collab],company)); }}} style={{ padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:b.status===s.id?700:500, background:b.status===s.id?s.color+'18':'transparent', color:b.status===s.id?s.color:T.text3, border:`1px solid ${b.status===s.id?s.color+'40':T.border}`, cursor:'pointer', display:'flex', alignItems:'center', gap:4, transition:'all .15s' }}>
                        <I n={s.icon} s={12}/> {s.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timezone info */}
                {b.visitorTimezone && (() => {
                  const collabObj = b.collaboratorId ? collabs.find(c => c.id === b.collaboratorId) : null;
                  const collabTz = collabObj?.timezone || (company?.timezone) || 'Europe/Paris';
                  if (b.visitorTimezone === collabTz) return null;
                  let visitorLocalTime = b.time;
                  try { const [hh,mm]=b.time.split(':'); const dt=new Date(`${b.date}T${hh}:${mm}:00`); const getOffset=(tz)=>{const s=new Intl.DateTimeFormat('en',{timeZone:tz,timeZoneName:'shortOffset'}).format(dt);const m=s.match(/GMT([+-]?\d+:?\d*)/);if(!m)return 0;const p=m[1].split(':');return(parseInt(p[0])||0)*60+(parseInt(p[1])||0)*(p[0].startsWith('-')?-1:1);}; const diffMin=getOffset(b.visitorTimezone)-getOffset(collabTz); const[h2,m2]=b.time.split(':').map(Number); const totalMin=h2*60+m2+diffMin; const vh=Math.floor(((totalMin%1440)+1440)%1440/60); const vm=((totalMin%1440)+1440)%1440%60; visitorLocalTime=`${String(vh).padStart(2,'0')}:${String(vm).padStart(2,'0')}`; } catch{}
                  return (<div style={{ padding:"10px 14px", borderRadius:8, background:"#FFF7ED", border:"1px solid #FDBA7422", marginBottom:16, fontSize:12, color:"#9A3412", display:"flex", alignItems:"center", gap:8 }}><I n="globe" s={15}/><div><div><strong>Visiteur :</strong> {visitorLocalTime} ({b.visitorTimezone.replace(/_/g,' ')})</div><div><strong>Collaborateur :</strong> {b.time} ({collabTz.replace(/_/g,' ')})</div></div></div>);
                })()}

                {b.notes && (<div style={{ padding:"10px 14px", borderRadius:8, background:T.warningBg, border:`1px solid ${T.warning}22`, marginBottom:16, fontSize:13, color:T.text }}><span style={{ fontWeight:600, color:T.warning }}>Notes :</span> {b.notes}</div>)}

                {/* Reschedule */}
                {rescheduleData && (
                  <div style={{ padding:16, borderRadius:10, background:T.accentBg, border:`1px solid ${T.accentBorder}`, marginBottom:16 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:T.accent, marginBottom:10 }}>Replanifier</div>
                    <div style={{ display:"flex", gap:10 }}>
                      <Input label="Nouvelle date" type="date" value={rescheduleData.date} onChange={e => setRescheduleData({...rescheduleData, date:e.target.value})} style={{ flex:1 }}/>
                      <Input label="Nouvelle heure" type="time" value={rescheduleData.time} onChange={e => setRescheduleData({...rescheduleData, time:e.target.value})} style={{ flex:1 }}/>
                    </div>
                    <div style={{ display:"flex", gap:8, marginTop:10 }}>
                      <Btn small primary onClick={() => { updateBooking(b.id, { date:rescheduleData.date, time:rescheduleData.time }); const rPayload = buildNotifyPayload(b, calendars, collaborators, company); sendNotification('rescheduled', { ...rPayload, newDate: rescheduleData.date, newTime: rescheduleData.time }); setSelectedBooking({...b, date:rescheduleData.date, time:rescheduleData.time}); setRescheduleData(null); showNotif("RDV replanifié"); }}>Confirmer</Btn>
                      <Btn small onClick={() => setRescheduleData(null)}>Annuler</Btn>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
                  {!rescheduleData && b.status!=="cancelled" && (<Btn onClick={() => setRescheduleData({ date:b.date, time:b.time })}><I n="edit" s={14}/> Replanifier</Btn>)}
                  <Btn disabled={!!actionLoading} onClick={() => { setActionLoading("notify"); showNotif("Rappel envoyé par email + SMS","warning"); sendNotification('reminder', buildNotifyPayload(b, calendars, [collab], company)); setTimeout(()=>setActionLoading(null),600); }}>{actionLoading==="notify" ? <Spinner size={14}/> : <I n="bell" s={14}/>} Notifier</Btn>
                  <Btn onClick={() => { showNotif("Email de rappel envoyé","warning"); sendNotification('reminder', buildNotifyPayload(b, calendars, [collab], company)); }}><I n="mail" s={14}/> Rappel email</Btn>
                  <Btn onClick={() => window.open(toGoogleCalUrl(b),"_blank")}><I n="calendar" s={14}/> Google Agenda</Btn>
                  <Btn ghost danger onClick={() => { deleteBooking(b.id); setSelectedBooking(null); }}><I n="trash" s={14}/> Supprimer</Btn>
                </div>
              </div>
            )}

            {/* ══════ ONGLET CONTACT ══════ */}
            {bookingDetailTab === 'contact' && _bContact && (
              <div>
                {/* Contact info */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                  {[
                    { icon:"mail", label:"Email", value:_bContact.email||'—' },
                    { icon:"phone", label:"Téléphone", value:_bContact.phone ? displayPhone(_bContact.phone) : '—' },
                  ].map((f,i) => (
                    <div key={i} style={{ padding:"10px 14px", borderRadius:8, background:T.bg, display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ color:T.text3 }}><I n={f.icon} s={15}/></span>
                      <div>
                        <div style={{ fontSize:10, color:T.text3 }}>{f.label}</div>
                        <div style={{ fontSize:13, fontWeight:600 }}>{f.value}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pipeline stage — modifiable */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:T.text3, marginBottom:6 }}>Étape pipeline</div>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                    {_bStages.map(s => (
                      <div key={s.id} onClick={() => { handleCollabUpdateContact(_bContact.id, { pipeline_stage: s.id }); showNotif(`Étape → ${s.label}`); }} style={{ padding:'4px 10px', borderRadius:8, fontSize:11, fontWeight:_bContact.pipeline_stage===s.id?700:500, background:_bContact.pipeline_stage===s.id?s.color+'18':'transparent', color:_bContact.pipeline_stage===s.id?s.color:T.text3, border:`1px solid ${_bContact.pipeline_stage===s.id?s.color+'40':T.border}`, cursor:'pointer', transition:'all .15s' }}>
                        <span style={{display:'inline-block',width:6,height:6,borderRadius:3,background:s.color,marginRight:4}}></span>{s.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                {(_bContact.tags||[]).length > 0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:T.text3, marginBottom:6 }}>Tags</div>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      {(_bContact.tags||[]).map(t => <Badge key={String(t)} color="#7C3AED">{String(t)}</Badge>)}
                    </div>
                  </div>
                )}

                {/* Historique RDV */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:T.text3, marginBottom:6 }}>Historique RDV ({_bContactBookings.length})</div>
                  <div style={{ maxHeight:200, overflowY:'auto' }}>
                    {_bContactBookings.length === 0 && <div style={{ fontSize:12, color:T.text3, padding:8 }}>Aucun RDV</div>}
                    {_bContactBookings.map(bk => (
                      <div key={bk.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderRadius:8, background:bk.id===b.id?T.accentBg:T.bg, marginBottom:4, border:bk.id===b.id?`1px solid ${T.accent}30`:'1px solid transparent' }}>
                        <I n="calendar" s={12} style={{color:T.text3}}/>
                        <span style={{ fontSize:12, fontWeight:bk.id===b.id?700:500 }}>{fmtDate(bk.date)} {bk.time}</span>
                        <span style={{ fontSize:11, color:T.text3 }}>{bk.duration}min</span>
                        <Badge color={bk.status==='confirmed'?T.success:bk.status==='pending'?T.warning:T.danger} style={{fontSize:9,marginLeft:'auto'}}>{bk.status==='confirmed'?'Confirmé':bk.status==='pending'?'En attente':'Annulé'}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick actions */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
                  {_bContact.email && <Btn onClick={() => window.open('mailto:'+_bContact.email)}><I n="mail" s={14}/> Email</Btn>}
                  {_bContact.phone && <Btn onClick={() => { if(typeof startVoipCall==='function') startVoipCall(_bContact.phone,_bContact); else window.open('tel:'+_bContact.phone); }}><I n="phone" s={14}/> Appeler</Btn>}
                  <Btn onClick={() => { setSelectedBooking(null); setBookingDetailTab('rdv'); setSelectedCrmContact(_bContact); setCollabFicheTab('notes'); }}><I n="external-link" s={14}/> Fiche complète</Btn>
                </div>
              </div>
            )}

            {/* ══════ ONGLET NOTES ══════ */}
            {bookingDetailTab === 'notes' && _bContact && (
              <div>
                <textarea value={_bContact.notes||''} onChange={e => { const v = e.target.value; handleCollabUpdateContact(_bContact.id, { notes: v }); }} placeholder="Ajoutez des notes sur ce contact..." style={{ width:'100%', minHeight:140, padding:12, borderRadius:10, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:13, resize:'vertical', fontFamily:'inherit', outline:'none' }}/>
                <div style={{ fontSize:10, color:T.text3, marginTop:4 }}>Sauvegarde automatique</div>

                {/* Dernier contact info */}
                {_bContact.lastVisit && (
                  <div style={{ marginTop:16, padding:"10px 14px", borderRadius:8, background:T.bg, fontSize:12 }}>
                    <span style={{ color:T.text3 }}>Dernier contact :</span> <span style={{ fontWeight:600 }}>{fmtDate(_bContact.lastVisit)}</span>
                    {(() => { const d=Math.floor((Date.now()-new Date(_bContact.lastVisit).getTime())/86400000); return d>=14?<span style={{marginLeft:8,color:d>=30?'#EF4444':'#F59E0B',fontWeight:700,fontSize:11}}>{d}j sans contact</span>:null; })()}
                  </div>
                )}

                {/* Scoring */}
                {_bContact.rating > 0 && (
                  <div style={{ marginTop:12, fontSize:13, color:"#F59E0B" }}>{"★".repeat(_bContact.rating)}{"☆".repeat(5-_bContact.rating)}</div>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </Modal>
  );
};

export default BookingDetailModal;
