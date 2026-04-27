// Phase R2 (V1.10.0) — Routes REST pour la restauration de snapshots collaborateur.
//
// Périmètre :
//   GET    /api/collab-snapshots/list?collabId=X      → liste les snapshots du collab
//   GET    /api/collab-snapshots/:id/preview          → preview du restore (counts, warnings)
//   POST   /api/collab-snapshots/:id/restore          → applique restore + crée pre-restore
//   POST   /api/collab-snapshots/manual               → crée un snapshot manuel
//
// Permissions :
//   - self : collab → accès uniquement à SES snapshots (companyId + collabId match session)
//   - admin (role=admin ou isSupra) : accès tous snapshots de la company (impersonation existante)
//
// UX-orienté : ces routes parlent de "restaurer / annuler une erreur / revenir à une version précédente".
// Termes techniques (snapshot, payload, fingerprint) restent dans la couche backend pour debug/audit uniquement.

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import {
  buildCollabSnapshot,
  computeCollabFingerprint,
  writeSnapshot,
  previewRestore,
  restoreSnapshot,
} from '../services/collabSnapshots/index.js';

const router = Router();

// ─── Helper : check accès self-or-admin pour un collabId/companyId donné ─────
function canAccessCollab(req, collabId, companyId) {
  if (!req.auth) return false;
  if (req.auth.isAdmin || req.auth.isSupra) {
    // Admin : doit être dans la même company (ou supra avec activeCompanyId)
    const adminCompany = req.auth.companyId || req.auth._activeCompanyId;
    return !companyId || !adminCompany || adminCompany === companyId;
  }
  // Self : collabId + companyId doivent matcher la session
  return (
    req.auth.collaboratorId === collabId &&
    (!companyId || req.auth.companyId === companyId)
  );
}

