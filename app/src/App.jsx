import React, { useState, useCallback, useMemo, useEffect, useRef, Fragment } from "react";
import { Device as TwilioDevice } from '@twilio/voice-sdk';

// Phase 5.5 — tab-scoped state
import { _T } from "./shared/state/tabState";

// Phase 6 — extracted public/client components
import PublicForm from "./features/public/PublicForm";
import ClientPortal from "./features/client/ClientPortal";
import ManageBooking from "./features/public/ManageBooking";
import PublicPage from "./features/public/PublicPage";
import VisitorBooking from "./features/public/VisitorBooking";
import PublicBooking from "./features/public/PublicBooking";
import Landing from "./features/public/Landing";

// Phase 1A extractions
import { T, T_LIGHT, T_DARK, setTheme } from "./theme";
import { formatPhoneFR, displayPhone } from "./shared/utils/phone";
import { isValidEmail, isValidPhone } from "./shared/utils/validators";
import { COMMON_TIMEZONES, genCode } from "./shared/utils/constants";

// Phase 1B — UI atomics barrel
import { HookIsolator, Logo, I, Avatar, Badge, Btn, Stars, Toggle, LoadBar, Card, Spinner, Req, Skeleton, Input, Stat, Modal, ConfirmModal, EmptyState, HelpTip, ValidatedInput, ErrorBoundary } from "./shared/ui";

// Phase 2 — pure data & utils extractions
import { DAYS_FR, DAYS_SHORT, MONTHS_FR, getDow, fmtDate } from "./shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES } from "./shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "./shared/utils/notifications";
import { COMPANIES, INIT_COLLABS, defAvail, INIT_AVAILS, INIT_CALS, INIT_BOOKINGS, INIT_WORKFLOWS, INIT_ROUTING, INIT_POLLS, INIT_CONTACTS, COMPANY_SETTINGS, INIT_ALL_COMPANIES, INIT_ALL_USERS, INIT_ACTIVITY_LOG } from "./data/fixtures";

// Phase 3 — API service
import { API_BASE, recUrl, collectEnv, api, getAutoTicketCompanyId, setAutoTicketCompanyId } from "./shared/services/api";

// Phase 4 — extracted screens
import {
  FicheClientMsgScreen,
  FicheSuiviScreen,
  FicheDocsLinkedScreen,
  CollabSignalementsScreen,
  FicheDocsPanelScreen,
  PhoneTrainingScreen
} from "./features/collab/screens";
import {
  AdminPerfCollabScreen,
  AdminKnowledgeBaseScreen,
  VisionInscriptionsScreen,
  VisionFauconScreen,
  AdminLeadsScreen,
  AdminObjectifsScreen,
  AdminAiAgentsScreen,
  AdminSignalementsScreen,
  AdminCallFormsScreen
} from "./features/admin/screens";

// Phase 7+ — extracted CollabPortal
import CollabPortal from "./features/collab/CollabPortal";
import AdminDash from "./features/admin/AdminDash";

// HookIsolator: wraps IIFE-with-hooks in a real React component
// so each tab gets its own hook scope (prevents React #311 on tab switch)



// ═══════════════════════════════════════════════════
// CALENDAR360 V5 ULTIMATE — 30+ Features Beyond Calendly
// Workflows, Routing, Polls, Payments, Groups, Tags, QR, Check-in,
// CRM Contacts, Satisfaction, No-show, Reconfirmation, Multi-duration,
// Managed Events, Single-use links, Blackout dates, Load scoring,
// Internal notes, Export, Slack/Webhook, Multi-timezone, and more
// ═══════════════════════════════════════════════════



// ─── API HELPER ─────────────────────────────
 // set by AdminDash on mount

// ─── LOGO COMPONENT ──────────────────────────

// ─── DATA ────────────────────────────────────





// ─── V5 EXTRA DATA: Workflows, Routing, Polls, Contacts, Blackouts ───

// ─── SUPER ADMIN DATA ────────────────────────

// ─── ICONS ───────────────────────────────────

// ─── UTILS ───────────────────────────────────

// ─── PIPELINE CARD COLORS (sélecteur visuel) ──────────

// ─── RDV CATEGORIES + SUBCATEGORIES ──────────

