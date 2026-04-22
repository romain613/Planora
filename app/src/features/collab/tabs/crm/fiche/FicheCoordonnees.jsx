// FicheCoordonnees — extraction S1.4b (5/11) depuis FicheContactModal.jsx L266-304
// Responsabilité : bloc coordonnées éditable (Civ/Prénom/Nom + Phone/Email/Adresse
// + champs BtB). Debounce via collabNotesTimerRef. Aucun changement métier.

import React from "react";
import { T } from "../../../../../theme";
import { I } from "../../../../../shared/ui";
import { api } from "../../../../../shared/services/api";
import { _T } from "../../../../../shared/state/tabState";
import { useCollabContext } from "../../../context/CollabContext";

const FicheCoordonnees = ({ ct }) => {
  const {
    company,
    setSelectedCrmContact, setContacts,
    collabNotesTimerRef,
  } = useCollabContext();

  return (()=>{
                  const _cu=(field,val)=>{setSelectedCrmContact(p=>({...p,[field]:val}));setContacts(p=>p.map(c=>c.id===ct.id?{...c,[field]:val}:c));_T.crmSync?.({[field]:val});clearTimeout(collabNotesTimerRef.current);collabNotesTimerRef.current=setTimeout(()=>api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{[field]:val,companyId:company?.id}}),500);};
                  const _cf=(icon,field,placeholder,opts={})=><div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:8,border:`1px solid ${T.border}40`,background:T.card,...(opts.full?{gridColumn:'1 / -1'}:{})}}>
                    <I n={icon} s={13} style={{color:T.text3,flexShrink:0}}/>
                    <input value={ct[field]||''} onChange={e=>_cu(field,e.target.value)} onBlur={()=>{if((field==='phone'||field==='mobile')&&ct[field]){const n=ct[field].replace(/\s/g,'');let ph=ct[field];if(/^0[1-9]\d{8}$/.test(n)){ph='+33'+n.slice(1);_cu(field,ph);}else if(/^[1-9]\d{8}$/.test(n)){ph='+33'+n;_cu(field,ph);}}}} placeholder={placeholder} style={{fontSize:13,border:'none',padding:'2px 0',background:'transparent',color:ct[field]?T.text:'#CBD5E1',fontFamily:'inherit',outline:'none',width:'100%'}}/>
                  </div>;
                  return <>
                  {/* Badge: Type + Source + Date */}
                  <div style={{display:'flex',alignItems:'center',gap:0,marginBottom:8,fontSize:11,color:T.text3,borderRadius:8,border:`1px solid ${T.border}30`,overflow:'hidden',background:T.card}}>
                    <select value={ct.contact_type||'btc'} onChange={e=>_cu('contact_type',e.target.value)} style={{fontSize:11,fontWeight:700,border:'none',borderRight:`1px solid ${T.border}30`,padding:'5px 8px',background:ct.contact_type==='btb'?'#2563EB08':'#22C55E08',color:ct.contact_type==='btb'?'#2563EB':'#22C55E',cursor:'pointer',fontFamily:'inherit'}}><option value="btc">🟢 Particulier</option><option value="btb">🔵 Entreprise</option></select>
                    {ct.source&&<span style={{padding:'5px 8px',fontWeight:600,borderRight:`1px solid ${T.border}30`}}>{ct.source==='manual'?'Manuel':ct.source==='csv'?'CSV':ct.source==='lead'?'Lead':(ct.source==='booking'||ct.source==='agenda')?'Booking':ct.source}</span>}
                    {ct.createdAt&&<span style={{padding:'5px 8px'}}>{new Date(ct.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}</span>}
                  </div>
                  {/* Bloc coordonnées */}
                  <div style={{marginBottom:10,padding:'8px 10px',borderRadius:8,background:T.bg,border:`1px solid ${T.border}`}}>
                    {/* Civ + Prénom + Nom */}
                    <div style={{display:'flex',gap:4,alignItems:'center',marginBottom:6}}>
                      <select value={ct.civility||''} onChange={e=>_cu('civility',e.target.value)} style={{fontSize:12,fontWeight:700,border:`1px solid ${T.border}40`,borderRadius:8,padding:'6px 8px',background:T.card,color:ct.civility?T.text:T.text3,fontFamily:'inherit',outline:'none',cursor:'pointer',minWidth:52,textAlign:'center'}}><option value="">Civ.</option><option value="M">M.</option><option value="Mme">Mme</option></select>
                      <input value={ct.firstname||''} onChange={e=>_cu('firstname',e.target.value)} onBlur={()=>{const full=(ct.civility?ct.civility+' ':'')+(ct.firstname||'')+' '+(ct.lastname||'');api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{firstname:ct.firstname,name:full.trim(),companyId:company?.id}});}} placeholder="Prénom" style={{fontSize:14,fontWeight:700,border:`1px solid ${T.border}40`,borderRadius:8,padding:'6px 10px',background:T.card,color:ct.firstname?T.text:'#CBD5E1',fontFamily:'inherit',outline:'none',flex:1,minWidth:0}}/>
                      <input value={ct.lastname||''} onChange={e=>_cu('lastname',e.target.value)} onBlur={()=>{const full=(ct.civility?ct.civility+' ':'')+(ct.firstname||'')+' '+(ct.lastname||'');api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{lastname:ct.lastname,name:full.trim(),companyId:company?.id}});}} placeholder="Nom" style={{fontSize:14,fontWeight:700,border:`1px solid ${T.border}40`,borderRadius:8,padding:'6px 10px',background:T.card,color:ct.lastname?T.text:'#CBD5E1',fontFamily:'inherit',outline:'none',flex:1.3,minWidth:0}}/>
                    </div>
                    {/* Champs — adaptés selon type */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                      {_cf('phone','phone','Téléphone',{full:true})}
                      {_cf('mail','email','Email',{full:true})}
                      {_cf('map-pin','address','Adresse',{full:true})}
                    </div>
                    {/* Entreprise only */}
                    {ct.contact_type==='btb'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3,marginTop:3}}>
                      {_cf('building-2','company','Société',{full:true})}
                      {_cf('smartphone','mobile','Mobile')}
                      {_cf('globe','website','Site web')}
                      {_cf('hash','siret','SIRET / SIREN')}
                      {_cf('receipt','tva_number','N° TVA')}
                    </div>}
                  </div>
                  </>;
                })();
};

export default FicheCoordonnees;
