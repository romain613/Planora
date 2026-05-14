// FicheInteractionTemplates — V1.10.4-r11.0.15.d
// Aperçu unifié + utilisation inline des interaction-templates (Scripts / Formulaires / Checklists)
// applicables à un contact, partagé entre :
//   - PhoneTab.jsx — onglet Info panel droit Pipeline Live
//   - BookingDetailModal — onglet Contact
//   - FicheContactModal — section Notes
//
// V1.10.4-r11.0.15.c : passage de click→redirect-hub à accordion+ResponseFiller inline.
// V1.10.4-r11.0.15.d : résumé compact pour completed (counts checklist / preview answers
// formulaire / extrait notes script). Click "Terminer" force la fermeture de l'accordéon.
// User clique sur le résumé compact pour rouvrir et modifier.
//
// Règle de visibilité (Phase 1 frontend only, sans backend ciblage) :
//   template.active (truthy : 1/true/"1"/undefined⇒actif par défaut)
//   ET (
//     template.showByDefault truthy (camelCase ou snake_case)
//     OU responseExistsForContact
//   )
//
// Tri : showByDefault DESC, puis updatedAt DESC
// Limite : max=3 par défaut, configurable via prop
//
// Cache TTL : 60s via _T.itpCache (templates) + _T.itpRespCache (responses par contact).
// Invalidation auto après autosave/complete pour rafraîchir badge.

import React, { useState } from "react";
import { T } from "../../../../../theme";
import { I, Btn, Modal } from "../../../../../shared/ui";
import { api } from "../../../../../shared/services/api";
import { _T } from "../../../../../shared/state/tabState";
import { useCollabContext } from "../../../context/CollabContext";
import { ResponseFiller } from "../../../../interactions/InteractionTemplatesPanel";

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

// Parse content_json en content si nécessaire (backend peut renvoyer l'un ou l'autre).
function _normalizeContent(t) {
  if (t.content && typeof t.content === 'object') return t.content;
  if (t.content_json) {
    try { return typeof t.content_json === 'string' ? JSON.parse(t.content_json) : t.content_json; } catch { return {}; }
  }
  return {};
}

