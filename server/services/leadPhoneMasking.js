// Phase Envelope-Mask V1+V2 + V2.1 SECURITY — Helpers purs masquage numéros téléphone leads.
// Mode unique : 'masked-until-claim'. Format MH : "+33 6 XX XX 39 60" (4 derniers chiffres = 2 blocs de 2).
//
// 🔒 RÈGLE SÉCURITÉ ABSOLUE V2.1 :
// Pour un user non-autorisé (non admin, non assigné, non même company) :
//   - phone (réponse API) = format masqué uniquement
//   - _phoneMasked = true (flag UI)
//   - ❌ AUCUN champ alternatif (pas de _fullPhone, pas de _rawPhone, etc.)
//   - ❌ AUCUNE fuite possible via JSON / DevTools network
// Le numéro réel RESTE UNIQUEMENT EN DB.
// Le bouton appel passe par /api/voip/twiml/outbound qui résout server-side le contactId/leadId
// vers le phone et exécute le <Dial>, sans jamais transiter par le browser.

// Regex match phone-like values dans data_json custom fields (pour masquage récursif).
const PHONE_REGEX = /^[+]?[\d\s().-]{8,20}$/;

/**
 * Tronque un numéro vers le format MH `+33 6 XX XX 39 60` (4 derniers chiffres = 2 blocs de 2).
 * Préserve code pays + 1er digit si présent. Format français : `06 XX XX 39 60`.
 * Spec validée MH 2026-05-06.
 *
 * Exemples :
 *   "+33601433960"  → "+33 6 XX XX 39 60"
 *   "0601433960"    → "06 XX XX 39 60"
 *   "+447700900123" → "+44 7 XX XX 01 23"
 *   "1234"          → "XX XX XX 12 34" (fallback générique)
 */
export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return phone || '';
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  const last4Formatted = last4.slice(0, 2) + ' ' + last4.slice(2);
  // Code pays présent (+33, +44, etc.)
  if (digits.startsWith('+')) {
    const m = digits.match(/^\+(\d{1,3})(\d?)/);
    if (m) {
      const countryCode = '+' + m[1];
      const firstDigit = m[2] ? ' ' + m[2] : '';
      return countryCode + firstDigit + ' XX XX ' + last4Formatted;
    }
  }
  // Format français 0X XX XX XX XX (10 chiffres commençant par 0)
  if (digits.startsWith('0') && digits.length === 10) {
    return digits.slice(0, 2) + ' XX XX ' + last4Formatted;
  }
  // Fallback générique
  return 'XX XX XX ' + last4Formatted;
}

/**
 * Masque le phone d'un lead + récursivement les champs phone-like dans data_json.
 * Retourne une copie du lead avec :
 *   - phone tronqué
 *   - data_json (string JSON) avec champs phone-like masqués
 *   - flag _phoneMasked: true (consommé par frontend pour disabled buttons + tooltip)
 *
 * Si _userCanReveal=true OU mode='open' → retourne lead inchangé (no-op).
 *
 * @param {object} lead - Row incoming_leads (peut contenir phone, data_json string)
 * @param {string} mode - lead_envelopes.mask_phone_mode ('open' | 'masked-until-claim')
 * @param {boolean} userCanReveal - admin/supra/assigné peut voir le full phone
 * @returns {object} lead masked si applicable, sinon lead identique
 */
export function maskLeadPhones(lead, mode, userCanReveal) {
  if (userCanReveal || mode !== 'masked-until-claim' || !lead) return lead;
  const masked = { ...lead, phone: maskPhone(lead.phone), _phoneMasked: true };
  // Masquage récursif data_json sur champs phone-like (Sheet "Tel mobile", "Portable", etc.).
  try {
    const raw = typeof lead.data_json === 'string' ? lead.data_json : JSON.stringify(lead.data_json || {});
    const dj = JSON.parse(raw || '{}');
    const cleanedDj = {};
    for (const [k, v] of Object.entries(dj)) {
      if (typeof v === 'string' && PHONE_REGEX.test(v.trim())) {
        cleanedDj[k] = maskPhone(v);
      } else {
        cleanedDj[k] = v;
      }
    }
    masked.data_json = JSON.stringify(cleanedDj);
  } catch {
    // data_json invalide → ne rien masquer en json (le phone principal reste masqué)
  }
  return masked;
}

