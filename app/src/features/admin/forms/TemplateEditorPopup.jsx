import React, { useState } from "react";
import { T } from "../../../theme";
import { I, Btn } from "../../../shared/ui";
import { DEFAULT_TEMPLATES, TEMPLATE_VARS, applyTemplatePreview } from "../data/templates";

const TemplateEditorPopup = ({ channel, confirmText, reminderText, onSave, onClose, initialTab }) => {
  const [tab, setTab] = useState(initialTab || 'confirm');
  const channelLabel = channel === 'sms' ? 'SMS' : 'WhatsApp Business';
  const defaultConfirm = channel === 'sms' ? DEFAULT_TEMPLATES.confirmSms : DEFAULT_TEMPLATES.confirmWhatsapp;
  const defaultReminder = channel === 'sms' ? DEFAULT_TEMPLATES.reminderSms : DEFAULT_TEMPLATES.reminderWhatsapp;
  const [draftConfirm, setDraftConfirm] = useState(confirmText || '');
  const [draftReminder, setDraftReminder] = useState(reminderText || '');
  const textRef = useRef(null);
  const currentDraft = tab === 'confirm' ? draftConfirm : draftReminder;
  const setCurrentDraft = tab === 'confirm' ? setDraftConfirm : setDraftReminder;
  const currentDefault = tab === 'confirm' ? defaultConfirm : defaultReminder;
  const displayText = currentDraft || currentDefault;
  const preview = applyTemplatePreview(displayText);

  const insertVar = (varKey) => {
    const ta = textRef.current;
    if (!ta) { setCurrentDraft((currentDraft || currentDefault) + varKey); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const base = currentDraft || currentDefault;
    const newText = base.substring(0, start) + varKey + base.substring(end);
    setCurrentDraft(newText);
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + varKey.length; ta.focus(); }, 0);
  };

  return (
    <div onClick={onClose} style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:T.card, borderRadius:16, width:520, maxWidth:'100%', maxHeight:'85vh', overflow:'auto', padding:24, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontSize:16, fontWeight:700, margin:0 }}>Modifier le texte — {channelLabel}</h3>
          <span onClick={onClose} style={{ cursor:'pointer', color:T.text3, padding:4 }}><I n="x" s={18}/></span>
        </div>
        <div style={{ display:'flex', gap:4, marginBottom:16 }}>
          {[{k:'confirm',l:'✅ Confirmation'},{k:'reminder',l:'🔔 Rappel'}].map(t=>(
            <div key={t.k} onClick={()=>setTab(t.k)} style={{ flex:1, padding:'8px 0', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:600, background:tab===t.k?T.accent:'transparent', color:tab===t.k?'#fff':T.text2, border:`1px solid ${tab===t.k?T.accent:T.border}` }}>{t.l}</div>
          ))}
        </div>
        <textarea ref={textRef} value={displayText} onChange={e=>setCurrentDraft(e.target.value)} style={{ width:'100%', boxSizing:'border-box', minHeight:150, padding:12, borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, fontSize:12, color:T.text, fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.5 }}/>
        <div style={{ marginTop:8, marginBottom:12 }}>
          <div style={{ fontSize:10, fontWeight:600, color:T.text2, marginBottom:4 }}>Variables disponibles :</div>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {TEMPLATE_VARS.map(v=>(
              <span key={v.key} onClick={()=>insertVar(v.key)} style={{ padding:'2px 7px', borderRadius:5, background:T.accentBg, color:T.accent, fontSize:10, fontWeight:600, cursor:'pointer', border:`1px solid ${T.accentBorder}` }}>{v.key}</span>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, fontWeight:600, color:T.text2, marginBottom:4 }}>Aperçu :</div>
          <div style={{ padding:10, borderRadius:8, background:T.bg, border:`1px solid ${T.border}`, fontSize:11, color:T.text, whiteSpace:'pre-wrap', lineHeight:1.5, maxHeight:140, overflow:'auto' }}>{preview}</div>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'space-between' }}>
          <Btn onClick={()=>setCurrentDraft('')} style={{ fontSize:11 }}><I n="rotate-ccw" s={11}/> Défaut</Btn>
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={onClose}>Annuler</Btn>
            <Btn primary onClick={()=>{onSave(draftConfirm,draftReminder);onClose();}}><I n="check" s={12}/> Enregistrer</Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateEditorPopup;
