# HANDOFF V1.12.8.a — Frontend wording archive + bouton Restaurer

> **Date** : 2026-05-01
> **Tag** : `v1.12.8a-archive-ui-rename`
> **Commit** : `1d09cf7d`
> **Statut** : ✅ déployé prod, build/deploy OK, tests UI à valider MH
> **Prochaine étape** : V1.12.8.b sous-onglet "Archivés" CrmTab **uniquement sur GO MH**

---

## 1. Résumé exécutif

Première sous-phase frontend V1.12 (Plan B incrémental). Wording UX aligné backend V1.12.7. Le bouton "Supprimer" devient "Archiver" et un nouveau bouton "Restaurer" apparaît sur fiche archivée.

**2 fichiers frontend modifiés, 8 lignes ajoutées, 2 supprimées. 0 backend touché. Build Vite 2.40s.**

---

## 2. Workflow strict — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST audit READ-ONLY (Plan B sous-phases identifiées) | ✅ |
| 2 | FIX patch /tmp 2 fichiers | ✅ |
| 3 | re-TEST esbuild JSX validation | ✅ FicheActionsBar 5.2kb / CrmTab 204.2kb compiled |
| 4 | **Diff exacte montrée à MH + GO explicite** | ✅ "GO V1.12.8.a build+deploy" |
| 5 | Sync local + git add | ✅ |
| 6 | Build Vite | ✅ 173 modules / index-CXHol_Vt.js 3.09 MB / gzip 693 KB |
| 7 | Backup pré httpdocs | ✅ md5 `d98491a9` (tarball complet) |
| 8 | SCP dist → httpdocs (index.html + bundle + css) | ✅ |
| 9 | Smoke HTTP | ✅ index 200 / bundle 200 / /api/health ok |
| 10 | COMMIT (`1d09cf7d`) + PUSH + TAG | ✅ |
| 11 | Backup post httpdocs | ✅ md5 `ead0799e` |
| 12 | HANDOFF doc | ✅ |

---

## 3. Patches détaillés

### `FicheActionsBar.jsx` L41 (1 ligne → 4 lignes incl. comments)

| Aspect | Avant | Après |
|---|---|---|
| Condition affichage | `collab?.can_delete_contacts ?` | `collab?.can_delete_contacts && (!ct.archivedAt \|\| ct.archivedAt==='') ?` |
| Confirm | "Supprimer définitivement X ?" | "Archiver X ?\n\nLe contact sera masqué mais récupérable." |
| Toast succès | "Contact supprimé définitivement" | "Contact archivé (récupérable)" |
| Lecture réponse | (ignoré) | `if(r?.action==='archived'){...}else{toast erreur}` |
| Icône | `trash-2` | `archive` |
| Wording | "Supprimer" | "Archiver" |
| **NEW Restaurer** | — | Bouton vert `rotate-ccw` "Restaurer" si `ct.archivedAt` set, POST `/:id/restore`, réinjection state preserve/update |

### `CrmTab.jsx` L1041

Symétrique avec FicheActionsBar (même pattern duplicate inline).

---

## 4. Inchangés

✅ Backend V1.12.1-7 intact
✅ Bouton "Classer Perdu" (legacy V1.11.5)
✅ Boutons Email / Appeler / SMS / RDV / pipeline_stage select
✅ Bulk delete CrmTab (V1.12.8.c traitera)
✅ PhoneTab.jsx (pas touché)
✅ CollabPortal.jsx (state déjà filtré backend V1.12.5.a)
✅ Reporting V1.11.4 / Agenda

---

## 5. Build & Deploy

| Étape | Détail |
|---|---|
| Vite version | v7.3.1 |
| Build time | 2.40s |
| Modules transformés | 173 |
| Bundle JS | `index-CXHol_Vt.js` 3.09 MB (gzip 693 KB) |
| CSS | `index-DydZeC02.css` 0.12 KB |
| Index | `index.html` 4.06 KB |
| Warning | "Some chunks > 500 KB" (info, pas bloquant) |
| HTTP smoke | index 200, bundle 200, /api/health status=ok uptime 917s |

---

## 6. Tests UI fonctionnels MH (à valider)

**Procédure recommandée (browser ouvert sur calendar360.fr)** :

| # | Test | Étapes | Attendu |
|---|---|---|---|
| F1 | Archiver un contact actif | Ouvrir CRM, sélectionner contact bidon, click "Archiver", confirmer | Toast "Contact archivé (récupérable)", contact disparaît du listing |
| F2 | Vérif backend post-archive | (SSH) `sqlite3 calendar360.db "SELECT archivedAt FROM contacts WHERE id='<id>'"` | archivedAt set ISO timestamp |
| F3 | Restaurer un contact archivé | Marquer contact archivé via SQL ou via F1, ouvrir fiche par admin (depuis adminDash all view ou GET /:id direct), click "Restaurer" | Toast "Contact restauré", contact réapparaît dans CRM |
| F4 | Régression actions actif | Sur contact actif : Email/Tel/SMS/RDV/Classer Perdu | Tous fonctionnent comme avant |
| F5 | Régression bulk delete | Sélection multi + "Supprimer (N)" | Comportement V1.12.7 backend (archive batch) |

**Note** : F3 nécessitera le V1.12.8.b sous-onglet "Archivés" pour ouvrir une fiche archivée depuis l'UI. Pour l'instant, test F3 via une route admin/supra qui peut bypasser le filtre.

---

## 7. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| httpdocs pré-V1.12.8.a | `/var/backups/planora/v1128a-pre/httpdocs-pre-v1128a.tar.gz` | `d98491a9` |
| httpdocs post-V1.12.8.a | `/var/backups/planora/v1128a-post/httpdocs-post-v1128a.tar.gz` | `ead0799e` |
| DB | inchangée | (skip — pas de modif backend) |

---

## 8. État Git après V1.12.8.a

```
HEAD : 1d09cf7d (V1.12.8.a — Frontend wording archive + bouton Restaurer)
Tags V1.12 (12) :
  v1.12.1-db-migration            v1.12.2-archive-endpoint
  v1.12.3-restore-endpoint        v1.12.4-archived-list
  v1.12.5a-filter-init            v1.12.5b-filter-duplicate
  v1.12.5c-filter-services        v1.12.5d-filter-bookings-dedup
  v1.12.5e-filter-nba             v1.12.6-refuse-archived-actions
  v1.12.7-delete-redefined        v1.12.8a-archive-ui-rename
Branch : clean-main → origin/clean-main aligned
Bundle prod : index-CXHol_Vt.js
```

---

## 9. Reste V1.12 (3 sous-phases ~7h dev)

- ⏭ **V1.12.8.b** Sous-onglet "Archivés" CrmTab (~2h)
  - Fetch GET `/api/data/contacts/archived?companyId=...`
  - Toggle UI Actifs/Archivés
  - Liste séparée + style grisé + badge "Archivé"
- V1.12.8.c Mode lecture seule + gestion 409 CONTACT_ARCHIVED (~30 min)
  - Désactivation actions sur fiche archivée
  - Banner "📦 Contact archivé le X — Restaurer pour modifier"
  - Wrapper api() pour 409
- V1.12.9 frontend hard delete + bouton "Supprimer définitivement" admin (~2h)
- V1.12.10 tests régression (20 SQL + 10 UI) — 4h
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts`

---

## 10. STOP V1.12.8.a confirmé

**Aucune action sans GO MH explicite**.

Tests UI manuels MH attendus avant GO V1.12.8.b. Si régression détectée, rollback possible via `httpdocs-pre-v1128a.tar.gz`.
