// PostCallResultModal — V3.x post-call smart pipeline (refonte UX SaaS premium)
// Popup déclenchée après appel décroché >= 10s (sauf NRP — voir NrpPostCallModal).
// Stages dynamiques résolus par usePipelineResolved (PIPELINE_STAGES via context),
// triés par usage récent du collab (GET /api/stats/collab/:id/pipeline-top).
// "+ voir plus" reveal autres stages. "Autre" = note libre sans changement pipeline.
// Click stage → handleCollabUpdateContact + PUT /api/voip/calls/:id pipelineAction + toast.
//
// V3.x.1 refonte UX :
// - Top 4 → jusqu'à 6 stages
// - Icônes par stage (Lucide via <I/> avec fallback emoji custom)
// - SaaS premium : radius 14, hover scale 1.03, active scale 0.97, transition .12s
// - Hiérarchie visuelle : top plus gros + grid responsive 2-3 cols, autres plus discrets
// - Accordéon : "+ Voir les autres options" / "Masquer les options" + chevron animé
// - Bouton Autre : border dashed + ✏️ + hover
// - Micro-copy "Choisis rapidement le résultat de ton appel"
// - Badge "Recommandé" sur le 1er top stage (plus utilisé)

import React, { useState, useEffect, useMemo } from "react";
import { T } from "../../../theme";
import { I, Btn, Modal } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

const FALLBACK_TOP_STAGES = ['qualifie', 'rdv_programme', 'nrp', 'callback'];
const MAX_TOP = 6;

const fmtDuration = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// Mapping iconographique par id stage. <I/> Lucide en priorité, emoji fallback en string.
// Si stage custom (id non listé) → fallback générique 'circle' (icône Lucide neutre).
const STAGE_ICON_MAP = {
  rdv_programme:  { lucide: 'calendar',          emoji: '📅' },
  qualifie:       { lucide: 'star',              emoji: '⭐' },
  interesse:      { lucide: 'flame',             emoji: '🔥' },
  contacte:       { lucide: 'message-circle',    emoji: '📞' },
  en_discussion:  { lucide: 'message-circle',    emoji: '📞' },
  nrp:            { lucide: 'phone-missed',      emoji: '❌' },
  perdu:          { lucide: 'x-circle',          emoji: '🔴' },
  client_valide:  { lucide: 'check-circle',      emoji: '🟢' },
  gagne:          { lucide: 'trophy',            emoji: '🟢' },
  callback:       { lucide: 'phone-forwarded',   emoji: '🔁' },
  not_interested: { lucide: 'thumbs-down',       emoji: '👎' },
  voicemail:      { lucide: 'voicemail',         emoji: '📩' },
  no_answer:      { lucide: 'phone-missed',      emoji: '🔕' },
};

const getStageVisual = (stageId) => STAGE_ICON_MAP[stageId] || { lucide: 'circle', emoji: '•' };

