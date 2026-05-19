// server/shared/providers/types/providerTypes.js
// Énumérations et constantes types — figées via Object.freeze.

export const PROVIDER_TYPES = Object.freeze({
  MESSAGING: 'messaging', // SMS, email
  VOICE: 'voice',         // appels VoIP/PSTN
  NUMBER: 'number',       // gestion DID/numéros
  WEBHOOK: 'webhook',     // réception inbound
  COMPOSITE: 'composite', // ex: Twilio = messaging+voice+number
});

export const CAPABILITIES = Object.freeze({
  SMS_OUTBOUND: 'sms.outbound',
  SMS_INBOUND: 'sms.inbound',
  SMS_DLR: 'sms.dlr', // delivery receipt
  VOICE_OUTBOUND: 'voice.outbound',
  VOICE_INBOUND: 'voice.inbound',
  VOICE_RECORDING: 'voice.recording',
  VOICE_TRANSCRIPTION: 'voice.transcription',
  VOICE_TRANSFER: 'voice.transfer',
  VOICE_IVR: 'voice.ivr',
  NUMBER_PROVISION: 'number.provision',
  NUMBER_RELEASE: 'number.release',
  NUMBER_PORTABILITY: 'number.portability',
  EMAIL_OUTBOUND: 'email.outbound',
  EMAIL_INBOUND: 'email.inbound',
  SIP_TRUNK: 'sip.trunk',
  WHATSAPP: 'whatsapp',
});

export const PROVIDER_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  DOWN: 'down',
  UNKNOWN: 'unknown',
});

export const TENANT_OWNERSHIP = Object.freeze({
  PLATFORM: 'platform', // SUPRA-owned (partagé default)
  SUPRO: 'supro',       // SUPRO-owned
  CLIENT: 'client',     // CLIENT-owned (rare, dédié)
});

/**
 * Validate that a capability is a known string.
 */
export function isCapability(cap) {
  if (typeof cap !== 'string') return false;
  return Object.values(CAPABILITIES).includes(cap);
}

/**
 * Validate provider type.
 */
export function isProviderType(t) {
  if (typeof t !== 'string') return false;
  return Object.values(PROVIDER_TYPES).includes(t);
}
