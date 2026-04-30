import { Router } from 'express';
import { db, getByCompany, insert, remove } from '../db/database.js';
import { snapshotAiProfile, saveProfileHistory, getProfileChanges } from '../services/aiCopilot.js';
import bcrypt from 'bcryptjs';
import { requireAuth, requireAdmin, requireSupra, enforceCompany } from '../middleware/auth.js';
import { logAudit } from '../helpers/audit.js';
import { trackChanges } from '../helpers/entityHistory.js';
import { archiveCollaborator } from '../services/collaborators/archiveCollaborator.js';
import { hardDeleteCollaborator } from '../services/collaborators/hardDeleteCollaborator.js';

const router = Router();

// GET /api/collaborators?companyId=c1
// Wave D — filtre archivés par défaut. Pour vue admin "archivés" : ?includeArchived=1
router.get('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const all = getByCompany('collaborators', companyId);
    const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true';
    const rows = includeArchived ? all : all.filter(c => !c.archivedAt || c.archivedAt === '');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/collaborators
router.post('/', requireAuth, enforceCompany, async (req, res) => {
  try {
    console.log('[COLLAB CREATE] Body:', JSON.stringify(req.body).slice(0, 200), '| Auth companyId:', req.auth?.companyId, '| req.companyId:', req.companyId);
    const c = req.body;
    // Forcer companyId depuis l'auth — ne jamais truster le client
    const safeCompanyId = req.auth?.isSupra ? (c.companyId || req.auth.companyId) : (req.auth?.companyId || req.companyId);
    if (!safeCompanyId) { console.log('[COLLAB CREATE] ERROR: no companyId'); return res.status(400).json({ error: 'companyId requis' }); }
    c.companyId = safeCompanyId;
    const id = c.id || 'u' + Date.now();
    // Hash password if provided
    let pwd = c.password || '';
    if (pwd && !pwd.startsWith('$2')) {
      pwd = await bcrypt.hash(pwd, 10);
    }
    insert('collaborators', {
      id,
      companyId: c.companyId,
      name: c.name,
      email: c.email || '',
      role: c.role || 'member',
      priority: c.priority || 1,
      color: c.color || '#2563EB',
      code: c.code || '',
      password: pwd,
      phone: c.phone || '',
      maxWeek: c.maxWeek || 20,
      maxMonth: c.maxMonth || 80,
      slackId: c.slackId || '',
      timezone: c.timezone || null,
      chat_enabled: c.chat_enabled !== undefined ? c.chat_enabled : 1,
      sms_enabled: c.sms_enabled || 0,
      can_delete_contacts: c.can_delete_contacts || 0,
      secure_ia_phone: c.secure_ia_phone || 0,
      secure_ia_words_json: c.secure_ia_words_json || '[]',
      ai_copilot_enabled: c.ai_copilot_enabled || 0,
      ai_copilot_role: c.ai_copilot_role || '',
      ai_copilot_objective: c.ai_copilot_objective || '',
      ai_copilot_target: c.ai_copilot_target || '',
      ai_copilot_level: c.ai_copilot_level || 'off',
      ai_role_type: c.ai_role_type || '',
      ai_service_type: c.ai_service_type || '',
      ai_main_mission: c.ai_main_mission || '',
      ai_call_type_default: c.ai_call_type_default || '',
      ai_call_goal_default: c.ai_call_goal_default || '',
      ai_target_default: c.ai_target_default || '',
      ai_language: c.ai_language || 'fr',
      ai_tone_style: c.ai_tone_style || 'commercial',
      ai_script_trame: c.ai_script_trame || '',
    });
    // REGLE: Chaque nouveau collab a automatiquement un calendrier + disponibilités par défaut
    // 1. Créer un calendrier unique pour ce collab
    const calId = 'cal_' + id + '_' + Date.now();
    try {
      insert('calendars', {
        id: calId,
        companyId: c.companyId,
        name: 'Agenda ' + (c.name || 'principal'),
        slug: 'agenda-' + id,
        duration: 30,
        maxPerDay: 20,
        collaborators_json: JSON.stringify([id])
      });
    } catch (calErr) { console.log('[COLLAB] Calendar creation error:', calErr.message); }
    // 2. Créer les disponibilités par défaut (Lun-Ven 9h-12h + 14h-18h)
    const defAvail = {};
    for (let d = 0; d < 5; d++) defAvail[d] = { active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] };
    defAvail[5] = { active: false, slots: [] };
    defAvail[6] = { active: false, slots: [] };
    db.prepare('INSERT OR REPLACE INTO availabilities (collaboratorId, schedule_json) VALUES (?, ?)').run(id, JSON.stringify(defAvail));
    logAudit(req, 'collaborator_created', 'admin', 'collaborator', id, 'Collaborateur cree: ' + c.name + ' (' + (c.email || '') + ')', { role: c.role || 'member' });
    console.log('[COLLAB CREATE] SUCCESS:', id, c.name, c.companyId);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[COLLAB CREATE ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/collaborators/:id/voicemail-audio — Upload voicemail audio file
router.post('/:id/voicemail-audio', requireAuth, async (req, res) => {
  try {
    // SECURITE: vérifier company + ownership (seul le collab ou son admin peut uploader)
    const target = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Collaborateur introuvable' });
    if (!req.auth.isSupra && target.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    if (req.auth.role !== 'admin' && !req.auth.isSupra && req.params.id !== req.auth.collaboratorId) return res.status(403).json({ error: 'Vous ne pouvez modifier que votre propre voicemail' });
    const { audio, filename } = req.body;
    if (!audio) return res.status(400).json({ error: 'Audio requis' });
    // Save base64 audio as file
    const fs = await import('fs');
    const path = await import('path');
    const ext = (filename || 'audio.mp3').split('.').pop() || 'mp3';
    const fname = `voicemail_${req.params.id}_${Date.now()}.${ext}`;
    const dir = path.default.join(process.cwd(), 'uploads', 'voicemail');
    fs.default.mkdirSync(dir, { recursive: true });
    const base64Data = audio.replace(/^data:audio\/\w+;base64,/, '');
    fs.default.writeFileSync(path.default.join(dir, fname), Buffer.from(base64Data, 'base64'));
    const url = `/uploads/voicemail/${fname}`;
    // Update collab
    db.prepare('UPDATE collaborators SET voicemail_audio_url = ? WHERE id = ?').run(url, req.params.id);
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/collaborators/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    // Ownership check: collaborator must belong to caller's company
    if (req.auth && !req.auth.isSupra) {
      const target = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(req.params.id);
      if (!target) return res.status(404).json({ error: 'Collaborateur introuvable' });
      if (target.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit à ce collaborateur' });
      // SECURITE: non-admin ne peut modifier que SES propres infos
      if (req.auth.role !== 'admin' && req.params.id !== req.auth.collaboratorId) {
        return res.status(403).json({ error: 'Vous ne pouvez modifier que votre propre profil' });
      }
    }
    const data = { ...req.body };
    const modifiedBy = data._modified_by || 'admin';
    const modifiedByType = data._modified_by_type || 'admin';
    const modifyReason = data._modify_reason || '';
    delete data.id;
    delete data._modified_by;
    delete data._modified_by_type;
    delete data._modify_reason;
    // Hash password if being updated
    if (data.password && !data.password.startsWith('$2')) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    // Whitelist allowed fields to prevent SQL injection via key names
    const allowedFields = ['name','email','role','priority','color','code','password','phone','maxWeek','maxMonth','slackId','timezone','chat_enabled','sms_enabled','can_delete_contacts','google_tokens_json','google_email','google_last_sync','google_events_private','companyId','secure_ia_phone','secure_ia_words_json','ai_copilot_enabled','ai_copilot_role','ai_copilot_objective','ai_copilot_target','ai_copilot_level','ai_role_type','ai_service_type','ai_main_mission','ai_call_type_default','ai_call_goal_default','ai_target_default','ai_language','ai_tone_style','ai_script_trame'];
    const safeData = {};
    for (const k of Object.keys(data)) {
      if (allowedFields.includes(k)) safeData[k] = data[k];
    }
    if (Object.keys(safeData).length === 0) return res.json({ success: true });

    // Check if any AI profile fields are changing
    const hasAiChanges = Object.keys(safeData).some(k => k.startsWith('ai_'));
    let aiChanges = [];
    if (hasAiChanges) {
      const currentCollab = db.prepare('SELECT * FROM collaborators WHERE id = ?').get(req.params.id);
      if (currentCollab) {
        aiChanges = getProfileChanges(currentCollab, safeData);
        if (aiChanges.length > 0) {
          // Save current AI profile as history before updating
          const snapshot = snapshotAiProfile(currentCollab);
          const summary = aiChanges.map(c => c.field.replace('ai_', '')).join(', ');
          saveProfileHistory(req.params.id, currentCollab.companyId, snapshot, modifiedBy, modifiedByType, modifyReason, summary);

          // If collaborator modified their own profile, log it for admin notification
          if (modifiedByType === 'collaborator') {
            const logId = 'log_' + Date.now() + Math.random().toString(36).slice(2, 5);
            db.prepare('INSERT INTO activity_logs (id, companyId, companyName, action, detail, timestamp, user) VALUES (?,?,?,?,?,?,?)').run(
              logId, currentCollab.companyId, '', 'collab_profile_update',
              JSON.stringify({ collaboratorId: req.params.id, collaboratorName: currentCollab.name, changes: aiChanges }),
              new Date().toISOString(), currentCollab.name
            );
          }
        }
      }
    }

    // Track field-level changes before UPDATE
    const beforeUpdate = db.prepare('SELECT * FROM collaborators WHERE id = ?').get(req.params.id);
    const sets = Object.keys(safeData).map(k => `${k} = ?`).join(',');
    const values = Object.values(safeData);
    values.push(req.params.id);
    db.prepare(`UPDATE collaborators SET ${sets} WHERE id = ?`).run(...values);
    // Audit + entity history
    trackChanges('collaborator', req.params.id, beforeUpdate, safeData, req.auth?.collaboratorId || '', req.auth?.companyId || '', ['name','email','role','phone','roleId','can_delete_contacts','chat_enabled','sms_enabled','ai_copilot_enabled','secure_ia_phone']);
    logAudit(req, 'collaborator_updated', 'admin', 'collaborator', req.params.id, 'Collaborateur modifie: ' + (beforeUpdate?.name || ''), { fields: Object.keys(safeData) });
    res.json({ success: true, aiChangesLogged: aiChanges.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/collaborators/:id/availability
router.put('/:id/availability', requireAuth, (req, res) => {
  try {
    // Ownership: collab ne peut modifier que SES dispos (sauf admin)
    if (!req.auth.isAdmin && !req.auth.isSupra && req.params.id !== req.auth.collaboratorId) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres disponibilités' });
    }
    // CompanyId check
    if (!req.auth.isSupra) {
      const target = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(req.params.id);
      if (target && target.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
    }
    const schedule = req.body;
    db.prepare('INSERT OR REPLACE INTO availabilities (collaboratorId, schedule_json) VALUES (?, ?)').run(req.params.id, JSON.stringify(schedule));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/collaborators/:id
// Wave D commit 1 — devient un archivage métier par défaut (réversible via /restore).
// Body optionnel : { targetAdminId, allowUnassigned }
// Query optionnel : ?target=unassigned (shortcut allowUnassigned)
// Pas de hard-delete ici (ce sera /hard dans commit 2).
router.delete('/:id', requireAuth, (req, res) => {
  try {
    // SECURITE: admin ou supra uniquement
    if (req.auth.role !== 'admin' && !req.auth.isSupra) {
      return res.status(403).json({ error: 'Seul un admin peut archiver un collaborateur' });
    }
    const id = req.params.id;
    const companyId = req.auth.isSupra ? (req.body?.companyId || req.query.companyId || req.auth.companyId) : req.auth.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });

    // Ownership check (sauf supra)
    if (!req.auth.isSupra) {
      const target = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(id);
      if (!target) return res.status(404).json({ error: 'Collaborateur introuvable' });
      if (target.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit à ce collaborateur' });
    }

    const allowUnassigned = req.query.target === 'unassigned' || req.body?.allowUnassigned === true;
    const targetAdminId = req.body?.targetAdminId || null;

    try {
      const result = archiveCollaborator(db, {
        collabId: id,
        actorCollaboratorId: req.auth.collaboratorId || '',
        companyId,
        targetAdminId,
        allowUnassigned,
      });
      return res.json({ success: true, archived: true, ...result });
    } catch (err) {
      const MAP = {
        COLLAB_ID_REQUIRED: 400,
        COMPANY_ID_REQUIRED: 400,
        COLLAB_NOT_FOUND: 404,
        COLLAB_WRONG_COMPANY: 403,
        ALREADY_ARCHIVED: 409,
        BOOKINGS_IMMINENT: 409,
        NO_ADMIN_AVAILABLE: 409,
      };
      const status = MAP[err.message] || 500;
      const body = { error: err.message };
      if (err.message === 'BOOKINGS_IMMINENT') {
        body.imminentCount = err.imminentCount;
        body.imminentBookings = err.imminentBookings;
      }
      if (err.message === 'ALREADY_ARCHIVED') body.archivedAt = err.archivedAt;
      console.error('[ARCHIVE COLLAB ROUTE]', err.message);
      return res.status(status).json(body);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/collaborators/:id/restore — Wave D commit 1
// Réactive un collaborateur archivé. Asymétrique : ne restore PAS les réassignations effectuées.
router.post('/:id/restore', requireAuth, (req, res) => {
  try {
    if (req.auth.role !== 'admin' && !req.auth.isSupra) {
      return res.status(403).json({ error: 'Seul un admin peut réactiver un collaborateur' });
    }
    const id = req.params.id;
    const target = db.prepare('SELECT id, companyId, name, archivedAt FROM collaborators WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'Collaborateur introuvable' });
    if (!req.auth.isSupra && target.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'Accès interdit à ce collaborateur' });
    }
    if (!target.archivedAt || target.archivedAt === '') {
      return res.status(409).json({ error: 'NOT_ARCHIVED' });
    }
    const now = new Date().toISOString();
    db.prepare("UPDATE collaborators SET archivedAt = '', archivedBy = '' WHERE id = ?").run(id);
    try {
      db.prepare(
        `INSERT INTO audit_logs
          (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'aud_rstr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        target.companyId,
        req.auth.collaboratorId || '', '', '',
        'collaborator_restored', 'collaborator', 'collaborator', id,
        `Collaborateur "${target.name}" réactivé (asymétrique : réassignations antérieures conservées)`,
        JSON.stringify({ collabId: id, restoredBy: req.auth.collaboratorId, previousArchivedAt: target.archivedAt }).slice(0, 2000),
        now
      );
    } catch (e) { console.warn('[RESTORE COLLAB] audit_logs insert failed:', e.message); }
    console.log(`[RESTORE COLLAB] id=${id} name="${target.name}" by=${req.auth.collaboratorId || 'unknown'}`);
    res.json({ success: true, restored: true, collabId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/collaborators/:id/hard?confirm=true — Wave D commit 2
// Hard-delete exceptionnel. Conditions cumulatives strictes (cf règle D.7).
// Triple garde-fou : query ?confirm=true + header X-Confirm-Collab-Delete: <id> + role admin/supra.
router.delete('/:id/hard', requireAuth, (req, res) => {
  try {
    const id = req.params.id;

    // Garde-fou 1 : role admin ou supra
    if (req.auth.role !== 'admin' && !req.auth.isSupra) {
      return res.status(403).json({ error: 'Seul un admin peut hard-delete un collaborateur' });
    }

    // Garde-fou 2 : ?confirm=true obligatoire
    if (req.query.confirm !== 'true') {
      return res.status(400).json({ error: 'CONFIRM_REQUIRED', hint: 'Ajoutez ?confirm=true' });
    }

    // Garde-fou 3 : header X-Confirm-Collab-Delete doit égaler l'id
    const headerConfirm = req.get('X-Confirm-Collab-Delete') || req.headers['x-confirm-collab-delete'];
    if (headerConfirm !== id) {
      return res.status(400).json({ error: 'CONFIRM_HEADER_MISMATCH', hint: `Fournissez header X-Confirm-Collab-Delete: ${id}` });
    }

    // Ownership check (sauf supra)
    const target = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'Collaborateur introuvable' });
    if (!req.auth.isSupra && target.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'Accès interdit à ce collaborateur' });
    }

    try {
      const result = hardDeleteCollaborator(db, {
        collabId: id,
        actorCollaboratorId: req.auth.collaboratorId || '',
        companyId: target.companyId,
      });
      return res.json({ success: true, hardDeleted: true, ...result });
    } catch (err) {
      const MAP = {
        COLLAB_ID_REQUIRED: 400,
        COMPANY_ID_REQUIRED: 400,
        COLLAB_NOT_FOUND: 404,
        COLLAB_WRONG_COMPANY: 403,
        NOT_ARCHIVED: 409,
        ARCHIVED_TOO_RECENT: 409,
        ACTIVE_CONTACTS_REMAINING: 409,
        BOOKINGS_REMAINING: 409,
      };
      const status = MAP[err.message] || 500;
      const body = { error: err.message };
      if (err.message === 'ARCHIVED_TOO_RECENT') {
        body.daysSinceArchive = err.daysSinceArchive;
        body.minRequiredDays = err.minRequiredDays;
      }
      if (err.message === 'ACTIVE_CONTACTS_REMAINING' || err.message === 'BOOKINGS_REMAINING') {
        body.count = err.count;
      }
      console.error('[HARD DELETE COLLAB ROUTE]', err.message);
      return res.status(status).json(body);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CALL SCRIPTS (Phase 2 migration localStorage → DB) ───
router.get('/:id/call-scripts', requireAuth, (req, res) => {
  try {
    const collab = db.prepare('SELECT call_scripts_json, companyId FROM collaborators WHERE id = ?').get(req.params.id);
    if (!collab) return res.status(404).json({ error: 'Collaborateur introuvable' });
    if (!req.auth.isSupra && collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès refusé' });
    res.json(JSON.parse(collab.call_scripts_json || '[]'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/call-scripts', requireAuth, (req, res) => {
  try {
    const collab = db.prepare('SELECT companyId FROM collaborators WHERE id = ?').get(req.params.id);
    if (!collab) return res.status(404).json({ error: 'Collaborateur introuvable' });
    if (!req.auth.isSupra && collab.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès refusé' });
    const scripts = JSON.stringify(req.body.scripts || []);
    db.prepare('UPDATE collaborators SET call_scripts_json = ? WHERE id = ?').run(scripts, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
