// FicheActionsBar — extraction S1.4b (3/11) depuis FicheContactModal.jsx L170-192
// Responsabilité : barre d'actions (pipeline stage selector + Email/Appeler/SMS/RDV/
// Classer Perdu/Supprimer) avec variantes ct._linked / !ct._linked.
// Aucun changement métier.

import React from "react";
import { T } from "../../../../../theme";
import { I, Btn } from "../../../../../shared/ui";
import { api } from "../../../../../shared/services/api";
import { useCollabContext } from "../../../context/CollabContext";

const FicheActionsBar = ({ ct, stg }) => {
  const {
    PIPELINE_STAGES,
    collab, calendars,
    handlePipelineStageChange,
    prefillKeypad,
    setCollabFicheTab,
    setPhoneScheduleForm, setPhoneShowScheduleModal,
    handleCollabDeleteContact,
    contactsLocalEditRef,
    setContacts, setPipelineRightContact, setSelectedCrmContact,
    showNotif,
  } = useCollabContext();

  return (
    <>
      {ct._linked && (
        <div style={{display:"flex",gap:8,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${T.border}`,flexWrap:"wrap",alignItems:"center"}}>
          <select value={ct.pipeline_stage||"nouveau"} onChange={e=>{
            const ns=e.target.value;
            handlePipelineStageChange(ct.id,ns);
          }} style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${stg.color}`,background:stg.color+"12",color:T.text,fontSize:12,fontWeight:600,fontFamily:"inherit",cursor:"pointer"}}>
            {PIPELINE_STAGES.map(st=><option key={st.id} value={st.id}>{st.label}</option>)}
          </select>
          {ct.email&&<Btn small onClick={()=>window.open("mailto:"+ct.email)}><I n="mail" s={13}/> Email</Btn>}
          {ct.phone&&<Btn small onClick={()=>prefillKeypad(ct.phone)}><I n="phone" s={13}/> Appeler</Btn>}
          {ct.phone&&<Btn small onClick={()=>setCollabFicheTab('sms')} style={{color:'#0EA5E9',borderColor:'#0EA5E930'}}><I n="message-square" s={13}/> SMS</Btn>}
          <Btn small onClick={()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{color:'#0EA5E9',borderColor:'#0EA5E930'}}><I n="calendar-plus" s={13}/> RDV</Btn>
          <Btn small onClick={()=>handleCollabDeleteContact(ct.id)} style={{color:'#64748B',borderColor:'#64748B30'}}><I n="archive" s={13}/> Classer Perdu</Btn>
          {collab?.can_delete_contacts ? <Btn small onClick={async()=>{if(confirm("Supprimer définitivement "+ct.name+" ?")){contactsLocalEditRef.current=Date.now();setContacts(p=>p.filter(c=>c.id!==ct.id));await api("/api/data/contacts/"+ct.id,{method:"DELETE"});showNotif("Contact supprimé définitivement");setPipelineRightContact(null);setSelectedCrmContact(null);setTimeout(()=>{contactsLocalEditRef.current=0;},30000);}}} style={{color:'#EF4444',borderColor:'#EF444430'}}><I n="trash-2" s={13}/> Supprimer</Btn> : null}
        </div>
      )}
      {!ct._linked && (
        <div style={{display:"flex",gap:8,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${T.border}`,flexWrap:"wrap"}}>
          {ct.email&&<Btn small onClick={()=>window.open("mailto:"+ct.email)}><I n="mail" s={13}/> Email</Btn>}
          {ct.phone&&<Btn small onClick={()=>prefillKeypad(ct.phone)}><I n="phone" s={13}/> Appeler</Btn>}
        </div>
      )}
    </>
  );
};

export default FicheActionsBar;
