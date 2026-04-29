// Phase 14b — extracted Phone/Pipeline Live tab from CollabPortal.jsx (was lines 3826-12462).
// THE MASTODON: ~8637 lines covering VoIP + dialer + conversations + history + AI copilot live.
//
// TODO Phase future : sub-découper en phone/PhoneToolbar.jsx + phone/Dialer.jsx + phone/PipelineKanban.jsx
//   + phone/CallHistory.jsx + phone/Conversations.jsx + phone/CallDetail.jsx + phone/AiCopilotPanel.jsx

import React, { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Avatar, Badge, Modal, Input, ValidatedInput, Stars, Spinner, Stat, EmptyState, HelpTip, HookIsolator, ErrorBoundary } from "../../../shared/ui";
import { displayPhone, formatPhoneFR, normalizePhoneNumber, phoneMatchKey, matchContactByPhone } from "../../../shared/utils/phone";
import { isValidEmail, isValidPhone } from "../../../shared/utils/validators";
import { fmtDate, DAYS_FR, DAYS_SHORT, MONTHS_FR, getDow, formatDateTime, formatDate } from "../../../shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES, PIPELINE_LABELS, STATUS_COLORS } from "../../../shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../../shared/utils/notifications";
import { api, recUrl, API_BASE, collectEnv } from "../../../shared/services/api";
import InteractionTemplatesPanel from "../../interactions/InteractionTemplatesPanel.jsx";
import ContactInfoEnriched from "../../contacts/ContactInfoEnriched.jsx";
import { _T } from "../../../shared/state/tabState";
import { useCollabContext } from "../context/CollabContext";
import { FicheDocsPanelScreen } from "../screens"; // hotfix 2026-04-23 — Phase 14b missed import propagation
import { isContactInSuiviForCollab, getContactSuiviRole, getReceiverIdForSentTransfer, getActiveSentTransferBooking } from "../../../shared/utils/suivi";

const PhoneTab = () => {
  const ctx = useCollabContext();
  const {
    collab, company, contacts, bookings, collabs, showNotif,
    portalTab, setPortalTab, setPortalTabKey,
    selectedCrmContact, setSelectedCrmContact,
    setCollabFicheTab, setRdvPasseModal,
    setShowNewContact, setBookings, setContacts, setContactFieldDefs,
    setVoipCallLogs, voipCallLogs,
    setPipelineRightContact, setPipelinePopupHistory,
    setPipelineRdvForm, setPipeBulkStage, setPipeBulkModal, setPipeSelectedIds,
    setIaHubCollapse,
    setMyGoals, setMyRewards,
    setContactAnalysesHistory, setContactAnalysesHistoryModal,
    startVoipCall, startPhoneCall,
    phoneSubTab, setPhoneSubTab,
    phoneActiveCall, setPhoneActiveCall,
    phoneActiveScriptId, setPhoneActiveScriptId,
    phoneCallTimer, phoneIncomingInfo, setPhoneIncomingInfo,
    phoneCallDetailId, setPhoneCallDetailId, phoneCallDetailTab, setPhoneCallDetailTab,
    phoneContactDetailId, setPhoneContactDetailId, phoneContactDetailTab, setPhoneContactDetailTab,
    phoneContactEditMode, setPhoneContactEditMode, phoneContactEditForm, setPhoneContactEditForm,
    phoneContactSearch, setPhoneContactSearch, phoneContactSort, setPhoneContactSort,
    phoneFavorites, setPhoneFavorites,
    phoneCallNotes, setPhoneCallNotes, phoneCallTags, setPhoneCallTags,
    phoneCallRatings, setPhoneCallRatings, phoneCallFollowups, setPhoneCallFollowups,
    phoneCallAnalyses, setPhoneCallAnalyses, phoneCallRecordings, setPhoneCallRecordings,
    phoneCallTranscript, setPhoneCallTranscript, phoneCallTranscriptLoading, setPhoneCallTranscriptLoading,
    phoneAnalysisLoading, setPhoneAnalysisLoading, phoneAnalysisModal, setPhoneAnalysisModal,
    phoneRecordModal, setPhoneRecordModal, phoneShowCallNoteModal, setPhoneShowCallNoteModal,
    phoneCallNoteText, setPhoneCallNoteText,
    phoneCallContext, setPhoneCallContext, phoneRecommendedActions, setPhoneRecommendedActions,
    phoneAutoRecap, setPhoneAutoRecap, phoneRecordingEnabled, setPhoneRecordingEnabled,
    phoneCallScripts, setPhoneCallScripts,
    phonePipeSearch, setPhonePipeSearch,
    phoneHistorySearch, setPhoneHistorySearch, phoneHistoryFilter, setPhoneHistoryFilter,
    phoneSMSText, setPhoneSMSText, phoneShowSMS, setPhoneShowSMS,
    phoneScheduledCalls, setPhoneScheduledCalls,
    schedContactMode, setSchedContactMode, schedSearchQ, setSchedSearchQ,
    phoneCalMonth, setPhoneCalMonth,
    phoneStatsPeriod, setPhoneStatsPeriod, phoneStatsOpen, setPhoneStatsOpen,
    todayCallCount, // wired from context (hotfix 2026-04-23)
    phoneShowCampaignModal, setPhoneShowCampaignModal,
    phoneCampaigns, setPhoneCampaigns, phoneDailyGoal, setPhoneDailyGoal,
    phoneVoicemails, setPhoneVoicemails,
    phoneAutoSMS, setPhoneAutoSMS, phoneAutoSMSText, setPhoneAutoSMSText,
    phoneOpenHours, setPhoneOpenHours,
    phoneModules, setPhoneModules, phoneStreak, setPhoneStreak, phoneBadges, setPhoneBadges,
    phoneSMSTemplates, setPhoneSMSTemplates, phoneSpeedDial, setPhoneSpeedDial,
    phoneToolbarOrder, setPhoneToolbarOrder,
    phoneToolbarDragIdx, setPhoneToolbarDragIdx, phoneToolbarDragOverIdx, setPhoneToolbarDragOverIdx,
    phoneDialerMinimized, setPhoneDialerMinimized,
    phoneDND, setPhoneDND, phoneDispositions, setPhoneDispositions,
    phoneBlacklist, setPhoneBlacklist,
    phoneTeamChatOpen, setPhoneTeamChatOpen, phoneTeamChatMsg, setPhoneTeamChatMsg, phoneTeamChatTab, setPhoneTeamChatTab,
    phoneShowScript, setPhoneShowScript, phoneShowContextEditor, setPhoneShowContextEditor,
    phoneLiveTranscript, setPhoneLiveTranscript,
    phoneLiveSentiment, setPhoneLiveSentiment, phoneLiveVoiceActivity, setPhoneLiveVoiceActivity,
    phoneLiveSuggestions, setPhoneLiveSuggestions,
    phoneLiveAnalysis, setPhoneLiveAnalysis, phoneLastCallSession, setPhoneLastCallSession,
    phoneCopilotLiveData, setPhoneCopilotLiveData,
    phoneCopilotLiveLoading, setPhoneCopilotLiveLoading,
    phoneCopilotChecklist, setPhoneCopilotChecklist,
    phoneCopilotTabData, setPhoneCopilotTabData, phoneCopilotTabLoaded, setPhoneCopilotTabLoaded,
    phoneCopilotReactions, setPhoneCopilotReactions,
    phoneCopilotReactionStats, setPhoneCopilotReactionStats,
    phoneCopilotLiveStep, setPhoneCopilotLiveStep,
    phoneRightTab, setPhoneRightTab, phoneRightCollapsed, setPhoneRightCollapsed,
    phoneRightAccordion, setPhoneRightAccordion,
    phoneLeftCollapsed, setPhoneLeftCollapsed,
    phoneDialNumber, setPhoneDialNumber,
    phoneShowScheduleModal, setPhoneShowScheduleModal,
    phoneScheduleForm, setPhoneScheduleForm,
    voipDevice, voipCall, voipCallRef,
    voipState, setVoipState,
    voipCurrentCallLogId, setVoipCurrentCallLogId,
    voipCredits, voipConfigured,
    appMyPhoneNumbers, appPhonePlans, appConversations, setAppConversations,
    pdNumbers, setPdNumbers, pdParsedList, setPdParsedList, pdDuplicates, setPdDuplicates,
    pdStatus, setPdStatus, pdCurrentIdx, setPdCurrentIdx, pdResults, setPdResults,
    pdResult, pdStageId, pdContactList,
    collabCallForms, setCollabCallForms,
    callFormData, setCallFormData, callFormResponses, setCallFormResponses,
    callFormResponseAccordion, setCallFormResponseAccordion,
    aiValidationEditing, setAiValidationEditing, aiValidationEdits, setAiValidationEdits,
    selConvId, setSelConvId, convEvents, setConvEvents,
    convNoteText, setConvNoteText, convSmsText, setConvSmsText,
    convSearch, setConvSearch, convFilter, setConvFilter, convLoading, setConvLoading,
    selectedLine, setSelectedLine, zoom, setZoom,
    cockpitOpen, setCockpitOpen, cockpitMinimized, setCockpitMinimized,
    liveConfig, saveLiveConfig,
    phoneQuickAddName, setPhoneQuickAddName,
    phoneQuickAddPhone, setPhoneQuickAddPhone,
    phoneQuickAddStage, setPhoneQuickAddStage,
    phoneQuickAddType, setPhoneQuickAddType,
    phoneQuickAddFirstname, setPhoneQuickAddFirstname,
    phoneQuickAddLastname, setPhoneQuickAddLastname,
    phoneQuickAddEmail, setPhoneQuickAddEmail,
    phoneQuickAddCompany, setPhoneQuickAddCompany,
    phoneQuickAddSiret, setPhoneQuickAddSiret,
    phoneQuickAddResponsable, setPhoneQuickAddResponsable,
    phoneQuickAddMobile, setPhoneQuickAddMobile,
    phoneQuickAddWebsite, setPhoneQuickAddWebsite,
    pipelineStages, PIPELINE_STAGES, orderedStages,
    // ── Hotfix audit 2026-04-23 — wire missing symbols ──
  fmtDur, fmtPhone, googleEventsProp, isModuleOn, myGoals, myRewards, openCallDetail, pipeSelectedIds, playDtmf, prefillKeypad, togglePhoneLeftPanel,
    // ── Hotfix audit 2026-04-23 (v2) — JSX attr handler pattern ──
  acceptCollabIncomingCall, endPhoneCall, rejectCollabIncomingCall, togglePhoneDND, togglePhoneRecording,
    // ── Hotfix audit 2026-04-23 (v3) ──
  cancelBookingAndCascade, handleColumnDragEnd, handleQuickAddContact, phoneTeamChatRef, pipeBulkStage, stopAutoDialer, togglePhoneAutoRecap, togglePhoneAutoSMS, togglePhoneRightPanel,
  // ── AST audit 2026-04-23 (v7) ──
  _defaultLiveConfig, _tempColor, _tempEmoji, _tempLabel, addToBlacklist, autoDialerNext, calendars, CALL_TAGS, collabChatMessages, collabChatOnline, collabNotesTimerRef, collabsProp, contactAnalysesHistory, contactFieldDefs, contactsLocalEditRef, cScoreColor, cScoreLabel, fetchCallTranscript, generateCallAnalysis, getLeadTemperature, handleCollabDeleteContact, handleCollabUpdateContact, handleColumnDragStart, handleColumnDrop, handlePipelineStageChange, iaHubCollapse, isAdminView, perduMotifModal, PHONE_MODULES, pipelinePopupContact, pipelinePopupHistory, pipelineRightContact, postCallResultModal, rdvPasseModal, removeFromBlacklist, removeScheduledCall, saveCallRecording, savePhoneCallRating, savePhoneCallTag, saveScriptsDual, scanImageModal, setPerduMotifModal, setPipelinePopupContact, setPipelineRightTab, setPostCallResultModal, setScanImageModal, setV7TransferModal, setV7TransferTarget, smsCredits, startAutoDialer, toggleModule, togglePhoneFav, v7FollowersMap,
  } = ctx;

  // V1.8.22.3 — Toggle visibilité ID contact dans footer panneau droit
  const [showContactId, setShowContactId] = useState(false);

  // V1.8.27 — Recording = setting company-wide (admin only). Toggles grisés pour members.
  const _isAdminPhone = collab?.role === 'admin' || collab?.role === 'supra' || isAdminView;

  return (
    <>
<div style={{display:'flex',flexDirection:'column',margin:'-24px -28px',height:'calc(100vh - 0px)',background:T.bg,overflow:'hidden'}}>

  {/* ═══════════════════════════════════════════════════════════ */}
  {/* TOOLBAR — 60px fixed header bar                           */}
  {/* ═══════════════════════════════════════════════════════════ */}
  <div style={{
    height:60,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between',
    padding:'0 20px',background:T.surface,borderBottom:`1px solid ${T.border}`,
    gap:12,
  }}>
    {/* ── LEFT: Stats + Objectif + Prochain RDV ── */}
    <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0,flexWrap:'wrap'}}>
      {(()=>{
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const weekStart = new Date(now); weekStart.setDate(now.getDate()-now.getDay()+1); const weekStr = weekStart.toISOString().split('T')[0];
        const statMode = (typeof phoneStatsPeriod!=='undefined'?phoneStatsPeriod:null) === 'week' ? 'week' : 'day';
        const logs = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(c=> statMode==='week' ? (c.createdAt||'') >= weekStr : (c.createdAt||'').startsWith(today));
        const inbound = logs.filter(c=>c.direction==='inbound').length;
        const outbound = logs.filter(c=>c.direction==='outbound').length;
        const totalDur = logs.reduce((a,c)=>a+(c.duration||0),0);
        const goalMet = todayCallCount >= (typeof phoneDailyGoal!=='undefined'?phoneDailyGoal:null);

        // Prochain RDV — fusionne bookings Calendar360 + Google Calendar
        const nowMs = now.getTime();
        const myBookings = (bookings||[]).filter(b=>b.collaboratorId===collab.id&&b.status!=='cancelled');
        const myGCal = (googleEventsProp||[]).filter(ge=>ge.collaboratorId===collab.id);
        const allEvents = [
          ...myBookings.map(b=>{const _ct=b.contactId?(contacts||[]).find(c=>c.id===b.contactId):null;return{title:_ct?.name||b.visitorName||b.service||'RDV',time:new Date(b.date+(b.time?'T'+b.time:'')),src:'booking'};}),
          ...myGCal.map(ge=>({title:ge.summary||ge.title||'Evenement',time:new Date(ge.start||ge.startDate),src:'google'}))
        ].filter(e=>e.time.getTime()>nowMs).sort((a,b)=>a.time-b.time);
        const nextRdv = allEvents[0];
        let rdvCountdown = '';
        let rdvTime = '';
        let rdvTitle = '';
        let rdvDateStr = '';
        let rdvIsToday = false;
        if(nextRdv) {
          rdvTime = nextRdv.time.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
          rdvTitle = nextRdv.title;
          rdvDateStr = nextRdv.time.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
          rdvIsToday = nextRdv.time.toDateString() === new Date().toDateString();
          const diff = nextRdv.time.getTime() - nowMs;
          if(diff>0){
            if(diff >= 86400000){ const d=Math.floor(diff/86400000); const h=Math.floor((diff%86400000)/3600000); const m=Math.floor((diff%3600000)/60000); const sc=Math.floor((diff%60000)/1000); rdvCountdown='Dans '+d+'j '+h+'h'+String(m).padStart(2,'0')+'m'+String(sc).padStart(2,'0')+'s'; }
            else if(diff >= 3600000){ const h=Math.floor(diff/3600000); const m=Math.floor((diff%3600000)/60000); const sc=Math.floor((diff%60000)/1000); rdvCountdown='Dans '+h+'h'+String(m).padStart(2,'0')+'m'+String(sc).padStart(2,'0')+'s'; }
            else if(diff >= 60000){ const m=Math.floor(diff/60000); const sc=Math.floor((diff%60000)/1000); rdvCountdown='Dans '+m+'m'+String(sc).padStart(2,'0')+'s'; }
            else { const sc=Math.floor(diff/1000); rdvCountdown='Dans '+sc+'s'; }
          }
        }

        // Toggle stats bar
        const _statsOpen = _T.phoneStatsOpen !== false;
        const _toggleStats = () => { _T.phoneStatsOpen = !_statsOpen; setPortalTabKey(k=>k+1); };

        return <>
          {/* Toggle arrow */}
          <div onClick={_toggleStats} style={{width:22,height:22,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:'1px solid '+T.border,flexShrink:0,transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background=T.bg} title={_statsOpen?'Masquer les stats':'Afficher les stats'}>
            <I n={_statsOpen?'chevron-left':'chevron-right'} s={12} style={{color:T.text3}}/>
          </div>
          {/* Stats content — collapsible */}
          {_statsOpen && <>
          {/* Period filter */}
          <div style={{display:'flex',borderRadius:8,overflow:'hidden',border:'1px solid '+T.border}}>
            {['day','week'].map(p=>(
              <div key={p} onClick={()=>setPhoneStatsPeriod(p)} style={{padding:'4px 8px',fontSize:9,fontWeight:700,cursor:'pointer',background:statMode===p?T.accent:'transparent',color:statMode===p?'#fff':T.text3,transition:'all .15s'}}>{p==='day'?'Jour':'Semaine'}</div>
            ))}
          </div>
          {/* Stats badges */}
          {[
            {icon:'phone-incoming',value:inbound,label:'Entrants',color:'#22C55E'},
            {icon:'phone-outgoing',value:outbound,label:'Sortants',color:'#2563EB'},
            {icon:'clock',value:fmtDur(totalDur),label:'Duree',color:'#7C3AED'},
          ].map((s,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:10,background:s.color+'0A',border:'1px solid '+s.color+'18'}}>
              <I n={s.icon} s={12} style={{color:s.color}}/>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:s.color,lineHeight:1}}>{s.value}</div>
                <div style={{fontSize:8,color:T.text3,fontWeight:600,lineHeight:1,marginTop:1}}>{s.label}</div>
              </div>
            </div>
          ))}
          {/* Objectif — connecte au systeme de recompenses */}
          {(()=>{
            // Trouver les objectifs actifs du collab (type calls)
            const activeGoals = ((typeof myGoals!=='undefined'?myGoals:null)||[]).filter(g=>g.type==='calls'&&g.status==='active');
            const completedGoals = ((typeof myGoals!=='undefined'?myGoals:null)||[]).filter(g=>g.type==='calls'&&g.status==='completed');
            const goalRewards = ((typeof myRewards!=='undefined'?myRewards:null)||[]).filter(r=>r.goal_type==='individual');
            const hasReward = activeGoals.some(g=>g.reward_leads>0) || completedGoals.some(g=>g.reward_leads>0);
            const totalRewardLeads = goalRewards.reduce((a,r)=>a+(r.leads_awarded||0),0);

            // Auto check-rewards si objectif atteint (une seule fois)
            if(goalMet && activeGoals.length>0) {
              const key = 'c360-goal-checked-'+today+'-'+collab.id;
              if(!sessionStorage.getItem(key)) {
                sessionStorage.setItem(key, '1');
                api('/api/goals/check-rewards', {method:'POST', body:{companyId:company.id}}).then(r=>{
                  if(r?.awarded?.length>0) {
                    const totalLeads = r.awarded.reduce((a,aw)=>a+(aw.leads_awarded||0),0);
                    showNotif('🎉 Objectif atteint ! +'+totalLeads+' leads bonus distribues !','success');
                    // Refresh goals
                    api(`/api/goals/my-progress?companyId=${company.id}`).then(data=>{
                      if(data?.myGoals) (typeof setMyGoals==='function'?setMyGoals:function(){})(data.myGoals);
                      if(data?.myRewards) (typeof setMyRewards==='function'?setMyRewards:function(){})(data.myRewards);
                    }).catch(()=>{});
                  }
                }).catch(()=>{});
              }
            }

            return <div onClick={()=>{
              if(goalMet) {
                const rewardText = hasReward
                  ? (totalRewardLeads>0 ? '🏆 Leads bonus gagnes: +'+totalRewardLeads+' leads\n' : '')
                    + completedGoals.map(g=>'✅ '+g.target_value+' appels — +'+(g.reward_leads||0)+' leads').join('\n')
                    + (activeGoals.length>0 ? '\n'+activeGoals.map(g=>'🎯 En cours: '+Math.round((g.current_value||0)/g.target_value*100)+'% (+'+(g.reward_leads||0)+' leads)').join('\n') : '')
                  : 'Objectif quotidien atteint ! Bravo 🎉';
                showNotif(rewardText, 'success');
              } else {
                const nextGoal = activeGoals[0];
                const remaining = nextGoal ? Math.max(0, nextGoal.target_value - (nextGoal.current_value||0)) : Math.max(0, (typeof phoneDailyGoal!=='undefined'?phoneDailyGoal:null) - todayCallCount);
                const rewardInfo = nextGoal?.reward_leads ? ' — Recompense: +'+nextGoal.reward_leads+' leads' : '';
                showNotif('Encore '+remaining+' appels pour atteindre l\'objectif'+rewardInfo, 'info');
              }
            }} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:10,background:goalMet?'#22C55E0A':'#F59E0B0A',border:'1px solid '+(goalMet?'#22C55E18':'#F59E0B18'),cursor:'pointer',position:'relative'}}>
              <I n={goalMet?'award':'target'} s={12} style={{color:goalMet?'#22C55E':'#F59E0B'}}/>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:goalMet?'#22C55E':'#F59E0B',lineHeight:1}}>{todayCallCount}/{phoneDailyGoal}</div>
                <div style={{fontSize:8,color:T.text3,fontWeight:600,lineHeight:1,marginTop:1}}>
                  {goalMet ? (totalRewardLeads>0?'+'+totalRewardLeads+' leads 🏆':'Atteint! 🎉') : 'Objectif jour'}
                </div>
              </div>
              <div style={{width:24,height:4,borderRadius:2,background:T.border,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:2,width:Math.min(100,Math.round(todayCallCount/Math.max((typeof phoneDailyGoal!=='undefined'?phoneDailyGoal:null),1)*100))+'%',background:goalMet?'#22C55E':'#F59E0B',transition:'width .5s'}}/>
              </div>
              {goalMet && hasReward && <div style={{position:'absolute',top:-4,right:-4,width:14,height:14,borderRadius:7,background:'#F59E0B',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,boxShadow:'0 1px 4px #F59E0B40'}}>🎁</div>}
            </div>;
          })()}
          {/* Prochain RDV */}
          {nextRdv && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:'5px 10px',borderRadius:10,background:'#0EA5E90A',border:'1px solid #0EA5E918'}}>
              <I n={nextRdv.src==='google'?'calendar':'calendar-check'} s={12} style={{color:'#0EA5E9'}}/>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:10,fontWeight:700,color:'#0EA5E9',lineHeight:1.2}}>{rdvTime} {rdvIsToday?'Aujourd\'hui':'· '+rdvDateStr} — {rdvTitle}</div>
                <div style={{fontSize:9,color:'#0EA5E9',fontWeight:600,lineHeight:1,marginTop:2}}>{rdvCountdown}{nextRdv.src==='google'?' (GCal)':''}</div>
              </div>
            </div>
          )}
        </>}{/* fin _statsOpen */}
        </>;
      })()}
    </div>

    {/* ── CENTER: Navigation icon buttons (draggable reorder) ── */}
    {(()=>{
      const _totalUnreadSMS = ((typeof appConversations!=='undefined'?appConversations:null)||[]).reduce((s,c)=>s+((c.lastEventType||'').includes('sms')?(c.unreadCount||0):0),0);
      const PHONE_TOOLBAR_ITEMS = [
        {id:'pipeline',icon:'trello',label:'Pipeline',badge:null},
        {id:'campaigns',icon:'zap',label:'Campagnes',badge:(typeof phoneCampaigns!=='undefined'?phoneCampaigns:{}).length||null,badgeColor:'#F59E0B'},
        {id:'sms',icon:'message-circle',label:'SMS',badge:_totalUnreadSMS||null,badgeColor:'#0EA5E9'},
        {id:'scripts',icon:'file-text',label:'Scripts',badge:null},
        {id:'stats',icon:'bar-chart-2',label:'Stats',badge:null},
        ...(collab.ai_copilot_enabled ? [{id:'copilot',icon:'cpu',label:'Copilot IA',badge:null,gradient:true}] : []),
      ];
      const sorted = (typeof phoneToolbarOrder!=='undefined'?phoneToolbarOrder:null)
        ? (typeof phoneToolbarOrder!=='undefined'?phoneToolbarOrder:{}).map(id=>PHONE_TOOLBAR_ITEMS.find(t=>t.id===id)).filter(Boolean).concat(PHONE_TOOLBAR_ITEMS.filter(t=>!(typeof phoneToolbarOrder!=='undefined'?phoneToolbarOrder:{}).includes(t.id)))
        : PHONE_TOOLBAR_ITEMS;
      const onDragStart=(idx)=>setPhoneToolbarDragIdx(idx);
      const onDragEnd=()=>{setPhoneToolbarDragIdx(null);setPhoneToolbarDragOverIdx(null);};
      const onDragOver=(e,idx)=>{e.preventDefault();setPhoneToolbarDragOverIdx(idx);};
      const onDrop=(e,idx)=>{
        e.preventDefault();
        if(phoneToolbarDragIdx===null||phoneToolbarDragIdx===idx){(typeof setPhoneToolbarDragIdx==='function'?setPhoneToolbarDragIdx:function(){})(null);setPhoneToolbarDragOverIdx(null);return;}
        const arr=[...sorted];const[item]=arr.splice((typeof phoneToolbarDragIdx!=='undefined'?phoneToolbarDragIdx:null),1);arr.splice(idx,0,item);
        const newOrder=arr.map(t=>t.id);setPhoneToolbarOrder(newOrder);
        try{localStorage.setItem("c360-phone-toolbar-order-"+collab.id,JSON.stringify(newOrder));}catch(e){}
        setPhoneToolbarDragIdx(null);setPhoneToolbarDragOverIdx(null);
      };
      return (
    <div style={{display:'flex',gap:2,alignItems:'center',background:T.bg,borderRadius:12,padding:'3px 4px',border:`1px solid ${T.border}`}}>
      {sorted.map((nav,idx)=>(
        <div key={nav.id}
          draggable
          onDragStart={()=>onDragStart(idx)}
          onDragEnd={onDragEnd}
          onDragOver={e=>onDragOver(e,idx)}
          onDrop={e=>onDrop(e,idx)}
          onClick={()=>{
            setPhoneSubTab(prev => prev === nav.id ? 'conversations' : nav.id);
            if(nav.id === 'copilot' && !(typeof phoneCopilotTabLoaded!=='undefined'?phoneCopilotTabLoaded:null)){
              setPhoneCopilotTabLoaded(true);
              const cf = collab.role !== 'admin' ? `&collaboratorId=${collab.id}` : '';
              Promise.all([
                api(`/api/ai-copilot/stats?companyId=${company.id}${cf}`),
                api(`/api/ai-copilot/analyses?companyId=${company.id}${cf}&limit=20`),
                api(`/api/ai-copilot/coaching/${collab.id}`),
                api(`/api/ai-copilot/objections?companyId=${company.id}`)
              ]).then(([s,a,c,o])=>setPhoneCopilotTabData(p=>({...p,stats:s,analyses:a||[],coaching:c,objections:o,loading:false})))
                .catch(()=>setPhoneCopilotTabData(p=>({...p,loading:false})));
            }
          }}
          title={nav.label}
          style={{
            position:'relative',display:'flex',alignItems:'center',justifyContent:'center',gap:5,
            padding:'7px 12px',borderRadius:9,cursor:'grab',
            background: (typeof phoneSubTab!=='undefined'?phoneSubTab:null) === nav.id
              ? (nav.gradient ? 'linear-gradient(135deg,#7C3AED,#2563EB)' : T.accentBg)
              : 'transparent',
            color: (typeof phoneSubTab!=='undefined'?phoneSubTab:null) === nav.id
              ? (nav.gradient ? '#fff' : T.accent)
              : T.text3,
            fontWeight: (typeof phoneSubTab!=='undefined'?phoneSubTab:null) === nav.id ? 700 : 500,
            fontSize:11,transition:'all .15s',
            boxShadow: (typeof phoneSubTab!=='undefined'?phoneSubTab:null) === nav.id && nav.gradient ? '0 2px 8px rgba(124,58,237,0.3)' : 'none',
            opacity: (typeof phoneToolbarDragIdx!=='undefined'?phoneToolbarDragIdx:null) === idx ? 0.4 : 1,
            borderLeft: (typeof phoneToolbarDragOverIdx!=='undefined'?phoneToolbarDragOverIdx:null) === idx && (typeof phoneToolbarDragIdx!=='undefined'?phoneToolbarDragIdx:null) !== null ? `2px solid ${T.accent}` : '2px solid transparent',
          }}
          onMouseEnter={e=>{if((typeof phoneSubTab!=='undefined'?phoneSubTab:null) !== nav.id && (typeof phoneToolbarDragIdx!=='undefined'?phoneToolbarDragIdx:null)===null) e.currentTarget.style.background = T.surface;}}
          onMouseLeave={e=>{if((typeof phoneSubTab!=='undefined'?phoneSubTab:null) !== nav.id) e.currentTarget.style.background = 'transparent';}}
        >
          <I n={nav.icon} s={15}/>
          <span style={{display:(typeof phoneSubTab!=='undefined'?phoneSubTab:null) === nav.id ? 'inline' : 'none',fontSize:11,fontWeight:700}}>{nav.label}</span>
          {nav.badge > 0 && (
            <span style={{
              position:'absolute',top:2,right:2,
              width:14,height:14,borderRadius:7,
              background:nav.badgeColor || T.accent,color:'#fff',
              fontSize:8,fontWeight:800,
              display:'flex',alignItems:'center',justifyContent:'center',
              boxShadow:`0 1px 4px ${(nav.badgeColor || T.accent)}40`,
            }}>{nav.badge > 9 ? '9+' : nav.badge}</span>
          )}
        </div>
      ))}
    </div>);
    })()}

    {/* ── RIGHT: Credits, DND, Recording, Line selector ── */}
    <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
      {/* Credits badge */}
      <div style={{
        display:'flex',alignItems:'center',gap:5,padding:'6px 12px',borderRadius:10,
        background:'linear-gradient(135deg,#7C3AED10,#2563EB10)',
        border:'1px solid #7C3AED20',
      }}>
        <I n="zap" s={13} style={{color:'#7C3AED'}}/>
        <span style={{fontSize:13,fontWeight:800,background:'linear-gradient(135deg,#7C3AED,#2563EB)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>{(typeof voipCredits!=='undefined'?voipCredits:null) || 0} min</span>
      </div>

      {/* Plan usage mini bar (if applicable) */}
      {(()=>{
        const myNum = ((typeof appMyPhoneNumbers!=='undefined'?appMyPhoneNumbers:null)||[]).find(pn => pn.collaboratorId === collab.id && pn.status === 'assigned');
        const plan = myNum && ((typeof appPhonePlans!=='undefined'?appPhonePlans:null)||[]).find(p => p.id === myNum.planId);
        const used = myNum?.minutesUsed || 0;
        const total = myNum?.minutesIncluded || (plan?.minutes) || 0;
        const pct = total > 0 ? Math.round(used / total * 100) : 0;
        if (!myNum || total <= 0) return null;
        return (
          <div style={{
            display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:10,
            background:pct >= 80 ? '#EF44440A' : '#7C3AED0A',
            border:`1px solid ${pct >= 80 ? '#EF444420' : '#7C3AED20'}`,
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:T.border,overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:2,width:Math.min(pct,100)+'%',background:pct>=80?'#EF4444':'#7C3AED',transition:'width .5s'}}/>
            </div>
            <span style={{fontSize:11,fontWeight:700,color:pct>=80?'#EF4444':'#7C3AED'}}>{used}/{total}</span>
          </div>
        );
      })()}

      {/* DND, REC, Line selector — moved to keypad bottom */}
    </div>
  </div>

  {/* ═══════════════════════════════════════════════════════════ */}
  {/* THREE-COLUMN CONTAINER                                     */}
  {/* ═══════════════════════════════════════════════════════════ */}
  <div style={{display:'flex',flex:1,overflow:'hidden',position:'relative'}}>

    {/* ═══════════════════════════════════════════════════════ */}
    {/* LEFT COLUMN — Conversations Panel (collapsible)       */}
    {/* ═══════════════════════════════════════════════════════ */}
    <div data-pipe-left-panel="1" style={{
      width:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?48:280,flexShrink:0,display:'flex',flexDirection:'column',
      borderRight:`1px solid ${T.border}`,background:T.surface,
      overflow:'hidden',transition:'width .25s ease',
    }}>
    {(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null) ? (
      /* ── COLLAPSED STRIP — V1.8.26.1 entièrement cliquable ── */
      <div onClick={togglePhoneLeftPanel} style={{display:'flex',flexDirection:'column',alignItems:'center',height:'100%',padding:'8px 0',gap:4,cursor:'pointer'}} title="Ouvrir le panneau">
        <div onClick={(e)=>{e.stopPropagation();togglePhoneLeftPanel();}} style={{width:34,height:34,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:`1px solid ${T.border}`}} title="Ouvrir le panneau"><I n="chevron-right" s={15} style={{color:T.text3}}/></div>
        <div onClick={(e)=>{e.stopPropagation();togglePhoneLeftPanel();setPhoneDialerMinimized(false);}} style={{width:34,height:34,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#22C55E12',border:'1px solid #22C55E30'}} title="Clavier"><I n="phone" s={15} style={{color:'#22C55E'}}/></div>
        <div onClick={(e)=>{e.stopPropagation();togglePhoneLeftPanel();}} style={{width:34,height:34,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:`1px solid ${T.border}`}} title="Conversations"><I n="message-circle" s={15} style={{color:T.text3}}/></div>
        <div onClick={(e)=>{e.stopPropagation();setPhoneSubTab('contacts');togglePhoneLeftPanel();}} style={{width:34,height:34,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:`1px solid ${T.border}`}} title="Contacts"><I n="users" s={15} style={{color:T.text3}}/></div>
        <div style={{flex:1}}/>
        <div style={{fontSize:8,color:T.text3,writingMode:'vertical-rl',transform:'rotate(180deg)',letterSpacing:1,fontWeight:600,pointerEvents:'none'}}>CONV</div>
      </div>
    ) : (
    <>
      {/* ── COLLAPSE BUTTON ── */}
      <div onClick={togglePhoneLeftPanel} style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'4px 0',cursor:'pointer',borderBottom:`1px solid ${T.border}`,flexShrink:0}} title="Replier le panneau"><I n="chevron-left" s={14} style={{color:T.text3}}/></div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* DIALPAD — toujours visible en haut, toggle minimize */}
      {/* ═══════════════════════════════════════════════════ */}
      <div style={{flexShrink:0,background:'linear-gradient(160deg,#0F172A 0%,#1E293B 50%,#0F172A 100%)',borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        <div onClick={()=>(typeof setPhoneDialerMinimized==='function'?setPhoneDialerMinimized:function(){})(p=>!p)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 14px',cursor:'pointer',userSelect:'none',borderBottom:phoneDialerMinimized?'none':'1px solid rgba(255,255,255,0.06)'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {voipState==='incoming'?<span style={{width:8,height:8,borderRadius:4,background:'#F59E0B',boxShadow:'0 0 8px #F59E0B',animation:'pulse 1s infinite'}}/>:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?<span style={{width:8,height:8,borderRadius:4,background:(typeof voipState!=='undefined'?voipState:null)==='in-call'?'#22C55E':(typeof voipState!=='undefined'?voipState:null)==='ringing'?'#3B82F6':'#F59E0B',boxShadow:'0 0 8px '+((typeof voipState!=='undefined'?voipState:null)==='in-call'?'#22C55E':(typeof voipState!=='undefined'?voipState:null)==='ringing'?'#3B82F6':'#F59E0B'),animation:'pulse 1.5s infinite'}}/>:<div style={{width:20,height:20,borderRadius:6,background:'linear-gradient(135deg,#22C55E,#16A34A)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="phone" s={10} style={{color:'#fff'}}/></div>}
            <span style={{fontSize:12,fontWeight:700,color:'#fff',letterSpacing:0.3}}>{voipState==='incoming'?'Appel entrant':(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'En appel':'Clavier'}</span>
            {(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && <span style={{fontSize:12,color:'#22C55E',fontFamily:'monospace',fontWeight:700,background:'rgba(34,197,94,0.1)',padding:'1px 6px',borderRadius:4}}>{String(Math.floor((typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)/60)).padStart(2,'0')+':'+String((typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)%60).padStart(2,'0')}</span>}
            {!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (typeof voipState!=='undefined'?voipState:null)!=='incoming' && (typeof phoneDialNumber!=='undefined'?phoneDialNumber:null) && <span style={{fontSize:12,color:'#94A3B8',fontWeight:500}}>{phoneDialNumber}</span>}
          </div>
          <I n={(typeof phoneDialerMinimized!=='undefined'?phoneDialerMinimized:null)?'chevron-down':'chevron-up'} s={14} style={{color:'#475569'}}/>
        </div>

        {!(typeof phoneDialerMinimized!=='undefined'?phoneDialerMinimized:null) && (
          <div style={{padding:'12px 14px 16px'}}>

            {/* ── NUMBER INPUT ── */}
            <div style={{position:'relative',marginBottom:10}}>
              <input value={phoneDialNumber} onChange={e=>{if(!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)&&(typeof voipState!=='undefined'?voipState:null)!=='incoming')(typeof setPhoneDialNumber==='function'?setPhoneDialNumber:function(){})(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter'&&(typeof phoneDialNumber!=='undefined'?phoneDialNumber:{}).length>4&&!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)&&(typeof voipState!=='undefined'?voipState:null)!=='incoming'){startPhoneCall(phoneDialNumber,null);}}} readOnly={!!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)||(typeof voipState!=='undefined'?voipState:null)==='incoming'} placeholder={voipState==='incoming'?'Appel entrant...':'+33 6 12 34 56 78'} style={{width:'100%',padding:'12px 40px 12px 16px',borderRadius:14,border:'1.5px solid '+((typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'rgba(34,197,94,0.3)':(typeof voipState!=='undefined'?voipState:null)==='incoming'?'rgba(245,158,11,0.3)':'rgba(255,255,255,0.08)'),background:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'rgba(34,197,94,0.06)':(typeof voipState!=='undefined'?voipState:null)==='incoming'?'rgba(245,158,11,0.06)':'rgba(255,255,255,0.04)',fontSize:20,fontWeight:700,fontFamily:'monospace',color:'#fff',outline:'none',letterSpacing:1.5,textAlign:'center',boxShadow:phoneDialNumber?'0 0 20px rgba(34,197,94,0.08)':'none'}}/>
              {!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)&&(typeof voipState!=='undefined'?voipState:null)!=='incoming'&&(typeof phoneDialNumber!=='undefined'?phoneDialNumber:{}).length>0 && (
                <div onClick={()=>setPhoneDialNumber('')} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',width:24,height:24,borderRadius:12,background:'rgba(255,255,255,0.08)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.15)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'}>
                  <I n="x" s={12} style={{color:'#94A3B8'}}/>
                </div>
              )}
            </div>

            {/* ── ACTIVE CALL: Status badge ── */}
            {(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (()=>{
              const callContact = contacts.find(c=>c.id===(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).contactId);
              const statusLabel = (typeof voipState!=='undefined'?voipState:null)==='connecting'?'Connexion...':(typeof voipState!=='undefined'?voipState:null)==='ringing'?'Ca sonne...':(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).onHold?'En attente':'En cours';
              const statusColor = (typeof voipState!=='undefined'?voipState:null)==='connecting'?'#F59E0B':(typeof voipState!=='undefined'?voipState:null)==='ringing'?'#3B82F6':(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).onHold?'#F59E0B':'#22C55E';
              return <div style={{marginBottom:10,padding:'6px 12px',borderRadius:10,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{width:6,height:6,borderRadius:3,background:statusColor,boxShadow:'0 0 6px '+statusColor,animation:'pulse 1.5s infinite'}}/>
                  <span style={{fontSize:11,fontWeight:700,color:statusColor,textTransform:'uppercase',letterSpacing:0.5}}>{statusLabel}</span>
                </div>
                {callContact && <span style={{fontSize:11,color:'#94A3B8',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:140}}>{callContact.name} · {fmtPhone((typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).number)}</span>}
                {!callContact && <span style={{fontSize:11,color:'#94A3B8',fontWeight:500}}>{fmtPhone((typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).number)}</span>}
              </div>;
            })()}

            {/* ── INCOMING: Caller info + Accept/Reject ── */}
            {voipState==='incoming' && !(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (()=>{
              return <div style={{marginBottom:10}}>
                <div style={{textAlign:'center',marginBottom:12}}>
                  <div style={{width:64,height:64,borderRadius:32,background:'rgba(245,158,11,0.1)',border:'2px solid rgba(245,158,11,0.2)',margin:'0 auto 10px',display:'flex',alignItems:'center',justifyContent:'center',animation:'pulse 1.5s infinite',boxShadow:'0 0 30px rgba(245,158,11,0.15)'}}><I n="phone-incoming" s={26} style={{color:'#F59E0B'}}/></div>
                  <div style={{fontSize:15,fontWeight:800,color:'#fff'}}>{(typeof phoneIncomingInfo!=='undefined'?phoneIncomingInfo:null)?.contactName||'Numero inconnu'}</div>
                  <div style={{fontSize:12,color:'#94A3B8',marginTop:2}}>{(typeof phoneIncomingInfo!=='undefined'?phoneIncomingInfo:null)?.from||''}</div>
                </div>
                <div style={{display:'flex',gap:10}}>
                  <div onClick={acceptCollabIncomingCall} style={{flex:1,padding:'14px 0',borderRadius:14,background:'linear-gradient(135deg,#22C55E,#16A34A)',textAlign:'center',cursor:'pointer',boxShadow:'0 4px 20px rgba(34,197,94,0.35)',transition:'transform .15s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.03)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
                    <I n="phone" s={20} style={{color:'#fff'}}/>
                    <div style={{fontSize:10,fontWeight:700,color:'#fff',marginTop:3}}>Decrocher</div>
                  </div>
                  <div onClick={rejectCollabIncomingCall} style={{flex:1,padding:'14px 0',borderRadius:14,background:'linear-gradient(135deg,#EF4444,#DC2626)',textAlign:'center',cursor:'pointer',boxShadow:'0 4px 20px rgba(239,68,68,0.35)',transition:'transform .15s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.03)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
                    <I n="phone-off" s={20} style={{color:'#fff'}}/>
                    <div style={{fontSize:10,fontWeight:700,color:'#fff',marginTop:3}}>Refuser</div>
                  </div>
                </div>
              </div>;
            })()}

            {/* ── IDLE: Auto-complete contacts ── */}
            {!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (typeof voipState!=='undefined'?voipState:null)!=='incoming' && (typeof phoneDialNumber!=='undefined'?phoneDialNumber:{}).length >= 2 && (()=>{
              const matches = contacts.filter(c=>c.phone&&c.name&&(
                c.name.toLowerCase().includes((typeof phoneDialNumber!=='undefined'?phoneDialNumber:{}).toLowerCase()) ||
                (c.phone||'').includes((typeof phoneDialNumber!=='undefined'?phoneDialNumber:null)) ||
                (c.mobile||'').includes((typeof phoneDialNumber!=='undefined'?phoneDialNumber:null))
              )).slice(0,3);
              if(matches.length===0) return null;
              return (
                <div style={{marginBottom:8,borderRadius:12,border:'1px solid rgba(255,255,255,0.08)',background:'rgba(255,255,255,0.03)',overflow:'hidden'}}>
                  {matches.map((c,ci)=>(
                    <div key={c.id} onClick={()=>{setPhoneDialNumber('');startPhoneCall(c.phone||c.mobile,c.id);}} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',cursor:'pointer',borderBottom:ci<matches.length-1?'1px solid rgba(255,255,255,0.05)':'none',transition:'background .12s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{width:28,height:28,borderRadius:14,background:'rgba(99,102,241,0.15)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <span style={{fontWeight:700,fontSize:11,color:'#818CF8'}}>{(c.name||'?')[0].toUpperCase()}</span>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:12,color:'#E2E8F0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</div>
                      </div>
                      <I n="phone" s={12} style={{color:'#22C55E',flexShrink:0}}/>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── DTMF KEYPAD ── */}
            {(typeof voipState!=='undefined'?voipState:null)!=='incoming' && (()=>{
              const dKeys = [
                {k:'1',i:'voicemail'},{k:'2',i:null},{k:'3',i:null},
                {k:'4',i:null},{k:'5',i:null},{k:'6',i:null},
                {k:'7',i:null},{k:'8',i:null},{k:'9',i:null},
                {k:'*',i:null},{k:'0',i:'plus'},{k:'#',i:null}
              ];
              return (
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:12}}>
                  {dKeys.map(d=>(
                    <div key={d.k} onClick={()=>{
                      playDtmf(d.k);
                      if(!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)) setPhoneDialNumber(p=>p+d.k);
                      if((typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)&&voipCallRef.current) try{voipCallRef.current.sendDigits(d.k);}catch(e){}
                    }} style={{padding:'10px 0',borderRadius:12,textAlign:'center',cursor:'pointer',transition:'all .1s',userSelect:'none',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',backdropFilter:'blur(4px)'}} onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.1)';e.currentTarget.style.transform='scale(1.04)';e.currentTarget.style.borderColor='rgba(255,255,255,0.15)';}} onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.transform='scale(1)';e.currentTarget.style.borderColor='rgba(255,255,255,0.06)';}}>
                      <div style={{fontSize:22,fontWeight:500,lineHeight:1,color:'#fff'}}>{d.k}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── BOTTOM: Call/Hangup + controls ── */}
            {(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) ? (
              <div>
                <div style={{display:'flex',justifyContent:'center',gap:6,marginBottom:10}}>
                  {[
                    {icon:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).muted?'mic-off':'mic',label:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).muted?'Sourd':'Micro',active:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).muted,color:'#EF4444',action:()=>{const m=!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).muted;(typeof setPhoneActiveCall==='function'?setPhoneActiveCall:function(){})(p=>({...p,muted:m}));if(voipCallRef.current)try{voipCallRef.current.mute(m);}catch(e){}}},
                    {icon:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).onHold?'play':'pause',label:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).onHold?'Repren.':'Pause',active:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).onHold,color:'#F59E0B',action:()=>(typeof setPhoneActiveCall==='function'?setPhoneActiveCall:function(){})(p=>({...p,onHold:!p.onHold}))},
                    {icon:'edit-3',label:'Note',active:false,color:'#3B82F6',action:()=>setPhoneShowCallNoteModal('live_'+Date.now())},
                    {icon:'message-square',label:'SMS',active:false,color:'#7C3AED',action:()=>{setPhoneShowSMS(true);setPhoneSMSText('');}}
                  ].map((btn,i)=>(
                    <div key={i} onClick={btn.action} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,cursor:'pointer'}}>
                      <div style={{width:40,height:40,borderRadius:12,background:btn.active?btn.color+'20':'rgba(255,255,255,0.04)',border:'1px solid '+(btn.active?btn.color+'40':'rgba(255,255,255,0.08)'),display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background=btn.active?btn.color+'30':'rgba(255,255,255,0.1)'} onMouseLeave={e=>e.currentTarget.style.background=btn.active?btn.color+'20':'rgba(255,255,255,0.04)'}>
                        <I n={btn.icon} s={16} style={{color:btn.active?btn.color:'#CBD5E1'}}/>
                      </div>
                      <span style={{fontSize:8,fontWeight:600,color:btn.active?btn.color:'#64748B'}}>{btn.label}</span>
                    </div>
                  ))}
                </div>
                <div data-dial-hangup-btn onClick={endPhoneCall} style={{width:'100%',padding:'12px 0',borderRadius:14,background:'linear-gradient(135deg,#EF4444,#DC2626)',textAlign:'center',cursor:'pointer',boxShadow:'0 4px 20px rgba(239,68,68,0.3)',transition:'transform .15s',display:'flex',alignItems:'center',justifyContent:'center',gap:8}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.02)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
                  <I n="phone-off" s={18} style={{color:'#fff'}}/>
                  <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>Raccrocher</span>
                </div>
              </div>
            ) : (typeof voipState!=='undefined'?voipState:null)!=='incoming' ? (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:20}}>
                {(typeof phoneDialNumber!=='undefined'?phoneDialNumber:{}).length>0 ? <div onClick={()=>(typeof setPhoneDialNumber==='function'?setPhoneDialNumber:function(){})(p=>p.slice(0,-1))} style={{width:44,height:44,borderRadius:22,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'rgba(255,255,255,0.25)',border:'1.5px solid rgba(255,255,255,0.4)',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.35)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.25)'}>
                  <span style={{fontSize:22,color:'#fff',lineHeight:1,fontWeight:300}}>⌫</span>
                </div> : <div style={{width:40,height:40}}/>}
                <div data-dial-call-btn onClick={()=>{
                  if((typeof phoneDialNumber!=='undefined'?phoneDialNumber:{}).length>4){startPhoneCall(phoneDialNumber,null);}
                  else showNotif('Entrez un numero','danger');
                }} style={{width:56,height:56,borderRadius:28,background:'linear-gradient(135deg,#22C55E,#16A34A)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:'0 0 30px rgba(34,197,94,0.35),0 4px 16px rgba(34,197,94,0.25)',transition:'transform .15s'}} onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.08)';}} onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';}}>
                  <I n="phone" s={22} style={{color:'#fff'}}/>
                </div>
                <div style={{width:40,height:40}}/>
              </div>
            ) : null}

            {/* ── LINE SELECTOR + DND + REC ── */}
            {(typeof voipState!=='undefined'?voipState:null)!=='incoming' && (()=>{
              const myLines = ((typeof appMyPhoneNumbers!=='undefined'?appMyPhoneNumbers:null)||[]).filter(pn => pn.collaboratorId === collab.id && pn.status === 'assigned');
              const activeLine = selectedLine || (myLines[0]?.phoneNumber) || '';
              return <div style={{marginTop:12,padding:'8px 0 0',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                {/* Active line display */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginBottom:8}}>
                  <div style={{width:6,height:6,borderRadius:3,background:(typeof phoneDND!=='undefined'?phoneDND:null)?'#DC2626':'#22C55E',boxShadow:(typeof phoneDND!=='undefined'?phoneDND:null)?'none':'0 0 6px #22C55E60'}}/>
                  {myLines.length <= 1 ? (
                    <span style={{fontSize:11,fontWeight:600,color:'#94A3B8'}}>{myLines.length===1?fmtPhone(myLines[0].phoneNumber):'Aucune ligne'}</span>
                  ) : (
                    <select value={activeLine} onChange={e=>setSelectedLine(e.target.value)} style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,color:'#fff',fontSize:11,fontWeight:600,padding:'3px 8px',outline:'none',cursor:'pointer'}}>
                      {myLines.map(ln=><option key={ln.id} value={ln.phoneNumber} style={{background:'#1E293B'}}>{fmtPhone(ln.phoneNumber)}</option>)}
                    </select>
                  )}
                </div>
                {/* DND + REC + Float toggles */}
                <div style={{display:'flex',justifyContent:'center',gap:8}}>
                  <div onClick={togglePhoneDND} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:8,cursor:'pointer',background:(typeof phoneDND!=='undefined'?phoneDND:null)?'rgba(220,38,38,0.1)':'rgba(255,255,255,0.03)',border:'1px solid '+((typeof phoneDND!=='undefined'?phoneDND:null)?'rgba(220,38,38,0.2)':'rgba(255,255,255,0.06)'),transition:'all .15s'}} title={(typeof phoneDND!=='undefined'?phoneDND:null)?'Desactiver':'Ne pas deranger'}>
                    <I n={(typeof phoneDND!=='undefined'?phoneDND:null)?'moon':'bell'} s={12} style={{color:(typeof phoneDND!=='undefined'?phoneDND:null)?'#EF4444':'#64748B'}}/>
                    <span style={{fontSize:9,fontWeight:600,color:(typeof phoneDND!=='undefined'?phoneDND:null)?'#EF4444':'#64748B'}}>{(typeof phoneDND!=='undefined'?phoneDND:null)?'DND ON':'DND'}</span>
                  </div>
                  <div onClick={togglePhoneRecording} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:8,cursor:'pointer',background:(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'rgba(239,68,68,0.1)':'rgba(255,255,255,0.03)',border:'1px solid '+((typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'rgba(239,68,68,0.2)':'rgba(255,255,255,0.06)'),transition:'all .15s'}} title={(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'Desactiver REC':'Activer REC'}>
                    <div style={{width:6,height:6,borderRadius:3,background:(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'#EF4444':'#64748B',animation:(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'pulse 1.5s infinite':'none',boxShadow:(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'0 0 4px #EF4444':'none'}}/>
                    <span style={{fontSize:9,fontWeight:600,color:(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'#EF4444':'#64748B'}}>REC</span>
                  </div>
                  <div onClick={()=>{
                    const num = (typeof phoneDialNumber!=='undefined'?phoneDialNumber:null)||'';
                    const line = selectedLine||((typeof appMyPhoneNumbers!=='undefined'?appMyPhoneNumbers:null)||[]).find(pn=>pn.collaboratorId===collab.id&&pn.status==='assigned')?.phoneNumber||'';
                    const w = window.open('','_blank','width=320,height=520,top=100,left=100,toolbar=no,menubar=no,scrollbars=no,resizable=yes,status=no');
                    if(!w) { showNotif('Popup bloquee — autorisez les popups','danger'); return; }
                    w.document.title='Clavier - Calendar360';
                    w.document.body.innerHTML='';
                    w.document.head.innerHTML='<meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,system-ui,sans-serif;background:linear-gradient(160deg,#0F172A,#1E293B);color:#fff;height:100vh;display:flex;flex-direction:column;overflow:hidden;user-select:none}.input{padding:12px;text-align:center}.input input{width:100%;padding:10px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#fff;font-size:22px;font-weight:700;font-family:monospace;text-align:center;outline:none;letter-spacing:1.5px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:0 12px}.grid .key{padding:12px 0;border-radius:12px;text-align:center;cursor:pointer;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);font-size:24px;font-weight:500;color:#fff;transition:all .1s}.grid .key:hover{background:rgba(255,255,255,0.12);transform:scale(1.04)}.actions{display:flex;justify-content:center;gap:16px;padding:14px}.call-btn{width:56px;height:56px;border-radius:28px;background:linear-gradient(135deg,#22C55E,#16A34A);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 25px rgba(34,197,94,0.35);border:none;color:#fff;font-size:22px;transition:transform .15s}.call-btn:hover{transform:scale(1.08)}.del-btn{width:44px;height:44px;border-radius:22px;background:rgba(255,255,255,0.2);border:1.5px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;font-size:20px;transition:all .15s}.del-btn:hover{background:rgba(255,255,255,0.3)}.line{text-align:center;padding:8px;font-size:12px;color:#94A3B8;border-top:1px solid rgba(255,255,255,0.06)}.line .dot{display:inline-block;width:6px;height:6px;border-radius:3px;background:#22C55E;margin-right:5px;box-shadow:0 0 6px #22C55E60}</style>';
                    const lineFmt = line ? line.replace(/^\\+33/,"0").replace(/(\\d{2})(?=\\d)/g,"$1 ") : '';
                    w.document.body.innerHTML=`<div class="input"><input id="num" value="${num}" placeholder="+33 6 12 34 56 78"/></div><div class="grid">${['1','2','3','4','5','6','7','8','9','*','0','#'].map(k=>`<div class="key" onclick="document.getElementById('num').value+=\'${k}\'">${k}</div>`).join('')}</div><div class="actions"><button class="del-btn" onclick="var i=document.getElementById('num');i.value=i.value.slice(0,-1)">⌫</button><button id="callBtn" class="call-btn" onclick="var n=document.getElementById('num').value;if(n.length>4){window.opener?.postMessage({type:'c360-dial',number:n},'*');document.getElementById('callBtn').style.display='none';document.getElementById('hangBtn').style.display='flex';document.getElementById('status').style.display='flex';}">📞</button><button id="hangBtn" style="display:none;width:56px;height:56px;border-radius:28px;background:linear-gradient(135deg,#EF4444,#DC2626);align-items:center;justify-content:center;cursor:pointer;border:none;color:#fff;font-size:18px;box-shadow:0 0 20px rgba(239,68,68,0.35)" onclick="window.opener?.postMessage({type:'c360-hangup'},'*');document.getElementById('hangBtn').style.display='none';document.getElementById('callBtn').style.display='flex';document.getElementById('status').style.display='none';">✕</button><div style="width:44px"></div></div><div id="status" style="display:none;align-items:center;justify-content:center;gap:6px;padding:8px"><div style="width:8px;height:8px;border-radius:4px;background:#22C55E;animation:pulse 1.5s infinite;box-shadow:0 0 6px #22C55E"></div><span style="font-size:13px;font-weight:700;color:#22C55E">Appel en cours</span></div><div class="line"><span class="dot"></span>${lineFmt||'VoIP'}</div><style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}</style>`;
                    w.focus();
                  }} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:8,cursor:'pointer',background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,0.15)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(99,102,241,0.08)'} title="Clavier flottant (nouvelle fenetre)">
                    <I n="external-link" s={12} style={{color:'#818CF8'}}/>
                    <span style={{fontSize:9,fontWeight:600,color:'#818CF8'}}>POP</span>
                  </div>
                </div>
              </div>;
            })()}
          </div>
        )}
      </div>

      {/* ── RECENT CALLS FEED ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Quick nav buttons */}
        <div style={{padding:'8px 10px',display:'flex',gap:4,flexWrap:'wrap',borderBottom:'1px solid '+T.border,flexShrink:0}}>
          {[
            {id:'_recents',icon:'clock',label:'Recents',active:true},
            {id:'contacts',icon:'users',label:'Contacts'},
            {id:'history',icon:'list',label:'Historique'},
          ].map(tab=>(
            <div key={tab.id} onClick={()=>{if(tab.id!=='_recents')setPhoneSubTab(tab.id);}} style={{padding:'5px 8px',borderRadius:8,fontSize:10,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:4,background:tab.active?T.accentBg:'transparent',color:tab.active?T.accent:T.text3,border:'1px solid '+(tab.active?T.accentBorder:'transparent'),transition:'all .12s'}} onMouseEnter={e=>{if(!tab.active)e.currentTarget.style.background=T.bg;}} onMouseLeave={e=>{if(!tab.active)e.currentTarget.style.background='transparent';}}>
              <I n={tab.icon} s={11}/>{tab.label}
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{padding:'8px 14px 6px',flexShrink:0}}>
          <div style={{position:'relative'}}>
            <I n="search" s={13} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:T.text3,pointerEvents:'none'}}/>
            <input value={convSearch} onChange={e=>(typeof setConvSearch==='function'?setConvSearch:function(){})(e.target.value)} placeholder="Rechercher..." style={{width:'100%',padding:'7px 10px 7px 32px',borderRadius:10,border:'1px solid '+T.border,background:T.surface,fontSize:12,color:T.text,outline:'none'}}/>
          </div>
        </div>

        {/* ── SMS Conversations with unread badges (V1.10.2 — tags Connu/Nouveau/Inconnu + CTA Créer fiche) ── */}
        {(()=>{
          const convs = ((typeof appConversations!=='undefined'?appConversations:null)||[]).filter(c=>c.lastEventType&&(c.lastEventType.includes('sms')||c.unreadCount>0));
          const totalUnread = convs.reduce((s,c)=>s+(c.unreadCount||0),0);
          // V1.10.2 — Compteur conversations sans contact lié (numéros à qualifier)
          const _isAdmin = (typeof isAdminView!=='undefined' && isAdminView) || collab?.role==='admin' || collab?.role==='supra';
          let unknownCount = 0;
          for (const cv of convs) {
            if (cv.contactId) continue;
            const m = matchContactByPhone(contacts, cv.clientPhone, { collabId: collab.id, companyId: company.id, isAdmin: _isAdmin });
            if (!m) unknownCount++;
          }
          if (convs.length === 0) return null;
          return <div style={{borderBottom:'1px solid '+T.border,flexShrink:0}}>
            <div style={{padding:'6px 14px 4px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:10,fontWeight:700,color:'#0EA5E9',display:'flex',alignItems:'center',gap:4}}><I n="message-circle" s={11}/> Conversations SMS</span>
              <div style={{display:'flex',alignItems:'center',gap:4}}>
                {unknownCount>0&&<span title="Numéros à qualifier" style={{fontSize:9,fontWeight:700,color:'#F59E0B',background:'#F59E0B18',border:'1px solid #F59E0B40',borderRadius:8,padding:'1px 6px'}}>{unknownCount} à qualifier</span>}
                {totalUnread>0&&<span style={{fontSize:9,fontWeight:800,color:'#fff',background:'#EF4444',borderRadius:10,padding:'1px 6px',minWidth:16,textAlign:'center'}}>{totalUnread}</span>}
              </div>
            </div>
            <div style={{maxHeight:180,overflow:'auto'}}>
              {convs.slice(0,10).map(conv=>{
                // V1.10.2 — Matching unifié + cross-collab scope
                let ct = conv.contactId ? (contacts||[]).find(c=>c.id===conv.contactId) : null;
                if (!ct) ct = matchContactByPhone(contacts, conv.clientPhone, { collabId: collab.id, companyId: company.id, isAdmin: _isAdmin });
                const isKnown = !!ct;
                // 🟢 connu / 🟠 nouveau (créé < 24h) / 🔴 inconnu non enregistré
                const isFresh = isKnown && ct.createdAt && (Date.now() - new Date(ct.createdAt).getTime() < 24*3600*1000);
                const tagColor = isKnown ? (isFresh ? '#F59E0B' : '#22C55E') : '#EF4444';
                const tagLabel = isKnown ? (isFresh ? 'Nouveau contact' : 'Contact connu') : 'Numéro inconnu';
                const name = ct?.name || conv.contactName || displayPhone(conv.clientPhone) || 'Numéro inconnu';
                const isActive = (typeof selConvId!=='undefined'?selConvId:null)===conv.id;
                const hasUnread = (conv.unreadCount||0)>0;
                const timeStr = (()=>{if(!conv.lastActivityAt)return'';const d=Date.now()-new Date(conv.lastActivityAt).getTime();if(d<60000)return"now";if(d<3600000)return Math.floor(d/60000)+'m';if(d<86400000)return Math.floor(d/3600000)+'h';return new Date(conv.lastActivityAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});})();
                return <div key={conv.id}
                  onMouseEnter={e=>{ if(!isActive)e.currentTarget.style.background=T.bg; }}
                  onMouseLeave={e=>{ if(!isActive)e.currentTarget.style.background='transparent'; }}
                  onClick={(e)=>{
                  e.stopPropagation();
                  const foundCt = ct || { id: conv.contactId||'tmp_'+conv.id, name: conv.contactName||displayPhone(conv.clientPhone)||'Numéro inconnu', phone: conv.clientPhone, pipeline_stage: 'nouveau', _isUnknown: true };
                  setPipelineRightContact(foundCt);
                  setPhoneRightTab('sms');
                  setPhoneDialNumber(conv.clientPhone||'');
                  if(phoneRightCollapsed){(typeof setPhoneRightCollapsed==='function'?setPhoneRightCollapsed:function(){})(false);try{localStorage.setItem('c360-phone-right-collapsed-'+collab.id,'0');}catch{}}
                  if(_T.smsCache){const k='sms_'+phoneMatchKey(conv.clientPhone||'');delete _T.smsCache[k];}
                  setPhoneRightAccordion(p=>({...p,_smsR:Date.now()}));
                  if(conv.unreadCount>0){
                    api('/api/conversations/'+conv.id+'/read',{method:'PUT'}).catch(()=>{});
                    setAppConversations(prev=>prev.map(c=>c.id===conv.id?{...c,unreadCount:0}:c));
                  }
                  _T.smsHubLastUnknownConvId = isKnown ? null : conv.id;
                }} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 12px',cursor:'pointer',background:isActive?T.accentBg:'transparent',borderLeft:isActive?'3px solid '+T.accent:'3px solid transparent',transition:'background .1s',overflow:'hidden',minWidth:0,position:'relative'}}>
                  {/* ── 1. Avatar fixe gauche ── */}
                  <div title={tagLabel} style={{width:28,height:28,borderRadius:14,background:isKnown?(hasUnread?'#0EA5E9':'#0EA5E915'):'#EF444412',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,position:'relative'}}>
                    <I n={isKnown?'message-circle':'help-circle'} s={12} style={{color:isKnown?(hasUnread?'#fff':'#0EA5E9'):'#EF4444'}}/>
                    <span title={tagLabel} style={{position:'absolute',bottom:-1,right:-1,width:8,height:8,borderRadius:4,background:tagColor,border:'1.5px solid '+T.surface}}/>
                  </div>
                  {/* ── 2. Texte flex centre (ellipsis) ── */}
                  <div style={{flex:1,minWidth:0,overflow:'hidden'}}>
                    <div title={isKnown?undefined:'Numéro inconnu'} style={{fontSize:12,fontWeight:hasUnread?700:500,color:isKnown?(hasUnread?T.text:T.text2):T.text2,fontStyle:isKnown?'normal':'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>
                    <div style={{fontSize:10,color:T.text3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{conv.lastEventPreview||''}</div>
                  </div>
                  {/* ── 3. Méta droite : date + unread (toujours) ── */}
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,flexShrink:0,minWidth:28}}>
                    <span style={{fontSize:9,color:T.text3,whiteSpace:'nowrap'}}>{timeStr}</span>
                    {hasUnread&&<span style={{fontSize:8,fontWeight:800,color:'#fff',background:'#EF4444',borderRadius:8,padding:'1px 5px',minWidth:14,textAlign:'center'}}>{conv.unreadCount}</span>}
                  </div>
                  {/* ── 4. CTA "+" icon-only — visible si inconnu (ou hover) ── */}
                  {!isKnown && (
                    <div onClick={(e)=>{
                      e.stopPropagation();
                      const norm = normalizePhoneNumber(conv.clientPhone||'');
                      setPhoneQuickAddPhone(norm || conv.clientPhone || '');
                      setPhoneQuickAddName('');
                      setPhoneQuickAddFirstname('');
                      setPhoneQuickAddLastname('');
                      setPhoneQuickAddEmail('');
                      setPhoneQuickAddCompany('');
                      setPhoneQuickAddType('btc');
                      setPhoneQuickAddStage('nouveau');
                      _T.smsHubLastUnknownConvId = conv.id;
                      _T.smsHubLastUnknownPhone = norm || conv.clientPhone || '';
                    }} title="Créer la fiche" style={{flexShrink:0,width:22,height:22,borderRadius:6,background:'#22C55E',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:'0 1px 3px rgba(34,197,94,0.4)'}}>
                      <I n="plus" s={13} style={{color:'#fff'}}/>
                    </div>
                  )}
                </div>;
              })}
            </div>
          </div>;
        })()}

        {/* Calls list */}
        <div style={{flex:1,overflow:'auto'}}>
          {(()=>{
            const calls = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).slice(0,100);
            const search = ((typeof convSearch!=='undefined'?convSearch:null)||'').toLowerCase();
            const timeAgo = (d) => {
              if(!d) return '';
              const diff = Date.now()-new Date(d).getTime();
              if(diff<60000) return "a l'instant";
              if(diff<3600000) return Math.floor(diff/60000)+' min';
              if(diff<86400000) return Math.floor(diff/3600000)+'h';
              const dt=new Date(d);
              const today=new Date();
              if(dt.toDateString()===today.toDateString()) return dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
              if(dt.toDateString()===new Date(today-86400000).toDateString()) return 'Hier';
              return dt.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
            };
            const filtered = calls.filter(cl=>{
              if(!search) return true;
              const num = cl.direction==='outbound'?cl.toNumber:cl.fromNumber;
              let ct = cl.contactId ? (contacts||[]).find(c=>c.id===cl.contactId) : null;
              if(!ct){const ph=(num||'').replace(/[^\d]/g,'').slice(-9);if(ph.length>=9)ct=(contacts||[]).find(c=>{const cp=(c.phone||'').replace(/[^\d]/g,'').slice(-9);return cp&&cp===ph;});}
              return (ct?.name||'').toLowerCase().includes(search) || (num||'').includes(search);
            });
            if(filtered.length===0) return <div style={{textAlign:'center',padding:'30px 16px',color:T.text3}}><I n="phone-off" s={28} style={{color:T.border,display:'block',margin:'0 auto 8px'}}/><div style={{fontSize:12,fontWeight:600}}>Aucun appel</div></div>;
            return filtered.map(cl=>{
              const num = cl.direction==='outbound'?cl.toNumber:cl.fromNumber;
              let ct = cl.contactId ? (contacts||[]).find(c=>c.id===cl.contactId) : null;
              if(!ct){const ph=(num||'').replace(/[^\d]/g,'').slice(-9);if(ph.length>=9)ct=(contacts||[]).find(c=>{const cp=(c.phone||'').replace(/[^\d]/g,'').slice(-9);return cp&&cp===ph;});}
              const isMissed = cl.status==='missed'||cl.status==='no-answer';
              const isOut = cl.direction==='outbound';
              const dirIcon = isMissed?'phone-missed':isOut?'phone-outgoing':'phone-incoming';
              const dirColor = isMissed?'#EF4444':isOut?'#3B82F6':'#22C55E';
              const displayName = ct?.name || fmtPhone(num) || 'Inconnu';
              return (
                <div key={cl.id} onClick={()=>openCallDetail(cl.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',cursor:'pointer',borderBottom:'1px solid '+T.border+'20',transition:'background .1s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{width:32,height:32,borderRadius:10,background:dirColor+'12',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {ct ? <span style={{fontWeight:700,fontSize:12,color:dirColor}}>{(ct.name||'?')[0].toUpperCase()}</span> : <I n={dirIcon} s={14} style={{color:dirColor}}/>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:12,color:isMissed?'#EF4444':T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{displayName}</div>
                    {ct && <div style={{fontSize:10,color:T.text3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fmtPhone(num)}</div>}
                    <div style={{fontSize:10,color:T.text3,display:'flex',alignItems:'center',gap:4}}>
                      <I n={dirIcon} s={9} style={{color:dirColor}}/>
                      <span>{isOut?'Sortant':'Entrant'}</span>
                      {cl.duration>0 && <span>&middot; {fmtDur(cl.duration)}</span>}
                      {isMissed && <span style={{color:'#EF4444',fontWeight:600}}>Manque</span>}
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                    <div style={{fontSize:10,color:T.text3,fontWeight:500,marginRight:4}}>{timeAgo(cl.createdAt)}</div>
                    <div onClick={(e)=>{e.stopPropagation();startPhoneCall(num,ct?.id||null);}} style={{width:26,height:26,borderRadius:7,background:'#22C55E12',border:'1px solid #22C55E25',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .12s'}} onMouseEnter={e=>e.currentTarget.style.background='#22C55E25'} onMouseLeave={e=>e.currentTarget.style.background='#22C55E12'} title="Appeler"><I n="phone" s={11} style={{color:'#22C55E'}}/></div>
                    {!ct && <div onClick={(e)=>{e.stopPropagation();setPhoneQuickAddPhone(num);setPhoneQuickAddName('');}} style={{width:26,height:26,borderRadius:7,background:'#3B82F612',border:'1px solid #3B82F625',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .12s'}} onMouseEnter={e=>e.currentTarget.style.background='#3B82F625'} onMouseLeave={e=>e.currentTarget.style.background='#3B82F612'} title="Creer fiche contact"><I n="user-plus" s={11} style={{color:'#3B82F6'}}/></div>}
                  </div>
                </div>
              );
            });
          })()}
        </div>

        {/* Footer */}
        <div style={{padding:'8px 14px',borderTop:'1px solid '+T.border,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <span style={{fontSize:10,color:T.text3}}>{((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).length} appel{((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).length!==1?'s':''}</span>
          <div style={{display:'flex',gap:6}}>
            <div onClick={()=>{api(`/api/voip/calls?companyId=${company.id}`).then(d=>{if(Array.isArray(d))setVoipCallLogs(d);});}} style={{width:24,height:24,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:'1px solid '+T.border}} title="Actualiser"><I n="refresh-cw" s={11} style={{color:T.text3}}/></div>
            <div onClick={()=>setPhoneSubTab('contacts')} style={{width:24,height:24,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'linear-gradient(135deg,#2563EB,#3B82F6)',boxShadow:'0 2px 6px rgba(37,99,235,0.25)'}} title="Contacts"><I n="users" s={11} style={{color:'#fff'}}/></div>
          </div>
        </div>
      </div>
    </>
    )}
    </div>

    {/* ═══════════════════════════════════════════════════════ */}
    {/* CENTER COLUMN                                          */}
    {/* ═══════════════════════════════════════════════════════ */}
{/* CENTER — Contenu principal */}
<div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:T.bg}}>

  {/* ═══════════════════════════════════════════════════════════════════
      BANDEAU APPEL ACTIF (compact — controls sur le clavier)
      ═══════════════════════════════════════════════════════════════════ */}
  {(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (()=>{
    const callContact = (typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).contactId ? (contacts||[]).find(c=>c.id===(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).contactId) : null;
    const callName = callContact?.name || fmtPhone((typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).number) || 'Numero masque';
    const callNumber = fmtPhone((typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).number);
    const statusColor = (typeof voipState!=='undefined'?voipState:null)==='connecting'?'#F59E0B':(typeof voipState!=='undefined'?voipState:null)==='ringing'?'#3B82F6':(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).onHold?'#F59E0B':'#22C55E';
    const statusLabel = (typeof voipState!=='undefined'?voipState:null)==='connecting'?'Connexion...':(typeof voipState!=='undefined'?voipState:null)==='ringing'?'Ca sonne...':(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).onHold?'En attente':'En cours';
    return <div style={{padding:'10px 16px',background:'linear-gradient(135deg,#0F172A,#1E293B)',borderBottom:'1px solid rgba(255,255,255,0.1)',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
      <span style={{width:8,height:8,borderRadius:4,background:statusColor,animation:'pulse 1.5s infinite',flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
<div style={{fontSize:13,fontWeight:700,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{callName}</div>
<div style={{fontSize:10,color:'#ffffff60'}}>{callNumber} · {statusLabel} · {String(Math.floor((typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)/60)).padStart(2,'0')+':'+String((typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)%60).padStart(2,'0')}</div>
      </div>
      {(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null) && <div onClick={togglePhoneLeftPanel} style={{padding:'4px 10px',borderRadius:6,background:'rgba(255,255,255,0.1)',cursor:'pointer',fontSize:10,fontWeight:700,color:'#ffffffcc',display:'flex',alignItems:'center',gap:4}}><I n="phone" s={11}/> Clavier</div>}
      <div onClick={endPhoneCall} style={{padding:'4px 10px',borderRadius:6,background:'linear-gradient(135deg,#EF4444,#DC2626)',cursor:'pointer',fontSize:10,fontWeight:700,color:'#fff',display:'flex',alignItems:'center',gap:4,boxShadow:'0 2px 8px rgba(239,68,68,0.3)'}}><I n="phone-off" s={11}/> Raccrocher</div>
    </div>;
  })()}

  {/* ═══════════════════════════════════════════════════════════════════
     CONVERSATION THREAD / DEFAULT CONTENT
     ═══════════════════════════════════════════════════════════════════ */}
  {(typeof selConvId!=='undefined'?selConvId:null) ? (()=>{
    const convs = (typeof appConversations!=='undefined'?appConversations:null) || [];

    const loadEvents = (convId) => {
      setSelConvId(convId);
      setConvLoading(true);
      api('/api/conversations/'+convId+'/events').then(d => {
if (Array.isArray(d)) setConvEvents(d);
setConvLoading(false);
      }).catch(() => setConvLoading(false));
      // Mark as read automatiquement
      api('/api/conversations/'+convId+'/read', { method: 'PUT' }).then(() => {
setAppConversations(prev => prev.map(c => c.id === convId ? { ...c, unreadCount: 0 } : c));
      }).catch(() => {});
    };

    const refreshConversations = () => {
      api('/api/conversations?companyId='+company.id).then(d => {
if (Array.isArray(d)) setAppConversations(d);
      }).catch(()=>{});
    };

    // ── Polling conversations 15s (actif quand panneau conversations visible) ──
    if (!_T.convPollInterval && portalTab === 'phone') {
      _T.convPollLastTs = _T.convPollLastTs || new Date().toISOString();
      _T.convPollInterval = setInterval(() => {
api('/api/conversations/poll?companyId=' + company.id + '&since=' + encodeURIComponent(_T.convPollLastTs || new Date(Date.now() - 30000).toISOString())).then(d => {
if (d?.conversations?.length > 0) {
  _T.convPollLastTs = new Date().toISOString();
  setAppConversations(prev => {
    const updated = [...prev];
    for (const nc of d.conversations) {
      const idx = updated.findIndex(c => c.id === nc.id);
      if (idx >= 0) updated[idx] = nc; else updated.unshift(nc);
    }
    return updated.sort((a, b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || ''));
  });
  // Notif sonore si nouveau SMS inbound
  const hasInbound = d.conversations.some(c => c.lastEventType === 'sms_in' && c.unreadCount > 0);
  if (hasInbound) showNotif('Nouveau SMS recu !', 'info');
}
}).catch(() => {});
      }, 15000);
    }
    // Cleanup polling quand on quitte l'onglet phone
    if (portalTab !== 'phone' && _T.convPollInterval) {
      clearInterval(_T.convPollInterval);
      _T.convPollInterval = null;
    }

    const sendNote = () => {
      if (!(typeof convNoteText!=='undefined'?convNoteText:{}).trim() || !(typeof selConvId!=='undefined'?selConvId:null)) return;
      api('/api/conversations/'+(typeof selConvId!=='undefined'?selConvId:null)+'/notes', { method:'POST', body:{ content: (typeof convNoteText!=='undefined'?convNoteText:null) } })
.then(d => {
if (d?.success) {
  setConvNoteText('');
  loadEvents((typeof selConvId!=='undefined'?selConvId:null));
  refreshConversations();
}
});
    };

    const sendConvSms = () => {
      if (!(typeof convSmsText!=='undefined'?convSmsText:{}).trim() || !(typeof selConvId!=='undefined'?selConvId:null)) return;
      api('/api/conversations/'+(typeof selConvId!=='undefined'?selConvId:null)+'/sms', { method:'POST', body:{ content: (typeof convSmsText!=='undefined'?convSmsText:null) } })
.then(d => {
if (d?.success) {
  setConvSmsText('');
  loadEvents((typeof selConvId!=='undefined'?selConvId:null));
  refreshConversations();
  showNotif('SMS envoye' + (d.provider === 'twilio' ? ' via Twilio' : ''), 'success');
} else {
  showNotif(d?.error || 'Erreur envoi SMS','danger');
}
});
    };

    const timeAgo = (d) => {
      if (!d) return '';
      const now = Date.now();
      const diff = now - new Date(d).getTime();
      if (diff < 60000) return "a l'instant";
      if (diff < 3600000) return Math.floor(diff/60000) + ' min';
      if (diff < 86400000) return Math.floor(diff/3600000) + 'h';
      const dt = new Date(d);
      const today = new Date();
      if (dt.toDateString() === today.toDateString()) return dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
      if (dt.toDateString() === new Date(today - 86400000).toDateString()) return 'Hier';
      return dt.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
    };

    const selectedConv = convs.find(c => c.id === (typeof selConvId!=='undefined'?selConvId:null));
    // V1.10.2 — Match unifié + cross-collab scope (assignedTo / sharedWithId / shared_with_json)
    const _isAdmin = (typeof isAdminView!=='undefined' && isAdminView) || collab?.role==='admin' || collab?.role==='supra';
    let selectedContact = selectedConv?.contactId ? contacts.find(c => c.id === selectedConv.contactId) : null;
    if (!selectedContact && selectedConv?.clientPhone) {
      selectedContact = matchContactByPhone(contacts, selectedConv.clientPhone, { collabId: collab.id, companyId: company.id, isAdmin: _isAdmin });
    }
    const isUnknownContact = !selectedContact;
    const displayName = selectedContact?.name || fmtPhone(selectedConv?.clientPhone) || 'Numéro inconnu';
    const displayInitials = selectedContact?.name
      ? selectedContact.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)
      : '?';

    return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>

      {/* ── Thread Header ── */}
      <div style={{padding:'12px 20px',borderBottom:'1px solid '+T.border,background:T.surface,display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
{/* Back button */}
<div onClick={()=>setSelConvId(null)} style={{width:32,height:32,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:'1px solid '+T.border,transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background=T.bg}>
<I n="arrow-left" s={15} style={{color:T.text2}}/>
</div>

{/* Contact avatar — V1.10.2 : "?" rouge si inconnu */}
<div style={{width:40,height:40,borderRadius:20,background:isUnknownContact?'#EF444415':T.accentBg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,border:isUnknownContact?'1.5px dashed #EF444450':'none'}}>
<span style={{fontWeight:700,fontSize:15,color:isUnknownContact?'#EF4444':T.accent}}>{isUnknownContact?'?':displayInitials}</span>
</div>

{/* Contact info — V1.10.2 : label "Contact non enregistré" si inconnu */}
<div style={{flex:1,minWidth:0,overflow:'hidden'}}>
<div style={{fontWeight:700,fontSize:14,color:isUnknownContact?T.text2:T.text,fontStyle:isUnknownContact?'italic':'normal',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{displayName}</div>
<div style={{fontSize:11,color:T.text3,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',minWidth:0}}>
  <span onClick={()=>{if(selectedConv?.clientPhone) setPhoneDialNumber(selectedConv.clientPhone);}} style={{color:T.accent,cursor:'pointer',borderRadius:3,padding:'0 2px',transition:'background .12s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background='transparent'} title="Afficher sur le clavier">{fmtPhone(selectedConv?.clientPhone)}</span>
  {isUnknownContact ? (
    <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:10,fontWeight:700,color:'#EF4444',background:'#EF444412',border:'1px solid #EF444430',borderRadius:6,padding:'1px 6px'}}>
      <I n="alert-circle" s={10} style={{color:'#EF4444'}}/> Contact non enregistré
    </span>
  ) : (
    selectedContact?.company && <span>&middot; {selectedContact.company}</span>
  )}
</div>
</div>

{/* V1.10.2 — Action buttons : 5 actions rapides + CTA Créer fiche si inconnu */}
<div style={{display:'flex',gap:6,flexShrink:0,alignItems:'center'}}>
{isUnknownContact ? (
  <div onClick={()=>{
    const norm = normalizePhoneNumber(selectedConv?.clientPhone||'');
    setPhoneQuickAddPhone(norm || selectedConv?.clientPhone || '');
    setPhoneQuickAddName('');
    setPhoneQuickAddFirstname('');
    setPhoneQuickAddLastname('');
    setPhoneQuickAddEmail('');
    setPhoneQuickAddCompany('');
    setPhoneQuickAddType('btc');
    setPhoneQuickAddStage('nouveau');
    _T.smsHubLastUnknownConvId = selectedConv?.id || null;
    _T.smsHubLastUnknownPhone = norm || selectedConv?.clientPhone || '';
  }} style={{padding:'8px 14px',borderRadius:10,background:'linear-gradient(135deg,#22C55E,#16A34A)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:6,boxShadow:'0 2px 8px rgba(34,197,94,0.3)'}} title="Créer la fiche contact">
    <I n="user-plus" s={14} style={{color:'#fff'}}/> Créer la fiche
  </div>
) : (<>
  <div onClick={()=>{if(selectedConv?.clientPhone) prefillKeypad(selectedConv.clientPhone);}} style={{width:34,height:34,borderRadius:10,background:'#22C55E15',border:'1px solid #22C55E30',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>{e.currentTarget.style.background='#22C55E25';}} onMouseLeave={e=>{e.currentTarget.style.background='#22C55E15';}} title="Appeler">
    <I n="phone" s={15} style={{color:'#22C55E'}}/>
  </div>
  <div onClick={()=>{
    const smsInput = document.querySelector('[data-conv-sms-input]');
    if(smsInput) smsInput.focus();
  }} style={{width:34,height:34,borderRadius:10,background:'#2563EB15',border:'1px solid #2563EB30',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>{e.currentTarget.style.background='#2563EB25';}} onMouseLeave={e=>{e.currentTarget.style.background='#2563EB15';}} title="SMS">
    <I n="message-square" s={15} style={{color:'#2563EB'}}/>
  </div>
  {/* V1.10.2 — Créer RDV pour le contact lié */}
  <div onClick={()=>{
    if (!selectedContact) return;
    if (typeof setPipelineRdvForm === 'function') {
      setPipelineRdvForm({ contactId: selectedContact.id, contactName: selectedContact.name, phone: selectedConv?.clientPhone||'', source: 'sms-hub' });
    } else {
      // Fallback : ouvre fiche dans CRM en mode RDV
      setSelectedCrmContact && setSelectedCrmContact(selectedContact);
      setCollabFicheTab && setCollabFicheTab('rdv');
    }
  }} style={{width:34,height:34,borderRadius:10,background:'#7C3AED15',border:'1px solid #7C3AED30',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>{e.currentTarget.style.background='#7C3AED25';}} onMouseLeave={e=>{e.currentTarget.style.background='#7C3AED15';}} title="Créer un RDV">
    <I n="calendar-plus" s={15} style={{color:'#7C3AED'}}/>
  </div>
  {/* V1.10.2 — Voir / déplacer dans le pipeline */}
  <div onClick={()=>{
    if (!selectedContact) return;
    setPipelineRightContact && setPipelineRightContact(selectedContact);
    if (typeof setPhoneSubTab === 'function') setPhoneSubTab('pipeline');
  }} style={{width:34,height:34,borderRadius:10,background:'#F59E0B15',border:'1px solid #F59E0B30',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>{e.currentTarget.style.background='#F59E0B25';}} onMouseLeave={e=>{e.currentTarget.style.background='#F59E0B15';}} title="Pipeline">
    <I n="kanban" s={15} style={{color:'#F59E0B'}}/>
  </div>
  {/* V1.10.2 — Ajouter une note (focus champ note conv) */}
  <div onClick={()=>{
    const noteInput = document.querySelector('[data-conv-note-input]');
    if (noteInput) { noteInput.focus(); return; }
    // Fallback : ouvre fiche en mode notes
    if (selectedContact) {
      setSelectedCrmContact && setSelectedCrmContact(selectedContact);
      setCollabFicheTab && setCollabFicheTab('notes');
    }
  }} style={{width:34,height:34,borderRadius:10,background:'#EC489915',border:'1px solid #EC489930',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>{e.currentTarget.style.background='#EC489925';}} onMouseLeave={e=>{e.currentTarget.style.background='#EC489915';}} title="Ajouter une note">
    <I n="edit-3" s={15} style={{color:'#EC4899'}}/>
  </div>
</>)}
</div>
      </div>

      {/* ── Events List (scrollable) ── */}
      <div style={{flex:1,overflow:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:12}}>
{(typeof convLoading!=='undefined'?convLoading:null) && (
<div style={{textAlign:'center',padding:40,color:T.text3}}>
  <div style={{width:24,height:24,border:'3px solid '+T.border,borderTopColor:T.accent,borderRadius:'50%',animation:'spin .6s linear infinite',margin:'0 auto 12px'}}/>
  <div style={{fontSize:13}}>Chargement...</div>
</div>
)}

{!(typeof convLoading!=='undefined'?convLoading:null) && (typeof convEvents!=='undefined'?convEvents:{}).length === 0 && (
<div style={{textAlign:'center',padding:40,color:T.text3}}>
  <I n="inbox" s={40} style={{color:T.border,marginBottom:12}}/>
  <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>Aucun evenement</div>
  <div style={{fontSize:12}}>Cette conversation est vide pour le moment</div>
</div>
)}

{(typeof convEvents!=='undefined'?convEvents:{}).map(ev => {
const isCall = ev.type?.startsWith('call');
const isSms = ev.type?.startsWith('sms');
const isNote = ev.type === 'note';
const isMissed = ev.type === 'call_missed';
const isOutbound = ev.type === 'call_outbound' || ev.type === 'sms_out';
const evTime = ev.createdAt ? new Date(ev.createdAt).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
const durStr = ev.duration ? Math.floor(ev.duration/60)+':'+String(ev.duration%60).padStart(2,'0') : '';

/* ── Call event cards ── */
if (isCall) {
  const durLong = ev.duration ? Math.floor(ev.duration/60)+'min '+String(ev.duration%60).padStart(2,'0')+'sec' : '';
  const accentColor = isMissed ? '#EF4444' : isOutbound ? '#2563EB' : '#22C55E';
  const bgColor = isMissed ? '#FEF2F2' : isOutbound ? '#EFF6FF' : '#F0FDF4';
  const borderColor = isMissed ? '#FECACA' : isOutbound ? '#BFDBFE' : '#BBF7D0';
  const hasExtras = ev.recordingUrl || ev.aiSummary || ev.callNotes || ev.actionItems?.length > 0 || ev.aiTags?.length > 0 || (ev.sentimentScore != null) || isMissed;

  /* ── Compact single-line for simple calls ── */
  if (!hasExtras) {
    return (
      <div key={ev.id} onClick={()=>{if(selectedConv?.clientPhone) setPhoneDialNumber(selectedConv.clientPhone);}} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 16px',borderRadius:10,background:bgColor,border:'1px solid '+borderColor,cursor:'pointer',transition:'all .12s'}} onMouseEnter={e=>e.currentTarget.style.opacity='0.85'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
        <I n={isOutbound?'phone-outgoing':'phone-incoming'} s={13} style={{color:accentColor,flexShrink:0}}/>
        <span style={{fontSize:12,fontWeight:600,color:T.text}}>{isOutbound?'Sortant':'Entrant'}</span>
        {durLong && <span style={{fontSize:11,color:T.text3}}>{durLong}</span>}
        {ev.collaboratorName && <span style={{fontSize:11,color:T.text3}}>&middot; {ev.collaboratorName}</span>}
        <span style={{flex:1}}/>
        <span style={{fontSize:11,color:T.text3}}>{evTime}</span>
      </div>
    );
  }

  return (
    <div key={ev.id} style={{borderRadius:16,background:bgColor,border:'1px solid '+borderColor,overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:34,height:34,borderRadius:17,background:accentColor,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <I n={isMissed?'phone-missed':isOutbound?'phone-outgoing':'phone-incoming'} s={15} style={{color:'#fff'}}/>
        </div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14,color:isMissed?'#DC2626':T.text}}>
            {isMissed ? 'Appel manque' : isOutbound ? 'Appel sortant' : 'Appel entrant'}
          </div>
          <div style={{fontSize:11,color:T.text3,display:'flex',alignItems:'center',gap:6,marginTop:1}}>
            {ev.businessPhone && <span>{ev.businessPhone}</span>}
            {durLong && <span>&middot; {durLong}</span>}
            {ev.collaboratorName && <span>&middot; {ev.collaboratorName}</span>}
          </div>
        </div>
        <span style={{fontSize:11,color:T.text3,flexShrink:0}}>{evTime}</span>
      </div>

      {/* Recording player */}
      {ev.recordingUrl && (
        <div style={{padding:'0 16px 12px'}}>
          <div style={{padding:10,borderRadius:10,background:'rgba(0,0,0,0.04)',display:'flex',alignItems:'center',gap:8}}>
            <audio controls preload="none" src={ev.callLogId ? recUrl(ev.callLogId) : ev.recordingUrl} style={{flex:1,height:36}}/>
          </div>
        </div>
      )}

      {/* AI Summary */}
      {ev.aiSummary && (
        <div style={{padding:'0 16px 12px'}}>
          <div style={{padding:12,borderRadius:12,background:T.surface,border:'1px solid '+T.border}}>
            <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
              <I n="cpu" s={12} style={{color:'#7C3AED'}}/>
              <span style={{fontSize:10,fontWeight:700,color:'#7C3AED'}}>Resume IA</span>
            </div>
            <div style={{fontSize:12,color:T.text2,lineHeight:1.6}}>{ev.aiSummary}</div>
          </div>
        </div>
      )}

      {/* Scores */}
      {(ev.sentimentScore != null || ev.qualityScore != null || ev.conversionScore != null) && (
        <div style={{padding:'0 16px 10px',display:'flex',gap:8,flexWrap:'wrap'}}>
          {ev.sentimentScore != null && (
            <div style={{padding:'4px 10px',borderRadius:8,background:ev.sentimentScore>=60?'#22C55E15':ev.sentimentScore>=40?'#F59E0B15':'#EF444415',fontSize:11,fontWeight:600,color:ev.sentimentScore>=60?'#22C55E':ev.sentimentScore>=40?'#F59E0B':'#EF4444',display:'flex',alignItems:'center',gap:3}}>
              <I n={ev.sentimentScore>=60?'smile':ev.sentimentScore>=40?'meh':'frown'} s={12}/> Sentiment {ev.sentimentScore}%
            </div>
          )}
          {ev.qualityScore != null && (
            <div style={{padding:'4px 10px',borderRadius:8,background:'#7C3AED12',fontSize:11,fontWeight:600,color:'#7C3AED',display:'flex',alignItems:'center',gap:3}}>
              <I n="star" s={12}/> Qualite {ev.qualityScore}%
            </div>
          )}
          {ev.conversionScore != null && (
            <div style={{padding:'4px 10px',borderRadius:8,background:'#2563EB12',fontSize:11,fontWeight:600,color:'#2563EB',display:'flex',alignItems:'center',gap:3}}>
              <I n="target" s={12}/> Conversion {ev.conversionScore}%
            </div>
          )}
        </div>
      )}

      {/* AI Tags */}
      {ev.aiTags?.length > 0 && (
        <div style={{padding:'0 16px 10px',display:'flex',gap:4,flexWrap:'wrap'}}>
          {ev.aiTags.map((tag,ti)=><span key={ti} style={{fontSize:10,padding:'2px 8px',borderRadius:6,background:accentColor+'12',color:accentColor,fontWeight:600}}>#{tag}</span>)}
        </div>
      )}

      {/* Action items */}
      {ev.actionItems?.length > 0 && (
        <div style={{padding:'0 16px 12px'}}>
          <div style={{padding:10,borderRadius:10,background:'#F0FDF4',border:'1px solid #BBF7D0'}}>
            <div style={{fontSize:11,fontWeight:700,color:'#166534',marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="check-square" s={12}/> Prochaines etapes</div>
            {ev.actionItems.map((item,ai)=>(
              <div key={ai} style={{fontSize:12,color:'#166534',padding:'3px 0',display:'flex',alignItems:'flex-start',gap:6}}>
                <span style={{width:16,height:16,borderRadius:4,border:'1.5px solid #22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}/>
                <span>{typeof item === 'string' ? item : item.action || item.text || JSON.stringify(item)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Follow-up suggestion */}
      {ev.followupType && ev.followupType !== 'none' && (
        <div style={{padding:'0 16px 10px'}}>
          <div style={{padding:'6px 10px',borderRadius:8,background:'#FEF3C7',border:'1px solid #FDE68A',fontSize:11,color:'#92400E',display:'flex',alignItems:'center',gap:6}}>
            <I n={ev.followupType==='call'?'phone':ev.followupType==='email'?'mail':ev.followupType==='sms'?'message-square':'calendar'} s={12}/>
            <span style={{fontWeight:600}}>Relance suggeree :</span> {ev.followupType==='call'?'Rappeler':ev.followupType==='email'?'Envoyer un email':ev.followupType==='sms'?'Envoyer un SMS':'Planifier un RDV'}
            {ev.followupDate && <span> &middot; {new Date(ev.followupDate).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</span>}
          </div>
        </div>
      )}

      {/* Call notes */}
      {ev.callNotes && (
        <div style={{padding:'0 16px 12px',fontSize:12,color:T.text2,display:'flex',alignItems:'flex-start',gap:6}}>
          <I n="edit-3" s={12} style={{flexShrink:0,marginTop:2}}/> <span>{ev.callNotes}</span>
        </div>
      )}

      {/* Missed call: callback prompt */}
      {isMissed && (
        <div style={{padding:'0 16px 12px'}}>
          <div onClick={()=>{if(selectedConv?.clientPhone) prefillKeypad(selectedConv.clientPhone);}} style={{padding:'8px 14px',borderRadius:10,background:'#EF4444',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,transition:'opacity .15s'}} onMouseEnter={e=>e.currentTarget.style.opacity='0.9'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            <I n="phone" s={14}/> Rappeler maintenant
          </div>
        </div>
      )}
    </div>
  );
}

/* ── SMS bubbles ── */
if (isSms) return (
  <div key={ev.id} style={{display:'flex',justifyContent:isOutbound?'flex-end':'flex-start'}}>
    <div style={{
      maxWidth:'75%',padding:'10px 14px',
      borderRadius: isOutbound ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
      background: isOutbound ? 'linear-gradient(135deg,#2563EB,#3B82F6)' : T.card || '#fff',
      color: isOutbound ? '#fff' : T.text,
      boxShadow:'0 1px 4px rgba(0,0,0,0.08)',
      border: isOutbound ? 'none' : '1px solid '+T.border,
    }}>
      <div style={{fontSize:13,lineHeight:1.5}}>{ev.content}</div>
      <div style={{fontSize:10,color:isOutbound?'#ffffffaa':T.text3,marginTop:4,textAlign:'right',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4}}>
        {evTime}
        {isOutbound && <I n="check-check" s={10}/>}
      </div>
    </div>
  </div>
);

/* ── Note cards ── */
if (isNote) return (
  <div key={ev.id} style={{display:'flex',justifyContent:'center'}}>
    <div style={{padding:'10px 18px',borderRadius:12,background:'#FEF3C7',border:'1px solid #FDE68A',maxWidth:'80%',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
      <div style={{fontSize:11,fontWeight:700,color:'#92400E',display:'flex',alignItems:'center',gap:4,marginBottom:3}}><I n="edit-3" s={11}/> Note</div>
      <div style={{fontSize:12,color:'#78350F',lineHeight:1.5}}>{ev.content}</div>
      <div style={{fontSize:10,color:'#A16207',marginTop:4}}>{evTime}</div>
    </div>
  </div>
);

/* ── Fallback ── */
return <div key={ev.id} style={{fontSize:11,color:T.text3,textAlign:'center',padding:4}}>{ev.type} — {evTime}</div>;
})}
      </div>

      {/* ── Compose Bar ── */}
      <div style={{padding:'12px 16px',borderTop:'1px solid '+T.border,background:T.surface,flexShrink:0}}>
{/* SMS row */}
<div style={{display:'flex',gap:8}}>
<input data-conv-sms-input="1" value={convSmsText} onChange={e=>(typeof setConvSmsText==='function'?setConvSmsText:function(){})(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendConvSms();}}} placeholder="Ecrire un SMS..." style={{flex:1,padding:'9px 12px',borderRadius:10,border:'1.5px solid '+T.border,background:T.bg,fontSize:13,fontFamily:'inherit',color:T.text,outline:'none'}}/>
<div onClick={sendConvSms} style={{width:38,height:38,borderRadius:10,background:(typeof convSmsText!=='undefined'?convSmsText:{}).trim()?'linear-gradient(135deg,#2563EB,#3B82F6)':T.bg,display:'flex',alignItems:'center',justifyContent:'center',cursor:(typeof convSmsText!=='undefined'?convSmsText:{}).trim()?'pointer':'default',transition:'all .2s',border:(typeof convSmsText!=='undefined'?convSmsText:{}).trim()?'none':'1px solid '+T.border}}>
  <I n="send" s={15} style={{color:(typeof convSmsText!=='undefined'?convSmsText:{}).trim()?'#fff':T.text3}}/>
</div>
</div>
{/* Note row */}
<div style={{display:'flex',gap:6,marginTop:8}}>
<input value={convNoteText} onChange={e=>(typeof setConvNoteText==='function'?setConvNoteText:function(){})(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendNote();}}} placeholder="Ajouter une note..." style={{flex:1,padding:'7px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,fontSize:12,fontFamily:'inherit',color:T.text,outline:'none'}}/>
<div onClick={sendNote} style={{padding:'6px 12px',borderRadius:8,background:(typeof convNoteText!=='undefined'?convNoteText:{}).trim()?'#F59E0B':T.bg,color:(typeof convNoteText!=='undefined'?convNoteText:{}).trim()?'#fff':T.text3,fontSize:12,fontWeight:600,cursor:(typeof convNoteText!=='undefined'?convNoteText:{}).trim()?'pointer':'default',display:'flex',alignItems:'center',gap:4,border:(typeof convNoteText!=='undefined'?convNoteText:{}).trim()?'none':'1px solid '+T.border,transition:'all .2s'}}>
  <I n="edit-3" s={12}/> Note
</div>
</div>
      </div>
    </div>
    );
  })()

  /* ═══════════════════════════════════════════════════════════════════
     MODE 3 — ACCUEIL (recents + campagnes) — le clavier est a gauche
     ═══════════════════════════════════════════════════════════════════ */
  : (()=>{
    const recentCalls = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).slice(0,15);

    const timeAgo = (d) => {
      if (!d) return '';
      const now = Date.now();
      const diff = now - new Date(d).getTime();
      if (diff < 60000) return "a l'instant";
      if (diff < 3600000) return Math.floor(diff/60000) + ' min';
      if (diff < 86400000) return Math.floor(diff/3600000) + 'h';
      const dt = new Date(d);
      const today = new Date();
      if (dt.toDateString() === today.toDateString()) return dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
      if (dt.toDateString() === new Date(today - 86400000).toDateString()) return 'Hier';
      return dt.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
    };

    /* ── Inline sub-tab content identifiers ── */
    const inlineTabs = ['history','contacts','sms','recordings','stats','campaigns','scripts','scheduled','analyses','settings','copilot','secure','pipeline','calendrier','contact-detail'];
    const showInline = inlineTabs.includes((typeof phoneSubTab!=='undefined'?phoneSubTab:null));

    return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'auto'}}>

      {/* ── DEFAULT VIEW: Recent Calls + Campaigns ── */}
      {!showInline && (<>
{recentCalls.length > 0 && (
<div style={{padding:'16px 24px'}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <I n="clock" s={13} style={{color:T.text3}}/>
      <span style={{fontSize:12,fontWeight:700,color:T.text2}}>Appels recents</span>
    </div>
    <span style={{fontSize:11,color:T.text3}}>{recentCalls.length} dernier{recentCalls.length>1?'s':''}</span>
  </div>
  <div style={{display:'flex',flexDirection:'column',gap:4}}>
    {recentCalls.map(cl=>{
      let ct = cl.contactId ? (contacts||[]).find(c=>c.id===cl.contactId) : null;
      if(!ct){const ph=((cl.direction==='outbound'?cl.toNumber:cl.fromNumber)||'').replace(/[^\d]/g,'').slice(-9);if(ph.length>=9)ct=(contacts||[]).find(c=>{const cp=(c.phone||c.mobile||'').replace(/[^\d]/g,'').slice(-9);return cp&&cp===ph;});}
      const displayName = ct?.name || fmtPhone(cl.direction==='outbound'?cl.toNumber:cl.fromNumber) || 'Inconnu';
      const isMissed = cl.status==='missed'||cl.status==='no-answer';
      const isOut = cl.direction==='outbound';
      const dirIcon = isMissed ? 'phone-missed' : isOut ? 'phone-outgoing' : 'phone-incoming';
      const dirColor = isMissed ? '#EF4444' : isOut ? '#2563EB' : '#22C55E';
      const callNumber = isOut ? cl.toNumber : cl.fromNumber;

      return (
        <div key={cl.id} onClick={()=>prefillKeypad(callNumber)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:10,background:T.surface,border:'1px solid '+T.border,transition:'background .12s',cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background=T.surface}>
          <div style={{width:30,height:30,borderRadius:15,background:dirColor+'15',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <I n={dirIcon} s={13} style={{color:dirColor}}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:12,color:isMissed?'#EF4444':T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{displayName}</div>
            <div style={{fontSize:10,color:T.text3,display:'flex',alignItems:'center',gap:4}}>
              {cl.duration ? fmtDur(cl.duration) : isMissed ? 'Manque' : '0:00'}
              <span>&middot;</span>
              {timeAgo(cl.createdAt)}
            </div>
          </div>
          <div onClick={()=>{
            if(callNumber) prefillKeypad(callNumber);
          }} style={{width:30,height:30,borderRadius:8,background:'#22C55E15',border:'1px solid #22C55E30',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='#22C55E25'} onMouseLeave={e=>e.currentTarget.style.background='#22C55E15'} title="Rappeler">
            <I n="phone" s={13} style={{color:'#22C55E'}}/>
          </div>
        </div>
      );
    })}
  </div>
</div>
)}

<div style={{padding:'16px 24px',borderTop:recentCalls.length>0?'1px solid '+T.border:'none'}}>
<div onClick={()=>setPhoneSubTab('campaigns')} style={{
  padding:'14px 20px',borderRadius:14,
  background:'linear-gradient(135deg,#F59E0B08,#F9731608)',
  border:'2px solid #F59E0B30',
  cursor:'pointer',display:'flex',alignItems:'center',gap:12,
  transition:'all .2s',
}} onMouseEnter={e=>{e.currentTarget.style.borderColor='#F59E0B';e.currentTarget.style.background='#F59E0B12';}} onMouseLeave={e=>{e.currentTarget.style.borderColor='#F59E0B30';e.currentTarget.style.background='linear-gradient(135deg,#F59E0B08,#F9731608)';}}>
  <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#F59E0B,#F97316)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 10px rgba(245,158,11,0.3)'}}>
    <I n="zap" s={20} style={{color:'#fff'}}/>
  </div>
  <div style={{flex:1}}>
    <div style={{fontWeight:700,fontSize:14,color:T.text}}>Campagnes d'appels</div>
    <div style={{fontSize:11,color:T.text3,marginTop:1}}>Lancer des appels en masse avec suivi automatique</div>
  </div>
  <I n="chevron-right" s={18} style={{color:'#F59E0B'}}/>
</div>
</div>
      </>)}

      {/* ── Contenu des sections toolbar rendu en absolute overlay dans le 3-col container ── */}

    </div>
    );
  })()}

</div>
{/* ═══════════════════════════════════════════════════════════════════
    RIGHT COLUMN — AI Copilot Panel
    Mode 1: LIVE (during active call)
    Mode 2: IDLE (no active call — stats, coaching, analyses)
   ═══════════════════════════════════════════════════════════════════ */}
<div style={{width:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?48:340,flexShrink:0,borderLeft:`1px solid ${T.border}`,display:'flex',flexDirection:'column',overflow:'hidden',background:T.surface,transition:'width .25s ease'}}>

  {(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null) ? (
    /* ── COLLAPSED STRIP — V1.8.26.1 entièrement cliquable ── */
    <div onClick={togglePhoneRightPanel} style={{display:'flex',flexDirection:'column',alignItems:'center',height:'100%',padding:'8px 0',gap:4,cursor:'pointer'}} title="Ouvrir le panneau">
      <div onClick={(e)=>{e.stopPropagation();togglePhoneRightPanel();}} style={{width:34,height:34,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:`1px solid ${T.border}`}} title="Ouvrir le Copilot"><I n="chevron-left" s={15} style={{color:T.text3}}/></div>
      <div onClick={(e)=>{e.stopPropagation();togglePhoneRightPanel();}} style={{position:'relative',width:34,height:34,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'linear-gradient(135deg,#7C3AED,#2563EB)':collab.ai_copilot_enabled?'#7C3AED12':T.bg,border:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'none':`1px solid ${collab.ai_copilot_enabled?'#7C3AED30':T.border}`}} title={(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'Copilot LIVE':'AI Copilot'}>
<I n="cpu" s={15} style={{color:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'#fff':collab.ai_copilot_enabled?'#7C3AED':T.text3}}/>
{(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && <span style={{position:'absolute',top:2,right:2,width:7,height:7,borderRadius:4,background:'#22C55E',boxShadow:'0 0 6px #22C55E80'}}/>}
      </div>
      <div style={{flex:1}}/>
      <div style={{fontSize:8,color:T.text3,writingMode:'vertical-rl',transform:'rotate(180deg)',letterSpacing:1,fontWeight:600,pointerEvents:'none'}}>{(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'LIVE':'COPILOT'}</div>
    </div>
  ) : (
  <>
  {/* ── COLLAPSE BUTTON ── */}
  <div onClick={togglePhoneRightPanel} style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'4px 0',cursor:'pointer',borderBottom:`1px solid ${T.border}`,flexShrink:0}} title="Replier le panneau"><I n="chevron-right" s={14} style={{color:T.text3}}/></div>

  {/* V1.9.1 UX — Sticky statut Copilot allégé : suggestion IA RETIRÉE (centralisée dans bannière basse). Conserve uniquement statut LIVE + voice activity Vous/Client (signaux système simples autorisés). */}
  {(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (
    <div style={{padding:'6px 10px',borderBottom:'1px solid '+T.border,background:'linear-gradient(135deg,#7C3AED06,#2563EB04)',flexShrink:0,display:'flex',alignItems:'center',gap:8}}>
      {/* Statut Copilot LIVE compact */}
      <div style={{display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
        <I n="cpu" s={11} style={{color:'#7C3AED'}}/>
        <span style={{fontSize:8,fontWeight:800,color:'#7C3AED',letterSpacing:0.3}}>LIVE</span>
        <span style={{width:5,height:5,borderRadius:3,background:'#22C55E',animation:'pulse 2s infinite',boxShadow:'0 0 4px #22C55E80'}}/>
      </div>
      {/* Voice activity compact Vous/Client (signaux système simples) */}
      <div style={{display:'flex',gap:4,flex:1}}>
        <div style={{flex:1,padding:'3px 6px',borderRadius:6,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent+'12':T.bg,border:'1px solid '+((typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent+'40':T.border+'50'),transition:'all .3s',display:'flex',alignItems:'center',gap:4}}>
          <div style={{width:5,height:5,borderRadius:3,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent:'#D1D5DB',transition:'all .3s',boxShadow:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?'0 0 6px '+T.accent+'60':'none'}}/>
          <span style={{fontSize:7,fontWeight:700,color:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent:T.text3}}>{(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?'Vous parlez…':'Vous'}</span>
        </div>
        <div style={{flex:1,padding:'3px 6px',borderRadius:6,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E12':T.bg,border:'1px solid '+((typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E40':T.border+'50'),transition:'all .3s',display:'flex',alignItems:'center',gap:4}}>
          <div style={{width:5,height:5,borderRadius:3,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E':'#D1D5DB',transition:'all .3s',boxShadow:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'0 0 6px #22C55E60':'none'}}/>
          <span style={{fontSize:7,fontWeight:700,color:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E':T.text3}}>{(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'Client parle…':'Client'}</span>
        </div>
      </div>
    </div>
  )}

  {/* ── MULTI-SELECT RIGHT PANEL ── */}
  {(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length >= 2 ? (()=>{
    const selContacts = (typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).map(id=>(contacts||[]).find(c=>c.id===id)).filter(Boolean);
    const withPhone = selContacts.filter(c=>c.phone&&c.phone.length>4);
    const withEmail = selContacts.filter(c=>c.email);
    const customColors = JSON.parse(localStorage.getItem('pipeline_custom_colors')||'[]');
    const allColors = [...PIPELINE_CARD_COLORS_DEFAULT,...customColors];
    const ctStages = [{id:'nouveau',label:'Nouveau',color:'#3B82F6'},{id:'contacte',label:'En discussion',color:'#F59E0B'},{id:'qualifie',label:'Intéressé',color:'#7C3AED'},{id:'rdv_programme',label:'RDV Programmé',color:'#0EA5E9'},{id:'nrp',label:'NRP',color:'#EF4444'},{id:'client_valide',label:'Client Validé',color:'#22C55E'},{id:'perdu',label:'Perdu',color:'#6B7280'},...((typeof pipelineStages!=='undefined'?pipelineStages:null)||[])];
    return(
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'14px',borderBottom:'1px solid '+T.border,flexShrink:0,background:T.accent+'08'}}>
<div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
<div style={{display:'flex',alignItems:'center',gap:8}}>
  <div style={{width:36,height:36,borderRadius:10,background:T.accent+'18',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="users" s={18} style={{color:T.accent}}/></div>
  <div>
    <div style={{fontSize:15,fontWeight:800,color:T.text}}>{selContacts.length} contacts</div>
    <div style={{fontSize:11,color:T.text3}}>{withPhone.length} tel · {withEmail.length} email</div>
  </div>
</div>
<span onClick={()=>setPipeSelectedIds([])} style={{cursor:'pointer',color:T.text3}}><I n="x" s={16}/></span>
</div>
      </div>
      <div style={{flex:1,overflow:'auto',padding:14}}>
{/* Liste contacts */}
<div style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:8}}>Contacts sélectionnés</div>
<div style={{marginBottom:16,border:`1px solid ${T.border}`,borderRadius:10,background:T.bg}}>
{selContacts.map(c=><div key={c.id} style={{padding:'8px 12px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:8,fontSize:12}}>
  <Avatar name={c.name} color={c.card_color||T.accent} size={24}/>
  <div style={{flex:1,minWidth:0}}>
    <div style={{fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</div>
    <div style={{fontSize:10,color:T.text3}}>{c.phone||c.email||'—'}</div>
  </div>
  <span onClick={e=>{e.stopPropagation();setPipeSelectedIds(p=>p.filter(x=>x!==c.id));}} style={{cursor:'pointer',color:T.text3,flexShrink:0}}><I n="x" s={12}/></span>
</div>)}
</div>

{/* Actions groupées */}
<div style={{fontSize:11,fontWeight:700,color:T.text3,marginBottom:8}}>Actions groupées</div>

{/* Déplacer */}
<div style={{marginBottom:12}}>
<div style={{fontSize:11,fontWeight:600,color:T.text2,marginBottom:4}}><I n="arrow-right" s={11}/> Déplacer vers</div>
<div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
  {ctStages.map(s=><div key={s.id} onClick={()=>{const ids=(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).filter(id=>{const c=(contacts||[]).find(x=>x.id===id);return c&&c.pipeline_stage!==s.id;});if(!ids.length){showNotif('Déjà dans cette étape','info');return;}ids.forEach(id=>handlePipelineStageChange(id,s.id));showNotif(`${ids.length} contact${ids.length>1?'s':''} → ${s.label}`,'success');(typeof setPipeSelectedIds==='function'?setPipeSelectedIds:function(){})([]);}} style={{padding:'3px 8px',borderRadius:6,fontSize:9,fontWeight:600,cursor:'pointer',color:s.color,border:`1px solid ${s.color}30`,background:s.color+'08'}}><span style={{display:'inline-block',width:5,height:5,borderRadius:3,background:s.color,marginRight:3,verticalAlign:'middle'}}/>{s.label}</div>)}
</div>
</div>

{/* Couleur */}
<div style={{marginBottom:12}}>
<div style={{fontSize:11,fontWeight:600,color:T.text2,marginBottom:4}}><I n="palette" s={11}/> Changer couleur</div>
<div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
  {allColors.map(pc=><div key={pc.color+pc.label} onClick={()=>{(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).forEach(id=>handleCollabUpdateContact(id,{card_color:pc.color||'',card_label:pc.color?pc.label:''}));showNotif(`Couleur "${pc.label}" → ${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length} contacts`,'success');}} style={{padding:'3px 8px',borderRadius:6,cursor:'pointer',fontSize:9,fontWeight:600,background:(pc.color||T.border)+'18',color:pc.color||T.text3,border:`1.5px solid ${pc.color||T.border}`,display:'flex',alignItems:'center',gap:3}}><div style={{width:8,height:8,borderRadius:3,background:pc.color||T.border}}/>{pc.label}</div>)}
</div>
</div>

{/* Tag */}
<div style={{marginBottom:12}}>
<div style={{fontSize:11,fontWeight:600,color:T.text2,marginBottom:4}}><I n="tag" s={11}/> Ajouter tag</div>
<div style={{display:'flex',gap:6}}>
  <input type="text" id="_bulkTagInput" placeholder="Nom du tag..." style={{flex:1,padding:'5px 10px',borderRadius:8,fontSize:11,border:`1px solid ${T.border}`,background:T.bg,color:T.text}}/>
  <Btn small primary onClick={()=>{const tag=document.getElementById('_bulkTagInput')?.value?.trim();if(!tag)return;(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).forEach(id=>{const c=(contacts||[]).find(x=>x.id===id);if(c)handleCollabUpdateContact(id,{tags:[...(c.tags||[]),tag]});});showNotif(`Tag "${tag}" → ${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length} contacts`,'success');document.getElementById('_bulkTagInput').value='';}}>Ajouter</Btn>
</div>
</div>

{/* Email groupé */}
{withEmail.length>0&&<div style={{marginBottom:8}}>
<Btn small onClick={()=>{const emails=withEmail.map(c=>c.email).join(',');window.open('mailto:'+emails);}} style={{width:'100%'}}><I n="mail" s={12}/> Email groupé ({withEmail.length})</Btn>
</div>}

{/* SMS groupé */}
{withPhone.length>0&&<div style={{marginBottom:12}}>
<Btn small onClick={()=>setPipeBulkModal('sms')} style={{width:'100%'}}><I n="message-square" s={12}/> SMS groupé ({withPhone.length})</Btn>
</div>}

{/* Supprimer */}
<div style={{marginTop:16,paddingTop:12,borderTop:`1px solid ${T.border}`}}>
<Btn small ghost danger onClick={()=>{if(!confirm(`Supprimer ${selContacts.length} contacts ? Irréversible.`))return;api('/api/data/contacts/bulk-delete',{method:'POST',body:{contactIds:pipeSelectedIds,companyId:company?.id}}).then(()=>{setContacts(p=>p.filter(c=>!(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).includes(c.id)));showNotif(`${selContacts.length} contacts supprimés`,'success');(typeof setPipeSelectedIds==='function'?setPipeSelectedIds:function(){})([]);}).catch(()=>showNotif('Erreur','danger'));}} style={{width:'100%'}}><I n="trash-2" s={12}/> Supprimer {selContacts.length} contacts</Btn>
</div>
      </div>
    </div>);
  })() : null}

  {/* ── UNIFIED RIGHT PANEL — pipeline contact OR call detail OR active call (dialer manuel) (hidden when multi-select active) ── */}
  {/* V1.9 UX FIX BUG 1 — Étendu à phoneActiveCall pour que le panel droit complet (header + tabs + IA Copilot) s'affiche identiquement quelle que soit la source d'appel (pastille pipeline / clavier / fiche / entrant) */}
  {(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length >= 2 ? null : ((typeof pipelineRightContact!=='undefined'?pipelineRightContact:null) || (typeof phoneCallDetailId!=='undefined'?phoneCallDetailId:null) || (typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)) ? (()=>{
    const ct = (typeof pipelineRightContact!=='undefined'?pipelineRightContact:null) || (()=>{
      const cl = (typeof phoneCallDetailId!=='undefined'?phoneCallDetailId:null) ? ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).find(c=>c.id===(typeof phoneCallDetailId!=='undefined'?phoneCallDetailId:null)) : null;
      if(cl){
        const num = cl.direction==='outbound' ? cl.toNumber : cl.fromNumber;
        let found = cl.contactId ? contacts.find(c=>c.id===cl.contactId) : null;
        if(!found){const ph=(num||'').replace(/[^\d]/g,'').slice(-9);if(ph.length>=9) found=contacts.find(c=>{if(c.assignedTo!==collab.id){try{const sw=JSON.parse(c.shared_with_json||'[]');if(!sw.includes(collab.id))return false;}catch{return false;}}const cp=(c.phone||c.mobile||'').replace(/[^\d]/g,'').slice(-9);return cp&&cp===ph;});}
        return found || {name: fmtPhone(num), phone: num, pipeline_stage: 'nouveau'};
      }
      // V1.9 UX FIX BUG 1 — Fallback dialer manuel : ghost contact depuis phoneActiveCall (contact inconnu si pas matché par numéro)
      const pac = (typeof phoneActiveCall!=='undefined'?phoneActiveCall:null);
      if(pac){
        const num = pac.number || '';
        let found = pac.contactId ? contacts.find(c=>c.id===pac.contactId) : null;
        if(!found){const ph=(num||'').replace(/[^\d]/g,'').slice(-9);if(ph.length>=9) found=contacts.find(c=>{if(c.assignedTo!==collab.id){try{const sw=JSON.parse(c.shared_with_json||'[]');if(!sw.includes(collab.id))return false;}catch{return false;}}const cp=(c.phone||c.mobile||'').replace(/[^\d]/g,'').slice(-9);return cp&&cp===ph;});}
        return found || {id:'__dialer_unknown__',name: 'Contact inconnu', phone: num, pipeline_stage: 'nouveau'};
      }
      return null;
    })();
    if(!ct) return null;
    const cl = (typeof phoneCallDetailId!=='undefined'?phoneCallDetailId:null) ? ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).find(c=>c.id===(typeof phoneCallDetailId!=='undefined'?phoneCallDetailId:null)) : null;
    const ctNum = cl ? (cl.direction==='outbound' ? cl.toNumber : cl.fromNumber) : (ct.phone||ct.mobile||'');
    const ctStages = [{id:'nouveau',label:'Nouveau',color:'#3B82F6'},{id:'contacte',label:'En discussion',color:'#F59E0B'},{id:'qualifie',label:'Intéressé',color:'#7C3AED'},{id:'rdv_programme',label:'RDV Programme',color:'#0EA5E9'},{id:'nrp',label:'NRP',color:'#EF4444'},{id:'client_valide',label:'Client Valide',color:'#22C55E'},{id:'perdu',label:'Perdu',color:'#6B7280'}];
    const ctStage = ctStages.find(s=>s.id===ct.pipeline_stage)||{label:ct.pipeline_stage||'?',color:'#999'};
    let nrpFollowups = [];
    try { nrpFollowups = JSON.parse(ct.nrp_followups_json||'[]').filter(f=>f.done); } catch {}
    const history = (typeof pipelinePopupHistory!=='undefined'?pipelinePopupHistory:null) || [];
    const callsForNumber = (()=>{
      // Fusionne les appels matchés par contactId ET par numéro (pour retrouver les appels historiques sans contactId renseigné)
      const all = (typeof voipCallLogs!=='undefined'?voipCallLogs:null) || [];
      const ph = (ctNum||'').replace(/[^\d]/g,'').slice(-9);
      const matched = new Map(); // dedup par id
      // Match 1 : par contactId (isolation propre si renseigné)
      if (ct.id && ct.id !== 'nouveau') {
for (const c of all) {
if (c.contactId === ct.id) matched.set(c.id, c);
}
      }
      // Match 2 : par numéro (rattrape les appels sans contactId)
      if (ph.length >= 9) {
for (const c of all) {
if (matched.has(c.id)) continue;
const n = (c.direction === 'outbound' ? c.toNumber : c.fromNumber || '').replace(/[^\d]/g,'').slice(-9);
if (n === ph) matched.set(c.id, c);
}
      }
      return Array.from(matched.values()).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
    })();
    const fmtDur3=fmtDur; // alias — uses shared fmtDur
    const analysis = cl ? (typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)[cl.id] : null;
    return(
    <div data-pipe-right-panel="1" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'12px 14px',borderBottom:'1px solid '+T.border,flexShrink:0,background:ctStage.color+'08'}}>
<div style={{display:'flex',alignItems:'center',gap:10}}>
<div style={{width:40,height:40,borderRadius:14,background:ctStage.color+'15',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,border:'2px solid '+ctStage.color+'30'}}>
  <span style={{fontWeight:800,fontSize:16,color:ctStage.color}}>{(ct.name||'?')[0].toUpperCase()}</span>
</div>
<div style={{flex:1,minWidth:0}}>
  <div style={{fontSize:14,fontWeight:800,color:T.text}}>{ct.name}</div>
      {(typeof v7FollowersMap!=='undefined'?v7FollowersMap:null)[ct.id]?.executor && (typeof v7FollowersMap!=='undefined'?v7FollowersMap:null)[ct.id].executor.collaboratorId !== collab.id && <span style={{display:'inline-block',padding:'0 5px',borderRadius:4,fontSize:7,fontWeight:700,background:'#8B5CF620',color:'#8B5CF6',marginLeft:6}} title={'Chez '+(typeof v7FollowersMap!=='undefined'?v7FollowersMap:null)[ct.id].executor.collaboratorName}>{((typeof v7FollowersMap!=='undefined'?v7FollowersMap:null)[ct.id].executor.collaboratorName||'').split(' ')[0]}</span>}
  {(ct.phone||ct.mobile) && <div style={{fontSize:10,color:T.text3,marginTop:1}}>{ct.phone||ct.mobile}</div>}
  <div style={{display:'flex',alignItems:'center',gap:4,marginTop:2}}>
    <div style={{width:6,height:6,borderRadius:3,background:ctStage.color}}/>
    <span style={{fontSize:10,fontWeight:600,color:ctStage.color}}>{ctStage.label}</span>
    {nrpFollowups.length>0 && <span style={{fontSize:9,fontWeight:800,color:'#fff',padding:'2px 7px',borderRadius:6,background:'#EF4444',marginLeft:4}}>NRP x{nrpFollowups.length}</span>}
  </div>
</div>
<div onClick={()=>{setPipelineRightContact(null);setPhoneCallDetailId(null);}} style={{width:24,height:24,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text3}}>
  <I n="x" s={14}/>
</div>
</div>
{/* Quick actions */}
<div style={{display:'flex',gap:4,marginTop:10}}>
{[
  {icon:'phone',color:'#22C55E',tip:'Appeler',action:()=>startPhoneCall(ctNum||ct.phone||ct.mobile,ct.id)},
  {icon:'message-square',color:'#0EA5E9',tip:'SMS',action:()=>{setPhoneDialNumber(ctNum||ct.phone||ct.mobile||'');setPhoneRightTab('sms');}},
  {icon:'layout-grid',color:'#7C3AED',tip:'Pipeline',action:()=>{setPhoneSubTab('pipeline');}},
  {icon:'users',color:'#8B5CF6',tip:'Transférer',action:()=>{setV7TransferModal({contact:ct,fromPhonePipeline:true});setV7TransferTarget('');}},
  {icon:'calendar-plus',color:'#F59E0B',tip:'RDV',action:()=>{if(ct.id){setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||ctNum||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}else{showNotif('Creez le contact avant de programmer un RDV','info');}}},
].map((a,i)=>(
  <div key={i} onClick={a.action} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:3,padding:'5px 0',borderRadius:8,cursor:'pointer',background:a.color+'0A',border:'1px solid '+a.color+'20',transition:'all .12s',fontSize:9,fontWeight:600,color:a.color}} title={a.tip} onMouseEnter={e=>{e.currentTarget.style.background=a.color+'18';}} onMouseLeave={e=>{e.currentTarget.style.background=a.color+'0A';}}>
    <I n={a.icon} s={11}/>{a.tip}
  </div>
))}
</div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid '+T.border,flexShrink:0}}>
{[{id:'fiche',icon:'user',label:'Info'},{id:'script',icon:'file-text',label:'Script'},{id:'appels',icon:'phone',label:'Appels'},{id:'sms',icon:'message-square',label:'SMS'},{id:'flux',icon:'activity',label:'Activite'},{id:'forms',icon:'clipboard',label:'Forms'},{id:'ia',icon:'cpu',label:'IA Copilot'}].map(t=>(
<div key={t.id} onClick={()=>(typeof setPhoneRightTab==='function'?setPhoneRightTab:function(){})(t.id)} style={{flex:1,padding:'7px 0',textAlign:'center',cursor:'pointer',fontSize:9,fontWeight:phoneRightTab===t.id?700:500,color:phoneRightTab===t.id?T.accent:T.text3,borderBottom:phoneRightTab===t.id?'2px solid '+T.accent:'2px solid transparent',display:'flex',flexDirection:'column',alignItems:'center',gap:1,transition:'all .12s'}}>
  <I n={t.icon} s={12}/>{t.label}
</div>
))}
      </div>

      {/* V1.9 UX — Sticky MiniCopilotLiveStatus déplacé en haut du panel droit (avant switch multi-select) pour rester visible même quand contact non sélectionné */}

      {/* Tab content */}
      <div style={{flex:1,overflow:'auto',padding:'8px 10px'}}>

{/* ══ SCRIPT tab — V1.11 Modèles d'interaction (templates + responses) ══ */}
{phoneRightTab==='script' && (
<InteractionTemplatesPanel
  T={T} I={I} Btn={Btn} Modal={Modal}
  contact={ct}
  callLogId={phoneActiveCall?.id || ''}
  role={collab?.role || ''}
  collaboratorId={collab?.id || ''}
  pushNotification={(title, detail, type)=>showNotif && showNotif(detail || title, type==='error'?'danger':type)}
/>
)}

{/* ══ INFO tab — Contact details, notes, tags, change stage ══ */}
{((typeof phoneRightTab!=='undefined'?phoneRightTab:null)==='fiche'||(typeof phoneRightTab!=='undefined'?phoneRightTab:null)==='appels'&&!callsForNumber.length) && (typeof phoneRightTab!=='undefined'?phoneRightTab:null)==='fiche' && (
<div>
  {/* ── Coordonnées complètes — version épurée V3 ── */}
  {(()=>{
    const _upd=(field,val)=>{contactsLocalEditRef.current=Date.now();setPipelineRightContact(p=>p?{...p,[field]:val}:p);setContacts(p=>p.map(c=>c.id===ct.id?{...c,[field]:val}:c));if((typeof selectedCrmContact!=='undefined'?selectedCrmContact:null)?.id===ct.id)(typeof setSelectedCrmContact==='function'?setSelectedCrmContact:function(){})(p=>p?{...p,[field]:val}:p);clearTimeout(_T.pipeRightSaveTimer);_T.pipeRightSaveTimer=setTimeout(()=>{api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{[field]:val,companyId:company?.id}}).then(()=>{_T.pipeRightSaved=true;setTimeout(()=>{_T.pipeRightSaved=false;},2000);});},600);};
    const _fmtPhone=(v)=>{if(!v)return v;let n=v.replace(/\s/g,'');if(/^0[1-9]\d{8}$/.test(n))return'+33'+n.slice(1);if(/^[1-9]\d{8}$/.test(n))return'+33'+n;return v;};
    const _fld=(icon,field,placeholder,opts={})=><div style={{display:'flex',alignItems:'center',gap:4,padding:'3px 6px',borderRadius:6,border:`1px solid ${T.border}40`,background:T.card,...(opts.full?{gridColumn:'1 / -1'}:{})}}>
      <I n={icon} s={10} style={{color:T.text3,flexShrink:0}}/>
      <input value={ct[field]||''} onChange={e=>_upd(field,e.target.value)} onBlur={()=>{if((field==='phone'||field==='mobile')&&ct[field]){const fmt=_fmtPhone(ct[field]);if(fmt!==ct[field])_upd(field,fmt);}}} placeholder={placeholder} style={{fontSize:11,border:'none',padding:'1px 0',background:'transparent',color:ct[field]?T.text:'#CBD5E1',fontFamily:'inherit',outline:'none',width:'100%'}} />
    </div>;
    return <div>
      {/* Ligne badge: Type + Source + Date — HORS du bloc coordonnées */}
      <div style={{display:'flex',alignItems:'center',gap:0,marginBottom:6,fontSize:8,color:T.text3,borderRadius:6,border:`1px solid ${T.border}30`,overflow:'hidden',background:T.card}}>
        <select value={ct.contact_type||'btc'} onChange={e=>_upd('contact_type',e.target.value)} style={{fontSize:8,fontWeight:700,border:'none',borderRight:`1px solid ${T.border}30`,padding:'3px 4px',background:ct.contact_type==='btb'?'#2563EB08':'#22C55E08',color:ct.contact_type==='btb'?'#2563EB':'#22C55E',cursor:'pointer',fontFamily:'inherit'}}><option value="btc">🟢 Particulier</option><option value="btb">🔵 Entreprise</option></select>
        {ct.source&&<span style={{padding:'3px 6px',fontWeight:600,borderRight:`1px solid ${T.border}30`}}>{ct.source==='manual'?'Manuel':ct.source==='csv'?'CSV':ct.source==='lead'?'Lead':(ct.source==='booking'||ct.source==='agenda')?'Booking':ct.source}</span>}
        {ct.createdAt&&<span style={{padding:'3px 6px'}}>{new Date(ct.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}</span>}
      </div>
      {/* V1.8.14 — Origine du lead (cross-collab) */}
      {(()=>{
        const _isOwner = ct.assignedTo === collab.id;
        const _shared = Array.isArray(ct.shared_with) ? ct.shared_with : [];
        const _sharedHere = _shared.includes(collab.id) && !_isOwner && ct.assignedTo;
        const _hasShare = ct.assignedTo && (_shared.length > 0 || _sharedHere);
        if (!_hasShare) return null;
        const _capName = (n) => { const s = String(n||'').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'; };
        const _ownerName = (collabs||[]).find(_c => _c.id === ct.assignedTo)?.name || '';
        const _firstSharerId = _shared.find(_id => _id && _id !== ct.assignedTo);
        const _sharerName = _firstSharerId ? ((collabs||[]).find(_c => _c.id === _firstSharerId)?.name || '') : null;
        const _detach = () => {
          if (!confirm('Se retirer du suivi de ce contact ? Vous ne le verrez plus dans votre pipeline.')) return;
          // V1.8.15 — Timeline event AVANT la mutation (pour que le user soit encore en shared_with côté backend)
          api('/api/data/pipeline-history', { method:'POST', body:{ contactId: ct.id, companyId: company?.id, fromStage: '', toStage: '_xc_detach', userId: collab.id, userName: collab.name, note: (collab.name || 'Quelqu\'un') + ' s\'est retiré(e) du suivi' } }).catch(()=>{});
          const _next = _shared.filter(_id => _id !== collab.id);
          if (typeof handleCollabUpdateContact === 'function') {
            handleCollabUpdateContact(ct.id, { shared_with: _next, _source: 'cross_collab_detach', _origin: 'manual' });
            if (typeof showNotif === 'function') showNotif('Vous ne suivez plus ce contact', 'success');
          }
        };
        return <div style={{padding:'8px 10px',borderRadius:8,background:'#F8FAFC',border:`1px solid ${T.border}`,marginBottom:8}}>
          <div style={{fontSize:9,fontWeight:800,color:T.text3,textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}}>Origine du lead</div>
          {_sharerName && <div style={{fontSize:11,color:T.text2,marginBottom:2,display:'flex',alignItems:'center',gap:6}}>
            <span>🤝</span> Apporté par <b style={{color:T.text}}>{_capName(_sharerName)}</b>
          </div>}
          <div style={{fontSize:11,color:T.text2,display:'flex',alignItems:'center',gap:6}}>
            <span>🎯</span> Géré par <b style={{color:T.text}}>{_capName(_ownerName)}</b>
            {_isOwner && <span style={{fontSize:9,color:'#16A34A',fontWeight:700,padding:'1px 5px',borderRadius:4,background:'#22C55E15'}}>Vous</span>}
          </div>
          {_sharedHere && <div style={{marginTop:6,display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:9,color:'#1E40AF',fontWeight:700,padding:'1px 6px',borderRadius:4,background:'#3B82F615'}}>Lecture seule</span>
            <button type="button" onClick={_detach} title="Vous quittez le suivi — l'owner reste assigné au contact" style={{marginLeft:'auto',fontSize:10,padding:'3px 8px',borderRadius:6,border:'1px solid #EF444440',background:'#FEF2F2',color:'#B91C1C',cursor:'pointer',fontWeight:600,fontFamily:'inherit'}}>❌ Se retirer du suivi</button>
          </div>}
        </div>;
      })()}
      {/* Bloc coordonnées */}
      <div style={{padding:8,borderRadius:8,background:T.bg,border:`1px solid ${T.border}`,marginBottom:8}}>
      {/* Civilité + Prénom + Nom — V1.8.22.2 split fallback depuis ct.name si firstname/lastname vides */}
      {(()=>{
        const _splitFirst = ((ct.name||'').trim().split(/\s+/)[0]) || '';
        const _splitLast  = ((ct.name||'').trim().split(/\s+/).slice(1).join(' ')) || '';
        const _displayFirst = ct.firstname || _splitFirst;
        const _displayLast  = ct.lastname || _splitLast;
        const _hasSplitFallback = (!ct.firstname && _splitFirst) || (!ct.lastname && _splitLast);
        // Auto-backfill DB silencieux (one-shot) : si fallback détecté, persister le split
        // pour que les prochaines lectures soient cohérentes (CRM/Pipeline/Agenda).
        if (_hasSplitFallback && ct.id && !ct._splitBackfilled) {
          ct._splitBackfilled = true; // mémo objet pour éviter répétition au re-render
          const _bfBody = { companyId: company?.id };
          if (!ct.firstname && _splitFirst) _bfBody.firstname = _splitFirst;
          if (!ct.lastname && _splitLast)   _bfBody.lastname  = _splitLast;
          api(`/api/data/contacts/${ct.id}`, { method:'PUT', body:_bfBody })
            .then(()=>{
              if (_bfBody.firstname) _upd('firstname', _bfBody.firstname);
              if (_bfBody.lastname)  _upd('lastname',  _bfBody.lastname);
            })
            .catch(()=>{});
        }
        return (
        <div style={{display:'flex',gap:4,alignItems:'center',marginBottom:6}}>
          <select value={ct.civility||''} onChange={e=>_upd('civility',e.target.value)} style={{fontSize:10,fontWeight:700,border:`1px solid ${T.border}40`,borderRadius:6,padding:'3px 4px',background:T.card,color:ct.civility?T.text:T.text3,fontFamily:'inherit',outline:'none',cursor:'pointer',minWidth:48,textAlign:'center'}}><option value="">Civ.</option><option value="M">M.</option><option value="Mme">Mme</option></select>
          <input value={_displayFirst} onChange={e=>_upd('firstname',e.target.value)} onBlur={()=>{const full=(ct.civility?ct.civility+' ':'')+(ct.firstname||_displayFirst)+' '+(ct.lastname||_displayLast);api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{firstname:ct.firstname||_displayFirst,name:full.trim(),companyId:company?.id}});}} placeholder="Prénom" style={{fontSize:12,fontWeight:700,border:`1px solid ${T.border}40`,borderRadius:6,padding:'3px 6px',background:T.card,color:_displayFirst?T.text:'#CBD5E1',fontFamily:'inherit',outline:'none',flex:1,minWidth:0}} onFocus={e=>e.target.style.borderColor=T.accent}/>
          <input value={_displayLast} onChange={e=>_upd('lastname',e.target.value)} onBlur={()=>{const full=(ct.civility?ct.civility+' ':'')+(ct.firstname||_displayFirst)+' '+(ct.lastname||_displayLast);api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{lastname:ct.lastname||_displayLast,name:full.trim(),companyId:company?.id}});}} placeholder="Nom" style={{fontSize:12,fontWeight:700,border:`1px solid ${T.border}40`,borderRadius:6,padding:'3px 6px',background:T.card,color:_displayLast?T.text:'#CBD5E1',fontFamily:'inherit',outline:'none',flex:1.3,minWidth:0}} onFocus={e=>e.target.style.borderColor=T.accent}/>
        </div>
        );
      })()}
      {/* Grille coordonnées — adaptée selon type */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3}}>
        {_fld('phone','phone','Téléphone',{full:true})}
        {_fld('mail','email','Email',{full:true})}
        {_fld('map-pin','address','Adresse',{full:true})}
      </div>
      {/* Entreprise only: Société + Mobile + Site web + SIRET + TVA */}
      {ct.contact_type==='btb'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3,marginTop:3}}>
        {_fld('building-2','company','Société',{full:true})}
        {_fld('smartphone','mobile','Mobile')}
        {_fld('globe','website','Site web')}
        {_fld('hash','siret','SIRET / SIREN')}
        {_fld('receipt','tva_number','N° TVA')}
      </div>}
      {/* Champs perso dans coordonnées */}
      {(()=>{
        const defs=(contactFieldDefs||[]).filter(d=>d.scope==='company'||d.createdBy===collab?.id);
        const cfRaw=Array.isArray(ct.custom_fields)?ct.custom_fields:(()=>{try{return JSON.parse(ct.custom_fields_json||'[]');}catch{return[];}})();
        const cfMap={};cfRaw.forEach(f=>{cfMap[f.key]=f.value;});
        const saveCF=(fieldKey,value)=>{contactsLocalEditRef.current=Date.now();const updated=[...cfRaw.filter(f=>f.key!==fieldKey),{key:fieldKey,value}];const json=JSON.stringify(updated);setPipelineRightContact(p=>p?{...p,custom_fields:updated,custom_fields_json:json}:p);setContacts(p=>p.map(c=>c.id===ct.id?{...c,custom_fields:updated,custom_fields_json:json}:c));if((typeof selectedCrmContact!=='undefined'?selectedCrmContact:null)?.id===ct.id)(typeof setSelectedCrmContact==='function'?setSelectedCrmContact:function(){})(p=>p?{...p,custom_fields:updated,custom_fields_json:json}:p);clearTimeout(_T.pipeRightSaveTimer);_T.pipeRightSaveTimer=setTimeout(()=>api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{custom_fields_json:json,companyId:company?.id}}),800);};
        return defs.length>0?<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3,marginTop:3}}>
          {defs.map(d=><div key={d.id} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 6px',borderRadius:6,border:`1px solid ${T.border}40`,background:T.card,position:'relative'}}>
            <span style={{fontSize:8,fontWeight:700,color:T.accent,flexShrink:0,textTransform:'uppercase'}}>{d.label}</span>
            <input value={cfMap[d.fieldKey]||''} onChange={e=>saveCF(d.fieldKey,e.target.value)} placeholder="..." style={{fontSize:11,border:'none',padding:'1px 0',background:'transparent',color:cfMap[d.fieldKey]?T.text:'#CBD5E1',fontFamily:'inherit',outline:'none',width:'100%',flex:1}}/>
            <span onClick={()=>{const msg=d.scope==='company'?`Supprimer le champ "${d.label}" de l'affichage sur TOUTES les fiches ?\n\nLes valeurs déjà saisies resteront stockées mais ne seront plus visibles, sauf restauration ou recréation du champ.`:`Supprimer le champ "${d.label}" ?`;if(!confirm(msg))return;api(`/api/contact-fields/${d.id}`,{method:'DELETE'}).then(()=>{setContactFieldDefs(p=>p.filter(x=>x.id!==d.id));showNotif('Champ supprimé','success');}).catch(()=>showNotif('Erreur','danger'));}} style={{cursor:'pointer',fontSize:9,color:'#EF4444',opacity:0.4,lineHeight:1,flexShrink:0}} title="Supprimer ce champ">×</span>
          </div>)}
        </div>:null;
      })()}
      {/* Bouton ajouter champ perso */}
      <div onClick={()=>{const label=prompt('Nom du champ :');if(!label)return;const scope=confirm('Appliquer à TOUS les contacts ?\n\nOK = Oui\nAnnuler = Non (uniquement ce contact)')?'company':'collab';api('/api/contact-fields',{method:'POST',body:{companyId:company?.id,label,scope}}).then(r=>{if(r?.id){setContactFieldDefs(p=>[...p,{...r,label,fieldKey:r.fieldKey||label.toLowerCase().replace(/\s+/g,'_'),fieldType:'text',options:[],scope,createdBy:collab?.id}]);showNotif(scope==='company'?'Champ ajouté sur toutes les fiches':'Champ ajouté','success');}});}} style={{marginTop:4,fontSize:8,color:T.accent,cursor:'pointer',display:'flex',alignItems:'center',gap:3,padding:'2px 0'}}>
        <I n="plus" s={9}/> Ajouter un champ
      </div>
    </div>
    </div>;
  })()}
  {/* Contract info when signed */}
  {ct.contract_signed ? (
    ct.contract_status === 'cancelled' ? (
      <div style={{marginTop:10,padding:10,borderRadius:10,background:'linear-gradient(135deg,#EF444408,#EF444404)',border:'1px solid #EF444425'}}>
        <div style={{fontSize:10,fontWeight:700,color:'#EF4444',marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="x-circle" s={11}/> Contrat annulé</div>
        {ct.contract_amount > 0 && <div style={{fontSize:18,fontWeight:800,color:'#EF4444',textDecoration:'line-through',marginBottom:4}}>{Number(ct.contract_amount).toLocaleString('fr-FR')} €</div>}
        {ct.contract_cancelled_at && <div style={{fontSize:11,color:T.text3,marginBottom:2}}>Annulé le {new Date(ct.contract_cancelled_at).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}</div>}
        {ct.contract_cancel_reason && <div style={{fontSize:11,color:T.text2}}>Motif : {ct.contract_cancel_reason}</div>}
      </div>
    ) : (
      <div style={{marginTop:10,padding:10,borderRadius:10,background:'linear-gradient(135deg,#22C55E08,#22C55E04)',border:'1px solid #22C55E25'}}>
        <div style={{fontSize:10,fontWeight:700,color:'#22C55E',marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="badge-check" s={11}/> Contrat signé</div>
        {ct.contract_amount > 0 && <div style={{fontSize:18,fontWeight:800,color:'#22C55E',marginBottom:4}}>{Number(ct.contract_amount).toLocaleString('fr-FR')} €</div>}
        {ct.contract_number && <div style={{fontSize:11,color:T.text2,marginBottom:2}}>Dossier : <strong>{ct.contract_number}</strong></div>}
        {ct.contract_date && <div style={{fontSize:11,color:T.text3}}>Signé le {new Date(ct.contract_date).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}{ct.contract_date.includes('T')?' à '+new Date(ct.contract_date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</div>}
      </div>
    )
  ) : null}
  {/* V1.11.2 — Données enrichies (sections lisibles, badges, liens) */}
  <ContactInfoEnriched T={T} contact={ct}/>
  {/* Bouton Enregistrer — sauvegarde manuelle explicite */}
  <div style={{marginTop:8,display:'flex',gap:6,alignItems:'center'}}>
    <div onClick={()=>{
      contactsLocalEditRef.current=Date.now();
      const body={companyId:company?.id,firstname:ct.firstname||'',lastname:ct.lastname||'',name:((ct.civility?ct.civility+' ':'')+(ct.firstname||'')+' '+(ct.lastname||'')).trim()||ct.name,phone:ct.phone||'',email:ct.email||'',address:ct.address||'',mobile:ct.mobile||'',company:ct.company||'',website:ct.website||'',siret:ct.siret||'',tva_number:ct.tva_number||'',contact_type:ct.contact_type||'btc',civility:ct.civility||'',notes:ct.notes||''};
      if(ct.custom_fields_json)body.custom_fields_json=typeof ct.custom_fields_json==='string'?ct.custom_fields_json:JSON.stringify(ct.custom_fields_json);
      api(`/api/data/contacts/${ct.id}`,{method:'PUT',body}).then(r=>{
        if(r?.error){showNotif('Erreur: '+r.error,'danger');}
        else{showNotif('Fiche enregistrée','success');_T.pipeRightSaved=true;setTimeout(()=>{_T.pipeRightSaved=false;},2000);}
      }).catch(()=>showNotif('Erreur réseau','danger'));
    }} style={{flex:1,padding:'6px 0',borderRadius:8,background:'linear-gradient(135deg,#22C55E,#16A34A)',color:'#fff',fontSize:10,fontWeight:700,textAlign:'center',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4,boxShadow:'0 2px 8px #22C55E30',transition:'transform .1s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.02)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
      <I n="save" s={12}/> Enregistrer la fiche
    </div>
  </div>

  {/* Formulaires remplis */}
  {(()=>{
    const responses = ((typeof callFormResponses!=='undefined'?callFormResponses:null)||[]).filter(r => (r.contactId||r.contact_id) === ct.id);
    if (!responses.length) return null;
    return <div style={{marginTop:10}}>
      <div style={{fontSize:10,fontWeight:700,color:T.text3,marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="clipboard-check" s={10}/> Formulaires remplis</div>
      {responses.map((resp,ri) => {
        const rId = resp.id || ri;
        const data = (()=>{try{return typeof resp.data==='string'?JSON.parse(resp.data):resp.data||{};}catch{return{};}})();
        const formName = resp.formName || resp.form_name || 'Formulaire';
        const respDate = resp.createdAt || resp.created_at;
        const collabName = resp.collaboratorName || resp.collaborator_name || '';
        const isOpen = (typeof callFormResponseAccordion!=='undefined'?callFormResponseAccordion:null)[rId];
        return <div key={rId} style={{marginBottom:4,borderRadius:8,border:'1px solid '+T.border,overflow:'hidden',background:T.bg}}>
          <div onClick={()=>setCallFormResponseAccordion(p=>({...p,[rId]:!p[rId]}))} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',cursor:'pointer'}}>
            <I n={isOpen?'chevron-down':'chevron-right'} s={10} style={{color:T.text3}}/>
            <span style={{flex:1,fontSize:10,fontWeight:600,color:T.text}}>{formName}</span>
            <span style={{fontSize:8,color:T.text3}}>{respDate ? new Date(respDate).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}) : ''}</span>
          </div>
          {isOpen && <div style={{padding:'6px 8px',borderTop:'1px solid '+T.border}}>
            {collabName && <div style={{fontSize:9,color:T.text3,marginBottom:4}}>Par {collabName}</div>}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
              {Object.entries(data).map(([key,val])=><div key={key} style={{padding:'4px 7px',borderRadius:6,background:T.card,border:'1px solid '+T.border}}>
                <div style={{fontSize:8,fontWeight:700,color:T.accent,textTransform:'uppercase',marginBottom:1}}>{key}</div>
                <div style={{fontSize:10,color:T.text,fontWeight:500}}>{String(val)}</div>
              </div>)}
            </div>
          </div>}
        </div>;
      })}
    </div>;
  })()}
  {/* Custom Fields — supprimé ici car déjà dans bloc coordonnées */}

  {/* Bloc Notes — sans titre */}
  <div style={{marginTop:8}}>
    <textarea value={ct.notes||""} onChange={e=>{
      const v=e.target.value;
      if(pipelineRightContact){(typeof setPipelineRightContact==='function'?setPipelineRightContact:function(){})(p=>({...p,notes:v}));}
      setContacts(p=>p.map(c=>c.id===ct.id?{...c,notes:v}:c));
      clearTimeout(collabNotesTimerRef.current);
      collabNotesTimerRef.current=setTimeout(()=>api(`/api/data/contacts/${ct.id}`,{method:"PUT",body:{notes:v,companyId:company?.id}}),800);
    }} placeholder="Ajoutez des notes..." style={{width:'100%',minHeight:120,maxHeight:400,border:`1px solid ${T.border}`,borderRadius:8,padding:10,fontSize:12,fontFamily:'inherit',resize:'vertical',background:T.bg,color:T.text,outline:'none',lineHeight:1.6}}/>
    <div style={{fontSize:8,color:T.text3,marginTop:2}}>Sauvegarde auto</div>
  </div>

  {/* ── Mémoire IA du contact ── */}
  {(()=>{
    const memKey = '_aiMem_'+ct.id;
    if (!window[memKey] && !window[memKey+'_loading']) {
      window[memKey+'_loading'] = true;
      api('/api/ai-copilot/memory/'+ct.id).then(d=>{
        window[memKey] = d;
        window[memKey+'_loading'] = false;
        setPhoneRightAccordion(p=>({...p,_mem:Date.now()}));
      }).catch(()=>{window[memKey+'_loading']=false;});
    }
    const mem = window[memKey];
    if (!mem?.exists) return null;
    const tc = mem.contact_temperature==='hot'?'#EF4444':mem.contact_temperature==='warm'?'#F59E0B':'#3B82F6';
    const tl = mem.contact_temperature==='hot'?'HOT':mem.contact_temperature==='warm'?'WARM':'COLD';
    const te = mem.contact_temperature==='hot'?'🔥':mem.contact_temperature==='warm'?'🟡':'🔵';
    return <div style={{marginTop:8,borderRadius:8,border:'1px solid #7C3AED20',overflow:'hidden',marginBottom:4}}>
      <div onClick={()=>setIaHubCollapse(p=>({...p,aiMemory:!p.aiMemory}))} style={{padding:'8px 10px',background:'linear-gradient(135deg,#7C3AED06,#2563EB04)',display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
        <span style={{fontSize:12}}>🧠</span>
        <span style={{fontSize:10,fontWeight:700,color:'#7C3AED',flex:1}}>Mémoire IA</span>
        <span style={{fontSize:8,fontWeight:800,padding:'1px 6px',borderRadius:4,background:tc+'18',color:tc}}>{te} {tl} {mem.conversion_score}%</span>
        <I n={(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).aiMemory?'chevron-up':'chevron-down'} s={10} style={{color:T.text3}}/>
      </div>
      {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).aiMemory && <div style={{padding:'6px 10px',display:'flex',flexDirection:'column',gap:4}}>
        {/* Résumé */}
        {mem.short_summary && <div style={{fontSize:10,color:T.text2,lineHeight:1.4,fontStyle:'italic'}}>"{mem.short_summary}"</div>}
        {/* Scores */}
        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
          {[{l:'Engagement',v:mem.engagement_score,c:'#22C55E'},{l:'Réactivité',v:mem.responsiveness_score,c:'#3B82F6'},{l:'Opportunité',v:mem.opportunity_score,c:'#8B5CF6'},{l:'Urgence',v:mem.urgency_score,c:'#F59E0B'},{l:'Fatigue',v:mem.fatigue_score,c:'#EF4444'}].map(s=>(
            <div key={s.l} style={{fontSize:7,fontWeight:700,padding:'1px 5px',borderRadius:3,background:s.c+'12',color:s.c}}>{s.l} {s.v||0}%</div>
          ))}
        </div>
        {/* Objection */}
        {mem.last_objection && <div style={{fontSize:9,color:'#EF4444',display:'flex',alignItems:'center',gap:3}}>
          <I n="alert-triangle" s={9}/> <span style={{fontWeight:600}}>Objection :</span> {mem.last_objection}
        </div>}
        {/* Promesses */}
        {(mem.promises_pending||[]).length>0 && <div style={{fontSize:9,color:'#F59E0B',display:'flex',alignItems:'center',gap:3}}>
          <I n="clock" s={9}/> <span style={{fontWeight:600}}>Promesses :</span> {mem.promises_pending.join(', ')}
        </div>}
        {/* Action recommandée */}
        {mem.recommended_next_action && <div style={{fontSize:9,color:'#22C55E',display:'flex',alignItems:'center',gap:3}}>
          <I n="zap" s={9}/> <span style={{fontWeight:600}}>Action :</span> {mem.recommended_next_action}{mem.recommended_action_reason?' — '+mem.recommended_action_reason.substring(0,60):''}
        </div>}
        {/* Dernier contact */}
        {mem.last_interaction_at && <div style={{fontSize:8,color:T.text3}}>
          📞 Dernier contact : {mem.last_interaction_type||'?'} — {new Date(mem.last_interaction_at).toLocaleDateString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
        </div>}
        {/* Dernière MAJ IA */}
        {mem.last_ai_update && <div style={{fontSize:7,color:T.text3,textAlign:'right'}}>
          MAJ IA : {new Date(mem.last_ai_update).toLocaleDateString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
        </div>}
      </div>}
    </div>;
  })()}

  {/* ── Accordéon Résumé IA (dernière analyse validée) ── */}
  {ct.last_ai_analysis_id && (()=>{
    const _a = Object.values((typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)||{}).find(a=>a.id===ct.last_ai_analysis_id) || ((typeof contactAnalysesHistory!=='undefined'?contactAnalysesHistory:null)[ct.id]||[])[0] || null;
    if(!_a) return <div onClick={()=>{api('/api/ai-copilot/contact/'+ct.id+'/analyses').then(d=>{if(d?.analyses?.length)setContactAnalysesHistory(p=>({...p,[ct.id]:d.analyses}));}).catch(()=>{});}} style={{marginTop:8,padding:'8px 10px',borderRadius:8,border:'1px dashed #7C3AED30',background:'#7C3AED04',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
      <I n="cpu" s={12} style={{color:'#7C3AED'}}/>
      <span style={{fontSize:10,fontWeight:600,color:'#7C3AED'}}>Charger le résumé IA</span>
    </div>;
    const _ext2 = _a.extended || (()=>{try{return JSON.parse(_a.extended_json||'{}');}catch{return {};}})();
    return <div style={{marginTop:8,borderRadius:8,border:'1px solid #7C3AED20',overflow:'hidden'}}>
      <div onClick={()=>setIaHubCollapse(p=>({...p,ficheResume:!p.ficheResume}))} style={{padding:'8px 10px',background:'#7C3AED06',display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
        <I n="cpu" s={12} style={{color:'#7C3AED'}}/>
        <span style={{fontSize:10,fontWeight:700,color:'#7C3AED',flex:1}}>Résumé IA</span>
        <span style={{fontSize:8,color:T.text3}}>{_a.createdAt?new Date(_a.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):''}</span>
        <span style={{fontSize:8,fontWeight:700,padding:'1px 6px',borderRadius:4,background:(_a.sentimentScore||50)>60?'#22C55E15':(_a.sentimentScore||50)>30?'#F59E0B15':'#EF444415',color:(_a.sentimentScore||50)>60?'#22C55E':(_a.sentimentScore||50)>30?'#F59E0B':'#EF4444'}}>{_a.sentiment||'Neutre'}</span>
        <I n={(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).ficheResume?'chevron-down':'chevron-up'} s={10} style={{color:T.text3}}/>
      </div>
      {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).ficheResume && <div style={{padding:'8px 10px',display:'flex',flexDirection:'column',gap:4}}>
        <div style={{fontSize:10,color:T.text2,lineHeight:1.4}}>{_a.summary}</div>
        {_ext2.besoinExprime && <div><span style={{fontSize:8,fontWeight:700,color:'#7C3AED'}}>Besoin :</span> <span style={{fontSize:10,color:T.text}}>{_ext2.besoinExprime}</span></div>}
        {(_a.actionItems||[]).length>0 && <div><span style={{fontSize:8,fontWeight:700,color:'#7C3AED'}}>Actions :</span> <span style={{fontSize:10,color:T.text}}>{_a.actionItems.join(' · ')}</span></div>}
        {_a.followupDate && <div><span style={{fontSize:8,fontWeight:700,color:'#F59E0B'}}>Relance :</span> <span style={{fontSize:10,color:T.text}}>{new Date(_a.followupDate+'T12:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</span></div>}
        {_ext2.informationsImportantes && <div><span style={{fontSize:8,fontWeight:700,color:'#7C3AED'}}>Infos :</span> <span style={{fontSize:10,color:T.text}}>{_ext2.informationsImportantes}</span></div>}
        <div onClick={()=>{setContactAnalysesHistoryModal(ct.id);api('/api/ai-copilot/contact/'+ct.id+'/analyses').then(d=>{if(d?.analyses)setContactAnalysesHistory(p=>({...p,[ct.id]:d.analyses}));}).catch(()=>{});}} style={{fontSize:9,color:'#7C3AED',fontWeight:600,cursor:'pointer',marginTop:2}}>Voir historique →</div>
      </div>}
    </div>;
  })()}

  {/* Documents du contact */}
  {ct.id && <FicheDocsPanelScreen ct={ct} showNotif={showNotif} />}

  {/* Change stage */}
  {ct.id && <div style={{marginTop:12}}>
    {/* Historique RDV */}
    {(()=>{
      const ctBookings = (bookings||[]).filter(b => (b.contactId === ct.id || (b.visitorPhone && ct.phone && b.visitorPhone.replace(/\s/g,'') === ct.phone.replace(/\s/g,''))) && b.status !== 'cancelled');
      if (ctBookings.length === 0) return null;
      const now = new Date();
      const upcoming = ctBookings.filter(b => new Date(b.date+'T'+(b.time||'00:00')) >= now).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
      const past = ctBookings.filter(b => new Date(b.date+'T'+(b.time||'00:00')) < now).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
      return <div style={{marginTop:10}}>
        <div style={{fontSize:10,fontWeight:700,color:T.text3,marginBottom:4,display:'flex',alignItems:'center',gap:4}}><I n="calendar" s={11} style={{color:'#0EA5E9'}}/> RDV ({ctBookings.length})</div>
        {upcoming.length > 0 && <div style={{marginBottom:4}}>
          <div style={{fontSize:9,fontWeight:700,color:'#22C55E',marginBottom:3}}>À venir</div>
          {upcoming.map(b=><div key={b.id} style={{padding:'5px 8px',borderRadius:7,background:'#22C55E08',border:'1px solid #22C55E20',marginBottom:3,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><span style={{fontSize:10,fontWeight:700,color:T.text}}>{new Date(b.date).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})}</span><span style={{fontSize:10,color:T.text2,marginLeft:4}}>{b.time}</span></div>
            <div style={{display:'flex',alignItems:'center',gap:4}}>
              <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'#22C55E15',color:'#22C55E',fontWeight:600}}>{b.duration||30}min</span>
              <div onClick={()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:b.date,time:b.time,duration:b.duration||30,notes:'Modification RDV',calendarId:b.calendarId||'',rdv_category:b.rdv_category||'',rdv_subcategory:b.rdv_subcategory||'',_bookingMode:true,_editBookingId:b.id});setPhoneShowScheduleModal(true);}} style={{cursor:'pointer',padding:'2px 4px',borderRadius:4,color:T.text3}} title="Modifier"><I n="edit-2" s={10}/></div>
              <div onClick={()=>{if(confirm('Annuler ce RDV ?')){cancelBookingAndCascade(b.id);showNotif('RDV annulé');}}} style={{cursor:'pointer',padding:'2px 4px',borderRadius:4,color:'#EF4444'}} title="Annuler"><I n="x" s={10}/></div>
            </div>
          </div>)}
        </div>}
        {past.length > 0 && <div>
          <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Passés</div>
          {past.slice(0,3).map(b=><div key={b.id} style={{padding:'4px 8px',borderRadius:7,background:T.bg,marginBottom:2,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><span style={{fontSize:10,color:T.text3}}>{new Date(b.date).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})}</span><span style={{fontSize:10,color:T.text3,marginLeft:4}}>{b.time}</span></div>
            <span style={{fontSize:9,color:T.text3}}>{b.status==='confirmed'?'✓':'—'}</span>
          </div>)}
          {past.length > 3 && <div style={{fontSize:9,color:T.text3,textAlign:'center',padding:2}}>+{past.length-3} ancien{past.length-3>1?'s':''}</div>}
        </div>}
      </div>;
    })()}

    {/* ── Type contact — liste déroulante + supprimer custom ── */}
    {(()=>{
      const customColors=JSON.parse(localStorage.getItem('pipeline_custom_colors')||'[]');
      const allColors=[...PIPELINE_CARD_COLORS_DEFAULT,...customColors];
      const current=allColors.find(c=>c.color===ct.card_color)||allColors[0];
      const isCustom=customColors.some(c=>c.color===ct.card_color);
      return <div style={{marginTop:8}}>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <div style={{fontSize:10,fontWeight:700,color:T.text3}}>Type</div>
          <select value={ct.card_color||''} onChange={e=>{const sel=allColors.find(c=>c.color===e.target.value);handleCollabUpdateContact(ct.id,{card_color:e.target.value,card_label:sel?.label||''});}} style={{flex:1,fontSize:10,fontWeight:600,padding:'4px 8px',borderRadius:6,border:`1px solid ${T.border}`,background:current?.color?(current.color+'12'):T.bg,color:current?.color||T.text,cursor:'pointer',fontFamily:'inherit'}}>
            {allColors.map(pc=><option key={pc.color+pc.label} value={pc.color}>{pc.label}</option>)}
          </select>
          {isCustom&&<span onClick={()=>{if(!confirm('Supprimer le type "'+current?.label+'" ?'))return;const updated=customColors.filter(c=>c.color!==ct.card_color);localStorage.setItem('pipeline_custom_colors',JSON.stringify(updated));handleCollabUpdateContact(ct.id,{card_color:'',card_label:''});setPipelineRdvForm(p=>({...p,_refreshColors:Date.now()}));}} style={{cursor:'pointer',color:'#EF4444',fontSize:11,fontWeight:700,flexShrink:0}} title="Supprimer ce type">×</span>}
        </div>
        {/* Ajouter — couleur + nom sur même ligne */}
        <div style={{display:'flex',alignItems:'center',gap:3,marginTop:4}}>
          <input type="color" id="_pipeCustomColor" defaultValue={ct.card_color||'#6366F1'} style={{width:22,height:22,border:'none',borderRadius:4,cursor:'pointer',padding:0,background:'transparent',flexShrink:0}} title="Couleur"/>
          <input type="text" id="_pipeCustomLabel" placeholder="Nouveau type..." style={{flex:1,padding:'3px 6px',borderRadius:5,fontSize:9,border:`1px solid ${T.border}`,background:T.bg,color:T.text,outline:'none'}}/>
          <div onClick={()=>{const color=document.getElementById('_pipeCustomColor')?.value;const label=document.getElementById('_pipeCustomLabel')?.value?.trim();if(!color||!label)return;const existing=JSON.parse(localStorage.getItem('pipeline_custom_colors')||'[]');if(existing.some(c=>c.label===label))return;existing.push({color,label});localStorage.setItem('pipeline_custom_colors',JSON.stringify(existing));handleCollabUpdateContact(ct.id,{card_color:color,card_label:label});setPipelineRdvForm(p=>({...p,_refreshColors:Date.now()}));document.getElementById('_pipeCustomLabel').value='';}} style={{padding:'3px 8px',borderRadius:5,fontSize:8,fontWeight:700,background:T.accent,color:'#fff',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>+</div>
        </div>
      </div>;
    })()}

    {/* ── Note étoiles + Tags — tout en bas ── */}
    <div style={{display:'flex',alignItems:'center',gap:4,marginTop:10,paddingTop:6,borderTop:`1px solid ${T.border}30`,flexWrap:'wrap'}}>
      <div style={{display:'flex',alignItems:'center',gap:1}}>
        {[1,2,3,4,5].map(n=><span key={n} onClick={()=>{const v=(pipelineRightContact||ct).rating===n?0:n;(typeof setPipelineRightContact==='function'?setPipelineRightContact:function(){})(p=>p?{...p,rating:v}:p);setContacts(p=>p.map(c=>c.id===ct.id?{...c,rating:v}:c));api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{rating:v,companyId:company?.id}});}} style={{cursor:'pointer',fontSize:13,color:n<=((pipelineRightContact||ct).rating||0)?'#F59E0B':'#D1D5DB'}}>{n<=((pipelineRightContact||ct).rating||0)?'★':'☆'}</span>)}
      </div>
      <div style={{width:1,height:12,background:T.border,flexShrink:0}}/>
      {((pipelineRightContact||ct).tags||[]).map(t=><span key={t} style={{fontSize:8,padding:'1px 5px',borderRadius:5,background:'#7C3AED14',color:'#7C3AED',fontWeight:600,display:'inline-flex',alignItems:'center',gap:2}}>{t}<span onClick={()=>{const tags=((pipelineRightContact||ct).tags||[]).filter(x=>x!==t);(typeof setPipelineRightContact==='function'?setPipelineRightContact:function(){})(p=>p?{...p,tags}:p);setContacts(p=>p.map(c=>c.id===ct.id?{...c,tags}:c));api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{tags_json:JSON.stringify(tags),companyId:company?.id}});}} style={{cursor:'pointer',lineHeight:1}}>×</span></span>)}
      <span onClick={()=>{const t=prompt('Tag :');if(!t)return;const tags=[...((pipelineRightContact||ct).tags||[]),t.trim()];(typeof setPipelineRightContact==='function'?setPipelineRightContact:function(){})(p=>p?{...p,tags}:p);setContacts(p=>p.map(c=>c.id===ct.id?{...c,tags}:c));api(`/api/data/contacts/${ct.id}`,{method:'PUT',body:{tags_json:JSON.stringify(tags),companyId:company?.id}});}} style={{fontSize:8,padding:'1px 5px',borderRadius:5,border:`1px dashed ${T.border}`,color:T.accent,cursor:'pointer',fontWeight:600}}>+ Tag</span>
    </div>

  </div>}

  {/* V1.8.22.3 — Footer discret : ID contact masquable + copie */}
  {ct.id && (()=>{
    const _maskId = (id) => {
      if (!id) return '';
      // ct_<13digits>_<random> → ct_<4digits>***********
      const _m = String(id).match(/^(ct_?\d{1,4})(.*)$/i);
      if (_m) return _m[1] + '*'.repeat(Math.max(8, _m[2].length));
      return String(id).slice(0,4) + '*'.repeat(Math.max(8, String(id).length - 4));
    };
    const _displayId = showContactId ? ct.id : _maskId(ct.id);
    const _copy = async () => {
      try { await navigator.clipboard.writeText(ct.id); showNotif('ID copié','success'); }
      catch { showNotif('Impossible de copier','danger'); }
    };
    return (
      <div style={{marginTop:14,paddingTop:10,borderTop:`1px solid ${T.border}40`,display:'flex',alignItems:'center',gap:6,fontSize:10,color:T.text3,fontFamily:'monospace'}}>
        <span style={{flexShrink:0}}>ID contact&nbsp;:</span>
        <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',userSelect:showContactId?'all':'none'}} title={showContactId?ct.id:'Masqué — cliquer sur l\'œil pour afficher'}>{_displayId}</span>
        <span onClick={()=>setShowContactId(s=>!s)} style={{cursor:'pointer',padding:'2px 5px',borderRadius:4,fontSize:11,color:showContactId?T.accent:T.text3,userSelect:'none',transition:'color .12s'}} title={showContactId?'Masquer':'Afficher'}>{showContactId?'👁️‍🗨️':'👁️'}</span>
        {showContactId && <span onClick={_copy} style={{cursor:'pointer',padding:'2px 5px',borderRadius:4,fontSize:11,color:T.text3,userSelect:'none'}} title="Copier l'ID complet">📋</span>}
      </div>
    );
  })()}
</div>
)}

{/* ══ APPELS tab — call history grouped by date + SMS + recordings ══ */}
{phoneRightTab==='appels' && (
<div>
  {/* Redirect banner vers IA Copilot */}
  <div onClick={()=>setPhoneRightTab('ia')} style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#7C3AED08,#2563EB06)',border:'1px solid #7C3AED20',cursor:'pointer',marginBottom:10,display:'flex',alignItems:'center',gap:8,transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.borderColor='#7C3AED50'} onMouseLeave={e=>e.currentTarget.style.borderColor='#7C3AED20'}>
    <I n="cpu" s={18} style={{color:'#7C3AED'}}/>
    <div style={{flex:1}}>
      <div style={{fontSize:11,fontWeight:700,color:'#7C3AED'}}>Voir dans IA Copilot</div>
      <div style={{fontSize:9,color:T.text3}}>Historique, transcriptions, analyses et coaching</div>
    </div>
    <I n="arrow-right" s={14} style={{color:'#7C3AED'}}/>
  </div>
  {/* Call count header */}
  <div style={{display:'flex',alignItems:'center',gap:6,margin:'0 0 6px'}}>
    <I n="phone" s={10} style={{color:T.text3}}/>
    <span style={{fontSize:10,fontWeight:700,color:T.text3}}>Historique appels</span>
    <span style={{fontSize:9,color:T.text3,marginLeft:'auto'}}>{callsForNumber.length} total</span>
  </div>

  {/* Calls grouped by date with accordion */}
  {callsForNumber.length === 0 ? (
    <div style={{textAlign:'center',padding:12,fontSize:11,color:T.text3}}>Aucun appel</div>
  ) : (()=>{
    const today = new Date().toDateString();
    const groups = {};
    callsForNumber.forEach(c=>{
      const d = new Date(c.createdAt);
      const key = d.toDateString();
      const label = key===today?"Aujourd'hui":d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});
      if(!groups[key]) groups[key]={label,calls:[],isToday:key===today};
      groups[key].calls.push(c);
    });
    const groupKeys = Object.keys(groups);
    return groupKeys.map(key=>{
      const g=groups[key];
      const isOpen = g.isToday || ((typeof phoneRightAccordion!=='undefined'?phoneRightAccordion:null)||{})[key];
      return(
      <div key={key} style={{marginBottom:4}}>
        {!g.isToday && (
          <div onClick={()=>setPhoneRightAccordion(p=>({...p,[key]:!p?.[key]}))} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',borderRadius:8,cursor:'pointer',background:T.bg,marginBottom:2}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background=T.bg}>
            <I n={isOpen?'chevron-down':'chevron-right'} s={10} style={{color:T.text3}}/>
            <span style={{fontSize:10,fontWeight:700,color:T.text2,flex:1}}>{g.label}</span>
            <span style={{fontSize:9,fontWeight:600,color:T.text3,padding:'1px 6px',borderRadius:10,background:T.card}}>{g.calls.length}</span>
          </div>
        )}
        {g.isToday && <div style={{fontSize:9,fontWeight:700,color:T.accent,textTransform:'uppercase',letterSpacing:1,padding:'4px 8px',marginBottom:2}}>Aujourd'hui · {g.calls.length} appel{g.calls.length>1?'s':''}</div>}
        {(g.isToday || isOpen) && g.calls.map(c=>{
          const cMissed=c.status==='missed'||c.status==='no-answer';
          const cOut=c.direction==='outbound';
          const isCurrent=c.id===(typeof phoneCallDetailId!=='undefined'?phoneCallDetailId:null);
          return(
            <div key={c.id}>
            <div onClick={()=>{
              const willExpand = !iaHubCollapse?.['pipeCall_'+c.id];
              setIaHubCollapse(p=>({...p,['pipeCall_'+c.id]:willExpand}));
              // V1.9 UX — Auto-load transcript when expanding (covers LIVE-only without recording)
              if(willExpand && !_T.iaCallTranscripts?.[c.id]) {
                api('/api/voip/transcript/'+c.id).then(d=>{
                  if(!_T.iaCallTranscripts)_T.iaCallTranscripts={};
                  const _hasRec = !!((typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)?.[c.id]||c.recordingUrl);
                  _T.iaCallTranscripts[c.id] = d || (_hasRec?{_empty:true}:{_noRec:true});
                  setIaHubCollapse(p=>({...p,['pipeTr_'+c.id]:true}));
                }).catch(()=>{
                  if(!_T.iaCallTranscripts)_T.iaCallTranscripts={};
                  const _hasRec = !!((typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)?.[c.id]||c.recordingUrl);
                  _T.iaCallTranscripts[c.id] = _hasRec?{_empty:true}:{_noRec:true};
                  setIaHubCollapse(p=>({...p,['pipeTr_'+c.id]:true}));
                });
              } else if(willExpand) {
                setIaHubCollapse(p=>({...p,['pipeTr_'+c.id]:true}));
              }
            }} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',borderRadius:8,cursor:'pointer',marginBottom:2,marginLeft:g.isToday?0:8,background:isCurrent?T.accentBg:'transparent',border:isCurrent?'1px solid '+T.accent+'30':'1px solid transparent',transition:'all .1s'}} onMouseEnter={e=>{if(!isCurrent)e.currentTarget.style.background=T.bg;}} onMouseLeave={e=>{if(!isCurrent)e.currentTarget.style.background='transparent';}}>
              <I n={cOut?'phone-outgoing':'phone-incoming'} s={11} style={{color:cMissed?'#EF4444':cOut?'#2563EB':'#22C55E',flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:600,color:cMissed?'#EF4444':T.text}}>{cOut?'Sortant':'Entrant'}{cMissed?' - Manqué':''}</div>
                <div style={{fontSize:9,color:T.text3}}>{new Date(c.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
              </div>
              {!!(typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[c.id] && <span style={{fontSize:8,padding:'1px 4px',borderRadius:3,background:'#EF444412',color:'#EF4444',fontWeight:700}}>REC</span>}
              <span style={{fontSize:10,fontWeight:600,color:T.text3,fontFamily:'monospace'}}>{fmtDur3(c.duration)}</span>
              <I n={(typeof iaHubCollapse!=='undefined'?iaHubCollapse:null)['pipeCall_'+c.id]?'chevron-up':'chevron-down'} s={10} style={{color:T.text3}}/>
            </div>
            {(typeof iaHubCollapse!=='undefined'?iaHubCollapse:null)['pipeCall_'+c.id] && (
              <div style={{padding:'6px 10px 10px',marginLeft:g.isToday?0:8,marginBottom:4,display:'flex',flexDirection:'column',gap:5,background:T.bg+'80',borderRadius:'0 0 8px 8px'}}>
                {((typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[c.id]||c.recordingUrl) && <audio controls src={recUrl(c.id)} style={{width:'100%',height:28,borderRadius:6}} preload="none"/>}
                {(typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)[c.id]?.summary && <div style={{padding:'4px 8px',borderRadius:6,background:'#7C3AED08',border:'1px solid #7C3AED15',fontSize:10,color:T.text2,lineHeight:1.4}}><I n="cpu" s={9} style={{color:'#7C3AED'}}/> {(typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)[c.id].summary}</div>}
                <div onClick={(e)=>{
                  e.stopPropagation();
                  const hasRec=!!((typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[c.id]||c.recordingUrl);
                  if(_T.iaCallTranscripts?.[c.id]){setIaHubCollapse(p=>({...p,['pipeTr_'+c.id]:!p['pipeTr_'+c.id]}));return;}
                  // V1.9 UX FIX — Toujours fetch (transcripts LIVE-only existent même sans recording)
                  api('/api/voip/transcript/'+c.id).then(d=>{
                    if(!_T.iaCallTranscripts)_T.iaCallTranscripts={};
                    // Accepte aussi tr.live (live-only sans recording)
                    _T.iaCallTranscripts[c.id]= (d && (d.fullText||d.segments||d.live)) ? d : (hasRec?{_empty:true}:{_noRec:true});
                    setIaHubCollapse(p=>({...p,['pipeTr_'+c.id]:true}));
                  }).catch(()=>{
                    if(!_T.iaCallTranscripts)_T.iaCallTranscripts={};
                    _T.iaCallTranscripts[c.id]= hasRec?{_empty:true}:{_noRec:true};
                    setIaHubCollapse(p=>({...p,['pipeTr_'+c.id]:true}));
                  });
                }} style={{fontSize:10,color:'#3B82F6',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:3}}>
                  <I n="file-text" s={10}/> {_T.iaCallTranscripts?.[c.id]?'Masquer':'📝 Voir la transcription'}
                </div>
                {(typeof iaHubCollapse!=='undefined'?iaHubCollapse:null)['pipeTr_'+c.id] && _T.iaCallTranscripts?.[c.id] && (()=>{
                  const tr=_T.iaCallTranscripts[c.id];
                  if(tr._noRec) return <div style={{padding:'6px 8px',borderRadius:6,background:'#F59E0B08',border:'1px solid #F59E0B20',fontSize:10,color:'#F59E0B',lineHeight:1.4}}>⚠️ Pas de transcription disponible pour cet appel</div>;
                  if(tr._empty) return <div style={{padding:'6px 8px',borderRadius:6,background:T.bg,border:'1px solid '+T.border,fontSize:10,color:T.text3,textAlign:'center'}}>Aucune transcription trouvée</div>;
                  // V1.9 UX FIX — fallback sur tr.live (cas live-only renvoyé dans .live au lieu du flat)
                  const dataSrc = (tr.segments || tr.fullText) ? tr : (tr.live || tr);
                  const segs=dataSrc.segments||(dataSrc.segments_json?(()=>{try{return JSON.parse(dataSrc.segments_json);}catch{return[];}})():[]);
                  const fullText=segs.length>0?segs.map(s=>`[${s.speaker||'?'}] ${s.text}`).join('\n'):(dataSrc.fullText||'');
                  return <>
                    {segs.length>0?(
                      <div style={{maxHeight:120,overflowY:'auto',display:'flex',flexDirection:'column',gap:2}}>
                        {segs.map((seg,si)=>(
                          <div key={si} style={{display:'flex',flexDirection:'column',alignItems:(seg.speaker==='agent'||seg.speaker==='collab')?'flex-end':'flex-start'}}>
                            <div style={{maxWidth:'85%',padding:'3px 6px',borderRadius:6,background:(seg.speaker==='agent'||seg.speaker==='collab')?'#7C3AED12':T.bg,border:'1px solid '+T.border+'50',fontSize:10,color:T.text,lineHeight:1.3}}>{seg.text}</div>
                          </div>
                        ))}
                      </div>
                    ):dataSrc.fullText?<div style={{fontSize:10,color:T.text,lineHeight:1.4,maxHeight:120,overflowY:'auto',padding:'4px 8px',background:T.card,borderRadius:6,border:'1px solid '+T.border}}>{dataSrc.fullText}</div>
                    :<div style={{fontSize:9,color:T.text3,textAlign:'center'}}>Aucune transcription</div>}
                    {fullText&&<div onClick={(e)=>{e.stopPropagation();const blob=new Blob([fullText],{type:'text/plain'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='transcription-'+c.id+'.txt';a.click();URL.revokeObjectURL(url);}} style={{fontSize:10,color:'#059669',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:3}}><I n="download" s={10}/> Télécharger (.txt)</div>}
                  </>;
                })()}
                {!((typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[c.id]||c.recordingUrl) && <div style={{fontSize:9,color:'#F59E0B'}}>⚠️ Pas d'enregistrement — activez REC</div>}
                {!(typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)[c.id] && c.duration>15 && <div onClick={(e)=>{e.stopPropagation();generateCallAnalysis(c.id);}} style={{fontSize:10,color:'#7C3AED',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:3}}><I n="cpu" s={10}/> Générer analyse IA</div>}
              </div>
            )}
            </div>
          );
        })}
      </div>
      );
    });
  })()}

  {/* SMS link */}
  <div style={{display:'flex',alignItems:'center',gap:6,margin:'10px 0 6px'}}>
    <I n="message-square" s={10} style={{color:'#0EA5E9'}}/>
    <span style={{fontSize:10,fontWeight:700,color:T.text3}}>SMS</span>
  </div>
  <div onClick={()=>{setPhoneDialNumber(ctNum||ct.phone||ct.mobile||'');setPhoneSubTab('sms');}} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,cursor:'pointer',background:'#0EA5E908',border:'1px solid #0EA5E918',transition:'all .12s'}} onMouseEnter={e=>{e.currentTarget.style.background='#0EA5E914';}} onMouseLeave={e=>{e.currentTarget.style.background='#0EA5E908';}}>
    <div style={{width:28,height:28,borderRadius:8,background:'#0EA5E912',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><I n="send" s={12} style={{color:'#0EA5E9'}}/></div>
    <div style={{flex:1}}>
      <div style={{fontSize:11,fontWeight:600,color:T.text}}>Ouvrir la conversation</div>
      <div style={{fontSize:9,color:T.text3}}>Envoyer un SMS a {ct.name||fmtPhone(ctNum)}</div>
    </div>
    <I n="chevron-right" s={12} style={{color:T.text3}}/>
  </div>

  {/* Recordings */}
  {callsForNumber.some(c=>(typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[c.id]) && (
    <div style={{marginTop:12}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
        <I n="mic" s={11} style={{color:'#EF4444'}}/>
        <span style={{fontSize:11,fontWeight:700,color:T.text}}>Enregistrements</span>
      </div>
      {callsForNumber.filter(c=>(typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[c.id]).slice(0,5).map(c=>(
        <div key={c.id} style={{padding:'6px 8px',borderRadius:8,background:T.bg,marginBottom:4}}>
          <div style={{fontSize:10,fontWeight:600,color:T.text,marginBottom:4}}>{formatDate(c.createdAt)} · {fmtDur3(c.duration)}</div>
          <audio controls src={typeof phoneCallRecordings[c.id]==='string'?phoneCallRecordings[c.id]:phoneCallRecordings[c.id]?.url} style={{width:'100%',height:28,borderRadius:6}}/>
        </div>
      ))}
    </div>
  )}

  {/* SMS History */}
  {(()=>{
    const phone = ct?.phone || ct?.fromNumber || ct?.toNumber || '';
    if (!phone) return null;
    const cacheKey = 'sms_' + phone.replace(/\D/g,'').slice(-9);
    // Load SMS on first render of this contact
    if (!_T.smsCache) _T.smsCache = {};
    if (!_T.smsCache[cacheKey] && !_T.smsLoading?.[cacheKey]) {
      if (!_T.smsLoading) _T.smsLoading = {};
      _T.smsLoading[cacheKey] = true;
      api('/api/conversations/sms-history/' + encodeURIComponent(phone.replace(/\s/g,''))).then(msgs => {
        _T.smsCache[cacheKey] = msgs || [];
        delete _T.smsLoading[cacheKey];
        // Force re-render
        setPhoneRightAccordion(p => ({...p, _smsRefresh: Date.now()}));
      }).catch(() => { _T.smsCache[cacheKey] = []; delete _T.smsLoading[cacheKey]; });
    }
    const smsMessages = _T.smsCache[cacheKey] || [];
    return <div style={{marginTop:12,borderTop:'1px solid '+T.border,paddingTop:8}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
        <I n="message-square" s={11} style={{color:'#0EA5E9'}}/>
        <span style={{fontSize:11,fontWeight:700,color:T.text}}>SMS ({smsMessages.length})</span>
      </div>
      {smsMessages.length === 0 ? (
        <div style={{textAlign:'center',padding:10,fontSize:10,color:T.text3}}>Aucun SMS envoyé</div>
      ) : smsMessages.map(sms => (
        <div key={sms.id} style={{marginBottom:6,display:'flex',flexDirection:'column',alignItems:sms.direction==='outbound'?'flex-end':'flex-start'}}>
          <div style={{maxWidth:'85%',padding:'8px 10px',borderRadius:sms.direction==='outbound'?'10px 10px 2px 10px':'10px 10px 10px 2px',background:sms.direction==='outbound'?'#2563EB':'#E5E7EB',color:sms.direction==='outbound'?'#fff':'#1F2937',fontSize:11,lineHeight:1.4,wordBreak:'break-word'}}>
            {sms.content}
          </div>
          <div style={{fontSize:8,color:T.text3,marginTop:2,display:'flex',gap:4,alignItems:'center'}}>
            <span>{formatDateTime((sms.createdAt||'').split('T')[0], (sms.createdAt||'').split('T')[1]?.slice(0,5))}</span>
            {sms.status && <span style={{padding:'1px 4px',borderRadius:3,background:sms.status==='sent'||sms.status==='delivered'?'#22C55E18':'#F59E0B18',color:sms.status==='sent'||sms.status==='delivered'?'#22C55E':'#F59E0B',fontSize:7,fontWeight:700}}>{sms.status}</span>}
          </div>
        </div>
      ))}
    </div>;
  })()}
</div>
)}

{/* ══ ENREG tab — recording + transcript ══ */}
{phoneRightTab==='enreg' && (()=>{
const recordedCalls = callsForNumber.filter(c=>(typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[c.id] || c.recordingUrl);
const proxyUrl = (cl) => recUrl(cl.id);
const selCall = cl || callsForNumber[0];
return(
<div>
  <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:8}}>
    <I n="mic" s={12} style={{color:'#EF4444'}}/>
    <span style={{fontSize:11,fontWeight:700,color:T.text}}>Enregistrements ({recordedCalls.length})</span>
  </div>
  {recordedCalls.length === 0 ? (
    <div style={{textAlign:'center',padding:20,borderRadius:10,background:T.bg,marginBottom:10}}>
      <I n="mic-off" s={22} style={{color:T.text3,marginBottom:6}}/>
      <div style={{fontSize:11,color:T.text3}}>Aucun enregistrement</div>
      <div style={{fontSize:9,color:T.text3,marginTop:3}}>Activez REC pour enregistrer les appels</div>
    </div>
  ) : recordedCalls.map(c=>{
    const recUrl = typeof phoneCallRecordings[c.id]==='string' ? phoneCallRecordings[c.id] : (phoneCallRecordings[c.id]?.url || (c.recordingUrl ? proxyUrl(c) : null));
    const recDate = new Date(c.createdAt);
    const isOwner = c.collaboratorId === collab.id;
    const sharedWith = Array.isArray(c.shared_with_json) ? c.shared_with_json : (()=>{try{return JSON.parse(c.shared_with_json||'[]');}catch{return[];}})();
    const isShared = sharedWith.length > 0;
    return(
      <div key={c.id} data-rec-r="" style={{padding:'8px 10px',borderRadius:10,background:T.bg,marginBottom:6,border:'1px solid '+T.border}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
          <div style={{width:6,height:6,borderRadius:3,background:'#EF4444',boxShadow:'0 0 4px #EF444460'}}/>
          <span style={{fontSize:10,fontWeight:700,color:T.text}}>{recDate.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}</span>
          <span style={{fontSize:10,color:T.text3}}>{recDate.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
          {!isOwner && <span style={{fontSize:8,padding:'1px 5px',borderRadius:4,background:'#8B5CF620',color:'#8B5CF6',fontWeight:600}}>Partagé</span>}
          {isShared && isOwner && <span style={{fontSize:8,padding:'1px 5px',borderRadius:4,background:'#22C55E18',color:'#22C55E',fontWeight:600}}>Partagé ({sharedWith.length})</span>}
          <span style={{fontSize:9,color:T.text3,marginLeft:'auto',fontFamily:'monospace'}}>{fmtDur3(c.duration)}</span>
        </div>
        {recUrl && <audio controls src={recUrl} style={{width:'100%',height:28,borderRadius:6}} preload="none"/>}
        <div style={{display:'flex',alignItems:'center',gap:4,marginTop:4,flexWrap:'wrap'}}>
          <span style={{fontSize:8,color:T.text3,fontFamily:'monospace'}}>ID: {c.id.slice(-8)}</span>
          <span style={{fontSize:8,color:T.text3}}>· {c.direction==='outbound'?'Sortant':'Entrant'}</span>
          <div onClick={(e)=>{e.stopPropagation();if(!_T.transcriptCache)_T.transcriptCache={};if(!_T.transcriptOpen)_T.transcriptOpen={};const card=e.currentTarget.closest('[data-rec-r]');const ct=card.querySelector('[data-tr]');if(_T.transcriptOpen[c.id]){_T.transcriptOpen[c.id]=false;ct.style.display='none';return;}_T.transcriptOpen[c.id]=true;ct.style.display='block';if(_T.transcriptCache[c.id]&&(_T.transcriptCache[c.id].fullText||(_T.transcriptCache[c.id].segments&&_T.transcriptCache[c.id].segments.length))){const d=_T.transcriptCache[c.id];ct.innerHTML=(d.segments&&d.segments.length)?d.segments.map(s=>'<div style="margin-bottom:3px;font-size:9px"><b style="color:'+(s.speaker==='agent'||s.speaker==='collab'?'#6366F1':'#22C55E')+'">'+(s.speaker==='agent'||s.speaker==='collab'?'Vous':'Contact')+'</b> '+s.text+'</div>').join(''):'<div style="font-size:9px;color:#555;white-space:pre-wrap">'+d.fullText+'</div>';return;}ct.innerHTML='<div style="text-align:center;font-size:9px;color:#6366F1;padding:4px">Transcription en cours...</div>';api('/api/voip/transcript/'+c.id).then(d=>{if(!d||(!d.fullText&&(!d.segments||!d.segments.length))){return api('/api/voip/transcribe/'+c.id,{method:'POST'});}return d;}).then(d=>{_T.transcriptCache[c.id]=d;ct.innerHTML=d&&(d.fullText||(d.segments&&d.segments.length))?((d.segments&&d.segments.length)?d.segments.map(s=>'<div style="margin-bottom:3px;font-size:9px"><b style="color:'+(s.speaker==='agent'||s.speaker==='collab'?'#6366F1':'#22C55E')+'">'+(s.speaker==='agent'||s.speaker==='collab'?'Vous':'Contact')+'</b> '+s.text+'</div>').join(''):'<div style="font-size:9px;color:#555;white-space:pre-wrap">'+d.fullText+'</div>'):'<div style="text-align:center;font-size:9px;color:#999;padding:6px">Pas de transcription</div>';}).catch(()=>{ct.innerHTML='<div style="text-align:center;font-size:9px;color:#EF4444;padding:4px">Erreur</div>';});}} style={{cursor:'pointer',display:'flex',alignItems:'center',gap:3,padding:'1px 5px',borderRadius:4,background:T.bg,border:'1px solid '+T.border}}>
            <I n="file-text" s={8} style={{color:T.accent}}/><span style={{fontSize:7,color:T.accent,fontWeight:600}}>Transcript</span><I n="chevron-down" s={7} style={{color:T.accent}}/>
          </div>
          {isOwner && <div onClick={(e)=>{e.stopPropagation();
            const otherCollabs = (collabsProp||[]).filter(cb=>cb.id!==collab.id);
            if(otherCollabs.length===0){showNotif('Aucun autre collaborateur disponible','warning');return;}
            const currentShared = [...sharedWith];
            const names = otherCollabs.map(cb=>`${currentShared.includes(cb.id)?'✓':' '} ${cb.name||cb.email}`);
            const choice = prompt('Partager avec (entrez les numéros séparés par virgule) :\n'+otherCollabs.map((cb,i)=>`${i+1}. ${currentShared.includes(cb.id)?'[Partagé] ':''}${cb.name||cb.email}`).join('\n'));
            if(!choice)return;
            const indices = choice.split(',').map(s=>parseInt(s.trim())-1).filter(i=>i>=0&&i<otherCollabs.length);
            const newShared = indices.map(i=>otherCollabs[i].id);
            api(`/api/voip/calls/${c.id}/share`,{method:'POST',body:{collaboratorIds:newShared}}).then(d=>{
              if(d?.success){showNotif(`Enregistrement partagé avec ${newShared.length} collaborateur(s)`,'success');setVoipCallLogs(prev=>prev.map(cl=>cl.id===c.id?{...cl,shared_with_json:JSON.stringify(newShared)}:cl));}
            }).catch(()=>showNotif('Erreur de partage','error'));
          }} style={{marginLeft:'auto',cursor:'pointer',display:'flex',alignItems:'center',gap:3,padding:'2px 6px',borderRadius:5,background:isShared?'#8B5CF610':'transparent',border:'1px solid '+(isShared?'#8B5CF630':T.border)}} title="Partager cet enregistrement">
            <I n="share-2" s={10} style={{color:isShared?'#8B5CF6':T.text3}}/>
            <span style={{fontSize:8,color:isShared?'#8B5CF6':T.text3}}>Partager</span>
          </div>}
        </div>
        <div data-tr="" style={{display:'none',marginTop:6,maxHeight:150,overflow:'auto',borderRadius:6,background:T.card||'#fafafa',border:'1px solid '+T.border,padding:4}}/>
      </div>
    );
  })}

  {/* ═══ TRANSCRIPTION LIVE ═══ */}
  {(
    <div style={{marginTop:12,borderRadius:10,border:'2px solid #EF444440',overflow:'hidden',background:'linear-gradient(135deg,#EF444404,transparent)'}}>
      <div style={{padding:'8px 10px',background:'#EF444408',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid #EF444420'}}>
        <I n="radio" s={12} style={{color:'#EF4444'}}/>
        <span style={{fontSize:11,fontWeight:700,color:T.text}}>Transcription Live</span>
        <span style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:3}}>
          <span style={{width:5,height:5,borderRadius:3,background:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'#EF4444':'#9CA3AF',animation:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'pulse 1.5s infinite':'none'}}/>
          <span style={{fontSize:9,fontWeight:700,color:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'#EF4444':'#9CA3AF'}}>{(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'EN DIRECT':'EN ATTENTE'}</span>
        </span>
      </div>
      <div style={{maxHeight:200,overflow:'auto',padding:8}} ref={el=>{if(el)el.scrollTop=el.scrollHeight}}>
        {(typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:{}).length > 0 ? (typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:{}).map((t,i)=>(
          <div key={i} style={{marginBottom:5,padding:'4px 8px',borderRadius:7,background:t.speaker==='me'?T.accentBg+'60':'#22C55E08'}}>
            <div style={{fontSize:9,fontWeight:700,color:t.speaker==='me'?T.accent:'#22C55E',marginBottom:1}}>{t.speaker==='me'?'Vous':'Contact'}</div>
            <div style={{fontSize:10,color:T.text,lineHeight:1.4}}>{t.text}</div>
          </div>
        )) : (typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) ? (
          <div style={{textAlign:'center',padding:16,color:T.text3}}>
            <div style={{fontSize:16,marginBottom:4}}>🎤</div>
            <div style={{fontSize:10,fontWeight:600}}>En écoute...</div>
            <div style={{fontSize:9,marginTop:2}}>Les paroles apparaîtront en direct</div>
          </div>
        ) : (
          <div style={{textAlign:'center',padding:16,color:T.text3}}>
            <div style={{fontSize:16,marginBottom:4}}>🎙️</div>
            <div style={{fontSize:10,fontWeight:600}}>En attente d'un appel</div>
            <div style={{fontSize:9,marginTop:2}}>Lancez un appel pour voir la transcription en direct</div>
          </div>
        )}
      </div>
      {/* ── Indicateur activité vocale ── */}
      {(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (
        <div style={{padding:'8px 10px',borderTop:'1px solid #EF444415',display:'flex',gap:8}}>
          {/* Vous */}
          <div style={{flex:1,padding:'6px 8px',borderRadius:8,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?'linear-gradient(135deg,'+T.accent+'15,'+T.accent+'08)':T.bg,border:'1px solid '+((typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent+'40':T.border),transition:'all .3s'}}>
            <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:3}}>
              <div style={{width:6,height:6,borderRadius:3,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent:'#D1D5DB',transition:'all .3s',boxShadow:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?'0 0 6px '+T.accent+'60':'none'}}/>
              <span style={{fontSize:9,fontWeight:700,color:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent:T.text3}}>Vous</span>
            </div>
            <div style={{display:'flex',gap:2,alignItems:'end',height:16}}>
              {[0.4,0.7,1,0.8,0.5,0.9,0.6,0.3,0.7,1,0.5,0.8].map((h,i)=>(
                <div key={i} style={{flex:1,borderRadius:1,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent:'#E5E7EB',height:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?(h*16)+'px':'3px',transition:'height .15s ease',opacity:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?0.6+Math.random()*0.4:0.3,animation:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?`pulse ${0.3+i*0.1}s ease infinite alternate`:'none'}}/>
              ))}
            </div>
            {/* V1.9 UX — Toujours afficher état lisible (texte interim si dispo, sinon état explicite) */}
            <div style={{fontSize:8,marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',opacity:0.7,fontStyle:'italic',color:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).meText?T.accent:T.text3}}>
              {(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).meText
                ? (typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).meText.slice(0,40)+'...'
                : ((typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me ? 'Vous avez parlé récemment' : 'En écoute...')}
            </div>
          </div>
          {/* Contact */}
          <div style={{flex:1,padding:'6px 8px',borderRadius:8,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'linear-gradient(135deg,#22C55E15,#22C55E08)':T.bg,border:'1px solid '+((typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E40':T.border),transition:'all .3s'}}>
            <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:3}}>
              <div style={{width:6,height:6,borderRadius:3,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E':'#D1D5DB',transition:'all .3s',boxShadow:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'0 0 6px #22C55E60':'none'}}/>
              <span style={{fontSize:9,fontWeight:700,color:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E':T.text3}}>Contact</span>
            </div>
            <div style={{display:'flex',gap:2,alignItems:'end',height:16}}>
              {[0.6,0.9,0.5,1,0.7,0.4,0.8,0.6,1,0.5,0.7,0.9].map((h,i)=>(
                <div key={i} style={{flex:1,borderRadius:1,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E':'#E5E7EB',height:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?(h*16)+'px':'3px',transition:'height .15s ease',opacity:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?0.6+Math.random()*0.4:0.3,animation:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?`pulse ${0.3+i*0.1}s ease infinite alternate`:'none'}}/>
              ))}
            </div>
            {/* V1.9 UX — Toujours afficher état lisible (texte interim si dispo, sinon état explicite) */}
            <div style={{fontSize:8,marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',opacity:0.7,fontStyle:'italic',color:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contactText?'#22C55E':T.text3}}>
              {(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contactText
                ? (typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contactText.slice(0,40)+'...'
                : ((typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact ? 'Client a parlé récemment' : 'En écoute...')}
            </div>
          </div>
        </div>
      )}
    </div>
  )}

  {/* V1.9 UX — Fallback empty state (toujours visible pendant appel actif si 0 suggestion pending) */}
  {(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='pending').length === 0 && (
    <div style={{marginTop:10,padding:'8px 10px',borderRadius:8,background:T.bg,border:'1px dashed '+T.border,display:'flex',alignItems:'center',gap:6}}>
      <I n="zap" s={11} style={{color:T.text3}}/>
      <span style={{fontSize:10,fontWeight:700,color:T.text2}}>Suggestions IA</span>
      <span style={{fontSize:9,color:T.text3,fontStyle:'italic',marginLeft:'auto'}}>Aucune suggestion pour le moment — l'IA continue d'analyser…</span>
    </div>
  )}

  {/* ═══ V1.5: FILE DE SUGGESTIONS DÉTECTÉES ═══ */}
  {(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='pending').length > 0 && (
    <div style={{marginTop:10}}>
      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
        <I n="zap" s={11} style={{color:'#F59E0B'}}/>
        <span style={{fontSize:10,fontWeight:700,color:T.text}}>Suggestions ({(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='pending').length})</span>
        {(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='pending').length > 1 && <span onClick={()=>(typeof setPhoneLiveSuggestions==='function'?setPhoneLiveSuggestions:function(){})(prev=>prev.map(s=>s.status==='pending'?{...s,status:'dismissed'}:s))} style={{marginLeft:'auto',cursor:'pointer',fontSize:8,color:T.text3,padding:'2px 6px',borderRadius:4,background:T.bg,border:'1px solid '+T.border}}>Tout ignorer</span>}
      </div>
      {/* Max 5 suggestions visibles, triées par priorité: rdv > rappel > document > note */}
      {(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='pending').sort((a,b)=>{const p={urgence:0,resiliation:1,accord:2,insatisfaction:3,objection:4,rdv:5,devis:6,renouvellement:7,decideur:8,besoin:9,interet:10,echeance:11,rappel:12,relance_auto:13,email_dicte:14,tel_dicte:15,document:16,piece_demandee:17,paiement:18,qualification:19,recommandation:20,disponibilite:21,adresse:22,entreprise_info:23,canal:24,transfert:25,langue:26,satisfaction:27,note:28};const typeDiff=(p[a.type]??99)-(p[b.type]??99);if(typeDiff!==0)return typeDiff;return(b.score||1)-(a.score||1);}).slice(0,8).map(sug=>(
        <div key={sug.id} style={{marginBottom:6,borderRadius:8,border:`1.5px solid ${sug.confidence==='high'?sug.color+'60':sug.confidence==='medium'?sug.color+'35':sug.color+'20'}`,background:`linear-gradient(135deg,${sug.color}${sug.confidence==='high'?'0A':'04'},transparent)`,overflow:'hidden'}}>
          <div style={{padding:'6px 8px',display:'flex',alignItems:'center',gap:5}}>
            <I n={sug.icon} s={11} style={{color:sug.color}}/>
            <span style={{fontSize:9,fontWeight:700,color:sug.color}}>{sug.label}</span>
            {sug._fusionCount > 1 && <span style={{fontSize:7,fontWeight:700,padding:'1px 4px',borderRadius:3,background:sug.color+'18',color:sug.color}}>×{sug._fusionCount}</span>}
            {sug.confidence && <span style={{fontSize:7,fontWeight:600,padding:'1px 4px',borderRadius:3,background:sug.confidence==='high'?'#22C55E18':sug.confidence==='medium'?'#F59E0B18':'#EF444418',color:sug.confidence==='high'?'#22C55E':sug.confidence==='medium'?'#F59E0B':'#EF4444'}}>{sug.confidence==='high'?'▲':'●'}</span>}
            <span style={{fontSize:8,color:T.text3,marginLeft:'auto'}}>{new Date(sug.updatedAt||sug.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
          </div>
          <div style={{padding:'0 8px 6px'}}>
            <div style={{fontSize:8,color:T.text3,fontStyle:'italic',marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>"{sug.phrase}"</div>
            {sug.entities?.contactName && <div style={{fontSize:9,color:T.text2,marginBottom:2}}><I n="user" s={8} style={{color:T.text3}}/> {sug.entities.contactName}</div>}
            {sug.entities?.date && <div style={{fontSize:9,fontWeight:600,color:sug.color}}><I n="calendar" s={8}/> {new Date(sug.entities.date+'T12:00').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})}{sug.entities?.time ? ' à '+sug.entities.time : ''}</div>}
            {sug.entities?.amount && <div style={{fontSize:9,fontWeight:700,color:'#F97316'}}><I n="receipt" s={8}/> {Number(sug.entities.amount).toLocaleString('fr-FR')} €</div>}
            {sug.entities?.decideur && <div style={{fontSize:9,fontWeight:600,color:'#7C3AED'}}><I n="user-check" s={8}/> Décideur: {sug.entities.decideur}</div>}
            {sug.entities?.address && <div style={{fontSize:9,fontWeight:600,color:'#0EA5E9'}}><I n="map-pin" s={8}/> {sug.entities.address}</div>}
            {sug.entities?.company && <div style={{fontSize:9,fontWeight:600,color:'#2563EB'}}><I n="building-2" s={8}/> {sug.entities.company}{sug.entities.siret?' · SIRET: '+sug.entities.siret:''}</div>}
            {sug.entities?.besoin && <div style={{fontSize:9,fontWeight:600,color:'#8B5CF6'}}><I n="target" s={8}/> {sug.entities.besoin}</div>}
            {sug.entities?.delay && <div style={{fontSize:9,fontWeight:600,color:'#F59E0B'}}><I n="clock" s={8}/> Relance dans {sug.entities.delay}</div>}
            {sug.entities?.paiement && <div style={{fontSize:9,fontWeight:600,color:'#059669'}}><I n="credit-card" s={8}/> {sug.entities.paiement}</div>}
            {sug.entities?.effectif && <div style={{fontSize:9,fontWeight:600,color:'#0EA5E9'}}><I n="users" s={8}/> {sug.entities.effectif}</div>}
            {sug.entities?.secteur && <div style={{fontSize:9,fontWeight:600,color:'#0EA5E9'}}><I n="briefcase" s={8}/> {sug.entities.secteur}</div>}
            {sug.entities?.produit && <div style={{fontSize:9,fontWeight:600,color:'#F59E0B'}}><I n="star" s={8}/> {sug.entities.produit}</div>}
            {sug.entities?.canal && <div style={{fontSize:9,fontWeight:600,color:'#0EA5E9'}}><I n="message-circle" s={8}/> Canal: {sug.entities.canal}</div>}
            {sug.entities?.dispo && <div style={{fontSize:9,fontWeight:600,color:sug.entities.indispo?'#EF4444':'#0EA5E9'}}><I n="calendar" s={8}/> {sug.entities.indispo?'Indispo: ':'Dispo: '}{sug.entities.dispo}</div>}
            {sug.entities?.referral && <div style={{fontSize:9,fontWeight:600,color:'#8B5CF6'}}><I n="users" s={8}/> Référent: {sug.entities.referral}</div>}
            {sug.entities?.email && sug.type==='email_dicte' && <div style={{fontSize:9,fontWeight:600,color:'#6366F1'}}><I n="at-sign" s={8}/> {sug.entities.email}</div>}
            {sug.entities?.phone && sug.type==='tel_dicte' && <div style={{fontSize:9,fontWeight:600,color:'#22C55E'}}><I n="phone" s={8}/> {sug.entities.phone}</div>}
            {sug.entities?.document_demande && <div style={{fontSize:9,fontWeight:600,color:'#F97316'}}><I n="paperclip" s={8}/> {sug.entities.document_demande}</div>}
            {sug.entities?.echeance && <div style={{fontSize:9,fontWeight:600,color:'#EF4444'}}><I n="alarm-clock" s={8}/> Échéance: {new Date(sug.entities.echeance+'T12:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</div>}
            {sug.entities?.langue && <div style={{fontSize:9,fontWeight:600,color:'#6366F1'}}><I n="globe" s={8}/> {sug.entities.langue}</div>}
            <div style={{display:'flex',gap:4,marginTop:5}}>
              {sug.type==='rdv' && <div onClick={()=>{
                const e=sug.entities||{};
                setPhoneScheduleForm({contactId:e.contactId,contactName:e.contactName,number:e.contactPhone,date:e.date||new Date(Date.now()+86400000).toISOString().split('T')[0],time:e.time||'10:00',duration:30,notes:'RDV détecté: '+sug.phrase,calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});
                setPhoneShowScheduleModal(true);
                setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));
              }} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="calendar-plus" s={9}/> Créer RDV</div>}
              {sug.type==='document' && !sug._composing && <div onClick={()=>{
                const tpl = ((typeof liveConfig!=='undefined'?liveConfig:{}).documentTemplates||[])[0] || _defaultLiveConfig.documentTemplates[0];
                const _r = (t,e) => t.replace(/\{contact\}/g,e.contactName||'').replace(/\{company\}/g,(company||{}).name||'Calendar360').replace(/\{collab\}/g,collab?.name||'');
                setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,_composing:true,_selectedTpl:tpl.id,_emailTo:s.entities?.contactEmail||'',_emailSubject:_r(tpl.subject,s.entities||{}),_emailBody:_r(tpl.body,s.entities||{})}:{...s,_editing:false,_composing:false}));
              }} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="mail" s={9}/> Composer</div>}
              {sug.type==='document' && sug._composing && <div style={{width:'100%',marginTop:4}}>
                {/* Sélecteur de template */}
                <div style={{marginBottom:4}}>
                  <select value={sug._selectedTpl||''} onChange={(ev)=>{
                    const tpl = ((typeof liveConfig!=='undefined'?liveConfig:{}).documentTemplates||_defaultLiveConfig.documentTemplates).find(t=>t.id===ev.target.value);
                    if(!tpl)return;
                    const _r=(t,e)=>t.replace(/\{contact\}/g,e.contactName||'').replace(/\{company\}/g,(company||{}).name||'Calendar360').replace(/\{collab\}/g,collab?.name||'');
                    setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,_selectedTpl:tpl.id,_emailSubject:_r(tpl.subject,s.entities||{}),_emailBody:_r(tpl.body,s.entities||{}),_tplFlash:true}:s));
                    setTimeout(()=>setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,_tplFlash:false}:s)),600);
                  }} style={{width:'100%',fontSize:9,padding:'4px 8px',borderRadius:5,border:'1px solid '+T.accent+'40',background:T.accent+'08',color:T.text,fontFamily:'inherit',fontWeight:600}}>
                    {((typeof liveConfig!=='undefined'?liveConfig:{}).documentTemplates||_defaultLiveConfig.documentTemplates).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {sug._tplFlash && <div style={{fontSize:8,color:'#22C55E',fontWeight:600,marginTop:2,animation:'fadeIn .3s ease'}}>✓ Template appliqué</div>}
                </div>
                <div style={{marginBottom:3,transition:'all .3s'}}><input value={sug._emailTo||''} onChange={(ev)=>setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,_emailTo:ev.target.value}:s))} placeholder="Email" style={{width:'100%',fontSize:9,padding:'4px 8px',borderRadius:5,border:'1px solid '+(sug._tplFlash?'#22C55E40':T.border),background:sug._tplFlash?'#22C55E06':T.bg,color:T.text,fontFamily:'inherit',transition:'all .3s'}}/></div>
                <div style={{marginBottom:3}}><input value={sug._emailSubject||''} onChange={(ev)=>setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,_emailSubject:ev.target.value}:s))} placeholder="Objet" style={{width:'100%',fontSize:9,padding:'4px 8px',borderRadius:5,border:'1px solid '+T.border,background:T.bg,color:T.text,fontFamily:'inherit'}}/></div>
                <textarea value={sug._emailBody||''} onChange={(ev)=>setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,_emailBody:ev.target.value}:s))} style={{width:'100%',fontSize:9,padding:'5px 8px',borderRadius:5,border:'1px solid '+T.border,background:T.bg,color:T.text,resize:'vertical',minHeight:50,fontFamily:'inherit'}} rows={3}/>
                <div style={{display:'flex',gap:4,marginTop:4}}>
                  <div onClick={()=>{
                    const _to=sug._emailTo||'';
                    if(!_to.trim()){showNotif('Email du contact requis','danger');return;}
                    const _subj=(sug._emailSubject||'').trim()||'Suite à notre échange — '+((company||{}).name||'Calendar360');
                    const _body=(sug._emailBody||'').trim()||'Bonjour,\n\nJe vous envoie les informations comme convenu.\n\nCordialement,\n'+(collab?.name||'');
                    window.open('mailto:'+_to+'?subject='+encodeURIComponent(_subj)+'&body='+encodeURIComponent(_body));
                    api('/api/data/suggestion-action',{method:'POST',body:{type:'document',action:'email_sent',contactId:sug.entities?.contactId,contactName:sug.entities?.contactName,detail:JSON.stringify({to:_to,subject:_subj,template:sug._selectedTpl})}}).catch(()=>{});
                    setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done',_composing:false}:s));
                    showNotif('Email ouvert + action loggée','success');
                  }} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:'#8B5CF6',color:'#fff',textAlign:'center'}}><I n="send" s={9}/> Envoyer</div>
                  <div onClick={()=>setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,_composing:false}:s))} style={{padding:'4px 8px',borderRadius:6,fontSize:9,cursor:'pointer',color:T.text3,background:T.bg,border:'1px solid '+T.border}}>Annuler</div>
                </div>
              </div>}
              {sug.type==='rappel' && <div onClick={()=>{
                const e=sug.entities||{};
                setPhoneScheduleForm({contactId:e.contactId,contactName:e.contactName,number:e.contactPhone,date:e.date||new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:15,notes:'Rappel: '+sug.phrase,calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});
                setPhoneShowScheduleModal(true);
                setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));
              }} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="phone-callback" s={9}/> Planifier</div>}
              {sug.type==='note' && !sug._editing && <div onClick={()=>setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,_editing:true,_editText:sug.phrase}:{...s,_editing:false,_composing:false}))} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="edit-3" s={9}/> Ajouter note</div>}
              {sug.type==='note' && sug._editing && <div style={{width:'100%',marginTop:4}}>
                <textarea value={sug._editText||''} onChange={(ev)=>setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,_editText:ev.target.value}:s))} style={{width:'100%',fontSize:9,padding:'5px 8px',borderRadius:6,border:'1px solid '+T.border,background:T.bg,color:T.text,resize:'vertical',minHeight:36,fontFamily:'inherit'}} rows={2}/>
                <div style={{display:'flex',gap:4,marginTop:4}}>
                  <div onClick={()=>{const e=sug.entities||{};const txt=(sug._editText||'').trim();if(e.contactId&&txt){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] '+txt});api('/api/data/suggestion-action',{method:'POST',body:{type:'note',action:'note_added',contactId:e.contactId,contactName:e.contactName,detail:txt}}).catch(()=>{});showNotif('Note ajoutée','success');}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done',_editing:false}:s));}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:'#22C55E',color:'#fff',textAlign:'center'}}><I n="check" s={9}/> Confirmer</div>
                  <div onClick={()=>setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,_editing:false}:s))} style={{padding:'4px 8px',borderRadius:6,fontSize:9,cursor:'pointer',color:T.text3,background:T.bg,border:'1px solid '+T.border}}>Annuler</div>
                </div>
              </div>}
              {/* Devis */}
              {sug.type==='devis' && <div onClick={()=>{const e=sug.entities||{};const amt=prompt('Montant du devis (€) :',e.amount||'');if(amt===null)return;const email=e.contactEmail||prompt('Email du contact :')||'';if(!email){showNotif('Email requis','danger');return;}window.open('mailto:'+email+'?subject='+encodeURIComponent('Devis — '+((company||{}).name||'Calendar360'))+'&body='+encodeURIComponent('Bonjour '+(e.contactName||'')+',\n\nSuite à notre échange, veuillez trouver ci-joint notre devis d\'un montant de '+amt+' €.\n\nCordialement,\n'+(collab?.name||'')));api('/api/data/suggestion-action',{method:'POST',body:{type:'devis',action:'devis_sent',contactId:e.contactId,contactName:e.contactName,detail:JSON.stringify({amount:amt,email})}}).catch(()=>{});setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Devis préparé','success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="receipt" s={9}/> Envoyer devis</div>}
              {/* Décideur */}
              {sug.type==='decideur' && <div onClick={()=>{const e=sug.entities||{};const decideur=prompt('Nom du décideur :',e.decideur||'');if(!decideur)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 👤 Décideur identifié: '+decideur});}api('/api/data/suggestion-action',{method:'POST',body:{type:'decideur',action:'decideur_noted',contactId:e.contactId,contactName:e.contactName,detail:decideur}}).catch(()=>{});setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Décideur noté: '+decideur,'success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="user-check" s={9}/> Noter décideur</div>}
              {/* Objection */}
              {sug.type==='objection' && <div onClick={()=>{const e=sug.entities||{};if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] ⚠️ Objection: '+sug.phrase});}api('/api/data/suggestion-action',{method:'POST',body:{type:'objection',action:'objection_logged',contactId:e.contactId,contactName:e.contactName,detail:sug.phrase}}).catch(()=>{});setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Objection notée','success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="alert-triangle" s={9}/> Noter objection</div>}
              {/* Accord verbal */}
              {sug.type==='accord' && <div onClick={()=>{const e=sug.entities||{};if(e.contactId){handlePipelineStageChange(e.contactId,'client_valide','Accord verbal détecté: '+sug.phrase);}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="check-circle" s={9}/> Client Validé</div>}
              {/* Adresse détectée */}
              {sug.type==='adresse' && <div onClick={()=>{const e=sug.entities||{};const addr=prompt('Adresse détectée :',e.address||sug.phrase);if(!addr)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{address:addr});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Adresse enregistrée','success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="map-pin" s={9}/> Enregistrer adresse</div>}
              {/* Info entreprise */}
              {sug.type==='entreprise_info' && <div onClick={()=>{const e=sug.entities||{};const company_name=prompt('Nom de la société :',e.company||'');if(!company_name)return;const updates={company:company_name,contact_type:'btb'};if(e.siret)updates.siret=e.siret;if(e.contactId){handleCollabUpdateContact(e.contactId,updates);}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Entreprise enregistrée: '+company_name,'success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="building-2" s={9}/> Enregistrer société</div>}
              {/* Besoin identifié */}
              {sug.type==='besoin' && <div onClick={()=>{const e=sug.entities||{};const besoin=prompt('Besoin identifié :',e.besoin||sug.phrase);if(!besoin)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 📋 Besoin: '+besoin});}api('/api/data/suggestion-action',{method:'POST',body:{type:'besoin',action:'besoin_noted',contactId:e.contactId,contactName:e.contactName,detail:besoin}}).catch(()=>{});setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Besoin noté','success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="target" s={9}/> Noter besoin</div>}
              {/* Urgence */}
              {sug.type==='urgence' && <div onClick={()=>{const e=sug.entities||{};if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] ⏰ URGENT: '+sug.phrase,next_action_type:'call',next_action_label:'Urgent - Rappeler',next_action_done:0});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Marqué URGENT','success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="zap" s={9}/> Marquer urgent</div>}
              {/* Relance auto */}
              {sug.type==='relance_auto' && <div onClick={()=>{const e=sug.entities||{};const date=e.date||new Date(Date.now()+7*86400000).toISOString().split('T')[0];if(e.contactId){handleCollabUpdateContact(e.contactId,{next_action_type:'relance',next_action_label:'Relancer le '+new Date(date).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}),next_action_done:0,next_action_date:date,nrp_next_relance:date});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Relance programmée: '+new Date(date).toLocaleDateString('fr-FR'),'success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="clock" s={9}/> Programmer relance</div>}
              {/* Paiement */}
              {sug.type==='paiement' && <div onClick={()=>{const e=sug.entities||{};const mode=e.paiement||prompt('Mode de paiement :');if(!mode)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 💳 Paiement: '+mode});}api('/api/data/suggestion-action',{method:'POST',body:{type:'paiement',action:'paiement_noted',contactId:e.contactId,detail:mode}}).catch(()=>{});setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Mode de paiement noté: '+mode,'success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="credit-card" s={9}/> Noter paiement</div>}
              {/* Transfert */}
              {sug.type==='transfert' && <div onClick={()=>{showNotif('Fonctionnalité de transfert d\'appel à venir','info');setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="phone-forwarded" s={9}/> Transférer</div>}
              {/* Satisfaction */}
              {sug.type==='satisfaction' && <div onClick={()=>{const e=sug.entities||{};if(e.contactId){const ct=(contacts||[]).find(c=>c.id===e.contactId);const newRating=Math.min(5,(ct?.rating||3)+1);handleCollabUpdateContact(e.contactId,{rating:newRating,notes:((ct?.notes)||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 😊 Satisfaction: '+sug.phrase});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Satisfaction notée + rating augmenté','success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="smile" s={9}/> Noter satisfaction</div>}
              {/* Insatisfaction */}
              {sug.type==='insatisfaction' && <div onClick={()=>{const e=sug.entities||{};if(e.contactId){const ct=(contacts||[]).find(c=>c.id===e.contactId);const newRating=Math.max(1,(ct?.rating||3)-1);handleCollabUpdateContact(e.contactId,{rating:newRating,notes:((ct?.notes)||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 😤 Insatisfaction: '+sug.phrase});}api('/api/data/suggestion-action',{method:'POST',body:{type:'insatisfaction',action:'insatisfaction_logged',contactId:e.contactId,contactName:e.contactName,detail:sug.phrase}}).catch(()=>{});setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Insatisfaction notée + alerte créée','success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="frown" s={9}/> Signaler</div>}
              {/* Qualification */}
              {sug.type==='qualification' && <div onClick={()=>{const e=sug.entities||{};const updates={};if(e.effectif){updates.notes=((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 📊 '+e.effectif+(e.secteur?' · Secteur: '+e.secteur:'')+(e.ca?' · CA: '+e.ca:'');}if(e.contactId)handleCollabUpdateContact(e.contactId,updates);api('/api/data/suggestion-action',{method:'POST',body:{type:'qualification',action:'qualification_noted',contactId:e.contactId,detail:JSON.stringify(e)}}).catch(()=>{});setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Qualification enregistrée','success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="bar-chart-2" s={9}/> Enregistrer</div>}
              {/* Intérêt produit */}
              {sug.type==='interet' && <div onClick={()=>{const e=sug.entities||{};const produit=prompt('Produit/offre d\'intérêt :',e.produit||'');if(!produit)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 🎯 Intéressé par: '+produit});}api('/api/data/suggestion-action',{method:'POST',body:{type:'interet',action:'interet_noted',contactId:e.contactId,detail:produit}}).catch(()=>{});setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Intérêt noté: '+produit,'success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="star" s={9}/> Noter intérêt</div>}
              {/* Canal préféré */}
              {sug.type==='canal' && <div onClick={()=>{const e=sug.entities||{};const canal=e.canal||prompt('Canal préféré :');if(!canal)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 📱 Canal préféré: '+canal});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Canal préféré noté: '+canal,'success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="message-circle" s={9}/> Noter canal</div>}
              {/* Disponibilité */}
              {sug.type==='disponibilite' && <div onClick={()=>{const e=sug.entities||{};const info=(e.indispo?'❌ Indisponible: ':'✅ Disponible: ')+(e.dispo||sug.phrase);if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] '+info});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Disponibilité notée','success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="calendar" s={9}/> Noter dispo</div>}
              {/* Recommandation */}
              {sug.type==='recommandation' && <div onClick={()=>{const e=sug.entities||{};const name=prompt('Nom du contact recommandé :',e.referral||'');if(!name)return;const newId='ct'+Date.now();const nc={id:newId,companyId:company?.id,name:name.trim(),firstname:name.split(' ')[0]||'',lastname:name.split(' ').slice(1).join(' ')||'',pipeline_stage:'nouveau',source:'referral',notes:'Recommandé par '+(e.contactName||'un contact'),assignedTo:collab?.id,createdAt:new Date().toISOString()};api('/api/data/contacts',{method:'POST',body:nc}).then(r=>{if(r?.id||r?.success){setContacts(p=>[...p,{...nc,tags:[],shared_with:[]}]);showNotif('Contact créé: '+name,'success');}}).catch(()=>showNotif('Erreur','danger'));if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 🤝 A recommandé: '+name});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="user-plus" s={9}/> Créer contact</div>}
              {/* Email dicté */}
              {sug.type==='email_dicte' && <div onClick={()=>{const e=sug.entities||{};const email=prompt('Email détecté :',e.email||'');if(!email)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{email});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Email enregistré: '+email,'success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="at-sign" s={9}/> Enregistrer email</div>}
              {/* Téléphone dicté */}
              {sug.type==='tel_dicte' && <div onClick={()=>{const e=sug.entities||{};const phone=prompt('Numéro détecté :',e.phone||'');if(!phone)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{phone});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Téléphone enregistré: '+phone,'success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="phone" s={9}/> Enregistrer n°</div>}
              {/* Renouvellement */}
              {sug.type==='renouvellement' && <div onClick={()=>{const e=sug.entities||{};if(e.contactId){handlePipelineStageChange(e.contactId,'client_valide','Renouvellement: '+sug.phrase);}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="refresh-cw" s={9}/> Renouveler</div>}
              {/* Résiliation */}
              {sug.type==='resiliation' && <div onClick={()=>{const e=sug.entities||{};const reason=prompt('Motif de résiliation :',sug.phrase);if(!reason)return;if(e.contactId){api(`/api/data/contacts/${e.contactId}/cancel-contract`,{method:'PUT',body:{reason}}).then(r=>{if(r?.success){handleCollabUpdateContact(e.contactId,{contract_status:'cancelled',pipeline_stage:'perdu'});showNotif('Contrat annulé','success');}}).catch(()=>showNotif('Erreur','danger'));}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="x-octagon" s={9}/> Résilier</div>}
              {/* Pièce demandée */}
              {sug.type==='piece_demandee' && <div onClick={()=>{const e=sug.entities||{};const doc=e.document_demande||'document';const email=e.contactEmail||prompt('Email du contact :');if(!email)return;window.open('mailto:'+email+'?subject='+encodeURIComponent(doc.charAt(0).toUpperCase()+doc.slice(1)+' — '+((company||{}).name||'Calendar360'))+'&body='+encodeURIComponent('Bonjour '+(e.contactName||'')+',\n\nVeuillez trouver ci-joint le '+doc+' demandé.\n\nCordialement,\n'+(collab?.name||'')));api('/api/data/suggestion-action',{method:'POST',body:{type:'piece_demandee',action:'doc_sent',contactId:e.contactId,detail:doc}}).catch(()=>{});setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Email préparé pour: '+doc,'success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="paperclip" s={9}/> Envoyer doc</div>}
              {/* Échéance */}
              {sug.type==='echeance' && <div onClick={()=>{const e=sug.entities||{};const echeance=e.echeance||prompt('Date d\'échéance (AAAA-MM-JJ) :');if(!echeance)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 🗓️ Échéance: '+new Date(echeance+'T12:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}),next_action_type:'relance',next_action_label:'Échéance '+new Date(echeance+'T12:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'}),next_action_done:0,next_action_date:echeance});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Échéance notée','success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="alarm-clock" s={9}/> Noter échéance</div>}
              {/* Langue */}
              {sug.type==='langue' && <div onClick={()=>{const e=sug.entities||{};const langue=e.langue||prompt('Langue :');if(!langue)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 💬 Langue: '+langue});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Langue notée: '+langue,'success');}} style={{flex:1,padding:'4px 0',borderRadius:6,fontSize:9,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="globe" s={9}/> Noter langue</div>}
              <div onClick={()=>setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'dismissed'}:s))} style={{padding:'4px 8px',borderRadius:6,fontSize:9,cursor:'pointer',color:T.text3,background:T.bg,border:'1px solid '+T.border}}>✕</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )}

  {/* ═══ SUGGESTIONS À REVOIR (appel précédent) ═══ */}
  {(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='review').length > 0 && (
    <div style={{marginTop:10,padding:'6px 8px',borderRadius:8,background:T.bg,border:'1px dashed '+T.border}}>
      <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:4}}>
        <I n="clock" s={10} style={{color:T.text3}}/>
        <span style={{fontSize:9,fontWeight:700,color:T.text3}}>À revoir ({(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='review').length})</span>
        <span onClick={()=>setPhoneLiveSuggestions(prev=>prev.filter(s=>s.status!=='review'))} style={{marginLeft:'auto',cursor:'pointer',fontSize:8,color:T.text3}}>✕ Tout effacer</span>
      </div>
      {(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='review').map(sug=>(
        <div key={sug.id} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 0',borderTop:'1px solid '+T.border}}>
          <I n={sug.icon} s={9} style={{color:sug.color,opacity:0.6}}/>
          <span style={{fontSize:8,color:T.text3,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sug.label}: {sug.phrase?.slice(0,30)}...</span>
          <span onClick={()=>setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'pending'}:s))} style={{cursor:'pointer',fontSize:8,color:T.accent,fontWeight:600}}>Traiter</span>
          <span onClick={()=>setPhoneLiveSuggestions(prev=>prev.filter(s=>s.id!==sug.id))} style={{cursor:'pointer',fontSize:8,color:T.text3}}>✕</span>
        </div>
      ))}
    </div>
  )}

  {/* ═══ TRANSCRIPTION ENREGISTREMENT (après appel) ═══ */}
  <div style={{display:'flex',alignItems:'center',gap:5,marginTop:12,marginBottom:6}}>
    <I n="file-text" s={11} style={{color:T.accent}}/>
    <span style={{fontSize:11,fontWeight:700,color:T.text}}>Transcription</span>
    {selCall && <span style={{fontSize:9,color:T.text3,marginLeft:'auto'}}>{selCall.id.slice(-8)}</span>}
  </div>
  {(typeof phoneCallTranscriptLoading!=='undefined'?phoneCallTranscriptLoading:null) ? (
    <div style={{textAlign:'center',padding:14,fontSize:11,color:T.text3}}>Chargement...</div>
  ) : phoneCallTranscript && JSON.parse((typeof phoneCallTranscript!=='undefined'?phoneCallTranscript:{}).segments_json||'[]').length > 0 ? (
    <div style={{maxHeight:250,overflow:'auto'}}>
    {JSON.parse((typeof phoneCallTranscript!=='undefined'?phoneCallTranscript:{}).segments_json).map((seg,i)=>(
      <div key={i} style={{marginBottom:6,padding:'5px 8px',borderRadius:7,background:seg.speaker==='agent'||seg.speaker==='collab'?T.accentBg+'60':'#22C55E08'}}>
        <div style={{fontSize:9,fontWeight:700,color:seg.speaker==='agent'||seg.speaker==='collab'?T.accent:'#22C55E',marginBottom:1}}>{seg.speaker==='agent'||seg.speaker==='collab'?'Vous':'Contact'}</div>
        <div style={{fontSize:10,color:T.text,lineHeight:1.4}}>{seg.text}</div>
      </div>
    ))}
    </div>
  ) : (typeof phoneCallTranscript!=='undefined'?phoneCallTranscript:null)?.fullText ? (
    <div style={{fontSize:10,color:T.text2,lineHeight:1.5,whiteSpace:'pre-wrap',maxHeight:250,overflow:'auto'}}>{(typeof phoneCallTranscript!=='undefined'?phoneCallTranscript:{}).fullText}</div>
  ) : (
    <div style={{textAlign:'center',padding:14,borderRadius:10,background:T.bg}}>
      <div style={{fontSize:10,color:T.text3}}>Pas de transcription disponible</div>
      <div style={{fontSize:9,color:T.text3,marginTop:2}}>La transcription apparaît après un appel enregistré</div>
    </div>
  )}
</div>
);
})()}

{/* ══ ACTIVITE tab — parcours timeline + NRP history + call flow ══ */}
{phoneRightTab==='flux' && (
<div>
  {/* Pipeline parcours */}
  <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:8}}>
    <I n="git-branch" s={11} style={{color:'#7C3AED'}}/>
    <span style={{fontSize:10,fontWeight:700,color:T.text3}}>Parcours ({history.length})</span>
  </div>
  {history.length===0 ? <div style={{fontSize:11,color:T.text3,textAlign:'center',padding:12}}>Aucun historique</div> : history.map((h,i)=>{
    // V1.8.15 — Detect cross-collab event (toStage prefixed `_xc_`)
    const _isXC = (h.toStage||'').startsWith('_xc_');
    if (_isXC) {
      const _isDetach = h.toStage === '_xc_detach';
      const _xcColor = _isDetach ? '#EF4444' : '#3B82F6';
      const _xcEmoji = _isDetach ? '🚪' : '🤝';
      const _xcLabel = _isDetach ? 'Désengagement' : 'Transfert';
      return (
        <div key={i} style={{display:'flex',gap:8,marginBottom:8,position:'relative'}}>
          {i<history.length-1 && <div style={{position:'absolute',left:11,top:24,bottom:-4,width:2,background:T.border}}/>}
          <div style={{width:24,height:24,borderRadius:8,background:_xcColor+'15',border:'2px solid '+_xcColor+'35',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,zIndex:1,fontSize:11}}>{_xcEmoji}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:700,color:_xcColor}}>{_xcLabel}</div>
            {h.note && <div style={{fontSize:10,color:T.text2,marginTop:2}}>{h.note}</div>}
            <div style={{fontSize:9,color:T.text3,marginTop:2}}>{h.userName} · {new Date(h.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})} {new Date(h.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>
        </div>
      );
    }
    const fromStage = ctStages.find(s=>s.id===h.fromStage);
    const toStage = ctStages.find(s=>s.id===h.toStage);
    return(
      <div key={i} style={{display:'flex',gap:8,marginBottom:8,position:'relative'}}>
        {i<history.length-1 && <div style={{position:'absolute',left:11,top:24,bottom:-4,width:2,background:T.border}}/>}
        <div style={{width:24,height:24,borderRadius:8,background:(toStage?.color||'#999')+'15',border:'2px solid '+(toStage?.color||'#999')+'30',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,zIndex:1}}>
          <div style={{width:6,height:6,borderRadius:3,background:toStage?.color||'#999'}}/>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:10,fontWeight:600}}>
            <span style={{color:fromStage?.color||T.text3}}>{fromStage?.label||h.fromStage}</span>
            <span style={{color:T.text3}}>{' \u2192 '}</span>
            <span style={{color:toStage?.color||T.text}}>{toStage?.label||h.toStage}</span>
          </div>
          <div style={{fontSize:9,color:T.text3}}>{h.userName} · {new Date(h.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})} {new Date(h.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
          {h.note && <div style={{fontSize:9,color:T.text2,fontStyle:'italic',marginTop:2}}>{h.note}</div>}
        </div>
      </div>
    );
  })}

  {/* NRP History */}
  <div style={{borderTop:'1px solid '+T.border,paddingTop:10,marginTop:8}}>
    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
      <I n="phone-missed" s={11} style={{color:'#EF4444'}}/>
      <span style={{fontSize:10,fontWeight:700,color:'#EF4444'}}>{nrpFollowups.length} NRP</span>
    </div>
    {nrpFollowups.length===0 ? <div style={{fontSize:10,color:T.text3,textAlign:'center',padding:8}}>Aucune tentative NRP</div> : nrpFollowups.slice().reverse().map((f,i)=>{
      const d = f.date ? new Date(f.date) : null;
      return(
        <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'6px 8px',borderRadius:8,background:'#EF444406',border:'1px solid #EF444412',marginBottom:4}}>
          <div style={{width:20,height:20,borderRadius:6,background:'#EF444415',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <I n="phone-missed" s={10} style={{color:'#EF4444'}}/>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:600,color:'#EF4444'}}>Tentative #{nrpFollowups.length-i}</div>
            <div style={{fontSize:9,color:T.text3}}>{d?d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}):'-'} {d?d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</div>
            {f.note && <div style={{fontSize:9,color:T.text2,marginTop:2}}>{f.note}</div>}
          </div>
        </div>
      );
    })}
  </div>

  {/* Call flow timeline (when a specific call is selected) */}
  {cl && (
    <div style={{borderTop:'1px solid '+T.border,paddingTop:10,marginTop:8}}>
      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:8}}>
        <I n="activity" s={11} style={{color:'#7C3AED'}}/>
        <span style={{fontSize:10,fontWeight:700,color:T.text3}}>Flux appel</span>
      </div>
      {[
        {icon:cl.direction==='outbound'?'phone-outgoing':'phone-incoming',label:cl.direction==='outbound'?'Appel sortant':'Appel entrant',color:'#3B82F6',time:cl.createdAt},
        ...(cl.status==='missed'||cl.status==='no-answer'?[{icon:'phone-missed',label:'Non repondu',color:'#EF4444',time:cl.createdAt}]:[
          {icon:'phone',label:'Decroche',color:'#22C55E',time:cl.createdAt},
          ...(cl.duration>0?[{icon:'clock',label:fmtDur3(cl.duration),color:'#7C3AED'}]:[]),
          {icon:'phone-off',label:'Raccroche',color:'#6B7280',time:cl.createdAt},
        ]),
        ...(analysis?[{icon:'cpu',label:'Analyse IA ('+((analysis.sentimentScore||0))+'%)',color:'#7C3AED'}]:[]),
      ].map((ev,i,arr)=>(
        <div key={i} style={{display:'flex',gap:8,paddingBottom:10,position:'relative'}}>
          {i<arr.length-1 && <div style={{position:'absolute',left:11,top:24,bottom:0,width:2,background:T.border}}/>}
          <div style={{width:24,height:24,borderRadius:7,background:ev.color+'12',border:'1.5px solid '+ev.color+'35',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,zIndex:1}}>
            <I n={ev.icon} s={10} style={{color:ev.color}}/>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:T.text}}>{ev.label}</div>
            {ev.time && <div style={{fontSize:9,color:T.text3}}>{new Date(ev.time).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>}
          </div>
        </div>
      ))}
    </div>
  )}

  {/* Notes */}
  <div style={{borderTop:'1px solid '+T.border,paddingTop:8,marginTop:4}}>
    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
      <I n="sticky-note" s={11} style={{color:'#F59E0B'}}/>
      <span style={{fontSize:10,fontWeight:700,color:T.text3}}>Notes</span>
    </div>
    <textarea value={ct?.notes||""} onChange={e=>{
      const v=e.target.value;
      if(pipelineRightContact){(typeof setPipelineRightContact==='function'?setPipelineRightContact:function(){})(p=>({...p,notes:v}));}
      setContacts(p=>p.map(c=>c.id===ct.id?{...c,notes:v}:c));
      clearTimeout(collabNotesTimerRef.current);
      collabNotesTimerRef.current=setTimeout(()=>api(`/api/data/contacts/${ct.id}`,{method:"PUT",body:{notes:v,companyId:company?.id}}),800);
    }} placeholder="Ajoutez des notes..." style={{width:'100%',minHeight:32,border:`1px solid ${T.border}`,borderRadius:7,padding:'6px 8px',fontSize:10,fontFamily:'inherit',resize:'vertical',background:T.bg,color:T.text,outline:'none',lineHeight:1.4}}/>
    <div style={{fontSize:8,color:T.text3,marginTop:2}}>Sauvegarde auto</div>
  </div>

  {/* RDV */}
  {ct.id && (
    <div style={{borderTop:'1px solid '+T.border,paddingTop:8,marginTop:8}}>
      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
        <I n="calendar" s={11} style={{color:'#0EA5E9'}}/>
        <span style={{fontSize:10,fontWeight:700,color:T.text3}}>Rendez-vous</span>
      </div>
      <div onClick={()=>{setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||ctNum||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:8,cursor:'pointer',background:'#22C55E0A',border:'1px solid #22C55E20',transition:'all .12s'}} onMouseEnter={e=>{e.currentTarget.style.background='#22C55E14';}} onMouseLeave={e=>{e.currentTarget.style.background='#22C55E0A';}}>
        <div style={{width:26,height:26,borderRadius:7,background:'#22C55E14',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><I n="calendar-plus" s={12} style={{color:'#22C55E'}}/></div>
        <div style={{flex:1}}>
          <div style={{fontSize:11,fontWeight:600,color:T.text}}>Programmer un RDV</div>
          <div style={{fontSize:9,color:T.text3}}>avec {ct.name}</div>
        </div>
        <I n="chevron-right" s={12} style={{color:T.text3}}/>
      </div>
    </div>
  )}
</div>
)}

{/* ══ FORMS tab — Champs directement visibles, pas d'accordeon ══ */}
{phoneRightTab==='forms' && (typeof pipelineRightContact!=='undefined'?pipelineRightContact:null) && (()=>{
const ct = (typeof pipelineRightContact!=='undefined'?pipelineRightContact:null);
const forms = (typeof collabCallForms!=='undefined'?collabCallForms:null) || [];
if (!forms.length) return <div style={{textAlign:'center',padding:24}}>
  <I n="clipboard" s={28} style={{color:T.text3,marginBottom:8}}/>
  <div style={{fontSize:12,fontWeight:600,color:T.text3}}>Aucun formulaire assigne</div>
  <div style={{fontSize:10,color:T.text3,marginTop:4}}>Les formulaires d'appel seront affiches ici une fois assignes par un administrateur.</div>
</div>;
return <div style={{padding:'0 2px'}}>
  {forms.map(form => {
    const formId = form.id;
    // Parsing robuste: essayer fields_json, fields, questions (tous les noms possibles)
    const fields = (()=>{
      const candidates = [form.fields_json, form.fields, form.questions];
      for (const raw of candidates) {
        if (!raw) continue;
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {}
      }
      return [];
    })();
    const existingResponse = ((typeof callFormResponses!=='undefined'?callFormResponses:null)||[]).find(r => r.formId === formId || r.form_id === formId);
    const currentValues = (typeof callFormData!=='undefined'?callFormData:null)[formId] || {};

    // Titre du formulaire
    const formTitle = <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
      <I n="clipboard-list" s={13} style={{color:'#7C3AED'}}/>
      <span style={{flex:1,fontSize:12,fontWeight:700,color:T.text}}>{form.name || form.title || 'Formulaire'}</span>
      {existingResponse ? <span style={{fontSize:9,padding:'2px 8px',borderRadius:6,background:'#22C55E15',color:'#22C55E',fontWeight:700}}>Repondu</span>
        : <span style={{fontSize:9,padding:'2px 8px',borderRadius:6,background:'#7C3AED12',color:'#7C3AED',fontWeight:600}}>A remplir</span>}
    </div>;

    // Si deja repondu → afficher les reponses
    if (existingResponse) {
      const data = (()=>{try{const d=existingResponse.data_json||existingResponse.data;return typeof d==='string'?JSON.parse(d):d||{};}catch{return{};}})();
      return <div key={formId} style={{marginBottom:16}}>
        {formTitle}
        <div style={{fontSize:9,color:T.text3,marginBottom:6}}>Repondu le {new Date(existingResponse.createdAt||existingResponse.created_at).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
          {Object.entries(data).map(([key,val])=><div key={key} style={{padding:'5px 8px',borderRadius:6,background:T.bg,border:'1px solid '+T.border}}>
            <div style={{fontSize:8,fontWeight:700,color:'#7C3AED',textTransform:'uppercase',marginBottom:2}}>{key}</div>
            <div style={{fontSize:11,color:T.text,fontWeight:500}}>{String(val)}</div>
          </div>)}
        </div>
      </div>;
    }

    // Pas encore repondu → afficher les champs directement
    return <div key={formId} style={{marginBottom:16}}>
      {formTitle}
      {fields.length === 0 && <div style={{fontSize:11,color:T.text3,padding:'8px 0',fontStyle:'italic'}}>Ce formulaire n'a pas encore de champs configures. Verifiez la configuration dans l'admin.</div>}
      {fields.map((field,fi) => {
        const fid = field.id || field.name || ('field_'+fi);
        const fLabel = field.label || field.name || fid;
        const fType = field.type || 'texte';
        const val = currentValues[fid] || '';
        const updateVal = (v) => setCallFormData(p=>({...p,[formId]:{...(p[formId]||{}),[fid]:v}}));
        return <div key={fid} style={{marginBottom:10}}>
          <div style={{fontSize:10,fontWeight:600,color:T.text2,marginBottom:4}}>{fLabel}{field.required && <span style={{color:'#EF4444',marginLeft:2}}>*</span>}</div>
          {fType==='texte' && <input type="text" value={val} onChange={e=>updateVal(e.target.value)} placeholder={fLabel} style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:12,outline:'none',boxSizing:'border-box'}}/>}
          {fType==='choix_multiple' && (()=>{
            const opts = typeof field.options === 'string' ? field.options.split(',').map(s=>s.trim()).filter(Boolean) : Array.isArray(field.options) ? field.options : [];
            return <select value={val} onChange={e=>updateVal(e.target.value)} style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:12,outline:'none'}}>
              <option value="">-- Choisir --</option>
              {opts.map((opt,oi)=><option key={oi} value={typeof opt==='string'?opt:opt.value||opt.label}>{typeof opt==='string'?opt:opt.label||opt.value}</option>)}
            </select>;
          })()}
          {fType==='oui_non' && <div style={{display:'flex',gap:6}}>
            {['Oui','Non'].map(o=><div key={o} onClick={()=>updateVal(o)} style={{flex:1,padding:'8px 0',textAlign:'center',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600,background:val===o?(o==='Oui'?'#22C55E15':'#EF444415'):'transparent',color:val===o?(o==='Oui'?'#22C55E':'#EF4444'):T.text3,border:'1px solid '+(val===o?(o==='Oui'?'#22C55E40':'#EF444440'):T.border),transition:'all .12s'}}>{o}</div>)}
          </div>}
          {fType==='note_10' && <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
            {[1,2,3,4,5,6,7,8,9,10].map(n=><div key={n} onClick={()=>updateVal(n)} style={{width:28,height:28,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:11,fontWeight:700,background:val===n?'#7C3AED18':'transparent',color:val===n?'#7C3AED':T.text3,border:'1px solid '+(val===n?'#7C3AED40':T.border),transition:'all .12s'}}>{n}</div>)}
          </div>}
          {fType==='date' && <input type="date" value={val} onChange={e=>updateVal(e.target.value)} style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:12,outline:'none',boxSizing:'border-box'}}/>}
          {fType==='nombre' && <input type="number" value={val} onChange={e=>updateVal(e.target.value)} placeholder="0" style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:12,outline:'none',boxSizing:'border-box'}}/>}
          {fType==='textarea' && <textarea value={val} onChange={e=>updateVal(e.target.value)} placeholder={fLabel} rows={3} style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:12,outline:'none',boxSizing:'border-box',resize:'vertical'}}/>}
        </div>;
      })}
      {fields.length > 0 && <div onClick={()=>{
        const vals = (typeof callFormData!=='undefined'?callFormData:null)[formId] || {};
        if (!Object.keys(vals).length) { showNotif('Veuillez remplir au moins un champ','warning'); return; }
        const payload = {};
        fields.forEach((f,fi) => { const fid = f.id||f.name||('field_'+fi); payload[f.label||f.name||fid] = vals[fid] || ''; });
        api('/api/call-forms/'+formId+'/respond', { method:'POST', body:{ contactId:ct.id, collaboratorId:collab.id, companyId:company.id, data:payload }})
          .then(()=>{
            showNotif('Formulaire enregistre !','success');
            setCallFormData(p=>{const n={...p};delete n[formId];return n;});
            api('/api/call-forms/contact/'+ct.id+'?companyId='+company.id).then(d=>setCallFormResponses(d||[])).catch(()=>{});
          })
          .catch(()=>showNotif('Erreur lors de l\'enregistrement','danger'));
      }} style={{marginTop:4,padding:'9px 14px',borderRadius:9,background:'linear-gradient(135deg,#7C3AED,#6366f1)',color:'#fff',fontSize:12,fontWeight:700,textAlign:'center',cursor:'pointer',transition:'all .15s',boxShadow:'0 2px 8px #7C3AED30'}}>
        Enregistrer
      </div>}
    </div>;
  })}
</div>;
})()}
{phoneRightTab==='forms' && !(typeof pipelineRightContact!=='undefined'?pipelineRightContact:null) && (
<div style={{textAlign:'center',padding:24}}>
  <I n="user" s={28} style={{color:T.text3,marginBottom:8}}/>
  <div style={{fontSize:12,fontWeight:600,color:T.text3}}>Selectionnez un contact</div>
  <div style={{fontSize:10,color:T.text3,marginTop:4}}>pour remplir un formulaire d'appel.</div>
</div>
)}

{/* ══ SMS tab — compose + history + templates ══ */}
{phoneRightTab==='sms' && (()=>{
const smsPhone = (typeof phoneDialNumber!=='undefined'?phoneDialNumber:null) || ct?.phone || ct?.mobile || ctNum || '';
const smsLast9 = smsPhone.replace(/\D/g,'').slice(-9);
// Load SMS history
const cacheKey = 'sms_' + smsLast9;
if (smsLast9 && !_T.smsCache?.[cacheKey] && !_T.smsLoading?.[cacheKey]) {
  if (!_T.smsLoading) _T.smsLoading = {};
  if (!_T.smsCache) _T.smsCache = {};
  _T.smsLoading[cacheKey] = true;
  api('/api/conversations/sms-history/' + encodeURIComponent(smsPhone.replace(/\s/g,''))).then(msgs => {
    _T.smsCache[cacheKey] = msgs || [];
    delete _T.smsLoading[cacheKey];
    setPhoneRightAccordion(p => ({...p, _smsR: Date.now()}));
  }).catch(() => { _T.smsCache[cacheKey] = []; delete _T.smsLoading[cacheKey]; });
}
const smsMessages = _T.smsCache?.[cacheKey] || [];
const templates = [
  "Bonjour, votre RDV est confirme pour demain. A bientot !",
  "Rappel : votre rendez-vous est prevu aujourd'hui.",
  "Merci pour votre visite ! N'hesitez pas a reprendre contact.",
  "Votre RDV a ete annule. Contactez-nous pour reprogrammer."
];
// Numeros Twilio SMS-capable du collab
const _myTwNums = ((typeof appMyPhoneNumbers!=='undefined'?appMyPhoneNumbers:null)||[]).filter(pn => pn.collaboratorId === collab.id && pn.status === 'assigned' && pn.smsCapable);
const _smsFromKey = '_smsFromPhone_' + (ct?.id || smsLast9);
const _selFrom = window[_smsFromKey] || (_myTwNums.length > 0 ? _myTwNums[0].phoneNumber : 'brevo');

return <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
  {/* Compose */}
  <div style={{padding:'8px 10px',borderBottom:'1px solid '+T.border}}>
    <div style={{fontSize:10,fontWeight:700,color:T.text3,marginBottom:4}}>Destinataire</div>
    <div style={{padding:'5px 8px',borderRadius:6,background:T.bg,border:'1px solid '+T.border,fontSize:11,color:T.text,marginBottom:6}}>{fmtPhone(smsPhone) || 'Aucun numéro'}</div>
    <textarea value={phoneSMSText} onChange={e=>(typeof setPhoneSMSText==='function'?setPhoneSMSText:function(){})(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!smsPhone||!(typeof phoneSMSText!=='undefined'?phoneSMSText:{}).trim()){showNotif('Numéro et message requis','danger');return;}const fromNum=_selFrom!=='brevo'?_selFrom:undefined;api('/api/sms/send',{method:'POST',body:{to:smsPhone,content:(typeof phoneSMSText!=='undefined'?phoneSMSText:{}).trim(),contactId:ct?.id||'',fromNumber:fromNum}}).then(r=>{if(r?.success){showNotif('SMS envoyé'+(r.provider==='twilio'?' via Twilio':'')+' ✓');(typeof setPhoneSMSText==='function'?setPhoneSMSText:function(){})('');if(_T.smsCache)Object.keys(_T.smsCache).forEach(k=>{if(k.includes(smsLast9))delete _T.smsCache[k];});setPhoneRightAccordion(p=>({...p,_smsR:Date.now()}));api('/api/conversations?companyId='+company.id).then(d=>{if(Array.isArray(d))setAppConversations(d);}).catch(()=>{});}else showNotif(r?.error||'Erreur','danger');});}}} placeholder="Votre message SMS... (Entrée pour envoyer, Shift+Entrée pour retour à la ligne)" rows={3} style={{width:'100%',padding:8,borderRadius:8,border:'1px solid '+T.border,background:T.bg,fontSize:11,fontFamily:'inherit',color:T.text,outline:'none',resize:'vertical'}}/>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:3,marginBottom:4}}>
      <span style={{fontSize:9,color:T.text3}}>{(typeof phoneSMSText!=='undefined'?phoneSMSText:{}).length}/160 · {Math.ceil(((typeof phoneSMSText!=='undefined'?phoneSMSText:{}).length||1)/160)} SMS</span>
      <span style={{fontSize:8,color:_selFrom==='brevo'?'#F59E0B':'#22C55E',fontWeight:600}}>{_selFrom==='brevo'?'Brevo':'Twilio'}</span>
    </div>
    <div style={{fontSize:8,color:T.text3,textAlign:'right',marginBottom:2,opacity:.7}}>Tap Entrée pour envoyer · Shift+Entrée pour retour ligne</div>
    {/* Selecteur numero d'envoi */}
    <select value={_selFrom} onChange={e=>{window[_smsFromKey]=e.target.value;setPhoneRightAccordion(p=>({...p,_sf:Date.now()}));}} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1.5px solid '+(_selFrom==='brevo'?'#F59E0B40':'#22C55E40'),background:_selFrom==='brevo'?'#F59E0B06':'#22C55E06',fontSize:10,color:T.text,cursor:'pointer',outline:'none',fontWeight:600,marginBottom:6}}>
      {_myTwNums.map(pn=><option key={pn.phoneNumber} value={pn.phoneNumber}>Twilio — {displayPhone(pn.phoneNumber)}</option>)}
      <option value="brevo">{company?.sms_sender_name||'Calendar360'} (Brevo)</option>
    </select>
    <div onClick={()=>{
      if(!smsPhone||!(typeof phoneSMSText!=='undefined'?phoneSMSText:{}).trim()){ showNotif('Numéro et message requis','danger'); return; }
      const fromNum = _selFrom !== 'brevo' ? _selFrom : undefined;
      // Envoyer via POST /api/sms/send (hybride) au lieu de passer par conversations
      api('/api/sms/send', {method:'POST', body:{to:smsPhone,content:(typeof phoneSMSText!=='undefined'?phoneSMSText:{}).trim(),contactId:ct?.id||'',fromNumber:fromNum}}).then(r=>{
        if(r?.success){
          showNotif('SMS envoyé' + (r.provider==='twilio'?' via Twilio':'') + ' ✓');
          setPhoneSMSText('');
          if(_T.smsCache) Object.keys(_T.smsCache).forEach(k=>{if(k.includes(smsLast9))delete _T.smsCache[k];});
          setPhoneRightAccordion(p=>({...p,_smsR:Date.now()}));
          // Refresh conversations
          api('/api/conversations?companyId='+company.id).then(d=>{if(Array.isArray(d))setAppConversations(d);}).catch(()=>{});
        } else showNotif(r?.error||'Erreur','danger');
      });
    }} style={{width:'100%',padding:'8px 0',borderRadius:8,background:'linear-gradient(135deg,#2563EB,#7C3AED)',color:'#fff',textAlign:'center',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
      <I n="send" s={12}/> Envoyer
    </div>
  </div>
  {/* Templates rapides */}
  <div style={{padding:'6px 10px',borderBottom:'1px solid '+T.border}}>
    <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:4}}>Templates rapides</div>
    <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
      {templates.map((t,i)=><div key={i} onClick={()=>setPhoneSMSText(t)} style={{padding:'3px 6px',borderRadius:5,background:T.bg,border:'1px solid '+T.border,fontSize:8,cursor:'pointer',color:T.text2,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={t}>{t.substring(0,30)}...</div>)}
    </div>
  </div>
  {/* Historique */}
  <div style={{flex:1,overflowY:'auto',padding:'8px 10px'}}>
    <div style={{fontSize:10,fontWeight:700,color:T.text3,marginBottom:6}}>Historique ({smsMessages.length})</div>
    {smsMessages.length === 0 ? (
      <div style={{textAlign:'center',padding:16,fontSize:10,color:T.text3}}>Aucun SMS</div>
    ) : smsMessages.map(sms => (
      <div key={sms.id} style={{marginBottom:6,display:'flex',flexDirection:'column',alignItems:sms.direction==='outbound'?'flex-end':'flex-start'}}>
        <div style={{maxWidth:'90%',padding:'6px 8px',borderRadius:sms.direction==='outbound'?'8px 8px 2px 8px':'8px 8px 8px 2px',background:sms.direction==='outbound'?'#2563EB':'#E5E7EB',color:sms.direction==='outbound'?'#fff':'#1F2937',fontSize:10,lineHeight:1.4,wordBreak:'break-word'}}>
          {sms.content}
        </div>
        <div style={{fontSize:7,color:T.text3,marginTop:1}}>
          {new Date(sms.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})} {new Date(sms.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
          {sms.status && <span style={{marginLeft:4,color:sms.status==='sent'||sms.status==='delivered'?'#22C55E':'#F59E0B'}}>{sms.status}</span>}
        </div>
      </div>
    ))}
  </div>
</div>;
})()}

{/* ══ IA Copilot Hub — coaching live + analyse post-appel + actions + validation ══ */}
{phoneRightTab==='ia' && (()=>{
const _ext = analysis?.extended || (analysis?.extended_json ? (()=>{try{return JSON.parse(analysis.extended_json);}catch{return {};}})() : {});
const _sectionHeader = (key, icon, label, count, defaultOpen) => (
  <div onClick={()=>(typeof setIaHubCollapse==='function'?setIaHubCollapse:function(){})(p=>({...p,[key]:!p[key]}))} style={{padding:'8px 10px',display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:T.bg,borderBottom:'1px solid '+T.border,borderRadius:iaHubCollapse[key]?8:0,transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background=T.bg}>
    <I n={icon} s={12} style={{color:'#7C3AED'}}/>
    <span style={{fontSize:11,fontWeight:700,color:T.text,flex:1}}>{label}</span>
    {count!=null && <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'#7C3AED15',color:'#7C3AED'}}>{count}</span>}
    <I n={(typeof iaHubCollapse!=='undefined'?iaHubCollapse:null)[key]?'chevron-down':'chevron-up'} s={12} style={{color:T.text3}}/>
  </div>
);
const _scoreGauge = (label, score, color) => (
  <div style={{flex:1,textAlign:'center'}}>
    <div style={{fontSize:16,fontWeight:800,color}}>{score}</div>
    <div style={{height:3,borderRadius:2,background:T.border,margin:'3px 4px'}}>
      <div style={{width:Math.min(100,score)+'%',height:'100%',borderRadius:2,background:color}}/>
    </div>
    <div style={{fontSize:7,fontWeight:600,color:T.text3}}>{label}</div>
  </div>
);
const _actionIcon = {send_sms:'message-square',send_email:'mail',book_meeting:'calendar-plus',schedule_callback:'phone-callback',change_pipeline:'git-branch',create_note:'edit-3',send_quote:'receipt',send_invoice:'file-text',send_document:'paperclip',create_task:'check-square'};
const _actionColor = {send_sms:'#0EA5E9',send_email:'#6366F1',book_meeting:'#8B5CF6',schedule_callback:'#F59E0B',change_pipeline:'#22C55E',create_note:'#64748B',send_quote:'#F97316',send_invoice:'#F97316',send_document:'#0EA5E9',create_task:'#3B82F6'};

return <div style={{flex:1,overflowY:'auto',padding:10}}>
  {/* ═══ DURING CALL ═══ */}
  {(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) ? (<>
    <div style={{padding:'10px 12px',borderRadius:10,background:'linear-gradient(135deg,#7C3AED,#2563EB)',marginBottom:10}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
        <I n="cpu" s={14} style={{color:'#fff'}}/>
        <span style={{fontSize:12,fontWeight:800,color:'#fff'}}>Copilot LIVE</span>
        <span style={{width:6,height:6,borderRadius:3,background:'#22C55E',boxShadow:'0 0 8px #22C55E80',animation:'pulse 2s infinite',marginLeft:4}}/>
        <span style={{fontSize:11,fontWeight:700,color:'#ffffffcc',marginLeft:'auto',fontFamily:'monospace'}}>{(()=>{const s=Math.floor((Date.now()-((typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).startTime||Date.now()))/1000);return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;})()}</span>
      </div>
      <div style={{display:'flex',gap:2}}>
        {['Accroche','Découverte','Présentation','Objections','Closing'].map((step,i)=>(
          <div key={i} onClick={()=>(typeof setPhoneCopilotLiveStep==='function'?setPhoneCopilotLiveStep:function(){})(i)} style={{flex:1,padding:'3px 0',borderRadius:4,textAlign:'center',fontSize:7,fontWeight:700,cursor:'pointer',background:phoneCopilotLiveStep===i?'rgba(255,255,255,0.3)':'rgba(255,255,255,0.08)',color:phoneCopilotLiveStep>=i?'#fff':'#ffffff55'}}>{step}</div>
        ))}
      </div>
    </div>
    <div style={{display:'flex',gap:4,marginBottom:8}}>
      <div style={{flex:1,padding:'6px 0',textAlign:'center',borderRadius:8,background:(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='positive'?'#22C55E08':(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='negative'?'#EF444408':'#F59E0B08',border:'1px solid '+((typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='positive'?'#22C55E20':(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='negative'?'#EF444420':'#F59E0B20')}}>
        <div style={{fontSize:16}}>{phoneLiveSentiment==='positive'?'😊':(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='negative'?'😟':'😐'}</div>
        <div style={{fontSize:8,fontWeight:700,color:(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='positive'?'#22C55E':(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='negative'?'#EF4444':'#F59E0B'}}>{phoneLiveSentiment==='positive'?'Positif':(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='negative'?'Négatif':'Neutre'}</div>
      </div>
      <div style={{flex:1,padding:'6px 0',textAlign:'center',borderRadius:8,background:T.bg,border:'1px solid '+T.border}}>
        <div style={{fontSize:14,fontWeight:800,color:'#7C3AED'}}>{Object.values((typeof phoneCopilotReactions!=='undefined'?phoneCopilotReactions:null)).filter(r=>r===true).length}</div>
        <div style={{fontSize:8,fontWeight:700,color:T.text3}}>Acceptés</div>
      </div>
      <div style={{flex:1,padding:'6px 0',textAlign:'center',borderRadius:8,background:T.bg,border:'1px solid '+T.border}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text2}}>{(typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:{}).length}</div>
        <div style={{fontSize:8,fontWeight:700,color:T.text3}}>Messages</div>
      </div>
    </div>
    {/* V1.9.1 UX — Bloc "Coaching commercial" RETIRÉ (allégement colonne droite). Toute la logique "quoi dire" (phraseToSay/nextSuggestion/suggestion/openQuestion/detectedObjection/actionToDo/keyInsight) est désormais centralisée UNIQUEMENT dans la bannière flottante basse Cockpit. La colonne droite reste zone de lecture/contexte. */}
    {/* ── Transcription live ── */}
    <div style={{borderRadius:8,border:'1px solid '+T.border,marginBottom:8}}>
      <div style={{padding:'5px 8px',background:T.bg,display:'flex',alignItems:'center',gap:4,borderBottom:'1px solid '+T.border}}>
        <span style={{width:5,height:5,borderRadius:3,background:'#EF4444',animation:'pulse 1.5s infinite'}}/>
        <span style={{fontSize:9,fontWeight:700,color:T.text2}}>Transcription live</span>
      </div>
      {/* Voice activity indicators */}
      <div style={{display:'flex',gap:4,padding:'4px 8px',borderBottom:'1px solid '+T.border+'50'}}>
        <div style={{flex:1,padding:'4px 6px',borderRadius:6,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent+'12':T.bg,border:'1px solid '+((typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent+'40':T.border+'50'),transition:'all .3s',display:'flex',alignItems:'center',gap:4}}>
          <div style={{width:5,height:5,borderRadius:3,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent:'#D1D5DB',transition:'all .3s',boxShadow:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?'0 0 6px '+T.accent+'60':'none'}}/>
          <span style={{fontSize:7,fontWeight:700,color:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent:T.text3}}>{(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?'Vous parlez…':'Vous (en écoute)'}</span>
          <div style={{display:'flex',gap:1,flex:1,alignItems:'center',height:12}}>
            {[0,1,2,3].map(i=><div key={i} style={{flex:1,borderRadius:1,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?T.accent:'#E5E7EB',height:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?(3+Math.random()*9)+'px':'3px',transition:'height .15s ease',opacity:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).me?0.5+Math.random()*0.5:0.3}}/>)}
          </div>
        </div>
        <div style={{flex:1,padding:'4px 6px',borderRadius:6,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E12':T.bg,border:'1px solid '+((typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E40':T.border+'50'),transition:'all .3s',display:'flex',alignItems:'center',gap:4}}>
          <div style={{width:5,height:5,borderRadius:3,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E':'#D1D5DB',transition:'all .3s',boxShadow:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'0 0 6px #22C55E60':'none'}}/>
          <span style={{fontSize:7,fontWeight:700,color:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E':T.text3}}>{(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'Client parle…':'Client (en écoute)'}</span>
          <div style={{display:'flex',gap:1,flex:1,alignItems:'center',height:12}}>
            {[0,1,2,3].map(i=><div key={i} style={{flex:1,borderRadius:1,background:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?'#22C55E':'#E5E7EB',height:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?(3+Math.random()*9)+'px':'3px',transition:'height .15s ease',opacity:(typeof phoneLiveVoiceActivity!=='undefined'?phoneLiveVoiceActivity:{}).contact?0.5+Math.random()*0.5:0.3}}/>)}
          </div>
        </div>
      </div>
      {/* V1.9.1 UX — Mini bloc Coaching IA RETIRÉ : suggestion IA centralisée dans bannière flottante basse */}
      <div style={{maxHeight:(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{})._transcriptExpanded?500:150,overflow:'auto',padding:6,display:'flex',flexDirection:'column',gap:3,transition:'max-height .3s ease'}} ref={el=>{if(el&&!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{})._transcriptExpanded)el.scrollTop=el.scrollHeight;}}>
        {(typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:{}).length===0 && <div style={{textAlign:'center',padding:12,color:T.text3,fontSize:9}}>En attente...</div>}
        {(typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:{}).map((t,i)=>(
          <div key={i} style={{display:'flex',flexDirection:'column',alignItems:t.speaker==='me'?'flex-end':'flex-start'}}>
            <div style={{maxWidth:'85%',padding:'4px 8px',borderRadius:t.speaker==='me'?'8px 8px 2px 8px':'8px 8px 8px 2px',background:t.speaker==='me'?'linear-gradient(135deg,#7C3AED,#2563EB)':T.bg,color:t.speaker==='me'?'#fff':T.text,fontSize:10,lineHeight:1.3}}>{t.text}</div>
          </div>
        ))}
      </div>
      <div onClick={()=>setIaHubCollapse(p=>({...p,_transcriptExpanded:!p._transcriptExpanded}))} style={{padding:'3px 8px',borderTop:'1px solid '+T.border,display:'flex',alignItems:'center',justifyContent:'center',gap:4,cursor:'pointer',background:T.bg}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background=T.bg}>
        <I n={(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{})._transcriptExpanded?'minimize-2':'maximize-2'} s={10} style={{color:T.text3}}/>
        <span style={{fontSize:8,fontWeight:600,color:T.text3}}>{(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{})._transcriptExpanded?'Réduire':'Agrandir'}</span>
      </div>
    </div>
    {/* Coaching statique supprimé — remplacé par coaching commercial LIVE ci-dessus */}
    {/* V1.9 UX — Fallback mini panel : empty state suggestions */}
    {(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='pending').length === 0 && (
      <div style={{marginTop:6,padding:'5px 8px',borderRadius:8,background:T.bg,border:'1px dashed '+T.border,display:'flex',alignItems:'center',gap:5}}>
        <I n="zap" s={10} style={{color:T.text3}}/>
        <span style={{fontSize:9,fontWeight:700,color:T.text2}}>Suggestions IA</span>
        <span style={{fontSize:8,color:T.text3,fontStyle:'italic',marginLeft:'auto'}}>Aucune pour le moment…</span>
      </div>
    )}
    {/* Live suggestions from keyword detection — full display */}
    {(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='pending').length > 0 && (
      <div style={{marginTop:6}}>
        <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
          <I n="zap" s={11} style={{color:'#F59E0B'}}/>
          <span style={{fontSize:10,fontWeight:700,color:T.text}}>Suggestions ({(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='pending').length})</span>
          {(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='pending').length > 1 && <span onClick={()=>(typeof setPhoneLiveSuggestions==='function'?setPhoneLiveSuggestions:function(){})(prev=>prev.map(s=>s.status==='pending'?{...s,status:'dismissed'}:s))} style={{marginLeft:'auto',cursor:'pointer',fontSize:8,color:T.text3,padding:'2px 6px',borderRadius:4,background:T.bg,border:'1px solid '+T.border}}>Tout ignorer</span>}
        </div>
        {(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='pending').sort((a,b)=>{const p={urgence:0,resiliation:1,accord:2,insatisfaction:3,objection:4,rdv:5,devis:6,renouvellement:7,decideur:8,besoin:9,interet:10,echeance:11,rappel:12,relance_auto:13,email_dicte:14,tel_dicte:15,document:16,piece_demandee:17,paiement:18,qualification:19,recommandation:20,disponibilite:21,adresse:22,entreprise_info:23,canal:24,transfert:25,langue:26,satisfaction:27,note:28};return(p[a.type]??99)-(p[b.type]??99)||(b.score||1)-(a.score||1);}).slice(0,6).map(sug=>(
          <div key={sug.id} style={{marginBottom:5,borderRadius:8,border:`1.5px solid ${sug.confidence==='high'?sug.color+'60':sug.color+'25'}`,background:`${sug.color}04`,overflow:'hidden'}}>
            <div style={{padding:'5px 8px',display:'flex',alignItems:'center',gap:5}}>
              <I n={sug.icon} s={11} style={{color:sug.color}}/>
              <span style={{fontSize:9,fontWeight:700,color:sug.color,flex:1}}>{sug.label}</span>
              {sug._fusionCount > 1 && <span style={{fontSize:7,fontWeight:700,padding:'1px 4px',borderRadius:3,background:sug.color+'18',color:sug.color}}>×{sug._fusionCount}</span>}
              {sug.confidence && <span style={{fontSize:7,fontWeight:600,padding:'1px 4px',borderRadius:3,background:sug.confidence==='high'?'#22C55E18':'#F59E0B18',color:sug.confidence==='high'?'#22C55E':'#F59E0B'}}>{sug.confidence==='high'?'▲':'●'}</span>}
            </div>
            <div style={{padding:'0 8px 5px'}}>
              <div style={{fontSize:8,color:T.text3,fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:3}}>"{sug.phrase}"</div>
              {sug.entities?.contactName && <div style={{fontSize:8,color:T.text2}}><I n="user" s={8} style={{color:T.text3}}/> {sug.entities.contactName}</div>}
              {sug.entities?.date && <div style={{fontSize:8,fontWeight:600,color:sug.color}}><I n="calendar" s={8}/> {new Date(sug.entities.date+'T12:00').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})}{sug.entities?.time ? ' à '+sug.entities.time : ''}</div>}
              {sug.entities?.amount && <div style={{fontSize:8,fontWeight:700,color:'#F97316'}}><I n="receipt" s={8}/> {Number(sug.entities.amount).toLocaleString('fr-FR')} €</div>}
              {sug.entities?.decideur && <div style={{fontSize:8,fontWeight:600,color:'#7C3AED'}}><I n="user-check" s={8}/> Décideur: {sug.entities.decideur}</div>}
              {sug.entities?.besoin && <div style={{fontSize:8,fontWeight:600,color:'#8B5CF6'}}><I n="target" s={8}/> {sug.entities.besoin}</div>}
              {sug.entities?.delay && <div style={{fontSize:8,fontWeight:600,color:'#F59E0B'}}><I n="clock" s={8}/> Relance dans {sug.entities.delay}</div>}
              <div style={{display:'flex',gap:3,marginTop:4}}>
                {sug.type==='rdv' && <div onClick={()=>{const e=sug.entities||{};setPhoneScheduleForm({contactId:e.contactId,contactName:e.contactName,number:e.contactPhone,date:e.date||new Date(Date.now()+86400000).toISOString().split('T')[0],time:e.time||'10:00',duration:30,notes:'RDV détecté: '+sug.phrase,calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="calendar-plus" s={9}/> Créer RDV</div>}
                {sug.type==='rappel' && <div onClick={()=>{const e=sug.entities||{};setPhoneScheduleForm({contactId:e.contactId,contactName:e.contactName,number:e.contactPhone,date:e.date||new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:15,notes:'Rappel: '+sug.phrase,calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="phone-callback" s={9}/> Planifier</div>}
                {sug.type==='note' && <div onClick={()=>{const e=sug.entities||{};const cid=e.contactId||ct?.id;if(cid){handleCollabUpdateContact(cid,{notes:((contacts||[]).find(c=>c.id===cid)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] '+sug.phrase});showNotif('Note ajoutée','success');}else{showNotif('Aucun contact lié','danger');}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="edit-3" s={9}/> Ajouter note</div>}
                {sug.type==='besoin' && <div onClick={()=>{const e=sug.entities||{};const cid=e.contactId||ct?.id;if(cid){handleCollabUpdateContact(cid,{notes:((contacts||[]).find(c=>c.id===cid)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 📋 Besoin: '+(e.besoin||sug.phrase)});showNotif('Besoin noté','success');}else{showNotif('Aucun contact lié','danger');}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="target" s={9}/> Noter besoin</div>}
                {sug.type==='objection' && <div onClick={()=>{const e=sug.entities||{};const cid=e.contactId||ct?.id;if(cid){handleCollabUpdateContact(cid,{notes:((contacts||[]).find(c=>c.id===cid)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] ⚠️ Objection: '+sug.phrase});showNotif('Objection notée','success');}else{showNotif('Aucun contact lié','danger');}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="alert-triangle" s={9}/> Noter</div>}
                {sug.type==='accord' && <div onClick={()=>{const e=sug.entities||{};if(e.contactId){handlePipelineStageChange(e.contactId,'client_valide','Accord verbal: '+sug.phrase);}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="check-circle" s={9}/> Client Validé</div>}
                {sug.type==='decideur' && <div onClick={()=>{const e=sug.entities||{};const decideur=prompt('Décideur :',e.decideur||'');if(!decideur)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 👤 Décideur: '+decideur});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Décideur noté','success');}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="user-check" s={9}/> Décideur</div>}
                {sug.type==='devis' && <div onClick={()=>{const e=sug.entities||{};const email=e.contactEmail||ct?.email||'';if(!email){showNotif('Email requis','danger');return;}window.open('mailto:'+email+'?subject='+encodeURIComponent('Devis — '+((company||{}).name||'Calendar360'))+'&body='+encodeURIComponent('Bonjour,\n\nVeuillez trouver ci-joint notre devis.\n\nCordialement,\n'+(collab?.name||'')));setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Devis ouvert','success');}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="receipt" s={9}/> Devis</div>}
                {sug.type==='urgence' && <div onClick={()=>{const e=sug.entities||{};if(e.contactId){handleCollabUpdateContact(e.contactId,{notes:((contacts||[]).find(c=>c.id===e.contactId)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] ⏰ URGENT: '+sug.phrase,next_action_type:'call',next_action_label:'Urgent',next_action_done:0});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Marqué URGENT','success');}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="zap" s={9}/> Urgent</div>}
                {sug.type==='email_dicte' && <div onClick={()=>{const e=sug.entities||{};const email=prompt('Email :',e.email||'');if(!email)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{email});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Email enregistré','success');}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="at-sign" s={9}/> Enregistrer</div>}
                {sug.type==='tel_dicte' && <div onClick={()=>{const e=sug.entities||{};const phone=prompt('Numéro :',e.phone||'');if(!phone)return;if(e.contactId){handleCollabUpdateContact(e.contactId,{phone});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Téléphone enregistré','success');}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="phone" s={9}/> Enregistrer</div>}
                {sug.type==='document' && <div onClick={()=>{const e=sug.entities||{};const email=e.contactEmail||ct?.email||prompt('Email :');if(!email)return;window.open('mailto:'+email+'?subject='+encodeURIComponent('Documents — '+((company||{}).name||'Calendar360'))+'&body='+encodeURIComponent('Bonjour,\n\nVeuillez trouver ci-joint les documents demandés.\n\nCordialement,\n'+(collab?.name||'')));setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Email ouvert','success');}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="mail" s={9}/> Envoyer</div>}
                {sug.type==='relance_auto' && <div onClick={()=>{const e=sug.entities||{};const date=e.date||new Date(Date.now()+7*86400000).toISOString().split('T')[0];if(e.contactId){handleCollabUpdateContact(e.contactId,{next_action_type:'relance',next_action_label:'Relancer le '+new Date(date).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}),next_action_done:0,next_action_date:date,nrp_next_relance:date});}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Relance programmée','success');}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="clock" s={9}/> Relance</div>}
                {!['rdv','rappel','note','besoin','objection','accord','decideur','devis','urgence','email_dicte','tel_dicte','document','relance_auto'].includes(sug.type) && <div onClick={()=>{setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif(sug.label+' noté','success');}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}><I n="check" s={9}/> OK</div>}
                <div onClick={()=>setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'dismissed'}:s))} style={{padding:'3px 6px',borderRadius:5,fontSize:8,cursor:'pointer',color:T.text3,background:T.bg,border:'1px solid '+T.border}}>✕</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </>) : (<>
    {/* ═══ POST-CALL — Hub complet ═══ */}
    {analysis ? (<div style={{display:'flex',flexDirection:'column',gap:10}}>

      {/* ── Section 1: Quick Summary (always visible) ── */}
      <div style={{padding:'10px 12px',borderRadius:10,background:'linear-gradient(135deg,#7C3AED08,#2563EB06)',border:'1px solid #7C3AED20'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
          <I n="cpu" s={14} style={{color:'#7C3AED'}}/>
          <span style={{fontSize:12,fontWeight:700,color:'#7C3AED'}}>Analyse IA</span>
          <span style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:6,background:(analysis.sentiment==='Très positif'||analysis.sentiment==='Positif'?'#22C55E':analysis.sentiment==='Négatif'?'#EF4444':'#F59E0B')+'15',color:analysis.sentiment==='Très positif'||analysis.sentiment==='Positif'?'#22C55E':analysis.sentiment==='Négatif'?'#EF4444':'#F59E0B',marginLeft:'auto'}}>{analysis.sentiment||'Neutre'}</span>
        </div>
        <div style={{fontSize:11,color:T.text2,lineHeight:1.5,marginBottom:8}}>{analysis.summary}</div>
        <div style={{display:'flex',gap:4}}>
          {_scoreGauge('Sentiment',analysis.sentimentScore||50,analysis.sentimentScore>60?'#22C55E':analysis.sentimentScore>30?'#F59E0B':'#EF4444')}
          {_scoreGauge('Qualité',analysis.qualityScore||50,analysis.qualityScore>60?'#22C55E':analysis.qualityScore>30?'#F59E0B':'#EF4444')}
          {_scoreGauge('Conversion',analysis.conversionScore||50,analysis.conversionScore>60?'#22C55E':analysis.conversionScore>30?'#F59E0B':'#EF4444')}
        </div>
      </div>

      {/* ── Section 2: Actions Recommandées ── */}
      <div style={{borderRadius:10,border:'1px solid '+T.border,overflow:'hidden'}}>
        {_sectionHeader('actions','zap','Actions recommandées',(analysis.recommendedActions||[]).length)}
        {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).actions && (
          <div style={{padding:8,display:'flex',flexDirection:'column',gap:6}}>
            {(analysis.recommendedActions||[]).length===0 && <div style={{padding:12,textAlign:'center',fontSize:10,color:T.text3}}>Aucune action recommandée</div>}
            {(analysis.recommendedActions||[]).map((act,i)=>{
              const aIcon = _actionIcon[act.type]||'zap';
              const aColor = _actionColor[act.type]||'#7C3AED';
              const aStatus = act._status || 'pending';
              return <div key={i} style={{padding:'8px 10px',borderRadius:8,border:'1px solid '+aColor+'25',background:aStatus==='completed'?'#22C55E06':aStatus==='skipped'?T.bg+'80':aColor+'04',opacity:aStatus==='skipped'?0.5:1}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{width:24,height:24,borderRadius:6,background:aColor+'15',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><I n={aIcon} s={12} style={{color:aColor}}/></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:600,color:T.text}}>{act.label||act.type}</div>
                    {act.content && <div style={{fontSize:9,color:T.text3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1}}>{act.content.substring(0,60)}</div>}
                  </div>
                  {aStatus==='pending' && <div onClick={()=>{
                    if(act.type==='send_sms'){setPhoneRightTab('sms');setPhoneSMSText(act.content||'');}
                    else if(act.type==='send_email'){window.open('mailto:'+(ct?.email||'')+'?body='+encodeURIComponent(act.content||''));}
                    else if(act.type==='book_meeting'||act.type==='schedule_callback'){setPhoneScheduleForm({contactId:ct?.id,contactName:ct?.name,number:ct?.phone||'',date:analysis.followupDate||new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:act.label,calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}
                    else if(act.type==='change_pipeline'&&ct?.id){if(confirm('Changer le pipeline vers : '+(act.content||act.label)+'?'))handlePipelineStageChange(ct.id,act.content||analysis.pipelineStage||'contacte');}
                    else if(act.type==='create_note'&&ct?.id){if(confirm('Ajouter cette note ?\n\n'+act.content)){handleCollabUpdateContact(ct.id,{notes:((ct?.notes)||'')+'\n[IA '+new Date().toLocaleDateString('fr-FR')+'] '+act.content});showNotif('Note ajoutée','success');}}
                    else{showNotif(act.label||'Action','info');}
                    // Mark as done
                    const updatedActions = [...(analysis.recommendedActions||[])];
                    updatedActions[i] = {...act, _status:'completed'};
                    setPhoneCallAnalyses(prev=>{const next={...prev};const key=Object.keys(next).find(k=>next[k]?.id===analysis.id);if(key)next[key]={...next[key],recommendedActions:updatedActions};return next;});
                    if(act.id)api('/api/ai-copilot/recommended-actions/'+act.id+'/status',{method:'PUT',body:{status:'completed'}}).catch(()=>{});
                  }} style={{padding:'3px 8px',borderRadius:6,background:aColor,color:'#fff',fontSize:9,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>Exécuter</div>}
                  {aStatus==='completed' && <span style={{fontSize:9,fontWeight:700,color:'#22C55E'}}>Fait</span>}
                  {aStatus==='pending' && <div onClick={(e)=>{e.stopPropagation();
                    const updatedActions = [...(analysis.recommendedActions||[])];
                    updatedActions[i] = {...act, _status:'skipped'};
                    setPhoneCallAnalyses(prev=>{const next={...prev};const key=Object.keys(next).find(k=>next[k]?.id===analysis.id);if(key)next[key]={...next[key],recommendedActions:updatedActions};return next;});
                    if(act.id)api('/api/ai-copilot/recommended-actions/'+act.id+'/status',{method:'PUT',body:{status:'skipped'}}).catch(()=>{});
                  }} style={{padding:'3px 6px',borderRadius:6,background:T.bg,border:'1px solid '+T.border,color:T.text3,fontSize:8,cursor:'pointer'}}>Ignorer</div>}
                </div>
              </div>;
            })}
          </div>
        )}
      </div>

      {/* ── Section Historique appels (déplacé depuis tab Appels) ── */}
      <div style={{borderRadius:10,border:'1px solid '+T.border,overflow:'hidden'}}>
        {_sectionHeader('callHistory','phone','Historique appels',callsForNumber.length)}
        {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).callHistory && (
          <div style={{maxHeight:500,overflowY:'auto'}}>
            {callsForNumber.length===0 ? (
              <div style={{padding:16,textAlign:'center',fontSize:12,color:T.text3}}>Aucun appel enregistré</div>
            ) : callsForNumber.slice(0,30).map(c=>{
              const isExpanded = (typeof iaHubCollapse!=='undefined'?iaHubCollapse:null)['call_'+c.id];
              const hasRec = (typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[c.id] || c.recordingUrl;
              const callAnalysis = (typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)[c.id];
              return <div key={c.id} style={{borderBottom:'1px solid '+T.border}}>
                <div onClick={()=>setIaHubCollapse(p=>({...p,['call_'+c.id]:!p['call_'+c.id]}))} style={{padding:'10px 12px',display:'flex',alignItems:'center',gap:8,cursor:'pointer',transition:'background .15s',background:isExpanded?T.bg:'transparent',borderLeft:isExpanded?'3px solid '+T.accent:'3px solid transparent'}} onMouseEnter={e=>{if(!isExpanded)e.currentTarget.style.background=T.bg;}} onMouseLeave={e=>{if(!isExpanded)e.currentTarget.style.background='transparent';}}>
                  <I n={c.direction==='outbound'?'phone-outgoing':'phone-incoming'} s={14} style={{color:c.direction==='outbound'?'#3B82F6':'#22C55E'}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.text}}>{c.direction==='outbound'?'Appel sortant':'Appel entrant'}{c.status==='missed'||c.status==='no-answer'?' — Manqué':''}</div>
                    <div style={{fontSize:11,color:T.text3}}>{c.createdAt?new Date(c.createdAt).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''} · {c.duration?Math.floor(c.duration/60)+'m'+String(c.duration%60).padStart(2,'0')+'s':'0s'}</div>
                  </div>
                  <div style={{display:'flex',gap:4,alignItems:'center'}}>
                    {hasRec && <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'#EF444412',color:'#EF4444',fontWeight:600}}>REC</span>}
                    {callAnalysis && <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'#7C3AED12',color:'#7C3AED',fontWeight:600}}>IA</span>}
                    <I n={isExpanded?'chevron-up':'chevron-down'} s={14} style={{color:T.text2}}/>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{padding:'8px 12px 12px',display:'flex',flexDirection:'column',gap:6,background:T.bg+'80'}}>
                    {/* Audio inline */}
                    {hasRec && <audio controls src={recUrl(c.id)} style={{width:'100%',height:32,borderRadius:6}} preload="none"/>}
                    {/* Résumé IA inline */}
                    {callAnalysis?.summary && <div style={{padding:'6px 10px',borderRadius:8,background:'#7C3AED08',border:'1px solid #7C3AED20',fontSize:12,color:T.text,lineHeight:1.5}}><I n="cpu" s={11} style={{color:'#7C3AED',marginRight:4}}/> {callAnalysis.summary}</div>}
                    {/* Transcription inline — fetch on demand */}
                    <div onClick={(e)=>{
                      e.stopPropagation();
                      if(_T.iaCallTranscripts?.[c.id]){setIaHubCollapse(p=>({...p,['tr_'+c.id]:!p['tr_'+c.id]}));return;}
                      if(!hasRec){
                        if(!_T.iaCallTranscripts)_T.iaCallTranscripts={};
                        _T.iaCallTranscripts[c.id]={_noRec:true};
                        setIaHubCollapse(p=>({...p,['tr_'+c.id]:true}));
                        return;
                      }
                      api('/api/voip/transcript/'+c.id).then(d=>{
                        if(!_T.iaCallTranscripts)_T.iaCallTranscripts={};
                        _T.iaCallTranscripts[c.id]=d&&(d.fullText||d.segments)?d:{_empty:true};
                        setIaHubCollapse(p=>({...p,['tr_'+c.id]:true}));
                      }).catch(()=>{
                        if(!_T.iaCallTranscripts)_T.iaCallTranscripts={};
                        _T.iaCallTranscripts[c.id]={_empty:true};
                        setIaHubCollapse(p=>({...p,['tr_'+c.id]:true}));
                      });
                    }} style={{fontSize:12,color:'#3B82F6',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:4,padding:'4px 0'}}>
                      <I n="file-text" s={12}/> {_T.iaCallTranscripts?.[c.id]?'Masquer transcription':'📝 Voir la transcription'}
                    </div>
                    {(typeof iaHubCollapse!=='undefined'?iaHubCollapse:null)['tr_'+c.id] && _T.iaCallTranscripts?.[c.id] && (()=>{
                      const tr = _T.iaCallTranscripts[c.id];
                      if(tr._noRec) return <div style={{padding:'8px 12px',borderRadius:8,background:'#F59E0B08',border:'1px solid #F59E0B20',fontSize:12,color:'#F59E0B',lineHeight:1.5}}>⚠️ REC n'était pas activé pendant cet appel — pas de transcription disponible.<br/><span style={{fontSize:11,color:'#92400E'}}>Activez REC avant d'appeler pour enregistrer et transcrire.</span></div>;
                      if(tr._empty) return <div style={{padding:'8px 12px',borderRadius:8,background:T.bg,border:'1px solid '+T.border,fontSize:12,color:T.text3,textAlign:'center'}}>Aucune transcription trouvée pour cet appel</div>;
                      const segs = tr.segments || (tr.segments_json ? (()=>{try{return JSON.parse(tr.segments_json);}catch{return[];}})() : []);
                      return segs.length>0 ? (
                        <div style={{maxHeight:150,overflowY:'auto',display:'flex',flexDirection:'column',gap:2}}>
                          {segs.map((seg,si)=>(
                            <div key={si} style={{display:'flex',flexDirection:'column',alignItems:(seg.speaker==='agent'||seg.speaker==='collab')?'flex-end':'flex-start'}}>
                              <div style={{maxWidth:'85%',padding:'4px 8px',borderRadius:8,background:(seg.speaker==='agent'||seg.speaker==='collab')?'#7C3AED12':T.bg,border:'1px solid '+T.border+'50',fontSize:12,color:T.text,lineHeight:1.4}}>{seg.text}</div>
                            </div>
                          ))}
                        </div>
                      ) : tr.fullText ? <div style={{fontSize:12,color:T.text,lineHeight:1.5,maxHeight:200,overflowY:'auto',padding:'6px 10px',background:T.card,borderRadius:8,border:'1px solid '+T.border}}>{tr.fullText}</div> : <div style={{fontSize:11,color:T.text3,padding:'8px',textAlign:'center'}}>Aucune transcription disponible pour cet appel</div>;
                    })()}
                    {/* Bouton télécharger transcription en .txt */}
                    {(typeof iaHubCollapse!=='undefined'?iaHubCollapse:null)['tr_'+c.id] && _T.iaCallTranscripts?.[c.id] && (()=>{
                      const tr=_T.iaCallTranscripts[c.id];
                      const segs=tr.segments||(tr.segments_json?(()=>{try{return JSON.parse(tr.segments_json);}catch{return[];}})():[]);
                      const text=segs.length>0?segs.map(s=>`[${s.speaker||'?'}] ${s.text}`).join('\n'):(tr.fullText||'');
                      if(!text)return null;
                      return <div onClick={(e)=>{
                        e.stopPropagation();
                        const header=`Transcription appel — ${c.direction==='outbound'?'Sortant':'Entrant'}\nDate: ${c.createdAt?new Date(c.createdAt).toLocaleString('fr-FR'):''}\nDurée: ${c.duration?Math.floor(c.duration/60)+'m'+String(c.duration%60).padStart(2,'0')+'s':'?'}\n${'─'.repeat(40)}\n\n`;
                        const blob=new Blob([header+text],{type:'text/plain;charset=utf-8'});
                        const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`transcription-${c.id}.txt`;a.click();URL.revokeObjectURL(url);
                      }} style={{fontSize:12,color:'#059669',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:4,padding:'4px 0'}}><I n="download" s={12}/> Télécharger la transcription (.txt)</div>;
                    })()}
                    {/* Info si pas d'enregistrement */}
                    {!hasRec && <div style={{fontSize:11,color:T.text3,padding:'6px 10px',background:'#F59E0B08',borderRadius:6,border:'1px solid #F59E0B15'}}>⚠️ Pas d'enregistrement audio — la transcription nécessite l'enregistrement activé</div>}
                    {/* Générer analyse si pas dispo */}
                    {!callAnalysis && c.duration>15 && <div onClick={(e)=>{
                      e.stopPropagation();
                      api(`/api/ai-copilot/analyze/${c.id}`,{method:'POST',body:{companyId:company.id,collaboratorId:collab.id}}).then(r=>{
                        if(r?.success){setPhoneCallAnalyses(prev=>({...prev,[c.id]:r}));showNotif('Analyse générée','success');}
                      }).catch(()=>showNotif('Erreur — vérifiez les crédits OpenAI','danger'));
                    }} style={{fontSize:12,color:'#7C3AED',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:4,padding:'4px 0'}}><I n="cpu" s={12}/> Générer l'analyse IA</div>}
                  </div>
                )}
              </div>;
            })}
            {callsForNumber.length>20 && <div style={{padding:10,textAlign:'center',fontSize:11,color:T.text3}}>{callsForNumber.length-20} appels supplémentaires</div>}
          </div>
        )}
      </div>

      {/* ── Section 3: Résumé Structuré Validable ── */}
      <div style={{borderRadius:10,border:'1px solid #7C3AED25',overflow:'hidden'}}>
        {_sectionHeader('resume','file-text','Résumé structuré',null)}
        {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).resume && (
          <div style={{padding:10,display:'flex',flexDirection:'column',gap:8}}>
            {[
              {label:'Résumé',value:(typeof aiValidationEditing!=='undefined'?aiValidationEditing:null)?((typeof aiValidationEdits!=='undefined'?aiValidationEdits:{}).summary??analysis.summary):analysis.summary,key:'summary',editable:true},
              {label:'Besoin exprimé',value:(typeof aiValidationEditing!=='undefined'?aiValidationEditing:null)?((typeof aiValidationEdits!=='undefined'?aiValidationEdits:{}).besoin??(_ext.besoinExprime||'')):(_ext.besoinExprime||''),key:'besoin',editable:true},
              {label:'Objections',value:(analysis.objections||[]).map(o=>typeof o==='string'?o:o.objection).filter(Boolean).join(' · ')||'Aucune',editable:false},
              {label:'Niveau d\'intérêt',value:analysis.conversionScore,type:'gauge',editable:false},
              {label:'Actions',value:(analysis.actionItems||[]).join(' · ')||'Aucune',editable:false},
              {label:'Relance',value:analysis.followupDate?new Date(analysis.followupDate+'T12:00').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short',year:'numeric'})+' ('+analysis.followupType+')':'Non définie',editable:false},
              {label:'Infos importantes',value:(typeof aiValidationEditing!=='undefined'?aiValidationEditing:null)?((typeof aiValidationEdits!=='undefined'?aiValidationEdits:{}).infos??(_ext.informationsImportantes||'')):(_ext.informationsImportantes||''),key:'infos',editable:true},
              {label:'Sentiment',value:(analysis.sentimentScore||50)+'% — '+(analysis.sentiment||'Neutre'),editable:false},
            ].map((f,i)=>(
              <div key={i}>
                <div style={{fontSize:9,fontWeight:700,color:'#7C3AED',marginBottom:2}}>{f.label}</div>
                {f.type==='gauge' ? (
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <div style={{flex:1,height:6,borderRadius:3,background:T.border}}>
                      <div style={{width:Math.min(100,f.value||0)+'%',height:'100%',borderRadius:3,background:f.value>60?'#22C55E':f.value>30?'#F59E0B':'#EF4444'}}/>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:f.value>60?'#22C55E':f.value>30?'#F59E0B':'#EF4444'}}>{f.value||0}%</span>
                  </div>
                ) : (typeof aiValidationEditing!=='undefined'?aiValidationEditing:null) && f.editable ? (
                  <textarea value={f.value||''} onChange={e=>setAiValidationEdits(p=>({...p,[f.key]:e.target.value}))} rows={f.key==='summary'?3:2} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #7C3AED30',background:'#7C3AED04',color:T.text,fontSize:10,fontFamily:'inherit',resize:'vertical',outline:'none'}}/>
                ) : (
                  <div style={{fontSize:10,color:f.value?T.text:T.text3,lineHeight:1.4}}>{f.value||'—'}</div>
                )}
              </div>
            ))}
            {/* Validation buttons */}
            <div style={{display:'flex',gap:6,marginTop:4}}>
              {!(typeof aiValidationEditing!=='undefined'?aiValidationEditing:null) ? (<>
                <div onClick={()=>{
                  api('/api/ai-copilot/validate/'+analysis.id,{method:'POST',body:{action:'validate'}}).then(r=>{
                    if(r?.success){handleCollabUpdateContact(ct?.id,{last_ai_analysis_id:analysis.id});showNotif('Résumé validé et injecté dans la fiche','success');}
                    else showNotif(r?.error||'Erreur','danger');
                  }).catch(()=>showNotif('Erreur réseau','danger'));
                }} style={{flex:1,padding:'7px 0',borderRadius:8,background:'#22C55E',color:'#fff',fontSize:11,fontWeight:700,textAlign:'center',cursor:'pointer'}}><I n="check" s={12}/> Valider</div>
                <div onClick={()=>{setAiValidationEditing(true);setAiValidationEdits({summary:analysis.summary,besoin:_ext.besoinExprime||'',infos:_ext.informationsImportantes||''});}} style={{flex:1,padding:'7px 0',borderRadius:8,background:'#3B82F6',color:'#fff',fontSize:11,fontWeight:700,textAlign:'center',cursor:'pointer'}}><I n="edit-3" s={12}/> Modifier</div>
                <div onClick={()=>{
                  api('/api/ai-copilot/validate/'+analysis.id,{method:'POST',body:{action:'reject'}}).then(r=>{
                    if(r?.success)showNotif('Analyse refusée','info');
                  }).catch(()=>{});
                }} style={{padding:'7px 12px',borderRadius:8,background:T.bg,border:'1px solid '+T.border,color:T.text3,fontSize:11,fontWeight:700,textAlign:'center',cursor:'pointer'}}>Refuser</div>
              </>) : (<>
                <div onClick={()=>{
                  const edits = {};
                  if((typeof aiValidationEdits!=='undefined'?aiValidationEdits:{}).summary!==analysis.summary) edits.editedSummary=(typeof aiValidationEdits!=='undefined'?aiValidationEdits:{}).summary;
                  if((typeof aiValidationEdits!=='undefined'?aiValidationEdits:{}).besoin!==(_ext.besoinExprime||'')) edits.editedBesoin=(typeof aiValidationEdits!=='undefined'?aiValidationEdits:{}).besoin;
                  if((typeof aiValidationEdits!=='undefined'?aiValidationEdits:{}).infos!==(_ext.informationsImportantes||'')) edits.editedInfos=(typeof aiValidationEdits!=='undefined'?aiValidationEdits:{}).infos;
                  api('/api/ai-copilot/validate/'+analysis.id,{method:'POST',body:{action:'validate',...edits}}).then(r=>{
                    if(r?.success){handleCollabUpdateContact(ct?.id,{last_ai_analysis_id:analysis.id});showNotif('Résumé modifié et validé','success');setAiValidationEditing(false);}
                    else showNotif(r?.error||'Erreur','danger');
                  }).catch(()=>showNotif('Erreur','danger'));
                }} style={{flex:1,padding:'7px 0',borderRadius:8,background:'#22C55E',color:'#fff',fontSize:11,fontWeight:700,textAlign:'center',cursor:'pointer'}}><I n="check" s={12}/> Valider les modifications</div>
                <div onClick={()=>{setAiValidationEditing(false);setAiValidationEdits({});}} style={{padding:'7px 12px',borderRadius:8,background:T.bg,border:'1px solid '+T.border,color:T.text3,fontSize:11,fontWeight:700,cursor:'pointer'}}>Annuler</div>
              </>)}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 4: Analyse Détaillée ── */}
      <div style={{borderRadius:10,border:'1px solid '+T.border,overflow:'hidden'}}>
        {_sectionHeader('detail','bar-chart-2','Analyse détaillée',null)}
        {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).detail && (
          <div style={{padding:10,display:'flex',flexDirection:'column',gap:8}}>
            {(analysis.objections||[]).length>0 && <div>
              <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:4}}>Objections ({analysis.objections.length})</div>
              {analysis.objections.map((o,i)=>(
                <div key={i} style={{padding:'6px 8px',borderRadius:6,background:'#EF444406',border:'1px solid #EF444415',marginBottom:4}}>
                  <div style={{fontSize:10,fontWeight:600,color:'#EF4444'}}>{typeof o==='string'?o:o.objection}</div>
                  {o.suggestedResponse && <div style={{fontSize:9,color:'#22C55E',marginTop:2}}>→ {o.suggestedResponse}</div>}
                </div>
              ))}
            </div>}
            {(analysis.coachingTips||[]).length>0 && <div>
              <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:4}}>Coaching ({analysis.coachingTips.length})</div>
              {analysis.coachingTips.map((t,i)=><div key={i} style={{padding:'4px 8px',borderRadius:6,background:'#7C3AED06',border:'1px solid #7C3AED15',fontSize:10,color:T.text,marginBottom:3}}>{typeof t==='string'?t:t.text||t.tip}</div>)}
            </div>}
            {(analysis.tags||[]).length>0 && <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
              {analysis.tags.map((t,i)=><span key={i} style={{fontSize:8,fontWeight:700,padding:'2px 6px',borderRadius:4,background:'#7C3AED15',color:'#7C3AED'}}>{t}</span>)}
            </div>}
            {analysis.pipelineStage && <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',borderRadius:6,background:'#22C55E06',border:'1px solid #22C55E15'}}>
              <I n="git-branch" s={12} style={{color:'#22C55E'}}/>
              <span style={{fontSize:10,color:T.text}}>Pipeline suggéré : <strong>{analysis.pipelineStage}</strong></span>
              {ct?.id && ct.pipeline_stage!==analysis.pipelineStage && <div onClick={()=>{if(confirm('Changer vers '+analysis.pipelineStage+' ?'))handlePipelineStageChange(ct.id,analysis.pipelineStage);}} style={{marginLeft:'auto',padding:'2px 8px',borderRadius:5,background:'#22C55E',color:'#fff',fontSize:9,fontWeight:700,cursor:'pointer'}}>Appliquer</div>}
            </div>}
          </div>
        )}
      </div>

      {/* ── Section 5: Transcription ── */}
      <div style={{borderRadius:10,border:'1px solid '+T.border,overflow:'hidden'}}>
        {_sectionHeader('transcript','file-text','Transcription',null)}
        {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).transcript && (
          <div style={{padding:10,maxHeight:300,overflowY:'auto'}}>
            {_T.iaTranscript ? (
              (_T.iaTranscript.segments||[]).length>0 ? _T.iaTranscript.segments.map((seg,i)=>(
                <div key={i} style={{display:'flex',flexDirection:'column',alignItems:(seg.speaker==='agent'||seg.speaker==='collab')?'flex-end':'flex-start',marginBottom:4}}>
                  <div style={{fontSize:8,fontWeight:600,color:T.text3,marginBottom:1}}>{(seg.speaker==='agent'||seg.speaker==='collab')?'Vous':'Contact'}</div>
                  <div style={{maxWidth:'85%',padding:'4px 8px',borderRadius:8,background:(seg.speaker==='agent'||seg.speaker==='collab')?'linear-gradient(135deg,#7C3AED,#2563EB)':T.bg,color:(seg.speaker==='agent'||seg.speaker==='collab')?'#fff':T.text,fontSize:10,lineHeight:1.3}}>{seg.text}</div>
                </div>
              )) : <div style={{fontSize:10,color:T.text2,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{_T.iaTranscript.fullText||'Transcription vide'}</div>
            ) : (
              <div onClick={()=>{
                const callId = cl?.id || Object.keys((typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)||{}).find(k=>(typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)[k]?.id===analysis?.id);
                if(callId)api('/api/voip/transcript/'+callId).then(d=>{_T.iaTranscript=d;setIaHubCollapse(p=>({...p,transcript:false}));}).catch(()=>showNotif('Transcription non disponible','info'));
              }} style={{textAlign:'center',padding:12,cursor:'pointer'}}>
                <I n="download" s={16} style={{color:'#7C3AED',marginBottom:4}}/>
                <div style={{fontSize:10,fontWeight:600,color:'#7C3AED'}}>Charger la transcription</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 6: Audio ── */}
      <div style={{borderRadius:10,border:'1px solid '+T.border,overflow:'hidden'}}>
        {_sectionHeader('audio','headphones','Enregistrement',null)}
        {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).audio && (()=>{
          const callId = cl?.id || Object.keys((typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)||{}).find(k=>(typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)[k]?.id===analysis?.id);
          const hasRec = callId && ((typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[callId] || ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).find(c=>c.id===callId)?.recordingUrl);
          return <div style={{padding:10}}>
            {hasRec ? <audio controls src={recUrl(callId)} style={{width:'100%',height:32,borderRadius:8}} preload="none"/> : <div style={{textAlign:'center',padding:12,color:T.text3,fontSize:10}}>Aucun enregistrement disponible</div>}
          </div>;
        })()}
      </div>

    </div>) : (
      <div style={{textAlign:'center',padding:24,color:T.text3}}>
        <I n="cpu" s={28} style={{color:'#7C3AED40',marginBottom:8}}/>
        <div style={{fontSize:12,fontWeight:600}}>IA Copilot</div>
        <div style={{fontSize:10,marginTop:4}}>{!collab.ai_copilot_enabled?'Activez le Copilot IA dans vos paramètres pour générer des analyses automatiques.':'Lancez un appel pour activer le coaching IA en temps réel.'}</div>
        {cl?.id && !analysis && <div onClick={()=>{
          api(`/api/ai-copilot/analyze/${cl.id}`,{method:'POST',body:{companyId:company.id,collaboratorId:collab.id}}).then(r=>{
            if(r?.success){showNotif('Analyse IA terminée','success');(typeof setPhoneCallAnalyses==='function'?setPhoneCallAnalyses:function(){})(prev=>({...prev,[cl.id]:r}));try{localStorage.setItem('c360-phone-analyses-'+collab.id,JSON.stringify({...phoneCallAnalyses,[cl.id]:r}));}catch{}}
            else showNotif(r?.error||'Analyse échouée','danger');
          }).catch(()=>showNotif('Erreur réseau','danger'));
        }} style={{marginTop:10,padding:'8px 16px',borderRadius:8,background:'#7C3AED',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4}}><I n="cpu" s={12}/> Générer l'analyse</div>}
      </div>
    )}
    {/* ── Dernière session d'appel (mémoire post-raccroché) ── */}
    {!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:null) && (
      <div style={{borderRadius:10,border:'1px solid #7C3AED20',overflow:'hidden',marginTop:10}}>
        <div onClick={()=>setIaHubCollapse(p=>({...p,lastSession:!p.lastSession}))} style={{padding:'8px 10px',background:'linear-gradient(135deg,#7C3AED08,#2563EB06)',display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
          <I n="history" s={12} style={{color:'#7C3AED'}}/>
          <span style={{fontSize:10,fontWeight:700,color:'#7C3AED',flex:1}}>Dernière session d'appel</span>
          <span style={{fontSize:8,color:T.text3}}>{(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).endedAt?new Date((typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).endedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''} · {Math.floor(((typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).duration||0)/60)}m{String(((typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).duration||0)%60).padStart(2,'0')}s</span>
          <I n={(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).lastSession?'chevron-up':'chevron-down'} s={10} style={{color:T.text3}}/>
        </div>
        {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).lastSession && <div style={{padding:'8px 10px',display:'flex',flexDirection:'column',gap:6}}>
          {/* Coaching commercial mémorisé */}
          {(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).liveAnalysis && (
            <div style={{padding:'6px 8px',borderRadius:6,background:'#F9731606',border:'1px solid #F9731620'}}>
              <div style={{fontSize:8,fontWeight:700,color:'#F97316',marginBottom:3}}>🎯 Dernier coaching</div>
              {(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).liveAnalysis.phraseToSay && <div style={{fontSize:10,color:T.text,fontStyle:'italic',marginBottom:2}}>"{(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).liveAnalysis.phraseToSay}"</div>}
              {(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).liveAnalysis.openQuestion && <div style={{fontSize:9,color:'#3B82F6',marginBottom:2}}>❓ {(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).liveAnalysis.openQuestion}</div>}
              {(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).liveAnalysis.detectedObjection && <div style={{fontSize:9,color:'#EF4444'}}>⚡ Objection: {(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).liveAnalysis.detectedObjection}</div>}
              {(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).liveAnalysis.keyInsight && <div style={{fontSize:9,color:T.text3,fontStyle:'italic'}}>💡 {(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).liveAnalysis.keyInsight}</div>}
            </div>
          )}
          {/* Transcription mémorisée */}
          {(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).transcript?.length > 0 && (()=>{
            // Helper : formate la transcription en texte brut
            const formatTranscriptText = () => {
              const ct = (typeof pipelineRightContact!=='undefined'?pipelineRightContact:null) || contacts.find(c=>c.id===(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).contactId) || {};
              const dateStr = (typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).endedAt ? new Date((typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).endedAt).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
              const durStr = (typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).duration ? Math.floor((typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).duration/60)+'m'+String((typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).duration%60).padStart(2,'0')+'s' : '—';
              let txt = '═══════════════════════════════════\n';
              txt += 'TRANSCRIPTION D\'APPEL\n';
              txt += '═══════════════════════════════════\n\n';
              if (ct.name) txt += `Contact : ${ct.name}\n`;
              if (ct.phone||(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).number) txt += `Numéro  : ${ct.phone||(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).number}\n`;
              if (dateStr) txt += `Date    : ${dateStr}\n`;
              txt += `Durée   : ${durStr}\n`;
              txt += `Messages: ${(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).transcript.length}\n\n`;
              txt += '-----------------------------------\n\n';
              (typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).transcript.forEach(t=>{
                const speaker = t.speaker==='me' ? 'VOUS     ' : 'CONTACT  ';
                txt += `${speaker}: ${t.text}\n`;
              });
              txt += '\n═══════════════════════════════════\n';
              txt += `Généré par Calendar360 · ${new Date().toLocaleString('fr-FR')}\n`;
              return txt;
            };
            const copyTranscript = (e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(formatTranscriptText());
              showNotif("✓ Transcription copiée");
            };
            const downloadTranscript = (e) => {
              e.stopPropagation();
              const text = formatTranscriptText();
              const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              const ct = (typeof pipelineRightContact!=='undefined'?pipelineRightContact:null) || contacts.find(c=>c.id===(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).contactId) || {};
              const safeName = (ct.name||'appel').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30);
              const dateSlug = (typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).endedAt ? new Date((typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).endedAt).toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
              a.href = url;
              a.download = `transcription-${safeName}-${dateSlug}.txt`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              showNotif("✓ Transcription téléchargée");
            };
            return (
            <div style={{borderRadius:6,border:'1px solid '+T.border,overflow:'hidden'}}>
              <div onClick={()=>(typeof setIaHubCollapse==='function'?setIaHubCollapse:function(){})(p=>({...p,lastTranscript:!p.lastTranscript}))} style={{padding:'5px 8px',background:T.bg,display:'flex',alignItems:'center',gap:6,cursor:'pointer',borderBottom:(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).lastTranscript?'none':'1px solid '+T.border}}>
                <span style={{fontSize:9,fontWeight:700,color:T.text2,flex:1}}>Transcription ({(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).transcript.length} messages)</span>
                <div onClick={copyTranscript} title="Copier le texte de la conversation" style={{padding:'2px 6px',borderRadius:4,background:'#7C3AED12',color:'#7C3AED',fontSize:8,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:3,border:'1px solid #7C3AED20'}}>
                  <I n="copy" s={9}/> Copier
                </div>
                <div onClick={downloadTranscript} title="Télécharger en .txt" style={{padding:'2px 6px',borderRadius:4,background:'#2563EB12',color:'#2563EB',fontSize:8,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:3,border:'1px solid #2563EB20'}}>
                  <I n="download" s={9}/> .txt
                </div>
                <I n={(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).lastTranscript?'chevron-down':'chevron-up'} s={9} style={{color:T.text3}}/>
              </div>
              {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).lastTranscript && <div style={{maxHeight:150,overflow:'auto',padding:6,display:'flex',flexDirection:'column',gap:2}}>
                {(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).transcript.map((t,i)=>(
                  <div key={i} style={{display:'flex',flexDirection:'column',alignItems:t.speaker==='me'?'flex-end':'flex-start'}}>
                    <div style={{maxWidth:'85%',padding:'3px 6px',borderRadius:6,background:t.speaker==='me'?'linear-gradient(135deg,#7C3AED,#2563EB)':T.bg,color:t.speaker==='me'?'#fff':T.text,fontSize:9,lineHeight:1.3}}>{t.text}</div>
                  </div>
                ))}
              </div>}
            </div>);
          })()}
          {/* Suggestions mémorisées */}
          {(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).suggestions?.filter(s=>s.status!=='dismissed').length > 0 && (
            <div>
              <div style={{fontSize:9,fontWeight:700,color:'#F59E0B',marginBottom:3}}>⚡ Suggestions détectées ({(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).suggestions.filter(s=>s.status!=='dismissed').length})</div>
              {(typeof phoneLastCallSession!=='undefined'?phoneLastCallSession:{}).suggestions.filter(s=>s.status!=='dismissed').slice(0,5).map(sug=>(
                <div key={sug.id} style={{padding:'3px 6px',borderRadius:4,border:'1px solid '+(sug.status==='done'?'#22C55E20':sug.color+'20'),background:sug.status==='done'?'#22C55E04':sug.color+'04',marginBottom:2,display:'flex',alignItems:'center',gap:4,opacity:sug.status==='done'?0.6:1}}>
                  <I n={sug.icon} s={9} style={{color:sug.status==='done'?'#22C55E':sug.color}}/>
                  <span style={{fontSize:8,fontWeight:600,color:sug.status==='done'?'#22C55E':sug.color,flex:1}}>{sug.label}</span>
                  {sug.status==='done'&&<span style={{fontSize:7,color:'#22C55E'}}>✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>}
      </div>
    )}
    {/* ── Historique appels — visible même sans analyse (hors conditionnel) ── */}
    {!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && callsForNumber.length > 0 && !analysis && (
      <div style={{borderRadius:10,border:'1px solid '+T.border,overflow:'hidden',marginTop:10}}>
        {_sectionHeader('callHistoryEmpty','phone','Historique appels',callsForNumber.length)}
        {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).callHistoryEmpty && (
          <div style={{maxHeight:350,overflowY:'auto'}}>
            {callsForNumber.slice(0,8).map(c=>{
              const expandKey = 'histAr_'+c.id;
              const isExpanded = !!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:null)[expandKey];
              if (!_T.archiveCache) _T.archiveCache = {};
              const cached = _T.archiveCache[c.id];

              const toggleExpand = async () => {
                const nowExpanded = !isExpanded;
                setIaHubCollapse(p=>({...p,[expandKey]:nowExpanded}));
                if (nowExpanded && !cached) {
                  // Load from backend
                  _T.archiveCache[c.id] = { _loading: true };
                  setIaHubCollapse(p=>({...p,_archRefresh:Date.now()}));
                  try {
                    const r = await api('/api/voip/archive-transcript/'+c.id, { method: 'POST' });
                    if (r?.success) {
                      _T.archiveCache[c.id] = r;
                    } else {
                      _T.archiveCache[c.id] = { _empty: true, error: r?.error || 'Aucune transcription disponible' };
                    }
                  } catch {
                    _T.archiveCache[c.id] = { _empty: true, error: 'Erreur de chargement' };
                  }
                  setIaHubCollapse(p=>({...p,_archRefresh:Date.now()}));
                }
              };

              const handleCopy = (e) => {
                e.stopPropagation();
                if (!cached || cached._loading || cached._empty) return;
                navigator.clipboard.writeText(cached.text);
                showNotif('✓ Transcription copiée (' + cached.archiveId.slice(0, 18) + '…)');
              };

              const handleDownload = (e) => {
                e.stopPropagation();
                if (!cached || cached._loading || cached._empty) return;
                const blob = new Blob([cached.text], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = cached.filename || ('transcription-' + cached.archiveId + '.txt');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showNotif('✓ Transcription téléchargée');
              };

              return (
              <div key={c.id} style={{borderBottom:'1px solid '+T.border}}>
                {/* Ligne principale cliquable */}
                <div onClick={toggleExpand} style={{padding:'6px 10px',display:'flex',alignItems:'center',gap:6,cursor:'pointer',transition:'background .12s'}} onMouseEnter={e=>e.currentTarget.style.background=T.bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <I n={c.direction==='outbound'?'phone-outgoing':'phone-incoming'} s={10} style={{color:c.direction==='outbound'?'#3B82F6':'#22C55E'}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:600,color:T.text}}>{c.direction==='outbound'?'Sortant':'Entrant'}{c.status==='missed'?' — Manqué':''}</div>
                    <div style={{fontSize:8,color:T.text3}}>{c.createdAt?new Date(c.createdAt).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''} · {c.duration?Math.floor(c.duration/60)+'m'+String(c.duration%60).padStart(2,'0')+'s':'—'}</div>
                  </div>
                  {((typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[c.id]||c.recordingUrl) && <I n="mic" s={9} style={{color:'#EF4444'}} title="Enregistrement audio"/>}
                  {(typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)[c.id] && <I n="cpu" s={9} style={{color:'#7C3AED'}} title="Analyse IA"/>}
                  <I n={isExpanded?'chevron-up':'chevron-down'} s={10} style={{color:T.text3}}/>
                </div>
                {/* Zone dépliée */}
                {isExpanded && (
                  <div style={{padding:'8px 10px',background:T.bg,borderTop:'1px solid '+T.border+'50'}}>
                    {cached?._loading && (
                      <div style={{textAlign:'center',padding:12,fontSize:10,color:T.text3}}>
                        <I n="loader" s={12}/> Chargement de la transcription…
                      </div>
                    )}
                    {cached?._empty && (
                      <div style={{padding:'8px 10px',borderRadius:6,background:'#F59E0B08',border:'1px solid #F59E0B20',fontSize:10,color:'#92400E',display:'flex',alignItems:'flex-start',gap:6}}>
                        <span style={{fontSize:14}}>⚠️</span>
                        <div>
                          <div style={{fontWeight:700,marginBottom:2}}>Aucune transcription disponible</div>
                          <div style={{fontSize:9,color:'#B45309'}}>Activez REC avant l'appel pour enregistrer la voix et générer automatiquement une transcription (live + audio).</div>
                        </div>
                      </div>
                    )}
                    {cached?.success && (
                      <>
                        {/* Badges sources */}
                        <div style={{display:'flex',gap:4,marginBottom:6,flexWrap:'wrap',alignItems:'center'}}>
                          <span style={{fontSize:8,fontWeight:700,color:T.text3,textTransform:'uppercase',letterSpacing:.3}}>Sources :</span>
                          {cached.hasLive && <span style={{padding:'1px 6px',borderRadius:3,background:'#3B82F615',color:'#3B82F6',fontSize:8,fontWeight:700}}>⚡ Live</span>}
                          {cached.hasAudio && <span style={{padding:'1px 6px',borderRadius:3,background:'#7C3AED15',color:'#7C3AED',fontSize:8,fontWeight:700}}>🎤 Audio</span>}
                          <span style={{marginLeft:'auto',fontSize:8,color:T.text3,fontFamily:'monospace'}} title="Archive ID">{cached.archiveId}</span>
                        </div>
                        {/* Preview bulles chat */}
                        {cached.segments?.length > 0 ? (
                          <div style={{maxHeight:200,overflowY:'auto',padding:'6px 4px',display:'flex',flexDirection:'column',gap:3,background:T.card||T.surface,borderRadius:6,border:'1px solid '+T.border}}>
                            {cached.segments.map((seg,si)=>{
                              const isMe = seg.speaker==='agent'||seg.speaker==='collab'||seg.speaker==='me';
                              return (
                              <div key={si} style={{display:'flex',flexDirection:'column',alignItems:isMe?'flex-end':'flex-start'}}>
                                <div style={{fontSize:7,color:T.text3,fontWeight:700,marginBottom:1,padding:'0 4px'}}>{isMe?'VOUS':'CONTACT'}{seg.source?' · '+(seg.source==='live'?'live':'audio'):''}</div>
                                <div style={{maxWidth:'85%',padding:'4px 8px',borderRadius:isMe?'8px 8px 2px 8px':'8px 8px 8px 2px',background:isMe?'linear-gradient(135deg,#7C3AED,#2563EB)':T.bg,color:isMe?'#fff':T.text,fontSize:10,lineHeight:1.4}}>{seg.text}</div>
                              </div>);
                            })}
                          </div>
                        ) : (
                          <div style={{padding:8,fontSize:10,color:T.text3,textAlign:'center',background:T.card||T.surface,borderRadius:6,border:'1px solid '+T.border}}>
                            Transcription vide (aucun segment détecté)
                          </div>
                        )}
                        {/* Boutons actions */}
                        <div style={{display:'flex',gap:5,marginTop:8}}>
                          <div onClick={handleCopy} title="Copier le texte formaté" style={{flex:1,padding:'6px 10px',borderRadius:6,background:'#7C3AED12',color:'#7C3AED',fontSize:10,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4,border:'1px solid #7C3AED30'}}>
                            <I n="copy" s={11}/> Copier
                          </div>
                          <div onClick={handleDownload} title="Télécharger en .txt" style={{flex:1,padding:'6px 10px',borderRadius:6,background:'#2563EB12',color:'#2563EB',fontSize:10,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4,border:'1px solid #2563EB30'}}>
                            <I n="download" s={11}/> Télécharger .txt
                          </div>
                        </div>
                        <div style={{fontSize:8,color:T.text3,textAlign:'center',marginTop:4,fontStyle:'italic'}}>
                          ✓ Archivée automatiquement dans le corpus IA
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>);
            })}
          </div>
        )}
      </div>
    )}
    {/* ── Suggestions détectées — TOUJOURS visibles après raccroché (hors conditionnel analysis) ── */}
    {!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status!=='dismissed').length > 0 && (
      <div style={{borderRadius:10,border:'1px solid #F59E0B25',overflow:'hidden',marginTop:10}}>
        <div onClick={()=>(typeof setIaHubCollapse==='function'?setIaHubCollapse:function(){})(p=>({...p,sugPostCall:!p.sugPostCall}))} style={{padding:'8px 10px',display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:'#F59E0B06',borderBottom:(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).sugPostCall?'none':'1px solid #F59E0B15'}} onMouseEnter={e=>e.currentTarget.style.background='#F59E0B10'} onMouseLeave={e=>e.currentTarget.style.background='#F59E0B06'}>
          <I n="zap" s={12} style={{color:'#F59E0B'}}/>
          <span style={{fontSize:11,fontWeight:700,color:T.text,flex:1}}>Suggestions de l'appel</span>
          <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'#F59E0B15',color:'#F59E0B'}}>{(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status==='pending'||s.status==='review').length} à traiter</span>
          <I n={(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).sugPostCall?'chevron-down':'chevron-up'} s={12} style={{color:T.text3}}/>
        </div>
        {!(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{}).sugPostCall && (
          <div style={{padding:8,display:'flex',flexDirection:'column',gap:4}}>
            {(typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:{}).filter(s=>s.status!=='dismissed').sort((a,b)=>{const order={pending:0,review:1,done:2};return(order[a.status]??3)-(order[b.status]??3);}).slice(0,10).map(sug=>(
              <div key={sug.id} style={{padding:'6px 8px',borderRadius:6,border:'1px solid '+(sug.status==='done'?'#22C55E25':sug.color+'25'),background:sug.status==='done'?'#22C55E04':sug.color+'04',opacity:sug.status==='done'?0.6:1}}>
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  <I n={sug.icon} s={10} style={{color:sug.status==='done'?'#22C55E':sug.color}}/>
                  <span style={{fontSize:9,fontWeight:700,color:sug.status==='done'?'#22C55E':sug.color,flex:1}}>{sug.label}</span>
                  {sug.status==='done' && <span style={{fontSize:7,fontWeight:700,padding:'1px 5px',borderRadius:3,background:'#22C55E18',color:'#22C55E'}}>Fait</span>}
                  {(sug.status==='pending'||sug.status==='review') && <span style={{fontSize:7,fontWeight:700,padding:'1px 5px',borderRadius:3,background:'#F59E0B18',color:'#F59E0B'}}>À traiter</span>}
                  {sug._fusionCount>1 && <span style={{fontSize:7,fontWeight:700,padding:'1px 4px',borderRadius:3,background:sug.color+'18',color:sug.color}}>×{sug._fusionCount}</span>}
                </div>
                <div style={{fontSize:8,color:T.text3,fontStyle:'italic',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>"{sug.phrase}"</div>
                {sug.entities?.date && <div style={{fontSize:8,fontWeight:600,color:sug.color,marginTop:1}}><I n="calendar" s={8}/> {new Date(sug.entities.date+'T12:00').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})}{sug.entities?.time?' à '+sug.entities.time:''}</div>}
                {sug.entities?.besoin && <div style={{fontSize:8,fontWeight:600,color:'#8B5CF6',marginTop:1}}><I n="target" s={8}/> {sug.entities.besoin}</div>}
                {sug.entities?.amount && <div style={{fontSize:8,fontWeight:700,color:'#F97316',marginTop:1}}><I n="receipt" s={8}/> {Number(sug.entities.amount).toLocaleString('fr-FR')} €</div>}
                {sug.entities?.decideur && <div style={{fontSize:8,fontWeight:600,color:'#7C3AED',marginTop:1}}><I n="user-check" s={8}/> {sug.entities.decideur}</div>}
                {(sug.status==='pending'||sug.status==='review') && (
                  <div style={{display:'flex',gap:3,marginTop:4}}>
                    {sug.type==='rdv' && <div onClick={()=>{const e=sug.entities||{};setPhoneScheduleForm({contactId:e.contactId||ct?.id,contactName:e.contactName||ct?.name,number:e.contactPhone||ct?.phone||'',date:e.date||new Date(Date.now()+86400000).toISOString().split('T')[0],time:e.time||'10:00',duration:30,notes:'RDV: '+sug.phrase,calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}>Créer RDV</div>}
                    {sug.type==='rappel' && <div onClick={()=>{const e=sug.entities||{};setPhoneScheduleForm({contactId:e.contactId||ct?.id,contactName:e.contactName||ct?.name,number:e.contactPhone||ct?.phone||'',date:e.date||new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:15,notes:'Rappel: '+sug.phrase,calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}>Planifier</div>}
                    {(sug.type==='note'||sug.type==='besoin'||sug.type==='objection'||sug.type==='urgence') && <div onClick={()=>{const e=sug.entities||{};const cid=e.contactId||ct?.id;if(cid){handleCollabUpdateContact(cid,{notes:((contacts||[]).find(c=>c.id===cid)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] '+sug.phrase});showNotif(sug.label+' noté','success');}else{showNotif('Aucun contact','danger');}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}>Noter</div>}
                    {sug.type==='decideur' && <div onClick={()=>{const e=sug.entities||{};const d=prompt('Décideur :',e.decideur||'');if(!d)return;const cid=e.contactId||ct?.id;if(cid){handleCollabUpdateContact(cid,{notes:((contacts||[]).find(c=>c.id===cid)?.notes||'')+'\n['+new Date().toLocaleDateString('fr-FR')+'] 👤 Décideur: '+d});showNotif('Décideur noté','success');}setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}>Décideur</div>}
                    {sug.type==='accord' && <div onClick={()=>{const cid=(sug.entities||{}).contactId||ct?.id;if(cid)handlePipelineStageChange(cid,'client_valide','Accord verbal');setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}>Client Validé</div>}
                    {sug.type==='relance_auto' && <div onClick={()=>{const e=sug.entities||{};const date=e.date||new Date(Date.now()+7*86400000).toISOString().split('T')[0];const cid=e.contactId||ct?.id;if(cid)handleCollabUpdateContact(cid,{next_action_type:'relance',next_action_label:'Relancer',next_action_done:0,next_action_date:date,nrp_next_relance:date});setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif('Relance programmée','success');}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}>Relance</div>}
                    {!['rdv','rappel','note','besoin','objection','urgence','decideur','accord','relance_auto'].includes(sug.type) && <div onClick={()=>{setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'done'}:s));showNotif(sug.label+' traité','success');}} style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:8,fontWeight:700,cursor:'pointer',background:sug.color,color:'#fff',textAlign:'center'}}>OK</div>}
                    <div onClick={()=>setPhoneLiveSuggestions(prev=>prev.map(s=>s.id===sug.id?{...s,status:'dismissed'}:s))} style={{padding:'3px 6px',borderRadius:5,fontSize:8,cursor:'pointer',color:T.text3,background:T.bg,border:'1px solid '+T.border}}>✕</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </>)}
</div>;
})()}

      </div>

      {/* ── AI Summary footer — click to expand ── */}
      {analysis && (typeof phoneRightTab!=='undefined'?phoneRightTab:null) !== 'ia' && (
<div onClick={()=>setPhoneRightTab('ia')} style={{padding:'6px 10px',borderTop:'1px solid '+T.border,flexShrink:0,cursor:'pointer',transition:'all .12s'}} onMouseEnter={e=>e.currentTarget.style.background=T.bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
<div style={{display:'flex',alignItems:'center',gap:4}}>
  <div style={{width:14,height:14,borderRadius:4,background:'linear-gradient(135deg,#7C3AED20,#2563EB20)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="cpu" s={8} style={{color:'#7C3AED'}}/></div>
  <span style={{fontSize:9,fontWeight:700,color:'#7C3AED'}}>IA Copilot</span>
  <span style={{fontSize:8,color:analysis.sentimentScore>60?'#22C55E':analysis.sentimentScore>30?'#F59E0B':'#EF4444',fontWeight:700,marginLeft:'auto'}}>{analysis.sentimentScore}%</span>
  <I n="chevron-up" s={10} style={{color:T.text3}}/>
</div>
</div>
      )}
    </div>
    );
  })() :
  (
  <>
  {/* ── Pas de contact selectionne — placeholder ── */}
  {!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) ? (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,textAlign:'center'}}>
      <div style={{width:56,height:56,borderRadius:16,background:T.accent+'12',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:16}}>
<I n="user" s={26} style={{color:T.accent}}/>
      </div>
      <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:6}}>Fiche contact</div>
      <div style={{fontSize:12,color:T.text3,lineHeight:1.5,maxWidth:220}}>
Selectionnez un contact dans le pipeline ou les recents pour voir sa fiche.
      </div>
    </div>
  ) : (
    <>
      {/* ═══════════════════════════════════════════════════════════
MODE 1 — DURING ACTIVE CALL (LIVE)
 ═══════════════════════════════════════════════════════════ */}
      {(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) ? (
<div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
{/* LIVE Header with call timer */}
<div style={{padding:'10px 14px',background:'linear-gradient(135deg,#7C3AED,#2563EB)',flexShrink:0}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <div style={{width:32,height:32,borderRadius:8,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <I n="cpu" s={16} style={{color:'#fff'}}/>
      </div>
      <div>
        <div style={{fontSize:13,fontWeight:800,color:'#fff',display:'flex',alignItems:'center',gap:5}}>
          Copilot LIVE
          <span style={{width:8,height:8,borderRadius:4,background:'#22C55E',boxShadow:'0 0 10px #22C55E80',animation:'pulse 2s infinite'}}/>
        </div>
        <div style={{fontSize:10,color:'#ffffffaa'}}>{collab.ai_copilot_role||'Coach IA'}</div>
      </div>
    </div>
    <div style={{textAlign:'right'}}>
      <div style={{fontSize:16,fontWeight:800,color:'#fff',fontFamily:'monospace'}}>{(()=>{const s=Math.floor((Date.now()-((typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).startTime||Date.now()))/1000);return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;})()}</div>
    </div>
  </div>
  {/* Live step tracker */}
  <div style={{display:'flex',gap:2,marginTop:4}}>
    {['Accroche','Découverte','Présentation','Objections','Closing'].map((step,i)=>(
      <div key={i} onClick={()=>(typeof setPhoneCopilotLiveStep==='function'?setPhoneCopilotLiveStep:function(){})(i)} style={{flex:1,padding:'3px 0',borderRadius:4,textAlign:'center',fontSize:8,fontWeight:700,cursor:'pointer',background:phoneCopilotLiveStep===i?'rgba(255,255,255,0.3)':'rgba(255,255,255,0.08)',color:phoneCopilotLiveStep>=i?'#fff':'#ffffff55',transition:'all .15s'}}>{step}</div>
    ))}
  </div>
</div>

{/* Sentiment + Live KPIs bar */}
<div style={{display:'flex',gap:0,borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
  <div style={{flex:1,padding:'8px 0',textAlign:'center',background:(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='positive'?'#22C55E08':(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='negative'?'#EF444408':'#F59E0B08'}}>
    <div style={{fontSize:20}}>{phoneLiveSentiment==='positive'?'😊':(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='negative'?'😟':'😐'}</div>
    <div style={{fontSize:8,fontWeight:700,color:(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='positive'?'#22C55E':(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='negative'?'#EF4444':'#F59E0B',textTransform:'uppercase'}}>{phoneLiveSentiment==='positive'?'Positif':(typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null)==='negative'?'Négatif':'Neutre'}</div>
  </div>
  <div style={{flex:1,padding:'8px 0',textAlign:'center',borderLeft:`1px solid ${T.border}`}}>
    <div style={{fontSize:14,fontWeight:800,color:'#7C3AED'}}>{Object.values((typeof phoneCopilotReactions!=='undefined'?phoneCopilotReactions:null)).filter(r=>r===true).length}</div>
    <div style={{fontSize:8,fontWeight:700,color:T.text3}}>Acceptés</div>
  </div>
  <div style={{flex:1,padding:'8px 0',textAlign:'center',borderLeft:`1px solid ${T.border}`}}>
    <div style={{fontSize:14,fontWeight:800,color:T.text2}}>{(typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:{}).length}</div>
    <div style={{fontSize:8,fontWeight:700,color:T.text3}}>Messages</div>
  </div>
</div>

{/* LIVE Scrollable content */}
<div style={{flex:1,overflow:'auto',padding:10,display:'flex',flexDirection:'column',gap:10}}>

  {/* Live Transcription */}
  <div style={{borderRadius:10,border:`1px solid ${T.border}`,overflow:'hidden'}}>
    <div style={{padding:'6px 10px',background:T.bg,display:'flex',alignItems:'center',gap:5,borderBottom:`1px solid ${T.border}`}}>
      <span style={{width:6,height:6,borderRadius:3,background:'#EF4444',animation:'pulse 1.5s infinite'}}/>
      <span style={{fontSize:10,fontWeight:700,color:T.text2}}>Transcription live</span>
    </div>
    <div style={{maxHeight:180,overflow:'auto',padding:8,display:'flex',flexDirection:'column',gap:4}} ref={el=>{if(el)el.scrollTop=el.scrollHeight}}>
      {(typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:{}).length===0 && <div style={{textAlign:'center',padding:16,color:T.text3,fontSize:10}}>En attente de la conversation...</div>}
      {(typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:{}).map((t,i)=>(
        <div key={i} style={{display:'flex',flexDirection:'column',alignItems:t.speaker==='me'?'flex-end':'flex-start'}}>
          <div style={{maxWidth:'85%',padding:'6px 10px',borderRadius:t.speaker==='me'?'10px 10px 3px 10px':'10px 10px 10px 3px',background:t.speaker==='me'?'linear-gradient(135deg,#7C3AED,#2563EB)':T.bg,color:t.speaker==='me'?'#fff':T.text,fontSize:11,lineHeight:1.4}}>
            {t.text}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:3,marginTop:1,padding:'0 3px'}}>
            <span style={{fontSize:8,fontWeight:600,color:t.speaker==='me'?'#7C3AED':T.text3}}>{t.speaker==='me'?'Vous':'Client'}</span>
            {t.timestamp && <span style={{fontSize:8,color:T.text3}}>{new Date(t.timestamp).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>}
          </div>
        </div>
      ))}
    </div>
  </div>

  {/* Coaching interactif supprimé — remplacé par coaching commercial dynamique + suggestions live */}

  {/* Checklist — Points to cover */}
  {phoneRecommendedActions && (typeof phoneRecommendedActions!=='undefined'?phoneRecommendedActions:{}).length > 0 && (
    <div style={{borderRadius:10,overflow:'hidden',border:'1px solid #2563EB25'}}>
      <div style={{padding:'6px 10px',background:'#2563EB08',display:'flex',alignItems:'center',gap:5,borderBottom:'1px solid #2563EB15'}}>
        <I n="check-square" s={12} style={{color:'#2563EB'}}/>
        <span style={{fontSize:10,fontWeight:700,color:'#2563EB'}}>Points à couvrir</span>
        <span style={{fontSize:9,color:T.text3,marginLeft:'auto'}}>{Object.values((typeof phoneCopilotChecklist!=='undefined'?phoneCopilotChecklist:null)).filter(Boolean).length}/{(typeof phoneRecommendedActions!=='undefined'?phoneRecommendedActions:{}).length}</span>
      </div>
      <div style={{padding:6,display:'flex',flexDirection:'column',gap:2}}>
        {(typeof phoneRecommendedActions!=='undefined'?phoneRecommendedActions:{}).map((action,i)=>{
          const key = typeof action==='string'?action:action.id||i;
          const label = typeof action==='string'?action:action.label||action.text;
          const checked = !!(typeof phoneCopilotChecklist!=='undefined'?phoneCopilotChecklist:null)[key];
          return(
          <div key={i} onClick={()=>setPhoneCopilotChecklist(p=>({...p,[key]:!p[key]}))} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',borderRadius:6,background:checked?'#22C55E06':T.bg,border:`1px solid ${checked?'#22C55E20':'transparent'}`,cursor:'pointer',transition:'all .15s'}}>
            <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${checked?'#22C55E':T.border}`,background:checked?'#22C55E':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {checked && <I n="check" s={10} style={{color:'#fff'}}/>}
            </div>
            <span style={{fontSize:10,color:checked?T.text3:T.text,fontWeight:500,textDecoration:checked?'line-through':'none'}}>{label}</span>
          </div>);
        })}
      </div>
    </div>
  )}

  {/* Context + Script mini */}
  {(typeof phoneCallContext!=='undefined'?phoneCallContext:null) && (()=>{
    const ctx = (typeof phoneCallContext!=='undefined'?phoneCallContext:null);
    return(
    <div style={{borderRadius:10,overflow:'hidden',border:`1px solid ${T.border}`}}>
      <div style={{padding:'6px 10px',background:T.bg,display:'flex',alignItems:'center',gap:5,borderBottom:`1px solid ${T.border}`}}>
        <I n="user" s={12} style={{color:T.text2}}/>
        <span style={{fontSize:10,fontWeight:700,color:T.text2}}>Contexte</span>
      </div>
      <div style={{padding:8,display:'flex',flexDirection:'column',gap:4}}>
        {ctx.contactName && <div style={{display:'flex',alignItems:'center',gap:6}}>
          <Avatar name={ctx.contactName} color="#7C3AED" s={24}/>
          <div><div style={{fontSize:11,fontWeight:700}}>{ctx.contactName}</div>{ctx.company&&<div style={{fontSize:9,color:T.text3}}>{ctx.company}</div>}</div>
        </div>}
        {ctx.lastCallDate && <div style={{fontSize:9,color:T.text3,display:'flex',alignItems:'center',gap:4}}><I n="clock" s={9}/> Dernier appel: {new Date(ctx.lastCallDate).toLocaleDateString('fr-FR')} {ctx.totalCalls&&<span style={{marginLeft:'auto'}}>({ctx.totalCalls} appels)</span>}</div>}
        {ctx.notes && <div style={{fontSize:9,color:T.text3,padding:'4px 6px',borderRadius:4,background:T.bg,border:`1px solid ${T.border}`,lineHeight:1.4}}>{ctx.notes}</div>}
      </div>
    </div>);
  })()}

  {/* Script steps mini guide */}
  {collab.ai_copilot_role && (
    <div style={{borderRadius:10,overflow:'hidden',border:'1px solid #F59E0B20'}}>
      <div style={{padding:'6px 10px',background:'#F59E0B06',display:'flex',alignItems:'center',gap:5,borderBottom:'1px solid #F59E0B15'}}>
        <I n="file-text" s={12} style={{color:'#D97706'}}/>
        <span style={{fontSize:10,fontWeight:700,color:'#D97706'}}>Script</span>
      </div>
      <div style={{padding:6,display:'flex',flexDirection:'column',gap:2}}>
        {['Accueil & mise en confiance','Découverte des besoins','Présentation de la solution','Traitement des objections','Closing & étape suivante'].map((step,i)=>(
          <div key={i} onClick={()=>(typeof setPhoneCopilotLiveStep==='function'?setPhoneCopilotLiveStep:function(){})(i)} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 6px',borderRadius:5,cursor:'pointer',background:phoneCopilotLiveStep===i?'#F59E0B10':'transparent',border:phoneCopilotLiveStep===i?'1px solid #F59E0B20':'1px solid transparent',transition:'all .15s'}}>
            <span style={{width:16,height:16,borderRadius:4,background:phoneCopilotLiveStep>=i?'#F59E0B':'#F59E0B20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:(typeof phoneCopilotLiveStep!=='undefined'?phoneCopilotLiveStep:null)>=i?'#fff':'#D97706',flexShrink:0}}>{(typeof phoneCopilotLiveStep!=='undefined'?phoneCopilotLiveStep:null)>i?'✓':i+1}</span>
            <span style={{fontSize:10,fontWeight:(typeof phoneCopilotLiveStep!=='undefined'?phoneCopilotLiveStep:null)===i?600:400,color:(typeof phoneCopilotLiveStep!=='undefined'?phoneCopilotLiveStep:null)===i?'#D97706':T.text3}}>{step}</span>
          </div>
        ))}
      </div>
    </div>
  )}

</div>{/* end LIVE scrollable */}
</div>

      ) : (
/* ═══════════════════════════════════════════════════════════
 MODE 2 — IDLE (no active call)
═══════════════════════════════════════════════════════════ */
<div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>

{/* IDLE Header */}
<div style={{padding:'14px 18px',background:T.surface,borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
    <div style={{display:'flex',alignItems:'center',gap:10}}>
      <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 3px 10px rgba(124,58,237,0.25)'}}>
        <I n="cpu" s={18} style={{color:'#fff'}}/>
      </div>
      <div>
        <div style={{fontSize:14,fontWeight:800,background:'linear-gradient(135deg,#7C3AED,#2563EB)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>AI Sales Copilot</div>
        <div style={{fontSize:10,color:T.text3}}>Analyse et coaching commercial</div>
      </div>
    </div>
    <div style={{display:'flex',alignItems:'center',gap:4}}>
      <span style={{width:7,height:7,borderRadius:4,background:collab.ai_copilot_enabled?'#22C55E':'#F59E0B'}}/>
      <span style={{fontSize:10,color:T.text3,fontWeight:500}}>{collab.ai_copilot_enabled?'Actif':'Limité'}</span>
    </div>
  </div>
</div>

{/* Loading / Data trigger */}
{!(typeof phoneCopilotTabLoaded!=='undefined'?phoneCopilotTabLoaded:null) ? (()=>{
  /* Trigger data load without useEffect */
  const cf = collab.role !== 'admin' ? `&collaboratorId=${collab.id}` : '';
  if((typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).loading) {
    Promise.all([
      api(`/api/ai-copilot/stats?companyId=${company.id}${cf}`),
      api(`/api/ai-copilot/analyses?companyId=${company.id}${cf}&limit=20`),
      api(`/api/ai-copilot/coaching/${collab.id}`),
      api(`/api/ai-copilot/objections?companyId=${company.id}`)
    ]).then(([s,a,c,o]) => {
      setPhoneCopilotTabData(p=>({...p, stats:s, analyses:a||[], coaching:c, objections:o, loading:false}));
      setPhoneCopilotTabLoaded(true);
    }).catch(()=>setPhoneCopilotTabData(p=>({...p,loading:false})));
  }
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:32}}>
      <div style={{width:20,height:20,border:'3px solid #7C3AED',borderTopColor:'transparent',borderRadius:'50%',animation:'spin .7s linear infinite'}}/>
      <div style={{fontSize:12,fontWeight:600,color:'#7C3AED'}}>Chargement Copilot IA...</div>
      <div style={{fontSize:10,color:T.text3}}>Analyse de vos données commerciales</div>
    </div>
  );
})() : (
  /* Loaded — IDLE content */
  <div style={{flex:1,overflow:'auto',padding:14,display:'flex',flexDirection:'column',gap:14}}>

    {/* 1. Quick Stats — 4 mini KPIs */}
    {(typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).stats && (()=>{
      const st = (typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).stats;
      return (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {[
            {label:'Taux conversion',value:`${st.avgConversion||0}%`,icon:'trending-up',color:'#7C3AED',bg:'#F5F3FF'},
            {label:'Score qualité',value:`${st.avgQuality||0}%`,icon:'award',color:'#2563EB',bg:'#EFF6FF'},
            {label:'Appels analysés',value:st.totalAnalyzed||0,icon:'bar-chart-2',color:'#22C55E',bg:'#F0FDF4'},
            {label:'Objections',value:st.totalObjections||0,icon:'alert-triangle',color:'#F59E0B',bg:'#FFFBEB'},
          ].map((kpi,i)=>(
            <div key={i} style={{padding:12,borderRadius:10,background:T.card,border:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:32,height:32,borderRadius:9,background:kpi.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <I n={kpi.icon} s={15} style={{color:kpi.color}}/>
              </div>
              <div>
                <div style={{fontSize:18,fontWeight:800,color:kpi.color,lineHeight:1}}>{kpi.value}</div>
                <div style={{fontSize:9,color:T.text3,fontWeight:600,marginTop:1}}>{kpi.label}</div>
              </div>
            </div>
          ))}
        </div>
      );
    })()}

    {/* 2. Last Analysis Summary */}
    {(()=>{
      const analyses = (typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).analyses || [];
      const lastAnalyses = Object.values((typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null) || {}).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      const all = [...analyses, ...lastAnalyses].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      const recent = all.length > 0 ? all[0] : null;
      if(!recent) return null;
      const sentColor = (recent.sentimentScore||recent.sentiment_score||50) >= 60 ? '#22C55E' : (recent.sentimentScore||recent.sentiment_score||50) >= 40 ? '#F59E0B' : '#EF4444';
      const qualColor = (recent.qualityScore||recent.quality_score||50) >= 70 ? '#22C55E' : (recent.qualityScore||recent.quality_score||50) >= 40 ? '#F59E0B' : '#EF4444';
      return (
        <div style={{borderRadius:12,overflow:'hidden',border:`1px solid ${T.border}`,cursor:'pointer',transition:'all .15s'}} onClick={()=>setPhoneCopilotTabData(p=>({...p,detailModal:recent.id}))}>
          <div style={{padding:'8px 12px',background:'linear-gradient(135deg,#7C3AED08,#2563EB08)',display:'flex',alignItems:'center',gap:6,borderBottom:`1px solid ${T.border}`}}>
            <I n="activity" s={13} style={{color:'#7C3AED'}}/>
            <span style={{fontSize:11,fontWeight:700,color:'#7C3AED'}}>Dernière analyse</span>
            <span style={{fontSize:9,color:T.text3,marginLeft:'auto'}}>{recent.createdAt ? new Date(recent.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}) : ''}</span>
          </div>
          <div style={{padding:12}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <Avatar name={recent.contactName||recent.contact_name||'?'} color="#7C3AED" size={28}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{recent.contactName||recent.contact_name||'Contact inconnu'}</div>
                {recent.duration && <div style={{fontSize:10,color:T.text3}}>{fmtDur(recent.duration)}</div>}
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:8}}>
              <div style={{flex:1,textAlign:'center',padding:'6px 0',borderRadius:6,background:sentColor+'10'}}>
                <div style={{fontSize:8,fontWeight:600,color:T.text3,textTransform:'uppercase'}}>Sentiment</div>
                <div style={{fontSize:14,fontWeight:800,color:sentColor}}>{recent.sentimentScore||recent.sentiment_score||'—'}%</div>
              </div>
              <div style={{flex:1,textAlign:'center',padding:'6px 0',borderRadius:6,background:qualColor+'10'}}>
                <div style={{fontSize:8,fontWeight:600,color:T.text3,textTransform:'uppercase'}}>Qualité</div>
                <div style={{fontSize:14,fontWeight:800,color:qualColor}}>{recent.qualityScore||recent.quality_score||'—'}%</div>
              </div>
            </div>
            {(recent.summary || recent.aiSummary) && (
              <div style={{fontSize:10,color:T.text3,lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                {recent.summary || recent.aiSummary}
              </div>
            )}
            <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',marginTop:6,gap:4}}>
              <span style={{fontSize:10,color:'#7C3AED',fontWeight:600}}>Voir détails</span>
              <I n="chevR" s={12} style={{color:'#7C3AED'}}/>
            </div>
          </div>
        </div>
      );
    })()}

    {/* 3. Coaching Tips */}
    {(typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching && ((typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching.strengths || (typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching.weaknesses || (typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching.tips) && (
      <div style={{borderRadius:12,overflow:'hidden',border:'1px solid #7C3AED20'}}>
        <div style={{padding:'8px 12px',background:'linear-gradient(135deg,#7C3AED10,#6D28D910)',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid #7C3AED15'}}>
          <I n="target" s={13} style={{color:'#7C3AED'}}/>
          <span style={{fontSize:11,fontWeight:700,color:'#7C3AED'}}>Coaching IA</span>
        </div>
        <div style={{padding:10,display:'flex',flexDirection:'column',gap:8}}>
          {/* Strengths (green checks) */}
          {(typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching.strengths && (typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching.strengths.length > 0 && (
            <div>
              <div style={{fontSize:9,fontWeight:700,color:'#22C55E',textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}}>Points forts</div>
              {(typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching.strengths.slice(0,3).map((s,i)=>(
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:6,padding:'3px 0'}}>
                  <div style={{width:16,height:16,borderRadius:4,background:'#22C55E15',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
                    <I n="check" s={10} style={{color:'#22C55E'}}/>
                  </div>
                  <span style={{fontSize:11,color:T.text2,lineHeight:1.4}}>{typeof s === 'string' ? s : s.text || s.label}</span>
                </div>
              ))}
            </div>
          )}
          {/* Weaknesses (orange warnings) */}
          {(typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching.weaknesses && (typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching.weaknesses.length > 0 && (
            <div>
              <div style={{fontSize:9,fontWeight:700,color:'#F59E0B',textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}}>Points à améliorer</div>
              {(typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching.weaknesses.slice(0,3).map((w,i)=>(
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:6,padding:'3px 0'}}>
                  <div style={{width:16,height:16,borderRadius:4,background:'#F59E0B15',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
                    <I n="alert-triangle" s={10} style={{color:'#F59E0B'}}/>
                  </div>
                  <span style={{fontSize:11,color:T.text2,lineHeight:1.4}}>{typeof w === 'string' ? w : w.text || w.label}</span>
                </div>
              ))}
            </div>
          )}
          {/* Tips (blue lightbulbs) */}
          {(typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching.tips && (typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching.tips.length > 0 && (
            <div>
              <div style={{fontSize:9,fontWeight:700,color:'#2563EB',textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}}>Conseils</div>
              {(typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).coaching.tips.slice(0,3).map((tip,i)=>(
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:6,padding:'3px 0'}}>
                  <div style={{width:16,height:16,borderRadius:4,background:'#2563EB15',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
                    <I n="zap" s={10} style={{color:'#2563EB'}}/>
                  </div>
                  <span style={{fontSize:11,color:T.text2,lineHeight:1.4}}>{typeof tip === 'string' ? tip : tip.text || tip.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )}

    {/* 4. Top Objections */}
    {(typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).objections && (()=>{
      const objArr = Array.isArray((typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).objections) ? (typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).objections : ((typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).objections.topObjections || (typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:{}).objections.data || []);
      if(objArr.length === 0) return null;
      return (
        <div style={{borderRadius:12,overflow:'hidden',border:'1px solid #EF444420'}}>
          <div style={{padding:'8px 12px',background:'#EF444408',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid #EF444415'}}>
            <I n="shield" s={13} style={{color:'#EF4444'}}/>
            <span style={{fontSize:11,fontWeight:700,color:'#EF4444'}}>Objections fréquentes</span>
            <span style={{fontSize:9,color:T.text3,marginLeft:'auto'}}>{objArr.length} détectée{objArr.length>1?'s':''}</span>
          </div>
          <div style={{padding:8,display:'flex',flexDirection:'column',gap:6}}>
            {objArr.slice(0,3).map((obj,i)=>{
              const text = typeof obj === 'string' ? obj : (obj.objection || obj.text || obj.label);
              const response = typeof obj === 'object' ? (obj.bestResponse || obj.response || obj.answer) : null;
              const freq = typeof obj === 'object' ? obj.frequency || obj.count : null;
              return (
                <div key={i} style={{padding:'8px 10px',borderRadius:8,background:T.bg,border:`1px solid ${T.border}`}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:6,marginBottom:response?6:0}}>
                    <span style={{fontSize:11,flexShrink:0,color:'#EF4444'}}>❝</span>
                    <div style={{fontSize:11,color:T.text,fontWeight:600,lineHeight:1.4,flex:1}}>{text}</div>
                    {freq && <span style={{fontSize:8,padding:'1px 5px',borderRadius:3,background:'#EF444412',color:'#EF4444',fontWeight:700,flexShrink:0,whiteSpace:'nowrap'}}>{typeof freq === 'number' ? `${freq}x` : freq}</span>}
                  </div>
                  {response && (
                    <div onClick={()=>{navigator.clipboard?.writeText(response);showNotif('Réponse copiée !');}} style={{fontSize:10,color:'#22C55E',fontWeight:500,paddingLeft:10,borderLeft:'2px solid #22C55E40',cursor:'pointer',lineHeight:1.5,transition:'color .15s'}} onMouseEnter={e=>e.currentTarget.style.color='#16A34A'} onMouseLeave={e=>e.currentTarget.style.color='#22C55E'}>
                      → {response}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    })()}

    {/* 5. Behavior / Reactions Summary */}
    {(()=>{
      if(!(typeof phoneCopilotReactionStats!=='undefined'?phoneCopilotReactionStats:null)){
        api(`/api/ai-copilot/behavior-audit/${collab.id}`).then(data=>{if(data&&!data.error)setPhoneCopilotReactionStats(data);}).catch(()=>{});
        return null;
      }
      const rs=(typeof phoneCopilotReactionStats!=='undefined'?phoneCopilotReactionStats:null);
      if(!rs.total) return null;
      return(
      <div style={{borderRadius:12,overflow:'hidden',border:'1px solid #0EA5E920'}}>
        <div style={{padding:'8px 12px',background:'#0EA5E908',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid #0EA5E915'}}>
          <I n="activity" s={13} style={{color:'#0EA5E9'}}/>
          <span style={{fontSize:11,fontWeight:700,color:'#0EA5E9'}}>Comportement coaching</span>
        </div>
        <div style={{padding:10,display:'flex',flexDirection:'column',gap:8}}>
          {/* Accept rate bar */}
          <div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
              <span style={{fontSize:10,fontWeight:600,color:T.text2}}>Taux d'acceptation</span>
              <span style={{fontSize:12,fontWeight:800,color:rs.acceptRate>=60?'#22C55E':rs.acceptRate>=30?'#F59E0B':'#EF4444'}}>{rs.acceptRate}%</span>
            </div>
            <div style={{height:6,borderRadius:3,background:T.border,overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:3,background:rs.acceptRate>=60?'#22C55E':rs.acceptRate>=30?'#F59E0B':'#EF4444',width:rs.acceptRate+'%',transition:'width .3s'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:T.text3,marginTop:2}}>
              <span>✅ {rs.accepted} acceptés</span>
              <span>❌ {rs.rejected} ignorés</span>
            </div>
          </div>
          {/* Category breakdown */}
          {rs.categories&&rs.categories.length>0&&(
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <div style={{fontSize:9,fontWeight:700,color:T.text3,textTransform:'uppercase',letterSpacing:0.5}}>Par catégorie</div>
              {rs.categories.slice(0,4).map((c,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:10}}>
                  <span style={{fontWeight:600,color:T.text2,flex:1,textTransform:'capitalize'}}>{c.cat||'Autre'}</span>
                  <span style={{fontWeight:700,color:c.acceptRate>=60?'#22C55E':c.acceptRate>=30?'#F59E0B':'#EF4444'}}>{c.acceptRate}%</span>
                  <span style={{fontSize:8,color:T.text3}}>({c.total})</span>
                </div>
              ))}
            </div>
          )}
          {/* Trend */}
          {rs.trend&&(rs.trend.thisWeek.total>0||rs.trend.lastWeek.total>0)&&(
            <div style={{fontSize:9,color:T.text3,display:'flex',alignItems:'center',gap:4}}>
              <I n="trending-up" s={10} style={{color:'#0EA5E9'}}/>
              <span>Cette semaine: {rs.trend.thisWeek.total} réactions ({rs.trend.thisWeek.total>0?Math.round((rs.trend.thisWeek.accepted||0)/rs.trend.thisWeek.total*100):0}% accept.)</span>
            </div>
          )}
        </div>
      </div>);
    })()}

    {/* 6. Generate Script Button */}
    <div style={{borderRadius:12,overflow:'hidden',border:'1px dashed #7C3AED30',background:'linear-gradient(135deg,#7C3AED04,#2563EB04)'}}>
      <div onClick={()=>setPhoneCopilotTabData(p=>({...p,scriptModal:true}))} style={{padding:16,display:'flex',alignItems:'center',gap:12,cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background='#7C3AED08'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
        <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 3px 10px rgba(124,58,237,0.2)'}}>
          <I n="zap" s={18} style={{color:'#fff'}}/>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text}}>Générer un script IA</div>
          <div style={{fontSize:10,color:T.text3}}>Script de vente personnalisé par l'IA</div>
        </div>
        <I n="chevR" s={16} style={{color:'#7C3AED'}}/>
      </div>
    </div>

    {/* Footer branding */}
    <div style={{textAlign:'center',padding:'8px 0',opacity:0.5}}>
      <div style={{fontSize:9,color:T.text3}}>Propulsé par <span style={{fontWeight:700,background:'linear-gradient(135deg,#7C3AED,#2563EB)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>AI Sales Copilot</span></div>
    </div>

  </div>
)}
</div>
      )}
    </>
  )}

  </>
  )}

  </>
  )}

</div>
{/* ═══ END RIGHT COLUMN ═══ */}

{/* ═══════════════════════════════════════════════════════════════════
    PHONE INLINE PANELS — render inside 3-column container as absolute overlays
    covering the center column area (left:281px, right:340px)
    ═══════════════════════════════════════════════════════════════════ */}
{/* ═══════════════════════════════════════════════════════════════════
    PHONE MODALS — PART A
    1. History Modal ((typeof phoneSubTab!=='undefined'?phoneSubTab:null) === 'history')
    2. Contacts Modal ((typeof phoneSubTab!=='undefined'?phoneSubTab:null) === 'contacts')
    3. SMS Modal ((typeof phoneSubTab!=='undefined'?phoneSubTab:null) === 'sms')
    4. Recordings Modal ((typeof phoneSubTab!=='undefined'?phoneSubTab:null) === 'recordings')
    ═══════════════════════════════════════════════════════════════════ */}

{/* ─── 1. HISTORY MODAL ─── */}
{phoneSubTab === 'history' && (
  <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 24px',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
<div style={{display:'flex',alignItems:'center',gap:10}}>
<div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#2563EB,#1D4ED8)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="list" s={18} style={{color:'#fff'}}/></div>
<div><div style={{fontSize:16,fontWeight:800}}>Historique des appels</div><div style={{fontSize:12,color:T.text3}}>Tous vos appels et interactions</div></div>
</div>
<div onClick={()=>setPhoneSubTab('pipeline')} style={{width:32,height:32,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:`1px solid ${T.border}`}}><I n="x" s={16}/></div>
      </div>
      <div style={{flex:1,overflow:'auto',padding:24}}>
{(()=>{
const logs = (typeof voipCallLogs!=='undefined'?voipCallLogs:null) || [];
const today = new Date().toISOString().split('T')[0];
const yesterday = new Date(Date.now()-86400000).toISOString().split('T')[0];
const weekAgo = new Date(Date.now()-7*86400000).toISOString().split('T')[0];
const missedCount = logs.filter(c=>c.status==='missed'||c.status==='no-answer').length;
// Counters reflect ALL logs (not just today) so they match the filterable list
const totalIn = logs.filter(l=>l.direction==='inbound').length;
const totalOut = logs.filter(l=>l.direction==='outbound').length;
const totalMissed = logs.filter(l=>l.status==='missed'||l.status==='no-answer').length;
const totalDuration = logs.reduce((a,l)=>a+(l.duration||0),0);
const avgDuration = logs.length>0?Math.round(totalDuration/logs.length):0;
const totalQualified = logs.filter(l=>(typeof phoneDispositions!=='undefined'?phoneDispositions:null)[l.id]).length;

let filtered = logs.filter(cl => {
  if ((typeof phoneHistoryFilter!=='undefined'?phoneHistoryFilter:null) === 'inbound' && cl.direction !== 'inbound') return false;
  if ((typeof phoneHistoryFilter!=='undefined'?phoneHistoryFilter:null) === 'outbound' && cl.direction !== 'outbound') return false;
  if ((typeof phoneHistoryFilter!=='undefined'?phoneHistoryFilter:null) === 'missed' && cl.status !== 'missed' && cl.status !== 'no-answer') return false;
  if ((typeof phoneHistoryFilter!=='undefined'?phoneHistoryFilter:null) === 'qualified' && !(typeof phoneDispositions!=='undefined'?phoneDispositions:null)[cl.id]) return false;
  if ((typeof phoneHistorySearch!=='undefined'?phoneHistorySearch:null)) {
    let ct = cl.contactId ? contacts.find(c => c.id === cl.contactId) : null;
    if(!ct){const ph=((cl.direction==='outbound'?cl.toNumber:cl.fromNumber)||'').replace(/[^\d]/g,'').slice(-9);if(ph.length>=9)ct=contacts.find(c=>{const cp=(c.phone||c.mobile||'').replace(/[^\d]/g,'').slice(-9);return cp&&cp===ph;});}
    const q = (typeof phoneHistorySearch!=='undefined'?phoneHistorySearch:{}).toLowerCase();
    const name = (ct?.name || '').toLowerCase();
    const num = (cl.direction === 'outbound' ? cl.toNumber : cl.fromNumber) || '';
    if (!name.includes(q) && !num.includes(q)) return false;
  }
  return true;
});

const groups = {};
filtered.forEach(cl => {
  const d = cl.createdAt?.split('T')[0] || '';
  let label = d === today ? "Aujourd'hui" : d === yesterday ? 'Hier' : d >= weekAgo ? 'Cette semaine' : 'Plus ancien';
  if (!groups[label]) groups[label] = [];
  groups[label].push(cl);
});

return (
<div>
  {/* Daily summary stats */}
  <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:16}}>
    {[
      {label:'Entrants',val:totalIn,icon:'phone-incoming',color:'#22C55E',filter:'inbound'},
      {label:'Sortants',val:totalOut,icon:'phone-outgoing',color:'#2563EB',filter:'outbound'},
      {label:'Manques',val:totalMissed,icon:'phone-missed',color:'#EF4444',filter:'missed'},
      {label:'Moy. duree',val:avgDuration+'s',icon:'clock',color:'#7C3AED',filter:null},
      {label:'Qualifies',val:totalQualified,icon:'check-circle',color:'#F59E0B',filter:'qualified'},
    ].map((s,i)=>{
      const isActive = s.filter && (typeof phoneHistoryFilter!=='undefined'?phoneHistoryFilter:null) === s.filter;
      return (
      <div key={i} onClick={()=>{if(s.filter){setPhoneHistoryFilter(prev=>prev===s.filter?'all':s.filter);}}} style={{padding:'10px 12px',borderRadius:12,background:isActive?s.color+'20':s.color+'08',border:`1px solid ${isActive?s.color+'60':s.color+'20'}`,textAlign:'center',cursor:s.filter?'pointer':'default',transition:'all .2s',transform:isActive?'scale(1.03)':'scale(1)',boxShadow:isActive?'0 2px 12px '+s.color+'25':'none'}} onMouseEnter={e=>{if(s.filter)e.currentTarget.style.transform='scale(1.05)';}} onMouseLeave={e=>{e.currentTarget.style.transform=isActive?'scale(1.03)':'scale(1)';}}>
        <I n={s.icon} s={14} style={{color:s.color,marginBottom:4}}/>
        <div style={{fontSize:18,fontWeight:800,color:s.color}}>{s.val}</div>
        <div style={{fontSize:10,color:isActive?s.color:T.text3,fontWeight:600}}>{s.label}</div>
        {isActive && <div style={{width:16,height:2,borderRadius:1,background:s.color,margin:'4px auto 0'}}/>}
      </div>);
    })}
  </div>

  {/* Missed calls alert banner */}
  {missedCount > 0 && (
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:12,background:'#EF444408',border:'1px solid #EF444420',marginBottom:16}}>
      <div style={{width:34,height:34,borderRadius:10,background:'#EF444418',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="phone-missed" s={16} style={{color:'#EF4444'}}/></div>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:700,color:'#EF4444'}}>{missedCount} appel{missedCount>1?'s':''} manque{missedCount>1?'s':''}</div>
        <div style={{fontSize:11,color:T.text3}}>Cliquez pour rappeler vos correspondants</div>
      </div>
      <Btn small onClick={()=>{setPhoneHistoryFilter('missed');showNotif('Filtre: appels manques')}} style={{fontSize:11}}><I n="filter" s={12}/> Filtrer</Btn>
    </div>
  )}

  {/* Rappels imminents (module notif_rappels) */}
  {isModuleOn('notif_rappels') && (typeof phoneScheduledCalls!=='undefined'?phoneScheduledCalls:{}).length > 0 && (()=>{
    const now = new Date();
    const upcoming = (typeof phoneScheduledCalls!=='undefined'?phoneScheduledCalls:{}).filter(s=>{ const d=new Date(s.date+'T'+s.time); return d>now && (d-now)<3600000; });
    if(upcoming.length===0) return null;
    return (
    <div style={{padding:'10px 14px',borderRadius:12,background:'#F59E0B08',border:'1px solid #F59E0B20',marginBottom:16,display:'flex',flexDirection:'column',gap:6}}>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <I n="bell" s={14} style={{color:'#F59E0B'}}/>
        <span style={{fontSize:12,fontWeight:700,color:'#F59E0B'}}>Rappels imminents</span>
        <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'#F59E0B18',color:'#F59E0B',fontWeight:600}}>Module</span>
      </div>
      {upcoming.map(sc=>{
        const ct = (contacts||[]).find(c=>c.id===sc.contactId);
        return (
        <div key={sc.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:8,background:T.surface}}>
          <I n="clock" s={12} style={{color:'#F59E0B'}}/>
          <span style={{flex:1,fontSize:11,fontWeight:600}}>{ct?.name||sc.number} a {sc.time}</span>
          <Btn small primary onClick={()=>{startPhoneCall(sc.number||ct?.phone,sc.contactId);removeScheduledCall(sc.id)}} style={{fontSize:10,padding:'3px 8px'}}><I n="phone" s={10}/> Appeler</Btn>
        </div>);
      })}
    </div>);
  })()}

  {/* Search + Filters */}
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,gap:10,flexWrap:'wrap'}}>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <span style={{fontSize:12,color:T.text3,fontWeight:600}}>{filtered.length} appel{filtered.length>1?'s':''}</span>
      <Btn small onClick={()=>{showNotif('Export CSV simule — donnees de '+filtered.length+' appels');}} style={{fontSize:10,padding:'3px 8px'}}><I n="download" s={10}/> Export</Btn>
    </div>
    <div style={{display:'flex',gap:6,alignItems:'center'}}>
      <div style={{position:'relative'}}>
        <I n="search" s={13} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:T.text3}}/>
        <input value={phoneHistorySearch} onChange={e=>(typeof setPhoneHistorySearch==='function'?setPhoneHistorySearch:function(){})(e.target.value)} placeholder="Rechercher..." style={{padding:'6px 8px 6px 28px',borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:12,width:180,fontFamily:'inherit',color:T.text,outline:'none'}}/>
      </div>
      {['all','inbound','outbound','missed'].map(f=>(
        <div key={f} onClick={()=>(typeof setPhoneHistoryFilter==='function'?setPhoneHistoryFilter:function(){})(f)} style={{padding:'5px 10px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:phoneHistoryFilter===f?700:500,color:phoneHistoryFilter===f?'#fff':T.text2,background:phoneHistoryFilter===f?(f==='missed'?'#EF4444':f==='inbound'?'#22C55E':f==='outbound'?'#2563EB':'linear-gradient(135deg,#7C3AED,#2563EB)'):'transparent',border:`1px solid ${phoneHistoryFilter===f?'transparent':T.border}`,transition:'all .2s'}}>
          {f==='all'?'Tous':f==='inbound'?'Entrants':f==='outbound'?'Sortants':'Manques'}
        </div>
      ))}
    </div>
  </div>

  {/* Grouped call list */}
  {filtered.length === 0 ? (
    <div style={{textAlign:'center',padding:'60px 20px'}}>
      <div style={{width:80,height:80,borderRadius:40,background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}><I n="phone" s={32} style={{color:T.text3}}/></div>
      <div style={{fontSize:16,fontWeight:700,color:T.text2}}>Aucun appel</div>
      <div style={{fontSize:13,color:T.text3,marginTop:4}}>Vos appels apparaitront ici</div>
    </div>
  ) : (
    ["Aujourd'hui",'Hier','Cette semaine','Plus ancien'].filter(g=>groups[g]).map(group=>(
      <div key={group} style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:T.text3,textTransform:'uppercase',letterSpacing:1,padding:'8px 0',borderBottom:`1px solid ${T.border}`,marginBottom:4}}>{group} ({groups[group].length})</div>
        {groups[group].map(cl=>{
          let ct=cl.contactId?contacts.find(c=>c.id===cl.contactId):null;
          if(!ct){const ph=((cl.direction==='outbound'?cl.toNumber:cl.fromNumber)||'').replace(/[^\d]/g,'').slice(-9);if(ph.length>=9)ct=contacts.find(c=>{const cp=(c.phone||c.mobile||'').replace(/[^\d]/g,'').slice(-9);return cp&&cp===ph;});}
          const isMissed = cl.status==='missed'||cl.status==='no-answer';
          const hasAnalysis = !!(typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)[cl.id];
          const hasRecording = !!(typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[cl.id];
          const callTagsList = (typeof phoneCallTags!=='undefined'?phoneCallTags:null)[cl.id] || [];
          const callRating = (typeof phoneCallRatings!=='undefined'?phoneCallRatings:null)[cl.id] || 0;
          const callNote = (typeof phoneCallNotes!=='undefined'?phoneCallNotes:null)[cl.id] || cl.notes || '';
          return(
          <div key={cl.id} onClick={()=>openCallDetail(cl.id)} style={{padding:'10px 12px',transition:'background .12s',borderRadius:10,borderLeft:isMissed?'3px solid #EF4444':hasAnalysis?'3px solid #7C3AED':'3px solid transparent',marginBottom:2,cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background=T.bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              {/* Direction icon */}
              <I n={cl.direction==='outbound'?'phone-outgoing':'phone-incoming'} s={14} style={{color:isMissed?'#EF4444':cl.direction==='outbound'?'#2563EB':'#22C55E'}}/>
              {/* Avatar */}
              <div style={{width:40,height:40,borderRadius:20,background:isMissed?'#EF444410':T.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {ct?<Avatar name={ct.name} color={isMissed?'#EF4444':T.accent} s={40}/>:<I n="user" s={18} style={{color:T.text3}}/>}
              </div>
              {/* Info */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                  <span onClick={(e)=>{e.stopPropagation();prefillKeypad(cl.direction==='outbound'?cl.toNumber:cl.fromNumber);}} style={{fontSize:14,fontWeight:700,color:isMissed?'#EF4444':T.text,cursor:'pointer',borderRadius:4,padding:'0 2px',transition:'background .12s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background='transparent'} title="Afficher sur le clavier">{ct?.name||fmtPhone(cl.direction==='outbound'?cl.toNumber:cl.fromNumber)||'Inconnu'}</span>
                  {isMissed && <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'#EF444418',color:'#EF4444'}}>MANQUE</span>}
                  {hasAnalysis && <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'#7C3AED18',color:'#7C3AED'}}>IA</span>}
                  {hasRecording && <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'#EF444418',color:'#EF4444'}}>REC</span>}
                  {callRating > 0 && <span style={{fontSize:10,color:'#F59E0B'}}>{'*'.repeat(callRating)}</span>}
                </div>
                <div onClick={(e)=>{e.stopPropagation();prefillKeypad(cl.direction==='outbound'?cl.toNumber:cl.fromNumber);}} style={{fontSize:12,color:T.accent,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4,borderRadius:4,padding:'1px 4px',margin:'-1px -4px',transition:'background .12s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background='transparent'} title="Afficher sur le clavier">{fmtPhone(cl.direction==='outbound'?cl.toNumber:cl.fromNumber)}</div>
                {callNote && <div style={{fontSize:11,color:T.accent,marginTop:2,display:'flex',alignItems:'center',gap:4}}><I n="file-text" s={10}/> {callNote.length>50?callNote.substring(0,50)+'...':callNote}</div>}
                {callTagsList.length > 0 && <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:3}}>{callTagsList.map(tag=><span key={tag} style={{fontSize:9,padding:'1px 6px',borderRadius:4,background:T.accentBg,border:`1px solid ${T.accentBorder}`,color:T.accent,fontWeight:600}}>{tag}</span>)}</div>}
              </div>
              {/* Action buttons */}
              <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                {/* Analyze */}
                <div onClick={()=>{if(hasAnalysis){setPhoneAnalysisModal(cl.id);}else{generateCallAnalysis(cl.id);}}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:hasAnalysis?'#7C3AED':T.text3,background:hasAnalysis?'#7C3AED10':T.bg,border:`1px solid ${hasAnalysis?'#7C3AED30':T.border}`}} title={hasAnalysis?"Voir l'analyse IA":"Analyser avec l'IA"}>
                  {phoneAnalysisLoading===cl.id?<div style={{width:12,height:12,border:'2px solid #7C3AED',borderTopColor:'transparent',borderRadius:'50%',animation:'spin .6s linear infinite'}}/>:<I n="cpu" s={12}/>}
                </div>
                {/* Record */}
                <div onClick={()=>{if(hasRecording){setPhoneRecordModal(cl.id);}else{saveCallRecording(cl.id);}}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:hasRecording?'#EF4444':T.text3,background:hasRecording?'#EF444410':T.bg,border:`1px solid ${hasRecording?'#EF444430':T.border}`}} title={hasRecording?"Voir l'enregistrement":"Enregistrer"}>
                  <I n="mic" s={12}/>
                </div>
                {/* Notes */}
                <div onClick={()=>{setPhoneShowCallNoteModal(cl.id);setPhoneCallNoteText((typeof phoneCallNotes!=='undefined'?phoneCallNotes:null)[cl.id]||cl.notes||'');}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:(typeof phoneCallNotes!=='undefined'?phoneCallNotes:null)[cl.id]?T.accent:T.text3,background:(typeof phoneCallNotes!=='undefined'?phoneCallNotes:null)[cl.id]?T.accentBg:T.bg,border:`1px solid ${phoneCallNotes[cl.id]?T.accentBorder:T.border}`}} title="Notes"><I n="edit-3" s={12}/></div>
                {/* Rating */}
                <div onClick={()=>savePhoneCallRating(cl.id, callRating >= 5 ? 0 : callRating + 1)} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:callRating>0?'#F59E0B':T.text3,background:callRating>0?'#F59E0B10':T.bg,border:`1px solid ${callRating>0?'#F59E0B30':T.border}`}} title={`Note: ${callRating}/5`}><I n="star" s={12}/></div>
                {/* Callback */}
                <div onClick={()=>prefillKeypad(cl.direction==='outbound'?cl.toNumber:cl.fromNumber)} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#22C55E10',border:'1px solid #22C55E30'}} title="Rappeler"><I n="phone" s={12} style={{color:'#22C55E'}}/></div>
                {/* SMS */}
                <div onClick={()=>{const num=cl.direction==='outbound'?cl.toNumber:cl.fromNumber;setPhoneDialNumber(num||'');setPhoneSubTab('sms');}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#0EA5E910',border:'1px solid #0EA5E930'}} title="Envoyer SMS"><I n="message-square" s={12} style={{color:'#0EA5E9'}}/></div>
                {/* WhatsApp */}
                <div onClick={()=>{const num=(cl.direction==='outbound'?cl.toNumber:cl.fromNumber)||'';const clean=num.replace(/[^0-9+]/g,'');window.open('https://wa.me/'+clean.replace('+',''),'_blank');}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#25D36610',border:'1px solid #25D36630'}} title="WhatsApp"><I n="message-circle" s={12} style={{color:'#25D366'}}/></div>
                {/* Email */}
                {ct?.email && <div onClick={()=>window.open('mailto:'+ct.email,'_blank')} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#F59E0B10',border:'1px solid #F59E0B30'}} title={'Email: '+ct.email}><I n="mail" s={12} style={{color:'#F59E0B'}}/></div>}
                {/* Add contact */}
                {!ct && <div onClick={()=>{setPhoneQuickAddPhone(cl.direction==='outbound'?cl.toNumber:cl.fromNumber);setPhoneQuickAddName('');}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#2563EB10',border:'1px solid #2563EB30'}} title="Creer fiche contact"><I n="user-plus" s={12} style={{color:'#2563EB'}}/></div>}
                {/* Time/duration */}
                <div style={{textAlign:'right',marginLeft:4}}>
                  <div style={{fontSize:13,fontWeight:600}}>{cl.createdAt?new Date(cl.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'--'}</div>
                  <div style={{fontSize:11,color:isMissed?'#EF4444':T.text3}}>{cl.duration?fmtDur(cl.duration):isMissed?'Manque':'--'}</div>
                </div>
              </div>
            </div>
            {/* Tags selector row */}
            <div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:6,marginLeft:68}}>
              {CALL_TAGS.slice(0,6).map(tag=>(
                <span key={tag} onClick={()=>savePhoneCallTag(cl.id,tag)} style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:callTagsList.includes(tag)?T.accentBg:T.bg,border:`1px solid ${callTagsList.includes(tag)?T.accentBorder:T.border}`,color:callTagsList.includes(tag)?T.accent:T.text3,cursor:'pointer',fontWeight:600,transition:'all .1s'}}>{tag}</span>
              ))}
              <span onClick={()=>{const tag=prompt("Tag personnalise :"); if(tag) savePhoneCallTag(cl.id,tag);}} style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:T.bg,border:`1px dashed ${T.border}`,color:T.text3,cursor:'pointer',fontWeight:600}}>+ Tag</span>
            </div>
          </div>);
        })}
      </div>
    ))
  )}
</div>);
})()}
      </div>
    </div>
  </div>
)}

{/* ─── CALL DETAIL PANEL (Ringover-style) ─── */}
{phoneSubTab === 'call-detail' && (typeof phoneCallDetailId!=='undefined'?phoneCallDetailId:null) && (()=>{
  const cl = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).find(c=>c.id===(typeof phoneCallDetailId!=='undefined'?phoneCallDetailId:null));
  if(!cl) return null;
  const num = cl.direction==='outbound' ? cl.toNumber : cl.fromNumber;
  let ct = cl.contactId ? contacts.find(c=>c.id===cl.contactId) : null;
  if(!ct){const ph=(num||'').replace(/[^\d]/g,'').slice(-9);if(ph.length>=9) ct=contacts.find(c=>{const cp=(c.phone||c.mobile||'').replace(/[^\d]/g,'').slice(-9);return cp&&cp===ph;});}
  const analysis = (typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)[cl.id];
  const recording = (typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[cl.id];
  const notes = (typeof phoneCallNotes!=='undefined'?phoneCallNotes:null)[cl.id] || cl.notes || '';
  const tags = (typeof phoneCallTags!=='undefined'?phoneCallTags:null)[cl.id] || [];
  const rating = (typeof phoneCallRatings!=='undefined'?phoneCallRatings:null)[cl.id] || 0;
  const isMissed = cl.status==='missed'||cl.status==='no-answer';
  const callsForNumber = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(c=>{
    const n=c.direction==='outbound'?c.toNumber:c.fromNumber;
    return (n||'').replace(/[^\d]/g,'').slice(-9)===(num||'').replace(/[^\d]/g,'').slice(-9);
  }).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  const fmtDur2 = (s)=>{if(!s||s<1)return'00:00';const m=Math.floor(s/60);const ss=s%60;return String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0');};
  return(
  <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
    {/* HEADER */}
    <div style={{padding:'16px 20px',borderBottom:'1px solid '+T.border,flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
<div onClick={()=>setPhoneSubTab('history')} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',color:T.text3,fontSize:12,fontWeight:600,padding:'4px 8px',borderRadius:6,transition:'background .12s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
<I n="arrow-left" s={14}/> Historique
</div>
<div onClick={()=>{setPhoneCallDetailId(null);setPhoneSubTab('pipeline');}} style={{width:30,height:30,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text3}} onMouseEnter={e=>e.currentTarget.style.background=T.bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
<I n="x" s={16}/>
</div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
<div style={{width:52,height:52,borderRadius:16,background:isMissed?'#EF444412':T.accentBg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,border:'2px solid '+(isMissed?'#EF444430':T.accent+'30')}}>
{ct ? <span style={{fontWeight:800,fontSize:18,color:isMissed?'#EF4444':T.accent}}>{(ct.name||'?')[0].toUpperCase()}</span> : <I n={cl.direction==='outbound'?'phone-outgoing':'phone-incoming'} s={22} style={{color:isMissed?'#EF4444':T.accent}}/>}
</div>
<div style={{flex:1,minWidth:0}}>
<div style={{fontSize:18,fontWeight:800,color:T.text}}>{ct?.name || fmtPhone(num) || 'Inconnu'}</div>
<div style={{fontSize:12,color:T.text3,marginTop:2}}>
  {ct?.name ? fmtPhone(num)+' · ' : ''}{new Date(cl.createdAt).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short',year:'numeric'})} a {new Date(cl.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} · {fmtDur2(cl.duration)}
</div>
{rating > 0 && <div style={{marginTop:3}}>{[1,2,3,4,5].map(i=><span key={i} style={{color:i<=rating?'#F59E0B':'#E5E7EB',fontSize:14,cursor:'pointer'}} onClick={()=>{const next={...phoneCallRatings,[cl.id]:i};(typeof setPhoneCallRatings==='function'?setPhoneCallRatings:function(){})(next);localStorage.setItem('c360-phone-ratings-'+collab.id,JSON.stringify(next));}}>★</span>)}</div>}
</div>
<div style={{display:'flex',gap:6}}>
<div onClick={()=>startPhoneCall(num,ct?.id)} style={{width:36,height:36,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#22C55E15',border:'1px solid #22C55E30'}} title="Rappeler"><I n="phone" s={15} style={{color:'#22C55E'}}/></div>
<div onClick={()=>{setPhoneDialNumber(num||'');setPhoneSubTab('sms');}} style={{width:36,height:36,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#0EA5E910',border:'1px solid #0EA5E930'}} title="SMS"><I n="message-square" s={15} style={{color:'#0EA5E9'}}/></div>
<div onClick={()=>{setPhoneShowCallNoteModal(cl.id);setPhoneCallNoteText(notes);}} style={{width:36,height:36,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#F59E0B10',border:'1px solid #F59E0B30'}} title="Notes"><I n="file-text" s={15} style={{color:'#F59E0B'}}/></div>
{!ct && <div onClick={()=>{setPhoneQuickAddPhone(num);setPhoneQuickAddName('');}} style={{width:36,height:36,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.accentBg,border:'1px solid '+T.accent+'30'}} title="Ajouter contact"><I n="user-plus" s={15} style={{color:T.accent}}/></div>}
</div>
      </div>
    </div>

    {/* AI SUMMARY */}
    {analysis && (
      <div style={{margin:'12px 20px',padding:'14px 16px',borderRadius:14,background:'linear-gradient(135deg,#7C3AED08,#2563EB08)',border:'1px solid #7C3AED20'}}>
<div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
<I n="cpu" s={14} style={{color:'#7C3AED'}}/>
<span style={{fontSize:12,fontWeight:700,color:'#7C3AED'}}>Resume IA</span>
{analysis.sentimentScore > 0 && <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,marginLeft:'auto',background:analysis.sentimentScore>60?'#22C55E15':analysis.sentimentScore>30?'#F59E0B15':'#EF444415',color:analysis.sentimentScore>60?'#22C55E':analysis.sentimentScore>30?'#F59E0B':'#EF4444'}}>{analysis.sentimentScore}% {analysis.sentiment}</span>}
</div>
<div style={{fontSize:13,color:T.text2,lineHeight:1.6}}>{analysis.summary}</div>
{analysis.actionItems?.length > 0 && (
<div style={{marginTop:8,display:'flex',gap:4,flexWrap:'wrap'}}>
  {analysis.actionItems.map((item,i)=><span key={i} style={{fontSize:10,padding:'3px 8px',borderRadius:6,background:'#7C3AED10',color:'#7C3AED',fontWeight:600}}>→ {item}</span>)}
</div>
)}
      </div>
    )}
    {phoneAnalysisLoading===cl.id && (
      <div style={{margin:'12px 20px',padding:'14px',borderRadius:14,background:T.accentBg,textAlign:'center'}}>
<div style={{fontSize:12,color:T.accent,fontWeight:600}}>⏳ Analyse IA en cours...</div>
      </div>
    )}

    {/* 3 TABS */}
    <div style={{display:'flex',gap:0,padding:'0 20px',borderBottom:'1px solid '+T.border,flexShrink:0}}>
      {[{id:'enregistrement',icon:'headphones',label:'Enregistrement'},{id:'flux',icon:'git-branch',label:"Flux d'appel"},{id:'historique',icon:'clock',label:'Historique ('+callsForNumber.length+')'}].map(t=>(
<div key={t.id} onClick={()=>(typeof setPhoneCallDetailTab==='function'?setPhoneCallDetailTab:function(){})(t.id)} style={{padding:'11px 16px',fontSize:12,fontWeight:phoneCallDetailTab===t.id?700:500,cursor:'pointer',borderBottom:phoneCallDetailTab===t.id?'2px solid '+T.accent:'2px solid transparent',color:phoneCallDetailTab===t.id?T.accent:T.text3,display:'flex',alignItems:'center',gap:5,transition:'all .15s'}}>
<I n={t.icon} s={13}/> {t.label}
</div>
      ))}
    </div>

    {/* TAB CONTENT */}
    <div style={{flex:1,overflow:'auto',padding:20}}>

      {/* TAB 1: Enregistrements + Transcription */}
      {phoneCallDetailTab==='enregistrement' && (()=>{
const allRecorded = callsForNumber.filter(c => (typeof phoneCallRecordings!=='undefined'?phoneCallRecordings:null)[c.id] || c.recordingUrl);
// Inline transcript cache (no hooks) — stored on the IIFE scope
if (!_T.transcriptCache) _T.transcriptCache = {};
if (!_T.transcriptOpen) _T.transcriptOpen = {};
const toggleTranscript = (callId, el) => {
if (_T.transcriptOpen[callId]) {
  _T.transcriptOpen[callId] = false;
  el.closest('[data-rec-card]').querySelector('[data-transcript]').style.display = 'none';
  return;
}
_T.transcriptOpen[callId] = true;
const container = el.closest('[data-rec-card]').querySelector('[data-transcript]');
container.style.display = 'block';
if (_T.transcriptCache[callId]) {
  renderTranscript(container, _T.transcriptCache[callId]);
  return;
}
container.innerHTML = '<div style="text-align:center;padding:8px;font-size:11px;color:#999">Chargement...</div>';
api('/api/voip/transcript/' + callId).then(data => {
  if (!data || (!data.fullText && (!data.segments || data.segments.length === 0))) {
    // No transcript yet — auto-generate from recording
    container.innerHTML = '<div style="text-align:center;padding:10px;font-size:11px;color:#6366F1">Transcription en cours...</div>';
    api('/api/voip/transcribe/' + callId, { method: 'POST' }).then(tr => {
      _T.transcriptCache[callId] = tr;
      renderTranscript(container, tr);
    }).catch(() => {
      container.innerHTML = '<div style="text-align:center;padding:8px;font-size:11px;color:#EF4444">Erreur de transcription</div>';
    });
  } else {
    _T.transcriptCache[callId] = data;
    renderTranscript(container, data);
  }
}).catch(() => {
  container.innerHTML = '<div style="text-align:center;padding:8px;font-size:11px;color:#999">Erreur de chargement</div>';
});
};
const renderTranscript = (container, data) => {
if (!data || (!data.fullText && (!data.segments || data.segments.length === 0))) {
  container.innerHTML = '<div style="padding:10px;text-align:center;font-size:11px;color:#999">Pas de transcription disponible</div>';
  return;
}
if (data.segments && data.segments.length > 0) {
  container.innerHTML = data.segments.map(seg =>
    `<div style="margin-bottom:6px;padding:5px 8px;border-radius:8px;background:${seg.speaker==='agent'||seg.speaker==='collab'?'rgba(99,102,241,0.06)':'rgba(34,197,94,0.04)'}">
      <div style="font-size:9px;font-weight:700;color:${seg.speaker==='agent'||seg.speaker==='collab'?'#6366F1':'#22C55E'};margin-bottom:2px">${seg.speaker==='agent'||seg.speaker==='collab'?'Vous':'Contact'}${seg.timestamp?' · '+Math.round(seg.timestamp/1000)+'s':''}</div>
      <div style="font-size:11px;color:#333;line-height:1.4">${seg.text}</div>
    </div>`
  ).join('');
} else if (data.fullText) {
  container.innerHTML = `<div style="font-size:11px;color:#555;line-height:1.5;white-space:pre-wrap;padding:8px">${data.fullText}</div>`;
}
};
return(
<div>
{allRecorded.length > 0 ? allRecorded.map(rc => {
  const rcDate = new Date(rc.createdAt);
  return(
  <div key={rc.id} data-rec-card="" style={{marginBottom:12,padding:14,borderRadius:14,background:rc.id===cl.id?(T.accentBg||'#6366F108'):(T.card||T.bg),border:'1px solid '+(rc.id===cl.id?T.accent+'30':T.border)}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
      <div style={{width:6,height:6,borderRadius:3,background:'#EF4444',boxShadow:'0 0 4px #EF444460'}}/>
      <span style={{fontSize:11,fontWeight:700,color:T.text}}>{rcDate.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}</span>
      <span style={{fontSize:10,color:T.text3}}>{rcDate.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
      <span style={{fontSize:10,color:T.text3,marginLeft:'auto',fontFamily:'monospace'}}>{fmtDur2(rc.duration)}</span>
    </div>
    <audio controls src={recUrl(rc.id)} style={{width:'100%',borderRadius:8,height:36}} preload="none"/>
    <div style={{display:'flex',alignItems:'center',gap:6,marginTop:6}}>
      <span style={{fontSize:9,color:T.text3}}>{rc.direction==='outbound'?'Sortant':'Entrant'}</span>
      {rc.id===cl.id && <span style={{fontSize:8,padding:'1px 6px',borderRadius:4,background:T.accent+'18',color:T.accent,fontWeight:600}}>Appel actuel</span>}
      <div onClick={(e)=>toggleTranscript(rc.id,e.currentTarget)} style={{marginLeft:'auto',cursor:'pointer',display:'flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:6,background:T.bg,border:'1px solid '+T.border,transition:'all .15s'}}
        onMouseEnter={e=>{e.currentTarget.style.background=T.accent+'10';}} onMouseLeave={e=>{e.currentTarget.style.background=T.bg;}}>
        <I n="file-text" s={10} style={{color:T.accent}}/>
        <span style={{fontSize:9,fontWeight:600,color:T.accent}}>Transcription</span>
        <I n="chevron-down" s={9} style={{color:T.accent}}/>
      </div>
    </div>
    <div data-transcript="" style={{display:'none',marginTop:8,maxHeight:200,overflow:'auto',borderRadius:8,background:T.bg,border:'1px solid '+T.border,padding:4}}/>
  </div>);
}) : (
  <div style={{padding:20,textAlign:'center',borderRadius:14,background:T.card||T.bg,border:'1px solid '+T.border,marginBottom:20}}>
    <I n="mic-off" s={24} style={{color:T.text3,marginBottom:8}}/>
    <div style={{fontSize:13,color:T.text3}}>Pas d'enregistrement</div>
    <div style={{fontSize:11,color:T.text3,marginTop:4}}>Activez REC avant l'appel</div>
  </div>
)}
{/* ═══ SECTION 1: TRANSCRIPTION LIVE (uniquement pendant appel actif) ═══ */}
{(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (
  <div style={{marginTop:16,borderRadius:14,border:'2px solid #EF444440',overflow:'hidden',background:'linear-gradient(135deg,#EF444404,transparent)'}}>
    <div style={{padding:'10px 14px',background:'#EF444408',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid #EF444420'}}>
      <I n="radio" s={14} style={{color:'#EF4444'}}/>
      <span style={{fontSize:13,fontWeight:700,color:T.text}}>Transcription Live</span>
      <span style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:4}}>
        <span style={{width:6,height:6,borderRadius:3,background:'#EF4444',animation:'pulse 1.5s infinite'}}/>
        <span style={{fontSize:10,fontWeight:700,color:'#EF4444'}}>EN DIRECT</span>
      </span>
    </div>
    <div style={{maxHeight:280,overflow:'auto',padding:10}} ref={el=>{if(el)el.scrollTop=el.scrollHeight}}>
      {(typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:{}).length > 0 ? (typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:{}).map((t,i)=>(
        <div key={i} style={{display:'flex',gap:10,marginBottom:8,padding:'6px 10px',borderRadius:10,background:t.speaker==='me'?T.accentBg+'60':'#22C55E08'}}>
          <div style={{width:28,height:28,borderRadius:8,background:t.speaker==='me'?T.accent+'20':'#22C55E20',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <I n={t.speaker==='me'?'headphones':'user'} s={12} style={{color:t.speaker==='me'?T.accent:'#22C55E'}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:700,color:t.speaker==='me'?T.accent:'#22C55E',marginBottom:2}}>{t.speaker==='me'?'Vous':'Contact'}</div>
            <div style={{fontSize:12,color:T.text,lineHeight:1.4}}>{t.text}</div>
          </div>
        </div>
      )) : (
        <div style={{textAlign:'center',padding:24,color:T.text3}}>
          <div style={{fontSize:24,marginBottom:8}}>🎤</div>
          <div style={{fontSize:12,fontWeight:600}}>En écoute...</div>
          <div style={{fontSize:11,marginTop:4}}>Les paroles apparaîtront ici en temps réel</div>
        </div>
      )}
    </div>
  </div>
)}

{/* ═══ SECTION 2: TRANSCRIPTION ENREGISTREMENT (après appel — liée aux enregistrements) ═══ */}
{!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (
  <div style={{marginTop:16,borderRadius:14,border:'1px solid '+T.border,overflow:'hidden'}}>
    <div style={{padding:'10px 14px',background:T.bg,display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid '+T.border}}>
      <I n="file-text" s={14} style={{color:T.accent}}/>
      <span style={{fontSize:13,fontWeight:700,color:T.text}}>Transcription enregistrement</span>
    </div>
    <div style={{maxHeight:300,overflow:'auto',padding:10}}>
      {(typeof phoneCallTranscriptLoading!=='undefined'?phoneCallTranscriptLoading:null) ? (
        <div style={{textAlign:'center',padding:20}}><div style={{fontSize:12,color:T.text3}}>⏳ Chargement...</div></div>
      ) : phoneCallTranscript && JSON.parse((typeof phoneCallTranscript!=='undefined'?phoneCallTranscript:{}).segments_json||'[]').length > 0 ? (
        JSON.parse((typeof phoneCallTranscript!=='undefined'?phoneCallTranscript:{}).segments_json).map((seg,i)=>(
          <div key={i} style={{display:'flex',gap:10,marginBottom:8,padding:'6px 10px',borderRadius:10,background:seg.speaker==='agent'||seg.speaker==='collab'?T.accentBg+'60':'#22C55E08'}}>
            <div style={{width:28,height:28,borderRadius:8,background:seg.speaker==='agent'||seg.speaker==='collab'?T.accent+'20':'#22C55E20',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <I n={seg.speaker==='agent'||seg.speaker==='collab'?'headphones':'user'} s={12} style={{color:seg.speaker==='agent'||seg.speaker==='collab'?T.accent:'#22C55E'}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                <span style={{fontSize:10,fontWeight:700,color:seg.speaker==='agent'||seg.speaker==='collab'?T.accent:'#22C55E'}}>{seg.speaker==='agent'||seg.speaker==='collab'?'Vous':'Contact'}</span>
                {seg.timestamp && <span style={{fontSize:9,color:T.text3}}>{fmtDur2(Math.round((seg.timestamp||0)/1000))}</span>}
              </div>
              <div style={{fontSize:12,color:T.text,lineHeight:1.4}}>{seg.text}</div>
            </div>
          </div>
        ))
      ) : (typeof phoneCallTranscript!=='undefined'?phoneCallTranscript:null)?.fullText ? (
        <div style={{fontSize:12,color:T.text2,lineHeight:1.6,whiteSpace:'pre-wrap',padding:8}}>{(typeof phoneCallTranscript!=='undefined'?phoneCallTranscript:{}).fullText}</div>
      ) : (
        <div style={{textAlign:'center',padding:20,color:T.text3}}>
          <I n="file-x" s={20} style={{color:T.text3,marginBottom:6}}/>
          <div style={{fontSize:12}}>Pas de transcription</div>
          <div style={{fontSize:11,marginTop:4}}>Activez REC pour enregistrer, la transcription sera générée automatiquement</div>
        </div>
      )}
    </div>
  </div>
)}
</div>);
      })()}

      {/* TAB 2: Flux d'appel */}
      {phoneCallDetailTab==='flux' && (
<div>
{[
  {icon:cl.direction==='outbound'?'phone-outgoing':'phone-incoming',label:cl.direction==='outbound'?'Appel sortant vers '+fmtPhone(num):'Appel entrant de '+fmtPhone(num),color:'#3B82F6',time:cl.createdAt},
  ...(isMissed?[{icon:'phone-missed',label:'Appel manque — pas de reponse',color:'#EF4444',time:cl.createdAt}]:[
    {icon:'phone',label:'Decroche par '+(cl.direction==='outbound'?'le destinataire':'vous'),color:'#22C55E',time:cl.createdAt},
    ...(cl.duration>0?[{icon:'clock',label:'Communication: '+fmtDur2(cl.duration),color:'#7C3AED',time:null}]:[]),
    {icon:'phone-off',label:'Raccroche'+(ct?' par '+(cl.direction==='outbound'?ct.name:'vous'):''),color:'#6B7280',time:cl.createdAt},
  ]),
  ...(analysis?[{icon:'cpu',label:'Analyse IA generee — Score: '+(analysis.sentimentScore||0)+'%',color:'#7C3AED',time:analysis.createdAt}]:[]),
  ...(notes?[{icon:'file-text',label:'Note: '+notes.substring(0,60)+(notes.length>60?'...':''),color:'#F59E0B',time:null}]:[]),
  ...(tags.length>0?[{icon:'tag',label:'Tags: '+tags.join(', '),color:'#0EA5E9',time:null}]:[]),
].map((ev,i,arr)=>(
  <div key={i} style={{display:'flex',gap:14,paddingBottom:20,position:'relative'}}>
    {i<arr.length-1 && <div style={{position:'absolute',left:17,top:34,bottom:0,width:2,background:T.border}}/>}
    <div style={{width:36,height:36,borderRadius:12,background:ev.color+'12',border:'2px solid '+ev.color+'40',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,zIndex:1}}>
      <I n={ev.icon} s={14} style={{color:ev.color}}/>
    </div>
    <div style={{paddingTop:2}}>
      <div style={{fontSize:13,fontWeight:600,color:T.text}}>{ev.label}</div>
      {ev.time && <div style={{fontSize:11,color:T.text3,marginTop:2}}>{new Date(ev.time).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>}
    </div>
  </div>
))}
</div>
      )}

      {/* TAB 3: Historique du numero */}
      {phoneCallDetailTab==='historique' && (
<div>
<div style={{fontSize:13,fontWeight:700,marginBottom:14,color:T.text}}>{callsForNumber.length} appel{callsForNumber.length>1?'s':''} avec {ct?.name||fmtPhone(num)}</div>
{callsForNumber.map(c=>{
  const cMissed=c.status==='missed'||c.status==='no-answer';
  const cOut=c.direction==='outbound';
  const isCurrent=c.id===(typeof phoneCallDetailId!=='undefined'?phoneCallDetailId:null);
  return(
    <div key={c.id} onClick={()=>{setPhoneCallDetailId(c.id);setPhoneCallDetailTab('enregistrement');setPhoneCallTranscript(null);fetchCallTranscript(c.id);if(!(typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)[c.id])generateCallAnalysis(c.id);}} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:12,cursor:'pointer',marginBottom:4,background:isCurrent?T.accentBg:'transparent',border:isCurrent?'1px solid '+T.accent+'30':'1px solid transparent',transition:'all .15s'}} onMouseEnter={e=>{if(!isCurrent)e.currentTarget.style.background=T.bg;}} onMouseLeave={e=>{if(!isCurrent)e.currentTarget.style.background='transparent';}}>
      <div style={{width:32,height:32,borderRadius:10,background:cMissed?'#EF444410':cOut?'#2563EB10':'#22C55E10',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <I n={cOut?'phone-outgoing':'phone-incoming'} s={14} style={{color:cMissed?'#EF4444':cOut?'#2563EB':'#22C55E'}}/>
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:600,color:cMissed?'#EF4444':T.text}}>{cOut?'Sortant':'Entrant'}{cMissed?' — Manque':''}</div>
        <div style={{fontSize:11,color:T.text3}}>{new Date(c.createdAt).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})} {new Date(c.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <div style={{fontSize:12,fontWeight:700,color:T.text3}}>{fmtDur2(c.duration)}</div>
    </div>
  );
})}
</div>
      )}
    </div>

    {/* FOOTER: Call ID */}
    <div style={{padding:'10px 20px',borderTop:'1px solid '+T.border,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
{tags.length > 0 && tags.map((tag,i)=><span key={i} style={{fontSize:10,padding:'2px 8px',borderRadius:6,background:T.accentBg,color:T.accent,fontWeight:600}}>{tag}</span>)}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
<span style={{fontSize:10,color:T.text3,fontFamily:'monospace'}}>ID: {cl.id}</span>
<div onClick={()=>{navigator.clipboard.writeText(cl.twilioCallSid||cl.id);showNotif('ID copie!');}} style={{padding:'3px 8px',borderRadius:6,fontSize:10,fontWeight:600,cursor:'pointer',color:T.text3,background:T.bg,border:'1px solid '+T.border,display:'flex',alignItems:'center',gap:3}}>
<I n="copy" s={10}/> Copier
</div>
      </div>
    </div>
  </div>
  );
})()}

{/* ─── 2. CONTACTS MODAL ─── */}
{phoneSubTab === 'contacts' && (
  <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 24px',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
<div style={{display:'flex',alignItems:'center',gap:10}}>
<div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#2563EB,#3B82F6)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="users" s={18} style={{color:'#fff'}}/></div>
<div><div style={{fontSize:16,fontWeight:800}}>Contacts</div><div style={{fontSize:12,color:T.text3}}>Gestion de vos contacts telephoniques</div></div>
</div>
<div onClick={()=>setPhoneSubTab('pipeline')} style={{width:32,height:32,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:`1px solid ${T.border}`}}><I n="x" s={16}/></div>
      </div>
      <div style={{flex:1,overflow:'auto',padding:24}}>
{(()=>{
const logs = (typeof voipCallLogs!=='undefined'?voipCallLogs:null) || [];
const callCounts = {};
logs.forEach(cl => { if (cl.contactId) callCounts[cl.contactId] = (callCounts[cl.contactId] || 0) + 1; });
const allCrmContacts = contacts || [];

const pipelineColors = Object.fromEntries(PIPELINE_STAGES.map(s=>[s.id,s.color]));
const pipelineLabels = Object.fromEntries(PIPELINE_STAGES.map(s=>[s.id,s.label]));

const pipelineStats = {};
allCrmContacts.forEach(c => { if(!c) return; const s = c.pipeline_stage || 'nouveau'; pipelineStats[s] = (pipelineStats[s]||0)+1; }); // hotfix 2026-04-23 — null-safe

const activeStageFilter = (typeof convFilter!=='undefined'?convFilter:null) !== 'all' ? (typeof convFilter!=='undefined'?convFilter:null) : null;

let filtered = allCrmContacts;
if (activeStageFilter) filtered = filtered.filter(c => (c.pipeline_stage||'nouveau') === activeStageFilter);
if ((typeof phoneContactSearch!=='undefined'?phoneContactSearch:null)) {
  const q = (typeof phoneContactSearch!=='undefined'?phoneContactSearch:{}).toLowerCase();
  filtered = filtered.filter(c => (c.name||'').toLowerCase().includes(q) || (c.phone||'').includes(q) || (c.email||'').toLowerCase().includes(q) || (c.company||'').toLowerCase().includes(q));
}
if ((typeof phoneContactSort!=='undefined'?phoneContactSort:null) === 'calls') filtered = [...filtered].sort((a,b) => (callCounts[b.id]||0) - (callCounts[a.id]||0));
else if ((typeof phoneContactSort!=='undefined'?phoneContactSort:null) === 'company') filtered = [...filtered].sort((a,b) => (a.company||'zzz').localeCompare(b.company||'zzz'));
else filtered = [...filtered].sort((a,b) => (a.name||'').localeCompare(b.name||''));

return (
<div>
  {/* Pipeline filter badges — cliquables */}
  <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
    <div onClick={()=>setConvFilter('all')} style={{padding:'6px 12px',borderRadius:10,background:!activeStageFilter?T.accentBg:'transparent',border:'1px solid '+(! activeStageFilter?T.accentBorder:T.border),display:'flex',alignItems:'center',gap:5,cursor:'pointer',transition:'all .12s'}} onMouseEnter={e=>{if(activeStageFilter)e.currentTarget.style.background=T.bg;}} onMouseLeave={e=>{if(activeStageFilter)e.currentTarget.style.background='transparent';}}>
      <span style={{fontSize:12,fontWeight:700,color:!activeStageFilter?T.accent:T.text2}}>{allCrmContacts.length}</span>
      <span style={{fontSize:11,fontWeight:600,color:!activeStageFilter?T.accent:T.text3}}>Tous</span>
    </div>
    {Object.entries(pipelineLabels).map(([k,label]) => {
      const isActive = activeStageFilter === k;
      const count = pipelineStats[k]||0;
      return (
      <div key={k} onClick={()=>setConvFilter(isActive?'all':k)} style={{padding:'6px 12px',borderRadius:10,background:isActive?pipelineColors[k]+'20':count>0?pipelineColors[k]+'08':'transparent',border:'1px solid '+(isActive?pipelineColors[k]+'50':count>0?pipelineColors[k]+'20':T.border),display:'flex',alignItems:'center',gap:5,cursor:'pointer',transition:'all .12s',opacity:count===0&&!isActive?0.5:1}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>{if(count===0&&!isActive)e.currentTarget.style.opacity='0.5';}}>
        <div style={{width:7,height:7,borderRadius:4,background:pipelineColors[k]}}/>
        <span style={{fontSize:12,fontWeight:700,color:isActive?pipelineColors[k]:T.text}}>{count}</span>
        <span style={{fontSize:11,fontWeight:isActive?700:500,color:isActive?pipelineColors[k]:T.text3}}>{label}</span>
      </div>);
    })}
  </div>

  {/* Search + Sort + Count + Add */}
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,gap:10,flexWrap:'wrap'}}>
    <div style={{position:'relative',flex:1,maxWidth:280}}>
      <I n="search" s={13} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:T.text3}}/>
      <input value={phoneContactSearch} onChange={e=>(typeof setPhoneContactSearch==='function'?setPhoneContactSearch:function(){})(e.target.value)} placeholder="Rechercher nom, email, tel, entreprise..." style={{width:'100%',padding:'8px 10px 8px 30px',borderRadius:10,border:`1.5px solid ${T.border}`,background:T.bg,fontSize:12,fontFamily:'inherit',color:T.text,outline:'none'}}/>
    </div>
    <div style={{display:'flex',gap:4}}>
      {[{id:'alpha',label:'A-Z',icon:'type'},{id:'calls',label:'Appels',icon:'phone'},{id:'company',label:'Societe',icon:'briefcase'}].map(s=>(
        <div key={s.id} onClick={()=>(typeof setPhoneContactSort==='function'?setPhoneContactSort:function(){})(s.id)} style={{padding:'5px 10px',borderRadius:8,fontSize:11,fontWeight:phoneContactSort===s.id?700:500,cursor:'pointer',background:phoneContactSort===s.id?T.accentBg:'transparent',color:phoneContactSort===s.id?T.accent:T.text3,border:`1px solid ${phoneContactSort===s.id?T.accentBorder:'transparent'}`,display:'flex',alignItems:'center',gap:3}}>
          <I n={s.icon} s={11}/> {s.label}
        </div>
      ))}
    </div>
    <span style={{fontSize:12,color:T.text3,flexShrink:0}}>{filtered.length} contact{filtered.length>1?"s":""}</span>
    <div onClick={()=>setShowNewContact(true)} style={{padding:"6px 14px",borderRadius:10,background:"linear-gradient(135deg,#2563EB,#3B82F6)",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5,boxShadow:"0 2px 8px rgba(37,99,235,0.25)",flexShrink:0}}>
      <I n="plus" s={13}/> Nouveau contact
    </div>
  </div>

  {/* Contact list */}
  <div style={{display:'flex',flexDirection:'column',gap:2}}>
    {filtered.map(c=>{
      const tags = (()=>{ try { return JSON.parse(c.tags_json||'[]'); } catch { return []; } })();
      const stage = c.pipeline_stage || 'nouveau';
      const calls = callCounts[c.id] || 0;
      const lastCall = calls > 0 ? logs.filter(cl=>cl.contactId===c.id).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))[0] : null;
      return (
      <div key={c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:10,transition:'background .12s',borderLeft:`3px solid ${pipelineColors[stage]||T.border}`}} onMouseEnter={e=>e.currentTarget.style.background=T.surface} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
        {/* Star toggle */}
        <div onClick={()=>togglePhoneFav(c.id)} style={{cursor:'pointer',flexShrink:0}}><I n="star" s={15} style={{color:(typeof phoneFavorites!=='undefined'?phoneFavorites:{}).includes(c.id)?'#F59E0B':T.border2,fill:(typeof phoneFavorites!=='undefined'?phoneFavorites:{}).includes(c.id)?'#F59E0B':'none'}}/></div>
        {/* Avatar */}
        <Avatar name={c.name} color={pipelineColors[stage]||T.accent} s={38}/>
        {/* Info */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:13,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</span>
            <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:pipelineColors[stage]+'18',color:pipelineColors[stage]}}>{pipelineLabels[stage]||stage}</span>
            {calls > 0 && <span style={{fontSize:9,fontWeight:600,padding:'1px 5px',borderRadius:4,background:'#7C3AED12',color:'#7C3AED'}}>{calls} appel{calls>1?'s':''}</span>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:2}}>
            {c.phone && <span style={{fontSize:11,color:T.text3,display:'flex',alignItems:'center',gap:2}}><I n="phone" s={10}/> {displayPhone(c.phone)}</span>}
            {c.email && <span style={{fontSize:11,color:T.text3,display:'flex',alignItems:'center',gap:2}}><I n="mail" s={10}/> {c.email}</span>}
            {c.company && <span style={{fontSize:11,color:T.text3,display:'flex',alignItems:'center',gap:2}}><I n="briefcase" s={10}/> {c.company}</span>}
          </div>
          {tags.length > 0 && <div style={{display:'flex',gap:3,marginTop:3,flexWrap:'wrap'}}>{tags.slice(0,4).map((t,i)=><span key={i} style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:T.accentBg,color:T.accent,fontWeight:600}}>{t}</span>)}</div>}
        </div>
        {/* Last call date */}
        {lastCall && <span style={{fontSize:10,color:T.text3,flexShrink:0}}>{new Date(lastCall.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</span>}
        {/* Action buttons */}
        <div style={{display:'flex',gap:4,flexShrink:0}}>
          {c.phone && <div onClick={()=>{setPhoneSubTab('sms');setPhoneDialNumber(c.phone);}} style={{width:30,height:30,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#2563EB10',border:'1px solid #2563EB20'}} title="SMS"><I n="message-square" s={13} style={{color:'#2563EB'}}/></div>}
          {c.phone && <div onClick={()=>prefillKeypad(c.phone)} style={{width:30,height:30,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#22C55E10',border:'1px solid #22C55E20'}} title="Appeler"><I n="phone" s={13} style={{color:'#22C55E'}}/></div>}
          {c.phone && <div onClick={()=>{const clean=(c.phone||'').replace(/[^0-9+]/g,'');window.open('https://wa.me/'+clean.replace('+',''),'_blank');}} style={{width:30,height:30,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#25D36610',border:'1px solid #25D36620'}} title="WhatsApp"><I n="message-circle" s={13} style={{color:'#25D366'}}/></div>}
          <div onClick={()=>{setPhoneContactDetailId(c.id);setPhoneContactDetailTab('info');setPhoneContactEditMode(false);setPhoneSubTab('contact-detail');}} style={{width:30,height:30,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#7C3AED10',border:'1px solid #7C3AED20'}} title="Fiche complete"><I n="external-link" s={13} style={{color:'#7C3AED'}}/></div>
        </div>
      </div>);
    })}
    {filtered.length===0&&<div style={{textAlign:'center',padding:40,color:T.text3,fontSize:13}}>Aucun contact trouve</div>}
  </div>
</div>);
})()}
      </div>
    </div>
  </div>
)}

{/* ─── 2b. CONTACT DETAIL INLINE ─── */}
{phoneSubTab === 'contact-detail' && (typeof phoneContactDetailId!=='undefined'?phoneContactDetailId:null) && (()=>{
  const c = (contacts||[]).find(x=>x.id===(typeof phoneContactDetailId!=='undefined'?phoneContactDetailId:null));
  if(!c) return <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{color:T.text3}}>Contact introuvable</span></div>;
  const stage = c.pipeline_stage||'nouveau';
  const pipelineColors = Object.fromEntries(PIPELINE_STAGES.map(s=>[s.id,s.color]));
  const pipelineLabels = Object.fromEntries(PIPELINE_STAGES.map(s=>[s.id,s.label]));
  const callsForContact = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(cl=>cl.contactId===c.id || (()=>{const ph=((cl.direction==='outbound'?cl.toNumber:cl.fromNumber)||'').replace(/[^\d]/g,'').slice(-9);const cp=(c.phone||c.mobile||'').replace(/[^\d]/g,'').slice(-9);return cp&&cp===ph;})()).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  const tags = (()=>{try{return JSON.parse(c.tags_json||'[]');}catch{return [];}})();
  const allCollabs = collabs.length?collabs:(company?.collaborators||[]);
  const isEditing = (typeof phoneContactEditMode!=='undefined'?phoneContactEditMode:null);

  return (
  <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header with contact info */}
      <div style={{padding:'16px 20px',background:`linear-gradient(135deg,${pipelineColors[stage]},${pipelineColors[stage]}cc)`,flexShrink:0}}>
<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
<div onClick={()=>setPhoneSubTab('contacts')} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',color:'#ffffffcc',fontSize:11,fontWeight:600}}><I n="arrow-left" s={14}/> Contacts</div>
<div style={{display:'flex',gap:4}}>
  <div onClick={()=>{setPhoneContactEditMode(true);setPhoneContactEditForm({name:c.name||'',firstname:c.firstname||'',lastname:c.lastname||'',phone:c.phone||'',mobile:c.mobile||'',email:c.email||'',company:c.company||'',website:c.website||'',address:c.address||'',status:c.status||'prospect',source:c.source||'manual',notes:c.notes||'',pipeline_stage:stage,tags:tags.join(', '),sympathy_score:c.sympathy_score||50,custom_fields_json:c.custom_fields_json||'[]'});}} style={{padding:'4px 10px',borderRadius:6,background:'rgba(255,255,255,0.15)',cursor:'pointer',fontSize:11,fontWeight:600,color:'#fff',display:'flex',alignItems:'center',gap:4}}><I n="edit-2" s={11}/> Modifier</div>
  <div onClick={()=>{handleCollabDeleteContact(c.id);setPhoneSubTab('contacts');}} style={{padding:'4px 10px',borderRadius:6,background:'rgba(255,255,255,0.15)',cursor:'pointer',fontSize:11,fontWeight:600,color:'#fff'}}><I n="archive" s={11}/></div>
  <div onClick={()=>setPhoneSubTab('contacts')} style={{width:28,height:28,borderRadius:8,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><I n="x" s={14} style={{color:'#fff'}}/></div>
</div>
</div>
<div style={{display:'flex',alignItems:'center',gap:14}}>
<Avatar name={c.name} color={'#fff'} s={50}/>
<div style={{flex:1}}>
  <div style={{fontSize:18,fontWeight:800,color:'#fff'}}>{c.name}</div>
  <div style={{display:'flex',gap:10,marginTop:4,flexWrap:'wrap'}}>
    {c.phone && <span style={{fontSize:11,color:'#ffffffcc',display:'flex',alignItems:'center',gap:3}}><I n="phone" s={10}/> {displayPhone(c.phone)}</span>}
    {c.email && <span style={{fontSize:11,color:'#ffffffcc',display:'flex',alignItems:'center',gap:3}}><I n="mail" s={10}/> {c.email}</span>}
    {c.company && <span style={{fontSize:11,color:'#ffffffcc',display:'flex',alignItems:'center',gap:3}}><I n="briefcase" s={10}/> {c.company}</span>}
  </div>
</div>
<div style={{display:'flex',gap:4}}>
  {c.phone && <div onClick={()=>prefillKeypad(c.phone)} style={{width:36,height:36,borderRadius:10,background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><I n="phone" s={16} style={{color:'#fff'}}/></div>}
  {c.phone && <div onClick={()=>{setPhoneDialNumber(c.phone);setPhoneSubTab('sms');}} style={{width:36,height:36,borderRadius:10,background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><I n="message-square" s={16} style={{color:'#fff'}}/></div>}
  {c.phone && <div onClick={()=>{const clean=(c.phone||'').replace(/[^0-9+]/g,'');window.open('https://wa.me/'+clean.replace('+',''),'_blank');}} style={{width:36,height:36,borderRadius:10,background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><I n="message-circle" s={16} style={{color:'#fff'}}/></div>}
  {c.email && <div onClick={()=>window.open('mailto:'+c.email)} style={{width:36,height:36,borderRadius:10,background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><I n="mail" s={16} style={{color:'#fff'}}/></div>}
</div>
</div>
{/* Stage selector */}
<div style={{display:'flex',gap:4,marginTop:12}}>
{Object.entries(pipelineLabels).map(([k,label])=>(
  <div key={k} onClick={()=>{handlePipelineStageChange(c.id,k);showNotif('Statut: '+label);}} style={{padding:'4px 10px',borderRadius:6,fontSize:10,fontWeight:700,cursor:'pointer',background:stage===k?'#fff':('rgba(255,255,255,0.12)'),color:stage===k?pipelineColors[k]:'#ffffffcc',transition:'all .15s'}}>{label}</div>
))}
</div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:2,padding:'8px 16px',borderBottom:`1px solid ${T.border}`,flexShrink:0,background:T.surface}}>
{[{id:'info',icon:'user',label:'Infos'},{id:'calls',icon:'phone',label:'Appels'},{id:'notes',icon:'file-text',label:'Notes'},{id:'share',icon:'share-2',label:'Partage'}].map(t=>(
<div key={t.id} onClick={()=>(typeof setPhoneContactDetailTab==='function'?setPhoneContactDetailTab:function(){})(t.id)} style={{padding:'6px 12px',borderRadius:8,fontSize:11,fontWeight:phoneContactDetailTab===t.id?700:500,cursor:'pointer',background:phoneContactDetailTab===t.id?T.accentBg:'transparent',color:phoneContactDetailTab===t.id?T.accent:T.text3,display:'flex',alignItems:'center',gap:4,transition:'all .15s'}}><I n={t.icon} s={12}/> {t.label} {t.id==='calls'&&callsForContact.length>0?'('+callsForContact.length+')':''}</div>
))}
      </div>

      {/* Content */}
      <div style={{flex:1,overflow:'auto',padding:16}}>
{/* EDIT MODE */}
{isEditing && (()=>{
const ef=(typeof phoneContactEditForm!=='undefined'?phoneContactEditForm:null);
const setEF=(k,v)=>setPhoneContactEditForm(p=>({...p,[k]:v}));
const customFields=(()=>{try{return JSON.parse(ef.custom_fields_json||'[]');}catch{return[];}})();
const inputSt={width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:12,color:T.text,fontFamily:'inherit',outline:'none',boxSizing:'border-box'};
const labelSt={fontSize:10,fontWeight:700,color:T.text3,marginBottom:3,display:'block',textTransform:'uppercase',letterSpacing:0.5};
const sectionSt={background:T.surface,borderRadius:12,padding:14,display:'flex',flexDirection:'column',gap:10};
return(
<div style={{display:'flex',flexDirection:'column',gap:14}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
    <div style={{fontSize:15,fontWeight:800}}>Modifier le contact</div>
    <div style={{display:'flex',gap:6}}>
      <Btn small primary onClick={()=>{
        const f=(typeof phoneContactEditForm!=='undefined'?phoneContactEditForm:null);
        const isBtb=(f.contact_type||'btc')==='btb';
        const body={name:isBtb?(f.company||f.name):((f.firstname&&f.lastname)?f.firstname+' '+f.lastname:f.name),contact_type:f.contact_type||'btc',firstname:f.firstname||'',lastname:f.lastname||'',phone:f.phone,mobile:f.mobile||'',email:f.email,company:f.company||'',siret:f.siret||'',responsable:f.responsable||'',website:f.website||'',address:f.address||'',status:f.status||'prospect',source:f.source||'manual',notes:f.notes,sympathy_score:parseInt(f.sympathy_score)||50,tags_json:JSON.stringify((f.tags||'').split(',').map(t=>t.trim()).filter(Boolean)),custom_fields_json:f.custom_fields_json||'[]',companyId:company?.id};
        setContacts(p=>p.map(x=>x.id===c.id?{...x,...body}:x));
        api(`/api/data/contacts/${c.id}`,{method:'PUT',body}).then(()=>{showNotif('Contact mis à jour');setPhoneContactEditMode(false);});
      }}><I n="check" s={12}/> Sauvegarder</Btn>
      <Btn small onClick={()=>setPhoneContactEditMode(false)}>Annuler</Btn>
    </div>
  </div>

  {/* Type BTC/BTB */}
  <div style={sectionSt}>
    <div style={{display:'flex',gap:0,borderRadius:10,overflow:'hidden',border:`1px solid ${T.border}`}}>
      <div onClick={()=>setEF('contact_type','btc')} style={{flex:1,padding:'7px 0',textAlign:'center',fontSize:11,fontWeight:700,cursor:'pointer',background:(ef.contact_type||'btc')==='btc'?T.accent:'transparent',color:(ef.contact_type||'btc')==='btc'?'#fff':T.text3,transition:'all .15s'}}>
        <I n="user" s={11}/> Particulier
      </div>
      <div onClick={()=>setEF('contact_type','btb')} style={{flex:1,padding:'7px 0',textAlign:'center',fontSize:11,fontWeight:700,cursor:'pointer',background:(ef.contact_type||'btc')==='btb'?T.accent:'transparent',color:(ef.contact_type||'btc')==='btb'?'#fff':T.text3,transition:'all .15s',borderLeft:`1px solid ${T.border}`}}>
        <I n="building-2" s={11}/> Entreprise
      </div>
    </div>
  </div>

  {/* Identité */}
  <div style={sectionSt}>
    <div style={{fontSize:11,fontWeight:700,color:T.accent,display:'flex',alignItems:'center',gap:4}}><I n="user" s={12}/> Identité</div>
    {(ef.contact_type||'btc')==='btb' && <>
      <div><label style={labelSt}>Entreprise *</label><input value={ef.company||''} onChange={e=>setEF('company',e.target.value)} placeholder="Nom de l'entreprise" style={inputSt}/></div>
      <div><label style={labelSt}>SIRET</label><input value={ef.siret||''} onChange={e=>setEF('siret',e.target.value)} placeholder="N° SIRET" style={inputSt}/></div>
      <div><label style={labelSt}>Responsable</label><input value={ef.responsable||''} onChange={e=>setEF('responsable',e.target.value)} placeholder="Nom du responsable" style={inputSt}/></div>
    </>}
    {(ef.contact_type||'btc')==='btc' && <>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div><label style={labelSt}>Prénom</label><input value={ef.firstname||''} onChange={e=>setEF('firstname',e.target.value)} placeholder="Prénom" style={inputSt}/></div>
        <div><label style={labelSt}>Nom</label><input value={ef.lastname||''} onChange={e=>setEF('lastname',e.target.value)} placeholder="Nom de famille" style={inputSt}/></div>
      </div>
    </>}
    <div><label style={labelSt}>Statut</label>
      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
        {['prospect','client','lead','partenaire','fournisseur','vip','inactif'].map(s=>(
          <div key={s} onClick={()=>setEF('status',s)} style={{padding:'4px 10px',borderRadius:6,fontSize:10,fontWeight:700,cursor:'pointer',background:(ef.status||'prospect')===s?T.accent:'transparent',color:(ef.status||'prospect')===s?'#fff':T.text3,border:`1px solid ${(ef.status||'prospect')===s?T.accent:T.border}`,textTransform:'capitalize',transition:'all .15s'}}>{s}</div>
        ))}
      </div>
    </div>
  </div>

  {/* Coordonnées */}
  <div style={sectionSt}>
    <div style={{fontSize:11,fontWeight:700,color:T.accent,display:'flex',alignItems:'center',gap:4}}><I n="at-sign" s={12}/> Coordonnées</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
      <div><label style={labelSt}>{(ef.contact_type||'btc')==='btb'?'Tél fixe':'Téléphone'}</label><input value={ef.phone||''} onChange={e=>setEF('phone',e.target.value)} placeholder="+33..." style={inputSt}/></div>
      <div><label style={labelSt}>{(ef.contact_type||'btc')==='btb'?'Tél portable':'Mobile'}</label><input value={ef.mobile||''} onChange={e=>setEF('mobile',e.target.value)} placeholder="+33..." style={inputSt}/></div>
    </div>
    <div><label style={labelSt}>Email</label><input type="email" value={ef.email||''} onChange={e=>setEF('email',e.target.value)} placeholder="email@exemple.com" style={inputSt}/></div>
    <div><label style={labelSt}>Site web</label><input value={ef.website||''} onChange={e=>setEF('website',e.target.value)} placeholder="https://..." style={inputSt}/></div>
    <div><label style={labelSt}>Adresse</label><input value={ef.address||''} onChange={e=>setEF('address',e.target.value)} placeholder="Adresse complète" style={inputSt}/></div>
    <div><label style={labelSt}>Source</label>
      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
        {[{id:'manual',label:'Manuel',icon:'edit-2'},{id:'lead',label:'Lead',icon:'target'},{id:'agenda',label:'Agenda',icon:'calendar'},{id:'form',label:'Formulaire',icon:'file-text'},{id:'ads',label:'Publicité',icon:'megaphone'},{id:'import',label:'Import',icon:'upload'},{id:'campaign',label:'Campagne',icon:'zap'},{id:'api',label:'API',icon:'code'}].map(s=>(
          <div key={s.id} onClick={()=>setEF('source',s.id)} style={{padding:'4px 9px',borderRadius:6,fontSize:10,fontWeight:700,cursor:'pointer',background:(ef.source||'manual')===s.id?T.accent:'transparent',color:(ef.source||'manual')===s.id?'#fff':T.text3,border:`1px solid ${(ef.source||'manual')===s.id?T.accent:T.border}`,transition:'all .15s',display:'flex',alignItems:'center',gap:3}}><I n={s.icon} s={9}/> {s.label}</div>
        ))}
      </div>
    </div>
  </div>

  {/* Sympathie — desactive */}

  {/* Tags */}
  <div style={sectionSt}>
    <div style={{fontSize:11,fontWeight:700,color:T.accent,display:'flex',alignItems:'center',gap:4}}><I n="tag" s={12}/> Tags</div>
    <input value={ef.tags||''} onChange={e=>setEF('tags',e.target.value)} placeholder="tag1, tag2, tag3 (séparés par virgule)" style={inputSt}/>
  </div>

  {/* Notes */}
  <div style={sectionSt}>
    <div style={{fontSize:11,fontWeight:700,color:T.accent,display:'flex',alignItems:'center',gap:4}}><I n="file-text" s={12}/> Notes</div>
    <textarea value={ef.notes||''} onChange={e=>setEF('notes',e.target.value)} rows={3} placeholder="Notes libres..." style={{...inputSt,resize:'vertical'}}/>
  </div>

  {/* Champs personnalisés */}
  <div style={sectionSt}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{fontSize:11,fontWeight:700,color:T.accent,display:'flex',alignItems:'center',gap:4}}><I n="plus-circle" s={12}/> Champs personnalisés</div>
      <div onClick={()=>{const cf=[...customFields,{label:'',value:''}];setEF('custom_fields_json',JSON.stringify(cf));}} style={{fontSize:10,fontWeight:700,color:T.accent,cursor:'pointer',display:'flex',alignItems:'center',gap:3}}><I n="plus" s={11}/> Ajouter</div>
    </div>
    {customFields.length===0 && <div style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>Aucun champ personnalisé — cliquez "Ajouter" pour créer</div>}
    {customFields.map((cf,i)=>(
      <div key={i} style={{display:'flex',gap:6,alignItems:'center'}}>
        <input value={cf.label} onChange={e=>{const arr=[...customFields];arr[i]={...arr[i],label:e.target.value};setEF('custom_fields_json',JSON.stringify(arr));}} placeholder="Nom du champ" style={{...inputSt,flex:1}}/>
        <input value={cf.value} onChange={e=>{const arr=[...customFields];arr[i]={...arr[i],value:e.target.value};setEF('custom_fields_json',JSON.stringify(arr));}} placeholder="Valeur" style={{...inputSt,flex:2}}/>
        <div onClick={()=>{const arr=customFields.filter((_,j)=>j!==i);setEF('custom_fields_json',JSON.stringify(arr));}} style={{width:28,height:28,borderRadius:6,background:'#EF444410',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}><I n="x" s={12} style={{color:'#EF4444'}}/></div>
      </div>
    ))}
  </div>
</div>);
})()}

{/* INFO TAB — Enriched */}
{!isEditing && (typeof phoneContactDetailTab!=='undefined'?phoneContactDetailTab:null)==='info' && (()=>{
const sympScore = c.sympathy_score||50;
const sympEmoji = sympScore<=20?'😟':sympScore<=40?'😐':sympScore<=60?'🙂':sympScore<=80?'😊':'🤩';
const sympColor = sympScore<=30?'#EF4444':sympScore<=60?'#F59E0B':'#22C55E';
const statusLabels={'prospect':'Prospect','client':'Client','lead':'Lead','partenaire':'Partenaire','fournisseur':'Fournisseur','vip':'VIP','inactif':'Inactif'};
const statusColors={'prospect':'#2563EB','client':'#22C55E','lead':'#F59E0B','partenaire':'#7C3AED','fournisseur':'#0EA5E9','vip':'#EC4899','inactif':'#64748B'};
const customFields=(()=>{try{return JSON.parse(c.custom_fields_json||'[]');}catch{return[];}})();
const sectionSt={background:T.surface,borderRadius:12,padding:14,display:'flex',flexDirection:'column',gap:8};
const sectionTitle=(icon,label)=>({fontSize:11,fontWeight:700,color:T.accent,display:'flex',alignItems:'center',gap:5,marginBottom:2});
return(
<div style={{display:'flex',flexDirection:'column',gap:14}}>
  {/* Identité */}
  <div style={sectionSt}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={sectionTitle()}><I n="user" s={12} style={{color:T.accent}}/> <span style={{color:T.accent,fontWeight:700,fontSize:11}}>Identité</span></div>
      <span style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:20,background:(c.contact_type||'btc')==='btb'?'#2563EB18':'#22C55E18',color:(c.contact_type||'btc')==='btb'?'#2563EB':'#22C55E',display:'flex',alignItems:'center',gap:3}}>
        <I n={(c.contact_type||'btc')==='btb'?'building-2':'user'} s={9}/> {(c.contact_type||'btc')==='btb'?'Entreprise':'Particulier'}
      </span>
    </div>
    {(c.contact_type||'btc')==='btb' && c.siret && <div><div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>SIRET</div><div style={{fontSize:13,fontWeight:600,marginTop:2}}>{c.siret}</div></div>}
    {(c.contact_type||'btc')==='btb' && c.responsable && <div><div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>Responsable</div><div style={{fontSize:13,fontWeight:600,marginTop:2}}>{c.responsable}</div></div>}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
      <div><div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>Prénom</div><div style={{fontSize:13,fontWeight:600,marginTop:2}}>{c.firstname||'—'}</div></div>
      <div><div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>Nom</div><div style={{fontSize:13,fontWeight:600,marginTop:2}}>{c.lastname||c.name||'—'}</div></div>
    </div>
    {c.company && <div><div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>Entreprise</div><div style={{fontSize:13,fontWeight:600,marginTop:2,display:'flex',alignItems:'center',gap:4}}><I n="briefcase" s={12} style={{color:T.text3}}/> {c.company}</div></div>}
    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:2}}>
      <div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>Statut</div>
      <span style={{fontSize:10,fontWeight:700,padding:'3px 10px',borderRadius:20,background:(statusColors[c.status||'prospect']||'#2563EB')+'18',color:statusColors[c.status||'prospect']||'#2563EB'}}>{statusLabels[c.status||'prospect']||'Prospect'}</span>
    </div>
  </div>

  {/* Sympathie */}
  <div style={sectionSt}>
    <div style={sectionTitle()}><I n="heart" s={12} style={{color:T.accent}}/> <span style={{color:T.accent,fontWeight:700,fontSize:11}}>Sympathie</span></div>
    <div style={{display:'flex',alignItems:'center',gap:12}}>
      <div style={{fontSize:28}}>{sympEmoji}</div>
      <div style={{flex:1}}>
        <div style={{height:8,borderRadius:4,background:T.border,overflow:'hidden'}}>
          <div style={{height:'100%',borderRadius:4,background:`linear-gradient(90deg,#EF4444,#F59E0B,#22C55E)`,width:sympScore+'%',transition:'width .3s'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
          <span style={{fontSize:9,color:T.text3}}>Froid</span>
          <span style={{fontSize:12,fontWeight:800,color:sympColor}}>{sympScore}%</span>
          <span style={{fontSize:9,color:T.text3}}>Excellent</span>
        </div>
      </div>
    </div>
  </div>

  {/* Coordonnées */}
  <div style={sectionSt}>
    <div style={sectionTitle()}><I n="at-sign" s={12} style={{color:T.accent}}/> <span style={{color:T.accent,fontWeight:700,fontSize:11}}>Coordonnées</span></div>
    {[
      {l:'Téléphone',v:c.phone,icon:'phone',action:c.phone?()=>prefillKeypad(c.phone):null,actionIcon:'phone-call',actionColor:'#22C55E'},
      {l:'Mobile',v:c.mobile,icon:'smartphone',action:c.mobile?()=>prefillKeypad(c.mobile):null,actionIcon:'phone-call',actionColor:'#22C55E'},
      {l:'Email',v:c.email,icon:'mail',action:c.email?()=>window.open('mailto:'+c.email):null,actionIcon:'send',actionColor:'#2563EB'},
      {l:'Site web',v:c.website,icon:'globe',action:c.website?()=>window.open(c.website.startsWith('http')?c.website:'https://'+c.website,'_blank'):null,actionIcon:'external-link',actionColor:'#7C3AED'},
      {l:'Adresse',v:c.address,icon:'map-pin'},
    ].filter(f=>f.v).map(f=>(
      <div key={f.l} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 0'}}>
        <I n={f.icon} s={13} style={{color:T.text3,flexShrink:0}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>{f.l}</div>
          <div style={{fontSize:12,fontWeight:600,marginTop:1}}>{f.v}</div>
        </div>
        {f.action && <div onClick={f.action} style={{width:28,height:28,borderRadius:7,background:(f.actionColor||T.accent)+'12',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'transform .15s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.1)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}><I n={f.actionIcon} s={12} style={{color:f.actionColor||T.accent}}/></div>}
      </div>
    ))}
    {![c.phone,c.mobile,c.email,c.website,c.address].some(Boolean) && <div style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>Aucune coordonnée renseignée</div>}
  </div>

  {/* Tags */}
  {tags.length>0 && <div style={sectionSt}>
    <div style={sectionTitle()}><I n="tag" s={12} style={{color:T.accent}}/> <span style={{color:T.accent,fontWeight:700,fontSize:11}}>Tags</span></div>
    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{tags.map((t,i)=><span key={i} style={{fontSize:10,padding:'3px 10px',borderRadius:20,background:T.accentBg,color:T.accent,fontWeight:600}}>{t}</span>)}</div>
  </div>}

  {/* Champs personnalisés */}
  {customFields.length>0 && <div style={sectionSt}>
    <div style={sectionTitle()}><I n="plus-circle" s={12} style={{color:T.accent}}/> <span style={{color:T.accent,fontWeight:700,fontSize:11}}>Champs personnalisés</span></div>
    {customFields.filter(cf=>cf.label&&cf.value).map((cf,i)=>(
      <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'4px 0'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>{cf.label}</div>
          <div style={{fontSize:12,fontWeight:600,marginTop:1}}>{cf.value}</div>
        </div>
      </div>
    ))}
  </div>}

  {/* Notes */}
  {c.notes && <div style={sectionSt}>
    <div style={sectionTitle()}><I n="file-text" s={12} style={{color:T.accent}}/> <span style={{color:T.accent,fontWeight:700,fontSize:11}}>Notes</span></div>
    <div style={{fontSize:12,color:T.text2,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{c.notes}</div>
  </div>}

  {/* Infos système */}
  <div style={sectionSt}>
    <div style={sectionTitle()}><I n="info" s={12} style={{color:T.accent}}/> <span style={{color:T.accent,fontWeight:700,fontSize:11}}>Informations</span></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
      <div><div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>Créé le</div><div style={{fontSize:12,fontWeight:600,marginTop:1}}>{c.createdAt?new Date(c.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'—'}</div></div>
      <div><div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>Dernier contact</div><div style={{fontSize:12,fontWeight:600,marginTop:1}}>{c.lastVisit?new Date(c.lastVisit).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):'Jamais'}</div></div>
      <div><div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>RDV</div><div style={{fontSize:12,fontWeight:600,marginTop:1}}>{(bookings||[]).filter(b=>b.contactId===c.id&&b.status!=='cancelled').length||(c.totalBookings||0)}</div></div>
      <div><div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>Étape pipeline</div><div style={{fontSize:12,fontWeight:600,marginTop:1,color:pipelineColors[stage]}}>{pipelineLabels[stage]||stage}</div></div>
      <div><div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>Source</div><div style={{fontSize:12,fontWeight:600,marginTop:1}}>{{manual:'Manuel',lead:'Lead',agenda:'Agenda',form:'Formulaire',ads:'Publicité',import:'Import',campaign:'Campagne',api:'API'}[c.source||'manual']||c.source||'Manuel'}</div></div>
    </div>
  </div>

  {/* Résumé rapide */}
  <Card style={{padding:14}}>
    <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>📊 Résumé rapide</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
      <div style={{textAlign:'center',padding:10,borderRadius:10,background:T.bg}}><div style={{fontSize:20,fontWeight:800,color:'#2563EB'}}>{callsForContact.length}</div><div style={{fontSize:10,color:T.text3,fontWeight:600}}>Appels</div></div>
      <div style={{textAlign:'center',padding:10,borderRadius:10,background:T.bg}}><div style={{fontSize:20,fontWeight:800,color:'#22C55E'}}>{callsForContact.filter(cl=>cl.status==='completed'||cl.duration>0).length}</div><div style={{fontSize:10,color:T.text3,fontWeight:600}}>Répondus</div></div>
      <div style={{textAlign:'center',padding:10,borderRadius:10,background:T.bg}}><div style={{fontSize:20,fontWeight:800,color:'#EF4444'}}>{callsForContact.filter(cl=>cl.status==='missed'||cl.status==='no-answer').length}</div><div style={{fontSize:10,color:T.text3,fontWeight:600}}>Manqués</div></div>
    </div>
  </Card>
</div>);
})()}

{/* CALLS TAB */}
{!isEditing && (typeof phoneContactDetailTab!=='undefined'?phoneContactDetailTab:null)==='calls' && (
<div>
  {callsForContact.length===0?<div style={{textAlign:'center',padding:40,color:T.text3}}><I n="phone-off" s={24} style={{opacity:0.3,marginBottom:8}}/><div style={{fontSize:12}}>Aucun appel avec ce contact</div></div>:
  <div style={{display:'flex',flexDirection:'column',gap:4}}>
    {callsForContact.map(cl=>{
      const isMissed=cl.status==='missed'||cl.status==='no-answer';
      const isOut=cl.direction==='outbound';
      return(
      <div key={cl.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,background:T.surface,borderLeft:`3px solid ${isMissed?'#EF4444':isOut?'#2563EB':'#22C55E'}`}}>
        <I n={isMissed?'phone-missed':isOut?'phone-outgoing':'phone-incoming'} s={14} style={{color:isMissed?'#EF4444':isOut?'#2563EB':'#22C55E'}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:600}}>{isOut?'Appel sortant':'Appel entrant'}{isMissed?' (manque)':''}</div>
          <div style={{fontSize:10,color:T.text3}}>{cl.createdAt?new Date(cl.createdAt).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''} {cl.duration?'· '+fmtDur(cl.duration):''}</div>
        </div>
        <div onClick={()=>prefillKeypad(c.phone)} style={{width:26,height:26,borderRadius:6,background:'#22C55E10',border:'1px solid #22C55E30',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><I n="phone" s={11} style={{color:'#22C55E'}}/></div>
      </div>);
    })}
  </div>}
</div>
)}

{/* NOTES TAB */}
{!isEditing && (typeof phoneContactDetailTab!=='undefined'?phoneContactDetailTab:null)==='notes' && (
<div>
  <textarea value={c.notes||''} onChange={e=>{const v=e.target.value;setContacts(p=>p.map(x=>x.id===c.id?{...x,notes:v}:x));api(`/api/data/contacts/${c.id}`,{method:'PUT',body:{notes:v,companyId:company?.id}});}} placeholder="Notes sur ce contact..." rows={8} style={{width:'100%',padding:'12px 14px',borderRadius:10,border:`1px solid ${T.border}`,background:T.surface,fontSize:13,color:T.text,fontFamily:'inherit',outline:'none',resize:'vertical',lineHeight:1.6}}/>
  <div style={{fontSize:10,color:T.text3,marginTop:4}}>Sauvegarde automatique</div>
</div>
)}

{/* SHARE TAB */}
{!isEditing && (typeof phoneContactDetailTab!=='undefined'?phoneContactDetailTab:null)==='share' && (
<div>
  <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Partager avec les collaborateurs</div>
  <div style={{display:'flex',flexDirection:'column',gap:6}}>
    {allCollabs.filter(col=>col.id!==collab.id).map(col=>{
      const isShared = (c.shared_with||[]).includes(col.id);
      return(
      <div key={col.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:isShared?T.accentBg:T.surface,border:`1px solid ${isShared?T.accentBorder:T.border}`,cursor:'pointer',transition:'all .15s'}} onClick={()=>{
        const current=c.shared_with||[];
        const next=isShared?current.filter(id=>id!==col.id):[...current,col.id];
        setContacts(p=>p.map(x=>x.id===c.id?{...x,shared_with:next}:x));
        api(`/api/data/contacts/${c.id}`,{method:'PUT',body:{shared_with:JSON.stringify(next),companyId:company?.id}}).then(()=>showNotif(isShared?'Partage retiré':'Partage avec '+col.name));
      }}>
        <Avatar name={col.name} color={isShared?T.accent:T.text3} s={32}/>
        <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{col.name}</div><div style={{fontSize:10,color:T.text3}}>{col.email||col.role||''}</div></div>
        <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${isShared?T.accent:T.border}`,background:isShared?T.accent:'transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>{isShared&&<I n="check" s={12} style={{color:'#fff'}}/>}</div>
      </div>);
    })}
  </div>
</div>
)}
      </div>
    </div>
  </div>);
})()}

{/* ─── 2c. PIPELINE VIEW — Identical to CRM Pipeline ─── */}
{phoneSubTab === 'pipeline' && (()=>{
  const STAGES = orderedStages;
  const getScore=(ct)=>{let s=0;s+=Math.min((ct.totalBookings||0)*10,50);s+=(ct.rating||0)*8;if(ct.lastVisit){const d=Math.floor((Date.now()-new Date(ct.lastVisit).getTime())/86400000);if(d<=7)s+=10;else if(d<=30)s+=5;}if(ct.email)s+=5;if(ct.phone)s+=5;if(ct.pipeline_stage==='client_valide')s+=15;else if(ct.pipeline_stage==='qualifie')s+=10;else if(ct.pipeline_stage==='rdv_programme')s+=8;else if(ct.pipeline_stage==='contacte')s+=5;s+=(ct.behavior_score||0);return Math.min(Math.max(s,0),100);};
  const scColor=(s)=>s>=8?'#22C55E':s>=3?'#F59E0B':s>=0?'#94A3B8':'#EF4444';
  const _collabEmails=new Set((collabs||[]).map(cl=>cl.email?.toLowerCase()).filter(Boolean));
  const _collabNames=new Set((collabs||[]).map(cl=>cl.name?.toLowerCase()).filter(Boolean));
  if(collab?.email)_collabEmails.add(collab.email.toLowerCase());
  if(collab?.name)_collabNames.add(collab.name.toLowerCase());
  if(company?.email)_collabEmails.add(company.email.toLowerCase());
  const myPipeContacts=(contacts||[]).filter(c=>{
    if(c.email&&_collabEmails.has(c.email.toLowerCase()))return false;
    if(c.name&&_collabNames.has(c.name.toLowerCase()))return false;
    if(isAdminView)return c.companyId===company?.id;
    // V1.10.4 P1 — élargi : owner OU shared OU sender/receiver d'un booking share_transfer
    return isContactInSuiviForCollab(c, bookings, collab.id);
  });
  const allCtxRaw=myPipeContacts.map(c=>({...c,_score:getScore(c),_daysSince:Math.floor((Date.now()-new Date(c.lastVisit||c.createdAt||0).getTime())/86400000)}));
  const pipeFavFilter=localStorage.getItem('c360-pipe-fav-filter-'+collab.id)==='1';
  const allCtxFav=pipeFavFilter?allCtxRaw.filter(c=>(typeof phoneFavorites!=='undefined'?phoneFavorites:{}).includes(c.id)):allCtxRaw;
  const allCtx=(typeof phonePipeSearch!=='undefined'?phonePipeSearch:{}).trim()?allCtxFav.filter(c=>{const q=(typeof phonePipeSearch!=='undefined'?phonePipeSearch:{}).toLowerCase();return (c.name||'').toLowerCase().includes(q)||(c.email||'').toLowerCase().includes(q)||(c.phone||'').includes(q)||(c.firstname||'').toLowerCase().includes(q)||(c.lastname||'').toLowerCase().includes(q);}):allCtxFav;
  const stageCounts={};STAGES.forEach(s=>{stageCounts[s.id]=allCtx.filter(c=>(c.pipeline_stage||'nouveau')===s.id).length;});
  const total=allCtx.length||1;
  const won=stageCounts['client_valide']||0;
  const lost=stageCounts['perdu']||0;
  const winRate=total>0?Math.round(won/total*100):0;
  const avgScores={};STAGES.forEach(s=>{const sc=allCtx.filter(c=>(c.pipeline_stage||'nouveau')===s.id);avgScores[s.id]=sc.length?Math.round(sc.reduce((a,c)=>a+c._score,0)/sc.length):0;});

  return(
  <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
    {/* Banner appel actif — visible dans la vue pipeline */}
    {((typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) || (typeof voipState!=='undefined'?voipState:null)==='connecting' || (typeof voipState!=='undefined'?voipState:null)==='ringing') && <div style={{padding:'6px 16px',background:(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?'linear-gradient(135deg,#22C55E,#16A34A)':'linear-gradient(135deg,#F59E0B,#F97316)',display:'flex',alignItems:'center',gap:10,flexShrink:0,boxShadow:'0 2px 12px rgba(34,197,94,0.3)'}}>
      <div style={{width:8,height:8,borderRadius:4,background:'#fff',animation:'pulse 1.5s infinite',boxShadow:'0 0 8px rgba(255,255,255,0.6)'}}/>
      <span style={{fontSize:12,fontWeight:700,color:'#fff',flex:1}}>{phoneActiveCall?'📞 En appel':'📞 Connexion...'} — {(contacts||[]).find(c=>c.phone&&(c.phone.replace(/\D/g,'').slice(-9)===((typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?.number||(typeof phoneDialNumber!=='undefined'?phoneDialNumber:null)||'').replace(/\D/g,'').slice(-9)))?.name || displayPhone((typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?.number||(typeof phoneDialNumber!=='undefined'?phoneDialNumber:null))}</span>
      {(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && <span style={{fontSize:11,fontWeight:700,color:'#ffffffcc',fontFamily:'monospace'}}>{(()=>{const s=(typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)||0;return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');})()}</span>}
      <div onClick={endPhoneCall} style={{padding:'5px 14px',borderRadius:8,background:'#EF4444',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:4,boxShadow:'0 2px 8px rgba(239,68,68,0.4)',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='#DC2626'} onMouseLeave={e=>e.currentTarget.style.background='#EF4444'}>
<I n="phone-off" s={13}/> Raccrocher
      </div>
    </div>}
    {/* Header */}
    <div data-pipe-keep="1" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
<div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="trello" s={16} style={{color:'#fff'}}/></div>
<div>
<div style={{display:'flex',alignItems:'center',gap:8}}>
  <span style={{fontSize:14,fontWeight:800}}>Pipeline</span>
</div>
<div style={{display:'flex',alignItems:'center',gap:14,fontSize:11,marginTop:4}}>
  <span style={{fontWeight:700,color:T.text}}>{allCtx.length} contact{allCtx.length===1?'':'s'}</span>
  <span style={{fontWeight:700,color:'#22C55E'}}>🟢 {won} gagné{won===1?'':'s'}</span>
  <span style={{fontWeight:700,color:'#EF4444'}}>🔴 {lost} perdu{lost===1?'':'s'}</span>
  <span style={{fontWeight:700,color:T.accent}}>⚡ {winRate}% conversion</span>
</div>
</div>
      </div>
      {/* Recherche rapide pipeline */}
      <div style={{display:'flex',alignItems:'center',gap:6,flex:'0 1 220px'}}>
<div style={{position:'relative',flex:1}}>
<I n="search" s={13} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:T.text3,pointerEvents:'none'}}/>
<input value={phonePipeSearch} onChange={e=>(typeof setPhonePipeSearch==='function'?setPhonePipeSearch:function(){})(e.target.value)} placeholder="Rechercher..." style={{width:'100%',padding:'6px 8px 6px 28px',borderRadius:8,border:`1px solid ${T.border}`,background:T.card,fontSize:12,color:T.text,outline:'none'}}/>
{phonePipeSearch&&<div onClick={()=>(typeof setPhonePipeSearch==='function'?setPhonePipeSearch:function(){})('')} style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',cursor:'pointer',color:T.text3,fontSize:14,lineHeight:1}}>×</div>}
</div>
      </div>
      {/* Zoom + Filtre colonnes */}
      <div style={{display:'flex',alignItems:'center',gap:4}}>
{/* Zoom */}
<div style={{display:'flex',alignItems:'center',gap:1,background:T.bg,borderRadius:6,border:'1px solid '+T.border,padding:'1px 2px'}}>
<div onClick={()=>{const z=Math.max(60,(_T.pipeZoom||100)-10);_T.pipeZoom=z;try{localStorage.setItem('c360-pipe-zoom',z);}catch{}setPhoneRightAccordion(p=>({...p,_z:z}));}} style={{width:24,height:24,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',borderRadius:4,fontSize:14,fontWeight:700,color:T.text3}} onMouseEnter={e=>e.currentTarget.style.background=T.border} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>−</div>
<span style={{fontSize:9,fontWeight:700,color:T.text3,minWidth:28,textAlign:'center'}}>{(()=>{if(!_T.pipeZoom){try{_T.pipeZoom=parseInt(localStorage.getItem('c360-pipe-zoom'))||100;}catch{_T.pipeZoom=100;}}return _T.pipeZoom;})()}%</span>
<div onClick={()=>{const z=Math.min(140,(_T.pipeZoom||100)+10);_T.pipeZoom=z;try{localStorage.setItem('c360-pipe-zoom',z);}catch{}setPhoneRightAccordion(p=>({...p,_z:z}));}} style={{width:24,height:24,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',borderRadius:4,fontSize:14,fontWeight:700,color:T.text3}} onMouseEnter={e=>e.currentTarget.style.background=T.border} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>+</div>
</div>
{/* Filtre colonnes */}
<div style={{position:'relative'}}>
<div onClick={()=>(typeof setIaHubCollapse==='function'?setIaHubCollapse:function(){})(p=>({...p,_colFilter:!p._colFilter}))} style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',borderRadius:6,background:(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{})._colFilter?T.accentBg:T.bg,border:'1px solid '+((typeof iaHubCollapse!=='undefined'?iaHubCollapse:{})._colFilter?T.accent+'40':T.border)}} title="Filtrer colonnes">
  <I n="sliders" s={13} style={{color:(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{})._colFilter?T.accent:T.text3}}/>
</div>
{(typeof iaHubCollapse!=='undefined'?iaHubCollapse:{})._colFilter && <>
  <div onClick={()=>setIaHubCollapse(p=>({...p,_colFilter:false}))} style={{position:'fixed',inset:0,zIndex:98}}/>
  <div style={{position:'absolute',top:32,right:0,background:T.card,border:'1px solid '+T.border,borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.15)',padding:10,zIndex:99,minWidth:180}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
      <span style={{fontSize:11,fontWeight:700,color:T.text}}>Colonnes visibles</span>
      <div onClick={()=>setIaHubCollapse(p=>({...p,_colFilter:false}))} style={{width:20,height:20,borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:'1px solid '+T.border}}><I n="x" s={11} style={{color:T.text3}}/></div>
    </div>
    {STAGES.map(s=>{
      const hidden = (_T.pipeHiddenCols||{})[s.id];
      return <div key={s.id} onClick={()=>{const h={...(_T.pipeHiddenCols||{})};h[s.id]=!h[s.id];_T.pipeHiddenCols=h;setPhoneRightAccordion(p=>({...p,_cf:Date.now()}));}} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',borderRadius:6,cursor:'pointer',marginBottom:2,background:hidden?'transparent':s.color+'08'}} onMouseEnter={e=>e.currentTarget.style.background=s.color+'15'} onMouseLeave={e=>e.currentTarget.style.background=hidden?'transparent':s.color+'08'}>
        <div style={{width:8,height:8,borderRadius:4,background:hidden?T.border:s.color,flexShrink:0}}/>
        <span style={{fontSize:11,fontWeight:600,color:hidden?T.text3:T.text,flex:1,textDecoration:hidden?'line-through':'none'}}>{s.label}</span>
        <I n={hidden?'eye-off':'eye'} s={11} style={{color:hidden?T.text3:s.color}}/>
      </div>;
    })}
    <div style={{display:'flex',gap:4,marginTop:6}}>
      <div onClick={()=>{_T.pipeHiddenCols={};setPhoneRightAccordion(p=>({...p,_cf:Date.now()}));}} style={{flex:1,padding:'5px 8px',borderRadius:6,textAlign:'center',fontSize:10,fontWeight:600,color:T.accent,cursor:'pointer',background:T.accentBg}}>Tout afficher</div>
      <div onClick={()=>setIaHubCollapse(p=>({...p,_colFilter:false}))} style={{flex:1,padding:'5px 8px',borderRadius:6,textAlign:'center',fontSize:10,fontWeight:600,color:'#fff',cursor:'pointer',background:T.accent}}>Valider</div>
    </div>
  </div>
</>}
</div>
      </div>
    </div>

    {/* Auto-Dialer Progress Bar — enhanced */}
    {(typeof pdStatus!=='undefined'?pdStatus:null) !== 'idle' && (typeof pdStageId!=='undefined'?pdStageId:null) && (typeof pdContactList!=='undefined'?pdContactList:{}).length > 0 && (
      <div style={{padding:'10px 14px',background:(typeof pdStatus!=='undefined'?pdStatus:null)==='running'?'linear-gradient(135deg,#22C55E08,#22C55E04)':(typeof pdStatus!=='undefined'?pdStatus:null)==='paused'?'linear-gradient(135deg,#F59E0B08,#F59E0B04)':'linear-gradient(135deg,#7C3AED08,#7C3AED04)',borderBottom:(typeof pdStatus!=='undefined'?pdStatus:null)==='running'?'3px solid #22C55E':(typeof pdStatus!=='undefined'?pdStatus:null)==='paused'?'3px solid #F59E0B':'3px solid #7C3AED',flexShrink:0}}>
{/* Top row: status + contact name + timer + buttons */}
<div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
<div style={{width:28,height:28,borderRadius:8,background:(typeof pdStatus!=='undefined'?pdStatus:null)==='running'?'#22C55E':'#F59E0B',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px '+((typeof pdStatus!=='undefined'?pdStatus:null)==='running'?'#22C55E40':'#F59E0B40')}}>
  <I n={pdStatus==='running'?'zap':'pause'} s={14} style={{color:'#fff'}}/>
</div>
<div style={{flex:1,minWidth:0}}>
  <div style={{fontSize:12,fontWeight:800,color:T.text,display:'flex',alignItems:'center',gap:6}}>
    <span>⚡ Power Dialer</span>
    <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:(typeof pdStatus!=='undefined'?pdStatus:null)==='running'?'#22C55E18':(typeof pdStatus!=='undefined'?pdStatus:null)==='paused'?'#F59E0B18':'#7C3AED18',color:(typeof pdStatus!=='undefined'?pdStatus:null)==='running'?'#22C55E':(typeof pdStatus!=='undefined'?pdStatus:null)==='paused'?'#F59E0B':'#7C3AED',fontWeight:700}}>
      {pdStatus==='running'?'EN COURS':(typeof pdStatus!=='undefined'?pdStatus:null)==='paused'?'PAUSE':(typeof pdStatus!=='undefined'?pdStatus:null)==='done'?'TERMINÉ':'PRÊT'}
    </span>
  </div>
  {(typeof pdStatus!=='undefined'?pdStatus:null)!=='done'&&<div style={{fontSize:10,color:T.text3,marginTop:1}}>
    <I n="user" s={9} style={{verticalAlign:'middle',marginRight:3}}/>{(typeof pdContactList!=='undefined'?pdContactList:null)[pdCurrentIdx]?.name||'...'}
    {(typeof pdContactList!=='undefined'?pdContactList:null)[pdCurrentIdx]?.phone&&<span style={{marginLeft:6,color:T.text3,fontSize:9}}>{(typeof pdContactList!=='undefined'?pdContactList:null)[pdCurrentIdx].phone}</span>}
  </div>}
</div>
{/* Call timer */}
{(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)&&<div style={{padding:'4px 10px',borderRadius:8,background:'#22C55E15',border:'1px solid #22C55E30'}}>
  <span style={{fontSize:13,fontWeight:800,color:'#22C55E',fontFamily:'monospace'}}>{Math.floor((typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)/60)}:{((typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)%60).toString().padStart(2,'0')}</span>
</div>}
{/* Controls */}
<div style={{display:'flex',gap:4}}>
  {pdStatus==='running'&&<div onClick={()=>(typeof setPdStatus==='function'?setPdStatus:function(){})('paused')} style={{width:32,height:32,borderRadius:8,background:'#F59E0B',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:'0 2px 8px #F59E0B30'}} title="Pause"><I n="pause" s={14} style={{color:'#fff'}}/></div>}
  {pdStatus==='paused'&&<div onClick={()=>{(typeof setPdStatus==='function'?setPdStatus:function(){})('running');if(!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null))autoDialerNext();}} style={{width:32,height:32,borderRadius:8,background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:'0 2px 8px #22C55E30'}} title="Reprendre"><I n="play" s={14} style={{color:'#fff'}}/></div>}
  <div onClick={stopAutoDialer} style={{width:32,height:32,borderRadius:8,background:'#EF4444',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:'0 2px 8px #EF444430'}} title="Arrêter le dialer"><I n="square" s={12} style={{color:'#fff'}}/></div>
</div>
</div>
{/* Progress bar */}
<div style={{display:'flex',alignItems:'center',gap:8}}>
<div style={{flex:1,height:6,borderRadius:3,background:T.border,overflow:'hidden'}}>
  <div style={{height:6,borderRadius:3,background:'linear-gradient(90deg,#7C3AED,#2563EB)',width:Math.round((((typeof pdCurrentIdx!=='undefined'?pdCurrentIdx:null)+((typeof pdStatus!=='undefined'?pdStatus:null)==='done'?1:0))/(typeof pdContactList!=='undefined'?pdContactList:{}).length)*100)+'%',transition:'width .5s ease'}}/>
</div>
<span style={{fontSize:11,fontWeight:800,color:'#7C3AED',flexShrink:0}}>{(typeof pdCurrentIdx!=='undefined'?pdCurrentIdx:null)+((typeof pdStatus!=='undefined'?pdStatus:null)==='done'?1:0)}/{(typeof pdContactList!=='undefined'?pdContactList:{}).length}</span>
</div>
      </div>
    )}

    {/* Bulk action bar — Pipeline Live */}
    {(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length > 0 && (
      <Card style={{padding:"8px 14px",margin:'0 6px 8px',display:"flex",alignItems:"center",gap:10,background:T.accentBg,border:`1.5px solid ${T.accent}44`,flexWrap:"wrap",flexShrink:0}}>
<span style={{fontWeight:700,fontSize:12,color:T.accent}}>{(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length} sélectionné{(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length>1?'s':''}</span>
<select value={pipeBulkStage} onChange={e => (typeof setPipeBulkStage==='function'?setPipeBulkStage:function(){})(e.target.value)} style={{padding:"3px 6px",borderRadius:8,border:`1px solid ${T.border}`,fontSize:11,background:T.surface,color:T.text}}>
<option value="">Déplacer…</option>
{STAGES.map(s => {
  const _MODAL = ['rdv_programme','client_valide'];
  const _multiBlock = _MODAL.includes(s.id) && ((typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:[])||[]).length > 1;
  return <option key={s.id} value={s.id} disabled={_multiBlock}>{s.label}{_multiBlock?' (individuel uniquement)':''}</option>;
})}
</select>
{(typeof pipeBulkStage!=='undefined'?pipeBulkStage:null) && <Btn small primary onClick={() => {
const MODAL_STAGES = ['rdv_programme','client_valide'];
const ids = (typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).filter(id => { const c=(contacts||[]).find(x=>x.id===id); return c && c.pipeline_stage !== (typeof pipeBulkStage!=='undefined'?pipeBulkStage:null); });
if(ids.length===0){showNotif('Aucun contact à déplacer','info');return;}
if(MODAL_STAGES.includes((typeof pipeBulkStage!=='undefined'?pipeBulkStage:null))){
  if(ids.length === 1){
    handlePipelineStageChange(ids[0], (typeof pipeBulkStage!=='undefined'?pipeBulkStage:null));
    (typeof setPipeSelectedIds==='function'?setPipeSelectedIds:function(){})([]);
    (typeof setPipeBulkStage==='function'?setPipeBulkStage:function(){})('');
    return;
  }
  showNotif('Sélection multiple impossible pour ce stage — action individuelle requise','info');
  return;
}
let note = '';
if((typeof pipeBulkStage!=='undefined'?pipeBulkStage:null)==='perdu'){note=prompt('Raison de la perte :')||'Classé perdu en masse';}
if((typeof pipeBulkStage!=='undefined'?pipeBulkStage:null)==='qualifie'){note=prompt('Note de qualification :')||'Qualifié en masse';}
ids.forEach(id => handlePipelineStageChange(id, pipeBulkStage, note));
showNotif(`${ids.length} contact${ids.length>1?'s':''} déplacé${ids.length>1?'s':''} → ${STAGES.find(s=>s.id===pipeBulkStage)?.label||pipeBulkStage}`,'success');
setPipeSelectedIds([]); setPipeBulkStage('');
}}><I n="arrow-right" s={11}/> Go</Btn>}
<Btn small onClick={() => {
const tag = prompt('Tag à ajouter :');
if(!tag||!tag.trim()) return;
(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).forEach(id => { const c=(contacts||[]).find(x=>x.id===id); if(c) handleCollabUpdateContact(id, {tags:[...(c.tags||[]),tag.trim()]}); });
showNotif(`Tag "${tag.trim()}" ajouté à ${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length} contact${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length>1?'s':''}`,'success');
setPipeSelectedIds([]);
}}><I n="tag" s={11}/> Tag</Btn>
{/* Couleur en masse */}
<select onChange={e=>{const v=e.target.value;if(!v)return;const allColors=[...PIPELINE_CARD_COLORS_DEFAULT,...JSON.parse(localStorage.getItem('pipeline_custom_colors')||'[]')];const pc=allColors.find(c=>(c.color||'')===(v==='none'?'':v));if(!pc)return;(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).forEach(id=>handleCollabUpdateContact(id,{card_color:pc.color||'',card_label:pc.color?pc.label:''}));showNotif(`Couleur "${pc.label}" appliquée à ${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length} contact${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length>1?'s':''}`,'success');e.target.value='';}} style={{padding:"3px 6px",borderRadius:8,border:`1px solid ${T.border}`,fontSize:11,background:T.surface,color:T.text}}>
<option value="">Couleur…</option>
{[...PIPELINE_CARD_COLORS_DEFAULT,...JSON.parse(localStorage.getItem('pipeline_custom_colors')||'[]')].map(pc=><option key={pc.color+pc.label} value={pc.color||'none'}>● {pc.label}</option>)}
</select>
<Btn small ghost danger onClick={() => {
if(!confirm(`Supprimer ${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length} contact${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length>1?'s':''} ?`)) return;
api('/api/data/contacts/bulk-delete',{method:'POST',body:{contactIds:(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:null),companyId:company?.id}}).then(()=>{
  setContacts(p=>p.filter(c=>!(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).includes(c.id)));
  showNotif(`${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length} contact${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length>1?'s':''} supprimé${(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).length>1?'s':''}`,'success');
  setPipeSelectedIds([]);
}).catch(()=>showNotif('Erreur suppression','danger'));
}}><I n="trash-2" s={11}/></Btn>
<span onClick={() => setPipeSelectedIds([])} style={{marginLeft:"auto",cursor:"pointer",fontSize:11,color:T.text3,fontWeight:600}}>✕ Tout désélectionner</span>
      </Card>
    )}
    {/* Kanban Columns */}
    <div style={{flex:1,overflow:'auto',padding:'8px 6px',transform:'scale('+((_T.pipeZoom||100)/100)+')',transformOrigin:'top left',width:(10000/(_T.pipeZoom||100))+'%',height:(10000/(_T.pipeZoom||100))+'%'}}>
      <div style={{display:'flex',gap:8,minWidth:STAGES.filter(s=>!(_T.pipeHiddenCols||{})[s.id]).length*190,height:'100%'}}>
{STAGES.filter(s=>!(_T.pipeHiddenCols||{})[s.id]).map(stage=>{
// V5: Tri — dernier modifie en haut partout sauf rdv/nrp
const stageContacts=allCtx.filter(c=>(c.pipeline_stage||'nouveau')===stage.id).sort((a,b)=>{if(stage.id==='rdv_programme')return(a.next_rdv_date||'9999').localeCompare(b.next_rdv_date||'9999');if(stage.id==='nrp')return(a.nrp_next_relance||'9999').localeCompare(b.nrp_next_relance||'9999');return(b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||'');});
const hasPhoneContacts=stageContacts.some(c=>c.phone&&c.phone.length>4);
const isDialingThis=(typeof pdStageId!=='undefined'?pdStageId:null)===stage.id&&(typeof pdStatus!=='undefined'?pdStatus:null)!=='idle';
if(!_T.pipeCollapsedCols){try{_T.pipeCollapsedCols=JSON.parse(localStorage.getItem('c360-pipe-cols')||'{}');}catch{_T.pipeCollapsedCols={};}}
const _isColCollapsed = (_T.pipeCollapsedCols||{})[stage.id];
return(
<div key={stage.id} style={{flex:_isColCollapsed?'0 0 40px':'1 1 180px',minWidth:_isColCollapsed?40:175,display:'flex',flexDirection:'column',borderRadius:12,transition:'all .25s',overflow:'hidden'}}
  onDragOver={e=>{e.preventDefault();e.currentTarget.style.background=stage.color+'12';}}
  onDragLeave={e=>{e.currentTarget.style.background='transparent';}}
  onDrop={e=>{
    e.preventDefault();e.currentTarget.style.background='transparent';
    const colId=e.dataTransfer.getData('columnId');
    if(colId){handleColumnDrop(e,stage.id);return;}
    const cid=e.dataTransfer.getData('contactId');
    if(cid){handlePipelineStageChange(cid,stage.id);if(stage.id!=='rdv_programme'&&stage.id!=='perdu'&&stage.id!=='qualifie')showNotif('Contact → '+(PIPELINE_LABELS[stage.id]||stage.label));}
  }}>
  {/* Column Header */}
  {_isColCollapsed ? (
    <div onClick={()=>{const h={...(_T.pipeCollapsedCols||{})};h[stage.id]=false;_T.pipeCollapsedCols=h;try{localStorage.setItem('c360-pipe-cols',JSON.stringify(h));}catch{}setPhoneRightAccordion(p=>({...p,_cc:Date.now()}));}} style={{padding:'8px 4px',borderRadius:'12px 12px 0 0',background:(STATUS_COLORS[stage.id]||stage.color)+'14',borderBottom:`2.5px solid ${STATUS_COLORS[stage.id]||stage.color}`,cursor:'pointer',textAlign:'center',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background=(STATUS_COLORS[stage.id]||stage.color)+'25'} onMouseLeave={e=>e.currentTarget.style.background=(STATUS_COLORS[stage.id]||stage.color)+'14'} title={'Ouvrir '+(PIPELINE_LABELS[stage.id]||stage.label)}>
      <span style={{fontSize:9,fontWeight:700,color:STATUS_COLORS[stage.id]||stage.color,writingMode:'vertical-rl'}}>{(PIPELINE_LABELS[stage.id]||stage.label).substring(0,4)}</span>
    </div>
  ) : (
    <div draggable onDragStart={e=>handleColumnDragStart(e,stage.id)} onDragEnd={handleColumnDragEnd} style={{padding:'8px 10px',borderRadius:'12px 12px 0 0',background:isDialingThis?stage.color+'25':stage.color+'14',borderBottom:`2.5px solid ${stage.color}`,transition:'background .3s',cursor:'grab'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <div style={{display:'flex',flexDirection:'column',gap:1,opacity:0.3,flexShrink:0}} title="Réorganiser">
            <div style={{display:'flex',gap:1}}><div style={{width:2,height:2,borderRadius:'50%',background:stage.color}}/><div style={{width:2,height:2,borderRadius:'50%',background:stage.color}}/></div>
            <div style={{display:'flex',gap:1}}><div style={{width:2,height:2,borderRadius:'50%',background:stage.color}}/><div style={{width:2,height:2,borderRadius:'50%',background:stage.color}}/></div>
          </div>
          <span onClick={e=>{e.stopPropagation();const h={...(_T.pipeCollapsedCols||{})};h[stage.id]=true;_T.pipeCollapsedCols=h;try{localStorage.setItem('c360-pipe-cols',JSON.stringify(h));}catch{}setPhoneRightAccordion(p=>({...p,_cc:Date.now()}));}} style={{fontSize:11,fontWeight:700,color:STATUS_COLORS[stage.id]||stage.color,cursor:'pointer'}} title="Clic = réduire la colonne">{PIPELINE_LABELS[stage.id]||stage.label}</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          {stage.id==='nouveau'&&<div onClick={(e)=>{e.stopPropagation();setShowNewContact(true);}} style={{width:20,height:20,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",background:"#22C55E",color:"#fff",flexShrink:0,boxShadow:"0 1px 3px #22C55E40",transition:"transform .15s"}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.15)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'} title="Ajouter un nouveau contact"><I n="user-plus" s={11}/></div>}
          {hasPhoneContacts&&stageContacts.length>0&&(typeof pdStatus!=='undefined'?pdStatus:null)==='idle'&&(
            <div onClick={e=>{e.stopPropagation();startAutoDialer(stage.id,stageContacts);}} style={{width:22,height:22,borderRadius:6,background:stage.color+'20',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background=stage.color+'40'} onMouseLeave={e=>e.currentTarget.style.background=stage.color+'20'} title={'Auto-Dialer: appeler '+stageContacts.filter(c=>c.phone).length+' contacts'}>
              <I n="zap" s={12} style={{color:stage.color}}/>
            </div>
          )}
          {isDialingThis&&<div style={{fontSize:8,fontWeight:700,color:'#fff',background:stage.color,borderRadius:8,padding:'1px 5px',animation:'pulse 1.5s infinite'}}>EN COURS</div>}
          <span style={{fontSize:11,fontWeight:800,color:T.text,background:T.surface,borderRadius:20,padding:'1px 7px',minWidth:18,textAlign:'center'}}>{stageContacts.length}</span>
          {stageContacts.length>0&&<input type="checkbox" checked={stageContacts.every(c=>(typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).includes(c.id))} onChange={e=>{e.stopPropagation();if(e.target.checked){(typeof setPipeSelectedIds==='function'?setPipeSelectedIds:function(){})(p=>[...new Set([...p,...stageContacts.map(c=>c.id)])]);}else{const stIds=new Set(stageContacts.map(c=>c.id));(typeof setPipeSelectedIds==='function'?setPipeSelectedIds:function(){})(p=>p.filter(id=>!stIds.has(id)));}}} onClick={e=>e.stopPropagation()} title={`Sélectionner tout ${PIPELINE_LABELS[stage.id]||stage.label}`} style={{cursor:'pointer',accentColor:stage.color,width:13,height:13,flexShrink:0}}/>}
        </div>
      </div>
    </div>
  )}

  {/* Contact Cards — hidden when collapsed */}
  {_isColCollapsed ? (
    <div onClick={e=>{e.stopPropagation();const h={...(_T.pipeCollapsedCols||{})};h[stage.id]=false;_T.pipeCollapsedCols=h;try{localStorage.setItem('c360-pipe-cols',JSON.stringify(h));}catch{}setPhoneRightAccordion(p=>({...p,_cc:Date.now()}));}} style={{flex:1,background:T.bg,borderRadius:'0 0 12px 12px',border:`1px solid ${T.border}`,borderTop:'none',display:'flex',flexDirection:'column',alignItems:'center',padding:'10px 4px',gap:6,cursor:'pointer',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background=stage.color+'08'} onMouseLeave={e=>e.currentTarget.style.background=T.bg} title={'Ouvrir '+(PIPELINE_LABELS[stage.id]||stage.label)}>
      <div style={{width:22,height:22,borderRadius:11,background:stage.color,display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:10,fontWeight:800,color:'#fff'}}>{stageContacts.length}</span></div>
      <span style={{fontSize:9,fontWeight:700,color:STATUS_COLORS[stage.id]||stage.color,writingMode:'vertical-rl',textOrientation:'mixed',letterSpacing:1}}>{PIPELINE_LABELS[stage.id]||stage.label}</span>
      <I n="chevron-right" s={12} style={{color:stage.color,marginTop:'auto'}}/>
    </div>
  ) : (
  <div style={{flex:1,background:T.bg,borderRadius:'0 0 12px 12px',padding:6,minHeight:80,display:'flex',flexDirection:'column',gap:5,border:`1px solid ${T.border}`,borderTop:'none',overflow:'auto'}}>
    {stageContacts.length===0&&stage.id==='nouveau'&&<div onClick={()=>setShowNewContact(true)} style={{textAlign:'center',padding:'20px 8px',color:T.accent,fontSize:11,fontWeight:600,cursor:'pointer',borderRadius:10,border:`1px dashed ${T.accent}40`,background:T.accentBg,transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+'18'} onMouseLeave={e=>e.currentTarget.style.background=T.accentBg}><I n="plus" s={13}/> Nouveau contact</div>}
    {stageContacts.length===0&&stage.id!=='nouveau'&&<div style={{textAlign:'center',padding:'20px 8px',color:T.text3,fontSize:10,fontStyle:'italic'}}>Aucun contact</div>}
    {stageContacts.map(ct=>{
      const score=ct._score;const daysSince=ct._daysSince;
      const isAutoDialing=(typeof pdStatus!=='undefined'?pdStatus:null)!=='idle'&&(typeof pdContactList!=='undefined'?pdContactList:null)[pdCurrentIdx]?.id===ct.id;
      const pdResult=(typeof pdResults!=='undefined'?pdResults:null)[ct.id];
      const _ccHas=!!ct.card_color;
      const _ccBorder=_ccHas?`2.5px solid ${ct.card_color}`:isAutoDialing?'2px solid #7C3AED':pdResult?`2px solid ${pdResult==='contacted'?'#22C55E':'#EF4444'}`:`1px solid ${T.border}`;
      const _ccBg=_ccHas?`linear-gradient(135deg, ${ct.card_color}30 0%, ${ct.card_color}08 60%, transparent 100%)`:isAutoDialing?'#7C3AED12':T.surface;
      const _ccShadow=_ccHas?`0 3px 12px ${ct.card_color}30`:isAutoDialing?'0 0 16px #7C3AED30':'none';
      const _isPipeSel = (typeof pipeSelectedIds!=='undefined'?pipeSelectedIds:{}).includes(ct.id);
      const _isSelected = (typeof pipelineRightContact!=='undefined'?pipelineRightContact:null)?.id === ct.id;
      // Détection RDV passé — phone pipeline
      const _isRdvPasse2 = ct.pipeline_stage==='rdv_programme' && (()=>{
        const nowMs2=Date.now();
        const liveRdv2=(bookings||[]).filter(b=>b.contactId===ct.id&&b.status==='confirmed').sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
        const rdvD2=liveRdv2?liveRdv2.date+(liveRdv2.time?'T'+liveRdv2.time:'T23:59'):ct.next_rdv_date;
        return rdvD2&&new Date(rdvD2).getTime()<nowMs2;
      })();
      // V1.10.3 P2 — Détection "card transmise" (Jordan voit contact owned par Guillaume)
      // V1.10.4 P1 STRICT — visuel "transmis" uniquement si :
      //   assignedTo !== self
      //   ET (shared_with inclut self  OU  sender d'un share_transfer ≠ owner)
      // Cas A (owner + sender du même contact) = NON coloré (le contact reste à soi).
      const _ctSharedRaw = Array.isArray(ct.shared_with) ? ct.shared_with : (()=>{ try { return JSON.parse(ct.shared_with_json||'[]'); } catch { return []; } })();
      const _suiviRole = getContactSuiviRole(ct, bookings, collab.id);
      const _isShareSender = _suiviRole === 'sender'; // strict : exclut 'sender-owner' (cas A)
      const _isSharedCard = !!(ct.assignedTo && ct.assignedTo !== collab.id && (_ctSharedRaw.includes(collab.id) || _isShareSender));
      const _isAdminOverride = collab?.role === 'admin' || collab?.role === 'supra' || isAdminView;
      const _isCardReadOnly = !_isAdminOverride && !!(ct.assignedTo && ct.assignedTo !== collab.id);
      return(
      <div key={ct.id} draggable={!_isCardReadOnly} onDragStart={e=>{
        // V1.8.14 — Bloquer le drag pour shared (non-owner, non-admin)
        const _isAdminBp = collab?.role === 'admin' || collab?.role === 'supra' || isAdminView;
        if (ct.assignedTo && ct.assignedTo !== collab.id && !_isAdminBp) { e.preventDefault(); return; }
        e.dataTransfer.setData('contactId',ct.id);e.target.style.opacity='0.5';
      }} onDragEnd={e=>{e.target.style.opacity='1';}}
        onClick={()=>{
          if(_isRdvPasse2){
            const liveRdv3=(bookings||[]).find(b=>b.contactId===ct.id&&b.status==='confirmed');
            setRdvPasseModal({contact:ct,rdvDate:liveRdv3?.date||ct.next_rdv_date,bookingId:liveRdv3?.id||ct.next_rdv_booking_id});
            return;
          }
          setPipelineRightContact(ct);setPhoneRightTab('fiche');if(phoneRightCollapsed){(typeof setPhoneRightCollapsed==='function'?setPhoneRightCollapsed:function(){})(false);try{localStorage.setItem('c360-phone-right-collapsed-'+collab.id,'0');}catch{}}api('/api/data/pipeline-history?contactId='+ct.id).then(h=>setPipelinePopupHistory(h||[])).catch(()=>setPipelinePopupHistory([]));
        }}
        data-pipe-card="1"
        style={{padding:'8px 10px',borderRadius:10,background:_isRdvPasse2?'linear-gradient(135deg, #F9731612 0%, #F9731604 60%, transparent 100%)':_isSelected?T.accent+'08':_isPipeSel?T.accentBg:_isSharedCard?'#F9731608':_ccBg,border:_isRdvPasse2?'2px solid #F97316':_isSelected?`2.5px solid ${T.accent}`:_isPipeSel?`2px solid ${T.accent}`:_isSharedCard?'2px solid #F9731660':_ccBorder,borderLeft:_isRdvPasse2?'5px solid #F97316':_isSelected?`5px solid ${T.accent}`:_isSharedCard?'5px solid #F97316':_ccHas?`6px solid ${ct.card_color}`:undefined,cursor:'pointer',transition:'all .3s',boxShadow:_isRdvPasse2?'0 3px 12px #F9731625':_isSelected?`0 4px 16px ${T.accent}25`:_isSharedCard?'0 2px 8px #F9731620':_ccShadow,position:'relative'}}
        onMouseEnter={e=>{if(!isAutoDialing&&!_ccHas)e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)';}}
        onMouseLeave={e=>{e.currentTarget.style.boxShadow=_ccShadow;}}>
        {/* Auto-dialer badge */}
        {isAutoDialing&&<div style={{position:'absolute',top:-6,right:-6,width:20,height:20,borderRadius:10,background:'#7C3AED',display:'flex',alignItems:'center',justifyContent:'center',animation:'pulse 1.5s infinite',zIndex:2}}><I n="phone" s={10} style={{color:'#fff'}}/></div>}
        {pdResult&&!isAutoDialing&&<div style={{position:'absolute',top:-4,right:20,fontSize:7,fontWeight:800,color:'#fff',background:pdResult==='contacted'?'#22C55E':'#EF4444',borderRadius:8,padding:'1px 5px',zIndex:2}}>{pdResult==='contacted'?'OK':'NRP'}</div>}
        {/* ── V6: Nom + température + checkbox ── */}
        {(()=>{const _t=getLeadTemperature(ct);ct._temp=_t;return null;})()}
        {/* V1.8.14 — Cross-collab badge (kanban card) — V1.10.4 P1 priorité sender */}
        {(()=>{
          const _isOwner = ct.assignedTo === collab.id;
          const _shared = Array.isArray(ct.shared_with) ? ct.shared_with : [];
          const _sharedHere = _shared.includes(collab.id) && !_isOwner && ct.assignedTo;
          const _capName = (n) => { const s = String(n||'').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'; };
          // V1.10.4 P1 — sender d'un share_transfer (cas A owner+sender, cas B/C sender pur)
          // prend la priorité sur les autres branches pour éviter double rendu
          if (_isShareSender) {
            const _receiverId = getReceiverIdForSentTransfer(ct, bookings, collab.id);
            const _receiverName = (collabs||[]).find(_c => _c.id === _receiverId)?.name || '';
            const _shareTransfBk = getActiveSentTransferBooking(ct, bookings, collab.id);
            const _rs = _shareTransfBk && _shareTransfBk.bookingReportingStatus;
            const _hasPendingReport = _shareTransfBk && (!_rs || _rs === '' || _rs === 'pending');
            const _statusLabels = { validated: '✓ Validé', signed: '✅ Signé', no_show: '❌ No-show', cancelled: '⛔ Annulé', follow_up: '🔄 À suivre', other: '🔘 Autre' };
            const _statusLabel = (_rs && _statusLabels[_rs]) || '';
            return <div style={{marginBottom:2,maxWidth:'100%'}}>
              <div title={'Transmis à ' + (_receiverName ? _capName(_receiverName) : 'autre collaborateur') + ' — lecture seule (suivi)'} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'1px 5px',borderRadius:4,background:'#F9731614',border:'1px solid #F9731635',color:'#9A3412',fontSize:8,fontWeight:700,maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                🤝 Transmis à {_capName(_receiverName)}
              </div>
              {_hasPendingReport && (
                <div title="Reporting en attente du receveur" style={{display:'inline-flex',alignItems:'center',gap:2,marginLeft:4,padding:'0 4px',borderRadius:3,background:'#F59E0B14',color:'#92400E',fontSize:7,fontWeight:700,verticalAlign:'middle'}}>
                  ⏳ Reporting en attente
                </div>
              )}
              {!_hasPendingReport && _statusLabel && (
                <div title={'Reporting : ' + _statusLabel} style={{display:'inline-flex',alignItems:'center',gap:2,marginLeft:4,padding:'0 4px',borderRadius:3,background:'#22C55E14',color:'#15803D',fontSize:7,fontWeight:700,verticalAlign:'middle'}}>
                  {_statusLabel}
                </div>
              )}
            </div>;
          }
          if (_sharedHere) {
            const _ownerName = (collabs||[]).find(_c => _c.id === ct.assignedTo)?.name || '';
            // V1.10.3 P2 — sous-texte "Reporting en attente" si RDV transmis sans reporting
            const _shareTransfBk = (bookings||[]).find(b => b.contactId === ct.id && b.bookingType === 'share_transfer' && b.status === 'confirmed');
            const _hasPendingReport = _shareTransfBk && (!_shareTransfBk.bookingReportingStatus || _shareTransfBk.bookingReportingStatus === '');
            return <div style={{marginBottom:2,maxWidth:'100%'}}>
              <div title={'Transmis à ' + (_ownerName ? _capName(_ownerName) : 'autre collaborateur') + ' — lecture seule'} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'1px 5px',borderRadius:4,background:'#F9731614',border:'1px solid #F9731635',color:'#9A3412',fontSize:8,fontWeight:700,maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                🤝 Transmis à {_capName(_ownerName)}
              </div>
              {_hasPendingReport && (
                <div title="Reporting en attente du receveur" style={{display:'inline-flex',alignItems:'center',gap:2,marginLeft:4,padding:'0 4px',borderRadius:3,background:'#F59E0B14',color:'#92400E',fontSize:7,fontWeight:700,verticalAlign:'middle'}}>
                  ⏳ Reporting en attente
                </div>
              )}
            </div>;
          }
          if (_isOwner && _shared.filter(_id => _id && _id !== collab.id).length > 0) {
            const _firstSharerId = _shared.find(_id => _id && _id !== collab.id);
            const _sharerName = (collabs||[]).find(_c => _c.id === _firstSharerId)?.name || '';
            const _extra = _shared.filter(_id => _id && _id !== collab.id).length - 1;
            return <div title={'Transmis par ' + (_sharerName ? _capName(_sharerName) : 'un collaborateur') + (_extra > 0 ? ' (+' + _extra + ')' : '')} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'1px 5px',borderRadius:4,background:'#F9731614',border:'1px solid #F9731635',color:'#9A3412',fontSize:8,fontWeight:700,marginBottom:2,maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              🤝 Transmis par {_capName(_sharerName)}{_extra > 0 ? ' +' + _extra : ''}
            </div>;
          }
          return null;
        })()}
        <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:2}}>
          <div style={{flex:1,minWidth:0,fontSize:12,fontWeight:700,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{ct.firstname||ct.lastname?(ct.civility&&!ct.name.startsWith(ct.civility)?ct.civility+' ':'')+(ct.firstname?ct.firstname+' ':'')+(ct.lastname||''):ct.name}{ct.contact_type==='btb'?' 🏢':''}</div>
          <input type="checkbox" disabled={_isCardReadOnly} checked={_isPipeSel} onChange={e=>{if(_isCardReadOnly)return;e.stopPropagation();setPipeSelectedIds(p=>e.target.checked?[...p,ct.id]:p.filter(x=>x!==ct.id));}} onClick={e=>e.stopPropagation()} style={{cursor:_isCardReadOnly?'not-allowed':'pointer',accentColor:T.accent,width:13,height:13,flexShrink:0,opacity:_isCardReadOnly?0.4:1}} title={_isCardReadOnly?'Lecture seule (suivi RDV transmis ou contact géré par un autre collaborateur)':undefined}/>
        </div>
        {/* ── V6: Statut + température ── */}
        <div style={{marginBottom:3,display:'flex',alignItems:'center',gap:4}}>
          <select value={ct.pipeline_stage||'nouveau'} onClick={e=>e.stopPropagation()} disabled={ct.assignedTo && ct.assignedTo !== collab.id && !(collab?.role === 'admin' || collab?.role === 'supra' || isAdminView)} title={(ct.assignedTo && ct.assignedTo !== collab.id && !(collab?.role === 'admin' || collab?.role === 'supra' || isAdminView)) ? ('Géré par ' + ((collabs||[]).find(_c=>_c.id===ct.assignedTo)?.name || 'le propriétaire') + ' — lecture seule') : undefined} onChange={e=>{e.stopPropagation();const ns=e.target.value;if(ns===(ct.pipeline_stage||'nouveau'))return;handlePipelineStageChange(ct.id,ns);}} style={{padding:'1px 4px',borderRadius:4,fontSize:8,fontWeight:700,border:'1px solid '+(STAGES.find(s=>s.id===(ct.pipeline_stage||'nouveau'))?.color||T.border)+'80',background:(STAGES.find(s=>s.id===(ct.pipeline_stage||'nouveau'))?.color||'#ccc')+'12',color:STAGES.find(s=>s.id===(ct.pipeline_stage||'nouveau'))?.color||T.text,cursor:(ct.assignedTo && ct.assignedTo !== collab.id && !(collab?.role === 'admin' || collab?.role === 'supra' || isAdminView))?'not-allowed':'pointer',opacity:(ct.assignedTo && ct.assignedTo !== collab.id && !(collab?.role === 'admin' || collab?.role === 'supra' || isAdminView))?0.6:1,fontFamily:'inherit',outline:'none'}}>
            {STAGES.map(s=><option key={s.id} value={s.id}>{PIPELINE_LABELS[s.id]||s.label}</option>)}
          </select>
          <span style={{fontSize:7,fontWeight:800,padding:'1px 5px',borderRadius:4,background:_tempColor(ct._temp?.temp)+'18',color:_tempColor(ct._temp?.temp),flexShrink:0,letterSpacing:0.5}} title={'Score '+ct._temp?.conversion+'% — Engagement '+ct._temp?.engagement+'% · Réactivité '+ct._temp?.responsiveness+'% · Opportunité '+ct._temp?.opportunity+'% · Urgence '+ct._temp?.urgency+'% · Fatigue '+ct._temp?.fatigue+'%'}>{_tempEmoji(ct._temp?.temp)} {_tempLabel(ct._temp?.temp)}</span>
          {ct.pipeline_stage==='nrp'&&(()=>{try{const n=JSON.parse(ct.nrp_followups_json||'[]').filter(f=>f.done).length;return n>0?<span style={{fontSize:7,fontWeight:800,color:'#fff',padding:'1px 4px',borderRadius:3,background:'#EF4444'}}>x{n}</span>:null;}catch{return null;}})()}
        </div>
        {/* ── V6: Téléphone — idle / ready / calling ── */}
        {ct.phone && (()=>{
          const _isCalling = phoneActiveCall && (typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).number && ct.phone.replace(/\D/g,'').slice(-9) === ((typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).number||'').replace(/\D/g,'').slice(-9);
          const _isReady = !_isCalling && phoneDialNumber && ct.phone.replace(/\D/g,'').slice(-9) === (typeof phoneDialNumber!=='undefined'?phoneDialNumber:{}).replace(/\D/g,'').slice(-9) && !(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null);
          return _isCalling ? (
            <div style={{display:'flex',alignItems:'center',gap:4,padding:'4px 8px',borderRadius:8,background:'#22C55E12',border:'2px solid #22C55E50',marginBottom:3,animation:'pulse 2s infinite'}}>
              <div style={{width:6,height:6,borderRadius:3,background:'#22C55E',boxShadow:'0 0 6px #22C55E80',flexShrink:0}}/>
              <span style={{fontSize:10,fontWeight:700,color:'#22C55E',flex:1}}>En appel — {(()=>{const s=(typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)||0;return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');})()}</span>
              <div onClick={e=>{e.stopPropagation();endPhoneCall();}} style={{padding:'3px 8px',borderRadius:6,background:'#EF4444',color:'#fff',fontSize:9,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:3}} title="Raccrocher"><I n="phone-off" s={10}/> Raccrocher</div>
            </div>
          ) : _isReady ? (
            <div onClick={e=>{e.stopPropagation();const btn=document.querySelector('[data-dial-call-btn]');if(btn)btn.click();else if(typeof startVoipCall==='function')startVoipCall(ct.phone,ct);}} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 8px',borderRadius:8,background:'#3B82F610',border:'2px solid #3B82F640',marginBottom:3,cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background='#3B82F620'} onMouseLeave={e=>e.currentTarget.style.background='#3B82F610'}>
              <I n="phone" s={11} style={{color:'#3B82F6',flexShrink:0}}/>
              <span style={{fontSize:11,fontWeight:700,color:T.text,flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{displayPhone(ct.phone)}</span>
              <span style={{fontSize:8,fontWeight:700,color:'#3B82F6',padding:'1px 6px',borderRadius:4,background:'#3B82F615',flexShrink:0}}>Appeler</span>
              <div style={{width:22,height:22,borderRadius:11,background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 1px 4px #22C55E40'}}><I n="phone" s={11} style={{color:'#fff'}}/></div>
            </div>
          ) : (
            <div onClick={e=>{e.stopPropagation();setPhoneDialNumber(ct.phone);setPipelineRightContact(ct);}} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 6px',borderRadius:6,background:'#22C55E06',border:'1px solid #22C55E20',marginBottom:3,cursor:'pointer',transition:'all .12s'}} onMouseEnter={e=>e.currentTarget.style.background='#22C55E12'} onMouseLeave={e=>e.currentTarget.style.background='#22C55E06'}>
              <I n="phone" s={11} style={{color:'#22C55E',flexShrink:0}}/>
              <span style={{fontSize:11,fontWeight:700,color:T.text,flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{displayPhone(ct.phone)}</span>
              <div style={{width:22,height:22,borderRadius:11,background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 1px 4px #22C55E40'}} onClick={e=>{e.stopPropagation();setPhoneDialNumber(ct.phone);}} title="Préparer l'appel"><I n="phone" s={11} style={{color:'#fff'}}/></div>
            </div>
          );
        })()}
        {/* ── V5: Actions inline compact ── */}
        <div style={{display:'flex',gap:2,marginBottom:3}}>
          <div onClick={e=>{e.stopPropagation();setPipelineRightContact(ct);setPhoneRightTab('fiche');if(phoneRightCollapsed){(typeof setPhoneRightCollapsed==='function'?setPhoneRightCollapsed:function(){})(false);try{localStorage.setItem('c360-phone-right-collapsed-'+collab.id,'0');}catch{}}api('/api/data/pipeline-history?contactId='+ct.id).then(h=>setPipelinePopupHistory(h||[])).catch(()=>setPipelinePopupHistory([]));}} style={{flex:1,padding:'3px 0',textAlign:'center',borderRadius:5,background:T.accentBg,color:T.accent,fontSize:8,fontWeight:600,cursor:'pointer'}}>📄 Fiche</div>
          <div onClick={e=>{e.stopPropagation();const tm=new Date();tm.setDate(tm.getDate()+1);setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:tm.toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{flex:1,padding:'3px 0',textAlign:'center',borderRadius:5,background:'#7C3AED08',color:'#7C3AED',fontSize:8,fontWeight:600,cursor:'pointer'}}>📅 RDV</div>
          {ct.phone&&<div onClick={e=>{e.stopPropagation();setPipelineRightContact(ct);setPhoneRightTab('sms');}} style={{flex:1,padding:'3px 0',textAlign:'center',borderRadius:5,background:'#0EA5E908',color:'#0EA5E9',fontSize:8,fontWeight:600,cursor:'pointer'}}>💬 SMS</div>}
          {ct.email&&<div onClick={e=>{e.stopPropagation();window.open('mailto:'+ct.email);}} style={{flex:1,padding:'3px 0',textAlign:'center',borderRadius:5,background:T.bg,color:T.text3,fontSize:8,fontWeight:600,cursor:'pointer'}}>✉️</div>}
        </div>
        {/* ── V5: Alerte contextuelle (1 seule, la plus urgente) ── */}
        {_isRdvPasse2?<div style={{fontSize:8,fontWeight:800,padding:'2px 6px',borderRadius:4,background:'linear-gradient(135deg,#F97316,#EF4444)',color:'#fff',marginBottom:2}}>⚠️ RDV passé — Statuer</div>
        :ct.pipeline_stage==='nrp'&&ct.nrp_next_relance&&ct.nrp_next_relance<=new Date().toISOString().split('T')[0]?<div style={{fontSize:8,fontWeight:700,padding:'2px 6px',borderRadius:4,background:'#EF444410',color:'#EF4444',marginBottom:2}}>📞 Relancer</div>
        :!_isRdvPasse2&&ct.pipeline_stage==='rdv_programme'?(()=>{const bk=(bookings||[]).filter(b=>b.contactId===ct.id&&b.status==='confirmed').sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];if(!bk)return null;const diff=Math.round((new Date(bk.date+'T'+(bk.time||'00:00')).getTime()-Date.now())/60000);return diff>=0?<div style={{fontSize:8,fontWeight:700,padding:'2px 6px',borderRadius:4,background:diff<=60?'#F59E0B10':'#0EA5E910',color:diff<=60?'#F59E0B':'#0EA5E9',marginBottom:2}}>📅 {formatDateTime(bk.date, bk.time)}</div>:null;})()
        :daysSince>=14?<div style={{fontSize:8,fontWeight:700,padding:'2px 6px',borderRadius:4,background:daysSince>=30?'#EF4444':'#F59E0B',color:'#fff',marginBottom:2}}>⏰ {daysSince}j</div>
        :null}
        {/* ── V5: Note (1 ligne) ── */}
        {ct.notes&&<div style={{fontSize:8,color:T.text3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={ct.notes}>📝 {ct.notes.substring(0,40)}</div>}
      </div>);
    })}
    {stage.id==='nouveau'&&stageContacts.length>0&&<div onClick={()=>setShowNewContact(true)} style={{textAlign:'center',padding:'6px 8px',color:T.accent,fontSize:10,fontWeight:600,cursor:'pointer',borderRadius:8,border:`1px dashed ${T.accent}30`,marginTop:2}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><I n="plus" s={11}/> Nouveau contact</div>}
  </div>)}
</div>);
})}
      </div>
    </div>
  </div>);
})()}

{/* ─── 2d. CALENDRIER VIEW ─── */}
{phoneSubTab === 'calendrier' && (
  <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
<div style={{display:'flex',alignItems:'center',gap:10}}>
<div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#2563EB,#0EA5E9)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="calendar" s={18} style={{color:'#fff'}}/></div>
<div><div style={{fontSize:16,fontWeight:800}}>Calendrier</div><div style={{fontSize:12,color:T.text3}}>Vos rendez-vous et appels programmes</div></div>
</div>
<div onClick={()=>setPhoneSubTab('pipeline')} style={{width:32,height:32,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:`1px solid ${T.border}`}}><I n="x" s={16}/></div>
      </div>
      <div style={{flex:1,overflow:'auto',padding:16}}>
{(()=>{
const y=(typeof phoneCalMonth!=='undefined'?phoneCalMonth:{}).y; const m=(typeof phoneCalMonth!=='undefined'?phoneCalMonth:{}).m;
const firstDay=new Date(y,m,1).getDay()||7;
const daysInMonth=new Date(y,m+1,0).getDate();
const monthNames=['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
const today=new Date(); const todayStr=today.toISOString().split('T')[0];
const calBookings=(bookings||[]);
const scheduled=((typeof phoneScheduledCalls!=='undefined'?phoneScheduledCalls:null)||[]);
const callLogs=((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]);

const eventsForDay=(day)=>{
  const dateStr=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const dayBookings=bookings.filter(b=>(b.date||b.start||'').startsWith(dateStr));
  const dayScheduled=scheduled.filter(s=>s.date===dateStr);
  const dayCalls=callLogs.filter(cl=>(cl.createdAt||'').startsWith(dateStr));
  return {bookings:dayBookings,scheduled:dayScheduled,calls:dayCalls};
};

return(
<div>
  {/* Month navigation */}
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
    <div onClick={()=>setPhoneCalMonth(p=>{let nm=p.m-1,ny=p.y;if(nm<0){nm=11;ny--;}return{y:ny,m:nm};})} style={{width:32,height:32,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.surface,border:`1px solid ${T.border}`}}><I n="chevron-left" s={16}/></div>
    <div style={{fontSize:16,fontWeight:800}}>{monthNames[m]} {y}</div>
    <div onClick={()=>setPhoneCalMonth(p=>{let nm=p.m+1,ny=p.y;if(nm>11){nm=0;ny++;}return{y:ny,m:nm};})} style={{width:32,height:32,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.surface,border:`1px solid ${T.border}`}}><I n="chevron-right" s={16}/></div>
  </div>

  {/* Day headers */}
  <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}}>
    {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d=>(
      <div key={d} style={{textAlign:'center',fontSize:10,fontWeight:700,color:T.text3,padding:'4px 0'}}>{d}</div>
    ))}
  </div>

  {/* Calendar grid */}
  <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
    {Array.from({length:firstDay-1}).map((_,i)=><div key={'e'+i}/>)}
    {Array.from({length:daysInMonth}).map((_,i)=>{
      const day=i+1;
      const dateStr=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const isToday=dateStr===todayStr;
      const ev=eventsForDay(day);
      const hasEvents=ev.bookings.length>0||ev.scheduled.length>0||ev.calls.length>0;
      return(
      <div key={day} style={{aspectRatio:'1',borderRadius:8,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:hasEvents?'pointer':'default',background:isToday?'linear-gradient(135deg,#2563EB,#0EA5E9)':hasEvents?T.surface:'transparent',border:isToday?'none':`1px solid ${hasEvents?T.border:'transparent'}`,color:isToday?'#fff':T.text,transition:'all .12s',position:'relative'}} onMouseEnter={e=>{if(!isToday&&hasEvents)e.currentTarget.style.background=T.accentBg;}} onMouseLeave={e=>{if(!isToday)e.currentTarget.style.background=hasEvents?T.surface:'transparent';}}>
        <span style={{fontSize:13,fontWeight:isToday?800:hasEvents?700:500}}>{day}</span>
        {hasEvents && (
          <div style={{display:'flex',gap:2,marginTop:2}}>
            {ev.bookings.length>0&&<div style={{width:5,height:5,borderRadius:3,background:isToday?'#fff':'#2563EB'}}/>}
            {ev.scheduled.length>0&&<div style={{width:5,height:5,borderRadius:3,background:isToday?'#ffffffcc':'#F59E0B'}}/>}
            {ev.calls.length>0&&<div style={{width:5,height:5,borderRadius:3,background:isToday?'#ffffff80':'#22C55E'}}/>}
          </div>
        )}
      </div>);
    })}
  </div>

  {/* Legend */}
  <div style={{display:'flex',gap:12,marginTop:12,justifyContent:'center'}}>
    {[{c:'#2563EB',l:'RDV'},{c:'#F59E0B',l:'Appels programmes'},{c:'#22C55E',l:'Appels passes'}].map(x=>(
      <div key={x.l} style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:8,height:8,borderRadius:4,background:x.c}}/><span style={{fontSize:10,color:T.text3}}>{x.l}</span></div>
    ))}
  </div>

  {/* Today's events */}
  <div style={{marginTop:16}}>
    <div style={{fontSize:13,fontWeight:700,marginBottom:8,display:'flex',alignItems:'center',gap:6}}><I n="clock" s={14} style={{color:'#2563EB'}}/> Aujourd'hui</div>
    {(()=>{
      const ev=eventsForDay(today.getDate());
      const items=[];
      ev.bookings.forEach(b=>items.push({type:'rdv',time:b.time||b.start?.split('T')[1]?.slice(0,5)||'',label:b.clientName||b.serviceName||'RDV',color:'#2563EB'}));
      ev.scheduled.forEach(s=>{const ct=(contacts||[]).find(c=>c.id===s.contactId);items.push({type:'scheduled',time:s.time||'',label:'Appel: '+(ct?.name||s.number||''),color:'#F59E0B'});});
      ev.calls.forEach(cl=>{let ct=cl.contactId?(contacts||[]).find(c=>c.id===cl.contactId):null;if(!ct){const ph=((cl.direction==='outbound'?cl.toNumber:cl.fromNumber)||'').replace(/[^\d]/g,'').slice(-9);if(ph.length>=9)ct=(contacts||[]).find(c=>{const cp=(c.phone||c.mobile||'').replace(/[^\d]/g,'').slice(-9);return cp&&cp===ph;});}items.push({type:'call',time:cl.createdAt?new Date(cl.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'',label:(ct?.name||fmtPhone(cl.direction==='outbound'?cl.toNumber:cl.fromNumber)||'Inconnu')+(cl.duration?' · '+fmtDur(cl.duration):''),color:cl.status==='missed'||cl.status==='no-answer'?'#EF4444':'#22C55E'});});
      items.sort((a,b)=>a.time.localeCompare(b.time));
      if(items.length===0) return <div style={{textAlign:'center',padding:16,color:T.text3,fontSize:11}}>Aucun evenement aujourd'hui</div>;
      return items.map((it,i)=>(
        <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:8,background:T.surface,marginBottom:4,borderLeft:`3px solid ${it.color}`}}>
          <span style={{fontSize:12,fontWeight:700,color:it.color,minWidth:38}}>{it.time}</span>
          <span style={{fontSize:12,color:T.text}}>{it.label}</span>
        </div>
      ));
    })()}
  </div>
</div>);
})()}
      </div>
    </div>
  </div>
)}

{/* ─── 3. SMS HUB — Tour de contrôle SMS ─── */}
{phoneSubTab === 'sms' && (()=>{
  if (!_T.smsHub) _T.smsHub = { selectedConvId:null, filter:'all', search:'', events:[], eventsLoading:false, composeText:'', bulkModalOpen:false, bulkSelectedContacts:[], bulkMessage:'', bulkSending:false, bulkProgress:0, bulkSearch:'', bulkStageFilter:'' };
  const hub = _T.smsHub;
  const _rerender = () => setPhoneRightAccordion(p=>({...p,_smsHubR:Date.now()}));
  const todayStr = new Date().toISOString().split('T')[0];
  const allSmsConvs = ((typeof appConversations!=='undefined'?appConversations:null)||[]).filter(c=>(c.lastEventType||'').includes('sms')||c.unreadCount>0);
  const totalUnread = allSmsConvs.reduce((s,c)=>s+(c.unreadCount||0),0);
  const sentToday = allSmsConvs.filter(c=>c.lastEventType==='sms_out'&&(c.lastActivityAt||'').startsWith(todayStr)).length;
  const recvToday = allSmsConvs.filter(c=>c.lastEventType==='sms_in'&&(c.lastActivityAt||'').startsWith(todayStr)).length;

  // Filtered conversations
  const _weekAgo = new Date(Date.now()-7*86400000).toISOString().split('T')[0];
  const _monthAgo = new Date(Date.now()-30*86400000).toISOString().split('T')[0];
  let filteredConvs = [...allSmsConvs];
  if(hub.filter==='unread') filteredConvs = filteredConvs.filter(c=>c.unreadCount>0);
  if(hub.filter==='today') filteredConvs = filteredConvs.filter(c=>(c.lastActivityAt||'').startsWith(todayStr));
  if(hub.filter==='sent_today') filteredConvs = filteredConvs.filter(c=>c.lastEventType==='sms_out'&&(c.lastActivityAt||'').startsWith(todayStr));
  if(hub.filter==='recv_today') filteredConvs = filteredConvs.filter(c=>c.lastEventType==='sms_in'&&(c.lastActivityAt||'').startsWith(todayStr));
  if(hub.filter==='no_reply') filteredConvs = filteredConvs.filter(c=>c.lastEventType==='sms_out'&&!c.unreadCount);
  if(hub.filter==='week') filteredConvs = filteredConvs.filter(c=>(c.lastActivityAt||'')>=_weekAgo);
  if(hub.filter==='month') filteredConvs = filteredConvs.filter(c=>(c.lastActivityAt||'')>=_monthAgo);
  if(hub.search){ const q=hub.search.toLowerCase(); filteredConvs = filteredConvs.filter(c=>(c.contactName||c.clientPhone||'').toLowerCase().includes(q)||(c.clientPhone||'').includes(q)||(c.lastEventPreview||'').toLowerCase().includes(q)); }
  filteredConvs.sort((a,b)=>new Date(b.lastActivityAt||0)-new Date(a.lastActivityAt||0));

  const selectedConv = hub.selectedConvId && hub.selectedConvId!=='__new__' ? allSmsConvs.find(c=>c.id===hub.selectedConvId) : null;
  const selectedContact = selectedConv ? contacts.find(c=>c.id===selectedConv.contactId||(c.phone||'').replace(/\D/g,'').slice(-9)===(selectedConv.clientPhone||'').replace(/\D/g,'').slice(-9)) : null;

  // Load events helper
  const loadConvEvents = (convId) => {
    hub.eventsLoading=true; hub.events=[]; _rerender();
    api('/api/conversations/'+convId+'/events').then(d=>{
      hub.events=Array.isArray(d)?d:(d?.events||[]);
      hub.eventsLoading=false; _rerender();
      setTimeout(()=>{const el=document.getElementById('smsHubMsgEnd');if(el)el.scrollIntoView({behavior:'smooth'});},120);
    }).catch(()=>{hub.eventsLoading=false;_rerender();});
  };

  // Send in conversation
  const sendInConv = (convId, text) => {
    if(!text.trim()) return;
    api('/api/conversations/'+convId+'/sms',{method:'POST',body:{content:text.trim(),collaboratorId:collab.id}}).then(r=>{
      if(r?.success||r?.sms?.success){
showNotif('SMS envoyé ✓');
hub.composeText='';
loadConvEvents(convId);
if(_T.smsCache) Object.keys(_T.smsCache).forEach(k=>delete _T.smsCache[k]);
api('/api/conversations?companyId='+company.id).then(d=>{if(Array.isArray(d))setAppConversations(d);}).catch(()=>{});
      } else showNotif(r?.error||'Erreur envoi','danger');
    }).catch(()=>showNotif('Erreur envoi SMS','danger'));
  };

  const _timeAgo = (d) => { if(!d) return ''; const diff=Math.floor((Date.now()-new Date(d).getTime())/1000); if(diff<60) return 'maintenant'; if(diff<3600) return Math.floor(diff/60)+'m'; if(diff<86400) return Math.floor(diff/3600)+'h'; return new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}); };
  const _fmtPhone = (p) => { if(!p) return ''; try{ return displayPhone(p); }catch{ return p; } };

  const _myTwNums = ((typeof appMyPhoneNumbers!=='undefined'?appMyPhoneNumbers:null)||[]).filter(pn=>pn.collaboratorId===collab.id&&pn.status==='assigned'&&pn.smsCapable);

  // Bulk SMS filtered contacts (by pipeline stage + search)
  const _bulkFiltered = contacts.filter(c=>c.phone).filter(c=>{
    if(hub.bulkStageFilter && (c.pipeline_stage||'nouveau')!==hub.bulkStageFilter) return false;
    if(hub.bulkSearch){ const q=hub.bulkSearch.toLowerCase(); return (c.name||'').toLowerCase().includes(q)||(c.phone||'').includes(q); }
    return true;
  });

  // Zoom control
  const _zoomKey='c360-sms-hub-zoom';
  if(!hub._zoom){try{hub._zoom=parseFloat(localStorage.getItem(_zoomKey))||90;}catch{hub._zoom=90;}}
  const zoomPct=hub._zoom;
  const setZoom=(v)=>{hub._zoom=Math.max(50,Math.min(120,v));try{localStorage.setItem(_zoomKey,String(hub._zoom));}catch{}_rerender();};

  return <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>

    {/* ═══ HEADER STATS BANNER ═══ */}
    <div style={{flexShrink:0,background:'linear-gradient(135deg,#0EA5E9,#2563EB)',padding:'8px 16px',display:'flex',alignItems:'center',gap:10}}>
      <I n="message-circle" s={15} style={{color:'#fff',flexShrink:0}}/>
      <span style={{fontSize:13,fontWeight:800,color:'#fff',flexShrink:0}}>SMS Hub</span>
      <div style={{flex:1,display:'flex',gap:5,alignItems:'center',overflow:'hidden',flexWrap:'nowrap'}}>
{[
{label:'Crédits',value:(typeof smsCredits!=='undefined'?smsCredits:null)??'—',color:'#F59E0B',filterId:null},
{label:'Non lus',value:totalUnread,color:'#EF4444',filterId:'unread'},
{label:'Envoyés',value:sentToday,color:'#22C55E',filterId:'sent_today'},
{label:'Reçus',value:recvToday,color:'#8B5CF6',filterId:'recv_today'},
{label:'Sans rép.',value:allSmsConvs.filter(c=>c.lastEventType==='sms_out'&&!c.unreadCount).length,color:'#F97316',filterId:'no_reply'},
].map(s=><div key={s.label} onClick={()=>{if(s.filterId){hub.filter=hub.filter===s.filterId?'all':s.filterId;_rerender();}}} style={{display:'flex',alignItems:'center',gap:3,padding:'3px 8px',borderRadius:6,background:hub.filter===s.filterId?'rgba(255,255,255,.35)':'rgba(255,255,255,.12)',cursor:s.filterId?'pointer':'default',border:hub.filter===s.filterId?'1px solid rgba(255,255,255,.5)':'1px solid transparent',flexShrink:0}}>
<span style={{fontSize:13,fontWeight:800,color:'#fff'}}>{s.value}</span>
<span style={{fontSize:8,color:'rgba(255,255,255,.65)'}}>{s.label}</span>
</div>)}
      </div>
      {/* Zoom control */}
      <div style={{display:'flex',alignItems:'center',gap:3,padding:'2px 6px',borderRadius:6,background:'rgba(255,255,255,.12)',flexShrink:0}}>
<div onClick={()=>setZoom(zoomPct-10)} style={{width:18,height:18,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'rgba(255,255,255,.15)',color:'#fff',fontSize:12,fontWeight:700}}>−</div>
<span style={{fontSize:9,color:'#fff',fontWeight:600,minWidth:28,textAlign:'center'}}>{zoomPct}%</span>
<div onClick={()=>setZoom(zoomPct+10)} style={{width:18,height:18,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'rgba(255,255,255,.15)',color:'#fff',fontSize:12,fontWeight:700}}>+</div>
      </div>
      <div onClick={()=>{hub.selectedConvId='__new__';hub.events=[];_rerender();}} style={{padding:'4px 10px',borderRadius:6,background:'rgba(255,255,255,.2)',color:'#fff',fontSize:10,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:3,border:'1px solid rgba(255,255,255,.3)',flexShrink:0}}><I n="plus" s={10}/> Nouveau</div>
      <div onClick={()=>{hub.bulkModalOpen=true;hub.bulkSelectedContacts=[];hub.bulkMessage='';hub.bulkSending=false;hub.bulkProgress=0;hub.bulkSearch='';_rerender();}} style={{padding:'4px 10px',borderRadius:6,background:'rgba(255,255,255,.2)',color:'#fff',fontSize:10,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:3,border:'1px solid rgba(255,255,255,.3)',flexShrink:0}}><I n="users" s={10}/> Groupé</div>
      <div onClick={()=>setPhoneSubTab('pipeline')} style={{width:24,height:24,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'rgba(255,255,255,.15)',flexShrink:0}}><I n="x" s={12} style={{color:'#fff'}}/></div>
    </div>

    {/* ═══ MAIN BODY — 2 columns with zoom ═══ */}
    <div style={{flex:1,display:'flex',overflow:'hidden',zoom:(zoomPct/100),transition:'zoom .15s'}}>

      {/* ── LEFT: Conversation List ── */}
      <div style={{width:300,flexShrink:0,borderRight:'1px solid '+T.border,display:'flex',flexDirection:'column',background:T.surface}}>
{/* Filter pills */}
<div style={{padding:'8px 10px',borderBottom:'1px solid '+T.border,display:'flex',gap:3,flexWrap:'wrap'}}>
{[{id:'all',label:'Tous'},{id:'unread',label:'Non lus',badge:totalUnread},{id:'today',label:"Aujourd'hui"},{id:'sent_today',label:'Envoyés'},{id:'recv_today',label:'Reçus'},{id:'no_reply',label:'Sans réponse'},{id:'week',label:'7 jours'},{id:'month',label:'30 jours'}].map(f=>
  <div key={f.id} onClick={()=>{hub.filter=f.id;_rerender();}} style={{padding:'3px 8px',borderRadius:6,fontSize:9,fontWeight:hub.filter===f.id?700:500,cursor:'pointer',background:hub.filter===f.id?T.accentBg:'transparent',color:hub.filter===f.id?T.accent:T.text3,border:'1px solid '+(hub.filter===f.id?T.accent+'40':'transparent'),transition:'all .12s'}}>{f.label}{f.badge>0?' ('+f.badge+')':''}</div>
)}
</div>
{/* Search */}
<div style={{padding:'6px 10px',borderBottom:'1px solid '+T.border}}>
<div style={{position:'relative'}}>
  <I n="search" s={12} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:T.text3}}/>
  <input value={hub.search||''} onChange={e=>{hub.search=e.target.value;_rerender();}} placeholder="Rechercher..." style={{width:'100%',padding:'6px 8px 6px 28px',borderRadius:6,border:'1px solid '+T.border,background:T.bg,fontSize:10,color:T.text,outline:'none',fontFamily:'inherit'}}/>
  {hub.search && <div onClick={()=>{hub.search='';_rerender();}} style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',cursor:'pointer',fontSize:10,color:T.text3}}>×</div>}
</div>
</div>
{/* Conversation items */}
<div style={{flex:1,overflowY:'auto'}}>
{filteredConvs.length===0 && <div style={{textAlign:'center',padding:24,fontSize:11,color:T.text3}}>Aucune conversation SMS</div>}
{filteredConvs.map(conv=>{
  const ct = contacts.find(c=>c.id===conv.contactId||(c.phone||'').replace(/\D/g,'').slice(-9)===(conv.clientPhone||'').replace(/\D/g,'').slice(-9));
  const isActive = hub.selectedConvId===conv.id;
  return <div key={conv.id} onClick={()=>{
    hub.selectedConvId=conv.id;hub.composeText='';_rerender();
    loadConvEvents(conv.id);
    if(conv.unreadCount>0){api('/api/conversations/'+conv.id+'/read',{method:'PUT'}).catch(()=>{});setAppConversations(prev=>prev.map(c=>c.id===conv.id?{...c,unreadCount:0}:c));}
  }} style={{padding:'10px 12px',borderBottom:'1px solid '+T.border,cursor:'pointer',display:'flex',gap:10,alignItems:'flex-start',background:isActive?T.accentBg+'20':'transparent',borderLeft:isActive?'3px solid '+T.accent:'3px solid transparent',transition:'all .12s'}} onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=T.bg;}} onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background='transparent';}}>
    <div style={{width:36,height:36,borderRadius:10,background:T.accent+'18',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:12,fontWeight:700,color:T.accent}}>{(ct?.name||conv.contactName||'?')[0]?.toUpperCase()}</div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
        <span style={{fontSize:11,fontWeight:conv.unreadCount>0?700:600,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:150}}>{ct?.name||conv.contactName||_fmtPhone(conv.clientPhone)}</span>
        <span style={{fontSize:8,color:T.text3,flexShrink:0}}>{_timeAgo(conv.lastActivityAt)}</span>
      </div>
      <div style={{fontSize:9,color:T.text3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{_fmtPhone(conv.clientPhone)}</div>
      <div style={{fontSize:10,color:conv.unreadCount>0?T.text:T.text3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:2,fontWeight:conv.unreadCount>0?600:400}}>{conv.lastEventPreview||'—'}</div>
    </div>
    {conv.unreadCount>0 && <div style={{width:18,height:18,borderRadius:9,background:'#EF4444',color:'#fff',fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{conv.unreadCount}</div>}
  </div>;
})}
</div>
      </div>

      {/* ── CENTER: Conversation Detail ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

{/* State A: No selection */}
{!hub.selectedConvId && <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,color:T.text3}}>
<div style={{width:64,height:64,borderRadius:16,background:T.accentBg,display:'flex',alignItems:'center',justifyContent:'center'}}><I n="message-circle" s={28} style={{color:T.accent}}/></div>
<div style={{fontSize:14,fontWeight:700,color:T.text}}>Sélectionnez une conversation</div>
<div style={{fontSize:11}}>Choisissez une conversation dans la liste ou envoyez un nouveau SMS</div>
</div>}

{/* State B: New SMS compose */}
{hub.selectedConvId==='__new__' && <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div style={{padding:'12px 20px',borderBottom:'1px solid '+T.border,display:'flex',alignItems:'center',gap:10}}>
  <div onClick={()=>{hub.selectedConvId=null;_rerender();}} style={{cursor:'pointer'}}><I n="arrow-left" s={16} style={{color:T.text3}}/></div>
  <I n="edit-3" s={16} style={{color:T.accent}}/>
  <span style={{fontSize:14,fontWeight:700}}>Nouveau SMS</span>
</div>
<div style={{flex:1,overflow:'auto',padding:20}}>
  <div style={{marginBottom:16}}>
    <label style={{display:'block',fontSize:11,fontWeight:600,color:T.text3,marginBottom:4}}>Destinataire</label>
    <div style={{position:'relative'}}>
      <I n="phone" s={12} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:T.text3}}/>
      <input value={phoneDialNumber} onChange={e=>(typeof setPhoneDialNumber==='function'?setPhoneDialNumber:function(){})(e.target.value)} placeholder="+33 6 XX XX XX XX" style={{width:'100%',padding:'8px 10px 8px 30px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,fontSize:12,color:T.text,outline:'none',fontFamily:'inherit'}}/>
    </div>
    {(typeof phoneDialNumber!=='undefined'?phoneDialNumber:{}).length>=2 && <div style={{marginTop:4,display:'flex',gap:4,flexWrap:'wrap'}}>
      {contacts.filter(c=>c.phone&&((c.name||'').toLowerCase().includes((typeof phoneDialNumber!=='undefined'?phoneDialNumber:{}).toLowerCase())||(c.phone||'').includes(phoneDialNumber))).slice(0,5).map(c=>
        <div key={c.id} onClick={()=>setPhoneDialNumber(c.phone)} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:6,background:T.bg,border:'1px solid '+T.border,cursor:'pointer',fontSize:10}}><Avatar name={c.name} color={T.accent} s={16}/> {c.name}</div>
      )}
    </div>}
  </div>
  <div style={{marginBottom:16}}>
    <label style={{display:'block',fontSize:11,fontWeight:600,color:T.text3,marginBottom:4}}>Message</label>
    <textarea value={phoneSMSText} onChange={e=>(typeof setPhoneSMSText==='function'?setPhoneSMSText:function(){})(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!phoneDialNumber||!(typeof phoneSMSText!=='undefined'?phoneSMSText:{}).trim()){showNotif('Numéro et message requis','danger');return;}const targetPhone=(typeof phoneDialNumber!=='undefined'?phoneDialNumber:{}).replace(/\s/g,'');api('/api/sms/send',{method:'POST',body:{to:targetPhone,content:(typeof phoneSMSText!=='undefined'?phoneSMSText:{}).trim(),contactId:(contacts.find(c=>(c.phone||'').replace(/\D/g,'').slice(-9)===targetPhone.replace(/\D/g,'').slice(-9))||{}).id||''}}).then(r=>{if(r?.success){showNotif('SMS envoyé ✓');(typeof setPhoneSMSText==='function'?setPhoneSMSText:function(){})('');if(_T.smsCache)Object.keys(_T.smsCache).forEach(k=>delete _T.smsCache[k]);api('/api/conversations?companyId='+company.id).then(d=>{if(Array.isArray(d)){setAppConversations(d);const conv=d.find(c=>(c.clientPhone||'').replace(/\D/g,'').slice(-9)===targetPhone.replace(/\D/g,'').slice(-9));if(conv){hub.selectedConvId=conv.id;loadConvEvents(conv.id);}}}).catch(()=>{});}else showNotif(r?.error||'Erreur','danger');}).catch(()=>showNotif('Erreur envoi','danger'));}}} placeholder="Votre message SMS... (Entrée pour envoyer)" rows={4} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,fontSize:12,color:T.text,outline:'none',resize:'vertical',fontFamily:'inherit'}}/>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
      <span style={{fontSize:9,color:T.text3}}>{(typeof phoneSMSText!=='undefined'?phoneSMSText:{}).length}/160 · {Math.ceil(((typeof phoneSMSText!=='undefined'?phoneSMSText:{}).length||1)/160)} SMS</span>
      <span style={{fontSize:8,color:T.text3,opacity:.7}}>Entrée pour envoyer · Shift+Entrée retour ligne</span>
    </div>
  </div>
  <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:12}}>
    {["Bonjour, votre RDV est confirmé pour demain.","Rappel : votre rendez-vous est prévu aujourd'hui.","Merci pour votre visite !","Votre RDV a été annulé. Contactez-nous."].map((t,i)=>
      <div key={i} onClick={()=>setPhoneSMSText(t)} style={{padding:'4px 8px',borderRadius:6,background:T.bg,border:'1px solid '+T.border,fontSize:9,cursor:'pointer',color:T.text2}} title={t}>{t.substring(0,35)}...</div>
    )}
  </div>
  <Btn primary onClick={()=>{
    if(!(typeof phoneDialNumber!=='undefined'?phoneDialNumber:null)||!(typeof phoneSMSText!=='undefined'?phoneSMSText:{}).trim()){showNotif('Numéro et message requis','danger');return;}
    const targetPhone=(typeof phoneDialNumber!=='undefined'?phoneDialNumber:{}).replace(/\s/g,'');
    api('/api/sms/send',{method:'POST',body:{to:targetPhone,content:(typeof phoneSMSText!=='undefined'?phoneSMSText:{}).trim(),contactId:(contacts.find(c=>(c.phone||'').replace(/\D/g,'').slice(-9)===targetPhone.replace(/\D/g,'').slice(-9))||{}).id||''}}).then(r=>{
      if(r?.success){showNotif('SMS envoyé ✓');setPhoneSMSText('');if(_T.smsCache)Object.keys(_T.smsCache).forEach(k=>delete _T.smsCache[k]);api('/api/conversations?companyId='+company.id).then(d=>{if(Array.isArray(d)){setAppConversations(d);const conv=d.find(c=>(c.clientPhone||'').replace(/\D/g,'').slice(-9)===targetPhone.replace(/\D/g,'').slice(-9));if(conv){hub.selectedConvId=conv.id;loadConvEvents(conv.id);}}}).catch(()=>{});}else showNotif(r?.error||'Erreur','danger');
    }).catch(()=>showNotif('Erreur envoi','danger'));
  }} style={{width:'100%',justifyContent:'center'}}><I n="send" s={14}/> Envoyer le SMS</Btn>
</div>
</div>}

{/* State C: Conversation selected */}
{hub.selectedConvId && hub.selectedConvId!=='__new__' && <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
{/* Header */}
<div style={{padding:'10px 16px',borderBottom:'1px solid '+T.border,display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
  <div onClick={()=>{hub.selectedConvId=null;hub.events=[];_rerender();}} style={{cursor:'pointer',padding:4}}><I n="arrow-left" s={16} style={{color:T.text3}}/></div>
  <div style={{width:32,height:32,borderRadius:8,background:T.accent+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:T.accent}}>{(selectedContact?.name||selectedConv?.contactName||'?')[0]?.toUpperCase()}</div>
  <div style={{flex:1}}>
    <div style={{fontSize:12,fontWeight:700,color:T.text}}>{selectedContact?.name||selectedConv?.contactName||_fmtPhone(selectedConv?.clientPhone)}</div>
    <div style={{fontSize:10,color:T.text3}}>{_fmtPhone(selectedConv?.clientPhone)}</div>
  </div>
  <div style={{display:'flex',gap:4}}>
    <div onClick={()=>{if(selectedConv?.clientPhone){setPhoneDialNumber(selectedConv.clientPhone);setPhoneSubTab('pipeline');}}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#22C55E12',border:'1px solid #22C55E30'}} title="Appeler"><I n="phone" s={12} style={{color:'#22C55E'}}/></div>
    {selectedContact && <div onClick={()=>{setPipelineRightContact(selectedContact);setPhoneRightCollapsed(false);}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.accentBg,border:'1px solid '+T.accent+'30'}} title="Fiche contact"><I n="user" s={12} style={{color:T.accent}}/></div>}
  </div>
</div>
{/* Messages */}
<div style={{flex:1,overflowY:'auto',padding:'12px 16px'}} id="smsHubMsgScroll">
  {hub.eventsLoading && <div style={{textAlign:'center',padding:20,fontSize:11,color:T.text3}}>Chargement...</div>}
  {!hub.eventsLoading && hub.events.filter(ev=>ev.type==='sms_in'||ev.type==='sms_out').length===0 && <div style={{textAlign:'center',padding:20,fontSize:11,color:T.text3}}>Aucun SMS dans cette conversation</div>}
  {(()=>{
    const smsEvts = hub.events.filter(ev=>ev.type==='sms_in'||ev.type==='sms_out');
    let lastDate = '';
    return smsEvts.map((ev,i)=>{
      const isOut = ev.type==='sms_out';
      const evDate = (ev.createdAt||'').split('T')[0];
      const showDateSep = evDate!==lastDate;
      lastDate = evDate;
      return <div key={ev.id||i}>
        {showDateSep && <div style={{textAlign:'center',margin:'12px 0 8px',fontSize:9,color:T.text3,fontWeight:600}}>{new Date(evDate).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}</div>}
        <div style={{display:'flex',flexDirection:'column',alignItems:isOut?'flex-end':'flex-start',marginBottom:6}}>
          <div style={{maxWidth:'80%',padding:'8px 12px',borderRadius:isOut?'12px 12px 3px 12px':'12px 12px 12px 3px',background:isOut?'#2563EB':'#E5E7EB',color:isOut?'#fff':'#1F2937',fontSize:11,lineHeight:1.5,wordBreak:'break-word'}}>{ev.content}</div>
          <div style={{fontSize:8,color:T.text3,marginTop:2,display:'flex',gap:4,alignItems:'center'}}>
            {new Date(ev.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
            {ev.status && <span style={{color:ev.status==='sent'||ev.status==='delivered'?'#22C55E':ev.status==='failed'?'#EF4444':'#F59E0B'}}>{ev.status}</span>}
          </div>
        </div>
      </div>;
    });
  })()}
  <div id="smsHubMsgEnd"/>
</div>
{/* Compose — zone de rédaction grande fond blanc */}
<div style={{flexShrink:0,borderTop:'2px solid #E5E7EB',padding:'14px 20px 16px',background:'#FFFFFF',boxShadow:'0 -4px 12px rgba(0,0,0,.08)'}}>
  {/* Templates rapides cliquables */}
  {(()=>{
    // V3: templates volatiles — plus de localStorage
    if(!_T.smsHubTpls) _T.smsHubTpls=[
      "Bonjour, je reviens vers vous concernant votre demande. Pouvez-vous me rappeler ?",
      "Bonjour, votre RDV est confirmé. A bientôt !",
      "Rappel : votre rendez-vous est prévu aujourd'hui. Merci de confirmer.",
      "Bonjour, je n'ai pas réussi à vous joindre. Quand êtes-vous disponible ?",
      "Merci pour notre échange. N'hésitez pas si vous avez des questions.",
    ];
    const saveTpls = () => { /* V3: volatile only — no persist */ };
    return <div style={{marginBottom:10}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
        <span style={{fontSize:10,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:.5}}>Templates rapides</span>
        <div onClick={()=>{const t=prompt('Nouveau template SMS :');if(t&&t.trim()){_T.smsHubTpls.push(t.trim());saveTpls();_rerender();}}} style={{fontSize:10,color:'#2563EB',cursor:'pointer',fontWeight:600,display:'flex',alignItems:'center',gap:3}}><I n="plus" s={10}/> Ajouter</div>
      </div>
      <div style={{display:'flex',gap:5,flexWrap:'wrap',maxHeight:56,overflowY:'auto'}}>
        {_T.smsHubTpls.map((t,i)=>
          <div key={i} style={{display:'flex',alignItems:'center',gap:3,padding:'4px 10px',borderRadius:6,background:'#F3F4F6',border:'1px solid #E5E7EB',fontSize:10,cursor:'pointer',color:'#374151',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={t}>
            <span onClick={()=>{hub.composeText=t;_rerender();}} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.substring(0,35)}{t.length>35?'...':''}</span>
            <span onClick={(e)=>{e.stopPropagation();if(confirm('Supprimer ce template ?')){_T.smsHubTpls.splice(i,1);saveTpls();_rerender();}}} style={{color:'#9CA3AF',cursor:'pointer',fontSize:12,marginLeft:2,flexShrink:0}}>×</span>
          </div>
        )}
      </div>
    </div>;
  })()}
  {/* Zone de saisie grande */}
  <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
    <div style={{flex:1}}>
      <textarea value={hub.composeText||''} onChange={e=>{hub.composeText=e.target.value;_rerender();}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendInConv(hub.selectedConvId,hub.composeText||'');}}} placeholder="Écrivez votre SMS ici... (Entrée pour envoyer)" rows={4} style={{width:'100%',padding:'12px 14px',borderRadius:12,border:'2px solid #E5E7EB',background:'#FAFAFA',fontSize:13,color:'#1F2937',outline:'none',resize:'none',fontFamily:'inherit',lineHeight:1.5,transition:'border-color .15s'}} onFocus={e=>e.target.style.borderColor='#2563EB'} onBlur={e=>e.target.style.borderColor='#E5E7EB'}/>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
        <span style={{fontSize:10,color:'#9CA3AF'}}>{(hub.composeText||'').length}/160 · {Math.ceil(((hub.composeText||'').length||1)/160)} SMS</span>
        <span style={{fontSize:9,color:'#D1D5DB'}}>Entrée pour envoyer · Shift+Entrée retour ligne</span>
      </div>
    </div>
    <div onClick={()=>sendInConv(hub.selectedConvId,hub.composeText||'')} style={{width:58,height:58,borderRadius:14,background:'linear-gradient(135deg,#2563EB,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,boxShadow:'0 3px 10px rgba(37,99,235,.3)',transition:'transform .1s',alignSelf:'flex-start'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.05)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}><I n="send" s={22} style={{color:'#fff'}}/></div>
  </div>
</div>
</div>}

      </div>
    </div>

    {/* ═══ BULK SMS MODAL ═══ */}
    {hub.bulkModalOpen && <Modal open={true} onClose={()=>{hub.bulkModalOpen=false;_rerender();}} title="SMS Groupé" width={700}>
      <div style={{maxHeight:'70vh',overflowY:'auto'}}>
{/* Contact selection with pipeline column filter */}
<div style={{marginBottom:16}}>
<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
  <span style={{fontSize:12,fontWeight:700}}>Sélectionner les contacts</span>
  <div style={{display:'flex',gap:8}}>
    <span onClick={()=>{hub.bulkSelectedContacts=_bulkFiltered.map(c=>c.id);_rerender();}} style={{fontSize:10,color:T.accent,cursor:'pointer',fontWeight:600}}>Tout cocher</span>
    <span onClick={()=>{hub.bulkSelectedContacts=[];_rerender();}} style={{fontSize:10,color:T.text3,cursor:'pointer'}}>Tout décocher</span>
  </div>
</div>
{/* Pipeline column filter */}
{(()=>{
  const stages = pipelineStages && (typeof pipelineStages!=='undefined'?pipelineStages:{}).length > 0 ? pipelineStages : [{id:'nouveau',label:'Nouveau'},{id:'contacte',label:'En discussion'},{id:'qualifie',label:'Intéressé'},{id:'rdv_programme',label:'RDV Programmé'},{id:'proposition',label:'Proposition'},{id:'negociation',label:'Négociation'},{id:'client_valide',label:'Client Validé'},{id:'nrp',label:'NRP'},{id:'perdu',label:'Perdu'}];
  return <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:8}}>
    <div onClick={()=>{hub.bulkStageFilter='';_rerender();}} style={{padding:'3px 10px',borderRadius:6,fontSize:10,fontWeight:!hub.bulkStageFilter?700:500,cursor:'pointer',background:!hub.bulkStageFilter?T.accentBg:'transparent',color:!hub.bulkStageFilter?T.accent:T.text3,border:'1px solid '+(!hub.bulkStageFilter?T.accent+'40':'transparent')}}>Tous</div>
    {stages.map(st=>{
      const count = contacts.filter(c=>c.phone&&(c.pipeline_stage||'nouveau')===st.id).length;
      if(count===0) return null;
      return <div key={st.id} onClick={()=>{hub.bulkStageFilter=hub.bulkStageFilter===st.id?'':st.id;_rerender();}} style={{padding:'3px 10px',borderRadius:6,fontSize:10,fontWeight:hub.bulkStageFilter===st.id?700:500,cursor:'pointer',background:hub.bulkStageFilter===st.id?(st.color||T.accent)+'18':'transparent',color:hub.bulkStageFilter===st.id?(st.color||T.accent):T.text3,border:'1px solid '+(hub.bulkStageFilter===st.id?(st.color||T.accent)+'40':'transparent')}}>{st.label} <span style={{fontSize:9,opacity:.7}}>({count})</span></div>;
    })}
  </div>;
})()}
{/* Search + select all in filtered */}
<div style={{display:'flex',gap:6,marginBottom:8}}>
  <input value={hub.bulkSearch||''} onChange={e=>{hub.bulkSearch=e.target.value;_rerender();}} placeholder="Rechercher un contact..." style={{flex:1,padding:'6px 10px',borderRadius:6,border:'1px solid '+T.border,background:T.bg,fontSize:11,color:T.text,outline:'none',fontFamily:'inherit'}}/>
  {hub.bulkStageFilter && <div onClick={()=>{const ids=_bulkFiltered.map(c=>c.id);const allChecked=ids.every(id=>hub.bulkSelectedContacts.includes(id));if(allChecked){hub.bulkSelectedContacts=hub.bulkSelectedContacts.filter(id=>!ids.includes(id));}else{const newSet=new Set([...hub.bulkSelectedContacts,...ids]);hub.bulkSelectedContacts=[...newSet];}_rerender();}} style={{padding:'6px 12px',borderRadius:6,background:T.accentBg,color:T.accent,fontSize:10,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',border:'1px solid '+T.accent+'30'}}>{_bulkFiltered.every(c=>hub.bulkSelectedContacts.includes(c.id))?'Décocher colonne':'Cocher toute la colonne'}</div>}
</div>
{/* Contact list */}
<div style={{maxHeight:250,overflowY:'auto',border:'1px solid '+T.border,borderRadius:8}}>
  {_bulkFiltered.length===0 && <div style={{padding:16,textAlign:'center',fontSize:11,color:T.text3}}>Aucun contact avec téléphone</div>}
  {_bulkFiltered.map(c=>{
    const checked=hub.bulkSelectedContacts.includes(c.id);
    const stLabel = ((typeof pipelineStages!=='undefined'?pipelineStages:null)||[]).find(s=>s.id===(c.pipeline_stage||'nouveau'))?.label || c.pipeline_stage || 'Nouveau';
    return <div key={c.id} onClick={()=>{if(checked)hub.bulkSelectedContacts=hub.bulkSelectedContacts.filter(x=>x!==c.id);else hub.bulkSelectedContacts=[...hub.bulkSelectedContacts,c.id];_rerender();}} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderBottom:'1px solid '+T.border,cursor:'pointer',background:checked?T.accentBg+'10':'transparent'}}>
      <div style={{width:16,height:16,borderRadius:4,border:'2px solid '+(checked?T.accent:T.border),background:checked?T.accent:'transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>{checked&&<I n="check" s={10} style={{color:'#fff'}}/>}</div>
      <Avatar name={c.name} color={T.accent} s={24}/>
      <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600}}>{c.name}</div></div>
      <span style={{fontSize:9,padding:'1px 6px',borderRadius:4,background:T.bg,color:T.text3,border:'1px solid '+T.border}}>{stLabel}</span>
      <span style={{fontSize:10,color:T.text3}}>{_fmtPhone(c.phone)}</span>
    </div>;
  })}
</div>
<div style={{fontSize:10,fontWeight:600,color:T.accent,marginTop:6}}>{hub.bulkSelectedContacts.length} contact{hub.bulkSelectedContacts.length>1?'s':''} sélectionné{hub.bulkSelectedContacts.length>1?'s':''}{hub.bulkStageFilter?' dans "'+(((typeof pipelineStages!=='undefined'?pipelineStages:null)||[]).find(s=>s.id===hub.bulkStageFilter)?.label||hub.bulkStageFilter)+'"':''}</div>
</div>
{/* Message */}
<div style={{marginBottom:16}}>
<label style={{display:'block',fontSize:12,fontWeight:700,marginBottom:4}}>Message</label>
<textarea value={hub.bulkMessage||''} onChange={e=>{hub.bulkMessage=e.target.value;_rerender();}} placeholder="Votre message... Utilisez {nom} pour le nom du contact" rows={4} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,fontSize:12,color:T.text,outline:'none',resize:'vertical',fontFamily:'inherit'}}/>
<div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
  <div style={{display:'flex',gap:4}}>
    {['{nom}','{tel}'].map(v=><div key={v} onClick={()=>{hub.bulkMessage=(hub.bulkMessage||'')+v;_rerender();}} style={{padding:'2px 8px',borderRadius:4,background:T.accentBg,color:T.accent,fontSize:9,fontWeight:600,cursor:'pointer'}}>{v}</div>)}
  </div>
  <span style={{fontSize:10,color:T.text3}}>{(hub.bulkMessage||'').length}/160 · {Math.ceil(((hub.bulkMessage||'').length||1)/160)} SMS/contact</span>
</div>
</div>
{/* Confirmation */}
<div style={{padding:12,borderRadius:8,background:T.bg,border:'1px solid '+T.border,marginBottom:12}}>
{(()=>{
  const smsPerContact = Math.ceil(((hub.bulkMessage||'').length||1)/160);
  const totalSms = hub.bulkSelectedContacts.length * smsPerContact;
  const creditsOk = ((typeof smsCredits!=='undefined'?smsCredits:null)||0) >= totalSms;
  return <>
    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
      <span style={{fontSize:11,fontWeight:600}}>{totalSms} SMS seront envoyés</span>
      <span style={{fontSize:11,fontWeight:600,color:creditsOk?'#22C55E':'#EF4444'}}>{(typeof smsCredits!=='undefined'?smsCredits:null)||0} crédits dispo</span>
    </div>
    {!creditsOk && <div style={{padding:'6px 10px',borderRadius:6,background:'#FEE2E2',color:'#DC2626',fontSize:10,fontWeight:600,marginBottom:8}}>Crédits insuffisants ! Il manque {totalSms-((typeof smsCredits!=='undefined'?smsCredits:null)||0)} crédits.</div>}
    {hub.bulkSending && <div style={{marginBottom:8}}>
      <div style={{height:6,borderRadius:3,background:T.border,overflow:'hidden'}}><div style={{height:'100%',borderRadius:3,background:'linear-gradient(135deg,#2563EB,#7C3AED)',transition:'width .3s',width:(hub.bulkProgress/Math.max(hub.bulkSelectedContacts.length,1)*100)+'%'}}/></div>
      <div style={{fontSize:10,color:T.text3,marginTop:3,textAlign:'center'}}>{hub.bulkProgress}/{hub.bulkSelectedContacts.length} envoyés...</div>
    </div>}
    <Btn primary disabled={!creditsOk||hub.bulkSelectedContacts.length===0||!(hub.bulkMessage||'').trim()||hub.bulkSending} onClick={()=>{
      const selected=contacts.filter(c=>hub.bulkSelectedContacts.includes(c.id)&&c.phone);
      if(selected.length===0){showNotif('Aucun contact sélectionné','danger');return;}
      hub.bulkSending=true;hub.bulkProgress=0;_rerender();
      const sendNext=(idx)=>{
        if(idx>=selected.length){hub.bulkSending=false;hub.bulkModalOpen=false;showNotif(selected.length+' SMS envoyés ✓');if(_T.smsCache)Object.keys(_T.smsCache).forEach(k=>delete _T.smsCache[k]);api('/api/conversations?companyId='+company.id).then(d=>{if(Array.isArray(d))setAppConversations(d);}).catch(()=>{});_rerender();return;}
        const ct=selected[idx];
        const text=(hub.bulkMessage||'').replace(/\{nom\}/g,ct.name||'').replace(/\{tel\}/g,ct.phone||'').replace(/\{prenom\}/g,(ct.firstName||ct.name||'').split(' ')[0]);
        api('/api/sms/send',{method:'POST',body:{to:ct.phone,content:text,contactId:ct.id}}).then(()=>{hub.bulkProgress=idx+1;_rerender();sendNext(idx+1);}).catch(()=>{hub.bulkProgress=idx+1;_rerender();sendNext(idx+1);});
      };
      sendNext(0);
    }} style={{width:'100%',justifyContent:'center'}}><I n="send" s={14}/> {hub.bulkSending?'Envoi en cours...':'Confirmer et envoyer'}</Btn>
  </>;
})()}
</div>
      </div>
    </Modal>}

  </div>;
})()}


{/* ─── 4. RECORDINGS MODAL ─── */}
{phoneSubTab === 'recordings' && (
  <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 24px',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
<div style={{display:'flex',alignItems:'center',gap:10}}>
<div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#EF4444,#DC2626)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="mic" s={18} style={{color:'#fff'}}/></div>
<div><div style={{fontSize:16,fontWeight:800}}>Enregistrements</div><div style={{fontSize:12,color:T.text3}}>Ecoutez et gerez vos enregistrements</div></div>
</div>
<div onClick={()=>setPhoneSubTab('pipeline')} style={{width:32,height:32,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:`1px solid ${T.border}`}}><I n="x" s={16}/></div>
      </div>
      <div style={{flex:1,overflow:'auto',padding:24}}>
{(()=>{
const recArr = Object.values(phoneCallRecordings).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));

return (
<div>
  {/* Recording toggle */}
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
    <div style={{display:'flex',alignItems:'center',gap:10}}>
      <span style={{fontSize:13,fontWeight:600,color:T.text2}}>{recArr.length} enregistrement{recArr.length>1?'s':''}</span>
    </div>
    <div onClick={_isAdminPhone ? togglePhoneRecording : undefined} title={_isAdminPhone ? '' : "Réservé à l'administrateur"} style={{padding:'8px 14px',borderRadius:10,cursor:_isAdminPhone?'pointer':'not-allowed',opacity:_isAdminPhone?1:0.5,fontSize:12,fontWeight:600,display:'flex',alignItems:'center',gap:6,background:(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'#EF444410':'transparent',border:`1px solid ${phoneRecordingEnabled?'#EF444430':T.border}`,color:(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'#EF4444':T.text3}}>
      <div style={{width:8,height:8,borderRadius:4,background:(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'#EF4444':T.border2,animation:(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'pulse 1.5s infinite':'none'}}/>
      Enregistrement auto {(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'ON':'OFF'}
    </div>
  </div>

  {/* Recording list or empty state */}
  {recArr.length === 0 ? (
    <div style={{textAlign:'center',padding:'60px 20px'}}>
      <div style={{width:80,height:80,borderRadius:24,background:'#EF444410',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
        <I n="mic" s={36} style={{color:'#EF4444',opacity:0.4}}/>
      </div>
      <div style={{fontSize:18,fontWeight:700,color:T.text2}}>Aucun enregistrement</div>
      <div style={{fontSize:13,color:T.text3,marginTop:6}}>Activez l'enregistrement automatique ou cliquez sur le bouton micro dans l'historique pour sauvegarder un appel.</div>
    </div>
  ) : (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {recArr.map(rec=>(
        <Card key={rec.id} style={{padding:14,cursor:'pointer'}} onClick={()=>setPhoneRecordModal(rec.callId)}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            {/* Mic icon */}
            <div style={{width:44,height:44,borderRadius:22,background:'#EF444410',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <I n="mic" s={20} style={{color:'#EF4444'}}/>
            </div>
            {/* Info */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700}}>{rec.contactName||'Inconnu'}</div>
              <div style={{display:'flex',gap:6,alignItems:'center',marginTop:2,flexWrap:'wrap'}}>
                <span style={{fontSize:11,color:T.text3}}>{rec.direction==='inbound'?'Entrant':'Sortant'}</span>
                <span style={{fontSize:11,color:T.text3}}>·</span>
                <span style={{fontSize:11,color:T.text3}}>{fmtDur(rec.duration)}</span>
                <span style={{fontSize:11,color:T.text3}}>·</span>
                <span style={{fontSize:11,color:T.text3}}>{(rec.format||'wav').toUpperCase()}</span>
                <span style={{fontSize:11,color:T.text3}}>·</span>
                <span style={{fontSize:11,color:T.text3}}>{rec.fileSize||'--'} Ko</span>
              </div>
            </div>
            {/* Date/time */}
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontSize:12,fontWeight:600}}>{new Date(rec.createdAt).toLocaleDateString('fr-FR')}</div>
              <div style={{fontSize:11,color:T.text3}}>{new Date(rec.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
            </div>
            {/* Play/download */}
            <div style={{display:'flex',gap:4}}>
              <div onClick={e=>{e.stopPropagation();showNotif('Lecture en cours...');}} style={{width:32,height:32,borderRadius:8,background:'#22C55E10',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',border:'1px solid #22C55E30'}} title="Ecouter"><I n="play" s={14} style={{color:'#22C55E'}}/></div>
              <div onClick={e=>{e.stopPropagation();showNotif('Telechargement lance');}} style={{width:32,height:32,borderRadius:8,background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',border:`1px solid ${T.border}`}} title="Telecharger"><I n="download" s={14} style={{color:T.text3}}/></div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )}
</div>);
})()}
      </div>
    </div>
  </div>
)}
{/* ═══════════════════════════════════════════════════════════════════════════
    PHONE TAB — MODALS PART B
    5 full-screen modal overlays:
      1. Stats ((typeof phoneSubTab!=='undefined'?phoneSubTab:null) === 'stats')
      2. Campaigns ((typeof phoneSubTab!=='undefined'?phoneSubTab:null) === 'campaigns')
      3. Scripts ((typeof phoneSubTab!=='undefined'?phoneSubTab:null) === 'scripts')
      4. Scheduled ((typeof phoneSubTab!=='undefined'?phoneSubTab:null) === 'scheduled')
      5. Analyses IA ((typeof phoneSubTab!=='undefined'?phoneSubTab:null) === 'analyses')

    All state/functions from parent scope. No hooks in IIFEs.
   ═══════════════════════════════════════════════════════════════════════════ */}

{/* ═══════════════════════════════════════════════════════════════════
    1. STATS MODAL
   ═══════════════════════════════════════════════════════════════════ */}
{phoneSubTab === 'stats' && (
  <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'20px 24px',background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
<div style={{display:'flex',alignItems:'center',gap:12}}>
<div style={{width:40,height:40,borderRadius:12,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center'}}>
  <I n="bar-chart-2" s={20} style={{color:'#fff'}}/>
</div>
<div>
  <div style={{fontSize:18,fontWeight:800,color:'#fff'}}>Statistiques</div>
  <div style={{fontSize:12,color:'#ffffffaa'}}>Vue d'ensemble de votre activite telephonique</div>
</div>
</div>
<div onClick={()=>setPhoneSubTab('pipeline')} style={{width:36,height:36,borderRadius:10,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.3)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.15)'}>
<I n="x" s={18} style={{color:'#fff'}}/>
</div>
      </div>

      {/* Body */}
      <div style={{flex:1,overflow:'auto',padding:24}}>
{(()=>{
const now = new Date();
const todayStr = now.toISOString().split('T')[0];
const weekAgo = new Date(now - 7*86400000).toISOString().split('T')[0];
const monthAgo = new Date(now - 30*86400000).toISOString().split('T')[0];
const logs = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(cl => {
  if ((typeof phoneStatsPeriod!=='undefined'?phoneStatsPeriod:null) === 'all') return true;
  const d = cl.createdAt?.split('T')[0] || '';
  if ((typeof phoneStatsPeriod!=='undefined'?phoneStatsPeriod:null) === 'today') return d === todayStr;
  if ((typeof phoneStatsPeriod!=='undefined'?phoneStatsPeriod:null) === 'week') return d >= weekAgo;
  if ((typeof phoneStatsPeriod!=='undefined'?phoneStatsPeriod:null) === 'month') return d >= monthAgo;
  return true;
});
const total = logs.length;
const completed = logs.filter(c=>c.status==='completed').length;
const missed = logs.filter(c=>c.status==='missed'||c.status==='no-answer').length;
const inbound = logs.filter(c=>c.direction==='inbound').length;
const outbound = logs.filter(c=>c.direction==='outbound').length;
const totalDur = logs.reduce((a,c)=>a+(c.duration||0),0);
const svcPct = total ? Math.round(completed/total*100) : 0;
// Daily 7-day chart
const dailyData = [];
for (let i = 6; i >= 0; i--) {
  const d = new Date(now - i*86400000);
  const ds = d.toISOString().split('T')[0];
  const dayLogs = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(cl => cl.createdAt?.startsWith(ds));
  dailyData.push({ label: d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric'}), total: dayLogs.length, inbound: dayLogs.filter(c=>c.direction==='inbound').length, outbound: dayLogs.filter(c=>c.direction==='outbound').length, missed: dayLogs.filter(c=>c.status==='missed'||c.status==='no-answer').length });
}
const maxDay = Math.max(...dailyData.map(d=>d.total), 1);

return (
<div>
  {/* Period selector */}
  <div style={{display:'flex',gap:4,marginBottom:20,padding:3,borderRadius:10,background:T.bg,border:`1px solid ${T.border}`,width:'fit-content'}}>
    {[{id:'today',label:"Aujourd'hui"},{id:'week',label:'7 jours'},{id:'month',label:'30 jours'},{id:'all',label:'Tout'}].map(p=>(
      <div key={p.id} onClick={()=>(typeof setPhoneStatsPeriod==='function'?setPhoneStatsPeriod:function(){})(p.id)} style={{padding:'6px 16px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:phoneStatsPeriod===p.id?700:500,color:phoneStatsPeriod===p.id?'#fff':T.text2,background:phoneStatsPeriod===p.id?'linear-gradient(135deg,#7C3AED,#2563EB)':'transparent',transition:'all .2s'}}>{p.label}</div>
    ))}
  </div>

  {/* 4 KPI cards */}
  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
    {[
      {label:'Total',value:total,icon:'phone',color:'#2563EB',bg:'#2563EB10'},
      {label:'Entrants',value:inbound,icon:'phone-incoming',color:'#22C55E',bg:'#22C55E10'},
      {label:'Sortants',value:outbound,icon:'phone-outgoing',color:'#7C3AED',bg:'#7C3AED10'},
      {label:'Manques',value:missed,icon:'phone-missed',color:'#EF4444',bg:'#EF444410'},
    ].map((k,i)=>(
      <Card key={i} style={{padding:'16px 14px',textAlign:'center'}}>
        <div style={{width:40,height:40,borderRadius:12,background:k.bg,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px'}}><I n={k.icon} s={18} style={{color:k.color}}/></div>
        <div style={{fontSize:28,fontWeight:800,color:k.color}}>{k.value}</div>
        <div style={{fontSize:11,color:T.text3,fontWeight:600,marginTop:4}}>{k.label}</div>
      </Card>
    ))}
  </div>

  {/* Service level donut + Total duration */}
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
    <Card style={{padding:24}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>Niveau de service</div>
      <div style={{display:'flex',alignItems:'center',gap:20}}>
        <div style={{position:'relative',width:100,height:100}}>
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke={T.border} strokeWidth="10"/>
            <circle cx="50" cy="50" r="40" fill="none" stroke="#22C55E" strokeWidth="10" strokeDasharray={`${total?Math.round(completed/total*251):0} 251`} transform="rotate(-90 50 50)" style={{transition:'stroke-dasharray .6s'}}/>
          </svg>
          <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center'}}>
            <div style={{fontSize:20,fontWeight:800}}>{svcPct}%</div>
            <div style={{fontSize:9,color:T.text3}}>Traite</div>
          </div>
        </div>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}><div style={{width:10,height:10,borderRadius:2,background:'#22C55E'}}/><span style={{fontSize:12}}>{svcPct}% Decroches</span></div>
          <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:10,height:10,borderRadius:2,background:'#EF4444'}}/><span style={{fontSize:12}}>{total?100-svcPct:0}% Manques</span></div>
        </div>
      </div>
    </Card>
    <Card style={{padding:24}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>Duree totale</div>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div style={{width:52,height:52,borderRadius:14,background:'#7C3AED10',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="clock" s={24} style={{color:'#7C3AED'}}/></div>
        <div>
          <div style={{fontSize:28,fontWeight:800}}>{fmtDur(totalDur)}</div>
          <div style={{fontSize:12,color:T.text3}}>Total ({total} appels)</div>
        </div>
      </div>
    </Card>
  </div>

  {/* 7-day stacked bar chart */}
  <Card style={{padding:24,marginBottom:20}}>
    <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>Evolution sur 7 jours</div>
    <div style={{display:'flex',alignItems:'flex-end',gap:8,height:140}}>
      {dailyData.map((d,i)=>(
        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
          <div style={{fontSize:10,fontWeight:700,color:T.text2}}>{d.total}</div>
          <div style={{width:'100%',display:'flex',flexDirection:'column',gap:1,height:100,justifyContent:'flex-end'}}>
            {d.outbound > 0 && <div style={{width:'100%',borderRadius:'4px 4px 0 0',background:'#2563EB',height:Math.max(d.outbound/maxDay*100,4)+'%',transition:'height .5s'}}/>}
            {d.inbound > 0 && <div style={{width:'100%',background:'#22C55E',height:Math.max(d.inbound/maxDay*100,4)+'%',transition:'height .5s'}}/>}
            {d.missed > 0 && <div style={{width:'100%',borderRadius:'0 0 4px 4px',background:'#EF4444',height:Math.max(d.missed/maxDay*100,4)+'%',transition:'height .5s'}}/>}
            {d.total === 0 && <div style={{width:'100%',height:4,borderRadius:2,background:T.border}}/>}
          </div>
          <div style={{fontSize:9,color:T.text3,fontWeight:600,textAlign:'center'}}>{d.label}</div>
        </div>
      ))}
    </div>
    <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:12}}>
      <div style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}><div style={{width:10,height:10,borderRadius:2,background:'#22C55E'}}/> Entrants</div>
      <div style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}><div style={{width:10,height:10,borderRadius:2,background:'#2563EB'}}/> Sortants</div>
      <div style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}><div style={{width:10,height:10,borderRadius:2,background:'#EF4444'}}/> Manques</div>
    </div>
  </Card>

  {/* ═══ ANALYTICS AVANCE (module) ═══ */}
  {isModuleOn('analytics') && (()=>{
    const allLogs = (typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[];
    const hours = Array(24).fill(0);
    allLogs.forEach(l=>{ const h = parseInt(l.createdAt?.split('T')[1]?.split(':')[0]||'0'); hours[h]++; });
    const maxH = Math.max(...hours,1);
    const weekDays = Array(7).fill(0);
    allLogs.forEach(l=>{ const d = new Date(l.createdAt).getDay(); weekDays[d]++; });
    const maxW = Math.max(...weekDays,1);
    const last7trend = Array(7).fill(null).map((_,idx)=>{ const dd=new Date(Date.now()-idx*86400000); const dds=dd.toISOString().split('T')[0]; return {date:dds,day:['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][dd.getDay()],count:allLogs.filter(l=>l.createdAt?.startsWith(dds)).length}; }).reverse();
    const max7 = Math.max(...last7trend.map(d=>d.count),1);
    return (
    <div style={{marginTop:4}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
        <I n="bar-chart-2" s={16} style={{color:'#2563EB'}}/>
        <span style={{fontSize:14,fontWeight:800}}>Analytics avance</span>
        <span style={{fontSize:10,padding:'2px 8px',borderRadius:6,background:'#2563EB18',color:'#2563EB',fontWeight:600}}>Module</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        {/* Hour heatmap */}
        <Card style={{padding:16}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Activite par heure</div>
          <div style={{display:'flex',gap:2,alignItems:'flex-end',height:80}}>
            {hours.map((h,idx)=>(
              <div key={idx} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                <div style={{width:'100%',borderRadius:3,background:h===0?T.border:h/maxH>0.7?'#2563EB':h/maxH>0.3?'#60A5FA':'#BFDBFE',height:Math.max(2,h/maxH*60),transition:'height .3s'}}/>
                {idx%4===0 && <span style={{fontSize:8,color:T.text3}}>{idx}h</span>}
              </div>
            ))}
          </div>
        </Card>

        {/* Day heatmap */}
        <Card style={{padding:16}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Activite par jour</div>
          <div style={{display:'flex',gap:8}}>
            {['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].map((dName,idx)=>(
              <div key={idx} style={{flex:1,textAlign:'center'}}>
                <div style={{width:'100%',height:40,borderRadius:8,background:weekDays[idx]===0?T.surface:weekDays[idx]/maxW>0.7?'#7C3AED':weekDays[idx]/maxW>0.3?'#A78BFA':'#DDD6FE',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:weekDays[idx]/maxW>0.3?'#fff':T.text3}}>{weekDays[idx]}</div>
                <div style={{fontSize:9,color:T.text3,marginTop:4}}>{dName}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* 7-day trend line */}
        <Card style={{padding:16,gridColumn:'span 2'}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Tendance 7 derniers jours</div>
          <div style={{display:'flex',gap:8,alignItems:'flex-end',height:80}}>
            {last7trend.map((d,idx)=>(
              <div key={idx} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                <span style={{fontSize:10,fontWeight:700,color:T.accent}}>{d.count}</span>
                <div style={{width:'100%',borderRadius:6,background:d.count===0?T.border:'linear-gradient(180deg,#22C55E,#16A34A)',height:Math.max(4,d.count/max7*60),transition:'height .3s'}}/>
                <span style={{fontSize:9,color:T.text3}}>{d.day}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>);
  })()}

  {/* ═══ GAMIFICATION (module) ═══ */}
  {isModuleOn('gamification') && (()=>{
    const todayCalls = todayCallCount;
    const totalCallsAll = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).length;
    const goalPct = Math.min(100,Math.round(todayCalls/Math.max((typeof phoneDailyGoal!=='undefined'?phoneDailyGoal:null),1)*100));
    const ALL_BADGES = [
      {id:'streak3',label:'3 jours',desc:'3 jours consecutifs d\'appels',icon:'🔥',unlocked:((typeof phoneBadges!=='undefined'?phoneBadges:null)||[]).includes('streak3')},
      {id:'streak7',label:'Semaine parfaite',desc:'7 jours consecutifs',icon:'🏆',unlocked:((typeof phoneBadges!=='undefined'?phoneBadges:null)||[]).includes('streak7')},
      {id:'streak30',label:'Mois d\'or',desc:'30 jours consecutifs',icon:'👑',unlocked:((typeof phoneBadges!=='undefined'?phoneBadges:null)||[]).includes('streak30')},
      {id:'calls100',label:'Centurion',desc:'100 appels passes',icon:'📞',unlocked:((typeof phoneBadges!=='undefined'?phoneBadges:null)||[]).includes('calls100')},
      {id:'calls500',label:'Machine',desc:'500 appels passes',icon:'⚡',unlocked:((typeof phoneBadges!=='undefined'?phoneBadges:null)||[]).includes('calls500')},
      {id:'ai10',label:'Analyste',desc:'10 analyses IA',icon:'🤖',unlocked:((typeof phoneBadges!=='undefined'?phoneBadges:null)||[]).includes('ai10')},
      {id:'goal5',label:'Objectifs x5',desc:'5 jours objectif atteint',icon:'🎯',unlocked:((typeof phoneBadges!=='undefined'?phoneBadges:null)||[]).includes('goal5')},
      {id:'first_campaign',label:'Campagneur',desc:'Premiere campagne creee',icon:'📋',unlocked:((typeof phoneBadges!=='undefined'?phoneBadges:null)||[]).includes('first_campaign')},
    ];
    return (
    <div style={{marginTop:24}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
        <I n="award" s={16} style={{color:'#22C55E'}}/>
        <span style={{fontSize:14,fontWeight:800}}>Gamification</span>
        <span style={{fontSize:10,padding:'2px 8px',borderRadius:6,background:'#22C55E18',color:'#22C55E',fontWeight:600}}>Module</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
        {/* Streak */}
        <Card style={{padding:16,textAlign:'center',background:'linear-gradient(135deg,#F59E0B08,#EF444408)'}}>
          <div style={{fontSize:32,marginBottom:4}}>🔥</div>
          <div style={{fontSize:24,fontWeight:900,color:'#F59E0B'}}>{(typeof phoneStreak!=='undefined'?phoneStreak:null)?.count||0}</div>
          <div style={{fontSize:11,color:T.text3,fontWeight:600}}>Jours consecutifs</div>
        </Card>
        {/* Daily goal circle */}
        <Card style={{padding:16,textAlign:'center'}}>
          <div style={{width:60,height:60,borderRadius:30,border:`4px solid ${goalPct>=100?'#22C55E':'#E5E7EB'}`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 6px',background:goalPct>=100?'#22C55E10':'transparent'}}>
            <span style={{fontSize:16,fontWeight:900,color:goalPct>=100?'#22C55E':T.text}}>{goalPct}%</span>
          </div>
          <div style={{fontSize:11,color:T.text3,fontWeight:600}}>{todayCalls}/{phoneDailyGoal} aujourd'hui</div>
        </Card>
        {/* Total calls */}
        <Card style={{padding:16,textAlign:'center'}}>
          <div style={{fontSize:32,marginBottom:4}}>📊</div>
          <div style={{fontSize:24,fontWeight:900,color:T.accent}}>{totalCallsAll}</div>
          <div style={{fontSize:11,color:T.text3,fontWeight:600}}>Appels totaux</div>
        </Card>
      </div>
      {/* Badges grid (8) */}
      <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Badges</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
        {ALL_BADGES.map(b=>(
          <div key={b.id} style={{padding:'12px 8px',borderRadius:12,border:`1px solid ${b.unlocked?'#22C55E30':T.border}`,background:b.unlocked?'#22C55E06':'transparent',textAlign:'center',opacity:b.unlocked?1:0.4,transition:'all .2s'}}>
            <div style={{fontSize:24,marginBottom:4}}>{b.icon}</div>
            <div style={{fontSize:10,fontWeight:700,color:b.unlocked?T.text:T.text3}}>{b.label}</div>
            <div style={{fontSize:9,color:T.text3}}>{b.desc}</div>
            {b.unlocked && <div style={{fontSize:8,color:'#22C55E',fontWeight:700,marginTop:2}}>Debloque</div>}
          </div>
        ))}
      </div>
    </div>);
  })()}

  {/* ═══ RAPPORTS (module) ═══ */}
  {isModuleOn('rapports') && (()=>{
    const allLogs = (typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[];
    const nowR = new Date();
    const thisWeekLogs = allLogs.filter(l=>{const d=new Date(l.createdAt);return (nowR-d)<7*86400000;});
    const lastWeekLogs = allLogs.filter(l=>{const d=new Date(l.createdAt);return (nowR-d)>=7*86400000&&(nowR-d)<14*86400000;});
    const thisMonthLogs = allLogs.filter(l=>{const d=new Date(l.createdAt);return d.getMonth()===nowR.getMonth()&&d.getFullYear()===nowR.getFullYear();});
    const avgThisWeek = thisWeekLogs.length>0?Math.round(thisWeekLogs.reduce((a,l)=>a+(l.duration||0),0)/thisWeekLogs.length):0;
    const avgLastWeek = lastWeekLogs.length>0?Math.round(lastWeekLogs.reduce((a,l)=>a+(l.duration||0),0)/lastWeekLogs.length):0;
    const diff = thisWeekLogs.length - lastWeekLogs.length;
    return (
    <div style={{marginTop:24}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
        <I n="file-text" s={16} style={{color:'#64748B'}}/>
        <span style={{fontSize:14,fontWeight:800}}>Rapports</span>
        <span style={{fontSize:10,padding:'2px 8px',borderRadius:6,background:'#64748B18',color:'#64748B',fontWeight:600}}>Module</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        {/* Week comparison */}
        <Card style={{padding:16}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Comparaison semaine</div>
          <div style={{display:'flex',gap:12}}>
            <div style={{flex:1,textAlign:'center',padding:10,borderRadius:10,background:T.surface}}>
              <div style={{fontSize:9,color:T.text3}}>Cette semaine</div>
              <div style={{fontSize:20,fontWeight:900,color:T.accent}}>{thisWeekLogs.length}</div>
              <div style={{fontSize:9,color:T.text3}}>appels - {avgThisWeek}s moy.</div>
            </div>
            <div style={{flex:1,textAlign:'center',padding:10,borderRadius:10,background:T.surface}}>
              <div style={{fontSize:9,color:T.text3}}>Semaine derniere</div>
              <div style={{fontSize:20,fontWeight:900,color:T.text2}}>{lastWeekLogs.length}</div>
              <div style={{fontSize:9,color:T.text3}}>appels - {avgLastWeek}s moy.</div>
            </div>
          </div>
          <div style={{marginTop:8,textAlign:'center',fontSize:12,fontWeight:700,color:diff>0?'#22C55E':diff<0?'#EF4444':T.text3}}>
            {diff>0?`+${diff} appels`:diff<0?`${diff} appels`:'= Stable'} vs semaine derniere
          </div>
        </Card>

        {/* Monthly summary */}
        <Card style={{padding:16}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Ce mois ({nowR.toLocaleDateString('fr-FR',{month:'long'})})</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {[
              {label:'Total appels',val:thisMonthLogs.length,color:T.accent},
              {label:'Entrants',val:thisMonthLogs.filter(l=>l.direction==='inbound').length,color:'#22C55E'},
              {label:'Sortants',val:thisMonthLogs.filter(l=>l.direction==='outbound').length,color:'#2563EB'},
              {label:'Manques',val:thisMonthLogs.filter(l=>l.status==='missed'||l.status==='no-answer').length,color:'#EF4444'},
            ].map((s,idx)=>(
              <div key={idx} style={{textAlign:'center',padding:8,borderRadius:8,background:T.surface}}>
                <div style={{fontSize:18,fontWeight:900,color:s.color}}>{s.val}</div>
                <div style={{fontSize:9,color:T.text3}}>{s.label}</div>
              </div>
            ))}
          </div>
          <Btn small style={{width:'100%',justifyContent:'center',marginTop:10,fontSize:11}} onClick={()=>showNotif('Rapport PDF genere (simule)')}><I n="download" s={12}/> Exporter rapport mensuel</Btn>
        </Card>
      </div>
    </div>);
  })()}

</div>);
})()}
      </div>
    </div>
  </div>
)}


{/* Contract modal doublon supprimé — une seule modale globale en bas du fichier */}

{/* ═══════════════════════════════════════════════════════════════════
    2. CAMPAIGNS MODAL
   ═══════════════════════════════════════════════════════════════════ */}
{phoneSubTab === 'campaigns' && (
  <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'16px 24px',background:'linear-gradient(135deg,#F59E0B,#D97706)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
<div style={{display:'flex',alignItems:'center',gap:12}}>
<div style={{width:40,height:40,borderRadius:12,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center'}}>
  <I n="zap" s={20} style={{color:'#fff'}}/>
</div>
<div>
  <div style={{fontSize:18,fontWeight:800,color:'#fff'}}>Power Dialer</div>
  <div style={{fontSize:12,color:'#ffffffaa'}}>Campagnes d'appels automatisees</div>
</div>
</div>
<div onClick={()=>setPhoneSubTab('pipeline')} style={{width:36,height:36,borderRadius:10,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.3)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.15)'}>
<I n="x" s={18} style={{color:'#fff'}}/>
</div>
      </div>

      {/* Ring timeout setting */}
      <div style={{padding:'10px 20px',borderBottom:'1px solid '+T.border,display:'flex',alignItems:'center',gap:10,background:T.bg}}>
<I n="clock" s={14} style={{color:'#F59E0B'}}/>
<span style={{fontSize:11,fontWeight:600,color:T.text}}>Durée sonnerie max</span>
<input type="number" min={5} max={60} step={5} defaultValue={parseInt(localStorage.getItem('c360-pd-ring-timeout-'+collab.id)||'15',10)} onChange={e=>{localStorage.setItem('c360-pd-ring-timeout-'+collab.id,e.target.value);}} style={{width:50,padding:'4px 6px',borderRadius:6,border:'1px solid '+T.border,background:T.card,fontSize:12,fontWeight:700,textAlign:'center',color:T.text}}/>
<span style={{fontSize:10,color:T.text3}}>secondes</span>
      </div>

      {/* Body */}
      <div style={{flex:1,overflow:'auto',padding:20}}>

{/* ═══ SECTION 1 — Objectif quotidien ═══ */}
<Card style={{padding:14,marginBottom:16}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
  <div style={{display:'flex',alignItems:'center',gap:8}}>
    <I n="target" s={16} style={{color:'#F59E0B'}}/>
    <span style={{fontWeight:700,fontSize:13}}>Objectif quotidien</span>
  </div>
  <div style={{display:'flex',alignItems:'center',gap:6}}>
    <input type="number" min="1" max="500" value={phoneDailyGoal} onChange={e=>{const v=Math.max(1,Math.min(500,parseInt(e.target.value)||10));(typeof setPhoneDailyGoal==='function'?setPhoneDailyGoal:function(){})(v);try{localStorage.setItem('c360-phone-goal-'+collab.id,v)}catch(e){};api('/api/goals/sync-daily',{method:'POST',body:{companyId:company.id,collaboratorId:collab.id,target:v}}).catch(()=>{})}} style={{width:55,padding:'5px 8px',borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:13,fontWeight:700,textAlign:'center',color:T.text,outline:'none',fontFamily:'inherit'}}/>
    <span style={{fontSize:11,color:T.text3}}>/jour</span>
  </div>
</div>
<div style={{display:'flex',alignItems:'center',gap:10}}>
  <div style={{flex:1,height:10,borderRadius:5,background:T.border,overflow:'hidden'}}>
    <div style={{height:'100%',borderRadius:5,background:todayCallCount>=(typeof phoneDailyGoal!=='undefined'?phoneDailyGoal:null)?'linear-gradient(90deg,#22C55E,#16A34A)':'linear-gradient(90deg,#F59E0B,#D97706)',width:`${Math.min(100,Math.round(todayCallCount/Math.max(phoneDailyGoal,1)*100))}%`,transition:'width .5s'}}/>
  </div>
  <span style={{fontSize:13,fontWeight:800,color:todayCallCount>=(typeof phoneDailyGoal!=='undefined'?phoneDailyGoal:null)?'#22C55E':'#F59E0B',minWidth:50,textAlign:'right'}}>{todayCallCount}/{phoneDailyGoal}</span>
</div>
{todayCallCount>=(typeof phoneDailyGoal!=='undefined'?phoneDailyGoal:null) && <div style={{marginTop:6,padding:'4px 10px',borderRadius:6,background:'#22C55E12',color:'#22C55E',fontSize:11,fontWeight:600,display:'flex',alignItems:'center',gap:4}}><I n="award" s={12}/> Objectif atteint !</div>}
</Card>

{/* ═══ SECTION 2 — CSV Template & Import ═══ */}
<Card style={{padding:16,marginBottom:16}}>
<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
  <div style={{display:'flex',alignItems:'center',gap:8}}>
    <I n="file-text" s={16} style={{color:'#2563EB'}}/>
    <span style={{fontWeight:700,fontSize:13}}>Import CSV</span>
  </div>
  <div onClick={()=>{
    const csvContent = "phone,name,email,note,company\n+33612345678,Jean Dupont,jean@email.com,Client fidele,Dupont SARL\n+33698765432,Marie Martin,marie@societe.fr,Prospect chaud,Martin & Co\n+33644556677,Pierre Durand,pierre@startup.io,A rappeler lundi,TechStart SAS\n+33677889900,Sophie Leroy,,RDV confirme,Leroy Design\n+33611223344,Luc Bernard,luc@pme.fr,Devis envoye,Bernard PME";
    const blob = new Blob([csvContent], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'modele_power_dialer.csv'; link.click();
    URL.revokeObjectURL(url);
    showNotif('Modele CSV telecharge');
  }} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,background:'#2563EB10',border:'1px solid #2563EB30',cursor:'pointer',fontSize:11,fontWeight:700,color:'#2563EB',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background='#2563EB20'} onMouseLeave={e=>e.currentTarget.style.background='#2563EB10'}>
    <I n="download" s={12}/> Telecharger modele CSV
  </div>
</div>
<div style={{fontSize:11,color:T.text3,marginBottom:8,padding:'6px 10px',borderRadius:6,background:T.surface,border:`1px dashed ${T.border}`,fontFamily:'monospace',lineHeight:1.6}}>
  <div style={{fontWeight:700,color:T.text2,marginBottom:2}}>Format attendu :</div>
  phone, name, email, note, company<br/>
  +33612345678, Jean Dupont, jean@email.com, Note, Entreprise
</div>
<input type="file" accept=".csv,.txt" onChange={e=>{
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const lines=ev.target.result.split('\n').filter(l=>l.trim());
    const isHeader = lines[0] && lines[0].toLowerCase().includes('phone');
    const dataLines = isHeader ? lines.slice(1) : lines;
    const parsed=dataLines.map(l=>{
      const parts=l.split(',').map(p=>p.trim());
      return {number:parts[0]||'',name:parts[1]||'',email:parts[2]||'',note:parts[3]||'',company:parts[4]||''};
    }).filter(p=>p.number && p.number.length>=6);
    if(parsed.length===0){showNotif('Aucun contact trouve dans le CSV','danger');return;}
    // Detect duplicates
    const seen=new Set(); const unique=[]; const dupes=[];
    parsed.forEach(p=>{const clean=p.number.replace(/\s/g,'');if(seen.has(clean)){dupes.push(p);}else{seen.add(clean);unique.push(p);}});
    const nc={id:'camp_csv_'+Date.now(),name:'Import CSV — '+file.name,contacts:unique,status:'paused',completed:0,createdAt:new Date().toISOString()};
    setPhoneCampaigns(p=>{const u=[...p,nc];try{localStorage.setItem('c360-phone-campaigns-'+collab.id,JSON.stringify(u))}catch(e){}return u;});
    showNotif(unique.length+' contacts importes'+(dupes.length?' ('+dupes.length+' doublons retires)':''));
  };
  reader.readAsText(file);
}} style={{display:'block',fontSize:12,color:T.text2}}/>
</Card>

{/* ═══ SECTION 3 — Saisie rapide de numeros ═══ */}
<Card style={{padding:16,marginBottom:16}}>
<div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
  <I n="list" s={16} style={{color:'#7C3AED'}}/>
  <span style={{fontWeight:700,fontSize:13}}>Saisie rapide de numeros</span>
</div>
<div style={{fontSize:11,color:T.text3,marginBottom:8}}>Collez vos numeros (un par ligne, separes par virgule ou point-virgule)</div>
<textarea value={pdNumbers} onChange={e=>(typeof setPdNumbers==='function'?setPdNumbers:function(){})(e.target.value)} placeholder={"+33612345678\n+33698765432\n+33644556677\n..."} rows={5} style={{width:'100%',padding:'10px 12px',borderRadius:10,border:`1px solid ${T.border}`,background:T.bg,fontSize:12,fontFamily:'monospace',color:T.text,outline:'none',resize:'vertical',lineHeight:1.6}}/>
<div style={{display:'flex',gap:8,marginTop:10}}>
  <Btn small primary onClick={()=>{
    const raw = (typeof pdNumbers!=='undefined'?pdNumbers:{}).replace(/[;\t]/g,',').split(/[\n,]/).map(n=>n.trim().replace(/\s/g,'')).filter(n=>n.length>=6);
    if(raw.length===0){showNotif('Aucun numero valide','danger');return;}
    const seen=new Set(); const unique=[]; const dupes=[];
    raw.forEach(n=>{if(seen.has(n)){dupes.push(n);}else{seen.add(n);unique.push(n);}});
    setPdParsedList(unique.map((n,i)=>({id:i,number:n,name:(contacts||[]).find(c=>(c.phone||'').replace(/\s/g,'')===n||(c.mobile||'').replace(/\s/g,'')===n)?.name||''})));
    setPdDuplicates(dupes);
    setPdStatus('idle'); setPdCurrentIdx(0); setPdResults({});
    showNotif(unique.length+' numeros charges'+(dupes.length?' · '+dupes.length+' doublons retires':''));
  }} style={{flex:1,justifyContent:'center'}}>
    <I n="check" s={13}/> Analyser la liste
  </Btn>
  <Btn small onClick={()=>{setPdNumbers('');setPdParsedList([]);setPdDuplicates([]);setPdStatus('idle');setPdCurrentIdx(0);setPdResults({});}} style={{justifyContent:'center'}}>
    <I n="trash-2" s={13}/> Vider
  </Btn>
</div>
</Card>

{/* ═══ SECTION 4 — Liste analysee + Controles Power Dialer ═══ */}
{(typeof pdParsedList!=='undefined'?pdParsedList:{}).length > 0 && (
<Card style={{padding:16,marginBottom:16,border:(typeof pdStatus!=='undefined'?pdStatus:null)==='running'?'2px solid #22C55E':(typeof pdStatus!=='undefined'?pdStatus:null)==='paused'?'2px solid #F59E0B':`1px solid ${T.border}`}}>
  {/* Stats bar */}
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <I n="phone" s={16} style={{color:(typeof pdStatus!=='undefined'?pdStatus:null)==='running'?'#22C55E':(typeof pdStatus!=='undefined'?pdStatus:null)==='paused'?'#F59E0B':'#7C3AED'}}/>
      <span style={{fontWeight:700,fontSize:13}}>
        {pdStatus==='running'?'Appels en cours...':(typeof pdStatus!=='undefined'?pdStatus:null)==='paused'?'En pause':(typeof pdStatus!=='undefined'?pdStatus:null)==='done'?'Terminé':'Liste prête'}
      </span>
    </div>
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <span style={{fontSize:12,fontWeight:700,color:T.text2}}>{Object.keys((typeof pdResults!=='undefined'?pdResults:null)).length}/{(typeof pdParsedList!=='undefined'?pdParsedList:{}).length}</span>
      <span style={{fontSize:11,color:T.text3}}>appels</span>
    </div>
  </div>

  {/* Progress bar */}
  <div style={{height:6,borderRadius:3,background:T.border,overflow:'hidden',marginBottom:12}}>
    <div style={{height:'100%',borderRadius:3,background:(typeof pdStatus!=='undefined'?pdStatus:null)==='done'?'linear-gradient(90deg,#22C55E,#16A34A)':'linear-gradient(90deg,#7C3AED,#2563EB)',width:`${Math.round(Object.keys(pdResults).length/Math.max((typeof pdParsedList!=='undefined'?pdParsedList:{}).length,1)*100)}%`,transition:'width .3s'}}/>
  </div>

  {/* Duplicates alert */}
  {(typeof pdDuplicates!=='undefined'?pdDuplicates:{}).length > 0 && (
    <div style={{padding:'8px 12px',borderRadius:8,background:'#F59E0B08',border:'1px solid #F59E0B25',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
      <I n="alert-triangle" s={14} style={{color:'#F59E0B'}}/>
      <span style={{fontSize:11,color:'#F59E0B',fontWeight:600}}>{(typeof pdDuplicates!=='undefined'?pdDuplicates:{}).length} doublon{(typeof pdDuplicates!=='undefined'?pdDuplicates:{}).length>1?'s':''} detecte{(typeof pdDuplicates!=='undefined'?pdDuplicates:{}).length>1?'s':''} et retire{(typeof pdDuplicates!=='undefined'?pdDuplicates:{}).length>1?'s':''}</span>
      <div style={{marginLeft:'auto',display:'flex',gap:4,flexWrap:'wrap'}}>
        {(typeof pdDuplicates!=='undefined'?pdDuplicates:{}).slice(0,3).map((d,i)=><span key={i} style={{fontSize:9,padding:'1px 6px',borderRadius:4,background:'#F59E0B12',color:'#D97706',fontFamily:'monospace'}}>{d}</span>)}
        {(typeof pdDuplicates!=='undefined'?pdDuplicates:{}).length>3 && <span style={{fontSize:9,color:'#D97706'}}>+{(typeof pdDuplicates!=='undefined'?pdDuplicates:{}).length-3}</span>}
      </div>
    </div>
  )}

  {/* Control buttons */}
  <div style={{display:'flex',gap:8,marginBottom:14}}>
    {pdStatus==='idle' && (
      <Btn small primary onClick={()=>{setPdStatus('running');setPdCurrentIdx(0);setPdResults({});
        const num=(typeof pdParsedList!=='undefined'?pdParsedList:null)[0]?.number;if(num)startPhoneCall(num,null);
      }} style={{flex:1,justifyContent:'center',background:'linear-gradient(135deg,#22C55E,#16A34A)',border:'none'}}>
        <I n="play" s={14}/> Demarrer les appels
      </Btn>
    )}
    {pdStatus==='running' && (
      <Btn small onClick={()=>setPdStatus('paused')} style={{flex:1,justifyContent:'center',background:'#F59E0B',border:'none',color:'#fff'}}>
        <I n="pause" s={14}/> Pause
      </Btn>
    )}
    {pdStatus==='paused' && (<>
      <Btn small primary onClick={()=>{setPdStatus('running');
        const nextIdx=(typeof pdCurrentIdx!=='undefined'?pdCurrentIdx:null);const num=(typeof pdParsedList!=='undefined'?pdParsedList:null)[nextIdx]?.number;
        if(num)startPhoneCall(num,null);
      }} style={{flex:1,justifyContent:'center',background:'linear-gradient(135deg,#22C55E,#16A34A)',border:'none'}}>
        <I n="play" s={14}/> Reprendre
      </Btn>
      <Btn small onClick={()=>{setPdStatus('idle');setPdCurrentIdx(0);setPdResults({});}} style={{justifyContent:'center'}}>
        <I n="rotate-ccw" s={14}/> Reset
      </Btn>
    </>)}
    {pdStatus==='done' && (
      <Btn small onClick={()=>{setPdParsedList([]);setPdDuplicates([]);setPdNumbers('');setPdStatus('idle');setPdCurrentIdx(0);setPdResults({});}} style={{flex:1,justifyContent:'center',background:'linear-gradient(135deg,#7C3AED,#2563EB)',border:'none',color:'#fff'}}>
        <I n="plus" s={14}/> Nouvelle liste
      </Btn>
    )}
    {((typeof pdStatus!=='undefined'?pdStatus:null)==='running'||(typeof pdStatus!=='undefined'?pdStatus:null)==='paused') && (typeof pdCurrentIdx!=='undefined'?pdCurrentIdx:null)<(typeof pdParsedList!=='undefined'?pdParsedList:{}).length-1 && (
      <Btn small onClick={()=>{
        const next=(typeof pdCurrentIdx!=='undefined'?pdCurrentIdx:null)+1;
        setPdResults(p=>({...p,[pdCurrentIdx]:'skipped'}));
        setPdCurrentIdx(next);
        if((typeof pdStatus!=='undefined'?pdStatus:null)==='running'){const num=(typeof pdParsedList!=='undefined'?pdParsedList:null)[next]?.number;if(num)startPhoneCall(num,null);}
      }} style={{justifyContent:'center'}}>
        <I n="skip-forward" s={14}/> Suivant
      </Btn>
    )}
    {((typeof pdStatus!=='undefined'?pdStatus:null)==='running'||(typeof pdStatus!=='undefined'?pdStatus:null)==='paused') && (
      <Btn small onClick={()=>{
        setPdResults(p=>({...p,[pdCurrentIdx]:'called'}));
        const next=(typeof pdCurrentIdx!=='undefined'?pdCurrentIdx:null)+1;
        if(next>=(typeof pdParsedList!=='undefined'?pdParsedList:{}).length){setPdStatus('done');showNotif('Tous les appels sont termines !','success');}
        else{setPdCurrentIdx(next);if((typeof pdStatus!=='undefined'?pdStatus:null)==='running'){const num=(typeof pdParsedList!=='undefined'?pdParsedList:null)[next]?.number;if(num)startPhoneCall(num,null);}}
      }} style={{justifyContent:'center',background:'#22C55E15',borderColor:'#22C55E40'}}>
        <I n="check" s={14} style={{color:'#22C55E'}}/> Fait
      </Btn>
    )}
  </div>

  {/* Number list */}
  <div style={{maxHeight:240,overflow:'auto',borderRadius:10,border:`1px solid ${T.border}`}}>
    {(typeof pdParsedList!=='undefined'?pdParsedList:{}).map((item,idx)=>{
      const isCurrent = idx===(typeof pdCurrentIdx!=='undefined'?pdCurrentIdx:null) && ((typeof pdStatus!=='undefined'?pdStatus:null)==='running'||(typeof pdStatus!=='undefined'?pdStatus:null)==='paused');
      const result = (typeof pdResults!=='undefined'?pdResults:null)[idx];
      const resultColor = result==='called'?'#22C55E':result==='skipped'?'#F59E0B':result==='missed'?'#EF4444':null;
      return (
        <div key={idx} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:isCurrent?'#7C3AED08':idx%2===0?'transparent':T.surface,borderBottom:idx<(typeof pdParsedList!=='undefined'?pdParsedList:{}).length-1?`1px solid ${T.border}`:'none',transition:'all .15s'}}>
          <div style={{width:24,height:24,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:10,fontWeight:700,
            background:isCurrent?'linear-gradient(135deg,#7C3AED,#2563EB)':result?resultColor+'15':T.bg,
            color:isCurrent?'#fff':result?resultColor:T.text3,
            border:isCurrent?'none':`1px solid ${result?resultColor+'30':T.border}`,
            boxShadow:isCurrent?'0 0 0 3px #7C3AED30':'none'}}>
            {result==='called'?<I n="check" s={10}/>:result==='skipped'?<I n="skip-forward" s={10}/>:isCurrent&&(typeof pdStatus!=='undefined'?pdStatus:null)==='running'?<div style={{width:8,height:8,borderRadius:4,background:'#fff',animation:'pulse 1s infinite'}}/>:idx+1}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:isCurrent?700:600,fontFamily:'monospace',color:isCurrent?'#7C3AED':T.text}}>{item.number}</div>
            {item.name && <div style={{fontSize:10,color:T.text3}}>{item.name}</div>}
          </div>
          {!result && !isCurrent && (
            <div onClick={()=>{startPhoneCall(item.number,null);setPdCurrentIdx(idx);if(pdStatus==='idle')(typeof setPdStatus==='function'?setPdStatus:function(){})('running');}} style={{width:24,height:24,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#22C55E10',border:'1px solid #22C55E30'}} title="Appeler"><I n="phone" s={10} style={{color:'#22C55E'}}/></div>
          )}
          {!result && (
            <div onClick={()=>{setPdParsedList(p=>p.filter((_,i)=>i!==idx));if(idx<pdCurrentIdx)(typeof setPdCurrentIdx==='function'?setPdCurrentIdx:function(){})(p=>p-1);}} style={{width:24,height:24,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#EF444408',border:'1px solid #EF444420'}} title="Retirer"><I n="x" s={10} style={{color:'#EF4444'}}/></div>
          )}
          {result && <span style={{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,background:resultColor+'12',color:resultColor}}>{result==='called'?'Appele':result==='skipped'?'Passe':'Manque'}</span>}
        </div>
      );
    })}
  </div>
</Card>
)}

{/* ═══ SECTION 5 — Campagnes sauvegardees ═══ */}
<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,marginTop:8}}>
<div style={{display:'flex',alignItems:'center',gap:8}}>
  <I n="archive" s={14} style={{color:T.text3}}/>
  <span style={{fontSize:13,fontWeight:700,color:T.text2}}>Campagnes sauvegardees</span>
  <span style={{fontSize:10,padding:'1px 6px',borderRadius:4,background:T.surface,color:T.text3}}>{(typeof phoneCampaigns!=='undefined'?phoneCampaigns:{}).length}</span>
</div>
<Btn small onClick={()=>setPhoneShowCampaignModal(true)}><I n="plus" s={12}/> Nouvelle</Btn>
</div>

{(typeof phoneCampaigns!=='undefined'?phoneCampaigns:{}).length === 0 ? (
<div style={{textAlign:'center',padding:'30px 20px',color:T.text3,borderRadius:12,border:`1px dashed ${T.border}`}}>
  <I n="inbox" s={24} style={{opacity:0.3,marginBottom:6}}/>
  <div style={{fontSize:12}}>Aucune campagne sauvegardee</div>
</div>
) : (typeof phoneCampaigns!=='undefined'?phoneCampaigns:{}).map(c=>(
<Card key={c.id} style={{padding:14,marginBottom:8}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
    <div style={{display:'flex',alignItems:'center',gap:10}}>
      <div style={{width:34,height:34,borderRadius:10,background:c.status==='active'?'#22C55E18':c.status==='paused'?'#F59E0B18':'#64748B18',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <I n={c.status==='active'?'play':c.status==='paused'?'pause':'check-circle'} s={14} style={{color:c.status==='active'?'#22C55E':c.status==='paused'?'#F59E0B':'#64748B'}}/>
      </div>
      <div>
        <div style={{fontWeight:700,fontSize:13}}>{c.name}</div>
        <div style={{fontSize:10,color:T.text3}}>{c.contacts?.length||0} contacts · {c.completed||0}/{c.contacts?.length||0} · {c.createdAt?new Date(c.createdAt).toLocaleDateString('fr-FR'):''}</div>
      </div>
    </div>
    <div style={{display:'flex',gap:4}}>
      {/* Load into dialer */}
      <div onClick={()=>{
        const nums=(c.contacts||[]).map(ct=>ct.number||ct.phone).filter(Boolean);
        if(nums.length===0){showNotif('Aucun numero dans cette campagne','danger');return;}
        setPdNumbers(nums.join('\n'));
        const seen=new Set();const unique=[];
        nums.forEach(n=>{const clean=n.replace(/\s/g,'');if(!seen.has(clean)){seen.add(clean);unique.push(n);}});
        setPdParsedList(unique.map((n,i)=>({id:i,number:n.replace(/\s/g,''),name:(c.contacts||[]).find(ct=>(ct.number||ct.phone)===n)?.name||''})));
        setPdDuplicates([]);setPdStatus('idle');setPdCurrentIdx(0);setPdResults({});
        showNotif(unique.length+' numeros charges depuis la campagne');
      }} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#7C3AED10',border:'1px solid #7C3AED30'}} title="Charger dans le dialer"><I n="upload" s={12} style={{color:'#7C3AED'}}/></div>
      {c.status==='active' && <div onClick={()=>{const up=(typeof phoneCampaigns!=='undefined'?phoneCampaigns:{}).map(x=>x.id===c.id?{...x,status:'paused'}:x);(typeof setPhoneCampaigns==='function'?setPhoneCampaigns:function(){})(up);try{localStorage.setItem('c360-phone-campaigns-'+collab.id,JSON.stringify(up))}catch(e){}}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#F59E0B10',border:'1px solid #F59E0B30'}}><I n="pause" s={12} style={{color:'#F59E0B'}}/></div>}
      {c.status==='paused' && <div onClick={()=>{const up=(typeof phoneCampaigns!=='undefined'?phoneCampaigns:{}).map(x=>x.id===c.id?{...x,status:'active'}:x);(typeof setPhoneCampaigns==='function'?setPhoneCampaigns:function(){})(up);try{localStorage.setItem('c360-phone-campaigns-'+collab.id,JSON.stringify(up))}catch(e){}}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#22C55E10',border:'1px solid #22C55E30'}}><I n="play" s={12} style={{color:'#22C55E'}}/></div>}
      <div onClick={()=>{if(!confirm('Supprimer cette campagne ?'))return;const up=(typeof phoneCampaigns!=='undefined'?phoneCampaigns:{}).filter(x=>x.id!==c.id);(typeof setPhoneCampaigns==='function'?setPhoneCampaigns:function(){})(up);try{localStorage.setItem('c360-phone-campaigns-'+collab.id,JSON.stringify(up))}catch(e){}}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#EF444408',border:'1px solid #EF444420'}}><I n="trash-2" s={12} style={{color:'#EF4444'}}/></div>
    </div>
  </div>
  {c.contacts?.length > 0 && (
    <div style={{marginTop:8,display:'flex',gap:4,flexWrap:'wrap'}}>
      {c.contacts.slice(0,5).map((ct,i)=><span key={i} style={{padding:'2px 7px',borderRadius:5,background:T.surface,fontSize:10,color:T.text2}}>{ct.name||ct.number}</span>)}
      {c.contacts.length>5 && <span style={{padding:'2px 7px',borderRadius:5,background:T.surface,fontSize:10,color:T.text3}}>+{c.contacts.length-5}</span>}
    </div>
  )}
</Card>
))}
      </div>
    </div>
  </div>
)}


{/* ═══════════════════════════════════════════════════════════════════
    3. SCRIPTS MODAL
   ═══════════════════════════════════════════════════════════════════ */}
{phoneSubTab === 'scripts' && (
  <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'20px 24px',background:'linear-gradient(135deg,#7C3AED,#6D28D9)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
<div style={{display:'flex',alignItems:'center',gap:12}}>
<div style={{width:40,height:40,borderRadius:12,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center'}}>
  <I n="file-text" s={20} style={{color:'#fff'}}/>
</div>
<div>
  <div style={{fontSize:18,fontWeight:800,color:'#fff'}}>Scripts d'appel</div>
  <div style={{fontSize:12,color:'#ffffffaa'}}>{(typeof phoneCallScripts!=='undefined'?phoneCallScripts:{}).length} scripts disponibles</div>
</div>
</div>
<div onClick={()=>setPhoneSubTab('pipeline')} style={{width:36,height:36,borderRadius:10,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.3)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.15)'}>
<I n="x" s={18} style={{color:'#fff'}}/>
</div>
      </div>

      {/* Body */}
      <div style={{flex:1,overflow:'auto',padding:24}}>
{/* Action buttons */}
<div style={{display:'flex',justifyContent:'flex-end',gap:8,marginBottom:20}}>
{collab.ai_copilot_enabled && (
  <Btn small onClick={async()=>{
    showNotif('Generation du script IA...');
    try{
      const res=await api('/api/ai-copilot/generate-script',{method:'POST',body:{role:collab.ai_copilot_role||'Commercial',objective:collab.ai_copilot_objective||'',target:collab.ai_copilot_target||''}});
      if(res&&!res.error){
        const steps=[];
        ['introduction','discovery','argumentation','objections','closing'].forEach(s=>{if(res[s])steps.push(typeof res[s]==='string'?res[s]:JSON.stringify(res[s]))});
        const ns={id:'script_ai_'+Date.now(),name:'Script IA — '+(collab.ai_copilot_role||'Custom'),steps,category:'custom'};
        setPhoneCallScripts(p=>{const u=[...p,ns];saveScriptsDual(u);return u;});
        showNotif('Script IA genere');
      }else{showNotif(res?.error||'Erreur','error')}
    }catch(e){showNotif('Erreur generation','error')}
  }} style={{background:'linear-gradient(135deg,#7C3AED,#2563EB)',border:'none',color:'#fff'}}>
    <I n="zap" s={14}/> Generer avec IA
  </Btn>
)}
<Btn small primary onClick={()=>{
  const ns={id:'script_'+Date.now(),name:'Nouveau script',steps:['Bonjour, je suis [Nom] de [Entreprise]','[Votre message ici]','Merci et bonne journee !'],category:'custom'};
  setPhoneCallScripts(p=>{const u=[...p,ns];saveScriptsDual(u);return u;});
  showNotif('Script cree');
}}>
  <I n="plus" s={14}/> Nouveau script
</Btn>
</div>

{/* Scripts grid — V2 UX inline edit */}
<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:16}}>
{(typeof phoneCallScripts!=='undefined'?phoneCallScripts:{}).map((sc,si)=>{
  const gradients = {prospection:'linear-gradient(135deg,#2563EB,#1D4ED8)',suivi:'linear-gradient(135deg,#22C55E,#16A34A)',reclamation:'linear-gradient(135deg,#EF4444,#DC2626)',rdv:'linear-gradient(135deg,#F59E0B,#D97706)'};
  const bg = gradients[sc.category] || 'linear-gradient(135deg,#7C3AED,#6D28D9)';
  const updateScript = (updater) => { setPhoneCallScripts(p => { const u = p.map((x,xi) => xi===si ? (typeof updater==='function' ? updater(x) : {...x,...updater}) : x); saveScriptsDual(u); return u; }); };
  return (
  <Card key={sc.id||si} style={{padding:0,overflow:'hidden'}}>
    {/* Header — nom éditable inline */}
    <div style={{padding:'14px 16px',background:bg}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <input value={sc.name||''} onChange={e=>updateScript({name:e.target.value})} onBlur={()=>saveScriptsDual((typeof phoneCallScripts!=='undefined'?phoneCallScripts:null))}
          style={{background:'transparent',border:'none',color:'#fff',fontWeight:700,fontSize:15,width:'100%',outline:'none',padding:0}} placeholder="Nom du script"/>
        <div style={{display:'flex',gap:6,flexShrink:0,marginLeft:8}}>
          <span onClick={()=>{try{navigator.clipboard.writeText(sc.steps.join('\n'));showNotif('Script copié')}catch(e){}}} style={{cursor:'pointer',color:'#ffffffcc'}} title="Copier"><I n="copy" s={14}/></span>
          {sc.category==='custom' && <span onClick={()=>{if(confirm('Supprimer ce script ?')){setPhoneCallScripts(p=>{const u=p.filter(x=>x.id!==sc.id);saveScriptsDual(u);return u;})}}} style={{cursor:'pointer',color:'#ffffffcc'}} title="Supprimer"><I n="trash-2" s={14}/></span>}
        </div>
      </div>
      <div style={{color:'#ffffffaa',fontSize:11,marginTop:2}}>{sc.steps.length} étapes · {sc.category||'custom'}</div>
    </div>
    {/* Steps — édition inline */}
    <div style={{padding:'12px 16px'}}>
      {sc.steps.map((step,i)=>(
        <div key={i} style={{display:'flex',gap:8,marginBottom:8,alignItems:'flex-start',group:'step'}}>
          <div style={{width:22,height:22,borderRadius:11,background:T.accentBg||'#7C3AED10',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:10,fontWeight:700,color:T.accent||'#7C3AED',marginTop:4}}>{i+1}</div>
          <textarea value={step} onChange={e=>{const val=e.target.value;updateScript(s=>({...s,steps:s.steps.map((st,j)=>j===i?val:st)}))}} onBlur={()=>saveScriptsDual((typeof phoneCallScripts!=='undefined'?phoneCallScripts:null))}
            rows={1} style={{flex:1,fontSize:12,lineHeight:1.5,color:T.text,background:T.bg2||'#F8F7F5',border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 10px',resize:'vertical',fontFamily:'inherit',outline:'none',minHeight:32}}
            onInput={e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px'}} placeholder="Texte de l'étape..."/>
          <span onClick={()=>{updateScript(s=>({...s,steps:s.steps.filter((_,j)=>j!==i)}))}} style={{cursor:'pointer',color:'#DC262644',marginTop:6,flexShrink:0}} title="Supprimer"><I n="x" s={14}/></span>
        </div>
      ))}
      {/* Bouton ajouter étape */}
      <div onClick={()=>{updateScript(s=>({...s,steps:[...s.steps,'']}))}}
        style={{display:'flex',alignItems:'center',gap:6,padding:'8px 0',cursor:'pointer',color:T.accent||'#7C3AED',fontSize:12,fontWeight:600,opacity:0.7}}>
        <I n="plus-circle" s={14}/> Ajouter une étape
      </div>
    </div>
    {/* Notes live pendant appel */}
    <div style={{padding:'0 16px 12px'}}>
      <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:4}}>📝 Notes pendant l'appel</div>
      <textarea placeholder="Prendre des notes ici pendant l'appel..." rows={2}
        style={{width:'100%',fontSize:12,color:T.text,background:T.bg2||'#F8F7F5',border:`1px solid ${T.border}`,borderRadius:8,padding:'8px 10px',resize:'vertical',fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}
        defaultValue={sc._liveNotes||''}
        onBlur={e=>{const val=e.target.value;if(val!==sc._liveNotes){updateScript({_liveNotes:val})}}}/>
    </div>
  </Card>
);})}
</div>

{(typeof phoneCallScripts!=='undefined'?phoneCallScripts:{}).length === 0 && (
<div style={{textAlign:'center',padding:'60px 20px',color:T.text3}}>
  <div style={{width:64,height:64,borderRadius:20,background:'#7C3AED12',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}><I n="file-text" s={28} style={{color:'#7C3AED'}}/></div>
  <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Aucun script</div>
  <div style={{fontSize:13}}>Créez votre premier script d'appel ou générez-en un avec l'IA</div>
</div>
)}
      </div>
    </div>
  </div>
)}


{/* ═══════════════════════════════════════════════════════════════════
    4. SCHEDULED CALLS MODAL
   ═══════════════════════════════════════════════════════════════════ */}
{phoneSubTab === 'scheduled' && (
  <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'20px 24px',background:'linear-gradient(135deg,#2563EB,#1D4ED8)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
<div style={{display:'flex',alignItems:'center',gap:12}}>
<div style={{width:40,height:40,borderRadius:12,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center'}}>
  <I n="clock" s={20} style={{color:'#fff'}}/>
</div>
<div>
  <div style={{fontSize:18,fontWeight:800,color:'#fff'}}>Appels programmes</div>
  <div style={{fontSize:12,color:'#ffffffaa'}}>Planifiez vos appels pour ne rien oublier</div>
</div>
</div>
<div onClick={()=>setPhoneSubTab('pipeline')} style={{width:36,height:36,borderRadius:10,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.3)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.15)'}>
<I n="x" s={18} style={{color:'#fff'}}/>
</div>
      </div>

      {/* Body */}
      <div style={{flex:1,overflow:'auto',padding:24}}>
{(()=>{
const now = new Date();
const upcoming = ((typeof phoneScheduledCalls!=='undefined'?phoneScheduledCalls:null)||[]).filter(s=>new Date(s.date+'T'+s.time)>now).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
const past = ((typeof phoneScheduledCalls!=='undefined'?phoneScheduledCalls:null)||[]).filter(s=>new Date(s.date+'T'+s.time)<=now);
return (
<div>
  {/* Action bar */}
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
    <div style={{fontSize:12,color:T.text3}}>{upcoming.length} a venir · {past.length} passes</div>
    <Btn small primary onClick={()=>setPhoneShowScheduleModal(true)}><I n="plus" s={14}/> Programmer un appel</Btn>
  </div>

  {/* Empty state */}
  {upcoming.length === 0 && past.length === 0 ? (
    <div style={{textAlign:'center',padding:'60px 20px',color:T.text3}}>
      <div style={{width:64,height:64,borderRadius:20,background:'#2563EB12',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}><I n="clock" s={28} style={{color:'#2563EB'}}/></div>
      <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Aucun appel programme</div>
      <div style={{fontSize:13}}>Planifiez vos appels pour ne rien oublier</div>
    </div>
  ) : (
    <div>
      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:'#2563EB',marginBottom:10,display:'flex',alignItems:'center',gap:6}}><I n="arrow-up-circle" s={14}/> A venir ({upcoming.length})</div>
          {upcoming.map(sc=>{
            const ct = (contacts||[]).find(c=>c.id===sc.contactId);
            return (
            <Card key={sc.id} style={{padding:14,marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#2563EB,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,fontWeight:700}}>{(ct?.name||sc.number||'?')[0].toUpperCase()}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>{ct?.name||sc.number}</div>
                    <div style={{fontSize:11,color:T.text3}}>{sc.date} a {sc.time}{sc.notes?` · ${sc.notes}`:''}</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:6}}>
                  <Btn small primary onClick={()=>{startPhoneCall(sc.number||ct?.phone,sc.contactId);removeScheduledCall(sc.id)}}><I n="phone" s={12}/></Btn>
                  <Btn small onClick={()=>removeScheduledCall(sc.id)}><I n="x" s={12}/></Btn>
                </div>
              </div>
            </Card>);
          })}
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <div style={{fontSize:13,fontWeight:700,color:T.text3,marginBottom:10,display:'flex',alignItems:'center',gap:6}}><I n="check-circle" s={14}/> Passes ({past.length})</div>
          {past.map(sc=>{
            const ct = (contacts||[]).find(c=>c.id===sc.contactId);
            return (
            <Card key={sc.id} style={{padding:14,marginBottom:8,opacity:0.6}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:36,height:36,borderRadius:10,background:T.surface,display:'flex',alignItems:'center',justifyContent:'center',color:T.text3,fontSize:13,fontWeight:700}}>{(ct?.name||sc.number||'?')[0].toUpperCase()}</div>
                  <div>
                    <div style={{fontWeight:600,fontSize:13,color:T.text2}}>{ct?.name||sc.number}</div>
                    <div style={{fontSize:11,color:T.text3}}>{sc.date} a {sc.time}</div>
                  </div>
                </div>
                <Btn small onClick={()=>removeScheduledCall(sc.id)}><I n="trash-2" s={12}/></Btn>
              </div>
            </Card>);
          })}
        </div>
      )}
    </div>
  )}
</div>);
})()}
      </div>
    </div>
  </div>
)}


{/* ═══════════════════════════════════════════════════════════════════
    5. ANALYSES IA MODAL
   ═══════════════════════════════════════════════════════════════════ */}
{phoneSubTab === 'analyses' && (
  <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'20px 24px',background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
<div style={{display:'flex',alignItems:'center',gap:12}}>
<div style={{width:40,height:40,borderRadius:12,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center'}}>
  <I n="cpu" s={20} style={{color:'#fff'}}/>
</div>
<div>
  <div style={{fontSize:18,fontWeight:800,color:'#fff'}}>Analyses IA</div>
  <div style={{fontSize:12,color:'#ffffffaa'}}>Intelligence artificielle sur vos appels</div>
</div>
</div>
<div onClick={()=>setPhoneSubTab('pipeline')} style={{width:36,height:36,borderRadius:10,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.3)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.15)'}>
<I n="x" s={18} style={{color:'#fff'}}/>
</div>
      </div>

      {/* Body */}
      <div style={{flex:1,overflow:'auto',padding:24}}>
{(()=>{
const analysesArr = Object.values((typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)||{}).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
return (
<div>
  {/* Action bar: auto-analyse toggle */}
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
    <div style={{fontSize:12,color:T.text3}}>{analysesArr.length} appel{analysesArr.length>1?'s':''} analyse{analysesArr.length>1?'s':''}</div>
    <div onClick={togglePhoneAutoRecap} style={{padding:'8px 14px',borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:600,display:'flex',alignItems:'center',gap:6,background:(typeof phoneAutoRecap!=='undefined'?phoneAutoRecap:null)?'#7C3AED10':'transparent',border:`1px solid ${phoneAutoRecap?'#7C3AED30':T.border}`,color:(typeof phoneAutoRecap!=='undefined'?phoneAutoRecap:null)?'#7C3AED':T.text3,transition:'all .2s'}}>
      <I n="zap" s={14}/> Auto-analyse {(typeof phoneAutoRecap!=='undefined'?phoneAutoRecap:null)?'ON':'OFF'}
    </div>
  </div>

  {/* 4 KPI cards */}
  {analysesArr.length > 0 && (
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
      {[
        {label:'Score moyen',value:Math.round(analysesArr.reduce((a,c)=>a+(c.qualityScore||0),0)/analysesArr.length)+'%',color:'#7C3AED',icon:'award'},
        {label:'Sentiment positif',value:analysesArr.filter(a=>(a.sentimentScore||0)>70).length,color:'#22C55E',icon:'smile'},
        {label:'Suivis requis',value:analysesArr.filter(a=>a.followupRecommended).length,color:'#F59E0B',icon:'alert-circle'},
        {label:'Actions en attente',value:analysesArr.reduce((a,c)=>a+((c.actionItems||[]).length),0),color:'#2563EB',icon:'list'},
      ].map((k,i)=>(
        <div key={i} style={{padding:'14px 10px',borderRadius:12,background:k.color+'08',border:`1px solid ${k.color}18`,textAlign:'center'}}>
          <I n={k.icon} s={18} style={{color:k.color}}/>
          <div style={{fontSize:22,fontWeight:800,color:k.color,marginTop:4}}>{k.value}</div>
          <div style={{fontSize:10,color:T.text3,fontWeight:600}}>{k.label}</div>
        </div>
      ))}
    </div>
  )}

  {/* Empty state */}
  {analysesArr.length === 0 ? (
    <div style={{textAlign:'center',padding:'60px 20px'}}>
      <div style={{width:80,height:80,borderRadius:24,background:'linear-gradient(135deg,#7C3AED10,#2563EB10)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
        <I n="cpu" s={36} style={{color:'#7C3AED',opacity:0.4}}/>
      </div>
      <div style={{fontSize:18,fontWeight:700,color:T.text2}}>Aucune analyse IA</div>
      <div style={{fontSize:13,color:T.text3,marginTop:6,maxWidth:400,margin:'6px auto 0'}}>Cliquez sur l'icone IA a cote de chaque appel dans l'historique pour lancer une analyse IA avec compte-rendu detaille.</div>
      <div style={{marginTop:16}}><Btn small primary onClick={()=>setPhoneSubTab('history')}><I n="list" s={14}/> Voir l'historique</Btn></div>
    </div>
  ) : (
    /* Analysis cards list */
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {analysesArr.map(analysis=>(
        <Card key={analysis.id} style={{padding:16,cursor:'pointer',borderLeft:`4px solid ${(analysis.sentimentScore||0)>70?'#22C55E':(analysis.sentimentScore||0)>40?'#F59E0B':'#EF4444'}`,transition:'all .15s'}} onClick={()=>setPhoneAnalysisModal(analysis.id)} onMouseEnter={e=>e.currentTarget.style.transform='translateX(2px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateX(0)'}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            {/* Sentiment emoji */}
            <div style={{width:44,height:44,borderRadius:22,background:(analysis.sentimentScore||0)>70?'#22C55E10':(analysis.sentimentScore||0)>40?'#F59E0B10':'#EF444410',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{fontSize:20}}>{(analysis.sentimentScore||0)>70?'😊':(analysis.sentimentScore||0)>40?'😐':'😟'}</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <span style={{fontSize:14,fontWeight:700}}>{analysis.contactName||'Contact'}</span>
                {/* Quality badge */}
                <Badge color={(analysis.qualityScore||0)>=70?'#22C55E':(analysis.qualityScore||0)>=40?'#F59E0B':'#EF4444'}>{analysis.qualityScore||0}%</Badge>
                {analysis.sentiment && <Badge color={(analysis.sentimentScore||0)>70?'#22C55E':(analysis.sentimentScore||0)>40?'#F59E0B':'#EF4444'}>{analysis.sentiment}</Badge>}
              </div>
              {/* Summary preview */}
              {analysis.summary && <div style={{fontSize:12,color:T.text3,marginTop:2,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{analysis.summary}</div>}
              {/* Tags */}
              {(analysis.tags||[]).length > 0 && (
                <div style={{display:'flex',gap:4,marginTop:4,flexWrap:'wrap'}}>
                  {analysis.tags.map(t=><span key={t} style={{fontSize:9,padding:'1px 6px',borderRadius:4,background:'#7C3AED10',color:'#7C3AED',fontWeight:600}}>{t}</span>)}
                </div>
              )}
            </div>
            {/* Right side: date + duration */}
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontSize:12,fontWeight:600}}>{analysis.createdAt?new Date(analysis.createdAt).toLocaleDateString('fr-FR'):''}</div>
              {analysis.duration && <div style={{fontSize:11,color:T.text3}}>{fmtDur(analysis.duration)}</div>}
              {analysis.followupRecommended && <div style={{fontSize:10,color:'#F59E0B',fontWeight:600,marginTop:2}}>Suivi requis</div>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )}
</div>);
})()}
      </div>
    </div>
  </div>
)}
{/* ═══════════════════════════════════════════════════════════════════════════
    MODALS PART C — Settings, Secure IA, Copilot Dashboard, Kept Modals + Closing
   ═══════════════════════════════════════════════════════════════════════════ */}

  {/* ═══════════════════════════════════════════════════════════════════
      TRAINING IA
     ═══════════════════════════════════════════════════════════════════ */}
  {phoneSubTab === 'training' && <PhoneTrainingScreen appMyPhoneNumbers={appMyPhoneNumbers} collab={collab} company={company} showNotif={showNotif} />}

  {/* ═══════════════════════════════════════════════════════════════════
      SETTINGS MODAL
     ═══════════════════════════════════════════════════════════════════ */}
  {phoneSubTab === 'settings' && (()=>{
    return (
    <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
{/* Header */}
<div style={{padding:'20px 24px',background:'linear-gradient(135deg,#64748B,#475569)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
<div style={{display:'flex',alignItems:'center',gap:12}}>
  <div style={{width:44,height:44,borderRadius:14,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center'}}>
    <I n="settings" s={22} style={{color:'#fff'}}/>
  </div>
  <div>
    <div style={{fontSize:18,fontWeight:800,color:'#fff'}}>Réglages téléphone</div>
    <div style={{fontSize:12,color:'#ffffffaa'}}>Configurez votre expérience téléphonique</div>
  </div>
</div>
<div onClick={()=>setPhoneSubTab('pipeline')} style={{cursor:'pointer',width:34,height:34,borderRadius:10,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.25)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.15)'}>
  <I n="x" s={18} style={{color:'#fff'}}/>
</div>
</div>

{/* Scrollable content */}
<div style={{flex:1,overflow:'auto',padding:24}}>

{/* ── Setting cards grid ── */}
<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:16,marginBottom:28}}>

  {/* a) Ne pas déranger */}
  <Card style={{padding:16}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <I n="moon" s={18} style={{color:(typeof phoneDND!=='undefined'?phoneDND:null)?'#DC2626':T.text3}}/>
        <span style={{fontWeight:700,fontSize:14}}>Ne pas déranger</span>
      </div>
      <div onClick={togglePhoneDND} style={{width:44,height:24,borderRadius:12,background:(typeof phoneDND!=='undefined'?phoneDND:null)?'#DC2626':'#CBD5E1',cursor:'pointer',position:'relative',transition:'all .3s'}}>
        <div style={{width:20,height:20,borderRadius:10,background:'#fff',position:'absolute',top:2,left:(typeof phoneDND!=='undefined'?phoneDND:null)?22:2,transition:'all .3s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
      </div>
    </div>
    <div style={{fontSize:12,color:T.text3,lineHeight:1.5}}>Bloque tous les appels entrants. Les appels seront redirigés vers la messagerie vocale.</div>
    {(typeof phoneDND!=='undefined'?phoneDND:null) && <div style={{marginTop:8,padding:'6px 12px',borderRadius:8,background:'#DC262612',color:'#DC2626',fontSize:12,fontWeight:600,display:'flex',alignItems:'center',gap:6}}><I n="alert-circle" s={14}/> Mode actif — appels bloqués</div>}
  </Card>

  {/* b) Enregistrement auto */}
  <Card style={{padding:16}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <I n="mic" s={18} style={{color:(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?'#EF4444':T.text3}}/>
        <span style={{fontWeight:700,fontSize:14}}>Enregistrement auto</span>
      </div>
      <div onClick={_isAdminPhone ? (()=>{const v=!phoneRecordingEnabled;(typeof setPhoneRecordingEnabled==='function'?setPhoneRecordingEnabled:function(){})(v);try{localStorage.setItem('c360-phone-record-'+collab.id,v?"1":"0")}catch(e){}}) : (()=>showNotif("Réservé à l'administrateur","danger"))} title={_isAdminPhone ? '' : "Réservé à l'administrateur"} style={{width:44,height:24,borderRadius:12,background:phoneRecordingEnabled?'#EF4444':'#CBD5E1',cursor:_isAdminPhone?'pointer':'not-allowed',opacity:_isAdminPhone?1:0.5,position:'relative',transition:'all .3s'}}>
        <div style={{width:20,height:20,borderRadius:10,background:'#fff',position:'absolute',top:2,left:(typeof phoneRecordingEnabled!=='undefined'?phoneRecordingEnabled:null)?22:2,transition:'all .3s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
      </div>
    </div>
    <div style={{fontSize:12,color:T.text3,lineHeight:1.5}}>Enregistre automatiquement tous les appels pour écoute et analyse ultérieure.</div>
  </Card>

  {/* c) Analyse IA auto */}
  <Card style={{padding:16}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <I n="cpu" s={18} style={{color:(typeof phoneAutoRecap!=='undefined'?phoneAutoRecap:null)?'#7C3AED':T.text3}}/>
        <span style={{fontWeight:700,fontSize:14}}>Analyse IA automatique</span>
      </div>
      <div onClick={()=>{const v=!phoneAutoRecap;(typeof setPhoneAutoRecap==='function'?setPhoneAutoRecap:function(){})(v);try{localStorage.setItem('c360-phone-autorecap-'+collab.id,v?"1":"0")}catch(e){}}} style={{width:44,height:24,borderRadius:12,background:phoneAutoRecap?'#7C3AED':'#CBD5E1',cursor:'pointer',position:'relative',transition:'all .3s'}}>
        <div style={{width:20,height:20,borderRadius:10,background:'#fff',position:'absolute',top:2,left:(typeof phoneAutoRecap!=='undefined'?phoneAutoRecap:null)?22:2,transition:'all .3s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
      </div>
    </div>
    <div style={{fontSize:12,color:T.text3,lineHeight:1.5}}>Génère automatiquement un compte-rendu IA après chaque appel.</div>
  </Card>

  {/* d) SMS automatiques */}
  <Card style={{padding:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <I n="message-square" s={18} style={{color:'#2563EB'}}/>
      <span style={{fontWeight:700,fontSize:14}}>SMS automatiques</span>
    </div>

    {/* Option 1: Appel reçu manqué */}
    <div style={{padding:12,borderRadius:10,border:'1px solid '+T.border,background:T.bg,marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:T.text}}>📞 Appel reçu — pas de réponse</div>
          <div style={{fontSize:10,color:T.text3,marginTop:2}}>SMS envoyé au numéro qui vous a appelé si vous ne décrochez pas</div>
        </div>
        <div onClick={togglePhoneAutoSMS} style={{width:40,height:22,borderRadius:11,background:(typeof phoneAutoSMS!=='undefined'?phoneAutoSMS:null)?'#2563EB':'#CBD5E1',cursor:'pointer',position:'relative',transition:'all .3s',flexShrink:0}}>
          <div style={{width:18,height:18,borderRadius:9,background:'#fff',position:'absolute',top:2,left:(typeof phoneAutoSMS!=='undefined'?phoneAutoSMS:null)?20:2,transition:'all .3s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
        </div>
      </div>
      {(typeof phoneAutoSMS!=='undefined'?phoneAutoSMS:null) && (
        <textarea value={phoneAutoSMSText} onChange={e=>{(typeof setPhoneAutoSMSText==='function'?setPhoneAutoSMSText:function(){})(e.target.value);try{localStorage.setItem('c360-phone-autoSMSText-'+collab.id,e.target.value)}catch(e){}}} placeholder="Ex: Désolé, je suis indisponible. Je vous rappelle dès que possible." rows={2} style={{width:'100%',padding:8,borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:11,fontFamily:'inherit',color:T.text,resize:'none',outline:'none'}}/>
      )}
    </div>

    {/* Option 2: Appel émis NRP */}
    {(()=>{
      const nrpKey = 'c360-phone-autosms-nrp-'+collab.id;
      const nrpTextKey = 'c360-phone-autosms-nrp-text-'+collab.id;
      const isOn = localStorage.getItem(nrpKey)==='1';
      const text = localStorage.getItem(nrpTextKey)||"Bonjour, j'ai essayé de vous joindre. N'hésitez pas à me rappeler. Cordialement.";
      return <div style={{padding:12,borderRadius:10,border:'1px solid '+T.border,background:T.bg}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:T.text}}>📱 Appel émis — NRP (pas de réponse)</div>
            <div style={{fontSize:10,color:T.text3,marginTop:2}}>SMS envoyé au prospect quand il ne décroche pas à votre appel</div>
          </div>
          <div onClick={()=>{const v=!isOn;localStorage.setItem(nrpKey,v?'1':'0');showNotif(v?'SMS auto NRP activé':'SMS auto NRP désactivé');setPhoneRightAccordion(p=>({...p,_r:Date.now()}));}} style={{width:40,height:22,borderRadius:11,background:isOn?'#F59E0B':'#CBD5E1',cursor:'pointer',position:'relative',transition:'all .3s',flexShrink:0}}>
            <div style={{width:18,height:18,borderRadius:9,background:'#fff',position:'absolute',top:2,left:isOn?20:2,transition:'all .3s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
          </div>
        </div>
        {isOn && (
          <textarea defaultValue={text} onBlur={e=>{localStorage.setItem(nrpTextKey,e.target.value);}} placeholder="Ex: J'ai essayé de vous joindre. Rappel possible au..." rows={2} style={{width:'100%',padding:8,borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:11,fontFamily:'inherit',color:T.text,resize:'none',outline:'none'}}/>
        )}
      </div>;
    })()}

  </Card>

  {/* Automatisation SMS par colonne — CARD SEPAREE */}
  <Card style={{padding:16}}>
    <div style={{padding:0}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:T.text}}>🔄 Automatisation SMS par colonne</div>
          <div style={{fontSize:10,color:T.text3,marginTop:2}}>Activez les SMS automatiques quand un contact entre ou sort d'une colonne. Trames prêtes, personnalisables.</div>
        </div>
      </div>
      {(()=>{
        const storageKey = 'c360-sms-auto-pipeline-'+collab.id;
        const allStages = orderedStages || [];

        // Trames par défaut pour chaque colonne
        const defaultTemplates = {
          nouveau: { entryText: "Bonjour {nom}, merci pour votre intérêt ! Nous vous recontacterons très rapidement.", exitText: "" },
          contacte: { entryText: "Bonjour {nom}, suite à notre échange, n'hésitez pas à nous recontacter si vous avez des questions.", exitText: "" },
          qualifie: { entryText: "Bonjour {nom}, nous avons bien noté votre intérêt. Nous allons vous proposer un créneau de rendez-vous.", exitText: "" },
          rdv_programme: { entryText: "Bonjour {nom}, votre RDV est confirmé le {date_rdv} à {heure_rdv}. À bientôt !", exitText: "Bonjour {nom}, votre rendez-vous a été modifié. Nous vous recontacterons pour reprogrammer." },
          nrp: { entryText: "Bonjour {nom}, j'ai essayé de vous joindre sans succès. N'hésitez pas à me rappeler. Cordialement.", exitText: "" },
          client_valide: { entryText: "Félicitations {nom} ! Votre dossier est validé. Bienvenue parmi nos clients ! Nous vous accompagnons.", exitText: "" },
          perdu: { entryText: "", exitText: "" },
        };

        // Initialiser les rules avec TOUTES les colonnes pré-remplies
        let rules = [];
        try { rules = JSON.parse(localStorage.getItem(storageKey)||'[]'); } catch {}

        // Si aucune rule, initialiser avec toutes les colonnes
        if (rules.length === 0) {
          rules = allStages.map(s => ({
            stageId: s.id, label: s.label, color: s.color,
            entryEnabled: false,
            entryText: defaultTemplates[s.id]?.entryText || "Bonjour {nom}, votre statut a été mis à jour vers " + s.label + ".",
            exitEnabled: false,
            exitText: defaultTemplates[s.id]?.exitText || "",
          }));
          localStorage.setItem(storageKey, JSON.stringify(rules));
        }
        // Ajouter les colonnes manquantes (nouvelles colonnes custom)
        const ruleIds = rules.map(r=>r.stageId);
        const missing = allStages.filter(s=>!ruleIds.includes(s.id));
        if (missing.length > 0) {
          missing.forEach(s => {
            rules.push({ stageId: s.id, label: s.label, color: s.color, entryEnabled: false, entryText: defaultTemplates[s.id]?.entryText || "Bonjour {nom}, votre dossier passe en " + s.label + ".", exitEnabled: false, exitText: "" });
          });
          localStorage.setItem(storageKey, JSON.stringify(rules));
        }

        const saveRules = (newRules) => {
          localStorage.setItem(storageKey, JSON.stringify(newRules));
          setPhoneRightAccordion(p=>({...p,_r:Date.now()}));
        };

        const updateRule = (idx, field, value) => {
          const nr = [...rules];
          nr[idx] = {...nr[idx], [field]: value};
          saveRules(nr);
        };

        // Réordonner selon l'ordre des colonnes pipeline
        const stageOrder = allStages.map(s=>s.id);
        const sortedRules = [...rules].sort((a,b) => {
          const ai = stageOrder.indexOf(a.stageId);
          const bi = stageOrder.indexOf(b.stageId);
          return (ai===-1?999:ai) - (bi===-1?999:bi);
        });

        return <>
          {sortedRules.map((rule) => {
            const idx = rules.findIndex(r=>r.stageId===rule.stageId);
            const hasAnyActive = rule.entryEnabled || rule.exitEnabled;
            return (
            <div key={rule.stageId} style={{padding:10,borderRadius:8,border:'1px solid '+(hasAnyActive?rule.color+'50':T.border),background:hasAnyActive?rule.color+'06':T.card,marginBottom:6,transition:'all .2s'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:(rule.entryEnabled||rule.exitEnabled)?8:0}}>
                <span style={{width:8,height:8,borderRadius:4,background:rule.color,flexShrink:0}}/>
                <span style={{fontSize:11,fontWeight:700,color:T.text,flex:1}}>{rule.label}</span>

                {/* Toggle entrée */}
                <div style={{display:'flex',alignItems:'center',gap:3}}>
                  <span style={{fontSize:9,color:rule.entryEnabled?'#22C55E':T.text3,fontWeight:600}}>📥</span>
                  <div onClick={()=>updateRule(idx,'entryEnabled',!rule.entryEnabled)} style={{width:32,height:18,borderRadius:9,background:rule.entryEnabled?'#22C55E':'#CBD5E1',cursor:'pointer',position:'relative',transition:'all .3s',flexShrink:0}}>
                    <div style={{width:14,height:14,borderRadius:7,background:'#fff',position:'absolute',top:2,left:rule.entryEnabled?16:2,transition:'all .3s',boxShadow:'0 1px 2px rgba(0,0,0,.2)'}}/>
                  </div>
                </div>

                {/* Toggle sortie */}
                <div style={{display:'flex',alignItems:'center',gap:3,marginLeft:4}}>
                  <span style={{fontSize:9,color:rule.exitEnabled?'#F59E0B':T.text3,fontWeight:600}}>📤</span>
                  <div onClick={()=>updateRule(idx,'exitEnabled',!rule.exitEnabled)} style={{width:32,height:18,borderRadius:9,background:rule.exitEnabled?'#F59E0B':'#CBD5E1',cursor:'pointer',position:'relative',transition:'all .3s',flexShrink:0}}>
                    <div style={{width:14,height:14,borderRadius:7,background:'#fff',position:'absolute',top:2,left:rule.exitEnabled?16:2,transition:'all .3s',boxShadow:'0 1px 2px rgba(0,0,0,.2)'}}/>
                  </div>
                </div>
              </div>

              {/* Textarea entrée */}
              {rule.entryEnabled && <div style={{marginTop:4}}>
                <div style={{fontSize:9,fontWeight:600,color:'#22C55E',marginBottom:2}}>📥 SMS à l'entrée :</div>
                <textarea value={rule.entryText} onChange={e=>updateRule(idx,'entryText',e.target.value)} rows={2} style={{width:'100%',padding:6,borderRadius:6,border:'1px solid #22C55E30',background:T.card,fontSize:10,fontFamily:'inherit',color:T.text,resize:'none',outline:'none'}}/>
              </div>}

              {/* Textarea sortie */}
              {rule.exitEnabled && <div style={{marginTop:4}}>
                <div style={{fontSize:9,fontWeight:600,color:'#F59E0B',marginBottom:2}}>📤 SMS à la sortie :</div>
                <textarea value={rule.exitText} onChange={e=>updateRule(idx,'exitText',e.target.value)} rows={2} style={{width:'100%',padding:6,borderRadius:6,border:'1px solid #F59E0B30',background:T.card,fontSize:10,fontFamily:'inherit',color:T.text,resize:'none',outline:'none'}}/>
              </div>}
            </div>
          );})}
          <div style={{fontSize:9,color:T.text3,marginTop:6,padding:'4px 0',borderTop:'1px solid '+T.border}}>
            Variables : <b>{'{nom}'}</b>, <b>{'{prenom}'}</b>, <b>{'{email}'}</b>, <b>{'{phone}'}</b>, <b>{'{date_rdv}'}</b>, <b>{'{heure_rdv}'}</b> — 📥 = SMS quand le contact arrive · 📤 = SMS quand il quitte
          </div>
        </>;
      })()}
    </div>
  </Card>

  {/* e) Power Dialer settings */}
  <Card style={{padding:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <I n="zap" s={18} style={{color:'#F59E0B'}}/>
      <span style={{fontWeight:700,fontSize:14}}>Power Dialer</span>
    </div>
    <div style={{padding:12,borderRadius:10,border:'1px solid '+T.border,background:T.bg}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:T.text}}>Temps de sonnerie max</div>
          <div style={{fontSize:10,color:T.text3,marginTop:2}}>Raccrocher auto si pas de réponse après X secondes</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <input type="number" min={5} max={60} step={5} defaultValue={parseInt(localStorage.getItem('c360-pd-ring-timeout-'+collab.id)||'15',10)} onChange={e=>{localStorage.setItem('c360-pd-ring-timeout-'+collab.id,e.target.value);showNotif('Ring timeout: '+e.target.value+'s');}} style={{width:55,padding:'6px 8px',borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:13,fontWeight:700,textAlign:'center',color:T.text}}/>
          <span style={{fontSize:11,color:T.text3}}>sec</span>
        </div>
      </div>
    </div>
  </Card>

  {/* f) Horaires d'ouverture */}
  <Card style={{padding:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
      <I n="clock" s={18} style={{color:'#22C55E'}}/>
      <span style={{fontWeight:700,fontSize:14}}>Horaires d'ouverture</span>
    </div>
    <div style={{display:'flex',gap:8,marginBottom:10}}>
      <div style={{flex:1}}>
        <div style={{fontSize:11,color:T.text3,marginBottom:4}}>Début</div>
        <input type="time" value={(typeof phoneOpenHours!=='undefined'?phoneOpenHours:{}).start} onChange={e=>{const up={...phoneOpenHours,start:e.target.value};(typeof setPhoneOpenHours==='function'?setPhoneOpenHours:function(){})(up);try{localStorage.setItem('c360-phone-openHours-'+collab.id,JSON.stringify(up))}catch(e){}}} style={{width:'100%',padding:'6px 10px',borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:13,color:T.text}}/>
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:11,color:T.text3,marginBottom:4}}>Fin</div>
        <input type="time" value={(typeof phoneOpenHours!=='undefined'?phoneOpenHours:{}).end} onChange={e=>{const up={...phoneOpenHours,end:e.target.value};(typeof setPhoneOpenHours==='function'?setPhoneOpenHours:function(){})(up);try{localStorage.setItem('c360-phone-openHours-'+collab.id,JSON.stringify(up))}catch(e){}}} style={{width:'100%',padding:'6px 10px',borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:13,color:T.text}}/>
      </div>
    </div>
    <div style={{display:'flex',gap:4}}>
      {['L','M','Me','J','V','S','D'].map((d,i)=>(
        <div key={i} onClick={()=>{const up={...phoneOpenHours,days:(typeof phoneOpenHours!=='undefined'?phoneOpenHours:{}).days.includes(i+1)?phoneOpenHours.days.filter(x=>x!==i+1):[...phoneOpenHours.days,i+1]};(typeof setPhoneOpenHours==='function'?setPhoneOpenHours:function(){})(up);try{localStorage.setItem('c360-phone-openHours-'+collab.id,JSON.stringify(up))}catch(e){}}} style={{flex:1,textAlign:'center',padding:'6px 0',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:600,color:(typeof phoneOpenHours!=='undefined'?phoneOpenHours:{}).days.includes(i+1)?'#fff':T.text3,background:(typeof phoneOpenHours!=='undefined'?phoneOpenHours:{}).days.includes(i+1)?T.accent:T.surface,border:`1px solid ${(typeof phoneOpenHours!=='undefined'?phoneOpenHours:{}).days.includes(i+1)?T.accent:T.border}`,transition:'all .2s'}}>{d}</div>
      ))}
    </div>
  </Card>

  {/* f) Messagerie vocale */}
  <Card style={{padding:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
      <I n="voicemail" s={18} style={{color:'#F59E0B'}}/>
      <span style={{fontWeight:700,fontSize:14}}>Messagerie vocale</span>
      <span style={{marginLeft:'auto',fontSize:11,padding:'2px 8px',borderRadius:6,background:'#F59E0B12',color:'#F59E0B',fontWeight:700}}>{(typeof phoneVoicemails!=='undefined'?phoneVoicemails:{}).length}</span>
    </div>
    <div style={{fontSize:12,color:T.text3,marginBottom:8}}>{(typeof phoneVoicemails!=='undefined'?phoneVoicemails:{}).length} message{(typeof phoneVoicemails!=='undefined'?phoneVoicemails:{}).length>1?'s':''} vocal{(typeof phoneVoicemails!=='undefined'?phoneVoicemails:{}).length>1?'aux':''}</div>
    {(typeof phoneVoicemails!=='undefined'?phoneVoicemails:{}).length === 0 ? (
      <div style={{padding:'16px 0',textAlign:'center',color:T.text3,fontSize:12}}><I n="inbox" s={20} style={{color:T.border,marginBottom:4}}/><br/>Aucun message vocal</div>
    ) : (typeof phoneVoicemails!=='undefined'?phoneVoicemails:{}).slice(0,3).map((vm,i)=>(
      <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:i<Math.min((typeof phoneVoicemails!=='undefined'?phoneVoicemails:{}).length,3)-1?`1px solid ${T.border}`:'none'}}>
        <I n="voicemail" s={14} style={{color:'#F59E0B'}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:600}}>{vm.from||'Inconnu'}</div>
          <div style={{fontSize:11,color:T.text3}}>{vm.duration||'0:30'} · {vm.date||"Aujourd'hui"}</div>
        </div>
        <I n="play" s={14} style={{color:T.accent,cursor:'pointer'}}/>
      </div>
    ))}
  </Card>
</div>

{/* ═══ BLACKLIST — Numéros bloqués ═══ */}
<div style={{marginBottom:28}}>
  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
    <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#DC2626,#EF4444)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 3px 10px rgba(220,38,38,0.2)'}}>
      <I n="shield" s={18} style={{color:'#fff'}}/>
    </div>
    <div style={{flex:1}}>
      <div style={{fontSize:16,fontWeight:800}}>Numéros bloqués</div>
      <div style={{fontSize:12,color:T.text3}}>{(typeof phoneBlacklist!=='undefined'?phoneBlacklist:{}).length} numéro{(typeof phoneBlacklist!=='undefined'?phoneBlacklist:{}).length>1?'s':''} dans la blacklist</div>
    </div>
    <Btn small onClick={()=>{
      const num = prompt('Entrez le numéro à bloquer :');
      if(num && num.trim().length > 4) { addToBlacklist(num.trim()); showNotif('Numéro bloqué'); }
      else if(num) showNotif('Numéro invalide','danger');
    }} style={{background:'#DC262612',color:'#DC2626',border:'1px solid #DC262630'}}>
      <I n="plus" s={13}/> Bloquer un numéro
    </Btn>
  </div>

  {(typeof phoneBlacklist!=='undefined'?phoneBlacklist:{}).length === 0 ? (
    <Card style={{padding:32,textAlign:'center'}}>
      <I n="shield-off" s={36} style={{color:T.border,marginBottom:10}}/>
      <div style={{fontSize:14,fontWeight:600,color:T.text2}}>Aucun numéro bloqué</div>
      <div style={{fontSize:12,color:T.text3,marginTop:4}}>Les numéros bloqués ne pourront plus vous contacter</div>
    </Card>
  ) : (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {(typeof phoneBlacklist!=='undefined'?phoneBlacklist:{}).map((num, i) => (
        <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:12,background:T.surface,border:`1px solid ${T.border}`,transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background=T.bg} onMouseLeave={e=>e.currentTarget.style.background=T.surface}>
          <div style={{width:32,height:32,borderRadius:10,background:'#DC262612',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <I n="phone-off" s={14} style={{color:'#DC2626'}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:T.text}}>{num}</div>
          </div>
          <div onClick={()=>{removeFromBlacklist(num);showNotif('Numéro débloqué');}} style={{padding:'5px 12px',borderRadius:8,background:'#22C55E12',color:'#22C55E',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:4,border:'1px solid #22C55E25',transition:'all .15s'}} onMouseEnter={e=>{e.currentTarget.style.background='#22C55E20';}} onMouseLeave={e=>{e.currentTarget.style.background='#22C55E12';}}>
            <I n="unlock" s={12}/> Débloquer
          </div>
        </div>
      ))}
    </div>
  )}
</div>

{/* ═══ MODULES & OPTIONS ═══ */}
<div>
  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
    <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 3px 10px rgba(124,58,237,0.2)'}}>
      <I n="layers" s={18} style={{color:'#fff'}}/>
    </div>
    <div style={{flex:1}}>
      <div style={{fontSize:16,fontWeight:800}}>Modules & Options</div>
      <div style={{fontSize:12,color:T.text3}}>Activez ou désactivez chaque fonctionnalité selon vos besoins</div>
    </div>
    <div style={{display:'flex',gap:6}}>
      <Btn small onClick={()=>{const all={};PHONE_MODULES.forEach(m=>{all[m.id]=true});setPhoneModules(all);try{localStorage.setItem("c360-phone-modules-"+collab.id,JSON.stringify(all))}catch(e){}showNotif('Tous les modules activés')}} style={{fontSize:11}}>
        <I n="check" s={12}/> Tout activer
      </Btn>
      <Btn small onClick={()=>{const all={};PHONE_MODULES.forEach(m=>{all[m.id]=false});setPhoneModules(all);try{localStorage.setItem("c360-phone-modules-"+collab.id,JSON.stringify(all))}catch(e){}showNotif('Tous les modules désactivés')}} style={{fontSize:11}}>
        <I n="x" s={12}/> Tout désactiver
      </Btn>
    </div>
  </div>

  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
    {PHONE_MODULES.map(mod=>(
      <div key={mod.id} onClick={()=>toggleModule(mod.id)} style={{padding:16,borderRadius:14,border:`2px solid ${isModuleOn(mod.id)?mod.color+'40':T.border}`,background:isModuleOn(mod.id)?mod.color+'06':'transparent',cursor:'pointer',transition:'all .25s',display:'flex',alignItems:'flex-start',gap:12}}>
        {/* Checkbox */}
        <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${isModuleOn(mod.id)?mod.color:T.border}`,background:isModuleOn(mod.id)?mod.color:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .25s',marginTop:2}}>
          {isModuleOn(mod.id) && <I n="check" s={14} style={{color:'#fff'}}/>}
        </div>
        {/* Icon */}
        <div style={{width:36,height:36,borderRadius:10,background:isModuleOn(mod.id)?mod.color+'18':T.surface,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <I n={mod.icon} s={18} style={{color:isModuleOn(mod.id)?mod.color:T.text3}}/>
        </div>
        {/* Info */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontWeight:700,fontSize:13,color:isModuleOn(mod.id)?T.text:T.text2}}>{mod.label}</span>
            {isModuleOn(mod.id) && <span style={{fontSize:9,padding:'1px 6px',borderRadius:4,background:mod.color+'20',color:mod.color,fontWeight:700}}>ON</span>}
          </div>
          <div style={{fontSize:11,color:T.text3,marginTop:2,lineHeight:1.4}}>{mod.desc}</div>
        </div>
      </div>
    ))}
  </div>

  {/* Active modules counter */}
  <div style={{marginTop:14,padding:'10px 16px',borderRadius:10,background:T.surface,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
    <span style={{fontSize:12,color:T.text3}}>{PHONE_MODULES.filter(m=>isModuleOn(m.id)).length}/{PHONE_MODULES.length} modules actifs</span>
    <div style={{display:'flex',gap:4}}>
      {PHONE_MODULES.filter(m=>isModuleOn(m.id)).map(m=>(
        <div key={m.id} style={{width:8,height:8,borderRadius:4,background:m.color}} title={m.label}/>
      ))}
    </div>
  </div>
</div>

</div>{/* end scrollable content */}
      </div>
    </div>);
  })()}

  {/* ═══════════════════════════════════════════════════════════════════
      SECURE IA PHONE MODAL
      NOTE: This IIFE uses React.useState and React.useEffect — KNOWN EXCEPTION
     ═══════════════════════════════════════════════════════════════════ */}
  {phoneSubTab === 'secure-ia' && collab.role === 'admin' && (()=>{
    const [siaData, setSiaData] = React.useState({ stats: null, alerts: [], reports: [], loading: true, period: 'day', alertDetail: null });
    React.useEffect(() => {
      let cancelled = false;
      (async () => {
try {
const [statsRes, alertsRes, reportsRes] = await Promise.all([
  api(`/api/secure-ia/stats?companyId=${company.id}&period=${siaData.period}`),
  api(`/api/secure-ia/alerts?companyId=${company.id}&limit=30`),
  api(`/api/secure-ia/reports?companyId=${company.id}&limit=20`)
]);
if (!cancelled) setSiaData(p => ({ ...p, stats: statsRes, alerts: alertsRes || [], reports: reportsRes || [], loading: false }));
} catch { if (!cancelled) setSiaData(p => ({ ...p, loading: false })); }
      })();
      return () => { cancelled = true; };
    }, [siaData.period]);

    const st = siaData.stats || {};
    const periods = [{id:'day',label:"Aujourd'hui"},{id:'week',label:'Semaine'},{id:'month',label:'Mois'}];
    const severityColors = { high:'#DC2626', medium:'#F59E0B', low:'#3B82F6', none:'#22C55E' };
    const severityLabels = { high:'Élevée', medium:'Moyenne', low:'Faible', none:'Aucune' };

    return (
    <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
{/* Header */}
<div style={{padding:'20px 24px',background:'linear-gradient(135deg,#DC2626,#7C3AED)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
<div style={{display:'flex',alignItems:'center',gap:12}}>
  <div style={{width:44,height:44,borderRadius:14,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center'}}>
    <I n="shield" s={22} style={{color:'#fff'}}/>
  </div>
  <div>
    <div style={{fontSize:18,fontWeight:800,color:'#fff'}}>SECURE IA PHONE</div>
    <div style={{fontSize:12,color:'#ffffffaa'}}>Surveillance IA des mots interdits en temps réel</div>
  </div>
</div>
<div style={{display:'flex',alignItems:'center',gap:10}}>
  {/* Period selector */}
  <div style={{display:'flex',gap:4,background:'rgba(255,255,255,0.12)',borderRadius:10,padding:3}}>
    {periods.map(p=>(
      <div key={p.id} onClick={()=>setSiaData(prev=>({...prev,period:p.id,loading:true}))} style={{padding:'6px 14px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:siaData.period===p.id?700:500,color:siaData.period===p.id?'#fff':'#ffffffaa',background:siaData.period===p.id?'rgba(255,255,255,0.2)':'transparent',transition:'all .2s'}}>{p.label}</div>
    ))}
  </div>
  <div onClick={()=>setPhoneSubTab('pipeline')} style={{cursor:'pointer',width:34,height:34,borderRadius:10,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center'}}>
    <I n="x" s={18} style={{color:'#fff'}}/>
  </div>
</div>
</div>

{/* Scrollable content */}
<div style={{flex:1,overflow:'auto',padding:24}}>
{siaData.loading ? (
  <div style={{textAlign:'center',padding:60,color:T.text3}}>
    <div style={{width:24,height:24,border:'3px solid #DC2626',borderTopColor:'transparent',borderRadius:'50%',animation:'spin .6s linear infinite',margin:'0 auto 12px'}}/>
    <div style={{fontSize:13}}>Chargement...</div>
  </div>
) : (
<>
  {/* KPI Cards */}
  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
    {[
      { label:'Alertes', value: siaData.period==='day'?st.alertsToday:siaData.period==='week'?st.alertsWeek:st.alertsMonth, icon:'alert-triangle', color:'#DC2626', bg:'#DC262608' },
      { label:'En attente de revue', value: st.pendingReview||0, icon:'eye', color:'#F59E0B', bg:'#F59E0B08' },
      { label:'Collaborateurs surveillés', value: st.monitoredCollabs||0, icon:'users', color:'#7C3AED', bg:'#7C3AED08' },
      { label:'Total alertes', value: st.alertsTotal||0, icon:'database', color:'#3B82F6', bg:'#3B82F608' },
    ].map((kpi,i)=>(
      <Card key={i} style={{padding:16,background:kpi.bg,border:'none'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <div style={{width:32,height:32,borderRadius:8,background:kpi.color+'18',display:'flex',alignItems:'center',justifyContent:'center'}}><I n={kpi.icon} s={16} style={{color:kpi.color}}/></div>
          <div style={{fontSize:11,color:T.text3,fontWeight:600}}>{kpi.label}</div>
        </div>
        <div style={{fontSize:28,fontWeight:800,color:kpi.color}}>{kpi.value||0}</div>
      </Card>
    ))}
  </div>

  {/* Top Violated Words */}
  {(st.topWords||[]).length > 0 && (
    <Card style={{padding:16,marginBottom:20}}>
      <div style={{fontSize:13,fontWeight:700,marginBottom:12,display:'flex',alignItems:'center',gap:6}}><I n="alert-circle" s={14} style={{color:'#DC2626'}}/> Top mots détectés</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
        {(st.topWords||[]).map((w,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,background:i===0?'#DC262615':i<3?'#F59E0B10':'#64748B08',border:`1px solid ${i===0?'#DC2626':i<3?'#F59E0B':'#E5E7EB'}30`}}>
            <span style={{fontSize:12,fontWeight:700,color:i===0?'#DC2626':i<3?'#F59E0B':T.text2}}>"{w.word}"</span>
            <span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:6,background:i===0?'#DC2626':i<3?'#F59E0B':'#64748B',color:'#fff'}}>{w.count}x</span>
            <span style={{fontSize:10,color:T.text3}}>{w.calls} appel{w.calls>1?'s':''}</span>
          </div>
        ))}
      </div>
    </Card>
  )}

  {/* Trend Chart — 14 days */}
  {(st.trend||[]).length > 0 && (
    <Card style={{padding:16,marginBottom:20}}>
      <div style={{fontSize:13,fontWeight:700,marginBottom:12,display:'flex',alignItems:'center',gap:6}}><I n="trending-up" s={14} style={{color:'#DC2626'}}/> Tendance (14 derniers jours)</div>
      <div style={{display:'flex',alignItems:'flex-end',gap:3,height:80}}>
        {(()=>{
          const maxVal = Math.max(...st.trend.map(t=>t.cnt), 1);
          return st.trend.map((t,i)=>(
            <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
              <div style={{fontSize:9,fontWeight:700,color:t.cnt>0?'#DC2626':T.text3}}>{t.cnt||''}</div>
              <div style={{width:'100%',height:Math.max(4, (t.cnt/maxVal)*60),borderRadius:4,background:t.cnt>0?'#DC2626':'#E5E7EB',opacity:t.cnt>0?0.3+((t.cnt/maxVal)*0.7):0.3,transition:'height .3s'}}/>
              <div style={{fontSize:8,color:T.text3}}>{t.day?.slice(8)}</div>
            </div>
          ));
        })()}
      </div>
    </Card>
  )}

  {/* Per-collaborator breakdown */}
  {(st.collabAlerts||[]).length > 0 && (
    <Card style={{padding:16,marginBottom:20}}>
      <div style={{fontSize:13,fontWeight:700,marginBottom:12,display:'flex',alignItems:'center',gap:6}}><I n="users" s={14} style={{color:'#7C3AED'}}/> Par collaborateur</div>
      {st.collabAlerts.map((ca,i)=>(
        <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:i<st.collabAlerts.length-1?`1px solid ${T.border}`:'none'}}>
          <Avatar name={ca.name||'?'} color={ca.color||'#ccc'} size={28}/>
          <div style={{flex:1,fontSize:12,fontWeight:600}}>{ca.name}</div>
          <div style={{display:'flex',gap:4}}>
            {ca.highCount > 0 && <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'#DC262615',color:'#DC2626',fontWeight:700}}>{ca.highCount} élevée{ca.highCount>1?'s':''}</span>}
            {ca.mediumCount > 0 && <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'#F59E0B15',color:'#F59E0B',fontWeight:700}}>{ca.mediumCount} moyenne{ca.mediumCount>1?'s':''}</span>}
            {ca.lowCount > 0 && <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'#3B82F615',color:'#3B82F6',fontWeight:700}}>{ca.lowCount} faible{ca.lowCount>1?'s':''}</span>}
          </div>
          <div style={{fontSize:14,fontWeight:800,color:'#DC2626'}}>{ca.alertCount}</div>
        </div>
      ))}
    </Card>
  )}

  {/* Alerts List */}
  <div style={{fontSize:14,fontWeight:700,marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
    <I n="alert-triangle" s={16} style={{color:'#DC2626'}}/> Alertes récentes
    {siaData.alerts.length > 0 && <Badge color="#DC2626" bg="#DC262612">{siaData.alerts.length}</Badge>}
  </div>
  {siaData.alerts.length === 0 ? (
    <Card style={{padding:40,textAlign:'center'}}>
      <I n="check-circle" s={40} style={{color:'#22C55E',marginBottom:12}}/>
      <div style={{fontSize:14,fontWeight:600,color:'#22C55E'}}>Aucune alerte</div>
      <div style={{fontSize:12,color:T.text3,marginTop:4}}>Aucun mot interdit détecté pour le moment</div>
    </Card>
  ) : (
    <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>
      {siaData.alerts.map(alert=>(
        <Card key={alert.id} style={{padding:14,borderLeft:`4px solid ${severityColors[alert.severity]||'#ccc'}`,cursor:'pointer',transition:'all .15s'}} onClick={async()=>{
          try { const detail = await api(`/api/secure-ia/alerts/${alert.id}`); if (detail) setSiaData(p=>({...p,alertDetail:detail})); } catch {}
        }}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                <span style={{fontSize:13,fontWeight:700}}>{alert.contactName||alert.contactPhone||'Inconnu'}</span>
                <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:severityColors[alert.severity]+'15',color:severityColors[alert.severity],fontWeight:700}}>{severityLabels[alert.severity]}</span>
                {alert.reviewed ? <I n="check" s={12} style={{color:'#22C55E'}}/> : <span style={{fontSize:10,color:'#F59E0B',fontWeight:600}}>En attente</span>}
              </div>
              <div style={{fontSize:11,color:T.text3}}>{alert.callDate?.slice(0,10)} · {alert.callDate?.slice(11,16)} · {alert.callDuration||0}s</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:6}}>
                {(alert.detectedWords||[]).map((w,i)=>(
                  <span key={i} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 7px',borderRadius:5,background:'#DC262612',color:'#DC2626',fontSize:10,fontWeight:700}}>"{w.word}" <span style={{background:'#DC2626',color:'#fff',padding:'0 4px',borderRadius:3,fontSize:9}}>{w.count}x</span></span>
                ))}
              </div>
              {alert.transcriptionPreview && <div style={{fontSize:11,color:T.text3,marginTop:6,fontStyle:'italic',lineHeight:1.4}}>"{alert.transcriptionPreview}..."</div>}
            </div>
            <I n="chevron-right" s={16} style={{color:T.text3}}/>
          </div>
        </Card>
      ))}
    </div>
  )}

  {/* Reports Section */}
  {siaData.reports.length > 0 && (
    <div style={{marginTop:8}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
        <I n="file-text" s={16} style={{color:'#7C3AED'}}/> Rapports générés
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {siaData.reports.map(r=>(
          <Card key={r.id} style={{padding:12}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:32,height:32,borderRadius:8,background:r.period==='day'?'#3B82F610':r.period==='week'?'#7C3AED10':'#05966910',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <I n={r.period==='day'?'calendar':r.period==='week'?'layers':'bar-chart'} s={14} style={{color:r.period==='day'?'#3B82F6':r.period==='week'?'#7C3AED':'#059669'}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:700}}>{r.collaboratorName} — {r.period==='day'?'Journée':r.period==='week'?'Semaine':'Mois'} du {r.periodDate}</div>
                <div style={{fontSize:11,color:T.text3}}>{r.flaggedCalls}/{r.analyzedCalls} appel{r.analyzedCalls>1?'s':''} avec infractions</div>
              </div>
              {r.flaggedCalls > 0 && <span style={{fontSize:14,fontWeight:800,color:'#DC2626'}}>{r.flaggedCalls}</span>}
              {r.flaggedCalls === 0 && <I n="check-circle" s={16} style={{color:'#22C55E'}}/>}
            </div>
            {r.summary && <div style={{fontSize:11,color:T.text3,marginTop:6,paddingTop:6,borderTop:`1px solid ${T.border}`,lineHeight:1.4}}>{r.summary}</div>}
          </Card>
        ))}
      </div>
    </div>
  )}
</>
)}
</div>{/* end scrollable content */}

{/* ── Alert Detail Sub-Modal ── */}
{siaData.alertDetail && (
<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setSiaData(p=>({...p,alertDetail:null}))}>
  <div style={{background:T.surface,borderRadius:16,maxWidth:700,width:'100%',maxHeight:'85vh',overflow:'auto',padding:24,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}} onClick={e=>e.stopPropagation()}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#DC2626,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="shield" s={20} style={{color:'#fff'}}/></div>
        <div>
          <div style={{fontSize:16,fontWeight:800}}>Détail de l'alerte</div>
          <div style={{fontSize:12,color:T.text3}}>{siaData.alertDetail.collaboratorName} · {siaData.alertDetail.callDate?.slice(0,10)}</div>
        </div>
      </div>
      <div style={{display:'flex',gap:6}}>
        {!siaData.alertDetail.reviewed && (
          <Btn small onClick={async()=>{
            await api(`/api/secure-ia/alerts/${siaData.alertDetail.id}/review`, {method:'PUT',body:{reviewed:1}});
            setSiaData(p=>({...p,alertDetail:{...p.alertDetail,reviewed:1},alerts:p.alerts.map(a=>a.id===p.alertDetail.id?{...a,reviewed:1}:a)}));
          }} style={{background:'#22C55E12',color:'#22C55E',border:'1px solid #22C55E30'}}>
            <I n="check" s={12}/> Marquer comme vu
          </Btn>
        )}
        <Btn small onClick={()=>setSiaData(p=>({...p,alertDetail:null}))}><I n="x" s={14}/></Btn>
      </div>
    </div>

    {/* Call info */}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:16}}>
      <div style={{padding:10,borderRadius:8,background:T.bg}}>
        <div style={{fontSize:10,color:T.text3,fontWeight:600}}>Contact</div>
        <div style={{fontSize:13,fontWeight:700}}>{siaData.alertDetail.contactName||'Inconnu'}</div>
        <div style={{fontSize:11,color:T.text3}}>{siaData.alertDetail.contactPhone}</div>
      </div>
      <div style={{padding:10,borderRadius:8,background:T.bg}}>
        <div style={{fontSize:10,color:T.text3,fontWeight:600}}>Durée</div>
        <div style={{fontSize:13,fontWeight:700}}>{Math.floor((siaData.alertDetail.callDuration||0)/60)}min {(siaData.alertDetail.callDuration||0)%60}s</div>
      </div>
      <div style={{padding:10,borderRadius:8,background:severityColors[siaData.alertDetail.severity]+'10'}}>
        <div style={{fontSize:10,color:T.text3,fontWeight:600}}>Sévérité</div>
        <div style={{fontSize:13,fontWeight:800,color:severityColors[siaData.alertDetail.severity]}}>{severityLabels[siaData.alertDetail.severity]}</div>
      </div>
    </div>

    {/* Detected words */}
    <div style={{marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Mots détectés :</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
        {(siaData.alertDetail.detectedWords||[]).map((w,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,background:'#DC262610',border:'1px solid #DC262630'}}>
            <span style={{fontSize:13,fontWeight:700,color:'#DC2626'}}>"{w.word}"</span>
            <span style={{fontSize:11,fontWeight:800,padding:'1px 8px',borderRadius:6,background:'#DC2626',color:'#fff'}}>{w.count}x</span>
          </div>
        ))}
      </div>
    </div>

    {/* Transcription */}
    {siaData.alertDetail.transcription && (
      <div>
        <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Transcription complète :</div>
        <div style={{padding:16,borderRadius:10,background:T.bg,border:`1px solid ${T.border}`,fontSize:13,lineHeight:1.8,maxHeight:300,overflow:'auto',whiteSpace:'pre-wrap'}}>
          {(()=>{
            let text = siaData.alertDetail.transcription;
            const words = (siaData.alertDetail.detectedWords||[]).map(w=>w.word);
            if (words.length === 0) return text;
            const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
            const normalizedText = normalize(text);
            const parts = [];
            let lastIdx = 0;
            const matches = [];
            for (const word of words) {
              const nw = normalize(word);
              let from = 0;
              while (true) {
                const idx = normalizedText.indexOf(nw, from);
                if (idx === -1) break;
                matches.push({ start: idx, end: idx + nw.length, word });
                from = idx + 1;
              }
            }
            matches.sort((a,b) => a.start - b.start);
            const filtered = [];
            for (const m of matches) {
              if (filtered.length === 0 || m.start >= filtered[filtered.length-1].end) filtered.push(m);
            }
            for (const m of filtered) {
              if (m.start > lastIdx) parts.push(<span key={'t'+lastIdx}>{text.slice(lastIdx, m.start)}</span>);
              parts.push(<mark key={'m'+m.start} style={{background:'#DC262630',color:'#DC2626',fontWeight:700,padding:'1px 3px',borderRadius:3}}>{text.slice(m.start, m.end)}</mark>);
              lastIdx = m.end;
            }
            if (lastIdx < text.length) parts.push(<span key={'t'+lastIdx}>{text.slice(lastIdx)}</span>);
            return parts;
          })()}
        </div>
      </div>
    )}
  </div>
</div>
)}

      </div>
    </div>);
  })()}

  {/* ═══════════════════════════════════════════════════════════════════
      COPILOT DASHBOARD MODAL
     ═══════════════════════════════════════════════════════════════════ */}
  {phoneSubTab === 'copilot' && (collab.ai_copilot_enabled || collab.role === 'admin') && (()=>{
    const cpData = (typeof phoneCopilotTabData!=='undefined'?phoneCopilotTabData:null);
    const setCpData = setPhoneCopilotTabData;

    const loadCopilotData = () => {
      const collabFilter = collab.role !== 'admin' ? `&collaboratorId=${collab.id}` : '';
      setCpData(p => ({ ...p, loading: true }));
      Promise.all([
api(`/api/ai-copilot/stats?companyId=${company.id}${collabFilter}`),
api(`/api/ai-copilot/analyses?companyId=${company.id}${collabFilter}&limit=20`),
api(`/api/ai-copilot/coaching/${collab.id}`),
api(`/api/ai-copilot/objections?companyId=${company.id}`)
      ]).then(([statsRes, analysesRes, coachingRes, objectionsRes]) => {
setCpData(p => ({ ...p, stats: statsRes, analyses: analysesRes || [], coaching: coachingRes, objections: objectionsRes, loading: false }));
setPhoneCopilotTabLoaded(true);
      }).catch(err => { console.error('[COPILOT]', err); setCpData(p => ({ ...p, loading: false })); });
    };

    const handleGenScript = async () => {
      setCpData(p => ({ ...p, scriptLoading: true }));
      try {
const res = await api('/api/ai-copilot/generate-script', { method: 'POST', body: { role: collab.ai_copilot_role || 'Commercial', objective: collab.ai_copilot_objective || '', target: collab.ai_copilot_target || '', customPrompt: cpData.scriptPrompt } });
setCpData(p => ({ ...p, generatedScript: res, scriptLoading: false }));
      } catch { setCpData(p => ({ ...p, scriptLoading: false })); showNotif('Erreur génération script', 'error'); }
    };

    const handleCrmAutoFill = async (analysisId) => {
      try {
const res = await api(`/api/ai-copilot/crm-autofill/${analysisId}`, { method: 'POST' });
if (res?.success) { showNotif('CRM mis à jour'); setCpData(p => ({ ...p, analyses: p.analyses.map(a => a.id === analysisId ? { ...a, crmAutoFilled: 1 } : a) })); }
else showNotif(res?.error || 'Erreur CRM', 'error');
      } catch { showNotif('Erreur CRM auto-fill', 'error'); }
    };

    const scoreColor = (v) => v >= 70 ? '#22C55E' : v >= 40 ? '#F59E0B' : '#EF4444';
    const scoreBg = (v) => v >= 70 ? '#F0FDF4' : v >= 40 ? '#FFFBEB' : '#FEF2F2';

    const st = cpData.stats || {};
    const detailA = cpData.detailModal ? cpData.analyses.find(a => a.id === cpData.detailModal) : null;

    return (
    <div style={{position:'absolute',left:(typeof phoneLeftCollapsed!=='undefined'?phoneLeftCollapsed:null)?49:281,right:(typeof phoneRightCollapsed!=='undefined'?phoneRightCollapsed:null)?49:340,top:0,bottom:0,zIndex:10,display:'flex',flexDirection:'column',background:T.bg,overflow:'hidden'}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
{/* Header */}
<div style={{padding:'20px 24px',background:'linear-gradient(135deg,#7C3AED,#2563EB)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
<div style={{display:'flex',alignItems:'center',gap:12}}>
  <div style={{width:44,height:44,borderRadius:14,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center'}}>
    <I n="cpu" s={22} style={{color:'#fff'}}/>
  </div>
  <div>
    <div style={{fontSize:18,fontWeight:800,color:'#fff'}}>AI Sales Copilot</div>
    <div style={{fontSize:12,color:'#ffffffaa'}}>Intelligence artificielle commerciale · Analyse post-appel</div>
  </div>
</div>
<div style={{display:'flex',alignItems:'center',gap:8}}>
  <Btn small onClick={()=>setCpData(p=>({...p,scriptModal:true}))} style={{background:'rgba(255,255,255,0.18)',color:'#fff',border:'1px solid rgba(255,255,255,0.3)'}}>
    <I n="zap" s={14}/> Générer un script
  </Btn>
  <div onClick={()=>setPhoneSubTab('pipeline')} style={{cursor:'pointer',width:34,height:34,borderRadius:10,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center'}}>
    <I n="x" s={18} style={{color:'#fff'}}/>
  </div>
</div>
</div>

{/* Scrollable content */}
<div style={{flex:1,overflow:'auto',padding:24}}>
{cpData.loading ? (
  <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:60,gap:10,color:T.text3}}>
    <div style={{width:20,height:20,border:'3px solid #7C3AED',borderTopColor:'transparent',borderRadius:'50%',animation:'spin .7s linear infinite'}}/>
    <span style={{fontSize:13,fontWeight:600,color:'#7C3AED'}}>Chargement Copilot IA...</span>
  </div>
) : (
<>
  {/* KPI Cards */}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14,marginBottom:24}}>
    {[
      {label:'Taux conversion',value:`${st.avgConversion||0}%`,icon:'trending-up',color:'#7C3AED',bg:'#F5F3FF'},
      {label:'Score qualité',value:`${st.avgQuality||0}%`,icon:'award',color:'#2563EB',bg:'#EFF6FF'},
      {label:'Appels analysés',value:st.totalAnalyzed||0,icon:'bar-chart-2',color:'#22C55E',bg:'#F0FDF4'},
      {label:'Objections détectées',value:st.totalObjections||0,icon:'alert-triangle',color:'#F59E0B',bg:'#FFFBEB'},
    ].map((kpi,i)=>(
      <Card key={i} style={{padding:16,background:T.card}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:38,height:38,borderRadius:12,background:kpi.bg,display:'flex',alignItems:'center',justifyContent:'center'}}><I n={kpi.icon} s={18} style={{color:kpi.color}}/></div>
          <div>
            <div style={{fontSize:22,fontWeight:800,color:kpi.color}}>{kpi.value}</div>
            <div style={{fontSize:11,color:T.text3,fontWeight:600}}>{kpi.label}</div>
          </div>
        </div>
      </Card>
    ))}
  </div>

  {/* 2-column: Coaching + Objections */}
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
    {/* Coaching IA */}
    <Card style={{padding:0,overflow:'hidden'}}>
      <div style={{padding:'14px 18px',background:'linear-gradient(135deg,#7C3AED,#6D28D9)',color:'#fff',display:'flex',alignItems:'center',gap:8}}>
        <I n="target" s={16}/> <span style={{fontWeight:700,fontSize:14}}>Coaching IA personnalisé</span>
      </div>
      <div style={{padding:16,maxHeight:300,overflow:'auto'}}>
        {cpData.coaching && cpData.coaching.totalAnalyzed > 0 ? (<>
          <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
            {[{l:'Sentiment',v:cpData.coaching.avgSentiment},{l:'Qualité',v:cpData.coaching.avgQuality},{l:'Conversion',v:cpData.coaching.avgConversion}].map((s,i)=>(
              <div key={i} style={{flex:1,minWidth:80,padding:'8px 10px',borderRadius:10,background:scoreBg(s.v),textAlign:'center'}}>
                <div style={{fontSize:18,fontWeight:800,color:scoreColor(s.v)}}>{s.v}%</div>
                <div style={{fontSize:10,color:T.text3}}>{s.l}</div>
              </div>
            ))}
          </div>
          {(cpData.coaching.strengths || []).length > 0 && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:'#22C55E',marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="thumbs-up" s={12}/> Points forts</div>
              {cpData.coaching.strengths.map((s,i) => <div key={i} style={{fontSize:12,color:T.text2,padding:'4px 0',display:'flex',gap:6}}><span style={{color:'#22C55E',flexShrink:0}}>+</span> {s}</div>)}
            </div>
          )}
          {(cpData.coaching.weaknesses || []).length > 0 && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:'#F59E0B',marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="alert-circle" s={12}/> Axes d'amélioration</div>
              {cpData.coaching.weaknesses.map((s,i) => <div key={i} style={{fontSize:12,color:T.text2,padding:'4px 0',display:'flex',gap:6}}><span style={{color:'#F59E0B',flexShrink:0}}>!</span> {s}</div>)}
            </div>
          )}
          {(cpData.coaching.tips || []).length > 0 && (
            <div>
              <div style={{fontSize:12,fontWeight:700,color:'#2563EB',marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="zap" s={12}/> Conseils IA</div>
              {cpData.coaching.tips.map((s,i) => <div key={i} style={{fontSize:12,color:T.text2,padding:'4px 0',display:'flex',gap:6}}><span style={{color:'#2563EB',flexShrink:0}}>*</span> {s}</div>)}
            </div>
          )}
        </>) : (
          <div style={{textAlign:'center',padding:'30px 10px',color:T.text3}}>
            <I n="cpu" s={28} style={{marginBottom:8,opacity:0.4}}/>
            <div style={{fontSize:13,fontWeight:600}}>Pas encore de données</div>
            <div style={{fontSize:11,marginTop:4}}>Le coaching apparaitra après vos premiers appels analysés</div>
          </div>
        )}
      </div>
    </Card>

    {/* Base d'objections */}
    <Card style={{padding:0,overflow:'hidden'}}>
      <div style={{padding:'14px 18px',background:'linear-gradient(135deg,#F59E0B,#D97706)',color:'#fff',display:'flex',alignItems:'center',gap:8}}>
        <I n="shield" s={16}/> <span style={{fontWeight:700,fontSize:14}}>Base d'objections</span>
        <span style={{marginLeft:'auto',fontSize:11,opacity:0.8}}>{(cpData.objections?.objections||[]).length} objections</span>
      </div>
      <div style={{padding:16,maxHeight:300,overflow:'auto'}}>
        {(cpData.objections?.objections || []).length > 0 ? (
          cpData.objections.objections.slice(0, 8).map((obj, i) => (
            <div key={i} style={{padding:'10px 12px',borderRadius:10,background:T.surface,marginBottom:8,border:`1px solid ${T.border}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                <div style={{fontSize:12,fontWeight:700,color:'#EF4444',flex:1}}>"{obj.objection}"</div>
                <span style={{fontSize:10,padding:'2px 6px',borderRadius:6,background:'#FEF2F2',color:'#EF4444',fontWeight:600,whiteSpace:'nowrap'}}>{obj.count}x</span>
              </div>
              {obj.bestResponse && <div style={{fontSize:11,color:'#22C55E',marginTop:4,display:'flex',gap:4}}><span style={{flexShrink:0}}>{"→"}</span> <span>{obj.bestResponse}</span></div>}
            </div>
          ))
        ) : (
          <div style={{textAlign:'center',padding:'30px 10px',color:T.text3}}>
            <I n="shield" s={28} style={{marginBottom:8,opacity:0.4}}/>
            <div style={{fontSize:13,fontWeight:600}}>Aucune objection détectée</div>
            <div style={{fontSize:11,marginTop:4}}>Les objections seront collectées automatiquement</div>
          </div>
        )}
      </div>
    </Card>
  </div>

  {/* Trend chart */}
  {(st.trend || []).length > 1 && (
    <Card style={{padding:18,marginBottom:24}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:12,display:'flex',alignItems:'center',gap:6}}><I n="trending-up" s={16} style={{color:'#7C3AED'}}/> Évolution (14 jours)</div>
      <div style={{display:'flex',alignItems:'flex-end',gap:4,height:100}}>
        {st.trend.map((d, i) => {
          const h = Math.max(8, (d.avgConv || 0));
          return (
            <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}} title={`${d.day}: ${Math.round(d.avgConv||0)}% conv · ${d.cnt} appels`}>
              <div style={{fontSize:9,color:T.text3,fontWeight:600}}>{Math.round(d.avgConv||0)}%</div>
              <div style={{width:'100%',maxWidth:32,height:h,borderRadius:4,background:'linear-gradient(180deg,#7C3AED,#2563EB)',opacity:0.8+((d.avgConv||0)/500)}}/>
              <div style={{fontSize:8,color:T.text3}}>{d.day?.slice(5)}</div>
            </div>
          );
        })}
      </div>
    </Card>
  )}

  {/* Analyses récentes */}
  <Card style={{padding:0,overflow:'hidden',marginBottom:24}}>
    <div style={{padding:'14px 18px',background:'linear-gradient(135deg,#2563EB,#1D4ED8)',color:'#fff',display:'flex',alignItems:'center',gap:8}}>
      <I n="activity" s={16}/> <span style={{fontWeight:700,fontSize:14}}>Analyses récentes</span>
      <span style={{marginLeft:'auto',fontSize:11,opacity:0.8}}>{cpData.analyses.length} analyses</span>
    </div>
    <div style={{maxHeight:400,overflow:'auto'}}>
      {cpData.analyses.length > 0 ? cpData.analyses.map((a, i) => (
        <div key={a.id||i} style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:12,transition:'background 0.15s'}} onMouseEnter={e=>e.currentTarget.style.background=T.surface} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <div onClick={() => setCpData(p => ({...p, detailModal: a.id}))} style={{display:'flex',alignItems:'center',gap:12,flex:1,minWidth:0,cursor:'pointer'}}>
            <div style={{width:36,height:36,borderRadius:10,background:a.collaboratorColor||'#2563EB',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:13,flexShrink:0}}>{(a.collaboratorName||'?')[0].toUpperCase()}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,display:'flex',alignItems:'center',gap:6}}>
                {a.collaboratorName}
                {a.followupType && <span style={{fontSize:9,padding:'1px 6px',borderRadius:4,background:'#EFF6FF',color:'#2563EB',fontWeight:600}}>{a.followupType}</span>}
              </div>
              <div style={{fontSize:11,color:T.text3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.summary || a.transcriptionPreview || 'Pas de résumé'}</div>
            </div>
            <div style={{display:'flex',gap:6,flexShrink:0}}>
              <div style={{textAlign:'center',padding:'4px 8px',borderRadius:8,background:scoreBg(a.conversionScore||0)}}><div style={{fontSize:14,fontWeight:800,color:scoreColor(a.conversionScore||0)}}>{a.conversionScore||0}</div><div style={{fontSize:8,color:T.text3}}>Conv.</div></div>
              <div style={{textAlign:'center',padding:'4px 8px',borderRadius:8,background:scoreBg(a.qualityScore||0)}}><div style={{fontSize:14,fontWeight:800,color:scoreColor(a.qualityScore||0)}}>{a.qualityScore||0}</div><div style={{fontSize:8,color:T.text3}}>Qual.</div></div>
            </div>
            <div style={{fontSize:10,color:T.text3,whiteSpace:'nowrap',flexShrink:0}}>{a.createdAt ? new Date(a.createdAt).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}) : ''}</div>
          </div>
          {/* CRM Auto-fill button */}
          <div style={{flexShrink:0}}>
            {!a.crmAutoFilled ? (
              <div onClick={(e)=>{e.stopPropagation();handleCrmAutoFill(a.id);}} style={{padding:'6px 12px',borderRadius:8,background:'linear-gradient(135deg,#7C3AED,#2563EB)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:5,boxShadow:'0 2px 8px rgba(124,58,237,0.3)',transition:'all .2s',whiteSpace:'nowrap'}} onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.05)';}} onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';}}>
                <I n="database" s={11}/> CRM Auto-fill
              </div>
            ) : (
              <div style={{padding:'6px 12px',borderRadius:8,background:'#F0FDF4',border:'1px solid #22C55E30',color:'#22C55E',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',gap:5,whiteSpace:'nowrap'}}>
                <I n="check-circle" s={11}/> CRM OK
              </div>
            )}
          </div>
        </div>
      )) : (
        <div style={{textAlign:'center',padding:'40px 20px',color:T.text3}}>
          <I n="activity" s={32} style={{marginBottom:8,opacity:0.4}}/>
          <div style={{fontSize:14,fontWeight:600}}>Aucune analyse</div>
          <div style={{fontSize:12,marginTop:4}}>Les appels seront analysés automatiquement par l'IA</div>
        </div>
      )}
    </div>
  </Card>

  {/* Follow-up breakdown */}
  {(st.followups || []).length > 0 && (
    <Card style={{padding:18,marginBottom:24}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:12,display:'flex',alignItems:'center',gap:6}}><I n="send" s={16} style={{color:'#2563EB'}}/> Répartition des relances</div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        {st.followups.map((f, i) => (
          <div key={i} style={{padding:'8px 14px',borderRadius:10,background:f.followupType==='email'?'#EFF6FF':f.followupType==='sms'?'#F0FDF4':f.followupType==='call'?'#FFF7ED':'#F5F3FF',display:'flex',alignItems:'center',gap:6}}>
            <I n={f.followupType==='email'?'mail':f.followupType==='sms'?'message-square':f.followupType==='call'?'phone':'gift'} s={14} style={{color:f.followupType==='email'?'#2563EB':f.followupType==='sms'?'#22C55E':f.followupType==='call'?'#F59E0B':'#7C3AED'}}/>
            <span style={{fontSize:12,fontWeight:700}}>{f.cnt}</span>
            <span style={{fontSize:11,color:T.text3}}>{f.followupType}</span>
          </div>
        ))}
      </div>
    </Card>
  )}
</>
)}
</div>{/* end scrollable content */}

{/* ── Detail Sub-Modal (analysis deep-dive) ── */}
{detailA && (
<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10000,padding:20}} onClick={() => setCpData(p => ({...p, detailModal: null}))}>
  <div onClick={e => e.stopPropagation()} style={{background:T.card||T.surface,borderRadius:20,width:'100%',maxWidth:640,maxHeight:'85vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
    <div style={{padding:'20px 24px',background:'linear-gradient(135deg,#7C3AED,#2563EB)',borderRadius:'20px 20px 0 0',color:'#fff',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div>
        <div style={{fontSize:16,fontWeight:800}}>Analyse détaillée</div>
        <div style={{fontSize:12,opacity:0.8}}>{detailA.collaboratorName} · {detailA.createdAt ? new Date(detailA.createdAt).toLocaleString('fr-FR') : ''}</div>
      </div>
      <div onClick={() => setCpData(p => ({...p, detailModal: null}))} style={{cursor:'pointer',width:32,height:32,borderRadius:10,background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="x" s={16}/></div>
    </div>
    <div style={{padding:24}}>
      {/* Scores */}
      <div style={{display:'flex',gap:10,marginBottom:20}}>
        {[{l:'Sentiment',v:detailA.sentimentScore},{l:'Qualité',v:detailA.qualityScore},{l:'Conversion',v:detailA.conversionScore}].map((s,i)=>(
          <div key={i} style={{flex:1,padding:'12px',borderRadius:12,background:scoreBg(s.v||0),textAlign:'center'}}>
            <div style={{fontSize:24,fontWeight:800,color:scoreColor(s.v||0)}}>{s.v||0}</div>
            <div style={{fontSize:11,color:T.text3,fontWeight:600}}>{s.l}</div>
          </div>
        ))}
      </div>
      {/* Summary */}
      {detailA.summary && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="file-text" s={14} style={{color:'#7C3AED'}}/> Résumé</div>
          <div style={{fontSize:12,color:T.text2,lineHeight:1.6,padding:'10px 14px',background:T.surface,borderRadius:10}}>{detailA.summary}</div>
        </div>
      )}
      {/* Objections */}
      {(detailA.objections || []).length > 0 && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="alert-triangle" s={14} style={{color:'#F59E0B'}}/> Objections détectées ({detailA.objections.length})</div>
          {detailA.objections.map((o,i) => (
            <div key={i} style={{padding:'8px 12px',borderRadius:8,background:'#FFFBEB',marginBottom:6,border:'1px solid #FDE68A'}}>
              <div style={{fontSize:12,fontWeight:600,color:'#92400E'}}>{o.objection||o}</div>
              {o.suggestedResponse && <div style={{fontSize:11,color:'#22C55E',marginTop:4}}>Réponse suggérée : {o.suggestedResponse}</div>}
            </div>
          ))}
        </div>
      )}
      {/* Action Items */}
      {(detailA.actionItems || []).length > 0 && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="check-square" s={14} style={{color:'#2563EB'}}/> Actions recommandées</div>
          {detailA.actionItems.map((a,i) => <div key={i} style={{fontSize:12,color:T.text2,padding:'4px 0',display:'flex',gap:6}}><I n="chevron-right" s={12} style={{color:'#2563EB',flexShrink:0,marginTop:2}}/> {a}</div>)}
        </div>
      )}
      {/* Coaching Tips */}
      {(detailA.coachingTips || []).length > 0 && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="award" s={14} style={{color:'#7C3AED'}}/> Conseils coaching</div>
          {detailA.coachingTips.map((t,i) => <div key={i} style={{fontSize:12,color:T.text2,padding:'4px 0',display:'flex',gap:6}}><span style={{color:'#7C3AED',flexShrink:0}}>*</span> {t}</div>)}
        </div>
      )}
      {/* Follow-up */}
      {detailA.followupType && (
        <div style={{padding:'10px 14px',borderRadius:10,background:'#F5F3FF',border:'1px solid #DDD6FE',marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:'#7C3AED',marginBottom:2}}>Relance recommandée : {detailA.followupType}</div>
          {detailA.followupDate && <div style={{fontSize:11,color:T.text3}}>Date suggérée : {detailA.followupDate}</div>}
        </div>
      )}
      {/* Tags */}
      {(detailA.tags || []).length > 0 && (
        <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:16}}>
          {detailA.tags.map((t,i) => <span key={i} style={{fontSize:10,padding:'2px 8px',borderRadius:6,background:T.accentBg,color:T.accent,fontWeight:600}}>#{t}</span>)}
        </div>
      )}
      {/* CRM Auto-fill */}
      <div style={{marginTop:8,padding:16,borderRadius:14,background:'linear-gradient(135deg,#7C3AED08,#2563EB08)',border:'1px solid #7C3AED20'}}>
        {!detailA.crmAutoFilled ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:T.text,display:'flex',alignItems:'center',gap:6}}><I n="database" s={15} style={{color:'#7C3AED'}}/> Synchronisation CRM</div>
              <div style={{fontSize:11,color:T.text3,marginTop:2}}>Remplir automatiquement la fiche contact</div>
            </div>
            <div onClick={() => handleCrmAutoFill(detailA.id)} style={{padding:'10px 20px',borderRadius:10,background:'linear-gradient(135deg,#7C3AED,#2563EB)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:6,boxShadow:'0 4px 14px rgba(124,58,237,0.35)',transition:'all .2s',whiteSpace:'nowrap',flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)';}} onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';}}>
              <I n="zap" s={14}/> Remplir CRM
            </div>
          </div>
        ) : (
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:'#F0FDF4',border:'1px solid #22C55E30',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="check-circle" s={18} style={{color:'#22C55E'}}/></div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'#22C55E'}}>CRM mis à jour automatiquement</div>
              <div style={{fontSize:11,color:T.text3}}>Résumé, tags et étape pipeline synchronisés</div>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
</div>
)}

{/* ── Script Generator Sub-Modal ── */}
{cpData.scriptModal && (
<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10000,padding:20}} onClick={() => setCpData(p => ({...p, scriptModal: false, generatedScript: null, scriptPrompt: ''}))}>
  <div onClick={e => e.stopPropagation()} style={{background:T.card||T.surface,borderRadius:20,width:'100%',maxWidth:600,maxHeight:'85vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
    <div style={{padding:'20px 24px',background:'linear-gradient(135deg,#7C3AED,#2563EB)',borderRadius:'20px 20px 0 0',color:'#fff',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div>
        <div style={{fontSize:16,fontWeight:800}}>Générateur de scripts IA</div>
        <div style={{fontSize:12,opacity:0.8}}>Basé sur le profil Copilot : {collab.ai_copilot_role || 'Non configuré'}</div>
      </div>
      <div onClick={() => setCpData(p => ({...p, scriptModal: false}))} style={{cursor:'pointer',width:32,height:32,borderRadius:10,background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="x" s={16}/></div>
    </div>
    <div style={{padding:24}}>
      {!cpData.generatedScript ? (<>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:4,color:T.text2}}>Contexte (optionnel)</div>
          <textarea value={cpData.scriptPrompt||''} onChange={e => setCpData(p => ({...p, scriptPrompt: e.target.value}))} placeholder="Ex: Le prospect est un agent immobilier intéressé par notre formation certifiante..." style={{width:'100%',minHeight:80,padding:12,borderRadius:10,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:13,resize:'vertical',outline:'none',fontFamily:'inherit'}}/>
        </div>
        <div style={{padding:14,borderRadius:10,background:'#F5F3FF',marginBottom:16}}>
          <div style={{fontSize:11,color:'#7C3AED',fontWeight:600}}>Profil Copilot configuré :</div>
          <div style={{fontSize:12,color:T.text2,marginTop:4}}>
            <strong>Rôle :</strong> {collab.ai_copilot_role || '(non défini)'} · <strong>Objectif :</strong> {collab.ai_copilot_objective || '(non défini)'} · <strong>Cible :</strong> {collab.ai_copilot_target || '(non défini)'}
          </div>
        </div>
        <Btn primary style={{width:'100%',justifyContent:'center',padding:'12px',fontSize:14,background:'linear-gradient(135deg,#7C3AED,#2563EB)',border:'none'}} onClick={handleGenScript} disabled={cpData.scriptLoading}>
          {cpData.scriptLoading ? <><I n="loader" s={16} className="spin"/> Génération en cours...</> : <><I n="zap" s={16}/> Générer le script</>}
        </Btn>
      </>) : (<>
        <div style={{marginBottom:16}}>
          {['introduction','discovery','argumentation','objections','closing'].map(section => {
            const content = cpData.generatedScript[section];
            if (!content) return null;
            const labels = {introduction:'Introduction',discovery:'Découverte',argumentation:'Argumentaire',objections:'Gestion des objections',closing:'Closing'};
            return (
              <div key={section} style={{marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:6,color:'#7C3AED'}}>{labels[section]||section}</div>
                <div style={{fontSize:12,color:T.text2,lineHeight:1.7,padding:'10px 14px',background:T.surface,borderRadius:10,whiteSpace:'pre-wrap'}}>{typeof content === 'string' ? content : JSON.stringify(content, null, 2)}</div>
              </div>
            );
          })}
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn style={{flex:1,justifyContent:'center'}} onClick={() => setCpData(p => ({...p, generatedScript: null, scriptPrompt: ''}))}><I n="refresh-cw" s={14}/> Regénérer</Btn>
          <Btn primary style={{flex:1,justifyContent:'center',background:'linear-gradient(135deg,#7C3AED,#2563EB)',border:'none'}} onClick={() => {
            const steps = [];
            ['introduction','discovery','argumentation','objections','closing'].forEach(s => { if (cpData.generatedScript[s]) steps.push(typeof cpData.generatedScript[s]==='string'?cpData.generatedScript[s]:JSON.stringify(cpData.generatedScript[s])); });
            const ns = {id:'script_ai_'+Date.now(), name:'Script IA — '+(collab.ai_copilot_role||'Custom'), steps, category:'custom'};
            setPhoneCallScripts(p => {const u=[...p,ns]; saveScriptsDual(u); return u;});
            setCpData(p => ({...p, scriptModal: false, generatedScript: null, scriptPrompt: ''}));
            showNotif('Script IA sauvegardé');
          }}><I n="save" s={14}/> Sauvegarder dans Scripts</Btn>
        </div>
      </>)}
    </div>
  </div>
</div>
)}

      </div>
    </div>);
  })()}

  {/* ═══════════════════════════════════════════════════════════════════
      EXISTING KEPT MODALS
     ═══════════════════════════════════════════════════════════════════ */}

  {/* a) Call Notes Modal */}
  {(typeof phoneShowCallNoteModal!=='undefined'?phoneShowCallNoteModal:null) && (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setPhoneShowCallNoteModal(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:16,padding:24,maxWidth:400,width:'90%',boxShadow:'0 25px 50px rgba(0,0,0,0.25)'}}>
<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
<div style={{width:36,height:36,borderRadius:10,background:T.accentBg,display:'flex',alignItems:'center',justifyContent:'center'}}><I n="edit-3" s={16} style={{color:T.accent}}/></div>
<h3 style={{fontSize:16,fontWeight:700,margin:0}}>Notes d'appel</h3>
<span onClick={()=>setPhoneShowCallNoteModal(null)} style={{marginLeft:'auto',cursor:'pointer',color:T.text3}}><I n="x" s={16}/></span>
</div>
<textarea value={phoneCallNoteText} onChange={e=>(typeof setPhoneCallNoteText==='function'?setPhoneCallNoteText:function(){})(e.target.value)} placeholder="Notez les points importants..." rows={4} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1px solid ${T.border}`,background:T.bg,fontSize:13,fontFamily:'inherit',color:T.text,outline:'none',resize:'vertical',marginBottom:12}}/>
<div style={{display:'flex',gap:8}}>
<Btn small style={{flex:1,justifyContent:'center'}} onClick={()=>setPhoneShowCallNoteModal(null)}>Annuler</Btn>
<Btn small primary style={{flex:1,justifyContent:'center'}} onClick={()=>{
  const cid=(typeof phoneShowCallNoteModal!=='undefined'?phoneShowCallNoteModal:null);
  setPhoneCallNotes(p=>({...p,[cid]:(typeof phoneCallNoteText!=='undefined'?phoneCallNoteText:null)}));
  try{localStorage.setItem('c360-phone-callNotes-'+collab.id,JSON.stringify({...phoneCallNotes,[cid]:(typeof phoneCallNoteText!=='undefined'?phoneCallNoteText:null)}))}catch(e){}
  api(`/api/voip/calls/${cid}`,{method:'PUT',body:{notes:(typeof phoneCallNoteText!=='undefined'?phoneCallNoteText:null)}}).catch(()=>{});
  setPhoneShowCallNoteModal(null);
  showNotif('Note sauvegardée');
}}><I n="save" s={14}/> Sauvegarder</Btn>
</div>
      </div>
    </div>
  )}

  {/* b) Schedule Creation Modal — MOVED TO GLOBAL SCOPE (after all tabs) */}

  {/* c) Campaign Creation Modal */}
  {(typeof phoneShowCampaignModal!=='undefined'?phoneShowCampaignModal:null) && (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setPhoneShowCampaignModal(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:20,padding:24,maxWidth:480,width:'90%',boxShadow:'0 25px 50px rgba(0,0,0,0.25)'}}>
<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
<div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#F59E0B,#D97706)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="zap" s={18} style={{color:'#fff'}}/></div>
<div>
  <h3 style={{fontSize:16,fontWeight:700,margin:0}}>Nouvelle campagne</h3>
  <div style={{fontSize:12,color:T.text3}}>Créez une session d'appels automatisée</div>
</div>
<span onClick={()=>setPhoneShowCampaignModal(false)} style={{marginLeft:'auto',cursor:'pointer',color:T.text3}}><I n="x" s={18}/></span>
</div>

<div style={{display:'flex',flexDirection:'column',gap:12}}>
<div>
  <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Nom de la campagne</label>
  <input id="campaign-name-input" placeholder="Ex: Prospection Mars 2026" style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1px solid ${T.border}`,background:T.bg,fontSize:13,color:T.text,outline:'none',fontFamily:'inherit'}}/>
</div>
<div>
  <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:6,display:'block'}}>Sélectionner des contacts ({(contacts||[]).length} disponibles)</label>
  <div style={{maxHeight:200,overflow:'auto',border:`1px solid ${T.border}`,borderRadius:10,padding:8}}>
    {(contacts||[]).length === 0 ? (
      <div style={{padding:16,textAlign:'center',color:T.text3,fontSize:12}}>Aucun contact disponible</div>
    ) : (contacts||[]).map(c=>(
      <label key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:8,cursor:'pointer',fontSize:12}}>
        <input type="checkbox" className={'campaign-contact-'+c.id} style={{accentColor:T.accent}}/>
        <span style={{fontWeight:600}}>{c.name}</span>
        <span style={{color:T.text3,marginLeft:'auto'}}>{c.phone||c.mobile||'—'}</span>
      </label>
    ))}
  </div>
</div>
</div>

<div style={{display:'flex',gap:8,marginTop:16}}>
<Btn small style={{flex:1,justifyContent:'center'}} onClick={()=>setPhoneShowCampaignModal(false)}>Annuler</Btn>
<Btn small primary style={{flex:1,justifyContent:'center'}} onClick={()=>{
  const nameEl=document.getElementById('campaign-name-input');
  const name=nameEl?.value?.trim()||'Campagne '+((typeof phoneCampaigns!=='undefined'?phoneCampaigns:{}).length+1);
  const selectedContacts=(contacts||[]).filter(c=>{const cb=document.querySelector('.campaign-contact-'+c.id);return cb?.checked}).map(c=>({id:c.id,name:c.name,number:c.phone||c.mobile||''}));
  if(selectedContacts.length===0){showNotif('Sélectionnez au moins un contact','danger');return;}
  const nc={id:'camp_'+Date.now(),name,contacts:selectedContacts,status:'paused',completed:0,createdAt:new Date().toISOString()};
  setPhoneCampaigns(p=>{const u=[...p,nc];try{localStorage.setItem('c360-phone-campaigns-'+collab.id,JSON.stringify(u))}catch(e){}return u;});
  setPhoneShowCampaignModal(false);
  showNotif('Campagne créée');
}}><I n="zap" s={14}/> Créer la campagne</Btn>
</div>
      </div>
    </div>
  )}

  {/* d) Quick Add Contact Popup — V1.10.2 fix overflow + responsive */}
  {(typeof phoneQuickAddPhone!=='undefined'?phoneQuickAddPhone:null) && (()=>{
    const _qaInput = {boxSizing:'border-box',width:'100%',minWidth:0,padding:'10px 12px',borderRadius:10,border:`1.5px solid ${T.border}`,background:T.bg,fontSize:14,fontFamily:'inherit',color:T.text,outline:'none'};
    const _qaPhone = {boxSizing:'border-box',width:'100%',minWidth:0,display:'flex',alignItems:'center',gap:6,padding:'10px 12px',borderRadius:10,background:T.bg,border:`1.5px solid ${T.border}`};
    return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',backdropFilter:'blur(4px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16,boxSizing:'border-box'}} onClick={()=>setPhoneQuickAddPhone(null)}>
      <div onClick={e=>e.stopPropagation()} style={{boxSizing:'border-box',background:T.surface,borderRadius:16,padding:20,width:'100%',maxWidth:380,maxHeight:'calc(100vh - 32px)',overflow:'auto',boxShadow:'0 20px 50px rgba(0,0,0,0.25)'}}>
<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,minWidth:0}}>
<div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#2563EB,#3B82F6)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><I n="user-plus" s={18} style={{color:'#fff'}}/></div>
<div style={{flex:1,minWidth:0,overflow:'hidden'}}>
  <div style={{fontWeight:800,fontSize:15,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Créer une fiche rapide</div>
  <div style={{fontSize:12,color:T.text3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{phoneQuickAddPhone}</div>
</div>
<div onClick={()=>setPhoneQuickAddPhone(null)} style={{flexShrink:0,width:28,height:28,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:T.bg,border:`1px solid ${T.border}`,color:T.text3}} title="Fermer"><I n="x" s={14}/></div>
</div>
<div style={{display:'flex',flexDirection:'column',gap:10}}>
{/* BTC / BTB Toggle */}
<div style={{display:'flex',gap:0,borderRadius:10,overflow:'hidden',border:`1.5px solid ${T.border}`}}>
  <div onClick={()=>(typeof setPhoneQuickAddType==='function'?setPhoneQuickAddType:function(){})('btc')} style={{flex:1,padding:'8px 0',textAlign:'center',fontSize:12,fontWeight:700,cursor:'pointer',background:phoneQuickAddType==='btc'?T.accent:'transparent',color:phoneQuickAddType==='btc'?'#fff':T.text3,transition:'all .15s'}}>
    <I n="user" s={12}/> Particulier
  </div>
  <div onClick={()=>(typeof setPhoneQuickAddType==='function'?setPhoneQuickAddType:function(){})('btb')} style={{flex:1,padding:'8px 0',textAlign:'center',fontSize:12,fontWeight:700,cursor:'pointer',background:phoneQuickAddType==='btb'?T.accent:'transparent',color:phoneQuickAddType==='btb'?'#fff':T.text3,transition:'all .15s',borderLeft:`1.5px solid ${T.border}`}}>
    <I n="building-2" s={12}/> Entreprise
  </div>
</div>
{/* BTC Fields */}
{phoneQuickAddType==='btc' && <>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <div style={{flex:'1 1 140px',minWidth:0}}>
      <input value={phoneQuickAddFirstname} onChange={e=>(typeof setPhoneQuickAddFirstname==='function'?setPhoneQuickAddFirstname:function(){})(e.target.value)} placeholder="Prénom *" autoFocus style={_qaInput}/>
    </div>
    <div style={{flex:'1 1 140px',minWidth:0}}>
      <input value={phoneQuickAddLastname} onChange={e=>(typeof setPhoneQuickAddLastname==='function'?setPhoneQuickAddLastname:function(){})(e.target.value)} placeholder="Nom *" style={_qaInput}/>
    </div>
  </div>
  <div style={_qaPhone}>
    <I n="phone" s={13} style={{color:T.text3,flexShrink:0}}/>
    <span style={{fontSize:13,color:T.text2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{phoneQuickAddPhone}</span>
  </div>
  <input value={phoneQuickAddEmail} onChange={e=>(typeof setPhoneQuickAddEmail==='function'?setPhoneQuickAddEmail:function(){})(e.target.value)} placeholder="Email" style={_qaInput}/>
</>}
{/* BTB Fields */}
{phoneQuickAddType==='btb' && <>
  <input value={phoneQuickAddCompany} onChange={e=>(typeof setPhoneQuickAddCompany==='function'?setPhoneQuickAddCompany:function(){})(e.target.value)} placeholder="Nom de l'entreprise *" autoFocus style={_qaInput}/>
  <input value={phoneQuickAddSiret} onChange={e=>(typeof setPhoneQuickAddSiret==='function'?setPhoneQuickAddSiret:function(){})(e.target.value)} placeholder="SIRET" style={_qaInput}/>
  <input value={phoneQuickAddResponsable} onChange={e=>(typeof setPhoneQuickAddResponsable==='function'?setPhoneQuickAddResponsable:function(){})(e.target.value)} placeholder="Responsable" style={_qaInput}/>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <div style={{flex:'1 1 140px',minWidth:0,...(_qaPhone)}}>
      <I n="phone" s={13} style={{color:T.text3,flexShrink:0}}/>
      <span style={{fontSize:13,color:T.text2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{phoneQuickAddPhone}</span>
    </div>
    <div style={{flex:'1 1 140px',minWidth:0}}>
      <input value={phoneQuickAddMobile} onChange={e=>(typeof setPhoneQuickAddMobile==='function'?setPhoneQuickAddMobile:function(){})(e.target.value)} placeholder="Tél portable" style={_qaInput}/>
    </div>
  </div>
  <input value={phoneQuickAddEmail} onChange={e=>(typeof setPhoneQuickAddEmail==='function'?setPhoneQuickAddEmail:function(){})(e.target.value)} placeholder="Email" style={_qaInput}/>
  <input value={phoneQuickAddWebsite} onChange={e=>(typeof setPhoneQuickAddWebsite==='function'?setPhoneQuickAddWebsite:function(){})(e.target.value)} placeholder="Site web" style={_qaInput}/>
</>}
<div>
  <label style={{display:'block',fontSize:11,fontWeight:600,color:T.text3,marginBottom:4}}>Statut</label>
  <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
    {PIPELINE_STAGES.map(s=>(
      <div key={s.id} onClick={()=>(typeof setPhoneQuickAddStage==='function'?setPhoneQuickAddStage:function(){})(s.id)} style={{padding:'4px 10px',borderRadius:8,fontSize:11,fontWeight:phoneQuickAddStage===s.id?700:500,cursor:'pointer',background:phoneQuickAddStage===s.id?s.color+'18':'transparent',color:phoneQuickAddStage===s.id?s.color:T.text3,border:`1.5px solid ${phoneQuickAddStage===s.id?s.color:T.border}`,transition:'all .15s'}}>
        {s.label}
      </div>
    ))}
  </div>
</div>
<div style={{display:'flex',gap:8,marginTop:6}}>
  <div onClick={()=>setPhoneQuickAddPhone(null)} style={{flex:1,padding:'10px 0',borderRadius:10,textAlign:'center',fontSize:13,fontWeight:600,cursor:'pointer',background:T.bg,border:`1px solid ${T.border}`,color:T.text2}}>Annuler</div>
  <div onClick={handleQuickAddContact} style={{flex:1,padding:'10px 0',borderRadius:10,textAlign:'center',fontSize:13,fontWeight:700,cursor:'pointer',background:'linear-gradient(135deg,#2563EB,#3B82F6)',color:'#fff',boxShadow:'0 2px 8px rgba(37,99,235,0.3)'}}>Créer la fiche</div>
</div>
</div>
      </div>
    </div>
    );
  })()}

{/* ═══════════════════════════════════════════════════════════════════
    PIPELINE POPUP CONTACT — Click card → popup with actions
    ═══════════════════════════════════════════════════════════════════ */}
{(typeof pipelinePopupContact!=='undefined'?pipelinePopupContact:null) && (()=>{
  const ct = (contacts||[]).find(x=>x.id===(typeof pipelinePopupContact!=='undefined'?pipelinePopupContact:{}).id) || pipelinePopupContact;
  const stage = ct.pipeline_stage||'nouveau';
  const STAGES = PIPELINE_STAGES;
  const stg = STAGES.find(s=>s.id===stage)||STAGES[0];
  const tags = (()=>{try{return Array.isArray(ct.tags)?ct.tags:JSON.parse(ct.tags_json||'[]');}catch{return [];}})();
  const callCount = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(cl=>cl.contactId===ct.id).length;
  const nrpFollowups = (()=>{try{return Array.isArray(ct.nrp_followups)?ct.nrp_followups:JSON.parse(ct.nrp_followups_json||'[]');}catch{return [];}})();
  const nrpDoneCount = nrpFollowups.filter(f=>f.done).length;
  const ownerName = ct.assignedTo ? ((collabs||[]).find(c=>c.id===ct.assignedTo)?.name||'') : '';
  const ctBookings = (bookings||[]).filter(b=>(b.contactId===ct.id)&&(b.collaboratorId===collab.id)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const scoreColor = cScoreColor(ct._score||0);
  const scoreLabel = cScoreLabel(ct._score||0);
  return (
  <div onClick={()=>setPipelinePopupContact(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(8px)'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:500,maxHeight:'90vh',borderRadius:24,background:'#ffffff',boxShadow:'0 30px 100px rgba(0,0,0,0.35)',overflow:'hidden',display:'flex',flexDirection:'column',border:'1px solid rgba(0,0,0,0.08)'}}>

      {/* ── HEADER ── */}
      <div style={{padding:'20px 24px 16px',background:`linear-gradient(135deg,${stg.color}dd,${stg.color}88)`,position:'relative'}}>
<div onClick={()=>setPipelinePopupContact(null)} style={{position:'absolute',top:14,right:14,width:30,height:30,borderRadius:10,background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',backdropFilter:'blur(4px)'}}><I n="x" s={16} style={{color:'#fff'}}/></div>
<div style={{display:'flex',alignItems:'center',gap:14}}>
<div style={{width:56,height:56,borderRadius:16,background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:800,color:'#fff',backdropFilter:'blur(4px)'}}>{(ct.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>
<div style={{flex:1}}>
  <div style={{fontSize:20,fontWeight:800,color:'#fff',letterSpacing:-0.3}}>{ct.name}</div>
  <div style={{display:'flex',gap:8,marginTop:4,flexWrap:'wrap',alignItems:'center'}}>
    {ct.phone && <span style={{fontSize:11,color:'#ffffffbb',display:'flex',alignItems:'center',gap:3}}><I n="phone" s={10}/> {fmtPhone(ct.phone)}</span>}
    {ct.email && <span style={{fontSize:11,color:'#ffffffbb',display:'flex',alignItems:'center',gap:3}}><I n="mail" s={10}/> {ct.email}</span>}
    {stage==='nrp' && nrpDoneCount > 0 && <span style={{fontSize:10,fontWeight:800,color:'#fff',background:'#EF4444',padding:'2px 8px',borderRadius:8,display:'flex',alignItems:'center',gap:3}}><I n="phone-missed" s={10}/> NRP · {nrpDoneCount}</span>}
  </div>
</div>
<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
  <div style={{width:40,height:40,borderRadius:12,background:'rgba(255,255,255,0.2)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}}>
    <span style={{fontSize:14,fontWeight:800,color:'#fff',lineHeight:1}}>{ct._score>=0?'+':''}{ct._score||0}</span>
    <span style={{fontSize:7,color:'#ffffffaa',lineHeight:1}}>{scoreLabel}</span>
  </div>
  <span style={{fontSize:8,fontWeight:700,color:'#ffffffcc',textTransform:'uppercase',letterSpacing:0.5}}>{stg.label}</span>
</div>
</div>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div style={{flex:1,overflow:'auto'}}>

{/* ── ACTIONS RAPIDES ── */}
<div style={{padding:'14px 24px',display:'flex',gap:8,borderBottom:'1px solid '+T.border}}>
{[
  {icon:'phone',label:'Appeler',color:'#22C55E',bg:'#22C55E',action:()=>{setPipelinePopupContact(null);prefillKeypad(ct.phone);}},
  {icon:'message-square',label:'SMS',color:'#7C3AED',bg:'#7C3AED',action:()=>{setPipelinePopupContact(null);setCollabTab('telephone');setPhoneDialNumber(ct.phone||'');setPhoneSubTab('sms');}},
  {icon:'calendar',label:'RDV',color:'#0EA5E9',bg:'#0EA5E9',action:()=>{const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:tomorrow.toISOString().split('T')[0],time:'10:00',notes:'',_bookingMode:true});setPhoneShowScheduleModal(true);setPipelinePopupContact(null);}},
  {icon:'mail',label:'Email',color:'#F59E0B',bg:'#F59E0B',action:()=>ct.email?window.open('mailto:'+ct.email):showNotif('Pas d\'email','danger')},
].map((a,i)=>(
  <div key={i} onClick={a.action} style={{flex:1,padding:'10px 0',borderRadius:12,textAlign:'center',cursor:'pointer',background:a.bg+'10',border:'1px solid '+a.bg+'25',transition:'all .15s',display:'flex',flexDirection:'column',alignItems:'center',gap:4}} onMouseEnter={e=>{e.currentTarget.style.background=a.bg+'20';e.currentTarget.style.transform='translateY(-1px)';}} onMouseLeave={e=>{e.currentTarget.style.background=a.bg+'10';e.currentTarget.style.transform='translateY(0)';}}>
    <I n={a.icon} s={16} style={{color:a.color}}/>
    <span style={{fontSize:10,fontWeight:700,color:a.color}}>{a.label}</span>
  </div>
))}
</div>

{/* ── INFOS EDITABLES ── */}
<div style={{padding:'12px 24px',borderBottom:'1px solid '+T.border}}>
<div style={{fontSize:11,fontWeight:700,color:T.text,marginBottom:8,display:'flex',alignItems:'center',gap:5}}><I n="user" s={12} style={{color:T.accent}}/> Informations</div>
<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
  {[
    {icon:'phone',key:'phone',label:'Telephone',val:ct.phone},
    {icon:'mail',key:'email',label:'Email',val:ct.email},
    {icon:'briefcase',key:'company',label:'Entreprise',val:ct.company},
    {icon:'map-pin',key:'address',label:'Adresse',val:ct.address},
  ].map(f=>(
    <div key={f.key} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:8,background:T.bg,border:'1px solid '+T.border}}>
      <I n={f.icon} s={11} style={{color:T.text3,flexShrink:0}}/>
      <input value={f.val||''} onChange={e=>{handleCollabUpdateContact(ct.id,{[f.key]:e.target.value});setPipelinePopupContact(prev=>prev?{...prev,[f.key]:e.target.value}:null);}} placeholder={f.label} style={{flex:1,padding:0,border:'none',background:'transparent',fontSize:11,color:T.text,outline:'none',fontFamily:'inherit'}}/>
    </div>
  ))}
</div>
<div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
  {callCount>0 && <span style={{fontSize:9,padding:'3px 8px',borderRadius:6,background:'#3B82F610',color:'#3B82F6',fontWeight:600}}>{callCount} appels</span>}
  {ct.totalBookings>0 && <span style={{fontSize:9,padding:'3px 8px',borderRadius:6,background:'#0EA5E910',color:'#0EA5E9',fontWeight:600}}>{ct.totalBookings} RDV</span>}
  {nrpDoneCount>0 && <span style={{fontSize:9,padding:'3px 8px',borderRadius:6,background:'#EF444410',color:'#EF4444',fontWeight:600}}>{nrpDoneCount} NRP</span>}
  {ownerName && <span style={{fontSize:9,padding:'3px 8px',borderRadius:6,background:T.accentBg,color:T.accent,fontWeight:600}}>{ownerName}</span>}
  {ct.source && ct.source!=='manual' && <span style={{fontSize:9,padding:'3px 8px',borderRadius:6,background:T.bg,color:T.text3,border:'1px solid '+T.border}}>{ct.source}</span>}
  {tags.map(t=><span key={String(t)} style={{fontSize:9,padding:'3px 8px',borderRadius:6,background:'#7C3AED10',color:'#7C3AED',fontWeight:600}}>{String(t)}</span>)}
</div>
</div>

{/* ── NOTES ── */}
<div style={{padding:'12px 24px',borderBottom:'1px solid '+T.border}}>
<div style={{fontSize:11,fontWeight:700,color:T.text,marginBottom:6,display:'flex',alignItems:'center',gap:5}}><I n="edit-3" s={12} style={{color:'#F59E0B'}}/> Notes</div>
<textarea value={ct.notes||''} onChange={e=>{const v=e.target.value;handleCollabUpdateContact(ct.id,{notes:v});setPipelinePopupContact(prev=>prev?{...prev,notes:v}:null);}} placeholder="Ajouter des notes sur ce lead..." rows={2} style={{width:'100%',padding:'8px 12px',borderRadius:10,border:'1px solid '+T.border,background:T.bg,fontSize:12,fontFamily:'inherit',color:T.text,resize:'vertical',outline:'none',lineHeight:1.5}}/>
</div>

{/* ── RDV ── */}
{ctBookings.length>0 && <div style={{padding:'12px 24px',borderBottom:'1px solid '+T.border}}>
<div style={{fontSize:11,fontWeight:700,color:T.text,marginBottom:8,display:'flex',alignItems:'center',gap:5}}><I n="calendar" s={12} style={{color:'#0EA5E9'}}/> Rendez-vous ({ctBookings.length})</div>
<div style={{display:'flex',flexDirection:'column',gap:6}}>
  {ctBookings.slice(0,5).map(bk=>{
    const isPast=bk.date<new Date().toISOString().split('T')[0];
    const isToday=bk.date===new Date().toISOString().split('T')[0];
    return <div key={bk.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:10,background:isToday?'#22C55E08':isPast?T.bg:'#0EA5E908',border:'1px solid '+(isToday?'#22C55E20':isPast?T.border:'#0EA5E920')}}>
      <div style={{width:32,height:32,borderRadius:8,background:isToday?'#22C55E15':isPast?T.bg:'#0EA5E915',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="calendar" s={14} style={{color:isToday?'#22C55E':isPast?T.text3:'#0EA5E9'}}/></div>
      <div style={{flex:1}}>
        <div style={{fontSize:12,fontWeight:600,color:isToday?'#22C55E':isPast?T.text3:T.text}}>{isToday?'Aujourd\'hui':new Date(bk.date).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})} {bk.time&&'a '+bk.time}</div>
        <div style={{fontSize:10,color:T.text3}}>{bk.duration||30}min · {bk.status==='confirmed'?'Confirme':bk.status==='cancelled'?'Annule':'En attente'}</div>
      </div>
      <span style={{fontSize:8,padding:'2px 6px',borderRadius:5,background:bk.status==='confirmed'?'#22C55E15':'#F59E0B15',color:bk.status==='confirmed'?'#22C55E':'#F59E0B',fontWeight:700}}>{bk.status==='confirmed'?'✓':'⏳'}</span>
    </div>;
  })}
</div>
</div>}

{/* ── NRP RELANCES ── */}
{stage==='nrp' && nrpFollowups.length>0 && <div style={{padding:'12px 24px',borderBottom:'1px solid '+T.border}}>
<div style={{fontSize:11,fontWeight:700,color:T.text,marginBottom:8,display:'flex',alignItems:'center',gap:5}}><I n="phone-missed" s={12} style={{color:'#EF4444'}}/> Tentatives NRP ({nrpDoneCount})</div>
<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
  {nrpFollowups.map((fu,i)=><div key={i} style={{padding:'4px 10px',borderRadius:8,background:fu.done?'#22C55E10':fu.date<=new Date().toISOString().split('T')[0]?'#EF444410':'#F59E0B10',border:'1px solid '+(fu.done?'#22C55E20':fu.date<=new Date().toISOString().split('T')[0]?'#EF444420':'#F59E0B20'),fontSize:10,fontWeight:600,color:fu.done?'#22C55E':fu.date<=new Date().toISOString().split('T')[0]?'#EF4444':'#F59E0B'}}>
    {fu.done?'✓ ':'⏳ '}{new Date(fu.date).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}
    {fu.note && <span style={{fontSize:8,color:T.text3,marginLeft:4}}>{fu.note.slice(0,25)}</span>}
  </div>)}
</div>
</div>}

{/* ── PARCOURS ── */}
<div style={{padding:'12px 24px',borderBottom:'1px solid '+T.border}}>
<div style={{fontSize:11,fontWeight:700,color:T.text,marginBottom:8,display:'flex',alignItems:'center',gap:5}}><I n="git-branch" s={12} style={{color:'#7C3AED'}}/> Parcours ({(typeof pipelinePopupHistory!=='undefined'?pipelinePopupHistory:{}).length})</div>
{(typeof pipelinePopupHistory!=='undefined'?pipelinePopupHistory:{}).length===0
  ? <div style={{fontSize:11,color:T.text3,fontStyle:'italic',padding:'8px 0'}}>Aucun historique pour le moment</div>
  : <div style={{position:'relative',paddingLeft:16,maxHeight:180,overflow:'auto'}}>
    <div style={{position:'absolute',left:5,top:6,bottom:6,width:2,background:T.border,borderRadius:1}}/>
    {(typeof pipelinePopupHistory!=='undefined'?pipelinePopupHistory:{}).map((h,i)=>{
      const from = STAGES.find(s=>s.id===h.fromStage)||{label:h.fromStage||'—',color:'#94A3B8'};
      const to = STAGES.find(s=>s.id===h.toStage)||{label:h.toStage||'—',color:'#94A3B8'};
      const isPerdu = h.toStage==='perdu';
      const isNrp = h.toStage==='nrp'&&h.fromStage==='nrp';
      return <div key={h.id} style={{position:'relative',marginBottom:10,paddingLeft:12}}>
        <div style={{position:'absolute',left:-12,top:4,width:10,height:10,borderRadius:5,background:to.color,border:'2.5px solid '+T.card,zIndex:1}}/>
        <div style={{padding:'6px 10px',borderRadius:8,background:isPerdu?'#EF444406':isNrp?'#F59E0B06':T.bg,border:'1px solid '+(isPerdu?'#EF444415':isNrp?'#F59E0B15':T.border)}}>
          <div style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}>
            <span style={{fontWeight:600,color:from.color}}>{from.label}</span>
            <span style={{color:T.text3,fontSize:10}}>→</span>
            <span style={{fontWeight:700,color:to.color}}>{to.label}</span>
            <span style={{marginLeft:'auto',fontSize:9,color:T.text3}}>{new Date(h.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})} {new Date(h.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
          </div>
          {h.userName && <div style={{fontSize:9,color:T.text3,marginTop:2}}>par {h.userName}</div>}
          {h.note && <div style={{fontSize:10,color:isPerdu?'#EF4444':'#64748B',marginTop:3,padding:'3px 8px',borderRadius:6,background:isPerdu?'#EF444408':'transparent',fontStyle:'italic'}}>{isPerdu?'Motif: ':''}{h.note}</div>}
        </div>
      </div>;
    })}
  </div>
}
</div>

{/* ── TYPE CONTACT (couleur pipeline) ── */}
<div style={{padding:'12px 24px'}}>
<div style={{fontSize:11,fontWeight:700,color:T.text,marginBottom:8,display:'flex',alignItems:'center',gap:5}}><I n="palette" s={12} style={{color:T.accent}}/> Type contact</div>
{(()=>{
  const customColors=JSON.parse(localStorage.getItem('pipeline_custom_colors')||'[]');
  const allColors=[...PIPELINE_CARD_COLORS_DEFAULT,...customColors];
  return <>
    <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:6}}>
      {allColors.map(pc=><div key={pc.color+pc.label} onClick={()=>{handleCollabUpdateContact(ct.id,{card_color:pc.color,card_label:pc.color?pc.label:''});}} style={{padding:'5px 12px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:600,background:ct.card_color===pc.color?(pc.color||T.border)+'18':T.bg,color:pc.color||T.text3,border:`1.5px solid ${ct.card_color===pc.color?(pc.color||T.border):T.border}`,display:'flex',alignItems:'center',gap:4,transition:'all .15s'}}>
        <div style={{width:10,height:10,borderRadius:3,background:pc.color||T.border}}/>{pc.label}
        {customColors.some(c=>c.color===pc.color&&c.label===pc.label)&&<span onClick={e=>{e.stopPropagation();const updated=customColors.filter(c=>!(c.color===pc.color&&c.label===pc.label));localStorage.setItem('pipeline_custom_colors',JSON.stringify(updated));setPipelineRdvForm(p=>({...p,_refreshColors:Date.now()}));}} style={{marginLeft:2,fontSize:10,color:'#EF4444',cursor:'pointer',fontWeight:800}} title="Supprimer">×</span>}
      </div>)}
    </div>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <input type="color" id="_pipeAdminCustomColor" defaultValue={ct.card_color||'#6366F1'} style={{width:32,height:32,border:'none',borderRadius:8,cursor:'pointer',padding:0,background:'transparent'}}/>
      <input type="text" id="_pipeAdminCustomLabel" placeholder="Nom du type" defaultValue="" style={{flex:1,padding:'6px 10px',borderRadius:8,fontSize:12,border:`1px solid ${T.border}`,background:T.bg,color:T.text,outline:'none'}}/>
      <div onClick={()=>{const color=document.getElementById('_pipeAdminCustomColor')?.value;const label=document.getElementById('_pipeAdminCustomLabel')?.value?.trim();if(!color||!label)return;const existing=JSON.parse(localStorage.getItem('pipeline_custom_colors')||'[]');if(existing.some(c=>c.label===label))return;existing.push({color,label});localStorage.setItem('pipeline_custom_colors',JSON.stringify(existing));handleCollabUpdateContact(ct.id,{card_color:color,card_label:label});setPipelineRdvForm(p=>({...p,_refreshColors:Date.now()}));}} style={{padding:'6px 14px',borderRadius:8,fontSize:11,fontWeight:700,background:T.accent,color:'#fff',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>+ Ajouter</div>
    </div>
  </>;
})()}
</div>

      </div>
    </div>
  </div>);
})()}

{/* ═══════════════════════════════════════════════════════════════════
    PERDU MOTIF MODAL — Motif obligatoire pour classer en Perdu
    ═══════════════════════════════════════════════════════════════════ */}
{(typeof perduMotifModal!=='undefined'?perduMotifModal:null) && (
  <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:10001,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:440,borderRadius:20,background:'#fff',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',padding:28}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
<div style={{width:44,height:44,borderRadius:12,background:'#EF444415',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="x-circle" s={22} style={{color:'#EF4444'}}/></div>
<div>
<div style={{fontSize:17,fontWeight:800,color:'#1F2937'}}>Classer en Perdu</div>
<div style={{fontSize:11,color:'#6B7280'}}>Sélectionnez un motif ou ajoutez une explication</div>
</div>
<div onClick={()=>setPerduMotifModal(null)} style={{marginLeft:'auto',cursor:'pointer',padding:6,borderRadius:8,background:'#F3F4F6'}}><I n="x" s={16}/></div>
      </div>

      <div style={{fontSize:12,fontWeight:700,color:'#374151',marginBottom:8}}>Motif rapide :</div>
      <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
{['Faux numéro','Ne répond jamais','Pas intéressé','Hors cible / pas le bon profil','Déjà client ailleurs','Budget insuffisant','Demande irréaliste','Doublon'].map(motif=>(
<div key={motif} onClick={()=>{
  handlePipelineStageChange((typeof perduMotifModal!=='undefined'?perduMotifModal:{}).contactId, 'perdu', motif);
  setPerduMotifModal(null);
}} style={{padding:'10px 14px',borderRadius:10,border:'1px solid #E5E7EB',background:'#F9FAFB',cursor:'pointer',fontSize:13,fontWeight:500,color:'#374151',transition:'all .15s',display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>{e.currentTarget.style.background='#EF444410';e.currentTarget.style.borderColor='#EF4444';}} onMouseLeave={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.borderColor='#E5E7EB';}}>
  <div style={{width:6,height:6,borderRadius:3,background:'#EF4444'}}/> {motif}
</div>
))}
      </div>

      <div style={{fontSize:12,fontWeight:700,color:'#374151',marginBottom:6}}>Ou motif personnalisé :</div>
      <textarea id="perdu-motif-custom" placeholder="Expliquez pourquoi ce lead est perdu..." rows={2} style={{width:'100%',padding:10,borderRadius:10,border:'1px solid #E5E7EB',background:'#F9FAFB',fontSize:13,fontFamily:'inherit',color:'#374151',resize:'none',outline:'none'}}/>
      <div style={{display:'flex',gap:8,marginTop:12}}>
<div onClick={()=>setPerduMotifModal(null)} style={{flex:1,padding:'10px 0',textAlign:'center',borderRadius:10,border:'1px solid #E5E7EB',cursor:'pointer',fontSize:13,fontWeight:600,color:'#6B7280'}}>Annuler</div>
<div onClick={()=>{
const custom = document.getElementById('perdu-motif-custom')?.value?.trim();
if(!custom){showNotif('Saisissez un motif ou choisissez dans la liste','danger');return;}
handlePipelineStageChange((typeof perduMotifModal!=='undefined'?perduMotifModal:{}).contactId, 'perdu', custom);
setPerduMotifModal(null);
}} style={{flex:1,padding:'10px 0',textAlign:'center',borderRadius:10,background:'#EF4444',cursor:'pointer',fontSize:13,fontWeight:700,color:'#fff'}}>Confirmer</div>
      </div>
    </div>
  </div>
)}

{/* ═══════════════════════════════════════════════════════════════════
    SCAN IMAGE MODAL — Import contacts par photo/screenshot
    ═══════════════════════════════════════════════════════════════════ */}
{(typeof scanImageModal!=='undefined'?scanImageModal:null) && (
  <div onClick={()=>setScanImageModal(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:560,maxHeight:'90vh',borderRadius:20,background:T.card,boxShadow:'0 20px 60px rgba(0,0,0,0.3)',padding:28,overflow:'auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
<div style={{display:'flex',alignItems:'center',gap:10}}>
<div style={{width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#0EA5E9,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="camera" s={22} style={{color:'#fff'}}/></div>
<div>
  <div style={{fontSize:17,fontWeight:800}}>Import par photo</div>
  <div style={{fontSize:11,color:T.text3}}>Scannez une fiche contact ou une liste</div>
</div>
</div>
<div onClick={()=>setScanImageModal(null)} style={{cursor:'pointer',padding:6,borderRadius:8,background:T.bg}}><I n="x" s={18}/></div>
      </div>

      {/* Step 1: Upload */}
      {(typeof scanImageModal!=='undefined'?scanImageModal:{}).step === 'upload' && !(typeof scanImageModal!=='undefined'?scanImageModal:{}).loading && (
<div>
<div onClick={()=>{
  const input = document.createElement('input');
  input.type='file'; input.accept='image/*'; input.capture='environment';
  input.onchange=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const base64=ev.target.result;
      setScanImageModal(p=>({...p, image:base64, loading:true}));
      api('/api/data/contacts/scan-image',{method:'POST',body:{image:base64}}).then(r=>{
        if(r?.contacts?.length>0){
          setScanImageModal(p=>({...p, step:'preview', contacts:r.contacts.map((c,i)=>({...c,_selected:true,_idx:i})), loading:false}));
        } else {
          showNotif('Aucun contact trouvé dans l\'image','danger');
          setScanImageModal(p=>({...p, loading:false}));
        }
      }).catch(err=>{showNotif('Erreur analyse: '+err.message,'danger');setScanImageModal(p=>({...p,loading:false}));});
    };
    reader.readAsDataURL(file);
  };
  input.click();
}} style={{padding:40,borderRadius:16,border:'3px dashed '+T.border,background:T.bg,textAlign:'center',cursor:'pointer',transition:'all .2s'}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
  <I n="image" s={48} style={{color:T.text3,marginBottom:12}}/>
  <div style={{fontSize:15,fontWeight:700,color:T.text}}>Cliquez pour uploader une image</div>
  <div style={{fontSize:12,color:T.text3,marginTop:6}}>Screenshot de fiche contact, liste Excel, carte de visite...</div>
  <div style={{fontSize:11,color:T.accent,marginTop:10,fontWeight:600}}>JPG, PNG, WEBP — max 20 Mo</div>
</div>

{/* Paste from clipboard */}
<div onClick={async()=>{
  try {
    const items = await navigator.clipboard.read();
    for(const item of items){
      const types=item.types.filter(t=>t.startsWith('image/'));
      if(types.length){
        const blob=await item.getType(types[0]);
        const reader=new FileReader();
        reader.onload=ev=>{
          const base64=ev.target.result;
          setScanImageModal(p=>({...p, image:base64, loading:true}));
          api('/api/data/contacts/scan-image',{method:'POST',body:{image:base64}}).then(r=>{
            if(r?.contacts?.length>0) setScanImageModal(p=>({...p, step:'preview', contacts:r.contacts.map((c,i)=>({...c,_selected:true,_idx:i})), loading:false}));
            else { showNotif('Aucun contact trouvé','danger'); setScanImageModal(p=>({...p,loading:false})); }
          }).catch(()=>{setScanImageModal(p=>({...p,loading:false}));});
        };
        reader.readAsDataURL(blob);
        return;
      }
    }
    showNotif('Pas d\'image dans le presse-papier','danger');
  } catch { showNotif('Accès presse-papier refusé','danger'); }
}} style={{marginTop:12,padding:'12px 16px',borderRadius:10,border:'1px solid '+T.border,background:T.bg,textAlign:'center',cursor:'pointer',fontSize:13,fontWeight:600,color:T.accent}}>
  <I n="clipboard" s={14}/> Coller depuis le presse-papier (Ctrl+V)
</div>
</div>
      )}

      {/* Loading */}
      {(typeof scanImageModal!=='undefined'?scanImageModal:{}).loading && (
<div style={{padding:40,textAlign:'center'}}>
<div style={{width:40,height:40,border:'4px solid '+T.border,borderTopColor:T.accent,borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 16px'}}/>
<div style={{fontSize:15,fontWeight:700,color:T.text}}>Analyse en cours...</div>
<div style={{fontSize:12,color:T.text3,marginTop:6}}>L'IA extrait les contacts de l'image</div>
</div>
      )}

      {/* Step 2: Preview & validate */}
      {(typeof scanImageModal!=='undefined'?scanImageModal:{}).step === 'preview' && !(typeof scanImageModal!=='undefined'?scanImageModal:{}).loading && (
<div>
<div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:10}}>{(typeof scanImageModal!=='undefined'?scanImageModal:{}).contacts.length} contact{(typeof scanImageModal!=='undefined'?scanImageModal:{}).contacts.length>1?'s':''} trouvé{(typeof scanImageModal!=='undefined'?scanImageModal:{}).contacts.length>1?'s':''}</div>

{/* Preview image mini */}
{(typeof scanImageModal!=='undefined'?scanImageModal:{}).image && <img src={(typeof scanImageModal!=='undefined'?scanImageModal:{}).image} style={{width:'100%',maxHeight:120,objectFit:'cover',borderRadius:10,marginBottom:12,opacity:0.6}} alt="scan"/>}

{/* Contact cards */}
<div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:400,overflow:'auto'}}>
  {(typeof scanImageModal!=='undefined'?scanImageModal:{}).contacts.map((ct,i) => (
    <div key={i} style={{padding:12,borderRadius:12,border:'1.5px solid '+(ct._selected?T.accent+'40':T.border),background:ct._selected?T.accent+'06':T.bg,transition:'all .2s'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div onClick={()=>setScanImageModal(p=>({...p,contacts:p.contacts.map((c,j)=>j===i?{...c,_selected:!c._selected}:c)}))} style={{width:20,height:20,borderRadius:6,border:'2px solid '+(ct._selected?T.accent:T.border),background:ct._selected?T.accent:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
            {ct._selected && <I n="check" s={12} style={{color:'#fff'}}/>}
          </div>
          <span style={{fontSize:14,fontWeight:700,color:T.text}}>{ct.name || (ct.firstname+' '+ct.lastname).trim() || 'Sans nom'}</span>
        </div>
        <span style={{fontSize:10,color:T.text3}}>#{i+1}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
        {[['firstname','Prénom'],['lastname','Nom'],['email','Email'],['phone','Téléphone'],['company','Entreprise'],['job_title','Poste'],['address','Adresse']].map(([key,label])=>(
          <div key={key}>
            <div style={{fontSize:9,fontWeight:700,color:T.accent,textTransform:'uppercase'}}>{label}</div>
            <input value={ct[key]||''} onChange={e=>setScanImageModal(p=>({...p,contacts:p.contacts.map((c,j)=>j===i?{...c,[key]:e.target.value}:c)}))} style={{width:'100%',padding:'4px 6px',borderRadius:6,border:'1px solid '+T.border,background:T.card,fontSize:11,color:T.text,fontFamily:'inherit'}}/>
          </div>
        ))}
      </div>
      {ct.notes && <div style={{marginTop:6,fontSize:10,color:T.text3,fontStyle:'italic'}}>{ct.notes}</div>}
    </div>
  ))}
</div>

{/* Actions */}
<div style={{display:'flex',gap:8,marginTop:16}}>
  <Btn small onClick={()=>setScanImageModal(p=>({...p,step:'upload',contacts:[],image:null}))}>Rescanner</Btn>
  <Btn primary style={{flex:1}} onClick={()=>{
    const selected = (typeof scanImageModal!=='undefined'?scanImageModal:{}).contacts.filter(c=>c._selected);
    if(selected.length===0){showNotif('Sélectionnez au moins 1 contact','danger');return;}
    let imported=0;
    selected.forEach(sc=>{
      const name = sc.name || (sc.firstname+' '+sc.lastname).trim();
      if(!name) return;
      const nc = {
        id:'ct'+Date.now()+'_'+Math.random().toString(36).substring(2,6),
        companyId:company.id, name, firstname:sc.firstname||'', lastname:sc.lastname||'',
        email:sc.email||'', phone:sc.phone||'', company:sc.company||'',
        address:sc.address||'', notes:sc.notes?(sc.job_title?sc.job_title+' · ':'')+sc.notes:(sc.job_title||''),
        pipeline_stage:'nouveau', assignedTo:collab.id, totalBookings:0, tags:[], shared_with:[], rating:null, docs:[]
      };
      setContacts(p=>[...p, nc]);
      api('/api/data/contacts',{method:'POST',body:nc});
      imported++;
    });
    showNotif(imported+' contact'+(imported>1?'s':'')+' importé'+(imported>1?'s':''));
    setScanImageModal(null);
  }}><I n="check" s={14}/> Importer {(typeof scanImageModal!=='undefined'?scanImageModal:{}).contacts.filter(c=>c._selected).length} contact{(typeof scanImageModal!=='undefined'?scanImageModal:{}).contacts.filter(c=>c._selected).length>1?'s':''}</Btn>
</div>
</div>
      )}
    </div>
  </div>
)}

{/* ═══════════════════════════════════════════════════════════════════
    RDV PASSÉ — Popup obligatoire "Comment s'est passé le RDV ?"
    ═══════════════════════════════════════════════════════════════════ */}
{(typeof rdvPasseModal!=='undefined'?rdvPasseModal:null) && (()=>{
  const rp = (typeof rdvPasseModal!=='undefined'?rdvPasseModal:null);
  const ct = rp.contact;
  const rdvDateFmt = rp.rdvDate ? new Date(rp.rdvDate+'T12:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}) : '';
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>{}}>
    <div style={{background:T.surface,borderRadius:16,width:'100%',maxWidth:420,padding:24,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}} onClick={e=>e.stopPropagation()}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
<div style={{width:40,height:40,borderRadius:12,background:'#F9731615',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:20}}>📋</span></div>
<div style={{flex:1}}>
<div style={{fontSize:16,fontWeight:800,color:T.text}}>Comment s'est passé le RDV ?</div>
<div style={{fontSize:12,color:T.text3}}>{ct.name} · {rdvDateFmt}</div>
</div>
      </div>
      {/* Options */}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
{[
{id:'qualifie',label:'✅ Qualifié — RDV positif',desc:'Le prospect est intéressé, à suivre',color:'#3B82F6',stage:'qualifie'},
{id:'client_valide',label:'🎉 Client Validé — Contrat signé',desc:'Le prospect a signé ou accepté',color:'#22C55E',stage:'client_valide'},
{id:'reporter',label:'📅 Reporter — Nouveau RDV',desc:'Reprogrammer un autre rendez-vous',color:'#F59E0B',stage:'_reporter'},
{id:'nrp',label:'🚫 No-show — Pas venu',desc:'Le prospect ne s\'est pas présenté',color:'#EF4444',stage:'nrp'},
{id:'perdu',label:'❌ Pas intéressé — Perdu',desc:'Le prospect n\'est plus intéressé',color:'#6B7280',stage:'perdu'},
].map(opt=>(
<div key={opt.id} onClick={()=>{
  // Fermer le popup
  setRdvPasseModal(null);
  // Annuler l'ancien booking si existe
  if(rp.bookingId){
    api(`/api/bookings/${rp.bookingId}`,{method:'PUT',body:{status:'completed'}}).catch(()=>{});
    setBookings(p=>p.map(b=>b.id===rp.bookingId?{...b,status:'completed'}:b));
  }
  if(opt.stage==='_reporter'){
    // Ouvrir modal RDV pré-rempli
    setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||'',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'Report du RDV du '+rdvDateFmt,calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});
    setPhoneShowScheduleModal(true);
    // Garder en rdv_programme
    handleCollabUpdateContact(ct.id,{rdv_status:'rdv_en_attente',lastVisit:new Date().toISOString()});
  } else if(opt.stage==='nrp'){
    // No-show → NRP avec note
    handlePipelineStageChange(ct.id,'nrp','No-show RDV du '+rdvDateFmt);
    handleCollabUpdateContact(ct.id,{rdv_status:'',next_rdv_date:'',next_rdv_booking_id:'',lastVisit:new Date().toISOString()});
    showNotif('Contact passé en NRP — No-show','info');
  } else if(opt.stage==='perdu'){
    // Perdu — demande motif via handlePipelineStageChange (qui le force)
    handlePipelineStageChange(ct.id,'perdu');
    handleCollabUpdateContact(ct.id,{rdv_status:'',next_rdv_date:'',next_rdv_booking_id:'',lastVisit:new Date().toISOString()});
  } else if(opt.stage==='client_valide'){
    // Client validé — handlePipelineStageChange gère montant+contrat
    handlePipelineStageChange(ct.id,'client_valide','RDV concluant du '+rdvDateFmt);
    handleCollabUpdateContact(ct.id,{rdv_status:'rdv_passe',lastVisit:new Date().toISOString()});
  } else {
    // Qualifié
    handlePipelineStageChange(ct.id,'qualifie','RDV du '+rdvDateFmt+' — intéressé');
    handleCollabUpdateContact(ct.id,{rdv_status:'rdv_passe',next_rdv_date:'',next_rdv_booking_id:'',lastVisit:new Date().toISOString()});
    showNotif('Contact → Intéressé','success');
  }
  // Ouvrir la fiche après
  setTimeout(()=>{setPipelineRightContact(ct);setPipelineRightTab('fiche');},300);
}} style={{padding:'12px 14px',borderRadius:10,border:`1.5px solid ${opt.color}30`,background:`${opt.color}06`,cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>{e.currentTarget.style.background=opt.color+'15';e.currentTarget.style.borderColor=opt.color+'50';}} onMouseLeave={e=>{e.currentTarget.style.background=opt.color+'06';e.currentTarget.style.borderColor=opt.color+'30';}}>
  <div style={{fontSize:13,fontWeight:700,color:opt.color}}>{opt.label}</div>
  <div style={{fontSize:11,color:T.text3,marginTop:2}}>{opt.desc}</div>
</div>
))}
      </div>
      {/* Passer / Voir la fiche sans qualifier */}
      <div onClick={()=>{setRdvPasseModal(null);setPipelineRightContact(ct);setPipelineRightTab('fiche');api('/api/data/pipeline-history?contactId='+ct.id).then(h=>setPipelinePopupHistory(h||[])).catch(()=>setPipelinePopupHistory([]));}} style={{marginTop:12,textAlign:'center',padding:'8px 0',fontSize:11,color:T.text3,cursor:'pointer',fontWeight:600}}>
Voir la fiche sans qualifier →
      </div>
    </div>
  </div>;
})()}

{/*
    POST-CALL RESULT MODAL — Résultat d'appel obligatoire (appel >10s)
    ═══════════════════════════════════════════════════════════════════ */}
{(typeof postCallResultModal!=='undefined'?postCallResultModal:null) && (()=>{
  const pcr = (typeof postCallResultModal!=='undefined'?postCallResultModal:null);
  const ct = pcr.contact;
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:10001,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:480,borderRadius:20,background:'#fff',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',padding:28,maxHeight:'90vh',overflow:'auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
<div>
<div style={{fontSize:17,fontWeight:800,color:'#1F2937',display:'flex',alignItems:'center',gap:8}}><I n="phone-call" s={20} style={{color:'#22C55E'}}/> Résultat de l'appel</div>
<div style={{fontSize:12,color:T.text3,marginTop:2}}>{ct.name} · {Math.floor(pcr.duration/60)}min {pcr.duration%60}s</div>
</div>
<div onClick={()=>setPostCallResultModal(null)} style={{width:32,height:32,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'#F3F4F6',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='#E5E7EB'} onMouseLeave={e=>e.currentTarget.style.background='#F3F4F6'} title="Fermer sans statuer"><I n="x" s={16} style={{color:'#6B7280'}}/></div>
      </div>

      <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>Quel est le résultat de cet échange ?</div>

      <div style={{display:'flex',flexDirection:'column',gap:8}}>
{/* RDV Programmé */}
<div onClick={()=>{
setPostCallResultModal(null);
handlePipelineStageChange(ct.id, 'rdv_programme');
}} style={{padding:'14px 16px',borderRadius:12,border:'2px solid #0EA5E920',background:'#0EA5E908',cursor:'pointer',transition:'all .2s',display:'flex',alignItems:'center',gap:12}} onMouseEnter={e=>e.currentTarget.style.borderColor='#0EA5E9'} onMouseLeave={e=>e.currentTarget.style.borderColor='#0EA5E920'}>
<div style={{width:40,height:40,borderRadius:10,background:'#0EA5E915',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="calendar" s={20} style={{color:'#0EA5E9'}}/></div>
<div><div style={{fontSize:14,fontWeight:700,color:'#0EA5E9'}}>RDV Programmé</div><div style={{fontSize:11,color:T.text3}}>Le prospect a accepté un rendez-vous</div></div>
</div>

{/* À rappeler */}
<div onClick={()=>{
const note = prompt('Note sur l\'échange + quand rappeler ?\n(Ex: Intéressé mais pas dispo cette semaine, rappeler lundi)');
if (!note?.trim()) { showNotif('Note obligatoire','danger'); return; }
const dateStr = new Date().toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
handleCollabUpdateContact(ct.id, {
  pipeline_stage: 'contacte',
  notes: (ct.notes ? ct.notes+'\n' : '') + dateStr+' [En discussion - À rappeler] : '+note.trim()
});
showNotif('Contact → En discussion (à rappeler)');
setPostCallResultModal(null);
}} style={{padding:'14px 16px',borderRadius:12,border:'2px solid #F59E0B20',background:'#F59E0B08',cursor:'pointer',transition:'all .2s',display:'flex',alignItems:'center',gap:12}} onMouseEnter={e=>e.currentTarget.style.borderColor='#F59E0B'} onMouseLeave={e=>e.currentTarget.style.borderColor='#F59E0B20'}>
<div style={{width:40,height:40,borderRadius:10,background:'#F59E0B15',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="phone-forwarded" s={20} style={{color:'#F59E0B'}}/></div>
<div><div style={{fontSize:14,fontWeight:700,color:'#F59E0B'}}>À rappeler</div><div style={{fontSize:11,color:T.text3}}>Échange positif, à recontacter plus tard</div></div>
</div>

{/* Qualifié */}
<div onClick={()=>{
setPostCallResultModal(null);
handlePipelineStageChange(ct.id, 'qualifie');
}} style={{padding:'14px 16px',borderRadius:12,border:'2px solid #7C3AED20',background:'#7C3AED08',cursor:'pointer',transition:'all .2s',display:'flex',alignItems:'center',gap:12}} onMouseEnter={e=>e.currentTarget.style.borderColor='#7C3AED'} onMouseLeave={e=>e.currentTarget.style.borderColor='#7C3AED20'}>
<div style={{width:40,height:40,borderRadius:10,background:'#7C3AED15',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="check-circle" s={20} style={{color:'#7C3AED'}}/></div>
<div><div style={{fontSize:14,fontWeight:700,color:'#7C3AED'}}>Qualifié</div><div style={{fontSize:11,color:T.text3}}>Besoin identifié, budget confirmé</div></div>
</div>

{/* Pas intéressé */}
<div onClick={()=>{
setPostCallResultModal(null);
handlePipelineStageChange(ct.id, 'perdu');
}} style={{padding:'14px 16px',borderRadius:12,border:'2px solid #EF444420',background:'#EF444408',cursor:'pointer',transition:'all .2s',display:'flex',alignItems:'center',gap:12}} onMouseEnter={e=>e.currentTarget.style.borderColor='#EF4444'} onMouseLeave={e=>e.currentTarget.style.borderColor='#EF444420'}>
<div style={{width:40,height:40,borderRadius:10,background:'#EF444415',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="x-circle" s={20} style={{color:'#EF4444'}}/></div>
<div><div style={{fontSize:14,fontWeight:700,color:'#EF4444'}}>Pas intéressé</div><div style={{fontSize:11,color:T.text3}}>Le prospect n'est pas intéressé</div></div>
</div>

{/* Note libre */}
<div onClick={()=>{
const note = prompt('Note sur l\'échange :');
if (!note?.trim()) { showNotif('Note obligatoire','danger'); return; }
const dateStr = new Date().toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
handleCollabUpdateContact(ct.id, {
  pipeline_stage: 'contacte',
  notes: (ct.notes ? ct.notes+'\n' : '') + dateStr+' [En discussion] : '+note.trim()
});
showNotif('Contact → En discussion');
setPostCallResultModal(null);
}} style={{padding:'14px 16px',borderRadius:12,border:'2px solid '+T.border,background:T.bg,cursor:'pointer',transition:'all .2s',display:'flex',alignItems:'center',gap:12}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
<div style={{width:40,height:40,borderRadius:10,background:T.accentBg,display:'flex',alignItems:'center',justifyContent:'center'}}><I n="edit-3" s={20} style={{color:T.accent}}/></div>
<div><div style={{fontSize:14,fontWeight:700,color:T.text}}>Autre</div><div style={{fontSize:11,color:T.text3}}>Ajouter une note libre sur l'échange</div></div>
</div>
      </div>
    </div>
  </div>;
})()}

{/* Pipeline RDV Modal supprimé — remplacé par la modale unifiée phoneScheduleModal */}

{/* ═══════════════════════════════════════════════════════════════════
    PHONE TEAM CHAT BUBBLE — Messagerie inter-collaborateurs
    ═══════════════════════════════════════════════════════════════════ */}
<ErrorBoundary fallback={null}>
{(()=>{
  const allCollabs = collabs.length ? collabs : (company?.collaborators || []);
  const teammates = allCollabs.filter(c=>c.id!==collab.id);
  const onlineIds = (typeof collabChatOnline!=='undefined'?collabChatOnline:null) || [];
  const isOnline = (cId) => onlineIds.includes(cId);

  // Get recent messages for the phone chat panel
  const chatMsgs = ((typeof collabChatMessages!=='undefined'?collabChatMessages:null)||[]).filter(m => {
    if ((typeof phoneTeamChatTab!=='undefined'?phoneTeamChatTab:null) === 'group') return m.type !== 'dm';
    return m.type === 'dm' && ((m.senderId === collab.id && m.recipientId === (typeof phoneTeamChatTab!=='undefined'?phoneTeamChatTab:null)) || (m.senderId === (typeof phoneTeamChatTab!=='undefined'?phoneTeamChatTab:null) && m.recipientId === collab.id));
  }).slice(-30);

  const sendTeamMsg = () => {
    const msg = ((phoneTeamChatMsg??'')+'').trim();
    if (!msg) return;
    const body = { companyId: company.id, senderId: collab.id, senderName: collab.name, message: msg, type: (typeof phoneTeamChatTab!=='undefined'?phoneTeamChatTab:null) === 'group' ? 'group' : 'dm' };
    if ((typeof phoneTeamChatTab!=='undefined'?phoneTeamChatTab:null) !== 'group') body.recipientId = (typeof phoneTeamChatTab!=='undefined'?phoneTeamChatTab:null);
    api('/api/messaging', { method: 'POST', body });
    setPhoneTeamChatMsg('');
    setTimeout(()=>{ if(phoneTeamChatRef.current) phoneTeamChatRef.current.scrollTop = phoneTeamChatRef.current.scrollHeight; }, 100);
  };

  const shareContact = (ct) => {
    const msg = `📇 Fiche contact partagée:\n${ct.name}\n📞 ${ct.phone||'—'}\n✉️ ${ct.email||'—'}\n🏢 ${ct.company||'—'}`;
    const body = { companyId: company.id, senderId: collab.id, senderName: collab.name, message: msg, type: (typeof phoneTeamChatTab!=='undefined'?phoneTeamChatTab:null) === 'group' ? 'group' : 'dm' };
    if ((typeof phoneTeamChatTab!=='undefined'?phoneTeamChatTab:null) !== 'group') body.recipientId = (typeof phoneTeamChatTab!=='undefined'?phoneTeamChatTab:null);
    api('/api/messaging', { method: 'POST', body });
    showNotif('Contact partagé');
  };

  return (
  <div style={{position:'absolute',bottom:16,right:356,zIndex:20}}>
    {/* Floating bubble */}
    {!(typeof phoneTeamChatOpen!=='undefined'?phoneTeamChatOpen:null) && (
      <div onClick={()=>setPhoneTeamChatOpen(true)} style={{display:'flex',alignItems:'center',gap:-6,cursor:'pointer',position:'relative'}}>
{/* Collaborator avatars stack */}
<div style={{display:'flex',alignItems:'center'}}>
{teammates.slice(0,4).map((c,i)=>(
  <div key={c.id} style={{width:36,height:36,borderRadius:18,background:(typeof isOnline!=='undefined'?isOnline:null)(c.id)?'linear-gradient(135deg,#22C55E,#16A34A)':'linear-gradient(135deg,#64748B,#475569)',display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid '+(T.bg||'#fff'),marginLeft:i>0?-10:0,zIndex:4-i,position:'relative'}}>
    <span style={{color:'#fff',fontWeight:800,fontSize:12}}>{(c.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}</span>
    {(typeof isOnline!=='undefined'?isOnline:null)(c.id) && <div style={{position:'absolute',bottom:-1,right:-1,width:10,height:10,borderRadius:5,background:'#22C55E',border:'2px solid '+(T.bg||'#fff')}}/>}
  </div>
))}
{teammates.length > 4 && <div style={{width:36,height:36,borderRadius:18,background:T.surface,display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid '+(T.bg||'#fff'),marginLeft:-10,zIndex:0,fontSize:11,fontWeight:700,color:T.text3}}>+{teammates.length-4}</div>}
</div>
{/* Chat icon badge */}
<div style={{width:44,height:44,borderRadius:22,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',marginLeft:-8,zIndex:5,boxShadow:'0 4px 16px rgba(124,58,237,0.4)',border:'2px solid '+(T.bg||'#fff')}}>
<I n="message-circle" s={20} style={{color:'#fff'}}/>
</div>
{onlineIds.length > 0 && <div style={{position:'absolute',top:-4,right:-4,background:'#22C55E',color:'#fff',fontSize:9,fontWeight:800,padding:'1px 5px',borderRadius:8,border:'2px solid '+(T.bg||'#fff')}}>{onlineIds.length}</div>}
      </div>
    )}

    {/* Chat panel */}
    {(typeof phoneTeamChatOpen!=='undefined'?phoneTeamChatOpen:null) && (
      <div style={{width:340,height:440,background:T.surface,borderRadius:16,boxShadow:'0 8px 40px rgba(0,0,0,0.18)',border:`1px solid ${T.border}`,display:'flex',flexDirection:'column',overflow:'hidden',animation:'slideUp .2s ease'}}>
{/* Header */}
<div style={{padding:'12px 14px',background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
<div style={{display:'flex',alignItems:'center',gap:8}}>
  <I n="message-circle" s={16} style={{color:'#fff'}}/>
  <div>
    <div style={{fontSize:13,fontWeight:800,color:'#fff'}}>Chat équipe</div>
    <div style={{fontSize:10,color:'#ffffffaa'}}>{onlineIds.length} en ligne · {teammates.length} membres</div>
  </div>
</div>
<div style={{display:'flex',gap:4}}>
  <div onClick={()=>setPhoneTeamChatOpen(false)} style={{width:28,height:28,borderRadius:8,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><I n="x" s={14} style={{color:'#fff'}}/></div>
</div>
</div>

{/* Collaborator tabs */}
<div style={{display:'flex',gap:4,padding:'8px 10px',overflowX:'auto',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
<div onClick={()=>(typeof setPhoneTeamChatTab==='function'?setPhoneTeamChatTab:function(){})('group')} style={{padding:'4px 10px',borderRadius:8,fontSize:11,fontWeight:phoneTeamChatTab==='group'?700:500,cursor:'pointer',background:phoneTeamChatTab==='group'?'linear-gradient(135deg,#7C3AED,#2563EB)':'transparent',color:phoneTeamChatTab==='group'?'#fff':T.text2,border:`1px solid ${phoneTeamChatTab==='group'?'transparent':T.border}`,whiteSpace:'nowrap',transition:'all .15s'}}>
  <I n="users" s={10} style={{marginRight:4}}/> Groupe
</div>
{teammates.map(c=>(
  <div key={c.id} onClick={()=>(typeof setPhoneTeamChatTab==='function'?setPhoneTeamChatTab:function(){})(c.id)} style={{padding:'4px 8px',borderRadius:8,fontSize:11,fontWeight:phoneTeamChatTab===c.id?700:500,cursor:'pointer',background:phoneTeamChatTab===c.id?T.accentBg:'transparent',color:phoneTeamChatTab===c.id?T.accent:T.text3,border:`1px solid ${phoneTeamChatTab===c.id?T.accentBorder:T.border}`,whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4,transition:'all .15s'}}>
    <div style={{width:6,height:6,borderRadius:3,background:(typeof isOnline!=='undefined'?isOnline:null)(c.id)?'#22C55E':'#94A3B8'}}/>
    {(c.name||'?').split(' ')[0]}
  </div>
))}
</div>

{/* Messages */}
<div ref={phoneTeamChatRef} style={{flex:1,overflowY:'auto',padding:'8px 10px',display:'flex',flexDirection:'column',gap:6}}>
{chatMsgs.length === 0 && (
  <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:T.text3,padding:20}}>
    <I n="message-circle" s={28} style={{opacity:0.3,marginBottom:8}}/>
    <div style={{fontSize:12,fontWeight:600}}>Aucun message</div>
    <div style={{fontSize:11,marginTop:2}}>Envoyez un message à l'équipe</div>
  </div>
)}
{chatMsgs.map(m=>{
  const isMine = m.senderId === collab.id;
  const initials = (m.senderName||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  return (
    <div key={m.id} style={{display:'flex',gap:6,flexDirection:isMine?'row-reverse':'row',alignItems:'flex-end'}}>
      {!isMine && <div style={{width:26,height:26,borderRadius:13,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><span style={{color:'#fff',fontSize:9,fontWeight:800}}>{initials}</span></div>}
      <div style={{maxWidth:'75%',padding:'7px 10px',borderRadius:isMine?'12px 12px 2px 12px':'12px 12px 12px 2px',background:isMine?'linear-gradient(135deg,#7C3AED,#2563EB)':T.bg,color:isMine?'#fff':T.text,fontSize:12,lineHeight:1.4,wordBreak:'break-word'}}>
        {!isMine && <div style={{fontSize:10,fontWeight:700,color:isMine?'#ffffffcc':T.accent,marginBottom:2}}>{m.senderName}</div>}
        {m.message}
        <div style={{fontSize:9,color:isMine?'#ffffff80':T.text3,marginTop:3,textAlign:'right'}}>{m.createdAt?new Date(m.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</div>
      </div>
    </div>
  );
})}
</div>

{/* Quick actions */}
<div style={{display:'flex',gap:4,padding:'4px 10px',borderTop:`1px solid ${T.border}`,flexShrink:0}}>
<div onClick={()=>{
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '*/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showNotif('📎 Fichier: '+file.name+' (partage simulé)');
    const body = { companyId: company.id, senderId: collab.id, senderName: collab.name, message: '📎 Fichier partagé: '+file.name, type: (typeof phoneTeamChatTab!=='undefined'?phoneTeamChatTab:null) === 'group' ? 'group' : 'dm' };
    if ((typeof phoneTeamChatTab!=='undefined'?phoneTeamChatTab:null) !== 'group') body.recipientId = (typeof phoneTeamChatTab!=='undefined'?phoneTeamChatTab:null);
    api('/api/messaging', { method: 'POST', body });
  };
  input.click();
}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text3,background:T.bg,border:`1px solid ${T.border}`}} title="Envoyer fichier"><I n="paperclip" s={12}/></div>
<div onClick={()=>{
  const ct = contacts.find(c=>c.phone);
  if (ct) {
    const sel = prompt('Partager un contact (nom ou numéro):');
    if (sel) {
      const found = contacts.find(c => (c.name||'').toLowerCase().includes(sel.toLowerCase()) || (c.phone||'').includes(sel));
      if (found) { shareContact(found); } else { showNotif('Contact non trouvé','danger'); }
    }
  } else { showNotif('Aucun contact disponible','danger'); }
}} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:T.text3,background:T.bg,border:`1px solid ${T.border}`}} title="Partager un contact"><I n="user-plus" s={12}/></div>
</div>

{/* Input */}
<div style={{display:'flex',gap:6,padding:'8px 10px',borderTop:`1px solid ${T.border}`,flexShrink:0,background:T.bg}}>
<input value={phoneTeamChatMsg} onChange={e=>(typeof setPhoneTeamChatMsg==='function'?setPhoneTeamChatMsg:function(){})(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendTeamMsg();}}} placeholder={phoneTeamChatTab==='group'?'Message au groupe...':'Message privé...'} style={{flex:1,padding:'8px 12px',borderRadius:10,border:`1px solid ${T.border}`,background:T.surface,fontSize:12,fontFamily:'inherit',color:T.text,outline:'none'}}/>
<div onClick={sendTeamMsg} style={{width:34,height:34,borderRadius:10,background:((phoneTeamChatMsg??'')+'').trim()?'linear-gradient(135deg,#7C3AED,#2563EB)':T.border,display:'flex',alignItems:'center',justifyContent:'center',cursor:((phoneTeamChatMsg??'')+'').trim()?'pointer':'default',transition:'all .2s',flexShrink:0}}>
  <I n="send" s={14} style={{color:((phoneTeamChatMsg??'')+'').trim()?'#fff':T.text3}}/>
</div>
</div>
      </div>
    )}
  </div>
  );
})()}
</ErrorBoundary>

</div>
{/* ═══ END 3-COLUMN CONTAINER (modals now inside) ═══ */}

  {/* ═══════════════════════════════════════════════════════════════════
      CLOSING TAGS — End of Phone Tab
     ═══════════════════════════════════════════════════════════════════ */}
</div>
    </>
  );
};

export default PhoneTab;