const PostCallResultModal = ({ data, onClose }) => {
  const { collab, company, PIPELINE_STAGES, handleCollabUpdateContact, showNotif } = useCollabContext();
  const [showAll, setShowAll] = useState(false);
  const [otherMode, setOtherMode] = useState(false);
  const [otherNote, setOtherNote] = useState('');
  const [topStageIds, setTopStageIds] = useState(FALLBACK_TOP_STAGES);
  const [submitting, setSubmitting] = useState(false);
  const [showNrpHistory, setShowNrpHistory] = useState(false);

  const {
    contact, duration, callLogId,
    isNrp = false, isShortCall = false,
    nrpCount = 0, followups = [],
  } = data || {};
  const nrpHistory = (followups || []).filter(f => f && f.done).slice().reverse();

  // Fetch top stages utilisés par collab (last 30j, jusqu'à 6)
  useEffect(() => {
    if (!collab?.id) return;
    api(`/api/stats/collab/${collab.id}/pipeline-top?days=30&limit=${MAX_TOP}`)
      .then(r => {
        if (Array.isArray(r?.topStages) && r.topStages.length > 0) setTopStageIds(r.topStages);
      })
      .catch(() => { /* fallback déjà set */ });
  }, [collab?.id]);

  // Filter 'nouveau' (brief MH) + enrich avec metadata stage du pipeline résolu
  const allStages = useMemo(
    () => (Array.isArray(PIPELINE_STAGES) ? PIPELINE_STAGES : []).filter(s => s.id !== 'nouveau'),
    [PIPELINE_STAGES]
  );

  // Top stages — intersection topStageIds avec stages réellement présents (R3 mitigation)
  // Limite 3-6 selon disponible, MAX 6.
  const topStagesObj = useMemo(
    () => topStageIds
      .map(id => allStages.find(s => s.id === id))
      .filter(Boolean)
      .slice(0, MAX_TOP),
    [topStageIds, allStages]
  );

  const otherStages = useMemo(
    () => allStages.filter(s => !topStagesObj.find(t => t.id === s.id)),
    [allStages, topStagesObj]
  );

  const handleSelectStage = async (stage) => {
    if (submitting || !contact?.id) return;
    setSubmitting(true);
    try {
      // V1.10.4-r9 NRP-merge — si contact déjà NRP ET stage choisi = nrp,
      // incrémente nrp_followups_json (NRP #N+1) au lieu d'un simple changement de stage.
      if (isNrp && stage.id === 'nrp') {
        const nextCount = nrpCount + 1;
        const newFollowup = {
          date: new Date().toISOString(),
          done: true,
          note: 'Tentative appel #' + nextCount + ' — pas de reponse',
        };
        const updatedFollowups = [...followups, newFollowup];
        handleCollabUpdateContact(contact.id, {
          nrp_followups_json: JSON.stringify(updatedFollowups),
          _source: 'post_call',
          _origin: 'post_call_smart_pipeline_nrp_increment',
          _reason: `NRP #${nextCount} (${fmtDuration(duration || 0)})`,
        });
        api('/api/data/pipeline-history', {
          method: 'POST',
          body: {
            contactId: contact.id,
            companyId: company?.id || contact.companyId,
            fromStage: 'nrp',
            toStage: 'nrp',
            userId: collab?.id || '',
            userName: collab?.name || '',
            note: 'Tentative appel #' + nextCount + ' — NRP (pas de reponse)',
          },
        }).catch(() => {});
        if (callLogId) {
          api(`/api/voip/calls/${callLogId}`, {
            method: 'PUT',
            body: { pipelineAction: 'nrp' },
          }).catch(() => {});
        }
        showNotif?.(`NRP #${nextCount} enregistré`, 'warning');
        onClose?.();
        return;
      }

      // Cas standard : changement de stage normal.
      // Note enrichie si le contact était NRP et a répondu (autre stage que nrp).
      const enrichedReason = (isNrp && stage.id !== 'nrp')
        ? `A répondu après ${nrpCount} tentatives NRP (${fmtDuration(duration || 0)})`
        : `Résultat appel (${fmtDuration(duration || 0)})`;
      handleCollabUpdateContact(contact.id, {
        pipeline_stage: stage.id,
        _source: 'post_call',
        _origin: 'post_call_smart_pipeline',
        _reason: enrichedReason,
      });
      if (callLogId) {
        api(`/api/voip/calls/${callLogId}`, {
          method: 'PUT',
          body: { pipelineAction: stage.id }
        }).catch(() => {});
      }
      showNotif?.(`Pipeline → ${stage.label || stage.id}`, 'success');
      onClose?.();
    } catch (err) {
      showNotif?.('Erreur update : ' + (err?.message || ''), 'danger');
      setSubmitting(false);
    }
  };

  const handleSubmitOther = async () => {
    const note = otherNote.trim();
    if (!note || submitting || !contact?.id) return;
    setSubmitting(true);
    try {
      await api('/api/data/pipeline-history', {
        method: 'POST',
        body: {
          contactId: contact.id,
          companyId: company?.id || contact.companyId,
          fromStage: contact.pipeline_stage || '',
          toStage: contact.pipeline_stage || '',
          userId: collab?.id || '',
          userName: collab?.name || '',
          note: 'Post-call: ' + note
        }
      }).catch(() => {});
      if (callLogId) {
        api(`/api/voip/calls/${callLogId}`, {
          method: 'PUT',
          body: { pipelineAction: 'other:' + note.slice(0, 50) }
        }).catch(() => {});
      }
      showNotif?.('Note post-call enregistrée');
      onClose?.();
    } catch (err) {
      showNotif?.('Erreur : ' + (err?.message || ''), 'danger');
      setSubmitting(false);
    }
  };

  if (!data?.contact) return null;

  // Petit helper render icône stage : <I/> Lucide si possible, sinon emoji fallback en span
  const StageIcon = ({ stageId, size = 18, color }) => {
    const v = getStageVisual(stageId);
    // Lucide name attendu — composant <I/> ignore noms inconnus silencieusement,
    // donc on sécurise : si on n'est pas sûr du Lucide, fallback emoji direct.
    // Heuristique : tout stage custom (id pas dans STAGE_ICON_MAP) → emoji fallback.
    if (STAGE_ICON_MAP[stageId]) {
      return <I n={v.lucide} s={size} style={{ color: color || 'currentColor' }} />;
    }
    return <span style={{ fontSize: Math.max(14, size - 2), lineHeight: 1 }}>{v.emoji}</span>;
  };

  // V1.10.4-r9 — Progress NRP visuelle (0 → 20 tentatives)
  const nrpProgress = isNrp ? Math.min((nrpCount / 20) * 100, 100) : 0;
  const nrpProgressColor = nrpProgress > 75 ? '#EF4444' : nrpProgress > 50 ? '#F59E0B' : '#3B82F6';

  return (
    <Modal open={true} onClose={onClose} title={null} width={560}>
      {/* Header — titre + sub-line contact/durée + badge NRP si applicable */}
      <div style={{ marginBottom: 6 }}>
        <h3 style={{
          fontSize: 17, fontWeight: 800, margin: 0, color: T.text,
          display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap'
        }}>
          <I n="phone-call" s={18} /> Résultat de l'appel
          {isNrp && (
            <span style={{
              fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8,
              background: '#EF4444', color: '#fff', letterSpacing: 0.3
            }}>
              NRP #{nrpCount}
            </span>
          )}
        </h3>
        <div style={{ fontSize: 12, color: T.text3, marginTop: 4, fontWeight: 500 }}>
          {contact.name || '(sans nom)'} · {fmtDuration(duration || 0)}
        </div>
        {/* V1.10.4-r9 — Barre de progression NRP */}
        {isNrp && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 5, borderRadius: 3, background: T.border + '50', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, width: nrpProgress + '%',
                background: nrpProgressColor, transition: 'width .4s ease'
              }} />
            </div>
            <div style={{ fontSize: 10, color: T.text3, marginTop: 3 }}>
              {nrpCount} tentative{nrpCount > 1 ? 's' : ''} sans réponse · clic sur "NRP" ajoute une #{nrpCount + 1}
            </div>
          </div>
        )}
        {/* V1.10.4-r9 — Bandeau "appel court" */}
        {isShortCall && (
          <div style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 10,
            background: '#F59E0B12', border: '1px solid #F59E0B30',
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <I n="zap" s={14} style={{ color: '#F59E0B' }} />
            <span style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>
              Appel très court ({duration || 0}s) — probablement pas de réponse
            </span>
          </div>
        )}
      </div>

      {/* Micro-copy */}
      <div style={{
        fontSize: 12, color: T.text3, fontStyle: 'italic',
        marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${T.border}40`
      }}>
        Choisis rapidement le résultat de ton appel
      </div>

      {!otherMode && (
        <>
          {/* Top stages (3-6) — boutons SaaS premium hiérarchisés */}
          {topStagesObj.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(${topStagesObj.length <= 3 ? '160px' : '140px'}, 1fr))`,
              gap: 10,
              marginBottom: 14
            }}>
              {topStagesObj.map((s, idx) => {
                const color = s.color || T.accent;
                const isRecommended = idx === 0; // Bonus : 1er = stage le plus utilisé
                return (
                  <button
                    key={s.id}
                    onClick={() => handleSelectStage(s)}
                    disabled={submitting}
                    style={{
                      position: 'relative',
                      padding: '14px 12px',
                      borderRadius: 14,
                      border: `1.5px solid ${color}40`,
                      background: color + '12',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      transition: 'all .12s ease',
                      fontFamily: 'inherit',
                      opacity: submitting ? 0.5 : 1,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 6,
                      minHeight: 78
                    }}
                    onMouseEnter={e => {
                      if (submitting) return;
                      e.currentTarget.style.background = color + '22';
                      e.currentTarget.style.borderColor = color + '70';
                      e.currentTarget.style.transform = 'scale(1.03)';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${color}25`;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = color + '12';
                      e.currentTarget.style.borderColor = color + '40';
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                    }}
                    onMouseDown={e => { if (!submitting) e.currentTarget.style.transform = 'scale(0.97)'; }}
                    onMouseUp={e => { if (!submitting) e.currentTarget.style.transform = 'scale(1.03)'; }}
                  >
                    {isRecommended && topStagesObj.length > 1 && (
                      <span style={{
                        position: 'absolute', top: -7, right: 8,
                        fontSize: 9, fontWeight: 700,
                        padding: '2px 7px', borderRadius: 8,
                        background: color, color: '#fff',
                        letterSpacing: 0.3, textTransform: 'uppercase',
                        boxShadow: `0 2px 6px ${color}55`
                      }}>
                        Recommandé
                      </span>
                    )}
                    <StageIcon stageId={s.id} size={22} color={color} />
                    <div style={{
                      fontSize: 13, fontWeight: 700, color, textAlign: 'center',
                      lineHeight: 1.2
                    }}>
                      {s.label || s.id}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Accordéon "Voir les autres options" */}
          {otherStages.length > 0 && (
            <>
              <button
                onClick={() => setShowAll(s => !s)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: showAll ? T.accentBg : T.bg,
                  border: `1px solid ${showAll ? T.accent + '60' : T.border}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: showAll ? T.accent : T.text2,
                  marginBottom: 10,
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all .15s ease'
                }}
              >
                <span style={{
                  display: 'inline-flex',
                  transition: 'transform .2s ease',
                  transform: showAll ? 'rotate(180deg)' : 'rotate(0deg)'
                }}>
                  <I n="chevron-down" s={13} />
                </span>
                {showAll ? 'Masquer les options' : '+ Voir les autres options'}
              </button>

              {showAll && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                  gap: 6,
                  marginBottom: 12
                }}>
                  {otherStages.map(s => {
                    const color = s.color || T.text2;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleSelectStage(s)}
                        disabled={submitting}
                        style={{
                          padding: '9px 8px',
                          borderRadius: 10,
                          border: `1px solid ${T.border}`,
                          background: T.bg,
                          cursor: submitting ? 'not-allowed' : 'pointer',
                          transition: 'all .12s ease',
                          fontFamily: 'inherit',
                          opacity: submitting ? 0.5 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 5
                        }}
                        onMouseEnter={e => {
                          if (submitting) return;
                          e.currentTarget.style.background = color + '10';
                          e.currentTarget.style.borderColor = color + '50';
                          e.currentTarget.style.transform = 'scale(1.02)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = T.bg;
                          e.currentTarget.style.borderColor = T.border;
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        onMouseDown={e => { if (!submitting) e.currentTarget.style.transform = 'scale(0.97)'; }}
                        onMouseUp={e => { if (!submitting) e.currentTarget.style.transform = 'scale(1.02)'; }}
                      >
                        <StageIcon stageId={s.id} size={12} color={color} />
                        <span style={{
                          fontSize: 11, fontWeight: 600, color,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        }}>
                          {s.label || s.id}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Bouton "Autre" — note libre */}
          <button
            onClick={() => setOtherMode(true)}
            disabled={submitting}
            style={{
              width: '100%',
              padding: '12px 14px',
              background: T.bg,
              border: `2px dashed ${T.border}`,
              borderRadius: 12,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: T.text2,
              marginTop: 6,
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all .15s ease'
            }}
            onMouseEnter={e => {
              if (submitting) return;
              e.currentTarget.style.background = T.accentBg;
              e.currentTarget.style.borderColor = T.accent;
              e.currentTarget.style.color = T.accent;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = T.bg;
              e.currentTarget.style.borderColor = T.border;
              e.currentTarget.style.color = T.text2;
            }}
          >
            <span style={{ fontSize: 13 }}>✏️</span>
            Autre — ajouter une note libre
          </button>

          {/* V1.10.4-r9 — Historique NRP (révélable, uniquement si déjà NRP avec tentatives) */}
          {isNrp && nrpHistory.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}40` }}>
              <button
                onClick={() => setShowNrpHistory(s => !s)}
                style={{
                  width: '100%', padding: '7px 12px',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  color: T.text3, textTransform: 'uppercase', letterSpacing: 0.5,
                  display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit'
                }}
              >
                <I n="clock" s={12} />
                Historique NRP ({nrpHistory.length} tentative{nrpHistory.length > 1 ? 's' : ''})
                <span style={{ marginLeft: 'auto', display: 'inline-flex', transition: 'transform .2s ease', transform: showNrpHistory ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <I n="chevron-down" s={12} />
                </span>
              </button>
              {showNrpHistory && (
                <div style={{ maxHeight: 180, overflow: 'auto', marginTop: 6 }}>
                  {nrpHistory.map((f, i) => {
                    const d = f.date ? new Date(f.date) : null;
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px', marginBottom: 4, borderRadius: 8,
                        background: '#EF444408', border: '1px solid #EF444418'
                      }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: 7, background: '#EF444418',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 800, color: '#EF4444'
                        }}>
                          {nrpHistory.length - i}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>
                            {f.note || 'NRP #' + (nrpHistory.length - i)}
                          </div>
                          {d && (
                            <div style={{ fontSize: 10, color: T.text3 }}>
                              {d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>
                        <I n="phone-missed" s={12} style={{ color: '#EF4444' }} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Other mode — input note libre */}
      {otherMode && (
        <div>
          <label style={{
            fontSize: 12, fontWeight: 600, color: T.text2,
            display: 'block', marginBottom: 6
          }}>
            Note libre (sans changement de pipeline)
          </label>
          <textarea
            value={otherNote}
            onChange={e => setOtherNote(e.target.value)}
            placeholder="Décris brièvement le résultat de l'échange..."
            rows={4}
            autoFocus
            style={{
              width: '100%',
              padding: 11,
              borderRadius: 10,
              border: `1.5px solid ${T.border}`,
              background: T.bg,
              color: T.text,
              fontSize: 13,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              resize: 'vertical',
              marginBottom: 10,
              transition: 'border-color .15s ease'
            }}
            onFocus={e => e.currentTarget.style.borderColor = T.accent}
            onBlur={e => e.currentTarget.style.borderColor = T.border}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn small onClick={() => { setOtherMode(false); setOtherNote(''); }} style={{ flex: 1, justifyContent: 'center' }}>
              <I n="arrow-left" s={11} /> Retour
            </Btn>
            <Btn
              small
              primary
              onClick={handleSubmitOther}
              disabled={!otherNote.trim() || submitting}
              style={{ flex: 1, justifyContent: 'center', opacity: (!otherNote.trim() || submitting) ? 0.5 : 1 }}
            >
              <I n="check" s={11} /> Enregistrer
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default PostCallResultModal;
