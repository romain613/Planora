# HANDOFF 2026-04-22 (soir) — Transition pour nouvelle session

> **Priorité lecture pour reprendre** :
> 1. Ce document en entier
> 2. `CLAUDE.md` §0bis (règle architecture frontend — gravée) + §10 (Option A runtime)
> 3. `HANDOFF-2026-04-22.md` (handoff précédent — matin de cette même journée)
> 4. Memory projet : `/Users/design/.claude/projects/-Users-design-Desktop-PLANORA/memory/`

---

## 🟢 État prod actuel

- **Bundle frontend live** : dernier déploy S1.3 (vérifier via `grep -o 'index-[A-Za-z0-9]*\.js' /var/www/vhosts/calendar360.fr/httpdocs/index.html` sur VPS)
- **Backend PM2** : `calendar360` online, uptime 4h+, healthcheck `{status:"ok", companies:6, collaborateurs:13, dbPath:/var/www/planora-data/calendar360.db}`
- **Branch git** : `clean-main` (branche default du repo), `HEAD=348347ff` pushé sur origin
- **DB monolithe** : `/var/www/planora-data/calendar360.db` (Option A §10 CLAUDE.md)

## 📦 Backup triple-redondance P1 closure

- VPS : `/var/backups/planora/planora-full-P1-close-20260422-142038.tar.gz` (888 Mo, `600` root)
- Mac : `~/Desktop/PLANORA/backups/planora-full-P1-close-20260422-142038.tar.gz` (`600`)
- iCloud : `~/Library/Mobile Documents/com~apple~CloudDocs/PLANORA-backups/planora-full-P1-close-20260422-142038.tar.gz` (`600`)
- **SHA-256** (identique sur les 3 copies) : `b17f588985a5a62ae34be7a0f6c0cc5b52e6bf106ddf791f87f4899b1ad888db`

## Backups VPS incrémentaux de la session

- `/var/backups/planora/waveB-noshow-20260422-132926/`
- `/var/backups/planora/waveD-c1-20260422-134046/`
- `/var/backups/planora/waveD-c2-20260422-140043/`
- `/var/backups/planora/httpdocs-pre-S1-*-…tar.gz` (3 backups pré-déploy frontend)

---

## ✅ Ce qui a été livré dans cette session (2026-04-22 après-midi)

### 1. Clôture P1 (logique métier stabilisée) — commit `7016ff33`

**Wave B — no-show manuel sécurisé**
- Helper `server/services/bookings/markNoShow.js`
- Matrice B.5 : 1er no-show + pas de futur + rdv_programme → contacte ; 2e consécutif → nrp. Stages finaux (client_valide/perdu) jamais régressés.
- Compteur consécutif calculé à la volée (pas de colonne DB).
- `audit_logs` + `pipeline_history` obligatoires. `updateBehaviorScore('no_show')` réutilisé.
- Route `PUT /api/bookings/:id` (VPS) route vers helper si `noShow=1`.

**Wave D commit 1 — archivage collaborateur + filtre 12 sites**
- Helpers `server/services/collaborators/archiveCollaborator.js` + `findArchiveTargetAdmin.js`
- Migration DB : `collaborators.archivedAt TEXT DEFAULT ''` + `archivedBy TEXT DEFAULT ''` (idempotente)
- Route `DELETE /api/collaborators/:id` → archivage par défaut (plus destructif)
- Nouveau `POST /api/collaborators/:id/restore` (asymétrique — ne réassigne pas)
- **12 sites filtrés** sur `archivedAt` : init×3, collaborators GET, share.js target+actor, bookings POST, public×2, interMeetings executor, transfer V7 target, messaging recipient, calendars POST+PUT, companies×3, pages defaultAdmin, notifications, leadDispatch cron, findArchiveTargetAdmin.
- Préconditions : pas déjà archivé, pas de RDV imminent < 24h, admin cible dispo OU `allowUnassigned` explicite.
- Ordre atomique interne : validations → résolution admin → réassign bookings futurs → réassign contacts → nettoyer shared/executor/meeting → cleanup followers → cleanup calendars scope strict → archivage → audit.

