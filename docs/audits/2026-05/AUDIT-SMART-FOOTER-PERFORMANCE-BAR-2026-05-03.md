# AUDIT — Smart Footer Performance Bar (READ-ONLY)

> **Date** : 2026-05-03
> **Demandeur** : MH
> **Type** : audit READ-ONLY pré-implémentation
> **Statut** : ✅ STOP après audit — aucune ligne de code
> **Source** : `clean-main` HEAD `1260869b`, post-V2.2.c (avec V3.x post-call en suspens commit/tag)
> **Position roadmap** : feature UX standalone, indépendante des autres chantiers en cours

---

## 0. RÉSUMÉ EXÉCUTIF

🚨 **Découverte critique sur le périmètre** : le brief MH parle de "remplacer le footer Appeler/RDV/SMS/Contact" mais ce **footer existant est contextuel** (visible uniquement quand un contact est sélectionné dans Pipeline Live, panel droit) et contient **5 boutons d'action critiques** : Appeler / SMS / Pipeline / Transférer / RDV.

→ **Q0 NEW** (à trancher MH) : remplacer ce footer contextuel OU créer un footer **GLOBAL** sticky bottom de l'écran (jamais lié à un contact) ?

**Reco Claude** : créer un **footer GLOBAL** distinct (KPI live performance bar) en bas de l'écran Téléphone, **sans toucher** au footer contextuel par-contact qui est essentiel au workflow Pipeline Live. C'est aligné avec l'objectif "vue d'ensemble performance commerciale".

---

## 1. ÉTAT TERRAIN

### 1.1 Footer actuel par-contact ([PhoneTab.jsx:1664-1677](app/src/features/collab/tabs/PhoneTab.jsx#L1664-L1677))

```jsx
{[
  {icon:'phone',         color:'#22C55E', tip:'Appeler',    action:()=>startPhoneCall(...)},
  {icon:'message-square',color:'#0EA5E9', tip:'SMS',        action:()=>{...sms tab}},
  {icon:'layout-grid',   color:'#7C3AED', tip:'Pipeline',   action:()=>{setPhoneSubTab('pipeline')}},
  {icon:'users',         color:'#8B5CF6', tip:'Transférer', action:()=>{setV7TransferModal(...)}},
  {icon:'calendar-plus', color:'#F59E0B', tip:'RDV',        action:()=>{setPhoneShowScheduleModal(true)}}
].map(...)}
```

- **Conditionnel** : visible uniquement si `pipelineRightContact !== null` (panel droit)
- **Style** : flex inline (pas fixed/sticky), dans `data-pipe-right-panel="1"`
- **Rôle** : actions rapides sur le contact courant
- **Note** : le brief MH parle de "Contact" mais c'est en réalité **Pipeline + Transférer** qui sont les boutons concernés

### 1.2 Stats bar header existante ([PhoneTab.jsx:247-344](app/src/features/collab/tabs/PhoneTab.jsx#L247-L344))

⚠ **À NE PAS CASSER** — toolbar haut PhoneTab avec :
- Toggle stats (chevron) — collapsible
- Badges Entrants / Sortants / Durée
- Objectif jour avec barre de progression
- Prochain RDV countdown

→ Le nouveau footer KPI doit être **complémentaire**, pas redondant. Reco §2.

### 1.3 Sources data déjà disponibles

| Source | Localisation | Disponible ? |
|---|---|:---:|
| `call_logs` (today) | DB query | ❌ pas de count today, à créer SQL |
| `bookings` (today/futurs) | `bookings` state CollabPortal init | ✅ déjà chargé frontend |
| `contacts.pipeline_stage` | `contacts` state CollabPortal | ✅ déjà chargé frontend, filtrer par `assignedTo` |
| `pipeline_history` (changes today) | DB query | ❌ pas de count today, à créer SQL |
| `user_goals` (objectif jour) | `/api/goals/user?collaborator_id=X` | ✅ endpoint existant (ObjectifsTab) |
| Endpoint stats `/api/perfCollab` (period=day) | `/api/perf/dashboard?period=day` | ✅ existant (perfCollab.js) — leaderboard admin, surdimensionné |
| Endpoint stats V3.x `/api/stats/collab/:id/pipeline-top` | NEW | ✅ déjà LIVE (V3.x post-call) |

