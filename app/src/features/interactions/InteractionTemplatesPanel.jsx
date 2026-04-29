// V1.11 Phase 4 — Panneau Modèles d'interaction (Pipeline Live sub-tab Script)
// Source de vérité produit : docs/product-rules-interaction-templates-v1.md
// Composant autonome, pas de dépendance externe au-delà des helpers UI passés en props.
// V1 strict minimum : création rapide + saisie fluide + autosave 800ms.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../shared/services/api';

const TYPE_LABELS = { script: 'Script', questionnaire: 'Formulaire', checklist: 'Checklist' };
const TYPE_ICONS = { script: 'file-text', questionnaire: 'help-circle', checklist: 'check-square' };

const FIELD_TYPES = [
  { value: 'text', label: 'Texte court' },
  { value: 'textarea', label: 'Texte long' },
  { value: 'yesno', label: 'Oui/Non' },
  { value: 'single', label: 'Choix unique' },
  { value: 'multiple', label: 'Choix multiple' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Nombre' },
  { value: 'url', label: 'URL' },
];

const CHECKLIST_STATES = [
  { value: 'validated', label: 'Validé', color: '#10B981', icon: 'check-circle' },
  { value: 'refused', label: 'Refusé', color: '#EF4444', icon: 'x-circle' },
  { value: 'neutral', label: 'Neutre', color: '#94A3B8', icon: 'circle' },
];

function uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

function emptyContent(type) {
  if (type === 'script') return { steps: [], notes: '', objections: [], keyPhrases: [], cta: { label: '', text: '' } };
  if (type === 'questionnaire') return { fields: [] };
  if (type === 'checklist') return { items: [] };
  return {};
}

// ─── EditorModal — créer/modifier template (3 types) ──────────────────
function TemplateEditor({ T, I, Btn, Modal, mode, type, template, isAdmin, onClose, onSaved, pushNotification }) {
  const [form, setForm] = useState(() => template ? {
    title: template.title || '',
    description: template.description || '',
    scope: template.scope || 'personal',
    showByDefault: !!template.showByDefault,
    content: template.content || emptyContent(template.type || type),
  } : { title: '', description: '', scope: 'personal', showByDefault: false, content: emptyContent(type) });
  const [saving, setSaving] = useState(false);
  const effectiveType = template?.type || type;

  const save = async () => {
    if (!form.title.trim()) { pushNotification('Erreur', 'Titre requis', 'error'); return; }
    setSaving(true);
    try {
      let res;
      if (mode === 'create') {
        res = await api('/api/interaction-templates', { method: 'POST', body: { type: effectiveType, title: form.title, description: form.description, scope: form.scope, showByDefault: form.showByDefault ? 1 : 0, content_json: form.content } });
      } else {
        res = await api(`/api/interaction-templates/${template.id}`, { method: 'PUT', body: { title: form.title, description: form.description, showByDefault: form.showByDefault ? 1 : 0, content_json: form.content } });
      }
      if (res?.error) { pushNotification('Erreur', res.error, 'error'); setSaving(false); return; }
      pushNotification('OK', mode === 'create' ? 'Modèle créé' : 'Modèle mis à jour', 'success');
      onSaved && onSaved(res);
      onClose && onClose();
    } catch (e) { pushNotification('Erreur', 'Connexion', 'error'); setSaving(false); }
  };

  return (
    <Modal open={true} title={mode === 'create' ? `Nouveau ${TYPE_LABELS[effectiveType]?.toLowerCase()}` : `Modifier ${TYPE_LABELS[effectiveType]?.toLowerCase()}`} onClose={onClose}>
      <div style={{display:'flex',flexDirection:'column',gap:12,maxHeight:'70vh',overflow:'auto'}}>
        {/* Common fields */}
        <input type="text" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Titre"
          style={{padding:8,borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,background:T.bg,color:T.text,outline:'none'}}/>
        <input type="text" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Description (optionnelle)"
          style={{padding:8,borderRadius:8,border:`1px solid ${T.border}`,fontSize:12,background:T.bg,color:T.text,outline:'none'}}/>
        <div style={{display:'flex',gap:8,alignItems:'center',fontSize:12}}>
          <label style={{display:'flex',alignItems:'center',gap:6,cursor:isAdmin?'pointer':'not-allowed',opacity:isAdmin?1:0.5}}>
            <input type="radio" checked={form.scope==='personal'} onChange={()=>setForm({...form,scope:'personal'})} disabled={mode!=='create'}/> Personnel
          </label>
          <label style={{display:'flex',alignItems:'center',gap:6,cursor:isAdmin?'pointer':'not-allowed',opacity:isAdmin?1:0.5}}>
            <input type="radio" checked={form.scope==='company'} onChange={()=>setForm({...form,scope:'company'})} disabled={!isAdmin || mode!=='create'}/> Company {!isAdmin && '(admin)'}
          </label>
        </div>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,cursor:'pointer'}}>
          <input type="checkbox" checked={form.showByDefault} onChange={e=>setForm({...form,showByDefault:e.target.checked})}/> Afficher par défaut sur les fiches contacts
        </label>

        <div style={{height:1,background:T.border,margin:'4px 0'}}/>

        {/* Type-specific editor */}
        {effectiveType === 'script' && <ScriptEditor T={T} I={I} Btn={Btn} content={form.content} onChange={c=>setForm({...form,content:c})}/>}
        {effectiveType === 'questionnaire' && <QuestionnaireEditor T={T} I={I} Btn={Btn} content={form.content} onChange={c=>setForm({...form,content:c})}/>}
        {effectiveType === 'checklist' && <ChecklistEditor T={T} I={I} Btn={Btn} content={form.content} onChange={c=>setForm({...form,content:c})}/>}

        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:8}}>
          <Btn onClick={onClose} disabled={saving}>Annuler</Btn>
          <Btn primary onClick={save} disabled={saving}>{saving ? 'Sauvegarde…' : (mode === 'create' ? 'Créer' : 'Enregistrer')}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ScriptEditor({ T, I, Btn, content, onChange }) {
  const c = content || emptyContent('script');
  const updateSteps = (steps) => onChange({ ...c, steps });
  const updateField = (k, v) => onChange({ ...c, [k]: v });
  const updateCta = (k, v) => onChange({ ...c, cta: { ...(c.cta || {}), [k]: v } });

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10,fontSize:12}}>
      <div style={{fontWeight:600,color:T.text2}}>Étapes</div>
      {(c.steps||[]).map((s,i)=>(
        <div key={s.id||i} style={{display:'flex',gap:6}}>
          <input type="text" value={s.label||''} onChange={e=>{ const a=[...(c.steps||[])]; a[i]={...a[i],label:e.target.value}; updateSteps(a); }} placeholder={`Étape ${i+1}`}
            style={{flex:1,padding:6,borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,background:T.bg,color:T.text}}/>
          <Btn onClick={()=>{ const a=(c.steps||[]).filter((_,j)=>j!==i); updateSteps(a); }} style={{fontSize:11,color:'#EF4444'}}><I n="trash-2" s={11}/></Btn>
        </div>
      ))}
      <Btn onClick={()=>updateSteps([...(c.steps||[]),{id:uid('s'),label:'',text:''}])} style={{fontSize:11}}>+ Étape</Btn>

      <div style={{fontWeight:600,color:T.text2,marginTop:8}}>Notes</div>
      <textarea value={c.notes||''} onChange={e=>updateField('notes',e.target.value)} rows={2}
        style={{padding:6,borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,background:T.bg,color:T.text,resize:'vertical',fontFamily:'inherit'}}/>

      <div style={{fontWeight:600,color:T.text2,marginTop:8}}>Objections</div>
      {(c.objections||[]).map((o,i)=>(
        <div key={o.id||i} style={{display:'flex',flexDirection:'column',gap:4,padding:6,border:`1px solid ${T.border}`,borderRadius:6}}>
          <input type="text" value={o.label||''} onChange={e=>{ const a=[...(c.objections||[])]; a[i]={...a[i],label:e.target.value}; updateField('objections',a); }} placeholder="Objection"
            style={{padding:4,borderRadius:4,border:`1px solid ${T.border}`,fontSize:11,background:T.bg,color:T.text}}/>
          <textarea value={o.response||''} onChange={e=>{ const a=[...(c.objections||[])]; a[i]={...a[i],response:e.target.value}; updateField('objections',a); }} placeholder="Réponse type" rows={2}
            style={{padding:4,borderRadius:4,border:`1px solid ${T.border}`,fontSize:11,background:T.bg,color:T.text,fontFamily:'inherit',resize:'vertical'}}/>
          <Btn onClick={()=>updateField('objections',(c.objections||[]).filter((_,j)=>j!==i))} style={{fontSize:10,color:'#EF4444',alignSelf:'flex-end'}}><I n="trash-2" s={10}/> Suppr</Btn>
        </div>
      ))}
      <Btn onClick={()=>updateField('objections',[...(c.objections||[]),{id:uid('o'),label:'',response:''}])} style={{fontSize:11}}>+ Objection</Btn>

      <div style={{fontWeight:600,color:T.text2,marginTop:8}}>Phrases clés</div>
      {(c.keyPhrases||[]).map((k,i)=>(
        <div key={k.id||i} style={{display:'flex',gap:6}}>
          <input type="text" value={k.label||''} onChange={e=>{ const a=[...(c.keyPhrases||[])]; a[i]={...a[i],label:e.target.value}; updateField('keyPhrases',a); }} placeholder="Phrase"
            style={{flex:1,padding:6,borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,background:T.bg,color:T.text}}/>
          <Btn onClick={()=>updateField('keyPhrases',(c.keyPhrases||[]).filter((_,j)=>j!==i))} style={{fontSize:11,color:'#EF4444'}}><I n="trash-2" s={11}/></Btn>
        </div>
      ))}
      <Btn onClick={()=>updateField('keyPhrases',[...(c.keyPhrases||[]),{id:uid('k'),label:'',context:''}])} style={{fontSize:11}}>+ Phrase clé</Btn>

      <div style={{fontWeight:600,color:T.text2,marginTop:8}}>CTA final</div>
      <input type="text" value={c.cta?.label||''} onChange={e=>updateCta('label',e.target.value)} placeholder="Titre CTA"
        style={{padding:6,borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,background:T.bg,color:T.text}}/>
      <textarea value={c.cta?.text||''} onChange={e=>updateCta('text',e.target.value)} placeholder="Texte CTA" rows={2}
        style={{padding:6,borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,background:T.bg,color:T.text,resize:'vertical',fontFamily:'inherit'}}/>
    </div>
  );
}

