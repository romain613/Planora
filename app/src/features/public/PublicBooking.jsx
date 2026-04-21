import React, { Fragment, useEffect, useState } from "react";
import { T } from "../../theme";
import { _T } from "../../shared/state/tabState";
import { api } from "../../shared/services/api";
import { COMMON_TIMEZONES } from "../../shared/utils/constants";
import { Btn, I, Input, Logo } from "../../shared/ui";
import { useBrand } from "../../shared/brand/useBrand";

const PublicBooking = ({ companySlug, calSlug }) => {
  const [calData, setCalData] = useState(null);
  const [loadingCal, setLoadingCal] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [step, setStep] = useState("date"); // date → time → form → done
  const [form, setForm] = useState({ name:"", email:"", phone:"" });
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const brand = useBrand();
  const [selectedDuration, setSelectedDuration] = useState(null);

  // Timezone states
  const [visitorTz, setVisitorTz] = useState(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'Europe/Paris'; } });
  const [collabTimezone, setCollabTimezone] = useState(null);

  useEffect(() => {
    api(`/api/public/calendar/${companySlug}/${calSlug}`).then(data => {
      if (data && data.calendar) {
        setCalData(data);
        setSelectedDuration(data.calendar.duration);
        // Determine collaborator timezone
        const firstCollab = data.collaborators?.[0];
        setCollabTimezone(firstCollab?.timezone || data.companyTimezone || 'Europe/Paris');
      }
      setLoadingCal(false);
    });
  }, [companySlug, calSlug]);

  // Load slots when date or visitor timezone changes
  useEffect(() => {
    if (!selectedDate || !calData) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    const tzParam = visitorTz ? `&visitorTimezone=${encodeURIComponent(visitorTz)}` : '';
    api(`/api/public/slots/${companySlug}/${calSlug}?date=${selectedDate}&duration=${selectedDuration || calData.calendar.duration}${tzParam}`).then(data => {
      setSlots(data?.slots || []);
      setLoadingSlots(false);
    });
  }, [selectedDate, selectedDuration, visitorTz]);

  const DAYS = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

  const today = new Date();
  const calMonth = new Date(today.getFullYear(), today.getMonth() + (typeof monthOffset!=='undefined'?monthOffset:null), 1);
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const firstDay = (calMonth.getDay() + 6) % 7;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const maxDate = calData ? new Date(today.getTime() + (calData.calendar.maxAdvanceDays||60)*86400000) : null;

  const calDays = [];
  for (let i = 0; i < firstDay; i++) calDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calMonth.getFullYear()}-${String(calMonth.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    calDays.push(ds);
  }

  const isDateAvailable = (ds) => {
    if (!ds) return false;
    const d = new Date(ds);
    if (d < new Date(todayStr)) return false;
    if (maxDate && d > maxDate) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!form.name || !form.email) return;
    setSubmitting(true);
    const res = await api("/api/public/book", {
      method: "POST",
      body: {
        calendarSlug: calSlug,
        companySlug,
        date: selectedDate,
        time: selectedSlot.time,
        duration: selectedDuration || calData.calendar.duration,
        visitorName: form.name,
        visitorEmail: form.email,
        visitorPhone: form.phone,
        collaboratorId: selectedSlot.collaboratorId,
        answers,
        visitorTimezone: visitorTz,
      },
    });
    setResult(res);
    setStep("done");
    setSubmitting(false);
  };

  if (loadingCal) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:T.bg, gap:16 }}>
      <Logo s={48} rounded={12}/>
      <div style={{ width:28, height:28, border:`3px solid ${T.border}`, borderTopColor:T.accent, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!calData) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:T.bg, gap:16 }}>
      <Logo s={48} rounded={12}/>
      <div style={{ fontSize:18, fontWeight:600, color:T.text }}>Calendrier introuvable</div>
      <div style={{ fontSize:14, color:T.text3 }}>Ce lien de réservation n'existe pas ou a été désactivé.</div>
    </div>
  );

  const cal = calData.calendar;
  const comp = calData.company;
  const color = cal.color || "#2563EB";

  return (
    <div style={{ minHeight:"100vh", background:"#F8FAFC", display:"flex", flexDirection:"column" }}>
      {/* Header with company branding */}
      <div style={{ padding:"14px 24px", background:"#fff", borderBottom:"1px solid #E2E8F0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:color+"14", display:"flex", alignItems:"center", justifyContent:"center", color:color, fontWeight:800, fontSize:15 }}>{comp.name?.[0]||"C"}</div>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:"#111" }}>{comp.name}</div>
          </div>
        </div>
        <div style={{ fontSize:10, color:"#94A3B8" }}>Propulsé par <span style={{ fontWeight:600, color:color }}>{brand.name}</span></div>
      </div>

      <div style={{ flex:1, display:"flex", justifyContent:"center", padding:"32px 16px" }}>
        <div style={{ width:"100%", maxWidth: step === "date" ? 860 : 640, transition:"max-width .3s ease" }}>

          {/* Calendar card with description */}
          <div style={{ background:"#fff", borderRadius:16, border:"1px solid #E2E8F0", overflow:"hidden", marginBottom:24, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            {/* Color strip top */}
            <div style={{ height:4, background:`linear-gradient(90deg, ${color}, ${color}88)` }}/>
            <div style={{ padding:"20px 24px", borderBottom:"1px solid #E2E8F0", display:"flex", alignItems:"flex-start", gap:14 }}>
              <div style={{ width:52, height:52, borderRadius:14, background:color+"12", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, border:`1px solid ${color}22` }}>
                <I n="calendar" s={24}/>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:20, fontWeight:800, color:"#111", lineHeight:1.2 }}>{cal.name}</div>
                {cal.description && <div style={{ fontSize:13, color:"#64748B", marginTop:6, lineHeight:1.5 }}>{cal.description}</div>}
                <div style={{ fontSize:13, color:"#64748B", display:"flex", gap:14, flexWrap:"wrap", marginTop:8 }}>
                  <span style={{ display:"flex", alignItems:"center", gap:4 }}><I n="clock" s={14}/> {selectedDuration || cal.duration} min</span>
                  {cal.location && <span style={{ display:"flex", alignItems:"center", gap:4 }}><I n={/zoom|meet|visio/i.test(cal.location)?"globe":"map"} s={14}/> {cal.location}</span>}
                  {cal.price > 0 && <span style={{ color:color, fontWeight:700, display:"flex", alignItems:"center", gap:4 }}>{cal.price}{cal.currency === "EUR" ? "€" : cal.currency}</span>}
                </div>
              </div>
            </div>

            {/* Duration selector if multi-duration */}
            {cal.durations && cal.durations.length > 1 && step === "date" && (
              <div style={{ padding:"12px 24px", borderBottom:`1px solid ${T.border}`, display:"flex", gap:8, flexWrap:"wrap" }}>
                <span style={{ fontSize:12, color:T.text3, alignSelf:"center", marginRight:4 }}>Durée :</span>
                {cal.durations.map(d => (
                  <div key={d} onClick={() => setSelectedDuration(d)} style={{
                    padding:"6px 14px", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer",
                    background: d === selectedDuration ? cal.color+"14" : T.bg,
                    color: d === selectedDuration ? cal.color : T.text2,
                    border: `1px solid ${d === selectedDuration ? cal.color+"44" : T.border}`,
                  }}>{d} min</div>
                ))}
              </div>
            )}

            {/* Timezone indicator + visitor local time */}
            {collabTimezone && (
              <div style={{ padding:"8px 24px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:12, color:T.text3 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <I n="globe" s={13}/>
                  {visitorTz && visitorTz !== collabTimezone ? (
                    <span>Heures affichées en <select value={visitorTz} onChange={e => setVisitorTz(e.target.value)} style={{ background:"transparent", border:"none", color:T.accent, fontWeight:600, fontSize:12, cursor:"pointer", padding:0 }}>
                      {[visitorTz, collabTimezone, ...COMMON_TIMEZONES.filter(tz => tz !== visitorTz && tz !== collabTimezone)].map(tz => <option key={tz} value={tz}>{tz.replace(/_/g," ")}</option>)}
                    </select></span>
                  ) : (
                    <span>Fuseau horaire : {(collabTimezone || 'Europe/Paris').replace(/_/g," ")}</span>
                  )}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:4, fontWeight:600, color:T.text2 }}>
                  <I n="clock" s={12}/>
                  {new Date().toLocaleTimeString("fr-FR",{ hour:"2-digit", minute:"2-digit", timeZone: visitorTz || collabTimezone })}
                </div>
              </div>
            )}

            {/* Step progress indicator */}
            {step !== "done" && (
              <div style={{ padding:"14px 24px", borderBottom:"1px solid #E2E8F0", display:"flex", alignItems:"center", gap:0 }}>
                {[{id:"date",n:1,l:"Date & Heure"},{id:"form",n:2,l:"Détails"}].map((s,i)=>{
                  const stepIdx = {date:0,time:0,form:1};
                  const current = stepIdx[step];
                  const isDone = i < current;
                  const isActive = i === current;
                  return (<Fragment key={s.id}>
                    {i>0 && <div style={{ flex:1, height:2, background:isDone||isActive?color:"#E2E8F0", transition:"all .3s", margin:"0 4px" }}/>}
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ width:24, height:24, borderRadius:12, background:isDone||isActive?color:"#E2E8F0", color:isDone||isActive?"#fff":"#94A3B8", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .3s" }}>
                        {isDone?"✓":s.n}
                      </div>
                      <span style={{ fontSize:12, fontWeight:isActive?700:500, color:isActive?"#111":isDone?color:"#94A3B8" }}>{s.l}</span>
                    </div>
                  </Fragment>);
                })}
              </div>
            )}
            <div style={{ padding:24 }}>
              {/* STEP 1: Date + Slots side by side */}
              {step === "date" && (
                <div style={{ display:"flex", gap:0 }}>
                  {/* Left: Calendar */}
                  <div style={{ flex:"1 1 auto", minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:T.text, marginBottom:16 }}>Choisissez une date</div>

                    {/* Month nav */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                      <div onClick={() => setMonthOffset(p => p-1)} style={{ cursor:"pointer", padding:6, borderRadius:8, background:T.bg }}><I n="chevL" s={16}/></div>
                      <div style={{ fontSize:15, fontWeight:700 }}>{MONTHS[calMonth.getMonth()]} {calMonth.getFullYear()}</div>
                      <div onClick={() => setMonthOffset(p => p+1)} style={{ cursor:"pointer", padding:6, borderRadius:8, background:T.bg }}><I n="chevR" s={16}/></div>
                    </div>

                    {/* Day headers */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4 }}>
                      {DAYS.map(d => <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:600, color:T.text3, padding:6 }}>{d}</div>)}
                    </div>

                    {/* Calendar grid */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
                      {calDays.map((ds, i) => {
                        if (!ds) return <div key={`e${i}`}/>;
                        const dayNum = parseInt(ds.split("-")[2]);
                        const available = isDateAvailable(ds);
                        const isSelected = ds === selectedDate;
                        const isToday = ds === todayStr;
                        return (
                          <div key={ds} onClick={() => available && setSelectedDate(ds)} style={{
                            textAlign:"center", padding:"10px 4px", borderRadius:10, cursor:available?"pointer":"default",
                            background: isSelected ? cal.color : isToday ? T.accentBg : "transparent",
                            color: isSelected ? "#fff" : !available ? T.text3+"66" : isToday ? cal.color : T.text,
                            fontWeight: isSelected || isToday ? 700 : 500, fontSize:14,
                            opacity: available ? 1 : 0.4,
                            transition: "all .15s",
                          }}>{dayNum}</div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Available slots panel */}
                  {selectedDate && (
                    <div style={{ width:220, flexShrink:0, borderLeft:"1px solid #E2E8F0", paddingLeft:20, marginLeft:20 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:4 }}>
                        {new Date(selectedDate+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"short"})}
                      </div>
                      <div style={{ fontSize:11, color:T.text3, marginBottom:12 }}>Créneaux disponibles</div>

                      {(typeof loadingSlots!=='undefined'?loadingSlots:null) ? (
                        <div style={{ textAlign:"center", padding:"30px 0", color:T.text3 }}>
                          <div style={{ width:20, height:20, border:`2px solid ${T.border}`, borderTopColor:color, borderRadius:"50%", animation:"spin 1s linear infinite", margin:"0 auto 8px" }}/>
                          <div style={{ fontSize:11 }}>Chargement...</div>
                        </div>
                      ) : slots.length === 0 ? (
                        <div style={{ textAlign:"center", padding:"24px 0", color:T.text3, fontSize:12 }}>
                          <div style={{ fontSize:24, marginBottom:6, opacity:0.5 }}>:/</div>
                          Aucun créneau disponible
                        </div>
                      ) : (
                        <div style={{ maxHeight:320, overflowY:"auto", display:"flex", flexDirection:"column", gap:6 }}>
                          {slots.map((s, i) => (
                            <div key={i} onClick={() => { setSelectedSlot(s); setStep("form"); }} style={{
                              padding:"10px 14px", borderRadius:10, cursor:"pointer",
                              border:`1px solid ${T.border}`, background:"#fff", fontSize:14, fontWeight:600,
                              color:color, textAlign:"center", transition:"all .15s",
                            }}
                            onMouseOver={e => { e.currentTarget.style.background=color+"12"; e.currentTarget.style.borderColor=color+"44"; e.currentTarget.style.transform="scale(1.02)"; }}
                            onMouseOut={e => { e.currentTarget.style.background="#fff"; e.currentTarget.style.borderColor=T.border; e.currentTarget.style.transform="scale(1)"; }}
                            >
                              {s.displayTime || s.time}
                              {s.displayDate && s.displayDate !== selectedDate && (
                                <div style={{ fontSize:9, color:T.text3, marginTop:1 }}>
                                  {new Date(s.displayDate+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: Time */}
              {step === "time" && (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
                    <div onClick={() => setStep("date")} style={{ cursor:"pointer", padding:4 }}><I n="chevL" s={16}/></div>
                    <div style={{ fontSize:14, fontWeight:600, color:T.text }}>
                      {new Date(selectedDate).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}
                    </div>
                  </div>

                  {(typeof loadingSlots!=='undefined'?loadingSlots:null) ? (
                    <div style={{ textAlign:"center", padding:40, color:T.text3 }}>
                      <div style={{ width:24, height:24, border:`3px solid ${T.border}`, borderTopColor:T.accent, borderRadius:"50%", animation:"spin 1s linear infinite", margin:"0 auto 12px" }}/>
                      Chargement des créneaux...
                    </div>
                  ) : slots.length === 0 ? (
                    <div style={{ textAlign:"center", padding:40, color:T.text3 }}>
                      <div style={{ fontSize:32, marginBottom:8 }}>:(</div>
                      Aucun créneau disponible ce jour.
                      <br/>
                      <span onClick={() => setStep("date")} style={{ color:T.accent, cursor:"pointer", fontWeight:600 }}>Choisir une autre date</span>
                    </div>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                      {slots.map((s, i) => (
                        <div key={i} onClick={() => { setSelectedSlot(s); setStep("form"); }} style={{
                          padding:"12px 8px", borderRadius:10, textAlign:"center", cursor:"pointer",
                          border:`1px solid ${T.border}`, background:T.surface, fontSize:15, fontWeight:600,
                          color:cal.color, transition:"all .15s",
                        }}
                        onMouseOver={e => { e.currentTarget.style.background=cal.color+"14"; e.currentTarget.style.borderColor=cal.color+"44"; }}
                        onMouseOut={e => { e.currentTarget.style.background=T.surface; e.currentTarget.style.borderColor=T.border; }}
                        >
                          {s.displayTime || s.time}
                          {s.displayDate && s.displayDate !== selectedDate && (
                            <div style={{ fontSize:10, color:T.text3, marginTop:2 }}>
                              {new Date(s.displayDate+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: Form */}
              {step === "form" && (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
                    <div onClick={() => setStep("date")} style={{ cursor:"pointer", padding:4 }}><I n="chevL" s={16}/></div>
                    <div style={{ fontSize:14, fontWeight:600, color:T.text }}>
                      {new Date(selectedDate+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})} à {selectedSlot.displayTime || selectedSlot.time}
                    </div>
                  </div>

                  <div style={{ background:cal.color+"08", border:`1px solid ${cal.color}22`, borderRadius:12, padding:"14px 16px", marginBottom:20 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <I n="clock" s={16}/>
                      <span style={{ fontSize:13, fontWeight:600 }}>
                        {new Date(selectedDate+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})} — {selectedSlot.displayTime || selectedSlot.time} ({selectedDuration || cal.duration} min)
                      </span>
                    </div>
                    {visitorTz && collabTimezone && visitorTz !== collabTimezone && (
                      <div style={{ fontSize:11, color:T.text3, marginTop:6, paddingLeft:26 }}>
                        Heure du praticien : {selectedSlot.time} ({collabTimezone.replace(/_/g," ")})
                      </div>
                    )}
                  </div>

                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    <Input label="Nom complet *" value={form.name} onChange={e => setForm(p => ({...p, name:e.target.value}))} icon="user"/>
                    <Input label="Email *" value={form.email} onChange={e => setForm(p => ({...p, email:e.target.value}))} icon="mail" type="email"/>
                    <Input label="Téléphone" value={form.phone} onChange={e => setForm(p => ({...p, phone:e.target.value}))} icon="phone"/>

                    {/* Custom questions */}
                    {cal.questions && cal.questions.map(q => (
                      <Input key={q.id} label={q.label + (q.required ? " *" : "")} value={answers[q.id] || ""} onChange={e => setAnswers(p => ({...p, [q.id]:e.target.value}))}/>
                    ))}
                  </div>

                  {cal.requireApproval && (
                    <div style={{ background:T.warningBg, border:`1px solid ${T.warning}22`, borderRadius:10, padding:"10px 14px", marginTop:16, fontSize:12, color:T.warning, fontWeight:500 }}>
                      Ce rendez-vous nécessite une confirmation de l'équipe. Vous recevrez un email de confirmation.
                    </div>
                  )}

                  <Btn primary style={{ marginTop:20, width:"100%", opacity:(!form.name||!form.email)?0.5:1 }} onClick={handleSubmit} disabled={submitting || !form.name || !form.email}>
                    {submitting ? "Réservation en cours..." : cal.requireApproval ? "Demander ce créneau" : "Confirmer la réservation"}
                  </Btn>
                </div>
              )}

              {/* STEP 4: Done */}
              {step === "done" && result && (
                <div style={{ textAlign:"center", padding:"20px 0" }}>
                  <div style={{ width:64, height:64, borderRadius:"50%", background:T.successBg, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", color:T.success }}>
                    <I n="check" s={32}/>
                  </div>
                  <div style={{ fontSize:20, fontWeight:700, color:T.text, marginBottom:8 }}>
                    {result.booking?.status === "pending" ? "Demande envoyée !" : "Rendez-vous confirmé !"}
                  </div>
                  <div style={{ fontSize:14, color:T.text2, marginBottom:20 }}>{result.message}</div>

                  <div style={{ background:T.bg, borderRadius:12, padding:16, textAlign:"left", fontSize:13 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                      <span style={{ color:T.text3 }}>Calendrier</span>
                      <span style={{ fontWeight:600 }}>{cal.name}</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                      <span style={{ color:T.text3 }}>Date</span>
                      <span style={{ fontWeight:600 }}>{new Date(selectedDate+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                      <span style={{ color:T.text3 }}>Heure</span>
                      <div style={{ textAlign:"right" }}>
                        <span style={{ fontWeight:600 }}>{selectedSlot.displayTime || selectedSlot.time}</span>
                        {visitorTz && collabTimezone && visitorTz !== collabTimezone && (
                          <div style={{ fontSize:11, color:T.text3 }}>
                            Heure du praticien : {selectedSlot.time} ({collabTimezone.replace(/_/g," ")})
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <span style={{ color:T.text3 }}>Durée</span>
                      <span style={{ fontWeight:600 }}>{selectedDuration || cal.duration} min</span>
                    </div>
                    {cal.location && (
                      <div style={{ display:"flex", justifyContent:"space-between", marginTop:8 }}>
                        <span style={{ color:T.text3 }}>Lieu</span>
                        <span style={{ fontWeight:600 }}>{result.booking?.meetLink ? "Google Meet" : cal.location}</span>
                      </div>
                    )}
                  </div>

                  {/* Google Map for physical location */}
                  {cal.location && !result.booking?.meetLink && !/zoom|meet|téléphone|phone|visio/i.test(cal.location) && _T.mapsKey && (
                    <div style={{ marginTop:16, borderRadius:12, overflow:"hidden", border:`1px solid ${T.border}`, height:150 }}>
                      <iframe width="100%" height="150" frameBorder="0" style={{ border:0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                        src={`https://www.google.com/maps/embed/v1/place?key=${_T.mapsKey}&q=${encodeURIComponent(cal.location)}`}/>
                    </div>
                  )}

                  {result.booking?.meetLink && (
                    <a href={result.booking.meetLink} target="_blank" rel="noopener noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:8, marginTop:16, padding:"14px 28px", borderRadius:10, background:"#00897B", color:"#fff", fontSize:15, fontWeight:700, textDecoration:"none", cursor:"pointer" }}>
                      <span style={{ fontSize:18 }}>📹</span> Rejoindre Google Meet
                    </a>
                  )}

                  <div style={{ fontSize:12, color:T.text3, marginTop:16 }}>Un email de confirmation a été envoyé à {form.email}</div>

                  {result.booking?.manageToken && (
                    <div style={{ marginTop:16, padding:"12px 16px", borderRadius:10, background:"#F1F5F9", border:"1px solid #E2E8F0" }}>
                      <div style={{ fontSize:11, fontWeight:600, color:"#64748B", marginBottom:6 }}>Lien de gestion (modifier ou annuler) :</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ flex:1, fontSize:11, fontFamily:"monospace", color:color, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>calendar360.fr/manage/{result.booking.manageToken}</span>
                        <span onClick={() => { navigator.clipboard.writeText(`https://calendar360.fr/manage/${result.booking.manageToken}`); }} style={{ cursor:"pointer", padding:"3px 8px", borderRadius:6, background:color+"14", color:color, fontSize:10, fontWeight:600, flexShrink:0 }}>Copier</span>
                      </div>
                    </div>
                  )}

                  <div onClick={() => { setStep("date"); setSelectedDate(null); setSelectedSlot(null); setResult(null); }} style={{ marginTop:20, padding:"12px 24px", borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, cursor:"pointer", fontSize:14, fontWeight:600, color:T.accent, display:"inline-block" }}>
                    Réserver un autre créneau
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign:"center", fontSize:11, color:"#94A3B8", marginTop:8, marginBottom:20 }}>
            Propulsé par <a href="https://calendar360.fr" target="_blank" rel="noopener noreferrer" style={{ fontWeight:700, color:color, textDecoration:"none" }}>{brand.name}</a>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════

export default PublicBooking;
