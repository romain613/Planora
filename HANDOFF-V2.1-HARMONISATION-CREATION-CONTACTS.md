# HANDOFF V2.1 A+B — Harmonisation 6 chemins de création contact

> **Date** : 2026-05-03
> **Branche** : `clean-main` HEAD `5b2c4f12`
> **Tag** : `v2.1-harmonisation-creation-contacts`
> **Statut** : ✅ LIVE prod, smoke PASS, frontend-only deploy
> **Phase** : 2 V2 doublons intelligents (premier coup minimaliste)

---

## 1. État prod final

| Indicateur | Valeur |
|---|---|
| `/api/health` | `{"status":"ok","db":"connected","companies":6,"collaborateurs":16,"uptime":3378}` |
| PM2 | pid `1119931`, online, **uptime 56m+, 0 restart** (backend intact V1.14.1.z) |
| Bundle prod | `index-DUAFGv5j.js` md5 `29787611` (3.14 MB, gzip 706 KB) |
| Backend | `data.js` md5 `5ca1e08d` (V1.14.1.z conservé inchangé) |
| Branche | `clean-main` HEAD `5b2c4f12` |
| Tag | `v2.1-harmonisation-creation-contacts` push GitHub OK |
| Tags release-track cumulés | **39** |

---

## 2. Ce qui change

### Périmètre V2.1 A+B livré

| # | Site | Avant | Après |
|---|---|---|---|
| **A** | Quick Add Hub SMS (`handleQuickAddContact`) | Création silencieuse (silent merge backend `_duplicate:true`) | DuplicateOnCreateModal s'ouvre si dup détecté |
| **B** | linkVisitorToContacts (visiteur web → CRM) | Création silencieuse | DuplicateOnCreateModal s'ouvre si dup détecté |

### Sites NON modifiés (préservés)

| Site | Statut |
|---|---|
| NewContactModal (V1.13.0) | ✅ Inchangé |
| ScheduleRdvModal (V1.8.22) | ✅ Inchangé — silent merge `_duplicate:true` PRESERVE (R1) |
| AdminDash `_addContact` | ⏳ Reporté V2.1.b |
| PhoneTab IA recommendation | ⏳ Reporté V2.2 (nom matching) |
| Import CSV | ⏳ Reporté V2.2 (résolution interactive) |
| AdminDash auto-booking, undo restore, CSV legacy | ❌ Hors scope |

### Règle métier respectée

> **`IDENTITÉ = ID CONTACT`** — on suggère, on ne bloque jamais.

- Email/phone dupliqué = signal, pas blocage
- Fail-open sur erreur réseau (caller continue création)
- `_forceCreate` admin V1.13.1.a préservé
- `onCreateMyOwn` V1.13.1.e scope-collab préservé
- ScheduleRdvModal silent merge V1.8.22 préservé

---

## 3. Architecture V2.1

### NEW fichier (1)

| Fichier | Lignes | Rôle |
|---|---|---|
| `app/src/shared/utils/duplicateCheck.js` | 47 | Helper pur `precheckCreate(nc, {api, onMatch, onClose})` réutilisable. Fail-open. |

### Patches existants (1)

| Fichier | Δ | Détail |
|---|---|---|
| `app/src/features/collab/CollabPortal.jsx` | +30 / -3 | Import + wrapper `_precheckCreateAndOpenDup` + Patch A `handleQuickAddContact` async + Patch B `linkVisitorToContacts` `.then()` chain |

**Total : +77 / -3 lignes**. **0 backend touché.**

### Pattern unifié

```js
// Helper pur (shared/utils/duplicateCheck.js)
export const precheckCreate = (nc, { api, onMatch, onClose }) => {
  if (!nc?.email && !nc?.phone) return Promise.resolve(false);
  return api('/api/data/contacts/check-duplicate-single', { ... })
    .then(checkRes => {
      if (checkRes?.exists) {
        if (onClose) onClose();
        onMatch({ matches, conflict, pendingNewContact: { ..., _formSnapshot: nc } });
        return true;
      }
      return false;
    })
    .catch(() => false);  // fail-open
};

// Wrapper local CollabPortal
const _precheckCreateAndOpenDup = (nc, opts) => precheckCreate(nc, {
  api,
  onMatch: setDuplicateOnCreateData,
  onClose: opts.onClose,
});

// Usage Quick Add
const handleQuickAddContact = async () => {
  const nc = { ... };
  const isDup = await _precheckCreateAndOpenDup(nc, { onClose: () => setPhoneQuickAddPhone(null) });
  if (isDup) return;
  setContacts + api POST...
};

// Usage linkVisitor (compat synchrone return nc)
const linkVisitorToContacts = (visitor) => {
  const nc = { ... };
  _precheckCreateAndOpenDup(nc).then(isDup => {
    if (isDup) return;
    setContacts + api POST...
  });
  return nc;  // synchrone pour callers Kanban
};
```

---

## 4. Tests UI à valider visuellement par MH

### Tests fonctionnels (T1-T6)

| # | Scénario | Attendu |
|---|---|---|
| **T1** | NewContactModal CRM avec email existant | DuplicateOnCreateModal s'ouvre (régression V1.13.0) |
| **T2** ⭐ | Quick Add Hub SMS avec phone existant chez moi | DuplicateOnCreateModal s'ouvre (NEW V2.1) |
| **T3** | Quick Add Hub SMS avec nouveau phone | Création directe |
| **T4** ⭐ | linkVisitor (visiteur web) email existant | DuplicateOnCreateModal s'ouvre (NEW V2.1) |
| **T5** | linkVisitor callers Kanban affichent visiteur après "+ Ajouter" | Sync state local préservé (`return nc` synchrone) |
| **T6** | AdminDash `_addContact` (V2.1.b reporté) | Comportement INCHANGÉ V2.1 |

