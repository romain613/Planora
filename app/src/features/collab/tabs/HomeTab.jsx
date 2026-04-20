// Phase 13a — extracted Home tab from CollabPortal.jsx (was lines 3605-4439 IIFE).

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Avatar, Stat, Stars } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { _T } from "../../../shared/state/tabState";
import { useCollabContext } from "../context/CollabContext";

const HomeTab = () => {
  const {
    collab, showNotif,
    bookings, voipCallLogs, smsCredits, contacts,
    fmtPhone,
    portalTab, setPortalTab,
    portalTabKey, setPortalTabKey,
    phoneDialNumber, setPhoneDialNumber,
    phoneRightTab, setPhoneRightTab,
    pipelineRightContact, setPipelineRightContact,
    phoneShowScheduleModal, setPhoneShowScheduleModal,
    phoneScheduleForm, setPhoneScheduleForm,
    rdvPasseModal, setRdvPasseModal,
    selectedCrmContact, setSelectedCrmContact,
    collabFicheTab, setCollabFicheTab,
    startPhoneCall, startVoipCall,
    // ═══ REWIRE 2026-04-20 — destructure complémentaire (7 symboles) ═══
    PIPELINE_STAGES,
    _tempColor,
    _tempEmoji,
    _tempLabel,
    calendars,
    company,
    getLeadTemperature,
  } = useCollabContext();

const todayISO = new Date().toISOString().split('T')[0];
const nowH = new Date().getHours();
const greeting = nowH < 12 ? 'Bonjour' : nowH < 18 ? 'Bon après-midi' : 'Bonsoir';
const firstname = collab?.name?.split(' ')[0] || '';

// KPI data
const todayCalls = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(c=>c.createdAt&&c.createdAt.startsWith(todayISO)).length;
const todayBookings = (bookings||[]).filter(b=>b.date===todayISO&&b.status==='confirmed'&&(b.collaboratorId===collab.id)).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
const rdvPassesAQualifier = (contacts||[]).filter(c=>c.assignedTo===collab.id&&c.pipeline_stage==='rdv_programme'&&(()=>{const liveRdv=(bookings||[]).filter(b=>b.contactId===c.id&&b.status==='confirmed').sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];const rdvD=liveRdv?liveRdv.date+(liveRdv.time?'T'+liveRdv.time:'T23:59'):c.next_rdv_date;return rdvD&&new Date(rdvD).getTime()<Date.now();})());
const nrpToRelance = (contacts||[]).filter(c=>c.assignedTo===collab.id&&c.pipeline_stage==='nrp'&&c.nrp_next_relance&&c.nrp_next_relance<=todayISO);
const contactsInactifs = (contacts||[]).filter(c=>c.assignedTo===collab.id&&!['perdu','client_valide'].includes(c.pipeline_stage)&&(()=>{const d=c.updatedAt||c.lastVisit||c.createdAt;return d&&Math.floor((Date.now()-new Date(d).getTime())/86400000)>=14;})());
const nouveauxLeads = (contacts||[]).filter(c=>c.assignedTo===collab.id&&c.pipeline_stage==='nouveau'&&!c.lastVisit);
const totalActions = rdvPassesAQualifier.length + nrpToRelance.length + contactsInactifs.length + nouveauxLeads.length;

const weekStart = new Date();weekStart.setDate(weekStart.getDate()-weekStart.getDay()+1);
const weekISO = weekStart.toISOString().split('T')[0];
const weekCalls = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(c=>c.createdAt&&c.createdAt>=weekISO).length;
const totalContacts = (contacts||[]).filter(c=>c.assignedTo===collab.id).length;
const clientsValides = (contacts||[]).filter(c=>c.assignedTo===collab.id&&c.pipeline_stage==='client_valide').length;
const tauxConversion = totalContacts>0?Math.round(clientsValides/totalContacts*100):0;

const timeEmoji = nowH < 7 ? '🌙' : nowH < 12 ? '☀️' : nowH < 18 ? '🔥' : '🌙';
const motivMsg = totalActions > 3 ? 'Plusieurs actions vous attendent !' : todayCalls >= 10 ? 'Excellent rythme, continuez !' : todayCalls > 0 ? 'La journée avance bien.' : 'Prêt à démarrer ?';

