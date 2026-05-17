// V1.10.4-r11.0.27.a — Phase 1 SAFE : mini-chooser "Contact établi".
// Remplace toute justification par 3 actions rapides quand un contact entre dans 'contacte' :
//   📅 Programmer un RDV → finalize move + chain vers handlePipelineStageChange('rdv_programme')
//                          (réutilise ScheduleRdvModal existant — zéro nouveau flow)
//   🔔 Créer un rappel   → Phase 1 = placeholder (move + showNotif). Phase 2 (r11.0.27.b)
//                          ajoutera le ReminderChooser + bookings type='reminder'.
//   ✅ Aucun suivi       → finalize move vers 'contacte' seul (pas d'action additionnelle)
//
// Style aligné PerduMotifModal (PhoneTab.jsx L9205) pour cohérence premium :
// backdrop blur(6px) rgba(0,0,0,0.7), carte 460px borderRadius 20, 3 options verticales.
// Tous les symboles consommés viennent de CollabContext (règle §0bis).

import React from "react";
import { I } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const ContacteChooser = () => {
  const {
    contacteChooser,
    setContacteChooser,
    _contacteChooserSkipRef,
    handlePipelineStageChange,
    contacts,
    showNotif,
    setReminderChooser, // r11.0.27.b — déclenche le ReminderChooser après finalize move
    setPreviousChooser, // r11.0.27.b.1 — trace l'origine pour activer ← Retour dans les modals suivants
  } = useCollabContext();

  if (!contacteChooser) return null;

  const contactId = contacteChooser.contactId;
  const contact = (contacts || []).find(c => c.id === contactId);
  const contactName = contact?.name
    || (((contact?.firstname || '') + ' ' + (contact?.lastname || '')).trim())
    || 'ce contact';

  // Pose le skip-flag puis re-call handlePipelineStageChange pour finalize le move vers 'contacte'.
  // Le skip-flag est consommé (delete) à l'intérieur du hub dès qu'il est lu, donc une seule passe.
  const _finalizeContacteMove = () => {
    if (_contacteChooserSkipRef && _contacteChooserSkipRef.current) {
      _contacteChooserSkipRef.current[contactId] = true;
    }
    handlePipelineStageChange(contactId, 'contacte', '');
  };

  const onScheduleRdv = () => {
    // r11.0.27.b.1 — trace l'origine AVANT chain pour activer "← Retour aux choix" dans ScheduleRdvModal.
    if (typeof setPreviousChooser === 'function') setPreviousChooser({ type: 'contacte', contactId });
    setContacteChooser(null);
    _finalizeContacteMove();
    // setTimeout(0) → laisser React batcher le premier update avant d'enchaîner.
    // Le 2nd appel rentre dans le path rdv_programme existant qui ouvre ScheduleRdvModal.
    setTimeout(() => handlePipelineStageChange(contactId, 'rdv_programme', ''), 0);
  };

  const onCreateReminder = () => {
    // r11.0.27.b Phase 2 LIVE : finalize move + ouvre ReminderChooser (5 presets + custom datetime + note).
    // r11.0.27.b.1 — trace l'origine AVANT pour activer "← Retour aux choix" dans ReminderChooser.
    if (typeof setPreviousChooser === 'function') setPreviousChooser({ type: 'contacte', contactId });
    setContacteChooser(null);
    _finalizeContacteMove();
    if (typeof setReminderChooser === 'function') {
      setReminderChooser({ contactId });
    } else if (typeof showNotif === 'function') {
      // Fallback défensif si le context n'expose pas setReminderChooser (jamais en prod r11.0.27.b+).
      showNotif("🔔 Reminder system indisponible — context manquant", 'danger');
    }
  };

  const onNoFollowup = () => {
    setContacteChooser(null);
    _finalizeContacteMove();
  };

  // Annuler = ferme le chooser sans bouger le contact (reste dans fromStage).
  const onCancel = () => setContacteChooser(null);

  const options = [
    {
      id: 'rdv',
      icon: 'calendar',
      iconColor: '#3B82F6',
      iconBg: '#3B82F615',
      label: 'Programmer un RDV',
      hint: 'Ouvrir le sélecteur de créneaux maintenant',
      action: onScheduleRdv,
    },
    {
      id: 'reminder',
      icon: 'bell',
      iconColor: '#F59E0B',
      iconBg: '#F59E0B15',
      label: 'Créer un rappel',
      hint: 'Rappel léger avec note · 15min par défaut',
      action: onCreateReminder,
    },
    {
      id: 'none',
      icon: 'check-circle',
      iconColor: '#10B981',
      iconBg: '#10B98115',
      label: 'Aucun suivi pour le moment',
      hint: 'Valider le déplacement sans action additionnelle',
      action: onNoFollowup,
    },
  ];

  return (
    <div
      onClick={onCancel}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:10001, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(6px)', padding:16, boxSizing:'border-box' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:460, borderRadius:20, background:'#fff', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:24, boxSizing:'border-box' }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'#3B82F615', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <I n="check-circle" s={22} style={{ color:'#3B82F6' }} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:17, fontWeight:800, color:'#1F2937' }}>Contact établi — et maintenant ?</div>
            <div style={{ fontSize:11, color:'#6B7280', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{contactName}</div>
          </div>
          <div onClick={onCancel} title="Annuler — aucun changement pipeline" style={{ cursor:'pointer', padding:6, borderRadius:8, background:'#F3F4F6' }}>
            <I n="x" s={16} />
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {options.map(o => (
            <div
              key={o.id}
              onClick={o.action}
              style={{
                padding:'12px 14px',
                borderRadius:12,
                border:'1.5px solid #E5E7EB',
                background:'#F9FAFB',
                cursor:'pointer',
                transition:'all .15s',
                display:'flex',
                alignItems:'center',
                gap:12,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = o.iconColor; e.currentTarget.style.background = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#F9FAFB'; }}
            >
              <div style={{ width:38, height:38, borderRadius:10, background:o.iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <I n={o.icon} s={18} style={{ color:o.iconColor }} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#1F2937' }}>{o.label}</div>
                <div style={{ fontSize:11, color:'#6B7280', marginTop:1 }}>{o.hint}</div>
              </div>
              {o._phase2 && (
                <div style={{ fontSize:9, fontWeight:800, color:'#F59E0B', background:'#F59E0B15', padding:'3px 7px', borderRadius:6, whiteSpace:'nowrap', letterSpacing:0.3 }}>
                  PHASE 2
                </div>
              )}
              <I n="chevron-right" s={14} style={{ color:'#9CA3AF', flexShrink:0 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ContacteChooser;
