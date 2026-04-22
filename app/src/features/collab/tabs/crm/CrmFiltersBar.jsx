// CrmFiltersBar — extraction S1.2 (3/3) depuis CrmTab.jsx L140-254
// Responsabilite : barre recherche + filtres avances (etape/score/periode)
//                  + column config panel (drag&drop colonnes, champs perso)
//                  + active filters summary (followup + tags).
// Exclut le bulk actions bar qui est une zone separee (Z5).
// Tous les symboles consommes viennent de CollabContext.

import React from "react";
import { T } from "../../../../theme";
import { I, Btn, Input } from "../../../../shared/ui";
import { useCollabContext } from "../../context/CollabContext";

const CrmFiltersBar = () => {
  const {
    // Search input
    crmSearch, setCrmSearch,
    // Followup filter
    collabCrmFilterFollowup, setCollabCrmFilterFollowup,
    // Pagination reset
    setCollabCrmPage,
    // Advanced filters drawer
    collabCrmAdvOpen, setCollabCrmAdvOpen,
    collabCrmAdvFilters, setCollabCrmAdvFilters,
    // Column config panel
    crmColPanelOpen, setCrmColPanelOpen,
    crmColConfig, saveCrmColConfig,
    crmEffectiveOrder, crmEffectiveHidden,
    crmDragCol, setCrmDragCol,
    CRM_ALL_COLS, CRM_STD_COLS,
    // Stage filter
    collabCrmFilterStage, setCollabCrmFilterStage,
    PIPELINE_STAGES,
    // Tags filter
    collabContactTags,
    collabCrmFilterTags, setCollabCrmFilterTags,
  } = useCollabContext();

  return (
    <>
      {/* Search + Filters */}
      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:200}}><Input placeholder="Rechercher par nom, email, téléphone..." icon="search" value={crmSearch} onChange={e=>{(typeof setCrmSearch==='function'?setCrmSearch:function(){})(e.target.value);setCollabCrmPage(0);}}/></div>
        <select value={collabCrmFilterFollowup} onChange={e=>{(typeof setCollabCrmFilterFollowup==='function'?setCollabCrmFilterFollowup:function(){})(Number(e.target.value));setCollabCrmPage(0);}} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${collabCrmFilterFollowup>0?"#EF4444":T.border}`,background:collabCrmFilterFollowup>0?"#EF444408":T.surface,color:collabCrmFilterFollowup>0?"#EF4444":T.text,fontSize:12,fontWeight:500,fontFamily:"inherit",cursor:"pointer"}}>
          <option value={0}>À relancer</option>
          <option value={7}>+7 jours sans contact</option>
          <option value={14}>+14 jours sans contact</option>
          <option value={30}>+30 jours sans contact</option>
        </select>
        <Btn small onClick={()=>(typeof setCollabCrmAdvOpen==='function'?setCollabCrmAdvOpen:function(){})(!collabCrmAdvOpen)} style={{background:collabCrmAdvOpen||(collabCrmAdvFilters||{}).scoreRange||(collabCrmAdvFilters||{}).hasEmail!==null||(collabCrmAdvFilters||{}).hasPhone!==null?T.accent+"12":"transparent",color:collabCrmAdvOpen?T.accent:T.text3,borderColor:collabCrmAdvOpen?T.accent+"44":T.border}}><I n="sliders" s={13}/> Filtres</Btn>
        <div style={{position:'relative'}}>
          <Btn small onClick={()=>(typeof setCrmColPanelOpen==='function'?setCrmColPanelOpen:function(){})(!crmColPanelOpen)} style={{background:crmColPanelOpen?T.accent+'12':'transparent',color:crmColPanelOpen?T.accent:T.text3,borderColor:crmColPanelOpen?T.accent+'44':T.border}}><I n="columns" s={13}/> Colonnes</Btn>
          {crmColPanelOpen&&<div style={{position:'absolute',top:'100%',right:0,zIndex:99,background:T.card,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',padding:12,minWidth:220,marginTop:4}} onClick={e=>e.stopPropagation()}>
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
                onDrop={e=>{e.currentTarget.style.borderTop='none';if(crmDragCol===null||crmDragCol===idx)return;const newOrder=[...((crmColConfig||{}).order||CRM_ALL_COLS.map(c=>c.k))];const [moved]=newOrder.splice(crmDragCol,1);newOrder.splice(idx,0,moved);saveCrmColConfig({...crmColConfig,order:newOrder});(typeof setCrmDragCol==='function'?setCrmDragCol:function(){})(null);}}
                style={{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',borderRadius:8,marginBottom:2,cursor:col.fixed?'default':'grab',background:crmDragCol===idx?T.accentBg:T.surface,transition:'all .15s',border:`1px solid ${crmDragCol===idx?T.accent+'44':'transparent'}`}} onMouseEnter={e=>{if(!col.fixed)e.currentTarget.style.background=T.accentBg;}} onMouseLeave={e=>{if(!col.fixed&&crmDragCol!==idx)e.currentTarget.style.background=T.surface;}}>
                {!col.fixed&&<div style={{display:'flex',flexDirection:'column',gap:0,flexShrink:0,cursor:'grab'}}>
                  <I n="grip-vertical" s={14} style={{color:T.accent,opacity:0.6}}/>
                </div>}
                {!col.fixed&&<div style={{display:'flex',flexDirection:'column',gap:0,flexShrink:0,marginLeft:-2}}>
                  <span onClick={e=>{e.stopPropagation();if(idx<=0)return;const newOrder=[...((crmColConfig||{}).order||CRM_ALL_COLS.map(c=>c.k))];[newOrder[idx-1],newOrder[idx]]=[newOrder[idx],newOrder[idx-1]];saveCrmColConfig({...crmColConfig,order:newOrder});}} style={{cursor:idx>0?'pointer':'default',fontSize:9,lineHeight:1,color:idx>0?T.accent:T.border,padding:'0 2px'}}>▲</span>
                  <span onClick={e=>{e.stopPropagation();const order=(crmColConfig||{}).order||CRM_ALL_COLS.map(c=>c.k);if(idx>=order.length-1)return;const newOrder=[...order];[newOrder[idx],newOrder[idx+1]]=[newOrder[idx+1],newOrder[idx]];saveCrmColConfig({...crmColConfig,order:newOrder});}} style={{cursor:idx<((crmColConfig||{}).order||CRM_ALL_COLS).length-1?'pointer':'default',fontSize:9,lineHeight:1,color:idx<((crmColConfig||{}).order||CRM_ALL_COLS).length-1?T.accent:T.border,padding:'0 2px'}}>▼</span>
                </div>}
                {col.fixed&&<span style={{width:28}}/>}
                <input type="checkbox" checked={!isHidden} disabled={col.fixed} onChange={()=>{const h=[...((crmColConfig||{}).hidden||[])];if(isHidden){const i=h.indexOf(colK);if(i>-1)h.splice(i,1);}else{h.push(colK);}saveCrmColConfig({...crmColConfig,hidden:h});}} style={{accentColor:T.accent,cursor:col.fixed?'default':'pointer'}}/>
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
                    const h=[...((crmColConfig||{}).hidden||[])];
                    let order=[...((crmColConfig||{}).order||CRM_STD_COLS.map(c=>c.k))];
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
      {collabCrmAdvOpen && (
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
            <div key={f.id} onClick={()=>{(typeof setCollabCrmAdvFilters==='function'?setCollabCrmAdvFilters:function(){})(p=>({...p,scoreRange:p.scoreRange===f.id?'':f.id}));setCollabCrmPage(0);}} style={{padding:"3px 8px",borderRadius:12,fontSize:10,fontWeight:600,cursor:"pointer",background:(collabCrmAdvFilters||{}).scoreRange===f.id?(f.c||T.accent)+"18":T.surface,color:(collabCrmAdvFilters||{}).scoreRange===f.id?(f.c||T.accent):T.text3,border:`1px solid ${(collabCrmAdvFilters||{}).scoreRange===f.id?(f.c||T.accent)+"44":T.border}`}}>{f.label}</div>
          ))}
          {/* Filtre Période création */}
          <span style={{fontSize:11,fontWeight:600,color:T.text3,marginLeft:6}}>Créé:</span>
          <select value={(collabCrmAdvFilters||{})._createdPeriod||''} onChange={e=>{(typeof setCollabCrmAdvFilters==='function'?setCollabCrmAdvFilters:function(){})(p=>({...p,_createdPeriod:e.target.value}));setCollabCrmPage(0);}} style={{padding:'4px 8px',borderRadius:8,border:`1px solid ${T.border}`,fontSize:11,background:T.surface,color:T.text,fontFamily:'inherit',cursor:'pointer'}}>
            <option value="">Toutes dates</option>
            <option value="today">Aujourd'hui</option>
            <option value="7d">7 derniers jours</option>
            <option value="30d">30 derniers jours</option>
            <option value="90d">3 derniers mois</option>
          </select>
          {/* Filtre date personnalisée */}
          <input type="date" value={(collabCrmAdvFilters||{})._createdFrom||''} onChange={e=>{(typeof setCollabCrmAdvFilters==='function'?setCollabCrmAdvFilters:function(){})(p=>({...p,_createdFrom:e.target.value,_createdPeriod:''}));setCollabCrmPage(0);}} style={{padding:'3px 6px',borderRadius:8,border:`1px solid ${T.border}`,fontSize:10,background:T.surface,color:T.text,fontFamily:'inherit'}} title="Du"/>
          <span style={{fontSize:10,color:T.text3}}>→</span>
          <input type="date" value={(collabCrmAdvFilters||{})._createdTo||''} onChange={e=>{(typeof setCollabCrmAdvFilters==='function'?setCollabCrmAdvFilters:function(){})(p=>({...p,_createdTo:e.target.value,_createdPeriod:''}));setCollabCrmPage(0);}} style={{padding:'3px 6px',borderRadius:8,border:`1px solid ${T.border}`,fontSize:10,background:T.surface,color:T.text,fontFamily:'inherit'}} title="Au"/>
          {/* Reset */}
          {((collabCrmAdvFilters||{}).scoreRange||(collabCrmAdvFilters||{}).hasEmail!==null||(collabCrmAdvFilters||{}).hasPhone!==null||collabCrmFilterStage||(collabCrmAdvFilters||{})._createdPeriod||(collabCrmAdvFilters||{})._createdFrom)&&<span onClick={()=>{(typeof setCollabCrmAdvFilters==='function'?setCollabCrmAdvFilters:function(){})({scoreRange:'',hasEmail:null,hasPhone:null,_createdPeriod:'',_createdFrom:'',_createdTo:''});(typeof setCollabCrmFilterStage==='function'?setCollabCrmFilterStage:function(){})('');setCollabCrmPage(0);}} style={{fontSize:11,color:"#EF4444",cursor:"pointer",fontWeight:600,marginLeft:6}}>✕ Reset</span>}
        </div>
      )}
      {/* Active filters summary */}
      {collabCrmFilterFollowup>0&&(
        <div style={{display:"flex",gap:6,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
          <span onClick={()=>{(typeof setCollabCrmFilterFollowup==='function'?setCollabCrmFilterFollowup:function(){})(0);setCollabCrmPage(0);}} style={{padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",background:"#EF444418",color:"#EF4444"}}>✕ +{collabCrmFilterFollowup}j sans contact</span>
        </div>
      )}
      {collabContactTags.length > 0 && (
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
          {collabContactTags.map(t => (
            <div key={t} onClick={() => (typeof setCollabCrmFilterTags==='function'?setCollabCrmFilterTags:function(){})(p => p.includes(t)?p.filter(x=>x!==t):[...p,t])} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer", background:(collabCrmFilterTags||[]).includes(t)?"#7C3AED18":T.bg, color:(collabCrmFilterTags||[]).includes(t)?"#7C3AED":T.text3, border:`1px solid ${(collabCrmFilterTags||[]).includes(t)?"#7C3AED44":T.border}` }}>{t}</div>
          ))}
          {(collabCrmFilterTags||[]).length > 0 && <div onClick={() => (typeof setCollabCrmFilterTags==='function'?setCollabCrmFilterTags:function(){})([])} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer", color:"#EF4444" }}>Effacer filtres</div>}
        </div>
      )}
    </>
  );
};

export default CrmFiltersBar;
