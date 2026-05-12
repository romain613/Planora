// ═══════════════════════════════════════════════════════════════════════
// CONSENT PUBLIC ROUTES — Phase 3
// Spec : v1.10.4-consent-phase3-public-page (GO MH 2026-05-12)
// ═══════════════════════════════════════════════════════════════════════
// 3 endpoints publics (NO auth, HMAC + DB validation + rate-limit) :
//   GET  /api/consent/:token         → marque clickedAt, retourne contexte
//   POST /api/consent/:token/accept  → preuve immuable status='validated', callable=1
//   POST /api/consent/:token/refuse  → preuve immuable status='refused',  callable=0
//
// Sécurité :
//   - HMAC-SHA256 signature (server/services/consentToken.js)
//   - Lookup DB par tokenHash uniquement (jamais le token complet en DB)
//   - Rate-limit middleware (10/min GET, 5/min POST)
//   - Logs : tokenHash.slice(0,12) uniquement, jamais le token complet
//   - Capture IP/UA/port (req.ip via trust proxy, X-Forwarded-Port si dispo)
//   - Transaction atomique (better-sqlite3 db.transaction)
//   - INSERT consent_proofs déclenche triggers immutabilité (prevent_update/_delete)
// ═══════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { verifyConsentToken, hashConsentToken } from '../services/consentToken.js';
import { getConsentLimiter, postConsentLimiter } from '../middleware/consentRateLimit.js';

const router = Router();

// ─── Texte légal V1 — hardcodé Phase 3 (table dédiée Phase 4+ si évolution) ───
const CONSENT_LEGAL_VERSION = 'v1.0-2026-05';
const CONSENT_LEGAL_TEMPLATE = `Conformément aux articles L223-1 et suivants du Code de la consommation et au Règlement Général sur la Protection des Données (RGPD), {{companyName}} sollicite votre consentement explicite pour vous démarcher par téléphone à des fins commerciales sur le numéro {{phoneMasked}}.

En cliquant sur « J'accepte », vous autorisez {{companyName}} à vous contacter par téléphone pour vous présenter ses services et offres commerciales.

Ce consentement peut être retiré à tout moment :
— en répondant STOP par SMS à tout message de {{companyName}} ;
— en contactant directement {{companyName}} ;
— en cliquant sur tout lien de désinscription ultérieur.

Vos données personnelles (numéro de téléphone, prénom, nom) sont collectées et conservées pendant 5 ans à des fins de prospection commerciale, conformément au RGPD. Vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition au traitement de vos données.

Plus d'informations : https://calendar360.fr/privacy`;

function _renderLegalText({ companyName, phoneMasked }) {
  return CONSENT_LEGAL_TEMPLATE
    .replaceAll('{{companyName}}', companyName || '—')
    .replaceAll('{{phoneMasked}}', phoneMasked || '—');
}

function _hashText(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function _maskPhone(phone) {
  if (!phone) return '';
  const p = String(phone);
  if (p.length < 7) return p;
  const headLen = p.startsWith('+') ? 4 : 3;
  return p.slice(0, headLen) + '••••' + p.slice(-4);
}

function _captureRequestContext(req) {
  return {
    ip: req.ip || req.headers['x-forwarded-for'] || '',
    port: String(req.headers['x-forwarded-port'] || req.socket?.remotePort || ''),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 512),
  };
}

function _tokenLogId(tokenHash) {
  return tokenHash ? tokenHash.slice(0, 12) + '…' : 'no-hash';
}

function _nowIso() { return new Date().toISOString(); }
function _newId(prefix) { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10); }

