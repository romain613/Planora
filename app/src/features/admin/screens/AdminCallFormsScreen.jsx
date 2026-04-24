import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { T } from "../../../theme";
import { formatPhoneFR, displayPhone } from "../../../shared/utils/phone";
import { isValidEmail, isValidPhone } from "../../../shared/utils/validators";
import { COMMON_TIMEZONES, genCode } from "../../../shared/utils/constants";
import { DAYS_FR, DAYS_SHORT, MONTHS_FR, getDow, fmtDate } from "../../../shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES } from "../../../shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../../shared/utils/notifications";
import {
  COMPANIES, INIT_COLLABS, defAvail, INIT_AVAILS, INIT_CALS, INIT_BOOKINGS,
  INIT_WORKFLOWS, INIT_ROUTING, INIT_POLLS, INIT_CONTACTS, COMPANY_SETTINGS,
  INIT_ALL_COMPANIES, INIT_ALL_USERS, INIT_ACTIVITY_LOG
} from "../../../data/fixtures";
import {
  API_BASE, recUrl, collectEnv, api,
  getAutoTicketCompanyId, setAutoTicketCompanyId
} from "../../../shared/services/api";
import {
  HookIsolator, Logo, I, Avatar, Badge, Btn, Stars, Toggle, LoadBar, Card,
  Spinner, Req, Skeleton, Input, Stat, Modal, ConfirmModal, EmptyState,
  HelpTip, ValidatedInput, ErrorBoundary
} from "../../../shared/ui";

