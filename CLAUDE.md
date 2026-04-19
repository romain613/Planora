# PLANORA / Calendar360 — Mémoire Projet

> Dernière mise à jour : 2026-04-19 (V7 P0 fonctionnel en prod + onboarding data eng en cours)
> Mainteneur : MH (rc.sitbon@gmail.com, supra admin)
> Collaborateur data eng : en cours d'onboarding (accès SSH à configurer, VS Code/Cursor en install)

---

## 0. RÈGLE FONDAMENTALE — ISOLATION DB PAR ENTREPRISE

> **UN CLIENT = UNE BASE DE DONNÉES DÉDIÉE**
>
> Décision architecturale actée par MH (2026-04-19).

### Règle absolue
Chaque entreprise cliente possède **sa propre base de données SQLite séparée**, stockée
dans `/var/www/planora-data/tenants/<companyId>.db`. Il n'existe **aucune exception**.

### Périmètre actuel (entreprises avec base dédiée)
- **CapFinances** (`c1776169036725`) → `/var/www/planora-data/tenants/c1776169036725.db`
- **MonBilandeCompetences.fr** (`c-monbilan`) → `/var/www/planora-data/tenants/c-monbilan.db`

### Règle pour toute nouvelle entreprise
Lors de la création d'une nouvelle entreprise (inscription, onboarding, migration manuelle) :
1. Le système DOIT créer automatiquement une nouvelle DB SQLite à
   `/var/www/planora-data/tenants/<nouveauCompanyId>.db`
2. Cette DB est initialisée avec le schéma complet (les 88+ tables business)
3. L'entrée `companies` dans Control Tower (`control_tower.db`) est créée avec :
   - `tenantMode = 'tenant'` (ou `'shadow'` si migration progressive depuis monolithe)
   - `tenantFeatures` paramétré selon la phase de migration
4. Le `companyId` est immuable et sert d'identifiant unique pour cette base
5. L'espace client de l'entreprise (storage fichiers, uploads) suit la même isolation :
   `/var/www/planora-data/storage/<companyId>/`

### Implications code à respecter
- **Aucune route backend ne doit importer `db` du monolithe directement** pour des opérations
  sur les données business d'une entreprise. Toutes les routes qui touchent aux contacts,
  bookings, call_logs, messages, call_transcripts, contact_followers, etc. DOIVENT passer
  par le tenantResolver pour obtenir le bon handle DB.
- Le monolithe (`calendar360.db`) ne doit plus servir que pour :
  - Les anciennes entreprises non encore migrées (legacy, à phaser out progressivement)
  - Les tables globales partagées (ex : `supra_admins`)
- Toute nouvelle fonctionnalité (V7, V8, etc.) doit être conçue multi-tenant dès le départ,
  avec le resolver comme seul point d'accès DB.

### Pattern type à utiliser dans les routes backend
```js
// ❌ MAUVAIS — importe le db monolithe, ignore le tenant
import { db } from '../db/database.js';
router.put('/endpoint', (req, res) => {
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
});

// ✅ BON — utilise le resolver pour obtenir le bon handle
import { getDbForCompany } from '../db/tenantResolver.js';
router.put('/endpoint', (req, res) => {
  const db = getDbForCompany(req.auth.companyId);
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
});
```

### À auditer régulièrement
- Les routes qui font `import { db } from '../db/database.js'` → potentiellement buggées
  pour les entreprises en mode shadow/tenant. **Le bug V7 transfert (2026-04-19) en est
  un cas typique** : `transfer.js` utilise le monolithe direct, donc ne trouve pas les
  contacts quand l'utilisateur est sur une entreprise à base dédiée.
- Les tenant DBs doivent avoir TOUTES les tables du monolithe (pas seulement 88/93) au fur
  et à mesure que des features sont ajoutées. À ce jour CapFinances/MonBilan ont 88 tables,
  le monolithe en a 93 → 5 tables manquantes à identifier et synchroniser.
- Chaque nouvelle migration/feature qui ajoute une table au monolithe DOIT aussi
  la créer dans toutes les tenant DBs existantes (script idempotent de propagation).

---

## 1. INFRASTRUCTURE

