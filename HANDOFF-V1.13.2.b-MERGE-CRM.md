# HANDOFF V1.13.2.b — Merge CRM réel (fusion 2 fiches existantes)

> **Date** : 2026-05-03
> **Branche** : `clean-main` HEAD `0acaa501`
> **Tag** : `v1.13.2.b-merge-crm`
> **Statut** : ✅ LIVE prod, smoke PASS, tests UI MH à valider visuellement

---

## 1. État prod final

| Indicateur | Valeur |
|---|---|
| `/api/health` | `{"status":"ok","db":"connected","companies":6,"collaborateurs":16}` |
| PM2 | pid `1114226`, online, 0 unstable_restart, 156 MB |
| Bundle prod | `index-D4PCp6Lx.js` (3.13 MB, gzip 703 KB) — md5 `eeab0518` |
| Backend | `data.js` md5 `cdd1803a` |
| DB | `calendar360.db` md5 `367cb45e` |
| Branche | `clean-main` HEAD `0acaa501` |
| Tag | `v1.13.2.b-merge-crm` push GitHub OK |
| Cumul tags release-track | 32 (V1.12.x + V1.13.x dont V1.13.2.b) |

---

## 2. Ce qui change pour le user

### Nouvelle action "Fusionner" depuis fiche CRM

**Bouton "Fusionner"** (cyan, icône `git-merge`) dans la barre d'actions Fiche CRM :
- Visible si `!primary.archivedAt` ET (admin/supra OU owner/shared sur primary)
- Clic → ouvre `MergeContactsModal` étape 1

### Modale Fusion 2 étapes

**Étape 1 — Sélection + preview** :
- Panneau gauche : fiche principale (conservée, cyan)
- Panneau droite : slot vide ou fiche secondaire sélectionnée (rouge "sera supprimée")
- Autocomplete : recherche par nom/email/phone parmi les contacts (non-archivés par défaut, archivés inclus pour admin)
- Preview cascade via `GET /:id/delete-preview` du secondary : RDV / appels / SMS / conversations / pipeline_history / documents
- Bandeau warning si secondary archivé
- Aperçu notes append `[Fusionné depuis X]`
- Bouton "Continuer →"

**Étape 2 — Confirmation finale stricte** :
- Bandeau rouge "Action irréversible"
- Saisie `FUSIONNER` exact requise
- Bouton "Fusionner définitivement" rouge

### Backend cascade complet (POST /:primaryId/merge)

| Action | Tables |
|---|---|
| **UPDATE contactId** (rattachement) | bookings, call_logs, call_contexts, call_form_responses, call_transcript_archive, sms_messages, pipeline_history, contact_status_history, contact_documents, conversations, **ai_copilot_analyses (NEW V1.13.2.b)**, **client_messages (NEW)**, **notifications (NEW)**, interaction_responses (avec fallback DELETE si UNIQUE) |
| **DELETE secondary state** | contact_followers, recommended_actions, contact_ai_memory |
| **UPDATE primary notes** | append `[Fusionné depuis X]` (Q6) |
| **DELETE secondary contact** | hard delete (Q4) |
| **INSERT audit_logs** | `contact_merged` enrichi avec primaryName/secondaryName/emails/phones/cascadeCounts |
| **NON couvert** | system_anomaly_logs (logs système, valeur historique nulle après merge) |

---

## 3. Architecture frontend (respect règle code "pas d'empilage")

### 3 NEW fichiers isolés

| Fichier | Lignes | Rôle |
|---|---|---|
| `app/src/features/collab/handlers/contactMergeHandlers.js` | 122 | Handlers purs (filterMergeablePeers, fetchMergePreview, executeMergeRequest, mapMergeError) |
| `app/src/features/collab/hooks/useMergeContacts.js` | 56 | Custom hook + `canOpenMerge(primary, collab)` + listener `crmContactMerged` |
| `app/src/features/collab/modals/MergeContactsModal.jsx` | 271 | Modale 2-step standalone |

