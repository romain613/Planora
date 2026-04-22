// IaProactiveWidget — extraction S2.8 depuis CollabPortal.jsx L5732-5752
// Responsabilité : widget IA flottant bottom-right affiché quand showIaWidget=true
// ET collab.ai_copilot_enabled. Calcule une suggestion contextuelle parmi 3 cibles :
//   1. rdv_programme avec RDV passé (orange, qualifier)
//   2. nrp avec relance due (rouge, relancer)
//   3. inactif 14j+ hors perdu/client_valide (jaune, reprendre contact)
// Si aucune cible : message "Tout est à jour !" sans bouton action.
//
// Bouton "Exécuter l'action" ferme le widget et déclenche :
//   - setRdvPasseModal({contact, rdvDate, bookingId}) si rdv_programme
//   - startVoipCall(phone, first) sinon (fallback tel: si startVoipCall absent)
//
// Aucun changement métier. Le calcul de suggestion + la chaîne de déclenchement
// (setRdvPasseModal vers PhoneTab, startVoipCall vers Twilio device) sont copiés
// verbatim. Widget et handler déclencheur sont séparés — le rdvPasseModal lui-même
// reste owned par PhoneTab (hors scope S2).

import React from "react";
import { T } from "../../../theme";
import { I } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const IaProactiveWidget = () => {
  const {
    showIaWidget, setShowIaWidget,
    collab, contacts, bookings,
    setRdvPasseModal,
    startVoipCall,
  } = useCollabContext();

  if (!showIaWidget || !collab.ai_copilot_enabled) return null;

  const todayISO2 = new Date().toISOString().split('T')[0];
  const rdvP = (contacts||[]).find(c=>c.assignedTo===collab.id&&c.pipeline_stage==='rdv_programme'&&c.next_rdv_date&&c.next_rdv_date<todayISO2);
  const nrpR = (contacts||[]).find(c=>c.assignedTo===collab.id&&c.pipeline_stage==='nrp'&&c.nrp_next_relance&&c.nrp_next_relance<=todayISO2);
  const inact = (contacts||[]).find(c=>c.assignedTo===collab.id&&!['perdu','client_valide'].includes(c.pipeline_stage)&&c.lastVisit&&Math.floor((Date.now()-new Date(c.lastVisit).getTime())/86400000)>=14);
  const first = rdvP||nrpR||inact;
  const msg = rdvP?`Qualifiez ${rdvP.name} — RDV passé`:nrpR?`Relancez ${nrpR.name} — NRP`:inact?`${inact.name} inactif depuis 14+ jours`:'Tout est à jour !';
  const color = rdvP?'#F97316':nrpR?'#EF4444':inact?'#F59E0B':'#22C55E';

  return (
    <div style={{position:'fixed',bottom:72,right:20,width:320,zIndex:9991,borderRadius:14,background:T.card,border:'1.5px solid #7C3AED30',boxShadow:'0 12px 40px rgba(124,58,237,0.15)',padding:16,animation:'fadeInScale .2s ease'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        <div style={{width:28,height:28,borderRadius:8,background:'#7C3AED15',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="cpu" s={14} style={{color:'#7C3AED'}}/></div>
        <span style={{fontSize:12,fontWeight:700,color:'#7C3AED',flex:1}}>Copilot IA</span>
        <div onClick={()=>setShowIaWidget(false)} style={{cursor:'pointer',padding:2}}><I n="x" s={14} style={{color:T.text3}}/></div>
      </div>
      <div style={{padding:'8px 10px',borderRadius:8,background:color+'08',border:'1px solid '+color+'25',marginBottom:10}}>
        <div style={{fontSize:12,fontWeight:600,color:T.text}}>{msg}</div>
      </div>
      {first && <div onClick={()=>{setShowIaWidget(false);if(rdvP){const liveRdv2=(bookings||[]).find(b=>b.contactId===first.id&&b.status==='confirmed');setRdvPasseModal({contact:first,rdvDate:liveRdv2?.date||first.next_rdv_date,bookingId:liveRdv2?.id});}else if(first.phone){if(typeof startVoipCall==='function')startVoipCall(first.phone,first);else window.open('tel:'+first.phone);}}} style={{width:'100%',padding:'8px 0',borderRadius:8,background:'#7C3AED',color:'#fff',fontSize:11,fontWeight:700,textAlign:'center',cursor:'pointer'}}>Exécuter l'action</div>}
    </div>
  );
};

export default IaProactiveWidget;
