// FicheContactModal — extraction S1.4a depuis CrmTab.jsx L161-969 (≈810 lignes)
// EXTRACTION MONOLITHIQUE — aucun découpage interne (sera fait en S1.4b).
// Responsabilité : modal fiche contact complète (selectedCrmContact && ...) avec :
//   - header score+stage badges + actions header
//   - bloc intelligent (prochain RDV + action prioritaire)
//   - pipeline stage selector + quick actions bar
//   - contract signed banner
//   - tabs (notes, client_msg, sms, history, appels, docs, suivi, partage)
//   - notes tab : coordonnées, custom fields, notes (debounce via collabNotesTimerRef)
//   - SMS tab + VoIP tab + AI analyses
//   - sous-screens externes (FicheClientMsgScreen, FicheSuiviScreen, FicheDocsLinkedScreen)
//   - espace client (en bas de fiche)
//
// Tous les symboles consommés viennent de CollabContext (destructure identique
// à CrmTab pour limiter le risque de symbole manquant). Pattern strict S1 :
// aucun changement métier, aucun renommage, aucun cleanup typeof, aucun ajout.

import React from "react";
import { T } from "../../../../../theme";
import { I, Btn, Card, Avatar, Badge, Modal, Input, ValidatedInput, Stars, Spinner, EmptyState, HelpTip, HookIsolator } from "../../../../../shared/ui";
import { displayPhone, formatPhoneFR } from "../../../../../shared/utils/phone";
import { isValidEmail, isValidPhone } from "../../../../../shared/utils/validators";
import { fmtDate, DAYS_FR, MONTHS_FR } from "../../../../../shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES } from "../../../../../shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../../../../shared/utils/notifications";
import { api } from "../../../../../shared/services/api";
import { _T } from "../../../../../shared/state/tabState";
import { useCollabContext } from "../../../context/CollabContext";
import { FicheClientMsgScreen, FicheSuiviScreen, FicheDocsLinkedScreen } from "../../../screens";
import FicheHeader from "./FicheHeader";
import FicheIntelligentBlock from "./FicheIntelligentBlock";
import FicheActionsBar from "./FicheActionsBar";
import FicheBookings from "./FicheBookings";
import FicheCoordonnees from "./FicheCoordonnees";
import FicheCustomFields from "./FicheCustomFields";
import FicheNotes from "./FicheNotes";
import FicheAiAnalyses from "./FicheAiAnalyses";
import FicheMessagesSms from "./FicheMessagesSms";
import FicheVoipSection from "./FicheVoipSection";
import FicheEspaceClient from "./FicheEspaceClient";
import FicheStatusHistory from "./FicheStatusHistory";

const FicheContactModal = () => {
  const ctx = useCollabContext();
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
{/* ── FICHE CLIENT MODAL ── */}
{selectedCrmContact && (
<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>{setSelectedCrmContact(null);setCollabFicheTab("notes");}}>
  <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:700,maxHeight:"90vh",overflow:"auto",padding:28,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
    {(()=>{
      const ct = selectedCrmContact;
      const stg = PIPELINE_STAGES.find(s=>s.id===(ct.pipeline_stage||"nouveau")) || PIPELINE_STAGES[0];
      const sc = getCollabLeadScore(ct);
      const contactBookings = (bookings||[]).filter(b=>b.contactId===ct.id && b.collaboratorId===collab.id).sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.time||'').localeCompare(a.time||''));
      const contactCalls = (voipCallLogs||[]).filter(cl=>cl.contactId===ct.id);
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
        <FicheHeader ct={ct} stg={stg} sc={sc} />

        {/* ── BLOC INTELLIGENT: Prochain RDV + Prochaine Action + Action prioritaire ── */}
        <FicheIntelligentBlock ct={ct} />

        {/* Espace client → déplacé en bas de la fiche */}

        {/* Pipeline stage selector + Quick actions */}
        <FicheActionsBar ct={ct} stg={stg} />

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
                  <Btn small style={{background:'#EF444415',color:'#EF4444',border:'1px solid #EF444430'}} onClick={()=>{const reason=prompt('Raison de l\'annulation du contrat :');if(reason===null)return;if(!reason.trim()){showNotif('Motif obligatoire','danger');return;}api(`/api/data/contacts/${ct.id}/cancel-contract`,{method:'PUT',body:{reason:reason.trim()}}).then(r=>{if(r?.success){setContacts(p=>p.map(c=>c.id===ct.id?{...c,contract_status:'cancelled',contract_cancel_reason:reason.trim()}:c));if(selectedCrmContact?.id===ct.id)(typeof setSelectedCrmContact==='function'?setSelectedCrmContact:function(){})(p=>p?{...p,contract_status:'cancelled',contract_cancel_reason:reason.trim()}:p);showNotif('Contrat annulé','success');}else{showNotif(r?.error||'Erreur','danger');}}).catch(()=>showNotif('Erreur réseau','danger'));}}><I n="x-circle" s={12}/> Annuler le contrat</Btn>
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
        <FicheBookings ct={ct} contactBookings={contactBookings} />

        {/* Client Messages tab */}
        {collabFicheTab==="client_msg" && <FicheClientMsgScreen ct={ct} notifList={notifList} setNotifList={setNotifList} setNotifUnread={setNotifUnread} showNotif={showNotif} />}

        {/* Notes/Info tab — unified view */}
        {collabFicheTab==="notes"&&(
          <div>
            {ct._linked ? (
              <>
                {/* ── Coordonnées — même structure que pipeline ── */}
                <FicheCoordonnees ct={ct} />
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
                <FicheCustomFields ct={ct} />
                <FicheNotes ct={ct} />

                {/* V4: Debug mode — Historique des statuts */}
                <FicheStatusHistory ct={ct} />

                {/* Accordéon Résumé IA — CRM fiche */}
                <FicheAiAnalyses ct={ct} />
              </>
            ) : (
              <div style={{padding:30,textAlign:"center",color:T.text3,fontSize:13}}>Ajoutez ce contact au CRM pour pouvoir prendre des notes.</div>
            )}
          </div>
        )}

        {/* SMS tab */}
        <FicheMessagesSms ct={ct} />

        {/* Appels tab — filtré par contactId */}
        <FicheVoipSection ct={ct} />

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
        <FicheEspaceClient ct={ct} />
      </>);
    })()}
  </div>
</div>
)}
    </>
  );
};

export default FicheContactModal;
