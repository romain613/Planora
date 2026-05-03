# HANDOFF V3.x.2 — Smart Footer V2 personnalisation KPI

> **Date** : 2026-05-03
> **Tag** : `v3.x.2-smart-footer-v2`
> **Commit** : `3a7d4958`
> **Branche** : `clean-main` (pushed origin)
> **Bundle prod** : `index-ipUAS9zW.js` md5 `13cb921fc94381c76b75c2bf1ef49931`
> **Backend** : inchangé (stats.js V1 endpoint `/footer-kpis` réutilisé)
> **Statut** : ✅ LIVE sur https://calendar360.fr

---

## 0. RÉSUMÉ EXÉCUTIF

V3.x.2 active le bouton ➕ du SmartFooterBar (V1 placeholder disabled) pour permettre au collab de **personnaliser ses KPI affichés** :

- Click ➕ → popover ancré "Ajouter un indicateur"
- Liste : **stages PIPELINE_STAGES résolus** dynamiques + V1 fixes restants
- Multi-add (popover reste ouvert)
- Tous KPI **retirables au hover** (incl. fixes V1 calls/RDV)
- Persist `localStorage c360-footer-kpis-{collabId}`
- Limite 6 KPI max
- 0 backend, 0 DDL, 1 fichier patché

**Décisions Q1-Q4 validées MH 2026-05-03** :
- Q1 ✅ A : Tous KPI retirables (perso totale)
- Q2 ✅ B : Popover reste ouvert pour multi-add
- Q3 ✅ A : Skip métriques avancées V2 (pipeline stages only)
- Q4 ✅ A : Skip bouton reset V2

---

## 1. CHANGEMENTS

### 1.1 Périmètre code (1 fichier patché, 0 NEW, 0 backend, 0 DDL)

| Fichier | Δ | Type |
|---|---|---|
| [`SmartFooterBar.jsx`](app/src/features/collab/components/SmartFooterBar.jsx) | +336 / -115 | PATCH (rewrite avec V2 features) |
| [`AUDIT-SMART-FOOTER-V2-PERSONNALISATION-2026-05-03.md`](docs/audits/2026-05/AUDIT-SMART-FOOTER-V2-PERSONNALISATION-2026-05-03.md) | +366 NEW | Audit READ-ONLY pré-implémentation |
| **Total** | **+687/-115** | 1 PATCH + 1 NEW audit |

### 1.2 Architecture V2

```
SmartFooterBar.jsx (V2)
├─ Sources V1 (réutilisées) :
│   ├─ KPI_FIXED_DEFS = { calls_today, rdv_count }
│   └─ Backend GET /api/stats/collab/:id/footer-kpis (callsToday)
│
├─ V2 dynamique :
│   ├─ STAGE_EMOJI_MAP : 14 stages mappés (cohérent V3.x PostCallResultModal)
│   ├─ buildKpiDef(kpiId, PIPELINE_STAGES) : V1 fixe OU stage_<id> dynamique
│   ├─ DEFAULT_KPI_IDS : 4 KPI V1 fallback (premier load)
│   └─ Filter défensif : retourne null si stage retiré → kpis.filter(Boolean) drop orphelin
│
├─ State V2 :
│   ├─ kpiList (array d'IDs depuis localStorage)
│   ├─ showAddMenu (popover open/close)
│   ├─ hoveredKpi (pour bouton ✕ retirer)
│   └─ refs : popoverRef + addBtnRef (click outside)
│
├─ Effects V2 :
│   ├─ Reload localStorage si change collab
│   ├─ Click outside listener (mousedown global, cleanup propre)
│   └─ Refresh 60s setInterval inchangé V1
│
├─ Persist localStorage :
│   ├─ Key : c360-footer-kpis-{collabId}
│   ├─ Format : JSON array d'IDs
│   ├─ try/catch + Array.isArray check + slice(0, 6) garde-fou
│   └─ Fallback DEFAULT_KPI_IDS si corrompu
│
└─ Render V2 :
    ├─ KPI chips (hover → bouton ✕ couleur stage)
    ├─ Bouton ➕ activé toggle popover (border accent quand ouvert)
    ├─ Popover ancré bottom calc(100% + 8px)
    │   ├─ Header "Ajouter un indicateur" + ✕ fermer
    │   ├─ Liste availableKpis (V1 fixes restants + stages dispo)
    │   ├─ Click stage → addKpi (popover RESTE OUVERT pour multi-add Q2=B)
    │   └─ Footer compteur "X / 6 KPI affichés"
    └─ Bouton IA conditionnel ai_copilot_enabled INTACT
```

---

## 2. TESTS UI MH OK CONFIRMÉ

T1-T22 cités dans l'audit V2 — MH a validé l'ensemble fonctionnel après hard-refresh navigateur.

