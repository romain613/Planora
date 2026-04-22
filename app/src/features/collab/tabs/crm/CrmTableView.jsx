// CrmTableView — extraction S1.3 (1/2) depuis CrmTab.jsx L143-291
// Responsabilite : bulk actions bar (Z5, visible si selection > 0) + table view
//                  (Z6, visible si viewMode === 'table') + pagination.
// Les 2 zones restent independamment conditionnelles a leur trigger d'origine
// (selection vs viewMode), preservant le comportement avant extraction.
// Tous les symboles consommes viennent de CollabContext.

import React from "react";
import { T } from "../../../../theme";
import { I, Btn, Card, Avatar } from "../../../../shared/ui";
import { api } from "../../../../shared/services/api";
import { useCollabContext } from "../../context/CollabContext";

const CrmTableView = () => {
  const {
    // Z5 — bulk CRM actions bar
    collabCrmSelectedIds, setCollabCrmSelectedIds,
    filteredCollabCrm,
    collabCrmBulkStage, setCollabCrmBulkStage,
    PIPELINE_STAGES,
    handleCollabUpdateContact, handlePipelineStageChange,
    showNotif,
    collabCrmAdvFilters, setCollabCrmAdvFilters,
    collab, contacts, contactsLocalEditRef, contactsRef, setContacts, company,
    // Z6 — table view
    collabCrmViewMode,
    setShowNewContact,
    crmVisibleCols,
    collabCrmSortKey, setCollabCrmSortKey,
    collabCrmSortDir, setCollabCrmSortDir,
    collabPaginatedContacts,
    setSelectedCrmContact, setCollabFicheTab,
    cScoreColor, cScoreLabel,
    bookings,
    prefillKeypad,
    // Pagination
    collabCrmTotalPages, collabCrmPage, setCollabCrmPage,
  } = useCollabContext();

  return (
    <>
      {/* Z5 — Bulk Actions Bar */}
      {(collabCrmSelectedIds||[]).length > 0 && (
        <Card style={{padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12,background:T.accentBg,border:`1.5px solid ${T.accent}44`,flexWrap:"wrap"}}>
          <span style={{fontSize:14,fontWeight:700,color:T.accent}}>{(collabCrmSelectedIds||[]).length} sélectionné{(collabCrmSelectedIds||[]).length>1?"s":""} sur {filteredCollabCrm.length}</span>
          <select value={collabCrmBulkStage} onChange={e=>(typeof setCollabCrmBulkStage==='function'?setCollabCrmBulkStage:function(){})(e.target.value)} style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:12,fontFamily:"inherit"}}>
            <option value="">Changer étape…</option>
            {PIPELINE_STAGES.map(st=><option key={st.id} value={st.id}>{st.label}</option>)}
          </select>
          {collabCrmBulkStage && <Btn small primary onClick={()=>{
            (collabCrmSelectedIds||[]).forEach(id=>{
              handleCollabUpdateContact(id, { pipeline_stage:collabCrmBulkStage });
            });
            showNotif(`${(collabCrmSelectedIds||[]).length} contacts → ${PIPELINE_STAGES.find(s=>s.id===collabCrmBulkStage)?.label}`);
            setCollabCrmSelectedIds([]);setCollabCrmBulkStage("");setCollabCrmAdvFilters(p=>({...p,_selectAll:false}));
          }}>Appliquer</Btn>}
          <Btn small style={{color:"#EF4444",borderColor:"#EF444430"}} onClick={()=>{
            const reason = prompt('Motif pour classer '+(collabCrmSelectedIds||[]).length+' lead(s) en Perdu :');
            if(!reason||!reason.trim()){showNotif('Motif obligatoire','danger');return;}
            (collabCrmSelectedIds||[]).forEach(id=>handlePipelineStageChange(id,'perdu',reason.trim()));
            showNotif((collabCrmSelectedIds||[]).length+' leads classes en Perdu');
            setCollabCrmSelectedIds([]);setCollabCrmAdvFilters(p=>({...p,_selectAll:false}));
          }}><I n="archive" s={12}/> Classer Perdu</Btn>
          {collab?.can_delete_contacts ? (()=>{
            // V5-Fix: collab non-admin ne peut supprimer que SES contacts
            const isAdm = collab?.role === 'admin' || collab?.role === 'supra';
            const deletableIds = isAdm ? collabCrmSelectedIds : (collabCrmSelectedIds||[]).filter(id => { const ct = (contacts||[]).find(c=>c.id===id); return ct && ct.assignedTo === collab?.id; });
            const skippedCount = (collabCrmSelectedIds||[]).length - deletableIds.length;
            return deletableIds.length>0?<Btn small style={{color:"#EF4444",borderColor:"#EF444430",background:"#EF444410"}} onClick={async()=>{
              if(deletableIds.length === 0) { showNotif('Ces contacts ne vous sont pas assignes — suppression impossible','danger'); return; }
              if(skippedCount > 0) showNotif(skippedCount + ' contact(s) ignore(s) — non assignes a vous','warning');
              if(!confirm('Supprimer définitivement '+deletableIds.length+' contact(s) ?'))return;
              contactsLocalEditRef.current = Date.now();
              const r=await api("/api/data/contacts/bulk-delete",{method:"POST",body:{contactIds:deletableIds,companyId:company.id,origin:'crm'}});
              if(r?.success){
                if(r.deleted === 0 && deletableIds.length > 0) {
                  showNotif('Impossible : ce contact ne vous est pas assigné','danger');
                } else {
                  const deletedSet=new Set(deletableIds);
                  setContacts(p=>p.filter(c=>!deletedSet.has(c.id)));
                  if(contactsRef) contactsRef.current = (contactsRef.current||[]).filter(c=>!deletedSet.has(c.id));
                  showNotif((r.deleted||0)+' supprimé'+(r.deleted>1?'s':'')+(r.archived>0?', '+(r.archived)+' archivé'+(r.archived>1?'s':'')+' (historique conservé)':''));
                  contactsLocalEditRef.current = Date.now();
                  setTimeout(()=>{contactsLocalEditRef.current=0;},60000);
                }
              }else{showNotif('Erreur suppression','danger');}
              setCollabCrmSelectedIds([]);setCollabCrmAdvFilters(p=>({...p,_selectAll:false}));
            }}><I n="trash-2" s={12}/> Supprimer ({deletableIds.length})</Btn>:null;
          })() : null}
          {/* Supprimer tout — admin only bulk delete via API */}
          {collab?.can_delete_contacts && (collabCrmAdvFilters||{})._selectAll && <Btn small style={{color:"#fff",background:"#EF4444",borderColor:"#EF444430"}} onClick={async()=>{
            if(!confirm('ATTENTION : Supprimer TOUS les '+filteredCollabCrm.length+' contacts ? Cette action est irréversible.'))return;
            if(!confirm('Dernière confirmation : supprimer définitivement '+filteredCollabCrm.length+' contacts ?'))return;
            const r=await api("/api/data/contacts/bulk-delete",{method:"POST",body:{contactIds:filteredCollabCrm.map(c=>c.id),companyId:company.id,origin:'crm_bulk_all'}});
            if(r?.success){setContacts(p=>p.filter(c=>!filteredCollabCrm.some(fc=>fc.id===c.id)));showNotif((r.deleted||0)+' supprimés, '+(r.archived||0)+' archivés');setCollabCrmSelectedIds([]);setCollabCrmAdvFilters(p=>({...p,_selectAll:false}));}else{showNotif('Erreur suppression','danger');}
          }}><I n="trash-2" s={12}/> Supprimer tout ({filteredCollabCrm.length})</Btn>}
          <span onClick={()=>{setCollabCrmSelectedIds([]);setCollabCrmAdvFilters(p=>({...p,_selectAll:false}));}} style={{marginLeft:"auto",cursor:"pointer",fontSize:12,color:T.text3,fontWeight:500}}>✕ Désélectionner</span>
        </Card>
      )}

      {/* Z6 — TABLE VIEW (visible uniquement si viewMode='table') */}
      {collabCrmViewMode === "table" && (
        <>
          {filteredCollabCrm.length === 0 ? (
            <Card style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:40,marginBottom:12}}>👤</div>
              <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Aucun contact</div>
              <div style={{fontSize:13,color:T.text3,marginBottom:16}}>Les contacts apparaissent automatiquement quand des visiteurs prennent rendez-vous.</div>
              <Btn primary onClick={()=>setShowNewContact(true)}><I n="plus" s={14}/> Ajouter un contact</Btn>
            </Card>
          ) : (
            <>
              <Card style={{padding:0,overflow:"hidden"}}>
                <div style={{maxHeight:"calc(100vh - 350px)",overflow:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{borderBottom:`1px solid ${T.border}`,background:T.card,position:"sticky",top:0,zIndex:2}}>
                      <th style={{padding:"10px 8px",width:36,background:T.card}}>
                        <input type="checkbox" checked={(collabCrmSelectedIds||[]).length>0&&(collabCrmSelectedIds||[]).length===filteredCollabCrm.length} onChange={e=>{if(e.target.checked){(typeof setCollabCrmSelectedIds==='function'?setCollabCrmSelectedIds:function(){})(filteredCollabCrm.map(c=>c.id));setCollabCrmAdvFilters(p=>({...p,_selectAll:true}));}else{(typeof setCollabCrmSelectedIds==='function'?setCollabCrmSelectedIds:function(){})([]);setCollabCrmAdvFilters(p=>({...p,_selectAll:false}));}}} style={{cursor:"pointer",accentColor:T.accent}} title={(collabCrmSelectedIds||[]).length>0?"Tout désélectionner":"Tout sélectionner ("+filteredCollabCrm.length+" contacts)"}/>
                      </th>
                      {crmVisibleCols.map(col=>(
                        <th key={col.k} onClick={()=>{if(!["actions"].includes(col.k)){(typeof setCollabCrmSortKey==='function'?setCollabCrmSortKey:function(){})(col.k);setCollabCrmSortDir(p=>collabCrmSortKey===col.k?(p==="asc"?"desc":"asc"):"asc");setCollabCrmPage(0);}}} style={{padding:"8px 6px",textAlign:"left",fontWeight:600,fontSize:10,color:T.text3,textTransform:"uppercase",letterSpacing:.3,cursor:col.k!=="actions"?"pointer":"default",userSelect:"none",whiteSpace:"nowrap",background:T.card}}>
                          {col.l} {collabCrmSortKey===col.k&&<span style={{fontSize:8}}>{collabCrmSortDir==="asc"?"▲":"▼"}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {collabPaginatedContacts.map(ct=>(
                      <tr key={ct.id} style={{borderBottom:`1px solid ${T.border}11`,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <td style={{padding:"10px 8px",width:36}}>
                          <input type="checkbox" checked={(collabCrmSelectedIds||[]).includes(ct.id)} onChange={e=>(typeof setCollabCrmSelectedIds==='function'?setCollabCrmSelectedIds:function(){})(p=>e.target.checked?[...p,ct.id]:p.filter(x=>x!==ct.id))} style={{cursor:"pointer",accentColor:T.accent}}/>
                        </td>
                        {crmVisibleCols.map(col=><td key={col.k} style={{padding:"6px 6px"}}>{(()=>{
                          const ACT_MAP={call:{l:'Appeler',i:'phone',c:'#22C55E'},relance:{l:'Relancer',i:'phone-outgoing',c:'#EF4444'},rdv:{l:'RDV',i:'calendar-plus',c:'#8B5CF6'},email:{l:'Email',i:'mail',c:'#6366F1'},document:{l:'Document',i:'file-text',c:'#8B5CF6'},sms:{l:'SMS',i:'message-square',c:'#0EA5E9'},attente:{l:'Attente',i:'clock',c:'#F59E0B'},note:{l:'Note',i:'edit-3',c:'#64748B'}};
                          switch(col.k){
                            case 'name': return <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={()=>{setSelectedCrmContact(ct);setCollabFicheTab("notes");}}><Avatar name={ct.name} color={ct._stage.color} size={28}/><div><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontWeight:600,fontSize:12}}>{ct.civility?ct.civility+' ':''}{ct.firstname||''} {ct.lastname||(!ct.firstname?ct.name:'')}</span>{ct.contact_type==='btb'&&<span style={{fontSize:7,padding:'1px 4px',borderRadius:4,background:'#2563EB10',color:'#2563EB',fontWeight:700}}>PRO</span>}</div>{ct.rating>0&&<span style={{color:"#F59E0B",fontSize:9}}>{"★".repeat(Math.min(ct.rating,5))}</span>}</div></div>;
                            case 'phone': return ct.phone?<span onClick={e=>{e.stopPropagation();if(typeof prefillKeypad==='function')prefillKeypad(ct.phone);}} style={{cursor:'pointer',color:'#22C55E',fontWeight:600,fontSize:11,display:'inline-flex',alignItems:'center',gap:3}}><I n="phone" s={10}/>{ct.phone.replace('+33','0').replace(/(\d{2})(?=\d)/g,'$1 ')}</span>:<span style={{color:T.text3,fontSize:11}}>—</span>;
                            case 'email': return ct.email?<a href={"mailto:"+ct.email} style={{color:T.accent,textDecoration:"none",fontSize:11}} onClick={e=>e.stopPropagation()}>{ct.email.length>22?ct.email.slice(0,20)+'…':ct.email}</a>:<span style={{color:T.text3,fontSize:11}}>—</span>;
                            case 'pipeline_stage': return <span style={{padding:"2px 8px",borderRadius:12,fontSize:10,fontWeight:600,background:ct._stage.color+"18",color:ct._stage.color,whiteSpace:"nowrap"}}>{ct._stage.label}</span>;
                            case 'score': return <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:24,height:24,borderRadius:6,background:cScoreColor(ct._score)+"18",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:10,color:cScoreColor(ct._score)}}>{ct._score}</div><span style={{fontSize:9,fontWeight:600,color:cScoreColor(ct._score)}}>{cScoreLabel(ct._score)}</span></div>;
                            case 'next_action': {
                              const saved=ct.next_action_type&&!ct.next_action_done?ACT_MAP[ct.next_action_type]:null;
                              let auto=null;
                              if(!saved){const dsc=Math.max(0,Math.floor((Date.now()-new Date(ct.lastVisit||ct.createdAt||0).getTime())/86400000));if(ct.pipeline_stage==='nrp'&&ct.nrp_next_relance&&ct.nrp_next_relance<=new Date().toISOString().split('T')[0])auto={l:'Relancer',i:'phone-outgoing',c:'#EF4444',id:'relance'};else if(ct.pipeline_stage==='nouveau')auto={l:'1er contact',i:'phone',c:'#22C55E',id:'call'};else if(dsc>=14)auto={l:'Relancer',i:'alert-triangle',c:'#F59E0B',id:'relance'};else if(ct.pipeline_stage==='qualifie')auto={l:'RDV',i:'calendar-plus',c:'#8B5CF6',id:'rdv'};}
                              const act=saved||auto;
                              if(!act&&!ct.next_action_done)return<span style={{fontSize:11,color:T.text3}}>—</span>;
                              if(ct.next_action_done&&ct.next_action_type){const done=ACT_MAP[ct.next_action_type];return<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'#22C55E18',color:'#22C55E',fontWeight:600,display:'inline-flex',alignItems:'center',gap:3,whiteSpace:'nowrap'}}><I n="check-circle" s={10}/> {done?.l||'Fait'}</span>;}
                              return <div style={{position:'relative',display:'inline-flex'}}><span onClick={e=>{e.stopPropagation();const sel=e.currentTarget.nextSibling;if(sel)sel.style.display=sel.style.display==='block'?'none':'block';}} style={{fontSize:10,padding:'3px 8px',borderRadius:8,background:act.c+'14',color:act.c,fontWeight:700,display:'inline-flex',alignItems:'center',gap:3,cursor:'pointer',border:`1px solid ${act.c}25`,whiteSpace:'nowrap'}}><I n={act.i} s={10}/> {act.l} {!saved&&<span style={{fontSize:8,opacity:0.6}}>●</span>}</span><div style={{display:'none',position:'absolute',top:'100%',left:0,zIndex:99,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.1)',padding:4,minWidth:130,marginTop:2}}>{Object.entries(ACT_MAP).map(([id,a])=><div key={id} onClick={e=>{e.stopPropagation();handleCollabUpdateContact(ct.id,{next_action_type:id,next_action_label:a.l,next_action_done:0,next_action_set_by:collab?.id||'',next_action_set_at:new Date().toISOString()});e.currentTarget.parentElement.style.display='none';showNotif('Action: '+a.l,'success');}} style={{padding:'5px 8px',fontSize:11,fontWeight:600,cursor:'pointer',borderRadius:6,display:'flex',alignItems:'center',gap:6,color:a.c}} onMouseEnter={e=>e.currentTarget.style.background=a.c+'12'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><I n={a.i} s={11}/> {a.l}</div>)}</div></div>;
                            }
                            case 'lastVisit': {const d=Math.max(0,Math.floor((Date.now()-new Date(ct.lastVisit||ct.createdAt||0).getTime())/86400000));return d===0?<span style={{color:'#22C55E',fontWeight:600,fontSize:11}}>Aujourd'hui</span>:d<=3?<span style={{color:'#22C55E',fontSize:11}}>il y a {d}j</span>:d<=7?<span style={{fontSize:11}}>il y a {d}j</span>:d<=14?<span style={{color:'#F59E0B',fontSize:11}}>il y a {d}j</span>:d<=30?<span style={{color:'#EF4444',fontWeight:600,fontSize:11}}>il y a {d}j</span>:<span style={{color:'#EF4444',fontWeight:700,fontSize:11}}>{d}j 🔴</span>;}
                            case 'totalBookings': {const nb=(bookings||[]).filter(b=>b.contactId===ct.id&&b.status!=='cancelled').length||(ct.totalBookings||0);const todayS=new Date().toISOString().split('T')[0];const next=(bookings||[]).filter(b=>b.contactId===ct.id&&b.status==='confirmed'&&b.date>=todayS).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];return<div style={{textAlign:'center'}}><span style={{fontWeight:700,fontSize:12}}>{nb}</span>{next&&<div style={{fontSize:8,color:'#0EA5E9',fontWeight:600}}>{new Date(next.date).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</div>}</div>;}
                            case 'source': return <span style={{fontSize:9,fontWeight:600,color:ct.source==='csv'?'#F97316':ct.source==='lead'?'#8B5CF6':ct.source==='dispatch'?'#0EA5E9':(ct.source==='booking'||ct.source==='agenda')?'#0D9488':'#64748B'}}>{ct.source==='csv'?'CSV':ct.source==='manual'?'Manuel':ct.source==='lead'?'Lead':ct.source==='dispatch'?'Dispatch':(ct.source==='booking'||ct.source==='agenda')?'Booking':ct.source||'—'}</span>;
                            case 'createdAt': return <span style={{fontSize:10,color:T.text3}}>{ct.createdAt?new Date(ct.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'2-digit'}):'—'}</span>;
                            case 'actions': return <div style={{display:"flex",gap:3}}>{ct.phone&&<span onClick={e=>{e.stopPropagation();if(typeof prefillKeypad==='function')prefillKeypad(ct.phone);}} style={{cursor:'pointer',width:24,height:24,borderRadius:6,background:'#22C55E14',display:'flex',alignItems:'center',justifyContent:'center'}} title="Appeler"><I n="phone" s={11} style={{color:'#22C55E'}}/></span>}{ct.email&&<span onClick={e=>{e.stopPropagation();window.open("mailto:"+ct.email);}} style={{cursor:'pointer',width:24,height:24,borderRadius:6,background:T.accentBg,display:'flex',alignItems:'center',justifyContent:'center'}} title="Email"><I n="mail" s={11} style={{color:T.accent}}/></span>}<span onClick={e=>{e.stopPropagation();setSelectedCrmContact(ct);setCollabFicheTab("notes");}} style={{cursor:'pointer',width:24,height:24,borderRadius:6,background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',border:`1px solid ${T.border}`}} title="Voir fiche"><I n="eye" s={11} style={{color:T.text3}}/></span></div>;
                            default: {
                              // Champs personnalisés (cf_*)
                              if(col.k.startsWith('cf_')&&col.fieldKey){
                                const cfVal=(ct._cfMap||[]).find(f=>f.key===col.fieldKey)?.value;
                                if(!cfVal&&cfVal!==0) return <span style={{color:T.text3,fontSize:11}}>—</span>;
                                if(col.fieldType==='number') return <span style={{fontSize:12,fontWeight:600,color:T.text}}>{Number(cfVal).toLocaleString('fr-FR')}</span>;
                                if(col.fieldType==='date') return <span style={{fontSize:11,color:T.text}}>{(()=>{try{return new Date(cfVal).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'2-digit'});}catch{return cfVal;}})()}</span>;
                                if(col.fieldType==='boolean') return <span style={{fontSize:11,fontWeight:600,color:cfVal==='true'||cfVal===true||cfVal==='1'||cfVal==='oui'?'#22C55E':'#EF4444'}}>{cfVal==='true'||cfVal===true||cfVal==='1'||cfVal==='oui'?'Oui':'Non'}</span>;
                                return <span style={{fontSize:11,color:T.text,maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'inline-block'}} title={cfVal}>{cfVal}</span>;
                              }
                              return <span style={{color:T.text3}}>—</span>;
                            }
                          }
                        })()}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Card>
              {/* Pagination */}
              {collabCrmTotalPages > 1 && (
                <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginTop:14}}>
                  <Btn small disabled={collabCrmPage===0} onClick={()=>(typeof setCollabCrmPage==='function'?setCollabCrmPage:function(){})(0)} title="Première page"><I n="chevrons-left" s={14}/></Btn>
                  <Btn small disabled={collabCrmPage===0} onClick={()=>(typeof setCollabCrmPage==='function'?setCollabCrmPage:function(){})(p=>p-1)}><I n="chevron-left" s={14}/></Btn>
                  <span style={{fontSize:13,fontWeight:600,color:T.text2,padding:"0 8px"}}>
                    Page {collabCrmPage+1} / {collabCrmTotalPages} <span style={{fontWeight:400,color:T.text3}}>({filteredCollabCrm.length} contacts)</span>
                  </span>
                  <Btn small disabled={collabCrmPage>=collabCrmTotalPages-1} onClick={()=>(typeof setCollabCrmPage==='function'?setCollabCrmPage:function(){})(p=>p+1)}><I n="chevron-right" s={14}/></Btn>
                  <Btn small disabled={collabCrmPage>=collabCrmTotalPages-1} onClick={()=>(typeof setCollabCrmPage==='function'?setCollabCrmPage:function(){})(collabCrmTotalPages-1)} title="Dernière page"><I n="chevrons-right" s={14}/></Btn>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
};

export default CrmTableView;