### 1.4 Stockage config — état schema collaborators

Vérifié 36 colonnes existantes. **Pas de** `settings_json` ni `preferences_json` ni `ui_config_json` générique.

Pattern existant pour config par-collab :
- **localStorage** `c360-*-{collabId}` (favs, notes, tags, KPI goals, scripts...)
- **DB col dédiée** `collaborators.<feature>_json` (ex: `call_scripts_json`, `ai_*` cols)
- **Précédent migration** : Phase 2 a migré `c360-phone-scripts-{collabId}` localStorage → `collaborators.call_scripts_json` + endpoints `/api/collaborators/:id/call-scripts` (GET/PUT)

→ Pattern reproductible pour V2.

---

## 2. ARCHITECTURE PROPOSÉE

### 2.1 Position du footer (cohérent avec layout existant)

```
┌──────────────────────────────────────────────────────────────────┐
│  TOOLBAR HAUT (existant — Stats badges, objectif, prochain RDV) │ ← inchangé
├──────────────────────────────────────────────────────────────────┤
│  ┌────────────┬─────────────────────┬────────────┐               │
│  │ LEFT       │ CENTER (Pipeline)   │ RIGHT      │               │
│  │ Dialer     │ ▶ Cards kanban      │ Copilot    │               │
│  │ Conv.      │                     │ Info+stats │               │
│  │ Contacts   │                     │ Footer     │ ← per-contact │
│  └────────────┴─────────────────────┴────────────┘               │
├──────────────────────────────────────────────────────────────────┤
│  ✨ NEW SMART FOOTER PERFORMANCE BAR (global, sticky bottom)      │ ← V1+
│  📞 42 appels | 📅 5 RDV | 🔥 10 intéressés | ❌ 15 NRP | ➕    │
└──────────────────────────────────────────────────────────────────┘
```

→ Le footer global est **séparé** du footer per-contact. Aucune collision UX.

### 2.2 Sources data par KPI V1

| KPI V1 | Source | Calcul |
|---|---|---|
| **📞 Appels du jour** | call_logs | NEW endpoint backend (SQL `WHERE collaboratorId=? AND DATE(createdAt)=DATE('now') AND is_valid_call=1`) |
| **📅 RDV programmés** | `bookings` state frontend | `bookings.filter(b => b.collaboratorId === collab.id && b.date >= today && b.status === 'confirmed').length` |
| **🔥 Intéressés** | `contacts` state frontend | `contacts.filter(c => c.assignedTo === collab.id && c.pipeline_stage === 'qualifie').length` (ou stage personnalisé du collab) |
| **❌ NRP** | `contacts` state frontend | `contacts.filter(c => c.assignedTo === collab.id && c.pipeline_stage === 'nrp').length` |

**Calcul majoritairement frontend** sur états déjà chargés. Backend uniquement pour `call_logs today` (1 SELECT).

### 2.3 KPI personnalisables V2 (extensible)

Toute colonne pipeline résolu du collab (via `usePipelineResolved`) devient un KPI candidat :
- Stages standard : qualifie / rdv_programme / client_valide / perdu / nrp / contacte
- Stages custom company : N'IMPORTE QUEL stage de `pipeline_stages` (ex: NRP2, NRP4)
- Métriques call_logs : durée moyenne, durée totale, nombre d'appels valides
- Métriques bookings : RDV passés, RDV no-show, RDV honorés
- Objectif jour : ratio target/realised

### 2.4 NEW endpoint backend (V1 minimal — extension stats.js)

