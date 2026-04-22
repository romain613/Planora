// FicheMessagesSms — extraction S1.4b (9/11) depuis FicheContactModal.jsx L354-435
// Responsabilité : onglet SMS — historique + composition + selecteur provider
// (Twilio / Brevo) + templates. Affiché quand collabFicheTab==="sms".
// Aucun changement métier (state window[...] / _T.allSmsMessages / _T.smsLoaded).

import React from "react";
import { T } from "../../../../../theme";
import { I } from "../../../../../shared/ui";
import { api } from "../../../../../shared/services/api";
import { _T } from "../../../../../shared/state/tabState";
import { displayPhone } from "../../../../../shared/utils/phone";
import { useCollabContext } from "../../../context/CollabContext";

const FicheMessagesSms = ({ ct }) => {
  const {
    collab, company,
    collabFicheTab, setCollabFicheTab,
    appMyPhoneNumbers,
    showNotif,
  } = useCollabContext();

  if (collabFicheTab !== "sms") return null;

  return (
    <div>
      {ct.phone ? (()=>{
              const phone = ct.phone.startsWith('+') ? ct.phone : '+33'+ct.phone.replace(/^0/,'');
              // Load SMS history for this contact
              if (!_T.smsLoaded?.[ct.id]) {
                _T.smsLoaded = _T.smsLoaded || {};
                _T.smsLoaded[ct.id] = true;
                api('/api/conversations/sms-history/' + encodeURIComponent(phone.replace(/\s/g,''))).then(msgs => {
                  if (Array.isArray(msgs)) { _T.allSmsMessages = msgs; setCollabFicheTab('sms'); }
                });
              }
              const smsForContact = (_T.allSmsMessages||[]).filter(m => m.toNumber === phone || m.fromNumber === phone);
              return <>
                {/* Compose SMS */}
                {(()=>{
                  const myTwilioNums = (appMyPhoneNumbers||[]).filter(pn => pn.collaboratorId === collab.id && pn.status === 'assigned' && pn.smsCapable);
                  const smsFromKey = '_smsFrom_' + ct.id;
                  const selectedFrom = window[smsFromKey] || (myTwilioNums.length > 0 ? myTwilioNums[0].phoneNumber : 'brevo');
                  return <div style={{display:'flex',flexDirection:'column',height:'100%',maxHeight:500}}>
                  {/* ── HISTORIQUE EN HAUT (scrollable) ── */}
                  <div style={{flex:1,overflowY:'auto',marginBottom:12,paddingRight:4}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:6}}>Historique SMS ({smsForContact.length})</div>
                    {smsForContact.length===0 ? (
                      <div style={{padding:20,textAlign:'center',color:T.text3,fontSize:12}}>Aucun SMS échangé</div>
                    ) : smsForContact.sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')).map((m,i)=>(
                      <div key={i} style={{display:'flex',flexDirection:'column',alignItems:m.direction==='outbound'?'flex-end':'flex-start',marginBottom:8}}>
                        <div style={{maxWidth:'80%',padding:'8px 12px',borderRadius:12,background:m.direction==='outbound'?'linear-gradient(135deg,#2563EB,#1D4ED8)':m.direction==='inbound'?'#F0FDF4':'#E5E7EB',color:m.direction==='outbound'?'#fff':'#1F2937',fontSize:12,lineHeight:1.4,border:m.direction==='inbound'?'1px solid #22C55E30':'none'}}>{m.content}</div>
                        <div style={{fontSize:9,color:T.text3,marginTop:2}}>
                          {m.createdAt?new Date(m.createdAt).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''} · <span style={{color:m.status==='received'?'#22C55E':m.status==='sent'?'#3B82F6':T.text3,fontWeight:600}}>{m.status==='received'?'reçu':m.status||'sent'}</span>
                          {m.provider&&m.provider!=='brevo'&&<span style={{marginLeft:4,fontSize:8,color:'#7C3AED',fontWeight:600}}>via {m.provider}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── COMPOSITION EN BAS (fixe) ── */}
                  <div style={{borderTop:'1px solid '+T.border,paddingTop:10,flexShrink:0}}>
                    {/* Selecteur numero */}
                    <select value={selectedFrom} onChange={e=>{window[smsFromKey]=e.target.value;setCollabFicheTab('sms');}} style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1.5px solid '+(selectedFrom==='brevo'?'#F59E0B40':'#22C55E40'),background:selectedFrom==='brevo'?'#F59E0B06':'#22C55E06',fontSize:11,color:T.text,cursor:'pointer',outline:'none',fontWeight:600,marginBottom:6}}>
                      {myTwilioNums.map(pn=><option key={pn.phoneNumber} value={pn.phoneNumber}>Twilio — {displayPhone(pn.phoneNumber)}</option>)}
                      <option value="brevo">{company?.sms_sender_name||'Calendar360'} (Brevo)</option>
                    </select>
                    {/* Zone de texte + envoi */}
                    <div style={{display:'flex',gap:6,alignItems:'flex-end'}}>
                      <textarea id={'crm-sms-compose-'+ct.id} placeholder="Votre message..." rows={2} style={{flex:1,padding:8,borderRadius:8,border:'1px solid '+T.border,background:T.bg,fontSize:12,fontFamily:'inherit',color:T.text,resize:'none',outline:'none'}} onInput={e=>{window['_smsLen_'+ct.id]=e.target.value.length;setCollabFicheTab('sms');}}/>
                      <div onClick={()=>{
                        const ta=document.getElementById('crm-sms-compose-'+ct.id);
                        const msg=ta?.value?.trim();
                        if(!msg){showNotif('Message vide','error');return;}
                        const fromNum = selectedFrom !== 'brevo' ? selectedFrom : undefined;
                        api('/api/sms/send',{method:'POST',body:{to:phone,content:msg,contactId:ct.id,fromNumber:fromNum}}).then(r=>{
                          if(r?.success){
                            showNotif('SMS envoyé' + (r.provider==='twilio'?' via Twilio':'') + ' !');
                            ta.value='';window['_smsLen_'+ct.id]=0;
                            _T.allSmsMessages = [...(_T.allSmsMessages||[]), {toNumber:phone,fromNumber:r.fromNumber||'',content:msg,direction:'outbound',status:'sent',provider:r.provider,createdAt:new Date().toISOString()}];
                            _T.smsLoaded[ct.id]=false;
                            setCollabFicheTab('sms');
                          } else { showNotif(r?.error||'Erreur envoi SMS','error'); }
                        }).catch(()=>showNotif('Erreur envoi','error'));
                      }} style={{width:40,height:40,borderRadius:10,background:'linear-gradient(135deg,#2563EB,#1D4ED8)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
                        <I n="send" s={16} style={{color:'#fff'}}/>
                      </div>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
                      <span style={{fontSize:9,color:T.text3}}>{window['_smsLen_'+ct.id]||0}/160 · {Math.ceil((window['_smsLen_'+ct.id]||1)/160)} SMS</span>
                      <span style={{fontSize:8,color:selectedFrom==='brevo'?'#F59E0B':'#22C55E',fontWeight:600}}>{selectedFrom==='brevo'?'Brevo':'Twilio'}</span>
                    </div>
                    {/* Templates */}
                    <div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:6}}>
                      {['Bonjour, votre RDV est confirmé.','Rappel : RDV prévu demain.','Merci pour votre visite !','RDV annulé, contactez-nous.'].map((tpl,i)=>
                        <div key={i} onClick={()=>{const ta=document.getElementById('crm-sms-compose-'+ct.id);if(ta){ta.value=tpl;window['_smsLen_'+ct.id]=tpl.length;setCollabFicheTab('sms');}}} style={{fontSize:8,padding:'3px 6px',borderRadius:5,background:T.bg,border:'1px solid '+T.border,cursor:'pointer',color:T.text3}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background=T.bg}>{tpl.substring(0,25)}...</div>
                      )}
                    </div>
                  </div>
                </div>;
                })()}
              </>;
            })() : <div style={{padding:30,textAlign:'center',color:T.text3,fontSize:13}}>Pas de numéro de téléphone pour ce contact</div>}
    </div>
  );
};

export default FicheMessagesSms;