// ─── Resolve token + state (used by all 3 endpoints) ──────────────────
function _resolveToken(rawToken) {
  // 1. HMAC + expiry (stateless)
  const v = verifyConsentToken(rawToken);
  if (!v.valid) {
    return { ok: false, status: v.expired ? 410 : 400, error: v.expired ? 'CONSENT_TOKEN_EXPIRED' : 'CONSENT_TOKEN_INVALID', reason: v.reason };
  }
  const tokenHash = hashConsentToken(rawToken);
  // 2. DB lookup (stateful: one-time-use enforcement)
  const dbRow = db.prepare('SELECT * FROM consent_tokens WHERE tokenHash = ?').get(tokenHash);
  if (!dbRow) {
    return { ok: false, status: 404, error: 'CONSENT_TOKEN_NOT_FOUND' };
  }
  return { ok: true, payload: v.payload, tokenHash, dbRow };
}

// ─── GET /api/consent/:token ──────────────────────────────────────────
router.get('/:token', getConsentLimiter, (req, res) => {
  const r = _resolveToken(req.params.token);
  if (!r.ok) {
    console.warn('[CONSENT GET]', r.error, r.reason || '');
    return res.status(r.status).json({ error: r.error });
  }
  const { payload, tokenHash, dbRow } = r;

  try {
    // Lookup company name + lead context
    const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(payload.companyId);
    const lead = db.prepare('SELECT id, first_name, last_name, phone, consentStatus, callable FROM incoming_leads WHERE id = ? AND companyId = ?').get(payload.leadId, payload.companyId);

    if (!company || !lead) {
      console.warn('[CONSENT GET]', _tokenLogId(tokenHash), 'company or lead missing');
      return res.status(404).json({ error: 'CONSENT_CONTEXT_MISSING' });
    }

    // Mark clickedAt on first GET (idempotent)
    const isAlreadyResponded = dbRow.status === 'validated' || dbRow.status === 'refused';
    if (!dbRow.clickedAt && !isAlreadyResponded) {
      const nowIso = _nowIso();
      db.prepare('UPDATE consent_tokens SET clickedAt = ?, status = ? WHERE tokenHash = ? AND clickedAt IS NULL')
        .run(nowIso, 'clicked', tokenHash);
      // Sync lead consentStatus only if currently in earlier state
      db.prepare("UPDATE incoming_leads SET consentStatus = 'clicked', consentClickedAt = ? WHERE id = ? AND companyId = ? AND consentStatus IN ('not_requested','pending','sms_sent')")
        .run(nowIso, payload.leadId, payload.companyId);
    }

    const phoneMasked = _maskPhone(payload.phone || lead.phone);
    const legalText = _renderLegalText({ companyName: company.name, phoneMasked });

    res.json({
      companyName: company.name,
      phoneMasked,
      legalText,
      legalVersion: CONSENT_LEGAL_VERSION,
      expiresAt: dbRow.expiresAt,
      alreadyResponded: isAlreadyResponded,
      responseStatus: dbRow.status, // 'pending' | 'clicked' | 'validated' | 'refused'
    });
  } catch (e) {
    console.error('[CONSENT GET]', _tokenLogId(tokenHash), 'error:', e.message);
    res.status(500).json({ error: 'CONSENT_INTERNAL_ERROR' });
  }
});

