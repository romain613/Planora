// FicheShare — extraction cleanup post-S1 (ex-bloc inline "Partage tab")
// Responsabilité : onglet Partage — toggle shared_with par collaborateur.
// Affiché uniquement si collabFicheTab === "partage", ct._linked et ct.assignedTo === collab.id.
// Aucun changement métier.

import React from "react";
import { T } from "../../../../../theme";
import { I, Avatar } from "../../../../../shared/ui";
import { useCollabContext } from "../../../context/CollabContext";

const FicheShare = ({ ct }) => {
  const {
    collab, collabs,
    collabFicheTab,
    handleCollabUpdateContact,
    setSelectedCrmContact,
    showNotif,
  } = useCollabContext();

  if (collabFicheTab !== "partage" || !ct._linked || ct.assignedTo !== collab.id) return null;

  return (
    <div>
      <div style={{padding:"12px 16px",borderRadius:10,background:T.accentBg,border:`1px solid ${T.accent}33`,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:T.accent,marginBottom:4}}><I n="share-2" s={14}/> Partager ce contact</div>
        <div style={{fontSize:12,color:T.text3}}>Les collaborateurs sélectionnés verront ce contact dans leur CRM avec le badge "Partagé".</div>
      </div>
      {collabs.filter(co=>co.id!==collab.id).length===0?(
        <div style={{padding:30,textAlign:"center",color:T.text3,fontSize:13}}>Aucun autre collaborateur dans l'entreprise</div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {collabs.filter(co=>co.id!==collab.id).map(co=>{
            const isSharedWith=Array.isArray(ct.shared_with)&&ct.shared_with.includes(co.id);
            return (
              <div key={co.id} onClick={()=>{
                const newShared=isSharedWith?(ct.shared_with||[]).filter(id=>id!==co.id):[...(ct.shared_with||[]),co.id];
                handleCollabUpdateContact(ct.id,{shared_with:newShared});
                setSelectedCrmContact(p=>({...p,shared_with:newShared}));
                showNotif(isSharedWith?`Partage retiré pour ${co.name}`:`Contact partagé avec ${co.name}`);
              }} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,cursor:"pointer",background:isSharedWith?T.accent+"08":T.bg,border:`1.5px solid ${isSharedWith?T.accent+"44":T.border}`,transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>{if(!isSharedWith)e.currentTarget.style.borderColor=T.border;}}>
                <Avatar name={co.name} color={co.color||T.accent} size={32}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.text}}>{co.name}</div>
                  <div style={{fontSize:11,color:T.text3}}>{co.email||""}</div>
                </div>
                <div style={{width:36,height:20,borderRadius:10,background:isSharedWith?"#22C55E":"#D1D5DB",position:"relative",transition:"background .2s",cursor:"pointer"}}>
                  <div style={{width:16,height:16,borderRadius:8,background:"#fff",position:"absolute",top:2,left:isSharedWith?18:2,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {Array.isArray(ct.shared_with)&&ct.shared_with.length>0&&(
        <div style={{marginTop:16,padding:"10px 14px",borderRadius:10,background:T.bg,border:`1px solid ${T.border}`}}>
          <div style={{fontSize:11,fontWeight:600,color:T.text3}}>Partagé avec {ct.shared_with.length} collaborateur{ct.shared_with.length>1?"s":""}</div>
        </div>
      )}
    </div>
  );
};

export default FicheShare;
