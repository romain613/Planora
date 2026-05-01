# HANDOFF V1.12.8.c — Mode lecture seule fiche archivée

> **Date** : 2026-05-01
> **Tag** : `v1.12.8c-readonly-locked`
> **Commit** : `32dc90a0`
> **Statut** : ✅ déployé prod, build/deploy OK, tests UI à valider MH
> **Prochaine étape** : V1.12.9 frontend hard delete UI **uniquement sur GO MH**

---

## 1. Résumé exécutif

Sous-phase finale V1.12.8 (Plan B incrémental). Mode lecture seule complet appliqué sur fiche contact archivée : banner explicite + 12 zones de désactivation. Email/Appeler conservés actifs. Onglets navigables en lecture. Bouton "Restaurer" V1.12.8.a actif.

**2 fichiers frontend modifiés, 42 insertions / 16 suppressions. 0 backend touché. Build Vite 2.47s.**

---

## 2. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST audit READ-ONLY (12 zones cartographiées) | ✅ |
| 2 | FIX patch /tmp 2 fichiers | ✅ 12 zones |
| 3 | re-TEST esbuild JSX | ✅ CrmTab 210.7kb / FicheActionsBar 5.7kb |
| 4 | **Diff exacte montrée à MH + GO explicite (Q1=A/Q2=B/Q3=A/Q4=A)** | ✅ "GO V1.12.8.c build+deploy" |
| 5 | Sync local + git add | ✅ |
| 6 | Build Vite | ✅ 2.47s, 173 modules, bundle index-Bk6MEI8i.js 3.09 MB |
| 7 | Backup pré httpdocs | ✅ md5 `d0c01fe5` |
| 8 | SCP dist + cleanup ancien bundle | ✅ index-4c30jxbf.js supprimé |
| 9 | Smoke HTTP | ✅ index 200 / bundle 200 / health ok uptime 36290s |
| 10 | COMMIT (`32dc90a0`) + PUSH + TAG | ✅ |
| 11 | Backup post httpdocs | ✅ md5 `a994c9f3` |
| 12 | HANDOFF doc + memory | ✅ |

---

## 3. Patches détaillés

### FicheActionsBar.jsx (5 zones)

| # | Zone | Modif |
|---:|---|---|
| 1 | `isArchived` + `lockedStyle` | NEW variables locales |
| 2 | `<select pipeline_stage>` | `disabled={isArchived}` + cursor not-allowed + opacity 0.5 |
| 3 | Bouton SMS | `disabled` + early return + lockedStyle |
| 4 | Bouton RDV | idem |
| 5 | Bouton Classer Perdu | idem |
| **KEEP** | Email / Appeler | INTACTS (lecture seule, info uniquement) |
| **OK V1.12.8.a** | Bouton Archiver | conditionnel `!isArchived` (caché) |
| **OK V1.12.8.a** | Bouton Restaurer | conditionnel `isArchived` (visible vert) |

### CrmTab.jsx (8 zones)

| # | Zone | Modif |
|---:|---|---|
| 1 | `isArchived` + Banner haut modal | Variable locale + bloc banner conditionnel "📦 Contact archivé · le X · {raison} · Lecture seule. Cliquez Restaurer pour modifier." |
| 2 | NBA `handleSetAction` | Early return + toast warning |
| 3 | NBA `handleDoneAction` | Early return + toast warning |
| 4 | Pipeline select modal | `disabled` + early return + style |
| 5 | Bouton "Modifier montant" | `disabled` + early return + opacity |
| 6 | Bouton "Annuler le contrat" | idem |
| 7 | `_cu()` helper auto-save | Early return + toast warning (couvre coords/tags/custom_fields/notes) |
| 8 | Rating stars | Early return + cursor not-allowed + opacity |
| 9 | Bouton "+ Tag" | Hidden si archived |
| 10 | Notes textarea | `readOnly={isArchived}` + placeholder + style |
| 11 | shared_with select (collab partage) | Early return + cursor not-allowed + opacity |

---

## 4. Comportement runtime cible

| Surface | Avant V1.12.8.c | Après V1.12.8.c |
|---|---|---|
| Banner haut fiche archivée | aucun | "📦 Contact archivé · Lecture seule. Cliquez Restaurer pour modifier." |
| `<select pipeline_stage>` (FicheActionsBar + modal) | éditable | grisé, disabled |
| Boutons SMS / RDV / Classer Perdu (top bar) | actifs | grisés, disabled |
| Boutons Email / Appeler | actifs | **INCHANGÉS** ✅ |
| Bouton Restaurer | conditionnel V1.12.8.a | **INCHANGÉ** ✅ |
| Boutons Modifier montant / Annuler contrat | actifs | grisés, disabled |
| Notes textarea | éditable + autosave | readOnly + placeholder "lecture seule" + style surface |
| Rating stars | cliquables | grisés, cursor not-allowed |
| Bouton "+ Tag" | visible | hidden |
| Coordonnées inputs (firstname/lastname/email/phone/etc) | éditables | toast warning si tap (state local non modifié, valeur originale conservée) |
| Custom fields | éditables | bloqués via _cu() |
| shared_with collabs | cliquables | toast warning + grisés |
| Onglets Notes / Suivi / Docs / SMS / Historique | navigables | **INCHANGÉS** (lecture seule des données existantes) |
| Defense en profondeur backend | 409 CONTACT_ARCHIVED V1.12.6 | toujours actif si user contourne UI |

