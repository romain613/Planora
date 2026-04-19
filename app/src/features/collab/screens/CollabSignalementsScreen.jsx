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

export default function CollabSignalementsScreen({ collab, setCollabAlertCount, showNotif }) {

          const [myAlerts, setMyAlerts] = React.useState([]);
          const [loading, setLoading] = React.useState(true);
          const [expandedId, setExpandedId] = React.useState(null);
          const [explainId, setExplainId] = React.useState(null);
          const [explainText, setExplainText] = React.useState('');
          const [submitting, setSubmitting] = React.useState(false);

          React.useEffect(() => {
            api(`/api/secure-ia/my-alerts?collaboratorId=${collab.id}`).then(r => {
              if (Array.isArray(r)) setMyAlerts(r);
              setLoading(false);
            }).catch(() => setLoading(false));
          }, []);

          const markRead = (id) => {
            api(`/api/secure-ia/my-alerts/${id}/read`, { method: 'PUT' }).then(() => {
              setMyAlerts(prev => prev.map(a => a.id === id ? { ...a, collabRead: 1 } : a));
              setCollabAlertCount(c => Math.max(0, c - 1));
            });
          };

          const submitExplanation = (id) => {
            if (!explainText.trim()) return;
            setSubmitting(true);
            api(`/api/secure-ia/my-alerts/${id}/explain`, { method: 'PUT', body: JSON.stringify({ explanation: explainText.trim() }) })
              .then(() => {
                setMyAlerts(prev => prev.map(a => a.id === id ? { ...a, collabExplanation: explainText.trim(), collabRead: 1 } : a));
                setCollabAlertCount(c => Math.max(0, c - 1));
                setExplainId(null);
                setExplainText('');
                showNotif('Explication envoyée', 'success');
              })
              .finally(() => setSubmitting(false));
          };

          const unread = myAlerts.filter(a => !a.collabRead).length;

          return <div style={{ padding:24, maxWidth:900, margin:'0 auto' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:'#EF444415', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <I n="shield-alert" s={20} color="#EF4444"/>
              </div>
              <div>
                <h2 style={{ fontSize:20, fontWeight:700, color:T.text, margin:0 }}>Mes Signalements</h2>
                <p style={{ fontSize:12, color:T.text3, margin:0 }}>Mots ou phrases détectés dans vos appels</p>
              </div>
              {unread > 0 && <span style={{ marginLeft:'auto', background:'#EF4444', color:'#fff', fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:20 }}>{unread} non lu{unread>1?'s':''}</span>}
            </div>

            {loading ? <div style={{ textAlign:'center', padding:40, color:T.text3 }}>Chargement...</div>
            : myAlerts.length === 0 ? <div style={{ textAlign:'center', padding:60, color:T.text3 }}>
                <I n="check-circle" s={40} color="#22C55E"/>
                <p style={{ marginTop:12, fontSize:14 }}>Aucun signalement — Continuez comme ça !</p>
              </div>
            : <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {myAlerts.map(alert => {
                const words = alert.detectedWords || [];
                const isExpanded = expandedId === alert.id;
                const date = new Date(alert.callDate || alert.createdAt);
                const severityColors = { high:'#DC2626', medium:'#F59E0B', low:'#6B7280' };
                const severityLabels = { high:'Critique', medium:'Moyen', low:'Faible' };

                return <div key={alert.id} style={{ background:T.card, border:`1px solid ${!alert.collabRead?'#EF444440':T.border}`, borderRadius:12, overflow:'hidden', borderLeft:`4px solid ${severityColors[alert.severity]||'#6B7280'}` }}>
                  {/* Header */}
                  <div onClick={() => { setExpandedId(isExpanded ? null : alert.id); if (!alert.collabRead) markRead(alert.id); }} style={{ padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
                    {!alert.collabRead && <span style={{ width:8, height:8, borderRadius:4, background:'#EF4444', flexShrink:0 }}/>}
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:T.text }}>
                        {date.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})} à {date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
                      </div>
                      <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>
                        {alert.contactName || alert.contactPhone || 'Contact inconnu'} · {alert.direction === 'inbound' ? 'Entrant' : 'Sortant'} · {alert.duration ? Math.ceil(alert.duration/60)+'min' : ''}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      {words.slice(0,3).map((w,i) => <span key={i} style={{ padding:'2px 8px', borderRadius:6, background:w.semantic?'#8B5CF615':'#DC262612', color:w.semantic?'#8B5CF6':'#DC2626', fontSize:10, fontWeight:700 }}>{w.semantic?'🧠 ':''}{w.word} ({w.count}x)</span>)}
                      {words.length > 3 && <span style={{ padding:'2px 8px', borderRadius:6, background:T.bg, color:T.text3, fontSize:10 }}>+{words.length-3}</span>}
                    </div>
                    <span style={{ padding:'3px 10px', borderRadius:8, background:severityColors[alert.severity]+'15', color:severityColors[alert.severity], fontSize:10, fontWeight:700 }}>{severityLabels[alert.severity]}</span>
                    <I n={isExpanded?'chevron-up':'chevron-down'} s={16} color={T.text3}/>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && <div style={{ borderTop:`1px solid ${T.border}`, padding:'16px 18px' }}>
                    {/* Mots détectés */}
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:T.text3, marginBottom:8, textTransform:'uppercase' }}>Mots/phrases détectés</div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {words.map((w,i) => <div key={i} style={{ padding:'6px 12px', borderRadius:8, background:w.semantic?'#8B5CF610':'#DC262610', border:`1px solid ${w.semantic?'#8B5CF630':'#DC262630'}` }}>
                          <span style={{ fontSize:12, fontWeight:700, color:w.semantic?'#8B5CF6':'#DC2626' }}>{w.semantic?'🧠 ':''}{w.word}</span>
                          <span style={{ fontSize:10, color:T.text3, marginLeft:6 }}>{w.count}x</span>
                          {w.explanation && <div style={{ fontSize:10, color:T.text3, marginTop:2 }}>{w.explanation}</div>}
                          {w.detected_phrase && <div style={{ fontSize:10, color:'#8B5CF6', marginTop:2, fontStyle:'italic' }}>"{w.detected_phrase}"</div>}
                        </div>)}
                      </div>
                    </div>

                    {/* Transcription preview with highlighted words */}
                    {alert.transcriptionPreview && (()=>{
                      const fWords = words.map(w=>(w.word||'').toLowerCase()).filter(Boolean);
                      const txt = alert.transcriptionPreview;
                      if (!fWords.length) return <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:T.text3, marginBottom:8, textTransform:'uppercase' }}>Extrait de la conversation</div>
                        <div style={{ padding:12, borderRadius:8, background:T.bg, fontSize:12, color:T.text2, lineHeight:1.6, fontStyle:'italic' }}>"{txt}..."</div>
                      </div>;
                      const rgx = new RegExp('('+fWords.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')', 'gi');
                      const pts = txt.split(rgx);
                      return <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:T.text3, marginBottom:8, textTransform:'uppercase' }}>Extrait de la conversation</div>
                        <div style={{ padding:12, borderRadius:8, background:T.bg, fontSize:12, color:T.text2, lineHeight:1.6 }}>
                          "{pts.map((p,pi)=>fWords.includes(p.toLowerCase())
                            ? <span key={pi} style={{background:'#DC262625',color:'#DC2626',fontWeight:800,padding:'1px 3px',borderRadius:3,textDecoration:'underline wavy #DC2626'}}>{p}</span>
                            : <span key={pi}>{p}</span>
                          )}..."
                        </div>
                      </div>;
                    })()}

                    {/* Recording player */}
                    {alert.callLogId && <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:T.text3, marginBottom:8, textTransform:'uppercase' }}>Écouter l'enregistrement</div>
                      <audio controls src={recUrl(alert.callLogId)} style={{ width:'100%', borderRadius:8 }} preload="none"/>
                    </div>}

                    {/* Explanation */}
                    {alert.collabExplanation ? (
                      <div style={{ padding:12, borderRadius:8, background:'#3B82F610', border:'1px solid #3B82F630' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'#3B82F6', marginBottom:4 }}>Votre explication</div>
                        <div style={{ fontSize:12, color:T.text }}>{alert.collabExplanation}</div>
                      </div>
                    ) : explainId === alert.id ? (
                      <div style={{ padding:12, borderRadius:8, background:T.bg, border:`1px solid ${T.border}` }}>
                        <div style={{ fontSize:11, fontWeight:700, color:T.text3, marginBottom:8 }}>Expliquez pourquoi vous avez utilisé ce mot/phrase :</div>
                        <textarea value={explainText} onChange={e => setExplainText(e.target.value)} placeholder="Ex: Le client a demandé si c'était gratuit, j'ai simplement répondu à sa question..." style={{ width:'100%', minHeight:80, padding:10, borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12, resize:'vertical', outline:'none' }}/>
                        <div style={{ display:'flex', gap:8, marginTop:8, justifyContent:'flex-end' }}>
                          <button onClick={() => { setExplainId(null); setExplainText(''); }} style={{ padding:'6px 16px', borderRadius:8, border:`1px solid ${T.border}`, background:'transparent', color:T.text3, fontSize:12, cursor:'pointer' }}>Annuler</button>
                          <button onClick={() => submitExplanation(alert.id)} disabled={submitting || !explainText.trim()} style={{ padding:'6px 16px', borderRadius:8, border:'none', background:'#3B82F6', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', opacity:submitting?0.6:1 }}>{submitting ? 'Envoi...' : 'Envoyer'}</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setExplainId(alert.id)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8, border:`1px dashed ${T.border}`, background:'transparent', color:T.text2, fontSize:12, cursor:'pointer', width:'100%', justifyContent:'center' }}>
                        <I n="message-square" s={14}/> Expliquer ce signalement
                      </button>
                    )}
                  </div>}
                </div>;
              })}
            </div>}
          </div>;
        
}
