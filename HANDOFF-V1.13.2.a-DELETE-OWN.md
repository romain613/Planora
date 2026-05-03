# HANDOFF V1.13.2.a — Owner delete from duplicate modal (soft archive)

> **Date** : 2026-05-03
> **Branche** : `clean-main` HEAD `a1bd7fdf`
> **Tag** : `v1.13.2.a-delete-own`
> **Statut** : ✅ LIVE prod, smoke PASS, tests UI MH F1/F2/F3 à valider visuellement

---

## 1. État prod final

| Indicateur | Valeur |
|---|---|
| `/api/health` | `{"status":"ok","db":"connected","companies":6,"collaborateurs":16}` |
| PM2 | pid `1112398`, online, uptime stable, 0 unstable_restart |
| Bundle prod | `index-BBES2Ivz.js` (3.12 MB, gzip 700 KB) — md5 `03a1487a` |
| Backend | `data.js` md5 `138db47c` |
| DB | `calendar360.db` md5 `2ade509a` |
| Branche | `clean-main` HEAD `a1bd7fdf` |
| Tag | `v1.13.2.a-delete-own` (push GitHub OK) |
| Cumul tags release-track | 31 (V1.12.x + V1.13.x dont V1.13.2.a) |

---

## 2. Ce qui change pour le user

### Modale doublon (créée pendant le flow Nouveau contact)

**Nouveau bouton "Supprimer cette fiche"** (rouge, icône `trash-2`) :
- Visible uniquement si `isOwner === true && !isArchived`
- Action : soft archive via `POST /api/data/contacts/:id/archive`
- Confirmation `window.confirm` avec rappel "récupérable via sub-tab Archivés"
- Fiche disparaît du CRM/Pipeline, RDV/historiques préservés Agenda+Reporting

### Permissions backend `/archive` assouplies (Q2)

- Avant : `requirePermission('contacts.delete')` middleware obligatoire
- Après : `requireAuth` seul. Owner peut archiver SA propre fiche sans la permission `contacts.delete`. Le check ownership ligne 1029 (`assignedTo === collaboratorId`) bloque toujours non-owner non-admin.
- Aucun risque de leak cross-collab : la condition `if (!req.auth.isAdmin && !req.auth.isSupra && record.assignedTo !== req.auth.collaboratorId) return 403` reste en place.

---

## 3. Endpoint dormant `/merge` — RÉSERVÉ V1.13.2.b

⚠ **Endpoint backend en place mais AUCUN consommateur frontend en V1.13.2.a.**

### Spec endpoint

```
POST /api/data/contacts/:primaryId/merge
Body : { secondaryId, confirm: 'CONFIRM_MERGE' }
Permissions Q5 : admin/supra OR (collab is owner/shared on BOTH contacts)
Retour : { success, action: 'merged', primaryId, secondaryId, cascadeCounts }
```

### Cascade

**UPDATE 11 tables d'historique** (rattachement secondary→primary) :
- bookings, call_logs, call_contexts, call_form_responses, call_transcript_archive
- sms_messages, pipeline_history, contact_status_history, contact_documents, conversations
- interaction_responses (avec fallback DELETE si UNIQUE conflit)

**DELETE 3 tables d'état du secondary** :
- contact_followers (UNIQUE), recommended_actions, contact_ai_memory (UNIQUE)

**DELETE secondary contact** (Q4 hard) + **UPDATE primary notes** (Q6 append `[Fusionné depuis X]`).

**Audit log** `contact_merged` enrichi (Q8) avec primaryName/secondaryName/emails/phones/assignedTo/cascadeCounts.

### Décision MH validée 2026-05-03

