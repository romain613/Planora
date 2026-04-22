# HANDOFF 2026-04-22 (soir 2 — post-S1.4a) — Transition pour nouvelle session

> **Priorité lecture pour reprendre** :
> 1. Ce document en entier
> 2. `CLAUDE.md` §0bis (règle architecture frontend — gravée) + §10 (Option A runtime)
> 3. `HANDOFF-2026-04-22-soir.md` (handoff précédent — état P1 closure + S1.1+S1.2+S1.3)
> 4. Memory projet : `/Users/design/.claude/projects/-Users-design-Desktop-PLANORA/memory/`

---

## 🟢 État prod actuel

- **Bundle frontend live** : `index-BwKLvCj7.js` (S1.4a déployé)
- **Backend PM2** : `calendar360` online, healthcheck OK (`companies=6, collaborateurs=13`)
- **Branch git** : `clean-main`, **HEAD = `a7a2be9b`** pushé sur origin
- **DB monolithe** : `/var/www/planora-data/calendar360.db` (Option A §10 CLAUDE.md)

## 📦 Backup triple-redondance P1 closure (toujours valide)

- **SHA-256** identique sur 3 copies : `b17f588985a5a62ae34be7a0f6c0cc5b52e6bf106ddf791f87f4899b1ad888db`
- VPS : `/var/backups/planora/planora-full-P1-close-20260422-142038.tar.gz`
- Mac : `~/Desktop/PLANORA/backups/planora-full-P1-close-20260422-142038.tar.gz`
- iCloud : `~/Library/Mobile Documents/com~apple~CloudDocs/PLANORA-backups/planora-full-P1-close-20260422-142038.tar.gz`

> Pas de nouveau backup depuis P1 closure : aucune mutation DB depuis (S1.x = pure refacto frontend, le code est dans git).

## Backups VPS incrémentaux frontend (pré-déploy)

- `/var/backups/planora/httpdocs-pre-S1-1-…tar.gz`
- `/var/backups/planora/httpdocs-pre-S1-2-…tar.gz`
- `/var/backups/planora/httpdocs-pre-S1-3-…tar.gz`
- `/var/backups/planora/httpdocs-pre-S1-4a-…tar.gz`

---

## ✅ Ce qui a été livré dans la session 2026-04-22 (matin → soir 2)

### Matin — Phase B + Vague 1 + Vague 2 (commits avant clean-main HEAD)
Stabilisation lifecycle agenda/booking/pipeline. 39+21+36 tests verts. Cf. `HANDOFF-2026-04-22.md` du matin.

### Après-midi — P1 closure (commit `7016ff33`)
- **Wave B** : helper `markNoShow.js` + matrice no-show (B.5) + audit/history obligatoires
- **Wave D c1** : helpers `archiveCollaborator.js` + `findArchiveTargetAdmin.js` + migration DB `collaborators.archivedAt/archivedBy` + 12 sites filtrés `archivedAt`
- **Wave D c2** : helper `hardDeleteCollaborator.js` + endpoint `DELETE /api/collaborators/:id/hard?confirm=true` + triple garde-fou
- 176 tests cumulés P1 verts, 0 régression

### Soir 1 — S1.1 + S1.2 + S1.3 (9 commits)
- 4 modals extraits : `AddStageModal`, `EditStageModal`, `DeleteStageConfirmModal`, `BulkSmsModal`
- 3 zones présentation : `CrmHeader`, `CrmDashboardView`, `CrmFiltersBar`
- 2 vues principales : `CrmTableView` (Z5+Z6), `CrmKanbanView` (Z7+Z9)
- CrmTab : 1713 → 974 lignes (-43%)

### Soir 2 — S1.4a (commit `a7a2be9b`)
- **Extraction monolithique** du gros bloc Fiche client (~810 lignes JSX) dans `tabs/crm/fiche/FicheContactModal.jsx`
- Stratégie : copie textuelle du bloc + destructure complète des 90+ symboles du context (identique à CrmTab pour 0 risque de symbole manquant)
- Imports techniques corrigés : `tabs/crm/fiche/` est un niveau plus profond → tous les `../../../../` deviennent `../../../../../`
- **CrmTab : 974 → 167 lignes** (-83% sur cette extraction, **-90% cumulé depuis 1713**)
- CrmTab est devenu un **vrai orchestrateur** : 30 imports + destructure + 9 sous-composants imbriqués

