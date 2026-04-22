// CrmHeader — extraction S1.2 (1/3) depuis CrmTab.jsx L136-234
// Responsabilite : header CRM (titre + actions Export/Import/+Statut/Nouveau)
//                  + ligne description + pipeline stats bar + view mode switch
//                  + funnel stages cliquables + reset filter stage.
// Tous les symboles consommes viennent de CollabContext.

import React from "react";
import { T } from "../../../../theme";
import { I, Btn, Card } from "../../../../shared/ui";
import { useCollabContext } from "../../context/CollabContext";

const CrmHeader = () => {
  const {
    // Export dropdown + data
    crmExportModal, setCrmExportModal,
    crmVisibleCols, CRM_STD_COLS, contactFieldDefs,
    filteredCollabCrm, showNotif,
    // Action bar buttons
    setCsvImportModal, setScanImageModal, setShowAddStage, setShowNewContact,
    pipelineReadOnly,
    // Stats bar + counts
    myCrmContacts, collabPipelineAnalytics,
    // View mode switch
    collabCrmViewMode, setCollabCrmViewMode, setCollabCrmPage,
    // Funnel filter
    collabCrmFilterStage, setCollabCrmFilterStage,
  } = useCollabContext();

  return (
    <>
      {/* Header with Export/Import/Nouveau */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <h1 style={{fontSize:22,fontWeight:700,letterSpacing:-0.5}}>Contacts CRM</h1>
        <div style={{display:"flex",gap:8}}>
          <div style={{position:'relative'}}>
          <Btn small onClick={()=>(typeof setCrmExportModal==='function'?setCrmExportModal:function(){})(!crmExportModal)}><I n="layers" s={13}/> Export</Btn>
          {crmExportModal&&<div style={{position:'absolute',top:'100%',left:0,zIndex:99,background:T.card,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',padding:16,minWidth:280,marginTop:4}} onClick={e=>e.stopPropagation()}>
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
    </>
  );
};

export default CrmHeader;
