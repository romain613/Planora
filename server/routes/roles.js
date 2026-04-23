import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, requireAdmin, enforceCompany } from '../middleware/auth.js';
import { ALL_PERMISSIONS, invalidatePermCache } from '../middleware/permissions.js';
import { logAudit } from '../helpers/audit.js';

const router = Router();

// ═══ GET /api/roles — List roles for a company ═══
router.get('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const { companyId } = req.query;
    const roles = db.prepare('SELECT * FROM roles WHERE companyId = ? ORDER BY isSystem DESC, name ASC').all(companyId);

    // Attach permissions to each role
    const result = roles.map(role => {
      const perms = db.prepare('SELECT permission, granted FROM role_permissions WHERE roleId = ?').all(role.id);
      return { ...role, permissions: perms };
    });

    res.json({ roles: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ GET /api/roles/permissions — List all available permissions ═══
// Admin only — members n'ont pas besoin de voir le catalogue complet
router.get('/permissions', requireAuth, requireAdmin, (req, res) => {
  res.json({ permissions: ALL_PERMISSIONS });
});

// ═══ POST /api/roles — Create a custom role ═══
router.post('/', requireAuth, requireAdmin, enforceCompany, (req, res) => {
  try {
    const { companyId, name, description, permissions } = req.body;
    if (!companyId || !name?.trim()) return res.status(400).json({ error: 'companyId et name requis' });

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const now = new Date().toISOString();
    const id = 'role_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    // Check slug uniqueness within company
    const existing = db.prepare('SELECT id FROM roles WHERE companyId = ? AND slug = ?').get(companyId, slug);
    if (existing) return res.status(409).json({ error: 'Un role avec ce nom existe deja' });

    db.prepare('INSERT INTO roles (id, companyId, name, slug, description, isSystem, createdAt, updatedAt) VALUES (?,?,?,?,?,0,?,?)').run(
      id, companyId, name.trim(), slug, description || '', now, now
    );

    // Insert permissions if provided
    if (Array.isArray(permissions)) {
      for (const perm of permissions) {
        if (ALL_PERMISSIONS.includes(perm)) {
          db.prepare('INSERT OR IGNORE INTO role_permissions (id, roleId, permission, granted) VALUES (?,?,?,1)').run(
            'rp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), id, perm
          );
        }
      }
    }

    logAudit(req, 'role_created', 'permission', 'role', id, 'Role cree: ' + name.trim(), { slug, permissions });

    res.json({ success: true, id, slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ PUT /api/roles/:id — Update a role (name, description, permissions) ═══
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role introuvable' });

    // Company isolation (non-supra)
    if (!req.auth.isSupra && role.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'Acces interdit' });
    }

    // System roles: name/slug cannot be changed
    const { name, description, permissions } = req.body;
    const now = new Date().toISOString();

    if (!role.isSystem && name?.trim()) {
      db.prepare('UPDATE roles SET name = ?, description = ?, updatedAt = ? WHERE id = ?').run(
        name.trim(), description || role.description, now, role.id
      );
    } else if (description !== undefined) {
      db.prepare('UPDATE roles SET description = ?, updatedAt = ? WHERE id = ?').run(
        description, now, role.id
      );
    }

    // Update permissions (replace all)
    if (Array.isArray(permissions)) {
      // Delete existing
      db.prepare('DELETE FROM role_permissions WHERE roleId = ?').run(role.id);
      // Insert new
      for (const perm of permissions) {
        if (ALL_PERMISSIONS.includes(perm)) {
          db.prepare('INSERT INTO role_permissions (id, roleId, permission, granted) VALUES (?,?,?,1)').run(
            'rp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), role.id, perm
          );
        }
      }
      // Invalidate cache
      invalidatePermCache(role.id);
    }

    logAudit(req, 'role_updated', 'permission', 'role', role.id, 'Role modifie: ' + (name?.trim() || role.name), { permissions });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ DELETE /api/roles/:id — Delete a custom role (not system roles) ═══
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role introuvable' });

    // Company isolation
    if (!req.auth.isSupra && role.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'Acces interdit' });
    }

    // Cannot delete system roles
    if (role.isSystem) return res.status(403).json({ error: 'Impossible de supprimer un role systeme' });

    // Check if any collaborator uses this role
    const usedBy = db.prepare('SELECT COUNT(*) as cnt FROM collaborators WHERE roleId = ?').get(role.id);
    if (usedBy.cnt > 0) {
      return res.status(409).json({ error: usedBy.cnt + ' collaborateur(s) utilisent ce role. Reassignez-les avant de supprimer.' });
    }

    // Delete permissions then role
    db.prepare('DELETE FROM role_permissions WHERE roleId = ?').run(role.id);
    db.prepare('DELETE FROM roles WHERE id = ?').run(role.id);
    invalidatePermCache(role.id);

    logAudit(req, 'role_deleted', 'permission', 'role', role.id, 'Role supprime: ' + role.name);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ GET /api/roles/:id/permissions — Get permissions for a role ═══
router.get('/:id/permissions', requireAuth, (req, res) => {
  try {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role introuvable' });

    // Company isolation
    if (!req.auth.isSupra && role.companyId !== req.auth.companyId) {
      return res.status(403).json({ error: 'Acces interdit' });
    }

    const perms = db.prepare('SELECT permission, granted FROM role_permissions WHERE roleId = ?').all(role.id);
    res.json({ role: role.name, permissions: perms, allAvailable: ALL_PERMISSIONS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
