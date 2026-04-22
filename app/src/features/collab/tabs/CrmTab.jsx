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
  {/* Header with Export/Import/Nouveau */}
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
    <h1 style={{fontSize:22,fontWeight:700,letterSpacing:-0.5}}>Contacts CRM</h1>
    <div style={{display:"flex",gap:8}}>
      <div style={{position:'relative'}}>
      <Btn small onClick={()=>(typeof setCrmExportModal==='function'?setCrmExportModal:function(){})(!crmExportModal)}><I n="layers" s={13}/> Export</Btn>
      {(typeof crmExportModal!=='undefined'?crmExportModal:null)&&<div style={{position:'absolute',top:'100%',left:0,zIndex:99,background:T.card,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',padding:16,minWidth:280,marginTop:4}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:10}}>📥 Export CSV</div>
        {[
          {id:'view',label:'Vue actuelle',desc:`${crmVisibleCols.filter(c=>c.k!=='actions').length} colonnes — ce que tu vois`,icon:'eye'},
          {id:'all',label:'Tous les champs',desc:`${CRM_STD_COLS.length-2+((contactFieldDefs||[]).length)} champs standards + personnalisés`,icon:'layers'}
        ].map(opt=>(
          <div key={opt.id} onClick={()=>{
            const esc=v=>`"${String(v||'').replace(/"/g,'""').replace(/[\n\r]/g,' ')}"`;
            let headers,rows;
            if(opt.id==='view'){
              const cols=crmVisibleCols.filter(c=>c.k!=='actions');
              headers=cols.map(c=>c.l.replace(/[📞✉🔥⚡]/g,'').trim());
              rows=filteredCollabCrm.map(ct=>cols.map(col=>{
                if(col.k==='name')return esc(ct.name);
                if(col.k==='pipeline_stage')return esc(ct._stage?.label||'');
                if(col.k==='score')return esc(ct._score||0);
                if(col.k==='next_action')return esc(ct.next_action_type||'');
                if(col.k==='lastVisit')return esc(ct.lastVisit||'');
                if(col.k==='totalBookings')return esc(ct.totalBookings||0);
                if(col.k==='createdAt')return esc(ct.createdAt||'');
                if(col.k==='tags')return esc((ct.tags||[]).join(';'));
                if(col.k.startsWith('cf_')&&col.fieldKey){const v=(ct._cfMap||[]).find(f=>f.key===col.fieldKey)?.value||'';return esc(v);}
                return esc(ct[col.k]||'');
              }).join(','));
            }else{
              const stdH=['Nom','Prénom','Nom de famille','Email','Téléphone','Entreprise','Adresse','Ville','CP','Pipeline','Score','RDV','Source','Tags','Notes','Créé le'];
              const cfH=(contactFieldDefs||[]).map(d=>d.label);
              headers=[...stdH,...cfH];
              rows=filteredCollabCrm.map(ct=>{
                const std=[ct.name,ct.firstname||'',ct.lastname||'',ct.email||'',ct.phone||'',ct.company||'',ct.address||'',ct.city||'',ct.zip||'',ct._stage?.label||'',ct._score||0,ct.totalBookings||0,ct.source||'',(ct.tags||[]).join(';'),(ct.notes||'').replace(/[\n\r]/g,' '),ct.createdAt||''].map(esc);
                const cf=(contactFieldDefs||[]).map(d=>{const v=(ct._cfMap||[]).find(f=>f.key===d.fieldKey)?.value||'';return esc(v);});
                return [...std,...cf].join(',');
              });
            }
            const csv=[headers.join(','),...rows].join('\n');
            const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='contacts-crm.csv';a.click();URL.revokeObjectURL(url);
            setCrmExportModal(false);showNotif(`${rows.length} contacts exportés (${opt.label})`);
          }} style={{padding:'10px 12px',borderRadius:8,cursor:'pointer',marginBottom:6,border:`1px solid ${T.border}`,transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <I n={opt.icon} s={16} style={{color:T.accent}}/>
              <div><div style={{fontSize:13,fontWeight:600,color:T.text}}>{opt.label}</div><div style={{fontSize:11,color:T.text3}}>{opt.desc}</div></div>
            </div>
          </div>
        ))}
        <div style={{textAlign:'right',marginTop:4}}><span onClick={()=>setCrmExportModal(false)} style={{fontSize:11,color:T.text3,cursor:'pointer'}}>Annuler</span></div>
      </div>}
      </div>
      <Btn small onClick={()=>setCsvImportModal({step:"upload"})}><I n="upload" s={13}/> Import CSV</Btn>
      <Btn small onClick={()=>setScanImageModal({step:'upload',image:null,contacts:[],loading:false})} style={{background:'#0EA5E912',color:'#0EA5E9',border:'1px solid #0EA5E930'}}><I n="camera" s={13}/> Import Photo</Btn>
      {!pipelineReadOnly && (
        <Btn small onClick={() => setShowAddStage(true)} style={{background:'#7C3AED12',color:'#7C3AED',border:'1px solid #7C3AED30'}}><I n="tag" s={13}/> + Statut</Btn>
      )}
      <Btn primary onClick={()=>setShowNewContact(true)}><I n="plus" s={14}/> Nouveau contact</Btn>
    </div>
  </div>
  <p style={{fontSize:13,color:T.text2,marginBottom:16}}>Fiche contact avec historique complet, tags, notes, documents, satisfaction. <strong>{myCrmContacts.length}</strong> contact{myCrmContacts.length>1?"s":""}</p>

  {/* Pipeline Stats Bar */}
  <Card style={{padding:16,marginBottom:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:13,fontWeight:700,color:T.text}}><I n="bar-chart-2" s={14}/> Pipeline</span>
        <div style={{display:"flex",gap:8,fontSize:12}}>
          <span style={{fontWeight:700,color:T.text}}>{filteredCollabCrm.length} contact{filteredCollabCrm.length>1?"s":""}</span>
          <span style={{color:T.text3}}>·</span>
          <span style={{fontWeight:700,color:"#22C55E"}}>{collabPipelineAnalytics.won} gagné{collabPipelineAnalytics.won>1?"s":""}</span>
          <span style={{color:T.text3}}>·</span>
          <span style={{fontWeight:700,color:"#EF4444"}}>{collabPipelineAnalytics.lost} perdu{collabPipelineAnalytics.lost>1?"s":""}</span>
          <span style={{color:T.text3}}>·</span>
          <span style={{fontWeight:700,color:T.accent}}>{collabPipelineAnalytics.winRate}% taux conv.</span>
        </div>
      </div>
      <div style={{display:"flex",gap:4,background:T.bg,borderRadius:10,padding:3}}>
        {[{id:"table",icon:"list",label:"Table"},{id:"pipeline",icon:"trello",label:"Pipeline"},{id:"funnel",icon:"trending-up",label:"Funnel"}].map(v=>(
          <div key={v.id} onClick={()=>{(typeof setCollabCrmViewMode==='function'?setCollabCrmViewMode:function(){})(v.id);setCollabCrmPage(0);}} style={{padding:"5px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,background:collabCrmViewMode===v.id?T.accent:"transparent",color:collabCrmViewMode===v.id?"#fff":T.text3,transition:"all .2s"}}><I n={v.icon} s={13}/> {v.label}</div>
        ))}
      </div>
    </div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {collabPipelineAnalytics.funnel.map(st=>(
        <div key={st.id} onClick={()=>{(typeof setCollabCrmFilterStage==='function'?setCollabCrmFilterStage:function(){})(f=>f===st.id?"":st.id);setCollabCrmPage(0);}} style={{flex:"1 1 auto",minWidth:100,padding:"8px 12px",borderRadius:10,cursor:"pointer",background:collabCrmFilterStage===st.id?st.color+"18":T.bg,border:`1.5px solid ${collabCrmFilterStage===st.id?st.color:T.border}`,transition:"all .2s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{fontSize:11,fontWeight:600,color:st.color}}>{st.label}</span>
            <span style={{fontSize:15,fontWeight:800,color:T.text}}>{st.count}</span>
          </div>
          <div style={{height:4,borderRadius:2,background:T.border}}>
            <div style={{height:4,borderRadius:2,background:st.color,width:`${st.pct}%`,transition:"width .3s"}}/>
          </div>
          <div style={{fontSize:9,color:T.text3,marginTop:3,textAlign:"right"}}>{st.pct}% · score moy: {collabPipelineAnalytics.avgScores[st.id]}</div>
        </div>
      ))}
    </div>
    {collabCrmFilterStage&&<div style={{marginTop:8,display:"flex",justifyContent:"flex-end"}}><span onClick={()=>{(typeof setCollabCrmFilterStage==='function'?setCollabCrmFilterStage:function(){})("");setCollabCrmPage(0);}} style={{fontSize:11,color:"#EF4444",cursor:"pointer",fontWeight:600}}>✕ Effacer filtre étape</span></div>}
  </Card>

  {/* Search + Filters */}
  <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
    <div style={{flex:1,minWidth:200}}><Input placeholder="Rechercher par nom, email, téléphone..." icon="search" value={crmSearch} onChange={e=>{(typeof setCrmSearch==='function'?setCrmSearch:function(){})(e.target.value);setCollabCrmPage(0);}}/></div>
    <select value={collabCrmFilterFollowup} onChange={e=>{(typeof setCollabCrmFilterFollowup==='function'?setCollabCrmFilterFollowup:function(){})(Number(e.target.value));setCollabCrmPage(0);}} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${collabCrmFilterFollowup>0?"#EF4444":T.border}`,background:collabCrmFilterFollowup>0?"#EF444408":T.surface,color:collabCrmFilterFollowup>0?"#EF4444":T.text,fontSize:12,fontWeight:500,fontFamily:"inherit",cursor:"pointer"}}>
      <option value={0}>À relancer</option>
      <option value={7}>+7 jours sans contact</option>
      <option value={14}>+14 jours sans contact</option>
      <option value={30}>+30 jours sans contact</option>
    </select>
    <Btn small onClick={()=>(typeof setCollabCrmAdvOpen==='function'?setCollabCrmAdvOpen:function(){})(!collabCrmAdvOpen)} style={{background:collabCrmAdvOpen||(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).scoreRange||(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).hasEmail!==null||(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).hasPhone!==null?T.accent+"12":"transparent",color:collabCrmAdvOpen?T.accent:T.text3,borderColor:collabCrmAdvOpen?T.accent+"44":T.border}}><I n="sliders" s={13}/> Filtres</Btn>
    <div style={{position:'relative'}}>
      <Btn small onClick={()=>(typeof setCrmColPanelOpen==='function'?setCrmColPanelOpen:function(){})(!crmColPanelOpen)} style={{background:crmColPanelOpen?T.accent+'12':'transparent',color:crmColPanelOpen?T.accent:T.text3,borderColor:crmColPanelOpen?T.accent+'44':T.border}}><I n="columns" s={13}/> Colonnes</Btn>
      {(typeof crmColPanelOpen!=='undefined'?crmColPanelOpen:null)&&<div style={{position:'absolute',top:'100%',right:0,zIndex:99,background:T.card,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',padding:12,minWidth:220,marginTop:4}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:8,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span>⚙️ Colonnes</span>
          <span onClick={()=>setCrmColPanelOpen(false)} style={{cursor:'pointer',color:T.text3}}><I n="x" s={14}/></span>
        </div>
        <div style={{fontSize:9,color:T.text3,marginBottom:8}}>Glissez pour réordonner · Cochez pour afficher</div>
        <div style={{fontSize:9,fontWeight:700,color:T.accent,textTransform:'uppercase',letterSpacing:.5,marginBottom:4,marginTop:4}}>Champs standards</div>
        {crmEffectiveOrder.map((colK,idx)=>{
          const col=CRM_ALL_COLS.find(c=>c.k===colK);
          if(!col||col.isCustom) return null;
          const isHidden=crmEffectiveHidden.includes(colK);
          return <div key={colK}
            draggable={!col.fixed}
            onDragStart={()=>setCrmDragCol(idx)}
            onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderTop='2px solid '+T.accent;}}
            onDragLeave={e=>{e.currentTarget.style.borderTop='none';}}
            onDrop={e=>{e.currentTarget.style.borderTop='none';if(crmDragCol===null||crmDragCol===idx)return;const newOrder=[...((typeof crmColConfig!=='undefined'?crmColConfig:{}).order||CRM_ALL_COLS.map(c=>c.k))];const [moved]=newOrder.splice(crmDragCol,1);newOrder.splice(idx,0,moved);saveCrmColConfig({...crmColConfig,order:newOrder});(typeof setCrmDragCol==='function'?setCrmDragCol:function(){})(null);}}
            style={{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',borderRadius:8,marginBottom:2,cursor:col.fixed?'default':'grab',background:(typeof crmDragCol!=='undefined'?crmDragCol:null)===idx?T.accentBg:T.surface,transition:'all .15s',border:`1px solid ${crmDragCol===idx?T.accent+'44':'transparent'}`}} onMouseEnter={e=>{if(!col.fixed)e.currentTarget.style.background=T.accentBg;}} onMouseLeave={e=>{if(!col.fixed&&(typeof crmDragCol!=='undefined'?crmDragCol:null)!==idx)e.currentTarget.style.background=T.surface;}}>
            {!col.fixed&&<div style={{display:'flex',flexDirection:'column',gap:0,flexShrink:0,cursor:'grab'}}>
              <I n="grip-vertical" s={14} style={{color:T.accent,opacity:0.6}}/>
            </div>}
            {!col.fixed&&<div style={{display:'flex',flexDirection:'column',gap:0,flexShrink:0,marginLeft:-2}}>
              <span onClick={e=>{e.stopPropagation();if(idx<=0)return;const newOrder=[...((typeof crmColConfig!=='undefined'?crmColConfig:{}).order||CRM_ALL_COLS.map(c=>c.k))];[newOrder[idx-1],newOrder[idx]]=[newOrder[idx],newOrder[idx-1]];saveCrmColConfig({...crmColConfig,order:newOrder});}} style={{cursor:idx>0?'pointer':'default',fontSize:9,lineHeight:1,color:idx>0?T.accent:T.border,padding:'0 2px'}}>▲</span>
              <span onClick={e=>{e.stopPropagation();const order=(typeof crmColConfig!=='undefined'?crmColConfig:{}).order||CRM_ALL_COLS.map(c=>c.k);if(idx>=order.length-1)return;const newOrder=[...order];[newOrder[idx],newOrder[idx+1]]=[newOrder[idx+1],newOrder[idx]];saveCrmColConfig({...crmColConfig,order:newOrder});}} style={{cursor:idx<((typeof crmColConfig!=='undefined'?crmColConfig:{}).order||CRM_ALL_COLS).length-1?'pointer':'default',fontSize:9,lineHeight:1,color:idx<((typeof crmColConfig!=='undefined'?crmColConfig:{}).order||CRM_ALL_COLS).length-1?T.accent:T.border,padding:'0 2px'}}>▼</span>
            </div>}
            {col.fixed&&<span style={{width:28}}/>}
            <input type="checkbox" checked={!isHidden} disabled={col.fixed} onChange={()=>{const h=[...((typeof crmColConfig!=='undefined'?crmColConfig:{}).hidden||[])];if(isHidden){const i=h.indexOf(colK);if(i>-1)h.splice(i,1);}else{h.push(colK);}saveCrmColConfig({...crmColConfig,hidden:h});}} style={{accentColor:T.accent,cursor:col.fixed?'default':'pointer'}}/>
            <span style={{fontSize:12,fontWeight:col.fixed?700:500,color:isHidden?T.text3:T.text,flex:1}}>{col.l}</span>
            {col.fixed&&<span style={{fontSize:8,color:T.text3}}>fixe</span>}
          </div>;
        })}
        {/* Section champs personnalisés */}
        {CRM_ALL_COLS.some(c=>c.isCustom) && <>
          <div style={{fontSize:9,fontWeight:700,color:'#8B5CF6',textTransform:'uppercase',letterSpacing:.5,marginBottom:4,marginTop:8,paddingTop:6,borderTop:`1px solid ${T.border}`}}>Champs personnalisés</div>
          {crmEffectiveOrder.filter(k=>k.startsWith('cf_')).map((colK,idx)=>{
            const col=CRM_ALL_COLS.find(c=>c.k===colK);
            if(!col) return null;
            const isHidden=crmEffectiveHidden.includes(colK);
            const TYPES={text:'Abc',number:'123',date:'📅',boolean:'✓/✗'};
            return <div key={colK} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',borderRadius:8,marginBottom:2,background:T.surface}}>
              <input type="checkbox" checked={!isHidden} onChange={()=>{
                const h=[...((typeof crmColConfig!=='undefined'?crmColConfig:{}).hidden||[])];
                let order=[...((typeof crmColConfig!=='undefined'?crmColConfig:{}).order||CRM_STD_COLS.map(c=>c.k))];
                if(isHidden){const i=h.indexOf(colK);if(i>-1)h.splice(i,1);if(!order.includes(colK))order.push(colK);}
                else{h.push(colK);}
                saveCrmColConfig({...crmColConfig,order,hidden:h});
              }} style={{accentColor:'#8B5CF6',cursor:'pointer'}}/>
              <span style={{fontSize:12,fontWeight:500,color:isHidden?T.text3:T.text,flex:1}}>{col.l}</span>
              <span style={{fontSize:9,color:'#8B5CF6',fontWeight:600}}>{TYPES[col.fieldType]||'Abc'}</span>
            </div>;
          })}
        </>}
        <div style={{borderTop:`1px solid ${T.border}`,paddingTop:6,marginTop:6}}>
          <span onClick={()=>{saveCrmColConfig({order:CRM_STD_COLS.map(c=>c.k),hidden:[]});}} style={{fontSize:10,color:T.accent,cursor:'pointer',fontWeight:600}}>↺ Réinitialiser</span>
        </div>
      </div>}
    </div>
  </div>
  {/* Advanced filters bar */}
  {(typeof collabCrmAdvOpen!=='undefined'?collabCrmAdvOpen:null) && (
    <div style={{display:"flex",gap:8,marginBottom:12,padding:"10px 14px",borderRadius:10,background:T.bg,border:`1px solid ${T.border}`,flexWrap:"wrap",alignItems:"center"}}>
      {/* Filtre Étape */}
      <span style={{fontSize:11,fontWeight:600,color:T.text3}}>Étape:</span>
      <select value={collabCrmFilterStage||''} onChange={e=>{(typeof setCollabCrmFilterStage==='function'?setCollabCrmFilterStage:function(){})(e.target.value);setCollabCrmPage(0);}} style={{padding:'4px 8px',borderRadius:8,border:`1px solid ${T.border}`,fontSize:11,background:T.surface,color:T.text,fontFamily:'inherit',cursor:'pointer'}}>
        <option value="">Toutes</option>
        {PIPELINE_STAGES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      {/* Filtre Score */}
      <span style={{fontSize:11,fontWeight:600,color:T.text3,marginLeft:6}}>Score:</span>
      {[{id:'',label:'Tous'},{id:'hot',label:'Chaud',c:'#22C55E'},{id:'warm',label:'Tiède',c:'#F59E0B'},{id:'cold',label:'Froid',c:'#EF4444'}].map(f=>(
        <div key={f.id} onClick={()=>{(typeof setCollabCrmAdvFilters==='function'?setCollabCrmAdvFilters:function(){})(p=>({...p,scoreRange:p.scoreRange===f.id?'':f.id}));setCollabCrmPage(0);}} style={{padding:"3px 8px",borderRadius:12,fontSize:10,fontWeight:600,cursor:"pointer",background:(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).scoreRange===f.id?(f.c||T.accent)+"18":T.surface,color:(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).scoreRange===f.id?(f.c||T.accent):T.text3,border:`1px solid ${(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).scoreRange===f.id?(f.c||T.accent)+"44":T.border}`}}>{f.label}</div>
      ))}
      {/* Filtre Période création */}
      <span style={{fontSize:11,fontWeight:600,color:T.text3,marginLeft:6}}>Créé:</span>
      <select value={(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{})._createdPeriod||''} onChange={e=>{(typeof setCollabCrmAdvFilters==='function'?setCollabCrmAdvFilters:function(){})(p=>({...p,_createdPeriod:e.target.value}));setCollabCrmPage(0);}} style={{padding:'4px 8px',borderRadius:8,border:`1px solid ${T.border}`,fontSize:11,background:T.surface,color:T.text,fontFamily:'inherit',cursor:'pointer'}}>
        <option value="">Toutes dates</option>
        <option value="today">Aujourd'hui</option>
        <option value="7d">7 derniers jours</option>
        <option value="30d">30 derniers jours</option>
        <option value="90d">3 derniers mois</option>
      </select>
      {/* Filtre date personnalisée */}
      <input type="date" value={(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{})._createdFrom||''} onChange={e=>{(typeof setCollabCrmAdvFilters==='function'?setCollabCrmAdvFilters:function(){})(p=>({...p,_createdFrom:e.target.value,_createdPeriod:''}));setCollabCrmPage(0);}} style={{padding:'3px 6px',borderRadius:8,border:`1px solid ${T.border}`,fontSize:10,background:T.surface,color:T.text,fontFamily:'inherit'}} title="Du"/>
      <span style={{fontSize:10,color:T.text3}}>→</span>
      <input type="date" value={(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{})._createdTo||''} onChange={e=>{(typeof setCollabCrmAdvFilters==='function'?setCollabCrmAdvFilters:function(){})(p=>({...p,_createdTo:e.target.value,_createdPeriod:''}));setCollabCrmPage(0);}} style={{padding:'3px 6px',borderRadius:8,border:`1px solid ${T.border}`,fontSize:10,background:T.surface,color:T.text,fontFamily:'inherit'}} title="Au"/>
      {/* Reset */}
      {((typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).scoreRange||(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).hasEmail!==null||(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).hasPhone!==null||collabCrmFilterStage||(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{})._createdPeriod||(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{})._createdFrom)&&<span onClick={()=>{(typeof setCollabCrmAdvFilters==='function'?setCollabCrmAdvFilters:function(){})({scoreRange:'',hasEmail:null,hasPhone:null,_createdPeriod:'',_createdFrom:'',_createdTo:''});(typeof setCollabCrmFilterStage==='function'?setCollabCrmFilterStage:function(){})('');setCollabCrmPage(0);}} style={{fontSize:11,color:"#EF4444",cursor:"pointer",fontWeight:600,marginLeft:6}}>✕ Reset</span>}
    </div>
  )}
  {/* Active filters summary */}
  {(typeof collabCrmFilterFollowup!=='undefined'?collabCrmFilterFollowup:null)>0&&(
    <div style={{display:"flex",gap:6,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
      <span onClick={()=>{(typeof setCollabCrmFilterFollowup==='function'?setCollabCrmFilterFollowup:function(){})(0);setCollabCrmPage(0);}} style={{padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",background:"#EF444418",color:"#EF4444"}}>✕ +{collabCrmFilterFollowup}j sans contact</span>
    </div>
  )}
  {collabContactTags.length > 0 && (
    <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
      {collabContactTags.map(t => (
        <div key={t} onClick={() => (typeof setCollabCrmFilterTags==='function'?setCollabCrmFilterTags:function(){})(p => p.includes(t)?p.filter(x=>x!==t):[...p,t])} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer", background:(typeof collabCrmFilterTags!=='undefined'?collabCrmFilterTags:{}).includes(t)?"#7C3AED18":T.bg, color:(typeof collabCrmFilterTags!=='undefined'?collabCrmFilterTags:{}).includes(t)?"#7C3AED":T.text3, border:`1px solid ${(typeof collabCrmFilterTags!=='undefined'?collabCrmFilterTags:{}).includes(t)?"#7C3AED44":T.border}` }}>{t}</div>
      ))}
      {(typeof collabCrmFilterTags!=='undefined'?collabCrmFilterTags:{}).length > 0 && <div onClick={() => (typeof setCollabCrmFilterTags==='function'?setCollabCrmFilterTags:function(){})([])} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer", color:"#EF4444" }}>Effacer filtres</div>}
    </div>
  )}

  {/* Bulk Actions Bar */}
  {(typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).length > 0 && (
    <Card style={{padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12,background:T.accentBg,border:`1.5px solid ${T.accent}44`,flexWrap:"wrap"}}>
      <span style={{fontSize:14,fontWeight:700,color:T.accent}}>{(typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).length} sélectionné{(typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).length>1?"s":""} sur {filteredCollabCrm.length}</span>
      <select value={collabCrmBulkStage} onChange={e=>(typeof setCollabCrmBulkStage==='function'?setCollabCrmBulkStage:function(){})(e.target.value)} style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:12,fontFamily:"inherit"}}>
        <option value="">Changer étape…</option>
        {PIPELINE_STAGES.map(st=><option key={st.id} value={st.id}>{st.label}</option>)}
      </select>
      {(typeof collabCrmBulkStage!=='undefined'?collabCrmBulkStage:null) && <Btn small primary onClick={()=>{
        (typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).forEach(id=>{
          handleCollabUpdateContact(id, { pipeline_stage:(typeof collabCrmBulkStage!=='undefined'?collabCrmBulkStage:null) });
        });
        showNotif(`${(typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).length} contacts → ${PIPELINE_STAGES.find(s=>s.id===collabCrmBulkStage)?.label}`);
        setCollabCrmSelectedIds([]);setCollabCrmBulkStage("");setCollabCrmAdvFilters(p=>({...p,_selectAll:false}));
      }}>Appliquer</Btn>}
      <Btn small style={{color:"#EF4444",borderColor:"#EF444430"}} onClick={()=>{
        const reason = prompt('Motif pour classer '+(typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).length+' lead(s) en Perdu :');
        if(!reason||!reason.trim()){showNotif('Motif obligatoire','danger');return;}
        (typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).forEach(id=>handlePipelineStageChange(id,'perdu',reason.trim()));
        showNotif((typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).length+' leads classes en Perdu');
        setCollabCrmSelectedIds([]);setCollabCrmAdvFilters(p=>({...p,_selectAll:false}));
      }}><I n="archive" s={12}/> Classer Perdu</Btn>
      {collab?.can_delete_contacts ? (()=>{
        // V5-Fix: collab non-admin ne peut supprimer que SES contacts
        const isAdm = collab?.role === 'admin' || collab?.role === 'supra';
        const deletableIds = isAdm ? collabCrmSelectedIds : (typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).filter(id => { const ct = (contacts||[]).find(c=>c.id===id); return ct && ct.assignedTo === collab?.id; });
        const skippedCount = (typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).length - deletableIds.length;
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
      {collab?.can_delete_contacts && (typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{})._selectAll && <Btn small style={{color:"#fff",background:"#EF4444",borderColor:"#EF444430"}} onClick={async()=>{
        if(!confirm('ATTENTION : Supprimer TOUS les '+filteredCollabCrm.length+' contacts ? Cette action est irréversible.'))return;
        if(!confirm('Dernière confirmation : supprimer définitivement '+filteredCollabCrm.length+' contacts ?'))return;
        const r=await api("/api/data/contacts/bulk-delete",{method:"POST",body:{contactIds:filteredCollabCrm.map(c=>c.id),companyId:company.id,origin:'crm_bulk_all'}});
        if(r?.success){setContacts(p=>p.filter(c=>!filteredCollabCrm.some(fc=>fc.id===c.id)));showNotif((r.deleted||0)+' supprimés, '+(r.archived||0)+' archivés');setCollabCrmSelectedIds([]);setCollabCrmAdvFilters(p=>({...p,_selectAll:false}));}else{showNotif('Erreur suppression','danger');}
      }}><I n="trash-2" s={12}/> Supprimer tout ({filteredCollabCrm.length})</Btn>}
      <span onClick={()=>{setCollabCrmSelectedIds([]);setCollabCrmAdvFilters(p=>({...p,_selectAll:false}));}} style={{marginLeft:"auto",cursor:"pointer",fontSize:12,color:T.text3,fontWeight:500}}>✕ Désélectionner</span>
    </Card>
  )}

  {/* ═══ TABLE VIEW ═══ */}
  {collabCrmViewMode === "table" ? (
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
                    <input type="checkbox" checked={(typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).length>0&&(typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).length===filteredCollabCrm.length} onChange={e=>{if(e.target.checked){(typeof setCollabCrmSelectedIds==='function'?setCollabCrmSelectedIds:function(){})(filteredCollabCrm.map(c=>c.id));setCollabCrmAdvFilters(p=>({...p,_selectAll:true}));}else{(typeof setCollabCrmSelectedIds==='function'?setCollabCrmSelectedIds:function(){})([]);setCollabCrmAdvFilters(p=>({...p,_selectAll:false}));}}} style={{cursor:"pointer",accentColor:T.accent}} title={(typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).length>0?"Tout désélectionner":"Tout sélectionner ("+filteredCollabCrm.length+" contacts)"}/>
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
                      <input type="checkbox" checked={(typeof collabCrmSelectedIds!=='undefined'?collabCrmSelectedIds:{}).includes(ct.id)} onChange={e=>(typeof setCollabCrmSelectedIds==='function'?setCollabCrmSelectedIds:function(){})(p=>e.target.checked?[...p,ct.id]:p.filter(x=>x!==ct.id))} style={{cursor:"pointer",accentColor:T.accent}}/>
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
                Page {(typeof collabCrmPage!=='undefined'?collabCrmPage:null)+1} / {collabCrmTotalPages} <span style={{fontWeight:400,color:T.text3}}>({filteredCollabCrm.length} contacts)</span>
              </span>
              <Btn small disabled={collabCrmPage>=collabCrmTotalPages-1} onClick={()=>(typeof setCollabCrmPage==='function'?setCollabCrmPage:function(){})(p=>p+1)}><I n="chevron-right" s={14}/></Btn>
              <Btn small disabled={collabCrmPage>=collabCrmTotalPages-1} onClick={()=>(typeof setCollabCrmPage==='function'?setCollabCrmPage:function(){})(collabCrmTotalPages-1)} title="Dernière page"><I n="chevrons-right" s={14}/></Btn>
            </div>
          )}
        </>
      )}
    </>
  ) : (typeof collabCrmViewMode!=='undefined'?collabCrmViewMode:null) === "pipeline" ? (
    /* ═══ PIPELINE KANBAN VIEW ═══ */
    <>
    {/* ── Bulk action bar ── */}
    {(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length > 0 && (
      <Card style={{padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12,background:T.accentBg,border:`1.5px solid ${T.accent}44`,flexWrap:"wrap",position:'sticky',top:0,zIndex:10}}>
        <span style={{fontWeight:700,fontSize:13,color:T.accent}}>{(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length} sélectionné{(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length>1?'s':''}</span>
        <select value={pipeBulkStage} onChange={e => (typeof setPipeBulkStage==='function'?setPipeBulkStage:function(){})(e.target.value)} style={{padding:"4px 8px",borderRadius:8,border:`1px solid ${T.border}`,fontSize:12,background:T.surface,color:T.text}}>
          <option value="">Déplacer vers…</option>
          {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {(typeof pipeBulkStage!=='undefined'?pipeBulkStage:null) && <Btn small primary onClick={() => {
          const MODAL_STAGES = ['rdv_programme','client_valide'];
          const ids = (typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).filter(id => { const c=(contacts||[]).find(x=>x.id===id); return c && c.pipeline_stage !== (typeof pipeBulkStage!=='undefined'?pipeBulkStage:null); });
          if(ids.length===0){showNotif('Aucun contact à déplacer','info');return;}
          if(MODAL_STAGES.includes((typeof pipeBulkStage!=='undefined'?pipeBulkStage:null))){showNotif('Ce stage nécessite une action individuelle (RDV ou contrat)','info');return;}
          let note = '';
          if((typeof pipeBulkStage!=='undefined'?pipeBulkStage:null)==='perdu'){note=prompt('Raison de la perte (tous les contacts) :')||'Classé perdu en masse';}
          if((typeof pipeBulkStage!=='undefined'?pipeBulkStage:null)==='qualifie'){note=prompt('Note de qualification :')||'Qualifié en masse';}
          ids.forEach(id => handlePipelineStageChange(id, pipeBulkStage, note));
          showNotif(`${ids.length} contact${ids.length>1?'s':''} déplacé${ids.length>1?'s':''} → ${PIPELINE_STAGES.find(s=>s.id===pipeBulkStage)?.label||pipeBulkStage}`,'success');
          setPipeSelectedIds([]); setPipeBulkStage('');
        }}><I n="arrow-right" s={12}/> Déplacer</Btn>}
        <Btn small onClick={() => {
          const tag = prompt('Tag à ajouter :');
          if(!tag||!tag.trim()) return;
          (typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).forEach(id => { const c=(contacts||[]).find(x=>x.id===id); if(c) handleCollabUpdateContact(id, {tags:[...(c.tags||[]),tag.trim()]}); });
          showNotif(`Tag "${tag.trim()}" ajouté à ${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length} contact${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length>1?'s':''}`,'success');
          setPipeSelectedIds([]);
        }}><I n="tag" s={12}/> Tag</Btn>
        {/* Couleur en masse */}
        <select onChange={e=>{const v=e.target.value;if(!v)return;const allColors=[...PIPELINE_CARD_COLORS_DEFAULT,...JSON.parse(localStorage.getItem('pipeline_custom_colors')||'[]')];const pc=allColors.find(c=>(c.color||'')===(v==='none'?'':v));if(!pc)return;(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).forEach(id=>handleCollabUpdateContact(id,{card_color:pc.color||'',card_label:pc.color?pc.label:''}));showNotif(`Couleur "${pc.label}" appliquée à ${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length} contact${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length>1?'s':''}`,'success');e.target.value='';}} style={{padding:"4px 8px",borderRadius:8,border:`1px solid ${T.border}`,fontSize:12,background:T.surface,color:T.text}}>
          <option value="">Couleur…</option>
          {[...PIPELINE_CARD_COLORS_DEFAULT,...JSON.parse(localStorage.getItem('pipeline_custom_colors')||'[]')].map(pc=><option key={pc.color+pc.label} value={pc.color||'none'}>● {pc.label}</option>)}
        </select>
        <Btn small ghost danger onClick={() => {
          if(!confirm(`Supprimer ${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length} contact${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length>1?'s':''} ? Cette action est irréversible.`)) return;
          const _delIds = [...pipeSelectedIds];
          api('/api/data/contacts/bulk-delete',{method:'POST',body:{contactIds:_delIds,companyId:company?.id,origin:'pipeline'}}).then(()=>{
            const deletedSet = new Set(_delIds);
            setContacts(p=>p.filter(c=>!deletedSet.has(c.id)));
            if(contactsRef) contactsRef.current = (contactsRef.current||[]).filter(c=>!deletedSet.has(c.id));
            contactsLocalEditRef.current = Date.now();
            setTimeout(()=>{contactsLocalEditRef.current=0;},60000);
            showNotif(`${_delIds.length} contact${_delIds.length>1?'s':''} supprimé${_delIds.length>1?'s':''}`,'success');
            setPipeSelectedIds([]);
          }).catch(()=>showNotif('Erreur suppression','danger'));
        }}><I n="trash-2" s={12}/> Supprimer</Btn>
        <span onClick={() => setPipeSelectedIds([])} style={{marginLeft:"auto",cursor:"pointer",fontSize:12,color:T.text3,fontWeight:600}}>✕ Tout désélectionner</span>
      </Card>
    )}
    <BulkSmsModal />
    <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:12,minHeight:400}}>
      {orderedStages.map(stage => {
        // V5: Tri — rdv par date ASC, nrp par relance ASC, toutes les autres par updatedAt DESC (dernier modifie en haut)
        const stageContacts = filteredCollabCrm.filter(c => (c.pipeline_stage||"nouveau") === stage.id).sort((a,b)=>{if(stage.id==='rdv_programme')return(a.next_rdv_date||'9999').localeCompare(b.next_rdv_date||'9999');if(stage.id==='nrp')return(a.nrp_next_relance||'9999').localeCompare(b.nrp_next_relance||'9999');return(b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||'');});
        const isDragOver = (typeof dragOverStage!=='undefined'?dragOverStage:null) === stage.id && dragContact && ((typeof dragContact!=='undefined'?dragContact:{}).pipeline_stage||"nouveau") !== stage.id;
        const isColumnDragOver = (typeof dragColumnId!=='undefined'?dragColumnId:null) && (typeof dragColumnId!=='undefined'?dragColumnId:null) !== stage.id;
        return (
          <div key={stage.id} style={{flex:"1 0 220px",minWidth:220,maxWidth:300,display:"flex",flexDirection:"column"}}
            onDragOver={e => { if(e.dataTransfer.types.includes('columnid')){e.preventDefault();e.currentTarget.style.borderLeft='3px solid '+stage.color;} else handleDragOver(e, stage.id); }}
            onDragLeave={e => { e.currentTarget.style.borderLeft='none'; handleDragLeave(e, stage.id); }}
            onDrop={e => { if(e.dataTransfer.getData('columnId')){handleColumnDrop(e,stage.id);e.currentTarget.style.borderLeft='none';} else handleDrop(e, stage.id); }}
          >
            <div draggable={!pipelineReadOnly} onDragStart={pipelineReadOnly ? undefined : e=>handleColumnDragStart(e,stage.id)} onDragEnd={pipelineReadOnly ? undefined : handleColumnDragEnd} style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,padding:"10px 12px",borderRadius:10,background:stage.color+"12",border:`2px solid ${isDragOver?stage.color:stage.color+"20"}`,transition:"all .2s",cursor:pipelineReadOnly?'default':'grab'}}>
              {!pipelineReadOnly && (<div style={{display:'flex',flexDirection:'column',gap:1,opacity:0.4,cursor:'grab',flexShrink:0}} title="Glisser pour réorganiser">
                <div style={{display:'flex',gap:1}}><div style={{width:3,height:3,borderRadius:'50%',background:stage.color}}/><div style={{width:3,height:3,borderRadius:'50%',background:stage.color}}/></div>
                <div style={{display:'flex',gap:1}}><div style={{width:3,height:3,borderRadius:'50%',background:stage.color}}/><div style={{width:3,height:3,borderRadius:'50%',background:stage.color}}/></div>
                <div style={{display:'flex',gap:1}}><div style={{width:3,height:3,borderRadius:'50%',background:stage.color}}/><div style={{width:3,height:3,borderRadius:'50%',background:stage.color}}/></div>
              </div>)}
              <div style={{width:8,height:8,borderRadius:"50%",background:stage.color,flexShrink:0}}/>
              <span title={stage.label} style={{fontSize:13,fontWeight:700,color:stage.color,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{stage.label}</span>
              {stage.id==='nouveau'&&<div onClick={(e)=>{e.stopPropagation();setShowNewContact(true);}} style={{width:22,height:22,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",background:"#22C55E",color:"#fff",flexShrink:0,boxShadow:"0 1px 3px #22C55E40",transition:"transform .15s"}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.15)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'} title="Ajouter un nouveau contact"><I n="user-plus" s={12}/></div>}
              {stage.id==='nrp'&&(()=>{const totalNrp=stageContacts.reduce((sum,c)=>{try{return sum+JSON.parse(c.nrp_followups_json||'[]').filter(f=>f.done).length;}catch{return sum;}},0);return totalNrp>0?<span style={{fontSize:9,fontWeight:800,color:'#fff',background:'#EF4444',borderRadius:10,padding:'1px 6px',minWidth:18,textAlign:'center',lineHeight:'16px'}} title={'Total tentatives NRP: '+totalNrp}>{totalNrp} tent.</span>:null;})()}
              <Badge color={stage.color}>{stageContacts.length}</Badge>
              {stageContacts.length>0&&<input type="checkbox" checked={stageContacts.every(c=>(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).includes(c.id))} onChange={e=>{e.stopPropagation();if(e.target.checked){(typeof setPipeSelectedIds==='function'?setPipeSelectedIds:function(){})(p=>[...new Set([...p,...stageContacts.map(c=>c.id)])]);}else{const stIds=new Set(stageContacts.map(c=>c.id));(typeof setPipeSelectedIds==='function'?setPipeSelectedIds:function(){})(p=>p.filter(id=>!stIds.has(id)));}}} onClick={e=>e.stopPropagation()} title={`Sélectionner tout ${stage.label}`} style={{cursor:'pointer',accentColor:stage.color,width:14,height:14,flexShrink:0}}/>}
              {pipelineReadOnly ? (
                <div style={{width:22,height:22,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",color:T.text3,fontSize:10}} title="Pipeline imposé par template — non modifiable"><I n="lock" s={10}/></div>
              ) : stage.isCore ? (
                <div style={{width:22,height:22,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",color:T.text3,fontSize:10}} title="Colonne système (non modifiable)"><I n="lock" s={10}/></div>
              ) : stage.isDefault && !stage.isCore ? (
                <div style={{display:"flex",gap:2}}>
                  <div onClick={()=>{setEditingStage(stage);setEditStageForm({label:stage.label,color:stage.color});}} style={{width:22,height:22,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:stage.color,background:stage.color+"18"}} title="Renommer"><I n="edit-2" s={11}/></div>
                </div>
              ) : (
                <div style={{display:"flex",gap:2}}>
                  <div onClick={()=>{setEditingStage(stage);setEditStageForm({label:stage.label,color:stage.color});}} style={{width:22,height:22,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:stage.color,background:stage.color+"18"}} title="Modifier"><I n="edit-2" s={11}/></div>
                  <div onClick={()=>setConfirmDeleteStage(stage)} style={{width:22,height:22,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#EF4444",background:"#EF444418"}} title="Supprimer"><I n="trash-2" s={11}/></div>
                </div>
              )}
            </div>
            {isDragOver && (
              <div style={{padding:10,marginBottom:8,borderRadius:10,border:`2px dashed ${stage.color}`,background:stage.color+"08",textAlign:"center",fontSize:12,fontWeight:600,color:stage.color}}>
                <I n="arrow-down" s={14}/> Déposer ici
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:8,flex:1}}>
              {stageContacts.map(ct => {
                const _todayS=new Date().toISOString().split('T')[0];
                const _liveRdv=(bookings||[]).filter(b=>b.contactId===ct.id&&b.status==='confirmed'&&b.date>=_todayS).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0]||null;
                const _catObj=_liveRdv?.rdv_category&&RDV_CATEGORIES[_liveRdv.rdv_category]||null;
                const _subObj=_catObj&&_liveRdv.rdv_subcategory&&_catObj.subcategories[_liveRdv.rdv_subcategory]||null;
                const _borderColor=ct.card_color||stage.color;
                const _hasCColor=!!ct.card_color;
                // Contact Share V1 — bordure orange si partagé avec/par ce collab
                const _isSharedCrm = !!(ct.sharedWithId && collab?.id && (ct.sharedWithId === collab.id || ct.sharedById === collab.id));
                const _isPipeSelected = (typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).includes(ct.id);
                const _isCrmSelected = (typeof selectedCrmContact!=='undefined'?selectedCrmContact:null)?.id === ct.id || (typeof pipelineRightContact!=='undefined'?pipelineRightContact:null)?.id === ct.id;
                // V5: Détection contact fraichement arrive dans cette colonne (< 30 min)
                const _newLeadTs = ct.updatedAt || ct.createdAt || '';
                const _isNewLead = _newLeadTs && (Date.now() - new Date(_newLeadTs).getTime()) < 30 * 60000;
                // Détection RDV passé — si rdv_programme et date RDV < maintenant
                const _isRdvPasse = ct.pipeline_stage==='rdv_programme' && (()=>{
                  const todayS=new Date().toISOString().split('T')[0];
                  const nowMs=Date.now();
                  const liveRdv=(bookings||[]).filter(b=>b.contactId===ct.id&&b.status==='confirmed').sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
                  const rdvDateStr=liveRdv?liveRdv.date+(liveRdv.time?'T'+liveRdv.time:'T23:59'):ct.next_rdv_date;
                  if(!rdvDateStr)return false;
                  return new Date(rdvDateStr).getTime() < nowMs;
                })();
                return <Card key={ct.id}
                  draggable={ct._linked}
                  onDragStart={e => handleDragStart(e, ct)}
                  onDragEnd={handleDragEnd}
                  style={{padding:12,cursor:ct._linked?"grab":"pointer",border:_isRdvPasse?'2px solid #F97316':_isCrmSelected?`2.5px solid ${T.accent}`:_hasCColor?`2.5px solid ${ct.card_color}`:_isPipeSelected?`2px solid ${T.accent}`:`1px solid ${T.border}`,borderLeft:_isRdvPasse?'5px solid #F97316':_isCrmSelected?`5px solid ${T.accent}`:_hasCColor?`6px solid ${ct.card_color}`:_isSharedCrm?'5px solid #F97316':`4px solid ${stage.color}`,background:_isRdvPasse?'linear-gradient(135deg, #F9731612 0%, #F9731604 60%, transparent 100%)':_isCrmSelected?T.accent+'08':_isPipeSelected?T.accentBg:_hasCColor?`linear-gradient(135deg, ${ct.card_color}30 0%, ${ct.card_color}08 60%, transparent 100%)`:undefined,transition:"all .2s",transform:(typeof dragContact!=='undefined'?dragContact:null)?.id===ct.id?"scale(0.95) rotate(1deg)":"none",opacity:(typeof dragContact!=='undefined'?dragContact:null)?.id===ct.id?0.6:1,userSelect:"none",boxShadow:_isRdvPasse?'0 3px 12px #F9731625':_isCrmSelected?`0 4px 16px ${T.accent}25`:_hasCColor?`0 3px 12px ${ct.card_color}30`:'none',borderRadius:14,position:'relative'}}
                  onClick={() => {if(!(typeof dragContact!=='undefined'?dragContact:null)){
                    // Si RDV passé → popup obligatoire avant fiche
                    if(_isRdvPasse){
                      const liveRdv2=(bookings||[]).filter(b=>b.contactId===ct.id&&b.status==='confirmed').sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
                      setRdvPasseModal({contact:ct,rdvDate:liveRdv2?.date||ct.next_rdv_date,bookingId:liveRdv2?.id||ct.next_rdv_booking_id});
                      return;
                    }
                    setPipelineRightContact(ct);setPipelineRightTab('fiche');api('/api/data/pipeline-history?contactId='+ct.id).then(h=>setPipelinePopupHistory(h||[])).catch(()=>setPipelinePopupHistory([]));
                  }}}
                >
                  {/* Checkbox sélection multiple */}
                  <input type="checkbox" checked={_isPipeSelected} onChange={e=>{e.stopPropagation();setPipeSelectedIds(p=>e.target.checked?[...p,ct.id]:p.filter(x=>x!==ct.id));}} onClick={e=>e.stopPropagation()} style={{position:'absolute',top:8,right:8,cursor:'pointer',accentColor:T.accent,zIndex:2,width:15,height:15}}/>
                  {/* V5: Signal nouveau lead — etoile discrete */}
                  {_isNewLead && <div style={{display:'inline-flex',alignItems:'center',gap:4,marginBottom:5,padding:'2px 8px',borderRadius:6,background:'#FEF3C7',opacity:0,animation:'fadeIn .4s ease forwards'}}>
                    <span style={{fontSize:11}}>&#11088;</span>
                    <span style={{fontSize:10,fontWeight:700,color:'#B45309'}}>Nouveau</span>
                    <span style={{fontSize:9,color:'#D97706'}}>{_newLeadTs?new Date(_newLeadTs).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</span>
                  </div>}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    {ct._linked&&<div style={{cursor:"grab",color:T.text3,flexShrink:0,display:"flex",alignItems:"center"}} title="Glisser-déposer"><I n="move" s={14}/></div>}
                    <Avatar name={ct.name} color={_borderColor} size={28}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <span title={ct.name} style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ct.name}</span>
                        {ct.contact_type==='btb'&&<I n="building-2" s={11} style={{color:'#2563EB',flexShrink:0}} title="Entreprise"/>}
                        {ct._shared&&<span style={{padding:"1px 5px",borderRadius:8,fontSize:8,fontWeight:700,background:"#F9731618",color:"#F97316",flexShrink:0}}>Partagé</span>}
                        {_isSharedCrm && (() => {
                          const otherId = ct.sharedById === collab?.id ? ct.sharedWithId : ct.sharedById;
                          const other = (collabs||[]).find(cc=>cc.id===otherId);
                          const isSender = ct.sharedById === collab?.id;
                          return <span title={(isSender?'Partagé avec ':'Envoyé par ')+(other?.name||'un collègue')} style={{padding:"1px 5px",borderRadius:8,fontSize:8,fontWeight:700,background:"#F9731618",color:"#F97316",flexShrink:0,display:'inline-flex',alignItems:'center',gap:3}}>
                            <I n={isSender?"send":"inbox"} s={8}/> {isSender?'→':'←'} {(other?.name||'').split(' ')[0]||'Partagé'}
                          </span>;
                        })()}
                        {(typeof v7FollowersMap!=='undefined'?v7FollowersMap:null)[ct.id]?.executor && (typeof v7FollowersMap!=='undefined'?v7FollowersMap:null)[ct.id].executor.collaboratorId !== collab.id && <span style={{padding:'1px 5px',borderRadius:8,fontSize:8,fontWeight:700,background:'#8B5CF618',color:'#8B5CF6',flexShrink:0}} title={'Chez '+(typeof v7FollowersMap!=='undefined'?v7FollowersMap:null)[ct.id].executor.collaboratorName}>Chez {((typeof v7FollowersMap!=='undefined'?v7FollowersMap:null)[ct.id].executor.collaboratorName||'').split(' ')[0]}</span>}
                        {ct.card_label&&<span style={{padding:"1px 5px",borderRadius:8,fontSize:8,fontWeight:700,background:ct.card_color+'18',color:ct.card_color,flexShrink:0}}>{ct.card_label}</span>}
                        {ct.lead_score>0&&<span style={{padding:"1px 5px",borderRadius:8,fontSize:8,fontWeight:700,background:ct.lead_score>60?'#22C55E15':ct.lead_score>30?'#F59E0B15':'#EF444415',color:ct.lead_score>60?'#22C55E':ct.lead_score>30?'#F59E0B':'#EF4444',flexShrink:0}} title="Score lead">{ct.lead_score}</span>}
                      </div>
                      <div title={ct.email||""} style={{fontSize:11,color:T.text3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ct.email||""}</div>
                    </div>
                    <div style={{width:28,height:28,borderRadius:7,background:cScoreColor(ct._score)+"18",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:10,color:cScoreColor(ct._score),flexShrink:0}} title={`Score: ${ct._score}/100 — ${cScoreLabel(ct._score)}`}>{ct._score}</div>
                  </div>
                  {ct.phone&&<div style={{fontSize:12,color:T.text,fontWeight:600,marginBottom:4,display:'flex',alignItems:'center',gap:4}}><I n="phone" s={11} style={{color:'#22C55E'}}/> {displayPhone(ct.phone)}</div>}
                  {/* RDV sub-status badge */}
                  {ct.rdv_status&&ct.pipeline_stage==='rdv_programme'&&<div style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:ct.rdv_status==='rdv_confirme'?'#22C55E18':ct.rdv_status==='rdv_annule'?'#EF444418':'#0EA5E918',color:ct.rdv_status==='rdv_confirme'?'#22C55E':ct.rdv_status==='rdv_annule'?'#EF4444':'#0EA5E9',marginBottom:4}}>{ct.rdv_status==='rdv_pris'?'RDV Pris':ct.rdv_status==='rdv_confirme'?'Confirmé':ct.rdv_status==='rdv_en_attente'?'En attente':ct.rdv_status==='rdv_passe'?'Passé':ct.rdv_status==='rdv_annule'?'Annulé':''}</div>}
                  {/* Badge catégorie RDV */}
                  {_catObj&&<div style={{display:'flex',alignItems:'center',gap:4,marginBottom:4}}>
                    <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:_catObj.color+'18',color:_catObj.color}}>{_catObj.label}</span>
                    {_subObj&&<span style={{fontSize:9,fontWeight:600,color:_subObj.color}}>{_subObj.label}</span>}
                  </div>}
                  {/* RDV countdown inline — live depuis bookings */}
                  {ct.pipeline_stage==='rdv_programme'&&(()=>{const todayS=new Date().toISOString().split('T')[0];const liveRdv=(bookings||[]).filter(b=>b.contactId===ct.id&&b.status==='confirmed'&&b.date>=todayS).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];const rdvDate=liveRdv?liveRdv.date+(liveRdv.time?'T'+liveRdv.time:''):ct.next_rdv_date;if(!rdvDate)return null;const diff=Math.round((new Date(rdvDate).getTime()-Date.now())/60000);if(diff<0&&diff>-120)return<div style={{fontSize:9,fontWeight:700,color:'#EF4444',marginBottom:4}}>RDV passé il y a {Math.abs(diff)} min</div>;if(diff>=0&&diff<=60)return<div style={{fontSize:9,fontWeight:700,color:'#F59E0B',marginBottom:4}}>RDV dans {diff} min</div>;if(diff>60&&diff<=1440)return<div style={{fontSize:9,fontWeight:600,color:'#0EA5E9',marginBottom:4}}>RDV dans {Math.floor(diff/60)}h{String(diff%60).padStart(2,'0')}</div>;if(diff>1440)return<div style={{fontSize:9,color:T.text3,marginBottom:4}}>RDV le {new Date(rdvDate).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})} {rdvDate.split('T')[1]?.slice(0,5)||''}</div>;return null;})()}
                  {/* RDV passé — badge alerte */}
                  {_isRdvPasse && <div style={{fontSize:9,fontWeight:800,padding:'3px 8px',borderRadius:6,background:'linear-gradient(135deg,#F97316,#EF4444)',color:'#fff',marginBottom:4,display:'flex',alignItems:'center',gap:4,boxShadow:'0 2px 8px #F9731630'}}>
                    <span>⚠️</span> RDV passé — Cliquez pour qualifier
                  </div>}
                  {/* NRP relance badge */}
                  {ct.pipeline_stage==='nrp'&&ct.nrp_next_relance&&<div style={{fontSize:9,fontWeight:700,marginBottom:4,color:ct.nrp_next_relance<=new Date().toISOString().split('T')[0]?'#EF4444':'#F59E0B'}}>{ct.nrp_next_relance<=new Date().toISOString().split('T')[0]?'🔔 Relancer maintenant !':'⏰ Relance '+new Date(ct.nrp_next_relance).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</div>}
                  {/* NRP attempt counter badge */}
                  {ct.pipeline_stage==='nrp'&&(()=>{try{const n=JSON.parse(ct.nrp_followups_json||'[]').filter(f=>f.done).length;return n>0?<div style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:9,fontWeight:800,padding:'2px 7px',borderRadius:6,background:'#EF4444',color:'#fff',marginBottom:4,width:'fit-content'}}>NRP x{n}</div>:null;}catch{return null;}})()}
                  <div style={{display:"flex",gap:6,fontSize:11,color:T.text2,marginBottom:4}}>
                    <span>{(bookings||[]).filter(b=>b.contactId===ct.id&&b.status!=='cancelled').length||(ct.totalBookings||0)} RDV</span>
                    {ct.lastVisit&&<span>· {fmtDate(ct.lastVisit)}</span>}
                  </div>
                  {ct.rating&&<div style={{fontSize:10,color:"#F59E0B",marginBottom:4}}>{"★".repeat(ct.rating)}</div>}
                  {ct.notes&&<div style={{fontSize:10,color:T.text3,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}} title={ct.notes}>📝 {ct.notes.substring(0,40)}{ct.notes.length>40?"…":""}</div>}
                  {(()=>{const d=Math.floor((Date.now()-new Date(ct.updatedAt||ct.lastVisit||ct.createdAt||0).getTime())/86400000);return d>=30?<div style={{fontSize:9,color:"#EF4444",fontWeight:700,marginBottom:4}}>🔴 {d}j sans action</div>:d>=14?<div style={{fontSize:9,color:"#F59E0B",fontWeight:700,marginBottom:4}}>🟠 {d}j sans action</div>:null})()}
                  {(ct.tags||[]).length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:4}}>{(ct.tags||[]).slice(0,3).map(t=><Badge key={String(t)} color="#7C3AED">{String(t)}</Badge>)}</div>}
                  {!ct._linked&&<div onClick={e=>{e.stopPropagation();linkVisitorToContacts(ct);}} style={{marginTop:4,padding:"3px 8px",borderRadius:8,fontSize:10,fontWeight:600,cursor:"pointer",background:T.accent+"12",color:T.accent,textAlign:"center"}}>+ Ajouter au CRM</div>}
                  {ct._linked&&<div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:2}}>
                    <div onClick={e=>{e.stopPropagation();setSelectedCrmContact(ct);setCollabFicheTab("notes");}} style={{flex:'1 1 28%',padding:"3px 0",borderRadius:8,fontSize:10,fontWeight:600,cursor:"pointer",background:T.accentBg,color:T.accent,textAlign:"center"}}>Fiche</div>
                    {ct.phone&&<div onClick={e=>{e.stopPropagation();if(typeof startVoipCall==='function')startVoipCall(ct.phone,ct);else window.open('tel:'+ct.phone);}} style={{flex:'1 1 28%',padding:"3px 0",borderRadius:8,fontSize:10,fontWeight:600,cursor:"pointer",background:T.bg,color:T.text2,textAlign:"center",border:`1px solid ${T.border}`}}>Appel</div>}
                    <div onClick={e=>{e.stopPropagation();setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{flex:'1 1 28%',padding:"3px 0",borderRadius:8,fontSize:10,fontWeight:600,cursor:"pointer",background:'#F59E0B14',color:'#F59E0B',textAlign:"center",border:'1px solid #F59E0B30'}}><I n="calendar" s={9}/> RDV</div>
                    {ct.email&&<div onClick={e=>{e.stopPropagation();window.open('mailto:'+ct.email);}} style={{flex:'1 1 28%',padding:"3px 0",borderRadius:8,fontSize:10,fontWeight:600,cursor:"pointer",background:T.bg,color:T.text2,textAlign:"center",border:`1px solid ${T.border}`}}>Email</div>}
                    <div onClick={e=>{e.stopPropagation();setSelectedCrmContact(ct);setCollabFicheTab("notes");}} style={{flex:'1 1 28%',padding:"3px 0",borderRadius:8,fontSize:10,fontWeight:600,cursor:"pointer",background:T.bg,color:T.text3,textAlign:"center",border:`1px solid ${T.border}`}}><I n="edit-3" s={9}/> Notes</div>
                    <div onClick={e=>{e.stopPropagation();setV7TransferModal({contact:ct,fromPipeline:true});setV7TransferTarget('');}} style={{flex:'1 1 28%',padding:'3px 0',borderRadius:8,fontSize:10,fontWeight:600,cursor:'pointer',background:'#8B5CF618',color:'#8B5CF6',textAlign:'center',border:'1px solid #8B5CF630'}} title='Transférer à un collègue'>Transférer</div>
                  </div>}
                </Card>
              })}
              {stageContacts.length===0&&!isDragOver&&stage.id==='nouveau'&&<div onClick={()=>setShowNewContact(true)} style={{padding:24,textAlign:"center",color:T.accent,fontSize:12,fontWeight:600,borderRadius:10,border:`1px dashed ${T.accent}40`,background:T.accentBg,cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+'18'} onMouseLeave={e=>e.currentTarget.style.background=T.accentBg}><I n="plus" s={15}/><br/>Nouveau contact</div>}
              {stageContacts.length===0&&!isDragOver&&stage.id!=='nouveau'&&<div style={{padding:24,textAlign:"center",color:T.text3,fontSize:12,borderRadius:10,border:`1px dashed ${T.border}`,background:T.surface}}>Aucun contact</div>}
              {stageContacts.length>0&&stage.id==='nouveau'&&<div onClick={()=>setShowNewContact(true)} style={{textAlign:'center',padding:'8px',color:T.accent,fontSize:11,fontWeight:600,cursor:'pointer',borderRadius:8,border:`1px dashed ${T.accent}30`,marginTop:4,transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><I n="plus" s={12}/> Nouveau contact</div>}
            </div>
          </div>
        );
      })}
      {!pipelineReadOnly && (<div style={{flex:"0 0 200px",minWidth:200,display:"flex",flexDirection:"column"}}>
        <div onClick={()=>setShowAddStage(true)} style={{padding:16,borderRadius:12,border:`2px dashed ${T.border}`,background:T.surface,textAlign:"center",cursor:"pointer",color:T.text3,minHeight:80,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
          <div style={{width:36,height:36,borderRadius:18,background:T.accentBg,display:"flex",alignItems:"center",justifyContent:"center",color:T.accent}}><I n="plus" s={18}/></div>
          <span style={{fontSize:12,fontWeight:600}}>Nouvelle colonne</span>
        </div>
      </div>)}
    </div>
    </>
  ) : (
    /* ═══ CONVERSION FUNNEL VIEW ═══ */
    <Card style={{padding:24}}>
      <h3 style={{fontSize:16,fontWeight:700,marginBottom:20,color:T.text}}><I n="trending-up" s={18}/> Funnel de conversion</h3>
      <div style={{display:"flex",flexDirection:"column",gap:0,maxWidth:600,margin:"0 auto"}}>
        {collabPipelineAnalytics.funnel.map((st,i)=>{
          const maxCount=Math.max(...collabPipelineAnalytics.funnel.map(s=>s.count),1);
          const barW=Math.max(st.count/maxCount*100,8);
          return (
            <div key={st.id}>
              <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0"}}>
                <div style={{width:110,textAlign:"right",fontSize:12,fontWeight:600,color:st.color,flexShrink:0}}>{st.label}</div>
                <div style={{flex:1,position:"relative"}}>
                  <div style={{height:32,borderRadius:8,background:st.color,width:`${barW}%`,transition:"width .4s ease",display:"flex",alignItems:"center",justifyContent:"center",minWidth:40}}>
                    <span style={{color:"#fff",fontSize:12,fontWeight:800}}>{st.count}</span>
                  </div>
                </div>
                <div style={{width:50,fontSize:12,fontWeight:700,color:T.text,textAlign:"right"}}>{st.pct}%</div>
              </div>
              {i<collabPipelineAnalytics.funnel.length-1&&(
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"0 0 0 122px"}}>
                  <div style={{color:T.text3,fontSize:10,display:"flex",alignItems:"center",gap:4}}>
                    <I n="arrow-down" s={10}/> {collabPipelineAnalytics.funnel[i+1].convRate}% conversion
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* KPI Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:24}}>
        <div style={{padding:16,borderRadius:12,background:"#22C55E12",textAlign:"center"}}>
          <div style={{fontSize:28,fontWeight:800,color:"#22C55E"}}>{collabPipelineAnalytics.winRate}%</div>
          <div style={{fontSize:11,color:T.text3,fontWeight:600}}>Taux de conversion</div>
        </div>
        <div style={{padding:16,borderRadius:12,background:T.accent+"12",textAlign:"center"}}>
          <div style={{fontSize:28,fontWeight:800,color:T.accent}}>{collabPipelineAnalytics.active}</div>
          <div style={{fontSize:11,color:T.text3,fontWeight:600}}>En cours</div>
        </div>
        <div style={{padding:16,borderRadius:12,background:"#22C55E12",textAlign:"center"}}>
          <div style={{fontSize:28,fontWeight:800,color:"#22C55E"}}>{collabPipelineAnalytics.won}</div>
          <div style={{fontSize:11,color:T.text3,fontWeight:600}}>Gagnés</div>
        </div>
        <div style={{padding:16,borderRadius:12,background:"#EF444412",textAlign:"center"}}>
          <div style={{fontSize:28,fontWeight:800,color:"#EF4444"}}>{collabPipelineAnalytics.lost}</div>
          <div style={{fontSize:11,color:T.text3,fontWeight:600}}>Perdus</div>
        </div>
      </div>
      {/* Score distribution per stage */}
      <div style={{marginTop:20}}>
        <h4 style={{fontSize:13,fontWeight:700,color:T.text2,marginBottom:10}}>Score moyen par étape</h4>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {collabPipelineAnalytics.funnel.map(st=>(
            <div key={st.id} style={{padding:"8px 16px",borderRadius:10,background:T.bg,border:`1px solid ${T.border}`,textAlign:"center",flex:"1 1 auto",minWidth:80}}>
              <div style={{fontSize:18,fontWeight:800,color:cScoreColor(collabPipelineAnalytics.avgScores[st.id])}}>{collabPipelineAnalytics.avgScores[st.id]}</div>
              <div style={{fontSize:10,color:st.color,fontWeight:600}}>{st.label}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
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
