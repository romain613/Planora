# PLANORA / Calendar360 — Mémoire Projet

> Dernière mise à jour : **2026-04-20** — Phase E.3 clôturée, **Option A cristallisée** (mono = source unique, tenants archivés)
> Mainteneur : MH (rc.sitbon@gmail.com, supra admin)
> Collaborateur data eng : en cours d'onboarding (accès SSH à configurer, VS Code/Cursor en install)
>
> **⚠ Lecture obligatoire pour toute reprise** :
> - §0 = règle d'isolation par entreprise (**cible long terme**)
> - **§10 = état actuel stable** (Option A, 6 companies en `legacy`, tenants archivés)
> - Ne pas confondre **la cible** (§0) avec **le runtime actuel** (§10).

---

## 0. RÈGLE FONDAMENTALE — ISOLATION DB PAR ENTREPRISE (cible long terme)

> 🟢 **ÉTAT ACTUEL (2026-04-20) — Option A active** : toutes les 6 companies sont en
> `tenantMode='legacy'` dans Control Tower. Le monolithe `calendar360.db` est la **seule
> source de vérité runtime**. Les tenant DBs existantes ont été **archivées** (gel
> 2026-04-16, archivage E.3.6 — voir §10).
>
> **La règle ci-dessous reste la cible architecturale long terme** (Piste 3 — vrai
> multi-tenant), **mais elle n'est PAS le runtime actuel**. Pour implémenter / opérer
> aujourd'hui, suivre §10 (Option A cristallisée).

> **UN CLIENT = UNE BASE DE DONNÉES DÉDIÉE** (cible)
>
> Décision architecturale initiale MH (2026-04-19).
> Cible future réservée à la Piste 3 (vrai multi-tenant), **non démarrée à ce jour**.

### Règle absolue (cible — non appliquée en runtime actuel)
Chaque entreprise cliente doit (à terme) posséder **sa propre base de données SQLite
séparée**, stockée dans `/var/www/planora-data/tenants/<companyId>.db`.

### Périmètre historique (2 entreprises provisionnées puis archivées)
- **CapFinances** (`c1776169036725`) → `/var/backups/planora/tenants-frozen-archived-20260420-171003/c1776169036725.db` (archived E.3.6)
- **MonBilandeCompetences.fr** (`c-monbilan`) → `/var/backups/planora/tenants-frozen-archived-20260420-171003/c-monbilan.db` (archived E.3.6)

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

### Implications code (cible Piste 3 — **NE PAS APPLIQUER en Option A actuelle**)

> ⚠ Ces règles sont la **cible long terme**, pas le runtime actuel.
> **En Option A (§10), le chemin officiel court terme est `import { db } from '../db/database.js'`**.
> Toute nouvelle route V7 P1+ / V8 utilise le monolithe direct avec `WHERE companyId`.

- (Cible future) Aucune route backend ne doit importer `db` du monolithe directement pour des
  opérations sur les données business d'une entreprise. Toutes les routes qui touchent aux
  contacts, bookings, call_logs, etc. DOIVENT passer par le tenantResolver pour obtenir le
  bon handle DB.
- (Cible future) Le monolithe (`calendar360.db`) ne doit plus servir que pour :
  - Les anciennes entreprises non encore migrées (legacy)
  - Les tables globales partagées (ex : `supra_admins`)

### Pattern type à utiliser dans les routes backend (cible — **pas en Option A**)
```js
// ❌ CIBLE FUTURE MAUVAIS — importe le db monolithe, ignore le tenant
// ✅ OPTION A ACTUELLE = CHEMIN OFFICIEL — le monolithe EST la source de vérité
import { db } from '../db/database.js';
router.put('/endpoint', (req, res) => {
  const row = db.prepare('SELECT * FROM contacts WHERE id = ? AND companyId = ?').get(id, req.auth.companyId);
});

// ⚠ CIBLE FUTURE (Piste 3) — à ne PAS utiliser en Option A : renvoie 409 TENANT_MODE_NOT_ACTIVE
// import { withTenant } from '../helpers/withTenantDb.js';
// router.put('/endpoint', requireAuth, withTenant((req, res, db, tenant) => {
//   const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
// }));
```

### À auditer régulièrement (cible — réservé Piste 3 quand démarrée)

> 🟡 Ces audits sont à **reprendre lors du lancement de la Piste 3** (vrai multi-tenant).
> En Option A actuelle, ils sont **non applicables** (aucune company en mode `shadow` ou `tenant`).