function QuestionnaireEditor({ T, I, Btn, content, onChange }) {
  const c = content || emptyContent('questionnaire');
  const update = (fields) => onChange({ ...c, fields });
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8,fontSize:12}}>
      <div style={{fontWeight:600,color:T.text2}}>Questions ({(c.fields||[]).length})</div>
      {(c.fields||[]).map((f,i)=>(
        <div key={f.id||i} style={{display:'flex',flexDirection:'column',gap:4,padding:6,border:`1px solid ${T.border}`,borderRadius:6}}>
          <div style={{display:'flex',gap:6}}>
            <input type="text" value={f.label||''} onChange={e=>{ const a=[...(c.fields||[])]; a[i]={...a[i],label:e.target.value}; update(a); }} placeholder="Question"
              style={{flex:1,padding:4,borderRadius:4,border:`1px solid ${T.border}`,fontSize:11,background:T.bg,color:T.text}}/>
            <select value={f.type||'text'} onChange={e=>{ const a=[...(c.fields||[])]; a[i]={...a[i],type:e.target.value, options:(e.target.value==='single'||e.target.value==='multiple')?(a[i].options||[]):undefined}; update(a); }}
              style={{padding:4,borderRadius:4,border:`1px solid ${T.border}`,fontSize:11,background:T.bg,color:T.text}}>
              {FIELD_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <Btn onClick={()=>update((c.fields||[]).filter((_,j)=>j!==i))} style={{fontSize:10,color:'#EF4444'}}><I n="trash-2" s={10}/></Btn>
          </div>
          <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:T.text3}}>
            <input type="checkbox" checked={!!f.required} onChange={e=>{ const a=[...(c.fields||[])]; a[i]={...a[i],required:e.target.checked}; update(a); }}/> Obligatoire
          </label>
          {(f.type === 'single' || f.type === 'multiple') && (
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <div style={{fontSize:10,color:T.text3}}>Options (1 par ligne)</div>
              <textarea value={(f.options||[]).join('\n')} onChange={e=>{ const a=[...(c.fields||[])]; a[i]={...a[i],options:e.target.value.split('\n').filter(Boolean)}; update(a); }} rows={2}
                style={{padding:4,borderRadius:4,border:`1px solid ${T.border}`,fontSize:11,background:T.bg,color:T.text,fontFamily:'inherit',resize:'vertical'}}/>
            </div>
          )}
        </div>
      ))}
      <Btn onClick={()=>update([...(c.fields||[]),{id:uid('f'),label:'',type:'text',required:false}])} style={{fontSize:11}}>+ Question</Btn>
    </div>
  );
}