```js
GET /api/stats/collab/:collaboratorId/footer-kpis
Auth: requireAuth + enforceCompany
Retour:
{
  callsToday: 42,
  callsValidToday: 38,
  pipelineChangesToday: 12,
  // pour le reste : frontend calcule sur bookings/contacts states
}
```

→ ~30 lignes ajoutées dans **`server/routes/stats.js` existant** (V3.x). Pas de NEW fichier.

### 2.5 Stockage config — V1 localStorage

```js
// Key: c360-footer-kpis-<collabId>
// Value: JSON array de KPI ids
['calls_today', 'rdv_count', 'stage_qualifie', 'stage_nrp']
```

Helpers : `loadFooterKpis(collabId)` / `saveFooterKpis(collabId, list)`. Default si absent → KPI brief MH (📞 appels + 📅 RDV + 🔥 intéressés + ❌ NRP).

**V2 migration** : `ALTER TABLE collaborators ADD COLUMN footer_kpis_json TEXT` + `GET/PUT /api/collaborators/:id/footer-kpis` (~30 lignes backend, pattern Phase 2).

---

## 3. DÉCOUPAGE V1-V4 (recommandé MH)

### V1 — Footer stats live + KPI fixes (~3h)
- NEW composant `SmartFooterBar.jsx` (~180 lignes)
- 4 KPI fixes : Appels du jour / RDV programmés / Intéressés / NRP
- 1 endpoint backend `GET /api/stats/collab/:id/footer-kpis` (~30 lignes dans stats.js)
- Sticky bottom écran Téléphone
- Refresh auto toutes les 60s + à la fin de chaque appel (event window)
- Bouton ➕ visible mais désactivé (placeholder V2)

### V2 — Personnalisation collab (~3h)
- Bouton ➕ → dropdown menu "Ajouter un KPI"
- Liste dynamique : tous les stages PIPELINE_STAGES résolus + KPI métriques (durée moy, etc.)
- Sauvegarde V1 localStorage `c360-footer-kpis-<collabId>`
- Limite 6 KPI affichés + ➕

### V3 — Drill-down (~2h)
- Click KPI → filtre Pipeline Live ou CRM par stage correspondant
- Tooltip hover avec détail (durée moyenne, etc.)

### V4 — IA coaching + DB persist (~5h)
- Migration localStorage → DB `collaborators.footer_kpis_json`
- Endpoints `/api/collaborators/:id/footer-kpis`
- Suggestions IA : KPI à monitorer selon perf

**Total V1+V2+V3** : ~8h. Reco découpage 3 cycles séparés (validation incrémentale).

---

## 4. DIFF PREVIEW V1 (minimal)

### 4.1 NEW `app/src/features/collab/components/SmartFooterBar.jsx` (~180 lignes)

```jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { T } from "../../../theme";
import { I } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

const FALLBACK_KPIS = ['calls_today', 'rdv_count', 'stage_qualifie', 'stage_nrp'];
const MAX_KPIS = 6;
const REFRESH_INTERVAL = 60000;

const KPI_DEFS = {
  calls_today:    { icon: 'phone',         emoji: '📞', label: 'appels',    color: '#22C55E', source: 'backend' },
  rdv_count:      { icon: 'calendar',      emoji: '📅', label: 'RDV',       color: '#F59E0B', source: 'bookings' },
  stage_qualifie: { icon: 'flame',         emoji: '🔥', label: 'intéressés',color: '#7C3AED', source: 'contacts', stageId: 'qualifie' },
  stage_nrp:      { icon: 'phone-missed',  emoji: '❌', label: 'NRP',       color: '#EF4444', source: 'contacts', stageId: 'nrp' },
  stage_perdu:    { icon: 'x-circle',      emoji: '🔴', label: 'perdus',    color: '#64748B', source: 'contacts', stageId: 'perdu' },
  stage_client_valide: { icon: 'check-circle', emoji: '🟢', label: 'gagnés', color: '#22C55E', source: 'contacts', stageId: 'client_valide' },
  // Étendu par stages custom du pipeline résolu (V2)
};

const loadKpiList = (collabId) => {
  try { return JSON.parse(localStorage.getItem(`c360-footer-kpis-${collabId}`) || 'null') || FALLBACK_KPIS; }
  catch { return FALLBACK_KPIS; }
};

const SmartFooterBar = () => {
  const { collab, contacts, bookings, PIPELINE_STAGES } = useCollabContext();
  const [backendStats, setBackendStats] = useState({ callsToday: 0 });
  const [kpiList, setKpiList] = useState(() => loadKpiList(collab?.id));

  // Fetch backend stats + auto-refresh
  const fetchStats = useCallback(() => {
    if (!collab?.id) return;
    api(`/api/stats/collab/${collab.id}/footer-kpis`)
      .then(r => { if (r && !r.error) setBackendStats(r); })
      .catch(() => {});
  }, [collab?.id]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Listener fin d'appel → refresh immédiat
  useEffect(() => {
    const onCallEnd = () => fetchStats();
    window.addEventListener('callEnded', onCallEnd);
    return () => window.removeEventListener('callEnded', onCallEnd);
  }, [fetchStats]);

  // Calcul KPI individuel
  const computeKpi = (kpiId) => {
    const def = KPI_DEFS[kpiId];
    if (!def) return null;
    let value = 0;
    if (def.source === 'backend') {
      value = kpiId === 'calls_today' ? (backendStats.callsToday || 0) : 0;
    } else if (def.source === 'bookings') {
      const today = new Date().toISOString().slice(0, 10);
      value = (bookings || []).filter(b => b.collaboratorId === collab?.id && b.date >= today && b.status === 'confirmed').length;
    } else if (def.source === 'contacts') {
      value = (contacts || []).filter(c => c.assignedTo === collab?.id && c.pipeline_stage === def.stageId).length;
    }
    return { id: kpiId, ...def, value };
  };

  const kpis = kpiList.map(computeKpi).filter(Boolean).slice(0, MAX_KPIS);

  if (!collab?.id) return null;

  return (
    <div style={{
      position: 'sticky', bottom: 0, left: 0, right: 0,
      padding: '10px 18px',
      background: T.surface + 'F0',
      backdropFilter: 'blur(12px)',
      borderTop: `1px solid ${T.border}`,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      fontSize: 13, fontWeight: 600, color: T.text2,
      boxShadow: '0 -2px 12px rgba(0,0,0,0.04)',
      zIndex: 50
    }}>
      {kpis.map(kpi => (
        <div key={kpi.id} title={kpi.label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, background: kpi.color + '12', cursor: 'pointer', transition: 'background .12s' }}
          onMouseEnter={e => e.currentTarget.style.background = kpi.color + '20'}
          onMouseLeave={e => e.currentTarget.style.background = kpi.color + '12'}
        >
          <span style={{ fontSize: 14 }}>{kpi.emoji}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: kpi.color }}>{kpi.value}</span>
          <span style={{ fontSize: 11, color: T.text3 }}>{kpi.label}</span>
        </div>
      ))}
      <button
        disabled={kpis.length >= MAX_KPIS}
        title={kpis.length >= MAX_KPIS ? 'Maximum 6 KPI' : 'Ajouter un indicateur (V2)'}
        style={{ padding: '4px 10px', borderRadius: 8, border: `1px dashed ${T.border}`, background: 'transparent', cursor: kpis.length >= MAX_KPIS ? 'not-allowed' : 'pointer', color: T.text3, fontSize: 13, fontFamily: 'inherit', opacity: kpis.length >= MAX_KPIS ? 0.4 : 1 }}
      >
        ➕
      </button>
    </div>
  );
};

export default SmartFooterBar;
```

### 4.2 PATCH `server/routes/stats.js` (+30 lignes)

