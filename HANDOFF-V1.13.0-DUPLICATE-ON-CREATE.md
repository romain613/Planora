# HANDOFF V1.13.0 — Duplicate Contact UX

> **Date** : 2026-05-02
> **Tag** : `v1.13.0-duplicate-on-create`
> **Commit** : `12f6183c`
> **Statut** : ✅ LIVE prod, smoke PASS, tests UI MH à valider

---

## 1. Scope livré

Première feature post-V1.12.9. Détection doublon UX à la création manuelle de contact. Remplace l'auto-merge silencieuse historique par une modale explicite avec 3 actions.

**3 fichiers, +172/-18 lignes**.

---

## 2. Caractéristiques

### 3 actions (per spec MH)
- **Voir la fiche existante** → ouvre fiche du contact existant
- **Modifier la fiche existante** → ouvre fiche en édition
- **Créer quand même un nouveau contact** → confirm 2-step + POST `_forceCreate=true` → 2 contacts distincts

### Détection
- Email match : normalisé `lowercase().trim()` côté backend
- Phone match : normalisé `replace(/[^\d]/g, '').slice(-9)` (9 derniers chiffres, format-agnostic)
- Conflit email/phone (matches différents) → bandeau orange "Conflit doublon"
- Multi-matches → liste de cards
- **Exclus** : archivés (V1.12.5.b), perdu (V1.11.5)
- **companyId strict** : aucune fuite cross-company

### Architecture propre (pas de variable globale)
- `submitNewContact(nc, { forceCreate })` — fonction extraite, pure
- `handleCollabCreateContact` — pré-check + appel `submitNewContact`
- `duplicateOnCreateData.pendingNewContact._formSnapshot` — snapshot React state
- `onForceCreate` — callback simple qui re-call `submitNewContact(snapshot, {forceCreate:true})`
- **Aucun `window.__pendingForceCreate`** (vérifié bundle = 0 occurrence)

---

## 3. Fichiers modifiés

| Fichier | Type | Lignes |
|---|---|---:|
| [server/routes/data.js](server/routes/data.js) | MODIF | +6/-4 (`_forceCreate` flag + `createdAt` SELECT) |
| [app/src/features/collab/modals/DuplicateOnCreateModal.jsx](app/src/features/collab/modals/DuplicateOnCreateModal.jsx) | **NEW** | 100 lignes |
| [app/src/features/collab/CollabPortal.jsx](app/src/features/collab/CollabPortal.jsx) | MODIF | +78/-20 (extract submitNewContact + state + handler + render) |

---

## 4. Backend changes

### Diff #1 — POST /contacts ([data.js:329-341](server/routes/data.js#L329))
```js
// V1.13.0 — Anti-doublon : bypass si _forceCreate=true
if (!c._forceCreate && c.email) { ... }
if (!c._forceCreate && c.phone) { ... }
```

### Diff #2 — check-duplicate-single ajout `createdAt`
SELECT enrichie + propagation dans `enriched.createdAt` pour affichage "Créé le DD/MM/YYYY" dans modale.

---

## 5. Frontend architecture

### `submitNewContact(nc, { forceCreate })` — fonction extraite
```js
const submitNewContact = (nc, { forceCreate = false } = {}) => {
  const ncWithFlags = { ...nc, _forceCreate: !!forceCreate, _pending: true };
  setContacts(p => [...p, ncWithFlags]);
  setShowNewContact(false);
  setNewContactForm({...});
  showNotif(forceCreate ? 'Contact créé (doublon ignoré)' : 'Contact créé');
  api('/api/data/contacts', { method:'POST', body:ncWithFlags }).then(r => {
    // Reconcile temp id → real backend id
  });
};
```

### `handleCollabCreateContact` — pré-check
```js
const handleCollabCreateContact = () => {
  const nc = { ... };
  if (nc.email || nc.phone) {
    api('/api/data/contacts/check-duplicate-single', {...}).then(checkRes => {
      if (checkRes && checkRes.exists) {
        setDuplicateOnCreateData({
          matches, conflict,
          pendingNewContact: { name, email, phone, _formSnapshot: nc },
        });
        return;
      }
      submitNewContact(nc, { forceCreate: false });
    });
    return;
  }
  submitNewContact(nc, { forceCreate: false });
};
```

### Render modal (état React pur)
```jsx
{duplicateOnCreateData && (
  <DuplicateOnCreateModal
    data={duplicateOnCreateData}
    onClose={() => setDuplicateOnCreateData(null)}
    onViewExisting={(match, mode) => {
      setDuplicateOnCreateData(null);
      setShowNewContact(false);
      setSelectedCrmContact({ ...match, _editFromDuplicate: mode === 'edit' });
    }}
    onForceCreate={() => {
      const snapshot = duplicateOnCreateData?.pendingNewContact?._formSnapshot;
      setDuplicateOnCreateData(null);
      if (snapshot) submitNewContact(snapshot, { forceCreate: true });
    }}
  />
)}
```

---

## 6. Build + deploy

| Étape | Résultat |
|---|---|
| `node --check server/routes/data.js` | ✅ |
| Build Vite v7.3.1 | ✅ 2.51s, 173 modules |
| Bundle | `index-BnGl9Xxe.js` 3.10 MB (gzip 698 KB) |
| Vérification python strings | 12/12 ✅ + `__pendingForceCreate=0` ✅ |
| SCP backend + frontend | ✅ md5 local=VPS `3e9ee270` |
| PM2 restart | pid 1053934, uptime 3s |