**Wave D commit 2 — hard-delete collaborateur (exceptionnel)**
- Helper `server/services/collaborators/hardDeleteCollaborator.js`
- Nouveau endpoint `DELETE /api/collaborators/:id/hard?confirm=true` avec header `X-Confirm-Collab-Delete: <id>`
- 5 conditions cumulatives : archivé + `archivedAt > 30j` + 0 contact actif + 0 booking ref + role admin/supra
- Cascade DELETE alignée logique historique (availabilities, google_events, secure_ia_*, ai_copilot_analyses, calendars scope strict)

**Tests P1 cumulés** : 176 tests verts, 0 régression.

### 2. Démarrage structuration S1 CrmTab (9 extractions, 9 commits)

**S1.1 — 4 modals autonomes** (commits `862e20a4`, `7ca3da63`, `15e54df1`, `7e1bc057`)
- `app/src/features/collab/components/AddStageModal.jsx`
- `app/src/features/collab/components/EditStageModal.jsx`
- `app/src/features/collab/components/DeleteStageConfirmModal.jsx`
- `app/src/features/collab/components/BulkSmsModal.jsx`

**S1.2 — 3 zones de présentation** (commits `92cad406`, `14962643`, `240506db`)
- `app/src/features/collab/tabs/crm/CrmHeader.jsx` (actions + stats bar)
- `app/src/features/collab/tabs/crm/CrmDashboardView.jsx` (funnel + KPI)
- `app/src/features/collab/tabs/crm/CrmFiltersBar.jsx` (search + advanced + column panel)

**S1.3 — 2 vues principales** (commits `34d1e7df`, `348347ff`)
- `app/src/features/collab/tabs/crm/CrmTableView.jsx` (Z5 bulk CRM + Z6 table + pagination)
- `app/src/features/collab/tabs/crm/CrmKanbanView.jsx` (Z7 bulk pipeline + Z9 kanban cards drag&drop)

**Impact CrmTab** : 1713 → 974 lignes (-43%).

**Scan orphelins CrmTab après S1.3** : A=0, B=0 (aucun symbole flottant). C=131, D=8 (dette pré-existante inchangée par choix strict).

**Smoke runtime** : `collab-smoke.mjs`, `collab-tour.mjs`, `collab-click.mjs` — tous verts (0 critical, 0 console err).

### 3. Test manuel S1.3 validé par MH

- AddStageModal / EditStageModal / DeleteStageConfirmModal / BulkSmsModal : OK (test manuel MH)
- CrmHeader / CrmFiltersBar / CrmDashboardView : OK (test manuel MH)
- **CrmTableView + CrmKanbanView : NON TESTÉ MANUELLEMENT AVANT FIN DE SESSION** (à valider en premier en reprise — voir §prochaine étape)

---

## ⏳ Ce qui reste à faire — PROCHAINE SESSION

### Étape 0 — Test manuel S1.3 obligatoire AVANT S1.4

MH doit valider sur calendar360.fr (bundle déployé `index-…` voir httpdocs) :

**1. Mode Table** :
- Sélection multiple contacts → bulk bar apparaît
- Bulk pipeline change (Changer étape) → Appliquer
- Bulk Classer Perdu (avec motif)
- Bulk delete (admin)
- Pagination
- Ouverture fiche via clic ligne nom

**2. Mode Kanban** :
- Drag&drop carte → changement stage
- Drag&drop colonne (réordonnancement)
- Sélection multiple cartes → barre Z7
- Bulk : Déplacer, Tag, Couleur, Supprimer

**3. Cartes kanban (visuel)** :
- Badges RDV countdown, NRP, score, share V1 orange, follower V7 "Chez X"
- Actions : Fiche, Appel, RDV, Email, Transférer

**4. Console DevTools (F12)** : pas de `ReferenceError`, pas de warning React

→ Si OK, enchaîner sur S1.4a.
→ Si bug, rollback via `git revert <hash>` sur le commit fautif et analyser.

### Étape 1 — S1.4a : extraction container FicheContactModal entier (sans découper)

**Cible** : CrmTab.jsx lignes ~600-960 (le dernier gros bloc `{selectedCrmContact && (... 800 lignes fiche ...)}`)

**Approche** : extraire **en un seul composant** `tabs/crm/FicheContactModal.jsx` sans encore découper les 11 sous-zones internes. Objectif : réduire CrmTab à ~600 lignes en une seule extraction.

