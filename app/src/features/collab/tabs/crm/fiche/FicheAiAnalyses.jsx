// FicheAiAnalyses — extraction S1.4b (8/11) depuis FicheContactModal.jsx L344-372
// Responsabilité : accordéon Résumé IA — chargement depuis phoneCallAnalyses ou
// contactAnalysesHistory, fallback "Charger le résumé IA", extended_json parsing.
// Aucun changement métier.

import React from "react";
import { T } from "../../../../../theme";
import { I } from "../../../../../shared/ui";
import { api } from "../../../../../shared/services/api";
import { useCollabContext } from "../../../context/CollabContext";

const FicheAiAnalyses = ({ ct }) => {
  const {
    phoneCallAnalyses,
    contactAnalysesHistory, setContactAnalysesHistory,
    iaHubCollapse, setIaHubCollapse,
  } = useCollabContext();

  if (!ct.last_ai_analysis_id) return null;

  return (()=>{
                  const _a = Object.values((typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)||{}).find(a=>a.id===ct.last_ai_analysis_id) || ((typeof contactAnalysesHistory!=='undefined'?contactAnalysesHistory:null)[ct.id]||[])[0] || null;
                  if(!_a) return <div onClick={()=>{api('/api/ai-copilot/contact/'+ct.id+'/analyses').then(d=>{if(d?.analyses?.length)setContactAnalysesHistory(p=>({...p,[ct.id]:d.analyses}));}).catch(()=>{});}} style={{marginTop:10,padding:'8px 12px',borderRadius:8,border:'1px dashed #7C3AED30',background:'#7C3AED04',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                    <I n="cpu" s={12} style={{color:'#7C3AED'}}/>
                    <span style={{fontSize:11,fontWeight:600,color:'#7C3AED'}}>Charger le résumé IA</span>
                  </div>;
                  const _ext3 = _a.extended || (()=>{try{return JSON.parse(_a.extended_json||'{}');}catch{return {};}})();
                  return <div style={{marginTop:10,borderRadius:10,border:'1px solid #7C3AED20',overflow:'hidden'}}>
                    <div onClick={()=>setIaHubCollapse(p=>({...p,crmResume:!p.crmResume}))} style={{padding:'10px 12px',background:'#7C3AED06',display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                      <I n="cpu" s={14} style={{color:'#7C3AED'}}/>
                      <span style={{fontSize:12,fontWeight:700,color:'#7C3AED',flex:1}}>Résumé IA</span>
                      <span style={{fontSize:9,color:T.text3}}>{_a.createdAt?new Date(_a.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):''}</span>
                      <span style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:6,background:(_a.sentimentScore||50)>60?'#22C55E15':(_a.sentimentScore||50)>30?'#F59E0B15':'#EF444415',color:(_a.sentimentScore||50)>60?'#22C55E':(_a.sentimentScore||50)>30?'#F59E0B':'#EF4444'}}>{_a.sentiment||'Neutre'}</span>
                      <I n={(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).crmResume?'chevron-down':'chevron-up'} s={12} style={{color:T.text3}}/>
                    </div>
                    {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).crmResume && <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:6}}>
                      <div style={{fontSize:12,color:T.text2,lineHeight:1.5}}>{_a.summary}</div>
                      {_ext3.besoinExprime && <div><span style={{fontSize:10,fontWeight:700,color:'#7C3AED'}}>Besoin :</span> <span style={{fontSize:12,color:T.text}}> {_ext3.besoinExprime}</span></div>}
                      {(_a.actionItems||[]).length>0 && <div><span style={{fontSize:10,fontWeight:700,color:'#7C3AED'}}>Actions :</span> <span style={{fontSize:12,color:T.text}}> {_a.actionItems.join(' · ')}</span></div>}
                      {_a.followupDate && <div><span style={{fontSize:10,fontWeight:700,color:'#F59E0B'}}>Relance :</span> <span style={{fontSize:12,color:T.text}}> {new Date(_a.followupDate+'T12:00').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})}</span></div>}
                      {_ext3.informationsImportantes && <div><span style={{fontSize:10,fontWeight:700,color:'#7C3AED'}}>Infos :</span> <span style={{fontSize:12,color:T.text}}> {_ext3.informationsImportantes}</span></div>}
                      <div style={{display:'flex',gap:6,marginTop:2}}>
                        <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:6,background:'#3B82F615',color:'#3B82F6'}}>Qualité {_a.qualityScore||50}%</span>
                        <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:6,background:'#22C55E15',color:'#22C55E'}}>Conversion {_a.conversionScore||50}%</span>
                      </div>
                    </div>}
                  </div>;
                })();
};

export default FicheAiAnalyses;
