// P0 Step 1 — Re-apply V7 base (states, handler, CRM button, modal, CRM badges)
const fs = require("fs");
const file = "/var/www/planora/app/src/App.jsx";
let code = fs.readFileSync(file, "utf8");

// ── A. V7 State declarations — after pipelineRdvForm useState ──
const stateTarget = "pipelineRdvForm, setPipelineRdvForm";
const stateIdx = code.indexOf(stateTarget);
if (stateIdx === -1) { console.error("ERROR: pipelineRdvForm not found"); process.exit(1); }
const stateLineEnd = code.indexOf("\n", stateIdx);

const v7States = `

  // ── V7 Transfer State ──
  const [v7TransferModal, setV7TransferModal] = useState(null);
  const [v7TransferTarget, setV7TransferTarget] = useState('');
  const [v7TransferLoading, setV7TransferLoading] = useState(false);
  const [v7FollowersMap, setV7FollowersMap] = useState({});
  const v7FollowersLoadedRef = useRef(false);

  // ── V7: Load followers batch for badges ──
  useEffect(() => {
    if (!company?.id || v7FollowersLoadedRef.current) return;
    v7FollowersLoadedRef.current = true;
    api('/api/transfer/followers-batch').then(r => {
      if (r && typeof r === 'object' && !r.error) setV7FollowersMap(r);
    }).catch(() => {});
  }, [company?.id]);

  // ── V7: Transfer handler ──
  const handleV7Transfer = async () => {
    if (!v7TransferModal?.contact?.id || !v7TransferTarget) return;
    setV7TransferLoading(true);
    try {
      const r = await api('/api/transfer/executor/' + v7TransferModal.contact.id, {
        method: 'PUT',
        body: { executorCollabId: v7TransferTarget }
      });
      if (r?.success) {
        showNotif(r.message || 'Contact transféré', 'success');
        const updated = await api('/api/data/contacts?companyId=' + company.id + '&collaboratorId=' + collab.id);
        if (updated?.contacts) setContacts(updated.contacts);
        v7FollowersLoadedRef.current = false;
        const fm = await api('/api/transfer/followers-batch');
        if (fm && typeof fm === 'object' && !fm.error) setV7FollowersMap(fm);
        setV7TransferModal(null);
        setV7TransferTarget('');
      } else {
        showNotif(r?.error || 'Erreur lors du transfert', 'danger');
      }
    } catch (e) {
      showNotif('Erreur réseau', 'danger');
    }
    setV7TransferLoading(false);
  };`;

code = code.slice(0, stateLineEnd + 1) + v7States + code.slice(stateLineEnd + 1);
console.log("V7 states + handler added");

// ── B. Transfer button on CRM Kanban (after Notes button) ──
const notesBtn = `n="edit-3" s={9}/> Notes</div>`;
const notesBtnIdx = code.indexOf(notesBtn);
if (notesBtnIdx !== -1) {
  const notesLineEnd = code.indexOf("\n", notesBtnIdx);
  const crmTransferBtn = `
                              <div onClick={e=>{e.stopPropagation();setV7TransferModal({contact:ct,fromPipeline:true});setV7TransferTarget('');}} style={{flex:'1 1 28%',padding:'3px 0',borderRadius:8,fontSize:10,fontWeight:600,cursor:'pointer',background:'#8B5CF618',color:'#8B5CF6',textAlign:'center',border:'1px solid #8B5CF630'}} title='Transférer à un collègue'>Transférer</div>`;
  code = code.slice(0, notesLineEnd) + crmTransferBtn + code.slice(notesLineEnd);
  console.log("CRM kanban transfer button added");
}

// ── C. V7 Transfer Modal (before collabChatFloating) ──
const chatFloat = "collabChatFloating";
const chatFloatIdx = code.indexOf(chatFloat);
if (chatFloatIdx !== -1) {
  const chatFloatLineStart = code.lastIndexOf("\n", chatFloatIdx);
  const modalCode = `
            {/* V7 TRANSFER MODAL */}
            {v7TransferModal && (
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
            )}
`;
  code = code.slice(0, chatFloatLineStart) + modalCode + code.slice(chatFloatLineStart);
  console.log("V7 transfer modal added");
}

// ── D. CRM Kanban executor/source badges (after Partagé badge) ──
const sharedBadge = `Partagé</span>`;
const sharedIdx = code.indexOf(sharedBadge);
if (sharedIdx !== -1) {
  const sharedLineEnd = code.indexOf("\n", sharedIdx);
  const badgeCode = `
                                  {v7FollowersMap[ct.id]?.executor && v7FollowersMap[ct.id].executor.collaboratorId !== collab.id && <span style={{padding:'1px 5px',borderRadius:8,fontSize:8,fontWeight:700,background:'#8B5CF618',color:'#8B5CF6',flexShrink:0}} title={'Chez '+v7FollowersMap[ct.id].executor.collaboratorName}>Chez {(v7FollowersMap[ct.id].executor.collaboratorName||'').split(' ')[0]}</span>}`;
  code = code.slice(0, sharedLineEnd) + badgeCode + code.slice(sharedLineEnd);
  console.log("CRM kanban badges added");
}

fs.writeFileSync(file, code);
console.log("Step 1 — V7 base complete");
