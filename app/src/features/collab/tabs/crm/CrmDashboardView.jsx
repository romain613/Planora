// CrmDashboardView — extraction S1.2 (2/3) depuis CrmTab.jsx L624-684
// Responsabilite : vue "Funnel de conversion" (3e branche du ternaire de viewMode)
//                  = funnel bars + KPI cards (winRate, active, won, lost)
//                  + score moyen par etape.
// Rendu uniquement quand collabCrmViewMode n'est ni 'table' ni 'pipeline'.
// Tous les symboles consommes viennent de CollabContext.

import React from "react";
import { T } from "../../../../theme";
import { I, Card } from "../../../../shared/ui";
import { useCollabContext } from "../../context/CollabContext";

const CrmDashboardView = () => {
  const { collabPipelineAnalytics, cScoreColor } = useCollabContext();

  return (
    <Card style={{padding:24}}>
      <h3 style={{fontSize:16,fontWeight:700,marginBottom:20,color:T.text}}><I n="trending-up" s={18}/> Funnel de conversion</h3>
      <div style={{display:"flex",flexDirection:"column",gap:0,maxWidth:600,margin:"0 auto"}}>
        {collabPipelineAnalytics.funnel.map((st,i)=>{
          const maxCount=Math.max(...collabPipelineAnalytics.funnel.map(s=>s.count),1);
          const barW=Math.max(st.count/maxCount*100,8);
          return (
            <div key={st.id}>
              <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0"}}>
                <div style={{width:110,textAlign:"right",fontSize:12,fontWeight:600,color:st.color,flexShrink:0}}>{st.label}</div>
                <div style={{flex:1,position:"relative"}}>
                  <div style={{height:32,borderRadius:8,background:st.color,width:`${barW}%`,transition:"width .4s ease",display:"flex",alignItems:"center",justifyContent:"center",minWidth:40}}>
                    <span style={{color:"#fff",fontSize:12,fontWeight:800}}>{st.count}</span>
                  </div>
                </div>
                <div style={{width:50,fontSize:12,fontWeight:700,color:T.text,textAlign:"right"}}>{st.pct}%</div>
              </div>
              {i<collabPipelineAnalytics.funnel.length-1&&(
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"0 0 0 122px"}}>
                  <div style={{color:T.text3,fontSize:10,display:"flex",alignItems:"center",gap:4}}>
                    <I n="arrow-down" s={10}/> {collabPipelineAnalytics.funnel[i+1].convRate}% conversion
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* KPI Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:24}}>
        <div style={{padding:16,borderRadius:12,background:"#22C55E12",textAlign:"center"}}>
          <div style={{fontSize:28,fontWeight:800,color:"#22C55E"}}>{collabPipelineAnalytics.winRate}%</div>
          <div style={{fontSize:11,color:T.text3,fontWeight:600}}>Taux de conversion</div>
        </div>
        <div style={{padding:16,borderRadius:12,background:T.accent+"12",textAlign:"center"}}>
          <div style={{fontSize:28,fontWeight:800,color:T.accent}}>{collabPipelineAnalytics.active}</div>
          <div style={{fontSize:11,color:T.text3,fontWeight:600}}>En cours</div>
        </div>
        <div style={{padding:16,borderRadius:12,background:"#22C55E12",textAlign:"center"}}>
          <div style={{fontSize:28,fontWeight:800,color:"#22C55E"}}>{collabPipelineAnalytics.won}</div>
          <div style={{fontSize:11,color:T.text3,fontWeight:600}}>Gagnés</div>
        </div>
        <div style={{padding:16,borderRadius:12,background:"#EF444412",textAlign:"center"}}>
          <div style={{fontSize:28,fontWeight:800,color:"#EF4444"}}>{collabPipelineAnalytics.lost}</div>
          <div style={{fontSize:11,color:T.text3,fontWeight:600}}>Perdus</div>
        </div>
      </div>
      {/* Score distribution per stage */}
      <div style={{marginTop:20}}>
        <h4 style={{fontSize:13,fontWeight:700,color:T.text2,marginBottom:10}}>Score moyen par étape</h4>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {collabPipelineAnalytics.funnel.map(st=>(
            <div key={st.id} style={{padding:"8px 16px",borderRadius:10,background:T.bg,border:`1px solid ${T.border}`,textAlign:"center",flex:"1 1 auto",minWidth:80}}>
              <div style={{fontSize:18,fontWeight:800,color:cScoreColor(collabPipelineAnalytics.avgScores[st.id])}}>{collabPipelineAnalytics.avgScores[st.id]}</div>
              <div style={{fontSize:10,color:st.color,fontWeight:600}}>{st.label}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

export default CrmDashboardView;
