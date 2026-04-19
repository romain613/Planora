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
        "INSERT INTO contact_followers (id, contactId, collaboratorId, companyId, role, trackingMode, isActive, sourceColorKey, createdAt, updatedAt) VALUES (?,?,?,?,?,?,1,?,?,?)"
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
    "INSERT INTO contact_followers (id, contactId, collaboratorId, companyId, role, trackingMode, isActive, sourceColorKey, createdAt, updatedAt) VALUES (?,?,?,?,?,?,1,?,?,?)"
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
