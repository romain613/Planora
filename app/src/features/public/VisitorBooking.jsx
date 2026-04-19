import React, { useState } from "react";
import { T } from "../../theme";
import { _T } from "../../shared/state/tabState";
import { DAYS_FR, MONTHS_FR } from "../../shared/utils/dates";
import { sendNotification } from "../../shared/utils/notifications";
import { Avatar, Btn, Card, I, Input } from "../../shared/ui";

const VisitorBooking = ({ calendar, company, collabs, blackouts, vacations, onBack }) => {
  const [selDate, setSelDate] = useState(null);
  const [selTime, setSelTime] = useState(null);
  const [form, setForm] = useState({name:"",email:""});
  const [booked, setBooked] = useState(false);
  const [step, setStep] = useState("pick"); // "pick" | "form"
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  const changeMonth = (d) => { let m=month+d, y=year; if(m>11){m=0;y++;}if(m<0){m=11;y--;} setMonth(m);setYear(y); };

  // Calendar grid
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calDays = [];
  for (let i = 0; i < firstDay; i++) calDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calDays.push(d);

  const todayDate = new Date();
  const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth()+1).padStart(2,"0")}-${String(todayDate.getDate()).padStart(2,"0")}`;

  const isAvailable = (day) => {
    if (!day) return false;
    const dt = new Date(year, month, day);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) return false;
    const ds = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    if (ds < todayStr) return false;
    if (blackouts && blackouts.includes(ds)) return false;
    if (vacations && collab) {
      const collabVacs = vacations[collab.id] || [];
      if (collabVacs.includes(ds)) return false;
    }
    return true;
  };

  const formatDateStr = (ds) => {
    if (!ds) return "";
    const d = new Date(ds);
    return `${DAYS_FR[d.getDay()]||'?'} ${d.getDate()} ${MONTHS_FR[d.getMonth()]||'?'}`;
  };

  const times = ["09:00","09:30","10:00","10:30","11:00","14:00","14:30","15:00","15:30","16:00","16:30"];
  const collab = collabs?.find(c => calendar.collaborators.includes(c.id));
  const locIcon = calendar.location?.toLowerCase().includes("zoom") || calendar.location?.toLowerCase().includes("meet") || calendar.location?.toLowerCase().includes("video") ? "globe" : calendar.location?.toLowerCase().includes("téléphone") || calendar.location?.toLowerCase().includes("phone") ? "phone" : "map";

  const fontStyle = <style>{`@import url('https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500;600;700;800&display=swap'); *{margin:0;padding:0;box-sizing:border-box;}
