// BulkSmsModal — extraction S1.1 (4/4) depuis CrmTab.jsx L553-575
// Responsabilite : envoi SMS groupe vers les contacts selectionnes du
//                  pipeline (variables {nom}/{prenom}/{phone} interpolees).
// Tous les symboles consommes viennent de CollabContext.

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Modal } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

const BulkSmsModal = () => {
  const {
    pipeBulkModal, setPipeBulkModal,
    pipeBulkSmsText, setPipeBulkSmsText,
    pipeSelectedIds, setPipeSelectedIds,
    contacts, company, collab, showNotif,
  } = useCollabContext();

  if (pipeBulkModal !== 'sms') return null;

  return (
    <Modal open={true} onClose={() => {setPipeBulkModal(null);setPipeBulkSmsText('');}} title="SMS groupé" width={480}>
      <div style={{marginBottom:12,fontSize:13,color:T.text2}}>{(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length} contact{(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length>1?'s':''} sélectionné{(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length>1?'s':''} · {(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).filter(id=>(contacts||[]).find(c=>c.id===id)?.phone).length} avec téléphone</div>
      <div style={{marginBottom:8,fontSize:11,color:T.text3}}>Variables : {'{nom}'}, {'{prenom}'}, {'{phone}'}</div>
      <textarea value={pipeBulkSmsText} onChange={e=>(typeof setPipeBulkSmsText==='function'?setPipeBulkSmsText:function(){})(e.target.value)} placeholder="Votre message SMS..." style={{width:'100%',minHeight:100,padding:12,borderRadius:10,border:`1px solid ${T.border}`,background:T.bg,color:T.text,fontSize:13,resize:'vertical',fontFamily:'inherit'}}/>
      <div style={{display:'flex',gap:8,marginTop:12}}>
        <Btn primary onClick={async()=>{
          if(!(typeof pipeBulkSmsText!=='undefined'?pipeBulkSmsText:{}).trim()){showNotif('Message vide','danger');return;}
          let sent=0,fail=0;
          for(const id of (typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:null)){
            const c=(contacts||[]).find(x=>x.id===id);
            if(!c?.phone) continue;
            const phone=c.phone.startsWith('+') ? c.phone : c.phone.startsWith('0') ? '+33'+c.phone.slice(1) : '+33'+c.phone;
            const msg=(typeof pipeBulkSmsText!=='undefined'?pipeBulkSmsText:{}).replace(/\{nom\}/g,c.name||'').replace(/\{prenom\}/g,c.firstName||c.name?.split(' ')[0]||'').replace(/\{phone\}/g,c.phone||'');
            try{const r=await api('/api/sms/send',{method:'POST',body:{to:phone,content:msg,companyId:company?.id,collabId:collab.id}});if(r?.success||r?.messageId)sent++;else fail++;}catch{fail++;}
          }
          showNotif(`${sent} SMS envoyé${sent>1?'s':''}`+(fail?` · ${fail} échec${fail>1?'s':''}`:''),'success');
          setPipeBulkModal(null);setPipeBulkSmsText('');setPipeSelectedIds([]);
        }}><I n="send" s={14}/> Envoyer</Btn>
        <Btn onClick={() => {setPipeBulkModal(null);setPipeBulkSmsText('');}}>Annuler</Btn>
      </div>
    </Modal>
  );
};

export default BulkSmsModal;
