// CockpitFloatingButton — extraction S2.1 depuis CollabPortal.jsx L5967-5973
// Responsabilité : petit bouton flottant bottom-right visible pendant un appel
// quand le Cockpit n'est pas ouvert. Clic = ouvre le Cockpit.
// Consomme voipState + phoneActiveCall + cockpitOpen + setCockpitOpen + phoneCallTimer
// depuis CollabContext. Aucun changement métier.

import React from "react";
import { I } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const CockpitFloatingButton = () => {
  const {
    voipState,
    phoneActiveCall,
    phoneCallTimer,
    cockpitOpen, setCockpitOpen,
  } = useCollabContext();

  if (voipState !== 'in-call' || !phoneActiveCall || cockpitOpen) return null;

  return (
    <div onClick={()=>setCockpitOpen(true)} style={{position:'fixed',bottom:24,right:24,zIndex:10002,padding:'10px 18px',borderRadius:14,background:'linear-gradient(135deg,#7C3AED,#2563EB)',color:'#fff',fontSize:13,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:8,boxShadow:'0 4px 20px rgba(124,58,237,.4)',animation:'pulse 2s infinite',border:'2px solid rgba(255,255,255,.3)'}}>
      <I n="monitor" s={18}/> Cockpit
      <span style={{fontSize:11,opacity:.8}}>{Math.floor(phoneCallTimer/60).toString().padStart(2,'0')}:{(phoneCallTimer%60).toString().padStart(2,'0')}</span>
    </div>
  );
};

export default CockpitFloatingButton;
