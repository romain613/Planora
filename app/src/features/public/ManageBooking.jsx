import React, { useEffect, useState } from "react";
import { api } from "../../shared/services/api";
import { I, Logo } from "../../shared/ui";

const ManageBooking = ({ token }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null); // null | "cancel" | "reschedule"
  const [cancelReason, setCancelReason] = useState("");
  const [done, setDone] = useState(null); // null | {type, message}
  const [submitting, setSubmitting] = useState(false);
  // Reschedule states
  const [rslots, setRslots] = useState([]);
  const [rdate, setRdate] = useState(null);
  const [rtime, setRtime] = useState(null);
  const [rmonthOffset, setRmonthOffset] = useState(0);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    api(`/api/manage/${token}`).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [token]);

  // Load slots for reschedule — use visitor's original timezone from booking
  useEffect(() => {
    if (!rdate || !data) return;
    setLoadingSlots(true);
    const tzParam = data.visitorTimezone ? `&visitorTimezone=${encodeURIComponent(data.visitorTimezone)}` : '';
    api(`/api/public/slots/${data.companySlug}/${data.calendarSlug}?date=${rdate}&duration=${data.duration}${tzParam}`).then(d => {
      setRslots(d?.slots || []);
      setLoadingSlots(false);
    });
  }, [rdate]);

  const handleCancel = async () => {
    setSubmitting(true);
    const r = await api(`/api/manage/${token}/cancel`, { method:"POST", body:{ reason:cancelReason } });
    setDone({ type:"cancel", message: r?.message || "Votre rendez-vous a été annulé." });
    setSubmitting(false);
  };

  const handleReschedule = async () => {
    if (!rdate || !rtime) return;
    setSubmitting(true);
    // Send the collaborator's time (rtime.collabTime), not the displayed visitor time
    const collabTime = typeof rtime === 'object' ? rtime.collabTime : rtime;
    const r = await api(`/api/manage/${token}/reschedule`, { method:"POST", body:{ date:rdate, time:collabTime } });
    setDone({ type:"reschedule", message: r?.message || "Votre rendez-vous a été replanifié." });
    setSubmitting(false);
  };

  const DAYS = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const today = new Date();
  const calMonth = new Date(today.getFullYear(), today.getMonth() + rmonthOffset, 1);
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const firstDay = (calMonth.getDay() + 6) % 7;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const calDays = [];
  for (let i = 0; i < firstDay; i++) calDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calDays.push(`${calMonth.getFullYear()}-${String(calMonth.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);

  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:"#F8FAFC", gap:16 }}>
      <Logo s={48} rounded={12}/>
      <div style={{ width:28, height:28, border:"3px solid #E2E8F0", borderTopColor:"#2563EB", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!data || data.error) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:"#F8FAFC", gap:16 }}>
      <Logo s={48} rounded={12}/>
      <div style={{ fontSize:18, fontWeight:600, color:"#111" }}>Lien invalide ou expiré</div>
      <div style={{ fontSize:14, color:"#64748B" }}>Ce lien de gestion de rendez-vous n'est pas valide.</div>
    </div>
  );

  const color = data.calendarColor || "#2563EB";
  const fmtD = (ds) => { try { return new Date(ds+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}); } catch { return ds; } };

  // Done state
  if (done) return (
    <div style={{ minHeight:"100vh", background:"#F8FAFC", display:"flex", flexDirection:"column", alignItems:"center" }}>
      <div style={{ padding:"14px 24px", background:"#fff", borderBottom:"1px solid #E2E8F0", width:"100%", display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:color+"14", display:"flex", alignItems:"center", justifyContent:"center", color:color, fontWeight:800, fontSize:15 }}>{data.companyName?.[0]}</div>
        <span style={{ fontSize:15, fontWeight:700 }}>{data.companyName}</span>
      </div>
      <div style={{ maxWidth:480, width:"100%", padding:"40px 20px", textAlign:"center" }}>
        <div style={{ width:64, height:64, borderRadius:"50%", background:done.type==="cancel"?"#FEE2E2":"#D1FAE5", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
          <I n={done.type==="cancel"?"x":"check"} s={32}/>
        </div>
        <div style={{ fontSize:20, fontWeight:700, color:"#111", marginBottom:8 }}>{done.type==="cancel"?"Rendez-vous annulé":"Rendez-vous replanifié"}</div>
        <div style={{ fontSize:14, color:"#64748B" }}>{done.message}</div>
        {done.type==="cancel" && data.companySlug && data.calendarSlug && (
          <a href={`https://calendar360.fr/${data.companySlug}/${data.calendarSlug}`} style={{ display:"inline-block", marginTop:20, padding:"12px 28px", borderRadius:10, background:color, color:"#fff", fontSize:14, fontWeight:700, textDecoration:"none" }}>
            Reprendre un rendez-vous
          </a>
        )}
        <div style={{ marginTop:24, fontSize:11, color:"#94A3B8" }}>Propulsé par <a href="https://calendar360.fr" style={{ color:color, textDecoration:"none", fontWeight:600 }}>Calendar360</a></div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#F8FAFC", display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <div style={{ padding:"14px 24px", background:"#fff", borderBottom:"1px solid #E2E8F0", display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:color+"14", display:"flex", alignItems:"center", justifyContent:"center", color:color, fontWeight:800, fontSize:15 }}>{data.companyName?.[0]}</div>
        <span style={{ fontSize:15, fontWeight:700 }}>{data.companyName}</span>
      </div>

      <div style={{ flex:1, display:"flex", justifyContent:"center", padding:"32px 16px" }}>
        <div style={{ maxWidth:480, width:"100%" }}>
          <div style={{ fontSize:22, fontWeight:800, color:"#111", marginBottom:4 }}>Gérer votre rendez-vous</div>
          <div style={{ fontSize:13, color:"#64748B", marginBottom:24 }}>Modifiez ou annulez votre réservation ci-dessous.</div>

          {/* Booking summary card */}
          <div style={{ background:"#fff", borderRadius:14, border:"1px solid #E2E8F0", overflow:"hidden", marginBottom:20, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ height:4, background:color }}/>
            <div style={{ padding:"20px 24px" }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#111", marginBottom:12 }}>{data.calendarName}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#334155" }}>
                  <I n="calendar" s={16}/> <span style={{ fontWeight:600 }}>{fmtD(data.date)}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#334155" }}>
                  <I n="clock" s={16}/> <span style={{ fontWeight:600 }}>{data.time} — {data.duration} min</span>
                </div>
                {data.calendarLocation && (
                  <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#334155" }}>
                    <I n="map" s={16}/> {data.calendarLocation}
                  </div>
                )}
                <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#334155" }}>
                  <I n="user" s={16}/> {data.visitorName} ({data.visitorEmail})
                </div>
              </div>
              <div style={{ marginTop:14 }}>
                <span style={{ padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:700, background:data.status==="confirmed"?"#D1FAE5":data.status==="pending"?"#FEF3C7":"#FEE2E2", color:data.status==="confirmed"?"#059669":data.status==="pending"?"#D97706":"#DC2626" }}>
                  {data.status==="confirmed"?"✓ Confirmé":data.status==="pending"?"⏳ En attente":"✕ Annulé"}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          {data.status !== "cancelled" && !action && (
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setAction("reschedule")} style={{ flex:1, padding:"14px 0", borderRadius:10, border:`2px solid ${color}`, background:"#fff", color:color, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <I n="edit" s={16}/> Replanifier
              </button>
              <button onClick={() => setAction("cancel")} style={{ flex:1, padding:"14px 0", borderRadius:10, border:"2px solid #DC2626", background:"#fff", color:"#DC2626", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <I n="x" s={16}/> Annuler
              </button>
            </div>
          )}

          {/* Cancel flow */}
          {action === "cancel" && (
            <div style={{ background:"#fff", borderRadius:14, border:"1px solid #FCA5A5", padding:24, marginTop:12 }}>
              <div style={{ fontSize:15, fontWeight:700, color:"#DC2626", marginBottom:12 }}>Confirmer l'annulation</div>
              <textarea value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="Raison de l'annulation (optionnel)..." rows={3} style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:13, fontFamily:"inherit", color:"#111", resize:"vertical", outline:"none", boxSizing:"border-box", marginBottom:12 }}/>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setAction(null)} style={{ flex:1, padding:"12px 0", borderRadius:8, border:"1px solid #E2E8F0", background:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", color:"#64748B" }}>Retour</button>
                <button onClick={handleCancel} disabled={submitting} style={{ flex:1, padding:"12px 0", borderRadius:8, border:"none", background:"#DC2626", color:"#fff", fontSize:13, fontWeight:700, cursor:submitting?"wait":"pointer", fontFamily:"inherit", opacity:submitting?0.7:1 }}>
                  {submitting ? "Annulation..." : "Confirmer l'annulation"}
                </button>
              </div>
            </div>
          )}

          {/* Reschedule flow */}
          {action === "reschedule" && (
            <div style={{ background:"#fff", borderRadius:14, border:`1px solid ${color}44`, padding:24, marginTop:12 }}>
              <div style={{ fontSize:15, fontWeight:700, color:color, marginBottom:16 }}>Choisir une nouvelle date</div>

              {!rtime ? (
                <>
                  {/* Month nav */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <div onClick={() => setRmonthOffset(p => p-1)} style={{ cursor:"pointer", padding:6, borderRadius:8, background:"#F1F5F9" }}><I n="chevL" s={16}/></div>
                    <div style={{ fontSize:15, fontWeight:700, color:"#111" }}>{MONTHS[calMonth.getMonth()]} {calMonth.getFullYear()}</div>
                    <div onClick={() => setRmonthOffset(p => p+1)} style={{ cursor:"pointer", padding:6, borderRadius:8, background:"#F1F5F9" }}><I n="chevR" s={16}/></div>
                  </div>

                  {/* Day headers */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4 }}>
                    {DAYS.map(d => <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:600, color:"#94A3B8", padding:6 }}>{d}</div>)}
                  </div>

                  {/* Calendar grid */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
                    {calDays.map((ds, i) => {
                      if (!ds) return <div key={`e${i}`}/>;
                      const dayNum = parseInt(ds.split("-")[2]);
                      const available = ds >= todayStr;
                      const isSelected = ds === rdate;
                      return (
                        <div key={ds} onClick={() => { if(available){setRdate(ds);setRtime(null);} }} style={{
                          textAlign:"center", padding:"10px 4px", borderRadius:10, cursor:available?"pointer":"default",
                          background: isSelected ? color : "transparent",
                          color: isSelected ? "#fff" : !available ? "#CBD5E1" : "#111",
                          fontWeight: isSelected ? 700 : 500, fontSize:14, opacity: available ? 1 : 0.4, transition:"all .15s",
                        }}>{dayNum}</div>
                      );
                    })}
                  </div>

                  {/* Slots */}
                  {rdate && (
                    <div style={{ marginTop:16 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"#111", marginBottom:10 }}>{fmtD(rdate)}</div>
                      {loadingSlots ? (
                        <div style={{ textAlign:"center", padding:20, color:"#94A3B8" }}>
                          <div style={{ width:20, height:20, border:"2px solid #E2E8F0", borderTopColor:color, borderRadius:"50%", animation:"spin 1s linear infinite", margin:"0 auto 8px" }}/>
                          Chargement...
                        </div>
                      ) : rslots.length === 0 ? (
                        <div style={{ textAlign:"center", padding:20, color:"#94A3B8", fontSize:13 }}>Aucun créneau disponible</div>
                      ) : (
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                          {rslots.map((s, i) => (
                            <div key={i} onClick={() => setRtime({ display: s.displayTime || s.time, collabTime: s.time, displayDate: s.displayDate })} style={{
                              padding:"10px 8px", borderRadius:8, textAlign:"center", cursor:"pointer",
                              border:`1px solid #E2E8F0`, fontSize:14, fontWeight:600, color:color, transition:"all .15s",
                            }} onMouseOver={e=>{e.currentTarget.style.background=color+"14";e.currentTarget.style.borderColor=color+"44";}} onMouseOut={e=>{e.currentTarget.style.background="#fff";e.currentTarget.style.borderColor="#E2E8F0";}}>
                              {s.displayTime || s.time}
                              {s.displayDate && s.displayDate !== rdate && (
                                <div style={{ fontSize:9, color:"#94A3B8", marginTop:2 }}>{new Date(s.displayDate+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                /* Confirmation de replanification */
                <div>
                  <div style={{ background:color+"08", border:`1px solid ${color}22`, borderRadius:12, padding:"14px 16px", marginBottom:16 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <I n="calendar" s={16}/>
                      <span style={{ fontSize:14, fontWeight:600, color:"#111" }}>{fmtD(rdate)} à {typeof rtime === 'object' ? rtime.display : rtime}</span>
                    </div>
                    {data.visitorTimezone && data.collaboratorTimezone && data.visitorTimezone !== data.collaboratorTimezone && (
                      <div style={{ fontSize:11, color:"#6366F1", marginTop:4, paddingLeft:26, display:"flex", alignItems:"center", gap:4 }}>
                        <I n="globe" s={11}/> Heure du praticien : {typeof rtime === 'object' ? rtime.collabTime : rtime} ({(data.collaboratorTimezone||'').replace(/_/g,' ')})
                      </div>
                    )}
                    <div style={{ fontSize:12, color:"#64748B", marginTop:6, paddingLeft:26 }}>
                      Ancien créneau : {fmtD(data.date)} à {data.time}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:10 }}>
                    <button onClick={() => setRtime(null)} style={{ flex:1, padding:"12px 0", borderRadius:8, border:"1px solid #E2E8F0", background:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", color:"#64748B" }}>Changer</button>
                    <button onClick={handleReschedule} disabled={submitting} style={{ flex:1, padding:"12px 0", borderRadius:8, border:"none", background:color, color:"#fff", fontSize:13, fontWeight:700, cursor:submitting?"wait":"pointer", fontFamily:"inherit", opacity:submitting?0.7:1 }}>
                      {submitting ? "En cours..." : "Confirmer"}
                    </button>
                  </div>
                </div>
              )}

              {!rtime && (
                <button onClick={() => setAction(null)} style={{ width:"100%", padding:"10px 0", marginTop:12, borderRadius:8, border:"1px solid #E2E8F0", background:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", color:"#64748B" }}>Retour</button>
              )}
            </div>
          )}

          {data.status === "cancelled" && (
            <div style={{ background:"#FEE2E2", borderRadius:10, padding:"14px 20px", fontSize:13, color:"#DC2626", fontWeight:600, textAlign:"center" }}>
              Ce rendez-vous a été annulé.
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign:"center", fontSize:11, color:"#94A3B8", marginTop:24 }}>
            Propulsé par <a href="https://calendar360.fr" style={{ color:color, textDecoration:"none", fontWeight:600 }}>Calendar360</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageBooking;