- (Cible Piste 3) Les routes qui font `import { db } from '../db/database.js'` → potentiellement
  buggées pour les entreprises en mode shadow/tenant. En Option A, ce pattern est le chemin
  officiel — **pas d'audit à faire dessus**.
- (Cible Piste 3) Les tenant DBs (si recréées) devront avoir TOUTES les tables du monolithe,
  avec un script idempotent de propagation à chaque évolution schéma.
- (Historique E.1) Au moment du gel 2026-04-16, les 2 tenants avaient 89 tables vs 95 au
  monolithe — diff détaillé dans [db-migrations/phase-E1-cartographie-20260420/E1-synthese-MH.md](db-migrations/phase-E1-cartographie-20260420/E1-synthese-MH.md) §2.

---

## 0bis. RÈGLE FONDAMENTALE — ARCHITECTURE FRONTEND (branchement des symboles)

> **RÈGLE IMPÉRATIVE** — applicable à **toute nouvelle app, module, feature, option, composant**.
> Gravée le 2026-04-20 après le rewire complet post-Phase 14b.

### Principe

- **Local reste local** : un symbole utilisé **uniquement** dans un composant/scope ne doit **jamais** être transporté via context, props, ou mécanisme partagé. Il reste interne à son composant.
- **Partagé passe explicitement par le context** : dès qu'un symbole est utilisé dans **≥1 tab/sous-composant externe**, il DOIT transiter par un provider React dédié. Aucune référence implicite, aucun accès à un scope parent via closure lexicale.
- **Aucun symbole flottant** — chaque identifiant lu ou appelé dans un composant doit avoir une source de résolution **explicite** : import, destructure de context, prop, déclaration locale.
- **Aucun ancien chemin conservé** — lorsque l'architecture évolue (extraction, refacto), les anciennes références doivent être **entièrement supprimées**. Jamais de cohabitation ancien/nouveau.

### Procédure obligatoire pour un symbole partagé (helper, state, setter, ref, handler)

1. **Déclarer** le symbole au scope top-level du composant parent (pour CollabPortal = indent 2 espaces)
2. **Exposer** en shorthand dans le `<Provider value={{ ... }}>`
3. **Destructurer** dans chaque consommateur : `const { symboleX } = useProviderContext();`

### Procédure obligatoire pour un symbole local

- Le déclarer dans le composant qui l'utilise (pas au-dessus, pas ailleurs)
- Ne PAS l'exposer dans un provider
- Ne PAS le passer en prop si pas nécessaire

### Procédure obligatoire pour une nouvelle app / module / feature

1. **Créer le répertoire propre dès le départ** sous `app/src/features/<domaine>/<feature>/`
2. **Séparer clairement** :
   - `tabs/` — tabs/pages extraits
   - `context/` — provider React et hook associé
   - `components/` — sous-composants réutilisés
   - `helpers/` ou `utils/` — fonctions pures
3. **Brancher immédiatement** chaque symbole via context, pas en référence implicite
4. **Auditer avant merge** : scripts `ops/smoke/` doivent passer avec 0 orphelin

### Contrainte négative — jamais faire

- Référencer depuis un tab extrait un symbole du scope parent sans l'avoir routé via context → crash `ReferenceError` au render
- Laisser un symbole exposé dans le provider sans consommateur → code mort qui induit en erreur
- Laisser un symbole consommé sans déclaration claire → référence flottante, dette invisible
- Faire cohabiter deux chemins pour le même symbole (défensif `typeof X !== 'undefined' ? X : null` + destructure) → signal d'un branchement incomplet

### Audit automatique

- `ops/smoke/collab-smoke.mjs` — smoke V1 (scan HTTP page login + bundle)
- `ops/smoke/collab-tour.mjs` — tour V2 (login + visite chaque tab)
- `ops/smoke/collab-click.mjs` — tour V3 (login + clic safe par tab, fail-fast auth)

**Après toute extraction de code, refacto ou nouvelle feature, relancer l'audit statique PUIS le smoke runtime — exigence : 0 orphelin déclaré, 0 ReferenceError runtime, 0 free-reference dans le bundle minifié.**

### Historique des violations (pour mémoire)

- **Phase 14b (2026-04-20)** — extraction PhoneTab sans branchement complet : ~123 symboles orphelins, révélés par vagues (toggle*, handlers*, fmt*, etc.) pendant une journée d'itérations. Règle gravée pour empêcher répétition.

