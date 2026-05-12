// ═══════════════════════════════════════════════════════════════════════
// consentCheck — Phase 5 utility
// Pré-check frontend avant lancement d'appel sortant.
// Retourne { callable, consentRequired, consentStatus, leadId, envelopeId, reason }.
// ═══════════════════════════════════════════════════════════════════════

import { api } from "../services/api";

/**
 * Pre-call consent check. Returns a promise resolving to a guard result.
 * Caller decides whether to proceed or open the ConsentGuardModal.
 *
 * @param {object} opts
 * @param {string} [opts.phone]
 * @param {string} [opts.contactId]
 * @param {string} [opts.leadId]
 * @returns {Promise<{callable:boolean, consentRequired:boolean, consentStatus:string|null, leadId:string|null, envelopeId:string|null, reason:string|null, matched:boolean}>}
 */
export async function checkConsentBeforeCall({ phone, contactId, leadId } = {}) {
  const params = new URLSearchParams();
  if (phone) params.set('phone', phone);
  if (contactId) params.set('contactId', contactId);
  if (leadId) params.set('leadId', leadId);
  if (!params.toString()) {
    // Nothing to check — allow by default (defensive)
    return { callable: true, consentRequired: false, consentStatus: null, leadId: null, envelopeId: null, reason: 'no_params', matched: false };
  }
  try {
    const r = await api(`/api/leads/check-callable?${params.toString()}`);
    if (!r || r.error) {
      // On network/server error : allow call to proceed (don't block legitimate calls due to lookup failure)
      console.warn('[CONSENT CHECK] lookup failed, allowing call:', r?.error || 'no response');
      return { callable: true, consentRequired: false, consentStatus: null, leadId: null, envelopeId: null, reason: 'lookup_failed', matched: false };
    }
    return r;
  } catch (e) {
    console.warn('[CONSENT CHECK] exception, allowing call:', e.message);
    return { callable: true, consentRequired: false, consentStatus: null, leadId: null, envelopeId: null, reason: 'exception', matched: false };
  }
}
