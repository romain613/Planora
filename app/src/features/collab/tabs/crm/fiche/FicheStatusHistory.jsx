// FicheStatusHistory — cleanup post-S1 (ex-bloc inline "V4: Debug mode — Historique des statuts")
// Responsabilité : accordéon historique des changements de statut (lazy load via api).
// Extraction motivée par l'import manquant de `useState` dans FicheContactModal (dette S1.4a).
// Aucun changement métier.

import React, { useState } from "react";
import { T } from "../../../../../theme";
import { I } from "../../../../../shared/ui";
import { api } from "../../../../../shared/services/api";

const FicheStatusHistory = ({ ct }) => {
  const [histOpen, setHistOpen] = useState(false);
  const [statusHist, setStatusHist] = useState(null);
  const loadHist = () => { if(statusHist) { setHistOpen(!histOpen); return; } api(`/api/data/contacts/${ct.id}/status-history`).then(d=>{ if(Array.isArray(d)) setStatusHist(d); setHistOpen(true); }).catch(()=>setStatusHist([])); };
  const sourceLabels = { manual:'Manuel', call:'Appel', booking:'RDV', automation:'Auto', import:'Import', ai:'IA', system:'Systeme' };
  const sourceColors = { manual:'#2563EB', call:'#059669', booking:'#7C3AED', automation:'#D97706', import:'#0D9488', ai:'#EC4899', system:'#6B7280' };
  return (
    <div style={{marginTop:10,borderRadius:10,border:`1px solid ${T.border}`,overflow:'hidden'}}>
      <div onClick={loadHist} style={{padding:'10px 12px',background:T.bg,display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
        <I n="git-commit" s={14} style={{color:T.text2}}/>
        <span style={{fontSize:12,fontWeight:700,color:T.text,flex:1}}>Historique statuts</span>
        <span style={{fontSize:9,color:T.text3}}>{ct.pipeline_stage||'nouveau'}</span>
        <I n={histOpen?'chevron-up':'chevron-down'} s={12} style={{color:T.text3}}/>
      </div>
      {histOpen && <div style={{padding:'8px 12px',background:T.surface,maxHeight:200,overflowY:'auto'}}>
        {!statusHist && <div style={{fontSize:11,color:T.text3}}>Chargement...</div>}
        {statusHist?.length===0 && <div style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>Aucun changement enregistre</div>}
        {statusHist?.map((h,i)=><div key={h.id||i} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 0',borderBottom:i<statusHist.length-1?`1px solid ${T.border}22`:'none'}}>
          <div style={{width:6,height:6,borderRadius:'50%',background:sourceColors[h.source]||'#6B7280',flexShrink:0}}/>
          <span style={{fontSize:10,color:T.text3,minWidth:50}}>{h.createdAt?new Date(h.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):''}</span>
          <span style={{fontSize:10,fontWeight:600,color:'#EF4444'}}>{h.fromStatus}</span>
          <I n="arrow-right" s={9} style={{color:T.text3}}/>
          <span style={{fontSize:10,fontWeight:600,color:'#22C55E'}}>{h.toStatus}</span>
          <span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:(sourceColors[h.source]||'#6B7280')+'15',color:sourceColors[h.source]||'#6B7280',fontWeight:600}}>{sourceLabels[h.source]||h.source}</span>
          {h.collaboratorName && <span style={{fontSize:9,color:T.text3}}>{h.collaboratorName}</span>}
          {h.reason && <span style={{fontSize:9,color:T.text3,fontStyle:'italic'}} title={h.reason}>({h.reason.slice(0,20)})</span>}
        </div>)}
      </div>}
    </div>
  );
};

export default FicheStatusHistory;
