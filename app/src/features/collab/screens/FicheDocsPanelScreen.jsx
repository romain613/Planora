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

export default function FicheDocsPanelScreen({ ct, showNotif }) {

              const [docs, setDocs] = useState([]);
              const [uploading, setUploading] = useState(false);
              const [loaded, setLoaded] = useState(false);
              useEffect(()=>{api(`/api/contact-documents/${ct.id}`).then(d=>{setDocs(Array.isArray(d)?d:[]);setLoaded(true);}).catch(()=>setLoaded(true));},[ct.id]);
              const handleUpload = async (e) => {
                const file=e.target.files?.[0];if(!file)return;
                if(file.size>10*1024*1024){showNotif('Fichier trop volumineux (max 10 Mo)','danger');return;}
                setUploading(true);
                const fd=new FormData();fd.append('file',file);
                try{const sess=JSON.parse(localStorage.getItem('calendar360-session')||'null');const r=await fetch(`/api/contact-documents/${ct.id}/upload`,{method:'POST',body:fd,headers:{'Authorization':'Bearer '+(sess?.token||'')}});const data=await r.json();if(data?.success&&data.document){setDocs(p=>[data.document,...p]);showNotif('Document ajouté','success');}else showNotif(data?.error||'Erreur','danger');}catch{showNotif('Erreur réseau','danger');}
                setUploading(false);e.target.value='';
              };
              const fmtSize=(b)=>b>1024*1024?`${(b/1024/1024).toFixed(1)} Mo`:b>1024?`${Math.round(b/1024)} Ko`:`${b} o`;
              const iconFor=(name)=>{const ext=(name||'').split('.').pop().toLowerCase();return['pdf'].includes(ext)?'file-text':['doc','docx'].includes(ext)?'file-text':['xls','xlsx','csv'].includes(ext)?'table':['jpg','jpeg','png','gif'].includes(ext)?'image':'file';};
              return <div style={{marginTop:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{fontSize:10,fontWeight:700,color:T.text3,display:'flex',alignItems:'center',gap:4}}><I n="paperclip" s={10}/> Documents ({docs.length})</div>
                  <label style={{padding:'2px 8px',borderRadius:6,background:T.accent,color:'#fff',fontSize:9,fontWeight:600,cursor:uploading?'wait':'pointer',opacity:uploading?0.6:1,display:'inline-flex',alignItems:'center',gap:3}}>
                    <I n="upload" s={9}/> {uploading?'...':'Ajouter'}
                    <input type="file" hidden onChange={handleUpload} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.csv,.ppt,.pptx"/>
                  </label>
                </div>
                {loaded&&docs.length===0&&<div style={{textAlign:'center',padding:12,color:T.text3,fontSize:10,borderRadius:8,border:`1px dashed ${T.border}`,background:T.bg}}>Aucun document</div>}
                {docs.map(d=>(
                  <div key={d.id} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',borderRadius:6,background:T.bg,border:`1px solid ${T.border}`,marginBottom:3}}>
                    <I n={iconFor(d.originalName)} s={12} style={{color:T.accent,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:600,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.originalName}</div>
                      <div style={{fontSize:8,color:T.text3}}>{fmtSize(d.fileSize)}</div>
                    </div>
                    <span onClick={()=>{const sess=JSON.parse(localStorage.getItem('calendar360-session')||'null');window.open(`/api/contact-documents/download/${d.id}?token=${encodeURIComponent(sess?.token||'')}`,'_blank');}} style={{padding:'2px 5px',borderRadius:4,background:T.accentBg,color:T.accent,fontSize:8,fontWeight:600,cursor:'pointer'}}><I n="eye" s={8}/></span>
                    <span onClick={()=>{const sess=JSON.parse(localStorage.getItem('calendar360-session')||'null');const a=document.createElement('a');a.href=`/api/contact-documents/download/${d.id}?token=${encodeURIComponent(sess?.token||'')}&dl=1`;a.download=d.originalName;document.body.appendChild(a);a.click();a.remove();}} style={{padding:'2px 5px',borderRadius:4,background:'#22C55E14',color:'#22C55E',fontSize:8,fontWeight:600,cursor:'pointer'}}><I n="download" s={8}/></span>
                    <span onClick={()=>{if(!confirm(`Supprimer "${d.originalName}" ?`))return;api(`/api/contact-documents/${d.id}`,{method:'DELETE'}).then(r=>{if(r?.success){setDocs(p=>p.filter(x=>x.id!==d.id));showNotif('Supprimé','success');}});}} style={{cursor:'pointer',color:'#EF4444',fontSize:10,fontWeight:700}}>×</span>
                  </div>
                ))}
              </div>;
            
}
