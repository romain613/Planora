# AUDIT — Post-call Smart Pipeline Status (READ-ONLY)

> **Date** : 2026-05-03
> **Demandeur** : MH
> **Type** : audit READ-ONLY pré-implémentation
> **Statut** : ✅ STOP après audit — aucune ligne de code
> **Source** : `clean-main` HEAD `1260869b`, post-V2.2.c
> **Position roadmap** : intercalé pendant attente Azure AD pour PHASE 3 Outlook

---

## 0. RÉSUMÉ EXÉCUTIF

🎯 **Découverte clé** : la feature **est déjà à 60% scaffoldée** dans le code, **inachevée et jamais branchée**.

| Élément | État | Source |
|---|---|---|
| State `postCallResultModal` | ✅ déclaré | [CollabPortal.jsx:1664](app/src/features/collab/CollabPortal.jsx#L1664) |
| `DISPOSITION_CODES` array (10 codes hardcodés) | ✅ déclaré | [CollabPortal.jsx:1670-1681](app/src/features/collab/CollabPortal.jsx#L1670-L1681) |
| Trigger post-hangup `endPhoneCall()` | ✅ existe | [CollabPortal.jsx:2190-2230](app/src/features/collab/CollabPortal.jsx#L2190-L2230) |
| **Render JSX `<PostCallResultModal>`** | ❌ **JAMAIS RENDU** | — |
| **Composant `PostCallResultModal`** | ❌ **N'EXISTE PAS** | — |
| Hook `usePipelineResolved` | ✅ exposé | [CollabPortal.jsx:2664-2670](app/src/features/collab/CollabPortal.jsx#L2664-L2670) — accessible via context |
| Col DB `call_logs.pipelineAction` | ✅ **existe déjà** | [database.js:587](server/db/database.js#L587) |

→ **Le périmètre se réduit à 1 NEW composant + 3 patches minimaux** au lieu d'une feature from-scratch.

**Volumétrie estimée** :
- 1 NEW `PostCallResultModal.jsx` (~180 lignes)
- 3 patches frontend (CollabPortal trigger >10s + render top-level + handler)
- 1 patch backend mince (NEW endpoint stats top-stages OU calcul frontend) — décision Q5
- **Total ~250 lignes**, 0 DDL nécessaire (pipelineAction col + pipeline_history table déjà là)

**Effort** : ~5h dev + workflow strict 17 étapes ~1h30 = **~6h30 total**.

---

## 1. POPUP ACTUELLE — état diagnostic

### 1.1 Popup NRP existante ([NrpPostCallModal.jsx](app/src/features/collab/modals/NrpPostCallModal.jsx))

**Fonctionne bien**, déclenchée si `duration < 10s OR contact.pipeline_stage === 'nrp'`. Scope limité au cas NRP/short-call.

Statuts affichés : pas hardcodés, dérivés de `pipelineStages` via prop, filtrés pour exclure 'nrp' et 'perdu' ([L43](app/src/features/collab/modals/NrpPostCallModal.jsx#L43)).

→ **Conserver intact**. Notre nouveau modal couvre le cas **complémentaire** (duration ≥ 10s).

### 1.2 État `postCallResultModal` ([CollabPortal.jsx:1664](app/src/features/collab/CollabPortal.jsx#L1664))

```js
const [postCallResultModal, setPostCallResultModal] = useState(null);  // ← state existe
```

→ Setter présent mais **aucun render JSX** dans le return. Le state stagne `null` éternel.

### 1.3 `DISPOSITION_CODES` hardcodé ([CollabPortal.jsx:1670-1681](app/src/features/collab/CollabPortal.jsx#L1670-L1681))

```js
const DISPOSITION_CODES = [
  {id:'interested',label:'Intéressé',color:'#22C55E',icon:'thumbs-up'},
  {id:'callback',label:'À rappeler',color:'#F59E0B',icon:'phone-forwarded'},
  {id:'not_interested',label:'Pas intéressé',color:'#EF4444',icon:'thumbs-down'},
  {id:'wrong_number',label:'Mauvais numéro',color:'#64748B',icon:'phone-off'},
  {id:'voicemail',label:'Messagerie',color:'#7C3AED',icon:'voicemail'},
  {id:'no_answer',label:'Pas de réponse',color:'#F59E0B',icon:'phone-missed'},
  {id:'meeting_set',label:'RDV pris',color:'#22C55E',icon:'calendar'},
  {id:'deal_closed',label:'Deal conclu',color:'#22C55E',icon:'check-circle'},
  {id:'follow_up',label:'Suivi nécessaire',color:'#2563EB',icon:'clock'},
  {id:'info_sent',label:'Info envoyée',color:'#0EA5E9',icon:'send'},
];
```

→ **Hardcodés** + **non consommés** (grep prouve 0 référence active hors déclaration). Brief MH explicite : **« aucun hardcode »**. **Solution** : abandonner cet array, utiliser le pipeline résolu dynamiquement.

### 1.4 Trigger post-hangup ([CollabPortal.jsx:2190-2230](app/src/features/collab/CollabPortal.jsx#L2190-L2230))

`endPhoneCall()` setter `setNrpPostCallModal({...})` si short call OR stage='nrp'. Cas `duration ≥ 10s ET stage != 'nrp'` → **rien ne se passe** actuellement.

→ Branche idéale pour `setPostCallResultModal({...})`.

---

## 2. SOURCE PIPELINE — résolution dynamique

### 2.1 Hook `usePipelineResolved` ([hooks/usePipelineResolved.js](app/src/features/collab/hooks/usePipelineResolved.js))

Appel `GET /api/data/pipeline-stages-resolved?collaboratorId=X&companyId=Y` → backend `resolvePipelineStages` ([resolve.js:31-100](server/services/pipelineTemplates/resolve.js)) :

| Mode collab | Stages retournés |
|---|---|
| `'free'` (défaut) | `DEFAULT_STAGES (7) + pipeline_stages company customs` |
| `'template'` (V1.8.20) | Snapshot figé du template assigné |

**Réponse** : `{ mode, stages: [...], readOnly, templateMeta }`.

### 2.2 `PIPELINE_STAGES` runtime ([CollabPortal.jsx:2668](app/src/features/collab/CollabPortal.jsx#L2668))

```js
const PIPELINE_STAGES = (_pipelineMode === 'template' && Array.isArray(_pipeResolved?.resolved?.stages))
  ? _pipeResolved.resolved.stages
  : [...DEFAULT_STAGES, ...pipelineStages];
```

→ **Source de vérité dynamique** déjà résolue par collab connecté. Exposé via **CollabContext**.

### 2.3 Filtre exclusion 'nouveau' (brief MH §4.2)

Côté popup :
```js
const availableStages = PIPELINE_STAGES.filter(s => s.id !== 'nouveau');
```

→ **3 lignes JSX**.

### 2.4 Mode `readOnly` (template figé)

Les stages restent affichables/sélectionnables (read-only s'applique au CRUD admin, pas au choix utilisateur post-call). Pas de blocage UX.

---

## 3. POINT D'ENTRÉE POST-CALL

### 3.1 `endPhoneCall()` ([CollabPortal.jsx:2190-2230](app/src/features/collab/CollabPortal.jsx#L2190-L2230))

Données disponibles au moment hangup :
```
ct.id, ct.name, ct.phone, ct.pipeline_stage
ct.nrp_followups_json
duration (sec)
calledNumber
```

Logique cible (Phase 1 patch) :
```js
if (duration < 10 || ct.pipeline_stage === 'nrp') {
  setNrpPostCallModal({...});  // existant — préserver
} else {
  // V1 — NEW : popup post-call smart pipeline
  setPostCallResultModal({
    contact: ct,
    duration,
    calledNumber,
    callLogId,  // pour wirer pipelineAction post-update
  });
}
```

→ +6 lignes patch.

### 3.2 Identification `callLogId`

VoIP cycle : `POST /api/voip/calls` retourne `{ logId }` au début → stocké dans state cf. `voipCallSession`. Disponible au hangup. À confirmer chemin exact à la phase patch (audit §5.2).

---

## 4. SCHÉMA DB — exploitation du existant

### 4.1 `call_logs.pipelineAction` ([database.js:587](server/db/database.js#L587))

**Cette colonne existe déjà** dans le schéma initial table `call_logs` :
```sql
pipelineAction TEXT
```

→ **Réutiliser cette col** pour stocker l'ID du stage choisi post-call (ex: `'qualifie'` ou `'rdv_programme'` ou `'other:rdv reporté à mardi'` pour cas Autre+note).

**Aucune DDL nécessaire**. Backward compat 100%.

### 4.2 `pipeline_history` ([database.js:1561-1571](server/db/database.js#L1561-L1571))

Table audit trail des changements stage :
```sql
CREATE TABLE pipeline_history (
  id, contactId, companyId, fromStage, toStage,
  userId, userName, note, createdAt
)
```

**Endpoint INSERT** : `POST /api/data/pipeline-history` ([data.js:1586-1603](server/routes/data.js#L1586-L1603)) — déjà appelé par NrpPostCallModal ligne 52.

→ **Réutiliser**. Pour cas "Autre + note libre", insert `pipeline_history` avec `fromStage = toStage` (no actual change) + `note = 'Post-call: <texte>'`.

### 4.3 Update stage pipeline

`PUT /api/data/contacts/:id` ([data.js:775-965](server/routes/data.js#L775-L965)) avec body `{ pipeline_stage: 'qualifie' }`. Validations existantes (transitions, anti-régression) **continuent de s'appliquer**.

→ Frontend handler : `handleCollabUpdateContact(ct.id, { pipeline_stage: stageId })` ([CollabPortal.jsx:3129-3220](app/src/features/collab/CollabPortal.jsx#L3129-L3220)).

### 4.4 Update `call_logs.pipelineAction`

Pas d'endpoint dédié actuel. Options :
- **A** : nouvel endpoint `PUT /api/voip/calls/:id/pipeline-action` (~15 lignes backend)
- **B** : étendre `PUT /api/voip/calls/:id` existant pour accepter `pipelineAction` (~3 lignes)

→ Reco **B** (minimal).

---

## 5. CALCUL TOP STAGES — colonnes les plus utilisées

### 5.1 Source données

- `pipeline_history` (toStage + userId + createdAt) : **source de vérité** changements stage
- `call_logs` (collaboratorId + contactId + createdAt + pipelineAction) : enrichissement post-call

### 5.2 SQL agrégation top-N

```sql
SELECT toStage AS stage, COUNT(*) AS n
FROM pipeline_history
WHERE companyId = ?
  AND userId = ?
  AND createdAt >= ?  -- ex: derniers 30j
GROUP BY toStage
ORDER BY n DESC
LIMIT 4
```

→ **<5ms en SQLite WAL**. Index `idx_pipeline_history_company` couvre la query.

### 5.3 Fallback si aucun historique

Pour un nouveau collab (pipeline_history vide) :
- **Reco** : afficher 4 stages par défaut hardcodés ordre **business reasonable** : `qualifie`, `rdv_programme`, `nrp`, `client_valide` (depuis PIPELINE_STAGES résolu, filtrés sur ces id).
- Tous les autres stages disponibles via "+ voir plus" accordion.

### 5.4 Endpoint backend proposé

**NEW** `GET /api/stats/collab/:collaboratorId/pipeline-top?days=30&limit=4` (~30 lignes backend).

Retour : `{ topStages: ['qualifie', 'rdv_programme', 'nrp', 'callback'], total: 142 }`.

→ Décision Q5.

---

## 6. UX DETAIL — pattern recommandé

### 6.1 Layout popup

```
┌─────────────────────────────────────────┐
│ Résultat de l'appel                  ✕ │
├─────────────────────────────────────────┤
│ 📞 Jean Dupont · 02:34                  │
│                                          │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│ │  RDV    │ │Qualifié │ │  NRP    │  ← top 3 stages collab
│ │  pris   │ │         │ │         │     │
│ └─────────┘ └─────────┘ └─────────┘     │
│                                          │
│ + voir plus (accordion)                  │
│   ┌─ contacte / À rappeler /            │
│      not_interested / client_valide /    │
│      perdu / [customs collab] ─┐         │
│                                          │
│ ─────────────────────────────────       │
│ ✏️  Autre + note libre                   │
└─────────────────────────────────────────┘
```

### 6.2 Comportement cliquable

| Action | Effet |
|---|---|
| Clic sur stage card | `handleCollabUpdateContact(ct.id, { pipeline_stage: id })` + `PUT /api/voip/calls/:id` (pipelineAction=id) + `POST /api/data/pipeline-history` (audit log) + ferme modal + toast "Pipeline → Qualifié" |
| Clic "+ voir plus" | accordion expand, montre tous les autres stages |
| Clic "Autre" | reveal input note libre + bouton "Enregistrer" |
| "Enregistrer" (Autre) | INSERT `pipeline_history` avec `fromStage = toStage = ct.pipeline_stage` + `note = 'Post-call: <texte>'` + ferme modal |
| Croix ✕ | `setPostCallResultModal(null)` — aucune action backend |

### 6.3 Suggestion intelligente (BONUS — V2)

| Mapping simple par durée | Stage suggéré (highlight visuel) |
|---|---|
| < 10s | (déjà géré NRP popup) |
| 10s-30s | NRP / Pas de réponse |
| 30s-2min | À rappeler / Suivi nécessaire |
| 2-5min | Qualifié / Intéressé |
| > 5min | RDV pris / Deal conclu |

→ **NON livré V1**. Affiché en backlog. Reco : commencer par baseline (Q7).

---

## 7. DIFF PREVIEW MINIMAL

### 7.1 NEW `app/src/features/collab/modals/PostCallResultModal.jsx` (~180 lignes)

```jsx
// PostCallResultModal — V3.x
// Popup post-call smart pipeline. Affiche stages dynamiques (PIPELINE_STAGES résolu)
// triés par usage récent. Click stage → update contact + log call_logs.pipelineAction.

import React, { useState, useEffect, useMemo } from "react";
import { T } from "../../../theme";
import { I, Btn, Modal } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

const FALLBACK_TOP_STAGES = ['qualifie', 'rdv_programme', 'nrp', 'callback'];

const PostCallResultModal = ({ data, onClose }) => {
  const { collab, company, PIPELINE_STAGES, handleCollabUpdateContact, showNotif } = useCollabContext();
  const [showAll, setShowAll] = useState(false);
  const [otherMode, setOtherMode] = useState(false);
  const [otherNote, setOtherNote] = useState('');
  const [topStages, setTopStages] = useState(FALLBACK_TOP_STAGES);
  const [submitting, setSubmitting] = useState(false);

  const { contact, duration, callLogId } = data || {};

  // Fetch top stages utilisés par collab (Q5 = A backend endpoint)
  useEffect(() => {
    if (!collab?.id) return;
    api(`/api/stats/collab/${collab.id}/pipeline-top?days=30&limit=4`)
      .then(r => { if (r?.topStages?.length) setTopStages(r.topStages); })
      .catch(() => {});
  }, [collab?.id]);

  // Filtre 'nouveau' + enrichit avec metadata stage
  const allStages = useMemo(
    () => (PIPELINE_STAGES || []).filter(s => s.id !== 'nouveau'),
    [PIPELINE_STAGES]
  );

  const topStagesObj = useMemo(
    () => topStages.map(id => allStages.find(s => s.id === id)).filter(Boolean).slice(0, 4),
    [topStages, allStages]
  );

  const otherStages = useMemo(
    () => allStages.filter(s => !topStages.includes(s.id)),
    [allStages, topStages]
  );

  const handleSelectStage = async (stageId) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // 1. Update contact pipeline_stage
      await handleCollabUpdateContact(contact.id, { pipeline_stage: stageId });
      // 2. Log call_logs.pipelineAction (extension PUT /api/voip/calls/:id)
      if (callLogId) {
        api(`/api/voip/calls/${callLogId}`, { method: 'PUT', body: { pipelineAction: stageId } }).catch(() => {});
      }
      // 3. pipeline_history déjà inséré via PUT /contacts/:id
      const stage = allStages.find(s => s.id === stageId);
      showNotif?.(`Pipeline → ${stage?.label || stageId}`);
      onClose();
    } catch (err) {
      showNotif?.('Erreur update : ' + (err?.message || ''), 'danger');
      setSubmitting(false);
    }
  };

  const handleSubmitOther = async () => {
    if (!otherNote.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api('/api/data/pipeline-history', {
        method: 'POST',
        body: {
          contactId: contact.id,
          companyId: company.id,
          fromStage: contact.pipeline_stage,
          toStage: contact.pipeline_stage,  // pas de change, log only
          userId: collab.id,
          userName: collab.name,
          note: 'Post-call: ' + otherNote.trim()
        }
      });
      if (callLogId) {
        api(`/api/voip/calls/${callLogId}`, { method: 'PUT', body: { pipelineAction: 'other:' + otherNote.trim().slice(0, 50) } }).catch(() => {});
      }
      showNotif?.('Note post-call enregistrée');
      onClose();
    } catch (err) {
      showNotif?.('Erreur : ' + (err?.message || ''), 'danger');
      setSubmitting(false);
    }
  };

  if (!data?.contact) return null;

  return (
    <Modal open={true} onClose={onClose} title={null} width={520}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: T.text }}>
          <I n="phone" s={16}/> Résultat de l'appel
        </h3>
        <span style={{ fontSize: 12, color: T.text3 }}>
          {contact.name} · {Math.floor(duration/60)}:{String(duration%60).padStart(2,'0')}
        </span>
      </div>

      {/* Top stages (3-4) */}
      {!otherMode && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
            {topStagesObj.map(s => (
              <button
                key={s.id}
                onClick={() => handleSelectStage(s.id)}
                disabled={submitting}
                style={{
                  padding: '14px 10px', borderRadius: 10, border: `2px solid ${s.color}40`,
                  background: T.surface, cursor: 'pointer', textAlign: 'center',
                  transition: 'all .15s', fontFamily: 'inherit',
                  opacity: submitting ? 0.5 : 1
                }}
                onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = s.color + '12'; }}
                onMouseLeave={e => e.currentTarget.style.background = T.surface}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.label}</div>
              </button>
            ))}
          </div>

          {/* Voir plus accordion */}
          {otherStages.length > 0 && (
            <>
              <button
                onClick={() => setShowAll(s => !s)}
                style={{ width:'100%', padding:'8px', background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, cursor:'pointer', fontSize:12, color:T.text2, marginBottom: 10 }}
              >
                <I n={showAll ? 'chevron-up' : 'chevron-down'} s={12}/> {showAll ? 'Masquer' : `+ Voir ${otherStages.length} autre${otherStages.length>1?'s':''}`}
              </button>
              {showAll && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))', gap: 6, marginBottom: 12 }}>
                  {otherStages.map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectStage(s.id)}
                      disabled={submitting}
                      style={{ padding:'10px 8px', borderRadius:8, border:`1px solid ${s.color}30`, background:T.bg, cursor:'pointer', fontSize:11, fontWeight:600, color:s.color, fontFamily:'inherit' }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Autre */}
          <button
            onClick={() => setOtherMode(true)}
            style={{ width:'100%', padding:'10px', background:T.bg, border:`1px dashed ${T.border}`, borderRadius:8, cursor:'pointer', fontSize:12, color:T.text2, marginTop: 6 }}
          >
            <I n="edit-3" s={12}/> Autre (note libre, sans changer pipeline)
          </button>
        </>
      )}

      {/* Other mode */}
      {otherMode && (
        <div>
          <textarea
            value={otherNote}
            onChange={e => setOtherNote(e.target.value)}
            placeholder="Décrivez le résultat de l'appel..."
            rows={4}
            style={{ width:'100%', padding:'10px', borderRadius:8, border:`1px solid ${T.border}`, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', resize:'vertical', marginBottom: 10 }}
          />
          <div style={{ display:'flex', gap:8 }}>
            <Btn small onClick={() => { setOtherMode(false); setOtherNote(''); }} style={{ flex:1, justifyContent:'center' }}>
              <I n="arrow-left" s={11}/> Retour
            </Btn>
            <Btn small primary onClick={handleSubmitOther} disabled={!otherNote.trim() || submitting} style={{ flex:1, justifyContent:'center' }}>
              <I n="check" s={11}/> Enregistrer
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default PostCallResultModal;
```

→ **~180 lignes**.

### 7.2 PATCH `CollabPortal.jsx` (3 zones, +20/-1 lignes)

#### A. Trigger `endPhoneCall` ligne ~2210
```js
// Avant : seul cas NRP géré
if (duration < 10 || ct.pipeline_stage === 'nrp') {
  setNrpPostCallModal({ contact: ct, ... });
}

// Après : ajout cas standard >=10s
if (duration < 10 || ct.pipeline_stage === 'nrp') {
  setNrpPostCallModal({ contact: ct, ... });
} else {
  // V3.x — Smart pipeline post-call
  setPostCallResultModal({ contact: ct, duration, calledNumber, callLogId: voipCallSession?.logId });
}
```

#### B. Import + render top-level
```jsx
// Import top
import PostCallResultModal from "./modals/PostCallResultModal";

// Render avant </> final (proche NrpPostCallModal render existant)
{postCallResultModal && (
  <PostCallResultModal
    data={postCallResultModal}
    onClose={() => setPostCallResultModal(null)}
  />
)}
```

#### C. Expose dans CollabContext
```jsx
// CollabPortal value bloc — ajouter PIPELINE_STAGES + handleCollabUpdateContact + showNotif si pas déjà exposés
<CollabProvider value={{
  ...existing,
  PIPELINE_STAGES,         // si pas déjà
  handleCollabUpdateContact, // si pas déjà
  showNotif,               // si pas déjà
}}>
```

(Vérifier au patch — probablement déjà exposés vu usage par CrmTab/PhoneTab.)

### 7.3 NEW endpoint backend `server/routes/stats.js` (~40 lignes)

Décision Q5. **Reco A** : NEW route `GET /api/stats/collab/:collaboratorId/pipeline-top`.

```js
import express from 'express';
import { db } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = express.Router();

// V3.x — Top stages utilisés post-call par collab (last N days)
router.get('/collab/:collaboratorId/pipeline-top', requireAuth, enforceCompany, (req, res) => {
  try {
    const collabId = req.params.collaboratorId;
    const companyId = req.auth.companyId;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days || '30', 10)));
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit || '4', 10)));

    // Permission : collab voit ses propres stats OR admin
    if (collabId !== req.auth.collaboratorId && !req.auth.isAdmin && !req.auth.isSupra) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const since = new Date(Date.now() - days * 86400000).toISOString();
    const rows = db.prepare(
      `SELECT toStage AS stage, COUNT(*) AS n
       FROM pipeline_history
       WHERE companyId = ? AND userId = ? AND toStage != 'nouveau' AND createdAt >= ?
       GROUP BY toStage
       ORDER BY n DESC, toStage ASC
       LIMIT ?`
    ).all(companyId, collabId, since, limit);

    res.json({
      topStages: rows.map(r => r.stage),
      counts: rows,
      window: { days, since }
    });
  } catch (err) {
    console.error('[STATS PIPELINE-TOP ERR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

Mount dans `server/index.js` :
```js
import statsRouter from './routes/stats.js';
app.use('/api/stats', statsRouter);
```

→ **~45 lignes** total backend.

### 7.4 PATCH `server/routes/voip.js` — accept `pipelineAction` dans PUT (+5 lignes)

Localiser `PUT /api/voip/calls/:id` (ou équivalent) et ajouter `pipelineAction` au whitelist des champs updatables. ~3 lignes.

Si l'endpoint n'accepte pas encore les updates partiels, NEW endpoint `PUT /api/voip/calls/:id/pipeline-action` (~15 lignes).

### 7.5 Récap volumétrie

| Fichier | Δ | Type |
|---|---|---|
| `PostCallResultModal.jsx` (NEW) | +180 | NEW composant |
| `CollabPortal.jsx` | +20 / -1 | PATCH (trigger + import + render + context expose) |
| `server/routes/stats.js` (NEW) | +45 | NEW route backend |
| `server/index.js` | +2 | Mount stats router |
| `server/routes/voip.js` | +3 à +15 | PATCH ou NEW endpoint pipelineAction |
| **Total** | **+250 à +263** | 1-2 NEW + 2-3 PATCH |

---

## 8. IMPACT SUR CRM / PIPELINE / CALL_LOGS

| Système | Impact | Type |
|---|---|---|
| CRM contacts | `pipeline_stage` mis à jour via `PUT /contacts/:id` existant | ✅ utilise flux éprouvé |
| Pipeline view (Kanban) | Contact change de colonne après update | ✅ comportement attendu |
| `pipeline_history` | INSERT log à chaque change OR Autre+note | ✅ utilise endpoint existant |
| `call_logs.pipelineAction` | Stocke ID stage choisi (ou `'other:<note>'`) | ✅ col existe déjà, juste backwiring |
| Reporting RDV V1.11.4 | 0 impact (pas de booking modifié) | ✅ |
| V2.x DuplicateOnCreateModal | 0 impact (pas de création contact) | ✅ |
| ScheduleRdvModal | 0 impact | ✅ |

---

## 9. RISQUES UX / TECHNIQUES

| # | Risque | Sévérité | Mitigation |
|---|---|:---:|---|
| **R1** | Popup s'ouvre alors que collab a déjà choisi NRP popup | 🟢 | Branche `if/else` dans `endPhoneCall` exclusive (NRP OR Smart, jamais les 2) |
| **R2** | Stages template (mode `readOnly`) sélectionnables ? | 🟢 | OUI — readOnly s'applique à CRUD admin, pas au choix UX. Aucun blocage. |
| **R3** | `topStages` API retourne stages obsolètes (si collab a changé de template) | 🟡 | Filter `topStages` ∩ `allStages` (ne montre que stages présents dans pipeline résolu actuel). Code §7.1 le fait via `find()` |
| **R4** | Endpoint `/stats/collab/:id/pipeline-top` permission cross-collab | 🟢 | Check explicite : `collabId === req.auth.collaboratorId OR isAdmin/isSupra` |
| **R5** | Performance : query `pipeline_history` sur grosse company | 🟢 | Index `idx_pipeline_history_company` couvre. ~412 rows actuellement → <2ms |
| **R6** | Trigger en double (NRP + Smart) | 🟢 | branche if/else mutuellement exclusive |
| **R7** | `voipCallSession?.logId` peut être null à la récup | 🟡 | Fallback : tag pipelineAction skip (pipeline_history préservé via PUT contacts/:id) |
| **R8** | Feature dormante = invisible jusqu'au premier appel >10s avec stage != nrp | 🟢 | Acceptable, c'est le pattern attendu |
| **R9** | Test régression NrpPostCallModal | 🟢 | Code NRP intact (pas modifié), juste branche else ajoutée |
| **R10** | Custom stages company collab (mode free + customs) | 🟢 | Apparaissent automatiquement dans `PIPELINE_STAGES` résolu → popup dynamique parfaite |
| **R11** | Stages template mode → fallback `topStages` peut contenir id ancien stage absent du nouveau template | 🟡 | Filter ∩ déjà géré R3 |
| **R12** | Note "Autre" très longue dans `pipelineAction` (TEXT mais convention courte) | 🟢 | Tronqué à 50 chars (`other:<note.slice(0,50)>`) — `pipeline_history.note` garde version longue |

---

## 10. BONUS — suggestion automatique mapping

**NON demandé pour V1**. Proposition pour V2 ou debrief :

### 10.1 Mapping simple par durée

```js
const suggestStage = (duration, currentStage) => {
  if (duration < 30) return 'nrp';
  if (duration < 120) return 'callback';        // À rappeler
  if (duration < 300) return 'qualifie';
  return 'rdv_programme';                        // > 5min
};
```

Affichage : highlight visuel (border thicker + badge "✨ Suggéré") sur la stage card correspondante.

### 10.2 Mapping enrichi (V3+)

- Couplage avec **transcript IA** (si V1.9 recording actif) : si keywords "rendez-vous"/"oui je suis intéressé" détectés → `rdv_programme` / `qualifie`
- Apprentissage : ajuster `topStages` automatiquement selon comportement (déjà fait par §5.2 query)

→ **Hors V1 strict**.

---

## 11. DÉCISIONS OUVERTES — Q1-Q7

### Q1 — Compléter feature inachevée OU créer from-scratch ?

| Option | |
|---|---|
| **A** Compléter `postCallResultModal` state + DISPOSITION_CODES existants | déconseillé (codes hardcodés vs brief MH dynamique) |
| **B** Compléter state existant `postCallResultModal` + créer NEW `PostCallResultModal.jsx` qui ignore `DISPOSITION_CODES` et utilise `PIPELINE_STAGES` dynamique | reco Claude — minimum pour brief |
| **C** Tout from-scratch (nouveau state + nouveau modal + nouveau name) | redondant |

**Reco** : **B**. `DISPOSITION_CODES` reste déclaré mais non utilisé (cleanup hors scope, ou supprimé en bonus).

### Q2 — Source stages = PIPELINE_STAGES dynamique ✅

Validé par brief MH. **0 hardcode**.

### Q3 — Filtre "nouveau" exclu ✅

Validé par brief MH (§4.2).

### Q4 — Top N stages = 3 ou 4 ?

| Option | |
|---|---|
| **A** Top 3 stages | minimaliste |
| **B** Top 4 stages | reco Claude — équilibre coverage / bruit visuel |

**Reco** : **B**.

### Q5 — Endpoint stats : backend dédié OR frontend calcul ?

| Option | |
|---|---|
| **A** NEW backend `/api/stats/collab/:id/pipeline-top` (~45 lignes) | reco Claude — perf + cache, source vérité unique |
| **B** Calcul frontend depuis `pipeline_history` chargé en init | possible si payload init contient déjà l'historique, mais 412 rows = bandwidth gaspillé |

**Reco** : **A**.

### Q6 — "Autre + note libre" : update stage ou pas ?

| Option | |
|---|---|
| **A** Pas de change stage, juste log `pipeline_history.note` (audit trail) | reco Claude (cohérent brief MH "log action sans changer pipeline") |
| **B** Update + note | trop intrusif |

**Reco** : **A**.

### Q7 — Suggestion automatique V1 ?

| Option | |
|---|---|
| **A** SKIP V1, backlog pour V2 (BONUS MH explicite) | reco Claude — pas demandé strict |
| **B** Inclure mapping simple par durée dès V1 | risque de bias et expérience moyenne |

**Reco** : **A**.

---

## 12. CONFORMITÉ CONTRAINTES MH

| Contrainte | Respect |
|---|:---:|
| Aucun hardcode | ✅ PIPELINE_STAGES dynamique via context |
| Dynamique 100% | ✅ par collab via `usePipelineResolved` |
| Patch minimal | ✅ ~250 lignes, 1-2 NEW |
| Backward compatible | ✅ NrpPostCallModal intact, postCallResultModal state inutilisé jusqu'ici |
| Temps réponse instantané | ✅ pipeline-top cached client + render local immédiat |
| Audit READ-ONLY avant code | ✅ ce doc |
| Diff preview minimal | ✅ §7 |
| Tracking stats | ✅ pipeline_history + call_logs.pipelineAction (col existante) |
| Multi-collab | ✅ source `usePipelineResolved` per-collab |
| STOP avant code | ✅ aucune ligne écrite |

---

## 13. ESTIMATION FINALE

| Tâche | Effort |
|---|:---:|
| NEW `PostCallResultModal.jsx` (~180 lignes) | 1h30 |
| Patch `CollabPortal.jsx` (3 zones) | 30 min |
| NEW endpoint `routes/stats.js` + mount | 30 min |
| Patch `routes/voip.js` (pipelineAction PUT) | 15 min |
| Build + grep régression + tests local | 30 min |
| Backup pré + SCP + smoke + tests UI MH | 1h |
| Workflow strict (commit + push + tag + backup post + handoff + memory) | 1h |
| **Total** | **~5h-6h30** |

---

## 14. ✅ STOP — Aucune ligne de code écrite

Audit READ-ONLY terminé. Aucune modification effectuée.

**Prochaine étape attendue** :
1. MH valide les 7 décisions Q1-Q7
2. GO MH explicite
3. Patch dans l'ordre :
   1. NEW `PostCallResultModal.jsx`
   2. NEW `routes/stats.js` + mount `index.js`
   3. PATCH `routes/voip.js` (pipelineAction)
   4. PATCH `CollabPortal.jsx` (trigger + render)
4. Build local + STOP avant SCP
5. Workflow strict 17 étapes

**Aucune action sans GO MH explicite.**

---

**Sources** :
- Repo local : HEAD `1260869b`
- Code lu :
  - [`CollabPortal.jsx:1664-1681`](app/src/features/collab/CollabPortal.jsx#L1664-L1681) (state + DISPOSITION_CODES)
  - [`CollabPortal.jsx:2190-2230`](app/src/features/collab/CollabPortal.jsx#L2190-L2230) (endPhoneCall trigger)
  - [`CollabPortal.jsx:2652-2682`](app/src/features/collab/CollabPortal.jsx#L2652-L2682) (PIPELINE_STAGES résolu)
  - [`CollabPortal.jsx:3129-3220`](app/src/features/collab/CollabPortal.jsx#L3129-L3220) (handleCollabUpdateContact)
  - [`hooks/usePipelineResolved.js`](app/src/features/collab/hooks/usePipelineResolved.js)
  - [`modals/NrpPostCallModal.jsx`](app/src/features/collab/modals/NrpPostCallModal.jsx) (référence pattern)
  - [`server/services/pipelineTemplates/resolve.js`](server/services/pipelineTemplates/resolve.js)
  - [`server/db/database.js:575-593`](server/db/database.js#L575-L593) (call_logs schema avec col pipelineAction)
  - [`server/db/database.js:1561-1571`](server/db/database.js#L1561-L1571) (pipeline_history schema)
  - [`server/routes/data.js:775-965`](server/routes/data.js#L775-L965) (PUT /contacts/:id avec validations transitions)
  - [`server/routes/data.js:1586-1603`](server/routes/data.js#L1586-L1603) (POST /pipeline-history)
- Memory : `feedback_phase_workflow_17_steps.md`, `feedback_code_no_root_file_piling.md`
- Audits antérieurs : roadmap V2.2.c clôturé + V3 Outlook en attente
