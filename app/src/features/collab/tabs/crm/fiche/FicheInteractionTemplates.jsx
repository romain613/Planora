// FicheInteractionTemplates — V1.10.4-r11.0.15
// Aperçu compact unifié des interaction-templates (Scripts / Formulaires / Checklists)
// applicables à un contact, partagé entre :
//   - PhoneTab.jsx — onglet Info panel droit Pipeline Live
//   - BookingDetailModal — onglet Contact
//   - FicheContactModal — section Notes
//
// Règle de visibilité (Phase 1 frontend only, sans backend ciblage) :
//   template.active === 1
//   ET (
//     template.showByDefault === 1
//     OU responseExistsForContact (le contact a déjà une interaction-response)
//   )
//
// Tri : showByDefault DESC, puis updatedAt DESC
// Limite : max=3 par défaut, configurable via prop
//
// Cache TTL : 60s via _T.itpCache (templates) + _T.itpRespCache (responses par contact)
// Invalidation manuelle via _T.itpCache=null déclenchable depuis le hub Scripts top-bar
// (wrapper pushNotification dans PhoneTab L7240).

import React, { useState } from "react";
import { T } from "../../../../../theme";
import { I } from "../../../../../shared/ui";
import { api } from "../../../../../shared/services/api";
import { _T } from "../../../../../shared/state/tabState";

const CACHE_TTL_MS = 60_000;

const TYPE_META = {
  script:        { icon: 'file-text',    label: 'Script',     color: '#7C3AED' },
  questionnaire: { icon: 'help-circle',  label: 'Formulaire', color: '#0EA5E9' },
  checklist:     { icon: 'check-square', label: 'Checklist',  color: '#22C55E' },
};

const STATUS_META = {
  notStarted: { label: 'À remplir', color: '#F59E0B', bg: '#F59E0B15' },
  inProgress: { label: 'Commencé',  color: '#3B82F6', bg: '#3B82F615' },
  completed:  { label: 'Complété',  color: '#22C55E', bg: '#22C55E15' },
};

function fetchTemplatesIfStale(onLoaded) {
  const now = Date.now();
  const fresh = _T.itpCache && _T.itpCacheAt && (now - _T.itpCacheAt) < CACHE_TTL_MS;
  if (!fresh && !_T.itpLoading) {
    _T.itpLoading = true;
    api('/api/interaction-templates').then(d => {
      _T.itpCache = Array.isArray(d) ? d : [];
      _T.itpCacheAt = Date.now();
      _T.itpLoading = false;
      if (typeof onLoaded === 'function') onLoaded();
    }).catch(() => {
      _T.itpCache = [];
      _T.itpCacheAt = Date.now();
      _T.itpLoading = false;
      if (typeof onLoaded === 'function') onLoaded();
    });
  }
  return _T.itpCache || [];
}

function fetchResponsesIfStale(contactId, onLoaded) {
  if (!contactId) return [];
  _T.itpRespCache = _T.itpRespCache || {};
  _T.itpRespCacheAt = _T.itpRespCacheAt || {};
  _T.itpRespLoading = _T.itpRespLoading || {};
  const now = Date.now();
  const fresh = _T.itpRespCache[contactId] && _T.itpRespCacheAt[contactId] && (now - _T.itpRespCacheAt[contactId]) < CACHE_TTL_MS;
  if (!fresh && !_T.itpRespLoading[contactId]) {
    _T.itpRespLoading[contactId] = true;
    api('/api/interaction-responses/by-contact/' + contactId).then(d => {
      _T.itpRespCache[contactId] = Array.isArray(d) ? d : [];
      _T.itpRespCacheAt[contactId] = Date.now();
      _T.itpRespLoading[contactId] = false;
      if (typeof onLoaded === 'function') onLoaded();
    }).catch(() => {
      _T.itpRespCache[contactId] = [];
      _T.itpRespCacheAt[contactId] = Date.now();
      _T.itpRespLoading[contactId] = false;
      if (typeof onLoaded === 'function') onLoaded();
    });
  }
  return _T.itpRespCache[contactId] || [];
}

