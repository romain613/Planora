// Phase 14a — extracted CRM tab from CollabPortal.jsx (was lines 3689-5328).
// Contient 3 sections logiques :
//   1. CRM List/Pipeline view (anciennement `{portalTab === "crm" && (...)}`)
//   2. NewContact modal (anciennement entre les 2 blocs, contrôlé par showNewContact)
//   3. Contact sheet modal (anciennement `{selectedCrmContact && portalTab === "crm" && (...)}`)
//
// TODO Phase future : sub-découper en crm/CrmList.jsx + crm/NewContactModal.jsx + crm/CrmContactSheet.jsx

import React, { useState, useMemo, useEffect, Fragment } from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Avatar, Badge, Modal, Input, ValidatedInput, Stars, Spinner, EmptyState, HelpTip, HookIsolator } from "../../../shared/ui";
import { displayPhone, formatPhoneFR } from "../../../shared/utils/phone";
import { isValidEmail, isValidPhone } from "../../../shared/utils/validators";
import { fmtDate, DAYS_FR, MONTHS_FR } from "../../../shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES } from "../../../shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../../shared/utils/notifications";
import { api } from "../../../shared/services/api";
import { _T } from "../../../shared/state/tabState";
import { useCollabContext } from "../context/CollabContext";
import { FicheClientMsgScreen, FicheSuiviScreen, FicheDocsLinkedScreen } from "../screens";
import AddStageModal from "../components/AddStageModal";
import EditStageModal from "../components/EditStageModal";
import DeleteStageConfirmModal from "../components/DeleteStageConfirmModal";
import BulkSmsModal from "../components/BulkSmsModal";
import CrmHeader from "./crm/CrmHeader";
import CrmDashboardView from "./crm/CrmDashboardView";
import CrmFiltersBar from "./crm/CrmFiltersBar";
import CrmTableView from "./crm/CrmTableView";
import CrmKanbanView from "./crm/CrmKanbanView";

