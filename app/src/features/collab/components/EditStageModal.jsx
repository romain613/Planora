// EditStageModal — extraction S1.1 (2/4) depuis CrmTab.jsx L805-833
// Responsabilite : modifier un stage custom existant (label + couleur).
// Tous les symboles consommes viennent de CollabContext.

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Input } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const EditStageModal = () => {
  const {
    editingStage, setEditingStage,
    editStageForm, setEditStageForm,
    handleUpdateCustomStage,
  } = useCollabContext();

  if (!(typeof editingStage !== 'undefined' ? editingStage : null)) return null;

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.45)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setEditingStage(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.bg,borderRadius:16,padding:24,maxWidth:400,width:"90%",boxShadow:"0 25px 50px rgba(0,0,0,0.25)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
          <div style={{width:36,height:36,borderRadius:18,background:(typeof editStageForm!=='undefined'?editStageForm:{}).color+"18",display:"flex",alignItems:"center",justifyContent:"center",color:(typeof editStageForm!=='undefined'?editStageForm:{}).color}}><I n="edit-2" s={18}/></div>
          <h3 style={{fontSize:16,fontWeight:700,margin:0}}>Modifier la colonne</h3>
          <span onClick={()=>setEditingStage(null)} style={{marginLeft:"auto",cursor:"pointer",color:T.text3}}><I n="x" s={16}/></span>
        </div>
        <Input label="Nom du statut" value={(typeof editStageForm!=='undefined'?editStageForm:{}).label} onChange={e=>(typeof setEditStageForm==='function'?setEditStageForm:function(){})(p=>({...p,label:e.target.value}))} icon="tag" placeholder="Ex: En attente"/>
        <div style={{marginTop:14}}>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text2,marginBottom:8}}>Couleur</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {["#2563EB","#059669","#D97706","#DC2626","#7C3AED","#EC4899","#0EA5E9","#F97316","#22C55E","#64748B","#8B5CF6","#06B6D4"].map(clr=>(
              <div key={clr} onClick={()=>(typeof setEditStageForm==='function'?setEditStageForm:function(){})(p=>({...p,color:clr}))} style={{width:30,height:30,borderRadius:8,background:clr,cursor:"pointer",border:(typeof editStageForm!=='undefined'?editStageForm:{}).color===clr?`3px solid ${T.text}`:"3px solid transparent",transition:"all .15s"}}/>
            ))}
          </div>
        </div>
        <div style={{marginTop:16,padding:12,borderRadius:10,background:(typeof editStageForm!=='undefined'?editStageForm:{}).color+"12",border:`1px solid ${(typeof editStageForm!=='undefined'?editStageForm:{}).color}30`,display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:(typeof editStageForm!=='undefined'?editStageForm:{}).color}}/>
          <span style={{fontSize:14,fontWeight:700,color:(typeof editStageForm!=='undefined'?editStageForm:{}).color}}>{(typeof editStageForm!=='undefined'?editStageForm:{}).label||"Aperçu"}</span>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:18}}>
          <Btn onClick={()=>setEditingStage(null)}>Annuler</Btn>
          <Btn primary disabled={!(typeof editStageForm!=='undefined'?editStageForm:{}).label.trim()} onClick={()=>handleUpdateCustomStage((typeof editingStage!=='undefined'?editingStage:{}).id,{label:(typeof editStageForm!=='undefined'?editStageForm:{}).label.trim(),color:(typeof editStageForm!=='undefined'?editStageForm:{}).color})}><I n="check" s={14}/> Enregistrer</Btn>
        </div>
      </div>
    </div>
  );
};

export default EditStageModal;
