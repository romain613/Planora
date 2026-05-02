// DuplicateOnCreateModal — V1.13.0
// Modal anti-doublon a la creation de contact.
// Triggered depuis NewContactModal flow apres pre-check
// /api/data/contacts/check-duplicate-single retournant exists=true.
// 3 actions (per spec MH) : Voir fiche / Modifier fiche / Creer quand meme.
// Aucune fusion automatique, aucun ecrasement, aucune action sans confirmation.
// Snapshot du formulaire vit dans data.pendingNewContact._formSnapshot (state parent),
// pas de variable globale window.

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Modal, Avatar } from "../../../shared/ui";

const DuplicateOnCreateModal = ({ data, onClose, onViewExisting, onForceCreate }) => {
  if (!data) return null;
  const { matches = [], conflict = false, pendingNewContact = {} } = data;

  const _matchedByLabel = (m) =>
    m.matchedBy === 'email' ? { txt: 'Même email', icon: 'mail', color: '#2563EB' } :
    m.matchedBy === 'phone' ? { txt: 'Même téléphone', icon: 'phone', color: '#22C55E' } :
    { txt: '', icon: '', color: T.text3 };

  const _stageColor = (stage) => {
    const colors = { nouveau:'#3B82F6', contacte:'#8B5CF6', qualifie:'#F59E0B', rdv_programme:'#10B981', nrp:'#EF4444', client_valide:'#22C55E', perdu:'#64748B' };
    return colors[stage] || T.text3;
  };

  const _fmtDate = (iso) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric'}); } catch { return ''; }
  };

  const _handleForceCreate = () => {
    if (!window.confirm(`Créer un nouveau contact "${pendingNewContact.name}" malgré le doublon ?\n\nCela crée 2 contacts distincts. Ils pourront être fusionnés manuellement plus tard si besoin.`)) return;
    onForceCreate?.();
  };

  return (
    <Modal open={true} onClose={onClose} title={conflict ? "⚠️ Conflit doublon" : (matches.length > 1 ? "Plusieurs contacts existent" : "Contact déjà existant")} width={560}>
      {/* Bandeau "Vous saisissez" */}
      <div style={{ padding:'10px 14px', borderRadius:10, background:T.bg, border:`1px solid ${T.border}`, marginBottom:14 }}>
        <div style={{ fontSize:10, fontWeight:700, color:T.text3, textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>Vous saisissez</div>
        <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{pendingNewContact.name || '(sans nom)'}</div>
        <div style={{ fontSize:11, color:T.text3, marginTop:2, display:'flex', gap:10, flexWrap:'wrap' }}>
          {pendingNewContact.email && <span><I n="mail" s={11}/> {pendingNewContact.email}</span>}
          {pendingNewContact.phone && <span><I n="phone" s={11}/> {pendingNewContact.phone}</span>}
        </div>
      </div>

      {conflict && (
        <div style={{ padding:'8px 12px', borderRadius:8, background:'#F59E0B18', border:'1px solid #F59E0B', marginBottom:12, fontSize:11, color:'#92400E' }}>
          ⚠️ L'email correspond à un contact, le téléphone à un autre. Choisissez avec attention.
        </div>
      )}

      {/* Liste des matches */}
      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
        {matches.map(m => {
          const ml = _matchedByLabel(m);
          return (
            <div key={m.id} style={{ padding:14, borderRadius:12, border:`2px solid ${ml.color}40`, background:T.surface }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <Avatar name={m.name||'?'} color={ml.color} size={36}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:T.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name}</div>
                  <div style={{ fontSize:10, color:T.text3 }}>
                    {m.assignedName ? <span>👤 {m.assignedName}</span> : <span style={{color:'#F59E0B'}}>⚠ Sans propriétaire</span>}
                    {m.createdAt && <span> · Créé le {_fmtDate(m.createdAt)}</span>}
                  </div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, background:ml.color+'18', color:ml.color, whiteSpace:'nowrap' }}>
                  <I n={ml.icon} s={10}/> {ml.txt}
                </span>
              </div>
              <div style={{ fontSize:11, color:T.text3, display:'flex', gap:10, flexWrap:'wrap', marginBottom:8 }}>
                {m.email && <span><I n="mail" s={11}/> {m.email}</span>}
                {m.phone && <span><I n="phone" s={11}/> {m.phone}</span>}
                {m.pipelineStage && <span style={{color:_stageColor(m.pipelineStage), fontWeight:600}}>● {m.pipelineStage}</span>}
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <Btn small onClick={() => onViewExisting?.(m, 'view')} style={{ color:T.accent, borderColor:T.accent+'40' }}><I n="eye" s={12}/> Voir la fiche</Btn>
                <Btn small onClick={() => onViewExisting?.(m, 'edit')} style={{ color:'#F59E0B', borderColor:'#F59E0B40' }}><I n="edit-2" s={12}/> Modifier la fiche</Btn>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer 3ème action : Créer quand même */}
      <div style={{ display:'flex', gap:8, paddingTop:14, borderTop:`1px solid ${T.border}` }}>
        <Btn small onClick={onClose} style={{ flex:1, justifyContent:'center' }}>Annuler</Btn>
        <Btn small onClick={_handleForceCreate} style={{ flex:1, justifyContent:'center', color:'#fff', background:'#DC2626', borderColor:'#DC2626' }}>
          <I n="user-plus" s={12}/> Créer quand même
        </Btn>
      </div>
    </Modal>
  );
};

export default DuplicateOnCreateModal;
