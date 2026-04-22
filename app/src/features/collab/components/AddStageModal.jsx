// AddStageModal — extraction S1.1 (1/4) depuis CrmTab.jsx L859-898
// Responsabilité : création d'un nouveau stage custom (nom + couleur + preview)
//                  et listing + suppression des stages existants.
// Tous les symboles consommés viennent de CollabContext (useCollabContext).

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Modal, Input } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const AddStageModal = () => {
  const {
    showAddStage, setShowAddStage,
    newStageName, setNewStageName,
    newStageColor, setNewStageColor,
    pipelineStages,
    handleAddCustomStage, handleDeleteCustomStage,
  } = useCollabContext();

  return (
    <Modal open={showAddStage} onClose={()=>(typeof setShowAddStage==='function'?setShowAddStage:function(){})(false)} title="Nouveau statut" width={400}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <Input label="Nom du statut" placeholder="Ex: Rappeler, En attente, Signé..." value={newStageName} onChange={e=>(typeof setNewStageName==='function'?setNewStageName:function(){})(e.target.value)} icon="tag"/>
        <div>
          <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:8}}>Couleur</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {['#2563EB','#22C55E','#EF4444','#F59E0B','#7C3AED','#0EA5E9','#EC4899','#64748B','#14B8A6','#F97316'].map(c=>(
              <div key={c} onClick={()=>(typeof setNewStageColor==='function'?setNewStageColor:function(){})(c)} style={{width:32,height:32,borderRadius:8,background:c,cursor:'pointer',border:newStageColor===c?'3px solid '+T.text:'3px solid transparent',transition:'all .15s',display:'flex',alignItems:'center',justifyContent:'center'}}>
                {newStageColor===c && <I n="check" s={14} style={{color:'#fff'}}/>}
              </div>
            ))}
          </div>
        </div>
        {/* Preview */}
        {(typeof newStageName!=='undefined'?newStageName:null) && <div style={{padding:'8px 14px',borderRadius:10,background:(typeof newStageColor!=='undefined'?newStageColor:null)+'12',border:`1px solid ${newStageColor}30`,display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:(typeof newStageColor!=='undefined'?newStageColor:null)}}/>
          <span style={{fontSize:13,fontWeight:700,color:(typeof newStageColor!=='undefined'?newStageColor:null)}}>{newStageName}</span>
        </div>}
        {/* Existing custom stages */}
        {((typeof pipelineStages!=='undefined'?pipelineStages:null)||[]).length > 0 && (
          <div>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:6}}>Vos statuts personnalisés</label>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {((typeof pipelineStages!=='undefined'?pipelineStages:null)||[]).map(s=>(
                <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:8,background:T.bg,border:`1px solid ${T.border}`}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:s.color}}/>
                  <span style={{flex:1,fontSize:13,fontWeight:600}}>{s.label}</span>
                  <span onClick={()=>handleDeleteCustomStage(s.id)} style={{cursor:'pointer',color:T.danger,fontSize:12,fontWeight:600,padding:'2px 6px',borderRadius:4}}><I n="trash-2" s={12}/></span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <Btn onClick={()=>setShowAddStage(false)} style={{flex:1}}>Fermer</Btn>
          <Btn primary onClick={handleAddCustomStage} style={{flex:1}} disabled={!(typeof newStageName!=='undefined'?newStageName:{}).trim()}><I n="plus" s={14}/> Ajouter</Btn>
        </div>
      </div>
    </Modal>
  );
};

export default AddStageModal;
