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

export default function FicheDocsLinkedScreen({ ct, showNotif }) {

                    const [docs, setDocs] = useState([]);
                    const [uploading, setUploading] = useState(false);
                    const [loaded, setLoaded] = useState(false);
                    useEffect(()=>{api(`/api/contact-documents/${ct.id}`).then(d=>{setDocs(Array.isArray(d)?d:[]);setLoaded(true);}).catch(()=>setLoaded(true));},[ct.id]);
                    const handleUpload = async (e) => {
                      const file = e.target.files?.[0];
                      if(!file) return;
                      if(file.size > 10*1024*1024){showNotif('Fichier trop volumineux (max 10 Mo)','danger');return;}
                      setUploading(true);
                      const fd = new FormData();
                      fd.append('file', file);
                      try {
                        const sess = JSON.parse(localStorage.getItem('calendar360-session')||'null');
                        const token = sess?.token || '';
                        const r = await fetch(`/api/contact-documents/${ct.id}/upload`, {method:'POST',body:fd,headers:{'Authorization':'Bearer '+token}});
                        const data = await r.json();
                        if(data?.success && data.document){setDocs(p=>[data.document,...p]);showNotif('Document ajouté','success');}
                        else showNotif(data?.error||'Erreur upload','danger');
                      } catch { showNotif('Erreur réseau','danger'); }
                      setUploading(false);
                      e.target.value='';
                    };
                    const handleDelete = async (docId) => {
                      if(!confirm('Supprimer ce document ?')) return;
                      const r = await api(`/api/contact-documents/${docId}`,{method:'DELETE'});
                      if(r?.success){setDocs(p=>p.filter(d=>d.id!==docId));showNotif('Document supprimé','success');}
                    };
                    const fmtSize = (b) => b>1024*1024?`${(b/1024/1024).toFixed(1)} Mo`:b>1024?`${Math.round(b/1024)} Ko`:`${b} o`;
                    const iconFor = (name) => {const e=(name||'').split('.').pop().toLowerCase();return['pdf'].includes(e)?'file-text':['doc','docx'].includes(e)?'file-text':['xls','xlsx','csv'].includes(e)?'table':['jpg','jpeg','png','gif'].includes(e)?'image':'file';};
                    return <div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                        <div style={{fontSize:13,fontWeight:700,color:T.text}}>📎 Documents ({docs.length})</div>
                        <label style={{padding:'5px 12px',borderRadius:8,background:T.accent,color:'#fff',fontSize:12,fontWeight:600,cursor:uploading?'wait':'pointer',opacity:uploading?0.6:1,display:'inline-flex',alignItems:'center',gap:4}}>
                          <I n="upload" s={12}/> {uploading?'Upload...':'Ajouter'}
                          <input type="file" hidden onChange={handleUpload} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.csv,.ppt,.pptx"/>
                        </label>
                      </div>
                      {!loaded?<div style={{textAlign:'center',padding:20,color:T.text3}}>Chargement...</div>:
                      docs.length===0?<div style={{textAlign:'center',padding:30,color:T.text3,fontSize:13,borderRadius:10,border:`1px dashed ${T.border}`,background:T.bg}}>
                        <I n="folder-open" s={24} style={{color:T.text3,marginBottom:6}}/><br/>Aucun document<br/><span style={{fontSize:11}}>Ajoutez des PDF, images, documents...</span>
                      </div>:
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        {docs.map(d=>(
                          <div key={d.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:8,background:T.bg,border:`1px solid ${T.border}`}}>
                            <I n={iconFor(d.originalName)} s={16} style={{color:T.accent,flexShrink:0}}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:12,fontWeight:600,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.originalName}</div>
                              <div style={{fontSize:10,color:T.text3}}>{fmtSize(d.fileSize)} · {d.uploadedAt?new Date(d.uploadedAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):''}</div>
                            </div>
                            <span onClick={()=>{const sess=JSON.parse(localStorage.getItem('calendar360-session')||'null');window.open(`/api/contact-documents/download/${d.id}?token=${encodeURIComponent(sess?.token||'')}`,'_blank');}} style={{padding:'3px 8px',borderRadius:6,background:T.accentBg,color:T.accent,fontSize:10,fontWeight:600,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:3}}><I n="eye" s={10}/> Ouvrir</span>
                            <span onClick={()=>{const sess=JSON.parse(localStorage.getItem('calendar360-session')||'null');const a=document.createElement('a');a.href=`/api/contact-documents/download/${d.id}?token=${encodeURIComponent(sess?.token||'')}&dl=1`;a.download=d.originalName;document.body.appendChild(a);a.click();a.remove();}} style={{padding:'3px 8px',borderRadius:6,background:'#22C55E14',color:'#22C55E',fontSize:10,fontWeight:600,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:3}}><I n="download" s={10}/></span>
                            <span onClick={()=>{if(!confirm(`Supprimer "${d.originalName}" ?\n\nCette action est irréversible.`))return;handleDelete(d.id);}} style={{cursor:'pointer',padding:'3px 6px',borderRadius:6,color:'#EF4444',fontSize:12,fontWeight:700}} title="Supprimer">×</span>
                          </div>
                        ))}
                      </div>}
                    </div>;
                  
}
