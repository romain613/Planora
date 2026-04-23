/**
 * Security Resolution Layer — Calendar360
 *
 * REGLE D'OR : Tout ce qui entre depuis l'exterieur = suspect par defaut.
 * Cette couche reconstruit TOUJOURS le contexte complet cote serveur.
 *
 * Usage :
 *   import { resolveFromCallSid, resolveFromPhone, resolveFromSession } from '../helpers/resolveContext.js';
 *   const ctx = resolveFromCallSid(callSid);
 *   if (!ctx.isValid) return res.status(404).json({ error: 'Contexte non resolu' });
 */

import { db } from '../db/database.js';

// ─── RESOLUTION PAR CALLSID (webhooks Twilio) ───
// Utilise : /status, /recording-callback, /amd-callback, /live-stream
export function resolveFromCallSid(callSid) {
  const result = { companyId: null, collaboratorId: null, contactId: null, threadId: null, callLogId: null, isValid: false };
  if (!callSid) return result;

  // 1. Trouver le call_log par twilioCallSid
  const callLog = db.prepare('SELECT id, companyId, collaboratorId, contactId FROM call_logs WHERE twilioCallSid = ?').get(callSid);
  if (!callLog) return result;

  result.callLogId = callLog.id;
  result.companyId = callLog.companyId;
  result.collaboratorId = callLog.collaboratorId;
  result.contactId = callLog.contactId;

  // 2. Trouver le thread de conversation
  if (callLog.contactId) {
    try {
      const conv = db.prepare('SELECT id FROM conversations WHERE companyId = ? AND collaboratorId = ? AND contactId = ?')
        .get(callLog.companyId, callLog.collaboratorId, callLog.contactId);
      result.threadId = conv?.id || null;
    } catch {}
  }

  result.isValid = !!(result.companyId && result.collaboratorId);
  return result;
}

// ─── RESOLUTION PAR NUMERO DE TELEPHONE (SMS inbound, appel entrant) ───
// Reconstruit le contexte a partir du numero Twilio (To) et du numero client (From)
export function resolveFromPhone({ twilioNumber, clientPhone }) {
  const result = { companyId: null, collaboratorId: null, contactId: null, threadId: null, isValid: false, source: null };
  if (!twilioNumber) return result;

  const cleanTwilio = (twilioNumber || '').replace(/[^\d+]/g, '');
  const cleanClient = (clientPhone || '').replace(/[^\d+]/g, '');
  const last9Client = cleanClient.slice(-9);

  // 1. Trouver le numero Twilio assigne dans phone_numbers (Marketplace)
  const phoneNum = db.prepare("SELECT companyId, collaboratorId, phoneNumber FROM phone_numbers WHERE phoneNumber = ? AND status = 'assigned'").get(cleanTwilio);
  if (phoneNum) {
    result.companyId = phoneNum.companyId;
    result.collaboratorId = phoneNum.collaboratorId || null;
    result.source = 'marketplace';
  } else {
    // Fallback: voip_settings (legacy)
    const settings = db.prepare("SELECT companyId, twilioPhoneNumber FROM voip_settings WHERE twilioPhoneNumber = ? AND active = 1").get(cleanTwilio);
    if (settings) {
      result.companyId = settings.companyId;
      // Trouver l'admin de la company comme fallback
      const admin = db.prepare("SELECT id FROM collaborators WHERE companyId = ? AND role = 'admin' LIMIT 1").get(settings.companyId);
      result.collaboratorId = admin?.id || null;
      result.source = 'voip_settings';
    }
  }

  if (!result.companyId) return result;

  // 2. Trouver le contact par numero client (avec priorite assignedTo collab)
  if (last9Client.length >= 9) {
    // Priorite 1 : contact assigne au collaborateur
    if (result.collaboratorId) {
      const ownContact = db.prepare('SELECT id FROM contacts WHERE companyId = ? AND assignedTo = ? AND phone LIKE ?')
        .get(result.companyId, result.collaboratorId, '%' + last9Client + '%');
      if (ownContact) result.contactId = ownContact.id;
    }
    // Priorite 2 : contact company-wide (fallback)
    if (!result.contactId) {
      const anyContact = db.prepare('SELECT id FROM contacts WHERE companyId = ? AND phone LIKE ?')
        .get(result.companyId, '%' + last9Client + '%');
      result.contactId = anyContact?.id || null;
    }
  }

  // 3. Trouver le thread
  if (result.contactId && result.collaboratorId) {
    try {
      const conv = db.prepare('SELECT id FROM conversations WHERE companyId = ? AND collaboratorId = ? AND contactId = ?')
        .get(result.companyId, result.collaboratorId, result.contactId);
      result.threadId = conv?.id || null;
    } catch {}
  }

  result.isValid = !!(result.companyId);
  return result;
}

// ─── RESOLUTION PAR SESSION (routes authentifiees) ───
// Utilise req.auth pour construire un contexte garanti safe
export function resolveFromSession(req, { contactId, callSid } = {}) {
  const result = {
    companyId: req.auth?.companyId || null,
    collaboratorId: req.auth?.collaboratorId || null,
    contactId: contactId || null,
    threadId: null,
    callLogId: null,
    isAdmin: req.auth?.role === 'admin' || req.auth?.isSupra || false,
    isSupra: req.auth?.isSupra || false,
    isValid: false,
  };

  if (!result.companyId || !result.collaboratorId) return result;

  // Valider le contactId si fourni (verifier ownership)
  if (contactId && !result.isAdmin) {
    const contact = db.prepare('SELECT assignedTo, companyId, shared_with_json FROM contacts WHERE id = ? AND companyId = ?')
      .get(contactId, result.companyId);
    if (!contact) {
      result.contactId = null; // Contact non trouve dans cette company
    } else if (contact.assignedTo !== result.collaboratorId) {
      // Verifier shared_with
      try {
        const shared = JSON.parse(contact.shared_with_json || '[]');
        if (!shared.includes(result.collaboratorId)) {
          result.contactId = null; // Pas autorise
        }
      } catch {
        result.contactId = null;
      }
    }
  }

  // Resoudre le callSid si fourni
  if (callSid) {
    const callLog = db.prepare('SELECT id, companyId, collaboratorId FROM call_logs WHERE twilioCallSid = ? AND companyId = ?')
      .get(callSid, result.companyId);
    if (callLog) {
      result.callLogId = callLog.id;
      // Verifier ownership pour non-admin
      if (!result.isAdmin && callLog.collaboratorId !== result.collaboratorId) {
        result.callLogId = null; // Pas son appel
      }
    }
  }

  result.isValid = true;
  return result;
}

// ─── VALIDATION WEBHOOK CONTEXT ───
// Pour les webhooks ou companyId/collaboratorId viennent de query params
// Re-valide TOUJOURS en DB
export function validateWebhookContext({ companyId, collaboratorId }) {
  const result = { companyId: null, collaboratorId: null, isValid: false };
  if (!companyId) return result;

  // Verifier que la company existe
  const company = db.prepare('SELECT id FROM companies WHERE id = ?').get(companyId);
  if (!company) return result;
  result.companyId = companyId;

  // Verifier que le collaborateur appartient a cette company
  if (collaboratorId) {
    const collab = db.prepare('SELECT id, companyId FROM collaborators WHERE id = ? AND companyId = ?').get(collaboratorId, companyId);
    if (collab) {
      result.collaboratorId = collaboratorId;
    }
    // Si collab invalide, on garde companyId mais pas collaboratorId
  }

  result.isValid = !!(result.companyId);
  return result;
}
