// IncomingCallBanner — extraction S2.6 depuis CollabPortal.jsx L3876-3887
// Responsabilité : banner sticky top plein-écran pendant un appel entrant avec
// 2 actions (Décrocher / Refuser). Affiché uniquement si voipState === 'incoming'
// ET phoneIncomingInfo existe. Disparaît automatiquement dès que le state sort
// de 'incoming' (décroché → 'in-call', refusé → 'idle').
// Les handlers Twilio (acceptCollabIncomingCall, rejectCollabIncomingCall) sont
// owned par CollabPortal et exposés via le provider — aucun changement de
// logique Twilio / call-state. Extraction 100% structurelle.

import React from "react";
import { I } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const IncomingCallBanner = () => {
  const {
    voipState,
    phoneIncomingInfo,
    acceptCollabIncomingCall,
    rejectCollabIncomingCall,
  } = useCollabContext();

  if (voipState !== 'incoming' || !phoneIncomingInfo) return null;

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:9999, background:'linear-gradient(135deg,#7C2D12,#431407)', borderBottom:'2px solid #F59E0B40', padding:'12px 20px', display:'flex', alignItems:'center', gap:12, boxShadow:'0 4px 24px rgba(0,0,0,0.3)', animation:'fadeInScale .3s ease' }}>
      <div style={{ width:36, height:36, borderRadius:18, background:'#F59E0B20', display:'flex', alignItems:'center', justifyContent:'center', animation:'pulse 1.5s infinite', flexShrink:0 }}><I n="phone-incoming" s={18} style={{ color:'#F59E0B' }}/></div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Appel entrant</div>
        <div style={{ fontSize:12, color:'#ffffff80' }}>{phoneIncomingInfo.contactName || 'Numero inconnu'} · {phoneIncomingInfo.from}</div>
      </div>
      <div onClick={acceptCollabIncomingCall} style={{ padding:'8px 16px', borderRadius:10, background:'linear-gradient(135deg,#22C55E,#16A34A)', cursor:'pointer', fontSize:12, fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:6, boxShadow:'0 2px 12px rgba(34,197,94,0.4)' }}><I n="phone" s={14}/> Decrocher</div>
      <div onClick={rejectCollabIncomingCall} style={{ padding:'8px 16px', borderRadius:10, background:'linear-gradient(135deg,#EF4444,#DC2626)', cursor:'pointer', fontSize:12, fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:6 }}><I n="phone-off" s={14}/> Refuser</div>
    </div>
  );
};

export default IncomingCallBanner;
