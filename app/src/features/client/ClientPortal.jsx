import React, { useEffect, useState } from "react";
import { T } from "../../theme";
import { api } from "../../shared/services/api";
import { I, Logo } from "../../shared/ui";
import { useBrand } from "../../shared/brand/useBrand";

const ClientPortal = ({ token }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [msgSent, setMsgSent] = useState(false);
  const brand = useBrand();

  useEffect(() => {
    api(`/api/espace/${token}`).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [token]);

  const handleSendMessage = async () => {
    if (!msgText.trim() || sending) return;
    setSending(true);
    const r = await api(`/api/espace/${token}/message`, { method:"POST", body:{ message:msgText.trim() } });
    if (r?.success) {
      setData(p => ({ ...p, messages: [...(p.messages||[]), { id:r.id, direction:'inbound', message:msgText.trim(), createdAt:new Date().toISOString() }] }));
      setMsgText(""); setMsgSent(true); setTimeout(() => setMsgSent(false), 3000);
    }
    setSending(false);
  };

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
      <div style={{ fontSize:18, fontWeight:600, color:"#111" }}>Espace introuvable</div>
      <div style={{ fontSize:14, color:"#64748B" }}>Ce lien n'est pas valide ou l'espace client n'est pas activé.</div>
    </div>
  );

  const color = data.company?.color || "#2563EB";
  const fmtD = (ds) => { try { return new Date(ds+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}); } catch { return ds; } };
  const fmtDT = (iso) => { try { return new Date(iso).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}); } catch { return iso; } };

  return (
    <div style={{ minHeight:"100vh", background:"#F8FAFC", display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <div style={{ padding:"14px 24px", background:"#fff", borderBottom:"1px solid #E2E8F0", display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:color+"14", display:"flex", alignItems:"center", justifyContent:"center", color:color, fontWeight:800, fontSize:15 }}>{data.company?.name?.[0]}</div>
        <span style={{ fontSize:15, fontWeight:700 }}>{data.company?.name}</span>
      </div>

      <div style={{ flex:1, display:"flex", justifyContent:"center", padding:"24px 16px" }}>
        <div style={{ maxWidth:540, width:"100%" }}>
          {/* Welcome */}
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:22, fontWeight:800, color:"#111" }}>Bonjour {data.contact?.firstName} 👋</div>
            <div style={{ fontSize:13, color:"#64748B", marginTop:4 }}>Bienvenue dans votre espace client.</div>
          </div>

          {/* Section RDV */}
          <div style={{ background:"#fff", borderRadius:14, border:"1px solid #E2E8F0", overflow:"hidden", marginBottom:16, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid #F1F5F9", display:"flex", alignItems:"center", gap:8 }}>
              <I n="calendar" s={16} style={{color:color}}/> <span style={{ fontSize:14, fontWeight:700, color:"#111" }}>Mes rendez-vous</span>
            </div>
            <div style={{ padding:"16px 20px" }}>
              {(data.bookings||[]).length === 0 ? (
                <div style={{ fontSize:13, color:"#94A3B8", textAlign:"center", padding:12 }}>Aucun rendez-vous à venir</div>
              ) : (data.bookings||[]).map(b => (
                <div key={b.id} style={{ padding:"12px 0", borderBottom:"1px solid #F8FAFC" }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#111" }}>{fmtD(b.date)} à {b.time}</div>
                  <div style={{ fontSize:12, color:"#64748B", marginTop:4 }}>{b.calendarName} · {b.duration}min{b.calendarLocation ? ` · ${b.calendarLocation}` : ''}</div>
                  {b.meetLink && <a href={b.meetLink} target="_blank" rel="noreferrer" style={{ display:"inline-block", marginTop:6, fontSize:12, color:"#00897B", fontWeight:600, textDecoration:"none" }}>📹 Rejoindre Google Meet</a>}
                  {b.manageToken && (
                    <div style={{ marginTop:10, display:"flex", gap:8 }}>
                      <a href={`/manage/${b.manageToken}`} target="_blank" rel="noreferrer" style={{ padding:"8px 16px", borderRadius:8, border:`1px solid ${color}`, background:"#fff", fontSize:13, color:color, fontWeight:700, textDecoration:"none", display:"inline-flex", alignItems:"center", gap:6 }}><I n="edit" s={13}/> Modifier</a>
                      <a href={`/manage/${b.manageToken}`} target="_blank" rel="noreferrer" style={{ padding:"8px 16px", borderRadius:8, border:"1px solid #FCA5A5", background:"#fff", fontSize:13, color:"#DC2626", fontWeight:700, textDecoration:"none", display:"inline-flex", alignItems:"center", gap:6 }}><I n="x" s={13}/> Annuler</a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section Documents */}
          {(data.documents||[]).length > 0 && (
            <div style={{ background:"#fff", borderRadius:14, border:"1px solid #E2E8F0", overflow:"hidden", marginBottom:16, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ padding:"14px 20px", borderBottom:"1px solid #F1F5F9", display:"flex", alignItems:"center", gap:8 }}>
                <I n="file" s={16} style={{color:color}}/> <span style={{ fontSize:14, fontWeight:700, color:"#111" }}>Mes documents</span>
              </div>
              <div style={{ padding:"12px 20px" }}>
                {data.documents.map((d, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:i < data.documents.length-1 ? "1px solid #F8FAFC" : "none" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:"#111" }}>📄 {d.name}</div>
                      {d.addedAt && <div style={{ fontSize:11, color:"#94A3B8", marginTop:2 }}>Ajouté le {fmtD(d.addedAt)}</div>}
                    </div>
                    <a href={d.url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:color, fontWeight:600, textDecoration:"none", padding:"6px 12px", borderRadius:8, background:color+"0A" }}>📥 Télécharger</a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section Dossier */}
          <div style={{ background:"#fff", borderRadius:14, border:"1px solid #E2E8F0", overflow:"hidden", marginBottom:16, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid #F1F5F9", display:"flex", alignItems:"center", gap:8 }}>
              <I n="folder" s={16} style={{color:color}}/> <span style={{ fontSize:14, fontWeight:700, color:"#111" }}>Mon dossier</span>
            </div>
            <div style={{ padding:"16px 20px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <span style={{ fontSize:12, color:"#64748B" }}>Statut :</span>
                <span style={{ padding:"4px 12px", borderRadius:20, fontSize:12, fontWeight:700, background:data.stage?.color+"18", color:data.stage?.color }}>{data.stage?.label}</span>
              </div>
              {data.collaborator && (
                <div style={{ fontSize:12, color:"#64748B" }}>Référent : <strong style={{ color:"#111" }}>{data.collaborator.name}</strong></div>
              )}
            </div>
          </div>

          {/* Section Messages */}
          <div style={{ background:"#fff", borderRadius:14, border:"1px solid #E2E8F0", overflow:"hidden", marginBottom:16, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid #F1F5F9", display:"flex", alignItems:"center", gap:8 }}>
              <I n="message" s={16} style={{color:color}}/> <span style={{ fontSize:14, fontWeight:700, color:"#111" }}>Messages</span>
            </div>
            <div style={{ padding:"16px 20px" }}>
              {(data.messages||[]).length > 0 && (
                <div style={{ maxHeight:200, overflowY:"auto", marginBottom:12, display:"flex", flexDirection:"column", gap:8 }}>
                  {data.messages.map(m => (
                    <div key={m.id} style={{ padding:"8px 12px", borderRadius:10, maxWidth:"80%", fontSize:13, lineHeight:1.4, alignSelf:m.direction==='inbound'?'flex-end':'flex-start', background:m.direction==='inbound'?color+"14":"#F1F5F9", color:"#111" }}>
                      {m.message}
                      <div style={{ fontSize:10, color:"#94A3B8", marginTop:4 }}>{fmtDT(m.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:"flex", gap:8 }}>
                <textarea value={msgText} onChange={e=>setMsgText(e.target.value)} placeholder="Écrire un message..." rows={2} style={{ flex:1, padding:"10px 12px", borderRadius:10, border:"1px solid #E2E8F0", fontSize:13, fontFamily:"inherit", color:"#111", resize:"none", outline:"none" }} onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}/>
                <button onClick={handleSendMessage} disabled={sending || !msgText.trim()} style={{ padding:"10px 16px", borderRadius:10, border:"none", background:color, color:"#fff", fontSize:13, fontWeight:700, cursor:sending?"wait":"pointer", fontFamily:"inherit", opacity:sending||!msgText.trim()?0.5:1, alignSelf:"flex-end" }}>
                  {sending ? "..." : "Envoyer"}
                </button>
              </div>
              {msgSent && <div style={{ fontSize:12, color:"#22C55E", fontWeight:600, marginTop:8 }}>✓ Message envoyé</div>}
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign:"center", fontSize:11, color:"#94A3B8", marginTop:16, paddingBottom:24 }}>
            Propulsé par <a href="https://calendar360.fr" style={{ color:color, textDecoration:"none", fontWeight:600 }}>{brand.name}</a>
          </div>
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────
// MANAGE BOOKING (client self-service cancel/reschedule)
// ────────────────────────────────────────────────

export default ClientPortal;
