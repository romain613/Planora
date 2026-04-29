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
    <div style={{display:'flex',flexDirection:'column',gap:10,fontSize:12}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 8px',background:T.bg,borderRadius:6}}>
        <div>
          <div style={{fontSize:12,fontWeight:600,color:T.text}}>{template.title}</div>
          <div style={{fontSize:10,color:T.text3}}>{TYPE_LABELS[template.type]} · {status === 'completed' ? '✓ terminé' : 'en cours'} {saving && '· saving…'} {savedAt && !saving && '· enregistré'}</div>
        </div>
        <Btn onClick={onClose} style={{fontSize:11}}><I n="x" s={11}/></Btn>
      </div>

      {template.type === 'script' && <ScriptViewer T={T} I={I} content={content} answers={answers} setAnswer={setAnswer}/>}
      {template.type === 'questionnaire' && <QuestionnaireFiller T={T} I={I} content={content} answers={answers} setAnswer={setAnswer}/>}
      {template.type === 'checklist' && <ChecklistFiller T={T} I={I} content={content} answers={answers} setAnswer={setAnswer}/>}

      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:6}}>
        {status !== 'completed' && <Btn primary onClick={complete}>Terminer</Btn>}
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
            {f.type === 'yesno' && <div style={{display:'flex',gap:6}}>
              <Pill T={T} active={val==='yes'} onClick={()=>setAnswer(f.id,'yes')}>Oui</Pill>
              <Pill T={T} active={val==='no'} onClick={()=>setAnswer(f.id,'no')}>Non</Pill>
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
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {(content.items||[]).map((it,i)=>{
        const cur = answers[it.id] || 'neutral';
        return (
          <div key={it.id||i} style={{display:'flex',gap:6,alignItems:'center',padding:'6px 8px',borderRadius:6,border:`1px solid ${T.border}`}}>
            <div style={{flex:1,fontSize:12,color:T.text}}>{it.label}</div>
            <div style={{display:'flex',gap:4}}>
              {CHECKLIST_STATES.map(st => (
                <button key={st.value} onClick={()=>setAnswer(it.id, st.value)}
                  style={{padding:'4px 8px',borderRadius:6,border:`1px solid ${cur===st.value?st.color:T.border}`,background:cur===st.value?st.color+'18':'transparent',color:cur===st.value?st.color:T.text3,fontSize:10,fontWeight:600,cursor:'pointer'}}>
                  {st.label}
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
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {/* Barre d'action 3 boutons */}
      <div style={{display:'flex',gap:6}}>
        <Btn onClick={()=>setEditor({mode:'create',type:'script'})} style={{flex:1,fontSize:11}}><I n="file-text" s={12}/> + Script</Btn>
        <Btn onClick={()=>setEditor({mode:'create',type:'questionnaire'})} style={{flex:1,fontSize:11}}><I n="help-circle" s={12}/> + Formulaire</Btn>
        <Btn onClick={()=>setEditor({mode:'create',type:'checklist'})} style={{flex:1,fontSize:11}}><I n="check-square" s={12}/> + Checklist</Btn>
      </div>

      {/* Filtres */}
      <div style={{display:'flex',gap:4,fontSize:10}}>
        <button onClick={()=>setFilter('all')} style={pillStyle(T, filter==='all')}>Tous</button>
        <button onClick={()=>setFilter('personal')} style={pillStyle(T, filter==='personal')}>Mes modèles</button>
        <button onClick={()=>setFilter('company')} style={pillStyle(T, filter==='company')}>Company</button>
        <div style={{flex:1}}/>
        <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{fontSize:10,padding:'2px 4px',borderRadius:4,border:`1px solid ${T.border}`,background:T.bg,color:T.text}}>
          <option value="">Tous types</option>
          <option value="script">Scripts</option>
          <option value="questionnaire">Formulaires</option>
          <option value="checklist">Checklists</option>
        </select>
      </div>

      {loading && <div style={{textAlign:'center',padding:20,color:T.text3,fontSize:11}}>Chargement…</div>}

      {/* Modèles activés par défaut */}
      {!loading && showByDefaultTpls.length > 0 && contact?.id && (
        <div>
          <div style={{fontSize:10,fontWeight:600,color:T.text3,marginBottom:4}}>★ Activés par défaut</div>
          {showByDefaultTpls.map(t => <TemplateRow key={t.id} T={T} I={I} Btn={Btn} t={t} contact={contact} responses={responses} collaboratorId={collaboratorId} isAdmin={isAdmin} onStart={()=>startFilling(t)} onEdit={()=>setEditor({mode:'edit',type:t.type,template:t})} onDuplicate={()=>duplicate(t)} onDelete={()=>deleteTemplate(t)} onToggleDefault={()=>toggleDefault(t)}/>)}
        </div>
      )}

      {/* Tous les modèles */}
      {!loading && (
        <div>
          <div style={{fontSize:10,fontWeight:600,color:T.text3,marginBottom:4}}>Modèles disponibles ({templates.length})</div>
          {templates.length === 0 ? (
            <div style={{textAlign:'center',padding:16,color:T.text3,fontSize:11,border:`1px dashed ${T.border}`,borderRadius:6}}>Aucun modèle. Créez-en un !</div>
          ) : (
            templates.map(t => <TemplateRow key={t.id} T={T} I={I} Btn={Btn} t={t} contact={contact} responses={responses} collaboratorId={collaboratorId} isAdmin={isAdmin} onStart={contact?.id ? ()=>startFilling(t) : null} onEdit={()=>setEditor({mode:'edit',type:t.type,template:t})} onDuplicate={()=>duplicate(t)} onDelete={()=>deleteTemplate(t)} onToggleDefault={()=>toggleDefault(t)}/>)
          )}
        </div>
      )}

      {/* Réponses du contact */}
      {!loading && contact?.id && responses.length > 0 && (
        <div>
          <div style={{fontSize:10,fontWeight:600,color:T.text3,marginTop:8,marginBottom:4}}>Réponses du contact ({responses.length})</div>
          {responses.map(r => (
            <div key={r.id} onClick={()=>{
              const t = templates.find(x => x.id === r.templateId);
              if (t) setFilling({ template: t, response: r });
            }} style={{display:'flex',gap:6,alignItems:'center',padding:'6px 8px',marginBottom:3,borderRadius:6,background:T.bg,cursor:'pointer'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.templateTitle || '—'}</div>
                <div style={{fontSize:10,color:T.text3}}>{r.status === 'completed' ? '✓ terminé' : 'en cours'} · {r.collabName || ''}</div>
              </div>
              <Btn style={{fontSize:10}}>{r.status === 'completed' ? 'Voir' : 'Reprendre'}</Btn>
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
  return (
    <div style={{display:'flex',gap:6,alignItems:'center',padding:'6px 8px',marginBottom:3,borderRadius:6,border:`1px solid ${T.border}`}}>
      <I n={TYPE_ICONS[t.type] || 'file'} s={14} style={{color:T.text3,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:11,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.title}{t.showByDefault && ' ★'}</div>
        <div style={{fontSize:10,color:T.text3}}>{TYPE_LABELS[t.type]} · {t.scope}{t.responseCount ? ` · ${t.responseCount} rép.` : ''}</div>
      </div>
      {onStart && <Btn onClick={onStart} primary style={{fontSize:10}}>{myResp ? (myResp.status === 'completed' ? 'Voir' : 'Reprendre') : 'Démarrer'}</Btn>}
      {canEdit && <Btn onClick={onEdit} style={{fontSize:10}}><I n="edit-2" s={11}/></Btn>}
      <Btn onClick={onDuplicate} style={{fontSize:10}} title="Dupliquer"><I n="copy" s={11}/></Btn>
      {canEdit && <Btn onClick={onToggleDefault} style={{fontSize:10}} title={t.showByDefault ? 'Retirer par défaut' : 'Activer par défaut'}><I n={t.showByDefault ? 'star' : 'star'} s={11} style={{color:t.showByDefault?'#F59E0B':T.text3}}/></Btn>}
      {canEdit && <Btn onClick={onDelete} style={{fontSize:10,color:'#EF4444'}}><I n="trash-2" s={11}/></Btn>}
    </div>
  );
}

function pillStyle(T, active) {
  return { padding:'3px 8px', borderRadius:10, border:`1px solid ${active?T.accent:T.border}`, background:active?T.accent+'18':'transparent', color:active?T.accent:T.text2, fontSize:10, fontWeight:600, cursor:'pointer' };
}