// V1.10.4-r11.0.15.d — Résumé compact pour templates completed (accordéon fermé par défaut).
// V1.10.4-r11.0.17 — TOUJOURS rendre qqch (jamais null) pour completed + carte blanche premium.
// Affiche counts/preview courts au lieu des questions completes. Click sur le header rouvre
// l'accordéon pour modification.
function CompactSummary({ T, template, response }) {
  const content = template.content || {};
  const answers = (response && response.answers) || {};

  // Wrapper card style commun : carte blanche premium avec bordure fine + padding + hint modification.
  const cardStyle = {
    padding: '10px 12px',
    fontSize: 11,
    color: T.text2,
    borderTop: '1px solid ' + T.border,
    background: T.card || T.bg,
  };
  const modifyHint = (
    <span style={{ fontSize: 10, color: T.text3, fontStyle: 'italic', whiteSpace: 'nowrap' }}>
      Cliquer pour modifier
    </span>
  );

  if (template.type === 'checklist') {
    const items = content.items || [];
    let validated = 0, refused = 0, neutral = 0;
    items.forEach(it => {
      const v = answers[it.id] || 'neutral';
      if (v === 'validated') validated++;
      else if (v === 'refused') refused++;
      else neutral++;
    });
    // Fallback si content non parseable (items vide) : affiche au moins "Checklist complétée"
    if (items.length === 0) {
      return (
        <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: '#10B981' }}>✓ Checklist complétée</span>
          {modifyHint}
        </div>
      );
    }
    return (
      <div style={{ ...cardStyle, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {validated > 0 && <span style={{ color: '#10B981', fontWeight: 600 }}>✅ {validated} validé{validated > 1 ? 's' : ''}</span>}
        {refused > 0 && <span style={{ color: '#EF4444', fontWeight: 600 }}>❌ {refused} refusé{refused > 1 ? 's' : ''}</span>}
        {neutral > 0 && <span style={{ color: T.text3, fontWeight: 600 }}>⚪ {neutral} neutre{neutral > 1 ? 's' : ''}</span>}
        <span style={{ marginLeft: 'auto' }}>{modifyHint}</span>
      </div>
    );
  }

  if (template.type === 'questionnaire') {
    const fields = content.fields || [];
    const filled = fields.filter(f => {
      const v = answers[f.id];
      return v !== undefined && v !== '' && v !== null && !(Array.isArray(v) && v.length === 0);
    });
    if (filled.length === 0) {
      return (
        <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: '#10B981' }}>✓ Formulaire complété <span style={{ color: T.text3, fontWeight: 400, fontSize: 10 }}>(aucune réponse renseignée)</span></span>
          {modifyHint}
        </div>
      );
    }
    const preview = filled.slice(0, 2).map(f => {
      const v = answers[f.id];
      let valStr;
      if (Array.isArray(v)) valStr = v.join(', ');
      else if (v === 'yes') valStr = 'Oui';
      else if (v === 'no') valStr = 'Non';
      else valStr = String(v);
      if (valStr.length > 50) valStr = valStr.slice(0, 50) + '…';
      return { label: f.label, valStr };
    });
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontWeight: 600, color: '#10B981' }}>✓ Formulaire complété · {filled.length} réponse{filled.length > 1 ? 's' : ''}</span>
          {modifyHint}
        </div>
        {preview.map((p, i) => (
          <div key={i} style={{ fontSize: 10, color: T.text3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 600 }}>{p.label}</span> : {p.valStr}
          </div>
        ))}
        {filled.length > 2 && <div style={{ fontSize: 9, color: T.text3, marginTop: 2, fontStyle: 'italic' }}>+ {filled.length - 2} autre{filled.length - 2 > 1 ? 's' : ''}…</div>}
      </div>
    );
  }

  if (template.type === 'script') {
    const notes = (answers.notes || '').trim();
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: notes ? 4 : 0 }}>
          <span style={{ fontWeight: 600, color: '#10B981' }}>✓ Script consulté{notes ? ' · notes enregistrées' : ''}</span>
          {modifyHint}
        </div>
        {notes && <div style={{ fontSize: 10, color: T.text3, marginTop: 2, fontStyle: 'italic', lineHeight: 1.4 }}>{notes.length > 120 ? notes.slice(0, 120) + '…' : notes}</div>}
      </div>
    );
  }

  // Fallback type inconnu — toujours render qqch pour completed (anti-régression UX)
  return (
    <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontWeight: 600, color: '#10B981' }}>✓ Élément complété</span>
      {modifyHint}
    </div>
  );
}

