# HANDOFF V1.14.0 — Mutation contact centralisée + `crmContactUpdated` event

> **Date** : 2026-05-03
> **Branche** : `clean-main` HEAD `71d35fed`
> **Tag** : `v1.14.0-mutation-centralized`
> **Statut** : ✅ LIVE prod, smoke PASS, frontend-only deploy
> **Phase** : 2 — Synchronisation fiches contact (premier coup minimaliste)

---

## 1. État prod final

| Indicateur | Valeur |
|---|---|
| `/api/health` | `{"status":"ok","db":"connected","companies":6,"collaborateurs":16}` |
| PM2 | pid `1114226`, **uptime 30m+, 0 restart** (backend intact, V1.14.0 frontend-only) |
| Bundle prod | `index-DhMHPAUx.js` md5 `c7a1f9de` (3.13 MB, gzip 703 KB) |
| Backend | `data.js` md5 `cdd1803a` (V1.13.2.b conservé) |
| Branche | `clean-main` HEAD `71d35fed` |
| Tag | `v1.14.0-mutation-centralized` push GitHub OK |
| Tags release-track cumulés | **34** (V1.12.x + V1.13.x + V1.14.x) |

---

## 2. Ce qui change

### Backend

**Aucun changement.** Backend `data.js` md5 `cdd1803a` strictement identique à V1.13.2.b. Aucun PM2 restart nécessaire (uptime 30m+ inchangé).

### Frontend

**2 fichiers modifiés (+30 / -2 lignes total)** :

#### `app/src/features/collab/CollabPortal.jsx` (+6 lignes)

`handleCollabUpdateContact` émet désormais un window event `crmContactUpdated` à 2 emplacements :

1. **Après save backend OK** (ligne ~3162) :
```js
window.dispatchEvent(new CustomEvent('crmContactUpdated', {
  detail: {
    id,
    contact: r.contact || null,         // contact frais si backend l'a retourné
    source: updates._source || 'manual', // origine : 'pipeline_right', 'pipeline_right_cf', etc.
    fields: Object.keys(updates).filter(k => !k.startsWith('_'))
  }
}));
```

2. **Sur 409 Conflict resolved** (ligne ~3148) :
```js
window.dispatchEvent(new CustomEvent('crmContactUpdated', {
  detail: { id, contact: fresh, source: 'conflict_resolved', fields: Object.keys(updates) }
}));
```

→ Aucun listener consumer en V1.14.0 (préparation pour V1.14.1+).

#### `app/src/features/collab/tabs/PhoneTab.jsx` (+24 / -2 lignes)

**`_upd` inline** (saisie champ pipeline right pane) :
- Avant : 3 setters fan-out manuel + API direct (sans 409 handling)
- Après : optimistic UI immediate sur `pipelineRightContact` + `handleCollabUpdateContact` débounce 600ms

**`saveCF` custom_fields** (champs perso pipeline right pane) :
- Avant : 3 setters + API direct
- Après : optimistic UI immediate + `handleCollabUpdateContact` débounce 800ms

**Bénéfices** :
- Risque R1 (mirrors triplés non garantis) → 0 dans pipeline right pane
- Risque R7 (chemin dupliqué sans 409) → résolu
- Cohérence avec `handleCollabUpdateContact` : 5 setters + 409 + retry 3x + cascade perdu + audit log + event

---

## 3. Détails techniques

### Pattern centralisé final

```
PhoneTab _upd / saveCF
   ↓
handleCollabUpdateContact(id, updates)  (CollabPortal)
   ├── Optimistic propagation (5 setters synchrones)
   │   - setContacts (canonique liste)
   │   - setSelectedCrmContact (modal CRM)
   │   - setPipelineRightContact (panneau droit)
   │   - setSelectedContact (PhoneTab)
   │   - setAllContacts (AdminDash)
   ├── PUT /api/data/contacts/:id (avec retry 3x + 409 handling)
   ├── Émission event 'crmContactUpdated' (success + 409)
   └── Cascade perdu si pipeline_stage='perdu' (V1.7.5)
```