@media(max-width:768px){.pub-left{display:none!important;}.pub-times{width:100%!important;border-left:none!important;border-top:1px solid ${T.border};}}`}</style>;

  // ── CONFIRMATION
  if (booked) return (
    <div style={{ minHeight:"100vh", background:T.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Onest',system-ui,sans-serif" }}>
      {fontStyle}
      <Card style={{ maxWidth:480, textAlign:"center", padding:48 }}>
        <div style={{ width:72, height:72, borderRadius:36, background:T.successBg, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 24px", color:T.success }}><I n="check" s={32}/></div>
        <h2 style={{ fontSize:24, fontWeight:700, marginBottom:8 }}>Rendez-vous confirmé !</h2>
        <p style={{ color:T.text2, fontSize:14, marginBottom:24 }}>{calendar.name}</p>
        <div style={{ display:"flex", gap:12, justifyContent:"center", marginBottom:24 }}>
          <div style={{ padding:"10px 18px", borderRadius:10, background:T.bg, border:`1px solid ${T.border}`, fontSize:13 }}><I n="calendar" s={14}/> <span style={{ fontWeight:600 }}>{formatDateStr(selDate)}</span></div>
          <div style={{ padding:"10px 18px", borderRadius:10, background:T.bg, border:`1px solid ${T.border}`, fontSize:13 }}><I n="clock" s={14}/> <span style={{ fontWeight:600 }}>{selTime} · {calendar.duration}min</span></div>
        </div>
        {collab && <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center", marginBottom:20 }}><Avatar name={collab.name} color={collab.color} size={28}/><span style={{ fontSize:13, color:T.text2 }}>avec {collab.name}</span></div>}
        <Btn onClick={onBack} style={{ marginTop:8 }}>← Retour</Btn>
      </Card>
    </div>
  );

  // ── FORM STEP
  if (step === "form") return (
    <div style={{ minHeight:"100vh", background:T.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Onest',system-ui,sans-serif" }}>
      {fontStyle}
      <Card style={{ width:"100%", maxWidth:480, padding:0, overflow:"hidden" }}>
        <div style={{ padding:"20px 28px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:calendar.color+"14", display:"flex", alignItems:"center", justifyContent:"center", color:calendar.color, fontWeight:800, fontSize:14 }}>{(company?.name||"C")[0]}</div>
          <div style={{ flex:1 }}><div style={{ fontSize:15, fontWeight:700 }}>{company.name}</div></div>
          <span onClick={() => setStep("pick")} style={{ cursor:"pointer", color:T.text3, fontSize:13 }}>← Retour</span>
        </div>
        <div style={{ padding:"28px" }}>
          <div style={{ padding:"14px 18px", borderRadius:12, background:calendar.color+"08", border:`1px solid ${calendar.color}22`, marginBottom:24, display:"flex", gap:16, alignItems:"center" }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:T.text }}>{calendar.name}</div>
              <div style={{ fontSize:12, color:T.text2, marginTop:2 }}>{formatDateStr(selDate)} · {selTime} · {calendar.duration}min</div>
            </div>
          </div>
          <Input label="Votre nom" placeholder="Jean Dupont" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={{ marginBottom:14 }}/>
          <Input label="Votre email" placeholder="jean@mail.com" icon="mail" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} style={{ marginBottom:20 }}/>
          <Btn primary full disabled={!form.name||!form.email} onClick={() => { setBooked(true); sendNotification('booking-confirmed', { visitorName: form.name, visitorEmail: form.email, visitorPhone: '', date: selDate, time: selTime, duration: calendar.duration || 30, calendarName: calendar.name || '', collaboratorName: '', companyName: company?.name || '', location: calendar.location || '' }); }}>Confirmer le rendez-vous</Btn>
        </div>
      </Card>
    </div>
  );

  // ── MAIN: 3-column Calendly layout
  return (
    <div style={{ minHeight:"100vh", background:T.bg, fontFamily:"'Onest',system-ui,sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      {fontStyle}
      <Card style={{ width:"100%", maxWidth: selDate ? 920 : 720, padding:0, overflow:"hidden", transition:"max-width .3s ease" }}>
        {/* Header */}
        <div style={{ padding:"16px 28px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:calendar.color+"14", display:"flex", alignItems:"center", justifyContent:"center", color:calendar.color, fontWeight:800, fontSize:14 }}>{(company?.name||"C")[0]}</div>
          <div style={{ flex:1 }}><div style={{ fontSize:15, fontWeight:700 }}>{company.name}</div></div>
          <span onClick={onBack} style={{ cursor:"pointer", color:T.text3, fontSize:13 }}>← Retour</span>
        </div>

        <div style={{ display:"flex", minHeight:420, flexWrap:"wrap" }}>
          {/* LEFT PANEL */}
          <div style={{ width:220, minWidth:220, padding:"28px 24px", borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", gap:16 }} className="pub-left">
            {collab && (
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <Avatar name={collab.name} color={collab.color} size={40}/>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{collab.name}</div>
                  <div style={{ fontSize:11, color:T.text3 }}>{collab.role==="admin"?"Admin":"Collaborateur"}</div>
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize:20, fontWeight:800, color:T.text, lineHeight:1.2 }}>{calendar.name}</div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:T.text2 }}>
                <I n="clock" s={16}/> <span style={{ fontWeight:600 }}>{calendar.duration} min</span>
              </div>
              {calendar.location && (
                <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:T.text2 }}>
                  <I n={locIcon} s={16}/> <span>{calendar.location}</span>
                </div>
              )}
              {/* Google Map embed for physical locations */}
              {calendar.location && !/zoom|meet|téléphone|phone|visio/i.test(calendar.location) && window.google?.maps && (
                <div style={{ marginTop:8, borderRadius:10, overflow:"hidden", border:`1px solid ${T.border}`, height:120 }}>
                  <iframe width="100%" height="120" frameBorder="0" style={{ border:0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps/embed/v1/place?key=${_T.mapsKey||""}&q=${encodeURIComponent(calendar.location)}`}/>
                </div>
              )}
              {calendar.price > 0 && (
                <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:T.text2 }}>
                  <I n="zap" s={16}/> <span style={{ fontWeight:600 }}>{calendar.price} {calendar.currency}</span>
                </div>
              )}
            </div>
            <div style={{ flex:1 }}/>
            <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:14, display:"flex", alignItems:"center", gap:6, fontSize:11, color:T.text3 }}>
              <I n="globe" s={13}/> Europe/Paris (CET)
            </div>
          </div>

          {/* CENTER: Calendar */}
          <div style={{ flex:1, padding:"24px 28px" }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:20 }}>Sélectionnez une date et un créneau</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <span onClick={() => changeMonth(-1)} style={{ cursor:"pointer", padding:"6px 10px", borderRadius:8, border:`1px solid ${T.border}`, color:T.text2 }}><I n="chevL" s={14}/></span>
              <span style={{ fontSize:15, fontWeight:700, color:T.text }}>{MONTHS_FR[month]} {year}</span>
              <span onClick={() => changeMonth(1)} style={{ cursor:"pointer", padding:"6px 10px", borderRadius:8, border:`1px solid ${T.border}`, color:T.text2 }}><I n="chevR" s={14}/></span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:8 }}>
              {["LUN","MAR","MER","JEU","VEN","SAM","DIM"].map(d => (
                <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:600, color:T.text3, padding:"6px 0" }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
              {calDays.map((day, idx) => {
                if (!day) return <div key={`e${idx}`}/>;
                const ds = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const avail = isAvailable(day);
                const isSel = selDate === ds;
                const isToday = ds === todayStr;
                return (
                  <div key={idx} onClick={() => avail && setSelDate(ds)} style={{
                    width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center",
                    borderRadius:20, cursor:avail?"pointer":"default", margin:"0 auto",
                    fontSize:14, fontWeight: isSel||isToday ? 700 : 400,
                    background: isSel ? calendar.color : isToday ? calendar.color+"14" : "transparent",
                    color: isSel ? "#fff" : avail ? T.text : T.text3+"66",
                    border: isToday && !isSel ? `2px solid ${calendar.color}44` : "2px solid transparent",
                    transition:"all .15s",
                  }}>{day}</div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Time slots (visible when date selected) */}
          {selDate && (
            <div style={{ width:200, borderLeft:`1px solid ${T.border}`, padding:"24px 16px", overflowY:"auto" }} className="pub-times">
              <div style={{ fontSize:14, fontWeight:700, color:T.text, marginBottom:16 }}>{formatDateStr(selDate)}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {times.map(t => {
                  const isSel = selTime === t;
                  return (
                    <div key={t} style={{ display:"flex", gap:6 }}>
                      <div onClick={() => setSelTime(isSel ? null : t)} style={{
                        flex:1, padding:"10px 0", textAlign:"center", borderRadius:8, cursor:"pointer",
                        border:`1.5px solid ${isSel ? calendar.color : T.border}`,
                        background: isSel ? calendar.color+"10" : T.surface,
                        color: isSel ? calendar.color : T.text, fontSize:13, fontWeight:600,
                        transition:"all .15s",
                      }}>{t}</div>
                      {isSel && (
                        <div onClick={() => setStep("form")} style={{
                          padding:"10px 14px", borderRadius:8, cursor:"pointer",
                          background:calendar.color, color:"#fff", fontSize:13, fontWeight:700,
                          display:"flex", alignItems:"center",
                        }}>Confirmer</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

    </div>
  );
};

// ═══════════════════════════════════════════════════
// LANDING
// ═══════════════════════════════════════════════════

export default VisitorBooking;
