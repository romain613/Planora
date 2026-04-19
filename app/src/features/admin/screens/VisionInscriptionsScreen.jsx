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

export default function VisionInscriptionsScreen({ pushNotification }) {

              const [pendingCompanies, setPendingCompanies] = useState([]);
              const [pendingLoading, setPendingLoading] = useState(true);
              const [rejectModal, setRejectModal] = useState(null);
              const [rejectReason, setRejectReason] = useState('');
              const [detailModal, setDetailModal] = useState(null);
              useEffect(()=>{
                api('/api/companies/pending').then(d=>{if(Array.isArray(d))setPendingCompanies(d);setPendingLoading(false);}).catch(()=>setPendingLoading(false));
              },[]);
              const handleValidate = (id) => {
                if(!confirm('Valider cette entreprise ? Elle pourra accéder à Calendar360.')) return;
                api('/api/companies/'+id+'/validate',{method:'PUT'}).then(r=>{
                  if(r?.success){setPendingCompanies(p=>p.filter(c=>c.id!==id));pushNotification('Entreprise validée','Le compte a été activé','success');}
                  else pushNotification('Erreur',r?.error||'Erreur validation','error');
                });
              };
              const handleReject = () => {
                if(!rejectModal) return;
                api('/api/companies/'+rejectModal.id+'/reject',{method:'PUT',body:{reason:rejectReason}}).then(r=>{
                  if(r?.success){setPendingCompanies(p=>p.filter(c=>c.id!==rejectModal.id));setRejectModal(null);setRejectReason('');pushNotification('Demande refusée','','info');}
                });
              };
              return <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                  <div>
                    <h3 style={{fontSize:16,fontWeight:700}}>Inscriptions en attente</h3>
                    <p style={{fontSize:12,color:T.text3}}>{pendingCompanies.length} demande{pendingCompanies.length>1?'s':''} en attente de validation</p>
                  </div>
                </div>
                {pendingLoading && <div style={{textAlign:'center',padding:20,color:T.text3}}>Chargement...</div>}
                {!pendingLoading && pendingCompanies.length===0 && <div style={{textAlign:'center',padding:40,color:T.text3}}>
                  <div style={{fontSize:48,marginBottom:12}}>✅</div>
                  <div style={{fontSize:14,fontWeight:600}}>Aucune inscription en attente</div>
                </div>}
                {pendingCompanies.map(co=><Card key={co.id} style={{marginBottom:12,padding:16}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:16}}>
                    <div style={{width:48,height:48,borderRadius:12,background:'#7C3AED18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:800,color:'#7C3AED',flexShrink:0}}>{(co.name||'?')[0]?.toUpperCase()}</div>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                        <span style={{fontSize:15,fontWeight:700}}>{co.name}</span>
                        <span style={{padding:'2px 8px',borderRadius:5,background:'#FEF3C7',color:'#92400E',fontSize:10,fontWeight:600}}>En attente</span>
                      </div>
                      <div style={{display:'flex',gap:16,flexWrap:'wrap',fontSize:12,color:T.text3}}>
                        {co.siret && <span>SIRET: {co.siret}</span>}
                        {co.businessId && <span>ID: {co.businessId}</span>}
                        <span>{co.country||'France'}</span>
                        <span>{co.city}</span>
                        <span>📧 {co.contactEmail}</span>
                        <span>📱 {co.phone}</span>
                      </div>
                      {co.admin && <div style={{marginTop:6,fontSize:12}}>
                        <span style={{fontWeight:600}}>Responsable :</span> {co.responsibleFirstName} {co.responsibleLastName} — {co.admin.email} — {co.responsiblePhone}
                      </div>}
                      {co.sector && <div style={{fontSize:11,color:T.text3,marginTop:2}}>Secteur: {co.sector}{co.collaboratorsTarget?' · '+co.collaboratorsTarget+' collabs':''}{co.website?' · '+co.website:''}</div>}
                      <div style={{fontSize:10,color:T.text3,marginTop:2}}>Inscrit le {new Date(co.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}</div>
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0}}>
                      <Btn primary onClick={()=>handleValidate(co.id)} style={{padding:'8px 16px',fontSize:12,borderRadius:8,background:'#22C55E'}}><I n="check" s={14}/> Valider</Btn>
                      <Btn onClick={()=>{setRejectModal(co);setRejectReason('');}} style={{padding:'8px 16px',fontSize:12,borderRadius:8,color:'#EF4444',borderColor:'#EF444440'}}><I n="x" s={14}/> Refuser</Btn>
                    </div>
                  </div>
                </Card>)}
                {/* Reject modal */}
                {rejectModal && <Modal open={true} onClose={()=>setRejectModal(null)} title={'Refuser — '+rejectModal.name} width={500}>
                  <div style={{padding:'0 0 16px'}}>
                    <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6}}>Motif du refus (visible par le demandeur)</label>
                    <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="Ex: Informations incomplètes, SIRET invalide, activité non éligible..." rows={3} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,fontSize:12,color:T.text,outline:'none',resize:'vertical',fontFamily:'inherit'}}/>
                    <div style={{display:'flex',gap:8,marginTop:12}}>
                      <Btn onClick={()=>setRejectModal(null)} style={{flex:1,justifyContent:'center'}}>Annuler</Btn>
                      <Btn primary onClick={handleReject} style={{flex:1,justifyContent:'center',background:'#EF4444'}}>Confirmer le refus</Btn>
                    </div>
                  </div>
                </Modal>}
              </div>;
            
}
