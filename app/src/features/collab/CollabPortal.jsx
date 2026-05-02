import React, { useState, useCallback, useMemo, useEffect, useRef, Fragment } from "react";
import { Device as TwilioDevice } from '@twilio/voice-sdk';

// Phase 5.5 — tab-scoped state
import { _T } from "../../shared/state/tabState";

// Phase 1A extractions
import { T, T_LIGHT, T_DARK, setTheme } from "../../theme";
import { formatPhoneFR, displayPhone, normalizePhoneNumber, phoneMatchKey } from "../../shared/utils/phone";
import { isValidEmail, isValidPhone } from "../../shared/utils/validators";
import { COMMON_TIMEZONES, genCode } from "../../shared/utils/constants";

// Phase 1B — UI atomics barrel
import { HookIsolator, Logo, I, Avatar, Badge, Btn, Stars, Toggle, LoadBar, Card, Spinner, Req, Skeleton, Input, Stat, Modal, ConfirmModal, EmptyState, HelpTip, ValidatedInput, ErrorBoundary, MiniMonthCalendar } from "../../shared/ui";

// Phase 2 — pure data & utils extractions
import { DAYS_FR, DAYS_SHORT, MONTHS_FR, getDow, fmtDate, formatDateTime, formatDate } from "../../shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES, PIPELINE_LABELS, STATUS_COLORS } from "../../shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../shared/utils/notifications";
import { COMPANIES, INIT_COLLABS, defAvail, INIT_AVAILS, INIT_CALS, INIT_BOOKINGS, INIT_WORKFLOWS, INIT_ROUTING, INIT_POLLS, INIT_CONTACTS, COMPANY_SETTINGS, INIT_ALL_COMPANIES, INIT_ALL_USERS, INIT_ACTIVITY_LOG } from "../../data/fixtures";

// Phase 3 — API service
import { API_BASE, recUrl, collectEnv, api, getAutoTicketCompanyId, setAutoTicketCompanyId } from "../../shared/services/api";

// Phase 4 — extracted screens (relative path from features/collab/)
import {
  FicheClientMsgScreen,
  FicheSuiviScreen,
  FicheDocsLinkedScreen,
  CollabSignalementsScreen,
  FicheDocsPanelScreen,
  PhoneTrainingScreen
} from "./screens";

// Phase 10+11 — context + extracted tabs
import { CollabProvider } from "./context/CollabContext";
// V1.8.19 — Phase 4 enforcement runtime : résoudre les stages selon le template assigné au collab
import { usePipelineResolved } from "./hooks/usePipelineResolved";

// hotfix 2026-04-23 — TAB_ID declared in App.jsx not exported, used bare in CollabPortal.jsx L2689
const TAB_ID = crypto.randomUUID ? crypto.randomUUID() : "tab-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
import AiProfileTab from "./tabs/AiProfileTab";
import TablesTab from "./tabs/TablesTab";
import MessagesTab from "./tabs/MessagesTab";
import AvailabilityTab from "./tabs/AvailabilityTab";
import ObjectifsTab from "./tabs/ObjectifsTab";
import HomeTab from "./tabs/HomeTab";
import AgendaTab from "./tabs/AgendaTab";
import CrmTab from "./tabs/CrmTab";
import PhoneTab from "./tabs/PhoneTab";
import RdvReportingTab from "./tabs/RdvReportingTab";
import DuplicateOnCreateModal from "./modals/DuplicateOnCreateModal";
import HardDeleteContactModal from "./modals/HardDeleteContactModal";

const CollabPortal = ({ collab, company, bookings, setBookings, calendars, setCalendars, avails, setAvails, vacations, setVacations, contacts, setContacts, onBack, voipCredits, voipCallLogs, setVoipCallLogs, voipConfigured, appMyPhoneNumbers, appPhonePlans, appConversations, setAppConversations, pipelineStages, setPipelineStages, contactFieldDefs, setContactFieldDefs, collabs: collabsProp, googleEvents: googleEventsProp, setGoogleEvents, isAdminView, smsCredits }) => {
  // collabs = list of all collaborators in the company (for chat DM, etc.)
  const collabs = collabsProp || [];
  const _MIGRATED_TABS = ['messages','availability','tables','ai-profile','objectifs','signalements','bookings','analytics'];
  const [portalTab, _setPortalTab] = useState(() => { try { const saved = localStorage.getItem("c360-portalTab") || "home"; return _MIGRATED_TABS.includes(saved) ? "home" : saved; } catch { return "home"; } });
  const [portalTabKey, setPortalTabKey] = useState(0);
  const [collabAlertCount, setCollabAlertCount] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifList, setNotifList] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsSubTab, setSettingsSubTab] = useState("profil");
  const [showIaWidget, setShowIaWidget] = useState(false);
  const [csvImportModal, setCsvImportModal] = useState(null); // V2 unified CSV import modal — global scope
  const PORTAL_TAB_TITLES = { home:"Aujourd'hui", agenda:"Agenda", crm:"CRM", phone:"Pipeline Live", settings:"Paramètres" };
  const setPortalTab = (v) => { const val = typeof v === "function" ? v(portalTab) : v; _setPortalTab(val); localStorage.setItem("c360-portalTab", val); setPortalTabKey(k=>k+1); document.title = "Calendar360 — " + (PORTAL_TAB_TITLES[val]||val); };
  useEffect(() => { document.title = "Calendar360 — " + (PORTAL_TAB_TITLES[portalTab]||portalTab); }, []);
  // Guard: polling endpoints (messaging, heartbeat, secure-ia count) require a real collaborator session.
  // Supra admin sessions have collaboratorId=null → backend returns 400. Skip them.
  const hasRealCollabAuth = useMemo(() => {
    try {
      const s = JSON.parse(localStorage.getItem("calendar360-session") || "null");
      return !!(s?.collaboratorId);
    } catch { return false; }
  }, []);
  // Fetch unread signalement count
  useEffect(() => {
    if (!collab?.id || !hasRealCollabAuth) return;
    api(`/api/secure-ia/my-alerts/count?collaboratorId=${collab.id}`).then(r => { if (r?.count !== undefined) setCollabAlertCount(r.count); }).catch(() => {});
    const iv = setInterval(() => {
      api(`/api/secure-ia/my-alerts/count?collaboratorId=${collab.id}`).then(r => { if (r?.count !== undefined) setCollabAlertCount(r.count); }).catch(() => {});
    }, 60000);
    return () => clearInterval(iv);
  }, [collab?.id]);
  // Fetch unread notifications count
  useEffect(() => {
    if (!collab?.id) return;
    const fetchNotifs = () => api('/api/notifications?unreadOnly=1&limit=10').then(r => { if (r?.unread !== undefined) { setNotifUnread(r.unread); setNotifList(r.notifications || []); } }).catch(() => {});
    fetchNotifs();
    const niv = setInterval(fetchNotifs, 30000);
    return () => clearInterval(niv);
  }, [collab?.id]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [calAccordionOpen, setCalAccordionOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [mrStatusFilter, setMrStatusFilter] = useState('all'); // 'all' | 'confirmed' | 'pending' | 'cancelled'
  const [editCalModal, setEditCalModal] = useState(null); // { id, name, slug, duration, requireApproval, description } | null
  const [editCalSlugAvail, setEditCalSlugAvail] = useState(true); // slug availability state
  const [actionLoading, setActionLoading] = useState(null); // "confirm"|"cancel"|"reactivate"|"notify"|null
  const [notification, setNotification] = useState(null);
  const [rescheduleData, setRescheduleData] = useState(null);
  const [bookingDetailTab, setBookingDetailTab] = useState('rdv'); // 'rdv' | 'contact' | 'notes'
  const [bookingContactNotes, setBookingContactNotes] = useState('');
  const [viewMode, _setViewMode] = useState(() => { try { return localStorage.getItem("c360-viewMode") || "week"; } catch { return "week"; } });
  const setViewMode = (v) => { const val = typeof v === "function" ? v(viewMode) : v; _setViewMode(val); localStorage.setItem("c360-viewMode", val); };
  const [selectedDay, setSelectedDay] = useState(null);
  const agendaScrolledRef = useRef(false);
  const [monthOffset, setMonthOffset] = useState(0);
  // ── Zoom grille + heures ouvrées ──
  const ZOOM_LEVELS = [28, 36, 48, 64, 80];
  const [agendaZoom, _setAgendaZoom] = useState(() => { try { return parseInt(localStorage.getItem("c360-agendaZoom"))||48; } catch { return 48; } });
  const setAgendaZoom = (v) => { const val = typeof v === "function" ? v(agendaZoom) : v; _setAgendaZoom(val); localStorage.setItem("c360-agendaZoom", String(val)); };
  const [agendaWorkHours, _setAgendaWorkHours] = useState(() => { try { return localStorage.getItem("c360-agendaWorkHours") !== "false"; } catch { return true; } });
  const setAgendaWorkHours = (v) => { const val = typeof v === "function" ? v(agendaWorkHours) : v; _setAgendaWorkHours(val); localStorage.setItem("c360-agendaWorkHours", String(val)); };
  const [newVacDate, setNewVacDate] = useState("");
  // AI Profile tab state
  const [aiProfileTab, setAiProfileTab] = useState("profile");
  const [aiProfileForm, setAiProfileForm] = useState({
    ai_copilot_role: collab.ai_copilot_role || '', ai_copilot_objective: collab.ai_copilot_objective || '',
    ai_copilot_target: collab.ai_copilot_target || '', ai_role_type: collab.ai_role_type || '',
    ai_main_mission: collab.ai_main_mission || '', ai_call_type_default: collab.ai_call_type_default || '',
    ai_call_goal_default: collab.ai_call_goal_default || '', ai_target_default: collab.ai_target_default || '',
    ai_tone_style: collab.ai_tone_style || 'commercial', ai_language: collab.ai_language || 'fr',
    ai_script_trame: collab.ai_script_trame || '',
  });
  const [aiProfileSaving, setAiProfileSaving] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiSuggestionsLoading, setAiSuggestionsLoading] = useState(false);
  const [aiHistory, setAiHistory] = useState([]);
  const [aiHistoryLoading, setAiHistoryLoading] = useState(false);
  const [aiSuggestionEdit, setAiSuggestionEdit] = useState(null);
  const [aiHistoryDetail, setAiHistoryDetail] = useState(null);
  // Grid color customization (persisted per collaborator)
  const gridColorPresets = [
    { id:"ocean", label:"Océan", avail:"#DBEAFE", unavail:"#F1F5F9", accent:"#2563EB", border:"#93C5FD", nowLine:"#2563EB", booking:"#3B82F6", google:"#9CA3AF", pause:"#FDE68A" },
    { id:"emerald", label:"Émeraude", avail:"#D1FAE5", unavail:"#F1F5F9", accent:"#059669", border:"#6EE7B7", nowLine:"#059669", booking:"#10B981", google:"#9CA3AF", pause:"#FDE68A" },
    { id:"violet", label:"Violet", avail:"#EDE9FE", unavail:"#F5F3FF", accent:"#7C3AED", border:"#C4B5FD", nowLine:"#7C3AED", booking:"#8B5CF6", google:"#9CA3AF", pause:"#FDE68A" },
    { id:"rose", label:"Rosé", avail:"#FFE4E6", unavail:"#FFF5F5", accent:"#E11D48", border:"#FDA4AF", nowLine:"#E11D48", booking:"#F43F5E", google:"#9CA3AF", pause:"#FDE68A" },
    { id:"amber", label:"Ambre", avail:"#FEF3C7", unavail:"#FEFCE8", accent:"#D97706", border:"#FCD34D", nowLine:"#D97706", booking:"#F59E0B", google:"#9CA3AF", pause:"#FDE68A" },
    { id:"slate", label:"Neutre", avail:"#E2E8F0", unavail:"#F8FAFC", accent:"#475569", border:"#CBD5E1", nowLine:"#475569", booking:"#64748B", google:"#9CA3AF", pause:"#FDE68A" },
  ];
  const defaultCustomColors = { avail:"#DBEAFE", unavail:"#F1F5F9", accent:"#2563EB", border:"#93C5FD", nowLine:"#2563EB", booking:"#3B82F6", google:"#9CA3AF", pause:"#FDE68A" };
  const [gridThemeId, _setGridThemeId] = useState(() => { try { return localStorage.getItem(`c360-gridTheme-${collab.id}`) || "ocean"; } catch { return "ocean"; } });
  const setGridThemeId = (id) => { _setGridThemeId(id); localStorage.setItem(`c360-gridTheme-${collab.id}`, id); };
  const [customGridColors, _setCustomGridColors] = useState(() => { try { return JSON.parse(localStorage.getItem(`c360-gridCustom-${collab.id}`)) || null; } catch { return null; } });
  const setCustomGridColors = (colors) => { _setCustomGridColors(colors); localStorage.setItem(`c360-gridCustom-${collab.id}`, JSON.stringify(colors)); };
  const basePreset = gridColorPresets.find(p => p.id === gridThemeId) || gridColorPresets[0];
  const gridTheme = customGridColors ? { ...basePreset, ...customGridColors } : basePreset;
  gridTheme.unavailPattern = `repeating-linear-gradient(135deg,${gridTheme.unavail} 0,${gridTheme.unavail} 3px,${gridTheme.unavail}88 3px,${gridTheme.unavail}88 6px)`;
  const [showGridColors, setShowGridColors] = useState(false);
  const gridScrollRef = useRef(null);
  const gridScrolledOnce = useRef(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleEmail, setGoogleEmail] = useState(null);
  // Online/offline connection indicator
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  // ── Tables state for collab portal ──
  const [collabTables, setCollabTables] = useState([]);
  const [collabSelectedTableId, setCollabSelectedTableId] = useState(null);
  const [collabTableRows, setCollabTableRows] = useState([]);
  const [collabTableSearch, setCollabTableSearch] = useState("");
  const [collabTableLoading, setCollabTableLoading] = useState(false);
  const [collabEditingCell, setCollabEditingCell] = useState(null);
  const [collabEditingCellValue, setCollabEditingCellValue] = useState("");
  const [collabSelectedRowId, setCollabSelectedRowId] = useState(null);

  // Objectifs tab state
  const [myGoals, setMyGoals] = useState([]);
  const [myTeamGoals, setMyTeamGoals] = useState([]);
  const [myRewards, setMyRewards] = useState([]);
  const [goalsLoading, setGoalsLoading] = useState(false);

  // Load tables for this company
  useEffect(() => {
    if (!company?.id) return;
    api(`/api/tables?companyId=${company.id}`).then(d => { if (Array.isArray(d)) setCollabTables(d); }).catch(()=>{});
  }, [company?.id]);

  // Load goals when objectifs tab is active + sync daily goal on first load
  useEffect(() => {
    if (portalTab === 'objectifs' && company?.id && collab?.id) {
      setGoalsLoading(true);
      // Sync daily goal to backend
      const goal = parseInt(localStorage.getItem("c360-phone-goal-"+collab.id)) || 10;
      api('/api/goals/sync-daily', {method:'POST', body:{companyId:company.id, collaboratorId:collab.id, target:goal}}).catch(()=>{});
      // Load progress
      api(`/api/goals/my-progress?companyId=${company.id}`).then(data => {
        setMyGoals(data?.myGoals || []);
        setMyTeamGoals(data?.myTeamGoals || []);
        setMyRewards(data?.myRewards || []);
        setGoalsLoading(false);
      }).catch(() => setGoalsLoading(false));
    }
  }, [portalTab]);

  const collabSelectedTable = useMemo(() => collabTables.find(t => t.id === collabSelectedTableId), [collabTables, collabSelectedTableId]);
  const collabTableColumns = useMemo(() => collabSelectedTable?.columns || [], [collabSelectedTable]);

  // Filter rows assigned to this collaborator
  const collabFilteredRows = useMemo(() => {
    const collabName = collab.name;
    const collabColIds = collabTableColumns.filter(c => c.type === 'collaborator').map(c => c.id);
    let rows = collabTableRows;
    // If there are collaborator columns, only show rows assigned to this collab (or unassigned)
    if (collabColIds.length > 0) {
      rows = rows.filter(r => {
        const data = r.data || {};
        return collabColIds.some(cid => data[cid] === collabName) || collabColIds.every(cid => !data[cid]);
      });
    }
    // Search filter
    if (collabTableSearch.trim()) {
      const q = collabTableSearch.toLowerCase();
      rows = rows.filter(r => {
        const data = r.data || {};
        return Object.values(data).some(v => String(v).toLowerCase().includes(q));
      });
    }
    return rows;
  }, [collabTableRows, collabTableColumns, collab.name, collabTableSearch]);

  const loadCollabTableRows = async (tableId) => {
    setCollabTableLoading(true);
    try {
      const d = await api(`/api/tables/${tableId}/rows`);
      if (d?.rows) setCollabTableRows(d.rows);
    } catch {} finally { setCollabTableLoading(false); }
  };

  const handleCollabUpdateRow = async (rowId, data) => {
    setCollabTableRows(p => p.map(r => r.id === rowId ? {...r, data:{...(r.data||{}), ...data}} : r));
    await api(`/api/tables/${collabSelectedTableId}/rows/${rowId}`, { method:"PUT", body:{data} });
  };

  // ── AI Dispatch Tasks for collab portal ──
  const [collabDispatchTasks, setCollabDispatchTasks] = useState([]);
  const [collabTasksLoading, setCollabTasksLoading] = useState(false);

  const loadCollabDispatchTasks = async (tableId) => {
    try {
      const d = await api(`/api/tables/${tableId}/tasks?collabId=${collab.id}`);
      if (d?.tasks) setCollabDispatchTasks(d.tasks);
    } catch {}
  };

  const completeCollabTask = async (tableId, taskId) => {
    setCollabTasksLoading(true);
    try {
      const d = await api(`/api/tables/${tableId}/tasks/${taskId}/complete`, { method: "PUT" });
      if (d?.success) {
        setCollabDispatchTasks(p => p.map(t => t.id === taskId ? { ...t, status: 'completed', completedAt: new Date().toISOString() } : t));
        if (d.leadsUnlocked > 0) {
          showNotif(d.message || `🎉 ${d.leadsUnlocked} leads débloqués !`);
          // Reload rows to see new assigned leads
          loadCollabTableRows(tableId);
        } else {
          showNotif("✅ Tâche complétée !");
        }
      }
    } catch { showNotif("Erreur", "danger"); }
    finally { setCollabTasksLoading(false); }
  };

  const skipCollabTask = async (tableId, taskId) => {
    try {
      await api(`/api/tables/${tableId}/tasks/${taskId}/skip`, { method: "PUT" });
      setCollabDispatchTasks(p => p.map(t => t.id === taskId ? { ...t, status: 'skipped' } : t));
    } catch {}
  };

  // Check Google Calendar connection status
  useEffect(() => {
    api('/api/google/status?collaboratorId=' + collab.id)
      .then(d => { if (d && !d.error) { setGoogleConnected(!!d.connected); setGoogleEmail(d.email || null); } })
      .catch(() => {});
  }, [collab.id]);

  // Detect ?google=success after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'success') {
      setGoogleConnected(true);
      showNotif("Google Agenda connecté avec succès !");
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('google') === 'error') {
      showNotif("Erreur de connexion Google Agenda", "danger");
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const myVacations = vacations?.[collab.id] || [];

  // VoIP helpers for phone tab
  const [phoneSubTab, setPhoneSubTab] = useState('pipeline');
  const [phoneDialNumber, setPhoneDialNumber] = useState('');
  const [phonePipeSearch, setPhonePipeSearch] = useState('');
  // Conversations sub-tab state
  const [selConvId, setSelConvId] = useState(null);
  const [convEvents, setConvEvents] = useState([]);
  const [convLoading, setConvLoading] = useState(false);
  const [convNoteText, setConvNoteText] = useState('');
  const [convSmsText, setConvSmsText] = useState('');
  const [convSearch, setConvSearch] = useState('');
  const [convFilter, setConvFilter] = useState('all');
  const [phoneHistorySearch, setPhoneHistorySearch] = useState('');
  const [phoneHistoryFilter, setPhoneHistoryFilter] = useState('all');
  const [phoneContactSearch, setPhoneContactSearch] = useState('');
  const [phoneContactSort, setPhoneContactSort] = useState('alpha');
  const [phoneQuickAddPhone, setPhoneQuickAddPhone] = useState(null); // phone number for quick add
  const [phoneQuickAddName, setPhoneQuickAddName] = useState('');
  const [phoneQuickAddStage, setPhoneQuickAddStage] = useState('nouveau');
  const [phoneQuickAddType, setPhoneQuickAddType] = useState('btc'); // btc=Particulier, btb=Entreprise
  const [phoneQuickAddFirstname, setPhoneQuickAddFirstname] = useState('');
  const [phoneQuickAddLastname, setPhoneQuickAddLastname] = useState('');
  const [phoneQuickAddEmail, setPhoneQuickAddEmail] = useState('');
  const [phoneQuickAddCompany, setPhoneQuickAddCompany] = useState('');
  const [phoneQuickAddSiret, setPhoneQuickAddSiret] = useState('');
  const [phoneQuickAddResponsable, setPhoneQuickAddResponsable] = useState('');
  const [phoneQuickAddMobile, setPhoneQuickAddMobile] = useState('');
  const [phoneQuickAddWebsite, setPhoneQuickAddWebsite] = useState('');
  const [phoneStatsPeriod, setPhoneStatsPeriod] = useState('all');
  const [phoneFavorites, setPhoneFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-fav-"+collab.id)||"[]"); } catch { return []; } });
  const [phoneCallNotes, setPhoneCallNotes] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-notes-"+collab.id)||"{}"); } catch { return {}; } });
  const [phoneShowSMS, setPhoneShowSMS] = useState(false);
  const [phoneSMSText, setPhoneSMSText] = useState('');
  const [phoneShowCallNoteModal, setPhoneShowCallNoteModal] = useState(null); // callId
  const [phoneCallNoteText, setPhoneCallNoteText] = useState('');
  const togglePhoneFav = (contactId) => {
    setPhoneFavorites(prev => {
      const next = prev.includes(contactId) ? prev.filter(id=>id!==contactId) : [...prev, contactId];
      localStorage.setItem("c360-phone-fav-"+collab.id, JSON.stringify(next));
      return next;
    });
  };
  const savePhoneCallNote = (callId, note) => {
    setPhoneCallNotes(prev => {
      const next = {...prev, [callId]: note};
      localStorage.setItem("c360-phone-notes-"+collab.id, JSON.stringify(next));
      return next;
    });
  };
  const fmtDur = (s) => { if (!s) return '0:00'; return Math.floor(s/60).toString().padStart(2,'0') + ':' + (s%60).toString().padStart(2,'0'); };
  const fmtPhone = (p) => {
    if (!p) return '';
    let clean = p.replace(/[^\d+]/g,'');
    // Auto +33 pour les numeros FR a 9 chiffres (sans indicatif)
    if (!clean.startsWith('+') && !clean.startsWith('0') && clean.length === 9) clean = '+33' + clean;
    if (clean.startsWith('+33') && clean.length === 12) return '+33 ' + clean.slice(3,4) + ' ' + clean.slice(4,6) + ' ' + clean.slice(6,8) + ' ' + clean.slice(8,10) + ' ' + clean.slice(10,12);
    if (clean.startsWith('0') && clean.length === 10) return '0' + clean.slice(1,2) + ' ' + clean.slice(2,4) + ' ' + clean.slice(4,6) + ' ' + clean.slice(6,8) + ' ' + clean.slice(8,10);
    if (clean.startsWith('33') && clean.length === 11) return '+33 ' + clean.slice(2,3) + ' ' + clean.slice(3,5) + ' ' + clean.slice(5,7) + ' ' + clean.slice(7,9) + ' ' + clean.slice(9,11);
    return clean;
  };

  // ── AI Call Analysis & Recording ──
  const [phoneRecordingEnabled, setPhoneRecordingEnabled] = useState(() => { try { return localStorage.getItem("c360-phone-record-"+collab.id)==="1"; } catch { return false; } });
  const [phoneCallAnalyses, setPhoneCallAnalyses] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-analyses-"+collab.id)||"{}"); } catch { return {}; } });
  const [phoneCallRecordings, setPhoneCallRecordings] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("c360-phone-recordings-"+collab.id)||"{}");
      // Merge recordings from voipCallLogs — use proxy URL (never expose provider URLs)
      ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).forEach(cl => {
        if (cl.recordingUrl && !stored[cl.id]) stored[cl.id] = { url: recUrl(cl.id), date: cl.createdAt, duration: cl.duration };
      });
      return stored;
    } catch { return {}; }
  });
  const [phoneCallTags, setPhoneCallTags] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-tags-"+collab.id)||"{}"); } catch { return {}; } });
  const [phoneAnalysisModal, setPhoneAnalysisModal] = useState(null); // callId to show analysis for
  const [phoneAnalysisLoading, setPhoneAnalysisLoading] = useState(null); // callId being analyzed
  const [phoneRecordModal, setPhoneRecordModal] = useState(null); // callId to show recording for
  const [phoneCallFollowups, setPhoneCallFollowups] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-followups-"+collab.id)||"{}"); } catch { return {}; } });
  const [phoneAutoRecap, setPhoneAutoRecap] = useState(() => { try { return localStorage.getItem("c360-phone-autorecap-"+collab.id)==="1"; } catch { return false; } });
  const [phoneCallRatings, setPhoneCallRatings] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-ratings-"+collab.id)||"{}"); } catch { return {}; } });

  // Call detail panel (Ringover-style)
  const [phoneCallDetailId, setPhoneCallDetailId] = useState(null);
  const [phoneCallDetailTab, setPhoneCallDetailTab] = useState('enregistrement');
  const [phoneCallTranscript, setPhoneCallTranscript] = useState(null);
  const [phoneCallTranscriptLoading, setPhoneCallTranscriptLoading] = useState(false);
  const [phoneRightTab, setPhoneRightTab] = useState('info');
  const [phoneActiveScriptId, setPhoneActiveScriptId] = useState('');
  const [phoneRightAccordion, setPhoneRightAccordion] = useState({});

  // Call forms
  const [collabCallForms, setCollabCallForms] = useState([]);
  const [callFormData, setCallFormData] = useState({}); // {formId: {fieldId: value}}
  const [callFormResponses, setCallFormResponses] = useState([]);
  const [callFormAccordion, setCallFormAccordion] = useState(() => { try { return localStorage.getItem('c360-nav-collapsed-'+collab.id)==='1' ? {_navCollapsed:true} : {}; } catch { return {}; } });
  const [callFormResponseAccordion, setCallFormResponseAccordion] = useState({});

  // Phone team chat bubble
  const [phoneTeamChatOpen, setPhoneTeamChatOpen] = useState(false);
  const [phoneTeamChatMsg, setPhoneTeamChatMsg] = useState('');
  const [phoneTeamChatTab, setPhoneTeamChatTab] = useState('group'); // 'group' | collab.id for DM
  const phoneTeamChatRef = useRef(null);

  // Phone contact detail + pipeline + calendar
  const [phoneContactDetailId, setPhoneContactDetailId] = useState(null);
  const [phoneContactDetailTab, setPhoneContactDetailTab] = useState('info');
  const [phoneContactEditMode, setPhoneContactEditMode] = useState(false);
  const [phoneContactEditForm, setPhoneContactEditForm] = useState({});
  const [phoneCalMonth, setPhoneCalMonth] = useState(()=>{ const d=new Date(); return {y:d.getFullYear(),m:d.getMonth()}; });

  const togglePhoneRecording = () => {
    // V1.8.27 — recordingEnabled est un setting company-wide (voip_settings keyed by companyId).
    // Backend route PUT /api/voip/settings exige requireAdmin → fix 403 silencieux pour members.
    const _isAdmin = collab?.role === 'admin' || collab?.role === 'supra' || isAdminView;
    if (!_isAdmin) {
      showNotif("Réservé à l'administrateur", "danger");
      return;
    }
    const next = !phoneRecordingEnabled;
    setPhoneRecordingEnabled(next);
    localStorage.setItem("c360-phone-record-"+collab.id, next?"1":"0");
    // Sync recording setting to backend for TwiML
    api('/api/voip/settings', { method:'PUT', body:{ recordingEnabled: next, recordingConsent: next }}).catch(()=>{});
    showNotif(next ? "Enregistrement d'appels active 🎙️" : "Enregistrement desactive");
  };

  const togglePhoneAutoRecap = () => {
    const next = !phoneAutoRecap;
    setPhoneAutoRecap(next);
    localStorage.setItem("c360-phone-autorecap-"+collab.id, next?"1":"0");
    showNotif(next ? "Compte-rendu IA automatique activé 🤖" : "Compte-rendu auto désactivé");
  };

  const savePhoneCallTag = (callId, tag) => {
    setPhoneCallTags(prev => {
      const existing = prev[callId] || [];
      const next = existing.includes(tag) ? existing.filter(t=>t!==tag) : [...existing, tag];
      const all = {...prev, [callId]: next};
      localStorage.setItem("c360-phone-tags-"+collab.id, JSON.stringify(all));
      return all;
    });
  };

  const savePhoneCallRating = (callId, rating) => {
    setPhoneCallRatings(prev => {
      const next = {...prev, [callId]: rating};
      localStorage.setItem("c360-phone-ratings-"+collab.id, JSON.stringify(next));
      return next;
    });
  };

  const savePhoneCallFollowup = (callId, followup) => {
    setPhoneCallFollowups(prev => {
      const next = {...prev, [callId]: followup};
      localStorage.setItem("c360-phone-followups-"+collab.id, JSON.stringify(next));
      return next;
    });
  };

  // AI-powered call analysis (real API via AI Sales Copilot)
  const CALL_TAGS = ["Prospection","Suivi client","Réclamation","Information","Prise de RDV","Urgent","VIP","Négociation","Support technique","Devis"];
  const generateCallAnalysis = async (callId) => {
    setPhoneAnalysisLoading(callId);
    try {
      const res = await api(`/api/ai-copilot/analyze/${callId}`, { method: 'POST' });
      if (res && !res.error) {
        const analysis = {
          id: res.id || callId,
          createdAt: res.createdAt || new Date().toISOString(),
          contactName: res.contactName || 'Inconnu',
          contactEmail: res.contactEmail || '',
          duration: res.duration || 0,
          direction: res.direction || 'outbound',
          sentimentScore: res.sentimentScore || 0,
          sentiment: (res.sentimentScore||0) > 70 ? 'Très positif' : (res.sentimentScore||0) > 50 ? 'Positif' : (res.sentimentScore||0) > 30 ? 'Neutre' : 'Négatif',
          objective: res.summary || '',
          summary: res.summary || 'Analyse IA indisponible',
          actionItems: res.actionItems || [],
          tags: res.tags || [],
          notes: res.transcription ? res.transcription.substring(0, 200) : '',
          qualityScore: res.qualityScore || 0,
          conversionScore: res.conversionScore || 0,
          objections: res.objections || [],
          coachingTips: res.coachingTips || [],
          followupType: res.followupType || '',
          followupDate: res.followupDate || '',
          followupRecommended: !!(res.followupType),
          pipelineStage: res.pipelineStage || '',
          crmAutoFilled: res.crmAutoFilled || 0,
        };
        setPhoneCallAnalyses(prev => {
          const next = {...prev, [callId]: analysis};
          localStorage.setItem("c360-phone-analyses-"+collab.id, JSON.stringify(next));
          return next;
        });
        // Store recommended actions from AI
        if (res.recommendedActions && res.recommendedActions.length > 0) {
          setPhoneRecommendedActions(res.recommendedActions);
        }
        // Save call context if we have one
        if (phoneCallContext) {
          api('/api/call-context', { method:'POST', body: { ...phoneCallContext, callLogId:callId, companyId:company.id, collaboratorId:collab.id } }).catch(()=>{});
        }
        setPhoneAnalysisLoading(null);
        setPhoneAnalysisModal(callId);
      } else {
        // Fallback: generate local analysis if API fails (no recording, etc.)
        const cl = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).find(c=>c.id===callId);
        const ct = cl ? contacts.find(c=>c.id===cl.contactId) : null;
        const notes = phoneCallNotes[callId] || cl?.notes || "";
        const tags = phoneCallTags[callId] || [];
        const dur = cl?.duration || 0;
        const isMissed = cl?.status === 'missed' || cl?.status === 'no-answer';
        const sentimentScore = isMissed ? 0 : notes.length > 20 ? 85 : dur > 120 ? 75 : dur > 60 ? 60 : 40;
        const objectives = tags.includes("Prospection") ? "Acquisition de nouveau client" : tags.includes("Suivi client") ? "Fidélisation et suivi" : "Appel informatif";
        const actionItems = [];
        if (tags.includes("Prise de RDV")) actionItems.push("Créer un rendez-vous dans l'agenda");
        if (tags.includes("Devis")) actionItems.push("Préparer et envoyer un devis");
        if (actionItems.length === 0) actionItems.push("Mettre à jour la fiche CRM du contact");
        const analysis = {
          id: callId, createdAt: new Date().toISOString(), contactName: ct?.name || "Inconnu", contactEmail: ct?.email || "",
          duration: dur, direction: cl?.direction || "outbound", sentimentScore, sentiment: sentimentScore > 70 ? 'Très positif' : sentimentScore > 50 ? 'Positif' : 'Neutre',
          objective: objectives, summary: `Appel ${cl?.direction==='inbound'?'entrant':'sortant'} de ${fmtDur(dur)} avec ${ct?.name||'un contact'}.`,
          actionItems, tags, notes, qualityScore: Math.min(Math.round(sentimentScore * 0.6 + (notes.length > 0 ? 20 : 0) + (tags.length > 0 ? 20 : 0)), 100),
          followupRecommended: dur > 60, followupDate: new Date(Date.now() + 3*86400000).toISOString().split("T")[0],
        };
        setPhoneCallAnalyses(prev => { const next = {...prev, [callId]: analysis}; localStorage.setItem("c360-phone-analyses-"+collab.id, JSON.stringify(next)); return next; });
        setPhoneAnalysisLoading(null);
        setPhoneAnalysisModal(callId);
      }
    } catch (err) {
      console.error('[AI ANALYSIS ERROR]', err);
      setPhoneAnalysisLoading(null);
      showNotif('Erreur analyse IA', 'error');
    }
  };

  // Fetch saved transcript for a call
  const fetchCallTranscript = async (callId) => {
    setPhoneCallTranscriptLoading(true);
    try {
      const data = await api(`/api/voip/transcript/${callId}`);
      setPhoneCallTranscript(data);
    } catch { setPhoneCallTranscript(null); }
    setPhoneCallTranscriptLoading(false);
  };

  // Open call detail panel
  const openCallDetail = (callId) => {
    setPhoneCallDetailId(callId);
    setPhoneCallDetailTab('enregistrement');
    setPhoneCallTranscript(null);
    setPhoneSubTab('call-detail');
    fetchCallTranscript(callId);
    if (!phoneCallAnalyses[callId]) generateCallAnalysis(callId);
  };

  // Simulate call recording (stores metadata)
  const saveCallRecording = (callId) => {
    const cl = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).find(c=>c.id===callId);
    const ct = cl ? contacts.find(c=>c.id===cl.contactId) : null;
    const recording = {
      id: "rec_"+callId,
      callId,
      contactName: ct?.name || "Inconnu",
      duration: cl?.duration || 0,
      direction: cl?.direction || "outbound",
      createdAt: cl?.createdAt || new Date().toISOString(),
      fileSize: Math.round((cl?.duration || 30) * 8000 / 1024), // simulate ~8kbps
      status: "available",
      format: "mp3",
    };
    setPhoneCallRecordings(prev => {
      const next = {...prev, [callId]: recording};
      localStorage.setItem("c360-phone-recordings-"+collab.id, JSON.stringify(next));
      return next;
    });
    showNotif("Enregistrement sauvegardé 🎙️");
  };

  // ── ADVANCED PHONE FEATURES ──
  // Live call states
  const [phoneActiveCall, setPhoneActiveCall] = useState(null); // {contactId, number, startTime, muted, speaker, onHold}
  const [phoneCallTimer, setPhoneCallTimer] = useState(0);
  const [phoneIncomingInfo, setPhoneIncomingInfo] = useState(null); // {from, contactName, contactId}

  // Accept/Reject incoming call
  const acceptCollabIncomingCall = () => {
    voipCallRef.current?.accept();
    setVoipState('in-call');
    let info = phoneIncomingInfo;
    setPhoneActiveCall({ contactId: info?.contactId || null, number: info?.from || '', startTime: Date.now(), muted: false, speaker: false, onHold: false });
    setPhoneCallTimer(0);

    // ── Auto-find or create contact + open right panel ──
    let ct = info?.contactId ? contacts.find(c => c.id === info.contactId) : null;
    // Recherche par numero si pas encore trouve
    if (!ct && info?.from) {
      const last9 = (info.from || '').replace(/[^\d]/g, '').slice(-9);
      if (last9.length >= 9) ct = contacts.find(c => (c.phone || c.mobile || '').replace(/[^\d]/g, '').slice(-9) === last9);
      if (ct) { info = { ...info, contactId: ct.id, contactName: ct.name }; setPhoneIncomingInfo(info); setPhoneActiveCall(prev => prev ? { ...prev, contactId: ct.id } : prev); }
    }
    // Auto-creation contact si numero inconnu
    if (!ct && info?.from) {
      const newId = 'ct' + Date.now();
      const phoneNum = autoFormatFR ? autoFormatFR(info.from) : info.from;
      const nc = { id: newId, companyId: company.id, name: phoneNum, firstname: '', lastname: '', civility: '', contact_type: 'btc', email: '', phone: phoneNum, mobile: '', company: '', address: '', website: '', siret: '', totalBookings: 0, lastVisit: '', tags_json: '[]', notes: '', rating: null, docs_json: '[]', pipeline_stage: 'nouveau', assignedTo: collab.id, shared_with: '[]', source: 'phone-inbound', createdAt: new Date().toISOString() };
      setContacts(p => [...p, nc]);
      api('/api/data/contacts', { method: 'POST', body: nc }).catch(() => {});
      ct = nc;
      info = { ...info, contactId: newId, contactName: phoneNum };
      setPhoneIncomingInfo(info);
      setPhoneActiveCall(prev => prev ? { ...prev, contactId: newId } : prev);
      showNotif('Contact auto-cree: ' + phoneNum, 'info');
    }
    // Ouvrir panneau droit + onglet IA Copilot (miroir de startPhoneCall)
    if (ct) {
      setPipelineRightContact(ct);
      setPhoneRightTab('ia');
      if (phoneRightCollapsed) { (typeof setPhoneRightCollapsed==='function'?setPhoneRightCollapsed:function(){})(false); try { localStorage.setItem('c360-phone-right-collapsed-' + collab.id, '0'); } catch {} }
      api('/api/data/pipeline-history?contactId=' + ct.id).then(h => setPipelinePopupHistory(h || [])).catch(() => setPipelinePopupHistory([]));
    }

    // Start timer
    const startedAt = new Date().toISOString();
    // Log the incoming call
    api('/api/voip/calls', { method: 'POST', body: { companyId: company.id, contactId: info?.contactId || null, collaboratorId: collab.id, toNumber: '', fromNumber: info?.from || '', direction: 'inbound' } })
      .then(d => {
        if (d?.id) { setVoipCurrentCallLogId(d.id); setVoipCallLogs(prev => [{ id: d.id, companyId: company.id, contactId: info?.contactId || null, collaboratorId: collab.id, direction: 'inbound', fromNumber: info?.from || '', status: 'in-progress', createdAt: startedAt, duration: 0 }, ...prev]); }
        if (d?.conversationId) { _T.activeConversationId = d.conversationId; }
      })
      .catch(() => {});
    // Mode Pilote IA
    if (collab.ai_copilot_enabled) {
      setPhoneCopilotLiveLoading(true);
      api('/api/ai-copilot/live-coaching', { method: 'POST', body: { collaboratorId: collab.id, contactId: info?.contactId || null, companyId: company.id } })
        .then(res => { if (res?.success) setPhoneCopilotLiveData(res); setPhoneCopilotLiveLoading(false); })
        .catch(() => setPhoneCopilotLiveLoading(false));
    }
  };
  const rejectCollabIncomingCall = () => { voipCallRef.current?.reject(); setVoipState('idle'); setPhoneIncomingInfo(null); setPhoneDialNumber(''); };
  const [phoneLiveTranscript, setPhoneLiveTranscript] = useState([]);
  const [phoneLiveSentiment, setPhoneLiveSentiment] = useState("neutral"); // positive, neutral, negative
  const [phoneLiveVoiceActivity, setPhoneLiveVoiceActivity] = useState({ me: false, contact: false, meText: '', contactText: '' }); // voice activity indicator
  const [phoneLiveRdvSuggestion, setPhoneLiveRdvSuggestion] = useState(null); // LEGACY — kept for compat
  // ── V1.5: File de suggestions typées ──
  const [phoneLiveSuggestions, setPhoneLiveSuggestions] = useState([]);
  const phoneLiveDetectRef = useRef({ lastByType: {} });
  // ── V1.5: Config Transcription Live (localStorage per company) ──
  const _liveConfigKey = 'c360-live-config-' + (company?.id || 'default');
  const _defaultLiveConfig = {
    detectionsEnabled: { rdv: true, document: true, rappel: true, note: true },
    documentTemplates: [
      { id: 'plaquette', name: 'Plaquette commerciale', subject: 'Plaquette — {company}', body: 'Bonjour {contact},\n\nSuite à notre échange, veuillez trouver ci-joint notre plaquette commerciale.\n\nCordialement,\n{collab}' },
      { id: 'brochure', name: 'Brochure services', subject: 'Brochure services — {company}', body: 'Bonjour {contact},\n\nComme convenu, voici notre brochure de services.\n\nN\'hésitez pas à revenir vers moi.\n\nCordialement,\n{collab}' },
      { id: 'offre', name: 'Offre commerciale', subject: 'Offre commerciale — {company}', body: 'Bonjour {contact},\n\nVeuillez trouver ci-joint notre offre commerciale.\n\nJe reste à votre disposition.\n\nCordialement,\n{collab}' },
      { id: 'devis', name: 'Devis', subject: 'Devis — {company}', body: 'Bonjour {contact},\n\nVeuillez trouver ci-joint le devis comme convenu.\n\nCordialement,\n{collab}' },
      { id: 'custom', name: 'Email libre', subject: '', body: '' },
    ],
  };
  const [liveConfig, setLiveConfig] = useState(() => { try { return { ..._defaultLiveConfig, ...JSON.parse(localStorage.getItem(_liveConfigKey) || '{}') }; } catch { return _defaultLiveConfig; } });
  const saveLiveConfig = (updates) => { (typeof setLiveConfig==='function'?setLiveConfig:function(){})(prev => { const next = { ...prev, ...updates }; localStorage.setItem(_liveConfigKey, JSON.stringify(next)); return next; }); };
  const [phoneShowScript, setPhoneShowScript] = useState(false);

  // Mode Pilote IA — live coaching during calls
  const [phoneCopilotLiveData, setPhoneCopilotLiveData] = useState(null);
  const [phoneCopilotLiveLoading, setPhoneCopilotLiveLoading] = useState(false);
  const [phoneCopilotChecklist, setPhoneCopilotChecklist] = useState({});
  // Live analysis from SSE (real-time GPT coaching)
  const [phoneLiveAnalysis, setPhoneLiveAnalysis] = useState(null);
  const [phoneLastCallSession, setPhoneLastCallSession] = useState(null); // Mémoire de la dernière session live (persiste après raccroché)
  const liveSSERef = useRef(null);
  // Copilot tab data
  const [phoneCopilotTabData, setPhoneCopilotTabData] = useState({ stats: null, coaching: null, objections: null, analyses: [], loading: true, detailModal: null, scriptModal: false, scriptLoading: false, generatedScript: null, scriptPrompt: '' });
  const [phoneCopilotTabLoaded, setPhoneCopilotTabLoaded] = useState(false);
  // Call context + recommended actions
  const [phoneCallContext, setPhoneCallContext] = useState(null);
  const [phoneRecommendedActions, setPhoneRecommendedActions] = useState([]);
  const [phoneShowContextEditor, setPhoneShowContextEditor] = useState(false);
  // Live coaching reactions tracking (accept/dismiss)
  const [phoneCopilotReactions, setPhoneCopilotReactions] = useState({});
  const [phoneCopilotReactionStats, setPhoneCopilotReactionStats] = useState(null);
  const [phoneCopilotLiveStep, setPhoneCopilotLiveStep] = useState(0); // 0=accroche, 1=decouverte, 2=presentation, 3=objection, 4=closing
  // IA Hub states
  const [aiValidationEditing, setAiValidationEditing] = useState(false);
  const [aiValidationEdits, setAiValidationEdits] = useState({});
  const [iaHubCollapse, setIaHubCollapse] = useState({actions:false,resume:false,detail:true,transcript:true,audio:true});
  const [contactAnalysesHistory, setContactAnalysesHistory] = useState({});
  const [contactAnalysesHistoryModal, setContactAnalysesHistoryModal] = useState(null);

  // Pipeline popup contact (click card → popup instead of navigate)
  const [pipelinePopupContact, setPipelinePopupContact] = useState(null);
  const [pipelinePopupHistory, setPipelinePopupHistory] = useState([]);
  const [pipelineNrpExpanded, setPipelineNrpExpanded] = useState({});
  const [pipelineRightContact, setPipelineRightContact] = useState(null);
  const [pipelineRightTab, setPipelineRightTab] = useState('fiche');
  const [pipelineRdvModal, setPipelineRdvModal] = useState(null);
  const [pipelineRdvForm, setPipelineRdvForm] = useState({date:'',time:'',duration:30,calendarId:'',note:''});


  // ── V7 Transfer State ──
  const [v7TransferModal, setV7TransferModal] = useState(null);
  const [v7TransferTarget, setV7TransferTarget] = useState('');
  const [v7TransferLoading, setV7TransferLoading] = useState(false);
  const [v7FollowersMap, setV7FollowersMap] = useState({});
  const v7FollowersLoadedRef = useRef(false);

  // ── V7: Load followers batch for badges ──
  useEffect(() => {
    if (!company?.id || v7FollowersLoadedRef.current) return;
    v7FollowersLoadedRef.current = true;
    api('/api/transfer/followers-batch').then(r => {
      if (r && typeof r === 'object' && !r.error) setV7FollowersMap(r);
    }).catch(() => {});
  }, [company?.id]);

  // ── V7: Transfer handler ──
  const handleV7Transfer = async () => {
    if (!v7TransferModal?.contact?.id || !v7TransferTarget) return;
    setV7TransferLoading(true);
    try {
      const r = await api('/api/transfer/executor/' + v7TransferModal.contact.id, {
        method: 'PUT',
        body: { executorCollabId: v7TransferTarget, companyId: company?.id, sourceCollabId: collab?.id }
      });
      if (r?.success) {
        showNotif(r.message || 'Contact transféré', 'success');
        const updated = await api('/api/data/contacts?companyId=' + company.id + '&collaboratorId=' + collab.id);
        if (updated?.contacts) setContacts((updated.contacts||[]).filter(Boolean)); // hotfix 2026-04-23 — null-safe API boundary
        v7FollowersLoadedRef.current = false;
        const fm = await api('/api/transfer/followers-batch');
        if (fm && typeof fm === 'object' && !fm.error) setV7FollowersMap(fm);
        setV7TransferModal(null);
        setV7TransferTarget('');
      } else {
        showNotif(r?.error || 'Erreur lors du transfert', 'danger');
      }
    } catch (e) {
      showNotif('Erreur réseau', 'danger');
    }
    setV7TransferLoading(false);
  };  const [rdvCountdownDismissed, setRdvCountdownDismissed] = useState(new Set());
  const rdvCountdownRef = useRef(null);

  // Line selector (for multi-number collaborators)
  const [selectedLine, _setSelectedLine] = useState(() => { try { return localStorage.getItem('c360-selectedLine-'+collab.id) || null; } catch { return null; } });
  const setSelectedLine = (v) => { _setSelectedLine(v); try { if(v) localStorage.setItem('c360-selectedLine-'+collab.id, v); else localStorage.removeItem('c360-selectedLine-'+collab.id); } catch {} };

  // ── REAL VOIP (Twilio Device) ──
  const voipDeviceRef = useRef(null);
  const voipCallRef = useRef(null);
  const [voipState, setVoipState] = useState('idle'); // idle, connecting, ringing, in-call, incoming
  const voipStateRef = useRef('idle'); // ref mirror for closures (ring timeout etc.)
  useEffect(() => { voipStateRef.current = (typeof voipState!=='undefined'?voipState:null); }, [voipState]);
  const [voipCurrentCallLogId, setVoipCurrentCallLogId] = useState(null);
  // Initialize Twilio Device for real VoIP calls (SDK now bundled via npm)
  useEffect(() => {
    if (!(typeof voipConfigured!=='undefined'?voipConfigured:null) || !company?.id) return;
    // Find this collaborator's assigned number
    const myNumber = ((typeof appMyPhoneNumbers!=='undefined'?appMyPhoneNumbers:null)||[]).find(pn => pn.collaboratorId === collab.id && pn.status === 'assigned');
    if (!myNumber) return; // No assigned number → no VoIP device
    console.log('[COLLAB VOIP] Initializing device for', collab.id, 'number:', myNumber.phoneNumber);
    api('/api/voip/token', { method:'POST', body:{ companyId:company.id, collaboratorId:collab.id } })
      .then(data => {
        if (!data?.token || data.demo) { console.warn('[COLLAB VOIP] Demo token, skipping device init'); return; }
        console.log('[COLLAB VOIP] Got real token, creating Device...');
        const device = new TwilioDevice(data.token, { codecPreferences:['opus','pcmu'], edge:'dublin' });
        device.on('registered', () => console.log('[COLLAB VOIP] Device registered ✓'));
        device.on('error', (err) => { console.error('[COLLAB VOIP ERR]', err); showNotif('Erreur VoIP: '+err.message,'danger'); });
        device.on('incoming', (call) => {
          setVoipState('incoming');
          voipCallRef.current = call;
          setPhoneIncomingInfo({ from: call.parameters?.From || 'Inconnu' });
          setPhoneDialNumber(call.parameters?.From || '');
          setPhoneDialerMinimized(false);
          // Lookup contact by phone number
          const incomingNum = call.parameters?.From || '';
          if (incomingNum) {
            api(`/api/voip/lookup?phone=${encodeURIComponent(incomingNum)}&companyId=${company.id}`)
              .then(ct => { if (ct?.name) setPhoneIncomingInfo(prev => ({ ...prev, contactName: ct.name, contactId: ct.id })); })
              .catch(() => {});
          }
          showNotif('Appel entrant...','info');
          call.on('cancel', () => { setVoipState('idle'); setPhoneIncomingInfo(null); setPhoneDialNumber(''); });
          call.on('disconnect', () => { setVoipState('idle'); voipCallRef.current = null; setPhoneIncomingInfo(null); setPhoneDialNumber(''); });
        });
        device.register();
        voipDeviceRef.current = device;
        console.log('[COLLAB VOIP] Device created and registering...');
      })
      .catch(err => console.error('[COLLAB VOIP TOKEN ERR]', err));
    // Listen for floating keypad dial messages
    const onPopupMsg = (e) => {
      if(e.data?.type==='c360-dial'&&e.data.number) { setPhoneDialNumber(e.data.number); setTimeout(()=>{ const btn = document.querySelector('[data-dial-call-btn]'); if(btn) btn.click(); }, 100); }
      if(e.data?.type==='c360-hangup') { const btn = document.querySelector('[data-dial-hangup-btn]'); if(btn) btn.click(); }
    };
    window.addEventListener('message', onPopupMsg);
    return () => { window.removeEventListener('message', onPopupMsg); if(voipDeviceRef.current) { voipDeviceRef.current.destroy(); voipDeviceRef.current = null; } };
  }, [voipConfigured, company?.id, collab.id, ((typeof appMyPhoneNumbers!=='undefined'?appMyPhoneNumbers:null)||[]).length]);

  // Load call forms assigned to this collaborator
  useEffect(() => {
    if (!collab?.id || !company?.id) return;
    api('/api/call-forms/my?collaboratorId=' + collab.id + '&companyId=' + company.id)
      .then(d => setCollabCallForms(d || []))
      .catch(() => setCollabCallForms([]));
  }, [collab?.id, company?.id]);

  // Load call form responses when a contact is selected in the right panel
  useEffect(() => {
    if (!pipelineRightContact?.id || !company?.id) { setCallFormResponses([]); return; }
    api('/api/call-forms/contact/' + pipelineRightContact.id + '?companyId=' + company.id)
      .then(d => setCallFormResponses(d || []))
      .catch(() => setCallFormResponses([]));
  }, [pipelineRightContact?.id, company?.id]);

  // DTMF tone generator for keypad
  const playDtmf = useCallback((key) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const freqs = {'1':[697,1209],'2':[697,1336],'3':[697,1477],'4':[770,1209],'5':[770,1336],'6':[770,1477],'7':[852,1209],'8':[852,1336],'9':[852,1477],'*':[941,1209],'0':[941,1336],'#':[941,1477]};
      const f = freqs[key]; if (!f) return;
      const g = ctx.createGain(); g.gain.value = 0.15; g.connect(ctx.destination);
      f.forEach(hz => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz; o.connect(g); o.start(); o.stop(ctx.currentTime + 0.15); });
      setTimeout(() => ctx.close(), 300);
    } catch(e) {}
  }, []);

  // Real VoIP call function (SDK v2: device.connect returns Promise<Call>)
  const startVoipCall = async (phoneNumber, contact = null) => {
    if (!voipDeviceRef.current) {
      showNotif('VoIP non initialisé, appel via téléphone','warning');
      window.open('tel:'+phoneNumber);
      return false;
    }
    if ((typeof voipCredits!=='undefined'?voipCredits:null) <= 0) { showNotif('Crédits VoIP insuffisants !','danger'); return false; }
    const fromNumber = selectedLine || ((typeof appMyPhoneNumbers!=='undefined'?appMyPhoneNumbers:null)||[]).find(pn => pn.collaboratorId === collab.id && pn.status === 'assigned')?.phoneNumber || '';
    const callStartedAt = new Date().toISOString();
    setVoipState('connecting');
    try {
      const call = await voipDeviceRef.current.connect({ params:{ To:phoneNumber, companyId:company.id, collaboratorId:collab.id, fromNumber, skipHoursCheck:'true' } });
      voipCallRef.current = call;
      console.log('[COLLAB VOIP] Call connected, attaching events...');
      call.on('ringing', () => setVoipState('ringing'));
      call.on('accept', () => {
        setVoipState('in-call');
        // CRITICAL: capture Twilio CallSid and update call_log so webhooks can match
        const callSid = call.parameters?.CallSid || call.parameters?.callSid || call._direction === 'OUTGOING' && call.outboundConnectionId || null;
        console.log('[COLLAB VOIP] Call accepted, CallSid:', callSid);
        if (callSid && (typeof voipCurrentCallLogId!=='undefined'?voipCurrentCallLogId:null)) {
          api(`/api/voip/calls/${voipCurrentCallLogId}`, { method:'PUT', body:{ twilioCallSid:callSid, status:'in-progress' } }).catch(e => console.error('[VOIP] SID update failed:', e));
        } else if (callSid) {
          setTimeout(() => {
            const logId = (typeof voipCurrentCallLogId!=='undefined'?voipCurrentCallLogId:null);
            if (logId) api(`/api/voip/calls/${logId}`, { method:'PUT', body:{ twilioCallSid:callSid, status:'in-progress' } }).catch(()=>{});
          }, 500);
        }
        // ── LIVE TRANSCRIPTION SSE (toujours actif — transcription = feature de base) ──
        if (callSid) {
          try {
            if (liveSSERef.current) { liveSSERef.current.close(); liveSSERef.current = null; }
            const _sseToken = (() => { try { return JSON.parse(localStorage.getItem('calendar360-session')||'null')?.token || ''; } catch { return ''; } })();
            const sseUrl = `${API_BASE}/api/voip/live-stream/${callSid}?token=${encodeURIComponent(_sseToken)}`;
            const sse = new EventSource(sseUrl);
            sse.addEventListener('transcript', (e) => {
              try {
                const seg = JSON.parse(e.data);
                const spk = seg.speaker === 'collab' ? 'me' : 'contact';
                setPhoneLiveTranscript(prev => [...prev, { speaker: spk, text: seg.text }]);
                // V1.9 UX — Persistance voiceActivity : 3000ms (au lieu de 800ms) pour visibilité.
                // Reset cumulé via window['_vaTimeout_'+spk] pour éviter empilage de timers.
                setPhoneLiveVoiceActivity(prev => ({ ...prev, [spk]: true, [spk+'Text']: seg.text || prev[spk+'Text'] || '' }));
                clearTimeout(window['_vaTimeout_'+spk]);
                window['_vaTimeout_'+spk] = setTimeout(() => setPhoneLiveVoiceActivity(prev => ({ ...prev, [spk]: false })), 3000);
                // ── V1.5: MOTEUR DE DÉTECTION GÉNÉRIQUE ──
                const _now = Date.now();
                const txt = (seg.text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const _ct = phoneActiveCall?.contactId ? (contacts||[]).find(c=>c.id===phoneActiveCall.contactId) : null;
                const _baseEntity = { contactId:_ct?.id||'', contactName:_ct?.name||'', contactPhone:_ct?.phone||phoneActiveCall?.number||'', contactEmail:_ct?.email||'' };

                // ── RÈGLES DE DÉTECTION (extensible) ──
                const DETECT_RULES = [
                  { type:'rdv', cooldown:30000, icon:'calendar-check', color:'#F59E0B', label:'Rendez-vous détecté',
                    keywords:['rendez-vous','rendez vous','rdv','se voir','on se bloque','on se cale','on fixe','je vous propose un','etes-vous disponible','vous etes disponible','prendre un rdv','programmer un','planifier un','on peut se rencontrer','je propose une date','un creneau','un créneau','on se retrouve','fixer un','bloquer un','caler un','convenir d'],
                    dateRequired: false, // trigger on keywords alone
                    extract: (t) => {
                      let date='',time='';
                      const dayMap={lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6};
                      const monthMap={janvier:'01',fevrier:'02',mars:'03',avril:'04',mai:'05',juin:'06',juillet:'07',aout:'08',septembre:'09',octobre:'10',novembre:'11',decembre:'12'};
                      if(t.includes('demain')){const d=new Date(Date.now()+86400000);date=d.toISOString().split('T')[0];}
                      else if(t.includes('apres-demain')||t.includes('apres demain')){const d=new Date(Date.now()+172800000);date=d.toISOString().split('T')[0];}
                      else{for(const[day,num]of Object.entries(dayMap)){if(t.includes(day)){const now=new Date();const diff=(num-now.getDay()+7)%7||7;const d=new Date(now.getTime()+diff*86400000);date=d.toISOString().split('T')[0];break;}}}
                      const dm=t.match(/le\s+(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)/);
                      if(dm){date=`${new Date().getFullYear()}-${monthMap[dm[2]]}-${String(dm[1]).padStart(2,'0')}`;}
                      const tm=t.match(/(\d{1,2})\s*h\s*(\d{0,2})/);
                      if(tm){time=`${String(tm[1]).padStart(2,'0')}:${(tm[2]||'00').padStart(2,'0')}`;}
                      return{date,time};
                    }
                  },
                  { type:'document', cooldown:45000, icon:'file-text', color:'#8B5CF6', label:'Envoi document détecté',
                    keywords:['plaquette','brochure','document','pdf','envoyer les infos','envoyer un mail avec','je vous envoie','je vous transmets','les informations par mail','par email'],
                    dateRequired: false, extract:()=>({})
                  },
                  { type:'rappel', cooldown:45000, icon:'phone-callback', color:'#0EA5E9', label:'Rappel détecté',
                    keywords:['je vous rappelle','on se rappelle','rappeler','recontacter','reprendre contact','relancer'],
                    dateRequired: false,
                    extract: (t) => {
                      let date='';
                      if(t.includes('demain')){const d=new Date(Date.now()+86400000);date=d.toISOString().split('T')[0];}
                      const dayMap={lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6};
                      for(const[day,num]of Object.entries(dayMap)){if(t.includes(day)){const now=new Date();const diff=(num-now.getDay()+7)%7||7;const d=new Date(now.getTime()+diff*86400000);date=d.toISOString().split('T')[0];break;}}
                      return{date};
                    }
                  },
                  { type:'note', cooldown:60000, icon:'edit-3', color:'#6B7280', label:'Info clé détectée',
                    keywords:['budget de','euros','montant de','le decideur','interesse par','concurrent','devis de','contrat de','signe le','accepte la','refuse la','objectif de','besoin de','priorite'],
                    negativeFilter: ['pas de budget','aucun budget','pas interesse','pas le decideur','pas de devis','ne signe pas','ne veut pas','pas besoin'],
                    dateRequired: false, extract:()=>({})
                  },
                  { type:'devis', cooldown:45000, icon:'receipt', color:'#F97316', label:'💰 Devis / Tarif détecté',
                    keywords:['combien ca coute','combien ça coûte','quel est le prix','quel prix','tarif','devis','cout','coût','faire un devis','proposition commerciale','offre de prix','estimation'],
                    negativeFilter: ['pas de devis','sans devis'],
                    dateRequired: false,
                    extract: (t) => {
                      let amount='';
                      const am=t.match(/(\d[\d\s]*)\s*(?:euros|€|eur)/i);
                      if(am) amount=am[1].replace(/\s/g,'');
                      return{amount};
                    }
                  },
                  { type:'decideur', cooldown:60000, icon:'user-check', color:'#7C3AED', label:'👤 Décideur identifié',
                    keywords:['le decideur','la personne qui decide','mon directeur','mon responsable','mon manager','mon patron','je dois en parler a','en parler avec','valider avec','c\'est madame','c\'est monsieur','qui decide'],
                    negativeFilter: ['pas le decideur','je suis le decideur','c\'est moi qui decide'],
                    dateRequired: false,
                    extract: (t) => {
                      let decideur='';
                      const nm=t.match(/(?:c'est|c est)\s+(monsieur|madame|m\.|mme)\s+(\w+)/i);
                      if(nm) decideur=(nm[1]+' '+nm[2]).trim();
                      const nm2=t.match(/(?:mon|ma|le|la)\s+(directeur|directrice|responsable|manager|patron|patronne|gerant|gérante?)\s*(?:c'est|s'appelle)?\s*(\w*)/i);
                      if(nm2&&nm2[2]) decideur=nm2[1]+' '+nm2[2];
                      return{decideur};
                    }
                  },
                  { type:'objection', cooldown:30000, icon:'alert-triangle', color:'#EF4444', label:'⚠️ Objection détectée',
                    keywords:['trop cher','pas interesse','j\'hesite','j hesite','je ne suis pas sur','je ne sais pas','concurrent','deja un prestataire','pas le moment','je reflechis','je réfléchis','pas convaincu','trop eleve','trop élevé','au dessus de mon budget'],
                    dateRequired: false, extract:()=>({})
                  },
                  { type:'accord', cooldown:45000, icon:'check-circle', color:'#22C55E', label:'✅ Accord verbal détecté',
                    keywords:['ok c\'est bon','c\'est bon pour moi','on signe','je suis d\'accord','banco','je valide','j\'accepte','on y va','c\'est parfait','je prends','on fait comme ca','j\'en suis','je confirme','on est d\'accord','je dis oui','ca me va','ça me va','ca marche','ça marche'],
                    negativeFilter: ['pas d\'accord','je ne suis pas','non c\'est pas bon'],
                    dateRequired: false, extract:()=>({})
                  },
                  { type:'adresse', cooldown:60000, icon:'map-pin', color:'#0EA5E9', label:'📍 Adresse détectée',
                    keywords:['mon adresse c\'est','j\'habite','je suis au','je suis situe','notre adresse','nos bureaux sont','rue de','rue du','avenue','boulevard'],
                    dateRequired: false,
                    extract: (t) => {
                      let address='';
                      const am=t.match(/(?:mon adresse c'est|j'habite|je suis au|nos bureaux sont au?|situe au?)\s+(.+)/i);
                      if(am) address=am[1].trim();
                      else{const st=t.match(/(\d+\s+(?:rue|avenue|boulevard|place|chemin|impasse|allee|allée)\s+.+)/i);if(st)address=st[1].trim();}
                      return{address};
                    }
                  },
                  { type:'entreprise_info', cooldown:60000, icon:'building-2', color:'#2563EB', label:'🏢 Info entreprise détectée',
                    keywords:['notre societe','notre société','notre entreprise','on s\'appelle','la societe','le siret','siren','numero de tva','notre activite','notre activité'],
                    dateRequired: false,
                    extract: (t) => {
                      let company='',siret='';
                      const cn=t.match(/(?:notre (?:societe|société|entreprise)|on s'appelle)\s+(.+?)(?:\s*,|\s*\.|\s+et\s|$)/i);
                      if(cn) company=cn[1].trim();
                      const si=t.match(/(?:siret|siren)\s*:?\s*(\d[\d\s]{8,})/i);
                      if(si) siret=si[1].replace(/\s/g,'');
                      return{company,siret};
                    }
                  },
                  { type:'besoin', cooldown:45000, icon:'target', color:'#8B5CF6', label:'📋 Besoin identifié',
                    keywords:['j\'ai besoin','j ai besoin','je cherche','mon probleme c\'est','mon problème','ce qui m\'interesse','ce qui m interesse','ce que je veux','il me faut','il nous faut','on recherche','on a besoin','notre besoin','notre problematique','notre problématique'],
                    dateRequired: false,
                    extract: (t) => {
                      let besoin='';
                      const bm=t.match(/(?:j'ai besoin de?|je cherche|il (?:me|nous) faut|on (?:recherche|a besoin de?))\s+(.+?)(?:\s*[.,]|$)/i);
                      if(bm) besoin=bm[1].trim();
                      return{besoin};
                    }
                  },
                  { type:'urgence', cooldown:30000, icon:'zap', color:'#DC2626', label:'⏰ Urgence détectée',
                    keywords:['c\'est urgent','c est urgent','le plus vite possible','rapidement','au plus vite','en urgence','avant vendredi','avant lundi','avant demain','deadline','date limite','des que possible','dès que possible','tout de suite','immediatement','immédiatement','prioritaire'],
                    dateRequired: false, extract:()=>({})
                  },
                  { type:'relance_auto', cooldown:45000, icon:'clock', color:'#F59E0B', label:'🔄 Relance programmée',
                    keywords:['dans 3 jours','dans une semaine','dans 15 jours','dans deux semaines','dans un mois','la semaine prochaine','le mois prochain','d\'ici une semaine','d ici une semaine','recontactez-moi dans','rappelez dans'],
                    dateRequired: false,
                    extract: (t) => {
                      let date='',delay='';
                      if(t.match(/dans\s+(\d+)\s*jours?/)){const d=parseInt(t.match(/dans\s+(\d+)\s*jours?/)[1]);date=new Date(Date.now()+d*86400000).toISOString().split('T')[0];delay=d+'j';}
                      else if(t.includes('une semaine')||t.includes('semaine prochaine')){date=new Date(Date.now()+7*86400000).toISOString().split('T')[0];delay='7j';}
                      else if(t.includes('deux semaines')||t.includes('15 jours')){date=new Date(Date.now()+15*86400000).toISOString().split('T')[0];delay='15j';}
                      else if(t.includes('un mois')||t.includes('mois prochain')){date=new Date(Date.now()+30*86400000).toISOString().split('T')[0];delay='30j';}
                      return{date,delay};
                    }
                  },
                  { type:'paiement', cooldown:60000, icon:'credit-card', color:'#059669', label:'💳 Mode de paiement',
                    keywords:['par cheque','par chèque','par virement','virement bancaire','en plusieurs fois','facilite de paiement','facilité','carte bancaire','prelevement','prélèvement','payer par','reglement','règlement','paiement en'],
                    dateRequired: false,
                    extract: (t) => {
                      let mode='';
                      if(t.includes('cheque')||t.includes('chèque'))mode='Chèque';
                      else if(t.includes('virement'))mode='Virement';
                      else if(t.includes('plusieurs fois'))mode='Plusieurs fois';
                      else if(t.includes('carte'))mode='Carte bancaire';
                      else if(t.includes('prelevement')||t.includes('prélèvement'))mode='Prélèvement';
                      return{paiement:mode};
                    }
                  },
                  { type:'transfert', cooldown:30000, icon:'phone-forwarded', color:'#6366F1', label:'📞 Transfert demandé',
                    keywords:['passer a mon collegue','passer à mon collègue','transferer','transférer','je vous passe','passer le standard','passer au service','mettre en relation avec','en relation avec'],
                    dateRequired: false, extract:()=>({})
                  },
                  { type:'satisfaction', cooldown:60000, icon:'smile', color:'#22C55E', label:'😊 Satisfaction détectée',
                    keywords:['tres bien','très bien','parfait','excellent','je suis content','je suis satisfait','super','genial','génial','formidable','bravo','merci beaucoup','c\'est top','c est top','impeccable','nickel'],
                    negativeFilter: ['pas tres bien','pas parfait','pas content','pas satisfait'],
                    dateRequired: false, extract:()=>({})
                  },
                  { type:'insatisfaction', cooldown:30000, icon:'frown', color:'#EF4444', label:'😤 Insatisfaction détectée',
                    keywords:['pas content','mecontent','mécontent','decu','déçu','probleme','problème','ca ne va pas','ça ne va pas','plainte','reclamation','réclamation','inacceptable','scandaleux','nul','lamentable','pas normal'],
                    dateRequired: false, extract:()=>({})
                  },
                  { type:'qualification', cooldown:60000, icon:'bar-chart-2', color:'#0EA5E9', label:'📊 Qualification détectée',
                    keywords:['nous sommes','on est','salaries','salariés','employes','employés','chiffre d\'affaire','chiffre d affaire','ca de','secteur d\'activite','secteur d activite','notre activite','notre activité','nous faisons','notre metier','notre métier','domaine d\'activite'],
                    dateRequired: false,
                    extract: (t) => {
                      let effectif='',ca='',secteur='';
                      const ef=t.match(/(?:nous sommes|on est)\s+(\d+)\s*(?:personnes?|salaries?|salariés?|employes?|employés?)/i);
                      if(ef) effectif=ef[1]+' personnes';
                      const cam=t.match(/(?:chiffre d'?affaire?s?|ca)\s+(?:de\s+)?(\d[\d\s,.]*)\s*(?:euros?|€|k€|millions?|m€)/i);
                      if(cam) ca=cam[1].trim();
                      const sm=t.match(/(?:secteur|domaine|activite|activité|metier|métier)\s+(?:d'?activite|d'?activité)?\s*(?:c'est|:)?\s*(?:le |la |l'|l )?(.+?)(?:\s*[.,]|$)/i);
                      if(sm) secteur=sm[1].trim();
                      return{effectif,ca,secteur};
                    }
                  },
                  { type:'interet', cooldown:45000, icon:'star', color:'#F59E0B', label:'🎯 Intérêt produit',
                    keywords:['je suis interesse','je suis intéressé','interesse par','intéressé par','le pack','l\'offre','la formule','le programme','la prestation','votre service','votre produit','cette option','cette solution','ca m\'interesse','ça m\'intéresse','j\'aimerais','j aimerais','je voudrais'],
                    negativeFilter: ['pas interesse','pas intéressé','ne m\'interesse pas'],
                    dateRequired: false,
                    extract: (t) => {
                      let produit='';
                      const pm=t.match(/(?:interesse|intéressé)\s+par\s+(.+?)(?:\s*[.,]|$)/i);
                      if(pm) produit=pm[1].trim();
                      else{const pm2=t.match(/(?:le pack|l'offre|la formule|le programme|la prestation)\s+(.+?)(?:\s*[.,]|$)/i);if(pm2)produit=pm2[1].trim();}
                      return{produit};
                    }
                  },
                  { type:'canal', cooldown:60000, icon:'message-circle', color:'#0EA5E9', label:'📱 Canal préféré',
                    keywords:['appelez-moi sur','appeler sur mon mobile','par whatsapp','sur whatsapp','par sms','plutot par mail','plutôt par mail','par email','contactez-moi par','joindre par','prefere par','préfère par','envoyez-moi un sms','un texto'],
                    dateRequired: false,
                    extract: (t) => {
                      let canal='';
                      if(t.includes('whatsapp'))canal='WhatsApp';
                      else if(t.includes('sms')||t.includes('texto'))canal='SMS';
                      else if(t.includes('mail')||t.includes('email'))canal='Email';
                      else if(t.includes('mobile'))canal='Mobile';
                      else if(t.includes('telephone')||t.includes('téléphone'))canal='Téléphone';
                      return{canal};
                    }
                  },
                  { type:'disponibilite', cooldown:45000, icon:'calendar-clock', color:'#0EA5E9', label:'📅 Disponibilité détectée',
                    keywords:['je suis disponible','disponible le','dispo le','pas disponible','pas dispo','ca me va','ça me va','mardi ca me va','convient','me convient','libre le','je peux le','ca m\'arrange','ça m\'arrange'],
                    dateRequired: false,
                    extract: (t) => {
                      let dispo='';
                      const dayMap={lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6};
                      for(const[day]of Object.entries(dayMap)){if(t.includes(day)){dispo+=day+' ';}}
                      if(t.includes('matin'))dispo+='matin ';
                      if(t.includes('apres-midi')||t.includes('après-midi'))dispo+='après-midi ';
                      const neg=t.includes('pas disponible')||t.includes('pas dispo')||t.includes('pas libre');
                      return{dispo:dispo.trim(),indispo:neg};
                    }
                  },
                  { type:'recommandation', cooldown:60000, icon:'users', color:'#8B5CF6', label:'🤝 Recommandation détectée',
                    keywords:['je connais quelqu\'un','je connais quelqu un','recommander','je vous recommande','parlez a mon ami','parlez à mon ami','je peux vous donner le contact','un ami qui','un collegue qui','un collègue qui','de ma part','dites que vous venez de','parrainage','parrainer','filleul'],
                    dateRequired: false,
                    extract: (t) => {
                      let referral='';
                      const rm=t.match(/(?:je connais|recommande|parlez [aà]|contact de?)\s+(.+?)(?:\s*[.,]|$)/i);
                      if(rm) referral=rm[1].trim();
                      return{referral};
                    }
                  },
                  { type:'email_dicte', cooldown:30000, icon:'at-sign', color:'#6366F1', label:'📧 Email dicté',
                    keywords:['mon email c\'est','mon email c est','mon mail c\'est','mon adresse mail','notez mon email','mon adresse email','adresse mail c\'est','mail est','e-mail c\'est'],
                    dateRequired: false,
                    extract: (t) => {
                      let email='';
                      const em=t.match(/([a-zA-Z0-9._-]+\s*(?:arobase|@|at)\s*[a-zA-Z0-9.-]+\s*(?:point|\.)\s*[a-zA-Z]{2,})/i);
                      if(em){email=em[1].replace(/\s*arobase\s*/gi,'@').replace(/\s*point\s*/gi,'.').replace(/\s/g,'');}
                      return{email};
                    }
                  },
                  { type:'tel_dicte', cooldown:30000, icon:'phone', color:'#22C55E', label:'📞 Numéro dicté',
                    keywords:['mon numero c\'est','mon numéro c\'est','mon numero c est','appelez-moi au','notez mon portable','mon portable c\'est','mon telephone','mon téléphone','joignable au'],
                    dateRequired: false,
                    extract: (t) => {
                      let phone='';
                      const pm=t.match(/(\d[\d\s]{8,})/);
                      if(pm) phone=pm[1].replace(/\s/g,'');
                      return{phone};
                    }
                  },
                  { type:'renouvellement', cooldown:60000, icon:'refresh-cw', color:'#059669', label:'🔁 Renouvellement détecté',
                    keywords:['renouveler','prolonger','reconduire','etendre','étendre','continuer le contrat','prolongation','renouvellement','on continue','on prolonge','signer a nouveau','signer à nouveau'],
                    dateRequired: false, extract:()=>({})
                  },
                  { type:'resiliation', cooldown:30000, icon:'x-octagon', color:'#DC2626', label:'❌ Résiliation détectée',
                    keywords:['resilier','résilier','resiliation','résiliation','arreter','arrêter','annuler mon contrat','mettre fin','stopper','je veux arreter','je veux arrêter','fin de contrat','ne plus continuer','rompre le contrat'],
                    dateRequired: false, extract:()=>({})
                  },
                  { type:'piece_demandee', cooldown:45000, icon:'paperclip', color:'#F97316', label:'📎 Document demandé',
                    keywords:['envoyez-moi le contrat','le bon de commande','la facture','le devis signe','le devis signé','les conditions','les cgv','un justificatif','une attestation','un certificat','le formulaire','les documents'],
                    dateRequired: false,
                    extract: (t) => {
                      let doc='';
                      const dm=t.match(/(?:envoyez|envoyer|recevoir)\s+(?:moi\s+)?(?:le |la |les |un |une )(.+?)(?:\s*[.,]|$)/i);
                      if(dm) doc=dm[1].trim();
                      else{const types=['contrat','facture','devis','bon de commande','attestation','certificat','formulaire','conditions','cgv','justificatif'];for(const tp of types){if(t.includes(tp)){doc=tp;break;}}}
                      return{document_demande:doc};
                    }
                  },
                  { type:'echeance', cooldown:60000, icon:'alarm-clock', color:'#EF4444', label:'🗓️ Échéance détectée',
                    keywords:['avant le','date limite','fin du mois','expire le','echeance','échéance','deadline','au plus tard le','il faut que ce soit fait','pour le'],
                    dateRequired: false,
                    extract: (t) => {
                      let echeance='';
                      const monthMap={janvier:'01',fevrier:'02',mars:'03',avril:'04',mai:'05',juin:'06',juillet:'07',aout:'08',septembre:'09',octobre:'10',novembre:'11',decembre:'12'};
                      const dm=t.match(/(?:avant le|pour le|au plus tard le|expire le)\s+(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)/i);
                      if(dm) echeance=`${new Date().getFullYear()}-${monthMap[dm[2].toLowerCase()]}-${String(dm[1]).padStart(2,'0')}`;
                      else if(t.includes('fin du mois')){const d=new Date();echeance=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${new Date(d.getFullYear(),d.getMonth()+1,0).getDate()}`;}
                      return{echeance};
                    }
                  },
                  { type:'langue', cooldown:60000, icon:'globe', color:'#6366F1', label:'💬 Langue détectée',
                    keywords:['en anglais','en espagnol','en arabe','en portugais','en italien','en allemand','en chinois','en russe','je parle','ma langue','bilingue','traduction','traduire','interpreter','interpréter'],
                    dateRequired: false,
                    extract: (t) => {
                      let langue='';
                      const langs={anglais:'Anglais',espagnol:'Espagnol',arabe:'Arabe',portugais:'Portugais',italien:'Italien',allemand:'Allemand',chinois:'Chinois',russe:'Russe',turc:'Turc'};
                      for(const[k,v]of Object.entries(langs)){if(t.includes(k)){langue=v;break;}}
                      return{langue};
                    }
                  },
                ];

                // Merge custom rules from config
                const _customRules = ((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections || []).filter(cr => cr.enabled !== false && cr.keywords?.length > 0).map(cr => ({
                  type: cr.type || 'custom_' + cr.id,
                  cooldown: cr.cooldown || 30000,
                  icon: cr.icon || 'zap',
                  color: cr.color || '#F59E0B',
                  label: cr.label || cr.name || 'Détection personnalisée',
                  keywords: (cr.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean),
                  dateRequired: false,
                  extract: () => ({})
                }));
                const ALL_RULES = [...DETECT_RULES, ..._customRules];

                for (const rule of ALL_RULES) {
                  // Skip si ce type est désactivé dans la config
                  if ((typeof liveConfig!=='undefined'?liveConfig:{}).detectionsEnabled?.[rule.type] === false) continue;
                  // Merge custom keywords from config
                  const extraKw = ((typeof liveConfig!=='undefined'?liveConfig:{}).customKeywords?.[rule.type] || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                  const allKeywords = [...rule.keywords, ...extraKw];
                  const matched = allKeywords.some(kw => txt.includes(kw));
                  if (!matched) continue;
                  // Cooldown: skip si le dernier detect est trop récent ET qu'il n'y a pas de suggestion pending fusionnable
                  const lastDetect = phoneLiveDetectRef.current.lastByType[rule.type] || 0;
                  const timeSinceLast = _now - lastDetect;
                  // Fenêtre fusion = 8s entre segments du même type (permet enrichissement rapide)
                  // Cooldown création = rule.cooldown (30-60s) pour nouvelles suggestions
                  const FUSION_MIN_GAP = 8000;
                  if (timeSinceLast < FUSION_MIN_GAP) continue; // anti-spam absolu
                  // Anti-faux positifs: si la phrase contient un mot négatif, on skip
                  // Score: pénalité si mots négatifs (pas de blocage total)
                  let _score = 1.0;
                  if (rule.negativeFilter) { const negCount = rule.negativeFilter.filter(neg => txt.includes(neg)).length; _score -= negCount * 0.4; }
                  if (_score <= 0.2) continue;
                  const entities = rule.extract ? rule.extract(txt) : {};

                  // ── FUSION INTELLIGENTE ──
                  // Si une suggestion pending du même type existe et date de < 60s → enrichir au lieu de créer
                  const FUSION_WINDOW_MS = 60000;
                  setPhoneLiveSuggestions(prev => {
                    const existingIdx = prev.findIndex(s =>
                      s.type === rule.type &&
                      s.status === 'pending' &&
                      !s._editing && !s._composing &&
                      (_now - new Date(s.createdAt).getTime()) < FUSION_WINDOW_MS
                    );

                    if (existingIdx >= 0) {
                      // ── ENRICHIR la suggestion existante ──
                      const existing = prev[existingIdx];
                      const mergedEntities = { ...existing.entities };
                      // Enrichir avec les nouvelles entités (date/time) si plus précises
                      if (entities.date && !mergedEntities.date) mergedEntities.date = entities.date;
                      if (entities.time && !mergedEntities.time) mergedEntities.time = entities.time;
                      // Contact toujours à jour
                      if (_baseEntity.contactId) { mergedEntities.contactId = _baseEntity.contactId; mergedEntities.contactName = _baseEntity.contactName; mergedEntities.contactPhone = _baseEntity.contactPhone; mergedEntities.contactEmail = _baseEntity.contactEmail; }
                      // Score: moyenne pondérée (nouveau segment boost le score)
                      const mergedScore = Math.min(1.0, Math.round(((existing.score || 0.5) * 0.6 + _score * 0.4 + 0.1) * 100) / 100); // +0.1 bonus fusion
                      const mergedPhrase = existing.phrase + ' · ' + seg.text;
                      // Niveau de confiance basé sur le score
                      const confidence = mergedScore >= 0.8 ? 'high' : mergedScore >= 0.5 ? 'medium' : 'low';
                      const updated = [...prev];
                      updated[existingIdx] = {
                        ...existing,
                        phrase: mergedPhrase,
                        entities: mergedEntities,
                        score: mergedScore,
                        confidence,
                        label: rule.label + (confidence === 'low' ? ' (incertain)' : ''),
                        _fusionCount: (existing._fusionCount || 1) + 1,
                        updatedAt: new Date().toISOString(),
                      };
                      return updated;
                    }

                    // ── CRÉER une nouvelle suggestion ──
                    const confidence = _score >= 0.8 ? 'high' : _score >= 0.5 ? 'medium' : 'low';
                    return [...prev, {
                      id: 'sug_' + _now + '_' + rule.type,
                      type: rule.type,
                      status: 'pending',
                      score: Math.round(_score * 100) / 100,
                      confidence,
                      phrase: seg.text,
                      entities: { ..._baseEntity, ...entities },
                      icon: rule.icon,
                      color: rule.color,
                      label: rule.label + (confidence === 'low' ? ' (incertain)' : ''),
                      speaker: spk,
                      _fusionCount: 1,
                      createdAt: new Date().toISOString(),
                    }];
                  });
                  phoneLiveDetectRef.current.lastByType[rule.type] = _now;
                }
              } catch {}
            });
            sse.addEventListener('interim', (e) => {
              try {
                const seg = JSON.parse(e.data);
                const spk = seg.speaker === 'collab' ? 'me' : 'contact';
                setPhoneLiveVoiceActivity(prev => ({ ...prev, [spk]: true, [spk+'Text']: seg.text || '' }));
                // Auto-reset after 2s if no new interim
                clearTimeout(window['_vaTimeout_'+spk]);
                window['_vaTimeout_'+spk] = setTimeout(() => setPhoneLiveVoiceActivity(prev => ({ ...prev, [spk]: false, [spk+'Text']: '' })), 2000);
              } catch {}
            });
            sse.addEventListener('analysis', (e) => {
              try {
                const analysis = JSON.parse(e.data);
                setPhoneLiveAnalysis(analysis);
                if (analysis.sentiment) setPhoneLiveSentiment(analysis.sentiment);
              } catch {}
            });
            sse.addEventListener('sentiment', (e) => {
              try { const d = JSON.parse(e.data); if (d.sentiment) setPhoneLiveSentiment(d.sentiment); } catch {}
            });
            sse.addEventListener('end', () => { sse.close(); liveSSERef.current = null; setPhoneLiveVoiceActivity({ me: false, contact: false, meText: '', contactText: '' }); });
            sse.onerror = () => { console.warn('[LIVE SSE] Connection error'); };
            liveSSERef.current = sse;
            console.log('[LIVE SSE] Connected for', callSid);
          } catch (err) { console.error('[LIVE SSE ERR]', err); }
        }
      });
      call.on('disconnect', () => {
        console.log('[COLLAB VOIP] Call disconnected');
        setVoipState('idle');
        voipCallRef.current = null;
        // Close live SSE
        if (liveSSERef.current) { liveSSERef.current.close(); liveSSERef.current = null; }
        setPhoneLiveAnalysis(null);
        const endedAt = new Date().toISOString();
        if ((typeof voipCurrentCallLogId!=='undefined'?voipCurrentCallLogId:null)) {
          api(`/api/voip/calls/${voipCurrentCallLogId}`, { method:'PUT', body:{ status:'completed', endedAt } }).catch(()=>{});
          // Update local call log state in real-time
          setVoipCallLogs(prev => prev.map(cl => cl.id === (typeof voipCurrentCallLogId!=='undefined'?voipCurrentCallLogId:null) ? { ...cl, status:'completed', endedAt, duration: (typeof phoneCallTimer!=='undefined'?phoneCallTimer:null) } : cl));
          setVoipCurrentCallLogId(null);
        }
        // Refresh full call logs from server for accuracy
        api(`/api/voip/calls?companyId=${company.id}`).then(d => { if(Array.isArray(d)) setVoipCallLogs(d); }).catch(()=>{});
        setPhonePostCallModal("live_"+Date.now());
        setPhoneActiveCall(null);
        setPhoneCallTimer(0);
        setPhoneCopilotLiveData(null);
        setPhoneCopilotLiveLoading(false);
        setPhoneCopilotChecklist({});
      });
      call.on('cancel', () => {
        setVoipState('idle');
        voipCallRef.current = null;
        if ((typeof voipCurrentCallLogId!=='undefined'?voipCurrentCallLogId:null)) {
          setVoipCallLogs(prev => prev.map(cl => cl.id === (typeof voipCurrentCallLogId!=='undefined'?voipCurrentCallLogId:null) ? { ...cl, status:'cancelled' } : cl));
          setVoipCurrentCallLogId(null);
        }
        setPhoneActiveCall(null);
        setPhoneCallTimer(0);
      });
      call.on('error', (err) => {
        showNotif('Erreur appel: '+err.message,'danger');
        setVoipState('idle');
        voipCallRef.current = null;
        setPhoneActiveCall(null);
        setPhoneCallTimer(0);
      });
    } catch(err) {
      console.error('[COLLAB VOIP] Connect error:', err);
      showNotif('Erreur connexion appel: '+err.message,'danger');
      setVoipState('idle');
      setPhoneActiveCall(null);
      setPhoneCallTimer(0);
      return false;
    }
    // Try to get CallSid from the Twilio call object early
    const earlySid = voipCallRef.current?.parameters?.CallSid || voipCallRef.current?.parameters?.callSid || null;
    // Log the call + add to local state immediately (optimistic update)
    api('/api/voip/calls', { method:'POST', body:{ companyId:company.id, contactId:contact?.id||null, collaboratorId:collab.id, toNumber:phoneNumber, fromNumber, twilioCallSid:earlySid } })
      .then(d => {
        if(d?.id) {
          setVoipCurrentCallLogId(d.id);
          // Add to local call logs immediately so history shows the active call
          const newLog = {
            id: d.id, companyId: company.id, contactId: contact?.id||null,
            collaboratorId: collab.id, direction: 'outbound', toNumber: phoneNumber,
            fromNumber, status: 'initiated', createdAt: callStartedAt, startedAt: callStartedAt,
            duration: 0
          };
          setVoipCallLogs(prev => [newLog, ...prev]);
        }
      });
    return true;
  };

  // DND & Scheduling
  const [phoneDND, setPhoneDND] = useState(() => { try { return localStorage.getItem("c360-phone-dnd-"+collab.id)==="1"; } catch { return false; } });
  const [phoneScheduledCalls, setPhoneScheduledCalls] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-scheduled-"+collab.id)||"[]"); } catch { return []; } });
  const [phoneShowScheduleModal, setPhoneShowScheduleModal] = useState(false);
  const [phoneScheduleForm, setPhoneScheduleForm] = useState({contactId:'',number:'',date:'',time:'',notes:'',collaboratorId:collab.id});
  // V1.8.22 Phase B — Modal de résolution de doublons (single/conflict/multi + multi-collab)
  const [duplicateResolverData, setDuplicateResolverData] = useState(null);
  // V1.13.0 — modal anti-doublon création (NewContactModal flow)
  // shape: { matches, conflict, pendingNewContact: { name, email, phone, _formSnapshot } }
  const [duplicateOnCreateData, setDuplicateOnCreateData] = useState(null);
  // V1.13.1.d — hard delete depuis modal doublon (instance dédiée au flow doublon)
  const [dupHardDeleteTarget, setDupHardDeleteTarget] = useState(null);
  // V1.8.2 — collab cible du RDV (default = moi). Si != moi, on filtre l'agenda et on prend les dispos de l'autre.
  const _scheduleTargetCollabId = (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).collaboratorId || collab.id;
  const _scheduleTargetCollab = (collabs||[]).find(c => c.id === _scheduleTargetCollabId) || collab;
  const _scheduleAvailableCalendars = (calendars||[]).filter(c => {
    try {
      const cls = Array.isArray(c.collaborators) ? c.collaborators : JSON.parse(c.collaborators_json || '[]');
      return cls.includes(_scheduleTargetCollabId);
    } catch { return false; }
  });
  // V1.8.3 — collabs réellement bookables = ceux dont au moins un calendar est visible dans le state.
  // En mode member, init.js filtre les calendars aux siens uniquement → les autres collabs sont retirés du sélecteur.
  const _bookableCollabs = (collabs||[]).filter(_c => (calendars||[]).some(_cal => {
    try {
      const _ids = Array.isArray(_cal.collaborators) ? _cal.collaborators : JSON.parse(_cal.collaborators_json || '[]');
      return _ids.includes(_c.id);
    } catch { return false; }
  }));
  // V1.8.12 — Auto-select calendarId quand le collab cible n'a qu'un seul agenda dispo.
  // Évite à l'utilisateur de cliquer un dropdown à 1 option et garantit que addScheduledCall
  // utilise bien le bon calendar même en mode cross-collab (sans dépendre du fallback
  // collabCalendar limité à collab.id).
  useEffect(() => {
    if (!phoneShowScheduleModal) return;
    if (!phoneScheduleForm?._bookingMode) return;
    if (_scheduleAvailableCalendars.length === 1 && !phoneScheduleForm.calendarId) {
      setPhoneScheduleForm(p => ({ ...p, calendarId: _scheduleAvailableCalendars[0].id }));
    }
  }, [phoneShowScheduleModal, phoneScheduleForm?._bookingMode, phoneScheduleForm?.calendarId, _scheduleAvailableCalendars.length, _scheduleTargetCollabId]);
  const [schedContactMode, setSchedContactMode] = useState('new');
  const [schedSearchQ, setSchedSearchQ] = useState('');
  const schedSearchResults = useMemo(() => {
    if(!schedSearchQ || schedSearchQ.length<2) return [];
    const q = schedSearchQ.toLowerCase();
    return (contacts||[]).filter(c => (c.name||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q) || (c.phone||'').includes(q)).slice(0,5);
  }, [schedSearchQ, contacts]);

  // Blacklist
  const [phoneBlacklist, setPhoneBlacklist] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-blacklist-"+collab.id)||"[]"); } catch { return []; } });

  // Cockpit — floating call dashboard
  const [cockpitOpen, setCockpitOpen] = useState(false);
  const [cockpitTab, setCockpitTab] = useState('dashboard');
  const [cockpitNoteText, setCockpitNoteText] = useState('');
  const [cockpitMinimized, setCockpitMinimized] = useState(false);
  // V1.9.1 — Bannière flottante : carousel suggestions (1 visible à la fois)
  const [cockpitCarouselIdx, setCockpitCarouselIdx] = useState(0);
  // V1.9.1 — Jauges intelligentes par intention (max 4 répétitions). 4 boutons : accept | rdv | sms | email
  const [cockpitIntentLevels, setCockpitIntentLevels] = useState({ accept: 0, rdv: 0, sms: 0, email: 0 });
  // V1.9.1 — Tracking du dernier signal vibration appliqué par bouton (déclenchement UNIQUE quand passage à level 4)
  const cockpitVibrationFiredRef = useRef({ accept: false, rdv: false, sms: false, email: false });
  // V1.9.1 — Détection nouveaux items phoneLiveSuggestions (pour incrément jauge)
  const cockpitLastSuggestionsCountRef = useRef(0);
  // V1.9.1 — Vibration éphémère 1x quand level passe à 4 (par bouton)
  const [cockpitVibrating, setCockpitVibrating] = useState({ accept: false, rdv: false, sms: false, email: false });

  // V1.9.1 — Reset carousel + jauges + vibration ref à fin d'appel (phoneActiveCall null = appel terminé)
  useEffect(() => {
    if (!phoneActiveCall) {
      setCockpitCarouselIdx(0);
      setCockpitIntentLevels({ accept: 0, rdv: 0, sms: 0, email: 0 });
      cockpitVibrationFiredRef.current = { accept: false, rdv: false, sms: false, email: false };
      cockpitLastSuggestionsCountRef.current = 0;
    }
  }, [phoneActiveCall]);

  // V1.9.1 — Auto-open bannière Copilot à chaque démarrage d'appel (entrant ou sortant)
  // UX : Copilot toujours visible automatiquement, aucune action manuelle requise.
  // Ferme uniquement sur clic croix utilisateur OU fin d'appel (useEffect reset cockpitOpen ailleurs).
  useEffect(() => {
    if (phoneActiveCall) {
      setCockpitOpen(true);
      setCockpitMinimized(false);
    }
  }, [phoneActiveCall]);

  // V1.9.1 — Jauge intelligente : incrémenter à chaque nouveau phoneLiveSuggestions item, mappé par type → bouton (max 4)
  useEffect(() => {
    if (!phoneActiveCall) return;
    const cur = phoneLiveSuggestions || [];
    const prevCount = cockpitLastSuggestionsCountRef.current;
    if (cur.length <= prevCount) { cockpitLastSuggestionsCountRef.current = cur.length; return; }
    const intentMap = {
      rdv: 'rdv', rappel: 'rdv', disponibilite: 'rdv',
      document: 'email', devis: 'email', email_dicte: 'email',
      accord: 'accept', interet: 'accept', satisfaction: 'accept', qualification: 'accept',
      canal: 'sms',
    };
    const incr = { accept: 0, rdv: 0, sms: 0, email: 0 };
    for (let i = prevCount; i < cur.length; i++) {
      const s = cur[i];
      const t = (s?.type || '').toLowerCase();
      const key = intentMap[t];
      if (key) incr[key] += 1;
    }
    if (incr.accept || incr.rdv || incr.sms || incr.email) {
      setCockpitIntentLevels(p => ({
        accept: Math.min(4, (p.accept || 0) + incr.accept),
        rdv: Math.min(4, (p.rdv || 0) + incr.rdv),
        sms: Math.min(4, (p.sms || 0) + incr.sms),
        email: Math.min(4, (p.email || 0) + incr.email),
      }));
    }
    cockpitLastSuggestionsCountRef.current = cur.length;
  }, [phoneLiveSuggestions, phoneActiveCall]);

  // V1.9.1 — Effet vibration unique quand level d'intention passe à 4 (et pas encore consommé)
  useEffect(() => {
    ['accept','rdv','sms','email'].forEach(key => {
      if (cockpitIntentLevels[key] === 4 && !cockpitVibrationFiredRef.current[key]) {
        cockpitVibrationFiredRef.current[key] = true;
        setCockpitVibrating(p => ({...p, [key]: true}));
        setTimeout(() => setCockpitVibrating(p => ({...p, [key]: false})), 500);
      }
    });
  }, [cockpitIntentLevels]);

  // V1.10.1 — UI Sauvegardes & restauration (self-service)
  // Wording strict côté UX : "sauvegardes / restaurer / annuler une erreur" — JAMAIS "snapshot".
  const [collabSnapshotsList, setCollabSnapshotsList] = useState([]);
  const [collabSnapshotsLoading, setCollabSnapshotsLoading] = useState(false);
  const [snapshotPreviewModal, setSnapshotPreviewModal] = useState(null); // {snapshot, willRestore, willSkip, warnings, counts}
  const [snapshotPreviewLoading, setSnapshotPreviewLoading] = useState(false);
  const [snapshotConfirmRestore, setSnapshotConfirmRestore] = useState(null); // {snapshot row}
  const [snapshotRestoring, setSnapshotRestoring] = useState(false);
  const [snapshotManualLoading, setSnapshotManualLoading] = useState(false);
  // Préparation R4 : permet le bouton "Annuler la restauration" via re-restore du pre-restore snapshot
  const [snapshotLastRestoreUndo, setSnapshotLastRestoreUndo] = useState(null); // {preRestoreSnapshotId, restoredAt}

  // V1.10.1 — Helper format temps relatif "il y a X min" (UX humaine, jamais technique)
  const fmtSnapshotAgo = (ms) => {
    if (!ms) return '—';
    const diff = Date.now() - Number(ms);
    if (diff < 0) return "à l'instant";
    if (diff < 60_000) return "à l'instant";
    if (diff < 3_600_000) return 'il y a ' + Math.floor(diff / 60_000) + ' min';
    if (diff < 86_400_000) {
      const h = Math.floor(diff / 3_600_000);
      return 'il y a ' + h + 'h';
    }
    const d = new Date(Number(ms));
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return "aujourd'hui " + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    }
    const yest = new Date(today.getTime() - 86_400_000);
    if (d.toDateString() === yest.toDateString()) {
      return "hier " + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    }
    return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  };

  // V1.10.1 — Fetch liste sauvegardes (auto + manuel) du collab courant
  const fetchCollabSnapshots = () => {
    if (!collab?.id) return;
    setCollabSnapshotsLoading(true);
    api('/api/collab-snapshots/list?collabId=' + encodeURIComponent(collab.id))
      .then(r => {
        if (r && Array.isArray(r.snapshots)) setCollabSnapshotsList(r.snapshots);
      })
      .catch(() => showNotif('Erreur chargement des sauvegardes', 'danger'))
      .finally(() => setCollabSnapshotsLoading(false));
  };

  // V1.10.1 — Auto-fetch quand l'utilisateur ouvre le sub-tab Sauvegardes
  useEffect(() => {
    if (portalTab === 'settings' && settingsSubTab === 'sauvegardes') {
      fetchCollabSnapshots();
    }
  }, [portalTab, settingsSubTab]);

  // V1.10.1 — Listener event global 'collabDataRestored' : tous les modules (CRM, pipeline, agenda) refetch leurs données
  // pour synchroniser sans reload. Critique : aucun reload page autorisé après restore.
  useEffect(() => {
    const handler = () => {
      Promise.all([
        api('/api/data/contacts'),
        api('/api/bookings'),
      ]).then(([cs, bs]) => {
        if (Array.isArray(cs)) setContacts(cs.filter(Boolean));
        if (Array.isArray(bs)) setBookings(bs);
      }).catch(() => {});
    };
    window.addEventListener('collabDataRestored', handler);
    return () => window.removeEventListener('collabDataRestored', handler);
  }, []);

  // V1.10.1 — Action : ouvrir modal preview d'une sauvegarde
  const openSnapshotPreview = (snapshotId) => {
    setSnapshotPreviewLoading(true);
    setSnapshotPreviewModal({ _loading: true, snapshotId });
    api('/api/collab-snapshots/' + snapshotId + '/preview')
      .then(preview => {
        if (preview && preview.snapshot) setSnapshotPreviewModal(preview);
        else { setSnapshotPreviewModal(null); showNotif('Aperçu indisponible', 'danger'); }
      })
      .catch(err => { setSnapshotPreviewModal(null); showNotif('Erreur aperçu : ' + (err?.message || ''), 'danger'); })
      .finally(() => setSnapshotPreviewLoading(false));
  };

  // V1.10.1 — Action : créer une sauvegarde manuelle (avant action sensible)
  const createManualSnapshot = () => {
    if (!collab?.id) return;
    setSnapshotManualLoading(true);
    api('/api/collab-snapshots/manual', {
      method: 'POST',
      body: { collabId: collab.id, reason: 'snapshot manuel utilisateur' },
    })
      .then(r => {
        if (r?.success) {
          showNotif('✓ Sauvegarde créée', 'success');
          fetchCollabSnapshots();
        } else {
          showNotif('Erreur création : ' + (r?.error || ''), 'danger');
        }
      })
      .catch(err => showNotif('Erreur : ' + (err?.message || ''), 'danger'))
      .finally(() => setSnapshotManualLoading(false));
  };

  // V1.10.1 — Action : confirmer et appliquer la restauration
  // Flow : POST /restore → reset states locaux critiques → refetch data → dispatch event global → toast undo
  const confirmRestoreSnapshot = (snapshot, reason) => {
    if (!snapshot?.id) return;
    setSnapshotRestoring(true);
    api('/api/collab-snapshots/' + snapshot.id + '/restore', {
      method: 'POST',
      body: { confirmed: true, reason: reason || 'user-revert' },
    })
      .then(result => {
        if (!result?.success) {
          showNotif('Erreur restauration : ' + (result?.error || ''), 'danger');
          return;
        }
        // 1. Reset states locaux critiques (peuvent pointer vers data invalide post-restore)
        try { setSelectedCrmContact(null); } catch {}
        try { setPipelineRightContact(null); } catch {}
        try { setPhoneActiveCall(null); } catch {}
        try { setCockpitOpen(false); } catch {}
        try { setCockpitMinimized(false); } catch {}
        // 2. Refetch global (contacts + bookings) sans reload
        Promise.all([
          api('/api/data/contacts'),
          api('/api/bookings'),
        ]).then(([cs, bs]) => {
          if (Array.isArray(cs)) setContacts(cs.filter(Boolean));
          if (Array.isArray(bs)) setBookings(bs);
        }).catch(() => {});
        // 3. Event global pour autres modules
        try { window.dispatchEvent(new Event('collabDataRestored')); } catch {}
        // 4. Préparation R4 : sauvegarder l'ID pre-restore pour bouton "Annuler"
        if (result.preRestoreSnapshotId) {
          setSnapshotLastRestoreUndo({
            preRestoreSnapshotId: result.preRestoreSnapshotId,
            restoredAt: Date.now(),
          });
        }
        // 5. Refresh liste + close modals
        fetchCollabSnapshots();
        setSnapshotPreviewModal(null);
        setSnapshotConfirmRestore(null);
        // 6. Toast succès
        showNotif('✅ Vos données ont été restaurées', 'success');
      })
      .catch(err => showNotif('Erreur restauration : ' + (err?.message || ''), 'danger'))
      .finally(() => setSnapshotRestoring(false));
  };

  // V1.10.1 — Action R4 : annuler la dernière restauration (re-restore du pre-restore snapshot)
  const undoLastRestore = () => {
    if (!snapshotLastRestoreUndo?.preRestoreSnapshotId) {
      showNotif('Aucune restauration à annuler', 'info');
      return;
    }
    confirmRestoreSnapshot({ id: snapshotLastRestoreUndo.preRestoreSnapshotId }, 'undo-restore');
    setSnapshotLastRestoreUndo(null);
  };

  // V1.10.1+ — Action : supprimer une sauvegarde (avec confirm)
  const deleteSnapshot = (snapshot) => {
    if (!snapshot?.id) return;
    const dateLabel = fmtSnapshotAgo(snapshot.createdAt);
    if (!confirm(`Supprimer la sauvegarde "${dateLabel}" ?\n\nCette action est définitive. Vous ne pourrez plus revenir à cet état.`)) return;
    api('/api/collab-snapshots/' + snapshot.id, { method: 'DELETE' })
      .then(r => {
        if (r?.success) {
          showNotif('Sauvegarde supprimée', 'success');
          // Si c'était le pre-restore actuel, retirer le banner Annuler
          if (snapshotLastRestoreUndo?.preRestoreSnapshotId === snapshot.id) {
            setSnapshotLastRestoreUndo(null);
          }
          fetchCollabSnapshots();
        } else {
          showNotif('Erreur : ' + (r?.error || 'suppression refusée'), 'danger');
        }
      })
      .catch(err => showNotif('Erreur : ' + (err?.message || ''), 'danger'));
  };

  // Post-call form
  const [phonePostCallModal, setPhonePostCallModal] = useState(null); // callId
  const [nrpPostCallModal, setNrpPostCallModal] = useState(null); // { contact, nrpCount, followups, isShortCall, duration, isNrp }
  const [postCallResultModal, setPostCallResultModal] = useState(null); // { contact, duration, calledNumber }
  const [rdvPasseModal, setRdvPasseModal] = useState(null); // { contact, rdvDate, bookingId } — popup obligatoire "Comment s'est passé le RDV ?"
  const [nrpModalShowStages, setNrpModalShowStages] = useState(false);
  const [nrpModalShowHistory, setNrpModalShowHistory] = useState(false);
  const [phoneDispositions, setPhoneDispositions] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-dispositions-"+collab.id)||"{}"); } catch { return {}; } });
  const DISPOSITION_CODES = [
    {id:'interested',label:'Intéressé',color:'#22C55E',icon:'thumbs-up'},
    {id:'callback',label:'À rappeler',color:'#F59E0B',icon:'phone-forwarded'},
    {id:'not_interested',label:'Pas intéressé',color:'#EF4444',icon:'thumbs-down'},
    {id:'wrong_number',label:'Mauvais numéro',color:'#64748B',icon:'phone-off'},
    {id:'voicemail',label:'Messagerie',color:'#7C3AED',icon:'voicemail'},
    {id:'no_answer',label:'Pas de réponse',color:'#F59E0B',icon:'phone-missed'},
    {id:'meeting_set',label:'RDV pris',color:'#22C55E',icon:'calendar'},
    {id:'deal_closed',label:'Deal conclu',color:'#22C55E',icon:'check-circle'},
    {id:'follow_up',label:'Suivi nécessaire',color:'#2563EB',icon:'clock'},
    {id:'info_sent',label:'Info envoyée',color:'#0EA5E9',icon:'send'},
  ];

  // Campaigns / Power dialer
  const [phoneCampaigns, setPhoneCampaigns] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-campaigns-"+collab.id)||"[]"); } catch { return []; } });
  const [phoneShowCampaignModal, setPhoneShowCampaignModal] = useState(false);
  const [phoneDailyGoal, setPhoneDailyGoal] = useState(() => { try { return parseInt(localStorage.getItem("c360-phone-goal-"+collab.id))||10; } catch { return 10; } });
  // Power Dialer state
  const [pdNumbers, setPdNumbers] = useState('');
  const [pdParsedList, setPdParsedList] = useState([]);
  const [pdDuplicates, setPdDuplicates] = useState([]);
  const [pdStatus, setPdStatus] = useState('idle'); // idle | running | paused | done
  const [pdCurrentIdx, setPdCurrentIdx] = useState(0);
  const [pdResults, setPdResults] = useState({}); // {index: 'called'|'missed'|'answered'|'skipped'}
  const pdTimerRef = useRef(null);
  // Auto-Dialer Pipeline — appel automatique colonne par colonne
  const [pdStageId, setPdStageId] = useState(null); // which pipeline column is being dialed
  const [pdContactList, setPdContactList] = useState([]); // ordered list of {id, name, phone} to call
  const pdPrevVoipState = useRef('idle'); // track (typeof voipState!=='undefined'?voipState:null) transitions for auto-next
  const pdRingTimeoutRef = useRef(null); // auto-hangup if no answer after X seconds

  // Call scripts — DUAL WRITE: DB-first + fallback localStorage + migration auto
  const defaultScripts = [
    {id:'prospection',title:'Prospection',steps:["Bonjour, [Nom du contact], c'est [Votre nom] de [Entreprise].","Je vous contacte car...","Seriez-vous disponible pour un rendez-vous ?","Merci de votre temps, bonne journée !"]},
    {id:'suivi',title:'Suivi client',steps:["Bonjour [Nom], comment allez-vous ?","Je fais suite à notre dernier échange...","Y a-t-il des questions ou besoins ?","Je reste disponible. Bonne journée !"]},
    {id:'reclamation',title:'Réclamation',steps:["Bonjour, je comprends votre situation.","Pouvez-vous me décrire le problème ?","Voici ce que nous allons faire...","Je m'assure personnellement du suivi."]},
    {id:'rdv',title:'Prise de RDV',steps:["Bonjour, je souhaite planifier un rendez-vous.","Quelles sont vos disponibilités ?","Parfait, je vous propose le [date] à [heure].","C'est noté, vous recevrez une confirmation."]}
  ];
  const [phoneCallScripts, setPhoneCallScripts] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-scripts-"+collab.id)||"[]"); } catch { return defaultScripts; } });
  const scriptsLoadedFromDB = useRef(false);
  // Load scripts from DB on mount (DB-first), migrate localStorage if DB empty
  if (!scriptsLoadedFromDB.current && collab?.id) {
    scriptsLoadedFromDB.current = true;
    api('/api/collaborators/'+collab.id+'/call-scripts').then(dbScripts => {
      if (dbScripts && Array.isArray(dbScripts) && dbScripts.length > 0) {
        // DB has data → use it (DB wins)
        setPhoneCallScripts(dbScripts);
        try { localStorage.setItem('c360-phone-scripts-'+collab.id, JSON.stringify(dbScripts)); } catch {}
      } else {
        // DB empty → migrate from localStorage if present
        const lsRaw = localStorage.getItem('c360-phone-scripts-'+collab.id);
        if (lsRaw) {
          try {
            const lsScripts = JSON.parse(lsRaw);
            if (lsScripts.length > 0) {
              api('/api/collaborators/'+collab.id+'/call-scripts', { method:'PUT', body:{ scripts: lsScripts } })
                .then(() => console.log('[MIGRATION] Scripts migrated to DB for', collab.id))
                .catch(() => {});
            }
          } catch {}
        }
      }
    }).catch(() => {}); // API fail → keep localStorage data, no crash
  }

  // Dual write helper for scripts — saves to both localStorage and DB
  const saveScriptsDual = (newScripts) => {
    try { localStorage.setItem('c360-phone-scripts-'+collab.id, JSON.stringify(newScripts)); } catch {}
    api('/api/collaborators/'+collab.id+'/call-scripts', { method:'PUT', body:{ scripts: newScripts } }).catch(() => {});
  };

  // Voicemail / Répondeur
  const [phoneVoicemails, setPhoneVoicemails] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-voicemails-"+collab.id)||"[]"); } catch { return []; } });
  const [phoneAutoSMS, setPhoneAutoSMS] = useState(() => { try { return localStorage.getItem("c360-phone-autosms-"+collab.id)==="1"; } catch { return false; } });
  const [phoneAutoSMSText, setPhoneAutoSMSText] = useState(() => { try { return localStorage.getItem("c360-phone-autosms-text-"+collab.id)||"Désolé, je n'ai pas pu répondre. Je vous rappelle dès que possible."; } catch { return "Désolé, je n'ai pas pu répondre. Je vous rappelle dès que possible."; } });
  const [phoneOpenHours, setPhoneOpenHours] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-hours-"+collab.id)||'{"start":"09:00","end":"18:00","days":[1,2,3,4,5]}'); } catch { return {start:"09:00",end:"18:00",days:[1,2,3,4,5]}; } });

  // ── Feature toggles (cocher/décocher chaque module) ──
  const PHONE_MODULES = [
    {id:'analytics',label:'Analytics avancé',desc:'Graphiques d\'activité, heatmap, tendances',icon:'bar-chart-2',color:'#2563EB'},
    {id:'ai_keywords',label:'IA Mots-clés',desc:'Détection automatique de mots-clés importants dans les appels',icon:'cpu',color:'#7C3AED'},
    {id:'ai_suggest',label:'Mode Pilote IA',desc:'Coaching intelligent et suggestions contextuelles pendant l\'appel',icon:'zap',color:'#7C3AED'},
    {id:'gamification',label:'Gamification',desc:'Badges, streaks, classement équipe, objectifs',icon:'award',color:'#22C55E'},
    {id:'sms_templates',label:'Templates SMS',desc:'Bibliothèque de messages types avec variables dynamiques',icon:'message-square',color:'#0EA5E9'},
    {id:'notif_rappels',label:'Notifications & Rappels',desc:'Alertes pour appels programmés et rappels automatiques',icon:'bell',color:'#EF4444'},
    {id:'rapports',label:'Rapports',desc:'Résumé hebdomadaire/mensuel, comparaison de périodes',icon:'file-text',color:'#64748B'},
    {id:'caller_id',label:'Identification appelant',desc:'Infos enrichies sur le contact pendant l\'appel',icon:'user',color:'#EC4899'},
    {id:'call_quality',label:'Score qualité appel',desc:'Évaluation automatique de la qualité de chaque appel',icon:'star',color:'#F59E0B'},
    {id:'speed_dial',label:'Numérotation rapide',desc:'Touches 1-9 pour vos contacts les plus fréquents',icon:'phone',color:'#22C55E'},
  ];
  const [phoneModules, setPhoneModules] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-modules-"+collab.id)||"{}"); } catch { return {}; } });
  const isModuleOn = (id) => phoneModules[id] !== false;
  const toggleModule = (id) => { setPhoneModules(prev => { const n={...prev,[id]:!isModuleOn(id)}; localStorage.setItem("c360-phone-modules-"+collab.id,JSON.stringify(n)); return n; }); };

  // Gamification state
  const [phoneStreak, setPhoneStreak] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-streak-"+collab.id)||'{"count":0,"lastDate":""}'); } catch { return {count:0,lastDate:""}; } });
  const [phoneBadges, setPhoneBadges] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-badges-"+collab.id)||"[]"); } catch { return []; } });

  // SMS Templates state
  const [phoneSMSTemplates, setPhoneSMSTemplates] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-smsTemplates-"+collab.id)||'[]'); } catch { return []; } });
  const defaultSMSTemplates = [
    {id:'t1',name:'Absence',text:'Bonjour, je suis actuellement indisponible. Je vous rappelle dès que possible. Cordialement, {nom}',category:'auto'},
    {id:'t2',name:'Confirmation RDV',text:'Bonjour {client}, votre rendez-vous est confirmé le {date} à {heure}. À bientôt !',category:'rdv'},
    {id:'t3',name:'Suivi devis',text:'Bonjour {client}, suite à notre échange, je vous envoie le devis par email. N\'hésitez pas à revenir vers moi. {nom}',category:'suivi'},
    {id:'t4',name:'Rappel RDV',text:'Rappel: Vous avez rendez-vous demain à {heure}. En cas d\'empêchement, contactez-nous au {tel}.',category:'rdv'},
    {id:'t5',name:'Remerciement',text:'Merci pour votre confiance {client} ! N\'hésitez pas à nous recontacter. Bonne journée !',category:'suivi'},
    {id:'t6',name:'Relance',text:'Bonjour {client}, nous faisons suite à notre dernier échange. Avez-vous eu le temps de réfléchir à notre proposition ?',category:'prospection'},
  ];

  // Speed dial state
  const [phoneSpeedDial, setPhoneSpeedDial] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-speedDial-"+collab.id)||"{}"); } catch { return {}; } });

  // Dialer minimized toggle
  const [phoneDialerMinimized, setPhoneDialerMinimized] = useState(false);

  // Toolbar order persistence (drag-and-drop reorder)
  const [phoneToolbarOrder, setPhoneToolbarOrder] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-phone-toolbar-order-"+collab.id)||"null"); } catch { return null; } });
  const [phoneToolbarDragIdx, setPhoneToolbarDragIdx] = useState(null);
  const [phoneToolbarDragOverIdx, setPhoneToolbarDragOverIdx] = useState(null);

  // Collapsible left/right panels
  const [phoneLeftCollapsed, setPhoneLeftCollapsed] = useState(() => { try { return localStorage.getItem("c360-phone-left-collapsed-"+collab.id)==="1"; } catch { return false; } });
  const [phoneRightCollapsed, setPhoneRightCollapsed] = useState(() => { try { return localStorage.getItem("c360-phone-right-collapsed-"+collab.id)==="1"; } catch { return false; } });

  // Call quality keywords detector
  const CALL_KEYWORDS = {
    positive: ['excellent','parfait','merci','super','génial','formidable','satisfait','content','ravi','bravo'],
    negative: ['problème','réclamation','insatisfait','déçu','plainte','erreur','retard','annuler','rembourser','inacceptable'],
    action: ['rendez-vous','devis','contrat','signer','commander','acheter','réserver','confirmer','planifier','payer'],
    competitor: ['concurrent','autre prestataire','moins cher','ailleurs','comparé','offre concurrente'],
  };

  // Check streak on mount
  useEffect(() => {
    if(!isModuleOn('gamification')) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now()-86400000).toISOString().split('T')[0];
    if(phoneStreak.lastDate === todayStr) return;
    const todayCalls = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(l=>l.createdAt?.startsWith(todayStr)).length;
    if(todayCalls > 0 && phoneStreak.lastDate !== todayStr) {
      const newCount = phoneStreak.lastDate === yesterdayStr ? phoneStreak.count + 1 : 1;
      const ns = {count:newCount, lastDate:todayStr};
      setPhoneStreak(ns);
      try{localStorage.setItem("c360-phone-streak-"+collab.id,JSON.stringify(ns))}catch(e){}
      // Check badges
      const newBadges = [...phoneBadges];
      if(newCount >= 3 && !newBadges.includes('streak3')) { newBadges.push('streak3'); showNotif('🏅 Badge: 3 jours consécutifs !'); }
      if(newCount >= 7 && !newBadges.includes('streak7')) { newBadges.push('streak7'); showNotif('🏆 Badge: 7 jours consécutifs !'); }
      if(newCount >= 30 && !newBadges.includes('streak30')) { newBadges.push('streak30'); showNotif('👑 Badge: 30 jours consécutifs !'); }
      const totalCalls = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).length;
      if(totalCalls >= 100 && !newBadges.includes('calls100')) { newBadges.push('calls100'); showNotif('📞 Badge: 100 appels !'); }
      if(totalCalls >= 500 && !newBadges.includes('calls500')) { newBadges.push('calls500'); showNotif('🔥 Badge: 500 appels !'); }
      if(Object.keys((typeof phoneCallAnalyses!=='undefined'?phoneCallAnalyses:null)).length >= 10 && !newBadges.includes('ai10')) { newBadges.push('ai10'); showNotif('🤖 Badge: 10 analyses IA !'); }
      if(newBadges.length !== phoneBadges.length) { setPhoneBadges(newBadges); try{localStorage.setItem("c360-phone-badges-"+collab.id,JSON.stringify(newBadges))}catch(e){} }
    }
  }, [voipCallLogs, phoneModules]);

  // Toggle helpers
  const togglePhoneDND = () => { const v=!phoneDND; setPhoneDND(v); localStorage.setItem("c360-phone-dnd-"+collab.id,v?"1":"0"); showNotif(v?"Ne pas déranger activé 🔇":"Mode normal"); };
  const togglePhoneAutoSMS = () => { const v=!phoneAutoSMS; setPhoneAutoSMS(v); localStorage.setItem("c360-phone-autosms-"+collab.id,v?"1":"0"); showNotif(v?"SMS auto manqués activé":"SMS auto désactivé"); };
  const togglePhoneLeftPanel = () => { const v=!phoneLeftCollapsed; setPhoneLeftCollapsed(v); localStorage.setItem("c360-phone-left-collapsed-"+collab.id,v?"1":"0"); };
  const togglePhoneRightPanel = () => { const v=!phoneRightCollapsed; setPhoneRightCollapsed(v); localStorage.setItem("c360-phone-right-collapsed-"+collab.id,v?"1":"0"); };

  const savePhoneDisposition = (callId, code) => {
    setPhoneDispositions(prev => { const n={...prev,[callId]:code}; localStorage.setItem("c360-phone-dispositions-"+collab.id,JSON.stringify(n)); return n; });
  };

  // V1.8.26 — Click outside Pipeline Live : ferme panneau droit / sidebar gauche
  // sur clic background. Ignore boutons, inputs, cartes, panneau lui-même, zones taggées.
  // Active uniquement sur Pipeline Live (portalTab='phone' + phoneSubTab='pipeline').
  // mousedown plutôt que click pour fire avant les onClick existants (no conflict).
  const _pipeLiveActive = portalTab === 'phone' && phoneSubTab === 'pipeline';

  useEffect(() => {
    if (!pipelineRightContact) return;
    if (!_pipeLiveActive) return;
    const handler = (e) => {
      const t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      // Zones où le clic NE doit PAS fermer le panneau droit
      if (t.closest('[data-pipe-right-panel]')) return;
      if (t.closest('[data-pipe-card]')) return;
      if (t.closest('[data-pipe-keep]')) return;
      if (t.closest('button, input, select, textarea, a, [role="button"]')) return;
      // Évite les modals overlay (RDV, V7Transfer, BookingDetail, etc.)
      if (t.closest('[role="dialog"]') || t.closest('.modal') || t.closest('[data-modal]')) return;
      setPipelineRightContact(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pipelineRightContact, _pipeLiveActive]);

  // V1.8.26.1 — Auto-close sidebar gauche RETIRÉ (MH feedback) :
  // la sidebar gauche reste contrôlée uniquement par son toggle/barrette dédiée.
  // Le clic vide ne ferme QUE le panneau droit, jamais la sidebar gauche.

  // V1.8.22 Phase B — Refresh global après succès booking (contacts + bookings depuis DB)
  // V1.8.25 — Resync aussi pipelineRightContact + selectedCrmContact pour éviter désync
  // panneau droit après refresh (la référence locale pointait sur l'ancien objet contact).
  // Source unique = backend, pas d'état optimiste seul. Idempotent, fail-safe.
  const _scheduleGlobalRefresh = async () => {
    try {
      const [_c, _b] = await Promise.all([
        api('/api/data/contacts'),
        api('/api/bookings'),
      ]);
      if (Array.isArray(_c)) {
        setContacts(_c);
        // V1.8.25 — Resync les pointeurs UI critiques avec la version backend fraîche
        if (typeof setPipelineRightContact === 'function') {
          setPipelineRightContact(prev => {
            if (!prev?.id) return prev;
            const fresh = _c.find(x => x.id === prev.id);
            return fresh || prev;
          });
        }
        if (typeof setSelectedCrmContact === 'function') {
          setSelectedCrmContact(prev => {
            if (!prev?.id) return prev;
            const fresh = _c.find(x => x.id === prev.id);
            return fresh || prev;
          });
        }
      }
      if (Array.isArray(_b)) setBookings(_b);
    } catch (e) {
      console.warn('[GLOBAL REFRESH] failed:', e?.message || e);
    }
  };

  const addScheduledCall = () => {
    if(!phoneScheduleForm.number&&!phoneScheduleForm.contactId) return false;

    // V1.8.22.1 — Garde-fou anti-temp-ID : refuser tout contactId qui ne matche pas
    // le pattern backend `ct_<ts>_<random>`. Empêche définitivement les bookings
    // orphelins liés à un ID frontend temporaire (race condition historique).
    if (phoneScheduleForm.contactId) {
      const _id = phoneScheduleForm.contactId;
      const _isBackendId = /^ct_\d+_[a-z0-9]+$/i.test(_id);
      const _isLegacyId = /^c\d{10,}$/i.test(_id) || /^ct\d{10,}/.test(_id);
      // Backend pattern OK. Legacy patterns (anciens contacts) acceptés s'ils existent en state.
      if (!_isBackendId && _isLegacyId) {
        const _exists = (contacts||[]).some(c => c.id === _id);
        if (!_exists) {
          console.error('[BOOKING GUARD] contactId temp ou inconnu — refus création RDV:', _id);
          showNotif('Contact non synchronisé avec la base — fermez puis rouvrez la modal', 'danger');
          setPhoneScheduleForm(p=>({...p,_submitting:false,_error:'Contact non synchronisé — réessayez'}));
          return false;
        }
      }
    }

    // Mode booking : creer un vrai RDV + deplacer en rdv_programme
    if(phoneScheduleForm._bookingMode) {
      const f = phoneScheduleForm;
      // V1.7.4 — guard: block booking if contact is still pending server reconciliation
      const _pendCt = f.contactId ? (contacts||[]).find(c => c.id === f.contactId) : null;
      if (_pendCt && _pendCt._pending) { showNotif('Contact en cours de création — réessayez dans quelques secondes','danger'); return false; }
      const setBookErr=(msg)=>{setPhoneScheduleForm(p=>({...p,_error:msg,_submitting:false}));showNotif(msg,'danger');};
      console.log('[BOOKING DEBUG] form:', JSON.stringify({date:f.date,time:f.time,contactId:f.contactId,number:f.number,calendarId:f.calendarId,rdv_category:f.rdv_category,duration:f.duration,_bookingMode:f._bookingMode,_editBookingId:f._editBookingId}));
      if(!f.date||!f.time) { console.log('[BOOKING BLOCK] missing date/time'); setBookErr('Choisissez une date et heure'); return false; }
      if(f.date < new Date().toISOString().split('T')[0]) { console.log('[BOOKING BLOCK] date in past'); setBookErr('Impossible de programmer un RDV dans le passé'); return false; }

      // Mode edit: modifier un RDV existant
      if(f._editBookingId) {
        const updates = {date:f.date, time:f.time, duration:f.duration||30, notes:f.notes||'', rdv_category:f.rdv_category||'', rdv_subcategory:f.rdv_subcategory||''};
        if(f.calendarId) updates.calendarId = f.calendarId;
        setBookings(p=>p.map(b=>b.id===f._editBookingId?{...b,...updates}:b));
        api('/api/bookings/'+f._editBookingId, {method:'PUT', body:updates}).catch(()=>showNotif('Erreur modification RDV','danger'));
        if(f.contactId) handleCollabUpdateContact(f.contactId, {next_rdv_date:f.date, next_rdv_booking_id:f._editBookingId});
        setPhoneShowScheduleModal(false);
        setPhoneScheduleForm({contactId:'',number:'',date:'',time:'',notes:'',collaboratorId:collab.id});
        showNotif('RDV modifié — '+formatDateTime(f.date, f.time),'success');
        return true;
      }

      // Auto-annuler les bookings PASSÉS confirmés du même contact (nettoyage silencieux)
      const nowMs = Date.now();
      const todayISO = new Date().toISOString().split('T')[0];
      const pastRdvs = (bookings||[]).filter(b=>b.contactId===f.contactId && b.status==='confirmed' && new Date(b.date+'T'+(b.time||'00:00')).getTime()+(b.duration||30)*60000 < nowMs);
      if(pastRdvs.length>0) {
        pastRdvs.forEach(oldBk=>{
          setBookings(p=>p.map(b=>b.id===oldBk.id?{...b,status:'cancelled'}:b));
          api('/api/bookings/'+oldBk.id, {method:'PUT', body:{status:'cancelled'}}).catch(()=>{});
        });
      }
      // Verifier si le contact a deja des RDV actifs (futurs uniquement)
      const existingRdvs = (bookings||[]).filter(b=>b.contactId===f.contactId && b.status==='confirmed' && new Date(b.date+'T'+(b.time||'00:00')).getTime()+(b.duration||30)*60000 >= nowMs);
      let cancelOld = false;
      if(existingRdvs.length>0) {
        const rdvList = existingRdvs.map(b=>b.date+' a '+(b.time||'?')).join(', ');
        const choice = confirm('Ce lead a deja '+existingRdvs.length+' RDV : '+rdvList+'.\n\n→ OK = Ajouter un nouveau RDV (garder les existants)\n→ Annuler = Deplacer (annuler les anciens)');
        if(!choice) cancelOld = true;
      }

      // Annuler les anciens RDV si deplacement
      if(cancelOld) {
        existingRdvs.forEach(oldBk=>{
          setBookings(p=>p.map(b=>b.id===oldBk.id?{...b,status:'cancelled'}:b));
          api('/api/bookings/'+oldBk.id, {method:'PUT', body:{status:'cancelled'}}).catch(()=>{});
        });
      }

      // ── SECURITE: verifier que le creneau + durée + buffer ne chevauche aucun RDV existant ──
      const bufferMs = ((typeof availBuffer!=='undefined'?availBuffer:null)||0)*60000;
      const newStart = new Date(f.date+'T'+f.time).getTime();
      const newEnd = newStart + (f.duration||30)*60000;
      const conflictBooking = (bookings||[]).find(b=>{
        if(b.collaboratorId!==(f.collaboratorId||collab.id) || b.date!==f.date || b.status!=='confirmed') return false;
        if(cancelOld && existingRdvs.some(er=>er.id===b.id)) return false; // ignore les RDV qu'on va annuler
        const bStart = new Date(b.date+'T'+(b.time||'00:00')).getTime() - bufferMs;
        const bEnd = bStart + (b.duration||30)*60000 + bufferMs*2;
        return newStart < bEnd && newEnd > bStart; // chevauchement avec buffer
      });
      const conflictGCal = (googleEventsProp||[]).filter(ge=>ge.collaboratorId===(f.collaboratorId||collab.id)).find(ge=>{
        try{
          const st=new Date(ge.start||ge.startDate).getTime() - bufferMs;
          const en=new Date(ge.end||ge.endDate||st+3600000).getTime() + bufferMs;
          return st < newEnd && en > newStart;
        }catch{return false;}
      });
      if(conflictBooking) {
        console.log('[BOOKING BLOCK] conflict with booking:', conflictBooking.id, conflictBooking.time);
        setBookErr('Ce créneau chevauche un RDV existant ('+conflictBooking.time+') ! Choisissez un autre horaire.');
        return false;
      }
      if(conflictGCal) {
        console.log('[BOOKING BLOCK] conflict with GCal event');
        setBookErr('Ce créneau chevauche un événement Google Calendar ! Choisissez un autre horaire.');
        return false;
      }

      const bkId = 'bk'+Date.now();
      const ct = (contacts||[]).find(c=>c.id===f.contactId);
      const defaultCal = (calendars||[]).find(c=>{try{const collabs=Array.isArray(c.collaborators)?c.collaborators:JSON.parse(c.collaborators_json||'[]');return collabs.includes(collab.id);}catch{return false;}}) || (calendars||[])[0];
      const calId = f.calendarId||defaultCal?.id||'';
      // SECURITE: ne pas créer de booking sans calendarId — sinon invisible dans l'agenda
      console.log('[BOOKING DEBUG] calId:', calId, 'calendars:', calendars?.length, 'collab.id:', collab.id, 'defaultCal:', defaultCal?.id);
      if(!calId) { setBookErr('Aucun calendrier trouvé pour votre compte — contactez votre admin'); console.error('[BOOKING BLOCK] No calendarId found'); return false; }
      const prevStage = ct?.pipeline_stage||'nouveau';
      const bk = {id:bkId, companyId:company.id, collaboratorId:f.collaboratorId||collab.id, agendaOwnerId:f.collaboratorId||collab.id, bookedByCollaboratorId:collab.id, calendarId:calId, contactId:f.contactId, visitorName:ct?.name||f.contactName||'', visitorEmail:ct?.email||'', visitorPhone:f.number||ct?.phone||'', date:f.date, time:f.time, duration:f.duration||30, status:'confirmed', source:'pipeline', notes:f.notes||'RDV depuis pipeline', rdv_category:f.rdv_category||'', rdv_subcategory:f.rdv_subcategory||''};
      // Ajouter immédiatement au state local (optimistic)
      setBookings(p=>[...p,bk]);
      // Déplacer en rdv_programme (optimistic)
      if(prevStage!=='rdv_programme') handlePipelineStageChange(f.contactId, 'rdv_programme', (cancelOld?'RDV deplace':'Nouveau RDV')+' le '+f.date+' a '+f.time);
      // Mettre à jour le contact avec la date du prochain RDV (optimistic)
      handleCollabUpdateContact(f.contactId, {next_rdv_date:f.date, next_rdv_booking_id:bkId, rdv_status:'programme', _source:'booking', _origin:'rdv_creation'});
      // REGLE SECURITE: envoyer au backend — SI ECHEC, rollback complet (booking + contact)
      api('/api/bookings',{method:'POST',body:bk}).then(r => {
        if(r && r.error) throw new Error(r.error);
        console.log('[BOOKING OK]', bk.id, f.date, f.time);
        // V1.8.24.4 — Consommer directement booking + contact retournés (cf. audit §4.10).
        // Plus de refetch séparé race-prone : le backend retourne le contact post-side-effects
        // (autoPipelineAdvance, totalBookings, next_rdv_date) dans la réponse POST.
        if (r?.booking?.id) setBookings(p => p.map(b => b.id === r.booking.id ? { ...b, ...r.booking } : b));
        if (r?.contact?.id) setContacts(p => p.map(c => c.id === r.contact.id ? r.contact : c));
        // V1.8.1 — envoi confirmation email au visiteur si case cochée et email présent
        if ((f._sendConfirmation !== false) && (ct?.email || f._newEmail)) {
          const _notifBk = { ...bk, visitorEmail: ct?.email || f._newEmail || '' };
          sendNotification('booking-confirmed', buildNotifyPayload(_notifBk, calendars, collabs, company))
            .then(_nr => {
              if (_nr?.email?.success) showNotif('📧 Email de confirmation envoyé', 'success');
              else showNotif("RDV créé, mais l'email de confirmation n'a pas pu être envoyé", 'warning');
            })
            .catch(() => showNotif("RDV créé, mais l'email de confirmation n'a pas pu être envoyé", 'warning'));
        }
      }).catch((err)=>{
        console.error('[BOOKING FAIL]', err);
        showNotif('Erreur création RDV : '+(err?.message||'échec serveur')+' — annulation en cours','danger');
        // Rollback booking
        setBookings(p=>p.filter(b=>b.id!==bkId));
        // Rollback contact: remettre le stage précédent + vider le booking fantôme
        handleCollabUpdateContact(f.contactId, {pipeline_stage:prevStage, next_rdv_date:'', next_rdv_booking_id:'', rdv_status:''});
      });
      setPhoneShowScheduleModal(false);
      setPhoneScheduleForm({contactId:'',number:'',date:'',time:'',notes:'',collaboratorId:collab.id});
      showNotif((cancelOld?'RDV déplacé':'RDV programmé')+' le '+formatDateTime(f.date, f.time)+' ✅','success');
      return true;
    }

    // Mode rappel classique
    const sc = {...phoneScheduleForm, id:"sc"+Date.now()};
    setPhoneScheduledCalls(prev => { const n=[...prev,sc]; localStorage.setItem("c360-phone-scheduled-"+collab.id,JSON.stringify(n)); return n; });
    setPhoneShowScheduleModal(false);
    setPhoneScheduleForm({contactId:'',number:'',date:'',time:'',notes:'',collaboratorId:collab.id});
    showNotif("Rappel programmé ✓");
    return true;
  };

  const removeScheduledCall = (id) => {
    setPhoneScheduledCalls(prev => { const n=prev.filter(s=>s.id!==id); localStorage.setItem("c360-phone-scheduled-"+collab.id,JSON.stringify(n)); return n; });
  };

  const addToBlacklist = (number) => {
    if(!number||(typeof phoneBlacklist!=='undefined'?phoneBlacklist:{}).includes(number)) return;
    setPhoneBlacklist(prev => { const n=[...prev,number]; localStorage.setItem("c360-phone-blacklist-"+collab.id,JSON.stringify(n)); return n; });
    showNotif("Numéro bloqué 🚫");
  };

  const removeFromBlacklist = (number) => {
    setPhoneBlacklist(prev => { const n=prev.filter(x=>x!==number); localStorage.setItem("c360-phone-blacklist-"+collab.id,JSON.stringify(n)); return n; });
  };

  // Auto-format French phone numbers (9 digits → +33, 10 digits 0X → +33X)
  const autoFormatFR = (num) => {
    let clean = (num||'').replace(/[^\d+]/g,'');
    if (clean.startsWith('0') && clean.length === 10) return '+33'+clean.substring(1);
    if (!clean.startsWith('+') && !clean.startsWith('0') && clean.length === 9) return '+33'+clean;
    if (clean.startsWith('33') && !clean.startsWith('+') && clean.length >= 11) return '+'+clean;
    return clean || num;
  };

  // Pre-fill keypad with a number (for click-to-call from history/pipeline/contacts)
  const prefillKeypad = (number) => {
    setPhoneDialNumber(autoFormatFR(number) || '');
    setPhoneDialerMinimized(false);
    setSelectedCrmContact(null);
    if (portalTab !== 'phone') _setPortalTab('phone');
  };

  // Start a real VoIP call (or fallback to tel: if not configured)
  const startPhoneCall = (number, contactId) => {
    number = autoFormatFR(number);
    if((typeof phoneDND!=='undefined'?phoneDND:null)) { showNotif("Mode Ne pas déranger actif","danger"); return; }
    if((typeof phoneBlacklist!=='undefined'?phoneBlacklist:{}).includes(number)) { showNotif("Numéro bloqué","danger"); return; }
    // Calling hours: SAV/service calls are allowed anytime (no restriction)
    // Find contact object for VoIP call logging
    const ct = contacts.find(c => c.id === contactId) || null;
    // V1.9 UX FIX bug 1 — Toujours déplier le panneau droit dès qu'un appel commence (dialer manuel inclus)
    if (phoneRightCollapsed) { setPhoneRightCollapsed(false); try { localStorage.setItem("c360-phone-right-collapsed-"+collab.id,"0"); } catch {} }
    // Auto-ouvrir la fiche contact dans le panneau droit + onglet IA Copilot (uniquement si contact lié)
    if (ct) {
      setPipelineRightContact(ct);
      setPhoneRightTab('ia');
      api('/api/data/pipeline-history?contactId='+ct.id).then(h=>setPipelinePopupHistory(h||[])).catch(()=>setPipelinePopupHistory([]));
    }
    setPhoneDialNumber(number);
    setPhoneActiveCall({contactId, number, startTime:Date.now(), muted:false, speaker:false, onHold:false});
    setPhoneCallTimer(0);
    setPhoneLiveTranscript([]);
    setPhoneLiveSentiment("neutral");
    setPhoneLiveRdvSuggestion(null);
    // Garder les suggestions non-traitées du précédent appel avec statut "review"
    setPhoneLiveSuggestions(prev => {
      const kept = prev.filter(s => s.status === 'pending').map(s => ({ ...s, status: 'review' }));
      return kept; // suggestions traitées (done/dismissed) supprimées, pending → review
    });
    phoneLiveDetectRef.current = { lastByType: {} };
    // Auto-switch to IA tab during call if copilot enabled
    if (collab.ai_copilot_enabled) setPhoneRightTab('ia');
    // Mode Pilote IA: fetch live coaching if AI Copilot is enabled
    setPhoneCopilotLiveData(null);
    setPhoneCopilotLiveLoading(false);
    setPhoneCopilotChecklist({});
    // Auto-detect call context
    setPhoneCallContext(null);
    setPhoneRecommendedActions([]);
    if (collab.ai_copilot_enabled) {
      // Auto-detect context
      api('/api/call-context/auto-detect', {
        method: 'POST',
        body: { companyId: company.id, collaboratorId: collab.id, contactId: contactId || null, direction: 'outbound' }
      }).then(ctx => { if (ctx) setPhoneCallContext(ctx); }).catch(() => {});

      setPhoneCopilotLiveLoading(true);
      api('/api/ai-copilot/live-coaching', {
        method: 'POST',
        body: { collaboratorId: collab.id, contactId: contactId || null, companyId: company.id }
      }).then(res => {
        if (res && res.success) setPhoneCopilotLiveData(res);
        else console.warn('[MODE PILOTE]', res?.error || 'Failed to load coaching');
        setPhoneCopilotLiveLoading(false);
      }).catch(err => { console.error('[MODE PILOTE]', err); setPhoneCopilotLiveLoading(false); });
    }
    // ── REAL VOIP: use Twilio Device if available ──
    if (voipDeviceRef.current) {
      startVoipCall(number, ct);
    } else if ((typeof voipConfigured!=='undefined'?voipConfigured:null)) {
      // Device not ready yet — show message, don't fake the call
      showNotif('VoIP en cours d\'initialisation, réessayez dans quelques secondes...','warning');
      setPhoneActiveCall(null);
      setPhoneCallTimer(0);
    } else {
      window.open('tel:'+number);
    }
  };

  const endPhoneCall = () => {
    if((typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)) {
      const duration = (typeof phoneCallTimer!=='undefined'?phoneCallTimer:null);
      const endedAt = new Date().toISOString();
      // Disconnect real VoIP call if active
      if (voipCallRef.current) {
        try { voipCallRef.current.disconnect(); } catch(e) {}
        voipCallRef.current = null;
        setVoipState('idle');
        // Update call log with duration
        if ((typeof voipCurrentCallLogId!=='undefined'?voipCurrentCallLogId:null)) {
          api(`/api/voip/calls/${voipCurrentCallLogId}`, { method:'PUT', body:{ duration, status:'completed', endedAt } });
          // Update local state immediately
          setVoipCallLogs(prev => prev.map(cl => cl.id === (typeof voipCurrentCallLogId!=='undefined'?voipCurrentCallLogId:null) ? { ...cl, status:'completed', duration, endedAt } : cl));
          setVoipCurrentCallLogId(null);
        }
        // Refresh full call logs from server
        setTimeout(() => {
          api(`/api/voip/calls?companyId=${company.id}`).then(d => { if(Array.isArray(d)) setVoipCallLogs(d); }).catch(()=>{});
        }, 500);
        // ── AUTO AI ANALYSIS post-appel (si copilot active + appel > 15s) ──
        if (collab.ai_copilot_enabled && duration >= 15 && (typeof voipCurrentCallLogId!=='undefined'?voipCurrentCallLogId:null)) {
          const callIdForAnalysis = (typeof voipCurrentCallLogId!=='undefined'?voipCurrentCallLogId:null);
          setTimeout(() => {
            console.log('[AI COPILOT] Auto-analyzing call', callIdForAnalysis, '('+duration+'s)');
            api(`/api/ai-copilot/analyze/${callIdForAnalysis}`, { method:'POST', body:{ companyId:company.id, collaboratorId:collab.id } })
              .then(r => {
                if(r?.success) {
                  showNotif('Analyse IA terminée — voir onglet IA Copilot','success');
                  setPhoneCallAnalyses(prev => ({...prev, [callIdForAnalysis]: r}));
                  try { localStorage.setItem('c360-phone-analyses-'+collab.id, JSON.stringify({...phoneCallAnalyses, [callIdForAnalysis]: r})); } catch {}
                  setPhoneRightTab('ia'); // Auto-switch to IA tab to show analysis
                }
              })
              .catch(err => console.error('[AI COPILOT] Analysis failed:', err));
          }, 2000);
        }
      }
      // ── POST-CALL NRP CHECK ──
      const callContact = (typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).contactId ? (contacts||[]).find(c=>c.id===(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).contactId) : null;
      const calledNumber = (typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).number;
      // Also find contact by phone if not by ID
      const ct = callContact || (contacts||[]).find(c=>c.phone && calledNumber && c.phone.replace(/[^\d]/g,'').slice(-9) === calledNumber.replace(/[^\d]/g,'').slice(-9));

      if (ct) {
        // Show post-call CTA
        setTimeout(() => {
          const isNrp = ct.pipeline_stage === 'nrp';
          const nrpCount = (()=>{ try { return JSON.parse(ct.nrp_followups_json||'[]').filter(f=>f.done).length; } catch { return 0; } })();

          if (isNrp || duration < 10) {
            // NRP or short call → NRP modal
            const followups = (()=>{ try { return JSON.parse(ct.nrp_followups_json||'[]'); } catch { return []; } })();
            setNrpPostCallModal({ contact: ct, nrpCount, followups, isShortCall: !isNrp && duration < 10, duration, isNrp });
            setNrpModalShowStages(false);
            setNrpModalShowHistory(false);
            // SMS AUTO NRP
            try {
              const nrpSmsOn = localStorage.getItem('c360-phone-autosms-nrp-'+collab.id)==='1';
              if (nrpSmsOn && calledNumber) {
                const nrpSmsText = localStorage.getItem('c360-phone-autosms-nrp-text-'+collab.id) || "Bonjour, j'ai essayé de vous joindre. N'hésitez pas à me rappeler. Cordialement.";
                const toPhone = calledNumber.startsWith('+') ? calledNumber : '+33'+calledNumber.replace(/^0/,'').replace(/\s/g,'');
                api('/api/sms/send', {method:'POST', body:{to:toPhone, message:nrpSmsText, companyId:company.id, collaboratorId:collab.id, contactId:ct?.id||''}}).then(r=>{
                  if(r?.success||r?.messageId) showNotif('SMS NRP auto envoyé ✓');
                }).catch(()=>{});
              }
            } catch {}
          } else if (duration >= 10) {
            // ── APPEL DECROCHE >10s → Popup résultat d'appel obligatoire ──
            setPostCallResultModal({ contact: ct, duration, calledNumber });
          }
        }, 500);
      }

      // Sauvegarder la transcription live en DB (persistante)
      if ((typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:{}).length > 0 && (typeof voipCurrentCallLogId!=='undefined'?voipCurrentCallLogId:null)) {
        const liveSegs = (typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:{}).map(t => ({ speaker: t.speaker || (t.isAgent ? 'agent' : 'contact'), text: t.text, timestamp: t.timestamp || '' }));
        const liveText = liveSegs.map(s => `[${s.speaker}] ${s.text}`).join('\n');
        api('/api/voip/save-live-transcript', { method: 'POST', body: { callLogId: (typeof voipCurrentCallLogId!=='undefined'?voipCurrentCallLogId:null), segments: liveSegs, fullText: liveText } }).catch(e => console.error('[LIVE TRANSCRIPT SAVE]', e));
      }
      // Sauvegarder la session live avant de vider (mémoire post-appel)
      setPhoneLastCallSession({
        transcript: [...phoneLiveTranscript],
        suggestions: [...phoneLiveSuggestions],
        liveAnalysis: (typeof phoneLiveAnalysis!=='undefined'?phoneLiveAnalysis:null) ? {...phoneLiveAnalysis} : null,
        coachingData: (typeof phoneCopilotLiveData!=='undefined'?phoneCopilotLiveData:null) ? {...phoneCopilotLiveData} : null,
        contactId: (typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?.contactId,
        number: (typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)?.number || (typeof phoneDialNumber!=='undefined'?phoneDialNumber:null),
        duration: (typeof phoneCallTimer!=='undefined'?phoneCallTimer:null),
        endedAt: new Date().toISOString(),
      });

      setPhonePostCallModal("live_"+Date.now());
      setPhoneActiveCall(null);
      setPhoneCallTimer(0);
      setPhoneDialNumber('');
      // Clear Mode Pilote
      setPhoneCopilotLiveData(null);
      setPhoneCopilotLiveLoading(false);
      setPhoneCopilotChecklist({});
      // V1.9 UX FIX — Reset Cockpit states pour éviter qu'ils restent "bloqués" sur les appels suivants
      setCockpitOpen(false);
      setCockpitMinimized(false);
    }
  };

  // ── AUTO-DIALER PIPELINE — appel automatique colonne par colonne ──
  const startAutoDialer = (stageId, stageContacts) => {
    const withPhone = stageContacts.filter(c => c.phone && c.phone.length > 4);
    if (withPhone.length === 0) { showNotif('Aucun contact avec téléphone dans cette colonne','warning'); return; }
    if ((typeof voipCredits!=='undefined'?voipCredits:null) <= 0) { showNotif('Crédits VoIP insuffisants','danger'); return; }
    if ((typeof phoneDND!=='undefined'?phoneDND:null)) { showNotif('Mode Ne pas déranger actif','danger'); return; }
    const list = withPhone.map(c => ({ id: c.id, name: c.name, phone: c.phone }));
    setPdContactList(list);
    setPdStageId(stageId);
    setPdCurrentIdx(0);
    setPdResults({});
    setPdStatus('running');
    showNotif('Auto-Dialer lancé — '+list.length+' contacts');
    // Call first contact
    setTimeout(() => startPhoneCall(list[0].phone, list[0].id), 500);
  };

  const autoDialerNext = () => {
    setPdCurrentIdx(prev => {
      const nextIdx = prev + 1;
      if (nextIdx >= (typeof pdContactList!=='undefined'?pdContactList:{}).length) {
        setPdStatus('done');
        showNotif('Auto-Dialer terminé — '+(typeof pdContactList!=='undefined'?pdContactList:{}).length+' appels','success');
        return prev;
      }
      const next = (typeof pdContactList!=='undefined'?pdContactList:null)[nextIdx];
      if (next && next.phone) {
        setTimeout(() => {
          startPhoneCall(next.phone, next.id);
          // Ring timeout: auto-hangup if still ringing after configured seconds
          clearTimeout(pdRingTimeoutRef.current);
          const ringTimeout = parseInt(localStorage.getItem('c360-pd-ring-timeout-'+collab.id)||'15', 10) * 1000;
          pdRingTimeoutRef.current = setTimeout(() => {
            // Use ref to get CURRENT voipState (not stale closure)
            if (voipCallRef.current && voipStateRef.current !== 'in-call') {
              console.log('[POWER DIALER] Ring timeout — hanging up after', ringTimeout/1000, 's');
              endPhoneCall();
            }
          }, ringTimeout);
        }, 500);
      }
      return nextIdx;
    });
  };

  const stopAutoDialer = () => {
    setPdStatus('idle');
    setPdStageId(null);
    setPdContactList([]);
    setPdCurrentIdx(0);
    clearTimeout(pdTimerRef.current);
    clearTimeout(pdRingTimeoutRef.current);
    showNotif('Auto-Dialer arrêté');
  };

  // Auto-detect call end → schedule next call
  useEffect(() => {
    const prev = pdPrevVoipState.current;
    pdPrevVoipState.current = (typeof voipState!=='undefined'?voipState:null);
    // Transition from active call to idle = call ended
    // If call was answered, cancel ring timeout
    if ((typeof voipState!=='undefined'?voipState:null) === 'in-call' && pdRingTimeoutRef.current) { clearTimeout(pdRingTimeoutRef.current); pdRingTimeoutRef.current = null; }
    if ((prev === 'in-call' || prev === 'ringing' || prev === 'connecting') && (typeof voipState!=='undefined'?voipState:null) === 'idle' && (typeof pdStatus!=='undefined'?pdStatus:null) === 'running' && (typeof pdContactList!=='undefined'?pdContactList:{}).length > 0) {
      // Record result for current contact
      const currentContact = (typeof pdContactList!=='undefined'?pdContactList:null)[pdCurrentIdx];
      if (currentContact) {
        const duration = (typeof phoneCallTimer!=='undefined'?phoneCallTimer:null);
        setPdResults(prev => ({ ...prev, [currentContact.id]: duration < 10 ? 'nrp' : 'contacted' }));
      }
      // Wait 3s then call next
      clearTimeout(pdTimerRef.current);
      pdTimerRef.current = setTimeout(() => {
        if ((typeof pdStatus!=='undefined'?pdStatus:null) === 'running') autoDialerNext();
      }, 3000);
    }
  }, [voipState, pdStatus]);

  // Call timer effect
  useEffect(() => {
    if(!(typeof phoneActiveCall!=='undefined'?phoneActiveCall:null)) return;
    const iv = setInterval(()=>setPhoneCallTimer(t=>t+1), 1000);
    return ()=>clearInterval(iv);
  }, [phoneActiveCall]);

  // Today's call count for daily goal
  const todayCallCount = ((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(c=>c.createdAt?.startsWith(new Date().toISOString().split('T')[0])).length;

  // Google Calendar URL builder
  const toGoogleCalUrl = (booking) => {
    const cal = calendars.find(c => c.id === booking.calendarId);
    const [y,m,d] = booking.date.split("-");
    const [hh,mm] = booking.time.split(":");
    const start = new Date(y, m-1, d, hh, mm);
    const end = new Date(start.getTime() + (booking.duration||30)*60000);
    const fmt = (dt) => dt.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
    const title = encodeURIComponent(`${cal?.name||"RDV"} — ${booking.visitorName}`);
    const details = encodeURIComponent(`Visiteur: ${booking.visitorName}\nEmail: ${booking.visitorEmail}\n${booking.notes||""}`);
    const location = encodeURIComponent(cal?.location||"");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${location}`;
  };

  // Export all bookings as .ics file for Google Calendar sync (timezone-aware)
  const exportICS = () => {
    const confirmed = myBookings.filter(b => b.status !== "cancelled");
    if (!confirmed.length) { showNotif("Aucun RDV à synchroniser", "warning"); return; }
    const pad = (n) => String(n).padStart(2, "0");
    const fmtDtRaw = (y,mo,d,h,mi) => `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(mi)}00`;
    const nowDt = new Date();
    const nowStamp = `${nowDt.getUTCFullYear()}${pad(nowDt.getUTCMonth()+1)}${pad(nowDt.getUTCDate())}T${pad(nowDt.getUTCHours())}${pad(nowDt.getUTCMinutes())}${pad(nowDt.getUTCSeconds())}Z`;
    // Collaborator timezone (from collab object or company default)
    const collabTz = collab.timezone || company?.timezone || 'Europe/Paris';
    let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Calendar360//FR\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n";
    ics += `X-WR-CALNAME:Calendar360 — ${collab.name}\r\n`;
    ics += `X-WR-TIMEZONE:${collabTz}\r\n`;
    confirmed.forEach(b => {
      const cal = calendars.find(c => c.id === b.calendarId);
      const [y,mo,d] = b.date.split("-").map(Number);
      const [hh,mm] = b.time.split(":").map(Number);
      const durMin = b.duration || 30;
      const endTotalMin = hh * 60 + mm + durMin;
      const eh = Math.floor(endTotalMin / 60);
      const em = endTotalMin % 60;
      // If end crosses midnight, adjust date
      const endD = eh >= 24 ? d + 1 : d;
      const endH = eh >= 24 ? eh - 24 : eh;
      ics += "BEGIN:VEVENT\r\n";
      ics += `DTSTART;TZID=${collabTz}:${fmtDtRaw(y,mo,d,hh,mm)}\r\n`;
      ics += `DTEND;TZID=${collabTz}:${fmtDtRaw(y,mo,endD,endH,em)}\r\n`;
      ics += `DTSTAMP:${nowStamp}\r\n`;
      ics += `UID:${b.id}@calendar360.fr\r\n`;
      ics += `SUMMARY:${(cal?.name||"RDV")} — ${b.visitorName}\r\n`;
      ics += `DESCRIPTION:Visiteur: ${b.visitorName}\\nEmail: ${b.visitorEmail}${b.visitorTimezone && b.visitorTimezone !== collabTz ? '\\nFuseau visiteur: ' + b.visitorTimezone : ''}${b.notes ? "\\n"+b.notes : ""}\r\n`;
      ics += `LOCATION:${cal?.location||""}\r\n`;
      ics += `STATUS:CONFIRMED\r\n`;
      ics += "END:VEVENT\r\n";
    });
    ics += "END:VCALENDAR\r\n";
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `calendar360-${collab.name.replace(/\s+/g,"-").toLowerCase()}.ics`; a.click();
    URL.revokeObjectURL(url);
    showNotif(`${confirmed.length} RDV exportés — Importez le fichier .ics dans Google Agenda`);
  };

  const syncGoogle = async () => {
    setGoogleLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/google/sync`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ collaboratorId: collab.id }) });
      const d = await r.json();
      if (d.success) {
        showNotif(`${d.synced} RDV synchronisé(s) sur Google Agenda`);
        // Rafraîchir les événements Google pour la grille
        const initData = await api(`/api/init?companyId=${company.id}`);
        if (initData?.googleEvents && setGoogleEvents) (typeof setGoogleEvents==='function'?setGoogleEvents:function(){})(initData.googleEvents);
      }
      else showNotif(d.error || "Erreur de synchronisation", "danger");
    } catch { showNotif("Erreur de synchronisation", "danger"); }
    setGoogleLoading(false);
  };

  const showNotif = (msg, type="success") => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3000); };

  // Week dates
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay()+6)%7) + (typeof weekOffset!=='undefined'?weekOffset:null)*7);
  const weekDates = Array.from({length:7}, (_,i) => {
    const d = new Date(monday); d.setDate(monday.getDate()+i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });

  const myBookings = bookings.filter(b => b.collaboratorId === collab.id);
  const weekBookings = myBookings.filter(b => weekDates.includes(b.date) && b.status !== "cancelled");
  // Grille horaire (filtrable heures ouvrées)
  const hours = useMemo(() => {
    const result = [];
    const startH = agendaWorkHours ? 7 : 0;
    const endH = agendaWorkHours ? 21 : 24;
    for (let h = startH; h < endH; h++) {
      result.push(`${String(h).padStart(2,"0")}:00`);
      result.push(`${String(h).padStart(2,"0")}:30`);
    }
    return result;
  }, [agendaWorkHours]);
  // Helper: check if a 30-min slot is within availability
  const isAvailableSlot = (date, hour) => {
    const d = new Date(date);
    const dow = (d.getDay() + 6) % 7; // 0=Mon
    const sched = avails[collab.id]; const ua = (sched && Object.keys(sched).length > 0 ? sched : defAvail())[dow];
    if (!ua || !ua.active) return false;
    const hNum = parseInt(hour);
    const hMin = parseInt(hour.slice(3));
    const slotMin = hNum * 60 + hMin;
    return (ua.slots || []).some(s => {
      const sMin = parseInt(s.start) * 60 + parseInt(s.start.slice(3) || 0);
      const eMin = parseInt(s.end) * 60 + parseInt(s.end.slice(3) || 0);
      return slotMin >= sMin && slotMin < eMin;
    });
  };
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  // Day view
  const dayDate = selectedDay || todayStr;
  const dayBookings = (() => { const seen = new Set(); return myBookings.filter(b => { if(seen.has(b.id)) return false; seen.add(b.id); return b.date === dayDate && b.status !== "cancelled"; }).sort((a,b) => a.time.localeCompare(b.time)); })();
  // Month view
  const monthViewDate = new Date(today.getFullYear(), today.getMonth() + (typeof monthOffset!=='undefined'?monthOffset:null), 1);
  const monthYear = monthViewDate.getFullYear();
  const monthMonth = monthViewDate.getMonth();
  const firstDayOfMonth = (new Date(monthYear, monthMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(monthYear, monthMonth + 1, 0).getDate();
  const monthDays = [];
  for (let i = 0; i < firstDayOfMonth; i++) monthDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) monthDays.push(`${monthYear}-${String(monthMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);

  // ── Taux de remplissage agenda ──
  const agendaFillRate = useMemo(() => {
    let dates = [];
    if (viewMode === 'day') {
      dates = [dayDate];
    } else if (viewMode === 'week') {
      dates = weekDates;
    } else {
      // Month: toutes les dates du mois
      for (let d = 1; d <= daysInMonth; d++) {
        dates.push(`${monthYear}-${String(monthMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
      }
    }
    let totalSlots = 0;
    let bookedSlots = 0;
    const now = new Date();
    dates.forEach(date => {
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
          const hour = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
          if (isAvailableSlot(date, hour)) {
            // Ne compter que les créneaux futurs ou aujourd'hui
            const slotTime = new Date(date + 'T' + hour);
            if (slotTime >= new Date(now.toDateString())) {
              totalSlots++;
              // Vérifier si un booking occupe ce slot
              const hasBooking = myBookings.some(b => {
                if (b.date !== date || b.status === 'cancelled') return false;
                const bStart = parseInt(b.time)*60 + parseInt(b.time.slice(3)||0);
                const bEnd = bStart + (b.duration||30);
                const slotMin = h*60 + m;
                return slotMin >= bStart && slotMin < bEnd;
              });
              if (hasBooking) bookedSlots++;
            }
          }
        }
      }
    });
    const rate = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;
    const freeSlots = totalSlots - bookedSlots;
    return { totalSlots, bookedSlots, freeSlots, rate };
  }, [viewMode, dayDate, weekDates, monthYear, monthMonth, daysInMonth, myBookings, avails, collab.id]);

  const getBookingAt = (date, hour) => {
    const slotMin = parseInt(hour) * 60 + parseInt(hour.slice(3));
    const slotEndMin = slotMin + 30;
    return weekBookings.filter(b => {
      if (b.date !== date) return false;
      const bMin = parseInt(b.time) * 60 + parseInt((b.time||"").slice(3) || 0);
      const bEndMin = bMin + (b.duration || 30);
      // Un booking est visible dans un slot si les deux se chevauchent
      return bMin < slotEndMin && bEndMin > slotMin;
    });
  };

  // Google Calendar events (busy blocks)
  const myGoogleEvents = (googleEventsProp || []).filter(ge => ge.collaboratorId === collab.id);
  const getGoogleEventAt = (date, hour) => {
    const slotMin = parseInt(hour) * 60 + parseInt(hour.slice(3));
    return myGoogleEvents.filter(ge => {
      if (ge.allDay) return date >= ge.startTime.slice(0, 10) && date < ge.endTime.slice(0, 10);
      const geDate = ge.startTime.slice(0, 10);
      const geEndDate = ge.endTime.slice(0, 10);
      if (date < geDate || date > geEndDate) return false;
      const geStartMin = date === geDate ? (parseInt(ge.startTime.slice(11,13))*60 + parseInt(ge.startTime.slice(14,16))) : 0;
      const geEndMin = date === geEndDate ? (parseInt(ge.endTime.slice(11,13))*60 + parseInt(ge.endTime.slice(14,16))) : 1440;
      return slotMin >= geStartMin && slotMin < geEndMin;
    });
  };

  // V3: updateBooking avec rollback en cas d'echec
  // V1.8.24.4 — Consume booking + contact retournés par PUT + refresh global (audit §4.10)
  const updateBooking = (id, updates) => {
    const prev = bookings.find(b => b.id === id);
    setBookings(p => p.map(b => b.id === id ? {...b, ...updates} : b));
    api(`/api/bookings/${id}`, { method:"PUT", body:updates })
      .then(r => {
        if (r?.error) throw new Error(r.error);
        if (r?.booking?.id) setBookings(p => p.map(b => b.id === r.booking.id ? r.booking : b));
        if (r?.contact?.id) setContacts(p => p.map(c => c.id === r.contact.id ? r.contact : c));
        if (typeof _scheduleGlobalRefresh === 'function') _scheduleGlobalRefresh();
      })
      .catch(() => { if (prev) setBookings(p => p.map(b => b.id === id ? prev : b)); showNotif('Erreur: modification RDV non sauvegardée', 'danger'); });
  };
  // V1.6 — cascade cancel booking → contact pipeline stage + next_rdv clear
  // si c'etait le dernier RDV actif ET contact en rdv_programme, revert en contacte
  // sinon, update next_rdv_date vers le prochain RDV chronologique
  const cancelBookingAndCascade = (bookingId) => {
    const b = (bookings||[]).find(bk => bk.id === bookingId);
    if (!b) { updateBooking(bookingId, { status:"cancelled" }); return; }
    updateBooking(bookingId, { status:"cancelled" });
    if (!b.contactId) return;
    const ct = (contacts||[]).find(c => c.id === b.contactId);
    if (!ct) return;
    const today = new Date().toISOString().split("T")[0];
    const remaining = (bookings||[])
      .filter(bk => bk.id !== bookingId && bk.contactId === b.contactId && bk.status === "confirmed" && (bk.date||"") >= today);
    if (remaining.length === 0 && ct.pipeline_stage === "rdv_programme") {
      handlePipelineStageChange(ct.id, "contacte", "RDV annulé — retour en Contacté");
      handleCollabUpdateContact(ct.id, { next_rdv_date: "", next_rdv_booking_id: "", rdv_status: "" });
    } else if (remaining.length > 0) {
      const nextBk = [...remaining].sort((a,z) => ((a.date||"")+(a.time||"")).localeCompare((z.date||"")+(z.time||"")))[0];
      handleCollabUpdateContact(ct.id, { next_rdv_date: nextBk.date, next_rdv_booking_id: nextBk.id });
    }
  };
  const deleteBooking = (id) => { cancelBookingAndCascade(id); setSelectedBooking(null); showNotif("RDV annulé"); };

  const userAvail = avails[collab.id] || defAvail();

  const saveAvail = (newAvails) => { const schedule = newAvails[collab.id]; if (schedule) api(`/api/collaborators/${collab.id}/availability`, { method:"PUT", body:schedule }).catch(()=>{}); };
  const updateSlot = (day, si, field, val) => {
    setAvails(prev => { try { const u={...prev}; if(!u[collab.id]||!u[collab.id][day]) return prev; const dd={...u[collab.id][day]}; dd.slots=dd.slots.map((s,i)=>i===si?{...s,[field]:val}:s); u[collab.id]={...u[collab.id],[day]:dd}; saveAvail(u); return u; } catch { return prev; } });
  };
  const toggleDay = (day) => {
    setAvails(prev => { try { const u={...prev}; if(!u[collab.id]) u[collab.id]=defAvail(); if(!u[collab.id][day]) u[collab.id][day]={active:false,slots:[]}; const dd={...u[collab.id][day]}; dd.active=!dd.active; if(dd.active&&dd.slots.length===0) dd.slots=[{start:"09:00",end:"12:00"},{start:"14:00",end:"18:00"}]; u[collab.id]={...u[collab.id],[day]:dd}; saveAvail(u); return u; } catch { return prev; } });
  };
  const addSlot = (day) => {
    setAvails(prev => { try { const u={...prev}; if(!u[collab.id]) u[collab.id]=defAvail(); if(!u[collab.id][day]) return prev; const dd={...u[collab.id][day]}; dd.slots=[...dd.slots,{start:"09:00",end:"12:00"}]; u[collab.id]={...u[collab.id],[day]:dd}; saveAvail(u); return u; } catch { return prev; } });
  };
  const removeSlot = (day, idx) => {
    setAvails(prev => { try { const u={...prev}; if(!u[collab.id]||!u[collab.id][day]) return prev; const dd={...u[collab.id][day]}; dd.slots=dd.slots.filter((_,i)=>i!==idx); u[collab.id]={...u[collab.id],[day]:dd}; saveAvail(u); return u; } catch { return prev; } });
  };

  const [crmSearch, setCrmSearch] = useState("");
  const [selectedCrmContact, setSelectedCrmContact] = useState(null);
  const [collabCrmViewMode, setCollabCrmViewMode] = useState("table");
  const [collabFicheTab, setCollabFicheTab] = useState("notes");
  const [collabCrmSortKey, setCollabCrmSortKey] = useState("lastVisit");
  const [collabCrmSortDir, setCollabCrmSortDir] = useState("desc");
  const [collabCrmFilterTags, setCollabCrmFilterTags] = useState([]);
  const [collabCrmSelectedIds, setCollabCrmSelectedIds] = useState([]);
  const [pipeSelectedIds, setPipeSelectedIds] = useState([]);
  const [pipeBulkStage, setPipeBulkStage] = useState('');
  const [pipeBulkModal, setPipeBulkModal] = useState(null); // 'sms' | 'tag' | null
  const [pipeBulkSmsText, setPipeBulkSmsText] = useState('');
  const [collabCrmBulkStage, setCollabCrmBulkStage] = useState("");
  const [collabCrmPage, setCollabCrmPage] = useState(0);
  const [collabCrmFilterStage, setCollabCrmFilterStage] = useState("");
  const [collabCrmFilterFollowup, setCollabCrmFilterFollowup] = useState(0);
  const [collabCrmAdvOpen, setCollabCrmAdvOpen] = useState(false);
  const [collabCrmAdvFilters, setCollabCrmAdvFilters] = useState({scoreRange:'',hasEmail:null,hasPhone:null});
  // ── Config colonnes CRM (dynamique : standards + champs perso) ──
  const CRM_STD_COLS = [{k:"name",l:"Contact",fixed:true},{k:"phone",l:"📞 Tél"},{k:"email",l:"✉ Email"},{k:"pipeline_stage",l:"Étape"},{k:"score",l:"Score"},{k:"next_action",l:"🔥 Action"},{k:"lastVisit",l:"Dernier contact"},{k:"totalBookings",l:"RDV"},{k:"source",l:"Source"},{k:"createdAt",l:"Créé le"},{k:"actions",l:"⚡",fixed:true}];
  const CRM_ALL_COLS = useMemo(()=>[
    ...CRM_STD_COLS,
    ...(contactFieldDefs||[]).map(d=>({k:'cf_'+d.fieldKey,l:d.label,isCustom:true,fieldType:d.fieldType||'text',fieldKey:d.fieldKey}))
  ],[contactFieldDefs]);
  const _savedCrmCols = useRef(null);
  if(!_savedCrmCols.current){try{_savedCrmCols.current=JSON.parse(localStorage.getItem('crm-col-config-'+(company?.id||'')))||null;}catch{_savedCrmCols.current=null;}}
  const [crmColConfig, setCrmColConfig] = useState(()=>{
    if(_savedCrmCols.current) return _savedCrmCols.current;
    return {order:CRM_STD_COLS.map(c=>c.k),hidden:[]};
  });
  const [crmColPanelOpen, setCrmColPanelOpen] = useState(false);
  const [crmDragCol, setCrmDragCol] = useState(null);
  const [crmExportModal, setCrmExportModal] = useState(false);
  const saveCrmColConfig = (cfg) => { setCrmColConfig(cfg); try{localStorage.setItem('crm-col-config-'+(company?.id||''),JSON.stringify(cfg));}catch{} };
  // Merge saved order with new custom fields (ajoutés en hidden par défaut)
  const crmEffectiveOrder = useMemo(()=>{
    const savedOrder = crmColConfig.order||CRM_STD_COLS.map(c=>c.k);
    const allKeys = CRM_ALL_COLS.map(c=>c.k);
    const newKeys = allKeys.filter(k=>!savedOrder.includes(k));
    return [...savedOrder.filter(k=>allKeys.includes(k)),...newKeys];
  },[crmColConfig.order,CRM_ALL_COLS]);
  const crmEffectiveHidden = useMemo(()=>{
    const h = new Set(crmColConfig.hidden||[]);
    // Custom fields hidden par défaut si pas explicitement dans l'ordre sauvegardé
    CRM_ALL_COLS.filter(c=>c.isCustom).forEach(c=>{if(!(crmColConfig.order||[]).includes(c.k))h.add(c.k);});
    return [...h];
  },[crmColConfig.hidden,crmColConfig.order,CRM_ALL_COLS]);
  const crmVisibleCols = crmEffectiveOrder.filter(k=>!crmEffectiveHidden.includes(k)).map(k=>CRM_ALL_COLS.find(c=>c.k===k)).filter(Boolean);
  const COLLAB_CRM_PAGE_SIZE = 50;
  const collabNotesTimerRef = useRef(null);
  const contactsLocalEditRef = useRef(0); // protect contacts from auto-refresh overwrite after local edit

  // Dynamic pipeline stages: defaults + custom per company
  const DEFAULT_STAGES = [
    { id:"nouveau", label:"Nouveau", color:"#2563EB", isDefault:1, isCore:true },
    { id:"contacte", label:"En discussion", color:"#F59E0B", isDefault:1, isCore:false },
    { id:"qualifie", label:"Intéressé", color:"#7C3AED", isDefault:1, isCore:false },
    { id:"rdv_programme", label:"RDV Programmé", color:"#0EA5E9", isDefault:1, isCore:true },
    { id:"nrp", label:"NRP", color:"#EF4444", isDefault:1, isCore:true },
    { id:"client_valide", label:"Client Validé", color:"#22C55E", isDefault:1, isCore:true },
    { id:"perdu", label:"Perdu", color:"#64748B", isDefault:1, isCore:true },
  ];
  // V1.8.19 — Phase 4 résolution : si le collab a un template assigné, ses stages
  // proviennent du snapshot figé (et non plus de la table pipeline_stages company).
  // Sinon (mode free, défaut) : DEFAULT_STAGES + customs company comme avant.
  const _pipeResolved = usePipelineResolved({ companyId: company?.id, collaboratorId: collab?.id });
  const _pipelineMode = _pipeResolved?.resolved?.mode || 'free';
  const _pipelineReadOnly = !!_pipeResolved?.resolved?.readOnly;
  const _pipelineTemplateMeta = _pipeResolved?.resolved?.templateMeta || null;
  const PIPELINE_STAGES = (_pipelineMode === 'template' && Array.isArray(_pipeResolved?.resolved?.stages))
    ? _pipeResolved.resolved.stages.map(s => ({ ...s, isDefault: s.isDefault || 0 }))
    : [...DEFAULT_STAGES, ...((typeof pipelineStages!=='undefined'?pipelineStages:null)||[]).map(s => ({...s, isDefault:0}))];

  // ── Column order: drag & drop reordering with localStorage persistence ──
  const [columnOrder, setColumnOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('c360-column-order-'+collab.id)) || null; } catch { return null; }
  });
  const orderedStages = useMemo(() => {
    if (!columnOrder) return PIPELINE_STAGES;
    const ordered = columnOrder.map(id => PIPELINE_STAGES.find(s => s.id === id)).filter(Boolean);
    // Add any new stages not yet in the saved order
    PIPELINE_STAGES.forEach(s => { if (!ordered.find(o => o.id === s.id)) ordered.push(s); });
    return ordered;
  }, [columnOrder, PIPELINE_STAGES.length, pipelineStages]);
  const [dragColumnId, setDragColumnId] = useState(null);
  const handleColumnDragStart = (e, stageId) => {
    e.dataTransfer.setData('columnId', stageId);
    e.dataTransfer.effectAllowed = 'move';
    setDragColumnId(stageId);
    e.target.style.opacity = '0.5';
  };
  const handleColumnDragEnd = (e) => { e.target.style.opacity = '1'; setDragColumnId(null); };
  const handleColumnDrop = (e, targetStageId) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('columnId');
    if (!srcId || srcId === targetStageId) { setDragColumnId(null); return; }
    const ids = orderedStages.map(s => s.id);
    const fromIdx = ids.indexOf(srcId);
    const toIdx = ids.indexOf(targetStageId);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, srcId);
    setColumnOrder(ids);
    localStorage.setItem('c360-column-order-'+collab.id, JSON.stringify(ids));
    setDragColumnId(null);
    showNotif('Colonnes réorganisées');
  };
  const resetColumnOrder = () => {
    setColumnOrder(null);
    localStorage.removeItem('c360-column-order-'+collab.id);
    showNotif('Ordre par défaut restauré');
  };

  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactForm, setNewContactForm] = useState({name:'',firstname:'',lastname:'',civility:'',contact_type:'btc',email:'',phone:'',mobile:'',company:'',address:'',website:'',siret:'',notes:'',pipeline_stage:'nouveau',tags:''});
  const [scanImageModal, setScanImageModal] = useState(null); // {step:'upload'|'preview', image, contacts[], loading}
  const [perduMotifModal, setPerduMotifModal] = useState(null); // {contactId, fromNote}
  const [showAddStage, setShowAddStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#7C3AED');
  const [editingContact, setEditingContact] = useState(null); // for inline edit in fiche
  const [confirmDelete, setConfirmDelete] = useState(null);
  // Contract modal state for "Client Validé"
  const [contractModal, setContractModal] = useState(null); // {contactId} or null
  const [contractForm, setContractForm] = useState({amount:'',number:'',date:new Date().toISOString().split('T')[0]});
  // Drag & drop pipeline
  const [dragContact, setDragContact] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  // RDV countdown — upcoming bookings within 2h
  const [rdvCountdownTick, setRdvCountdownTick] = useState(0);
  const upcomingRdvs = useMemo(() => {
    const now = new Date();
    return (bookings||[]).filter(b=>b.status==='confirmed'&&b.collaboratorId===collab.id).map(b=>{const dt=new Date(b.date+'T'+b.time);const diff=dt.getTime()-now.getTime();return{...b,_dt:dt,_diffMs:diff,_diffMin:Math.round(diff/60000)};}).filter(b=>b._diffMs>-30*60000&&b._diffMs<2*3600000).sort((a,b)=>a._diffMs-b._diffMs);
  }, [bookings, collab.id, rdvCountdownTick]);
  useEffect(()=>{rdvCountdownRef.current=setInterval(()=>setRdvCountdownTick(t=>t+1),1000);return()=>clearInterval(rdvCountdownRef.current);},[]);
  // Column management
  const [editingStage, setEditingStage] = useState(null);
  const [editStageForm, setEditStageForm] = useState({ label:'', color:'#7C3AED' });
  const [confirmDeleteStage, setConfirmDeleteStage] = useState(null);
  // Chat / Messaging
  const [collabChatMessages, setCollabChatMessages] = useState([]);
  const [collabChatInput, setCollabChatInput] = useState("");
  const [collabChatFiles, setCollabChatFiles] = useState([]); // [{name, dataUrl, size, type}]
  const [collabChatShowContactPicker, setCollabChatShowContactPicker] = useState(false);
  const [collabChatShowEmoji, setCollabChatShowEmoji] = useState(false);
  const [collabChatReplyTo, setCollabChatReplyTo] = useState(null);
  const [collabChatSearch, setCollabChatSearch] = useState("");
  const [collabChatSearchOpen, setCollabChatSearchOpen] = useState(false);
  const collabChatEndRef = useRef(null);
  const collabChatFileRef = useRef(null);
  const collabChatInputRef = useRef(null);
  // Emoji categories
  const CHAT_EMOJIS = { "Smileys":["😀","😂","🤣","😊","😍","🥰","😘","😎","🤩","🥳","😅","😢","😤","🤔","😴","🤗","😇","🙄","😬","🤯","💀","🫠","🤭","😏"],"Gestes":["👍","👎","👏","🤝","✌️","🤞","💪","🙏","👋","🫶","❤️","🔥","⭐","💯","✅","❌","🎉","🎊","💬","📌","📎","🗓️","⏰","🏆"] };
  const REACTION_EMOJIS = ["👍","❤️","😂","😮","😢","🔥","🎉","👏"];
  const [collabChatHoveredMsg, setCollabChatHoveredMsg] = useState(null);
  const [collabChatReactionPicker, setCollabChatReactionPicker] = useState(null);
  // DM support
  const [collabChatMode, setCollabChatMode] = useState("group");
  const [collabChatDmTarget, setCollabChatDmTarget] = useState(null);
  const [collabChatOnline, setCollabChatOnline] = useState([]);
  // Edit/delete
  const [collabChatEditingMsg, setCollabChatEditingMsg] = useState(null);
  // Voice recording
  const [collabChatIsRecording, setCollabChatIsRecording] = useState(false);
  const [collabChatRecordingTime, setCollabChatRecordingTime] = useState(0);
  const collabMediaRecorderRef = useRef(null);
  const collabAudioChunksRef = useRef([]);
  const collabRecordingTimerRef = useRef(null);
  // Floating chat
  const [collabChatFloating, setCollabChatFloating] = useState(false);
  const [collabChatMinimized, setCollabChatMinimized] = useState(false);

  // Add/toggle reaction (now server-side)
  const addChatReaction = (msgId, emoji) => {
    api(`/api/messaging/${msgId}/reaction`, { method: "POST", body: { userId: collab.id, userName: collab.name, emoji } }).then(r => {
      if (r?.reactions) setCollabChatMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: r.reactions } : m));
    });
  };
  // Get grouped reactions for display
  const getMsgReactions = (msgId, msg) => {
    const raw = msg?.reactions || {};
    const grouped = {};
    Object.values(raw).forEach(r => {
      if (!grouped[r.emoji]) grouped[r.emoji] = { emoji: r.emoji, users: [], isMine: false };
      grouped[r.emoji].users.push(r.userName);
      if (r.userId === collab.id) grouped[r.emoji].isMine = true;
    });
    return Object.values(grouped);
  };
  // Delete message
  const collabDeleteChat = (msgId) => {
    api(`/api/messaging/${msgId}?senderId=${collab.id}`, { method: "DELETE" }).then(r => {
      if (r?.success) setCollabChatMessages(prev => prev.filter(m => m.id !== msgId));
    });
  };
  // Voice recording
  const collabStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      collabAudioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) collabAudioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(collabAudioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const dur = collabChatRecordingTime;
          handleCollabSendChat('voice_note', '', { dataUrl: reader.result, type: 'audio/webm', name: `vocal_${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')}.webm`, size: blob.size, duration: dur });
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      collabMediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setCollabChatIsRecording(true);
      setCollabChatRecordingTime(0);
      collabRecordingTimerRef.current = setInterval(() => setCollabChatRecordingTime(p => p + 1), 1000);
    } catch (err) { showNotif("Micro non disponible", "danger"); }
  };
  const collabStopRecording = () => {
    if (collabMediaRecorderRef.current && collabChatIsRecording) {
      collabMediaRecorderRef.current.stop();
      setCollabChatIsRecording(false);
      clearInterval(collabRecordingTimerRef.current);
    }
  };
  const collabCancelRecording = () => {
    if (collabMediaRecorderRef.current && collabChatIsRecording) {
      collabMediaRecorderRef.current.ondataavailable = null;
      collabMediaRecorderRef.current.onstop = null;
      collabMediaRecorderRef.current.stop();
      try { collabMediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop()); } catch (e) {}
      setCollabChatIsRecording(false);
      clearInterval(collabRecordingTimerRef.current);
      setCollabChatRecordingTime(0);
    }
  };
  // Availability: breaks & buffer
  const [availBuffer, setAvailBuffer] = useState(() => { try { return parseInt(localStorage.getItem("c360-avail-buffer-"+collab.id))||0; } catch { return 0; } });
  const [availMaxPerDay, setAvailMaxPerDay] = useState(() => { try { return parseInt(localStorage.getItem("c360-avail-max-"+collab.id))||0; } catch { return 0; } });
  const [availBreaks, setAvailBreaks] = useState(() => { try { return JSON.parse(localStorage.getItem("c360-avail-breaks-"+collab.id)||"{}"); } catch { return {}; } });
  const saveAvailBuffer = (v) => { setAvailBuffer(v); localStorage.setItem("c360-avail-buffer-"+collab.id, v); };
  const saveAvailMaxPerDay = (v) => { setAvailMaxPerDay(v); localStorage.setItem("c360-avail-max-"+collab.id, v); };
  const saveAvailBreaks = (newBreaks) => { setAvailBreaks(newBreaks); localStorage.setItem("c360-avail-breaks-"+collab.id, JSON.stringify(newBreaks)); };

  const myCalendars = calendars.filter(c => c.collaborators.includes(collab.id));

  const myCrmContacts = useMemo(() => {
    // RÈGLE : tout collaborateur de l'entreprise ne peut JAMAIS apparaître dans le CRM
    // Le CRM = uniquement les CLIENTS externes de l'entreprise
    const teamList = collabs.length ? collabs : (company?.collaborators || []);
    const collabEmails = new Set();
    const collabNames = new Set();
    teamList.forEach(c => {
      if (c.email) collabEmails.add(c.email.toLowerCase().trim());
      if (c.name) collabNames.add(c.name.toLowerCase().trim());
    });
    // Inclure aussi l'email admin/owner
    if (company?.email) collabEmails.add(company.email.toLowerCase().trim());
    // Inclure l'email du collaborateur courant aussi
    if (collab?.email) collabEmails.add(collab.email.toLowerCase().trim());
    if (collab?.name) collabNames.add(collab.name.toLowerCase().trim());

    // Vérifie si un email OU un nom correspond à un collaborateur
    const isCollab = (email, name) => {
      if (email && collabEmails.has(email.toLowerCase().trim())) return true;
      if (name && collabNames.has(name.toLowerCase().trim())) return true;
      return false;
    };

    const visitorMap = {};
    myBookings.forEach(b => {
      const key = (b.visitorEmail || b.visitorName || "").toLowerCase();
      if (!key) return;
      // Si le visiteur est un collaborateur → pas dans le CRM
      if (isCollab(b.visitorEmail, b.visitorName)) return;
      if (!visitorMap[key]) visitorMap[key] = { bookings:[], name:b.visitorName, email:b.visitorEmail, phone:b.visitorPhone, firstVisit:b.date, lastVisit:b.date };
      visitorMap[key].bookings.push(b);
      if (b.date < visitorMap[key].firstVisit) visitorMap[key].firstVisit = b.date;
      if (b.date > visitorMap[key].lastVisit) visitorMap[key].lastVisit = b.date;
      if (b.visitorPhone && !visitorMap[key].phone) visitorMap[key].phone = b.visitorPhone;
      if (b.visitorName && !visitorMap[key].name) visitorMap[key].name = b.visitorName;
    });
    const result = [];
    const usedContactIds = new Set();
    const isAdminView2 = collab?.role === 'admin' || collab?.role === 'supra' || isAdminView;
    for (const [key, data] of Object.entries(visitorMap)) {
      if (isCollab(data.email, data.name)) continue;
      // V5-ISOLATION: matcher uniquement les contacts de la MEME company et assignes au collab (ou shared)
      const contactRecord = (contacts||[]).find(c => c.email && c.email.toLowerCase() === key && c.companyId === company.id && (c.assignedTo === collab.id || (Array.isArray(c.shared_with) && c.shared_with.includes(collab.id)) || isAdminView2));
      if (contactRecord) {
        if (isCollab(contactRecord.email, contactRecord.name)) { usedContactIds.add(contactRecord.id); continue; }
        usedContactIds.add(contactRecord.id);
        const crSharedWith = Array.isArray(contactRecord.shared_with) ? contactRecord.shared_with : [];
        const crIsShared = crSharedWith.includes(collab.id) && contactRecord.assignedTo !== collab.id;
        result.push({ ...contactRecord, shared_with:crSharedWith, bookings:data.bookings, firstVisit:data.firstVisit, lastVisit:data.lastVisit, totalBookings:data.bookings.length, _linked:true, _shared:crIsShared });
      }
      // V5: NE PLUS créer de contacts temporaires non-linkés — uniquement les contacts DB
    }
    // Contacts manuels — exclure aussi les collaborateurs
    // V5-ISOLATION: collab ne voit QUE ses contacts (assignedTo ou shared_with)
    // Admin voit tout. Pas de rétrocompatibilité "unassigned visible par tous"
    (contacts||[]).filter(c => c.companyId === company.id && !usedContactIds.has(c.id) && !isCollab(c.email, c.name)).forEach(c => {
      const isOwned = c.assignedTo === collab.id;
      const isShared = Array.isArray(c.shared_with) && c.shared_with.includes(collab.id);
      // Collab : owned ou shared uniquement. Admin : tout.
      if (!isAdminView2 && !isOwned && !isShared) return;
      const cBookings = c.email ? myBookings.filter(b => b.visitorEmail && b.visitorEmail.toLowerCase() === c.email.toLowerCase()) : [];
      const cSharedWith = Array.isArray(c.shared_with) ? c.shared_with : [];
      result.push({ ...c, shared_with:cSharedWith, bookings:cBookings, firstVisit:c.lastVisit||'', totalBookings:c.totalBookings||cBookings.length, _linked:true, _shared:isShared && !isOwned });
    });
    return result.sort((a,b) => (b.lastVisit||'').localeCompare(a.lastVisit||''));
  }, [myBookings, contacts, company?.id, collabs]);

  // Lead temperature — HOT / WARM / COLD
  const getLeadTemperature = (ct) => {
    const logs = (typeof voipCallLogs!=='undefined'?voipCallLogs:null) || [];
    const ctCalls = logs.filter(cl => cl.contactId === ct.id || (()=>{const ph=((cl.direction==='outbound'?cl.toNumber:cl.fromNumber)||'').replace(/[^\d]/g,'').slice(-9);const cp=(ct.phone||'').replace(/[^\d]/g,'').slice(-9);return cp&&cp===ph;})());
    const answered = ctCalls.filter(cl => cl.status==='completed' && (cl.duration||0)>10);
    const missed = ctCalls.filter(cl => cl.status==='missed' || cl.status==='no-answer');
    const daysSince = ct.lastVisit ? Math.floor((Date.now()-new Date(ct.lastVisit).getTime())/86400000) : ct.createdAt ? Math.floor((Date.now()-new Date(ct.createdAt).getTime())/86400000) : 999;
    const hasRdv = (bookings||[]).some(b=>b.contactId===ct.id&&b.status==='confirmed');
    const nrpCount = (()=>{try{return JSON.parse(ct.nrp_followups_json||'[]').filter(f=>f.done).length;}catch{return 0;}})();
    const recentCalls = ctCalls.filter(cl=>{const d=cl.createdAt?Math.floor((Date.now()-new Date(cl.createdAt).getTime())/86400000):999;return d<=3;}).length;

    // Engagement (0-100)
    let engagement = 0;
    engagement += Math.min(answered.length * 15, 40);
    engagement += hasRdv ? 25 : 0;
    engagement += ct.rating ? ct.rating * 5 : 0;
    engagement += (ct.notes && ct.notes.length > 10) ? 10 : 0;
    if (ct.pipeline_stage==='client_valide') engagement += 20;
    else if (ct.pipeline_stage==='qualifie') engagement += 15;
    else if (ct.pipeline_stage==='rdv_programme') engagement += 20;

    // Responsiveness (0-100)
    let responsiveness = 50;
    responsiveness += Math.min(answered.length * 10, 30);
    responsiveness -= Math.min(missed.length * 10, 30);
    responsiveness += daysSince<=3 ? 20 : daysSince<=7 ? 10 : daysSince<=14 ? 0 : -20;

    // Urgency (0-100)
    let urgency = 0;
    if (ct.pipeline_stage==='nrp' && ct.nrp_next_relance && ct.nrp_next_relance<=new Date().toISOString().split('T')[0]) urgency += 40;
    if (hasRdv) urgency += 30;
    if (daysSince>=7 && daysSince<30 && ct.pipeline_stage!=='perdu' && ct.pipeline_stage!=='client_valide') urgency += 25;
    if (daysSince>=30) urgency += 15;

    // Fatigue (0-100) — high = too much contact
    let fatigue = 0;
    fatigue += Math.min(recentCalls * 15, 45);
    fatigue += Math.min(nrpCount * 10, 40);
    if (missed.length > answered.length * 2) fatigue += 20;

    // Opportunity (0-100)
    let opportunity = 0;
    if (ct.pipeline_stage==='qualifie') opportunity += 30;
    if (ct.pipeline_stage==='rdv_programme') opportunity += 40;
    if (answered.length>0 && answered.some(cl=>(cl.duration||0)>240)) opportunity += 20;
    opportunity += Math.min((ct.rating||0) * 8, 25);
    if (ct.pipeline_stage==='nouveau' && !ct.lastVisit) opportunity += 15;

    // Conversion score (0-100)
    const conversion = Math.min(100, Math.max(0, Math.round(
      0.30 * Math.min(engagement,100) +
      0.20 * Math.min(Math.max(responsiveness,0),100) +
      0.25 * Math.min(opportunity,100) +
      0.15 * Math.min(urgency,100) -
      0.10 * Math.min(fatigue,100)
    )));

    // Temperature
    const temp = conversion >= 65 ? 'hot' : conversion >= 35 ? 'warm' : 'cold';
    return { temp, conversion, engagement: Math.min(engagement,100), responsiveness: Math.min(Math.max(responsiveness,0),100), urgency: Math.min(urgency,100), fatigue: Math.min(fatigue,100), opportunity: Math.min(opportunity,100) };
  };
  const _tempColor = t => t==='hot'?'#EF4444':t==='warm'?'#F59E0B':'#3B82F6';
  const _tempLabel = t => t==='hot'?'HOT':t==='warm'?'WARM':'COLD';
  const _tempEmoji = t => t==='hot'?'🔥':t==='warm'?'🟡':'🔵';

  // Lead scoring for collab CRM (legacy + enriched)
  const getCollabLeadScore = (ct) => {
    // ── SCORE LEAD — base 0, peut etre negatif ──
    // Nouveau = 0 (il vient d'arriver, pas de points)
    let score = 0;
    const logs = (typeof voipCallLogs!=='undefined'?voipCallLogs:null) || [];
    const ctCalls = logs.filter(cl => cl.contactId === ct.id || (()=>{
      const ph = ((cl.direction==='outbound'?cl.toNumber:cl.fromNumber)||'').replace(/[^\d]/g,'').slice(-9);
      const cp = (ct.phone||'').replace(/[^\d]/g,'').slice(-9);
      return cp && cp === ph;
    })());
    const answeredCalls = ctCalls.filter(cl => cl.status === 'completed' && (cl.duration||0) > 10);
    const missedCalls = ctCalls.filter(cl => cl.status === 'missed' || cl.status === 'no-answer');

    // Pipeline stage progression (+points)
    if (ct.pipeline_stage === 'contacte') score += 2;
    else if (ct.pipeline_stage === 'qualifie') score += 5;
    else if (ct.pipeline_stage === 'rdv_programme' || ct.pipeline_stage === 'rdv_confirme') score += 8;
    else if (ct.pipeline_stage === 'client_valide') score += 15;
    else if (ct.pipeline_stage === 'perdu') score -= 5;
    // nouveau = 0 pts (defaut)

    // NRP penalties (-1 par tentative NRP)
    if (ct.pipeline_stage === 'nrp') {
      score -= 2; // malus stage NRP
      try { const followups = JSON.parse(ct.nrp_followups_json || '[]'); const nrpCount = followups.filter(f=>f.done).length; score -= nrpCount; } catch {}
    }

    // Appels (+1 par appel repondu, -1 par appel manque)
    score += answeredCalls.length;
    score -= missedCalls.length;

    // RDV (+3 par RDV)
    score += Math.min((ct.totalBookings || 0) * 3, 15);

    // Reactivite (dernier contact recent = bonus)
    if (ct.lastVisit) {
      const days = Math.floor((Date.now() - new Date(ct.lastVisit).getTime()) / 86400000);
      if (days <= 3) score += 3;
      else if (days <= 7) score += 2;
      else if (days <= 14) score += 1;
      else if (days >= 60) score -= 2; // inactif longtemps
    }

    // Rating manuel (+2 par etoile)
    score += (ct.rating || 0) * 2;

    // Notes = engagement (+1 si des notes existent)
    if (ct.notes && ct.notes.length > 5) score += 1;

    // Behavior score (événements CRM : appels, messages, bookings)
    score += (ct.behavior_score || 0);

    return score; // pas de cap — peut etre negatif ou > 100
  };
  const cScoreColor = (s) => s >= 8 ? '#22C55E' : s >= 3 ? '#F59E0B' : s >= 0 ? '#94A3B8' : '#EF4444';
  const cScoreLabel = (s) => s >= 8 ? "Chaud" : s >= 3 ? "Tiede" : s >= 0 ? "Neutre" : "Froid";

  const filteredCollabCrm = useMemo(() => {
    const now = Date.now();
    let list = myCrmContacts.map(c => {
      let _cfMap = null;
      try { const raw = c.custom_fields_json || c.custom_fields; _cfMap = Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch { _cfMap = []; }
      return { ...c, tags: Array.isArray(c.tags)?c.tags:[], notes: typeof c.notes==='string'?c.notes:'', shared_with: Array.isArray(c.shared_with)?c.shared_with:[], _score: getCollabLeadScore(c), _stage: PIPELINE_STAGES.find(s=>s.id===(c.pipeline_stage||"nouveau")) || PIPELINE_STAGES[0], _daysSince: Math.floor((now - new Date(c.lastVisit||c.createdAt||0).getTime())/86400000), _cfMap };
    });
    if ((typeof crmSearch!=='undefined'?crmSearch:{}).length >= 2) { const q = (typeof crmSearch!=='undefined'?crmSearch:{}).toLowerCase(); list = list.filter(c => c.name?.toLowerCase().includes(q) || (c.email||"").toLowerCase().includes(q) || (c.phone||"").includes(q)); }
    if ((typeof collabCrmFilterTags!=='undefined'?collabCrmFilterTags:{}).length > 0) list = list.filter(c => (c.tags||[]).some(t => (typeof collabCrmFilterTags!=='undefined'?collabCrmFilterTags:{}).includes(t)));
    if ((typeof collabCrmFilterStage!=='undefined'?collabCrmFilterStage:null)) list = list.filter(c => (c.pipeline_stage||"nouveau") === (typeof collabCrmFilterStage!=='undefined'?collabCrmFilterStage:null));
    if ((typeof collabCrmFilterFollowup!=='undefined'?collabCrmFilterFollowup:null) > 0) list = list.filter(c => c._daysSince >= (typeof collabCrmFilterFollowup!=='undefined'?collabCrmFilterFollowup:null));
    // Advanced filters
    if ((typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).scoreRange === "cold") list = list.filter(c => c._score < 40);
    else if ((typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).scoreRange === "warm") list = list.filter(c => c._score >= 40 && c._score < 70);
    else if ((typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).scoreRange === "hot") list = list.filter(c => c._score >= 70);
    if ((typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).hasEmail === true) list = list.filter(c => c.email);
    else if ((typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).hasEmail === false) list = list.filter(c => !c.email);
    if ((typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).hasPhone === true) list = list.filter(c => c.phone);
    else if ((typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{}).hasPhone === false) list = list.filter(c => !c.phone);
    // Filtre période création
    if ((typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{})._createdPeriod) {
      const now = new Date(); const todayS = now.toISOString().split('T')[0];
      const daysMap = {today:0,'7d':7,'30d':30,'90d':90};
      const days = daysMap[(typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{})._createdPeriod];
      if (days !== undefined) {
        const cutoff = new Date(now.getTime() - days * 86400000).toISOString().split('T')[0];
        list = list.filter(c => (c.createdAt||'') >= cutoff);
      }
    }
    if ((typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{})._createdFrom) list = list.filter(c => (c.createdAt||'') >= (typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{})._createdFrom);
    if ((typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{})._createdTo) list = list.filter(c => (c.createdAt||'').slice(0,10) <= (typeof collabCrmAdvFilters!=='undefined'?collabCrmAdvFilters:{})._createdTo);
    if ((typeof collabCrmSortKey!=='undefined'?collabCrmSortKey:null) === "score") {
      list.sort((a,b) => (typeof collabCrmSortDir!=='undefined'?collabCrmSortDir:null) === "asc" ? a._score - b._score : b._score - a._score);
    } else {
      const _stageOrder = (typeof collabCrmSortKey!=='undefined'?collabCrmSortKey:null) === "pipeline_stage" ? Object.fromEntries(PIPELINE_STAGES.map((s,i)=>[s.id,i])) : null;
      list.sort((a,b) => {
        let va = a[collabCrmSortKey]||"", vb = b[collabCrmSortKey]||"";
        if ((typeof collabCrmSortKey!=='undefined'?collabCrmSortKey:null) === "totalBookings") { va = a.totalBookings||0; vb = b.totalBookings||0; }
        if ((typeof collabCrmSortKey!=='undefined'?collabCrmSortKey:null) === "lastVisit") { va = a.lastVisit||a.createdAt||""; vb = b.lastVisit||b.createdAt||""; }
        if ((typeof collabCrmSortKey!=='undefined'?collabCrmSortKey:null) === "createdAt") { va = a.createdAt||""; vb = b.createdAt||""; }
        if (_stageOrder) { va = _stageOrder[a.pipeline_stage] ?? 999; vb = _stageOrder[b.pipeline_stage] ?? 999; return (typeof collabCrmSortDir!=='undefined'?collabCrmSortDir:null) === "asc" ? va - vb : vb - va; }
        if (typeof va === "string") return (typeof collabCrmSortDir!=='undefined'?collabCrmSortDir:null) === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        return (typeof collabCrmSortDir!=='undefined'?collabCrmSortDir:null) === "asc" ? va - vb : vb - va;
      });
    }
    return list;
  }, [myCrmContacts, crmSearch, collabCrmFilterTags, collabCrmFilterStage, collabCrmFilterFollowup, collabCrmAdvFilters, collabCrmSortKey, collabCrmSortDir]);

  const collabContactTags = useMemo(() => { const s = new Set(); myCrmContacts.forEach(c => (Array.isArray(c.tags)?c.tags:[]).forEach(t => { if(typeof t==='string') s.add(t); })); return [...s]; }, [myCrmContacts]);

  // Collab CRM pagination
  const collabPaginatedContacts = useMemo(() => filteredCollabCrm.slice((typeof collabCrmPage!=='undefined'?collabCrmPage:null) * COLLAB_CRM_PAGE_SIZE, ((typeof collabCrmPage!=='undefined'?collabCrmPage:null) + 1) * COLLAB_CRM_PAGE_SIZE), [filteredCollabCrm, collabCrmPage]);
  const collabCrmTotalPages = Math.ceil(filteredCollabCrm.length / COLLAB_CRM_PAGE_SIZE);

  // Collab CRM pipeline analytics
  const collabPipelineAnalytics = useMemo(() => {
    const all = myCrmContacts.map(c => ({ ...c, _score: getCollabLeadScore(c) }));
    const stageCounts = {};
    PIPELINE_STAGES.forEach(s => stageCounts[s.id] = 0);
    all.forEach(c => { if(!c) return; const st = c.pipeline_stage||"nouveau"; if(stageCounts[st]!==undefined) stageCounts[st]++; else stageCounts[st] = 1; }); // hotfix 2026-04-23 — null-safe
    const total = all.length || 1;
    const funnel = orderedStages.map((s,i) => {
      const count = stageCounts[s.id] || 0;
      const pct = Math.round(count / total * 100);
      const prevCount = i > 0 ? (stageCounts[orderedStages[i-1].id] || 0) : total;
      const convRate = prevCount > 0 ? Math.round(count / prevCount * 100) : 0;
      return { ...s, count, pct, convRate };
    });
    const avgScores = {};
    PIPELINE_STAGES.forEach(s => {
      const stContacts = all.filter(c=>(c.pipeline_stage||"nouveau")===s.id);
      avgScores[s.id] = stContacts.length ? Math.round(stContacts.reduce((acc,c)=>acc+c._score,0)/stContacts.length) : 0;
    });
    const won = stageCounts["client_valide"] || 0;
    const lost = stageCounts["perdu"] || 0;
    const active = all.length - won - lost;
    const winRate = all.length > 0 ? Math.round(won / all.length * 100) : 0;
    return { funnel, avgScores, won, lost, active, winRate, total: all.length };
  }, [myCrmContacts]);

  const linkVisitorToContacts = (visitor) => {
    const nc = { id:"ct"+Date.now(), companyId:company.id, name:visitor.name, email:visitor.email, phone:visitor.phone||"", totalBookings:visitor.totalBookings||0, lastVisit:visitor.lastVisit||"", tags:[], notes:"", rating:null, docs:[], pipeline_stage:"nouveau", assignedTo:collab.id, shared_with:[] };
    setContacts(p => [...p, nc]);
    api("/api/data/contacts", { method:"POST", body:nc });
    return nc;
  };
  const handleCollabUpdateContact = (id, updates) => {
    // Securite: valider pipeline_stage si present
    if (updates.pipeline_stage) {
      const VALID = ['nouveau','contacte','qualifie','rdv_programme','nrp','client_valide','perdu', ...((typeof pipelineStages!=='undefined'?pipelineStages:null)||[]).map(s=>s.id)];
      if (!VALID.includes(updates.pipeline_stage)) { console.warn('[CONTACT] Stage invalide:', updates.pipeline_stage); updates.pipeline_stage = 'nouveau'; }
    }
    // Optimistic update local state + mark as recently edited (protect from auto-refresh)
    // V5: Injecter updatedAt local pour que le badge inactivite disparaisse immediatement
    contactsLocalEditRef.current = Date.now();
    const _now = new Date().toISOString();
    setContacts(p => p.map(c => c.id === id ? {...c, ...updates, updatedAt: _now} : c));
    // REGLE GLOBALE: Synchroniser TOUTES les vues qui affichent ce contact
    if ((typeof selectedCrmContact!=='undefined'?selectedCrmContact:null)?.id === id) (typeof setSelectedCrmContact==='function'?setSelectedCrmContact:function(){})(p => p ? {...p, ...updates} : p);
    if ((typeof pipelineRightContact!=='undefined'?pipelineRightContact:null)?.id === id) (typeof setPipelineRightContact==='function'?setPipelineRightContact:function(){})(p => p ? {...p, ...updates} : p);
    if (typeof setSelectedContact === 'function') { try { setSelectedContact(p => p?.id === id ? {...p, ...updates} : p); } catch {} }
    if (typeof setAllContacts === 'function') { try { setAllContacts(p => Array.isArray(p) ? p.map(c => c.id === id ? {...c, ...updates} : c) : p); } catch {} }
    // V4: Save to backend — source/origin/tabId + gestion 409 Conflict + contact frais
    const saveToBackend = (attempt = 1) => {
      api(`/api/data/contacts/${id}`, { method:"PUT", body:{ ...updates, companyId: company?.id, _tabId: TAB_ID, _source: updates._source || 'manual', _origin: updates._origin || '', _reason: updates._reason || '' } })
        .then(r => {
          if (r?.error && r?.contact) {
            // V3: 409 Conflict — données modifiées entre-temps, utiliser le contact frais
            console.warn('[CONTACT SAVE] 409 Conflict:', r.error, '→ sync avec données fraîches');
            const fresh = r.contact;
            setContacts(p => p.map(c => c.id === id ? fresh : c));
            if ((typeof selectedCrmContact!=='undefined'?selectedCrmContact:null)?.id === id) (typeof setSelectedCrmContact==='function'?setSelectedCrmContact:function(){})(fresh);
            if ((typeof pipelineRightContact!=='undefined'?pipelineRightContact:null)?.id === id) (typeof setPipelineRightContact==='function'?setPipelineRightContact:function(){})(fresh);
            showNotif('Contact mis à jour par une autre source — données rechargées', 'warning');
          } else if (!r || r.error) {
            console.error('[CONTACT SAVE] Erreur serveur:', r?.error, '→ retry', attempt);
            if (attempt < 3) setTimeout(() => saveToBackend(attempt + 1), 1000 * attempt);
            else showNotif('Erreur: modification non sauvegardée. Réessayez.', 'danger');
          } else {
            console.log('[CONTACT SAVE] OK:', id, Object.keys(updates).join(', '));
            // V3: si le backend retourne le contact frais, synchroniser le state
            if (r.contact) {
              setContacts(p => p.map(c => c.id === id ? r.contact : c));
              if ((typeof selectedCrmContact!=='undefined'?selectedCrmContact:null)?.id === id) (typeof setSelectedCrmContact==='function'?setSelectedCrmContact:function(){})(r.contact);
              if ((typeof pipelineRightContact!=='undefined'?pipelineRightContact:null)?.id === id) (typeof setPipelineRightContact==='function'?setPipelineRightContact:function(){})(r.contact);
            }
            // V3: délai de protection 5s post-succès
            setTimeout(() => { if (Date.now() - contactsLocalEditRef.current > 4000) contactsLocalEditRef.current = 0; }, 5000);
            // V1.7.5 — cascade soft-cancel bookings futurs uniquement après succès réel du passage en perdu
            if (updates.pipeline_stage === 'perdu') {
              const _nowMs = Date.now();
              const _futureBks = (bookings||[]).filter(b => {
                if (b.contactId !== id || b.status !== 'confirmed') return false;
                const _ms = new Date((b.date||'') + 'T' + (b.time || '23:59')).getTime();
                return !isNaN(_ms) && _ms >= _nowMs;
              });
              for (const _b of _futureBks) { updateBooking(_b.id, { status: 'cancelled' }); }
              if (_futureBks.length) console.log('[CASCADE PERDU]', _futureBks.length, 'bookings cancelled for contact', id);
            }
          }
        })
        .catch(err => {
          console.error('[CONTACT SAVE] Echec réseau:', err.message, '→ retry', attempt);
          if (attempt < 3) setTimeout(() => saveToBackend(attempt + 1), 1000 * attempt);
          else {
            showNotif('Erreur réseau: modification non sauvegardée', 'danger');
            // V3: refetch individuel — ne pas écraser les autres contacts modifiés localement
            api(`/api/data/contacts/${id}?companyId=${company?.id}`).then(fresh => {
              if (fresh && fresh.id) {
                setContacts(p => p.map(c => c.id === id ? fresh : c));
                if ((typeof selectedCrmContact!=='undefined'?selectedCrmContact:null)?.id === id) (typeof setSelectedCrmContact==='function'?setSelectedCrmContact:function(){})(fresh);
                if ((typeof pipelineRightContact!=='undefined'?pipelineRightContact:null)?.id === id) (typeof setPipelineRightContact==='function'?setPipelineRightContact:function(){})(fresh);
              }
            }).catch(() => {});
          }
        });
    };
    // V1.7.4 — guard: skip backend PUT if contact is still pending server reconciliation
    const _tgt = (contacts||[]).find(c => c.id === id);
    if (_tgt && _tgt._pending) { console.warn('[CONTACT UPDATE] skipped PUT — contact pending:', id); return; }
    saveToBackend();
  };
  // ── REGLE: RDV passé sans action → notification pour qualifier ──
  const rdvCheckRef = useRef(null);
  useEffect(() => {
    if (!contacts?.length || !bookings?.length) return;
    const checkPastRdv = () => {
      const now = new Date();
      const nowStr = now.toISOString().split('T')[0];
      const nowTime = now.toTimeString().substring(0,5);
      const rdvContacts = (contacts||[]).filter(c => c.assignedTo === collab.id && c.pipeline_stage === 'rdv_programme');
      rdvContacts.forEach(ct => {
        const activeBookings = (bookings||[]).filter(b => b.contactId === ct.id && b.status === 'confirmed');
        const pastBookings = activeBookings.filter(b => b.date < nowStr || (b.date === nowStr && b.time < nowTime));
        if (pastBookings.length > 0 && !rdvCheckRef.current?.[ct.id]) {
          rdvCheckRef.current = { ...rdvCheckRef.current, [ct.id]: true };
          showNotif('RDV terminé : ' + ct.name + ' — Pensez à qualifier !', 'info');
        }
      });
    };
    const timer = setTimeout(checkPastRdv, 30000); // Check 30s after load
    const iv = setInterval(checkPastRdv, 5*60*1000); // Then every 5min
    return () => { clearTimeout(timer); clearInterval(iv); };
  }, [contacts?.length, bookings?.length]);

  // ── V3: AUTO-SYNC contacts — deps stables (company.id only), lit contacts via ref ──
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts; // toujours à jour sans redéclencher l'effect
  useEffect(() => {
    if (!company?.id || !collab?.id) return;
    const syncContacts = () => {
      const current = contactsRef.current || [];
      const myContacts = current.filter(c => c.assignedTo === collab.id);
      if (myContacts.length === 0) return;
      api('/api/data/contacts/sync-batch', { method:'POST', body:{ companyId:company.id, contacts:myContacts } })
        .then(r => { if(r?.synced > 0) console.log('[CONTACTS SYNC] '+r.synced+' contacts synced to DB'); })
        .catch(() => {});
    };
    const initTimer = setTimeout(syncContacts, 10000);
    const iv = setInterval(syncContacts, 5*60*1000);
    return () => { clearTimeout(initTimer); clearInterval(iv); };
  }, [company?.id, collab?.id]);

  // V3: verrou anti-double action
  const pipelineActionLockRef = useRef({});
  const handlePipelineStageChange = (contactId, newStage, note='', contractData=null) => {
    // V1.8.13 — Cross-collab : lecture seule pour les collabs en shared_with (non-owner).
    // Le owner est la seule source de vérité pour le pipeline_stage. Bypass admin/supra.
    {
      const _ct = (contacts||[]).find(_c => _c.id === contactId);
      const _isAdmin = collab?.role === 'admin' || collab?.role === 'supra' || isAdminView;
      if (_ct && _ct.assignedTo && _ct.assignedTo !== collab.id && !_isAdmin) {
        const _ownerName = (collabs||[]).find(_c => _c.id === _ct.assignedTo)?.name || 'le propriétaire';
        if (typeof showNotif === 'function') showNotif('Lecture seule — ce contact est géré par ' + _ownerName, 'danger');
        return;
      }
    }
    // V3: verrou anti-double-clic — empêche 2 changements simultanés sur le même contact
    if (pipelineActionLockRef.current[contactId]) { console.warn('[PIPELINE] Action en cours pour', contactId, '→ ignoré'); return; }
    pipelineActionLockRef.current[contactId] = true;
    setTimeout(() => { delete pipelineActionLockRef.current[contactId]; }, 5000); // timeout sécurité 5s
    // ── SECURITE: valider que le stage existe ──
    const VALID_STAGES = ['nouveau','contacte','qualifie','rdv_programme','nrp','client_valide','perdu', ...((typeof pipelineStages!=='undefined'?pipelineStages:null)||[]).map(s=>s.id)];
    if (!VALID_STAGES.includes(newStage)) {
      console.warn('[PIPELINE] Stage invalide:', newStage, '→ fallback nouveau');
      newStage = 'nouveau';
    }
    // ── REGLE: "Perdu" necessite un motif obligatoire (liste ou texte libre) ──
    if (newStage === 'perdu' && !note) {
      setPerduMotifModal({ contactId, fromNote: '' });
      return;
    }
    // ── REGLE: "Qualifié" necessite une note explicative ──
    if (newStage === 'qualifie' && !note) {
      const reason = prompt('Pourquoi ce contact est intéressé ?\n(Besoin identifié, budget confirmé, demande active, etc.)');
      if (!reason || !reason.trim()) { showNotif('Note obligatoire pour qualifier','danger'); return; }
      note = reason.trim();
    }
    // ── REGLE: "RDV Programmé" → date + heure obligatoire → crée le booking ──
    if (newStage === 'rdv_programme' && !contractData?._rdvCreated) {
      const ct0 = (contacts||[]).find(c => c.id === contactId);
      // Si le contact a déjà un RDV actif, pas besoin d'en recréer
      const hasActiveRdv = (bookings||[]).some(b => b.contactId === contactId && b.status === 'confirmed' && b.date >= new Date().toISOString().split('T')[0]);
      if (!hasActiveRdv) {
        // REGLE: Ouvrir la MEME modale RDV partout (pipeline tel + CRM) — avec créneaux dispos
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
        setPhoneScheduleForm({
          contactId, contactName: ct0?.name||'', number: ct0?.phone||'',
          date: tomorrow.toISOString().split('T')[0], time: '10:00', duration: 30,
          notes: note||'', _bookingMode: true
        });
        setPhoneShowScheduleModal(true);
        return; // La modale RDV gère le changement de statut après création
      }
    }
    // ── REGLE: Quitter "RDV Programmé" → proposer annulation du RDV ──
    const ct = (contacts||[]).find(c => c.id === contactId);
    const fromStage = ct?.pipeline_stage || 'nouveau';
    if (fromStage === 'rdv_programme' && newStage !== 'rdv_programme') {
      const activeBookings = (bookings||[]).filter(b => b.contactId === contactId && b.status === 'confirmed' && b.date >= new Date().toISOString().split('T')[0]);
      if (activeBookings.length > 0) {
        const choice = confirm('Ce contact a ' + activeBookings.length + ' RDV programmé(s).\n\nOK = Annuler les RDV et changer de statut\nAnnuler = Changer de statut sans toucher aux RDV');
        if (choice) {
          // V1.8.25 — Promise.all + refresh global après pour resync DB (cf. P1 V1.8.25)
          Promise.all(activeBookings.map(b => {
            setBookings(prev => prev.map(bk => bk.id === b.id ? {...bk, status:'cancelled'} : bk));
            return api('/api/bookings/' + b.id, { method:'PUT', body:{ status:'cancelled' } });
          })).then(() => {
            if (typeof _scheduleGlobalRefresh === 'function') _scheduleGlobalRefresh();
          }).catch(() => {});
          showNotif(activeBookings.length + ' RDV annulé(s), créneaux libérés');
        }
        // Dans les deux cas, le changement de statut continue (pas de return)
      }
    }
    // ── REGLE: "Client Validé" → show contract modal if no contractData yet ──
    if (newStage === 'client_valide' && !contractData) {
      setContractModal({ contactId, note });
      setContractForm({ amount:'', number:'', date:new Date().toISOString().split('T')[0] });
      return;
    }
    const updates = { pipeline_stage: newStage };
    // Contract data if provided
    if (contractData && !contractData._rdvCreated) {
      updates.contract_amount = contractData.amount || 0;
      updates.contract_number = contractData.number || '';
      updates.contract_date = contractData.date ? contractData.date + 'T' + new Date().toTimeString().slice(0,5) : new Date().toISOString();
      updates.contract_signed = 1;
      updates.contract_status = 'active';
      updates.contract_cancelled_at = '';
      updates.contract_cancel_reason = '';
    }
    // ── REGLE: NRP → auto-create followup schedule ──
    if (newStage === 'nrp' && fromStage !== 'nrp') {
      const delays = [collab.nrp_delay_1||3, collab.nrp_delay_2||7, collab.nrp_delay_3||14, 21, 30];
      const now = new Date();
      const followups = delays.map(d => ({ date: new Date(now.getTime()+d*86400000).toISOString().split('T')[0], done:false }));
      updates.nrp_followups_json = JSON.stringify(followups);
      updates.nrp_next_relance = followups[0].date;
    }
    // ── REGLE: NRP x5+ → proposer Perdu ──
    if (newStage === 'nrp') {
      try {
        const existingFollowups = JSON.parse(ct?.nrp_followups_json || '[]');
        const doneCount = existingFollowups.filter(f => f.done).length;
        if (doneCount >= 5) {
          const passPerdu = confirm('Ce contact a été relancé ' + doneCount + ' fois sans réponse.\n\nVoulez-vous le passer en "Perdu" ?');
          if (passPerdu) {
            const reason = prompt('Motif :') || 'NRP x' + doneCount + ' sans réponse';
            handlePipelineStageChange(contactId, 'perdu', reason);
            return;
          }
        }
      } catch {}
    }
    // Leaving NRP → clear followups
    if (fromStage === 'nrp' && newStage !== 'nrp') {
      updates.nrp_followups_json = JSON.stringify([]);
      updates.nrp_next_relance = '';
    }
    // Append note to contact notes if provided (for Qualifié, etc.)
    if (note && newStage !== 'perdu') {
      const dateStr = new Date().toLocaleDateString('fr-FR', {day:'numeric',month:'short'});
      const stageLabel = PIPELINE_STAGES.find(s=>s.id===newStage)?.label || newStage;
      const newNote = dateStr + ' [' + stageLabel + '] : ' + note;
      updates.notes = (ct?.notes ? ct.notes + '\n' + newNote : newNote);
    }
    // V3: _forceStageChange = action utilisateur explicite, autorise la descente de stage côté backend
    // V4: source=manual + origin contextualisé pour traçabilité
    handleCollabUpdateContact(contactId, { ...updates, _forceStageChange: true, _source: 'manual', _origin: 'pipeline_stage_change', _reason: note || '' });
    // Déverrouiller après save
    delete pipelineActionLockRef.current[contactId];
    // Log pipeline history
    if (fromStage !== newStage) {
      api('/api/data/pipeline-history', { method:'POST', body:{ contactId, companyId:company?.id, fromStage, toStage:newStage, userId:collab.id, userName:collab.name, note }});
    }
    // ── SMS AUTOMATIQUE PAR COLONNE ──
    if (fromStage !== newStage && ct?.phone) {
      try {
        const smsRules = JSON.parse(localStorage.getItem('c360-sms-auto-pipeline-'+collab.id)||'[]');
        const phone = ct.phone.replace(/\s/g,'');
        const replaceTpl = (tpl) => (tpl||'').replace(/\{nom\}/g, ct.name||'').replace(/\{prenom\}/g, ct.firstname||ct.name?.split(' ')[0]||'').replace(/\{email\}/g, ct.email||'').replace(/\{phone\}/g, ct.phone||'').replace(/\{date_rdv\}/g, ct.next_rdv_date?.split('T')[0]||'').replace(/\{heure_rdv\}/g, ct.next_rdv_date?.split('T')[1]?.substring(0,5)||'');
        // SMS sortie de l'ancienne colonne
        const exitRule = smsRules.find(r => r.stageId === fromStage && r.exitEnabled && r.exitText?.trim());
        if (exitRule) {
          const msg = replaceTpl(exitRule.exitText);
          api('/api/sms/send', { method:'POST', body:{ to:phone, content:msg, companyId:company?.id, collabId:collab.id }}).then(()=>console.log('[SMS AUTO] Sortie '+fromStage+' → envoyé')).catch(()=>{});
        }
        // SMS entrée dans la nouvelle colonne
        const entryRule = smsRules.find(r => r.stageId === newStage && r.entryEnabled && r.entryText?.trim());
        if (entryRule) {
          const msg = replaceTpl(entryRule.entryText);
          api('/api/sms/send', { method:'POST', body:{ to:phone, content:msg, companyId:company?.id, collabId:collab.id }}).then(()=>{console.log('[SMS AUTO] Entrée '+newStage+' → envoyé');showNotif('📱 SMS auto envoyé ('+entryRule.label+')');}).catch(()=>{});
        }
      } catch(e) { console.warn('[SMS AUTO] Error:', e); }
    }
  };
  // V1.13.0 — Soumission backend du nouveau contact, avec ou sans bypass anti-doublon.
  // Appelée par handleCollabCreateContact (forceCreate=false) ou par DuplicateOnCreateModal
  // onForceCreate (forceCreate=true) après confirmation utilisateur explicite.
  // V1.13.1.c — accepte reason + justification (relayés au backend V1.13.1.a pour audit log).
  const submitNewContact = (nc, { forceCreate = false, reason = '', justification = '' } = {}) => {
    const ncWithFlags = {
      ...nc,
      _forceCreate: !!forceCreate,
      _forceCreateReason: forceCreate && reason ? reason : undefined,
      _forceCreateJustification: forceCreate && justification ? justification : undefined,
      _pending: true,
    };
    setContacts(p => [...p, ncWithFlags]);
    setShowNewContact(false);
    setNewContactForm({name:'',email:'',phone:'',mobile:'',company:'',address:'',notes:'',pipeline_stage:'nouveau',tags:''});
    showNotif(forceCreate ? 'Contact créé (doublon ignoré)' : 'Contact créé');
    api('/api/data/contacts', { method:'POST', body:ncWithFlags }).then(r => {
      if(!r||r.error||r._forbidden){
        console.error('[CONTACT CREATE FAIL]',r);
        setContacts(p => p.filter(c => c.id !== ncWithFlags.id));
        showNotif('Erreur: '+(r?.error||'création contact échouée'),'danger');
        return;
      }
      if(r._duplicate){
        // Sécurité : ne devrait pas arriver si forceCreate=true (backend bypass).
        // Cas legacy ScheduleRdvModal flow OU race condition.
        setContacts(p => p.filter(c => c.id !== ncWithFlags.id));
        showNotif('Ce contact existait déjà — fusionné','info');
        return;
      }
      if(!r.id){
        console.error('[CONTACT CREATE] server response missing id', r);
        setContacts(p => p.filter(c => c.id !== ncWithFlags.id));
        showNotif('Erreur: id serveur manquant — réessayez','danger');
        return;
      }
      // Reconcile temp id → real backend id, clear pending flag
      setContacts(p => p.map(c => c.id === ncWithFlags.id ? {...c, id: r.id, _pending: false, _forceCreate: undefined} : c));
    });
  };

  // V1.13.1.d — Helper commun : reset formulaire + close duplicate modal après action
  const _closeDupAfterAction = () => {
    setDuplicateOnCreateData(null);
    setNewContactForm({name:'',email:'',phone:'',mobile:'',company:'',address:'',notes:'',pipeline_stage:'nouveau',tags:''});
  };

  // V1.13.1.d — Compléter cette fiche (enrich-only, append-only)
  // enrichPayload calculé côté MatchCard via computeEnrichPayload (Q1+Q2 conformes).
  const handleDuplicateEnrich = async (matchId, enrichPayload) => {
    contactsLocalEditRef.current = Date.now();
    const body = { ...enrichPayload, companyId: company?.id };
    const r = await api(`/api/data/contacts/${matchId}`, { method: 'PUT', body });
    if (r?.success || r?.id || (!r?.error && !r?._forbidden)) {
      // Update local contacts state (merge fields enrichis)
      setContacts(p => p.map(c => c.id === matchId ? { ...c, ...enrichPayload } : c));
      showNotif('Fiche enrichie avec succès');
    } else {
      showNotif('Erreur enrichissement : ' + (r?.error || 'inconnu'), 'danger');
    }
    _closeDupAfterAction();
    setTimeout(() => { contactsLocalEditRef.current = 0; }, 30000);
  };

  // V1.13.1.d — Me partager cette fiche (PUT /:id/share mode:'add')
  const handleDuplicateShare = async (matchId) => {
    contactsLocalEditRef.current = Date.now();
    const r = await api(`/api/data/contacts/${matchId}/share`, {
      method: 'PUT',
      body: { collaboratorId: collab.id, mode: 'add' }
    });
    if (r?.success) {
      // Update local contact's shared_with
      setContacts(p => p.map(c => c.id === matchId
        ? { ...c, shared_with: Array.from(new Set([...(c.shared_with || []), collab.id])) }
        : c
      ));
      showNotif('Fiche partagée avec vous');
    } else if (r?.error === 'TARGET_COLLAB_IS_OWNER') {
      showNotif('Cette fiche vous appartient déjà', 'info');
    } else {
      showNotif('Erreur partage : ' + (r?.error || 'inconnu'), 'danger');
    }
    _closeDupAfterAction();
    setTimeout(() => { contactsLocalEditRef.current = 0; }, 30000);
  };

  // V1.13.1.d — Archiver doublon (POST /:id/archive avec window.confirm 2-step)
  const handleDuplicateArchive = async (matchId) => {
    const target = (contacts || []).find(c => c.id === matchId);
    const targetName = target?.name || 'ce contact';
    const ok = window.confirm(
      `Archiver "${targetName}" ?\n\n` +
      `Le contact sera masqué du CRM/Pipeline mais récupérable via le sous-onglet Archivés.\n` +
      `Les RDV et historiques resteront visibles dans Agenda et Reporting (traçabilité préservée).`
    );
    if (!ok) return;
    contactsLocalEditRef.current = Date.now();
    const r = await api(`/api/data/contacts/${matchId}/archive`, {
      method: 'POST',
      body: { reason: 'Archived during duplicate resolution' }
    });
    if (r?.success || r?.action === 'archived') {
      setContacts(p => p.filter(c => c.id !== matchId));
      setPipelineRightContact(null);
      setSelectedCrmContact(null);
      showNotif('Contact archivé (récupérable)');
    } else {
      showNotif('Erreur archivage : ' + (r?.error || 'inconnu'), 'danger');
    }
    _closeDupAfterAction();
    setTimeout(() => { contactsLocalEditRef.current = 0; }, 30000);
  };

  // V1.13.1.d — Hard delete : délègue à HardDeleteContactModal V1.12.9.d (3 verrous backend)
  const handleDuplicateHardDelete = (target) => {
    _closeDupAfterAction();
    setDupHardDeleteTarget(target);
  };

  // V1.13.1.e — Créer ma fiche en parallèle (cas owner étranger)
  // Utilise le scope-based dup check backend V1.13.1.e : si pas de dup
  // dans MON scope (assignedTo=self), création autorisée même si autre collab a la fiche.
  // Tag _origin pour audit (futur).
  const handleDuplicateCreateMyOwn = () => {
    const snapshot = duplicateOnCreateData?.pendingNewContact?._formSnapshot;
    setDuplicateOnCreateData(null);
    if (snapshot) {
      const tagged = { ...snapshot, _origin: 'duplicate_create_parallel' };
      submitNewContact(tagged, { forceCreate: false });
    }
  };

  const handleCollabCreateContact = () => {
    const fullName = (((typeof newContactForm!=='undefined'?newContactForm:{}).civility?newContactForm.civility+' ':'')+((typeof newContactForm!=='undefined'?newContactForm:{}).firstname||'')+' '+((typeof newContactForm!=='undefined'?newContactForm:{}).lastname||'')).trim() || (typeof newContactForm!=='undefined'?newContactForm:{}).name.trim();
    if (!fullName) { showNotif('Le nom est obligatoire','danger'); return; }
    const tags = (typeof newContactForm!=='undefined'?newContactForm:{}).tags ? (typeof newContactForm!=='undefined'?newContactForm:{}).tags.split(',').map(t=>t.trim()).filter(Boolean) : [];
    const nc = { id:'ct'+Date.now(), companyId:company.id, name:fullName, firstname:(typeof newContactForm!=='undefined'?newContactForm:{}).firstname?.trim()||'', lastname:(typeof newContactForm!=='undefined'?newContactForm:{}).lastname?.trim()||'', civility:(typeof newContactForm!=='undefined'?newContactForm:{}).civility||'', contact_type:(typeof newContactForm!=='undefined'?newContactForm:{}).contact_type||'btc', email:(typeof newContactForm!=='undefined'?newContactForm:{}).email.trim(), phone:(typeof newContactForm!=='undefined'?newContactForm:{}).phone.trim()||(typeof newContactForm!=='undefined'?newContactForm:{}).mobile.trim(), mobile:(typeof newContactForm!=='undefined'?newContactForm:{}).mobile.trim(), company:(typeof newContactForm!=='undefined'?newContactForm:{}).company.trim(), address:(typeof newContactForm!=='undefined'?newContactForm:{}).address.trim(), website:(typeof newContactForm!=='undefined'?newContactForm:{}).website?.trim()||'', siret:(typeof newContactForm!=='undefined'?newContactForm:{}).siret?.trim()||'', totalBookings:0, lastVisit:'', tags, notes:(typeof newContactForm!=='undefined'?newContactForm:{}).notes.trim(), rating:null, docs:[], pipeline_stage:(typeof newContactForm!=='undefined'?newContactForm:{}).pipeline_stage||'nouveau', assignedTo:collab.id, shared_with:[], source:'manual', createdAt:new Date().toISOString() };

    // V1.13.0 — Pré-check anti-doublon. Si match → ouvrir modal au lieu de submit silent.
    if (nc.email || nc.phone) {
      api('/api/data/contacts/check-duplicate-single', {
        method:'POST',
        body:{ email: nc.email||'', phone: nc.phone||'' }
      }).then(checkRes => {
        if (checkRes && checkRes.exists) {
          // V1.13.0-modal-stacking-fix — fermer Nouveau contact AVANT ouvrir Doublon (sinon empilement z-index)
          // Le formulaire newContactForm n'est PAS reset ici : il sera restauré si user clique 'Annuler' sur la modale doublon.
          setShowNewContact(false);
          setDuplicateOnCreateData({
            matches: checkRes.matches || [],
            conflict: !!checkRes.conflict,
            pendingNewContact: { name: nc.name, email: nc.email, phone: nc.phone, _formSnapshot: nc },
          });
          return;
        }
        submitNewContact(nc, { forceCreate: false });
      }).catch(() => submitNewContact(nc, { forceCreate: false }));
      return;
    }
    submitNewContact(nc, { forceCreate: false });
  };
  // Quick add contact from phone number (inline in history/conversations)
  const handleQuickAddContact = () => {
    const isBtb = (typeof phoneQuickAddType!=='undefined'?phoneQuickAddType:null) === 'btb';
    const contactName = isBtb ? (typeof phoneQuickAddCompany!=='undefined'?phoneQuickAddCompany:{}).trim() : `${(typeof phoneQuickAddFirstname!=='undefined'?phoneQuickAddFirstname:{}).trim()} ${(typeof phoneQuickAddLastname!=='undefined'?phoneQuickAddLastname:{}).trim()}`.trim();
    if (!contactName || !(typeof phoneQuickAddPhone!=='undefined'?phoneQuickAddPhone:null)) { showNotif(isBtb ? 'Nom entreprise obligatoire' : 'Prénom et nom obligatoires','danger'); return; }
    // V1.10.2 — Normalisation E.164 systématique avant persist (évite doublons format-related)
    const rawPhone = (typeof phoneQuickAddPhone!=='undefined'?phoneQuickAddPhone:'')||'';
    const normalizedPhone = normalizePhoneNumber(rawPhone) || rawPhone;
    const nc = {
      id:'ct'+Date.now(), companyId:company.id,
      name: contactName,
      contact_type: (typeof phoneQuickAddType!=='undefined'?phoneQuickAddType:null),
      firstname: isBtb ? '' : (typeof phoneQuickAddFirstname!=='undefined'?phoneQuickAddFirstname:{}).trim(),
      lastname: isBtb ? '' : (typeof phoneQuickAddLastname!=='undefined'?phoneQuickAddLastname:{}).trim(),
      company: isBtb ? (typeof phoneQuickAddCompany!=='undefined'?phoneQuickAddCompany:{}).trim() : '',
      siret: isBtb ? (typeof phoneQuickAddSiret!=='undefined'?phoneQuickAddSiret:{}).trim() : '',
      responsable: isBtb ? (typeof phoneQuickAddResponsable!=='undefined'?phoneQuickAddResponsable:{}).trim() : '',
      phone: normalizedPhone,
      mobile: isBtb ? (typeof phoneQuickAddMobile!=='undefined'?phoneQuickAddMobile:{}).trim() : '',
      email: (typeof phoneQuickAddEmail!=='undefined'?phoneQuickAddEmail:{}).trim(),
      website: isBtb ? (typeof phoneQuickAddWebsite!=='undefined'?phoneQuickAddWebsite:{}).trim() : '',
      totalBookings:0, lastVisit:'', tags:[], notes:'', rating:null, docs:[],
      pipeline_stage: (typeof phoneQuickAddStage!=='undefined'?phoneQuickAddStage:null)||'nouveau', assignedTo:collab.id, shared_with:[],
      createdAt: new Date().toISOString()
    };
    setContacts(p => [...p, nc]);
    // Sauvegarder immédiatement en DB (pas attendre sync-batch)
    api('/api/data/contacts', { method:'POST', body: nc }).then(r => {
      if (r?.success) console.log('[CONTACT] Saved to DB:', nc.id);
      else console.warn('[CONTACT] Save failed:', r?.error);
    }).catch(() => {});
    // Update existing call_logs contactId for this phone
    const last9 = phoneMatchKey(normalizedPhone);
    setVoipCallLogs(prev => prev.map(cl => {
      const clPhone = (cl.direction === 'outbound' ? cl.toNumber : cl.fromNumber) || '';
      if (phoneMatchKey(clPhone) === last9 && !cl.contactId) return { ...cl, contactId: nc.id };
      return cl;
    }));
    // V1.10.2 — Auto-relink conversation SMS Hub si l'utilisateur venait du CTA "Créer la fiche"
    try {
      const sourceConvId = _T.smsHubLastUnknownConvId;
      const sourcePhone = _T.smsHubLastUnknownPhone || '';
      const sourceLast9 = phoneMatchKey(sourcePhone);
      const linkConv = (cv) => {
        if (!cv) return;
        api('/api/conversations/'+cv.id, { method:'PUT', body:{ contactId: nc.id } }).catch(()=>{});
        if (typeof setAppConversations === 'function') {
          setAppConversations(prev => (prev||[]).map(c => c.id === cv.id ? { ...c, contactId: nc.id, contactName: nc.name } : c));
        }
      };
      if (sourceConvId && (typeof appConversations !== 'undefined' && Array.isArray(appConversations))) {
        const cv = appConversations.find(c => c.id === sourceConvId);
        if (cv) linkConv(cv);
      }
      // Filet de sécurité : relink toute autre conv SMS du même collab dont le numéro matche
      if ((typeof appConversations !== 'undefined' && Array.isArray(appConversations)) && last9.length >= 9) {
        for (const cv of appConversations) {
          if (cv.contactId) continue;
          if (cv.id === sourceConvId) continue;
          if (phoneMatchKey(cv.clientPhone) !== last9) continue;
          if (cv.collaboratorId && cv.collaboratorId !== collab.id && !isAdminView) continue;
          linkConv(cv);
        }
      }
      _T.smsHubLastUnknownConvId = null;
      _T.smsHubLastUnknownPhone = '';
    } catch (e) { console.warn('[V1.10.2] sms-hub auto-relink err', e?.message); }
    setPhoneQuickAddPhone(null);
    setPhoneQuickAddName('');
    setPhoneQuickAddStage('nouveau');
    setPhoneQuickAddType('btc');
    setPhoneQuickAddFirstname('');
    setPhoneQuickAddLastname('');
    setPhoneQuickAddEmail('');
    setPhoneQuickAddCompany('');
    setPhoneQuickAddSiret('');
    setPhoneQuickAddResponsable('');
    setPhoneQuickAddMobile('');
    setPhoneQuickAddWebsite('');
    showNotif(`${nc.name} ajouté au CRM`);
    // Also update call_logs on server
    api(`/api/voip/calls?companyId=${company.id}`).then(d => { if(Array.isArray(d)) setVoipCallLogs(d); }).catch(()=>{});
  };
  const handleCollabDeleteContact = (id) => {
    // SECURITE: un collaborateur ne peut JAMAIS supprimer un lead
    // Il doit le passer en "Perdu" avec un motif obligatoire
    const reason = prompt('Vous ne pouvez pas supprimer un lead.\nPour le classer comme perdu, indiquez le motif :');
    if (!reason || !reason.trim()) { showNotif('Motif obligatoire pour classer en perdu','danger'); return; }
    handlePipelineStageChange(id, 'perdu', reason.trim());
    setSelectedCrmContact(null);
    setConfirmDelete(null);
    showNotif('Lead classe en Perdu — motif: ' + reason.trim());
  };
  const handleAddCustomStage = () => {
    if (!(typeof newStageName!=='undefined'?newStageName:{}).trim()) return;
    api('/api/data/pipeline-stages', { method:'POST', body:{ companyId:company.id, label:(typeof newStageName!=='undefined'?newStageName:{}).trim(), color:(typeof newStageColor!=='undefined'?newStageColor:null) } }).then(data => {
      if (data?.id) {
        setPipelineStages(p => [...p, { id:data.id, companyId:company.id, label:(typeof newStageName!=='undefined'?newStageName:{}).trim(), color:(typeof newStageColor!=='undefined'?newStageColor:null), position:p.length+100, isDefault:0 }]);
        setNewStageName('');
        setNewStageColor('#7C3AED');
        setShowAddStage(false);
        showNotif('Statut ajouté');
      }
    });
  };
  const handleDeleteCustomStage = (stageId) => {
    api('/api/data/pipeline-stages/'+stageId, { method:'DELETE' }).then(() => {
      setPipelineStages(p => p.filter(s => s.id !== stageId));
      // Reset contacts in this stage to nouveau
      setContacts(p => p.map(c => c.pipeline_stage === stageId ? {...c, pipeline_stage:'nouveau'} : c));
      showNotif('Statut supprimé');
    });
  };
  const handleUpdateCustomStage = (stageId, updates) => {
    setPipelineStages(p => p.map(s => s.id === stageId ? {...s, ...updates} : s));
    api('/api/data/pipeline-stages/'+stageId, { method:'PUT', body:updates });
    showNotif('Statut modifié');
    setEditingStage(null);
  };
  // Drag & drop handlers
  const handleDragStart = (e, contact) => {
    setDragContact(contact);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', contact.id);
    e.target.style.opacity = '0.5';
  };
  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDragContact(null);
    setDragOverStage(null);
  };
  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stageId) (typeof setDragOverStage==='function'?setDragOverStage:function(){})(stageId);
  };
  const handleDragLeave = (e, stageId) => {
    // Only clear if leaving the column entirely
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverStage(null);
  };
  const handleDrop = (e, stageId) => {
    e.preventDefault();
    setDragOverStage(null);
    if (dragContact && (typeof dragContact!=='undefined'?dragContact:{})._linked) {
      handlePipelineStageChange((typeof dragContact!=='undefined'?dragContact:{}).id, stageId);
    }
    setDragContact(null);
  };

  // Chat: load on mount + when switching DM/group
  const loadCollabChatMessages = () => {
    if (!company?.id || !hasRealCollabAuth) return;
    const params = (typeof collabChatMode!=='undefined'?collabChatMode:null) === "dm" && (typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:null)
      ? `companyId=${company.id}&limit=50&senderId=${collab.id}&recipientId=${(typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:{}).id}`
      : `companyId=${company.id}&limit=50`;
    api(`/api/messaging?${params}`).then(r => { if (r?.messages) { setCollabChatMessages(r.messages); setTimeout(() => collabChatEndRef.current?.scrollIntoView({ behavior: "auto" }), 100); } });
  };
  useEffect(() => { loadCollabChatMessages(); }, [company?.id, collabChatMode, (typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:null)?.id]);

  // Chat: heartbeat for online status
  useEffect(() => {
    if (!company?.id || !collab?.id || !hasRealCollabAuth) return;
    const beat = () => api("/api/messaging/heartbeat", { method: "POST", body: { collaboratorId: collab.id, companyId: company.id } });
    beat();
    const interval = setInterval(beat, 10000);
    return () => clearInterval(interval);
  }, [company?.id, collab?.id]);

  // Chat: poll online users
  useEffect(() => {
    if (!company?.id || !hasRealCollabAuth) return;
    const poll = () => api(`/api/messaging/online?companyId=${company.id}`).then(r => { if (r?.online) setCollabChatOnline(r.online); });
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [company?.id]);

  // V3: Chat polling 3s — deps stables, lit messages via ref, dedup par id
  const chatMsgsRef = useRef((typeof collabChatMessages!=='undefined'?collabChatMessages:null));
  chatMsgsRef.current = (typeof collabChatMessages!=='undefined'?collabChatMessages:null);
  useEffect(()=>{
    if((!(typeof collabChatFloating!=='undefined'?collabChatFloating:null) && portalTab!=="messages")||!company?.id||!hasRealCollabAuth) return;
    const poll=()=>{
      const msgs = chatMsgsRef.current || [];
      const latest = msgs.length ? msgs[msgs.length-1].createdAt : "";
      if(!latest) return;
      const params = (typeof collabChatMode!=='undefined'?collabChatMode:null) === "dm" && (typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:null)
        ? `companyId=${company.id}&after=${encodeURIComponent(latest)}&senderId=${collab.id}&recipientId=${(typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:{}).id}`
        : `companyId=${company.id}&after=${encodeURIComponent(latest)}`;
      api(`/api/messaging?${params}`).then(r=>{
        if(r?.messages?.length) {
          setCollabChatMessages(prev=>{
            // V3: dedup par id pour eviter doublons
            const existingIds = new Set(prev.map(m=>m.id));
            const newMsgs = r.messages.filter(m=>!existingIds.has(m.id));
            if(!newMsgs.length) return prev;
            return [...prev,...newMsgs];
          });
          setTimeout(()=>collabChatEndRef.current?.scrollIntoView({behavior:"smooth"}),100);
        }
      });
    };
    const interval=setInterval(poll,3000);
    return ()=>clearInterval(interval);
  },[company?.id,portalTab,collabChatFloating,collabChatMode,(typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:null)?.id]);

  // Chat: send handler — supports text, files, contact cards, voice notes, edit
  const handleCollabSendChat=(overrideType,overrideMsg,overrideAttachments)=>{
    if(!company?.id) return;
    const type=overrideType||'text';
    const msg=(typeof collabChatEditingMsg!=='undefined'?collabChatEditingMsg:null) ? (typeof collabChatInput!=='undefined'?collabChatInput:{}).trim() : (overrideMsg||(collabChatInput||'').trim());
    const atts=overrideAttachments||((typeof collabChatFiles!=='undefined'?collabChatFiles:{}).length?collabChatFiles:null);
    if(type==='text'&&!msg&&!atts) return;

    // Edit mode
    if ((typeof collabChatEditingMsg!=='undefined'?collabChatEditingMsg:null)) {
      api(`/api/messaging/${(typeof collabChatEditingMsg!=='undefined'?collabChatEditingMsg:{}).id}`, { method: "PUT", body: { senderId: collab.id, message: msg } }).then(r => {
        if (r?.success) setCollabChatMessages(prev => prev.map(m => m.id === (typeof collabChatEditingMsg!=='undefined'?collabChatEditingMsg:{}).id ? { ...m, message: msg, editedAt: r.editedAt } : m));
      });
      setCollabChatEditingMsg(null);
      setCollabChatInput("");
      return;
    }

    const now=new Date().toISOString();
    const replyData = collabChatReplyTo ? { replyToId: (typeof collabChatReplyTo!=='undefined'?collabChatReplyTo:{}).id, replyToName: (typeof collabChatReplyTo!=='undefined'?collabChatReplyTo:{}).senderName, replyToMsg: ((typeof collabChatReplyTo!=='undefined'?collabChatReplyTo:{}).message||"").substring(0,80) } : {};
    const recipientId = (typeof collabChatMode!=='undefined'?collabChatMode:null) === "dm" && collabChatDmTarget ? (typeof collabChatDmTarget!=='undefined'?collabChatDmTarget:{}).id : null;
    setCollabChatMessages(prev=>[...prev,{id:"tmp_"+Date.now(),companyId:company.id,senderId:collab.id,senderName:collab.name,message:msg,attachments:atts,type,createdAt:now,recipientId,reactions:{},...replyData}]);
    if(!overrideType){ setCollabChatInput(""); setCollabChatFiles([]); setCollabChatReplyTo(null); }
    setTimeout(()=>collabChatEndRef.current?.scrollIntoView({behavior:"smooth"}),50);
    api("/api/messaging",{method:"POST",body:{companyId:company.id,senderId:collab.id,senderName:collab.name,message:msg,attachments:atts,type,recipientId,...replyData}});
  };
  // Chat: handle file selection
  const handleCollabChatFiles=(e)=>{
    const files=Array.from(e.target.files).slice(0,5);
    files.forEach(f=>{
      if(f.size>5*1024*1024){ showNotif("Fichier trop volumineux (max 5 Mo)","danger"); return; }
      const reader=new FileReader();
      reader.onload=()=>setCollabChatFiles(prev=>[...prev.slice(0,4),{name:f.name,dataUrl:reader.result,size:f.size,type:f.type}]);
      reader.readAsDataURL(f);
    });
    if(collabChatFileRef.current) collabChatFileRef.current.value='';
  };
  // Chat: paste image from clipboard (screenshots)
  const handleCollabChatPaste=(e)=>{
    const items=e.clipboardData?.items;
    if(!items) return;
    for(const item of items){
      if(item.type.startsWith('image/')){
        e.preventDefault();
        const file=item.getAsFile();
        if(!file||file.size>5*1024*1024) return;
        const reader=new FileReader();
        reader.onload=()=>setCollabChatFiles(prev=>[...prev.slice(0,4),{name:'capture_'+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}).replace(':','h')+'.png',dataUrl:reader.result,size:file.size,type:file.type}]);
        reader.readAsDataURL(file);
      }
    }
  };
  // Chat: share a contact card
  const handleCollabShareContactCard=(ct)=>{
    handleCollabSendChat('contact_card','',{name:ct.name,email:ct.email||'',phone:ct.phone||'',pipeline_stage:ct.pipeline_stage||'nouveau',totalBookings:ct.totalBookings||0,id:ct.id});
    setCollabChatShowContactPicker(false);
  };

  const portalNav = [
    { id:"home", icon:"layout-dashboard", label:"Aujourd'hui" },
    ...(((typeof voipConfigured!=='undefined'?voipConfigured:null) || collab.sms_enabled) ? [{ id:"phone", icon:"zap", label:"Pipeline Live" }] : []),
    { id:"agenda", icon:"calendar", label:"Agenda" },
    { id:"crm", icon:"user", label:"Mon CRM" },
    // V1.10.3 — Reporting collab RDV
    { id:"rdv-reporting", icon:"bar-chart-3", label:"Reporting RDV" },
    { id:"settings", icon:"settings", label:"Paramètres", badge: (typeof collabAlertCount!=='undefined'?collabAlertCount:null) > 0 ? (typeof collabAlertCount!=='undefined'?collabAlertCount:null) : null, badgeColor:'#EF4444' },
  ];

  return (
    <CollabProvider value={{
      collab, showNotif,
      // AI Profile tab
      aiProfileTab, setAiProfileTab,
      aiProfileForm, setAiProfileForm,
      aiProfileSaving, setAiProfileSaving,
      aiSuggestions, setAiSuggestions,
      aiSuggestionsLoading, setAiSuggestionsLoading,
      aiHistory, setAiHistory,
      aiHistoryLoading, setAiHistoryLoading,
      aiSuggestionEdit, setAiSuggestionEdit,
      aiHistoryDetail, setAiHistoryDetail,
      // Tables tab
      collabTables,
      collabSelectedTableId, setCollabSelectedTableId,
      collabTableRows, setCollabTableRows,
      collabTableSearch, setCollabTableSearch,
      collabTableLoading,
      collabEditingCell, setCollabEditingCell,
      collabEditingCellValue, setCollabEditingCellValue,
      collabSelectedRowId, setCollabSelectedRowId,
      collabDispatchTasks, setCollabDispatchTasks,
      collabTasksLoading,
      collabSelectedTable,
      collabTableColumns,
      collabFilteredRows,
      loadCollabTableRows,
      handleCollabUpdateRow,
      loadCollabDispatchTasks,
      completeCollabTask,
      skipCollabTask,
      // Messages tab
      company, collabs, contacts,
      collabChatMessages, setCollabChatMessages,
      collabChatInput, setCollabChatInput,
      collabChatFiles, setCollabChatFiles,
      collabChatShowContactPicker, setCollabChatShowContactPicker,
      collabChatShowEmoji, setCollabChatShowEmoji,
      collabChatReplyTo, setCollabChatReplyTo,
      collabChatSearch, setCollabChatSearch,
      collabChatSearchOpen, setCollabChatSearchOpen,
      collabChatHoveredMsg, setCollabChatHoveredMsg,
      collabChatReactionPicker, setCollabChatReactionPicker,
      collabChatMode, setCollabChatMode,
      collabChatDmTarget, setCollabChatDmTarget,
      collabChatOnline,
      collabChatEditingMsg, setCollabChatEditingMsg,
      collabChatIsRecording,
      collabChatRecordingTime,
      setCollabChatFloating, setCollabChatMinimized,
      collabChatEndRef, collabChatFileRef, collabChatInputRef,
      CHAT_EMOJIS, REACTION_EMOJIS,
      addChatReaction, getMsgReactions,
      collabDeleteChat,
      collabStartRecording, collabStopRecording, collabCancelRecording,
      handleCollabSendChat, handleCollabChatFiles, handleCollabChatPaste,
      handleCollabShareContactCard,
      // Objectifs tab
      goalsLoading, myGoals, myTeamGoals, myRewards,
      // Phone/Pipeline Live tab — VoIP + dialer + conversations + history + AI copilot live
      phoneSubTab, setPhoneSubTab,
      phoneLeftCollapsed, setPhoneLeftCollapsed, phoneRightCollapsed, setPhoneRightCollapsed, // hotfix 2026-04-23 — sidebar toggle states missing from provider
      phoneRightAccordion, setPhoneRightAccordion, // hotfix 2026-04-24 — manquait au provider → PhoneTab SMS Hub crashait "Co is not a function
      phoneActiveCall, setPhoneActiveCall,
      phoneActiveScriptId, setPhoneActiveScriptId,
      phoneCallTimer,
      phoneIncomingInfo, setPhoneIncomingInfo,
      phoneCallDetailId, setPhoneCallDetailId,
      phoneCallDetailTab, setPhoneCallDetailTab,
      phoneContactDetailId, setPhoneContactDetailId,
      phoneContactDetailTab, setPhoneContactDetailTab,
      phoneContactEditMode, setPhoneContactEditMode,
      phoneContactEditForm, setPhoneContactEditForm,
      phoneContactSearch, setPhoneContactSearch,
      phoneContactSort, setPhoneContactSort,
      phoneFavorites, setPhoneFavorites,
      phoneCallNotes, setPhoneCallNotes,
      phoneCallTags, setPhoneCallTags,
      phoneCallRatings, setPhoneCallRatings,
      phoneCallFollowups, setPhoneCallFollowups,
      phoneCallAnalyses, setPhoneCallAnalyses,
      phoneCallRecordings, setPhoneCallRecordings,
      phoneCallTranscript, setPhoneCallTranscript,
      phoneCallTranscriptLoading, setPhoneCallTranscriptLoading,
      phoneAnalysisLoading, setPhoneAnalysisLoading,
      phoneAnalysisModal, setPhoneAnalysisModal,
      phoneRecordModal, setPhoneRecordModal,
      phoneShowCallNoteModal, setPhoneShowCallNoteModal,
      phoneCallNoteText, setPhoneCallNoteText,
      phoneCallContext, setPhoneCallContext,
      phoneRecommendedActions, setPhoneRecommendedActions,
      phoneAutoRecap, setPhoneAutoRecap,
      phoneRecordingEnabled, setPhoneRecordingEnabled,
      phoneCallScripts, setPhoneCallScripts,
      phonePipeSearch, setPhonePipeSearch,
      phoneHistorySearch, setPhoneHistorySearch,
      phoneHistoryFilter, setPhoneHistoryFilter,
      phoneSMSText, setPhoneSMSText,
      phoneShowSMS, setPhoneShowSMS,
      phoneScheduledCalls, setPhoneScheduledCalls,
      schedContactMode, setSchedContactMode,
      schedSearchQ, setSchedSearchQ,
      phoneCalMonth, setPhoneCalMonth,
      phoneStatsPeriod, setPhoneStatsPeriod,
      todayCallCount, // wired to context (hotfix 2026-04-23)
      // removed phoneStatsOpen/setPhoneStatsOpen — never declared as state (hotfix 2026-04-23)
      phoneShowCampaignModal, setPhoneShowCampaignModal,
      phoneCampaigns, setPhoneCampaigns,
      phoneDailyGoal, setPhoneDailyGoal,
      phoneVoicemails, setPhoneVoicemails,
      phoneAutoSMS, setPhoneAutoSMS,
      phoneAutoSMSText, setPhoneAutoSMSText,
      phoneOpenHours, setPhoneOpenHours,
      phoneModules, setPhoneModules,
      phoneStreak, setPhoneStreak,
      phoneBadges, setPhoneBadges,
      phoneSMSTemplates, setPhoneSMSTemplates,
      phoneSpeedDial, setPhoneSpeedDial,
      phoneToolbarOrder, setPhoneToolbarOrder,
      phoneToolbarDragIdx, setPhoneToolbarDragIdx,
      phoneToolbarDragOverIdx, setPhoneToolbarDragOverIdx,
      phoneDialerMinimized, setPhoneDialerMinimized,
      phoneDND, setPhoneDND,
      phoneDispositions, setPhoneDispositions,
      phoneBlacklist, setPhoneBlacklist,
      phoneTeamChatOpen, setPhoneTeamChatOpen,
      phoneTeamChatMsg, setPhoneTeamChatMsg,
      phoneTeamChatTab, setPhoneTeamChatTab,
      phoneShowScript, setPhoneShowScript,
      phoneShowContextEditor, setPhoneShowContextEditor,
      phoneLiveTranscript, setPhoneLiveTranscript,
      phoneLiveSentiment, setPhoneLiveSentiment,
      phoneLiveVoiceActivity, setPhoneLiveVoiceActivity,
      phoneLiveSuggestions, setPhoneLiveSuggestions,
      phoneLiveAnalysis, setPhoneLiveAnalysis,
      phoneLastCallSession, setPhoneLastCallSession,
      phoneCopilotLiveData, setPhoneCopilotLiveData,
      phoneCopilotLiveLoading, setPhoneCopilotLiveLoading,
      phoneCopilotChecklist, setPhoneCopilotChecklist,
      phoneCopilotTabData, setPhoneCopilotTabData,
      phoneCopilotTabLoaded, setPhoneCopilotTabLoaded,
      phoneCopilotReactions, setPhoneCopilotReactions,
      phoneCopilotReactionStats, setPhoneCopilotReactionStats,
      phoneCopilotLiveStep, setPhoneCopilotLiveStep,
      voipCallRef, // removed voipDevice/voipCall — never declared (only voipDeviceRef/voipCallRef exist) — hotfix 2026-04-23
      voipState, setVoipState,
      voipCurrentCallLogId, setVoipCurrentCallLogId,
      voipCredits, voipConfigured,
      appMyPhoneNumbers, appPhonePlans,
      appConversations, setAppConversations,
      pdNumbers, setPdNumbers,
      pdParsedList, setPdParsedList,
      pdDuplicates, setPdDuplicates,
      pdStatus, setPdStatus,
      pdCurrentIdx, setPdCurrentIdx,
      pdResults, setPdResults,
      pdStageId, pdContactList, // removed phantom pdResult — hotfix 2026-04-23
      collabCallForms, setCollabCallForms,
      callFormData, setCallFormData,
      callFormResponses, setCallFormResponses,
      callFormResponseAccordion, setCallFormResponseAccordion,
      aiValidationEditing, setAiValidationEditing,
      aiValidationEdits, setAiValidationEdits,
      selConvId, setSelConvId,
      convEvents, setConvEvents,
      convNoteText, setConvNoteText,
      convSmsText, setConvSmsText,
      convSearch, setConvSearch,
      convFilter, setConvFilter,
      convLoading, setConvLoading,
      selectedLine, setSelectedLine,
      // removed phantoms zoom/setZoom — never declared (hotfix 2026-04-23)
      cockpitOpen, setCockpitOpen,
      cockpitMinimized, setCockpitMinimized,
      liveConfig, saveLiveConfig,
      // Phone quickAdd fields (15+)
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
      // CRM tab
      crmSearch, setCrmSearch,
      collabCrmViewMode, setCollabCrmViewMode,
      collabCrmSortKey, setCollabCrmSortKey,
      collabCrmSortDir, setCollabCrmSortDir,
      collabCrmFilterTags, setCollabCrmFilterTags,
      collabCrmFilterStage, setCollabCrmFilterStage,
      collabCrmFilterFollowup, setCollabCrmFilterFollowup,
      collabCrmSelectedIds, setCollabCrmSelectedIds,
      collabCrmBulkStage, setCollabCrmBulkStage,
      collabCrmPage, setCollabCrmPage,
      collabCrmAdvOpen, setCollabCrmAdvOpen,
      collabCrmAdvFilters, setCollabCrmAdvFilters,
      crmColConfig, setCrmColConfig, saveCrmColConfig,
      crmEffectiveOrder, crmEffectiveHidden, crmVisibleCols,
      crmColPanelOpen, setCrmColPanelOpen,
      crmDragCol, setCrmDragCol,
      crmExportModal, setCrmExportModal,
      filteredCollabCrm, collabCrmTotalPages,
      showNewContact, setShowNewContact,
      newContactForm, setNewContactForm,
      scanImageModal, setScanImageModal,
      csvImportModal, setCsvImportModal,
      showAddStage, setShowAddStage,
      newStageName, setNewStageName,
      newStageColor, setNewStageColor,
      editingStage, setEditingStage,
      editStageForm, setEditStageForm,
      confirmDeleteStage, setConfirmDeleteStage,
      editingContact, setEditingContact,
      contractModal, setContractModal,
      contractForm, setContractForm,
      contactAnalysesHistory, setContactAnalysesHistory,
      contactAnalysesHistoryModal, setContactAnalysesHistoryModal,
      // removed phantoms histOpen/setHistOpen — never declared (hotfix 2026-04-23)
      // removed phantoms statusHist/setStatusHist — never declared (hotfix 2026-04-23)
      dragContact, setDragContact,
      dragOverStage, setDragOverStage,
      dragColumnId, setDragColumnId,
      pipelineStages, setPipelineStages,
      // V1.8.19 — exposer le mode résolu + flags pour les sous-composants pipeline-aware
      _pipelineMode, _pipelineReadOnly, _pipelineTemplateMeta, _pipeResolved,
      contactFieldDefs, setContactFieldDefs,
      pipelinePopupContact, setPipelinePopupContact,
      pipelinePopupHistory, setPipelinePopupHistory,
      pipelineNrpExpanded, setPipelineNrpExpanded,
      pipelineRightTab, setPipelineRightTab,
      pipelineRdvModal, setPipelineRdvModal,
      pipelineRdvForm, setPipelineRdvForm,
      pipeBulkStage, setPipeBulkStage,
      pipeBulkModal, setPipeBulkModal,
      pipeBulkSmsText, setPipeBulkSmsText,
      pipeSelectedIds, setPipeSelectedIds,
      iaHubCollapse, setIaHubCollapse,
      notifList, setNotifList,
      notifUnread, setNotifUnread,
      setBookings, setContacts, setCollabAlertCount,
      orderedStages, PIPELINE_STAGES, CRM_ALL_COLS, DEFAULT_STAGES,
      // Agenda tab
      calendars, setCalendars,
      weekOffset, setWeekOffset,
      monthOffset, setMonthOffset,
      selectedDay, setSelectedDay,
      selectedBooking, setSelectedBooking,
      calAccordionOpen, setCalAccordionOpen,
      mrStatusFilter, setMrStatusFilter,
      editCalModal, setEditCalModal,
      editCalSlugAvail, setEditCalSlugAvail,
      actionLoading, setActionLoading,
      viewMode, setViewMode,
      agendaZoom, setAgendaZoom,
      agendaWorkHours, setAgendaWorkHours,
      gridThemeId, setGridThemeId,
      customGridColors, setCustomGridColors,
      showGridColors, setShowGridColors,
      gridColorPresets,
      myBookings, myCalendars, monthDays, agendaFillRate,
      getBookingAt, getGoogleEventAt, updateBooking, cancelBookingAndCascade,
      // Home tab
      bookings, voipCallLogs, smsCredits,
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
      // Availability tab
      userAvail, myVacations, todayStr,
      availBuffer, availMaxPerDay, availBreaks,
      newVacDate, setNewVacDate,
      setAvails, setVacations,
      saveAvail, saveAvailBuffer, saveAvailMaxPerDay, saveAvailBreaks,
      toggleDay, updateSlot, addSlot, removeSlot,
      // ── Hotfix audit 2026-04-23 — wire missing portal-declared symbols to context ──
      CRM_STD_COLS,
      _tempColor,
      _tempEmoji,
      _tempLabel,
      agendaScrolledRef,
      cScoreColor,
      cScoreLabel,
      collabNotesTimerRef,
      collabPipelineAnalytics,
      contactsLocalEditRef,
      contactsRef,
      fmtDur,
      fmtPhone,
      getCollabLeadScore,
      getLeadTemperature,
      googleEventsProp,
      handleCollabDeleteContact,
      handleCollabUpdateContact,
      handleColumnDragStart,
      handleColumnDrop,
      handleDeleteCustomStage,
      handleDragLeave,
      handleDragOver,
      handleDragStart,
      handleDrop,
      handlePipelineStageChange,
      handleUpdateCustomStage,
      isModuleOn,
      linkVisitorToContacts,
      myCrmContacts,
      openCallDetail,
      playDtmf,
      prefillKeypad,
      setV7TransferModal,
      setV7TransferTarget,
      togglePhoneLeftPanel,
      v7FollowersMap,

      // ── Hotfix audit 2026-04-23 (v2) — JSX attr handler pattern ──
      handleAddCustomStage, handleCollabCreateContact, handleColumnDragEnd, handleDragEnd, acceptCollabIncomingCall, endPhoneCall, rejectCollabIncomingCall, togglePhoneDND, togglePhoneRecording,

      // ── Hotfix audit 2026-04-23 (v3) — v5 stripper missed JSX scan due to unbalanced template literals ──
      googleLoading, handleQuickAddContact, phoneTeamChatRef, stopAutoDialer, togglePhoneAutoRecap, togglePhoneAutoSMS, togglePhoneRightPanel,

      // ── AST audit 2026-04-23 (v7) — complete phantom elimination via @babel/parser ──
      CALL_TAGS, PHONE_MODULES, ZOOM_LEVELS, _defaultLiveConfig, addToBlacklist, autoDialerNext, basePreset, collabContactTags, collabPaginatedContacts, collabsProp, dayBookings, dayDate, exportICS, fetchCallTranscript, generateCallAnalysis, googleConnected, gridTheme, hours, isAdminView, isAvailableSlot, monthMonth, monthYear, myGoogleEvents, perduMotifModal, postCallResultModal, removeFromBlacklist, removeScheduledCall, saveCallRecording, savePhoneCallRating, savePhoneCallTag, saveScriptsDual, setPerduMotifModal, setPostCallResultModal, startAutoDialer, syncGoogle, today, toggleModule, togglePhoneFav, weekDates,

    }}>
    <div style={{ display:"flex", minHeight:"100vh", background:T.bg, fontFamily:"'Onest','Outfit',system-ui,sans-serif", color:T.text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500;600;700;800&display=swap'); * {margin:0;padding:0;box-sizing:border-box;} ::-webkit-scrollbar{width:5px;} ::-webkit-scrollbar-thumb{background:${T.border2};border-radius:3px;}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes shimmer{0%{background-position:200% 0;}100%{background-position:-200% 0;}}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes fadeInScale{from{opacity:0;transform:scale(0.95);}to{opacity:1;transform:scale(1);}}
@keyframes slideInRight{from{opacity:0;transform:translateX(30px);}to{opacity:1;transform:translateX(0);}}`}</style>

            {/* V7 TRANSFER MODAL */}
            {v7TransferModal && (
              <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setV7TransferModal(null)}>
                <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:16,padding:24,width:420,maxWidth:'90vw',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                    <div style={{width:36,height:36,borderRadius:10,background:'#8B5CF618',display:'flex',alignItems:'center',justifyContent:'center',color:'#8B5CF6'}}><I n='users' s={18}/></div>
                    <div>
                      <div style={{fontSize:16,fontWeight:700,color:T.text}}>Transférer un contact</div>
                      <div style={{fontSize:12,color:T.text3}}>{v7TransferModal.contact?.name}</div>
                    </div>
                  </div>
                  <div style={{marginBottom:16}}>
                    <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:6,display:'block'}}>Transférer à :</label>
                    <select value={v7TransferTarget} onChange={e=>(typeof setV7TransferTarget==='function'?setV7TransferTarget:function(){})(e.target.value)} style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:14}}>
                      <option value=''>Sélectionner un collaborateur...</option>
                      {(collabs||[]).filter(c=>c.id!==collab.id).map(c=>(<option key={c.id} value={c.id}>{c.name} {c.email ? '('+c.email+')' : ''}</option>))}
                    </select>
                  </div>
                  <div style={{fontSize:12,color:T.text3,marginBottom:16,padding:10,borderRadius:8,background:T.accentBg}}>
                    <I n='info' s={12}/> Le contact sera transféré. Vous resterez en suivi comme source.
                  </div>
                  <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                    <div onClick={()=>setV7TransferModal(null)} style={{padding:'8px 16px',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',color:T.text2,background:T.bg,border:'1px solid '+T.border}}>Annuler</div>
                    <div onClick={handleV7Transfer} style={{padding:'8px 20px',borderRadius:10,fontSize:13,fontWeight:700,cursor:(typeof v7TransferTarget!=='undefined'?v7TransferTarget:null)&&!(typeof v7TransferLoading!=='undefined'?v7TransferLoading:null)?'pointer':'not-allowed',color:'#fff',background:(typeof v7TransferTarget!=='undefined'?v7TransferTarget:null)?'#8B5CF6':'#8B5CF660',opacity:(typeof v7TransferLoading!=='undefined'?v7TransferLoading:null)?0.6:1}}>
                      {(typeof v7TransferLoading!=='undefined'?v7TransferLoading:null)?'Transfert...':'Transférer'}
                    </div>
                  </div>
                </div>
              </div>
            )}

      {/* Notification toast */}
      {notification && (
        <div style={{ position:"fixed", top:20, right:20, zIndex:9999, padding:"12px 20px", borderRadius:12, background: notification.type==="success"?T.successBg:notification.type==="danger"?T.dangerBg:T.warningBg, border:`1px solid ${notification.type==="success"?T.success:notification.type==="danger"?T.danger:T.warning}30`, color: notification.type==="success"?T.success:notification.type==="danger"?T.danger:T.warning, fontSize:13, fontWeight:600, boxShadow:"0 8px 30px rgba(0,0,0,0.12)", display:"flex", alignItems:"center", gap:8, animation:"slideInRight .3s ease", cursor:"pointer" }} onClick={()=>setNotification(null)}>
          <I n={notification.type==="success"?"check-circle":notification.type==="danger"?"alert-circle":"bell"} s={16}/> {notification.msg}
        </div>
      )}

      {/* ── NRP POST-CALL MODAL ── */}
      {(typeof nrpPostCallModal!=='undefined'?nrpPostCallModal:null) && (()=>{
        const m = (typeof nrpPostCallModal!=='undefined'?nrpPostCallModal:null);
        const ct = m.contact;
        const stages = ((typeof pipelineStages!=='undefined'?pipelineStages:null)||[]).filter(s => s.id !== 'nrp' && s.id !== 'perdu');
        const nrpDoneCount = m.followups.filter(f=>f.done).length;

        const handleStillNrp = () => {
          if (m.isNrp) {
            // Increment NRP counter
            const newFollowup = { date: new Date().toISOString(), done: true, note: 'Tentative appel #' + (nrpDoneCount+1) + ' — pas de reponse' };
            const updated = [...m.followups, newFollowup];
            handleCollabUpdateContact(ct.id, { nrp_followups_json: JSON.stringify(updated) });
            api('/api/data/pipeline-history', { method:'POST', body:{ contactId:ct.id, companyId:company?.id, fromStage:'nrp', toStage:'nrp', userId:collab.id, userName:collab.name, note:'Tentative appel #'+(nrpDoneCount+1)+' — NRP (pas de reponse)' }});
            showNotif(ct.name + ' — NRP #' + (nrpDoneCount+1) + ' enregistre', 'warning');
          } else {
            // Short call → move to NRP
            handlePipelineStageChange(ct.id, 'nrp', 'Appel sans reponse (' + m.duration + 's)');
            showNotif(ct.name + ' passe en NRP');
          }
          setNrpPostCallModal(null);
        };

        const handleAnswered = (stageId) => {
          const note = m.isNrp ? 'A repondu apres ' + (nrpDoneCount+1) + ' tentatives NRP' : 'A repondu';
          handlePipelineStageChange(ct.id, stageId, note);
          const stageLabel = ((typeof pipelineStages!=='undefined'?pipelineStages:null)||[]).find(s=>s.id===stageId)?.label || stageId;
          showNotif(ct.name + ' → ' + stageLabel + ' ✅');
          setNrpPostCallModal(null);
        };

        const nrpHistory = m.followups.filter(f=>f.done).slice().reverse();
        const maxNrp = 20;
        const progress = Math.min(nrpDoneCount / maxNrp * 100, 100);

        return <div style={{ position:'fixed', inset:0, zIndex:10000, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', animation:'fadeInScale .2s ease' }}>
          <div style={{ background:T.card||'#fff', borderRadius:20, width:420, maxHeight:'85vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', animation:'fadeInScale .3s ease' }}>
            {/* Header */}
            <div style={{ padding:'24px 24px 16px', background:'linear-gradient(135deg, #1E293B, #0F172A)', borderRadius:'20px 20px 0 0', color:'#fff' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                <div style={{ width:44, height:44, borderRadius:14, background:'#EF444420', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <I n="phone-off" s={22} color="#EF4444"/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:16, fontWeight:700 }}>Appel termine</div>
                  <div style={{ fontSize:13, color:'#94A3B8' }}>{ct.name || 'Contact'}{m.duration ? ' · '+m.duration+'s' : ''}</div>
                </div>
                <div onClick={()=>setNrpPostCallModal(null)} style={{ cursor:'pointer', padding:4, borderRadius:8, background:'#ffffff10' }}><I n="x" s={18} color="#94A3B8"/></div>
              </div>

              {m.isNrp && <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:28, fontWeight:800, color:'#EF4444' }}>{nrpDoneCount}</span>
                  <span style={{ fontSize:12, color:'#94A3B8' }}>tentative{nrpDoneCount>1?'s':''} NRP</span>
                </div>
                <div style={{ height:6, borderRadius:3, background:'#1E293B', overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:3, width:progress+'%', background: progress > 75 ? '#EF4444' : progress > 50 ? '#F59E0B' : '#3B82F6', transition:'width .5s ease' }}/>
                </div>
              </div>}

              {m.isShortCall && <div style={{ padding:'8px 12px', borderRadius:10, background:'#F59E0B15', border:'1px solid #F59E0B30', marginTop:4 }}>
                <div style={{ fontSize:12, color:'#F59E0B', fontWeight:600 }}>⚡ Appel tres court ({m.duration}s) — pas de reponse ?</div>
              </div>}
            </div>

            {/* Body */}
            <div style={{ padding:'20px 24px' }}>
              <div style={{ fontSize:14, fontWeight:600, color:T.text, marginBottom:16 }}>
                {m.isNrp ? 'Le contact a-t-il repondu ?' : 'Que s\'est-il passe ?'}
              </div>

              {/* Option 1: Il a repondu */}
              <div style={{ marginBottom:12 }}>
                <div onClick={()=>(typeof setNrpModalShowStages==='function'?setNrpModalShowStages:function(){})(!nrpModalShowStages)} style={{ padding:'14px 16px', borderRadius:12, border:'2px solid #22C55E40', background:'#22C55E08', cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'all .15s ease' }}>
                  <div style={{ width:32, height:32, borderRadius:10, background:'#22C55E15', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <I n="check-circle" s={18} color="#22C55E"/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#22C55E' }}>Oui, il a repondu !</div>
                    <div style={{ fontSize:11, color:T.text3 }}>Choisir un nouveau statut</div>
                  </div>
                  <I n={(typeof nrpModalShowStages!=='undefined'?nrpModalShowStages:null)?'chevron-up':'chevron-down'} s={16} color={T.text3}/>
                </div>

                {(typeof nrpModalShowStages!=='undefined'?nrpModalShowStages:null) && <div style={{ padding:'10px 8px', display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
                  {stages.map(s => (
                    <div key={s.id} onClick={()=>handleAnswered(s.id)} style={{ padding:'8px 16px', borderRadius:10, background:(s.color||'#3B82F6')+'15', border:'1px solid '+(s.color||'#3B82F6')+'30', color:s.color||'#3B82F6', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s ease' }}>
                      {s.label}
                    </div>
                  ))}
                </div>}
              </div>

              {/* Option 2: Toujours NRP */}
              <div onClick={handleStillNrp} style={{ padding:'14px 16px', borderRadius:12, border:'2px solid #EF444440', background:'#EF444408', cursor:'pointer', display:'flex', alignItems:'center', gap:10, marginBottom:16, transition:'all .15s ease' }}>
                <div style={{ width:32, height:32, borderRadius:10, background:'#EF444415', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <I n="phone-missed" s={18} color="#EF4444"/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#EF4444' }}>
                    {m.isNrp ? 'Toujours pas repondu' : 'Pas de reponse — passer en NRP'}
                  </div>
                  <div style={{ fontSize:11, color:T.text3 }}>
                    {m.isNrp ? 'NRP #'+(nrpDoneCount+1)+' sera enregistre' : 'Le contact sera mis en NRP'}
                  </div>
                </div>
                {m.isNrp && <span style={{ background:'#EF4444', color:'#fff', fontSize:11, fontWeight:800, padding:'3px 10px', borderRadius:8 }}>#{nrpDoneCount+1}</span>}
              </div>

              {/* Historique NRP */}
              {m.isNrp && nrpHistory.length > 0 && <div>
                <div onClick={()=>(typeof setNrpModalShowHistory==='function'?setNrpModalShowHistory:function(){})(!nrpModalShowHistory)} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', padding:'8px 0', borderTop:'1px solid '+T.border }}>
                  <I n="clock" s={13} color={T.text3}/>
                  <span style={{ fontSize:11, fontWeight:700, color:T.text3, flex:1 }}>Historique NRP ({nrpHistory.length} tentative{nrpHistory.length>1?'s':''})</span>
                  <I n={(typeof nrpModalShowHistory!=='undefined'?nrpModalShowHistory:null)?'chevron-up':'chevron-down'} s={14} color={T.text3}/>
                </div>

                {(typeof nrpModalShowHistory!=='undefined'?nrpModalShowHistory:null) && <div style={{ maxHeight:200, overflow:'auto', paddingTop:8 }}>
                  {nrpHistory.map((f, i) => {
                    const d = f.date ? new Date(f.date) : null;
                    return <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', marginBottom:4, borderRadius:8, background:'#EF444406', border:'1px solid #EF444410' }}>
                      <div style={{ width:22, height:22, borderRadius:7, background:'#EF444415', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#EF4444' }}>
                        {nrpHistory.length - i}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, fontWeight:600, color:T.text }}>{f.note || 'NRP #'+(nrpHistory.length-i)}</div>
                        {d && <div style={{ fontSize:10, color:T.text3 }}>{d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})} a {d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>}
                      </div>
                      <I n="phone-missed" s={12} color="#EF4444"/>
                    </div>;
                  })}
                </div>}
              </div>}
            </div>
          </div>
        </div>;
      })()}

      {/* Incoming call banner (compact — accept/reject on keypad) */}
      {voipState === 'incoming' && (typeof phoneIncomingInfo!=='undefined'?phoneIncomingInfo:null) && (
        <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:9999, background:'linear-gradient(135deg,#7C2D12,#431407)', borderBottom:'2px solid #F59E0B40', padding:'12px 20px', display:'flex', alignItems:'center', gap:12, boxShadow:'0 4px 24px rgba(0,0,0,0.3)', animation:'fadeInScale .3s ease' }}>
          <div style={{ width:36, height:36, borderRadius:18, background:'#F59E0B20', display:'flex', alignItems:'center', justifyContent:'center', animation:'pulse 1.5s infinite', flexShrink:0 }}><I n="phone-incoming" s={18} style={{ color:'#F59E0B' }}/></div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Appel entrant</div>
            <div style={{ fontSize:12, color:'#ffffff80' }}>{(typeof phoneIncomingInfo!=='undefined'?phoneIncomingInfo:{}).contactName || 'Numero inconnu'} · {(typeof phoneIncomingInfo!=='undefined'?phoneIncomingInfo:{}).from}</div>
          </div>
          <div onClick={acceptCollabIncomingCall} style={{ padding:'8px 16px', borderRadius:10, background:'linear-gradient(135deg,#22C55E,#16A34A)', cursor:'pointer', fontSize:12, fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:6, boxShadow:'0 2px 12px rgba(34,197,94,0.4)' }}><I n="phone" s={14}/> Decrocher</div>
          <div onClick={rejectCollabIncomingCall} style={{ padding:'8px 16px', borderRadius:10, background:'linear-gradient(135deg,#EF4444,#DC2626)', cursor:'pointer', fontSize:12, fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:6 }}><I n="phone-off" s={14}/> Refuser</div>
        </div>
      )}

      {/* Sidebar — retractable */}
      {(()=>{
        const navCollapsed = !!(typeof callFormAccordion!=='undefined'?callFormAccordion:{})._navCollapsed;
        const toggleNav = () => { setCallFormAccordion(p => ({...p, _navCollapsed: !p._navCollapsed})); try { localStorage.setItem('c360-nav-collapsed-'+collab.id, !navCollapsed?'1':'0'); } catch {} };
        return <aside style={{ width:navCollapsed?56:240, background:T.surface, borderRight:`1px solid ${T.border}`, padding:navCollapsed?"12px 0":"20px 0", display:"flex", flexDirection:"column", flexShrink:0, transition:'width .2s ease', overflow:'hidden' }}>
        {!navCollapsed ? <>
        <div style={{ padding:"0 16px", marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
            <Logo s={32} rounded={9} />
            <span style={{ fontSize:17, fontWeight:700, letterSpacing:-0.3, flex:1 }}>Calendar360</span>
            <div onClick={toggleNav} style={{cursor:'pointer',padding:4,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center'}} title="Replier le menu"><I n="panel-left-close" s={16} style={{color:T.text3}}/></div>
          </div>
          <div style={{ padding:"10px 12px", borderRadius:10, background: collab.color+"0C", border:`1px solid ${collab.color}22` }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <div style={{ position:"relative" }}>
                <Avatar name={collab.name} color={collab.color} size={28}/>
                <span style={{ position:"absolute", bottom:-1, right:-1, width:9, height:9, borderRadius:5, background:(typeof isOnline!=='undefined'?isOnline:null)?"#22C55E":"#EF4444", border:`2px solid ${T.surface}` }} title={(typeof isOnline!=='undefined'?isOnline:null)?"En ligne":"Hors ligne"}/>
              </div>
              <div style={{flex:1}}>
                <div style={{ fontSize:13, fontWeight:700, color:T.text }}>{collab.name}</div>
                <div style={{ fontSize:10, color:T.text3 }}>{collab.email}</div>
              </div>
              {/* SMS credits badge */}
              {(typeof smsCredits!=='undefined'?smsCredits:null)!=null && <div onClick={()=>setPortalTab('settings')} title={(typeof smsCredits!=='undefined'?smsCredits:null)+' crédits SMS restants'} style={{display:'flex',alignItems:'center',gap:3,padding:'2px 7px',borderRadius:6,background:((typeof smsCredits!=='undefined'?smsCredits:null)<20?'#EF4444':(typeof smsCredits!=='undefined'?smsCredits:null)<50?'#F59E0B':'#22C55E')+'15',border:'1px solid '+((typeof smsCredits!=='undefined'?smsCredits:null)<20?'#EF4444':(typeof smsCredits!=='undefined'?smsCredits:null)<50?'#F59E0B':'#22C55E')+'30',cursor:'pointer',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.05)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
                <I n="smartphone" s={10} style={{color:(typeof smsCredits!=='undefined'?smsCredits:null)<20?'#EF4444':(typeof smsCredits!=='undefined'?smsCredits:null)<50?'#F59E0B':'#22C55E'}}/>
                <span style={{fontSize:9,fontWeight:700,color:(typeof smsCredits!=='undefined'?smsCredits:null)<20?'#EF4444':(typeof smsCredits!=='undefined'?smsCredits:null)<50?'#F59E0B':'#22C55E'}}>{smsCredits}</span>
              </div>}
              <div style={{ position:'relative' }}>
                <div onClick={(e) => { e.stopPropagation(); setNotifOpen(p=>!p); }} style={{ cursor:'pointer', position:'relative', padding:4 }} title="Notifications">
                  <I n="bell" s={18} color={notifUnread>0?"#2563EB":T.text3}/>
                  {notifUnread > 0 && <span style={{ position:'absolute', top:-2, right:-4, background:'#2563EB', color:'#fff', fontSize:9, fontWeight:800, borderRadius:10, padding:'1px 5px', minWidth:16, textAlign:'center', border:'2px solid '+T.surface }}>{notifUnread}</span>}
                </div>
                {notifOpen && <><div onClick={()=>setNotifOpen(false)} style={{ position:'fixed', inset:0, zIndex:99998 }}/><div onClick={(e)=>e.stopPropagation()} style={{ position:'fixed', top:60, left:180, width:320, maxHeight:400, overflowY:'auto', background:T.card, border:`1px solid ${T.border}`, borderRadius:12, boxShadow:'0 12px 32px rgba(0,0,0,0.15)', zIndex:99999 }}>
                  <div style={{ padding:'10px 14px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:13, fontWeight:700, color:T.text }}>Notifications</span>
                    {notifUnread>0&&<span onClick={()=>{api('/api/notifications/read',{method:'POST',body:{all:true}}).then(()=>{setNotifUnread(0);setNotifList([]);});}} style={{ fontSize:11, color:T.accent, cursor:'pointer', fontWeight:600 }}>Tout marquer lu</span>}
                  </div>
                  {notifList.length===0?<div style={{ padding:24, textAlign:'center', color:T.text3, fontSize:12 }}><I n="bell-off" s={28} style={{color:T.text3+'40',display:'block',margin:'0 auto 8px'}}/> Aucune notification</div>:
                  notifList.map(n=>{
                    const NOTIF_STYLE = {
                      leads_batch:    { icon:'flame',        color:'#22C55E', cta:'Voir mes leads' },
                      lead_assigned:  { icon:'target',       color:'#22C55E', cta:'Ouvrir le contact' },
                      leads_imported: { icon:'inbox',        color:'#3B82F6', cta:'Voir les flux' },
                      leads_reassigned:{ icon:'refresh-cw',  color:'#F59E0B', cta:null },
                      lead_priority:  { icon:'zap',          color:'#8B5CF6', cta:'Voir le contact' },
                      call_answered:  { icon:'phone',        color:'#22C55E', cta:null },
                      call_missed:    { icon:'phone-missed', color:'#EF4444', cta:'Rappeler' },
                      sms_inbound:    { icon:'message-square',color:'#3B82F6',cta:'Repondre' },
                      client_message: { icon:'message-circle',color:'#2563EB',cta:'Voir le message' },
                    };
                    const ns = NOTIF_STYLE[n.type] || { icon:'bell', color:'#64748B', cta:null };
                    return <div key={n.id} onClick={()=>{
                      if(n.contactId){const ct=contacts.find(c=>c.id===n.contactId);if(ct){setSelectedCrmContact(ct);setCollabFicheTab('client_msg');setPortalTab('crm');}}
                      else if(n.type==='leads_batch'||n.type==='lead_assigned') setPortalTab('crm');
                      api('/api/notifications/read',{method:'POST',body:{ids:[n.id]}}).then(()=>{setNotifList(p=>p.filter(x=>x.id!==n.id));setNotifUnread(p=>Math.max(0,p-1));});
                      setNotifOpen(false);
                    }} style={{ padding:'10px 14px', borderBottom:`1px solid ${T.border}08`, cursor:'pointer', display:'flex', gap:10, alignItems:'flex-start' }} onMouseEnter={e=>e.currentTarget.style.background=T.bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{ width:34, height:34, borderRadius:10, background:ns.color+'14', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><I n={ns.icon} s={16} style={{color:ns.color}}/></div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n.title||'Notification'}</div>
                        <div style={{ fontSize:11, color:T.text2, marginTop:1, lineHeight:'1.3', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{n.detail}</div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:3 }}>
                          <span style={{ fontSize:10, color:T.text3+'80' }}>{(()=>{try{const d=new Date(n.createdAt);const diff=Math.floor((Date.now()-d)/60000);if(diff<1)return"A l'instant";if(diff<60)return diff+" min";if(diff<1440)return Math.floor(diff/60)+"h";return d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});}catch{return'';}})()}</span>
                          {ns.cta && <span style={{ fontSize:10, fontWeight:700, color:ns.color }}>{ns.cta} →</span>}
                        </div>
                      </div>
                    </div>;
                  })}
                </div></>}
              </div>
              {(typeof collabAlertCount!=='undefined'?collabAlertCount:null) > 0 && (
                <div onClick={(e) => { e.stopPropagation(); setPortalTab('signalements'); }} style={{ cursor:'pointer', position:'relative', padding:4 }} title={`${collabAlertCount} signalement${collabAlertCount>1?'s':''} non lu${collabAlertCount>1?'s':''}`}>
                  <I n="shield-alert" s={18} color="#EF4444"/>
                  <span style={{ position:'absolute', top:-2, right:-4, background:'#EF4444', color:'#fff', fontSize:9, fontWeight:800, borderRadius:10, padding:'1px 5px', minWidth:16, textAlign:'center', border:'2px solid '+T.surface }}>{collabAlertCount}</span>
                </div>
              )}
            </div>
            <div style={{ fontSize:10, color:T.text3, display:"flex", gap:6, alignItems:"center" }}>
              <I n="key" s={10}/> Code : <span style={{ fontFamily:"monospace", fontWeight:700, color:collab.color }}>{collab.code}</span>
            </div>
            {isAdminView && <div onClick={onBack} style={{marginTop:8,display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:600,color:T.accent,background:T.accentBg,transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+'20'} onMouseLeave={e=>e.currentTarget.style.background=T.accentBg}><I n="arrow-left" s={13}/> Retour admin</div>}
            {!isAdminView && <div onClick={() => { localStorage.removeItem("calendar360-session"); window.location.reload(); }} style={{marginTop:8,display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:600,color:'#EF4444',background:'#EF444408',transition:'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background='#EF444418'} onMouseLeave={e=>e.currentTarget.style.background='#EF444408'}><I n="log-out" s={13}/> Deconnexion</div>}
          </div>
        </div>

        <nav style={{ flex:1, padding:"0 8px" }}>
          {portalNav.map(item => item.separator ? (
            <div key={item.id} style={{ padding:"12px 12px 4px", fontSize:10, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:0.8 }}>{item.label}</div>
          ) : (
            <div key={item.id} onClick={() => setPortalTab(item.id)} title={item.subtitle||''} style={{
              display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, marginBottom:2,
              cursor:"pointer", fontSize:13, fontWeight: (portalTab===item.id||(item.id==='settings'&&_MIGRATED_TABS.includes(portalTab)))?600:400,
              background: (portalTab===item.id||(item.id==='settings'&&_MIGRATED_TABS.includes(portalTab)))?T.accentBg:"transparent",
              color: (portalTab===item.id||(item.id==='settings'&&_MIGRATED_TABS.includes(portalTab)))?T.accent:T.text2,
              borderLeft: (portalTab===item.id||(item.id==='settings'&&_MIGRATED_TABS.includes(portalTab)))?`3px solid ${T.accent}`:"3px solid transparent",
              transition:"all .15s ease",
            }}><I n={item.icon} s={17}/><span>{item.label}</span>{item.badge?<span style={{marginLeft:'auto',background:item.badgeColor||T.accent,color:'#fff',fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:10,minWidth:18,textAlign:'center'}}>{item.badge}</span>:null}</div>
          ))}
        </nav>

        </> : <>
        {/* Mode collapsed — icones seulement */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'0 4px'}}>
          <div onClick={toggleNav} style={{cursor:'pointer',padding:8,borderRadius:8,marginBottom:8,display:'flex',alignItems:'center',justifyContent:'center'}} title="Ouvrir le menu"><I n="panel-left-open" s={18} style={{color:T.text3}}/></div>
          <div style={{width:32,height:32,borderRadius:10,background:collab.color+'15',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:4}}>
            <span style={{fontSize:13,fontWeight:800,color:collab.color}}>{(collab.name||'?')[0]}</span>
          </div>
          {isAdminView && <div onClick={onBack} style={{width:40,height:40,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',marginBottom:8}} title="Retour admin"><I n="arrow-left" s={18} style={{color:T.accent}}/></div>}
          {!isAdminView && <div onClick={() => { localStorage.removeItem("calendar360-session"); window.location.reload(); }} style={{width:40,height:40,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',marginBottom:8}} title="Déconnexion"><I n="log-out" s={18} style={{color:'#EF4444'}}/></div>}
          {portalNav.filter(item=>!item.separator).map(item => (
            <div key={item.id} onClick={() => setPortalTab(item.id)} style={{
              width:40,height:40,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',
              cursor:'pointer',position:'relative',
              background:(portalTab===item.id||(item.id==='settings'&&_MIGRATED_TABS.includes(portalTab)))?T.accentBg:'transparent',
              transition:'all .15s',
            }} title={item.label}>
              <I n={item.icon} s={18} style={{color:(portalTab===item.id||(item.id==='settings'&&_MIGRATED_TABS.includes(portalTab)))?T.accent:T.text3}}/>
              {item.badge?<span style={{position:'absolute',top:2,right:2,background:item.badgeColor||'#EF4444',color:'#fff',fontSize:8,fontWeight:800,borderRadius:8,padding:'1px 4px',minWidth:14,textAlign:'center'}}>{item.badge}</span>:null}
            </div>
          ))}
        </div>
        </>}
      </aside>;
      })()}

      {/* Main */}
      <main style={{ flex:1, padding:"24px 28px", overflow:"auto" }}>
        {/* Offline banner */}
        {!(typeof isOnline!=='undefined'?isOnline:null) && (
          <div style={{ background:"linear-gradient(90deg,#EF4444,#DC2626)", color:"#fff", padding:"8px 16px", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:8, justifyContent:"center", borderRadius:8, marginBottom:16 }}>
            <I n="wifi-off" s={14}/> Vous êtes hors ligne — les modifications ne seront pas enregistrées
          </div>
        )}

        <div key={portalTabKey} style={{ animation:"fadeInScale .2s ease", paddingBottom:72 }}>

        {/* ═══ Settings sub-tab header — shown on ALL migrated tabs ═══ */}
        {_MIGRATED_TABS.includes(portalTab) && (
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <div style={{width:36,height:36,borderRadius:12,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="settings" s={18} style={{color:'#fff'}}/></div>
              <div>
                <div style={{fontSize:18,fontWeight:800,color:T.text}}>Paramètres</div>
                <div style={{fontSize:11,color:T.text3}}>Configuration & outils</div>
              </div>
            </div>
            <div style={{display:'flex',gap:4,overflowX:'auto',paddingBottom:4}}>
              {[
                {id:'settings',label:'Profil & Notifs',icon:'user'},
                {id:'availability',label:'Disponibilités',icon:'grid'},
                ...(collab.chat_enabled!==0?[{id:'messages',label:'Messages',icon:'message-circle'}]:[]),
                {id:'tables',label:'Tables',icon:'database'},
                ...(collab.ai_copilot_enabled?[{id:'ai-profile',label:'Profil IA',icon:'cpu'}]:[]),
                {id:'objectifs',label:'Objectifs',icon:'target'},
                {id:'signalements',label:'Signalements',icon:'shield-alert',badge:(typeof collabAlertCount!=='undefined'?collabAlertCount:null)>0?(typeof collabAlertCount!=='undefined'?collabAlertCount:null):null},
              ].map(st=>(
                <div key={st.id} onClick={()=>setPortalTab(st.id)} style={{display:'flex',alignItems:'center',gap:4,padding:'6px 12px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:portalTab===st.id?700:500,background:portalTab===st.id?T.accentBg:'transparent',color:portalTab===st.id?T.accent:T.text3,whiteSpace:'nowrap',transition:'all .12s',border:'1px solid '+(portalTab===st.id?T.accent+'30':'transparent')}}>
                  <I n={st.icon} s={13}/><span>{st.label}</span>
                  {st.badge&&<span style={{fontSize:8,fontWeight:700,padding:'1px 5px',borderRadius:8,background:'#EF4444',color:'#fff',marginLeft:2}}>{st.badge}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ AUJOURD'HUI — Dashboard collaborateur ═══ */}
        {portalTab === "home" && <HomeTab/>}

        {/* ── AGENDA GRID ── */}
        {portalTab === "agenda" && <AgendaTab/>}

        {/* ── V1.10.3 — Reporting collab RDV ── */}
        {portalTab === "rdv-reporting" && <RdvReportingTab/>}

        {/* ── MON CRM ── */}
        {portalTab === "crm" && <CrmTab/>}

        {/* ── MES SIGNALEMENTS (COLLAB) ── */}
        {portalTab === "signalements" && <CollabSignalementsScreen collab={collab} setCollabAlertCount={setCollabAlertCount} showNotif={showNotif} />}

        {/* ── AVAILABILITY ── */}
        {portalTab === "availability" && <AvailabilityTab/>}


        {/* ── TELEPHONE PRO ── */}
        {portalTab === "phone" && ((typeof voipConfigured!=='undefined'?voipConfigured:null) || collab.sms_enabled) && <PhoneTab/>}

        {/* ── MESSAGES / CHAT ── */}
        {portalTab === "messages" && <MessagesTab/>}

        {/* ── TABLES (Collab) ── */}
        {portalTab === "tables" && <TablesTab/>}

        {/* ── MON PROFIL IA ── */}
        {portalTab === "ai-profile" && collab.ai_copilot_enabled && <AiProfileTab/>}

        {/* ── SMS MONITORING — Historique global SMS ── */}
        {portalTab === "sms-monitoring" && (()=>{
          const [smsData, setSmsData] = useState({messages:[],total:0,loading:true});
          const [smsSearch, setSmsSearch] = useState('');
          const [smsFilter, setSmsFilter] = useState({direction:'',status:'',dateFrom:'',dateTo:''});
          const [smsPage, setSmsPage] = useState(0);
          const SMS_PAGE=50;
          useEffect(()=>{
            setSmsData(p=>({...p,loading:true}));
            const params=new URLSearchParams({companyId:company.id,limit:SMS_PAGE,offset:smsPage*SMS_PAGE});
            if(smsSearch)params.set('search',smsSearch);
            if(smsFilter.direction)params.set('direction',smsFilter.direction);
            if(smsFilter.status)params.set('status',smsFilter.status);
            if(smsFilter.dateFrom)params.set('dateFrom',smsFilter.dateFrom);
            if(smsFilter.dateTo)params.set('dateTo',smsFilter.dateTo);
            api('/api/sms/messages?'+params.toString()).then(r=>{
              setSmsData({messages:r?.messages||r||[],total:r?.total||(r||[]).length,loading:false});
            }).catch(()=>setSmsData(p=>({...p,loading:false})));
          },[smsSearch,smsFilter,smsPage,company.id]);

          const fmtPhone=p=>(p||'').replace('+33','0').replace(/(\d{2})(?=\d)/g,'$1 ');
          const totalPages=Math.ceil(smsData.total/SMS_PAGE)||1;

          return (
            <div style={{maxWidth:1000}}>
              <h1 style={{fontSize:22,fontWeight:700,marginBottom:4}}>📱 Suivi SMS</h1>
              <p style={{fontSize:13,color:T.text2,marginBottom:20}}>Historique complet des SMS envoyés et reçus</p>

              {/* Barre de recherche + filtres */}
              <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
                <div style={{flex:1,minWidth:200,position:'relative'}}>
                  <I n="search" s={14} style={{position:'absolute',left:12,top:10,color:T.text3}}/>
                  <input value={smsSearch} onChange={e=>{setSmsSearch(e.target.value);setSmsPage(0);}} placeholder="Rechercher par numéro, nom, contenu..." style={{width:'100%',padding:'9px 12px 9px 36px',borderRadius:10,border:`1px solid ${T.border}`,background:T.surface,fontSize:13,color:T.text,outline:'none',boxSizing:'border-box'}}/>
                </div>
                <select value={smsFilter.direction} onChange={e=>{setSmsFilter(p=>({...p,direction:e.target.value}));setSmsPage(0);}} style={{padding:'9px 12px',borderRadius:10,border:`1px solid ${T.border}`,background:T.surface,fontSize:12,color:T.text,cursor:'pointer'}}>
                  <option value="">Tous</option>
                  <option value="outbound">Envoyés</option>
                  <option value="inbound">Reçus</option>
                </select>
                <select value={smsFilter.status} onChange={e=>{setSmsFilter(p=>({...p,status:e.target.value}));setSmsPage(0);}} style={{padding:'9px 12px',borderRadius:10,border:`1px solid ${T.border}`,background:T.surface,fontSize:12,color:T.text,cursor:'pointer'}}>
                  <option value="">Tout statut</option>
                  <option value="sent">Envoyé</option>
                  <option value="received">Reçu</option>
                  <option value="failed">Échoué</option>
                </select>
                <input type="date" value={smsFilter.dateFrom} onChange={e=>{setSmsFilter(p=>({...p,dateFrom:e.target.value}));setSmsPage(0);}} style={{padding:'8px 10px',borderRadius:10,border:`1px solid ${T.border}`,background:T.surface,fontSize:12,color:T.text}} placeholder="Du"/>
                <input type="date" value={smsFilter.dateTo} onChange={e=>{setSmsFilter(p=>({...p,dateTo:e.target.value}));setSmsPage(0);}} style={{padding:'8px 10px',borderRadius:10,border:`1px solid ${T.border}`,background:T.surface,fontSize:12,color:T.text}} placeholder="Au"/>
                {(smsSearch||smsFilter.direction||smsFilter.status||smsFilter.dateFrom||smsFilter.dateTo)&&<span onClick={()=>{setSmsSearch('');setSmsFilter({direction:'',status:'',dateFrom:'',dateTo:''});setSmsPage(0);}} style={{fontSize:12,color:'#EF4444',cursor:'pointer',fontWeight:600}}>✕ Reset</span>}
              </div>

              {/* Compteur */}
              <div style={{fontSize:12,color:T.text3,marginBottom:12}}>{smsData.total} SMS · Page {smsPage+1}/{totalPages}</div>

              {/* Table SMS */}
              {smsData.loading ? (
                <div style={{textAlign:'center',padding:40,color:T.text3}}>Chargement...</div>
              ) : smsData.messages.length===0 ? (
                <Card style={{textAlign:'center',padding:40}}>
                  <div style={{fontSize:40,marginBottom:12}}>📭</div>
                  <div style={{fontSize:15,fontWeight:700}}>Aucun SMS</div>
                  <div style={{fontSize:13,color:T.text3}}>Les SMS apparaîtront ici</div>
                </Card>
              ) : (
                <Card style={{padding:0,overflow:'hidden'}}>
                  <div style={{maxHeight:'calc(100vh - 320px)',overflow:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                    <thead>
                      <tr style={{borderBottom:`1px solid ${T.border}`,background:T.card,position:'sticky',top:0,zIndex:2}}>
                        <th style={{padding:'10px 8px',textAlign:'left',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase'}}>Direction</th>
                        <th style={{padding:'10px 8px',textAlign:'left',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase'}}>De / À</th>
                        <th style={{padding:'10px 8px',textAlign:'left',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase'}}>Contact</th>
                        <th style={{padding:'10px 8px',textAlign:'left',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',maxWidth:350}}>Message</th>
                        <th style={{padding:'10px 8px',textAlign:'left',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase'}}>Statut</th>
                        <th style={{padding:'10px 8px',textAlign:'left',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase'}}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {smsData.messages.map(sms=>{
                        const ct=(contacts||[]).find(c=>c.id===sms.contactId||(c.phone&&sms.toNumber&&c.phone.replace(/\D/g,'').slice(-9)===sms.toNumber.replace(/\D/g,'').slice(-9))||(c.phone&&sms.fromNumber&&c.phone.replace(/\D/g,'').slice(-9)===sms.fromNumber.replace(/\D/g,'').slice(-9)));
                        const isOut=sms.direction==='outbound';
                        const isFailed=sms.status==='failed';
                        return (
                          <tr key={sms.id} style={{borderBottom:`1px solid ${T.border}11`}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <td style={{padding:'8px',width:40}}>
                              <div style={{width:28,height:28,borderRadius:7,background:isOut?'#3B82F612':'#22C55E12',display:'flex',alignItems:'center',justifyContent:'center'}}>
                                <I n={isOut?'arrow-up-right':'arrow-down-left'} s={14} style={{color:isOut?'#3B82F6':'#22C55E'}}/>
                              </div>
                            </td>
                            <td style={{padding:'8px',fontSize:12}}>
                              <div style={{fontWeight:600,color:T.text}}>{fmtPhone(isOut?sms.toNumber:sms.fromNumber)}</div>
                              <div style={{fontSize:10,color:T.text3}}>de {fmtPhone(isOut?sms.fromNumber:sms.toNumber)}</div>
                            </td>
                            <td style={{padding:'8px'}}>
                              {ct ? <span onClick={()=>{setSelectedCrmContact({...ct,_linked:true});setCollabFicheTab('sms');_setPortalTab('crm');}} style={{fontSize:12,fontWeight:600,color:T.accent,cursor:'pointer'}}>{ct.name}</span>
                                   : <span style={{fontSize:11,color:T.text3}}>—</span>}
                            </td>
                            <td style={{padding:'8px',maxWidth:350}}>
                              <div style={{fontSize:12,color:isFailed?'#EF4444':T.text,lineHeight:1.4,overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{sms.content||'—'}</div>
                            </td>
                            <td style={{padding:'8px'}}>
                              <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:12,background:isFailed?'#EF444418':sms.status==='received'?'#22C55E18':sms.status==='sent'?'#3B82F618':'#F59E0B18',color:isFailed?'#EF4444':sms.status==='received'?'#22C55E':sms.status==='sent'?'#3B82F6':'#F59E0B'}}>{isFailed?'Échoué':sms.status==='received'?'Reçu':sms.status==='sent'?'Envoyé':sms.status||'?'}</span>
                              {sms.provider&&<div style={{fontSize:9,color:T.text3,marginTop:2}}>{sms.provider}</div>}
                            </td>
                            <td style={{padding:'8px',fontSize:11,color:T.text3,whiteSpace:'nowrap'}}>
                              {sms.createdAt?new Date(sms.createdAt).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </Card>
              )}

              {/* Pagination */}
              {totalPages>1&&<div style={{display:'flex',justifyContent:'center',gap:8,marginTop:14,alignItems:'center'}}>
                <Btn small disabled={smsPage===0} onClick={()=>setSmsPage(0)}><I n="chevrons-left" s={14}/></Btn>
                <Btn small disabled={smsPage===0} onClick={()=>setSmsPage(p=>p-1)}><I n="chevron-left" s={14}/></Btn>
                <span style={{fontSize:13,fontWeight:600,color:T.text2}}>Page {smsPage+1} / {totalPages}</span>
                <Btn small disabled={smsPage>=totalPages-1} onClick={()=>setSmsPage(p=>p+1)}><I n="chevron-right" s={14}/></Btn>
                <Btn small disabled={smsPage>=totalPages-1} onClick={()=>setSmsPage(totalPages-1)}><I n="chevrons-right" s={14}/></Btn>
              </div>}
            </div>
          );
        })()}

        {/* ── SETTINGS ── */}
        {portalTab === "settings" && (()=>{
          const settingsNotifPrefs = (() => { try { return JSON.parse(localStorage.getItem("c360-collab-notif-"+collab.id)||"{}"); } catch { return {}; } })();
          const toggleNotifPref = (key) => { const n = {...settingsNotifPrefs, [key]:!settingsNotifPrefs[key]}; localStorage.setItem("c360-collab-notif-"+collab.id, JSON.stringify(n)); };
          const autoReply = (() => { try { return localStorage.getItem("c360-autoreply-"+collab.id)||""; } catch { return ""; } })();
          return (
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:24 }}>
              <div style={{ width:48, height:48, borderRadius:16, background:"linear-gradient(135deg,#7C3AED,#2563EB)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(124,58,237,0.25)" }}>
                <I n="settings" s={24} style={{ color:"#fff" }}/>
              </div>
              <div>
                <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:-0.5 }}>Mes paramètres</h1>
                <p style={{ fontSize:12, color:T.text3, margin:0 }}>Personnalisez votre expérience</p>
              </div>
            </div>
            {/* Sub-tabs navigation */}
            <div style={{display:'flex',gap:4,marginBottom:20,overflowX:'auto',paddingBottom:4}}>
              {[
                {id:'profil',label:'Profil & Notifs',icon:'user'},
                {id:'availability',label:'Disponibilités',icon:'grid'},
                ...(collab.chat_enabled!==0?[{id:'messages',label:'Messages',icon:'message-circle'}]:[]),
                {id:'tables',label:'Tables',icon:'database'},
                ...(collab.ai_copilot_enabled?[{id:'ai-profile',label:'Profil IA',icon:'cpu'}]:[]),
                {id:'objectifs',label:'Objectifs',icon:'target'},
                {id:'signalements',label:'Signalements',icon:'shield-alert',badge:(typeof collabAlertCount!=='undefined'?collabAlertCount:null)>0?(typeof collabAlertCount!=='undefined'?collabAlertCount:null):null},
              ].map(st=>(
                <div key={st.id} onClick={()=>{if(st.id==='profil'){(typeof setSettingsSubTab==='function'?setSettingsSubTab:function(){})('profil');}else{setPortalTab(st.id);}}} style={{display:'flex',alignItems:'center',gap:4,padding:'6px 12px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:(settingsSubTab==='profil'&&st.id==='profil')||(portalTab===st.id)?700:500,background:(settingsSubTab==='profil'&&st.id==='profil'&&portalTab==='settings')||(portalTab===st.id)?T.accentBg:'transparent',color:(settingsSubTab==='profil'&&st.id==='profil'&&portalTab==='settings')||(portalTab===st.id)?T.accent:T.text3,whiteSpace:'nowrap',transition:'all .12s',border:'1px solid '+((settingsSubTab==='profil'&&st.id==='profil'&&portalTab==='settings')||(portalTab===st.id)?T.accent+'30':'transparent')}}>
                  <I n={st.icon} s={13}/>
                  <span>{st.label}</span>
                  {st.badge&&<span style={{fontSize:8,fontWeight:700,padding:'1px 5px',borderRadius:8,background:'#EF4444',color:'#fff',marginLeft:2}}>{st.badge}</span>}
                </div>
              ))}
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
              {/* Barre de navigation rapide des sections */}
              {(()=>{
                const _sections = [
                  {id:'profil',icon:'user',label:'Mon profil',desc:'Nom, email, avatar',color:T.accent},
                  {id:'securite',icon:'lock',label:'Sécurité & accès',desc:'Code, mot de passe',color:'#EF4444'},
                  {id:'notifs',icon:'bell',label:'Notifications',desc:'Alertes, rappels, push',color:'#F59E0B'},
                  {id:'autoreply',icon:'message-circle',label:'Réponse automatique',desc:'Message absence',color:'#0EA5E9'},
                  {id:'smsauto',icon:'smartphone',label:'SMS automatiques',desc:'Appels manqués, NRP',color:'#22C55E'},
                  {id:'suggestions',icon:'zap',label:'Suggestions live',desc:'Déclencheurs en appel',color:'#F97316'},
                  {id:'smspipeline',icon:'repeat',label:'SMS par colonne',desc:'Automatisation pipeline',color:'#7C3AED'},
                  {id:'powerdialer',icon:'phone-call',label:'Power Dialer',desc:'Ring timeout',color:'#3B82F6'},
                  {id:'amd',icon:'voicemail',label:'Détection messagerie',desc:'AMD, voicemail',color:'#6366F1'},
                  {id:'sauvegardes',icon:'shield',label:'Sauvegardes & restauration',desc:'Vos données protégées automatiquement',color:'#10B981'},
                ];
                const [_openSec, _setOpenSec] = [settingsSubTab, setSettingsSubTab];
                _T.settingsAccordion = {open:_openSec, set:_setOpenSec};
                return <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:16}}>
                  {_sections.map(s=>(
                    <div key={s.id} onClick={()=>_setOpenSec(p=>p===s.id?'':s.id)} style={{display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:8,cursor:'pointer',fontSize:10,fontWeight:_openSec===s.id?700:500,background:_openSec===s.id?s.color+'12':'transparent',color:_openSec===s.id?s.color:T.text3,border:'1px solid '+(_openSec===s.id?s.color+'30':'transparent'),transition:'all .12s',whiteSpace:'nowrap'}} onMouseEnter={e=>{if(_openSec!==s.id)e.currentTarget.style.background=T.bg;}} onMouseLeave={e=>{if(_openSec!==s.id)e.currentTarget.style.background='transparent';}}>
                      <I n={s.icon} s={11}/>{s.label}
                    </div>
                  ))}
                </div>;
              })()}

              {/* Mon profil */}
              {((typeof settingsSubTab!=='undefined'?settingsSubTab:null)===''||(typeof settingsSubTab!=='undefined'?settingsSubTab:null)==='profil') && <Card style={{marginBottom:8}}>
                <div onClick={()=>(typeof setSettingsSubTab==='function'?setSettingsSubTab:function(){})(p=>p==='profil'?'':'profil')} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:settingsSubTab==='profil'?16:0}}>
                  <div style={{width:32,height:32,borderRadius:8,background:T.accentBg,display:'flex',alignItems:'center',justifyContent:'center'}}><I n="user" s={16} style={{color:T.accent}}/></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.text}}>Mon profil</div>
                    <div style={{fontSize:10,color:T.text3}}>Nom, email, avatar, priorité</div>
                  </div>
                  <Badge color={collab.role==="admin"?T.accent:T.text3}>{collab.role==="admin"?"Admin":"Membre"}</Badge>
                  <I n={settingsSubTab==='profil'?'chevron-up':'chevron-down'} s={16} style={{color:T.text3}}/>
                </div>
                {settingsSubTab==='profil' && <div>
                <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16, padding:14, borderRadius:12, background:T.bg, border:`1px solid ${T.border}` }}>
                  <Avatar name={collab.name} color={collab.color} size={52}/>
                  <div>
                    <div style={{ fontSize:16, fontWeight:700 }}>{collab.name}</div>
                    <div style={{ fontSize:12, color:T.text3, display:"flex", alignItems:"center", gap:4 }}><I n="mail" s={11}/> {collab.email}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:4 }}>
                      <Stars count={collab.priority} size={14}/>
                      <span style={{ fontSize:11, color:T.text3 }}>Priorité</span>
                    </div>
                  </div>
                </div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:5 }}>Fuseau horaire</label>
                  <select value={collab.timezone || ""} onChange={e => { const tz = e.target.value || null; setCollab(prev => ({...prev, timezone: tz})); api(`/api/collaborators/${collab.id}`, { method:"PUT", body:{timezone:tz} }); }} style={{ width:"100%", padding:"8px 10px", borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13 }}>
                    <option value="">Par défaut (entreprise)</option>
                    {COMMON_TIMEZONES.map(tz=><option key={tz} value={tz}>{tz.replace(/_/g," ")}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:5 }}>Langue d'affichage</label>
                  <select value="fr" style={{ width:"100%", padding:"8px 10px", borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13 }}>
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="de">Deutsch</option>
                  </select>
                </div>
              </div>}
              </Card>}

              {/* Sécurité */}
              {((typeof settingsSubTab!=='undefined'?settingsSubTab:null)===''||(typeof settingsSubTab!=='undefined'?settingsSubTab:null)==='securite') && <Card style={{marginBottom:8}}>
                <div onClick={()=>(typeof setSettingsSubTab==='function'?setSettingsSubTab:function(){})(p=>p==='securite'?'':'securite')} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:settingsSubTab==='securite'?16:0}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'#EF444412',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="lock" s={16} style={{color:'#EF4444'}}/></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.text}}>Sécurité & accès</div>
                    <div style={{fontSize:10,color:T.text3}}>Code collaborateur, mot de passe</div>
                  </div>
                  <I n={settingsSubTab==='securite'?'chevron-up':'chevron-down'} s={16} style={{color:T.text3}}/>
                </div>
                {settingsSubTab==='securite' && <div>
                <div style={{ padding:16, borderRadius:12, background:T.bg, border:`1px solid ${T.border}`, marginBottom:12 }}>
                  {[
                    { label:"Code collaborateur", value:collab.code, mono:true, color:collab.color },
                    { label:"Email ID", value:collab.email },
                    { label:"Mot de passe", value:"••••••••", mono:true },
                  ].map((item,i)=>(
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:i<2?`1px solid ${T.border}50`:"none" }}>
                      <span style={{ fontSize:12, color:T.text3 }}>{item.label}</span>
                      <span style={{ fontSize:item.mono?14:13, fontWeight:item.mono?800:600, color:item.color||T.text, fontFamily:item.mono?"monospace":"inherit", letterSpacing:item.mono?2:0 }}>{item.value}</span>
                    </div>
                  ))}
                </div>
                <Btn small onClick={()=>showNotif("Contactez l'administrateur pour changer de mot de passe")} style={{ width:"100%", justifyContent:"center" }}>
                  <I n="key" s={14}/> Changer le mot de passe
                </Btn>
              </div>}
              </Card>}

              {/* Notifications */}
              {((typeof settingsSubTab!=='undefined'?settingsSubTab:null)===''||(typeof settingsSubTab!=='undefined'?settingsSubTab:null)==='notifs') && <Card style={{marginBottom:8}}>
                <div onClick={()=>(typeof setSettingsSubTab==='function'?setSettingsSubTab:function(){})(p=>p==='notifs'?'':'notifs')} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:settingsSubTab==='notifs'?16:0}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'#F59E0B12',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="bell" s={16} style={{color:'#F59E0B'}}/></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.text}}>Notifications</div>
                    <div style={{fontSize:10,color:T.text3}}>Sons, push, email, alertes RDV</div>
                  </div>
                  <I n={settingsSubTab==='notifs'?'chevron-up':'chevron-down'} s={16} style={{color:T.text3}}/>
                </div>
                {settingsSubTab==='notifs' && <div>
                {[
                  { key:"sound", icon:"volume-2", label:"Sons de notification", desc:"Émettre un son pour les nouvelles notifications" },
                  { key:"push", icon:"smartphone", label:"Notifications push", desc:"Recevoir des alertes du navigateur" },
                  { key:"email_notif", icon:"mail", label:"Notifications email", desc:"Recevoir un email pour chaque nouveau RDV" },
                  { key:"booking_alert", icon:"calendar", label:"Alertes rendez-vous", desc:"Rappel 15min avant chaque RDV" },
                  { key:"chat_notif", icon:"message-circle", label:"Notifications chat", desc:"Être alerté des nouveaux messages" },
                ].map(item=>(
                  <div key={item.key} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:`1px solid ${T.border}30` }}>
                    <I n={item.icon} s={16} style={{ color:T.text3, flexShrink:0 }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{item.label}</div>
                      <div style={{ fontSize:11, color:T.text3 }}>{item.desc}</div>
                    </div>
                    <div onClick={()=>{ toggleNotifPref(item.key); if(item.key==='push'&&!settingsNotifPrefs[item.key]) try{Notification.requestPermission();}catch{} }} style={{
                      width:42, height:24, borderRadius:12, cursor:"pointer",
                      background:settingsNotifPrefs[item.key]?"linear-gradient(135deg,#22C55E,#16A34A)":T.border2,
                      display:"flex", alignItems:"center", padding:"0 3px",
                      justifyContent:settingsNotifPrefs[item.key]?"flex-end":"flex-start",
                      transition:"all .25s", flexShrink:0
                    }}><div style={{ width:18, height:18, borderRadius:9, background:"#fff", boxShadow:"0 1px 4px rgba(0,0,0,0.15)" }}/></div>
                  </div>
                ))}
              </div>}
              </Card>}

              {/* Réponse automatique */}
              {((typeof settingsSubTab!=='undefined'?settingsSubTab:null)===''||(typeof settingsSubTab!=='undefined'?settingsSubTab:null)==='autoreply') && <Card style={{marginBottom:8}}>
                <div onClick={()=>(typeof setSettingsSubTab==='function'?setSettingsSubTab:function(){})(p=>p==='autoreply'?'':'autoreply')} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:settingsSubTab==='autoreply'?16:0}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'#2563EB12',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="message-square" s={16} style={{color:'#2563EB'}}/></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.text}}>Réponse automatique</div>
                    <div style={{fontSize:10,color:T.text3}}>Message envoyé après réservation</div>
                  </div>
                  <I n={settingsSubTab==='autoreply'?'chevron-up':'chevron-down'} s={16} style={{color:T.text3}}/>
                </div>
                {settingsSubTab==='autoreply' && <div>
                <p style={{ fontSize:12, color:T.text3, marginBottom:10 }}>Ce message sera envoyé automatiquement aux clients après une réservation.</p>
                <textarea defaultValue={autoReply} onBlur={e=>localStorage.setItem("c360-autoreply-"+collab.id, e.target.value)} placeholder="Ex: Merci pour votre réservation ! Je vous confirme votre RDV. À bientôt !" rows={3} style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${T.border}`, background:T.bg, fontSize:13, fontFamily:"inherit", color:T.text, outline:"none", resize:"vertical" }}/>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                  {["Merci pour votre réservation, à bientôt !","Votre RDV est confirmé. N'hésitez pas à me contacter.","Bienvenue ! Votre créneau est réservé."].map((tpl,i)=>(
                    <div key={i} onClick={e=>{e.target.closest('div').parentElement.previousElementSibling.value=tpl;localStorage.setItem("c360-autoreply-"+collab.id,tpl);showNotif("Template appliqué");}} style={{ padding:"4px 10px", borderRadius:6, background:T.bg, border:`1px solid ${T.border}`, fontSize:11, cursor:"pointer" }}>{tpl.substring(0,35)}...</div>
                  ))}
                </div>
              </div>}
              </Card>}

              {/* SMS automatiques */}
              {((typeof settingsSubTab!=='undefined'?settingsSubTab:null)===''||(typeof settingsSubTab!=='undefined'?settingsSubTab:null)==='smsauto') && <Card style={{marginBottom:8}}>
                <div onClick={()=>(typeof setSettingsSubTab==='function'?setSettingsSubTab:function(){})(p=>p==='smsauto'?'':'smsauto')} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:settingsSubTab==='smsauto'?16:0}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'#22C55E12',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="smartphone" s={16} style={{color:'#22C55E'}}/></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.text}}>SMS automatiques</div>
                    <div style={{fontSize:10,color:T.text3}}>Appels manqués, NRP auto</div>
                  </div>
                  <I n={settingsSubTab==='smsauto'?'chevron-up':'chevron-down'} s={16} style={{color:T.text3}}/>
                </div>
                {settingsSubTab==='smsauto' && <div>

                {/* Appel reçu manqué */}
                <div style={{padding:12,borderRadius:10,border:'1px solid '+T.border,background:T.bg,marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:T.text}}>📞 Appel reçu — pas de réponse</div>
                      <div style={{fontSize:11,color:T.text3,marginTop:2}}>SMS envoyé à l'appelant si vous ne décrochez pas</div>
                    </div>
                    <div onClick={()=>{const v=localStorage.getItem('c360-phone-autosms-'+collab.id)!=='1';localStorage.setItem('c360-phone-autosms-'+collab.id,v?'1':'0');showNotif(v?'SMS auto manqués activé':'Désactivé');setPhoneRightAccordion(p=>({...p,_r:Date.now()}));}} style={{width:44,height:24,borderRadius:12,background:localStorage.getItem('c360-phone-autosms-'+collab.id)==='1'?'#2563EB':'#CBD5E1',cursor:'pointer',position:'relative',transition:'all .3s',flexShrink:0}}>
                      <div style={{width:20,height:20,borderRadius:10,background:'#fff',position:'absolute',top:2,left:localStorage.getItem('c360-phone-autosms-'+collab.id)==='1'?22:2,transition:'all .3s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                    </div>
                  </div>
                  {localStorage.getItem('c360-phone-autosms-'+collab.id)==='1' && (
                    <textarea defaultValue={localStorage.getItem('c360-phone-autosms-text-'+collab.id)||"Désolé, je suis indisponible. Je vous rappelle dès que possible."} onBlur={e=>localStorage.setItem('c360-phone-autosms-text-'+collab.id,e.target.value)} rows={2} style={{width:'100%',padding:10,borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:12,fontFamily:'inherit',color:T.text,resize:'none',outline:'none'}}/>
                  )}
                </div>

                {/* Appel émis NRP */}
                <div style={{padding:12,borderRadius:10,border:'1px solid '+T.border,background:T.bg}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:T.text}}>📱 Appel émis — NRP</div>
                      <div style={{fontSize:11,color:T.text3,marginTop:2}}>SMS envoyé au prospect s'il ne décroche pas</div>
                    </div>
                    <div onClick={()=>{const v=localStorage.getItem('c360-phone-autosms-nrp-'+collab.id)!=='1';localStorage.setItem('c360-phone-autosms-nrp-'+collab.id,v?'1':'0');showNotif(v?'SMS auto NRP activé':'Désactivé');setPhoneRightAccordion(p=>({...p,_r:Date.now()}));}} style={{width:44,height:24,borderRadius:12,background:localStorage.getItem('c360-phone-autosms-nrp-'+collab.id)==='1'?'#F59E0B':'#CBD5E1',cursor:'pointer',position:'relative',transition:'all .3s',flexShrink:0}}>
                      <div style={{width:20,height:20,borderRadius:10,background:'#fff',position:'absolute',top:2,left:localStorage.getItem('c360-phone-autosms-nrp-'+collab.id)==='1'?22:2,transition:'all .3s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                    </div>
                  </div>
                  {localStorage.getItem('c360-phone-autosms-nrp-'+collab.id)==='1' && (
                    <textarea defaultValue={localStorage.getItem('c360-phone-autosms-nrp-text-'+collab.id)||"Bonjour, j'ai essayé de vous joindre. N'hésitez pas à me rappeler. Cordialement."} onBlur={e=>localStorage.setItem('c360-phone-autosms-nrp-text-'+collab.id,e.target.value)} rows={2} style={{width:'100%',padding:10,borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:12,fontFamily:'inherit',color:T.text,resize:'none',outline:'none'}}/>
                  )}
                </div>
              </div>}
              </Card>}

              {/* Suggestions live */}
              {((typeof settingsSubTab!=='undefined'?settingsSubTab:null)===''||(typeof settingsSubTab!=='undefined'?settingsSubTab:null)==='suggestions') && <Card style={{padding:16,marginBottom:8}}>
                <div onClick={()=>(typeof setSettingsSubTab==='function'?setSettingsSubTab:function(){})(p=>p==='suggestions'?'':'suggestions')} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:settingsSubTab==='suggestions'?14:0}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#F59E0B,#F97316)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="zap" s={16} style={{color:'#fff'}}/></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.text}}>Suggestions live</div>
                    <div style={{fontSize:10,color:T.text3}}>Déclencheurs de détection pendant les appels</div>
                  </div>
                  <I n={settingsSubTab==='suggestions'?'chevron-up':'chevron-down'} s={16} style={{color:T.text3}}/>
                </div>
                {settingsSubTab==='suggestions' && <><div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6,marginBottom:16}}>
                  {[
                    {type:'rdv',label:'📅 RDV détecté',desc:'rendez-vous, rdv, se voir, caler...'},
                    {type:'besoin',label:'🎯 Besoin identifié',desc:'j\'ai besoin, je cherche, il me faut...'},
                    {type:'objection',label:'⚠️ Objection détectée',desc:'trop cher, pas intéressé, je réfléchis...'},
                    {type:'decideur',label:'👤 Décideur mentionné',desc:'directeur, responsable, patron...'},
                    {type:'devis',label:'💰 Devis/Tarif demandé',desc:'devis, tarif, combien ça coûte...'},
                    {type:'accord',label:'✅ Accord verbal',desc:'ok c\'est bon, je signe, j\'accepte...'},
                    {type:'document',label:'📄 Document demandé',desc:'envoyez-moi, plaquette, brochure...'},
                    {type:'rappel',label:'📞 Rappel demandé',desc:'rappeler, rappelez-moi...'},
                    {type:'note',label:'📝 Info clé détectée',desc:'budget, montant, euros...'},
                    {type:'interet',label:'⭐ Intérêt produit',desc:'je suis intéressé, cette offre...'},
                    {type:'adresse',label:'📍 Adresse détectée',desc:'j\'habite, rue de, avenue...'},
                    {type:'entreprise_info',label:'🏢 Info entreprise',desc:'société, siret, activité...'},
                    {type:'qualification',label:'📊 Qualification',desc:'effectif, chiffre d\'affaires...'},
                    {type:'disponibilite',label:'🕐 Disponibilité',desc:'disponible, dispo le, libre...'},
                    {type:'canal',label:'📱 Canal préféré',desc:'whatsapp, sms, email...'},
                    {type:'recommandation',label:'🤝 Recommandation',desc:'je connais quelqu\'un, parrainage...'},
                    {type:'email_dicte',label:'📧 Email dicté',desc:'mon email c\'est, arobase...'},
                    {type:'tel_dicte',label:'📞 Téléphone dicté',desc:'mon numéro, zéro six...'},
                    {type:'urgence',label:'🚨 Urgence',desc:'urgent, rapidement, tout de suite...'},
                    {type:'insatisfaction',label:'😤 Insatisfaction',desc:'pas content, déçu, problème...'},
                    {type:'satisfaction',label:'😊 Satisfaction',desc:'très bien, excellent, parfait...'},
                    {type:'paiement',label:'💳 Paiement',desc:'payer, virement, carte bancaire...'},
                    {type:'echeance',label:'⏰ Échéance',desc:'deadline, avant le, d\'ici le...'},
                    {type:'resiliation',label:'🚫 Résiliation',desc:'résilier, annuler, fin de contrat...'},
                    {type:'renouvellement',label:'🔄 Renouvellement',desc:'renouveler, reconduire...'},
                    {type:'langue',label:'🌍 Langue',desc:'en anglais, en espagnol...'},
                    {type:'transfert',label:'↗️ Transfert',desc:'transfert, passer un collègue...'},
                    {type:'piece_demandee',label:'📎 Pièce demandée',desc:'justificatif, attestation...'},
                  ].map(rule=>{
                    const isOn = (typeof liveConfig!=='undefined'?liveConfig:{}).detectionsEnabled?.[rule.type] !== false;
                    const customKw = (typeof liveConfig!=='undefined'?liveConfig:{}).customKeywords?.[rule.type] || '';
                    const isEditing = (typeof liveConfig!=='undefined'?liveConfig:{})._editingType === rule.type;
                    return <div key={rule.type} style={{padding:'8px 10px',borderRadius:8,border:'1px solid '+(isOn?T.border:T.border+'60'),background:isOn?T.card:T.bg,opacity:isOn?1:0.5,transition:'all .15s',gridColumn:isEditing?'1 / -1':undefined}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:12}}>{rule.label.split(' ')[0]}</span>
                        <span style={{fontSize:11,fontWeight:600,color:T.text,flex:1}}>{rule.label.split(' ').slice(1).join(' ')}</span>
                        <div onClick={()=>saveLiveConfig({_editingType:isEditing?null:rule.type})} style={{padding:'2px 6px',borderRadius:4,cursor:'pointer',fontSize:9,fontWeight:600,color:isEditing?T.accent:T.text3,background:isEditing?T.accentBg:'transparent',border:'1px solid '+(isEditing?T.accent+'30':'transparent')}}>✏️</div>
                        <div onClick={()=>{const next={...((typeof liveConfig!=='undefined'?liveConfig:{}).detectionsEnabled||{}), [rule.type]:!isOn};saveLiveConfig({detectionsEnabled:next});}} style={{width:36,height:20,borderRadius:10,background:isOn?'#22C55E':'#D1D5DB',cursor:'pointer',position:'relative',transition:'background .2s'}}>
                          <div style={{width:16,height:16,borderRadius:8,background:'#fff',position:'absolute',top:2,left:isOn?18:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
                        </div>
                      </div>
                      <div style={{fontSize:9,color:T.text3,marginTop:2}}>{rule.desc}</div>
                      {isEditing && <div style={{marginTop:6,padding:'6px 8px',borderRadius:6,background:T.bg,border:'1px solid '+T.border}}>
                        <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Mots-clés supplémentaires (séparés par des virgules)</div>
                        <input value={customKw} onChange={e=>{const next={...((typeof liveConfig!=='undefined'?liveConfig:{}).customKeywords||{}), [rule.type]:e.target.value};saveLiveConfig({customKeywords:next});}} placeholder="mot1, mot2, mot3..." style={{width:'100%',padding:'5px 8px',borderRadius:5,border:'1px solid '+T.border,background:T.card,color:T.text,fontSize:10,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/>
                        <div style={{fontSize:8,color:T.text3,marginTop:2}}>Ces mots s'ajoutent aux mots-clés par défaut</div>
                      </div>}
                    </div>;
                  })}
                </div>
                <div style={{borderTop:'1px solid '+T.border,paddingTop:14}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                    <I n="plus-circle" s={14} style={{color:T.accent}}/>
                    <span style={{fontSize:12,fontWeight:700,color:T.text}}>Déclencheurs personnalisés</span>
                  </div>
                  {((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections || []).map((cd, i) => {
                    const _actionDescs = {alerte:'Affiche une pastille d\'alerte dans l\'onglet IA pendant l\'appel',note:'Ajoute automatiquement une note dans la fiche du contact',rdv:'Propose la création d\'un rendez-vous pré-rempli',sms:'Ouvre le SMS avec un message pré-rempli',email:'Ouvre un email avec contenu pré-rempli',pipeline:'Change automatiquement la colonne pipeline du contact',appel:'Programme un rappel automatique pour ce contact'};
                    const _iconOptions = [{id:'zap',label:'⚡'},{id:'bell',label:'🔔'},{id:'alert-triangle',label:'⚠️'},{id:'star',label:'⭐'},{id:'heart',label:'❤️'},{id:'target',label:'🎯'},{id:'shield',label:'🛡️'},{id:'flag',label:'🚩'},{id:'tag',label:'🏷️'},{id:'bookmark',label:'📌'},{id:'eye',label:'👁️'},{id:'gift',label:'🎁'},{id:'trophy',label:'🏆'},{id:'clock',label:'⏰'},{id:'dollar-sign',label:'💲'}];
                    return (
                    <div key={cd.id||i} style={{padding:'14px 16px',borderRadius:12,border:'1.5px solid '+(cd.color||'#F59E0B')+'30',marginBottom:10,background:'linear-gradient(135deg,'+(cd.color||'#F59E0B')+'06,transparent)',position:'relative'}}>
                      {/* Header: icon + name + delete */}
                      <div style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
                        <div style={{width:32,height:32,borderRadius:8,background:(cd.color||'#F59E0B')+'15',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>{(_iconOptions.find(ic=>ic.id===cd.icon)||_iconOptions[0]).label}</div>
                        <input value={cd.name||''} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],name:e.target.value,label:e.target.value};saveLiveConfig({customDetections:arr});}} placeholder="Nom du déclencheur (ex: Concurrence détectée)" style={{flex:1,padding:'7px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:12,fontWeight:600,fontFamily:'inherit',outline:'none'}}/>
                        <div onClick={()=>{if(confirm('Supprimer ce déclencheur ?')){const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr.splice(i,1);saveLiveConfig({customDetections:arr});}}} style={{padding:'5px 10px',borderRadius:8,cursor:'pointer',color:'#EF4444',fontSize:11,fontWeight:700,background:'#EF444410',border:'1px solid #EF444425',display:'flex',alignItems:'center',gap:4}}><I n="trash-2" s={12}/> Supprimer</div>
                      </div>
                      {/* Keywords */}
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:10,fontWeight:700,color:T.text3,marginBottom:3}}>Mots-clés déclencheurs</div>
                        <input value={cd.keywords||''} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],keywords:e.target.value};saveLiveConfig({customDetections:arr});}} placeholder="mot1, mot2, mot3 (séparés par des virgules)" style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:11,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/>
                        <div style={{fontSize:8,color:T.text3,marginTop:2}}>L'IA détectera ces mots dans la conversation en temps réel</div>
                      </div>
                      {/* Row: icon + action + color */}
                      <div style={{display:'flex',gap:8}}>
                        <div style={{flex:'0 0 120px'}}>
                          <div style={{fontSize:10,fontWeight:700,color:T.text3,marginBottom:3}}>Icône</div>
                          <select value={cd.icon||'zap'} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],icon:e.target.value};saveLiveConfig({customDetections:arr});}} style={{width:'100%',padding:'5px 8px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:11,fontFamily:'inherit'}}>
                            {_iconOptions.map(ic=><option key={ic.id} value={ic.id}>{ic.label} {ic.id}</option>)}
                          </select>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:10,fontWeight:700,color:T.text3,marginBottom:3}}>Type d'action</div>
                          <select value={cd.actionType||'alerte'} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],actionType:e.target.value};saveLiveConfig({customDetections:arr});}} style={{width:'100%',padding:'5px 8px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:11,fontFamily:'inherit'}}>
                            <option value="alerte">🔔 Alerte simple</option>
                            <option value="note">📝 Ajouter une note</option>
                            <option value="rdv">📅 Proposer un RDV</option>
                            <option value="sms">💬 Préparer un SMS</option>
                            <option value="email">📧 Préparer un email</option>
                            <option value="pipeline">🔄 Changer le pipeline</option>
                            <option value="appel">📞 Programmer un rappel</option>
                          </select>
                        </div>
                        <div style={{flex:'0 0 140px'}}>
                          <div style={{fontSize:10,fontWeight:700,color:T.text3,marginBottom:3}}>Couleur</div>
                          <select value={cd.color||'#F59E0B'} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],color:e.target.value};saveLiveConfig({customDetections:arr});}} style={{width:'100%',padding:'5px 8px',borderRadius:8,border:'1px solid '+T.border,background:T.bg,color:T.text,fontSize:11,fontFamily:'inherit'}}>
                            <option value="#EF4444">🔴 Rouge — Urgent</option>
                            <option value="#F59E0B">🟡 Orange — Important</option>
                            <option value="#3B82F6">🔵 Bleu — Info</option>
                            <option value="#22C55E">🟢 Vert — Positif</option>
                            <option value="#7C3AED">🟣 Violet — IA</option>
                          </select>
                        </div>
                      </div>
                      {/* Action description */}
                      <div style={{marginTop:6,padding:'5px 8px',borderRadius:6,background:T.bg,border:'1px solid '+T.border+'50',fontSize:9,color:T.text3,display:'flex',alignItems:'center',gap:4}}>
                        <I n="info" s={10} style={{color:T.text3,flexShrink:0}}/> {_actionDescs[cd.actionType||'alerte']}
                      </div>
                      {/* ── Configuration spécifique par type d'action ── */}
                      <div style={{marginTop:8,padding:'10px 12px',borderRadius:8,background:T.bg,border:'1px solid '+T.border}}>
                        <div style={{fontSize:10,fontWeight:700,color:(cd.color||'#F59E0B'),marginBottom:6,display:'flex',alignItems:'center',gap:4}}>
                          <I n="settings" s={10}/> Configuration de l'action
                        </div>

                        {/* SMS */}
                        {cd.actionType==='sms' && <>
                          <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Message SMS pré-rempli</div>
                          <textarea value={cd.smsTemplate||''} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],smsTemplate:e.target.value};saveLiveConfig({customDetections:arr});}} placeholder="Bonjour {nom}, suite à notre échange..." rows={3} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid '+T.border,background:T.card,color:T.text,fontSize:10,fontFamily:'inherit',outline:'none',boxSizing:'border-box',resize:'vertical'}}/>
                          <div style={{fontSize:8,color:T.text3,marginTop:2}}>Variables : {'{nom}'} {'{prenom}'} {'{phone}'} {'{email}'} {'{company}'}</div>
                        </>}

                        {/* Email */}
                        {cd.actionType==='email' && <>
                          <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Objet de l'email</div>
                          <input value={cd.emailSubject||''} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],emailSubject:e.target.value};saveLiveConfig({customDetections:arr});}} placeholder="Suite à notre échange — {company}" style={{width:'100%',padding:'5px 8px',borderRadius:6,border:'1px solid '+T.border,background:T.card,color:T.text,fontSize:10,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:6}}/>
                          <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Corps de l'email</div>
                          <textarea value={cd.emailBody||''} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],emailBody:e.target.value};saveLiveConfig({customDetections:arr});}} placeholder="Bonjour {nom},&#10;&#10;Suite à notre échange téléphonique..." rows={4} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid '+T.border,background:T.card,color:T.text,fontSize:10,fontFamily:'inherit',outline:'none',boxSizing:'border-box',resize:'vertical'}}/>
                          <div style={{fontSize:8,color:T.text3,marginTop:2}}>Variables : {'{nom}'} {'{prenom}'} {'{company}'} {'{collab}'}</div>
                        </>}

                        {/* Note */}
                        {cd.actionType==='note' && <>
                          <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Préfixe de la note</div>
                          <input value={cd.notePrefix||''} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],notePrefix:e.target.value};saveLiveConfig({customDetections:arr});}} placeholder="ex: ⚡ Concurrence détectée:" style={{width:'100%',padding:'5px 8px',borderRadius:6,border:'1px solid '+T.border,background:T.card,color:T.text,fontSize:10,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:4}}/>
                          <div style={{fontSize:8,color:T.text3}}>La phrase détectée sera ajoutée après le préfixe dans les notes du contact</div>
                        </>}

                        {/* Pipeline */}
                        {cd.actionType==='pipeline' && <>
                          <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Déplacer vers la colonne</div>
                          <select value={cd.targetStage||''} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],targetStage:e.target.value};saveLiveConfig({customDetections:arr});}} style={{width:'100%',padding:'5px 8px',borderRadius:6,border:'1px solid '+T.border,background:T.card,color:T.text,fontSize:10,fontFamily:'inherit',marginBottom:4}}>
                            <option value="">Choisir la colonne...</option>
                            {(orderedStages||[]).map(s=><option key={s.id} value={s.id}>{PIPELINE_LABELS[s.id]||s.label}</option>)}
                          </select>
                          <div style={{fontSize:8,color:T.text3}}>Le contact sera déplacé vers cette colonne quand le mot-clé est détecté (avec confirmation)</div>
                        </>}

                        {/* RDV */}
                        {cd.actionType==='rdv' && <>
                          <div style={{display:'flex',gap:6}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Durée par défaut</div>
                              <select value={cd.rdvDuration||30} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],rdvDuration:parseInt(e.target.value)};saveLiveConfig({customDetections:arr});}} style={{width:'100%',padding:'5px 8px',borderRadius:6,border:'1px solid '+T.border,background:T.card,color:T.text,fontSize:10,fontFamily:'inherit'}}>
                                <option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1h</option><option value={90}>1h30</option>
                              </select>
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Note RDV</div>
                              <input value={cd.rdvNote||''} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],rdvNote:e.target.value};saveLiveConfig({customDetections:arr});}} placeholder="RDV suite à détection..." style={{width:'100%',padding:'5px 8px',borderRadius:6,border:'1px solid '+T.border,background:T.card,color:T.text,fontSize:10,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/>
                            </div>
                          </div>
                          <div style={{fontSize:8,color:T.text3,marginTop:4}}>Ouvre la modal de création RDV avec ces paramètres pré-remplis</div>
                        </>}

                        {/* Appel / Rappel */}
                        {cd.actionType==='appel' && <>
                          <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Délai de rappel par défaut</div>
                          <select value={cd.callbackDelay||'1j'} onChange={e=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[])];arr[i]={...arr[i],callbackDelay:e.target.value};saveLiveConfig({customDetections:arr});}} style={{width:'100%',padding:'5px 8px',borderRadius:6,border:'1px solid '+T.border,background:T.card,color:T.text,fontSize:10,fontFamily:'inherit'}}>
                            <option value="1h">Dans 1 heure</option><option value="2h">Dans 2 heures</option><option value="1j">Demain</option><option value="2j">Dans 2 jours</option><option value="3j">Dans 3 jours</option><option value="7j">Dans 1 semaine</option>
                          </select>
                          <div style={{fontSize:8,color:T.text3,marginTop:4}}>Programme une relance automatique après le délai choisi</div>
                        </>}

                        {/* Alerte */}
                        {cd.actionType==='alerte' && <div style={{fontSize:9,color:T.text3}}>Une pastille apparaîtra dans l'onglet IA Copilot avec le mot-clé détecté. Aucune configuration supplémentaire nécessaire.</div>}
                      </div>
                    </div>
                  )})}
                  <div onClick={()=>{const arr=[...((typeof liveConfig!=='undefined'?liveConfig:{}).customDetections||[]),{id:'cd_'+Date.now(),name:'',keywords:'',color:'#F59E0B',icon:'zap',actionType:'alerte',enabled:true}];saveLiveConfig({customDetections:arr});}} style={{padding:'12px 16px',borderRadius:12,border:'1.5px dashed '+T.accent+'40',textAlign:'center',cursor:'pointer',fontSize:12,fontWeight:600,color:T.accent,transition:'all .15s',display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:T.accent+'04'}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background=T.accent+'04'}>
                    <I n="plus" s={14}/> Ajouter un déclencheur personnalisé
                  </div>
                </div>
              </>}
              </Card>}

              {/* SMS par colonne pipeline */}
              {/* ═══ AUTOMATISATIONS PIPELINE — SMS + Email par colonne (DB) ═══ */}
              {((typeof settingsSubTab!=='undefined'?settingsSubTab:null)===''||(typeof settingsSubTab!=='undefined'?settingsSubTab:null)==='smspipeline') && <Card style={{marginBottom:8}}>
                <div onClick={()=>(typeof setSettingsSubTab==='function'?setSettingsSubTab:function(){})(p=>p==='smspipeline'?'':'smspipeline')} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:settingsSubTab==='smspipeline'?16:0}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#7C3AED,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="repeat" s={16} style={{color:'#fff'}}/></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.text}}>Automatisations pipeline</div>
                    <div style={{fontSize:10,color:T.text3}}>SMS + Email automatiques par colonne (sauvegardé en base)</div>
                  </div>
                  <I n={settingsSubTab==='smspipeline'?'chevron-up':'chevron-down'} s={16} style={{color:T.text3}}/>
                </div>
                {settingsSubTab==='smspipeline' && <div>
                {(()=>{
                  const allStages = orderedStages || [];
                  // Load automations from prop (DB-backed via init)
                  const automations = _T.pipeAutomations || [];
                  // Load from init if not yet set
                  if(!_T.pipeAutomationsLoaded){
                    _T.pipeAutomationsLoaded=true;
                    api('/api/data/pipeline-automations?companyId='+company.id).then(data=>{
                      _T.pipeAutomations=Array.isArray(data)?data:[];
                      setPhoneRightAccordion(p=>({...p,_r:Date.now()}));
                    }).catch(()=>{});
                  }
                  const getRule=(stageId,trigger)=>automations.find(a=>a.pipelineStageId===stageId&&a.triggerType===trigger);
                  const saveRule=(stageId,trigger,updates)=>{
                    const body={pipelineStageId:stageId,triggerType:trigger,companyId:company.id,...updates};
                    api('/api/data/pipeline-automations',{method:'POST',body}).then(r=>{
                      if(r?.success){
                        // Refresh automations
                        api('/api/data/pipeline-automations?companyId='+company.id).then(data=>{
                          _T.pipeAutomations=Array.isArray(data)?data:[];
                          setPhoneRightAccordion(p=>({...p,_r:Date.now()}));
                        });
                      }
                    }).catch(()=>{});
                  };
                  const defaultSms={
                    nouveau:"Bonjour {nom}, merci pour votre intérêt !",
                    contacte:"Bonjour {nom}, suite à notre échange, n'hésitez pas à nous recontacter.",
                    qualifie:"Bonjour {nom}, nous avons bien noté votre intérêt.",
                    rdv_programme:"Bonjour {nom}, votre RDV est confirmé le {date_rdv} à {heure_rdv}.",
                    nrp:"Bonjour {nom}, j'ai essayé de vous joindre. N'hésitez pas à me rappeler.",
                    client_valide:"Félicitations {nom} ! Bienvenue parmi nos clients !",
                  };
                  const defaultEmail={
                    rdv_programme:{subject:"Confirmation RDV — {company}",body:"Bonjour {prenom},\n\nVotre rendez-vous est confirmé pour le {date_rdv} à {heure_rdv}.\n\nÀ bientôt.\n\nCordialement,\n{collab}"},
                    client_valide:{subject:"Bienvenue — {company}",body:"Bonjour {prenom},\n\nNous avons le plaisir de vous confirmer que votre dossier est validé.\n\nBienvenue parmi nos clients !\n\nCordialement,\n{collab}"},
                    qualifie:{subject:"Suivi de votre dossier — {company}",body:"Bonjour {prenom},\n\nNous avons bien noté votre intérêt. Nous vous recontacterons rapidement pour planifier un rendez-vous.\n\nCordialement,\n{collab}"},
                  };
                  return <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {allStages.map(stage=>{
                      const entryRule = getRule(stage.id,'entry');
                      const exitRule = getRule(stage.id,'exit');
                      const hasAny = entryRule?.enabled || exitRule?.enabled;
                      const isOpen = (typeof iaHubCollapse!=='undefined'?iaHubCollapse:null)['pa_'+stage.id];
                      return <div key={stage.id} style={{borderRadius:10,border:'1px solid '+(hasAny?stage.color+'40':T.border),background:hasAny?stage.color+'04':T.bg,overflow:'hidden'}}>
                        <div onClick={()=>setIaHubCollapse(p=>({...p,['pa_'+stage.id]:!p['pa_'+stage.id]}))} style={{padding:'10px 12px',display:'flex',alignItems:'center',gap:8,cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background=stage.color+'08'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <span style={{width:10,height:10,borderRadius:5,background:stage.color,flexShrink:0}}/>
                          <span style={{fontSize:13,fontWeight:700,color:T.text,flex:1}}>{PIPELINE_LABELS[stage.id]||stage.label}</span>
                          {entryRule?.enabled && <span style={{fontSize:8,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'#22C55E15',color:'#22C55E'}}>📥 {entryRule.send_sms&&entryRule.send_email?'SMS+Email':entryRule.send_sms?'SMS':'Email'}</span>}
                          {exitRule?.enabled && <span style={{fontSize:8,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'#F59E0B15',color:'#F59E0B'}}>📤 {exitRule.send_sms&&exitRule.send_email?'SMS+Email':exitRule.send_sms?'SMS':'Email'}</span>}
                          <I n={isOpen?'chevron-up':'chevron-down'} s={14} style={{color:T.text3}}/>
                        </div>
                        {isOpen && <div style={{padding:'0 12px 12px',display:'flex',flexDirection:'column',gap:10}}>
                          {/* ── ENTRÉE ── */}
                          {['entry','exit'].map(trigger=>{
                            const rule = trigger==='entry'?entryRule:exitRule;
                            const isEntry = trigger==='entry';
                            const color = isEntry?'#22C55E':'#F59E0B';
                            const label = isEntry?'📥 Entrée dans la colonne':'📤 Sortie de la colonne';
                            const defSms = defaultSms[stage.id]||'Bonjour {nom}, votre statut a changé.';
                            const defEmail = defaultEmail[stage.id]||{subject:'Mise à jour — {company}',body:'Bonjour {prenom},\n\nVotre statut a été mis à jour.\n\nCordialement,\n{collab}'};
                            return <div key={trigger} style={{padding:10,borderRadius:8,border:'1px solid '+color+'20',background:color+'04'}}>
                              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                                <span style={{fontSize:11,fontWeight:700,color,flex:1}}>{label}</span>
                                <div onClick={()=>saveRule(stage.id,trigger,{enabled:!(rule?.enabled),send_sms:rule?.send_sms||0,send_email:rule?.send_email||0,sms_content:rule?.sms_content||defSms,email_subject:rule?.email_subject||defEmail.subject,email_content:rule?.email_content||defEmail.body,is_auto:1})} style={{width:38,height:20,borderRadius:10,background:rule?.enabled?color:'#CBD5E1',cursor:'pointer',position:'relative',transition:'all .3s'}}>
                                  <div style={{width:16,height:16,borderRadius:8,background:'#fff',position:'absolute',top:2,left:rule?.enabled?20:2,transition:'all .3s',boxShadow:'0 1px 2px rgba(0,0,0,.2)'}}/>
                                </div>
                              </div>
                              {rule?.enabled && <>
                                {/* Toggles SMS / Email */}
                                <div style={{display:'flex',gap:6,marginBottom:8}}>
                                  {[{key:'send_sms',label:'💬 SMS',icon:'message-square'},{key:'send_email',label:'📧 Email',icon:'mail'}].map(ch=>(
                                    <div key={ch.key} onClick={()=>saveRule(stage.id,trigger,{...rule,[ch.key]:rule[ch.key]?0:1,enabled:1})} style={{flex:1,padding:'6px 8px',borderRadius:6,border:'1px solid '+(rule[ch.key]?color+'40':T.border),background:rule[ch.key]?color+'08':'transparent',cursor:'pointer',display:'flex',alignItems:'center',gap:4,justifyContent:'center',transition:'all .15s'}}>
                                      <I n={ch.icon} s={12} style={{color:rule[ch.key]?color:T.text3}}/>
                                      <span style={{fontSize:10,fontWeight:rule[ch.key]?700:500,color:rule[ch.key]?color:T.text3}}>{ch.label}</span>
                                    </div>
                                  ))}
                                </div>
                                {/* SMS content */}
                                {rule.send_sms ? <div style={{marginBottom:8}}>
                                  <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Contenu SMS</div>
                                  <textarea defaultValue={rule.sms_content||defSms} onBlur={e=>saveRule(stage.id,trigger,{...rule,sms_content:e.target.value})} rows={2} style={{width:'100%',padding:8,borderRadius:6,border:'1px solid '+color+'30',background:T.card,fontSize:10,fontFamily:'inherit',color:T.text,resize:'none',outline:'none',boxSizing:'border-box'}}/>
                                  <div style={{fontSize:8,color:T.text3}}>Variables : {'{nom}'} {'{prenom}'} {'{phone}'} {'{date_rdv}'} {'{heure_rdv}'}</div>
                                </div> : null}
                                {/* Email content */}
                                {rule.send_email ? <div>
                                  <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Objet email</div>
                                  <input defaultValue={rule.email_subject||defEmail.subject} onBlur={e=>saveRule(stage.id,trigger,{...rule,email_subject:e.target.value})} style={{width:'100%',padding:'5px 8px',borderRadius:6,border:'1px solid '+color+'30',background:T.card,fontSize:10,fontFamily:'inherit',color:T.text,outline:'none',boxSizing:'border-box',marginBottom:4}}/>
                                  <div style={{fontSize:9,fontWeight:700,color:T.text3,marginBottom:3}}>Corps email</div>
                                  <textarea defaultValue={rule.email_content||defEmail.body} onBlur={e=>saveRule(stage.id,trigger,{...rule,email_content:e.target.value})} rows={4} style={{width:'100%',padding:8,borderRadius:6,border:'1px solid '+color+'30',background:T.card,fontSize:10,fontFamily:'inherit',color:T.text,resize:'vertical',outline:'none',boxSizing:'border-box'}}/>
                                  <div style={{fontSize:8,color:T.text3,marginTop:2}}>Variables : {'{nom}'} {'{prenom}'} {'{email}'} {'{company}'} {'{collab}'} {'{date_rdv}'} {'{heure_rdv}'}</div>
                                </div> : null}
                                {/* Auto vs validation */}
                                <div style={{display:'flex',alignItems:'center',gap:6,marginTop:6,padding:'4px 8px',borderRadius:6,background:T.bg,border:'1px solid '+T.border}}>
                                  <I n={rule.is_auto?'zap':'hand'} s={10} style={{color:rule.is_auto?'#22C55E':'#F59E0B'}}/>
                                  <span style={{fontSize:9,color:T.text2,flex:1}}>{rule.is_auto?'Envoi automatique':'Demander validation'}</span>
                                  <div onClick={()=>saveRule(stage.id,trigger,{...rule,is_auto:rule.is_auto?0:1})} style={{fontSize:8,fontWeight:600,color:T.accent,cursor:'pointer',padding:'2px 6px',borderRadius:4,background:T.accentBg}}>
                                    {rule.is_auto?'Passer en validation':'Passer en auto'}
                                  </div>
                                </div>
                              </>}
                            </div>;
                          })}
                        </div>}
                      </div>;
                    })}
                  </div>;
                })()}
              </div>}
              </Card>}

              {/* Power Dialer */}
              {((typeof settingsSubTab!=='undefined'?settingsSubTab:null)===''||(typeof settingsSubTab!=='undefined'?settingsSubTab:null)==='powerdialer') && <Card style={{marginBottom:8}}>
                <div onClick={()=>(typeof setSettingsSubTab==='function'?setSettingsSubTab:function(){})(p=>p==='powerdialer'?'':'powerdialer')} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:settingsSubTab==='powerdialer'?16:0}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'#3B82F612',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="phone-call" s={16} style={{color:'#3B82F6'}}/></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.text}}>Power Dialer</div>
                    <div style={{fontSize:10,color:T.text3}}>Ring timeout, auto-dial</div>
                  </div>
                  <I n={settingsSubTab==='powerdialer'?'chevron-up':'chevron-down'} s={16} style={{color:T.text3}}/>
                </div>
                {settingsSubTab==='powerdialer' && <div>
                <div style={{padding:12,borderRadius:10,border:'1px solid '+T.border,background:T.bg}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:T.text}}>Temps de sonnerie max</div>
                      <div style={{fontSize:11,color:T.text3,marginTop:2}}>Raccrocher auto si pas de réponse après X secondes</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <input type="number" min={5} max={60} step={5} defaultValue={parseInt(localStorage.getItem('c360-pd-ring-timeout-'+collab.id)||'15',10)} onChange={e=>{localStorage.setItem('c360-pd-ring-timeout-'+collab.id,e.target.value);showNotif('Ring timeout: '+e.target.value+'s');}} style={{width:60,padding:'8px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:14,fontWeight:700,textAlign:'center',color:T.text}}/>
                      <span style={{fontSize:12,color:T.text3}}>sec</span>
                    </div>
                  </div>
                </div>
              </div>}
              </Card>}

              {/* Détection messagerie */}
              {((typeof settingsSubTab!=='undefined'?settingsSubTab:null)===''||(typeof settingsSubTab!=='undefined'?settingsSubTab:null)==='amd') && <Card style={{marginBottom:8}}>
                <div onClick={()=>(typeof setSettingsSubTab==='function'?setSettingsSubTab:function(){})(p=>p==='amd'?'':'amd')} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:settingsSubTab==='amd'?16:0}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'#6366F112',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="voicemail" s={16} style={{color:'#6366F1'}}/></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.text}}>Détection messagerie</div>
                    <div style={{fontSize:10,color:T.text3}}>AMD, voicemail drop</div>
                  </div>
                  <I n={settingsSubTab==='amd'?'chevron-up':'chevron-down'} s={16} style={{color:T.text3}}/>
                </div>
                {settingsSubTab==='amd' && <div>
                <p style={{fontSize:11,color:T.text3,marginBottom:12}}>Si activé, détecte automatiquement les messageries vocales. Dépose un message audio et envoie un SMS au prospect.</p>

                {/* Toggle AMD */}
                <div style={{padding:12,borderRadius:10,border:'1px solid '+T.border,background:T.bg,marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:T.text}}>Activer la détection</div>
                      <div style={{fontSize:11,color:T.text3,marginTop:2}}>Détecte automatiquement si c'est une messagerie vocale</div>
                    </div>
                    <div onClick={()=>{
                      const next = collab.amd_enabled ? 0 : 1;
                      collab.amd_enabled = next;
                      api('/api/collaborators/'+collab.id,{method:'PUT',body:{amd_enabled:next}});
                      showNotif(next ? 'AMD activé' : 'AMD désactivé');
                      setPhoneRightAccordion(p=>({...p,_r:Date.now()})); // force re-render
                    }} style={{width:44,height:24,borderRadius:12,background:collab.amd_enabled?'#7C3AED':'#CBD5E1',cursor:'pointer',position:'relative',transition:'all .3s',flexShrink:0}}>
                      <div style={{width:20,height:20,borderRadius:10,background:'#fff',position:'absolute',top:2,left:collab.amd_enabled?22:2,transition:'all .3s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                    </div>
                  </div>
                </div>

                {collab.amd_enabled ? <>
                  {/* 1. Audio personnalisé — EN PRIORITÉ */}
                  <div style={{padding:14,borderRadius:10,border:'1.5px solid #7C3AED30',background:'#7C3AED06',marginBottom:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                      <I n="mic" s={14} style={{color:'#7C3AED'}}/>
                      <div style={{fontSize:13,fontWeight:700,color:T.text}}>Audio personnalisé</div>
                      <span style={{fontSize:9,padding:'2px 8px',borderRadius:10,background:'#7C3AED15',color:'#7C3AED',fontWeight:700}}>Prioritaire</span>
                    </div>
                    <div style={{fontSize:10,color:T.text3,marginBottom:8}}>Téléversez votre message audio (MP3, max 30s). Il sera déposé dans la messagerie du prospect.</div>

                    {/* Upload button */}
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                      <div onClick={()=>{
                        const input=document.createElement('input');input.type='file';input.accept='audio/*';
                        input.onchange=e=>{
                          const file=e.target.files[0];if(!file)return;
                          const reader=new FileReader();
                          reader.onload=ev=>{
                            const base64=ev.target.result;
                            // Upload to server
                            api('/api/collaborators/'+collab.id+'/voicemail-audio',{method:'POST',body:{audio:base64,filename:file.name}}).then(r=>{
                              if(r?.url){
                                collab.voicemail_audio_url=r.url;
                                api('/api/collaborators/'+collab.id,{method:'PUT',body:{voicemail_audio_url:r.url}});
                                showNotif('Audio téléversé !');
                                setPhoneRightAccordion(p=>({...p,_r:Date.now()}));
                              } else {
                                // Fallback: store as data URL temporarily
                                collab.voicemail_audio_url=base64;
                                showNotif('Audio chargé (preview)');
                                setPhoneRightAccordion(p=>({...p,_r:Date.now()}));
                              }
                            }).catch(()=>{
                              collab.voicemail_audio_url=base64;
                              showNotif('Audio chargé localement');
                              setPhoneRightAccordion(p=>({...p,_r:Date.now()}));
                            });
                          };
                          reader.readAsDataURL(file);
                        };
                        input.click();
                      }} style={{padding:'8px 16px',borderRadius:8,background:'#7C3AED',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                        <I n="upload" s={12}/> Téléverser un audio
                      </div>
                      <span style={{fontSize:10,color:T.text3}}>ou</span>
                      <input defaultValue={collab.voicemail_audio_url&&!collab.voicemail_audio_url.startsWith('data:')?collab.voicemail_audio_url:''} onBlur={e=>{
                        if(e.target.value){
                          collab.voicemail_audio_url=e.target.value;
                          api('/api/collaborators/'+collab.id,{method:'PUT',body:{voicemail_audio_url:e.target.value}});
                          showNotif('URL audio sauvegardée');
                          setPhoneRightAccordion(p=>({...p,_r:Date.now()}));
                        }
                      }} placeholder="URL directe (https://...mp3)" style={{flex:1,padding:'8px 10px',borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:11,fontFamily:'inherit',color:T.text,outline:'none'}}/>
                    </div>

                    {/* Audio player preview */}
                    {collab.voicemail_audio_url && (
                      <div style={{padding:10,borderRadius:8,background:T.card,border:'1px solid '+T.border}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                          <I n="volume-2" s={12} style={{color:'#7C3AED'}}/>
                          <span style={{fontSize:11,fontWeight:600,color:T.text}}>Aperçu du message</span>
                          <div onClick={()=>{
                            collab.voicemail_audio_url='';
                            api('/api/collaborators/'+collab.id,{method:'PUT',body:{voicemail_audio_url:''}});
                            showNotif('Audio supprimé');
                            setPhoneRightAccordion(p=>({...p,_r:Date.now()}));
                          }} style={{marginLeft:'auto',fontSize:10,color:'#EF4444',cursor:'pointer',fontWeight:600}}>Supprimer</div>
                        </div>
                        <audio controls src={collab.voicemail_audio_url} style={{width:'100%',height:36,borderRadius:6}}/>
                      </div>
                    )}
                  </div>

                  {/* 2. Message texte — fallback si pas d'audio */}
                  <div style={{padding:14,borderRadius:10,border:'1px solid '+T.border,background:T.bg}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                      <I n="type" s={14} style={{color:T.text3}}/>
                      <div style={{fontSize:13,fontWeight:700,color:T.text}}>Message texte (fallback)</div>
                    </div>
                    <div style={{fontSize:10,color:T.text3,marginBottom:6}}>Utilisé uniquement si aucun audio n'est téléversé. Lu par la voix IA Alice (français).</div>
                    <textarea defaultValue={collab.voicemail_text||"Bonjour, j'ai essayé de vous joindre. N'hésitez pas à me rappeler. Cordialement."} onBlur={e=>{
                      collab.voicemail_text=e.target.value;
                      api('/api/collaborators/'+collab.id,{method:'PUT',body:{voicemail_text:e.target.value}});
                      showNotif('Message texte sauvegardé');
                    }} rows={2} style={{width:'100%',padding:10,borderRadius:8,border:'1px solid '+T.border,background:T.card,fontSize:12,fontFamily:'inherit',color:T.text,resize:'none',outline:'none'}}/>
                  </div>
                </> : null}
              </div>}
              </Card>}

              {/* V1.10.1 — Sauvegardes & restauration (UI self-service R3). Wording strict UX : "sauvegardes / restaurer / annuler" — JAMAIS "snapshot" */}
              {(settingsSubTab===''||settingsSubTab==='sauvegardes') && <Card style={{marginBottom:8}}>
                <div onClick={()=>(typeof setSettingsSubTab==='function'?setSettingsSubTab:function(){})(p=>p==='sauvegardes'?'':'sauvegardes')} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:settingsSubTab==='sauvegardes'?16:0}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'#10B98112',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="shield" s={16} style={{color:'#10B981'}}/></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.text}}>Sauvegardes & restauration</div>
                    <div style={{fontSize:10,color:T.text3}}>Vos données sont protégées automatiquement</div>
                  </div>
                  <I n={settingsSubTab==='sauvegardes'?'chevron-up':'chevron-down'} s={16} style={{color:T.text3}}/>
                </div>
                {settingsSubTab==='sauvegardes' && <div>
                  {/* Header rassurant */}
                  <div style={{padding:'14px 16px',borderRadius:12,background:'linear-gradient(135deg,#10B98108,#22C55E04)',border:'1px solid #10B98125',marginBottom:12}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                      <span style={{fontSize:22}}>🛡</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,color:T.text}}>Vos données sont sauvegardées automatiquement</div>
                        <div style={{fontSize:11,color:T.text3,marginTop:2}}>
                          {collabSnapshotsList[0]
                            ? `Dernière sauvegarde : ${fmtSnapshotAgo(collabSnapshotsList[0].createdAt)}`
                            : (collabSnapshotsLoading ? 'Chargement…' : 'Aucune sauvegarde encore')}
                        </div>
                      </div>
                    </div>
                    <Btn small primary disabled={snapshotManualLoading} onClick={createManualSnapshot}>
                      {snapshotManualLoading ? <Spinner size={12}/> : <I n="plus" s={12}/>}
                      <span style={{marginLeft:6}}>Créer une sauvegarde maintenant</span>
                    </Btn>
                    {snapshotLastRestoreUndo?.preRestoreSnapshotId && (
                      <div style={{marginTop:10,padding:'8px 10px',borderRadius:8,background:'#F59E0B10',border:'1px solid #F59E0B30',display:'flex',alignItems:'center',gap:8}}>
                        <I n="rotate-ccw" s={13} style={{color:'#B45309'}}/>
                        <div style={{flex:1,fontSize:11,color:'#92400E'}}>Vous venez de restaurer un état précédent. Vous pouvez encore annuler cette action.</div>
                        <Btn small onClick={undoLastRestore}><I n="undo" s={11}/> Annuler la restauration</Btn>
                      </div>
                    )}
                  </div>

                  {/* Liste des sauvegardes */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <div style={{fontSize:12,fontWeight:700,color:T.text2}}>
                      Historique ({collabSnapshotsList.length})
                    </div>
                    <Btn small ghost onClick={fetchCollabSnapshots} disabled={collabSnapshotsLoading}>
                      <I n="refresh-cw" s={11}/> Actualiser
                    </Btn>
                  </div>

                  {collabSnapshotsLoading && collabSnapshotsList.length === 0 ? (
                    <div style={{textAlign:'center',padding:20,color:T.text3,fontSize:12}}>Chargement…</div>
                  ) : collabSnapshotsList.length === 0 ? (
                    <div style={{textAlign:'center',padding:20,color:T.text3,fontSize:12}}>
                      <I n="shield-off" s={20} style={{color:T.text3,display:'block',margin:'0 auto 6px'}}/>
                      Aucune sauvegarde pour l'instant.<br/>
                      Une sauvegarde automatique sera créée dès qu'un changement sera détecté.
                    </div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:380,overflowY:'auto'}}>
                      {collabSnapshotsList.map(s => {
                        const isManual = s.kind === 'manual';
                        const isPreRestore = s.kind === 'pre-restore';
                        const tagColor = isManual ? '#7C3AED' : isPreRestore ? '#F59E0B' : '#10B981';
                        const tagLabel = isManual ? '👆 Manuel' : isPreRestore ? '⏪ Pré-restauration' : '🔄 Auto';
                        return (
                          <div key={s.id} style={{padding:'10px 12px',borderRadius:10,border:'1px solid '+T.border,background:T.bg,display:'flex',alignItems:'center',gap:10}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                                <span style={{fontSize:13,fontWeight:700,color:T.text}}>{fmtSnapshotAgo(s.createdAt)}</span>
                                <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:5,background:tagColor+'15',color:tagColor,letterSpacing:0.3}}>{tagLabel}</span>
                              </div>
                              <div style={{fontSize:10,color:T.text3}}>
                                {s.summary?.contacts != null ? `${s.summary.contacts} contacts · ` : ''}
                                {s.summary?.bookings != null ? `${s.summary.bookings} RDV · ` : ''}
                                {(s.sizeBytes/1024).toFixed(1)} KB
                              </div>
                            </div>
                            <Btn small ghost onClick={()=>openSnapshotPreview(s.id)} disabled={snapshotPreviewLoading}>
                              <I n="eye" s={11}/> Voir les détails
                            </Btn>
                            <Btn small primary onClick={()=>setSnapshotConfirmRestore(s)}>
                              <I n="rotate-ccw" s={11}/> Restaurer cet état
                            </Btn>
                            <Btn small ghost danger onClick={()=>deleteSnapshot(s)} title="Supprimer cette sauvegarde">
                              <I n="trash-2" s={11}/>
                            </Btn>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{marginTop:12,padding:'10px 12px',borderRadius:8,background:'#0EA5E908',border:'1px solid #0EA5E930',fontSize:11,color:T.text2,lineHeight:1.5,display:'flex',alignItems:'flex-start',gap:8}}>
                    <I n="info" s={13} style={{color:'#0EA5E9',flexShrink:0,marginTop:1}}/>
                    <div>
                      <strong style={{color:T.text}}>Conservation :</strong> les sauvegardes de plus de 7 jours sont automatiquement supprimées.
                      <div style={{fontSize:10,color:T.text3,marginTop:3}}>Politique détaillée : 20 dernières + 1 par heure sur 24h + 1 par jour sur 7 jours. Les sauvegardes "Pré-restauration" récentes sont protégées (utilisées pour annuler une restauration).</div>
                    </div>
                  </div>
                </div>}
              </Card>}

              {/* Mes calendriers — toujours visible */}
              <Card style={{marginBottom:8}}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:"#22C55E12", display:"flex", alignItems:"center", justifyContent:"center" }}><I n="calendar" s={16} style={{ color:"#22C55E" }}/></div>
                  <h3 style={{ fontSize:14, fontWeight:700, margin:0 }}>Mes calendriers ({myCalendars.length})</h3>
                </div>
                {myCalendars.length === 0 ? (
                  <div style={{ padding:"20px", textAlign:"center", color:T.text3, fontSize:13 }}>Aucun calendrier assigné. Contactez l'administrateur.</div>
                ) : (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))", gap:10 }}>
                    {myCalendars.map(cal => {
                      const calBookings = myBookings.filter(b=>b.calendarId===cal.id&&b.status!=="cancelled").length;
                      return (
                        <div key={cal.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", borderRadius:12, background:cal.color+"08", border:`1px solid ${cal.color}20` }}>
                          <div style={{ width:12, height:12, borderRadius:4, background:cal.color, flexShrink:0 }}/>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:700 }}>{cal.name}</div>
                            <div style={{ display:"flex", gap:6, marginTop:4 }}>
                              <Badge color={cal.type==="multi"?"#7C3AED":"#2563EB"}>{cal.type==="multi"?"Multi":"Simple"}</Badge>
                              <span style={{ fontSize:11, color:T.text3 }}>{cal.duration}min</span>
                            </div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontSize:18, fontWeight:800, color:cal.color }}>{calBookings}</div>
                            <div style={{ fontSize:10, color:T.text3 }}>RDV</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Google Agenda */}
              <Card style={{ gridColumn:"1/-1" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                  <div style={{ width:40, height:40, borderRadius:12, background:"#4285F410", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" fill="#4285F4" opacity=".12"/><path d="M17.64 12.2c0-.63-.06-1.25-.16-1.84H12v3.49h3.16c-.14.73-.55 1.35-1.17 1.76v1.46h1.89c1.1-1.02 1.74-2.52 1.74-4.3l.02-.57z" fill="#4285F4"/><path d="M12 18c1.58 0 2.91-.52 3.88-1.42l-1.89-1.46c-.52.35-1.19.56-1.99.56-1.53 0-2.83-1.04-3.29-2.43H6.77v1.51C7.73 16.78 9.72 18 12 18z" fill="#34A853"/><path d="M8.71 13.25a3.56 3.56 0 010-2.5V9.24H6.77a5.99 5.99 0 000 5.52l1.94-1.51z" fill="#FBBC05"/><path d="M12 8.32c.86 0 1.64.3 2.25.88l1.69-1.69C14.9 6.5 13.58 6 12 6 9.72 6 7.73 7.22 6.77 9.24l1.94 1.51c.46-1.39 1.76-2.43 3.29-2.43z" fill="#EA4335"/></svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <h3 style={{ fontSize:15, fontWeight:700, margin:0 }}>Google Agenda</h3>
                    <p style={{ fontSize:12, color:T.text3, margin:0 }}>Synchronisation automatique des rendez-vous</p>
                  </div>
                  {(typeof googleConnected!=='undefined'?googleConnected:null) && <Badge color="#22C55E" style={{ marginLeft:"auto" }}>Connecté</Badge>}
                </div>
                {(typeof googleConnected!=='undefined'?googleConnected:null) ? (
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ flex:1, padding:"12px 16px", borderRadius:12, background:"#22C55E08", border:"1px solid #22C55E20", fontSize:13, color:"#22C55E" }}>
                      {(typeof googleEmail!=='undefined'?googleEmail:null) && <div style={{ fontWeight:600, marginBottom:4 }}>{googleEmail}</div>}
                      Vos rendez-vous sont automatiquement synchronisés avec votre Google Agenda.
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      <Btn small primary onClick={syncGoogle} disabled={googleLoading}><I n="refresh-cw" s={12}/> Synchroniser</Btn>
                      <Btn small danger onClick={() => {
                        setGoogleLoading(true);
                        fetch(`${API_BASE}/api/google/disconnect`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ collaboratorId: collab.id }) })
                          .then(r => r.json())
                          .then(() => { setGoogleConnected(false); setGoogleEmail(null); showNotif("Google Agenda déconnecté"); })
                          .catch(() => showNotif("Erreur", "danger"))
                          .finally(() => setGoogleLoading(false));
                      }} disabled={googleLoading}>
                        <I n="x" s={12}/> Déconnecter
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize:13, color:T.text2, marginBottom:14, lineHeight:1.5 }}>
                      Connectez votre Google Agenda pour que vos rendez-vous Calendar360 apparaissent automatiquement dans votre agenda Google.
                    </p>
                    <Btn primary onClick={() => {
                      setGoogleLoading(true);
                      fetch(`${API_BASE}/api/google/auth-url?collaboratorId=${collab.id}`)
                        .then(r => r.json())
                        .then(d => { if (d.url) window.location.href = d.url; })
                        .catch(() => showNotif("Erreur de connexion Google", "danger"))
                        .finally(() => setGoogleLoading(false));
                    }} disabled={googleLoading}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight:6 }}><path d="M17.64 12.2c0-.63-.06-1.25-.16-1.84H12v3.49h3.16c-.14.73-.55 1.35-1.17 1.76v1.46h1.89c1.1-1.02 1.74-2.52 1.74-4.3l.02-.57z" fill="#fff"/><path d="M12 18c1.58 0 2.91-.52 3.88-1.42l-1.89-1.46c-.52.35-1.19.56-1.99.56-1.53 0-2.83-1.04-3.29-2.43H6.77v1.51C7.73 16.78 9.72 18 12 18z" fill="#fff" opacity=".8"/><path d="M8.71 13.25a3.56 3.56 0 010-2.5V9.24H6.77a5.99 5.99 0 000 5.52l1.94-1.51z" fill="#fff" opacity=".6"/><path d="M12 8.32c.86 0 1.64.3 2.25.88l1.69-1.69C14.9 6.5 13.58 6 12 6 9.72 6 7.73 7.22 6.77 9.24l1.94 1.51c.46-1.39 1.76-2.43 3.29-2.43z" fill="#fff" opacity=".9"/></svg>
                      Connecter Google Agenda
                    </Btn>
                  </div>
                )}
              </Card>

              {/* Résumé & Stats */}
              <Card style={{ gridColumn:"1/-1" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:"#7C3AED12", display:"flex", alignItems:"center", justifyContent:"center" }}><I n="bar-chart-2" s={16} style={{ color:"#7C3AED" }}/></div>
                  <h3 style={{ fontSize:15, fontWeight:700, margin:0 }}>Mon activité</h3>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
                  {[
                    { label:"Total RDV", value:myBookings.length, icon:"calendar", color:"#2563EB" },
                    { label:"Confirmés", value:myBookings.filter(b=>b.status==="confirmed").length, icon:"check", color:"#22C55E" },
                    { label:"En attente", value:myBookings.filter(b=>b.status==="pending").length, icon:"clock", color:"#F59E0B" },
                    { label:"Annulés", value:myBookings.filter(b=>b.status==="cancelled").length, icon:"x", color:"#EF4444" },
                    { label:"Calendriers", value:myCalendars.length, icon:"grid", color:"#7C3AED" },
                  ].map((s,i)=>(
                    <div key={i} style={{ padding:"12px 8px", borderRadius:12, background:s.color+"08", border:`1px solid ${s.color}18`, textAlign:"center" }}>
                      <I n={s.icon} s={16} style={{ color:s.color, marginBottom:4 }}/>
                      <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.value}</div>
                      <div style={{ fontSize:10, color:T.text3, fontWeight:600 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Actions rapides */}
              <Card style={{ gridColumn:"1/-1" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:T.accentBg, display:"flex", alignItems:"center", justifyContent:"center" }}><I n="zap" s={16} style={{ color:T.accent }}/></div>
                  <h3 style={{ fontSize:15, fontWeight:700, margin:0 }}>Actions rapides</h3>
                </div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <Btn small primary onClick={()=>exportICS()}><I n="download" s={14}/> Exporter mes RDV (.ics)</Btn>
                  <Btn small onClick={()=>{setPortalTab("availability");}}><I n="grid" s={14}/> Gérer mes disponibilités</Btn>
                  <Btn small onClick={()=>{setPortalTab("messages");}}><I n="message-circle" s={14}/> Ouvrir le chat</Btn>
                  <Btn small onClick={()=>{
                    const data = { profile: { name:collab.name, email:collab.email, role:collab.role }, bookings: myBookings.length, calendars: myCalendars.map(c=>c.name) };
                    const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
                    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download="mon-profil-calendar360.json"; a.click(); URL.revokeObjectURL(url);
                    showNotif("Données exportées");
                  }}><I n="download" s={14}/> Exporter mes données</Btn>
                </div>
              </Card>
            </div>
          </div>);
        })()}

        {/* ── OBJECTIFS ── */}
        {portalTab === "objectifs" && <ObjectifsTab/>}

        </div>
        {/* end tab animation wrapper */}
      </main>

      {/* ── BOOKING DETAIL MODAL — ENRICHED V1 (3 onglets: RDV, Contact, Notes) ── */}
      <Modal open={!!selectedBooking} onClose={() => { setSelectedBooking(null); setRescheduleData(null); setBookingDetailTab('rdv'); }} title="" width={640}>
        {selectedBooking && (() => {
          const b = selectedBooking;
          const cal = calendars.find(c => c.id === b.calendarId);
          const _bContact = b.contactId ? (contacts||[]).find(c => c.id === b.contactId) : (contacts||[]).find(c => c.email && b.visitorEmail && c.email.toLowerCase() === b.visitorEmail.toLowerCase());
          const _bContactBookings = _bContact ? (bookings||[]).filter(bk => bk.contactId === _bContact.id).sort((a,bb) => (bb.date+bb.time).localeCompare(a.date+a.time)) : [];
          const _bStages = [...(DEFAULT_STAGES||[{id:"nouveau",label:"Nouveau",color:"#2563EB"},{id:"contacte",label:"En discussion",color:"#F59E0B"},{id:"qualifie",label:"Intéressé",color:"#7C3AED"},{id:"rdv_programme",label:"RDV Programmé",color:"#0EA5E9"},{id:"nrp",label:"NRP",color:"#EF4444"},{id:"client_valide",label:"Client Validé",color:"#22C55E"},{id:"perdu",label:"Perdu",color:"#64748B"}]), ...((typeof pipelineStages!=='undefined'?pipelineStages:null)||[])];
          const _bCurrentStage = _bContact ? _bStages.find(s => s.id === _bContact.pipeline_stage) : null;
          return (
            <div>
              {/* ── Header: Nom + Statut RDV ── */}
              <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:16 }}>
                <div style={{ width:48, height:48, borderRadius:14, background:(cal?.color||T.accent)+"14", display:"flex", alignItems:"center", justifyContent:"center", color:cal?.color||T.accent, fontWeight:700, fontSize:18 }}>{(b.visitorName||'?')[0]}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{ fontSize:18, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                    {(()=>{
                      const _bShared = _bContact && Array.isArray(_bContact.shared_with) ? _bContact.shared_with : [];
                      const _bHasXC = _bContact?.assignedTo && _bShared.length > 0;
                      return _bHasXC ? <span title="RDV cross-collaborateur" style={{fontSize:14}}>🤝</span> : null;
                    })()}
                    <span>{b.visitorName}</span>
                  </div>
                  {/* V1.8.15 — Ligne origine cross-collab */}
                  {(()=>{
                    if (!_bContact?.assignedTo) return null;
                    const _bShared = Array.isArray(_bContact.shared_with) ? _bContact.shared_with : [];
                    if (_bShared.length === 0) return null;
                    const _capN = (n) => { const s = String(n||'').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'; };
                    const _ownerN = _capN((collabs||[]).find(_c => _c.id === _bContact.assignedTo)?.name || '');
                    const _firstSharer = _bShared.find(_id => _id && _id !== _bContact.assignedTo);
                    const _sharerN = _firstSharer ? _capN((collabs||[]).find(_c => _c.id === _firstSharer)?.name || '') : '';
                    return <div style={{ fontSize:11, color:T.text3, marginTop:1, display:'flex', alignItems:'center', gap:4 }}>
                      {_sharerN && <><span>👤 Apporté par</span><b style={{color:T.text2}}>{_sharerN}</b><span>·</span></>}
                      <span>🎯 Géré par</span><b style={{color:T.text2}}>{_ownerN || '—'}</b>
                    </div>;
                  })()}
                  <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:2 }}>
                    <span style={{ fontSize:12, color:T.text3 }}>{cal?.name||''}</span>
                    {_bContact && <span style={{ fontSize:10, padding:"1px 6px", borderRadius:6, background:(_bCurrentStage?.color||T.text3)+"14", color:_bCurrentStage?.color||T.text3, fontWeight:600 }}>{_bCurrentStage?.label||_bContact.pipeline_stage||''}</span>}
                    {_bContact?._score !== undefined && <span style={{ fontSize:10, fontWeight:700, color:cScoreColor(_bContact._score) }}>Score {_bContact._score}</span>}
                  </div>
                </div>
                <Badge color={b.status==="confirmed"?T.success:b.status==="pending"?T.warning:T.danger}>{b.status==="confirmed"?"Confirmé":b.status==="pending"?"En attente":"Annulé"}</Badge>
              </div>

              {/* ── Tabs ── */}
              <div style={{ display:"flex", gap:0, marginBottom:16, borderBottom:`2px solid ${T.border}` }}>
                {[
                  {id:'rdv', label:'RDV', icon:'calendar'},
                  {id:'contact', label:'Contact', icon:'user', disabled:!_bContact},
                  {id:'notes', label:'Notes', icon:'edit-3', disabled:!_bContact},
                ].map(t => (
                  <div key={t.id} onClick={() => !t.disabled && (typeof setBookingDetailTab==='function'?setBookingDetailTab:function(){})(t.id)} style={{ padding:"8px 16px", fontSize:13, fontWeight:bookingDetailTab===t.id?700:500, color:t.disabled?T.text3+'60':bookingDetailTab===t.id?T.accent:T.text2, borderBottom:bookingDetailTab===t.id?`2px solid ${T.accent}`:'2px solid transparent', marginBottom:-2, cursor:t.disabled?'default':'pointer', display:'flex', alignItems:'center', gap:5, opacity:t.disabled?0.4:1, transition:'all .15s' }}>
                    <I n={t.icon} s={14}/> {t.label}
                  </div>
                ))}
              </div>

              {/* ══════ ONGLET RDV ══════ */}
              {bookingDetailTab === 'rdv' && (
                <div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                    {[
                      { icon:"calendar", label:"Date", value:fmtDate(b.date) },
                      { icon:"clock", label:"Heure", value:`${b.time} · ${b.duration}min` },
                      { icon:"mail", label:"Email", value:b.visitorEmail||'—' },
                      { icon:"phone", label:"Téléphone", value:b.visitorPhone||"—" },
                    ].map((f,i) => (
                      <div key={i} style={{ padding:"10px 14px", borderRadius:8, background:T.bg, display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ color:T.text3 }}><I n={f.icon} s={15}/></span>
                        <div>
                          <div style={{ fontSize:10, color:T.text3 }}>{f.label}</div>
                          <div style={{ fontSize:13, fontWeight:600 }}>{f.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Statut modifiable */}
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:T.text3, marginBottom:6 }}>Statut du RDV</div>
                    <div style={{ display:'flex', gap:6 }}>
                      {[{id:'confirmed',label:'Confirmé',color:T.success,icon:'check'},{id:'pending',label:'En attente',color:T.warning,icon:'clock'},{id:'cancelled',label:'Annulé',color:T.danger,icon:'x'}].map(s => (
                        <div key={s.id} onClick={() => { if(b.status!==s.id){ if(s.id==='cancelled') { cancelBookingAndCascade(b.id); } else { updateBooking(b.id,{status:s.id}); } setSelectedBooking({...b,status:s.id}); showNotif(`RDV ${s.label.toLowerCase()}`); if(s.id==='confirmed') sendNotification('booking-confirmed',buildNotifyPayload(b,calendars,[collab],company)); if(s.id==='cancelled') sendNotification('cancelled',buildNotifyPayload(b,calendars,[collab],company)); }}} style={{ padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:b.status===s.id?700:500, background:b.status===s.id?s.color+'18':'transparent', color:b.status===s.id?s.color:T.text3, border:`1px solid ${b.status===s.id?s.color+'40':T.border}`, cursor:'pointer', display:'flex', alignItems:'center', gap:4, transition:'all .15s' }}>
                          <I n={s.icon} s={12}/> {s.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Timezone info */}
                  {b.visitorTimezone && (() => {
                    const collabObj = b.collaboratorId ? collabs.find(c => c.id === b.collaboratorId) : null;
                    const collabTz = collabObj?.timezone || (company?.timezone) || 'Europe/Paris';
                    if (b.visitorTimezone === collabTz) return null;
                    let visitorLocalTime = b.time;
                    try { const [hh,mm]=b.time.split(':'); const dt=new Date(`${b.date}T${hh}:${mm}:00`); const getOffset=(tz)=>{const s=new Intl.DateTimeFormat('en',{timeZone:tz,timeZoneName:'shortOffset'}).format(dt);const m=s.match(/GMT([+-]?\d+:?\d*)/);if(!m)return 0;const p=m[1].split(':');return(parseInt(p[0])||0)*60+(parseInt(p[1])||0)*(p[0].startsWith('-')?-1:1);}; const diffMin=getOffset(b.visitorTimezone)-getOffset(collabTz); const[h2,m2]=b.time.split(':').map(Number); const totalMin=h2*60+m2+diffMin; const vh=Math.floor(((totalMin%1440)+1440)%1440/60); const vm=((totalMin%1440)+1440)%1440%60; visitorLocalTime=`${String(vh).padStart(2,'0')}:${String(vm).padStart(2,'0')}`; } catch{}
                    return (<div style={{ padding:"10px 14px", borderRadius:8, background:"#FFF7ED", border:"1px solid #FDBA7422", marginBottom:16, fontSize:12, color:"#9A3412", display:"flex", alignItems:"center", gap:8 }}><I n="globe" s={15}/><div><div><strong>Visiteur :</strong> {visitorLocalTime} ({b.visitorTimezone.replace(/_/g,' ')})</div><div><strong>Collaborateur :</strong> {b.time} ({collabTz.replace(/_/g,' ')})</div></div></div>);
                  })()}

                  {b.notes && (<div style={{ padding:"10px 14px", borderRadius:8, background:T.warningBg, border:`1px solid ${T.warning}22`, marginBottom:16, fontSize:13, color:T.text }}><span style={{ fontWeight:600, color:T.warning }}>Notes :</span> {b.notes}</div>)}

                  {/* Reschedule */}
                  {(typeof rescheduleData!=='undefined'?rescheduleData:null) && (
                    <div style={{ padding:16, borderRadius:10, background:T.accentBg, border:`1px solid ${T.accentBorder}`, marginBottom:16 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:T.accent, marginBottom:10 }}>Replanifier</div>
                      <div style={{ display:"flex", gap:10 }}>
                        <Input label="Nouvelle date" type="date" value={(typeof rescheduleData!=='undefined'?rescheduleData:{}).date} onChange={e => (typeof setRescheduleData==='function'?setRescheduleData:function(){})({...rescheduleData, date:e.target.value})} style={{ flex:1 }}/>
                        <Input label="Nouvelle heure" type="time" value={(typeof rescheduleData!=='undefined'?rescheduleData:{}).time} onChange={e => (typeof setRescheduleData==='function'?setRescheduleData:function(){})({...rescheduleData, time:e.target.value})} style={{ flex:1 }}/>
                      </div>
                      <div style={{ display:"flex", gap:8, marginTop:10 }}>
                        <Btn small primary onClick={() => { const _newDate=(typeof rescheduleData!=='undefined'?rescheduleData:{}).date; const _newTime=(typeof rescheduleData!=='undefined'?rescheduleData:{}).time; updateBooking(b.id, { date:_newDate, time:_newTime }); if(b.contactId) handleCollabUpdateContact(b.contactId, { next_rdv_date: _newDate, next_rdv_booking_id: b.id }); const rPayload = buildNotifyPayload(b, calendars, [collab], company); sendNotification('rescheduled', { ...rPayload, newDate: _newDate, newTime: _newTime }); setSelectedBooking({...b, date:_newDate, time:_newTime}); (typeof setRescheduleData==='function'?setRescheduleData:function(){})(null); showNotif("RDV replanifié"); }}>Confirmer</Btn>
                        <Btn small onClick={() => setRescheduleData(null)}>Annuler</Btn>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
                    {!rescheduleData && b.status!=="cancelled" && (<Btn onClick={() => (typeof setRescheduleData==='function'?setRescheduleData:function(){})({ date:b.date, time:b.time })}><I n="edit" s={14}/> Replanifier</Btn>)}
                    <Btn disabled={!!actionLoading} onClick={() => { (typeof setActionLoading==='function'?setActionLoading:function(){})("notify"); showNotif("Rappel envoyé par email + SMS","warning"); sendNotification('reminder', buildNotifyPayload(b, calendars, [collab], company)); setTimeout(()=>(typeof setActionLoading==='function'?setActionLoading:function(){})(null),600); }}>{actionLoading==="notify" ? <Spinner size={14}/> : <I n="bell" s={14}/>} Notifier</Btn>
                    <Btn onClick={() => { showNotif("Email de rappel envoyé","warning"); sendNotification('reminder', buildNotifyPayload(b, calendars, [collab], company)); }}><I n="mail" s={14}/> Rappel email</Btn>
                    <Btn onClick={() => window.open(toGoogleCalUrl(b),"_blank")}><I n="calendar" s={14}/> Google Agenda</Btn>
                    <Btn ghost danger onClick={() => { deleteBooking(b.id); setSelectedBooking(null); }}><I n="trash" s={14}/> Supprimer</Btn>
                  </div>
                </div>
              )}

              {/* ══════ ONGLET CONTACT ══════ */}
              {bookingDetailTab === 'contact' && _bContact && (
                <div>
                  {/* Contact info */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                    {[
                      { icon:"mail", label:"Email", value:_bContact.email||'—' },
                      { icon:"phone", label:"Téléphone", value:_bContact.phone ? displayPhone(_bContact.phone) : '—' },
                    ].map((f,i) => (
                      <div key={i} style={{ padding:"10px 14px", borderRadius:8, background:T.bg, display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ color:T.text3 }}><I n={f.icon} s={15}/></span>
                        <div>
                          <div style={{ fontSize:10, color:T.text3 }}>{f.label}</div>
                          <div style={{ fontSize:13, fontWeight:600 }}>{f.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pipeline stage — modifiable */}
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:T.text3, marginBottom:6 }}>Étape pipeline</div>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      {_bStages.map(s => (
                        <div key={s.id} onClick={() => { handleCollabUpdateContact(_bContact.id, { pipeline_stage: s.id }); showNotif(`Étape → ${PIPELINE_LABELS[s.id]||s.label}`); }} style={{ padding:'4px 10px', borderRadius:8, fontSize:11, fontWeight:_bContact.pipeline_stage===s.id?700:500, background:_bContact.pipeline_stage===s.id?s.color+'18':'transparent', color:_bContact.pipeline_stage===s.id?s.color:T.text3, border:`1px solid ${_bContact.pipeline_stage===s.id?s.color+'40':T.border}`, cursor:'pointer', transition:'all .15s' }}>
                          <span style={{display:'inline-block',width:6,height:6,borderRadius:3,background:STATUS_COLORS[s.id]||s.color,marginRight:4}}></span>{PIPELINE_LABELS[s.id]||s.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  {(_bContact.tags||[]).length > 0 && (
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:T.text3, marginBottom:6 }}>Tags</div>
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                        {(_bContact.tags||[]).map(t => <Badge key={String(t)} color="#7C3AED">{String(t)}</Badge>)}
                      </div>
                    </div>
                  )}

                  {/* Historique RDV */}
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:T.text3, marginBottom:6 }}>Historique RDV ({_bContactBookings.length})</div>
                    <div style={{ maxHeight:200, overflowY:'auto' }}>
                      {_bContactBookings.length === 0 && <div style={{ fontSize:12, color:T.text3, padding:8 }}>Aucun RDV</div>}
                      {_bContactBookings.map(bk => (
                        <div key={bk.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderRadius:8, background:bk.id===b.id?T.accentBg:T.bg, marginBottom:4, border:bk.id===b.id?`1px solid ${T.accent}30`:'1px solid transparent' }}>
                          <I n="calendar" s={12} style={{color:T.text3}}/>
                          <span style={{ fontSize:12, fontWeight:bk.id===b.id?700:500 }}>{fmtDate(bk.date)} {bk.time}</span>
                          <span style={{ fontSize:11, color:T.text3 }}>{bk.duration}min</span>
                          <Badge color={bk.status==='confirmed'?T.success:bk.status==='pending'?T.warning:T.danger} style={{fontSize:9,marginLeft:'auto'}}>{bk.status==='confirmed'?'Confirmé':bk.status==='pending'?'En attente':'Annulé'}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
                    {_bContact.email && <Btn onClick={() => window.open('mailto:'+_bContact.email)}><I n="mail" s={14}/> Email</Btn>}
                    {_bContact.phone && <Btn onClick={() => { if(typeof startVoipCall==='function') startVoipCall(_bContact.phone,_bContact); else window.open('tel:'+_bContact.phone); }}><I n="phone" s={14}/> Appeler</Btn>}
                    <Btn onClick={() => { setSelectedBooking(null); setBookingDetailTab('rdv'); setSelectedCrmContact(_bContact); setCollabFicheTab('notes'); }}><I n="external-link" s={14}/> Fiche complète</Btn>
                  </div>
                </div>
              )}

              {/* ══════ ONGLET NOTES ══════ */}
              {bookingDetailTab === 'notes' && _bContact && (
                <div>
                  <textarea value={_bContact.notes||''} onChange={e => { const v = e.target.value; handleCollabUpdateContact(_bContact.id, { notes: v }); }} placeholder="Ajoutez des notes sur ce contact..." style={{ width:'100%', minHeight:140, padding:12, borderRadius:10, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:13, resize:'vertical', fontFamily:'inherit', outline:'none' }}/>
                  <div style={{ fontSize:10, color:T.text3, marginTop:4 }}>Sauvegarde automatique</div>

                  {/* Dernier contact info */}
                  {_bContact.lastVisit && (
                    <div style={{ marginTop:16, padding:"10px 14px", borderRadius:8, background:T.bg, fontSize:12 }}>
                      <span style={{ color:T.text3 }}>Dernier contact :</span> <span style={{ fontWeight:600 }}>{fmtDate(_bContact.lastVisit)}</span>
                      {(() => { const d=Math.floor((Date.now()-new Date(_bContact.lastVisit).getTime())/86400000); return d>=14?<span style={{marginLeft:8,color:d>=30?'#EF4444':'#F59E0B',fontWeight:700,fontSize:11}}>{d}j sans contact</span>:null; })()}
                    </div>
                  )}

                  {/* Scoring */}
                  {_bContact.rating > 0 && (
                    <div style={{ marginTop:12, fontSize:13, color:"#F59E0B" }}>{"★".repeat(_bContact.rating)}{"☆".repeat(5-_bContact.rating)}</div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* ═══ GLOBAL CSV IMPORT V2 MODAL — Accessible depuis TOUT onglet ═══ */}
      {csvImportModal && (()=>{
        const cim=csvImportModal;
        const T2={card:T.card,bg:T.bg,text:T.text,text2:T.text2,border:T.border,accent:T.accent};
        const STANDARD_FIELDS=[
          {key:"civilite",label:"Civilité"},{key:"firstname",label:"Prénom"},{key:"lastname",label:"Nom"},
          {key:"email",label:"Email"},{key:"phone",label:"Téléphone"},{key:"company",label:"Entreprise"},
          {key:"address",label:"Adresse"},{key:"city",label:"Ville"},{key:"zip",label:"Code postal"},
          {key:"notes",label:"Notes"},{key:"source",label:"Source"},{key:"tags",label:"Tags"},
          {key:"siret",label:"SIRET"},{key:"tva",label:"TVA"}
        ];
        const FIELD_TYPES=[{v:"text",l:"Texte"},{v:"number",l:"Nombre"},{v:"date",l:"Date"},{v:"boolean",l:"Oui/Non"}];
        const norm=s=>(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
        const slugify=s=>norm(s).replace(/[^a-z0-9]/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"");

        function processFile(file){
          if(file.size>10*1024*1024){setCsvImportModal({...cim,error:"Fichier trop volumineux (max 10 Mo)"});return;}
          const reader=new FileReader();
          reader.onload=ev=>{
            try{
              const text=ev.target.result;
              const lines=text.split(/\r?\n/).filter(l=>l.trim());
              if(lines.length<2){setCsvImportModal({...cim,error:"Fichier vide ou invalide"});return;}
              if(lines.length-1>50000){setCsvImportModal({...cim,error:"Trop de lignes (max 50 000)"});return;}
              const firstLine=lines[0];
              const sep=firstLine.includes("\t")?"\t":firstLine.includes(";")?";":",";
              const parseRow=(line)=>{
                const vals=[];let cur="",inQ=false;
                for(let j=0;j<line.length;j++){
                  const ch=line[j];
                  if(inQ){if(ch==='"'&&line[j+1]==='"'){cur+='"';j++;}else if(ch==='"'){inQ=false;}else{cur+=ch;}}
                  else{if(ch==='"'){inQ=true;}else if(ch===sep){vals.push(cur.trim());cur="";}else{cur+=ch;}}
                }
                vals.push(cur.trim());return vals;
              };
              const headers=parseRow(lines[0]).map(h=>h.replace(/^"|"$/g,"").replace(/^\uFEFF/,"").trim());
              const rawRows=[];
              for(let i=1;i<lines.length;i++){
                const vals=parseRow(lines[i]);
                if(vals.every(v=>!v))continue;
                rawRows.push(vals);
              }
              const fieldDefs=[
                {key:"civilite",match:["civilite","titre","title","civ","gender"]},
                {key:"firstname",match:["prenom","firstname","first_name","first name","given"]},
                {key:"lastname",match:["nom","name","lastname","last_name","last name","family","surname"]},
                {key:"email",match:["email","e-mail","mail","courriel"]},
                {key:"phone",match:["telephone","tel","phone","mobile","portable","numero"]},
                {key:"company",match:["entreprise","societe","company","organization","organisation","raison sociale"]},
                {key:"address",match:["adresse","address","rue","street"]},
                {key:"city",match:["ville","city","commune","localite"]},
                {key:"zip",match:["postal","code postal","cp","zip","zipcode"]},
                {key:"notes",match:["notes","note","commentaire","comment","remarque","description"]},
                {key:"source",match:["source","origine","origin","provenance","canal"]},
                {key:"tags",match:["tags","tag","categorie","type","label"]},
                {key:"siret",match:["siret","siren"]},
                {key:"tva",match:["tva","vat","tax"]}
              ];
              const mapping={};
              const usedFields=new Set();
              headers.forEach((h,idx)=>{
                const hn=norm(h);
                for(const fd of fieldDefs){
                  if(usedFields.has(fd.key))continue;
                  if(fd.match.some(m=>hn===m||hn.includes(m))){
                    mapping[idx]={field:fd.key,auto:true};
                    usedFields.add(fd.key);
                    break;
                  }
                }
                if(!mapping[idx]){
                  const existingCf=(contactFieldDefs||[]).find(d=>norm(d.label)===hn||d.fieldKey===slugify(h));
                  if(existingCf){mapping[idx]={field:"custom",customLabel:existingCf.label,customKey:existingCf.fieldKey,customType:existingCf.fieldType||"text",auto:true};}
                }
                if(!mapping[idx]){
                  const hasData=rawRows.some(r=>r[idx]&&r[idx].trim());
                  if(hasData){mapping[idx]={field:"custom",customLabel:h,customKey:slugify(h),customType:"text",auto:false};}
                  else{mapping[idx]={field:"ignore",auto:true};}
                }
              });
              setCsvImportModal({step:"mapping",filename:file.name,headers,rawRows,sep,mapping});
            }catch(err){setCsvImportModal({...cim,error:"Erreur lecture: "+err.message});}
          };
          reader.readAsText(file,"UTF-8");
        }

        // STEP 1: UPLOAD
        if(cim.step==="upload") return (
          <Modal open={true} onClose={()=>setCsvImportModal(null)} title="Import CSV — Chargement" width={560}>
            <div style={{padding:16,textAlign:"center"}}>
              <div style={{border:`2px dashed ${T2.border}`,borderRadius:12,padding:40,marginBottom:16,cursor:"pointer",background:T2.bg}}
                onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=T2.accent;}}
                onDragLeave={e=>{e.currentTarget.style.borderColor=T2.border;}}
                onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor=T2.border;const f=e.dataTransfer.files[0];if(f)processFile(f);}}
                onClick={()=>{const inp=document.createElement("input");inp.type="file";inp.accept=".csv,.txt,.tsv";inp.onchange=ev=>{const f=ev.target.files[0];if(f)processFile(f);};inp.click();}}>
                <I n="upload-cloud" s={48} style={{color:T2.text2,marginBottom:12}}/>
                <p style={{fontSize:16,fontWeight:600,color:T2.text}}>Glissez un fichier CSV ici</p>
                <p style={{fontSize:13,color:T2.text2}}>ou cliquez pour parcourir · .csv .txt .tsv · max 10 Mo</p>
              </div>
              {cim.error && <p style={{color:"#EF4444",fontSize:13,marginTop:8}}>{cim.error}</p>}
            </div>
          </Modal>
        );

        // STEP 2: MAPPING
        if(cim.step==="mapping") return (
          <Modal open={true} onClose={()=>setCsvImportModal(null)} title={`Import CSV — Mapping (${cim.filename})`} width={720}>
            <div style={{maxHeight:"70vh",overflow:"auto",padding:16}}>
              <p style={{fontSize:13,color:T2.text2,marginBottom:16}}>{cim.rawRows.length} lignes · séparateur: {cim.sep==="\t"?"Tab":cim.sep===","?"Virgule":"Point-virgule"}</p>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {cim.headers.map((h,idx)=>{
                  const m=cim.mapping[idx]||{field:"ignore"};
                  return (
                    <div key={idx} style={{display:"grid",gridTemplateColumns:"200px 40px 1fr",gap:8,alignItems:"center",padding:"8px 12px",borderRadius:8,background:m.field==="ignore"?T2.bg:`${T2.accent}08`,border:`1px solid ${m.field==="ignore"?T2.border:T2.accent+"30"}`}}>
                      <div style={{fontSize:13,fontWeight:600,color:T2.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={h}>
                        {h}
                        <span style={{fontSize:11,color:T2.text2,marginLeft:6}}>ex: {(cim.rawRows[0]||[])[idx]||"—"}</span>
                      </div>
                      <span style={{fontSize:12,color:T2.text2,textAlign:"center"}}>→</span>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <select value={m.field==="custom"?"custom":m.field} style={{flex:1,padding:"6px 8px",borderRadius:6,border:`1px solid ${T2.border}`,background:T2.card,color:T2.text,fontSize:13}}
                          onChange={e=>{
                            const val=e.target.value;
                            const newMapping={...cim.mapping};
                            if(val==="ignore") newMapping[idx]={field:"ignore"};
                            else if(val==="custom") newMapping[idx]={field:"custom",customLabel:h,customKey:slugify(h),customType:"text"};
                            else newMapping[idx]={field:val};
                            setCsvImportModal({...cim,mapping:newMapping});
                          }}>
                          <option value="ignore">— Ignorer —</option>
                          <optgroup label="Champs standard">
                            {STANDARD_FIELDS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
                          </optgroup>
                          {(contactFieldDefs||[]).length>0 && <optgroup label="Champs perso existants">
                            {(contactFieldDefs||[]).map(d=><option key={d.fieldKey} value="custom">{d.label}</option>)}
                          </optgroup>}
                          <option value="custom">+ Nouveau champ perso</option>
                        </select>
                        {m.field==="custom" && (
                          <>
                            <input value={m.customLabel||""} placeholder="Nom du champ" style={{width:120,padding:"5px 8px",borderRadius:6,border:`1px solid ${T2.border}`,fontSize:12,background:T2.card,color:T2.text}}
                              onChange={e=>{const newMapping={...cim.mapping};newMapping[idx]={...m,customLabel:e.target.value,customKey:slugify(e.target.value)};setCsvImportModal({...cim,mapping:newMapping});}}/>
                            <select value={m.customType||"text"} style={{width:80,padding:"5px 8px",borderRadius:6,border:`1px solid ${T2.border}`,fontSize:12,background:T2.card,color:T2.text}}
                              onChange={e=>{const newMapping={...cim.mapping};newMapping[idx]={...m,customType:e.target.value};setCsvImportModal({...cim,mapping:newMapping});}}>
                              {FIELD_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
                            </select>
                          </>
                        )}
                        {m.auto && <span style={{fontSize:10,color:"#22C55E",fontWeight:600}}>AUTO</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:20}}>
                <Btn onClick={()=>setCsvImportModal(null)}>Annuler</Btn>
                <Btn primary onClick={()=>{
                  const mapped=Object.values(cim.mapping).filter(m=>m.field!=="ignore");
                  if(!mapped.length){showNotif("Mappez au moins une colonne","danger");return;}
                  const emailIdx=Object.entries(cim.mapping).find(([,m])=>m.field==="email");
                  const phoneIdx=Object.entries(cim.mapping).find(([,m])=>m.field==="phone");
                  const csvEmails=emailIdx?cim.rawRows.map(r=>(r[emailIdx[0]]||"").toLowerCase().trim()).filter(Boolean):[];
                  const csvPhones=phoneIdx?cim.rawRows.map(r=>(r[phoneIdx[0]]||"").replace(/\D/g,"")).filter(Boolean):[];
                  const rowErrors=[];
                  const nameIdx=Object.entries(cim.mapping).find(([,m])=>m.field==="firstname"||m.field==="lastname");
                  cim.rawRows.forEach((r,i)=>{
                    const em=emailIdx?(r[emailIdx[0]]||"").trim():"";
                    const ph=phoneIdx?(r[phoneIdx[0]]||"").trim():"";
                    const nm=nameIdx?(r[nameIdx[0]]||"").trim():"";
                    if(!nm&&!em&&!ph) rowErrors.push({row:i,reason:"Ligne vide (ni nom, ni email, ni téléphone)"});
                    else if(em&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) rowErrors.push({row:i,reason:`Email invalide: ${em}`});
                    else if(ph&&!/^\+?\d{6,20}$/.test(ph.replace(/[\s\-\.\(\)]/g,""))) rowErrors.push({row:i,reason:`Téléphone invalide: ${ph}`});
                  });
                  api("/api/data/contacts/check-duplicates",{method:"POST",body:{emails:csvEmails,phones:csvPhones}}).then(dupResult=>{
                    const dbDupEmails=new Set((dupResult?.dupEmails||[]).map(e=>e.toLowerCase()));
                    const dbDupPhones=new Set((dupResult?.dupPhones||[]).map(p=>(p||"").replace(/\D/g,"")));
                    const duplicates=[];
                    cim.rawRows.forEach((r,i)=>{
                      const em=emailIdx?(r[emailIdx[0]]||"").toLowerCase().trim():"";
                      const ph=phoneIdx?(r[phoneIdx[0]]||"").replace(/\D/g,""):"";
                      if((em&&dbDupEmails.has(em))||(ph&&dbDupPhones.has(ph))) duplicates.push(i);
                    });
                    setCsvImportModal({...cim,step:"preview",duplicates,rowErrors,dupMode:"skip"});
                  }).catch(()=>{setCsvImportModal({...cim,step:"preview",duplicates:[],rowErrors,dupMode:"skip"});});
                }}><I n="arrow-right" s={14}/> Aperçu</Btn>
              </div>
            </div>
          </Modal>
        );

        // STEP 3: PREVIEW
        if(cim.step==="preview"){
          const mapped=Object.entries(cim.mapping).filter(([,m])=>m.field!=="ignore");
          const validRows=cim.rawRows.length-(cim.rowErrors||[]).length;
          const dupsCount=(cim.duplicates||[]).length;
          const errCount=(cim.rowErrors||[]).length;
          const toImport=cim.dupMode==="skip"?validRows-dupsCount:validRows;
          const customFields=Object.values(cim.mapping).filter(m=>m.field==="custom"&&m.customLabel);
          return (
            <Modal open={true} onClose={()=>setCsvImportModal(null)} title={`Import CSV — Aperçu (${cim.filename})`} width={900}>
              <div style={{maxHeight:"75vh",overflow:"auto",padding:16}}>
                <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:100,padding:"10px 14px",borderRadius:8,background:"#22C55E12",border:"1px solid #22C55E30",textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:"#22C55E"}}>{toImport}</div><div style={{fontSize:11,color:T2.text2}}>À importer</div></div>
                  <div style={{flex:1,minWidth:100,padding:"10px 14px",borderRadius:8,background:dupsCount?"#F59E0B12":T2.bg,border:`1px solid ${dupsCount?"#F59E0B30":T2.border}`,textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:dupsCount?"#F59E0B":T2.text2}}>{dupsCount}</div><div style={{fontSize:11,color:T2.text2}}>Doublons</div></div>
                  <div style={{flex:1,minWidth:100,padding:"10px 14px",borderRadius:8,background:errCount?"#EF444412":T2.bg,border:`1px solid ${errCount?"#EF444430":T2.border}`,textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:errCount?"#EF4444":T2.text2}}>{errCount}</div><div style={{fontSize:11,color:T2.text2}}>Erreurs</div></div>
                  {customFields.length>0 && <div style={{flex:1,minWidth:100,padding:"10px 14px",borderRadius:8,background:"#8B5CF612",border:"1px solid #8B5CF630",textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:"#8B5CF6"}}>{customFields.length}</div><div style={{fontSize:11,color:T2.text2}}>Champs perso</div></div>}
                </div>
                <div style={{overflow:"auto",marginBottom:16,border:`1px solid ${T2.border}`,borderRadius:8}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{background:T2.bg}}>
                      <th style={{padding:"8px 6px",borderBottom:`1px solid ${T2.border}`,fontSize:11,color:T2.text2,textAlign:"left"}}>#</th>
                      {mapped.map(([idx,m])=><th key={idx} style={{padding:"8px 6px",borderBottom:`1px solid ${T2.border}`,fontSize:11,color:m.field==="custom"?"#8B5CF6":T2.accent,textAlign:"left",whiteSpace:"nowrap"}}>{m.field==="custom"?m.customLabel:STANDARD_FIELDS.find(f=>f.key===m.field)?.label||m.field}</th>)}
                    </tr></thead>
                    <tbody>{cim.rawRows.slice(0,20).map((r,i)=>{
                      const isDup=(cim.duplicates||[]).includes(i);const hasErr=(cim.rowErrors||[]).find(e=>e.row===i);
                      return (<tr key={i} style={{background:hasErr?"#EF444408":isDup?"#F59E0B08":"transparent"}}><td style={{padding:"6px",borderBottom:`1px solid ${T2.border}22`,color:T2.text2,fontSize:11}}>{isDup&&"⚠ "}{hasErr&&"✗ "}{i+2}</td>{mapped.map(([idx])=><td key={idx} style={{padding:"6px",borderBottom:`1px solid ${T2.border}22`,color:T2.text,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r[idx]||""}</td>)}</tr>);
                    })}</tbody>
                  </table>
                  {cim.rawRows.length>20 && <p style={{padding:8,fontSize:11,color:T2.text2,textAlign:"center"}}>... et {cim.rawRows.length-20} lignes de plus</p>}
                </div>
                {dupsCount>0 && <div style={{marginBottom:16,padding:12,borderRadius:8,background:"#F59E0B08",border:"1px solid #F59E0B20"}}>
                  <p style={{fontSize:13,fontWeight:600,color:"#F59E0B",marginBottom:8}}>{dupsCount} doublon{dupsCount>1?"s":""}</p>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {[{v:"skip",l:"Ignorer les doublons",d:"Les contacts existants ne seront pas modifiés"},{v:"merge",l:"Fusionner",d:"Mettre à jour uniquement les champs vides"},{v:"replace",l:"Remplacer",d:"Écraser les contacts existants"}].map(opt=>(
                      <label key={opt.v} style={{display:"flex",gap:8,alignItems:"flex-start",cursor:"pointer",padding:"6px 8px",borderRadius:6,background:cim.dupMode===opt.v?`${T2.accent}12`:"transparent"}}>
                        <input type="radio" name="csvDupMode" checked={cim.dupMode===opt.v} onChange={()=>setCsvImportModal({...cim,dupMode:opt.v})} style={{marginTop:2}}/>
                        <div><span style={{fontSize:13,fontWeight:600,color:T2.text}}>{opt.l}</span><br/><span style={{fontSize:11,color:T2.text2}}>{opt.d}</span></div>
                      </label>
                    ))}
                  </div>
                </div>}
                {customFields.length>0 && <div style={{marginBottom:16,padding:12,borderRadius:8,background:"#8B5CF608",border:"1px solid #8B5CF620"}}>
                  <p style={{fontSize:13,fontWeight:600,color:"#8B5CF6",marginBottom:6}}>{customFields.length} champ{customFields.length>1?"s":""} perso</p>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{customFields.map((cf,i)=><span key={i} style={{fontSize:11,padding:"3px 8px",borderRadius:4,background:"#8B5CF618",color:"#8B5CF6"}}>{cf.customLabel} ({FIELD_TYPES.find(t=>t.v===cf.customType)?.l||"Texte"})</span>)}</div>
                </div>}
                {/* Colonne pipeline de destination */}
                <div style={{marginBottom:16,padding:12,borderRadius:8,background:'#2563EB08',border:'1px solid #2563EB20'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <I n="columns" s={16} style={{color:'#2563EB'}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:T2.text,marginBottom:2}}>Colonne pipeline de destination</div>
                      <div style={{fontSize:11,color:T2.text2}}>Les contacts importés apparaîtront directement dans cette colonne du pipeline live.</div>
                    </div>
                    <select value={cim.targetStage||'nouveau'} onChange={e=>setCsvImportModal({...cim,targetStage:e.target.value})} style={{padding:'8px 12px',borderRadius:8,border:'1px solid #2563EB30',background:T2.card,fontSize:13,fontWeight:600,color:'#2563EB',cursor:'pointer',minWidth:160}}>
                      {[{id:'nouveau',label:'Nouveau',color:'#2563EB'},{id:'contacte',label:'En discussion',color:'#F59E0B'},{id:'qualifie',label:'Intéressé',color:'#7C3AED'},{id:'rdv_programme',label:'RDV Programmé',color:'#0EA5E9'},{id:'nrp',label:'NRP',color:'#EF4444'},{id:'client_valide',label:'Client Validé',color:'#22C55E'},{id:'perdu',label:'Perdu',color:'#64748B'},...((typeof pipelineStages!=='undefined'?pipelineStages:null)||[]).map(s=>({id:s.id,label:s.label||s.id}))].map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:16}}>
                  <Btn onClick={()=>setCsvImportModal({...cim,step:"mapping"})}><I n="arrow-left" s={14}/> Retour</Btn>
                  <Btn primary onClick={()=>{
                    const errorRowSet=new Set((cim.rowErrors||[]).map(e=>e.row));
                    const skipDupSet=new Set(cim.dupMode==="skip"?(cim.duplicates||[]):[]);
                    const contactsToSend=[];const customDefs=[];
                    const customFieldMappings=Object.entries(cim.mapping).filter(([,m])=>m.field==="custom"&&m.customLabel);
                    customFieldMappings.forEach(([,m])=>{if(!customDefs.find(d=>d.fieldKey===m.customKey)){customDefs.push({label:m.customLabel,fieldKey:m.customKey,fieldType:m.customType||"text"});}});
                    for(let i=0;i<cim.rawRows.length;i++){
                      if(errorRowSet.has(i)||skipDupSet.has(i))continue;
                      const r=cim.rawRows[i];const ct={pipeline_stage:cim.targetStage||"nouveau",source:"csv"};const cf=[];
                      for(const [idx,m] of Object.entries(cim.mapping)){
                        if(m.field==="ignore")continue;const val=(r[parseInt(idx)]||"").trim();if(!val)continue;
                        if(m.field==="custom"){cf.push({key:m.customKey,value:val});}
                        else if(m.field==="tags"){ct.tags_json=JSON.stringify(val.split(/[,;|]/).map(t=>t.trim()).filter(Boolean));}
                        else{ct[m.field]=val;}
                      }
                      ct.name=[ct.firstname,ct.lastname].filter(Boolean).join(" ")||ct.email||"Sans nom";
                      ct.custom_fields_json=JSON.stringify(cf);
                      contactsToSend.push(ct);
                    }
                    console.log('[CSV IMPORT] Sending',contactsToSend.length,'contacts, dupMode:',cim.dupMode,'customDefs:',customDefs.length);
                    setCsvImportModal({...cim,step:"importing"});
                    api("/api/data/contacts/import-batch",{method:"POST",body:{contacts:contactsToSend,dupMode:cim.dupMode==="skip"?"skip":cim.dupMode,customFieldDefs:customDefs}})
                      .then(result=>{
                        console.log('[CSV IMPORT] Result:',result);
                        if(result&&result.error){setCsvImportModal({...cim,step:"result",result:{error:result.error}});return;}
                        setCsvImportModal({...cim,step:"result",result});
                        api("/api/data/contacts?companyId="+company.id).then(r=>{if(Array.isArray(r))setContacts(r.filter(Boolean));}); // hotfix 2026-04-23 — null-safe API boundary
                        api("/api/contact-fields").then(r=>{if(Array.isArray(r))setContactFieldDefs(r);});
                      })
                      .catch(err=>{console.error('[CSV IMPORT] Error:',err);setCsvImportModal({...cim,step:"result",result:{error:err.message||"Erreur serveur — vérifiez la console (F12)"}});});
                  }}><I n="check" s={14}/> Importer {toImport} contact{toImport>1?"s":""}</Btn>
                </div>
              </div>
            </Modal>
          );
        }

        // STEP IMPORTING
        if(cim.step==="importing") return (<Modal open={true} onClose={()=>{}} title="Import en cours..." width={400}><div style={{padding:32,textAlign:"center"}}><div style={{fontSize:14,color:T2.text2}}>Import en cours, veuillez patienter...</div></div></Modal>);

        // STEP 4: RESULT
        if(cim.step==="result"){
          const r=cim.result||{};
          if(r.error) return (<Modal open={true} onClose={()=>setCsvImportModal(null)} title="Import CSV — Erreur" width={480}><div style={{padding:24,textAlign:"center"}}><div style={{fontSize:48,marginBottom:12}}>❌</div><p style={{fontSize:15,fontWeight:600,color:"#EF4444",marginBottom:8}}>Erreur</p><p style={{fontSize:13,color:T2.text2}}>{r.error}</p><Btn onClick={()=>setCsvImportModal(null)} style={{marginTop:16}}>Fermer</Btn></div></Modal>);
          return (
            <Modal open={true} onClose={()=>setCsvImportModal(null)} title="Import CSV — Résultat" width={560}>
              <div style={{padding:24}}>
                <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
                  {r.imported>0&&<div style={{flex:1,minWidth:100,padding:"12px",borderRadius:8,background:"#22C55E12",border:"1px solid #22C55E30",textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:"#22C55E"}}>{r.imported}</div><div style={{fontSize:12,color:T2.text2}}>Importés</div></div>}
                  {r.merged>0&&<div style={{flex:1,minWidth:100,padding:"12px",borderRadius:8,background:"#3B82F612",border:"1px solid #3B82F630",textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:"#3B82F6"}}>{r.merged}</div><div style={{fontSize:12,color:T2.text2}}>Fusionnés</div></div>}
                  {r.replaced>0&&<div style={{flex:1,minWidth:100,padding:"12px",borderRadius:8,background:"#F59E0B12",border:"1px solid #F59E0B30",textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:"#F59E0B"}}>{r.replaced}</div><div style={{fontSize:12,color:T2.text2}}>Remplacés</div></div>}
                  {(r.skipped||0)>0&&<div style={{flex:1,minWidth:100,padding:"12px",borderRadius:8,background:T2.bg,border:`1px solid ${T2.border}`,textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:T2.text2}}>{r.skipped}</div><div style={{fontSize:12,color:T2.text2}}>Ignorés</div></div>}
                  {(r.errors||0)>0&&<div style={{flex:1,minWidth:100,padding:"12px",borderRadius:8,background:"#EF444412",border:"1px solid #EF444430",textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:"#EF4444"}}>{r.errors}</div><div style={{fontSize:12,color:T2.text2}}>Erreurs</div></div>}
                  {(r.customFieldsCreated||0)>0&&<div style={{flex:1,minWidth:100,padding:"12px",borderRadius:8,background:"#8B5CF612",border:"1px solid #8B5CF630",textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:"#8B5CF6"}}>{r.customFieldsCreated}</div><div style={{fontSize:12,color:T2.text2}}>Champs perso</div></div>}
                </div>
                {r.errorDetails&&r.errorDetails.length>0&&<div style={{marginBottom:16,padding:12,borderRadius:8,background:"#EF444408",border:"1px solid #EF444420"}}>
                  <p style={{fontSize:13,fontWeight:600,color:"#EF4444",marginBottom:6}}>Erreurs</p>
                  {r.errorDetails.slice(0,20).map((e,i)=><p key={i} style={{fontSize:11,color:T2.text2}}>Ligne {e.row}: {e.error}</p>)}
                </div>}
                <div style={{display:"flex",justifyContent:"flex-end"}}><Btn primary onClick={()=>setCsvImportModal(null)}>Fermer</Btn></div>
              </div>
            </Modal>
          );
        }
        return null;
      })()}

      {/* ═══════════════════════════════════════════════════════════════════
          RDV COUNTDOWN BAR — Prochains RDV avec compte à rebours
          ═══════════════════════════════════════════════════════════════════ */}
      {/* ═══ GLOBAL SCHEDULE/RDV MODAL — Accessible depuis TOUT onglet ═══ */}
      {(typeof phoneShowScheduleModal!=='undefined'?phoneShowScheduleModal:null) && (()=>{
        const closeScheduleModal=()=>{if((typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode&&(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).contactId){showNotif('Aucun RDV créé — le contact reste dans son statut actuel','info');}setPhoneShowScheduleModal(false);(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})({contactId:'',number:'',date:'',time:'',notes:''});setSchedSearchQ('');setSchedContactMode('new');};
        const hasPrefilledContact = !!(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).contactId;
        return (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={closeScheduleModal}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:20,padding:24,maxWidth:440,width:'90%',boxShadow:'0 25px 50px rgba(0,0,0,0.25)',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <div style={{width:40,height:40,borderRadius:12,background:(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode?'linear-gradient(135deg,#7C3AED,#6D28D9)':'linear-gradient(135deg,#2563EB,#1D4ED8)',display:'flex',alignItems:'center',justifyContent:'center'}}><I n={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode?'calendar-check':'clock'} s={18} style={{color:'#fff'}}/></div>
              <div>
                <h3 style={{fontSize:16,fontWeight:700,margin:0}}>{(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode?'Programmer un RDV':'Programmer un appel'}</h3>
                <div style={{fontSize:12,color:T.text3}}>{(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).contactName ? (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).contactName+' — Choisissez date et heure' : 'Choisissez un contact puis date et heure'}</div>
              </div>
              <span onClick={closeScheduleModal} style={{marginLeft:'auto',cursor:'pointer',color:T.text3}}><I n="x" s={18}/></span>
            </div>

            {/* ── Contact Mode Switch ── */}
            {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode && !hasPrefilledContact && <div style={{display:'flex',borderRadius:10,border:'1px solid #e5e7eb',overflow:'hidden',marginBottom:12}}>
              <div onClick={()=>(typeof setSchedContactMode==='function'?setSchedContactMode:function(){})('existing')} style={{flex:1,padding:'8px 0',textAlign:'center',fontSize:12,fontWeight:600,cursor:'pointer',background:schedContactMode==='existing'?'#2563EB':'#f9fafb',color:schedContactMode==='existing'?'#fff':'#6b7280',transition:'all .15s'}}>Contact existant</div>
              <div onClick={()=>(typeof setSchedContactMode==='function'?setSchedContactMode:function(){})('new')} style={{flex:1,padding:'8px 0',textAlign:'center',fontSize:12,fontWeight:600,cursor:'pointer',background:schedContactMode==='new'?'#2563EB':'#f9fafb',color:schedContactMode==='new'?'#fff':'#6b7280',transition:'all .15s'}}>Nouveau contact</div>
            </div>}

            {/* ── Contact existant : recherche ── */}
            {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode && !hasPrefilledContact && (typeof schedContactMode!=='undefined'?schedContactMode:null)==='existing' && <div style={{marginBottom:12}}>
              <label style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4,display:'block'}}>Rechercher un contact</label>
              <input value={schedSearchQ} onChange={e=>(typeof setSchedSearchQ==='function'?setSchedSearchQ:function(){})(e.target.value)} placeholder="Nom, email ou téléphone..." style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',outline:'none'}}/>
              {schedSearchResults.length>0 && <div style={{border:'1px solid #e5e7eb',borderRadius:10,marginTop:4,maxHeight:150,overflowY:'auto',background:'#fff'}}>
                {schedSearchResults.map(ct=>(
                  <div key={ct.id} onClick={()=>{setPhoneScheduleForm(p=>({...p,contactId:ct.id,contactName:ct.name||ct.firstName||'',number:ct.phone||p.number}));setSchedSearchQ('');}} style={{padding:'8px 12px',cursor:'pointer',fontSize:12,display:'flex',justifyContent:'space-between',borderBottom:'1px solid #f3f4f6'}} onMouseEnter={e=>e.currentTarget.style.background='#f3f4f6'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                    <span style={{fontWeight:600}}>{ct.name}</span>
                    <span style={{color:'#9ca3af'}}>{ct.phone||ct.email||''}</span>
                  </div>
                ))}
              </div>}
              {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).contactId && <div style={{marginTop:6,padding:'6px 10px',borderRadius:8,background:'#2563EB10',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:12,fontWeight:600,color:'#2563EB'}}>✓ {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).contactName}</span>
                <span onClick={()=>setPhoneScheduleForm(p=>({...p,contactId:'',contactName:'',number:''}))} style={{fontSize:10,color:'#EF4444',cursor:'pointer',fontWeight:600}}>Changer</span>
              </div>}
            </div>}

            {/* ── Nouveau contact : formulaire ── */}
            {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode && !hasPrefilledContact && (typeof schedContactMode!=='undefined'?schedContactMode:null)==='new' && <div style={{marginBottom:12,display:'flex',flexDirection:'column',gap:8,padding:12,borderRadius:10,background:'#f9fafb',border:'1px solid #e5e7eb'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:0.5}}>Nouveau contact</div>
              <div style={{display:'flex',gap:8}}>
                <div style={{flex:1}}>
                  <input value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._newFirstName||''} onChange={e=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(p=>({...p,_newFirstName:e.target.value}))} placeholder="Prénom *" style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',fontSize:12,color:'#111',outline:'none'}}/>
                </div>
                <div style={{flex:1}}>
                  <input value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._newLastName||''} onChange={e=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(p=>({...p,_newLastName:e.target.value}))} placeholder="Nom *" style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',fontSize:12,color:'#111',outline:'none'}}/>
                </div>
              </div>
              <input value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._newEmail||''} onChange={e=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(p=>({...p,_newEmail:e.target.value}))} placeholder="Email" style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',fontSize:12,color:'#111',outline:'none'}}/>
              <input value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).number||''} onChange={e=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(p=>({...p,number:e.target.value}))} placeholder="Téléphone *" style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',fontSize:12,color:'#111',outline:'none'}}/>
              <input value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._newAddress||''} onChange={e=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(p=>({...p,_newAddress:e.target.value}))} placeholder="Adresse (optionnel)" style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',fontSize:12,color:'#111',outline:'none'}}/>
            </div>}

            {/* ── Contact pré-rempli — éditable ── */}
            {hasPrefilledContact && (()=>{
              const _pf = (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{});
              const _ct = (contacts||[]).find(_c=>_c.id===_pf.contactId) || {};
              const _first = _pf._editFirstName !== undefined ? _pf._editFirstName : (_ct.firstName || (_ct.name||'').split(' ')[0] || '');
              const _last  = _pf._editLastName  !== undefined ? _pf._editLastName  : (_ct.lastName  || (_ct.name||'').split(' ').slice(1).join(' ') || '');
              const _email = _pf._editEmail     !== undefined ? _pf._editEmail     : (_ct.email || '');
              const _phone = _pf._editPhone     !== undefined ? _pf._editPhone     : (_ct.phone || _pf.number || '');
              const _upd = (k,v)=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(_p=>({..._p,[k]:v}));
              const _cellStyle = {flex:1,minWidth:0,padding:'8px 10px',borderRadius:8,border:'1px solid #2563EB25',background:'#fff',fontSize:12,color:'#111',outline:'none',fontFamily:'inherit'};
              return <div style={{marginBottom:12,padding:10,borderRadius:10,background:'#2563EB08',border:'1px solid #2563EB20',display:'flex',flexDirection:'column',gap:6}}>
                <div style={{fontSize:11,fontWeight:700,color:'#2563EB',textTransform:'uppercase',letterSpacing:0.4}}>📋 Contact</div>
                <div style={{display:'flex',gap:6}}>
                  <input value={_first} onChange={e=>_upd('_editFirstName', e.target.value)} placeholder="Prénom" style={_cellStyle}/>
                  <input value={_last}  onChange={e=>_upd('_editLastName',  e.target.value)} placeholder="Nom"    style={_cellStyle}/>
                </div>
                <input value={_email} onChange={e=>_upd('_editEmail', e.target.value)} placeholder="Email" style={_cellStyle}/>
                <input value={_phone} onChange={e=>{_upd('_editPhone', e.target.value); _upd('number', e.target.value);}} placeholder="Téléphone" style={_cellStyle}/>
              </div>;
            })()}

            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {/* Champ téléphone affiché seulement si contact existant sélectionné (sans pré-remplissage) */}
              {(hasPrefilledContact || (typeof schedContactMode!=='undefined'?schedContactMode:null)==='existing') ? null : null}
              {!hasPrefilledContact && (typeof schedContactMode!=='undefined'?schedContactMode:null)==='existing' && !(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).contactId && <div>
                <label style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4,display:'block'}}>Numéro de téléphone</label>
                <input value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).number} onChange={e=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(p=>({...p,number:e.target.value}))} placeholder="+33 6 12 34 56 78" style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',outline:'none',fontFamily:'inherit'}}/>
              </div>}
              {/* V1.8.2 — Sélecteur collaborateur cible (masqué si 1 seul collab) */}
              {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode && _bookableCollabs.length>1 && <div>
                <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Collaborateur</label>
                <select value={_scheduleTargetCollabId} onChange={e=>setPhoneScheduleForm(p=>({...p,collaboratorId:e.target.value,calendarId:''}))} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1px solid ${_scheduleTargetCollabId!==collab.id?'#7C3AED60':'#e5e7eb'}`,background:_scheduleTargetCollabId!==collab.id?'#7C3AED08':'#f9fafb',fontSize:13,color:'#111',fontFamily:'inherit'}}>
                  {_bookableCollabs.map(c=><option key={c.id} value={c.id}>{c.id===collab.id?'Moi ('+(c.name||c.firstName||'')+')':(c.name||c.firstName||c.id)}</option>)}
                </select>
                {_scheduleTargetCollabId!==collab.id && <div style={{marginTop:4,fontSize:10,color:T.text3,fontStyle:'italic',display:'flex',alignItems:'center',gap:4}}>
                  <span>👥</span> Créé par <b style={{color:T.text2,fontWeight:600,fontStyle:'normal'}}>{collab.name || collab.firstName || 'vous'}</b>
                  <span>→</span> pour <b style={{color:T.text2,fontWeight:600,fontStyle:'normal'}}>{_scheduleTargetCollab.name||_scheduleTargetCollab.firstName||'—'}</b>
                </div>}
                {_scheduleTargetCollabId!==collab.id && <div style={{marginTop:6,padding:'6px 10px',borderRadius:8,background:'#7C3AED10',border:'1px solid #7C3AED25',fontSize:11,color:'#6D28D9',display:'flex',alignItems:'center',gap:6}}><span>👥</span> Vous prenez ce RDV pour <b>{_scheduleTargetCollab.name||_scheduleTargetCollab.firstName||''}</b> — il apparaîtra dans son agenda</div>}
              </div>}
              {/* V1.8.2 — Sélecteur Agenda filtré sur le collab cible */}
              {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode && _scheduleAvailableCalendars.length>1 && <div>
                <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Agenda</label>
                <select value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).calendarId||''} onChange={e=>setPhoneScheduleForm(p=>({...p,calendarId:e.target.value}))} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',fontFamily:'inherit'}}>
                  <option value="">— Choisir —</option>
                  {_scheduleAvailableCalendars.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>}
              {/* V1.8.3 — Warning précis selon contexte (mes propres agendas absents vs accès refusé) */}
              {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode && _scheduleAvailableCalendars.length===0 && <div style={{padding:'10px 12px',borderRadius:10,background:'#FEF3C7',border:'1px solid #F59E0B40',fontSize:12,color:'#B45309'}}>⚠️ {_scheduleTargetCollabId===collab.id ? `Aucun agenda configuré pour vous — contactez votre admin` : `Vous n'avez pas accès à l'agenda de ${_scheduleTargetCollab.name||'ce collaborateur'} — demandez à votre admin si besoin`}</div>}
              <div>
                <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Date du RDV</label>
                <MiniMonthCalendar
                  value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).date||''}
                  onChange={(_iso)=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(_p=>({..._p,date:_iso,time:''}))}
                />
              </div>
              {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode && (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).date && (()=>{
                const selDate = (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).date;
                const selCalId = (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).calendarId || '';
                // V1.8.2 — collab cible explicite (vient du sélecteur "Pour quel collaborateur ?")
                const selCollabId = _scheduleTargetCollabId;
                const dayBookings = (bookings||[]).filter(b=>(b.calendarId===selCalId || b.collaboratorId===selCollabId) && (b.date||'').startsWith(selDate) && b.status!=='cancelled');
                const dayGCal = (googleEventsProp||[]).filter(ge=>(ge.collaboratorId===selCollabId) && (ge.start||ge.startDate||'').startsWith(selDate));
                const buf = (typeof availBuffer!=='undefined'?availBuffer:null)||0;
                const busySlots = new Set();
                dayBookings.forEach(b=>{ if(b.time) { const h=parseInt(b.time.split(':')[0]); const m=parseInt(b.time.split(':')[1]||0); const startMin=h*60+m-buf; const endMin=h*60+m+(b.duration||30)+buf; for(let i=Math.max(0,startMin);i<endMin;i+=30) busySlots.add(String(Math.floor(i/60)).padStart(2,'0')+':'+String(i%60).padStart(2,'0')); }});
                dayGCal.forEach(ge=>{ try{ const st=new Date(ge.start||ge.startDate); const en=new Date(ge.end||ge.endDate||st.getTime()+3600000); const stBuf=st.getTime()-buf*60000; const enBuf=en.getTime()+buf*60000; for(let t=stBuf;t<enBuf;t+=1800000){const d=new Date(t);busySlots.add(String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'));} }catch{} });
                const slots = [];
                // V1.7.7 — Génération basée sur le planning hebdo du collab (pas hardcodé 8-19h)
                const _dayDate = new Date(selDate+'T00:00:00');
                const _dowIdx = (_dayDate.getDay()+6)%7; // 0=lundi ... 6=dimanche
                const _DAY_KEYS_EN = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
                const _DAY_KEYS_FR = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
                const _targetAvails = (typeof avails!=='undefined'?avails:{})[selCollabId] || (typeof avails!=='undefined'?avails:{})[collab.id] || (typeof defAvail==='function'?defAvail():{});
                const _dayCfg = _targetAvails[_dowIdx] || _targetAvails[String(_dowIdx)] || _targetAvails[_DAY_KEYS_EN[_dowIdx]] || _targetAvails[_DAY_KEYS_FR[_dowIdx]] || {active:false,slots:[]};
                const _duration = (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).duration || 30;
                const _todayStr = new Date().toISOString().split('T')[0];
                const _curH = new Date().getHours();
                const _curM = new Date().getMinutes();
                if (_dayCfg.active && Array.isArray(_dayCfg.slots) && _dayCfg.slots.length > 0) {
                  for (const _range of _dayCfg.slots) {
                    const _sParts = String(_range.start||'09:00').split(':').map(Number);
                    const _eParts = String(_range.end||'18:00').split(':').map(Number);
                    const _startMin = (_sParts[0]||0)*60 + (_sParts[1]||0);
                    const _endMin = (_eParts[0]||0)*60 + (_eParts[1]||0);
                    for (let _t = _startMin; _t + _duration <= _endMin; _t += 30) {
                      const _h = Math.floor(_t/60), _m = _t%60;
                      const _slot = String(_h).padStart(2,'0')+':'+String(_m).padStart(2,'0');
                      const _isBusy = busySlots.has(_slot);
                      const _isPast = selDate === _todayStr && (_h < _curH || (_h === _curH && _m <= _curM));
                      slots.push({time:_slot, busy:_isBusy, past:_isPast});
                    }
                  }
                }
                // V1.8.0 — Smart Scheduling: scoring simple priorisant densification puis proximité
                const _bookingStartMins = dayBookings.map(_b => { const _p=(_b.time||'00:00').split(':').map(Number); return (_p[0]||0)*60+(_p[1]||0); });
                const _scoreSlot = (_s) => {
                  if (_s.busy || _s.past) return -1;
                  const _p = _s.time.split(':').map(Number);
                  const _mins = (_p[0]||0)*60 + (_p[1]||0);
                  const _adjacent = _bookingStartMins.some(_bm => _bm !== _mins && Math.abs(_bm - _mins) <= 60);
                  return (_adjacent ? 1000 : 0) + (1440 - _mins);
                };
                const _scoredSlots = slots.map(_s => { const _sc = _scoreSlot(_s); const _p = _s.time.split(':').map(Number); const _mins = (_p[0]||0)*60+(_p[1]||0); const _adj = _bookingStartMins.some(_bm => _bm !== _mins && Math.abs(_bm - _mins) <= 60); return { ..._s, _score: _sc, _adjacent: _adj }; }).filter(_s => _s._score >= 0);
                const _recommendedSlots = [..._scoredSlots].sort((_a, _b) => _b._score - _a._score || _a.time.localeCompare(_b.time)).slice(0, 3);
                const _showReco = slots.length >= 5 && _recommendedSlots.length >= 1;
                const _labelFor = (_s, _rank) => { if (_s._adjacent) return "Proche d'un RDV"; if (_rank === 0) return 'Recommandé'; return 'Disponible tôt'; };
                return <div>
                  <div style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:6}}>Creneaux disponibles</div>
                  {(()=>{
                    if (slots.length === 0) {
                      const _msg = !_dayCfg || !_dayCfg.active
                        ? 'Jour configuré comme inactif — activez-le dans Paramètres > Disponibilités'
                        : (!Array.isArray(_dayCfg.slots) || _dayCfg.slots.length === 0)
                          ? 'Aucune plage horaire définie ce jour — configurez dans Paramètres > Disponibilités'
                          : 'Durée RDV trop longue pour les plages configurées ce jour';
                      return <div style={{padding:'10px 12px',borderRadius:8,background:'#F9FAFB',border:'1px dashed #E5E7EB',fontSize:12,color:'#6B7280',textAlign:'center'}}>{_msg}</div>;
                    }
                    if (slots.every(_s => _s.busy || _s.past)) {
                      return <div style={{padding:'10px 12px',borderRadius:8,background:'#FEF3C7',border:'1px dashed #F59E0B',fontSize:12,color:'#B45309',textAlign:'center'}}>Tous les créneaux sont occupés ou passés — choisissez une autre date</div>;
                    }
                    return null;
                  })()}
                  {_showReco && <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#3B82F6',marginBottom:6,display:'flex',alignItems:'center',gap:4}}><span>⚡</span> Créneaux recommandés</div>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      {_recommendedSlots.map((_r, _ri) => {
                        const _selected = (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).time === _r.time;
                        return <div key={_r.time} onClick={()=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(_p=>({..._p,time:_r.time}))} style={{padding:'10px 16px',borderRadius:12,background:_selected?'#7C3AED':'linear-gradient(135deg, #EFF6FF, #F0F9FF)',border:'1px solid '+(_selected?'#7C3AED':'#3B82F630'),cursor:'pointer',minWidth:96,textAlign:'center',boxShadow:_selected?'0 2px 6px #7C3AED30':'0 2px 6px #3B82F615',transition:'all .15s'}} onMouseEnter={e=>{if(!_selected){e.currentTarget.style.transform='scale(1.03)';e.currentTarget.style.boxShadow='0 4px 10px #3B82F625';}}} onMouseLeave={e=>{if(!_selected){e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='0 2px 6px #3B82F615';}}}>
                          <div style={{fontSize:16,fontWeight:800,color:_selected?'#fff':'#1E40AF',lineHeight:1}}>{_r.time}</div>
                          <div style={{fontSize:9,fontWeight:600,color:_selected?'#ffffffcc':'#3B82F6',marginTop:4}}>{_labelFor(_r, _ri)}</div>
                        </div>;
                      })}
                    </div>
                  </div>}
                  <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:4}}>Tous les créneaux disponibles</div>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',maxHeight:120,overflow:'auto'}}>
                    {slots.map(s=>(
                      <div key={s.time} onClick={()=>{if(!s.busy&&!s.past)(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(p=>({...p,time:s.time}));}} style={{padding:'4px 10px',borderRadius:8,fontSize:11,fontWeight:600,cursor:s.busy||s.past?'not-allowed':'pointer',background:(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).time===s.time?'#7C3AED':s.busy?'#EF444415':s.past?'#f9fafb80':'#22C55E08',color:(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).time===s.time?'#fff':s.busy?'#EF4444':s.past?'#9ca3af':'#22C55E',border:'1px solid '+((typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).time===s.time?'#7C3AED':s.busy?'#EF444430':s.past?'#e5e7eb':'#22C55E30'),opacity:s.past?0.4:1,transition:'all .12s'}}>
                        {s.time}{s.busy?' ●':''}
                      </div>
                    ))}
                  </div>
                  {busySlots.size>0 && <div style={{fontSize:9,color:'#9ca3af',marginTop:4}}>● = creneau occupe</div>}
                </div>;
              })()}
              {/* Heure manuelle — accordéon fermé par défaut. L'heure est normalement sélectionnée via la grille des créneaux. */}
              <details style={{background:'transparent'}}>
                <summary style={{cursor:'pointer',fontSize:11,fontWeight:600,color:T.text3,padding:'4px 0',userSelect:'none'}}>Heure manuelle</summary>
                <input type="time" value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).time} onChange={e=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(p=>({...p,time:e.target.value}))} style={{width:'100%',padding:'8px 12px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',outline:'none',marginTop:6}}/>
              </details>
              {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode && <div>
                <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Durée</label>
                <select value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).duration||30} onChange={e=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(p=>({...p,duration:parseInt(e.target.value)}))} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',fontFamily:'inherit'}}>
                  {[15,30,45,60,90,120].map(d=><option key={d} value={d}>{d} min</option>)}
                </select>
              </div>}
              {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode && <div style={{display:'flex',gap:8}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Catégorie de RDV *</label>
                  <select value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_category||''} onChange={e=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(p=>({...p,rdv_category:e.target.value,rdv_subcategory:''}))} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1px solid ${(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_category&&RDV_CATEGORIES[(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_category]?RDV_CATEGORIES[(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_category].color+'60':'#e5e7eb'}`,background:(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_category&&RDV_CATEGORIES[(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_category]?RDV_CATEGORIES[(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_category].color+'08':'#f9fafb',fontSize:13,color:'#111',fontFamily:'inherit'}}>
                    <option value="">— Choisir —</option>
                    {Object.entries(RDV_CATEGORIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:12,fontWeight:600,color:T.text2,marginBottom:4,display:'block'}}>Sous-catégorie</label>
                  <select value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_subcategory||''} onChange={e=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(p=>({...p,rdv_subcategory:e.target.value}))} disabled={!(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_category} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,color:'#111',fontFamily:'inherit',opacity:(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_category?1:0.5}}>
                    <option value="">— Aucune —</option>
                    {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_category && RDV_CATEGORIES[(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_category] && Object.entries(RDV_CATEGORIES[(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).rdv_category].subcategories).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>}
              <details style={{background:'transparent'}}>
                <summary style={{cursor:'pointer',fontSize:12,fontWeight:600,color:T.text2,padding:'4px 0',userSelect:'none'}}>Notes</summary>
                <textarea value={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).notes} onChange={e=>(typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(p=>({...p,notes:e.target.value}))} placeholder="Ajouter une note..." rows={2} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:13,fontFamily:'inherit',color:'#111',resize:'none',outline:'none',marginTop:6}}/>
              </details>
              {/* V1.8.11 — confirmation email : icône compacte, tooltip descriptif */}
              {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._bookingMode && (()=>{
                const _pf = (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{});
                const _ct181 = _pf.contactId ? (contacts||[]).find(_c=>_c.id===_pf.contactId) : null;
                const _vEmail = _ct181?.email || _pf._newEmail || '';
                const _checked = (_pf._sendConfirmation !== false) && !!_vEmail;
                const _tip = !_vEmail
                  ? 'Aucun email — confirmation impossible'
                  : (_checked ? 'Confirmation par email activée — clic pour désactiver'
                             : 'Confirmation par email désactivée — clic pour activer');
                return <div style={{display:'flex',justifyContent:'flex-end'}}>
                  <button
                    type="button"
                    disabled={!_vEmail}
                    title={_tip}
                    aria-label={_tip}
                    aria-pressed={_checked}
                    onClick={()=>_vEmail && (typeof setPhoneScheduleForm==='function'?setPhoneScheduleForm:function(){})(_p=>({..._p,_sendConfirmation:!_checked}))}
                    style={{
                      width:32, height:32, borderRadius:8, padding:0,
                      border:'1px solid '+(_checked?'#3B82F6':(_vEmail?'#d1d5db':'#e5e7eb')),
                      background:_checked?'#3B82F6':'#fff',
                      color:_checked?'#fff':(_vEmail?'#6b7280':'#d1d5db'),
                      cursor:_vEmail?'pointer':'not-allowed',
                      opacity:_vEmail?1:0.55,
                      fontSize:15, lineHeight:1,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      transition:'all .15s', fontFamily:'inherit'
                    }}
                  >✉</button>
                </div>;
              })()}
            </div>
            {/* Erreur inline — visible dans la modal */}
            {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._error && <div style={{margin:'12px 0',padding:'10px 14px',borderRadius:10,background:'#FEE2E2',border:'1px solid #FECACA',color:'#DC2626',fontSize:14,fontWeight:600,display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:18}}>⚠️</span> {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._error}
            </div>}
            <div style={{display:'flex',gap:8,marginTop:16}}>
              <Btn small style={{flex:1,justifyContent:'center'}} onClick={closeScheduleModal}>Annuler</Btn>
              <Btn small primary disabled={(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._submitting} style={{flex:1,justifyContent:'center',opacity:(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._submitting?0.6:1}} onClick={async()=>{
                setPhoneScheduleForm(p=>({...p,_error:''}));
                if((typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._submitting) return;
                const f = (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:null);
                const setErr=(msg)=>setPhoneScheduleForm(p=>({...p,_error:msg}));
                // Nouveau contact : créer d'abord
                if(f._bookingMode && !hasPrefilledContact && (typeof schedContactMode!=='undefined'?schedContactMode:null)==='new') {
                  if(!f._newFirstName || !f._newLastName) { setErr('Prénom et nom obligatoires'); return; }
                  if(!f.number && !f._newEmail) { setErr('Téléphone ou email obligatoire'); return; }
                  if(!f.date || !f.time) { setErr('Choisissez date et heure'); return; }
                  setPhoneScheduleForm(p=>({...p,_submitting:true,_error:''}));
                  try {
                    const newName = (f._newFirstName+' '+f._newLastName).trim();
                    const _emailFirst = (f._newEmail||'').trim();
                    const _phoneFirst = (f.number||'').trim();

                    // V1.8.22 Phase B — Pré-check doublon (sauf si user a déjà choisi via résolveur)
                    if (!f._skipDuplicateCheck) {
                      const checkRes = await api('/api/data/contacts/check-duplicate-single', {
                        method:'POST',
                        body:{ email:_emailFirst, phone:_phoneFirst }
                      });
                      if (checkRes && checkRes.exists) {
                        setDuplicateResolverData({
                          matches: checkRes.matches || [],
                          conflict: !!checkRes.conflict,
                          pendingNewContact: {
                            firstName: f._newFirstName, lastName: f._newLastName,
                            email: _emailFirst, phone: _phoneFirst,
                            address: f._newAddress||'', name: newName,
                          },
                        });
                        setPhoneScheduleForm(p=>({...p,_submitting:false}));
                        return;
                      }
                    }

                    // V1.8.22 Phase B — Créer le contact + récupérer ID backend RÉEL
                    // V1.8.22.1 — Tag provenance agenda (source/origin) pour traçabilité CRM/Pipeline
                    // V1.8.22.2 — Casing DB lowercase: firstname/lastname (était camelCase = ignoré par backend)
                    const newContactBody = {
                      name: newName,
                      firstname: f._newFirstName, lastname: f._newLastName,
                      email: _emailFirst, phone: _phoneFirst,
                      address: f._newAddress||'',
                      companyId: company.id,
                      pipeline_stage: 'nouveau',
                      assignedTo: collab.id,
                      source: 'agenda',
                      _origin: 'agenda_rdv_creation',
                    };
                    const createRes = await api('/api/data/contacts', { method:'POST', body:newContactBody });
                    if (!createRes || createRes.error) {
                      setErr('Erreur création contact : ' + (createRes?.error || 'inconnue'));
                      setPhoneScheduleForm(p=>({...p,_submitting:false}));
                      return;
                    }
                    // _duplicate:true géré silencieusement — l'id retourné est l'existant
                    const realContactId = createRes.id;

                    setContacts(p => {
                      if (p.some(c => c.id === realContactId)) return p;
                      return [...p, { id: realContactId, ...newContactBody, tags:[], notes:'', totalBookings:0, rating:0, createdAt:new Date().toISOString() }];
                    });
                    setPhoneScheduleForm(p=>({...p, contactId:realContactId, contactName:newName, _skipDuplicateCheck:false}));
                    setTimeout(()=>{
                      // Pattern setTimeout préservé (intouchabilité addScheduledCall) — mais avec ID backend RÉEL
                      (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).contactId = realContactId;
                      (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).contactName = newName;
                      const result = addScheduledCall();
                      if(!result) setPhoneScheduleForm(p=>({...p,_submitting:false}));
                      else _scheduleGlobalRefresh();
                    }, 50);
                  } catch(err) {
                    setErr('Erreur création contact : '+(err.message||''));
                    setPhoneScheduleForm(p=>({...p,_submitting:false}));
                  }
                  return;
                }
                // Contact existant : vérifier les champs
                if(!f.contactId && (typeof schedContactMode!=='undefined'?schedContactMode:null)==='existing' && !f.number) { setErr('Sélectionnez un contact ou entrez un numéro'); return; }
                if(f.date&&f.time&&(f.number||f.contactId)){
                  // V1.8.11 — persister les éditions contact (header éditable) AVANT la création du RDV
                  if (f.contactId && (f._editFirstName!==undefined || f._editLastName!==undefined || f._editEmail!==undefined || f._editPhone!==undefined)) {
                    const _ct = (contacts||[]).find(_c=>_c.id===f.contactId) || {};
                    const _updates = {};
                    const _first = f._editFirstName !== undefined ? f._editFirstName : (_ct.firstName || (_ct.name||'').split(' ')[0] || '');
                    const _last  = f._editLastName  !== undefined ? f._editLastName  : (_ct.lastName  || (_ct.name||'').split(' ').slice(1).join(' ') || '');
                    const _email = f._editEmail     !== undefined ? f._editEmail     : (_ct.email || '');
                    const _phone = f._editPhone     !== undefined ? f._editPhone     : (_ct.phone || f.number || '');
                    if ((_ct.firstName||'') !== _first) _updates.firstName = _first;
                    if ((_ct.lastName||'')  !== _last)  _updates.lastName  = _last;
                    if ((_ct.email||'')     !== _email) _updates.email     = _email;
                    if ((_ct.phone||'')     !== _phone) _updates.phone     = _phone;
                    const _newName = (_first + ' ' + _last).trim();
                    if (_newName && (_ct.name||'') !== _newName) _updates.name = _newName;
                    if (Object.keys(_updates).length > 0 && typeof handleCollabUpdateContact === 'function') {
                      handleCollabUpdateContact(f.contactId, { ..._updates, _source:'schedule_modal', _origin:'rdv_creation' });
                    }
                  }
                  // V1.8.13 — Cross-collab : si on programme pour un autre collab, transférer
                  // l'ownership au target et garder le créateur (ainsi que l'éventuel ancien
                  // owner) en shared_with. Aucun impact sur addScheduledCall.
                  if (f.contactId && _scheduleTargetCollabId && _scheduleTargetCollabId !== collab.id && typeof handleCollabUpdateContact === 'function') {
                    const _ctXC = (contacts||[]).find(_c => _c.id === f.contactId) || {};
                    const _curShared = Array.isArray(_ctXC.shared_with) ? _ctXC.shared_with : [];
                    const _oldOwner = _ctXC.assignedTo;
                    const _nextShared = Array.from(new Set([
                      ..._curShared.filter(_id => _id && _id !== _scheduleTargetCollabId),
                      collab.id,
                      ...(_oldOwner && _oldOwner !== _scheduleTargetCollabId ? [_oldOwner] : []),
                    ]));
                    handleCollabUpdateContact(f.contactId, {
                      assignedTo: _scheduleTargetCollabId,
                      shared_with: _nextShared,
                      _source: 'cross_collab_booking',
                      _origin: 'rdv_creation',
                    });
                    // V1.8.15 — Timeline event "X a transmis ce contact à Y". Délai 1500ms pour
                    // que le PUT contact (debounced ~600ms) ait été persisté côté backend
                    // avant la vérif d'isolation collab du POST pipeline-history.
                    {
                      const _capN = (n) => { const s = String(n||'').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
                      const _targetName = _capN((collabs||[]).find(_c => _c.id === _scheduleTargetCollabId)?.name || '');
                      const _myName = _capN(collab.name || collab.firstName || '');
                      const _note = (_myName || 'Quelqu\'un') + ' a transmis ce contact' + (_targetName ? ' à ' + _targetName : '');
                      setTimeout(() => {
                        api('/api/data/pipeline-history', { method:'POST', body:{ contactId: f.contactId, companyId: company?.id, fromStage: '', toStage: '_xc_book', userId: collab.id, userName: collab.name, note: _note } }).catch(()=>{});
                      }, 1500);
                    }
                  }
                  setPhoneScheduleForm(p=>({...p,_submitting:true,_error:''}));
                  const result = addScheduledCall();
                  if(!result) setPhoneScheduleForm(p=>({...p,_submitting:false}));
                  else _scheduleGlobalRefresh(); // V1.8.22 Phase B — refresh global après succès booking (path contact existant)
                } else {
                  setErr('Remplissez tous les champs requis');
                }
              }}><I n="clock" s={14}/> {(typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{})._submitting?'En cours...':'Programmer'}</Btn>
            </div>
          </div>
        </div>
        );
      })()}

      {/* V1.8.22 Phase B — DUPLICATE RESOLVER MODAL ──────────────────────────
          Ouverte quand check-duplicate-single retourne exists=true.
          3 modes selon shape (single/conflict/multi) + cas multi-collab orthogonal.
          Actions :
            - Utiliser existant (re-injecte contactId dans phoneScheduleForm + relance addScheduledCall)
            - Utiliser + me partager (PUT /share avant booking — préserve assignedTo)
            - Créer nouveau (bypass check via _skipDuplicateCheck)
            - Annuler (ferme tout, conserve modal RDV ouverte)
      */}
      {duplicateResolverData && (()=>{
        const { matches = [], conflict = false, pendingNewContact = {} } = duplicateResolverData;
        const _close = () => setDuplicateResolverData(null);
        const _setSubmitting = (v) => setPhoneScheduleForm(p=>({...p,_submitting:!!v}));

        // Lance addScheduledCall avec un contactId existant (utilisé par "Utiliser" et "Utiliser+partager")
        const _useContactAndBook = (contactId, contactName) => {
          setPhoneScheduleForm(p=>({...p, contactId, contactName: contactName||p.contactName||'', _skipDuplicateCheck:false}));
          _close();
          setTimeout(()=>{
            (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).contactId = contactId;
            (typeof phoneScheduleForm!=='undefined'?phoneScheduleForm:{}).contactName = contactName||'';
            const result = addScheduledCall();
            if (!result) _setSubmitting(false);
            else _scheduleGlobalRefresh();
          }, 50);
        };

        // Partage le contact avec le collab courant PUIS book
        const _shareAndBook = async (contactId, contactName) => {
          _setSubmitting(true);
          try {
            const r = await api(`/api/data/contacts/${contactId}/share`, {
              method:'PUT',
              body:{ collaboratorId: collab.id, mode:'add' }
            });
            if (!r || r.error) {
              showNotif('Impossible de partager le contact : ' + (r?.error || 'erreur'), 'danger');
              _setSubmitting(false);
              return;
            }
            showNotif('Contact partagé avec vous', 'success');
          } catch (e) {
            showNotif('Erreur lors du partage', 'danger');
            _setSubmitting(false);
            return;
          }
          _useContactAndBook(contactId, contactName);
        };

        // Bypass check : crée le contact malgré le doublon (cas "créer nouveau")
        const _forceCreateAndBook = () => {
          setPhoneScheduleForm(p=>({...p, _skipDuplicateCheck:true}));
          _close();
          // Relance le submit après que le state ait été appliqué (le user reclique "Programmer")
          showNotif('Cliquez à nouveau sur "Programmer" pour créer un nouveau contact', 'info');
          _setSubmitting(false);
        };

        // Détecte si le contact match appartient à un autre collab et n'est pas partagé
        const _isOtherCollab = (m) => {
          if (!m.assignedTo) return false;
          if (m.assignedTo === collab.id) return false;
          const sw = Array.isArray(m.sharedWith) ? m.sharedWith : [];
          if (sw.includes(collab.id)) return false;
          return true;
        };

        // Action principale par match : selon ownership
        const _renderMatchActions = (m) => {
          const otherCollab = _isOtherCollab(m);
          if (otherCollab) {
            return (
              <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
                <div style={{fontSize:12,color:'#7C3AED',fontWeight:600,padding:'6px 10px',background:'#7C3AED10',borderRadius:8,display:'flex',alignItems:'center',gap:6}}>
                  <span>👥</span> Ce contact est actuellement suivi par <b>{m.assignedName || m.assignedTo}</b>
                </div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  <Btn small primary onClick={()=>_shareAndBook(m.id, m.name)}>Utiliser + me partager</Btn>
                  <Btn small onClick={_forceCreateAndBook}>Dupliquer</Btn>
                </div>
              </div>
            );
          }
          return (
            <div style={{display:'flex',gap:6,marginTop:8,flexWrap:'wrap'}}>
              <Btn small primary onClick={()=>_useContactAndBook(m.id, m.name)}>Utiliser ce contact</Btn>
            </div>
          );
        };

        const _matchedByLabel = (m) => m.matchedBy === 'email' ? '📧 Email' : m.matchedBy === 'phone' ? '📞 Téléphone' : '';

        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(4px)',zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={_close}>
            <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:20,padding:24,maxWidth:520,width:'92%',boxShadow:'0 25px 50px rgba(0,0,0,0.25)',maxHeight:'88vh',overflowY:'auto'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                <div style={{width:40,height:40,borderRadius:12,background:conflict?'linear-gradient(135deg,#F59E0B,#D97706)':'linear-gradient(135deg,#3B82F6,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>
                  {conflict ? '⚠️' : '👥'}
                </div>
                <div style={{flex:1}}>
                  <h3 style={{fontSize:16,fontWeight:700,margin:0,color:'#111'}}>
                    {conflict ? 'Conflit détecté' : (matches.length > 1 ? 'Plusieurs contacts existent' : 'Contact déjà existant')}
                  </h3>
                  <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>
                    {conflict
                      ? 'L\'email correspond à un contact, le téléphone à un autre.'
                      : 'Que souhaitez-vous faire ?'}
                  </div>
                </div>
                <span onClick={_close} style={{cursor:'pointer',color:'#9ca3af',padding:6}}><I n="x" s={18}/></span>
              </div>

              {/* Données du nouveau contact (rappel) */}
              <div style={{padding:'10px 12px',borderRadius:10,background:'#F9FAFB',border:'1px solid #E5E7EB',marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}}>Vous saisissez</div>
                <div style={{fontSize:13,fontWeight:600,color:'#111'}}>{pendingNewContact.name}</div>
                <div style={{fontSize:11,color:'#6B7280',marginTop:2}}>
                  {pendingNewContact.email && <span>📧 {pendingNewContact.email}</span>}
                  {pendingNewContact.email && pendingNewContact.phone && <span style={{margin:'0 6px'}}>·</span>}
                  {pendingNewContact.phone && <span>📞 {pendingNewContact.phone}</span>}
                </div>
              </div>

              {/* Liste des matches */}
              <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:14}}>
                {matches.map(m => (
                  <div key={m.id} style={{padding:12,borderRadius:10,border:'1px solid #E5E7EB',background:'#fff'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:4}}>
                      <div style={{fontSize:13,fontWeight:700,color:'#111'}}>{m.name}</div>
                      <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:6,background:'#EFF6FF',color:'#2563EB'}}>{_matchedByLabel(m)}</span>
                    </div>
                    <div style={{fontSize:11,color:'#6B7280',display:'flex',gap:8,flexWrap:'wrap'}}>
                      {m.email && <span>📧 {m.email}</span>}
                      {m.phone && <span>📞 {m.phone}</span>}
                      {m.pipelineStage && <span style={{color:'#7C3AED'}}>· {m.pipelineStage}</span>}
                    </div>
                    {_renderMatchActions(m)}
                  </div>
                ))}
              </div>

              {/* Actions globales */}
              <div style={{display:'flex',gap:8,paddingTop:12,borderTop:'1px solid #F3F4F6'}}>
                <Btn small style={{flex:1,justifyContent:'center'}} onClick={_close}>Annuler</Btn>
                <Btn small style={{flex:1,justifyContent:'center'}} onClick={_forceCreateAndBook}>Créer un nouveau contact</Btn>
              </div>
            </div>
          </div>
        );
      })()}

      {/* V1.13.0 — DuplicateOnCreateModal (NewContactModal flow). Snapshot du formulaire dans state, pas de window globale.
          V1.13.0-modal-stacking-fix : NewContactModal fermée avant ouverture (pas d'empilement z-index).
          onClose : ré-ouvre NewContactModal (formulaire intact pour correction).
          onViewExisting / onForceCreate : reset formulaire (sortie du flow création). */}
      {duplicateOnCreateData && (
        <DuplicateOnCreateModal
          data={duplicateOnCreateData}
          onClose={() => {
            setDuplicateOnCreateData(null);
            // Restore NewContactModal — formulaire toujours en state, user peut corriger
            setShowNewContact(true);
          }}
          onForceCreate={(reason, justification) => {
            const snapshot = duplicateOnCreateData?.pendingNewContact?._formSnapshot;
            setDuplicateOnCreateData(null);
            if (snapshot) submitNewContact(snapshot, { forceCreate: true, reason, justification });
          }}
          onEnrich={handleDuplicateEnrich}
          onShare={handleDuplicateShare}
          onArchive={handleDuplicateArchive}
          onHardDelete={handleDuplicateHardDelete}
          onCreateMyOwn={handleDuplicateCreateMyOwn}
        />
      )}
      {/* V1.13.1.d — Instance HardDeleteContactModal pour flow duplicate (séparée de celle CrmTab) */}
      {dupHardDeleteTarget && (
        <HardDeleteContactModal
          contact={dupHardDeleteTarget}
          onClose={() => setDupHardDeleteTarget(null)}
          onSuccess={(id) => {
            setContacts(p => p.filter(c => c.id !== id));
            setPipelineRightContact(null);
            setSelectedCrmContact(null);
            // Window event 'crmContactHardDeleted' déjà émis par HardDeleteContactModal
          }}
          showNotif={showNotif}
        />
      )}

{/* ── MODAL NOUVEAU CONTACT ── */}
<Modal open={showNewContact} onClose={()=>(typeof setShowNewContact==='function'?setShowNewContact:function(){})(false)} title="Nouveau contact" width={540}>
<div style={{display:'flex',flexDirection:'column',gap:12}}>
  {/* Type + Civilité */}
  <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
    <div style={{flex:1}}>
      <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Type</label>
      <div style={{display:'flex',gap:6}}>
        {[{v:'btc',l:'🟢 Particulier'},{v:'btb',l:'🔵 Entreprise'}].map(t=>(
          <div key={t.v} onClick={()=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,contact_type:t.v}))} style={{padding:'6px 14px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:(typeof newContactForm!=='undefined'?newContactForm:{}).contact_type===t.v?700:500,background:(typeof newContactForm!=='undefined'?newContactForm:{}).contact_type===t.v?T.accentBg:'transparent',color:(typeof newContactForm!=='undefined'?newContactForm:{}).contact_type===t.v?T.accent:T.text3,border:`1.5px solid ${(typeof newContactForm!=='undefined'?newContactForm:{}).contact_type===t.v?T.accent:T.border}`}}>{t.l}</div>
        ))}
      </div>
    </div>
    <div>
      <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Civilité</label>
      <select value={(typeof newContactForm!=='undefined'?newContactForm:{}).civility||''} onChange={e=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,civility:e.target.value}))} style={{padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:13,fontFamily:'inherit',color:T.text,cursor:'pointer'}}>
        <option value="">—</option>
        <option value="M">M.</option>
        <option value="Mme">Mme</option>
      </select>
    </div>
  </div>
  {/* Prénom + Nom */}
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
    <ValidatedInput label="Prénom *" required placeholder="Prénom" value={(typeof newContactForm!=='undefined'?newContactForm:{}).firstname||''} onChange={e=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,firstname:e.target.value}))} icon="user"/>
    <ValidatedInput label="Nom *" required placeholder="Nom de famille" value={(typeof newContactForm!=='undefined'?newContactForm:{}).lastname||''} onChange={e=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,lastname:e.target.value}))} icon="user"/>
  </div>
  {/* Email */}
  <ValidatedInput label="Email" placeholder="email@exemple.com" value={(typeof newContactForm!=='undefined'?newContactForm:{}).email} onChange={e=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,email:e.target.value}))} icon="mail" validate={v=>!v.trim()||isValidEmail(v)} errorMsg="Format email invalide"/>
  {/* Téléphone + Mobile */}
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
    <ValidatedInput label="Téléphone" placeholder="+33 1 XX XX XX XX" value={(typeof newContactForm!=='undefined'?newContactForm:{}).phone} onChange={e=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,phone:e.target.value}))} icon="phone" validate={v=>!v.trim()||isValidPhone(v)} errorMsg="Format invalide"/>
    <ValidatedInput label="Mobile" placeholder="+33 6 XX XX XX XX" value={(typeof newContactForm!=='undefined'?newContactForm:{}).mobile||''} onChange={e=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,mobile:e.target.value}))} icon="smartphone" validate={v=>!v.trim()||isValidPhone(v)} errorMsg="Format invalide"/>
  </div>
  {/* Adresse */}
  <ValidatedInput label="Adresse" placeholder="Rue, Ville, Code postal" value={(typeof newContactForm!=='undefined'?newContactForm:{}).address||''} onChange={e=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,address:e.target.value}))} icon="map-pin"/>
  {/* Champs entreprise conditionnels */}
  {(typeof newContactForm!=='undefined'?newContactForm:{}).contact_type==='btb'&&(
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:10,borderRadius:8,background:'#2563EB08',border:'1px solid #2563EB20'}}>
      <ValidatedInput label="Société *" placeholder="Nom de l'entreprise" value={(typeof newContactForm!=='undefined'?newContactForm:{}).company||''} onChange={e=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,company:e.target.value}))} icon="building-2"/>
      <ValidatedInput label="Site web" placeholder="https://..." value={(typeof newContactForm!=='undefined'?newContactForm:{}).website||''} onChange={e=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,website:e.target.value}))} icon="globe"/>
      <ValidatedInput label="SIRET / SIREN" placeholder="XXX XXX XXX XXXXX" value={(typeof newContactForm!=='undefined'?newContactForm:{}).siret||''} onChange={e=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,siret:e.target.value}))}/>
    </div>
  )}
  {/* Statut pipeline */}
  <div>
    <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Statut pipeline</label>
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
      {PIPELINE_STAGES.map(s=>(
        <div key={s.id} onClick={()=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,pipeline_stage:s.id}))} style={{padding:'6px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:(typeof newContactForm!=='undefined'?newContactForm:{}).pipeline_stage===s.id?700:500,background:(typeof newContactForm!=='undefined'?newContactForm:{}).pipeline_stage===s.id?(s.color||'#2563EB')+'18':'transparent',color:(typeof newContactForm!=='undefined'?newContactForm:{}).pipeline_stage===s.id?(s.color||'#2563EB'):T.text3,border:`1.5px solid ${(typeof newContactForm!=='undefined'?newContactForm:{}).pipeline_stage===s.id?(s.color||'#2563EB'):T.border}`,transition:'all .15s',display:'flex',alignItems:'center',gap:4}}>
          <div style={{width:8,height:8,borderRadius:4,background:s.color||'#2563EB'}}/>
          {s.label}
        </div>
      ))}
    </div>
  </div>
  {/* Tags */}
  <div>
    <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Tags</label>
    <input value={(typeof newContactForm!=='undefined'?newContactForm:{}).tags||''} onChange={e=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,tags:e.target.value}))} placeholder="VIP, Prospect, Urgent... (séparés par virgule)" style={{width:'100%',padding:'8px 10px',borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:13,fontFamily:'inherit',color:T.text,outline:'none'}}/>
    {(typeof newContactForm!=='undefined'?newContactForm:{}).tags && <div style={{display:'flex',gap:4,marginTop:4,flexWrap:'wrap'}}>{(typeof newContactForm!=='undefined'?newContactForm:{}).tags.split(',').map(t=>t.trim()).filter(Boolean).map((t,i)=><span key={i} style={{fontSize:10,padding:'2px 8px',borderRadius:6,background:T.accentBg,color:T.accent,fontWeight:600}}>{t}</span>)}</div>}
  </div>
  {/* Notes */}
  <div>
    <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text2,marginBottom:5}}>Notes</label>
    <textarea value={(typeof newContactForm!=='undefined'?newContactForm:{}).notes} onChange={e=>(typeof setNewContactForm==='function'?setNewContactForm:function(){})(p=>({...p,notes:e.target.value}))} placeholder="Notes, informations complémentaires..." rows={3} style={{width:'100%',padding:10,borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,fontSize:13,fontFamily:'inherit',resize:'vertical',color:T.text,outline:'none'}}/>
  </div>
  <div style={{display:'flex',gap:8,marginTop:8}}>
    <Btn onClick={()=>setShowNewContact(false)} style={{flex:1}}>Annuler</Btn>
    <Btn primary onClick={handleCollabCreateContact} style={{flex:1}}><I n="check" s={14}/> Créer le contact</Btn>
  </div>
</div>
</Modal>

      {/* ═══ CONTRACT MODAL — Client Validé ═══ */}
      {(typeof contractModal!=='undefined'?contractModal:null) && (
        <Modal open={true} onClose={()=>{
          // Cancel → still change stage but without contract info
          handlePipelineStageChange((typeof contractModal!=='undefined'?contractModal:{}).contactId, 'client_valide', (typeof contractModal!=='undefined'?contractModal:{}).note||'', {amount:0,number:'',date:''});
          setContractModal(null);
        }}>
          <h2 style={{fontSize:18,fontWeight:800,marginBottom:20,display:'flex',alignItems:'center',gap:8}}><I n="file-check" s={20} style={{color:'#22C55E'}}/> Contrat — Client Validé</h2>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:T.text3,marginBottom:4,display:'block'}}>Montant du contrat (€)</label>
              <input type="number" min="0" step="0.01" value={(typeof contractForm!=='undefined'?contractForm:{}).amount} onChange={e=>(typeof setContractForm==='function'?setContractForm:function(){})(p=>({...p,amount:e.target.value}))} placeholder="Ex: 5000" style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1.5px solid ${T.border}`,background:T.bg,fontSize:14,fontWeight:600,fontFamily:'inherit',color:T.text,outline:'none'}}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:T.text3,marginBottom:4,display:'block'}}>Numéro de dossier</label>
              <input type="text" value={(typeof contractForm!=='undefined'?contractForm:{}).number} onChange={e=>(typeof setContractForm==='function'?setContractForm:function(){})(p=>({...p,number:e.target.value}))} placeholder="Ex: GD-2026-088" style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1.5px solid ${T.border}`,background:T.bg,fontSize:14,fontFamily:'inherit',color:T.text,outline:'none'}}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:T.text3,marginBottom:4,display:'block'}}>Date de signature</label>
              <input type="date" value={(typeof contractForm!=='undefined'?contractForm:{}).date} onChange={e=>(typeof setContractForm==='function'?setContractForm:function(){})(p=>({...p,date:e.target.value}))} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1.5px solid ${T.border}`,background:T.bg,fontSize:14,fontFamily:'inherit',color:T.text,outline:'none'}}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:T.text3,marginBottom:4,display:'block'}}>Commentaire sur la vente</label>
              <textarea value={(typeof contractForm!=='undefined'?contractForm:{}).comment||''} onChange={e=>(typeof setContractForm==='function'?setContractForm:function(){})(p=>({...p,comment:e.target.value}))} placeholder="Décrivez la vente, le contexte, les besoins du client..." rows={3} style={{width:'100%',padding:'10px 14px',borderRadius:10,border:`1.5px solid ${T.border}`,background:T.bg,fontSize:13,fontFamily:'inherit',color:T.text,outline:'none',resize:'vertical'}}/>
            </div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:20,justifyContent:'flex-end'}}>
            <Btn onClick={()=>{
              handlePipelineStageChange((typeof contractModal!=='undefined'?contractModal:{}).contactId, 'client_valide', (typeof contractModal!=='undefined'?contractModal:{}).note||'', {amount:0,number:'',date:''});
              setContractModal(null);
            }}>Passer sans contrat</Btn>
            <Btn primary onClick={()=>{
              const amt = parseFloat((typeof contractForm!=='undefined'?contractForm:{}).amount) || 0;
              if(!amt || amt <= 0) { showNotif('Le montant du contrat est obligatoire','danger'); return; }
              handlePipelineStageChange((typeof contractModal!=='undefined'?contractModal:{}).contactId, 'client_valide', (typeof contractModal!=='undefined'?contractModal:{}).note||'', {amount:amt, number:(typeof contractForm!=='undefined'?contractForm:{}).number.trim(), date:(typeof contractForm!=='undefined'?contractForm:{}).date});
              setContractModal(null);
              showNotif(`Contrat validé — ${amt.toLocaleString('fr-FR')} €`);
            }}><I n="check" s={14}/> Valider le contrat</Btn>
          </div>
        </Modal>
      )}

      {/* V1.10.1 — Modal "Voir les détails" d'une sauvegarde */}
      {snapshotPreviewModal && (
        <Modal open={true} onClose={()=>setSnapshotPreviewModal(null)} title="Détails de la sauvegarde" width={520}>
          {snapshotPreviewModal._loading || snapshotPreviewLoading ? (
            <div style={{padding:30,textAlign:'center',color:T.text3}}>
              <Spinner size={24}/>
              <div style={{marginTop:10,fontSize:12}}>Chargement de l'aperçu…</div>
            </div>
          ) : snapshotPreviewModal.snapshot ? (
            <div>
              {/* Header info */}
              <div style={{padding:'10px 12px',borderRadius:10,background:T.bg,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:4}}>
                  Sauvegarde de {fmtSnapshotAgo(snapshotPreviewModal.snapshot.createdAt)}
                </div>
                <div style={{fontSize:11,color:T.text3}}>
                  {snapshotPreviewModal.snapshot.kind === 'manual' ? '👆 Sauvegarde manuelle' : snapshotPreviewModal.snapshot.kind === 'pre-restore' ? '⏪ Pré-restauration (avant une autre restauration)' : '🔄 Sauvegarde automatique'}
                </div>
              </div>

              {/* Contenu de la sauvegarde — wording humain */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:700,color:T.text2,marginBottom:8}}>Cet état contient :</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[
                    { label:'Contacts', icon:'users', key:'contacts', color:'#3B82F6' },
                    { label:'RDV enregistrés', icon:'calendar', key:'bookings', color:'#0EA5E9' },
                    { label:'Suivis pipeline', icon:'git-branch', key:'pipeline_history', color:'#7C3AED' },
                    { label:'Changements de statut', icon:'refresh-cw', key:'contact_status_history', color:'#F59E0B' },
                    { label:'Notes IA contact', icon:'cpu', key:'contact_ai_memory', color:'#8B5CF6' },
                    { label:'Documents', icon:'paperclip', key:'contact_documents', color:'#22C55E' },
                  ].map(item => {
                    const count = (snapshotPreviewModal.willRestore && snapshotPreviewModal.willRestore[item.key]) || 0;
                    return (
                      <div key={item.key} style={{padding:'8px 10px',borderRadius:8,background:item.color+'08',border:'1px solid '+item.color+'20',display:'flex',alignItems:'center',gap:8}}>
                        <I n={item.icon} s={14} style={{color:item.color}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,color:T.text2}}>{item.label}</div>
                          <div style={{fontSize:14,fontWeight:800,color:item.color}}>{count}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* V1.10.1 — Preview "Vos RDV actuels" : aperçu concret de ce qui sera remplacé.
                  Source = state local 'bookings' (déjà chargé). Affichage 3 prochains à venir du collab. */}
              {(() => {
                const myUpcoming = (bookings||[])
                  .filter(b => b && b.collaboratorId === collab.id && b.status === 'confirmed')
                  .map(b => {
                    try {
                      const dt = new Date((b.date||'') + 'T' + ((b.time||'00:00')+'00:00').slice(0,5));
                      return { ...b, _dt: dt.getTime() };
                    } catch { return null; }
                  })
                  .filter(b => b && !isNaN(b._dt) && b._dt >= Date.now() - 60_000)
                  .sort((a,bb) => a._dt - bb._dt)
                  .slice(0, 3);
                if (myUpcoming.length === 0) return null;
                return (
                  <div style={{marginBottom:14,padding:'10px 12px',borderRadius:10,background:T.bg,border:'1px solid '+T.border}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.text2,marginBottom:8,display:'flex',alignItems:'center',gap:5}}>
                      <I n="calendar" s={12} style={{color:'#0EA5E9'}}/> Vos {myUpcoming.length} prochains RDV (aperçu de l'état actuel)
                    </div>
                    {myUpcoming.map((b,i) => {
                      const ct = (contacts||[]).find(c => c.id === b.contactId);
                      const dateStr = (() => {
                        try {
                          const d = new Date(b._dt);
                          return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
                        } catch { return b.date + ' ' + b.time; }
                      })();
                      return (
                        <div key={b.id||i} style={{display:'flex',alignItems:'center',gap:8,fontSize:11,padding:'4px 0',borderTop:i>0?'1px solid '+T.border+'40':'none'}}>
                          <I n="calendar" s={11} style={{color:T.text3}}/>
                          <span style={{color:T.text,fontWeight:600}}>{dateStr}</span>
                          <span style={{color:T.text3}}>·</span>
                          <span style={{color:T.text2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{ct?.name || b.visitorName || 'Sans nom'}</span>
                        </div>
                      );
                    })}
                    <div style={{fontSize:9,color:T.text3,marginTop:6,fontStyle:'italic'}}>Ces RDV pourraient être remplacés par ceux de la sauvegarde.</div>
                  </div>
                );
              })()}

              {/* Avertissements — séparation critical (bloquant) vs simple (informatif) */}
              {(() => {
                const warns = Array.isArray(snapshotPreviewModal.warnings) ? snapshotPreviewModal.warnings : [];
                const critical = warns.filter(w => w.kind === 'critical-empty-snapshot');
                const others = warns.filter(w => w.kind !== 'critical-empty-snapshot');
                return (
                  <>
                    {critical.length > 0 && (
                      <div style={{marginBottom:14,padding:'12px 14px',borderRadius:10,background:'#EF444412',border:'2px solid #EF4444'}}>
                        <div style={{fontSize:12,fontWeight:800,color:'#B91C1C',marginBottom:6,display:'flex',alignItems:'center',gap:6}}>
                          <I n="shield-off" s={14}/> Restauration bloquée
                        </div>
                        {critical.map((w, i) => (
                          <div key={i} style={{fontSize:11,color:'#7F1D1D',lineHeight:1.5}}>
                            <strong>{w.message}</strong>
                            {w.detail && <div style={{marginTop:4,color:'#991B1B'}}>{w.detail}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {others.length > 0 && (
                      <div style={{marginBottom:14,padding:'10px 12px',borderRadius:10,background:'#F59E0B08',border:'1px solid #F59E0B30'}}>
                        <div style={{fontSize:11,fontWeight:700,color:'#B45309',marginBottom:6,display:'flex',alignItems:'center',gap:5}}>
                          <I n="alert-triangle" s={12}/> Avertissements ({others.length})
                        </div>
                        {others.slice(0, 5).map((w, i) => (
                          <div key={i} style={{fontSize:10,color:T.text2,marginTop:3}}>• {w.message}{w.detail ? ` (${w.detail})` : ''}</div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Note historique externe */}
              {Array.isArray(snapshotPreviewModal.willSkip) && snapshotPreviewModal.willSkip.length > 0 && (
                <div style={{marginBottom:14,fontSize:10,color:T.text3,fontStyle:'italic'}}>
                  Note : les appels VoIP, transcriptions et logs d'activité ne sont pas restaurés (historique externe préservé).
                </div>
              )}

              {/* CTA — désactivé si warning critical (anti-perte) */}
              {(() => {
                const hasCritical = (snapshotPreviewModal.warnings||[]).some(w => w.kind === 'critical-empty-snapshot');
                return (
                  <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:8,borderTop:'1px solid '+T.border}}>
                    <Btn onClick={()=>setSnapshotPreviewModal(null)}>Fermer</Btn>
                    <Btn primary disabled={hasCritical} onClick={()=>{
                      if (hasCritical) return;
                      const snap = snapshotPreviewModal.snapshot;
                      setSnapshotPreviewModal(null);
                      setSnapshotConfirmRestore(snap);
                    }} title={hasCritical ? 'Restauration bloquée pour protéger vos données' : 'Restaurer cet état'}>
                      <I n="rotate-ccw" s={13}/> {hasCritical ? 'Restauration bloquée' : 'Restaurer cet état'}
                    </Btn>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div style={{padding:20,color:T.text3,fontSize:12,textAlign:'center'}}>Aperçu indisponible</div>
          )}
        </Modal>
      )}

      {/* V1.10.1 — Modal de confirmation Restore (obligatoire) */}
      {snapshotConfirmRestore && (
        <Modal open={true} onClose={()=>!snapshotRestoring && setSnapshotConfirmRestore(null)} title="Revenir à cet état ?" width={460}>
          <div>
            <div style={{padding:'14px 16px',borderRadius:10,background:'#F59E0B08',border:'1px solid #F59E0B30',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                <span style={{fontSize:22}}>⚠</span>
                <div style={{fontSize:13,fontWeight:700,color:T.text}}>Vos données actuelles seront remplacées</div>
              </div>
              <div style={{fontSize:12,color:T.text2,lineHeight:1.5}}>
                Vous reviendrez à l'état de <strong>{fmtSnapshotAgo(snapshotConfirmRestore.createdAt)}</strong>.
                Vos contacts, rendez-vous, statuts pipeline et notes seront remplacés par cet état précédent.
              </div>
              <div style={{fontSize:11,color:'#16A34A',marginTop:8,display:'flex',alignItems:'center',gap:5}}>
                <I n="shield-check" s={12}/> Une sauvegarde de votre état actuel sera créée. Vous pourrez annuler cette action.
              </div>
            </div>

            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <Btn disabled={snapshotRestoring} onClick={()=>setSnapshotConfirmRestore(null)}>Annuler</Btn>
              <Btn primary disabled={snapshotRestoring} onClick={()=>confirmRestoreSnapshot(snapshotConfirmRestore)}>
                {snapshotRestoring ? <Spinner size={12}/> : <I n="check" s={13}/>}
                <span style={{marginLeft:6}}>{snapshotRestoring ? 'Restauration en cours…' : 'Confirmer la restauration'}</span>
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══ STICKY ACTION BAR ═══ */}
      <div style={{position:'fixed',bottom:0,left:(typeof callFormAccordion!=='undefined'?callFormAccordion:null)?._navCollapsed?56:240,right:0,zIndex:9989,padding:'8px 16px',background:T.surface+'EE',backdropFilter:'blur(12px)',borderTop:'1px solid '+T.border,display:'flex',justifyContent:'center',gap:6,transition:'left .2s ease'}}>
        {[
          {icon:'phone-call',label:'Appeler',color:'#22C55E',action:()=>setPortalTab('phone')},
          {icon:'calendar-plus',label:'RDV',color:'#0EA5E9',action:()=>{setPhoneScheduleForm({contactId:'',contactName:'',number:'',date:new Date().toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true});setPhoneShowScheduleModal(true);}},
          {icon:'message-square',label:'SMS',color:'#7C3AED',action:()=>setPortalTab('phone')},
          {icon:'user-plus',label:'Contact',color:'#3B82F6',action:()=>setShowNewContact(true)},
          ...(collab.ai_copilot_enabled?[{icon:'cpu',label:'IA',color:'#F97316',action:()=>setShowIaWidget(p=>!p)}]:[]),
        ].map((btn,i)=>(
          <div key={i} onClick={btn.action} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'6px 14px',borderRadius:10,cursor:'pointer',background:'transparent',border:'1px solid transparent',transition:'all .15s',minWidth:52}} onMouseEnter={e=>{e.currentTarget.style.background=btn.color+'12';e.currentTarget.style.borderColor=btn.color+'30';}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='transparent';}}>
            <I n={btn.icon} s={18} style={{color:btn.color}}/>
            <span style={{fontSize:8,fontWeight:700,color:btn.color}}>{btn.label}</span>
          </div>
        ))}
      </div>

      {/* ═══ IA PROACTIVE WIDGET ═══ */}
      {(typeof showIaWidget!=='undefined'?showIaWidget:null) && collab.ai_copilot_enabled && (()=>{
        const todayISO2=new Date().toISOString().split('T')[0];
        const rdvP=(contacts||[]).find(c=>c&&c.assignedTo===collab.id&&c.pipeline_stage==='rdv_programme'&&c.next_rdv_date&&c.next_rdv_date<todayISO2); // hotfix 2026-04-23 — null-safe
        const nrpR=(contacts||[]).find(c=>c&&c.assignedTo===collab.id&&c.pipeline_stage==='nrp'&&c.nrp_next_relance&&c.nrp_next_relance<=todayISO2); // hotfix 2026-04-23 — null-safe
        const inact=(contacts||[]).find(c=>c&&c.assignedTo===collab.id&&!['perdu','client_valide'].includes(c.pipeline_stage)&&c.lastVisit&&Math.floor((Date.now()-new Date(c.lastVisit).getTime())/86400000)>=14); // hotfix 2026-04-23 — null-safe
        const first=rdvP||nrpR||inact;
        const msg=rdvP?`Qualifiez ${rdvP.name} — RDV passé`:nrpR?`Relancez ${nrpR.name} — NRP`:inact?`${inact.name} inactif depuis 14+ jours`:'Tout est à jour !';
        const color=rdvP?'#F97316':nrpR?'#EF4444':inact?'#F59E0B':'#22C55E';
        return <div style={{position:'fixed',bottom:72,right:20,width:320,zIndex:9991,borderRadius:14,background:T.card,border:'1.5px solid #7C3AED30',boxShadow:'0 12px 40px rgba(124,58,237,0.15)',padding:16,animation:'fadeInScale .2s ease'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <div style={{width:28,height:28,borderRadius:8,background:'#7C3AED15',display:'flex',alignItems:'center',justifyContent:'center'}}><I n="cpu" s={14} style={{color:'#7C3AED'}}/></div>
            <span style={{fontSize:12,fontWeight:700,color:'#7C3AED',flex:1}}>Copilot IA</span>
            <div onClick={()=>setShowIaWidget(false)} style={{cursor:'pointer',padding:2}}><I n="x" s={14} style={{color:T.text3}}/></div>
          </div>
          <div style={{padding:'8px 10px',borderRadius:8,background:color+'08',border:'1px solid '+color+'25',marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:T.text}}>{msg}</div>
          </div>
          {first && <div onClick={()=>{setShowIaWidget(false);if(rdvP){const liveRdv2=(bookings||[]).find(b=>b.contactId===first.id&&b.status==='confirmed');setRdvPasseModal({contact:first,rdvDate:liveRdv2?.date||first.next_rdv_date,bookingId:liveRdv2?.id});}else if(first.phone){if(typeof startVoipCall==='function')startVoipCall(first.phone,first);else window.open('tel:'+first.phone);}}} style={{width:'100%',padding:'8px 0',borderRadius:8,background:'#7C3AED',color:'#fff',fontSize:11,fontWeight:700,textAlign:'center',cursor:'pointer'}}>Exécuter l'action</div>}
        </div>;
      })()}

      {upcomingRdvs.length>0 && (
        <div style={{position:'fixed',bottom:56,left:0,right:0,zIndex:9990,background:T.card,borderTop:'2px solid #0EA5E9',boxShadow:'0 -4px 20px rgba(0,0,0,0.1)',padding:'8px 20px',display:'flex',gap:12,alignItems:'center',overflowX:'auto'}}>
          <I n="bell" s={16} style={{color:'#0EA5E9',flexShrink:0}}/>
          <span style={{fontSize:10,fontWeight:700,color:T.text3,flexShrink:0}}>RDV</span>
          {upcomingRdvs.filter(b=>!(typeof rdvCountdownDismissed!=='undefined'?rdvCountdownDismissed:{}).has(b.id)).slice(0,4).map(b=>{
            const mins=b._diffMin;const isPast=mins<0;const isUrgent=mins<=5&&mins>=0;const isSoon=mins<=15&&mins>5;
            return(
              <div key={b.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',borderRadius:10,background:isPast?'#EF444410':isUrgent?'#F59E0B10':isSoon?'#F59E0B08':'#0EA5E910',border:`1px solid ${isPast?'#EF444430':isUrgent?'#F59E0B30':isSoon?'#F59E0B20':'#0EA5E930'}`,flexShrink:0}}>
                <span style={{fontSize:12,fontWeight:700,color:isPast?'#EF4444':isUrgent?'#F59E0B':'#0EA5E9'}}>{b.time}</span>
                <span style={{fontSize:12,fontWeight:600,color:T.text,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.visitorName}</span>
                <span style={{fontSize:11,fontWeight:800,color:isPast?'#EF4444':isUrgent?'#F59E0B':'#0EA5E9'}}>
                  {isPast?`Passé ${Math.abs(mins)}min`:mins===0?'MAINTENANT':`${mins}min`}
                </span>
                {isPast && (
                  <div style={{display:'flex',gap:3}}>
                    {[['Terminé','#22C55E'],['Reporté','#F59E0B'],['Annulé','#EF4444']].map(([label,clr])=>(
                      <div key={label} onClick={()=>{
                        if(label==='Annulé'){cancelBookingAndCascade(b.id);}
                        else if(label==='Terminé'){updateBooking(b.id,{status:'completed'});if(b.contactId){handleCollabUpdateContact(b.contactId,{rdv_status:'rdv_passe'});handlePipelineStageChange(b.contactId,'client_valide','RDV terminé');}}
                        else if(label==='Reporté'&&b.contactId){handleCollabUpdateContact(b.contactId,{rdv_status:'rdv_en_attente'});setPhoneScheduleForm({contactId:b.contactId,contactName:(contacts||[]).find(c=>c.id===b.contactId)?.name||b.visitorName,number:b.visitorPhone||'',date:'',time:'',duration:b.duration||30,notes:'',calendarId:b.calendarId||'',_bookingMode:true});setPhoneShowScheduleModal(true);}
                        setRdvCountdownDismissed(prev=>new Set([...prev,b.id]));showNotif('RDV: '+label);
                      }} style={{padding:'2px 6px',borderRadius:5,fontSize:9,fontWeight:700,cursor:'pointer',background:clr,color:'#fff'}}>{label}</div>
                    ))}
                  </div>
                )}

    
              </div>
            );
          })}
        </div>
      )}

{/* ═══ COCKPIT — Bouton flottant ouvre BANNIÈRE FLOTTANTE BASSE (fullscreen désactivé) ═══ */}
{/* V1.9 UX FIX bug 2 — Bouton Cockpit RÉACTIVÉ, pointe désormais sur bannière flottante basse (overlay non-bloquant). Fullscreen conservé en code mais rendu désactivé (false &&). Ne jamais rouvrir le fullscreen. */}
    {voipState === 'in-call' && (typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && !(typeof cockpitOpen!=='undefined'?cockpitOpen:null) && (
      <div onClick={()=>setCockpitOpen(true)} style={{position:'fixed',bottom:24,right:24,zIndex:10002,padding:'10px 18px',borderRadius:14,background:'linear-gradient(135deg,#7C3AED,#2563EB)',color:'#fff',fontSize:13,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:8,boxShadow:'0 4px 20px rgba(124,58,237,.4)',animation:'pulse 2s infinite',border:'2px solid rgba(255,255,255,.3)'}} title="Ouvrir le Copilot (bannière flottante)">
        <I n="cpu" s={18}/> Copilot
        <span style={{fontSize:11,opacity:.8}}>{Math.floor((typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)/60).toString().padStart(2,'0')}:{((typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)%60).toString().padStart(2,'0')}</span>
      </div>
    )}

    {/* V1.9.1 — BANNIÈRE FLOTTANTE BASSE — Centre d'action conversion temps réel : carousel 1-slide + jauges intelligentes par intention + Raccrocher. Overlay non-bloquant (n'occulte pas la colonne droite). PAS de transcription. */}
    {(typeof cockpitOpen!=='undefined'?cockpitOpen:null) && voipState === 'in-call' && (typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && (()=>{
      const pac = (typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) || {};
      const ana = (typeof phoneLiveAnalysis!=='undefined'?phoneLiveAnalysis:null) || {};
      const sentiment = (typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null) || 'neutral';
      const sentEmoji = sentiment==='positive'?'😊':sentiment==='negative'?'😟':'😐';
      const sentColor = sentiment==='positive'?'#22C55E':sentiment==='negative'?'#EF4444':'#F59E0B';
      const ctFromActive = pac.contactId ? contacts.find(c=>c.id===pac.contactId) : null;
      const ctFromNumber = (()=>{ const ph = (pac.number||'').replace(/[^\d]/g,'').slice(-9); if (ph.length<9) return null; return contacts.find(c=>{const cp=(c.phone||c.mobile||'').replace(/[^\d]/g,'').slice(-9);return cp&&cp===ph;}); })();
      const ct = (typeof pipelineRightContact!=='undefined'?pipelineRightContact:null) || ctFromActive || ctFromNumber || { name: 'Contact inconnu', phone: pac.number||'' };
      const ctName = ct.name || 'Contact inconnu';
      const ctPhone = ct.phone || ct.mobile || pac.number || '';
      const timer = (typeof phoneCallTimer!=='undefined'?phoneCallTimer:0) || 0;
      const timerStr = `${Math.floor(timer/60).toString().padStart(2,'0')}:${(timer%60).toString().padStart(2,'0')}`;
      const sseConnected = !!(typeof phoneLiveTranscript!=='undefined'&&phoneLiveTranscript&&phoneLiveTranscript.length>=0);

      // V1.9.1 — Construction des slides du carousel (1 visible à la fois)
      const slides = [];
      const anaSugg = ana && (ana.phraseToSay || ana.nextSuggestion || ana.suggestion);
      if (anaSugg) {
        slides.push({ kind:'analysis', tag:ana.salesTechnique||'', step:ana.step||'', text:anaSugg, action:ana.actionToDo||ana.keyInsight||'', color:'#16A34A', label:'Suggestion IA' });
      }
      const pendingSugs = ((typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:null)||[]).filter(s=>s && s.status==='pending');
      for (const s of pendingSugs) {
        const lbl = s.label || (s.type ? `Détection ${s.type}` : 'Détection');
        const txt = s.phrase || s.message || s.text || lbl;
        slides.push({ kind:'detect', tag:s.type||'', step:'', text:txt, action:'', color:s.color||'#7C3AED', label:lbl });
      }
      const slidesCount = slides.length;
      const safeIdx = slidesCount > 0 ? Math.min((typeof cockpitCarouselIdx!=='undefined'?cockpitCarouselIdx:0), slidesCount-1) : 0;
      const slide = slidesCount > 0 ? slides[safeIdx] : null;

      // V1.9.1 — Handler reset jauge au clic + reset vibration ref
      const consumeIntent = (key) => {
        setCockpitIntentLevels(p => ({...p, [key]: 0}));
        if (cockpitVibrationFiredRef.current) cockpitVibrationFiredRef.current[key] = false;
      };
      const lvl = (typeof cockpitIntentLevels!=='undefined'?cockpitIntentLevels:{accept:0,rdv:0,sms:0,email:0});
      const vib = (typeof cockpitVibrating!=='undefined'?cockpitVibrating:{accept:false,rdv:false,sms:false,email:false});

      // V1.9.1 — CTA DYNAMIQUE CONTEXTUEL : le bouton principal lance L'ACTION la plus pertinente liée à la suggestion active
      const ctValid = ct.id && ct.id !== '__dialer_unknown__';
      const baseLog = () => { try { setPhoneCopilotReactions(p=>({...(p||{}),[(ana.id||'live')+'-'+safeIdx]:true})); }catch{} };
      const appendNote = (label, text) => { if(!ctValid || typeof handleCollabUpdateContact!=='function') return false; const stamp=new Date().toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); const append=`\n[${stamp}] ${label}: ${text}`; handleCollabUpdateContact(ct.id, { notes: (ct.notes||'')+append }); return true; };

      // V1.9.1 — Détection d'intention basée sur le TEXTE de la suggestion (utilisé quand slide.tag est vide ou trop générique, ex: kind='analysis')
      const detectIntentFromText = (rawText) => {
        const txt = (rawText||'').toLowerCase();
        if (!txt) return null;
        if (/(rendez-?vous|\brdv\b|cr[ée]neau|disponibilit[ée]|prendre date|on se voit|on se cale|fixer un|programmer un|planifier un|on bloque|on r[eé]server)/.test(txt)) return 'rdv';
        if (/\b(sms|texto|whatsapp)\b|message court/.test(txt)) return 'sms';
        if (/(plaquette|brochure|documentation|devis|envoyer.*(?:par |en )?(?:mail|email|e-?mail)|envoyez-moi|je vous envoie|par mail|par email)/.test(txt)) return 'email';
        if (/(je signe|on signe|j'?accepte|on y va|c'?est valid[ée]|c'?est conclu|on prend|c'?est bon pour moi|je dis oui|d'?accord)/.test(txt)) return 'accord';
        if (/(qualifier|int[ée]ress[ée]|son besoin|ses besoins|son budget|son projet)/.test(txt)) return 'qualif';
        if (/(objection|trop cher|pas int[ée]ress|r[ée]flechir|hésit|h[ée]sit)/.test(txt)) return 'objection';
        return null;
      };

      // V1.9.1 — Factories d'actions. Règle UX MH : la bannière ne se ferme JAMAIS automatiquement (uniquement sur clic croix ou fin d'appel).
      const makeRdvAction = () => ({ label:'Créer le RDV', icon:'calendar-plus', tip:'Ouvrir le formulaire RDV pré-rempli avec ce contact', kicker:'🔥 Opportunité RDV', action: () => { baseLog(); if(ctValid){ setPhoneScheduleForm({contactId:ct.id,contactName:ctName,number:ctPhone,date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true}); setPhoneShowScheduleModal(true); showNotif('Formulaire RDV ouvert','success'); } else { showNotif('Créez le contact avant de programmer un RDV','info'); } } });
      const makeEmailAction = (mode) => ({ label: mode==='dicte'?'Envoyer email':'Envoyer la plaquette', icon: mode==='dicte'?'mail':'send', tip: mode==='dicte'?'Ouvrir le composeur email avec l\'adresse dictée':'Ouvrir le composeur email pour envoyer la plaquette/document', kicker: mode==='dicte'?'📧 Email dicté':'📎 Demande document', action: () => { baseLog(); const dictee = (slide?.text||'').match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]; const email = (mode==='dicte'?(dictee||ct.email||''):(ct.email||'')); if(email){ const subj = mode==='dicte' ? 'Suite à notre échange' : 'Documentation suite à notre échange'; window.open('mailto:'+email+'?subject='+encodeURIComponent(subj)); showNotif('Email prêt à envoyer ('+email+')','success'); } else { showNotif("Pas d'email valide pour ce contact",'info'); } } });
      const makeSmsAction = () => ({ label:'Envoyer un SMS', icon:'message-square', tip:'Préparer un SMS au contact (panneau droit)', kicker:'📱 Canal SMS', action: () => { baseLog(); setPhoneDialNumber(ctPhone||''); setPhoneRightTab('sms'); if(typeof setPhoneRightCollapsed==='function')setPhoneRightCollapsed(false); showNotif('Composeur SMS ouvert (panneau droit)','success'); } });
      const makeValidateClientAction = () => ({ label:'Passer en client', icon:'check-circle', tip:'Passer le contact en Client Validé', kicker:'✅ Accord client', action: () => { baseLog(); if(ctValid && typeof handleCollabUpdateContact==='function'){ handleCollabUpdateContact(ct.id, { pipeline_stage:'client_valide' }); showNotif('Contact passé en Client Validé','success'); } else { showNotif('Contact requis pour cette action','info'); } } });
      const makeQualifyAction = () => ({ label:'Marquer comme intéressé', icon:'star', tip:'Passer le contact en Intéressé', kicker:'🎯 Lead qualifié', action: () => { baseLog(); if(ctValid && typeof handleCollabUpdateContact==='function'){ handleCollabUpdateContact(ct.id, { pipeline_stage:'qualifie' }); showNotif('Contact passé en Intéressé','success'); } else { showNotif('Contact requis pour cette action','info'); } } });
      const makeObjectionAction = () => ({ label:'Ajouter une objection', icon:'alert-triangle', tip:'Ajouter l\'objection aux notes du contact', kicker:'⚠️ Objection détectée', action: () => { baseLog(); if(!ctValid){ showNotif('Contact requis pour enregistrer la note','info'); return; } if(appendNote(slide?.label||'Objection', slide?.text||'')) showNotif('Objection ajoutée aux notes du contact','success'); else showNotif('Erreur enregistrement note','danger'); } });
      const makeNoteAction = () => ({ label:"Enregistrer l'idée", icon:'edit-3', tip:'Ajouter la suggestion dans les notes visibles du contact', kicker:'📝 Note suggestion', action: () => { baseLog(); if(!ctValid){ showNotif('Contact requis pour enregistrer la note','info'); return; } if(appendNote(slide?.label||'Suggestion IA', slide?.text||'')) showNotif('Suggestion ajoutée aux notes du contact','success'); else showNotif('Erreur enregistrement note','danger'); } });

      const acceptCfg = (()=>{
        const t = (slide?.tag || '').toLowerCase();
        // Pas de slide → fallback "Noter la suggestion" (mais pas d'action possible)
        if (!slide) return makeNoteAction();
        // 1) Mapping par TAG (slides de type 'detect' ont toujours un tag)
        if (slide.kind !== 'analysis') {
          if (/^(rdv|rappel|disponibilite)$/.test(t)) return makeRdvAction();
          if (/^(document|devis)$/.test(t)) return makeEmailAction('plaquette');
          if (/^email_dicte$/.test(t)) return makeEmailAction('dicte');
          if (/^(canal|tel_dicte)$/.test(t)) return makeSmsAction();
          if (/^accord$/.test(t)) return makeValidateClientAction();
          if (/^(interet|qualification|satisfaction|besoin)$/.test(t)) return makeQualifyAction();
          if (/^(objection|insatisfaction)$/.test(t)) return makeObjectionAction();
          // tag présent mais non mappé (note/adresse/decideur/urgence/transfert/recommandation/paiement/entreprise_info/...) → noter
          return makeNoteAction();
        }
        // 2) slide.kind === 'analysis' (suggestion phrase IA pure, pas de tag) → analyse du TEXTE pour détecter l'intention
        const intent = detectIntentFromText((slide.text||'') + ' ' + (slide.action||''));
        if (intent === 'rdv') return makeRdvAction();
        if (intent === 'email') return makeEmailAction('plaquette');
        if (intent === 'sms') return makeSmsAction();
        if (intent === 'accord') return makeValidateClientAction();
        if (intent === 'qualif') return makeQualifyAction();
        if (intent === 'objection') return makeObjectionAction();
        // 3) Aucune intention détectée → noter la suggestion (action concrète + visible)
        return makeNoteAction();
      })();

      // V1.9.1 — Jauge interne (overlay vertical depuis bas) selon level 0..4
      const renderGauge = (level, fillColor) => (
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:`${level*25}%`,background:fillColor,transition:'height 0.6s cubic-bezier(0.22,1,0.36,1)',pointerEvents:'none',zIndex:0,opacity:level>=4?0.95:0.55+level*0.10}}/>
      );

      return (
        <>
          {/* V1.9.1 — Keyframes locaux à la bannière */}
          <style>{`
            @keyframes cockpitBannerSlideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes cockpitCtaGlow { 0%,100% { box-shadow: 0 8px 24px rgba(34,197,94,0.35), 0 0 0 0 rgba(34,197,94,0.45); } 50% { box-shadow: 0 12px 32px rgba(34,197,94,0.50), 0 0 0 8px rgba(34,197,94,0); } }
            @keyframes cockpitDotPulse { 0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34,197,94,0.55); } 50% { transform: scale(1.08); box-shadow: 0 0 0 5px rgba(34,197,94,0); } }
            @keyframes cockpitLoadingDot { 0%,100% { opacity: 0.25; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
            @keyframes cockpitGaugeVibrate { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-2px); } 40% { transform: translateX(2px); } 60% { transform: translateX(-2px); } 80% { transform: translateX(1px); } }
            @keyframes cockpitGaugeReady { 0%,100% { box-shadow: 0 0 0 0 currentColor; } 50% { box-shadow: 0 0 0 3px currentColor; } }
            @keyframes cockpitSlideEnter { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }
            .cockpitBanner { animation: cockpitBannerSlideUp 0.42s cubic-bezier(0.22,1,0.36,1); }
            .cockpitBtn { transition: transform 0.18s cubic-bezier(0.22,1,0.36,1), filter 0.16s ease, box-shadow 0.18s ease; will-change: transform; position: relative; overflow: hidden; }
            .cockpitBtn:hover { transform: translateY(-2px); filter: brightness(1.07); }
            .cockpitBtn:active { transform: translateY(0) scale(0.97); filter: brightness(0.94); }
            .cockpitCtaPrimary { animation: cockpitCtaGlow 2.6s ease-in-out infinite; }
            .cockpitDotLive { animation: cockpitDotPulse 2.2s ease-in-out infinite; }
            .cockpitClose:hover { background: rgba(239,68,68,0.10) !important; color: #DC2626 !important; border-color: rgba(239,68,68,0.30) !important; }
            .cockpitHangup:hover { background: linear-gradient(135deg,#DC2626,#991B1B) !important; }
            .cockpitVibrate { animation: cockpitGaugeVibrate 0.5s ease both; }
            .cockpitGaugeReady { animation: cockpitGaugeReady 1.4s ease-in-out infinite; }
            .cockpitArrow { transition: background 0.15s, color 0.15s; }
            .cockpitArrow:hover { background: rgba(15,23,42,0.06); color: #0F172A; }
            .cockpitSlide { animation: cockpitSlideEnter 0.32s cubic-bezier(0.22,1,0.36,1); }
          `}</style>
          <div className="cockpitBanner" style={{position:'fixed',bottom:0,left:0,right:0,zIndex:10001,pointerEvents:'auto',padding:'18px 24px 20px',background:'linear-gradient(135deg, rgba(255,255,255,0.84) 0%, rgba(248,250,255,0.88) 50%, rgba(245,243,255,0.86) 100%)',backdropFilter:'blur(24px) saturate(180%)',WebkitBackdropFilter:'blur(24px) saturate(180%)',borderTop:'1px solid rgba(124,58,237,0.20)',borderRadius:'20px 20px 0 0',boxShadow:'0 -14px 48px rgba(124,58,237,0.16), 0 -2px 12px rgba(15,23,42,0.06)',display:'flex',alignItems:'stretch',gap:22}}>

            {/* ZONE 1 — Statut Copilot + Timer + Contact */}
            <div style={{display:'flex',flexDirection:'column',gap:8,minWidth:200,maxWidth:220,flexShrink:0,paddingRight:20,borderRight:'1px solid rgba(15,23,42,0.07)',justifyContent:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:9}}>
                <div style={{width:32,height:32,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#7C3AED 0%,#2563EB 100%)',boxShadow:'0 3px 10px rgba(124,58,237,0.32)'}}>
                  <I n="cpu" s={16} style={{color:'#fff'}}/>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{fontSize:11,fontWeight:800,color:'#7C3AED',letterSpacing:0.4}}>COPILOT</span>
                    <span className={sseConnected?'cockpitDotLive':''} style={{width:6,height:6,borderRadius:3,background:sseConnected?'#22C55E':'#9CA3AF'}}/>
                  </div>
                  <span style={{fontSize:8,fontWeight:800,color:sseConnected?'#16A34A':'#94A3B8',letterSpacing:0.6,textTransform:'uppercase'}}>{sseConnected?'En direct':'Hors ligne'}</span>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:24,fontWeight:800,fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace',color:'#0F172A',letterSpacing:0.4,lineHeight:1}}>{timerStr}</span>
                <span style={{fontSize:18,lineHeight:1}}>{sentEmoji}</span>
                <span style={{fontSize:9,fontWeight:800,padding:'3px 8px',borderRadius:5,background:sentColor+'15',color:sentColor,letterSpacing:0.5,textTransform:'uppercase'}}>{sentiment==='positive'?'Positif':sentiment==='negative'?'Négatif':'Neutre'}</span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:1,minWidth:0}}>
                <div style={{fontSize:11,color:'#334155',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ctName}</div>
                <div style={{fontSize:10,color:'#94A3B8',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ctPhone}</div>
              </div>
            </div>

            {/* ZONE 2 — CAROUSEL suggestion (1 slide visible) */}
            <div style={{flex:1,display:'flex',alignItems:'center',gap:8,minWidth:0}}>
              {/* Flèche gauche */}
              <div className="cockpitArrow" onClick={()=>{ if(slidesCount<=1) return; setCockpitCarouselIdx(p => (p-1+slidesCount)%slidesCount); }} style={{width:30,height:30,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',cursor:slidesCount>1?'pointer':'default',color:slidesCount>1?'#64748B':'#CBD5E1',flexShrink:0,opacity:slidesCount>1?1:0.4}} title="Suggestion précédente">
                <I n="chevron-left" s={18}/>
              </div>

              {/* Slide content */}
              <div style={{flex:1,display:'flex',flexDirection:'column',gap:8,minWidth:0,justifyContent:'center'}} key={'slide-'+safeIdx} className={slide?'cockpitSlide':''}>
                {slide ? (
                  <>
                    <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
                      <span style={{fontSize:9,fontWeight:800,color:slide.color,textTransform:'uppercase',letterSpacing:0.8,padding:'3px 9px',borderRadius:5,background:slide.color+'12',border:'1px solid '+slide.color+'30',display:'inline-flex',alignItems:'center',gap:5}}>{slide.kind==='analysis'?'💬 '+slide.label:'⚡ '+slide.label}</span>
                      {slide.tag && <span style={{fontSize:9,fontWeight:700,color:'#7C3AED',padding:'3px 8px',borderRadius:5,background:'rgba(124,58,237,0.08)',letterSpacing:0.3}}>{slide.tag}</span>}
                      {slide.step && <span style={{fontSize:9,fontWeight:600,color:'#64748B',letterSpacing:0.3}}>· {slide.step}</span>}
                      {slidesCount>1 && <span style={{fontSize:9,fontWeight:700,color:'#94A3B8',marginLeft:'auto',padding:'2px 7px',borderRadius:5,background:'rgba(15,23,42,0.04)'}}>{safeIdx+1}/{slidesCount}</span>}
                    </div>
                    <div style={{fontSize:20,fontWeight:700,color:'#0F172A',lineHeight:1.32,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',letterSpacing:-0.25}}>« {slide.text} »</div>
                    {slide.action && (
                      <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12.5,color:'#B45309',fontWeight:700}}>
                        <span style={{display:'flex',alignItems:'center',justifyContent:'center',width:22,height:22,borderRadius:6,background:'linear-gradient(135deg,#FEF3C7 0%,#FDE68A 100%)',flexShrink:0}}>
                          <I n="zap" s={12} style={{color:'#D97706'}}/>
                        </span>
                        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{slide.action}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{display:'flex',alignItems:'center',gap:12,padding:'8px 0'}}>
                    <div style={{display:'flex',gap:5,alignItems:'center'}}>
                      {[0,1,2].map(i=><span key={i} style={{width:7,height:7,borderRadius:4,background:'#7C3AED',animation:'cockpitLoadingDot 1.4s ease-in-out infinite',animationDelay:(i*0.16)+'s'}}/>)}
                    </div>
                    <span style={{fontSize:13.5,color:'#475569',fontStyle:'italic',fontWeight:500,letterSpacing:-0.1}}>L'IA analyse l'appel… les suggestions arrivent</span>
                  </div>
                )}
              </div>

              {/* Flèche droite */}
              <div className="cockpitArrow" onClick={()=>{ if(slidesCount<=1) return; setCockpitCarouselIdx(p => (p+1)%slidesCount); }} style={{width:30,height:30,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',cursor:slidesCount>1?'pointer':'default',color:slidesCount>1?'#64748B':'#CBD5E1',flexShrink:0,opacity:slidesCount>1?1:0.4}} title="Suggestion suivante">
                <I n="chevron-right" s={18}/>
              </div>
            </div>

            {/* ZONE 3 — CTA dominant Accepter + secondaires (jauges) + Raccrocher + close */}
            <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
              {/* CTA PRIMAIRE DYNAMIQUE — action contextuelle pilotée par acceptCfg (label + icône + kicker + action selon slide active) */}
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,minWidth:178}}>
                <span style={{fontSize:9,fontWeight:800,color:lvl.accept>=3?'#DC2626':'#7C3AED',textTransform:'uppercase',letterSpacing:0.6,padding:'2px 8px',borderRadius:5,background:lvl.accept>=3?'rgba(220,38,38,0.08)':'rgba(124,58,237,0.06)',border:'1px solid '+(lvl.accept>=3?'rgba(220,38,38,0.18)':'rgba(124,58,237,0.12)'),whiteSpace:'nowrap'}}>{lvl.accept>=3?'🔥 Action prioritaire':acceptCfg.kicker}</span>
                <div className={'cockpitBtn cockpitCtaPrimary'+(vib.accept?' cockpitVibrate':'')+(lvl.accept>=3?' cockpitGaugeReady':'')} onClick={()=>{ consumeIntent('accept'); acceptCfg.action(); }} style={{padding:'14px 22px',borderRadius:13,background:'linear-gradient(135deg,#22C55E 0%,#15803D 100%)',color:'#fff',fontSize:14,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:8,letterSpacing:0.2,border:'1px solid rgba(34,197,94,0.50)',width:'100%',justifyContent:'center'}} title={acceptCfg.tip}>
                  {renderGauge(lvl.accept, 'rgba(255,255,255,0.18)')}
                  <I n={acceptCfg.icon} s={17} style={{position:'relative',zIndex:1}}/>
                  <span key={acceptCfg.label} className="cockpitSlide" style={{position:'relative',zIndex:1,whiteSpace:'nowrap'}}>{acceptCfg.label}</span>
                </div>
              </div>

              <div style={{width:1,height:30,background:'rgba(15,23,42,0.08)',margin:'0 2px'}}/>

              {/* CTA secondaires — outline soft (RDV / SMS / Email) avec jauges intelligentes */}
              <div style={{display:'flex',gap:6}}>
                {/* RDV — couleur jaune/orange */}
                <div className={'cockpitBtn'+(vib.rdv?' cockpitVibrate':'')+(lvl.rdv>=3?' cockpitGaugeReady':'')} onClick={()=>{ consumeIntent('rdv'); if(ct.id && ct.id!=='__dialer_unknown__'){ setPhoneScheduleForm({contactId:ct.id,contactName:ctName,number:ctPhone,date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'10:00',duration:30,notes:'',calendarId:(calendars||[])[0]?.id||'',_bookingMode:true}); setPhoneShowScheduleModal(true); } else { showNotif('Créez le contact avant de programmer un RDV','info'); } }} style={{padding:'10px 13px',borderRadius:10,background:'rgba(245,158,11,0.08)',color:'#B45309',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:5,border:'1px solid rgba(245,158,11,0.32)'}} title={lvl.rdv>=3?'Action prioritaire — RDV demandé plusieurs fois':'Planifier un RDV'}>
                  {renderGauge(lvl.rdv, 'rgba(245,158,11,0.20)')}
                  <I n="calendar-plus" s={13} style={{position:'relative',zIndex:1}}/>
                  <span style={{position:'relative',zIndex:1}}>RDV</span>
                </div>
                {/* SMS — couleur bleue */}
                <div className={'cockpitBtn'+(vib.sms?' cockpitVibrate':'')+(lvl.sms>=3?' cockpitGaugeReady':'')} onClick={()=>{ consumeIntent('sms'); setPhoneDialNumber(ctPhone||''); setPhoneRightTab('sms'); if(typeof setPhoneRightCollapsed==='function')setPhoneRightCollapsed(false); }} style={{padding:'10px 13px',borderRadius:10,background:'rgba(14,165,233,0.08)',color:'#0369A1',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:5,border:'1px solid rgba(14,165,233,0.32)'}} title={lvl.sms>=3?'Action prioritaire — canal SMS demandé':'Envoyer un SMS'}>
                  {renderGauge(lvl.sms, 'rgba(14,165,233,0.20)')}
                  <I n="message-square" s={13} style={{position:'relative',zIndex:1}}/>
                  <span style={{position:'relative',zIndex:1}}>SMS</span>
                </div>
                {/* Email — couleur violet/indigo */}
                <div className={'cockpitBtn'+(vib.email?' cockpitVibrate':'')+(lvl.email>=3?' cockpitGaugeReady':'')} onClick={()=>{ consumeIntent('email'); const email = ct.email||''; if(email){ window.open('mailto:'+email); } else { showNotif("Pas d'email pour ce contact",'info'); } }} style={{padding:'10px 13px',borderRadius:10,background:'rgba(99,102,241,0.08)',color:'#4338CA',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:5,border:'1px solid rgba(99,102,241,0.32)'}} title={lvl.email>=3?'Action prioritaire — document/email demandé':'Envoyer un email'}>
                  {renderGauge(lvl.email, 'rgba(99,102,241,0.20)')}
                  <I n="mail" s={13} style={{position:'relative',zIndex:1}}/>
                  <span style={{position:'relative',zIndex:1}}>Email</span>
                </div>
              </div>

              <div style={{width:1,height:30,background:'rgba(15,23,42,0.08)',margin:'0 2px'}}/>

              {/* RACCROCHER — bouton rouge prominent (action critique) */}
              <div className="cockpitBtn cockpitHangup" onClick={()=>{ try{ endPhoneCall(); }catch(e){ console.warn('hangup error',e); } }} style={{padding:'12px 16px',borderRadius:11,background:'linear-gradient(135deg,#EF4444 0%,#B91C1C 100%)',color:'#fff',fontSize:12,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:6,boxShadow:'0 4px 14px rgba(239,68,68,0.35)',border:'1px solid rgba(239,68,68,0.50)',letterSpacing:0.2}} title="Raccrocher l'appel">
                <I n="phone-off" s={14}/>
                <span>Raccrocher</span>
              </div>

              {/* Close discret */}
              <div className="cockpitBtn cockpitClose" onClick={()=>setCockpitOpen(false)} style={{width:32,height:32,borderRadius:10,background:'rgba(15,23,42,0.04)',color:'#64748B',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',marginLeft:2,border:'1px solid rgba(15,23,42,0.08)'}} title="Fermer la bannière"><I n="x" s={15}/></div>
            </div>
          </div>
        </>
      );
    })()}

    {/* V1.9 UX FIX bug 2 — Fullscreen Cockpit DÉSACTIVÉ (false &&) — code conservé pour archive. Ne jamais réactiver — utiliser bannière flottante basse ci-dessus. */}
    {false && (typeof cockpitOpen!=='undefined'?cockpitOpen:null) && (typeof voipState!=='undefined'?voipState:null) === 'in-call' && (typeof phoneActiveCall!=='undefined'?phoneActiveCall:null) && !(typeof cockpitMinimized!=='undefined'?cockpitMinimized:null) && (()=>{
      const ct = (typeof pipelineRightContact!=='undefined'?pipelineRightContact:null) || contacts.find(c=>c.id===(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).contactId) || {};
      const ctBookings = (bookings||[]).filter(b=>b.contactId===ct.id&&b.status!=='cancelled').sort((a,b)=>new Date(a.date+'T'+(a.time||'00:00'))-new Date(b.date+'T'+(b.time||'00:00')));
      const futureBookings = ctBookings.filter(b=>new Date(b.date+'T'+(b.time||'00:00'))>new Date());
      const pastBookings = ctBookings.filter(b=>new Date(b.date+'T'+(b.time||'00:00'))<=new Date()).slice(-3);
      const stageInfo = PIPELINE_STAGES.find(s=>s.id===(ct.pipeline_stage||'nouveau')) || PIPELINE_STAGES[0];
      const steps = ['Accroche','Découverte','Présentation','Objections','Closing'];
      const sentiment = (typeof phoneLiveSentiment!=='undefined'?phoneLiveSentiment:null) || 'neutral';
      const sentEmoji = sentiment==='positive'?'😊':sentiment==='negative'?'😟':'😐';
      const smsEvts = (typeof phoneLiveTranscript!=='undefined'?phoneLiveTranscript:null) || [];
      const analysis = (typeof phoneLiveAnalysis!=='undefined'?phoneLiveAnalysis:null) || {};
      const suggestions = ((typeof phoneLiveSuggestions!=='undefined'?phoneLiveSuggestions:null)||[]).filter(s=>s.status==='pending').slice(0,8);

      return <div style={{position:'fixed',top:'3vh',left:'3vw',width:'94vw',height:'92vh',zIndex:10003,borderRadius:20,background:'#FFFFFF',boxShadow:'0 8px 60px rgba(0,0,0,.25)',display:'flex',flexDirection:'column',overflow:'hidden',border:'2px solid #E5E7EB'}}>

        {/* ═══ HEADER ═══ */}
        <div style={{flexShrink:0,background:'linear-gradient(135deg,#7C3AED,#2563EB)',padding:'10px 20px',display:'flex',alignItems:'center',gap:12}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
            <I n="monitor" s={18} style={{color:'#fff'}}/>
            <span style={{fontSize:15,fontWeight:800,color:'#fff'}}>Cockpit</span>
            <span style={{padding:'2px 8px',borderRadius:6,background:'rgba(255,255,255,.2)',color:'#fff',fontSize:11,fontWeight:600}}>{ct.name||'Contact'}</span>
            <span style={{fontSize:11,color:'rgba(255,255,255,.7)'}}>{displayPhone((typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).number)}</span>
            <span style={{padding:'2px 8px',borderRadius:6,background:stageInfo.color+'30',color:'#fff',fontSize:10,fontWeight:600}}>{stageInfo.label}</span>
            <span style={{fontSize:16}}>{sentEmoji}</span>
          </div>
          {/* Timer */}
          <div style={{padding:'4px 14px',borderRadius:8,background:'rgba(255,255,255,.15)',display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:8,height:8,borderRadius:4,background:'#22C55E',animation:'pulse 1.5s infinite'}}/>
            <span style={{fontSize:20,fontWeight:800,color:'#fff',fontFamily:'monospace'}}>{Math.floor((typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)/60).toString().padStart(2,'0')}:{((typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)%60).toString().padStart(2,'0')}</span>
          </div>
          {/* Steps */}
          <div style={{display:'flex',gap:3}}>
            {steps.map((s,i)=><div key={s} style={{padding:'3px 8px',borderRadius:6,fontSize:9,fontWeight:700,background:i<=(typeof phoneCopilotLiveStep!=='undefined'?phoneCopilotLiveStep:null)?'rgba(255,255,255,.3)':'rgba(255,255,255,.08)',color:i<=(typeof phoneCopilotLiveStep!=='undefined'?phoneCopilotLiveStep:null)?'#fff':'rgba(255,255,255,.4)'}}>{s}</div>)}
          </div>
          {/* Controls */}
          <div style={{display:'flex',gap:4}}>
            <div onClick={()=>setCockpitMinimized(true)} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'rgba(255,255,255,.15)'}}><I n="minimize-2" s={14} style={{color:'#fff'}}/></div>
            <div onClick={()=>setCockpitOpen(false)} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'rgba(255,255,255,.15)'}}><I n="x" s={14} style={{color:'#fff'}}/></div>
          </div>
        </div>

        {/* ═══ 3 COLUMNS ═══ */}
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>

          {/* ── COL 1: Fiche Contact + Agenda ── */}
          <div style={{width:'28%',borderRight:'1px solid #E5E7EB',overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:12}}>
            {/* Contact card */}
            <div style={{padding:14,borderRadius:12,background:'#F9FAFB',border:'1px solid #E5E7EB'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <div style={{width:44,height:44,borderRadius:12,background:stageInfo.color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:stageInfo.color}}>{(ct.name||'?')[0]?.toUpperCase()}</div>
                <div>
                  <div style={{fontSize:14,fontWeight:800,color:'#1F2937'}}>{ct.name||'Contact inconnu'}</div>
                  <div style={{fontSize:11,color:'#6B7280'}}>{displayPhone(ct.phone||(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).number)}</div>
                  {ct.email && <div style={{fontSize:10,color:'#9CA3AF'}}>{ct.email}</div>}
                </div>
              </div>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                <span style={{padding:'2px 8px',borderRadius:5,background:stageInfo.color+'15',color:stageInfo.color,fontSize:10,fontWeight:600}}>{stageInfo.label}</span>
                {ct.rating>0 && <span style={{fontSize:10}}>{'⭐'.repeat(ct.rating)}</span>}
                {(ct.tags||[]).slice(0,3).map((t,i)=><span key={i} style={{padding:'2px 6px',borderRadius:4,background:'#EFF6FF',color:'#2563EB',fontSize:9,fontWeight:600}}>{t}</span>)}
              </div>
            </div>

            {/* V1.8.13 — Badges cross-collab */}
            {(()=>{
              const _isOwner = ct.assignedTo === collab.id;
              const _shared = Array.isArray(ct.shared_with) ? ct.shared_with : [];
              const _sharedHere = _shared.includes(collab.id) && !_isOwner;
              const _capName = (n) => { const s = String(n||'').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'; };
              if (_sharedHere) {
                const _ownerName = (collabs||[]).find(_c => _c.id === ct.assignedTo)?.name || ct.assignedTo;
                return <div style={{padding:'4px 8px',borderRadius:6,background:'#3B82F614',border:'1px solid #3B82F635',color:'#1E40AF',fontSize:10,fontWeight:600,marginBottom:6,display:'flex',alignItems:'center',gap:4}}>
                  <span>🤝</span> Apporté à <b style={{marginLeft:2}}>{_capName(_ownerName)}</b> · lecture seule
                </div>;
              }
              if (_isOwner && _shared.filter(_id => _id !== collab.id).length > 0) {
                const _firstSharer = _shared.find(_id => _id !== collab.id);
                const _sharerName = (collabs||[]).find(_c => _c.id === _firstSharer)?.name || _firstSharer;
                const _extra = _shared.filter(_id => _id !== collab.id).length - 1;
                return <div style={{padding:'4px 8px',borderRadius:6,background:'#F9731614',border:'1px solid #F9731635',color:'#9A3412',fontSize:10,fontWeight:600,marginBottom:6,display:'flex',alignItems:'center',gap:4}}>
                  <span>🤝</span> Transmis par <b style={{marginLeft:2}}>{_capName(_sharerName)}</b>{_extra > 0 ? ' +' + _extra : ''}
                </div>;
              }
              return null;
            })()}
            {/* Pipeline change */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#6B7280',marginBottom:4}}>Changer étape</div>
              <select value={ct.pipeline_stage||'nouveau'} disabled={ct.assignedTo && ct.assignedTo !== collab.id && !(collab?.role === 'admin' || collab?.role === 'supra' || isAdminView)} onChange={e=>{if(typeof handlePipelineStageChange==='function')handlePipelineStageChange(ct.id,e.target.value);}} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #E5E7EB',fontSize:11,color:'#1F2937',background:'#fff',opacity:(ct.assignedTo && ct.assignedTo !== collab.id && !(collab?.role === 'admin' || collab?.role === 'supra' || isAdminView))?0.55:1,cursor:(ct.assignedTo && ct.assignedTo !== collab.id && !(collab?.role === 'admin' || collab?.role === 'supra' || isAdminView))?'not-allowed':'pointer'}}>
                {PIPELINE_STAGES.map(s=><option key={s.id} value={s.id}>{PIPELINE_LABELS[s.id]||s.label}</option>)}
              </select>
            </div>

            {/* Agenda / Bookings */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:'#1F2937',marginBottom:6,display:'flex',alignItems:'center',gap:4}}><I n="calendar" s={12} style={{color:'#0EA5E9'}}/> Agenda</div>
              {futureBookings.length===0 && pastBookings.length===0 && <div style={{fontSize:10,color:'#9CA3AF',padding:8}}>Aucun RDV pour ce contact</div>}
              {futureBookings.map(b=><div key={b.id} style={{padding:'6px 8px',borderRadius:6,background:'#ECFDF5',border:'1px solid #A7F3D0',marginBottom:4,fontSize:10}}>
                <div style={{fontWeight:700,color:'#065F46'}}>📅 {formatDateTime(b.date, b.time)}</div>
                <div style={{color:'#047857'}}>{b.duration||30}min{b.notes?' — '+b.notes.substring(0,30):''}</div>
              </div>)}
              {pastBookings.map(b=><div key={b.id} style={{padding:'4px 8px',borderRadius:6,background:'#F9FAFB',marginBottom:3,fontSize:9,color:'#6B7280'}}>
                {formatDateTime(b.date, b.time)} · {b.status||'passé'}
              </div>)}
              <div onClick={()=>{const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).number,date:tomorrow.toISOString().split('T')[0],time:'10:00',notes:'',_bookingMode:true});setPhoneShowScheduleModal(true);}} style={{padding:'6px 10px',borderRadius:6,background:'#EFF6FF',color:'#2563EB',fontSize:10,fontWeight:600,cursor:'pointer',textAlign:'center',marginTop:4,border:'1px solid #BFDBFE'}}>+ Prendre RDV</div>
            </div>

            {/* Recent calls */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:'#1F2937',marginBottom:4,display:'flex',alignItems:'center',gap:4}}><I n="phone" s={12} style={{color:'#22C55E'}}/> Appels récents</div>
              {((typeof voipCallLogs!=='undefined'?voipCallLogs:null)||[]).filter(c=>c.toNumber===ct.phone||c.fromNumber===ct.phone).slice(0,3).map(c=><div key={c.id} style={{padding:'4px 8px',borderRadius:6,background:'#F9FAFB',marginBottom:3,fontSize:9,color:'#6B7280',display:'flex',justifyContent:'space-between'}}>
                <span>{c.direction==='outbound'?'→':'←'} {new Date(c.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</span>
                <span>{c.duration?Math.floor(c.duration/60)+'m'+String(c.duration%60).padStart(2,'0'):'—'}</span>
              </div>)}
            </div>
          </div>

          {/* ── COL 2: Transcription + Coaching ── */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Coaching */}
            <div style={{flexShrink:0,padding:'12px 16px',borderBottom:'1px solid #E5E7EB',background:'#FFFBEB'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <span style={{fontSize:16}}>🎯</span>
                <span style={{fontSize:13,fontWeight:800,color:'#92400E'}}>Coaching commercial</span>
              </div>
              {analysis.phraseToSay && <div style={{padding:'10px 14px',borderRadius:10,background:'linear-gradient(135deg,#F59E0B,#D97706)',color:'#fff',fontSize:14,fontWeight:700,marginBottom:8,lineHeight:1.4}}>💬 {analysis.phraseToSay}</div>}
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {analysis.openQuestion && <div style={{flex:1,minWidth:200,padding:'8px 10px',borderRadius:8,background:'#FEF3C7',border:'1px solid #FCD34D',fontSize:11}}>
                  <div style={{fontWeight:700,color:'#92400E',marginBottom:2}}>❓ Question ouverte</div>
                  <div style={{color:'#78350F'}}>{analysis.openQuestion}</div>
                </div>}
                {analysis.detectedObjection && <div style={{flex:1,minWidth:200,padding:'8px 10px',borderRadius:8,background:'#FEE2E2',border:'1px solid #FCA5A5',fontSize:11}}>
                  <div style={{fontWeight:700,color:'#991B1B',marginBottom:2}}>⚠️ Objection</div>
                  <div style={{color:'#7F1D1D'}}>{analysis.detectedObjection}</div>
                  {analysis.objectionResponse && <div style={{marginTop:4,padding:'4px 8px',borderRadius:6,background:'#DCFCE7',color:'#166534',fontWeight:600}}>✅ {analysis.objectionResponse}</div>}
                </div>}
              </div>
              {analysis.actionToDo && <div style={{marginTop:6,padding:'6px 10px',borderRadius:6,background:'#EFF6FF',border:'1px solid #BFDBFE',fontSize:11,color:'#1E40AF'}}>📌 {analysis.actionToDo}</div>}
            </div>
            {/* Transcription */}
            <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:4,background:'#EF4444',animation:'pulse 1.5s infinite'}}/>
                <span style={{fontSize:12,fontWeight:700,color:'#1F2937'}}>Transcription live</span>
              </div>
              {smsEvts.length===0 && <div style={{textAlign:'center',padding:20,fontSize:11,color:'#9CA3AF'}}>En attente de parole...</div>}
              {smsEvts.map((ev,i)=>{
                const isMe = ev.speaker==='me'||ev.speaker==='collab';
                return <div key={i} style={{display:'flex',flexDirection:'column',alignItems:isMe?'flex-end':'flex-start',marginBottom:6}}>
                  <div style={{fontSize:8,fontWeight:600,color:isMe?'#2563EB':'#6B7280',marginBottom:2}}>{isMe?'Vous':'Contact'}</div>
                  <div style={{maxWidth:'80%',padding:'8px 12px',borderRadius:isMe?'12px 12px 3px 12px':'12px 12px 12px 3px',background:isMe?'linear-gradient(135deg,#2563EB,#3B82F6)':'#F3F4F6',color:isMe?'#fff':'#1F2937',fontSize:12,lineHeight:1.5}}>{ev.text}</div>
                </div>;
              })}
            </div>
          </div>

          {/* ── COL 3: Suggestions + Actions + Notes ── */}
          <div style={{width:'28%',borderLeft:'1px solid #E5E7EB',overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:12}}>
            {/* Suggestions live */}
            {suggestions.length>0 && <div>
              <div style={{fontSize:11,fontWeight:700,color:'#1F2937',marginBottom:6,display:'flex',alignItems:'center',gap:4}}>✨ Suggestions ({suggestions.length})</div>
              {suggestions.map((s,i)=><div key={s.id||i} style={{padding:'8px 10px',borderRadius:8,background:s.color?s.color+'10':'#F3F4F6',border:'1px solid '+(s.color||'#E5E7EB')+'30',marginBottom:4}}>
                <div style={{fontSize:11,fontWeight:700,color:s.color||'#1F2937'}}>{s.label}</div>
                {s.phrase && <div style={{fontSize:10,color:'#6B7280',marginTop:2}}>"{s.phrase.substring(0,60)}"</div>}
                {s.entities?.date && <div style={{fontSize:9,color:'#059669',marginTop:2}}>📅 {s.entities.date}{s.entities.time?' à '+s.entities.time:''}</div>}
              </div>)}
            </div>}

            {/* Actions rapides */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:'#1F2937',marginBottom:6}}>⚡ Actions rapides</div>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {[
                  {icon:'calendar',label:'Prendre RDV',color:'#0EA5E9',action:()=>{const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);setPhoneScheduleForm({contactId:ct.id,contactName:ct.name,number:ct.phone||(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).number,date:tomorrow.toISOString().split('T')[0],time:'10:00',notes:'',_bookingMode:true});setPhoneShowScheduleModal(true);}},
                  {icon:'message-square',label:'Envoyer SMS',color:'#7C3AED',action:()=>{setPhoneDialNumber(ct.phone||(typeof phoneActiveCall!=='undefined'?phoneActiveCall:{}).number);setPhoneSubTab('sms');}},
                  {icon:'mail',label:'Envoyer Email',color:'#F59E0B',action:()=>{if(ct.email)window.open('mailto:'+ct.email+'?subject=Suivi - '+encodeURIComponent(ct.name||''));}},
                  {icon:'file-text',label:'Formulaire appel',color:'#8B5CF6',action:()=>{setPhoneRightTab('forms');setPhoneRightCollapsed(false);}},
                  {icon:'tag',label:'Ajouter tag',color:'#22C55E',action:()=>{const tag=prompt('Ajouter un tag :');if(tag&&tag.trim()&&ct.id){const newTags=[...(ct.tags||[]),tag.trim()];handleCollabUpdateContact(ct.id,{tags:newTags});showNotif('Tag ajouté');}}},
                ].map(a=><div key={a.label} onClick={a.action} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:8,cursor:'pointer',background:'#F9FAFB',border:'1px solid #E5E7EB',transition:'all .12s'}} onMouseEnter={e=>e.currentTarget.style.background='#EFF6FF'} onMouseLeave={e=>e.currentTarget.style.background='#F9FAFB'}>
                  <div style={{width:26,height:26,borderRadius:6,background:a.color+'15',display:'flex',alignItems:'center',justifyContent:'center'}}><I n={a.icon} s={12} style={{color:a.color}}/></div>
                  <span style={{fontSize:11,fontWeight:600,color:'#1F2937'}}>{a.label}</span>
                </div>)}
              </div>
            </div>

            {/* Notes d'appel */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:'#1F2937',marginBottom:4}}>📝 Notes d'appel</div>
              <textarea value={cockpitNoteText} onChange={e=>(typeof setCockpitNoteText==='function'?setCockpitNoteText:function(){})(e.target.value)} placeholder="Notes pendant l'appel..." rows={5} style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #E5E7EB',background:'#FAFAFA',fontSize:11,color:'#1F2937',outline:'none',resize:'vertical',fontFamily:'inherit',lineHeight:1.4}} onFocus={e=>e.target.style.borderColor='#7C3AED'} onBlur={e=>{e.target.style.borderColor='#E5E7EB';if((typeof cockpitNoteText!=='undefined'?cockpitNoteText:{}).trim()&&ct.id){const dateStr=new Date().toLocaleDateString('fr-FR');const newNotes=(ct.notes?ct.notes+'\n':'')+dateStr+' [Cockpit] : '+(typeof cockpitNoteText!=='undefined'?cockpitNoteText:{}).trim();handleCollabUpdateContact(ct.id,{notes:newNotes});}}}/>
              <div style={{fontSize:8,color:'#9CA3AF',marginTop:2}}>Auto-sauvegardé dans la fiche quand vous quittez le champ</div>
            </div>

            {/* Notes contact existantes */}
            {ct.notes && <div>
              <div style={{fontSize:10,fontWeight:600,color:'#6B7280',marginBottom:3}}>Notes existantes</div>
              <div style={{padding:'6px 8px',borderRadius:6,background:'#F9FAFB',border:'1px solid #E5E7EB',fontSize:10,color:'#4B5563',maxHeight:100,overflowY:'auto',lineHeight:1.4,whiteSpace:'pre-wrap'}}>{ct.notes}</div>
            </div>}
          </div>

        </div>
      </div>;
    })()}

    {/* Cockpit minimized — petit bouton flottant pour restaurer */}
    {(typeof cockpitOpen!=='undefined'?cockpitOpen:null) && (typeof cockpitMinimized!=='undefined'?cockpitMinimized:null) && (typeof voipState!=='undefined'?voipState:null) === 'in-call' && (
      <div onClick={()=>setCockpitMinimized(false)} style={{position:'fixed',bottom:24,right:24,zIndex:10002,padding:'8px 16px',borderRadius:12,background:'linear-gradient(135deg,#7C3AED,#2563EB)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:8,boxShadow:'0 4px 16px rgba(124,58,237,.3)',border:'2px solid rgba(255,255,255,.3)'}}>
        <I n="maximize-2" s={14}/> Cockpit
        <span style={{fontFamily:'monospace',fontSize:13,fontWeight:800}}>{Math.floor((typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)/60).toString().padStart(2,'0')}:{((typeof phoneCallTimer!=='undefined'?phoneCallTimer:null)%60).toString().padStart(2,'0')}</span>
        <div onClick={e=>{e.stopPropagation();setCockpitOpen(false);setCockpitMinimized(false);}} style={{marginLeft:4,width:20,height:20,borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,.2)',cursor:'pointer'}}><I n="x" s={10}/></div>
      </div>
    )}

    </div>
    </CollabProvider>
  );
};

export default CollabPortal;