function ChecklistEditor({ T, I, Btn, content, onChange }) {
  const c = content || emptyContent('checklist');
  const update = (items) => onChange({ ...c, items });
  return (
    <div style={{display:'flex',flexDirection:'column',gap:6,fontSize:12}}>
      <div style={{fontWeight:600,color:T.text2}}>Items ({(c.items||[]).length})</div>
      {(c.items||[]).map((it,i)=>(
        <div key={it.id||i} style={{display:'flex',gap:6}}>
          <input type="text" value={it.label||''} onChange={e=>{ const a=[...(c.items||[])]; a[i]={...a[i],label:e.target.value}; update(a); }} placeholder={`Item ${i+1}`}
            style={{flex:1,padding:6,borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,background:T.bg,color:T.text}}/>
          <Btn onClick={()=>update((c.items||[]).filter((_,j)=>j!==i))} style={{fontSize:11,color:'#EF4444'}}><I n="trash-2" s={11}/></Btn>
        </div>
      ))}
      <Btn onClick={()=>update([...(c.items||[]),{id:uid('i'),label:''}])} style={{fontSize:11}}>+ Item</Btn>
    </div>
  );
}

// ─── Helpers d'affichage (format lisible LABEL ✅ Oui) ─────────────────
const YES_NO_DISPLAY = {
  yes: { label: 'Oui', color: '#10B981', icon: '✅' },
  no:  { label: 'Non', color: '#EF4444', icon: '❌' },
  validated: { label: 'Validé', color: '#10B981', icon: '✅' },
  refused:   { label: 'Refusé', color: '#EF4444', icon: '❌' },
  neutral:   { label: 'Neutre', color: '#94A3B8', icon: '⚪' },
};

function formatAnswerValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? YES_NO_DISPLAY.yes : YES_NO_DISPLAY.no;
  if (YES_NO_DISPLAY[value]) return YES_NO_DISPLAY[value];
  if (Array.isArray(value)) return { label: value.join(', '), color: null, icon: null };
  return { label: String(value), color: null, icon: null };
}

