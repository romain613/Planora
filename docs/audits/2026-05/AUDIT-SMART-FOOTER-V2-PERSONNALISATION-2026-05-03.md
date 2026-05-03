# AUDIT V2 — Smart Footer Personnalisation KPI (READ-ONLY)

> **Date** : 2026-05-03
> **Demandeur** : MH
> **Type** : audit READ-ONLY pré-implémentation
> **Statut** : ✅ STOP après audit — aucune ligne de code
> **Source** : `clean-main` HEAD `95486c75`, post-V3.x.1 V1 livré
> **Pré-requis** : V1 Smart Footer LIVE (`v3.x.1-smart-footer-v1`)

---

## 0. RÉSUMÉ EXÉCUTIF

V2 active le bouton ➕ du SmartFooterBar (V1) pour permettre au collab de **personnaliser ses KPI affichés** :

- Click ➕ → menu/popup "Ajouter un KPI"
- Liste : **stages PIPELINE_STAGES résolus** du collab connecté (excluant 'nouveau')
- Click stage → ajout KPI dans la liste affichée + **persist localStorage par collab**
- Limite **6 KPI max** total
- Click ✕ sur un KPI custom → retire (KPI fixes V1 = retirables aussi ? — Q1 ci-dessous)
- Aucun backend (V2 strict)
- Patch minimal sur `SmartFooterBar.jsx` uniquement

**Volumétrie** : ~+90 lignes (modif SmartFooterBar). 0 NEW fichier, 0 backend, 0 DDL.

**Effort** : ~1h30 dev + workflow strict ~1h = **~2h30 total**.

---

## 1. ÉTAT TERRAIN V1

### 1.1 V1 livré (cf. memory `project_v3x1_smart_footer_v1.md`)

```js
const KPI_DEFS = [  // hardcodés V1
  { id:'calls_today',   source:'backend',  label:'appels',     emoji:'📞' },
  { id:'rdv_count',     source:'bookings', label:'RDV',        emoji:'📅' },
  { id:'stage_qualifie',source:'contacts', label:'intéressés', emoji:'🔥', stageId:'qualifie' },
  { id:'stage_nrp',     source:'contacts', label:'NRP',        emoji:'❌', stageId:'nrp' },
];
```

→ V2 doit étendre `KPI_DEFS` dynamiquement avec les stages du collab connecté.

### 1.2 Source pipeline déjà disponible

`useCollabContext()` expose `PIPELINE_STAGES` résolu via `usePipelineResolved` (cf. V3.x post-call). Format : `[{id, label, color, ...}]` avec :
- 7 stages standards (`nouveau, contacte, qualifie, rdv_programme, nrp, client_valide, perdu`)
- + stages custom company (ex: NRP2, NRP4)
- OU snapshot template figé si `pipelineMode='template'`

### 1.3 Pattern localStorage existant

Mémoire codebase (audit V1 §1.3 référent) :
```
c360-phone-fav-{collabId}
c360-phone-notes-{collabId}
c360-gridCustom-{collabId}
c360-live-config-{collabId}
```