/**
 * Détermine si un user peut voir le numéro complet d'un lead :
 *   - admin/supra → toujours
 *   - collaborator_id matchant lead.assigned_to → oui (le lead a été pris par lui)
 *   - collaborator_id présent dans lead_assignments → oui (cas dispatch automatique)
 *   - sinon → non
 *
 * @param {object} lead - Row incoming_leads
 * @param {object} req - Express request (req.auth)
 * @param {object} db - better-sqlite3 instance
 * @returns {boolean}
 */
export function userCanRevealLead(lead, req, db) {
  if (!lead) return false;
  if (req?.auth?.role === 'admin' || req?.auth?.isSupra) return true;
  const collabId = req?.auth?.collaboratorId;
  if (!collabId) return false;
  if (lead.assigned_to && lead.assigned_to === collabId) return true;
  // Filet de sécurité : check lead_assignments (cas où assigned_to ne serait pas synchro)
  try {
    const assigned = db.prepare('SELECT 1 FROM lead_assignments WHERE lead_id = ? AND collaborator_id = ?').get(lead.id, collabId);
    return !!assigned;
  } catch {
    return false;
  }
}

/**
 * Mask V2 — Masque le phone d'un CONTACT CRM si :
 *   1. Le contact est issu d'un lead (source === 'lead' OU envelopeId rempli)
 *   2. L'enveloppe d'origine est en mask_phone_mode='masked-until-claim'
 *   3. Le user n'est ni admin/supra, ni l'assignedTo du contact
 *
 * Si masquage requis :
 *   - Remplace `phone` par version tronquée (visible UI)
 *   - Ajoute flag `_phoneMasked: true` (consommé frontend pour tooltip + bouton copier caché +
 *     bascule du bouton appel sur résolution server-side via contactId)
 *
 * 🔒 SECURITY V2.1 — AUCUN champ alternatif n'expose le full phone côté API/JSON.
 * Le numéro réel reste uniquement en DB. Le bouton appel passe par contactId vers
 * /api/voip/twiml/outbound qui résout server-side et fait le <Dial>.
 *
 * Sinon : retourne contact inchangé.
 *
 * Cache `envelopeId → mask_phone_mode` recommandé pour éviter SELECT N+1.
 *
 * @param {object} contact - Row contacts (parsé)
 * @param {object} req - Express request (req.auth)
 * @param {object} db - better-sqlite3 instance
 * @param {Map} envCache - Optionnel : Map<envelopeId, mask_phone_mode> pour batch
 * @returns {object} contact, masked si applicable
 */
export function maskContactIfFromMaskedEnvelope(contact, req, db, envCache = null) {
  if (!contact || !contact.envelopeId) return contact;
  // 🔒 V2.1 Option β — Bypass UNIQUEMENT pour admin/supra.
  // Owner (assignedTo === collabId) ne voit PAS clair : règle masking uniforme.
  // Le commercial assigné voit aussi le format masqué (filtre d'affichage homogène).
  if (req?.auth?.role === 'admin' || req?.auth?.isSupra) return contact;
  // Lookup mode envelope (avec cache si fourni)
  let mode;
  if (envCache && envCache.has(contact.envelopeId)) {
    mode = envCache.get(contact.envelopeId);
  } else {
    try {
      const env = db.prepare('SELECT mask_phone_mode FROM lead_envelopes WHERE id = ?').get(contact.envelopeId);
      mode = env?.mask_phone_mode || 'open';
    } catch {
      mode = 'open';
    }
    if (envCache) envCache.set(contact.envelopeId, mode);
  }
  if (mode !== 'masked-until-claim') return contact;
  // 🔒 SECURITY V2.1 — Apply masking. Le full phone N'EST PAS retourné dans la réponse JSON.
  // Le frontend qui veut appeler ce contact doit passer par contactId vers /twiml/outbound.
  return {
    ...contact,
    phone: maskPhone(contact.phone),
    _phoneMasked: true,
  };
}
