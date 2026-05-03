# AUDIT V1 — Smart Footer Performance Bar (cible précise CollabPortal)

> **Date** : 2026-05-03
> **Demandeur** : MH
> **Type** : audit READ-ONLY — actualisation post clarification cible
> **Statut** : ✅ STOP après audit — aucune ligne de code
> **Source** : `clean-main` HEAD `1260869b`
> **Réf antérieure** : [AUDIT-SMART-FOOTER-PERFORMANCE-BAR-2026-05-03.md](docs/audits/2026-05/AUDIT-SMART-FOOTER-PERFORMANCE-BAR-2026-05-03.md) (audit large, périmètre ambigu)

---

## 0. CIBLE EXACTE LOCALISÉE

### 0.1 Bannière concernée — confirmation

**Fichier** : [`app/src/features/collab/CollabPortal.jsx:7149-7163`](app/src/features/collab/CollabPortal.jsx#L7149-L7163)

```jsx
{/* ═══ STICKY ACTION BAR ═══ */}
<div style={{
  position:'fixed', bottom:0,
  left:(typeof callFormAccordion!=='undefined'?callFormAccordion:null)?._navCollapsed?56:240,
  right:0,
  zIndex:9989,
  padding:'8px 16px',
  background:T.surface+'EE',
  backdropFilter:'blur(12px)',
  borderTop:'1px solid '+T.border,
  display:'flex', justifyContent:'center', gap:6,
  transition:'left .2s ease'
}}>
  {[
    { icon:'phone-call',     label:'Appeler', color:'#22C55E', action:()=>setPortalTab('phone') },
    { icon:'calendar-plus',  label:'RDV',     color:'#0EA5E9', action:()=>{ setPhoneScheduleForm({...}); setPhoneShowScheduleModal(true); } },
    { icon:'message-square', label:'SMS',     color:'#7C3AED', action:()=>setPortalTab('phone') },
    { icon:'user-plus',      label:'Contact', color:'#3B82F6', action:()=>setShowNewContact(true) },
    ...(collab.ai_copilot_enabled ? [{ icon:'cpu', label:'IA', color:'#F97316', action:()=>setShowIaWidget(p=>!p) }] : []),
  ].map((btn,i)=>(...))}
</div>
```

**Cette bannière est la cible exacte** de la refonte (style, position, z-index, et boutons matchent à 100% la capture MH).

### 0.2 Caractéristiques

| Attribut | Valeur |
|---|---|
| Composant | inline JSX dans `CollabPortal.jsx` (pas composant séparé) |
| Scope | **global** — visible sur **tous les tabs collab** (Aujourd'hui / Phone / Agenda / CRM / Messages / etc.) |
| Position | `fixed bottom:0` |
| Left | dynamique : `56` si nav collapsed, `240` sinon (lit `callFormAccordion?._navCollapsed`) |
| Right | `0` |
| z-index | `9989` |
| Background | glassmorphism (`T.surface + 'EE'` + `blur(12px)`) |
| Boutons | 4 standards (Appeler / RDV / SMS / Contact) + 1 conditionnel (IA si `collab.ai_copilot_enabled`) |
| Conditionnel render | aucun — affiché systématiquement dans CollabPortal |

### 0.3 Bug latent annexe (hors scope V1)

`callFormAccordion?._navCollapsed` semble incorrect — le vrai state nav collapsed du portail collab est probablement `navCollapsed` ou similaire. Cela explique peut-être pourquoi la bannière commence toujours à `left:240` (le `_navCollapsed` n'est jamais true). À garder dans le V1 : reproduire **exactement** la même logique `left` pour ne rien casser, fix séparé hors scope.

---

## 1. CONFIRMATION SCOPE

| Question | Réponse |
|---|---|
| Composant React dédié ? | ❌ inline JSX dans CollabPortal |
| Layout shell global ? | ✅ rendu directement dans `CollabPortal.jsx` (qui est lui-même le portail collab principal) |
| Conditionnelle ? | ❌ toujours visible sur toutes les pages collab |
| Impact sidebar/nav ? | ✅ `left` dynamique selon état sidebar |
| Impact responsive ? | partiel : `left` dynamique mais pas de responsive autre |
| Conflits modaux ? | aucun — modaux z-index >= 9990 (footer 9989) |

→ **Remplacement strict** : substituer le bloc JSX (15 lignes) par un `<SmartFooterBar />` composant qui reproduit position/style + KPI dynamiques.

---

## 2. SOURCES DATA — confirmation rapide

Audit précédent §1.3 reste valable. Synthèse :

| KPI V1 | Source | Calcul | Backend nécessaire ? |
|---|---|---|:---:|
| 📞 Appels du jour | `call_logs` | `WHERE collaboratorId=? AND DATE(createdAt)=DATE('now')` | ✅ 1 SQL |
| 📅 RDV programmés | `bookings` state | `bookings.filter(b => b.collaboratorId === collab.id && b.date >= today && b.status === 'confirmed')` | ❌ frontend |
| 🔥 Intéressés | `contacts` state | `contacts.filter(c => c.assignedTo === collab.id && c.pipeline_stage === 'qualifie')` | ❌ frontend |
| ❌ NRP | `contacts` state | idem `pipeline_stage === 'nrp'` | ❌ frontend |

**1 seule SQL backend** pour les appels du jour (call_logs). Reste = filtre frontend sur états déjà chargés (`bookings`, `contacts` du payload init CollabPortal).

---

## 3. STRATÉGIE V1 SAFE

### 3.1 Approche : composant NEW + remplacement strict

1. **NEW** `app/src/features/collab/components/SmartFooterBar.jsx` (~140 lignes)
   - Reproduit position/style identique (left dynamique, z-index 9989, glassmorphism)
   - Bouton ➕ disabled (placeholder V2 personnalisation)
   - Pas d'autre changement (no refactor)

2. **PATCH** `CollabPortal.jsx` :
   - Suppression du bloc JSX inline (lignes 7149-7163)
   - Remplacement par `<SmartFooterBar />` (1 ligne)
   - Import au top (1 ligne)

3. **PATCH** `server/routes/stats.js` :
   - Ajout endpoint `GET /api/stats/collab/:id/footer-kpis` (~25 lignes)
   - Réutilise pattern existant (V3.x post-call)

### 3.2 Hook refresh

**Auto-refresh côté frontend** :
- Fetch initial au mount
- `setInterval(fetchStats, 60000)` toutes les 60s
- `window.addEventListener('callEnded', fetchStats)` pour refresh immédiat fin d'appel
- Cleanup `clearInterval` + `removeEventListener` en useEffect cleanup

**Pas de patch backend supplémentaire** : event `callEnded` peut être ajouté dans `endPhoneCall()` CollabPortal (1 ligne `window.dispatchEvent(new Event('callEnded'))`) — optionnel V1 (refresh 60s suffit).

---

## 4. DIFF PREVIEW V1 (sans code)

| Fichier | Action | Δ lignes | Description |
|---|---|---|---|
| `app/src/features/collab/components/SmartFooterBar.jsx` | **NEW** | +140 | Composant avec 4 KPI + ➕ disabled, glassmorphism, refresh auto, listener callEnded |
| `app/src/features/collab/CollabPortal.jsx` | **PATCH** | +2 / -15 | Remplacement bloc inline (15 lignes) par `<SmartFooterBar />` (1 ligne) + 1 import |
| `server/routes/stats.js` | **PATCH** | +25 | Ajout endpoint `/footer-kpis/:collaboratorId` |
| `app/src/features/collab/CollabPortal.jsx` | **PATCH optionnel** | +1 | `window.dispatchEvent(new Event('callEnded'))` dans `endPhoneCall()` |
| **Total V1** | | **+168 / -15** | 1 NEW + 2 PATCH (+1 optionnel) |

**Dépendances** : aucune nouvelle lib npm, aucune DDL.

---

## 5. PLAN V1 SAFE (step-by-step)

### Ordre d'implémentation

1. **Backend d'abord** : NEW endpoint `/api/stats/collab/:id/footer-kpis` dans `server/routes/stats.js`. Smoke `curl 401` post-deploy.
2. **Composant NEW** : `SmartFooterBar.jsx` (Pas de remplacement encore — composant existe mais pas branché).
3. **PATCH CollabPortal** : import + remplacement JSX inline par `<SmartFooterBar />`. **C'est le moment critique** où le footer change visuellement.
4. **Optionnel** : ajout `window.dispatchEvent('callEnded')` dans `endPhoneCall()` pour refresh post-call instantané.
5. Build + SCP.

### Points de vigilance

- ✅ **Reproduire EXACTEMENT** la logique `left` dynamique (`_navCollapsed ? 56 : 240`) pour ne pas casser la cohabitation avec sidebar
- ✅ **Conserver z-index 9989** pour rester sous les modaux (NrpPostCallModal/PostCallResultModal/etc. qui sont >= 9990)
- ✅ **Garder transition CSS** (`left .2s ease`) pour la transition fluide quand sidebar collapse
- ✅ **Ne pas toucher** au `position:fixed bottom:0` (la bannière "RDV à venir" `bottom:56` ligne 7188 pourrait collision si on bouge la hauteur footer — actuellement padding:8px → ~30-35px hauteur — à conserver pour ne pas masquer la bannière RDV)
- ⚠ **Bouton IA conditionnel** (`collab.ai_copilot_enabled`) : si on perd ce bouton dans la refonte, MH perd l'accès au widget IA. **Reco V1** : conserver le bouton IA dans le smart footer comme 6e KPI/action ou bouton dédié à droite (parité préservée).
- ✅ **CTAs perdus** : Appeler / RDV / SMS / Contact deviennent inaccessibles depuis le footer global. **Reco V1** : signaler à MH que ces 4 CTAs étaient les seuls raccourcis globaux (autres tabs n'ont pas ce raccourci). Si critique → garder 1 ou 2 CTAs essentiels OU prévoir bouton "+ Action rapide" dans le smart footer.

---

## 6. RISQUES + MITIGATION

| # | Risque | Sévérité | Mitigation |
|---|---|:---:|---|
| **R1** | Perte CTA Appeler/RDV/SMS/Contact globaux | 🟡 | À trancher Q5 ci-dessous : remplacement strict (perte) ou hybride (KPI gauche + 1 ou 2 CTAs droite) |
| **R2** | Perte bouton IA (si `ai_copilot_enabled`) | 🟡 | Reco : conserver dans le smart footer en bouton dédié droite |
| **R3** | Régression position `left` dynamique | 🟢 | Reproduire exactement la logique existante |
| **R4** | Régression bannière "RDV à venir" `bottom:56` ligne 7188 | 🟢 | Garder hauteur footer ~30-35px (cohérent avec actuel) |
| **R5** | Régression modaux post-call (NrpPostCallModal, PostCallResultModal) | 🟢 | z-index 9989 < modaux ≥ 9990 (déjà OK) |
| **R6** | Régression Cockpit IA flottant `bottom:24 right:24` z-index:10002 ligne 7223 | 🟢 | z-index séparés, pas de conflit |
| **R7** | Frontend lag (filtres contacts/bookings recalculés à chaque render) | 🟢 | useMemo recommandé en V1.b si lag perçu (184 contacts max → trivial) |
| **R8** | `callEnded` event ajouté dans `endPhoneCall` peut casser autre listener | 🟢 | Optionnel V1, à skip si doute. Refresh 60s suffit. |

---

## 7. TESTS UI ATTENDUS V1

| # | Scénario | Attendu |
|---|---|:---:|
| **T1** | Smart footer affiché sur **tous les tabs collab** (Aujourd'hui / Phone / Agenda / CRM / Messages) | ✅ |
| **T2** | Footer respecte sidebar : left=240 (déployé) ou 56 (collapsed) | ✅ même logique que actuelle |
| **T3** | KPI Appels = count call_logs aujourd'hui collab | matche SQL backend |
| **T4** | KPI RDV = count bookings collab today+futurs status='confirmed' | filtré frontend |
| **T5** | KPI Intéressés = count contacts assignedTo=self pipeline_stage='qualifie' | filtré frontend |
| **T6** | KPI NRP = count contacts assignedTo=self pipeline_stage='nrp' | filtré frontend |
| **T7** | Bouton ➕ disabled tooltip "V2" | ✅ V1 placeholder |
| **T8** | Refresh auto 60s visible Network tab | ✅ |
| **T9** | (Si Q4=A) Bouton IA conservé visible si `ai_copilot_enabled` | ✅ |
| **T10** | (Si Q5=B hybride) Boutons Appeler/RDV/SMS/Contact toujours accessibles | ✅ |
| **T11** | Régression footer per-contact PhoneTab (5 boutons inline) | ✅ inchangé |
| **T12** | Régression bannière RDV à venir `bottom:56` | ✅ |
| **T13** | Régression Cockpit IA flottant | ✅ |
| **T14** | Régression PostCallResultModal V3.x déclenchement | ✅ |
| **T15** | Régression NrpPostCallModal | ✅ |
| **T16** | Régression VoIP / Pipeline Live / Agenda / CRM | ✅ |

---

## 8. DÉCISIONS À TRANCHER — Q1-Q6

### Q1 — Remplacement strict ou hybride (KPI + CTA) ?

| Option | |
|---|---|
| **A** Remplacement strict 100% KPI (perte 4 CTAs Appeler/RDV/SMS/Contact + IA) | reco brief MH si pas regretté |
| **B** Hybride : KPI à gauche/centre + CTAs essentiels (Appeler + RDV) à droite | sécurise CTAs |
| **C** Smart footer multi-mode toggle (KPI | CTA) avec bascule | complexe V1 |

**Reco** : **A** strict si MH confirme. Sinon **B** sécurise.

### Q2 — Bouton IA (`ai_copilot_enabled`) conservé ?

| Option | |
|---|---|
| **A** Conservé en bouton dédié droite du smart footer (parité existante) | reco — pas de régression IA users |
| **B** Supprimé (cohérent remplacement strict) | risque user IA actif |

**Reco** : **A**.

### Q3 — Stockage config V1 (futur V2 perso)

| Option | |
|---|---|
| **A** localStorage `c360-footer-kpis-<collabId>` | reco V1 rapide |
| **B** DB col immédiate | V4 |

**Reco** : **A**.

### Q4 — Sources data backend vs frontend

| Option | |
|---|---|
| **A** Frontend max + 1 SQL backend (call_logs today) | reco minimal |
| **B** Backend complet 1 endpoint retourne tout | + cohérent mais surcharge |

**Reco** : **A**.

### Q5 — Click KPI = drill-down V1 ?

| Option | |
|---|---|
| **A** V3 backlog (V1 hover only) | reco brief MH |
| **B** V1 minimal click = navigate tab + filtre | facile mais à scoper |

**Reco** : **A**.

### Q6 — Listener `callEnded` event V1 ?

| Option | |
|---|---|
| **A** Skip V1, refresh 60s suffit | reco minimal SAFE |
| **B** Patcher `endPhoneCall` pour dispatch event (1 ligne) | refresh instantané post-call |

**Reco** : **A** (V1 strict no-touch). **B** en V1.5 si MH veut feedback temps réel.

---

## 9. CONFORMITÉ CONTRAINTES MH

| Contrainte | Respect |
|---|:---:|
| NO CODE | ✅ ce doc |
| NO REFACTOR MASSIF | ✅ remplacement strict 1 bloc inline → 1 composant |
| PATCH MINIMAL | ✅ +168/-15 |
| NE RIEN CASSER | ✅ §5 vigilance + §6 risques |
| Préserver footer PhoneTab per-contact | ✅ aucune modif PhoneTab |
| Préserver VoIP / Pipeline Live / CRM / Agenda / PostCallResultModal | ✅ aucune modif sur ces zones |
| Audit READ-ONLY avant code | ✅ |
| STOP avant patch | ✅ |
| V1 SIMPLE / RAPIDE / SAFE | ✅ ~3h dev + workflow strict |

---

## 10. ESTIMATION FINALE V1

| Tâche | Effort |
|---|:---:|
| NEW `SmartFooterBar.jsx` (~140 lignes) | 1h |
| PATCH `stats.js` endpoint footer-kpis (~25 lignes) | 15 min |
| PATCH `CollabPortal.jsx` (import + remplacement bloc) | 10 min |
| Build + grep régression + tests local | 20 min |
| Backup pré + SCP + smoke + tests UI MH | 1h |
| Workflow strict (commit + push + tag + backup post + handoff + memory) | 1h |
| **Total V1** | **~3h30** |

---

## 11. ✅ STOP — Aucune ligne de code écrite

Audit READ-ONLY V1 cible précise terminé.

**Prochaine étape attendue** :
1. **MH valide les 6 décisions Q1-Q6** (Q1 critique : remplacement strict ou hybride ? Q2 : bouton IA conservé ?)
2. **Décision V3.x post-call en suspens** (commit/tag avant ou après Smart Footer ?)
3. **GO MH explicite V1 Smart Footer**

**Aucune action sans GO MH explicite.**

---

## 12. RAPPEL — 2 chantiers V3.x post-call non commités

⚠ **2 cycles V3.x non commités** :
1. **V3.x baseline** post-call smart pipeline (déployé live `dfc4f7d9`, fix double-render)
2. **V3.x UX refonte** PostCallResultModal (`index-Ca02q-dH.js` md5 `6b9cde11`, **construit local non déployé non commité**)

→ Reco : commit + tag groupé `v3.x-post-call-smart-pipeline` AVANT démarrage Smart Footer pour éviter accumulation WIP. À trancher MH.

---

**Sources** :
- Repo local : HEAD `1260869b`
- Code lu :
  - [`CollabPortal.jsx:7149-7163`](app/src/features/collab/CollabPortal.jsx#L7149-L7163) (bannière cible exacte)
  - [`CollabPortal.jsx:7187-7218`](app/src/features/collab/CollabPortal.jsx#L7187-L7218) (bannière "RDV à venir" `bottom:56` à préserver)
  - [`CollabPortal.jsx:7222-7227`](app/src/features/collab/CollabPortal.jsx#L7222-L7227) (Cockpit IA flottant `bottom:24` z-index:10002 à préserver)
- Audits antérieurs :
  - [AUDIT-SMART-FOOTER-PERFORMANCE-BAR-2026-05-03.md](docs/audits/2026-05/AUDIT-SMART-FOOTER-PERFORMANCE-BAR-2026-05-03.md) (premier audit large)
  - [AUDIT-POST-CALL-SMART-PIPELINE-2026-05-03.md](docs/audits/2026-05/AUDIT-POST-CALL-SMART-PIPELINE-2026-05-03.md)
- Memory : `feedback_phase_workflow_17_steps.md`, `feedback_code_no_root_file_piling.md`