const CrmTab = () => {
  const ctx = useCollabContext();
  // Destructure ALL refs CRM tab needs (~80 refs from context)
  const {
    collab, company, contacts, bookings, collabs, showNotif,
    fmtDur,
    cScoreColor, cScoreLabel,
    handleCollabUpdateContact,
    crmSearch, setCrmSearch,
    collabCrmViewMode, setCollabCrmViewMode,
    collabCrmSortKey, setCollabCrmSortKey,
    collabCrmSortDir, setCollabCrmSortDir,
    collabCrmFilterTags, setCollabCrmFilterTags,
    collabCrmFilterStage, setCollabCrmFilterStage,
    collabCrmFilterFollowup, setCollabCrmFilterFollowup,
    collabCrmSelectedIds, setCollabCrmSelectedIds,
    collabCrmBulkStage, setCollabCrmBulkStage,
    collabCrmPage, setCollabCrmPage,
    collabCrmAdvOpen, setCollabCrmAdvOpen,
    collabCrmAdvFilters, setCollabCrmAdvFilters,
    crmColConfig, setCrmColConfig, saveCrmColConfig,
    crmEffectiveOrder, crmEffectiveHidden, crmVisibleCols,
    crmColPanelOpen, setCrmColPanelOpen,
    crmDragCol, setCrmDragCol,
    crmExportModal, setCrmExportModal,
    filteredCollabCrm, collabCrmTotalPages,
    showNewContact, setShowNewContact,
    newContactForm, setNewContactForm,
    scanImageModal, setScanImageModal,
    csvImportModal, setCsvImportModal,
    showAddStage, setShowAddStage,
    newStageName, setNewStageName,
    newStageColor, setNewStageColor,
    editingStage, setEditingStage,
    editStageForm, setEditStageForm,
    confirmDeleteStage, setConfirmDeleteStage,
    editingContact, setEditingContact,
    contractModal, setContractModal,
    contractForm, setContractForm,
    contactAnalysesHistory, setContactAnalysesHistory,
    contactAnalysesHistoryModal, setContactAnalysesHistoryModal,
    dragContact, setDragContact,
    dragOverStage, setDragOverStage,
    dragColumnId, setDragColumnId,
    pipelineStages, setPipelineStages,
    contactFieldDefs, setContactFieldDefs,
    pipelinePopupContact, setPipelinePopupContact,
    pipelinePopupHistory, setPipelinePopupHistory,
    pipelineNrpExpanded, setPipelineNrpExpanded,
    pipelineRightContact, setPipelineRightContact,
    pipelineRightTab, setPipelineRightTab,
    pipelineRdvModal, setPipelineRdvModal,
    pipelineRdvForm, setPipelineRdvForm,
    pipeBulkStage, setPipeBulkStage,
    pipeBulkModal, setPipeBulkModal,
    pipeBulkSmsText, setPipeBulkSmsText,
    pipeSelectedIds, setPipeSelectedIds,
    iaHubCollapse, setIaHubCollapse,
    notifList, setNotifList,
    notifUnread, setNotifUnread,
    setBookings, setContacts, setCollabAlertCount,
    orderedStages, PIPELINE_STAGES, CRM_ALL_COLS, DEFAULT_STAGES,
    selectedCrmContact, setSelectedCrmContact,
    collabFicheTab, setCollabFicheTab,
    setRdvPasseModal,
    setPhoneShowScheduleModal, setPhoneScheduleForm,
    portalTab, setPortalTab, setPortalTabKey,
    // ═══ REWIRE 2026-04-20 — destructure complémentaire (35 symboles) ═══
    CRM_STD_COLS,
    appMyPhoneNumbers,
    calendars,
    collabContactTags,
    collabNotesTimerRef,
    collabPaginatedContacts,
    collabPipelineAnalytics,
    contactsLocalEditRef,
    contactsRef,
    getCollabLeadScore,
    handleAddCustomStage,
    handleCollabCreateContact,
    handleCollabDeleteContact,
    handleColumnDragEnd,
    handleColumnDragStart,
    handleColumnDrop,
    handleDeleteCustomStage,
    handleDragEnd,
    handleDragLeave,
    handleDragOver,
    handleDragStart,
    handleDrop,
    handlePipelineStageChange,
    handleUpdateCustomStage,
    // Phase 4 Templates — verrou runtime pipeline
    pipelineReadOnly, pipelineTemplateMeta,
    linkVisitorToContacts,
    myCrmContacts,
    phoneCallAnalyses,
    phoneCallRecordings,
    prefillKeypad,
    setV7TransferModal,
    setV7TransferTarget,
    startVoipCall,
    today,
    v7FollowersMap,
    voipCallLogs,
  } = ctx;

  return (
    <>
<div>
  <CrmHeader />

  <CrmFiltersBar />

  <CrmTableView />

  {/* ═══ KANBAN OR DASHBOARD VIEWS ═══ */}
  {collabCrmViewMode === "table" ? null : (typeof collabCrmViewMode!=='undefined'?collabCrmViewMode:null) === "pipeline" ? (
    <CrmKanbanView />
  ) : (
    <CrmDashboardView />
  )}

  <EditStageModal />

  <DeleteStageConfirmModal />
</div>

<AddStageModal />

{/* ── FICHE CLIENT MODAL ── */}
{selectedCrmContact && (
<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>{setSelectedCrmContact(null);setCollabFicheTab("notes");}}>
  <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:700,maxHeight:"90vh",overflow:"auto",padding:28,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
    {(()=>{
      const ct = (typeof selectedCrmContact!=='undefined'?selectedCrmContact:null);
      const stg = PIPELINE_STAGES.find(s=>s.id===(ct.pipeline_stage||"nouveau")) || PIPELINE_STAGES[0];
      const sc = getCollabLeadScore(ct);
      const contactBookings = (bookings||[]).filter(b=>b.contactId===ct.id && b.collaboratorId===collab.id).sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.time||'').localeCompare(a.time||''));
      const contactCalls = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(cl=>cl.contactId===ct.id);
      return (<>
        {!ct._linked && (
          <div style={{padding:"10px 16px",borderRadius:10,background:T.accent+"10",border:`1px solid ${T.accent}33`,marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:12,color:T.accent,fontWeight:600}}>Ce contact n'est pas encore dans le CRM</span>
            <Btn small primary onClick={()=>{
              const nc = linkVisitorToContacts(ct);
              // Rafraichir la fiche avec le contact linke (ne pas fermer)
              const linked = { ...ct, ...(nc||{}), _linked: true, assignedTo: collab.id };
              setSelectedCrmContact(linked);
              showNotif('Contact ajoute au CRM !', 'success');
            }}><I n="plus" s={12}/> Ajouter</Btn>
          </div>
        )}
        {/* Header with Score + Stage badges */}
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

        {/* ── BLOC INTELLIGENT: Prochain RDV + Prochaine Action + Action prioritaire ── */}
        {ct._linked && (()=>{
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
        })()}

        {/* Espace client → déplacé en bas de la fiche */}

        {/* Pipeline stage selector + Quick actions */}
        {ct._linked && (
          <div style={{display:"flex",gap:8,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${T.border}`,flexWrap:"wrap",alignItems:"center"}}>
            <select value={ct.pipeline_stage||"nouveau"} onChange={e=>{
              const ns=e.target.value;
              handlePipelineStageChange(ct.id,ns);
            }} style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${stg.color}`,background:stg.color+"12",color:T.text,fontSize:12,fontWeight:600,fontFamily:"inherit",cursor:"pointer"}}>
              {PIPELINE_STAGES.map(st=><option key={st.id} value={st.id}>{st.label}</option>)}
            </select>
            {ct.email&&<Btn small onClick={()=>window.open("mailto:"+ct.email)}><I n="mail" s={13}/> Email</Btn>}
            {ct.phone&&<Btn small onClick={()=>prefillKeypad(ct.phone)}><I n="phone" s={13}/> Appeler</Btn>}
            {ct.phone&&<Btn small onClick={()=>setCollabFicheTab('sms')} style={{color:'#0EA5E9',borderColor:'#0EA5E930'}}><I n="message-square" s={13}/> SMS</Btn>}
            <Btn small onClick={()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{color:'#0EA5E9',borderColor:'#0EA5E930'}}><I n="calendar-plus" s={13}/> RDV</Btn>
            <Btn small onClick={()=>handleCollabDeleteContact(ct.id)} style={{color:'#64748B',borderColor:'#64748B30'}}><I n="archive" s={13}/> Classer Perdu</Btn>
            {collab?.can_delete_contacts ? <Btn small onClick={async()=>{if(confirm("Supprimer définitivement "+ct.name+" ?")){contactsLocalEditRef.current=Date.now();setContacts(p=>p.filter(c=>c.id!==ct.id));await api("/api/data/contacts/"+ct.id,{method:"DELETE"});showNotif("Contact supprimé définitivement");setPipelineRightContact(null);setSelectedCrmContact(null);setTimeout(()=>{contactsLocalEditRef.current=0;},30000);}}} style={{color:'#EF4444',borderColor:'#EF444430'}}><I n="trash-2" s={13}/> Supprimer</Btn> : null}
          </div>
        )}
        {!ct._linked && (
          <div style={{display:"flex",gap:8,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${T.border}`,flexWrap:"wrap"}}>
            {ct.email&&<Btn small onClick={()=>window.open("mailto:"+ct.email)}><I n="mail" s={13}/> Email</Btn>}
            {ct.phone&&<Btn small onClick={()=>prefillKeypad(ct.phone)}><I n="phone" s={13}/> Appeler</Btn>}
          </div>
        )}

        {/* Contract signed banner */}
        {ct.contract_signed ? (
          <div style={{marginBottom:14}}>
            {ct.contract_status === 'cancelled' ? (
              <div style={{padding:12,borderRadius:12,background:'linear-gradient(135deg,#EF444408,#EF444404)',border:'1px solid #EF444425'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                  <I n="x-circle" s={14} style={{color:'#EF4444'}}/>
                  <span style={{fontSize:12,fontWeight:700,color:'#EF4444'}}>Contrat annulé le {ct.contract_cancelled_at ? new Date(ct.contract_cancelled_at).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}) + ' à ' + new Date(ct.contract_cancelled_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '—'}</span>
                </div>
                {ct.contract_cancel_reason && <div style={{fontSize:12,color:T.text2,marginBottom:6}}>Motif : {ct.contract_cancel_reason}</div>}
                <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
                  {ct.contract_amount > 0 && <div><div style={{fontSize:18,fontWeight:800,color:'#EF4444',textDecoration:'line-through'}}>{Number(ct.contract_amount).toLocaleString('fr-FR')} €</div></div>}
                  {ct.contract_number && <div><div style={{fontSize:9,color:T.text3,fontWeight:600}}>DOSSIER</div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{ct.contract_number}</div></div>}
                </div>
              </div>
            ) : (
              <div style={{padding:12,borderRadius:12,background:'linear-gradient(135deg,#22C55E08,#22C55E04)',border:'1px solid #22C55E25'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                  <I n="badge-check" s={14} style={{color:'#22C55E'}}/>
                  <span style={{fontSize:12,fontWeight:700,color:'#22C55E'}}>Contrat signé</span>
                </div>
                <div style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:10}}>
                  {ct.contract_amount > 0 && <div><div style={{fontSize:20,fontWeight:800,color:'#22C55E'}}>{Number(ct.contract_amount).toLocaleString('fr-FR')} €</div></div>}
                  {ct.contract_number && <div><div style={{fontSize:9,color:T.text3,fontWeight:600}}>DOSSIER</div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{ct.contract_number}</div></div>}
                  {ct.contract_date && <div><div style={{fontSize:9,color:T.text3,fontWeight:600}}>DATE</div><div style={{fontSize:13,fontWeight:600,color:T.text}}>{new Date(ct.contract_date).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}{ct.contract_date.includes('T')?' à '+new Date(ct.contract_date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</div></div>}
                </div>
                <div style={{borderTop:`1px solid ${T.border}`,paddingTop:8,display:'flex',gap:6,flexWrap:'wrap'}}>
                  <Btn small onClick={()=>{const amt=prompt('Nouveau montant du contrat (€) :',ct.contract_amount||'');if(amt===null)return;const v=parseFloat(amt);if(isNaN(v)||v<0){showNotif('Montant invalide','danger');return;}handleCollabUpdateContact(ct.id,{contract_amount:v});showNotif(`Montant mis à jour : ${v.toLocaleString('fr-FR')} €`,'success');}} style={{background:T.accentBg,color:T.accent,border:`1px solid ${T.accent}30`}}><I n="edit-3" s={12}/> Modifier montant</Btn>
                  <Btn small style={{background:'#EF444415',color:'#EF4444',border:'1px solid #EF444430'}} onClick={()=>{const reason=prompt('Raison de l\'annulation du contrat :');if(reason===null)return;if(!reason.trim()){showNotif('Motif obligatoire','danger');return;}api(`/api/data/contacts/${ct.id}/cancel-contract`,{method:'PUT',body:{reason:reason.trim()}}).then(r=>{if(r?.success){setContacts(p=>p.map(c=>c.id===ct.id?{...c,contract_status:'cancelled',contract_cancel_reason:reason.trim()}:c));if((typeof selectedCrmContact!=='undefined'?selectedCrmContact:null)?.id===ct.id)(typeof setSelectedCrmContact==='function'?setSelectedCrmContact:function(){})(p=>p?{...p,contract_status:'cancelled',contract_cancel_reason:reason.trim()}:p);showNotif('Contrat annulé','success');}else{showNotif(r?.error||'Erreur','danger');}}).catch(()=>showNotif('Erreur réseau','danger'));}}><I n="x-circle" s={12}/> Annuler le contrat</Btn>
                </div>
              </div>
            )}
            {/* Cancel contract modal — gestion via (typeof contractModal!=='undefined'?contractModal:null)/handlePipelineStageChange, pas ici */}
          </div>
        ) : null}

        {/* Sub-tabs: 5 onglets unifiés */}
        <div style={{display:"flex",gap:4,marginBottom:16,overflowX:"auto"}}>
          {[{id:"notes",label:"Info & Notes"},{id:"client_msg",label:"💬 Messages"},{id:"sms",label:"SMS"},{id:"history",label:`RDV (${contactBookings.length})`},{id:"appels",label:`Appels (${contactCalls.length})`},{id:"docs",label:"📎 Docs"},{id:"suivi",label:"📋 Suivi"},...(ct._linked&&ct.assignedTo===collab.id?[{id:"partage",label:"Partage"}]:[])].map(t=>(
            <div key={t.id} onClick={()=>(typeof setCollabFicheTab==='function'?setCollabFicheTab:function(){})(t.id)} style={{padding:"7px 16px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,background:collabFicheTab===t.id?T.accentBg:"transparent",color:collabFicheTab===t.id?T.accent:T.text2,whiteSpace:"nowrap"}}>{t.label}</div>
          ))}
        </div>

        {/* Timeline tab — hidden, merged into notes */}
        {collabFicheTab==="timeline_DISABLED"&&(()=>{
          const events=[];
          contactBookings.forEach(b=>{
            const cal=calendars.find(c=>c.id===b.calendarId);
            events.push({date:b.date+"T"+(b.time||"00:00"),type:"booking",icon:"calendar",color:T.accent,title:`RDV — ${cal?.name||"Calendrier"}`,sub:`${fmtDate(b.date)} à ${b.time} · ${b.duration}min`,status:b.status});
          });
          contactCalls.forEach(cl=>{
            events.push({date:cl.createdAt||"",type:"call",icon:"phone",color:"#2563EB",title:cl.direction==="outbound"?"Appel sortant":"Appel entrant",sub:`${cl.createdAt?.split("T")[0]||""} · ${cl.duration?fmtDur(cl.duration):"—"} · ${cl.status}`,notes:cl.notes});
          });
          if(ct.createdAt) events.push({date:ct.createdAt,type:"created",icon:"user-plus",color:"#22C55E",title:"Contact créé",sub:fmtDate(ct.createdAt?.split("T")[0]||ct.createdAt)});
          events.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
          return (
            <div>
              {events.length===0&&<div style={{padding:30,textAlign:"center",color:T.text3,fontSize:13}}>Aucune activité enregistrée</div>}
              <div style={{position:"relative",paddingLeft:28}}>
                {events.length>0&&<div style={{position:"absolute",left:11,top:4,bottom:4,width:2,background:T.border,borderRadius:1}}/>}
                {events.map((ev,i)=>(
                  <div key={ev.date+i} style={{marginBottom:14,position:"relative"}}>
                    <div style={{position:"absolute",left:-28,top:2,width:24,height:24,borderRadius:12,background:ev.color+"18",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1}}>
                      <I n={ev.icon} s={12} style={{color:ev.color}}/>
                    </div>
                    <div style={{padding:"8px 14px",borderRadius:10,background:T.bg,border:`1px solid ${T.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:13,fontWeight:600,color:T.text}}>{ev.title}</span>
                        {ev.status&&<Badge color={ev.status==="confirmed"?"#22C55E":ev.status==="pending"?"#F59E0B":"#EF4444"}>{ev.status==="confirmed"?"Confirmé":ev.status==="pending"?"En attente":"Annulé"}</Badge>}
                      </div>
                      <div style={{fontSize:11,color:T.text3,marginTop:2}}>{ev.sub}</div>
                      {ev.notes&&<div style={{fontSize:12,color:T.text2,marginTop:4,fontStyle:"italic"}}>{ev.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* History (RDV) tab — enrichi avec notes par RDV */}
        {collabFicheTab==="history"&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <span style={{fontSize:12,fontWeight:700,color:T.text3}}>{contactBookings.length} rendez-vous</span>
              <Btn small onClick={()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{color:'#fff',background:'#0EA5E9',borderColor:'#0EA5E9'}}><I n="calendar-plus" s={13}/> Nouveau RDV</Btn>
            </div>
            {contactBookings.length===0&&(
              <div onClick={()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{padding:30,textAlign:"center",borderRadius:10,border:'1.5px dashed #8B5CF640',background:'#8B5CF608',cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.borderColor='#8B5CF6'} onMouseLeave={e=>e.currentTarget.style.borderColor='#8B5CF640'}>
                <I n="calendar-plus" s={24} style={{color:'#8B5CF6',marginBottom:6}}/>
                <div style={{fontSize:13,fontWeight:700,color:'#8B5CF6'}}>Programmer un premier RDV</div>
                <div style={{fontSize:11,color:T.text3,marginTop:2}}>Cliquez pour créer un rendez-vous</div>
              </div>
            )}
            {/* Séparation: À venir / Passés */}
            {(()=>{
              const todayS=new Date().toISOString().split('T')[0];
              const upcoming=contactBookings.filter(b=>b.date>=todayS&&b.status!=='cancelled').sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
              const past=contactBookings.filter(b=>b.date<todayS||b.status==='cancelled').sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
              const renderRdv=(b,isUpcoming)=>{
                const cal=calendars.find(c=>c.id===b.calendarId);
                const stColor=b.status==='confirmed'?'#22C55E':b.status==='pending'?'#F59E0B':'#EF4444';
                return(
                  <div key={b.id} style={{padding:'10px 12px',borderRadius:10,marginBottom:6,background:isUpcoming?stColor+'06':T.bg,border:`1px solid ${isUpcoming?stColor+'25':T.border}`,borderLeft:`4px solid ${stColor}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,color:T.text}}>{new Date(b.date).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})} à {b.time}</div>
                        <div style={{fontSize:11,color:T.text3}}>{cal?.name||'Calendrier'} · {b.duration}min</div>
                      </div>
                      <Badge color={stColor}>{b.status==='confirmed'?'Confirmé':b.status==='pending'?'En attente':'Annulé'}</Badge>
                      {b.noShow&&<Badge color="#EF4444">No-show</Badge>}
                    </div>
                    {/* Notes du RDV — éditable inline */}
                    {b.notes&&<div style={{fontSize:12,color:T.text2,padding:'4px 8px',borderRadius:6,background:T.card,border:`1px solid ${T.border}`,marginTop:4,fontStyle:'italic'}}><I n="sticky-note" s={10} style={{color:'#F59E0B',marginRight:4}}/>{b.notes}</div>}
                    <div style={{display:'flex',gap:4,marginTop:6}}>
                      <span onClick={()=>{const n=prompt('Note pour ce RDV :',b.notes||'');if(n===null)return;api(`/api/bookings/${b.id}`,{method:'PUT',body:{notes:n}}).then(()=>{setBookings(p=>p.map(x=>x.id===b.id?{...x,notes:n}:x));showNotif('Note RDV mise à jour','success');}).catch(()=>showNotif('Erreur','danger'));}} style={{fontSize:10,color:T.accent,cursor:'pointer',fontWeight:600,display:'flex',alignItems:'center',gap:3}}><I n="edit-3" s={10}/> {b.notes?'Modifier note':'Ajouter note'}</span>
                      {isUpcoming&&b.status==='confirmed'&&<span onClick={()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:b.date,time:b.time,duration:b.duration||30,notes:b.notes||'',calendarId:b.calendarId||(calendars||[])[0]?.id||'',_bookingMode:true,_editBookingId:b.id});setPhoneShowScheduleModal(true);}} style={{fontSize:10,color:'#F59E0B',cursor:'pointer',fontWeight:600,display:'flex',alignItems:'center',gap:3}}><I n="calendar" s={10}/> Replanifier</span>}
                      <span onClick={()=>{if(!confirm('Supprimer ce RDV ?'))return;api(`/api/bookings/${b.id}`,{method:'DELETE'}).then(r=>{if(r?.success!==false){setBookings(p=>p.filter(x=>x.id!==b.id));showNotif('RDV supprimé','success');}else showNotif(r?.error||'Erreur','danger');}).catch(()=>showNotif('Erreur','danger'));}} style={{fontSize:10,color:'#EF4444',cursor:'pointer',fontWeight:600,display:'flex',alignItems:'center',gap:3,marginLeft:'auto'}}><I n="trash-2" s={10}/> Supprimer</span>
                    </div>
                  </div>
                );
              };
              return <>
                {upcoming.length>0&&<div style={{marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#22C55E',marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="calendar-check" s={12}/> À venir ({upcoming.length})</div>
                  {upcoming.map(b=>renderRdv(b,true))}
                </div>}
                {past.length>0&&<div>
                  <div style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="clock" s={12}/> Passés ({past.length})</div>
                  {past.map(b=>renderRdv(b,false))}
                </div>}
              </>;
            })()}
          </div>
        )}

        {/* Client Messages tab */}
        {collabFicheTab==="client_msg" && <FicheClientMsgScreen ct={ct} notifList={notifList} setNotifList={setNotifList} setNotifUnread={setNotifUnread} showNotif={showNotif} />}

        {/* Notes/Info tab — unified view */}
        {collabFicheTab==="notes"&&(
          <div>
            {ct._linked ? (
              <>
                {/* ── Coordonnées — même structure que pipeline ── */}
                {(()=>{
                  const _cu=(field,val)=>{setSelectedCrmContact(p=>({...p,[field]:val}));setContacts(p=>p.map(c=>c.id===ct.id?{...c,[field]:val}:c));_T.crmSync?.({[field]:val});clearTimeout(collabNotesTimerRef.current);collabNotesTimerRef.current=setTimeout(()=>api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{[field]:val,companyId:company?.id}}),500);};
                  const _cf=(icon,field,placeholder,opts={})=><div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:8,border:`1px solid ${T.border}40`,background:T.card,...(opts.full?{gridColumn:'1 / -1'}:{})}}>
                    <I n={icon} s={13} style={{color:T.text3,flexShrink:0}}/>
                    <input value={ct[field]||''} onChange={e=>_cu(field,e.target.value)} onBlur={()=>{if((field==='phone'||field==='mobile')&&ct[field]){const n=ct[field].replace(/\s/g,'');let ph=ct[field];if(/^0[1-9]\d{8}$/.test(n)){ph='+33'+n.slice(1);_cu(field,ph);}else if(/^[1-9]\d{8}$/.test(n)){ph='+33'+n;_cu(field,ph);}}}} placeholder={placeholder} style={{fontSize:13,border:'none',padding:'2px 0',background:'transparent',color:ct[field]?T.text:'#CBD5E1',fontFamily:'inherit',outline:'none',width:'100%'}}/>
                  </div>;
                  return <>
                  {/* Badge: Type + Source + Date */}
                  <div style={{display:'flex',alignItems:'center',gap:0,marginBottom:8,fontSize:11,color:T.text3,borderRadius:8,border:`1px solid ${T.border}30`,overflow:'hidden',background:T.card}}>
                    <select value={ct.contact_type||'btc'} onChange={e=>_cu('contact_type',e.target.value)} style={{fontSize:11,fontWeight:700,border:'none',borderRight:`1px solid ${T.border}30`,padding:'5px 8px',background:ct.contact_type==='btb'?'#2563EB08':'#22C55E08',color:ct.contact_type==='btb'?'#2563EB':'#22C55E',cursor:'pointer',fontFamily:'inherit'}}><option value="btc">🟢 Particulier</option><option value="btb">🔵 Entreprise</option></select>
                    {ct.source&&<span style={{padding:'5px 8px',fontWeight:600,borderRight:`1px solid ${T.border}30`}}>{ct.source==='manual'?'Manuel':ct.source==='csv'?'CSV':ct.source==='lead'?'Lead':(ct.source==='booking'||ct.source==='agenda')?'Booking':ct.source}</span>}
                    {ct.createdAt&&<span style={{padding:'5px 8px'}}>{new Date(ct.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}</span>}
                  </div>
                  {/* Bloc coordonnées */}
                  <div style={{marginBottom:10,padding:'8px 10px',borderRadius:8,background:T.bg,border:`1px solid ${T.border}`}}>
                    {/* Civ + Prénom + Nom */}
                    <div style={{display:'flex',gap:4,alignItems:'center',marginBottom:6}}>
                      <select value={ct.civility||''} onChange={e=>_cu('civility',e.target.value)} style={{fontSize:12,fontWeight:700,border:`1px solid ${T.border}40`,borderRadius:8,padding:'6px 8px',background:T.card,color:ct.civility?T.text:T.text3,fontFamily:'inherit',outline:'none',cursor:'pointer',minWidth:52,textAlign:'center'}}><option value="">Civ.</option><option value="M">M.</option><option value="Mme">Mme</option></select>
                      <input value={ct.firstname||''} onChange={e=>_cu('firstname',e.target.value)} onBlur={()=>{const full=(ct.civility?ct.civility+' ':'')+(ct.firstname||'')+' '+(ct.lastname||'');api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{firstname:ct.firstname,name:full.trim(),companyId:company?.id}});}} placeholder="Prénom" style={{fontSize:14,fontWeight:700,border:`1px solid ${T.border}40`,borderRadius:8,padding:'6px 10px',background:T.card,color:ct.firstname?T.text:'#CBD5E1',fontFamily:'inherit',outline:'none',flex:1,minWidth:0}}/>
                      <input value={ct.lastname||''} onChange={e=>_cu('lastname',e.target.value)} onBlur={()=>{const full=(ct.civility?ct.civility+' ':'')+(ct.firstname||'')+' '+(ct.lastname||'');api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{lastname:ct.lastname,name:full.trim(),companyId:company?.id}});}} placeholder="Nom" style={{fontSize:14,fontWeight:700,border:`1px solid ${T.border}40`,borderRadius:8,padding:'6px 10px',background:T.card,color:ct.lastname?T.text:'#CBD5E1',fontFamily:'inherit',outline:'none',flex:1.3,minWidth:0}}/>
                    </div>
                    {/* Champs — adaptés selon type */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                      {_cf('phone','phone','Téléphone',{full:true})}
                      {_cf('mail','email','Email',{full:true})}
                      {_cf('map-pin','address','Adresse',{full:true})}
                    </div>
                    {/* Entreprise only */}
                    {ct.contact_type==='btb'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3,marginTop:3}}>
                      {_cf('building-2','company','Société',{full:true})}
                      {_cf('smartphone','mobile','Mobile')}
                      {_cf('globe','website','Site web')}
                      {_cf('hash','siret','SIRET / SIREN')}
                      {_cf('receipt','tva_number','N° TVA')}
                    </div>}
                  </div>
                  </>;
                })()}
                {/* Source data (from lead import) */}
                {(()=>{
                  let src = null;
                  try { src = JSON.parse(ct.source_data_json || ct.sourceData || '{}'); } catch { src = {}; }
                  const entries = Object.entries(src || {}).filter(([k,v]) => v && !['id','companyId','assignedTo'].includes(k));
                  if (entries.length === 0) return null;
                  return <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="database" s={12}/> Données source</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                      {entries.map(([k,v]) => <div key={k} style={{padding:'6px 8px',borderRadius:8,background:T.bg,border:'1px solid '+T.border}}>
                        <div style={{fontSize:9,fontWeight:700,color:T.accent,textTransform:'uppercase',marginBottom:2}}>{k.replace(/_/g,' ')}</div>
                        <div style={{fontSize:12,color:T.text,fontWeight:500}}>{String(v)}</div>
                      </div>)}
                    </div>
                  </div>;
                })()}

                {/* Rating stars */}
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12}}>
                  <span style={{fontSize:11,fontWeight:700,color:T.text3}}>Note client :</span>
                  {[1,2,3,4,5].map(star => <span key={star} onClick={()=>{
                    const v = ct.rating === star ? 0 : star;
                    setSelectedCrmContact(p=>({...p,rating:v}));
                    setContacts(p=>p.map(c=>c.id===ct.id?{...c,rating:v}:c));
                    _T.crmSync?.({rating:v});
                    api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{rating:v,companyId:company?.id}});
                  }} style={{cursor:'pointer',fontSize:18,color:star<=(ct.rating||0)?'#F59E0B':'#D1D5DB'}}>{star<=(ct.rating||0)?'★':'☆'}</span>)}
                </div>

                {/* Tags */}
                <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap',marginBottom:12}}>
                  <span style={{fontSize:11,fontWeight:700,color:T.text3}}>Tags :</span>
                  {(Array.isArray(ct.tags)?ct.tags:(() => { try { return JSON.parse(ct.tags_json||'[]'); } catch { return []; } })()).map((tag,i)=>
                    <span key={i} style={{fontSize:10,padding:'2px 8px',borderRadius:6,background:T.accentBg,color:T.accent,fontWeight:600}}>{tag}</span>
                  )}
                  <span onClick={()=>{const t=prompt('Nouveau tag :');if(!t) return;const tags=[...(ct.tags||[]),t];setSelectedCrmContact(p=>({...p,tags}));setContacts(p=>p.map(c=>c.id===ct.id?{...c,tags}:c));api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{tags_json:JSON.stringify(tags),companyId:company?.id}});}} style={{fontSize:10,padding:'2px 8px',borderRadius:6,border:'1px dashed '+T.border,color:T.accent,cursor:'pointer',fontWeight:600}}>+ Tag</span>
                </div>

                {/* Custom Fields (company + collab) */}
                {(()=>{
                  const defs = (contactFieldDefs||[]).filter(d => d.scope === 'company' || d.createdBy === collab.id);
                  if (defs.length === 0 && !(contactFieldDefs||[]).length) {
                    // Show only the "add field" button when no defs exist
                    return <div style={{marginBottom:12}}>
                      <div onClick={()=>{
                        const label = prompt('Nom du champ :');
                        if(!label) return;
                        api('/api/contact-fields',{method:'POST',body:{companyId:company.id,label,scope:'collab'}}).then(r=>{
                          if(r?.id) setContactFieldDefs(p=>[...p,{...r,label,fieldType:'text',options:[],scope:'collab',createdBy:collab.id}]);
                        });
                      }} style={{fontSize:11,color:T.accent,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                        <I n="plus" s={11}/> Ajouter un champ perso
                      </div>
                    </div>;
                  }
                  const cfRaw = Array.isArray(ct.custom_fields) ? ct.custom_fields : (() => { try { return JSON.parse(ct.custom_fields_json || '[]'); } catch { return []; } })();
                  const cfMap = {};
                  cfRaw.forEach(f => { cfMap[f.key] = f.value; });
                  const saveCustomField = (fieldKey, value) => {
                    const updated = [...cfRaw.filter(f => f.key !== fieldKey), { key: fieldKey, value }];
                    const json = JSON.stringify(updated);
                    setSelectedCrmContact(p => ({...p, custom_fields: updated, custom_fields_json: json}));
                    setContacts(p => p.map(c => c.id === ct.id ? {...c, custom_fields: updated, custom_fields_json: json} : c));
                    _T.crmSync?.({custom_fields: updated, custom_fields_json: json});
                    clearTimeout(collabNotesTimerRef.current);
                    collabNotesTimerRef.current = setTimeout(() => api(`/api/data/contacts/${ct.id}`, {method:'PUT', body:{custom_fields_json: json, companyId: company?.id}}), 800);
                  };
                  return <div style={{marginBottom:16}}>
                    <div style={{fontSize:12,fontWeight:700,color:'#8B5CF6',marginBottom:8,display:'flex',alignItems:'center',gap:6}}><I n="sliders" s={14} style={{color:'#8B5CF6'}}/> Champs personnalisés</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      {defs.map(d => <div key={d.id} style={{padding:'8px 12px',borderRadius:10,background:T.bg,border:'1px solid '+T.border,position:'relative'}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{fontSize:11,fontWeight:700,color:'#8B5CF6'}}>{d.label}</span>
                          <span onClick={()=>{const msg=d.scope==='company'?`Supprimer le champ "${d.label}" de l'affichage sur TOUTES les fiches ?\n\nLes valeurs déjà saisies resteront stockées mais ne seront plus visibles, sauf restauration ou recréation du champ.`:`Supprimer le champ "${d.label}" ?`;if(!confirm(msg))return;api(`/api/contact-fields/${d.id}`,{method:'DELETE'}).then(()=>{setContactFieldDefs(p=>p.filter(x=>x.id!==d.id));showNotif('Champ supprimé','success');}).catch(()=>showNotif('Erreur','danger'));}} style={{cursor:'pointer',fontSize:10,color:'#EF4444',opacity:0.5,lineHeight:1}} title="Supprimer ce champ">×</span>
                        </div>
                        {d.fieldType === 'select' ? (
                          <select value={cfMap[d.fieldKey]||''} onChange={e => saveCustomField(d.fieldKey, e.target.value)} style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:13,color:T.text,fontFamily:'inherit'}}>
                            <option value="">—</option>
                            {(d.options||[]).map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : d.fieldType === 'date' ? (
                          <input type="date" value={cfMap[d.fieldKey]||''} onChange={e => saveCustomField(d.fieldKey, e.target.value)} style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:13,color:T.text,fontFamily:'inherit'}}/>
                        ) : d.fieldType === 'number' ? (
                          <input type="number" value={cfMap[d.fieldKey]||''} onChange={e => saveCustomField(d.fieldKey, e.target.value)} style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:13,color:T.text,fontFamily:'inherit'}}/>
                        ) : (
                          <input value={cfMap[d.fieldKey]||''} onChange={e => saveCustomField(d.fieldKey, e.target.value)} placeholder="..." style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:13,color:T.text,fontFamily:'inherit'}}/>
                        )}
                      </div>)}
                    </div>
                    <div onClick={()=>{
                      const label = prompt('Nom du champ :');
                      if(!label) return;
                      const scope = confirm('Appliquer ce champ à TOUS les contacts ?\n\nOK = Oui (visible sur toutes les fiches)\nAnnuler = Non (uniquement ce contact)') ? 'company' : 'collab';
                      api('/api/contact-fields',{method:'POST',body:{companyId:company.id,label,scope}}).then(r=>{
                        if(r?.id) { setContactFieldDefs(p=>[...p,{...r,label,fieldType:'text',options:[],scope,createdBy:collab.id}]); showNotif(scope==='company'?'Champ ajouté sur toutes les fiches':'Champ ajouté','success'); }
                      });
                    }} style={{marginTop:8,fontSize:12,color:'#8B5CF6',cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontWeight:600}}>
                      <I n="plus" s={12}/> Ajouter un champ perso
                    </div>
                  </div>;
                })()}
                <textarea value={ct.notes||""} onChange={e=>{
                  const v=e.target.value;
                  setSelectedCrmContact(p=>({...p,notes:v}));
                  setContacts(p=>p.map(c=>c.id===ct.id?{...c,notes:v}:c));
                  _T.crmSync?.({notes:v});
                  clearTimeout(collabNotesTimerRef.current);
                  collabNotesTimerRef.current=setTimeout(()=>api(`/api/data/contacts/${ct.id}`,{method:"PUT",body:{notes:v,companyId:company?.id}}),800);
                }} placeholder="Notes, infos commerciales, suivi..." style={{width:"100%",minHeight:70,maxHeight:140,border:`1px solid ${T.border}`,borderRadius:8,padding:10,fontSize:12,fontFamily:"inherit",resize:"vertical",background:T.bg,color:T.text,outline:"none"}}/>
                <p style={{fontSize:10,color:T.text3,marginTop:4}}>Sauvegarde automatique</p>

                {/* V4: Debug mode — Historique des statuts */}
                <HookIsolator>{()=>{
                  const [histOpen, setHistOpen] = useState(false);
                  const [statusHist, setStatusHist] = useState(null);
                  const loadHist = () => { if(statusHist) { setHistOpen(!histOpen); return; } api(`/api/data/contacts/${ct.id}/status-history`).then(d=>{ if(Array.isArray(d)) setStatusHist(d); setHistOpen(true); }).catch(()=>setStatusHist([])); };
                  const sourceLabels = { manual:'Manuel', call:'Appel', booking:'RDV', automation:'Auto', import:'Import', ai:'IA', system:'Systeme' };
                  const sourceColors = { manual:'#2563EB', call:'#059669', booking:'#7C3AED', automation:'#D97706', import:'#0D9488', ai:'#EC4899', system:'#6B7280' };
                  return <div style={{marginTop:10,borderRadius:10,border:`1px solid ${T.border}`,overflow:'hidden'}}>
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
                  </div>;
                }}</HookIsolator>

                {/* Accordéon Résumé IA — CRM fiche */}
                {ct.last_ai_analysis_id && (()=>{
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
                })()}
              </>
            ) : (
              <div style={{padding:30,textAlign:"center",color:T.text3,fontSize:13}}>Ajoutez ce contact au CRM pour pouvoir prendre des notes.</div>
            )}
          </div>
        )}

        {/* SMS tab */}
        {collabFicheTab==="sms"&&(
          <div>
            {ct.phone ? (()=>{
              const phone = ct.phone.startsWith('+') ? ct.phone : '+33'+ct.phone.replace(/^0/,'');
              // Load SMS history for this contact
              if (!_T.smsLoaded?.[ct.id]) {
                _T.smsLoaded = _T.smsLoaded || {};
                _T.smsLoaded[ct.id] = true;
                api('/api/conversations/sms-history/' + encodeURIComponent(phone.replace(/\s/g,''))).then(msgs => {
                  if (Array.isArray(msgs)) { _T.allSmsMessages = msgs; setCollabFicheTab('sms'); }
                });
              }
              const smsForContact = (_T.allSmsMessages||[]).filter(m => m.toNumber === phone || m.fromNumber === phone);
              return <>
                {/* Compose SMS */}
                {(()=>{
                  const myTwilioNums = ((typeof appMyPhoneNumbers!=='undefined'?appMyPhoneNumbers:null)||[]).filter(pn => pn.collaboratorId === collab.id && pn.status === 'assigned' && pn.smsCapable);
                  const smsFromKey = '_smsFrom_' + ct.id;
                  const selectedFrom = window[smsFromKey] || (myTwilioNums.length > 0 ? myTwilioNums[0].phoneNumber : 'brevo');
                  return <div style={{display:'flex',flexDirection:'column',height:'100%',maxHeight:500}}>
                  {/* ── HISTORIQUE EN HAUT (scrollable) ── */}
                  <div style={{flex:1,overflowY:'auto',marginBottom:12,paddingRight:4}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:6}}>Historique SMS ({smsForContact.length})</div>
                    {smsForContact.length===0 ? (
                      <div style={{padding:20,textAlign:'center',color:T.text3,fontSize:12}}>Aucun SMS échangé</div>
                    ) : smsForContact.sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')).map((m,i)=>(
                      <div key={i} style={{display:'flex',flexDirection:'column',alignItems:m.direction==='outbound'?'flex-end':'flex-start',marginBottom:8}}>
                        <div style={{maxWidth:'80%',padding:'8px 12px',borderRadius:12,background:m.direction==='outbound'?'linear-gradient(135deg,#2563EB,#1D4ED8)':m.direction==='inbound'?'#F0FDF4':'#E5E7EB',color:m.direction==='outbound'?'#fff':'#1F2937',fontSize:12,lineHeight:1.4,border:m.direction==='inbound'?'1px solid #22C55E30':'none'}}>{m.content}</div>
                        <div style={{fontSize:9,color:T.text3,marginTop:2}}>
                          {m.createdAt?new Date(m.createdAt).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''} · <span style={{color:m.status==='received'?'#22C55E':m.status==='sent'?'#3B82F6':T.text3,fontWeight:600}}>{m.status==='received'?'reçu':m.status||'sent'}</span>
                          {m.provider&&m.provider!=='brevo'&&<span style={{marginLeft:4,fontSize:8,color:'#7C3AED',fontWeight:600}}>via {m.provider}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── COMPOSITION EN BAS (fixe) ── */}
                  <div style={{borderTop:'1px solid '+T.border,paddingTop:10,flexShrink:0}}>
                    {/* Selecteur numero */}
                    <select value={selectedFrom} onChange={e=>{window[smsFromKey]=e.target.value;setCollabFicheTab('sms');}} style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1.5px solid '+(selectedFrom==='brevo'?'#F59E0B40':'#22C55E40'),background:selectedFrom==='brevo'?'#F59E0B06':'#22C55E06',fontSize:11,color:T.text,cursor:'pointer',outline:'none',fontWeight:600,marginBottom:6}}>
                      {myTwilioNums.map(pn=><option key={pn.phoneNumber} value={pn.phoneNumber}>Twilio — {displayPhone(pn.phoneNumber)}</option>)}
                      <option value="brevo">{company?.sms_sender_name||'Calendar360'} (Brevo)</option>
                    </select>
                    {/* Zone de texte + envoi */}
                    <div style={{display:'flex',gap:6,alignItems:'flex-end'}}>
                      <textarea id={'crm-sms-compose-'+ct.id} placeholder="Votre message..." rows={2} style={{flex:1,padding:8,borderRadius:8,border:'1px solid '+T.border,background:T.bg,fontSize:12,fontFamily:'inherit',color:T.text,resize:'none',outline:'none'}} onInput={e=>{window['_smsLen_'+ct.id]=e.target.value.length;setCollabFicheTab('sms');}}/>
                      <div onClick={()=>{
                        const ta=document.getElementById('crm-sms-compose-'+ct.id);
                        const msg=ta?.value?.trim();
                        if(!msg){showNotif('Message vide','error');return;}
                        const fromNum = selectedFrom !== 'brevo' ? selectedFrom : undefined;
                        api('/api/sms/send',{method:'POST',body:{to:phone,content:msg,contactId:ct.id,fromNumber:fromNum}}).then(r=>{
                          if(r?.success){
                            showNotif('SMS envoyé' + (r.provider==='twilio'?' via Twilio':'') + ' !');
                            ta.value='';window['_smsLen_'+ct.id]=0;
                            _T.allSmsMessages = [...(_T.allSmsMessages||[]), {toNumber:phone,fromNumber:r.fromNumber||'',content:msg,direction:'outbound',status:'sent',provider:r.provider,createdAt:new Date().toISOString()}];
                            _T.smsLoaded[ct.id]=false;
                            setCollabFicheTab('sms');
                          } else { showNotif(r?.error||'Erreur envoi SMS','error'); }
                        }).catch(()=>showNotif('Erreur envoi','error'));
                      }} style={{width:40,height:40,borderRadius:10,background:'linear-gradient(135deg,#2563EB,#1D4ED8)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
                        <I n="send" s={16} style={{color:'#fff'}}/>
                      </div>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
                      <span style={{fontSize:9,color:T.text3}}>{window['_smsLen_'+ct.id]||0}/160 · {Math.ceil((window['_smsLen_'+ct.id]||1)/160)} SMS</span>
                      <span style={{fontSize:8,color:selectedFrom==='brevo'?'#F59E0B':'#22C55E',fontWeight:600}}>{selectedFrom==='brevo'?'Brevo':'Twilio'}</span>
                    </div>
                    {/* Templates */}
                    <div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:6}}>
                      {['Bonjour, votre RDV est confirmé.','Rappel : RDV prévu demain.','Merci pour votre visite !','RDV annulé, contactez-nous.'].map((tpl,i)=>
                        <div key={i} onClick={()=>{const ta=document.getElementById('crm-sms-compose-'+ct.id);if(ta){ta.value=tpl;window['_smsLen_'+ct.id]=tpl.length;setCollabFicheTab('sms');}}} style={{fontSize:8,padding:'3px 6px',borderRadius:5,background:T.bg,border:'1px solid '+T.border,cursor:'pointer',color:T.text3}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background=T.bg}>{tpl.substring(0,25)}...</div>
                      )}
                    </div>
                  </div>
                </div>;
                })()}
              </>;
            })() : <div style={{padding:30,textAlign:'center',color:T.text3,fontSize:13}}>Pas de numéro de téléphone pour ce contact</div>}
          </div>
        )}

        {/* Appels tab — filtré par contactId */}
        {collabFicheTab==="appels"&&(()=>{
          // Filtrer par contactId d'abord, fallback par numéro
          const myCallsById = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(cl=>cl.contactId===ct.id);
          const myCallsByPhone = (()=>{
            if(myCallsById.length>0) return myCallsById;
            const ph=(ct.phone||ct.mobile||'').replace(/[^\d]/g,'').slice(-9);
            if(ph.length<9) return [];
            return ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(cl=>{const n=(cl.direction==='outbound'?cl.toNumber:cl.fromNumber||'').replace(/[^\d]/g,'').slice(-9);return n===ph;});
          })().sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
          return (
          <div>
            {ct.phone&&<Btn primary onClick={()=>prefillKeypad(ct.phone)} style={{marginBottom:16,borderRadius:10,width:'100%'}}><I n="phone" s={14}/> Appeler {ct.name}</Btn>}
            <div style={{fontSize:12,color:T.text3,marginBottom:8}}>{myCallsByPhone.length} appel{myCallsByPhone.length>1?'s':''} pour ce contact</div>
            {myCallsByPhone.length===0&&<div style={{textAlign:'center',padding:32,color:T.text3,fontSize:13}}>Aucun appel enregistré pour ce contact</div>}
            {myCallsByPhone.map(cl=>{
              const isExp = (typeof iaHubCollapse!=='undefined'?iaHubCollapse:null)['ficheCall_'+cl.id];
              const hasRec = (typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[cl.id] || cl.recordingUrl;
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
                    {(typeof iaHubCollapse!=='undefined'?iaHubCollapse:null)['ficheTr_'+cl.id] && _T.iaCallTranscripts?.[cl.id] && (()=>{
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
        })()}

        {/* Partage tab — only for contact owner */}
        {collabFicheTab==="partage"&&ct._linked&&ct.assignedTo===collab.id&&(
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
        )}

        {/* Docs tab — upload + list + delete */}

        {/* P0.3 — Onglet Suivi — V7 Transfer Tracking */}
        {collabFicheTab==="suivi" && <FicheSuiviScreen ct={ct} setV7TransferModal={setV7TransferModal} setV7TransferTarget={setV7TransferTarget} />}

        {collabFicheTab==="docs"&&ct._linked && <FicheDocsLinkedScreen ct={ct} showNotif={showNotif} />}

        {/* ── Espace client (en bas de fiche) ── */}
        {ct._linked && (
          <div style={{marginTop:20,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
            <div style={{borderRadius:10,background:ct.clientPortalEnabled?'#D1FAE5':'#F1F5F9',border:'1px solid '+(ct.clientPortalEnabled?'#A7F3D0':'#E2E8F0'),overflow:'hidden'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px'}}>
                <I n="globe" s={14} style={{color:ct.clientPortalEnabled?'#059669':'#94A3B8'}}/>
                {ct.clientPortalEnabled && ct.clientToken ? (
                  <>
                    <span style={{fontSize:12,fontWeight:600,color:'#059669'}}>Espace client actif</span>
                    <span style={{flex:1}}/>
                    <a href={`https://calendar360.fr/espace/${ct.clientToken}`} target="_blank" rel="noreferrer" style={{cursor:'pointer',padding:'3px 10px',borderRadius:6,background:'#05966914',color:'#059669',fontSize:11,fontWeight:600,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:4}}><I n="external-link" s={10}/> Ouvrir</a>
                    <span onClick={()=>{navigator.clipboard.writeText(`https://calendar360.fr/espace/${ct.clientToken}`);showNotif('Lien copié !','success');}} style={{cursor:'pointer',padding:'3px 10px',borderRadius:6,background:'#059669',color:'#fff',fontSize:11,fontWeight:600}}><I n="copy" s={10}/> Copier</span>
                    <span onClick={()=>{const url=`https://calendar360.fr/espace/${ct.clientToken}`;const ph=ct.phone||ct.mobile||'';if(ph){api('/api/sms/send',{method:'POST',body:{to:ph,message:`Bonjour ${ct.firstname||ct.name||''}, voici l'accès à votre espace client : ${url}`,companyId:company?.id,collaboratorId:collab?.id,contactId:ct.id}}).then(r=>{if(r?.success)showNotif('Lien envoyé par SMS !','success');else showNotif('Erreur envoi SMS','danger');}).catch(()=>showNotif('Erreur','danger'));}else{navigator.clipboard.writeText(url);showNotif('Lien copié !','info');}}} style={{cursor:'pointer',padding:'3px 10px',borderRadius:6,background:'#2563EB',color:'#fff',fontSize:11,fontWeight:600,display:'inline-flex',alignItems:'center',gap:4}}><I n="send" s={10}/> Envoyer</span>
                  </>
                ) : (
                  <>
                    <span style={{fontSize:12,color:'#94A3B8'}}>Espace client non activé</span>
                    <span onClick={()=>{const tk='ct_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);handleCollabUpdateContact(ct.id,{clientToken:tk,clientPortalEnabled:1});showNotif('Espace client activé !','success');}} style={{cursor:'pointer',padding:'3px 10px',borderRadius:6,background:T.accent,color:'#fff',fontSize:11,fontWeight:600,flexShrink:0,marginLeft:'auto'}}>Activer</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </>);
    })()}
  </div>
</div>
)}
    </>
  );
};

export default CrmTab;
