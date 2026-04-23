import { Router } from 'express';
import { db, insert, remove, parseRow } from '../db/database.js';
import { requireAuth, requireAdmin, enforceCompany } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { uid, logHistory, cleanPhoneForCompare, checkDuplicate, parseCSV, autoDetectMapping, executeImport } from '../services/leadImportEngine.js';
import { createNotification } from './notifications.js';
import { dispatchEnvelope } from '../cron/leadDispatch.js';

const router = Router();

// ─── LEAD NOTIFICATION HELPERS (grouped, no spam, business-oriented) ───
function notifyLeadsAssigned(companyId, summary) {
  // summary = { collabId: { name, count } }
  for (const [collabId, info] of Object.entries(summary)) {
    if (!collabId || info.count <= 0) continue;
    const n = info.count;
    createNotification({
      companyId,
      collaboratorId: collabId,
      type: n > 1 ? 'leads_batch' : 'lead_assigned',
      title: n > 1 ? `${n} nouveaux leads a traiter` : 'Nouveau contact pour vous',
      detail: n > 1 ? `${n} contacts vous attendent — lancez vos appels !` : 'Un nouveau lead vient de vous etre confie — a traiter rapidement.',
      contactId: null,
      contactName: '',
      linkUrl: ''
    });
  }
}

function notifyLeadsUnassigned(companyId, collabCounts) {
  // collabCounts = { collabId: { name, count } }
  for (const [collabId, info] of Object.entries(collabCounts)) {
    if (!collabId || info.count <= 0) continue;
    createNotification({
      companyId,
      collaboratorId: collabId,
      type: 'leads_reassigned',
      title: 'Mise a jour de vos contacts',
      detail: 'Certains contacts ont ete reattribues. Votre liste est a jour.',
      contactId: null,
      contactName: '',
      linkUrl: ''
    });
  }
}

function notifyLeadsReceived(companyId, collabId, contactName) {
  // Single contact reassigned TO this collab
  createNotification({
    companyId,
    collaboratorId: collabId,
    type: 'lead_priority',
    title: 'Nouveau contact prioritaire',
    detail: `${contactName || 'Un contact'} vient de vous etre reassigne — a traiter rapidement.`,
    contactId: null,
    contactName: contactName || '',
    linkUrl: ''
  });
}

function notifyLeadsImported(companyId, adminId, count, sourceName, envelopeName) {
  createNotification({
    companyId,
    collaboratorId: adminId,
    type: 'leads_imported',
    title: `${count} nouveau${count > 1 ? 'x' : ''} lead${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}`,
    detail: `${count} lead${count > 1 ? 's' : ''} recu${count > 1 ? 's' : ''} depuis ${sourceName || 'import'}${envelopeName ? ' — flux ' + envelopeName : ''}. Pret${count > 1 ? 's' : ''} a distribuer.`,
    contactId: null,
    contactName: '',
    linkUrl: ''
  });
}

// ─── IMPORT RATE LIMITER (in-memory, 5 imports/hour/company) ───
const importRateMap = new Map();
function checkImportRate(companyId) {
  const MAX_PER_HOUR = 5;
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const history = (importRateMap.get(companyId) || []).filter(t => now - t < hour);
  if (history.length >= MAX_PER_HOUR) return false;
  history.push(now);
  importRateMap.set(companyId, history);
  return true;
}

// ─── HELPERS ───
// Security: verify resource belongs to authenticated user's company
function verifyOwnership(table, id, req, res) {
  const row = db.prepare(`SELECT companyId FROM ${table} WHERE id = ?`).get(id);
  if (!row) { res.status(404).json({ error: 'Ressource introuvable' }); return false; }
  if (row.companyId !== req.auth.companyId && !req.auth.isSupra) { res.status(403).json({ error: 'Acces interdit a cette ressource' }); return false; }
  return true;
}