const FicheInteractionTemplates = ({
  contact,
  setPhoneSubTab,
  setPortalTab,
  setPipelineRightContact,
  setSelectedBooking,
  setBookingDetailTab,
  setSelectedCrmContact,
  setCollabFicheTab,
  max = 3,
  title = 'Scripts · Checklists · Formulaires',
}) => {
  const [, setTick] = useState(0);
  const _rerender = () => setTick(t => t + 1);

  const templates = fetchTemplatesIfStale(_rerender);
  const responses = contact?.id ? fetchResponsesIfStale(contact.id, _rerender) : [];

  // Map response par templateId pour lookup O(1)
  const respByTpl = new Map();
  (responses || []).forEach(r => {
    const tid = r.templateId || r.template_id;
    if (tid) respByTpl.set(tid, r);
  });

  // V1.10.4-r11.0.15.b — Filtre ROBUSTE aux variations de format :
  // - active : 1 / true / "1" / absent (undefined => actif par defaut, coherent schema DEFAULT 1)
  // - showByDefault : 1 / true / "1" / camelCase OU snake_case (show_by_default)
  const _truthy = (v) => v === 1 || v === true || v === '1';
  const _isActive = (t) => {
    if (t.active === undefined || t.active === null) return true; // absent => actif
    return _truthy(t.active);
  };
  const _isShowByDefault = (t) => _truthy(t.showByDefault) || _truthy(t.show_by_default);

  // Filtre + tri + limite
  const items = (templates || [])
    .filter(t => {
      if (!t || !_isActive(t)) return false;
      return _isShowByDefault(t) || respByTpl.has(t.id);
    })
    .map(t => {
      const r = respByTpl.get(t.id);
      let status = 'notStarted';
      if (r) status = (r.status === 'completed') ? 'completed' : 'inProgress';
      return { ...t, _status: status, _hasResponse: !!r, _showByDefault: _isShowByDefault(t) };
    })
    .sort((a, b) => {
      const ad = a._showByDefault ? 1 : 0;
      const bd = b._showByDefault ? 1 : 0;
      if (ad !== bd) return bd - ad;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    })
    .slice(0, max);

  if (!items.length) return null;

  // Navigation vers le hub Scripts top-bar avec contexte contact si possible
  const openHub = () => {
    // 1. Si on est dans une modal (BookingDetailModal ou FicheContactModal), la fermer
    if (typeof setSelectedBooking === 'function') setSelectedBooking(null);
    if (typeof setBookingDetailTab === 'function') setBookingDetailTab('rdv');
    if (typeof setSelectedCrmContact === 'function') setSelectedCrmContact(null);
    if (typeof setCollabFicheTab === 'function') setCollabFicheTab('notes');
    // 2. Forcer le contact ciblé pour le hub (banner "POUR CE CONTACT")
    if (typeof setPipelineRightContact === 'function' && contact?.id) setPipelineRightContact(contact);
    // 3. Naviguer vers Pipeline Live + hub Scripts
    if (typeof setPortalTab === 'function') setPortalTab('phone');
    if (typeof setPhoneSubTab === 'function') setPhoneSubTab('scripts');
  };

  return (
    <div style={{marginTop:10}}>
      <div style={{fontSize:10,fontWeight:700,color:T.text3,marginBottom:6,display:'flex',alignItems:'center',gap:4}}>
        <I n="layers" s={10}/> {title}
        <span style={{marginLeft:'auto',fontSize:9,color:T.text3,fontWeight:500}}>{items.length}{items.length===max?'+':''}</span>
      </div>
      {items.map(t => {
        const meta = TYPE_META[t.type] || TYPE_META.script;
        const status = STATUS_META[t._status] || STATUS_META.notStarted;
        return (
          <div
            key={t.id}
            onClick={openHub}
            title={'Ouvrir dans Scripts — ' + (t.title || '')}
            style={{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',borderRadius:8,marginBottom:4,background:T.bg,border:'1px solid '+T.border,cursor:'pointer',transition:'all .15s'}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor = meta.color + '55'; e.currentTarget.style.background = meta.color + '08';}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.bg;}}
          >
            <I n={meta.icon} s={11} style={{color:meta.color,flexShrink:0}}/>
            <div style={{flex:1,minWidth:0,fontSize:11,fontWeight:600,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.title || 'Sans titre'}</div>
            {t._showByDefault && <span title="Global — affiché sur toutes les fiches" style={{fontSize:7,fontWeight:700,padding:'1px 5px',borderRadius:3,background:'#64748B12',color:'#64748B',border:'1px solid #64748B25',flexShrink:0,letterSpacing:0.3}}>GLOBAL</span>}
            {t._hasResponse && <span title="Réponse existante pour ce contact" style={{fontSize:7,fontWeight:700,padding:'1px 5px',borderRadius:3,background:meta.color+'15',color:meta.color,flexShrink:0,letterSpacing:0.3}}>REPONSE</span>}
            <span style={{fontSize:8,fontWeight:700,padding:'2px 6px',borderRadius:4,background:status.bg,color:status.color,flexShrink:0}}>{status.label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default FicheInteractionTemplates;