Couverture :
- **T1-T13** Fonctionnels V2 (popover, multi-add, retirer, persist, limit, click outside, fallback)
- **T14-T22** Régression sanitaire (V1 backward compat, IA conditionnel, position/style/z-index, footer per-contact, bannière RDV, Cockpit, modaux post-call, refresh 60s, edge cases)

---

## 3. DÉPLOIEMENT — workflow strict 17 étapes

1. ✅ Audit READ-ONLY ([AUDIT-V2](docs/audits/2026-05/AUDIT-SMART-FOOTER-V2-PERSONNALISATION-2026-05-03.md))
2. ✅ Diff preview présenté MH avant code
3. ✅ GO MH explicite Q1-Q4
4. ✅ Patch unique `SmartFooterBar.jsx` (+336/-115)
5. ✅ Build local Vite — `index-ipUAS9zW.js` md5 `13cb921f…` — 2.47s
6. ✅ STOP avant SCP — diff final présenté MH
7. ✅ Backup pré VPS — `httpdocs-pre-20260503-182409.tar.gz` md5 `abce6d52…`
8. ✅ Deploy SCP `dist/*` → `/var/www/vhosts/calendar360.fr/httpdocs/`
9. ✅ PM2 restart `calendar360` (PID 1138892)
10. ✅ Smoke `/api/health` (status ok, 6 companies, 16 collabs)
11. ✅ Tests UI MH OK confirmé (T1-T22)
12. ✅ Pas de fix nécessaire
13. ✅ Re-test : N/A
14. ✅ Commit `3a7d4958` (2 fichiers, +687/-115)
15. ✅ Push origin `clean-main`
16. ✅ Tag `v3.x.2-smart-footer-v2` pushed
17. ✅ Backup post VPS — `httpdocs-post-20260503-182719.tar.gz` md5 `1bdfdd07…`
18. ✅ Handoff (ce doc) + memory + classement

### Sécurité / rollback

| Backup | md5 | Localisation |
|---|---|---|
| **Pré V2** | `abce6d52…` | `/var/backups/planora/v3x2-footer-pre/httpdocs-pre-20260503-182409.tar.gz` |
| **Post V2** | `1bdfdd07…` | `/var/backups/planora/v3x2-footer-post/httpdocs-post-20260503-182719.tar.gz` |

Rollback ~30s :
```bash
cd /var/www/vhosts/calendar360.fr && rm -rf httpdocs && tar xzf /var/backups/planora/v3x2-footer-pre/httpdocs-pre-20260503-182409.tar.gz
```

### État VPS final
```
/api/health → {"status":"ok","db":"connected","companies":6,"collaborateurs":16,"uptime":170+}
Bundle md5 (VPS) → 13cb921fc94381c76b75c2bf1ef49931 (= local exact)
index.html ref → index-ipUAS9zW.js
HTTPS GET / → HTTP/2 200 nginx
```

---

## 4. GARANTIES PRÉSERVÉES

- ✅ **V1 backward compat 100%** : sans localStorage → 4 KPI fixes V1 par défaut (DEFAULT_KPI_IDS)
- ✅ Position/style/z-index/responsive identiques V1
- ✅ Bouton IA conservé conditionnel `ai_copilot_enabled`
- ✅ Backend `/api/stats/collab/:id/footer-kpis` inchangé (même endpoint V1)
- ✅ z-index popover 9991 > footer 9989, < Cockpit IA 10002
- ✅ Filter défensif R2 stages orphelins (silencieux, pas de crash)
- ✅ Fallback localStorage corrompu (try/catch + Array.isArray + slice 6 garde-fou)
- ✅ Multi-add fluide (popover reste ouvert Q2=B)
- ✅ Click outside / bouton ✕ ferme proprement (mousedown listener cleanup)
- ✅ Refresh 60s setInterval + cleanup intervals
- ✅ useMemo perf (recalcul kpis si change kpiList/contacts/bookings/PIPELINE_STAGES)
- ✅ Footer per-contact PhoneTab.jsx:1664 → 0 modif
- ✅ Bannière "RDV à venir" CollabPortal:7187 → 0 modif
- ✅ Cockpit IA flottant CollabPortal:7222 → 0 modif
- ✅ Modaux post-call (NrpPostCallModal, PostCallResultModal V3.x) → z-index ≥ 9990 prioritaires sur footer (mais popover 9991 = collision théorique uniquement, action utilisateur séquentielle)

---

## 5. COMMENT ÇA MARCHE — UX flow

### Premier load (vide localStorage)
```
DEFAULT_KPI_IDS = ['calls_today', 'rdv_count', 'stage_qualifie', 'stage_nrp']
→ 4 KPI fixes affichés (cohérent V1)
```

