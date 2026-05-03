// DuplicateMatchCard — V1.13.1.b
// Sous-composant de DuplicateOnCreateModal : affiche UN match (fiche existante)
// avec diff visuel + actions conditionnelles. Aucune mutation directe — toutes
// les actions passent par des callbacks props. Composant "dumb" pur.
//
// Props :
//   match          : shape check-duplicate-single (id, name, email, phone, assignedTo,
//                    assignedName, sharedWith[], pipelineStage, createdAt, matchedBy)
//   fullTarget     : optionnel — données complètes contact depuis contacts state local
//                    (permet diff enrich sur tous les champs ; absent si owner étranger)
//   pendingContact : snapshot du formulaire NewContact (name, email, phone, etc.)
//   collab         : current logged-in collaborator
//   onEnrich       : (matchId, payload) => void — callback "Compléter cette fiche"
//   onShare        : (matchId) => void          — callback "Me partager"
//   onArchive      : (matchId) => void          — V1.13.1.d wires (undefined V1.13.1.b)
//   onHardDelete   : (target) => void           — V1.13.1.d wires (undefined V1.13.1.b)
//   onDelete       : (target) => void           — V1.13.2.a "Supprimer cette fiche" (soft archive owner)
//
// Pas de modification destructive : si callback absent, bouton caché.
// Pas de fusion automatique. Pas d'écrasement.

import React, { useState } from "react";
import { T } from "../../../theme";
import { I, Btn, Avatar } from "../../../shared/ui";

// ─── Helpers ──────────────────────────────────────────────────────────────
const isEmpty = (v) => v === null || v === undefined || String(v).trim() === '';

const ENRICHABLE_FIELDS = [
  { key: 'email',     label: 'Email',     icon: 'mail' },
  { key: 'phone',     label: 'Téléphone', icon: 'phone' },
  { key: 'mobile',    label: 'Mobile',    icon: 'smartphone' },
  { key: 'firstname', label: 'Prénom',    icon: 'user' },
  { key: 'lastname',  label: 'Nom',       icon: 'user' },
  { key: 'company',   label: 'Société',   icon: 'building-2' },
  { key: 'website',   label: 'Site web',  icon: 'globe' },
  { key: 'siret',     label: 'SIRET',     icon: 'hash' },
  { key: 'address',   label: 'Adresse',   icon: 'map-pin' },
];

const _stageColor = (stage) => {
  const colors = { nouveau:'#3B82F6', contacte:'#8B5CF6', qualifie:'#F59E0B', rdv_programme:'#10B981', nrp:'#EF4444', client_valide:'#22C55E', perdu:'#64748B' };
  return colors[stage] || T.text3;
};

const _fmtDate = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('fr-FR'); } catch { return ''; }
};

const _matchedByLabel = (m) =>
  m === 'email' ? { txt: 'Même email', icon: 'mail', color: '#2563EB' } :
  m === 'phone' ? { txt: 'Même téléphone', icon: 'phone', color: '#22C55E' } :
  { txt: '', icon: '', color: '#94A3B8' };

// Calcule le payload PUT /:id à envoyer au backend (champs vides target uniquement)
// Exporté pour réutilisation par parent (V1.13.1.d)
export const computeEnrichPayload = (target, snapshot) => {
  const payload = {};
  ENRICHABLE_FIELDS.forEach(f => {
    if (isEmpty(target[f.key]) && !isEmpty(snapshot[f.key])) {
      payload[f.key] = snapshot[f.key];
    }
  });
  // Tags : merge union (Q2 = jamais d'écrasement)
  const existingTags = Array.isArray(target.tags) ? target.tags : [];
  const newTags = (Array.isArray(snapshot.tags) ? snapshot.tags : []).filter(t => !existingTags.includes(t));
  if (newTags.length) payload.tags = [...existingTags, ...newTags];
  // Notes : append \n---\n (Q2 séparateur préserve historique)
  if (snapshot.notes && String(snapshot.notes).trim()) {
    payload.notes = target.notes ? target.notes + '\n---\n' + snapshot.notes : snapshot.notes;
  }
  // Audit trail
  payload._origin = 'duplicate_resolution';
  payload._source = 'enrich_existing';
  return payload;
};