### Régression UX mineure assumée

Pendant les 600ms (ou 800ms custom_fields) du debounce, **seul `pipelineRightContact` reflète la valeur saisie**. Les autres setters (`contacts`, `selectedCrmContact`) sont synchronisés au moment du PUT.

→ Si l'utilisateur switch tab pendant la frappe d'un champ, il voit l'ancienne valeur (max 600ms). Comportement quasi-identique à V1.13.x (debounce déjà existant), juste centralisé.

**Validée explicitement par MH avant deploy.**

### Event broadcast — payload détail

| Champ | Type | Description |
|---|---|---|
| `id` | string | contactId modifié |
| `contact` | object \| null | contact frais retourné par backend (si dispo) |
| `source` | string | `'manual'` \| `'pipeline_right'` \| `'pipeline_right_cf'` \| `'conflict_resolved'` \| etc. |
| `fields` | string[] | liste champs modifiés (filtré sans clés `_*`) |

---

## 4. Hors scope V1.14.0 (reportés)

| Feature | Reportée à |
|---|---|
| Listeners modales (HardDelete, Merge, FicheModal) | **V1.14.1** (~1j) |
| `useContact(id)` hook centralisé | **V1.14.2** (~3-4j) |
| Tests régression complets + cron backend push | **V1.14.3** (~1j) |
| Polling périodique `/api/init` | **V1.15** |
| WebSocket/SSE multi-user sync | **V1.15** |
| Versioning ETag client | **V1.15** |
| Agenda `visitorName` snapshot | **PHASE 4 — Refonte Agenda UX** |

---

## 5. Tests à valider visuellement par MH

### F1 — Mutation pipeline right pane → propagation
- Ouvrir Pipeline Live, sélectionner contact dans panneau droit
- Modifier un champ (email, phone, mobile, address…)
- Attendre 600ms (debounce)

✅ Attendu :
- `pipelineRightContact` à jour immédiat (UI réactive)
- Liste cards Pipeline Live à jour après debounce
- Si user ouvre la fiche CRM du même contact → champ à jour
- Console : `[CONTACT SAVE] OK: <id> <fields>`

### F2 — Mutation custom field → propagation
- Pipeline right pane → modifier un champ perso
- ✅ Attendu : same as F1, debounce 800ms

### F3 — Régression CRM tab inline (non touché)
- Ouvrir CRM tab → cliquer fiche contact → modifier notes
- ✅ Attendu : comportement strictement identique à V1.13.x (timer 800ms inline non modifié)

### F4 — Régression Pipeline drag-drop
- Drag contact sur autre stage Pipeline Live
- ✅ Attendu : `handlePipelineStageChange` fonctionne (utilise déjà `handleCollabUpdateContact`)

### F5 — Listener event console
Ouvrir DevTools console, ajouter :
```js
window.addEventListener('crmContactUpdated', (e) => console.log('crmContactUpdated:', e.detail));
```
Modifier un champ depuis pipeline right → l'event apparaît avec `{ id, contact, source: 'pipeline_right', fields: [...] }`

### F6 — Régression V1.13.x intacte
- V1.13.0 modale doublon création
- V1.13.1 force-create + match card
- V1.13.2.a delete owner
- V1.13.2.b merge CRM
✅ Tous fonctionnent comme avant

---

## 6. Backups

### V1.14.0
- **Pré-deploy** : `/var/backups/planora/v1140-pre-20260503-085143/` (httpdocs-pre md5 `5429da12` = V1.13.2.b)
- **Post-deploy** : `/var/backups/planora/v1140-post-20260503-085346/` (httpdocs-post md5 `b40ada72` = V1.14.0)

⚠ Backup data.js inutile (backend non modifié, md5 `cdd1803a` invariable).

