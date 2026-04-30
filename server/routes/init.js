import { Router } from 'express';
import { getAll, getByCompany, db } from '../db/database.js';
import { logAudit } from '../helpers/audit.js';

const router = Router();

// GET /api/init — Load all data for a company in one call (role-filtered)
router.get('/', (req, res) => {
  try {
    // ─── Determine auth context ───────────────────────
    const auth = req.auth; // set by global authenticate middleware (may be null)
    const isSupra = auth?.isSupra || false;
    const isAdmin = auth?.isAdmin || false;
    const authCompanyId = auth?.companyId || null;
    const authCollaboratorId = auth?.collaboratorId || null;
    const authRole = auth?.role || null; // 'supra', 'admin', 'member'

    // ════════════════════════════════════════════════════
    // SECURITY: No auth = no data. Period.
    // ════════════════════════════════════════════════════
    if (!auth) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    const companies = getAll('companies');

    // ════════════════════════════════════════════════════
    // SECURITY: Determine companyId — NO silent fallback
    // ════════════════════════════════════════════════════
    let companyId;
    if (isSupra) {
      // Priority: query param > session activeCompanyId > session companyId
      // NEVER fallback to companies[0] (could be demo data)
      const requestedId = req.query.companyId;
      const sessionActiveId = auth._activeCompanyId; // set by authenticate middleware
      companyId = requestedId || sessionActiveId || auth.companyId;

      // Validate the company actually exists
      if (companyId && !companies.find(c => c.id === companyId)) {
        logAudit(req, 'company_access_invalid', 'security', 'company', companyId, 'Supra requested non-existent company');
        companyId = null;
      }
    } else if (authCompanyId) {
      companyId = authCompanyId; // enforce own company — locked
    } else {
      // Authenticated but no company (should not happen for non-supra)
      return res.status(403).json({ error: 'Aucune entreprise associée à votre compte' });
    }

    // If supra has no valid company selected, return company list for selection
    if (!companyId && isSupra) {
      const allUsers = getAll('collaborators').filter(c => !c.archivedAt || c.archivedAt === '').map(c => ({
        id: c.id, companyId: c.companyId, companyName: companies.find(co => co.id === c.companyId)?.name || '',
        name: c.name, email: c.email, role: c.role,
        lastActive: new Date().toISOString().split('T')[0], status: 'active',
      }));
      return res.json({
        _needsCompanySelection: true, // Signal frontend to show company picker
        company: null,
        collaborators: [], calendars: [], bookings: [], availabilities: {},
        workflows: [], routings: [], polls: [], contacts: [],
        settings: { blackoutDates: [], vacations: [], timezone: 'Europe/Paris', language: 'fr', cancelPolicy: '', customDomain: '', brandColor: '#2563EB', reminder24h: true, reminder1h: true, reminder15min: false, reminderSms: false, google_chat_webhook: '', ga4_property_id: '', google_tasks_auto: true },
        smsCredits: 0, smsTransactions: [], activityLog: [], allCompanies: companies, allUsers,
      });
    }

    if (!companyId) {
      return res.status(404).json({ error: 'Aucune entreprise trouvée' });
    }

    let company = companies.find(c => c.id === companyId);
    // SECURITY: If company not found, return error — NEVER fallback to another company
    if (!company) {
      logAudit(req, 'company_not_found', 'security', 'company', companyId, 'Requested company does not exist');
      return res.status(404).json({ error: 'Entreprise introuvable' });
    }

    // ─── Load company-specific data ───────────────────
    // Wave D — filtre archivés par défaut. Pour vue admin "archivés" : ?includeArchived=1
    const includeArchivedCollabs = req.query.includeArchived === '1' || req.query.includeArchived === 'true';
    const _allCompanyCollabs = getByCompany('collaborators', companyId);
    const collaborators = includeArchivedCollabs ? _allCompanyCollabs : _allCompanyCollabs.filter(c => !c.archivedAt || c.archivedAt === '');
    // R3 — filtre orphelins : un calendar sans aucun collaborateur assigné est invisibilisé
    const isCalendarAssigned = (cal) => {
      try {
        const ids = Array.isArray(cal.collaborators) ? cal.collaborators : JSON.parse(cal.collaborators_json || '[]');
        return Array.isArray(ids) && ids.length > 0;
      } catch { return false; }
    };
    const calendars = getByCompany('calendars', companyId).filter(isCalendarAssigned);
    const bookings = db.prepare(`
      SELECT b.* FROM bookings b
      JOIN calendars c ON b.calendarId = c.id
      WHERE c.companyId = ?
    `).all(companyId);

    const parsedBookings = bookings.map(b => {
      const parsed = { ...b };
      if (parsed.tags_json) { try { parsed.tags = JSON.parse(parsed.tags_json); } catch { parsed.tags = []; } }
      else parsed.tags = [];
      delete parsed.tags_json;
      parsed.noShow = !!parsed.noShow;
      parsed.checkedIn = !!parsed.checkedIn;
      parsed.reconfirmed = !!parsed.reconfirmed;
      return parsed;
    });

    // Availabilities
    const availRows = collaborators.length > 0
      ? db.prepare(`SELECT * FROM availabilities WHERE collaboratorId IN (${collaborators.map(() => '?').join(',')})`).all(...collaborators.map(c => c.id))
      : [];
    const availabilities = {};
    for (const row of availRows) {
      try { availabilities[row.collaboratorId] = JSON.parse(row.schedule_json); }
      catch { availabilities[row.collaboratorId] = {}; }
    }

    const workflows = getByCompany('workflows', companyId);
    const routings = getByCompany('routings', companyId);
    const polls = getByCompany('polls', companyId);
    const contacts = getByCompany('contacts', companyId).filter(c => !c.archivedAt || c.archivedAt === ''); // V1.12.5.a — exclusion archivés
    const customTables = getByCompany('custom_tables', companyId);

    // Google Calendar events
    let googleEvents = [];
    try {
      const collabIds = collaborators.map(c => c.id);
      if (collabIds.length > 0) {
        const ph = collabIds.map(() => '?').join(',');
        googleEvents = db.prepare(`SELECT id, collaboratorId, summary, startTime, endTime, allDay FROM google_events WHERE collaboratorId IN (${ph}) ORDER BY startTime ASC`).all(...collabIds);
      }
    } catch (e) {}

    // Settings
    const settingsRow = db.prepare('SELECT * FROM settings WHERE companyId = ?').get(companyId);
    let settings = { blackoutDates: [], vacations: [], timezone: 'Europe/Paris', language: 'fr', cancelPolicy: '', customDomain: '', brandColor: '#2563EB', reminder24h: true, reminder1h: true, reminder15min: false, reminderSms: false, google_chat_webhook: '', ga4_property_id: '', google_tasks_auto: true };
    if (settingsRow) {
      settings = {
        blackoutDates: JSON.parse(settingsRow.blackoutDates_json || '[]'),
        vacations: JSON.parse(settingsRow.vacations_json || '[]'),
        timezone: settingsRow.timezone,
        language: settingsRow.language,
        cancelPolicy: settingsRow.cancelPolicy || '',
        customDomain: settingsRow.customDomain || '',
        brandColor: settingsRow.brandColor || '#2563EB',
        reminder24h: !!(settingsRow.reminder24h ?? 1),
        reminder1h: !!(settingsRow.reminder1h ?? 1),
        reminder15min: !!settingsRow.reminder15min,
        reminderSms: !!settingsRow.reminderSms,
        google_chat_webhook: settingsRow.google_chat_webhook || '',
        ga4_property_id: settingsRow.ga4_property_id || '',
        google_tasks_auto: !!(settingsRow.google_tasks_auto ?? 1),
      };
    }

    // SMS credits
    const smsRow = db.prepare('SELECT credits FROM sms_credits WHERE companyId = ?').get(companyId);
    const smsCredits = smsRow ? smsRow.credits : 0;
    const smsTransactions = getByCompany('sms_transactions', companyId);

    // Pipeline automations
    const pipelineAutomations = db.prepare('SELECT * FROM pipeline_automations WHERE companyId = ?').all(companyId);

    // VoIP data — check both voip_credits and telecom_credits tables
    const voipRow = db.prepare('SELECT credits FROM voip_credits WHERE companyId = ?').get(companyId);
    const telecomRow = db.prepare('SELECT balance FROM telecom_credits WHERE companyId = ?').get(companyId);
    const voipCredits = voipRow?.credits || telecomRow?.balance || 0;
    const voipSettingsRow = db.prepare('SELECT companyId FROM voip_settings WHERE companyId = ? AND active = 1').get(companyId);
    const voipConfigured = !!voipSettingsRow;
    const voipCallLogs = db.prepare('SELECT * FROM call_logs WHERE companyId = ? ORDER BY createdAt DESC LIMIT 100').all(companyId);

    // Phone Marketplace data
    const myPhoneNumbers = db.prepare(`
      SELECT pn.*, col.name as collaboratorName
      FROM phone_numbers pn
      LEFT JOIN collaborators col ON pn.collaboratorId = col.id
      WHERE pn.companyId = ?
    `).all(companyId);
    let phonePlans = [];
    try { phonePlans = db.prepare('SELECT * FROM phone_plans ORDER BY price ASC').all(); } catch {}
    let availableNumbers = [];
    try { availableNumbers = db.prepare("SELECT id, phoneNumber, friendlyName, country FROM phone_numbers WHERE status = 'available'").all(); } catch {}

    // VoIP & SMS Packs
    let voipPacks = [];
    try { voipPacks = db.prepare("SELECT * FROM voip_packs WHERE active = 1 ORDER BY price ASC").all(); } catch {}
    let smsPacks = [];
    try { smsPacks = db.prepare("SELECT * FROM sms_packs WHERE active = 1 ORDER BY price ASC").all(); } catch {}

    // Telecom credits
    let telecomCredits = 0;
    try {
      const tcRow = db.prepare('SELECT balance FROM telecom_credits WHERE companyId = ?').get(companyId);
      telecomCredits = tcRow ? tcRow.balance : 0;
    } catch {}

    let telecomCreditLogs = [];
    try {
      telecomCreditLogs = db.prepare('SELECT * FROM telecom_credit_logs WHERE companyId = ? ORDER BY createdAt DESC LIMIT 50').all(companyId);
    } catch {}

    // Pipeline stages
    let pipelineStages = [];
    try { pipelineStages = db.prepare('SELECT * FROM pipeline_stages WHERE companyId = ? ORDER BY position ASC').all(companyId); } catch {}

    // Contact field definitions (custom fields)
    let contactFieldDefs = [];
    try {
      contactFieldDefs = db.prepare('SELECT * FROM contact_field_definitions WHERE companyId = ? ORDER BY position ASC, createdAt ASC').all(companyId);
      contactFieldDefs = contactFieldDefs.map(r => { try { r.options = JSON.parse(r.options_json || '[]'); } catch { r.options = []; } return r; });
    } catch {}

    // Conversations (Ringover-style threads)
    let conversations = [];
    try { conversations = db.prepare('SELECT * FROM conversations WHERE companyId = ? ORDER BY lastActivityAt DESC LIMIT 50').all(companyId); } catch {}

    // ═══════════════════════════════════════════════════
    // ROLE-BASED RESPONSE FILTERING
    // ═══════════════════════════════════════════════════

    if (isSupra) {
      // ─── SUPRA ADMIN: gets everything ───────────────
      let allPhoneNumbers = [];
      try { allPhoneNumbers = db.prepare('SELECT * FROM phone_numbers').all(); } catch {}

      let allTelecomCredits = {};
      try {
        const tcRows = db.prepare('SELECT companyId, balance FROM telecom_credits').all();
        for (const r of tcRows) allTelecomCredits[r.companyId] = r.balance;
      } catch {}

      const activityLog = getAll('activity_logs');
      const allSmsCredits = {};
      const smsRows2 = db.prepare('SELECT companyId, credits FROM sms_credits').all();
      for (const r of smsRows2) allSmsCredits[r.companyId] = r.credits;

      const allCompanies = companies;
      const allUsers = getAll('collaborators').filter(c => !c.archivedAt || c.archivedAt === '').map(c => ({
        id: c.id, companyId: c.companyId,
        companyName: companies.find(co => co.id === c.companyId)?.name || '',
        name: c.name, email: c.email, role: c.role,
        phone: c.phone || '', color: c.color || '#2563EB',
        lastActive: new Date().toISOString().split('T')[0], status: 'active',
      }));

      const allCalendars = getAll('calendars').filter(isCalendarAssigned).map(cal => ({
        ...cal, companyName: companies.find(co => co.id === cal.companyId)?.name || '',
      }));

      const allBookings = db.prepare(`
        SELECT b.*, c.companyId, c.name as calendarName FROM bookings b
        JOIN calendars c ON b.calendarId = c.id
      `).all().map(b => ({
        ...b, companyName: companies.find(co => co.id === b.companyId)?.name || '',
        tags: b.tags_json ? JSON.parse(b.tags_json) : [],
        noShow: !!b.noShow, checkedIn: !!b.checkedIn, reconfirmed: !!b.reconfirmed,
      }));

      const allContacts = getAll('contacts').filter(c => !c.archivedAt || c.archivedAt === '').map(ct => ({ // V1.12.5.a — exclusion archivés cross-company
        ...ct, companyName: companies.find(co => co.id === ct.companyId)?.name || '',
      }));

      return res.json({
        company, collaborators, calendars, bookings: parsedBookings, availabilities,
        workflows, routings, polls, contacts, settings, pipelineAutomations,
        smsCredits, smsTransactions, voipCredits, voipConfigured, voipCallLogs,
        activityLog, allCompanies, allUsers, allSmsCredits,
        allCalendars, allBookings, allContacts,
        myPhoneNumbers, phonePlans, availableNumbers, allPhoneNumbers,
        voipPacks, smsPacks, telecomCredits, allTelecomCredits, telecomCreditLogs,
        pipelineStages, customTables, googleEvents, conversations, contactFieldDefs,
      });
    }

    if (isAdmin) {
      // ─── ADMIN ENTREPRISE: own company only ─────────
      return res.json({
        company, collaborators, calendars, bookings: parsedBookings, availabilities,
        workflows, routings, polls, contacts, settings, pipelineAutomations,
        smsCredits, smsTransactions, voipCredits, voipConfigured, voipCallLogs,
        activityLog: [], // no cross-company logs
        allCompanies: [], allUsers: [], allSmsCredits: {},
        allCalendars: [], allBookings: [], allContacts: [],
        myPhoneNumbers, phonePlans, availableNumbers,
        allPhoneNumbers: [], // no global stock view
        voipPacks, smsPacks, telecomCredits, allTelecomCredits: {}, telecomCreditLogs,
        pipelineStages, customTables, googleEvents, conversations, contactFieldDefs,
      });
    }

    // ─── COLLABORATEUR (member): minimal data ─────────
    // Filter to only this collaborator's data
    const collabId = authCollaboratorId;
    // V1.8.4 — Cross-collab booking : exposer tous les calendars de la company (pas de PII).
    const myCalendars = calendars;
    const myCalendarIds = new Set(myCalendars.map(c => c.id));
    // V1.8.4 — Set des calendars dont je suis listé propriétaire (utilisé pour identifier mes bookings).
    const _myOwnedCalendarIds = new Set(calendars.filter(cal => {
      try {
        const ids = Array.isArray(cal.collaborators) ? cal.collaborators : (typeof cal.collaborators_json === 'string' ? JSON.parse(cal.collaborators_json) : []);
        return ids.includes(collabId);
      } catch { return false; }
    }).map(c => c.id));
    // V1.8.4 — Cross-collab booking : exposer tous les bookings de la company.
    // Pour les bookings hors de mon périmètre, whitelist explicite (slot footprint only, ZERO PII).
    // Future-safe : tout nouveau champ ajouté à bookings reste invisible par défaut.
    const myBookings = parsedBookings.map(b => {
      const isMine = b.collaboratorId === collabId || _myOwnedCalendarIds.has(b.calendarId);
      if (isMine) return b;
      return {
        id: b.id,
        calendarId: b.calendarId,
        collaboratorId: b.collaboratorId,
        date: b.date,
        time: b.time,
        duration: b.duration,
        status: b.status,
        noShow: b.noShow,
        checkedIn: b.checkedIn,
        reconfirmed: b.reconfirmed,
        source: b.source,
        googleEventId: b.googleEventId,
        companyId: b.companyId,
        bookedByCollaboratorId: b.bookedByCollaboratorId,
        meetingCollaboratorId: b.meetingCollaboratorId,
        agendaOwnerId: b.agendaOwnerId,
        bookingType: b.bookingType,
        bookingOutcomeAt: b.bookingOutcomeAt,
        transferMode: b.transferMode,
        _foreign: true,
      };
    });

    // ── Contacts: chaque collaborateur ne voit QUE ses contacts ──
    // REGLE: pas de pool commun. Un contact non-assigné n'est visible par personne
    // sauf l'admin qui voit tout. L'admin doit assigner les contacts aux collaborateurs.
    console.log(`[INIT] Collab ${collabId} (role=${authRole}) → filtering ${contacts.length} contacts`);
    const myContacts = contacts.filter(c => {
      if (c.assignedTo === collabId) return true;          // owns it
      // V1.10.4 P1 — parseRow renomme shared_with_json en shared_with (array). Lire les 2 sans casser.
      const shared = Array.isArray(c.shared_with)
        ? c.shared_with
        : (() => { try { return JSON.parse(c.shared_with_json || '[]'); } catch { return []; } })();
      if (shared.includes(collabId)) return true;          // shared with me
      return false;
    });

    // ── Goals / Objectives for this collaborator ──
    let myGoals = [], myTeamGoals = [], myRewards = [];
    try {
      myGoals = db.prepare("SELECT * FROM user_goals WHERE companyId = ? AND collaborator_id = ? ORDER BY created_at DESC").all(companyId, collabId);
      const allTeam = db.prepare("SELECT * FROM team_goals WHERE companyId = ? ORDER BY created_at DESC").all(companyId);
      myTeamGoals = allTeam.filter(tg => { try { return JSON.parse(tg.collaborators_json || '[]').includes(collabId); } catch { return false; } });
      myRewards = db.prepare("SELECT * FROM goal_rewards WHERE companyId = ? AND collaborator_id = ? ORDER BY created_at DESC").all(companyId, collabId);
    } catch {}

    return res.json({
      company, collaborators, // team list needed for display
      calendars: myCalendars,
      bookings: myBookings,
      // V1.8.4 — Toutes les availabilities de la company (pour calculer slots cross-collab).
      availabilities,
      workflows: [], routings: [], polls: [], contacts: myContacts,
      // DEBUG: log contact count for this collab
      settings, pipelineAutomations: pipelineAutomations.filter(pa=>pa.collaboratorId===collabId),
      smsCredits, smsTransactions: [],
      voipCredits, voipConfigured,
      voipCallLogs: voipCallLogs.filter(cl => {
        if (cl.collaboratorId === collabId) return true;
        try { return JSON.parse(cl.shared_with_json || '[]').includes(collabId); } catch { return false; }
      }),
      activityLog: [], allCompanies: [], allUsers: [], allSmsCredits: {},
      allCalendars: [], allBookings: [], allContacts: [],
      myPhoneNumbers: myPhoneNumbers.filter(n => n.collaboratorId === collabId),
      phonePlans: [], availableNumbers: [], allPhoneNumbers: [],
      voipPacks: [], smsPacks: [],
      telecomCredits: 0, allTelecomCredits: {}, telecomCreditLogs: [],
      pipelineStages, customTables,
      contactFieldDefs: contactFieldDefs.filter(d => d.scope === 'company' || d.createdBy === collabId),
      // V1.8.4 — Tous les events GCal de la company. Summary remplacée par "Occupé" pour les autres collabs.
      googleEvents: googleEvents.map(e => e.collaboratorId === collabId ? e : { ...e, summary: 'Occupé' }),
      conversations: conversations.filter(c => c.collaboratorId === collabId),
      myGoals, myTeamGoals, myRewards,
    });

  } catch (err) {
    console.error('[INIT ERROR]', err);
    res.status(500).json({ error: 'Erreur de chargement des données' });
  }
});

export default router;
