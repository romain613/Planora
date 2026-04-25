// Phase 13b — extracted Agenda tab from CollabPortal.jsx (was lines 3629-4444).

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Avatar, Badge, Modal, Spinner, Stat } from "../../../shared/ui"; // hotfix 2026-04-23 — +Stat
import { DAYS_FR, DAYS_SHORT, MONTHS_FR, getDow, fmtDate, formatDateTime, formatDate } from "../../../shared/utils/dates";
import { PIPELINE_LABELS, STATUS_COLORS } from "../../../shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../../shared/utils/notifications";
import { _T } from "../../../shared/state/tabState";
import { useCollabContext } from "../context/CollabContext";

const AgendaTab = () => {
  const {
    collab, company, showNotif,
    bookings, contacts,
    calendars, setCalendars,
    weekOffset, setWeekOffset,
    monthOffset, setMonthOffset,
    selectedDay, setSelectedDay,
    selectedBooking, setSelectedBooking,
    calAccordionOpen, setCalAccordionOpen,
    mrStatusFilter, setMrStatusFilter,
    editCalModal, setEditCalModal,
    editCalSlugAvail, setEditCalSlugAvail,
    actionLoading, setActionLoading,
    viewMode, setViewMode,
    agendaZoom, setAgendaZoom,
    agendaWorkHours, setAgendaWorkHours,
    gridThemeId, setGridThemeId,
    customGridColors, setCustomGridColors,
    showGridColors, setShowGridColors,
    gridColorPresets,
    myBookings, myCalendars, monthDays, agendaFillRate,
    getBookingAt, getGoogleEventAt, updateBooking, cancelBookingAndCascade,
    portalTab, setPortalTab, setPortalTabKey,
    setPhoneScheduleForm, setPhoneShowScheduleModal,
    // ── Hotfix audit 2026-04-23 — wire missing symbols ──
  agendaScrolledRef,
    // ── Hotfix audit 2026-04-23 (v3) ──
  googleLoading,
  // ── AST audit 2026-04-23 (v7) ──
  basePreset, dayBookings, dayDate, exportICS, googleConnected, gridTheme, hours, isAvailableSlot, monthMonth, monthYear, myGoogleEvents, syncGoogle, today, todayStr, weekDates, ZOOM_LEVELS,
  } = useCollabContext();

  return (
<div>
  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
    <div>
      <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:-0.5, marginBottom:4 }}>{collab?.name ? `Agenda de ${collab.name.split(' ')[0]}` : 'Mon Agenda'}</h1>
      {agendaFillRate.totalSlots > 0 ? (
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:80,height:6,borderRadius:3,background:T.border,overflow:'hidden',flexShrink:0}}>
            <div style={{height:'100%',borderRadius:3,background:agendaFillRate.rate>80?'#EF4444':agendaFillRate.rate>50?'#F59E0B':'#22C55E',width:agendaFillRate.rate+'%',transition:'width .5s'}}/>
          </div>
          <span style={{fontSize:11,color:agendaFillRate.rate>80?'#EF4444':agendaFillRate.rate>50?'#F59E0B':'#22C55E',fontWeight:700}}>{agendaFillRate.rate}%</span>
          <span style={{fontSize:11,color:T.text3}}>
            {agendaFillRate.bookedSlots}/{agendaFillRate.totalSlots} créneaux pris · {agendaFillRate.freeSlots} dispo{agendaFillRate.freeSlots>1?'s':''}
            {viewMode==='day'?' aujourd\'hui':viewMode==='week'?' cette semaine':' ce mois'}
          </span>
          <span style={{fontSize:13}}>{agendaFillRate.rate>80?'🔥':agendaFillRate.rate>50?'📊':agendaFillRate.rate>20?'📅':'😌'}</span>
        </div>
      ) : (
        <div style={{fontSize:11,color:T.text3}}>📅 <span onClick={()=>setPortalTab('availability')} style={{color:T.accent,cursor:'pointer',textDecoration:'underline'}}>Configurez vos disponibilités</span> pour voir le taux de remplissage</div>
      )}
    </div>
    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
      <div style={{ display:"flex", borderRadius:8, border:`1px solid ${T.border}`, overflow:"hidden" }}>
        {[{id:"day",label:"Jour"},{id:"week",label:"Semaine"},{id:"month",label:"Mois"}].map(v => (
          <div key={v.id} onClick={() => setViewMode(v.id)} style={{
            padding:"6px 14px", cursor:"pointer", fontSize:12, fontWeight:600,
            background:viewMode===v.id?T.accentBg:T.surface, color:viewMode===v.id?T.accent:T.text2,
            borderRight:v.id!=="month"?`1px solid ${T.border}`:"none",
          }}>{v.label}</div>
        ))}
      </div>
      <Btn small onClick={() => {
        if(viewMode==="week") setWeekOffset(w=>w-1);
        else if(viewMode==="day") setSelectedDay(prev => { const d=new Date(prev||dayDate); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; });
        else setMonthOffset(m=>m-1);
      }}><I n="chevL" s={14}/></Btn>
      <Btn small onClick={() => {
        if(viewMode==="week") setWeekOffset(0);
        else if(viewMode==="day") setSelectedDay(null);
        else setMonthOffset(0);
        agendaScrolledRef.current = false;
      }} style={{background:((typeof weekOffset!=='undefined'?weekOffset:null)===0&&!selectedDay&&(typeof monthOffset!=='undefined'?monthOffset:null)===0)?'#22C55E':'',color:((typeof weekOffset!=='undefined'?weekOffset:null)===0&&!selectedDay&&(typeof monthOffset!=='undefined'?monthOffset:null)===0)?'#fff':'',border:((typeof weekOffset!=='undefined'?weekOffset:null)===0&&!selectedDay&&(typeof monthOffset!=='undefined'?monthOffset:null)===0)?'1px solid #22C55E':'',fontWeight:700}}>Aujourd'hui</Btn>
      <Btn small onClick={() => {
        if(viewMode==="week") setWeekOffset(w=>w+1);
        else if(viewMode==="day") setSelectedDay(prev => { const d=new Date(prev||dayDate); d.setDate(d.getDate()+1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; });
        else setMonthOffset(m=>m+1);
      }}><I n="chevR" s={14}/></Btn>
      <div style={{ width:1, height:24, background:T.border, margin:"0 4px" }}/>
      {/* Zoom grille */}
      {viewMode !== "month" && <div style={{ display:"flex", alignItems:"center", gap:4, background:T.bg, borderRadius:8, padding:"3px 6px", border:`1px solid ${T.border}` }}>
        <span onClick={() => { const idx = ZOOM_LEVELS.indexOf(agendaZoom); if (idx > 0) setAgendaZoom(ZOOM_LEVELS[idx-1]); }} style={{ cursor:agendaZoom>ZOOM_LEVELS[0]?'pointer':'not-allowed', opacity:agendaZoom>ZOOM_LEVELS[0]?1:0.3, padding:"0 4px", fontSize:14, fontWeight:700, color:T.text2, userSelect:'none' }}>−</span>
        <span style={{ fontSize:10, fontWeight:600, color:T.text3, minWidth:28, textAlign:'center' }}>{agendaZoom}px</span>
        <span onClick={() => { const idx = ZOOM_LEVELS.indexOf(agendaZoom); if (idx < ZOOM_LEVELS.length-1) setAgendaZoom(ZOOM_LEVELS[idx+1]); }} style={{ cursor:agendaZoom<ZOOM_LEVELS[ZOOM_LEVELS.length-1]?'pointer':'not-allowed', opacity:agendaZoom<ZOOM_LEVELS[ZOOM_LEVELS.length-1]?1:0.3, padding:"0 4px", fontSize:14, fontWeight:700, color:T.text2, userSelect:'none' }}>+</span>
      </div>}
      {/* Toggle heures ouvrées */}
      {viewMode !== "month" && <div onClick={() => setAgendaWorkHours(v=>!v)} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 10px", borderRadius:8, cursor:"pointer", background:agendaWorkHours?T.accentBg:T.bg, border:`1px solid ${agendaWorkHours?T.accent+'40':T.border}`, transition:"all .15s" }} title={agendaWorkHours?"Afficher 0h-24h":"Afficher 7h-21h"}>
        <I n="clock" s={12} style={{color:agendaWorkHours?T.accent:T.text3}}/>
        <span style={{ fontSize:10, fontWeight:600, color:agendaWorkHours?T.accent:T.text3 }}>{agendaWorkHours?"7h–21h":"24h"}</span>
      </div>}
      <div style={{ width:1, height:24, background:T.border, margin:"0 4px" }}/>
      <Btn small onClick={()=>{setPhoneScheduleForm({contactId:'',contactName:'',number:'',date:new Date().toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{display:"flex",alignItems:"center",gap:4,background:"#F59E0B",color:"#fff",border:"none",fontWeight:700}}><I n="calendar-plus" s={14}/> Nouveau RDV</Btn>
      <Btn small primary onClick={(typeof googleConnected!=='undefined'?googleConnected:null) ? syncGoogle : exportICS} disabled={googleLoading} title="Synchroniser avec Google Agenda" style={{ display:"flex", alignItems:"center", gap:4 }}><I n="calendar" s={14}/> {(typeof googleLoading!=='undefined'?googleLoading:null) ? "Sync..." : "Sync"}</Btn>
      <div style={{ position:"relative" }}>
        <div onClick={() => (typeof setShowGridColors==='function'?setShowGridColors:function(){})(!showGridColors)} style={{ width:28, height:28, borderRadius:8, background:`linear-gradient(135deg,${gridTheme.avail},${gridTheme.accent}40)`, border:`2px solid ${gridTheme.accent}`, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }} title="Couleur de la grille">
          <I n="palette" s={13} style={{ color:gridTheme.accent }}/>
        </div>
        {(typeof showGridColors!=='undefined'?showGridColors:null) && (
          <div style={{ position:"absolute", top:36, right:0, background:T.surface, borderRadius:14, border:`1px solid ${T.border}`, boxShadow:"0 12px 40px rgba(0,0,0,0.15)", padding:16, zIndex:50, width:300 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:700, color:T.text }}>Couleurs de la grille</div>
              <span onClick={() => setShowGridColors(false)} style={{ cursor:"pointer", color:T.text3, padding:2 }}><I n="x" s={14}/></span>
            </div>
            {/* Presets rapides */}
            <div style={{ fontSize:10, fontWeight:600, color:T.text3, marginBottom:6 }}>Thèmes rapides</div>
            <div style={{ display:"flex", gap:5, marginBottom:12, flexWrap:"wrap" }}>
              {gridColorPresets.map(p => (
                <div key={p.id} onClick={() => { setGridThemeId(p.id); setCustomGridColors(null); }} style={{
                  padding:"5px 10px", borderRadius:6, cursor:"pointer", fontSize:10, fontWeight:600,
                  border:`2px solid ${gridThemeId===p.id && !customGridColors?p.accent:T.border}`,
                  background:`linear-gradient(135deg,${p.avail},${p.accent}20)`,
                  color:gridThemeId===p.id && !customGridColors?p.accent:T.text2,
                }}>{p.label}</div>
              ))}
            </div>
            {/* Couleurs individuelles */}
            <div style={{ fontSize:10, fontWeight:600, color:T.text3, marginBottom:8 }}>Personnaliser chaque élément</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {[
                { key:"avail", label:"Disponible", desc:"Créneaux libres" },
                { key:"unavail", label:"Indisponible", desc:"Hors dispo" },
                { key:"pause", label:"Pause / Buffer", desc:"Temps entre RDV" },
                { key:"booking", label:"RDV réservé", desc:"Bordure des bookings" },
                { key:"google", label:"Google Agenda", desc:"Événements externes" },
                { key:"nowLine", label:"Heure actuelle", desc:"Ligne de temps" },
                { key:"accent", label:"Accent / Titres", desc:"Couleur principale" },
                { key:"border", label:"Bordures grille", desc:"Séparations" },
              ].map(item => (
                <div key={item.key} style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ position:"relative", width:28, height:28, borderRadius:7, border:`2px solid ${T.border}`, cursor:"pointer", overflow:"hidden", flexShrink:0 }}>
                    <div style={{ width:"100%", height:"100%", background:gridTheme[item.key], borderRadius:5 }}/>
                    <input type="color" value={gridTheme[item.key]} onChange={e => { setCustomGridColors({ ...(customGridColors || basePreset), [item.key]: e.target.value }); }} style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", opacity:0, cursor:"pointer" }}/>
                  </label>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:T.text }}>{item.label}</div>
                    <div style={{ fontSize:9, color:T.text3 }}>{item.desc}</div>
                  </div>
                  <span style={{ fontSize:9, fontFamily:"monospace", color:T.text3, background:T.bg, padding:"2px 5px", borderRadius:4 }}>{gridTheme[item.key]}</span>
                </div>
              ))}
            </div>
            {customGridColors && (
              <div style={{ marginTop:10, display:"flex", justifyContent:"flex-end" }}>
                <span onClick={() => setCustomGridColors(null)} style={{ fontSize:10, fontWeight:600, color:T.danger, cursor:"pointer", padding:"4px 8px", borderRadius:6, background:T.dangerBg }}>Réinitialiser</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>

  {/* Compteurs RDV — filtres cliquables */}
  {(()=>{
    const myBk = (bookings||[]).filter(b=>b.collaboratorId===collab.id);
    const confirmed = myBk.filter(b=>b.status==='confirmed'||b.status==='completed').length;
    const pending = myBk.filter(b=>b.status==='pending').length;
    const cancelled = myBk.filter(b=>b.status==='cancelled').length;
    const total = confirmed + pending + cancelled;
    const [agendaFilter, setAgendaFilter] = [_T.agendaFilter||'all', (v)=>{_T.agendaFilter=v;setPortalTabKey(k=>k+1);}];
    return <div style={{display:'flex',gap:8,marginBottom:14}}>
      {[
        {id:'confirmed',label:'Confirmés',count:confirmed,icon:'check',color:'#22C55E',bg:'#22C55E08'},
        {id:'pending',label:'En attente',count:pending,icon:'clock',color:'#F59E0B',bg:'#F59E0B08'},
        {id:'cancelled',label:'Annulés',count:cancelled,icon:'x',color:'#EF4444',bg:'#EF444408'},
        {id:'all',label:'Total',count:total,icon:'calendar',color:'#3B82F6',bg:'#3B82F608'},
      ].map(f=>(
        <div key={f.id} onClick={()=>setAgendaFilter(agendaFilter===f.id?'all':f.id)} style={{flex:1,padding:'10px 12px',borderRadius:10,background:agendaFilter===f.id?f.color+'12':f.bg,border:'1.5px solid '+(agendaFilter===f.id?f.color+'40':'transparent'),cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.borderColor=f.color+'30'} onMouseLeave={e=>{if(agendaFilter!==f.id)e.currentTarget.style.borderColor='transparent';}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
            <div style={{width:24,height:24,borderRadius:6,background:f.color+'15',display:'flex',alignItems:'center',justifyContent:'center'}}><I n={f.icon} s={12} style={{color:f.color}}/></div>
            <span style={{fontSize:11,fontWeight:600,color:T.text2}}>{f.label}</span>
          </div>
          <div style={{fontSize:22,fontWeight:800,color:T.text}}>{f.count}</div>
        </div>
      ))}
    </div>;
  })()}

  {/* Calendar legend */}
  <div style={{ display:"flex", gap:12, marginBottom:16, flexWrap:"wrap" }}>
    {calendars.filter(c => c.collaborators.includes(collab.id)).map(cal => (
      <div key={cal.id} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:T.text2 }}>
        <div style={{ width:10, height:10, borderRadius:3, background:cal.color }}/> {cal.name}
        <Badge color={cal.type==="multi"?T.purple:T.accent} bg={cal.type==="multi"?T.purpleBg:T.accentBg}>{cal.type==="multi"?"Multi":"Simple"}</Badge>
      </div>
    ))}
    {(typeof googleConnected!=='undefined'?googleConnected:null) && myGoogleEvents.length > 0 && (
      <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:gridTheme.google }}>
        <div style={{ width:10, height:10, borderRadius:3, background:`repeating-linear-gradient(135deg,${gridTheme.google}40,${gridTheme.google}40 2px,transparent 2px,transparent 4px)`, border:`1px solid ${gridTheme.google}` }}/> Google Agenda
        <Badge color={gridTheme.google} bg={gridTheme.google+"18"}>{collab.google_events_private ? "Occupé" : "Synchro"}</Badge>
      </div>
    )}
  </div>

  {/* ── AUTRES CALENDRIERS (accordéon) — seulement si plusieurs calendriers ── */}
  {myCalendars.length > 1 && <div style={{ marginBottom:16 }}>
    <div onClick={() => (typeof setCalAccordionOpen==='function'?setCalAccordionOpen:function(){})(!calAccordionOpen)} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:10, background:T.accentBg||T.accent+'08', border:`1px solid ${T.accent}20`, cursor:'pointer', transition:'all .15s' }}>
      <I n="link" s={14} color={T.accent}/>
      <span style={{ fontSize:12, fontWeight:700, color:T.accent, flex:1 }}>Autres calendriers ({myCalendars.length - 1})</span>
      <I n={(typeof calAccordionOpen!=='undefined'?calAccordionOpen:null)?'chevron-up':'chevron-down'} s={14} color={T.accent}/>
    </div>
    {(typeof calAccordionOpen!=='undefined'?calAccordionOpen:null) && <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6 }}>
      {myCalendars.slice(1).map(cal => {
        const calBookings = myBookings.filter(b => b.calendarId === cal.id);
        const confirmed = calBookings.filter(b => b.status === "confirmed").length;
        const publicUrl = `https://calendar360.fr/book/${company.slug}/${cal.slug}`;
        return <div key={cal.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, background:T.card||T.surface, border:`1px solid ${T.border}` }}>
          <div style={{ width:8, height:8, borderRadius:4, background:cal.color, flexShrink:0 }}/>
          <span style={{ fontSize:12, fontWeight:600, color:T.text }}>{cal.name}</span>
          <Badge color={cal.color}>{cal.type==="multi"?"Multi":"Simple"}</Badge>
          <span style={{ fontSize:10, color:T.text3 }}>{cal.duration||30}min · {confirmed} confirmé{confirmed>1?'s':''}</span>
          <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
            <Btn small primary onClick={() => { navigator.clipboard.writeText(publicUrl); showNotif("Lien copié !"); }} title={publicUrl}><I n="copy" s={11}/> Copier</Btn>
            <Btn small onClick={() => window.open(publicUrl, "_blank")}><I n="external-link" s={11}/></Btn>
          </div>
        </div>;
      })}
    </div>}
  </div>}

  {/* ── DAY VIEW ── */}
  {viewMode === "day" && (() => {
    const nowH = today.getHours();
    const nowM = today.getMinutes();
    const nowSlot = `${String(nowH).padStart(2,"0")}:${nowM < 30 ? "00" : "30"}`;
    const isDayToday = dayDate === todayStr;
    return (
    <div>
      <div style={{ textAlign:"center", marginBottom:12 }}>
        <div style={{ fontSize:16, fontWeight:700, color:T.accent }}>{DAYS_FR[getDow(dayDate)]} {new Date(dayDate).getDate()} {MONTHS_FR[new Date(dayDate).getMonth()]} {new Date(dayDate).getFullYear()}</div>
        <div style={{ fontSize:12, color:T.text3, marginTop:4 }}>{dayBookings.length} RDV · {myGoogleEvents.filter(ge => ge.startTime.slice(0,10) === dayDate).length} événements Google</div>
      </div>
      <Card style={{ padding:0, overflow:"hidden", borderRadius:12 }}>
        <div ref={el => { if (el && isDayToday && !agendaScrolledRef.current) { agendaScrolledRef.current = true; const scrollTo = Math.max(0, (nowH - (agendaWorkHours?7:0) - 2) * agendaZoom * 2); setTimeout(() => el.scrollTop = scrollTo, 100); } }} style={{ maxHeight:600, overflowY:"auto", overflowX:"hidden" }}>
          {hours.map(hour => {
            const minutePart = hour.slice(3);
            const isFullHour = minutePart === "00";
            const slotMin = parseInt(hour)*60+parseInt(minutePart);
            const slotH = agendaZoom;
            // Bookings qui COMMENCENT dans ce slot de 30min
            const hBookings = dayBookings.filter(b => { const [bH,bM] = (b.time||'0:0').split(':').map(Number); const bMin = bH*60+(bM||0); return bMin >= slotMin && bMin < slotMin + 30; });
            const hGoogleEvents = getGoogleEventAt(dayDate, hour).filter(ge => { if (ge.allDay) return hour === hours[0]; const geMin = parseInt(ge.startTime.slice(11,13))*60+parseInt(ge.startTime.slice(14,16)); return geMin >= slotMin && geMin < slotMin + 30; });
            const isAvail = isAvailableSlot(dayDate, hour);
            const isFreeSlot = isAvail && hBookings.length === 0;
            const isNow = isDayToday && Math.abs(slotMin - (nowH*60+nowM)) < 30 && slotMin <= nowH*60+nowM;
            const nowOffsetPx = isNow ? Math.round(((nowH*60+nowM) - slotMin) / 30 * slotH) : 0;
            return (
              <div key={hour} style={{ display:"grid", gridTemplateColumns:"56px 1fr", height:slotH, borderBottom:`1px solid ${isFullHour ? '#e5e7eb' : '#f3f4f6'}`, position:"relative" }}>
                {isNow && <div style={{ position:"absolute", left:48, right:0, top:nowOffsetPx, height:2, background:'#EA4335', zIndex:10 }}><div style={{ position:'absolute', left:-5, top:-4, width:10, height:10, borderRadius:5, background:'#EA4335' }}/></div>}
                <div style={{ padding:"0 8px", fontSize:11, color:isFullHour?'#70757a':'transparent', textAlign:"right", fontFamily:"-apple-system,sans-serif", lineHeight:slotH+'px', borderRight:'1px solid #dadce0', fontWeight:400, userSelect:'none' }}>{isFullHour ? (parseInt(hour)<10?parseInt(hour):hour.slice(0,2))+':00' : ''}</div>
                <div onClick={()=>{if(isFreeSlot){setPhoneScheduleForm({contactId:'',contactName:'',number:'',date:dayDate,time:hour,duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}}} onMouseEnter={e=>{if(isFreeSlot)e.currentTarget.style.background='#E8F5E920';}} onMouseLeave={e=>{if(isFreeSlot)e.currentTarget.style.background=isAvail?'#fff':'#f8f9fa';}} style={{ position:"relative", overflow:"visible", background: isAvail ? '#fff' : '#f8f9fa', cursor:isFreeSlot?'pointer':'default', transition:'background .1s' }}>
                  {hBookings.map(b => {
                    const cal = calendars.find(c => c.id === b.calendarId);
                    const dur = b.duration || 30;
                    const [bH,bM] = (b.time||'0:0').split(':').map(Number);
                    const bMin = bH*60+(bM||0);
                    const endTotal = bMin + dur;
                    const endTime = String(Math.floor(endTotal/60)).padStart(2,'0')+':'+String(endTotal%60).padStart(2,'0');
                    const offsetMin = bMin - slotMin;
                    const offsetPx = Math.round(offsetMin / 30 * slotH);
                    const blockHeight = Math.max(24, Math.round(dur / 30 * slotH));
                    const _bContact=(contacts||[]).find(c=>c.id===b.contactId||(c.email&&b.visitorEmail&&c.email.toLowerCase()===b.visitorEmail.toLowerCase()));
                    const _bColor=_bContact?.card_color||'#4285F4';
                    return (
                      <div key={b.id} onClick={(e) => {e.stopPropagation(); setSelectedBooking(b);}} style={{
                        padding:"4px 10px", borderRadius:6, cursor:"pointer",
                        background:_bColor, borderLeft:_bContact?.card_color?`4px solid ${_bColor}`:'none',
                        fontSize:12, lineHeight:1.3,
                        height: blockHeight,
                        position:'absolute', top: offsetPx, left:2, width:'calc(100% - 8px)', zIndex:2,
                        opacity:b.status==="cancelled"?0.4:1,
                        boxShadow:`0 1px 3px ${_bColor}40`, color:'#fff',
                      }}>
                        <div style={{ fontWeight:600, textDecoration:b.status==="cancelled"?"line-through":"none", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{(()=>{const _ct=b.contactId?(contacts||[]).find(_c=>_c.id===b.contactId):null; const _xc=_ct?.assignedTo&&Array.isArray(_ct.shared_with)&&_ct.shared_with.length>0; return _xc?<span title="RDV cross-collaborateur">🤝 </span>:null;})()}{b.visitorName}</div>
                        <div style={{ fontSize:11, opacity:0.9 }}>{b.time} → {endTime} · {dur}min</div>
                      </div>
                    );
                  })}
                  {hGoogleEvents.map(ge => (
                    <div key={"ge-"+ge.id} style={{
                      padding:"8px 12px", borderRadius:8, marginBottom:2,
                      background:`repeating-linear-gradient(135deg,${gridTheme.google}14,${gridTheme.google}14 3px,transparent 3px,transparent 6px)`,
                      borderLeft:`3px solid ${gridTheme.google}`, fontSize:12, lineHeight:1.4, opacity:0.85, display:"flex", alignItems:"center", gap:8,
                    }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, color:T.text3 }}>{collab.google_events_private ? "Occupé" : (ge.summary || "Occupé")}</div>
                        <div style={{ color:gridTheme.google, fontWeight:600, fontSize:11 }}>{ge.allDay ? "Journée entière" : `${ge.startTime.slice(11,16)} - ${ge.endTime.slice(11,16)}`} · Google Agenda</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink:0 }}><circle cx="12" cy="12" r="10" fill="#4285F4" opacity=".2"/><path d="M12 7v5l3 3" stroke="#4285F4" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
    );
  })()}

  {/* ── WEEK VIEW ── */}
  {viewMode === "week" && (() => {
    const nowH = today.getHours();
    const nowM = today.getMinutes();
    const nowSlot = `${String(nowH).padStart(2,"0")}:${nowM < 30 ? "00" : "30"}`;
    return (
    <Card style={{ padding:0, overflow:"hidden", borderRadius:12 }}>
      <div style={{ display:"grid", gridTemplateColumns:"52px repeat(7,1fr)", borderBottom:`1px solid ${T.border}` }}>
        <div style={{ padding:8, borderRight:`1px solid ${T.border}` }}/>
        {weekDates.map((ds,i) => {
          const d = new Date(ds);
          const isToday = ds === todayStr;
          const dayBks = myBookings.filter(b => b.date === ds && b.status !== "cancelled");
          const dayBkCount = dayBks.length;
          const dayTotalMin = dayBks.reduce((sum,b) => sum + (b.duration||30), 0);
          const dayTotalH = Math.floor(dayTotalMin/60);
          const dayTotalM = dayTotalMin%60;
          return (
            <div key={ds} onClick={() => { setSelectedDay(ds); setViewMode("day"); }} style={{ padding:"8px 4px", textAlign:"center", borderRight:i<6?`1px solid ${T.border}`:"none", background:isToday?"linear-gradient(135deg,"+T.accent+"18,"+T.accent+"08)":"transparent", cursor:"pointer", transition:"background .15s" }}>
              <div style={{ fontSize:10, fontWeight:700, color:isToday?T.accent:T.text3, textTransform:"uppercase", letterSpacing:1 }}>{DAYS_SHORT[i]}</div>
              <div style={{ fontSize:20, fontWeight:800, color:isToday?T.accent:T.text, lineHeight:1.2 }}>{d.getDate()}</div>
              {dayBkCount > 0 ? <div style={{ fontSize:9, fontWeight:700, color:T.accent, marginTop:2 }}>{dayBkCount} RDV · {dayTotalH>0?dayTotalH+'h':''}{ dayTotalM>0?dayTotalM+'min':dayTotalH>0?'':'0min'}</div> : <div style={{fontSize:9,color:T.text3,marginTop:2,opacity:0.5}}>—</div>}
            </div>
          );
        })}
      </div>
      <div ref={el => { if (el && weekDates.includes(todayStr) && !agendaScrolledRef.current) { agendaScrolledRef.current = true; const scrollTo = Math.max(0, (nowH - 2) * agendaZoom); setTimeout(() => el.scrollTop = scrollTo, 100); } }} style={{ maxHeight:600, overflowY:"auto" }}>
        {hours.map((hour, hi) => {
          const isFullHour = hour.endsWith(":00");
          const slotMin = parseInt(hour)*60+parseInt(hour.slice(3));
          const slotH = agendaZoom;
          const isNowRow = weekDates.includes(todayStr) && Math.abs(slotMin - (nowH*60+nowM)) < 30 && slotMin <= nowH*60+nowM;
          const nowOffPx = isNowRow ? Math.round(((nowH*60+nowM) - slotMin) / 30 * slotH) : 0;
          return (
          <div key={hour} style={{ display:"grid", gridTemplateColumns:"56px repeat(7,1fr)", height:slotH, borderBottom:`1px solid ${isFullHour ? '#dadce0' : '#f1f3f4'}`, position:"relative" }}>
            {isNowRow && <div style={{ position:"absolute", left:48, right:0, top:nowOffPx, height:2, background:'#EA4335', zIndex:10, pointerEvents:'none' }}><div style={{ position:'absolute', left:-5, top:-4, width:10, height:10, borderRadius:5, background:'#EA4335' }}/></div>}
            <div style={{ padding:"0 8px", fontSize:11, color:isFullHour?'#70757a':'transparent', textAlign:"right", fontFamily:"-apple-system,sans-serif", lineHeight:slotH+'px', borderRight:'1px solid #dadce0', fontWeight:400, userSelect:'none' }}>{isFullHour ? (parseInt(hour)<10?parseInt(hour):hour.slice(0,2))+':00' : ''}</div>
            {weekDates.map((ds,i) => {
              const cellBookings = getBookingAt(ds, hour);
              const cellGoogleEvents = getGoogleEventAt(ds, hour);
              const isToday = ds === todayStr;
              const isAvail = isAvailableSlot(ds, hour);
              const isStartSlot = (b) => { const [bH,bM] = (b.time||'0:0').split(':').map(Number); const bMin = bH*60+(bM||0); return bMin >= slotMin && bMin < slotMin + 30; };
              const isGeStart = (ge) => { if (ge.allDay) return hour === hours[0]; const geSlotMin = parseInt(ge.startTime.slice(11,13))*60+parseInt(ge.startTime.slice(14,16)); return geSlotMin >= slotMin && geSlotMin < slotMin + 30; };
              const isEmptyAvail = isAvail && cellBookings.length===0 && cellGoogleEvents.length===0;
              return (
                <div key={ds+hour} onClick={()=>{if(isEmptyAvail){setPhoneScheduleForm({contactId:'',contactName:'',number:'',date:ds,time:hour,duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}}} title={isEmptyAvail?'+ Créer un RDV':undefined} onMouseEnter={e=>{if(isEmptyAvail)e.currentTarget.style.background='#E8F5E920';}} onMouseLeave={e=>{e.currentTarget.style.background=isToday?'#E8F0FE40':isAvail?'#fff':'#f8f9fa';}} style={{
                  borderRight:i<6?'1px solid #dadce060':'none', padding:0,
                  background: isToday ? '#E8F0FE40' : isAvail ? '#fff' : '#f8f9fa',
                  height:slotH, position:"relative", overflow:'visible',
                  cursor: isEmptyAvail ? 'pointer' : 'default', transition:'background .1s',
                }}>
                  {cellBookings.filter(b => isStartSlot(b)).map(b => {
                    const dur = b.duration||30;
                    const [bH,bM] = (b.time||'0:0').split(':').map(Number);
                    const bMin = bH*60+(bM||0);
                    const endTotal = bMin + dur;
                    const endTime = String(Math.floor(endTotal/60)).padStart(2,'0')+':'+String(endTotal%60).padStart(2,'0');
                    const offsetMin = bMin - slotMin;
                    const offsetPx = Math.round(offsetMin / 30 * slotH);
                    const blockHeight = Math.max(20, Math.round(dur / 30 * slotH));
                    const _wContact=b.contactId&&(contacts||[]).find(c=>c.id===b.contactId);
                    const bkDisplayName = _wContact?.name || b.visitorName;
                    const _agXC = _wContact?.assignedTo && Array.isArray(_wContact.shared_with) && _wContact.shared_with.length > 0;
                    const _agDisplay = _agXC ? '🤝 ' + bkDisplayName : bkDisplayName;
                    const _wColor=_wContact?.card_color||'#4285F4';
                    return (
                      <div key={b.id} onClick={(e) => {e.stopPropagation(); setSelectedBooking(b);}} style={{
                        padding:"2px 6px", borderRadius:4, cursor:"pointer",
                        background:_wColor, color:'#fff',
                        fontSize:10, lineHeight:1.2,
                        height: blockHeight, overflow:'hidden',
                        position:'absolute', top: offsetPx, left:2, width:'calc(100% - 4px)', zIndex:2,
                        opacity:b.status==="cancelled"?0.4:1,
                        boxShadow:`0 1px 3px ${_wColor}40`,
                      }}>
                        <div style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration:b.status==="cancelled"?"line-through":"none" }} title={bkDisplayName}>{_agDisplay}</div>
                        <div style={{ fontSize:9, opacity:0.85 }}>{b.time}–{endTime}</div>
                      </div>
                    );
                  })}
                  {cellGoogleEvents.filter(ge => isGeStart(ge)).map(ge => {
                    const geSlotMin = parseInt(ge.startTime.slice(11,13))*60+parseInt(ge.startTime.slice(14,16));
                    const offsetMin = geSlotMin - slotMin;
                    const offsetPx = Math.round(offsetMin / 30 * slotH);
                    return (
                    <div key={"ge-"+ge.id} title={collab.google_events_private ? "Occupé" : (ge.summary || "Google")} style={{
                      padding:"2px 6px", borderRadius:4,
                      background:'#039BE5', color:'#fff',
                      fontSize:10, lineHeight:1.2, position:'absolute', top:offsetPx, left:2, width:'calc(100% - 4px)', zIndex:1,
                      height: Math.max(20, Math.round(((new Date(ge.end||ge.endDate).getTime()-new Date(ge.start||ge.startDate).getTime())/60000) / 30 * slotH)),
                      overflow:'hidden', opacity:0.85,
                    }}>
                      <div style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{collab.google_events_private ? "Occupé" : (ge.summary || "")}</div>
                      <div style={{ fontSize:9, opacity:0.85 }}>{ge.allDay ? "Journée" : ge.startTime.slice(11,16)}</div>
                    </div>);
                  })}
                </div>
              );
            })}
          </div>
          );
        })}
      </div>
    </Card>
    );
  })()}

  {/* ── MONTH VIEW ── */}
  {viewMode === "month" && (
    <div>
      <div style={{ textAlign:"center", marginBottom:16 }}>
        <div style={{ fontSize:18, fontWeight:700 }}>{MONTHS_FR[monthMonth]} {monthYear}</div>
      </div>
      <Card style={{ padding:0, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", borderBottom:`1px solid ${T.border}` }}>
          {DAYS_SHORT.map(d => (
            <div key={d} style={{ padding:"8px 0", textAlign:"center", fontSize:11, fontWeight:600, color:T.text3, textTransform:"uppercase" }}>{d}</div>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
          {monthDays.map((ds, i) => {
            if (!ds) return <div key={"e"+i} style={{ minHeight:80, borderBottom:`1px solid ${T.border}08`, borderRight:`1px solid ${T.border}08` }}/>;
            const d = new Date(ds);
            const isToday = ds === todayStr;
            const dayBk = myBookings.filter(b => b.date === ds && b.status !== "cancelled");
            const dayGe = myGoogleEvents.filter(ge => { if (ge.allDay) return ds >= ge.startTime.slice(0,10) && ds < ge.endTime.slice(0,10); return ge.startTime.slice(0,10) === ds; });
            const totalItems = dayBk.length + dayGe.length;
            return (
              <div key={ds} onClick={() => { setSelectedDay(ds); setViewMode("day"); }} style={{
                minHeight:80, padding:6, borderBottom:`1px solid ${T.border}08`, borderRight:`1px solid ${T.border}08`,
                cursor:"pointer", background:isToday?T.accentBg:"transparent",
              }}>
                <div style={{ fontSize:13, fontWeight:isToday?700:500, color:isToday?T.accent:T.text, marginBottom:4 }}>{d.getDate()}</div>
                {dayBk.slice(0,3).map(b => {
                  const cal = calendars.find(c => c.id === b.calendarId);
                  const _mContact=b.contactId&&(contacts||[]).find(c=>c.id===b.contactId);
                  const _mXC = _mContact?.assignedTo && Array.isArray(_mContact.shared_with) && _mContact.shared_with.length > 0;
                  const bkName = (_mXC ? '🤝 ' : '') + (_mContact?.name || b.visitorName);
                  const _mColor=_mContact?.card_color||gridTheme.booking;
                  return (
                    <div key={b.id} title={`${b.time} — ${bkName}`} style={{ fontSize:10, padding:"2px 4px", borderRadius:3, background:_mColor+"18", color:_mColor, fontWeight:600, marginBottom:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", borderLeft:`2px solid ${_mColor}` }}>
                      {b.time} {bkName}
                    </div>
                  );
                })}
                {dayGe.slice(0, Math.max(0, 3-dayBk.length)).map(ge => (
                  <div key={"ge-"+ge.id} title={collab.google_events_private ? "Occupé (Google Agenda)" : (ge.summary || "Google Agenda")} style={{ fontSize:10, padding:"2px 4px", borderRadius:3, background:gridTheme.google+"18", color:gridTheme.google, fontWeight:600, marginBottom:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {ge.allDay ? "Journée" : ge.startTime.slice(11,16)} {collab.google_events_private ? "Occupé" : (ge.summary || "Occupé")}
                  </div>
                ))}
                {totalItems > 3 && <div style={{ fontSize:10, color:T.text3, fontWeight:600 }}>+{totalItems-3} de plus</div>}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  )}

  {/* ── PROCHAIN RDV — Countdown + Actions ── */}
  {(() => {
    const nowMs = Date.now();
    const upcoming = myBookings
      .filter(b => b.status === "confirmed" || b.status === "pending")
      .map(b => ({ ...b, _ms: new Date(`${b.date}T${b.time}:00`).getTime() }))
      .filter(b => b._ms > nowMs)
      .sort((a, b) => a._ms - b._ms);
    const next = upcoming[0];
    if (!next) return (
      <div style={{ marginTop:16, padding:"16px 20px", borderRadius:12, background:`linear-gradient(135deg,${gridTheme.avail},${gridTheme.accent}08)`, border:`1px solid ${gridTheme.border}`, display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:gridTheme.accent+"15", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <I n="calendar" s={20} style={{ color:gridTheme.accent }}/>
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:T.text }}>Aucun RDV à venir</div>
          <div style={{ fontSize:11, color:T.text3 }}>Votre agenda est libre</div>
        </div>
      </div>
    );
    const cal = calendars.find(c => c.id === next.calendarId);
    const diffMs = next._ms - nowMs;
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);
    const countdownText = diffH > 24
      ? `dans ${Math.floor(diffH/24)}j ${diffH%24}h`
      : diffH > 0
      ? `dans ${diffH}h ${diffM}min`
      : `dans ${diffM}min`;
    const isUrgent = diffH < 1;
    const isSoon = diffH < 3;
    return (
      <div style={{ marginTop:16, padding:"16px 20px", borderRadius:12, background: isUrgent ? "#FEF2F2" : "#fff", border:`2px solid ${isUrgent?"#EF4444":isSoon?"#F59E0B":"#3B82F6"}40`, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:48, height:48, borderRadius:12, background: isUrgent?"#EF444418":isSoon?"#F59E0B15":gridTheme.accent+"12", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <I n={isUrgent?"alert-circle":"clock"} s={22} style={{ color:isUrgent?"#EF4444":isSoon?"#F59E0B":gridTheme.accent }}/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
            <span style={{ fontSize:13, fontWeight:700, color:T.text }}>Prochain RDV</span>
            <span style={{ padding:"2px 8px", borderRadius:6, fontSize:10, fontWeight:700, background:isUrgent?"#EF444418":isSoon?"#F59E0B15":gridTheme.accent+"15", color:isUrgent?"#EF4444":isSoon?"#F59E0B":gridTheme.accent }}>{countdownText}</span>
          </div>
          <div style={{ fontSize:14, fontWeight:700, color:T.text }}>{next.visitorName}</div>
          <div style={{ fontSize:11, color:T.text3, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
            <span>{formatDateTime(next.date, next.time)} · {next.duration}min</span>
            {cal && <span style={{ color:cal.color, fontWeight:600 }}>{cal.name}</span>}
            {next.visitorPhone && <span><I n="phone" s={10}/> {next.visitorPhone}</span>}
          </div>
          {next.notes && <div style={{ fontSize:10, color:T.warning, fontWeight:600, marginTop:3, display:"flex", alignItems:"center", gap:4 }}><I n="file-text" s={10}/> Note : {next.notes.slice(0,60)}{next.notes.length>60?"...":""}</div>}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
          {next.visitorPhone && (
            <div onClick={() => { const phone = next.visitorPhone.replace(/\s/g,""); const msg = encodeURIComponent(`Bonjour ${next.visitorName}, rappel de votre RDV le ${formatDateTime(next.date, next.time)}. ${next.location||""}`); window.open(`https://wa.me/${phone.replace("+","")}?text=${msg}`,"_blank"); }} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 10px", borderRadius:8, background:"#25D36618", border:"1px solid #25D36640", color:"#25D366", fontSize:10, fontWeight:700, cursor:"pointer" }} title="Envoyer WhatsApp">
              <I n="message-circle" s={13}/> WhatsApp
            </div>
          )}
          {next.visitorPhone && (
            <div onClick={() => { const phone = next.visitorPhone.replace(/\s/g,""); window.open(`sms:${phone}?body=${encodeURIComponent(`Rappel: RDV le ${formatDateTime(next.date, next.time)}`)}`); }} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 10px", borderRadius:8, background:"#3B82F618", border:"1px solid #3B82F640", color:"#3B82F6", fontSize:10, fontWeight:700, cursor:"pointer" }} title="Envoyer SMS">
              <I n="smartphone" s={13}/> SMS
            </div>
          )}
          {next.visitorEmail && (
            <div onClick={() => { const subject = encodeURIComponent(`Rappel : Votre RDV du ${formatDateTime(next.date, next.time)}`); const body = encodeURIComponent(`Bonjour ${next.visitorName},\n\nRappel de votre rendez-vous :\n- Date : ${formatDateTime(next.date, next.time)}\n- Durée : ${next.duration}min\n${next.location ? "- Lieu : "+next.location+"\n" : ""}${next.videoLink ? "- Lien visio : "+next.videoLink+"\n" : ""}\nCordialement,\n${collab.name}`); window.open(`mailto:${next.visitorEmail}?subject=${subject}&body=${body}`); }} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 10px", borderRadius:8, background:"#8B5CF618", border:"1px solid #8B5CF640", color:"#8B5CF6", fontSize:10, fontWeight:700, cursor:"pointer" }} title="Envoyer Email">
              <I n="mail" s={13}/> Email
            </div>
          )}
        </div>
      </div>
    );
  })()}

  {/* ── MON LIEN DE RÉSERVATION (compact, après la grille) ── */}
  {myCalendars.length > 0 && (()=>{
    const primaryCal = myCalendars[0];
    const primaryUrl = `https://calendar360.fr/book/${company.slug}/${primaryCal.slug}`;
    const primaryBookings = myBookings.filter(b => b.calendarId === primaryCal.id && b.status !== 'cancelled');
    const primaryConfirmed = primaryBookings.filter(b => b.status === "confirmed").length;
    const hasMultiple = myCalendars.length > 1;

    // Stats rapides
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
    const rdvThisWeek = primaryBookings.filter(b => { const d = new Date(b.date+'T'+(b.time||'00:00')); return d >= weekStart && d < weekEnd; }).length;
    const fillRate = agendaFillRate?.rate || 0;
    const fillColor = fillRate > 80 ? '#EF4444' : fillRate > 50 ? '#F59E0B' : fillRate > 0 ? '#22C55E' : T.text3;

    return <div style={{ marginTop:20, marginBottom:8, padding:'14px 18px', borderRadius:12, background:`linear-gradient(135deg, #fff 0%, ${primaryCal.color}06 100%)`, border:`1px solid ${primaryCal.color}25`, boxShadow:`0 1px 6px ${primaryCal.color}08`, transition:'all .2s' }}>
      {/* Top row : Label + Nom + Stats inline */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:14 }}>🔗</span>
          <span style={{ fontSize:11, fontWeight:700, color:T.text3, textTransform:'uppercase', letterSpacing:.5 }}>Votre lien de réservation</span>
          {hasMultiple && <span style={{ padding:'1px 6px', borderRadius:3, background:primaryCal.color+'18', color:primaryCal.color, fontSize:8, fontWeight:800, textTransform:'uppercase' }}>⭐ Principal</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <div style={{ width:6, height:6, borderRadius:3, background:primaryCal.color }}/>
          <span style={{ fontSize:12, fontWeight:700, color:T.text }}>{primaryCal.name}</span>
          <span style={{ fontSize:10, color:T.text3 }}>· {primaryCal.duration||30}min</span>
        </div>
        {/* Stats chips inline compacts */}
        <div style={{ marginLeft:'auto', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <div title="RDV cette semaine" style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:6, background:'#3B82F610', border:'1px solid #3B82F620' }}>
            <span style={{ fontSize:10 }}>📅</span>
            <span style={{ fontSize:11, fontWeight:800, color:'#3B82F6' }}>{rdvThisWeek}</span>
            <span style={{ fontSize:9, color:T.text3, fontWeight:600 }}>sem.</span>
          </div>
          <div title="Taux de remplissage" style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:6, background:fillColor+'10', border:`1px solid ${fillColor}20` }}>
            <span style={{ fontSize:10 }}>📊</span>
            <span style={{ fontSize:11, fontWeight:800, color:fillColor }}>{fillRate}%</span>
          </div>
          <div title="RDV confirmés" style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:6, background:'#22C55E10', border:'1px solid #22C55E20' }}>
            <span style={{ fontSize:10 }}>✅</span>
            <span style={{ fontSize:11, fontWeight:800, color:'#22C55E' }}>{primaryConfirmed}</span>
            <span style={{ fontSize:9, color:T.text3, fontWeight:600 }}>conf.</span>
          </div>
        </div>
      </div>

      {/* URL + Actions */}
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <div onClick={() => { navigator.clipboard.writeText(primaryUrl); showNotif("✓ Lien copié"); }} title="Cliquez pour copier le lien" style={{ flex:1, minWidth:0, padding:'8px 12px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}`, cursor:'pointer', display:'flex', alignItems:'center', gap:6, transition:'all .15s' }} onMouseEnter={e=>{e.currentTarget.style.borderColor=primaryCal.color+'50';e.currentTarget.style.background=primaryCal.color+'03';}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.surface;}}>
          <I n="link" s={11} style={{ color:primaryCal.color, flexShrink:0 }}/>
          <span style={{ fontSize:11, fontFamily:'monospace', color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, fontWeight:600 }}>{primaryUrl}</span>
          <I n="copy" s={10} style={{ color:T.text3, flexShrink:0 }}/>
        </div>
        <Btn primary onClick={() => { navigator.clipboard.writeText(primaryUrl); showNotif("✓ Lien copié"); }} style={{ padding:'8px 14px', fontSize:11, fontWeight:700, borderRadius:8, background:`linear-gradient(135deg, ${primaryCal.color}, ${primaryCal.color}D0)`, border:'none', color:'#fff', display:'flex', alignItems:'center', gap:4, flexShrink:0, boxShadow:`0 1px 4px ${primaryCal.color}30` }}>
          <I n="copy" s={12}/> Copier
        </Btn>
        <Btn onClick={() => window.open(primaryUrl, "_blank")} style={{ padding:'8px 10px', fontSize:11, fontWeight:700, borderRadius:8, flexShrink:0 }} title="Ouvrir dans un nouvel onglet">
          <I n="external-link" s={12}/>
        </Btn>
        <Btn onClick={() => { setEditCalModal({ id: primaryCal.id, name: primaryCal.name||'', slug: primaryCal.slug||'', duration: primaryCal.duration||30, requireApproval: !!primaryCal.requireApproval, description: primaryCal.description||'' }); setEditCalSlugAvail(true); }} style={{ padding:'8px 10px', fontSize:11, fontWeight:700, borderRadius:8, flexShrink:0, background:primaryCal.color+'12', color:primaryCal.color, border:`1px solid ${primaryCal.color}30` }} title="Personnaliser ce lien">
          <I n="settings" s={12}/>
        </Btn>
      </div>

      {/* Footer rassurant */}
      <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', fontSize:10, color:T.text3 }}>
        <span style={{ display:'flex', alignItems:'center', gap:3 }}>
          <span style={{ color:'#22C55E' }}>●</span> Lien sécurisé
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:3 }}>🕒 Disponible 24h/24</span>
        <span style={{ display:'flex', alignItems:'center', gap:3 }}>⚡ Réservation instantanée</span>
        <span style={{ marginLeft:'auto', fontStyle:'italic' }}>Partagez-le avec vos clients pour qu'ils réservent directement</span>
      </div>
    </div>;
  })()}

  {/* ── EMPTY STATE : aucun agenda ── */}
  {myCalendars.length === 0 && (
    <div style={{ marginTop:20, marginBottom:8, padding:'18px 20px', borderRadius:12, background:T.surface, border:`1.5px dashed ${T.border}`, textAlign:'center' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:8 }}>
        <div style={{ fontSize:22 }}>📅</div>
        <div style={{ fontSize:13, fontWeight:700, color:T.text }}>Aucun agenda configuré</div>
      </div>
      <div style={{ fontSize:11, color:T.text3, marginBottom:12, maxWidth:440, margin:'0 auto 12px', lineHeight:1.5 }}>
        Vous n'avez pas encore d'agenda. Créez-en un pour partager votre lien de réservation avec vos clients.
      </div>
      <div style={{ display:'flex', gap:6, justifyContent:'center', flexWrap:'wrap' }}>
        {collab?.role === 'admin' && (
          <Btn primary onClick={() => setPortalTab('calendars')} style={{ padding:'7px 14px', fontSize:11, fontWeight:700, borderRadius:8, display:'flex', alignItems:'center', gap:5 }}>
            <I n="plus" s={12}/> Créer mon agenda
          </Btn>
        )}
        <Btn onClick={() => setPortalTab('availability')} style={{ padding:'7px 12px', fontSize:11, fontWeight:700, borderRadius:8, display:'flex', alignItems:'center', gap:5 }}>
          <I n="clock" s={11}/> Configurer mes disponibilités
        </Btn>
      </div>
    </div>
  )}

  {/* ── MODAL ÉDITION LIEN DE RÉSERVATION ── */}
  {(typeof editCalModal!=='undefined'?editCalModal:null) && (()=>{
    const editCal = calendars.find(c=>c.id===(typeof editCalModal!=='undefined'?editCalModal:{}).id);
    const baseUrl = `https://calendar360.fr/book/${company.slug}/`;
    const slugClean = ((typeof editCalModal!=='undefined'?editCalModal:{}).slug||'').toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const slugValid = slugClean.length >= 2 && (typeof editCalSlugAvail!=='undefined'?editCalSlugAvail:null);
    const formValid = ((typeof editCalModal!=='undefined'?editCalModal:{}).name||'').trim().length > 0 && slugValid;

    const checkSlug = (slug) => {
      const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!clean || clean.length < 2 || clean === (editCal?.slug||'')) { setEditCalSlugAvail(true); return; }
      api(`/api/calendars/check-slug?companyId=${company.id}&slug=${encodeURIComponent(clean)}&excludeId=${(typeof editCalModal!=='undefined'?editCalModal:{}).id}`).then(r => {
        setEditCalSlugAvail(!!r?.available);
      });
    };

    const saveChanges = () => {
      if (!formValid) return;
      const payload = {
        name: (typeof editCalModal!=='undefined'?editCalModal:{}).name.trim(),
        slug: slugClean,
        duration: parseInt((typeof editCalModal!=='undefined'?editCalModal:{}).duration) || 30,
        requireApproval: !!(typeof editCalModal!=='undefined'?editCalModal:{}).requireApproval,
        description: (typeof editCalModal!=='undefined'?editCalModal:{}).description || '',
      };
      api(`/api/calendars/${(typeof editCalModal!=='undefined'?editCalModal:{}).id}`, { method: 'PUT', body: payload }).then(r => {
        if (r?.success) {
          // Update local state
          setCalendars(prev => prev.map(c => c.id === (typeof editCalModal!=='undefined'?editCalModal:{}).id ? { ...c, ...payload } : c));
          showNotif("✓ Lien mis à jour");
          setEditCalModal(null);
        } else {
          showNotif(r?.error || "Erreur lors de la mise à jour", "danger");
        }
      }).catch(() => showNotif("Erreur réseau", "danger"));
    };

    return <Modal open={true} onClose={()=>setEditCalModal(null)} title="Personnaliser votre lien de réservation" width={560}>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

        {/* Nom du calendar */}
        <div>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:T.text2, marginBottom:5 }}>
            Nom de votre agenda
            <span style={{ color:T.text3, fontWeight:400, marginLeft:6, fontSize:10 }}>Visible par vos clients</span>
          </label>
          <input
            type="text"
            value={(typeof editCalModal!=='undefined'?editCalModal:{}).name}
            onChange={e => (typeof setEditCalModal==='function'?setEditCalModal:function(){})({...editCalModal, name: e.target.value})}
            placeholder="Ex: Consultation, Rendez-vous conseil, ..."
            style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12, outline:'none' }}
          />
        </div>

        {/* Slug / URL du lien */}
        <div>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:T.text2, marginBottom:5 }}>
            Nom court dans l'URL
            <span style={{ color:T.text3, fontWeight:400, marginLeft:6, fontSize:10 }}>Lettres, chiffres et tirets uniquement</span>
          </label>
          <div style={{ display:'flex', alignItems:'center', borderRadius:8, border:`1.5px solid ${slugValid?T.border:'#EF4444'}`, background:T.surface, overflow:'hidden' }}>
            <span style={{ padding:'9px 4px 9px 12px', fontSize:11, color:T.text3, fontFamily:'monospace', whiteSpace:'nowrap' }}>{baseUrl}</span>
            <input
              type="text"
              value={(typeof editCalModal!=='undefined'?editCalModal:{}).slug}
              onChange={e => { (typeof setEditCalModal==='function'?setEditCalModal:function(){})({...editCalModal, slug: e.target.value}); checkSlug(e.target.value); }}
              placeholder="mon-agenda"
              style={{ flex:1, padding:'9px 12px 9px 0', border:'none', background:'transparent', color:T.text, fontSize:12, fontFamily:'monospace', fontWeight:600, outline:'none' }}
            />
          </div>
          {(typeof editCalModal!=='undefined'?editCalModal:{}).slug && slugClean !== (typeof editCalModal!=='undefined'?editCalModal:{}).slug.toLowerCase() && (
            <div style={{ fontSize:10, color:T.text3, marginTop:4 }}>Sera enregistré comme : <strong style={{ fontFamily:'monospace' }}>{slugClean}</strong></div>
          )}
          {(typeof editCalModal!=='undefined'?editCalModal:{}).slug && !(typeof editCalSlugAvail!=='undefined'?editCalSlugAvail:null) && (
            <div style={{ fontSize:10, color:'#EF4444', marginTop:4, fontWeight:600 }}>⚠️ Ce nom est déjà utilisé par un autre agenda</div>
          )}
          {slugClean.length > 0 && slugClean.length < 2 && (
            <div style={{ fontSize:10, color:'#EF4444', marginTop:4, fontWeight:600 }}>⚠️ Minimum 2 caractères</div>
          )}
        </div>

        {/* Durée des RDV */}
        <div>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:T.text2, marginBottom:5 }}>
            Durée d'un rendez-vous
            <span style={{ color:T.text3, fontWeight:400, marginLeft:6, fontSize:10 }}>Combien de temps dure chaque créneau</span>
          </label>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {[15, 30, 45, 60, 90, 120].map(d => {
              const active = (typeof editCalModal!=='undefined'?editCalModal:{}).duration === d;
              return (
                <div key={d} onClick={() => (typeof setEditCalModal==='function'?setEditCalModal:function(){})({...editCalModal, duration: d})} style={{ padding:'8px 14px', borderRadius:8, border:`1.5px solid ${active?T.accent:T.border}`, background:active?T.accentBg:T.surface, color:active?T.accent:T.text, fontSize:12, fontWeight:active?700:500, cursor:'pointer', transition:'all .15s' }}>
                  {d} min
                </div>
              );
            })}
          </div>
        </div>

        {/* Confirmation manuelle ou auto */}
        <div>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:T.text2, marginBottom:5 }}>
            Validation des rendez-vous
          </label>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <div onClick={() => (typeof setEditCalModal==='function'?setEditCalModal:function(){})({...editCalModal, requireApproval: false})} style={{ padding:'10px 14px', borderRadius:8, border:`1.5px solid ${!(typeof editCalModal!=='undefined'?editCalModal:{}).requireApproval?'#22C55E':T.border}`, background:!(typeof editCalModal!=='undefined'?editCalModal:{}).requireApproval?'#22C55E08':T.surface, cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'all .15s' }}>
              <div style={{ width:18, height:18, borderRadius:9, border:`2px solid ${!(typeof editCalModal!=='undefined'?editCalModal:{}).requireApproval?'#22C55E':T.border}`, background:!(typeof editCalModal!=='undefined'?editCalModal:{}).requireApproval?'#22C55E':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {!(typeof editCalModal!=='undefined'?editCalModal:{}).requireApproval && <div style={{ width:6, height:6, borderRadius:3, background:'#fff' }}/>}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.text }}>⚡ Confirmation automatique</div>
                <div style={{ fontSize:10, color:T.text3, marginTop:1 }}>Les RDV sont confirmés immédiatement après réservation</div>
              </div>
            </div>
            <div onClick={() => (typeof setEditCalModal==='function'?setEditCalModal:function(){})({...editCalModal, requireApproval: true})} style={{ padding:'10px 14px', borderRadius:8, border:`1.5px solid ${(typeof editCalModal!=='undefined'?editCalModal:{}).requireApproval?'#F59E0B':T.border}`, background:(typeof editCalModal!=='undefined'?editCalModal:{}).requireApproval?'#F59E0B08':T.surface, cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'all .15s' }}>
              <div style={{ width:18, height:18, borderRadius:9, border:`2px solid ${(typeof editCalModal!=='undefined'?editCalModal:{}).requireApproval?'#F59E0B':T.border}`, background:(typeof editCalModal!=='undefined'?editCalModal:{}).requireApproval?'#F59E0B':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {(typeof editCalModal!=='undefined'?editCalModal:{}).requireApproval && <div style={{ width:6, height:6, borderRadius:3, background:'#fff' }}/>}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.text }}>🔍 Validation manuelle</div>
                <div style={{ fontSize:10, color:T.text3, marginTop:1 }}>Vous devez confirmer chaque RDV avant qu'il soit validé</div>
              </div>
            </div>
          </div>
        </div>

        {/* Description optionnelle */}
        <div>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:T.text2, marginBottom:5 }}>
            Description
            <span style={{ color:T.text3, fontWeight:400, marginLeft:6, fontSize:10 }}>Optionnel — affiché sur la page de réservation</span>
          </label>
          <textarea
            value={(typeof editCalModal!=='undefined'?editCalModal:{}).description}
            onChange={e => (typeof setEditCalModal==='function'?setEditCalModal:function(){})({...editCalModal, description: e.target.value})}
            placeholder="Ex: Prenez rendez-vous pour discuter de votre projet..."
            rows={2}
            style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12, outline:'none', resize:'vertical', fontFamily:'inherit' }}
          />
        </div>

        {/* Info sur disponibilités */}
        <div style={{ padding:'10px 12px', borderRadius:8, background:T.accent+'08', border:`1px solid ${T.accent}20`, fontSize:11, color:T.text2, display:'flex', gap:8, alignItems:'flex-start' }}>
          <I n="info" s={14} style={{ color:T.accent, flexShrink:0, marginTop:1 }}/>
          <div>
            Les créneaux disponibles sont basés sur <strong>vos disponibilités configurées</strong>.
            <span onClick={() => { setEditCalModal(null); setPortalTab('availability'); }} style={{ color:T.accent, cursor:'pointer', fontWeight:600, marginLeft:4 }}>Modifier mes disponibilités →</span>
          </div>
        </div>

        {/* Boutons */}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
          <Btn onClick={()=>setEditCalModal(null)}>Annuler</Btn>
          <Btn primary disabled={!formValid} onClick={saveChanges} style={{ opacity: formValid?1:0.5 }}>
            <I n="check" s={13}/> Enregistrer
          </Btn>
        </div>
      </div>
    </Modal>;
  })()}

  {/* ── MES RENDEZ-VOUS (liste intégrée) ── */}
  {(()=>{
    const filteredBookings = (typeof mrStatusFilter!=='undefined'?mrStatusFilter:null) === 'all' ? myBookings : myBookings.filter(b => b.status === (typeof mrStatusFilter!=='undefined'?mrStatusFilter:null));
    return <div style={{ marginTop:24 }}>
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
      <h2 style={{ fontSize:16, fontWeight:700, color:T.text, display:'flex', alignItems:'center', gap:8 }}>
        <I n="list" s={16} color={T.accent}/> Mes Rendez-vous
        {(typeof mrStatusFilter!=='undefined'?mrStatusFilter:null) !== 'all' && <span style={{ padding:'2px 10px', borderRadius:6, background:T.accentBg, color:T.accent, fontSize:10, fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
          Filtre : {mrStatusFilter==='confirmed'?'Confirmés':(typeof mrStatusFilter!=='undefined'?mrStatusFilter:null)==='pending'?'En attente':'Annulés'}
          <span onClick={()=>setMrStatusFilter('all')} style={{ cursor:'pointer', marginLeft:2, fontSize:11 }}>×</span>
        </span>}
      </h2>
      {mrStatusFilter !== 'all' && <span onClick={()=>(typeof setMrStatusFilter==='function'?setMrStatusFilter:function(){})('all')} style={{ fontSize:11, color:T.accent, cursor:'pointer', fontWeight:600 }}>Tout afficher</span>}
    </div>
    <div style={{ display:'flex', gap:8, marginBottom:12 }}>
      <Stat label="Confirmés" value={myBookings.filter(b=>b.status==="confirmed").length} icon="check" color={T.success} onClick={()=>(typeof setMrStatusFilter==='function'?setMrStatusFilter:function(){})(mrStatusFilter==='confirmed'?'all':'confirmed')} active={mrStatusFilter==='confirmed'}/>
      <Stat label="En attente" value={myBookings.filter(b=>b.status==="pending").length} icon="clock" color={T.warning} onClick={()=>(typeof setMrStatusFilter==='function'?setMrStatusFilter:function(){})(mrStatusFilter==='pending'?'all':'pending')} active={mrStatusFilter==='pending'}/>
      <Stat label="Annulés" value={myBookings.filter(b=>b.status==="cancelled").length} icon="x" color={T.danger} onClick={()=>(typeof setMrStatusFilter==='function'?setMrStatusFilter:function(){})(mrStatusFilter==='cancelled'?'all':'cancelled')} active={mrStatusFilter==='cancelled'}/>
      <Stat label="Total" value={myBookings.length} icon="calendar" color={T.accent} onClick={()=>(typeof setMrStatusFilter==='function'?setMrStatusFilter:function(){})('all')} active={mrStatusFilter==='all'}/>
    </div>
    {filteredBookings.length === 0 ? (
      <div style={{ textAlign:'center', padding:30, color:T.text3, fontSize:12 }}>
        {mrStatusFilter === 'all' ? 'Aucun rendez-vous pour le moment' : `Aucun rendez-vous ${mrStatusFilter==='confirmed'?'confirmé':mrStatusFilter==='pending'?'en attente':'annulé'}`}
      </div>
    ) : (
      <Card style={{ padding:0, overflow:'hidden' }}>
        {filteredBookings.sort((a,b) => {
          const now = new Date().toISOString().split('T')[0];
          const aFuture = a.date >= now ? 0 : 1;
          const bFuture = b.date >= now ? 0 : 1;
          if (aFuture !== bFuture) return aFuture - bFuture;
          return aFuture === 0 ? (a.date+a.time).localeCompare(b.date+b.time) : (b.date+b.time).localeCompare(a.date+a.time);
        }).map(b => {
          const cal = calendars.find(c => c.id === b.calendarId);
          return (
            <div key={b.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', borderBottom:`1px solid ${T.border}08`, opacity:b.status==='cancelled'?0.5:1 }}>
              <div style={{ width:4, height:36, borderRadius:2, background:cal?.color, flexShrink:0 }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{(()=>{const _ct=b.contactId?(contacts||[]).find(_c=>_c.id===b.contactId):null; const _xc=_ct?.assignedTo&&Array.isArray(_ct.shared_with)&&_ct.shared_with.length>0; return _xc?<span title="RDV cross-collaborateur">🤝 </span>:null;})()}{b.visitorName}</div>
                <div style={{ fontSize:11, color:T.text3 }}>{cal?.name} · {fmtDate(b.date)} · {b.time} · {b.duration}min</div>
              </div>
              <Badge color={b.status==='confirmed'?T.success:b.status==='pending'?T.warning:T.danger}>{b.status==='confirmed'?'Confirmé':b.status==='pending'?'Attente':'Annulé'}</Badge>
              <div style={{ display:'flex', gap:4 }}>
                {b.status==='pending' && <Btn small success disabled={actionLoading===b.id+'c'} onClick={() => { (typeof setActionLoading==='function'?setActionLoading:function(){})(b.id+'c'); updateBooking(b.id,{status:'confirmed'}); showNotif('RDV confirmé'); sendNotification('booking-confirmed', buildNotifyPayload(b, calendars, [collab], company)); setTimeout(()=>(typeof setActionLoading==='function'?setActionLoading:function(){})(null),600); }}>{actionLoading===b.id+'c'?<Spinner size={12} color='#fff'/>:<I n='check' s={12}/>}</Btn>}
                {b.status!=='cancelled' && <Btn small danger disabled={actionLoading===b.id+'x'} onClick={() => { (typeof setActionLoading==='function'?setActionLoading:function(){})(b.id+'x'); cancelBookingAndCascade(b.id); showNotif('RDV annulé','danger'); sendNotification('cancelled', buildNotifyPayload(b, calendars, [collab], company)); setTimeout(()=>(typeof setActionLoading==='function'?setActionLoading:function(){})(null),600); }}>{actionLoading===b.id+'x'?<Spinner size={12} color='#fff'/>:<I n='x' s={12}/>}</Btn>}
                <Btn small onClick={() => setSelectedBooking(b)}><I n='eye' s={12}/></Btn>
              </div>
            </div>
          );
        })}
      </Card>
    )}
  </div>;
  })()}
</div>
  );
};

export default AgendaTab;
