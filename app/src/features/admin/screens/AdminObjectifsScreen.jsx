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

export default function AdminObjectifsScreen({ collabs, company, pushNotification }) {

          const [objSubTab, setObjSubTab] = useState('dashboard');
          const [userGoals, setUserGoals] = useState([]);
          const [teamGoals, setTeamGoals] = useState([]);
          const [rewards, setRewards] = useState([]);
          const [goalStats, setGoalStats] = useState(null);
          const [progress, setProgress] = useState([]);
          const [loading, setLoading] = useState(true);
          const [showAddGoal, setShowAddGoal] = useState(false);
          const [showAddTeamGoal, setShowAddTeamGoal] = useState(false);
          const [filterCollab, setFilterCollab] = useState('');
          const [newGoal, setNewGoal] = useState({ collaborator_id:'', type:'calls', target_value:100, period:'monthly', period_start:new Date().toISOString().split('T')[0], period_end:'', reward_leads:0, envelope_ids_json:'[]' });
          const [newTeamGoal, setNewTeamGoal] = useState({ collaborators:[], goal_type:'calls', goal_value:100, period:'monthly', period_start:new Date().toISOString().split('T')[0], period_end:'', reward_leads:0, envelope_ids_json:'[]' });
          const [teamCollabSelection, setTeamCollabSelection] = useState([]);
          const [goalEnvelopes, setGoalEnvelopes] = useState([]);

          const GOAL_TYPES = [{v:'calls',l:'Appels',icon:'phone',c:'#3B82F6'},{v:'sales',l:'Ventes',icon:'dollar-sign',c:'#22C55E'},{v:'appointments',l:'RDV',icon:'calendar',c:'#7C3AED'},{v:'sms',l:'SMS',icon:'message-square',c:'#F59E0B'},{v:'emails',l:'Emails',icon:'mail',c:'#0EA5E9'},{v:'revenue',l:'CA',icon:'trending-up',c:'#EF4444'},{v:'nrp_callbacks',l:'Rappels NRP',icon:'phone-missed',c:'#F97316'},{v:'contacts_recalled',l:'Rappels contacts',icon:'phone-forwarded',c:'#06B6D4'},{v:'contracts',l:'Contrats signes',icon:'file-check',c:'#10B981'}];
          const PERIODS = [{v:'daily',l:'Jour'},{v:'weekly',l:'Semaine'},{v:'monthly',l:'Mois'},{v:'quarterly',l:'Trimestre'}];
          const getGoalType = (t) => GOAL_TYPES.find(g=>g.v===t) || GOAL_TYPES[0];

          const loadData = () => {
            if (!company?.id) return;   // V1.8.7 — defense systémique company=null
            setLoading(true);
            Promise.all([
              api(`/api/goals/user?companyId=${company.id}`),
              api(`/api/goals/team?companyId=${company.id}`),
              api(`/api/goals/rewards?companyId=${company.id}`),
              api(`/api/goals/stats?companyId=${company.id}`),
              api(`/api/goals/progress?companyId=${company.id}`),
              api(`/api/leads/envelopes?companyId=${company.id}`),
            ]).then(([ug,tg,rw,st,pr,envs])=>{ setUserGoals(ug||[]); setTeamGoals(tg||[]); setRewards(rw||[]); setGoalStats(st||null); setProgress(pr||[]); setGoalEnvelopes(Array.isArray(envs)?envs:[]); setLoading(false); }).catch(()=>setLoading(false));
          };
          useEffect(loadData, [company?.id]);

          const handleAddGoal = () => {
            api('/api/goals/user', { method:'POST', body:{ companyId:company.id, ...newGoal } }).then(()=>{ setShowAddGoal(false); setNewGoal({collaborator_id:'',type:'calls',target_value:100,period:'monthly',period_start:new Date().toISOString().split('T')[0],period_end:'',reward_leads:0}); loadData(); });
          };
          const handleDeleteGoal = (id) => { api(`/api/goals/user/${id}`, { method:'DELETE' }).then(loadData); };
          const handleAddTeamGoal = () => {
            api('/api/goals/team', { method:'POST', body:{ companyId:company.id, ...newTeamGoal, collaborators:teamCollabSelection } }).then(()=>{ setShowAddTeamGoal(false); setTeamCollabSelection([]); loadData(); });
          };
          const handleDeleteTeamGoal = (id) => { api(`/api/goals/team/${id}`, { method:'DELETE' }).then(loadData); };
          const handleCheckRewards = () => {
            api('/api/goals/check-rewards', { method:'POST', body:{ companyId:company.id } }).then(r=>{ if(r.awarded?.length) pushNotification('Recompenses',''+r.awarded.length+' objectifs recompenses','success'); loadData(); });
          };

          const subTabs = [{id:'dashboard',label:'Dashboard',icon:'target'},{id:'individual',label:'Individuels',icon:'user'},{id:'team',label:'Equipe',icon:'users'},{id:'rewards',label:'Recompenses',icon:'gift'},{id:'leaderboard',label:'Classement',icon:'award'}];

          const filteredGoals = filterCollab ? progress.filter(g=>g.collaborator_id===filterCollab) : progress;

          if(loading) return <div style={{padding:40,textAlign:'center'}}><I n="loader" s={24} style={{animation:'spin 1s linear infinite'}}/> Chargement...</div>;

          return <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h1 style={{fontSize:22,fontWeight:700,color:T.text}}>Objectifs</h1>
              <div style={{display:'flex',gap:8}}>
                <Btn onClick={handleCheckRewards} style={{fontSize:12}}><I n="check-circle" s={13}/> Verifier recompenses</Btn>
                <Btn primary onClick={()=>setShowAddGoal(true)} style={{fontSize:12}}><I n="plus" s={13}/> Objectif individuel</Btn>
                <Btn onClick={()=>setShowAddTeamGoal(true)} style={{fontSize:12}}><I n="users" s={13}/> Objectif equipe</Btn>
              </div>
            </div>

            <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:`1px solid ${T.border}`,paddingBottom:8,overflowX:'auto'}}>
              {subTabs.map(st=><div key={st.id} onClick={()=>setObjSubTab(st.id)} style={{padding:'8px 14px',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:objSubTab===st.id?700:500,background:objSubTab===st.id?T.accent+'15':'transparent',color:objSubTab===st.id?T.accent:T.text2,display:'flex',alignItems:'center',gap:6,transition:'all .15s',whiteSpace:'nowrap'}}><I n={st.icon} s={14}/>{st.label}</div>)}
            </div>

            {/* DASHBOARD */}
            {objSubTab==='dashboard' && <div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:24}}>
                {[{l:'Actifs',v:goalStats?.activeGoals||0,c:'#3B82F6'},{l:'Termines',v:goalStats?.completedGoals||0,c:'#22C55E'},{l:'Taux',v:(goalStats?.completionRate||0)+'%',c:'#7C3AED'},{l:'Leads donnes',v:goalStats?.totalRewards||0,c:'#F59E0B'}].map((s,i)=>
                  <Card key={i} style={{padding:16,textAlign:'center'}}>
                    <div style={{fontSize:28,fontWeight:800,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:12,color:T.text2,marginTop:4}}>{s.l}</div>
                  </Card>
                )}
              </div>
              {goalStats?.topPerformers?.length>0 && <Card style={{padding:16}}>
                <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Top Performers</div>
                {goalStats.topPerformers.map((p,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                  <div style={{width:24,height:24,borderRadius:12,background:i<3?['#FFD700','#C0C0C0','#CD7F32'][i]+'30':T.border,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:i<3?['#FFD700','#A0A0A0','#CD7F32'][i]:T.text2}}>{i+1}</div>
                  <div style={{width:8,height:8,borderRadius:'50%',background:p.color||'#64748B'}}/>
                  <span style={{fontSize:13,flex:1,fontWeight:500}}>{p.name||'Inconnu'}</span>
                  <span style={{fontSize:12,color:T.text2}}>{p.completed}/{p.total} objectifs</span>
                  <span style={{fontSize:13,fontWeight:700,color:T.accent}}>{p.completionRate}%</span>
                </div>)}
              </Card>}
            </div>}

            {/* INDIVIDUAL */}
            {objSubTab==='individual' && <div>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:16}}>
                <select value={filterCollab} onChange={e=>setFilterCollab(e.target.value)} style={{padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13}}>
                  <option value="">Tous les collaborateurs</option>
                  {collabs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {filteredGoals.length===0 && <Card style={{padding:32,textAlign:'center',color:T.text2}}>Aucun objectif actif.</Card>}
              <div style={{display:'grid',gap:12}}>
                {filteredGoals.map(g=>{
                  const gt = getGoalType(g.type);
                  return <Card key={g.id} style={{padding:16}}>
                    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                      <div style={{width:36,height:36,borderRadius:10,background:gt.c+'15',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <I n={gt.icon} s={18} style={{color:gt.c}}/>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <span style={{fontWeight:700,fontSize:14}}>{gt.l}</span>
                          <span style={{fontSize:11,padding:'2px 6px',borderRadius:8,background:T.border,color:T.text2}}>{PERIODS.find(p=>p.v===g.period)?.l||g.period}</span>
                        </div>
                        <div style={{fontSize:12,color:T.text2,display:'flex',alignItems:'center',gap:4}}>
                          <span style={{width:6,height:6,borderRadius:'50%',background:g.collaborator_color||'#64748B'}}/>{g.collaborator_name}
                        </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:20,fontWeight:800,color:g.completed?'#22C55E':T.text}}>{g.current_value}<span style={{fontSize:13,fontWeight:400,color:T.text2}}>/{g.target_value}</span></div>
                        {g.reward_leads>0 && <div style={{fontSize:11,color:'#F59E0B'}}>+{g.reward_leads} leads</div>}
                      </div>
                      <Btn small onClick={()=>handleDeleteGoal(g.id)} style={{color:'#EF4444',marginLeft:4}}><I n="trash-2" s={14}/></Btn>
                    </div>
                    <div style={{height:6,borderRadius:3,background:T.border}}>
                      <div style={{width:Math.min(100,g.percentage)+'%',height:'100%',borderRadius:3,background:g.completed?'#22C55E':gt.c,transition:'width .5s'}}/>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:4,fontSize:11,color:T.text2}}>
                      <span>{g.period_start?new Date(g.period_start).toLocaleDateString('fr-FR'):''}</span>
                      <span style={{fontWeight:700,color:g.completed?'#22C55E':T.accent}}>{g.percentage}%</span>
                      <span>{g.period_end?new Date(g.period_end).toLocaleDateString('fr-FR'):''}</span>
                    </div>
                  </Card>;
                })}
              </div>
            </div>}

            {/* TEAM */}
            {objSubTab==='team' && <div>
              {teamGoals.length===0 && <Card style={{padding:32,textAlign:'center',color:T.text2}}>Aucun objectif d'equipe. Creez-en un pour motiver toute l'equipe.</Card>}
              <div style={{display:'grid',gap:12}}>
                {teamGoals.map(g=>{
                  const gt = getGoalType(g.goal_type);
                  const pct = g.goal_value>0 ? Math.min(100,Math.round(g.current_value/g.goal_value*100)) : 0;
                  const members = Array.isArray(g.collaborators) ? g.collaborators : [];
                  return <Card key={g.id} style={{padding:16}}>
                    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                      <div style={{width:36,height:36,borderRadius:10,background:gt.c+'15',display:'flex',alignItems:'center',justifyContent:'center'}}><I n={gt.icon} s={18} style={{color:gt.c}}/></div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:14}}>{gt.l} — Equipe</div>
                        <div style={{fontSize:12,color:T.text2}}>{members.length} membres · {PERIODS.find(p=>p.v===g.period)?.l||g.period}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:20,fontWeight:800}}>{g.current_value}<span style={{fontSize:13,fontWeight:400,color:T.text2}}>/{g.goal_value}</span></div>
                        {g.reward_leads>0 && <div style={{fontSize:11,color:'#F59E0B'}}>+{g.reward_leads} leads</div>}
                      </div>
                      <Btn small onClick={()=>handleDeleteTeamGoal(g.id)} style={{color:'#EF4444'}}><I n="trash-2" s={14}/></Btn>
                    </div>
                    <div style={{height:6,borderRadius:3,background:T.border}}>
                      <div style={{width:pct+'%',height:'100%',borderRadius:3,background:gt.c,transition:'width .5s'}}/>
                    </div>
                    <div style={{textAlign:'right',marginTop:4,fontSize:12,fontWeight:700,color:pct>=100?'#22C55E':T.accent}}>{pct}%</div>
                  </Card>;
                })}
              </div>
            </div>}

            {/* REWARDS */}
            {objSubTab==='rewards' && <div>
              {rewards.length===0 && <Card style={{padding:32,textAlign:'center',color:T.text2}}>Aucune recompense distribuee.</Card>}
              {rewards.length>0 && <Card style={{overflow:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead><tr style={{borderBottom:`2px solid ${T.border}`}}>
                    <th style={{padding:'10px 8px',textAlign:'left'}}>Collaborateur</th>
                    <th style={{padding:'10px 8px',textAlign:'left'}}>Type</th>
                    <th style={{padding:'10px 8px',textAlign:'left'}}>Leads</th>
                    <th style={{padding:'10px 8px',textAlign:'left'}}>Date</th>
                  </tr></thead>
                  <tbody>{rewards.map(r=><tr key={r.id} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:'8px'}}><span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:'50%',background:r.collaborator_color||'#64748B'}}/>{r.collaborator_name}</span></td>
                    <td style={{padding:'8px'}}>{r.goal_type==='individual'?'Individuel':'Equipe'}</td>
                    <td style={{padding:'8px',fontWeight:700,color:'#F59E0B'}}>+{r.leads_awarded}</td>
                    <td style={{padding:'8px',fontSize:12,color:T.text2}}>{r.created_at?new Date(r.created_at).toLocaleDateString('fr-FR'):'-'}</td>
                  </tr>)}</tbody>
                </table>
              </Card>}
            </div>}

            {/* LEADERBOARD */}
            {objSubTab==='leaderboard' && <div>
              {goalStats?.topPerformers?.length===0 && <Card style={{padding:32,textAlign:'center',color:T.text2}}>Aucune donnee de classement.</Card>}
              {goalStats?.topPerformers?.length>0 && <Card style={{overflow:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead><tr style={{borderBottom:`2px solid ${T.border}`}}>
                    <th style={{padding:'10px 8px',textAlign:'center',width:40}}>#</th>
                    <th style={{padding:'10px 8px',textAlign:'left'}}>Collaborateur</th>
                    <th style={{padding:'10px 8px',textAlign:'center'}}>Objectifs</th>
                    <th style={{padding:'10px 8px',textAlign:'center'}}>Taux</th>
                  </tr></thead>
                  <tbody>{goalStats.topPerformers.map((p,i)=><tr key={i} style={{borderBottom:`1px solid ${T.border}`,background:i<3?['#FFFBEB','#F8FAFC','#FDF4E7'][i]:'transparent'}}>
                    <td style={{padding:'10px 8px',textAlign:'center',fontSize:16}}>{i<3?['\u{1F947}','\u{1F948}','\u{1F949}'][i]:(i+1)}</td>
                    <td style={{padding:'10px 8px'}}><span style={{display:'inline-flex',alignItems:'center',gap:6}}><span style={{width:10,height:10,borderRadius:'50%',background:p.color||'#64748B'}}/><span style={{fontWeight:600}}>{p.name||'Inconnu'}</span></span></td>
                    <td style={{padding:'10px 8px',textAlign:'center'}}>{p.completed}/{p.total}</td>
                    <td style={{padding:'10px 8px',textAlign:'center'}}>
                      <div style={{display:'inline-flex',alignItems:'center',gap:6}}>
                        <div style={{width:60,height:6,borderRadius:3,background:T.border}}><div style={{width:p.completionRate+'%',height:'100%',borderRadius:3,background:p.completionRate>=80?'#22C55E':p.completionRate>=50?'#F59E0B':'#EF4444'}}/></div>
                        <span style={{fontWeight:700,fontSize:13}}>{p.completionRate}%</span>
                      </div>
                    </td>
                  </tr>)}</tbody>
                </table>
              </Card>}
            </div>}

            {/* MODAL: Add Individual Goal */}
            {showAddGoal && <Modal open={true} title="Nouvel objectif individuel" onClose={()=>setShowAddGoal(false)}>
              <div style={{display:'grid',gap:12}}>
                <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Collaborateur</label><select value={newGoal.collaborator_id} onChange={e=>setNewGoal({...newGoal,collaborator_id:e.target.value})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}}><option value="">Choisir...</option>{collabs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Type</label><select value={newGoal.type} onChange={e=>setNewGoal({...newGoal,type:e.target.value})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}}>{GOAL_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
                <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Objectif</label><input type="number" value={newGoal.target_value} onChange={e=>setNewGoal({...newGoal,target_value:parseInt(e.target.value)||0})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}}/></div>
                <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Periode</label><select value={newGoal.period} onChange={e=>setNewGoal({...newGoal,period:e.target.value})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}}>{PERIODS.map(p=><option key={p.v} value={p.v}>{p.l}</option>)}</select></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Debut</label><input type="date" value={newGoal.period_start} onChange={e=>setNewGoal({...newGoal,period_start:e.target.value})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}}/></div>
                  <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Fin</label><input type="date" value={newGoal.period_end} onChange={e=>setNewGoal({...newGoal,period_end:e.target.value})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}}/></div>
                </div>
                <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Recompense (leads bonus)</label><input type="number" value={newGoal.reward_leads} onChange={e=>setNewGoal({...newGoal,reward_leads:parseInt(e.target.value)||0})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}} placeholder="0 = pas de recompense"/></div>
                <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Enveloppes source (optionnel)</label><div style={{maxHeight:120,overflow:'auto',border:`1px solid ${T.border}`,borderRadius:8,marginTop:4}}>{goalEnvelopes.length===0?<div style={{padding:10,fontSize:12,color:T.text2}}>Aucune enveloppe</div>:goalEnvelopes.map(env=>{const sel=JSON.parse(newGoal.envelope_ids_json||'[]');return <label key={env.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',fontSize:12,cursor:'pointer',borderBottom:`1px solid ${T.border}`}}><input type="checkbox" checked={sel.includes(env.id)} onChange={e=>{const ids=e.target.checked?[...sel,env.id]:sel.filter(x=>x!==env.id);setNewGoal({...newGoal,envelope_ids_json:JSON.stringify(ids)});}}/>{env.name}</label>;})}</div><div style={{fontSize:10,color:T.text3,marginTop:2}}>Les leads bonus seront pioches dans ces enveloppes uniquement</div></div>
                <Btn primary onClick={handleAddGoal}>Creer l'objectif</Btn>
              </div>
            </Modal>}

            {/* MODAL: Add Team Goal */}
            {showAddTeamGoal && <Modal open={true} title="Nouvel objectif equipe" onClose={()=>setShowAddTeamGoal(false)}>
              <div style={{display:'grid',gap:12}}>
                <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Membres</label><div style={{maxHeight:150,overflow:'auto',border:`1px solid ${T.border}`,borderRadius:8,marginTop:4}}>{collabs.map(c=><label key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',fontSize:13,cursor:'pointer',borderBottom:`1px solid ${T.border}`}}><input type="checkbox" checked={teamCollabSelection.includes(c.id)} onChange={e=>setTeamCollabSelection(e.target.checked?[...teamCollabSelection,c.id]:teamCollabSelection.filter(x=>x!==c.id))}/><span style={{width:8,height:8,borderRadius:'50%',background:c.color||'#64748B'}}/>{c.name}</label>)}</div></div>
                <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Type</label><select value={newTeamGoal.goal_type} onChange={e=>setNewTeamGoal({...newTeamGoal,goal_type:e.target.value})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}}>{GOAL_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
                <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Objectif</label><input type="number" value={newTeamGoal.goal_value} onChange={e=>setNewTeamGoal({...newTeamGoal,goal_value:parseInt(e.target.value)||0})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}}/></div>
                <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Periode</label><select value={newTeamGoal.period} onChange={e=>setNewTeamGoal({...newTeamGoal,period:e.target.value})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}}>{PERIODS.map(p=><option key={p.v} value={p.v}>{p.l}</option>)}</select></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Debut</label><input type="date" value={newTeamGoal.period_start} onChange={e=>setNewTeamGoal({...newTeamGoal,period_start:e.target.value})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}}/></div>
                  <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Fin</label><input type="date" value={newTeamGoal.period_end} onChange={e=>setNewTeamGoal({...newTeamGoal,period_end:e.target.value})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}}/></div>
                </div>
                <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Recompense (leads bonus par membre)</label><input type="number" value={newTeamGoal.reward_leads} onChange={e=>setNewTeamGoal({...newTeamGoal,reward_leads:parseInt(e.target.value)||0})} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,marginTop:4}}/></div>
                <div><label style={{fontSize:12,fontWeight:600,color:T.text2}}>Enveloppes source (optionnel)</label><div style={{maxHeight:120,overflow:'auto',border:`1px solid ${T.border}`,borderRadius:8,marginTop:4}}>{goalEnvelopes.length===0?<div style={{padding:10,fontSize:12,color:T.text2}}>Aucune enveloppe</div>:goalEnvelopes.map(env=>{const sel=JSON.parse(newTeamGoal.envelope_ids_json||'[]');return <label key={env.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',fontSize:12,cursor:'pointer',borderBottom:`1px solid ${T.border}`}}><input type="checkbox" checked={sel.includes(env.id)} onChange={e=>{const ids=e.target.checked?[...sel,env.id]:sel.filter(x=>x!==env.id);setNewTeamGoal({...newTeamGoal,envelope_ids_json:JSON.stringify(ids)});}}/>{env.name}</label>;})}</div><div style={{fontSize:10,color:T.text3,marginTop:2}}>Les leads bonus seront pioches dans ces enveloppes uniquement</div></div>
                <Btn primary onClick={handleAddTeamGoal}>Creer l'objectif equipe</Btn>
              </div>
            </Modal>}
          </div>;
        
}
