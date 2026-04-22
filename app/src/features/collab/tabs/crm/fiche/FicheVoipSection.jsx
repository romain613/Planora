// FicheVoipSection — extraction S1.4b (10/11) depuis FicheContactModal.jsx L358-445
// Responsabilité : onglet Appels — liste des voipCallLogs filtrés par contactId
// (fallback numéro), REC audio, transcriptions Live+Audio avec download.txt.
// Affiché quand collabFicheTab==="appels". Aucun changement métier.

import React from "react";
import { T } from "../../../../../theme";
import { I, Btn } from "../../../../../shared/ui";
import { api, recUrl } from "../../../../../shared/services/api";
import { _T } from "../../../../../shared/state/tabState";
import { useCollabContext } from "../../../context/CollabContext";

const FicheVoipSection = ({ ct }) => {
  const {
    collabFicheTab,
    voipCallLogs,
    phoneCallRecordings,
    prefillKeypad,
    fmtDur,
    iaHubCollapse, setIaHubCollapse,
  } = useCollabContext();

  if (collabFicheTab !== "appels") return null;

  return (()=>{
          // Filtrer par contactId d'abord, fallback par numéro
          const myCallsById = (voipCallLogs||[]).filter(cl=>cl.contactId===ct.id);
          const myCallsByPhone = (()=>{
            if(myCallsById.length>0) return myCallsById;
            const ph=(ct.phone||ct.mobile||'').replace(/[^\d]/g,'').slice(-9);
            if(ph.length<9) return [];
            return (voipCallLogs||[]).filter(cl=>{const n=(cl.direction==='outbound'?cl.toNumber:cl.fromNumber||'').replace(/[^\d]/g,'').slice(-9);return n===ph;});
          })().sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
          return (
          <div>
            {ct.phone&&<Btn primary onClick={()=>prefillKeypad(ct.phone)} style={{marginBottom:16,borderRadius:10,width:'100%'}}><I n="phone" s={14}/> Appeler {ct.name}</Btn>}
            <div style={{fontSize:12,color:T.text3,marginBottom:8}}>{myCallsByPhone.length} appel{myCallsByPhone.length>1?'s':''} pour ce contact</div>
            {myCallsByPhone.length===0&&<div style={{textAlign:'center',padding:32,color:T.text3,fontSize:13}}>Aucun appel enregistré pour ce contact</div>}
            {myCallsByPhone.map(cl=>{
              const isExp = (iaHubCollapse||{})['ficheCall_'+cl.id];
              const hasRec = (phoneCallRecordings||{})[cl.id] || cl.recordingUrl;
              return (
              <div key={cl.id} style={{borderBottom:`1px solid ${T.border}`}}>
                <div onClick={()=>setIaHubCollapse(p=>({...p,['ficheCall_'+cl.id]:!p['ficheCall_'+cl.id]}))} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 4px',cursor:'pointer',background:isExp?T.bg:'transparent',borderLeft:isExp?'3px solid '+T.accent:'3px solid transparent',transition:'background .15s'}} onMouseEnter={e=>{if(!isExp)e.currentTarget.style.background=T.bg;}} onMouseLeave={e=>{if(!isExp)e.currentTarget.style.background='transparent';}}>
                  <div style={{width:32,height:32,borderRadius:8,background:cl.direction==='outbound'?'#2563EB12':'#22C55E12',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <I n={cl.direction==='outbound'?'phone-outgoing':'phone-incoming'} s={14} style={{color:cl.direction==='outbound'?'#2563EB':'#22C55E'}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.text}}>{cl.direction==='outbound'?'Appel sortant':'Appel entrant'}{cl.status==='missed'||cl.status==='no-answer'?' — Manqué':''}</div>
                    <div style={{fontSize:11,color:T.text3}}>{cl.createdAt?new Date(cl.createdAt).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''} · {cl.duration?fmtDur(cl.duration):'0s'}</div>
                  </div>
                  {hasRec && <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'#EF444412',color:'#EF4444',fontWeight:600}}>REC</span>}
                  <I n={isExp?'chevron-up':'chevron-down'} s={14} style={{color:T.text2}}/>
                </div>
                {isExp && (
                  <div style={{padding:'8px 12px 12px',display:'flex',flexDirection:'column',gap:6,background:T.bg+'80'}}>
                    {hasRec && <audio controls src={recUrl(cl.id)} style={{width:'100%',height:32,borderRadius:6}} preload="none"/>}
                    {cl.notes&&<div style={{fontSize:12,color:T.text2,fontStyle:'italic',padding:'4px 0'}}>{cl.notes}</div>}
                    {/* Transcription on demand — loads both live + audio */}
                    <div onClick={(e)=>{
                      e.stopPropagation();
                      if(_T.iaCallTranscripts?.[cl.id]){setIaHubCollapse(p=>({...p,['ficheTr_'+cl.id]:!p['ficheTr_'+cl.id]}));return;}
                      api('/api/voip/transcript/'+cl.id).then(d=>{
                        if(!_T.iaCallTranscripts)_T.iaCallTranscripts={};
                        _T.iaCallTranscripts[cl.id]=d||(hasRec?{_empty:true}:{_noRec:true});
                        setIaHubCollapse(p=>({...p,['ficheTr_'+cl.id]:true}));
                      }).catch(()=>{
                        if(!_T.iaCallTranscripts)_T.iaCallTranscripts={};
                        _T.iaCallTranscripts[cl.id]=hasRec?{_empty:true}:{_noRec:true};
                        setIaHubCollapse(p=>({...p,['ficheTr_'+cl.id]:true}));
                      });
                    }} style={{fontSize:12,color:'#3B82F6',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                      <I n="file-text" s={12}/> {_T.iaCallTranscripts?.[cl.id]?'Masquer transcriptions':'📝 Voir les transcriptions'}
                    </div>
                    {(iaHubCollapse||{})['ficheTr_'+cl.id] && _T.iaCallTranscripts?.[cl.id] && (()=>{
                      const tr=_T.iaCallTranscripts[cl.id];
                      if(tr._noRec && !tr._hasLive && !tr.live) return <div style={{padding:'10px 12px',borderRadius:8,background:'#F59E0B08',border:'1px solid #F59E0B20',fontSize:12,color:'#F59E0B',lineHeight:1.5}}>Aucune transcription disponible pour cet appel.<br/><span style={{fontSize:11,color:'#92400E'}}>Activez REC avant d'appeler pour l'enregistrement audio.</span></div>;
                      if(tr._empty && !tr.live) return <div style={{padding:'10px 12px',borderRadius:8,background:T.bg,border:'1px solid '+T.border,fontSize:12,color:T.text3,textAlign:'center'}}>Aucune transcription trouvée</div>;
                      const renderTr=(label,icon,color,data)=>{
                        if(!data) return null;
                        const segs=data.segments||(data.segments_json?(()=>{try{return JSON.parse(data.segments_json);}catch{return[];}})():[]);
                        const text=segs.length>0?segs.map(s=>`[${s.speaker||'?'}] ${s.text}`).join('\n'):(data.fullText||'');
                        if(!text) return null;
                        return <div style={{marginBottom:8}}>
                          <div style={{fontSize:11,fontWeight:700,color,marginBottom:4,display:'flex',alignItems:'center',gap:4}}><I n={icon} s={12}/> {label}</div>
                          <div style={{maxHeight:180,overflowY:'auto',display:'flex',flexDirection:'column',gap:2}}>
                            {segs.length>0?segs.map((seg,si)=>(
                              <div key={si} style={{display:'flex',flexDirection:'column',alignItems:(seg.speaker==='agent'||seg.speaker==='collab')?'flex-end':'flex-start'}}>
                                <div style={{maxWidth:'85%',padding:'4px 8px',borderRadius:8,background:(seg.speaker==='agent'||seg.speaker==='collab')?color+'12':T.bg,border:'1px solid '+T.border+'50',fontSize:12,color:T.text,lineHeight:1.4}}>{seg.text}</div>
                              </div>
                            )):<div style={{fontSize:12,color:T.text,lineHeight:1.5,padding:'4px 8px',background:T.card,borderRadius:8,border:'1px solid '+T.border}}>{data.fullText}</div>}
                          </div>
                          <div onClick={(e)=>{e.stopPropagation();
                            const header=`${label} — ${cl.direction==='outbound'?'Sortant':'Entrant'} — ${ct.name}\nDate: ${cl.createdAt?new Date(cl.createdAt).toLocaleString('fr-FR'):''}\nDurée: ${cl.duration?fmtDur(cl.duration):'?'}\n${'─'.repeat(40)}\n\n`;
                            const blob=new Blob([header+text],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${label.replace(/\s/g,'_')}-${ct.name.replace(/\s/g,'_')}-${cl.createdAt?.split('T')[0]||'appel'}.txt`;a.click();URL.revokeObjectURL(url);
                          }} style={{fontSize:11,color:'#059669',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:4,padding:'4px 0',marginTop:4}}><I n="download" s={11}/> Télécharger (.txt)</div>
                        </div>;
                      };
                      return <>
                        {renderTr('Transcription Live','zap','#3B82F6',tr.live||null)}
                        {renderTr('Transcription Audio','mic','#7C3AED',(tr.fullText||tr.segments)?tr:null)}
                        {!tr.live && !tr.fullText && !tr.segments && <div style={{fontSize:11,color:T.text3,textAlign:'center',padding:8}}>Aucune transcription</div>}
                      </>;
                    })()}
                    {!hasRec && <div style={{fontSize:11,color:'#F59E0B',padding:'6px 10px',background:'#F59E0B08',borderRadius:6}}>⚠️ Pas d'enregistrement — activez REC avant l'appel</div>}
                  </div>
                )}
              </div>);
            })}
          </div>);
        })();
};

export default FicheVoipSection;
