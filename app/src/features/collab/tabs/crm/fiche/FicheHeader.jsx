// FicheHeader — extraction S1.4b (1/11) depuis FicheContactModal.jsx L160-205
// Responsabilité : header de la fiche (avatar + nom + badges score/stage + bouton edit + fermer).
// Aucun changement métier. Symboles locaux (ct/stg/sc) reçus en props.

import React from "react";
import { T } from "../../../../../theme";
import { I, Avatar, Badge } from "../../../../../shared/ui";
import { _T } from "../../../../../shared/state/tabState";
import { useCollabContext } from "../../../context/CollabContext";

const FicheHeader = ({ ct, stg, sc }) => {
  const {
    collab, bookings,
    cScoreColor, cScoreLabel,
    editingContact, setEditingContact,
    setSelectedCrmContact, setCollabFicheTab,
    pipelineRightContact, setPipelineRightContact,
  } = useCollabContext();

  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
      {/* Helper synchro CRM → Pipeline */}
      {(()=>{_T.crmSync=(updates)=>{if((typeof pipelineRightContact!=='undefined'?pipelineRightContact:null)?.id===ct.id)(typeof setPipelineRightContact==='function'?setPipelineRightContact:function(){})(p=>p?{...p,...updates}:p);};return null;})()}
      <div style={{display:"flex",gap:16,alignItems:"center",flex:1}}>
        <Avatar name={ct.name} color={stg.color} size={56}/>
        <div style={{flex:1}}>
          <div>
            {ct._linked ? (
              <div>
                <div style={{fontSize:18,fontWeight:800,color:T.text}}>{ct.civility?ct.civility+' ':''}{ct.firstname||''} {ct.lastname||ct.name||''}</div>
                <div style={{fontSize:12,color:T.text3,marginTop:2}}>
                  {ct.email&&<span style={{display:'inline-flex',alignItems:'center',gap:3}}><I n="mail" s={10}/> {ct.email}</span>}
                  {ct.email&&ct.phone&&<span style={{margin:'0 6px'}}>·</span>}
                  {ct.phone&&<span style={{display:'inline-flex',alignItems:'center',gap:3}}><I n="phone" s={10}/> {ct.phone}</span>}
                </div>
              </div>
            ) : (
              <div>
                <div style={{fontSize:20,fontWeight:800,color:T.text}}>{ct.civility?ct.civility+' ':''}{ct.firstname||''} {ct.lastname||ct.name||''}</div>
                <div style={{fontSize:13,color:T.text3,marginTop:2}}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:3}}><I n="mail" s={10}/> {ct.email||"Email non renseigné"}</span>
                  <span style={{margin:'0 6px'}}>·</span>
                  <span style={{display:'inline-flex',alignItems:'center',gap:3}}><I n="phone" s={10}/> {ct.phone||"Téléphone non renseigné"}</span>
                </div>
                <div style={{marginTop:6,fontSize:11,color:T.accent,fontWeight:600}}>Ajoutez ce contact au CRM pour modifier ses informations</div>
              </div>
            )}
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:6,flexWrap:"wrap"}}>
              <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:cScoreColor(sc)+"18",color:cScoreColor(sc)}}>Score {sc} — {cScoreLabel(sc)}</span>
              <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:stg.color+"18",color:stg.color}}>{stg.label}</span>
              {ct.pipeline_stage==='nrp'&&(()=>{try{const n=JSON.parse(ct.nrp_followups_json||'[]').filter(f=>f.done).length;return n>0?<span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:800,background:'#EF4444',color:'#fff'}}>NRP x{n}</span>:null;}catch{return null;}})()}
              {ct._shared&&<span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:"#F9731618",color:"#F97316",display:"inline-flex",alignItems:"center",gap:3}}><I n="share-2" s={10}/> Partagé avec vous</span>}
              {ct.reassigned===1&&<span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:"#8B5CF618",color:"#8B5CF6",display:"inline-flex",alignItems:"center",gap:3}}><I n="refresh-cw" s={10}/> Reassigne</span>}
              {Array.isArray(ct.shared_with)&&ct.shared_with.length>0&&!ct._shared&&<span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:T.accentBg,color:T.accent}}>Partagé avec {ct.shared_with.length} collab{ct.shared_with.length>1?"s":""}</span>}
              {(ct.tags||[]).map(t=><Badge key={String(t)} color="#7C3AED">{String(t)}</Badge>)}
            </div>
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:12,alignItems:"center"}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:28,fontWeight:800,color:T.accent}}>{(bookings||[]).filter(b=>b.contactId===ct.id&&b.status!=='cancelled'&&(b.collaboratorId===collab.id)).length||(ct.totalBookings||0)}</div><div style={{fontSize:10,color:T.text3}}>RDV</div></div>
        {ct._linked&&<div onClick={()=>(typeof setEditingContact==='function'?setEditingContact:function(){})(editingContact===ct.id?null:ct.id)} style={{cursor:"pointer",padding:6,borderRadius:8,background:editingContact===ct.id?T.accentBg:T.bg}}><I n="edit-2" s={16} style={{color:editingContact===ct.id?T.accent:T.text3}}/></div>}
        <div onClick={()=>{setSelectedCrmContact(null);setCollabFicheTab("notes");setEditingContact(null);}} style={{cursor:"pointer",padding:6,borderRadius:8,background:T.bg}}><I n="x" s={18}/></div>
      </div>
    </div>
  );
};

export default FicheHeader;
