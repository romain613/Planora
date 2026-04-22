// V7TransferModal — extraction S2.4 depuis CollabPortal.jsx L3724-3753
// Responsabilité : modal de transfert d'un contact à un autre collab (cœur business V7
// validé 2026-04-19). Ouvert depuis Pipeline kanban, Fiche Suivi, ou Phone pipeline
// via setV7TransferModal({contact, from*:true}). Fermeture par click backdrop /
// bouton Annuler / succès API (reset dans handleV7Transfer).
// Consomme v7TransferModal/v7TransferTarget/v7TransferLoading + setters + handleV7Transfer
// + collab + collabs depuis CollabContext. Aucun changement métier.
// La logique du handler (API /api/transfer/executor, reload contacts, refetch
// followers-batch) reste intégralement dans CollabPortal où v7FollowersMap
// + v7FollowersLoadedRef + setContacts sont owned.

import React from "react";
import { T } from "../../../theme";
import { I } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const V7TransferModal = () => {
  const {
    v7TransferModal, setV7TransferModal,
    v7TransferTarget, setV7TransferTarget,
    v7TransferLoading,
    handleV7Transfer,
    collab, collabs,
  } = useCollabContext();

  if (!v7TransferModal) return null;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setV7TransferModal(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:16,padding:24,width:420,maxWidth:'90vw',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <div style={{width:36,height:36,borderRadius:10,background:'#8B5CF618',display:'flex',alignItems:'center',justifyContent:'center',color:'#8B5CF6'}}><I n='users' s={18}/></div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:T.text}}>Transférer un contact</div>
            <div style={{fontSize:12,color:T.text3}}>{v7TransferModal.contact?.name}</div>
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:6,display:'block'}}>Transférer à :</label>
          <select value={v7TransferTarget} onChange={e=>setV7TransferTarget(e.target.value)} style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:14}}>
            <option value=''>Sélectionner un collaborateur...</option>
            {(collabs||[]).filter(c=>c.id!==collab.id).map(c=>(<option key={c.id} value={c.id}>{c.name} {c.email ? '('+c.email+')' : ''}</option>))}
          </select>
        </div>
        <div style={{fontSize:12,color:T.text3,marginBottom:16,padding:10,borderRadius:8,background:T.accentBg}}>
          <I n='info' s={12}/> Le contact sera transféré. Vous resterez en suivi comme source.
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <div onClick={()=>setV7TransferModal(null)} style={{padding:'8px 16px',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',color:T.text2,background:T.bg,border:'1px solid '+T.border}}>Annuler</div>
          <div onClick={handleV7Transfer} style={{padding:'8px 20px',borderRadius:10,fontSize:13,fontWeight:700,cursor:v7TransferTarget&&!v7TransferLoading?'pointer':'not-allowed',color:'#fff',background:v7TransferTarget?'#8B5CF6':'#8B5CF660',opacity:v7TransferLoading?0.6:1}}>
            {v7TransferLoading?'Transfert...':'Transférer'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default V7TransferModal;