**Points sensibles à vérifier** :
- Edit inline avec `collabNotesTimerRef` debounce → ref partagé qui doit rester accessible via context (vérifier exposition dans CollabContext)
- 7+ API calls directs (notes PUT, custom_fields POST/DELETE, status_history GET, ai_copilot_analyses, conversations sms-history, voip transcript, contacts PUT cancel-contract)
- Sous-screens externes déjà extraits (`FicheClientMsgScreen`, `FicheSuiviScreen`, `FicheDocsLinkedScreen`) importés depuis `screens/`

**Pattern** : identique S1.1/2/3 — destructure tout du context, pas de prop-drilling, conserver tous les `typeof X !== 'undefined'` résiduels (cleanup séparé plus tard).

### Étape 2 — S1.4b : décomposer FicheContactModal en 11 sous-zones

Une fois S1.4a validée (build + smoke + test manuel MH), extraire progressivement dans `tabs/crm/fiche/` :

1. `FicheHeader.jsx` (score + stage badges)
2. `FicheIntelligentBlock.jsx` (prochain RDV, action prioritaire)
3. `FicheActionsBar.jsx` (contrat, cancel, supprimer, bouton Transférer)
4. `FicheBookings.jsx` (RDV list edit/delete inline)
5. `FicheCoordonnees.jsx` (prénom/nom/email/tél/rating/tags)
6. `FicheCustomFields.jsx` (custom_fields_json)
7. `FicheNotes.jsx` (notes + historique statut lazy-loaded)
8. `FicheAiAnalyses.jsx` (AI copilot analyses)
9. `FicheMessagesSms.jsx` (SMS history + compose)
10. `FicheVoipSection.jsx` (transcripts, recordings)
11. `FicheEspaceClient.jsx` (lien + SMS)

Une extraction = un commit = un smoke. Rollback si régression.

### Étape 3 — Mini-wave typeof cleanup (APRÈS S1 complet)

Avant de lancer S2 (CollabPortal modals), solder la dette `typeof X !== 'undefined'` dans CrmTab + sous-composants extraits. Audit + classement :
- Vraie dette (symbole toujours défini) → retirer le typeof
- Protection légitime (symbole optionnel) → garder
- Masquage de branchement incomplet → corriger le branchement

Ne PAS faire cleanup opportuniste durant S1 — attendre la mini-wave dédiée.

### Étape 4 — Suite structuration (selon plan consolidé P1 closure)

- **S2** — CollabPortal modals (ScheduleBookingModal, RescheduleModal, CancelBookingModal, AssignContactModal)
- **S3** — CollabPortal hooks (useOptimisticBooking, useContactUpdate, usePipelineDrag)
- **S4** — PhoneTab décomposition (la plus risquée — 8935 lignes, 112 hooks top-level)

### Dettes P2 identifiées (à arbitrer après S1 complet)

- Réconcilier V1 Share (`sharedWithId`) et V7 Transfer (`contact_followers`) — deux systèmes parallèles
- Ajouter UNIQUE DB constraint `(collaboratorId, date, time)` pour défense profonde
- Notifications manquantes (Contact Share visiteur, interMeetings participants)
- `pipeline_automations` table — activer runtime OU supprimer (code mort)
- 5 `audit_logs` sans companyId (§5bis CLAUDE.md)
- 2 `bookings.companyId IS NULL` historiques (§5bis)

### Dette structurelle majeure (à traiter en phase E.4 séparée)

**Audit unification** : fusionner `pipeline_history` + `contact_status_history` en une table canonique `contact_stage_events`. Prérequis au moteur d'événements (§9 audit produit). ETL legacy nécessaire. Toucher tous les call-sites pipeline.

---

## 🔧 Commandes utiles pour reprise

### SSH VPS
```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115
```

### Healthcheck prod
```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "curl -s http://127.0.0.1:3001/api/health"
```

### Build + deploy frontend
```bash
cd /Users/design/Desktop/PLANORA/app && npm run build
scp -i ~/.ssh/id_ed25519 -r dist/* root@136.144.204.115:/var/www/vhosts/calendar360.fr/httpdocs/
```

### Smoke scripts (sans session — bundle + page garde)
```bash
cd /Users/design/Desktop/PLANORA/ops/smoke
npm run smoke   # 1 page
npm run tour    # 4 tabs sans auth
npm run click   # 4 tabs + 1 click par tab
```

