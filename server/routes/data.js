import { Router } from 'express';
import { db, getByCompany, getAll, insert, remove, safeUpdate } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { logAudit } from '../helpers/audit.js';
import { trackChanges } from '../helpers/entityHistory.js';
import { isValidEmail, isValidPhone } from '../services/leadImportEngine.js';
import { createNotification } from './notifications.js';
import { markScoreDirty, computeDirtyScores } from '../services/leadScoring.js';
import { computeNextActions } from '../services/nextBestAction.js';
import { requirePipelineFreeMode } from '../middleware/requirePipelineFreeMode.js';
import { resolvePipelineStages } from '../services/pipelineTemplates/resolve.js';
const router = Router();

// ─── WORKFLOWS ───
router.get('/workflows', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    res.json(getByCompany('workflows', companyId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/workflows', requireAuth, enforceCompany, (req, res) => {
  try {
    const w = req.body;
    if (!w.companyId) return res.status(400).json({ error: 'companyId requis' });
    const id = w.id || 'w' + Date.now();
    insert('workflows', { id, companyId: w.companyId, name: w.name, trigger_type: w.trigger, delay: w.delay || 0, action: w.action, template: w.template || '', active: w.active !== false ? 1 : 0 });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/workflows/:id', requireAuth, (req, res) => {
  try {
    const record = db.prepare('SELECT companyId FROM workflows WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && record.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const data = { ...req.body };
    if ('trigger' in data) { data.trigger_type = data.trigger; delete data.trigger; }
    if ('active' in data) data.active = data.active ? 1 : 0;
    const result = safeUpdate('workflows', req.params.id, data);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/workflows/:id', requireAuth, (req, res) => {
  try {
    const record = db.prepare('SELECT companyId FROM workflows WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && record.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    remove('workflows', req.params.id); res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ROUTINGS ───
router.get('/routings', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    res.json(getByCompany('routings', companyId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/routings', requireAuth, enforceCompany, (req, res) => {
  try {
    const r = req.body;
    if (!r.companyId) return res.status(400).json({ error: 'companyId requis' });
    const id = r.id || 'rf' + Date.now();
    insert('routings', { id, companyId: r.companyId, name: r.name, fields_json: JSON.stringify(r.fields || []), rules_json: JSON.stringify(r.rules || []), active: r.active !== false ? 1 : 0 });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/routings/:id', requireAuth, (req, res) => {
  try {
    const record = db.prepare('SELECT companyId FROM routings WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && record.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const data = { ...req.body };
    if (data.fields) { data.fields_json = JSON.stringify(data.fields); delete data.fields; }
    if (data.rules) { data.rules_json = JSON.stringify(data.rules); delete data.rules; }
    if ('active' in data) data.active = data.active ? 1 : 0;
    const result = safeUpdate('routings', req.params.id, data);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POLLS ───
router.get('/polls', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    res.json(getByCompany('polls', companyId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/polls', requireAuth, enforceCompany, (req, res) => {
  try {
    const p = req.body;
    if (!p.companyId) return res.status(400).json({ error: 'companyId requis' });
    const id = p.id || 'p' + Date.now();
    insert('polls', { id, companyId: p.companyId, title: p.title, creator: p.creator, options_json: JSON.stringify(p.options || []), votes_json: JSON.stringify(p.votes || {}), status: p.status || 'open', expires: p.expires || '' });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/polls/:id', requireAuth, (req, res) => {
  try {
    const record = db.prepare('SELECT companyId FROM polls WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && record.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const data = { ...req.body };
    if (data.options) { data.options_json = JSON.stringify(data.options); delete data.options; }
    if (data.votes) { data.votes_json = JSON.stringify(data.votes); delete data.votes; }
    const result = safeUpdate('polls', req.params.id, data);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CONTACTS ───
router.get('/contacts', requireAuth, enforceCompany, requirePermission('contacts.view'), (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    // Isolation collaborateur : collab voit seulement ses contacts
    if (!req.auth.isSupra && !req.auth.isAdmin) {
      const rows = db.prepare('SELECT * FROM contacts WHERE companyId = ? AND (assignedTo = ? OR sharedWithId = ? OR shared_with_json LIKE ?)').all(companyId, req.auth.collaboratorId, req.auth.collaboratorId, '%' + req.auth.collaboratorId + '%');
      return res.json(rows);
    }
    res.json(getByCompany('contacts', companyId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// V1.12.4 — GET /api/data/contacts/archived
// Liste les contacts archives (archivedAt != '') pour la company.
// IMPORTANT : declare AVANT '/contacts/:id' pour ne pas etre intercepte (match ordre Express).
// Mode "dark" V1.12.4 : pas encore branche cote frontend (V1.12.8).
// Scope :
//   - admin/supra : tous les archives de la company
//   - collab     : archives ou il est assignedTo OR sharedWithId OR shared_with_json
router.get('/contacts/archived', requireAuth, enforceCompany, requirePermission('contacts.view'), (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    if (!req.auth.isSupra && !req.auth.isAdmin) {
      const rows = db.prepare(
        "SELECT * FROM contacts WHERE companyId = ? AND archivedAt IS NOT NULL AND archivedAt != '' " +
        "AND (assignedTo = ? OR sharedWithId = ? OR shared_with_json LIKE ?) " +
        "ORDER BY archivedAt DESC"
      ).all(companyId, req.auth.collaboratorId, req.auth.collaboratorId, '%' + req.auth.collaboratorId + '%');
      return res.json(rows);
    }
    const rows = db.prepare(
      "SELECT * FROM contacts WHERE companyId = ? AND archivedAt IS NOT NULL AND archivedAt != '' " +
      "ORDER BY archivedAt DESC"
    ).all(companyId);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── V3: GET SINGLE CONTACT — refetch unitaire propre ───
router.get('/contacts/:id', requireAuth, requirePermission('contacts.view'), (req, res) => {
  try {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact non trouvé' });
    const authCompanyId = req.auth?.companyId;
    if (authCompanyId && contact.companyId !== authCompanyId) return res.status(403).json({ error: 'Accès interdit' });
    if (!req.auth.isSupra && !req.auth.isAdmin) {
      const sw = JSON.parse(contact.shared_with_json || '[]');
      if (contact.assignedTo !== req.auth.collaboratorId && contact.sharedWithId !== req.auth.collaboratorId && !sw.includes(req.auth.collaboratorId)) {
        return res.status(403).json({ error: 'Accès interdit' });
      }
    }
    res.json(contact);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── V4: HISTORIQUE STATUT D'UN CONTACT ───
router.get('/contacts/:id/status-history', requireAuth, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM contact_status_history WHERE contactId = ? ORDER BY createdAt DESC LIMIT 50').all(req.params.id);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── V4: ANOMALIES SYSTEME (admin only) ───
router.get('/anomalies', requireAuth, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const rows = db.prepare('SELECT * FROM system_anomaly_logs WHERE companyId = ? ORDER BY createdAt DESC LIMIT 100').all(companyId);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── V5: NEXT BEST ACTIONS — actions recommandees par collaborateur ───
router.get('/next-actions', requireAuth, (req, res) => {
  try {
    const collaboratorId = req.query.collaboratorId || req.auth?.collaboratorId;
    const companyId = req.query.companyId || req.auth?.companyId;
    if (!collaboratorId || !companyId) return res.status(400).json({ error: 'collaboratorId + companyId requis' });
    const actions = computeNextActions(collaboratorId, companyId);
    res.json({ actions, total: actions.length, urgent: actions.filter(a => a.priority <= 2).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── V5: MANAGER DASHBOARD — vue consolidee equipe ───
router.get('/manager-dashboard', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId || req.auth?.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    // Collabs de la company
    const collabs = db.prepare('SELECT id, name, color, role FROM collaborators WHERE companyId = ?').all(companyId);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    // Stats par collab
    const collabStats = collabs.map(c => {
      const actions = computeNextActions(c.id, companyId);
      const avgScore = db.prepare('SELECT AVG(lead_score) as avg FROM contacts WHERE companyId = ? AND assignedTo = ? AND lead_score > 0').get(companyId, c.id)?.avg || 0;
      const totalContacts = db.prepare('SELECT COUNT(*) as c FROM contacts WHERE companyId = ? AND assignedTo = ?').get(companyId, c.id)?.c || 0;
      const validCalls = db.prepare('SELECT COUNT(*) as c FROM call_logs WHERE companyId = ? AND collaboratorId = ? AND is_valid_call = 1 AND createdAt > ?').get(companyId, c.id, thirtyDaysAgo)?.c || 0;
      return {
        id: c.id, name: c.name, color: c.color, role: c.role,
        actionsCount: actions.length,
        urgentActions: actions.filter(a => a.priority <= 2).length,
        avgScore: Math.round(avgScore),
        totalContacts, validCalls
      };
    });

    // Contacts a risque
    const yesterday = new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 10);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const rdvNonQualifies = db.prepare("SELECT id, name, assignedTo, next_rdv_date FROM contacts WHERE companyId = ? AND pipeline_stage = 'rdv_programme' AND next_rdv_date != '' AND next_rdv_date < ? LIMIT 10").all(companyId, yesterday);
    const nrpCritiques = db.prepare("SELECT id, name, assignedTo, nrp_followups_json FROM contacts WHERE companyId = ? AND pipeline_stage = 'nrp' LIMIT 20").all(companyId)
      .filter(ct => { try { return JSON.parse(ct.nrp_followups_json || '[]').length >= 5; } catch { return false; } }).slice(0, 10);
    const inactifs = db.prepare("SELECT id, name, assignedTo, updatedAt FROM contacts WHERE companyId = ? AND pipeline_stage IN ('contacte','qualifie') AND updatedAt < ? AND updatedAt != '' LIMIT 10").all(companyId, fourteenDaysAgo);

    // Anomalies recentes
    const anomalies = db.prepare('SELECT * FROM system_anomaly_logs WHERE companyId = ? ORDER BY createdAt DESC LIMIT 20').all(companyId);

    res.json({ collabStats, risques: { rdvNonQualifies, nrpCritiques, inactifs }, anomalies });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── V5: COMPUTE SCORES — recalcul batch des lead_scores (admin only) ───
router.post('/contacts/compute-scores', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.body.companyId || req.auth?.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const updated = computeDirtyScores(companyId);
    res.json({ success: true, updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SYNC BATCH — upsert contacts from frontend to prevent data loss ───
router.post('/contacts/sync-batch', requireAuth, enforceCompany, requirePermission('contacts.edit'), (req, res) => {
  try {
    const { contacts: cts, companyId } = req.body;
    if (!Array.isArray(cts) || !companyId) return res.status(400).json({ error: 'contacts array + companyId requis' });
    let synced = 0, skipped = 0;
    const getExisting = db.prepare('SELECT * FROM contacts WHERE id = ? AND companyId = ?');
    // SAFE fields that sync-batch can update (NON-CRITICAL display info only)
    // PROTECTED: name, firstname, lastname, pipeline_stage, notes, nrp_*, contract_*, rdv_*, assignedTo, source, createdAt
    // ALSO PROTECTED: email, phone, mobile, address, company, website, siret — NEVER overwrite non-empty with empty
    // name/firstname/lastname are PROTECTED because individual PUT edits must persist
    for (const c of cts) {
      if (!c.id) { skipped++; continue; }
      const existing = getExisting.get(c.id, companyId);
      if (!existing) { skipped++; continue; }
      // SECURITE: non-admin ne peut sync que SES contacts
      if (req.auth.role !== 'admin' && !req.auth.isSupra && existing.assignedTo !== req.auth.collaboratorId) { skipped++; continue; }
      try {
        // REGLE CRITIQUE: ne JAMAIS écraser un champ rempli par une valeur vide
        const safeVal = (newVal, existingVal) => (newVal && newVal.trim && newVal.trim()) ? newVal : (existingVal || '');
        db.prepare(`UPDATE contacts SET
          email = ?, phone = ?, totalBookings = ?, lastVisit = ?,
          tags_json = ?, rating = ?, docs_json = ?, address = ?,
          shared_with_json = ?, custom_fields_json = ?,
          company = ?, mobile = ?, website = ?,
          contact_type = ?, siret = ?, sympathy_score = ?, status = ?
          WHERE id = ? AND companyId = ?`).run(
          safeVal(c.email, existing.email), safeVal(c.phone, existing.phone),
          c.totalBookings||existing.totalBookings||0, c.lastVisit||existing.lastVisit||'',
          JSON.stringify(c.tags||[]), c.rating??existing.rating??null,
          JSON.stringify(c.docs||[]), safeVal(c.address, existing.address),
          JSON.stringify(c.shared_with||[]),
          c.custom_fields_json||existing.custom_fields_json||JSON.stringify(c.custom_fields||[]),
          safeVal(c.company, existing.company), safeVal(c.mobile, existing.mobile), safeVal(c.website, existing.website),
          c.contact_type||existing.contact_type||'btc', safeVal(c.siret, existing.siret),
          c.sympathy_score||existing.sympathy_score||50, c.status||existing.status||'prospect',
          c.id, companyId
        );
        synced++;
      } catch { skipped++; }
    }
    console.log(`[CONTACTS SYNC] ${synced} synced, ${skipped} skipped for company ${companyId} (pipeline_stage PROTECTED)`);
    res.json({ success: true, synced, skipped });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/contacts', requireAuth, enforceCompany, requirePermission('contacts.create'), (req, res) => {
  try {
    const c = req.body;
    if (!c.companyId) return res.status(400).json({ error: 'companyId requis' });
    // Bloquer si email = collaborateur
    if (c.email) {
      const isCollab = db.prepare('SELECT id FROM collaborators WHERE email = ? AND companyId = ?').get(c.email.toLowerCase().trim(), c.companyId);
      if (isCollab) return res.status(400).json({ error: 'Ce contact est un collaborateur de l\'équipe' });
    }
    // Valider pipeline_stage si fourni
    if (c.pipeline_stage) {
      const VALID_STAGES = ['nouveau','contacte','qualifie','rdv_programme','nrp','client_valide','perdu'];
      let customStages = [];
      try { customStages = db.prepare('SELECT id FROM pipeline_stages WHERE companyId = ?').all(c.companyId).map(s => s.id); } catch {}
      if (![...VALID_STAGES, ...customStages].includes(c.pipeline_stage)) {
        return res.status(400).json({ error: 'pipeline_stage invalide: ' + c.pipeline_stage });
      }
    }
    // Forcer assignedTo : non-admin = toujours soi-même (anti-spoof)
    // Admin/supra sans assignedTo = s'assigner soi-même (jamais de contact orphelin)
    if (!req.auth.isAdmin && !req.auth.isSupra) {
      c.assignedTo = req.auth.collaboratorId || req.auth.userId;
    } else if (!c.assignedTo) {
      c.assignedTo = req.auth.collaboratorId || req.auth.userId || '';
    }
    // Valider email/phone format
    if (c.email && !isValidEmail(c.email)) {
      return res.status(400).json({ error: 'Format email invalide' });
    }
    if (c.phone && !isValidPhone(c.phone)) {
      return res.status(400).json({ error: 'Format téléphone invalide (6-20 chiffres attendus)' });
    }
    // Anti-doublon : si un contact avec le meme email OU phone existe deja dans la company → rejeter
    if (c.email) {
      const dupEmail = db.prepare("SELECT id FROM contacts WHERE companyId = ? AND email = ? AND email != '' AND COALESCE(pipeline_stage, '') != 'perdu' AND (archivedAt IS NULL OR archivedAt = '')").get(c.companyId, c.email.trim().toLowerCase());
      if (dupEmail) return res.json({ success: true, id: dupEmail.id, _duplicate: true });
    }
    if (c.phone) {
      const cleanPhone = c.phone.replace(/[^\d+]/g, '').slice(-9);
      if (cleanPhone.length >= 6) {
        const candidates = db.prepare("SELECT id, phone FROM contacts WHERE companyId = ? AND phone != '' AND COALESCE(pipeline_stage, '') != 'perdu' AND (archivedAt IS NULL OR archivedAt = '')").all(c.companyId);
        const dup = candidates.find(ct => ct.phone.replace(/[^\d+]/g, '').slice(-9) === cleanPhone);
        if (dup) return res.json({ success: true, id: dup.id, _duplicate: true });
      }
    }
    const id = 'ct_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const cfj = c.custom_fields_json || '[]';
    console.log('[CONTACT INSERT]', c.name, 'custom_fields_json length:', cfj.length, 'value:', cfj.substring(0,80));
    insert('contacts', { id, companyId: c.companyId, name: c.name, email: c.email || '', phone: c.phone || '', totalBookings: c.totalBookings || 0, lastVisit: c.lastVisit || '', tags_json: JSON.stringify(c.tags || []), notes: c.notes || '', rating: c.rating || null, docs_json: JSON.stringify(c.docs || []), pipeline_stage: c.pipeline_stage || 'nouveau', assignedTo: c.assignedTo || '', shared_with_json: JSON.stringify(c.shared_with || []), source: c.source || 'manual', contact_type: c.contact_type || 'btc', siret: c.siret || '', firstname: c.firstname || '', lastname: c.lastname || '', company: c.company || '', mobile: c.mobile || '', website: c.website || '', address: c.address || '', custom_fields_json: cfj, createdAt: c.createdAt || new Date().toISOString() });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ─── CHECK DUPLICATES (batch, pour import CSV frontend) ───
router.post('/contacts/check-duplicates', requireAuth, enforceCompany, (req, res) => {
  try {
    const { emails, phones } = req.body;
    const companyId = req.auth.companyId;
    const dupEmails = new Set();
    const dupPhones = new Set();
    if (emails && emails.length) {
      const placeholders = emails.map(() => '?').join(',');
      // V1.11.5 — exclure pipeline_stage='perdu' (alignement POST /contacts) — soft-delete strict
      const rows = db.prepare(`SELECT LOWER(email) as em FROM contacts WHERE companyId = ? AND LOWER(email) IN (${placeholders}) AND email != '' AND COALESCE(pipeline_stage, '') != 'perdu' AND (archivedAt IS NULL OR archivedAt = '')`).all(companyId, ...emails.map(e => e.toLowerCase().trim()));
      rows.forEach(r => dupEmails.add(r.em));
    }
    if (phones && phones.length) {
      const cleaned = phones.map(p => (p || '').replace(/[\s\-\.\(\)]/g, '')).filter(Boolean);
      if (cleaned.length) {
        // V1.11.5 — exclure pipeline_stage='perdu' (alignement POST /contacts) — soft-delete strict
        const allPhones = db.prepare("SELECT phone FROM contacts WHERE companyId = ? AND phone != '' AND COALESCE(pipeline_stage, '') != 'perdu' AND (archivedAt IS NULL OR archivedAt = '')").all(companyId);
        const existSet = new Set(allPhones.map(r => r.phone.replace(/[\s\-\.\(\)]/g, '')));
        cleaned.forEach((cp, i) => { if (existSet.has(cp)) dupPhones.add(phones[i]); });
      }
    }
    res.json({ dupEmails: [...dupEmails], dupPhones: [...dupPhones] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── V1.8.22 Phase A — CHECK DUPLICATE SINGLE (modal RDV / création contact) ───
// Singular endpoint pour pré-création contact dans modal RDV.
// Différent du batch /check-duplicates (CSV import) — retourne le détail des
// matches avec ownership pour permettre au frontend d'afficher modal de résolution.
router.post('/contacts/check-duplicate-single', requireAuth, enforceCompany, (req, res) => {
  try {
    const { email, phone } = req.body || {};
    const companyId = req.auth.companyId;
    if (!email && !phone) {
      return res.json({ exists: false, conflict: false, matches: [] });
    }

    let emailMatch = null;
    let phoneMatch = null;
    const matches = [];

    if (email) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (cleanEmail) {
        // V1.11.5 — exclure pipeline_stage='perdu' (alignement POST /contacts) — soft-delete strict
        emailMatch = db.prepare(
          "SELECT id, name, email, phone, mobile, assignedTo, shared_with_json, pipeline_stage, companyId FROM contacts WHERE companyId = ? AND LOWER(email) = ? AND email != '' AND COALESCE(pipeline_stage, '') != 'perdu' AND (archivedAt IS NULL OR archivedAt = '')"
        ).get(companyId, cleanEmail);
        if (emailMatch) matches.push({ ...emailMatch, matchedBy: 'email' });
      }
    }

    if (phone) {
      const cleanPhone = String(phone).replace(/[^\d]/g, '').slice(-9);
      if (cleanPhone.length >= 6) {
        // V1.11.5 — exclure pipeline_stage='perdu' (alignement POST /contacts) — soft-delete strict
        const candidates = db.prepare(
          "SELECT id, name, email, phone, mobile, assignedTo, shared_with_json, pipeline_stage, companyId FROM contacts WHERE companyId = ? AND (phone != '' OR mobile != '') AND COALESCE(pipeline_stage, '') != 'perdu' AND (archivedAt IS NULL OR archivedAt = '')"
        ).all(companyId);
        for (const c of candidates) {
          const cp = (c.phone || c.mobile || '').replace(/[^\d]/g, '').slice(-9);
          if (cp === cleanPhone && cp.length >= 6) {
            phoneMatch = c;
            if (!emailMatch || emailMatch.id !== c.id) {
              matches.push({ ...c, matchedBy: 'phone' });
            }
            break;
          }
        }
      }
    }

    const conflict = !!(emailMatch && phoneMatch && emailMatch.id !== phoneMatch.id);

    const enriched = matches.map(m => {
      let assignedName = '';
      if (m.assignedTo) {
        try {
          const a = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(m.assignedTo);
          assignedName = a?.name || '';
        } catch {}
      }
      let sharedWith = [];
      try { sharedWith = JSON.parse(m.shared_with_json || '[]'); } catch {}
      return {
        id: m.id,
        name: m.name,
        email: m.email || '',
        phone: m.phone || m.mobile || '',
        assignedTo: m.assignedTo || '',
        assignedName,
        sharedWith,
        pipelineStage: m.pipeline_stage || '',
        matchedBy: m.matchedBy
      };
    });

    console.log(`[CONTACT DUPLICATE CHECK] company=${companyId} email=${email||''} phone=${phone||''} → exists=${matches.length>0} conflict=${conflict} matches=${matches.length}`);

    res.json({
      exists: matches.length > 0,
      conflict,
      matches: enriched
    });
  } catch (err) {
    console.error('[CONTACT DUPLICATE CHECK ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── IMPORT BATCH (CSV unifié — skip/merge/replace + custom fields) ───
router.post('/contacts/import-batch', requireAuth, enforceCompany, requirePermission('contacts.create'), (req, res) => {
  try {
    const { contacts, dupMode, customFieldDefs } = req.body;
    const companyId = req.auth.companyId;
    console.log(`[IMPORT-BATCH] Received: ${(contacts||[]).length} contacts, dupMode=${dupMode}, customDefs=${(customFieldDefs||[]).length}, company=${companyId}, collab=${req.auth.collaboratorId}`);
    if (!Array.isArray(contacts) || !contacts.length) return res.status(400).json({ error: 'contacts array requis' });
    if (contacts.length > 50000) return res.status(413).json({ error: 'Maximum 50 000 contacts par import' });

    // Forcer assignedTo : non-admin = soi-même, admin = soi-même par defaut (jamais orphelin)
    const assignedTo = req.auth.collaboratorId || req.auth.userId || '';

    // Create missing custom field definitions
    let customFieldsCreated = 0;
    if (Array.isArray(customFieldDefs) && customFieldDefs.length) {
      const now = new Date().toISOString();
      for (const cf of customFieldDefs) {
        if (!cf.fieldKey) continue;
        const existing = db.prepare('SELECT id FROM contact_field_definitions WHERE companyId = ? AND fieldKey = ?').get(companyId, cf.fieldKey);
        if (!existing) {
          const id = 'cfd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          db.prepare(`INSERT INTO contact_field_definitions (id, companyId, label, fieldKey, fieldType, options_json, required, position, scope, createdBy, createdAt) VALUES (?,?,?,?,?,'[]',0,0,'company',?,?)`).run(id, companyId, cf.label || cf.fieldKey, cf.fieldKey, cf.fieldType || 'text', req.auth.collaboratorId || '', now);
          customFieldsCreated++;
        }
      }
    }

    // Build dedup index from existing contacts (email + phone)
    const allContacts = db.prepare("SELECT id, email, phone FROM contacts WHERE companyId = ? AND (archivedAt IS NULL OR archivedAt = '')").all(companyId);
    const emailIndex = new Map();
    const phoneIndex = new Map();
    for (const c of allContacts) {
      const em = (c.email || '').toLowerCase().trim();
      if (em) emailIndex.set(em, c.id);
      const ph = (c.phone || '').replace(/[\s\-\.\(\)]/g, '');
      if (ph) phoneIndex.set(ph, c.id);
    }

    const mode = dupMode || 'skip';
    let imported = 0, merged = 0, replaced = 0, skipped = 0, errors = 0;
    const errorDetails = [];
    const now = new Date().toISOString();

    const stmtInsert = db.prepare(`INSERT INTO contacts (id, companyId, name, firstname, lastname, civility, email, phone, company, address, notes, siret, tva_number, pipeline_stage, tags_json, source, rating, custom_fields_json, assignedTo, shared_with_json, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

    const tx = db.transaction(() => {
      for (let i = 0; i < contacts.length; i++) {
        try {
          const c = contacts[i];
          const email = (c.email || '').trim();
          const phone = (c.phone || '').trim();
          const name = c.name || [c.firstname, c.lastname].filter(Boolean).join(' ') || email || 'Sans nom';

          // Skip empty
          if (!name || (name === 'Sans nom' && !email && !phone)) { skipped++; continue; }

          // Validate
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            errorDetails.push({ row: i + 2, error: `Email invalide: ${email}` });
            errors++; continue;
          }
          const phoneCleaned = phone.replace(/[\s\-\.\(\)]/g, '');
          if (phone && !/^\+?\d{6,20}$/.test(phoneCleaned)) {
            errorDetails.push({ row: i + 2, error: `Téléphone invalide: ${phone}` });
            errors++; continue;
          }

          // Check duplicate
          const em = email.toLowerCase();
          const existingId = (em && emailIndex.has(em)) ? emailIndex.get(em) : (phoneCleaned && phoneIndex.has(phoneCleaned)) ? phoneIndex.get(phoneCleaned) : null;

          if (existingId) {
            if (mode === 'skip') { skipped++; continue; }
            if (mode === 'merge' || mode === 'replace') {
              const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(existingId);
              if (existing) {
                const sets = [];
                const vals = [];
                const fields = ['name','firstname','lastname','civility','email','phone','company','address','notes','siret','tva_number','source'];
                for (const f of fields) {
                  const newVal = c[f] || '';
                  if (mode === 'replace' && newVal) { sets.push(`${f} = ?`); vals.push(newVal); }
                  else if (mode === 'merge' && newVal && !existing[f]) { sets.push(`${f} = ?`); vals.push(newVal); }
                }
                // Merge custom_fields
                if (c.custom_fields_json) {
                  let existCf = [];
                  try { existCf = JSON.parse(existing.custom_fields_json || '[]'); } catch {}
                  let newCf = [];
                  try { newCf = JSON.parse(c.custom_fields_json); } catch {}
                  if (mode === 'replace') {
                    sets.push('custom_fields_json = ?'); vals.push(c.custom_fields_json);
                  } else {
                    // merge: add new keys, keep existing values
                    const existKeys = new Set(existCf.map(f => f.key));
                    for (const nf of newCf) { if (!existKeys.has(nf.key)) existCf.push(nf); }
                    sets.push('custom_fields_json = ?'); vals.push(JSON.stringify(existCf));
                  }
                }
                if (c.tags_json && mode === 'replace') { sets.push('tags_json = ?'); vals.push(c.tags_json); }
                if (sets.length) {
                  vals.push(existingId);
                  db.prepare(`UPDATE contacts SET ${sets.join(',')} WHERE id = ?`).run(...vals);
                }
                if (mode === 'merge') merged++;
                else replaced++;
                continue;
              }
            }
          }

          // Insert new contact
          const id = 'ct_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          const finalAssignedTo = assignedTo || c.assignedTo || '';
          // Merge city/zip into address if present
          const fullAddr = [c.address, c.city, c.zip].filter(Boolean).join(', ');
          stmtInsert.run(
            id, companyId, name, c.firstname || '', c.lastname || '', c.civilite || c.civility || '',
            email, phone, c.company || '', fullAddr || '',
            c.notes || '', c.siret || '', c.tva_number || '',
            c.pipeline_stage || 'nouveau', c.tags_json || '[]', c.source || 'csv',
            null, c.custom_fields_json || '[]', finalAssignedTo, '[]', now
          );
          // Update index for intra-batch dedup
          if (em) emailIndex.set(em, id);
          if (phoneCleaned) phoneIndex.set(phoneCleaned, id);
          imported++;
        } catch (rowErr) {
          errors++;
          errorDetails.push({ row: i + 2, error: rowErr.message });
        }
      }
    });
    tx();

    console.log(`[IMPORT-BATCH] company=${companyId} imported=${imported} merged=${merged} replaced=${replaced} skipped=${skipped} errors=${errors} customFields=${customFieldsCreated}`);
    res.json({ success: true, imported, merged, replaced, skipped, errors, customFieldsCreated, errorDetails: errorDetails.slice(0, 50), total: contacts.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/contacts/:id', requireAuth, requirePermission('contacts.edit'), (req, res) => {
  try {
    const id = req.params.id;
    const authCompanyId = req.auth?.companyId;
    // Securite: verifier que le contact appartient a la company du user
    if (authCompanyId) {
      const existing = db.prepare('SELECT companyId, assignedTo, shared_with_json, archivedAt FROM contacts WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Contact non trouvé' });
      if (existing.companyId !== authCompanyId) return res.status(403).json({ error: 'Accès interdit: contact hors company' });
      // Isolation collaborateur : collab ne peut modifier que ses contacts
      if (!req.auth.isSupra && !req.auth.isAdmin) {
        const sw = JSON.parse(existing.shared_with_json || '[]');
        if (existing.assignedTo !== req.auth.collaboratorId && !sw.includes(req.auth.collaboratorId)) {
          return res.status(403).json({ error: 'Acces interdit: contact non assigne' });
        }
      }
      // V1.12.6 — refus modification si contact archive (utiliser POST /:id/restore pour restaurer)
      if (existing.archivedAt && existing.archivedAt !== '') {
        return res.status(409).json({ error: 'CONTACT_ARCHIVED', archivedAt: existing.archivedAt });
      }
    }
    const data = { ...req.body };
    if (data.tags) { data.tags_json = JSON.stringify(data.tags); delete data.tags; }
    if (data.docs) { data.docs_json = JSON.stringify(data.docs); delete data.docs; }
    if (data.shared_with) { data.shared_with_json = JSON.stringify(data.shared_with); delete data.shared_with; }

    // ─── V4: VERROU METIER + TRACABILITE DES STATUTS ───
    const STAGE_LEVEL = { nouveau: 0, nrp: 1, contacte: 2, qualifie: 3, rdv_programme: 4, client_valide: 5, perdu: 99 };
    const VALID_STAGES = ['nouveau','contacte','qualifie','rdv_programme','nrp','client_valide','perdu'];
    const ALLOWED_TRANSITIONS = {
      nouveau: ['contacte', 'nrp', 'qualifie', 'rdv_programme', 'perdu'],
      contacte: ['qualifie', 'nrp', 'rdv_programme', 'perdu'],
      qualifie: ['rdv_programme', 'nrp', 'perdu'],
      rdv_programme: ['client_valide', 'nrp', 'contacte', 'perdu'],
      nrp: ['contacte', 'qualifie', 'rdv_programme', 'perdu'],
      client_valide: ['perdu'],
      perdu: ['nouveau', 'contacte'],
    };
    let customStages = [];
    try { customStages = db.prepare('SELECT id FROM pipeline_stages WHERE companyId = ?').all(authCompanyId || data.companyId).map(s => s.id); } catch {}
    const allValidStages = [...VALID_STAGES, ...customStages];

    // Extraire les flags internes AVANT validation
    const _source = data._source || 'manual';
    const _origin = data._origin || '';
    const _reason = data._reason || '';
    const _tabId = data._tabId || '';
    const _forceStageChange = !!data._forceStageChange;
    // Nettoyer les flags internes (pas des colonnes DB)
    delete data._forceStageChange; delete data._updatedAt; delete data._source; delete data._origin; delete data._reason; delete data._tabId;

    if (data.pipeline_stage && !allValidStages.includes(data.pipeline_stage)) {
      console.warn('[PUT CONTACT] pipeline_stage invalide:', data.pipeline_stage);
      return res.status(400).json({ error: 'pipeline_stage invalide: ' + data.pipeline_stage });
    }

    const beforeContact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    const currentStage = beforeContact?.pipeline_stage || 'nouveau';
    const newStage = data.pipeline_stage;

    // V4: VERROU TRANSITIONS — vérifier si transition autorisée
    if (newStage && newStage !== currentStage && ALLOWED_TRANSITIONS[currentStage]) {
      const allowed = [...(ALLOWED_TRANSITIONS[currentStage] || []), ...customStages];
      if (!allowed.includes(newStage) && !_forceStageChange) {
        // Transition non autorisée → log anomalie + rejeter le changement de stage
        const anomalyId = 'ano_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        try { db.prepare('INSERT INTO system_anomaly_logs (id, type, contactId, companyId, fromStatus, toStatus, source, userId, tabId, detail, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
          anomalyId, 'TRANSITION_BLOCKED', id, authCompanyId || '', currentStage, newStage, _source, req.auth?.collaboratorId || '', _tabId,
          `Transition ${currentStage} → ${newStage} non autorisée (source: ${_source})`, new Date().toISOString()
        ); } catch {}
        console.warn(`[V4 TRANSITION BLOCKED] ${currentStage} → ${newStage} pour ${id} (source: ${_source})`);
        if (_source === 'manual' && _forceStageChange) {
          // Bypass explicite admin — on laisse passer
        } else {
          delete data.pipeline_stage;
        }
      }
    }

    // V4: Anti-regression automation — automations ne peuvent JAMAIS descendre
    if (newStage && newStage !== currentStage && _source === 'automation') {
      const currentLevel = STAGE_LEVEL[currentStage] ?? -1;
      const newLevel = STAGE_LEVEL[newStage] ?? -1;
      if (newLevel >= 0 && currentLevel >= 0 && newLevel < currentLevel) {
        const anomalyId = 'ano_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        try { db.prepare('INSERT INTO system_anomaly_logs (id, type, contactId, companyId, fromStatus, toStatus, source, userId, tabId, detail, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
          anomalyId, 'AUTOMATION_REGRESSION_BLOCKED', id, authCompanyId || '', currentStage, newStage, 'automation', '', _tabId,
          `Automation tentative regression ${currentStage} → ${newStage}`, new Date().toISOString()
        ); } catch {}
        console.warn(`[V4 AUTOMATION REGRESSION] ${currentStage} → ${newStage} BLOCKED pour ${id}`);
        delete data.pipeline_stage;
      }
    }

    // V3 (conservé): Optimistic locking 409
    const clientUpdatedAt = req.body._updatedAt;
    if (clientUpdatedAt && beforeContact?.updatedAt && clientUpdatedAt !== beforeContact.updatedAt) {
      const freshContact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
      const anomalyId = 'ano_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      try { db.prepare('INSERT INTO system_anomaly_logs (id, type, contactId, companyId, fromStatus, toStatus, source, userId, tabId, detail, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
        anomalyId, 'CONFLICT_409', id, authCompanyId || '', currentStage, newStage || currentStage, _source, req.auth?.collaboratorId || '', _tabId,
        `Conflict: client=${clientUpdatedAt} vs DB=${beforeContact.updatedAt}`, new Date().toISOString()
      ); } catch {}
      return res.status(409).json({ error: 'Conflit: données modifiées entre-temps', contact: freshContact });
    }

    const result = safeUpdate('contacts', id, data, ['id', 'companyId']);
    if (!result) return res.json({ success: true, noChanges: true, contact: beforeContact });
    if (result.changes === 0) {
      console.warn('[PUT CONTACT] 0 rows affected for id:', id);
      return res.status(404).json({ error: 'Contact non trouvé ou aucun changement' });
    }

    // V4: Toujours retourner le contact frais
    const freshContact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);

    // V4: LOG HISTORIQUE STATUT — si pipeline_stage a changé
    if (freshContact?.pipeline_stage && freshContact.pipeline_stage !== currentStage) {
      const histId = 'csh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const collabName = req.auth?.name || '';
      try { db.prepare('INSERT INTO contact_status_history (id, contactId, companyId, fromStatus, toStatus, source, origin, userId, collaboratorName, tabId, reason, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
        histId, id, authCompanyId || '', currentStage, freshContact.pipeline_stage,
        _source, _origin, req.auth?.collaboratorId || '', collabName, _tabId, _reason, new Date().toISOString()
      ); } catch (histErr) { console.error('[V4 STATUS HISTORY]', histErr.message); }
      console.log(`[V4 STATUS] ${id}: ${currentStage} → ${freshContact.pipeline_stage} (source: ${_source}, origin: ${_origin})`);
      // V5: Marquer le contact dirty pour recalcul du lead_score au prochain cron
      markScoreDirty(id);
    }

    // Audit + entity history on meaningful fields
    trackChanges('contact', id, beforeContact, data, req.auth?.collaboratorId || '', authCompanyId || '', ['name','firstname','lastname','email','phone','pipeline_stage','notes','rating','assignedTo']);

    // ─── REASSIGNMENT TRANSACTION (admin only) ───
    if (data.assignedTo && beforeContact.assignedTo && beforeContact.assignedTo !== data.assignedTo && (req.auth.isAdmin || req.auth.isSupra)) {
      try {
        const oldCollab = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(beforeContact.assignedTo);
        const newCollab = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(data.assignedTo);
        const now = new Date().toISOString();
        const tx = db.transaction(() => {
          // 1. Flag reassigned on contact
          db.prepare('UPDATE contacts SET reassigned = 1, reassigned_from = ?, reassigned_at = ? WHERE id = ?')
            .run(beforeContact.assignedTo, now, id);
          // 2. Log pipeline_history
          const phId = 'ph_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          // V1.8.24.1 Phase 5 — fallback companyId : authCompanyId peut être null en mode supra
          // impersonation. La source fiable est beforeContact.companyId (le contact existe en DB).
          const _phCompanyId = authCompanyId || beforeContact.companyId || data.companyId || '';
          if (!_phCompanyId) {
            console.warn(`[REASSIGN] companyId introuvable pour contact=${id} — pipeline_history skip`);
          } else {
            insert('pipeline_history', {
              id: phId, contactId: id, companyId: _phCompanyId,
              fromStage: beforeContact.pipeline_stage || 'nouveau',
              toStage: data.pipeline_stage || beforeContact.pipeline_stage || 'nouveau',
              userId: req.auth.collaboratorId || 'admin',
              userName: req.auth.name || 'Admin',
              note: `Reassigne: ${oldCollab?.name || '?'} → ${newCollab?.name || '?'}`,
              createdAt: now
            });
          }
          // 3. Notification to new collaborator
          createNotification({
            companyId: authCompanyId,
            collaboratorId: data.assignedTo,
            type: 'contact_reassigned',
            title: 'Contact reassigne',
            detail: `${beforeContact.name || 'Contact'} vous a ete reassigne par ${req.auth.name || 'un admin'}`,
            contactId: id,
            contactName: beforeContact.name || ''
          });
        });
        tx();
        console.log(`[REASSIGN] ${beforeContact.name}: ${oldCollab?.name} → ${newCollab?.name}`);
      } catch (reassignErr) {
        console.error('[REASSIGN ERROR]', reassignErr.message);
      }
    }

    // ─── AUTO-CLEAR reassigned badge when collab (non-admin) interacts ───
    if (beforeContact.reassigned === 1 && !req.auth.isAdmin && !req.auth.isSupra) {
      try { db.prepare('UPDATE contacts SET reassigned = 0 WHERE id = ?').run(id); } catch {}
    }

    logAudit(req, 'contact_updated', 'data', 'contact', id, 'Contact modifie: ' + (beforeContact?.name || ''), { fields: result.updated });
    console.log('[PUT CONTACT] OK:', id, result.updated.join(', '));
    res.json({ success: true, updated: result.updated, contact: freshContact });
  } catch (err) {
    console.error('[PUT CONTACT] SQL Error:', err.message, 'id:', req.params.id, 'body keys:', Object.keys(req.body));
    res.status(500).json({ error: err.message });
  }
});

// ─── V1.8.22 Phase B — PUT /contacts/:id/share (multi-collab "Utiliser + partager") ───
// Ajoute (mode='add') ou retire (mode='remove') un collaborateur dans shared_with_json.
// NE TOUCHE JAMAIS assignedTo — préserve la propriété existante (règle V1.8.13).
// Validations : contact existe, contact dans la company de l'auth, collab cible dans la
// même company, collab cible non archivé, collab cible != assignedTo (déjà owner).
router.put('/contacts/:id/share', requireAuth, enforceCompany, (req, res) => {
  try {
    const id = req.params.id;
    const { collaboratorId, mode } = req.body || {};
    const action = mode || 'add';
    if (!collaboratorId) return res.status(400).json({ error: 'collaboratorId requis' });
    if (!['add', 'remove'].includes(action)) return res.status(400).json({ error: 'mode invalide (add|remove)' });

    const contact = db.prepare('SELECT id, companyId, assignedTo, shared_with_json, name, archivedAt FROM contacts WHERE id = ?').get(id);
    if (!contact) return res.status(404).json({ error: 'CONTACT_NOT_FOUND' });
    if (!req.auth.isSupra && contact.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'CONTACT_WRONG_COMPANY' });
    }
    // V1.12.6 — refus partage si contact archive
    if (contact.archivedAt && contact.archivedAt !== '') {
      return res.status(409).json({ error: 'CONTACT_ARCHIVED', archivedAt: contact.archivedAt });
    }

    const targetCollab = db.prepare("SELECT id, companyId, archivedAt FROM collaborators WHERE id = ?").get(collaboratorId);
    if (!targetCollab) return res.status(404).json({ error: 'TARGET_COLLAB_INVALID' });
    if (!req.auth.isSupra && targetCollab.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'TARGET_COLLAB_WRONG_COMPANY' });
    }
    if (targetCollab.archivedAt) return res.status(409).json({ error: 'TARGET_COLLAB_ARCHIVED' });

    if (action === 'add' && contact.assignedTo === collaboratorId) {
      return res.status(409).json({ error: 'TARGET_COLLAB_IS_OWNER', assignedTo: contact.assignedTo });
    }

    let sharedWith = [];
    try { sharedWith = JSON.parse(contact.shared_with_json || '[]'); } catch {}
    if (!Array.isArray(sharedWith)) sharedWith = [];

    let changed = false;
    if (action === 'add') {
      if (!sharedWith.includes(collaboratorId)) {
        sharedWith.push(collaboratorId);
        changed = true;
      }
    } else {
      const next = sharedWith.filter(c => c !== collaboratorId);
      if (next.length !== sharedWith.length) {
        sharedWith = next;
        changed = true;
      }
    }

    if (changed) {
      const now = new Date().toISOString();
      db.prepare('UPDATE contacts SET shared_with_json = ?, updatedAt = ? WHERE id = ?')
        .run(JSON.stringify(sharedWith), now, id);
    }

    console.log(`[CONTACT SHARE ${action.toUpperCase()}] contact=${id} collab=${collaboratorId} actor=${req.auth.collaboratorId||''} changed=${changed} sharedWith=${sharedWith.length}`);

    const fresh = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    res.json({ success: true, changed, contact: fresh, sharedWith });
  } catch (err) {
    console.error('[CONTACT SHARE ERR]', err.message, 'id:', req.params.id);
    res.status(500).json({ error: err.message });
  }
});

// ─── BULK DELETE CONTACTS — accepts both POST and DELETE ───
router.post('/contacts/bulk-delete', requireAuth, enforceCompany, requirePermission('contacts.delete'), (req, res) => {
  try {
    const { contactIds, all, companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    let idsToDelete = [];
    if (all) {
      // SECURITE: non-admin ne peut supprimer en masse que SES contacts
      if (req.auth.isAdmin || req.auth.isSupra) {
        idsToDelete = db.prepare('SELECT id FROM contacts WHERE companyId = ?').all(companyId).map(r => r.id);
      } else {
        idsToDelete = db.prepare('SELECT id FROM contacts WHERE companyId = ? AND assignedTo = ?').all(companyId, req.auth.collaboratorId).map(r => r.id);
      }
    } else if (Array.isArray(contactIds) && contactIds.length > 0) {
      // SECURITE: non-admin ne peut supprimer que SES contacts dans la liste
      if (!req.auth.isAdmin && !req.auth.isSupra) {
        const ownIds = db.prepare(`SELECT id FROM contacts WHERE companyId = ? AND assignedTo = ? AND id IN (${contactIds.map(()=>'?').join(',')})`).all(companyId, req.auth.collaboratorId, ...contactIds).map(r=>r.id);
        idsToDelete = ownIds;
      } else {
        idsToDelete = contactIds;
      }
    } else {
      return res.status(400).json({ error: 'contactIds array or all:true requis' });
    }

    // Recuperer les noms AVANT suppression pour le log
    const deletedNames = idsToDelete.length <= 50
      ? db.prepare(`SELECT id, name FROM contacts WHERE id IN (${idsToDelete.map(()=>'?').join(',')}) AND companyId = ?`).all(...idsToDelete, companyId).map(c => c.name)
      : [];
    const origin = req.body.origin || 'unknown';

    let deleted = 0;
    for (let i = 0; i < idsToDelete.length; i += 100) {
      const batch = idsToDelete.slice(i, i + 100);
      const placeholders = batch.map(() => '?').join(',');
      // V1.7.2 — soft-cancel confirmed bookings linked to these contacts before DELETE
      db.prepare(`UPDATE bookings SET status='cancelled' WHERE contactId IN (${placeholders}) AND status='confirmed'`).run(...batch);
      db.prepare(`DELETE FROM contacts WHERE id IN (${placeholders}) AND companyId = ?`).run(...batch, companyId);
      deleted += batch.length;
    }
    const who = req.auth?.name || req.auth?.collaboratorId || 'unknown';
    logAudit(req, 'contacts_bulk_deleted', 'data', 'contact', '', `${deleted} contacts supprimes depuis ${origin} par ${who}`, { count: deleted, origin, who, names: deletedNames.slice(0, 20), ids: idsToDelete.slice(0, 20) });
    console.log(`[CONTACTS BULK-DELETE] company=${companyId} deleted=${deleted} by=${who} origin=${origin} names=[${deletedNames.slice(0,5).join(', ')}]`);
    res.json({ success: true, deleted, total: idsToDelete.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/contacts/:id', requireAuth, requirePermission('contacts.delete'), (req, res) => {
  try {
    const id = req.params.id;
    const record = db.prepare('SELECT companyId, name, email, phone, assignedTo FROM contacts WHERE id = ?').get(id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && record.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    // SECURITE: non-admin ne peut supprimer que SES contacts
    if (!req.auth.isAdmin && !req.auth.isSupra && record.assignedTo !== req.auth.collaboratorId) return res.status(403).json({ error: 'Accès interdit — contact assigné à un autre collaborateur' });
    // V1.7.2 — soft-cancel confirmed bookings linked to this contact before DELETE
    db.prepare("UPDATE bookings SET status='cancelled' WHERE contactId = ? AND status='confirmed'").run(id);
    remove('contacts', id);
    logAudit(req, 'contact_deleted', 'data', 'contact', id, 'Contact supprime: ' + (record.name || ''), { email: record.email, phone: record.phone });
    console.log(`[CONTACTS] Contact ${id} DELETED definitively`);
    res.json({ success: true, action: 'deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// V1.12.2 — POST /api/data/contacts/:id/archive
// Archive un contact (soft-delete). Aucune suppression de donnees.
// Mode "dark" V1.12.2 : pas encore branche cote frontend.
// Decision MH Q1 (UI 2-step bookings futurs) sera implementee en V1.12.6.
// Acces : requireAuth + requirePermission('contacts.delete') + companyId match + ownership
// Idempotence : 409 ALREADY_ARCHIVED si deja archive.
router.post('/contacts/:id/archive', requireAuth, requirePermission('contacts.delete'), (req, res) => {
  try {
    const id = req.params.id;
    const reason = (req.body?.reason || '').toString().slice(0, 500);

    const record = db.prepare('SELECT companyId, name, email, phone, assignedTo, archivedAt FROM contacts WHERE id = ?').get(id);
    if (!record) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!req.auth.isSupra && record.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    // SECURITE : non-admin ne peut archiver que SES contacts (pattern DELETE existant)
    if (!req.auth.isAdmin && !req.auth.isSupra && record.assignedTo !== req.auth.collaboratorId) {
      return res.status(403).json({ error: "Accès interdit — contact assigné à un autre collaborateur" });
    }
    // Idempotent : refuse si deja archive
    if (record.archivedAt && record.archivedAt !== '') {
      return res.status(409).json({ error: 'ALREADY_ARCHIVED', archivedAt: record.archivedAt });
    }

    const archivedAt = new Date().toISOString();
    const archivedBy = req.auth.collaboratorId || '';
    db.prepare('UPDATE contacts SET archivedAt = ?, archivedBy = ?, archivedReason = ? WHERE id = ?')
      .run(archivedAt, archivedBy, reason, id);

    logAudit(req, 'contact_archived', 'data', 'contact', id, 'Contact archive: ' + (record.name || ''), {
      email: record.email, phone: record.phone, reason: reason || null
    });
    console.log(`[CONTACTS] Contact ${id} ARCHIVED by ${archivedBy} reason="${reason}"`);

    res.json({ success: true, action: 'archived', archivedAt, archivedBy, archivedReason: reason });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// V1.12.3 — POST /api/data/contacts/:id/restore
// Desarchive un contact (annule l'archive, ne touche pas aux autres champs).
// Mode "dark" V1.12.3 : pas encore branche cote frontend (V1.12.8).
// Acces : requireAuth + requirePermission('contacts.edit') + companyId match + ownership
// Symetrique avec /archive : 400 NOT_ARCHIVED si contact deja actif.
router.post('/contacts/:id/restore', requireAuth, requirePermission('contacts.edit'), (req, res) => {
  try {
    const id = req.params.id;

    const record = db.prepare('SELECT companyId, name, email, phone, assignedTo, archivedAt, archivedBy, archivedReason FROM contacts WHERE id = ?').get(id);
    if (!record) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!req.auth.isSupra && record.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    // SECURITE : non-admin ne peut restaurer que SES contacts (symetrie avec /archive)
    if (!req.auth.isAdmin && !req.auth.isSupra && record.assignedTo !== req.auth.collaboratorId) {
      return res.status(403).json({ error: "Accès interdit — contact assigné à un autre collaborateur" });
    }
    // Refus si pas archive (409 state conflict, symetrie avec /archive 409 ALREADY_ARCHIVED)
    if (!record.archivedAt || record.archivedAt === '') {
      return res.status(409).json({ error: 'NOT_ARCHIVED' });
    }

    const previousArchivedAt = record.archivedAt;
    const previousArchivedBy = record.archivedBy || '';
    const previousArchivedReason = record.archivedReason || '';
    db.prepare("UPDATE contacts SET archivedAt = '', archivedBy = '', archivedReason = '' WHERE id = ?")
      .run(id);

    logAudit(req, 'contact_restored', 'data', 'contact', id, 'Contact restaure: ' + (record.name || ''), {
      email: record.email, phone: record.phone,
      previousArchivedAt, previousArchivedBy, previousArchivedReason: previousArchivedReason || null
    });
    console.log(`[CONTACTS] Contact ${id} RESTORED by ${req.auth.collaboratorId || ''} (was archived ${previousArchivedAt})`);

    res.json({ success: true, action: 'restored', id, name: record.name || '' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PIPELINE STAGES (custom statuses) ───
router.get('/pipeline-stages', requireAuth, enforceCompany, requirePermission('pipeline.view'), (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.json([]);
    const stages = db.prepare('SELECT * FROM pipeline_stages WHERE companyId = ? ORDER BY position ASC').all(companyId);
    res.json(stages);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PIPELINE STAGES RESOLVED (Phase 1 templates) ───
// Retourne la liste unifiée des stages pour le collab appelant :
//   - mode 'free'     : DEFAULT_STAGES + pipeline_stages company
//   - mode 'template' : stages du snapshot figé
// Flag readOnly pour que le frontend cache les boutons de mutation.
router.get('/pipeline-stages-resolved', requireAuth, enforceCompany, requirePermission('pipeline.view'), (req, res) => {
  try {
    const companyId = req.query.companyId || req.auth.companyId;
    const collaboratorId = req.query.collaboratorId || req.auth.collaboratorId;
    const resolved = resolvePipelineStages(db, { companyId, collaboratorId });
    res.json(resolved);
  } catch (err) {
    console.error('[PIPELINE_STAGES_RESOLVED]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/pipeline-stages', requireAuth, enforceCompany, requirePipelineFreeMode, requirePermission('pipeline.manage'), (req, res) => {
  try {
    const { companyId, label, color } = req.body;
    const id = 'ps_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const maxPos = db.prepare('SELECT MAX(position) as m FROM pipeline_stages WHERE companyId = ?').get(companyId);
    const position = (maxPos?.m || 100) + 1;
    db.prepare('INSERT INTO pipeline_stages (id, companyId, label, color, position, isDefault, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)').run(id, companyId, label, color || '#7C3AED', position, new Date().toISOString());
    res.json({ success: true, id, label, color: color || '#7C3AED', position, companyId, isDefault: 0, createdAt: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Core stages — cannot be modified or deleted via API
const CORE_STAGE_IDS = ['nouveau', 'rdv_programme', 'nrp', 'client_valide', 'perdu'];

router.put('/pipeline-stages/:id', requireAuth, requirePipelineFreeMode, requirePermission('pipeline.manage'), (req, res) => {
  try {
    if (CORE_STAGE_IDS.includes(req.params.id)) return res.status(403).json({ error: 'Cette colonne système ne peut pas être modifiée' });
    const record = db.prepare('SELECT companyId FROM pipeline_stages WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && record.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    const { label, color, position } = req.body;
    const sets = []; const vals = [];
    if (label !== undefined) { sets.push('label = ?'); vals.push(label); }
    if (color !== undefined) { sets.push('color = ?'); vals.push(color); }
    if (position !== undefined) { sets.push('position = ?'); vals.push(position); }
    if (sets.length > 0) {
      vals.push(req.params.id);
      db.prepare(`UPDATE pipeline_stages SET ${sets.join(',')} WHERE id = ?`).run(...vals);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/pipeline-stages/:id', requireAuth, requirePipelineFreeMode, requirePermission('pipeline.manage'), (req, res) => {
  try {
    if (CORE_STAGE_IDS.includes(req.params.id)) return res.status(403).json({ error: 'Cette colonne système ne peut pas être supprimée' });
    // Move contacts using this stage to "nouveau"
    const stage = db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(req.params.id);
    if (!stage) return res.status(404).json({ error: 'Not found' });
    if (!req.auth.isSupra && stage.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    db.prepare("UPDATE contacts SET pipeline_stage = 'nouveau' WHERE pipeline_stage = ? AND companyId = ?").run(stage.id, stage.companyId);
    db.prepare('DELETE FROM pipeline_stages WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PIPELINE HISTORY ───
router.get('/pipeline-history', requireAuth, enforceCompany, requirePermission('pipeline.view'), (req, res) => {
  try {
    const companyId = req.query.companyId;
    const { contactId } = req.query;
    if (contactId) {
      // Vérifier que le contact appartient à la company du user + isolation collab
      if (!req.auth.isSupra) {
        const ct = db.prepare('SELECT companyId, assignedTo, shared_with_json FROM contacts WHERE id = ?').get(contactId);
        if (!ct || ct.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
        // Isolation collaborateur : admin voit tout, collab voit seulement ses contacts
        if (!req.auth.isAdmin) {
          const sharedWith = JSON.parse(ct.shared_with_json || '[]');
          if (ct.assignedTo !== req.auth.collaboratorId && !sharedWith.includes(req.auth.collaboratorId)) {
            return res.status(403).json({ error: 'Acces interdit' });
          }
        }
      }
      const rows = db.prepare('SELECT * FROM pipeline_history WHERE contactId = ? ORDER BY createdAt DESC LIMIT 50').all(contactId);
      return res.json(rows);
    }
    if (companyId) {
      // Isolation collaborateur : collab voit seulement l'historique de ses contacts
      if (!req.auth.isSupra && !req.auth.isAdmin) {
        const rows = db.prepare(`SELECT ph.* FROM pipeline_history ph INNER JOIN contacts c ON c.id = ph.contactId WHERE ph.companyId = ? AND (c.assignedTo = ? OR c.shared_with_json LIKE ?) ORDER BY ph.createdAt DESC LIMIT 200`).all(companyId, req.auth.collaboratorId, '%' + req.auth.collaboratorId + '%');
        return res.json(rows);
      }
      const rows = db.prepare('SELECT * FROM pipeline_history WHERE companyId = ? ORDER BY createdAt DESC LIMIT 200').all(companyId);
      return res.json(rows);
    }
    res.json([]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/pipeline-history', requireAuth, enforceCompany, requirePermission('pipeline.manage'), (req, res) => {
  try {
    const h = req.body;
    // Forcer companyId à celui du user authentifié (sauf supra)
    const safeCompanyId = req.auth.isSupra ? (h.companyId || req.auth.companyId) : req.auth.companyId;
    // Vérifier que le contactId appartient à la company du user + isolation collab
    if (h.contactId && !req.auth.isSupra) {
      const ct = db.prepare('SELECT companyId, assignedTo, shared_with_json FROM contacts WHERE id = ?').get(h.contactId);
      if (!ct || ct.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
      if (!req.auth.isAdmin) {
        const sharedWith = JSON.parse(ct.shared_with_json || '[]');
        if (ct.assignedTo !== req.auth.collaboratorId && !sharedWith.includes(req.auth.collaboratorId)) {
          return res.status(403).json({ error: 'Acces interdit' });
        }
      }
    }
    const id = 'ph_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    db.prepare('INSERT INTO pipeline_history (id, contactId, companyId, fromStage, toStage, userId, userName, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, h.contactId, safeCompanyId, h.fromStage || '', h.toStage, h.userId || '', h.userName || '', h.note || '', new Date().toISOString());
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── REVENUE STATS ───
router.get('/revenue-stats', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    const period = req.query.period || 'month';
    const customFrom = req.query.from || '';
    const customTo = req.query.to || '';

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    // Week start (Monday)
    const dayOfWeek = now.getDay() || 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    // Month start
    const monthStartStr = todayStr.substring(0, 8) + '01';
    // Quarter start
    const qMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStartStr = `${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`;
    // Year start
    const yearStartStr = `${now.getFullYear()}-01-01`;

    // Determine period filter for gross/cancelled/net
    let periodWhere = '';
    let periodParams = [];
    switch (period) {
      case 'day':
        periodWhere = 'AND c.contract_date = ?';
        periodParams = [todayStr];
        break;
      case 'week':
        periodWhere = 'AND c.contract_date >= ?';
        periodParams = [weekStartStr];
        break;
      case 'month':
        periodWhere = 'AND c.contract_date >= ?';
        periodParams = [monthStartStr];
        break;
      case 'quarter':
        periodWhere = 'AND c.contract_date >= ?';
        periodParams = [quarterStartStr];
        break;
      case 'year':
        periodWhere = 'AND c.contract_date >= ?';
        periodParams = [yearStartStr];
        break;
      case 'custom':
        if (customFrom && customTo) {
          periodWhere = 'AND c.contract_date >= ? AND c.contract_date <= ?';
          periodParams = [customFrom, customTo];
        } else if (customFrom) {
          periodWhere = 'AND c.contract_date >= ?';
          periodParams = [customFrom];
        } else {
          periodWhere = 'AND c.contract_date >= ?';
          periodParams = [monthStartStr];
        }
        break;
      default:
        periodWhere = 'AND c.contract_date >= ?';
        periodParams = [monthStartStr];
    }

    // Forecast settings from company
    let forecast_contract_avg = 1500;
    let forecast_conversion_rate = 8;
    try {
      const comp = db.prepare('SELECT forecast_contract_avg, forecast_conversion_rate FROM companies WHERE id = ?').get(companyId);
      if (comp) {
        forecast_contract_avg = comp.forecast_contract_avg || 1500;
        forecast_conversion_rate = comp.forecast_conversion_rate || 8;
      }
    } catch {}

    // Today (always shown regardless of period)
    const todayRow = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(contract_amount),0) as amount FROM contacts WHERE contract_signed = 1 AND companyId = ? AND contract_date = ?").get(companyId, todayStr);
    // Week
    const weekRow = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(contract_amount),0) as amount FROM contacts WHERE contract_signed = 1 AND companyId = ? AND contract_date >= ?").get(companyId, weekStartStr);
    // Month
    const monthRow = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(contract_amount),0) as amount FROM contacts WHERE contract_signed = 1 AND companyId = ? AND contract_date >= ?").get(companyId, monthStartStr);

    // ── Gross (all signed contracts in period) ──
    const grossRow = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(c.contract_amount),0) as amount FROM contacts c WHERE c.contract_signed = 1 AND c.companyId = ? ${periodWhere}`).get(companyId, ...periodParams);

    // ── Cancelled (contracts cancelled in period) ──
    const cancelledRow = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(c.contract_amount),0) as amount FROM contacts c WHERE c.contract_signed = 1 AND c.contract_status = 'cancelled' AND c.companyId = ? ${periodWhere}`).get(companyId, ...periodParams);

    const grossCount = grossRow?.count || 0;
    const grossAmount = grossRow?.amount || 0;
    const cancelledCount = cancelledRow?.count || 0;
    const cancelledAmount = cancelledRow?.amount || 0;
    const netCount = grossCount - cancelledCount;
    const netAmount = grossAmount - cancelledAmount;
    const cancellationRate = grossCount > 0 ? Math.round((cancelledCount / grossCount) * 10000) / 100 : 0;

    // By collaborator — with leads count, signed, cancelled
    const byCollab = db.prepare(`
      SELECT c.assignedTo as collaboratorId, COALESCE(col.name, c.assignedTo) as name,
        COUNT(CASE WHEN c.contract_signed = 1 THEN 1 END) as signed_count,
        COALESCE(SUM(CASE WHEN c.contract_signed = 1 THEN c.contract_amount ELSE 0 END),0) as signed_amount,
        COUNT(CASE WHEN c.contract_signed = 1 AND c.contract_status = 'cancelled' THEN 1 END) as cancelled_count,
        COALESCE(SUM(CASE WHEN c.contract_signed = 1 AND c.contract_status = 'cancelled' THEN c.contract_amount ELSE 0 END),0) as cancelled_amount
      FROM contacts c
      LEFT JOIN collaborators col ON col.id = c.assignedTo
      WHERE c.companyId = ? AND c.assignedTo IS NOT NULL AND c.assignedTo != '' ${periodWhere}
      GROUP BY c.assignedTo
      ORDER BY signed_amount DESC
    `).all(companyId, ...periodParams);

    // Get leads count per collaborator (all contacts assigned — not period-filtered)
    const leadsPerCollab = db.prepare(`
      SELECT assignedTo as collaboratorId, COUNT(*) as leads_count
      FROM contacts
      WHERE companyId = ? AND assignedTo IS NOT NULL AND assignedTo != ''
      GROUP BY assignedTo
    `).all(companyId);
    const leadsMap = {};
    for (const lc of leadsPerCollab) leadsMap[lc.collaboratorId] = lc.leads_count;

    // Total leads for global forecast
    const totalLeads = db.prepare("SELECT COUNT(*) as cnt FROM contacts WHERE companyId = ? AND assignedTo IS NOT NULL AND assignedTo != ''").get(companyId)?.cnt || 0;

    // Enrich byCollab with forecast + net data
    const rate = forecast_conversion_rate / 100;
    for (const c of byCollab) {
      c.leads_count = leadsMap[c.collaboratorId] || 0;
      c.net_amount = (c.signed_amount || 0) - (c.cancelled_amount || 0);
      // Keep backward compat fields
      c.count = c.signed_count;
      c.amount = c.signed_amount;
      c.expected_deals = Math.round((c.leads_count * rate) * 100) / 100;
      c.expected_ca = Math.round(c.expected_deals * forecast_contract_avg * 100) / 100;
      c.avg_contract_expected = forecast_contract_avg;
      c.avg_contract_real = c.signed_count > 0 ? Math.round((c.signed_amount / c.signed_count) * 100) / 100 : 0;
      c.achievement_rate = c.expected_ca > 0 ? Math.round((c.net_amount / c.expected_ca) * 10000) / 100 : 0;
    }

    // Recent deals (last 20)
    const recentDeals = db.prepare(`
      SELECT c.name as contactName, c.contract_amount as amount, c.contract_number as contractNumber,
        COALESCE(col.name, c.assignedTo) as collaborator, c.contract_date as date
      FROM contacts c
      LEFT JOIN collaborators col ON col.id = c.assignedTo
      WHERE c.contract_signed = 1 AND (c.contract_status IS NULL OR c.contract_status != 'cancelled') AND c.companyId = ?
      ORDER BY c.contract_date DESC
      LIMIT 20
    `).all(companyId);

    // Recent cancellations (last 20)
    const recentCancellations = db.prepare(`
      SELECT c.name as contactName, c.contract_amount as amount, c.contract_cancel_reason as reason,
        c.contract_cancelled_at as cancelledAt, COALESCE(col.name, c.assignedTo) as collaborator
      FROM contacts c
      LEFT JOIN collaborators col ON col.id = c.assignedTo
      WHERE c.contract_signed = 1 AND c.contract_status = 'cancelled' AND c.companyId = ?
      ORDER BY c.contract_cancelled_at DESC
      LIMIT 20
    `).all(companyId);

    res.json({
      today: { count: todayRow?.count || 0, amount: todayRow?.amount || 0 },
      week: { count: weekRow?.count || 0, amount: weekRow?.amount || 0 },
      month: { count: monthRow?.count || 0, amount: monthRow?.amount || 0 },
      gross: { count: grossCount, amount: grossAmount },
      cancelled: { count: cancelledCount, amount: cancelledAmount },
      net: { count: netCount, amount: netAmount },
      cancellation_rate: cancellationRate,
      byCollab,
      recentDeals,
      recentCancellations,
      forecast_contract_avg,
      forecast_conversion_rate,
      totalLeads
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── LOG SUGGESTION ACTION (email, document, note from live transcription) ───
router.post('/suggestion-action', requireAuth, (req, res) => {
  try {
    const { type, action, contactId, contactName, detail } = req.body;
    const companyId = req.auth?.companyId || '';
    const collaboratorId = req.auth?.collaboratorId || '';
    logAudit(req, 'suggestion_' + (type || 'unknown') + '_' + (action || 'action'), 'live_transcription', 'contact', contactId || '', `Suggestion ${type}: ${action} — ${contactName || 'inconnu'}`, { detail: detail || '' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CANCEL CONTRACT ───
router.put('/contacts/:id/cancel-contract', requireAuth, (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Motif requis' });
    const contact = db.prepare('SELECT id, companyId, contract_signed, assignedTo FROM contacts WHERE id = ?').get(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact non trouvé' });
    if (!req.auth.isSupra && contact.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    // SECURITE: non-admin ne peut annuler que le contrat de SES contacts
    if (req.auth.role !== 'admin' && !req.auth.isSupra && contact.assignedTo !== req.auth.collaboratorId) return res.status(403).json({ error: 'Accès interdit — contact d\'un autre collaborateur' });
    if (!contact.contract_signed) return res.status(400).json({ error: 'Ce contact n\'a pas de contrat signé' });
    db.prepare("UPDATE contacts SET contract_status = 'cancelled', contract_cancelled_at = ?, contract_cancel_reason = ? WHERE id = ?").run(new Date().toISOString(), reason, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── UPDATE COMPANY FORECAST SETTINGS ───
router.put('/companies/:id/forecast', requireAuth, (req, res) => {
  try {
    // SECURITE: admin ou supra uniquement
    if (req.auth.role !== 'admin' && !req.auth.isSupra) return res.status(403).json({ error: 'Accès interdit — admin uniquement' });
    // SECURITE: verifier que l'admin modifie SA company
    if (!req.auth.isSupra && req.params.id !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit — vous ne pouvez modifier que votre entreprise' });
    const { forecast_contract_avg, forecast_conversion_rate } = req.body;
    const sets = [];
    const vals = [];
    if (forecast_contract_avg !== undefined) { sets.push('forecast_contract_avg = ?'); vals.push(forecast_contract_avg); }
    if (forecast_conversion_rate !== undefined) { sets.push('forecast_conversion_rate = ?'); vals.push(forecast_conversion_rate); }
    if (sets.length === 0) return res.status(400).json({ error: 'Aucun champ a mettre a jour' });
    vals.push(req.params.id);
    db.prepare(`UPDATE companies SET ${sets.join(',')} WHERE id = ?`).run(...vals);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ACTIVITY LOG ───
router.get('/activity', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    res.json(getByCompany('activity_logs', companyId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/activity', requireAuth, (req, res) => {
  try {
    const a = req.body;
    // SECURITE: forcer le companyId du user authentifie (jamais celui du body)
    const companyId = req.auth.companyId;
    const id = a.id || 'a' + Date.now();
    insert('activity_logs', { id, companyId, companyName: a.companyName || '', action: a.action, detail: a.detail || '', timestamp: a.timestamp || new Date().toISOString(), user: a.user || '' });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SCAN IMAGE → Extract contacts via AI Vision ───
router.post('/contacts/scan-image', requireAuth, async (req, res) => {
  try {
    const { image } = req.body; // base64 image data
    if (!image) return res.status(400).json({ error: 'Image requise' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Clé API OpenAI non configurée' });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `Analyse cette image et extrais TOUS les contacts visibles. Pour chaque contact, extrais les champs suivants si disponibles :
- name (nom complet)
- firstname (prénom)
- lastname (nom de famille)
- email
- phone (numéro de téléphone)
- company (entreprise)
- address (adresse)
- job_title (poste/fonction)
- notes (toute info supplémentaire)

Retourne un JSON STRICT avec ce format (pas de texte avant/après, juste le JSON) :
{ "contacts": [ { "name": "...", "firstname": "...", "lastname": "...", "email": "...", "phone": "...", "company": "...", "address": "...", "job_title": "...", "notes": "..." } ] }

Si aucun contact n'est trouvé, retourne : { "contacts": [] }
Si un champ n'est pas visible, mets une chaîne vide.` },
            { type: 'image_url', image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` } }
          ]
        }],
        max_tokens: 2000,
        temperature: 0.1
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    // Parse JSON from response (handle markdown code blocks)
    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = { contacts: [], raw: content };
    }

    console.log(`[SCAN IMAGE] Extracted ${parsed.contacts?.length || 0} contacts`);
    res.json(parsed);
  } catch (err) {
    console.error('[SCAN IMAGE ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PIPELINE AUTOMATIONS (SMS + Email per stage) ────────────

// GET /api/data/pipeline-automations — all rules for this collab
router.get('/pipeline-automations', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId || req.auth.companyId;
    const collaboratorId = req.query.collaboratorId || req.auth.collaboratorId;
    const rows = db.prepare('SELECT * FROM pipeline_automations WHERE companyId = ? AND collaboratorId = ? ORDER BY pipelineStageId, triggerType').all(companyId, collaboratorId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data/pipeline-automations — create or update a rule (upsert)
router.post('/pipeline-automations', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    const collaboratorId = req.auth.collaboratorId;
    const { pipelineStageId, triggerType, send_sms, send_email, sms_content, email_subject, email_content, email_attachment_url, is_auto, enabled } = req.body;

    if (!pipelineStageId || !triggerType) return res.status(400).json({ error: 'pipelineStageId et triggerType requis' });

    // Upsert — check if rule already exists
    const existing = db.prepare('SELECT id FROM pipeline_automations WHERE companyId = ? AND collaboratorId = ? AND pipelineStageId = ? AND triggerType = ?')
      .get(companyId, collaboratorId, pipelineStageId, triggerType);

    const now = new Date().toISOString();

    if (existing) {
      db.prepare(`UPDATE pipeline_automations SET send_sms = ?, send_email = ?, sms_content = ?, email_subject = ?, email_content = ?, email_attachment_url = ?, is_auto = ?, enabled = ?, updatedAt = ? WHERE id = ?`)
        .run(send_sms ? 1 : 0, send_email ? 1 : 0, sms_content || '', email_subject || '', email_content || '', email_attachment_url || '', is_auto ? 1 : 0, enabled ? 1 : 0, now, existing.id);
      res.json({ success: true, id: existing.id, updated: true });
    } else {
      const id = 'pa_' + Date.now() + Math.random().toString(36).slice(2, 5);
      db.prepare(`INSERT INTO pipeline_automations (id, companyId, collaboratorId, pipelineStageId, triggerType, send_sms, send_email, sms_content, email_subject, email_content, email_attachment_url, is_auto, enabled, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, companyId, collaboratorId, pipelineStageId, triggerType, send_sms ? 1 : 0, send_email ? 1 : 0, sms_content || '', email_subject || '', email_content || '', email_attachment_url || '', is_auto ? 1 : 0, enabled ? 1 : 0, now, now);
      res.json({ success: true, id, created: true });
    }
  } catch (err) {
    console.error('[PIPELINE AUTOMATION]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/data/pipeline-automations/:id — delete a rule
router.delete('/pipeline-automations/:id', requireAuth, (req, res) => {
  try {
    const rule = db.prepare('SELECT companyId, collaboratorId FROM pipeline_automations WHERE id = ?').get(req.params.id);
    if (!rule) return res.status(404).json({ error: 'Règle introuvable' });
    if (!req.auth.isSupra && rule.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    // SECURITE: non-admin ne peut supprimer que SES propres regles
    if (req.auth.role !== 'admin' && !req.auth.isSupra && rule.collaboratorId !== req.auth.collaboratorId) return res.status(403).json({ error: 'Accès interdit — règle d\'un autre collaborateur' });
    db.prepare('DELETE FROM pipeline_automations WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