// ─── GET /list?collabId=X ──────────────────────────────────────────────────
// Liste les snapshots du collab (récents d'abord). Inclut counts + size pour preview rapide UI.
router.get('/list', requireAuth, (req, res) => {
  try {
    const collabId = String(req.query.collabId || req.auth.collaboratorId || '');
    if (!collabId) {
      return res.status(400).json({ error: 'collabId requis' });
    }

    // Détermine la company : pour self, vient de la session ; pour admin, de la query ou session.
    let companyId = req.auth.isAdmin
      ? String(req.query.companyId || req.auth._activeCompanyId || req.auth.companyId || '')
      : req.auth.companyId;

    if (!canAccessCollab(req, collabId, companyId)) {
      return res.status(403).json({ error: 'Accès refusé à ce collaborateur' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    const rows = db
      .prepare(
        `SELECT id, companyId, collabId, createdAt, kind, trigger,
                payloadSizeBytes, rowCount, fingerprint, summaryJson, createdBy, expiresAt
         FROM collab_snapshots
         WHERE companyId = ? AND collabId = ?
         ORDER BY createdAt DESC LIMIT ?`
      )
      .all(companyId, collabId, limit);

    // Parse summaryJson pour la preview UI (tolérant)
    const snapshots = rows.map((r) => {
      let summary = {};
      try { summary = JSON.parse(r.summaryJson || '{}'); } catch {}
      return {
        id: r.id,
        companyId: r.companyId,
        collabId: r.collabId,
        createdAt: r.createdAt, // unix ms
        createdAtIso: new Date(r.createdAt).toISOString(),
        kind: r.kind, // 'auto' / 'manual' / 'pre-restore'
        trigger: r.trigger,
        rowCount: r.rowCount,
        sizeBytes: r.payloadSizeBytes,
        fingerprint: r.fingerprint,
        summary, // counts par table
        createdBy: r.createdBy,
        expiresAt: r.expiresAt,
      };
    });

    res.json({ collabId, companyId, count: snapshots.length, snapshots });
  } catch (err) {
    console.error('[COLLAB-SNAPSHOTS LIST ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/preview ──────────────────────────────────────────────────────
// Preview du restore : counts par table + warnings, sans appliquer.
router.get('/:id/preview', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'snapshotId invalide' });
    }

    // Lookup pour vérifier accès AVANT de décompresser le payload
    const snap = db
      .prepare('SELECT companyId, collabId FROM collab_snapshots WHERE id = ?')
      .get(id);
    if (!snap) return res.status(404).json({ error: 'Snapshot introuvable' });

    if (!canAccessCollab(req, snap.collabId, snap.companyId)) {
      return res.status(403).json({ error: 'Accès refusé à ce snapshot' });
    }

    const preview = previewRestore(id);
    res.json(preview);
  } catch (err) {
    console.error('[COLLAB-SNAPSHOTS PREVIEW ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/restore ─────────────────────────────────────────────────────
// Applique le restore. Crée un snapshot pre-restore (reversibility 7j) avant.
// Body attendu : { confirmed: true, reason?: string }
router.post('/:id/restore', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'snapshotId invalide' });
    }

    const body = req.body || {};
    if (body.confirmed !== true) {
      return res.status(400).json({
        error: 'Confirmation requise. Body attendu : { confirmed: true, reason?: string }',
      });
    }

    const snap = db
      .prepare('SELECT companyId, collabId, kind FROM collab_snapshots WHERE id = ?')
      .get(id);
    if (!snap) return res.status(404).json({ error: 'Snapshot introuvable' });

    if (!canAccessCollab(req, snap.collabId, snap.companyId)) {
      return res.status(403).json({ error: 'Accès refusé à ce snapshot' });
    }

    const actorType = req.auth.isAdmin || req.auth.isSupra ? 'admin' : 'self';
    const actorId = req.auth.collaboratorId || (req.auth.isSupra ? `supra:${req.auth.token.slice(0, 8)}` : 'unknown');
    const actorName =
      req.auth.collaboratorId
        ? db.prepare('SELECT name FROM collaborators WHERE id = ?').get(req.auth.collaboratorId)?.name || actorId
        : actorId;

    const result = restoreSnapshot({
      snapshotId: id,
      actorType,
      actorId,
      actorName,
      reason: String(body.reason || '').slice(0, 200),
      ipAddress: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().slice(0, 64),
      userAgent: (req.headers['user-agent'] || '').toString().slice(0, 256),
    });

    res.json(result);
  } catch (err) {
    console.error('[COLLAB-SNAPSHOTS RESTORE ERROR]', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:id ───────────────────────────────────────────────────────────
// V1.10.1+ — Suppression d'une sauvegarde par son propriétaire (ou admin).
// Audit + DELETE row + suppression best-effort du fichier .gz.
// Préserve les sauvegardes 'pre-restore' non expirées (utiles pour annuler une restauration).
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'snapshotId invalide' });
    }

    const snap = db
      .prepare('SELECT id, companyId, collabId, kind, payloadPath, expiresAt FROM collab_snapshots WHERE id = ?')
      .get(id);
    if (!snap) return res.status(404).json({ error: 'Sauvegarde introuvable' });

    if (!canAccessCollab(req, snap.collabId, snap.companyId)) {
      return res.status(403).json({ error: 'Accès refusé à cette sauvegarde' });
    }

    // Garde-fou : pre-restore non expirée = en cours d'utilisation pour annulation, refuser
    if (snap.kind === 'pre-restore' && snap.expiresAt && snap.expiresAt > Date.now()) {
      return res.status(409).json({
        error: 'Cette sauvegarde "Pré-restauration" est protégée pour vous permettre d\'annuler une restauration récente. Elle expirera automatiquement.',
      });
    }

    // DELETE row (la table peut être audit_logs-tracée selon la politique métier — ici on track manuellement)
    db.prepare('DELETE FROM collab_snapshots WHERE id = ?').run(id);

    // Suppression fichier .gz best-effort (ne fait pas échouer la requête si manquant)
    try {
      const SNAPSHOTS_DIR = process.env.SNAPSHOTS_DIR || '/var/www/planora-data/snapshots';
      const fullPath = path.isAbsolute(snap.payloadPath)
        ? snap.payloadPath
        : path.join(SNAPSHOTS_DIR, snap.payloadPath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (e) {
      console.warn('[COLLAB-SNAPSHOTS DELETE] file unlink warning:', e.message);
    }

    // Audit (immutable)
    try {
      const auditId = 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      const actorId = req.auth.collaboratorId || `supra:${(req.auth.token||'').slice(0, 8)}`;
      const actorRole = req.auth.isAdmin || req.auth.isSupra ? 'admin' : 'self';
      db.prepare(
        `INSERT INTO audit_logs (
          id, companyId, userId, userName, userRole,
          action, category, entityType, entityId,
          detail, metadata_json, ipAddress, userAgent, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        auditId,
        snap.companyId,
        actorId,
        actorRole + ':' + actorId,
        actorRole,
        'collab_snapshot_deleted',
        'data-recovery',
        'collab_snapshot',
        String(id),
        `Suppression sauvegarde #${id} (${snap.kind}) pour collab ${snap.collabId}`,
        JSON.stringify({ snapshotId: id, snapshotKind: snap.kind, payloadPath: snap.payloadPath }),
        (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().slice(0, 64),
        (req.headers['user-agent'] || '').toString().slice(0, 256),
        new Date().toISOString()
      );
    } catch (e) {
      console.warn('[COLLAB-SNAPSHOTS DELETE] audit warning:', e.message);
    }

    res.json({ success: true, snapshotId: id });
  } catch (err) {
    console.error('[COLLAB-SNAPSHOTS DELETE ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /manual ──────────────────────────────────────────────────────────
// Crée un snapshot manuel à la demande (avant action sensible : import CSV, bulk delete, etc.).
// Body attendu : { collabId?, reason?: string }
router.post('/manual', requireAuth, (req, res) => {
  try {
    const body = req.body || {};
    const collabId = String(body.collabId || req.auth.collaboratorId || '');
    if (!collabId) {
      return res.status(400).json({ error: 'collabId requis' });
    }

    let companyId = req.auth.isAdmin
      ? String(body.companyId || req.auth._activeCompanyId || req.auth.companyId || '')
      : req.auth.companyId;

    if (!canAccessCollab(req, collabId, companyId)) {
      return res.status(403).json({ error: 'Accès refusé à ce collaborateur' });
    }

    if (!companyId) {
      return res.status(400).json({ error: 'companyId introuvable pour cette session' });
    }

    const actorType = req.auth.isAdmin || req.auth.isSupra ? 'admin' : 'self';
    const actorId = req.auth.collaboratorId || `supra:${(req.auth.token || '').slice(0, 8)}`;

    const t0 = Date.now();
    const payload = buildCollabSnapshot({ companyId, collabId });
    const fingerprint = computeCollabFingerprint({ companyId, collabId });

    const write = writeSnapshot({
      payload,
      fingerprint,
      kind: 'manual',
      trigger: 'user-manual',
      createdBy: `${actorType}:${actorId}`,
      expiresAt: null,
    });

    // Reset dirty flag (snapshot manuel = état aligné)
    db.prepare('UPDATE collaborators SET dirtySinceSnapshotAt = NULL WHERE id = ?').run(collabId);

    res.json({
      success: true,
      snapshotId: write.id,
      payloadSizeBytes: write.payloadSizeBytes,
      rowCount: payload.meta.totalRows,
      fingerprint,
      reason: String(body.reason || '').slice(0, 200),
      elapsedMs: Date.now() - t0,
    });
  } catch (err) {
    console.error('[COLLAB-SNAPSHOTS MANUAL ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