### Patch CrmTab.jsx minimal

**+21 lignes** (sous seuil 30) :
- 2 imports (MergeContactsModal + useMergeContacts/canOpenMerge)
- 1 hook call avec `onMergeSuccess` callback (filtre setContacts + reset selectedCrmContact/pipelineRightContact)
- 1 bouton "Fusionner" ligne 1149 dans actions Fiche
- 1 render top-level modale (overlay correct)

### Patch backend data.js minimal

**+28 / -10** :
- Header doc actualisé (DORMANT → ACTIF V1.13.2.b)
- Q7 check : 409 PRIMARY_ARCHIVED (10 lignes)
- Q1 cascade : +3 UPDATE (ai_copilot_analyses, client_messages, notifications) (4 lignes)

---

## 4. Permissions & sécurité

### Q5 backend — admin/supra OR owner/shared sur les 2 fiches

```js
if (!isAdmin) {
  const isOnPrimary = primary.assignedTo === myId || sharedP.includes(myId);
  const isOnSecondary = secondary.assignedTo === myId || sharedS.includes(myId);
  if (!isOnPrimary || !isOnSecondary) return 403 PERMISSION_DENIED;
}
```

### Q9 frontend — `canOpenMerge(primary, collab)` masque le bouton

```js
if (primary.archivedAt) return false;       // Q7 — primary archivé refusé
if (isAdmin) return true;                   // admin/supra bypass
return isOwner || isShared;                 // Q5 — owner/shared sur primary
```

### Verrous backend complémentaires

- `companyId` strict (cross-company refusé 400)
- `confirm: 'CONFIRM_MERGE'` body obligatoire (sinon 400 CONFIRMATION_REQUIRED)
- `secondaryId !== primaryId` (sinon 400 SAME_CONTACT)
- 404 PRIMARY_NOT_FOUND / SECONDARY_NOT_FOUND
- Transaction SQLite : tout réussit ou tout rollback

---

## 5. Tests UI à valider visuellement par MH

### Test F1 — Fusion classique 2 fiches actives
- Ouvrir une fiche CRM (primary)
- Cliquer "Fusionner" (cyan) dans la barre actions
- Étape 1 : autocomplete → sélectionner secondary
- Vérifier preview compte (RDV/appels/SMS)
- "Continuer →"
- Étape 2 : taper `FUSIONNER`
- "Fusionner définitivement"
- ✅ Attendu : toast "Fiches fusionnées (X éléments rattachés)", secondary disparaît, primary garde tout

### Test F2 — Vérification post-merge
- Ouvrir le primary
- ✅ Notes contiennent `[Fusionné depuis <secondary.name>]`
- ✅ Bookings du secondary visibles dans Agenda primary
- ✅ Reporting RDV V1.11.4 intact
- ✅ Pipeline Live cards à jour (event sync)

### Test F3 — Bouton invisible si primary archivé
- Restaurer un contact archivé puis archiver à nouveau
- ✅ Bouton "Fusionner" **ABSENT**

### Test F4 — Sécurité (autre collab non-shared)
- Member non-admin sur fiche d'un autre collab (non shared)
- ✅ Bouton "Fusionner" **ABSENT** (canOpenMerge false)

### Test F5 — Secondary archivé autorisé (Q6)
- Sélectionner un secondary archivé dans l'autocomplete (admin uniquement par défaut)
- ✅ Warning bandeau orange visible
- ✅ Fusion autorisée

### Test F6 — Confirmation stricte
- Étape 2 sans saisir "FUSIONNER" exact → bouton désactivé
- Saisir "fusionner" minuscule → bouton désactivé
- Saisir `FUSIONNER` exact → bouton activé

### Test F7 — Idempotence (double-clic)
- Cliquer "Fusionner définitivement" 2x rapidement
- ✅ Premier clic réussit, second retourne 404 SECONDARY_NOT_FOUND

