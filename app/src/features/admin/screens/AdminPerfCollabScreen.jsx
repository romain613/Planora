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

export default function AdminPerfCollabScreen({ collabs, company, perfExpanded, perfPeriod, pushNotification, setPerfExpanded, setPerfPeriod }) {

          const [subTab, setSubTab] = useState('leaderboard');
          const [loading, setLoading] = useState(true);
          const [perfData, setPerfData] = useState(null);
          const [selectedCollab, setSelectedCollab] = useState(null);
          const [auditData, setAuditData] = useState(null);
          const [modalState, setModalState] = useState(null);
          const [scoreSettings, setScoreSettings] = useState(null);

          const loadDashboard = useCallback(() => {
            setLoading(true);
            api(`/api/perf/dashboard?companyId=${company.id}&period=${perfPeriod}`)
              .then(r => { if (r && !r.error) setPerfData(r); setLoading(false); })
              .catch(() => setLoading(false));
          }, [company.id, perfPeriod]);

          useEffect(() => { loadDashboard(); }, [loadDashboard]);

          const handleSelectAudit = (collabId) => {
            setSelectedCollab(collabId);
            setAuditData(null);
            setSubTab('audit');
            api(`/api/perf/audit/${collabId}?companyId=${company.id}&period=${perfPeriod}`)
              .then(r => { if (r && !r.error) setAuditData(r); });
          };

          const handleAddBonusPenalty = () => {
            if (!modalState?.collaborator_id || !modalState?.value) return;
            const endpoint = modalState.bpType === 'bonus' ? '/api/perf/bonus' : '/api/perf/penalty';
            api(endpoint, { method:'POST', body:{ companyId:company.id, collaborator_id:modalState.collaborator_id, category:modalState.category||'autre', value:parseInt(modalState.value)||0, reason:modalState.reason||'' }})
              .then(r => { if(r?.success) { pushNotification(modalState.bpType==='bonus'?'Bonus ajouté':'Pénalité ajoutée', '', 'success'); setModalState(null); loadDashboard(); } });
          };

          const handleGenerateAudit = () => {
            if (!selectedCollab) return;
            api(`/api/perf/generate-audit/${selectedCollab}`, { method:'POST', body:{ companyId:company.id, period:(typeof perfPeriod!=='undefined'?perfPeriod:null) }})
              .then(r => { if(r?.success && r.report) { setAuditData(prev => prev ? {...prev, aiReport: r.report} : prev); pushNotification('Rapport IA généré', '', 'success'); } else { pushNotification('Erreur', r?.error||'Echec génération', 'error'); } });
          };

          const handleSaveSettings = () => {
            if (!scoreSettings) return;
            const total = Object.values(scoreSettings).reduce((s,v) => s + (parseInt(v)||0), 0);
            if (total !== 100) { pushNotification('Erreur', `Total des poids = ${total}% (doit être 100%)`, 'error'); return; }
            api('/api/perf/settings', { method:'PUT', body:{ companyId:company.id, ...scoreSettings }})
              .then(r => { if(r?.success) { pushNotification('Paramètres sauvegardés', '', 'success'); loadDashboard(); } });
          };

          const PERIOD_OPTIONS = [{id:'day',label:'Jour'},{id:'week',label:'Semaine'},{id:'month',label:'Mois'},{id:'quarter',label:'Trimestre'},{id:'year',label:'Année'}];
          const subTabs = [
            {id:'leaderboard',label:'Classement',icon:'award'},
            {id:'audit',label:'Audit',icon:'shield'},
            {id:'bonus',label:'Bonus & Pénalités',icon:'zap'},
            {id:'insights',label:'Insights',icon:'trending'},
            {id:'settings',label:'Paramètres',icon:'sliders'},
          ];
          const medals = ["\u{1F947}","\u{1F948}","\u{1F949}"];
          const medalColors = ["#F59E0B","#94A3B8","#CD7F32"];
          const BADGE_LABELS = { closer:'\u{1F3AF} Closer', volume:'\u{1F4DE} Volume', qualite:'\u2B50 Qualité', relanceur:'\u{1F504} Relanceur', regulier:'\u{1F552} Régulier', progression:'\u{1F4C8} Progression' };
          const BADGE_COLORS = { closer:'#059669', volume:'#2563EB', qualite:'#F59E0B', relanceur:'#7C3AED', regulier:'#0D9488', progression:'#EC4899' };
          const CATEGORY_LABELS = { vente:'Vente', volume_appels:'Volume appels', rdv:'RDV', objectif:'Objectif', excellence_qualite:'Excellence qualité', faux_appels:'Faux appels', leads_oublies:'Leads oubliés', inactivite:'Inactivité', mauvaise_qualite:'Mauvaise qualité', relances_manquees:'Relances manquées', autre:'Autre' };
          const SCORE_LABELS = { calls:'Appels', quality:'Qualité', conversion:'Conversion', speed:'Rapidité', followup:'Suivi', goals:'Objectifs', discipline:'Discipline', regularity:'Régularité' };
          const SCORE_COLORS = { calls:'#2563EB', quality:'#F59E0B', conversion:'#059669', speed:'#EC4899', followup:'#7C3AED', goals:'#0D9488', discipline:'#6366F1', regularity:'#D97706' };
          const QUALITY_COLORS = { excellent:'#059669', bon:'#2563EB', moyen:'#D97706', faible:'#DC2626' };

          if (loading) return <div style={{padding:60,textAlign:'center'}}><I n="refresh" s={24} style={{animation:'spin 1s linear infinite',color:T.text3}}/><div style={{marginTop:12,color:T.text3,fontSize:13}}>Chargement des performances...</div></div>;

          const lb = perfData?.leaderboard || [];
          const gs = perfData?.globalStats || {};
          const badges = perfData?.badges || {};

          return (
            <div>
              {/* Header */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <div>
                  <h1 style={{fontSize:22,fontWeight:700}}><span style={{fontSize:18,marginRight:6}}>{"\u{1F3C6}"}</span>Perf Collaborateurs</h1>
                  <p style={{fontSize:13,color:T.text2,marginTop:4}}>Classement, audit et performance — {perfData?.period?.label || (typeof perfPeriod!=='undefined'?perfPeriod:null)}</p>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <div style={{display:'flex',gap:2,padding:3,background:T.bg,borderRadius:10,border:`1px solid ${T.border}`}}>
                    {PERIOD_OPTIONS.map(p=>(
                      <div key={p.id} onClick={()=>(typeof setPerfPeriod==='function'?setPerfPeriod:function(){})(p.id)} style={{padding:'6px 12px',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:perfPeriod===p.id?600:400,background:perfPeriod===p.id?T.surface:'transparent',color:perfPeriod===p.id?T.accent:T.text2,boxShadow:perfPeriod===p.id?'0 1px 3px rgba(0,0,0,0.08)':'none',transition:'all .15s'}}>{p.label}</div>
                    ))}
                  </div>
                  <Btn small onClick={loadDashboard}><I n="refresh" s={13}/></Btn>
                </div>
              </div>

              {/* Sub-tabs */}
              <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:`1px solid ${T.border}`,paddingBottom:8,overflowX:'auto'}}>
                {subTabs.map(st=>(
                  <div key={st.id} onClick={()=>(typeof setSubTab==='function'?setSubTab:function(){})(st.id)} style={{padding:'8px 14px',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:subTab===st.id?700:500,background:subTab===st.id?T.accent+'15':'transparent',color:subTab===st.id?T.accent:T.text2,display:'flex',alignItems:'center',gap:6,transition:'all .15s',whiteSpace:'nowrap'}}>
                    <I n={st.icon} s={14}/>{st.label}
                  </div>
                ))}
              </div>

              {/* ═══ LEADERBOARD ═══ */}
              {subTab==='leaderboard' && <div>
                {/* Global stats */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:20}}>
                  {[
                    {l:'Appels valides',v:gs.totalCalls||0,c:'#2563EB',ic:'phone'},
                    {l:'Leads convertis',v:gs.totalConverted||0,c:'#059669',ic:'check-circle'},
                    {l:'Score moyen',v:(gs.avgScore||0)+'%',c:'#7C3AED',ic:'trending'},
                    {l:'Bonus distribués',v:'+'+(gs.totalBonuses||0),c:'#F59E0B',ic:'zap'},
                    {l:'Pénalités',v:gs.totalPenalties||0,c:'#DC2626',ic:'alert-triangle'},
                  ].map((s,i)=><Card key={i} style={{padding:14,textAlign:'center'}}><I n={s.ic} s={18} style={{color:s.c,marginBottom:4}}/><div style={{fontSize:24,fontWeight:800,color:s.c}}>{s.v}</div><div style={{fontSize:11,color:T.text2,marginTop:2}}>{s.l}</div></Card>)}
                </div>

                {/* Badges */}
                {Object.keys(badges).length > 0 && <Card style={{marginBottom:20,padding:16}}>
                  <div style={{fontSize:12,fontWeight:600,color:T.text3,marginBottom:12,textTransform:'uppercase',letterSpacing:0.5}}>Badges de la période</div>
                  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                    {Object.entries(badges).map(([key, data])=>(
                      <div key={key} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderRadius:10,background:(BADGE_COLORS[key]||T.accent)+'12',border:`1px solid ${(BADGE_COLORS[key]||T.accent)}33`}}>
                        <span style={{fontSize:14}}>{BADGE_LABELS[key]?.split(' ')[0]}</span>
                        <div><div style={{fontSize:12,fontWeight:700,color:BADGE_COLORS[key]||T.accent}}>{BADGE_LABELS[key]?.split(' ').slice(1).join(' ')}</div><div style={{fontSize:11,color:T.text2}}>{data.name} ({data.value})</div></div>
                      </div>
                    ))}
                  </div>
                </Card>}

                {/* Podium Top 3 */}
                {lb.length >= 2 && <Card style={{marginBottom:20,background:`linear-gradient(135deg, ${T.surface}, ${T.bg})`,border:`1px solid ${T.border}`}}>
                  <div style={{textAlign:'center',marginBottom:16}}><span style={{fontSize:14,fontWeight:700,color:T.text2}}>{"\u{1F3C6}"} PODIUM — {(perfData?.period?.label||'').toUpperCase()}</span></div>
                  <div style={{display:'flex',justifyContent:'center',alignItems:'flex-end',gap:24}}>
                    {[1,0,2].map(idx=>{
                      const c=lb[idx]; if(!c) return null;
                      const isFirst=idx===0;
                      const podH=[140,100,80][idx]||80;
                      return <div key={c.id} style={{textAlign:'center',width:isFirst?130:110}}>
                        <div style={{position:'relative',display:'inline-block',marginBottom:8}}>
                          <Avatar name={c.name} color={c.color} size={isFirst?56:46}/>
                          <span style={{position:'absolute',top:-8,right:-8,fontSize:isFirst?24:20}}>{medals[idx]}</span>
                        </div>
                        <div style={{fontSize:isFirst?14:13,fontWeight:700,marginBottom:2}}>{c.name.split(' ')[0]}</div>
                        <div style={{fontSize:22,fontWeight:800,color:medalColors[idx],marginBottom:2}}>{c.scoreGlobal}</div>
                        <div style={{fontSize:10,color:T.text3,marginBottom:4}}>points</div>
                        {c.badges.length>0&&<div style={{marginBottom:6}}>{c.badges.map(b=><span key={b} style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:(BADGE_COLORS[b]||T.accent)+'20',color:BADGE_COLORS[b]||T.accent,marginRight:3}}>{BADGE_LABELS[b]?.split(' ')[0]}</span>)}</div>}
                        <div style={{height:podH,background:medalColors[idx]+'22',borderRadius:'10px 10px 0 0',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',border:`1px solid ${medalColors[idx]}33`}}>
                          <div style={{fontSize:12,fontWeight:600,color:T.text2}}>{c.stats.validCalls} appels</div>
                          <div style={{fontSize:11,color:T.text3}}>{c.stats.convertedLeads} conv.</div>
                        </div>
                      </div>;
                    })}
                  </div>
                </Card>}

                {/* Leaderboard Table */}
                <Card style={{padding:0,overflow:'hidden',marginBottom:20}}>
                  <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:15,fontWeight:700}}>{"\u{1F4CA}"} Classement détaillé</span>
                    <Badge color={T.accent}>{lb.length} collaborateurs</Badge>
                  </div>
                  <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:900}}>
                    <thead><tr style={{background:T.bg,borderBottom:`1px solid ${T.border}`}}>
                      {['#','Collaborateur','Score','Trend','Appels','Qualité','Conv.%','Leads','RDV','Bonus','Pénalités',''].map(h=>(
                        <th key={h} style={{padding:'10px 10px',textAlign:h==='#'?'center':'left',fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:0.5}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{lb.map((c,i)=><React.Fragment key={c.id}>
                      <tr onClick={()=>(typeof setPerfExpanded==='function'?setPerfExpanded:function(){})(perfExpanded===c.id?null:c.id)} style={{borderBottom:`1px solid ${T.border}22`,cursor:'pointer',background:perfExpanded===c.id?T.bg:'transparent',transition:'background .15s'}}>
                        <td style={{padding:'12px 10px',textAlign:'center',fontSize:i<3?18:14}}>{i<3?medals[i]:(i+1)}</td>
                        <td style={{padding:'12px 10px'}}><div style={{display:'flex',alignItems:'center',gap:8}}><Avatar name={c.name} color={c.color} size={30}/><div><div style={{fontWeight:600}}>{c.name}</div><div style={{fontSize:11,color:T.text3}}>{c.badges.map(b=><span key={b} style={{marginRight:4}}>{BADGE_LABELS[b]?.split(' ')[0]}</span>)}{c.badges.length===0&&(c.role==='admin'?'Admin':'Membre')}</div></div></div></td>
                        <td style={{padding:'12px 10px'}}><span style={{fontSize:18,fontWeight:800,color:c.scoreGlobal>=75?T.success:c.scoreGlobal>=50?T.warning:T.danger}}>{c.scoreGlobal}</span></td>
                        <td style={{padding:'12px 10px'}}><span style={{fontSize:12,fontWeight:600,color:c.trend>0?T.success:c.trend<0?T.danger:T.text3}}>{c.trend>0?'\u25B2 +':c.trend<0?'\u25BC ':''}{c.trend!==0?Math.abs(c.trend):'\u2014'}</span></td>
                        <td style={{padding:'12px 10px',fontWeight:600}}>{c.stats.validCalls}<span style={{fontSize:10,color:T.text3}}>/{c.stats.totalCalls}</span></td>
                        <td style={{padding:'12px 10px'}}><Badge color={c.scores.quality>=70?T.success:c.scores.quality>=50?T.warning:T.danger}>{c.scores.quality}%</Badge></td>
                        <td style={{padding:'12px 10px'}}><Badge color={c.scores.conversion>=70?T.success:c.scores.conversion>=50?T.warning:T.danger}>{c.scores.conversion}%</Badge></td>
                        <td style={{padding:'12px 10px'}}>{c.stats.convertedLeads}<span style={{fontSize:10,color:T.text3}}>/{c.stats.totalLeads}</span></td>
                        <td style={{padding:'12px 10px',fontWeight:600}}>{c.stats.bookings}</td>
                        <td style={{padding:'12px 10px'}}><span style={{color:T.success,fontWeight:600}}>+{c.bonusTotal}</span></td>
                        <td style={{padding:'12px 10px'}}><span style={{color:T.danger,fontWeight:600}}>{c.penaltyTotal}</span></td>
                        <td style={{padding:'12px 10px'}}><Btn small ghost onClick={(e)=>{e.stopPropagation();handleSelectAudit(c.id);}}>{"\u25B8"} Audit</Btn></td>
                      </tr>
                      {perfExpanded===c.id && <tr><td colSpan={12} style={{padding:'16px 20px',background:T.bg}}>
                        <div style={{fontSize:12,fontWeight:600,color:T.text3,marginBottom:10,textTransform:'uppercase'}}>Détail des 8 scores</div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                          {Object.entries(SCORE_LABELS).map(([key,label])=>{
                            const val=c.scores[key]||0;
                            return <div key={key} style={{padding:'10px 12px',borderRadius:10,background:T.surface,border:`1px solid ${T.border}`}}>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                                <span style={{fontSize:11,color:T.text2}}>{label}</span>
                                <span style={{fontSize:16,fontWeight:800,color:SCORE_COLORS[key]}}>{val}</span>
                              </div>
                              <div style={{height:5,borderRadius:3,background:T.border}}><div style={{width:val+'%',height:5,borderRadius:3,background:SCORE_COLORS[key],transition:'width .3s'}}/></div>
                            </div>;
                          })}
                        </div>
                      </td></tr>}
                    </React.Fragment>)}</tbody>
                  </table>
                  </div>
                </Card>
              </div>}

              {/* ═══ AUDIT ═══ */}
              {subTab==='audit' && <div>
                {!selectedCollab ? <div>
                  <div style={{fontSize:14,fontWeight:600,color:T.text2,marginBottom:16}}>Sélectionnez un collaborateur pour voir son audit détaillé</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12}}>
                    {lb.map(c=><Card key={c.id} onClick={()=>handleSelectAudit(c.id)} style={{padding:16,cursor:'pointer',textAlign:'center',transition:'all .15s',border:`1px solid ${T.border}`}}>
                      <Avatar name={c.name} color={c.color} size={40}/>
                      <div style={{fontSize:14,fontWeight:700,marginTop:8}}>{c.name}</div>
                      <div style={{fontSize:24,fontWeight:800,color:c.scoreGlobal>=75?T.success:c.scoreGlobal>=50?T.warning:T.danger,marginTop:4}}>{c.scoreGlobal}</div>
                      <div style={{fontSize:11,color:T.text3}}>#{c.rank} · {c.trend>0?'+':''}{c.trend} pts</div>
                    </Card>)}
                  </div>
                </div> : <div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20}}>
                    <Btn small ghost onClick={()=>{setSelectedCollab(null);setAuditData(null);}}><I n="arrow-left" s={14}/> Retour</Btn>
                    <span style={{fontSize:15,fontWeight:700}}>{auditData?.collab?.name || 'Chargement...'}</span>
                  </div>

                  {!auditData ? <div style={{padding:40,textAlign:'center'}}><I n="refresh" s={20} style={{animation:'spin 1s linear infinite',color:T.text3}}/></div> : <div>
                    {/* A. Résumé */}
                    <Card style={{marginBottom:16,padding:20}}>
                      <div style={{display:'flex',alignItems:'center',gap:16}}>
                        <Avatar name={auditData.collab.name} color={auditData.collab.color} size={52}/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:18,fontWeight:700}}>{auditData.collab.name}</div>
                          <div style={{fontSize:12,color:T.text3}}>{auditData.collab.email} · {auditData.collab.role==='admin'?'Admin':'Membre'}</div>
                        </div>
                        <div style={{textAlign:'center'}}>
                          <div style={{fontSize:42,fontWeight:800,color:auditData.summary.scoreGlobal>=75?T.success:auditData.summary.scoreGlobal>=50?T.warning:T.danger}}>{auditData.summary.scoreGlobal}</div>
                          <div style={{fontSize:11,color:T.text3}}>#{auditData.summary.rank}/{auditData.summary.total}</div>
                        </div>
                        <div style={{textAlign:'center',padding:'8px 16px',borderRadius:10,background:auditData.summary.trend>=0?T.success+'12':T.danger+'12'}}>
                          <div style={{fontSize:16,fontWeight:700,color:auditData.summary.trend>=0?T.success:T.danger}}>{auditData.summary.trend>0?'+':''}{auditData.summary.trend}</div>
                          <div style={{fontSize:10,color:T.text3}}>vs précédent</div>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:12,marginTop:12}}>
                        <Badge color={T.success}>Bonus: +{auditData.summary.bonusTotal}</Badge>
                        <Badge color={T.danger}>Pénalités: {auditData.summary.penaltyTotal}</Badge>
                        <Badge color={T.accent}>Net: {auditData.summary.bonusTotal + auditData.summary.penaltyTotal}</Badge>
                      </div>
                    </Card>

                    {/* 8 scores */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
                      {Object.entries(SCORE_LABELS).map(([key,label])=>{
                        const val=auditData.scores[key]||0;
                        return <Card key={key} style={{padding:12,textAlign:'center'}}>
                          <div style={{fontSize:11,color:T.text2,marginBottom:4}}>{label}</div>
                          <div style={{position:'relative',width:60,height:60,margin:'0 auto 4px'}}>
                            <svg width="60" height="60" viewBox="0 0 60 60" style={{transform:'rotate(-90deg)'}}>
                              <circle cx="30" cy="30" r="25" fill="none" stroke={T.border} strokeWidth="6"/>
                              <circle cx="30" cy="30" r="25" fill="none" stroke={SCORE_COLORS[key]} strokeWidth="6" strokeDasharray={`${2*3.14159*25*val/100} ${2*3.14159*25}`} strokeLinecap="round"/>
                            </svg>
                            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800,color:SCORE_COLORS[key]}}>{val}</div>
                          </div>
                        </Card>;
                      })}
                    </div>

                    {/* B. Activité */}
                    <Card style={{marginBottom:16,padding:20}}>
                      <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{"\u{1F4CA}"} Activité</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                        {[
                          {l:'Appels sortants',v:auditData.stats.outboundCalls,c:T.accent},
                          {l:'Appels entrants',v:auditData.stats.inboundCalls,c:'#7C3AED'},
                          {l:'Appels valides',v:auditData.stats.validCalls,c:T.success},
                          {l:'Appels invalides',v:auditData.stats.invalidCalls,c:T.danger},
                          {l:'Durée moy.',v:Math.round(auditData.stats.avgDuration/60)+'min',c:T.accent},
                          {l:'SMS envoyés',v:auditData.stats.smsCount,c:'#0D9488'},
                          {l:'Jours actifs',v:auditData.stats.activeDays,c:'#6366F1'},
                          {l:'Mouvements pipeline',v:auditData.stats.pipelineMoves,c:'#EC4899'},
                        ].map((s,i)=><div key={i} style={{padding:10,borderRadius:8,background:s.c+'08',border:`1px solid ${s.c}22`,textAlign:'center'}}>
                          <div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.v}</div>
                          <div style={{fontSize:10,color:T.text2,marginTop:2}}>{s.l}</div>
                        </div>)}
                      </div>
                    </Card>

                    {/* C. Commercial */}
                    <Card style={{marginBottom:16,padding:20}}>
                      <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{"\u{1F4B0}"} Performance commerciale</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                        {[
                          {l:'Leads reçus',v:auditData.stats.totalLeads,c:T.accent},
                          {l:'Leads convertis',v:auditData.stats.convertedLeads,c:T.success},
                          {l:'Leads perdus',v:auditData.stats.lostLeads,c:T.danger},
                          {l:'Leads actifs',v:auditData.stats.activeLeads,c:'#D97706'},
                          {l:'RDV confirmés',v:auditData.stats.bookings,c:'#7C3AED'},
                          {l:'Objectifs atteints',v:`${auditData.stats.goalsCompleted}/${auditData.stats.goalsTotal}`,c:'#0D9488'},
                        ].map((s,i)=><div key={i} style={{padding:12,borderRadius:8,background:s.c+'08',border:`1px solid ${s.c}22`,textAlign:'center'}}>
                          <div style={{fontSize:22,fontWeight:800,color:s.c}}>{s.v}</div>
                          <div style={{fontSize:10,color:T.text2,marginTop:2}}>{s.l}</div>
                        </div>)}
                      </div>
                      {auditData.stats.totalLeads > 0 && <div style={{marginTop:12,padding:'8px 12px',borderRadius:8,background:T.bg}}>
                        <span style={{fontSize:12,color:T.text2}}>Taux de conversion : </span>
                        <span style={{fontSize:14,fontWeight:700,color:T.success}}>{Math.round(auditData.stats.convertedLeads/auditData.stats.totalLeads*100)}%</span>
                      </div>}
                    </Card>

                    {/* D. Qualité appels IA */}
                    <Card style={{marginBottom:16,padding:20}}>
                      <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{"\u2B50"} Qualité appels (IA)</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
                        {[
                          {l:'Qualité IA',v:auditData.stats.avgQualityAI,c:'#F59E0B'},
                          {l:'Conversion IA',v:auditData.stats.avgConversionAI,c:'#059669'},
                          {l:'Sentiment IA',v:auditData.stats.avgSentimentAI,c:'#2563EB'},
                        ].map((s,i)=><div key={i} style={{textAlign:'center'}}>
                          <div style={{position:'relative',width:80,height:80,margin:'0 auto 8px'}}>
                            <svg width="80" height="80" viewBox="0 0 80 80" style={{transform:'rotate(-90deg)'}}>
                              <circle cx="40" cy="40" r="32" fill="none" stroke={T.border} strokeWidth="7"/>
                              <circle cx="40" cy="40" r="32" fill="none" stroke={s.c} strokeWidth="7" strokeDasharray={`${2*3.14159*32*s.v/100} ${2*3.14159*32}`} strokeLinecap="round"/>
                            </svg>
                            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:s.c}}>{s.v}%</div>
                          </div>
                          <div style={{fontSize:12,color:T.text2}}>{s.l}</div>
                        </div>)}
                      </div>
                      {auditData.coaching && auditData.coaching.topTips?.length > 0 && <div style={{marginTop:16}}>
                        <div style={{fontSize:12,fontWeight:600,color:T.text3,marginBottom:8}}>Conseils coaching IA</div>
                        {auditData.coaching.topTips.slice(0,3).map((t,i)=><div key={i} style={{padding:'6px 10px',borderRadius:6,background:T.accentBg,fontSize:12,color:T.accent,marginBottom:4}}>{"\u{1F4A1}"} {t.tip}</div>)}
                      </div>}
                    </Card>

                    {/* F. Bonus/Pénalités */}
                    {auditData.bpHistory?.length > 0 && <Card style={{marginBottom:16,padding:20}}>
                      <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{"\u26A1"} Bonus & Pénalités ({auditData.bpHistory.length})</div>
                      {auditData.bpHistory.slice(0,10).map((bp,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:i<auditData.bpHistory.length-1?`1px solid ${T.border}15`:'none',fontSize:12}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:bp.type==='bonus'?T.success:T.danger}}/>
                        <span style={{fontWeight:600,color:bp.type==='bonus'?T.success:T.danger}}>{bp.type==='bonus'?'+':''}{bp.value}</span>
                        <span style={{color:T.text2}}>{CATEGORY_LABELS[bp.category]||bp.category}</span>
                        <span style={{flex:1,color:T.text3,fontSize:11}}>{bp.reason}</span>
                        <Badge color={bp.is_auto?T.text3:T.accent}>{bp.is_auto?'Auto':'Manuel'}</Badge>
                      </div>)}
                    </Card>}

                    {/* G. Résumé IA */}
                    <Card style={{marginBottom:16,padding:20}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                        <span style={{fontSize:13,fontWeight:700}}>{"\u{1F916}"} Résumé IA</span>
                        <Btn small primary onClick={handleGenerateAudit}><I n="cpu" s={13}/> {auditData.aiReport?'Regénérer':'Générer rapport IA'}</Btn>
                      </div>
                      {auditData.aiReport ? <div>
                        <div style={{padding:'10px 14px',borderRadius:10,background:T.bg,marginBottom:12,fontSize:13,color:T.text2,lineHeight:1.5}}>{auditData.aiReport.summary}</div>
                        {auditData.aiReport.quality_label && <div style={{marginBottom:12}}><Badge color={QUALITY_COLORS[auditData.aiReport.quality_label]||T.accent}>Qualité : {auditData.aiReport.quality_label?.toUpperCase()}</Badge></div>}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                          <div style={{padding:12,borderRadius:10,background:T.success+'08',border:`1px solid ${T.success}22`}}>
                            <div style={{fontSize:12,fontWeight:700,color:T.success,marginBottom:6}}>{"\u2705"} Points forts</div>
                            {(auditData.aiReport.strengths||[]).map((s,i)=><div key={i} style={{fontSize:12,color:T.text2,padding:'3px 0'}}>• {s}</div>)}
                          </div>
                          <div style={{padding:12,borderRadius:10,background:T.danger+'08',border:`1px solid ${T.danger}22`}}>
                            <div style={{fontSize:12,fontWeight:700,color:T.danger,marginBottom:6}}>{"\u274C"} Points faibles</div>
                            {(auditData.aiReport.weaknesses||[]).map((s,i)=><div key={i} style={{fontSize:12,color:T.text2,padding:'3px 0'}}>• {s}</div>)}
                          </div>
                          <div style={{padding:12,borderRadius:10,background:T.accent+'08',border:`1px solid ${T.accent}22`}}>
                            <div style={{fontSize:12,fontWeight:700,color:T.accent,marginBottom:6}}>{"\u{1F4A1}"} Axes d'amélioration</div>
                            {(auditData.aiReport.improvements||[]).map((s,i)=><div key={i} style={{fontSize:12,color:T.text2,padding:'3px 0'}}>• {s}</div>)}
                          </div>
                          <div style={{padding:12,borderRadius:10,background:'#7C3AED08',border:'1px solid #7C3AED22'}}>
                            <div style={{fontSize:12,fontWeight:700,color:'#7C3AED',marginBottom:6}}>{"\u{1F50D}"} Défauts observés</div>
                            {(auditData.aiReport.defects||[]).map((s,i)=><div key={i} style={{fontSize:12,color:T.text2,padding:'3px 0'}}>• {s}</div>)}
                          </div>
                        </div>
                        <div style={{marginTop:8,fontSize:10,color:T.text3,textAlign:'right'}}>Généré le {new Date(auditData.aiReport.generated_at).toLocaleDateString('fr-FR')}</div>
                      </div> : <div style={{padding:20,textAlign:'center',color:T.text3,fontSize:13}}>Aucun rapport IA généré. Cliquez sur "Générer rapport IA" pour analyser ce collaborateur.</div>}
                    </Card>
                  </div>}
                </div>}
              </div>}

              {/* ═══ BONUS & PÉNALITÉS ═══ */}
              {subTab==='bonus' && <div>
                <div style={{display:'flex',gap:8,marginBottom:20}}>
                  <Btn primary onClick={()=>setModalState({bpType:'bonus',collaborator_id:'',category:'autre',value:'',reason:''})}><I n="plus" s={13}/> Ajouter un bonus</Btn>
                  <Btn danger onClick={()=>setModalState({bpType:'penalty',collaborator_id:'',category:'autre',value:'',reason:''})}><I n="minus" s={13}/> Ajouter une pénalité</Btn>
                </div>
                <Card style={{padding:0,overflow:'hidden'}}>
                  <div style={{padding:'16px 20px',borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:15,fontWeight:700}}>Historique bonus & pénalités</span>
                  </div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                    <thead><tr style={{background:T.bg,borderBottom:`1px solid ${T.border}`}}>
                      {['Date','Collaborateur','Type','Catégorie','Valeur','Raison','Source'].map(h=><th key={h} style={{padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase'}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {lb.flatMap(c=>(c._bpHistory||[]).map(bp=>({...bp,collabName:c.name,collabColor:c.color}))).length === 0 && <tr><td colSpan={7} style={{padding:30,textAlign:'center',color:T.text3}}>Les bonus et pénalités automatiques apparaîtront au prochain calcul.</td></tr>}
                      {lb.map(c => {
                        const bps = perfData?.leaderboard?.find(l=>l.id===c.id);
                        return bps ? <tr key={c.id} style={{borderBottom:`1px solid ${T.border}15`}}>
                          <td style={{padding:'10px 12px',fontSize:12,color:T.text3}}>{perfData?.period?.label}</td>
                          <td style={{padding:'10px 12px'}}><div style={{display:'flex',alignItems:'center',gap:6}}><Avatar name={c.name} color={c.color} size={22}/><span style={{fontWeight:500}}>{c.name}</span></div></td>
                          <td style={{padding:'10px 12px'}}><Badge color={T.success}>Bonus</Badge> <Badge color={T.danger}>Pénalité</Badge></td>
                          <td style={{padding:'10px 12px',fontSize:12}}>Auto-calculés</td>
                          <td style={{padding:'10px 12px'}}><span style={{color:T.success,fontWeight:600}}>+{c.bonusTotal}</span> / <span style={{color:T.danger,fontWeight:600}}>{c.penaltyTotal}</span></td>
                          <td style={{padding:'10px 12px',fontSize:11,color:T.text3}}>Période en cours</td>
                          <td style={{padding:'10px 12px'}}><Badge color={T.text3}>Auto</Badge></td>
                        </tr> : null;
                      })}
                    </tbody>
                  </table>
                </Card>
              </div>}

              {/* ═══ INSIGHTS ═══ */}
              {subTab==='insights' && <div>
                {[
                  {title:'\u{1F31F} Top Performers',data:perfData?.insights?.topPerformers||[],color:T.success,bg:T.success+'08',desc:'Score > 75 — Excellente performance'},
                  {title:'\u26A0\uFE0F À risque',data:perfData?.insights?.atRisk||[],color:T.danger,bg:T.danger+'08',desc:'Score < 40 ou forte baisse'},
                  {title:'\u{1F393} À coacher',data:perfData?.insights?.toCoach||[],color:T.warning,bg:T.warning+'08',desc:'Score moyen + qualité faible'},
                  {title:'\u{1F4A4} Sous-exploités',data:perfData?.insights?.underUtilized||[],color:T.accent,bg:T.accent+'08',desc:'Bon score mais peu de leads actifs'},
                  {title:'\u{1F525} Surchargés',data:perfData?.insights?.overLoaded||[],color:'#7C3AED',bg:'#7C3AED08',desc:'Plus de 30 leads actifs'},
                ].map((section,si)=>(
                  <Card key={si} style={{marginBottom:16,padding:20,background:section.bg,border:`1px solid ${section.color}22`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                      <div><div style={{fontSize:15,fontWeight:700,color:section.color}}>{section.title}</div><div style={{fontSize:11,color:T.text3}}>{section.desc}</div></div>
                      <Badge color={section.color}>{section.data.length}</Badge>
                    </div>
                    {section.data.length === 0 ? <div style={{fontSize:12,color:T.text3,padding:8}}>Aucun collaborateur dans cette catégorie</div> :
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
                      {section.data.map(c=><div key={c.id} onClick={()=>handleSelectAudit(c.id)} style={{padding:12,borderRadius:10,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',display:'flex',alignItems:'center',gap:10}}>
                        <Avatar name={c.name} color={c.color} size={34}/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:600}}>{c.name}</div>
                          <div style={{fontSize:11,color:T.text3}}>Score: {c.scoreGlobal} · Trend: {c.trend>0?'+':''}{c.trend}</div>
                        </div>
                        <div style={{fontSize:20,fontWeight:800,color:section.color}}>{c.scoreGlobal}</div>
                      </div>)}
                    </div>}
                  </Card>
                ))}
              </div>}

              {/* ═══ PARAMÈTRES ═══ */}
              {subTab==='settings' && <div>
                <Card style={{padding:20,marginBottom:20}}>
                  <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>Pondération du scoring</div>
                  <p style={{fontSize:12,color:T.text2,marginBottom:16}}>Configurez les poids de chaque critère. Le total doit faire exactement 100%.</p>
                  {(()=>{
                    const w = scoreSettings || perfData?.weights || {weight_calls:15,weight_quality:20,weight_conversion:25,weight_speed:10,weight_followup:10,weight_goals:10,weight_discipline:5,weight_regularity:5};
                    if (!scoreSettings && perfData?.weights) { setTimeout(()=>setScoreSettings({...perfData.weights}),0); }
                    const fields = [
                      {key:'weight_calls',label:'Appels',icon:'phone',color:'#2563EB'},
                      {key:'weight_quality',label:'Qualité',icon:'star',color:'#F59E0B'},
                      {key:'weight_conversion',label:'Conversion',icon:'check-circle',color:'#059669'},
                      {key:'weight_speed',label:'Rapidité',icon:'zap',color:'#EC4899'},
                      {key:'weight_followup',label:'Suivi/Relances',icon:'repeat',color:'#7C3AED'},
                      {key:'weight_goals',label:'Objectifs',icon:'target',color:'#0D9488'},
                      {key:'weight_discipline',label:'Discipline',icon:'shield',color:'#6366F1'},
                      {key:'weight_regularity',label:'Régularité',icon:'clock',color:'#D97706'},
                    ];
                    const total = fields.reduce((s,f) => s + (parseInt(w[f.key])||0), 0);
                    return <div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12}}>
                        {fields.map(f=><div key={f.key} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,border:`1px solid ${T.border}`,background:T.surface}}>
                          <I n={f.icon} s={16} style={{color:f.color}}/>
                          <span style={{flex:1,fontSize:13,fontWeight:500}}>{f.label}</span>
                          <input type="number" min="0" max="100" value={w[f.key]||0} onChange={e=>setScoreSettings({...w,[f.key]:parseInt(e.target.value)||0})} style={{width:60,padding:'6px 8px',borderRadius:6,border:`1px solid ${T.border}`,fontSize:14,fontWeight:700,textAlign:'center',color:f.color,background:T.surface}}/>
                          <span style={{fontSize:12,color:T.text3}}>%</span>
                        </div>)}
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:16,padding:'12px 16px',borderRadius:10,background:total===100?T.success+'12':T.danger+'12',border:`1px solid ${total===100?T.success:T.danger}33`}}>
                        <span style={{fontSize:13,fontWeight:600,color:total===100?T.success:T.danger}}>Total : {total}%{total!==100?' (doit être 100%)':' ✓'}</span>
                        <Btn primary small onClick={handleSaveSettings} disabled={total!==100}><I n="check" s={13}/> Sauvegarder</Btn>
                      </div>
                    </div>;
                  })()}
                </Card>

                <Card style={{padding:20}}>
                  <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>Règles automatiques</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:T.success,marginBottom:8}}>Auto-Bonus</div>
                      {[
                        {r:'1 conversion',v:'+50 pts'},
                        {r:'10+ appels valides',v:'+20 pts'},
                        {r:'5+ RDV confirmés',v:'+30 pts'},
                        {r:'Objectif atteint',v:'+100 pts'},
                        {r:'Qualité IA > 85%',v:'+25 pts'},
                      ].map((r,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${T.border}15`,fontSize:12}}>
                        <span style={{color:T.text2}}>{r.r}</span><span style={{fontWeight:600,color:T.success}}>{r.v}</span>
                      </div>)}
                    </div>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:T.danger,marginBottom:8}}>Auto-Pénalités</div>
                      {[
                        {r:'> 30% appels invalides',v:'-30 pts'},
                        {r:'Leads oubliés (7j+)',v:'-20 pts'},
                        {r:'Inactivité totale',v:'-50 pts'},
                        {r:'Qualité IA < 40%',v:'-25 pts'},
                        {r:'NRP non relancés > 5',v:'-15 pts'},
                      ].map((r,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${T.border}15`,fontSize:12}}>
                        <span style={{color:T.text2}}>{r.r}</span><span style={{fontWeight:600,color:T.danger}}>{r.v}</span>
                      </div>)}
                    </div>
                  </div>
                </Card>
              </div>}

              {/* Modal Bonus/Pénalité */}
              <Modal open={!!modalState} onClose={()=>setModalState(null)} title={modalState?.bpType==='bonus'?'Ajouter un bonus':'Ajouter une pénalité'} width={480}>
                {modalState && <div>
                  <div style={{marginBottom:12}}>
                    <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Collaborateur</label>
                    <select value={modalState.collaborator_id} onChange={e=>setModalState({...modalState,collaborator_id:e.target.value})} style={{width:'100%',padding:'9px 12px',borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,background:T.surface,color:T.text}}>
                      <option value="">— Sélectionner —</option>
                      {collabs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{marginBottom:12}}>
                    <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Catégorie</label>
                    <select value={modalState.category} onChange={e=>setModalState({...modalState,category:e.target.value})} style={{width:'100%',padding:'9px 12px',borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,background:T.surface,color:T.text}}>
                      {(modalState.bpType==='bonus' ? ['vente','volume_appels','rdv','objectif','excellence_qualite','autre'] : ['faux_appels','leads_oublies','inactivite','mauvaise_qualite','relances_manquees','autre']).map(c=><option key={c} value={c}>{CATEGORY_LABELS[c]||c}</option>)}
                    </select>
                  </div>
                  <Input label="Valeur (points)" type="number" value={modalState.value} onChange={e=>setModalState({...modalState,value:e.target.value})} style={{marginBottom:12}}/>
                  <div style={{marginBottom:16}}>
                    <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Raison</label>
                    <textarea value={modalState.reason||''} onChange={e=>setModalState({...modalState,reason:e.target.value})} placeholder="Raison du bonus/pénalité..." style={{width:'100%',boxSizing:'border-box',padding:'9px 12px',borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,minHeight:60,resize:'vertical',fontFamily:'inherit',background:T.surface,color:T.text}}/>
                  </div>
                  <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <Btn ghost onClick={()=>setModalState(null)}>Annuler</Btn>
                    <Btn primary={modalState.bpType==='bonus'} danger={modalState.bpType==='penalty'} onClick={handleAddBonusPenalty}>{modalState.bpType==='bonus'?'Ajouter bonus':'Ajouter pénalité'}</Btn>
                  </div>
                </div>}
              </Modal>
            </div>
          );
        
}
