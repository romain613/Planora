// NewContactModal — extraction S2.7 depuis CollabPortal.jsx L4003-4075
// Responsabilité : formulaire global "Nouveau contact" accessible depuis tous les tabs
// (sticky bar, CrmHeader, CrmTableView, CrmKanbanView, FicheContactModal, PhoneTab).
// Champs : Type (BtC/BtB), Civilité, Prénom*, Nom*, Email, Téléphone, Mobile, Adresse,
// champs entreprise conditionnels (Société*, Site web, SIRET), Statut pipeline, Tags,
// Notes. Validations inline email/phone via ValidatedInput.
//
// Le handler handleCollabCreateContact (owned par CollabPortal L3082-3092) gère :
//   - validation fullName obligatoire
//   - setContacts push + API POST
//   - setShowNewContact(false) (ferme le modal)
//   - setNewContactForm({...reset...}) (reset du formulaire)
// Aucun reset côté composant sur cancel — comportement préservé.

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Modal, ValidatedInput } from "../../../shared/ui";
import { isValidEmail, isValidPhone } from "../../../shared/utils/validators";
import { useCollabContext } from "../context/CollabContext";

const NewContactModal = () => {
  const {
    showNewContact, setShowNewContact,
    newContactForm, setNewContactForm,
    handleCollabCreateContact,
    PIPELINE_STAGES,
  } = useCollabContext();

  return (
    <Modal open={showNewContact} onClose={()=>setShowNewContact(false)} title="Nouveau contact" width={540}>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        {/* Type + Civilité */}
        <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
          <div style={{flex:1}}>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Type</label>
            <div style={{display:'flex',gap:6}}>
              {[{v:'btc',l:'🟢 Particulier'},{v:'btb',l:'🔵 Entreprise'}].map(t=>(
                <div key={t.v} onClick={()=>setNewContactForm(p=>({...p,contact_type:t.v}))} style={{padding:'6px 14px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:newContactForm.contact_type===t.v?700:500,background:newContactForm.contact_type===t.v?T.accentBg:'transparent',color:newContactForm.contact_type===t.v?T.accent:T.text3,border:`1.5px solid ${newContactForm.contact_type===t.v?T.accent:T.border}`}}>{t.l}</div>
              ))}
            </div>
          </div>
          <div>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Civilité</label>
            <select value={newContactForm.civility||''} onChange={e=>setNewContactForm(p=>({...p,civility:e.target.value}))} style={{padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:13,fontFamily:'inherit',color:T.text,cursor:'pointer'}}>
              <option value="">—</option>
              <option value="M">M.</option>
              <option value="Mme">Mme</option>
            </select>
          </div>
        </div>
        {/* Prénom + Nom */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <ValidatedInput label="Prénom *" required placeholder="Prénom" value={newContactForm.firstname||''} onChange={e=>setNewContactForm(p=>({...p,firstname:e.target.value}))} icon="user"/>
          <ValidatedInput label="Nom *" required placeholder="Nom de famille" value={newContactForm.lastname||''} onChange={e=>setNewContactForm(p=>({...p,lastname:e.target.value}))} icon="user"/>
        </div>
        {/* Email */}
        <ValidatedInput label="Email" placeholder="email@exemple.com" value={newContactForm.email} onChange={e=>setNewContactForm(p=>({...p,email:e.target.value}))} icon="mail" validate={v=>!v.trim()||isValidEmail(v)} errorMsg="Format email invalide"/>
        {/* Téléphone + Mobile */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <ValidatedInput label="Téléphone" placeholder="+33 1 XX XX XX XX" value={newContactForm.phone} onChange={e=>setNewContactForm(p=>({...p,phone:e.target.value}))} icon="phone" validate={v=>!v.trim()||isValidPhone(v)} errorMsg="Format invalide"/>
          <ValidatedInput label="Mobile" placeholder="+33 6 XX XX XX XX" value={newContactForm.mobile||''} onChange={e=>setNewContactForm(p=>({...p,mobile:e.target.value}))} icon="smartphone" validate={v=>!v.trim()||isValidPhone(v)} errorMsg="Format invalide"/>
        </div>
        {/* Adresse */}
        <ValidatedInput label="Adresse" placeholder="Rue, Ville, Code postal" value={newContactForm.address||''} onChange={e=>setNewContactForm(p=>({...p,address:e.target.value}))} icon="map-pin"/>
        {/* Champs entreprise conditionnels */}
        {newContactForm.contact_type==='btb'&&(
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:10,borderRadius:8,background:'#2563EB08',border:'1px solid #2563EB20'}}>
            <ValidatedInput label="Société *" placeholder="Nom de l'entreprise" value={newContactForm.company||''} onChange={e=>setNewContactForm(p=>({...p,company:e.target.value}))} icon="building-2"/>
            <ValidatedInput label="Site web" placeholder="https://..." value={newContactForm.website||''} onChange={e=>setNewContactForm(p=>({...p,website:e.target.value}))} icon="globe"/>
            <ValidatedInput label="SIRET / SIREN" placeholder="XXX XXX XXX XXXXX" value={newContactForm.siret||''} onChange={e=>setNewContactForm(p=>({...p,siret:e.target.value}))}/>
          </div>
        )}
        {/* Statut pipeline */}
        <div>
          <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Statut pipeline</label>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {PIPELINE_STAGES.map(s=>(
              <div key={s.id} onClick={()=>setNewContactForm(p=>({...p,pipeline_stage:s.id}))} style={{padding:'6px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:newContactForm.pipeline_stage===s.id?700:500,background:newContactForm.pipeline_stage===s.id?(s.color||'#2563EB')+'18':'transparent',color:newContactForm.pipeline_stage===s.id?(s.color||'#2563EB'):T.text3,border:`1.5px solid ${newContactForm.pipeline_stage===s.id?(s.color||'#2563EB'):T.border}`,transition:'all .15s',display:'flex',alignItems:'center',gap:4}}>
                <div style={{width:8,height:8,borderRadius:4,background:s.color||'#2563EB'}}/>
                {s.label}
              </div>
            ))}
          </div>
        </div>
        {/* Tags */}
        <div>
          <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Tags</label>
          <input value={newContactForm.tags||''} onChange={e=>setNewContactForm(p=>({...p,tags:e.target.value}))} placeholder="VIP, Prospect, Urgent... (séparés par virgule)" style={{width:'100%',padding:'8px 10px',borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:13,fontFamily:'inherit',color:T.text,outline:'none'}}/>
          {newContactForm.tags && <div style={{display:'flex',gap:4,marginTop:4,flexWrap:'wrap'}}>{newContactForm.tags.split(',').map(t=>t.trim()).filter(Boolean).map((t,i)=><span key={i} style={{fontSize:10,padding:'2px 8px',borderRadius:6,background:T.accentBg,color:T.accent,fontWeight:600}}>{t}</span>)}</div>}
        </div>
        {/* Notes */}
        <div>
          <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Notes</label>
          <textarea value={newContactForm.notes} onChange={e=>setNewContactForm(p=>({...p,notes:e.target.value}))} placeholder="Notes, informations complémentaires..." rows={3} style={{width:'100%',padding:10,borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:13,fontFamily:'inherit',resize:'vertical',color:T.text,outline:'none'}}/>
        </div>
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <Btn onClick={()=>setShowNewContact(false)} style={{flex:1}}>Annuler</Btn>
          <Btn primary onClick={handleCollabCreateContact} style={{flex:1}}><I n="check" s={14}/> Créer le contact</Btn>
        </div>
      </div>
    </Modal>
  );
};

export default NewContactModal;