### Bundle verification (12 strings)
| String | Count |
|---|---:|
| `_forceCreate` | 2 ✅ |
| `_formSnapshot` | 2 ✅ |
| `check-duplicate-single` | 2 ✅ |
| `Voir la fiche` | 2 ✅ |
| `Modifier la fiche` | 1 ✅ |
| `Créer quand même` | 1 ✅ |
| `doublon ignoré` | 1 ✅ |
| `Vous saisissez` | 2 ✅ |
| `Conflit doublon` | 1 ✅ |
| `Même téléphone` | 1 ✅ |
| `Même email` | 1 ✅ |
| `__pendingForceCreate` | **0** ✅ (aucune var globale) |

---

## 7. Smoke post-deploy (4/4 PASS)

| # | Test | Résultat |
|---|---|---|
| S1 | `/api/health` | HTTP 200, uptime 23s ✅ |
| S2 | `index-BnGl9Xxe.js` direct | HTTP 200, size 3.10 MB ✅ |
| S3 | `check-duplicate-single` sans auth | HTTP 401 (sécurité) ✅ |
| S4 | PM2 stable | pid 1053934, uptime 93s, **0 unstable_restart** ✅ |

---

## 8. Tests UI MH (F1-F8 à valider)

| # | Setup | Action | Attendu |
|---|---|---|---|
| F1 | Login admin/membre, créer contact avec email **existant** d'un actif | Submit | Modal s'ouvre, badge "📧 Même email" |
| F2 | Créer contact avec phone **existant** | Submit | Modal s'ouvre, badge "📞 Même téléphone" |
| F3 | Email + phone matchant **2 contacts différents** | Submit | Bandeau "⚠️ Conflit détecté" + 2 cards |
| F4 | Click "Voir la fiche" | — | Modal close, fiche existante s'ouvre, formulaire reset |
| F5 | Click "Modifier la fiche" | — | Modal close, fiche existante s'ouvre |
| F6 | Click "Créer quand même" → window.confirm OK | — | 2ème contact créé, toast "doublon ignoré" |
| F7 | Click "Créer quand même" → window.confirm Annuler | — | Modal reste ouverte, aucune création |
| F8 | Email/phone d'un contact **archivé** | Submit | Pas de match (archivés filtrés) → création directe |

### Tests régression
- ✅ ScheduleRdvModal V1.8.22 (DuplicateResolverModal RDV) inchangé — backend `_duplicate:true` legacy préservé
- ✅ Quick add téléphone (handleQuickAddContact) hors scope V1.13.0 — comportement actuel inchangé
- ✅ Import CSV (`/check-duplicates` batch) inchangé

---

## 9. Backups VPS

| Path | Rôle | md5 |
|---|---|---|
| `/var/backups/planora/v1130-pre/data.js` | Pré (rollback backend) | `ba981efc` |
| `/var/backups/planora/v1130-pre/calendar360.db` | Pré DB | `854d0d98` |
| `/var/backups/planora/v1130-pre/httpdocs-pre.tar.gz` | Pré bundle V1.12.9.d | `3ec07752` |
| `/var/backups/planora/v1130-post/data.js` | Post backend V1.13.0 | `3e9ee270` |
| `/var/backups/planora/v1130-post/calendar360.db` | Post DB (inchangée) | `854d0d98` |
| `/var/backups/planora/v1130-post/httpdocs-post.tar.gz` | Post bundle V1.13.0 | `aaedc9d0` |

---

## 10. Sécurité — checklist (per spec MH)

| Exigence | État |
|---|---|
| Email lowercase/trim | ✅ Backend conforme |
| Phone normalisé | ✅ `replace(/[^\d]/g,'').slice(-9)` |
| companyId strict | ✅ Toutes les queries filtrées |
| Ignorer archivés | ✅ V1.12.5.b filter |
| Ignorer perdu | ✅ V1.11.5 filter |
| Jamais cross-company | ✅ Enforced backend |
| Pas de fusion automatique | ✅ Modal explicite remplace `_duplicate:true` silent |
| Pas d'écrasement | ✅ `_forceCreate=true` crée nouveau, pas UPDATE |
| Pas de modif autre contact | ✅ Aucun UPDATE déclenché |
| Confirmation "Créer quand même" | ✅ window.confirm 2-step |

---

## 11. Rollback (si tests UI MH KO)

```bash
ssh root@136.144.204.115
cp /var/backups/planora/v1130-pre/data.js /var/www/planora/server/routes/data.js
pm2 restart calendar360
cd /var/www/vhosts/calendar360.fr/httpdocs
tar -xzf /var/backups/planora/v1130-pre/httpdocs-pre.tar.gz
# Bundle revient à index-DrJxtjrJ.js (V1.12.9.d)
```

---

## 12. Workflow strict (11/11 OK)

1. ✅ Audit READ-ONLY V1.13.0 (validé MH)
2. ✅ Diff preview corrigé (suppression window globale)
3. ✅ 3 fichiers appliqués (NEW + 2 MODIF)
4. ✅ `node --check` data.js
5. ✅ Build Vite + bundle vérification 12/12 strings
6. ✅ Diff finale + GO MH
7. ✅ Backup pré (data.js + DB + httpdocs tarball)
8. ✅ SCP backend + frontend + PM2 restart
9. ✅ Smoke 4/4 PASS
10. ✅ Commit `12f6183c` + tag + push
11. ✅ Backup post + handoff (ce document)

---

## 13. Tags V1.12+V1.13 cumulés

22 V1.12 tags + **1 V1.13.0** = **23 tags release-track** dans `clean-main`.

---

## 14. Reste / Suite

- Tests UI F1-F8 à valider visuellement par MH
- Tests régression V1.13.0.e (~30min) si MH souhaite cycle de validation comme V1.12.9.e
- V1.13.0+ futur : étendre détection doublon à `handleQuickAddContact` (téléphone, hors scope V1.13.0)
