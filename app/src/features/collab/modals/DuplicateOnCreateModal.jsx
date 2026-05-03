// DuplicateOnCreateModal — V1.13.1.c
// Modal anti-doublon a la creation de contact (refactor V1.13.1).
// Triggered depuis NewContactModal flow apres pre-check
// /api/data/contacts/check-duplicate-single retournant exists=true.
//
// Architecture V1.13.1.c :
//   - Cards via DuplicateMatchCard (sous-composant V1.13.1.b)
//   - Footer admin/supra only avec raison structuree + justification
//   - Plus de boutons "Voir/Modifier la fiche" externes (UX in-modal pure)
//   - "Voir details" inline expand dans MatchCard (V1.13.1.b)
//
// Aucune fusion automatique, aucun ecrasement, aucune action sans confirmation.
// Snapshot du formulaire vit dans data.pendingNewContact._formSnapshot (state parent).
//
// Props :
//   data         : { matches, conflict, pendingNewContact: { name, email, phone, _formSnapshot } }
//   onClose      : callback fermeture (parent re-ouvre NewContactModal V1.13.0-modal-stacking-fix)
//   onForceCreate: (reason, justification) => void  — admin/supra only

import React, { useState } from "react";
import { T } from "../../../theme";
import { I, Btn, Modal } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";
import DuplicateMatchCard from "./DuplicateMatchCard";

const FORCE_REASONS = [
  { v: 'real_second_person', l: 'Vraie 2e personne (homonyme, famille…)' },
  { v: 'test_data',          l: 'Données de test' },
  { v: 'data_correction',    l: 'Correction de données' },
  { v: 'other',              l: 'Autre' },
];