### Test F8 — Audit log
```sql
SELECT action, detail, metadata_json, createdAt FROM audit_logs
WHERE action='contact_merged' ORDER BY id DESC LIMIT 5;
```
✅ Attendu : entry avec primaryName/secondaryName/cascadeCounts

---

## 6. Backups (rétention)

### V1.13.2.b backups
- **Pré-deploy** : `/var/backups/planora/v1132b-pre-20260503-082046/`
  - calendar360.db md5 `f54bf162` · data.js md5 `138db47c` (V1.13.2.a) · httpdocs-pre `03982730`
- **Post-deploy** : `/var/backups/planora/v1132b-post-20260503-082322/`
  - calendar360.db md5 `367cb45e` · data.js md5 `cdd1803a` (V1.13.2.b) · httpdocs-post `5429da12`

### Backups antérieurs (rétention)
- v1132a-pre/post (V1.13.2.a)
- v1131-final-20260502-234123/ (122 MB, V1.13.1 complet)
- + tous les V1.12.x

---

## 7. Rollback

### Rollback partiel V1.13.2.b → V1.13.2.a

```bash
ssh root@136.144.204.115
cp /var/backups/planora/v1132b-pre-20260503-082046/data.js /var/www/planora/server/routes/data.js
cd /var/www/vhosts/calendar360.fr
rm -rf httpdocs && tar -xzf /var/backups/planora/v1132b-pre-20260503-082046/httpdocs-pre.tar.gz
pm2 restart calendar360
```

### Note rollback
Si des merges ont été effectués entre deploy V1.13.2.b et rollback, **les contacts secondary supprimés ne reviendront pas** (DELETE hard). Seul le rollback DB complet (calendar360.db backup pre) restaurerait les contacts. Évaluer impact business avant rollback.

---

## 8. Prochains chantiers

### V1.13.2.c (clôture PHASE 1)
- Tests régression complets F1-F12 contacts/doublons
- Tag final `v1.13.2.0-stable` (clôture cycle V1.13)
- Bilan PHASE 1 dans HANDOFF

### PHASE 2 — Synchronisation fiches contact (à venir)
Source de vérité unique CRM/Pipeline/Agenda/fiche client. Audit divergences + update cohérent temps réel.

### Items V1.14+ (roadmap MH)
1. Multi-merge 3+ fiches (V1.14)
2. Suggestion automatique de doublons potentiels (avec ML/fuzzy matching)
3. Reporting agnostique scope collab
4. Quick Add téléphone scope collab
5. Import CSV unifié dup check batch
6. AdminDash batch contacts UX
7. `/api/leads/dispatch` audit lead-to-contact

---

## 9. Reprise dans nouvelle session

### Documents clés
1. `MEMORY.md` (auto-loaded — index 32 tags + procédures workflow strict 17 étapes)
2. `HANDOFF-V1.13.2.b-MERGE-CRM.md` (ce document)
3. `HANDOFF-V1.13.2.a-DELETE-OWN.md` (sub-phase précédente)
4. `HANDOFF-V1.13.1-FINAL.md` (cycle V1.13.1 antérieur)
5. `CLAUDE.md` §0/§0bis/§10

### Workflow strict 17 étapes (gravé 2026-05-03)
1. Audit READ-ONLY → 2. Diff preview → 3. GO MH → 4. Test → 5. Fix → 6. Validation
7. Backup pré → 8. Deploy → 9. Smoke → 10. Commit → 11. Push → 12. Merge si branche
13. Tag → 14. Backup post → 15. Handoff → 16. Memory → 17. Classement

---

## ✅ Conclusion

V1.13.2.b livré, déployé, smoke PASS. Architecture frontend conforme règle code "pas d'empilage" (3 NEW fichiers isolés, CrmTab +21 lignes seulement). Backend extension cascade Q1 (+3 tables) + Q7 PRIMARY_ARCHIVED check. PHASE 1 contacts/doublons quasi clôturée — V1.13.2.c restant pour tests régression et tag final.

**Aucun RDV supprimé. Bookings/Reporting/Agenda/Pipeline préservés.**