Ajout endpoint `/footer-kpis/:id` qui réutilise `db.prepare` existant. SQL :
```sql
SELECT
  (SELECT COUNT(*) FROM call_logs WHERE companyId=? AND collaboratorId=? AND DATE(createdAt)=DATE('now')) AS callsToday,
  (SELECT COUNT(*) FROM call_logs WHERE companyId=? AND collaboratorId=? AND DATE(createdAt)=DATE('now') AND is_valid_call=1) AS callsValidToday,
  (SELECT COUNT(*) FROM pipeline_history WHERE companyId=? AND userId=? AND DATE(createdAt)=DATE('now')) AS pipelineChangesToday
```

### 4.3 PATCH `PhoneTab.jsx` ou `CollabPortal.jsx` (~5 lignes)

Render `<SmartFooterBar />` :
- **Option A** : dans PhoneTab.jsx en bas du return tab (sticky bottom du tab)
- **Option B** : dans CollabPortal.jsx tout en bas (visible sur tous les tabs collab)

→ Reco MH : **Option A** (limité au tab Téléphone) — cohérent avec brief "Pipeline Live".

### 4.4 Récap volumétrie V1

| Fichier | Δ | Type |
|---|---|---|
| `SmartFooterBar.jsx` (NEW) | +180 | NEW composant |
| `server/routes/stats.js` | +30 | PATCH (extension endpoint /footer-kpis) |
| `PhoneTab.jsx` | +5 | PATCH (import + render sticky) |
| **Total V1** | **+215** | 1 NEW + 2 PATCH, 0 DDL |

---

## 5. RISQUES + MITIGATION

| # | Risque | Sévérité | Mitigation |
|---|---|:---:|---|
| **R1** | Confusion footer per-contact vs footer global | 🟡 | Q0 explicite MH avant code (§0). Reco séparation totale. |
| **R2** | Stats bar haut redondante avec footer | 🟡 | KPI distincts : haut = call session courant (Entrants/Sortants/Durée), bas = perf jour cumulé. À valider visuellement |
| **R3** | Cron auto-refresh saturation backend | 🟢 | 60s intervalle + listener `callEnded` (event), <5ms par query SQL indexée |
| **R4** | localStorage perdu si change device | 🟡 | Acceptable V1, V4 migration DB |
| **R5** | Limite 6 KPI dépassée | 🟢 | `slice(0, MAX_KPIS)` + bouton ➕ disabled au-delà |
| **R6** | Stages custom collab (NRP2, NRP4) → KPI ? | 🟢 | V2 — KPI_DEFS étendu dynamiquement depuis `PIPELINE_STAGES` résolu |
| **R7** | Sticky bottom collision avec NrpPostCallModal / PostCallResultModal | 🟢 | Modaux z-index 9999+ > footer z-index 50 |
| **R8** | Régression VoIP / Pipeline Live / Agenda | 🟢 | Composant additif, render conditionnel `if !collab return null` |
| **R9** | Performance frontend (filtres contacts/bookings à chaque render) | 🟢 | useMemo recommandé en V1.b si lag perçu (184 contacts max → trivial) |
| **R10** | KPI value=0 affiché → bruit visuel | 🟢 | Acceptable (donne visibilité sur "tu n'as rien fait") OU masquer si 0 → trancher Q? |

---

## 6. TESTS UI ATTENDUS V1

| # | Scénario | Attendu |
|---|---|:---:|
| **T1** | Footer affiché en bas du tab Téléphone | ✅ sticky bottom, glassmorphism |
| **T2** | KPI Appels = count call_logs aujourd'hui | matche `SELECT COUNT(*)` SQL |
| **T3** | KPI RDV = count bookings aujourd'hui+futurs collab | filtré frontend |
| **T4** | KPI Intéressés = count contacts assignedTo=self pipeline_stage='qualifie' | filtré frontend |
| **T5** | KPI NRP = count contacts assignedTo=self pipeline_stage='nrp' | filtré frontend |
| **T6** | Bouton ➕ disabled tooltip "V2" | ✅ V1 placeholder |
| **T7** | Refresh auto 60s | ✅ visible via Network tab |
| **T8** | Listener `callEnded` → refresh immédiat | nécessite hook dans endPhoneCall pour `window.dispatchEvent(new Event('callEnded'))` |
| **T9** | Régression footer per-contact (Appeler/SMS/Pipeline/Transférer/RDV) intact | ✅ |
| **T10** | Régression toolbar haut stats intacte | ✅ |
| **T11** | Régression PostCallResultModal V3.x | ✅ |
| **T12** | Régression NrpPostCallModal | ✅ |

