import { Router } from 'express';
import { db, insert } from '../db/database.js';
import { google } from 'googleapis';
import bcrypt from 'bcryptjs';
import { createSession } from '../middleware/auth.js';
import { logAudit } from '../helpers/audit.js';

const router = Router();

// ═════════════════════════════════════════════════════════
// Rate limiting — in-memory, per IP, for auth endpoints
// ═════════════════════════════════════════════════════════
const _authAttempts = new Map(); // key: IP -> { count, firstAt, blockedUntil }
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10; // max 10 attempts per window
const RATE_LIMIT_BLOCK = 5 * 60 * 1000; // block for 5 min after exceeding

// Cleanup old entries every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of _authAttempts) {
    if (now - data.firstAt > RATE_LIMIT_WINDOW * 2) _authAttempts.delete(ip);
  }
}, 30 * 60 * 1000);

function checkRateLimit(req, res) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  let entry = _authAttempts.get(ip);

  if (!entry || now - entry.firstAt > RATE_LIMIT_WINDOW) {
    entry = { count: 1, firstAt: now, blockedUntil: 0 };
    _authAttempts.set(ip, entry);
    return false; // not blocked
  }

  // Currently blocked?
  if (entry.blockedUntil && now < entry.blockedUntil) {
    const waitSec = Math.ceil((entry.blockedUntil - now) / 1000);
    res.status(429).json({ error: `Trop de tentatives. Réessayez dans ${waitSec}s.` });
    return true; // blocked
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    entry.blockedUntil = now + RATE_LIMIT_BLOCK;
    logAudit(req, 'rate_limited', 'security', '', '', `Auth rate limit exceeded: IP ${ip} (${entry.count} attempts)`);
    res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 5 minutes.' });
    return true; // blocked
  }

  return false; // not blocked
}

// Reset rate limit on successful login
function resetRateLimit(req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  _authAttempts.delete(ip);
}

// GET /api/auth/config — Public config (client IDs for Google Sign-In, Maps, etc.)
router.get('/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null,
  });
});

