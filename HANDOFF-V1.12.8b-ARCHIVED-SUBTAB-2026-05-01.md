# HANDOFF V1.12.8.b — Sous-onglet Archivés CrmTab

> **Date** : 2026-05-01
> **Tag** : `v1.12.8b-archived-subtab`
> **Commit** : `6e7f4d77`
> **Statut** : ✅ déployé prod, build/deploy OK, tests UI à valider MH
> **Prochaine étape** : V1.12.8.c lecture seule + gestion 409 + V1.12.9 hard delete UI **uniquement sur GO MH**

---

## 1. Résumé exécutif

Ajout d'un sous-onglet "Archivés" dans CrmTab.jsx avec lazy fetch et liste cards grisées. Cohérent avec backend V1.12.4 GET `/api/data/contacts/archived` et bouton "Restaurer" V1.12.8.a.

**1 fichier modifié, +56 lignes, 0 supprimées. 0 backend touché. Build Vite 2.31s.**

---

## 2. Workflow strict — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST audit READ-ONLY (4 inserts ciblés) | ✅ |
| 2 | FIX patch /tmp 4 inserts | ✅ |
| 3 | re-TEST esbuild JSX | ✅ 208.3 KB compilé |
| 4 | **Diff exacte montrée à MH + GO explicite** | ✅ "GO patch V1.12.8.b" |
| 5 | Sync local + git add | ✅ |
| 6 | Build Vite | ✅ 2.31s, 173 modules, bundle index-4c30jxbf.js 3.09 MB |
| 7 | Backup pré httpdocs | ✅ md5 `39ea0aaf` |
| 8 | SCP dist + cleanup ancien bundle | ✅ index-CXK1nLpi.js supprimé |
| 9 | Smoke HTTP | ✅ index 200 / bundle 200 / health ok uptime 30527s |
| 10 | COMMIT (`6e7f4d77`) + PUSH + TAG | ✅ |
| 11 | Backup post httpdocs | ✅ md5 `d0c01fe5` |
| 12 | HANDOFF doc | ✅ |

---

## 3. Détail des 4 inserts

### Insert 1 : State + useEffect (~L99)

```js
const [crmActiveSubtab, setCrmActiveSubtab] = useState('active');
const [archivedContacts, setArchivedContacts] = useState([]);
const [loadingArchived, setLoadingArchived] = useState(false);

useEffect(() => {
  if (crmActiveSubtab !== 'archived' || !company?.id) return;
  setLoadingArchived(true);
  api(`/api/data/contacts/archived?companyId=${company.id}`).then(rows => {
    setArchivedContacts(Array.isArray(rows) ? rows : []);
  }).catch(() => {
    showNotif('Erreur chargement archivés', 'danger');
    setArchivedContacts([]);
  }).finally(() => setLoadingArchived(false));
}, [crmActiveSubtab, company?.id]);
```

### Insert 2 : Toggle UI (~L177)

2 boutons `<Btn small>` avec style actif/inactif dynamique :
- Actifs (myCrmContacts.length)
- 📦 Archivés (archivedContacts.length)

### Insert 3 : Bloc conditionnel ARCHIVÉS (~L184)

```jsx
{crmActiveSubtab === 'archived' ? (
  <Card>
    {loadingArchived ? <Spinner/> :
     archivedContacts.length === 0 ? <EmptyState/> :
     <Grid auto-fill 280px>{cards grisées}</Grid>}
  </Card>
) : (<>
```

Style cards archivées :
- opacity 0.65 (hover 0.85) + transition smooth
- border dashed gris
- badge "📦 Archivé" top-right
- avatar gris + nom/email/phone ellipsis
- footer date archivage FR + raison si présente

### Insert 4 : Fermeture ternaire (~L866)

```jsx
</>)}
{/* V1.12.8.b — fin du bloc conditionnel actifs/archivés */}
```

---

## 4. Comportement runtime UX

| Scénario | Résultat |
|---|---|
| Ouverture CrmTab (default) | Toggle visible "Actifs" sélectionné, rendu existant inchangé |
| Click "📦 Archivés (M)" | Lazy fetch → spinner → cards grisées |
| Click sur card archivée | `setSelectedCrmContact(ct)` → modal fiche s'ouvre avec bouton "Restaurer" V1.12.8.a |
| Click "Restaurer" depuis fiche archivée | POST `/:id/restore` + state preserve/update + toast |
| Switch onglet | Refetch archived list (data fraîche) |
| Empty state | "Aucun contact archivé" |
| Erreur fetch | Toast "Erreur chargement archivés" |
| Compteur Archivés | 0 jusqu'au premier fetch (lazy) puis nombre réel |
| Click "Actifs" retour | Liste CRM existante, comportement inchangé |

