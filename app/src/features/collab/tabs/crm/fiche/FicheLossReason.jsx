// FicheLossReason — V1.10.4-r11.0.27.d Phase 4
// Champ texte libre "Pourquoi perdu ?" affiché dans la fiche contact onglet Infos
// UNIQUEMENT si pipeline_stage === 'perdu'. Pattern aligné FicheNotes :
//   - textarea autosize (minHeight 70, maxHeight 140, resize vertical)
//   - debounce 800ms via ref local (indépendant de collabNotesTimerRef)
//   - sync setSelectedCrmContact + setContacts + _T.crmSync + PUT API
// Backend : safeUpdate (database.js) reconnaît la colonne loss_reason automatiquement
// après ALTER TABLE + PM2 restart (cache _tableColumnsCache rebuilt).

import React, { useRef } from "react";
import { T } from "../../../../../theme";
import { api } from "../../../../../shared/services/api";
import { _T } from "../../../../../shared/state/tabState";
import { useCollabContext } from "../../../context/CollabContext";

const FicheLossReason = ({ ct }) => {
  const {
    company,
    setSelectedCrmContact, setContacts,
  } = useCollabContext();

  const timerRef = useRef(null);

  // Affichage conditionnel — uniquement pour les contacts perdus.
  if (!ct || ct.pipeline_stage !== 'perdu') return null;

  return (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
        <span style={{fontSize:11,fontWeight:700,color:'#991B1B',display:'inline-flex',alignItems:'center',gap:4}}>
          ❌ Pourquoi perdu ?
        </span>
        <span style={{fontSize:10,color:T.text3,fontStyle:'italic'}}>optionnel</span>
      </div>
      <textarea
        value={ct.loss_reason || ""}
        onChange={e => {
          const v = e.target.value;
          setSelectedCrmContact(p => p ? ({ ...p, loss_reason: v }) : p);
          setContacts(p => (p || []).map(c => c.id === ct.id ? { ...c, loss_reason: v } : c));
          _T.crmSync?.({ loss_reason: v });
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(
            () => api(`/api/data/contacts/${ct.id}`, { method: "PUT", body: { loss_reason: v, companyId: company?.id } }),
            800
          );
        }}
        placeholder="Pas intéressé · Mauvais timing · Déjà équipé · Budget · Faux lead · Concurrent · Autre raison…"
        style={{
          width: "100%",
          minHeight: 60,
          maxHeight: 140,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: 10,
          fontSize: 12,
          fontFamily: "inherit",
          resize: "vertical",
          background: '#FEF2F2',
          color: T.text,
          outline: "none",
        }}
        onFocus={e => { e.target.style.borderColor = '#EF4444'; e.target.style.background = '#fff'; }}
        onBlur={e => { e.target.style.borderColor = T.border; e.target.style.background = '#FEF2F2'; }}
      />
      <p style={{fontSize:10,color:T.text3,marginTop:4}}>Sauvegarde automatique · Visible uniquement quand le contact est en "Perdu"</p>
    </div>
  );
};

export default FicheLossReason;
