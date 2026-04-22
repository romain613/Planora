// FicheBookings — extraction S1.4b (4/11) depuis FicheContactModal.jsx L254-308
// Responsabilité : onglet History (RDV) — liste À venir / Passés avec actions
// (note inline, replanifier, supprimer). Affiché quand collabFicheTab==="history".
// Aucun changement métier.

import React from "react";
import { T } from "../../../../../theme";
import { I, Btn, Badge } from "../../../../../shared/ui";
import { api } from "../../../../../shared/services/api";
import { useCollabContext } from "../../../context/CollabContext";

const FicheBookings = ({ ct, contactBookings }) => {
  const {
    collabFicheTab,
    calendars,
    setPhoneScheduleForm, setPhoneShowScheduleModal,
    setBookings,
    showNotif,
  } = useCollabContext();

  if (collabFicheTab !== "history") return null;

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <span style={{fontSize:12,fontWeight:700,color:T.text3}}>{contactBookings.length} rendez-vous</span>
        <Btn small onClick={()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{color:'#fff',background:'#0EA5E9',borderColor:'#0EA5E9'}}><I n="calendar-plus" s={13}/> Nouveau RDV</Btn>
      </div>
      {contactBookings.length===0&&(
        <div onClick={()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{padding:30,textAlign:"center",borderRadius:10,border:'1.5px dashed #8B5CF640',background:'#8B5CF608',cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.borderColor='#8B5CF6'} onMouseLeave={e=>e.currentTarget.style.borderColor='#8B5CF640'}>
          <I n="calendar-plus" s={24} style={{color:'#8B5CF6',marginBottom:6}}/>
          <div style={{fontSize:13,fontWeight:700,color:'#8B5CF6'}}>Programmer un premier RDV</div>
          <div style={{fontSize:11,color:T.text3,marginTop:2}}>Cliquez pour créer un rendez-vous</div>
        </div>
      )}
      {/* Séparation: À venir / Passés */}
      {(()=>{
        const todayS=new Date().toISOString().split('T')[0];
        const upcoming=contactBookings.filter(b=>b.date>=todayS&&b.status!=='cancelled').sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
        const past=contactBookings.filter(b=>b.date<todayS||b.status==='cancelled').sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
        const renderRdv=(b,isUpcoming)=>{
          const cal=calendars.find(c=>c.id===b.calendarId);
          const stColor=b.status==='confirmed'?'#22C55E':b.status==='pending'?'#F59E0B':'#EF4444';
          return(
            <div key={b.id} style={{padding:'10px 12px',borderRadius:10,marginBottom:6,background:isUpcoming?stColor+'06':T.bg,border:`1px solid ${isUpcoming?stColor+'25':T.border}`,borderLeft:`4px solid ${stColor}`}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text}}>{new Date(b.date).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})} à {b.time}</div>
                  <div style={{fontSize:11,color:T.text3}}>{cal?.name||'Calendrier'} · {b.duration}min</div>
                </div>
                <Badge color={stColor}>{b.status==='confirmed'?'Confirmé':b.status==='pending'?'En attente':'Annulé'}</Badge>
                {b.noShow&&<Badge color="#EF4444">No-show</Badge>}
              </div>
              {/* Notes du RDV — éditable inline */}
              {b.notes&&<div style={{fontSize:12,color:T.text2,padding:'4px 8px',borderRadius:6,background:T.card,border:`1px solid ${T.border}`,marginTop:4,fontStyle:'italic'}}><I n="sticky-note" s={10} style={{color:'#F59E0B',marginRight:4}}/>{b.notes}</div>}
              <div style={{display:'flex',gap:4,marginTop:6}}>
                <span onClick={()=>{const n=prompt('Note pour ce RDV :',b.notes||'');if(n===null)return;api(`/api/bookings/${b.id}`,{method:'PUT',body:{notes:n}}).then(()=>{setBookings(p=>p.map(x=>x.id===b.id?{...x,notes:n}:x));showNotif('Note RDV mise à jour','success');}).catch(()=>showNotif('Erreur','danger'));}} style={{fontSize:10,color:T.accent,cursor:'pointer',fontWeight:600,display:'flex',alignItems:'center',gap:3}}><I n="edit-3" s={10}/> {b.notes?'Modifier note':'Ajouter note'}</span>
                {isUpcoming&&b.status==='confirmed'&&<span onClick={()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:b.date,time:b.time,duration:b.duration||30,notes:b.notes||'',calendarId:b.calendarId||(calendars||[])[0]?.id||'',_bookingMode:true,_editBookingId:b.id});setPhoneShowScheduleModal(true);}} style={{fontSize:10,color:'#F59E0B',cursor:'pointer',fontWeight:600,display:'flex',alignItems:'center',gap:3}}><I n="calendar" s={10}/> Replanifier</span>}
                <span onClick={()=>{if(!confirm('Supprimer ce RDV ?'))return;api(`/api/bookings/${b.id}`,{method:'DELETE'}).then(r=>{if(r?.success!==false){setBookings(p=>p.filter(x=>x.id!==b.id));showNotif('RDV supprimé','success');}else showNotif(r?.error||'Erreur','danger');}).catch(()=>showNotif('Erreur','danger'));}} style={{fontSize:10,color:'#EF4444',cursor:'pointer',fontWeight:600,display:'flex',alignItems:'center',gap:3,marginLeft:'auto'}}><I n="trash-2" s={10}/> Supprimer</span>
              </div>
            </div>
          );
        };
        return <>
          {upcoming.length>0&&<div style={{marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:'#22C55E',marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="calendar-check" s={12}/> À venir ({upcoming.length})</div>
            {upcoming.map(b=>renderRdv(b,true))}
          </div>}
          {past.length>0&&<div>
            <div style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="clock" s={12}/> Passés ({past.length})</div>
            {past.map(b=>renderRdv(b,false))}
          </div>}
        </>;
      })()}
    </div>
  );
};

export default FicheBookings;
