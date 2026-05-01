import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Pipeline Templates Phase 1 — schéma idempotent injecté après initialisation DB
import { ensurePipelineTemplatesSchema } from "../services/pipelineTemplates/schema.js";
import { ensureContactShareSchema } from "../services/contactShare/schema.js";

const fallbackPath = join(__dirname, '..', 'calendar360.db');
const dbPath = process.env.DB_PATH || fallbackPath;

// GUARD (E.3.8-E, 2026-04-20) : interdire le fallback en production.
// Si NODE_ENV=production et DB_PATH manquant, on refuse de démarrer au lieu
// d'ouvrir silencieusement une DB fantôme. Évite R1/R3/R4 du diagnostic E.3.8-A.
if (!process.env.DB_PATH && process.env.NODE_ENV === 'production') {
  throw new Error('[DB] DB_PATH required in production — refusing fallback to ' + fallbackPath);
}

if (process.env.DB_PATH) {
  console.log('[DB] DB PATH USED:', dbPath);
} else {
  console.warn('[DB] ⚠️ Fallback DB path used:', dbPath, '— Set DB_PATH in .env for production');
}
const db = new Database(dbPath);

// WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── CREATE TABLES ───────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    domain TEXT,
    plan TEXT DEFAULT 'free',
    contactEmail TEXT,
    active INTEGER DEFAULT 1,
    createdAt TEXT,
    collaboratorsCount INTEGER DEFAULT 0,
    calendarsCount INTEGER DEFAULT 0,
    bookingsCount INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS collaborators (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    role TEXT DEFAULT 'member',
    priority INTEGER DEFAULT 1,
    color TEXT DEFAULT '#2563EB',
    code TEXT,
    password TEXT,
    phone TEXT,
    maxWeek INTEGER DEFAULT 20,
    maxMonth INTEGER DEFAULT 80,
    slackId TEXT,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS calendars (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'simple',
    duration INTEGER DEFAULT 30,
    durations_json TEXT DEFAULT '[]',
    color TEXT DEFAULT '#2563EB',
    slug TEXT,
    location TEXT,
    price REAL DEFAULT 0,
    currency TEXT DEFAULT 'EUR',
    bufferBefore INTEGER DEFAULT 0,
    bufferAfter INTEGER DEFAULT 0,
    minNotice INTEGER DEFAULT 60,
    maxPerDay INTEGER DEFAULT 10,
    maxAdvanceDays INTEGER DEFAULT 60,
    questions_json TEXT DEFAULT '[]',
    requireApproval INTEGER DEFAULT 0,
    allowRecurring INTEGER DEFAULT 0,
    groupMax INTEGER DEFAULT 1,
    waitlistEnabled INTEGER DEFAULT 0,
    reconfirm INTEGER DEFAULT 0,
    reconfirmHours INTEGER DEFAULT 24,
    managed INTEGER DEFAULT 0,
    singleUse INTEGER DEFAULT 0,
    dependency TEXT,
    tags_json TEXT DEFAULT '[]',
    videoAuto INTEGER DEFAULT 0,
    assignMode TEXT DEFAULT 'priority',
    collaborators_json TEXT DEFAULT '[]',
    FOREIGN KEY (companyId) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    calendarId TEXT NOT NULL,
    collaboratorId TEXT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    duration INTEGER DEFAULT 30,
    visitorName TEXT NOT NULL,
    visitorEmail TEXT,
    visitorPhone TEXT,
    status TEXT DEFAULT 'confirmed',
    notes TEXT,
    noShow INTEGER DEFAULT 0,
    source TEXT DEFAULT 'link',
    rating INTEGER,
    tags_json TEXT DEFAULT '[]',
    checkedIn INTEGER DEFAULT 0,
    internalNotes TEXT,
    reconfirmed INTEGER DEFAULT 0,
    FOREIGN KEY (calendarId) REFERENCES calendars(id)
  );

  CREATE TABLE IF NOT EXISTS availabilities (
    collaboratorId TEXT PRIMARY KEY,
    schedule_json TEXT NOT NULL,
    FOREIGN KEY (collaboratorId) REFERENCES collaborators(id)
  );

  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    companyId TEXT DEFAULT 'c1',
    name TEXT NOT NULL,
    trigger_type TEXT,
    delay INTEGER DEFAULT 0,
    action TEXT,
    template TEXT,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS routings (
    id TEXT PRIMARY KEY,
    companyId TEXT DEFAULT 'c1',
    name TEXT NOT NULL,
    fields_json TEXT DEFAULT '[]',
    rules_json TEXT DEFAULT '[]',
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    companyId TEXT DEFAULT 'c1',
    title TEXT NOT NULL,
    creator TEXT,
    options_json TEXT DEFAULT '[]',
    votes_json TEXT DEFAULT '{}',
    status TEXT DEFAULT 'open',
    expires TEXT
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    companyId TEXT DEFAULT 'c1',
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    totalBookings INTEGER DEFAULT 0,
    lastVisit TEXT,
    tags_json TEXT DEFAULT '[]',
    notes TEXT,
    rating INTEGER,
    docs_json TEXT DEFAULT '[]',
    updatedAt TEXT DEFAULT ''
  );

  -- V4: Historique complet des changements de statut — traçabilité 100%
  CREATE TABLE IF NOT EXISTS contact_status_history (
    id TEXT PRIMARY KEY,
    contactId TEXT NOT NULL,
    companyId TEXT NOT NULL,
    fromStatus TEXT NOT NULL,
    toStatus TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    origin TEXT DEFAULT '',
    userId TEXT DEFAULT '',
    collaboratorName TEXT DEFAULT '',
    tabId TEXT DEFAULT '',
    reason TEXT DEFAULT '',
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_csh_contact ON contact_status_history(contactId);
  CREATE INDEX IF NOT EXISTS idx_csh_company ON contact_status_history(companyId, createdAt);

  -- V4: Log des anomalies système — debug + audit
  CREATE TABLE IF NOT EXISTS system_anomaly_logs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    contactId TEXT DEFAULT '',
    companyId TEXT DEFAULT '',
    fromStatus TEXT DEFAULT '',
    toStatus TEXT DEFAULT '',
    source TEXT DEFAULT '',
    userId TEXT DEFAULT '',
    tabId TEXT DEFAULT '',
    detail TEXT DEFAULT '',
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sal_company ON system_anomaly_logs(companyId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_sal_type ON system_anomaly_logs(type);

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    companyId TEXT,
    companyName TEXT,
    action TEXT,
    detail TEXT,
    timestamp TEXT,
    user TEXT
  );

  CREATE TABLE IF NOT EXISTS sms_transactions (
    id TEXT PRIMARY KEY,
    companyId TEXT DEFAULT 'c1',
    date TEXT,
    type TEXT,
    count INTEGER DEFAULT 0,
    detail TEXT,
    amount REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    companyId TEXT UNIQUE NOT NULL,
    blackoutDates_json TEXT DEFAULT '[]',
    vacations_json TEXT DEFAULT '[]',
    timezone TEXT DEFAULT 'Europe/Paris',
    language TEXT DEFAULT 'fr',
    cancelPolicy TEXT,
    customDomain TEXT,
    brandColor TEXT DEFAULT '#2563EB'
  );

  CREATE TABLE IF NOT EXISTS sms_credits (
    companyId TEXT PRIMARY KEY,
    credits INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS reminder_logs (
    id TEXT PRIMARY KEY,
    bookingId TEXT NOT NULL,
    type TEXT NOT NULL,
    channel TEXT,
    sentAt TEXT
  );
`);

// Add reminder columns to settings if they don't exist
try { db.exec('ALTER TABLE settings ADD COLUMN reminder24h INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE settings ADD COLUMN reminder1h INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE settings ADD COLUMN reminder15min INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE settings ADD COLUMN reminderSms INTEGER DEFAULT 0'); } catch {}

// Google Calendar integration columns
try { db.exec('ALTER TABLE collaborators ADD COLUMN google_tokens_json TEXT'); } catch {}
try { db.exec('ALTER TABLE collaborators ADD COLUMN google_email TEXT'); } catch {}
try { db.exec('ALTER TABLE bookings ADD COLUMN googleEventId TEXT'); } catch {}
try { db.exec('ALTER TABLE bookings ADD COLUMN meetLink TEXT'); } catch {}

// Pipeline stage for CRM contacts
try { db.exec("ALTER TABLE contacts ADD COLUMN pipeline_stage TEXT DEFAULT 'nouveau'"); } catch {}

// Google Chat webhook + GA4 property ID
try { db.exec("ALTER TABLE settings ADD COLUMN google_chat_webhook TEXT"); } catch {}
try { db.exec("ALTER TABLE settings ADD COLUMN ga4_property_id TEXT"); } catch {}
try { db.exec("ALTER TABLE settings ADD COLUMN google_tasks_auto INTEGER DEFAULT 1"); } catch {}

// Company-level booking window (max advance days)
try { db.exec("ALTER TABLE settings ADD COLUMN maxAdvanceDays INTEGER DEFAULT 60"); } catch {}

// Address field for companies + contacts
try { db.exec("ALTER TABLE companies ADD COLUMN address TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN forbidden_words_json TEXT DEFAULT '[]'"); } catch {}
// Forecast settings
try { db.exec("ALTER TABLE companies ADD COLUMN forecast_contract_avg REAL DEFAULT 1500"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN forecast_conversion_rate REAL DEFAULT 8"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN sms_sender_name TEXT DEFAULT NULL"); } catch {}
// Inscription entreprise V2
try { db.exec("ALTER TABLE companies ADD COLUMN status TEXT DEFAULT 'active'"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN siret TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN businessId TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN phone TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN city TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN zipCode TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN country TEXT DEFAULT 'France'"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN sector TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN website TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN collaboratorsTarget INTEGER"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN responsibleFirstName TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN responsibleLastName TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN responsiblePhone TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN rejectedReason TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN validatedAt TEXT"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN validatedBy TEXT"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN address TEXT"); } catch {}

// CRM: Extended contact fields
try { db.exec("ALTER TABLE contacts ADD COLUMN firstname TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN lastname TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN company TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN mobile TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN website TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN status TEXT DEFAULT 'prospect'"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN custom_fields_json TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN sympathy_score INTEGER DEFAULT 50"); } catch {}

// CRM: Contact source tracking
try { db.exec("ALTER TABLE contacts ADD COLUMN source TEXT DEFAULT 'manual'"); } catch {}

// FIX: Migrate old 5-stage pipeline IDs to correct 7-stage CRM IDs
try { db.exec("UPDATE contacts SET pipeline_stage = 'contacte' WHERE pipeline_stage = 'en_cours'"); } catch {}
try { db.exec("UPDATE contacts SET pipeline_stage = 'qualifie' WHERE pipeline_stage = 'proposition'"); } catch {}
try { db.exec("UPDATE contacts SET pipeline_stage = 'client_valide' WHERE pipeline_stage = 'gagne'"); } catch {}

// CRM: Contact ownership (assigned collaborator) + sharing
try { db.exec("ALTER TABLE contacts ADD COLUMN assignedTo TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN shared_with_json TEXT DEFAULT '[]'"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_assigned ON contacts (assignedTo)"); } catch {}

// V1.12.1 — Archive 3 etats (Actif / Archive / Efface). Migration additive idempotente.
// archivedAt = '' -> contact actif. archivedAt != '' (ISO timestamp) -> archive.
// Filter strict applique dans tous les SELECT/POST critiques en V1.12.5.x.
try { db.exec("ALTER TABLE contacts ADD COLUMN archivedAt TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN archivedBy TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN archivedReason TEXT DEFAULT ''"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_active ON contacts(companyId, archivedAt)"); } catch {}

// Timezone support
try { db.exec("ALTER TABLE collaborators ADD COLUMN timezone TEXT"); } catch {}
// Chat permission per collaborator (1 = enabled, 0 = disabled)
try { db.exec("ALTER TABLE collaborators ADD COLUMN chat_enabled INTEGER DEFAULT 1"); } catch {}
// SMS permission per collaborator (1 = enabled, 0 = disabled)
try { db.exec("ALTER TABLE collaborators ADD COLUMN sms_enabled INTEGER DEFAULT 0"); } catch {}
// Permission suppression contacts (0 = interdit, 1 = autorise)
try { db.exec("ALTER TABLE collaborators ADD COLUMN can_delete_contacts INTEGER DEFAULT 0"); } catch {}
// V1.12.9 — Permission hard delete (suppression definitive irreversible des contacts archives)
try { db.exec("ALTER TABLE collaborators ADD COLUMN can_hard_delete_contacts INTEGER DEFAULT 0"); } catch {}
// Secure IA Phone — AI-powered forbidden words detection
try { db.exec("ALTER TABLE collaborators ADD COLUMN secure_ia_phone INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN secure_ia_words_json TEXT DEFAULT '[]'"); } catch {}
// AMD — Answering Machine Detection (voicemail drop)
try { db.exec("ALTER TABLE collaborators ADD COLUMN amd_enabled INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN voicemail_audio_url TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN voicemail_text TEXT DEFAULT ''"); } catch {}
// V1.9.1 — Recording rights per collaborator (admin-controlled, granular).
// Migration Option B (preserve): if voip_settings.recordingEnabled=1 at install time,
// existing collaborators of that company get callRecordingEnabled=1 (avoid silent regression).
// Migration runs ONCE only (gated by hadColumn check on PRAGMA table_info).
{
  const _hadCallRecCol = db.prepare("SELECT name FROM pragma_table_info('collaborators') WHERE name='callRecordingEnabled'").get();
  try { db.exec("ALTER TABLE collaborators ADD COLUMN callRecordingEnabled INTEGER DEFAULT 0"); } catch {}
  if (!_hadCallRecCol) {
    try {
      const _r = db.prepare("UPDATE collaborators SET callRecordingEnabled=1 WHERE companyId IN (SELECT companyId FROM voip_settings WHERE recordingEnabled=1 AND companyId IS NOT NULL AND companyId != '')").run();
      console.log(`[V1.9 MIGRATION] callRecordingEnabled backfilled for ${_r.changes} collaborators (Option B preserve)`);
    } catch (err) { console.error('[V1.9 MIGRATION] backfill error:', err.message); }
  }
}
// AI Sales Copilot — AI-powered sales assistant
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_copilot_enabled INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_copilot_role TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_copilot_objective TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_copilot_target TEXT DEFAULT ''"); } catch {}
// AI Copilot v2 — Extended profile fields
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_copilot_level TEXT DEFAULT 'off'"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_role_type TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_service_type TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_main_mission TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_call_type_default TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_call_goal_default TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_target_default TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_language TEXT DEFAULT 'fr'"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_tone_style TEXT DEFAULT 'commercial'"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN ai_script_trame TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE bookings ADD COLUMN visitorTimezone TEXT"); } catch {}
try { db.exec("ALTER TABLE bookings ADD COLUMN manageToken TEXT"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_token ON bookings (manageToken)"); } catch {}

// Google Calendar inbound sync
try { db.exec("ALTER TABLE collaborators ADD COLUMN google_last_sync TEXT"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN google_events_private INTEGER DEFAULT 1"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS google_events (
    id TEXT PRIMARY KEY,
    collaboratorId TEXT NOT NULL,
    summary TEXT,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    allDay INTEGER DEFAULT 0,
    status TEXT,
    transparency TEXT,
    FOREIGN KEY (collaboratorId) REFERENCES collaborators(id)
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_google_events_collab ON google_events (collaboratorId, startTime)"); } catch {}

// Per-calendar notification channels (legacy unified — kept for compat)
try { db.exec("ALTER TABLE calendars ADD COLUMN notifyEmail INTEGER DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN notifySms INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN notifyWhatsapp INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN whatsappNumber TEXT"); } catch {}

// Per-calendar custom notification templates
try { db.exec("ALTER TABLE calendars ADD COLUMN customConfirmSms TEXT"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN customConfirmWhatsapp TEXT"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN customReminderSms TEXT"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN customReminderWhatsapp TEXT"); } catch {}

// Split notification channels: confirmation vs reminder (independent toggles)
let _needsNotifMigration = false;
try { db.exec("ALTER TABLE calendars ADD COLUMN confirmEmail INTEGER DEFAULT 1"); _needsNotifMigration = true; } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN confirmSms INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN confirmWhatsapp INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN reminderEmail INTEGER DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN reminderSms INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN reminderWhatsapp INTEGER DEFAULT 0"); } catch {}
if (_needsNotifMigration) {
  try {
    db.exec(`UPDATE calendars SET
      confirmEmail = notifyEmail, confirmSms = notifySms, confirmWhatsapp = notifyWhatsapp,
      reminderEmail = notifyEmail, reminderSms = notifySms, reminderWhatsapp = notifyWhatsapp`);
    console.log('[DB] Migrated notification flags to split confirm/reminder');
  } catch (e) { console.error('[DB] Migration error:', e.message); }
}

// WhatsApp number verification
try { db.exec("ALTER TABLE calendars ADD COLUMN whatsappVerified INTEGER DEFAULT 0"); } catch {}

// Calendar description for public booking page
try { db.exec("ALTER TABLE calendars ADD COLUMN description TEXT DEFAULT ''"); } catch {}

// Per-calendar custom reminder timings (override global settings)
try { db.exec("ALTER TABLE calendars ADD COLUMN customReminders INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN calReminder24h INTEGER DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN calReminder1h INTEGER DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE calendars ADD COLUMN calReminder15min INTEGER DEFAULT 0"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS wa_verifications (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    expiresAt TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now'))
  )
`);
// Cleanup expired verification codes on startup
try { db.exec("DELETE FROM wa_verifications WHERE expiresAt < datetime('now')"); } catch {}

// Support tickets system
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaboratorId TEXT,
    type TEXT NOT NULL DEFAULT 'manual',
    category TEXT DEFAULT 'bug',
    subject TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'open',
    priority TEXT DEFAULT 'medium',
    environment_json TEXT,
    attachments_json TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    resolvedAt TEXT,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS ticket_messages (
    id TEXT PRIMARY KEY,
    ticketId TEXT NOT NULL,
    sender TEXT NOT NULL,
    senderName TEXT,
    message TEXT NOT NULL,
    attachments_json TEXT,
    internal INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ticketId) REFERENCES tickets(id)
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_tickets_company ON tickets (companyId, status)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_ticket_messages ON ticket_messages (ticketId)"); } catch {}

// Forms system
db.exec(`
  CREATE TABLE IF NOT EXISTS forms (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    description TEXT DEFAULT '',
    fields_json TEXT DEFAULT '[]',
    settings_json TEXT DEFAULT '{}',
    calendarId TEXT,
    templateId TEXT,
    active INTEGER DEFAULT 1,
    color TEXT DEFAULT '#2563EB',
    submissionCount INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS form_submissions (
    id TEXT PRIMARY KEY,
    formId TEXT NOT NULL,
    companyId TEXT NOT NULL,
    data_json TEXT DEFAULT '{}',
    visitorName TEXT,
    visitorEmail TEXT,
    visitorPhone TEXT,
    source TEXT DEFAULT 'link',
    createdAt TEXT NOT NULL,
    FOREIGN KEY (formId) REFERENCES forms(id)
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_forms_company ON forms (companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions (formId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_form_submissions_company ON form_submissions (companyId)"); } catch {}

// Business Pages system
db.exec(`
  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    sections_json TEXT DEFAULT '[]',
    settings_json TEXT DEFAULT '{}',
    seo_json TEXT DEFAULT '{}',
    calendarId TEXT,
    formId TEXT,
    active INTEGER DEFAULT 1,
    published INTEGER DEFAULT 0,
    industry TEXT,
    color TEXT DEFAULT '#2563EB',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS page_leads (
    id TEXT PRIMARY KEY,
    pageId TEXT NOT NULL,
    companyId TEXT NOT NULL,
    name TEXT,
    email TEXT,
    phone TEXT,
    message TEXT,
    data_json TEXT DEFAULT '{}',
    source TEXT DEFAULT 'page',
    createdAt TEXT NOT NULL,
    FOREIGN KEY (pageId) REFERENCES pages(id)
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_pages_company ON pages (companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_page_leads_page ON page_leads (pageId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_page_leads_company ON page_leads (companyId)"); } catch {}

// ─── VOIP TABLES ─────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS call_logs (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    contactId TEXT,
    collaboratorId TEXT,
    direction TEXT NOT NULL DEFAULT 'outbound',
    fromNumber TEXT,
    toNumber TEXT,
    status TEXT DEFAULT 'initiated',
    duration INTEGER DEFAULT 0,
    recordingUrl TEXT,
    recordingSid TEXT,
    twilioCallSid TEXT,
    notes TEXT,
    pipelineAction TEXT,
    startedAt TEXT,
    endedAt TEXT,
    createdAt TEXT NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS voip_settings (
    companyId TEXT PRIMARY KEY,
    twilioAccountSid TEXT,
    twilioAuthToken TEXT,
    twilioTwimlAppSid TEXT,
    twilioPhoneNumber TEXT,
    recordingEnabled INTEGER DEFAULT 0,
    recordingConsent INTEGER DEFAULT 0,
    voicemailEnabled INTEGER DEFAULT 0,
    voicemailGreeting TEXT,
    active INTEGER DEFAULT 1
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS voip_credits (
    companyId TEXT PRIMARY KEY,
    credits INTEGER DEFAULT 0
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS voip_transactions (
    id TEXT PRIMARY KEY,
    companyId TEXT DEFAULT 'c1',
    date TEXT,
    type TEXT,
    count INTEGER DEFAULT 0,
    detail TEXT,
    amount REAL DEFAULT 0
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_call_logs_company ON call_logs (companyId, createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_call_logs_contact ON call_logs (contactId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_call_logs_twilio ON call_logs (twilioCallSid)"); } catch {}

// ─── PHONE MARKETPLACE TABLES ─────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS phone_numbers (
    id TEXT PRIMARY KEY,
    phoneNumber TEXT NOT NULL UNIQUE,
    friendlyName TEXT,
    country TEXT DEFAULT 'FR',
    twilioSid TEXT,
    status TEXT DEFAULT 'available',
    companyId TEXT,
    collaboratorId TEXT,
    planId TEXT DEFAULT 'starter',
    monthlyPrice REAL DEFAULT 8,
    minutesIncluded INTEGER DEFAULT 60,
    minutesUsed INTEGER DEFAULT 0,
    currentPeriodStart TEXT,
    currentPeriodEnd TEXT,
    assignedAt TEXT,
    createdAt TEXT NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS phone_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    price REAL NOT NULL,
    description TEXT,
    popular INTEGER DEFAULT 0
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS phone_transactions (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    phoneNumberId TEXT,
    type TEXT NOT NULL,
    detail TEXT,
    amount REAL DEFAULT 0,
    createdAt TEXT NOT NULL
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_phone_numbers_status ON phone_numbers (status)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_phone_numbers_company ON phone_numbers (companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_phone_transactions_company ON phone_transactions (companyId)"); } catch {}

// ─── CONVERSATIONS (Ringover-style threaded phone conversations) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaboratorId TEXT,
    clientPhone TEXT NOT NULL,
    businessPhone TEXT,
    contactId TEXT,
    conversationKey TEXT NOT NULL UNIQUE,
    visibilityMode TEXT DEFAULT 'individual',
    lastActivityAt TEXT,
    lastEventType TEXT,
    lastEventPreview TEXT,
    unreadCount INTEGER DEFAULT 0,
    status TEXT DEFAULT 'open',
    createdAt TEXT NOT NULL
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_conv_company ON conversations(companyId, lastActivityAt DESC)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_conv_key ON conversations(conversationKey)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_conv_collab ON conversations(companyId, collaboratorId, lastActivityAt DESC)"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS conversation_events (
    id TEXT PRIMARY KEY,
    conversationId TEXT NOT NULL,
    companyId TEXT NOT NULL,
    collaboratorId TEXT,
    type TEXT NOT NULL,
    callLogId TEXT,
    clientPhone TEXT,
    businessPhone TEXT,
    duration INTEGER,
    recordingUrl TEXT,
    transcription TEXT,
    aiSummary TEXT,
    content TEXT,
    status TEXT,
    metadata_json TEXT DEFAULT '{}',
    createdAt TEXT NOT NULL
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_ce_conv ON conversation_events(conversationId, createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_ce_call ON conversation_events(callLogId)"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS sms_messages (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaboratorId TEXT,
    contactId TEXT,
    direction TEXT DEFAULT 'outbound',
    fromNumber TEXT,
    toNumber TEXT,
    content TEXT,
    status TEXT DEFAULT 'sent',
    brevoMessageId TEXT,
    conversationId TEXT,
    createdAt TEXT NOT NULL
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sms_conv ON sms_messages(conversationId, createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sms_company ON sms_messages(companyId, createdAt DESC)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sms_collab ON sms_messages(companyId, collaboratorId, createdAt DESC)"); } catch {}

// ── SMS system extensions (Twilio SMS hybride) ──
try { db.exec("ALTER TABLE sms_messages ADD COLUMN provider TEXT DEFAULT 'brevo'"); } catch {}
try { db.exec("ALTER TABLE sms_messages ADD COLUMN twilioMessageSid TEXT"); } catch {}
try { db.exec("ALTER TABLE phone_numbers ADD COLUMN smsCapable INTEGER DEFAULT 1"); } catch {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_twilio_sid ON sms_messages(twilioMessageSid) WHERE twilioMessageSid IS NOT NULL"); } catch {}

// ── Contact AI Memory — mémoire intelligente par contact ──
db.exec(`
  CREATE TABLE IF NOT EXISTS contact_ai_memory (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    contactId TEXT NOT NULL UNIQUE,
    short_summary TEXT DEFAULT '',
    last_interaction_type TEXT DEFAULT '',
    last_interaction_at TEXT,
    interest_level TEXT DEFAULT 'medium',
    contact_temperature TEXT DEFAULT 'cold',
    conversion_score INTEGER DEFAULT 0,
    engagement_score INTEGER DEFAULT 0,
    responsiveness_score INTEGER DEFAULT 0,
    urgency_score INTEGER DEFAULT 0,
    fatigue_score INTEGER DEFAULT 0,
    opportunity_score INTEGER DEFAULT 0,
    last_objection TEXT DEFAULT '',
    objections_json TEXT DEFAULT '[]',
    promises_pending_json TEXT DEFAULT '[]',
    last_promise_detected_at TEXT,
    pipeline_stage TEXT DEFAULT 'nouveau',
    recommended_next_action TEXT DEFAULT '',
    recommended_action_reason TEXT DEFAULT '',
    recommended_wait_hours INTEGER DEFAULT 0,
    risk_flags_json TEXT DEFAULT '[]',
    tags_json TEXT DEFAULT '[]',
    last_ai_update TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_aimem_contact ON contact_ai_memory(contactId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_aimem_company ON contact_ai_memory(companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_aimem_temp ON contact_ai_memory(contact_temperature)"); } catch {}

// ── Pipeline automations (SMS + Email per stage, per collab) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS pipeline_automations (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaboratorId TEXT NOT NULL,
    pipelineStageId TEXT NOT NULL,
    triggerType TEXT NOT NULL DEFAULT 'entry',
    send_sms INTEGER DEFAULT 0,
    send_email INTEGER DEFAULT 0,
    sms_content TEXT DEFAULT '',
    email_subject TEXT DEFAULT '',
    email_content TEXT DEFAULT '',
    email_attachment_url TEXT DEFAULT '',
    is_auto INTEGER DEFAULT 1,
    enabled INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_pipeauto_collab ON pipeline_automations(companyId, collaboratorId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_pipeauto_stage ON pipeline_automations(pipelineStageId, triggerType)"); } catch {}

// ── Pipeline stages table (custom statuses per company) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS pipeline_stages (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    label TEXT NOT NULL,
    color TEXT DEFAULT '#7C3AED',
    position INTEGER DEFAULT 0,
    isDefault INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_pipeline_stages_company ON pipeline_stages (companyId)"); } catch {}

// ─── CHAT MESSAGES (internal team messaging) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    senderId TEXT NOT NULL,
    senderName TEXT NOT NULL,
    message TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_company ON chat_messages (companyId, createdAt)"); } catch {}
try { db.exec("ALTER TABLE chat_messages ADD COLUMN attachments_json TEXT"); } catch {}
try { db.exec("ALTER TABLE chat_messages ADD COLUMN type TEXT DEFAULT 'text'"); } catch {}
try { db.exec("ALTER TABLE chat_messages ADD COLUMN recipientId TEXT DEFAULT NULL"); } catch {} // NULL=group, id=DM
try { db.exec("ALTER TABLE chat_messages ADD COLUMN editedAt TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE chat_messages ADD COLUMN replyToId TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE chat_messages ADD COLUMN replyToName TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE chat_messages ADD COLUMN replyToMsg TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE chat_messages ADD COLUMN reactions_json TEXT DEFAULT NULL"); } catch {}

// ─── COLLABORATOR ONLINE STATUS (heartbeat-based) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS collab_heartbeat (
    collaboratorId TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    lastSeen TEXT NOT NULL
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_collab_heartbeat_company ON collab_heartbeat (companyId)"); } catch {}

// Performance indexes for frequently queried columns
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_calendar ON bookings (calendarId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_collaborator ON bookings (collaboratorId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings (date)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_calendars_company ON calendars (companyId)"); } catch {}
// Phase 2 security indexes — multi-tenant isolation
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_calendars_company_slug ON calendars(companyId, slug)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_company ON bookings(companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_collab_date ON bookings(collaboratorId, date)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_calendars_slug ON calendars (slug)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_collaborators_company ON collaborators (companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_collaborators_email ON collaborators (email)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts (companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts (email)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_availabilities_collab ON availabilities (collaboratorId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_activity_logs_company ON activity_logs (companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sms_transactions_company ON sms_transactions (companyId)"); } catch {}

// Seed default phone plans
try {
  const existingPlans = db.prepare('SELECT COUNT(*) as c FROM phone_plans').get();
  if (existingPlans.c === 0) {
    const insert = db.prepare('INSERT INTO phone_plans (id, name, minutes, price, description, popular) VALUES (?, ?, ?, ?, ?, ?)');
    insert.run('starter', 'Starter', 60, 8, 'Idéal pour les petites équipes', 0);
    insert.run('pro', 'Pro', 180, 20, 'Pour les équipes actives', 1);
    insert.run('business', 'Business', 600, 55, 'Volume élevé d\'appels', 0);
    insert.run('enterprise', 'Enterprise', 1500, 120, 'Usage intensif', 0);
  }
} catch {}

// ALTER voip_settings — add marketplace flag
try { db.exec("ALTER TABLE voip_settings ADD COLUMN marketplace INTEGER DEFAULT 0"); } catch {}

// ALTER phone_numbers — add telecom reseller columns
try { db.exec("ALTER TABLE phone_numbers ADD COLUMN type TEXT DEFAULT 'local'"); } catch {}
try { db.exec("ALTER TABLE phone_numbers ADD COLUMN provider TEXT DEFAULT 'twilio'"); } catch {}
try { db.exec("ALTER TABLE phone_numbers ADD COLUMN purchaseCost REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE phone_numbers ADD COLUMN renewedAt TEXT"); } catch {}
try { db.exec("ALTER TABLE phone_numbers ADD COLUMN numberUsage TEXT DEFAULT 'voice'"); } catch {}

// ─── VOIP PACKS (for enterprise purchase) ──────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS voip_packs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    price REAL NOT NULL,
    description TEXT,
    active INTEGER DEFAULT 1,
    popular INTEGER DEFAULT 0,
    createdAt TEXT
  )
`);

// Seed default VoIP packs
try {
  const existingVoipPacks = db.prepare('SELECT COUNT(*) as c FROM voip_packs').get();
  if (existingVoipPacks.c === 0) {
    const insertVP = db.prepare('INSERT INTO voip_packs (id, name, minutes, price, description, popular, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)');
    const now = new Date().toISOString();
    insertVP.run('vp_starter', 'Starter Voix', 100, 15, '100 minutes d\'appel — Idéal pour débuter', 0, now);
    insertVP.run('vp_pro', 'Pro Voix', 300, 35, '300 minutes d\'appel — Pour les équipes actives', 1, now);
    insertVP.run('vp_business', 'Business Voix', 600, 60, '600 minutes d\'appel — Volume élevé', 0, now);
    insertVP.run('vp_enterprise', 'Enterprise Voix', 1500, 130, '1500 minutes d\'appel — Usage intensif', 0, now);
  }
} catch {}

// ─── SMS PACKS (for enterprise purchase) ──────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sms_packs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    description TEXT,
    active INTEGER DEFAULT 1,
    popular INTEGER DEFAULT 0,
    createdAt TEXT
  )
`);

// Seed default SMS packs
try {
  const existingSmsPacks = db.prepare('SELECT COUNT(*) as c FROM sms_packs').get();
  if (existingSmsPacks.c === 0) {
    const insertSP = db.prepare('INSERT INTO sms_packs (id, name, quantity, price, description, popular, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)');
    const now = new Date().toISOString();
    insertSP.run('sp_starter', 'Starter SMS', 100, 8, '100 SMS — Idéal pour débuter', 0, now);
    insertSP.run('sp_pro', 'Pro SMS', 500, 35, '500 SMS — Pour les équipes actives', 1, now);
    insertSP.run('sp_business', 'Business SMS', 1000, 60, '1000 SMS — Volume élevé', 0, now);
    insertSP.run('sp_enterprise', 'Enterprise SMS', 5000, 250, '5000 SMS — Usage intensif', 0, now);
  }
} catch {}

// ─── TELECOM CREDITS (token wallet per company) ──────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS telecom_credits (
    companyId TEXT PRIMARY KEY,
    balance REAL DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS telecom_credit_logs (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    balanceAfter REAL DEFAULT 0,
    detail TEXT,
    createdAt TEXT NOT NULL
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_telecom_credit_logs_company ON telecom_credit_logs (companyId, createdAt)"); } catch {}

// ─── AUTH SESSIONS ────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    collaboratorId TEXT,
    companyId TEXT,
    role TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expiresAt)"); } catch {}
// Migration: activeCompanyId for supra admin company switching (persisted in session)
try { db.exec("ALTER TABLE sessions ADD COLUMN activeCompanyId TEXT DEFAULT NULL"); } catch {}

// ─── SUPRA ADMINS ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS supra_admins (
    email TEXT PRIMARY KEY,
    passwordHash TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )
`);

// Seed default supra admin if none exists
try {
  const supraCount = db.prepare('SELECT COUNT(*) as c FROM supra_admins').get();
  if (supraCount.c === 0) {
    // bcrypt hash of "ROMAIN" with 10 rounds (pre-computed to avoid async in sync context)
    // Generated with: bcrypt.hashSync('ROMAIN', 10)
    const defaultHash = '$2a$10$SXnXYVHfEqoOKVy.A5ZDrOM3VGw5VeRIXhZHqGPAwb4VSCKTNm.f6';
    db.prepare('INSERT INTO supra_admins (email, passwordHash, createdAt) VALUES (?, ?, ?)')
      .run('rc.sitbon@gmail.com', defaultHash, new Date().toISOString());
    console.log('\x1b[35m[AUTH]\x1b[0m Default supra admin seeded: rc.sitbon@gmail.com');
  }
} catch (e) { console.error('[SUPRA SEED ERROR]', e.message); }

// ─── CUSTOM TABLES (Airtable-like) ────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS custom_tables (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'grid',
    color TEXT DEFAULT '#2563EB',
    columns_json TEXT DEFAULT '[]',
    views_json TEXT DEFAULT '[]',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS custom_rows (
    id TEXT PRIMARY KEY,
    tableId TEXT NOT NULL,
    companyId TEXT NOT NULL,
    data_json TEXT DEFAULT '{}',
    createdBy TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )
`);

try { db.exec("CREATE INDEX IF NOT EXISTS idx_custom_tables_company ON custom_tables (companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_custom_rows_table ON custom_rows (tableId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_custom_rows_company ON custom_rows (companyId)"); } catch {}

// ── Contact field definitions (custom fields per company/collab) ──
db.exec(`CREATE TABLE IF NOT EXISTS contact_field_definitions (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  label TEXT NOT NULL,
  fieldKey TEXT NOT NULL,
  fieldType TEXT DEFAULT 'text',
  options_json TEXT DEFAULT '[]',
  required INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  scope TEXT DEFAULT 'company',
  createdBy TEXT DEFAULT '',
  createdAt TEXT
)`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_cfd_company ON contact_field_definitions (companyId)"); } catch {}

// Migration: add Google Sheets sync columns
try { db.exec("ALTER TABLE custom_tables ADD COLUMN googleSheetUrl TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE custom_tables ADD COLUMN lastSyncAt TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE custom_tables ADD COLUMN syncMode TEXT DEFAULT 'manual'"); } catch {}

// Migration: add AI dispatch config column
try { db.exec("ALTER TABLE custom_tables ADD COLUMN aiDispatchConfig_json TEXT DEFAULT '{}'"); } catch {}

// ─── DISPATCH TASKS (AI Intelligent Dispatch) ────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS dispatch_tasks (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    tableId TEXT NOT NULL,
    collabId TEXT NOT NULL,
    collabName TEXT NOT NULL,
    type TEXT DEFAULT 'call_back',
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    targetData_json TEXT DEFAULT '{}',
    status TEXT DEFAULT 'pending',
    points INTEGER DEFAULT 1,
    leadsToUnlock INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    completedAt TEXT,
    updatedAt TEXT NOT NULL
  )
`);

try { db.exec("CREATE INDEX IF NOT EXISTS idx_dispatch_tasks_collab ON dispatch_tasks (collabId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_dispatch_tasks_table ON dispatch_tasks (tableId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_dispatch_tasks_company ON dispatch_tasks (companyId)"); } catch {}

// ─── SECURE IA PHONE ────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS secure_ia_alerts (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaboratorId TEXT NOT NULL,
    callLogId TEXT NOT NULL,
    detectedWords_json TEXT DEFAULT '[]',
    transcription TEXT DEFAULT '',
    callDate TEXT,
    callDuration INTEGER DEFAULT 0,
    contactName TEXT DEFAULT '',
    contactPhone TEXT DEFAULT '',
    severity TEXT DEFAULT 'low',
    reviewed INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id),
    FOREIGN KEY (collaboratorId) REFERENCES collaborators(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS secure_ia_reports (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaboratorId TEXT NOT NULL,
    period TEXT NOT NULL,
    periodDate TEXT NOT NULL,
    totalCalls INTEGER DEFAULT 0,
    analyzedCalls INTEGER DEFAULT 0,
    flaggedCalls INTEGER DEFAULT 0,
    wordBreakdown_json TEXT DEFAULT '[]',
    summary TEXT DEFAULT '',
    createdAt TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id),
    FOREIGN KEY (collaboratorId) REFERENCES collaborators(id)
  )
`);

try { db.exec("CREATE INDEX IF NOT EXISTS idx_sia_alerts_company ON secure_ia_alerts (companyId, createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sia_alerts_collab ON secure_ia_alerts (collaboratorId, createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sia_alerts_call ON secure_ia_alerts (callLogId)"); } catch {}
// Collab alert interaction columns
try { db.exec("ALTER TABLE secure_ia_alerts ADD COLUMN collabRead INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE secure_ia_alerts ADD COLUMN collabExplanation TEXT DEFAULT ''"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sia_reports_company ON secure_ia_reports (companyId, period)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sia_reports_collab ON secure_ia_reports (collaboratorId, period)"); } catch {}

// ─── AI SALES COPILOT ──────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_copilot_analyses (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaboratorId TEXT NOT NULL,
    callLogId TEXT NOT NULL,
    contactId TEXT,
    transcription TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    sentimentScore INTEGER DEFAULT 50,
    qualityScore INTEGER DEFAULT 50,
    conversionScore INTEGER DEFAULT 50,
    objections_json TEXT DEFAULT '[]',
    actionItems_json TEXT DEFAULT '[]',
    coachingTips_json TEXT DEFAULT '[]',
    followupType TEXT DEFAULT '',
    followupDate TEXT,
    pipelineStage TEXT DEFAULT '',
    tags_json TEXT DEFAULT '[]',
    crmAutoFilled INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id),
    FOREIGN KEY (collaboratorId) REFERENCES collaborators(id)
  )
`);

try { db.exec("CREATE INDEX IF NOT EXISTS idx_aica_company ON ai_copilot_analyses (companyId, createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_aica_collab ON ai_copilot_analyses (collaboratorId, createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_aica_call ON ai_copilot_analyses (callLogId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_aica_contact ON ai_copilot_analyses (contactId, createdAt DESC)"); } catch {}
// AI Copilot — extended fields + validation tracking
try { db.exec("ALTER TABLE ai_copilot_analyses ADD COLUMN extended_json TEXT DEFAULT '{}'"); } catch {}
try { db.exec("ALTER TABLE ai_copilot_analyses ADD COLUMN validation_status TEXT DEFAULT 'pending'"); } catch {}
try { db.exec("ALTER TABLE ai_copilot_analyses ADD COLUMN validated_at TEXT"); } catch {}
try { db.exec("ALTER TABLE ai_copilot_analyses ADD COLUMN validated_by TEXT"); } catch {}
try { db.exec("ALTER TABLE ai_copilot_analyses ADD COLUMN rejected_at TEXT"); } catch {}
try { db.exec("ALTER TABLE ai_copilot_analyses ADD COLUMN rejected_by TEXT"); } catch {}
// Contacts — pointer to last validated AI analysis
try { db.exec("ALTER TABLE contacts ADD COLUMN last_ai_analysis_id TEXT DEFAULT ''"); } catch {}

// AI Copilot — Live coaching reactions tracking
try {
  db.exec(`CREATE TABLE IF NOT EXISTS ai_copilot_reactions (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaboratorId TEXT NOT NULL,
    callLogId TEXT,
    suggestionText TEXT NOT NULL,
    suggestionCategory TEXT DEFAULT '',
    accepted INTEGER DEFAULT 0,
    timestamp TEXT NOT NULL
  )`);
} catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_aicr_collab ON ai_copilot_reactions (collaboratorId, timestamp)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_aicr_company ON ai_copilot_reactions (companyId)"); } catch {}

// ═══════════════════════════════════════════════════
// AI KNOWLEDGE BASE — Enterprise knowledge for Copilot
// ═══════════════════════════════════════════════════

db.exec(`
  CREATE TABLE IF NOT EXISTS company_knowledge_base (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL UNIQUE,
    company_description TEXT DEFAULT '',
    company_description_long TEXT DEFAULT '',
    company_activity TEXT DEFAULT '',
    target_audience TEXT DEFAULT '',
    geographic_zone TEXT DEFAULT '',
    languages_json TEXT DEFAULT '["fr"]',
    tone_style TEXT DEFAULT 'professionnel',
    formality_level TEXT DEFAULT 'standard',
    preferred_words_json TEXT DEFAULT '[]',
    forbidden_words_json TEXT DEFAULT '[]',
    commercial_style TEXT DEFAULT '',
    support_style TEXT DEFAULT '',
    sav_style TEXT DEFAULT '',
    internal_processes_json TEXT DEFAULT '[]',
    faq_json TEXT DEFAULT '[]',
    offers_json TEXT DEFAULT '[]',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (companyId) REFERENCES companies(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS company_products (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'product',
    description TEXT DEFAULT '',
    benefits_json TEXT DEFAULT '[]',
    objections_json TEXT DEFAULT '[]',
    objection_answers_json TEXT DEFAULT '[]',
    pricing TEXT DEFAULT '',
    use_cases_json TEXT DEFAULT '[]',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (companyId) REFERENCES companies(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS company_scripts (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    script_type TEXT DEFAULT 'sales',
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    category TEXT DEFAULT 'commercial',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (companyId) REFERENCES companies(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS company_email_templates (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    template_type TEXT DEFAULT 'custom',
    name TEXT NOT NULL,
    subject TEXT DEFAULT '',
    body TEXT DEFAULT '',
    variables_json TEXT DEFAULT '[]',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (companyId) REFERENCES companies(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS company_sms_templates (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    template_type TEXT DEFAULT 'custom',
    name TEXT NOT NULL,
    content TEXT DEFAULT '',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (companyId) REFERENCES companies(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS company_documents (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    title TEXT NOT NULL,
    doc_type TEXT DEFAULT 'link',
    file_url TEXT DEFAULT '',
    link_url TEXT DEFAULT '',
    description TEXT DEFAULT '',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (companyId) REFERENCES companies(id)
  )
`);

// ═══════════════════════════════════════════════════
// CALL CONTEXTS — Per-call context for AI Copilot
// ═══════════════════════════════════════════════════

db.exec(`
  CREATE TABLE IF NOT EXISTS call_contexts (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaboratorId TEXT NOT NULL,
    callLogId TEXT,
    conversationId TEXT,
    contactId TEXT,
    call_origin TEXT DEFAULT 'outgoing',
    call_type TEXT DEFAULT 'sales',
    call_goal TEXT DEFAULT 'qualify_lead',
    target_type TEXT DEFAULT 'prospect',
    campaign_name TEXT DEFAULT '',
    lead_source TEXT DEFAULT '',
    priority_level TEXT DEFAULT 'normal',
    client_status TEXT DEFAULT '',
    deal_stage TEXT DEFAULT '',
    service_requested TEXT DEFAULT '',
    free_note TEXT DEFAULT '',
    tags_json TEXT DEFAULT '[]',
    auto_detected INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (companyId) REFERENCES companies(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS recommended_actions (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaboratorId TEXT NOT NULL,
    callLogId TEXT,
    conversationId TEXT,
    contactId TEXT,
    action_type TEXT NOT NULL,
    action_label TEXT DEFAULT '',
    action_payload_json TEXT DEFAULT '{}',
    status TEXT DEFAULT 'pending',
    generated_content TEXT DEFAULT '',
    source TEXT DEFAULT 'ai',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (companyId) REFERENCES companies(id)
  )
`);

try { db.exec("CREATE INDEX IF NOT EXISTS idx_cc_call ON call_contexts (callLogId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_cc_company ON call_contexts (companyId, collaboratorId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_ra_call ON recommended_actions (callLogId)"); } catch {}

// ─── AI PROFILE HISTORY & SUGGESTIONS ────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_profile_history (
    id TEXT PRIMARY KEY,
    collaboratorId TEXT NOT NULL,
    companyId TEXT NOT NULL,
    profile_snapshot_json TEXT NOT NULL,
    modified_by TEXT NOT NULL,
    modified_by_type TEXT DEFAULT 'admin',
    reason TEXT DEFAULT '',
    changes_summary TEXT DEFAULT '',
    createdAt TEXT NOT NULL,
    FOREIGN KEY (collaboratorId) REFERENCES collaborators(id)
  )
`);

try { db.exec("CREATE INDEX IF NOT EXISTS idx_aph_collab ON ai_profile_history (collaboratorId, createdAt)"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_profile_suggestions (
    id TEXT PRIMARY KEY,
    collaboratorId TEXT NOT NULL,
    companyId TEXT NOT NULL,
    analysisId TEXT,
    callLogId TEXT,
    suggestion_json TEXT NOT NULL,
    summary TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    collab_response TEXT DEFAULT '',
    createdAt TEXT NOT NULL,
    respondedAt TEXT,
    FOREIGN KEY (collaboratorId) REFERENCES collaborators(id)
  )
`);

try { db.exec("CREATE INDEX IF NOT EXISTS idx_aps_collab ON ai_profile_suggestions (collaboratorId, status)"); } catch {}

// ─── CALL TRANSCRIPTS (Live transcription storage) ────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS call_transcripts (
    id TEXT PRIMARY KEY,
    callLogId TEXT NOT NULL,
    companyId TEXT NOT NULL,
    collaboratorId TEXT NOT NULL,
    segments_json TEXT DEFAULT '[]',
    fullText TEXT DEFAULT '',
    duration INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (callLogId) REFERENCES call_logs(id)
  );

  -- CALL TRANSCRIPT ARCHIVE — corpus IA conversationnel thématique --
  -- Référence enrichie de toutes les transcriptions d'appels avec métadonnées contact/entreprise/thématiques.
  -- Destiné à nourrir un agent IA conversationnel par thématique client/domaine.
  CREATE TABLE IF NOT EXISTS call_transcript_archive (
    id TEXT PRIMARY KEY,                  -- archiveId unique : YYYYMMDD-HHMM-last9phone-shortId
    callLogId TEXT NOT NULL,              -- référence call_logs
    companyId TEXT NOT NULL,              -- multi-tenant
    collaboratorId TEXT,                  -- qui a passé/reçu l'appel
    contactId TEXT,                       -- contact CRM lié
    contactName TEXT DEFAULT '',          -- nom du contact au moment de l'archive
    contactPhone TEXT DEFAULT '',         -- numéro normalisé
    contactEmail TEXT DEFAULT '',
    contactCompany TEXT DEFAULT '',       -- nom de l'entreprise du contact (B2B)
    contactType TEXT DEFAULT 'btc',       -- btc (particulier) ou btb (entreprise)
    contactSiret TEXT DEFAULT '',
    contactSector TEXT DEFAULT '',        -- secteur d'activité
    callDirection TEXT DEFAULT '',        -- inbound / outbound
    callDate TEXT NOT NULL,               -- ISO datetime de l'appel
    callDuration INTEGER DEFAULT 0,       -- en secondes
    callStatus TEXT DEFAULT '',           -- completed / missed / failed
    hasLive INTEGER DEFAULT 0,            -- 1 si transcription Deepgram live
    hasAudio INTEGER DEFAULT 0,           -- 1 si transcription Whisper audio
    transcriptText TEXT DEFAULT '',       -- texte formaté complet (pour export / lecture humaine)
    segmentsJson TEXT DEFAULT '[]',       -- segments structurés pour IA (speaker + text + timestamp)
    thematics_json TEXT DEFAULT '[]',     -- tags thématiques (prospection, SAV, objection, ...) pour corpus IA
    sentimentScore INTEGER DEFAULT 0,     -- sentiment global (0-100) si dispo
    aiSummary TEXT DEFAULT '',            -- résumé IA si dispo
    downloadCount INTEGER DEFAULT 0,      -- combien de fois téléchargée/copiée
    lastAccessedAt TEXT DEFAULT '',
    createdAt TEXT NOT NULL,
    FOREIGN KEY (callLogId) REFERENCES call_logs(id)
  );

  -- LIVE CALL FLAGS (real-time forbidden word detection) --
  CREATE TABLE IF NOT EXISTS call_live_flags (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaboratorId TEXT NOT NULL,
    callSid TEXT NOT NULL,
    flag_type TEXT NOT NULL,
    word_detected TEXT DEFAULT '',
    segment_text TEXT DEFAULT '',
    timestamp_ms INTEGER DEFAULT 0,
    severity TEXT DEFAULT 'low',
    reviewed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lead_sources (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'csv',
    config_json TEXT DEFAULT '{}',
    mapping_json TEXT DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    last_sync TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS incoming_leads (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    source_id TEXT,
    first_name TEXT DEFAULT '',
    last_name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    data_json TEXT DEFAULT '{}',
    status TEXT DEFAULT 'new',
    envelope_id TEXT,
    assigned_to TEXT,
    assigned_at TEXT,
    contact_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS lead_envelopes (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    name TEXT NOT NULL,
    source_id TEXT,
    auto_dispatch INTEGER DEFAULT 0,
    dispatch_type TEXT DEFAULT 'manual',
    dispatch_time TEXT DEFAULT '',
    dispatch_limit INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS lead_dispatch_rules (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    envelope_id TEXT NOT NULL,
    collaborator_id TEXT NOT NULL,
    percentage INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id),
    FOREIGN KEY (envelope_id) REFERENCES lead_envelopes(id),
    FOREIGN KEY (collaborator_id) REFERENCES collaborators(id)
  );

  CREATE TABLE IF NOT EXISTS lead_assignments (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    collaborator_id TEXT NOT NULL,
    rule_id TEXT,
    contact_id TEXT,
    assigned_at TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS user_goals (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaborator_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'calls',
    target_value INTEGER DEFAULT 0,
    current_value INTEGER DEFAULT 0,
    period TEXT DEFAULT 'monthly',
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    reward_leads INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id),
    FOREIGN KEY (collaborator_id) REFERENCES collaborators(id)
  );

  CREATE TABLE IF NOT EXISTS team_goals (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    collaborators_json TEXT DEFAULT '[]',
    goal_type TEXT NOT NULL DEFAULT 'calls',
    goal_value INTEGER DEFAULT 0,
    current_value INTEGER DEFAULT 0,
    period TEXT DEFAULT 'monthly',
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    reward_leads INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS goal_rewards (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    goal_id TEXT NOT NULL,
    goal_type TEXT NOT NULL DEFAULT 'individual',
    collaborator_id TEXT NOT NULL,
    leads_awarded INTEGER DEFAULT 0,
    envelope_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS pipeline_history (
    id TEXT PRIMARY KEY,
    contactId TEXT NOT NULL,
    companyId TEXT NOT NULL,
    fromStage TEXT,
    toStage TEXT NOT NULL,
    userId TEXT,
    userName TEXT,
    note TEXT DEFAULT '',
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lead_import_logs (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    source_id TEXT,
    envelope_id TEXT,
    type TEXT NOT NULL DEFAULT 'csv',
    filename TEXT DEFAULT '',
    total_rows INTEGER DEFAULT 0,
    imported INTEGER DEFAULT 0,
    duplicates INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    error_details_json TEXT DEFAULT '[]',
    duplicate_details_json TEXT DEFAULT '[]',
    mapping_json TEXT DEFAULT '{}',
    created_by TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS lead_history (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    lead_id TEXT,
    contact_id TEXT,
    action TEXT NOT NULL,
    details_json TEXT DEFAULT '{}',
    user_id TEXT DEFAULT '',
    user_name TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  );
`);

try { db.exec("CREATE INDEX IF NOT EXISTS idx_ct_call ON call_transcripts (callLogId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_ct_collab ON call_transcripts (collaboratorId, createdAt)"); } catch {}
try { db.exec("ALTER TABLE call_transcripts ADD COLUMN source TEXT DEFAULT 'whisper'"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_live_flags_call ON call_live_flags (callSid, created_at)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_live_flags_company ON call_live_flags (companyId, collaboratorId, created_at)"); } catch {}
// Call transcript archive (corpus IA)
try { db.exec("CREATE INDEX IF NOT EXISTS idx_transcript_archive_company ON call_transcript_archive (companyId, callDate DESC)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_transcript_archive_collab ON call_transcript_archive (companyId, collaboratorId, callDate DESC)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_transcript_archive_contact ON call_transcript_archive (contactId, callDate DESC)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_transcript_archive_calllog ON call_transcript_archive (callLogId)"); } catch {}

// ─── PERFORMANCE INDEXES ─────────────────────
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_createdAt ON contacts(createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_companyId_stage ON contacts(companyId, pipeline_stage)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_collab_status ON bookings(collaboratorId, status)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_calendars_createdAt ON calendars(createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_forms_createdAt ON forms(createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_phone_numbers_assignment ON phone_numbers(companyId, status)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_call_logs_companyId ON call_logs(companyId, createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_activity_logs_companyId ON activity_logs(companyId, timestamp)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_conversations_companyId ON conversations(companyId, updatedAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sms_messages_conversationId ON sms_messages(conversationId)"); } catch {}

// ─── LEADS & GOALS INDEXES ──────────────────
try { db.exec("CREATE INDEX IF NOT EXISTS idx_lead_sources_company ON lead_sources(companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_incoming_leads_company_status ON incoming_leads(companyId, status)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_incoming_leads_envelope ON incoming_leads(envelope_id, status)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_incoming_leads_source ON incoming_leads(source_id)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_lead_envelopes_company ON lead_envelopes(companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_lead_dispatch_rules_envelope ON lead_dispatch_rules(envelope_id)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_lead_assignments_company ON lead_assignments(companyId, assigned_at)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_lead_assignments_collab ON lead_assignments(collaborator_id)"); } catch {}
// V5-P1: UNIQUE index anti double-dispatch — empeche d'assigner le meme lead au meme collab 2 fois
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_assignments_unique ON lead_assignments(lead_id, collaborator_id)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_user_goals_company ON user_goals(companyId, status)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_user_goals_collab ON user_goals(collaborator_id, status)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_team_goals_company ON team_goals(companyId, status)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_goal_rewards_company ON goal_rewards(companyId, created_at)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_goal_rewards_goal ON goal_rewards(goal_id)"); } catch {}

// ─── PIPELINE & CRM INDEXES ────────────────
try { db.exec("CREATE INDEX IF NOT EXISTS idx_pipeline_history_contact ON pipeline_history(contactId, createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_pipeline_history_company ON pipeline_history(companyId, createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_next_rdv ON contacts(companyId, next_rdv_date)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_nrp_relance ON contacts(companyId, nrp_next_relance)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_contact ON bookings(contactId)"); } catch {}

// ─── LEADS V2 INDEXES ─────────────────────────
try { db.exec("CREATE INDEX IF NOT EXISTS idx_lead_import_logs_company ON lead_import_logs(companyId, created_at)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_lead_history_company ON lead_history(companyId, created_at)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_lead_history_lead ON lead_history(lead_id)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_lead_history_contact ON lead_history(contact_id)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_incoming_leads_import ON incoming_leads(import_id)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_incoming_leads_email ON incoming_leads(companyId, email)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_incoming_leads_phone ON incoming_leads(companyId, phone)"); } catch {}

// ─── LEADS V2 COLUMNS ────────────────────────
try { db.exec("ALTER TABLE incoming_leads ADD COLUMN import_id TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE incoming_leads ADD COLUMN duplicate_of TEXT DEFAULT ''"); } catch {}

// ─── LEADS V3 — IA DISPATCH + SCORES ─────────
try { db.exec("ALTER TABLE lead_envelopes ADD COLUMN dispatch_mode TEXT DEFAULT 'percentage'"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN max_active_leads INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN max_daily_leads INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN lead_specialities TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN lead_tags_json TEXT DEFAULT '[]'"); } catch {}

// Phase 2 — Migration localStorage → DB : scripts d'appel par collaborateur
try { db.exec("ALTER TABLE collaborators ADD COLUMN call_scripts_json TEXT DEFAULT '[]'"); } catch {}

try { db.exec(`CREATE TABLE IF NOT EXISTS lead_distribution_scores (
  id TEXT PRIMARY KEY,
  collaborator_id TEXT NOT NULL,
  companyId TEXT NOT NULL,
  score_global INTEGER DEFAULT 50,
  score_calls INTEGER DEFAULT 50,
  score_conversion INTEGER DEFAULT 50,
  score_speed INTEGER DEFAULT 50,
  score_capacity INTEGER DEFAULT 50,
  score_quality INTEGER DEFAULT 50,
  active_leads INTEGER DEFAULT 0,
  daily_leads INTEGER DEFAULT 0,
  daily_reset_date TEXT DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (companyId) REFERENCES companies(id),
  FOREIGN KEY (collaborator_id) REFERENCES collaborators(id)
)`); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_lead_dist_scores_company ON lead_distribution_scores(companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_lead_dist_scores_collab ON lead_distribution_scores(collaborator_id)"); } catch {}

// ─── MISSING COLUMNS ────────────────────────
try { db.exec("ALTER TABLE call_logs ADD COLUMN conversationId TEXT"); } catch {}
try { db.exec("ALTER TABLE bookings ADD COLUMN companyId TEXT"); } catch {}

// ─── PIPELINE CRM COLUMNS ──────────────────
try { db.exec("ALTER TABLE contacts ADD COLUMN rdv_status TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN next_rdv_date TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN next_rdv_booking_id TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN nrp_followups_json TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN nrp_next_relance TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN createdAt TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN contact_type TEXT DEFAULT 'btc'"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN siret TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE bookings ADD COLUMN contactId TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE bookings ADD COLUMN rdv_category TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE bookings ADD COLUMN rdv_subcategory TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN nrp_delay_1 INTEGER DEFAULT 3"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN nrp_delay_2 INTEGER DEFAULT 7"); } catch {}
try { db.exec("ALTER TABLE collaborators ADD COLUMN nrp_delay_3 INTEGER DEFAULT 14"); } catch {}

// ─── LEADS V4 — DISPATCH DATE + SYNC + ANTI-TRICHE ─────────
try { db.exec("ALTER TABLE lead_envelopes ADD COLUMN dispatch_start_date TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE lead_sources ADD COLUMN sync_mode TEXT DEFAULT 'manual'"); } catch {}
try { db.exec("ALTER TABLE lead_sources ADD COLUMN gsheet_url TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE lead_sources ADD COLUMN last_row_count INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE lead_sources ADD COLUMN sync_interval INTEGER DEFAULT 30"); } catch {}
try { db.exec("ALTER TABLE lead_sources ADD COLUMN sync_envelope_id TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE call_logs ADD COLUMN is_valid_call INTEGER DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE call_logs ADD COLUMN invalid_reason TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE call_logs ADD COLUMN shared_with_json TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE incoming_leads ADD COLUMN dispatched INTEGER DEFAULT 0"); } catch {}

try { db.exec(`CREATE TABLE IF NOT EXISTS user_activity_logs (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_detail TEXT DEFAULT '',
  entity_type TEXT DEFAULT '',
  entity_id TEXT DEFAULT '',
  duration INTEGER DEFAULT 0,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
)`); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_user_activity_company ON user_activity_logs(companyId, created_at)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_user_activity_collab ON user_activity_logs(collaborator_id, created_at)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_user_activity_type ON user_activity_logs(action_type)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_incoming_leads_dispatched ON incoming_leads(dispatched, status)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_call_logs_valid ON call_logs(is_valid_call, companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_lead_sources_sync ON lead_sources(sync_mode, is_active)"); } catch {}

// ─── LEADS V5 — DISPATCH COUNT + DAILY LIMIT + END DATE + GOALS ENVELOPE LINK ─────────
try { db.exec("ALTER TABLE lead_dispatch_rules ADD COLUMN dispatch_count INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE lead_dispatch_rules ADD COLUMN max_daily INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE lead_envelopes ADD COLUMN dispatch_end_date TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE user_goals ADD COLUMN envelope_ids_json TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE team_goals ADD COLUMN envelope_ids_json TEXT DEFAULT '[]'"); } catch {}

// ─── CONTRACT / REVENUE TRACKING ────────────────────────
try { db.exec("ALTER TABLE contacts ADD COLUMN contract_amount REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN contract_number TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN contract_date TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN contract_signed INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN contract_status TEXT DEFAULT 'active'"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN contract_cancelled_at TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN contract_cancel_reason TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN contract_comment TEXT DEFAULT ''"); } catch {}

// ─── CLIENT PORTAL ─────────────────────────────
try { db.exec("ALTER TABLE contacts ADD COLUMN clientToken TEXT"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN clientPortalEnabled INTEGER DEFAULT 0"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_clientToken ON contacts(clientToken)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_company_email ON contacts(companyId, email)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_company_phone ON contacts(companyId, phone)"); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS client_messages (
  id TEXT PRIMARY KEY,
  contactId TEXT NOT NULL,
  companyId TEXT NOT NULL,
  direction TEXT DEFAULT 'inbound',
  message TEXT NOT NULL,
  readAt TEXT,
  createdAt TEXT NOT NULL
)`); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_client_messages_contact ON client_messages(contactId)"); } catch {}

// ─── BEHAVIOR SCORE ────────────────────────────
try { db.exec("ALTER TABLE contacts ADD COLUMN behavior_score INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN last_behavior_event_at TEXT"); } catch {}

// ─── CARD COLOR (pipeline visual) ────────────────
try { db.exec("ALTER TABLE contacts ADD COLUMN card_color TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN card_label TEXT DEFAULT ''"); } catch {}

// ─── REASSIGNMENT TRACKING ─────────
try { db.exec("ALTER TABLE contacts ADD COLUMN reassigned INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN reassigned_from TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN reassigned_at TEXT DEFAULT ''"); } catch {}

// ─── V5: LEAD SCORING INTELLIGENT ─────────
try { db.exec("ALTER TABLE contacts ADD COLUMN lead_score INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN lead_score_detail_json TEXT DEFAULT '{}'"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN lead_score_updated_at TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE contacts ADD COLUMN lead_score_dirty INTEGER DEFAULT 1"); } catch {} // dirty flag: 1 = à recalculer
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_lead_score ON contacts(lead_score)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_score_dirty ON contacts(lead_score_dirty, companyId)"); } catch {}

// ─── LEADS V6 — Centre de pilotage des flux ─────────
try { db.exec("ALTER TABLE lead_dispatch_rules ADD COLUMN last_rr_index INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE lead_envelopes ADD COLUMN dispatch_interval_minutes INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE lead_envelopes ADD COLUMN last_dispatch_at TEXT DEFAULT ''"); } catch {}

// ─── NOTIFICATIONS (générique, extensible) ─────
try { db.exec(`CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  collaboratorId TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT DEFAULT '',
  contactId TEXT,
  contactName TEXT DEFAULT '',
  linkUrl TEXT DEFAULT '',
  readAt TEXT,
  createdAt TEXT NOT NULL
)`); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_notif_collab ON notifications(collaboratorId, readAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_notif_company ON notifications(companyId, createdAt)"); } catch {}

// ─── PERF COLLAB MODULE ────────────────────────
try { db.exec(`CREATE TABLE IF NOT EXISTS perf_score_settings (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL UNIQUE,
  weight_calls INTEGER DEFAULT 15,
  weight_quality INTEGER DEFAULT 20,
  weight_conversion INTEGER DEFAULT 25,
  weight_speed INTEGER DEFAULT 10,
  weight_followup INTEGER DEFAULT 10,
  weight_goals INTEGER DEFAULT 10,
  weight_discipline INTEGER DEFAULT 5,
  weight_regularity INTEGER DEFAULT 5,
  bonus_rules_json TEXT DEFAULT '{}',
  penalty_rules_json TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT ''
);`); } catch {}

try { db.exec(`CREATE TABLE IF NOT EXISTS perf_bonus_penalty_logs (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  value INTEGER NOT NULL,
  reason TEXT DEFAULT '',
  is_auto INTEGER DEFAULT 0,
  period_ref TEXT DEFAULT '',
  created_at TEXT NOT NULL
);`); } catch {}

try { db.exec(`CREATE TABLE IF NOT EXISTS perf_audit_reports (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  period_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  summary_json TEXT DEFAULT '{}',
  generated_at TEXT NOT NULL
);`); } catch {}

try { db.exec(`CREATE TABLE IF NOT EXISTS perf_snapshots (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  period_type TEXT NOT NULL,
  period_date TEXT NOT NULL,
  score_global INTEGER DEFAULT 0,
  score_calls INTEGER DEFAULT 0,
  score_quality INTEGER DEFAULT 0,
  score_conversion INTEGER DEFAULT 0,
  score_speed INTEGER DEFAULT 0,
  score_followup INTEGER DEFAULT 0,
  score_goals INTEGER DEFAULT 0,
  score_discipline INTEGER DEFAULT 0,
  score_regularity INTEGER DEFAULT 0,
  bonus_total INTEGER DEFAULT 0,
  penalty_total INTEGER DEFAULT 0,
  stats_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);`); } catch {}

try { db.exec("CREATE INDEX IF NOT EXISTS idx_perf_bp_company ON perf_bonus_penalty_logs(companyId, collaborator_id, created_at)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_perf_bp_type ON perf_bonus_penalty_logs(type, companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_perf_audit_company ON perf_audit_reports(companyId, collaborator_id)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_perf_snap_company ON perf_snapshots(companyId, collaborator_id, period_date)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_perf_snap_period ON perf_snapshots(period_type, period_date)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_perf_settings_company ON perf_score_settings(companyId)"); } catch {}

// ─── AI AGENTS (Client-facing & Training) ────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_agents (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'client',
    category TEXT DEFAULT 'general',
    status TEXT DEFAULT 'active',
    systemPrompt TEXT DEFAULT '',
    greeting TEXT DEFAULT '',
    questions_json TEXT DEFAULT '[]',
    personality TEXT DEFAULT '',
    language TEXT DEFAULT 'fr',
    voice TEXT DEFAULT 'alloy',
    maxDuration INTEGER DEFAULT 600,
    calendarId TEXT DEFAULT '',
    twilioNumber TEXT DEFAULT '',
    scoring_json TEXT DEFAULT '{}',
    scenario TEXT DEFAULT '',
    difficulty TEXT DEFAULT 'medium',
    totalCalls INTEGER DEFAULT 0,
    avgScore REAL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_agent_sessions (
    id TEXT PRIMARY KEY,
    agentId TEXT NOT NULL,
    companyId TEXT NOT NULL,
    collaboratorId TEXT DEFAULT '',
    callerPhone TEXT DEFAULT '',
    callerName TEXT DEFAULT '',
    callLogId TEXT DEFAULT '',
    transcription TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    score_json TEXT DEFAULT '{}',
    evaluation TEXT DEFAULT '',
    duration INTEGER DEFAULT 0,
    status TEXT DEFAULT 'completed',
    recordingUrl TEXT DEFAULT '',
    createdAt TEXT NOT NULL
  )
`);

try { db.exec("CREATE INDEX IF NOT EXISTS idx_ai_agents_company ON ai_agents(companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_agent ON ai_agent_sessions(agentId, createdAt)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_company ON ai_agent_sessions(companyId, createdAt)"); } catch {}

// ─── CALL FORMS ──────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS call_forms (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    fields_json TEXT DEFAULT '[]',
    assignedCollabs_json TEXT DEFAULT '[]',
    active INTEGER DEFAULT 1,
    responseCount INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS call_form_responses (
    id TEXT PRIMARY KEY,
    formId TEXT NOT NULL,
    companyId TEXT NOT NULL,
    contactId TEXT NOT NULL,
    collaboratorId TEXT NOT NULL,
    data_json TEXT DEFAULT '{}',
    callLogId TEXT DEFAULT '',
    createdAt TEXT NOT NULL
  )
`);

try { db.exec("CREATE INDEX IF NOT EXISTS idx_cfr_formId ON call_form_responses(formId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_cfr_contactId ON call_form_responses(contactId)"); } catch {}

// ─── HELPER FUNCTIONS ────────────────────────

// JSON fields → parse on read, stringify on write
const JSON_FIELDS = {
  companies: ['forbidden_words_json'],
  calendars: ['durations_json', 'questions_json', 'tags_json', 'collaborators_json'],
  bookings: ['tags_json'],
  availabilities: ['schedule_json'],
  workflows: [],
  routings: ['fields_json', 'rules_json'],
  polls: ['options_json', 'votes_json'],
  contacts: ['tags_json', 'docs_json', 'shared_with_json', 'nrp_followups_json', 'custom_fields_json'],
  settings: ['blackoutDates_json', 'vacations_json'],
  forms: ['fields_json', 'settings_json'],
  form_submissions: ['data_json'],
  pages: ['sections_json', 'settings_json', 'seo_json'],
  page_leads: ['data_json'],
  tickets: ['attachments_json', 'environment_json'],
  ticket_messages: ['attachments_json'],
  chat_messages: ['attachments_json'],
  call_logs: ['environment_json', 'shared_with_json'],
  custom_tables: ['columns_json', 'views_json', 'aiDispatchConfig_json'],
  custom_rows: ['data_json'],
  dispatch_tasks: ['targetData_json'],
  collaborators: ['secure_ia_words_json', 'lead_tags_json'],
  secure_ia_alerts: ['detectedWords_json'],
  secure_ia_reports: ['wordBreakdown_json'],
  ai_copilot_analyses: ['objections_json', 'actionItems_json', 'coachingTips_json', 'tags_json'],
  ai_profile_history: ['profile_snapshot_json'],
  ai_profile_suggestions: ['suggestion_json'],
  call_transcripts: ['segments_json'],
  lead_sources: ['config_json', 'mapping_json'],
  incoming_leads: ['data_json'],
  lead_import_logs: ['error_details_json', 'duplicate_details_json', 'mapping_json'],
  lead_history: ['details_json'],
  team_goals: ['collaborators_json'],
  user_activity_logs: ['metadata_json'],
  perf_score_settings: ['bonus_rules_json', 'penalty_rules_json'],
  perf_audit_reports: ['summary_json'],
  perf_snapshots: ['stats_json'],
  ai_agents: ['questions_json', 'scoring_json'],
  ai_agent_sessions: ['score_json'],
  call_forms: ['fields_json', 'assignedCollabs_json'],
  call_form_responses: ['data_json'],
};

// ─── Pipeline Templates (Phase 1) — tables + columns (idempotent) ─────────
try { ensurePipelineTemplatesSchema(db); } catch (e) { console.error("[PIPELINE_TEMPLATES SCHEMA]", e.message); }
try { ensureContactShareSchema(db); } catch (e) { console.error("[CONTACT_SHARE SCHEMA]", e.message); }

function parseRow(table, row) {
  if (!row) return null;
  const fields = JSON_FIELDS[table] || [];
  const parsed = { ...row };
  for (const f of fields) {
    if (parsed[f] != null) {
      try { parsed[f] = JSON.parse(parsed[f]); } catch { /* keep as string */ }
    }
  }
  // Convert _json field names to clean names for frontend
  for (const key of Object.keys(parsed)) {
    if (key.endsWith('_json')) {
      const clean = key.replace('_json', '');
      parsed[clean] = parsed[key];
      delete parsed[key];
    }
  }
  // Convert integers to booleans where needed
  if ('active' in parsed && table !== 'companies') parsed.active = !!parsed.active;
  if ('noShow' in parsed) parsed.noShow = !!parsed.noShow;
  if ('checkedIn' in parsed) parsed.checkedIn = !!parsed.checkedIn;
  if ('reconfirmed' in parsed) parsed.reconfirmed = !!parsed.reconfirmed;
  if ('requireApproval' in parsed) parsed.requireApproval = !!parsed.requireApproval;
  if ('allowRecurring' in parsed) parsed.allowRecurring = !!parsed.allowRecurring;
  if ('waitlistEnabled' in parsed) parsed.waitlistEnabled = !!parsed.waitlistEnabled;
  if ('reconfirm' in parsed) parsed.reconfirm = !!parsed.reconfirm;
  if ('managed' in parsed) parsed.managed = !!parsed.managed;
  if ('singleUse' in parsed) parsed.singleUse = !!parsed.singleUse;
  if ('videoAuto' in parsed) parsed.videoAuto = !!parsed.videoAuto;
  return parsed;
}

function parseRows(table, rows) {
  return rows.map(r => parseRow(table, r));
}

// Generic helpers
export function getAll(table) {
  return parseRows(table, db.prepare(`SELECT * FROM ${table}`).all());
}

export function getById(table, id) {
  return parseRow(table, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
}

export function getByCompany(table, companyId) {
  return parseRows(table, db.prepare(`SELECT * FROM ${table} WHERE companyId = ?`).all(companyId));
}

export function insert(table, data) {
  const keys = Object.keys(data);
  const placeholders = keys.map(() => '?').join(',');
  const values = keys.map(k => {
    const v = data[k];
    if (typeof v === 'object' && v !== null) return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });
  if (table === 'contacts' && data.custom_fields_json) {
    const cfIdx = keys.indexOf('custom_fields_json');
    console.log(`[DB INSERT contacts] keys has custom_fields_json at idx ${cfIdx}, value length: ${values[cfIdx]?.length}, value: ${String(values[cfIdx]).substring(0,80)}`);
  }
  db.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`).run(...values);
  return data;
}

export function update(table, id, data) {
  const sets = [];
  const values = [];
  for (const [k, v] of Object.entries(data)) {
    sets.push(`${k} = ?`);
    if (typeof v === 'object' && v !== null) values.push(JSON.stringify(v));
    else if (typeof v === 'boolean') values.push(v ? 1 : 0);
    else values.push(v);
  }
  values.push(id);
  db.prepare(`UPDATE ${table} SET ${sets.join(',')} WHERE id = ?`).run(...values);
  return getById(table, id);
}

export function remove(table, id) {
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}

// ─── SAFE DYNAMIC UPDATE — protège contre SQL injection via noms de colonnes ───
// Valide que les clés du body correspondent à des colonnes réelles de la table
const _tableColumnsCache = {};
export function safeUpdate(table, id, data, protectedFields = ['id', 'companyId']) {
  // Cache les colonnes de la table
  if (!_tableColumnsCache[table]) {
    _tableColumnsCache[table] = new Set(
      db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
    );
  }
  const validColumns = _tableColumnsCache[table];
  const safeData = {};
  for (const [k, v] of Object.entries(data)) {
    // Rejeter les clés qui ne sont pas des colonnes valides ou qui sont protégées
    if (!validColumns.has(k)) continue;
    if (protectedFields.includes(k)) continue;
    // Ignorer les champs internes prefixes par _ (flags front, pas des colonnes)
    if (k.startsWith('_')) continue;
    safeData[k] = v;
  }
  // V3: Auto-inject updatedAt sur contacts pour versionning de fraicheur
  if (table === 'contacts' && validColumns.has('updatedAt')) {
    safeData.updatedAt = new Date().toISOString();
  }
  if (Object.keys(safeData).length === 0) return null;
  const sets = [];
  const values = [];
  for (const [k, v] of Object.entries(safeData)) {
    sets.push(`${k} = ?`);
    if (typeof v === 'object' && v !== null) values.push(JSON.stringify(v));
    else if (typeof v === 'boolean') values.push(v ? 1 : 0);
    else values.push(v);
  }
  values.push(id);
  const result = db.prepare(`UPDATE ${table} SET ${sets.join(',')} WHERE id = ?`).run(...values);
  return { changes: result.changes, updated: Object.keys(safeData) };
}

/**
 * Resolve the effective timezone for a collaborator.
 * Priority: collaborator.timezone → settings.timezone → 'Europe/Paris'
 */
export function getCollaboratorTimezone(collaboratorId, companyId) {
  if (collaboratorId) {
    const row = db.prepare('SELECT timezone FROM collaborators WHERE id = ?').get(collaboratorId);
    if (row?.timezone) return row.timezone;
  }
  if (companyId) {
    const settings = db.prepare('SELECT timezone FROM settings WHERE companyId = ?').get(companyId);
    if (settings?.timezone) return settings.timezone;
  }
  return 'Europe/Paris';
}

/**
 * Validate a timezone string using Intl API.
 * Returns the canonical timezone name if valid, null if invalid.
 */
export function validateTimezone(tz) {
  if (!tz || typeof tz !== 'string') return null;
  try {
    // Intl.DateTimeFormat will throw for invalid timezones
    const fmt = new Intl.DateTimeFormat('en', { timeZone: tz });
    return fmt.resolvedOptions().timeZone; // returns canonical name (e.g. "Europe/Paris")
  } catch {
    return null;
  }
}

// ─── RBAC: Roles & Permissions ──────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT DEFAULT '',
    isSystem INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (companyId) REFERENCES companies(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_company_slug ON roles(companyId, slug);
  CREATE INDEX IF NOT EXISTS idx_roles_company ON roles(companyId);

  CREATE TABLE IF NOT EXISTS role_permissions (
    id TEXT PRIMARY KEY,
    roleId TEXT NOT NULL,
    permission TEXT NOT NULL,
    granted INTEGER DEFAULT 1,
    FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_role_perm_unique ON role_permissions(roleId, permission);
  CREATE INDEX IF NOT EXISTS idx_role_perm_role ON role_permissions(roleId);
`);

try { db.exec('ALTER TABLE collaborators ADD COLUMN roleId TEXT DEFAULT NULL'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_collaborators_roleId ON collaborators(roleId)'); } catch {}

// ─── Audit Logs (IMMUTABLE — no UPDATE/DELETE allowed) ──────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    companyId TEXT,
    userId TEXT,
    userName TEXT,
    userRole TEXT,
    action TEXT NOT NULL,
    category TEXT NOT NULL,
    entityType TEXT DEFAULT '',
    entityId TEXT DEFAULT '',
    detail TEXT DEFAULT '',
    metadata_json TEXT DEFAULT '{}',
    ipAddress TEXT DEFAULT '',
    userAgent TEXT DEFAULT '',
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs(companyId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(userId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, companyId);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entityType, entityId);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category, companyId, createdAt);
`);

// Immutability triggers — prevent UPDATE and DELETE on audit_logs
try { db.exec(`CREATE TRIGGER IF NOT EXISTS prevent_audit_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs is immutable'); END;`); } catch {}
try { db.exec(`CREATE TRIGGER IF NOT EXISTS prevent_audit_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs is immutable'); END;`); } catch {}

// ─── Entity History (field-level change tracking) ───────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS entity_history (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    entityType TEXT NOT NULL,
    entityId TEXT NOT NULL,
    field TEXT NOT NULL,
    oldValue TEXT,
    newValue TEXT,
    userId TEXT DEFAULT '',
    userName TEXT DEFAULT '',
    batchId TEXT DEFAULT '',
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entity_history_entity ON entity_history(entityType, entityId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_entity_history_company ON entity_history(companyId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_entity_history_batch ON entity_history(batchId);
  CREATE INDEX IF NOT EXISTS idx_entity_history_user ON entity_history(userId, createdAt);
`);

// ─── Seed system roles for existing companies ───────────────────────────

try {
  const _companies = db.prepare('SELECT id FROM companies').all();
  const _now = new Date().toISOString();
  const _defaultMemberPerms = [
    'contacts.view','contacts.create','contacts.edit',
    'bookings.view','bookings.create','bookings.edit',
    'calendars.view','pipeline.view','leads.view',
    'reports.view','chat.send','chat.view','calls.make','sms.view_history'
  ];
  for (const co of _companies) {
    const existing = db.prepare('SELECT id FROM roles WHERE companyId = ? AND isSystem = 1').all(co.id);
    if (existing.length === 0) {
      const adminRoleId = 'role_admin_' + co.id;
      const memberRoleId = 'role_member_' + co.id;
      db.prepare('INSERT OR IGNORE INTO roles (id, companyId, name, slug, description, isSystem, createdAt, updatedAt) VALUES (?,?,?,?,?,1,?,?)').run(adminRoleId, co.id, 'Administrateur', 'admin', 'Acces complet a toutes les fonctionnalites', _now, _now);
      db.prepare('INSERT OR IGNORE INTO roles (id, companyId, name, slug, description, isSystem, createdAt, updatedAt) VALUES (?,?,?,?,?,1,?,?)').run(memberRoleId, co.id, 'Membre', 'member', 'Acces standard collaborateur', _now, _now);
      for (const p of _defaultMemberPerms) {
        db.prepare('INSERT OR IGNORE INTO role_permissions (id, roleId, permission, granted) VALUES (?,?,?,1)').run('rp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), memberRoleId, p);
      }
    }
  }
} catch (e) { console.error('[ROLES SEED]', e.message); }

// ═══════════════════════════════════════════════════════════════════════
// V7 SOURCE/EXECUTOR MODEL — Schema migration + Helper functions
// À INSÉRER dans database.js AVANT la ligne "export { db, parseRow };"
// ═══════════════════════════════════════════════════════════════════════

// ─── V7-A.1 — contact_followers table + V7 columns ─────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_followers (
      id TEXT PRIMARY KEY,
      contactId TEXT NOT NULL,
      collaboratorId TEXT NOT NULL,
      companyId TEXT NOT NULL,
      role TEXT DEFAULT 'follower',
      trackingMode TEXT DEFAULT 'silent',
      isActive INTEGER DEFAULT 1,
      sourceColorKey TEXT DEFAULT '',
      lastKnownExecutorStage TEXT DEFAULT '',
      lastKnownExecutorLabel TEXT DEFAULT '',
      subStatus TEXT DEFAULT '',
      deactivatedAt TEXT DEFAULT '',
      deactivatedBy TEXT DEFAULT '',
      updatedAt TEXT DEFAULT '',
      createdAt TEXT DEFAULT ''
    );
  `);
} catch (e) { console.error('[V7] contact_followers create:', e.message); }

// V7 columns (safe ALTER TABLE — already existing columns are silently ignored)
const _v7Cols = [
  "role TEXT DEFAULT 'follower'",
  "trackingMode TEXT DEFAULT 'silent'",
  "isActive INTEGER DEFAULT 1",
  "sourceColorKey TEXT DEFAULT ''",
  "lastKnownExecutorStage TEXT DEFAULT ''",
  "lastKnownExecutorLabel TEXT DEFAULT ''",
  "subStatus TEXT DEFAULT ''",
  "deactivatedAt TEXT DEFAULT ''",
  "deactivatedBy TEXT DEFAULT ''",
  "updatedAt TEXT DEFAULT ''"
];
for (const col of _v7Cols) {
  try { db.exec(`ALTER TABLE contact_followers ADD COLUMN ${col}`); } catch {}
}

// V7 indexes
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_cf_unique_v7 ON contact_followers(contactId, collaboratorId, role) WHERE isActive = 1"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_cf_contact_company ON contact_followers(contactId, companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_cf_collab_company ON contact_followers(collaboratorId, companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_cf_role_active ON contact_followers(role, isActive, companyId)"); } catch {}

console.log('[V7] contact_followers schema ready');

// ═══════════════════════════════════════════════════════════════════════
// V1.11 Phase 2 — interaction_templates + interaction_responses
// Module Scripts / Questionnaires / Checklists
// Migration idempotente — safe boot répété sans erreur
// Source de vérité : docs/product-rules-interaction-templates-v1.md (figé 2026-04-29)
// ═══════════════════════════════════════════════════════════════════════

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS interaction_templates (
      id TEXT PRIMARY KEY,
      companyId TEXT NOT NULL,
      createdByCollaboratorId TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      scope TEXT DEFAULT 'personal',
      showByDefault INTEGER DEFAULT 0,
      content_json TEXT NOT NULL DEFAULT '{}',
      active INTEGER DEFAULT 1,
      version INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
} catch (e) { console.error('[V1.11] interaction_templates create:', e.message); }

// V1.11 ALTER safe — colonnes ajoutées progressivement (idempotent)
const _v111TemplateCols = [
  "description TEXT DEFAULT ''",
  "scope TEXT DEFAULT 'personal'",
  "showByDefault INTEGER DEFAULT 0",
  "active INTEGER DEFAULT 1",
  "version INTEGER DEFAULT 1"
];
for (const col of _v111TemplateCols) {
  try { db.exec(`ALTER TABLE interaction_templates ADD COLUMN ${col}`); } catch {}
}

// V1.11 indexes interaction_templates
try { db.exec("CREATE INDEX IF NOT EXISTS idx_int_tmpl_company ON interaction_templates(companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_int_tmpl_company_scope ON interaction_templates(companyId, scope)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_int_tmpl_creator ON interaction_templates(createdByCollaboratorId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_int_tmpl_show_default ON interaction_templates(companyId, showByDefault) WHERE showByDefault = 1"); } catch {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS interaction_responses (
      id TEXT PRIMARY KEY,
      companyId TEXT NOT NULL,
      templateId TEXT NOT NULL,
      templateType TEXT NOT NULL,
      contactId TEXT NOT NULL,
      collaboratorId TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      answers_json TEXT NOT NULL DEFAULT '{}',
      callLogId TEXT DEFAULT '',
      completedAt TEXT DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
} catch (e) { console.error('[V1.11] interaction_responses create:', e.message); }

// V1.11 ALTER safe interaction_responses
const _v111ResponseCols = [
  "templateType TEXT NOT NULL DEFAULT ''",
  "status TEXT DEFAULT 'draft'",
  "callLogId TEXT DEFAULT ''",
  "completedAt TEXT DEFAULT ''"
];
for (const col of _v111ResponseCols) {
  try { db.exec(`ALTER TABLE interaction_responses ADD COLUMN ${col}`); } catch {}
}

// V1.11 indexes interaction_responses (UNIQUE = 1 réponse par triplet template+contact+collab)
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_int_resp_unique ON interaction_responses(templateId, contactId, collaboratorId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_int_resp_contact ON interaction_responses(contactId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_int_resp_template ON interaction_responses(templateId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_int_resp_company ON interaction_responses(companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_int_resp_collab ON interaction_responses(collaboratorId, companyId)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_int_resp_calllog ON interaction_responses(callLogId) WHERE callLogId != ''"); } catch {}

console.log('[V1.11] interaction_templates + interaction_responses schema ready');

// ─── V7-A.1 — Helper functions ──────────────────────────────────────

/**
 * setActiveExecutor — Assign a new executor for a contact (deactivates previous)
 * @returns {{ previousExecutorId: string|null, newFollowerId: string }}
 */
export function setActiveExecutor(contactId, executorCollabId, companyId, opts = {}) {
  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    // 1. Deactivate ALL current active executors
    const activeExecs = db.prepare(
      "SELECT id, collaboratorId FROM contact_followers WHERE contactId = ? AND companyId = ? AND role = 'executor' AND isActive = 1"
    ).all(contactId, companyId);

    let previousExecutorId = null;
    for (const ex of activeExecs) {
      previousExecutorId = ex.collaboratorId;
      db.prepare(
        "UPDATE contact_followers SET isActive = 0, deactivatedAt = ?, deactivatedBy = ?, updatedAt = ? WHERE id = ?"
      ).run(now, opts.deactivatedBy || executorCollabId, now, ex.id);
    }

    // 2. Check for existing inactive executor row for this collab → reactivate
    const existing = db.prepare(
      "SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ? AND companyId = ? AND role = 'executor' AND isActive = 0"
    ).get(contactId, executorCollabId, companyId);

    let newFollowerId;
    if (existing) {
      db.prepare(
        "UPDATE contact_followers SET isActive = 1, deactivatedAt = '', deactivatedBy = '', updatedAt = ?, trackingMode = ?, sourceColorKey = ? WHERE id = ?"
      ).run(now, opts.trackingMode || 'active', opts.sourceColorKey || '', existing.id);
      newFollowerId = existing.id;
    } else {
      newFollowerId = 'cf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      db.prepare(
        "INSERT INTO contact_followers (id, contactId, collaboratorId, companyId, role, trackingMode, isActive, sourceColorKey, addedAt, updatedAt) VALUES (?,?,?,?,?,?,1,?,?,?)"
      ).run(newFollowerId, contactId, executorCollabId, companyId, 'executor', opts.trackingMode || 'active', opts.sourceColorKey || '', now, now);
    }

    return { previousExecutorId, newFollowerId };
  });
  return txn();
}

/**
 * addSourceFollower — Add a source follower (the collab who transferred the contact)
 * @returns {{ followerId: string }}
 */
export function addSourceFollower(contactId, sourceCollabId, companyId, opts = {}) {
  const now = new Date().toISOString();
  // Check existing inactive → reactivate
  const existing = db.prepare(
    "SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ? AND companyId = ? AND role = 'source' AND isActive = 0"
  ).get(contactId, sourceCollabId, companyId);

  if (existing) {
    db.prepare(
      "UPDATE contact_followers SET isActive = 1, deactivatedAt = '', deactivatedBy = '', updatedAt = ?, trackingMode = ?, sourceColorKey = ? WHERE id = ?"
    ).run(now, opts.trackingMode || 'silent', opts.sourceColorKey || '', existing.id);
    return { followerId: existing.id };
  }

  // Check if already active
  const active = db.prepare(
    "SELECT id FROM contact_followers WHERE contactId = ? AND collaboratorId = ? AND companyId = ? AND role = 'source' AND isActive = 1"
  ).get(contactId, sourceCollabId, companyId);
  if (active) return { followerId: active.id };

  const followerId = 'cf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  db.prepare(
    "INSERT INTO contact_followers (id, contactId, collaboratorId, companyId, role, trackingMode, isActive, sourceColorKey, addedAt, updatedAt) VALUES (?,?,?,?,?,?,1,?,?,?)"
  ).run(followerId, contactId, sourceCollabId, companyId, 'source', opts.trackingMode || 'silent', opts.sourceColorKey || '', now, now);
  return { followerId };
}

/**
 * updateExecutorStage — Update the last known stage/label on the active executor
 */
export function updateExecutorStage(contactId, companyId, stage, label) {
  const now = new Date().toISOString();
  const result = db.prepare(
    "UPDATE contact_followers SET lastKnownExecutorStage = ?, lastKnownExecutorLabel = ?, updatedAt = ? WHERE contactId = ? AND companyId = ? AND role = 'executor' AND isActive = 1"
  ).run(stage || '', label || '', now, contactId, companyId);
  return { updated: result.changes > 0 };
}

/**
 * updateFollowerInteraction — Generic update on any follower row
 */
export function updateFollowerInteraction(followerId, field, value) {
  const allowed = ['subStatus', 'trackingMode', 'sourceColorKey', 'lastKnownExecutorStage', 'lastKnownExecutorLabel'];
  if (!allowed.includes(field)) return { updated: false, error: 'Field not allowed' };
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE contact_followers SET ${field} = ?, updatedAt = ? WHERE id = ?`
  ).run(value || '', now, followerId);
  return { updated: result.changes > 0 };
}

/**
 * getContactFollowers — Get all followers for a contact, grouped by role
 */
export function getContactFollowers(contactId, companyId, opts = {}) {
  const where = opts.activeOnly !== false
    ? "WHERE cf.contactId = ? AND cf.companyId = ? AND cf.isActive = 1"
    : "WHERE cf.contactId = ? AND cf.companyId = ?";
  const rows = db.prepare(
    `SELECT cf.*, c.name as collaboratorName, c.email as collaboratorEmail
     FROM contact_followers cf
     LEFT JOIN collaborators c ON c.id = cf.collaboratorId
     ${where} ORDER BY cf.createdAt DESC`
  ).all(contactId, companyId);

  const grouped = { executor: null, sources: [], viewers: [], followers: [] };
  for (const r of rows) {
    if (r.role === 'executor') grouped.executor = r;
    else if (r.role === 'source') grouped.sources.push(r);
    else if (r.role === 'viewer') grouped.viewers.push(r);
    else grouped.followers.push(r);
  }
  return grouped;
}

/**
 * getActiveExecutor — Get the single active executor for a contact
 */
export function getActiveExecutor(contactId, companyId) {
  return db.prepare(
    `SELECT cf.*, c.name as collaboratorName, c.email as collaboratorEmail
     FROM contact_followers cf
     LEFT JOIN collaborators c ON c.id = cf.collaboratorId
     WHERE cf.contactId = ? AND cf.companyId = ? AND cf.role = 'executor' AND cf.isActive = 1`
  ).get(contactId, companyId) || null;
}

export { db, parseRow };
export default db;
