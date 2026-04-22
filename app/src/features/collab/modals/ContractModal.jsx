// ContractModal — extraction S2.5 depuis CollabPortal.jsx L5791-5831
// Responsabilité : modal de validation de contrat quand un contact passe en
// pipeline 'client_valide'. Formulaire : montant, numéro de dossier, date de
// signature, commentaire. Déclenche handlePipelineStageChange avec extras
// {amount, number, date} pour tracer contract_amount / contract_number / contract_date.
// 3 sorties possibles :
//   - onClose (click backdrop) : change stage SANS contract info (amount:0)
//   - "Passer sans contrat"    : change stage SANS contract info (amount:0)
//   - "Valider le contrat"     : validation amount>0 obligatoire, change stage AVEC infos
// Aucun changement métier — réécriture structurelle stricte.

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Modal } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const ContractModal = () => {
  const {
    contractModal, setContractModal,
    contractForm, setContractForm,
    handlePipelineStageChange,
    showNotif,
  } = useCollabContext();

  if (!contractModal) return null;

  return (
    <Modal open={true} onClose={()=>{
      // Cancel → still change stage but without contract info
      handlePipelineStageChange(contractModal.contactId, 'client_valide', contractModal.note||'', {amount:0,number:'',date:''});
      setContractModal(null);
    }}>
      <h2 style={{fontSize:18,fontWeight:800,marginBottom:20,display:'flex',alignItems:'center',gap:8}}><I n="file-check" s={20} style={{color:'#22C55E'}}/> Contrat — Client Validé</h2>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:T.text3,marginBottom:4,display:'block'}}>Montant du contrat (€)</label>
          <input type="number" min="0" step="0.01" value={contractForm.amount} onChange={e=>setContractForm(p=>({...p,amount:e.target.value}))} placeholder="Ex: 5000" style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1.5px solid ${T.border}`,background:T.bg,fontSize:14,fontWeight:600,fontFamily:'inherit',color:T.text,outline:'none'}}/>
        </div>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:T.text3,marginBottom:4,display:'block'}}>Numéro de dossier</label>
          <input type="text" value={contractForm.number} onChange={e=>setContractForm(p=>({...p,number:e.target.value}))} placeholder="Ex: GD-2026-088" style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1.5px solid ${T.border}`,background:T.bg,fontSize:14,fontFamily:'inherit',color:T.text,outline:'none'}}/>
        </div>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:T.text3,marginBottom:4,display:'block'}}>Date de signature</label>
          <input type="date" value={contractForm.date} onChange={e=>setContractForm(p=>({...p,date:e.target.value}))} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1.5px solid ${T.border}`,background:T.bg,fontSize:14,fontFamily:'inherit',color:T.text,outline:'none'}}/>
        </div>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:T.text3,marginBottom:4,display:'block'}}>Commentaire sur la vente</label>
          <textarea value={contractForm.comment||''} onChange={e=>setContractForm(p=>({...p,comment:e.target.value}))} placeholder="Décrivez la vente, le contexte, les besoins du client..." rows={3} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1.5px solid ${T.border}`,background:T.bg,fontSize:13,fontFamily:'inherit',color:T.text,outline:'none',resize:'vertical'}}/>
        </div>
      </div>
      <div style={{display:'flex',gap:8,marginTop:20,justifyContent:'flex-end'}}>
        <Btn onClick={()=>{
          handlePipelineStageChange(contractModal.contactId, 'client_valide', contractModal.note||'', {amount:0,number:'',date:''});
          setContractModal(null);
        }}>Passer sans contrat</Btn>
        <Btn primary onClick={()=>{
          const amt = parseFloat(contractForm.amount) || 0;
          if(!amt || amt <= 0) { showNotif('Le montant du contrat est obligatoire','danger'); return; }
          handlePipelineStageChange(contractModal.contactId, 'client_valide', contractModal.note||'', {amount:amt, number:contractForm.number.trim(), date:contractForm.date});
          setContractModal(null);
          showNotif(`Contrat validé — ${amt.toLocaleString('fr-FR')} €`);
        }}><I n="check" s={14}/> Valider le contrat</Btn>
      </div>
    </Modal>
  );
};

export default ContractModal;
