// HardDeleteContactModal — V1.12.9.d (V1.14.1 listener crmContactUpdated)
// Modale 2 etapes de suppression definitive d'un contact archive.
// Etape 1 : preview impact via GET /:id/delete-preview (V1.12.7 backend pret).
// Etape 2 : confirmation par saisie "SUPPRIMER" (casse stricte) + DELETE /:id/permanent.
// Backend V1.12.9.b : requirePermission('contacts.hard_delete') + body.confirm='CONFIRM_HARD_DELETE'
// + verrou archivedAt prereq + cascade 5 tables / KEEP 14 tables.
//
// V1.14.1 — Listener crmContactUpdated (PHASE 2 sync fiches contact) :
//   Le contact prop est figé à l'ouverture. Si une autre vue modifie le contact pendant
//   que la modale est ouverte, on resync via le state local + on recharge le preview
//   uniquement si fields includes 'archivedAt' (impact counts cascade).
// Aucun changement metier ; modal frontend pur.

import React, { useState, useEffect } from "react";
import { T } from "../../../theme";
import { I, Btn, Modal, Spinner } from "../../../shared/ui";
import { api } from "../../../shared/services/api";

const HardDeleteContactModal = ({ contact: initialContact, onClose, onSuccess, showNotif }) => {
  // V1.14.1 — state local sync via listener crmContactUpdated (cf. useEffect ci-dessous)
  const [contact, setContact] = useState(initialContact);
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!contact?.id) return;
    let cancelled = false;
    setLoading(true);
    api('/api/data/contacts/' + contact.id + '/delete-preview')
      .then(p => { if (!cancelled) { setPreview(p); setLoading(false); } })
      .catch(err => { if (!cancelled) { showNotif?.("Erreur chargement aperçu : " + (err?.message || ''), "danger"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [contact?.id]);

  // V1.14.1 — Listener crmContactUpdated : sync state local si event match.
  // Reload preview UNIQUEMENT si fields includes 'archivedAt' (Q3 reco — economie reseau).
  useEffect(() => {
    if (!contact?.id) return;
    const onUpdated = (e) => {
      const detail = e?.detail || {};
      if (detail.id !== contact.id) return;
      if (detail.contact) {
        setContact(detail.contact);
      } else {
        // Fallback : refetch (rare car V1.14.0 envoie toujours r.contact si dispo)
        api('/api/data/contacts/' + contact.id).then(fresh => {
          if (fresh?.id) setContact(fresh);
        }).catch(() => {});
      }
      if (Array.isArray(detail.fields) && detail.fields.includes('archivedAt')) {
        setLoading(true);
        api('/api/data/contacts/' + contact.id + '/delete-preview')
          .then(p => { setPreview(p); setLoading(false); })
          .catch(() => setLoading(false));
      }
    };
    window.addEventListener('crmContactUpdated', onUpdated);
    return () => window.removeEventListener('crmContactUpdated', onUpdated);
  }, [contact?.id]);

  const handleSubmit = async () => {
    if (confirmText !== "SUPPRIMER" || submitting) return;
    setSubmitting(true);
    try {
      const r = await api('/api/data/contacts/' + contact.id + '/permanent', { method: "DELETE", body: { confirm: "CONFIRM_HARD_DELETE" } });
      if (r?.success && r?.action === "hard_deleted") {
        showNotif?.('Contact "' + (r.name || contact.name) + '" supprimé définitivement', "success");
        try { window.dispatchEvent(new CustomEvent('crmContactHardDeleted', { detail: { id: contact.id } })); } catch {}
        onSuccess?.(contact.id);
        onClose?.();
      } else {
        const msg = r?.error === 'NOT_ARCHIVED' ? "Le contact doit être archivé avant suppression définitive" :
                    r?.error === 'NOT_FOUND' ? "Contact introuvable" :
                    r?.required === 'contacts.hard_delete' ? "Permission insuffisante pour suppression définitive" :
                    (r?.message || r?.error || "Erreur suppression définitive");
        showNotif?.(msg, "danger");
        setSubmitting(false);
      }
    } catch (err) {
      showNotif?.("Erreur réseau : " + (err?.message || ''), "danger");
      setSubmitting(false);
    }
  };

  if (!contact?.id) return null;

  return (
    <Modal open={true} onClose={submitting ? undefined : onClose} title={step === 1 ? "Suppression définitive — Aperçu" : "Confirmation finale"} width={560}>
      {step === 1 && (
        <>
          {loading ? (
            <div style={{ textAlign:'center', padding:30 }}><Spinner/></div>
          ) : preview ? (
            <>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:14, fontWeight:700, color:T.text, marginBottom:4 }}>{preview.contactName || contact.name}</div>
                <div style={{ fontSize:11, color:T.text3 }}>Archivé le {preview.archivedAt ? new Date(preview.archivedAt).toLocaleDateString('fr-FR') : '—'}</div>
              </div>
              <div style={{ padding:12, borderRadius:10, background:'#7F1D1D11', border:'1px solid #DC2626', marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#DC2626', marginBottom:6 }}><I n="alert-triangle" s={13}/> Sera supprimé définitivement</div>
                <div style={{ fontSize:11, color:T.text2, lineHeight:1.5 }}>
                  Le contact, ses followers, actions recommandées, mémoire IA et documents (5 tables).
                </div>
              </div>
              <div style={{ padding:12, borderRadius:10, background:T.bg, border:`1px solid ${T.border}`, marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.text2, marginBottom:6 }}><I n="archive" s={13}/> Conservé pour traçabilité</div>
                <div style={{ fontSize:11, color:T.text3, lineHeight:1.5 }}>
                  RDV ({preview.linkedCounts?.bookings || 0}), appels ({preview.linkedCounts?.call_logs || 0}), SMS ({preview.linkedCounts?.sms_messages || 0}),
                  conversations ({preview.linkedCounts?.conversations || 0}), historique pipeline ({preview.linkedCounts?.pipeline_history || 0}),
                  transcripts, notifications, audit logs (14 tables) — visibles dans Agenda et Reporting.
                </div>
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <Btn small onClick={onClose}>Annuler</Btn>
                <Btn small onClick={() => setStep(2)} style={{ color:'#fff', background:'#DC2626', borderColor:'#DC2626' }}>Continuer →</Btn>
              </div>
            </>
          ) : (
            <div style={{ padding:16, color:T.text3 }}>Erreur de chargement.</div>
          )}
        </>
      )}
      {step === 2 && (
        <>
          <div style={{ padding:14, borderRadius:10, background:'#DC262618', border:'1.5px solid #DC2626', marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#DC2626', marginBottom:6 }}><I n="alert-triangle" s={14}/> Action irréversible</div>
            <div style={{ fontSize:12, color:T.text2, lineHeight:1.5 }}>
              Le contact <strong>{contact.name}</strong> sera supprimé définitivement. Aucune restauration possible.
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:600, color:T.text2, display:'block', marginBottom:6 }}>
              Tapez <strong>SUPPRIMER</strong> pour confirmer :
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              autoFocus
              disabled={submitting}
              placeholder="SUPPRIMER"
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1.5px solid '+(confirmText==='SUPPRIMER'?'#DC2626':T.border), background:T.bg, color:T.text, fontSize:14, fontFamily:'inherit', boxSizing:'border-box' }}
            />
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Btn small onClick={() => setStep(1)} disabled={submitting}>← Retour</Btn>
            <Btn small onClick={handleSubmit} disabled={confirmText !== "SUPPRIMER" || submitting} style={{ color:'#fff', background:confirmText==='SUPPRIMER'&&!submitting?'#DC2626':'#DC262660', borderColor:'#DC2626', cursor:confirmText==='SUPPRIMER'&&!submitting?'pointer':'not-allowed' }}>
              {submitting ? "Suppression…" : "Supprimer définitivement"}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
};

export default HardDeleteContactModal;