> Pas de bouton "Fusionner" dans la modale création (la fiche brouillon n'existe pas encore en DB). L'enrichissement reste assuré par `handleDuplicateEnrich` (V1.13.1.d) via "Compléter cette fiche".
>
> Le vrai merge sera consommé en V1.13.2.b depuis le **CRM tab** (fusion manuelle de 2 fiches déjà persistées par admin ou owner-shared sur les 2).

---

## 4. Fichiers modifiés (4 fichiers, +178 / -3)

| Fichier | +/- | Changement |
|---|---|---|
| `server/routes/data.js` | +131 / -2 | Q2 archive relax + NEW endpoint `/merge` dormant |
| `app/src/.../DuplicateMatchCard.jsx` | +8 | prop `onDelete` + bouton "Supprimer cette fiche" |
| `app/src/.../DuplicateOnCreateModal.jsx` | +5 / -1 | passthrough `onDelete` |
| `app/src/.../CollabPortal.jsx` | +37 | `handleDuplicateDelete` + wire `onDelete` + bloc commentaire merge non branché |

---

## 5. Tests fonctionnels à valider visuellement par MH

### Test 1 — Suppression owner
- Créer un contact, ouvrir une modale doublon (saisir email/phone d'une fiche existante m'appartenant)
- Cliquer **"Supprimer cette fiche"**, confirmer
- ✅ Attendu : fiche disparaît, toast `Fiche supprimée (archivée — récupérable)`, modal se ferme
- ✅ Le contact apparaît dans le sub-tab CRM "Archivés"

### Test 2 — Sécurité (autre collab)
- Créer un contact, ouvrir modale doublon avec match **fiche d'un autre collaborateur**
- ✅ Attendu : bouton **"Supprimer cette fiche" ABSENT** (seul "Me partager" + "Créer ma fiche" visibles)

### Test 3 — Sécurité (fiche partagée mais pas owner)
- Saisir un contact dont la fiche est partagée avec moi (sharedWith), mais owner = autre
- ✅ Attendu : bouton **"Supprimer cette fiche" ABSENT** (sharedWith ≠ isOwner)

### Test 4 — Non régression "Compléter cette fiche"
- Cliquer **"Compléter cette fiche"** sur un match owner
- ✅ Attendu : enrich fonctionne normalement, aucun champ écrasé, toast `Fiche enrichie avec succès`

### Test 5 — Idempotence (déjà archivée)
- Tenter d'archiver un contact déjà archivé via API directe
- ✅ Attendu : 409 `ALREADY_ARCHIVED`

---

## 6. Backups (rétention)

### V1.13.2.a backups
- `/var/backups/planora/v1132a-pre-20260503-075154/` — pre-deploy
  - calendar360.db md5 `2ade509a` · data.js md5 `d582ae1e` (V1.13.1 final) · httpdocs-pre `c3a28893`
- `/var/backups/planora/v1132a-post-20260503-075528/` — post-deploy
  - calendar360.db md5 `2ade509a` · data.js md5 `138db47c` (V1.13.2.a) · httpdocs-post `03982730`

### V1.13.1 backup complet final (toujours disponible)
- `/var/backups/planora/v1131-final-20260502-234123/` (122 MB)

---

## 7. Rollback

### Rollback partiel V1.13.2.a (revenir à V1.13.1)

```bash
ssh root@136.144.204.115
cp /var/backups/planora/v1132a-pre-20260503-075154/data.js /var/www/planora/server/routes/data.js
cd /var/www/vhosts/calendar360.fr
rm -rf httpdocs && tar -xzf /var/backups/planora/v1132a-pre-20260503-075154/httpdocs-pre.tar.gz
pm2 restart calendar360
```

---

## 8. Prochains chantiers

### V1.13.2.b (~3-4h)
- Fusion manuelle 2 fiches existantes depuis **CRM tab** (pas modale doublon)
- UI : bouton/menu "Fusionner avec…" sur la fiche, sélecteur de la fiche cible
- Backend : déjà en place (`POST /:primaryId/merge`)
- Permissions Q5 : admin/supra OR owner/shared sur les 2
- Confirmation modale dédiée + preview cascade counts

### V1.13.2.c (optionnel)
- Tests régression visuels F1-F5 + tag final `v1.13.2.0-stable`

### V1.14+ candidats (roadmap MH)
1. Reporting agnostique scope collab
2. Quick Add téléphone scope collab
3. Import CSV unifié dup check batch
4. AdminDash batch contacts UX
5. `/api/leads/dispatch` audit lead-to-contact scope

---

## 9. Reprise dans une nouvelle session

1. Lire `MEMORY.md` (auto-loaded)
2. Lire `HANDOFF-V1.13.2.a-DELETE-OWN.md` (ce document)
3. Lire `HANDOFF-V1.13.1-FINAL.md` (état antérieur)
4. Lire `CLAUDE.md` §0/§0bis/§10
5. État runtime : `clean-main` HEAD `a1bd7fdf`, tag `v1.13.2.a-delete-own`
6. Endpoint `/merge` opérationnel mais DORMANT (à câbler V1.13.2.b)
7. Workflow strict 12 étapes obligatoire pour toute future modif

---

## ✅ Conclusion

V1.13.2.a livré, déployé, smoke PASS. Backup post-deploy intègre. Aucune régression détectée côté technique. Tests UI MH F1-F5 à valider visuellement.

**Aucun RDV supprimé. Bookings/Reporting/Agenda/Pipeline préservés.**
