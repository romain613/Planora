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

export default function VisionFauconScreen() {

              const [fauconData, setFauconData] = useState(null);
              const [fauconLoading, setFauconLoading] = useState(true);
              const [fauconErr, setFauconErr] = useState('');
              const loadFaucon = () => {
                setFauconLoading(true); setFauconErr('');
                api('/api/faucon/stats').then(d=>{
                  if(d && !d.error) setFauconData(d);
                  else setFauconErr(d?.error || 'Erreur chargement');
                  setFauconLoading(false);
                }).catch(e=>{ setFauconErr(e.message||'Erreur réseau'); setFauconLoading(false); });
              };
              useEffect(()=>{ loadFaucon(); },[]);

              const fmtDur = (s) => {
                if(!s) return '—';
                const m = Math.floor(s/60); const sec = s%60;
                return m>0 ? `${m}m${String(sec).padStart(2,'0')}s` : `${sec}s`;
              };
              const fmtDate = (iso) => {
                if(!iso) return '—';
                try { const d=new Date(iso); return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); } catch { return iso; }
              };

              if(fauconLoading) return <Card><div style={{padding:24,textAlign:'center',color:T.text3}}><I n="loader" s={24}/><div style={{marginTop:8}}>Chargement du dashboard Faucon…</div></div></Card>;
              if(fauconErr) return <Card><div style={{padding:24,textAlign:'center',color:T.danger}}><I n="alert-triangle" s={24}/><div style={{marginTop:8}}>{fauconErr}</div><Btn small onClick={loadFaucon} style={{marginTop:12}}>Réessayer</Btn></div></Card>;
              if(!fauconData) return null;

              const d = fauconData;
              const covColor = d.coverage.pct>=80 ? T.success : d.coverage.pct>=50 ? T.warning : T.danger;
              const orphansColor = d.orphans.count===0 ? T.success : d.orphans.count<5 ? T.warning : T.danger;

              return <div>
                {/* Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div>
                    <h3 style={{fontSize:16,fontWeight:700,marginBottom:4}}>🦅 Plan Faucon — Corpus IA</h3>
                    <p style={{fontSize:12,color:T.text3}}>
                      Monitoring temps réel de l'auto-archive (cron 5 min) · Seuil éligible : ≥{d.minDurationSeconds}s completed ·
                      Généré à {fmtDate(d.generatedAt)}
                    </p>
                  </div>
                  <Btn small onClick={loadFaucon}><I n="refresh-cw" s={13}/> Actualiser</Btn>
                </div>

                {/* Row 1 — Stats macro */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:12}}>
                  <Stat label="Archives totales" value={d.totals.archives} icon="database" color={T.purple}/>
                  <Stat label="Aujourd'hui" value={d.totals.today} icon="calendar" color={T.accent}/>
                  <Stat label="7 derniers jours" value={d.totals.last_7d} icon="trending-up" color={T.teal||"#14b8a6"}/>
                  <Stat label={`Couverture (${d.coverage.archived_from_eligible}/${d.coverage.eligible})`} value={`${d.coverage.pct}%`} icon="target" color={covColor}/>
                </div>

                {/* Row 2 — Stats secondaires */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                  <Stat label="Trous (orphelins)" value={d.orphans.count} icon="alert-triangle" color={orphansColor}/>
                  <Stat label="Durée moyenne" value={fmtDur(d.duration.avg)} icon="clock" color={T.text2}/>
                  <Stat label="Transcription LIVE" value={d.source.live_only + d.source.both} icon="mic" color={T.success}/>
                  <Stat label="Transcription AUDIO" value={d.source.audio_only + d.source.both} icon="headphones" color={T.warning}/>
                </div>

                {/* Row 3 — Tables collab + company */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                  <Card>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:12,display:"flex",alignItems:"center",gap:6}}><I n="users" s={14}/> Par collaborateur</div>
                    {d.byCollab.length===0 ? <div style={{fontSize:12,color:T.text3,padding:8}}>Aucune archive</div> : (
                      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:6,fontSize:12}}>
                        <div style={{fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.border}`,paddingBottom:4}}>Collaborateur</div>
                        <div style={{fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.border}`,paddingBottom:4,textAlign:"right"}}>Archives</div>
                        <div style={{fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.border}`,paddingBottom:4,textAlign:"right"}}>Durée moy.</div>
                        <div style={{fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.border}`,paddingBottom:4,textAlign:"right"}}>Live/Audio</div>
                        {d.byCollab.map(c=>(
                          <React.Fragment key={c.collaboratorId||'null'}>
                            <div style={{padding:"6px 0"}}>{c.name}</div>
                            <div style={{padding:"6px 0",textAlign:"right",fontWeight:700}}>{c.archives}</div>
                            <div style={{padding:"6px 0",textAlign:"right",color:T.text2}}>{fmtDur(c.avg_duration)}</div>
                            <div style={{padding:"6px 0",textAlign:"right",color:T.text2,fontSize:11}}>{c.with_live||0}/{c.with_audio||0}</div>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </Card>
                  <Card>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:12,display:"flex",alignItems:"center",gap:6}}><I n="building" s={14}/> Par entreprise</div>
                    {d.byCompany.length===0 ? <div style={{fontSize:12,color:T.text3,padding:8}}>Aucune archive</div> : (
                      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:6,fontSize:12}}>
                        <div style={{fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.border}`,paddingBottom:4}}>Entreprise</div>
                        <div style={{fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.border}`,paddingBottom:4,textAlign:"right"}}>Archives</div>
                        <div style={{fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.border}`,paddingBottom:4,textAlign:"right"}}>Durée moy.</div>
                        {d.byCompany.map(c=>(
                          <React.Fragment key={c.companyId||'null'}>
                            <div style={{padding:"6px 0"}}>{c.name}</div>
                            <div style={{padding:"6px 0",textAlign:"right",fontWeight:700}}>{c.archives}</div>
                            <div style={{padding:"6px 0",textAlign:"right",color:T.text2}}>{fmtDur(c.avg_duration)}</div>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>

                {/* Row 4 — Orphelins (appels éligibles non archivés) */}
                <Card>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
                    <I n="alert-triangle" s={14}/> Appels éligibles non archivés
                    <span style={{marginLeft:'auto',fontSize:12,fontWeight:600,color:orphansColor}}>{d.orphans.count} trou{d.orphans.count>1?'s':''}</span>
                  </div>
                  <p style={{fontSize:11,color:T.text3,marginBottom:10}}>Ces appels matchent les critères (completed, ≥{d.minDurationSeconds}s, transcript présent) mais n'ont pas encore d'archive. Le cron les rattrapera au prochain tick.</p>
                  {d.orphans.sample.length===0 ? (
                    <div style={{padding:12,textAlign:"center",color:T.success,fontSize:12}}><I n="check-circle" s={14}/> Aucun trou détecté — le cron couvre 100%</div>
                  ) : (
                    <div style={{display:"grid",gridTemplateColumns:"1.2fr 0.6fr 0.8fr 1fr 1fr",gap:6,fontSize:11}}>
                      <div style={{fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.border}`,paddingBottom:4}}>Call ID</div>
                      <div style={{fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.border}`,paddingBottom:4,textAlign:"right"}}>Durée</div>
                      <div style={{fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.border}`,paddingBottom:4}}>Sens</div>
                      <div style={{fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.border}`,paddingBottom:4}}>Numéro</div>
                      <div style={{fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.border}`,paddingBottom:4}}>Date</div>
                      {d.orphans.sample.map(o=>(
                        <React.Fragment key={o.id}>
                          <div style={{padding:"5px 0",fontFamily:"monospace",fontSize:10,color:T.text2}}>{o.id}</div>
                          <div style={{padding:"5px 0",textAlign:"right",fontWeight:700}}>{fmtDur(o.duration)}</div>
                          <div style={{padding:"5px 0",color:T.text2}}>{o.direction==='outbound'?'↗ out':'↙ in'}</div>
                          <div style={{padding:"5px 0",color:T.text2,fontSize:10}}>{o.direction==='outbound'?o.toNumber:o.fromNumber}</div>
                          <div style={{padding:"5px 0",color:T.text3,fontSize:10}}>{fmtDate(o.createdAt)}</div>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Row 5 — Timeline 14j (simple barre) */}
                {d.timeline.length>0 && (
                  <Card style={{marginTop:12}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:12,display:"flex",alignItems:"center",gap:6}}><I n="bar-chart" s={14}/> Archives par jour (14 derniers jours)</div>
                    <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80}}>
                      {(() => {
                        const maxN = Math.max(1, ...d.timeline.map(t=>t.archives));
                        return d.timeline.map(t=>(
                          <div key={t.day} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                            <div style={{fontSize:10,fontWeight:700,color:T.text2}}>{t.archives}</div>
                            <div style={{width:"100%",height:`${(t.archives/maxN)*60}px`,minHeight:2,background:`linear-gradient(180deg,${T.purple},#7C3AED88)`,borderRadius:2}}/>
                            <div style={{fontSize:9,color:T.text3}}>{t.day.slice(5)}</div>
                          </div>
                        ));
                      })()}
                    </div>
                  </Card>
                )}
              </div>;
            
}