---

## 7. DÉCISIONS À TRANCHER — Q0-Q5

### Q0 NEW — Périmètre footer existant

| Option | |
|---|---|
| **A** Remplacer footer per-contact (5 boutons Appeler/SMS/Pipeline/Transférer/RDV → KPI) | risque UX critique, perte CTA workflow |
| **B** **Garder** footer per-contact + AJOUTER footer global KPI sticky bottom | reco Claude — séparation rôles |
| **C** Fusionner (footer per-contact agrandi avec KPI à droite) | UX confuse, mélange contextes |

**Reco** : **B**.

### Q1 — Position footer global

| Option | |
|---|---|
| **A** Sticky bottom du tab Téléphone uniquement | reco Claude (cohérent brief "Pipeline Live") |
| **B** Sticky bottom de tout CollabPortal (visible tous tabs) | + global mais pollue les autres vues |

**Reco** : **A**.

### Q2 — Stockage config V1

| Option | |
|---|---|
| **A** localStorage `c360-footer-kpis-<collabId>` | reco Claude — V1 rapide |
| **B** DB col immédiat `collaborators.footer_kpis_json` | V4 prévu, prématuré V1 |

**Reco** : **A**.

### Q3 — Nombre max KPI affichés

| Option | |
|---|---|
| **A** 6 + bouton ➕ disabled au-delà | reco brief MH |
| **B** Illimité avec scroll horizontal | risque UX |
| **C** 4 max (cohérent PostCallResultModal Top 4) | trop restrictif |

**Reco** : **A**.

### Q4 — Sources data backend vs frontend

| Option | |
|---|---|
| **A** Frontend max (bookings + contacts en state existant) + backend uniquement pour call_logs today | reco Claude — minimal backend |
| **B** Backend complet (NEW endpoint retourne tout calculé) | + cohérent mais surcharge |

**Reco** : **A**.

### Q5 — Click KPI = drill-down V1 ou V3 ?

| Option | |
|---|---|
| **A** V3 backlog (V1 hover only) | reco brief MH (V3 explicite dans découpage) |
| **B** V1 minimal (click = filtre Pipeline Live par stage) | facile mais risque pas-fini UX |

**Reco** : **A**.

---

## 8. BONUS — design glassmorphism premium

Style retenu (inspiration HubSpot/Pipedrive/Close CRM) :
- `background: T.surface + 'F0'` (94% opacité)
- `backdropFilter: 'blur(12px)'` (effet flou frosted)
- `borderTop: 1px solid T.border` (séparation subtile)
- `boxShadow: '0 -2px 12px rgba(0,0,0,0.04)'` (élevation douce)
- KPI chips colorés `bg = color + '12'`, hover `+'20'`
- Icônes emoji (📞📅🔥❌) ou Lucide via `<I/>` (à choisir Q?)

---

## 9. CONFORMITÉ CONTRAINTES MH

| Contrainte | Respect |
|---|:---:|
| Audit READ-ONLY avant code | ✅ ce doc |
| Aucune ligne de code | ✅ |
| Pas de refactor massif | ✅ +215 lignes V1, 1 NEW |
| Patch minimal | ✅ |
| Compatible Pipeline Live existant | ✅ Option B Q0 (séparation totale) |
| Ne pas casser dialer/VoIP | ✅ composant additif sticky bottom |
| Ne pas casser Agenda/CRM | ✅ Option A Q1 (limité tab Téléphone) |
| Ne pas casser PostCallResultModal | ✅ z-index modaux > footer |
| Ne pas casser stats actuelles haut | ✅ KPI distincts (session vs jour cumulé) |
| Diff preview minimal | ✅ §4 |
| 6 KPI max | ✅ Q3 |
| Sources données réelles | ✅ §1.3 |

