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

export default function AdminAiAgentsScreen({ calendars, company, showNotif }) {

          const [agents, setAgents] = useState([]);
          const [loading, setLoading] = useState(true);
          const [subTab, setSubTab] = useState('list');
          const [selectedAgent, setSelectedAgent] = useState(null);
          const [sessions, setSessions] = useState([]);
          const [sessionDetail, setSessionDetail] = useState(null);
          const [form, setForm] = useState({
            name: '', type: 'client', category: 'general', systemPrompt: '', greeting: '',
            questions: [], personality: '', language: 'fr', voice: 'alloy', ttsEngine: 'openai', maxDuration: 600,
            calendarId: '', scenario: '', difficulty: 'medium'
          });
          const [editingId, setEditingId] = useState(null);
          const [saving, setSaving] = useState(false);

          useEffect(() => {
            if (!company?.id) return;   // V1.8.7 — defense systémique company=null
            api(`/api/ai-agents?companyId=${company.id}`).then(r => {
              if (Array.isArray(r)) setAgents(r);
              setLoading(false);
            }).catch(() => setLoading(false));
          }, []);

          const CATEGORIES = [
            { id:'rh', label:'RH / Recrutement', icon:'briefcase', color:'#7C3AED', desc:'Entretiens de pré-sélection, évaluation candidats' },
            { id:'sav', label:'SAV / Support', icon:'headphones', color:'#EF4444', desc:'Service après-vente, résolution de problèmes, tickets' },
            { id:'vente', label:'Vente / Commercial', icon:'trending-up', color:'#22C55E', desc:'Qualification prospects, argumentation commerciale' },
            { id:'conseil', label:'Conseil / Info', icon:'info', color:'#3B82F6', desc:'Répondre aux questions, orienter les clients' },
            { id:'training', label:'Entraînement', icon:'target', color:'#F59E0B', desc:'Simulation pour entraîner les collaborateurs' },
          ];

          const OPENAI_VOICES = [
            { id:'alloy', label:'Alloy (Neutre)', gender:'neutre' },
            { id:'nova', label:'Nova (Femme)', gender:'femme' },
            { id:'shimmer', label:'Shimmer (Femme)', gender:'femme' },
            { id:'echo', label:'Echo (Homme)', gender:'homme' },
            { id:'fable', label:'Fable (Homme)', gender:'homme' },
            { id:'onyx', label:'Onyx (Homme grave)', gender:'homme' },
          ];
          const ELEVENLABS_VOICES = [
            { id:'21m00Tcm4TlvDq8ikWAM', label:'Rachel (Femme FR)', gender:'femme' },
            { id:'EXAVITQu4vr4xnSDxMaL', label:'Sarah (Femme douce)', gender:'femme' },
            { id:'ErXwobaYiN019PkySvjV', label:'Antoni (Homme)', gender:'homme' },
            { id:'VR6AewLTigWG4xSOukaG', label:'Arnold (Homme grave)', gender:'homme' },
            { id:'pNInz6obpgDQGcFmaJgB', label:'Adam (Homme pro)', gender:'homme' },
            { id:'yoZ06aMxZJJ28mfd3POQ', label:'Sam (Homme neutre)', gender:'homme' },
          ];
          const VOICES = form.ttsEngine === 'elevenlabs' ? ELEVENLABS_VOICES : OPENAI_VOICES;

          const loadSessions = (agentId) => {
            api(`/api/ai-agents/${agentId}/sessions`).then(r => {
              if (Array.isArray(r)) setSessions(r);
            }).catch(() => {});
          };

          const subTabs = [
            { id:'list', label:'Mes Agents', icon:'bot' },
            { id:'create', label:'Créer', icon:'plus-circle' },
          ];

          return <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
              <div>
                <h1 style={{fontSize:22,fontWeight:700,letterSpacing:-0.5}}>Agents IA</h1>
                <p style={{fontSize:12,color:T.text3,marginTop:2}}>Créez des agents IA conversationnels pour vos clients et vos équipes</p>
              </div>
              <Btn primary onClick={() => { setForm({name:'',type:'client',category:'general',systemPrompt:'',greeting:'',questions:[],personality:'',language:'fr',voice:'alloy',ttsEngine:'openai',maxDuration:600,calendarId:'',scenario:'',difficulty:'medium'}); setEditingId(null); setSubTab('create'); }}>
                <I n="plus" s={14}/> Nouvel Agent
              </Btn>
            </div>

            <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'1px solid '+T.border,paddingBottom:8}}>
              {subTabs.map(t => (
                <div key={t.id} onClick={() => (typeof setSubTab==='function'?setSubTab:function(){})(t.id)} style={{display:'flex',alignItems:'center',gap:5,padding:'8px 16px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:subTab===t.id?700:500,color:subTab===t.id?T.accent:T.text3,background:subTab===t.id?T.accentBg:'transparent'}}>
                  <I n={t.icon} s={14}/>{t.label}
                </div>
              ))}
              {selectedAgent && <div onClick={() => (typeof setSubTab==='function'?setSubTab:function(){})('detail')} style={{display:'flex',alignItems:'center',gap:5,padding:'8px 16px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:subTab==='detail'?700:500,color:subTab==='detail'?T.accent:T.text3,background:subTab==='detail'?T.accentBg:'transparent'}}>
                <I n="eye" s={14}/>Détail
              </div>}
            </div>

            {subTab === 'list' && <div>
              {loading ? <div style={{textAlign:'center',padding:40,color:T.text3}}>Chargement...</div>
              : agents.length === 0 ? <div style={{textAlign:'center',padding:60}}>
                <I n="bot" s={48} color={T.text3}/>
                <p style={{fontSize:14,color:T.text3,marginTop:12}}>Aucun agent IA créé</p>
                <Btn primary onClick={() => setSubTab('create')} style={{marginTop:12}}><I n="plus" s={14}/> Créer mon premier agent</Btn>
              </div>
              : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:16}}>
                {agents.map(agent => {
                  const cat = CATEGORIES.find(c => c.id === agent.category) || CATEGORIES[0];
                  return <Card key={agent.id} style={{padding:0,overflow:'hidden',cursor:'pointer'}} onClick={() => { setSelectedAgent(agent); loadSessions(agent.id); setSubTab('detail'); }}>
                    <div style={{padding:'16px 20px',borderBottom:'1px solid '+T.border}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                        <div style={{width:40,height:40,borderRadius:12,background:cat.color+'15',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <I n={cat.icon} s={20} color={cat.color}/>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,fontWeight:700,color:T.text}}>{agent.name}</div>
                          <div style={{fontSize:11,color:T.text3}}>{cat.label} · {agent.type==='training'?'Entraînement':'Client'}</div>
                        </div>
                        <Badge color={agent.status==='active'?'#22C55E':agent.status==='paused'?'#F59E0B':'#94A3B8'}>{agent.status==='active'?'Actif':agent.status==='paused'?'Pause':'Brouillon'}</Badge>
                      </div>
                      {agent.greeting && <div style={{fontSize:11,color:T.text2,fontStyle:'italic',lineHeight:1.4}}>"{agent.greeting.substring(0,80)}{agent.greeting.length>80?'...':''}"</div>}
                    </div>
                    <div style={{padding:'10px 20px',display:'flex',gap:16,fontSize:10,color:T.text3,alignItems:'center'}}>
                      <span><I n="phone" s={10}/> {agent.totalCalls} appels</span>
                      {agent.type==='training' && agent.avgScore > 0 && <span><I n="star" s={10}/> {Math.round(agent.avgScore)}%</span>}
                      <span><I n="mic" s={10}/> {VOICES.find(v=>v.id===agent.voice)?.label||agent.voice}</span>
                      <div style={{marginLeft:'auto'}} onClick={e => e.stopPropagation()}>
                        <Btn small primary onClick={async () => {
                          const phone = prompt('Numéro pour tester l\'agent :\n\nEx: +33612345678');
                          if (!phone) return;
                          try {
                            const r = await api(`/api/ai-agents/${agent.id}/call`, { method:'POST', body:{ phoneNumber: phone } });
                            if (r?.success) showNotif('Appel en cours vers ' + phone + ' — Décrochez !', 'success');
                            else showNotif('Erreur: ' + (r?.error||'échec'), 'danger');
                          } catch (e) { showNotif('Erreur: ' + e.message, 'danger'); }
                        }}><I n="phone" s={11}/> Tester</Btn>
                      </div>
                    </div>
                  </Card>;
                })}
              </div>}
            </div>}

            {subTab === 'create' && <div style={{maxWidth:700}}>
              <h2 style={{fontSize:16,fontWeight:700,marginBottom:16,color:T.text}}>{editingId ? 'Modifier l\'agent' : 'Nouvel Agent IA'}</h2>

              <div style={{marginBottom:20}}>
                <label style={{fontSize:12,fontWeight:700,color:T.text3,marginBottom:8,display:'block'}}>Type d'agent</label>
                <div style={{display:'flex',gap:8}}>
                  {[{id:'client',label:'Agent Client',desc:'Pour vos clients/prospects'},{id:'training',label:'Agent Entraînement',desc:'Pour former vos équipes'}].map(t => (
                    <div key={t.id} onClick={() => setForm(f => ({...f, type:t.id, category: t.id==='training'?'training':f.category}))} style={{flex:1,padding:'14px 16px',borderRadius:12,border:`2px solid ${form.type===t.id?T.accent:T.border}`,background:form.type===t.id?T.accentBg:'transparent',cursor:'pointer'}}>
                      <div style={{fontSize:13,fontWeight:700,color:form.type===t.id?T.accent:T.text}}>{t.label}</div>
                      <div style={{fontSize:11,color:T.text3,marginTop:2}}>{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {form.type === 'client' && <div style={{marginBottom:20}}>
                <label style={{fontSize:12,fontWeight:700,color:T.text3,marginBottom:8,display:'block'}}>Catégorie</label>
                <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
                  {CATEGORIES.filter(c => c.id !== 'training').map(c => (
                    <div key={c.id} onClick={() => setForm(f => ({...f, category:c.id}))} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:10,border:`2px solid ${form.category===c.id?c.color:T.border}`,background:form.category===c.id?c.color+'08':'transparent',cursor:'pointer'}}>
                      <I n={c.icon} s={18} color={c.color}/>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:form.category===c.id?c.color:T.text}}>{c.label}</div>
                        <div style={{fontSize:10,color:T.text3}}>{c.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>}

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:4,display:'block'}}>Nom de l'agent</label>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name:e.target.value}))} placeholder="Ex: Agent RH Entretien" style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.surface,color:T.text,fontSize:13,outline:'none'}}/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:4,display:'block'}}>Moteur vocal</label>
                  <select value={form.ttsEngine||'openai'} onChange={e => setForm(f => ({...f, ttsEngine:e.target.value, voice: e.target.value==='elevenlabs'?'21m00Tcm4TlvDq8ikWAM':'alloy'}))} style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.surface,color:T.text,fontSize:13}}>
                    <option value="openai">🤖 OpenAI TTS</option>
                    <option value="elevenlabs">🎙️ ElevenLabs (voix ultra-réalistes)</option>
                  </select>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:4,display:'block'}}>Voix</label>
                  <select value={form.voice} onChange={e => setForm(f => ({...f, voice:e.target.value}))} style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.surface,color:T.text,fontSize:13}}>
                    {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
                <div/>
              </div>

              <div style={{marginBottom:16}}>
                <label style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:4,display:'block'}}>Phrase d'accueil</label>
                <input value={form.greeting} onChange={e => setForm(f => ({...f, greeting:e.target.value}))} placeholder="Ex: Bonjour, je suis l'agent RH de l'entreprise..." style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.surface,color:T.text,fontSize:13,outline:'none'}}/>
              </div>

              <div style={{marginBottom:16}}>
                <label style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:4,display:'block'}}>Instructions personnalisées (optionnel — enrichit le prompt automatique)</label>
                <textarea value={form.systemPrompt} onChange={e => setForm(f => ({...f, systemPrompt:e.target.value}))} rows={4} placeholder="Instructions spécifiques pour l'IA..." style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.surface,color:T.text,fontSize:12,resize:'vertical',outline:'none',lineHeight:1.5}}/>
              </div>

              <div style={{marginBottom:16}}>
                <label style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:4,display:'block'}}>Questions à poser ({form.questions.length})</label>
                {form.questions.map((q,i) => (
                  <div key={i} style={{display:'flex',gap:6,marginBottom:4}}>
                    <input value={q} onChange={e => { const qs=[...form.questions]; qs[i]=e.target.value; setForm(f=>({...f,questions:qs})); }} style={{flex:1,padding:'8px 10px',borderRadius:6,border:'1px solid '+T.border,background:T.surface,color:T.text,fontSize:12,outline:'none'}}/>
                    <Btn small danger onClick={() => setForm(f => ({...f, questions:f.questions.filter((_,j)=>j!==i)}))}><I n="x" s={12}/></Btn>
                  </div>
                ))}
                <Btn small onClick={() => setForm(f => ({...f, questions:[...f.questions,'']}))}><I n="plus" s={12}/> Ajouter une question</Btn>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:4,display:'block'}}>Personnalité / Ton</label>
                  <input value={form.personality} onChange={e => setForm(f => ({...f, personality:e.target.value}))} placeholder="Ex: Professionnel et bienveillant" style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.surface,color:T.text,fontSize:13,outline:'none'}}/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:4,display:'block'}}>Durée max (secondes)</label>
                  <input type="number" value={form.maxDuration} onChange={e => setForm(f => ({...f, maxDuration:parseInt(e.target.value)||600}))} style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.surface,color:T.text,fontSize:13,outline:'none'}}/>
                </div>
              </div>

              {form.type === 'training' && <div style={{marginBottom:16}}>
                <label style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:4,display:'block'}}>Scénario d'entraînement</label>
                <textarea value={form.scenario} onChange={e => setForm(f => ({...f, scenario:e.target.value}))} rows={3} placeholder="Ex: Tu es un prospect qui hésite entre 2 offres concurrentes. Tu as des objections sur le prix..." style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.surface,color:T.text,fontSize:12,resize:'vertical',outline:'none',lineHeight:1.5}}/>
                <div style={{display:'flex',gap:8,marginTop:8}}>
                  <label style={{fontSize:11,fontWeight:700,color:T.text3}}>Difficulté :</label>
                  {['easy','medium','hard'].map(d => (
                    <div key={d} onClick={() => setForm(f => ({...f, difficulty:d}))} style={{padding:'4px 12px',borderRadius:6,border:`1px solid ${form.difficulty===d?T.accent:T.border}`,background:form.difficulty===d?T.accentBg:'transparent',color:form.difficulty===d?T.accent:T.text3,fontSize:11,fontWeight:600,cursor:'pointer'}}>
                      {d==='easy'?'Facile':d==='medium'?'Moyen':'Difficile'}
                    </div>
                  ))}
                </div>
              </div>}

              {/* Section Accès — Numéro / Calendrier */}
              {form.type === 'client' && <div style={{marginBottom:16,padding:16,borderRadius:12,background:T.bg,border:'1px solid '+T.border}}>
                <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:12,display:'flex',alignItems:'center',gap:6}}><I n="link" s={14} color={T.accent}/> Mode d'accès</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:4,display:'block'}}>Numéro Twilio dédié</label>
                    <input value={form.twilioNumber||''} onChange={e => setForm(f => ({...f, twilioNumber:e.target.value}))} placeholder="Ex: +33159580038" style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.surface,color:T.text,fontSize:12,outline:'none'}}/>
                    <div style={{fontSize:9,color:T.text3,marginTop:2}}>Les clients appellent ce numéro → l'agent IA répond</div>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:4,display:'block'}}>Calendrier lié</label>
                    <select value={form.calendarId||''} onChange={e => setForm(f => ({...f, calendarId:e.target.value}))} style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.surface,color:T.text,fontSize:12}}>
                      <option value="">— Aucun calendrier —</option>
                      {(calendars||[]).map(c => <option key={c.id} value={c.id}>{c.name} ({c.duration||30}min)</option>)}
                    </select>
                    <div style={{fontSize:9,color:T.text3,marginTop:2}}>Le client prend RDV → l'agent IA appelle à l'heure</div>
                  </div>
                </div>
              </div>}

              <div style={{display:'flex',gap:8,marginTop:20}}>
                <Btn onClick={() => setSubTab('list')}>Annuler</Btn>
                <Btn primary disabled={saving || !form.name.trim()} onClick={async () => {
                  setSaving(true);
                  try {
                    const body = { ...form, companyId: company.id, questions: form.questions.filter(q=>q.trim()) };
                    const r = editingId
                      ? await api(`/api/ai-agents/${editingId}`, { method:'PUT', body })
                      : await api('/api/ai-agents', { method:'POST', body });
                    if (r?.id || r?.success) {
                      const updated = await api(`/api/ai-agents?companyId=${company.id}`);
                      if (Array.isArray(updated)) setAgents(updated);
                      showNotif(editingId ? 'Agent modifié' : 'Agent créé !', 'success');
                      setSubTab('list');
                      setEditingId(null);
                    }
                  } catch (e) { showNotif('Erreur: ' + e.message, 'danger'); }
                  setSaving(false);
                }}>{saving ? <Spinner size={14} color="#fff"/> : <I n="check" s={14}/>} {editingId ? 'Modifier' : 'Créer l\'agent'}</Btn>
              </div>
            </div>}

            {subTab === 'detail' && selectedAgent && <div>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
                <div onClick={() => setSubTab('list')} style={{cursor:'pointer',padding:4}}><I n="arrow-left" s={18} color={T.text3}/></div>
                <div style={{flex:1}}>
                  <h2 style={{fontSize:18,fontWeight:700,color:T.text}}>{selectedAgent.name}</h2>
                  <div style={{fontSize:12,color:T.text3}}>{CATEGORIES.find(c=>c.id===selectedAgent.category)?.label} · {selectedAgent.totalCalls} appels</div>
                </div>
                <Btn small onClick={() => { setForm({...selectedAgent, questions: selectedAgent.questions || JSON.parse(selectedAgent.questions_json||'[]')}); setEditingId(selectedAgent.id); setSubTab('create'); }}><I n="edit" s={12}/> Modifier</Btn>
                <Btn small danger onClick={() => { if(confirm('Supprimer cet agent ?')) { api(`/api/ai-agents/${selectedAgent.id}`, {method:'DELETE'}).then(()=>{ setAgents(a=>a.filter(x=>x.id!==selectedAgent.id)); setSubTab('list'); showNotif('Agent supprimé'); }); } }}><I n="trash" s={12}/></Btn>
              </div>

              <Card style={{marginBottom:16,padding:16}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                  <div><div style={{fontSize:10,color:T.text3,fontWeight:700}}>VOIX</div><div style={{fontSize:12,color:T.text}}>{VOICES.find(v=>v.id===selectedAgent.voice)?.label||selectedAgent.voice}</div></div>
                  <div><div style={{fontSize:10,color:T.text3,fontWeight:700}}>DURÉE MAX</div><div style={{fontSize:12,color:T.text}}>{Math.round(selectedAgent.maxDuration/60)} min</div></div>
                  <div><div style={{fontSize:10,color:T.text3,fontWeight:700}}>STATUT</div><Badge color={selectedAgent.status==='active'?'#22C55E':'#F59E0B'}>{selectedAgent.status==='active'?'Actif':'Pause'}</Badge></div>
                </div>
                {selectedAgent.greeting && <div style={{marginTop:12,padding:10,borderRadius:8,background:T.bg,fontSize:12,color:T.text2,fontStyle:'italic'}}>"{selectedAgent.greeting}"</div>}
              </Card>

              <h3 style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:12}}>Historique des conversations ({sessions.length})</h3>
              {sessions.length === 0 ? <div style={{textAlign:'center',padding:30,color:T.text3,fontSize:12}}>Aucune conversation pour le moment</div>
              : sessions.map(s => (
                <Card key={s.id} style={{marginBottom:8,padding:'12px 16px',cursor:'pointer'}} onClick={() => setSessionDetail(s)}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <I n={s.collaboratorId?'user':'phone'} s={14} color={T.text3}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:600,color:T.text}}>{s.callerName||s.collaboratorId||'Client'}</div>
                      <div style={{fontSize:10,color:T.text3}}>{new Date(s.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · {Math.ceil(s.duration/60)}min</div>
                    </div>
                    {s.score?.overall !== undefined && <div style={{fontSize:14,fontWeight:800,color:s.score.overall>=70?'#22C55E':s.score.overall>=40?'#F59E0B':'#EF4444'}}>{s.score.overall}%</div>}
                    {s.transcriptionPreview && <div style={{fontSize:10,color:T.text3,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.transcriptionPreview}</div>}
                  </div>
                </Card>
              ))}

              {sessionDetail && <Modal title="Détail de la conversation" onClose={() => setSessionDetail(null)} width={650}>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:12,color:T.text3}}>{new Date(sessionDetail.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})} · {Math.ceil(sessionDetail.duration/60)} min</div>
                </div>
                {(typeof sessionDetail!=='undefined'?sessionDetail:{}).summary && <div style={{marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:700,marginBottom:6,color:T.text}}>Compte-rendu</div>
                  <div style={{padding:12,borderRadius:8,background:T.bg,fontSize:12,color:T.text2,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{(typeof sessionDetail!=='undefined'?sessionDetail:{}).summary}</div>
                </div>}
                {(typeof sessionDetail!=='undefined'?sessionDetail:{}).score?.overall !== undefined && <div style={{marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:700,marginBottom:6,color:T.text}}>Score d'entraînement</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                    {Object.entries((typeof sessionDetail!=='undefined'?sessionDetail:{}).score).filter(([k])=>k!=='overall'&&k!=='recommendations').map(([k,v]) => (
                      <div key={k} style={{padding:8,borderRadius:8,background:T.bg,textAlign:'center'}}>
                        <div style={{fontSize:16,fontWeight:800,color:v>=70?'#22C55E':v>=40?'#F59E0B':'#EF4444'}}>{v}%</div>
                        <div style={{fontSize:9,color:T.text3,fontWeight:600}}>{k.replace(/_/g,' ').toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
                </div>}
                {(typeof sessionDetail!=='undefined'?sessionDetail:{}).evaluation && <div style={{marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:700,marginBottom:6,color:T.text}}>Évaluation détaillée</div>
                  <div style={{padding:12,borderRadius:8,background:T.bg,fontSize:12,color:T.text2,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{(typeof sessionDetail!=='undefined'?sessionDetail:{}).evaluation}</div>
                </div>}
                {(typeof sessionDetail!=='undefined'?sessionDetail:{}).transcription && <div>
                  <div style={{fontSize:12,fontWeight:700,marginBottom:6,color:T.text}}>Transcription</div>
                  <div style={{padding:12,borderRadius:8,background:T.bg,fontSize:11,color:T.text2,lineHeight:1.6,whiteSpace:'pre-wrap',maxHeight:300,overflow:'auto'}}>{(typeof sessionDetail!=='undefined'?sessionDetail:{}).transcription}</div>
                </div>}
              </Modal>}
            </div>}
          </div>;
        
}
