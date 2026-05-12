// ═══════════════════════════════════════════════════════════════════════
// CONSENT GUARD SERVICE — Phase 5
// Spec : v1.10.4-consent-phase5-call-guard (GO MH 2026-05-12)
// ═══════════════════════════════════════════════════════════════════════
// Logique centralisée — bloque l'appel sortant si :
//   - le téléphone matche un incoming_lead dont l'enveloppe a
//     telemarketingApprovalEnabled=1 ET callable != 1
//
// Réutilisée par :
//   - GET /api/leads/check-callable (pré-check frontend UX)
//   - POST /api/voip/calls (guard backend obligatoire)
//
// Comportement :
//   - Aucun lead matché → callable=true (appel autorisé, lead hors périmètre)
//   - Lead matché + enveloppe consentement OFF → callable=true (workflow classique)
//   - Lead matché + enveloppe consentement ON + lead.callable=1 → callable=true (validé)
//   - Lead matché + enveloppe consentement ON + lead.callable!=1 → callable=false BLOQUÉ
//
// Pas de bypass admin/supra V1 — risque légal identique pour tous (décision MH).
// ═══════════════════════════════════════════════════════════════════════

import { db } from '../db/database.js';
import { cleanPhone } from './twilioVoip.js';

/**
 * Centralized callable check by phone / contactId / leadId.
 *
 * @param {object} opts
 * @param {string} opts.companyId   — required (multi-tenant isolation)
 * @param {string} [opts.phone]     — phone (will be normalized to E.164)
 * @param {string} [opts.contactId] — contact ref (server resolves phone)
 * @param {string} [opts.leadId]    — direct lead ref (skip phone lookup)
 * @returns {{
 *   callable: boolean,
 *   consentRequired: boolean,
 *   consentStatus: string|null,
 *   leadId: string|null,
 *   envelopeId: string|null,
 *   reason: string|null,
 *   matched: boolean
 * }}
 */
export function checkCallable({ companyId, phone, contactId, leadId } = {}) {
  if (!companyId) {
    return { callable: true, consentRequired: false, consentStatus: null, leadId: null, envelopeId: null, reason: 'no_company', matched: false };
  }

  let lead = null;

  // 1. Direct leadId lookup
  if (leadId) {
    lead = db.prepare('SELECT id, phone, envelope_id, consentStatus, callable FROM incoming_leads WHERE id = ? AND companyId = ?').get(leadId, companyId);
  }

  // 2. ContactId → resolve phone from contacts table
  if (!lead && contactId) {
    const contact = db.prepare('SELECT phone FROM contacts WHERE id = ? AND companyId = ?').get(contactId, companyId);
    if (contact?.phone) phone = contact.phone;
  }

  // 3. Phone lookup → match incoming_leads by normalized phone
  if (!lead && phone) {
    const norm = cleanPhone(String(phone));
    if (!norm) {
      return { callable: true, consentRequired: false, consentStatus: null, leadId: null, envelopeId: null, reason: 'invalid_phone', matched: false };
    }
    // Match exact OR last 9 digits (handles +33 ↔ 0X format variants)
    const last9 = norm.slice(-9);
    lead = db.prepare(`
      SELECT id, phone, envelope_id, consentStatus, callable FROM incoming_leads
      WHERE companyId = ? AND (phone = ? OR phone LIKE ?)
      ORDER BY created_at DESC
      LIMIT 1
    `).get(companyId, norm, '%' + last9);
  }

  // 4. No lead matched → call allowed (outside consent perimeter)
  if (!lead) {
    return {
      callable: true,
      consentRequired: false,
      consentStatus: null,
      leadId: null,
      envelopeId: null,
      reason: 'no_lead_matched',
      matched: false,
    };
  }

  // 5. Lead matched but no envelope → call allowed
  if (!lead.envelope_id) {
    return {
      callable: true,
      consentRequired: false,
      consentStatus: lead.consentStatus || 'not_requested',
      leadId: lead.id,
      envelopeId: null,
      reason: 'lead_has_no_envelope',
      matched: true,
    };
  }

  // 6. Envelope lookup → check telemarketingApprovalEnabled
  const env = db.prepare('SELECT id, telemarketingApprovalEnabled FROM lead_envelopes WHERE id = ? AND companyId = ?').get(lead.envelope_id, companyId);
  const consentRequired = !!(env && env.telemarketingApprovalEnabled === 1);

  if (!consentRequired) {
    return {
      callable: true,
      consentRequired: false,
      consentStatus: lead.consentStatus || 'not_requested',
      leadId: lead.id,
      envelopeId: env?.id || lead.envelope_id,
      reason: 'envelope_consent_disabled',
      matched: true,
    };
  }

  // 7. Consent required → callable column is the source of truth
  const isCallable = lead.callable === 1;
  return {
    callable: isCallable,
    consentRequired: true,
    consentStatus: lead.consentStatus || 'not_requested',
    leadId: lead.id,
    envelopeId: env.id,
    reason: isCallable ? 'consent_validated' : 'consent_required_not_validated',
    matched: true,
  };
}
