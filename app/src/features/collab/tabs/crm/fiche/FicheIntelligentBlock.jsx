// FicheIntelligentBlock — extraction S1.4b (2/11) depuis FicheContactModal.jsx L164-265
// Responsabilité : bloc intelligent (prochain RDV + action prioritaire + badges source/créé le).
// Affiché uniquement si ct._linked. Aucun changement métier.

import React from "react";
import { T } from "../../../../../theme";
import { I } from "../../../../../shared/ui";
import { useCollabContext } from "../../../context/CollabContext";

const FicheIntelligentBlock = ({ ct }) => {
  const {
    collab, bookings, calendars,
    startVoipCall,
    setCollabFicheTab,
    setPhoneScheduleForm, setPhoneShowScheduleModal,
    handleCollabUpdateContact,
    showNotif,
  } = useCollabContext();

  if (!ct._linked) return null;

  return (()=>{
          const todayS=new Date().toISOString().split('T')[0];
          const nextRdv=(bookings||[]).filter(b=>b.contactId===ct.id&&b.status==='confirmed'&&b.date>=todayS&&(b.collaboratorId===collab.id)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0]||null;
          const _clogs=typeof callLogs!=='undefined'?callLogs:[];const lastCall=(_clogs||[]).filter(cl=>cl.contactId===ct.id).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))[0]||null;
          const _lastActivityDate = ct.updatedAt || ct.lastVisit || ct.createdAt || null;
          const daysSinceContact = _lastActivityDate ? Math.max(0, Math.floor((Date.now() - new Date(_lastActivityDate).getTime()) / 86400000)) : null;
          // Déterminer l'action prioritaire selon le contexte
          let priorityAction=null;
          if(ct.pipeline_stage==='nrp'&&ct.nrp_next_relance&&ct.nrp_next_relance<=todayS) priorityAction={label:'Relancer maintenant',icon:'phone-outgoing',color:'#EF4444',action:()=>{if(ct.phone&&typeof startVoipCall==='function')startVoipCall(ct.phone,ct);else if(ct.phone)window.open('tel:'+ct.phone);}};
          else if(ct.pipeline_stage==='rdv_programme'&&nextRdv){const diff=Math.round((new Date(nextRdv.date+'T'+(nextRdv.time||'00:00')).getTime()-Date.now())/60000);if(diff>=0&&diff<=120)priorityAction={label:'RDV dans '+Math.floor(diff/60)+'h'+String(diff%60).padStart(2,'0'),icon:'calendar-check',color:'#0EA5E9',action:()=>setCollabFicheTab('history')};}
          else if(daysSinceContact&&daysSinceContact>=14) priorityAction={label:'Relancer ('+daysSinceContact+'j sans contact)',icon:'alert-triangle',color:'#F59E0B',action:()=>{if(ct.phone&&typeof startVoipCall==='function')startVoipCall(ct.phone,ct);else if(ct.phone)window.open('tel:'+ct.phone);}};
          else if(ct.pipeline_stage==='nouveau') priorityAction={label:'Premier contact',icon:'phone',color:'#22C55E',action:()=>{if(ct.phone&&typeof startVoipCall==='function')startVoipCall(ct.phone,ct);else if(ct.phone)window.open('tel:'+ct.phone);}};
          else if(ct.pipeline_stage==='qualifie'&&!nextRdv) priorityAction={label:'Programmer un RDV',icon:'calendar-plus',color:'#8B5CF6',action:()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}};
          return (
            <div style={{marginBottom:12,display:'flex',flexDirection:'column',gap:6}}>
              {/* Badges Source + Créé le */}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                {ct.source&&<span style={{padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:600,background:(ct.source==='booking'||ct.source==='agenda')?'#0D948818':'#6366F118',color:(ct.source==='booking'||ct.source==='agenda')?'#0D9488':'#6366F1',display:'inline-flex',alignItems:'center',gap:3}}><I n={(ct.source==='booking'||ct.source==='agenda')?'calendar':'log-in'} s={9}/> {ct.source==='manual'?'Ajout manuel':ct.source==='import'?'Import CSV':ct.source==='lead'?'Lead':ct.source==='dispatch'?'Dispatch':(ct.source==='booking'||ct.source==='agenda')?'Booking':ct.source}</span>}
                {ct.createdAt&&<span style={{padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:600,background:T.bg,color:T.text3,border:`1px solid ${T.border}`}}>Créé le {new Date(ct.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}</span>}
                {daysSinceContact!=null&&<span style={{padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:600,background:daysSinceContact>=30?'#EF444418':daysSinceContact>=14?'#F59E0B18':'#22C55E18',color:daysSinceContact>=30?'#EF4444':daysSinceContact>=14?'#F59E0B':'#22C55E'}}>{daysSinceContact===0?'Contacté aujourd\'hui':'Dernier contact il y a '+daysSinceContact+'j'}</span>}
              </div>
              {/* Prochain RDV */}
              {nextRdv?(
                <div style={{padding:'8px 12px',borderRadius:10,background:'linear-gradient(135deg,#0EA5E908,#0EA5E904)',border:'1px solid #0EA5E925',display:'flex',alignItems:'center',gap:8}}>
                  <I n="calendar" s={14} style={{color:'#0EA5E9',flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:'#0EA5E9'}}>Prochain RDV</div>
                    <div style={{fontSize:13,fontWeight:600,color:T.text}}>{new Date(nextRdv.date).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})} à {nextRdv.time} · {nextRdv.duration}min</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,color:'#0EA5E9',padding:'2px 8px',borderRadius:8,background:'#0EA5E918'}}>{(()=>{const d=Math.round((new Date(nextRdv.date+'T'+(nextRdv.time||'00:00')).getTime()-Date.now())/60000);return d<0?'Passé':d<60?'Dans '+d+'min':d<1440?'Dans '+Math.floor(d/60)+'h':'Dans '+Math.floor(d/1440)+'j';})()}</span>
                </div>
              ):(
                <div onClick={()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{padding:'8px 12px',borderRadius:10,background:'#8B5CF608',border:'1.5px dashed #8B5CF640',display:'flex',alignItems:'center',gap:8,cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.borderColor='#8B5CF6'} onMouseLeave={e=>e.currentTarget.style.borderColor='#8B5CF640'}>
                  <div style={{width:28,height:28,borderRadius:8,background:'#8B5CF618',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="calendar-plus" s={14} style={{color:'#8B5CF6'}}/></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:'#8B5CF6'}}>Aucun RDV programmé</div>
                    <div style={{fontSize:11,color:T.text3}}>Cliquez pour programmer un rendez-vous</div>
                  </div>
                  <I n="plus" s={14} style={{color:'#8B5CF6'}}/>
                </div>
              )}
              {/* ── Action prioritaire contextuelle + persistée + modifiable ── */}
              {(()=>{
                const ACTION_TYPES=[
                  {id:'call',label:'Appeler',icon:'phone',color:'#22C55E',exec:()=>{if(ct.phone&&typeof startVoipCall==='function')startVoipCall(ct.phone,ct);else if(ct.phone)window.open('tel:'+ct.phone);}},
                  {id:'relance',label:'Relancer',icon:'phone-outgoing',color:'#EF4444',exec:()=>{if(ct.phone&&typeof startVoipCall==='function')startVoipCall(ct.phone,ct);else if(ct.phone)window.open('tel:'+ct.phone);}},
                  {id:'rdv',label:'Programmer RDV',icon:'calendar-plus',color:'#8B5CF6',exec:()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}},
                  {id:'email',label:'Envoyer email',icon:'mail',color:'#6366F1',exec:()=>{window.open('mailto:'+(ct.email||''));}},
                  {id:'document',label:'Envoyer document',icon:'file-text',color:'#8B5CF6',exec:()=>{window.open('mailto:'+(ct.email||'')+'?subject=Documents');}},
                  {id:'sms',label:'Envoyer SMS',icon:'message-square',color:'#0EA5E9',exec:()=>{setCollabFicheTab('sms');}},
                  {id:'attente',label:'En attente client',icon:'clock',color:'#F59E0B',exec:()=>{}},
                  {id:'note',label:'Ajouter note',icon:'edit-3',color:'#64748B',exec:()=>{setCollabFicheTab('notes');}}
                ];
                // Prochaine action persistée OU calculée
                const savedAction=ct.next_action_type&&!ct.next_action_done?ACTION_TYPES.find(a=>a.id===ct.next_action_type):null;
                const displayAction=savedAction||priorityAction;
                const activeType=savedAction?savedAction:priorityAction?ACTION_TYPES.find(a=>(priorityAction.label.includes('Relancer')?a.id==='relance':priorityAction.label.includes('Premier')?a.id==='call':priorityAction.label.includes('RDV')?a.id==='rdv':false)):null;
                const activeColor=displayAction?.color||savedAction?.color||'#64748B';
                const activeIcon=displayAction?.icon||savedAction?.icon||'zap';
                const activeLabel=savedAction?(ct.next_action_label||savedAction.label):priorityAction?.label||'Aucune action';
                const handleSetAction=(typeId)=>{
                  const at=ACTION_TYPES.find(a=>a.id===typeId);
                  if(!at)return;
                  const updates={next_action_type:typeId,next_action_label:at.label,next_action_done:0,next_action_set_by:collab?.id||'',next_action_set_at:new Date().toISOString()};
                  handleCollabUpdateContact(ct.id,updates);
                  showNotif('Action définie : '+at.label,'success');
                };
                const handleDoneAction=()=>{
                  handleCollabUpdateContact(ct.id,{next_action_done:1,lastVisit:new Date().toISOString()});
                  showNotif('✅ Action terminée','success');
                };
                return displayAction||ct.next_action_type?(
                  <div style={{borderRadius:10,background:`linear-gradient(135deg,${activeColor}08,${activeColor}03)`,border:`1.5px solid ${activeColor}30`,overflow:'hidden'}}>
                    {/* Barre principale cliquable */}
                    <div style={{padding:'8px 12px',display:'flex',alignItems:'center',gap:8}}>
                      <div onClick={()=>{const at=savedAction||ACTION_TYPES.find(a=>a.id===activeType?.id);if(at?.exec)at.exec();else if(displayAction?.action)displayAction.action();}} style={{width:28,height:28,borderRadius:8,background:activeColor+'18',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,cursor:'pointer'}}><I n={activeIcon} s={14} style={{color:activeColor}}/></div>
                      <div style={{flex:1,cursor:'pointer'}} onClick={()=>{const at=savedAction||ACTION_TYPES.find(a=>a.id===activeType?.id);if(at?.exec)at.exec();else if(displayAction?.action)displayAction.action();}}>
                        <div style={{fontSize:10,fontWeight:700,color:activeColor,display:'flex',alignItems:'center',gap:4}}>⚡ {savedAction?'Prochaine action':'Action recommandée'}{ct.next_action_date&&!ct.next_action_done?' · '+new Date(ct.next_action_date).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):''}</div>
                        <div style={{fontSize:13,fontWeight:600,color:T.text}}>{activeLabel}</div>
                      </div>
                      {/* Bouton terminé */}
                      {savedAction&&<div onClick={e=>{e.stopPropagation();handleDoneAction();}} style={{padding:'4px 10px',borderRadius:8,background:'#22C55E18',color:'#22C55E',fontSize:10,fontWeight:700,cursor:'pointer',border:'1px solid #22C55E30',display:'flex',alignItems:'center',gap:3}} title="Marquer comme fait"><I n="check" s={12}/> Fait</div>}
                      {/* Dropdown changer action */}
                      <select value={activeType?.id||''} onChange={e=>{if(e.target.value)handleSetAction(e.target.value);}} onClick={e=>e.stopPropagation()} style={{fontSize:10,border:'none',background:'transparent',color:T.text3,cursor:'pointer',outline:'none',padding:'2px 4px'}}>
                        <option value="">Changer...</option>
                        {ACTION_TYPES.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                    </div>
                    {/* Feedback action terminée */}
                    {ct.next_action_done===1&&ct.next_action_type&&(
                      <div style={{padding:'4px 12px 6px',borderTop:`1px solid ${T.border}`,background:'#22C55E08',display:'flex',alignItems:'center',gap:6}}>
                        <I n="check-circle" s={12} style={{color:'#22C55E'}}/>
                        <span style={{fontSize:10,color:'#22C55E',fontWeight:600}}>Dernière action effectuée : {ACTION_TYPES.find(a=>a.id===ct.next_action_type)?.label||ct.next_action_type}</span>
                      </div>
                    )}
                  </div>
                ):null;
              })()}
            </div>
          );
        })();
};

export default FicheIntelligentBlock;
