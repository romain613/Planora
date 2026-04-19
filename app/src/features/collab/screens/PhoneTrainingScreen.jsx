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

export default function PhoneTrainingScreen({ appMyPhoneNumbers, collab, company, showNotif }) {

    const [trainingAgents, setTrainingAgents] = useState([]);
    const [tLoading, setTLoading] = useState(true);
    const [calling, setCalling] = useState(null);

    useEffect(() => {
      api(`/api/ai-agents?companyId=${company?.id}`).then(agents => {
        setTrainingAgents((agents||[]).filter(a => a.type === 'training' && a.status === 'active'));
        setTLoading(false);
      }).catch(() => setTLoading(false));
    }, []);

    const startTraining = async (agent) => {
      setCalling(agent.id);
      try {
        // Utiliser le numero personnel du collab, sinon demander
        let phone = collab.personalPhone || collab.phone;
        // Exclure les numeros Twilio (commencent par +331596 ou similaires de la plateforme)
        const myTwilioNums = ((typeof appMyPhoneNumbers!=='undefined'?appMyPhoneNumbers:null)||[]).map(p=>p.phoneNumber);
        if (myTwilioNums.includes(phone)) phone = null;
        if (!phone) {
          phone = prompt('Entrez votre numéro de téléphone personnel pour recevoir l\'appel d\'entraînement :\n\nEx: +33612345678');
          if (!phone) { setCalling(null); return; }
        }
        const r = await api(`/api/ai-agents/${agent.id}/call`, { method:'POST', body:{ phoneNumber: phone, collaboratorId: collab.id } });
        if (r?.success || r?.callSid) {
          showNotif('Appel en cours vers ' + phone + ' — Décrochez !', 'success');
        } else { showNotif('Erreur: ' + (r?.error || 'Impossible de lancer l\'appel'), 'danger'); }
      } catch (e) { showNotif('Erreur: ' + e.message, 'danger'); }
      setTimeout(() => setCalling(null), 5000);
    };

    return <div style={{padding:'16px 20px'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
        <I n="target" s={20} color="#F59E0B"/>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:T.text}}>Entraînement IA</div>
          <div style={{fontSize:11,color:T.text3}}>Entraînez-vous avec un agent IA avant vos appels réels</div>
        </div>
      </div>

      {tLoading ? <div style={{textAlign:'center',padding:30,color:T.text3}}>Chargement...</div>
      : trainingAgents.length === 0 ? <div style={{textAlign:'center',padding:40,color:T.text3}}>
        <I n="target" s={36} color={T.text3}/>
        <p style={{marginTop:8,fontSize:12}}>Aucun agent d'entraînement configuré</p>
        <p style={{fontSize:11,color:T.text3}}>Demandez à votre admin d'en créer un</p>
      </div>
      : <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {trainingAgents.map(agent => (
          <div key={agent.id} style={{padding:'14px 16px',borderRadius:12,border:'1px solid '+T.border,background:T.card||T.surface}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:36,height:36,borderRadius:10,background:'#F59E0B15',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <I n="target" s={18} color="#F59E0B"/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text}}>{agent.name}</div>
                <div style={{fontSize:10,color:T.text3}}>
                  {agent.difficulty==='easy'?'Facile':agent.difficulty==='medium'?'Moyen':'Difficile'} · {Math.round(agent.maxDuration/60)}min max
                </div>
              </div>
              <Btn primary disabled={!!calling} onClick={() => startTraining(agent)} style={{display:'flex',alignItems:'center',gap:6}}>
                {calling===agent.id ? <Spinner size={14} color="#fff"/> : <I n="phone" s={14}/>}
                {calling===agent.id ? 'Appel...' : 'S\'entraîner'}
              </Btn>
            </div>
            {agent.scenario && <div style={{marginTop:8,padding:8,borderRadius:6,background:T.bg,fontSize:11,color:T.text3,lineHeight:1.4}}>
              <strong>Scénario :</strong> {agent.scenario.substring(0,120)}{agent.scenario.length>120?'...':''}
            </div>}
          </div>
        ))}
      </div>}
    </div>;
  
}
