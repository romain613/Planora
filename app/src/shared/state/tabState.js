// shared/state/tabState.js — Tab-scoped volatile state.
// Each browser tab gets its own module instance, so _T is automatically
// isolated per tab. Do NOT persist, do NOT share across tabs. Replaces
// window._ usage to avoid cross-tab collisions.

export const _T = {
  // Chat IA
  aiChat: null, aiChecklist: null, aiFocusMode: false, aiFocusIdx: 0,
  aiChecklistOpen: true, aiChatOpen: true,
  // Flux / swipe
  fluxIdx: 0, fluxSwipe: null,
  // Conversation active
  activeConversationId: null,
  // SMS
  smsHubTpls: null, smsCache: {}, smsLoaded: false, smsLoading: false,
  allSmsMessages: null, smsHub: null,
  // IA transcripts
  iaCallTranscripts: null, iaTranscript: null,
  archiveCache: null, transcriptCache: {}, transcriptOpen: null,
  // Pipeline
  pipeAutomations: null, pipeAutomationsLoaded: false,
  pipeRightSaved: false, pipeRightSaveTimer: null,
  pipeZoom: null, pipeHiddenCols: null, pipeCollapsedCols: null,
  // CRM sync
  crmSync: null,
  // Conversations polling
  convPollInterval: null, convPollLastTs: null,
  // Stats UI
  homeStatsPeriod: 'week', homeStatsOpen: true, phoneStatsOpen: true,
  // Agenda
  agendaFilter: null,
  // Settings
  settingsAccordion: null,
  // Registration form
  regForm: null,
  // Maps
  mapsKey: null,
};