---

## 📊 État cumulé S1 (4 sous-vagues)

| Vague | Composants extraits | Commits | CrmTab après |
|---|---|---|---|
| S1.1 | AddStageModal, EditStageModal, DeleteStageConfirmModal, BulkSmsModal | 4 | 1605 lignes |
| S1.2 | CrmHeader, CrmDashboardView, CrmFiltersBar | 3 | 1335 lignes |
| S1.3 | CrmTableView (Z5+Z6), CrmKanbanView (Z7+Z9) | 2 | 974 lignes |
| **S1.4a** | **FicheContactModal monolithique** | **1** | **167 lignes** |
| **TOTAL** | **10 composants extraits** | **10** | **1713 → 167 (-90%)** |

Scan orphelins CrmTab post-S1.4a : **A=0, B=0** (aucun symbole flottant). C=169 (dette pré-existante + duplication temporaire des destructures, sera nettoyée en S1.4b ou mini-wave). D=1 (typeof réduit progressivement).

Smoke runtime (3 scripts) : verts à chaque vague, dernière exécution post-S1.4a OK.

### Test manuel S1.x validé par MH
- ✅ S1.1 (4 modals) — testé OK
- ✅ S1.2 (3 zones) — testé OK
- ✅ S1.3 (table + kanban + drag&drop + bulk + cartes) — testé OK
- ⏳ **S1.4a (FicheContactModal) — NON TESTÉ MANUELLEMENT AVANT FIN DE SESSION** (à valider en premier en reprise)

---

## ⏳ Ce qui reste à faire — PROCHAINE SESSION

### Étape 0 OBLIGATOIRE — Test manuel prod S1.4a avant S1.4b

MH doit valider sur calendar360.fr (bundle live `index-BwKLvCj7.js` ou ultérieur) :