// ─── LEAD SOURCES ───
router.get('/sources', requireAdmin, enforceCompany, requirePermission('leads.view'), (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const rows = db.prepare('SELECT * FROM lead_sources WHERE companyId = ? ORDER BY created_at DESC').all(companyId);
    res.json(rows.map(r => parseRow('lead_sources', r)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sources', requireAdmin, enforceCompany, requirePermission('leads.manage'), (req, res) => {
  try {
    const s = req.body;
    if (!s.companyId) return res.status(400).json({ error: 'companyId requis' });
    const id = uid('ls');
    insert('lead_sources', {
      id, companyId: s.companyId, name: s.name || 'Source sans nom',
      type: s.type || 'csv',
      config_json: JSON.stringify(s.config || {}),
      mapping_json: JSON.stringify(s.mapping || {}),
      is_active: s.is_active !== false ? 1 : 0,
      last_sync: null,
      created_at: new Date().toISOString()
    });
    logHistory(s.companyId, 'source_created', { source_id: id, name: s.name }, { user_id: req.auth?.userId, user_name: req.auth?.name });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/sources/:id', requireAdmin, requirePermission('leads.manage'), (req, res) => {
  try {
    if (!verifyOwnership('lead_sources', req.params.id, req, res)) return;
    const data = { ...req.body };
    if (data.config) { data.config_json = JSON.stringify(data.config); delete data.config; }
    if (data.mapping) { data.mapping_json = JSON.stringify(data.mapping); delete data.mapping; }
    if ('is_active' in data) data.is_active = data.is_active ? 1 : 0;
    delete data.id; delete data.companyId;
    const sets = Object.keys(data).map(k => `${k} = ?`).join(',');
    db.prepare(`UPDATE lead_sources SET ${sets} WHERE id = ?`).run(...Object.values(data), req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/sources/:id', requireAdmin, requirePermission('leads.manage'), (req, res) => {
  try {
    if (!verifyOwnership('lead_sources', req.params.id, req, res)) return;
    db.prepare('UPDATE incoming_leads SET source_id = NULL WHERE source_id = ?').run(req.params.id);
    db.prepare('UPDATE lead_envelopes SET source_id = NULL WHERE source_id = ?').run(req.params.id);
    remove('lead_sources', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── INCOMING LEADS ───
router.get('/incoming', requireAdmin, enforceCompany, requirePermission('leads.view'), (req, res) => {
  try {
    const { companyId, status, envelope_id, source_id, import_id, search, limit = '200', offset = '0' } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    let sql = 'SELECT * FROM incoming_leads WHERE companyId = ?';
    const params = [companyId];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (envelope_id) { sql += ' AND envelope_id = ?'; params.push(envelope_id); }
    if (source_id) { sql += ' AND source_id = ?'; params.push(source_id); }
    if (import_id) { sql += ' AND import_id = ?'; params.push(import_id); }
    if (search) {
      sql += " AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)";
      const s = '%' + search + '%';
      params.push(s, s, s, s);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const rows = db.prepare(sql).all(...params);

    // Also get total count for pagination
    let countSql = 'SELECT COUNT(*) as cnt FROM incoming_leads WHERE companyId = ?';
    const countParams = [companyId];
    if (status) { countSql += ' AND status = ?'; countParams.push(status); }
    if (envelope_id) { countSql += ' AND envelope_id = ?'; countParams.push(envelope_id); }
    if (source_id) { countSql += ' AND source_id = ?'; countParams.push(source_id); }
    if (import_id) { countSql += ' AND import_id = ?'; countParams.push(import_id); }
    if (search) {
      countSql += " AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)";
      const s = '%' + search + '%';
      countParams.push(s, s, s, s);
    }
    const total = db.prepare(countSql).get(...countParams)?.cnt || 0;

    // Enrich leads with source and envelope names
    const leads = rows.map(r => {
      const parsed = parseRow('incoming_leads', r);
      if (r.source_id) {
        const src = db.prepare('SELECT name FROM lead_sources WHERE id = ?').get(r.source_id);
        parsed.source_name = src?.name || '';
      }
      if (r.envelope_id) {
        const env = db.prepare('SELECT name FROM lead_envelopes WHERE id = ?').get(r.envelope_id);
        parsed.envelope_name = env?.name || '';
      }
      return parsed;
    });

    res.json({ leads, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/incoming/:id', requireAdmin, requirePermission('leads.manage'), (req, res) => {
  try {
    if (!verifyOwnership('incoming_leads', req.params.id, req, res)) return;
    const data = { ...req.body };
    if (data.data) { data.data_json = JSON.stringify(data.data); delete data.data; }
    delete data.id; delete data.companyId;
    const sets = Object.keys(data).map(k => `${k} = ?`).join(',');
    db.prepare(`UPDATE incoming_leads SET ${sets} WHERE id = ?`).run(...Object.values(data), req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/incoming/:id', requireAdmin, requirePermission('leads.manage'), (req, res) => {
  try {
    if (!verifyOwnership('incoming_leads', req.params.id, req, res)) return;
    const lead = db.prepare('SELECT companyId, first_name, last_name FROM incoming_leads WHERE id = ?').get(req.params.id);
    if (lead) {
      db.prepare('DELETE FROM lead_assignments WHERE lead_id = ?').run(req.params.id);
      logHistory(lead.companyId, 'lead_deleted', { lead_id: req.params.id, name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') }, { user_id: req.auth?.userId, user_name: req.auth?.name });
    }
    remove('incoming_leads', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/incoming/bulk-status', requireAdmin, enforceCompany, requirePermission('leads.manage'), (req, res) => {
  try {
    const { ids, status, envelope_id, companyId } = req.body;
    if (!ids || !Array.isArray(ids) || !status) return res.status(400).json({ error: 'ids et status requis' });
    // Security: only update leads belonging to this company
    const tx = db.transaction(() => {
      if (envelope_id) {
        const stmt = db.prepare('UPDATE incoming_leads SET status = ?, envelope_id = ? WHERE id = ? AND companyId = ?');
        for (const id of ids) stmt.run(status, envelope_id, id, companyId);
      } else {
        const stmt = db.prepare('UPDATE incoming_leads SET status = ? WHERE id = ? AND companyId = ?');
        for (const id of ids) stmt.run(status, id, companyId);
      }
    });
    tx();
    res.json({ success: true, updated: ids.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk delete
router.post('/incoming/bulk-delete', requireAdmin, enforceCompany, requirePermission('leads.manage'), (req, res) => {
  try {
    const { ids, companyId } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids requis' });
    // Security: only delete leads belonging to this company
    const stmtDel = db.prepare('DELETE FROM incoming_leads WHERE id = ? AND companyId = ?');
    const stmtAssign = db.prepare('DELETE FROM lead_assignments WHERE lead_id = ?');
    const tx = db.transaction(() => { for (const id of ids) { stmtAssign.run(id); stmtDel.run(id, companyId); } });
    tx();
    res.json({ success: true, deleted: ids.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BULK UNASSIGN (desassigner) ───
router.post('/incoming/bulk-unassign', requireAdmin, enforceCompany, requirePermission('leads.manage'), (req, res) => {
  try {
    const { ids, companyId } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids requis' });

    let unassigned = 0;
    let contactsRemoved = 0;
    const affectedCollabs = {}; // { collabId: { name, count } }

    const tx = db.transaction(() => {
      for (const leadId of ids) {
        const lead = db.prepare('SELECT * FROM incoming_leads WHERE id = ? AND companyId = ?').get(leadId, companyId);
        if (!lead) continue;

        // Track affected collaborator for notification
        if (lead.assigned_to) {
          if (!affectedCollabs[lead.assigned_to]) {
            const c = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(lead.assigned_to);
            affectedCollabs[lead.assigned_to] = { name: c?.name || '', count: 0 };
          }
          affectedCollabs[lead.assigned_to].count++;
        }

        // 1. Remove the CRM contact created by dispatch (if pipeline_stage still 'nouveau' = untouched)
        if (lead.contact_id) {
          const contact = db.prepare('SELECT id, pipeline_stage FROM contacts WHERE id = ? AND companyId = ?').get(lead.contact_id, companyId);
          if (contact && contact.pipeline_stage === 'nouveau') {
            // Safe to delete — contact was never worked on
            db.prepare('DELETE FROM contacts WHERE id = ? AND companyId = ?').run(lead.contact_id, companyId);
            contactsRemoved++;
          } else if (contact) {
            // Contact has been worked on (stage changed) — keep it but log warning
            console.log(`[UNASSIGN] Contact ${lead.contact_id} kept (stage: ${contact.pipeline_stage})`);
          }
        }

        // 2. Remove lead assignment record
        db.prepare('DELETE FROM lead_assignments WHERE lead_id = ? AND companyId = ?').run(leadId, companyId);

        // 3. Reset lead to unassigned — NOT queued, so cron won't auto-reassign
        // Admin must manually re-dispatch. dispatched stays 1 to block auto-dispatch.
        db.prepare("UPDATE incoming_leads SET status = 'unassigned', assigned_to = '', assigned_at = '', contact_id = '', dispatched = 1 WHERE id = ? AND companyId = ?")
          .run(leadId, companyId);

        unassigned++;
      }
    });
    tx();

    // Log history
    logHistory(companyId, 'bulk_unassign', {
      count: unassigned, contacts_removed: contactsRemoved
    }, { user_id: req.auth?.userId, user_name: req.auth?.name });

    console.log(`[UNASSIGN] ${unassigned} leads unassigned, ${contactsRemoved} contacts removed`);

    // Notifications groupees aux collabs affectes
    if (Object.keys(affectedCollabs).length > 0) notifyLeadsUnassigned(companyId, affectedCollabs);

    res.json({ success: true, unassigned, contactsRemoved });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── LEAD ENVELOPES — public read for collabs (lean identity only) ───
router.get('/envelopes/public', requireAuth, enforceCompany, (req, res) => {
   try {
     const companyId = req.query.companyId;
     if (!companyId) return res.status(400).json({ error: 'companyId requis' });
     const rows = db.prepare('SELECT id, name, color, icon, priority FROM lead_envelopes WHERE companyId = ?').all(companyId);
     res.json(rows);
   } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── LEAD ENVELOPES ───
router.get('/envelopes', requireAdmin, enforceCompany, requirePermission('leads.view'), (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const rows = db.prepare('SELECT * FROM lead_envelopes WHERE companyId = ? ORDER BY created_at DESC').all(companyId);
    const enriched = rows.map(env => {
      const counts = db.prepare("SELECT status, COUNT(*) as cnt FROM incoming_leads WHERE envelope_id = ? GROUP BY status").all(env.id);
      const byStatus = {};
      for (const c of counts) byStatus[c.status] = c.cnt;
      const totalLeads = Object.values(byStatus).reduce((a, b) => a + b, 0);
      // Get source info (enriched for campaign card)
      const src = env.source_id ? db.prepare('SELECT * FROM lead_sources WHERE id = ?').get(env.source_id) : null;
      // Get rules with collab info
      const rulesRows = db.prepare('SELECT r.*, c.name as collaborator_name, c.color as collaborator_color FROM lead_dispatch_rules r LEFT JOIN collaborators c ON r.collaborator_id = c.id WHERE r.envelope_id = ? AND r.active = 1 ORDER BY r.priority ASC').all(env.id);
      const rulesCount = rulesRows.length;
      // Get last import stats for this envelope
      const lastImport = db.prepare('SELECT imported, duplicates, errors, created_at FROM lead_import_logs WHERE envelope_id = ? ORDER BY created_at DESC LIMIT 1').get(env.id) || null;
      // Per-collab assignment counts for this envelope
      const collabCounts = db.prepare("SELECT assigned_to, COUNT(*) as cnt FROM incoming_leads WHERE envelope_id = ? AND status = 'assigned' GROUP BY assigned_to").all(env.id);
      const collabCountMap = {};
      for (const cc of collabCounts) if (cc.assigned_to) collabCountMap[cc.assigned_to] = cc.cnt;

      const rulesWithCounts = rulesRows.map(r => ({
        ...r, active: !!r.active,
        assigned_count: collabCountMap[r.collaborator_id] || 0
      }));

      return {
        ...env, auto_dispatch: !!env.auto_dispatch, leadCounts: byStatus, totalLeads, rulesCount,
        rules: rulesWithCounts,
        source_name: src?.name || '', source_type: src?.type || '', source_last_sync: src?.last_sync || '',
        source_last_row_count: src?.last_row_count || 0, source_gsheet_url: src?.gsheet_url || '',
        source_sync_mode: src?.sync_mode || 'manual', lastImport
      };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/envelopes', requireAdmin, enforceCompany, requirePermission('leads.manage'), (req, res) => {
  try {
    const e = req.body;
    if (!e.companyId) return res.status(400).json({ error: 'companyId requis' });
    const id = uid('env');
    insert('lead_envelopes', {
      id, companyId: e.companyId, name: e.name || 'Flux',
      color: e.color || '#6366F1',
      icon: e.icon || 'star',
      priority: ['high','medium','low'].includes(e.priority) ? e.priority : 'medium',
      source_id: e.source_id || null,
      auto_dispatch: e.auto_dispatch ? 1 : 0,
      dispatch_type: e.dispatch_type || 'manual',
      dispatch_mode: e.dispatch_mode || 'percentage',
      dispatch_time: e.dispatch_time || '',
      dispatch_limit: e.dispatch_limit || 0,
      dispatch_start_date: e.dispatch_start_date || '',
      dispatch_end_date: e.dispatch_end_date || '',
      dispatch_interval_minutes: e.dispatch_interval_minutes || 0,
      last_dispatch_at: '',
      created_at: new Date().toISOString()
    });
    logHistory(e.companyId, 'envelope_created', { envelope_id: id, name: e.name }, { user_id: req.auth?.userId, user_name: req.auth?.name });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/envelopes/:id', requireAdmin, requirePermission('leads.manage'), (req, res) => {
  try {
    if (!verifyOwnership('lead_envelopes', req.params.id, req, res)) return;
    const data = { ...req.body };
    if ('auto_dispatch' in data) data.auto_dispatch = data.auto_dispatch ? 1 : 0;
    delete data.id; delete data.companyId;
    const sets = Object.keys(data).map(k => `${k} = ?`).join(',');
    db.prepare(`UPDATE lead_envelopes SET ${sets} WHERE id = ?`).run(...Object.values(data), req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/envelopes/:id', requireAdmin, requirePermission('leads.manage'), (req, res) => {
  try {
    if (!verifyOwnership('lead_envelopes', req.params.id, req, res)) return;
    db.prepare('DELETE FROM lead_dispatch_rules WHERE envelope_id = ?').run(req.params.id);
    db.prepare("UPDATE incoming_leads SET envelope_id = NULL WHERE envelope_id = ?").run(req.params.id);
    remove('lead_envelopes', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DISPATCH RULES ───
router.get('/dispatch-rules', requireAdmin, enforceCompany, requirePermission('leads.view'), (req, res) => {
  try {
    const { companyId, envelope_id } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    let sql = 'SELECT * FROM lead_dispatch_rules WHERE companyId = ?';
    const params = [companyId];
    if (envelope_id) { sql += ' AND envelope_id = ?'; params.push(envelope_id); }
    sql += ' ORDER BY priority ASC';
    const rows = db.prepare(sql).all(...params);
    const enriched = rows.map(r => {
      const collab = db.prepare('SELECT name, color FROM collaborators WHERE id = ?').get(r.collaborator_id);
      return { ...r, active: !!r.active, collaborator_name: collab?.name || 'Inconnu', collaborator_color: collab?.color || '#64748B' };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/dispatch-rules', requireAdmin, enforceCompany, requirePermission('leads.manage'), (req, res) => {
  try {
    const r = req.body;
    if (!r.companyId || !r.envelope_id || !r.collaborator_id) return res.status(400).json({ error: 'companyId, envelope_id, collaborator_id requis' });
    const id = uid('dr');
    insert('lead_dispatch_rules', {
      id, companyId: r.companyId, envelope_id: r.envelope_id,
      collaborator_id: r.collaborator_id,
      percentage: r.percentage || 0, priority: r.priority || 1,
      dispatch_count: r.dispatch_count || 0,
      max_daily: r.max_daily || 0,
      active: r.active !== false ? 1 : 0,
      created_at: new Date().toISOString()
    });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/dispatch-rules/:id', requireAdmin, requirePermission('leads.manage'), (req, res) => {
  try {
    if (!verifyOwnership('lead_dispatch_rules', req.params.id, req, res)) return;
    const data = { ...req.body };
    if ('active' in data) data.active = data.active ? 1 : 0;
    delete data.id; delete data.companyId;
    const sets = Object.keys(data).map(k => `${k} = ?`).join(',');
    db.prepare(`UPDATE lead_dispatch_rules SET ${sets} WHERE id = ?`).run(...Object.values(data), req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/dispatch-rules/:id', requireAdmin, requirePermission('leads.manage'), (req, res) => {
  try {
    if (!verifyOwnership('lead_dispatch_rules', req.params.id, req, res)) return;
    remove('lead_dispatch_rules', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── IMPORT CSV ───
router.post('/import/csv', requireAdmin, enforceCompany, requirePermission('leads.manage'), (req, res) => {
  try {
    const { companyId, source_id, envelope_id, csvText, mapping } = req.body;
    if (!companyId || !csvText) return res.status(400).json({ error: 'companyId et csvText requis' });
    if (!checkImportRate(companyId)) return res.status(429).json({ error: 'Limite atteinte : 5 imports par heure. Réessayez plus tard.' });

    const parsed = parseCSV(csvText);
    if (!parsed) return res.status(400).json({ error: 'CSV vide ou sans donnees' });
    if (parsed.error) return res.status(413).json({ error: parsed.error });

    const result = executeImport({
      companyId,
      lines_parsed: parsed,
      mapping: mapping || {},
      source_id: source_id || null,
      envelope_id: envelope_id || null,
      importType: 'csv',
      filename: req.body.filename || 'Import CSV',
      userId: req.auth?.userId,
      userName: req.auth?.name
    });

    // Notification import a l'admin qui a importe
    if (result.success && result.imported > 0) {
      notifyLeadsImported(companyId, req.auth?.userId, result.imported, req.body.filename || 'CSV', result.envelope_id ? (db.prepare('SELECT name FROM lead_envelopes WHERE id = ?').get(result.envelope_id)?.name || '') : '');
    }

    // V5-TIMING: Mode immediate — dispatch instantane apres import
    if (result.success && result.imported > 0 && result.envelope_id) {
      const env = db.prepare('SELECT * FROM lead_envelopes WHERE id = ?').get(result.envelope_id);
      if (env && (env.dispatch_type === 'immediate' || env.dispatch_type === 'on_import') && env.auto_dispatch) {
        try {
          dispatchEnvelope(env);
          db.prepare("UPDATE lead_envelopes SET last_dispatch_at = ? WHERE id = ?").run(new Date().toISOString(), env.id);
          console.log(`[IMPORT CSV] Mode immediate: dispatch declenche pour ${env.name}`);
        } catch (e) { console.error('[IMPORT CSV] Immediate dispatch error:', e.message); }
      }
    }

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── IMPORT GOOGLE SHEET ───
router.post('/import/gsheet-preview', requireAdmin, requirePermission('leads.manage'), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url requis' });

    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ error: 'URL Google Sheet invalide' });
    const sheetId = match[1];
    const gidMatch = url.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const response = await fetch(csvUrl);
    if (!response.ok) return res.status(400).json({ error: 'Impossible de lire le Google Sheet. Verifiez qu\'il est public ou partage.' });

    const text = await response.text();
    const parsed = parseCSV(text);
    if (!parsed) return res.status(400).json({ error: 'Sheet vide' });
    if (parsed.error) return res.status(413).json({ error: parsed.error });

    // Auto-detect mapping for suggestion
    const suggestedMapping = autoDetectMapping(parsed.headers);

    res.json({ success: true, headers: parsed.headers, sampleRows: parsed.rows.slice(0, 5), totalRows: parsed.rows.length, sheetId, gid, suggestedMapping });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/import/gsheet', requireAdmin, enforceCompany, requirePermission('leads.manage'), async (req, res) => {
  try {
    const { companyId, source_id, envelope_id, url, mapping } = req.body;
    if (!companyId || !url) return res.status(400).json({ error: 'companyId et url requis' });
    if (!checkImportRate(companyId)) return res.status(429).json({ error: 'Limite atteinte : 5 imports par heure. Réessayez plus tard.' });

    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ error: 'URL Google Sheet invalide' });
    const sheetId = match[1];
    const gidMatch = url.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const response = await fetch(csvUrl);
    if (!response.ok) return res.status(400).json({ error: 'Impossible de lire le Google Sheet' });

    const csvText = await response.text();
    const parsed = parseCSV(csvText);
    if (!parsed) return res.status(400).json({ error: 'Sheet vide' });
    if (parsed.error) return res.status(413).json({ error: parsed.error });

    // Extract sheet name from URL for filename
    const sheetName = url.match(/#gid=/) ? `Google Sheet (gid ${gid})` : 'Google Sheet';

    const result = executeImport({
      companyId,
      lines_parsed: parsed,
      mapping: mapping || {},
      source_id: source_id || null,
      envelope_id: envelope_id || null,
      importType: 'gsheet',
      filename: req.body.filename || sheetName,
      userId: req.auth?.userId,
      userName: req.auth?.name
    });

    if (result.success && result.imported > 0) {
      notifyLeadsImported(companyId, req.auth?.userId, result.imported, req.body.filename || 'Google Sheet', result.envelope_id ? (db.prepare('SELECT name FROM lead_envelopes WHERE id = ?').get(result.envelope_id)?.name || '') : '');
    }

    // V5-TIMING: Mode immediate — dispatch instantane apres import GSheet
    if (result.success && result.imported > 0 && result.envelope_id) {
      const env = db.prepare('SELECT * FROM lead_envelopes WHERE id = ?').get(result.envelope_id);
      if (env && (env.dispatch_type === 'immediate' || env.dispatch_type === 'on_import') && env.auto_dispatch) {
        try {
          dispatchEnvelope(env);
          db.prepare("UPDATE lead_envelopes SET last_dispatch_at = ? WHERE id = ?").run(new Date().toISOString(), env.id);
          console.log(`[IMPORT GSHEET] Mode immediate: dispatch declenche pour ${env.name}`);
        } catch (e) { console.error('[IMPORT GSHEET] Immediate dispatch error:', e.message); }
      }
    }

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SCORING HELPERS ───

function getOrCreateScore(collaboratorId, companyId) {
  let score = db.prepare('SELECT * FROM lead_distribution_scores WHERE collaborator_id = ? AND companyId = ?').get(collaboratorId, companyId);
  if (!score) {
    const id = uid('lds');
    const now = new Date().toISOString();
    insert('lead_distribution_scores', {
      id, collaborator_id: collaboratorId, companyId,
      score_global: 50, score_calls: 50, score_conversion: 50,
      score_speed: 50, score_capacity: 50, score_quality: 50,
      active_leads: 0, daily_leads: 0, daily_reset_date: now.slice(0, 10),
      updated_at: now
    });
    score = db.prepare('SELECT * FROM lead_distribution_scores WHERE collaborator_id = ? AND companyId = ?').get(collaboratorId, companyId);
  }
  // Reset daily count if new day
  const today = new Date().toISOString().slice(0, 10);
  if (score.daily_reset_date !== today) {
    db.prepare('UPDATE lead_distribution_scores SET daily_leads = 0, daily_reset_date = ? WHERE id = ?').run(today, score.id);
    score.daily_leads = 0;
  }
  return score;
}

function recalcScores(companyId) {
  const collabs = db.prepare("SELECT id FROM collaborators WHERE companyId = ?").all(companyId);
  const now = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();
  for (const c of collabs) {
    const score = getOrCreateScore(c.id, companyId);
    // Count active leads (assigned, not yet converted)
    const activeLeads = db.prepare("SELECT COUNT(*) as cnt FROM incoming_leads WHERE companyId = ? AND assigned_to = ? AND status = 'assigned'").get(companyId, c.id)?.cnt || 0;

    // --- CALLS: only count VALID calls (anti-triche) ---
    const validCalls30d = db.prepare("SELECT COUNT(*) as cnt FROM call_logs WHERE companyId = ? AND collaboratorId = ? AND createdAt >= ? AND is_valid_call = 1").get(companyId, c.id, thirtyDaysAgo)?.cnt || 0;
    const totalCalls30d = db.prepare("SELECT COUNT(*) as cnt FROM call_logs WHERE companyId = ? AND collaboratorId = ? AND createdAt >= ?").get(companyId, c.id, thirtyDaysAgo)?.cnt || 0;
    const invalidRatio = totalCalls30d > 0 ? (totalCalls30d - validCalls30d) / totalCalls30d : 0;

    // Count converted leads
    const conversions = db.prepare("SELECT COUNT(*) as cnt FROM incoming_leads WHERE companyId = ? AND assigned_to = ? AND status = 'converted'").get(companyId, c.id)?.cnt || 0;
    // Total assigned
    const totalAssigned = db.prepare("SELECT COUNT(*) as cnt FROM lead_assignments WHERE companyId = ? AND collaborator_id = ?").get(companyId, c.id)?.cnt || 0;
    // Bookings created from leads
    const bookings = db.prepare("SELECT COUNT(*) as cnt FROM bookings WHERE collaboratorId = ? AND contactId != '' AND contactId IS NOT NULL").get(c.id)?.cnt || 0;

    // --- AI quality from ai_copilot_analyses ---
    let avgAiQuality = null;
    try {
      const aiStats = db.prepare("SELECT AVG(qualityScore) as avgQ FROM ai_copilot_analyses WHERE collaboratorId = ? AND companyId = ? AND createdAt >= ?").get(c.id, companyId, thirtyDaysAgo);
      avgAiQuality = aiStats?.avgQ ?? null;
    } catch {}

    // scoreCalls: valid only, penalize high invalid ratio
    let scoreCalls = Math.min(100, Math.round(validCalls30d * 2));
    if (invalidRatio > 0.3) scoreCalls = Math.max(10, scoreCalls - 20);
    // scoreConversion
    const scoreConversion = totalAssigned > 0 ? Math.min(100, Math.round((conversions / totalAssigned) * 100 * 2)) : 50;
    // scoreCapacity
    const scoreCapacity = activeLeads < 10 ? 90 : activeLeads < 25 ? 70 : activeLeads < 50 ? 50 : 30;
    // scoreSpeed
    const scoreSpeed = Math.min(100, 50 + bookings);
    // scoreQuality: use AI quality if available, else fallback
    let scoreQuality;
    if (avgAiQuality !== null && !isNaN(avgAiQuality)) {
      scoreQuality = Math.round(Math.min(100, avgAiQuality));
    } else {
      scoreQuality = Math.min(100, 50 + conversions * 5);
    }
    // scoreGlobal: Conversion 30%, Quality 25%, Calls 20%, Capacity 15%, Speed 10%
    const scoreGlobal = Math.round(scoreCalls * 0.20 + scoreConversion * 0.30 + scoreCapacity * 0.15 + scoreSpeed * 0.10 + scoreQuality * 0.25);

    db.prepare(`UPDATE lead_distribution_scores SET
      score_global=?, score_calls=?, score_conversion=?, score_speed=?, score_capacity=?, score_quality=?,
      active_leads=?, updated_at=? WHERE id=?`
    ).run(scoreGlobal, scoreCalls, scoreConversion, scoreSpeed, scoreCapacity, scoreQuality, activeLeads, now, score.id);
  }
}

// Shared: assign a single lead to a collaborator → create contact + assignment
function assignLeadToCollab(lead, collabId, ruleId, companyId, now, envelope_id, userId, userName) {
  // Check duplicate in CRM contacts
  let existingContact = null;
  if (lead.email) {
    existingContact = db.prepare("SELECT id FROM contacts WHERE companyId = ? AND email = ? AND email != ''").get(companyId, lead.email);
  }
  if (!existingContact && lead.phone) {
    const cleanPhone = cleanPhoneForCompare(lead.phone);
    if (cleanPhone) {
      const candidates = db.prepare("SELECT id, phone, mobile FROM contacts WHERE companyId = ? AND (phone != '' OR mobile != '')").all(companyId);
      for (const c of candidates) {
        if (cleanPhoneForCompare(c.phone) === cleanPhone || cleanPhoneForCompare(c.mobile) === cleanPhone) {
          existingContact = c;
          break;
        }
      }
    }
  }

  let contactId;
  if (existingContact) {
    contactId = existingContact.id;
    db.prepare("UPDATE contacts SET assignedTo = ?, source = 'lead' WHERE id = ?").run(collabId, contactId);
  } else {
    contactId = 'ct' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const contactName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email || lead.phone || 'Lead';
    let extraData = {};
    try { extraData = JSON.parse(lead.data_json || '{}'); } catch {}
    insert('contacts', {
      id: contactId, companyId,
      name: contactName,
      firstname: lead.first_name || '',
      lastname: lead.last_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      totalBookings: 0, lastVisit: '',
      tags_json: JSON.stringify(['lead']),
      notes: extraData.notes || extraData.message || '',
      rating: null,
      docs_json: JSON.stringify([]),
      pipeline_stage: 'nouveau',
      assignedTo: collabId,
      shared_with_json: JSON.stringify([]),
      source: 'lead',
      envelopeId: envelope_id || '',
      createdAt: now
    });
  }

  // V5-P1: Anti double-dispatch — vérifier AVANT insertion
  const existingAssign = db.prepare('SELECT id FROM lead_assignments WHERE lead_id = ? AND collaborator_id = ?').get(lead.id, collabId);
  if (existingAssign) {
    console.warn(`[DISPATCH] Double-dispatch bloque: lead ${lead.id} deja assigne a ${collabId}`);
    return { contactId, collabName: collabId, collabId, duplicate: true };
  }
  const assignId = uid('la');
  insert('lead_assignments', {
    id: assignId, companyId,
    lead_id: lead.id,
    collaborator_id: collabId,
    rule_id: ruleId || '',
    contact_id: contactId,
    assigned_at: now
  });

  // Update lead (mark dispatched=1 to prevent re-dispatch)
  db.prepare("UPDATE incoming_leads SET status = 'assigned', assigned_to = ?, assigned_at = ?, contact_id = ?, dispatched = 1 WHERE id = ?").run(collabId, now, contactId, lead.id);

  // Update score counters
  try {
    db.prepare('UPDATE lead_distribution_scores SET active_leads = active_leads + 1, daily_leads = daily_leads + 1 WHERE collaborator_id = ? AND companyId = ?').run(collabId, companyId);
  } catch {}

  // Log history
  const collab = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(collabId);
  const cName = collab?.name || collabId;
  logHistory(companyId, 'dispatched', {
    lead_id: lead.id, collaborator_id: collabId, collaborator_name: cName,
    contact_id: contactId, envelope_id, mode: 'dispatch'
  }, { lead_id: lead.id, contact_id: contactId, user_id: userId, user_name: userName });

  return { contactId, collabName: cName, collabId };
}

// ─── DISPATCH ENGINE (4 modes) ───
router.post('/dispatch', requireAdmin, enforceCompany, requirePermission('leads.manage'), (req, res) => {
  try {
    const { envelope_id } = req.body;
    const companyId = req.auth.companyId;
    if (!companyId || !envelope_id) return res.status(400).json({ error: 'companyId et envelope_id requis' });

    // Get envelope config — filtré par companyId pour isolation
    const envelope = db.prepare('SELECT * FROM lead_envelopes WHERE id = ? AND companyId = ?').get(envelope_id, companyId);
    if (!envelope) return res.status(404).json({ error: 'Enveloppe introuvable ou accès refusé' });

    // Check if envelope has expired
    if (envelope?.dispatch_end_date) {
      const today = new Date().toISOString().slice(0, 10);
      if (today > envelope.dispatch_end_date) {
        return res.json({ success: true, dispatched: 0, message: 'Enveloppe expiree' });
      }
    }

    // Build leads query: undispatched leads only, respect start_date
    let leadsQuery = "SELECT * FROM incoming_leads WHERE envelope_id = ? AND companyId = ? AND (status IN ('new','queued') OR (status = 'unassigned' AND (assigned_to IS NULL OR assigned_to = ''))) ORDER BY created_at ASC";
    const leadsParams = [envelope_id, companyId];
    if (envelope?.dispatch_start_date) {
      leadsQuery += " AND created_at >= ?";
      leadsParams.push(envelope.dispatch_start_date);
    }
    leadsQuery += " ORDER BY created_at ASC";
    const leads = db.prepare(leadsQuery).all(...leadsParams);
    if (leads.length === 0) return res.json({ success: true, dispatched: 0, message: 'Aucun lead a dispatcher' });

    const rules = db.prepare("SELECT * FROM lead_dispatch_rules WHERE envelope_id = ? AND companyId = ? AND active = 1 ORDER BY priority ASC").all(envelope_id, companyId);
    if (rules.length === 0) return res.status(400).json({ error: 'Aucune regle de dispatch active. Ajoutez des collaborateurs dans Regles.' });
    const mode = envelope?.dispatch_mode || 'percentage';

    const now = new Date().toISOString();
    const summary = {};
    const reasons = {}; // For IA mode — why each collab got leads

    // Preload collab data (limits, scores, tags)
    const collabData = {};
    for (const r of rules) {
      const collab = db.prepare('SELECT id, name, max_active_leads, max_daily_leads, lead_specialities, lead_tags_json FROM collaborators WHERE id = ?').get(r.collaborator_id);
      const score = getOrCreateScore(r.collaborator_id, companyId);
      let tags = [];
      try { tags = JSON.parse(collab?.lead_tags_json || '[]'); } catch {}
      collabData[r.collaborator_id] = {
        name: collab?.name || 'Inconnu',
        maxActive: collab?.max_active_leads || 0,
        maxDaily: collab?.max_daily_leads || 0,
        specialities: (collab?.lead_specialities || '').toLowerCase(),
        tags,
        score: score?.score_global || 50,
        scoreDetails: score,
        activeLeads: score?.active_leads || 0,
        dailyLeads: score?.daily_leads || 0,
        ruleId: r.id,
        percentage: r.percentage,
        dispatch_count: r.dispatch_count || 0,
        max_daily_rule: r.max_daily || 0
      };
    }

    // Check if collab can receive a lead (limits + per-rule max_daily)
    function canReceive(collabId, ruleId) {
      const cd = collabData[collabId];
      if (!cd) return false;
      if (cd.maxActive > 0 && cd.activeLeads >= cd.maxActive) return false;
      if (cd.maxDaily > 0 && cd.dailyLeads >= cd.maxDaily) return false;
      // Per-rule max_daily check
      if (ruleId && cd.max_daily_rule > 0) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const ruleCount = db.prepare('SELECT COUNT(*) as cnt FROM lead_assignments WHERE rule_id = ? AND collaborator_id = ? AND assigned_at >= ?').get(ruleId, collabId, todayStr)?.cnt || 0;
        if (ruleCount >= cd.max_daily_rule) return false;
      }
      return true;
    }

    const tx = db.transaction(() => {
      if (mode === 'percentage') {
        // ─── MODE PERCENTAGE (supports dispatch_count override per rule) ───
        const hasFixedCount = rules.some(r => (collabData[r.collaborator_id]?.dispatch_count || 0) > 0);

        let quotas;
        if (hasFixedCount) {
          // Mixed mode: fixed count rules get their exact target, percentage rules share the remainder
          let fixedTotal = 0;
          const fixedQuotas = [];
          const pctRules = [];
          for (const r of rules) {
            const cd = collabData[r.collaborator_id];
            if (cd && cd.dispatch_count > 0) {
              const target = Math.min(cd.dispatch_count, leads.length);
              fixedQuotas.push({ collabId: r.collaborator_id, ruleId: r.id, target, assigned: 0 });
              fixedTotal += target;
            } else {
              pctRules.push(r);
            }
          }
          const remainder = Math.max(0, leads.length - fixedTotal);
          const totalPct = pctRules.reduce((s, r) => s + r.percentage, 0);
          const pctQuotas = [];
          if (remainder > 0 && totalPct > 0) {
            for (const r of pctRules) {
              pctQuotas.push({
                collabId: r.collaborator_id, ruleId: r.id,
                target: Math.max(1, Math.round(remainder * (r.percentage / totalPct))), assigned: 0
              });
            }
            // Adjust pct quotas to match remainder exactly
            let pctTotal = pctQuotas.reduce((s, q) => s + q.target, 0);
            while (pctTotal < remainder && pctQuotas.length > 0) { pctQuotas[0].target++; pctTotal++; }
            while (pctTotal > remainder && pctQuotas.length > 0) { const mx = pctQuotas.reduce((a, b) => a.target > b.target ? a : b); if (mx.target > 1) { mx.target--; pctTotal--; } else break; }
          }
          quotas = [...fixedQuotas, ...pctQuotas];
        } else {
          // Original percentage-only mode
          const totalPct = rules.reduce((s, r) => s + r.percentage, 0);
          if (totalPct === 0) return;
          quotas = rules.map(r => ({
            collabId: r.collaborator_id, ruleId: r.id,
            target: Math.max(1, Math.round(leads.length * (r.percentage / totalPct))), assigned: 0
          }));
          let totalTarget = quotas.reduce((s, q) => s + q.target, 0);
          while (totalTarget < leads.length) { quotas[0].target++; totalTarget++; }
          while (totalTarget > leads.length) { const mx = quotas.reduce((a, b) => a.target > b.target ? a : b); if (mx.target > 1) { mx.target--; totalTarget--; } else break; }
        }
        if (quotas.length === 0) return;

        let qIdx = 0;
        for (const lead of leads) {
          let attempts = 0;
          while ((quotas[qIdx].assigned >= quotas[qIdx].target || !canReceive(quotas[qIdx].collabId, quotas[qIdx].ruleId)) && attempts < quotas.length) {
            qIdx = (qIdx + 1) % quotas.length; attempts++;
          }
          if (attempts >= quotas.length) break;
          const cId = quotas[qIdx].collabId;
          const result = assignLeadToCollab(lead, cId, quotas[qIdx].ruleId, companyId, now, envelope_id, req.auth?.userId, req.auth?.name);
          summary[result.collabName] = (summary[result.collabName] || 0) + 1;
          collabData[cId].activeLeads++; collabData[cId].dailyLeads++;
          quotas[qIdx].assigned++; qIdx = (qIdx + 1) % quotas.length;
        }

      } else if (mode === 'ai' || mode === 'hybrid') {
        // ─── MODE IA / HYBRID ───
        // Recalc scores before dispatch
        recalcScores(companyId);
        // Refresh scores
        for (const cId of Object.keys(collabData)) {
          const freshScore = db.prepare('SELECT * FROM lead_distribution_scores WHERE collaborator_id = ? AND companyId = ?').get(cId, companyId);
          if (freshScore) {
            collabData[cId].score = freshScore.score_global;
            collabData[cId].scoreDetails = freshScore;
            collabData[cId].activeLeads = freshScore.active_leads;
            collabData[cId].dailyLeads = freshScore.daily_leads;
          }
        }

        // Build ranked list of eligible collabs
        for (const lead of leads) {
          let extraData = {};
          try { extraData = JSON.parse(lead.data_json || '{}'); } catch {}
          const leadTags = ((extraData.tags || '') + ' ' + (extraData.source || '') + ' ' + (extraData.qualification || '')).toLowerCase();

          // Score each collab for this lead
          const ranked = Object.entries(collabData)
            .filter(([cId, cd]) => canReceive(cId, cd.ruleId))
            .map(([cId, cd]) => {
              let matchScore = cd.score; // base from global score
              // Tag matching bonus
              if (cd.tags.length > 0 && leadTags) {
                for (const t of cd.tags) { if (leadTags.includes(t.toLowerCase())) matchScore += 10; }
              }
              // Speciality matching bonus
              if (cd.specialities && leadTags) {
                for (const sp of cd.specialities.split(',')) { if (sp.trim() && leadTags.includes(sp.trim())) matchScore += 15; }
              }
              // Capacity bonus (less active = higher priority)
              matchScore += Math.max(0, 20 - cd.activeLeads);

              // Goals bonus: reward completed goals, penalize inactive collabs
              try {
                const completedGoals = db.prepare("SELECT COUNT(*) as cnt FROM user_goals WHERE collaborator_id = ? AND companyId = ? AND status = 'completed'").get(cId, companyId)?.cnt || 0;
                const activeGoals = db.prepare("SELECT COUNT(*) as cnt FROM user_goals WHERE collaborator_id = ? AND companyId = ? AND status = 'active'").get(cId, companyId)?.cnt || 0;
                matchScore += Math.min(15, completedGoals * 3);
                if (activeGoals === 0 && completedGoals === 0) matchScore -= 10;
              } catch {}

              // Hybrid mode: also consider percentage
              if (mode === 'hybrid') { matchScore += (cd.percentage || 0) * 0.5; }

              return { collabId: cId, score: matchScore, ruleId: cd.ruleId, reason: `score=${cd.score} match=${matchScore} active=${cd.activeLeads}` };
            })
            .sort((a, b) => b.score - a.score);

          if (ranked.length === 0) break; // No eligible collab
          const best = ranked[0];
          const result = assignLeadToCollab(lead, best.collabId, best.ruleId, companyId, now, envelope_id, req.auth?.userId, req.auth?.name);
          summary[result.collabName] = (summary[result.collabName] || 0) + 1;
          reasons[result.collabName] = best.reason;
          collabData[best.collabId].activeLeads++; collabData[best.collabId].dailyLeads++;
        }

      } else {
        // ─── MODE MANUAL (round-robin equal) ───
        const eligible = rules.filter(r => canReceive(r.collaborator_id, r.id)).map(r => ({ collabId: r.collaborator_id, ruleId: r.id }));
        if (eligible.length === 0) return;
        let idx = 0;
        for (const lead of leads) {
          const startIdx = idx;
          while (!canReceive(eligible[idx % eligible.length].collabId, eligible[idx % eligible.length].ruleId)) {
            idx++;
            if (idx - startIdx >= eligible.length) break;
          }
          if (idx - startIdx >= eligible.length) break;
          const entry = eligible[idx % eligible.length];
          const cId = entry.collabId;
          const ruleId = entry.ruleId;
          const result = assignLeadToCollab(lead, cId, ruleId, companyId, now, envelope_id, req.auth?.userId, req.auth?.name);
          summary[result.collabName] = (summary[result.collabName] || 0) + 1;
          collabData[cId].activeLeads++; collabData[cId].dailyLeads++;
          idx++;
        }
      }
    });
    tx();

    const dispatched = Object.values(summary).reduce((a, b) => a + b, 0);

    logHistory(companyId, 'dispatch_batch', {
      envelope_id, mode, dispatched, summary, reasons
    }, { user_id: req.auth?.userId, user_name: req.auth?.name });

    // V6: update last_dispatch_at on envelope
    try { db.prepare("UPDATE lead_envelopes SET last_dispatch_at = ? WHERE id = ?").run(new Date().toISOString(), envelope_id); } catch {}

    // Notifications groupees par collab
    if (dispatched > 0) {
      const notifMap = {};
      for (const rule of rules) {
        const cnt = summary[collabData[rule.collaborator_id]?.collab?.name] || 0;
        if (cnt > 0) notifMap[rule.collaborator_id] = { name: collabData[rule.collaborator_id]?.collab?.name || '', count: cnt };
      }
      // Fallback: match by name if collabData doesn't have collab
      if (Object.keys(notifMap).length === 0) {
        const allCollabs = db.prepare('SELECT id, name FROM collaborators WHERE companyId = ?').all(companyId);
        for (const [name, cnt] of Object.entries(summary)) {
          const c = allCollabs.find(x => x.name === name);
          if (c && cnt > 0) notifMap[c.id] = { name, count: cnt };
        }
      }
      notifyLeadsAssigned(companyId, notifMap);
    }

    // V5-P1: Detecter les leads non-dispatches et notifier l'admin
    const missed = leads.length - dispatched;
    if (missed > 0) {
      console.warn(`[DISPATCH WARNING] ${missed} lead(s) non-dispatche(s) sur ${leads.length} — collabs satures ou indisponibles (envelope: ${envelope_id})`);
      try {
        const admin = db.prepare("SELECT id FROM collaborators WHERE companyId = ? AND role = 'admin' LIMIT 1").get(companyId);
        if (admin) {
          createNotification({
            companyId, collaboratorId: admin.id, type: 'dispatch_warning',
            title: `${missed} lead${missed > 1 ? 's' : ''} non distribue${missed > 1 ? 's' : ''}`,
            detail: `${missed} lead${missed > 1 ? 's' : ''} sur ${leads.length} n'ont pas pu etre distribue${missed > 1 ? 's' : ''} — tous les collaborateurs sont satures ou indisponibles.`,
            contactId: '', contactName: ''
          });
        }
      } catch (notifErr) { console.error('[DISPATCH NOTIF]', notifErr.message); }
    }

    // V5-TIMING: Mettre a jour last_dispatch_at apres tout dispatch reussi
    if (dispatched > 0) {
      try { db.prepare("UPDATE lead_envelopes SET last_dispatch_at = ? WHERE id = ?").run(new Date().toISOString(), envelope_id); } catch {}
    }

    res.json({ success: true, dispatched, missed, summary, mode, reasons });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MANUAL / SPONTANEOUS DISPATCH ───
router.post('/dispatch-manual', requireAdmin, enforceCompany, requirePermission('leads.manage'), (req, res) => {
  try {
    const { companyId, envelope_id, count, collaboratorIds } = req.body;
    if (!companyId || !envelope_id || !count || !Array.isArray(collaboratorIds) || collaboratorIds.length === 0) {
      return res.status(400).json({ error: 'companyId, envelope_id, count et collaboratorIds requis' });
    }

    // Fetch undispatched leads from this envelope
    const leads = db.prepare(
      "SELECT * FROM incoming_leads WHERE envelope_id = ? AND companyId = ? AND (status IN ('new','queued') OR (status = 'unassigned' AND (assigned_to IS NULL OR assigned_to = ''))) ORDER BY created_at ASC LIMIT ?"
    ).all(envelope_id, companyId, count);

    if (leads.length === 0) {
      return res.json({ success: true, dispatched: 0, message: 'Aucun lead a dispatcher' });
    }

    const now = new Date().toISOString();
    const summary = {};
    const userId = req.auth?.userId;
    const userName = req.auth?.name;

    const notifMap = {};
    const tx = db.transaction(() => {
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const collabId = collaboratorIds[i % collaboratorIds.length];
        const result = assignLeadToCollab(lead, collabId, '', companyId, now, envelope_id, userId, userName);
        summary[result.collabName] = (summary[result.collabName] || 0) + 1;
        if (!notifMap[result.collabId]) notifMap[result.collabId] = { name: result.collabName, count: 0 };
        notifMap[result.collabId].count++;
      }
    });
    tx();

    const dispatched = Object.values(summary).reduce((a, b) => a + b, 0);

    // V6: update last_dispatch_at on envelope
    try { db.prepare("UPDATE lead_envelopes SET last_dispatch_at = ? WHERE id = ?").run(now, envelope_id); } catch {}

    logHistory(companyId, 'dispatch_batch', {
      envelope_id, mode: 'manual', dispatched, summary
    }, { user_id: userId, user_name: userName });

    // Notifications groupees
    if (dispatched > 0) notifyLeadsAssigned(companyId, notifMap);

    res.json({ success: true, dispatched, summary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DISPATCH DIRECT (attribution manuelle collab + nombre) ───
router.post('/dispatch-direct', requireAdmin, enforceCompany, requirePermission('leads.manage'), (req, res) => {
  try {
    const { companyId, envelope_id, assignments } = req.body;
    // assignments = [{collaborator_id, count}, ...]
    if (!companyId || !envelope_id || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'companyId, envelope_id, assignments requis' });
    }

    // Fetch all available leads from this envelope
    const availableLeads = db.prepare(
      "SELECT * FROM incoming_leads WHERE envelope_id = ? AND companyId = ? AND (status IN ('new','queued') OR (status = 'unassigned' AND (assigned_to IS NULL OR assigned_to = ''))) ORDER BY created_at ASC"
    ).all(envelope_id, companyId);

    if (availableLeads.length === 0) {
      return res.json({ success: true, dispatched: 0, message: 'Aucun lead disponible' });
    }

    const now = new Date().toISOString();
    const summary = {};
    const userId = req.auth?.userId;
    const userName = req.auth?.name;
    let idx = 0;

    const notifMap = {};
    const tx = db.transaction(() => {
      for (const { collaborator_id, count } of assignments) {
        const cnt = Math.min(parseInt(count) || 0, availableLeads.length - idx);
        for (let i = 0; i < cnt && idx < availableLeads.length; i++, idx++) {
          const lead = availableLeads[idx];
          const result = assignLeadToCollab(lead, collaborator_id, '', companyId, now, envelope_id, userId, userName);
          summary[result.collabName] = (summary[result.collabName] || 0) + 1;
          if (!notifMap[result.collabId]) notifMap[result.collabId] = { name: result.collabName, count: 0 };
          notifMap[result.collabId].count++;
        }
      }
    });
    tx();

    const dispatched = Object.values(summary).reduce((a, b) => a + b, 0);
    try { db.prepare("UPDATE lead_envelopes SET last_dispatch_at = ? WHERE id = ?").run(now, envelope_id); } catch {}

    logHistory(companyId, 'dispatch_direct', {
      envelope_id, mode: 'direct', dispatched, summary
    }, { user_id: userId, user_name: userName });

    // Notifications groupees
    if (dispatched > 0) notifyLeadsAssigned(companyId, notifMap);

    res.json({ success: true, dispatched, summary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DISPATCH SIMULATE (preview Score IA sans executer) ───
router.post('/dispatch-simulate', requireAdmin, enforceCompany, requirePermission('leads.view'), (req, res) => {
  try {
    const { companyId, envelope_id, count } = req.body;
    if (!companyId || !envelope_id) return res.status(400).json({ error: 'companyId, envelope_id requis' });

    const envelope = db.prepare('SELECT * FROM lead_envelopes WHERE id = ? AND companyId = ?').get(envelope_id, companyId);
    if (!envelope) return res.status(404).json({ error: 'Flux introuvable' });

    const rules = db.prepare('SELECT * FROM lead_dispatch_rules WHERE envelope_id = ? AND active = 1').all(envelope_id);
    if (rules.length === 0) return res.json({ error: 'Aucun collaborateur configure' });

    // Count available leads
    const availableCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM incoming_leads WHERE envelope_id = ? AND companyId = ? AND (status IN ('new','queued') OR (status = 'unassigned' AND (assigned_to IS NULL OR assigned_to = '')))"
    ).get(envelope_id, companyId)?.cnt || 0;

    const totalToDispatch = count ? Math.min(parseInt(count), availableCount) : availableCount;

    // Compute scores for each collab in the rules
    const simulation = [];
    let totalScore = 0;

    for (const rule of rules) {
      const collab = db.prepare('SELECT id, name, color FROM collaborators WHERE id = ?').get(rule.collaborator_id);
      if (!collab) continue;

      const score = db.prepare('SELECT * FROM lead_distribution_scores WHERE collaborator_id = ? AND companyId = ?').get(rule.collaborator_id, companyId);

      // Compute individual metrics
      const totalCalls = db.prepare("SELECT COUNT(*) as cnt FROM call_logs WHERE collaboratorId = ? AND companyId = ?").get(rule.collaborator_id, companyId)?.cnt || 0;
      const validCalls = db.prepare("SELECT COUNT(*) as cnt FROM call_logs WHERE collaboratorId = ? AND companyId = ? AND is_valid_call = 1").get(rule.collaborator_id, companyId)?.cnt || 0;
      const avgQuality = db.prepare("SELECT AVG(qualityScore) as avg FROM ai_copilot_analyses WHERE collaboratorId = ? AND companyId = ?").get(rule.collaborator_id, companyId)?.avg || 0;
      const conversions = db.prepare("SELECT COUNT(*) as cnt FROM incoming_leads WHERE assigned_to = ? AND companyId = ? AND status = 'converted'").get(rule.collaborator_id, companyId)?.cnt || 0;
      const activeLeads = db.prepare("SELECT COUNT(*) as cnt FROM incoming_leads WHERE assigned_to = ? AND companyId = ? AND status = 'assigned'").get(rule.collaborator_id, companyId)?.cnt || 0;

      const globalScore = score?.score_global || 50;
      totalScore += globalScore;

      simulation.push({
        collaborator_id: rule.collaborator_id,
        name: collab.name,
        color: collab.color,
        score_global: globalScore,
        metrics: {
          total_calls: totalCalls,
          valid_calls: validCalls,
          avg_quality: Math.round(avgQuality * 10) / 10,
          conversions,
          active_leads: activeLeads,
          call_score: score?.score_calls || 0,
          quality_score: score?.score_quality || 0,
          conversion_score: score?.score_conversion || 0,
          speed_score: score?.score_speed || 0,
        },
        percentage: 0,
        leads_count: 0
      });
    }

    // Distribute proportionally to score
    if (totalScore > 0) {
      let remaining = totalToDispatch;
      for (let i = 0; i < simulation.length; i++) {
        const pct = simulation[i].score_global / totalScore;
        simulation[i].percentage = Math.round(pct * 100);
        if (i === simulation.length - 1) {
          simulation[i].leads_count = remaining;
        } else {
          const cnt = Math.round(totalToDispatch * pct);
          simulation[i].leads_count = cnt;
          remaining -= cnt;
        }
      }
    }

    // Sort by score descending
    simulation.sort((a, b) => b.score_global - a.score_global);

    res.json({ success: true, available: availableCount, total_to_dispatch: totalToDispatch, simulation });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DISTRIBUTION SCORES ───
router.get('/scores', requireAdmin, enforceCompany, requirePermission('leads.view'), (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const rows = db.prepare(`
      SELECT lds.*, c.name as collaborator_name, c.color as collaborator_color,
             c.max_active_leads, c.max_daily_leads
      FROM lead_distribution_scores lds
      LEFT JOIN collaborators c ON lds.collaborator_id = c.id
      WHERE lds.companyId = ?
      ORDER BY lds.score_global DESC
    `).all(companyId);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/scores/recalc', requireAdmin, enforceCompany, requirePermission('leads.manage'), (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    recalcScores(companyId);
    const rows = db.prepare(`
      SELECT lds.*, c.name as collaborator_name, c.color as collaborator_color
      FROM lead_distribution_scores lds
      LEFT JOIN collaborators c ON lds.collaborator_id = c.id
      WHERE lds.companyId = ?
      ORDER BY lds.score_global DESC
    `).all(companyId);
    res.json({ success: true, scores: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ASSIGNMENTS HISTORY ───
router.get('/assignments', requireAdmin, enforceCompany, requirePermission('leads.view'), (req, res) => {
  try {
    const { companyId, collaborator_id, limit = '100', offset = '0' } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    let sql = 'SELECT * FROM lead_assignments WHERE companyId = ?';
    const params = [companyId];
    if (collaborator_id) { sql += ' AND collaborator_id = ?'; params.push(collaborator_id); }
    sql += ' ORDER BY assigned_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const rows = db.prepare(sql).all(...params);
    const enriched = rows.map(r => {
      const lead = db.prepare('SELECT first_name, last_name, email, phone FROM incoming_leads WHERE id = ?').get(r.lead_id);
      const collab = db.prepare('SELECT name, color FROM collaborators WHERE id = ?').get(r.collaborator_id);
      return {
        ...r,
        lead_name: lead ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') : 'Inconnu',
        lead_email: lead?.email || '',
        lead_phone: lead?.phone || '',
        collaborator_name: collab?.name || 'Inconnu',
        collaborator_color: collab?.color || '#64748B'
      };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── IMPORT LOGS ───
router.get('/import-logs', requireAdmin, enforceCompany, requirePermission('leads.view'), (req, res) => {
  try {
    const { companyId, limit = '50', offset = '0' } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const rows = db.prepare('SELECT * FROM lead_import_logs WHERE companyId = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(companyId, parseInt(limit), parseInt(offset));
    const enriched = rows.map(r => {
      const parsed = parseRow('lead_import_logs', r);
      // Add source name
      const src = r.source_id ? db.prepare('SELECT name FROM lead_sources WHERE id = ?').get(r.source_id) : null;
      const env = r.envelope_id ? db.prepare('SELECT name FROM lead_envelopes WHERE id = ?').get(r.envelope_id) : null;
      return { ...parsed, source_name: src?.name || '', envelope_name: env?.name || '' };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── LEAD HISTORY ───
router.get('/history', requireAdmin, enforceCompany, requirePermission('leads.view'), (req, res) => {
  try {
    const { companyId, lead_id, action, limit = '100', offset = '0' } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    let sql = 'SELECT * FROM lead_history WHERE companyId = ?';
    const params = [companyId];
    if (lead_id) { sql += ' AND lead_id = ?'; params.push(lead_id); }
    if (action) { sql += ' AND action = ?'; params.push(action); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map(r => parseRow('lead_history', r)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ENHANCED STATS ───
router.get('/stats', requireAdmin, enforceCompany, requirePermission('leads.view'), (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    const total = db.prepare('SELECT COUNT(*) as cnt FROM incoming_leads WHERE companyId = ?').get(companyId)?.cnt || 0;
    const byStatus = {};
    const statusRows = db.prepare('SELECT status, COUNT(*) as cnt FROM incoming_leads WHERE companyId = ? GROUP BY status').all(companyId);
    for (const r of statusRows) byStatus[r.status] = r.cnt;

    const sourcesCount = db.prepare('SELECT COUNT(*) as cnt FROM lead_sources WHERE companyId = ?').get(companyId)?.cnt || 0;
    const envelopesCount = db.prepare('SELECT COUNT(*) as cnt FROM lead_envelopes WHERE companyId = ?').get(companyId)?.cnt || 0;

    const inbox = (byStatus['new'] || 0) + (byStatus['queued'] || 0);
    const dispatched = byStatus['assigned'] || 0;
    const converted = byStatus['converted'] || 0;

    // Contacts created from leads
    const contactsFromLeads = db.prepare("SELECT COUNT(*) as cnt FROM contacts WHERE companyId = ? AND source = 'lead'").get(companyId)?.cnt || 0;

    const bySource = db.prepare(`
      SELECT ls.name as source_name, ls.type, COUNT(il.id) as cnt
      FROM incoming_leads il
      LEFT JOIN lead_sources ls ON il.source_id = ls.id
      WHERE il.companyId = ?
      GROUP BY il.source_id
      ORDER BY cnt DESC
    `).all(companyId);

    const byCollaborator = db.prepare(`
      SELECT la.collaborator_id, c.name, c.color, COUNT(*) as cnt
      FROM lead_assignments la
      LEFT JOIN collaborators c ON la.collaborator_id = c.id
      WHERE la.companyId = ?
      GROUP BY la.collaborator_id
      ORDER BY cnt DESC
    `).all(companyId);

    const byEnvelope = db.prepare(`
      SELECT le.id, le.name, COUNT(il.id) as cnt,
        SUM(CASE WHEN il.status = 'new' THEN 1 ELSE 0 END) as new_count,
        SUM(CASE WHEN il.status = 'queued' THEN 1 ELSE 0 END) as queued_count,
        SUM(CASE WHEN il.status = 'assigned' THEN 1 ELSE 0 END) as assigned_count
      FROM lead_envelopes le
      LEFT JOIN incoming_leads il ON il.envelope_id = le.id
      WHERE le.companyId = ?
      GROUP BY le.id
      ORDER BY cnt DESC
    `).all(companyId);

    const last30 = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as cnt
      FROM incoming_leads
      WHERE companyId = ? AND created_at >= date('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).all(companyId);

    // Recent imports
    const recentImports = db.prepare(`
      SELECT id, type, filename, imported, duplicates, errors, total_rows, created_at
      FROM lead_import_logs WHERE companyId = ? ORDER BY created_at DESC LIMIT 5
    `).all(companyId);

    // ── Enhanced stats: time-based counts ──
    const today = new Date().toISOString().split('T')[0];
    const todayCount = db.prepare("SELECT COUNT(*) as cnt FROM lead_assignments WHERE companyId = ? AND assigned_at >= ?").get(companyId, today)?.cnt || 0;

    // This week (Monday-based)
    const nowD = new Date();
    const dayOfWeek = nowD.getDay() === 0 ? 6 : nowD.getDay() - 1;
    const monday = new Date(nowD); monday.setDate(nowD.getDate() - dayOfWeek); monday.setHours(0,0,0,0);
    const thisWeek = db.prepare("SELECT COUNT(*) as cnt FROM lead_assignments WHERE companyId = ? AND assigned_at >= ?").get(companyId, monday.toISOString())?.cnt || 0;

    // This month
    const monthStart = today.slice(0, 7) + '-01';
    const thisMonth = db.prepare("SELECT COUNT(*) as cnt FROM lead_assignments WHERE companyId = ? AND assigned_at >= ?").get(companyId, monthStart)?.cnt || 0;

    // This year
    const yearStart = today.slice(0, 4) + '-01-01';
    const thisYear = db.prepare("SELECT COUNT(*) as cnt FROM lead_assignments WHERE companyId = ? AND assigned_at >= ?").get(companyId, yearStart)?.cnt || 0;

    // ── Per-collaborator per-envelope breakdown ──
    let byCollabEnvelope = [];
    try {
      byCollabEnvelope = db.prepare(`
        SELECT la.collaborator_id, c.name as collaborator_name, c.color as collaborator_color,
          le.id as envelope_id, le.name as envelope_name, COUNT(*) as cnt
        FROM lead_assignments la
        LEFT JOIN collaborators c ON la.collaborator_id = c.id
        LEFT JOIN incoming_leads il ON la.lead_id = il.id
        LEFT JOIN lead_envelopes le ON il.envelope_id = le.id
        WHERE la.companyId = ?
        GROUP BY la.collaborator_id, il.envelope_id
        ORDER BY cnt DESC
      `).all(companyId);
    } catch {}

    // ── Daily dispatch trend (last 30 days) ──
    let dispatchLast30 = [];
    try {
      dispatchLast30 = db.prepare(`
        SELECT date(assigned_at) as day, COUNT(*) as cnt
        FROM lead_assignments
        WHERE companyId = ? AND assigned_at >= date('now', '-30 days')
        GROUP BY date(assigned_at)
        ORDER BY day ASC
      `).all(companyId);
    } catch {}

    res.json({
      total, byStatus, bySource, byCollaborator, byEnvelope, last30,
      sourcesCount, envelopesCount, inbox, dispatched, converted, contactsFromLeads, recentImports,
      todayCount, thisWeek, thisMonth, thisYear,
      byCollabEnvelope, dispatchLast30
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SOURCE SYNC CONFIG ───
router.put('/sources/:id/sync', requireAdmin, requirePermission('leads.manage'), (req, res) => {
  try {
    if (!verifyOwnership('lead_sources', req.params.id, req, res)) return;
    const { sync_mode, gsheet_url, sync_interval, sync_envelope_id } = req.body;
    const updates = {};
    if (sync_mode !== undefined) updates.sync_mode = sync_mode;
    if (gsheet_url !== undefined) updates.gsheet_url = gsheet_url;
    if (sync_interval !== undefined) updates.sync_interval = parseInt(sync_interval) || 30;
    if (sync_envelope_id !== undefined) updates.sync_envelope_id = sync_envelope_id;
    if (Object.keys(updates).length === 0) return res.json({ success: true });
    const sets = Object.keys(updates).map(k => `${k} = ?`).join(',');
    db.prepare(`UPDATE lead_sources SET ${sets} WHERE id = ?`).run(...Object.values(updates), req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sources/:id/sync-now', requireAdmin, requirePermission('leads.manage'), async (req, res) => {
  try {
    if (!verifyOwnership('lead_sources', req.params.id, req, res)) return;
    const source = db.prepare('SELECT * FROM lead_sources WHERE id = ?').get(req.params.id);
    if (!source) return res.status(404).json({ error: 'Source introuvable' });
    if (!source.gsheet_url) return res.status(400).json({ error: 'Aucune URL Google Sheet configuree pour cette source' });

    // Fetch Google Sheet
    const match = source.gsheet_url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ error: 'URL Google Sheet invalide' });
    const sheetId = match[1];
    const gidMatch = source.gsheet_url.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const response = await fetch(csvUrl);
    if (!response.ok) return res.status(400).json({ error: 'Impossible de lire le Google Sheet' });

    const csvText = await response.text();
    const parsed = parseCSV(csvText);
    if (!parsed) return res.status(400).json({ error: 'Sheet vide' });

    const currentRowCount = parsed.rows.length;
    const lastRowCount = source.last_row_count || 0;

    if (currentRowCount <= lastRowCount) {
      db.prepare('UPDATE lead_sources SET last_sync = ? WHERE id = ?').run(new Date().toISOString(), source.id);
      return res.json({ success: true, newRows: 0, message: 'Aucune nouvelle ligne' });
    }

    // Only import new rows
    const newRows = parsed.rows.slice(lastRowCount);
    const newParsed = { headers: parsed.headers, rows: newRows, sep: parsed.sep, totalRows: newRows.length };

    // Get mapping from source config
    let mapping = {};
    try { mapping = JSON.parse(source.mapping_json || '{}'); } catch {}
    if (Object.keys(mapping).length === 0) mapping = autoDetectMapping(parsed.headers);

    const result = executeImport({
      companyId: source.companyId,
      lines_parsed: newParsed,
      mapping,
      source_id: source.id,
      envelope_id: source.sync_envelope_id || null,
      importType: 'gsheet',
      filename: `Sync ${source.name} (+${newRows.length} lignes)`,
      userId: req.auth?.userId,
      userName: req.auth?.name
    });

    // Update last_row_count + last_sync
    db.prepare('UPDATE lead_sources SET last_row_count = ?, last_sync = ?, mapping_json = ? WHERE id = ?')
      .run(currentRowCount, new Date().toISOString(), JSON.stringify(mapping), source.id);

    logHistory(source.companyId, 'gsheet_sync', {
      source_id: source.id, source_name: source.name,
      newRows: newRows.length, imported: result.imported, duplicates: result.duplicates
    }, { user_id: req.auth?.userId, user_name: req.auth?.name });

    res.json({ success: true, newRows: newRows.length, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MANAGER STATS ───
router.get('/manager-stats', requireAdmin, enforceCompany, requirePermission('leads.view'), (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();

    const collabs = db.prepare("SELECT id, name, color FROM collaborators WHERE companyId = ?").all(companyId);
    const collabStats = collabs.map(c => {
      const totalLeads = db.prepare("SELECT COUNT(*) as cnt FROM incoming_leads WHERE companyId = ? AND assigned_to = ?").get(companyId, c.id)?.cnt || 0;
      const convertedLeads = db.prepare("SELECT COUNT(*) as cnt FROM incoming_leads WHERE companyId = ? AND assigned_to = ? AND status = 'converted'").get(companyId, c.id)?.cnt || 0;
      const activeLeads = db.prepare("SELECT COUNT(*) as cnt FROM incoming_leads WHERE companyId = ? AND assigned_to = ? AND status = 'assigned'").get(companyId, c.id)?.cnt || 0;

      // Valid vs invalid calls
      const validCalls = db.prepare("SELECT COUNT(*) as cnt FROM call_logs WHERE companyId = ? AND collaboratorId = ? AND createdAt >= ? AND is_valid_call = 1").get(companyId, c.id, thirtyDaysAgo)?.cnt || 0;
      const totalCalls = db.prepare("SELECT COUNT(*) as cnt FROM call_logs WHERE companyId = ? AND collaboratorId = ? AND createdAt >= ?").get(companyId, c.id, thirtyDaysAgo)?.cnt || 0;
      const avgDuration = db.prepare("SELECT AVG(duration) as avg FROM call_logs WHERE companyId = ? AND collaboratorId = ? AND createdAt >= ? AND is_valid_call = 1").get(companyId, c.id, thirtyDaysAgo)?.avg || 0;

      // AI quality
      let avgQuality = 0, avgConversion = 0;
      try {
        const ai = db.prepare("SELECT AVG(qualityScore) as q, AVG(conversionScore) as cv FROM ai_copilot_analyses WHERE companyId = ? AND collaboratorId = ? AND createdAt >= ?").get(companyId, c.id, thirtyDaysAgo);
        avgQuality = Math.round(ai?.q || 0);
        avgConversion = Math.round(ai?.cv || 0);
      } catch {}

      // Score
      const score = db.prepare("SELECT score_global FROM lead_distribution_scores WHERE collaborator_id = ? AND companyId = ?").get(c.id, companyId);

      return {
        id: c.id, name: c.name, color: c.color,
        totalLeads, convertedLeads, activeLeads, uncalledLeads: activeLeads,
        validCalls, invalidCalls: totalCalls - validCalls, totalCalls,
        avgCallDuration: Math.round(avgDuration),
        avgQuality, avgConversion,
        scoreGlobal: score?.score_global || 50
      };
    });

    res.json({ success: true, collabStats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