// ─── NOTIFICATION HELPERS (Brevo Email + SMS) ───


// ─── SHARED UI ───────────────────────────────

// ─── MODAL ───────────────────────────────────

// ─── CONFIRM MODAL ──────────────────────────────

// ─── LOADING SPINNER ────────────────────────────

// ─── HELP TIP (TOOLTIP) ────────────────────────────

// ─── REQUIRED ASTERISK ──────────────────────────────

// ─── VALIDATED INPUT ────────────────────────────────

// ─── EMPTY STATE ────────────────────────────────

// ─── SKELETON LOADER ────────────────────────────

// ─── ERROR BOUNDARY ─────────────────────────────

// ═══════════════════════════════════════════════════
// COLLABORATOR PORTAL — Weekly Agenda Grid
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// VISITOR BOOKING (Calendly-style)
// ═══════════════════════════════════════════════════
export default function App() {
  // URL-based routing for /page/:companySlug/:pageSlug
  const pageRoute = useMemo(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/page\/([a-z0-9-]+)\/([a-z0-9-]+)/);
    return match ? { companySlug: match[1], pageSlug: match[2] } : null;
  }, []);

  // URL-based routing for /book/:companySlug/:calSlug
  const bookRoute = useMemo(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/book\/([a-z0-9-]+)\/([a-z0-9-]+)/);
    return match ? { companySlug: match[1], calSlug: match[2] } : null;
  }, []);

  // URL-based routing for /form/:companySlug/:formSlug
  const formRoute = useMemo(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/form\/([a-z0-9-]+)\/([a-z0-9-]+)/);
    return match ? { companySlug: match[1], formSlug: match[2] } : null;
  }, []);

  // URL-based routing for /manage/:token
  const manageRoute = useMemo(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/manage\/([a-z0-9_]+)/);
    return match ? { token: match[1] } : null;
  }, []);

  // URL-based routing for /espace/:token
  const espaceRoute = useMemo(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/espace\/([a-z0-9_]+)/);
    return match ? { token: match[1] } : null;
  }, []);

  // If we're on a /page/:companySlug/:pageSlug URL, show PublicPage directly
  if (pageRoute) return <PublicPage companySlug={pageRoute.companySlug} pageSlug={pageRoute.pageSlug}/>;
  // If we're on a /book/:companySlug/:calSlug URL, show PublicBooking directly
  if (bookRoute) return <PublicBooking companySlug={bookRoute.companySlug} calSlug={bookRoute.calSlug}/>;
  // If we're on a /form/:companySlug/:formSlug URL, show PublicForm directly
  if (formRoute) return <PublicForm companySlug={formRoute.companySlug} formSlug={formRoute.formSlug}/>;
  // If we're on a /manage/:token URL, show ManageBooking
  if (manageRoute) return <ManageBooking token={manageRoute.token}/>;
  // If we're on a /espace/:token URL, show ClientPortal
  if (espaceRoute) return <ClientPortal token={espaceRoute.token}/>;

  const [view, setView] = useState(() => {
    try { return localStorage.getItem("calendar360-session") ? "admin" : "landing"; } catch { return "landing"; }
  });
  const [loading, setLoading] = useState(true);
  const [visitorCal, setVisitorCal] = useState(null);
  const [portalData, setPortalData] = useState(null);
  const [isSupraAdmin, setIsSupraAdmin] = useState(false);
  const [bookings, setBookings] = useState(INIT_BOOKINGS);
  const [avails, setAvails] = useState(INIT_AVAILS);
  const [collabs, setCollabs] = useState(INIT_COLLABS);
  const [cals, setCals] = useState(INIT_CALS);
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem("calendar360-dark") === "true"; } catch { return false; }
  });
  const [blackouts, setBlackouts] = useState(COMPANY_SETTINGS.blackoutDates);
  const [vacations, setVacations] = useState({});
  const [allCompanies, setAllCompanies] = useState(INIT_ALL_COMPANIES);
  const [allUsers, setAllUsers] = useState(INIT_ALL_USERS);
  const [allCalendars, setAllCalendars] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [allContacts, setAllContacts] = useState([]);
  const [activityLog, setActivityLog] = useState(INIT_ACTIVITY_LOG);
  const [smsCredits, setSmsCredits] = useState(50);
  const [smsHistory, setSmsHistory] = useState([]);
  const [voipCredits, setVoipCredits] = useState(0);
  const [voipCallLogs, setVoipCallLogs] = useState([]);
  const [voipConfigured, setVoipConfigured] = useState(false);
  const [appConversations, setAppConversations] = useState([]);
  const [appPhonePlans, setAppPhonePlans] = useState([]);
  const [appMyPhoneNumbers, setAppMyPhoneNumbers] = useState([]);
  const [appAvailableNumbers, setAppAvailableNumbers] = useState([]);
  const [pipelineStages, setAppPipelineStages] = useState([]);
  const [appContactFieldDefs, setAppContactFieldDefs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const contactsLocalEditRef = useRef(0); // timestamp of last local edit — protect from auto-refresh overwrite
  const [customTables, setCustomTables] = useState([]);
  const [googleEvents, setGoogleEvents] = useState([]);
  // Phase C-4 (2026-04-20): no longer initialize with COMPANIES[0]={id:'c1',...}.
  // Bootstrap leaked 'c1' as companyId in API calls before session resolved.
  // Real value is set via setCompany(data.company) after /api/init succeeds.
  const [company, setCompany] = useState(null);

  // Dark mode: reassign global T and persist
  setTheme(darkMode ? "dark" : "light");
  useEffect(() => { localStorage.setItem("calendar360-dark", darkMode); }, [darkMode]);

  // Load data from API on mount — SECURITY: validate session via backend first
  useEffect(() => {
    let savedSession = null;
    try {
      savedSession = JSON.parse(localStorage.getItem("calendar360-session") || "null");
    } catch {}

    // No saved session → show landing (login)
    if (!savedSession || !savedSession.token) {
      setLoading(false);
      return;
    }

    if (savedSession.supraAdmin) setIsSupraAdmin(true);

    // STEP 1: Validate session via /auth/me — backend is source of truth
    api("/api/auth/me").then(meData => {
      if (!meData?.authenticated) {
        // Session expired or invalid — clear and show login
        localStorage.removeItem("calendar360-session");
        setLoading(false);
        return;
      }

      // Use backend-validated activeCompanyId, fallback to localStorage hint
      const validCompanyId = meData.activeCompanyId || savedSession.companyId;

      if (!validCompanyId && meData._needsCompanySelection) {
        // Supra with no company selected — load init without company for selection
        setAllCompanies(meData.allowedCompanies || []);
        setLoading(false);
        return;
      }

      // STEP 2: Load company data with validated companyId
      const url = validCompanyId ? "/api/init?companyId=" + validCompanyId : "/api/init";
      return api(url);
    }).then(data => {
      if (!data) return; // already handled above
      if (data.error) {
        // Backend rejected — clear session
        console.error("[INIT] Backend error:", data.error);
        localStorage.removeItem("calendar360-session");
        setLoading(false);
        return;
      }
      if (data.company) {
        // Sync localStorage with backend-validated company
        try {
          const sess = JSON.parse(localStorage.getItem("calendar360-session") || "null");
          if (sess) { sess.companyId = data.company.id; localStorage.setItem("calendar360-session", JSON.stringify(sess)); }
        } catch {}

        setCompany(data.company);
        setCollabs(data.collaborators || []);
        setCals(data.calendars || []);
        setBookings(data.bookings || []);
        setAvails(data.availabilities || INIT_AVAILS);
        setBlackouts(data.settings?.blackoutDates || []);
        setAllCompanies(data.allCompanies || []);
        setAllUsers(data.allUsers || []);
        setAllCalendars(data.allCalendars || []);
        setAllBookings(data.allBookings || []);
        setAllContacts(data.allContacts || []);
        setActivityLog(data.activityLog || []);
        setSmsCredits(data.smsCredits ?? 0);
        setVoipCredits(data.voipCredits ?? 0);
        setVoipCallLogs(data.voipCallLogs || []);
        setVoipConfigured(data.voipConfigured ?? false);
        setAppPhonePlans(data.phonePlans || []);
        setAppMyPhoneNumbers(data.myPhoneNumbers || []);
        setAppAvailableNumbers(data.availableNumbers || []);
        if (data.conversations) setAppConversations(data.conversations);
        setAppPipelineStages(data.pipelineStages || []);
        setAppContactFieldDefs(data.contactFieldDefs || []);
        setSmsHistory(data.smsTransactions || []);
        setContacts(data.contacts || []);
        if (data?.customTables) (typeof setCustomTables==='function'?setCustomTables:function(){})(data.customTables);
        if (data?.googleEvents) setGoogleEvents(data.googleEvents);
        // Sécurité : si le collaborateur connecté n'est PAS admin → ouvrir son portail directement
        if (savedSession && savedSession.role && savedSession.role !== "admin" && !savedSession.supraAdmin && savedSession.collaboratorId) {
          const collabFull = (data.collaborators || []).find(c => c.id === savedSession.collaboratorId);
          if (collabFull) {
            setPortalData({ collab: collabFull });
            setView("portal");
            setLoading(false);
            return;
          }
        }
      }
      setLoading(false);
    }).catch(() => { setLoading(false); });
    // Load Google Maps script if API key is configured
    api("/api/auth/config").then(cfg => {
      if (cfg?.googleMapsApiKey) {
        _T.mapsKey = cfg.googleMapsApiKey;
        if (!document.getElementById('google-maps-script')) {
          const s = document.createElement('script');
          s.id = 'google-maps-script';
          s.src = `https://maps.googleapis.com/maps/api/js?key=${cfg.googleMapsApiKey}&libraries=places`;
          s.async = true;
          document.head.appendChild(s);
        }
      }
    });
  }, []);

  // Auto-refresh bookings & core data every 30s (live sync)
  useEffect(() => {
    if (view === "landing" || !company?.id) return;
    const interval = setInterval(() => {
      api("/api/init?companyId=" + company.id).then(data => {
        // ISOLATION COMPLETE: si admin regarde un portail collab, filtrer TOUTES les donnees
        const isCollabView = view === 'portal' && portalData?.collab?.id;
        const viewCollabId = isCollabView ? portalData.collab.id : null;

        if (data?.bookings) {
          setBookings(isCollabView ? data.bookings.filter(b => b.collaboratorId === viewCollabId) : data.bookings);
        }
        if (data?.callLogs && isCollabView) {
          setVoipCallLogs(data.callLogs.filter(cl => cl.collaboratorId === viewCollabId));
        }
        if (data?.conversations && isCollabView) {
          setAppConversations(data.conversations.filter(c => c.collaboratorId === viewCollabId));
        }

        // Securite: ne pas ecraser les contacts si un edit local est en cours (< 10s)
        const timeSinceEdit = Date.now() - (contactsLocalEditRef.current || 0);
        if (data?.contacts && timeSinceEdit > 10000) {
          if (isCollabView) {
            const cid = viewCollabId;
            const filtered = data.contacts.filter(c => {
              if (c.assignedTo === cid) return true;
              try { return JSON.parse(c.shared_with_json || '[]').includes(cid); } catch { return false; }
            });
            setContacts(filtered);
          } else {
            setContacts(data.contacts);
          }
        } else if (data?.contacts && timeSinceEdit <= 10000) {
          console.log('[AUTO-REFRESH] Contacts skip — edit local il y a', Math.round(timeSinceEdit/1000)+'s');
        }
        // REGLE GLOBALE: Synchroniser TOUS les panels ouverts avec les données fraîches
        if (data?.contacts) {
          const freshMap = new Map((data.contacts||[]).map(c=>[c.id,c]));
          if (typeof selectedCrmContact!=='undefined'&&selectedCrmContact?.id && freshMap.has(selectedCrmContact.id)) (typeof setSelectedCrmContact==='function'?setSelectedCrmContact:()=>{})(p => p ? {...p, ...freshMap.get(p.id)} : p);
          if ((typeof pipelineRightContact!=='undefined'?pipelineRightContact:null)?.id && freshMap.has(pipelineRightContact.id)) (typeof setPipelineRightContact==='function'?setPipelineRightContact:function(){})(p => p ? {...p, ...freshMap.get(p.id)} : p);
          if (typeof setSelectedContact === 'function') { try { if (selectedContact?.id && freshMap.has(selectedContact.id)) setSelectedContact(p => p ? {...p, ...freshMap.get(p.id)} : p); } catch {} }
        }
        if (data?.customTables) (typeof setCustomTables==='function'?setCustomTables:function(){})(data.customTables);
        if (data?.googleEvents) setGoogleEvents(data.googleEvents);
        if (data?.smsCredits != null) setSmsCredits(data.smsCredits);
        if (data?.voipCredits != null) setVoipCredits(data.voipCredits);
        // Telecom credits & notifications are synced inside AdminDash
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [view, company?.id]);

  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:T.bg, gap:16 }}>
      <Logo s={56} rounded={14}/>
      <div style={{ fontSize:20, fontWeight:700, color:T.text }}>Calendar360</div>
      <div style={{ width:32, height:32, border:`3px solid ${T.border}`, borderTopColor:T.accent, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:T.bg, transition:"background .3s ease, color .3s ease" }}>
      {view === "landing" && <Landing onLogin={(companyId, supraAdmin, collaboratorInfo) => {
        setIsSupraAdmin(!!supraAdmin);
        const url = companyId ? "/api/init?companyId=" + companyId : "/api/init";
        api(url).then(data => {
          if (data && data.company) {
            setCompany(data.company);
            setCollabs(data.collaborators || []);
            setCals(data.calendars || []);
            setBookings(data.bookings || []);
            setAvails(data.availabilities || INIT_AVAILS);
            setBlackouts(data.settings?.blackoutDates || []);
            setAllCompanies(data.allCompanies || []);
            setAllUsers(data.allUsers || []);
            setAllCalendars(data.allCalendars || []);
            setAllBookings(data.allBookings || []);
            setAllContacts(data.allContacts || []);
            setActivityLog(data.activityLog || []);
            setSmsCredits(data.smsCredits ?? 0);
            setVoipCredits(data.voipCredits ?? 0);
            setVoipCallLogs(data.voipCallLogs || []);
            setVoipConfigured(data.voipConfigured ?? false);
            setSmsHistory(data.smsTransactions || []);
            setContacts(data.contacts || []);
            if (data?.customTables) (typeof setCustomTables==='function'?setCustomTables:function(){})(data.customTables);
            if (data?.googleEvents) setGoogleEvents(data.googleEvents);
            // Telecom states (voipPacks, smsPacks, telecomCredits, allTelecomCredits, etc.)
            // are loaded by AdminDash's own useEffect — not available at App scope
            if (data.phonePlans) setAppPhonePlans(data.phonePlans);
            if (data.myPhoneNumbers) setAppMyPhoneNumbers(data.myPhoneNumbers);
            if (data.conversations) setAppConversations(data.conversations);
            if (data.availableNumbers) setAppAvailableNumbers(data.availableNumbers);
            if (data.pipelineStages) setAppPipelineStages(data.pipelineStages);
            if (data.contactFieldDefs) setAppContactFieldDefs(data.contactFieldDefs);
            // Si c'est un collaborateur (pas admin), ouvrir directement son portail
            if (collaboratorInfo && collaboratorInfo.role !== "admin") {
              const collabFull = (data.collaborators || []).find(c => c.id === collaboratorInfo.id);
              if (collabFull) {
                setPortalData({ collab: collabFull });
                setView("portal");
                return;
              }
            }
          }
          // Admin ou supra → interface admin
          setView("admin");
        }).catch(() => {
          // Fallback: even if init fails, show admin view (data will load via AdminDash)
          setView("admin");
        });
      }}/>}
      {view === "admin" && (
        <ErrorBoundary>
        <AdminDash
          company={company}
          bookings={bookings} setBookings={setBookings}
          avails={avails} setAvails={setAvails}
          collabs={collabs} setCollabs={setCollabs}
          cals={cals} setCals={setCals}
          darkMode={darkMode} setDarkMode={setDarkMode}
          blackouts={blackouts} setBlackouts={setBlackouts}
          vacations={vacations} setVacations={setVacations}
          onLogout={() => { localStorage.removeItem("calendar360-session"); setView("landing"); }}
          onVisitor={(cal) => { setVisitorCal(cal || cals[0]); setView("visitor"); }}
          onCollabPortal={(collab) => {
            setPortalData({ collab });
            // Recharger les données filtrées pour ce collaborateur spécifique
            api("/api/init?companyId=" + company.id).then(data => {
              if (data?.contacts) {
                // Filter contacts for this specific collab
                const collabContacts = data.contacts.filter(c => {
                  if (c.assignedTo === collab.id) return true;
                  try { return JSON.parse(c.shared_with_json || c.shared_with || '[]').includes(collab.id); } catch { return false; }
                });
                setContacts(collabContacts);
              }
              // SECURITE: filtrer TOUTES les données par collaborateur (vue isolée)
              if (data?.bookings) setAllBookings(data.bookings.filter(b => b.collaboratorId === collab.id));
              if (data?.callLogs) setVoipCallLogs(data.callLogs.filter(cl => cl.collaboratorId === collab.id));
              if (data?.conversations) setAppConversations(data.conversations.filter(c => c.collaboratorId === collab.id));
              if (data?.myPhoneNumbers) setAppMyPhoneNumbers(data.myPhoneNumbers.filter(pn => pn.collaboratorId === collab.id));
            });
            // Vider le cache SMS pour forcer un rechargement propre
            _T.allSmsMessages = null;
            _T.smsLoaded = {};
            setView("portal");
          }}
          isSupraAdmin={isSupraAdmin}
          allCompanies={allCompanies} setAllCompanies={setAllCompanies}
          allUsers={allUsers} setAllUsers={setAllUsers}
          allCalendars={allCalendars} setAllCalendars={setAllCalendars}
          allBookings={allBookings} setAllBookings={setAllBookings}
          allContacts={allContacts} setAllContacts={setAllContacts}
          activityLog={activityLog} setActivityLog={setActivityLog}
          smsCredits={smsCredits} setSmsCredits={setSmsCredits}
          smsHistory={smsHistory} setSmsHistory={setSmsHistory}
          voipCredits={voipCredits} setVoipCredits={setVoipCredits} voipCallLogs={voipCallLogs} setVoipCallLogs={setVoipCallLogs} voipConfigured={voipConfigured} setVoipConfigured={setVoipConfigured}
          appPhonePlans={appPhonePlans} setAppPhonePlans={setAppPhonePlans} appMyPhoneNumbers={appMyPhoneNumbers} setAppMyPhoneNumbers={setAppMyPhoneNumbers} appAvailableNumbers={appAvailableNumbers} setAppAvailableNumbers={setAppAvailableNumbers}
          contacts={contacts} setContacts={setContacts}
          pipelineStages={pipelineStages} setPipelineStages={setAppPipelineStages}
          contactFieldDefs={appContactFieldDefs} setContactFieldDefs={setAppContactFieldDefs}
          onSwitchCompany={(companyId) => {
            // SECURITY: Tell backend to persist company switch in session FIRST
            api("/api/auth/switch-company", { method: "POST", body: { companyId } })
              .then(switchRes => {
                if (!switchRes?.success) { console.error("[SWITCH] Backend refused company switch"); return; }
                // Now load the new company data
                return api("/api/init?companyId=" + companyId);
              })
              .then(data => {
                if (!data || !data.company) return;
                setCompany(data.company);
                setCollabs(data.collaborators || []);
                setCals(data.calendars || []);
                setBookings(data.bookings || []);
                setAvails(data.availabilities || INIT_AVAILS);
                setBlackouts(data.settings?.blackoutDates || []);
                (typeof setAllCompanies==='function'?setAllCompanies:function(){})(data.allCompanies || []);
                (typeof setAllUsers==='function'?setAllUsers:function(){})(data.allUsers || []);
                (typeof setAllCalendars==='function'?setAllCalendars:function(){})(data.allCalendars || []);
                (typeof setAllBookings==='function'?setAllBookings:function(){})(data.allBookings || []);
                (typeof setAllContacts==='function'?setAllContacts:function(){})(data.allContacts || []);
                (typeof setActivityLog==='function'?setActivityLog:function(){})(data.activityLog || []);
                (typeof setSmsCredits==='function'?setSmsCredits:function(){})(data.smsCredits ?? 0);
                (typeof setVoipCredits==='function'?setVoipCredits:function(){})(data.voipCredits ?? 0);
                (typeof setVoipCallLogs==='function'?setVoipCallLogs:function(){})(data.voipCallLogs || []);
                (typeof setVoipConfigured==='function'?setVoipConfigured:function(){})(data.voipConfigured ?? false);
                setAppPhonePlans(data.phonePlans || []);
                setAppMyPhoneNumbers(data.myPhoneNumbers || []);
                if (data.conversations) setAppConversations(data.conversations);
                setAppAvailableNumbers(data.availableNumbers || []);
                if(data.voipPacks) (typeof setVoipPacks==='function'?setVoipPacks:function(){})(data.voipPacks);
                if(data.smsPacks) (typeof setSmsPacks==='function'?setSmsPacks:function(){})(data.smsPacks);
                if(data.telecomCredits != null) (typeof setTelecomCredits==='function'?setTelecomCredits:function(){})(data.telecomCredits);
                if(data.allTelecomCredits) (typeof setAllTelecomCredits==='function'?setAllTelecomCredits:function(){})(data.allTelecomCredits);
                if(data.telecomCreditLogs) (typeof setTelecomCreditLogs==='function'?setTelecomCreditLogs:function(){})(data.telecomCreditLogs);
                (typeof setAppPipelineStages==='function'?setAppPipelineStages:function(){})(data.pipelineStages || []);
                setSmsHistory(data.smsTransactions || []);
                setContacts(data.contacts || []);
                if (data?.customTables) (typeof setCustomTables==='function'?setCustomTables:function(){})(data.customTables);
                if (data?.googleEvents) (typeof setGoogleEvents==='function'?setGoogleEvents:function(){})(data.googleEvents);
                // Persist in localStorage as UX convenience (backend is source of truth)
                try {
                  const sess = JSON.parse(localStorage.getItem("calendar360-session") || "null");
                  if (sess) { sess.companyId = companyId; localStorage.setItem("calendar360-session", JSON.stringify(sess)); }
                  localStorage.setItem("c360-tab", "home");
                } catch {}
                setView("admin");
              });
          }}
        />
        </ErrorBoundary>
      )}
      {view === "portal" && portalData && (
        <ErrorBoundary>
          <CollabPortal
            collab={portalData.collab}
            company={company}
            bookings={bookings}
            setBookings={setBookings}
            calendars={cals}
            setCalendars={setCals}
            avails={avails}
            setAvails={setAvails}
            vacations={vacations}
            setVacations={setVacations}
            contacts={contacts}
            setContacts={setContacts}
            onBack={() => {
              // Si c'est un collaborateur connecté directement (pas admin), déconnecter au lieu de revenir à l'admin
              try {
                const sess = JSON.parse(localStorage.getItem("calendar360-session") || "null");
                if (sess && sess.role && sess.role !== "admin" && !sess.supraAdmin) {
                  localStorage.removeItem("calendar360-session");
                  setPortalData(null);
                  setView("landing");
                  return;
                }
              } catch {}
              // Recharger TOUS les contacts de la company (vue admin)
              api("/api/init?companyId=" + company.id).then(data => {
                if (data?.contacts) setContacts(data.contacts);
              });
              setView("admin");
            }}
            voipCredits={voipCredits}
            voipCallLogs={voipCallLogs}
            setVoipCallLogs={setVoipCallLogs}
            voipConfigured={voipConfigured}
            appMyPhoneNumbers={appMyPhoneNumbers}
            appPhonePlans={appPhonePlans}
            appConversations={appConversations}
            setAppConversations={setAppConversations}
            pipelineStages={pipelineStages}
            setPipelineStages={setAppPipelineStages}
            contactFieldDefs={appContactFieldDefs}
            setContactFieldDefs={setAppContactFieldDefs}
            collabs={collabs}
            googleEvents={googleEvents}
            setGoogleEvents={setGoogleEvents}
            isAdminView={(() => { try { const s = JSON.parse(localStorage.getItem("calendar360-session")||"null"); return !s || s.role === "admin" || s.supraAdmin; } catch { return true; } })()}
            smsCredits={smsCredits}
          />
        </ErrorBoundary>
      )}
      {view === "visitor" && visitorCal && (
        <VisitorBooking calendar={visitorCal} company={company} collabs={collabs} blackouts={blackouts} vacations={vacations} onBack={() => setView("admin")}/>
      )}
    </div>
  );
}
