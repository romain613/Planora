// RightPanelCommandCenter.jsx — V1.10.4-r11.0.21 Phase 1
//
// Empty state colonne droite du panel Pipeline Live (PhoneTab) quand AUCUN contact
// selectionne (pipelineRightContact === null + pas d'active call + pas de call detail
// + pas de multi-select). Cockpit commercial premium minimaliste.
//
// Phase 1 (4 blocs ouverts par defaut) :
// 1. Action recommandee (meilleur contact a actionner maintenant)
// 2. Priorites du jour (4 lignes compactes cliquables)
// 3. File a traiter (max 5 contacts)
// 4. Actions rapides (grid 2x2)
//
// Phases 2 (Objectifs/Equipe/Alertes) + Phase 3 (Dynamique) reservees GO MH ulterieur.

import React, { useMemo } from "react";
import { T } from "../../../theme";
import { I } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const RightPanelCommandCenter = () => {
  const ctx = useCollabContext();
  const {
    contacts,
    bookings,
    collab,
    showNotif,
    setPipelineRightContact,
    setPhoneRightTab,
    setPhoneSubTab,
    setPhoneScheduleForm,
    setPhoneShowScheduleModal,
    setPortalTab,
    startPhoneCall,
    prefillKeypad,
  } = ctx || {};

  const today = new Date().toISOString().split("T")[0];

  // ── Computed data (memoized on contacts/bookings/collab.id) ──
  const data = useMemo(() => {
    const all = Array.isArray(contacts) ? contacts : [];
    const bks = Array.isArray(bookings) ? bookings : [];
    const mine = all.filter(c => c && c.assignedTo === collab?.id);

    // Score chaque contact pour priorisation
    const scored = mine
      .filter(c => c.pipeline_stage !== 'client_valide' && c.pipeline_stage !== 'perdu' && c.pipeline_stage !== 'rdv_programme')
      .map(c => {
        let score = 0;
        if (c.pipeline_stage === 'qualifie') score += 50;
        else if (c.pipeline_stage === 'contacte') score += 30;
        else if (c.pipeline_stage === 'nrp') score += 20;
        else score += 10;
        if (c.rating) score += (c.rating || 0) * 5;
        const lastTouched = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
        if (lastTouched) {
          const daysAgo = (Date.now() - lastTouched) / 86400000;
          if (daysAgo >= 2 && daysAgo <= 14) score += 20;
          if (daysAgo > 14) score -= 5;
        }
        return { c, score };
      })
      .sort((a, z) => z.score - a.score);

    const topAction = scored[0]?.c || null;
    const fileATraiter = scored.slice(0, 5).map(s => s.c);

    // Priorites du jour
    const myIds = new Set(mine.map(c => c.id));
    const rdvAConfirmer = bks.filter(b => b && b.status === 'pending' && b.contactId && myIds.has(b.contactId)).length;

    const relancesEnAttente = mine.filter(c => {
      if (c.pipeline_stage !== 'nrp') return false;
      try {
        const fu = JSON.parse(c.nrp_followups_json || '[]');
        return fu.some(f => !f.done && (f.date || '') <= today);
      } catch { return false; }
    }).length;

    const prospectsChauds = mine.filter(c => c.pipeline_stage === 'qualifie' && (c.rating || 0) >= 3).length;

    const rdvAujourdhui = bks.filter(b => b && b.status === 'confirmed' && b.date === today && b.contactId && myIds.has(b.contactId)).length;

    return { topAction, fileATraiter, rdvAConfirmer, relancesEnAttente, prospectsChauds, rdvAujourdhui };
  }, [contacts, bookings, collab?.id, today]);

  // ── Action helpers ──
  const handleOpenContact = (ct) => {
    if (!ct) return;
    if (typeof setPipelineRightContact === 'function') setPipelineRightContact(ct);
    if (typeof setPhoneRightTab === 'function') setPhoneRightTab('fiche');
  };

  const handleCall = (ct) => {
    if (!ct) return;
    const num = ct.phone || ct.mobile || '';
    if (!num) { showNotif && showNotif('Aucun numéro pour ce contact', 'danger'); return; }
    if (typeof startPhoneCall === 'function') startPhoneCall(num, ct.id);
  };

  const handleSMS = (ct) => {
    if (!ct) return;
    if (typeof prefillKeypad === 'function') prefillKeypad(ct.phone || ct.mobile || '', { skipNav: true });
    if (typeof setPhoneRightTab === 'function') setPhoneRightTab('sms');
  };

  const handleRDV = (ct) => {
    if (!ct) return;
    if (typeof setPhoneScheduleForm !== 'function') return;
    setPhoneScheduleForm({
      contactId: ct.id, contactName: ct.name, number: ct.phone || ct.mobile || '',
      date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      time: '10:00', duration: 30, notes: '', _bookingMode: true,
    });
    if (typeof setPhoneShowScheduleModal === 'function') setPhoneShowScheduleModal(true);
  };

  // ── Styles ──
  const sectionStyle = {
    padding: 12,
    marginBottom: 8,
    borderRadius: 10,
    background: T.surface,
    border: `1px solid ${T.border}`,
  };

  const sectionTitleStyle = {
    fontSize: 9,
    fontWeight: 700,
    color: T.text3,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 8,
  };

  const ctaInlineStyle = (color) => ({
    flex: 1,
    padding: '5px 8px',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 600,
    background: (color || T.accent) + '0F',
    color: color || T.accent,
    border: `1px solid ${(color || T.accent)}25`,
    textAlign: 'center',
    transition: 'all .12s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  });

  const tag = (() => {
    const s = data.topAction?.pipeline_stage || '';
    if (s === 'qualifie') return { label: 'Warm', color: '#7C3AED' };
    if (s === 'nrp') return { label: 'NRP', color: '#EF4444' };
    if (s === 'contacte') return { label: 'En discussion', color: '#F59E0B' };
    return { label: 'Nouveau', color: '#2563EB' };
  })();

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 10px', display: 'flex', flexDirection: 'column' }}>

      {/* Header minimaliste */}
      <div style={{ marginBottom: 10, padding: '0 4px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
          <I n="zap" s={14} style={{ color: T.accent }} />
          Command Center
        </div>
        <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>
          Sélectionnez un contact ou agissez ci-dessous
        </div>
      </div>

      {/* 1. Action recommandée */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>🎯 Action recommandée</div>
        {data.topAction ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: tag.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 800, color: tag.color }}>
                {(data.topAction.name || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Appeler {data.topAction.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 3, background: tag.color }} />
                  <span style={{ fontSize: 9, color: tag.color, fontWeight: 600 }}>{tag.label}</span>
                  {data.topAction.rating > 0 && <span style={{ fontSize: 9, color: '#F59E0B' }}>{'★'.repeat(Math.min(5, data.topAction.rating))}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <div onClick={() => handleCall(data.topAction)} style={ctaInlineStyle('#22C55E')} title="Appeler maintenant"><I n="phone" s={10}/>Appeler</div>
              <div onClick={() => handleSMS(data.topAction)} style={ctaInlineStyle('#0EA5E9')} title="Envoyer SMS"><I n="message-square" s={10}/>SMS</div>
              <div onClick={() => handleOpenContact(data.topAction)} style={ctaInlineStyle('#8B5CF6')} title="Voir fiche"><I n="user" s={10}/>Fiche</div>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: T.text3, textAlign: 'center', padding: '12px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <I n="check-circle" s={20} style={{ color: '#22C55E', opacity: 0.5 }} />
            <span>Tout est à jour.</span>
            <span style={{ fontSize: 9 }}>Aucune action urgente.</span>
          </div>
        )}
      </div>

      {/* 2. Priorités du jour */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>📊 Priorités du jour</div>
        {[
          { dot: '#EF4444', label: 'RDV à confirmer', count: data.rdvAConfirmer, cta: 'Voir', action: () => { setPortalTab && setPortalTab('agenda'); } },
          { dot: '#F59E0B', label: 'relances en attente', count: data.relancesEnAttente, cta: 'Relancer', action: () => { setPortalTab && setPortalTab('phone'); setPhoneSubTab && setPhoneSubTab('pipeline'); } },
          { dot: '#22C55E', label: 'prospects chauds', count: data.prospectsChauds, cta: 'Appeler', action: () => { setPortalTab && setPortalTab('phone'); setPhoneSubTab && setPhoneSubTab('pipeline'); } },
          { dot: '#0EA5E9', label: "RDV aujourd'hui", count: data.rdvAujourdhui, cta: 'Agenda', action: () => { setPortalTab && setPortalTab('agenda'); } },
        ].map((p, i) => {
          const active = p.count > 0;
          return (
            <div key={i} onClick={active ? p.action : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', borderRadius: 6, cursor: active ? 'pointer' : 'default', opacity: active ? 1 : 0.45, transition: 'background .12s' }}
              onMouseEnter={e => { if (active) e.currentTarget.style.background = T.bg; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: p.dot, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, color: T.text }}>
                <strong style={{ color: active ? T.text : T.text3, fontWeight: 700 }}>{p.count}</strong> {p.label}
              </span>
              <span style={{ fontSize: 10, color: active ? T.accent : T.text3, fontWeight: 600 }}>{active ? `${p.cta} →` : ''}</span>
            </div>
          );
        })}
      </div>

      {/* 3. File à traiter */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>📥 À traiter ({data.fileATraiter.length})</div>
        {data.fileATraiter.length === 0 ? (
          <div style={{ fontSize: 11, color: T.text3, textAlign: 'center', padding: '8px 4px' }}>
            Aucun contact à traiter.
          </div>
        ) : (
          data.fileATraiter.map(c => (
            <div key={c.id} onClick={() => handleOpenContact(c)} style={{ padding: 7, borderRadius: 8, marginBottom: 4, cursor: 'pointer', background: T.bg, border: `1px solid ${T.border}`, transition: 'all .12s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent + '40'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 700, color: T.accent }}>
                  {(c.name || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 9, color: T.text3 }}>
                    {c.pipeline_stage === 'qualifie' ? 'Warm' : c.pipeline_stage === 'nrp' ? 'NRP — à relancer' : c.pipeline_stage === 'contacte' ? 'En discussion' : 'Nouveau'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                <div onClick={() => handleCall(c)} style={{ ...ctaInlineStyle('#22C55E'), padding: '3px 6px', fontSize: 9 }} title="Appeler"><I n="phone" s={9}/></div>
                <div onClick={() => handleSMS(c)} style={{ ...ctaInlineStyle('#0EA5E9'), padding: '3px 6px', fontSize: 9 }} title="SMS"><I n="message-square" s={9}/></div>
                <div onClick={() => handleRDV(c)} style={{ ...ctaInlineStyle('#F59E0B'), padding: '3px 6px', fontSize: 9 }} title="RDV"><I n="calendar-plus" s={9}/></div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 4. Actions rapides */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>⚡ Actions rapides</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { label: '+ Contact', icon: 'user-plus', color: '#7C3AED', action: () => { setPortalTab && setPortalTab('crm'); showNotif && showNotif('Créer un contact depuis CRM', 'info'); } },
            { label: '+ RDV', icon: 'calendar-plus', color: '#F59E0B', action: () => { if (typeof setPhoneScheduleForm === 'function') { setPhoneScheduleForm({ contactId: '', contactName: '', number: '', date: new Date(Date.now()+86400000).toISOString().split('T')[0], time: '10:00', duration: 30, notes: '', _bookingMode: true }); setPhoneShowScheduleModal && setPhoneShowScheduleModal(true); } } },
            { label: '+ Rappel', icon: 'bell', color: '#0EA5E9', action: () => { setPortalTab && setPortalTab('home'); showNotif && showNotif('Liste des rappels', 'info'); } },
            { label: '+ Note', icon: 'edit-3', color: '#22C55E', action: () => { setPortalTab && setPortalTab('crm'); showNotif && showNotif('Sélectionnez un contact pour ajouter une note', 'info'); } },
          ].map((a, i) => (
            <div key={i} onClick={a.action} style={{ padding: '10px 8px', borderRadius: 8, cursor: 'pointer', background: a.color + '0F', border: `1px solid ${a.color}25`, color: a.color, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all .12s' }}
              onMouseEnter={e => { e.currentTarget.style.background = a.color + '20'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = a.color + '0F'; e.currentTarget.style.transform = 'translateY(0)'; }}>
              <I n={a.icon} s={12}/>{a.label}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default RightPanelCommandCenter;