### Source de vérité in-code

- [`app/src/features/collab/context/CollabContext.jsx`](app/src/features/collab/context/CollabContext.jsx) — règle citée en tête du fichier, à reproduire en tête de chaque nouveau provider.

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
| **Base monolithe (SOURCE DE VÉRITÉ Option A)** | `/var/www/planora-data/calendar360.db` | SQLite WAL, **95 tables**. **Le backend lit/écrit ici exclusivement.** |
| **Control Tower** | `/var/www/planora-data/control_tower.db` | Registre des 6 companies (toutes `tenantMode='legacy'`), `tenant_status_history` (8 rows). |
| **Bases tenant** | `/var/www/planora-data/tenants/` | **Dossier VIDE** (préservé pour fallback `TENANTS_DIR`). DBs historiques archivées vers `/var/backups/planora/tenants-frozen-archived-20260420-171003/` (E.3.6). |
| **Fichiers upload** | `/var/www/planora-data/storage/<companyId>/` | Par entreprise |
| **Backend** | `/var/www/planora/server/` | Node.js Express — **aucun fichier `.db` dans ce dossier** (fantômes archivés E.3.7 vers `/var/backups/planora/fantom-db-20260420-165926/`) |
| **PM2 config** | `/var/www/planora/ecosystem.config.cjs` | Définit 4 env vars : `DB_PATH`, `CONTROL_TOWER_PATH`, `TENANTS_DIR`, `STORAGE_DIR` (E.3.8-E) |
| **Archives** | `/var/backups/planora/` | 6 `.tar.gz` (baseline + pre-step2/4/8E + fantômes + tenants) |

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

## 3. SYSTÈME DB HYBRIDE MULTI-TENANT — État après E.3 (Option A)

### 🟢 État runtime actuel (2026-04-20)

**Option A cristallisée** : le système hybride 3 tiers existe au niveau du **code et du
schéma**, mais **un seul tier est actif en production** :

| Tier | Rôle théorique | **Rôle effectif en Option A** |
|---|---|---|
| Tier 1 — Monolithe | Données legacy + tables globales | **Source de vérité unique pour toutes les données business** |
| Tier 2 — Control Tower | Registre routing tenant | Registre **informatif** : toutes les 6 companies en `tenantMode='legacy'` |
| Tier 3 — Bases tenant | DBs dédiées par entreprise | **Archivées** (2 DBs historiques dans `/var/backups/…tenants-frozen-archived-…/`) |

### Tier 1 — Monolithe `calendar360.db`
- Base unique avec toutes les données de toutes les entreprises
- Isolation par colonne `companyId` sur chaque table business
- **95 tables** (au 2026-04-20)
- **Source de vérité unique LIVE en production.** Toutes les 73 routes backend y lisent/écrivent.

### Tier 2 — Control Tower `control_tower.db`
- Registre central des companies
- 9 tables (dont 2 `sessions` et `supra_admins` en doublon inutile — cf. dettes Piste 2)
- **6 companies** enregistrées, **toutes en `tenantMode='legacy'`** (distribution après E.3.4)
- `tenant_databases` : 2 rows (CapFinances + MonBilan) qui pointent vers des DBs archivées
- `tenant_status_history` : 8 entries tracent chaque décision (pilot-migration 2 entries +
  E.3.2 backfill 4 entries + E.3.4 flip shadow→legacy 2 entries)

### Tier 3 — Bases tenant (archivées — Option A)
- **Plus aucune tenant DB active**
- CapFinances (`c1776169036725.db`, 1.6 Mo, 89 tables, 240 rows au gel)
  et MonBilan (`c-monbilan.db`, 3.5 Mo, 89 tables, 3847 rows au gel) sont **archivées** depuis
  2026-04-20 17:10 UTC vers `/var/backups/planora/tenants-frozen-archived-20260420-171003/`.
- Gelées depuis 2026-04-16 (aucune écriture depuis).
- SHA-256 bit-à-bit préservés (E.3.6 §3.2).

### Modes de routing (tenantResolver.js) — aperçu runtime actuel

| Mode | Nb companies actuelles | Comportement |
|------|---:|---|
| **legacy** | **6** (toutes) | Monolithe seul, `WHERE companyId` pour isoler |
| **shadow** | 0 | — |
| **tenant** | 0 | — |