### Scan orphelins CrmTab
```bash
cd /Users/design/Desktop/PLANORA/ops/smoke
node audit-collab-orphans.mjs | python3 -c "import json,sys;d=json.load(sys.stdin);t=d['tabs'].get('CrmTab',{});print('CrmTab A:',len(t.get('A_missingJsx',[])),'B:',len(t.get('B_missingFromProvider',[])),'C:',len(t.get('C_deadDestructure',[])),'D:',len(t.get('D_defensivePatterns',[])))"
```

### Backup VPS triple + SHA-256
```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "ts=\$(date -u +%Y%m%d-%H%M%S); cd /var/www && tar --exclude='planora/app/node_modules' --exclude='planora/server/node_modules' --exclude='planora/.git' -czf /var/backups/planora/planora-full-<label>-\${ts}.tar.gz planora/ planora-data/ && chmod 600 /var/backups/planora/planora-full-<label>-\${ts}.tar.gz && sha256sum /var/backups/planora/planora-full-<label>-\${ts}.tar.gz"
```

### Rollback commit isolé si régression
```bash
cd /Users/design/Desktop/PLANORA && git revert <hash> && npm --prefix app run build && scp -i ~/.ssh/id_ed25519 -r app/dist/* root@136.144.204.115:/var/www/vhosts/calendar360.fr/httpdocs/
```

---

## 📐 Règles architecturales à respecter (non-négociables)

### CLAUDE.md §0bis — Architecture frontend (gravée post Phase 14b)
Tout symbole partagé DOIT passer par `useCollabContext`. Jamais closure parent lexicale. Aucune cohabitation ancien/nouveau. Aucun `typeof X !== 'undefined'` ajouté pour masquer un branchement cassé.

### CLAUDE.md §10 — Option A runtime
Monolithe `calendar360.db` = seule source de vérité. Toutes les 6 companies en `tenantMode='legacy'`. Utiliser `import { db } from '../db/database.js'` + `WHERE companyId` sur nouvelles routes. Pas de `resolveTenant` / `withTenant` / `shadowCompare`.

### Session MH — règles de travail
- Scope strict par patch, pas de refactor opportuniste
- 1 extraction = 1 commit atomique (S1 strict)
- Backup pré-deploy systématique
- Tests service-layer + smoke + test manuel MH avant validation
- SSH VPS disponible depuis sandbox Claude

### Checklist découpage (S1 validée, à appliquer pour S2/S3/S4)
1. Scan exhaustif symboles avant extraction
2. Décider LOCAL vs PARTAGÉ pour chaque
3. Créer dossier + frontmatter avant déplacement
4. Aucun ancien chemin conservé
5. Aucun `typeof X !== 'undefined'` ajouté
6. Audit statique automatique (orphans A=0, B=0)
7. Tour smoke runtime (3 scripts verts)

---

## 🔗 Références rapides

| Source | Chemin |
|---|---|
| Règle architecture frontend | `CLAUDE.md §0bis` |
| Règle data Option A | `CLAUDE.md §10` |
| Handoff précédent (matin 2026-04-22) | `HANDOFF-2026-04-22.md` |
| Audit produit consolidé (P1 closure) | commit `7016ff33` body |
| Helpers backend P1 | `server/services/bookings/` + `server/services/collaborators/` |
| Extractions S1 CrmTab | `app/src/features/collab/tabs/crm/` + `components/` |
| Smoke scripts | `ops/smoke/{collab-smoke,collab-tour,collab-click}.mjs` |
| Scan orphelins | `ops/smoke/audit-collab-orphans.mjs` |
| Memory projet | `/Users/design/.claude/projects/-Users-design-Desktop-PLANORA/memory/` |

---

## 📋 Checklist de reprise en nouvelle session

1. Lire ce HANDOFF en entier
2. Lire `CLAUDE.md §0bis + §10`
3. Lire `MEMORY.md` (auto-chargé)
4. Vérifier état prod : `ssh … "curl http://127.0.0.1:3001/api/health"`
5. Vérifier git state : `git log --oneline origin/clean-main -5` (devrait montrer `348347ff` en tête)
6. **Premier acte recommandé** : demander à MH de faire le test manuel S1.3 sur prod (mode Table + Kanban + drag&drop + bulk actions + cartes)
7. Si OK → lancer S1.4a (extraction container FicheContactModal entier)
8. Si bug → rollback `git revert <hash>` du commit fautif, analyser, corriger

---

_Document généré en fin de session 2026-04-22 soir pour transition sans perte de contexte. 10 commits pushés sur origin/clean-main depuis le matin (P1 closure + 9 extractions S1)._
