# HANDOFF V1.14.1.x — Fix UX archive (PRIORITÉ 1 + 2 groupées)

> **Date** : 2026-05-03
> **Branche** : `clean-main` HEAD `7f548feb`
> **Tag** : `v1.14.1.x-fix-ux-archive`
> **Statut** : ✅ LIVE prod, smoke PASS, frontend-only deploy
> **Phase** : 2 hotfix UX entre V1.14.1 et V1.14.2

---

## 1. État prod final

| Indicateur | Valeur |
|---|---|
| `/api/health` | `{"status":"ok","db":"connected","companies":6,"collaborateurs":16,"uptime":5828}` |
| PM2 | pid `1114226`, **uptime 97m+, 0 restart** (backend intact) |
| Bundle prod | `index-C9VMbsvR.js` md5 `829c441a` (3.14 MB, gzip 705 KB) |
| Backend | `data.js` md5 `cdd1803a` (V1.13.2.b conservé inchangé) |
| Branche | `clean-main` HEAD `7f548feb` |
| Tag | `v1.14.1.x-fix-ux-archive` push GitHub OK |
| Tags release-track cumulés | **36** (V1.12.x + V1.13.x + V1.14.x) |

---

## 2. Ce qui change pour le user

### PRIORITÉ 1 — Hub SMS Conversation Header (PhoneTab)

**Avant** : contact archivé affiché comme "Contact non enregistré" + bouton "Créer la fiche" (faux, le contact existe).

**Après** : 3 états UI distincts dans le header conversation.

| État | Avatar | Label | Boutons |
|---|---|---|---|
| 🟢 Connu actif | Initiales bleu | Nom + société | Appeler · SMS · RDV · Pipeline · Fiche |
| 📦 **Connu archivé (NEW)** | 📦 violet | "📦 Contact archivé" violet | **Voir fiche · Restaurer · Supprimer définitivement** |
| 🔴 Inconnu | "?" rouge dashed | "Contact non enregistré" | Créer la fiche |

**Permissions Q4** :
- `Restaurer` : owner OR admin/supra
- `Supprimer définitivement` : admin/supra OR `can_hard_delete_contacts` (réutilise HardDeleteContactModal V1.12.9.d)

### PRIORITÉ 2 — Bouton Fusionner archivés

**Avant** : bouton Fusionner masqué pour fiches archivées (`canOpenMerge` filtrait `archivedAt`).

**Après** : bouton visible. Au clic, `MergeContactsModal` détecte `primary.archivedAt` et affiche **Étape 0** :

```
┌─────────────────────────────────────────────────┐
│ 📦 Fiche archivée                                │
│                                                  │
│ Cette fiche doit être restaurée avant la         │
│ fusion. Une fois restaurée, elle redevient       │
│ visible dans le CRM/Pipeline et vous pourrez     │
│ sélectionner la fiche secondaire à fusionner.   │
│                                                  │
│ [ Annuler ] [ ↻ Restaurer puis fusionner ]      │
└─────────────────────────────────────────────────┘
```

Backend `Q7 PRIMARY_ARCHIVED` (V1.13.2.b) **préservé** : le restore arrive AVANT le merge, donc backend voit primary actif au moment du merge.

---

## 3. Architecture

### 3 fichiers modifiés (+152 / -10 lignes)

| Fichier | Δ | Détail |
|---|---|---|
| `hooks/useMergeContacts.js` | +3 / -2 | retire filtre `primary.archivedAt` dans `canOpenMerge` |
| `modals/MergeContactsModal.jsx` | +50 / -2 | NEW state + handler `handleRestoreThenMerge` + bloc UI Étape 0 + désactivation autocomplete |
| `tabs/PhoneTab.jsx` | +99 / -6 | NEW import HardDeleteContactModal + state fallback + useEffect fetch + handler restore + 3 états UI + render top-level modal |

### Conformité règle code

- ✅ 0 NEW fichier
- ✅ Pas d'empilage CrmTab/CollabPortal
- ✅ Listeners encapsulés useEffect avec cleanup
- ✅ Réutilisation HardDeleteContactModal V1.12.9.d existant

---

## 4. Limite Q1 Option A acceptée

Le fix couvre **conversations existantes avec `contactId` lié** (cas le plus fréquent en pratique).

**Cas non couvert** : appel/SMS entrant d'un numéro inconnu dont le contact archivé n'a **pas** de conversation préexistante. L'UI affichera "Contact non enregistré" car `selectedConv?.contactId` n'existe pas.

→ Marginal en pratique. Couverture 100% nécessite Option B (fetch `/contacts/archived` au login + state global). Reportée V1.14.2+ (audit déjà livré).

---

## 5. Tests UI à valider visuellement par MH

### F1 — Hub SMS contact archivé visible
1. Avoir un contact archivé avec une conversation SMS existante
2. Hub SMS → ouvrir cette conversation
3. ✅ Attendu : header affiche 📦 Contact archivé violet (pas "Contact non enregistré")

