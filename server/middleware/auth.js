import { db } from '../db/database.js';
import crypto from 'crypto';

// ─── TOKEN GENERATION ─────────────────────────────────────
export function createSession({ collaboratorId, companyId, role }) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
  db.prepare(
    'INSERT INTO sessions (token, collaboratorId, companyId, role, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(token, collaboratorId || null, companyId || null, role, now.toISOString(), expiresAt.toISOString());
  return token;
}

// ─── CLEANUP EXPIRED SESSIONS ─────────────────────────────
export function cleanExpiredSessions() {
  try {
    const result = db.prepare("DELETE FROM sessions WHERE expiresAt < datetime('now')").run();
    if (result.changes > 0) {
      console.log(`\x1b[33m[AUTH]\x1b[0m Cleaned ${result.changes} expired sessions`);
    }
  } catch (e) {
    console.error('[SESSION CLEANUP ERROR]', e.message);
  }
}

// ─── 1. AUTHENTICATE (global, non-blocking) ──────────────
// Reads Authorization header, looks up session, sets req.auth
export function authenticate(req, res, next) {
  req.auth = null;
  const authHeader = req.headers.authorization;
  // Support token via query string for SSE (EventSource can't send headers)
  const queryToken = req.query && req.query.token;
  if (!authHeader && !queryToken) return next();
  if (authHeader && !authHeader.startsWith('Bearer ')) return next();

  const token = authHeader ? authHeader.slice(7) : queryToken;
  if (!token || token.length < 10) return next();

  try {
    const session = db.prepare(
      "SELECT * FROM sessions WHERE token = ? AND expiresAt > datetime('now')"
    ).get(token);

    if (!session) return next();

    // Check if user is supra admin (by email in supra_admins table)
    let isSupra = session.role === 'supra';
    if (!isSupra && session.collaboratorId) {
      try {
        const collab = db.prepare('SELECT email FROM collaborators WHERE id = ?').get(session.collaboratorId);
        if (collab?.email) {
          const supra = db.prepare('SELECT email FROM supra_admins WHERE email = ?').get(collab.email);
          if (supra) isSupra = true;
        }
      } catch {}
    }

    req.auth = {
      token,
      collaboratorId: session.collaboratorId,
      companyId: session.companyId,
      role: session.role,
      isSupra,
      isAdmin: session.role === 'admin' || isSupra,
      _activeCompanyId: session.activeCompanyId || null, // for supra company switching
    };
  } catch (e) {
    console.error('[AUTH MIDDLEWARE ERROR]', e.message);
  }
  next();
}

// ─── 2. REQUIRE AUTH (any authenticated user) ─────────────
export function requireAuth(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

// ─── 3. REQUIRE SUPRA (supra admin only) ──────────────────
export function requireSupra(req, res, next) {
  if (!req.auth || !req.auth.isSupra) {
    return res.status(403).json({ error: 'Accès réservé au Supra Admin' });
  }
  next();
}

// ─── 4. REQUIRE ADMIN (supra or company admin) ───────────
export function requireAdmin(req, res, next) {
  if (!req.auth || !req.auth.isAdmin) {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

// ─── 5. ENFORCE COMPANY (company isolation) ──────────────
// Supra admin bypasses. Others must match their session companyId.
// If no companyId in request, auto-inject from session.
export function enforceCompany(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  // Supra can access any company
  if (req.auth.isSupra) return next();

  // Extract companyId from various sources
  const requestedCompanyId = req.query.companyId || req.body?.companyId || req.params?.companyId;

  if (requestedCompanyId && requestedCompanyId !== req.auth.companyId) {
    return res.status(403).json({ error: 'Accès interdit à cette entreprise' });
  }

  // Auto-inject companyId if not provided (prevent default 'c1' fallback)
  if (!requestedCompanyId) {
    if (req.method === 'GET') {
      req.query.companyId = req.auth.companyId;
    } else {
      if (!req.body) req.body = {};
      req.body.companyId = req.auth.companyId;
    }
  }
  next();
}

// ─── 6. ENFORCE RESOURCE OWNERSHIP ────────────────────────
// Centralized ownership check for GET/PUT/DELETE /:id routes
// where companyId is NOT in the URL but lives on the resource.
//
// Usage: enforceOwnership('tableName')
// or:    enforceOwnership('tableName', { idParam: 'agentId', companyCol: 'company_id' })
//
// Loads the resource by req.params[idParam], verifies its companyId
// matches req.auth.companyId, attaches it to req.resource.
export function enforceOwnership(table, opts = {}) {
  const idParam = opts.idParam || 'id';
  const companyCol = opts.companyCol || 'companyId';

  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentification requise' });
    // Supra can access any resource
    if (req.auth.isSupra) return next();

    const resourceId = req.params[idParam];
    if (!resourceId) return res.status(400).json({ error: 'ID de ressource manquant' });

    try {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(resourceId);
      if (!row) return res.status(404).json({ error: 'Ressource introuvable' });

      if (row[companyCol] !== req.auth.companyId) {
        return res.status(403).json({ error: 'Accès interdit à cette ressource' });
      }

      // Attach loaded resource to request to avoid re-fetching in handler
      req.resource = row;
      next();
    } catch (e) {
      console.error(`[OWNERSHIP CHECK] ${table}/${resourceId}:`, e.message);
      return res.status(500).json({ error: 'Erreur de vérification' });
    }
  };
}
