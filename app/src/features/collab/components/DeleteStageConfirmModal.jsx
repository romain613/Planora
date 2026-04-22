// DeleteStageConfirmModal — extraction S1.1 (3/4) depuis CrmTab.jsx L808-830
// Responsabilite : confirmer la suppression d'un stage custom avec count
//                  des contacts qui y sont encore rattaches (seront deplaces
//                  vers 'nouveau').
// Tous les symboles consommes viennent de CollabContext.

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Badge } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const DeleteStageConfirmModal = () => {
  const {
    confirmDeleteStage, setConfirmDeleteStage,
    handleDeleteCustomStage,
    filteredCollabCrm,
  } = useCollabContext();

  if (!(typeof confirmDeleteStage !== 'undefined' ? confirmDeleteStage : null)) return null;

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.45)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setConfirmDeleteStage(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.bg,borderRadius:16,padding:24,maxWidth:420,width:"90%",boxShadow:"0 25px 50px rgba(0,0,0,0.25)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <div style={{width:44,height:44,borderRadius:22,background:"#FEE2E2",display:"flex",alignItems:"center",justifyContent:"center",color:"#DC2626"}}><I n="alert-triangle" s={22}/></div>
          <div>
            <h3 style={{fontSize:16,fontWeight:700,margin:0}}>Supprimer cette colonne ?</h3>
            <p style={{fontSize:13,color:T.text3,margin:"4px 0 0"}}>Les contacts seront déplacés vers "Nouveau".</p>
          </div>
        </div>
        <div style={{padding:14,borderRadius:10,background:(typeof confirmDeleteStage!=='undefined'?confirmDeleteStage:{}).color+"10",border:`1px solid ${(typeof confirmDeleteStage!=='undefined'?confirmDeleteStage:{}).color}30`,marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:(typeof confirmDeleteStage!=='undefined'?confirmDeleteStage:{}).color}}/>
          <span style={{fontSize:15,fontWeight:700,color:(typeof confirmDeleteStage!=='undefined'?confirmDeleteStage:{}).color}}>{(typeof confirmDeleteStage!=='undefined'?confirmDeleteStage:{}).label}</span>
          <Badge color={(typeof confirmDeleteStage!=='undefined'?confirmDeleteStage:{}).color}>{filteredCollabCrm.filter(c=>(c.pipeline_stage||"nouveau")===(typeof confirmDeleteStage!=='undefined'?confirmDeleteStage:{}).id).length} contacts</Badge>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn onClick={()=>setConfirmDeleteStage(null)}>Annuler</Btn>
          <Btn onClick={()=>{handleDeleteCustomStage((typeof confirmDeleteStage!=='undefined'?confirmDeleteStage:{}).id);(typeof setConfirmDeleteStage==='function'?setConfirmDeleteStage:function(){})(null);}} style={{background:"#DC2626",color:"#fff",border:"none"}}><I n="trash-2" s={14}/> Supprimer</Btn>
        </div>
      </div>
    </div>
  );
};

export default DeleteStageConfirmModal;