const FicheInteractionTemplates = ({
  contact,
  // Props legacy conservés pour compatibilité — non utilisés depuis r11.0.15.c (plus de redirect hub)
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
  const { collab, showNotif } = useCollabContext();
  const [, setTick] = useState(0);
  const _rerender = () => setTick(t => t + 1);
  // V1.10.4-r11.0.15.c — accordéon par template (id => bool override). Sans override,
  // le défaut est : ouvert pour notStarted/inProgress, fermé pour completed.
  const [expandedOverride, setExpandedOverride] = useState({});

  const templates = fetchTemplatesIfStale(_rerender);
  const responses = contact?.id ? fetchResponsesIfStale(contact.id, _rerender) : [];

  // Map response par templateId pour lookup O(1)
  const respByTpl = new Map();
  (responses || []).forEach(r => {
    const tid = r.templateId || r.template_id;
    if (tid) respByTpl.set(tid, r);
  });

  // Filtre robuste aux variations de format (r11.0.15.b)
  const _truthy = (v) => v === 1 || v === true || v === '1';
  const _isActive = (t) => {
    if (t.active === undefined || t.active === null) return true;
    return _truthy(t.active);
  };
  const _isShowByDefault = (t) => _truthy(t.showByDefault) || _truthy(t.show_by_default);

  const items = (templates || [])
    .filter(t => {
      if (!t || !_isActive(t)) return false;
      return _isShowByDefault(t) || respByTpl.has(t.id);
    })
    .map(t => {
      const r = respByTpl.get(t.id);
      let status = 'notStarted';
      if (r) status = (r.status === 'completed') ? 'completed' : 'inProgress';
      return { ...t, _status: status, _hasResponse: !!r, _showByDefault: _isShowByDefault(t), _response: r || null };
    })
    .sort((a, b) => {
      const ad = a._showByDefault ? 1 : 0;
      const bd = b._showByDefault ? 1 : 0;
      if (ad !== bd) return bd - ad;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    })
    .slice(0, max);

  if (!items.length) return null;

  const isOpen = (tplId, status) => {
    if (Object.prototype.hasOwnProperty.call(expandedOverride, tplId)) return expandedOverride[tplId];
    return status !== 'completed'; // ouvert par défaut sauf complété
  };
  const toggle = (tplId, status) => {
    const cur = isOpen(tplId, status);
    setExpandedOverride(prev => ({ ...prev, [tplId]: !cur }));
  };

  // Invalide cache responses-by-contact après autosave/complete pour refresh badge.
  const invalidateRespCache = () => {
    if (_T.itpRespCacheAt && contact?.id) {
      _T.itpRespCacheAt[contact.id] = 0;
    }
  };
  const handleSaved = () => {
    invalidateRespCache();
    _rerender();
  };
  // V1.10.4-r11.0.15.d — Complete handler : invalide cache + force fermeture accordéon
  // pour ce template (l'override remplace tout default). User clique sur le résumé compact
  // pour rouvrir et modifier.
  const handleCompletedFor = (tplId) => {
    invalidateRespCache();
    setExpandedOverride(prev => ({ ...prev, [tplId]: false }));
    _rerender();
  };
  // pushNotification wrapper utilise par ResponseFiller inline.
  const _pushNotif = (titleStr, detail, type) => {
    if (typeof showNotif === 'function') showNotif(detail || titleStr, type === 'error' ? 'danger' : type);
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
        const open = isOpen(t.id, t._status);
        return (
          <div
            key={t.id}
            style={{marginBottom:6,borderRadius:8,border:'1px solid '+T.border,overflow:'hidden',background:T.bg,transition:'border-color .15s'}}
          >
            {/* Header accordéon — toujours visible */}
            <div
              onClick={() => toggle(t.id, t._status)}
              title={open ? 'Replier' : 'Déplier'}
              style={{display:'flex',alignItems:'center',gap:6,padding:'7px 9px',cursor:'pointer',transition:'all .12s'}}
              onMouseEnter={e=>{ e.currentTarget.style.background = meta.color + '08'; }}
              onMouseLeave={e=>{ e.currentTarget.style.background = 'transparent'; }}
            >
              <I n={open ? 'chevron-down' : 'chevron-right'} s={10} style={{color:T.text3,flexShrink:0}}/>
              <I n={meta.icon} s={11} style={{color:meta.color,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0,fontSize:11,fontWeight:600,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.title || 'Sans titre'}</div>
              {t._showByDefault && <span title="Global — affiché sur toutes les fiches" style={{fontSize:7,fontWeight:700,padding:'1px 5px',borderRadius:3,background:'#64748B12',color:'#64748B',border:'1px solid #64748B25',flexShrink:0,letterSpacing:0.3}}>GLOBAL</span>}
              {t._hasResponse && <span title="Réponse existante pour ce contact" style={{fontSize:7,fontWeight:700,padding:'1px 5px',borderRadius:3,background:meta.color+'15',color:meta.color,flexShrink:0,letterSpacing:0.3}}>REPONSE</span>}
              <span style={{fontSize:8,fontWeight:700,padding:'2px 6px',borderRadius:4,background:status.bg,color:status.color,flexShrink:0}}>{status.label}</span>
            </div>

            {/* V1.10.4-r11.0.15.d — Si completed ET fermé : résumé compact (counts/preview).
                Sinon si ouvert : ResponseFiller inline (édition complète). */}
            {!open && t._status === 'completed' && (
              <CompactSummary T={T} template={{ ...t, content: _normalizeContent(t) }} response={t._response}/>
            )}
            {open && contact?.id && (
              <div style={{borderTop:'1px solid '+T.border, padding:'8px 10px', background:T.card}}>
                <ResponseFiller
                  inline={true}
                  T={T} I={I} Btn={Btn} Modal={Modal}
                  template={{ ...t, content: _normalizeContent(t) }}
                  response={t._response}
                  contactId={contact.id}
                  collaboratorId={collab?.id || ''}
                  onSaved={handleSaved}
                  onCompleted={() => handleCompletedFor(t.id)}
                  onClose={() => toggle(t.id, t._status)}
                  pushNotification={_pushNotif}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default FicheInteractionTemplates;
