// NrpPostCallModal — extraction S2.9 depuis CollabPortal.jsx L3742-3878
// Responsabilité : modal popup après un appel qui doit qualifier le résultat en
// mode "post-call NRP". Déclenché automatiquement par startVoipCall dans
// CollabPortal L1892-1894 après raccroché, avec shape :
//   { contact, nrpCount, followups, isShortCall, duration, isNrp }
//
// Flow métier :
//   - "Oui, il a répondu" → ouvre panel de choix stage → handlePipelineStageChange
//     vers le stage choisi + note adaptée (avec/sans mention des NRP précédents)
//   - "Toujours NRP / Pas de réponse" :
//     * si m.isNrp : incrémente nrp_followups_json avec nouvelle tentative #N+1
//       (persisté via handleCollabUpdateContact + pipeline-history logged)
//     * sinon : handlePipelineStageChange(contact, 'nrp', ...) (short call fallback)
//   - Historique NRP (si isNrp && done>0) : accordéon, afficher toutes tentatives
//
// Aucune modification de logique métier. Les 3 états (`nrpPostCallModal`,
// `nrpModalShowStages`, `nrpModalShowHistory`) restent owned par CollabPortal
// — `startVoipCall` L1892-1894 continue à les setter directement pour ouvrir
// le modal avec un reset propre des toggles UI.

import React from "react";
import { T } from "../../../theme";
import { I } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