`tenantResolver.resolveTenant(id)` fonctionne encore (utilisé par `routes/tenantAdmin.js`)
mais `getTenantDb(id)` lèverait `TENANT_MODE_NOT_ACTIVE` (409) pour toutes les companies
— comportement souhaité.

### Variables d'environnement DB (pm2 — E.3.8-E)

Définies dans `ecosystem.config.cjs`, **injectées dans le process au démarrage** :

| Var | Valeur |
|---|---|
| `DB_PATH` | `/var/www/planora-data/calendar360.db` (monolithe officiel) |
| `CONTROL_TOWER_PATH` | `/var/www/planora-data/control_tower.db` |
| `TENANTS_DIR` | `/var/www/planora-data/tenants` (dossier préservé vide) |
| `STORAGE_DIR` | `/var/www/planora-data/storage` |
| `NODE_ENV` | `production` |
| `PORT` | `3001` |

**Guard actif** dans `db/database.js` (E.3.8-E) : si `NODE_ENV=production` ET `DB_PATH` absent,
le backend **refuse de démarrer** (exception claire au lieu de fallback silencieux).

### Données en prod (après E.3)
- **Monolithe** : 248 contacts, 48 bookings, 232 call_logs, 847 tickets, 1509 audit_logs, 412 pipeline_history, 6 contact_followers (V7), 12 collaborateurs, 6 companies, …
- **6 companies** : voir §10 §10.5 (classification complète)
- Julie Desportes (CapFinances) = collaboratrice principale pour les tests V7

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

### Backend — bugs connus (historiques, partiellement résolus par E.3)
Trouvés dans les logs pm2 (2026-04-19). Aucun ne fait crash le process, juste des warnings réguliers :
- `[CRON RECYCLE LOST ERROR] no such column: ph.created_at` — la table `pipeline_history` utilise probablement `createdAt` (camelCase) et non `created_at`. À corriger dans le SQL du cron.
- `[SMART AUTO] Rule 1 error: no such column: updatedAt` — colonne manquante dans la table ciblée par la Rule 1.
- `[AI AGENT DB ERR] no such column: "$.overall"` — requête JSON mal formée. Le `$.overall` devrait être en quotes simples.
- ✅ `[DB] Fallback DB path used: …` — **RÉSOLU E.3.8-E** : `DB_PATH` défini dans `ecosystem.config.cjs` + guard `NODE_ENV=production` refuse le fallback.
- `[MEDIA STREAM] DB save error: FOREIGN KEY constraint failed` — enregistrement VoIP qui ne respecte pas une FK.
- `[EMAIL ERR] API Key is not enabled` — Resend/SendGrid key désactivée, emails non envoyés.

---

## 5bis. 🟡 DETTES APPLICATIVES RÉSIDUELLES (Piste 2 — non traitées)

> Ces items sont **identifiés**, **traçables** (preuves dans les rapports E.1/E.2/E.3),
> mais **NON traités** dans la phase E.3 clôturée. Ils forment le backlog de la **Piste 2**
> (à démarrer séparément). **Aucune action à entreprendre sans validation MH explicite.**

### 5bis.1 — 5 `audit_logs` écrits sans `companyId` (code bug)

Dans `mono.audit_logs`, 5 rows ont `companyId=''` alors qu'elles devraient avoir une company :

| entityType | action | count | Nature suspect |
|---|---|---:|---|
| `contact` | `contact_updated` | 3 | audit sans companyId (2026-04-19) |
| `contact` | `contact_deleted` | 1 | audit sans companyId (2026-03-26) |
| `collaborator` | `collaborator_created` | 1 | audit sans companyId (2026-04-17) |

**Cause probable** : le code applicatif appelant `logAudit(...)` omet `companyId` dans certaines
branches. À identifier via grep sur les call-sites (`db/database.js` + helpers/audit).
Échantillon 30 rows + distribution complète dans [db-migrations/phase-E3-correction-20260420/E3-step3-orphans-archive.json](db-migrations/phase-E3-correction-20260420/E3-step3-orphans-archive.json) `.audit_empty_companyId`.

### 5bis.2 — 2 bookings `companyId IS NULL` + `startTime='undefined'` (bug frontend)

`mono.bookings` : 2 rows orphelins, calendarId pointe vers [USER-ABANDONED-1] (u1774867731875, comp-first).
`startTime` est la **string JS `"undefined"`** au lieu d'une date → bug historique frontend.
Archive : `E3-step3-orphans-archive.json` `.bookings_null`.