// ─── Shared mutation logic for accept/refuse ──────────────────────────
function _processDecision(req, res, decisionStatus /* 'validated' | 'refused' */) {
  const r = _resolveToken(req.params.token);
  if (!r.ok) {
    console.warn('[CONSENT POST]', decisionStatus, r.error, r.reason || '');
    return res.status(r.status).json({ error: r.error });
  }
  const { payload, tokenHash, dbRow } = r;

  // Replay guard
  if (dbRow.usedAt || dbRow.status === 'validated' || dbRow.status === 'refused') {
    console.warn('[CONSENT POST]', decisionStatus, _tokenLogId(tokenHash), 'replay attempt — already', dbRow.status);
    return res.status(409).json({ error: 'CONSENT_ALREADY_USED', responseStatus: dbRow.status });
  }

  const company = db.prepare('SELECT id, name FROM companies WHERE id = ?').get(payload.companyId);
  const lead = db.prepare('SELECT id, first_name, last_name, phone, contact_id, envelope_id FROM incoming_leads WHERE id = ? AND companyId = ?').get(payload.leadId, payload.companyId);
  if (!company || !lead) {
    return res.status(404).json({ error: 'CONSENT_CONTEXT_MISSING' });
  }

  // Defense in depth — phone must match between token payload and DB lead
  if (String(payload.phone) !== String(lead.phone)) {
    console.warn('[CONSENT POST]', decisionStatus, _tokenLogId(tokenHash), 'phone mismatch payload vs lead');
    return res.status(400).json({ error: 'CONSENT_PHONE_MISMATCH' });
  }

  const ctx = _captureRequestContext(req);
  const phoneMasked = _maskPhone(payload.phone);
  const legalText = _renderLegalText({ companyName: company.name, phoneMasked });
  const legalHash = _hashText(legalText);
  const proofId = _newId('cnpr');
  const nowIso = _nowIso();
  const isValidated = decisionStatus === 'validated';

  try {
    const tx = db.transaction(() => {
      // 1. INSERT consent_proofs (immutable — triggers prevent UPDATE/DELETE)
      db.prepare(`
        INSERT INTO consent_proofs (
          id, companyId, envelopeId, campaignId, leadId, contactId, phone,
          firstName, lastName, status, consentSource,
          consentTextSnapshot, consentTextHash, legalVersion, tokenHash,
          smsSentAt, clickedAt, validatedAt, refusedAt, revokedAt,
          ip, port, userAgent, pdfStoragePath, pdfHash, metadata_json, createdAt
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        proofId, payload.companyId, payload.envelopeId, payload.campaignId || null,
        payload.leadId, lead.contact_id || null, payload.phone,
        lead.first_name || null, lead.last_name || null,
        decisionStatus, 'sms_link',
        legalText, legalHash, CONSENT_LEGAL_VERSION, tokenHash,
        null, // smsSentAt — Phase 4 will populate
        dbRow.clickedAt || nowIso,
        isValidated ? nowIso : null,
        !isValidated ? nowIso : null,
        null, // revokedAt
        ctx.ip, ctx.port, ctx.userAgent,
        null, null, // pdfStoragePath, pdfHash — Phase 6
        '{}',
        nowIso
      );

      // 2. UPDATE incoming_leads — consentStatus + callable + timestamps + proofId
      db.prepare(`
        UPDATE incoming_leads
        SET consentStatus = ?,
            callable = ?,
            consentValidatedAt = ?,
            consentRefusedAt = ?,
            consentProofId = ?
        WHERE id = ? AND companyId = ?
      `).run(
        decisionStatus,
        isValidated ? 1 : 0,
        isValidated ? nowIso : null,
        !isValidated ? nowIso : null,
        proofId,
        payload.leadId,
        payload.companyId
      );

      // 3. UPDATE consent_tokens — mark used (one-time-use enforcement)
      db.prepare(`
        UPDATE consent_tokens
        SET usedAt = ?, status = ?
        WHERE tokenHash = ?
      `).run(nowIso, decisionStatus, tokenHash);
    });
    tx();

    console.log('[CONSENT POST]', decisionStatus, _tokenLogId(tokenHash), 'proof:', proofId, 'lead:', payload.leadId);
    res.json({
      success: true,
      status: decisionStatus,
      callable: isValidated ? 1 : 0,
      proofId,
    });
  } catch (e) {
    console.error('[CONSENT POST]', decisionStatus, _tokenLogId(tokenHash), 'tx error:', e.message);
    res.status(500).json({ error: 'CONSENT_INTERNAL_ERROR' });
  }
}

// ─── POST /api/consent/:token/accept ──────────────────────────────────
router.post('/:token/accept', postConsentLimiter, (req, res) => _processDecision(req, res, 'validated'));

// ─── POST /api/consent/:token/refuse ──────────────────────────────────
router.post('/:token/refuse', postConsentLimiter, (req, res) => _processDecision(req, res, 'refused'));

export default router;