→ Pattern **V2** : `c360-footer-kpis-{collabId}` (Set/Array d'IDs KPI sélectionnés).

---

## 2. UX PROPOSÉE

### 2.1 Popup "Ajouter un KPI"

Style cohérent avec PostCallResultModal V3.x SaaS premium :
- Trigger : click ➕ → ouvre dropdown ancré au bouton (popover) OU petit Modal centré
- **Reco Claude** : popover ancré (UX moins intrusive qu'une Modal)
- Dimensions : 280-320px largeur
- Contenu : liste verticale des stages disponibles (non encore affichés en KPI)

### 2.2 Items dropdown

```
+ Ajouter un indicateur

📊 Statuts pipeline
─────────────────────
🔵 Contact établi          [+]
🟣 Intéressé (déjà ajouté) ✓
🟠 RDV programmé            [+]
🔴 NRP (déjà ajouté)        ✓
🟢 Gagné                    [+]
⚫ Perdu                    [+]
🟠 NRP2 (custom)            [+]
🟠 NRP4 (custom)            [+]

📞 Métriques (V3 backlog)
🎯 Objectif jour (V3 backlog)
```

**Affichage** :
- Stages déjà actifs → badge "✓ ajouté", désactivés (pas de re-click)
- Stages disponibles → bouton "+" cliquable
- Filter `id !== 'nouveau'` strict (cohérent V3.x)

### 2.3 Comportements

| Action | Effet |
|---|---|
| Click ➕ footer | Ouvre dropdown popover |
| Click hors popover | Ferme popover (click outside) |
| Click stage disponible | Ajoute KPI dans liste + persist localStorage + ferme popover (ou reste ouvert pour multi-add ?) — Q3 |
| Limite 6 KPI atteinte | Tous les boutons "+" disabled, message "Maximum 6 KPI" |
| KPI fixe V1 (📞📅) | Retirable ou pas ? Q1 |
| Hover KPI custom | Bouton ✕ visible pour retirer |
| Click ✕ KPI custom | Retire de la liste + persist localStorage |
| Refresh page | Restore depuis localStorage |
| Premier load (pas de localStorage) | Affiche les 4 KPI fixes V1 par défaut |

### 2.4 Hiérarchie KPI affichés

L'ordre de la liste = ordre dans localStorage. Au premier ajout custom :
- Ordre par défaut : `[calls_today, rdv_count, stage_qualifie, stage_nrp]` (V1 fixes)
- + ajouts custom en fin de liste

→ V3 backlog : drag&drop reorder.

---

## 3. STRATÉGIE V2 SAFE

### 3.1 Approche minimale : tout dans `SmartFooterBar.jsx`

Pas de NEW fichier. Patch unique du composant existant.

### 3.2 Modifications requises

```js
// Ajouts dans SmartFooterBar.jsx :

// 1. Import additionnel
import { useState, useRef } from "react"; // (déjà importé useState V1, ajouter useRef)

// 2. State popover ouverture
const [showAddMenu, setShowAddMenu] = useState(false);
const addBtnRef = useRef(null);

// 3. State liste KPI personnalisée
const [kpiList, setKpiList] = useState(() => loadKpiList(collab?.id));

// 4. Helpers localStorage
const KPI_STORAGE_KEY = (collabId) => `c360-footer-kpis-${collabId || 'default'}`;
const loadKpiList = (collabId) => {
  try { return JSON.parse(localStorage.getItem(KPI_STORAGE_KEY(collabId)) || 'null') || DEFAULT_KPI_IDS; }
  catch { return DEFAULT_KPI_IDS; }
};
const saveKpiList = (collabId, list) => {
  try { localStorage.setItem(KPI_STORAGE_KEY(collabId), JSON.stringify(list)); } catch {}
};

// 5. Génération KPI_DEFS dynamique = V1 fixes + stages PIPELINE_STAGES résolus
const buildKpiDefs = (PIPELINE_STAGES) => {
  const stagesKpis = (PIPELINE_STAGES || [])
    .filter(s => s.id !== 'nouveau')
    .map(s => ({
      id: 'stage_' + s.id,
      emoji: STAGE_EMOJI_MAP[s.id] || '🏷️',
      label: (s.label || s.id).toLowerCase(),
      color: s.color || T.text2,
      source: 'contacts',
      stageId: s.id,
      isCustom: !V1_FIXED_IDS.includes('stage_' + s.id),
    }));
  return [...V1_FIXED_KPIS_DEFS, ...stagesKpis];
};

// 6. Handlers add/remove
const addKpi = (kpiId) => {
  if (kpiList.length >= 6) return;
  if (kpiList.includes(kpiId)) return;
  const next = [...kpiList, kpiId];
  setKpiList(next);
  saveKpiList(collab?.id, next);
  setShowAddMenu(false); // OU rester ouvert (Q3)
};
const removeKpi = (kpiId) => {
  const next = kpiList.filter(id => id !== kpiId);
  setKpiList(next);
  saveKpiList(collab?.id, next);
};

// 7. Bouton ➕ activé (modif onClick + style)
<button onClick={() => setShowAddMenu(s => !s)} ref={addBtnRef} ...>
  {kpiList.length >= 6 ? '⊘' : '➕'}
</button>

// 8. Render popover si showAddMenu
{showAddMenu && (
  <div style={{ position: 'absolute', bottom: 50, ... }}>
    {availableStages.map(s => <KpiAddItem .../>)}
  </div>
)}

// 9. Bouton ✕ sur KPI retirables (Q1=oui retirables)
{showRemoveX && <button onClick={() => removeKpi(kpi.id)}>✕</button>}
```

### 3.3 Diff preview minimal

| Action | Δ lignes | Notes |
|---|---|---|
| Helpers localStorage | +12 | loadKpiList / saveKpiList |
| State + ref | +3 | showAddMenu / kpiList / addBtnRef |
| Mapping STAGE_EMOJI_MAP étendu | +15 | dynamique selon stages custom |
| `buildKpiDefs(PIPELINE_STAGES)` helper | +18 | génération dynamique |
| Bouton ➕ actif (onClick + état conditionnel) | +6/-3 | replace disabled par toggle popover |
| Popover render (dropdown) | +35 | UI complète |
| Click outside listener | +8 | useEffect handler |
| Bouton ✕ KPI custom (hover) | +10 | render conditionnel |
| Total V2 | **~+90 lignes**, 0 NEW fichier |

---

## 4. RISQUES + MITIGATION

| # | Risque | Sévérité | Mitigation |
|---|---|:---:|---|
| **R1** | localStorage perdu si change device | 🟢 | Acceptable V2 (V4 migration DB) |
| **R2** | Stage custom retiré du pipeline → KPI orphelin | 🟢 | Filter `kpiList.filter(id => kpiDefs.find(d => d.id === id))` au render → drop silencieux |
| **R3** | Limite 6 KPI dépassée par bug | 🟢 | `slice(0, 6)` défensif au render + check `addKpi` |
| **R4** | Click outside popover ferme aussi le ➕ → re-clic difficile | 🟢 | useRef + check target.contains() |
| **R5** | KPI fixes V1 (📞 calls / 📅 RDV) retirables → user perd ces KPI | 🟡 | Q1 : retirables OU pinned ? Reco : retirables (cohérent perso totale) |
| **R6** | Reset config = perdre l'état initial | 🟢 | Ajouter bouton "Réinitialiser" dans popover (V2.1 si demandé) |
| **R7** | Popover positionnement responsive | 🟡 | Position absolute bottom de bouton, max-height + overflow:auto |
| **R8** | Régression V1 : KPI fixes ne s'affichent plus si localStorage corrompu | 🟢 | Try/catch + fallback DEFAULT_KPI_IDS |
| **R9** | Stages template mode (`readOnly`) → KPI custom autorisés ? | 🟢 | OUI (lecture des stages OK même mode template, customisation = pref UI personnelle) |
| **R10** | useCollabContext PIPELINE_STAGES async load | 🟢 | Hook usePipelineResolved gère déjà loading state |

---

## 5. TESTS UI ATTENDUS V2

| # | Scénario | Attendu |
|---|---|:---:|
| **T1** | Click ➕ ouvre dropdown sous le bouton | popover visible |
| **T2** | Liste des stages disponibles affichée (ceux non encore en KPI) | filter OK |
| **T3** | Stages déjà ajoutés grisés/✓ | feedback visuel |
| **T4** | Click stage disponible → KPI ajouté dans footer + popover ferme | persist localStorage |
| **T5** | Refresh page → KPI custom toujours présents | ✓ load localStorage |
| **T6** | Limite 6 KPI atteinte → boutons + disabled, message clair | ✓ |
| **T7** | Hover KPI custom → bouton ✕ visible | UX retirer |
| **T8** | Click ✕ → KPI retiré + persist localStorage | ✓ |
| **T9** | Click hors popover → ferme | click outside |
| **T10** | Stages custom company (NRP2, NRP4) apparaissent en options | dynamique |
| **T11** | Si template mode → stages snapshot apparaissent | parité |
| **T12** | Régression V1 : KPI initiaux affichés au premier load (pas de localStorage) | DEFAULT |
| **T13** | Régression backend `/footer-kpis` toujours appelé pour calls_today | ✓ |
| **T14** | Régression bouton IA conditionnel | ✓ |
| **T15** | Régression position/style/z-index/responsive | ✓ |

---

## 6. DÉCISIONS À TRANCHER — Q1-Q4

### Q1 — KPI fixes V1 (📞 appels, 📅 RDV) retirables ou pinned ?

| Option | |
|---|---|
| **A** Retirables (perso totale) | reco Claude — cohérence brief MH "personnalisable par collab" |
| **B** Pinned (toujours présents) | + safe mais limite la perso |

**Reco** : **A**.

### Q2 — Popover ferme au click stage OU reste ouvert pour multi-add ?

| Option | |
|---|---|
| **A** Ferme après chaque ajout | UX simple, 1 ajout = 1 click ➕ |
| **B** Reste ouvert (multi-add) | + rapide pour ajouter 3-4 KPI d'un coup |

**Reco** : **B** (avec bouton "Fermer" en bas du popover ou click outside).

### Q3 — Métriques non-pipeline (durée moy, gagné, taux conv...) en V2 ?

| Option | |
|---|---|
| **A** Skip V2 (uniquement stages pipeline) | reco Claude — V2 strict + simple |
| **B** Inclure quelques métriques (gagné = `client_valide`, perdu = `perdu`) | déjà couverts par stages pipeline |
| **C** Métriques avancées (durée moy, taux conv) | V3 backlog (nécessite endpoint backend) |

**Reco** : **A**.

### Q4 — Reset config : bouton "Réinitialiser aux KPI par défaut" V2 ?

| Option | |
|---|---|
| **A** Skip V2 (user peut retirer manuellement) | minimal |
| **B** Inclure bouton "Réinitialiser" dans popover | + UX safe |

**Reco** : **A** V2 strict, **B** si MH le veut.

---

## 7. CONFORMITÉ CONTRAINTES MH

| Contrainte | Respect |
|---|:---:|
| Audit READ-ONLY avant code | ✅ ce doc |
| Aucun backend V2 | ✅ tout localStorage + state local |
| Patch minimal | ✅ ~90 lignes sur SmartFooterBar.jsx |
| Ne pas casser V1 | ✅ KPI_DEFS V1 conservés en defaults |
| Source PIPELINE_STAGES | ✅ via useCollabContext |
| Max 6 KPI visibles | ✅ slice(0, 6) + check addKpi |
| Sauvegarde localStorage par collab | ✅ key `c360-footer-kpis-{collabId}` |
| STOP avant code | ✅ |

---

## 8. ESTIMATION FINALE V2

| Tâche | Effort |
|---|:---:|
| Patch `SmartFooterBar.jsx` (helpers + state + popover + handlers) | 1h |
| STAGE_EMOJI_MAP étendu | 10 min |
| Build + grep régression + tests local | 20 min |
| Backup pré + SCP frontend + smoke + tests UI MH | 30 min |
| Workflow strict (commit + push + tag + backup post + handoff + memory) | 45 min |
| **Total V2** | **~2h30** |

---

## 9. ✅ STOP — Aucune ligne de code écrite

Audit READ-ONLY V2 terminé.

**Prochaine étape attendue** :
1. **MH valide les 4 décisions Q1-Q4** (Q1 critique : KPI fixes V1 retirables ?)
2. **GO MH explicite V2**
3. Patch `SmartFooterBar.jsx` (1 fichier, +90 lignes)
4. Build + STOP avant SCP
5. Workflow strict 17 étapes

**Aucune action sans GO MH explicite.**

---

**Sources** :
- Repo local : HEAD `95486c75`
- Code lu :
  - [`SmartFooterBar.jsx`](app/src/features/collab/components/SmartFooterBar.jsx) (V1 livré, base à étendre)
  - [`hooks/usePipelineResolved.js`](app/src/features/collab/hooks/usePipelineResolved.js) (source pipeline résolu)
  - [`CollabPortal.jsx:2664-2682`](app/src/features/collab/CollabPortal.jsx#L2664-L2682) (PIPELINE_STAGES + orderedStages)
- Audits référents :
  - [AUDIT-SMART-FOOTER-V1-CIBLE-2026-05-03.md](docs/audits/2026-05/AUDIT-SMART-FOOTER-V1-CIBLE-2026-05-03.md)
  - [AUDIT-SMART-FOOTER-PERFORMANCE-BAR-2026-05-03.md](docs/audits/2026-05/AUDIT-SMART-FOOTER-PERFORMANCE-BAR-2026-05-03.md)
- Memory : `project_v3x1_smart_footer_v1.md`, `feedback_phase_workflow_17_steps.md`
