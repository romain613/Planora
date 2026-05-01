# HANDOFF V1.12.9.d — HardDeleteContactModal 2 étapes

> **Date** : 2026-05-01
> **Tag** : `v1.12.9.d-hard-delete-modal`
> **Commit** : `e7e27ad1`
> **Statut** : ✅ LIVE prod, smoke + bundle PASS, tests UI MH à valider

---

## 1. Scope livré

Quatrième sous-phase V1.12.9. Modale de suppression définitive d'un contact archivé avec :
- Étape 1 : aperçu impact (5 tables supprimées / 14 conservées)
- Étape 2 : confirmation par saisie casse stricte **`SUPPRIMER`**
- Backend `DELETE /:id/permanent` avec `body.confirm='CONFIRM_HARD_DELETE'`

**Frontend uniquement**. Backend V1.12.9.a/b/c déjà déployé. **Aucune route DELETE touchée**. **Aucune logique de suppression modifiée**.

---

## 2. Diagnostic intégré pendant exécution

### Découverte mid-deploy

Premier build : modal **absent du bundle** (`CONFIRM_HARD_DELETE`=0, `/permanent`=0). Investigation a révélé :
- `FicheActionsBar.jsx` est un composant **dormant** (refactor S1.4b extrait mais non activé en runtime)
- Le chemin actif des actions fiche est **inline** dans [CrmTab.jsx:1116-1133](app/src/features/collab/tabs/CrmTab.jsx#L1116) (monolithique)

### Correction appliquée
- Patch CrmTab.jsx (chemin actif) avec import + state + bouton + render modal
- Patch FicheActionsBar.jsx maintenu (alignement pour activation future S1.4b)

Build #2 : modal correctement inclus. Vérifications python sur bundle final `index-DrJxtjrJ.js` :
| String | Count |
|---|---:|
| `CONFIRM_HARD_DELETE` | 1 ✅ |
| `/permanent` | 1 ✅ |
| `SUPPRIMER` | 7 ✅ |
| `crmContactHardDeleted` | 3 ✅ |
| `delete-preview` | 3 ✅ |
| `"Suppression définitive — Aperçu"` | 1 ✅ |
| `"Sera supprimé définitivement"` | 1 ✅ |
| `"Conservé pour traçabilité"` | 1 ✅ |
| `"Confirmation finale"` | 1 ✅ |

---

## 3. Fichiers modifiés (3 fichiers, +184 lignes net)

| Fichier | Type | Lignes | Rôle |
|---|---|---:|---|
| [app/src/features/collab/modals/HardDeleteContactModal.jsx](app/src/features/collab/modals/HardDeleteContactModal.jsx) | **NEW** | 145 | Composant standalone modal 2 étapes |
| [app/src/features/collab/tabs/CrmTab.jsx](app/src/features/collab/tabs/CrmTab.jsx) | **MODIF** | +25 | Import + state `hardDeleteTarget` + listener `crmContactHardDeleted` + bouton ligne 1135 + render modal top-level |
| [app/src/features/collab/tabs/crm/fiche/FicheActionsBar.jsx](app/src/features/collab/tabs/crm/fiche/FicheActionsBar.jsx) | **MODIF** | +14 | Alignement composant dormant pour S1.4b futur |

---

## 4. Caractéristiques modal

### Étape 1 — Aperçu impact
- **Auto-fetch** `GET /api/data/contacts/:id/delete-preview` au mount (V1.12.7 endpoint réutilisé)
- Bloc rouge `#7F1D1D11/#DC2626` : "Sera supprimé définitivement" — 5 tables (contacts, contact_followers, recommended_actions, contact_ai_memory, contact_documents)
- Bloc gris : "Conservé pour traçabilité" — 14 tables avec compteurs réels (bookings, calls, sms, conversations, pipeline_history, transcripts, notifications, audit logs)
- Boutons : "Annuler" / "Continuer →" (rouge `#DC2626`)

### Étape 2 — Confirmation finale
- Bandeau rouge `#DC2626` : "⚠️ Action irréversible" + nom contact
- `<input>` libellé : "Tapez **SUPPRIMER** pour confirmer"
- Casse stricte : `confirmText !== "SUPPRIMER"` (lowercase rejeté)
- Bouton "Supprimer définitivement" plein rouge, désactivé sauf si match exact
- Boutons : "← Retour" / "Supprimer définitivement"

### Visibilité bouton (UI strict)
```js
ct.archivedAt && ct.archivedAt !== '' && (
  collab?.role === 'admin' ||
  collab?.role === 'supra' ||
  collab?.can_hard_delete_contacts
)
```

### Gestion erreurs backend
| Code | Cas | Message UX |
|---|---|---|
| 403 perm | `required:'contacts.hard_delete'` | "Permission insuffisante pour suppression définitive" |
| 403 access | `'Accès interdit'` | message backend |
| 400 | `BODY_CONFIRMATION_REQUIRED` | "Confirmation manquante" (ne devrait pas arriver) |
| 409 | `NOT_ARCHIVED` | "Le contact doit être archivé avant suppression définitive" |
| 404 | `NOT_FOUND` | "Contact introuvable" |
| 500 | err.message | "Erreur réseau : ..." |

### Comportement post-succès
1. `showNotif("Contact \"X\" supprimé définitivement", "success")`
2. `window.dispatchEvent(new CustomEvent('crmContactHardDeleted', {detail:{id}}))` → CrmTab listener filter `archivedContacts`
3. `setContacts(p => p.filter(c => c.id !== id))` (parent callback)
4. `setSelectedCrmContact(null)` + `setPipelineRightContact(null)` (ferme fiche)
5. `onClose()` modal

---

## 5. Backend prêt (V1.12.9.a/b/c déjà déployé)

- ✅ `GET /api/data/contacts/:id/delete-preview` (V1.12.7)
- ✅ `DELETE /api/data/contacts/:id/permanent` middleware `requirePermission('contacts.hard_delete')` (V1.12.9.b)
- ✅ 3 verrous : perm élargie + body.confirm + archivedAt prereq (V1.12.9.b)
- ✅ Cascade DELETE 5 tables intact (V1.12.7)

→ Aucune action backend requise.

---

## 6. Build + deploy

| Étape | Résultat |
|---|---|
| Build #1 (FicheActionsBar only) | ❌ Modal absent du bundle (composant dormant) |
| Diagnostic CrmTab.jsx active path | ✅ Code identifié |
| Patch CrmTab.jsx | ✅ +25 lignes (state + listener + bouton + render) |
| Build #2 Vite v7.3.1 | ✅ 2.39s, 173 modules |
| Bundle | `index-DrJxtjrJ.js` 3.10 MB (gzip 696 KB) |
| Vérification python strings | ✅ 9/9 strings présentes |
| SCP → /tmp/dist-v1129d → httpdocs | ✅ |
| index.html ref | `index-DrJxtjrJ.js` ✅ |

---

## 7. Smoke post-deploy (3/3 PASS)

| # | Test | Résultat |
|---|---|---|
| S1 | `/api/health` | HTTP 200, uptime 6930s ✅ |
| S2 | `/assets/index-DrJxtjrJ.js` direct | HTTP 200, size 3.10 MB ✅ |
| S3 | PM2 stable | pid 960577, uptime **6955s**, **0 unstable_restart** ✅ |

---

## 8. Tests UI MH à valider visuellement (F1-F7)

⚠️ **F8 destructif INTERDIT en prod**. F8 réservé staging si disponible.

| # | Setup | Action | Attendu |
|---|---|---|---|
| F1 | Login admin (Anthony/MH), ouvrir fiche contact archivé via sub-tab Archivés | Voir actions bar | Bouton rouge "Supprimer définitivement" visible |
| F2 | Login Hiba (`can_hard_delete=0`), ouvrir fiche archivé | Voir actions bar | Bouton ABSENT |
| F3 | Activer Hiba `can_hard_delete=1` via AdminDash V1.12.9.c → re-login → fiche archivé | Voir actions bar | Bouton VISIBLE (perm propagée ≤60s cache) |
| F4 | Click "Supprimer définitivement" | Modal step 1 | Aperçu charge + 2 sections (rouge "supprimé" / gris "conservé") + compteurs réels |
| F5 | Click "Continuer →" | Modal step 2 | Bandeau rouge + champ "SUPPRIMER" + bouton désactivé tant que ≠ "SUPPRIMER" |
| F6 | Tape "supprimer" (lowercase) | Bouton submit | Reste désactivé (casse stricte) |
| F7 | "Annuler" / "← Retour" / clic backdrop | Modal | Ferme ou retour étape 1 |
| F8 (staging) | Click "Supprimer définitivement" → toast succès | Vérifier SQL : contact + 4 tables linkées supprimées, bookings/calls/sms préservés (orphans) | (HORS PROD) |

---

## 9. Backups VPS

| Path | Rôle | md5 |
|---|---|---|
| `/var/backups/planora/v1129d-pre/httpdocs-pre.tar.gz` | Pré-deploy (rollback bundle V1.12.9.c) | `3a875ddd` |
| `/var/backups/planora/v1129d-post/httpdocs-post.tar.gz` | Post-deploy V1.12.9.d | `3ec07752` |

---

## 10. Reste V1.12.9 (~1h)

| Sub-tag | Effort | Contenu |
|---|---|---|
| `v1.12.9.e-tested` | 1h | Tests régression complets : archive/restore + V1.12.9.d nouveau bouton + workflows existants (Pipeline drag/drop, Reporting, etc.) |

---

## 11. Rollback (si tests UI MH KO)

```bash
ssh root@136.144.204.115
cd /var/www/vhosts/calendar360.fr/httpdocs
tar -xzf /var/backups/planora/v1129d-pre/httpdocs-pre.tar.gz
# Bundle revient à index-D6qc2Kv0.js (V1.12.9.c)
```

Backend V1.12.9.a/b/c reste actif — rollback frontend ne dégrade pas le backend (DELETE /:id/permanent reste accessible via API).

---

## 12. Tags V1.12 cumulés

**21 tags** (20 pré-existants + `v1.12.9.d-hard-delete-modal`).

---

## 13. Workflow strict (10/10 OK)

1. ✅ Audit READ-ONLY (3 fichiers identifiés, diff preview validé MH)
2. ✅ Apply 3 fichiers (NEW modal + 2 MODIF)
3. ✅ Build #1 → diagnostic dormance → ✅ Build #2 ok
4. ✅ Vérification bundle (9/9 strings)
5. ✅ Diff finale + GO MH
6. ✅ Backup pré tarball md5 `3a875ddd`
7. ✅ SCP + healthcheck
8. ✅ Smoke 3/3 PASS
9. ✅ Commit `e7e27ad1` + tag + push
10. ✅ Backup post + handoff