---

## 10. ESTIMATION FINALE V1

| Tâche | Effort |
|---|:---:|
| NEW `SmartFooterBar.jsx` (~180 lignes) | 1h30 |
| PATCH `stats.js` endpoint footer-kpis (~30 lignes) | 20 min |
| PATCH `PhoneTab.jsx` import + render sticky | 15 min |
| Hook `window.dispatchEvent('callEnded')` dans endPhoneCall | 5 min |
| Build + grep régression + tests local | 30 min |
| Backup pré + SCP + smoke + tests UI MH | 1h |
| Workflow strict (commit + push + tag + backup post + handoff + memory) | 1h |
| **Total V1** | **~4h30** |

**V1 + V2 + V3** : ~10h cumulés sur 3 cycles séparés.

---

## 11. ✅ STOP — Aucune ligne de code écrite

Audit READ-ONLY V1 Smart Footer Performance Bar terminé.

**Prochaine étape attendue** :
1. **MH valide les 6 décisions Q0-Q5** (Q0 critique : remplacer footer existant ou ajout séparé ?)
2. **GO MH explicite V1**
3. Patch dans l'ordre :
   1. NEW `components/SmartFooterBar.jsx`
   2. PATCH `server/routes/stats.js` (+endpoint footer-kpis)
   3. PATCH `PhoneTab.jsx` (import + render)
   4. PATCH `CollabPortal.jsx` `endPhoneCall` (dispatchEvent callEnded)
4. Workflow strict 17 étapes

**Aucune action sans GO MH explicite.**

---

## 12. RAPPEL — chantiers V3.x en suspens

⚠ Avant ce chantier Smart Footer, **2 cycles V3.x post-call non commités** :

1. **V3.x baseline** post-call smart pipeline (déployé live `dfc4f7d9`, fix double-render appliqué `dfc4f7d9`)
2. **V3.x UX refonte** PostCallResultModal (`index-Ca02q-dH.js` md5 `6b9cde11`, **construit local non déployé non commité**)

→ Reco : commit + tag groupé `v3.x-post-call-smart-pipeline` AVANT démarrage Smart Footer pour ne pas accumuler de WIP. À trancher MH.

---

**Sources** :
- Repo local : HEAD `1260869b`
- Code lu :
  - [`PhoneTab.jsx:1664-1677`](app/src/features/collab/tabs/PhoneTab.jsx#L1664-L1677) (footer per-contact actuel)
  - [`PhoneTab.jsx:247-344`](app/src/features/collab/tabs/PhoneTab.jsx#L247-L344) (stats bar header existante)
  - [`server/db/database.js`](server/db/database.js) (schemas call_logs/bookings/contacts/pipeline_history/collaborators)
  - [`server/routes/stats.js`](server/routes/stats.js) (NEW V3.x — extensible pour footer-kpis)
  - [`server/routes/collaborators.js`](server/routes/collaborators.js) (whitelist PUT + endpoint pattern call-scripts)
  - [`server/services/perfCollab.js`](server/services/perfCollab.js) (pattern stats existant)
  - [`server/routes/goals.js`](server/routes/goals.js) (objectifs jour)
- Audits antérieurs :
  - [AUDIT-V2.2.c-…](docs/audits/2026-05/AUDIT-V2.2.c-UI-ADMINDASH-DOUBLONS-2026-05-03.md)
  - [AUDIT-POST-CALL-SMART-PIPELINE-2026-05-03.md](docs/audits/2026-05/AUDIT-POST-CALL-SMART-PIPELINE-2026-05-03.md)
- Memory : `feedback_phase_workflow_17_steps.md`, `feedback_code_no_root_file_piling.md`
