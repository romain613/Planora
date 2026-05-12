import { db } from '../db/database.js';

const _insertAudit = db.prepare(`
  INSERT INTO audit_logs (id, companyId, userId, userName, userRole, action, category, entityType, entityId, detail, metadata_json, ipAddress, userAgent, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Cache userName to avoid repeated DB lookups
const _nameCache = new Map();

function _resolveUserName(userId) {
  if (!userId) return '';
  if (_nameCache.has(userId)) return _nameCache.get(userId);
  try {
    const c = db.prepare('SELECT name FROM collaborators WHERE id = ?').get(userId);
    const name = c?.name || '';
    _nameCache.set(userId, name);
    return name;
  } catch { return ''; }
}

/**
 * Log an immutable audit event.
 * @param {Request} req - Express request (extracts auth, IP, UA)
 * @param {string} action - e.g. 'contact_deleted', 'login', 'role_changed'
 * @param {string} category - 'auth'|'permission'|'data'|'export'|'admin'|'system'|'security'
 * @param {string} [entityType] - e.g. 'contact', 'booking', 'collaborator'
 * @param {string} [entityId] - entity primary key
 * @param {string} [detail] - human-readable description
 * @param {object} [metadata] - extra data stored as JSON
 */
export function logAudit(req, action, category, entityType = '', entityId = '', detail = '', metadata = {}) {
  try {
    const id = 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const userId = req?.auth?.collaboratorId || '';
    // P2-D3 (2026-04-20) : fallback supra impersonation + body/query
    // Identique au pattern V7 transfer (routes/transfer.js:58) éprouvé depuis 2026-04-19.
    // Évite les audit_logs avec companyId='' pour les actions supra ciblées.
    const companyId = req?.auth?.companyId
      || req?.auth?._activeCompanyId
      || req?.body?.companyId
      || req?.query?.companyId
      || '';
    const userRole = req?.auth?.isSupra ? 'supra' : (req?.auth?.role || '');
    const userName = req?.auth?.isSupra ? 'Supra Admin' : _resolveUserName(userId);
    const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || '';
    const userAgent = (req?.headers?.['user-agent'] || '').slice(0, 256);

    _insertAudit.run(
      id, companyId, userId, userName, userRole,
      action, category, entityType, entityId,
      detail, JSON.stringify(metadata),
      ipAddress, userAgent,
      new Date().toISOString()
    );
  } catch (e) {
    console.error('[AUDIT LOG ERROR]', e.message);
  }
}
