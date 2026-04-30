import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, getAll, insert, remove } from '../db/database.js';
import { requireAuth, requireSupra } from '../middleware/auth.js';

const router = Router();

// GET /api/companies
router.get('/', requireSupra, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM companies').all();
    res.json(rows.map(r => ({ ...r, active: !!r.active })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/companies/:id
// Supra admin can edit any company. Admin can edit their own company (limited fields).
router.put('/:id', requireAuth, (req, res) => {
  try {
    const companyId = req.params.id;
    const isSupra = req.auth.isSupra;
    const isOwnCompany = req.auth.companyId === companyId;
    const isAdmin = req.auth.role === 'admin';

    // Security: only supra or admin of own company
    if (!isSupra && !(isAdmin && isOwnCompany)) {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    const data = { ...req.body };
    if ('active' in data) data.active = data.active ? 1 : 0;
    delete data.id;

    // Non-supra admins: whitelist allowed fields
    if (!isSupra) {
      const ALLOWED = ['name', 'slug', 'domain', 'address', 'sms_sender_name', 'forbidden_words_json', 'forecast_contract_avg', 'forecast_conversion_rate'];
      Object.keys(data).forEach(k => { if (!ALLOWED.includes(k)) delete data[k]; });
    }

    if (Object.keys(data).length === 0) return res.json({ success: true });
    const sets = Object.keys(data).map(k => `${k} = ?`).join(',');
    const values = Object.values(data);
    values.push(companyId);
    db.prepare(`UPDATE companies SET ${sets} WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/companies — Create company + admin collaborator
router.post('/', requireSupra, async (req, res) => {
  try {
    const { adminFirstName, adminLastName, adminPhone, adminPassword, sendWelcomeEmail, ...c } = req.body;
    const id = c.id || 'c' + Date.now();

    // Check unique email
    if (c.contactEmail) {
      const existing = db.prepare('SELECT id FROM collaborators WHERE LOWER(email) = LOWER(?)').get(c.contactEmail.trim());
      if (existing) return res.status(400).json({ error: 'Cet email est deja utilise par un autre compte' });
      const existingSupra = db.prepare('SELECT email FROM supra_admins WHERE LOWER(email) = LOWER(?)').get(c.contactEmail.trim());
      if (existingSupra) return res.status(400).json({ error: 'Cet email est reserve (supra admin)' });
    }

    // Create company
    insert('companies', { id, name: c.name, slug: c.slug, domain: c.domain, plan: c.plan || 'free', contactEmail: c.contactEmail, sector: c.sector || '', active: 1, createdAt: c.createdAt || new Date().toISOString().slice(0, 10) });

    // Create admin collaborator
    if (c.contactEmail && adminPassword) {
      const collabId = 'u' + Date.now();
      const adminName = [adminFirstName, adminLastName].filter(Boolean).join(' ') || c.name;
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      db.prepare('INSERT INTO collaborators (id, companyId, name, email, phone, password, role, code, color) VALUES (?,?,?,?,?,?,?,?,?)').run(
        collabId, id, adminName, c.contactEmail.trim(), adminPhone || '', hashedPassword, 'admin',
        Math.random().toString(36).slice(2, 8).toUpperCase(), '#2563EB'
      );
      console.log(`[COMPANY] Admin created: ${adminName} (${c.contactEmail}) for company ${c.name}`);

      // Send welcome email via Brevo
      if (sendWelcomeEmail && process.env.BREVO_API_KEY) {
        try {
          const emailBody = {
            sender: { name: 'Calendar360', email: 'noreply@calendar360.fr' },
            to: [{ email: c.contactEmail.trim(), name: adminName }],
            subject: `Bienvenue sur Calendar360 — Votre compte ${c.name} est pret`,
            htmlContent: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <h2 style="color:#2563EB;">Bienvenue sur Calendar360 !</h2>
                <p>Bonjour <strong>${adminName}</strong>,</p>
                <p>Votre compte entreprise <strong>${c.name}</strong> a ete cree avec succes.</p>
                <div style="background:#F8FAFC;border-radius:10px;padding:16px;margin:20px 0;border:1px solid #E2E8F0;">
                  <p style="margin:4px 0;font-size:14px;"><strong>Email :</strong> ${c.contactEmail}</p>
                  <p style="margin:4px 0;font-size:14px;"><strong>Mot de passe :</strong> ${adminPassword}</p>
                  <p style="margin:4px 0;font-size:14px;"><strong>Plan :</strong> ${c.plan || 'Gratuit'}</p>
                </div>
                <a href="https://calendar360.fr" style="display:inline-block;background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:10px;">Se connecter</a>
                <p style="color:#64748B;font-size:12px;margin-top:20px;">Si vous n'etes pas a l'origine de cette demande, ignorez cet email.</p>
              </div>
            `
          };
          await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(emailBody)
          });
          console.log(`[EMAIL] Welcome email sent to ${c.contactEmail}`);
        } catch (emailErr) {
          console.error('[EMAIL] Welcome email failed:', emailErr.message);
        }
      }
    }

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/companies/:id — cascade delete all related data
router.delete('/:id', requireSupra, (req, res) => {
  try {
    const id = req.params.id;
    // Comprehensive cascade delete — ALL tables with companyId or linked via collaboratorId
    const collabIds = db.prepare('SELECT id FROM collaborators WHERE companyId = ?').all(id).map(r => r.id);
    const calIds = db.prepare('SELECT id FROM calendars WHERE companyId = ?').all(id).map(r => r.id);

    // Sessions (via collaboratorId)
    if (collabIds.length) { const ph = collabIds.map(() => '?').join(','); db.prepare(`DELETE FROM sessions WHERE collaboratorId IN (${ph})`).run(...collabIds); }
    // Bookings (via calendarId)
    if (calIds.length) { const ph = calIds.map(() => '?').join(','); db.prepare(`DELETE FROM bookings WHERE calendarId IN (${ph})`).run(...calIds); }
    // Availabilities (via collaboratorId)
    if (collabIds.length) { const ph = collabIds.map(() => '?').join(','); db.prepare(`DELETE FROM availabilities WHERE collaboratorId IN (${ph})`).run(...collabIds); }

    // All tables with companyId — comprehensive list
    const companyTables = [
      'contacts','calendars','pipeline_stages','pipeline_history','call_logs','call_transcripts',
      'conversations','conversation_events','sms_messages','sms_credits','sms_transactions',
      'activity_logs','settings','workflows','routings','polls','forms','form_submissions',
      'pages','page_leads','custom_tables','custom_rows','tickets','ticket_messages',
      'chat_messages','lead_sources','incoming_leads','lead_envelopes','lead_dispatch_rules',
      'lead_assignments','lead_distribution_scores','lead_import_logs','lead_history',
      'user_goals','team_goals','goal_rewards','perf_score_settings','perf_bonus_penalty_logs',
      'perf_audit_reports','perf_snapshots','ai_copilot_analyses','ai_copilot_reactions',
      'secure_ia_alerts','secure_ia_reports','voip_settings','voip_credits','voip_transactions',
      'company_knowledge_base','company_products','company_scripts','company_email_templates',
      'company_sms_templates','company_documents','telecom_credits','telecom_credit_logs',
      'dispatch_tasks','user_activity_logs','reminder_logs',
    ];
    for (const table of companyTables) {
      try { db.prepare(`DELETE FROM ${table} WHERE companyId = ?`).run(id); } catch {}
    }
    // Collaborators last (FK dependencies)
    db.prepare('DELETE FROM collaborators WHERE companyId = ?').run(id);
    // Company itself
    remove('companies', id);

    console.log(`\x1b[31m[COMPANIES]\x1b[0m Company deleted: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[COMPANY DELETE ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════
// Company validation endpoints (Supra only)
// ═════════════════════════════════════════════════════════

// GET /api/companies/pending — List pending registrations
router.get('/pending', requireSupra, (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM companies WHERE status = 'pending' ORDER BY createdAt DESC").all();
    // Attach admin info for each company
    const result = rows.map(c => {
      const admin = db.prepare("SELECT id, name, email, phone FROM collaborators WHERE companyId = ? AND role = 'admin' AND (archivedAt IS NULL OR archivedAt = '') LIMIT 1").get(c.id);
      return { ...c, active: !!c.active, admin: admin || null };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/companies/:id/validate — Approve a pending company
router.put('/:id/validate', requireSupra, async (req, res) => {
  try {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!company) return res.status(404).json({ error: 'Entreprise introuvable' });
    if (company.status !== 'pending') return res.status(400).json({ error: 'Cette entreprise n\'est pas en attente de validation' });

    db.prepare('UPDATE companies SET status = ?, active = 1, validatedAt = ?, validatedBy = ? WHERE id = ?')
      .run('active', new Date().toISOString(), req.auth.collaboratorId || 'supra', req.params.id);

    // Send activation email to admin
    const admin = db.prepare("SELECT name, email FROM collaborators WHERE companyId = ? AND role = 'admin' AND (archivedAt IS NULL OR archivedAt = '') LIMIT 1").get(req.params.id);
    if (admin?.email) {
      try {
        const { sendEmail } = await import('../services/brevoEmail.js');
        await sendEmail({
          to: admin.email,
          toName: admin.name,
          subject: 'Calendar360 — Votre compte est activé !',
          htmlContent: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#22C55E;">✅ Votre compte est activé !</h2>
              <p>Bonjour ${company.responsibleFirstName || admin.name},</p>
              <p>Bonne nouvelle ! Votre compte <strong>${company.name}</strong> a été validé et est maintenant actif.</p>
              <p>Vous pouvez vous connecter dès maintenant :</p>
              <div style="text-align:center;margin:20px 0;">
                <a href="https://calendar360.fr" style="display:inline-block;padding:12px 24px;background:#2563EB;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Se connecter</a>
              </div>
              <p style="color:#6B7280;font-size:13px;">Email de connexion : ${admin.email}</p>
              <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;">
              <p style="color:#9CA3AF;font-size:12px;">Calendar360 — CRM + Agenda + Téléphonie</p>
            </div>
          `,
        });
      } catch (emailErr) { console.error('[VALIDATE] Email error:', emailErr.message); }
    }

    console.log(`\x1b[32m[COMPANIES]\x1b[0m Company validated: ${company.name} (${req.params.id})`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/companies/:id/reject — Reject a pending company
router.put('/:id/reject', requireSupra, async (req, res) => {
  try {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!company) return res.status(404).json({ error: 'Entreprise introuvable' });

    const { reason } = req.body;
    db.prepare('UPDATE companies SET status = ?, rejectedReason = ? WHERE id = ?')
      .run('rejected', reason || '', req.params.id);

    // Send rejection email
    const admin = db.prepare("SELECT name, email FROM collaborators WHERE companyId = ? AND role = 'admin' AND (archivedAt IS NULL OR archivedAt = '') LIMIT 1").get(req.params.id);
    if (admin?.email) {
      try {
        const { sendEmail } = await import('../services/brevoEmail.js');
        await sendEmail({
          to: admin.email,
          toName: admin.name,
          subject: 'Calendar360 — Demande d\'inscription',
          htmlContent: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#EF4444;">Demande d'inscription non retenue</h2>
              <p>Bonjour ${company.responsibleFirstName || admin.name},</p>
              <p>Après examen de votre demande pour <strong>${company.name}</strong>, nous ne sommes pas en mesure de valider votre inscription pour le moment.</p>
              ${reason ? `<div style="padding:12px;background:#FEF2F2;border-radius:8px;border:1px solid #FECACA;margin:16px 0;"><strong>Motif :</strong> ${reason}</div>` : ''}
              <p>Si vous pensez qu'il s'agit d'une erreur ou souhaitez nous fournir des informations complémentaires, n'hésitez pas à nous contacter :</p>
              <p>📧 <a href="mailto:support@calendar360.fr">support@calendar360.fr</a></p>
              <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;">
              <p style="color:#9CA3AF;font-size:12px;">Calendar360 — CRM + Agenda + Téléphonie</p>
            </div>
          `,
        });
      } catch (emailErr) { console.error('[REJECT] Email error:', emailErr.message); }
    }

    console.log(`\x1b[31m[COMPANIES]\x1b[0m Company rejected: ${company.name} (${req.params.id}) — ${reason || 'no reason'}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
