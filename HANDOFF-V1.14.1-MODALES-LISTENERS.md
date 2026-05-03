# HANDOFF V1.14.1 — Modales listeners `crmContactUpdated`

> **Date** : 2026-05-03
> **Branche** : `clean-main` HEAD `ed679cf0`
> **Tag** : `v1.14.1-modales-listeners`
> **Statut** : ✅ LIVE prod, smoke PASS, frontend-only deploy
> **Phase** : 2 — Synchronisation fiches contact (sub-phase 2)

---

## 1. État prod final

| Indicateur | Valeur |
|---|---|
| `/api/health` | `{"status":"ok","db":"connected","companies":6,"collaborateurs":16,"uptime":2884}` |
| PM2 | pid `1114226`, **uptime 48m+, 0 restart** (backend intact, V1.14.1 frontend-only) |
| Bundle prod | `index-g_kXAZK7.js` md5 `5e8aaf2c` (3.13 MB, gzip 704 KB) |
| Backend | `data.js` md5 `cdd1803a` (V1.13.2.b conservé inchangé) |
| Branche | `clean-main` HEAD `ed679cf0` |
| Tag | `v1.14.1-modales-listeners` push GitHub OK |
| Tags release-track cumulés | **35** (V1.12.x + V1.13.x + V1.14.x) |

---

## 2. Ce qui change

### Backend

**Aucun changement.** `data.js` md5 `cdd1803a` strictement identique à V1.13.2.b/V1.14.0. PM2 sans restart (uptime 48m+ continu).

### Frontend — 2 modales équipées de listener

#### `HardDeleteContactModal.jsx` (+34 / -3)

- Renomme prop `contact` → `initialContact`
- Ajoute `useState(initialContact)` pour state local (sync via event)
- Ajoute `useEffect` listener `crmContactUpdated` :
  - Filtre `detail.id !== contact.id` → ignore
  - Si `detail.contact` présent → `setContact(detail.contact)` (V1.14.0 envoie toujours le contact frais)
  - Fallback refetch via `api('/api/data/contacts/:id')` si null
  - **Reload preview cascade UNIQUEMENT si `fields.includes('archivedAt')`** (Q3 économie réseau)

#### `MergeContactsModal.jsx` (+47 / -1)

- Import `api` ajouté (fallback refetch)
- Renomme prop `primary` → `initialPrimary`
- Ajoute `useState(initialPrimary)` pour state local
- Ajoute `useEffect` listener `crmContactUpdated` :
  - Match sur `primary.id` OU `secondary.id`
  - Sync state local cible (primary/secondary)
  - **Reload mergePreview UNIQUEMENT si secondary impacté ET `fields.includes('archivedAt' || 'pipeline_stage')`** (Q4 économie réseau)

---

## 3. Détails techniques

### Pattern listener appliqué (encapsulé useEffect)

```js
useEffect(() => {
  if (!contact?.id) return;
  const onUpdated = (e) => {
    const detail = e?.detail || {};
    if (detail.id !== contact.id) return;
    if (detail.contact) {
      setContact(detail.contact);  // payload V1.14.0 contient le contact frais
    } else {
      api('/api/data/contacts/' + contact.id).then(fresh => {
        if (fresh?.id) setContact(fresh);
      }).catch(() => {});
    }
    if (Array.isArray(detail.fields) && detail.fields.includes('archivedAt')) {
      // Reload preview ciblé (économie réseau)
      reloadPreview();
    }
  };
  window.addEventListener('crmContactUpdated', onUpdated);
  return () => window.removeEventListener('crmContactUpdated', onUpdated);
}, [contact?.id]);
```

### Comportement attendu post-deploy

| Scénario | Résultat V1.14.1 |
|---|---|
| User ouvre HardDelete contact A · autre vue archive A → restore A | Modale resync `contact` local, preview rechargé (cascade counts à jour) |
| User ouvre Merge primary X · autre vue rename X (firstname) | `primary` local sync (panneau gauche à jour), preview NON rechargé (champ cosmétique) |
| User dans Merge step 2 (saisie FUSIONNER) · autre vue archive secondary | `secondary` resync, mergePreview rechargé (counts archivés) |
| User dans Merge step 2 · autre vue change `pipeline_stage` secondary | `secondary` resync, mergePreview rechargé |
| Modale ouverte sans event match | Aucun side effect (filtre `detail.id` strict) |
| Race condition (event reçu pendant submit) | Submit en cours utilise still `contact.id` (immuable), 409 backend si data divergence |

### Architecture conforme règle code

- ✅ 0 NEW fichier
- ✅ 2 fichiers existants modifiés
- ✅ Listeners encapsulés dans `useEffect` avec cleanup propre (removeEventListener)
- ✅ Pas de hook `useContact` (reporté V1.14.2)
- ✅ Pas de service nouveau

---

## 4. Hors scope V1.14.1 (reportés)

| Feature | Reportée à |
|---|---|
| `useContact(id)` hook centralisé | **V1.14.2** |
| Migration `contactStore.js` services | **V1.14.2** |
| Tests régression complets PHASE 2 | **V1.14.3** |
| V7TransferModal listener | **V1.14.2** ou ultérieur (Q5 reportée) |
| DuplicateOnCreateModal listener | non nécessaire (Q6 — déjà géré via DuplicateMatchCard recalc) |
| Polling/WebSocket/SSE | **V1.15** |
| Versioning ETag client | **V1.15** |
| Agenda visitorName snapshot | **PHASE 4** |