### Click ➕
```
Popover s'ouvre sous le bouton (vers le haut puisque footer en bas)
→ Header "Ajouter un indicateur" + ✕
→ Section "Statuts pipeline & métriques"
→ Liste availableKpis :
   - calls_today (si retiré V1)
   - rdv_count (si retiré V1)
   - stage_contacte / stage_rdv_programme / stage_client_valide / stage_perdu
   - stage_<custom> (NRP2, NRP4, etc.)
   (filtré : pas 'nouveau', pas déjà actifs)
→ Footer compteur "X / 6 KPI affichés"
```

### Click stage dans popover
```
addKpi(kpiId)
→ Check kpiList.length < 6
→ Check pas déjà dedans
→ kpiList = [...kpiList, kpiId]
→ saveKpiList(collabId, next) → localStorage
→ Popover RESTE OUVERT (Q2=B multi-add)
→ Bouton "+" du stage ajouté disparaît de la liste (filter actifs)
```

### Hover KPI chip
```
hoveredKpi = kpi.id
→ Bouton ✕ apparaît à droite du chip (couleur stage)
```

### Click ✕ KPI
```
removeKpi(kpiId)
→ kpiList = kpiList.filter(id => id !== kpiId)
→ saveKpiList(collabId, next) → localStorage
→ KPI disparaît immédiatement du footer
→ Stage redevient ajoutable dans popover
```

### Click outside popover
```
mousedown listener global :
→ Si target ∉ popover ET ∉ bouton ➕ → setShowAddMenu(false)
→ Cleanup au unmount
```

### Limite 6 atteinte
```
kpiList.length >= 6 :
→ Bouton ➕ disabled (sauf si menu déjà ouvert pour pouvoir le fermer)
→ Tous boutons "+" du popover disabled
→ Message "Maximum 6 KPI atteint"
```

---

## 6. ROADMAP IMMÉDIATE POST-V2

| Priorité | Sub-phase | Description | Effort | Statut |
|:---:|---|---|:---:|:---:|
| 1 | **V3 Smart Footer** | Drill-down click KPI = filtre Pipeline Live ou CRM par stage | ~2h | backlog |
| 2 | **V4 Smart Footer** | Migration localStorage → DB `collaborators.footer_kpis_json` + endpoints (pattern Phase 2 `call_scripts_json`) — multi-device sync | ~3h | backlog |
| 3 | **Métriques avancées** | Durée moy appel, taux conv, gagné/perdu ratio (nouvel endpoint backend stats) | ~4h | backlog |
| 4 | **PHASE 3 Outlook** | Phase 1 backend service + routes + DDL | ~2j | en attente Azure AD MH |

---

## 7. POINTS D'ATTENTION POUR PROCHAINE SESSION

1. **localStorage perdu si change device** — accepté V2, V4 migration DB recommandée si MH veut multi-device
2. **z-index popover 9991** — théoriquement au-dessus modaux post-call 9990, mais collision réelle improbable (action utilisateur séquentielle). Si MH le voit en prod, baisser à 9988 (mais alors masqué par footer).
3. **Stages template `readOnly`** — KPI custom autorisés (lecture stages OK même mode template, customisation = pref UI personnelle)
4. **Métriques avancées hors V2** — Si MH veut "durée moy appel" ou "taux conv", nouvel endpoint backend stats requis (V3+)
5. **Memory MEMORY.md > 24.4KB** — warning persistant. Compresser entries V1.13/V1.14/V2.x/V3.x recommandé prochaine session.

---

## 8. RÉCAP CYCLE V3.x — clôture journée 2026-05-03

| Phase | Tag | Périmètre | Statut |
|---|---|---|:---:|
| V3.x | `v3.x-post-call-smart-pipeline` | NEW PostCallResultModal dynamique + endpoint stats + UX SaaS premium top 6 + icônes + Recommandé + fix double-render PhoneTab | ✅ |
| V3.x.1 | `v3.x.1-smart-footer-v1` | NEW SmartFooterBar (4 KPI fixes + ➕ disabled + IA) + endpoint stats footer-kpis | ✅ |
| **V3.x.2** | **`v3.x.2-smart-footer-v2`** | **➕ activé + popover + multi-add + persist localStorage + retirables** | **✅ (ce livrable)** |

**Total cycle V3.x sur 2026-05-03** : 3 tags livrés, 7 fichiers patchés/créés cumulés, 1 NEW endpoint backend, 0 DDL.

---

**Source :**
- Repo : HEAD `3a7d4958` (clean-main)
- Tag : `v3.x.2-smart-footer-v2`
- Audit pré : [AUDIT-SMART-FOOTER-V2-PERSONNALISATION-2026-05-03.md](docs/audits/2026-05/AUDIT-SMART-FOOTER-V2-PERSONNALISATION-2026-05-03.md)
- Pré-requis : V1 [project_v3x1_smart_footer_v1.md](memory/project_v3x1_smart_footer_v1.md)
