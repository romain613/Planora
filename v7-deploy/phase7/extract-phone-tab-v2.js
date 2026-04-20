#!/usr/bin/env node
// Phase 14b v2 — extract Phone/Pipeline Live tab from CollabPortal.jsx into PhoneTab.jsx
// V2: use marker comment "CLOSING TAGS — End of Phone Tab" instead of paren counting
// (paren counting was confused by `(` and `)` inside string literals).

const fs = require('fs');
const path = require('path');

const PATH = path.resolve(__dirname, '../../app/src/features/collab/CollabPortal.jsx');
const TARGET = path.resolve(__dirname, '../../app/src/features/collab/tabs/PhoneTab.jsx');

const src = fs.readFileSync(PATH, 'utf8');
const lines = src.split('\n');

const START_PATTERN = '{portalTab === "phone" && ((typeof voipConfigured';
const END_MARKER = 'CLOSING TAGS — End of Phone Tab';

let startIdx = -1, endMarkerIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (startIdx === -1 && lines[i].includes(START_PATTERN)) startIdx = i;
  if (lines[i].includes(END_MARKER)) endMarkerIdx = i;
}
if (startIdx === -1 || endMarkerIdx === -1) {
  console.error('start or end marker not found', { startIdx, endMarkerIdx });
  process.exit(1);
}

// After the marker comment block, find the next `        )}` line
let endIdx = -1;
for (let i = endMarkerIdx + 1; i < lines.length; i++) {
  if (lines[i] === '        )}') { endIdx = i; break; }
}
if (endIdx === -1) { console.error('end )} not found after marker'); process.exit(1); }

console.log(`Phone block: lines ${startIdx + 1} → ${endIdx + 1} (${endIdx - startIdx + 1} lines)`);

const bodyLines = lines.slice(startIdx + 1, endIdx);
const dedented = bodyLines.map(l => l.startsWith('          ') ? l.slice(10) : (l.startsWith('        ') ? l.slice(8) : l));

const header = `// Phase 14b — extracted Phone/Pipeline Live tab from CollabPortal.jsx (was lines ${startIdx + 1}-${endIdx + 1}).
// THE MASTODON: ~${endIdx - startIdx + 1} lines covering VoIP + dialer + conversations + history + AI copilot live.
//
// TODO Phase future : sub-découper en phone/PhoneToolbar.jsx + phone/Dialer.jsx + phone/PipelineKanban.jsx
//   + phone/CallHistory.jsx + phone/Conversations.jsx + phone/CallDetail.jsx + phone/AiCopilotPanel.jsx

import React, { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Avatar, Badge, Modal, Input, ValidatedInput, Stars, Spinner, Stat, EmptyState, HelpTip, HookIsolator } from "../../../shared/ui";
import { displayPhone, formatPhoneFR } from "../../../shared/utils/phone";
import { isValidEmail, isValidPhone } from "../../../shared/utils/validators";
import { fmtDate, DAYS_FR, DAYS_SHORT, MONTHS_FR, getDow } from "../../../shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES } from "../../../shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../../shared/utils/notifications";
import { api, recUrl, API_BASE, collectEnv } from "../../../shared/services/api";
import { _T } from "../../../shared/state/tabState";
import { useCollabContext } from "../context/CollabContext";

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
  } = ctx;

  return (
    <>
${dedented.join('\n')}
    </>
  );
};

export default PhoneTab;
`;

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(`${PATH}.pre-phone-v2-${ts}`, src);
fs.writeFileSync(TARGET, header);
console.log(`Wrote: ${TARGET} (${header.split('\n').length} lines)`);

const REPLACEMENT = '        {portalTab === "phone" && ((typeof voipConfigured!==\'undefined\'?voipConfigured:null) || collab.sms_enabled) && <PhoneTab/>}';
const newLines = [...lines.slice(0, startIdx), REPLACEMENT, ...lines.slice(endIdx + 1)];
fs.writeFileSync(PATH, newLines.join('\n'));
console.log(`Rewrote CollabPortal: ${newLines.length} lines (was ${lines.length}, diff -${lines.length - newLines.length})`);
