import { db } from '../db/database.js';

// ─── In-memory cache (60s TTL) ───
const _permCache = new Map();
const CACHE_TTL = 60_000;

/**
 * Canonical list of all permissions in the system.
 * Used for UI display and validation.
 */
export const ALL_PERMISSIONS = [
  // Contacts
  'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.delete', 'contacts.export', 'contacts.import',
  // Bookings
  'bookings.view', 'bookings.create', 'bookings.edit', 'bookings.delete',
  // Calendars
  'calendars.view', 'calendars.create', 'calendars.edit',
  // Pipeline
  'pipeline.view', 'pipeline.manage',
  // Leads
  'leads.view', 'leads.manage', 'leads.dispatch',
  // SMS
  'sms.send', 'sms.view_history',
  // Calls
  'calls.make', 'calls.view_recordings',
  // Chat
  'chat.send', 'chat.view',
  // Reports
  'reports.view', 'reports.export',
  // Team
  'team.view', 'team.manage',
  // Settings
  'settings.view', 'settings.manage',
  // AI
  'ai_copilot.use',
];

/**
 * Default permissions for legacy 'member' role.
 * Maps existing per-feature toggles to permission keys.
 */
function getDefaultMemberPermissions(collaboratorId) {
  const perms = new Set([
    'contacts.view', 'contacts.create', 'contacts.edit',
    'bookings.view', 'bookings.create', 'bookings.edit', 'bookings.delete',
    'calendars.view',
    'pipeline.view', 'pipeline.manage',
    'leads.view',
    'reports.view',
    'calls.make',
    'sms.view_history',
  ]);

  // Map legacy toggles
  try {
    const collab = db.prepare('SELECT can_delete_contacts, chat_enabled, sms_enabled, ai_copilot_enabled, ai_copilot_level, secure_ia_phone FROM collaborators WHERE id = ?').get(collaboratorId);
    if (collab?.can_delete_contacts) perms.add('contacts.delete');
    if (collab?.chat_enabled) { perms.add('chat.send'); perms.add('chat.view'); }
    if (collab?.sms_enabled) perms.add('sms.send');
    if (collab?.ai_copilot_enabled || (collab?.ai_copilot_level && collab.ai_copilot_level !== 'off')) perms.add('ai_copilot.use');
  } catch {}

  return perms;
}

/**
 * Resolve effective permissions for a collaborator.
 * Returns a Set of permission strings. '*' means all permissions (admin).
 */
export function getEffectivePermissions(collaboratorId, companyId) {
  if (!collaboratorId) return new Set();

  try {
    const collab = db.prepare('SELECT role, roleId FROM collaborators WHERE id = ?').get(collaboratorId);
    if (!collab) return new Set();

    // Legacy admin = all permissions (wildcard)
    if (collab.role === 'admin') return new Set(['*']);

    // Custom role via roleId
    if (collab.roleId) {
      const cacheKey = collab.roleId;
      const cached = _permCache.get(cacheKey);
      if (cached && (Date.now() - cached.ts) < CACHE_TTL) return cached.perms;

      const role = db.prepare('SELECT slug, isSystem FROM roles WHERE id = ?').get(collab.roleId);
      if (role) {
        // System admin role = all permissions
        if (role.slug === 'admin' && role.isSystem) return new Set(['*']);

        const rows = db.prepare('SELECT permission FROM role_permissions WHERE roleId = ? AND granted = 1').all(collab.roleId);
        const perms = new Set(rows.map(r => r.permission));
        _permCache.set(cacheKey, { perms, ts: Date.now() });
        return perms;
      }
    }

    // Fallback: legacy member with per-feature toggles
    return getDefaultMemberPermissions(collaboratorId);
  } catch (e) {
    console.error('[PERMISSIONS ERROR]', e.message);
    return new Set();
  }
}

/**
 * Middleware factory: requirePermission('contacts.delete', 'contacts.view')
 * Checks that the authenticated user has ALL specified permissions.
 * Supra admin bypasses all checks. Legacy admin bypasses all checks.
 */
export function requirePermission(...requiredPerms) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentification requise' });

    // Supra bypasses everything
    if (req.auth.isSupra) return next();

    // Resolve effective permissions
    const effective = getEffectivePermissions(req.auth.collaboratorId, req.auth.companyId);

    // Wildcard = admin, has everything
    if (effective.has('*')) return next();

    // Check each required permission
    for (const perm of requiredPerms) {
      if (!effective.has(perm)) {
        return res.status(403).json({
          error: 'Permission insuffisante',
          required: perm,
        });
      }
    }
    next();
  };
}

/**
 * Invalidate cache for a specific role (call after role permissions change).
 */
export function invalidatePermCache(roleId) {
  if (roleId) _permCache.delete(roleId);
}