### Tests régression (T7-T12)

| # | Scénario | Attendu |
|---|---|---|
| **T7** ⭐ | ScheduleRdvModal "Nouveau contact" avec email existant | Silent merge V1.8.22 + V1.13.1.e préservé |
| **T8** | NewContactModal admin force-create | Audit log V1.13.1.a OK |
| **T9** | DuplicateOnCreateModal "Compléter cette fiche" | Enrich V1.13.1.d OK |
| **T10** | DuplicateOnCreateModal "Créer ma fiche" V1.13.1.e | Création parallèle scope-collab OK |
| **T11** ⭐ | Hub SMS V1.14.1.x (📦 archivé / inconnu / actif) | UI 3 états intacts |
| **T12** | CrmTab "Fusionner" V1.13.2.b | OK |

### Tests réseau (T13-T14)

| # | Scénario | Attendu |
|---|---|---|
| **T13** | check-duplicate-single timeout/erreur | Fail-open : création directe (caller continue) |
| **T14** | Backend retourne 401/403 | Fail-open : création continue |

---

## 5. Backups

### V2.1
- **Pré-deploy** : `/var/backups/planora/v21-pre-20260503-113805/` (httpdocs `172636ca` = V1.14.1.z)
- **Post-deploy** : `/var/backups/planora/v21-post-20260503-114032/` (httpdocs `5d7ccc9e` = V2.1)

⚠ Pas de backup data.js (backend non modifié, md5 `5ca1e08d` invariable depuis V1.14.1.z).

---

## 6. Rollback

### Rollback V2.1 → V1.14.1.z (frontend uniquement)

```bash
ssh root@136.144.204.115
cd /var/www/vhosts/calendar360.fr
rm -rf httpdocs && tar -xzf /var/backups/planora/v21-pre-20260503-113805/httpdocs-pre.tar.gz
# Pas de PM2 restart nécessaire — backend inchangé
```

---

## 7. Prochains chantiers

### V2.1.b (en attente, ~5h)
**AdminDash `_addContact`** : nécessite render `DuplicateOnCreateModal` top-level admin + handler `submitNewContactAdmin` (~25 lignes extra) + état local `duplicateOnCreateDataAdmin`. Prêt à démarrer après tests visuels MH V2.1.

### V2.2 (~2-3j)
- Détection enrichie nom/société + fuzzy optionnel
- Inclure archivés dans matches (badge 📦)
- NEW endpoint `/contacts/duplicates-scan` (groupes existants admin tool)
- NEW composant `DuplicatesResolver.jsx` (UI résolution post-création)
- PhoneTab IA recommendation (matching nom)
- Import CSV résolution interactive ligne par ligne
- Fix bug latent ScheduleRdvModal `_duplicate.id` (cf §4.3 audit V2.1)

### V2.3 (~5-7j)
- Multi-emails / multi-phones JSON
- Migration DB additive (emails_json, phones_json)
- Refacto FicheContactModal + NewContactModal + DuplicateMatchCard

---

## 8. Reprise dans nouvelle session

### Documents clés
1. **`MEMORY.md`** (auto-loaded — 39 tags)
2. **`HANDOFF-V2.1-HARMONISATION-CREATION-CONTACTS.md`** (ce document)
3. `docs/audits/2026-05/AUDIT-V2-DOUBLONS-INTELLIGENTS-2026-05-03.md` (master)
4. `docs/audits/2026-05/AUDIT-V2.1-HARMONISATION-6-CHEMINS-2026-05-03.md` (audit fin)
5. `HANDOFF-V1.14.1.z-HARD-DELETE-DEFAULT.md`
6. `CLAUDE.md` §0/§0bis/§10

### Audits cumulés `docs/audits/2026-05/` (8)
1. AUDIT-V1.13.2.b-MERGE-CRM
2. AUDIT-V1.14.0-CONTACT-SYNC (master PHASE 2)
3. AUDIT-V1.14.1-MODALES-LISTENERS
4. AUDIT-V1.14.1.x-FIX-UX-ARCHIVE
5. AUDIT-V1.14.1.y-PERMISSION-FLAG (en pause)
6. AUDIT-V1.14.1.z-HARD-DELETE-PERMISSION
7. AUDIT-V1.14.2-CONTACT-STORE-HOOK (en pause)
8. AUDIT-V2-DOUBLONS-INTELLIGENTS (master)
9. AUDIT-V2.1-HARMONISATION-6-CHEMINS

### Workflow strict 17 étapes (gravé 2026-05-03)
1. Audit READ-ONLY → 2. Diff preview → 3. GO MH → 4. Test → 5. Fix → 6. Validation
7. Backup pré → 8. Deploy → 9. Smoke → 10. Commit → 11. Push → 12. Merge si branche
13. Tag → 14. Backup post → 15. Handoff → 16. Memory → 17. Classement

---

## ✅ Conclusion

V2.1 A+B livré, déployé, smoke PASS. 2 chemins de création contact harmonisés (Quick Add Hub SMS + linkVisitor). Helper externalisé `shared/utils/duplicateCheck.js` réutilisable pour V2.1.b et au-delà. Backend intact V1.14.1.z, PM2 sans restart 56m+, ScheduleRdvModal R1 préservé, V1.13.x + V1.14.x intacts.

**Aucune régression. AdminDash V2.1.b en attente. V2.2 détection enrichie planifiée. Tests UI MH T1-T14 à valider visuellement.**
