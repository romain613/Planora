// server/shared/contracts/provider.contract.js
// Interface contract Provider — vérifie qu'une instance respecte le shape attendu.
// Phase 2+ : utilisé par BridgeRouter pour valider providers enregistrés au démarrage.

const REQUIRED_FIELDS = ['id', 'type', 'displayName', 'capabilities', 'priority', 'ownership'];
const REQUIRED_METHODS = ['supports', 'getHealth', 'checkHealth', 'toSummary'];

/**
 * Valide qu'une instance satisfait le contract Provider.
 * @param {object} provider
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateProvider(provider) {
  const errors = [];

  if (provider === null || typeof provider !== 'object') {
    return { ok: false, errors: ['provider must be object'] };
  }

  for (const f of REQUIRED_FIELDS) {
    if (!(f in provider)) {
      errors.push(`missing required field: ${f}`);
    }
  }
  for (const m of REQUIRED_METHODS) {
    if (typeof provider[m] !== 'function') {
      errors.push(`missing required method: ${m}`);
    }
  }
  if (provider.id !== undefined && (typeof provider.id !== 'string' || provider.id.length === 0)) {
    errors.push('id must be non-empty string');
  }
  if (provider.capabilities !== undefined && !Array.isArray(provider.capabilities)) {
    errors.push('capabilities must be array');
  }
  if (provider.priority !== undefined && typeof provider.priority !== 'number') {
    errors.push('priority must be number');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Valide qu'un MessagingProvider expose sendMessage.
 */
export function validateMessagingProvider(provider) {
  const base = validateProvider(provider);
  if (typeof provider?.sendMessage !== 'function') {
    base.errors.push('messaging: missing sendMessage()');
    base.ok = false;
  }
  return base;
}

/**
 * Valide qu'un VoiceProvider expose initiateCall + hangupCall.
 */
export function validateVoiceProvider(provider) {
  const base = validateProvider(provider);
  if (typeof provider?.initiateCall !== 'function') {
    base.errors.push('voice: missing initiateCall()');
    base.ok = false;
  }
  if (typeof provider?.hangupCall !== 'function') {
    base.errors.push('voice: missing hangupCall()');
    base.ok = false;
  }
  return base;
}

export const PROVIDER_CONTRACT_REQUIRED_FIELDS = Object.freeze([...REQUIRED_FIELDS]);
export const PROVIDER_CONTRACT_REQUIRED_METHODS = Object.freeze([...REQUIRED_METHODS]);