### Rétention antérieure
- v1132b-pre/post (V1.13.2.b)
- v1132a-pre/post (V1.13.2.a)
- **v1130-stable-final-20260503-083222** (snapshot 127 MB clôture PHASE 1)
- + tous backups V1.12.x

---

## 7. Rollback

### Rollback partiel V1.14.0 → V1.13.2.b (frontend uniquement)

```bash
ssh root@136.144.204.115
cd /var/www/vhosts/calendar360.fr
rm -rf httpdocs && tar -xzf /var/backups/planora/v1140-pre-20260503-085143/httpdocs-pre.tar.gz
# Pas de PM2 restart nécessaire — backend inchangé
```

⚠ Aucun rollback DB nécessaire (V1.14.0 frontend-only).

---

## 8. Prochains chantiers

### V1.14.1 — Listeners modales (~1j)
- HardDeleteContactModal listener `crmContactUpdated` → re-fetch contact si event match
- MergeContactsModal idem (primary + secondary si sélectionné)
- FicheContactModal idem

### V1.14.2 — `useContact(id)` hook + store (~3-4j)
- NEW `services/contactStore.js` : Map contactId → contact, subscribers fins
- NEW `hooks/useContact.js` : retourne contact frais + auto-listener
- Migration progressive composants (modales en premier, puis fiches)
- Conserve `contacts` global pour listings (CRM table, Pipeline cards)

### V1.14.3 — Tests + cron backend push optionnel (~1j)
- Tests régression complets V1.14.x
- Cron backend `_audit-cron-snapshot` : émettre WebSocket/event si delta détecté (optionnel)
- Handoff PHASE 2 final

### Roadmap PHASE 2 (rappel)
- V1.14.x : sync fiches contact (en cours)
- V1.15 : polling/WebSocket/SSE + versioning ETag
- PHASE 3 : Outlook Calendar
- PHASE 4 : Refonte Agenda UX (Agenda visitorName snapshot)
- PHASE 5 : Refonte fiche CRM
- PHASE 6 : Import rapide colonne droite
- PHASE 7 : Optimisations UX globales

---

## 9. Reprise dans nouvelle session

### Documents clés
1. **`MEMORY.md`** (auto-loaded — 34 tags)
2. **`HANDOFF-V1.14.0-MUTATION-CENTRALIZED.md`** (ce document)
3. `docs/audits/2026-05/AUDIT-V1.14.0-CONTACT-SYNC-2026-05-03.md` (audit READ-ONLY V1.14.0)
4. `HANDOFF-V1.13.0-STABLE-PHASE1-CLOSURE.md` (clôture PHASE 1)
5. `CLAUDE.md` §0/§0bis/§10

### Workflow strict 17 étapes (gravé 2026-05-03)
1. Audit READ-ONLY → 2. Diff preview → 3. GO MH → 4. Test → 5. Fix → 6. Validation
7. Backup pré → 8. Deploy → 9. Smoke → 10. Commit → 11. Push → 12. Merge si branche
13. Tag → 14. Backup post → 15. Handoff → 16. Memory → 17. Classement

### Règle code "pas d'empilage"
Toute nouvelle feature : créer composants/services/handlers/hooks/utils dédiés. Pas d'empilage dans CollabPortal/App/data.js/init.js. ≤ 50 lignes ajoutées au fichier racine, sinon refactor avant deploy.

---

## ✅ Conclusion

V1.14.0 livré, déployé, smoke PASS. Mutation contact centralisée via `handleCollabUpdateContact` dans PhoneTab pipeline right pane. Event `crmContactUpdated` émis (consumers V1.14.1+). Backend intact, frontend-only deploy. PM2 sans restart. CrmTab non touché.

**Aucun changement DB. Aucun changement Agenda/Reporting/Pipeline métier. Régression UX 600ms acceptée par MH.**