### Serveur VPS
- **IP** : `136.144.204.115`
- **SSH** : `ssh -i ~/.ssh/id_ed25519 root@136.144.204.115`
- **OS** : Debian 12 + Plesk
- **Hébergeur** : TransIP (panel : https://www.transip.nl/cp/ → VPS)
- **Hardware (2026-04-19)** : 6 cœurs, 8 Go RAM, 300 Go disque (upgrade depuis 2 Go) + swap 8 Go
- **Process manager** : PM2 (`ecosystem.config.cjs`)
- **Web server** : nginx (géré par Plesk)
- **Note** : l'upgrade de pack TransIP nécessite un reboot manuel depuis le panel pour activer la nouvelle RAM.

### Chemins CRITIQUES sur le VPS

| Quoi | Chemin | Notes |
|------|--------|-------|
| **Code source** | `/var/www/planora/app/src/App.jsx` | SPA React ~39K lignes |
| **Build output** | `/var/www/planora/app/dist/` | Où `npm run build` écrit |
| **PIÈGE — ancien dist** | `/var/www/planora/dist/` | A son propre index.html, NE PAS UTILISER |
| **NGINX SERT ICI** | `/var/www/vhosts/calendar360.fr/httpdocs/` | **Toujours copier le build ici !** |
| **Base monolithe** | `/var/www/planora-data/calendar360.db` | SQLite WAL, 93 tables |
| **Control Tower** | `/var/www/planora-data/control_tower.db` | Métadonnées multi-tenant |
| **Bases tenant** | `/var/www/planora-data/tenants/<companyId>.db` | **Peuplées** pour CapFinances (1.6M, 88 tables) et MonBilan (3.4M, 88 tables). Voir §0. |
| **Fichiers upload** | `/var/www/planora-data/storage/<companyId>/` | Par entreprise |
| **Backend** | `/var/www/planora/server/` | Node.js Express |
| **PM2 config** | `/var/www/planora/ecosystem.config.cjs` | |

### Commande de déploiement COMPLÈTE
```bash
# 1. Build
cd /var/www/planora/app && npm run build
# 2. COPIER VERS HTTPDOCS (sinon nginx sert l'ancienne version !)
cp -r /var/www/planora/app/dist/* /var/www/vhosts/calendar360.fr/httpdocs/
# 3. Restart backend
cd /var/www/planora && pm2 restart ecosystem.config.cjs
```

### Backups sur le VPS (`/var/www/planora/app/src/`)
| Fichier | Date | Lignes | Description |
|---------|------|--------|-------------|
| `App.jsx.bak` | 9 avril | 37134 | Ancien état |
| `App.jsx.bak-20260417` | 17 avril 12:13 | 39183 | **Vrai état prod avant V7** |
| `App.jsx.pre-v7` | 17 avril 12:51 | 39158 | Créé par deploy-v7.sh (25 lignes de moins que bak-20260417) |
| `App.jsx.pre-deploy-all-backup` | 17 avril | | Backup avant deploy-all.sh |

---

## 2. ARCHITECTURE APPLICATION

### Stack
- **Frontend** : React 18 SPA, un seul `App.jsx` (~39K lignes), Vite, esbuild
- **Backend** : Node.js + Express
- **DB** : SQLite (better-sqlite3), mode WAL
- **VoIP** : Intégré (call_logs, transcripts, conversations)
- **IA** : Copilot analyses intégrées

### Patterns React importants
- **Pipeline Live** (kanban téléphone) : quick actions = `[{icon, color, tip, action}].map()` — PAS du JSX brut
- **HookIsolator** : pattern pour les onglets avec React hooks (utilisé pour Suivi tab)
- **Composants utilitaires** : `<I n="icon-name" s={size}/>` pour les icônes, `<Avatar name="" color="" s={size}/>` pour les avatars
- **Thème** : objet `T` avec `T.text`, `T.text2`, `T.text3`, `T.surface`, `T.bg`, `T.border`, `T.accentBg`
- **Notifications** : `showNotif(message, type)` — types: 'success', 'danger'
- **API calls** : `api('/api/endpoint')` — wrapper fetch interne

### Onglets fiche contact
Définis comme array : `{id:"...", label:"..."}` — actuellement : infos, notes, historique, docs, suivi (V7)

---

## 3. SYSTÈME DB HYBRIDE MULTI-TENANT

### Architecture 3 tiers

**Tier 1 — Monolithe** (`calendar360.db`)
- Base unique avec TOUTES les données de TOUTES les entreprises
- Isolation par colonne `companyId` sur chaque table business
- 93 tables : companies, collaborators, contacts, bookings, call_logs, etc.
- **C'est ce qui est LIVE en production actuellement**

**Tier 2 — Control Tower** (`control_tower.db`)
- Registre central des tenants
- Tables : `companies` (avec `tenantMode`, `tenantFeatures`), `tenant_databases`, `sessions`, `supra_admins`, `tenant_shadow_diffs`
- Gère le routing : quel mode pour quelle entreprise

**Tier 3 — Bases par entreprise** (`tenants/<companyId>.db`)
- **POPULÉ et ACTIF** pour CapFinances (`c1776169036725.db`, 1.6 Mo, 88 tables) et
  MonBilandeCompetences.fr (`c-monbilan.db`, 3.4 Mo, 88 tables).
- Voir §0 pour la règle d'isolation DB par entreprise — **toute nouvelle entreprise
  ouverte sur Planora doit avoir sa propre base dédiée**.

### Modes de routing (tenantResolver.js)

| Mode | Lecture | Écriture | Status |
|------|---------|----------|--------|
| **legacy** | Monolithe seul | Monolithe seul | Actif pour les entreprises historiques non encore migrées |
| **shadow** | Monolithe + tenant en parallèle, compare, retourne monolithe | Monolithe seul | **Actif pour CapFinances et MonBilan** (feature `contacts`) |
| **tenant** | Base tenant (fallback monolithe) | Base tenant | Cible finale pour toutes les entreprises une fois la migration stabilisée |

### Résolution du routing
```
Requête → extraire companyId (auth middleware)
→ resolveTenant(companyId) via Control Tower (cache 10min)
→ getRouteMode(companyId, feature)
  → kill-switch si tenantMode='legacy' → legacy
  → sinon check tenantFeatures[feature]
  → sinon fallback tenantMode
→ route vers la bonne DB
```

### Variables d'environnement DB
- `TENANTS_DIR` : `/var/www/planora-data/tenants` (défaut)
- `STORAGE_DIR` : `/var/www/planora-data/storage`
- `CONTROL_TOWER_PATH` : `/var/www/planora-data/control_tower.db`

### Données en prod
- 285 contacts, 6 entreprises, 11 collaborateurs
- Julie = collaboratrice principale pour les tests

---

## 4. V7 — SYSTÈME DE TRANSFERT INTER-COLLABORATEURS

### Backend (déjà en prod)
- Table `contact_followers` : rôles source/executor/viewer/follower
- `GET /api/transfer/followers/:contactId` — followers d'un contact
- `GET /api/transfer/followers-batch` — map followers pour badges (tous contacts)
- `PUT /api/transfer/executor/:contactId` — transférer un contact
- Body : `{ executorCollabId: "..." }`

### Frontend V7 — P0 100% FONCTIONNEL (2026-04-19)
Validation finale 2026-04-19 07:33 par MH : transfert Romain Sitbon → Julie testé OK,
contact bien arrivé chez l'executor cible. Tous les points P0 fonctionnent :

| Composant | Fichier | Status |
|-----------|---------|--------|
| States V7 + handler + modal | `p0-step1-v7base.js` | ✅ Déployé fonctionnel |
| Bouton Transférer Pipeline Live | `p0-step2-pipeline-btn.js` | ✅ Déployé fonctionnel |
| Badge executor sur carte Pipeline | `p0-fix-badge.js` | ✅ Déployé fonctionnel |
| Onglet Suivi dans fiche contact | `p0-step4-suivi-tab.js` | ✅ Déployé |
| Modal V7 dans return JSX | `fix-modal-relocation.js` | ✅ Déployé |
| Fallback supra impersonation | Patch direct backend + frontend (2026-04-19 07:30) | ✅ Déployé fonctionnel |

### Fichiers backend touchés par les fix V7 (2026-04-19)
- `/var/www/planora/server/db/database.js` lignes 2339, 2374 : `createdAt` → `addedAt` dans INSERT contact_followers
- `/var/www/planora/server/routes/transfer.js` ligne 55-56 : fallback supra `req.auth.companyId || req.auth._activeCompanyId || req.body.companyId`
- Tenant DBs : table `contact_followers` créée dans `c1776169036725.db` et `c-monbilan.db`

### Phases à venir
- **P1** : choix de rôle, message/contexte, keep-in-pipeline, booking RDV
- **P2** : notifications, dashboard source, historique transferts
- **§0 audit** : passer toutes les routes qui font `import { db }` direct au tenantResolver (rappel règle CLAUDE.md §0)

---

## 5. BUGS CONNUS

### Corrigés
- `selectedCrmContact` ReferenceError : variable déclarée à ligne ~2717 mais utilisée à lignes 23299 et 38949 dans d'autres scopes → wrappé avec `typeof` checks
- Bouton Transférer invisible : mauvais chemin de déploiement (`/var/www/planora/app/dist/` au lieu de httpdocs)
- Badge executor "already exists" false positive : le check matchait le badge CRM au lieu du badge Pipeline
- Bouton Transférer visible mais non fonctionnel : garde `collabs.length>1` enlevé
- **Aujourd'hui tab crash React #310** (2026-04-19) : l'IIFE "MES ACTIONS DU JOUR" (NBA, lignes ~4774-4830 d'App.jsx) appelait 3 hooks (`useState` x2, `useEffect`) directement dans `{(()=>{...})()}`. Ces hooks étaient attachés au composant parent `ClientPortal`. Quand `portalTab !== "home"`, l'IIFE n'exécute pas → hook count du parent diminue de 3. Quand on revient sur "home", hook count augmente de 3 → React "Rendered more hooks than during the previous render". Fix : `fix-nba-hooks-isolation.js` remplace `{(()=>{...})()}` par `<HookIsolator>{()=>{...}}</HookIsolator>` — les hooks vivent sur le fiber de `HookIsolator`, pas du parent. Déployé via deploy-all.sh v17.
- **CRM fiche contact crash React #310** (2026-04-19) : même pattern que NBA — l'IIFE "V4: Debug mode — Historique des statuts" (lignes ~7145-7180) a 2 `useState` hooks dans `{(()=>{...})()}`. Crash quand on ouvre une fiche contact dans Mon CRM. Fix : `fix-status-history-hooks.js` wrap la même manière que NBA. Déployé via deploy-all.sh v18.
- **V7 Transfer modal ne s'ouvre pas — JSX dans du dead code** (2026-04-19) : le patch `p0-step1-v7base.js` insérait la modale en cherchant le marker `collabChatFloating` mais a matché la DÉCLARATION `useState` (ligne 2950) au lieu d'une utilisation JSX. Résultat : le bloc JSX `{/* V7 TRANSFER MODAL */} {v7TransferModal && (<div>...</div>)}` se retrouvait AU MILIEU des déclarations `useState` du composant, évalué comme expression statement et jeté → jamais rendu. L'onClick appelait `setV7TransferModal` sans throw, le state s'updatait, mais aucun JSX ne lisait ce state pour afficher la modale. Fix : `fix-modal-relocation.js` extrait le bloc modale de sa mauvaise position (~ligne 2918) et le réinsère au début du return JSX (~ligne 3798), juste avant le marker `{/* Notification toast */}`. Déployé via deploy-all.sh v18.
- **Backend 500 sur `/api/transfer/followers/:id` en shadow mode** (2026-04-19) : les tenant DBs (`c1776169036725.db` CapFinances, `c-monbilan.db`) avaient 88 tables mais pas `contact_followers`. Le tenantResolver en mode shadow tentait de lire `contact_followers` dans la tenant DB → table not found → 500. Fix intégré dans deploy-all.sh v18 : copie le schéma `contact_followers` du monolithe vers chaque tenant DB au déploiement (idempotent).
- **V7 Transfer INSERT `createdAt` colonne absente** (2026-04-19) : `database.js` lignes 2339 et 2374 faisaient un `INSERT INTO contact_followers (..., createdAt, updatedAt) VALUES (...)` alors que la colonne s'appelle `addedAt` (pas `createdAt`). Résultat : 500 `table contact_followers has no column named createdAt` à chaque clic Transférer. Fix par sed : remplacer `sourceColorKey, createdAt, updatedAt` par `sourceColorKey, addedAt, updatedAt` dans les 2 INSERTs. Déployé 2026-04-19 07:00.
- **V7 Transfer "Contact introuvable" en mode supra impersonation** (2026-04-19) : la route `PUT /api/transfer/executor/:id` utilisait `req.auth.companyId` et `req.auth.collaboratorId` directement. Problème : quand MH (supra admin) impersonne une company depuis le panel, la session a `collaboratorId = null`, `companyId = null`, `role = 'supra'`, et `activeCompanyId = 'c1776169036725'`. Le middleware `enforceCompany` laisse passer les supras sans auto-inject, donc `req.auth.companyId` restait null. Le SQL `WHERE companyId = NULL` retournait 0 ligne → "Contact introuvable". Fix 2-parties : (1) backend `transfer.js` ligne 55-56 : fallback `req.auth.companyId || req.auth._activeCompanyId || req.body.companyId` et pareil pour sourceCollabId ; (2) frontend handler V7 : ajoute `companyId: company?.id, sourceCollabId: collab?.id` dans le body de l'api call. Sécurité : pour les users normaux, `enforceCompany` vérifie déjà que `req.body.companyId === req.auth.companyId`, donc un attacker ne peut pas accéder à une autre company. Le fallback n'est activable que par des supras (bypass déjà existant). Déployé 2026-04-19 07:30.

### PATTERN CRITIQUE — Variables hors scope (CAUSE RACINE)
App.jsx fait ~39K lignes avec des **composants imbriqués définis dans le même fichier**.
Les variables `useState` déclarées dans le composant principal NE SONT PAS accessibles
dans les composants imbriqués définis plus loin dans le fichier.

**Variables affectées** :
| Variable | Déclaration | Références hors scope | Fix |
|----------|------------|----------------------|-----|
| `selectedCrmContact` | ligne ~2717 | lignes 23299, 38949 | `fix-selectedCrmContact.js` |
| `pipelineRightContact` | ligne ~1279 | lignes 6278, 6643, 9241, 21070, 23454, 39105 | `fix-all-scope-issues.js` |

**Solution** : `fix-all-scope-issues-v3.js` (v5.0) — wrap typeof automatique sur TOUTES les références
distantes (>300 lignes de la déclaration). Le typeof est un NO-OP pour les variables en scope.
Depuis v5.0, la **blocklist massive de 200+ mots est SUPPRIMÉE**. La détection intelligente
(13 classes) gère maintenant TOUS les cas. Seule une micro-blocklist reste (map, set, get, key, ref, id, log).
`MIN_NAME_LENGTH` réduit de 5 à 3.
Les 13 classes de détection intelligente couvrent : object keys, destructured params, array destructure,
useState line skip, dot accessor, JSX attributes, assignment targets, arrow params, const/let/var decl,
string literals, word boundary (Fix 1+2+3+4).

**13 classes de faux positifs découvertes et corrigées** :
1. Object keys : `{ timezone: value }` → blocklist (v3.1)
2. String contents : `'/api/tickets'` → blocklist (v3.2)
3. Config values : `trigger:"reconfirm"` → blocklist (v3.2)
4. Object property keys : `{ bufferBefore: 10 }` → object-key detection in Fix 4 (v3.3)
5. Destructured params (object) : `({ avails, setAvails })` → destructure detection in Fix 4 (v3.4)
6. useState array destructuring : `const [monthOffset, setMonthOffset] = useState(0)` → useState line skip + array destructure detection (v3.5)
7. Dot accessor property access : `res.contactEmail` → dot-accessor detection in Fix 4 (v3.6)
8. JSX attribute names : `<Comp contactEmail={val}>` → assignment/JSX detection in Fix 4 (v3.6)
9. Assignment targets / arrow params : `contactEmail = val`, `contactEmail => body` → assignment/JSX detection in Fix 4 (v3.6)
10. `const/let/var` declarations : `const selectedContact = value` → const-decl detection in Fix 4 (v3.7)
11. String literal values : `{key:'videoAuto',label:...}` → string-quote detection in Fix 4 (v3.8)
12. Dot accessor in Fix 2+3 : `u.companyName.toLowerCase()` → Fix 3 split/join aveugle ne vérifiait pas si le `reader` est une propriété d'un autre objet → dot-accessor check ajouté dans Fix 2 et Fix 3 (v3.9)
13. Suffixe d'identifiant plus long (Fix 1+2+3+4) : `preloaded.getValue()` splitté sur `loaded.` → `pre(typeof loaded...)` → `pre` est un identifiant cassé → ReferenceError runtime → word boundary check `(?<![\w$])` et `!/\w$/.test()` ajoutés dans Fix 1, 2, 3 et 4 (v4.0)

**ERREUR PRÉCÉDENTE** : le premier fix (`fix-pipelineRightContact.js`) appliquait 3 regex
séparées sur la même ligne → code malformé. Le nouveau script fait UNE seule passe par ligne.

### Erreur React #310 — "Rendered more hooks than during the previous render"
- **Cause 1 (résolue v16)** : un ReferenceError sur `pipelineRightContact` pendant le rendu fait crasher
  React en plein milieu de l'exécution des hooks → le nombre de hooks change entre les rendus
- **Fix 1** : corriger le ReferenceError avec les typeof wraps élimine la cause racine
- **Cause 2 (résolue v17)** : une IIFE inline avec hooks inside a conditionally-rendered tab.
  Pattern problématique : `{portalTab === "home" && (()=>{ /* outer */ return <div>{(()=>{ const [x]=useState(); ... })()}</div>; })()}`.
  Les hooks de l'IIFE interne sont attachés au **parent ClientPortal**, pas à une fibre isolée.
  Quand `portalTab !== "home"`, l'IIFE n'exécute pas → compteur de hooks du parent diminue.
  Quand on repasse sur "home", le compteur ré-augmente → React #310.
- **Fix 2** : wrapper l'IIFE dans `<HookIsolator>{()=>{...}}</HookIsolator>` (composant défini ligne 6 de App.jsx).
  Les hooks vivent maintenant sur le fiber de HookIsolator (mount/unmount propres avec le tab), pas sur ClientPortal.
- **Script** : `fix-nba-hooks-isolation.js` fait un scan balancé des accolades (en tenant compte
  des strings/templates/commentaires) pour trouver la bonne `})()}` qui ferme l'IIFE, puis remplace
  `{(()=>{` → `<HookIsolator>{()=>{` et `})()}` → `}}</HookIsolator>`.

### 16e classe de faux pattern : IIFE avec hooks dans tab conditionnel
**À surveiller** partout dans App.jsx : recherche `{(()=>{` suivi de `useState` ou `useEffect`.
Chaque occurrence à l'intérieur d'un `{condition && (...)}` est un crash potentiel #310.
Actuellement patchée : NBA IIFE (lignes ~4774). Si d'autres IIFEs avec hooks apparaissent
(ex: futurs widgets Aujourd'hui/CRM/Pipeline), les wrapper DIRECTEMENT dans HookIsolator
plutôt que d'attendre le crash en prod.

### À surveiller
- **SITE LIVE** depuis deploy v17 (2026-04-19). Tous les onglets fonctionnent.
- VPS rebooté + upgrade 8 Go RAM (activé après reboot TransIP panel) + swap 8 Go ajouté.
- **Ne JAMAIS builder avec `--minify=false`** sur ce VPS — ça consomme 3+ Go RAM et tue le serveur (OOM).
  Utiliser `--sourcemap=true` seul si besoin de debug (garde la minification, ajoute `.js.map` à côté).
- Si futures IIFEs avec hooks apparaissent dans l'app (pattern bug de classe 16), les wrapper
  directement dans HookIsolator. Grep automatique à faire avant chaque deploy :
  `grep -n '{(()=>{' App.jsx | head -10` puis vérifier qu'aucune ne contient `useState` ou `useEffect` à l'intérieur.

### Backend — bugs connus (non-bloquants, à traiter plus tard)
Trouvés dans les logs pm2 (2026-04-19). Aucun ne fait crash le process, juste des warnings réguliers :
- `[CRON RECYCLE LOST ERROR] no such column: ph.created_at` — la table `pipeline_history` utilise probablement `createdAt` (camelCase) et non `created_at`. À corriger dans le SQL du cron.
- `[SMART AUTO] Rule 1 error: no such column: updatedAt` — colonne manquante dans la table ciblée par la Rule 1.
- `[AI AGENT DB ERR] no such column: "$.overall"` — requête JSON mal formée. Le `$.overall` devrait être en quotes simples.
- `[DB] Fallback DB path used: /var/www/planora/server/calendar360.db — Set DB_PATH in .env for production` — DB_PATH pas défini dans .env, fallback utilisé à chaque restart.
- `[MEDIA STREAM] DB save error: FOREIGN KEY constraint failed` — enregistrement VoIP qui ne respecte pas une FK.
- `[EMAIL ERR] API Key is not enabled` — Resend/SendGrid key désactivée, emails non envoyés.

---

## 6. SCRIPTS DE DÉPLOIEMENT

### Locaux (Mac : `~/Desktop/PLANORA/v7-deploy/`)

| Script | Usage |
|--------|-------|
| `deploy-all.sh` | **Principal v17** — restore bak-20260417 + V7 patches + NBA HookIsolator + scope fix v5.0 + diagnostic + build + clean httpdocs + verify |
| `deploy-nba-fix.sh` | Fix ciblé — applique `fix-nba-hooks-isolation.js` + build sourcemap + deploy (utilisé pour corriger Aujourd'hui sans passer par deploy-all) |
| `deploy-sourcemap-build.sh` | Build sourcemap seul (pas de patches, juste rebuild + deploy avec .map pour debug browser) |
| `rollback-now.sh` | Urgence — restaure App.jsx.bak-20260417 + build + clean httpdocs |

### Ordre d'application des patches (CRITIQUE)
1. Restaurer `App.jsx.bak-20260417` (état propre)
2. `fix-selectedCrmContact.js` — fix scope selectedCrmContact
3. `p0-step1-v7base.js` — V7 states + handler + modal + CRM button + badges
4. `p0-step2-pipeline-btn.js` — bouton Transférer Pipeline Live (sans garde collabs)
5. `p0-fix-badge.js` — badge executor Pipeline Live
6. `p0-step4-suivi-tab.js` — onglet Suivi (sans garde collabs)
7. `fix-nba-hooks-isolation.js` — wrap NBA IIFE dans HookIsolator (fix React #310 Aujourd'hui)
8. `fix-all-scope-issues-v3.js` — scan et wrap typeof post-patches (v5.0 sans blocklist, smart detect only)
9. `diagnose-scope.js` — vérification finale
10. Build + clean httpdocs + copie

### Contraintes de déploiement
- **Pas de SSH depuis le sandbox Claude** (réseau bloqué)
- Terminal Mac = tier "click" (peut cliquer mais pas taper)
- L'utilisateur doit copier-coller les commandes dans son terminal
- **TOUJOURS inclure la copie vers httpdocs** après le build

---

## 7. RÈGLES DU PROJET (de MH)

1. **Pas de nouvelles tables/colonnes** sans auditer ce qui existe
2. **Réutiliser** la structure V7 déjà en prod au maximum
3. **Pas de backend from scratch** — patcher et compléter proprement
4. **Tester dans le contexte Julie** — c'est la collaboratrice de test principale
5. Fichiers de patch = scripts Node.js séparés, uploadés via SCP, exécutés avec `node`

---

## 8. ROADMAP — PROJETS FUTURS

### Projet 26 — V7 étendu : Transfert + Prise de RDV + Suivi complet
> Spec reçue 2026-04-19. En attente de démarrage (à traiter APRÈS V7 P0 stabilisé et autres priorités).
> Audit complet effectué par Claude — voir conclusions ci-dessous avant de démarrer.

#### Objectif business
Permettre à un collab A de transférer un contact à un collab B **avec prise de RDV directe** dans
l'agenda de B, visibilité pipeline temps réel, reporting post-RDV, notifications bidirectionnelles,
et agenda dual (RDV transférés non-bloquants côté envoyeur). **Fonctionnalité cœur business**,
pas juste un bouton.

#### Spec complète originale (MH, 2026-04-19)

**Flow attendu** : `Lead → qualification → transfert → sélection créneau → RDV créé →
pipeline mis à jour → suivi temps réel → reporting complet`

**1. Transfert avec prise de RDV directe** — Bouton `Transférer + RDV` depuis Pipeline Live ou
CRM. Modale en 4 étapes : sélection collab destinataire (filtrer ceux qui peuvent recevoir des
leads), affichage dispos temps réel de B (prenant en compte RDV existants + Google Calendar +
blackout + buffers), sélection créneau, confirmation `Transférer et programmer le RDV`.

**2. Création du RDV** — Backend crée booking pour collab B, sync Google Calendar, vérif
conflits, envoi SMS/email client. Pipeline : chez B le contact arrive en `RDV programmé`,
chez A en mode suivi.

**3. Visibilité pipeline temps réel** — Envoyeur voit contact avec badges `Chez [Nom B]` +
`RDV programmé` + `Suivi`. Changements de statut, déplacements pipeline, actions de B visibles.
Receveur voit contact dans pipeline actif avec badge `Source : [Nom A]`.

**4. Suivi temps réel** (CRITIQUE) — L'envoyeur ne doit jamais relancer pour savoir. Doit voir :
statut actuel, colonne actuelle, prochain RDV, historique actions, si appelé, si RDV
confirmé/annulé/no-show, si client signé.

**5. Reporting post-RDV** — Onglet Suivi fiche contact : executor actuel, source (envoyeur),
historique transferts, date RDV, résultat RDV, statut final (gagné/perdu/en cours). Dashboard
envoyeur `Mes leads transférés` : nombre envoyés, taux conversion, perf par collab, résultat
post-RDV.

**6. Logique agenda** — Chez receveur : RDV normal, bloque créneau, visible grille, badge
`RDV` + `Source : [Nom]`. **Chez envoyeur** : visible dans SON agenda mais **créneau NON
bloqué**, reste dispo pour lui. Affichage visuel différent (pastille contour, couleur distincte,
label `Envoyé à [Nom]`). Créer type `RDV envoyés`. Filtre agenda `[ ] Voir mes RDV envoyés`.

**7. Logique métier clé** — 1 seul executor actif, envoyeur reste source toujours visible,
synchronisation totale pipeline↔booking↔agenda↔suivi, aucune perte d'info (tout traçable),
UX claire (ne jamais confondre RDV personnel vs transféré).

**8. Notifications** — Receveur : nouveau RDV assigné, nouveau lead transféré. Envoyeur :
RDV confirmé, déplacé, annulé, résultat RDV, lead converti.

**9. Technique attendue** — Backend : endpoint transfert+booking combiné, récup dispos
collab, création booking, update pipeline, log transfert. Frontend : modale complète,
calendrier avec slots, affichage agenda double, badges pipeline, onglet suivi.

**Règle absolue (MH)** : ne PAS faire un simple `assignedTo`, ne PAS ignorer l'agenda, ne PAS
ignorer le suivi, ne PAS ignorer le reporting. C'est une fonctionnalité cœur business.

#### Audit de la spec — conclusions Claude (2026-04-19)

**Points forts** :
- Concept "RDV non-bloquant chez l'envoyeur" = vraie insight UX, beaucoup de CRM ratent ça
- Séparation source/executor déjà alignée avec schéma `contact_followers` existant
- Objectif "ne jamais relancer B" crée une boussole UX claire
- Liste des "ne pas" à la fin protège contre la version moisie

**Ambiguïtés à trancher AVANT de coder** (sinon rework) :
1. Ownership d'écriture après transfert : A peut éditer notes/tél/statut ou read-only ?
   → Reco Claude : **read-only + commenter** pour A, écriture = executor B seul
2. Annulation RDV par B : contact revient chez A ? Reste chez B sans RDV ?
3. Reprise de contrôle : A peut-il récupérer si B silent 48h ?
4. Chaîne multi-transferts A→B→C : qui reste "source" ? Reco : A ET B sources, C executor
5. SMS/email client au nom de qui ? Collab ou Cabinet ? (impact branding + templates)
6. Permissions : qui peut transférer à qui ? Matrice explicite nécessaire
7. Définition "temps réel" : SLA en secondes (1s SSE vs 10-30s polling) ?
   → Reco Claude : polling 10-30s pour démarrer, SSE si besoin ressort

**Risques techniques** :
- Race condition sur slots (A et C veulent le même créneau chez B) → transaction SQLite + UNIQUE
- Sync Google Calendar bidirectionnelle : propagation des changements GCal vers pipeline
- **Respect règle §0** : toutes les routes V7 doivent passer par tenantResolver, jamais
  `import { db }` direct (risque de réintroduire le bug supra corrigé 2026-04-19)
- Performance real-time : 10 collabs × 20 contacts = 200 états à polling → batch endpoint
  `/api/v7/subscriptions/poll` qui retourne les deltas, pas polling individuel
- Migration booking : réutiliser le flow existant (calendrier + Google Calendar), ne PAS dupliquer

**Gaps non traités dans la spec** (à ajouter avant dev) :
- Mode "retour du lead" si no-show/abandon
- Audit trail complet (qui a transféré quoi, quand, pourquoi — conservation X mois)
- KPI précis (taux conversion = quelle formule, quelle fenêtre temporelle)
- Collab qui quitte la boîte : que deviennent ses leads ?
- Throttling (limiter nb transferts/jour par collab ?)
- Undo dans les 5 min après transfert
- Mobile responsive (la modale slot picker est-elle utilisable au téléphone ?)

#### Découpage recommandé en 4 phases (vs big bang)

| Phase | Livrable | Durée estim. |
|-------|----------|--------------|
| **V7-P1** MVP transfer + RDV combiné | Bouton `Transférer + RDV`, modale slots, booking créé, source tracking, notification email basique | 2-3 jours |
| **V7-P2** Dual agenda view | RDV transférés visibles chez A avec style distinct non-bloquant, filtre `Voir mes RDV envoyés` | 2 jours |
| **V7-P3** Suivi temps réel + notifications | Onglet Suivi avec actions live de B, badge `Chez X` live, notifs in-app + email aux moments clés, polling 30s min viable | 3 jours |
| **V7-P4** Reporting + dashboard | Page `Mes leads transférés` avec conversion, perf par collab, résultats post-RDV | 2 jours |

**Total estim. : 9-10 jours-homme**. Chaque phase doit être shippable indépendamment.

#### Avant de démarrer le Projet 26

1. MH tranche les 7 ambiguïtés ci-dessus et écrit les réponses
2. Claude propose un "spec V7 v2" avec les ambiguïtés tranchées + tickets techniques par phase
3. Audit des routes qui importent `db` monolithe direct (hors V7) → liste à migrer au resolver
   en parallèle du dev V7 étendu, pour ne pas accumuler de dette
4. Vérifier si la sync Google Calendar actuelle (`[CRON GCAL SYNC]` logs) propage bien les
   changements externes vers `bookings`, sinon la gérer avant
5. Prévoir une nouvelle table `transfer_log` (audit trail) à créer dans monolithe + toutes les
   tenant DBs existantes (propagation idempotente selon règle §0)

---

## 9. HANDOFF / ÉTAT COURANT DE LA SESSION (2026-04-19)

> Cette section permet à toute nouvelle instance Claude (Cowork, Claude Code dans VS Code,
> Cursor, etc.) de reprendre le contexte sans repartir de zéro.

### Résumé de la session du 2026-04-19

**Réalisations consolidées** :
1. V7 P0 (transfert inter-collaborateur) rendu 100% fonctionnel en prod — tous les bugs
   identifiés et corrigés (cf. section 5 "BUGS CONNUS > Corrigés")
2. Règle §0 "1 client = 1 base de données dédiée" gravée comme principe architectural fondamental
3. 3 bugs critiques corrigés le même jour :
   - React #310 sur tab "Aujourd'hui" (IIFE hooks non isolés) — fix NBA HookIsolator
   - React #310 sur fiche contact CRM (même pattern IIFE) — fix Status History HookIsolator
   - V7 Transfer "Contact introuvable" en mode supra impersonation — fix fallback auth
4. Backup complet triple-redondance fait à 07:37 UTC (VPS + Mac + iCloud Drive),
   SHA-256 vérifié sur les 3 copies identique (`5a08fc52...4f3ec2`)
5. Spec "Projet 26" (V7 étendu avec prise de RDV + suivi temps réel + reporting) reçue,
   auditée et sauvegardée en section 8, avec découpage 4 phases pour plus tard

**Fichiers touchés aujourd'hui** :
- `/var/www/planora/server/db/database.js` — lignes 2339, 2374 : `createdAt` → `addedAt`
- `/var/www/planora/server/routes/transfer.js` — ligne 55-56 : fallback supra impersonation
- `/var/www/planora/app/src/App.jsx` — handler V7 : ajout `companyId` + `sourceCollabId` body
- Tenant DBs CapFinances + MonBilan : création table `contact_followers`

**Backups disponibles pour rollback** :
- `/var/backups/planora/planora-backup-20260419-073755.tar.gz` sur VPS (28 Mo, chmod 600)
- `~/Desktop/PLANORA/backups/planora-backup-20260419-073755.tar.gz` sur Mac MH
- `~/Library/Mobile Documents/com~apple~CloudDocs/PLANORA-backups/...` sur iCloud Drive

### Onboarding collaborateur data engineer (EN COURS)

Un data engineer rejoint le projet. État à la fin de la session :

- ✅ Briefing architecture complète donné (monolithe vs tenant, tenantResolver, data flows,
  tables par domaine, estimations de colonnes par table)
- ✅ Plan de simplification backend discuté (consolidation logs, archive, crédits — à faire
  seulement après assainissement)
- 🟡 **EN COURS** : installation VS Code + extension Claude Code for VS Code
- 🟡 **EN COURS** : décision VS Code vs Cursor (Cursor recommandé mais VS Code accepté)
- ⏳ À faire : génération clé SSH personnelle du data eng, ajout sur `/root/.ssh/authorized_keys`
  du VPS pour traçabilité
- ⏳ À faire : première exploration du code via Cursor/VS Code en local (option A, rsync
  depuis VPS) avant toute modif

### Points d'attention pour la prochaine session

**Dettes techniques à traiter en priorité (ordre recommandé)** :

1. **Audit `PRAGMA foreign_keys`** : vérifier si les FK sont enforcées sur toutes les connexions
   `better-sqlite3`. Si non, activer + compter les orphelins existants.
2. **Diff monolithe vs tenants** : identifier les 4-5 tables manquantes côté tenants
   (commande prête dans section 9).
3. **Audit routes `import { db }` direct** : lister toutes les routes qui contournent
   `tenantResolver`. Chaque occurrence = bug latent pour les clients en mode shadow/tenant.
4. **Setup git** : aucun repo git en place actuellement. Proposer un repo privé à MH
   (GitHub, GitLab...) avec `.gitignore` adapté (exclure node_modules, *.db, *.bak).
5. **Cleanup App.jsx.bak*** : il y a 18+ backups timestampés qui encombrent. Ne garder que
   les 3 derniers + la bak-20260417 (état propre V7).

**Projet 26 (V7 étendu)** : en attente. MH doit trancher les 7 ambiguïtés (ownership post-transfert,
annulation RDV, reprise de contrôle, chaîne multi-transferts, branding client, permissions,
SLA temps réel) avant de démarrer.

### Commandes utiles à garder sous la main

```bash
# Se connecter au VPS
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115

# Voir l'état du backend live
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "pm2 list && pm2 logs calendar360 --lines 20 --nostream --err | tail -20"

# Télécharger le code pour exploration locale (sans node_modules)
rsync -avz -e "ssh -i ~/.ssh/id_ed25519" --exclude='node_modules' --exclude='*.log' --exclude='*.db' --exclude='*.db-wal' root@136.144.204.115:/var/www/planora/ ~/Documents/planora-code/

# Diff schéma monolithe vs tenant (pour identifier les tables manquantes)
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "sqlite3 /var/www/planora-data/calendar360.db '.tables' | tr -s ' ' '\n' | sort -u > /tmp/mono.txt && sqlite3 /var/www/planora-data/tenants/c1776169036725.db '.tables' | tr -s ' ' '\n' | sort -u > /tmp/tenant.txt && comm -23 /tmp/mono.txt /tmp/tenant.txt"

# Compter les routes qui bypass le tenantResolver
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "grep -rn \"import { db } from '../db/database.js'\" /var/www/planora/server/routes/ | wc -l && grep -rln \"import { db } from '../db/database.js'\" /var/www/planora/server/routes/"

# Créer un backup à la demande (script prêt-à-l'emploi dans l'historique conversation)
# Le dernier backup complet est à 20260419-073755
```

### Comment reprendre la session dans un nouveau contexte Claude

Si une nouvelle instance Claude (Claude Code dans VS Code, Cursor, nouvelle session Cowork, etc.)
prend le relais, voici le contexte minimum à assimiler :

1. **Lire le présent `CLAUDE.md` en entier** (sections 0 à 9)
2. **Priorité §0** : toute route backend qui touche aux données business DOIT passer par
   `tenantResolver`, jamais `import { db }` direct
3. **État V7** : P0 fonctionnel en prod, P1-P4 (Projet 26) en attente de spec finale
4. **Prochaines actions** : soit continuer l'onboarding data eng, soit attaquer les
   dettes techniques listées plus haut, soit démarrer Projet 26 quand MH a tranché les
   ambiguïtés
5. **Contraintes** :
   - Pas de SSH depuis le sandbox Claude (réseau bloqué) → MH/data eng lancent les
     commandes SSH depuis leur Mac
   - Terminal Mac = tier "click" depuis Cowork (ne peut pas taper dans le terminal)
   - **TOUJOURS backup avant de modifier** un fichier sensible sur le VPS
   - **TOUJOURS copier le build dans httpdocs** après un `npm run build` sinon nginx
     sert l'ancienne version