### 5bis.3 — Warnings VOIP / MEDIA STREAM / GOOGLE SYNC (historiques)

- `[VOIP SECURITY] Twilio signature mismatch` (récurrent, contourné avec warning)
- `[MEDIA STREAM] DB save error: FOREIGN KEY constraint failed` (enregistrement VoIP)
- `[GOOGLE SYNC ERROR] EAI_AGAIN oauth2.googleapis.com` (DNS intermittent)
- `[EMAIL ERR] API Key is not enabled` (Resend/SendGrid)
- `[CRON RECYCLE LOST ERROR] no such column: ph.created_at`
- `[SMART AUTO] Rule 1 error: no such column: updatedAt`
- `[AI AGENT DB ERR] no such column: "$.overall"`

Chacun doit être traité séparément. **Aucun n'est bloquant en production actuelle.**

### 5bis.4 — Code mort (déclaré dormant en E.2.5)

Module multi-tenant écrit mais non branché en Option A :
- `services/shadowCompare.js` — 0 consommateur, classé **conservé dormant** ou **archivé attic** selon décision Piste 3
- `helpers/withTenantDb.js` — wrapper prêt, 0 consommateur runtime
- `db/test/testShadowCompare.mjs`, `testMultitenantPhase1.mjs`, `testTenantMigration.mjs` — 3 scripts de tests qui passent mais testent du code dormant

Détail complet dans [db-migrations/phase-E2-plan-correction-20260420/E2-dettes-backend.md](db-migrations/phase-E2-plan-correction-20260420/E2-dettes-backend.md) (33 dettes classifiées).

### 5bis.5 — Tables CT en doublon inutile

- `control_tower.db`.sessions (0 row — mono.sessions est la source réelle, 78 rows)
- `control_tower.db`.supra_admins (0 row — mono.supra_admins est la source réelle, 1 row)

**Suggéré E.2.5 D12/D13** : `DROP TABLE` dans CT schema (sous-step à traiter Piste 2).

### 5bis.6 — CLAUDE.md incohérence historique

Le pattern `getDbForCompany` cité dans §0 (pattern-type "✅ BON") **n'existe pas dans le code**.
Le bon nom est `getTenantDb` (dans `tenantResolver.js`) ou `withTenant` / `runWithTenant` (dans
`helpers/withTenantDb.js`). Cible à corriger si Piste 3 démarrée.

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

## 9. HANDOFF / ÉTAT COURANT DE LA SESSION (2026-04-19 + mise à jour 2026-04-20)

> Cette section permet à toute nouvelle instance Claude (Cowork, Claude Code dans VS Code,
> Cursor, etc.) de reprendre le contexte sans repartir de zéro.
>
> **⚠ Depuis la rédaction initiale (2026-04-19), la phase E.3 a été exécutée (2026-04-20) :
> 8 steps, Option A cristallisée. État final à lire en §10.**
> Les "Points d'attention pour la prochaine session" ci-dessous sont partiellement résolus :
> - Audit diff monolithe vs tenants : ✅ fait en E.1
> - Audit routes `import { db }` direct : ✅ fait en E.1 (73/85 fichiers identifiés, **c'est
>   désormais le chemin officiel en Option A** — plus à migrer)
> - `PRAGMA foreign_keys` : ✅ actif sur les 4 DBs (0 violation), voir §10
> - Setup git : ⏸ repo `romain613/Planora` **public** sur GitHub — livrables E.1/E.2/E.3
>   **restent hors repo** (PII clients). Décision pistes 1/2/3 en suspens.
> - Cleanup App.jsx.bak : non traité, pas urgent.

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

---

## 10. 🟢 OPTION A — ÉTAT CRISTALLISÉ (2026-04-20 17:10 UTC, Phase E.3 clôturée)

> **Source de vérité unique pour toute reprise / nouvelle session. Lire en priorité.**
> Cette section décrit **l'état runtime actuel** (pas la cible future §0).

### 10.1 Principe Option A en une phrase

> **Le monolithe `calendar360.db` est la seule source de vérité active. Toutes les 6 companies
> sont en `tenantMode='legacy'` dans Control Tower. Aucun `shadow`, aucun `tenant` actif.
> Les tenant DBs historiques sont archivées (dossier source vide mais préservé).**