export default function AdminCallFormsScreen({ askConfirm, collabs, company, pushNotification }) {

          const [cfLoading, setCfLoading] = useState(true);
          const [callForms, setCallForms] = useState([]);
          const [cfSubTab, setCfSubTab] = useState('list'); // list | create | edit | responses
          const [cfSelectedId, setCfSelectedId] = useState(null);
          const [cfResponses, setCfResponses] = useState([]);
          const [cfExpandedResp, setCfExpandedResp] = useState(null);
          const [cfForm, setCfForm] = useState({ name:'', description:'', questions:[], assignedCollabs:[], active:true });
          const [cfEditingId, setCfEditingId] = useState(null);

          useEffect(() => {
            if (!company?.id) return;   // V1.8.7 — defense systémique company=null
            setCfLoading(true);
            api(`/api/call-forms?companyId=${company.id}`).then(r => {
              if (Array.isArray(r)) setCallForms(r);
              setCfLoading(false);
            }).catch(() => setCfLoading(false));
          }, []);

          const loadResponses = (formId) => {
            setCfSelectedId(formId);
            setCfSubTab('responses');
            api(`/api/call-forms/${formId}/responses?companyId=${company.id}`).then(r => {
              if (Array.isArray(r)) setCfResponses(r);
            }).catch(() => setCfResponses([]));
          };

          const resetForm = () => setCfForm({ name:'', description:'', questions:[], assignedCollabs:[], active:true });

          const addQuestion = () => {
            setCfForm(f => ({ ...f, questions: [...f.questions, { id:'q'+Date.now(), label:'', type:'texte', options:'', required:false }] }));
          };
          const updateQuestion = (idx, key, val) => {
            setCfForm(f => ({ ...f, questions: f.questions.map((q,i) => i===idx ? { ...q, [key]:val } : q) }));
          };
          const removeQuestion = (idx) => {
            setCfForm(f => ({ ...f, questions: f.questions.filter((_,i) => i!==idx) }));
          };
          const moveQuestion = (idx, dir) => {
            setCfForm(f => {
              const qs = [...f.questions];
              const ni = idx + dir;
              if (ni < 0 || ni >= qs.length) return f;
              [qs[idx], qs[ni]] = [qs[ni], qs[idx]];
              return { ...f, questions: qs };
            });
          };

          const toggleCollab = (cid) => {
            setCfForm(f => ({
              ...f,
              assignedCollabs: f.assignedCollabs.includes(cid)
                ? f.assignedCollabs.filter(x => x !== cid)
                : [...f.assignedCollabs, cid]
            }));
          };

          const handleSave = () => {
            if (!cfForm.name.trim()) { pushNotification('Erreur','Le nom est obligatoire','danger'); return; }
            if (cfForm.questions.some(q => !q.label.trim())) { pushNotification('Erreur','Toutes les questions doivent avoir un libellé','danger'); return; }
            const body = {
              companyId: company.id,
              name: cfForm.name,
              description: cfForm.description,
              fields: cfForm.questions,
              assignedCollabs: cfForm.assignedCollabs,
              active: cfForm.active ? 1 : 0
            };
            if (cfEditingId) {
              api(`/api/call-forms/${cfEditingId}`, { method:'PUT', body: {
                name: body.name,
                description: body.description,
                fields: body.fields,
                assignedCollabs: body.assignedCollabs,
                active: body.active
              }}).then(r => {
                if (r?.success || r?.id) {
                  setCallForms(prev => prev.map(f => f.id === cfEditingId ? { ...f, ...body, fields: body.fields, fields_json: body.fields, assignedCollabs: body.assignedCollabs } : f));
                  pushNotification('Formulaire modifié', cfForm.name, 'success');
                  setCfSubTab('list'); resetForm(); setCfEditingId(null);
                }
              });
            } else {
              api('/api/call-forms', { method:'POST', body }).then(r => {
                if (r?.id || r?.success) {
                  const newForm = { ...body, id: r.id || 'cf'+Date.now(), fields_json: JSON.stringify(body.fields), assignedCollabs_json: JSON.stringify(body.assignedCollabs), created_at: new Date().toISOString(), response_count: 0 };
                  setCallForms(prev => [...prev, newForm]);
                  pushNotification('Formulaire créé', cfForm.name, 'success');
                  setCfSubTab('list'); resetForm();
                }
              });
            }
          };

          const handleDelete = (formId) => {
            askConfirm('Supprimer ce formulaire ?', 'Cette action est irréversible. Toutes les réponses associées seront également supprimées.', () => {
              api(`/api/call-forms/${formId}`, { method:'DELETE' }).then(() => {
                setCallForms(prev => prev.filter(f => f.id !== formId));
                pushNotification('Formulaire supprimé', '', 'success');
              });
            });
          };

          const startEdit = (form) => {
            let questions = [];
            try { questions = typeof form.fields_json === 'string' ? JSON.parse(form.fields_json) : (form.fields || []); } catch { questions = []; }
            let assignedCollabs = [];
            try { assignedCollabs = typeof form.assignedCollabs_json === 'string' ? JSON.parse(form.assignedCollabs_json) : (form.assignedCollabs || []); } catch { assignedCollabs = []; }
            setCfForm({ name: form.name || '', description: form.description || '', questions, assignedCollabs, active: form.active !== 0 });
            setCfEditingId(form.id);
            setCfSubTab('create');
          };

          const exportCSV = () => {
            if (!cfResponses.length) return;
            const selForm = callForms.find(f => f.id === cfSelectedId);
            let fields = [];
            try { fields = typeof selForm?.fields_json === 'string' ? JSON.parse(selForm.fields_json) : (selForm?.fields || []); } catch { fields = []; }
            const headers = ['Contact', 'Téléphone', 'Email', 'Collaborateur', 'Date', ...fields.map(f => f.label)];
            const rows = cfResponses.map(r => {
              let answers = {};
              try { answers = typeof r.answers_json === 'string' ? JSON.parse(r.answers_json) : (r.answers || {}); } catch { answers = {}; }
              return [r.contact_name||'', r.contact_phone||'', r.contact_email||'', r.collaborator_name||'', r.created_at||'', ...fields.map(f => answers[f.id] || answers[f.label] || '')];
            });
            const csv = [headers.join(';'), ...rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(';'))].join('\n');
            navigator.clipboard.writeText(csv).then(() => pushNotification('Export CSV', 'Copié dans le presse-papier', 'success'));
          };

          const QUESTION_TYPES = [
            { value:'texte', label:'Texte libre', icon:'type' },
            { value:'choix_multiple', label:'Choix multiple', icon:'list' },
            { value:'oui_non', label:'Oui / Non', icon:'check-circle' },
            { value:'note_10', label:'Note /10', icon:'star' },
            { value:'date', label:'Date', icon:'calendar' },
            { value:'nombre', label:'Nombre', icon:'hash' },
          ];

          const uniqueContacts = new Set(cfResponses.map(r => r.contact_phone || r.contact_email || r.contact_name)).size;

          return <div>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
              <div style={{width:40,height:40,borderRadius:12,background:T.accent+'12',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="clipboard-list" s={20} style={{color:T.accent}}/></div>
              <div>
                <div style={{fontSize:18,fontWeight:800,color:T.text}}>Formulaires d'appel</div>
                <div style={{fontSize:12,color:T.text3}}>Créez des formulaires que vos collaborateurs rempliront pendant les appels</div>
              </div>
              <Btn primary style={{marginLeft:'auto'}} onClick={() => { resetForm(); setCfEditingId(null); setCfSubTab('create'); }}>
                <I n="plus" s={14}/> Créer un formulaire
              </Btn>
            </div>

            {/* Sub-tabs */}
            <div style={{display:'flex',gap:0,borderBottom:'1px solid '+T.border,marginBottom:16}}>
              {[{id:'list',icon:'list',label:'Mes formulaires'},{id:'create',icon:'plus-circle',label:cfEditingId?'Modifier':'Créer'},{id:'responses',icon:'bar-chart-2',label:'Réponses'}].map(t=>(
                <div key={t.id} onClick={()=>setCfSubTab(t.id)} style={{padding:'10px 16px',fontSize:12,fontWeight:cfSubTab===t.id?700:500,cursor:'pointer',borderBottom:cfSubTab===t.id?'2px solid '+T.accent:'2px solid transparent',color:cfSubTab===t.id?T.accent:T.text3,display:'flex',alignItems:'center',gap:5}}>
                  <I n={t.icon} s={13}/> {t.label}
                </div>
              ))}
            </div>

            {/* ── LIST ── */}
            {cfSubTab === 'list' && <div>
              {cfLoading ? <div style={{textAlign:'center',padding:60,color:T.text3}}>Chargement...</div>
              : callForms.length === 0 ? <div style={{textAlign:'center',padding:60}}>
                <I n="clipboard-list" s={48} color={T.text3}/>
                <p style={{fontSize:14,color:T.text3,marginTop:12}}>Aucun formulaire d'appel créé</p>
                <Btn primary onClick={() => { resetForm(); setCfEditingId(null); setCfSubTab('create'); }} style={{marginTop:12}}><I n="plus" s={14}/> Créer mon premier formulaire</Btn>
              </div>
              : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:16}}>
                {callForms.map(form => {
                  let questions = [];
                  try { questions = typeof form.fields_json === 'string' ? JSON.parse(form.fields_json) : (form.fields || []); } catch { questions = []; }
                  let assignedCollabs = [];
                  try { assignedCollabs = typeof form.assignedCollabs_json === 'string' ? JSON.parse(form.assignedCollabs_json) : (form.assignedCollabs || []); } catch { assignedCollabs = []; }
                  const isActive = form.active !== 0;
                  return <Card key={form.id} style={{padding:0,overflow:'hidden'}}>
                    <div style={{padding:16}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                        <div style={{fontSize:15,fontWeight:700,color:T.text}}>{form.name}</div>
                        <div style={{display:'flex',gap:4}}>
                          <div style={{padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:700,background:isActive?'#22C55E18':'#EF444418',color:isActive?'#22C55E':'#EF4444'}}>{isActive?'Actif':'Inactif'}</div>
                        </div>
                      </div>
                      {form.description && <div style={{fontSize:12,color:T.text3,marginBottom:10,lineHeight:1.4,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{form.description}</div>}
                      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
                        <div style={{display:'flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:6,background:T.bg,fontSize:11,color:T.text2}}>
                          <I n="help-circle" s={12}/> {questions.length} question{questions.length>1?'s':''}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:6,background:T.bg,fontSize:11,color:T.text2}}>
                          <I n="file-text" s={12}/> {form.response_count||0} réponse{(form.response_count||0)>1?'s':''}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:6,background:T.bg,fontSize:11,color:T.text2}}>
                          <I n="users" s={12}/> {assignedCollabs.length} collaborateur{assignedCollabs.length>1?'s':''}
                        </div>
                      </div>
                      <div style={{display:'flex',gap:6}}>
                        <Btn small onClick={() => startEdit(form)}><I n="edit-2" s={12}/> Modifier</Btn>
                        <Btn small onClick={() => loadResponses(form.id)}><I n="eye" s={12}/> Réponses</Btn>
                        <Btn small danger onClick={() => handleDelete(form.id)}><I n="trash-2" s={12}/> Supprimer</Btn>
                      </div>
                    </div>
                  </Card>;
                })}
              </div>}
            </div>}

            {/* ── CREATE / EDIT ── */}
            {cfSubTab === 'create' && <div>
              <Card style={{padding:20}}>
                <div style={{fontSize:15,fontWeight:700,marginBottom:16,color:T.text}}>{cfEditingId ? 'Modifier le formulaire' : 'Nouveau formulaire d\'appel'}</div>

                {/* Name */}
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Nom du formulaire *</label>
                  <input value={cfForm.name} onChange={e => setCfForm(f=>({...f,name:e.target.value}))} placeholder="Ex: Qualification prospect, Suivi client..." style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
                </div>

                {/* Description */}
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Description</label>
                  <textarea value={cfForm.description} onChange={e => setCfForm(f=>({...f,description:e.target.value}))} placeholder="Objectif du formulaire, quand l'utiliser..." rows={3} style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:13,outline:'none',resize:'vertical',boxSizing:'border-box'}}/>
                </div>

                {/* Questions */}
                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <label style={{fontSize:12,fontWeight:600,color:T.text2}}>Questions ({cfForm.questions.length})</label>
                    <Btn small onClick={addQuestion}><I n="plus" s={12}/> Ajouter une question</Btn>
                  </div>
                  {cfForm.questions.length === 0 && <div style={{padding:20,textAlign:'center',borderRadius:8,border:'2px dashed '+T.border,color:T.text3,fontSize:12}}>Aucune question — cliquez sur "Ajouter une question"</div>}
                  {cfForm.questions.map((q, idx) => (
                    <div key={q.id||idx} style={{padding:12,borderRadius:10,border:'1px solid '+T.border,background:T.bg,marginBottom:8}}>
                      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                        <span style={{fontSize:11,fontWeight:700,color:T.accent,minWidth:20}}>Q{idx+1}</span>
                        <input value={q.label} onChange={e => updateQuestion(idx,'label',e.target.value)} placeholder="Libellé de la question" style={{flex:1,padding:'7px 10px',borderRadius:6,border:'1px solid '+T.border,background:T.card,color:T.text,fontSize:12,outline:'none'}}/>
                        <select value={q.type} onChange={e => updateQuestion(idx,'type',e.target.value)} style={{padding:'7px 10px',borderRadius:6,border:'1px solid '+T.border,background:T.card,color:T.text,fontSize:12,outline:'none'}}>
                          {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:T.text2,cursor:'pointer',whiteSpace:'nowrap'}}>
                          <input type="checkbox" checked={q.required||false} onChange={e => updateQuestion(idx,'required',e.target.checked)}/> Requis
                        </label>
                        <div style={{display:'flex',gap:2}}>
                          <div onClick={() => moveQuestion(idx,-1)} style={{cursor:'pointer',padding:4,borderRadius:4,color:T.text3,opacity:idx===0?0.3:1}}><I n="chevron-up" s={14}/></div>
                          <div onClick={() => moveQuestion(idx,1)} style={{cursor:'pointer',padding:4,borderRadius:4,color:T.text3,opacity:idx===cfForm.questions.length-1?0.3:1}}><I n="chevron-down" s={14}/></div>
                          <div onClick={() => removeQuestion(idx)} style={{cursor:'pointer',padding:4,borderRadius:4,color:'#EF4444'}}><I n="x" s={14}/></div>
                        </div>
                      </div>
                      {q.type === 'choix_multiple' && (
                        <div style={{marginLeft:28}}>
                          <label style={{fontSize:11,color:T.text3,marginBottom:2,display:'block'}}>Options (séparées par des virgules)</label>
                          <input value={q.options||''} onChange={e => updateQuestion(idx,'options',e.target.value)} placeholder="Option 1, Option 2, Option 3..." style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid '+T.border,background:T.card,color:T.text,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Assigned collaborators */}
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:6,display:'block'}}>Collaborateurs assignés</label>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {collabs.map(c => {
                      const sel = cfForm.assignedCollabs.includes(c.id);
                      return <div key={c.id} onClick={() => toggleCollab(c.id)} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,cursor:'pointer',border:'1px solid '+(sel?T.accent:T.border),background:sel?T.accentBg:T.bg,fontSize:12,fontWeight:sel?600:400,color:sel?T.accent:T.text2,transition:'all .15s'}}>
                        <I n={sel?'check-square':'square'} s={14}/> {c.name}
                      </div>;
                    })}
                    {collabs.length === 0 && <div style={{fontSize:12,color:T.text3}}>Aucun collaborateur</div>}
                  </div>
                </div>

                {/* Active toggle */}
                <div style={{marginBottom:20,display:'flex',alignItems:'center',gap:8}}>
                  <label style={{fontSize:12,fontWeight:600,color:T.text2}}>Statut :</label>
                  <div onClick={() => setCfForm(f=>({...f,active:!f.active}))} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',padding:'6px 12px',borderRadius:8,background:cfForm.active?'#22C55E18':'#EF444418',border:'1px solid '+(cfForm.active?'#22C55E40':'#EF444440')}}>
                    <div style={{width:32,height:18,borderRadius:9,background:cfForm.active?'#22C55E':'#9CA3AF',position:'relative',transition:'all .2s'}}>
                      <div style={{width:14,height:14,borderRadius:7,background:'#fff',position:'absolute',top:2,left:cfForm.active?16:2,transition:'all .2s'}}/>
                    </div>
                    <span style={{fontSize:12,fontWeight:600,color:cfForm.active?'#22C55E':'#EF4444'}}>{cfForm.active?'Actif':'Inactif'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{display:'flex',gap:8}}>
                  <Btn primary onClick={handleSave}><I n="save" s={14}/> {cfEditingId ? 'Enregistrer les modifications' : 'Créer le formulaire'}</Btn>
                  <Btn onClick={() => { setCfSubTab('list'); resetForm(); setCfEditingId(null); }}>Annuler</Btn>
                </div>
              </Card>
            </div>}

            {/* ── RESPONSES ── */}
            {cfSubTab === 'responses' && <div>
              {/* Form selector */}
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
                <label style={{fontSize:12,fontWeight:600,color:T.text2}}>Formulaire :</label>
                <select value={cfSelectedId||''} onChange={e => { if(e.target.value) loadResponses(e.target.value); }} style={{padding:'8px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:13,outline:'none',minWidth:200}}>
                  <option value="">-- Sélectionner --</option>
                  {callForms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                {cfSelectedId && <Btn small onClick={exportCSV}><I n="download" s={12}/> Export CSV</Btn>}
              </div>

              {!cfSelectedId ? <div style={{textAlign:'center',padding:40,color:T.text3,fontSize:13}}>Sélectionnez un formulaire pour voir ses réponses</div>
              : <>
                {/* Stats */}
                <div style={{display:'flex',gap:12,marginBottom:16}}>
                  <div style={{padding:12,borderRadius:10,background:T.accent+'10',border:'1px solid '+T.accent+'20',textAlign:'center',minWidth:120}}>
                    <div style={{fontSize:22,fontWeight:800,color:T.accent}}>{(typeof cfResponses!=='undefined'?cfResponses:{}).length}</div>
                    <div style={{fontSize:10,fontWeight:600,color:T.text3}}>Réponses total</div>
                  </div>
                  <div style={{padding:12,borderRadius:10,background:'#22C55E10',border:'1px solid #22C55E20',textAlign:'center',minWidth:120}}>
                    <div style={{fontSize:22,fontWeight:800,color:'#22C55E'}}>{uniqueContacts}</div>
                    <div style={{fontSize:10,fontWeight:600,color:T.text3}}>Contacts uniques</div>
                  </div>
                </div>

                {/* Table */}
                {(typeof cfResponses!=='undefined'?cfResponses:{}).length === 0 ? <div style={{textAlign:'center',padding:40,color:T.text3,fontSize:13}}>Aucune réponse pour ce formulaire</div>
                : <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr style={{borderBottom:'2px solid '+T.border}}>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:T.text2,fontSize:11}}>Contact</th>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:T.text2,fontSize:11}}>Téléphone</th>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:T.text2,fontSize:11}}>Email</th>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:T.text2,fontSize:11}}>Collaborateur</th>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:T.text2,fontSize:11}}>Date</th>
                        <th style={{padding:'10px 12px',textAlign:'center',fontWeight:700,color:T.text2,fontSize:11}}>Détail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(typeof cfResponses!=='undefined'?cfResponses:{}).map((r, ri) => {
                        const isExpanded = (typeof cfExpandedResp!=='undefined'?cfExpandedResp:null) === r.id;
                        let answers = {};
                        try { answers = typeof r.answers_json === 'string' ? JSON.parse(r.answers_json) : (r.answers || {}); } catch { answers = {}; }
                        const selForm = (typeof callForms!=='undefined'?callForms:{}).find(f => f.id === (typeof cfSelectedId!=='undefined'?cfSelectedId:null));
                        let fields = [];
                        try { fields = typeof selForm?.fields_json === 'string' ? JSON.parse(selForm.fields_json) : (selForm?.fields || []); } catch { fields = []; }
                        return <React.Fragment key={r.id||ri}>
                          <tr style={{borderBottom:'1px solid '+T.border,background:isExpanded?T.accentBg:'transparent',cursor:'pointer'}} onClick={() => setCfExpandedResp(isExpanded ? null : r.id)}>
                            <td style={{padding:'10px 12px',fontWeight:600,color:T.text}}>{r.contact_name||'—'}</td>
                            <td style={{padding:'10px 12px',color:T.text2}}>{r.contact_phone||'—'}</td>
                            <td style={{padding:'10px 12px',color:T.text2}}>{r.contact_email||'—'}</td>
                            <td style={{padding:'10px 12px',color:T.text2}}>{r.collaborator_name||'—'}</td>
                            <td style={{padding:'10px 12px',color:T.text3,fontSize:11}}>{r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                            <td style={{padding:'10px 12px',textAlign:'center'}}><I n={isExpanded?'chevron-up':'chevron-down'} s={14} color={T.text3}/></td>
                          </tr>
                          {isExpanded && <tr>
                            <td colSpan={6} style={{padding:'12px 20px',background:T.bg,borderBottom:'1px solid '+T.border}}>
                              <div style={{fontSize:12,fontWeight:700,marginBottom:8,color:T.text}}>Réponses détaillées</div>
                              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:8}}>
                                {fields.map((f, fi) => {
                                  const val = answers[f.id] || answers[f.label] || '';
                                  return <div key={fi} style={{padding:10,borderRadius:8,background:T.card,border:'1px solid '+T.border}}>
                                    <div style={{fontSize:10,fontWeight:700,color:T.accent,marginBottom:2,textTransform:'uppercase'}}>{f.label}</div>
                                    <div style={{fontSize:13,color:T.text,fontWeight:500}}>{val || <span style={{color:T.text3,fontStyle:'italic'}}>Non renseigné</span>}</div>
                                  </div>;
                                })}
                                {fields.length === 0 && Object.entries(answers).map(([k,v]) => (
                                  <div key={k} style={{padding:10,borderRadius:8,background:T.card,border:'1px solid '+T.border}}>
                                    <div style={{fontSize:10,fontWeight:700,color:T.accent,marginBottom:2,textTransform:'uppercase'}}>{k}</div>
                                    <div style={{fontSize:13,color:T.text,fontWeight:500}}>{String(v)}</div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>}
                        </React.Fragment>;
                      })}
                    </tbody>
                  </table>
                </div>}
              </>}
            </div>}
          </div>;
        
}
