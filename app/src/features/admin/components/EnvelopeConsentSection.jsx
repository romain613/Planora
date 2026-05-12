// ═══════════════════════════════════════════════════════════════════════
// EnvelopeConsentSection — Phase 4
// Section "Approbation démarchage téléphonique" dans le détail enveloppe.
// Self-contained : api helper + inline styles. Aucune dépendance shared/brand.
// ═══════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import { api } from "../../../shared/services/api";

const ACCENT = "#16A34A";
const DANGER = "#DC2626";
const WARN = "#F59E0B";
const BORDER = "#E2E8F0";
const TEXT = "#111827";
const TEXT2 = "#64748B";

const DEFAULT_SMS_TEMPLATE = 'Bonjour{firstName}, {companyName} souhaite obtenir votre accord pour vous contacter par telephone. Confirmez ou refusez ici : {url} (STOP au numero pour ne plus recevoir).';

export default function EnvelopeConsentSection({ envelopeId, envelopeName, companyId, isAdmin }) {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [stats, setStats] = useState(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [form, setForm] = useState({ telemarketingApprovalEnabled: false, consentSmsTemplate: '', consentTextVersion: 'v1.0-2026-05', consentExpireDays: 30 });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [lastSendResult, setLastSendResult] = useState(null);
  const [notice, setNotice] = useState(null); // {type:'success'|'error', message}

  function notify(type, message, ttl = 4000) {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), ttl);
  }

  async function loadAll() {
    setLoading(true);
    const [pv, st] = await Promise.all([
      api(`/api/envelopes/${envelopeId}/consent/preview`),
      api(`/api/envelopes/${envelopeId}/consent/stats`),
    ]);
    if (pv && !pv.error) {
      setPreview(pv);
      setForm({
        telemarketingApprovalEnabled: !!pv.telemarketingApprovalEnabled,
        consentSmsTemplate: pv.consentSmsTemplate || DEFAULT_SMS_TEMPLATE,
        consentTextVersion: pv.consentTextVersion || 'v1.0-2026-05',
        consentExpireDays: pv.consentExpireDays || 30,
      });
    }
    if (st && !st.error) setStats(st);
    setLoading(false);
  }

  useEffect(() => { if (envelopeId) loadAll(); }, [envelopeId]);

  async function toggleConsent(newVal) {
    setSaving(true);
    const r = await api(`/api/envelopes/${envelopeId}/consent/toggle`, { method: 'POST', body: { enabled: newVal } });
    setSaving(false);
    if (r?.success) { notify('success', newVal ? 'Consentement activé pour cette enveloppe' : 'Consentement désactivé'); loadAll(); }
    else notify('error', r?.error || 'Erreur toggle');
  }

  async function saveSettings() {
    setSaving(true);
    const r = await api(`/api/envelopes/${envelopeId}/consent/settings`, { method: 'PUT', body: {
      consentSmsTemplate: form.consentSmsTemplate,
      consentTextVersion: form.consentTextVersion,
      consentExpireDays: form.consentExpireDays,
    }});
    setSaving(false);
    if (r?.success) { notify('success', 'Paramètres consentement enregistrés'); setEditingSettings(false); loadAll(); }
    else notify('error', r?.error || 'Erreur sauvegarde');
  }

  async function sendCampaign() {
    setSending(true);
    const r = await api(`/api/envelopes/${envelopeId}/consent/campaign/send`, { method: 'POST', body: { confirm: true } });
    setSending(false);
    setShowSendModal(false);
    setLastSendResult(r);
    if (r?.success) { notify('success', `Campagne envoyée : ${r.sent} SMS / ${r.total} (${r.failed} échecs)`, 8000); loadAll(); }
    else notify('error', r?.error || 'Erreur envoi campagne');
  }

  if (loading) {
    return <div style={{ padding: 20, color: TEXT2, fontSize: 13 }}>Chargement section consentement…</div>;
  }

  if (!preview) {
    return <div style={{ padding: 20, color: DANGER, fontSize: 13 }}>Erreur chargement section consentement.</div>;
  }

  const enabled = preview.telemarketingApprovalEnabled;
  const counts = preview.counts || {};
  const callable = stats?.counts?.callable || 0;

  return (
    <div style={{ marginTop: 20, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>📞</span> Approbation démarchage téléphonique
          </div>
          <div style={{ fontSize: 12, color: TEXT2, marginTop: 2 }}>
            Recueillir le consentement RGPD par SMS avant de pouvoir appeler.
          </div>
        </div>
        {isAdmin && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: saving ? 'wait' : 'pointer' }}>
            <input type="checkbox" checked={enabled} disabled={saving}
              onChange={e => toggleConsent(e.target.checked)}
              style={{ width: 18, height: 18, cursor: saving ? 'wait' : 'pointer' }}/>
            <span style={{ fontSize: 13, fontWeight: 600, color: enabled ? ACCENT : TEXT2 }}>
              {enabled ? 'Activé' : 'Désactivé'}
            </span>
          </label>
        )}
      </div>

      {!enabled && (
        <div style={{ padding: 14, background: '#F8FAFC', borderRadius: 8, fontSize: 12, color: TEXT2 }}>
          Le workflow d'enveloppe reste classique. Aucun SMS envoyé, aucun coût, aucune restriction d'appel.
          Activez l'approbation pour exiger un consentement avant chaque appel sur cette enveloppe.
        </div>
      )}

      {enabled && (
        <>
          {/* Settings block */}
          <div style={{ marginTop: 16, padding: 14, background: '#F8FAFC', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Paramètres campagne</div>
              {isAdmin && (
                <button onClick={() => setEditingSettings(!editingSettings)}
                  style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: '#fff', fontSize: 12, cursor: 'pointer' }}>
                  {editingSettings ? 'Annuler' : 'Modifier'}
                </button>
              )}
            </div>
            {!editingSettings ? (
              <div style={{ fontSize: 12, color: TEXT2, lineHeight: 1.7 }}>
                <div><b>Template SMS :</b> <code style={{ fontSize: 11, background: '#fff', padding: '2px 6px', borderRadius: 4 }}>{form.consentSmsTemplate.slice(0, 100)}{form.consentSmsTemplate.length > 100 ? '…' : ''}</code></div>
                <div><b>Version texte légal :</b> {form.consentTextVersion}</div>
                <div><b>Durée d'expiration du lien :</b> {form.consentExpireDays} jours</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: TEXT2 }}>
                  Template SMS (placeholders : <code>{'{firstName}'}</code>, <code>{'{companyName}'}</code>, <code>{'{url}'}</code>)
                  <textarea value={form.consentSmsTemplate} onChange={e => setForm({...form, consentSmsTemplate: e.target.value})}
                    rows={3} maxLength={500}
                    style={{ padding: 10, borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }}/>
                  <span style={{ fontSize: 11, color: TEXT2 }}>{form.consentSmsTemplate.length}/500 caractères</span>
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: TEXT2 }}>
                    Version texte légal
                    <input value={form.consentTextVersion} onChange={e => setForm({...form, consentTextVersion: e.target.value})}
                      maxLength={32} style={{ padding: 8, borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12 }}/>
                  </label>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: TEXT2 }}>
                    Durée d'expiration (jours)
                    <input type="number" min={1} max={180} value={form.consentExpireDays}
                      onChange={e => setForm({...form, consentExpireDays: parseInt(e.target.value, 10) || 30})}
                      style={{ padding: 8, borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12 }}/>
                  </label>
                </div>
                <button onClick={saveSettings} disabled={saving}
                  style={{ alignSelf: 'flex-start', padding: '8px 16px', borderRadius: 6, background: ACCENT, color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                  {saving ? 'Sauvegarde…' : 'Enregistrer'}
                </button>
              </div>
            )}
          </div>

          {/* Preview block */}
          <div style={{ marginTop: 16, padding: 14, background: '#FFFBEB', border: `1px solid ${WARN}33`, borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 10 }}>Aperçu campagne</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              <KPI label="Total leads" value={counts.total ?? 0}/>
              <KPI label="Numéros valides" value={counts.withValidPhone ?? 0}/>
              <KPI label="Éligibles SMS" value={counts.eligibleForSend ?? 0} accent={ACCENT}/>
              <KPI label="Déjà validés" value={counts.validated ?? 0}/>
              <KPI label="Déjà refusés" value={counts.refused ?? 0}/>
              <KPI label="Pending / sms_sent" value={(counts.pending || 0) + (counts.sms_sent || 0)}/>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${WARN}33`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 13, color: TEXT }}>
                <b>Crédits SMS :</b> {preview.smsCreditsAvailable} disponibles, <b>{preview.smsCreditsRequired}</b> requis
                {preview.smsCreditsAvailable < preview.smsCreditsRequired && (
                  <span style={{ color: DANGER, marginLeft: 8, fontWeight: 700 }}>⚠ insuffisant</span>
                )}
              </div>
              {isAdmin && (
                <button onClick={() => setShowSendModal(true)}
                  disabled={!preview.canSend || sending}
                  style={{ padding: '10px 18px', borderRadius: 8, background: preview.canSend ? ACCENT : '#94A3B8', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: preview.canSend ? 'pointer' : 'not-allowed' }}>
                  {sending ? 'Envoi en cours…' : `📤 Envoyer les demandes (${preview.smsCreditsRequired} SMS)`}
                </button>
              )}
            </div>
            {preview.warnings?.length > 0 && (
              <div style={{ marginTop: 10, padding: 10, background: '#FFEDD5', borderRadius: 6, fontSize: 11, color: '#7C2D12' }}>
                {preview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
          </div>

          {/* Stats block */}
          {stats && (
            <div style={{ marginTop: 16, padding: 14, background: '#F8FAFC', borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 10 }}>📊 Statistiques consentement</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                <KPI label="SMS envoyés" value={counts.sms_sent || 0} icon="🟠"/>
                <KPI label="Cliqués" value={counts.clicked || 0} icon="🟡"/>
                <KPI label="Validés" value={counts.validated || 0} icon="🟢" accent={ACCENT}/>
                <KPI label="Refusés" value={counts.refused || 0} icon="🔴"/>
                <KPI label="Révoqués" value={counts.revoked || 0} icon="🔴"/>
                <KPI label="Expirés" value={counts.expired || 0} icon="⚫"/>
                <KPI label="Callable" value={callable} icon="📞" accent={ACCENT}/>
                <KPI label="Taux validation" value={`${((stats.rates?.validationRate || 0) * 100).toFixed(1)}%`}/>
              </div>
              {stats.campaigns?.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TEXT2, marginBottom: 6 }}>Historique des campagnes</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {stats.campaigns.slice(0, 5).map(c => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#fff', borderRadius: 6, fontSize: 11 }}>
                        <span><b>{c.name}</b> — {c.status}</span>
                        <span>{c.smsSentCount}/{c.totalLeads} SMS · {new Date(c.startedAt).toLocaleDateString('fr-FR')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Last send result */}
      {lastSendResult?.success && (
        <div style={{ marginTop: 12, padding: 10, background: '#D1FAE5', borderRadius: 8, fontSize: 12, color: '#065F46' }}>
          ✓ Campagne <code>{lastSendResult.campaignId}</code> — {lastSendResult.sent}/{lastSendResult.total} SMS envoyés ({lastSendResult.failed} échecs)
        </div>
      )}

      {/* Confirm send modal */}
      {showSendModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 460, width: '100%' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 8 }}>Confirmer l'envoi groupé</div>
            <div style={{ fontSize: 13, color: TEXT2, marginBottom: 14, lineHeight: 1.55 }}>
              <b>{preview.smsCreditsRequired}</b> SMS seront envoyés à <b>{preview.counts.eligibleForSend}</b> leads de l'enveloppe « <b>{envelopeName || preview.envelopeName}</b> ».
              <br/><br/>
              Crédits SMS après envoi : <b>{preview.smsCreditsAvailable - preview.smsCreditsRequired}</b>.
              <br/>
              Le lien SMS sera valable {form.consentExpireDays} jours.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSendModal(false)} disabled={sending}
                style={{ padding: '10px 18px', borderRadius: 8, background: '#fff', color: TEXT, border: `1px solid ${BORDER}`, fontSize: 13, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={sendCampaign} disabled={sending}
                style={{ padding: '10px 18px', borderRadius: 8, background: ACCENT, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: sending ? 'wait' : 'pointer' }}>
                {sending ? 'Envoi…' : 'Confirmer l\'envoi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline notice */}
      {notice && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, padding: '12px 18px', borderRadius: 8,
          background: notice.type === 'success' ? '#D1FAE5' : '#FEE2E2',
          color: notice.type === 'success' ? '#065F46' : '#7F1D1D',
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10000 }}>
          {notice.message}
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, icon, accent }) {
  return (
    <div style={{ padding: '10px 12px', background: '#fff', borderRadius: 8, border: `1px solid ${BORDER}` }}>
      <div style={{ fontSize: 10, color: TEXT2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{icon ? icon + ' ' : ''}{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent || TEXT, marginTop: 2 }}>{value}</div>
    </div>
  );
}