// Calcule preview affichage (uniquement les champs ajoutés)
const computeEnrichPreview = (target, snapshot) => {
  const additions = [];
  ENRICHABLE_FIELDS.forEach(f => {
    if (isEmpty(target[f.key]) && !isEmpty(snapshot[f.key])) {
      additions.push({ ...f, value: snapshot[f.key] });
    }
  });
  const existingTags = Array.isArray(target.tags) ? target.tags : [];
  const newTags = (Array.isArray(snapshot.tags) ? snapshot.tags : []).filter(t => !existingTags.includes(t));
  if (newTags.length) additions.push({ key: 'tags', label: 'Tags', icon: 'tag', value: newTags.join(', ') });
  if (snapshot.notes && String(snapshot.notes).trim()) {
    additions.push({ key: 'notes', label: 'Note', icon: 'file-text', value: snapshot.notes });
  }
  return additions;
};

// ─── Composant ────────────────────────────────────────────────────────────
const DuplicateMatchCard = ({
  match,
  fullTarget,
  pendingContact,
  collab,
  onEnrich,
  onShare,
  onArchive,
  onHardDelete,
  onCreateMyOwn,
  onDelete,
}) => {
  const [expanded, setExpanded] = useState(false);
  const target = fullTarget || match;
  const ml = _matchedByLabel(match.matchedBy);
  const snap = pendingContact || {};

  const enrichPreview = computeEnrichPreview(target, snap);
  const canEnrich = enrichPreview.length > 0;

  // Ownership detection
  const isOwner = target.assignedTo === collab?.id;
  const sharedArr = Array.isArray(target.sharedWith) ? target.sharedWith :
                    Array.isArray(target.shared_with) ? target.shared_with : [];
  const isShared = sharedArr.includes(collab?.id);
  const isOtherCollab = !isOwner && !isShared && !!target.assignedTo;

  // Permissions
  const isAdmin = collab?.role === 'admin' || collab?.role === 'supra';
  const canSoftDelete = isAdmin || !!collab?.can_delete_contacts;
  const canHardDeletePerm = isAdmin || !!collab?.can_hard_delete_contacts;
  const isArchived = !!(target.archivedAt && target.archivedAt !== '');

  const handleEnrichClick = () => {
    if (!canEnrich || !onEnrich) return;
    onEnrich(target.id, computeEnrichPayload(target, snap));
  };

  return (
    <div style={{ padding:14, borderRadius:12, border:`2px solid ${ml.color}40`, background:T.surface, marginBottom:10 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <Avatar name={target.name||'?'} color={ml.color} size={36}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:T.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{target.name}</div>
          <div style={{ fontSize:10, color:T.text3, display:'flex', gap:6, flexWrap:'wrap' }}>
            {target.assignedName ? <span>👤 {target.assignedName}</span> : (target.assignedTo ? <span>👤 ID:{String(target.assignedTo).slice(0,10)}</span> : <span style={{color:'#F59E0B'}}>⚠ Sans propriétaire</span>)}
            {target.createdAt && <span>· Créé le {_fmtDate(target.createdAt)}</span>}
            {(target.pipelineStage || target.pipeline_stage) && <span style={{color:_stageColor(target.pipelineStage||target.pipeline_stage), fontWeight:600}}>● {target.pipelineStage||target.pipeline_stage}</span>}
          </div>
        </div>
        <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, background:ml.color+'18', color:ml.color, whiteSpace:'nowrap' }}>
          <I n={ml.icon} s={10}/> {ml.txt}
        </span>
      </div>

      {/* Owner étranger banner */}
      {isOtherCollab && (
        <div style={{ padding:'8px 12px', borderRadius:8, background:'#7C3AED10', border:'1px solid #7C3AED40', marginBottom:10, fontSize:11, color:'#7C3AED' }}>
          👥 Cette fiche appartient à <strong>{target.assignedName || target.assignedTo}</strong>. Demandez le partage pour la compléter.
        </div>
      )}

      {/* Enrich preview (visible uniquement si peut enrich) */}
      {!isOtherCollab && canEnrich && (
        <div style={{ padding:10, borderRadius:8, background:'#22C55E10', border:'1px solid #22C55E40', marginBottom:10 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#16A34A', marginBottom:4 }}>
            ✨ {enrichPreview.length} champ{enrichPreview.length>1?'s':''} sera{enrichPreview.length>1?'nt':''} ajouté{enrichPreview.length>1?'s':''} sans écrasement
          </div>
          <div style={{ fontSize:10, color:T.text2, lineHeight:1.6 }}>
            {enrichPreview.map(a => (
              <div key={a.key}><I n={a.icon} s={10}/> <strong>{a.label}</strong> : {String(a.value).slice(0,60)}{String(a.value).length>60?'…':''}</div>
            ))}
          </div>
        </div>
      )}

      {/* "Tout est rempli" si pas d'enrich possible */}
      {!isOtherCollab && !canEnrich && (
        <div style={{ padding:8, borderRadius:8, background:T.bg, border:`1px solid ${T.border}`, marginBottom:10, fontSize:11, color:T.text3 }}>
          ℹ Tous les champs saisis sont déjà présents (rien à ajouter).
        </div>
      )}

      {/* Voir détails (expand inline) */}
      {expanded && (
        <div style={{ padding:10, borderRadius:8, background:T.bg, border:`1px solid ${T.border}`, marginBottom:10, fontSize:11, color:T.text2, lineHeight:1.7 }}>
          <div style={{ fontSize:10, fontWeight:700, color:T.text3, textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>Fiche existante</div>
          {ENRICHABLE_FIELDS.map(f => {
            const v = target[f.key];
            if (isEmpty(v)) return null;
            return <div key={f.key}><I n={f.icon} s={10}/> <strong>{f.label}</strong> : {String(v).slice(0,80)}</div>;
          })}
          {target.notes && <div style={{ marginTop:6, paddingTop:6, borderTop:`1px solid ${T.border}` }}><I n="file-text" s={10}/> <strong>Notes</strong> : {String(target.notes).slice(0,200)}{String(target.notes).length>200?'…':''}</div>}
        </div>
      )}

      {/* Actions */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {/* Compléter (action principale) */}
        {!isOtherCollab && onEnrich && (
          <Btn small onClick={handleEnrichClick} disabled={!canEnrich}
            style={{ color:'#fff', background:canEnrich?'#16A34A':'#16A34A60', borderColor:'#16A34A', cursor:canEnrich?'pointer':'not-allowed' }}>
            <I n="plus-circle" s={12}/> Compléter cette fiche
          </Btn>
        )}
        {/* Voir détails */}
        <Btn small onClick={()=>setExpanded(e=>!e)} style={{ color:T.accent, borderColor:T.accent+'40' }}>
          <I n={expanded?'chevron-up':'eye'} s={12}/> {expanded?'Réduire':'Voir détails'}
        </Btn>
        {/* Me partager */}
        {isOtherCollab && onShare && (
          <Btn small onClick={()=>onShare(target.id)} style={{ color:'#fff', background:'#7C3AED', borderColor:'#7C3AED' }}>
            <I n="users" s={12}/> Me partager
          </Btn>
        )}
        {/* V1.13.1.e — Créer ma fiche (scope collab : creation autorisee si dup chez autre collab) */}
        {isOtherCollab && onCreateMyOwn && (
          <Btn small onClick={() => onCreateMyOwn()} style={{ color:'#fff', background:'#16A34A', borderColor:'#16A34A' }}>
            <I n="user-plus" s={12}/> Créer ma fiche
          </Btn>
        )}
        {/* Archiver (callback optionnel — V1.13.1.d wires) */}
        {canSoftDelete && !isArchived && onArchive && (
          <Btn small onClick={()=>onArchive(target.id)} style={{ color:'#EF4444', borderColor:'#EF444440' }}>
            <I n="archive" s={12}/> Archiver
          </Btn>
        )}
        {/* V1.13.2.a — "Supprimer cette fiche" : soft archive owner-only (Q1+Q2 : owner peut sans contacts.delete) */}
        {isOwner && !isArchived && onDelete && (
          <Btn small onClick={()=>onDelete(target)} style={{ color:'#EF4444', borderColor:'#EF444440' }}>
            <I n="trash-2" s={12}/> Supprimer cette fiche
          </Btn>
        )}
        {/* Supprimer définitivement (callback optionnel — V1.13.1.d wires) */}
        {canHardDeletePerm && isArchived && onHardDelete && (
          <Btn small onClick={()=>onHardDelete(target)} style={{ color:'#fff', background:'#DC2626', borderColor:'#DC2626' }}>
            <I n="alert-triangle" s={12}/> Supprimer déf.
          </Btn>
        )}
      </div>
    </div>
  );
};

export default DuplicateMatchCard;
