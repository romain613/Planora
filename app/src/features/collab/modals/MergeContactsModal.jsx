// MergeContactsModal — V1.13.2.b
// Modale standalone pour fusion CRM réelle (2 fiches déjà persistées).
// Aucune logique backend inline : appelle handlers/contactMergeHandlers.js.
//
// Étapes :
//   1. Sélection secondary via autocomplete (filterMergeablePeers)
//   2. Preview cascade impacts (fetchMergePreview)
//   3. Saisie "FUSIONNER" exact (Q5)
//   4. Submit → executeMergeRequest → window event 'crmContactMerged' → onSuccess
//
// Verrous :
//   - Q7 : primary archivé déjà filtré côté CrmTab via canOpenMerge → modale ne s'ouvre pas
//   - Q11 : 1 secondary -> 1 primary uniquement (pas de multi-sélection)
//   - Backend re-vérifie companyId, permissions Q5, archivedAt primary, etc.
//
// V1.14.1 — Listener crmContactUpdated (PHASE 2 sync fiches contact) :
//   primary prop est figé à l'ouverture (mergeTarget du hook useMergeContacts).
//   secondary state local mis à jour via setSecondary lors de la sélection user.
//   Si une autre vue modifie primary OU secondary pendant ouverture, on resync les states
//   locaux. Reload mergePreview uniquement si fields includes archivedAt OR pipeline_stage
//   (Q4 reco — economie reseau).

import React, { useState, useEffect, useMemo } from "react";
import { T } from "../../../theme";
import { I, Btn, Modal, Spinner, Avatar } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";
import {
  filterMergeablePeers,
  fetchMergePreview,
  executeMergeRequest,
  mapMergeError,
} from "../handlers/contactMergeHandlers";

const MAX_NOTES_PREVIEW = 200;

const SectionHeader = ({ children, color = T.text3 }) => (
  <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
    {children}
  </div>
);

const PanelContact = ({ label, contact, accentColor }) => {
  const isArchived = !!(contact?.archivedAt && contact.archivedAt !== '');
  return (
    <div style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 10, border: `2px solid ${accentColor}40`, background: T.surface }}>
      <SectionHeader color={accentColor}>{label}</SectionHeader>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Avatar name={contact?.name || '?'} color={accentColor} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {contact?.name || '—'}
          </div>
          {isArchived && <div style={{ fontSize: 10, color: '#EF4444', fontWeight: 600 }}>📦 archivée</div>}
        </div>
      </div>
      <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.6 }}>
        {contact?.email && <div><I n="mail" s={10}/> {contact.email}</div>}
        {contact?.phone && <div><I n="phone" s={10}/> {contact.phone}</div>}
        {contact?.assignedName && <div><I n="user" s={10}/> {contact.assignedName}</div>}
        {(contact?.pipeline_stage || contact?.pipelineStage) && <div><I n="layers" s={10}/> {contact.pipeline_stage || contact.pipelineStage}</div>}
      </div>
    </div>
  );
};