return <div style={{padding:'0 4px'}}>
  {/* ── Header premium ── */}
  <div style={{marginBottom:24,padding:'20px 24px',borderRadius:16,background:'linear-gradient(135deg,#7C3AED08,#3B82F606,#22C55E04)',border:'1px solid '+T.border,position:'relative',overflow:'hidden'}}>
    <div style={{position:'absolute',top:-20,right:-10,fontSize:80,opacity:0.06,lineHeight:1}}>{timeEmoji}</div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',position:'relative',zIndex:1}}>
      <div>
        <div style={{fontSize:24,fontWeight:800,color:T.text,letterSpacing:-0.5}}>{timeEmoji} {greeting}, <span style={{background:'linear-gradient(135deg,#7C3AED,#3B82F6)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>{firstname}</span></div>
        <div style={{fontSize:12,color:T.text3,marginTop:4,fontWeight:500}}>{new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · {motivMsg}</div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        {totalActions>0 && <div style={{padding:'6px 14px',borderRadius:10,background:'linear-gradient(135deg,#F59E0B,#F97316)',color:'#fff',fontSize:11,fontWeight:800,display:'flex',alignItems:'center',gap:5,boxShadow:'0 2px 8px #F59E0B30'}}><I n="zap" s={13}/> {totalActions} action{totalActions>1?'s':''}</div>}
      </div>
    </div>
  </div>

  {/* ── KPI Cards ── */}
  <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:24}}>
    {[
      {icon:'phone-outgoing',label:'Appels du jour',value:todayCalls,color:'#3B82F6',gradient:'linear-gradient(135deg,#3B82F610,#3B82F604)'},
      {icon:'calendar-check',label:'RDV aujourd\'hui',value:todayBookings.length,color:'#0EA5E9',gradient:'linear-gradient(135deg,#0EA5E910,#0EA5E904)'},
      {icon:'user-check',label:'À qualifier',value:rdvPassesAQualifier.length,color:rdvPassesAQualifier.length>0?'#F97316':'#22C55E',gradient:rdvPassesAQualifier.length>0?'linear-gradient(135deg,#F9731610,#F9731604)':'linear-gradient(135deg,#22C55E10,#22C55E04)'},
      {icon:'phone-missed',label:'NRP à relancer',value:nrpToRelance.length,color:nrpToRelance.length>0?'#EF4444':'#22C55E',gradient:nrpToRelance.length>0?'linear-gradient(135deg,#EF444410,#EF444404)':'linear-gradient(135deg,#22C55E10,#22C55E04)'},
      {icon:'message-circle',label:'Crédits SMS',value:(typeof smsCredits!=='undefined'?smsCredits:null)||0,color:(typeof smsCredits!=='undefined'?smsCredits:null)<20?'#EF4444':(typeof smsCredits!=='undefined'?smsCredits:null)<50?'#F59E0B':'#22C55E',gradient:'linear-gradient(135deg,#22C55E10,#22C55E04)'},
    ].map((kpi,i)=>(
      <div key={i} style={{padding:'16px 14px',borderRadius:14,background:kpi.gradient,border:'1px solid '+kpi.color+'15',position:'relative',overflow:'hidden',transition:'all .2s',cursor:'default'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 4px 12px '+kpi.color+'15';}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none';}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div style={{width:36,height:36,borderRadius:10,background:kpi.color+'15',display:'flex',alignItems:'center',justifyContent:'center'}}><I n={kpi.icon} s={17} style={{color:kpi.color}}/></div>
          {kpi.value>0&&<div style={{width:8,height:8,borderRadius:4,background:kpi.color,boxShadow:'0 0 6px '+kpi.color+'60'}}/>}
        </div>
        <div style={{fontSize:28,fontWeight:900,color:kpi.color,lineHeight:1}}>{kpi.value}</div>
        <div style={{fontSize:10,fontWeight:600,color:T.text3,marginTop:4}}>{kpi.label}</div>
      </div>
    ))}
  </div>

  {/* ── Assistant IA — Coach commercial + Checklist + Chat ── */}
  {(()=>{
    // Briefing statique
    const briefMsgs = [];
    briefMsgs.push({msg:`${greeting} ${firstname} ! Voici mon briefing pour aujourd'hui.`});
    if (rdvPassesAQualifier.length > 0) briefMsgs.push({msg:`${rdvPassesAQualifier.length} RDV passe${rdvPassesAQualifier.length>1?'s':''} a qualifier.`,action:{label:'Qualifier',icon:'check-circle',color:'#F97316',onClick:()=>{const c=rdvPassesAQualifier[0];const liveRdv2=(bookings||[]).find(b=>b.contactId===c.id&&b.status==='confirmed');setRdvPasseModal({contact:c,rdvDate:liveRdv2?.date||c.next_rdv_date,bookingId:liveRdv2?.id});}}});
    if (nrpToRelance.length > 0) briefMsgs.push({msg:`${nrpToRelance.length} NRP a relancer.`,action:{label:'Appeler',icon:'phone',color:'#22C55E',onClick:()=>{const c=nrpToRelance[0];if(c.phone){setPortalTab('phone');setTimeout(()=>startPhoneCall(c.phone,c),300);}}}});
    if (todayBookings.length > 0) briefMsgs.push({msg:`${todayBookings.length} RDV aujourd'hui. Prochain : ${todayBookings[0].time||'--:--'} avec ${todayBookings[0].visitorName||'un visiteur'}.`});
    if (todayCalls === 0) briefMsgs.push({msg:"Pas encore d'appels. Lancez votre session !"});
    else briefMsgs.push({msg:`${todayCalls} appel${todayCalls>1?'s':''}${todayCalls>=5?' — excellent !':'. Objectif : 10 !'}`});
    if (tauxConversion < 10 && totalContacts > 5) briefMsgs.push({msg:`Conversion a ${tauxConversion}%. Focus contacts HOT.`});

    // Chat state
    if (!_T.aiChat) _T.aiChat = { messages: [], loading: false, input: '' };
    const chat = _T.aiChat;
    const chatMsgs = chat.messages;

    // V3: Checklist volatile — mémoire onglet uniquement
    if (!_T.aiChecklist) { _T.aiChecklist = []; }
    const checklist = _T.aiChecklist;
    const saveChecklist = () => { /* V3: volatile only */ };
    const clDone = checklist.filter(t=>t.done).length;
    const clTotal = checklist.length;

    // Focus mode
    if (_T.aiFocusMode === undefined) _T.aiFocusMode = false;
    if (_T.aiFocusIdx === undefined) _T.aiFocusIdx = 0;
    const focusMode = _T.aiFocusMode;

    // Checklist open/close
    if (_T.aiChecklistOpen === undefined) _T.aiChecklistOpen = true;

    // Chat open/close
    if (_T.aiChatOpen === undefined) _T.aiChatOpen = true;

    const scrollToBottom = () => { setTimeout(()=>{ const el=document.getElementById('ai-chat-scroll'); if(el) el.scrollTop=el.scrollHeight; },50); };

    // Checklist functions
    const addTask = (text, priority, contactId, phone, name) => {
      if (!text) return;
      // Dedup : même texte ou même contactId
      if (checklist.some(t=>t.text===text||(contactId&&t.contactId===contactId&&!t.done))) return;
      checklist.push({ id:'t_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), text, priority:priority||'normal', done:false, contactId:contactId||null, phone:phone||null, name:name||null, type:'manual', createdAt:new Date().toISOString() });
      saveChecklist();
      setPortalTabKey(k=>k+1);
    };
    const toggleTask = (id) => { const t=checklist.find(x=>x.id===id); if(t){t.done=!t.done; saveChecklist(); setPortalTabKey(k=>k+1); if(t.done) showNotif('Tache terminee !','success');} };
    const removeTask = (id) => { const idx2=checklist.findIndex(x=>x.id===id); if(idx2>=0){checklist.splice(idx2,1); saveChecklist(); setPortalTabKey(k=>k+1);} };
    const clearDone = () => { _T.aiChecklist=checklist.filter(t=>!t.done); saveChecklist(); setPortalTabKey(k=>k+1); };

    const generateDay = () => {
      sendMsg("Genere ma checklist du jour. Pour chaque action prioritaire, propose un suggestedAction avec le contactId, le telephone et le nom du contact. Propose 5 a 8 actions concretes basees sur mon pipeline, mes NRP, mes RDV et mes leads chauds.");
      // Les suggestedActions de la réponse seront auto-ajoutées à la checklist
      chat._pendingChecklist = true;
    };

    // Intercept GPT response to auto-add checklist items
    const sendMsg = (text) => {
      const inputEl = document.getElementById('ai-chat-input');
      const msg = (text || inputEl?.value || chat.input || '').trim();
      if (!msg || chat.loading) return;
      chat.messages.push({ role: 'user', content: msg });
      chat.input = '';
      if(inputEl) inputEl.value = '';
      chat.loading = true;
      setPortalTabKey(k=>k+1);
      scrollToBottom();
      const historyForApi = chat.messages.map(m=>({role:m.role,content:m.content}));
      api('/api/ai-copilot/daily-chat', { method:'POST', body:{ message:msg, history:historyForApi.slice(0,-1) } })
        .then(r=>{
          chat.messages.push({ role:'assistant', content:r?.reply||'...', actions:r?.suggestedActions||[] });
          // Auto-add suggestedActions to checklist if generateDay was triggered
          if (chat._pendingChecklist && r?.suggestedActions?.length > 0) {
            r.suggestedActions.forEach(a => {
              addTask(a.label, a.type==='call'?'high':'normal', a.contactId, a.phone, a.name);
            });
            chat._pendingChecklist = false;
            showNotif(r.suggestedActions.length+' taches ajoutees a la checklist !','success');
          }
          chat.loading=false;
          setPortalTabKey(k=>k+1);
          scrollToBottom();
        })
        .catch(()=>{
          chat.messages.push({ role:'assistant', content:"Erreur de connexion. Reessayez.", actions:[] });
          chat.loading=false;
          chat._pendingChecklist=false;
          setPortalTabKey(k=>k+1);
        });
    };

    const handleAiAction = (action) => {
      const ct = action.contactId ? (contacts||[]).find(c=>c.id===action.contactId) : null;
      if (action.type === 'call') { const phone = action.phone || ct?.phone; if (phone) { setPortalTab('phone'); setTimeout(()=>{ if(typeof startPhoneCall==='function') startPhoneCall(phone,ct||{name:action.name,phone}); },300); } }
      else if (action.type === 'sms') { if (ct) { setSelectedCrmContact(ct); setCollabFicheTab('client_msg'); setPortalTab('crm'); } }
      else if (action.type === 'fiche') { if (ct) { setSelectedCrmContact(ct); setPortalTab('crm'); } }
      else if (action.type === 'rdv') { setPortalTab('agenda'); }
      else if (action.type === 'qualifier' && ct) { const liveRdv2=(bookings||[]).find(b=>b.contactId===ct.id&&b.status==='confirmed'); setRdvPasseModal({contact:ct,rdvDate:liveRdv2?.date||ct.next_rdv_date,bookingId:liveRdv2?.id}); }
      showNotif('Action : '+action.label, 'success');
    };

    const actionColors = {call:'#22C55E',sms:'#3B82F6',fiche:'#7C3AED',rdv:'#F59E0B',qualifier:'#F97316'};
    const actionIcons = {call:'phone',sms:'message-circle',fiche:'user',rdv:'calendar',qualifier:'check-circle'};
    const prioColors = {high:'#EF4444',normal:'#F59E0B',low:'#94A3B8'};
    const prioEmojis = {high:'🔥',normal:'⚡',low:'💤'};

    // ══ MODE FOCUS ══
    if (focusMode) {
      const pending = checklist.filter(t=>!t.done);
      const focIdx = Math.min(_T.aiFocusIdx||0, Math.max(0,pending.length-1));
      const focTask = pending[focIdx];
      if (!focTask) { _T.aiFocusMode = false; setPortalTabKey(k=>k+1); return null; }
      const focCt = focTask.contactId ? (contacts||[]).find(c=>c.id===focTask.contactId) : null;
      return <div style={{borderRadius:20,border:'2px solid #7C3AED30',background:'linear-gradient(160deg,#7C3AED06,#2563EB04)',overflow:'hidden',marginBottom:20,boxShadow:'0 8px 30px #7C3AED10'}}>
        {/* Focus header */}
        <div style={{padding:'12px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',background:'linear-gradient(135deg,#7C3AED,#2563EB)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:16}}>🔥</span>
            <span style={{fontSize:14,fontWeight:800,color:'#fff'}}>Mode Focus</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:12,fontWeight:700,color:'#ffffffCC'}}>{focIdx+1} / {pending.length}</span>
            <div onClick={()=>{_T.aiFocusMode=false;setPortalTabKey(k=>k+1);}} style={{padding:'4px 10px',borderRadius:6,background:'rgba(255,255,255,0.2)',color:'#fff',fontSize:10,fontWeight:700,cursor:'pointer'}}>Quitter</div>
          </div>
        </div>
        {/* Focus card */}
        <div style={{padding:'30px 24px',textAlign:'center'}}>
          {focCt && <div style={{marginBottom:12}}><Avatar name={focCt.name} color={prioColors[focTask.priority]||'#7C3AED'} size={64}/></div>}
          <div style={{fontSize:9,fontWeight:700,color:prioColors[focTask.priority],textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{prioEmojis[focTask.priority]} {focTask.priority==='high'?'Prioritaire':focTask.priority==='normal'?'Normal':'Faible priorite'}</div>
          <div style={{fontSize:20,fontWeight:800,color:T.text,lineHeight:1.4,marginBottom:4}}>{focTask.text}</div>
          {focTask.name && <div style={{fontSize:12,color:T.text3}}>{focTask.name}</div>}
          {focTask.phone && <div style={{fontSize:12,color:T.text3,marginTop:2}}>{focTask.phone}</div>}
        </div>
        {/* Focus actions */}
        <div style={{padding:'0 24px 24px',display:'flex',justifyContent:'center',gap:14}}>
          <div style={{textAlign:'center'}}>
            <div onClick={()=>{toggleTask(focTask.id);if(focIdx>=pending.length-1)_T.aiFocusIdx=0;setPortalTabKey(k=>k+1);}} style={{width:56,height:56,borderRadius:28,background:'linear-gradient(135deg,#22C55E,#10B981)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:'0 4px 16px #22C55E30',transition:'transform .2s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.12)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}><I n="check" s={24} style={{color:'#fff'}}/></div>
            <div style={{fontSize:8,fontWeight:700,color:'#22C55E',marginTop:4}}>Fait</div>
          </div>
          {focTask.phone && <div style={{textAlign:'center'}}>
            <div onClick={()=>{const ph=focTask.phone;const c2=focCt||{name:focTask.name,phone:ph};setPortalTab('phone');setTimeout(()=>{if(typeof startPhoneCall==='function')startPhoneCall(ph,c2);},300);}} style={{width:56,height:56,borderRadius:28,background:'linear-gradient(135deg,#3B82F6,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:'0 4px 16px #3B82F630',transition:'transform .2s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.12)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}><I n="phone" s={24} style={{color:'#fff'}}/></div>
            <div style={{fontSize:8,fontWeight:700,color:'#3B82F6',marginTop:4}}>Appeler</div>
          </div>}
          <div style={{textAlign:'center'}}>
            <div onClick={()=>{_T.aiFocusIdx=Math.min(focIdx+1,pending.length-1);setPortalTabKey(k=>k+1);}} style={{width:56,height:56,borderRadius:28,background:T.card,border:'2px solid '+T.border,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'transform .2s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.12)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}><I n="skip-forward" s={24} style={{color:T.text3}}/></div>
            <div style={{fontSize:8,fontWeight:700,color:T.text3,marginTop:4}}>Suivant</div>
          </div>
        </div>
        {/* Focus progress */}
        <div style={{height:4,background:T.border}}><div style={{height:'100%',background:'linear-gradient(90deg,#22C55E,#7C3AED)',width:Math.round(clDone/Math.max(clTotal,1)*100)+'%',transition:'width .4s'}}/></div>
      </div>;
    }

    // ══ MODE NORMAL ══
    return <div style={{borderRadius:16,border:'1.5px solid #7C3AED20',background:'linear-gradient(160deg,#7C3AED04,#2563EB02)',overflow:'hidden',marginBottom:20,display:'flex',flexDirection:'column'}}>
      {/* ── HEADER avec progression ── */}
      <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid #7C3AED15',background:'linear-gradient(135deg,#7C3AED06,#2563EB04)'}}>
        <div style={{width:38,height:38,borderRadius:12,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 2px 8px #7C3AED30'}}><I n="cpu" s={18} style={{color:'#fff'}}/></div>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:800,color:T.text}}>Assistant IA</div>
          <div style={{fontSize:9,color:'#22C55E',fontWeight:600,display:'flex',alignItems:'center',gap:4}}><span style={{width:6,height:6,borderRadius:3,background:'#22C55E',display:'inline-block',boxShadow:'0 0 4px #22C55E60'}}/>En ligne · GPT-4o</div>
        </div>
        {/* Checklist progress */}
        {clTotal>0 && <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:50,height:5,borderRadius:3,background:T.border,overflow:'hidden'}}><div style={{height:'100%',borderRadius:3,background:clDone===clTotal?'#22C55E':'linear-gradient(90deg,#7C3AED,#3B82F6)',width:Math.round(clDone/clTotal*100)+'%',transition:'width .4s'}}/></div>
          <span style={{fontSize:10,fontWeight:700,color:clDone===clTotal?'#22C55E':'#7C3AED'}}>{clDone}/{clTotal}</span>
          {clDone===clTotal&&clTotal>0&&<span style={{fontSize:10}}>🎉</span>}
        </div>}
        {chatMsgs.length>0&&<div onClick={()=>{_T.aiChat={messages:[],loading:false,input:''};setPortalTabKey(k=>k+1);}} style={{padding:'4px 10px',borderRadius:6,fontSize:9,fontWeight:700,color:T.text3,cursor:'pointer',border:'1px solid '+T.border}} title="Reset chat"><I n="refresh-cw" s={10}/></div>}
      </div>

      {/* ══ CHECKLIST DU JOUR ══ */}
      <div style={{borderBottom:'1px solid #7C3AED10'}}>
        {/* Checklist toolbar */}
        <div style={{padding:'8px 16px',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          <div onClick={()=>{_T.aiChecklistOpen=!_T.aiChecklistOpen;setPortalTabKey(k=>k+1);}} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
            <I n={_T.aiChecklistOpen?'chevron-down':'chevron-right'} s={14} style={{color:T.text3}}/>
            <span style={{fontSize:12,fontWeight:700,color:T.text}}>Checklist</span>
          </div>
          <div onClick={()=>{const txt=prompt('Nouvelle tache :');if(txt)addTask(txt,'normal');}} style={{padding:'3px 8px',borderRadius:6,fontSize:9,fontWeight:700,color:'#7C3AED',background:'#7C3AED08',border:'1px solid #7C3AED15',cursor:'pointer',display:'flex',alignItems:'center',gap:3}} title="Ajouter une tache"><I n="plus" s={10}/>Ajouter</div>
          <div onClick={generateDay} style={{padding:'3px 8px',borderRadius:6,fontSize:9,fontWeight:700,color:'#F59E0B',background:'#F59E0B08',border:'1px solid #F59E0B15',cursor:'pointer',display:'flex',alignItems:'center',gap:3}} title="Generer via IA"><I n="zap" s={10}/>Generer ma journee</div>
          <div onClick={()=>{_T.aiFocusMode=true;_T.aiFocusIdx=0;setPortalTabKey(k=>k+1);}} style={{padding:'3px 8px',borderRadius:6,fontSize:9,fontWeight:700,color:'#EF4444',background:'#EF444408',border:'1px solid #EF444415',cursor:'pointer',display:'flex',alignItems:'center',gap:3,opacity:clTotal>0?1:0.4}} title="Mode Focus"><I n="target" s={10}/>Focus</div>
          {clDone>0&&<div onClick={clearDone} style={{marginLeft:'auto',padding:'3px 8px',borderRadius:6,fontSize:8,fontWeight:600,color:T.text3,cursor:'pointer',border:'1px solid '+T.border}}>Nettoyer</div>}
        </div>
        {/* Checklist items */}
        {_T.aiChecklistOpen && clTotal > 0 && <div style={{padding:'0 16px 10px',display:'flex',flexDirection:'column',gap:4}}>
          {checklist.map(t=>{
            const tCt = t.contactId ? (contacts||[]).find(c=>c.id===t.contactId) : null;
            return <div key={t.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:10,background:t.done?'#22C55E06':T.card,border:'1px solid '+(t.done?'#22C55E15':T.border),transition:'all .2s',opacity:t.done?0.6:1}}>
              {/* Checkbox */}
              <div onClick={()=>toggleTask(t.id)} style={{width:20,height:20,borderRadius:6,border:'2px solid '+(t.done?'#22C55E':prioColors[t.priority]||T.border),background:t.done?'#22C55E':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s',flexShrink:0}}>
                {t.done&&<I n="check" s={12} style={{color:'#fff'}}/>}
              </div>
              {/* Text */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:t.done?T.text3:T.text,textDecoration:t.done?'line-through':'none',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.text}</div>
                {t.name&&!t.done&&<div style={{fontSize:9,color:T.text3}}>{t.name}{t.phone?' · '+t.phone:''}</div>}
              </div>
              {/* Priority badge */}
              {!t.done&&<span style={{fontSize:10}}>{prioEmojis[t.priority]||''}</span>}
              {/* Quick actions */}
              {!t.done&&t.phone&&<div onClick={()=>{const c2=tCt||{name:t.name,phone:t.phone};setPortalTab('phone');setTimeout(()=>{if(typeof startPhoneCall==='function')startPhoneCall(t.phone,c2);},300);}} style={{width:22,height:22,borderRadius:6,background:'#22C55E12',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}} title="Appeler"><I n="phone" s={10} style={{color:'#22C55E'}}/></div>}
              {!t.done&&tCt&&<div onClick={()=>{setSelectedCrmContact(tCt);setPortalTab('crm');}} style={{width:22,height:22,borderRadius:6,background:'#7C3AED12',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}} title="Voir fiche"><I n="user" s={10} style={{color:'#7C3AED'}}/></div>}
              {/* Remove */}
              <div onClick={()=>removeTask(t.id)} style={{width:18,height:18,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',opacity:0.3,flexShrink:0}} title="Supprimer"><I n="x" s={10} style={{color:T.text3}}/></div>
            </div>;
          })}
        </div>}
        {/* Quick add input */}
        {_T.aiChecklistOpen && <div style={{padding:'0 16px 8px'}}>
          <input id="ai-checklist-add" type="text" placeholder="+ Ajouter une tache..."
            onKeyDown={e=>{if(e.key==='Enter'&&e.target.value.trim()){addTask(e.target.value.trim(),'normal');e.target.value='';}}}
            style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1px dashed '+T.border,background:'transparent',fontSize:11,color:T.text,outline:'none'}}
            onFocus={e=>e.target.style.borderColor='#7C3AED'}
            onBlur={e=>e.target.style.borderColor=T.border}
          />
        </div>}
      </div>

      {/* ══ CHAT IA (accordéon) ══ */}
      <div onClick={()=>{_T.aiChatOpen=!_T.aiChatOpen;setPortalTabKey(k=>k+1);}} style={{padding:'8px 16px',display:'flex',alignItems:'center',gap:6,cursor:'pointer',borderBottom:_T.aiChatOpen?'1px solid #7C3AED10':'none'}}>
        <I n={_T.aiChatOpen?'chevron-down':'chevron-right'} s={14} style={{color:T.text3}}/>
        <span style={{fontSize:12,fontWeight:700,color:T.text}}>Chat IA</span>
        {chatMsgs.length>0&&<span style={{fontSize:9,fontWeight:600,color:T.text3}}>{chatMsgs.length} messages</span>}
      </div>

      {_T.aiChatOpen && <>
      {/* Messages area */}
      <div id="ai-chat-scroll" style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:10,maxHeight:350,overflowY:'auto',flex:1}}>
        {briefMsgs.map((m,i)=>(
          <div key={'b'+i} style={{display:'flex',gap:8,alignItems:'flex-start',maxWidth:'85%'}}>
            <div style={{width:22,height:22,borderRadius:7,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2}}><I n="cpu" s={10} style={{color:'#fff'}}/></div>
            <div style={{flex:1}}>
              <div style={{padding:'8px 12px',borderRadius:'4px 12px 12px 12px',background:T.card,border:'1px solid '+T.border,fontSize:12,color:T.text,lineHeight:1.5}}>{m.msg}</div>
              {m.action&&<div onClick={m.action.onClick} style={{marginTop:4,display:'inline-flex',alignItems:'center',gap:4,padding:'5px 12px',borderRadius:8,background:m.action.color||'#7C3AED',color:'#fff',fontSize:10,fontWeight:700,cursor:'pointer',boxShadow:'0 1px 4px '+(m.action.color||'#7C3AED')+'30'}}><I n={m.action.icon||'zap'} s={11}/>{m.action.label}</div>}
            </div>
          </div>
        ))}
        {chatMsgs.length>0&&<div style={{display:'flex',alignItems:'center',gap:8,margin:'4px 0'}}><div style={{flex:1,height:1,background:T.border}}/><span style={{fontSize:9,color:T.text3,fontWeight:600}}>Conversation</span><div style={{flex:1,height:1,background:T.border}}/></div>}
        {chatMsgs.map((m,i)=>(
          m.role==='user' ? (
            <div key={'c'+i} style={{display:'flex',justifyContent:'flex-end'}}>
              <div style={{padding:'8px 14px',borderRadius:'12px 4px 12px 12px',background:'linear-gradient(135deg,#7C3AED,#2563EB)',color:'#fff',fontSize:12,lineHeight:1.5,maxWidth:'80%',boxShadow:'0 2px 6px #7C3AED20'}}>{m.content}</div>
            </div>
          ) : (
            <div key={'c'+i} style={{display:'flex',gap:8,alignItems:'flex-start',maxWidth:'85%'}}>
              <div style={{width:22,height:22,borderRadius:7,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2}}><I n="cpu" s={10} style={{color:'#fff'}}/></div>
              <div style={{flex:1}}>
                <div style={{padding:'8px 12px',borderRadius:'4px 12px 12px 12px',background:T.card,border:'1px solid '+T.border,fontSize:12,color:T.text,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{m.content}</div>
                {m.actions&&m.actions.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:5}}>
                  {m.actions.map((a,j)=><div key={j} onClick={()=>handleAiAction(a)} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'5px 12px',borderRadius:8,background:(actionColors[a.type]||'#7C3AED'),color:'#fff',fontSize:10,fontWeight:700,cursor:'pointer',boxShadow:'0 1px 4px '+(actionColors[a.type]||'#7C3AED')+'30',transition:'transform .1s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.05)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}><I n={actionIcons[a.type]||'zap'} s={11}/>{a.label}</div>)}
                </div>}
              </div>
            </div>
          )
        ))}
        {chat.loading&&<div style={{display:'flex',gap:8,alignItems:'flex-start',maxWidth:'85%'}}>
          <div style={{width:22,height:22,borderRadius:7,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2}}><I n="cpu" s={10} style={{color:'#fff'}}/></div>
          <div style={{padding:'10px 16px',borderRadius:'4px 12px 12px 12px',background:T.card,border:'1px solid '+T.border,display:'flex',gap:4,alignItems:'center'}}>
            <div style={{width:6,height:6,borderRadius:3,background:'#7C3AED',opacity:0.4,animation:'pulse 1.4s infinite'}}/><div style={{width:6,height:6,borderRadius:3,background:'#7C3AED',opacity:0.4,animation:'pulse 1.4s infinite 0.2s'}}/><div style={{width:6,height:6,borderRadius:3,background:'#7C3AED',opacity:0.4,animation:'pulse 1.4s infinite 0.4s'}}/>
          </div>
        </div>}
      </div>
      {/* Quick prompts */}
      <div style={{padding:'6px 16px',display:'flex',gap:6,flexWrap:'wrap',borderTop:'1px solid #7C3AED10'}}>
        {[{label:'📞 Qui rappeler ?',prompt:'Qui dois-je rappeler en priorite aujourd\'hui ?'},{label:'📊 Mon pipeline',prompt:'Quel est l\'etat de mon pipeline commercial ?'},{label:'🔥 Contacts HOT',prompt:'Quels sont mes contacts les plus chauds ?'},{label:'📋 Plan du jour',prompt:'Propose-moi un plan d\'action optimise.'}].map((q,i)=><div key={i} onClick={()=>sendMsg(q.prompt)} style={{padding:'4px 10px',borderRadius:8,fontSize:10,fontWeight:600,color:'#7C3AED',background:'#7C3AED08',border:'1px solid #7C3AED15',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap'}} onMouseEnter={e=>e.currentTarget.style.background='#7C3AED15'} onMouseLeave={e=>e.currentTarget.style.background='#7C3AED08'}>{q.label}</div>)}
      </div>
      {/* Input */}
      <div style={{padding:'10px 16px 12px',borderTop:'1px solid '+T.border,display:'flex',gap:8,alignItems:'center',background:T.card}}>
        <input id="ai-chat-input" type="text" defaultValue={chat.input||''} onChange={e=>{chat.input=e.target.value;}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();const el=document.getElementById('ai-chat-input');if(el)el.value='';}}} placeholder="Posez une question a votre assistant IA..." style={{flex:1,padding:'10px 14px',borderRadius:10,border:'1.5px solid '+T.border,background:T.bg,fontSize:12,color:T.text,outline:'none',transition:'border .15s'}} onFocus={e=>e.target.style.borderColor='#7C3AED'} onBlur={e=>e.target.style.borderColor=T.border} disabled={chat.loading}/>
        <div onClick={()=>sendMsg()} style={{width:38,height:38,borderRadius:10,background:chat.loading?T.border:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',cursor:chat.loading?'default':'pointer',flexShrink:0,boxShadow:chat.loading?'none':'0 2px 8px #7C3AED30',transition:'all .15s'}} onMouseEnter={e=>{if(!chat.loading)e.currentTarget.style.transform='scale(1.08)';}} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}><I n="send" s={16} style={{color:'#fff'}}/></div>
      </div>
      </>}
    </div>;
  })()}

  {/* ══════ FLUXACTION — Mode Tinder (TOUS les contacts) ══════ */}
  {(()=>{
    // Construire la queue COMPLETE — tous les contacts actifs avec telephone
    const queue = [];
    // 1. RDV passes a qualifier (URGENT — en premier)
    rdvPassesAQualifier.forEach(c => queue.push({ct:c, type:'rdv_passe', priority:1, label:'RDV passe', color:'#F97316', icon:'clock', action:'qualifier', actionLabel:'Qualifier', suggestion:'Ce RDV est passe, qualifiez le resultat.'}));
    // 2. NRP a relancer (URGENT)
    nrpToRelance.forEach(c => queue.push({ct:c, type:'nrp', priority:2, label:'NRP', color:'#EF4444', icon:'phone-missed', action:'appeler', actionLabel:'Appeler', suggestion:'Relance prevue aujourd\'hui. Les rappels matinaux ont +40% de reponse.'}));
    // 3. RDV du jour
    todayBookings.forEach(b => {const c=(contacts||[]).find(x=>x.id===b.contactId);if(c&&!queue.some(q=>q.ct.id===c.id))queue.push({ct:c, type:'rdv_jour', priority:3, label:'RDV '+b.time, color:'#0EA5E9', icon:'calendar', action:'fiche', actionLabel:'Voir fiche', suggestion:'RDV prevu a '+b.time+'. Preparez votre approche.'});});
    // 4. Contacts chauds
    (contacts||[]).filter(c=>c.assignedTo===collab.id&&!['perdu','client_valide'].includes(c.pipeline_stage)&&c.phone).map(c=>({...c,_t:getLeadTemperature(c)})).filter(c=>(c._t.temp==='hot'||c._t.temp==='warm')&&!queue.some(q=>q.ct.id===c.id)).sort((a,b)=>b._t.conversion-a._t.conversion).forEach(c => queue.push({ct:c, type:'hot', priority:4, label:c._t.temp==='hot'?'HOT':'WARM', color:c._t.temp==='hot'?'#EF4444':'#F59E0B', icon:'flame', action:'appeler', actionLabel:'Appeler', suggestion:'Contact chaud (score '+c._t.conversion+'%). Battre le fer tant qu\'il est chaud !'}));
    // 5. Contacts inactifs (14j+)
    contactsInactifs.filter(c=>!queue.some(q=>q.ct.id===c.id)).forEach(c => { const days=Math.floor((Date.now()-new Date(c.updatedAt||c.lastVisit||c.createdAt).getTime())/86400000); queue.push({ct:c, type:'inactif', priority:5, label:'Inactif '+days+'j', color:'#F59E0B', icon:'alert-circle', action:'appeler', actionLabel:'Relancer', suggestion:'Aucune action depuis '+days+' jours. Une relance peut debloquer la situation.'}); });
    // 6. Nouveaux leads (jamais contactes)
    nouveauxLeads.filter(c=>c.phone&&!queue.some(q=>q.ct.id===c.id)).forEach(c => queue.push({ct:c, type:'nouveau', priority:6, label:'Nouveau lead', color:'#3B82F6', icon:'user-plus', action:'appeler', actionLabel:'1er contact', suggestion:'Premier contact ! Presentez-vous et qualifiez le besoin.'}));
    // 7. Tous les autres contacts actifs avec telephone (pas encore dans la queue)
    (contacts||[]).filter(c=>c.assignedTo===collab.id&&c.phone&&!['perdu','client_valide'].includes(c.pipeline_stage)&&!queue.some(q=>q.ct.id===c.id)).forEach(c => { const stg2=PIPELINE_STAGES.find(s=>s.id===c.pipeline_stage)||PIPELINE_STAGES[0]; queue.push({ct:c, type:'contact', priority:7, label:stg2.label||'Contact', color:stg2.color||T.accent, icon:'user', action:'appeler', actionLabel:'Appeler', suggestion:''}); });

    if (queue.length === 0) return null;

    if (_T.fluxIdx === undefined || _T.fluxIdx >= queue.length) _T.fluxIdx = 0;
    const idx = Math.min(_T.fluxIdx || 0, queue.length - 1);
    const card = queue[idx];
    const ct = card.ct;
    const stg = PIPELINE_STAGES.find(s=>s.id===ct.pipeline_stage) || PIPELINE_STAGES[0];

    const doAction = () => {
      if (card.action === 'qualifier') { const liveRdv2=(bookings||[]).find(b=>b.contactId===ct.id&&b.status==='confirmed'); setRdvPasseModal({contact:ct,rdvDate:liveRdv2?.date||ct.next_rdv_date,bookingId:liveRdv2?.id}); }
      else if (card.action === 'appeler') { setPortalTab('phone'); if(ct.phone) setTimeout(()=>startPhoneCall(ct.phone,ct), 300); }
      else if (card.action === 'sms') { setPipelineRightContact(ct); setPhoneRightTab('sms'); setPhoneDialNumber(ct.phone||''); setPortalTab('phone'); }
      else { setPipelineRightContact(ct); setPhoneRightTab('fiche'); setPortalTab('phone'); }
      showNotif('Action : '+ct.name, 'success');
    };
    const doSkip = () => { _T.fluxIdx = Math.min((_T.fluxIdx||0)+1, queue.length-1); setPortalTabKey(k=>k+1); };
    const doNext = () => { _T.fluxIdx = Math.min((_T.fluxIdx||0)+1, queue.length-1); setPortalTabKey(k=>k+1); };
    const doPrev = () => { _T.fluxIdx = Math.max((_T.fluxIdx||0)-1, 0); setPortalTabKey(k=>k+1); };
    const daysAgo = ct.lastVisit ? Math.floor((Date.now()-new Date(ct.lastVisit).getTime())/86400000) : null;
    const createdAgo = ct.createdAt ? Math.floor((Date.now()-new Date(ct.createdAt).getTime())/86400000) : null;

    // Swipe state (window-based, IIFE safe)
    if (!_T.fluxSwipe) _T.fluxSwipe = { startX:0, currentX:0, dragging:false, offset:0 };
    const sw = _T.fluxSwipe;
    const SWIPE_THRESHOLD = 80;

    const onPointerDown = (e) => { sw.startX = e.clientX || e.touches?.[0]?.clientX || 0; sw.dragging = true; sw.offset = 0; };
    const onPointerMove = (e) => {
      if (!sw.dragging) return;
      const x = e.clientX || e.touches?.[0]?.clientX || 0;
      sw.offset = x - sw.startX;
      const el = document.getElementById('flux-card-center');
      if (el) {
        const clamped = Math.max(-120, Math.min(120, sw.offset * 0.5));
        el.style.transition = 'none';
        el.style.transform = `translateX(${clamped}px) rotate(${clamped*0.015}deg)`;
        el.style.opacity = String(1 - Math.abs(clamped)/500);
      }
    };
    const onPointerUp = () => {
      if (!sw.dragging) return;
      sw.dragging = false;
      const el = document.getElementById('flux-card-center');
      if (el) { el.style.transition = 'transform .4s ease, opacity .4s ease'; el.style.transform = 'translateX(0) rotate(0deg)'; el.style.opacity = '1'; }
      if (sw.offset < -SWIPE_THRESHOLD && idx < queue.length-1) { doNext(); }
      else if (sw.offset > SWIPE_THRESHOLD && idx > 0) { doPrev(); }
      sw.offset = 0;
    };

    // Cards voisines
    const prevCard = idx > 0 ? queue[idx-1] : null;
    const nextCard = idx < queue.length-1 ? queue[idx+1] : null;

    // Couleur métier par type de lead
    const heatColor = card.priority<=2?'#EF4444':card.priority<=4?'#F97316':card.priority<=5?'#F59E0B':card.priority<=6?'#3B82F6':'#94A3B8';
    const heatLabel = card.priority<=2?'Prioritaire':card.priority<=4?'A traiter':card.priority<=5?'A relancer':card.priority<=6?'Nouveau':'Standard';
    const heatEmoji = card.priority<=2?'🔥':card.priority<=4?'⚡':card.priority<=5?'⏰':card.priority<=6?'✨':'';
    const heatGlow = card.priority<=2?'0 0 20px #EF444425':card.priority<=4?'0 0 16px #F9731620':'none';

    // Score contact
    const ctScore = ct._t?.conversion || ct._score || 0;
    const scoreColor = ctScore>=60?'#22C55E':ctScore>=30?'#F59E0B':'#94A3B8';

    // Contexte rapide enrichi
    const contextMsg = card.suggestion || (ct.notes ? ct.notes.substring(0,80) : ct.company ? 'Entreprise : '+ct.company : '');

    // Ghost card renderer
    const ghostCard = (c, side) => c ? (
      <div onClick={side==='left'?doPrev:doNext} style={{flex:'0 0 11%',minWidth:55,maxWidth:85,cursor:'pointer',transition:'all .3s',opacity:0.35,filter:'blur(1.5px)',transform:side==='left'?'scale(0.82) translateX(10px)':'scale(0.82) translateX(-10px)'}}>
        <div style={{borderRadius:18,background:T.card,border:'1px solid '+c.color+'12',padding:'18px 6px',textAlign:'center',boxShadow:'0 4px 12px rgba(0,0,0,0.03)'}}>
          <Avatar name={c.ct.name} color={c.color} size={36}/>
          <div style={{fontSize:9,fontWeight:700,color:T.text,marginTop:6,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.ct.name.split(' ')[0]}</div>
          <div style={{fontSize:7,color:c.color,fontWeight:700,marginTop:2}}>{c.label}</div>
        </div>
      </div>
    ) : <div style={{flex:'0 0 11%',minWidth:55}}/>;

    return <div style={{marginBottom:28}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:34,height:34,borderRadius:10,background:'linear-gradient(135deg,#7C3AED,#3B82F6)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px #7C3AED30'}}><I n="layers" s={17} style={{color:'#fff'}}/></div>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:T.text}}>FluxAction</div>
            <div style={{fontSize:9,color:T.text3}}>Session en cours — swipez et agissez</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{padding:'4px 14px',borderRadius:12,background:T.card,border:'1px solid '+T.border,display:'flex',alignItems:'center',gap:4}}>
            <span style={{fontSize:15,fontWeight:800,color:card.color}}>{idx+1}</span>
            <span style={{fontSize:10,color:T.text3}}>/ {queue.length}</span>
          </div>
        </div>
      </div>

      {/* ══ CAROUSEL 3 CARTES ══ */}
      <div style={{display:'flex',alignItems:'center',gap:0,position:'relative'}}>

        {ghostCard(prevCard, 'left')}

        {/* ══ CARTE CENTRALE (swipeable) ══ */}
        <div style={{flex:'1 1 78%',position:'relative',zIndex:2}}>
          <div id="flux-card-center"
            onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
            onTouchStart={e=>onPointerDown(e.touches[0])} onTouchMove={e=>onPointerMove(e.touches[0])} onTouchEnd={onPointerUp}
            style={{borderRadius:24,background:`linear-gradient(160deg,${T.card},${heatColor}04)`,border:'1.5px solid '+heatColor+'25',overflow:'hidden',boxShadow:'0 12px 40px rgba(0,0,0,0.1), '+heatGlow,transition:'transform .3s, opacity .3s',cursor:'grab',userSelect:'none'}}>
            {/* Glow décoratif */}
            <div style={{position:'absolute',top:-60,right:-60,width:180,height:180,borderRadius:90,background:heatColor,opacity:0.04}}/>

            {/* ── TOP BAR : Priorité + Score + Urgence ── */}
            <div style={{padding:'12px 18px 0',display:'flex',justifyContent:'space-between',alignItems:'center',position:'relative',zIndex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                {/* Badge priorité */}
                <div style={{padding:'4px 10px',borderRadius:10,background:heatColor+'15',border:'1px solid '+heatColor+'25',display:'flex',alignItems:'center',gap:4}}>
                  <span style={{fontSize:11}}>{heatEmoji}</span>
                  <span style={{fontSize:9,fontWeight:800,color:heatColor,textTransform:'uppercase',letterSpacing:0.5}}>{heatLabel}</span>
                </div>
                {/* Badge type */}
                <div style={{padding:'4px 10px',borderRadius:10,background:`linear-gradient(135deg,${card.color},${card.color}CC)`,color:'#fff',fontSize:8,fontWeight:800,display:'flex',alignItems:'center',gap:3,boxShadow:'0 1px 4px '+card.color+'30',letterSpacing:0.3,textTransform:'uppercase'}}>
                  <I n={card.icon} s={9}/> {card.label}
                </div>
              </div>
              {/* Score + Urgence */}
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                {ctScore>0 && <div style={{display:'flex',alignItems:'center',gap:3,padding:'3px 8px',borderRadius:8,background:scoreColor+'10',border:'1px solid '+scoreColor+'20'}}>
                  <span style={{fontSize:10,fontWeight:800,color:scoreColor}}>{ctScore}</span>
                  <span style={{fontSize:7,color:scoreColor,fontWeight:600}}>/100</span>
                </div>}
                <div style={{padding:'3px 8px',borderRadius:8,background:T.bg,border:'1px solid '+T.border,display:'flex',alignItems:'center',gap:3}}>
                  <I n="clock" s={9} style={{color:T.text3}}/>
                  <span style={{fontSize:8,fontWeight:600,color:daysAgo!==null&&daysAgo>7?'#EF4444':daysAgo!==null&&daysAgo>3?'#F59E0B':T.text3}}>{daysAgo!==null?(daysAgo===0?'Aujourd\'hui':daysAgo+'j'):createdAgo!==null?'Cree '+createdAgo+'j':'—'}</span>
                </div>
              </div>
            </div>

            {/* ── CONTACT PRINCIPAL — centré ── */}
            <div style={{padding:'14px 20px 8px',textAlign:'center',position:'relative',zIndex:1}}>
              <div style={{display:'inline-block',position:'relative'}}>
                {/* Ring de couleur autour de l'avatar */}
                <div style={{width:82,height:82,borderRadius:41,background:`linear-gradient(135deg,${heatColor},${card.color})`,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 16px '+heatColor+'25'}}>
                  <div style={{width:76,height:76,borderRadius:38,background:T.card,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <Avatar name={ct.name} color={card.color} size={68}/>
                  </div>
                </div>
                <div style={{position:'absolute',bottom:2,right:2,width:22,height:22,borderRadius:11,background:card.color,display:'flex',alignItems:'center',justifyContent:'center',border:'3px solid '+T.card,boxShadow:'0 2px 4px '+card.color+'40'}}><I n={card.icon} s={10} style={{color:'#fff'}}/></div>
              </div>
              <div style={{fontSize:21,fontWeight:800,color:T.text,marginTop:10,letterSpacing:-0.3}}>{ct.name}</div>
              {ct.phone && <div style={{fontSize:13,color:T.text3,marginTop:3,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}><I n="phone" s={12}/> {fmtPhone(ct.phone)}</div>}
              {ct.email && <div style={{fontSize:11,color:T.text3,marginTop:1,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}><I n="mail" s={10}/> {ct.email}</div>}
            </div>

            {/* ── TAGS : Stage + Température + Entreprise ── */}
            <div style={{padding:'0 18px 6px',display:'flex',justifyContent:'center',gap:5,flexWrap:'wrap'}}>
              <span style={{padding:'3px 10px',borderRadius:10,fontSize:9,fontWeight:700,background:stg.color+'10',color:stg.color,border:'1px solid '+stg.color+'12'}}>{stg.label}</span>
              {ct._t?.temp && <span style={{padding:'3px 10px',borderRadius:10,fontSize:9,fontWeight:700,background:_tempColor(ct._t.temp)+'10',color:_tempColor(ct._t.temp)}}>{_tempEmoji(ct._t.temp)} {_tempLabel(ct._t.temp)}</span>}
              {ct.company && <span style={{padding:'3px 10px',borderRadius:10,fontSize:9,fontWeight:600,background:T.bg,color:T.text3,border:'1px solid '+T.border}}>{ct.company}</span>}
            </div>

            {/* ── CONTEXTE RAPIDE (suggestion IA ou notes) ── */}
            {contextMsg && <div style={{margin:'4px 16px 8px',padding:'8px 12px',borderRadius:12,background:'linear-gradient(135deg,#7C3AED06,#3B82F604)',border:'1px solid #7C3AED10',display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:20,height:20,borderRadius:6,background:'linear-gradient(135deg,#7C3AED,#3B82F6)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><I n="cpu" s={9} style={{color:'#fff'}}/></div>
              <div style={{fontSize:10,color:T.text2,lineHeight:1.4,flex:1}}>{contextMsg}</div>
            </div>}

            {/* ── PROBABILITÉ RDV (si score dispo) ── */}
            {ctScore > 0 && <div style={{margin:'0 16px 10px',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
              <span style={{fontSize:9,color:T.text3}}>Probabilite RDV :</span>
              <div style={{width:80,height:5,borderRadius:3,background:T.border,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:3,background:`linear-gradient(90deg,${scoreColor},${scoreColor}AA)`,width:ctScore+'%',transition:'width .5s'}}/>
              </div>
              <span style={{fontSize:10,fontWeight:800,color:scoreColor}}>{ctScore}%</span>
            </div>}

            {/* ══ BOUTONS RONDS (style Tinder) ══ */}
            <div style={{padding:'10px 20px 8px',display:'flex',justifyContent:'center',gap:12,alignItems:'flex-end'}}>
              <div style={{textAlign:'center'}}>
                <div onClick={doSkip} style={{width:46,height:46,borderRadius:23,background:T.card,border:'2px solid '+T.border,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .2s',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}} onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.15)';e.currentTarget.style.borderColor='#EF4444';e.currentTarget.style.boxShadow='0 4px 16px #EF444420';}} onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)';}} title="Passer"><I n="x" s={19} style={{color:T.text3}}/></div>
                <div style={{fontSize:7,fontWeight:600,color:T.text3,marginTop:4}}>Passer</div>
              </div>
              {ct.phone && <div style={{textAlign:'center'}}>
                <div onClick={()=>{setSelectedCrmContact(ct);setCollabFicheTab('client_msg');setPortalTab('crm');}} style={{width:46,height:46,borderRadius:23,background:T.card,border:'2px solid #3B82F625',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .2s',boxShadow:'0 2px 8px #3B82F608'}} onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.15)';e.currentTarget.style.boxShadow='0 4px 16px #3B82F625';}} onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='0 2px 8px #3B82F608';}} title="SMS"><I n="message-circle" s={19} style={{color:'#3B82F6'}}/></div>
                <div style={{fontSize:7,fontWeight:600,color:'#3B82F6',marginTop:4}}>SMS</div>
              </div>}
              {/* GROS BOUTON ACTION */}
              <div style={{textAlign:'center'}}>
                <div onClick={doAction} style={{width:64,height:64,borderRadius:32,background:`linear-gradient(135deg,${card.color},${card.color}CC)`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .2s',boxShadow:'0 6px 24px '+card.color+'40'}} onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.18)';e.currentTarget.style.boxShadow='0 8px 32px '+card.color+'55';}} onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='0 6px 24px '+card.color+'40';}} title={card.actionLabel}><I n={card.action==='appeler'?'phone':card.action==='qualifier'?'check-circle':'user'} s={26} style={{color:'#fff'}}/></div>
                <div style={{fontSize:8,fontWeight:700,color:card.color,marginTop:4}}>{card.actionLabel}</div>
              </div>
              {ct.email && <div style={{textAlign:'center'}}>
                <div onClick={()=>window.open('mailto:'+ct.email)} style={{width:46,height:46,borderRadius:23,background:T.card,border:'2px solid '+T.border,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .2s',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}} onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.15)';e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.1)';}} onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)';}} title="Email"><I n="mail" s={19} style={{color:T.text3}}/></div>
                <div style={{fontSize:7,fontWeight:600,color:T.text3,marginTop:4}}>Email</div>
              </div>}
              <div style={{textAlign:'center'}}>
                <div onClick={()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{width:46,height:46,borderRadius:23,background:T.card,border:'2px solid #7C3AED25',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .2s',boxShadow:'0 2px 8px #7C3AED08'}} onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.15)';e.currentTarget.style.boxShadow='0 4px 16px #7C3AED25';}} onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='0 2px 8px #7C3AED08';}} title="RDV"><I n="calendar" s={19} style={{color:'#7C3AED'}}/></div>
                <div style={{fontSize:7,fontWeight:600,color:'#7C3AED',marginTop:4}}>RDV</div>
              </div>
            </div>

            {/* Padding bottom */}
            <div style={{height:6}}/>
          </div>
        </div>

        {ghostCard(nextCard, 'right')}
      </div>

      {/* Progress bar */}
      <div style={{marginTop:10,height:4,borderRadius:2,background:T.border,overflow:'hidden'}}>
        <div style={{height:'100%',borderRadius:2,background:`linear-gradient(90deg,${heatColor},#7C3AED)`,width:Math.round(((idx+1)/queue.length)*100)+'%',transition:'width .4s'}}/>
      </div>
    </div>;
  })()}

  {/* ── Actions prioritaires (redesign pro) ── */}
  <div style={{marginBottom:24}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <div style={{width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,#F59E0B,#F97316)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px #F59E0B30'}}><I n="zap" s={16} style={{color:'#fff'}}/></div>
      <span style={{fontSize:16,fontWeight:800,color:T.text}}>Actions prioritaires</span>
      {totalActions>0 && <span style={{fontSize:10,fontWeight:700,padding:'3px 10px',borderRadius:10,background:'linear-gradient(135deg,#F59E0B15,#F9731610)',color:'#F59E0B',border:'1px solid #F59E0B20'}}>{totalActions}</span>}
    </div>
    {totalActions===0 ? (
      <div style={{padding:'16px 18px',borderRadius:16,background:'linear-gradient(135deg,#22C55E08,#22C55E04)',border:'1px solid #22C55E20',display:'flex',alignItems:'center',gap:12,boxShadow:'0 4px 12px #22C55E08'}}>
        <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#22C55E,#10B981)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="check-circle" s={20} style={{color:'#fff'}}/></div>
        <div><div style={{fontSize:13,fontWeight:700,color:'#22C55E'}}>Aucune action urgente</div><div style={{fontSize:11,color:T.text3}}>RDV qualifies, NRP a jour, pas de contact inactif.</div></div>
      </div>
    ) : (
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {/* RDV passés */}
        {rdvPassesAQualifier.map(ct=>(
          <div key={ct.id} style={{padding:'12px 16px',borderRadius:14,border:'1px solid #F9731618',background:'linear-gradient(135deg,#F9731606,transparent)',display:'flex',alignItems:'center',gap:12,boxShadow:'0 2px 8px #F9731608',transition:'all .2s',cursor:'pointer'}} onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px #F9731615';e.currentTarget.style.transform='translateY(-1px)';}} onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 2px 8px #F9731608';e.currentTarget.style.transform='none';}}>
            <div style={{position:'relative'}}>
              <Avatar name={ct.name} color="#F97316" size={36}/>
              <div style={{position:'absolute',bottom:-2,right:-2,width:16,height:16,borderRadius:8,background:'#F97316',display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid '+T.card}}><I n="clock" s={8} style={{color:'#fff'}}/></div>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>{ct.name}</div>
              <div style={{fontSize:11,color:'#F97316',fontWeight:600,display:'flex',alignItems:'center',gap:4}}><I n="alert-circle" s={11}/> RDV passe — A qualifier</div>
            </div>
            <div onClick={e=>{e.stopPropagation();const liveRdv2=(bookings||[]).find(b=>b.contactId===ct.id&&b.status==='confirmed');setRdvPasseModal({contact:ct,rdvDate:liveRdv2?.date||ct.next_rdv_date,bookingId:liveRdv2?.id});}} style={{padding:'7px 16px',borderRadius:10,background:'linear-gradient(135deg,#F97316,#EA580C)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',boxShadow:'0 2px 6px #F9731630',transition:'transform .15s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.05)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>Qualifier</div>
          </div>
        ))}
        {/* NRP à relancer */}
        {nrpToRelance.map(ct=>(
          <div key={ct.id} style={{padding:'12px 16px',borderRadius:14,border:'1px solid #EF444418',background:'linear-gradient(135deg,#EF444406,transparent)',display:'flex',alignItems:'center',gap:12,boxShadow:'0 2px 8px #EF444408',transition:'all .2s',cursor:'pointer'}} onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px #EF444415';e.currentTarget.style.transform='translateY(-1px)';}} onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 2px 8px #EF444408';e.currentTarget.style.transform='none';}}>
            <div style={{position:'relative'}}>
              <Avatar name={ct.name} color="#EF4444" size={36}/>
              <div style={{position:'absolute',bottom:-2,right:-2,width:16,height:16,borderRadius:8,background:'#EF4444',display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid '+T.card}}><I n="phone-missed" s={8} style={{color:'#fff'}}/></div>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>{ct.name}</div>
              <div style={{fontSize:11,color:'#EF4444',fontWeight:600,display:'flex',alignItems:'center',gap:4}}><I n="phone-missed" s={11}/> NRP — Relance prevue aujourd'hui</div>
            </div>
            <div onClick={e=>{e.stopPropagation();if(ct.phone&&typeof startVoipCall==='function')startVoipCall(ct.phone,ct);else if(ct.phone)window.open('tel:'+ct.phone);}} style={{padding:'7px 16px',borderRadius:10,background:'linear-gradient(135deg,#EF4444,#DC2626)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',boxShadow:'0 2px 6px #EF444430',transition:'transform .15s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.05)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>Appeler</div>
          </div>
        ))}
        {/* Contacts inactifs */}
        {contactsInactifs.slice(0,5).map(ct=>(
          <div key={ct.id} style={{padding:'12px 16px',borderRadius:14,border:'1px solid #F59E0B18',background:'linear-gradient(135deg,#F59E0B06,transparent)',display:'flex',alignItems:'center',gap:12,boxShadow:'0 2px 8px #F59E0B08',transition:'all .2s',cursor:'pointer'}} onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px #F59E0B15';e.currentTarget.style.transform='translateY(-1px)';}} onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 2px 8px #F59E0B08';e.currentTarget.style.transform='none';}}>
            <div style={{position:'relative'}}>
              <Avatar name={ct.name} color="#F59E0B" size={36}/>
              <div style={{position:'absolute',bottom:-2,right:-2,width:16,height:16,borderRadius:8,background:'#F59E0B',display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid '+T.card}}><I n="alert-circle" s={8} style={{color:'#fff'}}/></div>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>{ct.name}</div>
              <div style={{fontSize:11,color:'#F59E0B',fontWeight:600,display:'flex',alignItems:'center',gap:4}}><I n="clock" s={11}/> Inactif depuis {Math.floor((Date.now()-new Date(ct.lastVisit||ct.createdAt).getTime())/86400000)}j</div>
            </div>
            <div onClick={e=>{e.stopPropagation();if(ct.phone&&typeof startVoipCall==='function')startVoipCall(ct.phone,ct);else if(ct.phone)window.open('tel:'+ct.phone);}} style={{padding:'7px 16px',borderRadius:10,background:'linear-gradient(135deg,#F59E0B,#D97706)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',boxShadow:'0 2px 6px #F59E0B30',transition:'transform .15s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.05)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>Relancer</div>
          </div>
        ))}
        {/* Nouveaux leads */}
        {nouveauxLeads.slice(0,5).map(ct=>(
          <div key={ct.id} style={{padding:'12px 16px',borderRadius:14,border:'1px solid #3B82F618',background:'linear-gradient(135deg,#3B82F606,transparent)',display:'flex',alignItems:'center',gap:12,boxShadow:'0 2px 8px #3B82F608',transition:'all .2s',cursor:'pointer'}} onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px #3B82F615';e.currentTarget.style.transform='translateY(-1px)';}} onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 2px 8px #3B82F608';e.currentTarget.style.transform='none';}}>
            <div style={{position:'relative'}}>
              <Avatar name={ct.name} color="#3B82F6" size={36}/>
              <div style={{position:'absolute',bottom:-2,right:-2,width:16,height:16,borderRadius:8,background:'#3B82F6',display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid '+T.card}}><I n="user-plus" s={8} style={{color:'#fff'}}/></div>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>{ct.name}</div>
              <div style={{fontSize:11,color:'#3B82F6',fontWeight:600,display:'flex',alignItems:'center',gap:4}}><I n="user-plus" s={11}/> Nouveau lead — Premier contact</div>
            </div>
            <div onClick={e=>{e.stopPropagation();if(ct.phone&&typeof startVoipCall==='function')startVoipCall(ct.phone,ct);else if(ct.phone)window.open('tel:'+ct.phone);}} style={{padding:'7px 16px',borderRadius:10,background:'linear-gradient(135deg,#3B82F6,#2563EB)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',boxShadow:'0 2px 6px #3B82F630',transition:'transform .15s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.05)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>Appeler</div>
          </div>
        ))}
      </div>
    )}
  </div>

  {/* ── V5: MES ACTIONS DU JOUR (Next Best Action) ── */}
  <HookIsolator>{()=>{
    const [nbaActions, setNbaActions] = useState(null);
    const [nbaLoading, setNbaLoading] = useState(false);
    useEffect(()=>{
      if(!company?.id || !collab?.id) return;
      setNbaLoading(true);
      api(`/api/data/next-actions?collaboratorId=${collab.id}&companyId=${company.id}`)
        .then(r=>{ if(r?.actions) setNbaActions(r.actions); })
        .catch(()=>{})
        .finally(()=>setNbaLoading(false));
    },[company?.id, collab?.id]);
    if(!nbaActions || nbaActions.length===0) return null;
    const typeIcons = { NOUVEAU_LEAD:'user-plus', RELANCER_NRP:'phone-missed', QUALIFIER_POST_RDV:'clipboard-check', FOLLOWUP_IA:'cpu', CLOSER_QUALIFIE:'trending-up', RELANCER_DEVIS:'file-text', RAPPELER_INACTIF:'clock' };
    const typeColors = { NOUVEAU_LEAD:'#3B82F6', RELANCER_NRP:'#EF4444', QUALIFIER_POST_RDV:'#F59E0B', FOLLOWUP_IA:'#7C3AED', CLOSER_QUALIFIE:'#0EA5E9', RELANCER_DEVIS:'#059669', RAPPELER_INACTIF:'#6B7280' };
    const prioLabels = { 1:'Critique', 2:'Urgent', 3:'Important', 4:'Normal', 5:'Faible' };
    const prioColors = { 1:'#EF4444', 2:'#F59E0B', 3:'#3B82F6', 4:'#059669', 5:'#6B7280' };
    const urgentCount = nbaActions.filter(a=>a.priority<=2).length;
    return <div style={{marginBottom:24}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <div style={{width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,#EF4444,#F59E0B)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px #EF444430'}}><I n="zap" s={16} style={{color:'#fff'}}/></div>
        <div>
          <span style={{fontSize:15,fontWeight:800,color:T.text}}>Mes actions du jour</span>
          <span style={{fontSize:11,color:T.text3,marginLeft:8}}>{nbaActions.length} action{nbaActions.length>1?'s':''}{urgentCount>0?` • ${urgentCount} urgente${urgentCount>1?'s':''}`:''}</span>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {nbaActions.map((a,i)=>{
          const color = typeColors[a.type]||'#6B7280';
          return <div key={i} style={{padding:'12px 16px',borderRadius:14,border:`1px solid ${color}18`,background:`linear-gradient(135deg,${color}06,transparent)`,display:'flex',alignItems:'center',gap:12,transition:'all .2s',cursor:'pointer'}} onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 4px 16px ${color}15`;e.currentTarget.style.transform='translateY(-1px)';}} onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.transform='none';}}>
            <div style={{width:36,height:36,borderRadius:10,background:color+'15',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <I n={typeIcons[a.type]||'zap'} s={16} style={{color}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:13,fontWeight:700,color:T.text}}>{a.contactName}</span>
                <span style={{fontSize:9,padding:'1px 6px',borderRadius:4,background:prioColors[a.priority]+'15',color:prioColors[a.priority],fontWeight:700}}>{prioLabels[a.priority]}</span>
                {a.leadScore>0 && <span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:a.leadScore>60?'#22C55E15':a.leadScore>30?'#F59E0B15':'#EF444415',color:a.leadScore>60?'#22C55E':a.leadScore>30?'#F59E0B':'#EF4444',fontWeight:700}}>{a.leadScore}</span>}
              </div>
              <div style={{fontSize:11,color:T.text2,marginTop:2}}>{a.reason}</div>
            </div>
            {a.phone && <div onClick={e=>{e.stopPropagation();if(typeof startVoipCall==='function')startVoipCall(a.phone,{name:a.contactName,id:a.contactId});}} style={{padding:'7px 14px',borderRadius:10,background:'linear-gradient(135deg,'+color+','+color+'DD)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',boxShadow:'0 2px 6px '+color+'30',whiteSpace:'nowrap'}}>
              <I n="phone" s={11}/> Appeler
            </div>}
          </div>;
        })}
      </div>
    </div>;
  }}</HookIsolator>

  {/* ── RDV du jour (redesign) ── */}
  {todayBookings.length>0 && (
    <div style={{marginBottom:24}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <div style={{width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,#0EA5E9,#3B82F6)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px #0EA5E930'}}><I n="calendar" s={16} style={{color:'#fff'}}/></div>
        <span style={{fontSize:16,fontWeight:800,color:T.text}}>RDV du jour</span>
        <span style={{fontSize:10,fontWeight:700,padding:'3px 10px',borderRadius:10,background:'#0EA5E910',color:'#0EA5E9',border:'1px solid #0EA5E920'}}>{todayBookings.length}</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {todayBookings.map(b=>{
          const diff=Math.round((new Date(b.date+'T'+(b.time||'00:00')).getTime()-Date.now())/60000);
          const isPast=diff<0;
          const isNow=diff>=0&&diff<=30;
          const tColor=isPast?'#EF4444':isNow?'#F59E0B':'#0EA5E9';
          return <div key={b.id} style={{padding:'12px 16px',borderRadius:14,border:'1px solid '+tColor+'18',background:`linear-gradient(135deg,${tColor}06,transparent)`,display:'flex',alignItems:'center',gap:12,boxShadow:'0 2px 8px '+tColor+'08',transition:'all .2s'}} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px '+tColor+'15'} onMouseLeave={e=>e.currentTarget.style.boxShadow='0 2px 8px '+tColor+'08'}>
            <div style={{padding:'5px 10px',borderRadius:10,background:tColor+'12',color:tColor,fontSize:14,fontWeight:800,fontFamily:'monospace',minWidth:54,textAlign:'center',border:'1px solid '+tColor+'15'}}>{b.time||'—'}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>{b.visitorName||'RDV'}</div>
              <div style={{fontSize:11,color:T.text3}}>{b.duration}min · {(calendars||[]).find(c=>c.id===b.calendarId)?.name||''}</div>
            </div>
            <span style={{fontSize:11,fontWeight:700,color:tColor,padding:'3px 10px',borderRadius:8,background:tColor+'10'}}>{isPast?'Passe':isNow?'Maintenant':diff<60?diff+'min':Math.floor(diff/60)+'h'}</span>
          </div>;
        })}
      </div>
    </div>
  )}

  {/* ══════ STATISTIQUES DE [NOM] — Accordéon ══════ */}
  {(()=>{
    // Période active (persist dans window pour éviter hooks dans IIFE)
    const period = _T.homeStatsPeriod || 'jour';
    const setPeriod = (p) => { _T.homeStatsPeriod = p; setPortalTabKey(k=>k+1); };

    // Dates
    const now = new Date();
    const todayS = todayISO;
    const weekS = weekISO;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const startDate = period === 'jour' ? todayS : period === 'semaine' ? weekS : period === 'mois' ? monthStart : '2020-01-01';

    // Filtres par période
    const myContacts = (contacts||[]).filter(c=>c.assignedTo===collab.id);
    const periodCalls = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(c=>c.createdAt&&c.createdAt>=startDate);
    const periodCallsOut = periodCalls.filter(c=>c.direction==='outbound');
    const periodCallsIn = periodCalls.filter(c=>c.direction==='inbound');
    const periodDuration = periodCalls.reduce((s,c)=>s+(c.duration||0),0);
    const periodAvgDur = periodCalls.length>0?Math.round(periodDuration/periodCalls.length):0;
    const periodBookings = (bookings||[]).filter(b=>b.date>=startDate&&b.collaboratorId===collab.id);
    const periodBookingsOk = periodBookings.filter(b=>b.status==='confirmed');
    const periodBookingsCancel = periodBookings.filter(b=>b.status==='cancelled');
    const periodNewContacts = myContacts.filter(c=>c.createdAt&&c.createdAt>=startDate);
    const periodQualifies = myContacts.filter(c=>c.pipeline_stage==='qualifie');
    const periodClients = myContacts.filter(c=>c.pipeline_stage==='client_valide');
    const periodPerdus = myContacts.filter(c=>c.pipeline_stage==='perdu');
    const periodConversion = myContacts.length>0?Math.round(periodClients.length/myContacts.length*100):0;
    const periodNRP = myContacts.filter(c=>c.pipeline_stage==='nrp');

    // Pipeline breakdown
    const stageBreakdown = PIPELINE_STAGES.map(s=>({...s,count:myContacts.filter(c=>(c.pipeline_stage||'nouveau')===s.id).length})).filter(s=>s.count>0);
    const maxSB = Math.max(...stageBreakdown.map(s=>s.count),1);

    const fmtDur = (s) => { if(!s) return '0s'; const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); const sec=s%60; if(h>0) return h+'h'+String(m).padStart(2,'0')+'m'; if(m>0) return m+'m'+String(sec).padStart(2,'0')+'s'; return sec+'s'; };
    const periodLabel = period==='jour'?'aujourd\'hui':period==='semaine'?'cette semaine':period==='mois'?'ce mois':'depuis le début';
    const isOpen = _T.homeStatsOpen !== false; // ouvert par défaut
    const toggleOpen = () => { _T.homeStatsOpen = !isOpen; setPortalTabKey(k=>k+1); };

    return <div style={{marginBottom:20,borderRadius:16,border:'1.5px solid '+T.border,background:T.card,overflow:'hidden'}}>
      {/* Accordion header */}
      <div onClick={toggleOpen} style={{padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',background:'linear-gradient(135deg,#7C3AED06,#3B82F604)',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='linear-gradient(135deg,#7C3AED10,#3B82F608)'} onMouseLeave={e=>e.currentTarget.style.background='linear-gradient(135deg,#7C3AED06,#3B82F604)'}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#7C3AED,#3B82F6)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px #7C3AED30'}}><I n="bar-chart-2" s={18} style={{color:'#fff'}}/></div>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:T.text}}>Statistiques de {firstname}</div>
            <div style={{fontSize:10,color:T.text3}}>Performance {periodLabel} · {totalContacts} contacts</div>
          </div>
        </div>
        <I n={isOpen?'chevron-up':'chevron-down'} s={18} style={{color:T.text3,transition:'transform .2s'}}/>
      </div>

      {isOpen && <div style={{padding:'0 18px 18px'}}>
        {/* Period tabs */}
        <div style={{display:'flex',gap:4,margin:'14px 0',padding:3,background:T.bg,borderRadius:10,border:'1px solid '+T.border,width:'fit-content'}}>
          {[{id:'jour',label:'Jour',icon:'sun'},{id:'semaine',label:'Semaine',icon:'calendar'},{id:'mois',label:'Mois',icon:'calendar-range'},{id:'tout',label:'Tout',icon:'infinity'}].map(p=>(
            <div key={p.id} onClick={()=>setPeriod(p.id)} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:period===p.id?700:500,background:period===p.id?T.card:'transparent',color:period===p.id?'#7C3AED':T.text3,boxShadow:period===p.id?'0 1px 4px rgba(0,0,0,0.06)':'none',transition:'all .15s'}}><I n={p.icon} s={13}/>{p.label}</div>
          ))}
        </div>

        {/* Stats grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
          {[
            {label:'Appels émis',value:periodCallsOut.length,icon:'phone-outgoing',color:'#3B82F6'},
            {label:'Appels reçus',value:periodCallsIn.length,icon:'phone-incoming',color:'#0EA5E9'},
            {label:'Durée totale',value:fmtDur(periodDuration),icon:'clock',color:'#7C3AED'},
            {label:'Durée moyenne',value:fmtDur(periodAvgDur),icon:'timer',color:'#6366F1'},
            {label:'Nouveaux contacts',value:periodNewContacts.length,icon:'user-plus',color:'#3B82F6'},
            {label:'RDV pris',value:periodBookingsOk.length,icon:'calendar-check',color:'#22C55E'},
            {label:'RDV annulés',value:periodBookingsCancel.length,icon:'calendar-x',color:'#EF4444'},
            {label:'Taux conversion',value:periodConversion+'%',icon:'trending-up',color:periodConversion>20?'#22C55E':periodConversion>10?'#F59E0B':'#EF4444'},
          ].map((s,i)=>(
            <div key={i} style={{padding:'12px',borderRadius:12,background:s.color+'06',border:'1px solid '+s.color+'12'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                <I n={s.icon} s={14} style={{color:s.color}}/>
                <span style={{fontSize:9,fontWeight:600,color:T.text3}}>{s.label}</span>
              </div>
              <div style={{fontSize:22,fontWeight:900,color:s.color}}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Pipeline breakdown */}
        <div style={{padding:'14px',borderRadius:12,background:T.bg,border:'1px solid '+T.border}}>
          <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:10,display:'flex',alignItems:'center',gap:6}}><I n="layers" s={14} style={{color:'#7C3AED'}}/> Répartition Pipeline</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {stageBreakdown.map(s=>{
              const pct = totalContacts>0?Math.round(s.count/totalContacts*100):0;
              const barW = Math.min(90, Math.round(s.count/maxSB*90));
              return <div key={s.id} style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:8,height:8,borderRadius:4,background:s.color,flexShrink:0}}/>
                <span style={{fontSize:11,fontWeight:600,color:T.text,minWidth:110}}>{s.label}</span>
                <div style={{flex:1,height:8,borderRadius:4,background:T.border,overflow:'hidden'}}>
                  <div style={{height:'100%',borderRadius:4,background:`linear-gradient(90deg,${s.color},${s.color}AA)`,width:barW+'%',transition:'width .5s'}}/>
                </div>
                <span style={{fontSize:10,fontWeight:600,color:T.text3,minWidth:32,textAlign:'right'}}>{pct}%</span>
                <span style={{fontSize:12,fontWeight:800,color:s.color,minWidth:28,textAlign:'right'}}>{s.count}</span>
              </div>;
            })}
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:12,padding:'10px 0 0',borderTop:'1px solid '+T.border}}>
            <div style={{display:'flex',gap:16}}>
              <div><div style={{fontSize:9,color:T.text3,fontWeight:600}}>Total contacts</div><div style={{fontSize:18,fontWeight:900,color:T.text}}>{totalContacts}</div></div>
              <div><div style={{fontSize:9,color:T.text3,fontWeight:600}}>Clients validés</div><div style={{fontSize:18,fontWeight:900,color:'#22C55E'}}>{clientsValides}</div></div>
              <div><div style={{fontSize:9,color:T.text3,fontWeight:600}}>Perdus</div><div style={{fontSize:18,fontWeight:900,color:'#EF4444'}}>{periodPerdus.length}</div></div>
              <div><div style={{fontSize:9,color:T.text3,fontWeight:600}}>NRP actifs</div><div style={{fontSize:18,fontWeight:900,color:'#F59E0B'}}>{periodNRP.length}</div></div>
            </div>
            <div onClick={()=>setPortalTab('phone')} style={{fontSize:11,fontWeight:600,color:T.accent,cursor:'pointer',display:'flex',alignItems:'center',gap:4,alignSelf:'flex-end'}}>Voir Pipeline Live <I n="arrow-right" s={12}/></div>
          </div>
        </div>
      </div>}
    </div>;
  })()}

</div>;};

export default HomeTab;
