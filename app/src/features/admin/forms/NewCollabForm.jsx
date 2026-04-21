import React, { useState, useEffect } from "react";
import { T } from "../../../theme";
import { COMMON_TIMEZONES } from "../../../shared/utils/constants";
import { isValidEmail } from "../../../shared/utils/validators";
import { I, Btn, Input, ValidatedInput, Stars } from "../../../shared/ui";
import { api } from "../../../shared/services/api";

const NewCollabForm = ({ onClose, onCreate, companyId }) => {
  // Pipeline Templates — assignation optionnelle à la création
  const [pipelineMode, setPipelineMode] = useState("free");
  const [pipelineTemplateId, setPipelineTemplateId] = useState("");
  const [pipelineTemplatesList, setPipelineTemplatesList] = useState([]);
  const [loadingTpls, setLoadingTpls] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoadingTpls(true);
    api(`/api/admin/pipeline-templates?companyId=${encodeURIComponent(companyId)}`)
      .then((r) => {
        if (Array.isArray(r)) {
          setPipelineTemplatesList(r.filter((t) => t.isPublished && !t.isArchived));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTpls(false));
  }, [companyId]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("member");
  const [priority, setPriority] = useState(3);
  const colors = ["#2563EB","#059669","#D97706","#DC2626","#7C3AED","#EC4899"];
  const [color, setColor] = useState(colors[Math.floor(Math.random()*colors.length)]);
  const [timezone, setTimezone] = useState("");
  const [chatEnabled, setChatEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [secureIaPhone, setSecureIaPhone] = useState(false);
  const [secureIaWords, setSecureIaWords] = useState([]);
  const [secureIaWordInput, setSecureIaWordInput] = useState("");
  const [aiCopilotEnabled, setAiCopilotEnabled] = useState(false);
  const [aiCopilotRole, setAiCopilotRole] = useState("");
  const [aiCopilotObjective, setAiCopilotObjective] = useState("");
  const [aiCopilotTarget, setAiCopilotTarget] = useState("");
  const [aiCopilotLevel, setAiCopilotLevel] = useState("normal");
  const [aiRoleType, setAiRoleType] = useState("");
  const [aiServiceType, setAiServiceType] = useState("");
  const [aiMainMission, setAiMainMission] = useState("");
  const [aiCallTypeDefault, setAiCallTypeDefault] = useState("");
  const [aiCallGoalDefault, setAiCallGoalDefault] = useState("");
  const [aiTargetDefault, setAiTargetDefault] = useState("");
  const [aiLanguage, setAiLanguage] = useState("fr");
  const [aiToneStyle, setAiToneStyle] = useState("commercial");
  const [aiScriptTrame, setAiScriptTrame] = useState("");
  const copilotRoles = ["Commercial","Conseiller","Support","Qualification","Closing","Account Manager","SAV","Technique"];
  const AI_ROLE_TYPES = [{id:"commercial",label:"Commercial"},{id:"support",label:"Support"},{id:"sav",label:"SAV"},{id:"admin",label:"Admin"},{id:"manager",label:"Manager"},{id:"assistant",label:"Assistant"},{id:"comptable",label:"Comptable"},{id:"technicien",label:"Technicien"}];
  const AI_SERVICE_TYPES = [{id:"sales",label:"Ventes"},{id:"support",label:"Support"},{id:"sav",label:"SAV"},{id:"billing",label:"Facturation"},{id:"customer_success",label:"Customer Success"},{id:"marketing",label:"Marketing"},{id:"call_center",label:"Call Center"}];
  const AI_CALL_TYPES = [{id:"sales",label:"Vente"},{id:"qualification",label:"Qualification"},{id:"support",label:"Support"},{id:"sav",label:"SAV"},{id:"follow_up",label:"Suivi"},{id:"closing",label:"Closing"},{id:"onboarding",label:"Onboarding"},{id:"information",label:"Information"}];
  const AI_CALL_GOALS = [{id:"sell_product",label:"Vendre produit"},{id:"sell_service",label:"Vendre service"},{id:"sell_training",label:"Vendre formation"},{id:"book_meeting",label:"Prendre RDV"},{id:"qualify_lead",label:"Qualifier lead"},{id:"help_client",label:"Aider client"},{id:"solve_problem",label:"Résoudre problème"},{id:"send_quote",label:"Envoyer devis"},{id:"follow_up",label:"Relancer"},{id:"support",label:"Support technique"}];
  const AI_TARGETS = [{id:"prospect",label:"Prospect"},{id:"client",label:"Client"},{id:"pro",label:"Pro"},{id:"particulier",label:"Particulier"},{id:"entreprise",label:"Entreprise"},{id:"premium",label:"Premium"},{id:"partner",label:"Partenaire"}];
  const AI_TONES = [{id:"commercial",label:"Commercial"},{id:"neutre",label:"Neutre"},{id:"formel",label:"Formel"},{id:"amical",label:"Amical"},{id:"premium",label:"Premium"},{id:"technique",label:"Technique"},{id:"persuasif",label:"Persuasif"}];
  const AI_LEVELS = [{id:"off",label:"Désactivé",desc:"Aucune assistance IA",c:"#94A3B8"},{id:"on",label:"Activé",desc:"Coach IA pendant et après chaque appel",c:"#2563EB"},{id:"pro",label:"Automatique",desc:"Coach IA + envoi auto emails, SMS, tâches",c:"#7C3AED"}];
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <ValidatedInput label="Nom complet" required placeholder="Marie Dupont" value={name} onChange={e=>setName(e.target.value)}/>
        <ValidatedInput label="Email" required placeholder="marie@company.fr" icon="mail" value={email} onChange={e=>setEmail(e.target.value)} validate={isValidEmail} errorMsg="Format email invalide"/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12 }}>
        <Input label="Téléphone" placeholder="+33 6 12 34 56 78" icon="phone" value={phone} onChange={e=>setPhone(e.target.value)}/>
        <div style={{ flex:"1 1 180px" }}><label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:5 }}>Fuseau horaire</label><select value={timezone} onChange={e=>setTimezone(e.target.value)} style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12 }}><option value="">Par défaut (entreprise)</option>{COMMON_TIMEZONES.filter(Boolean).map(tz=><option key={tz} value={tz}>{tz.replace(/_/g," ")}</option>)}</select></div>
      </div>
      <div style={{ display:"flex", gap:16, marginTop:14, alignItems:"flex-end", flexWrap:"wrap" }}>
        <div><label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:5 }}>Rôle</label><div style={{ display:"flex", gap:6 }}>{["member","admin"].map(r=>(<div key={r} onClick={()=>setRole(r)} style={{ padding:"8px 16px", borderRadius:8, cursor:"pointer", border:`1px solid ${role===r?T.accent:T.border}`, background:role===r?T.accentBg:T.surface, color:role===r?T.accent:T.text2, fontSize:12, fontWeight:600 }}>{r==="admin"?"Admin":"Membre"}</div>))}</div></div>
        <div><label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:5 }}>Priorité</label><Stars count={priority} onChange={setPriority} size={18}/></div>
        <div><label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:5 }}>Couleur</label><div style={{ display:"flex", gap:4 }}>{colors.map(c=><div key={c} onClick={()=>setColor(c)} style={{ width:24, height:24, borderRadius:6, background:c, cursor:"pointer", border:color===c?"2px solid "+T.text:"2px solid transparent" }}/>)}</div></div>
      </div>
      {/* Pipeline Équipe — assignation optionnelle */}
      <div style={{ marginTop:14, padding:"12px 14px", borderRadius:10, background:T.bg, border:`1px solid ${T.border}` }}>
        <div style={{ fontSize:12, fontWeight:600, color:T.text2, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
          <I n="layout" s={14}/> Pipeline Équipe
        </div>
        <div style={{ display:"flex", gap:6, marginBottom: pipelineMode==="template" ? 10 : 0 }}>
          {[
            { key:"free", label:"Mode libre", desc:"Le collaborateur configure lui-même son pipeline" },
            { key:"template", label:"Template imposé", desc:"Structure définie par un template publié" },
          ].map(o => (
            <div
              key={o.key}
              onClick={() => { setPipelineMode(o.key); if (o.key !== "template") setPipelineTemplateId(""); }}
              style={{
                flex:1, padding:"8px 12px", borderRadius:8, cursor:"pointer",
                border:`1px solid ${pipelineMode===o.key?T.accent:T.border}`,
                background:pipelineMode===o.key?T.accentBg:T.surface,
                color:pipelineMode===o.key?T.accent:T.text2,
                fontSize:12, fontWeight:600, textAlign:"center",
                transition:"all .15s",
              }}
              title={o.desc}
            >
              {o.label}
            </div>
          ))}
        </div>
        {pipelineMode === "template" && (
          <div>
            <select
              value={pipelineTemplateId}
              onChange={(e) => setPipelineTemplateId(e.target.value)}
              style={{
                width:"100%", padding:"8px 10px", borderRadius:8,
                border:`1px solid ${pipelineTemplateId ? T.border : T.accent + "80"}`,
                background:T.surface, color:T.text, fontSize:12,
              }}
            >
              <option value="">— Sélectionner un template publié —</option>
              {pipelineTemplatesList.map((t) => (
                <option key={t.id} value={t.id}>{t.name} (v{t.latestVersion || 1})</option>
              ))}
            </select>
            {loadingTpls && (
              <div style={{ fontSize:11, color:T.text3, marginTop:5 }}>Chargement des templates…</div>
            )}
            {!loadingTpls && pipelineTemplatesList.length === 0 && (
              <div style={{ fontSize:11, color:T.text3, marginTop:5, fontStyle:"italic" }}>
                Aucun template publié. Créez-en un depuis l'onglet "Templates Pipeline Live".
              </div>
            )}
            {!loadingTpls && pipelineTemplatesList.length > 0 && !pipelineTemplateId && (
              <div style={{ fontSize:11, color:T.danger, marginTop:5 }}>
                Sélectionnez un template pour continuer.
              </div>
            )}
          </div>
        )}
      </div>
      {/* Chat permission toggle */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:14, padding:"10px 14px", borderRadius:10, background:chatEnabled?T.accentBg:T.bg, border:`1px solid ${chatEnabled?T.accentBorder:T.border}`, cursor:"pointer", transition:"all .15s" }} onClick={()=>setChatEnabled(!chatEnabled)}>
        <div style={{ width:38, height:22, borderRadius:11, background:chatEnabled?"#22C55E":T.border, position:"relative", transition:"background .2s", flexShrink:0 }}>
          <div style={{ width:18, height:18, borderRadius:9, background:"#fff", position:"absolute", top:2, left:chatEnabled?18:2, transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
        </div>
        <I n="message-circle" s={16} style={{ color:chatEnabled?T.accent:T.text3 }}/>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:chatEnabled?T.accent:T.text2 }}>Chat d'équipe</div>
          <div style={{ fontSize:11, color:T.text3 }}>{chatEnabled?"Ce collaborateur pourra envoyer et recevoir des messages":"Accès au chat désactivé pour ce collaborateur"}</div>
        </div>
      </div>
      {/* SMS permission toggle */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:8, padding:"10px 14px", borderRadius:10, background:smsEnabled?"#DBEAFE":T.bg, border:`1px solid ${smsEnabled?"#93C5FD":T.border}`, cursor:"pointer", transition:"all .15s" }} onClick={()=>setSmsEnabled(!smsEnabled)}>
        <div style={{ width:38, height:22, borderRadius:11, background:smsEnabled?"#22C55E":T.border, position:"relative", transition:"background .2s", flexShrink:0 }}>
          <div style={{ width:18, height:18, borderRadius:9, background:"#fff", position:"absolute", top:2, left:smsEnabled?18:2, transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
        </div>
        <I n="smartphone" s={16} style={{ color:smsEnabled?"#2563EB":T.text3 }}/>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:smsEnabled?"#2563EB":T.text2 }}>Téléphone & SMS</div>
          <div style={{ fontSize:11, color:T.text3 }}>{smsEnabled?"Le collaborateur aura accès au téléphone et SMS dans son espace":"Téléphone et SMS désactivés pour ce collaborateur"}</div>
        </div>
      </div>
      {!!smsEnabled && (<>
      {/* SECURE IA PHONE toggle — visible only if phone enabled */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:8, padding:"10px 14px", borderRadius:10, background:secureIaPhone?"linear-gradient(135deg,#7C3AED08,#DC262608)":T.bg, border:`1px solid ${secureIaPhone?"#DC2626":"#E5E7EB"}`, cursor:"pointer", transition:"all .15s" }} onClick={()=>setSecureIaPhone(!secureIaPhone)}>
        <div style={{ width:38, height:22, borderRadius:11, background:secureIaPhone?"#DC2626":T.border, position:"relative", transition:"background .2s", flexShrink:0 }}>
          <div style={{ width:18, height:18, borderRadius:9, background:"#fff", position:"absolute", top:2, left:secureIaPhone?18:2, transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
        </div>
        <I n="shield" s={16} style={{ color:secureIaPhone?"#DC2626":T.text3 }}/>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:700, color:secureIaPhone?"#DC2626":T.text2 }}>SECURE IA PHONE</div>
          <div style={{ fontSize:11, color:T.text3 }}>{secureIaPhone?"IA activée — détection de mots interdits sur les appels":"Activer la surveillance IA des appels téléphoniques"}</div>
        </div>
      </div>
      {secureIaPhone && (
        <div style={{ marginTop:6, padding:"12px 14px", borderRadius:10, background:T.bg, border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:12, fontWeight:600, color:T.text2, marginBottom:8 }}>Mots / phrases interdits :</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>
            {secureIaWords.map((w,i)=>(
              <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:6, background:"#DC262612", color:"#DC2626", fontSize:11, fontWeight:600 }}>
                {w}
                <span style={{ cursor:"pointer", fontWeight:800, fontSize:13, lineHeight:1 }} onClick={e=>{e.stopPropagation();setSecureIaWords(secureIaWords.filter((_,j)=>j!==i))}}>×</span>
              </span>
            ))}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <input value={secureIaWordInput} onChange={e=>setSecureIaWordInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&secureIaWordInput.trim()){e.preventDefault();setSecureIaWords([...secureIaWords,secureIaWordInput.trim()]);setSecureIaWordInput("");}}} placeholder="Tapez un mot ou phrase + Entrée" style={{ flex:1, padding:"7px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12 }}/>
            <Btn onClick={()=>{if(secureIaWordInput.trim()){setSecureIaWords([...secureIaWords,secureIaWordInput.trim()]);setSecureIaWordInput("");}}}>+</Btn>
          </div>
          <div style={{ fontSize:10, color:T.text3, marginTop:6 }}>Ex: "gratuit", "remboursement", "concurrent"</div>
        </div>
      )}
      {/* AI SALES COPILOT toggle */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:8, padding:"10px 14px", borderRadius:10, background:aiCopilotEnabled?"linear-gradient(135deg,#2563EB08,#7C3AED08)":T.bg, border:`1px solid ${aiCopilotEnabled?"#7C3AED":T.border}`, cursor:"pointer", transition:"all .15s" }} onClick={()=>setAiCopilotEnabled(!aiCopilotEnabled)}>
        <div style={{ width:38, height:22, borderRadius:11, background:aiCopilotEnabled?"#7C3AED":T.border, position:"relative", transition:"background .2s", flexShrink:0 }}>
          <div style={{ width:18, height:18, borderRadius:9, background:"#fff", position:"absolute", top:2, left:aiCopilotEnabled?18:2, transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
        </div>
        <I n="cpu" s={16} style={{ color:aiCopilotEnabled?"#7C3AED":T.text3 }}/>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:700, color:aiCopilotEnabled?"#7C3AED":T.text2 }}>AI SALES COPILOT</div>
          <div style={{ fontSize:11, color:T.text3 }}>{aiCopilotEnabled?"Assistant IA commercial activé — analyse, coaching, scripts":"Activer l'assistant IA pour les appels commerciaux"}</div>
        </div>
      </div>
      {aiCopilotEnabled && (
        <div style={{ marginTop:6, padding:"16px", borderRadius:12, background:"linear-gradient(135deg,#7C3AED06,#2563EB06)", border:"1px solid #7C3AED20" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#7C3AED", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}><I n="cpu" s={14}/> Profil AI Copilot</div>

          {/* Info */}
          <div style={{padding:'10px 14px',borderRadius:10,background:'#2563EB08',border:'1px solid #2563EB20',marginBottom:12,display:'flex',alignItems:'flex-start',gap:8}}>
            <I n="info" s={14} style={{color:'#2563EB',flexShrink:0,marginTop:1}}/>
            <div style={{fontSize:11,color:T.text2,lineHeight:1.5}}>L'IA propose des actions après chaque appel (email, SMS, RDV...). <strong>Rien n'est envoyé sans validation.</strong></div>
          </div>

          {/* Rôle / Fonction */}
          <div style={{ marginBottom:10 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Rôle prédéfini</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {copilotRoles.map(r=>(
                <div key={r} onClick={()=>setAiCopilotRole(r)} style={{ padding:"5px 10px", borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:aiCopilotRole===r?700:500, color:aiCopilotRole===r?"#7C3AED":T.text2, background:aiCopilotRole===r?"#7C3AED12":"transparent", border:`1px solid ${aiCopilotRole===r?"#7C3AED":T.border}` }}>{r}</div>
              ))}
            </div>
          </div>

          {/* Type de rôle + Type de service */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Type de poste</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                {AI_ROLE_TYPES.map(r=>(
                  <div key={r.id} onClick={()=>setAiRoleType(r.id)} style={{ padding:"4px 8px", borderRadius:6, cursor:"pointer", fontSize:10, fontWeight:aiRoleType===r.id?700:500, color:aiRoleType===r.id?"#2563EB":T.text3, background:aiRoleType===r.id?"#2563EB12":"transparent", border:`1px solid ${aiRoleType===r.id?"#2563EB":T.border}` }}>{r.label}</div>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Service</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                {AI_SERVICE_TYPES.map(s=>(
                  <div key={s.id} onClick={()=>setAiServiceType(s.id)} style={{ padding:"4px 8px", borderRadius:6, cursor:"pointer", fontSize:10, fontWeight:aiServiceType===s.id?700:500, color:aiServiceType===s.id?"#22C55E":T.text3, background:aiServiceType===s.id?"#22C55E12":"transparent", border:`1px solid ${aiServiceType===s.id?"#22C55E":T.border}` }}>{s.label}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Mission principale */}
          <div style={{ marginBottom:10 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Mission principale</label>
            <input value={aiMainMission} onChange={e=>setAiMainMission(e.target.value)} placeholder="Ex: Accompagner les clients dans leur reconversion professionnelle" style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12, fontFamily:"inherit" }}/>
          </div>

          {/* Type d'appel par défaut + Objectif d'appel */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Type d'appel par défaut</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                {AI_CALL_TYPES.map(ct=>(
                  <div key={ct.id} onClick={()=>setAiCallTypeDefault(ct.id)} style={{ padding:"4px 8px", borderRadius:6, cursor:"pointer", fontSize:10, fontWeight:aiCallTypeDefault===ct.id?700:500, color:aiCallTypeDefault===ct.id?"#F59E0B":T.text3, background:aiCallTypeDefault===ct.id?"#F59E0B12":"transparent", border:`1px solid ${aiCallTypeDefault===ct.id?"#F59E0B":T.border}` }}>{ct.label}</div>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Objectif d'appel</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                {AI_CALL_GOALS.map(g=>(
                  <div key={g.id} onClick={()=>setAiCallGoalDefault(g.id)} style={{ padding:"4px 8px", borderRadius:6, cursor:"pointer", fontSize:10, fontWeight:aiCallGoalDefault===g.id?700:500, color:aiCallGoalDefault===g.id?"#7C3AED":T.text3, background:aiCallGoalDefault===g.id?"#7C3AED12":"transparent", border:`1px solid ${aiCallGoalDefault===g.id?"#7C3AED":T.border}` }}>{g.label}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Objectif + Cible (legacy fields) */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Objectif commercial</label>
              <input value={aiCopilotObjective} onChange={e=>setAiCopilotObjective(e.target.value)} placeholder="Ex: Vendre une formation" style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12, fontFamily:"inherit" }}/>
            </div>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Cible client</label>
              <input value={aiCopilotTarget} onChange={e=>setAiCopilotTarget(e.target.value)} placeholder="Ex: Agents immobiliers" style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12, fontFamily:"inherit" }}/>
            </div>
          </div>

          {/* Cible par défaut + Ton + Langue */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Cible type</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                {AI_TARGETS.map(t=>(
                  <div key={t.id} onClick={()=>setAiTargetDefault(t.id)} style={{ padding:"3px 7px", borderRadius:6, cursor:"pointer", fontSize:10, fontWeight:aiTargetDefault===t.id?700:500, color:aiTargetDefault===t.id?"#2563EB":T.text3, background:aiTargetDefault===t.id?"#2563EB12":"transparent", border:`1px solid ${aiTargetDefault===t.id?"#2563EB":T.border}` }}>{t.label}</div>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Ton de communication</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                {AI_TONES.map(t=>(
                  <div key={t.id} onClick={()=>setAiToneStyle(t.id)} style={{ padding:"3px 7px", borderRadius:6, cursor:"pointer", fontSize:10, fontWeight:aiToneStyle===t.id?700:500, color:aiToneStyle===t.id?"#EF4444":T.text3, background:aiToneStyle===t.id?"#EF444412":"transparent", border:`1px solid ${aiToneStyle===t.id?"#EF4444":T.border}` }}>{t.label}</div>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Langue</label>
              <select value={aiLanguage} onChange={e=>setAiLanguage(e.target.value)} style={{ width:"100%", padding:"6px 8px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12, fontFamily:"inherit" }}>
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="ar">العربية</option>
              </select>
            </div>
          </div>

          {/* Trame / Script détaillé */}
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Trame d'appel / Script IA</label>
            <textarea value={aiScriptTrame} onChange={e=>setAiScriptTrame(e.target.value)} placeholder={"1. ACCROCHE : Se présenter, demander si le moment est bien choisi\n2. DÉCOUVERTE : Questions sur l'activité, les difficultés\n3. PROPOSITION : Présenter l'offre, les bénéfices\n4. OBJECTIONS : Répondre au prix, au temps...\n5. CLOSING : Proposer un RDV, une inscription"} rows={5} style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12, fontFamily:"inherit", resize:"vertical", lineHeight:1.5 }}/>
            <div style={{ fontSize:10, color:T.text3, marginTop:3 }}>L'IA utilisera cette trame pour guider le collaborateur étape par étape pendant ses appels</div>
          </div>
        </div>
      )}
      </>)}
      <div style={{ display:"flex", gap:8, marginTop:16, justifyContent:"flex-end" }}>
        <Btn onClick={onClose}>Annuler</Btn>
        <Btn primary disabled={!name||!email||(pipelineMode==="template"&&!pipelineTemplateId)} onClick={()=>onCreate({name,email,phone:phone||null,role,priority,color,timezone:timezone||null,chat_enabled:chatEnabled?1:0,sms_enabled:smsEnabled?1:0,secure_ia_phone:secureIaPhone?1:0,secure_ia_words_json:JSON.stringify(secureIaWords),ai_copilot_enabled:aiCopilotEnabled?1:0,ai_copilot_role:aiCopilotRole,ai_copilot_objective:aiCopilotObjective,ai_copilot_target:aiCopilotTarget,ai_copilot_level:aiCopilotEnabled?aiCopilotLevel:'off',ai_role_type:aiRoleType,ai_service_type:aiServiceType,ai_main_mission:aiMainMission,ai_call_type_default:aiCallTypeDefault,ai_call_goal_default:aiCallGoalDefault,ai_target_default:aiTargetDefault,ai_language:aiLanguage,ai_tone_style:aiToneStyle,ai_script_trame:aiScriptTrame,_assignPipelineMode:pipelineMode,_assignPipelineTemplateId:pipelineTemplateId||null})}><I n="check" s={14}/> Créer le collaborateur</Btn>
      </div>
    </div>
  );
};

export default NewCollabForm;
