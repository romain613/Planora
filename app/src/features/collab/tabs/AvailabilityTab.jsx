// Phase 12a — extracted Availability tab from CollabPortal.jsx (was lines 6881-7128).

import React, { Fragment } from "react";
import { T } from "../../../theme";
import { I, Btn, Card } from "../../../shared/ui";
import { DAYS_FR, fmtDate } from "../../../shared/utils/dates";
import { useCollabContext } from "../context/CollabContext";

const AvailabilityTab = () => {
  const {
    collab, showNotif,
    userAvail, myVacations, todayStr,
    availBuffer, availMaxPerDay, availBreaks,
    newVacDate, setNewVacDate,
    setAvails, setVacations,
    saveAvail, saveAvailBuffer, saveAvailMaxPerDay, saveAvailBreaks,
    toggleDay, updateSlot, addSlot, removeSlot,
  } = useCollabContext();

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:16, background:"linear-gradient(135deg,#22C55E,#16A34A)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(34,197,94,0.25)" }}>
            <I n="grid" s={24} style={{ color:"#fff" }}/>
          </div>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:-0.5 }}>Mes disponibilités</h1>
            <p style={{ fontSize:12, color:T.text3, margin:0 }}>Gérez vos horaires, pauses et congés</p>
          </div>
        </div>
        {/* Quick stats */}
        <div style={{ display:"flex", gap:8 }}>
          {[
            { label:"Jours actifs", value:Object.values(userAvail).filter(d=>d?.active).length+"/7", color:"#22C55E" },
            { label:"Créneaux", value:Object.values(userAvail).reduce((a,d)=>a+(d?.active?d.slots.length:0),0), color:"#2563EB" },
            { label:"Congés", value:myVacations.length, color:"#F59E0B" },
          ].map((s,i)=>(
            <div key={i} style={{ padding:"8px 14px", borderRadius:10, background:s.color+"10", border:`1px solid ${s.color}25`, textAlign:"center" }}>
              <div style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:10, color:T.text3, fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick templates */}
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {[
          { label:"Matin seul", icon:"sunrise", slots:[{start:"08:00",end:"12:00"}] },
          { label:"Après-midi seul", icon:"sunset", slots:[{start:"14:00",end:"18:00"}] },
          { label:"Journée complète", icon:"sun", slots:[{start:"09:00",end:"12:00"},{start:"14:00",end:"18:00"}] },
          { label:"Journée continue", icon:"zap", slots:[{start:"09:00",end:"18:00"}] },
        ].map(tpl=>(
          <div key={tpl.label} onClick={()=>{
            setAvails(prev => {
              const u = {...prev};
              const newAvail = {...u[collab.id]};
              for(let di=0;di<7;di++){
                if(newAvail[di]?.active) newAvail[di]={...newAvail[di], slots:[...tpl.slots]};
              }
              u[collab.id]=newAvail;
              saveAvail(u);
              return u;
            });
            showNotif(`Template "${tpl.label}" appliqué aux jours actifs`);
          }} style={{ padding:"8px 14px", borderRadius:10, background:T.surface, border:`1px solid ${T.border}`, cursor:"pointer", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:6, transition:"all .15s" }} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
            <I n={tpl.icon} s={14} style={{ color:T.accent }}/> {tpl.label}
          </div>
        ))}
      </div>

      {/* Buffer & Max per day settings */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
        <Card style={{ padding:"14px 18px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:"#F59E0B12", display:"flex", alignItems:"center", justifyContent:"center" }}><I n="clock" s={16} style={{ color:"#F59E0B" }}/></div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700 }}>Buffer entre RDV</div>
              <div style={{ fontSize:11, color:T.text3 }}>Temps de pause automatique entre chaque rendez-vous</div>
            </div>
            <select value={availBuffer} onChange={e=>saveAvailBuffer(parseInt(e.target.value))} style={{ padding:"6px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, fontSize:13, fontWeight:700, color:T.accent, fontFamily:"inherit", outline:"none" }}>
              <option value={0}>Aucun</option>
              <option value={5}>5 min</option>
              <option value={10}>10 min</option>
              <option value={15}>15 min</option>
              <option value={20}>20 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>1 heure</option>
            </select>
          </div>
        </Card>
        <Card style={{ padding:"14px 18px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:"#EF444412", display:"flex", alignItems:"center", justifyContent:"center" }}><I n="alert-circle" s={16} style={{ color:"#EF4444" }}/></div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700 }}>Max RDV / jour</div>
              <div style={{ fontSize:11, color:T.text3 }}>Limite quotidienne de rendez-vous acceptés</div>
            </div>
            <select value={availMaxPerDay} onChange={e=>saveAvailMaxPerDay(parseInt(e.target.value))} style={{ padding:"6px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, fontSize:13, fontWeight:700, color:T.accent, fontFamily:"inherit", outline:"none" }}>
              <option value={0}>Illimité</option>
              {[2,3,4,5,6,8,10,12,15,20].map(n=><option key={n} value={n}>{n} RDV max</option>)}
            </select>
          </div>
        </Card>
      </div>

      {/* Weekly schedule */}
      <Card>
        <h3 style={{ fontSize:15, fontWeight:700, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}><I n="calendar" s={16} style={{ color:T.accent }}/> Planning hebdomadaire</h3>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {DAYS_FR.map((day,di) => {
            const dd = userAvail[di];
            const dayBreaks = (typeof availBreaks!=='undefined'?availBreaks:null)[di] || [];
            return (
              <div key={di} style={{ padding:"14px 18px", borderRadius:12, background:dd?.active?T.surface:T.bg, border:`1px solid ${dd?.active?T.border:T.border+"60"}`, opacity:dd?.active?1:0.5, transition:"all .2s" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div onClick={() => toggleDay(di)} style={{
                    width:42, height:24, borderRadius:12, cursor:"pointer",
                    background:dd?.active?"linear-gradient(135deg,#22C55E,#16A34A)":T.border2,
                    display:"flex", alignItems:"center", padding:"0 3px",
                    justifyContent:dd?.active?"flex-end":"flex-start",
                    transition:"all .25s", boxShadow:dd?.active?"0 2px 8px rgba(34,197,94,0.3)":"none"
                  }}><div style={{ width:18, height:18, borderRadius:9, background:"#fff", boxShadow:"0 1px 4px rgba(0,0,0,0.15)", transition:"all .2s" }}/></div>
                  <span style={{ fontSize:14, fontWeight:700, width:90, color:dd?.active?T.text:T.text3 }}>{day}</span>
                  {dd?.active ? (
                    <div style={{ flex:1, display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
                      {dd.slots.map((slot,si) => (
                        <div key={si} style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 12px", borderRadius:8, background:T.accentBg, border:`1px solid ${T.accentBorder}`, position:"relative" }}>
                          <I n="clock" s={11} style={{ color:T.accent, opacity:0.6 }}/>
                          <input type="time" value={slot.start} onChange={e => updateSlot(di,si,"start",e.target.value)} style={{ border:"none", borderBottom:`1px dashed ${T.accent}40`, background:"transparent", fontSize:12, fontWeight:700, color:T.accent, fontFamily:"inherit", outline:"none", width:75, padding:'2px 4px', cursor:'pointer' }} onFocus={e=>e.target.style.borderBottomColor=T.accent} onBlur={e=>e.target.style.borderBottomColor=T.accent+'40'}/>
                          <span style={{ color:T.text3, fontSize:12, fontWeight:600 }}>→</span>
                          <input type="time" value={slot.end} onChange={e => updateSlot(di,si,"end",e.target.value)} style={{ border:"none", borderBottom:`1px dashed ${T.accent}40`, background:"transparent", fontSize:12, fontWeight:700, color:T.accent, fontFamily:"inherit", outline:"none", width:75, padding:'2px 4px', cursor:'pointer' }} onFocus={e=>e.target.style.borderBottomColor=T.accent} onBlur={e=>e.target.style.borderBottomColor=T.accent+'40'}/>
                          <span onClick={() => removeSlot(di,si)} style={{ cursor:"pointer", color:T.text3, padding:2 }}><I n="x" s={13}/></span>
                        </div>
                      ))}
                      {/* Pauses for this day */}
                      {dayBreaks.map((brk,bi) => (
                        <div key={"brk"+bi} style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 12px", borderRadius:8, background:"#F59E0B10", border:"1px solid #F59E0B30" }}>
                          <I n="coffee" s={11} style={{ color:"#F59E0B" }}/>
                          <input type="time" value={brk.start} onChange={e => {
                            const nb = [...dayBreaks]; nb[bi]={...nb[bi],start:e.target.value};
                            saveAvailBreaks({...availBreaks, [di]:nb});
                          }} style={{ border:"none", borderBottom:'1px dashed #F59E0B40', background:"transparent", fontSize:12, fontWeight:700, color:"#F59E0B", fontFamily:"inherit", outline:"none", width:75, padding:'2px 4px', cursor:'pointer' }} onFocus={e=>e.target.style.borderBottomColor='#F59E0B'} onBlur={e=>e.target.style.borderBottomColor='#F59E0B40'}/>
                          <span style={{ color:T.text3, fontSize:12, fontWeight:600 }}>→</span>
                          <input type="time" value={brk.end} onChange={e => {
                            const nb = [...dayBreaks]; nb[bi]={...nb[bi],end:e.target.value};
                            saveAvailBreaks({...availBreaks, [di]:nb});
                          }} style={{ border:"none", borderBottom:'1px dashed #F59E0B40', background:"transparent", fontSize:12, fontWeight:700, color:"#F59E0B", fontFamily:"inherit", outline:"none", width:75, padding:'2px 4px', cursor:'pointer' }} onFocus={e=>e.target.style.borderBottomColor='#F59E0B'} onBlur={e=>e.target.style.borderBottomColor='#F59E0B40'}/>
                          <span style={{ fontSize:9, fontWeight:700, color:"#F59E0B", textTransform:"uppercase" }}>Pause</span>
                          <span onClick={()=>{ const nb=[...dayBreaks]; nb.splice(bi,1); saveAvailBreaks({...availBreaks,[di]:nb}); }} style={{ cursor:"pointer", color:T.text3, padding:2 }}><I n="x" s={13}/></span>
                        </div>
                      ))}
                      <div style={{ display:"flex", gap:4 }}>
                        <span onClick={() => addSlot(di)} style={{ cursor:"pointer", color:T.accent, fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:6, background:T.accentBg, display:"flex", alignItems:"center", gap:3 }}><I n="plus" s={10}/> Créneau</span>
                        <span onClick={()=>{ saveAvailBreaks({...availBreaks,[di]:[...((typeof availBreaks!=='undefined'?availBreaks:null)[di]||[]),{start:"12:00",end:"13:00"}]}); }} style={{ cursor:"pointer", color:"#F59E0B", fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:6, background:"#F59E0B10", display:"flex", alignItems:"center", gap:3 }}><I n="coffee" s={10}/> Pause</span>
                      </div>
                    </div>
                  ) : <span style={{ fontSize:12, color:T.text3, fontStyle:"italic" }}>Indisponible ce jour</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Congés */}
      <Card style={{ marginTop:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"#F59E0B12", display:"flex", alignItems:"center", justifyContent:"center" }}><I n="flag" s={16} style={{ color:"#F59E0B" }}/></div>
          <div>
            <h3 style={{ fontSize:15, fontWeight:700, margin:0 }}>Mes congés & absences</h3>
            <p style={{ fontSize:11, color:T.text3, margin:0 }}>Les jours de congé bloquent automatiquement vos créneaux</p>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
          {myVacations.length === 0 && (
            <div style={{ padding:"16px 24px", borderRadius:10, background:T.bg, border:`1px dashed ${T.border}`, textAlign:"center", width:"100%" }}>
              <I n="sun" s={20} style={{ color:T.text3, opacity:0.4, marginBottom:6 }}/>
              <div style={{ fontSize:12, color:T.text3 }}>Aucun congé posé</div>
            </div>
          )}
          {myVacations.map(d => {
            const vDate = new Date(d);
            const isPast = vDate < new Date(todayStr);
            return (
              <div key={d} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", borderRadius:10, background:isPast?T.bg:T.warningBg, border:`1px solid ${isPast?T.border:T.warning+"22"}`, fontSize:12, fontWeight:600, color:isPast?T.text3:T.warning, opacity:isPast?0.6:1 }}>
                <I n="calendar" s={12}/>
                {fmtDate(d)}
                {isPast && <span style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:4, background:T.border, color:T.text3 }}>Passé</span>}
                <span onClick={() => setVacations(prev => ({...prev, [collab.id]: (prev[collab.id]||[]).filter(x=>x!==d)}))} style={{ cursor:"pointer", marginLeft:2 }}><I n="x" s={12}/></span>
              </div>
            );
          })}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <input type="date" value={newVacDate} onChange={e => (typeof setNewVacDate==='function'?setNewVacDate:function(){})(e.target.value)} style={{ padding:"8px 14px", borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, fontSize:12, fontFamily:"inherit", color:T.text, outline:"none" }}/>
          <Btn small primary onClick={() => { if (newVacDate && !myVacations.includes(newVacDate)) { setVacations(prev => ({...prev, [collab.id]: [...(prev[collab.id]||[]), newVacDate].sort()})); (typeof setNewVacDate==='function'?setNewVacDate:function(){})(""); showNotif("Congé ajouté ✓"); }}}>
            <I n="plus" s={12}/> Ajouter un congé
          </Btn>
          <Btn small onClick={() => {
            const start = prompt("Date début (AAAA-MM-JJ) :");
            const end = prompt("Date fin (AAAA-MM-JJ) :");
            if(!start||!end) return;
            const dates = [];
            const cur = new Date(start);
            const endD = new Date(end);
            while(cur <= endD) { dates.push(cur.toISOString().split("T")[0]); cur.setDate(cur.getDate()+1); }
            if(dates.length > 60) { showNotif("Maximum 60 jours","danger"); return; }
            setVacations(prev => ({...prev, [collab.id]: [...new Set([...(prev[collab.id]||[]), ...dates])].sort()}));
            showNotif(`${dates.length} jours de congés ajoutés`);
          }} style={{ borderRadius:10, display:"flex", alignItems:"center", gap:4 }}>
            <I n="calendar" s={12}/> Plage de dates
          </Btn>
        </div>
      </Card>

      {/* Visual weekly overview */}
      <Card style={{ marginTop:16 }}>
        <h3 style={{ fontSize:15, fontWeight:700, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}><I n="bar-chart-2" s={16} style={{ color:T.accent }}/> Aperçu visuel de la semaine</h3>
        <div style={{ display:"grid", gridTemplateColumns:"70px 1fr", gap:4 }}>
          {DAYS_FR.map((day,di) => {
            const dd = userAvail[di];
            const dayBrks = (typeof availBreaks!=='undefined'?availBreaks:null)[di] || [];
            const totalMinutes = 10*60; // 8h-18h = 10h
            return (
              <Fragment key={di}>
                <div style={{ fontSize:12, fontWeight:600, padding:"6px 0", color:dd?.active?T.text:T.text3 }}>{day}</div>
                <div style={{ position:"relative", height:28, borderRadius:6, background:T.bg, border:`1px solid ${T.border}`, overflow:"hidden" }}>
                  {dd?.active && dd.slots.map((slot,si) => {
                    const [sh,sm] = slot.start.split(":").map(Number);
                    const [eh,em] = slot.end.split(":").map(Number);
                    const startMin = (sh-8)*60+sm;
                    const endMin = (eh-8)*60+em;
                    const left = Math.max(startMin/totalMinutes*100,0);
                    const width = Math.max((endMin-startMin)/totalMinutes*100,1);
                    return <div key={si} style={{ position:"absolute", left:left+"%", width:width+"%", top:3, bottom:3, borderRadius:4, background:"linear-gradient(135deg,#22C55E80,#16A34A80)" }}/>;
                  })}
                  {dayBrks.map((brk,bi) => {
                    const [sh,sm] = brk.start.split(":").map(Number);
                    const [eh,em] = brk.end.split(":").map(Number);
                    const startMin = (sh-8)*60+sm;
                    const endMin = (eh-8)*60+em;
                    const left = Math.max(startMin/totalMinutes*100,0);
                    const width = Math.max((endMin-startMin)/totalMinutes*100,1);
                    return <div key={"b"+bi} style={{ position:"absolute", left:left+"%", width:width+"%", top:3, bottom:3, borderRadius:4, background:"#F59E0B40", borderLeft:"2px dashed #F59E0B" }}/>;
                  })}
                  {!dd?.active && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:T.text3, fontStyle:"italic" }}>Fermé</div>}
                </div>
              </Fragment>
            );
          })}
          {/* Time labels */}
          <div/>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"2px 0" }}>
            {["8h","10h","12h","14h","16h","18h"].map(h=><span key={h} style={{ fontSize:9, color:T.text3 }}>{h}</span>)}
          </div>
        </div>
        <div style={{ display:"flex", gap:16, marginTop:10, justifyContent:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:T.text3 }}><div style={{ width:12, height:12, borderRadius:3, background:"#22C55E80" }}/> Disponible</div>
          <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:T.text3 }}><div style={{ width:12, height:12, borderRadius:3, background:"#F59E0B40", border:"1px dashed #F59E0B" }}/> Pause</div>
          <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:T.text3 }}><div style={{ width:12, height:12, borderRadius:3, background:T.bg, border:`1px solid ${T.border}` }}/> Fermé</div>
        </div>
      </Card>
    </div>
  );
};

export default AvailabilityTab;