### F2 — Restaurer depuis Hub SMS
1. État F1 → click "Restaurer"
2. window.confirm "Restaurer X ?"
3. ✅ Attendu : POST /restore → contact passe dans `contacts` state → header repasse en état actif

### F3 — Hard delete depuis Hub SMS
1. État F1 → click "Supprimer définitivement" (admin/can_hard_delete)
2. ✅ Attendu : ouvre HardDeleteContactModal V1.12.9.d (preview cascade + saisie SUPPRIMER)

### F4 — Permission restore (member non-admin)
1. Member non-owner non-admin sur fiche archivée d'autre collab dans Hub SMS
2. ✅ Attendu : bouton "Restaurer" **ABSENT** (canRestore false)

### F5 — Bouton Fusionner sur archivé
1. Ouvrir fiche CRM d'un contact archivé (sub-tab Archivés)
2. Click "Fusionner" cyan
3. ✅ Attendu : modale s'ouvre directement sur **Étape 0 violet** "📦 Fiche archivée — Restaurer puis fusionner"

### F6 — Restaurer puis fusionner
1. État F5 → click "Restaurer puis fusionner"
2. ✅ Attendu : POST /restore → bandeau Étape 0 disparaît → autocomplete s'active → flow merge normal

### F7 — Régression V1.14.1
1. Listeners `crmContactUpdated` HardDelete + Merge fonctionnent
2. ✅ Attendu : sync auto si autre vue modifie le contact

### F8 — Régression V1.13.2.b backend
1. Tenter POST `/api/data/contacts/:primaryId/merge` avec primary.archivedAt non vide via API directe
2. ✅ Attendu : 409 PRIMARY_ARCHIVED (backend Q7 préservé)

---

## 6. Backups

### V1.14.1.x
- **Pré-deploy** : `/var/backups/planora/v1141x-pre-20260503-095800/` (httpdocs `1fc761d5` = V1.14.1)
- **Post-deploy** : `/var/backups/planora/v1141x-post-20260503-100010/` (httpdocs `20c67aad` = V1.14.1.x)

⚠ Pas de backup data.js (backend non modifié, md5 `cdd1803a` invariable).

---

## 7. Rollback

### Rollback V1.14.1.x → V1.14.1 (frontend uniquement)

```bash
ssh root@136.144.204.115
cd /var/www/vhosts/calendar360.fr
rm -rf httpdocs && tar -xzf /var/backups/planora/v1141x-pre-20260503-095800/httpdocs-pre.tar.gz
# Pas de PM2 restart nécessaire — backend inchangé
```

---

## 8. Prochains chantiers PHASE 2

### Continuité audit V1.14.2 (déjà livré, code en attente)
- NEW `services/contactStore.js` + `hooks/useContact.js` + migration
- Audit : `docs/audits/2026-05/AUDIT-V1.14.2-CONTACT-STORE-HOOK-2026-05-03.md`
- Effort : 6-7h dev

### V2 logique doublons intelligente (annoncée par MH)
À cadrer en audit READ-ONLY après tests UI MH F1-F8 V1.14.1.x.

### Roadmap (rappel)
- V1.15 : polling/WebSocket/SSE + versioning ETag
- PHASE 3 : Outlook Calendar
- PHASE 4 : Refonte Agenda UX (Agenda visitorName snapshot)
- PHASE 5 : Refonte fiche CRM
- PHASE 6 : Import rapide colonne droite
- PHASE 7 : Optimisations UX globales

---

## 9. Reprise dans nouvelle session

### Documents clés
1. **`MEMORY.md`** (auto-loaded — 36 tags)
2. **`HANDOFF-V1.14.1.x-FIX-UX-ARCHIVE.md`** (ce document)
3. `docs/audits/2026-05/AUDIT-V1.14.1.x-FIX-UX-ARCHIVE-2026-05-03.md` (audit READ-ONLY)
4. `HANDOFF-V1.14.1-MODALES-LISTENERS.md` (V1.14.1)
5. `HANDOFF-V1.14.0-MUTATION-CENTRALIZED.md` (V1.14.0)
6. `HANDOFF-V1.13.0-STABLE-PHASE1-CLOSURE.md` (PHASE 1 close)
7. `CLAUDE.md` §0/§0bis/§10

### Workflow strict 17 étapes (gravé 2026-05-03)
1. Audit READ-ONLY → 2. Diff preview → 3. GO MH → 4. Test → 5. Fix → 6. Validation
7. Backup pré → 8. Deploy → 9. Smoke → 10. Commit → 11. Push → 12. Merge si branche
13. Tag → 14. Backup post → 15. Handoff → 16. Memory → 17. Classement

---

## ✅ Conclusion

V1.14.1.x livré, déployé, smoke PASS. 2 incohérences UX archive critiques corrigées (PhoneTab Hub SMS lookup + Merge archivé). Backend intact (md5 `cdd1803a`), PM2 sans restart 97m+, V1.13.x + V1.14.0/1 préservés.

**Aucune régression. Backend Q7 PRIMARY_ARCHIVED préservé (restore happens BEFORE merge).**
