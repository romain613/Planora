// ═══════════════════════════════════════════════════════════════════════
// ConsentForm — Page publique consentement téléphonique (Phase 3)
// Route: /consent/:token (no auth, miroir ManageBooking.jsx)
// ═══════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import { api } from "../../shared/services/api";
import { Logo } from "../../shared/ui";
// Note: useBrand intentionally not imported — Phase 3 reste découplé du système brand
// (présent en local Mac mais absent du VPS prod — desync hors scope Phase 3, à traiter séparément).
// Fallback hardcodé "Calendar360" plus bas.

const ACCENT = "#16A34A";   // green = trust / consent
const DANGER = "#DC2626";   // red   = refuse / revoke

const ConsentForm = ({ token }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null); // null | {status: 'validated'|'refused'}
  const brand = { name: 'Calendar360' }; // Phase 3 : fallback statique (cf. note import)

  useEffect(() => {
    api(`/api/consent/${encodeURIComponent(token)}`)
      .then(d => {
        if (d?.error) { setErrorCode(d.error); setLoading(false); return; }
        setData(d);
        if (d.alreadyResponded) setDone({ status: d.responseStatus });
        setLoading(false);
      })
      .catch(() => { setErrorCode('NETWORK_ERROR'); setLoading(false); });
  }, [token]);

  const handleDecision = async (decision /* 'accept' | 'refuse' */) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await api(`/api/consent/${encodeURIComponent(token)}/${decision}`, { method: 'POST', body: {} });
      if (r?.error) {
        setErrorCode(r.error);
        setSubmitting(false);
        return;
      }
      setDone({ status: r.status });
    } catch {
      setErrorCode('NETWORK_ERROR');
    }
    setSubmitting(false);
  };

  // ─── Loading ────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:"#F8FAFC", gap:16 }}>
      <Logo s={48} rounded={12}/>
      <div style={{ width:28, height:28, border:"3px solid #E2E8F0", borderTopColor:ACCENT, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ─── Error states ───────────────────────────────────────────────────
  if (errorCode) {
    const errorMessages = {
      'CONSENT_TOKEN_INVALID':   { title: "Lien invalide", desc: "Ce lien de consentement n'est pas valide." },
      'CONSENT_TOKEN_EXPIRED':   { title: "Lien expiré", desc: "Ce lien a dépassé sa durée de validité." },
      'CONSENT_TOKEN_NOT_FOUND': { title: "Lien introuvable", desc: "Ce lien n'existe pas ou a été retiré." },
      'CONSENT_ALREADY_USED':    { title: "Déjà répondu", desc: "Vous avez déjà répondu à cette demande." },
      'CONSENT_RATE_LIMIT':      { title: "Trop de tentatives", desc: "Veuillez patienter une minute avant de réessayer." },
      'CONSENT_CONTEXT_MISSING': { title: "Contexte introuvable", desc: "Les données associées sont introuvables." },
      'CONSENT_PHONE_MISMATCH':  { title: "Incohérence détectée", desc: "Ce lien ne correspond pas au bon numéro." },
      'NETWORK_ERROR':           { title: "Connexion impossible", desc: "Vérifiez votre connexion et réessayez." },
    };
    const e = errorMessages[errorCode] || { title: "Erreur", desc: "Une erreur est survenue." };
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:"#F8FAFC", gap:14, padding:24 }}>
        <Logo s={48} rounded={12}/>
        <div style={{ fontSize:20, fontWeight:700, color:"#111", textAlign:"center" }}>{e.title}</div>
        <div style={{ fontSize:14, color:"#64748B", textAlign:"center", maxWidth:380 }}>{e.desc}</div>
        <div style={{ marginTop:14, fontSize:11, color:"#94A3B8" }}>Propulsé par <span style={{ color:ACCENT, fontWeight:600 }}>{brand?.name || 'Calendar360'}</span></div>
      </div>
    );
  }

  if (!data) return null;

  // ─── Done state (after accept or refuse) ────────────────────────────
  if (done) {
    const isValidated = done.status === 'validated';
    return (
      <div style={{ minHeight:"100vh", background:"#F8FAFC", display:"flex", flexDirection:"column", alignItems:"center" }}>
        <div style={{ padding:"14px 24px", background:"#fff", borderBottom:"1px solid #E2E8F0", width:"100%", display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:ACCENT+"14", display:"flex", alignItems:"center", justifyContent:"center", color:ACCENT, fontWeight:800, fontSize:15 }}>{data.companyName?.[0]}</div>
          <span style={{ fontSize:15, fontWeight:700 }}>{data.companyName}</span>
        </div>
        <div style={{ maxWidth:480, width:"100%", padding:"48px 20px", textAlign:"center" }}>
          <div style={{ width:72, height:72, borderRadius:"50%", background: isValidated ? "#D1FAE5" : "#FEE2E2", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px", fontSize:36 }}>
            {isValidated ? "✓" : "✕"}
          </div>
          <div style={{ fontSize:22, fontWeight:800, color:"#111", marginBottom:10 }}>
            {isValidated ? "Consentement enregistré" : "Refus enregistré"}
          </div>
          <div style={{ fontSize:14, color:"#64748B", lineHeight:1.55, marginBottom:8 }}>
            {isValidated
              ? <>Merci. <b>{data.companyName}</b> pourra vous contacter par téléphone au numéro indiqué.<br/>Vous pouvez retirer votre consentement à tout moment en répondant STOP par SMS.</>
              : <>Votre refus est enregistré. <b>{data.companyName}</b> ne vous démarchera pas par téléphone via ce lien.</>
            }
          </div>
          <div style={{ marginTop:20, fontSize:11, color:"#94A3B8" }}>
            Preuve archivée — version texte légal : <code style={{ fontSize:11 }}>{data.legalVersion}</code>
          </div>
          <div style={{ marginTop:24, fontSize:11, color:"#94A3B8" }}>Propulsé par <span style={{ color:ACCENT, fontWeight:600 }}>{brand?.name || 'Calendar360'}</span></div>
        </div>
      </div>
    );
  }

  // ─── Main form ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#F8FAFC", display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <div style={{ padding:"14px 24px", background:"#fff", borderBottom:"1px solid #E2E8F0", display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:ACCENT+"14", display:"flex", alignItems:"center", justifyContent:"center", color:ACCENT, fontWeight:800, fontSize:15 }}>{data.companyName?.[0]}</div>
        <span style={{ fontSize:15, fontWeight:700 }}>{data.companyName}</span>
      </div>

      <div style={{ flex:1, display:"flex", justifyContent:"center", padding:"24px 16px 40px" }}>
        <div style={{ maxWidth:540, width:"100%" }}>
          <div style={{ fontSize:24, fontWeight:800, color:"#111", marginBottom:6 }}>Démarchage téléphonique</div>
          <div style={{ fontSize:14, color:"#64748B", marginBottom:18 }}>
            <b>{data.companyName}</b> souhaite obtenir votre accord pour vous contacter par téléphone.
          </div>

          {/* Phone card */}
          <div style={{ background:"#fff", borderRadius:14, border:"1px solid #E2E8F0", padding:"18px 22px", marginBottom:18, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize:11, color:"#64748B", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>Numéro concerné</div>
            <div style={{ fontSize:22, fontWeight:700, color:"#111", fontFamily:"ui-monospace, SFMono-Regular, monospace" }}>{data.phoneMasked}</div>
          </div>

          {/* Legal text */}
          <div style={{ background:"#fff", borderRadius:14, border:"1px solid #E2E8F0", padding:"22px 24px", marginBottom:22, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#111", marginBottom:12, textTransform:"uppercase", letterSpacing:0.5 }}>Information légale</div>
            <div style={{ fontSize:13.5, color:"#334155", lineHeight:1.65, whiteSpace:"pre-wrap" }}>{data.legalText}</div>
            <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid #F1F5F9", fontSize:11, color:"#94A3B8" }}>
              Version texte légal : <code style={{ fontSize:11 }}>{data.legalVersion}</code> · Lien valable jusqu'au {new Date(data.expiresAt).toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" })}
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
            <button
              onClick={() => handleDecision('accept')}
              disabled={submitting}
              style={{ flex:1, minWidth:200, padding:"16px 22px", borderRadius:12, background:ACCENT, color:"#fff", fontSize:15, fontWeight:700, border:"none", cursor:submitting?"wait":"pointer", boxShadow:`0 1px 2px ${ACCENT}33`, opacity:submitting?0.6:1 }}
            >
              ✓ J'accepte d'être contacté
            </button>
            <button
              onClick={() => handleDecision('refuse')}
              disabled={submitting}
              style={{ flex:1, minWidth:200, padding:"16px 22px", borderRadius:12, background:"#fff", color:DANGER, fontSize:15, fontWeight:700, border:`1.5px solid ${DANGER}`, cursor:submitting?"wait":"pointer", opacity:submitting?0.6:1 }}
            >
              ✕ Je refuse
            </button>
          </div>

          <div style={{ marginTop:24, fontSize:11, color:"#94A3B8", textAlign:"center" }}>
            Propulsé par <span style={{ color:ACCENT, fontWeight:600 }}>{brand?.name || 'Calendar360'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsentForm;
