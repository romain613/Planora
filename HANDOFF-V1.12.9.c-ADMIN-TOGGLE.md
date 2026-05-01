# HANDOFF V1.12.9.c — Toggle UI AdminDash can_hard_delete_contacts

> **Date** : 2026-05-01
> **Tag** : `v1.12.9.c-admin-toggle`
> **Commit** : `1791c17f`
> **Statut** : ✅ LIVE prod, smoke PASS, tests UI MH à valider

---

## 1. Scope livré

Troisième sous-phase V1.12.9. Permet à admin/supra d'autoriser certains collaborateurs à supprimer définitivement les contacts archivés via la perm `contacts.hard_delete`.

**Frontend uniquement**. Backend V1.12.9.a/b déjà déployé. **Aucune route DELETE touchée**. **Aucune logique de suppression modifiée**.

---

## 2. Fichier modifié (1 fichier, +13 / -2)

| Fichier | Changement |
|---|---|
| [app/src/features/admin/AdminDash.jsx](app/src/features/admin/AdminDash.jsx) L1608 | `handleStartEditCollab` charge `can_hard_delete_contacts` (default 0) |
| L2881 | Setter toggle soft delete auto-reset `can_hard` à 0 si désactivation (couplage UI hard ⊆ soft) |
| L2891 | Nouveau toggle "Peut supprimer définitivement les contacts archivés" avec icône `alert-triangle`, couleur `#DC2626`, helper text contextuel + tooltip natif |

---

## 3. Caractéristiques nouveau toggle

| Aspect | Valeur |
|---|---|
| Label | **"Peut supprimer définitivement les contacts archivés"** |
| Icône | `alert-triangle` (plus dramatique que `trash-2` du soft delete) |
| Couleur active | `#DC2626` (red 600 — distinct de `#EF4444` soft) |
| Background actif | `#7F1D1D11` (red 900 alpha 7%) |
| Tooltip natif | "Action irréversible — à attribuer uniquement aux utilisateurs de confiance" |
| Helper actif | "⚠️ Action irréversible — à attribuer uniquement aux utilisateurs de confiance" |
| Helper inactif (soft=1) | "Suppression définitive désactivée" |
| Helper bloqué (soft=0) | "Activez d'abord la suppression de contacts" |
| Couplage UI | Disabled (opacity 0.5 + cursor not-allowed) si `can_delete_contacts === 0` |
| Auto-reset | Désactiver soft → hard remis à 0 (Diff #2 setter modifié) |
| Visibilité | Admin/supra only (gate implicite via [App.jsx:452](app/src/App.jsx#L452) `view==='admin'`) |

---

## 4. Backend prêt (V1.12.9.a/b déjà déployé)

- ✅ `/api/init` retourne `can_hard_delete_contacts` via `SELECT *` + `parseRow` spread
- ✅ `PUT /api/collaborators/:id` accepte le champ via `allowedFields` (V1.12.9.a)
- ✅ `trackChanges` audit field-level (V1.12.9.a)
- ✅ `DELETE /:id/permanent` utilise `requirePermission('contacts.hard_delete')` (V1.12.9.b)

→ Aucune action backend requise pour V1.12.9.c.

---

## 5. Build + deploy

| Étape | Résultat |
|---|---|
| `npm run build` Vite v7.3.1 | ✅ 2.21s, 173 modules |
| Bundle généré | `index-D6qc2Kv0.js` 3.09 MB (gzip 695 KB) |
| SCP → /tmp/dist-v1129c → httpdocs | ✅ |
| index.html ref | `index-D6qc2Kv0.js` ✅ |

---

## 6. Smoke post-deploy (4/4 PASS)

| # | Test | Résultat |
|---|---|---|
| S1 | `/api/health` | HTTP 200, uptime 4920s, 16 collabs ✅ |
| S2 | `/` index.html bundle ref | `index-D6qc2Kv0.js` ✅ |
| S3 | `/assets/index-D6qc2Kv0.js` direct | HTTP 200, size 3.09 MB ✅ |
| S4 | PM2 stable | pid 960577, online, **uptime 4922s**, **0 unstable_restart** ✅ |

---

## 7. Tests UI à valider par MH (F1-F8)

| # | Setup | Action | Attendu |
|---|---|---|---|
| F1 | Hard refresh AdminDash → édition collab Hiba (`can_delete=1`, `can_hard=0`) | Voir nouveau toggle | Visible, désactivable au clic |
| F2 | Activer `can_hard_delete=1` | Click toggle | `#DC2626` actif + helper "⚠️" |
| F3 | Sauvegarder | PUT /api/collaborators/:id | Body inclut `can_hard_delete_contacts:1` ; SQL après save : `can_hard=1` |
| F4 | Re-ouvrir édition Hiba | Toggle | Reflète `can_hard=1` |
| F5 | Désactiver `can_delete_contacts` (soft) | Toggle soft → 0 | Hard auto-reset à 0 immédiatement |
| F6 | Édition collab sans soft (Anthony, `can_delete=0`) | Hover toggle hard | Désactivé (opacity 0.5, cursor not-allowed, no-op au click) |
| F7 | Hover toggle hard | Bulle navigateur | "Action irréversible — à attribuer uniquement aux utilisateurs de confiance" |
| F8 | Login non-admin (Thomas, Julie, Hiba…) | Tenter accès AdminDash | Routage `view='admin'` jamais déclenché — toggle invisible |

### Test SQL post-F3
```sql
SELECT id, name, can_delete_contacts, can_hard_delete_contacts FROM collaborators WHERE name LIKE '%Hiba%';
-- Attendu : can_delete=1 AND can_hard=1
```

---

## 8. Backups VPS

| Path | Rôle | md5 |
|---|---|---|
| `/var/backups/planora/v1129c-pre/httpdocs-pre.tar.gz` | Pré-deploy (rollback bundle) | `f7f38359` (85 MB) |
| `/var/backups/planora/v1129c-post/httpdocs-post.tar.gz` | Post-deploy | `3a875ddd` |

---

## 9. Reste V1.12.9 (~2h30)

| Sub-tag | Effort | Contenu |
|---|---|---|
| `v1.12.9.d-hard-delete-modal` | 1h30 | Nouveau composant `HardDeleteContactModal.jsx` 2 étapes (preview + confirm "SUPPRIMER") + branchement card archivée CrmTab |
| `v1.12.9.e-tested` | 1h | Tests SQL + UI + régression archive/restore |

---

## 10. Rollback (si tests UI MH KO)

```bash
ssh root@136.144.204.115
cd /var/www/vhosts/calendar360.fr/httpdocs
tar -xzf /var/backups/planora/v1129c-pre/httpdocs-pre.tar.gz
# Bundle revient à index-BPStrsKS.js (V1.12.x.2)
```

Backend V1.12.9.a/b reste actif — rollback frontend ne dégrade pas le backend.

---

## 11. Tags V1.12 cumulés

**20 tags** (19 pré-existants + `v1.12.9.c-admin-toggle`).