// ─── ResponseSummary — bloc 🧠 Résumé en haut du formulaire ──────────
// Affiche LABEL    ✅ Oui  /  ❌ Non  /  ⚪ Neutre  ou valeur libre
function ResponseSummary({ T, template, answers }) {
  const rows = [];
  const content = template.content || {};
  if (template.type === 'questionnaire') {
    for (const f of (content.fields || [])) {
      const fmt = formatAnswerValue(answers[f.id]);
      if (fmt) rows.push({ label: f.label, value: fmt });
    }
  } else if (template.type === 'checklist') {
    for (const it of (content.items || [])) {
      const fmt = formatAnswerValue(answers[it.id]);
      if (fmt) rows.push({ label: it.label, value: fmt });
    }
  } else if (template.type === 'script') {
    if (answers.notes) {
      const truncated = String(answers.notes).slice(0, 100);
      rows.push({ label: 'Notes', value: { label: truncated + (String(answers.notes).length > 100 ? '…' : ''), color: T.text, icon: null } });
    }
  }
  if (rows.length === 0) return null;
  return (
    <div style={{padding:'14px 16px',borderRadius:10,background:T.bg,border:`1px solid ${T.border}`,marginBottom:10}}>
      <div style={{fontSize:13,fontWeight:700,color:T.text2,marginBottom:10,display:'flex',alignItems:'center',gap:6}}>🧠 Résumé</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {rows.map((r, i) => (
          <div key={i} style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}>
            <div style={{color:T.text3,textTransform:'uppercase',fontSize:11,fontWeight:700,letterSpacing:0.4,flex:'0 0 auto'}}>{r.label}</div>
            <div style={{color:r.value.color || T.text,fontWeight:600,fontSize:13,display:'flex',gap:6,alignItems:'center',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'60%'}}>
              {r.value.icon && <span>{r.value.icon}</span>}
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.value.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ResponseFiller — saisie réponse avec autosave 800ms ──────────────
function ResponseFiller({ T, I, Btn, template, response, contactId, onSaved, onClose, onCompleted, pushNotification }) {
  const [answers, setAnswers] = useState(() => response?.answers || {});
  const [responseId, setResponseId] = useState(response?.id || null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const debounceRef = useRef(null);
  const status = response?.status || 'draft';

  // Lazy create response on first edit
  const ensureResponse = async () => {
    if (responseId) return responseId;
    const res = await api(`/api/interaction-responses/by-contact/${contactId}`, { method: 'POST', body: { templateId: template.id } });
    if (res?.error) { pushNotification('Erreur', res.error, 'error'); return null; }
    setResponseId(res.id);
    return res.id;
  };

  // Autosave debounce 800ms
  useEffect(() => {
    if (!responseId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await api(`/api/interaction-responses/${responseId}`, { method: 'PUT', body: { answers } });
        if (!res?.error) setSavedAt(new Date());
      } catch {} finally { setSaving(false); }
    }, 800);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [answers, responseId]);

  const setAnswer = async (key, value) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
    if (!responseId) await ensureResponse();
  };

  const complete = async () => {
    let id = responseId;
    if (!id) id = await ensureResponse();
    if (!id) return;
    // Save current answers first
    await api(`/api/interaction-responses/${id}`, { method: 'PUT', body: { answers } });
    const res = await api(`/api/interaction-responses/${id}/complete`, { method: 'POST' });
    if (res?.error) { pushNotification('Erreur', res.error, 'error'); return; }
    pushNotification('OK', 'Réponse terminée', 'success');
    onCompleted && onCompleted();
  };

  const content = template.content || {};

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,fontSize:13}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:T.bg,borderRadius:10,border:`1px solid ${T.border}`}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:T.text}}>{template.title}</div>
          <div style={{fontSize:11,color:T.text3,marginTop:2}}>{TYPE_LABELS[template.type]} · {status === 'completed' ? '✓ terminé' : 'en cours'} {saving && '· saving…'} {savedAt && !saving && '· enregistré'}</div>
        </div>
        <Btn onClick={onClose} style={{fontSize:12}}><I n="x" s={13}/></Btn>
      </div>

      <ResponseSummary T={T} template={template} answers={answers}/>

      {template.type === 'script' && <ScriptViewer T={T} I={I} content={content} answers={answers} setAnswer={setAnswer}/>}
      {template.type === 'questionnaire' && <QuestionnaireFiller T={T} I={I} content={content} answers={answers} setAnswer={setAnswer}/>}
      {template.type === 'checklist' && <ChecklistFiller T={T} I={I} content={content} answers={answers} setAnswer={setAnswer}/>}

      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:10}}>
        {status !== 'completed' && <Btn primary onClick={complete} style={{fontSize:13,padding:'8px 18px'}}><I n="check" s={13}/> Terminer</Btn>}
      </div>
    </div>
  );
}

