import React, { useState } from "react";
import { T } from "../../../theme";
import { isValidEmail } from "../../../shared/utils/validators";
import { I, Btn, ValidatedInput } from "../../../shared/ui";
import PlacesAutocomplete from "./PlacesAutocomplete";

const NewCompanyForm = ({ onClose, onCreate }) => {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [plan, setPlan] = useState("free");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [sector, setSector] = useState("");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const SECTORS = ['Immobilier','Finance','Assurance','Formation','Sante','Automobile','BTP','Commerce','Tech / SaaS','Marketing','RH / Recrutement','Juridique','Transport','Restauration','Autre'];
  return (
    <div>
      {/* Entreprise */}
      <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:8}}><I n="building" s={13}/> Entreprise</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <ValidatedInput label="Nom de l'entreprise" required placeholder="Acme Corp" value={name} onChange={e=>setName(e.target.value)} icon="building"/>
        <ValidatedInput label="Domaine" required placeholder="https://acme-corp.fr/" value={domain} onChange={e=>setDomain(e.target.value)} icon="globe"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>
        <div>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Secteur d'activite</label>
          <select value={sector} onChange={e=>setSector(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:12}}>
            <option value="">Selectionner...</option>
            {SECTORS.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Plan</label>
          <div style={{display:"flex",gap:6}}>
            {[{id:"free",label:"Gratuit",color:T.text3},{id:"pro",label:"Pro",color:T.accent},{id:"enterprise",label:"Entreprise",color:T.purple}].map(p=>(
              <div key={p.id} onClick={()=>setPlan(p.id)} style={{flex:1,padding:"8px 12px",borderRadius:8,cursor:"pointer",textAlign:"center",border:`1px solid ${plan===p.id?p.color:T.border}`,background:plan===p.id?p.color+"12":T.surface,color:plan===p.id?p.color:T.text2,fontSize:12,fontWeight:600}}>{p.label}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Admin */}
      <div style={{fontSize:12,fontWeight:700,color:T.text,marginTop:20,marginBottom:8}}><I n="user" s={13}/> Contact administrateur</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <ValidatedInput label="Prenom" placeholder="Jean" value={adminFirstName} onChange={e=>setAdminFirstName(e.target.value)} icon="user"/>
        <ValidatedInput label="Nom" placeholder="Dupont" value={adminLastName} onChange={e=>setAdminLastName(e.target.value)} icon="user"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>
        <ValidatedInput label="Email admin" required placeholder="admin@acme-corp.fr" value={contactEmail} onChange={e=>setContactEmail(e.target.value)} icon="mail" validate={isValidEmail} errorMsg="Format email invalide"/>
        <ValidatedInput label="Telephone" placeholder="06 12 34 56 78" value={adminPhone} onChange={e=>setAdminPhone(e.target.value)} icon="phone"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>
        <div>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Mot de passe *</label>
          <div style={{position:"relative"}}>
            <input type={showPw?"text":"password"} value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} placeholder="Min. 6 caracteres" style={{width:"100%",padding:"8px 36px 8px 32px",borderRadius:8,border:`1px solid ${adminPassword.length>=6?'#22C55E':adminPassword?'#EF4444':T.border}`,background:T.surface,color:T.text,fontSize:12}}/>
            <I n="lock" s={14} style={{position:"absolute",left:10,top:10,color:T.text3}}/>
            <div onClick={()=>setShowPw(p=>!p)} style={{position:"absolute",right:8,top:7,cursor:"pointer"}}><I n={showPw?"eye-off":"eye"} s={16} style={{color:T.text3}}/></div>
          </div>
          {adminPassword&&adminPassword.length<6&&<div style={{fontSize:10,color:'#EF4444',marginTop:3}}>Min. 6 caracteres</div>}
        </div>
        <div style={{display:"flex",flexDirection:"column",justifyContent:"flex-end",gap:8,paddingBottom:4}}>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:T.text2}}>
            <input type="checkbox" checked={sendWelcomeEmail} onChange={e=>setSendWelcomeEmail(e.target.checked)} style={{accentColor:T.accent}}/>
            <I n="mail" s={13}/> Envoyer email de bienvenue
          </label>
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginTop:20,justifyContent:"flex-end"}}>
        <Btn onClick={onClose}>Annuler</Btn>
        <Btn primary disabled={!name||!domain||!contactEmail||!adminPassword||adminPassword.length<6} onClick={()=>{console.log('CREATE',{name,domain,contactEmail,plan,adminPassword:adminPassword.length});onCreate({name,domain,contactEmail,plan,sector,adminFirstName,adminLastName,adminPhone,adminPassword,sendWelcomeEmail});}}><I n="check" s={14}/> Créer l'entreprise</Btn>
      </div>
    </div>
  );
};

export default NewCompanyForm;