// POST /api/auth/supra-login — Supra Admin authentication (server-side)
router.post('/supra-login', async (req, res) => {
  try {
    if (checkRateLimit(req, res)) return;
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

    const admin = db.prepare('SELECT * FROM supra_admins WHERE email = ?').get(email.trim().toLowerCase());
    if (!admin) return res.status(401).json({ error: 'Identifiants invalides' });

    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) {
      logAudit(req, 'login_failed', 'auth', '', '', 'Supra login failed: ' + email);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    resetRateLimit(req);
    const token = createSession({ collaboratorId: null, companyId: null, role: 'supra' });

    logAudit(req, 'login', 'auth', 'supra_admin', '', 'Supra Admin login: ' + email);
    console.log(`\x1b[35m[AUTH]\x1b[0m Supra Admin logged in: ${email}`);
    res.json({ success: true, token, supraAdmin: true });
  } catch (err) {
    console.error('[SUPRA LOGIN ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/logout — Destroy session
router.post('/logout', (req, res) => {
  try {
    logAudit(req, 'logout', 'auth', '', '', 'Deconnexion');
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/google — Sign in with Google ID token
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Token manquant' });

    // Verify token with Google
    const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID);
    const ticket = await oauth2.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name || email.split('@')[0];

    // Look up existing collaborator (case-insensitive)
    const collab = db.prepare('SELECT * FROM collaborators WHERE LOWER(email) = LOWER(?)').get(email);
    if (collab) {
      const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(collab.companyId);
      const token = createSession({ collaboratorId: collab.id, companyId: collab.companyId, role: collab.role });
      return res.json({
        success: true,
        token,
        collaborator: { id: collab.id, name: collab.name, email: collab.email, role: collab.role, companyId: collab.companyId },
        company: company ? { id: company.id, name: company.name, slug: company.slug, plan: company.plan } : null,
      });
    }

    // No account — auto-create company + admin
    const companyId = 'c' + Date.now();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    insert('companies', {
      id: companyId, name, slug, domain: '', plan: 'free', contactEmail: email,
      active: 1, createdAt: new Date().toISOString().slice(0, 10),
      collaboratorsCount: 1, calendarsCount: 1, bookingsCount: 0,
    });

    const collabId = 'u' + Date.now();
    insert('collaborators', {
      id: collabId, companyId, name, email, role: 'admin', priority: 1,
      color: '#2563EB', code: null, password: null, phone: '', maxWeek: 20, maxMonth: 80, slackId: '',
    });

    const calId = 'cal' + Date.now();
    insert('calendars', {
      id: calId, companyId, name: 'Agenda principal', slug: 'agenda-principal',
      duration: 30, color: '#2563EB', collaborators_json: JSON.stringify([collabId]),
    });

    // Create default availability (Mon-Fri 9-12 + 14-18)
    const defAvail = {};
    for (let d = 0; d < 5; d++) defAvail[d] = { active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] };
    defAvail[5] = { active: false, slots: [] };
    defAvail[6] = { active: false, slots: [] };
    db.prepare('INSERT OR REPLACE INTO availabilities (collaboratorId, schedule_json) VALUES (?, ?)').run(collabId, JSON.stringify(defAvail));

    const token = createSession({ collaboratorId: collabId, companyId, role: 'admin' });
    console.log(`\x1b[32m[GOOGLE AUTH]\x1b[0m New account created via Google: ${email}`);
    res.json({
      success: true, newAccount: true, token,
      collaborator: { id: collabId, name, email, role: 'admin', companyId },
      company: { id: companyId, name, slug, plan: 'free' },
    });
  } catch (err) {
    console.error('[GOOGLE AUTH ERROR]', err.message);
    res.status(401).json({ error: 'Erreur de vérification Google : ' + err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    if (checkRateLimit(req, res)) return;
    const { email, password, code } = req.body;

    let collab;
    if (code) {
      collab = db.prepare('SELECT * FROM collaborators WHERE code = ?').get(code);
    } else if (email && password) {
      collab = db.prepare('SELECT * FROM collaborators WHERE LOWER(email) = LOWER(?)').get(email.trim());
      if (!collab) {
        // User not found — reject
        collab = null;
      } else if (!collab.password) {
        // User exists but has no password (Google OAuth account, or never set)
        // NEVER allow login with arbitrary password — reject
        logAudit(req, 'login_failed', 'auth', '', '', 'Login failed (no password set): ' + email);
        collab = null;
      } else {
        // Check if password is hashed (bcrypt hashes start with $2)
        const isHashed = collab.password.startsWith('$2');
        const match = isHashed
          ? await bcrypt.compare(password, collab.password)
          : (password === collab.password); // fallback for legacy plain text
        if (!match) {
          collab = null;
        } else if (!isHashed) {
          // Auto-upgrade: hash plain text passwords on successful login
          const hashed = await bcrypt.hash(password, 10);
          db.prepare('UPDATE collaborators SET password = ? WHERE id = ?').run(hashed, collab.id);
        }
      }
    }

    if (!collab) {
      logAudit(req, 'login_failed', 'auth', '', '', 'Login failed: ' + (email || 'code:' + code));
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    resetRateLimit(req);
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(collab.companyId);

    // Block login if company is pending or rejected
    if (company && company.status === 'pending') {
      return res.status(403).json({ error: 'Votre compte est en cours de validation. Vous recevrez un email dès que votre accès sera activé.', _pending: true });
    }
    if (company && company.status === 'rejected') {
      return res.status(403).json({ error: 'Votre demande d\'inscription a été refusée.', _rejected: true, reason: company.rejectedReason || '' });
    }

    const token = createSession({ collaboratorId: collab.id, companyId: collab.companyId, role: collab.role });

    logAudit({ auth: { collaboratorId: collab.id, companyId: collab.companyId, role: collab.role }, headers: req.headers, ip: req.ip }, 'login', 'auth', 'collaborator', collab.id, 'Login: ' + collab.name + ' (' + collab.email + ')');

    res.json({
      success: true,
      token,
      collaborator: {
        id: collab.id,
        name: collab.name,
        email: collab.email,
        role: collab.role,
        companyId: collab.companyId,
      },
      company: company ? { id: company.id, name: company.name, slug: company.slug, plan: company.plan } : null,
    });
  } catch (err) {
    console.error('[AUTH ERROR]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/register — Self-service signup
router.post('/register', async (req, res) => {
  try {
    if (checkRateLimit(req, res)) return;
    const { email, password, companyName } = req.body;
    if (!email || !password || !companyName) {
      return res.status(400).json({ error: 'Email, mot de passe et nom d\'entreprise requis' });
    }
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Format d\'email invalide' });
    }
    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    // Check if email already exists (case-insensitive)
    const existing = db.prepare('SELECT id FROM collaborators WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (existing) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }

    // Create company
    const companyId = 'c' + Date.now();
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    insert('companies', {
      id: companyId,
      name: companyName,
      slug,
      domain: '',
      plan: 'free',
      contactEmail: email,
      active: 1,
      createdAt: new Date().toISOString().slice(0, 10),
      collaboratorsCount: 1,
      calendarsCount: 0,
      bookingsCount: 0,
    });

    // Create first collaborator as admin with hashed password
    const collabId = 'u' + Date.now();
    const hashedPassword = await bcrypt.hash(password, 10);
    insert('collaborators', {
      id: collabId,
      companyId,
      name: companyName,
      email,
      role: 'admin',
      priority: 1,
      color: '#2563EB',
      code: null,
      password: hashedPassword,
      phone: '',
      maxWeek: 20,
      maxMonth: 80,
      slackId: '',
    });

    // Create default calendar
    const calId = 'cal' + Date.now();
    insert('calendars', {
      id: calId,
      companyId,
      name: 'Agenda principal',
      slug: 'agenda-principal',
      duration: 30,
      color: '#2563EB',
      collaborators_json: JSON.stringify([collabId]),
    });

    // Create default availability (Mon-Fri 9-12 + 14-18)
    const defAvail = {};
    for (let d = 0; d < 5; d++) defAvail[d] = { active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] };
    defAvail[5] = { active: false, slots: [] };
    defAvail[6] = { active: false, slots: [] };
    db.prepare('INSERT OR REPLACE INTO availabilities (collaboratorId, schedule_json) VALUES (?, ?)').run(collabId, JSON.stringify(defAvail));

    // Update company calendar count
    db.prepare('UPDATE companies SET calendarsCount = 1 WHERE id = ?').run(companyId);

    const token = createSession({ collaboratorId: collabId, companyId, role: 'admin' });

    res.json({
      success: true,
      token,
      collaborator: { id: collabId, name: companyName, email, role: 'admin', companyId },
      company: { id: companyId, name: companyName, slug, plan: 'free' },
    });
  } catch (err) {
    console.error('[REGISTER ERROR]', err);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

// ═════════════════════════════════════════════════════════
// GET /api/auth/me — Validate session & return context
// Source of truth for who the user is and what company is active
// ═════════════════════════════════════════════════════════
router.get('/me', (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'Session invalide ou expirée' });

  const { collaboratorId, companyId, role, isSupra, _activeCompanyId } = req.auth;

  // Resolve allowed companies
  let allowedCompanyIds = [];
  let activeCompanyId = null;

  if (isSupra) {
    // Supra can access all companies
    const allCompanies = db.prepare('SELECT id, name, slug, plan FROM companies WHERE active = 1').all();
    allowedCompanyIds = allCompanies.map(c => c.id);
    // Active company: session > first available
    activeCompanyId = _activeCompanyId || (allCompanies.length === 1 ? allCompanies[0].id : null);

    return res.json({
      authenticated: true,
      role: 'supra',
      isSupra: true,
      collaboratorId: collaboratorId || null,
      activeCompanyId,
      allowedCompanies: allCompanies,
      _needsCompanySelection: !activeCompanyId && allCompanies.length > 1,
    });
  }

  // Regular user — locked to their company
  if (!companyId) return res.status(403).json({ error: 'Aucune entreprise associée' });
  const company = db.prepare('SELECT id, name, slug, plan FROM companies WHERE id = ?').get(companyId);
  if (!company) return res.status(404).json({ error: 'Entreprise introuvable' });

  let collab = null;
  if (collaboratorId) {
    collab = db.prepare('SELECT id, name, email, role, phone FROM collaborators WHERE id = ?').get(collaboratorId);
  }

  return res.json({
    authenticated: true,
    role: role || 'member',
    isSupra: false,
    collaboratorId,
    activeCompanyId: companyId,
    allowedCompanies: [company],
    collaborator: collab,
  });
});

// ═════════════════════════════════════════════════════════
// POST /api/auth/switch-company — Supra admin switches active company
// Validates access, updates session, returns confirmation
// ═════════════════════════════════════════════════════════
router.post('/switch-company', (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'Authentification requise' });
  if (!req.auth.isSupra) {
    logAudit(req, 'company_switch_denied', 'security', 'company', req.body?.companyId || '',
      'Non-supra user attempted company switch');
    return res.status(403).json({ error: 'Seul un Supra Admin peut changer d\'entreprise active' });
  }

  const { companyId } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId requis' });

  // Validate company exists
  const company = db.prepare('SELECT id, name, slug, plan FROM companies WHERE id = ?').get(companyId);
  if (!company) {
    logAudit(req, 'company_switch_invalid', 'security', 'company', companyId,
      'Supra attempted switch to non-existent company');
    return res.status(404).json({ error: 'Entreprise introuvable' });
  }

  // Update session in DB — persist active company choice
  try {
    db.prepare('UPDATE sessions SET activeCompanyId = ? WHERE token = ?').run(companyId, req.auth.token);
  } catch (e) {
    console.error('[SWITCH COMPANY] Failed to update session:', e.message);
  }

  logAudit(req, 'company_switched', 'admin', 'company', companyId,
    `Supra switched to: ${company.name} (${companyId})`);

  console.log(`\x1b[35m[AUTH]\x1b[0m Supra switched to company: ${company.name} (${companyId})`);

  res.json({ success: true, company });
});

// ═════════════════════════════════════════════════════════
// Password validation — shared rules (8+ chars, 1 uppercase, 1 digit)
// ═════════════════════════════════════════════════════════
function validatePassword(pw) {
  if (!pw || pw.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères';
  if (!/[A-Z]/.test(pw)) return 'Le mot de passe doit contenir au moins 1 majuscule';
  if (!/[0-9]/.test(pw)) return 'Le mot de passe doit contenir au moins 1 chiffre';
  return null; // valid
}

// ═════════════════════════════════════════════════════════
// Rate limiting — registration-specific (5/hour/IP)
// ═════════════════════════════════════════════════════════
const _registerAttempts = new Map();
function checkRegisterRateLimit(req, res) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  let entry = _registerAttempts.get(ip);
  if (!entry || now - entry.firstAt > 3600000) { entry = { count: 1, firstAt: now }; _registerAttempts.set(ip, entry); return false; }
  entry.count++;
  if (entry.count > 5) { res.status(429).json({ error: 'Trop de demandes d\'inscription. Réessayez dans 1 heure.' }); return true; }
  return false;
}
setInterval(() => { const now = Date.now(); for (const [ip, d] of _registerAttempts) { if (now - d.firstAt > 7200000) _registerAttempts.delete(ip); } }, 30 * 60 * 1000);

// ═════════════════════════════════════════════════════════
// POST /api/auth/register-company — Full company registration (pending validation)
// ═════════════════════════════════════════════════════════
router.post('/register-company', async (req, res) => {
  try {
    if (checkRegisterRateLimit(req, res)) return;

    const { companyName, siret, businessId, companyPhone, companyEmail, address, city, zipCode, country,
            sector, website, collaboratorsTarget, firstName, lastName, email, phone, password, cgu } = req.body;

    // Required fields
    if (!companyName || !companyPhone || !companyEmail || !address || !city || !zipCode || !country ||
        !firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Tous les champs obligatoires doivent être remplis' });
    }
    if (!cgu) return res.status(400).json({ error: 'Vous devez accepter les CGU' });

    // Email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Format d\'email de connexion invalide' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) return res.status(400).json({ error: 'Format d\'email entreprise invalide' });

    // Password strength
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });

    // SIRET: required only if France, 14 digits, unique
    if ((country || 'France').toLowerCase() === 'france') {
      if (!siret) return res.status(400).json({ error: 'Le SIRET est obligatoire pour la France' });
      if (!/^\d{14}$/.test(siret.replace(/\s/g, ''))) return res.status(400).json({ error: 'Le SIRET doit contenir exactement 14 chiffres' });
      const existingSiret = db.prepare('SELECT id FROM companies WHERE siret = ? AND country = ?').get(siret.replace(/\s/g, ''), 'France');
      if (existingSiret) return res.status(409).json({ error: 'Une entreprise avec ce SIRET est déjà inscrite' });
    }

    // Email unique (login email, case-insensitive)
    const existingEmail = db.prepare('SELECT id FROM collaborators WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (existingEmail) return res.status(409).json({ error: 'Un compte existe déjà avec cet email de connexion' });

    // Create company (status=pending, active=0)
    const companyId = 'c' + Date.now();
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    const cleanSiret = siret ? siret.replace(/\s/g, '') : null;

    insert('companies', {
      id: companyId, name: companyName, slug, domain: '', plan: 'free',
      contactEmail: companyEmail, active: 0, status: 'pending',
      createdAt: new Date().toISOString().slice(0, 10),
      collaboratorsCount: 1, calendarsCount: 1, bookingsCount: 0,
      siret: cleanSiret, businessId: businessId || null,
      phone: companyPhone, address, city, zipCode,
      country: country || 'France', sector: sector || null,
      website: website || null, collaboratorsTarget: collaboratorsTarget || null,
      responsibleFirstName: firstName, responsibleLastName: lastName,
      responsiblePhone: phone,
    });

    // Create admin collaborator
    const collabId = 'u' + Date.now();
    const hashedPassword = await bcrypt.hash(password, 10);
    insert('collaborators', {
      id: collabId, companyId, name: firstName + ' ' + lastName,
      email: email.trim(), role: 'admin', priority: 1,
      color: '#2563EB', code: null, password: hashedPassword,
      phone: phone || '', maxWeek: 20, maxMonth: 80, slackId: '',
    });

    // Create default calendar
    const calId = 'cal' + Date.now();
    insert('calendars', {
      id: calId, companyId, name: 'Agenda ' + firstName,
      slug: 'agenda-' + firstName.toLowerCase().replace(/[^a-z0-9]/g, ''),
      duration: 30, color: '#2563EB',
      collaborators_json: JSON.stringify([collabId]),
    });

    // Create default availability (Mon-Fri 9-12 + 14-18)
    const defAvail = {};
    for (let d = 0; d < 5; d++) defAvail[d] = { active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] };
    defAvail[5] = { active: false, slots: [] };
    defAvail[6] = { active: false, slots: [] };
    db.prepare('INSERT OR REPLACE INTO availabilities (collaboratorId, schedule_json) VALUES (?, ?)').run(collabId, JSON.stringify(defAvail));

    // Update company calendar count
    db.prepare('UPDATE companies SET calendarsCount = 1 WHERE id = ?').run(companyId);

    // Send confirmation email
    try {
      const { sendEmail } = await import('../services/brevoEmail.js');
      await sendEmail({
        to: email.trim(),
        toName: firstName + ' ' + lastName,
        subject: 'Calendar360 — Demande d\'inscription reçue',
        htmlContent: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#2563EB;">📋 Demande d'inscription reçue</h2>
            <p>Bonjour ${firstName},</p>
            <p>Nous avons bien reçu votre demande d'inscription pour <strong>${companyName}</strong>.</p>
            <p>Notre équipe examine votre dossier. Vous recevrez un email de confirmation dès que votre accès sera activé.</p>
            <p style="color:#6B7280;font-size:13px;">Délai habituel : 24 à 48 heures ouvrées.</p>
            <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;">
            <p style="color:#9CA3AF;font-size:12px;">Calendar360 — CRM + Agenda + Téléphonie</p>
          </div>
        `,
      });
    } catch (emailErr) { console.error('[REGISTER-COMPANY] Email error:', emailErr.message); }

    logAudit(req, 'register_company', 'auth', 'company', companyId, `New company registration: ${companyName} (${email})`);
    console.log(`\x1b[32m[AUTH]\x1b[0m New company registration (pending): ${companyName} — ${email}`);

    res.json({ success: true, pending: true, message: 'Votre demande d\'inscription est en cours de validation.' });
  } catch (err) {
    console.error('[REGISTER-COMPANY ERROR]', err);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

export default router;
