// Phase 12b — extracted Objectifs tab from CollabPortal.jsx (was lines 16499-16617 IIFE).

import React from "react";
import { T } from "../../../theme";
import { I, Card } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const GOAL_TYPES = {
  calls: { l: 'Appels', icon: 'phone', c: '#3B82F6' },
  sales: { l: 'Ventes', icon: 'trending-up', c: '#22C55E' },
  appointments: { l: 'RDV', icon: 'calendar', c: '#7C3AED' },
  sms: { l: 'SMS', icon: 'message-circle', c: '#F59E0B' },
  emails: { l: 'Emails', icon: 'mail', c: '#0EA5E9' },
  revenue: { l: 'Chiffre d\'affaires', icon: 'euro', c: '#EF4444' },
  nrp_callbacks: { l: 'Rappels NRP', icon: 'phone-missed', c: '#F97316' },
  contacts_recalled: { l: 'Rappels contacts', icon: 'phone-forwarded', c: '#06B6D4' },
  contracts: { l: 'Contrats signes', icon: 'file-check', c: '#10B981' }
};

const PERIODS = { daily: 'Jour', weekly: 'Semaine', monthly: 'Mois', quarterly: 'Trimestre' };

const ObjectifsTab = () => {
  const { goalsLoading, myGoals, myTeamGoals, myRewards, contacts } = useCollabContext();

  if ((typeof goalsLoading!=='undefined'?goalsLoading:null)) return <div style={{padding:40,textAlign:'center',color:T.text2}}>Chargement...</div>;

  const activeGoals = (typeof myGoals!=='undefined'?myGoals:{}).filter(g => g.status === 'active');
  const completedGoals = (typeof myGoals!=='undefined'?myGoals:{}).filter(g => g.status === 'completed');

  return (
    <div style={{maxWidth:800,margin:'0 auto',padding:'0 16px'}}>
      {/* Header stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:24}}>
        {[
          { l: 'En cours', v: activeGoals.length, c: '#3B82F6', ic: 'target' },
          { l: 'Terminés', v: completedGoals.length, c: '#22C55E', ic: 'check-circle' },
          { l: 'Leads gagnés', v: (typeof myRewards!=='undefined'?myRewards:{}).reduce((s,r)=>s+(r.leads_awarded||0),0), c: '#F59E0B', ic: 'gift' }
        ].map((s,i)=>(
          <Card key={i} style={{padding:16,textAlign:'center'}}>
            <I n={s.ic} s={22} style={{color:s.c,marginBottom:6}}/>
            <div style={{fontSize:28,fontWeight:800,color:s.c}}>{s.v}</div>
            <div style={{fontSize:12,color:T.text2}}>{s.l}</div>
          </Card>
        ))}
      </div>

      {/* Active goals */}
      {activeGoals.length > 0 && <div style={{marginBottom:24}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:12,color:T.text}}>Objectifs en cours</div>
        {activeGoals.map(g => {
          const gt = GOAL_TYPES[g.type] || {l:g.type,icon:'target',c:'#64748B'};
          const pct = g.target_value > 0 ? Math.min(100, Math.round((g.current_value||0) / g.target_value * 100)) : 0;
          return (
            <Card key={g.id} style={{padding:16,marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                <div style={{width:40,height:40,borderRadius:10,background:gt.c+'18',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <I n={gt.icon} s={20} style={{color:gt.c}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14,color:T.text}}>{gt.l}</div>
                  <div style={{fontSize:11,color:T.text2}}>{PERIODS[g.period]||g.period} · {g.period_start?.split('T')[0]} → {g.period_end?.split('T')[0] || '...'}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:22,fontWeight:800,color:pct>=100?'#22C55E':gt.c}}>{pct}%</div>
                  <div style={{fontSize:11,color:T.text2}}>{g.current_value||0} / {g.target_value}</div>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{height:8,background:T.border,borderRadius:4,overflow:'hidden'}}>
                <div style={{height:'100%',width:pct+'%',background:pct>=100?'#22C55E':gt.c,borderRadius:4,transition:'width .5s ease'}}/>
              </div>
              {g.reward_leads > 0 && <div style={{marginTop:8,fontSize:11,color:'#F59E0B',display:'flex',alignItems:'center',gap:4}}>
                <I n="gift" s={12}/> Récompense : {g.reward_leads} leads bonus
              </div>}
            </Card>
          );
        })}
      </div>}

      {/* Completed goals */}
      {completedGoals.length > 0 && <div style={{marginBottom:24}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:12,color:T.text}}>Objectifs terminés</div>
        {completedGoals.map(g => {
          const gt = GOAL_TYPES[g.type] || {l:g.type,icon:'target',c:'#64748B'};
          return (
            <Card key={g.id} style={{padding:14,marginBottom:8,opacity:0.8}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:36,height:36,borderRadius:8,background:'#22C55E18',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <I n="check-circle" s={18} style={{color:'#22C55E'}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13,color:T.text}}>{gt.l} — {g.target_value} atteint</div>
                  <div style={{fontSize:11,color:T.text2}}>{PERIODS[g.period]||g.period}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>}

      {/* Team goals */}
      {(typeof myTeamGoals!=='undefined'?myTeamGoals:{}).length > 0 && <div style={{marginBottom:24}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:12,color:T.text}}>Objectifs d'équipe</div>
        {(typeof myTeamGoals!=='undefined'?myTeamGoals:{}).map(g => {
          const gt = GOAL_TYPES[g.goal_type] || {l:g.goal_type,icon:'users',c:'#7C3AED'};
          const pct = g.goal_value > 0 ? Math.min(100, Math.round((g.current_value||0) / g.goal_value * 100)) : 0;
          return (
            <Card key={g.id} style={{padding:14,marginBottom:8}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
                <I n="users" s={18} style={{color:gt.c}}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13,color:T.text}}>{gt.l}</div>
                  <div style={{fontSize:11,color:T.text2}}>{g.current_value||0} / {g.goal_value}</div>
                </div>
                <div style={{fontSize:18,fontWeight:800,color:pct>=100?'#22C55E':gt.c}}>{pct}%</div>
              </div>
              <div style={{height:6,background:T.border,borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',width:pct+'%',background:pct>=100?'#22C55E':gt.c,borderRadius:3}}/>
              </div>
            </Card>
          );
        })}
      </div>}

      {/* Rewards */}
      {(typeof myRewards!=='undefined'?myRewards:{}).length > 0 && <div style={{marginBottom:24}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:12,color:T.text}}>Mes Récompenses</div>
        {(typeof myRewards!=='undefined'?myRewards:{}).map(r => (
          <Card key={r.id} style={{padding:14,marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:36,height:36,borderRadius:8,background:'#F59E0B18',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <I n="gift" s={18} style={{color:'#F59E0B'}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13,color:T.text}}>{r.leads_awarded} lead{r.leads_awarded>1?'s':''} bonus</div>
                <div style={{fontSize:11,color:T.text2}}>{new Date(r.created_at).toLocaleDateString('fr-FR')}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>}

      {/* Empty state */}
      {(typeof myGoals!=='undefined'?myGoals:{}).length === 0 && (typeof myTeamGoals!=='undefined'?myTeamGoals:{}).length === 0 && (
        <Card style={{padding:40,textAlign:'center'}}>
          <I n="target" s={40} style={{color:T.text3,marginBottom:12}}/>
          <div style={{fontSize:16,fontWeight:600,color:T.text2,marginBottom:6}}>Aucun objectif</div>
          <div style={{fontSize:13,color:T.text3}}>Votre manager n'a pas encore défini d'objectifs pour vous.</div>
        </Card>
      )}
    </div>
  );
};

export default ObjectifsTab;
