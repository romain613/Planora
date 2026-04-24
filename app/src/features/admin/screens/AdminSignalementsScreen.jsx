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

export default function AdminSignalementsScreen({ company, showNotif }) {

          const [sigData, setSigData] = useState(null);
          const [sigLoading, setSigLoading] = useState(true);
          const [sigSubTab, setSigSubTab] = useState('dashboard');
          const [sigSelectedCollab, setSigSelectedCollab] = useState(null);
          const [sigAlertDetail, setSigAlertDetail] = useState(null);
          const [sigCollabAlerts, setSigCollabAlerts] = useState([]);
          const [sigNewWord, setSigNewWord] = useState('');
          const [sigMultiCollabs, setSigMultiCollabs] = useState([]);
          const [sigMultiWord, setSigMultiWord] = useState('');

          useEffect(() => {
            if (!company?.id) return;   // V1.8.6 — defense contre transition supra (company peut être null)
            setSigLoading(true);
            api(`/api/secure-ia/signalements?companyId=${company.id}`).then(d => { setSigData(d); setSigLoading(false); }).catch(() => setSigLoading(false));
          }, []);

          const loadCollabDetail = (collabId) => {
            setSigSelectedCollab(collabId);
            setSigSubTab('detail');
            api(`/api/secure-ia/signalements/${collabId}?companyId=${company.id}`).then(d => setSigCollabAlerts(d||[])).catch(()=>setSigCollabAlerts([]));
          };
          const markReviewed = (alertId) => {
            api(`/api/secure-ia/alerts/${alertId}/review`, { method:'PUT', body:{ reviewed:1 } }).then(()=>{
              setSigCollabAlerts(prev=>prev.map(a=>a.id===alertId?{...a,reviewed:1}:a));
              if(sigAlertDetail?.id===alertId) setSigAlertDetail(p=>({...p,reviewed:1}));
              showNotif('Signalement marqué comme traité','success');
            });
          };
          const saveCompanyWords = (words) => {
            api('/api/secure-ia/company-words', { method:'PUT', body:{ companyId:company.id, words } }).then(d=>{
              if(d?.success) { setSigData(p=>({...p,config:{...p.config,companyWords:d.words}})); showNotif('Mots globaux mis à jour','success'); }
            });
          };
          const saveMultiCollabWords = () => {
            if(!sigMultiCollabs.length||!sigMultiWord.trim()) return;
            const words = sigMultiWord.split(',').map(w=>w.trim()).filter(w=>w);
            api('/api/secure-ia/words-multi', { method:'PUT', body:{ companyId:company.id, collaboratorIds:sigMultiCollabs, words } }).then(d=>{
              if(d?.success) { showNotif(`Mots mis à jour pour ${d.updated} collaborateur(s)`,'success'); setSigMultiWord(''); setSigMultiCollabs([]); }
            });
          };

          if (sigLoading) return <div style={{textAlign:'center',padding:60,fontSize:14,color:T.text3}}>Chargement des signalements...</div>;
          if (!sigData) return <div style={{textAlign:'center',padding:60,fontSize:14,color:T.text3}}>Erreur de chargement</div>;

          const { stats, collabStats, topWords, recentAlerts, config } = sigData;
          const severityColors = { high:'#DC2626', medium:'#F59E0B', low:'#3B82F6', none:'#9CA3AF' };
          const severityLabels = { high:'Critique', medium:'Moyen', low:'Faible' };

          return <div>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
              <div style={{width:40,height:40,borderRadius:12,background:'#DC262612',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="shield-alert" s={20} style={{color:'#DC2626'}}/></div>
              <div>
                <div style={{fontSize:18,fontWeight:800,color:T.text}}>Signalements</div>
                <div style={{fontSize:12,color:T.text3}}>Surveillance des mots et phrases interdits par collaborateur</div>
              </div>
              {stats.pending > 0 && <div style={{marginLeft:'auto',padding:'4px 12px',borderRadius:20,background:'#DC2626',color:'#fff',fontSize:12,fontWeight:700}}>{stats.pending} non traité{stats.pending>1?'s':''}</div>}
            </div>

            {/* Sub-tabs */}
            <div style={{display:'flex',gap:0,borderBottom:'1px solid '+T.border,marginBottom:16}}>
              {[{id:'dashboard',icon:'bar-chart-2',label:'Dashboard'},{id:'config',icon:'settings',label:'Configuration'},{id:'detail',icon:'user',label:'Détail collaborateur'}].map(t=>(
                <div key={t.id} onClick={()=>setSigSubTab(t.id)} style={{padding:'10px 16px',fontSize:12,fontWeight:sigSubTab===t.id?700:500,cursor:'pointer',borderBottom:sigSubTab===t.id?'2px solid #DC2626':'2px solid transparent',color:sigSubTab===t.id?'#DC2626':T.text3,display:'flex',alignItems:'center',gap:5}}>
                  <I n={t.icon} s={13}/> {t.label}
                </div>
              ))}
            </div>

            {/* ── DASHBOARD ── */}
            {sigSubTab==='dashboard' && <div>
              {/* Stats cards */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,marginBottom:16}}>
                {[{label:'Total',value:stats.total,color:'#DC2626',icon:'alert-triangle'},{label:'Critiques',value:stats.high,color:'#DC2626',icon:'alert-octagon'},{label:'Moyens',value:stats.medium,color:'#F59E0B',icon:'alert-circle'},{label:'Faibles',value:stats.low,color:'#3B82F6',icon:'info'},{label:'Non traités',value:stats.pending,color:'#8B5CF6',icon:'clock'}].map((s,i)=>(
                  <div key={i} style={{padding:12,borderRadius:12,background:s.color+'08',border:'1px solid '+s.color+'20',textAlign:'center'}}>
                    <I n={s.icon} s={16} style={{color:s.color,marginBottom:4}}/>
                    <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div>
                    <div style={{fontSize:10,color:T.text3,fontWeight:600}}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Top mots détectés */}
              {topWords.length > 0 && <div style={{marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:T.text}}>Top mots/phrases détectés</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {topWords.map((w,i)=>(
                    <div key={i} style={{padding:'4px 10px',borderRadius:8,background:'#DC262610',border:'1px solid #DC262620',fontSize:11}}>
                      <span style={{fontWeight:700,color:'#DC2626'}}>{w.word}</span> <span style={{color:T.text3}}>({w.count}x)</span>
                    </div>
                  ))}
                </div>
              </div>}

              {/* Par collaborateur */}
              <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:T.text}}>Par collaborateur</div>
              {collabStats.length === 0 ? (
                <div style={{textAlign:'center',padding:30,color:T.text3,fontSize:12}}>Aucun signalement pour le moment</div>
              ) : collabStats.map(cs=>(
                <div key={cs.collaboratorId} onClick={()=>loadCollabDetail(cs.collaboratorId)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:T.card||T.bg,border:'1px solid '+T.border,marginBottom:6,cursor:'pointer',transition:'all .12s'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='#DC2626';}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;}}>
                  <div style={{width:32,height:32,borderRadius:10,background:(cs.color||'#6366F1')+'20',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:12,color:cs.color||'#6366F1'}}>{(cs.name||'?')[0]}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:T.text}}>{cs.name||cs.email}</div>
                    <div style={{fontSize:10,color:T.text3}}>Dernier : {cs.lastAlert ? new Date(cs.lastAlert).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}) : '-'}</div>
                  </div>
                  <div style={{display:'flex',gap:4}}>
                    {cs.highCount>0 && <span style={{padding:'2px 6px',borderRadius:6,background:'#DC262615',color:'#DC2626',fontSize:10,fontWeight:700}}>{cs.highCount}</span>}
                    {cs.mediumCount>0 && <span style={{padding:'2px 6px',borderRadius:6,background:'#F59E0B15',color:'#F59E0B',fontSize:10,fontWeight:700}}>{cs.mediumCount}</span>}
                    {cs.lowCount>0 && <span style={{padding:'2px 6px',borderRadius:6,background:'#3B82F615',color:'#3B82F6',fontSize:10,fontWeight:700}}>{cs.lowCount}</span>}
                  </div>
                  <div style={{fontSize:14,fontWeight:800,color:'#DC2626'}}>{cs.alertCount}</div>
                  {cs.pendingCount>0 && <div style={{width:8,height:8,borderRadius:4,background:'#DC2626',boxShadow:'0 0 4px #DC262660'}}/>}
                  <I n="chevron-right" s={14} style={{color:T.text3}}/>
                </div>
              ))}

              {/* Dernières alertes */}
              {recentAlerts.length > 0 && <div style={{marginTop:16}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:T.text}}>Derniers signalements</div>
                {recentAlerts.slice(0,10).map(a=>(
                  <div key={a.id} onClick={()=>{api(`/api/secure-ia/alerts/${a.id}`).then(d=>setSigAlertDetail(d));}} style={{padding:'8px 12px',borderRadius:8,background:T.bg,marginBottom:4,cursor:'pointer',borderLeft:'3px solid '+(severityColors[a.severity]||'#999'),display:'flex',alignItems:'center',gap:8}}
                    onMouseEnter={e=>{e.currentTarget.style.background=T.border+'40';}} onMouseLeave={e=>{e.currentTarget.style.background=T.bg;}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,fontWeight:600,color:T.text}}>{a.collabName||'?'} → {a.contactName||a.contactPhone||'Inconnu'}</div>
                      <div style={{fontSize:9,color:T.text3}}>{new Date(a.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · {(a.detectedWords||[]).map(w=>w.word).join(', ')}</div>
                    </div>
                    <span style={{padding:'2px 6px',borderRadius:4,background:(severityColors[a.severity]||'#999')+'15',color:severityColors[a.severity]||'#999',fontSize:9,fontWeight:700}}>{severityLabels[a.severity]||a.severity}</span>
                    {!a.reviewed && <div style={{width:6,height:6,borderRadius:3,background:'#DC2626'}}/>}
                  </div>
                ))}
              </div>}
            </div>}

            {/* ── DETAIL COLLABORATEUR ── */}
            {sigSubTab==='detail' && <div>
              {!sigSelectedCollab ? (
                <div style={{textAlign:'center',padding:30,color:T.text3}}>
                  <I n="user" s={24} style={{color:T.text3,marginBottom:8}}/>
                  <div style={{fontSize:12}}>Sélectionnez un collaborateur depuis le dashboard</div>
                </div>
              ) : <div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                  <div onClick={()=>setSigSubTab('dashboard')} style={{cursor:'pointer',padding:4}}><I n="arrow-left" s={16} style={{color:T.text3}}/></div>
                  <div style={{fontSize:14,fontWeight:700,color:T.text}}>{collabStats.find(c=>c.collaboratorId===sigSelectedCollab)?.name||'Collaborateur'}</div>
                </div>
                {sigCollabAlerts.length===0 ? (
                  <div style={{textAlign:'center',padding:30,color:T.text3,fontSize:12}}>Aucun signalement</div>
                ) : sigCollabAlerts.map(a=>(
                  <div key={a.id} style={{padding:12,borderRadius:10,background:T.card||T.bg,border:'1px solid '+T.border,marginBottom:8,borderLeft:'3px solid '+(severityColors[a.severity]||'#999')}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <span style={{fontSize:11,fontWeight:700,color:T.text}}>{a.contactName||a.contactPhone||'Inconnu'}</span>
                      <span style={{fontSize:9,color:T.text3}}>{new Date(a.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                      <span style={{marginLeft:'auto',padding:'2px 6px',borderRadius:4,background:(severityColors[a.severity])+'15',color:severityColors[a.severity],fontSize:9,fontWeight:700}}>{severityLabels[a.severity]||a.severity}</span>
                      {a.reviewed ? <span style={{fontSize:8,color:'#22C55E',fontWeight:600}}>Traité</span> : <span onClick={()=>markReviewed(a.id)} style={{fontSize:8,color:'#DC2626',cursor:'pointer',fontWeight:600,textDecoration:'underline'}}>Marquer traité</span>}
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:6}}>
                      {(a.detectedWords||[]).map((w,j)=>(
                        <span key={j} style={{padding:'2px 7px',borderRadius:6,background:'#DC262610',color:'#DC2626',fontSize:10,fontWeight:600}}>{w.word} ({w.count}x)</span>
                      ))}
                    </div>
                    {a.transcription && (()=>{
                      const words = (a.detectedWords||[]).map(w=>w.word.toLowerCase());
                      const text = a.transcription.substring(0,500) + (a.transcription.length>500?'...':'');
                      if (words.length === 0) return <div style={{fontSize:10,color:T.text2,lineHeight:1.4,maxHeight:80,overflow:'auto',background:T.bg,padding:8,borderRadius:6,whiteSpace:'pre-wrap'}}>{text}</div>;
                      const regex = new RegExp('('+words.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')', 'gi');
                      const parts = text.split(regex);
                      return <div style={{fontSize:10,color:T.text2,lineHeight:1.6,maxHeight:120,overflow:'auto',background:T.bg,padding:10,borderRadius:8,whiteSpace:'pre-wrap'}}>
                        {parts.map((part,pi)=>words.includes(part.toLowerCase())
                          ? <span key={pi} style={{background:'#DC262625',color:'#DC2626',fontWeight:800,padding:'1px 3px',borderRadius:3,textDecoration:'underline',textDecorationColor:'#DC2626'}}>{part}</span>
                          : <span key={pi}>{part}</span>
                        )}
                      </div>;
                    })()}
                    {/* Audio player */}
                    {a.callLogId && <div style={{marginTop:6}}>
                      <audio controls src={recUrl(a.callLogId)} style={{width:'100%',height:32,borderRadius:8}} preload="none"/>
                    </div>}
                    {/* Explication collab */}
                    {a.collabExplanation && <div style={{marginTop:6,padding:8,borderRadius:6,background:'#3B82F608',border:'1px solid #3B82F620'}}>
                      <div style={{fontSize:9,fontWeight:700,color:'#3B82F6',marginBottom:2}}>Réponse du collaborateur</div>
                      <div style={{fontSize:10,color:T.text}}>{a.collabExplanation}</div>
                    </div>}
                  </div>
                ))}
              </div>}
            </div>}

            {/* ── CONFIGURATION ── */}
            {sigSubTab==='config' && <div>
              {/* Mots globaux entreprise */}
              <div style={{padding:14,borderRadius:12,background:T.card||T.bg,border:'1px solid '+T.border,marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                  <I n="globe" s={14} style={{color:'#DC2626'}}/>
                  <span style={{fontSize:13,fontWeight:700,color:T.text}}>Mots interdits globaux (toute l'entreprise)</span>
                </div>
                <div style={{fontSize:10,color:T.text3,marginBottom:8}}>Ces mots s'appliquent à TOUS les collaborateurs de l'entreprise.</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                  {(config.companyWords||[]).map((w,i)=>(
                    <span key={i} style={{padding:'3px 8px',borderRadius:6,background:'#DC262610',color:'#DC2626',fontSize:11,display:'flex',alignItems:'center',gap:4}}>
                      {w} <span onClick={()=>{const nw=(config.companyWords||[]).filter((_,j)=>j!==i);saveCompanyWords(nw);}} style={{cursor:'pointer',fontWeight:700,fontSize:13}}>×</span>
                    </span>
                  ))}
                </div>
                <div style={{display:'flex',gap:6}}>
                  <input value={sigNewWord} onChange={e=>setSigNewWord(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&sigNewWord.trim()){saveCompanyWords([...(config.companyWords||[]),sigNewWord.trim()]);setSigNewWord('');}}} placeholder="Ajouter un mot ou phrase + Entrée" style={{flex:1,padding:'6px 10px',borderRadius:8,border:'1px solid '+T.border,fontSize:11,background:T.bg,color:T.text}}/>
                </div>
              </div>

              {/* Config par collaborateur */}
              <div style={{padding:14,borderRadius:12,background:T.card||T.bg,border:'1px solid '+T.border,marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                  <I n="users" s={14} style={{color:'#8B5CF6'}}/>
                  <span style={{fontSize:13,fontWeight:700,color:T.text}}>Mots interdits par collaborateur</span>
                </div>
                <div style={{fontSize:10,color:T.text3,marginBottom:8}}>Sélectionnez un ou plusieurs collaborateurs et ajoutez des mots spécifiques.</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                  {(config.collabs||[]).map(c=>(
                    <div key={c.id} onClick={()=>setSigMultiCollabs(prev=>prev.includes(c.id)?prev.filter(x=>x!==c.id):[...prev,c.id])} style={{padding:'4px 10px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:600,background:sigMultiCollabs.includes(c.id)?'#8B5CF620':'transparent',border:'1px solid '+(sigMultiCollabs.includes(c.id)?'#8B5CF6':T.border),color:sigMultiCollabs.includes(c.id)?'#8B5CF6':T.text3}}>
                      {c.name||c.email} {c.secure_ia_phone?'✓':''} {c.words.length>0?`(${c.words.length})`:''}</div>
                  ))}
                </div>
                {sigMultiCollabs.length > 0 && <div>
                  <input value={sigMultiWord} onChange={e=>setSigMultiWord(e.target.value)} placeholder="Mots séparés par virgule" style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1px solid '+T.border,fontSize:11,background:T.bg,color:T.text,marginBottom:6}}/>
                  <Btn small onClick={saveMultiCollabWords}><I n="check" s={11}/> Appliquer à {sigMultiCollabs.length} collaborateur(s)</Btn>
                </div>}
              </div>

              {/* Tableau récap par collaborateur */}
              <div style={{padding:14,borderRadius:12,background:T.card||T.bg,border:'1px solid '+T.border}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:T.text}}>Récapitulatif par collaborateur</div>
                {(config.collabs||[]).map(c=>(
                  <div key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid '+T.border+'40'}}>
                    <div style={{width:24,height:24,borderRadius:8,background:'#6366F120',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#6366F1'}}>{(c.name||'?')[0]}</div>
                    <div style={{flex:1,fontSize:11,fontWeight:600,color:T.text}}>{c.name||c.email}</div>
                    <div style={{fontSize:10,color:c.secure_ia_phone?'#22C55E':'#999'}}>{c.secure_ia_phone?'Actif':'Inactif'}</div>
                    {(()=>{ const cnt = (recentAlerts||[]).filter(a=>a.collaboratorId===c.id).length; return cnt > 0 ? <div style={{fontSize:10,fontWeight:700,color:'#EF4444',background:'#EF444415',padding:'1px 8px',borderRadius:8}}>{cnt} signalement{cnt>1?'s':''}</div> : null; })()}
                    <div style={{fontSize:10,color:T.text3}}>{c.words.length} mot{c.words.length>1?'s':''}</div>
                    {c.words.length>0 && <div style={{display:'flex',gap:2}}>{c.words.slice(0,3).map((w,i)=><span key={i} style={{padding:'1px 5px',borderRadius:4,background:'#DC262608',color:'#DC2626',fontSize:8}}>{w}</span>)}{c.words.length>3&&<span style={{fontSize:8,color:T.text3}}>+{c.words.length-3}</span>}</div>}
                  </div>
                ))}
              </div>
            </div>}

            {/* Alert detail modal */}
            {sigAlertDetail && <Modal title="Détail du signalement" onClose={()=>setSigAlertDetail(null)} width={600}>
              <div style={{marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <span style={{padding:'3px 8px',borderRadius:6,background:(severityColors[sigAlertDetail.severity])+'15',color:severityColors[sigAlertDetail.severity],fontSize:11,fontWeight:700}}>{severityLabels[sigAlertDetail.severity]||sigAlertDetail.severity}</span>
                  <span style={{fontSize:11,color:T.text3}}>{new Date(sigAlertDetail.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                  {!sigAlertDetail.reviewed && <Btn small onClick={()=>markReviewed(sigAlertDetail.id)}><I n="check" s={11}/> Marquer traité</Btn>}
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:12}}>
                  {(sigAlertDetail.detectedWords||JSON.parse(sigAlertDetail.detectedWords_json||'[]')).map((w,i)=>(
                    <span key={i} style={{padding:'3px 10px',borderRadius:8,background:w.semantic?'#8B5CF610':'#DC262610',color:w.semantic?'#8B5CF6':'#DC2626',fontSize:11,fontWeight:600}}>{w.semantic?'🧠 ':''}{w.word} — {w.count} occurrence{w.count>1?'s':''}{w.explanation?' ('+w.explanation+')':''}</span>
                  ))}
                </div>
              </div>
              {/* Explication du collaborateur */}
              {sigAlertDetail.collabExplanation && <div style={{marginBottom:12,padding:12,borderRadius:10,background:'#3B82F610',border:'1px solid #3B82F630'}}>
                <div style={{fontSize:11,fontWeight:700,color:'#3B82F6',marginBottom:4}}>💬 Réponse du collaborateur</div>
                <div style={{fontSize:12,color:T.text,lineHeight:1.5}}>{sigAlertDetail.collabExplanation}</div>
              </div>}
              <div style={{fontSize:12,fontWeight:700,marginBottom:6,color:T.text}}>Transcription complète</div>
              {(()=>{
                const dWords = (sigAlertDetail.detectedWords||[]).map(w=>w.word.toLowerCase());
                const txt = sigAlertDetail.transcription||'Transcription non disponible';
                if (!dWords.length || !sigAlertDetail.transcription) return <div style={{fontSize:11,color:T.text2,lineHeight:1.6,whiteSpace:'pre-wrap',maxHeight:300,overflow:'auto',background:T.bg,padding:12,borderRadius:10,border:'1px solid '+T.border}}>{txt}</div>;
                const rgx = new RegExp('('+dWords.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')', 'gi');
                const pts = txt.split(rgx);
                return <div style={{fontSize:11,color:T.text2,lineHeight:1.6,whiteSpace:'pre-wrap',maxHeight:300,overflow:'auto',background:T.bg,padding:12,borderRadius:10,border:'1px solid '+T.border}}>
                  {pts.map((p,i)=>dWords.includes(p.toLowerCase())
                    ? <span key={i} style={{background:'#DC262630',color:'#DC2626',fontWeight:800,padding:'1px 4px',borderRadius:3,textDecoration:'underline wavy #DC2626'}}>{p}</span>
                    : <span key={i}>{p}</span>
                  )}
                </div>;
              })()}
              {/* Audio dans modal */}
              {sigAlertDetail.callLogId && <div style={{marginTop:10}}>
                <div style={{fontSize:12,fontWeight:700,marginBottom:6,color:T.text}}>Écouter l'enregistrement</div>
                <audio controls src={recUrl(sigAlertDetail.callLogId)} style={{width:'100%',borderRadius:8}} preload="none"/>
              </div>}
            </Modal>}
          </div>;
        
}