const NrpPostCallModal = () => {
  const {
    nrpPostCallModal, setNrpPostCallModal,
    nrpModalShowStages, setNrpModalShowStages,
    nrpModalShowHistory, setNrpModalShowHistory,
    pipelineStages,
    handleCollabUpdateContact,
    handlePipelineStageChange,
    collab, company,
    showNotif,
  } = useCollabContext();

  if (!nrpPostCallModal) return null;

  const m = nrpPostCallModal;
  const ct = m.contact;
  const stages = (pipelineStages||[]).filter(s => s.id !== 'nrp' && s.id !== 'perdu');
  const nrpDoneCount = m.followups.filter(f=>f.done).length;

  const handleStillNrp = () => {
    if (m.isNrp) {
      // Increment NRP counter
      const newFollowup = { date: new Date().toISOString(), done: true, note: 'Tentative appel #' + (nrpDoneCount+1) + ' — pas de reponse' };
      const updated = [...m.followups, newFollowup];
      handleCollabUpdateContact(ct.id, { nrp_followups_json: JSON.stringify(updated) });
      api('/api/data/pipeline-history', { method:'POST', body:{ contactId:ct.id, companyId:company?.id, fromStage:'nrp', toStage:'nrp', userId:collab.id, userName:collab.name, note:'Tentative appel #'+(nrpDoneCount+1)+' — NRP (pas de reponse)' }});
      showNotif(ct.name + ' — NRP #' + (nrpDoneCount+1) + ' enregistre', 'warning');
    } else {
      // Short call → move to NRP
      handlePipelineStageChange(ct.id, 'nrp', 'Appel sans reponse (' + m.duration + 's)');
      showNotif(ct.name + ' passe en NRP');
    }
    setNrpPostCallModal(null);
  };

  const handleAnswered = (stageId) => {
    const note = m.isNrp ? 'A repondu apres ' + (nrpDoneCount+1) + ' tentatives NRP' : 'A repondu';
    handlePipelineStageChange(ct.id, stageId, note);
    const stageLabel = (pipelineStages||[]).find(s=>s.id===stageId)?.label || stageId;
    showNotif(ct.name + ' → ' + stageLabel + ' ✅');
    setNrpPostCallModal(null);
  };

  const nrpHistory = m.followups.filter(f=>f.done).slice().reverse();
  const maxNrp = 20;
  const progress = Math.min(nrpDoneCount / maxNrp * 100, 100);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:10000, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', animation:'fadeInScale .2s ease' }}>
      <div style={{ background:T.card||'#fff', borderRadius:20, width:420, maxHeight:'85vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', animation:'fadeInScale .3s ease' }}>
        {/* Header */}
        <div style={{ padding:'24px 24px 16px', background:'linear-gradient(135deg, #1E293B, #0F172A)', borderRadius:'20px 20px 0 0', color:'#fff' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
            <div style={{ width:44, height:44, borderRadius:14, background:'#EF444420', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <I n="phone-off" s={22} color="#EF4444"/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:16, fontWeight:700 }}>Appel termine</div>
              <div style={{ fontSize:13, color:'#94A3B8' }}>{ct.name || 'Contact'}{m.duration ? ' · '+m.duration+'s' : ''}</div>
            </div>
            <div onClick={()=>setNrpPostCallModal(null)} style={{ cursor:'pointer', padding:4, borderRadius:8, background:'#ffffff10' }}><I n="x" s={18} color="#94A3B8"/></div>
          </div>

          {m.isNrp && <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ fontSize:28, fontWeight:800, color:'#EF4444' }}>{nrpDoneCount}</span>
              <span style={{ fontSize:12, color:'#94A3B8' }}>tentative{nrpDoneCount>1?'s':''} NRP</span>
            </div>
            <div style={{ height:6, borderRadius:3, background:'#1E293B', overflow:'hidden' }}>
              <div style={{ height:'100%', borderRadius:3, width:progress+'%', background: progress > 75 ? '#EF4444' : progress > 50 ? '#F59E0B' : '#3B82F6', transition:'width .5s ease' }}/>
            </div>
          </div>}

          {m.isShortCall && <div style={{ padding:'8px 12px', borderRadius:10, background:'#F59E0B15', border:'1px solid #F59E0B30', marginTop:4 }}>
            <div style={{ fontSize:12, color:'#F59E0B', fontWeight:600 }}>⚡ Appel tres court ({m.duration}s) — pas de reponse ?</div>
          </div>}
        </div>

        {/* Body */}
        <div style={{ padding:'20px 24px' }}>
          <div style={{ fontSize:14, fontWeight:600, color:T.text, marginBottom:16 }}>
            {m.isNrp ? 'Le contact a-t-il repondu ?' : 'Que s\'est-il passe ?'}
          </div>

          {/* Option 1: Il a repondu */}
          <div style={{ marginBottom:12 }}>
            <div onClick={()=>setNrpModalShowStages(!nrpModalShowStages)} style={{ padding:'14px 16px', borderRadius:12, border:'2px solid #22C55E40', background:'#22C55E08', cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'all .15s ease' }}>
              <div style={{ width:32, height:32, borderRadius:10, background:'#22C55E15', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <I n="check-circle" s={18} color="#22C55E"/>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#22C55E' }}>Oui, il a repondu !</div>
                <div style={{ fontSize:11, color:T.text3 }}>Choisir un nouveau statut</div>
              </div>
              <I n={nrpModalShowStages?'chevron-up':'chevron-down'} s={16} color={T.text3}/>
            </div>

            {nrpModalShowStages && <div style={{ padding:'10px 8px', display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
              {stages.map(s => (
                <div key={s.id} onClick={()=>handleAnswered(s.id)} style={{ padding:'8px 16px', borderRadius:10, background:(s.color||'#3B82F6')+'15', border:'1px solid '+(s.color||'#3B82F6')+'30', color:s.color||'#3B82F6', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s ease' }}>
                  {s.label}
                </div>
              ))}
            </div>}
          </div>

          {/* Option 2: Toujours NRP */}
          <div onClick={handleStillNrp} style={{ padding:'14px 16px', borderRadius:12, border:'2px solid #EF444440', background:'#EF444408', cursor:'pointer', display:'flex', alignItems:'center', gap:10, marginBottom:16, transition:'all .15s ease' }}>
            <div style={{ width:32, height:32, borderRadius:10, background:'#EF444415', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <I n="phone-missed" s={18} color="#EF4444"/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#EF4444' }}>
                {m.isNrp ? 'Toujours pas repondu' : 'Pas de reponse — passer en NRP'}
              </div>
              <div style={{ fontSize:11, color:T.text3 }}>
                {m.isNrp ? 'NRP #'+(nrpDoneCount+1)+' sera enregistre' : 'Le contact sera mis en NRP'}
              </div>
            </div>
            {m.isNrp && <span style={{ background:'#EF4444', color:'#fff', fontSize:11, fontWeight:800, padding:'3px 10px', borderRadius:8 }}>#{nrpDoneCount+1}</span>}
          </div>

          {/* Historique NRP */}
          {m.isNrp && nrpHistory.length > 0 && <div>
            <div onClick={()=>setNrpModalShowHistory(!nrpModalShowHistory)} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', padding:'8px 0', borderTop:'1px solid '+T.border }}>
              <I n="clock" s={13} color={T.text3}/>
              <span style={{ fontSize:11, fontWeight:700, color:T.text3, flex:1 }}>Historique NRP ({nrpHistory.length} tentative{nrpHistory.length>1?'s':''})</span>
              <I n={nrpModalShowHistory?'chevron-up':'chevron-down'} s={14} color={T.text3}/>
            </div>

            {nrpModalShowHistory && <div style={{ maxHeight:200, overflow:'auto', paddingTop:8 }}>
              {nrpHistory.map((f, i) => {
                const d = f.date ? new Date(f.date) : null;
                return <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', marginBottom:4, borderRadius:8, background:'#EF444406', border:'1px solid #EF444410' }}>
                  <div style={{ width:22, height:22, borderRadius:7, background:'#EF444415', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#EF4444' }}>
                    {nrpHistory.length - i}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:T.text }}>{f.note || 'NRP #'+(nrpHistory.length-i)}</div>
                    {d && <div style={{ fontSize:10, color:T.text3 }}>{d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})} a {d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>}
                  </div>
                  <I n="phone-missed" s={12} color="#EF4444"/>
                </div>;
              })}
            </div>}
          </div>}
        </div>
      </div>
    </div>
  );
};

export default NrpPostCallModal;
