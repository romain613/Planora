// ═══════════════════════════════════════════════════════════════════════
// V7 Transfer Routes — /api/transfer/*
// Inter-collaborator contact transfer management
// ═══════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { db, setActiveExecutor, addSourceFollower, updateExecutorStage, updateFollowerInteraction, getContactFollowers, getActiveExecutor } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// ─── GET /followers-batch — All active followers in company (for Kanban badges) ───
router.get('/followers-batch', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.auth.companyId;
    const rows = db.prepare(
      `SELECT cf.*, c.name as collaboratorName
       FROM contact_followers cf
       LEFT JOIN collaborators c ON c.id = cf.collaboratorId
       WHERE cf.companyId = ? AND cf.isActive = 1
       ORDER BY cf.contactId, cf.role`
    ).all(companyId);

    const map = {};
    for (const r of rows) {
      if (!map[r.contactId]) map[r.contactId] = { sources: [], executor: null, viewers: [], followers: [] };
      if (r.role === 'executor') map[r.contactId].executor = r;
      else if (r.role === 'source') map[r.contactId].sources.push(r);
      else if (r.role === 'viewer') map[r.contactId].viewers.push(r);
      else map[r.contactId].followers.push(r);
    }
    res.json(map);
  } catch (e) {
    console.error('[V7] followers-batch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /executor/:contactId — Get active executor ───
router.get('/executor/:contactId', requireAuth, enforceCompany, (req, res) => {
  try {
    const executor = getActiveExecutor(req.params.contactId, req.auth.companyId);
    res.json({ executor });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /executor/:contactId — Set active executor (transfer contact) ───
router.put('/executor/:contactId', requireAuth, enforceCompany, (req, res) => {
  try {

    const { contactId } = req.params;
    const { executorCollabId, trackingMode, sourceColorKey } = req.body;
    // Supra impersonation fallback (2026-04-19 MH fix):
    //   - User normal: req.auth.{companyId, collaboratorId} sont populates -> inchange.
    //   - Supra impersonant: req.auth.companyId est null, fallback _activeCompanyId puis body.
    const companyId = req.auth.companyId || req.auth._activeCompanyId || req.body.companyId;
    const sourceCollabId = req.auth.collaboratorId || req.body.sourceCollabId;

    if (!executorCollabId) return res.status(400).json({ error: 'executorCollabId requis' });
    if (executorCollabId === sourceCollabId) return res.status(400).json({ error: 'Impossible de transférer à soi-même' });

    // Verify contact exists and belongs to company
    const contact = db.prepare('SELECT id, assignedTo, name, pipeline_stage FROM contacts WHERE id = ? AND companyId = ?').get(contactId, companyId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    // Verify target collaborator exists in same company AND not archived (Wave D)
    const targetCollab = db.prepare('SELECT id, name, archivedAt FROM collaborators WHERE id = ? AND companyId = ?').get(executorCollabId, companyId);
    if (!targetCollab) return res.status(404).json({ error: 'Collaborateur cible introuvable' });
    if (targetCollab.archivedAt && targetCollab.archivedAt !== '') {
      return res.status(409).json({ error: 'TARGET_ARCHIVED', collaboratorId: executorCollabId });
    }

    // Set new executor
    const result = setActiveExecutor(contactId, executorCollabId, companyId, {
      deactivatedBy: sourceCollabId,
      trackingMode: trackingMode || 'active',
      sourceColorKey: sourceColorKey || ''
    });

    // Add source follower (the transferring collab)
    addSourceFollower(contactId, sourceCollabId, companyId, {
      trackingMode: 'silent',
      sourceColorKey: sourceColorKey || ''
    });

    // Update contact assignedTo to the new executor
    db.prepare('UPDATE contacts SET assignedTo = ? WHERE id = ?').run(executorCollabId, contactId);

    // Update executor stage tracking
    updateExecutorStage(contactId, companyId, contact.pipeline_stage || 'nouveau', '');

    // Log audit
    try {
      db.prepare(
        "INSERT INTO audit_logs (id, companyId, userId, action, category, details, createdAt) VALUES (?,?,?,?,?,?,?)"
      ).run(
        'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        companyId,
        sourceCollabId,
        'transfer_contact',
        'role_change',
        JSON.stringify({
          contactId, contactName: contact.name,
          from: sourceCollabId, to: executorCollabId,
          targetName: targetCollab.name,
          previousExecutorId: result.previousExecutorId
        }),
        new Date().toISOString()
      );
    } catch {}

    // Create notification for the target collaborator
    try {
      const sourceCollab = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(sourceCollabId);
      db.prepare(
        "INSERT INTO notifications (id, companyId, collaboratorId, type, title, message, data_json, read, createdAt) VALUES (?,?,?,?,?,?,?,0,?)"
      ).run(
        'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        companyId,
        executorCollabId,
        'transfer_received',
        'Nouveau contact transféré',
        `${sourceCollab?.name || 'Un collègue'} vous a transféré le contact "${contact.name}"`,
        JSON.stringify({ contactId, contactName: contact.name, fromCollabId: sourceCollabId, fromCollabName: sourceCollab?.name }),
        new Date().toISOString()
      );
    } catch {}

    res.json({
      success: true,
      previousExecutorId: result.previousExecutorId,
      newFollowerId: result.newFollowerId,
      message: `Contact "${contact.name}" transféré à ${targetCollab.name}`
    });
  } catch (e) {
    console.error('[V7] transfer error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /executor/:contactId — Soft-deactivate executor (cancel transfer) ───
router.delete('/executor/:contactId', requireAuth, enforceCompany, (req, res) => {
  try {
    const { contactId } = req.params;
    const companyId = req.auth.companyId;
    const now = new Date().toISOString();

    const result = db.prepare(
      "UPDATE contact_followers SET isActive = 0, deactivatedAt = ?, deactivatedBy = ?, updatedAt = ? WHERE contactId = ? AND companyId = ? AND role = 'executor' AND isActive = 1"
    ).run(now, req.auth.collaboratorId, now, contactId, companyId);

    res.json({ success: true, deactivated: result.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /followers/:contactId — Get all followers for a contact ───
router.get('/followers/:contactId', requireAuth, enforceCompany, (req, res) => {
  try {
    const followers = getContactFollowers(req.params.contactId, req.auth.companyId, {
      activeOnly: req.query.activeOnly !== 'false'
    });
    res.json(followers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /source/:contactId — Add source follower manually ───
router.post('/source/:contactId', requireAuth, enforceCompany, (req, res) => {
  try {
    const { sourceCollabId, trackingMode, sourceColorKey } = req.body;
    const result = addSourceFollower(
      req.params.contactId,
      sourceCollabId || req.auth.collaboratorId,
      req.auth.companyId,
      { trackingMode, sourceColorKey }
    );
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /follower/:followerId — Update follower fields ───
router.put('/follower/:followerId', requireAuth, (req, res) => {
  try {
    const { field, value } = req.body;
    if (!field) return res.status(400).json({ error: 'field requis' });
    const result = updateFollowerInteraction(req.params.followerId, field, value);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /executor-stage/:contactId — Update executor stage tracking ───
router.put('/executor-stage/:contactId', requireAuth, enforceCompany, (req, res) => {
  try {
    const { stage, label } = req.body;
    const result = updateExecutorStage(req.params.contactId, req.auth.companyId, stage, label);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