const DuplicateOnCreateModal = ({ data, onClose, onForceCreate, onEnrich, onShare, onArchive, onHardDelete, onCreateMyOwn, onDelete }) => {
  const { collab, contacts } = useCollabContext();
  const [forceCreateMode, setForceCreateMode] = useState(false);
  const [forceReason, setForceReason] = useState('');
  const [forceJustification, setForceJustification] = useState('');

  if (!data) return null;
  const { matches = [], conflict = false, pendingNewContact = {} } = data;

  const isAdmin = collab?.role === 'admin' || collab?.role === 'supra';
  const snap = pendingNewContact._formSnapshot || pendingNewContact;
  const justifLen = forceJustification.trim().length;
  const canConfirmForce = !!forceReason && justifLen >= 10;

  // Lookup fullTarget depuis contacts state local (enrichit les diffs MatchCard)
  const findFullTarget = (matchId) => (contacts || []).find(c => c.id === matchId) || null;

  const handleConfirmForce = () => {
    if (!canConfirmForce) return;
    const reasonLabel = FORCE_REASONS.find(r => r.v === forceReason)?.l || forceReason;
    const msg = `Confirmer la création forcée de "${pendingNewContact.name}" ?\n\n` +
      `Raison : ${reasonLabel}\n` +
      `Justification : ${forceJustification.trim()}\n\n` +
      `Cette action sera audit-loggée et tracée.`;
    if (!window.confirm(msg)) return;
    onForceCreate?.(forceReason, forceJustification.trim());
  };

  const handleResetForce = () => {
    setForceCreateMode(false);
    setForceReason('');
    setForceJustification('');
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={conflict ? "⚠️ Conflit doublon" : (matches.length > 1 ? "Plusieurs contacts existent" : "Contact déjà existant")}
      width={640}
    >
      {/* Zone 1 — Vous saisissez */}
      <div style={{ padding:'10px 14px', borderRadius:10, background:T.bg, border:`1px solid ${T.border}`, marginBottom:14 }}>
        <div style={{ fontSize:10, fontWeight:700, color:T.text3, textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>Vous saisissez</div>
        <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{pendingNewContact.name || '(sans nom)'}</div>
        <div style={{ fontSize:11, color:T.text3, marginTop:2, display:'flex', gap:10, flexWrap:'wrap' }}>
          {pendingNewContact.email && <span><I n="mail" s={11}/> {pendingNewContact.email}</span>}
          {pendingNewContact.phone && <span><I n="phone" s={11}/> {pendingNewContact.phone}</span>}
          {snap.firstname && <span><I n="user" s={11}/> {snap.firstname} {snap.lastname || ''}</span>}
          {snap.company && <span><I n="building-2" s={11}/> {snap.company}</span>}
          {snap.address && <span><I n="map-pin" s={11}/> {String(snap.address).slice(0, 40)}</span>}
        </div>
      </div>

      {/* Conflit banner */}
      {conflict && (
        <div style={{ padding:'8px 12px', borderRadius:8, background:'#F59E0B18', border:'1px solid #F59E0B', marginBottom:12, fontSize:11, color:'#92400E' }}>
          ⚠️ L'email correspond à un contact, le téléphone à un autre. Choisissez avec attention.
        </div>
      )}

      {/* Zone 2 — Liste matches via DuplicateMatchCard */}
      <div style={{ display:'flex', flexDirection:'column', marginBottom:16 }}>
        {matches.map(m => (
          <DuplicateMatchCard
            key={m.id}
            match={m}
            fullTarget={findFullTarget(m.id)}
            pendingContact={snap}
            collab={collab}
            // V1.13.1.d : actions wirees via callbacks parent (CollabPortal handlers)
            // V1.13.1.e : + onCreateMyOwn pour cas owner etranger (scope collab)
            onEnrich={onEnrich}
            onShare={onShare}
            onArchive={onArchive}
            onHardDelete={onHardDelete}
            onCreateMyOwn={onCreateMyOwn}
            // V1.13.2.a — Soft delete in-modal (owner). Merge depuis ce flow non branche
            // (la fiche brouillon n'existe pas encore en DB). Vrai merge reserve V1.13.2.b CRM tab.
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Footer compact (default) */}
      {!forceCreateMode && (
        <div style={{ display:'flex', gap:8, paddingTop:14, borderTop:`1px solid ${T.border}` }}>
          <Btn small onClick={onClose} style={{ flex:1, justifyContent:'center' }}>Annuler</Btn>
          {isAdmin && (
            <Btn small onClick={() => setForceCreateMode(true)} style={{ flex:1, justifyContent:'center', color:'#DC2626', borderColor:'#DC262640' }}>
              <I n="user-plus" s={12}/> Créer quand même…
            </Btn>
          )}
        </div>
      )}

      {/* Footer expanded — admin/supra justif (Q3+Q8) */}
      {forceCreateMode && (
        <div style={{ paddingTop:14, borderTop:`1px solid ${T.border}` }}>
          <div style={{ padding:14, borderRadius:10, background:'#DC262608', border:'1.5px solid #DC2626', marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#DC2626', marginBottom:10 }}>
              <I n="alert-triangle" s={13}/> Création forcée — admin uniquement
            </div>

            {/* Raison structurée */}
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:700, color:T.text2, display:'block', marginBottom:6 }}>Raison * (obligatoire)</label>
              {FORCE_REASONS.map(r => (
                <label key={r.v} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderRadius:6, cursor:'pointer', background:forceReason===r.v?'#DC262618':'transparent', marginBottom:3, fontSize:12, color:T.text }}>
                  <input
                    type="radio"
                    name="forceReason"
                    value={r.v}
                    checked={forceReason===r.v}
                    onChange={e => setForceReason(e.target.value)}
                    style={{ accentColor:'#DC2626' }}
                  />
                  {r.l}
                </label>
              ))}
            </div>

            {/* Justification textarea */}
            <div style={{ marginBottom:6 }}>
              <label style={{ fontSize:11, fontWeight:700, color:T.text2, display:'block', marginBottom:6 }}>
                Justification * (minimum 10 caractères)
              </label>
              <textarea
                value={forceJustification}
                onChange={e => setForceJustification(e.target.value)}
                placeholder="Expliquez pourquoi vous créez ce doublon (sera audité)…"
                rows={3}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:`1.5px solid ${justifLen>=10?'#22C55E':T.border}`, background:T.bg, color:T.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', resize:'vertical' }}
              />
              <div style={{ fontSize:10, color:justifLen>=10?'#16A34A':T.text3, marginTop:3, textAlign:'right' }}>
                {justifLen} / 10 caractères {justifLen>=10 ? '✓' : '— minimum requis'}
              </div>
            </div>
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <Btn small onClick={handleResetForce} style={{ flex:1, justifyContent:'center' }}>
              <I n="arrow-left" s={12}/> Retour
            </Btn>
            <Btn small onClick={handleConfirmForce} disabled={!canConfirmForce}
              style={{ flex:1, justifyContent:'center', color:'#fff', background:canConfirmForce?'#DC2626':'#DC262660', borderColor:'#DC2626', cursor:canConfirmForce?'pointer':'not-allowed' }}>
              <I n="check-circle" s={12}/> Confirmer création
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default DuplicateOnCreateModal;