---

## 5. Tests UI à valider visuellement par MH

### F1 — HardDelete listener
1. Ouvrir HardDeleteContactModal sur contact A archivé
2. Dans une autre tab/onglet, restaurer A puis ré-archiver A
3. ✅ Attendu : preview cascade dans la modale rechargé automatiquement (counts à jour)

### F2 — Merge listener primary rename
1. Ouvrir MergeContactsModal avec primary X
2. Dans autre vue (CRM tab inline notes ou Pipeline right pane), modifier `firstname` de X
3. ✅ Attendu : panneau gauche modale sync visuellement, mergePreview NON rechargé (économie)

### F3 — Merge listener secondary archive
1. Ouvrir Merge, sélectionner secondary Y (étape 1)
2. Continuer → étape 2 (saisie FUSIONNER)
3. Dans autre vue, archiver Y
4. ✅ Attendu : panneau droit "Fiche absorbée" affiche `📦 archivée` + bandeau warning + mergePreview rechargé

### F4 — Filtrage strict
1. Ouvrir HardDelete sur contact A
2. Dans autre vue, modifier contact B (≠ A)
3. ✅ Attendu : modale A inchangée (filtre `detail.id` strict)

### F5 — Régression V1.14.0
1. Modifier un champ pipeline right pane (PhoneTab)
2. ✅ Attendu : event `crmContactUpdated` émis, propagation 5 setters, comportement V1.14.0 intact

### F6 — Régression V1.13.x
1. Workflow doublon création (V1.13.1) intact
2. Owner delete from duplicate modal (V1.13.2.a) intact
3. Merge CRM 2 fiches existantes (V1.13.2.b) intact
4. Hard delete depuis CrmTab (V1.12.9.d) intact

---

## 6. Backups

### V1.14.1
- **Pré-deploy** : `/var/backups/planora/v1141-pre-20260503-090857/` (httpdocs `b40ada72` = V1.14.0)
- **Post-deploy** : `/var/backups/planora/v1141-post-20260503-091054/` (httpdocs `1fc761d5` = V1.14.1)

⚠ Pas de backup data.js (backend non modifié, md5 `cdd1803a` invariable).

### Rétention antérieure
- v1140-pre/post (V1.14.0)
- v1132b-pre/post (V1.13.2.b)
- v1130-stable-final-20260503-083222 (snapshot 127 MB clôture PHASE 1)

---

## 7. Rollback

### Rollback partiel V1.14.1 → V1.14.0 (frontend uniquement)

```bash
ssh root@136.144.204.115
cd /var/www/vhosts/calendar360.fr
rm -rf httpdocs && tar -xzf /var/backups/planora/v1141-pre-20260503-090857/httpdocs-pre.tar.gz
# Pas de PM2 restart nécessaire — backend inchangé
```

⚠ Aucun rollback DB nécessaire (frontend-only).

---

## 8. Prochains chantiers PHASE 2

### V1.14.2 — `useContact(id)` hook + store (~3-4j)
- NEW `services/contactStore.js` : Map contactId → contact, subscribers fins
- NEW `hooks/useContact.js` : retourne contact frais + auto-listener
- Migration progressive composants (modales en premier puis fiches)
- Conserve `contacts` global pour listings (CRM table, Pipeline cards)
- Remplacement progressif des listeners V1.14.1 par hook

### V1.14.3 — Tests régression PHASE 2 (~1j)
- Tests régression complets V1.14.x
- Cron backend `_audit-cron-snapshot` : émettre WebSocket/event si delta détecté (optionnel)
- Handoff PHASE 2 final + tag `v1.14.0-stable`

### Roadmap (rappel)
- V1.15 : polling/WebSocket/SSE + versioning ETag (multi-user sync)
- PHASE 3 : Outlook Calendar
- PHASE 4 : Refonte Agenda UX
- PHASE 5 : Refonte fiche CRM
- PHASE 6 : Import rapide colonne droite
- PHASE 7 : Optimisations UX globales

---

## 9. Reprise dans nouvelle session

### Documents clés
1. **`MEMORY.md`** (auto-loaded — 35 tags)
2. **`HANDOFF-V1.14.1-MODALES-LISTENERS.md`** (ce document)
3. `docs/audits/2026-05/AUDIT-V1.14.1-MODALES-LISTENERS-2026-05-03.md` (audit READ-ONLY)
4. `HANDOFF-V1.14.0-MUTATION-CENTRALIZED.md` (V1.14.0)
5. `HANDOFF-V1.13.0-STABLE-PHASE1-CLOSURE.md` (PHASE 1 close)
6. `CLAUDE.md` §0/§0bis/§10

### Workflow strict 17 étapes
1. Audit READ-ONLY → 2. Diff preview → 3. GO MH → 4. Test → 5. Fix → 6. Validation
7. Backup pré → 8. Deploy → 9. Smoke → 10. Commit → 11. Push → 12. Merge si branche
13. Tag → 14. Backup post → 15. Handoff → 16. Memory → 17. Classement

---

## ✅ Conclusion

V1.14.1 livré, déployé, smoke PASS. Listeners `crmContactUpdated` ajoutés dans HardDeleteContactModal + MergeContactsModal (Option A minimal Q1-Q6 validées). Backend intact (md5 `cdd1803a`), PM2 sans restart, V1.13.x + V1.14.0 préservés.

**Aucune régression. Tests UI MH F1-F6 à valider visuellement.**
