// ═══════════════════════════════════════════════════════════════════════
// CONSENT ADMIN ROUTES — Phase 4
// Spec : v1.10.4-consent-phase4-campaign (GO MH 2026-05-12)
// ═══════════════════════════════════════════════════════════════════════
// 7 endpoints admin (requireAdmin + enforceCompany + requirePermission) :
//   POST /api/envelopes/:id/consent/toggle         → telemarketingApprovalEnabled on/off
//   PUT  /api/envelopes/:id/consent/settings       → smsTemplate, expireDays, textVersion
//   GET  /api/envelopes/:id/consent/preview        → counts éligibles + crédits SMS dispo
//   POST /api/envelopes/:id/consent/campaign/send  → envoi batch SMS + tokens + proofs
//   GET  /api/envelopes/:id/consent/stats          → KPI dashboard
//   POST /api/leads/:leadId/consent/resend         → renvoyer SMS unique
//   POST /api/leads/:leadId/consent/revoke         → révocation manuelle (proof immuable)
//
// Décisions business (validées MH) :
//   - Envoi groupé : admin only au démarrage
//   - Pas de quota journalier V1
//   - Pré-check obligatoire : sms_credits >= eligible leads count
//   - Template SMS éditable par enveloppe, fallback template par défaut
//   - Aucune dépendance Phase 5 (guard appel) ni Phase 6 (PDF / export CRM)
//
// Sécurité :
//   - Permissions explicites (consent.view/manage/send/export)
//   - Audit logs (consent.envelope_toggled, settings_updated, campaign_sent,
//     sms_sent, revoked, resend, refused)
//   - tokenHash uniquement en logs, jamais le token complet
//   - Décrémentation crédit SMS APRÈS confirmation Twilio (pattern existant)
//   - Pas de SQL injection (better-sqlite3 prepared statements)
//   - URL générée HTTPS direct (ARCEP : pas de raccourcisseur)
// ═══════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { requireAuth, requireAdmin, enforceCompany } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { logAudit } from '../helpers/audit.js';
import { generateConsentToken } from '../services/consentToken.js';
import { sendTwilioSms } from '../services/twilioSms.js';
import { sendSms } from '../services/brevoSms.js';
import { checkCallable } from '../services/consentGuard.js'; // Phase 5

const router = Router();

// ─── Constants ─────────────────────────────────────────────────────────
const DEFAULT_SMS_TEMPLATE = 'Bonjour{firstName}, {companyName} souhaite obtenir votre accord pour vous contacter par telephone. Confirmez ou refusez ici : {url} (STOP au numero pour ne plus recevoir).';
const DEFAULT_LEGAL_VERSION = 'v1.0-2026-05';
const DEFAULT_EXPIRE_DAYS = 30;
const CONSENT_URL_BASE = process.env.CONSENT_URL_BASE || 'https://calendar360.fr/consent/';
const MAX_BATCH_PER_CAMPAIGN = 1000; // safety cap V1
const SMS_PARALLEL_BATCH = 5;        // 5 SMS in parallel, sequential batches
const SMS_BATCH_DELAY_MS = 250;      // delay between batches (anti rate-limit Twilio)

// ─── Helpers ───────────────────────────────────────────────────────────
function _nowIso() { return new Date().toISOString(); }
function _newId(prefix) { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10); }
function _isValidPhone(p) {
  if (!p) return false;
  const clean = String(p).replace(/[^\d+]/g, '');
  return clean.length >= 10;
}
function _maskPhone(p) {
  if (!p) return '';
  const s = String(p);
  if (s.length < 7) return s;
  const head = s.startsWith('+') ? 4 : 3;
  return s.slice(0, head) + '****' + s.slice(-4);
}

function _renderSmsBody({ template, firstName, companyName, url }) {
  return String(template || DEFAULT_SMS_TEMPLATE)
    .replaceAll('{firstName}', firstName ? ' ' + firstName : '')
    .replaceAll('{companyName}', companyName || 'notre entreprise')
    .replaceAll('{url}', url);
}

function _renderLegalTextSnapshot({ companyName, version }) {
  return `Texte legal ${version}. Demarchage telephonique avec consentement explicite, RGPD + L223-1 Code consommation. Operateur: ${companyName}. Conservation 5 ans. Droit de retrait STOP par SMS ou contact direct.`;
}