const MergeContactsModal = ({ primary: initialPrimary, onClose, onSuccess }) => {
  const { contacts, collab, showNotif } = useCollabContext();
  // V1.14.1 — state local pour primary (sync via listener crmContactUpdated).
  // initialPrimary = mergeTarget du hook useMergeContacts (figé à l'ouverture par CrmTab).
  const [primary, setPrimary] = useState(initialPrimary);
  const [step, setStep] = useState(1);
  const [query, setQuery] = useState('');
  const [secondary, setSecondary] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Q3 — Autocomplete : filtre live sur contacts state
  const isAdmin = collab?.role === 'admin' || collab?.role === 'supra';
  const peers = useMemo(
    () => filterMergeablePeers(contacts || [], primary, query, { includeArchived: isAdmin, limit: 8 }),
    [contacts, primary, query, isAdmin]
  );

  // Q4 — Fetch preview quand secondary sélectionné
  useEffect(() => {
    if (!secondary?.id) { setPreview(null); return; }
    let cancelled = false;
    setPreviewLoading(true);
    fetchMergePreview(secondary.id).then(p => {
      if (cancelled) return;
      setPreview(p);
      setPreviewLoading(false);
    });
    return () => { cancelled = true; };
  }, [secondary?.id]);

  // V1.14.1 — Listener crmContactUpdated : sync local state si primary OU secondary event match.
  // Reload mergePreview UNIQUEMENT si fields includes archivedAt OR pipeline_stage
  // (Q4 reco — economie reseau, recharge ciblee si impact cascade counts).
  useEffect(() => {
    const onUpdated = (e) => {
      const detail = e?.detail || {};
      const matchesPrimary = primary?.id && detail.id === primary.id;
      const matchesSecondary = secondary?.id && detail.id === secondary.id;
      if (!matchesPrimary && !matchesSecondary) return;
      // Update state local cible
      const applyFresh = (target, setter) => {
        if (detail.contact) {
          setter(detail.contact);
        } else {
          api('/api/data/contacts/' + target.id).then(fresh => {
            if (fresh?.id) setter(fresh);
          }).catch(() => {});
        }
      };
      if (matchesPrimary) applyFresh(primary, setPrimary);
      if (matchesSecondary) applyFresh(secondary, setSecondary);
      // Reload mergePreview si secondary impacte ET fields significatifs
      if (matchesSecondary && Array.isArray(detail.fields)) {
        const significant = detail.fields.includes('archivedAt') || detail.fields.includes('pipeline_stage');
        if (significant) {
          setPreviewLoading(true);
          fetchMergePreview(secondary.id).then(p => { setPreview(p); setPreviewLoading(false); }).catch(() => setPreviewLoading(false));
        }
      }
    };
    window.addEventListener('crmContactUpdated', onUpdated);
    return () => window.removeEventListener('crmContactUpdated', onUpdated);
  }, [primary?.id, secondary?.id]);

  // Q5 — Submit final : confirmation stricte "FUSIONNER" exact
  const handleSubmit = async () => {
    if (confirmText !== 'FUSIONNER' || submitting || !secondary?.id) return;
    setSubmitting(true);
    const r = await executeMergeRequest(primary.id, secondary.id);
    if (r?.success) {
      const counts = r.cascadeCounts || {};
      const total = (counts.bookings || 0) + (counts.call_logs || 0) + (counts.sms_messages || 0)
                  + (counts.conversations || 0) + (counts.pipeline_history || 0);
      showNotif?.(`Fiches fusionnées (${total} éléments rattachés)`, 'success');
      onSuccess?.({ primaryId: primary.id, secondaryId: secondary.id, cascadeCounts: counts });
      onClose?.();
    } else {
      showNotif?.(mapMergeError(r?.error, r?.message), 'danger');
      setSubmitting(false);
    }
  };

  if (!primary?.id) return null;

  // Q6 — Si user choisit un secondary archivé, on l'autorise mais on prévient
  const secondaryArchived = !!(secondary?.archivedAt && secondary.archivedAt !== '');
  const notesAppendPreview = secondary?.notes && String(secondary.notes).trim()
    ? `[Fusionné depuis ${secondary.name || secondary.id}]\n${String(secondary.notes).slice(0, MAX_NOTES_PREVIEW)}${String(secondary.notes).length > MAX_NOTES_PREVIEW ? '…' : ''}`
    : null;

  return (
    <Modal
      open={true}
      onClose={submitting ? undefined : onClose}
      title={step === 1 ? "Fusionner deux fiches" : "Confirmer la fusion"}
      width={720}
    >
      {step === 1 && (
        <>
          {/* Bandeau primary + slot secondary */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <PanelContact label="Fiche principale (conservée)" contact={primary} accentColor="#0EA5E9" />
            <div style={{ flex: 1, minWidth: 0 }}>
              {!secondary ? (
                <div style={{ height: '100%', minHeight: 110, padding: 12, borderRadius: 10, border: `2px dashed ${T.border}`, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 12, textAlign: 'center' }}>
                  Recherchez ci-dessous la fiche à fusionner dans la principale.
                </div>
              ) : (
                <PanelContact label="Fiche absorbée (sera supprimée)" contact={secondary} accentColor="#DC2626" />
              )}
            </div>
          </div>

          {/* Q3 — Autocomplete */}
          {!secondary && (
            <>
              <SectionHeader>Rechercher la fiche à fusionner</SectionHeader>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
                placeholder="Nom, email ou téléphone…"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10 }}
              />
              <div style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 10 }}>
                {peers.length === 0 ? (
                  <div style={{ padding: 14, fontSize: 12, color: T.text3, textAlign: 'center' }}>
                    {query ? "Aucun contact correspondant" : "Tapez pour rechercher (ou listez vos contacts)"}
                  </div>
                ) : (
                  peers.map(c => (
                    <div key={c.id}
                      onClick={() => setSecondary(c)}
                      style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                      onMouseOver={e => e.currentTarget.style.background = T.bg}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Avatar name={c.name || '?'} color="#94A3B8" size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{c.name || '—'}</div>
                        <div style={{ fontSize: 10, color: T.text3 }}>
                          {c.email || ''}{c.email && c.phone ? ' · ' : ''}{c.phone || ''}
                          {c.archivedAt && c.archivedAt !== '' && <span style={{ color: '#EF4444' }}> · archivée</span>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* Preview cascade */}
          {secondary && (
            <>
              <SectionHeader>Aperçu de la fusion</SectionHeader>
              {previewLoading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><Spinner /></div>
              ) : preview?.error ? (
                <div style={{ padding: 12, fontSize: 12, color: '#DC2626' }}>Erreur preview : {preview.error}</div>
              ) : preview ? (
                <div style={{ padding: 12, borderRadius: 10, background: '#0EA5E910', border: '1px solid #0EA5E940', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0369A1', marginBottom: 6 }}>
                    🔗 Sera rattaché à la fiche principale
                  </div>
                  <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
                    RDV ({preview.linkedCounts?.bookings || 0}) ·
                    Appels ({preview.linkedCounts?.call_logs || 0}) ·
                    SMS ({preview.linkedCounts?.sms_messages || 0}) ·
                    Conversations ({preview.linkedCounts?.conversations || 0}) ·
                    Pipeline historique ({preview.linkedCounts?.pipeline_history || 0}) ·
                    Documents ({preview.linkedCounts?.contact_documents || 0})
                  </div>
                </div>
              ) : null}
              {notesAppendPreview && (
                <div style={{ padding: 10, borderRadius: 10, background: T.bg, border: `1px solid ${T.border}`, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: 'uppercase', marginBottom: 4 }}>Notes ajoutées sans écrasement</div>
                  <div style={{ fontSize: 11, color: T.text2, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{notesAppendPreview}</div>
                </div>
              )}
              {secondaryArchived && (
                <div style={{ padding: 10, borderRadius: 10, background: '#F59E0B10', border: '1px solid #F59E0B', marginBottom: 12, fontSize: 11, color: '#92400E' }}>
                  ⚠ La fiche absorbée est <strong>archivée</strong>. Ses données seront tout de même rattachées.
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <Btn small onClick={() => { setSecondary(null); setPreview(null); }}>← Changer de fiche</Btn>
                <Btn small onClick={() => setStep(2)} style={{ color: '#fff', background: '#0EA5E9', borderColor: '#0EA5E9' }}>
                  Continuer →
                </Btn>
              </div>
            </>
          )}

          {!secondary && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <Btn small onClick={onClose}>Annuler</Btn>
            </div>
          )}
        </>
      )}

      {step === 2 && secondary && (
        <>
          <div style={{ padding: 14, borderRadius: 10, background: '#DC262618', border: '1.5px solid #DC2626', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 6 }}>
              <I n="alert-triangle" s={14}/> Action irréversible
            </div>
            <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.5 }}>
              La fiche <strong>{secondary.name}</strong> sera <strong>supprimée définitivement</strong>.
              Tous ses RDV, appels, SMS, conversations et historiques seront rattachés à la fiche
              <strong> {primary.name}</strong>. Aucun RDV ne sera supprimé.
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: 'block', marginBottom: 6 }}>
              Tapez <strong>FUSIONNER</strong> pour confirmer :
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              autoFocus
              disabled={submitting}
              placeholder="FUSIONNER"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid ' + (confirmText === 'FUSIONNER' ? '#DC2626' : T.border), background: T.bg, color: T.text, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn small onClick={() => setStep(1)} disabled={submitting}>← Retour</Btn>
            <Btn small
              onClick={handleSubmit}
              disabled={confirmText !== 'FUSIONNER' || submitting}
              style={{ color: '#fff', background: confirmText === 'FUSIONNER' && !submitting ? '#DC2626' : '#DC262660', borderColor: '#DC2626', cursor: confirmText === 'FUSIONNER' && !submitting ? 'pointer' : 'not-allowed' }}
            >
              {submitting ? "Fusion en cours…" : "Fusionner définitivement"}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
};

export default MergeContactsModal;