### 10.2 Chemin DB officiel — verrouillé à 2 niveaux

**Runtime** (E.3.8-E) :
- `db/database.js` contient un guard : `if (!process.env.DB_PATH && process.env.NODE_ENV === 'production') throw new Error(...)`
- pm2 `ecosystem.config.cjs` injecte `DB_PATH=/var/www/planora-data/calendar360.db` + 3 autres vars
- Démarrage sans DB_PATH en prod → exception claire (pas de fallback silencieux)
- Healthcheck `GET /api/health` → `dbPath: "/var/www/planora-data/calendar360.db"`

**Filesystem** (E.3.7 + E.3.6) :
- `/var/www/planora/server/` : **0 fichier `.db*`** (fantômes archivés vers `/var/backups/planora/fantom-db-20260420-165926/`)
- `/var/www/planora-data/tenants/` : **dossier vide préservé** (tenant DBs archivées vers `/var/backups/planora/tenants-frozen-archived-20260420-171003/`)

### 10.3 Règles backend/data IMPÉRATIVES (court terme Option A)

Pour toute nouvelle route métier / feature V7 P1+ / V8 / Projet 26 / etc. :

✅ **À FAIRE** :
1. `import { db } from '../db/database.js'`
2. Ajouter `WHERE companyId = ?` sur chaque requête touchant des données business
3. Pour les actions supra (impersonation), fallback `req.auth.companyId || req.auth._activeCompanyId || req.body.companyId` (cf. V7 transfer §4)
4. Loguer tout audit via `audit_logs` avec le `companyId` bien renseigné (cf. dette 5bis.1)

❌ **À NE PAS FAIRE** :
1. Appeler `resolveTenant` depuis une route métier (seul `routes/tenantAdmin.js` a le droit)
2. Importer `withTenant` / `runWithTenant` dans une route
3. Importer/appeler `shadowCompare`
4. Écrire dans une tenant DB (elles sont archivées)
5. Créer de nouvelles tenant DBs pour une company
6. Ajouter une row dans `ct.companies` en `tenantMode='shadow'` ou `'tenant'`
7. Ouvrir une DB via un path autre que `/var/www/planora-data/calendar360.db`

### 10.4 État mesurable du runtime

Après E.3 clôturée (dernière mesure 2026-04-20 17:10 UTC) :

| Indicateur | Valeur | Source |
|---|---|---|
| PM2 process | PID 70664, online, uptime continu depuis 16:50 UTC | `pm2 list` |
| Guard DB_PATH | actif | `db/database.js` L10-13 |
| 4 env vars | injectées | `/proc/70664/environ` |
| DB fichier ouvert | `/var/www/planora-data/calendar360.db` (+WAL+SHM) | `lsof -p 70664` |
| Healthcheck | `{"status":"ok","db":"connected","companies":6,"collaborateurs":12}` | `GET /api/health` |
| FK violations | 0 sur les 4 DBs | `PRAGMA foreign_key_check` |
| Integrity check | ok sur les 4 DBs | `PRAGMA integrity_check` |
| Fantômes runtime | aucun | `lsof` + `find /var/www/planora/server -name "*.db*"` |
| Tenant DBs actives | aucune | `/var/www/planora-data/tenants/` vide |

### 10.5 Classification finale des 10 companyId (post-E.3)

| # | companyId | Nom | Classe | Dans CT ? | Status | Commentaire |
|---|---|---|---|:---:|---|---|
| 1 | `c1776169036725` | CAPFINANCES | active-migrated | ✅ legacy | active | V7 transfer testé fonctionnel |
| 2 | `c-monbilan` | MonBilandeCompetences.fr | active-migrated | ✅ legacy | active | |
| 3 | `c1775722958849` | GENETICAT | active-legacy | ✅ legacy | active | 185 contacts actifs |
| 4 | `comp-first` | Competences First | dormant-real | ✅ legacy | active | |
| 5 | `c1774809632450` | Creatland | dormant-real | ✅ legacy | active | |
| 6 | `c1` | Calendar360 | internal-test | ✅ legacy | **archived** | Compte test interne, plan='internal' |
| 7 | `c1774825229294` | ([USER-ABANDONED-1] signup) | signup-abandoned | ❌ | archivé | 6 audit_logs seulement |
| 8 | `c1774898326318` | (CAW / [USER-ABANDONED-2]) | signup-abandoned | ❌ | archivé | 11 audit_logs seulement |
| 9 | `c1775049199206` | ([ORG-ABANDONED-2] probe) | security-probe-log | ❌ | archivé | Tentative switch company bloquée |
| 10 | `c1775050406399` | ([ORG-ABANDONED-1] probe) | security-probe-log | ❌ | archivé | Idem |