function _eligibilityCounts(envelopeId, companyId) {
  const all = db.prepare(`
    SELECT consentStatus, phone FROM incoming_leads
    WHERE envelope_id = ? AND companyId = ?
  `).all(envelopeId, companyId);
  const total = all.length;
  let withValidPhone = 0;
  let validated = 0, refused = 0, revoked = 0, sms_sent = 0, pending = 0, clicked = 0, expired = 0, notRequested = 0;
  for (const l of all) {
    if (_isValidPhone(l.phone)) withValidPhone++;
    const s = l.consentStatus || 'not_requested';
    if (s === 'validated') validated++;
    else if (s === 'refused') refused++;
    else if (s === 'revoked') revoked++;
    else if (s === 'sms_sent') sms_sent++;
    else if (s === 'pending') pending++;
    else if (s === 'clicked') clicked++;
    else if (s === 'expired') expired++;
    else notRequested++;
  }
  // Eligible to send = valid phone + status in [not_requested, expired, pending]
  // (do NOT resend to sms_sent/clicked/validated/refused/revoked — those need resend endpoint or revoke first)
  const eligibleForSend = all.filter(l => _isValidPhone(l.phone)
    && ['not_requested', 'expired', 'pending'].includes(l.consentStatus || 'not_requested')).length;
  return { total, withValidPhone, eligibleForSend, validated, refused, revoked, sms_sent, pending, clicked, expired, notRequested };
}

function _getSmsCredits(companyId) {
  const row = db.prepare('SELECT credits FROM sms_credits WHERE companyId = ?').get(companyId);
  return row ? row.credits : 0;
}

// ─── Verify ownership envelope ↔ company ───────────────────────────────
function _resolveEnvelope(envelopeId, companyId) {
  const env = db.prepare('SELECT * FROM lead_envelopes WHERE id = ? AND companyId = ?').get(envelopeId, companyId);
  return env || null;
}

