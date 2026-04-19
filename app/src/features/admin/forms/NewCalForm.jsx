import React, { useState, useEffect } from "react";
import { T } from "../../../theme";
import { COMMON_TIMEZONES } from "../../../shared/utils/constants";
import { isValidEmail } from "../../../shared/utils/validators";
import { displayPhone } from "../../../shared/utils/phone";
import { fmtDate } from "../../../shared/utils/dates";
import { api } from "../../../shared/services/api";
import { I, Btn, Input, ValidatedInput, Badge, Card, Modal } from "../../../shared/ui";
import TemplateEditorPopup from "./TemplateEditorPopup";
import { DEFAULT_TEMPLATES, TEMPLATE_VARS } from "../data/templates";

const NewCalForm = ({ collabs, company, onClose, onCreate }) => {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState(null); // null=unchecked, true/false
  const [description, setDescription] = useState("");
  const [type, setType] = useState("simple");
  const [duration, setDuration] = useState(30);
  const [sel, setSel] = useState([]);
  const [color, setColor] = useState("#2563EB");
  const [location, setLocation] = useState("");
  const [videoAuto, setVideoAuto] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [groupMax, setGroupMax] = useState(1);
  const [reconfirm, setReconfirm] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(true);
  const [confirmSms, setConfirmSms] = useState(false);
  const [confirmWhatsapp, setConfirmWhatsapp] = useState(false);
  const [reminderEmail, setReminderEmail] = useState(true);
  const [reminderSms, setReminderSms] = useState(false);
  const [reminderWhatsapp, setReminderWhatsapp] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [bufferBefore, setBufferBefore] = useState(0);
  const [bufferAfter, setBufferAfter] = useState(0);
  const [minNotice, setMinNotice] = useState(60);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [editTpl, setEditTpl] = useState(null); // {channel:'sms'|'whatsapp', tab:'confirm'|'reminder'}
  const [customConfirmSms, setCustomConfirmSms] = useState('');
  const [customConfirmWhatsapp, setCustomConfirmWhatsapp] = useState('');
  const [customReminderSms, setCustomReminderSms] = useState('');
  const [customReminderWhatsapp, setCustomReminderWhatsapp] = useState('');
  const [customReminders, setCustomReminders] = useState(false);
  const [calReminder24h, setCalReminder24h] = useState(true);
  const [calReminder1h, setCalReminder1h] = useState(true);
  const [calReminder15min, setCalReminder15min] = useState(false);
  const colors = ["#2563EB","#059669","#D97706","#DC2626","#7C3AED","#EC4899","#0891B2"];
  const locations = ["Zoom","Google Meet","Téléphone","En personne"];
  const previewCollab = collabs.find(c => sel.includes(c.id));
  const previewLocIcon = location.toLowerCase().includes("zoom") || location.toLowerCase().includes("meet") ? "globe" : location.toLowerCase().includes("téléphone") ? "phone" : "map";

  // Auto-generate slug from name (if user hasn't manually edited it)
  const toSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const handleNameChange = (v) => {
    setName(v);
    if (!slugEdited) { const s = toSlug(v); setSlug(s); checkSlug(s); }
  };
  const handleSlugChange = (v) => {
    const s = toSlug(v);
    setSlug(s);
    setSlugEdited(true);
    checkSlug(s);
  };
  const checkSlugTimer = useRef(null);
  const checkSlug = (s) => {
    clearTimeout(checkSlugTimer.current);
    if (!s || s.length < 2) { setSlugAvailable(null); return; }
    checkSlugTimer.current = setTimeout(() => {
      api(`/api/calendars/check-slug?companyId=${company.id}&slug=${encodeURIComponent(s)}`).then(r => {
        if (r) setSlugAvailable(r.available);
      });
    }, 400);
  };

  // Mini calendar for preview
  const now = new Date();
  const pMonth = now.getMonth();
  const pYear = now.getFullYear();
  const pFirstDay = (new Date(pYear, pMonth, 1).getDay() + 6) % 7;
  const pDaysInMonth = new Date(pYear, pMonth + 1, 0).getDate();
  const pDays = [];
  for (let i = 0; i < pFirstDay; i++) pDays.push(null);
  for (let d = 1; d <= pDaysInMonth; d++) pDays.push(d);
  const pToday = now.getDate();

  return (
    <Card style={{ marginBottom:20, border:`1px solid ${T.accentBorder}` }}>
      <h3 style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>Nouveau calendrier</h3>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.3fr", gap:20 }}>
        {/* LEFT: Form */}
        <div>
          <ValidatedInput label="Nom" required placeholder="Consultation" value={name} onChange={e=>handleNameChange(e.target.value)} style={{ marginBottom:8 }}/>
          {/* URL slug */}
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:4 }}>URL personnalisée</label>
            <div style={{ display:"flex", alignItems:"center", gap:0, borderRadius:8, border:`1px solid ${slugAvailable===false?T.danger:slugAvailable===true?T.success:T.border}`, overflow:"hidden", transition:"border-color .2s" }}>
              <span style={{ padding:"8px 10px", background:T.bg, fontSize:11, color:T.text3, whiteSpace:"nowrap", borderRight:`1px solid ${T.border}` }}>calendar360.fr/book/{company?.slug}/</span>
              <input value={slug} onChange={e=>handleSlugChange(e.target.value)} placeholder="mon-calendrier" style={{ flex:1, padding:"8px 10px", border:"none", outline:"none", fontSize:12, fontFamily:"monospace", fontWeight:600, color:T.accent, background:"transparent", minWidth:80 }}/>
              {slugAvailable===true && slug.length>=2 && <span style={{ padding:"0 8px", color:T.success, fontSize:11, fontWeight:700, flexShrink:0 }}>✓</span>}
              {slugAvailable===false && <span style={{ padding:"0 8px", color:T.danger, fontSize:10, fontWeight:600, flexShrink:0 }}>Déjà pris</span>}
            </div>
          </div>
          {/* Description */}
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:4 }}>Description <span style={{ fontWeight:400, color:T.text3 }}>(optionnel — visible sur la page publique)</span></label>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Décrivez ce rendez-vous en quelques mots..." rows={2} style={{ width:"100%", padding:"8px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, fontSize:12, fontFamily:"inherit", color:T.text, resize:"vertical", outline:"none" }}/>
          </div>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:6 }}>Type</label>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            {[{k:"simple",l:"Simple",i:"user"},{k:"multi",l:"Multi-collab",i:"users"}].map(t=>(<div key={t.k} onClick={()=>setType(t.k)} style={{ flex:1, padding:10, borderRadius:10, cursor:"pointer", textAlign:"center", border:`1.5px solid ${type===t.k?T.accent:T.border}`, background:type===t.k?T.accentBg:T.surface }}><div style={{ color:type===t.k?T.accent:T.text3, marginBottom:2 }}><I n={t.i} s={16}/></div><div style={{ fontSize:11, fontWeight:600, color:type===t.k?T.accent:T.text2 }}>{t.l}</div></div>))}
          </div>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:6 }}>Durée</label>
          <div style={{ display:"flex", gap:5, marginBottom:12 }}>{[15,30,45,60,90].map(d=>(<div key={d} onClick={()=>setDuration(d)} style={{ flex:1, padding:"8px 0", textAlign:"center", borderRadius:8, cursor:"pointer", border:`1px solid ${duration===d?T.accent:T.border}`, background:duration===d?T.accent:T.surface, color:duration===d?"#fff":T.text2, fontSize:11, fontWeight:600 }}>{d}m</div>))}</div>
          <label style={{ display:"flex", alignItems:"center", fontSize:12, fontWeight:600, color:T.text2, marginBottom:6 }}>Temps tampon (buffer)<HelpTip text="Temps de pause bloqué avant et/ou après chaque rendez-vous. Utile pour se préparer ou faire une transition entre deux clients."/></label>
          <div style={{ display:"flex", gap:8, marginBottom:4 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:T.text3, marginBottom:3 }}>Avant (min)</div>
              <select value={bufferBefore} onChange={e=>setBufferBefore(parseInt(e.target.value))} style={{ width:"100%", padding:"7px 8px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, fontSize:12, fontFamily:"inherit", color:T.text }}>{[0,5,10,15,20,30,45,60].map(v=><option key={v} value={v}>{v}min</option>)}</select>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:T.text3, marginBottom:3 }}>Après (min)</div>
              <select value={bufferAfter} onChange={e=>setBufferAfter(parseInt(e.target.value))} style={{ width:"100%", padding:"7px 8px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, fontSize:12, fontFamily:"inherit", color:T.text }}>{[0,5,10,15,20,30,45,60].map(v=><option key={v} value={v}>{v}min</option>)}</select>
            </div>
          </div>
          {(bufferBefore > 0 || bufferAfter > 0) && <div style={{ fontSize:10, color:T.accent, marginBottom:8 }}>Créneau bloqué : {bufferBefore>0?`${bufferBefore}min + `:""}RDV {duration}min{bufferAfter>0?` + ${bufferAfter}min`:""} = {bufferBefore+duration+bufferAfter}min total</div>}
          {bufferBefore===0 && bufferAfter===0 && <div style={{ height:8 }}/>}
          <label style={{ display:"flex", alignItems:"center", fontSize:12, fontWeight:600, color:T.text2, marginBottom:6 }}>Préavis minimum<HelpTip text="Délai minimum avant un rendez-vous. Ex: 2h signifie qu'un client ne peut pas réserver un créneau dans moins de 2 heures."/></label>
          <select value={minNotice} onChange={e=>setMinNotice(parseInt(e.target.value))} style={{ width:"100%", padding:"7px 8px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, fontSize:12, fontFamily:"inherit", color:T.text, marginBottom:4 }}>
            <option value={0}>Pas de préavis</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 heure</option>
            <option value={120}>2 heures</option>
            <option value={240}>4 heures</option>
            <option value={480}>8 heures</option>
            <option value={1440}>24 heures (1 jour)</option>
            <option value={2880}>48 heures (2 jours)</option>
            <option value={4320}>3 jours</option>
            <option value={10080}>7 jours</option>
          </select>
          <div style={{ fontSize:10, color:T.text3, marginBottom:12 }}>Délai minimum avant qu'un créneau soit réservable</div>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:6 }}>Lieu</label>
          <div style={{ display:"flex", gap:5, marginBottom:8, flexWrap:"wrap" }}>
            {locations.map(l => (<div key={l} onClick={() => setLocation(l)} style={{ padding:"6px 12px", borderRadius:8, cursor:"pointer", fontSize:11, fontWeight:600, border:`1px solid ${location===l?color:T.border}`, background:location===l?color+"10":T.surface, color:location===l?color:T.text2 }}>{l}</div>))}
          </div>
          {window.google?.maps?.places
            ? <PlacesAutocomplete placeholder="Rechercher une adresse..." value={locations.includes(location)?"":location} onChange={v=>setLocation(v)} style={{ marginBottom:12 }}/>
            : <Input placeholder="Ou saisir un lieu..." value={locations.includes(location)?"":location} onChange={e=>setLocation(e.target.value)} style={{ marginBottom:12 }}/>
          }
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:6 }}>Couleur</label>
          <div style={{ display:"flex", gap:6, marginBottom:12 }}>{colors.map(c=>(<div key={c} onClick={()=>setColor(c)} style={{ width:26, height:26, borderRadius:8, background:c, cursor:"pointer", border:color===c?"2.5px solid "+T.text:"2.5px solid transparent" }}/>))}</div>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:6 }}>Collaborateurs</label>
          <div style={{ maxHeight:160, overflowY:"auto" }}>
            {collabs.map(c=>{const s=sel.includes(c.id);return(<div key={c.id} onClick={()=>{if(type==="simple")setSel([c.id]);else setSel(p=>s?p.filter(x=>x!==c.id):[...p,c.id]);}} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:8, marginBottom:4, border:`1px solid ${s?T.accentBorder:T.border}`, background:s?T.accentBg:T.surface, cursor:"pointer" }}><Avatar name={c.name} color={c.color} size={24}/><span style={{ flex:1, fontSize:12 }}>{c.name}</span>{s&&<span style={{ color:T.accent }}><I n="check" s={14}/></span>}</div>);})}
          </div>
          {/* Options avancées — Accordéon */}
          <div style={{ marginTop:12, marginBottom:8, borderRadius:10, border:`1px solid ${T.border}`, overflow:'hidden' }}>
            <div onClick={()=>setAdvancedOpen(!advancedOpen)} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', cursor:'pointer', background:T.surface }}>
              <span style={{ fontSize:14 }}>⚙</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.text }}>Options avancées</div>
                <div style={{ fontSize:10, color:T.text3 }}>{[videoAuto&&'Visio auto',requireApproval&&'Approbation',groupMax>1&&`Groupe (${groupMax})`,reconfirm&&'Reconfirm'].filter(Boolean).join(', ')||'Aucune'}</div>
              </div>
              <I n={advancedOpen?'chevron-up':'chevron-down'} s={14} style={{ color:T.text3 }}/>
            </div>
            {advancedOpen && (
              <div style={{ padding:12, borderTop:`1px solid ${T.border}`, display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div><div style={{ fontSize:12, fontWeight:600, color:T.text }}>Visio automatique</div><div style={{ fontSize:10, color:T.text3 }}>Crée un lien Google Meet automatiquement</div></div>
                  <Toggle value={videoAuto} onChange={setVideoAuto}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div><div style={{ fontSize:12, fontWeight:600, color:T.text }}>Approbation requise</div><div style={{ fontSize:10, color:T.text3 }}>Le RDV reste "en attente" jusqu'à validation</div></div>
                  <Toggle value={requireApproval} onChange={setRequireApproval}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div><div style={{ fontSize:12, fontWeight:600, color:T.text }}>Reconfirmation</div><div style={{ fontSize:10, color:T.text3 }}>Demande au client de reconfirmer 24h avant</div></div>
                  <Toggle value={reconfirm} onChange={setReconfirm}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div><div style={{ fontSize:12, fontWeight:600, color:T.text }}>Rendez-vous de groupe</div><div style={{ fontSize:10, color:T.text3 }}>Plusieurs participants sur un même créneau</div></div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <select value={groupMax} onChange={e=>setGroupMax(parseInt(e.target.value))} style={{ padding:'5px 8px', borderRadius:6, border:`1px solid ${T.border}`, fontSize:12, background:T.surface, color:T.text, fontFamily:'inherit' }}>
                      {[1,2,3,4,5,6,8,10,15,20,30,50].map(n=><option key={n} value={n}>{n===1?'Désactivé':n+' max'}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:10, marginTop:16, justifyContent:"flex-end" }}>
            <Btn onClick={onClose}>Annuler</Btn>
            <Btn primary disabled={!name||sel.length===0||slugAvailable===false||!slug} onClick={()=>onCreate({name,type,duration,bufferBefore,bufferAfter,minNotice,collaborators:sel,color,location,description,videoAuto,requireApproval,groupMax,reconfirm,confirmEmail,confirmSms,confirmWhatsapp,reminderEmail,reminderSms,reminderWhatsapp,whatsappNumber:whatsappNumber||null,customConfirmSms:customConfirmSms||null,customConfirmWhatsapp:customConfirmWhatsapp||null,customReminderSms:customReminderSms||null,customReminderWhatsapp:customReminderWhatsapp||null,slug:slug||toSlug(name),customReminders,calReminder24h,calReminder1h,calReminder15min})}><I n="check" s={14}/> Créer</Btn>
          </div>
        </div>

        {/* RIGHT: Live Preview + Notifications */}
        <div>
          {/* Preview */}
          <div style={{ background:T.bg, borderRadius:14, border:`1px solid ${T.border}`, overflow:"hidden", marginBottom:16 }}>
            <div style={{ padding:"8px 12px", background:T.surface, borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:4, fontSize:10, color:T.text3 }}>
              <div style={{ width:8, height:8, borderRadius:4, background:"#EF4444" }}/>
              <div style={{ width:8, height:8, borderRadius:4, background:"#F59E0B" }}/>
              <div style={{ width:8, height:8, borderRadius:4, background:"#22C55E" }}/>
              <span style={{ marginLeft:8, fontSize:10, color:T.text3 }}>Aperçu en temps réel</span>
            </div>
            <div style={{ padding:16 }}>
              <div style={{ background:T.surface, borderRadius:12, border:`1px solid ${T.border}`, overflow:"hidden" }}>
                <div style={{ padding:"10px 14px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:24, height:24, borderRadius:6, background:color+"14", display:"flex", alignItems:"center", justifyContent:"center", color:color, fontWeight:800, fontSize:10 }}>{company?.name?.[0]||"P"}</div>
                  <span style={{ fontSize:11, fontWeight:700 }}>{company?.name||"Mon entreprise"}</span>
                </div>
                <div style={{ display:"flex", minHeight:200 }}>
                  <div style={{ width:140, padding:"14px 12px", borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", gap:8 }}>
                    {previewCollab && (
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <Avatar name={previewCollab.name} color={previewCollab.color} size={24}/>
                        <span style={{ fontSize:10, fontWeight:600 }}>{previewCollab.name}</span>
                      </div>
                    )}
                    <div style={{ fontSize:13, fontWeight:800, color:T.text, lineHeight:1.2 }}>{name || "Nom du calendrier"}</div>
                    {description && <div style={{ fontSize:9, color:T.text3, marginTop:2, lineHeight:1.3 }}>{description.slice(0,60)}{description.length>60?"...":""}</div>}
                    <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:T.text2 }}><I n="clock" s={11}/> {duration} min</div>
                    {location && <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:T.text2 }}><I n={previewLocIcon} s={11}/> {location}</div>}
                  </div>
                  <div style={{ flex:1, padding:"10px 12px" }}>
                    <div style={{ fontSize:10, fontWeight:700, color:T.text, marginBottom:8, textAlign:"center" }}>{MONTHS_FR[pMonth]} {pYear}</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1, marginBottom:4 }}>
                      {["L","M","M","J","V","S","D"].map((d,i) => <div key={i} style={{ textAlign:"center", fontSize:8, fontWeight:600, color:T.text3, padding:2 }}>{d}</div>)}
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1 }}>
                      {pDays.map((day, idx) => {
                        if (!day) return <div key={`e${idx}`}/>;
                        const dow = (pFirstDay + day - 1) % 7;
                        const isWe = dow >= 5;
                        const isPast = day < pToday;
                        const isToday = day === pToday;
                        return <div key={idx} style={{ width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:10, fontSize:8, fontWeight:isToday?700:400, margin:"0 auto", background:isToday?color:"transparent", color:isToday?"#fff":(isWe||isPast)?T.text3+"66":T.text }}>{day}</div>;
                      })}
                    </div>
                  </div>
                  <div style={{ width:80, borderLeft:`1px solid ${T.border}`, padding:"10px 8px" }}>
                    <div style={{ fontSize:9, fontWeight:700, color:T.text, marginBottom:8 }}>Créneaux</div>
                    {["09:00","09:30","10:00","14:00","14:30"].map(t => <div key={t} style={{ padding:"4px 0", textAlign:"center", borderRadius:4, border:`1px solid ${color}44`, marginBottom:3, fontSize:9, fontWeight:600, color:color }}>{t}</div>)}
                  </div>
                </div>
                <div style={{ padding:"8px 14px", borderTop:`1px solid ${T.border}`, background:T.bg }}>
                  <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:9, color:T.text3 }}>
                    <I n="link" s={9}/> <span style={{ fontFamily:"monospace" }}>calendar360.fr/book/{company?.slug||"mon-entreprise"}/{slug || "..."}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notifications & Relances — below preview */}
          <div style={{ borderRadius:14, border:`1px solid ${T.border}`, overflow:'hidden' }}>
            {/* Header */}
            <div style={{ padding:'12px 16px', background:T.surface, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:'#FEF3C7', display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ fontSize:16 }}>🔔</span></div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:T.text }}>Notifications & Relances</div>
                <div style={{ fontSize:11, color:T.text3 }}>Confirmations, rappels, canaux et messages personnalisés</div>
              </div>
            </div>

            <div style={{ padding:16 }}>
              {/* Personnaliser les relances — main toggle */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderRadius:10, background:customReminders?'linear-gradient(135deg,#EEF2FF,#E0E7FF)':T.surface, border:`1.5px solid ${customReminders?'#818CF8':T.border}`, marginBottom:16, cursor:'pointer', transition:'all .2s' }} onClick={()=>setCustomReminders(!customReminders)}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:customReminders?'#818CF8':T.border, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s' }}>
                    <I n="settings" s={14} style={{ color:'#fff' }}/>
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:customReminders?'#4338CA':T.text }}>Personnaliser les relances</div>
                    <div style={{ fontSize:10, color:T.text3 }}>{customReminders?'Configuration spécifique à ce calendrier':'Utilise les paramètres globaux de l\'admin'}</div>
                  </div>
                </div>
                <div style={{ width:42, height:24, borderRadius:12, background:customReminders?'#22C55E':T.border, position:'relative', transition:'background .2s', flexShrink:0 }}>
                  <div style={{ width:20, height:20, borderRadius:10, background:'#fff', position:'absolute', top:2, left:customReminders?20:2, transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                </div>
              </div>

              {customReminders && (
                <>
                  {/* Timing des rappels */}
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ width:22, height:22, borderRadius:6, background:'#FEF3C7', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>⏰</span>
                      Timing des rappels
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      {[
                        {label:'24h avant',val:calReminder24h,set:setCalReminder24h,icon:'24'},
                        {label:'1h avant',val:calReminder1h,set:setCalReminder1h,icon:'1h'},
                        {label:'15min avant',val:calReminder15min,set:setCalReminder15min,icon:'15'},
                      ].map(r=>(
                        <div key={r.label} onClick={()=>r.set(!r.val)} style={{ flex:1, padding:'10px 8px', borderRadius:10, textAlign:'center', cursor:'pointer', border:`1.5px solid ${r.val?T.accent:T.border}`, background:r.val?T.accentBg:T.surface, transition:'all .15s' }}>
                          <div style={{ fontSize:16, fontWeight:800, color:r.val?T.accent:T.text3, marginBottom:2 }}>{r.icon}</div>
                          <div style={{ fontSize:10, fontWeight:600, color:r.val?T.accent:T.text2 }}>{r.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Deux colonnes: Confirmation + Rappels */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                    {/* Confirmation de RDV */}
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ width:22, height:22, borderRadius:6, background:'#DCFCE7', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>✅</span>
                        Confirmation
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {[
                          {label:"Email",icon:"mail",desc:"Email de confirmation",val:confirmEmail,set:setConfirmEmail,channel:null},
                          {label:"SMS",icon:"smartphone",desc:"Numéros FR (+33)",val:confirmSms,set:setConfirmSms,channel:'sms'},
                          {label:"WhatsApp",icon:"message-circle",desc:"International",val:confirmWhatsapp,set:setConfirmWhatsapp,channel:'whatsapp'},
                        ].map(n=>(
                          <div key={n.label} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, border:`1px solid ${n.val?T.accentBorder:T.border}`, background:n.val?T.accentBg:T.surface }}>
                            <div onClick={()=>n.set(!n.val)} style={{ display:'flex', alignItems:'center', gap:8, flex:1, cursor:'pointer' }}>
                              <I n={n.icon} s={14} style={{ color:n.val?T.accent:T.text3 }}/>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:12, fontWeight:600, color:n.val?T.accent:T.text }}>{n.label}</div>
                                <div style={{ fontSize:10, color:T.text3 }}>{n.desc}</div>
                              </div>
                              <div style={{ width:34, height:18, borderRadius:9, background:n.val?T.accent:T.border, position:'relative', transition:'background .2s' }}>
                                <div style={{ width:14, height:14, borderRadius:7, background:'#fff', position:'absolute', top:2, left:n.val?18:2, transition:'left .2s', boxShadow:'0 1px 2px rgba(0,0,0,0.15)' }}/>
                              </div>
                            </div>
                            {n.val && n.channel && (
                              <span onClick={(e)=>{e.stopPropagation();setEditTpl({channel:n.channel,tab:'confirm'});}} style={{ cursor:'pointer', padding:'4px 6px', borderRadius:6, color:T.accent, background:T.accentBg, fontSize:10, fontWeight:600, display:'flex', alignItems:'center', gap:3 }} title="Personnaliser le message"><I n="edit-2" s={11}/></span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Rappels */}
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ width:22, height:22, borderRadius:6, background:'#DBEAFE', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>🔔</span>
                        Rappels
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {[
                          {label:"Email",icon:"mail",desc:"Email de rappel",val:reminderEmail,set:setReminderEmail,channel:null},
                          {label:"SMS",icon:"smartphone",desc:"Numéros FR (+33)",val:reminderSms,set:setReminderSms,channel:'sms'},
                          {label:"WhatsApp",icon:"message-circle",desc:"International",val:reminderWhatsapp,set:setReminderWhatsapp,channel:'whatsapp'},
                        ].map(n=>(
                          <div key={n.label} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, border:`1px solid ${n.val?T.accentBorder:T.border}`, background:n.val?T.accentBg:T.surface }}>
                            <div onClick={()=>n.set(!n.val)} style={{ display:'flex', alignItems:'center', gap:8, flex:1, cursor:'pointer' }}>
                              <I n={n.icon} s={14} style={{ color:n.val?T.accent:T.text3 }}/>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:12, fontWeight:600, color:n.val?T.accent:T.text }}>{n.label}</div>
                                <div style={{ fontSize:10, color:T.text3 }}>{n.desc}</div>
                              </div>
                              <div style={{ width:34, height:18, borderRadius:9, background:n.val?T.accent:T.border, position:'relative', transition:'background .2s' }}>
                                <div style={{ width:14, height:14, borderRadius:7, background:'#fff', position:'absolute', top:2, left:n.val?18:2, transition:'left .2s', boxShadow:'0 1px 2px rgba(0,0,0,0.15)' }}/>
                              </div>
                            </div>
                            {n.val && n.channel && (
                              <span onClick={(e)=>{e.stopPropagation();setEditTpl({channel:n.channel,tab:'reminder'});}} style={{ cursor:'pointer', padding:'4px 6px', borderRadius:6, color:T.accent, background:T.accentBg, fontSize:10, fontWeight:600, display:'flex', alignItems:'center', gap:3 }} title="Personnaliser le message"><I n="edit-2" s={11}/></span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* WhatsApp number */}
                  {(confirmWhatsapp || reminderWhatsapp) && (
                    <div style={{ marginBottom:12 }}>
                      <label style={{ fontSize:11, fontWeight:600, color:T.text2, marginBottom:4, display:'block' }}>N° WhatsApp expéditeur</label>
                      <input value={whatsappNumber} onChange={e=>setWhatsappNumber(e.target.value)} placeholder="+33 6 12 34 56 78" style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, fontSize:12, color:T.text, outline:'none', boxSizing:'border-box' }}/>
                    </div>
                  )}

                  {/* Custom message templates summary */}
                  <div style={{ padding:'10px 12px', borderRadius:8, background:T.bg, border:`1px dashed ${T.border}` }}>
                    <div style={{ fontSize:11, fontWeight:600, color:T.text2, marginBottom:4, display:'flex', alignItems:'center', gap:4 }}><I n="edit-2" s={12}/> Messages personnalisés</div>
                    <div style={{ fontSize:10, color:T.text3, lineHeight:1.5 }}>
                      {(customConfirmSms || customReminderSms) ? <div style={{ marginBottom:2 }}>SMS: <span style={{ color:T.accent, fontWeight:600 }}>{customConfirmSms ? 'Confirmation' : ''}{customConfirmSms && customReminderSms ? ' + ' : ''}{customReminderSms ? 'Rappel' : ''} personnalisé(s)</span></div> : null}
                      {(customConfirmWhatsapp || customReminderWhatsapp) ? <div>WhatsApp: <span style={{ color:'#22C55E', fontWeight:600 }}>{customConfirmWhatsapp ? 'Confirmation' : ''}{customConfirmWhatsapp && customReminderWhatsapp ? ' + ' : ''}{customReminderWhatsapp ? 'Rappel' : ''} personnalisé(s)</span></div> : null}
                      {!customConfirmSms && !customReminderSms && !customConfirmWhatsapp && !customReminderWhatsapp && <span>Cliquez sur <I n="edit-2" s={10} style={{ display:'inline', verticalAlign:'middle' }}/> à côté d'un canal pour personnaliser les messages</span>}
                    </div>
                  </div>
                </>
              )}

              {!customReminders && (
                <div style={{ padding:'14px 16px', borderRadius:10, background:T.bg, border:`1px dashed ${T.border}`, textAlign:'center' }}>
                  <div style={{ fontSize:12, color:T.text3, lineHeight:1.6 }}>
                    <I n="info" s={14} style={{ verticalAlign:'middle', marginRight:4 }}/>
                    Les paramètres de notifications globaux de l'admin seront utilisés.
                    <br/><span style={{ fontSize:11 }}>Activez <strong>"Personnaliser les relances"</strong> pour configurer ce calendrier individuellement.</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {editTpl && (
            <TemplateEditorPopup
              channel={editTpl.channel}
              initialTab={editTpl.tab}
              confirmText={editTpl.channel==='sms'?customConfirmSms:customConfirmWhatsapp}
              reminderText={editTpl.channel==='sms'?customReminderSms:customReminderWhatsapp}
              onSave={(ct,rt)=>{
                if(editTpl.channel==='sms'){setCustomConfirmSms(ct);setCustomReminderSms(rt);}
                else{setCustomConfirmWhatsapp(ct);setCustomReminderWhatsapp(rt);}
              }}
              onClose={()=>setEditTpl(null)}
            />
          )}
        </div>
      </div>
    </Card>
  );
};

export default NewCalForm;