function ScriptViewer({ T, I, content, answers, setAnswer }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {(content.steps||[]).length>0 && <div>
        <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:4}}>Étapes</div>
        {(content.steps||[]).map((s,i)=>(
          <div key={s.id||i} style={{display:'flex',gap:6,padding:'6px 8px',marginBottom:4,borderRadius:6,border:`1px solid ${T.border}`}}>
            <div style={{width:18,height:18,borderRadius:9,background:T.accent+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:T.accent,flexShrink:0}}>{i+1}</div>
            <div style={{fontSize:12,color:T.text}}>{s.label}</div>
          </div>
        ))}
      </div>}
      {content.objections?.length>0 && <div>
        <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:4,marginTop:8}}>Objections</div>
        {content.objections.map((o,i)=>(
          <details key={o.id||i} style={{padding:'6px 8px',marginBottom:4,borderRadius:6,border:`1px solid ${T.border}`}}>
            <summary style={{fontSize:12,color:T.text,cursor:'pointer'}}>{o.label}</summary>
            <div style={{fontSize:11,color:T.text2,marginTop:4,paddingTop:4,borderTop:`1px solid ${T.border}`}}>{o.response}</div>
          </details>
        ))}
      </div>}
      {content.keyPhrases?.length>0 && <div>
        <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:4,marginTop:8}}>Phrases clés</div>
        {content.keyPhrases.map((k,i)=>(
          <div key={k.id||i} style={{padding:'4px 8px',marginBottom:4,borderRadius:6,background:T.bg,fontSize:12,color:T.text}}>{k.label}</div>
        ))}
      </div>}
      {content.cta?.label && <div style={{padding:'6px 8px',marginTop:8,borderRadius:6,background:'#10B98112',border:'1px solid #10B98140'}}>
        <div style={{fontSize:11,fontWeight:700,color:'#10B981'}}>{content.cta.label}</div>
        {content.cta.text && <div style={{fontSize:11,color:T.text2,marginTop:2}}>{content.cta.text}</div>}
      </div>}
      <div style={{marginTop:8}}>
        <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:4}}>Mes notes (autosave)</div>
        <textarea value={answers.notes||''} onChange={e=>setAnswer('notes', e.target.value)} rows={3}
          style={{width:'100%',padding:6,borderRadius:6,border:`1px solid ${T.border}`,fontSize:12,background:T.bg,color:T.text,resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}/>
      </div>
    </div>
  );
}

function QuestionnaireFiller({ T, I, content, answers, setAnswer }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {(content.fields||[]).map((f,i)=>{
        const val = answers[f.id];
        return (
          <div key={f.id||i} style={{display:'flex',flexDirection:'column',gap:4}}>
            <label style={{fontSize:11,fontWeight:600,color:T.text2}}>{f.label}{f.required && <span style={{color:'#EF4444'}}> *</span>}</label>
            {f.type === 'text' && <input type="text" value={val||''} onChange={e=>setAnswer(f.id,e.target.value)} style={inputStyle(T)}/>}
            {f.type === 'textarea' && <textarea value={val||''} onChange={e=>setAnswer(f.id,e.target.value)} rows={3} style={{...inputStyle(T),resize:'vertical',fontFamily:'inherit'}}/>}
            {f.type === 'yesno' && <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setAnswer(f.id,'yes')} style={{padding:'8px 16px',borderRadius:8,border:`1px solid ${val==='yes'?'#10B981':T.border}`,background:val==='yes'?'#10B98118':'transparent',color:val==='yes'?'#10B981':T.text2,fontSize:12,fontWeight:700,cursor:'pointer'}}>✅ Oui</button>
              <button onClick={()=>setAnswer(f.id,'no')} style={{padding:'8px 16px',borderRadius:8,border:`1px solid ${val==='no'?'#EF4444':T.border}`,background:val==='no'?'#EF444418':'transparent',color:val==='no'?'#EF4444':T.text2,fontSize:12,fontWeight:700,cursor:'pointer'}}>❌ Non</button>
            </div>}
            {f.type === 'single' && <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {(f.options||[]).map(opt=>(
                <label key={opt} style={{fontSize:12,display:'flex',gap:6,alignItems:'center',cursor:'pointer'}}>
                  <input type="radio" name={f.id} checked={val===opt} onChange={()=>setAnswer(f.id,opt)}/> {opt}
                </label>
              ))}
            </div>}
            {f.type === 'multiple' && <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {(f.options||[]).map(opt=>{
                const arr = Array.isArray(val) ? val : [];
                const checked = arr.includes(opt);
                return (
                  <label key={opt} style={{fontSize:12,display:'flex',gap:6,alignItems:'center',cursor:'pointer'}}>
                    <input type="checkbox" checked={checked} onChange={e=>setAnswer(f.id, e.target.checked ? [...arr,opt] : arr.filter(x=>x!==opt))}/> {opt}
                  </label>
                );
              })}
            </div>}
            {f.type === 'date' && <input type="date" value={val||''} onChange={e=>setAnswer(f.id,e.target.value)} style={inputStyle(T)}/>}
            {f.type === 'number' && <input type="number" value={val||''} onChange={e=>setAnswer(f.id, e.target.value === '' ? '' : Number(e.target.value))} style={inputStyle(T)}/>}
            {f.type === 'url' && <input type="url" value={val||''} onChange={e=>setAnswer(f.id,e.target.value)} placeholder="https://…" style={inputStyle(T)}/>}
          </div>
        );
      })}
    </div>
  );
}