---

## 5. Garde-fous respectés

✅ Backend V1.12.1-7 INTACT
✅ V1.12.8.a/fixup/b INTACTS (Archiver/Restaurer/Onglet Archivés)
✅ Email/Appeler restent actifs (info one-shot)
✅ Onglets fiche navigables (cohérent V1.12.5.c préservation historique)
✅ Pas de modif `api()` partagée (préservation transversale)
✅ Pas de modif backend
✅ Reporting V1.11.4 / Agenda non affectés
✅ Phase 0ter Lots 2-4 toujours en pause

---

## 6. Build & Deploy

| Item | Valeur |
|---|---|
| Vite version | v7.3.1 |
| Build time | 2.47s |
| Modules | 173 |
| Bundle JS | `index-Bk6MEI8i.js` 3.09 MB (gzip 694 KB) |
| Δ vs V1.12.8.b | +1.5 KB |
| Old bundle | `index-4c30jxbf.js` cleaned |
| HTTP smoke | index 200 / bundle 200 / /api/health status=ok uptime 36290s |

---

## 7. Tests UI fonctionnels MH (à valider)

| # | Test | Étapes | Attendu |
|---|---|---|---|
| F1 | Ouvrir contact archivé | CRM → onglet "📦 Archivés" → click sur card | Modal fiche s'ouvre avec banner haut |
| F2 | Banner visible | Vérifier en haut de la fiche | "📦 Contact archivé · le X · raison · Lecture seule. Cliquez Restaurer pour modifier." |
| F3 | Pipeline select disabled | Tenter changement de stage | Select grisé, ne réagit pas |
| F4 | SMS / RDV / Classer Perdu disabled | Click sur ces boutons | Boutons grisés, pas de clic |
| F5 | Email / Appeler actifs | Click | Action exécutée (mailto / prefillKeypad) |
| F6 | Notes textarea readOnly | Tenter de taper | Pas de saisie, placeholder "lecture seule" affiché |
| F7 | Rating cliquable | Tenter de noter | Toast warning, pas de mutation |
| F8 | Bouton Restaurer actif | Click | POST /:id/restore + toast "Contact restauré" + retour Actifs |
| F9 | Régression contact actif | Ouvrir contact actif (depuis Actifs) | Aucun banner, toutes actions actives normalement |
| F10 | Régression onglets | Naviguer Notes/Suivi/Docs/SMS/Historique | Tous les onglets navigables (lecture des données) |

---

## 8. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| httpdocs pré-V1.12.8.c | `/var/backups/planora/v1128c-pre/httpdocs-pre.tar.gz` | `d0c01fe5` |
| httpdocs post-V1.12.8.c | `/var/backups/planora/v1128c-post/httpdocs-post.tar.gz` | `a994c9f3` |

**Rollback possible** via `httpdocs-pre.tar.gz`.

---

## 9. État Git après V1.12.8.c

```
HEAD : 32dc90a0 (V1.12.8.c — Mode lecture seule fiche archivée + banner)
Tags V1.12 (15) :
  v1.12.1-db-migration             v1.12.2-archive-endpoint
  v1.12.3-restore-endpoint         v1.12.4-archived-list
  v1.12.5a-filter-init             v1.12.5b-filter-duplicate
  v1.12.5c-filter-services         v1.12.5d-filter-bookings-dedup
  v1.12.5e-filter-nba              v1.12.6-refuse-archived-actions
  v1.12.7-delete-redefined         v1.12.8a-archive-ui-rename
  v1.12.8a-fixup-bulk-archive      v1.12.8b-archived-subtab
  v1.12.8c-readonly-locked         ← NEW
Branch : clean-main → origin/clean-main aligned
Bundle prod : index-Bk6MEI8i.js
```

---

## 10. Reste V1.12 (2 sous-phases ~6h dev)

✅ V1.12.8 fini (a/fixup/b/c) — UX archive complète
- ⏭ **V1.12.9** frontend hard delete + bouton "Supprimer définitivement" admin (~2h)
  - DELETE /:id/permanent + body confirm
  - GET /:id/delete-preview avant action
  - Modal HardDeleteContactModal avec saisie "SUPPRIMER"
  - Visible uniquement onglet Archivés + admin
- V1.12.10 tests régression (20 SQL + 10 UI) — ~4h
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts`
- V1.12.12 cycle observation 1 semaine prod
- V1.12.13 cleanup `pipeline_stage='perdu'` legacy V1.11.5

---

## 11. Audit séparé recommandé après V1.12.9

🟡 **Audit Reporting ghost contacts / bookings orphelins / logique contact archivé vs RDV transmis** (mentionné par MH après V1.12.8.c). À programmer en audit dédié — surface : Reporting V1.11.4 + bookings orphelins / share_transfer / agendaOwnerId.

---

## 12. STOP V1.12.8.c confirmé

**Aucune action sans GO MH explicite**.

V1.12.8 phase complète terminée (a + a-fixup + b + c). Tests UI manuels MH attendus avant GO V1.12.9 (hard delete UI).
