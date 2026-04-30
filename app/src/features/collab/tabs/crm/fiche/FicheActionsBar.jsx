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
          {/* V1.12.8.a — Archiver (DELETE /:id redéfini en alias archive backend V1.12.7) */}
          {collab?.can_delete_contacts && (!ct.archivedAt || ct.archivedAt==='') ? <Btn small onClick={async()=>{if(confirm("Archiver "+ct.name+" ?\n\nLe contact sera masqué mais récupérable.")){contactsLocalEditRef.current=Date.now();setContacts(p=>p.filter(c=>c.id!==ct.id));const r=await api("/api/data/contacts/"+ct.id,{method:"DELETE"});if(r?.action==='archived'){showNotif("Contact archivé (récupérable)");setPipelineRightContact(null);setSelectedCrmContact(null);}else{showNotif(r?.error||"Erreur archivage","danger");}setTimeout(()=>{contactsLocalEditRef.current=0;},30000);}}} style={{color:'#EF4444',borderColor:'#EF444430'}}><I n="archive" s={13}/> Archiver</Btn> : null}
          {/* V1.12.8.a — Restaurer (POST /:id/restore) si contact archivé */}
          {ct.archivedAt && ct.archivedAt!=='' ? <Btn small onClick={async()=>{contactsLocalEditRef.current=Date.now();const r=await api("/api/data/contacts/"+ct.id+"/restore",{method:"POST"});if(r?.action==='restored'){showNotif("Contact restauré");const updated={...ct,archivedAt:'',archivedBy:'',archivedReason:''};setContacts(p=>{const exists=p.some(c=>c.id===ct.id);return exists?p.map(c=>c.id===ct.id?updated:c):[...p,updated];});setPipelineRightContact(null);setSelectedCrmContact(null);}else{showNotif(r?.error||"Erreur restauration","danger");}setTimeout(()=>{contactsLocalEditRef.current=0;},30000);}} style={{color:'#22C55E',borderColor:'#22C55E30'}}><I n="rotate-ccw" s={13}/> Restaurer</Btn> : null}
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
