// FicheEspaceClient — extraction S1.4b (11/11) depuis FicheContactModal.jsx L410-433
// Responsabilité : bas de fiche — espace client (activer / ouvrir / copier / envoyer
// par SMS). Affiché uniquement si ct._linked.

import React from "react";
import { T } from "../../../../../theme";
import { I } from "../../../../../shared/ui";
import { api } from "../../../../../shared/services/api";
import { useCollabContext } from "../../../context/CollabContext";

const FicheEspaceClient = ({ ct }) => {
  const {
    collab, company,
    handleCollabUpdateContact,
    showNotif,
  } = useCollabContext();

  if (!ct._linked) return null;

  return (
    <div style={{marginTop:20,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
      <div style={{borderRadius:10,background:ct.clientPortalEnabled?'#D1FAE5':'#F1F5F9',border:'1px solid '+(ct.clientPortalEnabled?'#A7F3D0':'#E2E8F0'),overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px'}}>
          <I n="globe" s={14} style={{color:ct.clientPortalEnabled?'#059669':'#94A3B8'}}/>
          {ct.clientPortalEnabled && ct.clientToken ? (
            <>
              <span style={{fontSize:12,fontWeight:600,color:'#059669'}}>Espace client actif</span>
              <span style={{flex:1}}/>
              <a href={`https://calendar360.fr/espace/${ct.clientToken}`} target="_blank" rel="noreferrer" style={{cursor:'pointer',padding:'3px 10px',borderRadius:6,background:'#05966914',color:'#059669',fontSize:11,fontWeight:600,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:4}}><I n="external-link" s={10}/> Ouvrir</a>
              <span onClick={()=>{navigator.clipboard.writeText(`https://calendar360.fr/espace/${ct.clientToken}`);showNotif('Lien copié !','success');}} style={{cursor:'pointer',padding:'3px 10px',borderRadius:6,background:'#059669',color:'#fff',fontSize:11,fontWeight:600}}><I n="copy" s={10}/> Copier</span>
              <span onClick={()=>{const url=`https://calendar360.fr/espace/${ct.clientToken}`;const ph=ct.phone||ct.mobile||'';if(ph){api('/api/sms/send',{method:'POST',body:{to:ph,message:`Bonjour ${ct.firstname||ct.name||''}, voici l'accès à votre espace client : ${url}`,companyId:company?.id,collaboratorId:collab?.id,contactId:ct.id}}).then(r=>{if(r?.success)showNotif('Lien envoyé par SMS !','success');else showNotif('Erreur envoi SMS','danger');}).catch(()=>showNotif('Erreur','danger'));}else{navigator.clipboard.writeText(url);showNotif('Lien copié !','info');}}} style={{cursor:'pointer',padding:'3px 10px',borderRadius:6,background:'#2563EB',color:'#fff',fontSize:11,fontWeight:600,display:'inline-flex',alignItems:'center',gap:4}}><I n="send" s={10}/> Envoyer</span>
            </>
          ) : (
            <>
              <span style={{fontSize:12,color:'#94A3B8'}}>Espace client non activé</span>
              <span onClick={()=>{const tk='ct_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);handleCollabUpdateContact(ct.id,{clientToken:tk,clientPortalEnabled:1});showNotif('Espace client activé !','success');}} style={{cursor:'pointer',padding:'3px 10px',borderRadius:6,background:T.accent,color:'#fff',fontSize:11,fontWeight:600,flexShrink:0,marginLeft:'auto'}}>Activer</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FicheEspaceClient;
