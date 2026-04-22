// FicheNotes — extraction S1.4b (7/11) depuis FicheContactModal.jsx L310-318
// Responsabilité : textarea notes avec debounce 800ms via collabNotesTimerRef.
// Sync setSelectedCrmContact + setContacts + _T.crmSync + PUT API.
// Aucun changement métier.

import React from "react";
import { T } from "../../../../../theme";
import { api } from "../../../../../shared/services/api";
import { _T } from "../../../../../shared/state/tabState";
import { useCollabContext } from "../../../context/CollabContext";

const FicheNotes = ({ ct }) => {
  const {
    company,
    setSelectedCrmContact, setContacts,
    collabNotesTimerRef,
  } = useCollabContext();

  return (
    <>
      <textarea value={ct.notes||""} onChange={e=>{
        const v=e.target.value;
        setSelectedCrmContact(p=>({...p,notes:v}));
        setContacts(p=>p.map(c=>c.id===ct.id?{...c,notes:v}:c));
        _T.crmSync?.({notes:v});
        clearTimeout(collabNotesTimerRef.current);
        collabNotesTimerRef.current=setTimeout(()=>api(`/api/data/contacts/${ct.id}`,{method:"PUT",body:{notes:v,companyId:company?.id}}),800);
      }} placeholder="Notes, infos commerciales, suivi..." style={{width:"100%",minHeight:70,maxHeight:140,border:`1px solid ${T.border}`,borderRadius:8,padding:10,fontSize:12,fontFamily:"inherit",resize:"vertical",background:T.bg,color:T.text,outline:"none"}}/>
      <p style={{fontSize:10,color:T.text3,marginTop:4}}>Sauvegarde automatique</p>
    </>
  );
};

export default FicheNotes;