Plus 2 cas spéciaux :
- `""` (253 audit_logs) : 98 % légitimes (login_failed, supra_login, company_switch), 5 bugs à traiter Piste 2
- `NULL` (2 bookings) : rows malformées historiques, à documenter Piste 2

### 10.6 Archives disponibles pour rollback

Toutes dans `/var/backups/planora/` :

| Archive | Date | Rôle |
|---|---|---|
| `phaseE3-baseline-20260420-125532.tar.gz` | 2026-04-20 12:55 | État avant toute modif E.3 |
| `phaseE3-pre-step2-20260420-130056.tar.gz` | 2026-04-20 13:00 | Avant INSERT CT |
| `phaseE3-pre-step4-20260420-131022.tar.gz` | 2026-04-20 13:10 | Avant flip shadow→legacy |
| `phaseE3-pre-step8E-20260420-164918.tar.gz` | 2026-04-20 16:49 | Avant guard + env vars |
| `fantom-db-20260420-165926.tar.gz` | 2026-04-20 16:59 | 6 DBs fantômes archivées |
| `tenants-frozen-archived-20260420-171003.tar.gz` | 2026-04-20 17:10 | 2 tenants DBs |

### 10.7 Audit trail (Control Tower `tenant_status_history`)

8 entries tracent chaque décision data :

| id | companyId | previousMode | newMode | actor | reason |
|---:|---|---|---|---|---|
| 1-2 | c1776169036725, c-monbilan | legacy | legacy | script | pilot-migration-commit (2026-04-16, initial) |
| 3-6 | c1775722958849, comp-first, c1774809632450, c1 | NULL | legacy | MH | E3-step2 backfill-to-CT |
| 7-8 | c1776169036725, c-monbilan | shadow | legacy | MH | E3-step4 flip shadow→legacy |

### 10.8 Livrables E.1 + E.2 + E.3 (tous hors repo public)

Index complet : [db-migrations/phase-E3-correction-20260420/E3-CLOSURE-MH.md](db-migrations/phase-E3-correction-20260420/E3-CLOSURE-MH.md)

- **E.1 cartographie** (6 fichiers) : [db-migrations/phase-E1-cartographie-20260420/](db-migrations/phase-E1-cartographie-20260420/)
- **E.2 plan correction** (7 MD + 2 JSON) : [db-migrations/phase-E2-plan-correction-20260420/](db-migrations/phase-E2-plan-correction-20260420/)
- **E.3 exécution** (14 fichiers) : [db-migrations/phase-E3-correction-20260420/](db-migrations/phase-E3-correction-20260420/)

### 10.9 🔵 Vision Piste 3 — Vrai multi-tenant (non lancée)

La règle §0 (1 client = 1 DB dédiée) est la cible long terme. Pour y aller :
1. Déclencheur : décision business (ex: 1er client qui exige SLA data isolation, ou 50+ companies)
2. Restaurer les tenant DBs archivées (étape inverse de E.3.6)
3. Brancher `resolveTenant` dans les routes métier (refacto des 73 fichiers)
4. Réhydratation data mono → tenant par company (migration one-shot)
5. Flip `tenantMode='legacy' → 'tenant'` par company après validation data
6. Tests + observation shadow diff

**Effort** : plusieurs semaines. **Ne pas lancer sans spec MH dédiée.**

### 10.10 Comment reprendre dans une nouvelle session

1. **Lire CLAUDE.md §10 EN PRIORITÉ** (cette section — état runtime)
2. Lire §0 + §0bis pour comprendre les règles architecturales
3. Lire §5 + §5bis pour comprendre les bugs connus et dettes
4. Lire `HANDOFF-2026-04-19.md §13` pour la chronologie E.3
5. Lire `db-migrations/phase-E3-correction-20260420/E3-CLOSURE-MH.md` pour le détail exhaustif
6. **Avant toute modification** : vérifier que l'action respecte les règles §10.3 (impératives)
7. **Séparer les 3 pistes** : ne pas mélanger Option A actuelle / dettes Piste 2 / vision Piste 3
