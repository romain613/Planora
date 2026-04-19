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

export default function FicheClientMsgScreen({ ct, notifList, setNotifList, setNotifUnread, showNotif }) {

                    const [msgs, setMsgs] = useState([]);
                    const [replyText, setReplyText] = useState('');
                    const [sending, setSending] = useState(false);
                    const [loaded, setLoaded] = useState(false);
                    useEffect(()=>{
                      api(`/api/notifications/client-messages/${ct.id}`).then(d=>{setMsgs(Array.isArray(d)?d:[]);setLoaded(true);}).catch(()=>setLoaded(true));
                      // Auto-marquer les notifs de ce contact comme lues
                      const contactNotifs=notifList.filter(n=>n.contactId===ct.id);
                      if(contactNotifs.length>0){api('/api/notifications/read',{method:'POST',body:{ids:contactNotifs.map(n=>n.id)}}).then(()=>{setNotifList(p=>p.filter(n=>n.contactId!==ct.id));setNotifUnread(p=>Math.max(0,p-contactNotifs.length));}).catch(()=>{});}
                    },[ct.id]);
                    const handleReply = async () => {
                      if(!replyText.trim()||sending) return;
                      setSending(true);
                      const r = await api(`/api/notifications/client-messages/${ct.id}`,{method:'POST',body:{message:replyText.trim()}});
                      if(r?.success){setMsgs(p=>[...p,{id:r.id,direction:'outbound',message:replyText.trim(),createdAt:new Date().toISOString()}]);setReplyText('');showNotif&&showNotif('Message envoyé','success');}
                      setSending(false);
                    };
                    const fmtDT=(iso)=>{try{return new Date(iso).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}catch{return iso;}};
                    return <div>
                      {!loaded?<div style={{textAlign:'center',padding:20,color:T.text3}}>Chargement...</div>:
                      msgs.length===0?<div style={{textAlign:'center',padding:30,color:T.text3,fontSize:13}}>Aucun message client pour l'instant.<br/><span style={{fontSize:11,opacity:0.7}}>Les messages envoyés depuis l'espace client apparaîtront ici.</span></div>:
                      <div style={{maxHeight:300,overflowY:'auto',display:'flex',flexDirection:'column',gap:6,marginBottom:12,padding:'4px 0'}}>
                        {msgs.map(m=>(
                          <div key={m.id} style={{padding:'8px 12px',borderRadius:10,maxWidth:'80%',fontSize:13,lineHeight:1.4,alignSelf:m.direction==='inbound'?'flex-start':'flex-end',background:m.direction==='inbound'?T.card:T.accentBg,border:`1px solid ${m.direction==='inbound'?T.border:T.accent+'30'}`,color:T.text}}>
                            <div style={{fontSize:10,fontWeight:600,color:m.direction==='inbound'?'#DC2626':T.accent,marginBottom:3}}>{m.direction==='inbound'?'👤 Client':'👤 Vous'}</div>
                            {m.message}
                            <div style={{fontSize:10,color:T.text3,marginTop:4}}>{fmtDT(m.createdAt)}</div>
                          </div>
                        ))}
                      </div>}
                      <div style={{display:'flex',gap:8,marginTop:8}}>
                        <textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="Répondre au client..." rows={2} style={{flex:1,padding:'10px 12px',borderRadius:10,border:`1px solid ${T.border}`,fontSize:13,fontFamily:'inherit',color:T.text,background:T.card,resize:'none',outline:'none'}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleReply();}}}/>
                        <button onClick={handleReply} disabled={sending||!replyText.trim()} style={{padding:'10px 16px',borderRadius:10,border:'none',background:T.accent,color:'#fff',fontSize:13,fontWeight:700,cursor:sending?'wait':'pointer',fontFamily:'inherit',opacity:sending||!replyText.trim()?0.5:1,alignSelf:'flex-end'}}>
                          {sending?'...':'Envoyer'}
                        </button>
                      </div>
                    </div>;
                  
}