function ChecklistFiller({ T, I, content, answers, setAnswer }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {(content.items||[]).map((it,i)=>{
        const cur = answers[it.id] || 'neutral';
        return (
          <div key={it.id||i} style={{display:'flex',gap:10,alignItems:'center',padding:'10px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card}}>
            <div style={{flex:1,fontSize:13,color:T.text,fontWeight:500}}>{it.label}</div>
            <div style={{display:'flex',gap:6}}>
              {CHECKLIST_STATES.map(st => (
                <button key={st.value} onClick={()=>setAnswer(it.id, st.value)}
                  style={{padding:'6px 12px',borderRadius:8,border:`1px solid ${cur===st.value?st.color:T.border}`,background:cur===st.value?st.color+'1F':'transparent',color:cur===st.value?st.color:T.text3,fontSize:11,fontWeight:700,cursor:'pointer',transition:'all .15s'}}>
                  {st.value === 'validated' ? '✅' : st.value === 'refused' ? '❌' : '⚪'} {st.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function inputStyle(T) {
  return { padding:6, borderRadius:6, border:`1px solid ${T.border}`, fontSize:12, background:T.bg, color:T.text, outline:'none', boxSizing:'border-box', width:'100%' };
}

function Pill({ T, active, onClick, children }) {
  return <button onClick={onClick} style={{padding:'4px 10px',borderRadius:14,border:`1px solid ${active?T.accent:T.border}`,background:active?T.accent+'18':'transparent',color:active?T.accent:T.text,fontSize:11,fontWeight:600,cursor:'pointer'}}>{children}</button>;
}

// ─── Main panel ───────────────────────────────────────────────────────
export default function InteractionTemplatesPanel({ T, I, Btn, Modal, contact, callLogId, role, collaboratorId, pushNotification }) {
  const isAdmin = role === 'admin' || role === 'supra';
  const [templates, setTemplates] = useState([]);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all|personal|company
  const [filterType, setFilterType] = useState(''); // ''|script|questionnaire|checklist
  const [editor, setEditor] = useState(null); // {mode:'create'|'edit', type, template?}
  const [filling, setFilling] = useState(null); // {template, response}

  const reload = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('scope', filter);
      if (filterType) params.set('type', filterType);
      const tpls = await api('/api/interaction-templates' + (params.toString() ? '?' + params.toString() : ''));
      setTemplates(Array.isArray(tpls) ? tpls : []);
      if (contact?.id) {
        const resps = await api(`/api/interaction-responses/by-contact/${contact.id}`);
        setResponses(Array.isArray(resps) ? resps : []);
      } else {
        setResponses([]);
      }
    } catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [filter, filterType, contact?.id]);

  const startFilling = async (template) => {
    let response = responses.find(r => r.templateId === template.id && r.collaboratorId === collaboratorId);
    if (!response) {
      const res = await api(`/api/interaction-responses/by-contact/${contact.id}`, { method: 'POST', body: { templateId: template.id, callLogId: callLogId || '' } });
      if (res?.error) { pushNotification('Erreur', res.error, 'error'); return; }
      const detail = await api(`/api/interaction-responses/${res.id}`);
      response = detail;
      reload();
    }
    setFilling({ template: { ...template, content: template.content }, response });
  };

  const deleteTemplate = async (t) => {
    if (!confirm(`Supprimer "${t.title}" ?`)) return;
    const res = await api(`/api/interaction-templates/${t.id}`, { method: 'DELETE' });
    if (res?.error) { pushNotification('Erreur', res.error, 'error'); return; }
    pushNotification('OK', `Modèle supprimé (${res.mode})`, 'success');
    reload();
  };

  const toggleDefault = async (t) => {
    const res = await api(`/api/interaction-templates/${t.id}/toggle-default`, { method: 'POST' });
    if (res?.error) {
      pushNotification('Erreur', res.error === 'too_many_default_templates' ? `Limite ${res.limit} modèles par défaut` : res.error, 'error');
      return;
    }
    reload();
  };

  const duplicate = async (t) => {
    const res = await api(`/api/interaction-templates/${t.id}/duplicate`, { method: 'POST' });
    if (res?.error) { pushNotification('Erreur', res.error, 'error'); return; }
    pushNotification('OK', 'Modèle dupliqué', 'success');
    reload();
  };

  const showByDefaultTpls = useMemo(() => templates.filter(t => t.showByDefault), [templates]);

  // Si saisie active : mode plein écran panel
  if (filling) {
    return (
      <div style={{display:'flex',flexDirection:'column',gap:8,padding:'4px 0'}}>
        <ResponseFiller T={T} I={I} Btn={Btn} template={filling.template} response={filling.response} contactId={contact?.id}
          onClose={()=>{ setFilling(null); reload(); }}
          onCompleted={()=>{ setFilling(null); reload(); }}
          pushNotification={pushNotification}/>
      </div>
    );
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {/* Barre d'action 3 boutons — CTA grand format */}
      <div style={{display:'flex',gap:8}}>
        <Btn onClick={()=>setEditor({mode:'create',type:'script'})} style={{flex:1,fontSize:12,padding:'10px 12px',fontWeight:700}}><I n="file-text" s={14}/> + Script</Btn>
        <Btn onClick={()=>setEditor({mode:'create',type:'questionnaire'})} style={{flex:1,fontSize:12,padding:'10px 12px',fontWeight:700}}><I n="help-circle" s={14}/> + Formulaire</Btn>
        <Btn onClick={()=>setEditor({mode:'create',type:'checklist'})} style={{flex:1,fontSize:12,padding:'10px 12px',fontWeight:700}}><I n="check-square" s={14}/> + Checklist</Btn>
      </div>

      {/* Filtres */}
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        <button onClick={()=>setFilter('all')} style={pillStyle(T, filter==='all')}>Tous</button>
        <button onClick={()=>setFilter('personal')} style={pillStyle(T, filter==='personal')}>Mes modèles</button>
        <button onClick={()=>setFilter('company')} style={pillStyle(T, filter==='company')}>Company</button>
        <div style={{flex:1}}/>
        <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{fontSize:11,padding:'5px 8px',borderRadius:6,border:`1px solid ${T.border}`,background:T.bg,color:T.text}}>
          <option value="">Tous types</option>
          <option value="script">Scripts</option>
          <option value="questionnaire">Formulaires</option>
          <option value="checklist">Checklists</option>
        </select>
        {isAdmin && <Btn onClick={async()=>{
          try {
            let token = '';
            try { token = JSON.parse(localStorage.getItem('calendar360-session') || 'null')?.token || ''; } catch {}
            const url = (window.location?.origin || '') + '/api/interaction-responses/export';
            const resp = await fetch(url, { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
            if (!resp.ok) { pushNotification('Erreur', `Export refusé (HTTP ${resp.status})`, 'error'); return; }
            const blob = await resp.blob();
            const dlUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = dlUrl; a.download = `interaction-responses-${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(dlUrl);
            pushNotification('OK', 'Export CSV téléchargé', 'success');
          } catch (e) { pushNotification('Erreur', 'Export impossible', 'error'); }
        }} style={{fontSize:11,padding:'5px 10px'}} title="Exporter toutes les réponses en CSV (admin)"><I n="download" s={12}/> Export CSV</Btn>}
      </div>

      {loading && <div style={{textAlign:'center',padding:20,color:T.text3,fontSize:11}}>Chargement…</div>}

      {/* Modèles activés par défaut */}
      {!loading && showByDefaultTpls.length > 0 && contact?.id && (
        <div>
          <SectionHeading T={T} icon="star" label="Activés par défaut"/>
          {showByDefaultTpls.map(t => <TemplateRow key={t.id} T={T} I={I} Btn={Btn} t={t} contact={contact} responses={responses} collaboratorId={collaboratorId} isAdmin={isAdmin} onStart={()=>startFilling(t)} onEdit={()=>setEditor({mode:'edit',type:t.type,template:t})} onDuplicate={()=>duplicate(t)} onDelete={()=>deleteTemplate(t)} onToggleDefault={()=>toggleDefault(t)}/>)}
        </div>
      )}

      {/* Tous les modèles */}
      {!loading && (
        <div>
          <SectionHeading T={T} icon="layers" label={`Modèles disponibles (${templates.length})`}/>
          {templates.length === 0 ? (
            <div style={{textAlign:'center',padding:24,color:T.text3,fontSize:13,border:`1px dashed ${T.border}`,borderRadius:10}}>Aucun modèle. Créez-en un !</div>
          ) : (
            templates.map(t => <TemplateRow key={t.id} T={T} I={I} Btn={Btn} t={t} contact={contact} responses={responses} collaboratorId={collaboratorId} isAdmin={isAdmin} onStart={contact?.id ? ()=>startFilling(t) : null} onEdit={()=>setEditor({mode:'edit',type:t.type,template:t})} onDuplicate={()=>duplicate(t)} onDelete={()=>deleteTemplate(t)} onToggleDefault={()=>toggleDefault(t)}/>)
          )}
        </div>
      )}

      {/* Réponses du contact */}
      {!loading && contact?.id && responses.length > 0 && (
        <div>
          <SectionHeading T={T} icon="check-circle" label={`Réponses du contact (${responses.length})`}/>
          {responses.map(r => (
            <div key={r.id} onClick={()=>{
              const t = templates.find(x => x.id === r.templateId);
              if (t) setFilling({ template: t, response: r });
            }} style={{display:'flex',gap:10,alignItems:'center',padding:'12px 14px',marginBottom:8,borderRadius:10,background:T.bg,cursor:'pointer',border:`1px solid ${T.border}`,transition:'all .15s'}}>
              <div style={{width:8,height:8,borderRadius:4,background:r.status === 'completed' ? '#10B981' : '#F59E0B',flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.templateTitle || '—'}</div>
                <div style={{fontSize:11,color:T.text3,marginTop:2}}>{r.status === 'completed' ? '✓ terminé' : '⋯ en cours'} · {r.collabName || ''}</div>
              </div>
              <Btn primary style={{fontSize:12,padding:'7px 14px',fontWeight:700}}><I n={r.status === 'completed' ? 'eye' : 'play'} s={12}/> {r.status === 'completed' ? 'Voir' : 'Reprendre'}</Btn>
            </div>
          ))}
        </div>
      )}

      {editor && <TemplateEditor T={T} I={I} Btn={Btn} Modal={Modal} mode={editor.mode} type={editor.type} template={editor.template} isAdmin={isAdmin} onClose={()=>setEditor(null)} onSaved={reload} pushNotification={pushNotification}/>}
    </div>
  );
}

function TemplateRow({ T, I, Btn, t, contact, responses, collaboratorId, isAdmin, onStart, onEdit, onDuplicate, onDelete, onToggleDefault }) {
  const myResp = responses.find(r => r.templateId === t.id && r.collaboratorId === collaboratorId);
  const canEdit = isAdmin || (t.scope === 'personal' && t.createdByCollaboratorId === collaboratorId);
  const [menuOpen, setMenuOpen] = useState(false);
  const ctaLabel = myResp ? (myResp.status === 'completed' ? 'Voir' : 'Reprendre') : 'Démarrer';
  const ctaIcon = myResp ? (myResp.status === 'completed' ? 'eye' : 'play') : 'play';

  return (
    <div style={{display:'flex',gap:10,alignItems:'center',padding:'12px 14px',marginBottom:8,borderRadius:10,border:`1px solid ${T.border}`,background:T.card,position:'relative'}}>
      <div style={{width:32,height:32,borderRadius:8,background:T.accent+'14',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <I n={TYPE_ICONS[t.type] || 'file'} s={16} style={{color:T.accent}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'flex',alignItems:'center',gap:6}}>
          {t.title}
          {t.showByDefault && <span style={{fontSize:11,color:'#F59E0B'}} title="Affiché par défaut">★</span>}
        </div>
        <div style={{fontSize:11,color:T.text3,marginTop:2}}>{TYPE_LABELS[t.type]} · {t.scope === 'company' ? 'Company' : 'Personnel'}{t.responseCount ? ` · ${t.responseCount} rép.` : ''}</div>
      </div>
      {onStart && <Btn primary onClick={onStart} style={{fontSize:12,padding:'7px 14px',fontWeight:700}}><I n={ctaIcon} s={12}/> {ctaLabel}</Btn>}
      <div style={{position:'relative'}}>
        <Btn onClick={()=>setMenuOpen(o=>!o)} style={{fontSize:12,padding:'7px 10px'}} title="Plus d'actions"><I n="more-horizontal" s={14}/></Btn>
        {menuOpen && (
          <>
            <div onClick={()=>setMenuOpen(false)} style={{position:'fixed',inset:0,zIndex:9}}/>
            <div style={{position:'absolute',top:'100%',right:0,marginTop:4,minWidth:180,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.08)',zIndex:10,padding:4,display:'flex',flexDirection:'column',gap:2}}>
              {canEdit && <MenuItem T={T} I={I} icon="edit-2" label="Modifier" onClick={()=>{ setMenuOpen(false); onEdit(); }}/>}
              <MenuItem T={T} I={I} icon="copy" label="Dupliquer" onClick={()=>{ setMenuOpen(false); onDuplicate(); }}/>
              {canEdit && <MenuItem T={T} I={I} icon="star" label={t.showByDefault ? 'Retirer par défaut' : 'Activer par défaut'} iconColor={t.showByDefault?'#F59E0B':T.text3} onClick={()=>{ setMenuOpen(false); onToggleDefault(); }}/>}
              {canEdit && <div style={{height:1,background:T.border,margin:'2px 0'}}/>}
              {canEdit && <MenuItem T={T} I={I} icon="trash-2" label="Supprimer" iconColor="#EF4444" textColor="#EF4444" onClick={()=>{ setMenuOpen(false); onDelete(); }}/>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MenuItem({ T, I, icon, label, iconColor, textColor, onClick }) {
  return (
    <button onClick={onClick} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:6,border:'none',background:'transparent',color:textColor||T.text,fontSize:12,fontWeight:500,cursor:'pointer',textAlign:'left',width:'100%'}}
      onMouseEnter={e=>e.currentTarget.style.background=T.bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <I n={icon} s={13} style={{color:iconColor||T.text3}}/> {label}
    </button>
  );
}

function pillStyle(T, active) {
  return { padding:'5px 12px', borderRadius:14, border:`1px solid ${active?T.accent:T.border}`, background:active?T.accent+'18':'transparent', color:active?T.accent:T.text2, fontSize:11, fontWeight:600, cursor:'pointer' };
}

function SectionHeading({ T, icon, label }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10,marginTop:4,paddingBottom:6,borderBottom:`1px solid ${T.border}`}}>
      {icon && <span style={{color:T.text3,fontSize:14}}>{icon === 'star' ? '★' : icon === 'layers' ? '📋' : '✓'}</span>}
      <div style={{fontSize:12,fontWeight:700,color:T.text2,textTransform:'uppercase',letterSpacing:0.4}}>{label}</div>
    </div>
  );
}