---

## 5. Garde-fous respectés

✅ Backend V1.12.1-7 INTACT
✅ PhoneTab.jsx / FicheActionsBar.jsx / CollabPortal.jsx INTACTS
✅ Modal fiche `selectedCrmContact` reste rendue toujours
✅ Bouton "Restaurer" V1.12.8.a fonctionne
✅ Bouton "Archiver" V1.12.8.a/fixup intact (visible uniquement actifs)
✅ Toggle persistant (peu importe l'onglet)
✅ Lazy fetch (pas de coût initial)
✅ Pas de pagination/recherche (KISS V1.12.8.b)
✅ Reporting V1.11.4 / Agenda non affectés

---

## 6. Build & Deploy

| Item | Valeur |
|---|---|
| Vite version | v7.3.1 |
| Build time | 2.31s |
| Modules | 173 |
| Bundle JS | `index-4c30jxbf.js` 3.09 MB (gzip 694 KB) |
| Δ vs précédent | +0.5 KB |
| Old bundle | `index-CXK1nLpi.js` cleaned |
| HTTP smoke | index 200 / bundle 200 / /api/health ok |

---

## 7. Tests UI fonctionnels MH (à valider)

| # | Test | Étapes | Attendu |
|---|---|---|---|
| F1 | Toggle visible | Ouvrir CRM | Toggle "Actifs (N)" / "📦 Archivés (M)" visible juste après description |
| F2 | Switch Archivés | Click "Archivés" | Spinner → liste cards grisées (ou empty) |
| F3 | Compteur dynamique | Switch onglet | Compteur s'actualise avec nombre réel après fetch |
| F4 | Click card archivée | Click sur card | Modal fiche s'ouvre, bouton "Restaurer" visible |
| F5 | Restaurer | Click "Restaurer" | Toast "Contact restauré", contact réinjecté en state actif |
| F6 | Empty state | Si 0 archivé | "Aucun contact archivé" affiché |
| F7 | Switch retour Actifs | Click "Actifs" | Liste CRM standard inchangée |
| F8 | Régression Pipeline Stats | Sur onglet Actifs | Pipeline Stats Bar / Selection / Table view tous OK |

---

## 8. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| httpdocs pré-V1.12.8.b | `/var/backups/planora/v1128b-pre/httpdocs-pre.tar.gz` | `39ea0aaf` |
| httpdocs post-V1.12.8.b | `/var/backups/planora/v1128b-post/httpdocs-post.tar.gz` | `d0c01fe5` |

**Rollback possible** via `httpdocs-pre.tar.gz`.

---

## 9. État Git après V1.12.8.b

```
HEAD : 6e7f4d77 (V1.12.8.b — Onglet Archivés CrmTab + lazy fetch)
Tags V1.12 (14) :
  v1.12.1-db-migration             v1.12.2-archive-endpoint
  v1.12.3-restore-endpoint         v1.12.4-archived-list
  v1.12.5a-filter-init             v1.12.5b-filter-duplicate
  v1.12.5c-filter-services         v1.12.5d-filter-bookings-dedup
  v1.12.5e-filter-nba              v1.12.6-refuse-archived-actions
  v1.12.7-delete-redefined         v1.12.8a-archive-ui-rename
  v1.12.8a-fixup-bulk-archive      v1.12.8b-archived-subtab
Branch : clean-main → origin/clean-main aligned
Bundle prod : index-4c30jxbf.js
```

---

## 10. Reste V1.12 (3 sous-phases ~7h dev)

- ⏭ **V1.12.8.c** Mode lecture seule fiche archivée + gestion 409 CONTACT_ARCHIVED (~30 min)
  - Désactiver actions sur fiche archivée (pipeline_stage select, RDV, SMS...)
  - Banner haut fiche : "📦 Contact archivé le X — Restaurer pour modifier"
  - Wrapper api() ou handler 409
- V1.12.9 frontend hard delete + bouton "Supprimer définitivement" admin (~2h)
- V1.12.10 tests régression (20 SQL + 10 UI) — 4h
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts`
- V1.12.12 cycle observation 1 semaine prod
- V1.12.13 cleanup `pipeline_stage='perdu'` legacy V1.11.5

---

## 11. STOP V1.12.8.b confirmé

**Aucune action sans GO MH explicite**.

Tests UI manuels MH attendus avant GO V1.12.8.c (lecture seule fiche archivée + gestion 409). Si régression détectée, rollback possible via `httpdocs-pre.tar.gz`.