// ════════════════════════════════════════════════════════════════════════
// 1. POST /api/envelopes/:id/consent/toggle
// ════════════════════════════════════════════════════════════════════════
router.post('/envelopes/:id/consent/toggle', requireAuth, requireAdmin, enforceCompany, requirePermission('consent.manage'), (req, res) => {
  try {
    const env = _resolveEnvelope(req.params.id, req.auth.companyId);
    if (!env) return res.status(404).json({ error: 'ENVELOPE_NOT_FOUND' });
    const enabled = req.body?.enabled === true || req.body?.enabled === 1 ? 1 : 0;
    db.prepare('UPDATE lead_envelopes SET telemarketingApprovalEnabled = ? WHERE id = ? AND companyId = ?').run(enabled, env.id, env.companyId);
    logAudit(req, 'consent.envelope_toggled', 'consent', 'lead_envelope', env.id, `telemarketingApprovalEnabled=${enabled}`, { envelope_name: env.name, enabled });
    res.json({ success: true, envelopeId: env.id, telemarketingApprovalEnabled: enabled });
  } catch (e) {
    console.error('[CONSENT TOGGLE]', e.message);
    res.status(500).json({ error: 'INTERNAL', detail: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// 2. PUT /api/envelopes/:id/consent/settings
// ════════════════════════════════════════════════════════════════════════
router.put('/envelopes/:id/consent/settings', requireAuth, requireAdmin, enforceCompany, requirePermission('consent.manage'), (req, res) => {
  try {
    const env = _resolveEnvelope(req.params.id, req.auth.companyId);
    if (!env) return res.status(404).json({ error: 'ENVELOPE_NOT_FOUND' });
    const { consentSmsTemplate, consentTextVersion, consentExpireDays } = req.body || {};
    const tpl = consentSmsTemplate != null ? String(consentSmsTemplate).slice(0, 500) : null;
    const ver = consentTextVersion != null ? String(consentTextVersion).slice(0, 32) : null;
    const days = consentExpireDays != null ? Math.max(1, Math.min(180, parseInt(consentExpireDays, 10) || DEFAULT_EXPIRE_DAYS)) : null;
    const fields = [];
    const params = [];
    if (tpl !== null) { fields.push('consentSmsTemplate = ?'); params.push(tpl); }
    if (ver !== null) { fields.push('consentTextVersion = ?'); params.push(ver); }
    if (days !== null) { fields.push('consentExpireDays = ?'); params.push(days); }
    if (fields.length === 0) return res.status(400).json({ error: 'NO_FIELDS_TO_UPDATE' });
    params.push(env.id, env.companyId);
    db.prepare(`UPDATE lead_envelopes SET ${fields.join(', ')} WHERE id = ? AND companyId = ?`).run(...params);
    logAudit(req, 'consent.settings_updated', 'consent', 'lead_envelope', env.id, 'settings updated', { fields: fields.map(f => f.split('=')[0].trim()) });
    res.json({ success: true });
  } catch (e) {
    console.error('[CONSENT SETTINGS]', e.message);
    res.status(500).json({ error: 'INTERNAL', detail: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// 3. GET /api/envelopes/:id/consent/preview
// ════════════════════════════════════════════════════════════════════════
router.get('/envelopes/:id/consent/preview', requireAuth, requireAdmin, enforceCompany, requirePermission('consent.view'), (req, res) => {
  try {
    const env = _resolveEnvelope(req.params.id, req.auth.companyId);
    if (!env) return res.status(404).json({ error: 'ENVELOPE_NOT_FOUND' });
    const counts = _eligibilityCounts(env.id, env.companyId);
    const smsCreditsAvailable = _getSmsCredits(env.companyId);
    const smsCreditsRequired = counts.eligibleForSend;
    const canSend = smsCreditsAvailable >= smsCreditsRequired && counts.eligibleForSend > 0 && env.telemarketingApprovalEnabled === 1;
    const warnings = [];
    if (env.telemarketingApprovalEnabled !== 1) warnings.push('telemarketingApprovalEnabled is OFF for this envelope');
    if (counts.eligibleForSend === 0) warnings.push('No eligible leads (need valid phone + status not_requested/expired/pending)');
    if (smsCreditsAvailable < smsCreditsRequired) warnings.push(`Insufficient SMS credits (need ${smsCreditsRequired}, have ${smsCreditsAvailable})`);
    res.json({
      envelopeId: env.id,
      envelopeName: env.name,
      telemarketingApprovalEnabled: env.telemarketingApprovalEnabled === 1,
      consentSmsTemplate: env.consentSmsTemplate || DEFAULT_SMS_TEMPLATE,
      consentTextVersion: env.consentTextVersion || DEFAULT_LEGAL_VERSION,
      consentExpireDays: env.consentExpireDays || DEFAULT_EXPIRE_DAYS,
      counts,
      smsCreditsAvailable,
      smsCreditsRequired,
      canSend,
      warnings,
    });
  } catch (e) {
    console.error('[CONSENT PREVIEW]', e.message);
    res.status(500).json({ error: 'INTERNAL', detail: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// 4. POST /api/envelopes/:id/consent/campaign/send
// ════════════════════════════════════════════════════════════════════════
router.post('/envelopes/:id/consent/campaign/send', requireAuth, requireAdmin, enforceCompany, requirePermission('consent.send'), async (req, res) => {
  try {
    const env = _resolveEnvelope(req.params.id, req.auth.companyId);
    if (!env) return res.status(404).json({ error: 'ENVELOPE_NOT_FOUND' });
    if (env.telemarketingApprovalEnabled !== 1) {
      return res.status(409).json({ error: 'CONSENT_NOT_ENABLED' });
    }
    const counts = _eligibilityCounts(env.id, env.companyId);
    const smsCreditsAvailable = _getSmsCredits(env.companyId);
    if (counts.eligibleForSend === 0) return res.status(409).json({ error: 'NO_ELIGIBLE_LEADS' });
    if (smsCreditsAvailable < counts.eligibleForSend) {
      return res.status(402).json({ error: 'INSUFFICIENT_SMS_CREDITS', required: counts.eligibleForSend, available: smsCreditsAvailable });
    }
    const company = db.prepare('SELECT id, name FROM companies WHERE id = ?').get(env.companyId);
    const eligibleLeads = db.prepare(`
      SELECT id, first_name, last_name, phone FROM incoming_leads
      WHERE envelope_id = ? AND companyId = ?
        AND (consentStatus IN ('not_requested','expired','pending') OR consentStatus IS NULL)
    `).all(env.id, env.companyId);
    const toProcess = eligibleLeads.filter(l => _isValidPhone(l.phone)).slice(0, MAX_BATCH_PER_CAMPAIGN);

    const campaignId = _newId('camp');
    const nowIso = _nowIso();
    const legalVersion = env.consentTextVersion || DEFAULT_LEGAL_VERSION;
    const legalSnapshot = _renderLegalTextSnapshot({ companyName: company?.name || env.name, version: legalVersion });
    const template = env.consentSmsTemplate || DEFAULT_SMS_TEMPLATE;
    const expireDays = env.consentExpireDays || DEFAULT_EXPIRE_DAYS;

    db.prepare(`
      INSERT INTO consent_campaigns (id, companyId, envelopeId, name, smsTemplate, legalVersion, legalTextSnapshot,
        totalLeads, smsSentCount, clickedCount, validatedCount, refusedCount, revokedCount, expiredCount,
        status, startedAt, completedAt, createdBy, createdAt)
      VALUES (?,?,?,?,?,?,?,?,0,0,0,0,0,0,'sending',?,NULL,?,?)
    `).run(
      campaignId, env.companyId, env.id, `Campagne ${env.name} ${nowIso.slice(0,10)}`, template,
      legalVersion, legalSnapshot, toProcess.length,
      nowIso, req.auth.collaboratorId || 'admin', nowIso
    );

    // ─── Batch SMS sending (parallel batches with throttle) ───
    let sent = 0, failed = 0;
    const failures = [];
    const fromTwilio = process.env.TWILIO_PHONE_NUMBER || null;

    for (let i = 0; i < toProcess.length; i += SMS_PARALLEL_BATCH) {
      const slice = toProcess.slice(i, i + SMS_PARALLEL_BATCH);
      await Promise.all(slice.map(async (lead) => {
        try {
          const gen = generateConsentToken({
            leadId: lead.id, companyId: env.companyId, envelopeId: env.id, campaignId,
            phone: lead.phone, ttlDays: expireDays,
          });
          const url = CONSENT_URL_BASE + gen.token;
          const body = _renderSmsBody({ template, firstName: lead.first_name, companyName: company?.name || env.name, url });

          // Insert consent_tokens FIRST so the page works even if SMS fails to deliver later
          db.prepare(`
            INSERT INTO consent_tokens (id, tokenHash, companyId, envelopeId, leadId, campaignId, phone, expiresAt, status, createdAt)
            VALUES (?,?,?,?,?,?,?,?,?,?)
          `).run(_newId('cnt'), gen.tokenHash, env.companyId, env.id, lead.id, campaignId, lead.phone, gen.expiresAt, 'pending', nowIso);

          // SMS send (Twilio preferred if FROM number configured, Brevo fallback)
          let smsResult;
          if (fromTwilio) {
            smsResult = await sendTwilioSms({ from: fromTwilio, to: lead.phone, content: body });
          } else {
            smsResult = await sendSms({ to: lead.phone, content: body, isTransactional: true });
          }

          if (smsResult?.success) {
            // Decrement credit + record transaction
            db.prepare('UPDATE sms_credits SET credits = MAX(0, credits - 1) WHERE companyId = ?').run(env.companyId);
            db.prepare(`INSERT INTO sms_transactions (id, companyId, date, type, count, detail, amount) VALUES (?,?,?,?,?,?,?)`)
              .run(_newId('smstx'), env.companyId, nowIso, 'sent', 1, `consent campaign ${campaignId} lead ${lead.id}`, 0);
            // Update lead state
            db.prepare(`
              UPDATE incoming_leads
              SET consentStatus = 'sms_sent', consentSmsSentAt = ?, consentRequestedAt = COALESCE(consentRequestedAt, ?)
              WHERE id = ? AND companyId = ?
            `).run(nowIso, nowIso, lead.id, env.companyId);
            sent++;
          } else {
            failed++;
            failures.push({ leadId: lead.id, error: smsResult?.error || 'unknown' });
          }
        } catch (e) {
          failed++;
          failures.push({ leadId: lead.id, error: e.message });
        }
      }));
      if (i + SMS_PARALLEL_BATCH < toProcess.length) {
        await new Promise(r => setTimeout(r, SMS_BATCH_DELAY_MS));
      }
    }

    // Update campaign counts + status
    db.prepare(`UPDATE consent_campaigns SET smsSentCount = ?, status = ?, completedAt = ? WHERE id = ?`)
      .run(sent, 'completed', _nowIso(), campaignId);

    logAudit(req, 'consent.campaign_sent', 'consent', 'consent_campaign', campaignId,
      `envelope ${env.id}: sent=${sent} failed=${failed} total=${toProcess.length}`,
      { envelopeId: env.id, sent, failed, total: toProcess.length, failures: failures.slice(0, 10) });

    res.json({
      success: true,
      campaignId,
      total: toProcess.length,
      sent,
      failed,
      failures: failures.slice(0, 10),
    });
  } catch (e) {
    console.error('[CONSENT CAMPAIGN SEND]', e.message);
    res.status(500).json({ error: 'INTERNAL', detail: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// 5. GET /api/envelopes/:id/consent/stats
// ════════════════════════════════════════════════════════════════════════
router.get('/envelopes/:id/consent/stats', requireAuth, requireAdmin, enforceCompany, requirePermission('consent.view'), (req, res) => {
  try {
    const env = _resolveEnvelope(req.params.id, req.auth.companyId);
    if (!env) return res.status(404).json({ error: 'ENVELOPE_NOT_FOUND' });
    const counts = _eligibilityCounts(env.id, env.companyId);
    const callable = db.prepare('SELECT COUNT(*) as c FROM incoming_leads WHERE envelope_id = ? AND companyId = ? AND callable = 1').get(env.id, env.companyId).c;
    const validationRate = counts.total > 0 ? (counts.validated / counts.total) : 0;
    const clickRate = counts.sms_sent > 0 ? ((counts.clicked + counts.validated + counts.refused) / counts.sms_sent) : 0;

    const campaigns = db.prepare(`
      SELECT id, name, status, totalLeads, smsSentCount, startedAt, completedAt
      FROM consent_campaigns WHERE envelopeId = ? AND companyId = ? ORDER BY createdAt DESC LIMIT 20
    `).all(env.id, env.companyId);

    res.json({
      envelopeId: env.id,
      counts: { ...counts, callable },
      rates: { validationRate, clickRate },
      campaigns,
    });
  } catch (e) {
    console.error('[CONSENT STATS]', e.message);
    res.status(500).json({ error: 'INTERNAL', detail: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// 6. POST /api/leads/:leadId/consent/resend
// ════════════════════════════════════════════════════════════════════════
router.post('/leads/:leadId/consent/resend', requireAuth, requireAdmin, enforceCompany, requirePermission('consent.send'), async (req, res) => {
  try {
    const lead = db.prepare('SELECT * FROM incoming_leads WHERE id = ? AND companyId = ?').get(req.params.leadId, req.auth.companyId);
    if (!lead) return res.status(404).json({ error: 'LEAD_NOT_FOUND' });
    if (!_isValidPhone(lead.phone)) return res.status(400).json({ error: 'INVALID_PHONE' });
    if (!lead.envelope_id) return res.status(409).json({ error: 'LEAD_HAS_NO_ENVELOPE' });
    const env = _resolveEnvelope(lead.envelope_id, lead.companyId);
    if (!env || env.telemarketingApprovalEnabled !== 1) return res.status(409).json({ error: 'CONSENT_NOT_ENABLED' });
    if (['validated', 'refused'].includes(lead.consentStatus)) {
      return res.status(409).json({ error: 'CONSENT_ALREADY_FINAL', status: lead.consentStatus });
    }
    if (_getSmsCredits(env.companyId) < 1) return res.status(402).json({ error: 'INSUFFICIENT_SMS_CREDITS' });

    const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(env.companyId);
    const expireDays = env.consentExpireDays || DEFAULT_EXPIRE_DAYS;
    const template = env.consentSmsTemplate || DEFAULT_SMS_TEMPLATE;
    const nowIso = _nowIso();
    const gen = generateConsentToken({
      leadId: lead.id, companyId: env.companyId, envelopeId: env.id, campaignId: null,
      phone: lead.phone, ttlDays: expireDays,
    });
    db.prepare(`
      INSERT INTO consent_tokens (id, tokenHash, companyId, envelopeId, leadId, campaignId, phone, expiresAt, status, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(_newId('cnt'), gen.tokenHash, env.companyId, env.id, lead.id, null, lead.phone, gen.expiresAt, 'pending', nowIso);

    const url = CONSENT_URL_BASE + gen.token;
    const body = _renderSmsBody({ template, firstName: lead.first_name, companyName: company?.name || env.name, url });
    const fromTwilio = process.env.TWILIO_PHONE_NUMBER || null;
    const smsResult = fromTwilio
      ? await sendTwilioSms({ from: fromTwilio, to: lead.phone, content: body })
      : await sendSms({ to: lead.phone, content: body, isTransactional: true });

    if (smsResult?.success) {
      db.prepare('UPDATE sms_credits SET credits = MAX(0, credits - 1) WHERE companyId = ?').run(env.companyId);
      db.prepare(`INSERT INTO sms_transactions (id, companyId, date, type, count, detail, amount) VALUES (?,?,?,?,?,?,?)`)
        .run(_newId('smstx'), env.companyId, nowIso, 'sent', 1, `consent resend lead ${lead.id}`, 0);
      db.prepare(`
        UPDATE incoming_leads SET consentStatus = 'sms_sent', consentSmsSentAt = ?, consentRequestedAt = COALESCE(consentRequestedAt, ?)
        WHERE id = ? AND companyId = ?
      `).run(nowIso, nowIso, lead.id, env.companyId);
      logAudit(req, 'consent.resend', 'consent', 'incoming_lead', lead.id, `resent SMS`, { phone: _maskPhone(lead.phone) });
      res.json({ success: true, leadId: lead.id, status: 'sms_sent' });
    } else {
      res.status(502).json({ error: 'SMS_SEND_FAILED', detail: smsResult?.error });
    }
  } catch (e) {
    console.error('[CONSENT RESEND]', e.message);
    res.status(500).json({ error: 'INTERNAL', detail: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// 7. POST /api/leads/:leadId/consent/revoke
// ════════════════════════════════════════════════════════════════════════
router.post('/leads/:leadId/consent/revoke', requireAuth, requireAdmin, enforceCompany, requirePermission('consent.manage'), (req, res) => {
  try {
    const lead = db.prepare('SELECT * FROM incoming_leads WHERE id = ? AND companyId = ?').get(req.params.leadId, req.auth.companyId);
    if (!lead) return res.status(404).json({ error: 'LEAD_NOT_FOUND' });
    const env = lead.envelope_id ? _resolveEnvelope(lead.envelope_id, lead.companyId) : null;
    const reason = String(req.body?.reason || 'manual_admin_revoke').slice(0, 256);
    const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(lead.companyId);
    const nowIso = _nowIso();
    const proofId = _newId('cnpr');
    const legalVersion = env?.consentTextVersion || DEFAULT_LEGAL_VERSION;
    const legalSnapshot = _renderLegalTextSnapshot({ companyName: company?.name || '—', version: legalVersion });
    const tokenHash = 'manual_revoke_' + lead.id + '_' + Date.now();
    const legalHash = crypto.createHash('sha256').update(legalSnapshot).digest('hex');

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO consent_proofs (
          id, companyId, envelopeId, campaignId, leadId, contactId, phone,
          firstName, lastName, status, consentSource,
          consentTextSnapshot, consentTextHash, legalVersion, tokenHash,
          smsSentAt, clickedAt, validatedAt, refusedAt, revokedAt,
          ip, port, userAgent, pdfStoragePath, pdfHash, metadata_json, createdAt
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        proofId, lead.companyId, lead.envelope_id || '—', null, lead.id, lead.contact_id || null, lead.phone,
        lead.first_name || null, lead.last_name || null, 'revoked', 'manual_admin',
        legalSnapshot, legalHash, legalVersion, tokenHash,
        null, null, null, null, nowIso,
        req.ip || '', '', String(req.headers['user-agent'] || '').slice(0,256), null, null,
        JSON.stringify({ reason, by: req.auth.collaboratorId || 'supra' }), nowIso
      );
      db.prepare(`
        UPDATE incoming_leads SET consentStatus = 'revoked', callable = 0, consentRevokedAt = ?, consentProofId = ?
        WHERE id = ? AND companyId = ?
      `).run(nowIso, proofId, lead.id, lead.companyId);
    });
    tx();
    logAudit(req, 'consent.revoked', 'consent', 'incoming_lead', lead.id, `manual revoke: ${reason}`, { proofId });
    res.json({ success: true, leadId: lead.id, status: 'revoked', proofId });
  } catch (e) {
    console.error('[CONSENT REVOKE]', e.message);
    res.status(500).json({ error: 'INTERNAL', detail: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// 8. GET /api/leads/check-callable — Phase 5 pre-call lookup (UX guard)
// ════════════════════════════════════════════════════════════════════════
// Léger : authentifié simple (pas d'admin requis) — utilisé avant chaque appel
// pour décider d'afficher la modale ConsentGuardModal côté frontend.
router.get('/leads/check-callable', requireAuth, enforceCompany, (req, res) => {
  try {
    const { phone, contactId, leadId } = req.query;
    if (!phone && !contactId && !leadId) {
      return res.status(400).json({ error: 'MISSING_PARAMS', detail: 'phone, contactId or leadId required' });
    }
    const result = checkCallable({
      companyId: req.auth.companyId,
      phone: phone ? String(phone) : undefined,
      contactId: contactId ? String(contactId) : undefined,
      leadId: leadId ? String(leadId) : undefined,
    });
    res.json(result);
  } catch (e) {
    console.error('[CHECK-CALLABLE]', e.message);
    res.status(500).json({ error: 'INTERNAL', detail: e.message });
  }
});

export default router;
