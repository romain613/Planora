import { db } from '../db/database.js';

const _insertHistory = db.prepare(`
  INSERT INTO entity_history (id, companyId, entityType, entityId, field, oldValue, newValue, userId, userName, batchId, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Cache userName
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
 * Track a single field change on an entity.
 * Skips if old and new values are identical.
 */
export function trackChange(entityType, entityId, field, oldVal, newVal, userId, companyId, batchId = '') {
  try {
    const oldStr = String(oldVal ?? '');
    const newStr = String(newVal ?? '');
    if (oldStr === newStr) return; // No actual change
    const id = 'eh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const userName = _resolveUserName(userId);
    _insertHistory.run(
      id, companyId, entityType, entityId, field,
      oldStr, newStr, userId, userName, batchId,
      new Date().toISOString()
    );
  } catch (e) {
    console.error('[ENTITY HISTORY ERROR]', e.message);
  }
}

/**
 * Track all changed fields between an old record and new data.
 * Returns the batchId for grouping.
 * @param {string} entityType - e.g. 'contact', 'booking'
 * @param {string} entityId - entity primary key
 * @param {object} oldRecord - current DB record (before update)
 * @param {object} newData - new values being applied
 * @param {string} userId - who made the change
 * @param {string} companyId - tenant
 * @param {string[]} [fieldsToTrack] - specific fields to check (null = all keys in newData)
 */
export function trackChanges(entityType, entityId, oldRecord, newData, userId, companyId, fieldsToTrack = null) {
  const batchId = 'batch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const fields = fieldsToTrack || Object.keys(newData);
  for (const field of fields) {
    if (field === 'id' || field === 'companyId') continue; // Skip system fields
    if (!(field in newData)) continue;
    trackChange(entityType, entityId, field, oldRecord?.[field], newData[field], userId, companyId, batchId);
  }
  return batchId;
}
