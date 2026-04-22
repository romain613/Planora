// CockpitMinimizedButton — extraction S2.2 depuis CollabPortal.jsx L6152-6159
// Responsabilité : petit bouton flottant bottom-right affiché quand le Cockpit
// est ouvert MAIS minimisé (pendant un appel in-call). Clic principal = restaurer,
// croix interne = fermer le Cockpit entièrement.
// Consomme cockpitOpen/cockpitMinimized/voipState/phoneCallTimer + setters depuis
// CollabContext. Aucun changement métier.

import React from "react";
import { I } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const CockpitMinimizedButton = () => {
  const {
    voipState,
    phoneCallTimer,
    cockpitOpen, setCockpitOpen,
    cockpitMinimized, setCockpitMinimized,
  } = useCollabContext();

  if (!cockpitOpen || !cockpitMinimized || voipState !== 'in-call') return null;

  return (
    <div onClick={()=>setCockpitMinimized(false)} style={{position:'fixed',bottom:24,right:24,zIndex:10002,padding:'8px 16px',borderRadius:12,background:'linear-gradient(135deg,#7C3AED,#2563EB)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:8,boxShadow:'0 4px 16px rgba(124,58,237,.3)',border:'2px solid rgba(255,255,255,.3)'}}>
      <I n="maximize-2" s={14}/> Cockpit
      <span style={{fontFamily:'monospace',fontSize:13,fontWeight:800}}>{Math.floor(phoneCallTimer/60).toString().padStart(2,'0')}:{(phoneCallTimer%60).toString().padStart(2,'0')}</span>
      <div onClick={e=>{e.stopPropagation();setCockpitOpen(false);setCockpitMinimized(false);}} style={{marginLeft:4,width:20,height:20,borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,.2)',cursor:'pointer'}}><I n="x" s={10}/></div>
    </div>
  );
};

export default CockpitMinimizedButton;
