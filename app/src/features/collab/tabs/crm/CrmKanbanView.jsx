// CrmKanbanView — extraction S1.3 (2/2) depuis CrmTab.jsx L148-365
// Responsabilite : vue Pipeline kanban (2e branche du ternaire viewMode) =
//                  bulk pipeline actions bar (Z7, selection pipeSelectedIds) +
//                  colonnes kanban (orderedStages map) + cards contact avec
//                  drag&drop, badges (RDV, NRP, score, share, V7), actions
//                  (fiche, appel, RDV, email, transferer).
// Tous les symboles consommes viennent de CollabContext.
// IMPORTANT : reutilise BulkSmsModal deja extrait (S1.1).

import React from "react";
import { T } from "../../../../theme";
import { I, Btn, Card, Avatar, Badge } from "../../../../shared/ui";
import { displayPhone } from "../../../../shared/utils/phone";
import { fmtDate } from "../../../../shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES } from "../../../../shared/utils/pipeline";
import { api } from "../../../../shared/services/api";
import { useCollabContext } from "../../context/CollabContext";
import BulkSmsModal from "../../components/BulkSmsModal";

const CrmKanbanView = () => {
  const {
    // Z7 bulk pipeline bar
    pipeSelectedIds, setPipeSelectedIds,
    pipeBulkStage, setPipeBulkStage,
    PIPELINE_STAGES,
    contacts, bookings,
    handleCollabUpdateContact, handlePipelineStageChange,
    showNotif,
    company, contactsRef, contactsLocalEditRef, setContacts,
    // Kanban
    orderedStages, filteredCollabCrm,
    handleDragOver, handleDragLeave, handleDrop, handleColumnDrop,
    handleColumnDragStart, handleColumnDragEnd, handleDragStart, handleDragEnd,
    pipelineReadOnly,
    dragOverStage, dragContact, dragColumnId,
    // Stage management buttons
    setShowAddStage, setEditingStage, setEditStageForm, setConfirmDeleteStage,
    // Cards (selection / fiche / actions)
    collab, collabs,
    selectedCrmContact, pipelineRightContact,
    setPipelineRightContact, setPipelineRightTab, setPipelinePopupHistory,
    setSelectedCrmContact, setCollabFicheTab,
    setRdvPasseModal,
    cScoreColor, cScoreLabel,
    linkVisitorToContacts, startVoipCall,
    setPhoneScheduleForm, setPhoneShowScheduleModal, calendars,
    setV7TransferModal, setV7TransferTarget,
    v7FollowersMap,
    setShowNewContact,
  } = useCollabContext();

  return (
    <>
    {/* ── Bulk action bar ── */}
    {(pipeSelectedIds||[]).length > 0 && (
      <Card style={{padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12,background:T.accentBg,border:`1.5px solid ${T.accent}44`,flexWrap:"wrap",position:'sticky',top:0,zIndex:10}}>
        <span style={{fontWeight:700,fontSize:13,color:T.accent}}>{(pipeSelectedIds||[]).length} sélectionné{(pipeSelectedIds||[]).length>1?'s':''}</span>
        <select value={pipeBulkStage} onChange={e => (typeof setPipeBulkStage==='function'?setPipeBulkStage:function(){})(e.target.value)} style={{padding:"4px 8px",borderRadius:8,border:`1px solid ${T.border}`,fontSize:12,background:T.surface,color:T.text}}>
          <option value="">Déplacer vers…</option>
          {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {pipeBulkStage && <Btn small primary onClick={() => {
          const MODAL_STAGES = ['rdv_programme','client_valide'];
          const ids = (pipeSelectedIds||[]).filter(id => { const c=(contacts||[]).find(x=>x.id===id); return c && c.pipeline_stage !== pipeBulkStage; });
          if(ids.length===0){showNotif('Aucun contact à déplacer','info');return;}
          if(MODAL_STAGES.includes(pipeBulkStage)){showNotif('Ce stage nécessite une action individuelle (RDV ou contrat)','info');return;}
          let note = '';
          if(pipeBulkStage==='perdu'){note=prompt('Raison de la perte (tous les contacts) :')||'Classé perdu en masse';}
          if(pipeBulkStage==='qualifie'){note=prompt('Note de qualification :')||'Qualifié en masse';}
          ids.forEach(id => handlePipelineStageChange(id, pipeBulkStage, note));
          showNotif(`${ids.length} contact${ids.length>1?'s':''} déplacé${ids.length>1?'s':''} → ${PIPELINE_STAGES.find(s=>s.id===pipeBulkStage)?.label||pipeBulkStage}`,'success');
          setPipeSelectedIds([]); setPipeBulkStage('');
        }}><I n="arrow-right" s={12}/> Déplacer</Btn>}
        <Btn small onClick={() => {
          const tag = prompt('Tag à ajouter :');
          if(!tag||!tag.trim()) return;
          (pipeSelectedIds||[]).forEach(id => { const c=(contacts||[]).find(x=>x.id===id); if(c) handleCollabUpdateContact(id, {tags:[...(c.tags||[]),tag.trim()]}); });
          showNotif(`Tag "${tag.trim()}" ajouté à ${(pipeSelectedIds||[]).length} contact${(pipeSelectedIds||[]).length>1?'s':''}`,'success');
          setPipeSelectedIds([]);
        }}><I n="tag" s={12}/> Tag</Btn>
        {/* Couleur en masse */}
        <select onChange={e=>{const v=e.target.value;if(!v)return;const allColors=[...PIPELINE_CARD_COLORS_DEFAULT,...JSON.parse(localStorage.getItem('pipeline_custom_colors')||'[]')];const pc=allColors.find(c=>(c.color||'')===(v==='none'?'':v));if(!pc)return;(pipeSelectedIds||[]).forEach(id=>handleCollabUpdateContact(id,{card_color:pc.color||'',card_label:pc.color?pc.label:''}));showNotif(`Couleur "${pc.label}" appliquée à ${(pipeSelectedIds||[]).length} contact${(pipeSelectedIds||[]).length>1?'s':''}`,'success');e.target.value='';}} style={{padding:"4px 8px",borderRadius:8,border:`1px solid ${T.border}`,fontSize:12,background:T.surface,color:T.text}}>
          <option value="">Couleur…</option>
          {[...PIPELINE_CARD_COLORS_DEFAULT,...JSON.parse(localStorage.getItem('pipeline_custom_colors')||'[]')].map(pc=><option key={pc.color+pc.label} value={pc.color||'none'}>● {pc.label}</option>)}
        </select>
        <Btn small ghost danger onClick={() => {
          if(!confirm(`Supprimer ${(pipeSelectedIds||[]).length} contact${(pipeSelectedIds||[]).length>1?'s':''} ? Cette action est irréversible.`)) return;
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
        const isDragOver = dragOverStage === stage.id && dragContact && ((dragContact||{}).pipeline_stage||"nouveau") !== stage.id;
        const isColumnDragOver = dragColumnId && dragColumnId !== stage.id;
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
              {stageContacts.length>0&&<input type="checkbox" checked={stageContacts.every(c=>(pipeSelectedIds||[]).includes(c.id))} onChange={e=>{e.stopPropagation();if(e.target.checked){(typeof setPipeSelectedIds==='function'?setPipeSelectedIds:function(){})(p=>[...new Set([...p,...stageContacts.map(c=>c.id)])]);}else{const stIds=new Set(stageContacts.map(c=>c.id));(typeof setPipeSelectedIds==='function'?setPipeSelectedIds:function(){})(p=>p.filter(id=>!stIds.has(id)));}}} onClick={e=>e.stopPropagation()} title={`Sélectionner tout ${stage.label}`} style={{cursor:'pointer',accentColor:stage.color,width:14,height:14,flexShrink:0}}/>}
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
                const _isPipeSelected = (pipeSelectedIds||[]).includes(ct.id);
                const _isCrmSelected = selectedCrmContact?.id === ct.id || pipelineRightContact?.id === ct.id;
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
                  style={{padding:12,cursor:ct._linked?"grab":"pointer",border:_isRdvPasse?'2px solid #F97316':_isCrmSelected?`2.5px solid ${T.accent}`:_hasCColor?`2.5px solid ${ct.card_color}`:_isPipeSelected?`2px solid ${T.accent}`:`1px solid ${T.border}`,borderLeft:_isRdvPasse?'5px solid #F97316':_isCrmSelected?`5px solid ${T.accent}`:_hasCColor?`6px solid ${ct.card_color}`:_isSharedCrm?'5px solid #F97316':`4px solid ${stage.color}`,background:_isRdvPasse?'linear-gradient(135deg, #F9731612 0%, #F9731604 60%, transparent 100%)':_isCrmSelected?T.accent+'08':_isPipeSelected?T.accentBg:_hasCColor?`linear-gradient(135deg, ${ct.card_color}30 0%, ${ct.card_color}08 60%, transparent 100%)`:undefined,transition:"all .2s",transform:dragContact?.id===ct.id?"scale(0.95) rotate(1deg)":"none",opacity:dragContact?.id===ct.id?0.6:1,userSelect:"none",boxShadow:_isRdvPasse?'0 3px 12px #F9731625':_isCrmSelected?`0 4px 16px ${T.accent}25`:_hasCColor?`0 3px 12px ${ct.card_color}30`:'none',borderRadius:14,position:'relative'}}
                  onClick={() => {if(!dragContact){
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
                        {(v7FollowersMap||{})[ct.id]?.executor && (v7FollowersMap||{})[ct.id].executor.collaboratorId !== collab.id && <span style={{padding:'1px 5px',borderRadius:8,fontSize:8,fontWeight:700,background:'#8B5CF618',color:'#8B5CF6',flexShrink:0}} title={'Chez '+(v7FollowersMap||{})[ct.id].executor.collaboratorName}>Chez {((v7FollowersMap||{})[ct.id].executor.collaboratorName||'').split(' ')[0]}</span>}
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
  );
};

export default CrmKanbanView;
