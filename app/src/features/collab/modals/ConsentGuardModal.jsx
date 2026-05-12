// ═══════════════════════════════════════════════════════════════════════
// ConsentGuardModal — Phase 5
// Modale rouge affichée quand un appel est bloqué par le guard consentement.
// Pas de "Forcer l'appel" V1 — décision MH, pas de bypass admin (risque légal).
// ═══════════════════════════════════════════════════════════════════════

import React from "react";

const DANGER = "#DC2626";
const TEXT = "#111827";
const TEXT2 = "#64748B";
const BORDER = "#E2E8F0";

const STATUS_LABELS = {
  not_requested: 'Le consentement n\'a pas encore été demandé.',
  pending:       'Demande de consentement en attente d\'envoi.',
  sms_sent:      'SMS de consentement envoyé — en attente de réponse du lead.',
  clicked:       'Le lead a cliqué sur le lien mais n\'a pas encore confirmé.',
  refused:       'Le lead a refusé d\'être contacté par téléphone.',
  revoked:       'Le consentement a été révoqué.',
  expired:       'Le lien de consentement a expiré (à renvoyer).',
};

export default function ConsentGuardModal({ open, onClose, guardData }) {
  if (!open || !guardData) return null;

  const statusMessage = STATUS_LABELS[guardData.consentStatus] || 'Statut consentement inconnu.';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
            🚫
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: DANGER }}>Appel bloqué</div>
            <div style={{ fontSize: 12, color: TEXT2 }}>Consentement téléphonique requis</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 14, background: '#FEF2F2', borderRadius: 8, fontSize: 13, color: TEXT, lineHeight: 1.6, marginBottom: 14 }}>
          {statusMessage}
          <div style={{ marginTop: 10, fontSize: 11, color: TEXT2 }}>
            Ce lead appartient à une enveloppe avec consentement obligatoire (RGPD / Art. L223-1 Code conso.).
            Vous ne pouvez pas l'appeler tant qu'il n'a pas validé son accord par SMS.
          </div>
        </div>

        {/* Lead context */}
        {(guardData.leadId || guardData.envelopeId) && (
          <div style={{ fontSize: 11, color: TEXT2, marginBottom: 14, padding: '8px 10px', background: '#F8FAFC', borderRadius: 6 }}>
            {guardData.leadId && <div>Lead : <code>{guardData.leadId}</code></div>}
            {guardData.envelopeId && <div>Enveloppe : <code>{guardData.envelopeId}</code></div>}
            <div>Statut : <code>{guardData.consentStatus || '—'}</code></div>
          </div>
        )}

        {/* Recommendations */}
        <div style={{ fontSize: 12, color: TEXT2, marginBottom: 18, lineHeight: 1.6 }}>
          <b>Solutions :</b>
          <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 20 }}>
            <li>Envoyer la demande SMS depuis l'admin enveloppe (campagne ou renvoi unitaire).</li>
            <li>Attendre que le lead valide son consentement par le lien.</li>
            <li>Vérifier dans l'admin enveloppe si le consentement est bien requis pour cette enveloppe.</li>
          </ul>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '10px 20px', borderRadius: 8, background: DANGER, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Compris
          </button>
        </div>
      </div>
    </div>
  );
}