**1. Ouverture fiche** : clic sur ligne table OU sur carte kanban (en mode pipeline c'est `pipelineRightContact` géré par CollabPortal, pas par FicheContactModal directement, mais le modal selectedCrmContact est touché par les boutons "Fiche" des cartes)

**2. Header fiche** :
- Score + stage badges
- Nom + civility/firstname/lastname/email/phone
- Tags
- Actions (close, edit-toggle)
- Affichage spécial si `!ct._linked` (visiteur non-CRM)

**3. Bloc intelligent** :
- Badges Source + Créé le + Dernier contact
- Prochain RDV countdown OU "Aucun RDV programmé" cliquable
- Action prioritaire contextuelle (dropdown "Changer..." + bouton "Fait")

**4. Sub-tabs** :
- `notes` : coordonnées + custom fields + notes textarea + historique statut
- `client_msg` (FicheClientMsgScreen)
- `sms` : history + compose
- `history` : RDV à venir + passés + édition inline (note, replanifier, supprimer)
- `appels` : VoIP transcripts
- `docs` (FicheDocsLinkedScreen)
- `suivi` (FicheSuiviScreen)
- `partage` : si `ct.assignedTo === collab.id`

**5. Édition coordonnées** (notes tab) :
- Taper dans prénom/nom/email/téléphone → debounce 500ms via `collabNotesTimerRef` → save backend
- Vérifier que la pastille Pipeline Live se met à jour (via `_T.crmSync`)

**6. Notes textarea** : taper longuement → debounce 800ms → save

**7. Custom fields** : ajouter/supprimer un champ, edit valeur

**8. Espace client** (bas de fiche, si `ct._linked`) : activer / copier lien / envoyer SMS

**9. Console DevTools** : 0 ReferenceError, 0 warning React

→ Si OK → S1.4b (décomposition en 11 sous-zones)
→ Si bug → `git revert a7a2be9b` (rollback en 30s) et analyser

### Étape 1 — S1.4b : décomposer FicheContactModal en 11 sous-zones

Une fois S1.4a validée par test manuel, extraire progressivement dans `tabs/crm/fiche/` :

| # | Composant | Source dans FicheContactModal.jsx | Difficulté |
|---|---|---|:-:|
| 1 | `FicheHeader.jsx` | header score+stage badges + close button | ★ |
| 2 | `FicheIntelligentBlock.jsx` | prochain RDV + action prioritaire | ★★ |
| 3 | `FicheActionsBar.jsx` | pipeline stage selector + quick actions (Email/Appeler/SMS/RDV/Perdu/Supprimer) + contract banner | ★★ |
| 4 | `FicheBookings.jsx` | history tab — RDV à venir + passés avec édit inline | ★★ |
| 5 | `FicheCoordonnees.jsx` | bloc coordonnées (prénom, nom, email, téléphone, civility, contact_type, source, rating) | ★★ |
| 6 | `FicheCustomFields.jsx` | custom_fields_json + add/delete fields | ★★ |
| 7 | `FicheNotes.jsx` | notes textarea + historique statut lazy-loaded | ★ |
| 8 | `FicheAiAnalyses.jsx` | bouton AI copilot + bloc analyses | ★ |
| 9 | `FicheMessagesSms.jsx` | SMS history + compose + numéros | ★★★ |
| 10 | `FicheVoipSection.jsx` | appels tab — transcripts, recordings | ★★ |
| 11 | `FicheEspaceClient.jsx` | espace client en bas (token, activate, copy link, SMS) | ★ |

Pattern strict : 1 sous-zone = 1 commit, build + smoke + scan après chaque, aucun cleanup opportuniste, aucune modif métier.

**Recommandation ordre** : commencer par les plus simples (★) pour valider la méthode interne au container, puis les ★★ et terminer par FicheMessagesSms (★★★ — beaucoup d'API + état local complexe).

### Étape 2 — Mini-wave typeof cleanup (APRÈS S1.4b complet)

Avant S2 (CollabPortal modals), solder la dette `typeof X !== 'undefined'` :
- Retirer les destructures dupliquées entre CrmTab et FicheContactModal (réduira C de ~50 dans CrmTab)
- Auditer + classer les `typeof X !== 'undefined'` :
  - vraie dette (symbole toujours défini) → retirer
  - protection légitime (symbole optionnel) → garder
  - masquage de branchement → corriger

### Étape 3 — Suite structuration

- **S2** — CollabPortal modals (ScheduleBookingModal, RescheduleModal, CancelBookingModal, AssignContactModal)
- **S3** — CollabPortal hooks (useOptimisticBooking, useContactUpdate, usePipelineDrag)
- **S4** — PhoneTab décomposition (8935 lignes, 112 hooks — la plus risquée)

### Dettes P2 identifiées (à arbitrer après S1 complet)

- Réconcilier V1 Share (`sharedWithId`) et V7 Transfer (`contact_followers`) — deux systèmes parallèles
- UNIQUE DB constraint `(collaboratorId, date, time)` pour défense profonde
- Notifications manquantes (Contact Share visiteur, interMeetings participants)
- `pipeline_automations` table — activer runtime OU supprimer (code mort)
- 5 `audit_logs` sans companyId, 2 `bookings.companyId IS NULL` (§5bis CLAUDE.md)

### Dette structurelle majeure (Phase E.4 séparée)

Audit unification : fusionner `pipeline_history` + `contact_status_history` en table canonique `contact_stage_events`. Prérequis au moteur d'événements.

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

### Smoke scripts
```bash
cd /Users/design/Desktop/PLANORA/ops/smoke
npm run smoke   # 1 page
npm run tour    # 4 tabs sans auth
npm run click   # 4 tabs + 1 click par tab
```

### Scan orphelins CrmTab + Global
```bash
cd /Users/design/Desktop/PLANORA/ops/smoke
node audit-collab-orphans.mjs | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('Global A:',d['summary']['grandTotals']['A'],'B:',d['summary']['grandTotals']['B'])
for name,t in d['tabs'].items():
    a=len(t.get('A_missingJsx',[])); b=len(t.get('B_missingFromProvider',[]))
    if a>0 or b>0: print(f'  {name}: A={a} B={b}')
t=d['tabs'].get('CrmTab',{})
print('CrmTab A:',len(t.get('A_missingJsx',[])),'B:',len(t.get('B_missingFromProvider',[])),'C:',len(t.get('C_deadDestructure',[])),'D:',len(t.get('D_defensivePatterns',[])))
"
```

### Rollback rapide d'un commit S1.x si régression
```bash
cd /Users/design/Desktop/PLANORA && git revert a7a2be9b && npm --prefix app run build && scp -i ~/.ssh/id_ed25519 -r app/dist/* root@136.144.204.115:/var/www/vhosts/calendar360.fr/httpdocs/
```

### Backup VPS triple + SHA-256
```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "ts=\$(date -u +%Y%m%d-%H%M%S); cd /var/www && tar --exclude='planora/app/node_modules' --exclude='planora/server/node_modules' --exclude='planora/.git' -czf /var/backups/planora/planora-full-<label>-\${ts}.tar.gz planora/ planora-data/ && chmod 600 /var/backups/planora/planora-full-<label>-\${ts}.tar.gz && sha256sum /var/backups/planora/planora-full-<label>-\${ts}.tar.gz"
```

---

## 📐 Règles architecturales à respecter (non-négociables)

### CLAUDE.md §0bis — Architecture frontend
Tout symbole partagé via `useCollabContext`. Jamais closure parent. Aucune cohabitation ancien/nouveau. Aucun `typeof X !== 'undefined'` ajouté pour masquer un branchement cassé.

### CLAUDE.md §10 — Option A runtime
Monolithe `calendar360.db` = seule source de vérité. 6 companies en `tenantMode='legacy'`. `import { db } from '../db/database.js'` + `WHERE companyId`.

### Règles de travail MH
- 1 extraction = 1 commit atomique
- Backup pré-deploy systématique
- Build + smoke + scan orphelins après chaque extraction
- Test manuel MH après chaque vague
- Aucun cleanup opportuniste durant S1
- Aucune modification métier dans S1

### Checklist 7 points découpage (validée et appliquée)
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
| Handoff matin (HEAD avant session) | `HANDOFF-2026-04-22.md` |
| Handoff soir 1 (post P1+S1.3) | `HANDOFF-2026-04-22-soir.md` |
| Handoff soir 2 (post S1.4a) | **CE DOCUMENT** |
| Composants extraits S1 | `app/src/features/collab/components/` + `tabs/crm/` + `tabs/crm/fiche/` |
| Helpers backend P1 | `server/services/bookings/` + `server/services/collaborators/` |
| Smoke scripts | `ops/smoke/{collab-smoke,collab-tour,collab-click}.mjs` |
| Scan orphelins | `ops/smoke/audit-collab-orphans.mjs` |
| Memory projet | `/Users/design/.claude/projects/-Users-design-Desktop-PLANORA/memory/` |

---

## 📋 Checklist de reprise en nouvelle session

1. Lire ce HANDOFF en entier
2. Lire `CLAUDE.md §0bis + §10`
3. Lire `MEMORY.md` (auto-chargé)
4. Vérifier état prod : `ssh … "curl http://127.0.0.1:3001/api/health"`
5. Vérifier git : `git log --oneline origin/clean-main -5` (devrait montrer `a7a2be9b` en tête)
6. **Premier acte** : demander à MH de faire le test manuel S1.4a sur prod (ouvrir fiche, naviguer sub-tabs, éditer coordonnées avec debounce, custom fields, espace client, console DevTools)
7. Si OK → S1.4b (décomposer FicheContactModal en 11 sous-zones, ordre par difficulté ★→★★★)
8. Si bug → `git revert a7a2be9b` du commit S1.4a, analyser

---

_Document généré en fin de session 2026-04-22 soir 2 pour transition sans perte. 11 commits pushés sur origin/clean-main (3 commits matin + P1 closure + 9 extractions S1.1+S1.2+S1.3+S1.4a + 1 docs handoff précédent)._

_État cumulé : CrmTab 1713 → 167 lignes (-90%), 10 composants extraits, A=0/B=0 stable, smoke 3/3 verts, 0 régression métier._
